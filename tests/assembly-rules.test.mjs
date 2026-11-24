// Phase 7-R: official assembly rules (assembly-rules.js) and the script.js
// paths that use them. Sources: design/phase7/01-beyblade-x-assembly-rules.md.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as rules from "../assembly-rules.js";

const { evaluateAssembly, newAssemblyViolations } = rules;
const ids = result => result.violations.map(item => item.id);
const catalog = JSON.parse(fs.readFileSync("stock_products_AUTOFILL_SAFE_2026-07-29-v3.json", "utf8")).stockProducts;
const script = fs.readFileSync("script.js", "utf8");

test("R1: integrated-ratchet blades have no ratchet slot, decided by blade name", () => {
  for (const layer of ["彈丸獅鷲", "榮耀戰神", "惡魔冥界"]) {
    const result = evaluateAssembly({ model: "UX-21-01 CUSTOM", layer, fix: "-", axis: "Z" });
    assert.equal(result.noRatchet, true, layer);
    assert.deepEqual(ids(result), [], layer);
    assert.deepEqual(ids(evaluateAssembly({ layer, fix: "3-60", axis: "H" })), ["integrated-blade-ratchet"], layer);
  }
  // The other two beys of the UX-21 set share the model code but keep their ratchet.
  for (const layer of ["霜輝銀狼", "飛龍旋翼"]) {
    const result = evaluateAssembly({ model: "UX-21-02 CUSTOM", layer, fix: "9-70", axis: "R" });
    assert.equal(result.noRatchet, false, layer);
    assert.deepEqual(ids(result), [], layer);
  }
  // Legacy model rule for UX-19 / UX-20 still applies when the blade text differs.
  assert.equal(evaluateAssembly({ model: "UX-19 CUSTOM", layer: "", axis: "H" }).noRatchet, true);
  assert.deepEqual(ids(evaluateAssembly({ model: "UX-20 CUSTOM", fix: "9-60", axis: "LF" })), ["integrated-blade-ratchet"]);
});

test("R2: integrated-ratchet blades cannot take a ratchet-integrated bit", () => {
  for (const axis of ["Tr", "Op", "op", "TR"]) {
    assert.deepEqual(ids(evaluateAssembly({ layer: "榮耀戰神", fix: "-", axis })), ["integrated-blade-integrated-bit"], axis);
  }
});

test("R3: Tr and Op are ratchet-integrated bits", () => {
  for (const axis of ["Tr", "Op", "ｏｐ", " Op "]) {
    const result = evaluateAssembly({ model: "CX-CUSTOM", layer: "", fix: "-", axis });
    assert.equal(result.noRatchet, true, axis);
    assert.deepEqual(ids(result), [], axis);
    assert.deepEqual(ids(evaluateAssembly({ model: "CX-CUSTOM", fix: "3-60", axis })), ["integrated-bit-ratchet"], axis);
  }
  // Official: they may sit under BX/UX blades.
  assert.deepEqual(ids(evaluateAssembly({ model: "BX-02 CUSTOM", layer: "地獄鐮刀", fix: "-", axis: "Op" })), []);
  // Plain bits that merely start with O or T are not integrated.
  for (const axis of ["O", "T", "TP", "LO", "OF"]) assert.equal(evaluateAssembly({ axis }).noRatchet, false, axis);
  assert.match(evaluateAssembly({ fix: "3-60", axis: "Tr" }).violations[0].message, /Tr 軸無法使用固鎖/);
});

test("R4: 時鐘幻象 only takes official simple ratchets and no integrated bit", () => {
  for (const fix of ["3-85", "4-55", "M-85", "9-65", "7-55", "M-65", "m-85", "９-６５", "M－85"]) {
    assert.deepEqual(ids(evaluateAssembly({ model: "UX-16 CUSTOM", layer: "時鐘幻象", fix, axis: "B" })), [], fix);
  }
  for (const fix of ["9-60", "6-60", "5-70", "1-50", "-", ""]) {
    assert.deepEqual(ids(evaluateAssembly({ layer: "時鐘幻象", fix, axis: "B" })), ["simple-ratchet-only"], fix);
  }
  assert.ok(ids(evaluateAssembly({ layer: "時鐘幻象", fix: "-", axis: "Tr" })).includes("simple-ratchet-only"));
  // Legacy model match (UX-16) still applies.
  assert.deepEqual(ids(evaluateAssembly({ model: "UX-16 CUSTOM", fix: "9-60", axis: "B" })), ["simple-ratchet-only"]);
  // A height ending in 5 is not enough: only the official list counts.
  assert.equal(rules.isSimpleRatchet("2-75"), false);
  assert.match(evaluateAssembly({ layer: "時鐘幻象", fix: "9-60", axis: "B" }).violations[0].message, /時鐘幻象只能使用簡易固鎖/);
});

