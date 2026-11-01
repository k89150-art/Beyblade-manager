// D-018 main page (collection) save protection.
//
// The main page keeps its working copy in the DOM and used to write all four
// collection tables with a plain merge. This module decides, per table, what a
// save may write:
// - only tables that differ from what the page last loaded are written;
// - inside a transaction the latest server copy is compared with the version
//   the page built on ("base"); a table is written only when the cloud still
//   holds that base;
// - a table that already holds exactly the intended rows counts as done
//   (for example a retry after a lost acknowledgement);
// - anything else is a conflict and nothing at all is written.
// tournamentRecords and every other field are never part of a write.
// updatedAt is only a display/ordering value and never decides a conflict.

export const COLLECTION_TABLES = Object.freeze(["beybladeTable", "partTable", "configTable", "historyTable"]);

export const COLLECTION_TABLE_LABELS = Object.freeze({
  beybladeTable: "我的陀螺收藏",
  partTable: "額外零件庫存",
  configTable: "配置紀錄",
  historyTable: "歷史測試紀錄"
});

export const COLLECTION_SYNC_STATES = Object.freeze({
  CLEAN: "clean",
  SAVING: "saving",
  PENDING_NETWORK: "pending-network",
  PENDING_UNKNOWN: "pending-unknown",
  CONFLICT: "conflict"
});

export const COLLECTION_SYNC_CODES = Object.freeze({
  CONFLICT: "collection-conflict",
  DOCUMENT_REMOVED: "collection-document-removed",
  SESSION_CHANGED: "collection-session-changed",
  UNKNOWN_OUTCOME: "collection-unknown-outcome",
  NETWORK: "collection-network",
  PERMISSION: "collection-permission"
});

export const COLLECTION_APPLIED = Object.freeze({
  WRITTEN: "written",
  STATE_MATCH: "state-match"
});

const CODES = COLLECTION_SYNC_CODES;
const STATES = COLLECTION_SYNC_STATES;

export class CollectionSyncError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "CollectionSyncError";
    this.code = code;
    this.tables = Object.freeze([...(details.tables || [])]);
    this.latestData = details.latestData ?? null;
    this.latestExists = Boolean(details.latestExists);
  }
}

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeForFingerprint(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normalizeForFingerprint);
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = normalizeForFingerprint(value[key]);
    return result;
  }, {});
}

export function fingerprintTable(rows) {
  return JSON.stringify(normalizeForFingerprint(Array.isArray(rows) ? rows : []));
}

// A missing or malformed table reads as an empty table.
export function pickCollectionTables(data) {
  const tables = {};
  COLLECTION_TABLES.forEach(table => {
    const rows = data && typeof data === "object" ? data[table] : undefined;
    tables[table] = Array.isArray(rows) ? clonePlain(rows) : [];
  });
  return tables;
}

export function fingerprintCollectionTables(tables) {
  return COLLECTION_TABLES.map(table => fingerprintTable(tables?.[table])).join("\u0000");
}

// Tables whose local rows differ from the rows the page was built from, plus
// tables the page itself changed while loading (catalog upgrades, D-015).
export function findChangedTables(localTables, domBaseTables, forcedTables = []) {
  const forced = new Set(forcedTables);
  return COLLECTION_TABLES.filter(table => forced.has(table) ||
    fingerprintTable(localTables?.[table]) !== fingerprintTable(domBaseTables?.[table]));
}

