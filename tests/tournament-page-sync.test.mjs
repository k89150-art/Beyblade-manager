import assert from "node:assert/strict";
import test from "node:test";
import { TOURNAMENT_SYNC_MESSAGES, TOURNAMENT_SYNC_CODES as C } from "../tournament-sync.js";
import { createMockFirestore, deferred, firestoreError, userDocPath } from "./helpers/mock-firestore.mjs";
import { createTournamentPage, setMatchForm, setRoundForm, waitFor } from "./helpers/tournament-page-harness.mjs";

const A = userDocPath("account-a");
const B = userDocPath("account-b");
const MSG = TOURNAMENT_SYNC_MESSAGES;
const COLLECTION = {
  beybladeTable: [{ cells: ["UX-01"], stockAutoFilled: "true" }],
  partTable: [{ cells: ["固鎖", "1-60", "3"] }],
  configTable: [{ cells: ["BX-01", "-", "-", "-", "-", "-", "-", "3-60", "F"] }],
  historyTable: [{ model: "BX-01" }]
};

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

function seed(mock, path, records, extra = {}) {
  mock.seed(path, { ...COLLECTION, tournamentRecords: records, updatedAt: 1, ...extra });
}

async function openPage(mock, uid = "account-a", options = {}) {
  const page = await createTournamentPage({ mock, saveTimeoutMs: 60, verifyTimeoutMs: 60, slowNoticeMs: 20, ...options });
  await page.signIn(uid);
  assert.equal(page.api.session.state, "ready");
  return page;
}

const savedIds = (mock, path = A) => (mock.read(path)?.tournamentRecords || []).map(record => record.id);
const SAVED = "參賽紀錄已儲存";
const SAVED_IDENTITY = "參賽紀錄已儲存（先前中斷的儲存其實已完成，沒有重複新增）";
const SAVED_STATE_MATCH = "雲端資料已是這次要儲存的內容，沒有重複寫入";
const SAVED_ABSENT = "這筆資料已不存在，不需要再刪除";
const hasSavedStatus = page => page.statuses.some(status => status.type === "saved" && status.text !== "參賽紀錄已同步");
const FORM = {
  tournamentDate: "2026-11-01",
  tournamentName: "新比賽",
  tournamentLocation: "台中",
  tournamentParticipantCount: "8",
  tournamentNote: "草稿"
};
const formValues = page => Object.keys(FORM).map(id => page.elements[id].value);

test("adding a tournament commits through a transaction and clears the form only after success", async () => {
  const mock = createMockFirestore();
  seed(mock, A, [tournament("t1")]);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  const rendersBefore = page.renders;

  await page.window.addTournament();

  assert.deepEqual(savedIds(mock), ["t1", "tournament_1"]);
  assert.deepEqual(page.plain(page.api.records).map(record => record.id), ["t1", "tournament_1"]);
  assert.deepEqual(formValues(page), ["", "", "", "", ""]);
  assert.equal(page.lastStatus().text, SAVED);
  assert.equal(page.renders, rendersBefore + 1);
  assert.equal(page.alerts.length, 0);
  assert.deepEqual(page.idLog, ["tournament_1"]);
  assert.deepEqual(mock.read(A).beybladeTable, COLLECTION.beybladeTable);
});

test("two tabs adding different tournaments at the same time keep both", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  // Real ids are random; distinct tags keep the two mock id counters apart.
  const tabA = await openPage(mock, "account-a", { idTag: "a" });
  const tabB = await openPage(mock, "account-a", { idTag: "b" });
  tabA.setAddForm({ ...FORM, tournamentName: "A 的比賽" });
  tabB.setAddForm({ ...FORM, tournamentName: "B 的比賽" });

  mock.on("beforeCommit", () => tabB.window.addTournament());
  await tabA.window.addTournament();

  const names = mock.read(A).tournamentRecords.map(record => record.tournamentName).sort();
  assert.deepEqual(names, ["A 的比賽", "B 的比賽"]);
  assert.equal(tabA.api.records.length, 2, "tab A adopted the committed array including B's add");
  assert.equal(tabA.alerts.length + tabB.alerts.length, 0);
});