test("rules that are not active: G × エクリプス and integrated bits under CX 4-piece blades", () => {
  assert.deepEqual(ids(evaluateAssembly({ model: "CX-CUSTOM", layer: "焰神滅世G", fix: "5-70", axis: "TK" })), []);
  assert.deepEqual(ids(evaluateAssembly({ model: "CX-CUSTOM", layer: "龍王B閃擊K", fix: "-", axis: "Tr" })), []);
});

test("newAssemblyViolations only reports violations a change adds", () => {
  const before = evaluateAssembly({ layer: "惡魔冥界", fix: "3-60", axis: "Z" });
  const sameProblem = evaluateAssembly({ layer: "惡魔冥界", fix: "4-60", axis: "Z" });
  const worse = evaluateAssembly({ layer: "惡魔冥界", fix: "4-60", axis: "Tr" });
  assert.deepEqual(newAssemblyViolations(before, sameProblem), []);
  assert.deepEqual(newAssemblyViolations(before, worse).map(item => item.id), ["integrated-blade-integrated-bit"]);
  assert.deepEqual(newAssemblyViolations(null, before).map(item => item.id), ["integrated-blade-ratchet"]);
});

test("rule lists agree with the user-confirmed catalog, and every official product is legal", () => {
  const integratedBlades = new Set(catalog.filter(p => p.ratchetMode === "integrated_blade_ratchet").map(p => p.parts.blade));
  assert.deepEqual([...integratedBlades].sort(), [...rules.INTEGRATED_RATCHET_BLADES].sort());
  const integratedBits = new Set(catalog.filter(p => p.integratedRatchetBit).map(p => p.integratedRatchetBit));
  for (const bit of integratedBits) assert.ok(rules.INTEGRATED_RATCHET_BITS.includes(bit), bit);
  for (const p of catalog.filter(item => /^UX-16/.test(item.recordId))) assert.equal(p.parts.blade, "時鐘幻象");

  for (const p of catalog) {
    const result = evaluateAssembly({
      model: p.productCode,
      layer: p.parts.blade || "",
      fix: p.parts.ratchet || "-",
      axis: p.parts.bit || p.integratedRatchetBit || ""
    });
    assert.deepEqual(ids(result), [], `${p.recordId} ${p.displayNameZh}`);
    if (p.ratchetMode !== "standard") assert.equal(result.noRatchet, true, p.recordId);
  }
});

/* ---------- script.js paths (real code in a VM) ---------- */

function loadRuleSection(extra = {}) {
  const start = script.indexOf("function normalizeModel(model)");
  const end = script.indexOf("function getSeriesFromModel(model)");
  assert.ok(start >= 0 && end > start);
  const effects = { alerts: [], confirms: [], confirmAnswer: true };
  const context = {
    ...rules,
    isOfficialSimpleRatchet: rules.isSimpleRatchet,
    configEditorRow: null,
    alert: message => effects.alerts.push(String(message)),
    confirm: message => { effects.confirms.push(String(message)); return effects.confirmAnswer; },
    ...extra
  };
  vm.createContext(context);
  vm.runInContext(`${script.slice(start, end)}\nthis.api = { checkConfigAssemblyRules, getNoRatchetFixValue, validateRatchetRules, shouldUseNoRatchet };`, context);
  return { api: context.api, context, effects };
}

const row = cells => ({ cells: cells.map(text => ({ innerText: text })) });

