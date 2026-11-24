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

/* ---------- original row editor (editRow / saveEditRow / cancelEditRow) ---------- */

// Part rows are rendered in the real page (their innerText collapses spaces
// and trims), so these run with the "rendered" innerText view.
const EDIT_PARTS = [
  { cells: ["軸心", "雙  空白", "1"] },
  { cells: ["軸心", "定位\t字元", "1"] },
  { cells: ["軸心", "不斷行 空白", "2"] },
  { cells: ["軸心", "  前後空白  ", "1"] },
  { cells: ["上蓋", "全形　空白", "1"] },
  { cells: ["上蓋", "換\n行", "1"] },
  { cells: ["固鎖", "3-60", "2"] },
  { cells: ["軸心", "Z", "1"] }
];
const EDIT_NAMES = EDIT_PARTS.slice(0, 6).map(item => item.cells[1]);

function partRowByName(page, name) {
  const read = cell => cell.childNodes.map(node => (node.nodeType === 3 ? node.nodeValue : "\n")).join("");
  return [...page.context.document.querySelector("#partTable tbody").rows].find(row => read(row.cells[1]) === name);
}
const openEdit = (page, row) => page.context.window.editRow({ closest: () => row }, "part");
const saveEdit = (page, row) => page.context.window.saveEditRow({ parentElement: { parentElement: row } }, "part");
const cancelEdit = (page, row) => page.context.window.cancelEditRow({ parentElement: { parentElement: row } }, "part");

async function openEditPage(source = SOURCE) {
  return openPage(seed({ partTable: EDIT_PARTS }), { source, view: "rendered" });
}

async function assertCancelKeepsEverything(source) {
  const { mock, page } = await openEditPage(source);
  for (const name of EDIT_NAMES) {
    const row = partRowByName(page, name);
    openEdit(page, row);
    assert.equal(row.dataset.editing, "true");
    cancelEdit(page, row);
  }
  await page.settle();
  assert.equal(mock.stats.commits, 0, "cancelling writes nothing");
  assert.deepEqual(page.dirtyTables(), [], "nothing is left unsaved");
  assert.deepEqual(page.tables().partTable, EDIT_PARTS);
  // A later save of another table writes only that table.
  page.openEditor();
  page.build({ 上蓋: "惡魔冥界", 軸心: "Z" });
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 1);
  assert.ok(!lastCommitFields(mock).includes("partTable"), "partTable not rewritten");
  assert.deepEqual(mock.read(PATH).partTable, EDIT_PARTS);
}

test("edit: open then cancel keeps every stored name; a later unrelated save does not write partTable", async () => {
  await assertCancelKeepsEverything(SOURCE);
});

test("edit: saving without changes keeps every stored value and writes nothing", async () => {
  const { mock, page } = await openEditPage();
  for (const name of EDIT_NAMES) {
    const row = partRowByName(page, name);
    openEdit(page, row);
    saveEdit(page, row);
    await page.settle();
  }
  assert.equal(mock.stats.commits, 0);
  assert.deepEqual(page.dirtyTables(), []);
  assert.deepEqual(mock.read(PATH).partTable, EDIT_PARTS);
});

test("edit: changing only the count keeps the name exactly; changing the type keeps name and count", async () => {
  const { mock, page } = await openEditPage();
  for (const name of EDIT_NAMES) {
    const row = partRowByName(page, name);
    openEdit(page, row);
    row.cells[2].querySelector("input").value = "5";
    saveEdit(page, row);
    await page.settle();
  }
  const stored = mock.read(PATH).partTable;
  for (const name of EDIT_NAMES) assert.deepEqual(stored.find(item => item.cells[1] === name)?.cells.slice(1), [name, "5"], JSON.stringify(name));
  const row = partRowByName(page, "雙  空白");
  openEdit(page, row);
  row.cells[0].querySelector("select").value = "上蓋";
  saveEdit(page, row);
  await page.settle();
  assert.deepEqual(mock.read(PATH).partTable.find(item => item.cells[1] === "雙  空白").cells, ["上蓋", "雙  空白", "5"]);
});

test("edit: a name the user changes follows the existing input rules and D1 confirm", async () => {
  const { mock, page } = await openEditPage();
  const row = partRowByName(page, "雙  空白");
  openEdit(page, row);
  row.cells[1].querySelector("input").value = "  新  名稱  ";
  saveEdit(page, row);
  await page.settle();
  assert.deepEqual(mock.read(PATH).partTable.find(item => item.cells[2] === "1" && item.cells[1].startsWith("新")).cells, ["軸心", "新  名稱", "1"], "trimmed like before, inner spaces as typed");
  assert.match(page.effects.confirms.at(-1), /^確定要保存這次修改嗎？/);
  // A count the user changes is normalised as before ("05" -> "5").
  const other = partRowByName(page, "定位\t字元");
  openEdit(page, other);
  other.cells[2].querySelector("input").value = "05";
  saveEdit(page, other);
  await page.settle();
  assert.deepEqual(mock.read(PATH).partTable.find(item => item.cells[1] === "定位\t字元").cells, ["軸心", "定位\t字元", "5"]);
});

