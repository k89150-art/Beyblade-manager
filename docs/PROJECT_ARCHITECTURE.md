# 專案架構

最後核對日期：2026-11-23（本機 `main` 為 `origin/main`＝`5617f4e` 之後加上 Phase 6A 的本機 commit，尚未 push）

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

`data-session-guard.js`（由 `script.js`、`tournament.js` 以帶版本號的 import 載入，與兩頁 HTML 的 script 版本一致）提供主頁與賽事頁共用的資料載入 session 狀態、待處理互動取消、snapshot 去重與首次文件安全建立工具。寫入與非同步操作必須綁定已完成伺服器讀取的 UID、target UID 與 generation；登入、登出、帳號切換或管理員切換檢視都會使舊 session 失效。

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

由 `tournament.js` 管理比賽基本資料、輪次、對戰、輪空／不戰晉級與最終成績。它會讀取同一位使用者的 `configTable`，並依 D-017 以 Firestore transaction 寫入：每次操作在交易內讀取最新文件，經 `tournament-sync.js` 只套用到目標賽事，再以 `transaction.update` 只寫 `tournamentRecords` 與 `updatedAt`，避免覆蓋主頁其他欄位或其他分頁／裝置的賽事變更。


Phase 7-4（D-024）在賽事頁加入顯示層，不新增寫入路徑：比賽詳細最上方的記錄回合面板（比分板、對局切換、陀螺／得分方／勝利方式大按鈕）只填入既有 `data-round-*` 欄位後呼叫 `addRound`；新增對局對話框（比賽卡內，沿用 `data-match-opponent`／`data-deck-*`）呼叫 `addMatch`／`addDirectAdvance`；修改對局面板由 `editMatch` 呼叫 `openMatchEditPanel` 取得輸入。純函式在 `tournament-panel.js`（面板對象、可選陀螺、3on3 重複零件判斷）；計分與勝負一律使用 `tournament.js` 既有函式。顯示狀態（面板對象、對話框開啟）只在記憶體並綁定登入帳號。受保護區段與寫入計數由 `tests/tournament-protection.test.mjs` 固定。

### 管理員與使用者檢視

- `admin.html`、`admin.js`：指定管理員使用 `collectionGroup("appData")` 讀取使用者摘要；UI 為唯讀。
- `user-view.html`、`user-view.js`：依 UID 讀取特定使用者的 `users/{uid}/appData/main`；管理員唯讀。

### 全站導覽與說明頁

- `site-menu.js` 是 `HELP_NAV_ITEMS`、`SIDE_MENU_ITEMS`、`QUICK_ACTIONS`、側欄、手機底部導覽（收藏／配置／＋新增／賽事／更多，D-020）、「＋新增」快速選單、active 狀態、主題與版本顯示的主要來源。導覽 HTML 與 active 判斷在檔內 `nav model (pure …)` 區塊，不依賴 DOM，由 `tests/site-navigation.test.mjs` 測試。快速新增以 hash（`#add-collection`、`#add-part`、`#add-tournament`）導向既有欄位，只捲動與聚焦，不寫入資料。
- `site-menu.css` 提供共用導覽、主題與 typography tokens；Phase 7-1 新增 `--ui-*` 設計 tokens（深色與米色各一組）與快速選單樣式（桌面 popover、≤820px 底部 sheet）。
- 說明頁：`home.html`、`guide.html`、`changelog.html`、`privacy.html`、`about.html`、`contact.html`。

### 收藏／零件顯示層（Phase 7-2a，D-021）

