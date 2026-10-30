import assert from "node:assert/strict";
import test from "node:test";
import {
  TOURNAMENT_OPERATION_TYPES as T,
  TOURNAMENT_SYNC_CODES as C,
  TOURNAMENT_SYNC_MESSAGES,
  TOURNAMENT_APPLIED as APPLIED,
  TournamentSyncError,
  applyTournamentOperation,
  classifyTournamentSaveFailure,
  createTournamentOperation,
  isTournamentCommitUnresolved,
  isTournamentOperationApplied,
  readTournamentRecordsField,
  startTournamentTransaction,
  waitForTournamentTransaction
} from "../tournament-sync.js";
import { createMockFirestore, createRunner, deferred, firestoreError, userDocPath } from "./helpers/mock-firestore.mjs";

const json = value => JSON.parse(JSON.stringify(value));

function tournament(id, extra = {}) {
  return {
    id,
    tournamentName: `比賽 ${id}`,
    date: "2026-10-29",
    location: "台北",
    participantCount: 16,
    rank: "",
    note: "",
    isFinished: false,
    matches: [],
    ...extra
  };
}

function withMatch(id, matchId, rounds = []) {
  return tournament(id, {
    matches: [{ id: matchId, opponentName: "對手", deck: [{ source: "custom", configText: "A" }], rounds }]
  });
}

function round(id, roundNumber) {
  return { id, roundNumber, result: "win", scoreType: "spin", point: 1, myBeyblade: "A", note: "" };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof TournamentSyncError && error.code === code);
}

const add = record => createTournamentOperation({ type: T.ADD_TOURNAMENT, tournamentId: record.id, record, updatedAt: 10 });
const update = (base, patch) => createTournamentOperation({ type: T.UPDATE_TOURNAMENT, tournamentId: base.id, base, patch, updatedAt: 10 });
const remove = base => createTournamentOperation({ type: T.DELETE_TOURNAMENT, tournamentId: base.id, base, updatedAt: 10 });
const addMatch = (base, match) => createTournamentOperation({ type: T.ADD_MATCH, tournamentId: base.id, base, match, updatedAt: 10 });
const editMatch = (base, matchId, patch) => createTournamentOperation({ type: T.EDIT_MATCH, tournamentId: base.id, base, matchId, patch, updatedAt: 10 });
const deleteMatch = (base, matchId) => createTournamentOperation({ type: T.DELETE_MATCH, tournamentId: base.id, base, matchId, updatedAt: 10 });
const addRound = (base, matchId, roundValue) => createTournamentOperation({ type: T.ADD_ROUND, tournamentId: base.id, base, matchId, round: roundValue, updatedAt: 10 });
const deleteRound = (base, matchId, roundId) => createTournamentOperation({ type: T.DELETE_ROUND, tournamentId: base.id, base, matchId, roundId, updatedAt: 10 });

// ---------------------------------------------------------------------------
// A. Pure operation rules
// ---------------------------------------------------------------------------

test("two different tournaments added from stale copies are both kept", () => {
  const latestAfterA = applyTournamentOperation([], add(tournament("a"))).records;
  const result = applyTournamentOperation(latestAfterA, add(tournament("b")));
  assert.deepEqual(result.records.map(record => record.id), ["a", "b"]);
});

test("edits to different tournaments from the same stale copy are both kept", () => {
  const base = [tournament("a"), tournament("b")];
  const afterA = applyTournamentOperation(base, update(base[0], { tournamentName: "A 改" })).records;
  const afterB = applyTournamentOperation(afterA, update(base[1], { location: "高雄" })).records;
  assert.equal(afterB[0].tournamentName, "A 改");
  assert.equal(afterB[1].location, "高雄");
});

test("a second edit of the same tournament from a stale copy is rejected", () => {
  const base = [tournament("a")];
  const afterA = applyTournamentOperation(base, update(base[0], { tournamentName: "A 改" })).records;
  expectCode(() => applyTournamentOperation(afterA, update(base[0], { note: "B 的備註" })), C.CONFLICT);
});

