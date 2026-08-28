# 舊分析系統移除紀錄 — 2026-08-28

## 範圍與狀態

- 專案根目錄：`C:\Users\阿傑\OneDrive\文件\戰鬥陀螺管理器`。
- 本次修改前 Git 基準：`a1f4159`，包含較新的賽事名次自動計算功能；沒有回退到前一版。
- 本機移除及驗證完成，尚未提交、推送或部署。線上版本不在本次本機驗證的完成聲明內。
- 未建立 MetaBeys／Beywatch 新畫面，也未新增統計或推薦功能。

## 原資料來源與執行流程

原 `analysis.html` 經 `analysis_inventory_nullsafe_v2.js` 載入 `analysis.js`，再載入主資料庫、分析規則、分析引擎/helper 與庫存推薦器。

主資料庫 `beyblade_x_database_v1_zhTW.json` 的 canonical 位於 `blades`、`ratchets`、`bits`、`parts` 及 `cx` 各集合；相容資料位於同檔 `__v18`。另有 `beyblade_x_codex_database_v1_8_ASCII_SAFE.json`。

原先的 Tier、角色、向量分數、協同、候選產生、fallback、特化路線、推薦排序與說明分散於上述 JSON、`analysis.js`、引擎、helper 及推薦器。入口包含全站選單、配置紀錄列按鈕與教學。`scripts/sync-analysis-compatibility-v7.mjs` 會重新寫入相容分析資料。

## 實際刪除

以下 12 個 Git 管理檔案已實體刪除，沒有留下停用的引擎副本：

- `analysis.html`
- `analysis.js`
- `analysis_inventory_nullsafe_v2.js`
- `beyblade_x_analysis_engine_v1_zhTW.js`
- `beyblade_x_analysis_helper_v1_8_ASCII_SAFE.js`
- `beyblade_x_analysis_rules_v1_zhTW.json`
- `beyblade_x_inventory_recommendation_v1.js`
- `beyblade_x_inventory_recommendation_nullsafe_v2.js`
- `scripts/sync-analysis-compatibility-v7.mjs`
- `scripts/validate-analysis-database-v7.mjs`
- `tests/inventory-recommendation-v7.test.mjs`
- `tests/inventory-recommendation-v10.test.mjs`

相關函式包含 `analyzeCombo`、`makeConfigSuggestions`、`buildStandardSuggestions`、`buildCxInventorySuggestions`、`buildInventorySpecificSuggestions`、`inventoryCandidateGate`、`classifyBuild`、`analysisScoreValue`、`selectTopInventorySuggestions` 等，均隨模組刪除。

`script.js` 只移除 `analyzeConfigRow`、`cleanAnalysisValue`、只供該功能使用的 `getTextCell`，以及 `getOperationButtons` 中的分析按鈕；其他內容與基準逐字比較一致。

`site-menu.js`、`index.html`、`tournament.html` 移除入口；`guide.html`、`changelog.html`、`manifest.json` 清理舊功能說明。共用 CSS 移除分析專用選擇器，底部導覽改為四欄，沒有空白第五欄。各 HTML 僅同步更新相關 JS/CSS 資源版本。

## 資料清理

直接清理兩份既有資料庫，以及 `exports/` 原有 16 份 JSON，沒有新增任何 JSON 或資料副本。獨立 v1.8 檔只保留身分及 CX 結構資料，不再被前端載入。

刪除的欄位類別包括：

- `analysisRules`、`displayRules`、`conflictPolicy`、`priorityRules`、`globalUpdates`、`enums`。
- `tier`、`metaTier`、`independentEvaluation`、`independentEvaluationCoverage`、`rank`、`displayOrder`、月度／近期加權排名與分數、`confidence`／`metaConfidence`。
- 所有 `recommended*`、`recommendation*`、`preferred*`、`bestWith`、`contextualRecommendationCandidates`、`routes`、`specializedRoutes`、hard exclusions、fallback 與 recommendation policy。
- 角色／用途標籤、優缺點、風險、主觀評語、原裝加權、向量分數、協同規則、scoreKeys、候選與顯示順位。
- 無原始紀錄佐證的手動完整配置、推導型 CX 配置及分析變更敘述。

混合原始紀錄與主觀說明的集合沒有整包丟棄：

- `metaCommonRoutes` → `reportedConfigurations`：33 筆有原始觀察、比例、原裝或已報告案例的紀錄，去掉推薦用途。
- `metaCombos` → `reportedComboObservations`：保留有來源與數字的觀察，刪除單純手動推薦。
- `metaCoachUpdates` → `reportedSourceUpdates`：只保留來源期間、對象及原始次數。
- 專題紀錄保留賽事案例、來源及原始比例；移除 integratedAssessment 和推薦配置。Wheel 保留 8 筆有數字／案例的配置與 1 筆官方原裝，刪除 5 筆推導配置。

