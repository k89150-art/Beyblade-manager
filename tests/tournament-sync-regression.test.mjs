// Phase 4B-1 regression tests for the Phase 4C review findings (H1, M1, M2,
// L2, L4, L5). Everything runs against the in-memory mock; see
// tests/helpers/mock-firestore.mjs for what it does and does not model.
import assert from "node:assert/strict";
import test from "node:test";
import {
  TOURNAMENT_APPLIED as APPLIED,
  TOURNAMENT_OPERATION_TYPES as T,
  TOURNAMENT_SYNC_CODES as C,
  TOURNAMENT_SYNC_MESSAGES as MSG,
  TournamentSyncError,
  applyTournamentOperation,
  createTournamentOperation
} from "../tournament-sync.js";
import { createMockFirestore, deferred, firestoreError, userDocPath } from "./helpers/mock-firestore.mjs";
import { createTournamentPage, setMatchForm, setRoundForm, waitFor } from "./helpers/tournament-page-harness.mjs";

const A = userDocPath("account-a");
const SAVED = "參賽紀錄已儲存";
const SAVED_IDENTITY = "參賽紀錄已儲存（先前中斷的儲存其實已完成，沒有重複新增）";
const SAVED_STATE_MATCH = "雲端資料已是這次要儲存的內容，沒有重複寫入";
const SAVED_ABSENT = "這筆資料已不存在，不需要再刪除";
const VERIFIED_MATCHES = "雲端資料已包含這次的變更內容（無法確認是否由這次操作寫入）";
const NOT_SAVED_MESSAGES = [MSG[C.CONFLICT], MSG[C.DELETED], MSG[C.DELETE_CONFLICT], MSG[C.NETWORK]];
const DECK = ["A", "B", "C"].map(configText => ({ source: "custom", configText }));

function tournament(id, extra = {}) {
  return {
    id, tournamentName: `比賽 ${id}`, date: "2026-10-29", location: "台北", participantCount: 16,
    rank: "", note: "", isFinished: false, matches: [], ...extra
  };
}

function withRounds() {
  return tournament("t1", {
    matches: [
      { id: "m1", opponentName: "甲", deck: DECK, rounds: [
        { id: "r1", roundNumber: 1, result: "win", scoreType: "spin", point: 1, myBeyblade: "A", note: "" },
        { id: "r2", roundNumber: 2, result: "lose", scoreType: "over", point: 2, myBeyblade: "B", note: "" }
      ] },
      { id: "m2", opponentName: "乙", deck: DECK, rounds: [] }
    ]
  });
}

async function openPage(records, options = {}) {
  const mock = createMockFirestore();
  mock.seed(A, { beybladeTable: [{ cells: ["UX-01"] }], tournamentRecords: records, updatedAt: 1 });
  const page = await createTournamentPage({ mock, saveTimeoutMs: 60, verifyTimeoutMs: 60, slowNoticeMs: 20, ...options });
  await page.signIn("account-a");
  return { mock, page };
}

const server = mock => mock.read(A).tournamentRecords;
const formValues = page => ["tournamentDate", "tournamentName", "tournamentLocation", "tournamentParticipantCount", "tournamentNote"]
  .map(id => page.elements[id].value);
const FORM = { tournamentDate: "2026-11-01", tournamentName: "新比賽", tournamentLocation: "台中", tournamentParticipantCount: "8", tournamentNote: "" };

// ---------------------------------------------------------------------------
// M2: the mock follows the SDK 11.2.0 retry rules (TransactionRunner)
// ---------------------------------------------------------------------------

