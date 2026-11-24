// Phase 7-3b: the config / teardown-log display layer (D-022, spec 11 §4).
// Pure functions of config-view.js, plus the real script.js display layer run
// against the in-memory page (tests/helpers/config-page-harness.mjs) and the
// mock Firestore: display operations never write, the stored rows keep their
// exact values and fingerprints, and actions go through the existing entry
// points only after a freshness check. Nothing here touches Firebase.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  CONFIG_VIEW_MODE_STORAGE_KEY,
  buildConfigItems,
  buildHistoryItems,
  configListNotice,
  configParts,
  configStructures,
  configTabFromHash,
  configTitle,
  defaultConfigControls,
  filterConfigByControls,
  filterConfigItems,
  filterHistoryItems,
  normalizeConfigControls,
  normalizeConfigViewMode,
  sortConfigItems
} from "../config-view.js";
import { createMockFirestore, userDocPath } from "./helpers/mock-firestore.mjs";
import { configItem, createConfigPage, loadPageSource, stockItem } from "./helpers/config-page-harness.mjs";
import { VIEW_MODE_STORAGE_KEY } from "../collection-view.js";

const PATH = userDocPath("user-a");
const html = fs.readFileSync("index.html", "utf8");
const script = loadPageSource();
const viewCode = fs.readFileSync("config-view.js", "utf8");
const between = (source, start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `missing range ${start}`);
  return source.slice(a, b);
};

const STANDARD = ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"];
const INTEGRATED = ["UX-21-01 CUSTOM", "惡魔冥界", "-", "-", "-", "-", "-", "-", "Z"];
const TR_BIT = ["BX-02 CUSTOM", "地獄鐮刀", "-", "-", "-", "-", "-", "-", "Tr"];
const CX3 = ["CX-CUSTOM", "蒼龍勇氣S", "蒼龍", "勇氣", "-", "-", "S", "6-60", "V"];
const CX4 = ["CX-CUSTOM", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"];

/* ---------- pure functions ---------- */

test("structures come from the stored cells only", () => {
  assert.deepEqual(configStructures(STANDARD), ["standard"]);
  assert.deepEqual(configStructures(INTEGRATED), ["standard", "integratedBlade"]);
  assert.deepEqual(configStructures(TR_BIT), ["standard", "integratedBit"]);
  assert.deepEqual(configStructures(CX3), ["cx3"]);
  assert.deepEqual(configStructures(CX4), ["cx4"]);
  assert.deepEqual(configStructures(["UX-16 CUSTOM", "時鐘幻象", "-", "-", "-", "-", "-", "9-65", "Op"]), ["standard", "integratedBit"]);
});

test("parts are listed in assembly order with their exact stored names", () => {
  assert.deepEqual(configParts(STANDARD), [{ type: "上蓋", value: "蒼龍神劍" }, { type: "固鎖", value: "3-60" }, { type: "軸心", value: "F" }]);
  assert.deepEqual(configParts(INTEGRATED), [{ type: "上蓋", value: "惡魔冥界" }, { type: "軸心", value: "Z" }], "no ratchet (-) is not listed");
  assert.deepEqual(configParts(CX3).map(part => part.type), ["紋章鎖", "主要戰刃", "輔助戰刃", "固鎖", "軸心"]);
  assert.deepEqual(configParts(CX4).map(part => part.type), ["紋章鎖", "超越戰刃", "金屬戰刃", "輔助戰刃", "固鎖", "軸心"]);
  assert.deepEqual(configParts(["BX-CUSTOM", "雙  空白", "-", "-", "-", "-", "-", "3-60", "定位\t字元"]).map(part => part.value), ["雙  空白", "3-60", "定位\t字元"]);
  assert.equal(configTitle(CX4), "紋章鎖金屬超越S");
  assert.equal(configTitle(["CX-CUSTOM", "-", "蒼龍", "勇氣", "-", "-", "S", "6-60", "V"]), "蒼龍勇氣S");
});

const SNAPSHOTS = [STANDARD, INTEGRATED, TR_BIT, CX3, CX4].map((cells, index) => ({ key: `r${index}`, cells }));

test("search covers blade / combination, every part and the model, ignoring case and whitespace", () => {
  const items = buildConfigItems(SNAPSHOTS);
  const keys = list => list.map(item => item.key).join(",");
  assert.equal(keys(filterConfigItems(items, "惡魔")), "r1");
  assert.equal(keys(filterConfigItems(items, "tr")), "r2", "bit name, case-insensitive");
  assert.equal(keys(filterConfigItems(items, "4-55")), "r4");
  assert.equal(keys(filterConfigItems(items, "ux-21")), "r1", "model");
  assert.equal(keys(filterConfigItems(items, "紋章鎖 金屬")), "r4", "whitespace ignored in the query");
  assert.equal(keys(filterConfigItems(items, "")), "r0,r1,r2,r3,r4");
});

test("series and structure filters combine; sorting is display only and stable", () => {
  const items = buildConfigItems(SNAPSHOTS);
  const keys = list => list.map(item => item.key).join(",");
  assert.equal(keys(filterConfigByControls(items, { series: "CX" })), "r3,r4");
  assert.equal(keys(filterConfigByControls(items, { series: "BX", structure: "integratedBit" })), "r2");
  assert.equal(keys(filterConfigByControls(items, { structure: "integratedBlade" })), "r1");
  assert.equal(keys(filterConfigByControls(items, { structure: "cx4" })), "r4");
  assert.equal(keys(sortConfigItems(items, "default")), "r0,r1,r2,r3,r4", "the table order (sortTable)");
  assert.equal(keys(sortConfigItems([...items].reverse(), "default")), "r0,r1,r2,r3,r4");
  const blade = sortConfigItems(items, "blade").map(item => item.title);
  assert.deepEqual(blade, [...blade].sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true, sensitivity: "base" })));
  assert.deepEqual(items.map(item => item.cells), [STANDARD, INTEGRATED, TR_BIT, CX3, CX4], "items keep the stored cells untouched");
});