test("changes to different matches of the same tournament still conflict (D-017 rule 4)", () => {
  const base = tournament("a", {
    matches: [
      { id: "m1", opponentName: "甲", deck: [], rounds: [] },
      { id: "m2", opponentName: "乙", deck: [], rounds: [] }
    ]
  });
  const afterA = applyTournamentOperation([base], editMatch(base, "m1", { opponentName: "甲改" })).records;
  expectCode(() => applyTournamentOperation(afterA, editMatch(base, "m2", { opponentName: "乙改" })), C.CONFLICT);
  expectCode(() => applyTournamentOperation(afterA, addRound(base, "m2", { id: "r1", result: "win" })), C.CONFLICT);
});

test("editing a tournament that was deleted elsewhere is reported as deleted", () => {
  const base = tournament("a");
  expectCode(() => applyTournamentOperation([], update(base, { note: "x" })), C.DELETED);
  expectCode(() => applyTournamentOperation([], addMatch(base, { id: "m1" })), C.DELETED);
});

test("deleting a tournament that changed elsewhere is refused", () => {
  const base = tournament("a");
  const changed = [{ ...base, note: "其他裝置的變更" }];
  expectCode(() => applyTournamentOperation(changed, remove(base)), C.DELETE_CONFLICT);
});

test("deleting an unchanged tournament removes only that record", () => {
  const base = [tournament("a"), tournament("b")];
  const result = applyTournamentOperation(base, remove(base[0]));
  assert.deepEqual(result.records.map(record => record.id), ["b"]);
  assert.equal(result.changed, true);
});

test("deleting a tournament that is already gone is an idempotent success", () => {
  const result = applyTournamentOperation([tournament("b")], remove(tournament("a")));
  assert.equal(result.changed, false);
  assert.deepEqual(result.records.map(record => record.id), ["b"]);
});

test("a duplicated tournament id is never modified", () => {
  const latest = [tournament("a"), tournament("a", { note: "copy" })];
  expectCode(() => applyTournamentOperation(latest, update(latest[0], { note: "x" })), C.DUPLICATE_ID);
  expectCode(() => applyTournamentOperation(latest, remove(latest[0])), C.DUPLICATE_ID);
  expectCode(() => applyTournamentOperation(latest, add(tournament("a"))), C.DUPLICATE_ID);
});

test("re-applying an add that already reached the server does not duplicate it", () => {
  const record = tournament("a");
  const first = applyTournamentOperation([], add(record));
  const second = applyTournamentOperation(first.records, add(record));
  assert.equal(second.changed, false);
  assert.equal(second.applied, APPLIED.IDENTITY);
  assert.equal(second.records.length, 1);
  // L5: edited elsewhere since then; the id still proves this add is saved,
  // so no second tournament is created.
  const edited = applyTournamentOperation([{ ...record, note: "其他裝置改過" }], add(record));
  assert.equal(edited.changed, false);
  assert.equal(edited.applied, APPLIED.IDENTITY);
  assert.equal(edited.records[0].note, "其他裝置改過");
});

test("legacy records without ids, matches or participantCount are preserved untouched", () => {
  const legacy = { tournamentName: "舊比賽", rank: "第 3 名" };
  const legacyNoMatches = { id: "old", tournamentName: "舊", rank: "冠軍" };
  const latest = [legacy, legacyNoMatches];
  const result = applyTournamentOperation(latest, addMatch(legacyNoMatches, { id: "m1", opponentName: "x", deck: [], rounds: [] }));
  assert.equal(result.records[0], legacy, "untouched records keep their object reference");
  assert.equal(result.records[1].rank, "冠軍");
  assert.equal(result.records[1].matches.length, 1);
  assert.equal(applyTournamentOperation(result.records, add(tournament("new"))).records[0], legacy);
});

test("rounds are numbered from the latest copy and renumbered after a delete", () => {
  const base = withMatch("a", "m1", [round("r1", 1), round("r2", 2), round("r3", 3)]);
  const added = applyTournamentOperation([base], addRound(base, "m1", { id: "r4", roundNumber: 99, result: "lose" })).record;
  assert.deepEqual(added.matches[0].rounds.map(item => item.roundNumber), [1, 2, 3, 4]);

  const deleted = applyTournamentOperation([base], deleteRound(base, "m1", "r2")).record;
  assert.deepEqual(deleted.matches[0].rounds.map(item => [item.id, item.roundNumber]), [["r1", 1], ["r3", 2]]);
});

