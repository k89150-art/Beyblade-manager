// Phase 7-DC (D-023): data consistency of the main page's source tables.
// Runs the REAL script.js (tests/helpers/config-page-harness.mjs) against the
// in-memory Firestore mock: loading, the D-018 screen base, addConfig,
// restoreHistoryRow and unrelated saves. Each fix also has a mutation check
// that puts the old behaviour back and shows the tests notice it.
// Nothing here touches Firebase, the network or the working tree.
// Spec: design/phase7/12-data-consistency-spec.md
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createMockFirestore, userDocPath } from "./helpers/mock-firestore.mjs";
import { configItem, createConfigPage, innerTextNodes, loadPageSource, stockItem } from "./helpers/config-page-harness.mjs";

const PATH = userDocPath("user-a");
const SOURCE = loadPageSource();
const cfg = (model, layer, fix, axis, mainStockName = "-") => configItem([model, layer, "-", "-", "-", "-", "-", fix, axis], mainStockName);
const HISTORY = { model: "UX-01 CUSTOM", combo: "蒼龍爆刃", fix: "1-60", axis: "A", result: "測試", note: "", date: "", comboKey: "蒼龍爆刃|-|-|-|-|-|1-60|A" };

function seed({ beybladeTable, partTable, configTable = [], historyTable = [] } = {}) {
  return {
    updatedAt: 1,
    ownerUid: "user-a",
    ownerEmail: "a@example.test",
    beybladeTable: beybladeTable || [
      stockItem("UX-01", "蒼龍爆刃", "1-60", "A"),
      stockItem("UX-21-01", "惡魔冥界", "-", "Z"),
      stockItem("BX-01", "蒼龍神劍", "3-60", "F"),
      stockItem("BX-02", "地獄鐮刀", "4-60", "T")
    ],
    partTable: partTable || [{ cells: ["固鎖", "3-60", "2"] }, { cells: ["軸心", "Z", "1"] }],
    configTable,
    historyTable
  };
}

async function openPage(data, { source = SOURCE, view = "raw" } = {}) {
  const mock = createMockFirestore();
  mock.seed(PATH, data);
  const page = createConfigPage({ mock, source });
  page.setInnerTextView(view);
  page.signIn();
  page.deliver();
  await page.settle();
  return { mock, page };
}

// The page's own save comes back through the listener (the "echo" that used
// to trigger the second, order-only write).
async function echo(page) {
  await page.wait(250);
  page.deliver();
  await page.settle();
  await page.wait(250);
  await page.settle();
}

const order = rows => rows.map(item => item.cells[0] + "/" + item.cells[1]);
const lastCommitFields = mock => Object.keys(mock.commitLog.at(-1)[0].fields || mock.commitLog.at(-1)[0]);

function mutate(source, from, to) {
  const parts = source.split(from);
  assert.equal(parts.length, 2, `mutation anchor must occur once: ${from.slice(0, 60)}`);
  return parts.join(to);
}

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing range ${start}`);
  return source.slice(from, to);
}

function loadPure(names, source = SOURCE) {
  const code = [
    between(source, "function normalizeModel(", "const RANDOM_BOOSTER_MODELS"),
    between(source, "function getBaseModelCode(", "function getConfigStructureModeFromRow("),
    between(source, "function getSeriesFromModel(", "function getConfigStructureModeFromRow("),
    between(source, "const TABLE_SORT_ORDER", "function sortBeybladeTable("),
    between(source, "function readStoredCellText(", "/* ===== D-018 collection saves: begin")
  ].join("\n");
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__api = { ${names.join(", ")} };`, context);
  return { api: context.__api, context };
}

/* ---------- A / B: sorting ---------- */

const SORT_SAMPLES = ["UX-21-01 CUSTOM", "UX-21 -01 CUSTOM", "BX-CUSTOM", "BX-01 CUSTOM", "BX-10 CUSTOM", "BX-2 CUSTOM", "bx-02", "CX-CUSTOM", "CX-01", "UX-01", "其他", "BX-00-01 CUSTOM", "BX-00", "UX-12-02 CUSTOM", "UX-12", "BXG-42", "BXG08"];

