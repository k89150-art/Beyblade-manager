// Phase 7-4: the tournament side's protected sections (spec 13 §1.6) and its
// own write-path baseline. The UI work of 7-4a/7-4b/7-4c may only change the
// rendering; T16 (editMatch) is the one approved exception (7-4c).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const sha = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
function between(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `start marker: ${start}`);
  assert.equal(source.indexOf(start, from + 1), -1, `start marker is unique: ${start}`);
  if (end === null) return source.slice(from);
  const to = source.indexOf(end, from + 1);
  assert.ok(to > from, `end marker: ${end}`);
  return source.slice(from, to);
}
const count = (source, text) => source.split(text).length - 1;

const sync = read("tournament-sync.js");
const page = read("tournament.js");

const SYNC = [
  ["S1 codes and messages", "export const TOURNAMENT_OPERATION_TYPES", "export class TournamentSyncError", "7a4813251d56d938"],
  ["S2 operation creation", "export function createTournamentOperation(", "// Reads tournamentRecords from a document.", "84ef22601aa39811"],
  ["S3 apply, conflict check, idempotency", "export function readTournamentRecordsField(", "function patchMatches(", "e96de67f87d464de"],
  ["S4 applied verification", "function patchMatches(", "// Firebase Web SDK 11.2.0 retries these codes itself", "d5abaff383c3fa94"],
  ["S5 transaction protocol and retry", "// Firebase Web SDK 11.2.0 retries these codes itself", "export function classifyTournamentSaveFailure(", "1d38fb31c2a4135e"],
  ["S6 failure classification and wait", "export function classifyTournamentSaveFailure(", null, "c8b670e079f4b596"]
];

const BEGIN = "/* ===== D-017 tournament transactions: begin ===== */";
const END = "/* ===== D-017 tournament transactions: end ===== */";
const PAGE = [
  ["T1 score constants", "const SCORE_TYPES = {", "let currentUser = null;", "cb17b55681c7bd92"],
  ["T2 write gating", "function updateDataAccessUi(", "async function loginWithGoogle(", "4745f91fa8a76430"],
  ["T3 config menu text", "function buildConfigTextFromCells(", "function getDeckValue(", "b9f4c8eded3e12e7"],
  ["T4 scoring, completion, standing", "function calculateMatchScore(", "function renderTournamentList(", "8d64ce662dee876d"],
  ["T5 server load", "async function loadTournamentData(", BEGIN, "f204b4a3af1cb7a1"],
  ["T7 constants and state", BEGIN, "function isTournamentSaveBusy(", "bc8f09d505c33816"],
  ["T8 busy, adopt, SDK runner", "function isTournamentSaveBusy(", "function reportTournamentSaveFailure(", "b1d725abbb7fed71"],
  ["T9 result-unknown confirmation and late commit", "function reportTournamentSaveFailure(", "// Runs one operation against the latest server copy.", "ed923ae03b556771"],
  ["T10 submitTournamentOperation", "// Runs one operation against the latest server copy.", "const MATCH_EDIT_FIELDS = Object.freeze(", "a1d3e5fbc1831779"],
  ["T11 form drafts", "/* ----- unsaved form drafts (memory only, tied to one account) ----- */", "// Drafts never follow a sign-out or an account switch.", "6f012162f46072f6"],
  ["T12 draft account isolation", "// Drafts never follow a sign-out or an account switch.", "// Re-submitting an unchanged add form after an unclear result reuses the same", "52d07486d483103a"],
  ["T13 add-id reuse (L5)", "// Re-submitting an unchanged add form after an unclear result reuses the same", "function retryTournamentDataLoad(", "c3e722329c5613d8"],
  ["T15 tournament edit dialog merge", "// The dialog stays open until the save is confirmed", "window.editTournament = async function", "3a05b0e6a0de5d76"],
  ["T17 auth change and account isolation", "onAuthStateChanged(auth, user => {", null, "69dc7d5615d7584d"]
];

// T16 is the approved 7-4c exception (editMatch: prompt() → one panel). T14 and
// T6 contain T16, so they change with it and nothing else: the handlers other
// than editMatch are pinned separately below.
const T16_BEFORE = "73137bfdbaaf7c12";
// Hashes taken from 049b0e6 (v1.17.0), before Phase 7-4.
const HANDLERS_WITHOUT_T16 = [
  ["T14a addTournament … addDirectAdvance", "window.addTournament = async function", "window.editMatch = async function", "1a061e9549cb57a6"],
  ["T14b deleteMatch … deleteRound", "window.deleteMatch = async function", END, "ef3932b1c7bd868c"]
];

test("P-01 tournament-sync.js is byte-for-byte unchanged and every section keeps its hash", () => {
  assert.equal(sha(sync), "1cb48b722b4de582");
  for (const [name, start, end, hash] of SYNC) assert.equal(sha(between(sync, start, end)), hash, name);
});

test("P-02 tournament.js protected sections keep their hashes", () => {
  for (const [name, start, end, hash] of PAGE) assert.equal(sha(between(page, start, end)), hash, name);
});

test("P-03 the write handlers other than editMatch are unchanged", () => {
  for (const [name, start, end, hash] of HANDLERS_WITHOUT_T16) assert.equal(sha(between(page, start, end)), hash, name);
});

// 7-4c (approved T16 exception, spec 13 Q4): 73137bfdbaaf7c12 → 0b152288040815c0.
// Only the input segment changed (four prompt() calls → openMatchEditPanel,
// untouched fields keep their stored values): the draft merge before it and
// the final confirmation, draft and operation after it are byte-identical to
// the original (prefix 7cbde7b9cc28e9e2, suffix 7a5b363512fea2f9).
const T16_AFTER = "0b152288040815c0";
test("P-05 T16 editMatch: only the approved input segment changed", () => {
  const t16 = between(page, "window.editMatch = async function", "window.deleteMatch = async function");
  assert.notEqual(sha(t16), T16_BEFORE);
  assert.equal(sha(t16), T16_AFTER);
  assert.equal(sha(t16.slice(0, t16.indexOf("  // Phase 7-4c (approved T16 exception)"))), "7cbde7b9cc28e9e2", "draft merge and collision choice unchanged");
  assert.equal(sha(t16.slice(t16.indexOf("  const finalValues = { opponentName: patch.opponentName };"))), "7a5b363512fea2f9", "final confirmation, draft and EDIT_MATCH operation unchanged");
  assert.doesNotMatch(page, /\bprompt\(\s*["`]/, "no prompt() left");
});

test("P-04 tournament write paths stay at the D-017 baseline (not the collection side's 17/1/0)", () => {
  assert.equal(count(page, "runTransaction("), 1);
  assert.equal(count(page, "submitTournamentOperation("), 11, "1 definition + 10 write entry points");
  assert.equal(count(page, "createTournamentOperation("), 10);
  assert.equal(count(page, "transaction.update("), 1);
  assert.equal(count(page, "transaction.set("), 1);
  assert.equal(count(page, "getDocFromServer("), 2);
  for (const call of ["setDoc(", "updateDoc(", "deleteDoc(", "writeBatch(", "addDoc(", "onSnapshot("]) {
    assert.equal(count(page, call), 0, `tournament.js ${call}`);
    assert.equal(count(sync, call), 0, `tournament-sync.js ${call}`);
  }
  assert.equal(count(sync, "runTransaction("), 0);
  assert.match(page, /const TOURNAMENT_CLIENT_VERSION = "賽事儲存版本：4B-1（交易保護）";/);
});