test("match edits, match deletes and direct advances only touch the target match", () => {
  const base = tournament("a", {
    matches: [
      { id: "m1", opponentName: "甲", deck: [], rounds: [round("r1", 1)] },
      { id: "m2", opponentName: "乙", deck: [], rounds: [] }
    ]
  });
  const edited = applyTournamentOperation([base], editMatch(base, "m1", { opponentName: "甲改", deck: [{ configText: "B" }] })).record;
  assert.equal(edited.matches[0].opponentName, "甲改");
  assert.equal(edited.matches[0].rounds.length, 1, "rounds are not replaced by a match edit");
  assert.equal(edited.matches[1], base.matches[1]);

  const deleted = applyTournamentOperation([base], deleteMatch(base, "m1")).record;
  assert.deepEqual(deleted.matches.map(item => item.id), ["m2"]);

  const advanced = applyTournamentOperation([base], addMatch(base, { id: "m3", advancementType: "bye", opponentName: "輪空", deck: [], rounds: [] })).record;
  assert.equal(advanced.matches.at(-1).advancementType, "bye");
  expectCode(() => applyTournamentOperation([base], editMatch(base, "missing", { opponentName: "x" })), C.INVALID);
});

test("other tournaments are left exactly as they were", () => {
  const other = tournament("b", { matches: [{ id: "x", rounds: [round("r", 1)] }] });
  const target = tournament("a");
  const latest = [other, target, tournament("c")];
  for (const operation of [
    update(target, { tournamentName: "改" }),
    addMatch(target, { id: "m1", deck: [], rounds: [] }),
    remove(target)
  ]) {
    const result = applyTournamentOperation(latest, operation);
    assert.equal(result.records.find(record => record.id === "b"), other);
    assert.equal(result.records.find(record => record.id === "c"), latest[2]);
  }
});

test("the input array, its records and the operation are never mutated", () => {
  const base = withMatch("a", "m1", [round("r1", 1)]);
  const latest = [base, tournament("b")];
  const before = json(latest);
  const operations = [
    update(base, { note: "x" }), remove(base), addMatch(base, { id: "m2" }),
    editMatch(base, "m1", { opponentName: "y" }), deleteMatch(base, "m1"),
    addRound(base, "m1", { id: "r2" }), deleteRound(base, "m1", "r1")
  ];
  operations.forEach(operation => {
    const snapshot = json(operation);
    applyTournamentOperation(latest, operation);
    assert.deepEqual(json(operation), snapshot);
    assert.ok(Object.isFrozen(operation));
  });
  assert.deepEqual(json(latest), before);
});

test("operations copy their inputs so later UI edits cannot change them", () => {
  const base = tournament("a");
  const patch = { note: "原本" };
  const operation = update(base, patch);
  patch.note = "被改掉";
  base.note = "記憶體被改";
  assert.equal(operation.patch.note, "原本");
  assert.equal(operation.base.note, "");
  expectCode(() => createTournamentOperation({ type: T.UPDATE_TOURNAMENT, tournamentId: "a", base, patch: { matches: [] } }), C.INVALID);
  expectCode(() => createTournamentOperation({ type: "nope", tournamentId: "a" }), C.INVALID);
});

test("a non-array tournamentRecords field is refused instead of overwritten", () => {
  assert.deepEqual(readTournamentRecordsField({}), []);
  assert.deepEqual(readTournamentRecordsField(null), []);
  expectCode(() => readTournamentRecordsField({ tournamentRecords: { a: 1 } }), C.MALFORMED);
});

test("isTournamentOperationApplied separates proof by id from matching content", () => {
  const base = withMatch("a", "m1", [round("r1", 1)]);
  const cases = [
    [add(tournament("z")), "committed"], [addMatch(base, { id: "m2" }), "committed"], [addRound(base, "m1", { id: "r2" }), "committed"],
    [update(base, { note: "n" }), "matches"], [editMatch(base, "m1", { opponentName: "y" }), "matches"],
    [remove(base), "matches"], [deleteMatch(base, "m1"), "matches"], [deleteRound(base, "m1", "r1"), "matches"]
  ];
  cases.forEach(([operation, expected]) => {
    const before = [base];
    assert.equal(isTournamentOperationApplied(before, operation), false, `${operation.type} before`);
    const after = applyTournamentOperation(before, operation).records;
    assert.equal(isTournamentOperationApplied(after, operation), expected, `${operation.type} after`);
  });
});