test("mock: SDK-default transactions retry only retryable FirebaseErrors", async () => {
  const mock = createMockFirestore();
  mock.seed(A, { n: 1 });
  const ref = { path: A };

  let runs = 0;
  await mock.runTransaction(null, async tx => {
    runs += 1;
    if (runs === 1) throw firestoreError("unavailable");
    await tx.get(ref);
  });
  assert.equal(runs, 2, "a rejected promise with a retryable FirebaseError is retried");

  runs = 0;
  await assert.rejects(mock.runTransaction(null, async () => { runs += 1; throw new Error("app error"); }), /app error/);
  assert.equal(runs, 1, "non-Firebase errors are never retried");

  runs = 0;
  await assert.rejects(mock.runTransaction(null, () => { runs += 1; throw firestoreError("unavailable"); }));
  assert.equal(runs, 1, "a synchronous throw is not retried");

  runs = 0;
  await assert.rejects(mock.runTransaction(null, async () => { runs += 1; throw firestoreError("permission-denied"); }));
  assert.equal(runs, 1, "permanent codes are not retried");

  runs = 0;
  mock.on("beforeCommit", () => mock.externalMerge(A, { n: 2 }));
  await mock.runTransaction(null, async tx => { runs += 1; const snap = await tx.get(ref); tx.update(ref, { n: snap.data().n + 10 }); });
  assert.equal(runs, 2, "a stale commit fails its precondition and the SDK retries");
  assert.equal(mock.read(A).n, 12);

  runs = 0;
  mock.on("afterCommit", () => { throw firestoreError("unavailable"); });
  await mock.runTransaction(null, async tx => { runs += 1; const snap = await tx.get(ref); tx.update(ref, { n: snap.data().n + 1 }); });
  assert.equal(runs, 2);
  assert.equal(mock.read(A).n, 14, "SDK-default retry after a lost acknowledgement applies a counter twice");

  runs = 0;
  mock.setOnline(false);
  await assert.rejects(mock.runTransaction(null, async tx => { runs += 1; await tx.get(ref); }), error => error.code === "unavailable");
  assert.equal(runs, 5, "maxAttempts defaults to 5");
  mock.setOnline(true);

  runs = 0;
  await assert.rejects(mock.runTransaction(null, async () => { runs += 1; throw firestoreError("unavailable"); }, { maxAttempts: 1 }));
  assert.equal(runs, 1, "maxAttempts: 1 runs one attempt and returns the raw error");
});

// ---------------------------------------------------------------------------
// H1: a lost acknowledgement is recognised and never reported as "not saved"
// ---------------------------------------------------------------------------

const LOST_ACK_CASES = [
  {
    name: "addMatch",
    run: async page => { setMatchForm(page, "t1", { opponent: "丙", deck: ["X", "Y", "Z"] }); await page.window.addMatch("t1"); },
    status: SAVED_IDENTITY,
    check: t => assert.equal(t.matches.length, 3)
  },
  {
    name: "addDirectAdvance",
    run: page => page.window.addDirectAdvance("t1", "bye"),
    status: SAVED_IDENTITY,
    check: t => assert.equal(t.matches.filter(match => match.advancementType === "bye").length, 1)
  },
  {
    name: "addRound",
    run: async page => { setRoundForm(page, "m1", { beyblade: "C", scoreType: "extreme" }); await page.window.addRound("t1", "m1"); },
    status: SAVED_IDENTITY,
    check: t => assert.deepEqual(t.matches[0].rounds.map(round => round.roundNumber), [1, 2, 3])
  },
  {
    name: "editMatch",
    run: async page => { page.queuePrompts("甲改", "A", "B", "C"); await page.window.editMatch("t1", "m1"); },
    status: SAVED_STATE_MATCH,
    check: t => assert.equal(t.matches[0].opponentName, "甲改")
  },
  {
    name: "finishTournament",
    run: page => page.window.finishTournament("t1"),
    status: SAVED_STATE_MATCH,
    check: t => assert.equal(t.isFinished, true)
  },
  {
    name: "editTournament",
    run: async page => { page.useEditDialog({ tournamentName: "改名", date: "2026-11-02", location: "", participantCount: 8, note: "" }); await page.window.editTournament("t1"); },
    status: SAVED_STATE_MATCH,
    check: t => assert.equal(t.tournamentName, "改名")
  },
  {
    name: "deleteMatch",
    run: page => page.window.deleteMatch("t1", "m2"),
    status: SAVED_STATE_MATCH,
    check: t => assert.deepEqual(t.matches.map(match => match.id), ["m1"])
  },
  {
    name: "deleteRound",
    run: page => page.window.deleteRound("t1", "m1", "r1"),
    status: SAVED_STATE_MATCH,
    check: t => assert.deepEqual(t.matches[0].rounds.map(round => [round.id, round.roundNumber]), [["r2", 1]])
  },
  {
    name: "deleteTournament",
    run: page => page.window.deleteTournament("t1"),
    status: SAVED_ABSENT,
    check: (t, mock) => assert.deepEqual(server(mock), [])
  }
];

