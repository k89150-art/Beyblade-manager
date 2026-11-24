// Phase 7-3a: D-019 on the config editor's real save path. Every case opens the
// real quick editor, picks options that the real refreshSelectors offered and
// calls the real window.addConfig, which saves through the real saveData /
// D-018 transaction into the mock Firestore (tests/helpers/config-page-harness.mjs).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { createMockFirestore, userDocPath } from "./helpers/mock-firestore.mjs";
import { configItem, createConfigPage, stockItem } from "./helpers/config-page-harness.mjs";

const PATH = userDocPath("user-a");
const cfg = (cells, mainStockName = cells[3]) => configItem(cells, mainStockName);

// Collection: 惡魔冥界 (UX-21-01, integrated blade), 彈丸獅鷲 (UX-19), 榮耀戰神
// (UX-20), 時鐘幻象 (UX-16), a BX blade and a CX 4-piece product. 時鐘幻象 is
// also an extra part, so a second one can be built with a non-UX-16 model.
function seedData({ configTable = [], extraParts = [], withoutUx16 = false } = {}) {
  return {
    updatedAt: 1,
    ownerUid: "user-a",
    ownerEmail: "a@example.test",
    beybladeTable: [
      stockItem("UX-21-01", "惡魔冥界", "-", "Z"),
      stockItem("UX-19", "彈丸獅鷲", "-", "Q"),
      stockItem("UX-20", "榮耀戰神", "-", "M"),
      ...(withoutUx16 ? [] : [stockItem("UX-16", "時鐘幻象", "9-65", "B")]),
      stockItem("BX-01", "蒼龍神劍", "3-60", "F"),
      { cells: ["CX-03", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"], mainStockName: "" }
    ],
    partTable: [
      { cells: ["固鎖", "3-60", "3"] },
      { cells: ["固鎖", "9-60", "1"] },
      { cells: ["固鎖", "4-60", "1"] },
      { cells: ["軸心", "Tr", "1"] },
      { cells: ["軸心", "Op", "1"] },
      { cells: ["軸心", "Z", "1"] },
      { cells: ["主要戰刃", "龍騎", "1"] },
      { cells: ["紋章鎖", "飛龍", "1"] },
      { cells: ["輔助戰刃", "H", "1"] },
      ...extraParts
    ],
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

function snapshot(mock) {
  const stored = mock.read(PATH);
  return { json: JSON.stringify(stored), commits: mock.stats.commits, transactions: mock.stats.transactions };
}

// Nothing was written and no authoritative row changed.
function assertUntouched(mock, page, before, rowsBefore) {
  assert.deepEqual(snapshot(mock), before, "cloud document (fingerprint and update) unchanged, no transaction");
  assert.deepEqual(page.configCells(), rowsBefore, "config rows unchanged");
  assert.deepEqual(page.dirtyTables(), [], "no unsaved table");
}

async function buildNew(page, parts) {
  page.openEditor();
  page.build(parts);
  page.save();
  await page.settle();
}

/* ---------- new configs ---------- */

test("new config: the three gaps found in 7-3 review are now blocked on the real addConfig path", async () => {
  const cases = [
    { name: "惡魔冥界＋3-60", parts: { 上蓋: "惡魔冥界", 固鎖: "3-60", 軸心: "Z" }, message: /惡魔冥界 是固鎖一體型上蓋，無法使用固鎖/ },
    { name: "惡魔冥界＋Tr", parts: { 上蓋: "惡魔冥界", 軸心: "Tr" }, message: /惡魔冥界 是固鎖一體型上蓋，不能使用 Tr／Op/ },
    { name: "時鐘幻象 (not UX-16)＋9-60", extra: true, parts: { 上蓋: "時鐘幻象", 固鎖: "9-60", 軸心: "Z" }, message: /時鐘幻象只能使用簡易固鎖/ }
  ];
  for (const item of cases) {
    // Third case: 時鐘幻象 is only an extra part (no UX-16 in the collection),
    // so the editor builds it with the model BX-CUSTOM, not UX-16.
    const { mock, page } = await openPage(item.extra ? { withoutUx16: true, extraParts: [{ cells: ["上蓋", "時鐘幻象", "1"] }] } : {});
    if (item.extra) assert.equal(page.context.buildInternalConfigModel("bxux", "時鐘幻象"), "BX-CUSTOM");
    const before = snapshot(mock);
    const rowsBefore = page.configCells();
    await buildNew(page, item.parts);
    assert.equal(page.effects.alerts.length, 1, item.name);
    assert.match(page.effects.alerts[0], item.message, item.name);
    assert.deepEqual(page.effects.confirms, [], `${item.name}: no confirm`);
    assertUntouched(mock, page, before, rowsBefore);
    assert.equal(page.editorOpen(), true, `${item.name}: the editor stays open`);
  }
});

test("new config: the existing UX-19, UX-20 and UX-16 rules still block, and a legal 時鐘幻象 saves", async () => {
  const blocked = [
    [{ 上蓋: "彈丸獅鷲", 固鎖: "3-60", 軸心: "Z" }, /彈丸獅鷲 是固鎖一體型上蓋，無法使用固鎖/],
    [{ 上蓋: "榮耀戰神", 軸心: "Tr" }, /榮耀戰神 是固鎖一體型上蓋，不能使用 Tr／Op/],
    [{ 上蓋: "時鐘幻象", 固鎖: "9-60", 軸心: "Z" }, /時鐘幻象只能使用簡易固鎖/],
    [{ 上蓋: "時鐘幻象", 軸心: "Tr" }, /時鐘幻象只能使用簡易固鎖/]
  ];
  for (const [parts, message] of blocked) {
    const { mock, page } = await openPage();
    const before = snapshot(mock);
    await buildNew(page, parts);
    assert.match(page.effects.alerts.join("\n"), message);
    assertUntouched(mock, page, before, []);
  }
  const { mock, page } = await openPage({ extraParts: [{ cells: ["固鎖", "9-65", "1"] }] });
  await buildNew(page, { 上蓋: "時鐘幻象", 固鎖: "9-65", 軸心: "Z" });
  assert.deepEqual(page.effects.alerts, []);
  assert.deepEqual(page.configCells(), [["UX-16 CUSTOM", "時鐘幻象", "-", "-", "-", "-", "-", "9-65", "Z"]]);
  assert.equal(mock.stats.commits, 1);
});

test("new config: integrated blades and bits get 無固鎖 on the save path (getNoRatchetFixValue gets the blade)", async () => {
  // The user clears the ratchet select: addConfig must still fill "-" for 惡魔冥界.
  const { mock, page } = await openPage();
  page.openEditor();
  page.build({ 上蓋: "惡魔冥界", 軸心: "Z" });
  assert.equal(page.select("固鎖", "-"), "-", "the editor offers 無固鎖 for 惡魔冥界");
  page.dom.elements.get("sel固鎖").value = "";
  assert.equal(page.dom.elements.get("sel固鎖").value, "");
  page.save();
  await page.settle();
  assert.deepEqual(page.effects.alerts, []);
  const stored = mock.read(PATH).configTable;
  assert.deepEqual(stored, [{ cells: ["UX-21-01 CUSTOM", "惡魔冥界", "-", "-", "-", "-", "-", "-", "Z"], mainStockName: "-" }]);

  // Op under a BX blade: 無固鎖, saved.
  const second = await openPage();
  await buildNew(second.page, { 上蓋: "蒼龍神劍", 軸心: "Op" });
  assert.deepEqual(second.page.effects.alerts, []);
  assert.deepEqual(second.mock.read(PATH).configTable, [{ cells: ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "-", "Op"], mainStockName: "-" }]);
});

test("legal configs keep the same 9 cells and mainStockName (BX/UX, CX 3-piece, CX 4-piece)", async () => {
  const { mock, page } = await openPage();
  await buildNew(page, { 上蓋: "蒼龍神劍", 固鎖: "3-60", 軸心: "Z" });
  await buildNew(page, { mode: "cx", 紋章鎖: "飛龍", 主要戰刃: "龍騎", 輔助戰刃: "H", 固鎖: "3-60", 軸心: "Z" });
  assert.deepEqual(page.effects.alerts, []);
  // CX 4-piece from the CX-03 parts.
  await buildNew(page, { mode: "cx", 紋章鎖: "紋章鎖", 超越戰刃: "超越", 金屬戰刃: "金屬", 輔助戰刃: "S", 固鎖: "4-55", 軸心: "LO" });
  assert.deepEqual(page.effects.alerts, []);
  const stored = mock.read(PATH).configTable;
  assert.deepEqual(stored, [
    { cells: ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "Z"], mainStockName: "-" },
    { cells: ["CX-CUSTOM", "飛龍龍騎H", "飛龍", "龍騎", "-", "-", "H", "3-60", "Z"], mainStockName: "龍騎" },
    { cells: ["CX-CUSTOM", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"], mainStockName: "" }
  ]);
  assert.equal(mock.stats.commits, 3);
});

/* ---------- editing existing configs ---------- */

const OLD_BAD = ["UX-21-01 CUSTOM", "惡魔冥界", "-", "-", "-", "-", "-", "3-60", "Z"];

// "shown" is the row as the page holds it after loading. Note (pre-existing,
// not part of 7-3a): the load path normalizes the model for display, so
// "UX-21-01 CUSTOM" is held as "UX-21 -01 CUSTOM"; edits keep that value.
async function openEdit(cells = OLD_BAD) {
  const opened = await openPage({ configTable: [cfg(cells, "-")] });
  const row = opened.page.configRows()[0];
  const shown = opened.page.configCells()[0];
  opened.page.openEditor(row);
  return { ...opened, row, shown };
}

test("edit: an existing violation kept as is asks first, then saves the same cells", async () => {
  const { mock, page, shown } = await openEdit();
  page.save();
  await page.settle();
  assert.deepEqual(page.effects.alerts, []);
  assert.equal(page.effects.confirms.length, 2);
  assert.match(page.effects.confirms[0], /這個配置原本就不符合官方組裝規則：惡魔冥界 是固鎖一體型上蓋，無法使用固鎖。/);
  assert.match(page.effects.confirms[1], /確定要保存這次配置修改嗎？/);
  assert.deepEqual(page.configCells(), [shown]);
  // Same cells as the page loaded them: D-018 finds nothing to write.
  assert.deepEqual(page.dirtyTables(), []);
  assert.deepEqual(mock.read(PATH).configTable, [{ cells: OLD_BAD, mainStockName: "-" }]);
});

test("edit: changing only the ratchet of the same broken rule asks, then saves", async () => {
  const { mock, page, shown } = await openEdit();
  page.build({ 固鎖: "4-60" });
  page.save();
  await page.settle();
  assert.deepEqual(page.effects.alerts, []);
  assert.equal(page.effects.confirms.length, 2);
  assert.deepEqual(mock.read(PATH).configTable[0].cells, [...shown.slice(0, 7), "4-60", "Z"]);
  assert.equal(mock.stats.commits, 1);
});

test("edit: cancelling either confirmation changes no row and calls no save", async () => {
  for (const answers of [[false], [true, false]]) {
    const { mock, page } = await openEdit();
    const before = snapshot(mock);
    const rowsBefore = page.configCells();
    page.build({ 固鎖: "4-60" });
    page.effects.confirmAnswers.push(...answers);
    page.save();
    await page.settle();
    assert.equal(page.effects.confirms.length, answers.length);
    assert.deepEqual(page.effects.alerts, []);
    assertUntouched(mock, page, before, rowsBefore);
    assert.equal(page.editorOpen(), true);
  }
});

test("edit: a new violation is blocked even when the number of violations stays the same", async () => {
  const cases = [
    // A second rule broken (Tr under an integrated blade).
    { cells: OLD_BAD, parts: { 軸心: "Tr" }, message: /不能使用 Tr／Op/ },
    // Same rule id and same count, but another blade: a new violation.
    { cells: OLD_BAD, parts: { 上蓋: "彈丸獅鷲" }, message: /彈丸獅鷲 是固鎖一體型上蓋，無法使用固鎖/ },
    // 時鐘幻象: same rule id and count, cause changes from the ratchet to a Tr bit.
    { cells: ["UX-16 CUSTOM", "時鐘幻象", "-", "-", "-", "-", "-", "9-60", "B"], parts: { 固鎖: "-", 軸心: "Tr" }, message: /時鐘幻象只能使用簡易固鎖/ },
    // A legal config edited into an illegal one.
    { cells: ["UX-16 CUSTOM", "時鐘幻象", "-", "-", "-", "-", "-", "9-65", "B"], parts: { 固鎖: "9-60" }, message: /時鐘幻象只能使用簡易固鎖/ }
  ];
  for (const item of cases) {
    const { mock, page } = await openEdit(item.cells);
    const before = snapshot(mock);
    const rowsBefore = page.configCells();
    if (item.parts.固鎖 === "-") {
      // "-" is offered once the integrated bit is chosen.
      page.build({ 軸心: item.parts.軸心 });
      page.build({ 固鎖: "-" });
    } else {
      page.build(item.parts);
    }
    page.save();
    await page.settle();
    assert.equal(page.effects.alerts.length, 1, JSON.stringify(item.parts));
    assert.match(page.effects.alerts[0], item.message);
    assert.deepEqual(page.effects.confirms, [], "blocked before any confirmation");
    assertUntouched(mock, page, before, rowsBefore);
  }
});

test("edit: fixing the violation saves normally with only the save confirmation", async () => {
  const { mock, page, shown } = await openEdit();
  page.build({ 固鎖: "-" });
  page.save();
  await page.settle();
  assert.deepEqual(page.effects.alerts, []);
  assert.deepEqual(page.effects.confirms, ["確定要保存這次配置修改嗎？"]);
  assert.deepEqual(mock.read(PATH).configTable[0].cells, [...shown.slice(0, 7), "-", "Z"]);
});

test("edit: the baseline is the stored row; a row that changed or left the table is not saved", async () => {
  // The editor values never replace the baseline: the form says 4-60 but the
  // stored row (3-60) is what the comparison uses, so the edit is allowed with a warning.
  {
    const { page, shown } = await openEdit();
    page.build({ 固鎖: "4-60" });
    page.effects.confirmAnswers.push(false);
    page.save();
    assert.match(page.effects.confirms[0], /原本就不符合官方組裝規則/);
    assert.deepEqual(page.configCells(), [shown], "the stored row still says 3-60");
  }
  // The row is removed while the editor is open.
  {
    const { mock, page, row } = await openEdit();
    const before = snapshot(mock);
    row.remove();
    page.save();
    await page.settle();
    assert.deepEqual(page.effects.alerts, ["這筆配置已經變更或不存在，請重新開啟後再修改。"]);
    assert.deepEqual(snapshot(mock), before);
    assert.equal(page.editorOpen(), false);
  }
  // The stored cells of the row change while the editor is open.
  {
    const { mock, page, row } = await openEdit();
    const before = snapshot(mock);
    row.cells[7].innerText = "4-60";
    page.save();
    await page.settle();
    assert.deepEqual(page.effects.alerts, ["這筆配置已經變更或不存在，請重新開啟後再修改。"]);
    assert.deepEqual(page.effects.confirms, []);
    assert.deepEqual(snapshot(mock), before);
  }
});

test("session: a stale write session (sign-out, account switch) closes the editor without writing", async () => {
  const { mock, page } = await openEdit();
  const before = snapshot(mock);
  // Another account takes over the page while the editor is open.
  page.page.setUser({ uid: "user-b", email: "b@example.test" });
  page.context.beginDataSession("user-b", false);
  page.build({ 固鎖: "-" });
  page.save();
  await page.settle();
  assert.equal(page.editorOpen(), false);
  assert.deepEqual(page.effects.confirms, []);
  assert.equal(mock.stats.transactions, before.transactions);
  assert.equal(mock.read(PATH).configTable[0].cells[7], "3-60");
  assert.equal(mock.read(userDocPath("user-b")), null, "nothing written to the other account");
});

test("a remote rebuild while the editor is open closes it (existing stale-row protection)", async () => {
  const { mock, page } = await openEdit();
  mock.externalMerge(PATH, { partTable: [...mock.read(PATH).partTable, { cells: ["軸心", "B", "1"] }], updatedAt: 2 });
  page.deliver();
  await page.settle();
  assert.equal(page.editorOpen(), false);
  assert.equal(page.page.editorRow, null);
  assert.match(page.effects.alerts.join("\n"), /偵測到較新的雲端資料，尚未儲存的編輯已取消/);
});

/* ---------- protection ---------- */

const script = fs.readFileSync("script.js", "utf8");
function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + 1);
  assert.ok(from >= 0 && to > from, start);
  return source.slice(from, to);
}

test("A-09 (7-3a): addConfig's cell writes and checkStock are byte-for-byte pinned", () => {
  const sha = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  const add = between(script, "window.addConfig = function", "/* ====== 登入狀態顯示");
  const cellWrites = between(add, "  const row = configEditorRow || tbody.insertRow();", "  modelInput.value = \"BX-CUSTOM\";");
  assert.equal(sha(cellWrites), "da046a3d56a07519", "addConfig cell writes (same as fa4e419)");
  assert.equal(sha(between(script, "function checkStock(", "/* ====== 第三區：新增配置紀錄")), "0bed51c10a056c87", "checkStock (same as fa4e419)");
  // The real save path calls the D-019 check with the blade; the old call is gone.
  assert.match(add, /fixSel = getNoRatchetFixValue\(model, axisSel, fixSel, layerSel\);\n\n  if \(!checkConfigAssemblyRules\(model, layerSel, fixSel, axisSel\)\) return;/);
  assert.doesNotMatch(add, /validateRatchetRules\(/);
});

/* ---------- config sort (unchanged in 7-3a; regression only) ---------- */
// The 7-3a "sort before save" change was withdrawn: it fixed addConfig and
// restoreHistoryRow but not loading unsorted cloud data (the screen was
// re-sorted 80 ms after the D-018 baseline). See
// design/phase7/verification/phase7-3a/README.md. D-023 (Phase 7-DC) sorts
// in applyDataToTables and collectCurrentData instead; the full checks are in
// tests/data-consistency.test.mjs.

const configOrder = page => page.configCells().map(cells => `${cells[0]}/${cells[1]}`);

test("sort: sorted cloud data stays clean 250 ms after loading and an unrelated save writes only its table", async () => {
  const { mock, page } = await openPage({ configTable: [
    cfg(["UX-21-01 CUSTOM", "惡魔冥界", "-", "-", "-", "-", "-", "-", "Z"], "-"),
    cfg(["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"], "-")
  ] });
  await page.wait(250);
  assert.deepEqual(page.dirtyTables(), []);
  assert.equal(mock.stats.transactions, 0);
  page.context.createPartRow(["軸心", "B", "1"]);
  page.context.saveData();
  await page.settle();
  assert.equal(mock.stats.commits, 1);
  const written = Object.keys(mock.commitLog.at(-1)[0].fields || mock.commitLog.at(-1)[0]);
  assert.ok(written.includes("partTable"));
  assert.ok(!written.includes("configTable"), "configTable is not rewritten");
});

test("sort: after the screen re-sorts, editing a config changes that config only", async () => {
  const { mock, page } = await openPage({ configTable: [cfg(["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"], "-")] });
  await buildNew(page, { 上蓋: "惡魔冥界", 軸心: "Z" });
  await page.wait(250);
  assert.deepEqual(configOrder(page), ["UX-21-01 CUSTOM/惡魔冥界", "BX-01 CUSTOM/蒼龍神劍"], "screen re-sorted UX before BX");
  const bxRow = page.configRows()[1];
  page.openEditor(bxRow);
  page.build({ 固鎖: "4-60" });
  page.save();
  await page.settle();
  assert.deepEqual(page.effects.alerts, []);
  const stored = mock.read(PATH).configTable.map(item => item.cells);
  assert.deepEqual(stored.find(cells => cells[1] === "蒼龍神劍"), ["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "4-60", "F"]);
  assert.deepEqual(stored.find(cells => cells[1] === "惡魔冥界"), ["UX-21-01 CUSTOM", "惡魔冥界", "-", "-", "-", "-", "-", "-", "Z"]);
  assert.equal(stored.length, 2);
});

// Phase 7-3a pinned the known issue here (dirtyTables() was ["configTable"]
// 250 ms after addConfig because only the order differed). D-023 removed it;
// the original reproduction stays in design/phase7/verification/phase7-3a/.
test("sort (D-023): addConfig leaves nothing unsaved, and a real config change still conflicts with another device's", async () => {
  const { mock, page } = await openPage({ configTable: [cfg(["BX-01 CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"], "-")] });
  await buildNew(page, { 上蓋: "惡魔冥界", 軸心: "Z" });
  await page.wait(250);
  assert.deepEqual(page.dirtyTables(), [], "the first write already had the sorted order");
  assert.equal(mock.stats.commits, 1);
  // Another device adds a config; this page edits a config before seeing it.
  const other = { cells: ["UX-16 CUSTOM", "時鐘幻象", "-", "-", "-", "-", "-", "9-65", "B"], mainStockName: "-" };
  mock.externalMerge(PATH, { configTable: [...mock.read(PATH).configTable, other], updatedAt: 99 });
  const commits = mock.stats.commits;
  page.openEditor(page.configRows()[1]);
  page.build({ 固鎖: "4-60" });
  page.save();
  await page.settle();
  assert.equal(mock.stats.commits, commits, "nothing written");
  assert.equal(page.page.sync.state, "conflict");
  assert.deepEqual(mock.read(PATH).configTable.at(-1), other, "the other device's config is kept");
  assert.equal(mock.read(PATH).configTable.find(item => item.cells[1] === "蒼龍神劍").cells[7], "3-60", "this page's edit did not overwrite the cloud");
});
