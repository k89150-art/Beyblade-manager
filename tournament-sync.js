// D-017: tournament writes run inside a Firestore transaction and are
// re-applied to the latest server copy of tournamentRecords. Everything here is
// deterministic and free of Firebase, DOM and timer side effects so that a
// retried transaction callback always produces the same result for the same
// input, and so the rules can be tested in Node.
import { createStableDataFingerprint } from "./data-session-guard.js?v=20261029-phase1c";

export const TOURNAMENT_OPERATION_TYPES = Object.freeze({
  ADD_TOURNAMENT: "addTournament",
  UPDATE_TOURNAMENT: "updateTournament",
  DELETE_TOURNAMENT: "deleteTournament",
  ADD_MATCH: "addMatch",
  EDIT_MATCH: "editMatch",
  DELETE_MATCH: "deleteMatch",
  ADD_ROUND: "addRound",
  DELETE_ROUND: "deleteRound"
});

export const TOURNAMENT_SYNC_CODES = Object.freeze({
  CONFLICT: "tournament-conflict",
  DELETED: "tournament-deleted",
  DELETE_CONFLICT: "tournament-delete-conflict",
  DUPLICATE_ID: "tournament-duplicate-id",
  MALFORMED: "tournament-malformed-data",
  INVALID: "tournament-invalid-operation",
  SESSION_CHANGED: "tournament-session-changed",
  OFFLINE: "tournament-offline",
  NETWORK: "tournament-network",
  PERMISSION: "tournament-permission",
  UNKNOWN_OUTCOME: "tournament-unknown-outcome"
});

const CODES = TOURNAMENT_SYNC_CODES;
const TYPES = TOURNAMENT_OPERATION_TYPES;

export const TOURNAMENT_SYNC_MESSAGES = Object.freeze({
  [CODES.CONFLICT]: "這場賽事已在其他分頁或裝置更新，你這次的變更沒有儲存。請確認最新資料後重新操作。",
  [CODES.DELETED]: "這場賽事已在其他地方刪除，這次的變更沒有儲存。",
  [CODES.DELETE_CONFLICT]: "這場賽事有新的變更，為避免遺失資料，本次沒有刪除。",
  [CODES.DUPLICATE_ID]: "這場賽事在雲端有重複的編號，為避免資料錯亂，這次的變更沒有儲存。請聯絡管理員協助檢查。",
  [CODES.MALFORMED]: "雲端的參賽紀錄格式異常，為避免覆蓋資料，這次的變更沒有儲存。請聯絡管理員協助檢查。",
  [CODES.INVALID]: "找不到要修改的對局或回合，這次的變更沒有儲存。請確認最新資料後重新操作。",
  [CODES.SESSION_CHANGED]: "帳號狀態已變更，這次的變更沒有儲存。",
  [CODES.OFFLINE]: "目前無法完成儲存，請確認網路連線。你的輸入內容已保留。",
  [CODES.NETWORK]: "目前無法完成儲存，請確認網路連線。你的輸入內容已保留。",
  [CODES.PERMISSION]: "雲端拒絕這次儲存，變更沒有儲存。請重新登入後再試。",
  [CODES.UNKNOWN_OUTCOME]: "無法確認這次操作是否已儲存，請先重新確認最新資料，避免重複新增。"
});

export class TournamentSyncError extends Error {
  constructor(code, details = {}) {
    super(TOURNAMENT_SYNC_MESSAGES[code] || code);
    this.name = "TournamentSyncError";
    this.code = code;
    this.latestData = details.latestData ?? null;
  }
}