test("two tabs editing different tournaments keep both edits", async () => {
  const mock = createMockFirestore();
  seed(mock, A, [tournament("t1"), tournament("t2")]);
  const tabA = await openPage(mock);
  const tabB = await openPage(mock);
  tabB.useEditDialog({ tournamentName: "B 改名", date: "2026-11-02", location: "高雄", participantCount: 32, note: "" });

  mock.on("beforeCommit", () => tabB.window.editTournament("t2"));
  await tabA.window.finishTournament("t1");

  const [t1, t2] = mock.read(A).tournamentRecords;
  assert.equal(t1.isFinished, true);
  assert.equal(t2.tournamentName, "B 改名");
  assert.equal(t2.participantCount, 32);
});

test("two tabs changing the same tournament: the later one is refused and nothing is overwritten", async () => {
  const mock = createMockFirestore();
  seed(mock, A, [tournament("t1")]);
  const tabA = await openPage(mock);
  const tabB = await openPage(mock);
  setMatchForm(tabB, "t1", { opponent: "對手", deck: ["X1", "X2", "X3"] });

  mock.on("beforeCommit", () => tabA.window.finishTournament("t1"));
  await tabB.window.addMatch("t1");

  const saved = mock.read(A).tournamentRecords[0];
  assert.equal(saved.isFinished, true);
  assert.equal(saved.matches.length, 0);
  assert.deepEqual(tabB.alerts, [MSG[C.CONFLICT]]);
  assert.equal(tabB.lastStatus().type, "error");
  assert.equal(hasSavedStatus(tabB), false);
  assert.equal(tabB.api.records[0].isFinished, true, "tab B now shows the latest server copy");
});

test("changing different matches of the same tournament from two tabs still conflicts", async () => {
  const mock = createMockFirestore();
  const base = tournament("t1", {
    matches: [
      { id: "m1", opponentName: "甲", deck: [{ configText: "A" }, { configText: "B" }, { configText: "C" }], rounds: [] },
      { id: "m2", opponentName: "乙", deck: [{ configText: "A" }, { configText: "B" }, { configText: "C" }], rounds: [] }
    ]
  });
  seed(mock, A, [base]);
  const tabA = await openPage(mock);
  const tabB = await openPage(mock);
  tabA.queuePrompts("甲改", "A", "B", "C");
  setRoundForm(tabB, "m2", { beyblade: "A", scoreType: "over" });

  mock.on("beforeCommit", () => tabA.window.editMatch("t1", "m1"));
  await tabB.window.addRound("t1", "m2");

  const saved = mock.read(A).tournamentRecords[0];
  assert.equal(saved.matches[0].opponentName, "甲改");
  assert.equal(saved.matches[1].rounds.length, 0);
  assert.deepEqual(tabB.alerts, [MSG[C.CONFLICT]]);
});

test("delete versus edit across tabs never silently loses the other change", async () => {
  const deleteFirst = createMockFirestore();
  seed(deleteFirst, A, [tournament("t1")]);
  const a1 = await openPage(deleteFirst);
  const b1 = await openPage(deleteFirst);
  const editCalls = b1.useEditDialog({ tournamentName: "改", date: "2026-11-02", location: "", participantCount: 8, note: "" });
  deleteFirst.on("beforeCommit", () => a1.window.deleteTournament("t1"));
  await b1.window.editTournament("t1");
  assert.deepEqual(savedIds(deleteFirst), []);
  assert.equal(editCalls[0].code, C.DELETED);
  assert.equal(b1.api.records.length, 0);

  const editFirst = createMockFirestore();
  seed(editFirst, A, [tournament("t1")]);
  const a2 = await openPage(editFirst);
  const b2 = await openPage(editFirst);
  editFirst.on("beforeCommit", () => b2.window.finishTournament("t1"));
  await a2.window.deleteTournament("t1");
  assert.deepEqual(savedIds(editFirst), ["t1"]);
  assert.equal(editFirst.read(A).tournamentRecords[0].isFinished, true);
  assert.deepEqual(a2.alerts, [MSG[C.DELETE_CONFLICT]]);
});

