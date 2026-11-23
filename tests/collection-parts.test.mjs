// Phase 7-2b (P2 / U2 / S1 / D1). Runs the REAL getTotalParts / getUsedParts /
// addStock / isRandomBooster and the Phase 7-2b parts-model block of script.js
// in a VM (rows are plain objects shaped like table rows), and checks the
// per-row maps against the real totals, the K-7 golden values, the special
// structures, S1's reliable English names and the exact D1 confirmation text.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as view from "../collection-view.js";

const script = fs.readFileSync("script.js", "utf8").replace(/\r\n/g, "\n");
const between = (start, end) => {
  const a = script.indexOf(start), b = script.indexOf(end, a + 1);
  assert.ok(a >= 0 && b > a, `missing range ${start}`);
  return script.slice(a, b);
};
const code = [
  between("const partTypes = [", "function normalizeAllModelCells("),
  between("const RANDOM_BOOSTER_MODELS", "// Phase 7-R: the ratchet rules"),
  between("function getSeriesFromModel(", "function getConfigStructureModeFromRow("),
  between("function addStock(", "function escapeHtml("),
  between("function getTotalParts(", "function setUiSummaryValue("),
  between("function isExplicitStockAutoFilled(", "function getStoredItemExtras("),
  between("/* ===== Phase 7-2b parts model", "/* ===== Phase 7-2b parts model (P2 / U2 / D1, read-only): end")
].join("\n");

const cell = (text, stockName) => ({ innerText: text, dataset: stockName === undefined ? {} : { stockName } });
const makeRow = (cells, { stockName, dataset = {}, key } = {}) => ({
  cells: [...cells.map((text, index) => cell(text, index === 3 ? stockName : undefined)), cell("")],
  dataset: { ...dataset },
  __key: key
});

