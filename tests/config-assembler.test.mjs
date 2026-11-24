// Phase 7-3c: the assembler on the quick editor (spec 11 §5). Pure functions
// from config-view.js, then the real page (tests/helpers/config-page-harness.mjs):
// the structure switch, the 無獨立固鎖 slot and the live checks only display;
// every save still goes through the real addConfig / checkStock / D-019 path.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  assemblyHiddenBladeTypes,
  assemblyMissingSlots,
  assemblyModeOf,
  assemblyRatchetFixedText,
  assemblyRecordValues,
  assemblySelectedParts,
  assemblyStructureFromValues,
  buildAssemblyChecks,
  normalizeAssemblyStructure
} from "../config-view.js";
import { createMockFirestore, userDocPath } from "./helpers/mock-firestore.mjs";
import { configItem, createConfigPage, stockItem } from "./helpers/config-page-harness.mjs";

const PATH = userDocPath("user-a");

/* ---------- pure functions ---------- */

test("C-01 structures map to the editor modes addConfig reads", () => {
  assert.equal(normalizeAssemblyStructure("cx4"), "cx4");
  assert.equal(normalizeAssemblyStructure("bogus"), "std");
  assert.equal(assemblyModeOf("std"), "bxux");
  assert.equal(assemblyModeOf("cx3"), "cx");
  assert.equal(assemblyModeOf("cx4"), "cx");
  assert.equal(assemblyStructureFromValues("bxux", { "超越戰刃": "超越" }), "std");
  assert.equal(assemblyStructureFromValues("cx", {}), "cx3");
  assert.equal(assemblyStructureFromValues("cx", { "超越戰刃": "-", "金屬戰刃": "-" }), "cx3");
  assert.equal(assemblyStructureFromValues("cx", { "金屬戰刃": "金屬" }), "cx4");
  assert.deepEqual(assemblyHiddenBladeTypes("cx3"), ["超越戰刃", "金屬戰刃"]);
  assert.deepEqual(assemblyHiddenBladeTypes("cx4"), ["主要戰刃"]);
  assert.deepEqual(assemblyHiddenBladeTypes("std"), []);
});

test("C-02 record values and checked parts follow addConfig's composition", () => {
  const cx = { "紋章鎖": "飛龍", "主要戰刃": "龍騎", "超越戰刃": "超越", "金屬戰刃": "金屬", "輔助戰刃": "H", "固鎖": "3-60", "軸心": "Z", "上蓋": "" };
  assert.deepEqual(assemblyRecordValues("cx3", cx), { layer: "飛龍龍騎H", lockPart: "飛龍", mainPart: "龍騎", transcendPart: "-", metalPart: "-", auxPart: "H" });
  assert.deepEqual(assemblyRecordValues("cx4", cx), { layer: "飛龍金屬超越H", lockPart: "飛龍", mainPart: "超越/金屬", transcendPart: "超越", metalPart: "金屬", auxPart: "H" });
  assert.deepEqual(assemblyRecordValues("std", { "上蓋": "蒼龍神劍" }).layer, "蒼龍神劍");
  assert.deepEqual(assemblySelectedParts("cx4", cx).map(part => part.type), ["紋章鎖", "超越戰刃", "金屬戰刃", "輔助戰刃", "固鎖", "軸心"]);
  assert.deepEqual(assemblySelectedParts("std", { "上蓋": "惡魔冥界", "固鎖": "-", "軸心": "Z" }), [{ type: "上蓋", name: "惡魔冥界" }, { type: "軸心", name: "Z" }]);
  // A random booster being edited: every field is optional except 固鎖 and 軸心.
  assert.deepEqual(assemblyMissingSlots("std", { "固鎖": "3-60" }, { booster: true }), ["軸心"]);
  // Exact names, whitespace included (D-023).
  assert.deepEqual(assemblySelectedParts("std", { "上蓋": " 蒼龍  神劍 ", "固鎖": "3-60", "軸心": "Z" })[0], { type: "上蓋", name: " 蒼龍  神劍 " });
});

