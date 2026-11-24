// Phase 7-2a (T1 tabs, R2 display layer, Q1 add forms, D-020 quick add).
// Pure helpers from collection-view.js, static safety checks on the page, and
// the Q1 account-change reset run through the real handleAuthStateChange.
// Layout-dependent checks (innerText of the clip-hidden tables, tab switching
// on the real markup) run in a browser: design/phase7/verification/phase7-2a/.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  COLLECTION_VIEW_TABS,
  buildPartItems,
  buildStockItems,
  collectionHashTarget,
  isAddPanelOpen,
  listNotice,
  otherTab,
  rowSignature,
  VIEW_MODE_STORAGE_KEY,
  defaultListControls,
  filterPartsByStatus,
  filterStockByControls,
  filterStockItems,
  listCountText,
  normalizeListControls,
  normalizeViewMode,
  partStatus,
  sortPartItems,
  sortStockItems
} from "../collection-view.js";
import vm from "node:vm";
import { createMockFirestore, userDocPath } from "./helpers/mock-firestore.mjs";
import { createManagerDevice, partRow } from "./helpers/manager-page-harness.mjs";
import { innerTextNodes } from "./helpers/config-page-harness.mjs";

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const script = read("script.js");
const styles = read("style.css");
const between = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + 1);
  assert.ok(a >= 0 && b > a, `missing range ${start}`);
  return source.slice(a, b);
};
const viewBlock = between(script, "/* ===== Phase 7-2a collection view (R2): begin", "/* ===== Phase 7-2a collection view (R2): end");
// Code only (comments removed) for "never uses X" checks.
const viewCode = viewBlock.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ---------- pure helpers ---------- */

test("hash targets: D-020 quick add and section links map to the right tab", () => {
  assert.deepEqual(collectionHashTarget("#add-collection"), { tab: "stock", quickAdd: true, focus: "model" });
  assert.deepEqual(collectionHashTarget("#add-part"), { tab: "parts", quickAdd: true, focus: "partName" });
  assert.deepEqual(collectionHashTarget("#collectionSection"), { tab: "stock", quickAdd: false, focus: null });
  assert.deepEqual(collectionHashTarget("#inventorySection"), { tab: "parts", quickAdd: false, focus: null });
  for (const hash of ["", "#configSection", "#historySection", "#configQuickEditor", "#add-tournament", "#unknown"]) {
    assert.equal(collectionHashTarget(hash), null, hash);
  }
  assert.equal(otherTab("stock"), "parts");
  assert.equal(otherTab("parts"), "stock");
  assert.equal(COLLECTION_VIEW_TABS.stock.section, "collectionSection");
  assert.equal(COLLECTION_VIEW_TABS.parts.section, "inventorySection");
});

test("Q1: the add form opens by itself only while the list is empty, unless the user chose", () => {
  assert.equal(isAddPanelOpen(null, 0), true);
  assert.equal(isAddPanelOpen(null, 3), false);
  assert.equal(isAddPanelOpen(true, 3), true);
  assert.equal(isAddPanelOpen(false, 0), false);
});

test("list notices: signed out, loading, empty, no match", () => {
  assert.match(listNotice({ signedIn: false, kind: "stock" }), /登入後會顯示你的收藏/);
  assert.match(listNotice({ signedIn: true, loading: true, total: 0, shown: 0, kind: "parts" }), /正在載入/);
  assert.match(listNotice({ signedIn: true, loading: false, total: 0, shown: 0, kind: "stock" }), /尚無收藏/);
  // Phase 7-2b (P2): the parts tab lists every held part, not only extra rows.
  assert.match(listNotice({ signedIn: false, kind: "parts" }), /登入後會顯示你的零件/);
  assert.match(listNotice({ signedIn: true, loading: false, total: 0, shown: 0, kind: "parts" }), /尚無零件。加入原裝收藏，或按「新增額外零件」開始/);
  assert.match(listNotice({ signedIn: true, loading: false, total: 4, shown: 0, kind: "parts" }), /沒有符合條件的零件/);
  assert.match(listNotice({ signedIn: true, loading: false, total: 4, shown: 0, kind: "stock" }), /沒有符合條件的收藏/);
  assert.equal(listNotice({ signedIn: true, loading: false, total: 4, shown: 4, kind: "parts" }), "");
});