for (const testCase of LOST_ACK_CASES) {
  test(`H1 ${testCase.name}: commit landed, acknowledgement lost -> no false "not saved", no duplicate`, async () => {
    const { mock, page } = await openPage([withRounds()]);
    mock.on("afterCommit", () => { throw firestoreError("unavailable"); });
    await testCase.run(page);

    assert.equal(mock.stats.commits, 1, "written exactly once");
    assert.equal(page.alerts.filter(message => NOT_SAVED_MESSAGES.includes(message)).length, 0);
    assert.equal(page.lastStatus().text, testCase.status);
    testCase.check(server(mock)[0], mock);
  });
}

test("H1: SDK-default retries would have duplicated a round; single-attempt transactions do not", async () => {
  // Reference: the phase 4B code relied on the SDK's own retry and showed
  // "not saved" here, inviting a second press.
  const { mock, page } = await openPage([withRounds()]);
  setRoundForm(page, "m1", { beyblade: "C" });
  mock.on("afterCommit", () => { throw firestoreError("unavailable"); });
  await page.window.addRound("t1", "m1");
  assert.equal(page.alerts.length, 0);
  assert.ok(mock.stats.transactions >= 2);
  assert.equal(mock.stats.sdkRetries, 0, "the SDK itself never retries (maxAttempts: 1)");
  assert.equal(server(mock)[0].matches[0].rounds.length, 3);
});

test("H1: lost acknowledgement while another device edits the same tournament", async () => {
  // Adds are still proven by their own id.
  const adds = await openPage([withRounds()]);
  setRoundForm(adds.page, "m1", { beyblade: "C" });
  adds.mock.on("afterCommit", () => {
    const records = server(adds.mock);
    records[0].note = "其他裝置";
    adds.mock.externalMerge(A, { tournamentRecords: records });
    throw firestoreError("unavailable");
  });
  await adds.page.window.addRound("t1", "m1");
  assert.equal(adds.page.lastStatus().text, SAVED_IDENTITY);
  assert.equal(server(adds.mock)[0].matches[0].rounds.length, 3);
  assert.equal(server(adds.mock)[0].note, "其他裝置");

  // An update cannot be attributed: unclear, then the re-read shows the
  // intended values without claiming this action wrote them.
  const edits = await openPage([withRounds()]);
  edits.mock.on("afterCommit", () => {
    const records = server(edits.mock);
    records[0].note = "其他裝置";
    edits.mock.externalMerge(A, { tournamentRecords: records });
    throw firestoreError("unavailable");
  });
  await edits.page.window.finishTournament("t1");
  assert.equal(edits.page.lastStatus().text, VERIFIED_MATCHES);
  assert.equal(edits.page.alerts.filter(message => NOT_SAVED_MESSAGES.includes(message)).length, 0);
  assert.equal(server(edits.mock)[0].isFinished, true);
  assert.equal(server(edits.mock)[0].note, "其他裝置");
});

