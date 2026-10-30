import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  DATA_SESSION_STATES,
  INITIAL_DOCUMENT_CONFLICT_CODE,
  createDataSessionGuard,
  createPendingInteractionRegistry,
  createSessionSnapshotGate,
  writeDocumentSafely
} from "../data-session-guard.js";
import { createMockFirestore, userDocPath } from "./helpers/mock-firestore.mjs";
import { createTournamentPage } from "./helpers/tournament-page-harness.mjs";

const managerSource = fs.readFileSync("script.js", "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source range: ${startMarker}`);
  return source.slice(start, end);
}

function createStockAddHarness({ loadPromise, exactMatches = [], choicePromise, source = managerSource } = {}) {
  const guard = createDataSessionGuard();
  readySession(guard, "account-a");
  const added = [];
  const finished = [];
  const choiceEntered = deferred();
  const context = {
    window: {},
    document: {
      getElementById: id => id === "model" ? { value: "UX-18", focus() {} } : null
    },
    stockInputMode: "auto",
    dataSessionGuard: guard,
    requireLogin: () => true,
    parseStockProductCode: () => ({
      exactKey: "UX-18",
      baseKey: "UX-18",
      baseCode: "UX-18",
      canonical: "UX-18",
      hasChildNumber: false
    }),
    loadStockProducts: () => loadPromise || Promise.resolve(),
    stockProductsByExactCode: new Map([["UX-18", exactMatches]]),
    stockProductsByBaseCode: new Map(),
    openStockProductChoice: () => {
      choiceEntered.resolve();
      return choicePromise || Promise.resolve(exactMatches);
    },
    addAutoFilledStockProducts: products => added.push(...products),
    finishStockAdd: () => finished.push("saveData"),
    addManualStockRow: () => {},
    renderStockAutoPreview: () => {},
    alert: () => {},
    console: { debug() {} }
  };
  vm.createContext(context);
  vm.runInContext(
    sourceBetween(source, "window.addRow =", "/* ====== 第二區"),
    context
  );
  return { context, guard, added, finished, choiceEntered };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function readySession(guard, ownerUid, targetUid = ownerUid, readOnly = false) {
  const token = guard.begin({ ownerUid, targetUid, readOnly });
  assert.equal(guard.markReady(token), true);
  return token;
}

test("an account switch cancels an open modal and its old callback cannot mutate the new account", async () => {
  const guard = createDataSessionGuard();
  const interactions = createPendingInteractionRegistry();
  const accountA = readySession(guard, "account-a");
  const modalResult = deferred();
  const records = { "account-a": [], "account-b": [] };

  interactions.register(() => modalResult.resolve(null));
  const operation = modalResult.promise.then(value => {
    if (value && guard.isWriteSessionCurrent(accountA)) records["account-a"].push(value);
  });

  interactions.cancelAll();
  readySession(guard, "account-b");
  await operation;

  assert.deepEqual(records, { "account-a": [], "account-b": [] });
  assert.equal(interactions.size(), 0);
});

test("a delayed operation from account A cannot write after account B becomes ready", async () => {
  const guard = createDataSessionGuard();
  const accountA = readySession(guard, "account-a");
  const delayed = deferred();
  const writes = [];

  const operation = delayed.promise.then(payload => {
    if (guard.isWriteSessionCurrent(accountA)) writes.push({ uid: accountA.targetUid, payload });
  });

  readySession(guard, "account-b");
  delayed.resolve({ value: "old-operation" });
  await operation;

  assert.deepEqual(writes, []);
});

test("the actual collection add handler drops a catalog load result after account switch", async () => {
  const load = deferred();
  const product = { recordId: "ux-18-01" };
  const { context, guard, added } = createStockAddHarness({
    loadPromise: load.promise,
    exactMatches: [product]
  });

  const operation = context.window.addRow();
  readySession(guard, "account-b");
  load.resolve();
  await operation;

  assert.deepEqual(added, []);
});

async function runStaleChoiceScenario(source = managerSource) {
  const choice = deferred();
  const products = [{ recordId: "ux-18-01" }, { recordId: "ux-18-02" }];
  const harness = createStockAddHarness({
    exactMatches: products,
    choicePromise: choice.promise,
    source
  });

  const operation = harness.context.window.addRow();
  // Synchronize on the real call site instead of guessing microtask counts.
  await harness.choiceEntered.promise;
  readySession(harness.guard, "account-b");
  choice.resolve(products);
  await operation;
  return harness;
}

test("the actual collection choice result cannot add products to a replacement session", async () => {
  const { added, finished, guard } = await runStaleChoiceScenario();

  assert.deepEqual(added, [], "stale choice must not add collection rows");
  assert.deepEqual(finished, [], "stale choice must not reach finishStockAdd/saveData");
  assert.equal(guard.snapshot().ownerUid, "account-b");
});

test("mutation check: removing the post-choice session check makes the stale choice test fail", async () => {
  const guardLine = /(await openStockProductChoice\(exactMatches[^\n]*\n\s*if \(!selectedProducts\?\.length\) return;\r?\n)\s*if \(!dataSessionGuard\.isWriteSessionCurrent\(operationSession\)\) return;\r?\n/;
  assert.match(managerSource, guardLine, "post-choice check must exist in script.js");
  const mutated = managerSource.replace(guardLine, "$1");
  assert.notEqual(mutated, managerSource);

  const { added, finished } = await runStaleChoiceScenario(mutated);
  assert.equal(added.length, 2, "without the check the stale choice would add rows");
  assert.deepEqual(finished, ["saveData"]);
});

test("an admin operation stays invalid after viewing another user and returning to self", async () => {
  const guard = createDataSessionGuard();
  const originalSelfSession = readySession(guard, "admin");
  const delayed = deferred();
  let mutations = 0;

  const operation = delayed.promise.then(() => {
    if (guard.isWriteSessionCurrent(originalSelfSession)) mutations += 1;
  });

  readySession(guard, "admin", "user-a", true);
  readySession(guard, "admin");
  delayed.resolve();
  await operation;

  assert.equal(mutations, 0);
  assert.equal(guard.snapshot().targetUid, "admin");
});

test("a stale listener response cannot change the replacement session", () => {
  const guard = createDataSessionGuard();
  const gate = createSessionSnapshotGate();
  const accountA = guard.begin({ ownerUid: "account-a" });
  gate.begin(accountA);

  const accountB = guard.begin({ ownerUid: "account-b" });
  gate.begin(accountB);
  const staleDecision = gate.acceptServer(accountA, { rows: ["stale"] });

  assert.deepEqual(staleDecision, { current: false, apply: false });
  assert.equal(guard.markReady(accountA), false);
  assert.equal(guard.snapshot().ownerUid, "account-b");
  assert.equal(guard.snapshot().state, DATA_SESSION_STATES.LOADING);
});

test("a pending save cannot execute after its captured session is invalidated", async () => {
  const guard = createDataSessionGuard();
  const accountA = readySession(guard, "account-a");
  const queuedSave = deferred();
  let writes = 0;

  const operation = queuedSave.promise.then(() => {
    if (guard.isWriteSessionCurrent(accountA)) writes += 1;
  });

  guard.reset();
  queuedSave.resolve();
  await operation;
  assert.equal(writes, 0);
});

test("a cache snapshot can be displayed once but never unlocks writes", () => {
  const guard = createDataSessionGuard();
  const gate = createSessionSnapshotGate();
  const token = guard.begin({ ownerUid: "account-a" });
  gate.begin(token);

  assert.deepEqual(gate.acceptCache(token, { rows: [1] }), { current: true, apply: true });
  guard.markError(token);
  assert.equal(guard.captureWriteSession(), null);
});

test("metadata-only cache events do not rebuild after a server snapshot", () => {
  const gate = createSessionSnapshotGate();
  const token = { ownerUid: "a", targetUid: "a", generation: 1 };
  gate.begin(token);

  assert.equal(gate.acceptServer(token, { rows: [1] }).apply, true);
  assert.equal(gate.acceptCache(token, { rows: [1] }).apply, false);
  assert.equal(gate.acceptCache(token, { rows: [2] }).apply, false);
});

test("cache to identical server data does not rebuild DOM but still permits readiness", () => {
  const guard = createDataSessionGuard();
  const gate = createSessionSnapshotGate();
  const token = guard.begin({ ownerUid: "account-a" });
  gate.begin(token);
  const data = { rows: [{ id: "same", value: 1 }] };

  assert.equal(gate.acceptCache(token, data).apply, true);
  guard.markError(token);
  assert.equal(gate.acceptServer(token, data).apply, false);
  assert.equal(guard.markReady(token), true);
  assert.equal(guard.snapshot().state, DATA_SESSION_STATES.READY);
});

test("a failed read can recover through a fresh retry session", () => {
  const guard = createDataSessionGuard();
  const gate = createSessionSnapshotGate();
  const failed = guard.begin({ ownerUid: "account-a" });
  gate.begin(failed);
  guard.markError(failed);

  const retry = guard.begin({ ownerUid: "account-a" });
  gate.begin(retry);
  assert.equal(gate.acceptServer(retry, { rows: ["fresh"] }).apply, true);
  assert.equal(guard.markReady(retry), true);
  assert.equal(guard.captureWriteSession().generation, retry.generation);
});

test("concurrent first-document initialization allows only one atomic create", async () => {
  let documentExists = false;
  const writes = [];

  async function atomicCreate(value) {
    await Promise.resolve();
    if (documentExists) {
      const conflict = new Error("already exists");
      conflict.code = INITIAL_DOCUMENT_CONFLICT_CODE;
      throw conflict;
    }
    documentExists = true;
    writes.push(value);
  }

  const attempts = ["tab-a", "tab-b"].map(value => writeDocumentSafely({
    requiresCreate: true,
    createOnly: () => atomicCreate(value),
    merge: () => { throw new Error("merge must not run for initial creation"); }
  }));
  const results = await Promise.allSettled(attempts);

  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.code, INITIAL_DOCUMENT_CONFLICT_CODE);
  assert.equal(writes.length, 1);
});

test("a ready session performs a normal merge against its fixed UID", async () => {
  const guard = createDataSessionGuard();
  const accountA = readySession(guard, "account-a");
  const writes = [];

  await writeDocumentSafely({
    requiresCreate: false,
    createOnly: () => { throw new Error("create-only must not run"); },
    merge: async () => writes.push(accountA.targetUid)
  });

  assert.deepEqual(writes, ["account-a"]);
});

// D-017: the real tournament.js runs against a mock Firestore transaction
// (tests/helpers/tournament-page-harness.mjs); see tournament-page-sync.test.mjs
// for the concurrency, offline and account-switch matrix.
async function createTournamentHarness() {
  const mock = createMockFirestore();
  mock.seed(userDocPath("account-a"), { tournamentRecords: [], updatedAt: 1 });
  mock.seed(userDocPath("account-b"), { tournamentRecords: [], updatedAt: 1 });
  const page = await createTournamentPage({ mock });
  await page.signIn("account-a");
  page.setAddForm({
    tournamentDate: "2026-10-29",
    tournamentName: "初賽",
    tournamentLocation: "台北",
    tournamentParticipantCount: "16",
    tournamentNote: "測試"
  });
  return { page, mock };
}

test("the actual tournament handlers still add, edit and delete in a ready session", async () => {
  const { page, mock } = await createTournamentHarness();
  const saved = () => mock.read(userDocPath("account-a")).tournamentRecords;

  await page.window.addTournament();
  assert.equal(saved().length, 1);
  assert.equal(saved()[0].tournamentName, "初賽");
  const id = saved()[0].id;

  page.useEditDialog({ tournamentName: "決賽", date: "2026-10-30", location: "新北", participantCount: 32, note: "已修改" });
  await page.window.editTournament(id);
  assert.equal(saved()[0].tournamentName, "決賽");
  assert.equal(saved()[0].participantCount, 32);

  await page.window.deleteTournament(id);
  assert.equal(saved().length, 0);
  assert.equal(page.api.records.length, 0);
  assert.equal(mock.stats.commits, 3);
});

test("the actual tournament edit handler drops a dialog result after account switch", async () => {
  const { page, mock } = await createTournamentHarness();
  mock.seed(userDocPath("account-a"), {
    tournamentRecords: [{ id: "event-1", tournamentName: "A 的比賽", date: "2026-10-29", location: "台北", participantCount: 16, note: "", isFinished: false, matches: [] }],
    updatedAt: 2
  });
  await page.signIn("account-a-reload");
  await page.signIn("account-a");
  const edit = deferred();
  page.api.setEditDialog(async (record, session, submitEdit) => {
    const values = await edit.promise;
    return submitEdit(values, record);
  });

  const operation = page.window.editTournament("event-1");
  await page.signIn("account-b");
  edit.resolve({ tournamentName: "不應套用", date: "2026-11-01", location: "高雄", participantCount: 64, note: "stale" });
  await operation;

  assert.equal(mock.read(userDocPath("account-a")).tournamentRecords[0].tournamentName, "A 的比賽");
  assert.deepEqual(mock.read(userDocPath("account-b")).tournamentRecords, []);
  assert.equal(mock.stats.transactions, 0);
});

// ---------------------------------------------------------------------------
// Phase 1C: run the real script.js handlers inside an isolated VM with DOM and
// Firestore mocks. Nothing here touches Firebase or the working tree.
// ---------------------------------------------------------------------------

const MANAGER_PRELUDE = `
let currentUser = null;
let hasPendingCloudSave = false;
let isSavingCloudData = false;
let isApplyingRemoteData = false;
let lastLocalWriteUpdatedAt = 0;
let lastAppliedRemoteUpdatedAt = 0;
let initialDocumentMissingGeneration = null;
let unsubscribeCloudData = null;
let viewingUserId = null;
let configEditorSessionToken = null;
let stockChoiceResolve = null;
let stockChoiceProducts = [];
`;

const MANAGER_STATE_EXPORT = `
globalThis.__state = () => ({
  hasPendingCloudSave,
  isSavingCloudData,
  initialDocumentMissingGeneration,
  lastAppliedRemoteUpdatedAt
});
globalThis.__set = values => {
  if ("currentUser" in values) currentUser = values.currentUser;
  if ("initialDocumentMissingGeneration" in values) initialDocumentMissingGeneration = values.initialDocumentMissingGeneration;
  if ("configEditorSessionToken" in values) configEditorSessionToken = values.configEditorSessionToken;
};
`;

function managerSlices(...ranges) {
  return ranges.map(([start, end]) => sourceBetween(managerSource, start, end)).join("\n");
}

function runManagerSlices(context, ranges, source = null) {
  vm.createContext(context);
  vm.runInContext(MANAGER_PRELUDE + (source ?? managerSlices(...ranges)) + MANAGER_STATE_EXPORT, context);
  return context;
}

function createEventTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type) {
      [...(listeners.get(type) || [])].forEach(handler => handler({ type }));
    },
    listenerCount() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    }
  };
}

