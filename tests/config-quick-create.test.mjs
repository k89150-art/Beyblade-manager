// Phase 7-3d: quick create (spec 11 §6). 「複製配置」 and 「建立配置」 only prefill
// the assembler as a NEW config; every save still goes through the real
// addConfig / checkStock / D-019 path (tests/helpers/config-page-harness.mjs).
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildAssemblyChecks, prefillFromConfig, prefillFromStock } from "../config-view.js";
import { createMockFirestore, userDocPath } from "./helpers/mock-firestore.mjs";
import { configItem, createConfigPage, stockItem } from "./helpers/config-page-harness.mjs";

const PATH = userDocPath("user-a");

/* ---------- pure functions ---------- */

test("Q-01 copy: structure from the config, only its own slots, exact names", () => {
  assert.deepEqual(prefillFromConfig("bxux", { "上蓋": "蒼龍  神劍", "固鎖": "3-60", "軸心": "F", "紋章鎖": "-" }),
    { structure: "std", values: { "上蓋": "蒼龍  神劍", "固鎖": "3-60", "軸心": "F" }, notes: [] });
  // A CX config keeps its combined name in the 上蓋 column: never a part.
  assert.deepEqual(prefillFromConfig("cx", { "上蓋": "飛龍龍騎H", "紋章鎖": "飛龍", "主要戰刃": "龍騎", "超越戰刃": "-", "金屬戰刃": "-", "輔助戰刃": "H", "固鎖": "3-60", "軸心": "F" }).values,
    { "紋章鎖": "飛龍", "主要戰刃": "龍騎", "輔助戰刃": "H", "固鎖": "3-60", "軸心": "F" });
  // 4-piece: mainStockName is "" for a split blade.
  const four = prefillFromConfig("cx", { "上蓋": "x", "紋章鎖": "紋章鎖", "主要戰刃": "", "超越戰刃": "超越", "金屬戰刃": "金屬", "輔助戰刃": "S", "固鎖": "4-55", "軸心": "LO" });
  assert.equal(four.structure, "cx4");
  assert.deepEqual(Object.keys(four.values), ["紋章鎖", "超越戰刃", "金屬戰刃", "輔助戰刃", "固鎖", "軸心"]);
  // Integrated blade: "-" is not a ratchet, nothing is filled for it.
  assert.deepEqual(prefillFromConfig("bxux", { "上蓋": "惡魔冥界", "固鎖": "-", "軸心": "Z" }).values, { "上蓋": "惡魔冥界", "軸心": "Z" });
});

test("Q-02 collection: standard, CX 3/4-piece, booster, integrated; missing or unclear parts are not guessed", () => {
  const std = prefillFromStock({ model: "BX-01", values: { "上蓋": "蒼龍神劍", "紋章鎖": "-", "固鎖": "3-60", "軸心": "F" } });
  assert.deepEqual(std, { structure: "std", values: { "上蓋": "蒼龍神劍", "固鎖": "3-60", "軸心": "F" }, notes: [] });
  const cx4 = prefillFromStock({ model: "CX-03", cxAssembly: true, values: { "上蓋": "紋章鎖金屬超越S", "紋章鎖": "紋章鎖", "主要戰刃": "", "超越戰刃": "超越", "金屬戰刃": "金屬", "輔助戰刃": "S", "固鎖": "4-55", "軸心": "LO" } });
  assert.equal(cx4.structure, "cx4");
  assert.equal(cx4.values["上蓋"], undefined);
  const cx3 = prefillFromStock({ model: "CX-01", values: { "紋章鎖": "飛龍", "主要戰刃": "龍騎", "輔助戰刃": "H", "固鎖": "3-60", "軸心": "F" } });
  assert.equal(cx3.structure, "cx3");
  // A CX random booster without CX parts is a standard blade; with CX parts it is CX.
  assert.equal(prefillFromStock({ model: "CX-05", booster: true, values: { "上蓋": "抽包上蓋", "固鎖": "5-60", "軸心": "P" } }).structure, "std");
  assert.equal(prefillFromStock({ model: "CX-05", booster: true, values: { "紋章鎖": "L", "主要戰刃": "M", "輔助戰刃": "A" } }).structure, "cx3");
  const integrated = prefillFromStock({ model: "UX-21-01", values: { "上蓋": "惡魔冥界", "固鎖": "-", "軸心": "Z" } });
  assert.deepEqual(integrated.values, { "上蓋": "惡魔冥界", "軸心": "Z" });
  // Missing: not filled. Unclear (main blade and split blade both): no blade filled, a note.
  assert.deepEqual(prefillFromStock({ model: "CX-09", cxAssembly: true, values: { "紋章鎖": "飛龍", "固鎖": "3-60" } }).values, { "紋章鎖": "飛龍", "固鎖": "3-60" });
  const unclear = prefillFromStock({ model: "CX-09", cxAssembly: true, values: { "紋章鎖": "飛龍", "主要戰刃": "龍騎", "超越戰刃": "超越", "金屬戰刃": "金屬", "輔助戰刃": "H" } });
  assert.deepEqual(unclear.values, { "紋章鎖": "飛龍", "輔助戰刃": "H" });
  assert.match(unclear.notes[0].text, /戰刃結構不明確/);
  assert.deepEqual(buildAssemblyChecks({ missing: ["主要戰刃"], prefill: [{ type: "", text: "n" }] })[0], { level: "warn", text: "n" });
});

