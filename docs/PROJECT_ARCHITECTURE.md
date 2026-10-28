# 專案架構

最後核對日期：2026-10-29

本文件描述目前程式碼實際狀態，不是未來藍圖。架構變更後應同步更新。

## 1. 技術摘要

| 項目 | 目前實作 |
|---|---|
| Frontend | 原生 HTML、CSS、JavaScript ES Modules |
| Runtime | 瀏覽器；本機檢查使用 Node.js（workflow 基準為 Node 20） |
| Package Manager | 無；專案沒有 `package.json` |
| UI Library | 無 |
| Routing | 多頁式靜態 HTML，使用相對連結與查詢參數 |
| Authentication | Firebase Authentication，Google Popup |
| Database | Cloud Firestore |
| ORM | 無 |
| Testing | Node.js 內建 `node:test`、自製靜態驗證與瀏覽器人工驗收 |
| Hosting | GitHub Pages，`main` 分支根目錄 |

Firebase Web SDK 目前由 `https://www.gstatic.com/firebasejs/11.2.0/` 載入。Firebase 初始化分散在數個頁面模組中；若要集中化，必須另立任務並完整驗證，不能順手重構。

## 2. 頁面與功能

### 主管理頁 `index.html`

由 `script.js` 與 `style.css` 驅動，包含：

- **收藏管理**：原裝產品自動／手動輸入、多子型號選擇、數量與刪除。
- **額外零件庫存**：新增、修改、刪除、搜尋、分類與使用中／可用數量。
- **配置紀錄**：依持有零件建立 BX／UX／CX 自訂配置、庫存占用檢查、修改、刪除與釋放零件。
- **Quick Editor**：建立與修改配置；使用者不需輸入產品型號，但舊資料仍相容。
- **歷史測試**：使用者自己的測試紀錄。

`script.js` 同時負責原裝產品資料載入、名稱對照、表格狀態、Firestore 監聽與保存。它是目前主頁的既有整合邊界，不應因檔案較大而無任務地拆分。

### 競賽統計 `competition-stats.html`

- `competition-stats.js`：頁面控制器。
- `competition-stats-data.js`：資料載入、篩選與來源格式化。
- `competition-stats-view.js`：畫面輸出。
- `competition-stats.css`：該頁隔離樣式。
- 正式資料由 `beyblade_x_database_v1_zhTW.json` 載入。

本頁只顯示客觀競賽資料，不提供 Tier、主觀推薦或推估勝率。

### 賽事 `tournament.html`

由 `tournament.js` 管理比賽基本資料、輪次、對戰、輪空／不戰晉級與最終成績。它會讀取同一位使用者的 `configTable`，並只以 merge 更新 `tournamentRecords`，避免覆蓋主頁其他欄位。

### 管理員與使用者檢視

- `admin.html`、`admin.js`：指定管理員使用 `collectionGroup("appData")` 讀取使用者摘要；UI 為唯讀。
- `user-view.html`、`user-view.js`：依 UID 讀取特定使用者的 `users/{uid}/appData/main`；管理員唯讀。

### 全站導覽與說明頁

- `site-menu.js` 是 `HELP_NAV_ITEMS`、`SIDE_MENU_ITEMS`、側欄、手機底部五項導覽、active 狀態、主題與版本顯示的主要來源。
- `site-menu.css` 提供共用導覽、主題與 typography tokens。
- 說明頁：`home.html`、`guide.html`、`changelog.html`、`privacy.html`、`about.html`、`contact.html`。
- `retire-analysis-cache.js` 只處理已退役分析頁的舊網址／快取標記。

## 3. 資料與模組相依

### 型錄與原裝配置

- `stock_products_AUTOFILL_SAFE_2026-07-29-v3.json`：收藏自動帶入與同主型號子型號選擇。
- `beyblade_x_model_chinese_english_2026-08-29.json`：中文、英文與型號對照。
- `stock-catalog-names.js`：型錄名稱合併與顯示支援。

原裝配置資料只服務收藏與名稱顯示，不是性能評分資料。

### 主資料庫與競賽資料

`beyblade_x_database_v1_zhTW.json` 包含零件主資料、別名、競賽統計及部分來源／研究 metadata。正式競賽統計 UI 只使用其客觀統計契約。

- MetaBeys `Part Popularity`：上蓋、固鎖、軸心、輔助戰刃。
- Beywatch：上蓋使用率與來源已提供的競賽配置統計。
- 軸心在統計頁維持經驗證的英文縮寫；不自行補造排名、使用率或中文名稱。

`competition-statistics/` 與 `scripts/` 內有競賽資料匯入、稽核與名稱整理工具。`beyblade_x_codex_database_v1_8_ASCII_SAFE.json` 為歷史／參考資料，不代表退役分析功能仍可接回正式 UI。

## 4. 收藏、庫存與配置規則

### 收藏顯示

- BX／UX：上蓋 → 固鎖 → 軸心。
- CX：紋章鎖 → 金屬戰刃（存在時）或主要戰刃 → 超越戰刃 → 輔助戰刃 → 固鎖 → 軸心。
- 不存在的零件不建立空標籤。

### 額外零件庫存

顯示分類為：全部、上蓋、固鎖、軸心、CX 分件。CX 分件由實際 type 判斷，包含紋章鎖、主要戰刃、金屬戰刃、超越戰刃、輔助戰刃，不以零件名稱猜測。

