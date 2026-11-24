// Phase 7-4 (spec 13): the tournament record panel. Pure functions from
// tournament-panel.js, then the real tournament.js in the VM harness: the panel
// only fills the existing round fields and calls the existing addRound, and
// every write goes through submitTournamentOperation (D-017).
import assert from "node:assert/strict";
import test from "node:test";
import {
  preselectedBeyblade,
  recordableMatches,
  resolveRoundPanelTarget,
  roundPanelBeyblades,
  roundPanelSelectionError
} from "../tournament-panel.js";
import { createMockFirestore, userDocPath } from "./helpers/mock-firestore.mjs";
import { createTournamentPage, loadTournamentSource, setRoundForm } from "./helpers/tournament-page-harness.mjs";

const A = userDocPath("account-a");
const SCORE = { extreme: { point: 3 }, over: { point: 2 }, burst: { point: 2 }, spin: { point: 1 } };
const deck = texts => texts.map(configText => ({ source: "custom", configText }));
const round = (id, result, scoreType) => ({ id, roundNumber: 1, result, scoreType, point: SCORE[scoreType].point, myBeyblade: "A", note: "" });
const match = (id, rounds = [], extra = {}) => ({ id, opponentName: `對手${id}`, deck: deck(["A", "B", "C"]), rounds, ...extra });
const advance = id => ({ id, advancementType: "bye", opponentName: "輪空", deck: [], rounds: [] });
const tournament = (id, matches, extra = {}) => ({ id, tournamentName: `比賽 ${id}`, date: "2026-11-25", location: "台北", participantCount: 8, rank: "", note: "", isFinished: false, matches, ...extra });

/* ---------- pure ---------- */

const isAdvance = item => Boolean(item.advancementType);
const pureOutcome = item => {
  let me = 0; let op = 0;
  (item.rounds || []).forEach(r => { if (r.result === "win") me += r.point; else op += r.point; });
  return me >= 4 ? "win" : op >= 4 ? "lose" : "incomplete";
};

test("R-01 panel target: chosen match, else the last open one, else the last; byes and walkovers excluded", () => {
  const four = [round("r1", "win", "extreme"), round("r2", "win", "spin")];
  const record = tournament("t1", [match("m1"), advance("m2"), match("m3", four), match("m4")]);
  const opts = { isDirectAdvance: isAdvance, outcomeOf: pureOutcome };
  assert.deepEqual(recordableMatches(record, isAdvance).map(item => [item.match.id, item.number]), [["m1", 1], ["m3", 3], ["m4", 4]]);
  assert.equal(resolveRoundPanelTarget(record, "", opts), "m4");
  assert.equal(resolveRoundPanelTarget(record, "m1", opts), "m1", "Q1: an earlier open match can be chosen");
  assert.equal(resolveRoundPanelTarget(record, "m2", opts), "m4", "a bye is never a target");
  assert.equal(resolveRoundPanelTarget(record, "gone", opts), "m4", "a deleted target falls back");
  const decided = tournament("t2", [match("m1", four)]);
  assert.equal(resolveRoundPanelTarget(decided, "", opts), "m1", "all decided: the last one, shown as finished");
  assert.equal(resolveRoundPanelTarget(tournament("t3", [advance("m1")]), "", opts), "");
});

test("R-02 Q3: a bey is preselected only when there is one; result and type are required", () => {
  assert.deepEqual(roundPanelBeyblades(match("m", [], { deck: deck(["A", "A", ""]) })), ["A"]);
  assert.equal(preselectedBeyblade(match("m", [], { deck: deck(["A", "A", "A"]) })), "A");
  assert.equal(preselectedBeyblade(match("m")), "");
  const m = match("m");
  assert.equal(roundPanelSelectionError({ beyblade: "A", result: "win", scoreType: "over" }, m, SCORE), "");
  assert.equal(roundPanelSelectionError({ beyblade: "", result: "", scoreType: "" }, m, SCORE), "請先選擇：使用陀螺、得分或失分、勝利方式");
  assert.equal(roundPanelSelectionError({ beyblade: "Z", result: "win", scoreType: "over" }, m, SCORE), "請先選擇：使用陀螺", "a bey not in this match is refused");
  assert.equal(roundPanelSelectionError({ beyblade: "A", result: "win", scoreType: "toString" }, m, SCORE), "請先選擇：勝利方式");
});