// Pure decision for one transaction attempt.
// acceptedBases[table] lists fingerprints the cloud may hold for this save to
// go ahead: the loaded version, plus rows this page sent earlier whose result
// was never confirmed.
// matchEvidence[table] lists fingerprints this page has evidence of having
// produced itself (F-01): rows sent in a commit whose result is unknown, or
// the rows of an automatic catalog upgrade. Only with such evidence does
// "the cloud already holds exactly these rows" count as this save being done.
// The same rows without evidence may come from another device's own edit
// (two identical additions), so they are a conflict, never a silent success.
export function planCollectionCommit({ latestExists, latestData, baseExists, acceptedBases, matchEvidence = {}, localTables, changedTables }) {
  const changed = COLLECTION_TABLES.filter(table => changedTables.includes(table));
  if (!changed.length) {
    return { kind: "already", writeTables: [], alreadyTables: [], conflictTables: [], create: false };
  }

  if (!latestExists) {
    if (baseExists) {
      return { kind: "removed", writeTables: [], alreadyTables: [], conflictTables: [...changed], create: false };
    }
    // First save for this account. The empty read is the commit's
    // precondition, so a document created meanwhile makes the commit fail.
    return { kind: "write", writeTables: [...COLLECTION_TABLES], alreadyTables: [], conflictTables: [], create: true };
  }

  const latest = pickCollectionTables(latestData);
  const writeTables = [];
  const alreadyTables = [];
  const conflictTables = [];
  changed.forEach(table => {
    const latestPrint = fingerprintTable(latest[table]);
    const localPrint = fingerprintTable(localTables[table]);
    if (latestPrint === localPrint && (matchEvidence[table] || []).includes(localPrint)) {
      alreadyTables.push(table);
    } else if ((acceptedBases[table] || []).includes(latestPrint)) {
      writeTables.push(table);
    } else {
      conflictTables.push(table);
    }
  });

  if (conflictTables.length) return { kind: "conflict", writeTables: [], alreadyTables, conflictTables, create: false };
  if (!writeTables.length) return { kind: "already", writeTables, alreadyTables, conflictTables, create: false };
  return { kind: "write", writeTables, alreadyTables, conflictTables, create: false };
}

// Firebase Web SDK 11.2.0 retries these codes itself; with maxAttempts: 1 the
// page does the retrying so it can see every commit error (same as D-017).
const RETRYABLE_CODES = new Set([
  "aborted", "failed-precondition", "already-exists",
  "cancelled", "unknown", "deadline-exceeded", "resource-exhausted", "internal", "unavailable", "unauthenticated"
]);
// Commit errors that do not prove the write was rejected.
const COMMIT_UNCLEAR_CODES = new Set(["cancelled", "unknown", "deadline-exceeded", "internal", "unavailable", ""]);
export const COLLECTION_RETRY_DELAYS_MS = Object.freeze([300, 600, 1200, 2400]);

function firebaseCode(error) {
  if (!error || error.name !== "FirebaseError") return "";
  return String(error.code || "").replace(/^firestore\//, "");
}

// input: { localTables, changedTables, acceptedBases, matchEvidence, baseExists } captured once
// per save; identity: { ownerUid, ownerEmail }; minUpdatedAt keeps the
// value moving forward on this device.
// runTransaction(updateFunction) must run exactly one transaction attempt and
// give updateFunction an adapter with get(), update(fields), create(fields).
export function startCollectionTransaction({
  input,
  identity,
  minUpdatedAt = 0,
  runTransaction: runSingleAttempt,
  canContinue,
  maxAttempts = 5,
  retryDelaysMs = COLLECTION_RETRY_DELAYS_MS,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  const progress = { attempts: 0, uncertainCommit: false, commitInFlight: false };
  // Tables this run itself sent in a commit whose result is unknown: a later
  // attempt of the same run may recognise exactly these rows as its own.
  const runEvidence = new Set();

  function evidenceForAttempt() {
    const evidence = {};
    COLLECTION_TABLES.forEach(table => {
      const prints = [...((input.matchEvidence && input.matchEvidence[table]) || [])];
      if (runEvidence.has(table)) prints.push(fingerprintTable(input.localTables[table]));
      evidence[table] = prints;
    });
    return evidence;
  }

  async function runOnce() {
    let staged = false;
    let stagedTables = [];
    try {
      const value = await runSingleAttempt(async transaction => {
        if (!canContinue()) throw new CollectionSyncError(CODES.SESSION_CHANGED);
        const snapshot = await transaction.get();
        if (!canContinue()) throw new CollectionSyncError(CODES.SESSION_CHANGED);

        const latestExists = Boolean(snapshot && snapshot.exists);
        const latestData = latestExists ? (snapshot.data || {}) : null;
        const plan = planCollectionCommit({
          latestExists,
          latestData,
          baseExists: input.baseExists,
          acceptedBases: input.acceptedBases,
          matchEvidence: evidenceForAttempt(),
          localTables: input.localTables,
          changedTables: input.changedTables
        });

        if (plan.kind === "conflict") {
          throw new CollectionSyncError(CODES.CONFLICT, { tables: plan.conflictTables, latestData, latestExists });
        }
        if (plan.kind === "removed") {
          throw new CollectionSyncError(CODES.DOCUMENT_REMOVED, { tables: plan.conflictTables, latestData: null, latestExists: false });
        }
        if (plan.kind === "already") {
          return {
            applied: COLLECTION_APPLIED.STATE_MATCH,
            writtenTables: [],
            alreadyTables: plan.alreadyTables,
            latestData,
            updatedAt: null
          };
        }

        const updatedAt = Math.max(Number(minUpdatedAt) || 0, (Number(latestData?.updatedAt) || 0) + 1);
        const fields = { ownerUid: identity.ownerUid, ownerEmail: identity.ownerEmail || "", updatedAt };
        plan.writeTables.forEach(table => {
          fields[table] = clonePlain(input.localTables[table]);
        });
        if (plan.create) transaction.create(fields);
        else transaction.update(fields);
        staged = true;
        stagedTables = plan.writeTables;
        progress.commitInFlight = true;
        return {
          applied: COLLECTION_APPLIED.WRITTEN,
          writtenTables: plan.writeTables,
          alreadyTables: plan.alreadyTables,
          latestData: { ...(latestData || {}), ...fields },
          updatedAt
        };
      });
      return { value };
    } catch (error) {
      return { error, staged, stagedTables };
    } finally {
      progress.commitInFlight = false;
    }
  }

  const promise = (async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (attempt > 1) {
        await wait(retryDelaysMs[Math.min(attempt - 2, retryDelaysMs.length - 1)] || 0);
      }
      if (!canContinue()) throw new CollectionSyncError(CODES.SESSION_CHANGED);
      progress.attempts += 1;

      const outcome = await runOnce();
      if (!outcome.error) return outcome.value;

      const { error, staged, stagedTables } = outcome;
      if (error instanceof CollectionSyncError) throw error;

      const code = firebaseCode(error);
      if (staged && COMMIT_UNCLEAR_CODES.has(code)) {
        progress.uncertainCommit = true;
        stagedTables.forEach(table => runEvidence.add(table));
      }
      if (!RETRYABLE_CODES.has(code)) throw error;
      lastError = error;
    }
    throw lastError;
  })();

  return { promise, progress };
}