test("H1: pressing again after an unclear result cannot add a second round", async () => {
  const { mock, page } = await openPage([withRounds()]);
  setRoundForm(page, "m1", { beyblade: "C" });
  mock.on("afterCommit", () => {
    mock.setOnline(false);
    throw firestoreError("unavailable");
  });
  await page.window.addRound("t1", "m1");
  assert.deepEqual(page.alerts, [MSG[C.UNKNOWN_OUTCOME]]);

  mock.setOnline(true);
  await page.window.addRound("t1", "m1"); // same draft, new press
  assert.equal(server(mock)[0].matches[0].rounds.length, 3, "only the first round exists");
  assert.equal(page.alerts.at(-1), MSG[C.CONFLICT]);
  assert.equal(page.api.records[0].matches[0].rounds.length, 3, "the page now shows the saved round");
});

test("H1: same-tournament conflict protection is not relaxed by the retry fix", () => {
  const base = withRounds();
  const operation = createTournamentOperation({ type: T.ADD_ROUND, tournamentId: "t1", base, matchId: "m2", round: { id: "r9", result: "win" }, updatedAt: 1 });
  // Another device added a different round to another match: still a conflict.
  const other = structuredClone(base);
  other.matches[0].rounds.push({ id: "rx", roundNumber: 3 });
  assert.throws(() => applyTournamentOperation([other], operation), error => error instanceof TournamentSyncError && error.code === C.CONFLICT);
  // The intended result plus anything else is not a state match either.
  const intended = applyTournamentOperation([base], operation).records[0];
  const intendedPlus = { ...intended, note: "其他裝置" };
  assert.throws(() => applyTournamentOperation([intendedPlus], createTournamentOperation({
    type: T.UPDATE_TOURNAMENT, tournamentId: "t1", base, patch: { isFinished: true }, updatedAt: 1
  })), error => error.code === C.CONFLICT);
  const finish = createTournamentOperation({ type: T.UPDATE_TOURNAMENT, tournamentId: "t1", base, patch: { isFinished: true }, updatedAt: 1 });
  assert.equal(applyTournamentOperation([{ ...base, isFinished: true }], finish).applied, APPLIED.STATE_MATCH);
});

// ---------------------------------------------------------------------------
// M1: match edit drafts merge field by field and never silently overwrite
// ---------------------------------------------------------------------------

async function failFirstMatchEdit(page, mock, answers) {
  page.queuePrompts(...answers);
  mock.setOnline(false);
  await page.window.editMatch("t1", "m1");
  mock.setOnline(true);
}

function otherDeviceEditsMatch(mock, change) {
  const records = server(mock);
  change(records[0].matches[0]);
  mock.externalMerge(A, { tournamentRecords: records });
}

test("M1: untouched fields take the other device's new values; edited fields keep the draft", async () => {
  const { mock, page } = await openPage([withRounds()]);
  await failFirstMatchEdit(page, mock, ["甲（改名）", "A", "B", "C"]);
  otherDeviceEditsMatch(mock, match => { match.deck[1] = { source: "custom", configText: "其他裝置的陀螺" }; });
  await page.signIn("account-a"); // reload shows the latest copy; the draft stays

  const defaults = [];
  page.queuePrompts(...Array.from({ length: 4 }, () => value => { defaults.push(value); return value; }));
  await page.window.editMatch("t1", "m1");

  assert.deepEqual(defaults, ["甲（改名）", "A", "其他裝置的陀螺", "C"]);
  assert.equal(page.confirms.filter(message => message.includes("你和其他裝置都修改了")).length, 0);
  assert.match(page.confirms.at(-1), /確定要以這些內容重新儲存這局嗎/);
  const saved = server(mock)[0].matches[0];
  assert.equal(saved.opponentName, "甲（改名）");
  assert.equal(saved.deck[1].configText, "其他裝置的陀螺", "the other device's change is kept");
});

