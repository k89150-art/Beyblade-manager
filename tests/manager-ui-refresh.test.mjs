import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("script.js", "utf8");
const styles = fs.readFileSync("style.css", "utf8");

test("configuration model stays internal and is no longer user input", () => {
  assert.match(html, /<input type="hidden" id="confModel" value="BX-CUSTOM">/);
  assert.doesNotMatch(html, /<span>型號<\/span>\s*<input[^>]+id="confModel"/);
  assert.doesNotMatch(script, /window\.addConfig[\s\S]*?請輸入陀螺型號！[\s\S]*?\/\* ====== 登入狀態顯示/);
  assert.match(script, /buildInternalConfigModel\(configEditorMode, layerSel, existingModel\)/);
});

test("configuration editing reuses Quick Editor without consuming its own stock", () => {
  assert.match(script, /if \(tableType === "config"\) \{\s*openConfigQuickEditor\(row\);\s*return;/);
  assert.match(script, /openConfigEditorBtn\.addEventListener\("click", \(\) => openConfigQuickEditor\(\)\)/);
  assert.match(script, /refreshSelectors\(editingRow\)/);
  assert.match(script, /configEditorRow \? getUsedPartsExceptRow\(configEditorRow\) : getUsedParts\(\)/);
});

test("configuration actions are hidden behind one accessible menu", () => {
  assert.match(script, /class="config-action-trigger"/);
  assert.match(script, /aria-haspopup="menu"/);
  assert.match(script, /class="config-action-panel" role="menu" hidden/);
  assert.match(script, /runConfigCardAction\(event, this, 'edit'\)/);
  assert.match(script, /runConfigCardAction\(event, this, 'delete'\)/);
  assert.match(script, /const row = button\.closest\("tr"\)/);
  assert.match(styles, /#configTable \.config-action-panel\[hidden\]/);
  assert.match(styles, /body\.manager-page\.config-action-menu-open::after/);
});

test("configuration cards show real parts without repeated type tags", () => {
  assert.doesNotMatch(script, /tagList\.className = "record-card-tags config-card-tags"/);
  assert.match(script, /querySelector\("\.config-card-tags, \.config-card-groups"\)\?\.remove\(\)/);
  assert.match(script, /className = "config-card-compact-content"/);
  assert.match(styles, /#configTable \.config-card-compact-content \{[\s\S]*?width: calc\(100% - 48px\);[\s\S]*?flex-wrap: wrap;/);
  assert.match(styles, /#configTable \.config-card-summary \{[\s\S]*?white-space: nowrap;/);
});

test("inventory search and category filters are wired", () => {
  assert.match(html, /id="inventorySearchInput"/);
  assert.match(html, /data-inventory-filter="CX分件"/);
  assert.doesNotMatch(html, /data-inventory-filter="戰刃"/);
  assert.match(script, /if \(filter === "CX分件"\) \{\s*return \["紋章鎖", "主要戰刃", "超越戰刃", "金屬戰刃", "輔助戰刃"\]\.includes\(type\);/);
  assert.doesNotMatch(script, /if \(filter === "戰刃"\)/);
  assert.match(script, /function applyInventoryFilters\(\)/);
  assert.match(script, /inventorySearchInput\.addEventListener\("input", applyInventoryFilters\)/);
  assert.match(styles, /#partTable tbody tr \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\) auto auto;[\s\S]*?gap: 7px;/);
});

test("CX inventory filter groups every CX component without changing part types", () => {
  const start = script.indexOf("function inventoryTypeMatchesFilter(type, filter)");
  const end = script.indexOf("function applyInventoryFilters()", start);
  assert.ok(start >= 0 && end > start);

  const context = {};
  vm.runInNewContext(
    `${script.slice(start, end)}\nthis.matchesInventoryType = inventoryTypeMatchesFilter;`,
    context
  );

  for (const type of ["紋章鎖", "主要戰刃", "超越戰刃", "金屬戰刃", "輔助戰刃"]) {
    assert.equal(context.matchesInventoryType(type, "CX分件"), true);
  }

  for (const type of ["上蓋", "固鎖", "軸心"]) {
    assert.equal(context.matchesInventoryType(type, "CX分件"), false);
  }
});

test("configuration part summary stays readable without changing compact wrapping", () => {
  assert.match(styles, /#configTable \.config-card-summary \{[\s\S]*?color: #cbd7e0;[\s\S]*?font-size: 13px;[\s\S]*?font-weight: 650;[\s\S]*?white-space: nowrap;/);
});

test("soft-dark refresh remains scoped to manager sections", () => {
  assert.match(html, /<body class="manager-page">/);
  assert.match(styles, /\.manager-page #collectionSection,[\s\S]*\.manager-page #configQuickEditor/);
  assert.doesNotMatch(styles, /#competitionStatsSection[\s\S]{0,120}--manager-surface/);
});

test("internal compatibility model keeps special ratchet protections", () => {
  const start = script.indexOf("function normalizeModel(model)");
  const end = script.indexOf("function getSeriesFromModel(model)");
  assert.ok(start >= 0 && end > start);

  const alerts = [];
  const context = { alert: message => alerts.push(message) };
  vm.runInNewContext(`${script.slice(start, end)}\nthis.ruleApi = { getBaseModelCode, validateRatchetRules };`, context);

  assert.equal(context.ruleApi.getBaseModelCode("UX-19 CUSTOM"), "UX-19");
  assert.equal(context.ruleApi.validateRatchetRules("UX-19 CUSTOM", "H", "9-60"), false);
  assert.equal(context.ruleApi.validateRatchetRules("UX-20 CUSTOM", "LF", "-"), true);
  assert.equal(context.ruleApi.validateRatchetRules("UX-16 CUSTOM", "B", "9-60"), false);
  assert.equal(context.ruleApi.validateRatchetRules("UX-16 CUSTOM", "B", "9-65"), true);
  assert.equal(context.ruleApi.validateRatchetRules("CX-CUSTOM", "Tr", "3-60"), false);
  assert.ok(alerts.some(message => message.includes("時鐘幻象只能使用簡易固鎖")));
  assert.ok(alerts.some(message => message.includes("Tr 軸無法使用固鎖")));
});