test("two tabs deleting the same tournament both succeed", async () => {
  const mock = createMockFirestore();
  seed(mock, A, [tournament("t1"), tournament("t2")]);
  const tabA = await openPage(mock);
  const tabB = await openPage(mock);
  mock.on("beforeCommit", () => tabB.window.deleteTournament("t1"));
  await tabA.window.deleteTournament("t1");
  assert.deepEqual(savedIds(mock), ["t2"]);
  assert.equal(tabA.alerts.length + tabB.alerts.length, 0);
  assert.equal(tabB.lastStatus().text, SAVED);
  assert.equal(tabA.lastStatus().text, SAVED_ABSENT, "tab A does not claim it deleted the record itself");
  assert.equal(mock.stats.commits, 1);
});

test("an automatic retry re-runs the callback but creates one id, one render and one saved status", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  const rendersBefore = page.renders;
  const statusesBefore = page.statuses.length;
  // The main page saves the collection twice while the transaction runs.
  mock.on("beforeCommit", () => mock.externalMerge(A, { beybladeTable: [{ cells: ["NEW-1"] }], updatedAt: 40 }));
  mock.on("beforeCommit", () => mock.externalMerge(A, { partTable: [{ cells: ["NEW-2"] }], updatedAt: 41 }));

  await page.window.addTournament();

  assert.equal(mock.stats.callbackRuns, 3);
  assert.deepEqual(page.idLog, ["tournament_1"]);
  assert.deepEqual(savedIds(mock), ["tournament_1"]);
  assert.equal(page.renders, rendersBefore + 1);
  const newStatuses = page.statuses.slice(statusesBefore).map(status => status.text);
  assert.deepEqual(newStatuses, ["儲存參賽紀錄中...", SAVED]);
  const saved = mock.read(A);
  assert.deepEqual(saved.beybladeTable, [{ cells: ["NEW-1"] }]);
  assert.deepEqual(saved.partTable, [{ cells: ["NEW-2"] }]);
  assert.deepEqual(saved.configTable, COLLECTION.configTable);
  assert.deepEqual(saved.historyTable, COLLECTION.historyTable);
  assert.deepEqual(page.plain(page.api.mainData.beybladeTable), [{ cells: ["NEW-1"] }]);
});

test("a network outage leaves memory untouched and a failed delete never resurfaces later", async () => {
  const mock = createMockFirestore();
  seed(mock, A, [tournament("t1")]);
  const page = await openPage(mock);
  const before = page.plain(page.api.records);

  mock.setOnline(false);
  await page.window.deleteTournament("t1");
  assert.deepEqual(page.alerts, [MSG[C.NETWORK]]);
  assert.deepEqual(page.plain(page.api.records), before);
  assert.equal(page.lastStatus().type, "error");
  assert.equal(hasSavedStatus(page), false);
  assert.equal(mock.stats.commits, 0);

  mock.setOnline(true);
  page.setAddForm(FORM);
  await page.window.addTournament();
  assert.deepEqual(savedIds(mock), ["t1", "tournament_1"], "the failed delete was not applied by the next save");
});

test("a single dropped read is retried and saves without bothering the user", async () => {
  const mock = createMockFirestore();
  seed(mock, A, [tournament("t1")]);
  const page = await openPage(mock);
  mock.on("beforeGet", () => { throw firestoreError("unavailable"); });
  await page.window.finishTournament("t1");
  assert.equal(page.alerts.length, 0);
  assert.equal(page.lastStatus().text, SAVED);
  assert.equal(mock.read(A).tournamentRecords[0].isFinished, true);
});

test("offline: nothing is queued, the form is kept, and the same form saves once online", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  page.navigator.onLine = false;

  await page.window.addTournament();
  assert.equal(mock.stats.transactions, 0, "no transaction and no background queue while offline");
  assert.deepEqual(page.alerts, [MSG[C.OFFLINE]]);
  assert.deepEqual(formValues(page), Object.values(FORM));
  assert.deepEqual(page.plain(page.api.records), []);

  page.navigator.onLine = true;
  await page.window.addTournament();
  assert.deepEqual(savedIds(mock), ["tournament_1"]);
  assert.deepEqual(page.idLog, ["tournament_1"], "the retry reused the id of the unsent add");
});

