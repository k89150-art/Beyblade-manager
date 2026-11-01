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
import { createManagerDevice } from "./helpers/manager-page-harness.mjs";
import { COLLECTION_SYNC_STATES, createCollectionSyncTracker } from "../collection-sync.js";
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
  const tracker = createCollectionSyncTracker();
  let notices = 0;
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
    DATA_SESSION_STATES,
    COLLECTION_SYNC_STATES,
    collectionSync: tracker,
    renderCollectionSyncNotice: () => { notices += 1; }
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
  assert.ok(notices > 0, "the collection sync notice is refreshed with the controls");
  tracker.setState(COLLECTION_SYNC_STATES.CONFLICT, { tables: ["partTable"] });
  check(true, true, "a collection conflict blocks writes until resolved");
  tracker.setState(COLLECTION_SYNC_STATES.PENDING_NETWORK);
  check(false, true, "pending saves still accept edits (they are saved on retry)");
  tracker.setState(COLLECTION_SYNC_STATES.CLEAN);
  const readonly = guard.begin({ ownerUid: "admin", targetUid: "account-a", readOnly: true });
  guard.markReady(readonly);
  check(true, true, "readonly");
});

// Phase 1C listener and save guarantees, re-checked against the D-018 save
// path: the real script.js listener / saveData run on a simulated device
// (tests/helpers/manager-page-harness.mjs) backed by the mock Firestore.
const SAMPLE_DATA = Object.freeze({
  updatedAt: 1,
  beybladeTable: [{ cells: ["UX-01"] }],
  partTable: [{ cells: ["固鎖", "1-60", "3"] }],
  configTable: [],
  historyTable: []
});

function createListenerDevice(data = SAMPLE_DATA) {
  const mock = createMockFirestore();
  if (data) mock.seed(userDocPath("account-a"), data);
  const device = createManagerDevice({ mock, uid: "account-a" });
  const token = device.signIn("account-a");
  return { mock, device, token, listener: device.effects.listeners.at(-1) };
}

test("onSnapshot: cache displays once without unlocking, identical server data unlocks without a rebuild", () => {
  const { device, token, listener } = createListenerDevice();
  assert.equal(JSON.stringify(listener.options), JSON.stringify({ includeMetadataChanges: true }));

  device.deliver({ fromCache: true, data: SAMPLE_DATA });
  assert.equal(device.effects.rebuilds, 1);
  assert.equal(device.guard.snapshot().state, DATA_SESSION_STATES.ERROR);
  assert.equal(device.guard.captureWriteSession(), null, "cache never unlocks writes");

  device.deliver({ data: SAMPLE_DATA });
  assert.equal(device.effects.rebuilds, 1, "identical server data does not rebuild");
  assert.equal(device.guard.isWriteSessionCurrent(token), true);

  device.deliver({ data: { ...SAMPLE_DATA, updatedAt: 99, tournamentRecords: [1] } });
  assert.equal(device.effects.rebuilds, 1, "changes outside manager tables do not rebuild");

  listener.next({ metadata: { fromCache: false, hasPendingWrites: true }, exists: () => true, data: () => ({ ...SAMPLE_DATA, partTable: [] }) });
  assert.equal(device.effects.rebuilds, 1, "pending local writes are ignored");
});

test("onSnapshot: a metadata-only cache event keeps open editors, locks writes, and recovers on server confirm", () => {
  const { device, token } = createListenerDevice();
  device.deliver();
  device.setUnsavedInteraction(true); // e.g. Quick Editor or the delete-reason modal is open
  const cancelsAfterLoad = device.effects.cancels;

  device.deliver({ fromCache: true });
  assert.equal(device.effects.cancels, cancelsAfterLoad, "network drop must not close editors");
  assert.equal(device.effects.rebuilds, 1);
  assert.equal(device.guard.captureWriteSession(), null, "writes are locked while unconfirmed");
  assert.match(device.effects.status.at(-1)[0], /尚未儲存的編輯會保留/);

  device.deliver();
  assert.equal(device.guard.isWriteSessionCurrent(token), true, "same session becomes writable again");
  assert.equal(device.effects.cancels, cancelsAfterLoad);
  assert.deepEqual(device.effects.alerts, []);
});

test("onSnapshot: a real remote change rebuilds, cancels open editors and warns once", () => {
  const { device } = createListenerDevice();
  device.deliver();
  device.setUnsavedInteraction(true);

  device.deliver({ data: { ...SAMPLE_DATA, partTable: [...SAMPLE_DATA.partTable, { cells: ["軸心", "F", "1"] }] } });
  assert.equal(device.effects.rebuilds, 2);
  assert.ok(device.effects.cancels >= 1);
  assert.equal(device.effects.alerts.length, 1);
});