export function classifyCollectionSaveFailure(error, progress = {}) {
  if (error?.code === CODES.SESSION_CHANGED) return CODES.SESSION_CHANGED;
  if (error instanceof CollectionSyncError) return error.code;
  if (progress.uncertainCommit) return CODES.UNKNOWN_OUTCOME;
  const code = firebaseCode(error) || String(error?.code || "").replace(/^firestore\//, "");
  if (code === "permission-denied" || code === "unauthenticated") return CODES.PERMISSION;
  return CODES.NETWORK;
}

export function isCollectionCommitUnresolved(progress = {}) {
  return Boolean(progress.uncertainCommit || progress.commitInFlight);
}

// Resolves with { kind: "settled" | "failed" | "timeout" } and never rejects.
export function waitForCollectionTransaction(handle, { timeoutMs, setTimer = setTimeout, clearTimer = clearTimeout }) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimer(() => {
      if (done) return;
      done = true;
      resolve({ kind: "timeout" });
    }, timeoutMs);
    handle.promise.then(value => {
      if (done) return;
      done = true;
      clearTimer(timer);
      resolve({ kind: "settled", value });
    }, error => {
      if (done) return;
      done = true;
      clearTimer(timer);
      resolve({ kind: "failed", error });
    });
  });
}

// What the page knows about the cloud copy it is built on, per account and
// target. Kept across a reload of the same account so unsaved rows survive.
export function createCollectionSyncTracker() {
  let sessionKey = "";
  let serverBase = null;   // raw cloud rows the page is built on
  let domBase = null;      // the same rows as the page collects them
  let baseExists = false;
  let accepted = {};       // table -> Set of acceptable cloud fingerprints
  let staleEcho = {};      // table -> Set of cloud versions this page's own commit replaced
  let uncertain = {};      // table -> Set of rows sent in commits whose result is unknown (F-01 evidence)
  const forcedPrints = {}; // table -> rows produced by an automatic catalog upgrade (F-01 evidence)
  const forced = new Set();
  let state = STATES.CLEAN;
  let conflict = null;     // { tables, latestData, latestExists, mayHaveSaved }
  let lastFailure = null;
  let epoch = 0;           // changes whenever the tracked state is thrown away

  function resetState() {
    epoch += 1;
    serverBase = null;
    domBase = null;
    baseExists = false;
    accepted = {};
    staleEcho = {};
    uncertain = {};
    forced.clear();
    Object.keys(forcedPrints).forEach(table => { delete forcedPrints[table]; });
    state = STATES.CLEAN;
    conflict = null;
    lastFailure = null;
  }

  // Forgets everything, including the account (the tables were cleared).
  function reset() {
    sessionKey = "";
    resetState();
  }

  // Returns true when the account or target changed and everything was reset.
  function bindSession(ownerUid, targetUid) {
    const key = `${ownerUid || ""}|${targetUid || ""}`;
    if (key === sessionKey) return false;
    resetState();
    sessionKey = key;
    return true;
  }

  function hasBase() {
    return serverBase !== null;
  }

  // keepEcho: the copy came from a direct server read, not from the listener.
  // A later listener snapshot may still be older than this page's save, so
  // the echo guard stays until the listener itself shows the saved rows.
  function adoptRemote({ exists, remoteTables, domTables, tables = COLLECTION_TABLES, keepEcho = false }) {
    if (!serverBase) {
      serverBase = pickCollectionTables(null);
      domBase = pickCollectionTables(null);
    }
    baseExists = Boolean(exists);
    tables.forEach(table => {
      serverBase[table] = clonePlain(remoteTables[table] || []);
      domBase[table] = clonePlain(domTables[table] || []);
      accepted[table] = new Set([fingerprintTable(serverBase[table])]);
      if (!keepEcho) delete staleEcho[table];
      delete uncertain[table];
      forced.delete(table);
      delete forcedPrints[table];
    });
  }

  // A cloud copy whose rows equal what the page is built on: only the
  // document's existence and the echo bookkeeping move forward.
  function noteRemoteSeen({ exists, tables = [], keepEcho = false }) {
    if (!serverBase) return;
    baseExists = Boolean(exists);
    if (keepEcho) return;
    tables.forEach(table => {
      delete staleEcho[table];
    });
  }

  // rows: what the upgrade produced on screen. Only exactly these rows count
  // as evidence; a later user edit to the table is not covered.
  function forceTable(table, rows) {
    if (!COLLECTION_TABLES.includes(table)) return;
    forced.add(table);
    if (rows) forcedPrints[table] = fingerprintTable(rows);
  }

  function getDirtyTables(localTables) {
    if (!domBase) return [];
    return findChangedTables(localTables, domBase, [...forced]);
  }

  function captureSaveInput(localTables) {
    const acceptedBases = {};
    const matchEvidence = {};
    COLLECTION_TABLES.forEach(table => {
      acceptedBases[table] = [...(accepted[table] || [fingerprintTable(serverBase?.[table])])];
      matchEvidence[table] = [...(uncertain[table] || [])];
      if (forced.has(table) && forcedPrints[table]) matchEvidence[table].push(forcedPrints[table]);
    });
    return Object.freeze({
      localTables: pickCollectionTables(localTables),
      changedTables: getDirtyTables(localTables),
      acceptedBases,
      matchEvidence,
      baseExists
    });
  }

  // A commit carrying these rows may have reached the cloud. A later save may
  // then build on them without calling it a conflict.
  // Evidence lives in this tracker only, so it is bound to one account and
  // target and is dropped on any reset, and per table to the exact rows sent.
  // It is consumed by the next confirmed commit or adopted cloud copy.
  function noteUncertain(input) {
    input.changedTables.forEach(table => {
      const print = fingerprintTable(input.localTables[table]);
      if (!accepted[table]) accepted[table] = new Set();
      accepted[table].add(print);
      if (!uncertain[table]) uncertain[table] = new Set();
      uncertain[table].add(print);
    });
  }

  function confirmCommit(input, result) {
    baseExists = true;
    [...result.writtenTables, ...result.alreadyTables].forEach(table => {
      const next = clonePlain(input.localTables[table]);
      const nextPrint = fingerprintTable(next);
      // Every version this save built on is now older than the cloud; a late
      // snapshot still carrying one of them must not undo this save on screen.
      const replaced = new Set([...(staleEcho[table] || []), ...(accepted[table] || []), fingerprintTable(serverBase?.[table])]);
      replaced.delete(nextPrint);
      if (replaced.size) staleEcho[table] = replaced;
      else delete staleEcho[table];
      serverBase[table] = next;
      domBase[table] = clonePlain(next);
      accepted[table] = new Set([fingerprintTable(next)]);
      delete uncertain[table];
      forced.delete(table);
      delete forcedPrints[table];
    });
  }

  // Lets the user keep their rows over a newer cloud version (explicit choice).
  function acceptCloudAsBase(tables, latestData, latestExists = true) {
    if (!latestExists) {
      // The document was removed elsewhere: the next save creates it again.
      baseExists = false;
      return;
    }
    const latest = pickCollectionTables(latestData);
    tables.forEach(table => {
      if (!accepted[table]) accepted[table] = new Set();
      accepted[table].add(fingerprintTable(latest[table]));
      delete staleEcho[table];
    });
  }

  // Which tables of an incoming cloud copy may replace what is on screen.
  // Tables with unsaved rows are kept (unless listed in discardTables), and a
  // late echo of the version this page itself replaced is ignored.
  function planRemote(remoteTables, localTables, { discardTables = [] } = {}) {
    if (!serverBase) {
      return { adoptTables: [...COLLECTION_TABLES], keepTables: [], changedTables: [...COLLECTION_TABLES], suspectTables: [], needsRebuild: true };
    }
    const dirty = new Set(getDirtyTables(localTables));
    discardTables.forEach(table => dirty.delete(table));
    const adoptTables = [];
    const keepTables = [];
    const changedTables = [];
    const suspectTables = [];
    COLLECTION_TABLES.forEach(table => {
      const remotePrint = fingerprintTable(remoteTables[table]);
      const discard = discardTables.includes(table);
      if (dirty.has(table)) {
        keepTables.push(table);
        return;
      }
      if (!discard && staleEcho[table] && staleEcho[table].has(remotePrint)) {
        // Looks like a copy from before this page's own save, but it may also
        // be a real change back to older rows (F-02). Kept only until the
        // caller checks the server; never decided by device clocks.
        keepTables.push(table);
        suspectTables.push(table);
        return;
      }
      adoptTables.push(table);
      if (remotePrint !== fingerprintTable(serverBase[table]) || discard) changedTables.push(table);
    });
    return { adoptTables, keepTables, changedTables, suspectTables, needsRebuild: changedTables.length > 0 };
  }

  // F-02: result of a fresh server read. A table whose server rows are this
  // page's saved rows keeps its echo guard (the suspect copy was stale);
  // anything else is the real current state, so the guard is dropped and the
  // next apply shows it.
  function resolveStaleEcho(serverTables) {
    const cleared = [];
    Object.keys(staleEcho).forEach(table => {
      if (fingerprintTable(serverTables[table]) === fingerprintTable(serverBase?.[table])) return;
      delete staleEcho[table];
      cleared.push(table);
    });
    return cleared;
  }

  // Bounded fallback when the server cannot be checked: stop hiding copies.
  function clearStaleEcho() {
    staleEcho = {};
  }

  function serverTables() {
    return pickCollectionTables(serverBase);
  }

  function setState(next, detail = {}) {
    state = next;
    conflict = next === STATES.CONFLICT ? {
      tables: [...(detail.tables || [])],
      latestData: detail.latestData ?? null,
      latestExists: Boolean(detail.latestExists),
      mayHaveSaved: Boolean(detail.mayHaveSaved)
    } : null;
    lastFailure = next === STATES.PENDING_NETWORK || next === STATES.PENDING_UNKNOWN ? (detail.code || null) : null;
  }

  return Object.freeze({
    bindSession,
    reset,
    hasBase,
    adoptRemote,
    noteRemoteSeen,
    forceTable,
    getDirtyTables,
    captureSaveInput,
    noteUncertain,
    confirmCommit,
    acceptCloudAsBase,
    planRemote,
    resolveStaleEcho,
    clearStaleEcho,
    serverTables,
    setState,
    get state() { return state; },
    get conflict() { return conflict; },
    get lastFailure() { return lastFailure; },
    get baseExists() { return baseExists; },
    get epoch() { return epoch; }
  });
}
