// Phase 7-FINAL usability fixes (design/phase7/14-final-acceptance-report.md §9).
// Display, navigation and confirm texts only: deletion targets, D1 impact,
// stock identity, sessions and saves are unchanged. Runs the real script.js in
// tests/helpers/config-page-harness.mjs and the real pure modules.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { formatImpactText } from "../collection-view.js";
import { createMockFirestore, userDocPath } from "./helpers/mock-firestore.mjs";
import { createConfigPage, stockItem } from "./helpers/config-page-harness.mjs";

const PATH = userDocPath("user-a");

function seed({ beybladeTable = [], partTable = [], configTable = [] } = {}) {
  return { updatedAt: 1, ownerUid: "user-a", ownerEmail: "a@example.test", beybladeTable, partTable, configTable, historyTable: [] };
}

async function openPage(data, { signIn = true } = {}) {
  const mock = createMockFirestore();
  mock.seed(PATH, seed(data));
  const page = createConfigPage({ mock });
  if (signIn) {
    page.signIn();
    page.deliver();
    await page.settle();
  }
  return { mock, page };
}

const buttonFor = row => ({ closest: selector => (selector === "tr" ? row : null) });
const rows = (page, table) => [...page.dom.tables[table].tbody.rows];

/* ---------- P2-1: names that differ only in whitespace ---------- */

test("F-01 D1 text: the default output is unchanged; a name formatter marks names (display only)", () => {
  const impact = { shortages: [{ type: "軸心", name: "A  B", held: 1, ref: 2, configs: ["甲"] }], unmatched: [], alreadyShort: [] };
  const plain = formatImpactText(impact);
  assert.match(plain, /・軸心 A  B：持有 1，配置引用 2/);
  const marked = formatImpactText(impact, { formatName: name => name.replace(/ {2}/g, "␣␣") });
  assert.match(marked, /・軸心 A␣␣B：持有 1/);
  assert.equal(impact.shortages[0].name, "A  B", "the data is not changed");
});

test("F-02 part delete: the confirm shows which whitespace variant; cancel writes nothing; confirm removes exactly that row", async () => {
  const { mock, page } = await openPage({ partTable: [{ cells: ["軸心", "A B", "1"] }, { cells: ["軸心", "A  B", "1"] }] });
  const target = rows(page, "partTable").find(row => row.cells[1].innerText === "A  B");
  assert.ok(target);
  page.effects.confirmAnswers.push(false);
  await page.window.deleteRow(buttonFor(target));
  assert.match(page.effects.confirms.at(-1), /確定要刪除「軸心：A␣␣B，數量 1」嗎？/);
  assert.equal(mock.stats.commits, 0);
  assert.equal(rows(page, "partTable").length, 2);
  page.effects.confirmAnswers.push(true);
  await page.window.deleteRow(buttonFor(target));
  await page.settle();
  assert.deepEqual(mock.read(PATH).partTable.map(item => item.cells[1]), ["A B"], "the single-space part is kept exactly");
  assert.equal(mock.stats.commits, 1);
});

/* ---------- P3-1: set size ---------- */

test("F-03 a three-bey set: the confirm says 3 and lists the three; cancel writes nothing; confirm removes the same three", async () => {
  const set = name => stockItem("UX-21", name, "-", "Z", { stockSetInstanceId: "set-1", stockProductCode: "UX-21" });
  const { mock, page } = await openPage({ beybladeTable: [set("甲"), set("乙"), set("丙"), stockItem("BX-01", "其他", "3-60", "F")] });
  const first = rows(page, "beybladeTable").find(row => row.cells[1].innerText === "甲");
  assert.equal(first.dataset.stockSetInstanceId, "set-1");
  page.effects.confirmAnswers.push(false);
  await page.window.deleteRow(buttonFor(first));
  assert.match(page.effects.confirms.at(-1), /^「UX-21」是 3 顆陀螺套組。確定要一起刪除「甲、乙、丙」嗎？/);
  assert.doesNotMatch(page.effects.confirms.at(-1), /雙陀螺/);
  assert.equal(mock.stats.commits, 0);
  page.effects.confirmAnswers.push(true);
  await page.window.deleteRow(buttonFor(first));
  await page.settle();
  assert.deepEqual(mock.read(PATH).beybladeTable.map(item => item.cells[1]), ["其他"]);
  assert.equal(mock.stats.commits, 1);
});

/* ---------- P2-2: quick entries from another page ---------- */