test("outage while the commit is sent (never reached the server): unclear, then one save after recovery", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  mock.on("beforeCommit", () => mock.setOnline(false));

  await page.window.addTournament();
  assert.deepEqual(page.alerts, [MSG[C.UNKNOWN_OUTCOME]]);
  assert.ok(mock.stats.serverGets >= 2, "a fresh read was attempted before answering");
  assert.deepEqual(formValues(page), Object.values(FORM));
  assert.equal(hasSavedStatus(page), false);
  assert.equal(page.api.pendingAdd.status, "unknown");

  mock.setOnline(true);
  await page.window.addTournament();
  await page.window.addTournament();
  assert.deepEqual(savedIds(mock), ["tournament_1"]);
  assert.deepEqual(page.idLog, ["tournament_1"]);
});

test("outage right after the commit landed: unclear, then the resubmit is recognised, not duplicated", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  mock.on("afterCommit", () => {
    mock.setOnline(false);
    throw firestoreError("unavailable");
  });

  await page.window.addTournament();
  assert.deepEqual(page.alerts, [MSG[C.UNKNOWN_OUTCOME]]);
  assert.deepEqual(savedIds(mock), ["tournament_1"]);

  mock.setOnline(true);
  await page.window.addTournament();
  assert.deepEqual(savedIds(mock), ["tournament_1"]);
  assert.equal(page.lastStatus().text, SAVED_IDENTITY);
  assert.deepEqual(page.idLog, ["tournament_1"]);
  assert.deepEqual(formValues(page), ["", "", "", "", ""]);
});

test("a lost acknowledgement is recognised by the operation id on the next attempt", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  mock.on("afterCommit", () => { throw firestoreError("unavailable"); });

  await page.window.addTournament();
  assert.deepEqual(savedIds(mock), ["tournament_1"]);
  assert.equal(mock.stats.commits, 1);
  assert.equal(page.alerts.length, 0);
  assert.equal(page.lastStatus().text, SAVED_IDENTITY);
  assert.deepEqual(formValues(page), ["", "", "", "", ""]);
});

test("timeout, then the commit lands: unclear first, confirmed by a re-read later", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  const gate = deferred();
  mock.on("beforeCommit", () => gate.promise);

  await page.window.addTournament();
  assert.deepEqual(page.alerts, [MSG[C.UNKNOWN_OUTCOME]]);
  assert.equal(page.api.busy, false, "the page is usable again after the timeout");
  assert.deepEqual(formValues(page), Object.values(FORM));

  gate.resolve();
  await waitFor(() => page.lastStatus().text === "稍早逾時的操作已完成儲存，畫面已更新", { label: "late commit" });
  assert.deepEqual(savedIds(mock), ["tournament_1"]);
  assert.deepEqual(page.plain(page.api.records).map(record => record.id), ["tournament_1"]);
  assert.deepEqual(formValues(page), ["", "", "", "", ""]);
});

test("timeout, then the commit fails: nothing is written and a resubmit saves exactly once", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  const gate = deferred();
  mock.on("beforeCommit", () => gate.promise);

  await page.window.addTournament();
  assert.deepEqual(page.alerts, [MSG[C.UNKNOWN_OUTCOME]]);
  gate.reject(firestoreError("unavailable"));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(savedIds(mock), []);

  await page.window.addTournament();
  assert.deepEqual(savedIds(mock), ["tournament_1"]);
  assert.deepEqual(page.idLog, ["tournament_1"]);
});

test("an abandoned transaction does not keep retrying in the background", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  const gate = deferred();
  mock.on("beforeCommit", async () => {
    await gate.promise;
    mock.externalMerge(A, { partTable: [] }); // the held commit is now stale
  });

  await page.window.addTournament();
  const runs = mock.stats.callbackRuns;
  gate.resolve();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(mock.stats.callbackRuns, runs, "no further attempt starts after the page gave up");
  assert.deepEqual(savedIds(mock), []);
});

test("a timeout before anything was staged is reported as definitely not saved", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  const gate = deferred();
  mock.on("beforeGet", () => gate.promise);
  const serverGets = mock.stats.serverGets;

  await page.window.addTournament();
  assert.deepEqual(page.alerts, [MSG[C.NETWORK]]);
  assert.equal(mock.stats.serverGets, serverGets, "no confirmation read is needed");
  assert.equal(page.api.pendingAdd.status, "not-saved");

  gate.resolve();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(savedIds(mock), [], "the held read resumes and stops before staging");
  await page.window.addTournament();
  assert.deepEqual(savedIds(mock), ["tournament_1"]);
});