function createSnapshotGate() {
  return createSessionSnapshotGate({
    selectData: data => ({
      beybladeTable: data?.beybladeTable || [],
      partTable: data?.partTable || [],
      configTable: data?.configTable || [],
      historyTable: data?.historyTable || []
    })
  });
}

function createDeleteHarness() {
  const guard = createDataSessionGuard();
  const interactions = createPendingInteractionRegistry();
  const token = readySession(guard, "account-a");
  const modal = { style: { display: "none" } };
  const reasonSelect = { value: "", style: {}, focus() {} };
  const noteInput = { value: "" };
  const confirmBtn = createEventTarget();
  const cancelBtn = createEventTarget();
  const backdrop = createEventTarget();
  const elements = {
    deleteConfigModal: modal,
    deleteReasonSelect: reasonSelect,
    deleteNoteInput: noteInput,
    deleteConfigConfirmBtn: confirmBtn,
    deleteConfigCancelBtn: cancelBtn,
    deleteConfigModalBackdrop: backdrop
  };
  const effects = { removed: 0, history: [], saves: 0 };
  const row = {
    isConnected: true,
    closest: selector => (selector === "table" ? { id: "configTable" } : row),
    remove() {
      effects.removed += 1;
      row.isConnected = false;
    }
  };
  const button = { closest: () => row };
  const context = runManagerSlices({
    window: {},
    document: { getElementById: id => elements[id] || null },
    dataSessionGuard: guard,
    pendingSessionInteractions: interactions,
    requireLogin: () => Boolean(guard.captureWriteSession()),
    buildHistoryRecordFromConfigRow: (_, reason, note) => ({ reason, note }),
    createHistoryRow: record => effects.history.push(record),
    sortBeybladeTable() {},
    refreshSelectors() {},
    saveData: () => { effects.saves += 1; },
    confirm: () => true
  }, [
    ["function askDeleteReasonForConfig(", "window.restoreHistoryRow ="],
    ["window.deleteRow = async function", "/* ====== 表格內修改功能"]
  ]);
  return { context, guard, token, interactions, modal, reasonSelect, confirmBtn, cancelBtn, backdrop, effects, button };
}