async function quickEntryPage(hash, { signIn = true } = {}) {
  const mock = createMockFirestore();
  mock.seed(PATH, seed({ partTable: [{ cells: ["軸心", "A", "1"] }] }));
  const page = createConfigPage({ mock });
  const callbacks = [];
  page.context.onAuthStateChanged = (auth, callback) => callbacks.push(callback);
  page.context.location.hash = hash;
  page.context.installQuickEntries();
  const auth = user => callbacks.forEach(callback => callback(user));
  return { mock, page, auth, signIn };
}

test("F-04 #configQuickEditor from another page opens the editor once the data is writable, once", async () => {
  const { mock, page, auth } = await quickEntryPage("#configQuickEditor");
  assert.equal(page.editorOpen(), false, "nothing before the data is loaded");
  auth({ uid: "user-a" });
  page.signIn();
  assert.equal(page.editorOpen(), false, "still loading");
  page.deliver();
  await page.settle();
  assert.equal(page.editorOpen(), true);
  page.context.closeConfigQuickEditor();
  page.context.updateDataAccessUi();
  assert.equal(page.editorOpen(), false, "not opened a second time");
  assert.equal(mock.stats.commits, 0, "navigation writes nothing");
});

test("F-05 signed out, a failed load, another account or a changed hash drop the pending entry", async () => {
  // Signed out on arrival: a later sign-in does not open it.
  let ctx = await quickEntryPage("#configQuickEditor");
  ctx.auth(null);
  ctx.auth({ uid: "user-a" });
  ctx.page.signIn();
  ctx.page.deliver();
  await ctx.page.settle();
  assert.equal(ctx.page.editorOpen(), false);
  // Account switch before the data is ready.
  ctx = await quickEntryPage("#configQuickEditor");
  ctx.auth({ uid: "user-a" });
  ctx.auth({ uid: "user-b" });
  ctx.page.signIn();
  ctx.page.deliver();
  await ctx.page.settle();
  assert.equal(ctx.page.editorOpen(), false);
  // The user moved on to another hash before the data was ready.
  ctx = await quickEntryPage("#configQuickEditor");
  ctx.auth({ uid: "user-a" });
  ctx.page.context.location.hash = "#configSection";
  ctx.page.signIn();
  ctx.page.deliver();
  await ctx.page.settle();
  assert.equal(ctx.page.editorOpen(), false);
  // A failed load drops it.
  ctx = await quickEntryPage("#configQuickEditor");
  ctx.auth({ uid: "user-a" });
  const token = ctx.page.signIn();
  assert.equal(ctx.page.context.quickEntryState().hash, "#configQuickEditor", "pending while loading");
  ctx.page.page.guard.markError(token);
  ctx.page.context.runPendingQuickEntry();
  assert.equal(ctx.page.context.quickEntryState().hash, "", "a failed load drops it");
  assert.equal(ctx.page.editorOpen(), false);
  assert.equal(ctx.mock.stats.commits, 0);
});

test("F-06 the pending entry runs through the existing entry points only and never writes", () => {
  const script = fs.readFileSync("script.js", "utf8").replace(/\r\n/g, "\n");
  const block = script.slice(script.indexOf("/* ===== Phase 7-FINAL usability fixes: start"), script.indexOf("/* ===== Phase 7-FINAL usability fixes: end"));
  assert.doesNotMatch(block, /saveData|runTransaction|setDoc|updateDoc|deleteDoc|innerText\s*=|insertRow|setTimeout\(/);
  assert.match(block, /openConfigQuickEditor\(\)/);
  assert.match(block, /applyCollectionHash\(hash, \{ scroll: false \}\)/);
  assert.match(script, /if \(typeof runPendingQuickEntry === "function"\) runPendingQuickEntry\(\);/);
  assert.doesNotMatch(script, /if \(location\.hash === "#configQuickEditor"\) \{\n    openConfigQuickEditor\(\);/);
});

/* ---------- P3-2 / P3-7: wording ---------- */

test("F-07 user-visible text: 拆解紀錄 everywhere; the 3on3 note names its source and limits", () => {
  for (const file of ["script.js", "collection-sync.js", "user-view.html", "admin.html", "guide.html", "home.html", "privacy.html", "index.html"]) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /歷史測試|歷史紀錄/, file);
  }
  const sync = fs.readFileSync("collection-sync.js", "utf8");
  assert.match(sync, /historyTable: "拆解紀錄"/);
  const tournament = fs.readFileSync("tournament.js", "utf8");
  assert.match(tournament, /參考官方大賽規則 B4 レギュレーション第 12 版（2026-03-13 施行）/);
  assert.match(tournament, /不代表已確認所有官方賽制限制；實際比賽請依主辦方規則。只提示，不阻擋儲存。/);
});