- `index.html`：分頁列 `#collectionTabs`（原裝陀螺／零件），分頁區段沿用 `#collectionSection`、`#inventorySection`；新增表單包在 `#collectionAddBody`、`#inventoryAddBody`（可收合，欄位 id 不變）；顯示清單 `#stockViewList`、`#partViewList`；原始表格移到兩個區段之外的 `#collectionSourceTables`（`#beybladeSourceBox`、`#partSourceBox`）。
- 資料流：Firestore 快照 → `applyDataToTables` 建立原始列（不變）→ 既有 `installUiSummaryObservers` 的 MutationObserver → `refreshUi` → `scheduleCollectionViewRender`（每畫格最多一次）→ `renderCollectionView` 以 `readSourceRowSnapshot`（`getPersistedRowCells`）讀原始列，交給 `collection-view.js` 的純函式產生清單，只寫入兩個顯示清單容器。儲存仍由既有函式從原始表格收集（D-018）；自 D-023 起 `getTableData`／`getHistoryData`、`getPersistedRowCells`、`getStockNameFromCell` 都以 `readStoredCellText` 讀儲存值（與顯示狀態無關），所以零件身分是「類別＋原始名稱」，庫存、引用、選單、D1 提示都用同一個鍵；選單的顯示文字另以 `formatPartNameForMenu` 標出空白，不寫入資料。
- 原始表格的隱藏只能用 `.is-source-hidden`（clip-path）＋`inert`＋`aria-hidden`；零件篩選在顯示層啟用時不再對原始列設 `hidden`。
- 帳號切換：`handleAuthStateChange` 在 F-04 草稿擷取與 `cancelSessionInteractions()` 之後呼叫 `resetQuickAddFormsForAccountChange`，清空新增表單並重設顯示層搜尋與篩選。
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

### 組裝規則（D-019）

`assembly-rules.js` 是純函式模組，由 `script.js` 以帶版本號的 import 載入（`?v=20261123-phase7r`）。`validateRatchetRules`、`shouldUseNoRatchet`、`getNoRatchetFixValue` 與配置儲存前的 `checkConfigAssemblyRules` 都改為呼叫它，依上蓋名稱與軸心代號判斷無固鎖與官方限制。規則不寫入 Firestore，也不修改既有資料。

### 收藏型錄升級（D-015）

- 載入時只有 `stockAutoFilled` 明確為 `true`（或本站儲存的字串 `"true"`）的收藏，會由 `upgradeStoredStockItem()` 依官方型錄更新；其餘收藏原樣顯示、原樣存回，不觸發自動寫回。
- 有 `stockRecordId` 時以 recordId 識別商品；recordId 不存在於型錄、或沒有 recordId 且型號對應多筆候選時，不升級。
- 手動新增寫入 `stockAutoFilled: "false"`；官方商品選擇寫入 `"true"` 與 recordId。收藏列以 `row._storedItemExtras` 保留本頁不管理的欄位。
- 管理員檢視 `user-view.js` 套用相同規則。

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
- **競賽統計**：獨立處理 MetaBeys 與 Beywatch 快照，保留歷史基準、來源時間、canonical 對應與現有 schema。`scripts/import-competition-statistics.mjs` 只能明確手動執行，不會在網站啟動或 build 時自動匯入；依 D-016 保留 `competition-statistics/` 內所有日期化快照，不刪除或覆寫既有快照。這些快照不被網站讀取，也不進入 `.site-build/`，但 legacy Pages 會公開提供 repository 內的檔案。
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