test("delete-reason modal: a session cancel resolves the real modal without deleting or saving", async () => {
  const h = createDeleteHarness();
  const operation = h.context.window.deleteRow(h.button);

  assert.equal(h.modal.style.display, "block");
  assert.equal(h.interactions.size(), 1, "modal registers a session canceler");

  h.interactions.cancelAll();
  readySession(h.guard, "account-b");
  await operation;

  assert.equal(h.modal.style.display, "none");
  assert.equal(h.confirmBtn.listenerCount() + h.cancelBtn.listenerCount() + h.backdrop.listenerCount(), 0);
  assert.equal(h.interactions.size(), 0);
  assert.deepEqual(h.effects, { removed: 0, history: [], saves: 0 });
});

test("delete-reason modal: confirming a stale modal after an account switch changes nothing", async () => {
  const h = createDeleteHarness();
  const operation = h.context.window.deleteRow(h.button);

  readySession(h.guard, "account-b");
  h.reasonSelect.value = "不好用";
  h.confirmBtn.dispatch("click");
  await operation;

  assert.deepEqual(h.effects, { removed: 0, history: [], saves: 0 });
});

test("delete-reason modal: a normal confirm in the same session still deletes, records history and saves", async () => {
  const h = createDeleteHarness();
  const operation = h.context.window.deleteRow(h.button);

  h.reasonSelect.value = "不好用";
  h.confirmBtn.dispatch("click");
  await operation;

  assert.equal(h.effects.removed, 1);
  assert.equal(h.effects.history.length, 1);
  assert.equal(h.effects.saves, 1);
  assert.equal(h.interactions.size(), 0);
});

