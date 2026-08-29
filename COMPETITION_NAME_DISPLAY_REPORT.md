# 競賽統計名稱顯示修正報告

完成日期：2026-08-29

## 本次範圍

本次只調整競賽統計的顯示名稱層，沒有修改統計來源資料、數值、canonicalId、收藏、庫存、歷史紀錄、排程，也沒有恢復 Tier、分數、配置分析或推薦器。

## 修改檔案與共用函式

- `competition-stats-data.js`
  - `resolveBladeDisplayIdentity`
  - `resolveOfficialBladeDisplayName`
  - `resolveBitAbbreviation`
  - `formatCompetitionComboDisplayName`
- `competition-stats-view.js`
  - 排行榜、搜尋、詳細頁、軸心頁籤與完整配置統一使用共用解析器。
- `competition-stats.js`
  - 詳細表格展開時傳入同一筆 canonical 上蓋資料，避免重新猜測配置前綴。
- `tests/competition-statistics.test.mjs`
  - 在原有 29 項測試上新增 8 項名稱、縮寫、配置格式與資料不變性測試。
- `scripts/verify-statistics-browser.mjs`
  - 增加桌面、手機、詳細頁、完整配置與未確認中文名的實際畫面驗證。
- `scripts/report-competition-names.mjs`
  - 產生無法安全對應的名稱清單，不進行翻譯或猜測。
- `COMPETITION_NAME_REPORT.md`
  - 完整列出目前 157 個尚無已驗證台灣官方繁中名稱的來源上蓋，以及 13 個無法由主資料驗證縮寫的軸心來源名稱。

## 上蓋顯示名稱解析順序

1. 統計紀錄的 `canonicalId`。
2. `identityMatchStatus === "exact"` 的唯一精確身分對應。
3. canonical 主資料與 `__v18` 的明確 ID 橋接。
4. canonical 的 `displayNameZh`、正式中文 `name`／`name_zh`。
5. canonical aliases 中唯一且完全相等的英文或日文名稱。
6. `referenceNameEn`。
7. MetaBeys `sourcePartName`。
8. Beywatch `name` 或來源 slug。

只有主資料中可驗證的繁體中文名稱才作為主標題。未精確對應者保留來源英文，副標題顯示「官方中文名待確認」；沒有模糊比對、機器翻譯或字面拼湊。

## 軸心縮寫解析順序

1. 統計紀錄或已精確配對零件的 `canonicalId`。
2. 零件主資料的 `id`。
3. 零件主資料的 `code`。
4. 與主資料唯一且完全相等的來源名稱。
5. 來源括號內的縮寫，例如 `Low Rush (LR)`，並以已知主資料代碼驗證。
6. 已驗證 aliases。

無法驗證時保留來源英文，開發環境輸出 `unresolved bit abbreviation` 警告；不取首字母猜測。

## 無法安全解析的項目

完整上蓋清單請見 `COMPETITION_NAME_REPORT.md`。`Hover Wyvern` 與 `Pegasus Blast` 已於後續由使用者確認為「飛龍凌空」與「天馬爆擊」，目前已不在未對應清單中。

無法由主資料驗證縮寫的軸心來源名稱共 13 個：

- Under Flat
- Zap
- Trans Kick
- High Taper
- Jaggy
- Bounce Spike
- TransKick
- Hexq
- Jagger
- Low Taper
- Points
- Wall Wedge
- Weedge

## 畫面差異

- 上蓋：由只顯示來源英文，改為「官方繁體中文主標題＋英文副標題」。
- 未確認上蓋：保留英文，顯示「官方中文名待確認」。
- 軸心：由中文／英文雙行改為單行官方縮寫，例如 `H`、`LR`、`R`。
- 完整配置：例如 `Wizard Rod 1-60FB` 顯示為 `魔導神杖 1-60 FB`，原始 `combo` 不變。

## 測試與建置

- 完整測試：37 項通過、0 失敗、0 跳過（原有 29 項全部保留並通過）。
- 正式靜態建置：通過，共 28 個輸出檔案。
- HTML／模組／JSON／引用檢查：11 份文件、12 個模組、5 個根 JSON、112 個引用，全部通過。
- 不含身分對應欄位的客觀統計 SHA-256：`22139a94cc3c8e8ad6fc3672c5e41b1b97aabeecb1752801a80decf1607e05d4`，名稱身分修正前後一致。
- 瀏覽器驗證：桌面與 390 × 844 手機版均無執行錯誤、無水平溢出；重新整理及返回操作正常。

## 資料與功能保護確認

- MetaBeys `sourcePartName`、Beywatch `name`、Beywatch 原始 `combo`、來源 URL、擷取日期與網站更新日期均未改寫。
- Popularity、Usage、Pick %、1st Rate、Top Cuts 均未改變。
- 沒有修改 canonicalId，也沒有將格式化顯示文字寫回來源資料。
- Tier、推薦器、收藏、庫存、歷史紀錄及週六／週日排程均未修改。
- 沒有推送、部署或上線。

## 截圖

- `artifacts/competition-stats/rankings-1440x900.png`
- `artifacts/competition-stats/names-mobile-bits-390x844.png`
- `artifacts/competition-stats/names-wizard-combos-390x844.png`
- `artifacts/competition-stats/names-wizard-bits-390x844.png`
- `artifacts/competition-stats/names-unverified-hover-wyvern-390x844.png`