/* ---------- real page ---------- */

function seed(mock, records) {
  mock.seed(A, { configTable: [], beybladeTable: [{ cells: ["UX-01"] }], tournamentRecords: records, updatedAt: 1 });
}

async function openPage(records, options = {}) {
  const mock = createMockFirestore();
  seed(mock, records);
  const page = await createTournamentPage({ mock, saveTimeoutMs: 60, verifyTimeoutMs: 60, slowNoticeMs: 20, ...options });
  await page.signIn("account-a");
  return { mock, page };
}

const server = mock => mock.read(A).tournamentRecords;

test("R-03 recording through the panel adds exactly one round with the chosen values (all four finish types)", async () => {
  for (const [scoreType, point] of [["extreme", 3], ["over", 2], ["burst", 2], ["spin", 1]]) {
    for (const result of ["win", "lose"]) {
      const { mock, page } = await openPage([tournament("t1", [match("m1")])]);
      page.setPanel("t1", "m1", { beyblade: "B", result, scoreType, note: "備註" });
      const fields = [];
      mock.on("beforeCommit", ({ writes }) => { writes.forEach(write => fields.push(Object.keys(write.fields).sort())); });
      await page.window.recordRoundFromPanel("t1", "m1");
      assert.deepEqual(fields, [["tournamentRecords", "updatedAt"]], "only the tournament field is written");
      const rounds = server(mock)[0].matches[0].rounds;
      assert.equal(rounds.length, 1, `${scoreType}/${result}`);
      assert.deepEqual({ ...rounds[0], id: "x" }, { id: "x", roundNumber: 1, result, scoreType, point, myBeyblade: "B", note: "備註" });
      const score = page.context.calculateMatchScore(server(mock)[0].matches[0]);
      assert.deepEqual([score.myScore, score.opponentScore], result === "win" ? [point, 0] : [0, point]);
      assert.equal(mock.stats.transactions, 1);
      assert.equal(mock.stats.commits, 1);
    }
  }
});

test("R-04 Q3: nothing is sent until bey, result and finish type are chosen (addRound's defaults are never used)", async () => {
  const { mock, page } = await openPage([tournament("t1", [match("m1")])]);
  const panel = page.setPanel("t1", "m1", { beyblade: "A" });
  await page.window.recordRoundFromPanel("t1", "m1");
  assert.match(panel.message.textContent, /請先選擇：得分或失分、勝利方式/);
  assert.equal(mock.stats.transactions, 0);
  assert.deepEqual(server(mock)[0].matches[0].rounds, []);
});

test("R-05 a panel showing another match never writes to the requested one", async () => {
  const records = [tournament("t1", [match("m1"), match("m2")])];
  const { mock, page } = await openPage(records);
  page.setPanel("t1", "m1", { beyblade: "A", result: "win", scoreType: "over" });
  setRoundForm(page, "m2", { beyblade: "C", result: "win", scoreType: "extreme" });
  await page.window.recordRoundFromPanel("t1", "m2");
  assert.match(page.alerts.at(-1), /資料已更新，請確認記錄對象後再操作/);
  assert.equal(mock.stats.transactions, 0);
  assert.deepEqual(server(mock)[0].matches.map(item => item.rounds.length), [0, 0]);
});