test("stock choice dialog: the real dialog drops a stale selection and cancels with the session", async () => {
  for (const mode of ["stale-click", "session-cancel"]) {
    const guard = createDataSessionGuard();
    const interactions = createPendingInteractionRegistry();
    const token = readySession(guard, "account-a");
    const dialog = { hidden: true };
    const list = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
    const elements = {
      stockChoiceDialog: dialog,
      stockChoiceList: list,
      stockChoiceDescription: { textContent: "" },
      addAllStockChoicesBtn: { disabled: false, textContent: "" }
    };
    const context = runManagerSlices({
      document: {
        getElementById: id => elements[id] || null,
        body: { classList: { add() {}, remove() {} } }
      },
      requestAnimationFrame: () => {},
      dataSessionGuard: guard,
      pendingSessionInteractions: interactions,
      escapeHtml: value => String(value),
      getStockProductChoiceLabel: product => product.recordId,
      formatStockProductParts: () => ""
    }, [["function closeStockProductChoice(", "function installUiSummaryObservers("]]);

    const products = [{ recordId: "p1" }, { recordId: "p2" }];
    const pending = context.openStockProductChoice(products, "UX-18", token);
    assert.equal(dialog.hidden, false);
    assert.equal(interactions.size(), 1);

    if (mode === "stale-click") {
      readySession(guard, "account-b");
      context.closeStockProductChoice(products);
    } else {
      interactions.cancelAll();
    }

    assert.equal(await pending, null, mode);
    assert.equal(dialog.hidden, true, mode);
    assert.equal(interactions.size(), 0, mode);
  }
});

