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
  assert.doesNotMatch(script, /<span class="config-card-series"><\/span>/);
  assert.match(styles, /#configTable \.config-card-compact-content \{[\s\S]*?width: calc\(100% - 48px\);[\s\S]*?flex-wrap: wrap;/);
  assert.match(styles, /#configTable \.config-card-summary \{[\s\S]*?white-space: nowrap;/);
});

test("collection cards show typed original parts in a stable BX UX and CX order", () => {
  const start = script.indexOf("function inventoryTypeMatchesFilter(type, filter)");
  const end = script.indexOf("function applyInventoryFilters()", start);
  assert.ok(start >= 0 && end > start);

  const context = {};
  vm.runInNewContext(
    `${script.slice(start, end)}\nthis.getCollectionParts = getCollectionCardParts;`,
    context
  );

  const bxux = context.getCollectionParts("UX", {
    layer: "魔導神杖", lock: "-", main: "-", transcend: "-", metal: "-", aux: "-", fix: "5-70", axis: "DB"
  });
  assert.equal(JSON.stringify(bxux.map(part => [part.type, part.value])), JSON.stringify([
    ["上蓋", "魔導神杖"], ["固鎖", "5-70"], ["軸心", "DB"]
  ]));

  const cx = context.getCollectionParts("CX", {
    layer: "騎士堡壘GV", lock: "騎士", main: "G/堡壘", transcend: "G", metal: "堡壘", aux: "V", fix: "8-70", axis: "UN"
  });
  assert.equal(JSON.stringify(cx.map(part => [part.type, part.value])), JSON.stringify([
    ["紋章鎖", "騎士"], ["金屬戰刃", "堡壘"], ["超越戰刃", "G"], ["輔助戰刃", "V"], ["固鎖", "8-70"], ["軸心", "UN"]
  ]));
  assert.match(script, /class="collection-part-badge" data-part-tone=/);
  assert.match(script, /class="collection-part-group" data-collection-group=/);
  assert.match(script, /core: new Set\(\["紋章鎖", "主要戰刃", "金屬戰刃"\]\)/);
  assert.match(script, /blades: new Set\(\["超越戰刃", "輔助戰刃"\]\)/);
  assert.match(script, /drive: new Set\(\["固鎖", "軸心"\]\)/);
  assert.match(styles, /#beybladeTable tbody tr\.has-collection-part-badges:not\(\.editing-row\) td:nth-child\(2\) \{\s*display: none;/);
  assert.match(styles, /#beybladeTable \.collection-part-group \{[\s\S]*?background: transparent;/);
  assert.doesNotMatch(styles, /has-collection-card-title td:nth-child\(1\)::before \{[\s\S]*?display: none;/);
  assert.match(styles, /#beybladeTable tbody tr\[data-series="CX"\] td:nth-child\(1\)::before/);
  assert.match(styles, /@media \(min-width: 1200px\) \{[\s\S]*?#beybladeTable tbody \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(styles, /@media \(min-width: 1200px\) \{[\s\S]*?#beybladeTable tbody tr:not\(\.editing-row\) \{[\s\S]*?grid-template-columns: minmax\(240px, 280px\) minmax\(0, 1fr\);/);
  assert.match(styles, /@media \(min-width: 1200px\) \{[\s\S]*?#beybladeTable tbody tr:not\(\.editing-row\) td:last-child[\s\S]*?grid-template-columns: minmax\(0, 1fr\) max-content;/);
  assert.match(styles, /@media \(min-width: 1200px\) \{[\s\S]*?\.has-collection-part-groups:not\(\.editing-row\) \.collection-part-group \{[\s\S]*?display: contents;/);
  assert.match(styles, /@media \(min-width: 768px\) and \(max-width: 1199px\) \{[\s\S]*?#beybladeTable tbody \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /@media \(max-width: 767px\) \{[\s\S]*?#beybladeTable tbody \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(styles, /@media \(max-width: 767px\) \{[\s\S]*?\.has-collection-part-groups:not\(\.editing-row\) \.collection-card-tags \{[\s\S]*?flex-direction: column;/);
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

test("inventory type colors reuse existing type groups without changing stored values", () => {
  const start = script.indexOf("function inventoryTypeMatchesFilter(type, filter)");
  const end = script.indexOf("function applyInventoryFilters()", start);
  assert.ok(start >= 0 && end > start);

  const context = {};
  vm.runInNewContext(
    `${script.slice(start, end)}\nthis.getInventoryTone = getInventoryTypeTone;`,
    context
  );

  assert.equal(context.getInventoryTone("上蓋"), "layer");
  assert.equal(context.getInventoryTone("固鎖"), "ratchet");
  assert.equal(context.getInventoryTone("軸心"), "bit");
  for (const type of ["紋章鎖", "主要戰刃", "超越戰刃", "金屬戰刃", "輔助戰刃"]) {
    assert.equal(context.getInventoryTone(type), "cx");
  }
  assert.match(script, /row\.dataset\.inventoryTone = getInventoryTypeTone\(type\)/);
  assert.match(styles, /tr\[data-inventory-tone="layer"\] td:nth-child\(1\)/);
  assert.match(styles, /tr\[data-inventory-tone="ratchet"\] td:nth-child\(1\)/);
  assert.match(styles, /tr\[data-inventory-tone="bit"\] td:nth-child\(1\)/);
  assert.match(styles, /tr\[data-inventory-tone="cx"\] td:nth-child\(1\)/);
});

test("inventory summary stays compact and reuses configuration occupancy", () => {
  assert.match(html, /id="inventoryKindSummary"/);
  assert.match(html, /id="inventoryTotal"/);
  assert.match(html, /id="inventoryUsed"/);
  assert.match(html, /id="inventoryAvailable"/);
  assert.match(script, /const usedParts = getUsedParts\(\)/);
  assert.match(script, /inventoryUsed \+= Math\.min\(count, usedParts\[type\]\?\.\[name\] \|\| 0\)/);
  assert.match(script, /setUiSummaryValue\("inventoryAvailable", Math\.max\(0, inventoryTotal - inventoryUsed\)\)/);
  assert.match(styles, /#inventorySection \.summary-strip > div \{[\s\S]*?min-height: 42px;[\s\S]*?padding: 7px 10px;/);
  assert.match(styles, /@media \(max-width: 600px\) \{[\s\S]*?#inventorySection \.summary-strip \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /#inventorySection \.summary-strip > div:nth-child\(-n \+ 2\) \{[\s\S]*?border-bottom: 1px solid var\(--manager-divider\);/);
});

test("configuration part summary stays readable without changing compact wrapping", () => {
  assert.match(styles, /#configTable \.config-card-summary \{[\s\S]*?color: var\(--manager-text-summary\);[\s\S]*?font-size: 13px;[\s\S]*?font-weight: 700;[\s\S]*?white-space: nowrap;/);
});

test("inventory display order is deterministic without changing stored part types", () => {
  assert.match(script, /const inventoryTypeDisplayOrder = \[\.\.\.partTypes\]\.sort/);
  assert.match(script, /const shortTypePriority = \["上蓋", "固鎖", "軸心"\]/);
  assert.match(script, /row\.style\.order = String\(getInventoryTypeDisplayRank\(type\)\)/);
  assert.doesNotMatch(script, /partTypes\s*=\s*\[\s*"上蓋",\s*"固鎖"/);
});

test("shared theme switch persists locally and includes complete beige tokens", () => {
  const menuScript = fs.readFileSync("site-menu.js", "utf8");
  const menuStyles = fs.readFileSync("site-menu.css", "utf8");

  assert.match(menuScript, /const SITE_THEME_STORAGE_KEY = "beybladeSiteTheme"/);
  assert.match(menuScript, /localStorage\.setItem\(SITE_THEME_STORAGE_KEY, nextTheme\)/);
  assert.match(menuScript, /data-theme-option="dark"/);
  assert.match(menuScript, /data-theme-option="beige"/);
  assert.match(menuScript, /class="theme-segment" role="group"/);
  assert.doesNotMatch(menuScript, /role="switch"/);
  assert.match(menuStyles, /html\[data-theme="beige"\]/);
  assert.match(styles, /--manager-text-summary: #4d5350/);
  assert.match(styles, /#configTable \.config-action-panel \{[\s\S]*?background-color: var\(--manager-surface-raised\);[\s\S]*?backdrop-filter: none;/);
});

test("desktop and mobile sidebars share one structured navigation source", () => {
  const menuScript = fs.readFileSync("site-menu.js", "utf8");
  const menuStyles = fs.readFileSync("site-menu.css", "utf8");

  assert.match(menuScript, /label: "額外零件庫存", bottomLabel: "庫存"/);
  assert.match(menuScript, /label: "配置紀錄", bottomLabel: "配置"/);
  assert.match(menuScript, /label: "Quick Editor"[\s\S]*?group: "工具"/);
  assert.match(menuScript, /const SITE_VERSION = "v1\.9\.1"/);
  assert.match(menuScript, /buildMenuLinkInnerHtml\(item, true\)/);
  assert.match(menuStyles, /body \.side-menu-section\[data-menu-group="說明"\][\s\S]*?border-top:/);
  assert.match(menuStyles, /body \.side-menu-footer[\s\S]*?flex: 0 0 auto/);
});

test("soft-dark refresh remains scoped to manager sections", () => {
  assert.match(html, /<body class="manager-page">/);
  assert.match(styles, /\.manager-page #collectionSection,[\s\S]*\.manager-page #configQuickEditor/);
  assert.doesNotMatch(styles, /#competitionStatsSection[\s\S]{0,120}--manager-surface/);
});

test("tournament date control can shrink inside responsive form columns", () => {
  const tournament = fs.readFileSync("tournament.html", "utf8");
  assert.match(tournament, /\.tournament-form input, \.tournament-form button \{ width: 100%; min-width: 0; max-width: 100%; \}/);
  assert.match(tournament, /\.tournament-form input\[type="date"\] \{ inline-size: 100%; min-inline-size: 0; max-inline-size: 100%; \}/);
  assert.doesNotMatch(tournament, /\.tournament-form input\[type="date"\][^{]*\{[^}]*overflow:\s*hidden/);
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