/* ---------- real page ---------- */

function seedData({ configTable = [], beybladeTable = null, partTable = [] } = {}) {
  return {
    updatedAt: 1,
    ownerUid: "user-a",
    ownerEmail: "a@example.test",
    beybladeTable: beybladeTable || [
      stockItem("UX-21-01", "惡魔冥界", "-", "Z"),
      stockItem("BX-01", "蒼龍神劍", "3-60", "F"),
      stockItem("BX-02", "蒼龍  神劍", "4-60", "F"),
      { cells: ["CX-03", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"], mainStockName: "", stockAssemblySystem: "CX_4P" },
      { cells: ["CX-01", "飛龍龍騎H", "飛龍", "龍騎", "-", "-", "H", "3-60", "F"], mainStockName: "龍騎" }
    ],
    partTable: [{ cells: ["固鎖", "3-60", "2"] }, { cells: ["軸心", "Tr", "1"] }, ...partTable],
    configTable,
    historyTable: []
  };
}

async function openPage(options) {
  const mock = createMockFirestore();
  mock.seed(PATH, seedData(options));
  const page = createConfigPage({ mock });
  page.signIn();
  page.deliver();
  await page.settle();
  return { mock, page };
}

function installView(page) {
  for (const id of ["configDetail", "historyDetail"]) {
    const detail = page.context.document.getElementById(id);
    const body = { innerHTML: "" };
    detail.querySelector = selector => (selector === "[data-detail-body]" ? body : null);
  }
  page.context.installConfigView();
  return {
    keys: () => [...page.context.document.getElementById("configViewList").innerHTML.matchAll(/data-select-key="([^"]+)"/g)].map(match => match[1]),
    copy: key => page.context.runConfigViewAction({ dataset: { configKey: key, configAction: "copy" } })
  };
}

const value = (page, type) => page.dom.elements.get(`sel${type}`).value;
const checks = page => page.dom.document.getElementById("configAssemblyChecks").innerHTML;
const title = page => page.dom.document.getElementById("configEditorTitle").textContent;
const stockRow = (page, model) => [...page.dom.tables.beybladeTable.tbody.rows].find(row => row.cells[0].innerText === model);

test("Q-03 copy opens a NEW config with the source parts; opening and cancelling write nothing", async () => {
  const own = ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "Z"];
  const { mock, page } = await openPage({ configTable: [configItem(own, "-")], partTable: [{ cells: ["上蓋", "蒼龍神劍", "1"] }, { cells: ["軸心", "Z", "2"] }] });
  const stored = JSON.stringify(mock.read(PATH));
  const view = installView(page);
  view.copy(view.keys()[0]);
  assert.equal(page.editorOpen(), true);
  assert.equal(page.page.editorRow, null, "no edit target: the copy is a new config");
  assert.equal(title(page), "複製配置");
  assert.deepEqual(["上蓋", "固鎖", "軸心"].map(type => value(page, type)), ["蒼龍神劍", "3-60", "Z"]);
  page.context.closeConfigQuickEditor();
  await page.settle();
  assert.equal(JSON.stringify(mock.read(PATH)), stored);
  assert.equal(mock.stats.commits, 0);
  assert.deepEqual(page.configCells()[0], own);
});

test("Q-04 a copy with enough stock saves one new config and leaves the source unchanged", async () => {
  const own = ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "Z"];
  const { mock, page } = await openPage({ configTable: [configItem(own, "-")], partTable: [{ cells: ["上蓋", "蒼龍神劍", "1"] }, { cells: ["軸心", "Z", "2"] }] });
  const view = installView(page);
  view.copy(view.keys()[0]);
  assert.match(checks(page), /符合官方組裝規則，庫存足夠/);
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 1);
  const configs = mock.read(PATH).configTable.map(item => item.cells);
  assert.equal(configs.length, 2);
  assert.ok(configs.some(cells => JSON.stringify(cells) === JSON.stringify(own)), "source unchanged");
  assert.equal(configs.filter(cells => cells[1] === "蒼龍神劍" && cells[8] === "Z").length, 2);
});

