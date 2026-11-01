// Phase 5B-2A / D-018: main page (collection) save protection.
// Pure tests for collection-sync.js plus the real script.js save and snapshot
// code on simulated devices sharing one mock Firestore. Simulation only; the
// Firestore Emulator check (M01-M10) is separate.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  COLLECTION_APPLIED,
  COLLECTION_SYNC_CODES,
  COLLECTION_SYNC_STATES,
  COLLECTION_TABLES,
  CollectionSyncError,
  classifyCollectionSaveFailure,
  createCollectionSyncTracker,
  findChangedTables,
  fingerprintTable,
  pickCollectionTables,
  planCollectionCommit,
  startCollectionTransaction
} from "../collection-sync.js";
import { createMockFirestore, createRunner, deferred, firestoreError, userDocPath } from "./helpers/mock-firestore.mjs";
import { createManagerDevice, loadManagerSource, partRow } from "./helpers/manager-page-harness.mjs";

const STATES = COLLECTION_SYNC_STATES;
const PATH_A = userDocPath("user-a");
const PATH_B = userDocPath("user-b");
const HISTORY = { model: "H1-歷史", combo: "c", fix: "", axis: "", result: "win", note: "", date: "2026-10-01", comboKey: "" };
const TOURNAMENTS = [{ id: "t1", tournamentName: "賽事不應被動到", date: "2026-10-01", participantCount: 8, matches: [] }];

function initialDoc(extra = {}) {
  return {
    updatedAt: 1,
    ownerUid: "user-a",
    beybladeTable: [],
    partTable: [partRow("P1-原有")],
    configTable: [],
    historyTable: [HISTORY],
    tournamentRecords: TOURNAMENTS,
    ...extra
  };
}

function setup({ doc = initialDoc(), devices = 2, ...options } = {}) {
  const mock = createMockFirestore();
  if (doc) mock.seed(PATH_A, doc);
  const list = Array.from({ length: devices }, () => createManagerDevice({ mock, ...options }));
  list.forEach(device => {
    device.signIn();
    device.deliver();
  });
  return { mock, devices: list, A: list[0], B: list[1] };
}

const serverParts = mock => (mock.read(PATH_A)?.partTable || []).map(row => row.cells[1]);
const addPart = (device, name) => device.edit("partTable", rows => [...rows, partRow(name)]);
const removePart = (device, name) => device.edit("partTable", rows => rows.filter(row => row.cells[1] !== name));
const deleteHistory = device => device.edit("historyTable", rows => rows.slice(1));
const writtenFields = mock => mock.commitLog.flat().map(write => Object.keys(write.fields).sort());

/* ---------- pure decisions ---------- */

test("pure: tables are compared by content, missing tables read as empty", () => {
  assert.deepEqual(pickCollectionTables({ partTable: "bad", historyTable: [1] }), {
    beybladeTable: [], partTable: [], configTable: [], historyTable: [1]
  });
  assert.equal(fingerprintTable([{ b: 1, a: 2 }]), fingerprintTable([{ a: 2, b: 1 }]));
  assert.notEqual(fingerprintTable([{ a: 1 }, { a: 2 }]), fingerprintTable([{ a: 2 }, { a: 1 }]));
  const base = pickCollectionTables({ partTable: [1] });
  assert.deepEqual(findChangedTables(pickCollectionTables({ partTable: [1], historyTable: [2] }), base), ["historyTable"]);
  assert.deepEqual(findChangedTables(base, base, ["beybladeTable"]), ["beybladeTable"]);
});

test("pure: write only when the cloud still holds the base; equal intent counts as done; otherwise conflict", () => {
  const base = { partTable: [1], historyTable: [9] };
  const acceptedBases = Object.fromEntries(COLLECTION_TABLES.map(table => [table, [fingerprintTable(base[table])]]));
  const local = pickCollectionTables({ partTable: [1, 2], historyTable: [] });
  const plan = latestData => planCollectionCommit({
    latestExists: true, latestData, baseExists: true, acceptedBases, localTables: local, changedTables: ["partTable", "historyTable"]
  });

  assert.deepEqual(plan({ partTable: [1], historyTable: [9] }).writeTables, ["partTable", "historyTable"]);
  // F-01: equal rows count as done only with evidence that this page sent them.
  assert.equal(plan({ partTable: [1, 2], historyTable: [9] }).kind, "conflict", "same rows without evidence");
  const evidence = { partTable: [fingerprintTable(local.partTable)], historyTable: [fingerprintTable(local.historyTable)] };
  const withEvidence = latestData => planCollectionCommit({
    latestExists: true, latestData, baseExists: true, acceptedBases, matchEvidence: evidence, localTables: local, changedTables: ["partTable", "historyTable"]
  });
  const partly = withEvidence({ partTable: [1, 2], historyTable: [9] });
  assert.equal(partly.kind, "write");
  assert.deepEqual(partly.writeTables, ["historyTable"]);
  assert.deepEqual(partly.alreadyTables, ["partTable"]);
  assert.equal(withEvidence({ partTable: [1, 2], historyTable: [] }).kind, "already");
  const conflict = plan({ partTable: [1, 3], historyTable: [9] });
  assert.equal(conflict.kind, "conflict", "one conflicting table stops the whole save");
  assert.deepEqual(conflict.conflictTables, ["partTable"]);
  assert.deepEqual(conflict.writeTables, []);
});