test("onSnapshot: stale listeners, read errors and a missing document are handled safely", () => {
  const mock = createMockFirestore();
  const device = createManagerDevice({ mock, uid: "account-a" });
  device.signIn("account-a");
  const first = device.effects.listeners.at(-1);
  const second = device.signIn("account-b");
  const secondListener = device.effects.listeners.at(-1);

  first.next({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true, data: () => structuredClone(SAMPLE_DATA) });
  assert.equal(device.effects.rebuilds, 0, "an old listener cannot touch the new session");
  assert.equal(device.guard.snapshot().state, DATA_SESSION_STATES.LOADING);

  secondListener.next({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => false, data: () => undefined });
  assert.equal(device.guard.snapshot().state, DATA_SESSION_STATES.READY);
  assert.equal(device.context.__test.sync.baseExists, false);
  assert.equal(vm.runInContext("initialDocumentMissingGeneration", device.context), second.generation);

  secondListener.error(new Error("permission-denied"));
  assert.equal(device.guard.snapshot().state, DATA_SESSION_STATES.ERROR);
  assert.equal(device.guard.captureWriteSession(), null);
  assert.equal(device.effects.alerts.length, 1);
});

test("saveData: nothing is written before the session is ready", async () => {
  const { mock, device } = createListenerDevice();
  await device.edit("partTable", rows => [...rows, { cells: ["軸心", "F", "1"] }]);
  await device.settle();
  assert.equal(mock.stats.transactions, 0);
});

test("saveData: queued saves coalesce into one follow-up write with the latest data", async () => {
  const { mock, device } = createListenerDevice();
  device.deliver();
  const hold = deferred();
  mock.on("beforeCommit", () => hold.promise);

  const first = device.edit("partTable", rows => [...rows, { cells: ["軸心", "A", "1"] }]);
  await new Promise(resolve => setTimeout(resolve, 0));
  device.edit("partTable", rows => [...rows, { cells: ["軸心", "B", "1"] }]);
  device.edit("partTable", rows => [...rows, { cells: ["軸心", "C", "1"] }]);
  assert.equal(mock.stats.transactions, 1, "only one save is in flight");

  hold.resolve();
  await first;
  await device.settle();
  assert.equal(mock.stats.commits, 2, "the queued saves collapse into one write");
  assert.deepEqual(mock.read(userDocPath("account-a")).partTable.map(row => row.cells[1]), ["1-60", "A", "B", "C"]);
  assert.ok(mock.commitLog.flat().every(write => write.path === userDocPath("account-a")));
});

test("saveData: an account switch during an in-flight write never writes old data to the new account", async () => {
  const { mock, device } = createListenerDevice();
  mock.seed(userDocPath("account-b"), { partTable: [] });
  device.deliver();
  const hold = deferred();
  mock.on("beforeCommit", () => hold.promise);

  const first = device.edit("partTable", rows => [...rows, { cells: ["軸心", "A", "1"] }]);
  await new Promise(resolve => setTimeout(resolve, 0));
  device.edit("partTable", rows => [...rows, { cells: ["軸心", "A2", "1"] }]);

  // Mirrors onAuthStateChanged: the user changes and a new session begins
  // while the queued account A save is still marked as pending.
  device.signIn("account-b");
  hold.resolve();
  await first;
  await device.settle();

  assert.deepEqual(mock.commitLog.flat().map(write => write.path), [userDocPath("account-a")], "the queued account A save is dropped");
  assert.deepEqual(mock.read(userDocPath("account-b")).partTable, []);

  device.deliver();
  await device.edit("partTable", rows => [...rows, { cells: ["軸心", "B", "1"] }]);
  await device.settle();
  assert.deepEqual(mock.commitLog.flat().map(write => write.path), [userDocPath("account-a"), userDocPath("account-b")]);
});

test("transaction: a confirmed missing document is created once, then later saves update it", async () => {
  const { mock, device } = createListenerDevice(null);
  device.deliver();
  await device.edit("partTable", rows => [...rows, { cells: ["軸心", "A", "1"] }]);
  await device.settle();
  assert.equal(mock.commitLog.length, 1);
  assert.equal(mock.commitLog[0][0].kind, "set");
  assert.equal(mock.commitLog[0][0].merge, false);
  assert.equal(vm.runInContext("initialDocumentMissingGeneration", device.context), null);

  await device.edit("partTable", rows => [...rows, { cells: ["軸心", "B", "1"] }]);
  await device.settle();
  assert.equal(mock.commitLog[1][0].kind, "update", "later saves update only changed fields");
});

test("transaction: a document created by another tab meanwhile is never overwritten", async () => {
  for (const timing of ["before-read", "between-read-and-commit"]) {
    const { mock, device } = createListenerDevice(null);
    device.deliver();
    const other = { partTable: [{ cells: ["固鎖", "其他分頁", "1"] }], updatedAt: 5 };
    if (timing === "before-read") mock.seed(userDocPath("account-a"), other);
    else mock.on("beforeCommit", () => mock.seed(userDocPath("account-a"), other));

    await device.edit("partTable", rows => [...rows, { cells: ["軸心", "A", "1"] }]);
    await device.settle();
    assert.deepEqual(mock.read(userDocPath("account-a")).partTable, other.partTable, timing);
    assert.equal(device.state, "conflict", timing);
    assert.deepEqual(device.partNames(), ["A"], `${timing}: the unsaved row stays on screen`);
    assert.match(device.effects.alerts.at(-1), /沒有儲存任何資料/);
  }
});