test("C-03 missing slots per structure; 無固鎖 counts as chosen", () => {
  assert.deepEqual(assemblyMissingSlots("std", {}), ["上蓋", "固鎖", "軸心"]);
  assert.deepEqual(assemblyMissingSlots("std", { "上蓋": "惡魔冥界", "固鎖": "-", "軸心": "Z" }), []);
  assert.deepEqual(assemblyMissingSlots("cx3", { "紋章鎖": "飛龍" }), ["主要戰刃", "輔助戰刃", "固鎖", "軸心"]);
  assert.deepEqual(assemblyMissingSlots("cx4", { "紋章鎖": "飛龍", "主要戰刃": "龍騎" }), ["超越戰刃", "金屬戰刃", "輔助戰刃", "固鎖", "軸心"]);
});

test("C-04 live check texts and levels", () => {
  assert.equal(assemblyRatchetFixedText({ integratedBlade: true }), "無獨立固鎖：固鎖與上蓋一體（官方）");
  assert.equal(assemblyRatchetFixedText({ integratedBit: true, axisLabel: "Tr" }), "無獨立固鎖：Tr 是固鎖一體型軸心（官方）");
  assert.deepEqual(buildAssemblyChecks({}), [{ level: "ok", text: "符合官方組裝規則，庫存足夠。" }]);
  const checks = buildAssemblyChecks({
    structure: "cx4",
    integratedBit: true,
    violations: [{ id: "x", message: "新違規。", kept: false }, { id: "y", message: "舊違規。", kept: true }],
    shortages: [{ label: "主要戰刃「龍騎」", total: 1, users: ["A", "B", "C", "D", "E", "F"] }],
    history: { result: "不好用" }
  });
  assert.deepEqual(checks.map(item => item.level), ["block", "warn", "block", "warn", "warn"]);
  assert.match(checks[0].text, /新違規。（官方規則，不能儲存）/);
  assert.match(checks[1].text, /原本就不符合官方組裝規則：舊違規。（儲存時會再確認）/);
  assert.equal(checks[2].text, "主要戰刃「龍騎」 已經沒有庫存（持有 1，已被 6 個配置使用：A、B、C、D、E 等 6 個）");
  assert.match(checks[3].text, /Tr／Op 裝在 CX 四件戰刃下：官方未說明，僅提示/);
  assert.match(checks[4].text, /以前拆解過（結果：不好用）/);
  // 時鐘幻象 with no ratchet yet: "not chosen", not a rule error.
  const clock = buildAssemblyChecks({ missing: ["固鎖"], fixEmpty: true, violations: [{ id: "simple-ratchet-only", message: "m", kept: false }] });
  assert.deepEqual(clock, [{ level: "info", text: "尚未選擇：固鎖" }]);
  assert.equal(buildAssemblyChecks({ stale: true, missing: ["上蓋"] }).length, 1);
  assert.match(buildAssemblyChecks({ shortages: [{ label: "上蓋「X」", total: 1, users: ["B"], dropped: true }] })[0].text, /^原本使用的上蓋「X」已經沒有庫存（持有 1，已被 1 個配置使用：B），請改選其他零件$/);
});

/* ---------- real page ---------- */