test("pure: updatedAt never decides; a missing document is created only when the page saw it missing", () => {
  const acceptedBases = Object.fromEntries(COLLECTION_TABLES.map(table => [table, [fingerprintTable([])]]));
  const local = pickCollectionTables({ partTable: [1] });
  const common = { acceptedBases, localTables: local, changedTables: ["partTable"] };
  assert.equal(planCollectionCommit({ ...common, latestExists: true, baseExists: true, latestData: { updatedAt: 9e15, partTable: [] } }).kind, "write");
  assert.equal(planCollectionCommit({ ...common, latestExists: true, baseExists: true, latestData: { updatedAt: 0, partTable: [5] } }).kind, "conflict");
  const create = planCollectionCommit({ ...common, latestExists: false, baseExists: false, latestData: null });
  assert.equal(create.create, true);
  assert.deepEqual(create.writeTables, COLLECTION_TABLES);
  assert.equal(planCollectionCommit({ ...common, latestExists: false, baseExists: true, latestData: null }).kind, "removed");
});

test("pure: classification keeps conflicts, unknown results and permission errors apart", () => {
  const conflict = new CollectionSyncError(COLLECTION_SYNC_CODES.CONFLICT, { tables: ["partTable"] });
  assert.equal(classifyCollectionSaveFailure(conflict, { uncertainCommit: true }), COLLECTION_SYNC_CODES.CONFLICT);
  assert.equal(classifyCollectionSaveFailure(firestoreError("unavailable"), { uncertainCommit: true }), COLLECTION_SYNC_CODES.UNKNOWN_OUTCOME);
  assert.equal(classifyCollectionSaveFailure(firestoreError("unavailable"), {}), COLLECTION_SYNC_CODES.NETWORK);
  assert.equal(classifyCollectionSaveFailure(firestoreError("permission-denied"), {}), COLLECTION_SYNC_CODES.PERMISSION);
  assert.equal(classifyCollectionSaveFailure(new CollectionSyncError(COLLECTION_SYNC_CODES.SESSION_CHANGED), {}), COLLECTION_SYNC_CODES.SESSION_CHANGED);
});

test("runner: single-attempt transactions retry a stale read and never touch tournamentRecords", async () => {
  const mock = createMockFirestore();
  mock.seed(PATH_A, initialDoc());
  const tracker = createCollectionSyncTracker();
  tracker.adoptRemote({ exists: true, remoteTables: pickCollectionTables(initialDoc()), domTables: pickCollectionTables(initialDoc()) });
  const input = tracker.captureSaveInput(pickCollectionTables({ ...initialDoc(), partTable: [partRow("P1-原有"), partRow("新")] }));
  mock.on("beforeCommit", () => mock.externalMerge(PATH_A, { tournamentRecords: [...TOURNAMENTS, { id: "t2" }], historyTable: [] }));
  const handle = startCollectionTransaction({
    input,
    identity: { ownerUid: "user-a", ownerEmail: "" },
    runTransaction: createRunner(mock, PATH_A),
    canContinue: () => true,
    wait: async () => {}
  });
  const value = await handle.promise;
  assert.equal(value.applied, COLLECTION_APPLIED.WRITTEN);
  assert.equal(handle.progress.attempts, 2);
  assert.deepEqual(serverParts(mock), ["P1-原有", "新"]);
  assert.equal(mock.read(PATH_A).tournamentRecords.length, 2, "the other page's change survives");
  assert.deepEqual(mock.read(PATH_A).historyTable, [], "an untouched table is not written back");
  assert.ok(mock.commitLog.flat().every(write => !("tournamentRecords" in write.fields)));
});

/* ---------- S0-S5 on two simulated devices (Phase 5B-1 scenarios) ---------- */

test("S0: when the sync arrives first, both additions are kept", async () => {
  const { mock, A, B } = setup();
  await addPart(A, "A-新零件"); await A.settle();
  B.deliver();
  await addPart(B, "B-新零件"); await B.settle();
  A.deliver();
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-新零件", "B-新零件"]);
  assert.deepEqual(A.partNames(), serverParts(mock));
  assert.equal(A.state, STATES.CLEAN);
  assert.equal(B.state, STATES.CLEAN);
  assert.deepEqual(B.effects.alerts, []);
});

test("S1: different tables are merged; only the changed table is written", async () => {
  const { mock, A, B } = setup();
  await addPart(A, "A-新零件"); await A.settle();
  await deleteHistory(B); await B.settle();
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-新零件"], "A's part is not lost");
  assert.deepEqual(mock.read(PATH_A).historyTable, []);
  assert.deepEqual(writtenFields(mock).at(-1), ["historyTable", "ownerEmail", "ownerUid", "updatedAt"]);
  assert.equal(mock.read(PATH_A).tournamentRecords.length, 1);
  A.deliver(); B.deliver();
  assert.deepEqual(A.tables.historyTable, []);
  assert.deepEqual(B.partNames(), ["P1-原有", "A-新零件"], "B's screen catches up");
  assert.equal(B.state, STATES.CLEAN);
  assert.deepEqual([...A.effects.alerts, ...B.effects.alerts], []);
});

