import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const helpPages = [
  "home.html",
  "guide.html",
  "changelog.html",
  "privacy.html",
  "about.html",
  "contact.html"
];
const expectedLinks = [
  ["home.html", "首頁"],
  ["index.html", "開始使用"],
  ["guide.html", "使用教學"],
  ["changelog.html", "更新紀錄"],
  ["privacy.html", "隱私權政策"],
  ["about.html", "關於本站"],
  ["contact.html", "聯絡方式"]
];
const menuScript = readFileSync("site-menu.js", "utf8");

test("說明頁捷徑由單一 HELP_NAV_ITEMS 清單產生", () => {
  const listMatch = menuScript.match(/const HELP_NAV_ITEMS = \[([\s\S]*?)\n\];/);
  assert.ok(listMatch, "找不到 HELP_NAV_ITEMS");

  const actualLinks = [...listMatch[1].matchAll(/href: "([^"]+)", label: "([^"]+)"/g)]
    .map(match => [match[1], match[2]]);
  assert.deepEqual(actualLinks, expectedLinks);
  assert.match(menuScript, /\.\.\.HELP_NAV_ITEMS[\s\S]*?\.filter\(item => item\.sideMenu\)/);
  assert.match(menuScript, /document\.querySelectorAll\("\[data-help-nav\]"\)/);
  assert.match(menuScript, /aria-current="page"/);
});

test("六個說明頁只保留共用捷徑掛載點", () => {
  helpPages.forEach(page => {
    const html = readFileSync(page, "utf8");
    assert.equal((html.match(/data-help-nav/g) || []).length, 1, `${page} 掛載點數量錯誤`);
    assert.match(html, /class="site-nav help-page-nav" data-help-nav/);
    assert.doesNotMatch(html, /<div class="site-nav">/);
    assert.match(html, /site-menu\.js\?v=20260902-v192/);
    assert.match(html, /site-menu\.css\?v=20260902-v192/);
  });
});

test("所有共用捷徑都指向現有頁面", () => {
  expectedLinks.forEach(([href]) => assert.equal(existsSync(href), true, `${href} 不存在`));
});

test("使用教學符合目前正式操作", () => {
  const guide = readFileSync("guide.html", "utf8");
  assert.match(guide, /收藏、額外零件庫存、配置、競賽統計與賽事五個主要功能/);
  assert.match(guide, /上蓋、固鎖、軸心與 CX 分件快速篩選/);
  assert.match(guide, /自訂配置不需要輸入產品型號/);
  assert.match(guide, /按卡片右側「⋯」才會顯示「修改」與「刪除」/);
  assert.match(guide, /原裝收藏、額外零件庫存、自訂配置、歷史測試與參賽紀錄會儲存在自己的帳號/);
  assert.match(guide, /手機可使用底部五項導覽，也能打開左側選單查看更多頁面/);
  assert.match(guide, /深色與米色主題，可在左側選單底部切換；選擇後會在同一瀏覽器保存/);
  assert.doesNotMatch(guide, /配置卡可直接「修改」或「刪除」/);
  assert.doesNotMatch(guide, />陀螺配置</);
});

test("更新紀錄只直接顯示最新版本，其餘版本集中於歷史版本", () => {
  const html = readFileSync("changelog.html", "utf8");
  const latestVersionIndex = html.indexOf("v1.9.2｜收藏與文字閱讀體驗改善");
  const historyIndex = html.indexOf('<details class="version-archive">');
  const previousVersionIndex = html.indexOf("v1.9.0｜主題、導覽與管理介面更新");

  assert.equal((html.match(/2026-09-02/g) || []).length, 1);
  assert.equal((html.match(/class="version-archive"/g) || []).length, 1);
  assert.ok(latestVersionIndex >= 0 && latestVersionIndex < historyIndex);
  assert.ok(previousVersionIndex > historyIndex);
  assert.doesNotMatch(html, /v1\.9\.1｜收藏與庫存資訊顯示優化/);
});