test("Q-05 a copy without stock is not saved: the used-up parts are not selected and the save is refused", async () => {
  const own = ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"];
  const { mock, page } = await openPage({ configTable: [configItem(own, "-")] });
  const view = installView(page);
  view.copy(view.keys()[0]);
  assert.equal(value(page, "上蓋"), "", "蒼龍神劍 has no stock left: not selected (the copy does not release the source's parts)");
  assert.match(checks(page), /上蓋「蒼龍神劍」沒有可用庫存，未自動選入/);
  page.save();
  await page.settle();
  assert.match(page.effects.alerts.at(-1), /請選擇：上蓋、固鎖、軸心/);
  assert.equal(mock.stats.commits, 0);
});

test("Q-06 copying a config that breaks a rule gets no exemption: the new-config rule blocks", async () => {
  const bad = ["UX-21-01 CUSTOM", "惡魔冥界", "-", "-", "-", "-", "-", "3-60", "Z"];
  const { mock, page } = await openPage({ configTable: [configItem(bad, "-")], partTable: [{ cells: ["上蓋", "惡魔冥界", "1"] }, { cells: ["軸心", "Z", "1"] }] });
  const view = installView(page);
  view.copy(view.keys()[0]);
  assert.equal(value(page, "固鎖"), "3-60");
  assert.match(checks(page), /is-block.*無法使用固鎖.*不能儲存/);
  assert.doesNotMatch(checks(page), /原本就不符合/);
  page.save();
  await page.settle();
  assert.match(page.effects.alerts.at(-1), /無法使用固鎖/);
  assert.deepEqual(page.effects.confirms, [], "no 'existing violation' confirm for a copy");
  assert.equal(mock.stats.commits, 0);
});

test("Q-07 from the collection: standard (special whitespace), CX 3-piece, CX 4-piece, integrated", async () => {
  const { mock, page } = await openPage();
  const stored = JSON.stringify(mock.read(PATH));
  const cases = [
    ["BX-02", "std", { "上蓋": "蒼龍  神劍", "固鎖": "4-60", "軸心": "F" }],
    ["CX-01", "cx3", { "紋章鎖": "飛龍", "主要戰刃": "龍騎", "輔助戰刃": "H", "固鎖": "3-60", "軸心": "F" }],
    ["CX-03", "cx4", { "紋章鎖": "紋章鎖", "超越戰刃": "超越", "金屬戰刃": "金屬", "輔助戰刃": "S", "固鎖": "4-55", "軸心": "LO" }],
    ["UX-21-01", "std", { "上蓋": "惡魔冥界", "固鎖": "-", "軸心": "Z" }]
  ];
  for (const [model, structure, expected] of cases) {
    assert.equal(page.context.createConfigFromStockRow(stockRow(page, model)), true, model);
    assert.equal(page.page.editorRow, null);
    assert.equal(page.page.assemblyStructure, structure, model);
    assert.equal(title(page), "從收藏建立配置");
    for (const [type, name] of Object.entries(expected)) assert.equal(value(page, type), name, `${model} ${type}`);
    page.context.closeConfigQuickEditor();
  }
  assert.equal(JSON.stringify(mock.read(PATH)), stored, "the collection and everything else unchanged");
  assert.equal(mock.stats.commits, 0);
  // Saving one: one write, the collection item unchanged, exact name kept.
  page.context.createConfigFromStockRow(stockRow(page, "BX-02"));
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 1);
  assert.deepEqual(mock.read(PATH).configTable[0].cells, ["BX-02 CUSTOM", "蒼龍  神劍", "-", "-", "-", "-", "-", "4-60", "F"]);
  assert.deepEqual(mock.read(PATH).beybladeTable, JSON.parse(stored).beybladeTable);
});

