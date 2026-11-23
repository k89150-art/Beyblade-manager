// Phase 7-1 (D-020): site navigation. Runs the real navigation data and the pure
// nav model from site-menu.js in a VM (no DOM), plus static checks of the wiring.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync("site-menu.js", "utf8").replace(/\r\n/g, "\n");
const slice = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + 1);
  assert.ok(a >= 0 && b > a, `missing range ${start}`);
  return source.slice(a, b);
};
const code = [
  slice("const HELP_NAV_ITEMS = [", "function normalizeSiteTheme("),
  slice("function buildMenuIcon(", "function buildSideMenuInnerHtml("),
  slice("/* ===== nav model (pure", "/* ===== end nav model ===== */")
].join("\n");
const context = { location: { hash: "" } };
vm.createContext(context);
vm.runInContext(`${code}\nthis.nav = { SIDE_MENU_ITEMS, QUICK_ACTIONS, buildBottomNavHtml, buildQuickAddMenuHtml, getQuickActionTarget, sectionForHash, bottomItemActive, moreActive, navItemActive };`, context);
const nav = context.nav;
const plain = value => JSON.parse(JSON.stringify(value));

function bottomItems(page, section) {
  const html = nav.buildBottomNavHtml(page, section);
  return [...html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(([, tag, attrs, inner]) => ({
    tag,
    label: inner.replace(/<[^>]+>/g, "").replace(/^[A-Z0-9＋⋯]+/, "").trim(),
    href: (attrs.match(/href="([^"]+)"/) || [])[1] || null,
    active: /class="[^"]*\bactive\b/.test(attrs),
    attrs
  }));
}

test("bottom nav is 收藏／配置／＋新增／賽事／更多; ＋新增 and 更多 are buttons", () => {
  const items = bottomItems("index.html", "collectionSection");
  assert.deepEqual(items.map(i => i.label), ["收藏", "配置", "新增", "賽事", "更多"]);
  assert.deepEqual(items.map(i => i.tag), ["a", "a", "button", "a", "button"]);
  assert.deepEqual(items.map(i => i.href), ["index.html#collectionSection", "index.html#configSection", null, "tournament.html", null]);
  assert.match(items[2].attrs, /data-quick-add/);
  assert.match(items[2].attrs, /aria-haspopup="menu"/);
  assert.match(items[2].attrs, /aria-controls="quickAddMenu"/);
  assert.match(items[2].attrs, /aria-expanded="false"/);
  assert.match(items[4].attrs, /data-open-more/);
  assert.doesNotMatch(nav.buildBottomNavHtml("index.html", "collectionSection"), /competition-stats\.html/, "競賽統計 is under 更多");
});

test("every existing destination is still in the side menu", () => {
  const hrefs = new Set(plain(nav.SIDE_MENU_ITEMS).map(i => i.href));
  for (const href of ["index.html#collectionSection", "index.html#inventorySection", "index.html#configSection", "index.html#configQuickEditor",
    "competition-stats.html", "tournament.html", "home.html", "index.html", "guide.html", "changelog.html", "privacy.html", "about.html", "contact.html", "admin.html"]) {
    assert.ok(hrefs.has(href), href);
  }
  const groups = [...new Set(plain(nav.SIDE_MENU_ITEMS).map(i => i.group))];
  assert.deepEqual(groups, ["主要功能", "參考", "工具", "說明", "管理"]);
  const parts = plain(nav.SIDE_MENU_ITEMS).find(i => i.section === "inventorySection");
  assert.equal(parts.label, "零件");
  assert.equal(parts.title, "額外零件庫存");
  assert.equal(parts.child, true);
  assert.equal(plain(nav.SIDE_MENU_ITEMS).find(i => i.href === "admin.html").adminOnly, true);
});