function load({ stock = [], parts = [], configs = [], products = new Map(), failReads = false }) {
  const tables = { beybladeTable: stock, partTable: parts, configTable: configs };
  const context = {
    console: { warn() {} },
    ...view,
    getCollectionViewKey: row => row.__key,
    getSourceRowButton: () => null,
    document: {
      querySelectorAll(selector) {
        if (failReads) throw new Error("read failed");
        const match = selector.match(/^#(\w+) tbody tr$/);
        return match ? tables[match[1]] || [] : [];
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(`let stockProductsByRecordId = new Map();\n${code}\nthis.api = { getTotalParts, getUsedParts, computeCollectionPartsModel, getReliableEnglishName,
    getStockDeleteImpactText, getPartDeleteImpactText, getPartEditImpactText, setProducts: map => { stockProductsByRecordId = map; } };`, context);
  context.api.setProducts(products);
  return context.api;
}
const plain = value => JSON.parse(JSON.stringify(value));
const flat = map => Object.fromEntries(Object.entries(plain(map)).flatMap(([type, names]) => Object.entries(names).map(([name, count]) => [`${type}|${name}`, count])));

const auto = (code, layer, fix, axis, extra = {}) => makeRow([code, layer, "-", "-", "-", "-", "-", fix, axis], { stockName: "-", dataset: { stockAutoFilled: "true", stockRecordId: code, stockProductCode: code, stockAssemblySystem: "STANDARD", ...extra } });

/* ---------- K-1 fixture: same rows as design/phase7/verification/k1-hidden-table (golden values) ---------- */
function k1Fixture() {
  return {
    stock: [
      auto("UX-01", "雙  空白", "1-60", "A"),
      auto("UX-02", "全形　空白", "3-70", "H"),
      auto("UX-03", "不斷行 空白", "3-80", "FB"),
      auto("UX-04", "定位\t字元", "9-60", "LR"),
      auto("UX-05", "換行字元", "5-60", "R"),
      auto("UX-06", "前後空白", "4-60", "T"),
      auto("BX-00", "歐比王肯諾比", "4-60", "P", { stockRecordId: "BX-00-01-01", stockSetId: "BX-00-01", stockSetInstanceId: "s1" }),
      auto("BX-00", "葛里維斯將軍", "3-80", "HN", { stockRecordId: "BX-00-01-02", stockSetId: "BX-00-01", stockSetInstanceId: "s1" }),
      auto("BX-01", "蒼龍神劍", "3-60", "F"),
      auto("BX-01", "蒼龍神劍", "3-60", "F"),
      auto("BX-01", "蒼龍神劍", "3-60", "F"),
      makeRow(["CX-01", "蒼龍勇  氣S", "蒼龍", "勇  氣", "-", "-", "S", "6-60", "V"], { stockName: "勇  氣", dataset: { stockAutoFilled: "true", stockRecordId: "CX-01", stockAssemblySystem: "CX_3P" } }),
      makeRow(["CX-03", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"], { stockName: "", dataset: { stockAutoFilled: "true", stockRecordId: "CX-03", stockAssemblySystem: "CX_4P" } }),
      makeRow(["CX-11", "-", "帝王", "威能", "-", "-", "-", "-", "Op"], { stockName: "威能" })
    ],
    parts: [
      makeRow(["固鎖", "3-60", "2"], { key: "p1" }),
      makeRow(["軸心", "雙 空白", "1"], { key: "p2" }),
      makeRow(["上蓋", "全形　空白", "1"], { key: "p3" }),
      makeRow(["軸心", "F", "1"], { key: "p4" }),
      makeRow(["軸心", "F", "3"], { key: "p5" })
    ],
    configs: [
      makeRow(["CX-CUSTOM", "紋章鎖金屬超越S", "紋章鎖", "超越/金屬", "超越", "金屬", "S", "4-55", "LO"], { stockName: "" }),
      makeRow(["BX-CUSTOM", "雙  空白", "-", "-", "-", "-", "-", "3-60", "F"], { stockName: "-" })
    ]
  };
}

// The former 使用中 formula, as an independent oracle (what updateUiSummaries computed up to 7-2a).
function legacyInventoryUsed(partRows, usedParts) {
  const byPart = new Map();
  let total = 0;
  partRows.forEach(row => {
    const [type, name, countText] = row.cells.slice(0, 3).map(c => c.innerText.trim());
    const count = Number(countText || 0);
    if (!type || !name || !Number.isFinite(count)) return;
    byPart.set(`${type}\u0000${name}`, (byPart.get(`${type}\u0000${name}`) || 0) + count);
    total += count;
  });
  let used = 0;
  byPart.forEach((count, key) => { const [type, name] = key.split("\u0000"); used += Math.min(count, usedParts[type]?.[name] || 0); });
  return { total, used, available: Math.max(0, total - used) };
}

test("P2: original + extra equals the real getTotalParts() for every part", () => {
  const api = load(k1Fixture());
  const model = api.computeCollectionPartsModel();
  const total = flat(api.getTotalParts());
  const shown = Object.fromEntries(model.items.filter(i => i.held > 0).map(i => [`${i.type}|${i.name}`, i.orig + i.extra]));
  assert.deepEqual(shown, total);
});

test("K7-01 / K7-06: the former 使用中 formula still gives the golden values recorded from the 7-2a code", () => {
  const fixture = k1Fixture();
  const api = load(fixture);
  // Golden values from the real pre-7-2b updateUiSummaries on this data (spec 10, P-5).
  assert.deepEqual(legacyInventoryUsed(fixture.parts, plain(api.getUsedParts())), { total: 8, used: 2, available: 6 });
  assert.equal(api.computeCollectionPartsModel().totals.extra, 8, "額外持有 equals the former inventoryTotal");
});

test("K7-02 / K7-03: 配置引用 is getUsedParts() without the CX combined blade name, and differs from the old 使用中", () => {
  const api = load(k1Fixture());
  const model = api.computeCollectionPartsModel();
  const used = flat(api.getUsedParts());
  assert.equal(used["上蓋|紋章鎖金屬超越S"], 1, "the real getUsedParts counts the CX combined name");
  const refs = Object.fromEntries(model.items.filter(i => i.ref > 0).map(i => [`${i.type}|${i.name}`, i.ref]));
  const expected = { ...used };
  delete expected["上蓋|紋章鎖金屬超越S"];
  assert.deepEqual(refs, expected);
  assert.equal(model.totals.refs, 9);
  assert.notEqual(model.totals.refs, 2, "not the former 使用中 value");
  assert.equal(model.items.some(i => i.name === "紋章鎖金屬超越S"), false);
});

test("K7-04 / K7-05: totals and unmatched references", () => {
  const fixture = k1Fixture();
  const api = load(fixture);
  const model = api.computeCollectionPartsModel();
  const totalHeld = Object.values(flat(api.getTotalParts())).reduce((sum, count) => sum + count, 0);
  assert.equal(totalHeld, 55, "real getTotalParts sum on this data");
  assert.deepEqual(plain(model.totals), { kinds: model.items.length, orig: 47, extra: 8, refs: 9, overused: 0, orphans: 0 });
  fixture.configs.push(makeRow(["UX-02 CUSTOM", "惡魔重錘", "-", "-", "-", "-", "-", "3-70", "LF"], { stockName: "-" }));
  const withOrphan = load(fixture).computeCollectionPartsModel();
  assert.deepEqual(plain(withOrphan.orphans).map(o => [o.type, o.name, o.ref, o.configs]), [["上蓋", "惡魔重錘", 1, ["惡魔重錘 3-70 LF"]], ["軸心", "LF", 1, ["惡魔重錘 3-70 LF"]]]);
  assert.equal(withOrphan.totals.orphans, 2);
});

test("P2 special structures: CX split, integrated ratchet, sets, random booster", () => {
  const fixture = k1Fixture();
  fixture.stock.push(makeRow(["CX-17", "抽包上蓋", "-", "-", "-", "-", "-", "3-60", "E"], { stockName: "-" }));
  fixture.configs.push(makeRow(["CX-17 CUSTOM", "抽包上蓋", "-", "-", "-", "-", "-", "3-60", "E"], { stockName: "-" }));
  const api = load(fixture);
  const model = api.computeCollectionPartsModel();
  const item = (type, name) => model.items.find(i => i.type === type && i.name === name);
  assert.equal(item("主要戰刃", "超越/金屬"), undefined, "CX split: the display value is not a part");
  assert.equal(item("超越戰刃", "超越").orig, 1);
  assert.equal(item("金屬戰刃", "金屬").orig, 1);
  assert.equal(item("主要戰刃", "勇  氣").orig, 1, "CX 3-part main blade from mainStockName");
  assert.equal(item("上蓋", "蒼龍勇  氣S"), undefined, "CX combined layer is never held");
  assert.equal(item("主要戰刃", "威能").orig, 1);
  assert.equal(item("軸心", "Op").orig, 1, "integrated-ratchet bit counts as a bit");
  assert.equal(model.items.some(i => i.type === "固鎖" && i.name === "-"), false, "no ratchet for CX-11");
  assert.equal(item("上蓋", "歐比王肯諾比").orig, 1);
  assert.equal(item("上蓋", "葛里維斯將軍").orig, 1, "each set member counts");
  assert.equal(item("上蓋", "抽包上蓋").orig, 1, "random booster CX layer is held");
  assert.equal(item("上蓋", "抽包上蓋").ref, 1, "and its config reference counts");
  assert.deepEqual(Object.fromEntries(model.items.filter(i => i.held > 0).map(i => [`${i.type}|${i.name}`, i.orig + i.extra])), flat(api.getTotalParts()));
});

test("P2: extra rows with the same name stay separate, each with its own key; uncounted rows stay visible", () => {
  const fixture = k1Fixture();
  fixture.parts.push(makeRow(["軸心", "B", "0"], { key: "p6" }));
  const model = load(fixture).computeCollectionPartsModel();
  const f = model.items.find(i => i.type === "軸心" && i.name === "F");
  assert.equal(f.extra, 4);
  assert.equal(f.orig, 3);
  assert.deepEqual(f.extraRows.map(r => [r.key, r.countText]), [["p4", "1"], ["p5", "3"]]);
  const zero = model.items.find(i => i.type === "軸心" && i.name === "B");
  assert.deepEqual([zero.extra, zero.held, zero.extraRows.map(r => r.key)], [0, 0, ["p6"]], "a zero-count row is not counted but can still be fixed");
});

/* ---------- S1 ---------- */

test("S1: English names only through an explicit auto-fill marker and a recordId the catalog knows", () => {
  const products = new Map([["UX-01", { displayNameEn: "DranBuster" }], ["BX-00-01-01", { displayNameEn: "Obi-Wan Kenobi" }]]);
  const api = load({ products });
  assert.equal(api.getReliableEnglishName({ stockAutoFilled: "true", stockRecordId: "UX-01" }), "DranBuster");
  assert.equal(api.getReliableEnglishName({ stockAutoFilled: "true", stockRecordId: " BX-00-01-01 " }), "Obi-Wan Kenobi");
  assert.equal(api.getReliableEnglishName({ stockRecordId: "UX-01" }), "", "manual row (no marker)");
  assert.equal(api.getReliableEnglishName({ stockAutoFilled: false, stockRecordId: "UX-01" }), "", "falsy marker");
  assert.equal(api.getReliableEnglishName({ stockAutoFilled: "true" }), "", "no recordId");
  assert.equal(api.getReliableEnglishName({ stockAutoFilled: "true", stockRecordId: "UX-99" }), "", "unknown recordId is not guessed");
  assert.equal(load({}).getReliableEnglishName({ stockAutoFilled: "true", stockRecordId: "UX-01" }), "", "catalog not loaded");
});

test("S1: search covers model, name, parts, reliable English name and set codes", () => {
  const items = [
    { key: "a", model: "UX-01", title: "蒼龍爆刃", parts: [{ value: "1-60" }, { value: "A" }], englishName: "DranBuster" },
    { key: "b", model: "BX-00", title: "歐比王肯諾比", parts: [{ value: "4-60" }], setCode: "BX-00-01", productCode: "BX-00" },
    { key: "c", model: "BX-04", title: "騎士重盾", parts: [{ value: "N" }], englishName: "" }
  ];
  const keys = query => view.filterStockItems(items, query).map(i => i.key);
  assert.deepEqual(keys("dran"), ["a"]);
  assert.deepEqual(keys("  蒼龍 "), ["a"]);
  assert.deepEqual(keys("bx-00-01"), ["b"]);
  assert.deepEqual(keys("4-60"), ["b"]);
  assert.deepEqual(keys("knight"), [], "no English name without a reliable mapping");
  assert.deepEqual(keys(""), ["a", "b", "c"]);
});

/* ---------- D1 ---------- */

function d1Fixture() {
  return {
    stock: [
      auto("BX-01", "蒼龍神劍", "3-60", "F"),
      auto("BX-01", "蒼龍神劍", "3-60", "F"),
      auto("BX-00", "歐比王肯諾比", "4-60", "P", { stockSetId: "BX-00-01", stockSetInstanceId: "s1" }),
      auto("BX-00", "葛里維斯將軍", "3-80", "HN", { stockSetId: "BX-00-01", stockSetInstanceId: "s1" })
    ],
    parts: [
      makeRow(["固鎖", "3-60", "2"], { key: "p1" }),
      makeRow(["軸心", "R", "1"], { key: "p2" }),
      makeRow(["軸心", "F", "1"], { key: "p3" })
    ],
    configs: [
      makeRow(["BX-CUSTOM", "蒼龍神劍", "-", "-", "-", "-", "-", "3-60", "F"], { stockName: "-" }),
      makeRow(["BX-CUSTOM", "惡魔重錘", "-", "-", "-", "-", "-", "3-60", "H"], { stockName: "-" }),
      makeRow(["BX-CUSTOM", "魔導幻箭", "-", "-", "-", "-", "-", "3-60", "R"], { stockName: "-" }),
      makeRow(["BX-CUSTOM", "騎士重盾", "-", "-", "-", "-", "-", "3-60", "R"], { stockName: "-" }),
      makeRow(["BX-CUSTOM", "葛里維斯將軍", "-", "-", "-", "-", "-", "3-80", "HN"], { stockName: "-" })
    ]
  };
}
const editingButton = (row, { type, name, count }) => {
  row.dataset.editing = "true";
  row.dataset.originalCells = JSON.stringify(row.cells.slice(0, -1).map(c => c.innerText));
  row.cells[0].querySelector = () => ({ value: type });
  row.cells[1].querySelector = selector => (selector === "input" ? { value: name } : null);
  row.cells[2].querySelector = selector => (selector === "input" ? { value: count } : null);
  return { parentElement: { parentElement: row } };
};

test("D1-1: deleting one collection item lists the parts that become short", () => {
  const fixture = d1Fixture();
  const api = load(fixture);
  assert.equal(api.getStockDeleteImpactText([fixture.stock[0]]),
    "\n刪除後，下列零件會不夠配置使用：\n・固鎖 3-60：持有 3，配置引用 4（蒼龍神劍 3-60 F、惡魔重錘 3-60 H、魔導幻箭 3-60 R 等 4 個）\n配置不會被修改。");
});

test("D1-2: deleting a set uses the whole set", () => {
  const fixture = d1Fixture();
  const api = load(fixture);
  assert.equal(api.getStockDeleteImpactText(fixture.stock.slice(2), "整組刪除後"),
    "\n整組刪除後，下列零件會不夠配置使用：\n・上蓋 葛里維斯將軍：持有 0，配置引用 1（葛里維斯將軍 3-80 HN）\n・固鎖 3-80：持有 0，配置引用 1（葛里維斯將軍 3-80 HN）\n・軸心 HN：持有 0，配置引用 1（葛里維斯將軍 3-80 HN）\n配置不會被修改。");
});

test("D1-3: deleting an extra part; a part that was already short gets its own line; no impact gives no text", () => {
  const fixture = d1Fixture();
  const api = load(fixture);
  assert.equal(api.getPartDeleteImpactText(fixture.parts[0]),
    "\n刪除後，下列零件會不夠配置使用：\n・固鎖 3-60：持有 2，配置引用 4（蒼龍神劍 3-60 F、惡魔重錘 3-60 H、魔導幻箭 3-60 R 等 4 個）\n配置不會被修改。");
  assert.equal(api.getPartDeleteImpactText(fixture.parts[1]),
    "\n軸心 R 原本就不夠配置使用（持有 1，配置引用 2），變更後會更不足。\n配置不會被修改。");
  assert.equal(api.getPartDeleteImpactText(fixture.parts[2]), "", "軸心 F has no shortage");
});

test("D1-4: reducing an extra quantity", () => {
  const fixture = d1Fixture();
  const api = load(fixture);
  assert.equal(api.getPartEditImpactText(editingButton(fixture.parts[0], { type: "固鎖", name: "3-60", count: "1" })),
    "\n數量減少後，下列零件會不夠配置使用：\n・固鎖 3-60：持有 3，配置引用 4（蒼龍神劍 3-60 F、惡魔重錘 3-60 H、魔導幻箭 3-60 R 等 4 個）\n配置不會被修改。");
  const more = d1Fixture();
  assert.equal(load(more).getPartEditImpactText(editingButton(more.parts[0], { type: "固鎖", name: "3-60", count: "5" })), "", "an increase has no impact");
});

test("D1-5: renaming a part: configurations still using the old name are reported as unmatched", () => {
  const fixture = d1Fixture();
  const api = load(fixture);
  assert.equal(api.getPartEditImpactText(editingButton(fixture.parts[1], { type: "軸心", name: "R2", count: "1" })),
    "\n改名後，下列配置仍使用舊名稱「R」，將找不到對應零件：\n・軸心 R：魔導幻箭 3-60 R、騎士重盾 3-60 R\n配置不會自動改名。");
  const shared = d1Fixture();
  assert.equal(load(shared).getPartEditImpactText(editingButton(shared.parts[0], { type: "固鎖", name: "3-60X", count: "2" })),
    "\n變更後，下列零件會不夠配置使用：\n・固鎖 3-60：持有 2，配置引用 4（蒼龍神劍 3-60 F、惡魔重錘 3-60 H、魔導幻箭 3-60 R 等 4 個）\n配置不會被修改。",
    "the old name is still held by the collection: shortage, not unmatched");
  const invalid = d1Fixture();
  assert.equal(load(invalid).getPartEditImpactText(editingButton(invalid.parts[0], { type: "固鎖", name: "  ", count: "2" })), "", "empty name: saveEditRow's own check handles it");
});

test("D1: a failure while computing the hint returns no text instead of breaking the confirmation", () => {
  const fixture = d1Fixture();
  const api = load({ ...fixture, failReads: true });
  assert.equal(api.getStockDeleteImpactText([fixture.stock[0]]), "");
  assert.equal(api.getPartDeleteImpactText(fixture.parts[0]), "");
});

test("D1 wiring: only the confirm() strings changed; the cancel path returns before any change", () => {
  const del = between("window.deleteRow = async function", "/* ====== 表格內修改功能");
  assert.match(del, /const ok = confirm\(`「\$\{setCode\}」是雙陀螺套組。確定要一起刪除「\$\{names\}」嗎？` \+ \(typeof getStockDeleteImpactText === "function" \? getStockDeleteImpactText\(setRows, "整組刪除後"\) : ""\)\);\n      if \(!ok\) return;\n\n      setRows\.forEach\(candidate => candidate\.remove\(\)\);/);
  assert.match(del, /const ok = confirm\(`確定要刪除「\$\{deleteName\}」嗎？` \+ \(typeof getStockDeleteImpactText === "function" \? getStockDeleteImpactText\(\[row\]\) : ""\)\);\n    if \(!ok\) return;/);
  assert.match(del, /const ok = confirm\(`確定要刪除「\$\{deleteName\}」嗎？` \+ \(typeof getPartDeleteImpactText === "function" \? getPartDeleteImpactText\(row\) : ""\)\);\n    if \(!ok\) return;/);
  assert.match(del, /if \(!dataSessionGuard\.isWriteSessionCurrent\(operationSession\) \|\| !row\.isConnected\) return;\n  row\.remove\(\);/);
  const save = between("window.saveEditRow = function", "window.cancelEditRow = function");
  assert.match(save, /const ok = confirm\("確定要保存這次修改嗎？" \+ \(tableType === "part" && typeof getPartEditImpactText === "function" \? getPartEditImpactText\(button\) : ""\)\);\n\n  if \(!ok\) return;\n\n  const row = button\.parentElement\.parentElement;/);
  const block = between("/* ===== Phase 7-2b parts model", "/* ===== Phase 7-2b parts model (P2 / U2 / D1, read-only): end");
  assert.doesNotMatch(block, /saveData\(|runTransaction|setDoc|\.innerText\s*=|dataset\.\w+\s*=(?!=)|\.remove\(\)|insertRow|deleteRow\(/);
});

test("P2: a count that is not a finite number is shown for fixing but never counted (no NaN in cards or summary)", () => {
  for (const bad of ["abc", "NaN", "Infinity", "-Infinity"]) {
    const fixture = k1Fixture();
    fixture.parts.push(makeRow(["軸心", "壞數量", bad], { key: "bad" }));
    fixture.parts.push(makeRow(["固鎖", "3-60", bad], { key: "bad2" }));
    const api = load(fixture);
    const model = api.computeCollectionPartsModel();
    const broken = model.items.find(i => i.type === "軸心" && i.name === "壞數量");
    assert.deepEqual([broken.extra, broken.held, broken.extraRows.map(r => r.key)], [0, 0, ["bad"]], bad);
    assert.equal(Object.keys(plain(broken.extraRows[0].counts)).some(type => Object.keys(plain(broken.extraRows[0].counts)[type]).length), false, `${bad}: shown as 未計入`);
    const p360 = model.items.find(i => i.type === "固鎖" && i.name === "3-60");
    assert.deepEqual([p360.extra, p360.extraRows.length], [2, 2], `${bad}: the valid 3-60 row still counts, the bad one is listed`);
    assert.ok(Object.values(plain(model.totals)).every(Number.isFinite), `${bad}: totals stay finite`);
    // Documented difference: the real getTotalParts turns such a count into NaN／Infinity for that
    // part; every part without such a row still matches getTotalParts exactly.
    const total = flat(api.getTotalParts());
    // "-Infinity" is already skipped by addStock (count <= 0); the others make getTotalParts non-finite.
    assert.equal(Number.isFinite(total["固鎖|3-60"]), bad === "-Infinity", `${bad}: getTotalParts for 3-60`);
    if (bad === "-Infinity") assert.equal(total["固鎖|3-60"], p360.held, "-Infinity: same as getTotalParts");
    const valid = Object.fromEntries(Object.entries(total).filter(([key]) => key !== "固鎖|3-60" && key !== "軸心|壞數量"));
    const shown = Object.fromEntries(model.items.filter(i => i.held > 0 && i.key !== p360.key).map(i => [`${i.type}|${i.name}`, i.held]));
    assert.deepEqual(shown, valid);
    assert.equal(api.getPartDeleteImpactText(fixture.parts.at(-1)), "", `${bad}: deleting the uncounted row changes no holding`);
  }
});