test("S2: same table, stale device: conflict, nothing written, draft kept; both resolutions work", async () => {
  for (const choice of ["cloud", "mine"]) {
    const { mock, A, B } = setup();
    await addPart(A, "A-新零件"); await A.settle();
    await addPart(B, "B-新零件"); await B.settle();
    assert.equal(B.state, STATES.CONFLICT);
    assert.equal(B.body.dataset.collectionSync, STATES.CONFLICT);
    assert.equal(B.elements.get("collectionSyncNotice").hidden, false);
    assert.equal(B.elements.get("collectionLoadCloudBtn").hidden, false);
    assert.match(B.elements.get("collectionSyncMessage").textContent, /額外零件庫存/);
    assert.deepEqual(serverParts(mock), ["P1-原有", "A-新零件"], "A is never overwritten");
    assert.deepEqual(B.partNames(), ["P1-原有", "B-新零件"], "B's unsaved row stays on screen");
    assert.equal(B.effects.alerts.length, 1);

    // While in conflict, further writes are blocked.
    assert.equal(B.context.requireLogin(), false);
    const transactions = mock.stats.transactions;
    await B.save(); await B.settle();
    assert.equal(mock.stats.transactions, transactions, "no transaction is even started");

    B.deliver(); // a snapshot during the conflict does not touch the draft
    assert.deepEqual(B.partNames(), ["P1-原有", "B-新零件"]);

    if (choice === "cloud") {
      B.context.resolveCollectionConflictWithCloud();
      await B.settle();
      assert.deepEqual(B.partNames(), ["P1-原有", "A-新零件"]);
      assert.deepEqual(serverParts(mock), ["P1-原有", "A-新零件"]);
    } else {
      B.context.resolveCollectionConflictWithLocal();
      await B.settle();
      assert.deepEqual(serverParts(mock), ["P1-原有", "B-新零件"], "explicit, confirmed overwrite");
      B.deliver();
      assert.deepEqual(B.partNames(), ["P1-原有", "B-新零件"]);
    }
    assert.equal(B.effects.confirms.length, 1, "each resolution asks for confirmation");
    assert.equal(B.state, STATES.CLEAN);
    assert.equal(mock.read(PATH_A).tournamentRecords.length, 1);
  }
});

test("S2: declining the confirmation changes nothing", async () => {
  const { mock, A, B } = setup();
  await addPart(A, "A-新零件"); await A.settle();
  await addPart(B, "B-新零件"); await B.settle();
  B.setConfirm(false);
  B.context.resolveCollectionConflictWithCloud();
  B.context.resolveCollectionConflictWithLocal();
  await B.settle();
  assert.equal(B.state, STATES.CONFLICT);
  assert.deepEqual(B.partNames(), ["P1-原有", "B-新零件"]);
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-新零件"]);
});

test("S3: a deleted record is not brought back by a stale device", async () => {
  const { mock, A, B } = setup();
  await removePart(A, "P1-原有"); await A.settle();
  await addPart(B, "B-新零件"); await B.settle();
  assert.deepEqual(serverParts(mock), []);
  assert.equal(B.state, STATES.CONFLICT);
  assert.deepEqual(B.partNames(), ["P1-原有", "B-新零件"]);
});

test("S4: an offline save is not queued; after reconnecting it never overwrites newer changes", async () => {
  const { mock, A, B } = setup();
  B.setOffline(true);
  await addPart(B, "B-離線時新增"); await B.settle();
  assert.equal(B.state, STATES.PENDING_NETWORK);
  assert.equal(B.elements.get("collectionRetryBtn").hidden, false);
  assert.deepEqual(B.partNames(), ["P1-原有", "B-離線時新增"], "draft kept");
  assert.equal(B.effects.alerts.length, 1);

  await addPart(A, "A-線上新增"); await A.settle();
  B.setOffline(false);
  B.deliver(); // the server answers again: automatic retry
  await B.settle();
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-線上新增"]);
  assert.equal(B.state, STATES.CONFLICT);
  assert.deepEqual(B.partNames(), ["P1-原有", "B-離線時新增"]);
});

test("S4: offline change to a different table is saved automatically after reconnecting", async () => {
  const { mock, A, B } = setup();
  B.setOffline(true);
  await deleteHistory(B); await B.settle();
  await addPart(A, "A-線上新增"); await A.settle();
  B.deliver(); // still offline: the retry fails quietly, no second dialog
  await B.settle();
  assert.equal(B.state, STATES.PENDING_NETWORK);
  assert.equal(B.effects.alerts.length, 1);
  B.setOffline(false);
  B.deliver();
  await B.settle();
  assert.equal(B.state, STATES.CLEAN);
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-線上新增"]);
  assert.deepEqual(mock.read(PATH_A).historyTable, []);
  B.deliver();
  assert.deepEqual(B.partNames(), ["P1-原有", "A-線上新增"]);
});

test("S4: conflict in one table blocks the whole save; loading the cloud copy keeps the other table's change", async () => {
  const { mock, A, B } = setup();
  B.setOffline(true);
  await deleteHistory(B); await B.settle();
  await addPart(B, "B-離線時新增"); await B.settle();
  await addPart(A, "A-線上新增"); await A.settle();
  B.setOffline(false);
  B.deliver();
  await B.settle();
  assert.equal(B.state, STATES.CONFLICT);
  assert.deepEqual(B.sync.conflict.tables, ["partTable"]);
  assert.deepEqual(mock.read(PATH_A).historyTable, [HISTORY], "all-or-nothing: history not written either");
  B.context.resolveCollectionConflictWithCloud();
  await B.settle();
  assert.equal(B.state, STATES.CLEAN);
  assert.deepEqual(B.partNames(), ["P1-原有", "A-線上新增"]);
  assert.deepEqual(B.tables.historyTable, [], "the unsaved history deletion is kept");
  assert.deepEqual(mock.read(PATH_A).historyTable, [], "and saved afterwards");
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-線上新增"]);
});