`exports/beyblade-v7-analysis-verification.png` 舊分析截圖也已移除。既有 exports 原本未納入 Git；其已清除的分析欄位及截圖不在 Git 復原範圍。受 Git 管理的刪除與修改可由既有版本歷史復原。本次沒有建立備份、副本或 deprecated 檔案。

## 保留資料

- 官方商品 JSON 完全未修改：231 筆商品、套組、`exactByCode`、`variantsByBaseCode`、原裝零件、來源與發售資料。
- canonical 共 224 筆零件／身分紀錄：上蓋 57、固鎖 35、軸心 51、額外 part profile 13、CX 紋章鎖 16、主要戰刃 22、金屬戰刃 5、超越戰刃 10、輔助戰刃 15。
- 所有既有名稱、aliases、canonicalId、產品身分、CX 結構與原裝欄位逐筆比較保留。
- 4 份既有快照的日期、期間、樣本與來源網址保留；原始前段次數、奪冠案例、Beywatch 比例與 MetaBeys 使用占比沒有轉成分數。
- `tournament.js`、`admin.js`、`user-view.js`、Firestore 規則完全未修改；賽事名次及實際回合比分屬使用者紀錄，保留。
- 未對雲端使用者資料執行任何寫入、刪除或 migration。

## 快取

原應用沒有分析結果專用 localStorage／IndexedDB key，也沒有 Service Worker。原分析頁的快取是頁面記憶體，模組刪除後不再存在。

新增 `retire-analysis-cache.js`，由共用選單載入：

- 只刪同 origin、同專案目錄內精確匹配的 10 個舊分析資源 Cache Storage request，包含 query 版本。
- 不刪 cache 容器，不使用 localStorage.clear 或 indexedDB.deleteDatabase，也不碰 Firebase 儲存。
- 官方商品 JSON、收藏、庫存、歷史、側欄設定與其他網站／專案資源均保留。
- 成功後寫入帶專案路徑的完成標記；重跑跳過，失敗不標完成。
- JS/CSS 入口版本已更新。此 migration 不宣稱可以清除瀏覽器內部 HTTP cache；新資源 URL 避免沿用舊入口。

## 搜尋與測試

執行命令：

```text
node --test
node --experimental-vm-modules scripts/validate-site.mjs
git diff --check
```

完整測試結果：12 tests、12 pass、0 fail、0 skipped。

1. 舊引擎、推薦器、頁面與再生腳本實體不存在。
2. 前端沒有入口、候選器、推薦卡或空白導覽欄。
3. canonical、__v18、相容檔及 exports 無分析欄位。
4. 所有零件身分、別名、原裝與 CX 結構保留。
5. 231 筆官方商品及產品索引完全未修改。
6. 使用者資料／賽事儲存程式保留。
7. 客觀案例、次數及來源比例保留。
8. 來源網址、快照與交叉引用有效。
9. Git 內所有既有排程逐字不變。
10. 快取 migration 只移除精確的舊資源。
11. migration 失敗可重試，不整庫刪除。
12. 無 Cache Storage 的環境也可啟動。

搜尋結果：執行期沒有舊引擎、推薦器、推薦 policy 或分析入口。資料中剩餘的 `tier`／`Score` 字串僅是原來源類型或原來源文章標題；不是評級欄位。`tournament.js` 的 score 是實際比賽得失分，依需求保留。刪除資源名稱只出現在精準快取 migration、禁止回歸測試及本報告。

本機瀏覽器：首頁、重新整理後首頁及賽事頁均無分析入口；UX-01 原裝預覽正常；未登入狀態 console errors 為 0；舊路由 HTTP 404。沒有登入或修改使用者資料。

## Build 與排程界線

靜態發布檢查通過：10 份 HTML、9 個 JavaScript 編譯單元、5 份根目錄 JSON、103 個本機資源參照，無缺檔、語法或 JSON 錯誤。檢查不產生網站或 JSON 副本。

本專案無 package.json／本機 build 指令；正式發布使用 GitHub Pages 的 Jekyll build。本機未安裝 Ruby、Jekyll 或容器工具，因此正式 GitHub Pages build 尚未執行；本次未自行提交或推送來觸發部署，不能將靜態檢查當作正式部署成功。

週六 20:00 官方新品／原裝配置與週日 20:00 競賽統計排程均未修改。未呼叫任何排程修改工具；`.github/workflows` 亦逐字不變。沒有恢复舊排程或新增排程。