test("R-05m mutation: without the target check the same call writes to the wrong match (the check is what R-05 tests)", async () => {
  const source = loadTournamentSource().replace(/\r\n/g, "\n");
  const check = "|| !match || isDirectAdvanceMatch(match) || getRoundPanelTarget(record) !== matchId\n    || document.querySelector(`[data-match-id=\"${matchId}\"]`) !== panel;";
  assert.ok(source.includes(check));
  const mutated = source.replace(check, "|| !match;").replace('panel.getAttribute("data-match-id") !== matchId || ', "");
  const mock = createMockFirestore();
  seed(mock, [tournament("t1", [match("m1"), match("m2")])]);
  const page = await createTournamentPage({ mock, source: mutated, saveTimeoutMs: 60, verifyTimeoutMs: 60, slowNoticeMs: 20 });
  await page.signIn("account-a");
  page.setPanel("t1", "m1", { beyblade: "A", result: "win", scoreType: "over" });
  setRoundForm(page, "m2", { beyblade: "C", result: "win", scoreType: "extreme" });
  // In the mutant the panel's selection is read from the panel, then addRound
  // reads the m2 card fields: a round lands on m2 although the panel shows m1.
  await page.window.recordRoundFromPanel("t1", "m2");
  assert.equal(server(mock)[0].matches[1].rounds.length, 1, "the mutant writes to the wrong match");
});

test("R-06 Q2: a decided match (4 points) takes no more rounds from the panel; deleting a round reopens it", async () => {
  const four = [round("r1", "win", "extreme"), round("r2", "win", "spin")];
  const { mock, page } = await openPage([tournament("t1", [match("m1", four)])]);
  page.setPanel("t1", "m1", { beyblade: "A", result: "win", scoreType: "over" });
  await page.window.recordRoundFromPanel("t1", "m1");
  assert.equal(mock.stats.transactions, 0);
  // The existing delete still works and the score drops below 4.
  await page.window.deleteRound("t1", "m1", "r2");
  assert.equal(server(mock)[0].matches[0].rounds.length, 1);
  assert.equal(page.context.getMatchOutcome(server(mock)[0].matches[0]), "incomplete");
  page.setPanel("t1", "m1", { beyblade: "A", result: "lose", scoreType: "spin" });
  await page.window.recordRoundFromPanel("t1", "m1");
  assert.equal(server(mock)[0].matches[0].rounds.length, 2, "recording is possible again");
});

test("R-07 pressing 記錄回合 twice sends one round", async () => {
  const { mock, page } = await openPage([tournament("t1", [match("m1")])]);
  page.setPanel("t1", "m1", { beyblade: "A", result: "win", scoreType: "spin" });
  await Promise.all([page.window.recordRoundFromPanel("t1", "m1"), page.window.recordRoundFromPanel("t1", "m1")]);
  assert.equal(server(mock)[0].matches[0].rounds.length, 1);
  assert.equal(mock.stats.transactions, 1);
});

test("R-08 finished tournaments, byes and missing targets are refused without writing", async () => {
  const { mock, page } = await openPage([tournament("t1", [match("m1"), advance("m2")], { isFinished: true }), tournament("t2", [match("m3")])]);
  page.setPanel("t1", "m1", { beyblade: "A", result: "win", scoreType: "spin" });
  await page.window.recordRoundFromPanel("t1", "m1");
  page.setPanel("t1", "m2", { beyblade: "A", result: "win", scoreType: "spin" });
  await page.window.recordRoundFromPanel("t1", "m2");
  page.clearPanel();
  await page.window.recordRoundFromPanel("t2", "m3");
  assert.equal(mock.stats.transactions, 0);
  assert.equal(page.alerts.length, 3);
});

test("R-09 offline: the panel's round is not sent and nothing is queued (D-017)", async () => {
  const { mock, page } = await openPage([tournament("t1", [match("m1")])]);
  page.setPanel("t1", "m1", { beyblade: "A", result: "win", scoreType: "spin" });
  page.navigator.onLine = false;
  await page.window.recordRoundFromPanel("t1", "m1");
  page.navigator.onLine = true;
  assert.equal(server(mock)[0].matches[0].rounds.length, 0);
  assert.ok(page.alerts.length >= 1);
});