test("S4b: once the page knows it is offline, writes stay locked and the draft is kept", async () => {
  const { mock, B } = setup();
  B.setOffline(true);
  B.deliver({ fromCache: true });
  assert.equal(B.guard.snapshot().state, "error");
  assert.equal(B.context.requireLogin(), false);
  const commits = mock.stats.commits;
  await B.save(); await B.settle();
  assert.equal(mock.stats.commits, commits);
});

test("S5: a lost acknowledgement is recognised on retry and written only once", async () => {
  const { mock, B } = setup();
  mock.on("afterCommit", () => { throw firestoreError("unavailable", "ack lost"); });
  await addPart(B, "B-新零件"); await B.settle();
  assert.equal(B.state, STATES.CLEAN);
  assert.deepEqual(serverParts(mock), ["P1-原有", "B-新零件"]);
  assert.equal(mock.stats.commits, 1, "no second write");
  assert.match(B.effects.status.at(-1)[0], /沒有重複寫入/);
});

test("S5: a lost acknowledgement followed by another device's change is not overwritten", async () => {
  const { mock, A, B } = setup();
  mock.on("afterCommit", () => {
    // B's commit landed; A receives it and adds a part before B retries.
    mock.externalMerge(PATH_A, { partTable: [partRow("P1-原有"), partRow("B-新零件"), partRow("A-之後新增")] });
    throw firestoreError("unavailable", "ack lost");
  });
  await addPart(B, "B-新零件"); await B.settle();
  assert.deepEqual(serverParts(mock), ["P1-原有", "B-新零件", "A-之後新增"], "the stale payload is not resent");
  assert.equal(B.state, STATES.CONFLICT);
  assert.equal(B.sync.conflict.mayHaveSaved, true);
  assert.match(B.elements.get("collectionSyncMessage").textContent, /可能已完成/);
  B.context.resolveCollectionConflictWithCloud();
  await B.settle();
  assert.deepEqual(B.partNames(), ["P1-原有", "B-新零件", "A-之後新增"]);
  assert.equal(A.state, STATES.CLEAN);
});

/* ---------- edge cases ---------- */

test("rapid saves collapse into at most one follow-up transaction with the newest rows", async () => {
  const { mock, A } = setup({ devices: 1 });
  const first = addPart(A, "1");
  addPart(A, "2");
  addPart(A, "3");
  await first; await A.settle();
  assert.ok(mock.stats.commits <= 2, `commits: ${mock.stats.commits}`);
  assert.deepEqual(serverParts(mock), ["P1-原有", "1", "2", "3"]);
  assert.equal(A.state, STATES.CLEAN);
});

test("an edit made while a save is in flight is saved afterwards, not lost", async () => {
  const { mock, A } = setup({ devices: 1 });
  mock.on("beforeCommit", () => { void addPart(A, "儲存中加入"); });
  await addPart(A, "第一筆"); await A.settle();
  assert.deepEqual(serverParts(mock), ["P1-原有", "第一筆", "儲存中加入"]);
  assert.equal(mock.stats.commits, 2);
});

test("a snapshot during the transaction is held, then merged without losing the saved row", async () => {
  const { mock, A } = setup({ devices: 1 });
  mock.on("beforeCommit", () => {
    mock.externalMerge(PATH_A, { historyTable: [], tournamentRecords: [] });
    A.deliver();
    assert.ok(A.deferred, "held while saving");
    assert.deepEqual(A.tables.historyTable, [HISTORY], "screen untouched while saving");
  });
  await addPart(A, "A-新零件"); await A.settle();
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-新零件"]);
  assert.deepEqual(A.tables.historyTable, [], "the other change appears after the save");
  assert.deepEqual(A.partNames(), ["P1-原有", "A-新零件"]);
  // A late copy from before this save must not undo it on screen.
  A.deliver({ data: { ...initialDoc(), historyTable: [] } });
  assert.deepEqual(A.partNames(), ["P1-原有", "A-新零件"]);
});

test("an account switch during the transaction never writes to either account", async () => {
  const { mock, A } = setup({ devices: 1 });
  mock.seed(PATH_B, { partTable: [partRow("B 帳號")] });
  mock.on("beforeGet", () => { A.signIn("user-b", "b@example.test"); });
  await addPart(A, "A-帳號資料"); await A.settle();
  assert.equal(mock.stats.commits, 0);
  assert.deepEqual(serverParts(mock), ["P1-原有"]);
  assert.deepEqual(mock.read(PATH_B).partTable, [partRow("B 帳號")]);
  assert.equal(A.state, STATES.CLEAN, "the new account starts clean");
  A.deliver();
  assert.deepEqual(A.partNames(), ["B 帳號"]);
});

test("sign-out while the commit is on the wire: the commit can only target the fixed old path", async () => {
  const { mock, A } = setup({ devices: 1 });
  mock.on("beforeCommit", () => { A.signOut(); });
  await addPart(A, "A-帳號資料"); await A.settle();
  mock.commitLog.flat().forEach(write => assert.equal(write.path, PATH_A));
  assert.equal(mock.read(PATH_B), null);
  assert.equal(A.state, STATES.CLEAN);
  assert.deepEqual(A.partNames(), []);
});