test("controls, view mode, hash tabs, notices and history search", () => {
  assert.deepEqual(defaultConfigControls(), { series: "all", structure: "all", sort: "default" });
  assert.deepEqual(normalizeConfigControls({ series: "OTHER", structure: "x", sort: "recent" }), defaultConfigControls());
  assert.deepEqual(normalizeConfigControls({ series: "UX", structure: "cx3", sort: "blade" }), { series: "UX", structure: "cx3", sort: "blade" });
  assert.equal(normalizeConfigViewMode("card"), "card");
  assert.equal(normalizeConfigViewMode("grid"), "list");
  assert.notEqual(CONFIG_VIEW_MODE_STORAGE_KEY, VIEW_MODE_STORAGE_KEY, "its own localStorage key");
  assert.equal(configTabFromHash("#historySection"), "history");
  assert.equal(configTabFromHash("#configSection"), "configs");
  assert.equal(configTabFromHash("#collectionSection"), null);
  assert.equal(configListNotice({ signedIn: false, kind: "history" }), "登入後會顯示你的拆解紀錄。");
  assert.equal(configListNotice({ signedIn: true, total: 2, shown: 0, kind: "configs" }), "沒有符合條件的配置。");
  const history = buildHistoryItems([{ key: "h1", cells: ["BX-CUSTOM", "蒼龍  神劍", "3-60", "F", "好用", "備註", "2026/11/24"], comboKey: "k" }]);
  assert.equal(history[0].combo, "蒼龍  神劍");
  assert.equal(filterHistoryItems(history, "蒼龍神劍").length, 1);
  assert.equal(filterHistoryItems(history, "不好用").length, 0);
});

test("config-view.js is pure: no DOM, storage, Firestore or writes", () => {
  assert.doesNotMatch(viewCode, /document\.|window\.|localStorage|firebase|saveData|runTransaction|setDoc|updateDoc|deleteDoc|innerText|innerHTML/);
});

/* ---------- markup ---------- */