test("edit: while a row is being edited, saves of other tables use its stored values", async () => {
  const { mock, page } = await openEditPage();
  const row = partRowByName(page, "  前後空白  ");
  openEdit(page, row);
  assert.deepEqual(page.tables().partTable, EDIT_PARTS, "the editing row reads as stored");
  page.openEditor();
  page.build({ 上蓋: "惡魔冥界", 軸心: "Z" });
  page.save();
  await page.settle();
  assert.ok(!lastCommitFields(mock).includes("partTable"));
  cancelEdit(page, row);
  assert.deepEqual(page.tables().partTable, EDIT_PARTS);
});

test("mutation edit: the old innerText capture in editRow is detected", async () => {
  const source = mutate(SOURCE, "    .map(cell => readStoredCellText(cell));\n\n  const originalMainStockName =", "    .map(cell => cell.innerText.trim());\n\n  const originalMainStockName =");
  assert.ok(await fails(() => assertCancelKeepsEverything(source)));
});

test("mutation edit: saving untouched fields through the input rules again is detected", async () => {
  const source = mutate(SOURCE, "    if (control && canKeepOriginal && control.value === initialValues[i]) {", "    if (false) {");
  assert.ok(await fails(async () => {
    const { mock, page } = await openEditPage(source);
    const row = partRowByName(page, "  前後空白  ");
    openEdit(page, row);
    saveEdit(page, row);
    await page.settle();
    assert.deepEqual(mock.read(PATH).partTable, EDIT_PARTS);
  }));
});

/* ---------- inventory identity: category + exact stored name ---------- */

// Run with the "rendered" innerText view: before D-023 the stock keys came
// from rendered text, which merged names that differ only in whitespace.
const IDENTITY_STOCK = [
  stockItem("UX-03", "雙  空白", "-", "Z"),
  stockItem("BX-01", "蒼龍神劍", "3-60", "F"),
  stockItem("BX-02", "地獄鐮刀", "4-60", "T")
];
const IDENTITY_PARTS = [
  { cells: ["軸心", "雙 空白", "1"] },
  { cells: ["軸心", "雙  空白", "1"] },
  { cells: ["軸心", "定位\t字元", "1"] },
  { cells: ["軸心", "  前後空白  ", "1"] },
  { cells: ["軸心", "不斷行 空白", "1"] },
  { cells: ["軸心", "全形　空白", "1"] },
  { cells: ["上蓋", "雙 空白", "1"] },
  { cells: ["固鎖", "3-60", "9"] }
];

async function openIdentityPage({ configTable = [], historyTable = [], partTable = IDENTITY_PARTS, source = SOURCE } = {}) {
  return openPage(seed({ beybladeTable: IDENTITY_STOCK, partTable, configTable, historyTable }), { source, view: "rendered" });
}
const unescapeText = text => String(text).replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
const menu = (page, type) => page.context.document.getElementById(`sel${type}`).options
  .filter(option => option.value)
  .map(option => [option.value, unescapeText(option.textContent).replace(/[ \t\r\n]+/g, " ").trim()]);
const offered = (page, type) => menu(page, type).map(([value]) => value);
const usedOf = (page, type, name) => page.context.getUsedParts()[type][name] || 0;
const totalOf = (page, type, name) => page.context.getTotalParts()[type][name] || 0;
const partRowNamed = (page, name) => [...page.context.document.querySelector("#partTable tbody").rows]
  .find(row => row.cells[1].childNodes.map(node => (node.nodeType === 3 ? node.nodeValue : "\n")).join("") === name);

test("identity: names that differ only in whitespace are separate parts with their own menu entries", async () => {
  const { page } = await openIdentityPage();
  page.openEditor();
  const axis = Object.fromEntries(menu(page, "軸心"));
  assert.equal(axis["雙 空白"], "雙 空白，剩餘 1");
  assert.equal(axis["雙  空白"], "雙␣␣空白，剩餘 1", "the menu shows the double space");
  assert.equal(axis["定位\t字元"], "定位⇥字元，剩餘 1");
  assert.equal(axis["  前後空白  "], "␣␣前後空白␣␣，剩餘 1");
  assert.equal(axis["不斷行 空白"], "不斷行⍽空白，剩餘 1");
  assert.equal(axis["全形　空白"], "全形　空白，剩餘 1");
  assert.equal(totalOf(page, "軸心", "雙 空白"), 1);
  assert.equal(totalOf(page, "軸心", "雙  空白"), 1);
  // Original (collection) and extra parts with similar names stay apart too.
  const layer = Object.fromEntries(menu(page, "上蓋"));
  assert.equal(layer["雙  空白"], "雙␣␣空白，剩餘 1");
  assert.equal(layer["雙 空白"], "雙 空白，剩餘 1");
});

