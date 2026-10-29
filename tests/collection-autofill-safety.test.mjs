import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createDataSessionGuard, createSessionSnapshotGate, DATA_SESSION_STATES } from "../data-session-guard.js";
import { attachCatalogNames, getOfficialStockCode } from "../stock-catalog-names.js";

// H-1 / D-015: run the real script.js collection code against the real
// catalog files, with an in-memory DOM and Firestore mocks. Nothing here reads
// or writes Firebase, and the working tree is never modified.

const managerSource = fs.readFileSync("script.js", "utf8");
const stockData = JSON.parse(fs.readFileSync("stock_products_AUTOFILL_SAFE_2026-07-29-v3.json", "utf8"));
const nameCatalog = JSON.parse(fs.readFileSync("beyblade_x_model_chinese_english_2026-08-29.json", "utf8"));
const catalogProducts = attachCatalogNames(stockData.stockProducts, nameCatalog.records);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source range: ${startMarker}`);
  return source.slice(start, end);
}

const SLICES = [
  ["function normalizeModel(", "function normalizeAllModelCells("],
  ["const RANDOM_BOOSTER_MODELS", "function getConfigStructureModeFromRow("],
  ["function getValue(", "function preventInvalidPartCountInput("],
  ["function getStockNameFromCell(", "function escapeHtml("],
  ["function getTableData(", "function collectCurrentData()"],
  ["const STOCK_ROW_METADATA_KEYS", "function clearAllTables()"],
  ["function applyDataToTables(", "function startCloudListener("],
  ["function cancelPendingCloudSaves()", "function cancelSessionInteractions()"],
  ["function startCloudListener(", "function loadCloudDataForCurrentTarget("],
  ["function addManualStockRow()", "function finishStockAdd()"],
  ["function toHalfWidth(", "function setStockAutoPreviewState("],
  ["function getStockProductRowData(", "function closeStockProductChoice("]
];

const PRELUDE = `
let isApplyingRemoteData = false;
let stockProductsLoaded = false;
let stockProductsByExactCode = new Map();
let stockProductsByBaseCode = new Map();
let stockProductsByRecordId = new Map();
let hasPendingCloudSave = false;
let lastAppliedRemoteUpdatedAt = 0;
let initialDocumentMissingGeneration = null;
let unsubscribeCloudData = null;
`;

const EXPORTS = `
globalThis.__loadCatalog = products => {
  const { exactIndex, baseIndex } = buildStockProductIndexes(products);
  stockProductsByExactCode = exactIndex;
  stockProductsByBaseCode = baseIndex;
  stockProductsByRecordId = new Map(
    products.filter(product => product.autoFillEnabled && !product.needsReview && product.recordId)
      .map(product => [String(product.recordId).trim(), product])
  );
  stockProductsLoaded = true;
};
globalThis.__api = { applyDataToTables, getTableData, upgradeStoredStockItem, addManualStockRow, addAutoFilledStockProducts, startCloudListener };
`;

function createDom() {
  const tables = new Map();
  const makeTbody = () => {
    const tbody = {
      rows: [],
      insertRow() {
        const row = {
          dataset: {},
          cells: [],
          insertCell(index) {
            const cell = { innerText: "", innerHTML: "", dataset: {} };
            row.cells.splice(index, 0, cell);
            return cell;
          }
        };
        tbody.rows.push(row);
        return row;
      },
      set innerHTML(value) { if (value === "") tbody.rows = []; },
      get innerHTML() { return ""; }
    };
    return tbody;
  };
  ["beybladeTable", "partTable", "configTable", "historyTable"].forEach(id => tables.set(id, makeTbody()));
  const inputs = {};
  return {
    tables,
    inputs,
    document: {
      querySelector: selector => tables.get(selector.match(/^#(\w+) tbody$/)?.[1]) || null,
      querySelectorAll: selector => [...(tables.get(selector.match(/^#(\w+) tbody tr$/)?.[1])?.rows || [])],
      getElementById: id => (id in inputs ? { value: inputs[id] } : null)
    }
  };
}

function createHarness({ source = managerSource, loadCatalog = true } = {}) {
  const dom = createDom();
  const guard = createDataSessionGuard();
  const gate = createSessionSnapshotGate({
    selectData: data => ({
      beybladeTable: data?.beybladeTable || [],
      partTable: data?.partTable || [],
      configTable: data?.configTable || [],
      historyTable: data?.historyTable || []
    })
  });
  const effects = { saves: 0, listeners: [] };
  const context = {
    document: dom.document,
    getOfficialStockCode,
    crypto: globalThis.crypto,
    dataSessionGuard: guard,
    dataSnapshotGate: gate,
    requireLogin: () => Boolean(guard.captureWriteSession()),
    getOperationButtons: () => "",
    createHistoryRow() {},
    normalizeAllModelCells() {},
    sortBeybladeTable() {},
    refreshSelectors() {},
    clearFirstAreaInputs() {},
    updateDataAccessUi() {},
    cancelSessionInteractions() {},
    hasUnsavedDomInteraction: () => false,
    setSyncStatus() {},
    alert() {},
    console: { error() {}, warn() {}, debug() {} },
    getUserDocRef: uid => ({ uid }),
    onSnapshot: (ref, options, next, error) => {
      effects.listeners.push({ next, error });
      return () => {};
    },
    clearAllTables: () => dom.tables.forEach(tbody => { tbody.rows = []; }),
    saveData: () => { effects.saves += 1; }
  };
  const code = SLICES.map(([start, end]) => sourceBetween(source, start, end)).join("\n");
  vm.createContext(context);
  vm.runInContext(PRELUDE + code + EXPORTS, context);
  if (loadCatalog) context.__loadCatalog(catalogProducts);
  return { context, api: context.__api, dom, guard, gate, effects };
}

const stored = items => JSON.parse(JSON.stringify({
  updatedAt: 1,
  beybladeTable: items,
  partTable: [],
  configTable: [],
  historyTable: []
}));

function loadAndRead(harness, items) {
  harness.api.applyDataToTables(stored(items));
  return JSON.parse(JSON.stringify(harness.api.getTableData("beybladeTable", true)));
}

const MANUAL_UX03 = Object.freeze({
  cells: ["UX-03", "我的魔導神杖改裝", "-", "-", "-", "-", "-", "9-60", "LF"],
  mainStockName: "-"
});

test("H-1 #1: a manual UX-03 that uniquely matches the catalog keeps its original name and parts", () => {
  const h = createHarness();
  const loaded = loadAndRead(h, [MANUAL_UX03]);
  assert.deepEqual(loaded, [MANUAL_UX03]);
});

test("H-1 #2: a manual BX-01 that uniquely matches the catalog keeps its original content", () => {
  const item = { cells: ["BX-01", "自己的蒼龍", "-", "-", "-", "-", "-", "4-80", "HN"], mainStockName: "-" };
  const h = createHarness();
  assert.deepEqual(loadAndRead(h, [item]), [item]);
});

test("H-1 #3-#5: false, missing and malformed markers never upgrade and stay byte-for-byte equal", () => {
  const variants = [
    { ...MANUAL_UX03, stockAutoFilled: false },
    { ...MANUAL_UX03, stockAutoFilled: "false" },
    { ...MANUAL_UX03 },
    { ...MANUAL_UX03, stockAutoFilled: "TRUE" },
    { ...MANUAL_UX03, stockAutoFilled: 1 },
    { ...MANUAL_UX03, stockAutoFilled: "yes" },
    { ...MANUAL_UX03, stockAutoFilled: null },
    { ...MANUAL_UX03, stockAutoFilled: { value: true } },
    { ...MANUAL_UX03, stockRecordId: "UX-03", stockProductCode: "UX-03" }
  ];
  for (const item of variants) {
    const h = createHarness();
    const label = JSON.stringify(item.stockAutoFilled);
    assert.equal(h.api.upgradeStoredStockItem(structuredClone(item)).changed, false, label);
    const loaded = loadAndRead(h, [item]);
    assert.deepEqual(loaded[0].cells, item.cells, label);
    assert.equal(loaded[0][1], undefined);
    assert.equal(loaded[0].cells[1], "我的魔導神杖改裝", label);
    assert.ok(loaded[0].stockAutoFilled !== true && loaded[0].stockAutoFilled !== "true", `${label} must not become true`);
    assert.equal(loaded[0].stockRecordId, item.stockRecordId, label);
  }
});

test("H-1: loading never adds stockAutoFilled:true to legacy rows and keeps custom fields and falsy metadata", () => {
  const item = { ...MANUAL_UX03, stockAutoFilled: false, stockSetId: "", userNote: "生日禮物", quantity: 2, custom: { color: "藍" } };
  const h = createHarness();
  const loaded = loadAndRead(h, [item]);
  assert.deepEqual(loaded, [{ ...MANUAL_UX03, stockAutoFilled: false, userNote: "生日禮物", quantity: 2, custom: { color: "藍" } }]);
  assert.ok(!("stockSetId" in loaded[0]), "an empty metadata value is still omitted exactly as before");
});

test("H-1 #6: an explicit auto-filled row with a clear recordId is upgraded from the catalog", () => {
  const outdated = {
    cells: ["UX-03", "舊名稱", "-", "-", "-", "-", "-", "1-60", "F"],
    mainStockName: "-",
    stockAutoFilled: "true",
    stockRecordId: "UX-03",
    stockProductCode: "UX-03",
    userNote: "保留"
  };
  const h = createHarness();
  const result = h.api.upgradeStoredStockItem(structuredClone(outdated));
  assert.equal(result.changed, true);
  const loaded = loadAndRead(h, [outdated]);
  assert.deepEqual(loaded[0].cells, ["UX-03", "魔導神杖", "-", "-", "-", "-", "-", "5-70", "DB"]);
  assert.equal(loaded[0].stockAutoFilled, "true");
  assert.equal(loaded[0].stockRecordId, "UX-03");
  assert.equal(loaded[0].userNote, "保留", "non-catalog fields survive an upgrade");

  const booleanTrue = { ...outdated, stockAutoFilled: true };
  assert.equal(createHarness().api.upgradeStoredStockItem(structuredClone(booleanTrue)).changed, true);
});

test("H-1 #7: explicit auto-filled BX-00 / CX-00 rows are never resolved by guessing", () => {
  const cases = [
    { cells: ["BX-00", "歐比王肯諾比改", "-", "-", "-", "-", "-", "4-60", "P"], stockAutoFilled: "true", stockProductCode: "BX-00" },
    { cells: ["CX-00", "雄鹿鹿角", "-", "-", "-", "-", "-", "-", "-"], stockAutoFilled: "true", stockProductCode: "CX-00" },
    { cells: ["CX-00", "雄鹿鹿角", "-", "-", "-", "-", "-", "-", "-"], stockAutoFilled: "true", stockProductCode: "CX-00", stockRecordId: "CX-00-UNKNOWN" },
    { cells: ["UX-03", "舊名稱", "-", "-", "-", "-", "-", "1-60", "F"], stockAutoFilled: "true", stockProductCode: "UX-03", stockRecordId: "UX-03-STALE" }
  ];
  for (const item of cases) {
    const h = createHarness();
    assert.equal(h.api.upgradeStoredStockItem(structuredClone(item)).changed, false, JSON.stringify(item));
    assert.deepEqual(loadAndRead(h, [item])[0].cells, item.cells, JSON.stringify(item));
  }

  const known = { cells: ["BX-00", "x", "-", "-", "-", "-", "-", "-", "-"], stockAutoFilled: "true", stockRecordId: "BX-00-02-01", stockProductCode: "BX-00", stockSetInstanceId: "set-1" };
  const upgraded = createHarness().api.upgradeStoredStockItem(structuredClone(known));
  assert.equal(upgraded.changed, true, "a recordId identifies one shared-code product");
  assert.equal(upgraded.item.stockRecordId, "BX-00-02-01");
  assert.equal(upgraded.item.cells[1], "丘巴卡");
  assert.equal(upgraded.item.stockSetInstanceId, "set-1");
});

test("H-1 #8: a manual add is marked false, saved and reloaded without change", () => {
  const h = createHarness();
  const token = h.guard.begin({ ownerUid: "user-a" });
  h.guard.markReady(token);
  Object.assign(h.dom.inputs, { model: "UX-03", layer: "我的魔導神杖改裝", fix: "9-60", axis: "LF", lock: "", primaryBlade: "", transcendBlade: "", metalBlade: "", aux: "" });

  h.api.addManualStockRow();
  assert.equal(h.effects.saves, 1);
  const saved = JSON.parse(JSON.stringify(h.api.getTableData("beybladeTable", true)));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].stockAutoFilled, "false");
  assert.deepEqual(saved[0].cells, ["UX-03", "我的魔導神杖改裝", "-", "-", "-", "-", "-", "9-60", "LF"]);

  const reloaded = createHarness();
  assert.deepEqual(loadAndRead(reloaded, saved), saved);
});

test("H-1 #9: choosing an official product still auto-fills and stores the explicit marker and recordId", () => {
  const h = createHarness();
  const product = catalogProducts.find(item => item.recordId === "BX-00-02-01");
  h.api.addAutoFilledStockProducts([product]);
  const saved = JSON.parse(JSON.stringify(h.api.getTableData("beybladeTable", true)));
  assert.equal(saved[0].stockAutoFilled, "true");
  assert.equal(saved[0].stockRecordId, "BX-00-02-01");
  assert.equal(saved[0].cells[1], "丘巴卡");

  const withManual = createHarness();
  const loaded = loadAndRead(withManual, [MANUAL_UX03, ...saved]);
  assert.deepEqual(loaded[0], MANUAL_UX03, "an official pick does not affect other manual rows");
  assert.deepEqual(loaded[1], saved[0]);
});

function readyListener(h, data) {
  const token = h.guard.begin({ ownerUid: "user-a" });
  h.gate.begin(token);
  h.api.startCloudListener(token);
  const listener = h.effects.listeners.at(-1);
  listener.next({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true, data: () => structuredClone(data) });
  return token;
}

test("H-1 #10: loading manual rows that differ from the catalog never triggers a write-back", () => {
  const h = createHarness();
  readyListener(h, stored([MANUAL_UX03, { ...MANUAL_UX03, stockAutoFilled: "false" }, { ...MANUAL_UX03, stockAutoFilled: "TRUE" }]));
  assert.equal(h.guard.snapshot().state, DATA_SESSION_STATES.READY);
  assert.equal(h.effects.saves, 0);
});

test("H-1 #10b: an explicit auto-filled upgrade may save, but only after the session is ready", () => {
  const outdated = { cells: ["UX-03", "舊名稱", "-", "-", "-", "-", "-", "1-60", "F"], mainStockName: "-", stockAutoFilled: "true", stockRecordId: "UX-03" };
  const ready = createHarness();
  readyListener(ready, stored([outdated]));
  assert.equal(ready.effects.saves, 1);

  const cached = createHarness();
  const token = cached.guard.begin({ ownerUid: "user-a" });
  cached.gate.begin(token);
  cached.api.startCloudListener(token);
  cached.effects.listeners.at(-1).next({ metadata: { fromCache: true, hasPendingWrites: false }, exists: () => true, data: () => stored([outdated]) });
  assert.equal(cached.effects.saves, 0, "a cache snapshot never writes");
});

test("H-1 #11: normal collection add and delete still work on mixed manual and official rows", () => {
  const h = createHarness();
  const product = catalogProducts.find(item => item.recordId === "UX-03");
  loadAndRead(h, [MANUAL_UX03]);
  h.api.addAutoFilledStockProducts([product]);
  let saved = JSON.parse(JSON.stringify(h.api.getTableData("beybladeTable", true)));
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[0], MANUAL_UX03);

  h.dom.tables.get("beybladeTable").rows.splice(1, 1);
  saved = JSON.parse(JSON.stringify(h.api.getTableData("beybladeTable", true)));
  assert.deepEqual(saved, [MANUAL_UX03]);
});

function mutate(pattern, replacement) {
  const mutated = managerSource.replace(pattern, replacement);
  assert.notEqual(mutated, managerSource, `mutation pattern not found: ${pattern}`);
  return mutated;
}

test("mutation: removing both explicit-marker checks makes the manual-row test fail", () => {
  let source = mutate(/  if \(!isExplicitStockAutoFilled\(item\?\.stockAutoFilled\)\) return null;\r?\n/, "");
  source = source.replace(/  if \(!isExplicitStockAutoFilled\(item\?\.stockAutoFilled\)\) return \{ item, changed: false \};\r?\n/, "");
  const h = createHarness({ source });
  const loaded = loadAndRead(h, [MANUAL_UX03]);
  assert.notDeepEqual(loaded, [MANUAL_UX03], "without the guard the manual row is rewritten");
  assert.equal(loaded[0].cells[1], "魔導神杖");
});

test("mutation: restoring the old code fallback for an unknown recordId makes the stale-recordId test fail", () => {
  const source = mutate(
    /  if \(recordId\) return stockProductsByRecordId\.get\(recordId\) \|\| null;/,
    "  if (recordId && stockProductsByRecordId.has(recordId)) return stockProductsByRecordId.get(recordId);"
  );
  const item = { cells: ["UX-03", "舊名稱", "-", "-", "-", "-", "-", "1-60", "F"], stockAutoFilled: "true", stockProductCode: "UX-03", stockRecordId: "UX-03-STALE" };
  assert.equal(createHarness({ source }).api.upgradeStoredStockItem(item).changed, true);
});

test("mutation: dropping the manual marker or the stored extras makes the round-trip tests fail", () => {
  const noMarker = mutate(/  row\.dataset\.stockAutoFilled = "false";\r?\n/, "");
  const h = createHarness({ source: noMarker });
  const token = h.guard.begin({ ownerUid: "user-a" });
  h.guard.markReady(token);
  Object.assign(h.dom.inputs, { model: "UX-03", layer: "改裝", fix: "9-60", axis: "LF", lock: "", primaryBlade: "", transcendBlade: "", metalBlade: "", aux: "" });
  h.api.addManualStockRow();
  assert.equal(h.api.getTableData("beybladeTable", true)[0].stockAutoFilled, undefined);

  const noExtras = mutate(/  row\._storedItemExtras = getStoredItemExtras\(metadata\);\r?\n/, "");
  const loaded = loadAndRead(createHarness({ source: noExtras }), [{ ...MANUAL_UX03, stockAutoFilled: false, userNote: "x" }]);
  assert.ok(!("userNote" in loaded[0]) && !("stockAutoFilled" in loaded[0]), "without extras the fields are silently dropped");
});

test("H-1: the admin read-only view shows manual rows as stored and only enriches explicit auto-filled rows", () => {
  const viewSource = fs.readFileSync("user-view.js", "utf8");
  const context = {
    getOfficialStockCode,
    getStockCatalogLabel: () => "",
    getStockVariantLabel: () => ""
  };
  vm.createContext(context);
  vm.runInContext(`
    let stockCatalogByExactCode = new Map();
    let stockCatalogByBaseCode = new Map();
    let stockCatalogByRecordId = new Map();
    ${sourceBetween(viewSource, "function parseStockProductCode(", "function addCatalogEntry(")}
    ${sourceBetween(viewSource, "function getCatalogRowData(", "function setSyncStatus(")}
    globalThis.__load = products => products.forEach(product => {
      const parsed = parseStockProductCode(product.productCode);
      if (!parsed) return;
      const add = (map, key) => { if (!map.has(key)) map.set(key, []); map.get(key).push(product); };
      add(stockCatalogByExactCode, parsed.exactKey);
      if (parsed.hasChildNumber && !product.isSetProduct) add(stockCatalogByBaseCode, parsed.baseKey);
      if (product.recordId) stockCatalogByRecordId.set(String(product.recordId).trim(), product);
    });
    globalThis.__enrich = enrichOriginalStockItem;
  `, context);
  context.__load(catalogProducts);

  for (const item of [MANUAL_UX03, { ...MANUAL_UX03, stockAutoFilled: "false" }, { ...MANUAL_UX03, stockAutoFilled: "true", stockRecordId: "UX-03-STALE" }]) {
    assert.deepEqual(context.__enrich(structuredClone(item)).cells, item.cells, JSON.stringify(item));
  }
  const auto = context.__enrich({ ...MANUAL_UX03, stockAutoFilled: "true", stockRecordId: "UX-03" });
  assert.equal(auto.cells[1], "魔導神杖");
});