test("active states: index sections, tournament, and 更多 for other pages", () => {
  const activeLabel = (page, section) => bottomItems(page, section).filter(i => i.active).map(i => i.label);
  assert.deepEqual(activeLabel("index.html", "collectionSection"), ["收藏"]);
  assert.deepEqual(activeLabel("index.html", "inventorySection"), ["收藏"]);
  assert.deepEqual(activeLabel("index.html", "configSection"), ["配置"]);
  assert.deepEqual(activeLabel("index.html", "historySection"), ["配置"]);
  assert.deepEqual(activeLabel("tournament.html", "collectionSection"), ["賽事"]);
  for (const page of ["competition-stats.html", "guide.html", "home.html", "changelog.html", "admin.html", "user-view.html"]) {
    assert.deepEqual(activeLabel(page, "collectionSection"), ["更多"], page);
  }
  // Side menu keeps one active item per index section.
  const side = plain(nav.SIDE_MENU_ITEMS);
  assert.deepEqual(side.filter(i => nav.navItemActive(i, "index.html", "inventorySection")).map(i => i.label), ["零件"]);
  assert.deepEqual(side.filter(i => nav.navItemActive(i, "competition-stats.html", "collectionSection")).map(i => i.label), ["競賽統計"]);
});

test("＋新增 menu has the five actions with their destinations", () => {
  const html = nav.buildQuickAddMenuHtml();
  const items = [...html.matchAll(/<a role="menuitem" href="([^"]+)"[^>]*data-quick-action="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)]
    .map(([, href, id, rest, inner]) => ({ href, id, quickEditor: /data-menu-action="quick-editor"/.test(rest), label: inner.replace(/<small>.*<\/small>/, "").replace(/<[^>]+>/g, "") }));
  assert.deepEqual(items.map(i => [i.label, i.href]), [
    ["新增收藏", "index.html#add-collection"], ["新增零件", "index.html#add-part"], ["建立配置", "index.html#configQuickEditor"],
    ["新增比賽", "tournament.html#add-tournament"], ["記錄回合", "tournament.html"]
  ]);
  assert.deepEqual(items.map(i => i.quickEditor), [false, false, true, false, false]);
});

test("quick-action anchors resolve only on their own page, to fields that exist", () => {
  assert.deepEqual(plain(nav.getQuickActionTarget("#add-collection", "index.html")), { page: "index.html", section: "collectionSection", focus: "model" });
  assert.deepEqual(plain(nav.getQuickActionTarget("#add-part", "index.html")), { page: "index.html", section: "inventorySection", focus: "partName" });
  assert.deepEqual(plain(nav.getQuickActionTarget("#add-tournament", "tournament.html")), { page: "tournament.html", focus: "tournamentDate" });
  assert.equal(nav.getQuickActionTarget("#add-collection", "tournament.html"), null);
  assert.equal(nav.getQuickActionTarget("#configQuickEditor", "index.html"), null, "Quick Editor hash keeps its existing handler");
  assert.equal(nav.sectionForHash("#add-part"), "inventorySection");
  assert.equal(nav.sectionForHash("#historySection"), "historySection");
  assert.equal(nav.sectionForHash("#configQuickEditor"), "collectionSection");
  const index = fs.readFileSync("index.html", "utf8"), tournament = fs.readFileSync("tournament.html", "utf8");
  assert.match(index, /id="model"/);
  assert.match(index, /id="partName"/);
  assert.match(index, /id="historySection"/);
  assert.match(tournament, /id="tournamentDate"/);
});

test("menu wiring: keyboard, focus return, outside click, and no data writes", () => {
  assert.match(source, /if \(event\.key === "ArrowDown"\)/);
  assert.match(source, /if \(event\.key === "ArrowUp"\)/);
  assert.match(source, /if \(event\.key !== "Escape"\) return;\n    closeQuickAddMenu\(\);\n    closeSideMenu\(\);/);
  assert.match(source, /if \(restoreFocus\) quickAddTrigger\?\.focus\(\);/);
  assert.match(source, /querySelector\("\.quick-add-backdrop"\)\.addEventListener\("click"/);
  assert.match(source, /window\.addEventListener\("hashchange", handleQuickActionHash\)/);
  assert.doesNotMatch(source, /firebase-firestore|setDoc|runTransaction|updateDoc/, "navigation never writes data");
  const css = fs.readFileSync("site-menu.css", "utf8");
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /--ui-touch: 44px;/);
  assert.match(css, /html\[data-theme="beige"\] \{\n  --ui-surface:/);
});