test("M1: when both sides changed the same field the user must choose", async () => {
  for (const keepMine of [false, true]) {
    const { mock, page } = await openPage([withRounds()]);
    await failFirstMatchEdit(page, mock, ["我的對手", "A", "B", "C"]);
    otherDeviceEditsMatch(mock, match => { match.opponentName = "雲端對手"; });
    await page.signIn("account-a");

    const defaults = [];
    page.queueConfirms(keepMine, true);
    page.queuePrompts(...Array.from({ length: 4 }, () => value => { defaults.push(value); return value; }));
    await page.window.editMatch("t1", "m1");

    const collision = page.confirms.find(message => message.includes("你和其他裝置都修改了"));
    assert.ok(collision, "the collision is shown");
    assert.match(collision, /你的「我的對手」／雲端「雲端對手」/);
    assert.equal(defaults[0], keepMine ? "我的對手" : "雲端對手");
    assert.equal(server(mock)[0].matches[0].opponentName, keepMine ? "我的對手" : "雲端對手");
  }
});

test("M1: declining the final confirmation sends nothing", async () => {
  const { mock, page } = await openPage([withRounds()]);
  await failFirstMatchEdit(page, mock, ["甲改", "A", "B", "C"]);
  const transactions = mock.stats.transactions;
  page.queueConfirms(false);
  page.queuePrompts(value => value, value => value, value => value, value => value);
  await page.window.editMatch("t1", "m1");
  assert.equal(mock.stats.transactions, transactions);
  assert.equal(server(mock)[0].matches[0].opponentName, "甲");
  assert.equal(page.api.matchEditDrafts.size, 1, "the draft is still there");
});

// ---------------------------------------------------------------------------
// L2: a late completion only clears the draft it submitted
// ---------------------------------------------------------------------------

test("L2: a late commit keeps add-form text typed after the timeout", async () => {
  const { mock, page } = await openPage([]);
  page.setAddForm(FORM);
  const gate = deferred();
  mock.on("beforeCommit", () => gate.promise);
  await page.window.addTournament();
  assert.deepEqual(page.alerts, [MSG[C.UNKNOWN_OUTCOME]]);

  page.elements.tournamentName.value = "使用者之後輸入的新比賽";
  gate.resolve();
  await waitFor(() => page.lastStatus().text.startsWith("稍早逾時的操作已完成"), { label: "late commit" });
  assert.equal(server(mock).length, 1);
  assert.equal(page.elements.tournamentName.value, "使用者之後輸入的新比賽");
});

test("L2: a late commit does not delete a newer match-edit draft", async () => {
  const { mock, page } = await openPage([withRounds()]);
  const gate = deferred();
  mock.on("beforeCommit", () => gate.promise);
  page.queuePrompts("第一次", "A", "B", "C");
  await page.window.editMatch("t1", "m1");
  assert.deepEqual(page.alerts, [MSG[C.UNKNOWN_OUTCOME]]);

  // A second attempt with different content fails before sending.
  page.navigator.onLine = false;
  page.queuePrompts("第二次", value => value, value => value, value => value);
  await page.window.editMatch("t1", "m1");
  page.navigator.onLine = true;
  const newer = page.api.matchEditDrafts.get(JSON.stringify(["t1", "m1"]));
  assert.equal(newer.values.opponentName, "第二次");

  gate.resolve();
  await waitFor(() => page.lastStatus().text.startsWith("稍早逾時的操作已完成"), { label: "late commit" });
  assert.equal(page.api.matchEditDrafts.get(JSON.stringify(["t1", "m1"])), newer);
});

// ---------------------------------------------------------------------------
// L4: completion status only changes on an explicit reopen
// ---------------------------------------------------------------------------