test("identity: a config stores the exact name picked, uses only that part, and an exhausted part is blocked even when submitted directly", async () => {
  const { mock, page } = await openIdentityPage();
  page.openEditor();
  page.build({ 上蓋: "蒼龍神劍", 固鎖: "3-60", 軸心: "雙  空白" });
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 1);
  assert.equal(mock.read(PATH).configTable[0].cells[8], "雙  空白");
  assert.equal(usedOf(page, "軸心", "雙  空白"), 1);
  assert.equal(usedOf(page, "軸心", "雙 空白"), 0, "the similar name is not used");
  page.openEditor();
  assert.ok(!offered(page, "軸心").includes("雙  空白"), "used up");
  assert.ok(offered(page, "軸心").includes("雙 空白"), "the other part is still available");
  // Forcing the used-up name into the form is still blocked by checkStock.
  page.build({ 上蓋: "地獄鐮刀", 固鎖: "3-60" });
  const select = page.context.document.getElementById("sel軸心");
  select.innerHTML += '<option value="雙  空白">forced</option>';
  select.value = "雙  空白";
  assert.equal(select.value, "雙  空白");
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 1, "nothing written");
  assert.match(page.effects.alerts.at(-1), /軸心「雙  空白」已經沒有庫存/);
  // The similar name is a legal, separate part.
  page.build({ 上蓋: "地獄鐮刀", 固鎖: "3-60", 軸心: "雙 空白" });
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 2);
  assert.equal(mock.read(PATH).configTable.find(item => item.cells[1] === "地獄鐮刀").cells[8], "雙 空白");
});

test("identity: every special name round-trips through a new config exactly", async () => {
  const picks = [["蒼龍神劍", "定位\t字元"], ["地獄鐮刀", "  前後空白  "], ["雙  空白", "不斷行 空白"], ["雙 空白", "全形　空白"]];
  const { mock, page } = await openIdentityPage();
  for (const [layer, axis] of picks) {
    page.openEditor();
    page.build({ 上蓋: layer, 固鎖: "3-60", 軸心: axis });
    page.save();
    await page.settle();
  }
  assert.deepEqual(page.effects.alerts, []);
  const stored = mock.read(PATH).configTable.map(item => [item.cells[1], item.cells[8]]);
  for (const pick of picks) assert.ok(stored.some(item => item[0] === pick[0] && item[1] === pick[1]), JSON.stringify(pick));
  for (const [layer, axis] of picks) {
    assert.equal(usedOf(page, "軸心", axis), 1, JSON.stringify(axis));
    assert.equal(usedOf(page, "上蓋", layer), 1, JSON.stringify(layer));
  }
});

test("identity: an existing config that stored a merged name is not repaired and shows as an unmatched reference", async () => {
  const legacy = cfg("BX-CUSTOM", "蒼龍神劍", "3-60", "雙 空白");
  const parts = IDENTITY_PARTS.filter(item => !(item.cells[0] === "軸心" && item.cells[1] === "雙 空白"));
  const { mock, page } = await openIdentityPage({ partTable: parts, configTable: [legacy] });
  const model = page.context.computeCollectionPartsModel();
  assert.ok(JSON.stringify(model.orphans || model).includes("雙 空白"), "listed as an unmatched reference");
  assert.equal(usedOf(page, "軸心", "雙  空白"), 0, "it does not use the double-space part");
  page.openEditor();
  assert.ok(offered(page, "軸心").includes("雙  空白"));
  await page.wait(250);
  assert.equal(mock.stats.transactions, 0);
  assert.deepEqual(mock.read(PATH).configTable, [legacy], "not repaired");
});