test("failures are classified without exposing Firebase details", () => {
  assert.equal(classifyTournamentSaveFailure(new TournamentSyncError(C.CONFLICT)), C.CONFLICT);
  assert.equal(classifyTournamentSaveFailure(firestoreError("permission-denied")), C.PERMISSION);
  assert.equal(classifyTournamentSaveFailure(firestoreError("unavailable"), { uncertainCommit: false }), C.NETWORK);
  assert.equal(classifyTournamentSaveFailure(firestoreError("unavailable"), { uncertainCommit: true }), C.UNKNOWN_OUTCOME);
  // After a commit with an unknown result even a conflict cannot prove "not saved".
  assert.equal(classifyTournamentSaveFailure(new TournamentSyncError(C.CONFLICT), { uncertainCommit: true }), C.UNKNOWN_OUTCOME);
  assert.equal(classifyTournamentSaveFailure(new TournamentSyncError(C.SESSION_CHANGED), { uncertainCommit: true }), C.SESSION_CHANGED);
  assert.equal(isTournamentCommitUnresolved({ commitInFlight: true }), true);
  assert.equal(isTournamentCommitUnresolved({ uncertainCommit: false, commitInFlight: false }), false);
  Object.values(TOURNAMENT_SYNC_MESSAGES).forEach(message => {
    assert.doesNotMatch(message, /uid|token|firebase|firestore|permission-denied/i);
  });
  assert.equal(TOURNAMENT_SYNC_MESSAGES[C.CONFLICT], "這場賽事已在其他分頁或裝置更新，你這次的變更沒有儲存。請確認最新資料後重新操作。");
  assert.equal(TOURNAMENT_SYNC_MESSAGES[C.DELETED], "這場賽事已在其他地方刪除，這次的變更沒有儲存。");
  assert.equal(TOURNAMENT_SYNC_MESSAGES[C.DELETE_CONFLICT], "這場賽事有新的變更，為避免遺失資料，本次沒有刪除。");
  assert.equal(TOURNAMENT_SYNC_MESSAGES[C.NETWORK], "目前無法完成儲存，請確認網路連線。你的輸入內容已保留。");
  assert.equal(TOURNAMENT_SYNC_MESSAGES[C.UNKNOWN_OUTCOME], "無法確認這次操作是否已儲存，請先重新確認最新資料，避免重複新增。");
});

// ---------------------------------------------------------------------------
// B. Transactions against an optimistic-concurrency Firestore mock
// ---------------------------------------------------------------------------

const PATH = userDocPath("account-a");
const OTHER_FIELDS = {
  beybladeTable: [{ cells: ["UX-01"] }],
  partTable: [{ cells: ["1-60"] }],
  configTable: [{ cells: ["BX-01"] }],
  historyTable: [{ model: "BX-01" }],
  ownerUid: "account-a"
};

function seeded(records, extra = {}) {
  const mock = createMockFirestore();
  mock.seed(PATH, { ...OTHER_FIELDS, tournamentRecords: records, updatedAt: 5, ...extra });
  return mock;
}

function start(mock, operation, canContinue = () => true) {
  return startTournamentTransaction({ operation, runTransaction: createRunner(mock, PATH), canContinue, retryDelaysMs: [0] });
}

test("a stale add retries inside the transaction and keeps the other tab's new tournament", async () => {
  const mock = seeded([]);
  // Tab B commits its add between tab A's read and tab A's commit.
  mock.on("beforeCommit", async () => {
    await start(mock, add(tournament("from-b"))).promise;
  });
  const handle = start(mock, add(tournament("from-a")));
  const result = await handle.promise;

  assert.equal(handle.progress.attempts, 2, "tab A's callback ran again on the latest copy");
  assert.deepEqual(mock.read(PATH).tournamentRecords.map(record => record.id).sort(), ["from-a", "from-b"]);
  assert.deepEqual(result.records.map(record => record.id).sort(), ["from-a", "from-b"]);
});

test("a stale edit of a different tournament keeps the other tab's edit", async () => {
  const base = [tournament("a"), tournament("b")];
  const mock = seeded(base);
  mock.on("beforeCommit", async () => {
    await start(mock, update(base[1], { note: "B 分頁" })).promise;
  });
  await start(mock, update(base[0], { note: "A 分頁" })).promise;
  const saved = mock.read(PATH).tournamentRecords;
  assert.equal(saved[0].note, "A 分頁");
  assert.equal(saved[1].note, "B 分頁");
});