`script.js` 以 `onSnapshot` 監聽；只有取得非 cache 的首次 snapshot 後才允許寫入。主頁儲存（D-018）以 transaction 單次嘗試並由 `collection-sync.js` 自行重試，只寫入與載入時不同的資料表（D-023：載入時收藏表與配置表都在取畫面基準前同步排序，收集時也先排序；排序規則不依賴語系；儲存格以 `readStoredCellText` 讀原值，不受顯示狀態影響；載入時不改寫型號；原始列編輯器未修改的欄位保留原值）；交易內逐表比對最新資料與畫面基準，雲端已是預期內容視為已完成，其他差異一律衝突且整次不寫入；離線不排隊，衝突、離線、結果不明時保留畫面變更並在「雲端同步」區提示。Cache metadata（例如短暫斷線）不會重建已確認的畫面，也不會關閉已開啟的 Quick Editor 或刪除 dialog，但在伺服器再次確認前會暫停寫入；相同 cache／server 內容不會重複套用；若伺服器確認文件不存在，第一次寫入只在交易內再次確認不存在時才建立，避免兩個分頁同時以空白或預設資料初始化。`tournament.js` 使用伺服器單次讀取確認資料存在狀態；寫入改為 transaction（D-017），以 `maxAttempts: 1` 單次嘗試並由 `tournament-sync.js` 自行重試，以區分已提交、未提交與結果不明；在交易內以最新的 `tournamentRecords` 重新計算，單場賽事基準不同即拒絕，只更新 `tournamentRecords` 與 `updatedAt`，離線時不送出、不排隊。主頁的登入狀態變更由 `handleAuthStateChange()` 處理（F-04）：其他分頁登出或切換帳號時，先把尚未儲存的收藏資料表保留在本分頁記憶體並提示使用者下載，再清除畫面與 Session；保留的資料不寫入任何帳號、也不會在重新登入後自動提交。兩頁在 loading、error、readonly 或 session 失效時都會阻止寫入並取消舊 session 的待處理 dialog；新增模組時必須明確定義欄位所有權，避免 stale state 覆蓋其他頁面資料。

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
node --test tests/data-session-safety.test.mjs tests/collection-autofill-safety.test.mjs tests/tournament-sync.test.mjs tests/tournament-page-sync.test.mjs tests/tournament-sync-regression.test.mjs tests/collection-sync.test.mjs
node --experimental-vm-modules scripts/validate-site.mjs
node scripts/build-site.mjs
git diff --check
```

`scripts/validate-site.mjs` 驗證 JavaScript、inline script、本機資源、JSON 與退役功能界線。`tests/helpers/` 是測試輔助模組（依 Firebase SDK 11.2.0 交易重試規則撰寫的 Firestore mock，以及執行實際 `tournament.js`、`script.js` 儲存流程的 VM harness），不屬於正式網站，也不能取代 Emulator 驗證。`scripts/build-site.mjs` 先執行驗證，再將允許的靜態資源複製到 `.site-build/`。

### GitHub Pages

- Repository：`k89150-art/Beyblade-manager`。
- Production URL：`https://k89150-art.github.io/Beyblade-manager/`。
- 目前由 `main` 分支根目錄使用 legacy Pages build 提供。
- `.site-build/` 是本機驗證產物，不是 Pages 部署來源。

### Firebase workflows

- `.github/workflows/deploy-firestore-rules.yml`：手動部署 `k89150-web-login` 的 Firestore Rules。
- `.github/workflows/backup-recent-tournament-records.yml`：手動備份近期 `tournamentRecords` 到 `users/{uid}/recovery/`，或唯讀檢查既有備份。直接覆寫正式文件的還原（`restore_to_main`）已於 Phase 6C 停用：輸入、環境變數與程式路徑都已移除，唯一的寫入經 `write_recovery_document()` 限制在 recovery 集合；`tests/tournament-sync-regression.test.mjs` 以靜態檢查與實際執行內嵌 Python（模擬網路）驗證。

這些 workflow 涉及正式權限或資料，只有在使用者明確授權後才能執行。未來若需要還原，必須另立經審查的流程（輸入確認、先備份目前資料、updateTime 前提條件、只接受指定 backup_id）。

### Firebase Emulator 驗證

主頁與賽事頁的交易以本機 Firestore／Auth Emulator（`demo-beyblade-h2-test`，firebase 11.2.0、firebase-tools 13.35.1、Java 11 以上）驗證。工具與結果放在被 Git 忽略的 `exports/`：`firebase-emulator-h2/`（賽事 E01–E16）、`firebase-emulator-5b/`（主頁 M01–M15）、`firebase-emulator-6a/`（M01–M16，含 F-04）。這些工具不連線正式 Firebase，也不屬於正式網站。

### 正式資料備份紀錄

- 2026-11-02：使用者在本機備份兩份 `users/{uid}/appData/main` 文件，檔案 `C:BeybladeBackupseyblade-appData-backup-20261102-103649.json`（依交接紀錄，已通過 JSON、SHA-256 與讀回驗證）。這不是整個 Firebase 專案的備份。
- 備份檔不在 repository 內；不得修改、覆寫或刪除。備份工具在被 Git 忽略的 `exports/firestore-backup-tool/`。

## 7. 已知架構注意事項

- 專案沒有 package manager；不要為單一小改動擅自引入建置框架。
- Firebase 初始化目前有重複設定；這是既有狀態，不應在無專案任務時重構。
- 主頁邏輯集中於 `script.js`；修改時需做完整 regression，但不代表可任意重寫。
- 正式業務資料沒有本機 fallback；網路或 Firestore 錯誤必須明確呈現，不能假裝已同步。
- Competition JSON 可能保留研究 metadata；正式 UI 的內容政策仍以客觀統計為限。