test("connection lost mid-save (cache event): rows kept, retried after the server answers", async () => {
  const { mock, A } = setup({ devices: 1 });
  mock.on("beforeGet", () => { A.deliver({ fromCache: true }); });
  await addPart(A, "A-新零件"); await A.settle();
  assert.equal(mock.stats.commits, 0);
  assert.equal(A.state, STATES.PENDING_NETWORK);
  assert.deepEqual(A.partNames(), ["P1-原有", "A-新零件"]);
  A.deliver();
  await A.settle();
  assert.equal(A.state, STATES.CLEAN);
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-新零件"]);
});

test("reload (重新載入) keeps unsaved rows and retries them", async () => {
  const { mock, A } = setup({ devices: 1 });
  A.setOffline(true);
  await addPart(A, "A-未儲存"); await A.settle();
  A.reload();
  A.deliver({ fromCache: true });
  assert.deepEqual(A.partNames(), ["P1-原有", "A-未儲存"]);
  A.setOffline(false);
  A.deliver();
  await A.settle();
  assert.equal(A.state, STATES.CLEAN);
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-未儲存"]);
});

test("open editors are not closed by snapshots while a save is pending", async () => {
  const { mock, A, B } = setup();
  B.setOffline(true);
  await addPart(B, "B-離線"); await B.settle();
  B.setUnsavedInteraction(true);
  const cancels = B.effects.cancels;
  await deleteHistory(A); await A.settle();
  B.deliver(); // triggers a retry, which fails again while offline
  await B.settle();
  assert.equal(B.effects.cancels, cancels);
  assert.deepEqual(B.tables.historyTable, [HISTORY], "screen not rebuilt while pending");
  assert.equal(B.state, STATES.PENDING_NETWORK);
  assert.ok(mock.read(PATH_A));
});

test("timeout before the commit is sent: reported as not saved", async () => {
  const { mock, A } = setup({ devices: 1, saveTimeoutMs: 40 });
  const hold = deferred();
  mock.on("beforeGet", () => hold.promise);
  await addPart(A, "A-新零件"); await A.settle();
  assert.equal(A.state, STATES.PENDING_NETWORK);
  hold.resolve();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(mock.stats.commits, 0, "abandoned attempts never commit");
});

test("timeout after the commit was sent: unknown result, later confirmed without a second write", async () => {
  const { mock, A } = setup({ devices: 1, saveTimeoutMs: 40 });
  const hold = deferred();
  mock.on("beforeCommit", () => hold.promise);
  await addPart(A, "A-新零件"); await A.settle();
  assert.equal(A.state, STATES.PENDING_UNKNOWN);
  assert.match(A.elements.get("collectionSyncMessage").textContent, /無法確認/);
  assert.deepEqual(A.partNames(), ["P1-原有", "A-新零件"]);
  hold.resolve();
  await new Promise(resolve => setTimeout(resolve, 20));
  await A.settle();
  assert.equal(A.state, STATES.CLEAN);
  assert.equal(mock.stats.commits, 1);
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-新零件"]);
});

test("unknown result followed by more edits builds on the uncertain rows instead of conflicting", async () => {
  const { mock, A } = setup({ devices: 1, saveTimeoutMs: 40 });
  const hold = deferred();
  mock.on("beforeCommit", () => hold.promise);
  await addPart(A, "第一筆"); await A.settle();
  assert.equal(A.state, STATES.PENDING_UNKNOWN);
  hold.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await addPart(A, "第二筆"); await A.settle();
  assert.equal(A.state, STATES.CLEAN);
  assert.deepEqual(serverParts(mock), ["P1-原有", "第一筆", "第二筆"]);
});

test("permission errors keep the draft and say the cloud refused", async () => {
  const { mock, A } = setup({ devices: 1 });
  mock.on("beforeCommit", () => { throw firestoreError("permission-denied"); });
  await addPart(A, "A-新零件"); await A.settle();
  assert.equal(A.state, STATES.PENDING_NETWORK);
  assert.match(A.elements.get("collectionSyncMessage").textContent, /拒絕寫入/);
  assert.deepEqual(A.partNames(), ["P1-原有", "A-新零件"]);
  A.context.retryCollectionSave();
  await A.settle();
  assert.equal(A.state, STATES.CLEAN);
  assert.deepEqual(serverParts(mock), ["P1-原有", "A-新零件"]);
});

/* ---------- missing document / first save ---------- */

test("first save creates the document; concurrent first saves never overwrite each other", async () => {
  const { mock, A, B } = setup({ doc: null });
  assert.equal(A.guard.snapshot().state, "ready");
  await addPart(A, "A-第一筆"); await A.settle();
  assert.deepEqual(serverParts(mock), ["A-第一筆"]);
  assert.deepEqual(Object.keys(mock.read(PATH_A)).sort(), ["beybladeTable", "configTable", "historyTable", "ownerEmail", "ownerUid", "partTable", "updatedAt"]);

  await addPart(B, "B-第一筆"); await B.settle();
  assert.deepEqual(serverParts(mock), ["A-第一筆"]);
  assert.equal(B.state, STATES.CONFLICT);

  const other = setup({ doc: null });
  await addPart(other.A, "A-零件"); await other.A.settle();
  await other.B.edit("historyTable", () => [HISTORY]); await other.B.settle();
  assert.equal(other.B.state, STATES.CLEAN, "different tables merge even on the first save");
  assert.deepEqual(serverParts(other.mock), ["A-零件"]);
  assert.deepEqual(other.mock.read(PATH_A).historyTable, [HISTORY]);
});