test("a stale edit of the same tournament is rejected and does not overwrite", async () => {
  const base = [tournament("a")];
  const mock = seeded(base);
  mock.on("beforeCommit", async () => {
    await start(mock, update(base[0], { note: "先存的" })).promise;
  });
  await assert.rejects(start(mock, update(base[0], { note: "後存的" })).promise, error => error.code === C.CONFLICT);
  assert.equal(mock.read(PATH).tournamentRecords[0].note, "先存的");
});

test("delete versus edit: whichever commits first wins and the other is refused", async () => {
  const base = [tournament("a")];
  const deleteFirst = seeded(base);
  deleteFirst.on("beforeCommit", async () => { await start(deleteFirst, remove(base[0])).promise; });
  await assert.rejects(start(deleteFirst, update(base[0], { note: "x" })).promise, error => error.code === C.DELETED);
  assert.equal(deleteFirst.read(PATH).tournamentRecords.length, 0);

  const editFirst = seeded(base);
  editFirst.on("beforeCommit", async () => { await start(editFirst, update(base[0], { note: "新變更" })).promise; });
  await assert.rejects(start(editFirst, remove(base[0])).promise, error => error.code === C.DELETE_CONFLICT);
  assert.equal(editFirst.read(PATH).tournamentRecords[0].note, "新變更");
});

test("two tabs deleting the same tournament both succeed with one write", async () => {
  const base = [tournament("a"), tournament("b")];
  const mock = seeded(base);
  mock.on("beforeCommit", async () => { await start(mock, remove(base[0])).promise; });
  const second = await start(mock, remove(base[0])).promise;
  assert.equal(second.changed, false);
  assert.deepEqual(mock.read(PATH).tournamentRecords.map(record => record.id), ["b"]);
  assert.equal(mock.stats.commits, 1);
});

test("retries reuse the id chosen before the transaction", async () => {
  const mock = seeded([]);
  let ids = 0;
  const makeId = () => `tournament_${++ids}`;
  const record = tournament(makeId());
  mock.on("beforeCommit", () => mock.externalMerge(PATH, { beybladeTable: [] }));
  mock.on("beforeCommit", () => mock.externalMerge(PATH, { partTable: [] }));
  const handle = start(mock, add(record));
  await handle.promise;
  assert.equal(handle.progress.attempts, 3);
  assert.equal(ids, 1);
  assert.deepEqual(mock.read(PATH).tournamentRecords.map(item => item.id), ["tournament_1"]);
});

test("a tournament transaction never writes collection, inventory, config or history fields", async () => {
  const mock = seeded([tournament("a")]);
  // The main page saves the collection while the tournament transaction runs.
  mock.on("beforeCommit", () => mock.externalMerge(PATH, { beybladeTable: [{ cells: ["NEW"] }], updatedAt: 50 }));
  await start(mock, update(tournament("a"), { note: "x" })).promise;
  const saved = mock.read(PATH);
  assert.deepEqual(saved.beybladeTable, [{ cells: ["NEW"] }]);
  assert.deepEqual(saved.partTable, OTHER_FIELDS.partTable);
  assert.deepEqual(saved.configTable, OTHER_FIELDS.configTable);
  assert.deepEqual(saved.historyTable, OTHER_FIELDS.historyTable);
  mock.commitLog.flat().forEach(write => {
    assert.equal(write.kind, "update");
    assert.deepEqual(Object.keys(write.fields).sort(), ["tournamentRecords", "updatedAt"]);
  });
  assert.equal(saved.updatedAt, 51, "updatedAt only moves forward and is derived deterministically");
});

test("a missing document is created only by a transaction that saw it missing", async () => {
  const mock = createMockFirestore();
  mock.on("beforeCommit", () => mock.seed(PATH, { ...OTHER_FIELDS, tournamentRecords: [tournament("main-page")] }));
  await start(mock, add(tournament("a"))).promise;
  const saved = mock.read(PATH);
  assert.deepEqual(saved.tournamentRecords.map(record => record.id), ["main-page", "a"]);
  assert.deepEqual(saved.beybladeTable, OTHER_FIELDS.beybladeTable, "the second attempt updated instead of creating");
  assert.equal(mock.commitLog.length, 1);
  assert.equal(mock.commitLog[0][0].kind, "update");

  const empty = createMockFirestore();
  await start(empty, add(tournament("first"))).promise;
  assert.equal(empty.commitLog[0][0].kind, "set");
  assert.deepEqual(Object.keys(empty.read(PATH)).sort(), ["tournamentRecords", "updatedAt"]);
});