/* ---------- 7-4b: new-match dialog and 3on3 hint ---------- */

import { buildConfigPartIndex, checkDeckDuplicates, configRowParts, LIMITED_LOCK_CHIPS } from "../tournament-panel.js";
import { setMatchForm } from "./helpers/tournament-page-harness.mjs";

const row = (cells, mainStockName) => (mainStockName === undefined ? { cells } : { cells, mainStockName });

test("D-01 config parts: standard, integrated, CX 3-piece, CX 4-piece, legacy split, booster; exact names", () => {
  assert.deepEqual(configRowParts(row(["BX-01 CUSTOM", "蒼龍  神劍", "-", "-", "-", "-", "-", "3-60", "F"], "-")), [["上蓋", "蒼龍  神劍"], ["固鎖", "3-60"], ["軸心", "F"]]);
  assert.deepEqual(configRowParts(row(["UX-21-01 CUSTOM", "惡魔冥界", "-", "-", "-", "-", "-", "-", "Z"], "-")), [["上蓋", "惡魔冥界"], ["軸心", "Z"]], "\"-\" is no part");
  assert.deepEqual(configRowParts(row(["CX-CUSTOM", "飛龍龍騎H", "飛龍", "龍騎", "-", "-", "H", "3-60", "F"], "龍騎")), [["紋章鎖", "飛龍"], ["主要戰刃", "龍騎"], ["輔助戰刃", "H"], ["固鎖", "3-60"], ["軸心", "F"]], "the combined 上蓋 column is not a part");
  assert.deepEqual(configRowParts(row(["CX-CUSTOM", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"], "")), [["紋章鎖", "紋章鎖"], ["超越戰刃", "超越"], ["金屬戰刃", "金屬"], ["輔助戰刃", "S"], ["固鎖", "4-55"], ["軸心", "LO"]]);
  assert.deepEqual(configRowParts(row(["CX-CUSTOM", "x", "L", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"])).map(([type]) => type), ["紋章鎖", "超越戰刃", "金屬戰刃", "輔助戰刃", "固鎖", "軸心"], "without mainStockName the split blade text is not a part");
  assert.deepEqual(configRowParts(row(["BX-14 CUSTOM", "抽包上蓋", "-", "-", "-", "-", "-", "5-60", "P"], "-"))[0], ["上蓋", "抽包上蓋"]);
});

const index = rows => buildConfigPartIndex(rows, item => item.cells[0] + "｜" + item.cells[1]);
const CONFIGS = [
  row(["A", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"], "-"),
  row(["B", "地獄鐮刀", "-", "-", "-", "-", "-", "3-60", "T"], "-"),
  row(["C", "鳳凰", "-", "-", "-", "-", "-", "4-60", "R"], "-"),
  row(["D", "x", "戰神", "龍騎", "-", "-", "H", "1-60", "N"], "龍騎"),
  row(["E", "y", "戰神", "鳳刃", "-", "-", "J", "2-60", "K"], "鳳刃"),
  row(["F", "z", "飛龍", "獅刃", "-", "-", "M", "5-60", "Q"], "獅刃"),
  row(["G", "w", "飛龍", "虎刃", "-", "-", "P", "6-60", "U"], "虎刃"),
  row(["S", "同名", "-", "-", "-", "-", "-", "1-60", "A"], "-"),
  row(["S", "同名", "-", "-", "-", "-", "-", "2-60", "B"], "-")
];

test("D-02 3on3: duplicates across beys; lock chips may repeat except 戰神 and 帝王; same config twice repeats all", () => {
  assert.deepEqual([...LIMITED_LOCK_CHIPS], ["戰神", "帝王"]);
  const ix = index(CONFIGS);
  const dup = checkDeckDuplicates(["A｜蒼龍神劍", "B｜地獄鐮刀", "C｜鳳凰"], ix);
  assert.deepEqual(dup.duplicates, [{ type: "固鎖", name: "3-60", slots: [1, 2] }]);
  assert.equal(dup.passed, false);
  const clean = checkDeckDuplicates(["A｜蒼龍神劍", "C｜鳳凰", "F｜z"], ix);
  assert.equal(clean.passed, true);
  assert.equal(checkDeckDuplicates(["F｜z", "G｜w", "A｜蒼龍神劍"], ix).passed, true, "飛龍 twice is allowed");
  assert.deepEqual(checkDeckDuplicates(["D｜x", "E｜y", "A｜蒼龍神劍"], ix).duplicates, [{ type: "紋章鎖", name: "戰神", slots: [1, 2] }]);
  assert.equal(checkDeckDuplicates(["A｜蒼龍神劍", "A｜蒼龍神劍", "C｜鳳凰"], ix).duplicates.length, 3, "the same config chosen twice");
});

test("D-03 Q7: custom, empty or ambiguous beys are 'not checked' and never 'passed'", () => {
  const ix = index(CONFIGS);
  const custom = checkDeckDuplicates(["A｜蒼龍神劍", "自己寫的", "C｜鳳凰"], ix);
  assert.equal(custom.passed, false);
  assert.deepEqual(custom.unchecked.map(slot => [slot.number, slot.status]), [[2, "custom"]]);
  assert.deepEqual(checkDeckDuplicates(["A｜蒼龍神劍", "", "S｜同名"], ix).unchecked.map(slot => slot.status), ["empty", "ambiguous"]);
  // Two identical rows (same parts) under one text are not ambiguous.
  assert.equal(checkDeckDuplicates(["X｜1"], index([row(["X", "1", "-", "-", "-", "-", "-", "1-60", "A"], "-"), row(["X", "1", "-", "-", "-", "-", "-", "1-60", "A"], "-")])).slots[0].status, "checked");
});

test("D-04 the dialog saves through the existing addMatch and closes only when the match is stored", async () => {
  const { mock, page } = await openPage([tournament("t1", [])]);
  page.setMatchDialog("t1");
  page.window.openMatchDialog("t1");
  setMatchForm(page, "t1", { opponent: "", deck: ["A", "", "C"] });
  await page.window.addMatchFromDialog("t1");
  assert.match(page.alerts.at(-1), /每局請填寫或選擇 3 顆陀螺/);
  assert.equal(mock.stats.transactions, 0, "addMatch's own validation still applies");
  setMatchForm(page, "t1", { opponent: "阿明", deck: ["A", "B", "C"] });
  await page.window.addMatchFromDialog("t1");
  const saved = server(mock)[0].matches;
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].deck.map(item => item.configText), ["A", "B", "C"]);
  assert.equal(saved[0].opponentName, "阿明");
  assert.deepEqual(saved[0].rounds, []);
  // Closed after success: a second press does nothing.
  await page.window.addMatchFromDialog("t1");
  assert.equal(server(mock)[0].matches.length, 1);
  assert.equal(mock.stats.transactions, 1);
});

test("D-05 the dialog does nothing for another tournament or a finished one; direct advance keeps its meaning", async () => {
  const { mock, page } = await openPage([tournament("t1", []), tournament("t2", [], { isFinished: true })]);
  page.setMatchDialog("t2");
  page.window.openMatchDialog("t2");
  setMatchForm(page, "t2", { opponent: "x", deck: ["A", "B", "C"] });
  await page.window.addMatchFromDialog("t2");
  page.setMatchDialog("t1");
  page.window.openMatchDialog("t1");
  await page.window.addMatchFromDialog("t2");
  assert.equal(mock.stats.transactions, 0);
  await page.window.addDirectAdvance("t1", "walkover");
  const advance = server(mock)[0].matches[0];
  assert.deepEqual({ ...advance, id: "x" }, { id: "x", advancementType: "walkover", opponentName: "對手未到", deck: [], rounds: [] });
});

/* ---------- 7-4c: edit-match panel (T16 approved exception) ---------- */

test("E-01 untouched fields keep the stored values exactly; a changed field is trimmed and classified", async () => {
  const stored = { id: "m1", opponentName: " 阿明 ", deck: [{ source: "config", configText: "A " }, { source: "custom", configText: "B" }, { source: "custom", configText: "C" }], rounds: [round("r1", "win", "spin")] };
  const { mock, page } = await openPage([tournament("t1", [stored])]);
  page.setMatchEditPanel(async (match, defaults) => ({ opponentName: defaults.opponentName, decks: [defaults.deck1, "  新陀螺  ", defaults.deck3] }));
  await page.window.editMatch("t1", "m1");
  const saved = server(mock)[0].matches[0];
  assert.equal(saved.opponentName, " 阿明 ", "untouched opponent name kept as stored");
  assert.deepEqual(saved.deck, [{ source: "config", configText: "A " }, { source: "custom", configText: "新陀螺" }, { source: "custom", configText: "C" }]);
  assert.deepEqual(saved.rounds.map(item => item.id), ["r1"], "rounds untouched");
  assert.equal(mock.stats.transactions, 1);
});

test("E-02 cancelling or a blank bey writes nothing and leaves no draft", async () => {
  const { mock, page } = await openPage([tournament("t1", [match("m1")])]);
  page.setMatchEditPanel(async () => null);
  await page.window.editMatch("t1", "m1");
  page.setMatchEditPanel(async (m, defaults) => ({ opponentName: "x", decks: [defaults.deck1, "   ", defaults.deck3] }));
  await page.window.editMatch("t1", "m1");
  assert.match(page.alerts.at(-1), /3 顆陀螺不可空白/);
  assert.equal(mock.stats.transactions, 0);
  assert.equal(page.api.matchEditDrafts.size, 0);
  assert.equal(server(mock)[0].matches[0].opponentName, "對手m1");
});

test("E-03 mutation: without the field-level collision check another device's change is overwritten (M1 tests catch it)", async () => {
  const collisionLine = "      if (otherChanged && latestValues[field] !== draft.values[field]) collisions.push(field);";
  const run = async (source, confirms) => {
    const mock = createMockFirestore();
    seed(mock, [tournament("t1", [match("m1")])]);
    const page = await createTournamentPage({ mock, source, saveTimeoutMs: 60, verifyTimeoutMs: 60, slowNoticeMs: 20 });
    await page.signIn("account-a");
    page.queuePrompts("我的對手", "A", "B", "C");
    mock.setOnline(false);
    await page.window.editMatch("t1", "m1");
    mock.setOnline(true);
    const records = mock.read(A).tournamentRecords;
    records[0].matches[0].opponentName = "雲端對手";
    mock.externalMerge(A, { tournamentRecords: records });
    await page.signIn("account-a");
    page.queueConfirms(...confirms);
    page.queuePrompts(value => value, value => value, value => value, value => value);
    await page.window.editMatch("t1", "m1");
    return { name: mock.read(A).tournamentRecords[0].matches[0].opponentName, asked: page.confirms.some(text => text.includes("你和其他裝置都修改了")) };
  };
  const source = loadTournamentSource().replace(/\r\n/g, "\n");
  assert.ok(source.includes(collisionLine));
  // Real code: the collision is shown ("use the cloud value"), then the final confirmation.
  assert.deepEqual(await run(source, [false, true]), { name: "雲端對手", asked: true }, "the real code asks and keeps the cloud value");
  // Mutant: no collision is shown; the user only confirms the save.
  const mutant = await run(source.replace(collisionLine, ""), [true]);
  assert.deepEqual(mutant, { name: "我的對手", asked: false }, "the mutant silently overwrites the other device's change");
});