test("markup: tabs keep the section ids; lists, panels and toolbars sit outside the original tables", () => {
  assert.match(html, /<div id="configTabs" class="collection-tabs config-tabs" role="tablist" aria-label="配置分頁" hidden>/);
  assert.match(html, /role="tab" id="configTabConfigs"[^>]*aria-controls="configSection" aria-selected="true"/);
  assert.match(html, /role="tab" id="configTabHistory"[^>]*aria-controls="historySection" aria-selected="false" tabindex="-1"/);
  const configs = between(html, '<section id="configSection"', "</section>");
  const history = between(html, '<section id="historySection"', "</section>");
  for (const section of [configs, history]) assert.doesNotMatch(section, /id="configTable"|id="historyTable"/, "no original table inside a tab panel");
  assert.match(configs, /id="configViewList"[\s\S]*id="configDetail"/);
  assert.match(history, /id="historyViewList"[\s\S]*id="historyDetail"/);
  assert.match(history, /<h2>拆解紀錄<\/h2>/, "A5: display text only");
  const sources = between(html, '<div id="configSourceTables"', "</main>");
  assert.match(sources, /<div id="configSourceBox" class="source-table-box" data-source-table="configTable">[\s\S]*<table id="configTable">/);
  assert.match(sources, /<div id="historySourceBox" class="source-table-box" data-source-table="historyTable">[\s\S]*<table id="historyTable">/);
  assert.doesNotMatch(sources, /\shidden[\s>]|display:\s*none|visibility/, "the source area is never hidden in markup");
  // Original table markup unchanged.
  const headers = id => [...between(html, `<table id="${id}">`, "</table>").matchAll(/<th>([^<]+)<\/th>/g)].map(match => match[1]);
  assert.deepEqual(headers("configTable"), ["型號", "上蓋", "紋章鎖", "主要戰刃", "超越戰刃", "金屬戰刃", "輔助戰刃", "固鎖", "軸心", "操作"]);
  assert.deepEqual(headers("historyTable"), ["型號", "組合", "固鎖", "軸心", "結果", "備註", "日期", "操作"]);
  // The config view never uses the collection view's attributes.
  assert.doesNotMatch(between(html, '<div id="configTabs"', '<div id="configSourceTables"'), /data-view-mode=|data-view-toggle|data-list-controls|data-detail-layout|data-view-select|data-collection-tab/);
});