test("Quick Editor: saving with an editor opened in an older session closes it without writing", () => {
  const guard = createDataSessionGuard();
  const accountA = readySession(guard, "account-a");
  const effects = { closed: [], saves: 0, reads: 0 };
  const context = runManagerSlices({
    window: {},
    document: { getElementById: () => { effects.reads += 1; return { value: "" }; } },
    dataSessionGuard: guard,
    requireLogin: () => Boolean(guard.captureWriteSession()),
    closeConfigQuickEditor: options => effects.closed.push(options),
    saveData: () => { effects.saves += 1; }
  }, [["window.addConfig = function", "/* ====== 登入狀態顯示"]]);

  context.__set({ configEditorSessionToken: accountA });
  readySession(guard, "account-b");
  context.window.addConfig();

  assert.equal(JSON.stringify(effects.closed), JSON.stringify([{ restoreFocus: false }]));
  assert.equal(effects.saves, 0);
  assert.equal(effects.reads, 0, "no form value is read after the session check fails");
});

test("data-write-action controls follow the session state", () => {
  const guard = createDataSessionGuard();
  const controls = [0, 1, 2].map(() => ({ disabled: false, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }));
  const retry = { hidden: true };
  const body = { dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const context = runManagerSlices({
    document: {
      body,
      querySelectorAll: selector => (selector === "[data-write-action]" ? controls : []),
      getElementById: id => (id === "retryDataLoadBtn" ? retry : null)
    },
    dataSessionGuard: guard,
    DATA_SESSION_STATES
  }, [["function updateDataAccessUi()", "function cancelPendingCloudSaves()"]]);
  context.__set({ currentUser: { uid: "account-a" } });

  const check = (expectedDisabled, expectedRetryHidden, label) => {
    context.updateDataAccessUi();
    assert.ok(controls.every(control => control.disabled === expectedDisabled), label);
    assert.ok(controls.every(control => control.attributes["aria-disabled"] === String(expectedDisabled)), label);
    assert.equal(retry.hidden, expectedRetryHidden, label);
    assert.equal(body.dataset.dataState, guard.snapshot().state, label);
  };

  check(true, true, "unauthenticated");
  const token = guard.begin({ ownerUid: "account-a" });
  check(true, true, "loading");
  guard.markError(token);
  check(true, false, "error shows retry");
  guard.markReady(token);
  check(false, true, "ready");
  const readonly = guard.begin({ ownerUid: "admin", targetUid: "account-a", readOnly: true });
  guard.markReady(readonly);
  check(true, true, "readonly");
});

function createListenerHarness({ unsavedInteraction = false } = {}) {
  const guard = createDataSessionGuard();
  const gate = createSnapshotGate();
  const listeners = [];
  const effects = { applied: [], cancels: 0, alerts: [], saves: 0, status: [] };
  let unsaved = unsavedInteraction;
  const context = runManagerSlices({
    dataSessionGuard: guard,
    dataSnapshotGate: gate,
    getUserDocRef: uid => ({ uid }),
    onSnapshot: (ref, options, next, error) => {
      const listener = { ref, options, next, error, active: true };
      listeners.push(listener);
      return () => { listener.active = false; };
    },
    applyDataToTables: data => { effects.applied.push(data); return 0; },
    cancelSessionInteractions: () => { effects.cancels += 1; },
    updateDataAccessUi() {},
    setSyncStatus: (text, type) => effects.status.push([text, type]),
    hasUnsavedDomInteraction: () => unsaved,
    alert: message => effects.alerts.push(message),
    saveData: () => { effects.saves += 1; },
    console: { error() {} }
  }, [
    ["function cancelPendingCloudSaves()", "function cancelSessionInteractions()"],
    ["function startCloudListener(", "function loadCloudDataForCurrentTarget("]
  ]);
  const begin = (uid = "account-a") => {
    const token = guard.begin({ ownerUid: uid });
    gate.begin(token);
    context.startCloudListener(token);
    return { token, listener: listeners.at(-1) };
  };
  const snapshot = (data, { fromCache = false, pending = false } = {}) => ({
    metadata: { fromCache, hasPendingWrites: pending },
    exists: () => data !== null,
    data: () => (data === null ? undefined : structuredClone(data))
  });
  return { context, guard, effects, begin, snapshot, setUnsaved: value => { unsaved = value; } };
}

const SAMPLE_DATA = Object.freeze({
  updatedAt: 1,
  beybladeTable: [{ cells: ["UX-01"] }],
  partTable: [{ cells: ["固鎖", "1-60", "3"] }],
  configTable: [],
  historyTable: []
});

test("onSnapshot: cache displays once without unlocking, identical server data unlocks without a rebuild", () => {
  const h = createListenerHarness();
  const { token, listener } = h.begin();
  assert.equal(JSON.stringify(listener.options), JSON.stringify({ includeMetadataChanges: true }));

  listener.next(h.snapshot(SAMPLE_DATA, { fromCache: true }));
  assert.equal(h.effects.applied.length, 1);
  assert.equal(h.guard.snapshot().state, DATA_SESSION_STATES.ERROR);
  assert.equal(h.guard.captureWriteSession(), null, "cache never unlocks writes");

  listener.next(h.snapshot(SAMPLE_DATA));
  assert.equal(h.effects.applied.length, 1, "identical server data does not rebuild");
  assert.equal(h.guard.isWriteSessionCurrent(token), true);

  listener.next(h.snapshot({ ...SAMPLE_DATA, updatedAt: 99, tournamentRecords: [1] }));
  assert.equal(h.effects.applied.length, 1, "changes outside manager tables do not rebuild");

  listener.next(h.snapshot({ ...SAMPLE_DATA, partTable: [] }, { pending: true }));
  assert.equal(h.effects.applied.length, 1, "pending local writes are ignored");
});

test("onSnapshot: a metadata-only cache event keeps open editors, locks writes, and recovers on server confirm", () => {
  const h = createListenerHarness();
  const { token, listener } = h.begin();
  listener.next(h.snapshot(SAMPLE_DATA));
  h.setUnsaved(true); // e.g. Quick Editor or the delete-reason modal is open
  const cancelsAfterLoad = h.effects.cancels;

  listener.next(h.snapshot(SAMPLE_DATA, { fromCache: true }));
  assert.equal(h.effects.cancels, cancelsAfterLoad, "network drop must not close editors");
  assert.equal(h.effects.applied.length, 1);
  assert.equal(h.guard.captureWriteSession(), null, "writes are locked while unconfirmed");
  assert.match(h.effects.status.at(-1)[0], /尚未儲存的編輯會保留/);

  listener.next(h.snapshot(SAMPLE_DATA));
  assert.equal(h.guard.isWriteSessionCurrent(token), true, "same session becomes writable again");
  assert.equal(h.effects.cancels, cancelsAfterLoad);
  assert.deepEqual(h.effects.alerts, []);
});

test("onSnapshot: a real remote change rebuilds, cancels open editors and warns once", () => {
  const h = createListenerHarness();
  const { listener } = h.begin();
  listener.next(h.snapshot(SAMPLE_DATA));
  h.setUnsaved(true);

  listener.next(h.snapshot({ ...SAMPLE_DATA, partTable: [...SAMPLE_DATA.partTable, { cells: ["軸心", "F", "1"] }] }));
  assert.equal(h.effects.applied.length, 2);
  assert.ok(h.effects.cancels >= 1);
  assert.equal(h.effects.alerts.length, 1);
});

test("onSnapshot: stale listeners, read errors and a missing document are handled safely", () => {
  const h = createListenerHarness();
  const first = h.begin("account-a");
  const second = h.begin("account-b");

  first.listener.next(h.snapshot(SAMPLE_DATA));
  assert.equal(h.effects.applied.length, 0, "an old listener cannot touch the new session");
  assert.equal(h.guard.snapshot().state, DATA_SESSION_STATES.LOADING);

  second.listener.next(h.snapshot(null));
  assert.equal(h.guard.snapshot().state, DATA_SESSION_STATES.READY);
  assert.equal(h.context.__state().initialDocumentMissingGeneration, second.token.generation);

  second.listener.error(new Error("permission-denied"));
  assert.equal(h.guard.snapshot().state, DATA_SESSION_STATES.ERROR);
  assert.equal(h.guard.captureWriteSession(), null);
  assert.equal(h.effects.alerts.length, 1);
});

function createSaveHarness() {
  const guard = createDataSessionGuard();
  const gate = createSnapshotGate();
  const writes = [];
  const commits = [];
  const pendingMerges = [];
  const effects = { alerts: [], status: [], cancels: 0 };
  let collected = 0;
  let documentExistsPerAttempt = [false];
  let transactionAttempts = 0;
  const context = runManagerSlices({
    db: {},
    dataSessionGuard: guard,
    dataSnapshotGate: gate,
    writeDocumentSafely,
    INITIAL_DOCUMENT_CONFLICT_CODE,
    getUserDocRef: uid => ({ uid }),
    collectCurrentData: () => ({
      beybladeTable: [],
      partTable: [{ cells: ["固鎖", "1-60", String(++collected)] }],
      configTable: [],
      historyTable: [],
      ownerUid: "x",
      ownerEmail: "",
      updatedAt: Date.now()
    }),
    setDoc: (ref, data, options) => {
      const write = deferred();
      writes.push({ uid: ref.uid, count: data.partTable[0].cells[2], options });
      pendingMerges.push(write);
      return write.promise;
    },
    runTransaction: async (db, updateFunction) => {
      let lastError = null;
      for (const [attempt, exists] of documentExistsPerAttempt.entries()) {
        transactionAttempts += 1;
        const staged = [];
        const transaction = {
          get: async ref => ({ exists: () => exists, ref }),
          set: (ref, data, options) => staged.push({ uid: ref.uid, count: data.partTable[0].cells[2], options })
        };
        try {
          await updateFunction(transaction);
          // A later entry in the sequence simulates SDK contention: the staged
          // writes are discarded and the update function runs again.
          if (attempt < documentExistsPerAttempt.length - 1) continue;
          commits.push(...staged);
          return;
        } catch (error) {
          lastError = error;
          if (error?.code === INITIAL_DOCUMENT_CONFLICT_CODE) throw error;
        }
      }
      throw lastError;
    },
    setSyncStatus: (text, type) => effects.status.push([text, type]),
    alert: message => effects.alerts.push(message),
    cancelSessionInteractions: () => { effects.cancels += 1; },
    updateDataAccessUi() {},
    console: { warn() {}, error() {} }
  }, [["async function saveData()", "/* ====== 載入資料"]]);
  return {
    context, guard, gate, writes, commits, pendingMerges, effects,
    setExistsSequence: sequence => { documentExistsPerAttempt = sequence; },
    attempts: () => transactionAttempts
  };
}

test("saveData: nothing is written before the session is ready", async () => {
  const h = createSaveHarness();
  h.context.__set({ currentUser: { uid: "account-a" } });
  h.guard.begin({ ownerUid: "account-a" });
  await h.context.saveData();
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.commits, []);
});