test("a document created by the tournament page meanwhile is extended, not replaced", async () => {
  const { mock, A } = setup({ doc: null, devices: 1 });
  mock.externalMerge(PATH_A, { tournamentRecords: TOURNAMENTS, updatedAt: 5 });
  await addPart(A, "A-零件"); await A.settle();
  assert.equal(A.state, STATES.CLEAN);
  assert.deepEqual(mock.read(PATH_A).tournamentRecords, TOURNAMENTS);
  assert.deepEqual(serverParts(mock), ["A-零件"]);
});

/* ---------- D-015 catalog upgrades ---------- */

function catalogUpgrade(rows) {
  let count = 0;
  const next = rows.map(row => {
    if (row.stockAutoFilled === "true" && row.cells[1] === "舊名稱") {
      count += 1;
      return { ...row, cells: [row.cells[0], "新名稱", ...row.cells.slice(2)] };
    }
    return row;
  });
  return { rows: next, count };
}

const OUTDATED = { cells: ["UX-03", "舊名稱", "-", "-", "-", "-", "-", "1-60", "F"], mainStockName: "-", stockAutoFilled: "true", stockRecordId: "UX-03" };

test("catalog upgrade on load saves only the collection table, once, through the transaction", async () => {
  const { mock, A } = setup({ doc: initialDoc({ beybladeTable: [OUTDATED] }), devices: 1, upgrade: catalogUpgrade });
  await A.settle();
  assert.equal(mock.stats.commits, 1);
  assert.equal(mock.read(PATH_A).beybladeTable[0].cells[1], "新名稱");
  assert.deepEqual(writtenFields(mock)[0], ["beybladeTable", "ownerEmail", "ownerUid", "updatedAt"]);
  A.deliver();
  await A.settle();
  assert.equal(mock.stats.commits, 1, "the echo does not trigger another save");
});

test("two tabs upgrading at once write once; the second recognises the same result", async () => {
  const { mock, A, B } = setup({ doc: initialDoc({ beybladeTable: [OUTDATED] }), upgrade: catalogUpgrade });
  await Promise.all([A.settle(), B.settle()]);
  assert.equal(mock.stats.commits, 1);
  assert.equal(A.state, STATES.CLEAN);
  assert.equal(B.state, STATES.CLEAN);
});

test("a cache snapshot never writes, even when it would upgrade", async () => {
  const mock = createMockFirestore();
  mock.seed(PATH_A, initialDoc({ beybladeTable: [OUTDATED] }));
  const A = createManagerDevice({ mock, upgrade: catalogUpgrade });
  A.signIn();
  A.deliver({ fromCache: true });
  await A.settle();
  assert.equal(mock.stats.commits, 0);
});

/* ---------- source checks ---------- */

test("script.js: saves go through the transaction module; no whole-document setDoc remains", () => {
  const source = loadManagerSource();
  assert.doesNotMatch(source, /\bsetDoc\b/);
  assert.match(source, /from "\.\/collection-sync\.js\?v=20261030-phase5b"/);
  assert.match(source, /startCollectionTransaction\(\{/);
  assert.match(source, /\}\), \{ maxAttempts: 1 \}\);/);
  assert.doesNotMatch(source.slice(source.indexOf("/* ===== D-018 collection saves: begin")), /tournamentRecords[\s\S]{0,40}transaction\./);
  const auth = source.slice(source.indexOf("onAuthStateChanged(auth"));
  assert.match(auth, /dataSessionGuard\.reset\(\);\s*collectionSync\.reset\(\);/);
  assert.match(source, /const COLLECTION_CLIENT_VERSION = "收藏儲存版本：5B（交易保護）";/);
});