function seedData({ configTable = [], partTable = [], historyTable = [] } = {}) {
  return {
    updatedAt: 1,
    ownerUid: "user-a",
    ownerEmail: "a@example.test",
    beybladeTable: [
      stockItem("UX-21-01", "惡魔冥界", "-", "Z"),
      stockItem("BX-01", "蒼龍神劍", "3-60", "F"),
      stockItem("BX-02", "蒼龍  神劍", "4-60", "F"),
      { cells: ["CX-03", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"], mainStockName: "" }
    ],
    partTable: [
      { cells: ["固鎖", "3-60", "2"] },
      { cells: ["軸心", "Tr", "1"] },
      { cells: ["主要戰刃", "龍騎", "1"] },
      { cells: ["紋章鎖", "飛龍", "1"] },
      { cells: ["輔助戰刃", "H", "1"] },
      ...partTable
    ],
    configTable,
    historyTable
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

const checks = page => page.dom.document.getElementById("configAssemblyChecks").innerHTML;
const fixedSlot = page => page.dom.document.getElementById("configRatchetFixed");
const structure = (page, value) => page.context.setConfigAssemblyStructure(value);
function pick(page, parts) {
  for (const [type, value] of Object.entries(parts)) {
    assert.equal(page.select(type, value), value, `${type} offers ${value}`);
    if (type === "上蓋") page.context.syncConfigModelFromSelection();
    if (type === "軸心") page.context.updateNoRatchetConfigOption();
    page.context.renderConfigAssembler();
  }
}

test("C-05 standard, CX 3-piece and CX 4-piece through the structure switch save the same cells as before", async () => {
  const { mock, page } = await openPage();
  page.openEditor();
  assert.match(checks(page), /尚未選擇：上蓋、固鎖、軸心/);
  pick(page, { 上蓋: "蒼龍神劍", 固鎖: "3-60", 軸心: "F" });
  assert.match(checks(page), /符合官方組裝規則，庫存足夠/);
  page.save();
  await page.settle();

  page.openEditor();
  structure(page, "cx3");
  assert.equal(page.page.editorMode, "cx");
  pick(page, { 紋章鎖: "飛龍", 主要戰刃: "龍騎", 輔助戰刃: "H", 固鎖: "3-60", 軸心: "F" });
  // Switching to 4-piece clears the 3-piece main blade, so addConfig's either/or sees the screen.
  structure(page, "cx4");
  assert.equal(page.dom.elements.get("sel主要戰刃").value, "");
  assert.match(checks(page), /尚未選擇：超越戰刃、金屬戰刃/);
  structure(page, "cx3");
  pick(page, { 主要戰刃: "龍騎" });
  page.save();
  await page.settle();

  page.openEditor();
  structure(page, "cx4");
  pick(page, { 紋章鎖: "紋章鎖", 超越戰刃: "超越", 金屬戰刃: "金屬", 輔助戰刃: "S", 固鎖: "4-55", 軸心: "LO" });
  assert.match(checks(page), /符合官方組裝規則/);
  page.save();
  await page.settle();

  assert.deepEqual(page.effects.alerts, []);
  assert.deepEqual(mock.read(PATH).configTable, [
    { cells: ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"], mainStockName: "-" },
    { cells: ["CX-CUSTOM", "飛龍龍騎H", "飛龍", "龍騎", "-", "-", "H", "3-60", "F"], mainStockName: "龍騎" },
    { cells: ["CX-CUSTOM", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"], mainStockName: "" }
  ]);
  assert.equal(mock.stats.commits, 3, "one write per save");
});

test("C-06 switching structure and choosing parts writes nothing; cancel writes nothing", async () => {
  const { mock, page } = await openPage();
  const before = JSON.stringify(mock.read(PATH));
  page.openEditor();
  pick(page, { 上蓋: "蒼龍神劍", 固鎖: "3-60" });
  structure(page, "cx4");
  structure(page, "cx3");
  structure(page, "std");
  assert.equal(page.dom.elements.get("sel上蓋").value, "", "BX/UX ↔ CX clears the other side (existing)");
  page.context.closeConfigQuickEditor();
  await page.settle();
  assert.equal(JSON.stringify(mock.read(PATH)), before);
  assert.equal(mock.stats.commits, 0);
  assert.deepEqual(page.dirtyTables(), []);
});

test("C-07 integrated blade and Tr/Op show 無獨立固鎖; Tr/Op under CX 4-piece is only a hint", async () => {
  const { mock, page } = await openPage();
  page.openEditor();
  pick(page, { 上蓋: "惡魔冥界", 軸心: "Z" });
  assert.equal(page.dom.elements.get("sel固鎖").value, "-");
  assert.equal(fixedSlot(page).hidden, false);
  assert.equal(fixedSlot(page).textContent, "無獨立固鎖：固鎖與上蓋一體（官方）");
  assert.equal(page.dom.elements.get("sel固鎖").hidden, true);
  // Tr under an integrated blade: blocked by the official rule (shown, and on save).
  pick(page, { 軸心: "Tr" });
  assert.match(checks(page), /is-block.*不能使用 Tr／Op/);
  page.save();
  await page.settle();
  assert.match(page.effects.alerts.at(-1), /不能使用 Tr／Op/);
  assert.equal(mock.stats.commits, 0);
  page.context.closeConfigQuickEditor();

  page.openEditor();
  structure(page, "cx4");
  pick(page, { 紋章鎖: "紋章鎖", 超越戰刃: "超越", 金屬戰刃: "金屬", 輔助戰刃: "S", 軸心: "Tr" });
  assert.equal(fixedSlot(page).textContent, "無獨立固鎖：Tr 是固鎖一體型軸心（官方）");
  assert.match(checks(page), /is-warn.*Tr／Op 裝在 CX 四件戰刃下/);
  assert.match(checks(page), /符合官方組裝規則/);
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 1, "the hint does not block");
  assert.deepEqual(mock.read(PATH).configTable[0].cells, ["CX-CUSTOM", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "-", "Tr"]);
});

test("C-08 editing deducts the config's own parts, also after a refresh while the editor is open", async () => {
  const own = ["CX-CUSTOM", "飛龍龍騎H", "飛龍", "龍騎", "-", "-", "H", "3-60", "F"];
  const { mock, page } = await openPage({ configTable: [configItem(own, "龍騎")] });
  const row = page.configRows()[0];
  page.openEditor(row);
  assert.equal(page.page.assemblyStructure, "cx3");
  assert.equal(page.dom.elements.get("sel主要戰刃").value, "龍騎");
  assert.match(checks(page), /符合官方組裝規則，庫存足夠/);
  page.context.refreshSelectors();
  const option = page.dom.elements.get("sel主要戰刃").options.find(item => item.value === "龍騎");
  assert.match(option.textContent, /剩餘 1/);
  assert.equal(page.dom.elements.get("sel主要戰刃").value, "龍騎");
  // Saved as is: the save confirmation, then the same cells, one write.
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 0, "unchanged cells: nothing to write");
  assert.deepEqual(mock.read(PATH).configTable[0].cells, own);
});

test("C-09 a shortage lists the configs using the part and checkStock still blocks the save", async () => {
  const other = ["CX-CUSTOM", "飛龍龍騎H", "飛龍", "龍騎", "-", "-", "H", "3-60", "F"];
  const { mock, page } = await openPage();
  page.openEditor();
  structure(page, "cx3");
  pick(page, { 紋章鎖: "飛龍", 主要戰刃: "龍騎", 輔助戰刃: "H", 固鎖: "3-60", 軸心: "F" });
  // The same parts become used by another config while the editor is open
  // (simulated on the page; a cloud rebuild closes the editor instead).
  const tbody = page.dom.tables.configTable.tbody;
  const added = tbody.insertRow();
  other.forEach((value, index) => { added.insertCell(index).innerText = value; });
  added.insertCell(9).innerHTML = "";
  added.cells[3].dataset.stockName = "龍騎";
  page.context.refreshSelectors();
  assert.match(checks(page), /主要戰刃「龍騎」 已經沒有庫存（持有 1，已被 1 個配置使用：飛龍龍騎H）/);
  const commits = mock.stats.commits;
  page.save();
  await page.settle();
  assert.match(page.effects.alerts.at(-1), /已經沒有庫存/);
  assert.equal(mock.stats.commits, commits, "checkStock blocks: no write");
});

test("C-10 an edited config whose part is over-used shows the dropped part and who uses it", async () => {
  const a = ["CX-CUSTOM", "飛龍龍騎H", "飛龍", "龍騎", "-", "-", "H", "3-60", "F"];
  const b = ["CX-CUSTOM", "飛龍龍騎H", "飛龍", "龍騎", "-", "-", "H", "3-60", "Tr"];
  const { page } = await openPage({ configTable: [configItem(a, "龍騎"), configItem(b, "龍騎")] });
  page.openEditor(page.configRows()[0]);
  assert.match(checks(page), /原本使用的主要戰刃「龍騎」已經沒有庫存（持有 1，已被 1 個配置使用：飛龍龍騎H），請改選其他零件/);
});

test("C-11 exact names: whitespace variants are different parts, shown with marks", async () => {
  const { mock, page } = await openPage();
  page.openEditor();
  pick(page, { 上蓋: "蒼龍  神劍", 固鎖: "3-60", 軸心: "F" });
  assert.match(checks(page), /符合官方組裝規則/);
  page.save();
  await page.settle();
  assert.deepEqual(mock.read(PATH).configTable[0].cells, ["BX-02 CUSTOM", "蒼龍  神劍", "-", "-", "-", "-", "-", "3-60", "F"]);
  page.openEditor();
  pick(page, { 上蓋: "蒼龍神劍" });
  const options = page.selectOptions("上蓋");
  assert.ok(!options.includes("蒼龍  神劍"), "the used variant is no longer offered");
  assert.match(checks(page), /尚未選擇：固鎖、軸心/);
  assert.doesNotMatch(checks(page), /沒有庫存/);
});

test("C-12 edit: an existing violation is a warning, a new one a block; the save keeps the D-019 confirm", async () => {
  const bad = ["UX-21-01 CUSTOM", "惡魔冥界", "-", "-", "-", "-", "-", "3-60", "Z"];
  const { mock, page } = await openPage({ configTable: [configItem(bad, "-")] });
  page.openEditor(page.configRows()[0]);
  assert.match(checks(page), /is-warn.*原本就不符合官方組裝規則：惡魔冥界 是固鎖一體型上蓋，無法使用固鎖/);
  pick(page, { 軸心: "Tr" });
  assert.match(checks(page), /is-block.*不能使用 Tr／Op.*不能儲存/);
  pick(page, { 軸心: "Z" });
  // Cancel the D-019 confirm: nothing written.
  page.effects.confirmAnswers.push(false);
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, 0);
  assert.match(page.effects.confirms.at(-1), /原本就不符合官方組裝規則/);
});

test("C-13 teardown record hint for a new config only; stale edited row is reported", async () => {
  const historyTable = [{ model: "BX-01 CUSTOM", combo: "蒼龍神劍", fix: "3-60", axis: "F", result: "不好用", note: "-", date: "2026-11-01", comboKey: "" }];
  const { page } = await openPage({ historyTable });
  const record = page.context.buildHistoryRecordFromConfigValues({ model: "BX-01 CUSTOM", layer: "蒼龍神劍", lockPart: "-", mainPart: "-", transcendPart: "-", metalPart: "-", auxPart: "-", fix: "3-60", axis: "F" });
  page.historyRows()[0].dataset.comboKey = record.comboKey;
  page.openEditor();
  pick(page, { 上蓋: "蒼龍神劍", 固鎖: "3-60", 軸心: "F" });
  assert.match(checks(page), /以前拆解過（結果：不好用）/);
  page.context.closeConfigQuickEditor();

  const own = ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"];
  const second = await openPage({ configTable: [configItem(own, "-")] });
  const row = second.page.configRows()[0];
  second.page.openEditor(row);
  row.cells[8].innerText = "Tr";
  second.page.context.renderConfigAssembler();
  assert.match(checks(second.page), /這筆配置已經變更或不存在/);
});

/* ---------- protection ---------- */

const script = fs.readFileSync("script.js", "utf8");
const sha = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
function between(start, end) {
  const from = script.indexOf(start);
  const to = script.indexOf(end, from + 1);
  assert.ok(from >= 0 && to > from, start);
  return script.slice(from, to);
}

test("C-14 the assembler block never writes and the protected save path is unchanged", () => {
  const block = between("/* ===== Phase 7-3c assembler: start", "/* ===== Phase 7-3c assembler: end");
  assert.doesNotMatch(block, /saveData|runTransaction|setDoc|updateDoc|deleteDoc|addConfig\(|insertRow|deleteRow|innerText\s*=/);
  assert.equal(sha(between("function checkStock(", "/* ====== 第三區：新增配置紀錄")), "0bed51c10a056c87");
  assert.match(script, /if \(!checkConfigAssemblyRules\(model, layerSel, fixSel, axisSel\)\) return;/);
});

/* ---------- 7-3c review follow-up (targeted) ---------- */

const optionText = (page, type, value) => page.dom.elements.get(`sel${type}`).options.find(item => item.value === value)?.textContent || "";

test("C-15 repeated menu refreshes while editing neither deduct nor release stock twice", async () => {
  const own = ["CX-CUSTOM", "飛龍龍騎H", "飛龍", "龍騎", "-", "-", "H", "3-60", "F"];
  const { mock, page } = await openPage({ configTable: [configItem(own, "龍騎")] });
  page.openEditor(page.configRows()[0]);
  const first = ["主要戰刃|龍騎", "紋章鎖|飛龍", "固鎖|3-60"].map(key => optionText(page, ...key.split("|")));
  for (let index = 0; index < 4; index += 1) page.context.refreshSelectors();
  const again = ["主要戰刃|龍騎", "紋章鎖|飛龍", "固鎖|3-60"].map(key => optionText(page, ...key.split("|")));
  assert.deepEqual(again, first);
  assert.match(first[0], /剩餘 1/, "the edited config's own 龍騎 is available to it");
  assert.match(first[2], /剩餘 3/, "3-60: 2 extra + 1 BX-01 original; the edited config's own use is excluded");
  page.context.closeConfigQuickEditor();
  // Closed again: the menus count every config.
  page.context.refreshSelectors();
  assert.match(optionText(page, "主要戰刃", "龍騎"), /剩餘 0/, "closed: the config's own use counts again");
  assert.equal(mock.stats.commits, 0);
});

test("C-16 an over-used part that opens empty is never removed by saving: the save is refused, the row unchanged", async () => {
  // BX/UX: 蒼龍神劍 (1 owned) used by two configs.
  const a = ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"];
  const b = ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "Z"];
  const { mock, page } = await openPage({ configTable: [configItem(a, "-"), configItem(b, "-")] });
  const before = JSON.stringify(mock.read(PATH));
  page.openEditor(page.configRows()[0]);
  assert.equal(page.dom.elements.get("sel上蓋").value, "");
  assert.match(checks(page), /原本使用的上蓋「蒼龍神劍」已經沒有庫存/);
  page.save();
  await page.settle();
  assert.match(page.effects.alerts.at(-1), /BX \/ UX 系列請選擇：上蓋、固鎖、軸心/);
  assert.equal(JSON.stringify(mock.read(PATH)), before);
  assert.equal(mock.stats.commits, 0);
  assert.deepEqual(page.dirtyTables(), []);
  assert.deepEqual(page.configCells()[0], a);
});

test("C-17 hidden CX blades are never saved; switching and cancelling leaves the edited config unchanged", async () => {
  const { mock, page } = await openPage();
  page.openEditor();
  structure(page, "cx4");
  pick(page, { 紋章鎖: "紋章鎖", 超越戰刃: "超越", 金屬戰刃: "金屬" });
  structure(page, "cx3");
  assert.equal(page.dom.elements.get("sel超越戰刃").value, "");
  assert.equal(page.dom.elements.get("sel金屬戰刃").value, "");
  pick(page, { 紋章鎖: "飛龍", 主要戰刃: "龍騎", 輔助戰刃: "H", 固鎖: "3-60", 軸心: "F" });
  page.save();
  await page.settle();
  assert.deepEqual(mock.read(PATH).configTable.at(-1).cells, ["CX-CUSTOM", "飛龍龍騎H", "飛龍", "龍騎", "-", "-", "H", "3-60", "F"]);

  const four = ["CX-CUSTOM", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"];
  const second = await openPage({ configTable: [configItem(four, "")] });
  const stored = JSON.stringify(second.mock.read(PATH));
  second.page.openEditor(second.page.configRows()[0]);
  assert.equal(second.page.page.assemblyStructure, "cx4");
  structure(second.page, "cx3");
  structure(second.page, "std");
  second.page.context.closeConfigQuickEditor();
  await second.page.settle();
  assert.equal(JSON.stringify(second.mock.read(PATH)), stored);
  assert.deepEqual(second.page.configCells()[0], four);
  assert.equal(second.mock.stats.commits, 0);
  assert.deepEqual(second.page.dirtyTables(), []);
});

test("C-18 the live block matches the final decision of addConfig / checkStock / D-019", async () => {
  const cases = [
    { name: "legal BX", parts: { 上蓋: "蒼龍神劍", 固鎖: "3-60", 軸心: "F" }, blocked: false },
    { name: "integrated blade + Tr", parts: { 上蓋: "惡魔冥界", 軸心: "Tr" }, blocked: true },
    { name: "Tr with a ratchet", parts: { 上蓋: "蒼龍神劍", 固鎖: "3-60", 軸心: "Tr" }, blocked: true },
    { name: "integrated blade, ratchet chosen", parts: { 上蓋: "惡魔冥界", 固鎖: "3-60", 軸心: "Z" }, blocked: true },
    { name: "legal integrated blade", parts: { 上蓋: "惡魔冥界", 軸心: "Z" }, blocked: false }
  ];
  for (const item of cases) {
    const { mock, page } = await openPage();
    page.openEditor();
    pick(page, item.parts);
    const liveBlock = /is-block/.test(checks(page));
    page.save();
    await page.settle();
    const wrote = mock.stats.commits === 1;
    assert.equal(liveBlock, item.blocked, `${item.name}: live`);
    assert.equal(!wrote, item.blocked, `${item.name}: addConfig`);
  }
});

test("C-19 the editor mode switch no longer touches anything outside the editor", () => {
  assert.doesNotMatch(script, /querySelectorAll\("\[data-config-mode\]"\)/);
  assert.match(script, /querySelectorAll\("#configQuickEditor \[data-config-structure\]"\)/);
});