test("saveData: queued saves coalesce into one follow-up write with the latest data", async () => {
  const h = createSaveHarness();
  h.context.__set({ currentUser: { uid: "account-a" } });
  readySession(h.guard, "account-a");

  const first = h.context.saveData();
  await Promise.resolve();
  h.context.saveData();
  h.context.saveData();
  assert.equal(h.writes.length, 1, "only one write is in flight");

  h.pendingMerges[0].resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(h.writes.length, 2, "the queued saves collapse into one write");
  assert.equal(h.writes[1].count, "2", "the follow-up write collects fresh data");
  h.pendingMerges[1].resolve();
  await first;
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(h.writes.length, 2);
  assert.ok(h.writes.every(write => write.uid === "account-a" && write.options.merge === true));
});

test("saveData: an account switch during an in-flight write never writes old data to the new account", async () => {
  const h = createSaveHarness();
  h.context.__set({ currentUser: { uid: "account-a" } });
  readySession(h.guard, "account-a");

  const first = h.context.saveData();
  await Promise.resolve();
  h.context.saveData();

  // Mirrors onAuthStateChanged: the user changes and a new session begins
  // while the queued account A save is still marked as pending.
  h.context.__set({ currentUser: { uid: "account-b" } });
  h.guard.begin({ ownerUid: "account-b" });
  h.pendingMerges[0].resolve();
  await first;
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(h.writes.map(write => write.uid), ["account-a"], "the queued account A save is dropped");

  const accountB = h.guard.snapshot();
  h.guard.markReady(accountB);
  h.context.saveData();
  await Promise.resolve();
  assert.deepEqual(h.writes.map(write => write.uid), ["account-a", "account-b"]);
  h.pendingMerges[1].resolve();
});