test("an account switch while the edit dialog is open sends nothing", async () => {
  const mock = createMockFirestore();
  seed(mock, A, [tournament("t1")]);
  seed(mock, B, [tournament("b1")]);
  const page = await openPage(mock);
  const dialog = deferred();
  page.api.setEditDialog(async (record, session, submitEdit) => {
    await dialog.promise;
    return submitEdit({ tournamentName: "不應套用", date: "2026-11-01", location: "", participantCount: 8, note: "" }, record);
  });

  const operation = page.window.editTournament("t1");
  await page.signIn("account-b");
  dialog.resolve();
  await operation;

  assert.equal(mock.stats.transactions, 0);
  assert.equal(mock.read(A).tournamentRecords[0].tournamentName, "比賽 t1");
  assert.deepEqual(page.plain(page.api.records).map(record => record.id), ["b1"]);
});

test("an account switch during the transaction read or retry writes nothing", async () => {
  const mock = createMockFirestore();
  seed(mock, A, [tournament("t1")]);
  seed(mock, B, [tournament("b1")]);

  const duringRead = await openPage(mock);
  mock.on("beforeGet", () => duringRead.signIn("account-b"));
  await duringRead.window.finishTournament("t1");
  await waitFor(() => duringRead.api.session.state === "ready", { label: "account b" });

  const duringRetry = await openPage(mock);
  mock.on("beforeCommit", async () => {
    mock.externalMerge(A, { partTable: [] });
    await duringRetry.signIn("account-b");
  });
  await duringRetry.window.finishTournament("t1");

  assert.equal(mock.read(A).tournamentRecords[0].isFinished, false);
  assert.equal(mock.read(B).tournamentRecords[0].isFinished, false);
  assert.equal(mock.stats.commits, 0);
  for (const page of [duringRead, duringRetry]) {
    assert.deepEqual(page.plain(page.api.records).map(record => record.id), ["b1"]);
    assert.equal(page.alerts.length, 0);
  }
});

test("a commit that lands after an account switch stays in the old account and never reaches the new view", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  seed(mock, B, [tournament("b1")]);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  const statusesBefore = page.statuses.length;
  mock.on("afterCommit", () => page.signIn("account-b"));

  await page.window.addTournament();
  await waitFor(() => page.api.session.state === "ready" && page.api.records.length === 1, { label: "account b view" });

  assert.deepEqual(savedIds(mock, A), ["tournament_1"], "the commit belongs to the account that started it");
  assert.deepEqual(savedIds(mock, B), ["b1"]);
  mock.commitLog.flat().forEach(write => assert.equal(write.path, A));
  assert.deepEqual(page.plain(page.api.records).map(record => record.id), ["b1"]);
  assert.equal(page.api.opened.has("tournament_1"), false);
  assert.equal(page.statuses.slice(statusesBefore).some(status => status.text === SAVED), false);
  assert.equal(page.alerts.length, 0);
});