test("A/B comparator: same order as the previous localeCompare rule, without using it", () => {
  const { api } = loadPure(["compareSortText"]);
  const seriesOf = model => (/^(CX|BX|UX)/i.exec(model.trim())?.[1].toUpperCase() || "OTHER");
  const rank = { UX: 1, BX: 2, CX: 3, OTHER: 4 };
  const previous = (a, b) => (rank[seriesOf(a)] - rank[seriesOf(b)]) || a.localeCompare(b, "zh-Hant", { numeric: true, sensitivity: "base" });
  const current = (a, b) => (rank[seriesOf(a)] - rank[seriesOf(b)]) || api.compareSortText(a, b);
  assert.deepEqual([...SORT_SAMPLES].sort(current), [...SORT_SAMPLES].sort(previous));
  assert.ok(api.compareSortText("BXG-42", "BXG08") < 0, "punctuation before digits");
  assert.ok(api.compareSortText("BX-2 CUSTOM", "BX-10 CUSTOM") < 0, "numbers by value");
  assert.equal(api.compareSortText("BX-01", "bx-1"), 0, "case and leading zeros are equal keys");
});

// Counts localeCompare calls made by the page's own code (its VM realm). The
// harness runs script.js from "let currentUser = null;" on.
const COUNT_LOCALE_COMPARE = "let currentUser = null;\nglobalThis.__localeCompareCalls = 0;\nString.prototype.localeCompare = function () { globalThis.__localeCompareCalls += 1; return 0; };";

test("A/B: sortTable is stable and never calls localeCompare", async () => {
  const counted = mutate(SOURCE, "let currentUser = null;", COUNT_LOCALE_COMPARE);
  const { mock, page } = await openPage(seed({ configTable: [
    cfg("BX-CUSTOM", "蒼龍神劍", "3-60", "F"), cfg("UX-01 CUSTOM", "蒼龍爆刃", "1-60", "A"), cfg("BX-CUSTOM", "地獄鐮刀", "4-60", "T"), cfg("bx-custom", "惡魔冥界", "-", "Z"), cfg("BX-2 CUSTOM", "蒼龍神劍", "3-60", "F")
  ] }), { source: counted });
  await page.wait(250);
  assert.deepEqual(order(page.tables().configTable), ["UX-01 CUSTOM/蒼龍爆刃", "BX-2 CUSTOM/蒼龍神劍", "BX-CUSTOM/蒼龍神劍", "BX-CUSTOM/地獄鐮刀", "bx-custom/惡魔冥界"], "equal keys keep their stored order");
  assert.equal(page.context.__localeCompareCalls, 0);
  assert.deepEqual(page.dirtyTables(), []);
  assert.equal(mock.stats.transactions, 0);
});