test("transaction: a confirmed missing document is created once, then normal merges resume", async () => {
  const h = createSaveHarness();
  h.context.__set({ currentUser: { uid: "account-a" } });
  const token = readySession(h.guard, "account-a");
  h.context.__set({ initialDocumentMissingGeneration: token.generation });
  h.setExistsSequence([false]);

  await h.context.saveData();
  assert.equal(h.commits.length, 1);
  assert.equal(JSON.stringify(h.commits[0].options), JSON.stringify({ merge: true }));
  assert.equal(h.writes.length, 0, "no plain setDoc during initial creation");
  assert.equal(h.context.__state().initialDocumentMissingGeneration, null);

  const next = h.context.saveData();
  await Promise.resolve();
  assert.equal(h.writes.length, 1, "later saves use a normal merge");
  h.pendingMerges[0].resolve();
  await next;
});

test("transaction: an existing document is never overwritten, even when detected on a retry", async () => {
  for (const sequence of [[true], [false, true]]) {
    const h = createSaveHarness();
    h.context.__set({ currentUser: { uid: "account-a" } });
    const token = readySession(h.guard, "account-a");
    h.context.__set({ initialDocumentMissingGeneration: token.generation });
    h.setExistsSequence(sequence);

    await h.context.saveData();
    assert.equal(h.attempts(), sequence.length, `sequence ${sequence} re-reads on retry`);
    assert.deepEqual(h.commits, [], `sequence ${sequence}`);
    assert.deepEqual(h.writes, [], `sequence ${sequence}`);
    assert.equal(h.guard.snapshot().state, DATA_SESSION_STATES.ERROR);
    assert.equal(h.guard.captureWriteSession(), null);
    assert.match(h.effects.alerts.at(-1), /另一個分頁已建立雲端資料/);
  }
});