test("addConfig rule check: new configs are blocked; edits are blocked only by new violations", () => {
  const { api, context, effects } = loadRuleSection();
  // New config.
  assert.equal(api.checkConfigAssemblyRules("UX-21-01 CUSTOM", "惡魔冥界", "3-60", "Z"), false);
  assert.match(effects.alerts.at(-1), /惡魔冥界 是固鎖一體型上蓋，無法使用固鎖/);
  assert.equal(api.checkConfigAssemblyRules("UX-21-01 CUSTOM", "惡魔冥界", "-", "Z"), true);
  assert.equal(api.getNoRatchetFixValue("UX-21-01 CUSTOM", "Z", "", "惡魔冥界"), "-");
  assert.equal(api.getNoRatchetFixValue("UX-21-02 CUSTOM", "R", "", "霜輝銀狼"), "");
  assert.equal(api.getNoRatchetFixValue("CX-CUSTOM", "Op", "", ""), "-");

  // Editing an existing config that already broke a rule: warn, then allow.
  context.configEditorRow = row(["UX-21-01 CUSTOM", "惡魔冥界", "-", "-", "-", "-", "-", "3-60", "Z"]);
  effects.alerts.length = 0;
  assert.equal(api.checkConfigAssemblyRules("UX-21-01 CUSTOM", "惡魔冥界", "4-60", "Z"), true);
  assert.equal(effects.confirms.length, 1);
  assert.match(effects.confirms[0], /原本就不符合官方組裝規則/);
  effects.confirmAnswer = false;
  assert.equal(api.checkConfigAssemblyRules("UX-21-01 CUSTOM", "惡魔冥界", "4-60", "Z"), false, "cancel keeps the old config");
  assert.deepEqual(effects.alerts, []);

  // An edit that adds a new violation is blocked.
  effects.confirmAnswer = true;
  assert.equal(api.checkConfigAssemblyRules("UX-21-01 CUSTOM", "惡魔冥界", "4-60", "Tr"), false);
  assert.match(effects.alerts.at(-1), /不能使用 Tr／Op/);

  // Editing a legal config into an illegal one is blocked.
  context.configEditorRow = row(["UX-16 CUSTOM", "時鐘幻象", "-", "-", "-", "-", "-", "9-65", "B"]);
  assert.equal(api.checkConfigAssemblyRules("UX-16 CUSTOM", "時鐘幻象", "9-60", "B"), false);
  assert.match(effects.alerts.at(-1), /時鐘幻象只能使用簡易固鎖/);
});

test("config editor offers 無固鎖 for integrated blades and bits, by blade name", () => {
  const start = script.indexOf("function updateNoRatchetConfigOption()");
  const end = script.indexOf("function setConfigEditorMode(");
  assert.ok(start >= 0 && end > start);
  function makeSelect(value) {
    const select = { value, children: [], options: [] };
    select.querySelector = () => select.children.find(option => option.value === "-") || null;
    select.insertBefore = option => { option.remove = () => { select.children = select.children.filter(item => item !== option); }; select.children.push(option); };
    return select;
  }
  function run({ model, layer, axis, fix = "" }) {
    const elements = {
      confModel: { value: model },
      sel上蓋: makeSelect(layer),
      sel固鎖: makeSelect(fix),
      sel軸心: makeSelect(axis)
    };
    const { context } = loadRuleSection({
      selectorMap: { "上蓋": "sel上蓋", "固鎖": "sel固鎖", "軸心": "sel軸心" },
      document: { getElementById: id => elements[id] || null, createElement: () => ({}) }
    });
    vm.runInContext(`${script.slice(start, end)}\nupdateNoRatchetConfigOption();`, context);
    return elements.sel固鎖;
  }
  assert.equal(run({ model: "UX-21-01 CUSTOM", layer: "惡魔冥界", axis: "Z" }).value, "-");
  assert.equal(run({ model: "", layer: "地獄鐮刀", axis: "Op" }).value, "-");
  assert.equal(run({ model: "UX-21-02 CUSTOM", layer: "霜輝銀狼", axis: "R" }).children.length, 0);
});

test("script.js loads the rules module with a cache version and keeps no model-only rule list", () => {
  assert.match(script, /from "\.\/assembly-rules\.js\?v=20261123-phase7r";/);
  assert.doesNotMatch(script, /NO_RATCHET_MODELS/);
  assert.doesNotMatch(script, /codeMatch\[1\]\.endsWith\("5"\)/);
  assert.match(fs.readFileSync("index.html", "utf8"), /src="script\.js\?v=20261125-v1181"/);
});