test("index.html: script cache version, version line and the sync notice controls", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /src="script\.js\?v=20261030-phase5b"/);
  for (const id of ["collectionClientVersion", "collectionSyncNotice", "collectionSyncMessage", "collectionRetryBtn", "collectionLoadCloudBtn", "collectionKeepLocalBtn"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test("every saveData() call site still saves after its DOM change (10 sites + snapshot path)", () => {
  const source = loadManagerSource();
  const calls = source.match(/\n\s+(void )?saveData\(\);/g) || [];
  assert.ok(calls.length >= 11, `found ${calls.length}`);
  assert.doesNotMatch(source, /saveData\(\)\.then/);
});

/* ---------- Phase 5B-2C-1: review findings F-01, F-02, F-03 and M11 ---------- */

test("F-01: identical additions on two stale devices are not silently treated as one finished save", async () => {
  const { mock, A, B } = setup();
  await addPart(A, "同名零件"); await A.settle();
  await addPart(B, "同名零件"); await B.settle();
  assert.equal(B.state, STATES.CONFLICT, "no evidence that B wrote it: conflict, not success");
  assert.doesNotMatch(B.effects.status.at(-1)[0], /已儲存/);
  assert.deepEqual(B.partNames(), ["P1-原有", "同名零件"], "B's draft stays on screen");
  assert.equal(mock.stats.commits, 1);
});

test("F-01: identical additions after an offline period also end in a conflict", async () => {
  const { mock, A, B } = setup();
  B.setOffline(true);
  await addPart(B, "同名零件"); await B.settle();
  await addPart(A, "同名零件"); await A.settle();
  B.setOffline(false);
  B.deliver(); await B.settle();
  assert.equal(B.state, STATES.CONFLICT);
  assert.equal(mock.stats.commits, 1);
});

test("F-01: evidence of an uncertain commit is bound to the table and the exact rows", async () => {
  const tracker = createCollectionSyncTracker();
  const base = pickCollectionTables(initialDoc());
  tracker.bindSession("user-a", "user-a");
  tracker.adoptRemote({ exists: true, remoteTables: base, domTables: base });
  const sent = pickCollectionTables({ ...initialDoc(), partTable: [partRow("P1-原有"), partRow("X")] });
  const input = tracker.captureSaveInput(sent);
  assert.deepEqual(input.matchEvidence.partTable, [], "no evidence before anything was sent");
  tracker.noteUncertain(input);
  const again = tracker.captureSaveInput(sent);
  assert.deepEqual(again.matchEvidence.partTable, [fingerprintTable(sent.partTable)]);
  assert.deepEqual(again.matchEvidence.historyTable, [], "evidence is per table");
  const different = tracker.captureSaveInput({ ...sent, partTable: [partRow("P1-原有"), partRow("Y")] });
  const plan = planCollectionCommit({
    latestExists: true,
    latestData: { partTable: [partRow("P1-原有"), partRow("Y")] },
    baseExists: true,
    acceptedBases: different.acceptedBases,
    matchEvidence: different.matchEvidence,
    localTables: different.localTables,
    changedTables: different.changedTables
  });
  assert.equal(plan.kind, "conflict", "evidence for X does not cover a different operation Y");
  tracker.confirmCommit(again, { writtenTables: ["partTable"], alreadyTables: [], updatedAt: 9 });
  assert.deepEqual(tracker.captureSaveInput(sent).matchEvidence.partTable, [], "a confirmed commit consumes the evidence");
  tracker.noteUncertain(again);
  tracker.bindSession("user-b", "user-b");
  assert.deepEqual(tracker.captureSaveInput(sent).matchEvidence.partTable, [], "another account never inherits evidence");
});

test("F-01: catalog-upgrade evidence only covers the upgraded rows, not later user edits", async () => {
  const tracker = createCollectionSyncTracker();
  const raw = pickCollectionTables({ beybladeTable: [{ cells: ["old"] }] });
  const upgraded = pickCollectionTables({ beybladeTable: [{ cells: ["new"] }] });
  tracker.bindSession("user-a", "user-a");
  tracker.adoptRemote({ exists: true, remoteTables: raw, domTables: upgraded });
  tracker.forceTable("beybladeTable", upgraded.beybladeTable);
  assert.deepEqual(tracker.captureSaveInput(upgraded).matchEvidence.beybladeTable, [fingerprintTable(upgraded.beybladeTable)]);
  const edited = pickCollectionTables({ beybladeTable: [{ cells: ["new"] }, { cells: ["user"] }] });
  const plan = planCollectionCommit({
    latestExists: true, latestData: edited, baseExists: true,
    ...(({ acceptedBases, matchEvidence, localTables, changedTables }) => ({ acceptedBases, matchEvidence, localTables, changedTables }))(tracker.captureSaveInput(edited))
  });
  assert.equal(plan.kind, "conflict", "the same rows made by someone else are not taken as this page's upgrade");
});

test("M11: a commit that landed while the session dropped is recognised after recovery, even with more edits", async () => {
  const { mock, A } = setup({ devices: 1 });
  mock.on("afterCommit", () => { A.deliver({ fromCache: true }); });
  await addPart(A, "第一筆"); await A.settle();
  assert.equal(A.state, STATES.PENDING_UNKNOWN);
  assert.equal(mock.stats.commits, 1);
  A.deliver(); // server answers again: retry recognises its own commit
  await A.settle();
  assert.equal(A.state, STATES.CLEAN);
  assert.equal(mock.stats.commits, 1, "not written twice");
  assert.match(A.effects.status.at(-1)[0], /沒有重複寫入/);

  // Same, but the user adds another row before the retry can run.
  const second = setup({ devices: 1 });
  second.mock.on("afterCommit", () => { second.A.deliver({ fromCache: true }); });
  await addPart(second.A, "第一筆"); await second.A.settle();
  second.A.deliver({ fromCache: true });
  second.A.setOffline(true);
  second.A.deliver(); await second.A.settle(); // retry fails offline; still pending
  await addPart(second.A, "第二筆"); await second.A.settle();
  second.A.setOffline(false);
  second.A.deliver(); await second.A.settle();
  assert.equal(second.A.state, STATES.CLEAN, "builds on its own uncertain commit instead of a false conflict");
  assert.deepEqual(serverParts(second.mock), ["P1-原有", "第一筆", "第二筆"]);
});

test("F-02: a real update back to an older version is shown even if the echo of this page's save was skipped", async () => {
  const { mock, A, B } = setup();
  await addPart(A, "A1"); await A.settle();
  B.deliver();
  await B.edit("partTable", rows => rows.filter(row => row.cells[1] !== "A1")); await B.settle();
  A.deliver(); // A only receives the merged latest state (its own echo was skipped)
  await A.settle();
  assert.deepEqual(serverParts(mock), ["P1-原有"]);
  assert.deepEqual(A.partNames(), ["P1-原有"], "the cloud state replaces the screen after a server check");
  await addPart(A, "A2"); await A.settle();
  assert.equal(A.state, STATES.CLEAN);
  assert.deepEqual(serverParts(mock), ["P1-原有", "A2"], "no false conflict afterwards");
});

test("F-02: a stale snapshot from before this page's save is still ignored after the server check", async () => {
  const { mock, A } = setup({ devices: 1 });
  await addPart(A, "A1"); await A.settle();
  A.deliver({ data: initialDoc() }); // late copy from before the save
  await A.settle();
  assert.deepEqual(A.partNames(), ["P1-原有", "A1"]);
  assert.ok(mock.stats.serverGets >= 1, "decided by a server read, not by device clocks");
  await new Promise(resolve => setTimeout(resolve, 10));
  // The listener can still be behind the server read: another late copy is
  // ignored too, until the listener itself shows the saved rows.
  A.deliver({ data: initialDoc() });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(A.partNames(), ["P1-原有", "A1"]);
  A.deliver(); // the real echo
  assert.deepEqual(A.partNames(), ["P1-原有", "A1"]);
});

test("F-02: a server check that refreshes other tables keeps guarding against late copies", async () => {
  const { mock, A } = setup({ devices: 1 });
  await addPart(A, "A1"); await A.settle();
  mock.externalMerge(PATH_A, { historyTable: [] }); // another device, other table
  A.deliver({ data: initialDoc() }); // lagging listener: copy from before A's save
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(A.tables.historyTable, [], "the server read refreshed the other table");
  assert.deepEqual(A.partNames(), ["P1-原有", "A1"]);
  A.deliver({ data: initialDoc({ historyTable: [] }) }); // still-late listener copy
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(A.partNames(), ["P1-原有", "A1"], "the save is not undone on screen");
});

test("F-02: if the server check keeps failing, the remote copy is applied instead of being hidden for good", async () => {
  const { mock, A, B } = setup();
  await addPart(A, "A1"); await A.settle();
  B.deliver();
  await B.edit("partTable", rows => rows.filter(row => row.cells[1] !== "A1")); await B.settle();
  A.setServerReadsFail(true);
  A.deliver();
  await A.settle();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(A.partNames(), ["P1-原有"], "bounded: shown after the retries run out");
  assert.equal(mock.stats.commits, 2, "nothing is written by the fallback");
});

test("F-02: snapshots skipping intermediate versions around a save end on the real cloud state", async () => {
  const { mock, A } = setup({ devices: 1 });
  mock.on("beforeCommit", () => {
    mock.externalMerge(PATH_A, { historyTable: [] }); // another device, other table
    A.deliver(); // pre-commit copy arrives while saving: held
  });
  await addPart(A, "A1"); await A.settle();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(A.partNames(), ["P1-原有", "A1"], "the held pre-commit copy does not undo the save");
  assert.deepEqual(A.tables.historyTable, [], "the other table's change is shown");
  // Another device removes A1 again; A's echo of its own save is skipped.
  mock.externalMerge(PATH_A, { partTable: [partRow("P1-原有")] });
  A.deliver();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(A.partNames(), ["P1-原有"], "not hidden as a stale copy");
  assert.equal(A.state, STATES.CLEAN);
});

test("F-03: switching the admin view asks first when this page has unsaved changes", async () => {
  const { mock, A } = setup({ devices: 1, admin: true });
  A.setOffline(true);
  await addPart(A, "未儲存"); await A.settle();
  assert.equal(A.state, STATES.PENDING_NETWORK);
  A.setConfirm(false);
  A.adminView("other-user");
  assert.match(A.effects.confirms.at(-1), /尚未儲存/);
  assert.equal(A.guard.snapshot().targetUid, "user-a", "cancel keeps the session");
  assert.deepEqual(A.partNames(), ["P1-原有", "未儲存"], "cancel keeps the draft");
  assert.equal(A.state, STATES.PENDING_NETWORK);
  A.setConfirm(true);
  A.adminView("other-user");
  assert.equal(A.guard.snapshot().targetUid, "other-user");
  assert.equal(A.guard.snapshot().readOnly, true);
  assert.equal(mock.stats.commits, 0);
});

test("F-03: a save in flight when the admin switches view is not reported as saved", async () => {
  const { mock, A } = setup({ devices: 1, admin: true });
  const hold = deferred();
  mock.on("beforeGet", () => hold.promise);
  const pending = addPart(A, "儲存中");
  await new Promise(resolve => setTimeout(resolve, 0));
  A.adminView("other-user"); // confirm answers yes
  hold.resolve();
  await pending; await A.settle();
  assert.equal(mock.stats.commits, 0);
  assert.ok(!A.effects.status.some(([text]) => /^已儲存/.test(text)), "never shows 已儲存");
  assert.equal(A.state, STATES.CLEAN, "the new (read-only) view starts clean");
});

test("F-03: no prompt when there is nothing unsaved", async () => {
  const { A } = setup({ devices: 1, admin: true });
  A.adminView("other-user");
  assert.equal(A.effects.confirms.length, 0);
  assert.equal(A.guard.snapshot().targetUid, "other-user");
});