test("drafts never follow an account switch", async () => {
  const mock = createMockFirestore();
  seed(mock, A, [tournament("t1", { matches: [{ id: "m1", opponentName: "甲", deck: [], rounds: [] }] })]);
  seed(mock, B, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  page.queuePrompts("甲改", "A", "B", "C");
  mock.setOnline(false);
  await page.window.editMatch("t1", "m1");
  await page.window.addTournament();
  mock.setOnline(true);
  assert.equal(page.api.matchEditDrafts.size, 1);
  assert.notEqual(page.api.pendingAdd, null);
  assert.deepEqual(formValues(page), Object.values(FORM));

  await page.signIn("account-b");
  assert.deepEqual(formValues(page), ["", "", "", "", ""]);
  assert.equal(page.api.matchEditDrafts.size, 0);
  assert.equal(page.api.formDrafts.size, 0);
  assert.equal(page.api.pendingAdd, null);
});

test("a failed match edit is offered again, confirmed explicitly and cleared after saving", async () => {
  const mock = createMockFirestore();
  const deck = [{ configText: "A" }, { configText: "B" }, { configText: "C" }];
  seed(mock, A, [tournament("t1", { matches: [{ id: "m1", opponentName: "甲", deck, rounds: [] }] })]);
  const page = await openPage(mock);
  page.queuePrompts("甲改", "X", "Y", "Z");
  mock.setOnline(false);
  await page.window.editMatch("t1", "m1");
  mock.setOnline(true);
  assert.deepEqual(page.alerts, [MSG[C.NETWORK]]);
  assert.equal(mock.read(A).tournamentRecords[0].matches[0].opponentName, "甲");

  const defaults = [];
  page.queuePrompts(...Array.from({ length: 4 }, () => value => { defaults.push(value); return value; }));
  await page.window.editMatch("t1", "m1");
  assert.deepEqual(defaults, ["甲改", "X", "Y", "Z"]);
  assert.match(page.confirms.at(-1), /確定要以這些內容重新儲存這局嗎/);
  const saved = mock.read(A).tournamentRecords[0].matches[0];
  assert.equal(saved.opponentName, "甲改");
  assert.deepEqual(saved.deck.map(item => item.configText), ["X", "Y", "Z"]);
  assert.equal(page.api.matchEditDrafts.size, 0);
});

test("a second operation is refused while one is still saving", async () => {
  const mock = createMockFirestore();
  seed(mock, A, [tournament("t1"), tournament("t2")]);
  const page = await openPage(mock);
  const gate = deferred();
  mock.on("beforeCommit", () => gate.promise);
  const first = page.window.finishTournament("t1");
  await waitFor(() => page.api.busy, { label: "busy" });

  await page.window.deleteTournament("t2");
  assert.equal(mock.stats.transactions, 1);
  assert.match(page.alerts.at(-1), /仍在儲存/);

  gate.resolve();
  await first;
  assert.equal(page.api.busy, false);
  assert.deepEqual(savedIds(mock), ["t1", "t2"]);
});

test("all ten tournament operations save through the transaction path", async () => {
  const mock = createMockFirestore();
  seed(mock, A, []);
  const page = await openPage(mock);
  page.setAddForm(FORM);
  await page.window.addTournament();
  const id = "tournament_1";

  setMatchForm(page, id, { opponent: "甲", deck: ["A", "B", "C"] });
  await page.window.addMatch(id);
  await page.window.addDirectAdvance(id, "bye");
  const matchId = mock.read(A).tournamentRecords[0].matches[0].id;
  setRoundForm(page, matchId, { beyblade: "A", scoreType: "extreme" });
  await page.window.addRound(id, matchId);
  setRoundForm(page, matchId, { beyblade: "B", result: "lose", scoreType: "spin" });
  await page.window.addRound(id, matchId);
  const firstRound = mock.read(A).tournamentRecords[0].matches[0].rounds[0].id;
  await page.window.deleteRound(id, matchId, firstRound);
  page.queuePrompts("乙", "A", "B", "D");
  await page.window.editMatch(id, matchId);
  await page.window.deleteMatch(id, mock.read(A).tournamentRecords[0].matches[1].id);
  await page.window.finishTournament(id);
  page.useEditDialog({ tournamentName: "改名", date: "2026-11-03", location: "嘉義", participantCount: 4, note: "" });
  await page.window.editTournament(id);

  let saved = mock.read(A).tournamentRecords[0];
  assert.equal(saved.tournamentName, "改名");
  assert.equal(saved.isFinished, false);
  assert.equal(saved.matches.length, 1);
  assert.equal(saved.matches[0].opponentName, "乙");
  assert.deepEqual(saved.matches[0].rounds.map(round => [round.myBeyblade, round.roundNumber]), [["B", 1]]);

  await page.window.deleteTournament(id);
  saved = mock.read(A);
  assert.deepEqual(saved.tournamentRecords, []);
  assert.equal(mock.stats.commits, 11);
  assert.equal(page.alerts.length, 0);
  mock.commitLog.flat().forEach(write => {
    assert.deepEqual(Object.keys(write.fields).sort(), ["tournamentRecords", "updatedAt"]);
  });
  assert.deepEqual(saved.beybladeTable, COLLECTION.beybladeTable);
});

test("tournament.js no longer writes the whole array with setDoc", async () => {
  const { loadTournamentSource } = await import("./helpers/tournament-page-harness.mjs");
  const source = loadTournamentSource();
  assert.doesNotMatch(source, /\bsetDoc\b/);
  assert.doesNotMatch(source, /saveTournamentData/);
  assert.match(source, /runTransaction/);
});
