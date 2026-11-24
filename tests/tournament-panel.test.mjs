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