test("L4: re-saving basic info after another device finished the tournament keeps it finished", async () => {
  const { mock, page } = await openPage([tournament("t1")]);
  const results = [];
  page.api.setEditDialog(async (record, session, submitEdit) => {
    const values = { tournamentName: "我的新名稱", date: record.date, location: record.location, participantCount: 16, note: "" };
    const reopen = record.isFinished === true;
    const first = await submitEdit(values, record, { reopen });
    results.push(first);
    if (first.ok) return values;
    // The real dialog moves its base to the latest copy before a re-save.
    const latest = page.api.records.find(item => item.id === record.id);
    results.push(await submitEdit(values, latest, { reopen }));
    return values;
  });
  mock.on("beforeCommit", () => {
    const records = server(mock);
    records[0].isFinished = true;
    mock.externalMerge(A, { tournamentRecords: records });
  });

  await page.window.editTournament("t1");
  assert.equal(results[0].code, C.CONFLICT);
  assert.equal(results[1].ok, true);
  const saved = server(mock)[0];
  assert.equal(saved.tournamentName, "我的新名稱");
  assert.equal(saved.isFinished, true, "not reopened by a basic-info edit");
});

test("L4: opening the edit dialog on a finished tournament still reopens it", async () => {
  const { mock, page } = await openPage([tournament("t1", { isFinished: true })]);
  page.useEditDialog({ tournamentName: "重新開啟", date: "2026-10-29", location: "台北", participantCount: 16, note: "" });
  await page.window.editTournament("t1");
  assert.equal(server(mock)[0].isFinished, false);
});

// ---------------------------------------------------------------------------
// L5: no new tournament id without an explicit decision
// ---------------------------------------------------------------------------

async function unclearAdd() {
  const { mock, page } = await openPage([]);
  page.setAddForm(FORM);
  mock.on("afterCommit", () => {
    mock.setOnline(false);
    throw firestoreError("unavailable");
  });
  await page.window.addTournament();
  mock.setOnline(true);
  assert.deepEqual(page.alerts, [MSG[C.UNKNOWN_OUTCOME]]);
  return { mock, page };
}

test("L5: changing the form after an unclear add asks before creating a second tournament", async () => {
  const declined = await unclearAdd();
  declined.page.elements.tournamentName.value = "修正後的名稱";
  const transactions = declined.mock.stats.transactions;
  declined.page.queueConfirms(false);
  await declined.page.window.addTournament();
  assert.match(declined.page.confirms.at(-1), /儲存結果仍無法確認/);
  assert.equal(declined.mock.stats.transactions, transactions, "nothing is sent");
  assert.equal(server(declined.mock).length, 1);

  const accepted = await unclearAdd();
  accepted.page.elements.tournamentName.value = "另一場比賽";
  accepted.page.queueConfirms(true);
  await accepted.page.window.addTournament();
  assert.deepEqual(server(accepted.mock).map(record => record.tournamentName), ["新比賽", "另一場比賽"]);
});

test("L5: the same add resubmitted after another device edited it is recognised by its id", async () => {
  const { mock, page } = await unclearAdd();
  const records = server(mock);
  records[0].note = "其他裝置補上的備註";
  mock.externalMerge(A, { tournamentRecords: records });

  await page.window.addTournament();
  assert.equal(server(mock).length, 1);
  assert.equal(server(mock)[0].note, "其他裝置補上的備註");
  assert.equal(page.lastStatus().text, SAVED_IDENTITY);
  assert.deepEqual(formValues(page), ["", "", "", "", ""]);
  assert.equal(page.api.pendingAdd, null);
});

test("L5: a definitely unsent add may be edited and resent without a prompt", async () => {
  const { mock, page } = await openPage([]);
  page.setAddForm(FORM);
  mock.setOnline(false);
  await page.window.addTournament();
  mock.setOnline(true);
  assert.equal(page.api.pendingAdd.status, "not-saved");
  page.elements.tournamentName.value = "改過的名稱";
  await page.window.addTournament();
  assert.equal(page.confirms.length, 0);
  assert.deepEqual(server(mock).map(record => record.tournamentName), ["改過的名稱"]);
  assert.equal(page.lastStatus().text, SAVED);
});