庫存摘要沿用配置占用結果：

- 零件種類：實際 type／name 庫存列數。
- 持有總數：所有庫存數量總和。
- 使用中：每項取 `min(持有數量, 配置占用數量)` 後加總。
- 可用：每項取 `max(0, 持有數量 - 配置占用數量)` 後加總。

### 配置紀錄

配置卡維持 compact 結構，顯示主要名稱與零件摘要；不顯示 BX／UX／CX 裝飾性系列 Badge，管理操作收在 `⋯` 選單。配置庫存占用由 `getUsedParts()` 等既有邏輯計算，不得另建一套計算規則。

### 資料更新流程

- **官方原裝配置**：每週檢查 TAKARA TOMY 官方型號、官方名稱與原裝零件，去重後與 `stock_products_AUTOFILL_SAFE_2026-07-29-v3.json` 及名稱基準對照。
- **競賽統計**：獨立處理 MetaBeys 與 Beywatch 快照，保留歷史基準、來源時間、canonical 對應與現有 schema。`scripts/import-competition-statistics.mjs` 只能明確手動執行，不會在網站啟動或 build 時自動匯入。
- 兩條更新的週排程是 repository 之外的運作設定；本 repository 沒有對應的 schedule workflow。未經使用者授權，AI 不得重建、變更或執行排程。

## 5. Authentication 與 Firestore

### 登入

各主要頁使用 Firebase Authentication 的 Google Popup。登入後以 Firebase `user.uid` 作為唯一使用者識別；登出後不允許編輯私人資料。

### 正式資料路徑

```text
users/{uid}/appData/main
```

主文件目前包含或可能包含：

- `beybladeTable`：原裝收藏。
- `partTable`：額外零件庫存。
- `configTable`：自訂配置。
- `historyTable`：歷史測試。
- `tournamentRecords`：賽事紀錄。
- `ownerUid`、`ownerEmail`、`updatedAt`：擁有者與同步 metadata。

`script.js` 以 `onSnapshot` 監聽並以 `setDoc(..., { merge: true })` 保存主頁資料。`tournament.js` 僅 merge 自己擁有的 `tournamentRecords` 欄位。新增模組時必須明確定義欄位所有權，避免 stale state 覆蓋其他頁面資料。

### 本機資料

目前 localStorage 只保存 UI 偏好，例如：

- `beybladeSiteTheme`：深色／米色主題。
- `beybladeDesktopNavCollapsed`：桌面側欄收合狀態。
- 退役分析 cache marker 的清理狀態。

目前沒有收藏、庫存、配置或賽事的正式 localStorage 副本。文件或功能不得宣稱存在尚未實作的離線資料同步。

### Security Rules

`firestore.rules` 目前要求：

- 使用者只能讀寫自己的 `users/{uid}/appData/main`。
- 指定 Meta Admin UID 可唯讀檢視 appData。
- 一般使用者不可讀寫其他 UID 的資料。

Rules 的任何變更都屬高風險操作，必須經明確批准與 Emulator／規則測試。

### 舊 RTDB

舊 project `beyblade-wangbaboa` 的 `beyblade-wangbaboa-default-rtdb` 已設定根節點 `.read: false`、`.write: false`。目前網站沒有 RTDB SDK、URL 或資料路徑相依。舊資料保留，不得重新開放、刪除或搬移。

此 deployed RTDB 狀態目前不由本 repository 的 rules 檔管理；未來稽核必須同時核對 Firebase Console 實況。

## 6. 建置、測試與部署

### 本機檢查

```powershell
node --test tests/catalog-name-merge.test.mjs tests/competition-statistics.test.mjs tests/help-pages.test.mjs tests/manager-ui-refresh.test.mjs tests/retirement.test.mjs
node --experimental-vm-modules scripts/validate-site.mjs
node scripts/build-site.mjs
git diff --check
```

`scripts/validate-site.mjs` 驗證 JavaScript、inline script、本機資源、JSON 與退役功能界線。`scripts/build-site.mjs` 先執行驗證，再將允許的靜態資源複製到 `.site-build/`。

### GitHub Pages

- Repository：`k89150-art/Beyblade-manager`。
- Production URL：`https://k89150-art.github.io/Beyblade-manager/`。
- 目前由 `main` 分支根目錄使用 legacy Pages build 提供。
- `.site-build/` 是本機驗證產物，不是 Pages 部署來源。

### Firebase workflows

- `.github/workflows/deploy-firestore-rules.yml`：手動部署 `k89150-web-login` 的 Firestore Rules。
- `.github/workflows/backup-recent-tournament-records.yml`：手動備份／受控還原近期 `tournamentRecords`。

這些 workflow 涉及正式權限或資料，只有在使用者明確授權後才能執行。

## 7. 已知架構注意事項

- 專案沒有 package manager；不要為單一小改動擅自引入建置框架。
- Firebase 初始化目前有重複設定；這是既有狀態，不應在無專案任務時重構。
- 主頁邏輯集中於 `script.js`；修改時需做完整 regression，但不代表可任意重寫。
- 正式業務資料沒有本機 fallback；網路或 Firestore 錯誤必須明確呈現，不能假裝已同步。
- Competition JSON 可能保留研究 metadata；正式 UI 的內容政策仍以客觀統計為限。