test("Q-08 missing parts are not guessed; stale rows and other accounts are refused", async () => {
  const beybladeTable = [{ cells: ["CX-09", "飛龍", "飛龍", "-", "-", "-", "-", "3-60", "-"], mainStockName: "-", stockAssemblySystem: "CX_3P" }];
  const { mock, page } = await openPage({ beybladeTable });
  page.context.createConfigFromStockRow(page.dom.tables.beybladeTable.tbody.rows[0]);
  assert.equal(page.page.assemblyStructure, "cx3");
  assert.equal(value(page, "紋章鎖"), "飛龍");
  assert.deepEqual(["主要戰刃", "輔助戰刃", "軸心"].map(type => value(page, type)), ["", "", ""]);
  assert.match(checks(page), /尚未選擇：主要戰刃、輔助戰刃、軸心/);
  page.context.closeConfigQuickEditor();
  // A row no longer in the table is refused.
  const detached = page.dom.tables.beybladeTable.tbody.rows[0];
  detached.parentElement = null;
  assert.equal(page.context.createConfigFromStockRow(detached), false);
  assert.equal(page.editorOpen(), false);
  // Another account takes over before its data is loaded: the editor needs the
  // current write session, so nothing opens and nothing is carried over.
  const second = await openPage();
  const row = stockRow(second.page, "BX-02");
  second.page.page.setUser({ uid: "user-b", email: "b@example.test" });
  second.page.context.beginDataSession("user-b", false);
  assert.equal(second.page.context.createConfigFromStockRow(row), false);
  assert.equal(second.page.editorOpen(), false);
  assert.equal(mock.stats.commits + second.mock.stats.commits, 0);
});

test("Q-09 a stale copy button is refused by the 7-3b freshness check", async () => {
  const own = ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"];
  const { page } = await openPage({ configTable: [configItem(own, "-")] });
  const view = installView(page);
  const key = view.keys()[0];
  page.context.selectConfigItem("configs", key);
  page.configRows()[0].cells[8].innerText = "Tr";
  view.copy(key);
  assert.equal(page.editorOpen(), false);
  assert.match(page.effects.alerts.at(-1), /資料已更新，請確認清單後再操作/);
});

const script = fs.readFileSync("script.js", "utf8");
test("Q-10 the quick-create block never writes; both entries run after the existing freshness checks", () => {
  const from = script.indexOf("/* ===== Phase 7-3d quick create: start");
  const to = script.indexOf("/* ===== Phase 7-3d quick create: end");
  const block = script.slice(from, to);
  assert.ok(from > 0 && to > from);
  assert.doesNotMatch(block, /saveData|runTransaction|setDoc|updateDoc|deleteDoc|addConfig\(|insertRow|innerText\s*=|configEditorRow\s*=/);
  const config = script.slice(script.indexOf("function runConfigViewAction("), script.indexOf("// Q1 / F-04: account change resets search"));
  assert.ok(config.indexOf("rowSignature(current) !== entry.signature") < config.indexOf('action === "copy"'));
  const collection = script.slice(script.indexOf("function runCollectionViewAction("), script.indexOf("// Q1 / F-04: called from resetQuickAddFormsForAccountChange"));
  assert.ok(collection.indexOf("rowSignature(current) !== entry.signature") < collection.indexOf('viewAction === "config"'));
});

test("Q-11 focus after closing: the opening button, then the source list item, then a safe control", () => {
  const close = script.slice(script.indexOf("function closeConfigQuickEditor("), script.indexOf("// Phase 7-3a: the row being edited must still be"));
  assert.match(close, /\[restoreFocus \? opener : null, restoreFocus && typeof fallback === "function" \? fallback\(\) : null, document\.getElementById\("openConfigEditorBtn"\)/);
  assert.match(script, /copyConfigFromRow\(row, button\.dataset\.configKey\)/);
  assert.match(script, /createConfigFromStockRow\(row, button\.dataset\.viewKey\)/);
  const open = script.slice(script.indexOf("function openConfigQuickEditor("), script.indexOf("window.openConfigQuickEditor = openConfigQuickEditor;"));
  assert.match(open, /configEditorFocusFallback = null;/, "a normal open never inherits an earlier fallback");
});