test("script: the view only reads rows and calls existing functions; it never writes cells, rows or storage", () => {
  const block = between(script, "/* ===== Phase 7-3b config view: begin", "/* ===== Phase 7-3b config view: end");
  assert.doesNotMatch(block, /saveData\(|setDoc|updateDoc|runTransaction|collectionSync\.|submitCollectionSave/);
  assert.doesNotMatch(block, /\.innerText\s*=|cell\.textContent\s*=|row\.dataset\.\w+\s*=(?!=)|\.insertRow\(|(?<!window)\.deleteRow\(|\.remove\(\)|appendChild|insertBefore|replaceChildren|\.click\(\)/);
  assert.match(block, /cells: getPersistedRowCells\(row\)/);
  assert.match(block, /readStoredCellText\(cell\)/);
  assert.match(block, /if \(action === "edit"\) window\.editRow\(source, "config"\);/);
  assert.match(block, /else if \(action === "delete"\) window\.deleteRow\(source\);/);
  assert.match(block, /else if \(action === "restore"\) window\.restoreHistoryRow\(source\);/);
  assert.match(block, /else if \(action === "remove"\) window\.deleteHistoryRow\(source\);/);
  assert.match(block, /row\.isConnected && row\.closest\("table"\)\?\.id === entry\.tableId/);
  assert.match(block, /rowSignature\(current\) !== entry\.signature/);
  assert.doesNotMatch(block, /setSourceBoxHidden\([^)]*\b(true)\b[^)]*\)[\s\S]*display\s*=\s*"none"/);
});

/* ---------- the real display layer in the page ---------- */

const SPECIAL = configItem(["BX-CUSTOM", "雙  空白", "-", "-", "-", "-", "-", "3-60", "定位\t字元"], "-");
const HISTORY = { model: "BX-01 CUSTOM", combo: "蒼龍神劍", fix: "3-60", axis: "F", result: "好\t用", note: "備註\n兩行  空白", date: "2026/11/24", comboKey: "蒼龍神劍|-|-|-|-|-|3-60|F" };

function seed(extra = {}) {
  return {
    updatedAt: 1,
    ownerUid: "user-a",
    ownerEmail: "a@example.test",
    beybladeTable: [
      stockItem("UX-21-01", "惡魔冥界", "-", "Z"),
      stockItem("BX-01", "蒼龍神劍", "3-60", "F"),
      stockItem("UX-03", "雙  空白", "-", "Z")
    ],
    partTable: [{ cells: ["固鎖", "3-60", "3"] }, { cells: ["軸心", "定位\t字元", "1"] }, { cells: ["軸心", "Z", "1"] }],
    configTable: [configItem(INTEGRATED, "-"), configItem(STANDARD, "-"), SPECIAL],
    historyTable: [HISTORY],
    ...extra
  };
}

// The detail body and both lists are read from the elements the view writes.
function installView(page) {
  const detailBodies = {};
  for (const id of ["configDetail", "historyDetail"]) {
    const detail = page.context.document.getElementById(id);
    const body = { innerHTML: "" };
    detail.querySelector = selector => (selector === "[data-detail-body]" ? body : null);
    detailBodies[id] = body;
  }
  page.context.installConfigView();
  return {
    list: id => page.context.document.getElementById(id).innerHTML,
    detail: id => detailBodies[id].innerHTML,
    select: (kind, key) => page.context.selectConfigItem(kind, key),
    keys: id => [...page.context.document.getElementById(id).innerHTML.matchAll(/data-select-key="([^"]+)"/g)].map(match => match[1]),
    render: () => page.context.renderConfigView()
  };
}

async function openViewPage(data = seed()) {
  const mock = createMockFirestore();
  mock.seed(PATH, data);
  const page = createConfigPage({ mock });
  page.setInnerTextView("rendered");
  page.signIn();
  page.deliver();
  await page.settle();
  const view = installView(page);
  view.render();
  return { mock, page, view };
}

test("view: lists render from the original rows; pure display operations write nothing and keep every fingerprint", async () => {
  const { mock, page, view } = await openViewPage();
  const before = { stored: JSON.stringify(mock.read(PATH)), tables: JSON.stringify(page.tables()) };
  assert.equal(view.keys("configViewList").length, 3);
  assert.equal(view.keys("historyViewList").length, 1);
  assert.doesNotMatch(view.list("configViewList"), /不符合規則/, "none of these configs breaks a rule");
  assert.match(view.list("configViewList"), /<span class="cv-tag">固鎖一體上蓋<\/span>/);
  // search, filters, sort, view mode, tabs, selection and closing
  const search = page.context.document.getElementById("configSearchInput");
  search.value = "定位";
  view.render();
  assert.equal(view.keys("configViewList").length, 1);
  search.value = "";
  page.context.setConfigControl("structure", "integratedBlade");
  view.render();
  assert.equal(view.keys("configViewList").length, 1);
  page.context.setConfigControl("structure", "all");
  page.context.setConfigControl("sort", "blade");
  page.context.setConfigControl("series", "BX");
  view.render();
  page.context.setConfigViewMode("card");
  page.context.setConfigTab("history");
  page.context.setConfigTab("configs");
  const key = view.keys("configViewList")[0];
  view.select("configs", key);
  assert.match(view.detail("configDetail"), /拆解紀錄中的相同組合/);
  page.context.closeConfigDetail({ clear: true });
  await page.wait(250);
  await page.settle();
  assert.equal(mock.stats.transactions, 0, "no write");
  assert.deepEqual(page.dirtyTables(), []);
  assert.equal(JSON.stringify(mock.read(PATH)), before.stored);
  assert.equal(JSON.stringify(page.tables()), before.tables, "special whitespace and order unchanged");
});

test("view: the detail shows exact names, stock per part, rule warnings and the same-combination teardown log", async () => {
  const violating = configItem(["UX-21-01 CUSTOM", "惡魔冥界", "-", "-", "-", "-", "-", "3-60", "Z"], "-");
  const { page, view } = await openViewPage(seed({ configTable: [violating, configItem(STANDARD, "-"), SPECIAL] }));
  const keys = view.keys("configViewList");
  view.select("configs", keys[0]);
  assert.match(view.detail("configDetail"), /不符合組裝規則（既有配置，只提示）/);
  assert.match(view.detail("configDetail"), /固鎖一體型上蓋，無法使用固鎖/);
  view.select("configs", keys[1]);
  assert.match(view.detail("configDetail"), /拆解紀錄中的相同組合（1）/);
  assert.doesNotMatch(view.detail("configDetail"), /不符合組裝規則/);
  view.select("configs", keys[2]);
  assert.match(view.detail("configDetail"), /雙␣␣空白/, "hidden whitespace is marked in the panel");
  assert.match(view.detail("configDetail"), /定位⇥字元 <span class="cv-detail-stock">可用 0<\/span>/, "exact-name stock");
});

test("view: actions go through the existing functions after a freshness check", async () => {
  const { page, view } = await openViewPage();
  const keys = view.keys("configViewList");
  view.select("configs", keys[1]);
  // 修改 opens the existing quick editor on that very row.
  page.context.runConfigViewAction({ dataset: { configKey: keys[1], configAction: "edit" } });
  assert.equal(page.page.editorRow, page.configRows()[1]);
  page.context.closeConfigQuickEditor({ restoreFocus: false });
  // A row that changed after it was shown: nothing is called.
  view.select("configs", keys[0]);
  page.configRows()[0].cells[8].innerText = "Op";
  page.context.runConfigViewAction({ dataset: { configKey: keys[0], configAction: "edit" } });
  assert.equal(page.page.editorRow, null);
  assert.match(page.effects.alerts.at(-1), /資料已更新，請確認清單後再操作/);
});

test("view: restoring from the teardown log uses the existing restore (one write)", async () => {
  const { mock, page, view } = await openViewPage(seed({ configTable: [configItem(INTEGRATED, "-")] }));
  page.context.setConfigTab("history");
  const key = view.keys("historyViewList")[0];
  view.select("history", key);
  assert.match(view.detail("historyDetail"), /還原成配置/);
  page.context.runConfigViewAction({ dataset: { configKey: key, configAction: "restore" } });
  await page.settle();
  assert.equal(mock.stats.commits, 1);
  assert.deepEqual(mock.read(PATH).configTable.map(item => item.cells[1]), ["惡魔冥界", "蒼龍神劍"], "restored in sorted order");
  assert.ok(mock.read(PATH).configTable.some(item => item.cells[1] === "蒼龍神劍" && item.cells[8] === "F"));
});

test("view: a remote rebuild or an account change closes the panel and forgets the selection", async () => {
  const { mock, page, view } = await openViewPage();
  const key = view.keys("configViewList")[0];
  view.select("configs", key);
  // Another device changes the configs; the page rebuilds its rows.
  mock.externalMerge(PATH, { configTable: [configItem(STANDARD, "-")], updatedAt: 9 });
  page.deliver();
  await page.settle();
  view.render();
  assert.match(view.detail("configDetail"), /資料已更新，請重新選擇。/);
  assert.equal(page.page.configView.selection, null);
  // Account change: search, filters and selection reset.
  view.select("configs", view.keys("configViewList")[0]);
  page.context.document.getElementById("configSearchInput").value = "蒼龍";
  page.context.setConfigControl("series", "CX");
  // The account-change reset (Q1) calls it; the in-memory rows cannot run the
  // collection part of that reset, so the config part is called directly.
  assert.match(between(script, "function resetCollectionViewState(", "function syncListControls("), /resetConfigViewState\(\);/);
  page.context.resetConfigViewState();
  assert.equal(page.context.document.getElementById("configSearchInput").value, "");
  assert.deepEqual(page.page.configView.controls, defaultConfigControls());
  assert.equal(page.page.configView.selection, null);
});

test("mutation view: a view that wrote a cell would be caught by the fingerprint check", async () => {
  // Sanity check of the test itself: changing a stored cell makes the table dirty.
  const { page } = await openViewPage();
  page.configRows()[2].cells[1].innerText = "雙 空白";
  assert.deepEqual(page.dirtyTables(), ["configTable"]);
});