export function isTournamentSyncCode(code) {
  return Object.values(CODES).includes(code);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// Operation payloads are produced by this page and are plain JSON values.
function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function fingerprintTournamentRecord(record) {
  return createStableDataFingerprint(record ?? null);
}

function requireText(value, name) {
  if (typeof value !== "string" || !value) {
    throw new TournamentSyncError(CODES.INVALID, { reason: name });
  }
  return value;
}

// Builds an immutable operation description. Ids and timestamps are created by
// the caller once, before any transaction starts, and stored here so that a
// retried transaction can never mint a second id.
export function createTournamentOperation(spec) {
  const type = spec?.type;
  if (!Object.values(TYPES).includes(type)) throw new TournamentSyncError(CODES.INVALID);

  const operation = {
    type,
    tournamentId: requireText(spec.tournamentId, "tournamentId"),
    updatedAt: Number(spec.updatedAt) || 0
  };

  if (type === TYPES.ADD_TOURNAMENT) {
    const record = clonePlain(spec.record);
    if (!record || record.id !== operation.tournamentId) throw new TournamentSyncError(CODES.INVALID);
    operation.record = record;
    return deepFreeze(operation);
  }

  // Every other operation is checked against the tournament as the user saw it.
  if (!spec.base || spec.base.id !== operation.tournamentId) throw new TournamentSyncError(CODES.INVALID);
  operation.base = clonePlain(spec.base);
  operation.baseFingerprint = fingerprintTournamentRecord(spec.base);

  if (type === TYPES.UPDATE_TOURNAMENT) {
    if (!spec.patch || typeof spec.patch !== "object" || "id" in spec.patch || "matches" in spec.patch) {
      throw new TournamentSyncError(CODES.INVALID);
    }
    operation.patch = clonePlain(spec.patch);
  } else if (type === TYPES.ADD_MATCH) {
    if (!spec.match || typeof spec.match.id !== "string" || !spec.match.id) throw new TournamentSyncError(CODES.INVALID);
    operation.match = clonePlain(spec.match);
  } else if (type === TYPES.EDIT_MATCH) {
    operation.matchId = requireText(spec.matchId, "matchId");
    if (!spec.patch || typeof spec.patch !== "object" || "id" in spec.patch || "rounds" in spec.patch) {
      throw new TournamentSyncError(CODES.INVALID);
    }
    operation.patch = clonePlain(spec.patch);
  } else if (type === TYPES.DELETE_MATCH) {
    operation.matchId = requireText(spec.matchId, "matchId");
  } else if (type === TYPES.ADD_ROUND) {
    operation.matchId = requireText(spec.matchId, "matchId");
    if (!spec.round || typeof spec.round.id !== "string" || !spec.round.id) throw new TournamentSyncError(CODES.INVALID);
    const round = clonePlain(spec.round);
    delete round.roundNumber; // numbered from the latest server copy
    operation.round = round;
  } else if (type === TYPES.DELETE_ROUND) {
    operation.matchId = requireText(spec.matchId, "matchId");
    operation.roundId = requireText(spec.roundId, "roundId");
  }

  return deepFreeze(operation);
}

// Reads tournamentRecords from a document. A missing field is an empty list;
// any other non-array value is refused instead of being replaced.
export function readTournamentRecordsField(data) {
  const value = data ? data.tournamentRecords : undefined;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TournamentSyncError(CODES.MALFORMED);
  return value;
}

function findTournamentIndexes(records, tournamentId) {
  const indexes = [];
  records.forEach((record, index) => {
    if (record && record.id === tournamentId) indexes.push(index);
  });
  return indexes;
}

function replaceAt(records, index, nextRecord) {
  return records.map((record, position) => (position === index ? nextRecord : record));
}

function updateMatches(record, matchId, updateMatch) {
  const matches = Array.isArray(record.matches) ? record.matches : [];
  const positions = matches
    .map((match, index) => (match && match.id === matchId ? index : -1))
    .filter(index => index >= 0);
  if (positions.length !== 1) throw new TournamentSyncError(CODES.INVALID);

  const nextMatches = updateMatch(matches, positions[0]);
  return { ...record, matches: nextMatches };
}

function applyToRecord(record, operation) {
  switch (operation.type) {
    case TYPES.UPDATE_TOURNAMENT:
      return { ...record, ...clonePlain(operation.patch) };

    case TYPES.ADD_MATCH: {
      const matches = Array.isArray(record.matches) ? record.matches : [];
      if (matches.some(match => match && match.id === operation.match.id)) {
        throw new TournamentSyncError(CODES.INVALID);
      }
      return { ...record, matches: [...matches, clonePlain(operation.match)] };
    }

    case TYPES.EDIT_MATCH:
      return updateMatches(record, operation.matchId, (matches, position) => matches.map((match, index) => (
        index === position ? { ...match, ...clonePlain(operation.patch) } : match
      )));

    case TYPES.DELETE_MATCH:
      return updateMatches(record, operation.matchId, (matches, position) => (
        matches.filter((match, index) => index !== position)
      ));

    case TYPES.ADD_ROUND:
      return updateMatches(record, operation.matchId, (matches, position) => matches.map((match, index) => {
        if (index !== position) return match;
        const rounds = Array.isArray(match.rounds) ? match.rounds : [];
        if (rounds.some(round => round && round.id === operation.round.id)) {
          throw new TournamentSyncError(CODES.INVALID);
        }
        return {
          ...match,
          rounds: [...rounds, { ...clonePlain(operation.round), roundNumber: rounds.length + 1 }]
        };
      }));

    case TYPES.DELETE_ROUND:
      return updateMatches(record, operation.matchId, (matches, position) => matches.map((match, index) => {
        if (index !== position) return match;
        const rounds = Array.isArray(match.rounds) ? match.rounds : [];
        if (!rounds.some(round => round && round.id === operation.roundId)) {
          throw new TournamentSyncError(CODES.INVALID);
        }
        return {
          ...match,
          rounds: rounds
            .filter(round => !(round && round.id === operation.roundId))
            .map((round, roundIndex) => ({ ...round, roundNumber: roundIndex + 1 }))
        };
      }));

    default:
      throw new TournamentSyncError(CODES.INVALID);
  }
}

// How a successful result relates to this operation:
// - "written":     this transaction wrote the change.
// - "identity":    the entity created by this very operation (its fixed id) is
//                  already on the server, e.g. an earlier attempt whose
//                  acknowledgement was lost. Nothing is written again.
// - "state-match": the target already holds exactly the intended result. It
//                  cannot be attributed to this operation, so the page must not
//                  claim "saved by this action"; nothing is written.
// - "absent":      a delete whose target is already gone.
export const TOURNAMENT_APPLIED = Object.freeze({
  WRITTEN: "written",
  IDENTITY: "identity",
  STATE_MATCH: "state-match",
  ABSENT: "absent"
});
const APPLIED = TOURNAMENT_APPLIED;

function findMatchIn(record, matchId) {
  const matches = Array.isArray(record?.matches) ? record.matches : [];
  return matches.find(match => match && match.id === matchId) || null;
}

// Only operations that create something carry an id of their own.
function hasOwnEntity(record, operation) {
  if (operation.type === TYPES.ADD_MATCH) return Boolean(findMatchIn(record, operation.match.id));
  if (operation.type === TYPES.ADD_ROUND) {
    const match = findMatchIn(record, operation.matchId);
    return Boolean(match) && (match.rounds || []).some(round => round && round.id === operation.round.id);
  }
  return false;
}

function intendedRecordFromBase(operation) {
  try {
    return applyToRecord(operation.base, operation);
  } catch (error) {
    return null;
  }
}

// Pure: returns a new array and never mutates latestRecords or its records.
// Records other than the target keep their original object references.
export function applyTournamentOperation(latestRecords, operation) {
  if (!Array.isArray(latestRecords)) throw new TournamentSyncError(CODES.MALFORMED);
  const indexes = findTournamentIndexes(latestRecords, operation.tournamentId);
  if (indexes.length > 1) throw new TournamentSyncError(CODES.DUPLICATE_ID);
  const index = indexes.length ? indexes[0] : -1;
  const latest = index >= 0 ? latestRecords[index] : null;
  const unchanged = applied => ({ records: latestRecords, record: latest, changed: false, applied });

  if (operation.type === TYPES.ADD_TOURNAMENT) {
    // The id is created once for this add; finding it means this add already
    // reached the server, even if another device has edited it since.
    if (latest) return unchanged(APPLIED.IDENTITY);
    const record = clonePlain(operation.record);
    return { records: [...latestRecords, record], record, changed: true, applied: APPLIED.WRITTEN };
  }

  if (operation.type === TYPES.DELETE_TOURNAMENT) {
    if (!latest) return unchanged(APPLIED.ABSENT);
    if (fingerprintTournamentRecord(latest) !== operation.baseFingerprint) {
      throw new TournamentSyncError(CODES.DELETE_CONFLICT);
    }
    return {
      records: latestRecords.filter((record, position) => position !== index),
      record: null,
      changed: true,
      applied: APPLIED.WRITTEN
    };
  }

  if (!latest) throw new TournamentSyncError(CODES.DELETED);

  // A match or round with this operation's own id is proof it was saved.
  if (hasOwnEntity(latest, operation)) return unchanged(APPLIED.IDENTITY);

  if (fingerprintTournamentRecord(latest) !== operation.baseFingerprint) {
    // Not attributable to this operation, but already exactly what the user
    // asked for: write nothing rather than report a conflict or reapply.
    const intended = intendedRecordFromBase(operation);
    if (intended && fingerprintTournamentRecord(latest) === fingerprintTournamentRecord(intended)) {
      return unchanged(APPLIED.STATE_MATCH);
    }
    throw new TournamentSyncError(CODES.CONFLICT);
  }

  const record = applyToRecord(latest, operation);
  return { records: replaceAt(latestRecords, index, record), record, changed: true, applied: APPLIED.WRITTEN };
}

function patchMatches(target, patch) {
  return Object.keys(patch).every(key => (
    createStableDataFingerprint(target?.[key] ?? null) === createStableDataFingerprint(patch[key] ?? null)
  ));
}

// Used after an unclear result to read the latest server copy. Returns
// "committed" only when the operation's own id proves it was saved,
// "matches" when the server already holds the intended values (which cannot
// be attributed to this operation), or false.
export function isTournamentOperationApplied(latestRecords, operation) {
  if (!Array.isArray(latestRecords)) return false;
  const indexes = findTournamentIndexes(latestRecords, operation.tournamentId);
  if (indexes.length > 1) return false;
  const record = indexes.length ? latestRecords[indexes[0]] : null;

  if (operation.type === TYPES.DELETE_TOURNAMENT) return record ? false : "matches";
  if (!record) return false;

  switch (operation.type) {
    case TYPES.ADD_TOURNAMENT:
      return "committed";
    case TYPES.ADD_MATCH:
    case TYPES.ADD_ROUND:
      return hasOwnEntity(record, operation) ? "committed" : false;
    case TYPES.UPDATE_TOURNAMENT:
      return patchMatches(record, operation.patch) ? "matches" : false;
    case TYPES.EDIT_MATCH: {
      const match = findMatchIn(record, operation.matchId);
      return match && patchMatches(match, operation.patch) ? "matches" : false;
    }
    case TYPES.DELETE_MATCH:
      return findMatchIn(record, operation.matchId) ? false : "matches";
    case TYPES.DELETE_ROUND: {
      const match = findMatchIn(record, operation.matchId);
      return match && !(match.rounds || []).some(round => round && round.id === operation.roundId) ? "matches" : false;
    }
    default:
      return false;
  }
}

// Firebase Web SDK 11.2.0 retries these codes itself; with maxAttempts: 1 the
// page does the retrying so it can see every commit error.
const RETRYABLE_CODES = new Set([
  "aborted", "failed-precondition", "already-exists",
  "cancelled", "unknown", "deadline-exceeded", "resource-exhausted", "internal", "unavailable", "unauthenticated"
]);
// Commit errors that do not prove the write was rejected: the request may
// have been applied before the connection failed. Every other code (version
// conflicts, permission, validation) means nothing was written.
const COMMIT_UNCLEAR_CODES = new Set(["cancelled", "unknown", "deadline-exceeded", "internal", "unavailable", ""]);
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([300, 600, 1200, 2400]);

function firebaseCode(error) {
  if (!error || error.name !== "FirebaseError") return "";
  return String(error.code || "").replace(/^firestore\//, "");
}

// Runs one operation with up to maxAttempts single-attempt transactions.
// runSingleAttempt(updateFunction) must run exactly one Firestore transaction
// attempt (runTransaction with maxAttempts: 1) and give updateFunction an
// adapter with get(), update(fields) and create(fields).
//
// progress.uncertainCommit becomes true when a commit carrying writes failed
// in a way that does not prove the server rejected it (for example a lost
// acknowledgement). progress.commitInFlight is true while such a commit has
// been handed to the SDK and has not settled yet.
export function startTournamentTransaction({
  operation,
  runTransaction: runSingleAttempt,
  canContinue,
  maxAttempts = 5,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  const progress = { attempts: 0, uncertainCommit: false, commitInFlight: false };

  async function runOnce() {
    let staged = false;
    try {
      const value = await runSingleAttempt(async transaction => {
        if (!canContinue()) throw new TournamentSyncError(CODES.SESSION_CHANGED);

        const snapshot = await transaction.get();
        if (!canContinue()) throw new TournamentSyncError(CODES.SESSION_CHANGED);

        const exists = Boolean(snapshot && snapshot.exists);
        const data = exists ? (snapshot.data || {}) : {};
        let result;
        try {
          result = applyTournamentOperation(readTournamentRecordsField(data), operation);
        } catch (error) {
          if (error instanceof TournamentSyncError) error.latestData = data;
          throw error;
        }

        if (!result.changed) {
          return { data, records: result.records, record: result.record, changed: false, applied: result.applied };
        }

        const updatedAt = Math.max(Number(operation.updatedAt) || 0, (Number(data.updatedAt) || 0) + 1);
        const fields = { tournamentRecords: result.records, updatedAt };
        if (exists) {
          transaction.update(fields);
        } else {
          // Only reached when this attempt itself saw no document; the read is
          // a precondition, so the commit fails if another tab created it.
          transaction.create(fields);
        }
        staged = true;
        progress.commitInFlight = true;
        return {
          data: { ...data, ...fields },
          records: result.records,
          record: result.record,
          changed: true,
          applied: APPLIED.WRITTEN
        };
      });
      return { value };
    } catch (error) {
      return { error, staged };
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
      if (!canContinue()) throw new TournamentSyncError(CODES.SESSION_CHANGED);
      progress.attempts += 1;

      const outcome = await runOnce();
      if (!outcome.error) return outcome.value;

      const { error, staged } = outcome;
      if (error instanceof TournamentSyncError) throw error;

      const code = firebaseCode(error);
      if (staged && COMMIT_UNCLEAR_CODES.has(code)) {
        // The commit may have reached the server. The next attempt re-reads
        // and recognises it through the operation id or the intended state.
        progress.uncertainCommit = true;
      }
      if (!RETRYABLE_CODES.has(code)) throw error;
      lastError = error;
    }
    throw lastError;
  })();

  return { promise, progress };
}

export function classifyTournamentSaveFailure(error, progress = {}) {
  if (error?.code === CODES.SESSION_CHANGED) return CODES.SESSION_CHANGED;
  // After a commit with an unknown result, no later answer (a conflict, a
  // network error) can prove that this operation was not saved.
  if (progress.uncertainCommit) return CODES.UNKNOWN_OUTCOME;
  if (error instanceof TournamentSyncError || isTournamentSyncCode(error?.code)) return error.code;
  const code = String(error?.code || "").replace(/^firestore\//, "");
  if (code === "permission-denied" || code === "unauthenticated") return CODES.PERMISSION;
  return CODES.NETWORK;
}

// After the page stops waiting, this tells whether a commit could still land.
export function isTournamentCommitUnresolved(progress = {}) {
  return Boolean(progress.uncertainCommit || progress.commitInFlight);
}

// Resolves with { kind: "settled" | "failed" | "timeout" } and never rejects.
export function waitForTournamentTransaction(handle, { timeoutMs, setTimer = setTimeout, clearTimer = clearTimeout }) {
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