test("B: sorted cloud data: no write while loading, waiting or receiving the same copy again", async () => {
  const { mock, page } = await openPage(seed({ configTable: [cfg("UX-01 CUSTOM", "蒼龍爆刃", "1-60", "A"), cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F")] }));
  const before = JSON.stringify(mock.read(PATH));
  await page.wait(250);
  assert.deepEqual(page.dirtyTables(), []);
  page.deliver();
  await page.settle();
  await page.wait(250);
  assert.equal(mock.stats.transactions, 0);
  assert.equal(JSON.stringify(mock.read(PATH)), before);
});

test("B: unsorted cloud data: the screen is sorted before the D-018 base, so nothing is unsaved and unrelated saves keep configTable", async () => {
  const unsorted = [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F"), cfg("CX-CUSTOM", "紋章鎖", "4-55", "LO", ""), cfg("UX-01 CUSTOM", "蒼龍爆刃", "1-60", "A")];
  const { mock, page } = await openPage(seed({ configTable: unsorted }));
  assert.deepEqual(order(page.tables().configTable), ["UX-01 CUSTOM/蒼龍爆刃", "BX-01 CUSTOM/蒼龍神劍", "CX-CUSTOM/紋章鎖"], "screen sorted");
  assert.deepEqual(page.dirtyTables(), [], "right after loading");
  await page.wait(250);
  assert.deepEqual(page.dirtyTables(), [], "250 ms after loading");
  assert.equal(mock.stats.transactions, 0);
  page.context.createPartRow(["軸心", "F", "1"]);
  page.context.saveData();
  await page.settle();
  assert.equal(mock.stats.commits, 1);
  assert.ok(!lastCommitFields(mock).includes("configTable"), "the part save does not write configTable");
  assert.ok(lastCommitFields(mock).includes("partTable"));
  assert.deepEqual(mock.read(PATH).configTable, unsorted, "cloud rows and order unchanged");
  // The collection table, too.
  page.context.createPartRow(["軸心", "A", "1"]);
  page.context.saveData();
  await page.settle();
  assert.ok(!lastCommitFields(mock).includes("beybladeTable") && !lastCommitFields(mock).includes("configTable"));
});

test("A: addConfig writes once, already in sorted order, including after its own echo", async () => {
  const { mock, page } = await openPage(seed({ configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F")] }));
  page.openEditor();
  page.build({ 上蓋: "惡魔冥界", 軸心: "Z" });
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 1);
  assert.deepEqual(order(mock.read(PATH).configTable), ["UX-21-01 CUSTOM/惡魔冥界", "BX-01 CUSTOM/蒼龍神劍"]);
  await echo(page);
  assert.equal(mock.stats.commits, 1, "no second, order-only write");
  assert.deepEqual(page.dirtyTables(), []);
});

test("A: restoreHistoryRow writes once, already in sorted order", async () => {
  const { mock, page } = await openPage(seed({ configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F")], historyTable: [HISTORY] }));
  page.restoreHistory(page.historyRows()[0]);
  await page.settle();
  assert.deepEqual(page.effects.alerts, []);
  assert.equal(mock.stats.commits, 1);
  assert.deepEqual(order(mock.read(PATH).configTable), ["UX-01 CUSTOM/蒼龍爆刃", "BX-01 CUSTOM/蒼龍神劍"]);
  assert.deepEqual(mock.read(PATH).historyTable, [HISTORY], "the history record stays (unchanged behaviour)");
  await echo(page);
  assert.equal(mock.stats.commits, 1);
  assert.deepEqual(page.dirtyTables(), []);
});

test("A/B: a real config change on unsorted cloud data conflicts with another device and overwrites nothing", async () => {
  const { mock, page } = await openPage(seed({ configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F"), cfg("UX-01 CUSTOM", "蒼龍爆刃", "1-60", "A")] }));
  const other = { cells: ["UX-16 CUSTOM", "時鐘幻象", "-", "-", "-", "-", "-", "9-65", "B"], mainStockName: "-" };
  mock.externalMerge(PATH, { configTable: [...mock.read(PATH).configTable, other], updatedAt: 99 });
  const cloud = JSON.stringify(mock.read(PATH));
  page.openEditor();
  page.build({ 上蓋: "惡魔冥界", 軸心: "Z" });
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 0);
  assert.equal(page.page.sync.state, "conflict");
  assert.equal(JSON.stringify(mock.read(PATH)), cloud, "the other device's change is kept as is");
});

/* ---------- C: model formatting ---------- */

test("C normalizeModel: multi-part codes keep every number group; existing values are never repaired", () => {
  const { api } = loadPure(["normalizeModel", "getBaseModelCode"]);
  const cases = {
    "UX-21-01 CUSTOM": "UX-21-01 CUSTOM",
    "BX-00-01 CUSTOM": "BX-00-01 CUSTOM",
    "UX-12-02 CUSTOM": "UX-12-02 CUSTOM",
    "UX-21 -01 CUSTOM": "UX-21 -01 CUSTOM",
    "UX-21-01": "UX-21-01",
    "bx-00-01-02": "BX-00-01-02",
    "BX-01 CUSTOM": "BX-01 CUSTOM",
    "ux01 custom": "UX-01 custom",
    "BX - 01": "BX-01",
    "UX-21-01A": "UX-21 -01A",
    "CX-CUSTOM": "CX-CUSTOM",
    "BX-CUSTOM": "BX-CUSTOM",
    "我的改裝": "我的改裝",
    "": ""
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(api.normalizeModel(input), expected, input);
  for (const value of Object.values(cases)) assert.equal(api.normalizeModel(api.normalizeModel(value)), api.normalizeModel(value), `idempotent: ${value}`);
  assert.equal(api.getBaseModelCode("UX-21-01 CUSTOM"), "UX-21");
  assert.equal(api.getBaseModelCode("UX-21 -01 CUSTOM"), "UX-21");
  assert.equal(api.getBaseModelCode("BX-00-01 CUSTOM"), "BX-00");
});

const MODEL_ROWS = [
  cfg("UX-21-01 CUSTOM", "惡魔冥界", "-", "Z"),
  cfg("UX-21 -01 CUSTOM", "惡魔冥界", "-", "Z"),
  cfg("ux01 custom", "蒼龍爆刃", "1-60", "A"),
  cfg("BX-00-01 CUSTOM", "蒼龍神劍", "3-60", "F")
];

test("C: loading keeps every stored model as it is; nothing becomes unsaved", async () => {
  const { mock, page } = await openPage(seed({ configTable: MODEL_ROWS, beybladeTable: [stockItem("ux-01", "蒼龍爆刃", "1-60", "A"), stockItem("UX-21-01", "惡魔冥界", "-", "Z")] }));
  await page.wait(250);
  assert.deepEqual(page.tables().configTable.map(item => item.cells[0]).sort(), MODEL_ROWS.map(item => item.cells[0]).sort());
  assert.deepEqual(page.tables().beybladeTable.map(item => item.cells[0]).sort(), ["UX-21-01", "ux-01"]);
  assert.deepEqual(page.dirtyTables(), []);
  assert.equal(mock.stats.transactions, 0);
});

test("C: saving another config keeps the stored models, including the broken one", async () => {
  const { mock, page } = await openPage(seed({ configTable: MODEL_ROWS }));
  page.openEditor();
  page.build({ 上蓋: "地獄鐮刀", 固鎖: "3-60", 軸心: "T" });
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 1);
  const models = mock.read(PATH).configTable.map(item => item.cells[0]);
  for (const model of MODEL_ROWS.map(item => item.cells[0])) assert.ok(models.includes(model), `kept: ${model}`);
  assert.equal(models.length, 5);
});

test("C: editing a config keeps its model (UX-21-01 CUSTOM stays, the broken UX-21 -01 CUSTOM is not repaired)", async () => {
  for (const model of ["UX-21-01 CUSTOM", "UX-21 -01 CUSTOM"]) {
    const { mock, page } = await openPage(seed({ configTable: [cfg(model, "蒼龍神劍", "3-60", "F")] }));
    page.openEditor(page.configRows()[0]);
    page.build({ 軸心: "Z" });
    page.save();
    await page.settle();
    assert.equal(mock.stats.commits, 1, model);
    assert.deepEqual(mock.read(PATH).configTable[0].cells, [model, "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "Z"]);
  }
});

test("C: a new config from a multi-part product gets the full model", async () => {
  const { mock, page } = await openPage(seed());
  page.openEditor();
  page.build({ 上蓋: "惡魔冥界", 軸心: "Z" });
  page.save();
  await page.settle();
  assert.equal(mock.read(PATH).configTable[0].cells[0], "UX-21-01 CUSTOM");
});

/* ---------- D: stable reads ---------- */

const SPACED = {
  beybladeTable: [
    { cells: ["UX-01", "雙  空白", "-", "-", "-", "-", "-", "1-60", "A"], mainStockName: "-" },
    { cells: ["UX-02", "定位\t字元", "-", "-", "-", "-", "-", "3-70", "H"], mainStockName: "-" },
    { cells: ["UX-03", "全形　空白", "-", "-", "-", "-", "-", "3-80", "FB"], mainStockName: "-" },
    { cells: ["UX-04", "不斷行\u00a0空白", "-", "-", "-", "-", "-", "9-60", "LR"], mainStockName: "-" },
    { cells: ["UX-06", "  前後空白  ", "-", "-", "-", "-", "-", "4-60", "T"], mainStockName: "-" },
    { cells: ["CX-01", "蒼龍勇  氣S", "蒼龍", "勇  氣", "-", "-", "S", "6-60", "V"] }
  ],
  partTable: [{ cells: ["軸心", "雙  空白", "1"] }, { cells: ["上蓋", "換\n行", "1"] }, { cells: ["固鎖", "<b>&amp;", "1"] }],
  configTable: [
    cfg("BX-CUSTOM", "雙  空白", "3-60", "F"),
    cfg("UX-CUSTOM", " 前後 ", "1-60", "A"),
    configItem(["CX-CUSTOM", "蒼龍勇  氣S", "蒼龍", "勇  氣", "-", "-", "S", "6-60", "V"], "勇  氣")
  ],
  historyTable: [{ model: "BX-CUSTOM", combo: "蒼龍  神劍", fix: "3-60", axis: "F", result: "好\t用", note: "備註\n兩行  空白", date: "2026/11/24", comboKey: "k1" }]
};

function expectedTables(data) {
  return JSON.parse(JSON.stringify({ beybladeTable: data.beybladeTable, partTable: data.partTable, configTable: data.configTable, historyTable: data.historyTable }));
}

test("D: values read the same whether cells are rendered or display:none; nothing becomes unsaved", async () => {
  const { mock, page } = await openPage(seed(SPACED), { view: "rendered" });
  const expected = expectedTables(SPACED);
  const rendered = page.tables();
  page.setInnerTextView("raw");
  const raw = page.tables();
  assert.deepEqual(raw, rendered);
  for (const table of ["partTable", "historyTable"]) assert.deepEqual(raw[table], expected[table], table);
  // Sorted tables: compare rows regardless of order. A row stored without
  // mainStockName reads it from cell 3 (unchanged behaviour).
  const rowsOf = rows => rows.map(item => JSON.stringify([item.cells, item.mainStockName ?? item.cells[3]])).sort();
  for (const table of ["beybladeTable", "configTable"]) assert.deepEqual(rowsOf(raw[table]), rowsOf(expected[table]), table);
  await page.wait(250);
  assert.deepEqual(page.dirtyTables(), []);
  page.setInnerTextView("rendered");
  assert.deepEqual(page.dirtyTables(), []);
  assert.equal(mock.stats.transactions, 0);
});

test("D: an unrelated save writes only its table and keeps every stored space, line break and character", async () => {
  const data = seed({ ...SPACED, beybladeTable: [...SPACED.beybladeTable, stockItem("BX-01", "蒼龍神劍", "3-60", "F")], partTable: [...SPACED.partTable, { cells: ["固鎖", "3-60", "1"] }, { cells: ["軸心", "F", "1"] }] });
  const { mock, page } = await openPage(data, { view: "rendered" });
  page.setInnerTextView("raw");
  page.openEditor();
  page.build({ 上蓋: "蒼龍神劍", 固鎖: "3-60", 軸心: "F" });
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 1);
  const fields = lastCommitFields(mock);
  assert.ok(fields.includes("configTable") && !fields.includes("partTable") && !fields.includes("historyTable") && !fields.includes("beybladeTable"));
  const stored = mock.read(PATH);
  for (const item of SPACED.configTable) assert.ok(stored.configTable.some(row => JSON.stringify(row) === JSON.stringify(item)), `kept: ${JSON.stringify(item.cells)}`);
  assert.deepEqual(stored.partTable, data.partTable);
  assert.deepEqual(stored.historyTable, SPACED.historyTable);
});

test("D readStoredCellText: text and <br> exactly; other markup keeps the previous read", () => {
  const { api } = loadPure(["readStoredCellText"]);
  const cell = text => ({ childNodes: innerTextNodes(text), innerText: "unused" });
  for (const text of ["雙  空白", "定位\t字元", "全形　空白", "不斷行\u00a0空白", "  前後  ", "換\n行", "a\n\nb\n", "<b>&amp;</b>", "", "-"]) {
    assert.equal(api.readStoredCellText(cell(text)), text, JSON.stringify(text));
  }
  assert.equal(api.readStoredCellText(cell("a\r\nb")), "a\nb", "CRLF becomes <br>, read back as LF");
  assert.equal(api.readStoredCellText(undefined), "");
  const withMarkup = { childNodes: [{ nodeType: 3, nodeValue: " x " }, { nodeType: 1, nodeName: "SPAN" }], innerText: "  shown  " };
  assert.equal(api.readStoredCellText(withMarkup), "shown");
});

/* ---------- mutation checks: the tests notice the old behaviour ---------- */

async function fails(run) {
  try {
    await run();
  } catch (error) {
    if (error instanceof assert.AssertionError) return true;
    throw error;
  }
  return false;
}

test("mutation A: without the sort in collectCurrentData, addConfig stores insertion order", async () => {
  const source = mutate(SOURCE, "function collectCurrentData() {\n  sortBeybladeTable();\n  sortConfigTable();\n", "function collectCurrentData() {\n  sortBeybladeTable();\n");
  assert.ok(await fails(async () => {
    const { mock, page } = await openPage(seed({ configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F")] }), { source });
    page.openEditor();
    page.build({ 上蓋: "惡魔冥界", 軸心: "Z" });
    page.save();
    await page.settle();
    assert.deepEqual(order(mock.read(PATH).configTable), ["UX-21-01 CUSTOM/惡魔冥界", "BX-01 CUSTOM/蒼龍神劍"]);
  }));
});

test("mutation A/B: the old 80 ms re-sort after the base brings back the second write and the unsaved order", async () => {
  // Old behaviour: no sync sorts, a MutationObserver re-sorts 80 ms later.
  let source = mutate(SOURCE, "    sortBeybladeTable();\n    sortConfigTable();\n    refreshSelectors();", "    sortBeybladeTable();\n    refreshSelectors();");
  source = mutate(source, "function collectCurrentData() {\n  sortBeybladeTable();\n  sortConfigTable();\n", "function collectCurrentData() {\n  sortBeybladeTable();\n");
  source = mutate(source, "function sortConfigTable() {\n  sortTable(\"configTable\");\n}",
    "function sortConfigTable() {\n  sortTable(\"configTable\");\n}\nnew MutationObserver(() => { clearTimeout(globalThis.__sortTimer); globalThis.__sortTimer = setTimeout(sortConfigTable, 80); }).observe(document.querySelector(\"#configTable tbody\"), { childList: true, subtree: true, characterData: true });");
  assert.ok(await fails(async () => {
    const { mock, page } = await openPage(seed({ configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F")] }), { source });
    page.openEditor();
    page.build({ 上蓋: "惡魔冥界", 軸心: "Z" });
    page.save();
    await page.settle();
    await echo(page);
    assert.equal(mock.stats.commits, 1);
  }), "addConfig");
  assert.ok(await fails(async () => {
    const { page } = await openPage(seed({ configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F"), cfg("UX-01 CUSTOM", "蒼龍爆刃", "1-60", "A")] }), { source });
    await page.wait(250);
    assert.deepEqual(page.dirtyTables(), []);
  }), "unsorted load");
});

// applyRemoteCollections takes the D-018 base through collectCurrentData,
// which sorts too; the sort in applyDataToTables makes the built screen itself
// sorted before anything (selectors, display observers, the base) reads it.
async function assertSortedRightAfterApply(source) {
  const { page } = await openPage(seed(), { source });
  page.context.applyDataToTables(seed({ configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F"), cfg("UX-01 CUSTOM", "蒼龍爆刃", "1-60", "A")] }));
  assert.deepEqual(page.configCells().map(cells => cells[0]), ["UX-01 CUSTOM", "BX-01 CUSTOM"]);
}

test("B: applyDataToTables returns with the config table already sorted", async () => {
  await assertSortedRightAfterApply(SOURCE);
});

test("mutation B: without the sort in applyDataToTables the built screen is unsorted", async () => {
  const source = mutate(SOURCE, "    sortBeybladeTable();\n    sortConfigTable();\n    refreshSelectors();", "    sortBeybladeTable();\n    refreshSelectors();");
  assert.ok(await fails(() => assertSortedRightAfterApply(source)));
});

test("mutation B: the locale-dependent comparator is detected", async () => {
  const source = mutate(SOURCE, "    return compareSortText(modelA, modelB);", "    return modelA.localeCompare(modelB, \"zh-Hant\", { numeric: true, sensitivity: \"base\" });");
  const counted = mutate(source, "let currentUser = null;", COUNT_LOCALE_COMPARE);
  // Same series, so the comparison reaches the text rule.
  const { page } = await openPage(seed({ configTable: [cfg("BX-10 CUSTOM", "蒼龍神劍", "3-60", "F"), cfg("BX-2 CUSTOM", "蒼龍爆刃", "1-60", "A")] }), { source: counted });
  assert.ok(page.context.__localeCompareCalls > 0);
});

test("mutation C: the old single-number rule rewrites UX-21-01 CUSTOM when the config is edited", async () => {
  const source = mutate(SOURCE, "  const match = text.match(/^(UX|BX|CX)\\s*-?\\s*(\\d+(?:-\\d+){1,2})(?=\\s|$)(.*)$/i)\n    || text.match(", "  const match = text.match(");
  assert.ok(await fails(async () => {
    const { mock, page } = await openPage(seed({ configTable: [cfg("UX-21-01 CUSTOM", "蒼龍神劍", "3-60", "F")] }), { source });
    page.openEditor(page.configRows()[0]);
    page.build({ 軸心: "Z" });
    page.save();
    await page.settle();
    assert.equal(mock.read(PATH).configTable[0].cells[0], "UX-21-01 CUSTOM");
  }));
});

test("mutation C: normalizing model cells on load (old normalizeAllModelCells) is detected", async () => {
  const source = mutate(SOURCE, "    sortBeybladeTable();\n    sortConfigTable();\n    refreshSelectors();",
    "    document.querySelectorAll(\"#configTable tbody tr\").forEach(row => { row.cells[0].innerText = normalizeModel(row.cells[0].innerText.trim()); });\n    sortBeybladeTable();\n    sortConfigTable();\n    refreshSelectors();");
  assert.ok(await fails(async () => {
    const { page } = await openPage(seed({ configTable: [cfg("ux01 custom", "蒼龍爆刃", "1-60", "A")] }), { source });
    assert.deepEqual(page.tables().configTable.map(item => item.cells[0]), ["ux01 custom"]);
  }));
});

test("mutation D: reading cells through innerText again is detected", async () => {
  const source = mutate(SOURCE, "function readStoredCellText(cell) {\n  if (!cell) return \"\";", "function readStoredCellText(cell) {\n  if (!cell) return \"\";\n  return cell.innerText.trim();");
  assert.ok(await fails(async () => {
    const { page } = await openPage(seed(SPACED), { source, view: "rendered" });
    page.setInnerTextView("raw");
    assert.deepEqual(page.dirtyTables(), []);
  }));
});

/* ---------- tournament page: config menu order ---------- */

// tournament.js builds its config menu from the stored configTable order
// (rebuildConfigOptions); saved decks keep the config text, not a position.
function tournamentMenu(configTable) {
  const source = fs.readFileSync("tournament.js", "utf8");
  const code = between(source, "function buildConfigTextFromCells(", "function getDeckValue(");
  const context = { mainData: { configTable }, configOptions: [] };
  vm.createContext(context);
  vm.runInContext(`let mainData = this.mainData; let configOptions = [];\n${code}\nrebuildConfigOptions();\nthis.result = configOptions.map(option => option.text);`, context);
  return context.result;
}

test("tournament menu: addConfig keeps the stored order sorted, so the menu order is the sorted config order", async () => {
  const { mock, page } = await openPage(seed({ configTable: [cfg("UX-01 CUSTOM", "蒼龍爆刃", "1-60", "A"), cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F")] }));
  const before = tournamentMenu(mock.read(PATH).configTable);
  page.openEditor();
  page.build({ 上蓋: "惡魔冥界", 軸心: "Z" });
  page.save();
  await page.settle();
  const after = tournamentMenu(mock.read(PATH).configTable);
  assert.deepEqual(after.filter(text => before.includes(text)), before, "existing entries keep their relative order");
  assert.deepEqual(after.map(text => text.split("｜")[0]), ["UX-01 CUSTOM", "UX-21-01 CUSTOM", "BX-01 CUSTOM"]);
});