test("a malformed tournamentRecords field stops the transaction without writing", async () => {
  const mock = seeded({ legacy: true });
  await assert.rejects(start(mock, add(tournament("a"))).promise, error => error.code === C.MALFORMED);
  assert.equal(mock.stats.commits, 0);
  assert.deepEqual(mock.read(PATH).tournamentRecords, { legacy: true });
});

test("the callback stops before reading and before staging when the session ends", async () => {
  const mock = seeded([]);
  await assert.rejects(start(mock, add(tournament("a")), () => false).promise, error => error.code === C.SESSION_CHANGED);

  let current = true;
  mock.on("beforeGet", () => { current = false; });
  await assert.rejects(start(mock, add(tournament("b")), () => current).promise, error => error.code === C.SESSION_CHANGED);

  let retryAllowed = true;
  mock.on("beforeCommit", () => {
    mock.externalMerge(PATH, { partTable: [] });
    retryAllowed = false;
  });
  await assert.rejects(start(mock, add(tournament("c")), () => retryAllowed).promise, error => error.code === C.SESSION_CHANGED);
  assert.equal(mock.stats.commits, 0);
  assert.deepEqual(mock.read(PATH).tournamentRecords, []);
});

test("rejected, lost and never-sent commits are told apart", async () => {
  // A single dropped read is retried and then succeeds.
  const flakyRead = seeded([]);
  flakyRead.on("beforeGet", () => { throw firestoreError("unavailable"); });
  const handleA = start(flakyRead, add(tournament("a")));
  assert.equal((await handleA.promise).applied, APPLIED.WRITTEN);
  assert.equal(handleA.progress.uncertainCommit, false);

  // A lasting outage before anything was staged: definitely not saved.
  const offline = seeded([]);
  offline.setOnline(false);
  const handleB = start(offline, add(tournament("b")));
  const errorB = await handleB.promise.catch(error => error);
  assert.equal(handleB.progress.attempts, 5);
  assert.equal(classifyTournamentSaveFailure(errorB, handleB.progress), C.NETWORK);

  // The commit landed and only the acknowledgement was lost: the retry finds
  // the operation's own id and writes nothing again.
  const lostAck = seeded([]);
  lostAck.on("afterCommit", () => { throw firestoreError("unavailable"); });
  const handleC = start(lostAck, add(tournament("c")));
  const valueC = await handleC.promise;
  assert.equal(valueC.applied, APPLIED.IDENTITY);
  assert.equal(handleC.progress.uncertainCommit, true);
  assert.equal(lostAck.stats.commits, 1);

  // The commit was lost before reaching the server and the outage continues.
  const dropped = seeded([]);
  dropped.on("beforeCommit", () => dropped.setOnline(false));
  const handleD = start(dropped, add(tournament("d")));
  const errorD = await handleD.promise.catch(error => error);
  assert.equal(classifyTournamentSaveFailure(errorD, handleD.progress), C.UNKNOWN_OUTCOME);
  assert.equal(dropped.read(PATH).tournamentRecords.length, 0);

  // A version conflict on commit is a rejection, never "unclear".
  const contended = seeded([tournament("e")]);
  contended.on("beforeCommit", () => contended.externalMerge(PATH, { tournamentRecords: [tournament("e", { note: "其他裝置" })] }));
  const handleE = start(contended, update(tournament("e"), { note: "我的" }));
  const errorE = await handleE.promise.catch(error => error);
  assert.equal(handleE.progress.uncertainCommit, false);
  assert.equal(classifyTournamentSaveFailure(errorE, handleE.progress), C.CONFLICT);
});

test("waiting for a transaction times out without cancelling it", async () => {
  const gate = deferred();
  const mock = seeded([]);
  mock.on("beforeCommit", () => gate.promise);
  const handle = start(mock, add(tournament("slow")));
  const outcome = await waitForTournamentTransaction(handle, { timeoutMs: 20 });
  assert.equal(outcome.kind, "timeout");
  gate.resolve();
  await handle.promise;
  assert.equal(mock.read(PATH).tournamentRecords.length, 1);

  const quick = await waitForTournamentTransaction(start(seeded([]), add(tournament("q"))), { timeoutMs: 1000 });
  assert.equal(quick.kind, "settled");
});