test("identity: editing a config keeps its exact names; dismantling and restoring keeps them and counts stock correctly", async () => {
  const { mock, page } = await openIdentityPage({ configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "定位\t字元")] });
  page.openEditor(page.configRows()[0]);
  assert.equal(page.context.document.getElementById("sel軸心").value, "定位\t字元", "the editor selects the stored name");
  page.build({ 固鎖: "3-60" });
  page.save();
  await page.settle();
  assert.equal(mock.read(PATH).configTable[0].cells[8], "定位\t字元");
  // Dismantle: the history record and its combo key keep the exact names.
  const row = page.configRows()[0];
  const record = page.context.buildHistoryRecordFromConfigRow(row, "測試", "");
  assert.equal(record.axis, "定位\t字元");
  assert.equal(record.comboKey.split("|")[7], "定位\t字元");
  row.remove();
  page.context.createHistoryRow(record);
  page.context.saveData();
  await page.settle();
  assert.equal(usedOf(page, "軸心", "定位\t字元"), 0);
  // Restore: same parts, stock checked by exact name.
  page.restoreHistory(page.historyRows()[0]);
  await page.settle();
  assert.deepEqual(page.effects.alerts, []);
  assert.equal(mock.read(PATH).configTable[0].cells[8], "定位\t字元");
  assert.equal(usedOf(page, "軸心", "定位\t字元"), 1);
});

test("identity: restoring a config whose part has leading/trailing spaces uses that part", async () => {
  const history = { model: "BX-01 CUSTOM", combo: "蒼龍神劍", fix: "3-60", axis: "  前後空白  ", result: "", note: "", date: "", comboKey: "蒼龍神劍|-|-|-|-|-|3-60|  前後空白  " };
  const { mock, page } = await openIdentityPage({ historyTable: [history] });
  page.restoreHistory(page.historyRows()[0]);
  await page.settle();
  assert.deepEqual(page.effects.alerts, []);
  assert.equal(mock.read(PATH).configTable[0].cells[8], "  前後空白  ");
  assert.equal(usedOf(page, "軸心", "  前後空白  "), 1);
});

test("identity: D1 impact text follows the exact names", async () => {
  const { page } = await openIdentityPage({ configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "雙  空白")] });
  assert.match(page.context.getPartDeleteImpactText(partRowNamed(page, "雙  空白")), /雙  空白/, "deleting the used part is reported");
  assert.equal(page.context.getPartDeleteImpactText(partRowNamed(page, "雙 空白")), "", "deleting the similar, unused part has no impact");
});

test("mutation identity: reading stock names from rendered text again merges similar names", async () => {
  let source = mutate(SOURCE, "    .map(cell => readStoredCellText(cell));\n}\n\nfunction getPersistedStockName(", "    .map(cell => cell.innerText.trim());\n}\n\nfunction getPersistedStockName(");
  source = mutate(source, "  return readStoredCellText(cell);\n}\n\nfunction getPersistedRowCells(", "  return cell.innerText.trim();\n}\n\nfunction getPersistedRowCells(");
  assert.ok(await fails(async () => {
    const { page } = await openIdentityPage({ source });
    assert.equal(totalOf(page, "軸心", "雙  空白"), 1);
    assert.equal(totalOf(page, "軸心", "雙 空白"), 1);
  }));
});

test("mutation identity: menu text without whitespace marks is detected", async () => {
  const source = mutate(SOURCE, "${escapeHtml(formatPartNameForMenu(name))}，剩餘", "${escapeHtml(name)}，剩餘");
  assert.ok(await fails(async () => {
    const { page } = await openIdentityPage({ source });
    page.openEditor();
    assert.equal(Object.fromEntries(menu(page, "軸心"))["雙  空白"], "雙␣␣空白，剩餘 1");
  }));
});

test("mutation identity: filling the editor from rendered text is detected", async () => {
  const source = mutate(SOURCE, "  const values = Array.from(row.cells).slice(0, 9).map(cell => readStoredCellText(cell));", "  const values = Array.from(row.cells).slice(0, 9).map(cell => cell.innerText.trim());");
  assert.ok(await fails(async () => {
    const { page } = await openIdentityPage({ source, configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "定位\t字元")] });
    page.openEditor(page.configRows()[0]);
    assert.equal(page.context.document.getElementById("sel軸心").value, "定位\t字元");
  }));
});

test("mutation identity: trimming combo values again breaks restoring an edge-space part", async () => {
  const source = mutate(SOURCE, "  const text = String(value || \"\");\n  const trimmed = text.trim();\n  return trimmed && trimmed !== \"-\" ? text : \"-\";", "  const text = String(value || \"\").trim();\n  return text && text !== \"-\" ? text : \"-\";");
  assert.ok(await fails(async () => {
    // Dismantling builds the combo key that restoring later uses.
    const { page } = await openIdentityPage({ source, configTable: [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "  前後空白  ")] });
    const record = page.context.buildHistoryRecordFromConfigRow(page.configRows()[0], "", "");
    assert.equal(record.comboKey.split("|")[7], "  前後空白  ");
  }));
});