test("stock items keep table order, one item per row (duplicates and sets stay separate)", () => {
  const snap = (key, cells, meta = {}) => ({ key, cells, mainStockName: "-", meta, display: { title: cells[1], parts: [{ type: "上蓋", value: cells[1], tone: "layer" }, { type: "固鎖", value: "-", tone: "ratchet" }] }, actions: { delete: true } });
  const items = buildStockItems([
    snap("r1", ["BX-01", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"], { stockAutoFilled: "true" }),
    snap("r2", ["BX-01", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"], { stockAutoFilled: "true" }),
    snap("r3", ["BX-00", "歐比王肯諾比", "-", "-", "-", "-", "-", "4-60", "P"], { stockAutoFilled: "true", stockSetInstanceId: "set-1" }),
    snap("r4", ["UX-01", "手動陀螺", "-", "-", "-", "-", "-", "1-60", "A"])
  ]);
  assert.deepEqual(items.map(item => item.key), ["r1", "r2", "r3", "r4"]);
  assert.deepEqual(items.map(item => [item.manual, item.inSet]), [[false, false], [false, false], [false, true], [true, false]]);
  assert.deepEqual(items[0].parts.map(part => part.type), ["上蓋"], "\"-\" parts are not shown");
  assert.equal(items[0].series, "BX");
  assert.equal(items[0].canDelete, true);
});

test("part items: same filter and search as the table, existing type rank, stable order", () => {
  const rank = type => ["上蓋", "固鎖", "軸心"].indexOf(type);
  const snaps = [["軸心", "F", "1"], ["固鎖", "3-60", "2"], ["軸心", "雙  空白", "1"], ["上蓋", "蒼龍神劍", "1"], ["軸心", "F", "3"]]
    .map((cells, index) => ({ key: `p${index}`, cells, actions: { edit: true, delete: true } }));
  assert.deepEqual(buildPartItems(snaps, { rank }).map(item => item.key), ["p3", "p1", "p0", "p2", "p4"]);
  assert.deepEqual(buildPartItems(snaps, { rank, matchesType: type => type === "軸心" }).map(item => item.key), ["p0", "p2", "p4"]);
  assert.deepEqual(buildPartItems(snaps, { rank, query: "  3-60 " }).map(item => item.key), ["p1"]);
  assert.deepEqual(buildPartItems(snaps, { rank, query: "軸心 f" }).map(item => item.key), ["p0", "p4"]);
  const editing = snaps.map(snapshot => ({ ...snapshot, editing: snapshot.key === "p1" }));
  assert.deepEqual(buildPartItems(editing, { rank, matchesType: type => type === "軸心" }).map(item => item.key), ["p1", "p0", "p2", "p4"], "a row being edited stays visible");
});

test("row signature changes with cells, main stock name or metadata", () => {
  const base = { cells: ["CX-03", "x", "紋章鎖", "超越/金屬"], mainStockName: "", meta: { stockAutoFilled: "true" } };
  assert.equal(rowSignature(base), rowSignature({ ...base }));
  assert.notEqual(rowSignature(base), rowSignature({ ...base, mainStockName: "超越/金屬" }));
  assert.notEqual(rowSignature(base), rowSignature({ ...base, meta: {} }));
  assert.notEqual(rowSignature(base), rowSignature({ ...base, cells: [...base.cells.slice(0, 3), "超越／金屬"] }));
});

/* ---------- page markup ---------- */

test("T1: tabs and panels keep the existing section ids; the original tables are outside both panels", () => {
  assert.match(html, /<div id="collectionTabs" class="collection-tabs" role="tablist" aria-label="收藏分頁" hidden>/);
  assert.match(html, /role="tab" id="collectionTabStock"[^>]*aria-controls="collectionSection" aria-selected="true"/);
  assert.match(html, /role="tab" id="collectionTabParts"[^>]*aria-controls="inventorySection" aria-selected="false" tabindex="-1"/);
  const collection = between(html, '<section id="collectionSection"', "</section>");
  const inventory = between(html, '<section id="inventorySection"', "</section>");
  for (const section of [collection, inventory]) {
    assert.doesNotMatch(section, /id="beybladeTable"|id="partTable"/, "no original table inside a tab panel");
  }
  // Phase 7-3b: the config tab bar now sits between these sources and #configSection.
  const sources = between(html, '<div id="collectionSourceTables"', '<div id="configTabs"');
  assert.match(sources, /<div id="beybladeSourceBox" class="source-table-box" data-source-table="beybladeTable">[\s\S]*<table id="beybladeTable">/);
  assert.match(sources, /<div id="partSourceBox" class="source-table-box" data-source-table="partTable">[\s\S]*<table id="partTable">/);
  assert.doesNotMatch(sources, /\shidden[\s>]|display:\s*none|visibility/, "the source area is never hidden in markup");
  // Original table markup unchanged: same headers, empty bodies.
  const headers = id => [...between(html, `<table id="${id}">`, "</table>").matchAll(/<th>([^<]+)<\/th>/g)].map(match => match[1]);
  assert.deepEqual(headers("beybladeTable"), ["型號", "上蓋", "紋章鎖", "主要戰刃", "超越戰刃", "金屬戰刃", "輔助戰刃", "固鎖", "軸心", "操作"]);
  assert.deepEqual(headers("partTable"), ["類別", "零件名稱", "數量", "操作"]);
  assert.equal((html.match(/<div class="table-wrap record-card-wrap collection-card-wrap">/g) || []).length, 1);
});

test("Q1: add forms stay where they were, wrapped in collapsible panels with the same ids and handlers", () => {
  const collection = between(html, '<section id="collectionSection"', "</section>");
  const inventory = between(html, '<section id="inventorySection"', "</section>");
  assert.match(collection, /id="collectionAddToggle" class="add-panel-toggle" data-add-toggle="stock" aria-expanded="true" aria-controls="collectionAddBody" hidden>新增收藏</);
  assert.match(inventory, /id="inventoryAddToggle" class="add-panel-toggle" data-add-toggle="parts" aria-expanded="true" aria-controls="inventoryAddBody" hidden>新增額外零件</);
  const stockBody = between(collection, '<div id="collectionAddBody"', 'id="stockViewList"');
  for (const id of ["model", "stockAutoPreview", "stockManualFields", "layer", "lock", "primaryBlade", "transcendBlade", "metalBlade", "aux", "fix", "axis", "addCollectionBtn"]) {
    assert.match(stockBody, new RegExp(`id="${id}"`), id);
  }
  assert.match(stockBody, /onclick="addRow\(\)"/);
  const partBody = between(inventory, '<div id="inventoryAddBody"', 'id="partViewList"');
  for (const id of ["partType", "partName", "partCount"]) assert.match(partBody, new RegExp(`id="${id}"`), id);
  assert.match(partBody, /onclick="addPart\(\)"/);
  assert.match(inventory, /<div id="partViewList" class="collection-view-list" aria-label="額外零件清單" hidden><\/div>/);
  assert.match(collection, /<div id="stockViewList" class="collection-view-list" aria-label="原裝陀螺清單" hidden><\/div>/);
});

test("cache versions for the changed files", () => {
  assert.match(html, /<link rel="stylesheet" href="style\.css\?v=20261125-phase73c" \/>/);
  assert.match(html, /<script type="module" src="script\.js\?v=20261125-phase73d"><\/script>/);
  assert.match(script, /from "\.\/collection-view\.js\?v=20261124-phase72d";/);
  // v1.18.0 only changes SITE_VERSION in site-menu.js; the D-020 navigation itself is unchanged.
  assert.match(html, /<script src="site-menu\.js\?v=20261125-v1180"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="site-menu\.css\?v=20261124-v1100" \/>/);
});

/* ---------- K-1 hiding rules ---------- */

test("K-1: original tables are only clip-hidden (class + inert + aria-hidden), never display:none / hidden / visibility", () => {
  const css = between(styles, "/* ===== Phase 7-2a: collection / parts tabs", "@media (max-width: 820px) {\n  .collection-view-list")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.source-table-box\.is-source-hidden \{\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  margin: 0;\n  padding: 0;\n  border: 0;\n  overflow: hidden;\n  clip-path: inset\(50%\);\n  white-space: normal;\n\}/);
  assert.doesNotMatch(css, /visibility|content-visibility|text-transform/);
  assert.doesNotMatch(css, /\.source-table-box(\.is-source-hidden)?\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /#(beybladeTable|partTable)[^{]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(styles, /#(beybladeTable|partTable)[^{,]*\{[^}]*visibility:\s*hidden/);
  const setHidden = between(viewBlock, "function setSourceBoxHidden(", "function setAddPanelOpen(");
  assert.match(setHidden, /box\.classList\.toggle\("is-source-hidden", hidden\);/);
  assert.match(setHidden, /box\.toggleAttribute\("inert", hidden\);/);
  assert.match(setHidden, /box\.setAttribute\("aria-hidden", "true"\)/);
  assert.doesNotMatch(viewCode, /SourceBox"\)\.hidden|sourceBox\.hidden|box\.hidden|\.style\.display|visibility/);
  // Tab switching hides the panels (which hold no original table), never the source boxes.
  const setTab = between(viewBlock, "function setCollectionTab(", "// D-020:");
  assert.match(setTab, /if \(section\) section\.hidden = !active;/);
});

test("K-1: while the display layer is active the inventory filter no longer hides original rows", () => {
  const filters = between(script, "function applyInventoryFilters()", "function updateResponsiveTableCells()");
  assert.match(filters, /if \(typeof isCollectionViewActive === "function" && isCollectionViewActive\(\)\) \{\n      row\.hidden = false;\n      row\.style\.order = "";\n    \} else \{\n      row\.hidden = !visible;/);
  assert.match(filters, /row\.dataset\.inventoryTone = getInventoryTypeTone\(type\)/);
});

/* ---------- R2: no second write path ---------- */

test("R2: the display layer never writes data, cells or row metadata", () => {
  assert.doesNotMatch(viewCode, /saveData\(|setDoc|updateDoc|runTransaction|collectionSync\.|submitCollectionSave/);
  assert.doesNotMatch(viewCode, /\.innerText\s*=|cell\.textContent\s*=|row\.dataset\.\w+\s*=(?!=)|\.insertRow\(|(?<!window)\.deleteRow\(|\.remove\(\)|appendChild|insertBefore|replaceChildren/);
  assert.doesNotMatch(viewCode, /tbody[^;\n]*innerHTML/);
  // Lists are written only into the view containers.
  assert.match(viewBlock, /writeViewList\(document\.getElementById\("stockViewList"\)/);
  assert.match(viewBlock, /writeViewList\(document\.getElementById\("partViewList"\)/);
  // Reads use the same helpers as getTableData().
  const snapshot = between(viewBlock, "function readSourceRowSnapshot(", "function getStockViewDisplay(");
  assert.match(snapshot, /cells: getPersistedRowCells\(row\)/);
  assert.match(snapshot, /getPersistedStockName\(row, 3\)/);
  assert.match(snapshot, /STOCK_ROW_METADATA_KEYS\.forEach/);
  // Actions go to the existing functions with the original row's own buttons, after a freshness check.
  const action = between(viewBlock, "function runCollectionViewAction(", "// Q1 / F-04:");
  assert.match(action, /row\.isConnected && row\.closest\("table"\)\?\.id === entry\.tableId/);
  assert.match(action, /rowSignature\(current\) !== entry\.signature/);
  assert.match(action, /window\.deleteRow\(source\)/);
  assert.match(action, /window\.editRow\(source, "part"\)/);
  assert.doesNotMatch(action, /\.click\(\)/, "no synthetic clicks on inert buttons (K-2)");
  // Re-render is coalesced per frame and only writes outside the observed tbodies.
  assert.match(viewBlock, /if \(!isCollectionViewActive\(\) \|\| collectionViewState\.renderQueued\) return;/);
});

test("A-09: D-018, D-015, F-04 capture and table reads are byte-for-byte unchanged; row edit/delete only gained the approved D1 confirm text", () => {
  const sha = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  // Hashes of the same ranges in 50169d7 (Phase 7-1, before 7-2a).
  const expected = [
    ["/* ===== D-018 collection saves: begin", "/* ===== D-018 collection saves: end", "1027d4a2debc9138"],
    // Phase 7-DC (D-023, approved exception): getTableData / getHistoryData read
    // through readStoredCellText (new, in this range) and collectCurrentData
    // sorts the config table; applyDataToTables no longer normalizes model
    // cells and sorts the config table before the D-018 base. Previous hashes
    // (50169d7..21a9318): 383aeb872526af0b, 0d4c7a0a11b52e65. Covered by
    // tests/data-consistency.test.mjs.
    ["function getTableData(", "/* ===== D-018 collection saves: begin", "02f67bb21e597b3e"],
    ["function applyDataToTables(", "function startCloudListener(", "08c1de72b2266fec"],
    ["function getStoredItemExtras(", "function clearAllTables(", "70d4d345da4b1036"],
    ["function chooseStockProductForStoredItem(", "function createStockSetInstanceId(", "410384c3e2c96a4c"],
    // Phase 7-DC follow-up (D-023, approved exception): getStockNameFromCell and
    // getPersistedRowCells read stored values (readStoredCellText) so part
    // identity is category + exact stored name in every table and display
    // state. Previous hash (50169d7..776efa0): bf558aecdc0ad038. Covered by the
    // "identity:" tests in tests/data-consistency.test.mjs.
    ["function getStockNameFromCell(", "function escapeHtml(", "c1230e4d43e39ba2"],
    // Phase 7-2b (D1, approved): only the confirm() strings gained a read-only hint
    // (3 lines in deleteRow, 1 line in saveEditRow); see tests/collection-parts.test.mjs.
    // Previous hashes (50169d7..6f3f2b5): b2d3025d2f9d948b, e3d6abe8c11d47eb.
    ["window.deleteRow = async function", "/* ====== 表格內修改功能", "0bc3c60c31499a7c"],
    // Phase 7-DC follow-up (D-023, approved exception): editRow records the
    // stored values (readStoredCellText, no trim) and the editor's initial
    // control values; saveEditRow keeps untouched fields as stored and applies
    // the input rules only to changed ones; both clear editInitialValues.
    // Previous hash (6f3f2b5..776efa0): 8be3b0baca010150. Covered by the
    // "edit:" tests in tests/data-consistency.test.mjs.
    ["window.editRow = function", "function rebuildRow(", "3ec54b27ec414e19"],
    ["function captureOrphanedCollectionDraft(", "// Phase 7-2a (Q1)", "b6c58c122f6809ff"],
    ["function getTotalParts(", "function setUiSummaryValue(", "813fc6a101343c44"]
  ];
  for (const [start, end, hash] of expected) assert.equal(sha(between(script, start, end)), hash, start);
  assert.equal(fs.existsSync("collection-sync.js"), true);
});

/* ---------- Q1: account change ---------- */

test("Q1 wiring: the reset runs after the F-04 draft capture and before the screen is cleared", () => {
  const auth = between(script, "async function handleAuthStateChange(", "/* ===== F-04 auth changes: end");
  const order = ["const previousUid = currentUser ? currentUser.uid : null;", "captureOrphanedCollectionDraft(user);", "cancelSessionInteractions();",
    "resetQuickAddFormsForAccountChange(previousUid, user ? user.uid : null);", "currentUser = user;", "clearAllTables();"];
  const positions = order.map(text => auth.indexOf(text));
  positions.forEach((position, index) => assert.ok(position >= 0, order[index]));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  const reset = between(script, "const QUICK_ADD_TEXT_FIELD_IDS", "async function handleAuthStateChange(");
  assert.match(reset, /"model", "layer", "lock", "primaryBlade", "transcendBlade", "metalBlade", "aux", "fix", "axis",\n  "partName", "partCount"/);
  assert.match(reset, /return !nextUid \|\| previousUid !== nextUid;/);
  assert.doesNotMatch(reset, /orphanedCollectionDrafts|confModel|configQuickEditor|localStorage|beybladeSiteTheme|saveData/);
});

const FORM_IDS = ["model", "layer", "lock", "primaryBlade", "transcendBlade", "metalBlade", "aux", "fix", "axis", "partType", "partName", "partCount", "confModel"];
const USER_A = { uid: "user-a", email: "a@example.test" };
const USER_B = { uid: "user-b", email: "b@example.test" };
const PATH_A = userDocPath("user-a");
const PATH_B = userDocPath("user-b");

function setupQ1() {
  const mock = createMockFirestore();
  mock.seed(PATH_A, { updatedAt: 1, ownerUid: "user-a", beybladeTable: [], partTable: [partRow("A-原有")], configTable: [], historyTable: [] });
  mock.seed(PATH_B, { updatedAt: 1, ownerUid: "user-b", beybladeTable: [], partTable: [partRow("B-原有")], configTable: [], historyTable: [] });
  const A = createManagerDevice({ mock, extraElements: FORM_IDS });
  A.signIn();
  A.deliver();
  const field = id => A.elements.get(id);
  const typeHalfway = () => {
    field("model").value = "UX-01";
    field("layer").value = "手動上蓋";
    field("fix").value = "3-60";
    field("axis").value = "F";
    field("partType").value = "軸心";
    field("partName").value = "A 的零件";
    field("partCount").value = "2";
    field("confModel").value = "BX-CUSTOM-A";
  };
  return { mock, A, field, typeHalfway };
}

const formValues = field => Object.fromEntries(FORM_IDS.map(id => [id, field(id).value]));
const CLEARED = { model: "", layer: "", lock: "", primaryBlade: "", transcendBlade: "", metalBlade: "", aux: "", fix: "", axis: "", partType: "上蓋", partName: "", partCount: "" };

test("Q1-01: A types but does not submit, the tab switches to B: nothing of A stays in the add forms", async () => {
  const { mock, A, field, typeHalfway } = setupQ1();
  typeHalfway();
  const commits = mock.commitLog.length;
  await A.authChange(USER_B);
  const { confModel, ...addForms } = formValues(field);
  assert.deepEqual(addForms, CLEARED);
  assert.equal(confModel, "BX-CUSTOM-A", "Quick Editor fields are not touched by Q1");
  assert.equal(mock.commitLog.length, commits, "clearing writes nothing");
});

test("Q1-03 / sign-out: every add-form field is cleared; signing in again starts empty", async () => {
  const { A, field, typeHalfway } = setupQ1();
  typeHalfway();
  await A.authChange(null);
  assert.deepEqual((({ confModel, ...rest }) => rest)(formValues(field)), CLEARED);
  field("model").value = "typed while signed out";
  await A.authChange(USER_A);
  assert.equal(field("model").value, "", "a first sign-in also starts from empty forms");
});

test("Q1: B then back to A, each change clears", async () => {
  const { A, field } = setupQ1();
  await A.authChange(USER_B);
  field("partName").value = "B 的零件";
  await A.authChange(USER_A);
  assert.equal(field("partName").value, "");
});

test("Q1-04: a repeat event for the same account keeps what was typed", async () => {
  const { A, field, typeHalfway } = setupQ1();
  typeHalfway();
  await A.authChange(USER_A);
  assert.equal(field("model").value, "UX-01");
  assert.equal(field("partName").value, "A 的零件");
  assert.equal(field("partType").value, "軸心");
});

test("Q1-05: a cloud snapshot for the same account keeps what was typed", async () => {
  const { mock, A, field, typeHalfway } = setupQ1();
  typeHalfway();
  mock.externalMerge(PATH_A, { partTable: [partRow("A-原有"), partRow("其他裝置新增")] });
  A.deliver();
  await A.settle();
  assert.deepEqual(A.partNames(), ["A-原有", "其他裝置新增"]);
  assert.equal(field("model").value, "UX-01");
  assert.equal(field("partName").value, "A 的零件");
});

test("Q1-06 / F-04: the draft of A is captured exactly as before, without add-form text, and only A can use it", async () => {
  const { A, field, typeHalfway } = setupQ1();
  A.setOffline(true);
  await A.edit("partTable", rows => [...rows, partRow("A-未儲存")]);
  await A.settle();
  typeHalfway();
  await A.authChange(USER_B);
  assert.equal(A.drafts.length, 1);
  const [draft] = A.drafts;
  assert.equal(draft.ownerUid, "user-a");
  assert.deepEqual(draft.tables.partTable.map(row => row.cells[1]), ["A-原有", "A-未儲存"]);
  assert.doesNotMatch(JSON.stringify(draft), /UX-01|A 的零件|手動上蓋/, "add-form text is not part of the draft");
  assert.equal(field("model").value, "");
  assert.equal(A.context.buildOrphanedDraftExport().drafts.length, 0, "B cannot export the draft of A");
});

test("S1 wiring: stock search box in the stock tab, cleared on account change, re-renders on input", () => {
  const collection = between(html, '<section id="collectionSection"', "</section>");
  assert.match(collection, /<input id="stockSearchInput" type="search" autocomplete="off" placeholder="搜尋型號、名稱、零件或英文名">/);
  const reset = between(viewBlock, "function resetCollectionViewState(", "function failCollectionView(");
  assert.match(reset, /const stockSearch = document\.getElementById\("stockSearchInput"\);\n  if \(stockSearch\) stockSearch\.value = "";/);
  assert.match(viewBlock, /document\.getElementById\("stockSearchInput"\)\?\.addEventListener\("input", scheduleCollectionViewRender\);/);
  assert.match(viewBlock, /englishName: getReliableEnglishName\(stockSnapshots\[index\]\.meta\)/);
  // 7-2c: the S1 search result is then filtered by series / source and sorted (display only).
  assert.match(viewBlock, /filterStockByControls\(filterStockItems\(stockItems, document\.getElementById\("stockSearchInput"\)\?\.value \|\| ""\),/);
});

/* ---------- Phase 7-2c: V3, stock filters and sorting, part status ---------- */

const stockItem = (key, model, title, { manual = false, editing = false } = {}) => ({
  key, model, title, editing, manual,
  series: (model.toUpperCase().match(/^(BX|UX|CX)/) || [])[1] || "OTHER",
  parts: []
});
const STOCK_FIXTURE = [
  stockItem("a", "UX-01", "巫師之刃"),
  stockItem("b", "BX-10", "海神衝擊", { manual: true }),
  stockItem("c", "CX-02", "龍神之刃"),
  stockItem("d", "UX-01", "巫師之刃"),
  stockItem("e", "BX-02", "蒼龍騎士"),
  stockItem("f", "UX-12", "天馬", { manual: true }),
  stockItem("g", "ZZ-1", "其他商品", { manual: true }),
  stockItem("h", "BX-1", "惡魔")
];

// Runs the real sortTable() on a fake tbody whose rows only expose cells[0]
// (its text, as the innerText setter stores it).
function realSortTableOrder(models) {
  const pieces = [
    between(script, "function getSeriesFromModel(", "function getConfigStructureModeFromRow("),
    between(script, "const TABLE_SORT_ORDER", "function sortBeybladeTable("),
    between(script, "function readStoredCellText(", "/* ===== D-018 collection saves: begin")
  ].join("\n");
  const rows = models.map((model, index) => ({ index, dataset: {}, cells: [{ innerText: model, childNodes: innerTextNodes(model) }] }));
  const tbody = {
    rows,
    querySelector: () => null,
    querySelectorAll: () => rows.slice(),
    appendChild(row) { rows.splice(rows.indexOf(row), 1); rows.push(row); }
  };
  const context = { document: { querySelector: () => tbody } };
  vm.createContext(context);
  vm.runInContext(`${pieces}\nsortTable("beybladeTable");`, context);
  return rows.map(row => row.index);
}

test("7-2c V3: list is the default; unknown stored values fall back to the list", () => {
  assert.equal(VIEW_MODE_STORAGE_KEY, "beybladeCollectionViewMode");
  assert.equal(normalizeViewMode(null), "list");
  assert.equal(normalizeViewMode("grid"), "list");
  assert.equal(normalizeViewMode("card"), "card");
  assert.deepEqual(defaultListControls(), { stockSeries: "all", stockSource: "all", stockSort: "default", partStatus: "all", partSort: "default" });
  assert.deepEqual(normalizeListControls({ stockSeries: "OTHER", stockSource: "x", stockSort: "recent", partStatus: "over", partSort: "avail" }),
    { stockSeries: "all", stockSource: "all", stockSort: "default", partStatus: "over", partSort: "avail" });
});

test("7-2c stock filters: series (OTHER only under all) and source (manual = the existing 手動 tag)", () => {
  const keys = list => list.map(item => item.key).join("");
  assert.equal(keys(filterStockByControls(STOCK_FIXTURE)), "abcdefgh");
  assert.equal(keys(filterStockByControls(STOCK_FIXTURE, { series: "UX" })), "adf");
  assert.equal(keys(filterStockByControls(STOCK_FIXTURE, { series: "BX" })), "beh");
  assert.equal(keys(filterStockByControls(STOCK_FIXTURE, { series: "CX" })), "c");
  assert.equal(keys(filterStockByControls(STOCK_FIXTURE, { source: "manual" })), "bfg");
  assert.equal(keys(filterStockByControls(STOCK_FIXTURE, { source: "auto" })), "acdeh");
  assert.equal(keys(filterStockByControls(STOCK_FIXTURE, { series: "BX", source: "auto" })), "eh");
  const editing = [...STOCK_FIXTURE, stockItem("x", "CX-09", "修改中", { manual: true, editing: true })];
  assert.equal(keys(filterStockByControls(editing, { series: "UX", source: "auto" })), "adx", "a row being edited stays visible");
});

test("7-2c B-03: the default stock sort gives the same order as the real sortTable()", () => {
  const models = ["CX-02", "BX-10", "UX-12", "BX-2", "UX-01", "ZZ-1", "bx-1", "UX-01", "CX-10", "BX-02"];
  const items = models.map((model, index) => stockItem(String(index), model, `名稱${index}`));
  assert.deepEqual(sortStockItems(items).map(item => Number(item.key)), realSortTableOrder(models));
  assert.deepEqual(sortStockItems(items, "default").map(item => Number(item.key)), realSortTableOrder(models));
});

test("7-2c stock sorting: model, name, stable ties, input never reordered", () => {
  const before = STOCK_FIXTURE.map(item => item.key).join("");
  const keys = list => list.map(item => item.key).join("");
  assert.equal(keys(sortStockItems(STOCK_FIXTURE, "model")), "hebcadfg");
  const byName = sortStockItems(STOCK_FIXTURE, "name");
  for (let i = 1; i < byName.length; i += 1) {
    assert.ok(byName[i - 1].title.localeCompare(byName[i].title, "zh-Hant", { numeric: true, sensitivity: "base" }) <= 0);
  }
  assert.equal(keys(byName.filter(item => item.title === "巫師之刃")), "ad", "same name: table order kept");
  assert.equal(keys(sortStockItems(STOCK_FIXTURE, "unknown")), keys(sortStockItems(STOCK_FIXTURE, "default")));
  assert.equal(STOCK_FIXTURE.map(item => item.key).join(""), before, "the input array is not reordered");
});

const partEntry = (key, name, avail, editing = false) => ({ key, type: "軸心", name, avail, extraRows: editing ? [{ editing: true }] : [] });
const PART_FIXTURE = [partEntry("p1", "Ball", 2), partEntry("p2", "Accel", 0), partEntry("p3", "Flat", -1), partEntry("p4", "Needle", 0), partEntry("p5", "Rush", -3)];

test("7-2c part status: available > 0, used up = 0, over < 0; an item being edited stays visible", () => {
  assert.deepEqual(PART_FIXTURE.map(partStatus), ["available", "usedUp", "over", "usedUp", "over"]);
  const keys = list => list.map(item => item.key).join(",");
  assert.equal(keys(filterPartsByStatus(PART_FIXTURE, "all")), "p1,p2,p3,p4,p5");
  assert.equal(keys(filterPartsByStatus(PART_FIXTURE, "available")), "p1");
  assert.equal(keys(filterPartsByStatus(PART_FIXTURE, "usedUp")), "p2,p4");
  assert.equal(keys(filterPartsByStatus(PART_FIXTURE, "over")), "p3,p5");
  assert.equal(keys(filterPartsByStatus([...PART_FIXTURE, partEntry("p6", "Edit", 5, true)], "over")), "p3,p5,p6");
});

test("7-2c part sorting: default keeps the model order; name; available fewest first; stable", () => {
  const keys = list => list.map(item => item.key).join(",");
  const before = keys(PART_FIXTURE);
  assert.equal(keys(sortPartItems(PART_FIXTURE)), before);
  assert.notEqual(sortPartItems(PART_FIXTURE), PART_FIXTURE, "a copy, never the model array");
  assert.equal(keys(sortPartItems(PART_FIXTURE, "name")), "p2,p1,p3,p4,p5");
  assert.equal(keys(sortPartItems(PART_FIXTURE, "avail")), "p5,p3,p2,p4,p1");
  assert.equal(keys(PART_FIXTURE), before);
});

test("7-2c B-01 (pure): search, filters and sorting combine in any order to the same list", () => {
  const items = buildStockItems([
    { key: "1", cells: ["UX-01", "巫師之刃", "-", "-", "-", "-", "-", "3-60", "F"], meta: { stockAutoFilled: "true" }, display: { title: "巫師之刃", parts: [{ value: "3-60" }, { value: "F" }] } },
    { key: "2", cells: ["BX-02", "蒼龍騎士"], meta: {}, display: { title: "蒼龍騎士", parts: [{ value: "3-60" }] } },
    { key: "3", cells: ["UX-12", "天馬"], meta: {}, display: { title: "天馬", parts: [{ value: "3-60" }] } },
    { key: "4", cells: ["BX-10", "海神"], meta: { stockAutoFilled: "true" }, display: { title: "海神", parts: [{ value: "4-60" }] } }
  ]);
  const controls = { series: "all", source: "manual" };
  const a = sortStockItems(filterStockByControls(filterStockItems(items, "3-60"), controls), "name");
  const b = filterStockItems(sortStockItems(filterStockByControls(items, controls), "name"), "3-60");
  assert.deepEqual(a.map(item => item.key), ["3", "2"]);
  assert.deepEqual(b.map(item => item.key), a.map(item => item.key));
  assert.deepEqual(items.map(item => item.key), ["1", "2", "3", "4"], "the built items keep the table order");
  assert.equal(listCountText(2, 4, "顆"), "顯示 2 / 4 顆");
  assert.equal(listCountText(0, 0, "種"), "");
});

test("7-2c wiring: controls on the page, display-only state, reset on account change, V3 in localStorage only", () => {
  const collection = between(html, '<section id="collectionSection"', "</section>");
  const inventory = between(html, '<section id="inventorySection"', "</section>");
  ["all", "UX", "BX", "CX"].forEach(value => assert.match(collection, new RegExp(`data-stock-series="${value}"`)));
  assert.match(collection, /<select id="stockSourceFilter" autocomplete="off">[\s\S]*value="all"[\s\S]*value="auto"[\s\S]*value="manual"[\s\S]*<\/select>/);
  assert.match(collection, /<select id="stockSortSelect" autocomplete="off">[\s\S]*value="default"[\s\S]*value="model"[\s\S]*value="name"[\s\S]*<\/select>/);
  assert.match(inventory, /<select id="partStatusFilter" autocomplete="off">[\s\S]*value="all"[\s\S]*value="available"[\s\S]*value="usedUp"[\s\S]*value="over"[\s\S]*<\/select>/);
  assert.match(inventory, /<select id="partSortSelect" autocomplete="off">[\s\S]*value="default"[\s\S]*value="name"[\s\S]*value="avail"[\s\S]*<\/select>/);
  assert.equal((html.match(/data-view-toggle hidden/g) || []).length, 2);
  assert.equal((html.match(/data-list-controls="(stock|parts)" hidden/g) || []).length, 2);
  // The rendered lists: search → series/source → sort, and the parts type/search → status → sort.
  assert.match(viewBlock, /const shownStock = sortStockItems\(\n    filterStockByControls\(filterStockItems\(stockItems, [^\n]+\n      \{ series: controls\.stockSeries, source: controls\.stockSource \}\),\n    controls\.stockSort\);/);
  assert.match(viewBlock, /const shownParts = sortPartItems\(filterPartsByStatus\(filterPartItems\(partsModel\.items, \{[\s\S]*?\}\), controls\.partStatus\), controls\.partSort\);/);
  // Account change resets the filters and sorting (not the V3 preference).
  const reset = between(viewBlock, "function resetCollectionViewState(", "// Phase 7-2c: show the filter");
  assert.match(reset, /collectionViewState\.controls = defaultListControls\(\);\n  syncListControls\(\);/);
  assert.doesNotMatch(reset, /viewMode/);
  // Only the V3 mode touches storage, always inside try / catch; controls are never stored.
  const storage = viewBlock.match(/localStorage\.\w+\([^)]*\)/g) || [];
  assert.deepEqual(storage, ["localStorage.getItem(VIEW_MODE_STORAGE_KEY)", "localStorage.setItem(VIEW_MODE_STORAGE_KEY, collectionViewState.viewMode)"]);
  assert.match(between(viewBlock, "function readStoredViewMode(", "function setViewMode("), /try \{[\s\S]*\} catch \(error\) \{\n    return normalizeViewMode\(null\);/);
  assert.match(between(viewBlock, "function setViewMode(", "function installListControls("), /try \{\n    localStorage\.setItem[\s\S]*\} catch \(error\) \{/);
  assert.doesNotMatch(viewCode, /sortTable\(|sortBeybladeTable\(|\.sort\(/, "the display layer never sorts table rows (sorting is in collection-view.js on arrays)");
  // Fallback hides the new controls with the rest of the display layer.
  assert.match(between(viewBlock, "function failCollectionView(", "function installCollectionView("), /querySelectorAll\("\[data-list-controls\], \[data-view-toggle\]"\)\.forEach\(element => \{ element\.hidden = true; \}\);/);
});

test("7-2c V3 CSS: list mode only on desktop; phones always show cards and no toggle", () => {
  const block = styles.slice(styles.indexOf("/* ===== Phase 7-2c: list controls"));
  assert.match(block, /\.cv-view-toggle \{\n  display: none;/);
  const desktop = between(block, "@media (min-width: 821px) {", "@media (max-width: 820px) {");
  assert.match(desktop, /\.cv-view-toggle \{\n    display: inline-flex;/);
  assert.match(desktop, /\.collection-view-list\[data-view-mode="list"\] \{/);
  assert.equal((block.match(/data-view-mode="list"/g) || []).length, (desktop.match(/data-view-mode="list"/g) || []).length, "every list-mode rule is inside the desktop query");
  assert.doesNotMatch(block, /display:\s*none[^;]*;[^}]*source|\.source-table-box|#beybladeTable|#partTable/);
});

/* ---------- Phase 7-2d: detail panel (desktop) and sheet (phones) ---------- */

test("7-2d markup: one detail container per tab, next to its list, outside the original tables", () => {
  const collection = between(html, '<section id="collectionSection"', "</section>");
  const inventory = between(html, '<section id="inventorySection"', "</section>");
  [[collection, "stockViewList", "stockDetail"], [inventory, "partViewList", "partDetail"]].forEach(([section, list, detail]) => {
    const layout = between(section, '<div class="cv-layout" data-detail-layout>', "    </aside>");
    assert.match(layout, new RegExp(`<div id="${list}" class="collection-view-list"`));
    assert.match(layout, /<div class="cv-detail-scrim" data-detail-close hidden><\/div>/);
    assert.match(layout, new RegExp(`<aside id="${detail}" class="cv-detail" aria-label="[^"]+詳細資訊" tabindex="-1" hidden>`));
    assert.match(layout, /<div class="cv-detail-body" data-detail-body><\/div>/);
    assert.match(layout, /<button type="button" class="cv-detail-close" data-detail-close>關閉<\/button>/);
  });
  const sources = html.slice(html.indexOf('id="collectionSourceTables"'), html.indexOf('id="collectionSourceTables"') + 4000);
  assert.ok(html.indexOf('id="collectionSourceTables"') > 0);
  assert.doesNotMatch(sources.slice(0, sources.indexOf("</table>", sources.indexOf('id="partTable"'))), /cv-detail|data-detail/);
});

test("7-2d: list items only select; 刪除／修改 exist only in the panel / sheet and go through runCollectionViewAction", () => {
  const stockItem = between(viewBlock, "function renderStockViewItem(", "// P2: one card per part");
  const partItem = between(viewBlock, "function renderPartViewItem(", "function listConfigNames(");
  [stockItem, partItem].forEach(source => {
    assert.match(source, /selectableItemAttributes\(/);
    assert.doesNotMatch(source, /data-view-action|<button/);
  });
  assert.match(between(viewBlock, "function selectableItemAttributes(", "function renderStockViewItem("),
    /role="button" tabindex="0" data-view-select="\$\{kind\}" data-select-key="\$\{encodeURIComponent\(key\)\}"/);
  const stockDetail = between(viewBlock, "function renderStockDetail(", "function renderPartDetail(");
  assert.match(stockDetail, /data-write-action data-view-action="delete" data-view-key="\$\{item\.key\}"\$\{item\.deleteDisabled \? " disabled" : ""\}/);
  assert.match(stockDetail, /item\.canDelete/, "no button when the original row has none (read-only view)");
  assert.doesNotMatch(stockDetail, /data-view-action="edit"/, "collection items still cannot be edited (D-09)");
  const partDetail = between(viewBlock, "function renderPartDetail(", "function isSheetLayout(");
  assert.match(partDetail, /item\.extraRows\.map\(\(row, index\) => renderExtraRowLine\(row, index, item\.extraRows\.length/);
  assert.match(partDetail, /原裝內含 \$\{item\.orig\} 個會隨原裝陀螺變動，不能在這裡修改。/);
  const install = viewBlock.slice(viewBlock.indexOf("function installCollectionView("));
  assert.match(install, /const button = event\.target\.closest\("\.cv-detail \[data-view-action\]"\);\n        if \(button && !button\.disabled\) runCollectionViewAction\(button\);/);
  assert.equal((viewBlock.match(/(?<!function )runCollectionViewAction\(button\)/g) || []).length, 1, "one entry point for actions");
  assert.doesNotMatch(viewCode, /saveEditRow\(|window\.cancelEditRow\(button/, "no new save path");
});

test("7-2d P-2: before any action the row is connected, unchanged, and a set is exactly what was shown", () => {
  const action = between(viewBlock, "function runCollectionViewAction(", "// Q1 / F-04:");
  assert.match(action, /row && row\.isConnected && row\.closest\("table"\)\?\.id === entry\.tableId/);
  assert.match(action, /\.filter\(snapshot => snapshot\.meta\.stockSetInstanceId === setId\)\n      \.map\(rowSignature\)/);
  assert.match(action, /JSON\.stringify\(setNow\) !== JSON\.stringify\(entry\.setSignatures \|\| \[\]\)/);
  assert.match(action, /if \(!current \|\| rowSignature\(current\) !== entry\.signature \|\| setChanged\) \{\n    alert\("資料已更新，請確認清單後再操作。"\);\n    scheduleCollectionViewRender\(\);\n    return;\n  \}/);
  assert.ok(action.indexOf("setChanged) {") < action.indexOf("window.deleteRow(source)"), "checks run before deleteRow");
  const render = between(viewBlock, "function renderCollectionView(", "function scheduleCollectionViewRender(");
  assert.match(render, /refs\.get\(snapshot\.key\)\.setSignatures = stockSnapshots\n      \.filter\(other => other\.meta\.stockSetInstanceId === setId\)\n      \.map\(other => refs\.get\(other\.key\)\.signature\);/);
});

test("7-2d selection: a stock selection is the <tr> itself and closes once it is rebuilt; never found again by content", () => {
  const select = between(viewBlock, "function selectCollectionItem(", "// Escape, 關閉 or the scrim");
  assert.match(select, /\{ kind, row: entry\.row \}/);
  assert.match(select, /\{ kind, partKey: key \}/);
  assert.match(select, /const key = decodeURIComponent\(encodedKey\);/);
  const render = between(viewBlock, "function renderCollectionView(", "function scheduleCollectionViewRender(");
  assert.match(render, /const index = selection\.row\.isConnected \? stockRows\.indexOf\(selection\.row\) : -1;\n    if \(index >= 0\) selectedStock = stockItems\[index\];\n    else clearCollectionSelection\("資料已更新，請重新選擇。"\);/);
  assert.match(render, /selectedPart = partsModel\.items\.find\(entry => entry\.key === selection\.partKey\) \|\| null;\n    if \(!selectedPart\) clearCollectionSelection\("資料已更新，請重新選擇。"\);/);
  assert.doesNotMatch(render, /selection[^\n]*signature|signature[^\n]*selection/, "no signature-based lookup (P-2)");
  const reset = between(viewBlock, "function resetCollectionViewState(", "// Phase 7-2c: show the filter");
  assert.match(reset, /clearCollectionSelection\(\);\n  collectionViewState\.trigger = null;/);
  assert.match(between(viewBlock, "function setCollectionTab(", "// D-020:"), /if \(next !== collectionViewState\.tab && collectionViewState\.selection\) \{\n    clearCollectionSelection\(\);\n    scheduleCollectionViewRender\(\);\n  \}/);
  // Viewing is not editing (spec F): hasUnsavedDomInteraction is unchanged.
  const unsaved = between(script, "function hasUnsavedDomInteraction()", "function beginDataSession(");
  assert.doesNotMatch(unsaved, /cv-detail|selection|sheet/i);
});

test("7-2d keyboard and Escape: Enter / Space select; Escape closes the sheet or panel first, then cancels an edit", () => {
  const install = viewBlock.slice(viewBlock.indexOf("function installCollectionView("));
  assert.match(install, /if \(!item \|\| \(event\.key !== "Enter" && event\.key !== " "\)\) return;/);
  const escape = install.slice(install.indexOf('if (event.key !== "Escape") return;'));
  assert.match(escape, /if \(!collectionViewState\.editingPartRow && \(collectionViewState\.sheetOpen \|\| \(inDetail && collectionViewState\.selection\)\)\) \{\n        event\.preventDefault\(\);\n        closeCollectionDetail\(\);\n        return;\n      \}/);
  assert.ok(escape.indexOf("closeCollectionDetail()") < escape.indexOf('window.cancelEditRow(cancel, "part")'));
  const close = between(viewBlock, "function closeCollectionDetail(", "function writeCollectionDetail(");
  assert.match(close, /if \(trigger\) focusSelectableItem\(trigger\.kind, trigger\.encodedKey\);/, "focus returns to the item");
  const write = between(viewBlock, "function writeCollectionDetail(", "function writeViewList(");
  assert.match(write, /detail\.setAttribute\("role", sheet \? "dialog" : "region"\);/);
  assert.match(write, /if \(sheet\) detail\.setAttribute\("aria-modal", "true"\);/);
});

test("7-2d CSS: side panel only on desktop, bottom sheet only on phones; original tables untouched", () => {
  const block = styles.slice(styles.indexOf("/* ===== Phase 7-2d: detail panel")).replace(/\/\*[\s\S]*?\*\//g, "");
  const desktop = between(block, "@media (min-width: 821px) {", "@media (max-width: 820px) {");
  const phone = block.slice(block.indexOf("@media (max-width: 820px) {"));
  assert.match(desktop, /\.cv-layout\.has-detail \{\n    display: grid;\n    grid-template-columns: minmax\(0, 1fr\) minmax\(260px, 320px\);/);
  assert.match(desktop, /position: sticky;/);
  assert.match(phone, /\.cv-detail \{\n    display: none;\n  \}\n  \.cv-detail\.is-sheet\.is-open \{\n    position: fixed;/);
  assert.match(phone, /z-index: var\(--ui-z-sheet, 960\);/);
  assert.doesNotMatch(block, /source-table-box|#beybladeTable|#partTable|collectionSourceTables/);
});

test("7-2d sheet focus: Tab / Shift+Tab stay inside an open sheet; closed or hidden panels give focus back safely", () => {
  const trap = between(viewBlock, "function trapSheetFocus(", "function selectCollectionItem(");
  assert.match(trap, /if \(event\.key !== "Tab" \|\| !collectionViewState\.sheetOpen\) return;/);
  assert.match(trap, /const sheet = document\.querySelector\("\.cv-detail\.is-sheet\.is-open"\);/);
  assert.match(trap, /else if \(event\.shiftKey && \(active === first \|\| active === sheet\)\) \{\n    event\.preventDefault\(\);\n    last\.focus/);
  assert.match(trap, /else if \(!event\.shiftKey && active === last\) \{\n    event\.preventDefault\(\);\n    first\.focus/);
  assert.match(viewBlock.slice(viewBlock.indexOf("function installCollectionView(")), /document\.addEventListener\("keydown", trapSheetFocus\);/);
  const focus = between(viewBlock, "function focusSelectableItem(", "// While the phone sheet is open");
  assert.match(focus, /\(item \|\| document\.querySelector\(`\[data-collection-tab="\$\{kind\}"\]`\)\)\?\.focus/, "falls back to the tab when the item is gone");
  const render = between(viewBlock, "function renderCollectionView(", "function scheduleCollectionViewRender(");
  assert.match(render, /const lostFromSheet = sheetWasOpen && !collectionViewState\.sheetOpen && \(!document\.activeElement \|\| document\.activeElement === document\.body\);/);
  assert.match(render, /if \(lostFromSheet \|\| \(focusedDetail && getComputedStyle\(focusedDetail\)\.display === "none"\)\) \{/);
  assert.ok(render.indexOf("const lostFromSheet") > render.indexOf("if (restore)"), "runs after the existing focus restore");
  assert.ok(render.indexOf("const lostFromSheet") < render.indexOf("syncPartEditing("), "an opened row editor still takes focus last");
});

test("7-2d width changes: the sheet never stays open on a desktop width; the media query listener is kept alive", () => {
  const render = between(viewBlock, "function renderCollectionView(", "function scheduleCollectionViewRender(");
  assert.match(render, /if \(collectionViewState\.sheetOpen && !isSheetLayout\(\)\) collectionViewState\.sheetOpen = false;/);
  assert.ok(render.indexOf("!isSheetLayout()) collectionViewState.sheetOpen = false") < render.indexOf('writeCollectionDetail("stock"'));
  const install = viewBlock.slice(viewBlock.indexOf("function installCollectionView("));
  assert.match(install, /collectionViewState\.sheetQuery = matchMedia\("\(max-width: 820px\)"\);\n      collectionViewState\.sheetQuery\.addEventListener\?\.\("change", \(\) => \{\n        collectionViewState\.sheetOpen = false;\n        scheduleCollectionViewRender\(\);/);
});
