# 12｜Phase 7-DC：資料一致性修正（實作規格）

狀態：**已實作並驗收，本機 commit，未部署**（2026-11-24，ChatGPT 核准建立規格後直接實作；預計 v1.14.2，發布另行授權）。Phase 7-3b 的前置階段。決策紀錄：`docs/PROJECT_DECISIONS.md` D-023。

## 1. 範圍與原則

主頁的原始表格（`#beybladeTable`、`#partTable`、`#configTable`、`#historyTable`）是儲存來源：`getTableData`／`getHistoryData` 從儲存格讀值，D-018 在 `applyDataToTables` 之後立即以同一讀法取「畫面基準」。v1.14.1 盤點發現四項問題有共同根因——**顯示用的處理（延遲排序、型號格式化、依顯示狀態而變的 `innerText`）混進了權威資料或基準**。

原則：
- 修正讀取與載入時點，不改 D-018 的判定：不忽略順序或指紋差異、不無條件刷新基準、不放寬交易衝突判定。
- 不做隱性資料修復：載入、顯示、查詢或不相關的儲存都不得改變既有權威資料的原始值。
- 只動核准的函式；`collection-sync.js`、`data-session-guard.js`、F-04、D-015 升級條件、`assembly-rules.js`／D-019、`addConfig` 儲存格寫入段落、`checkStock`、`deleteRow`／`editRow`、Rules、Schema、型錄、競賽統計、Phase 7-2 顯示層都不改。不新增 Firestore 寫入路徑。

## 2. 四項問題與根因

| 代號 | 現象 | 根因 |
|---|---|---|
| A | 一次 `addConfig`（`restoreHistoryRow` 亦同）產生 2 次 commit | 新列以插入順序寫入；`installConfigSort` 的 MutationObserver 在 80 ms 後重排畫面，回音快照後 `scheduleCollectionSaveIfDirty` 判定「只差順序」再寫一次 |
| B | 未排序的雲端配置載入後，任何不相關的儲存都會連帶改寫 `configTable` 順序 | 配置表在 D-018 取基準**之後**才被延遲排序；收藏表則在 `applyDataToTables` 內、取基準之前排序，所以沒有此問題 |
| C | `UX-21-01 CUSTOM` 顯示為 `UX-21 -01 CUSTOM`，下次寫入配置表時存回 | `normalizeModel` 的第二段規則只取第一組數字，其餘當成後綴；`applyDataToTables` 結尾的 `normalizeAllModelCells` 把結果寫進儲存格 |
| D | 含連續空白、TAB 的值，載入後被判定為已修改 | `innerText` 依顯示狀態回傳不同結果：剛建立時（已渲染）摺疊空白，套用卡片樣式後（`display:none`）回傳原文；基準與之後的讀值不同。另外讀值一律 `trim()`，前後空白在下次儲存時被刪除 |

正式資料（2026-11-24 備份，唯讀統計，不輸出內容）：收藏與配置都已依現行規則排序；沒有連續空白、TAB、NBSP、前後空白或換行；**配置表已有 1 筆型號是 `UX-nn -nn …` 形式（C 已發生）**，列為待修復，本階段不修改。

## 3. 修正

### 3.1 A／B：配置表比照收藏表同步排序

- `applyDataToTables`：在既有 `sortBeybladeTable()` 後加 `sortConfigTable()`，排序完成後才由 `applyRemoteCollections` 取 D-018 基準。
- `collectCurrentData`：在既有 `sortBeybladeTable()` 後加 `sortConfigTable()`。每次收集（儲存、dirty 判斷、遠端規劃）都先把畫面排好，所以 `addConfig`／`restoreHistoryRow` 第一次寫入就是排序後順序。
- 移除 `installConfigSort`（MutationObserver＋80 ms 延遲排序）與 `scheduleConfigSort`：權威表格不再在基準之後被重排。
- 排序規則改為確定性的 `compareSortText`：依 UX→BX→CX→其他，再逐字比較（不分大小寫：`toUpperCase`），連續 ASCII 數字以數值比較（去前導零；數值相同視為相等），其他字元以 UTF-16 碼位比較。不呼叫 `localeCompare`，不依賴瀏覽器語系或 ICU 版本。相等時 `Array.prototype.sort` 為穩定排序，維持原相對順序。已以 2026-11-24 備份驗證：兩份文件的收藏表與配置表，新規則與現行 `localeCompare` 排出的順序完全相同（含 `BXG-42`／`BXG08` 這種標點與數字相鄰的情況），因此部署後不會因規則改變而重排既有資料。
- `sortTable` 既有的「編輯中不排序」條件保留。
- 結果：已排序資料載入零寫入；未排序資料載入後不變成未儲存，畫面基準就是排序後的畫面（與收藏表相同），等到下次真正修改配置表時才以排序後順序寫回；不相關的收藏／零件儲存不寫 `configTable`。

賽事頁配置選單（`tournament.js` `rebuildConfigOptions`）與使用者檢視頁直接使用儲存順序；儲存順序仍是同一套排序，選單順序不變。賽事紀錄以配置文字保存，不依位置，不受影響。

### 3.2 C：型號格式化

- `normalizeModel`：第二段規則先嘗試「多段型號＋空白或結尾」（`^(UX|BX|CX)\s*-?\s*(\d+(?:-\d+){1,2})(?=\s|$)`），保留全部數字組；不符合才用原本只取第一組數字的規則。
  - `UX-21-01 CUSTOM`、`BX-00-01 CUSTOM`、`UX-12-02 CUSTOM` → 原樣。
  - 已損壞的 `UX-21 -01 CUSTOM` → 原樣（**不修復**）。
  - 單段與無後綴的官方型號、`ux01`、`BX - 01` 等既有輸入 → 結果與修正前相同。
- 載入時不再呼叫 `normalizeAllModelCells`（函式一併移除）：儲存格保留雲端原值。正式資料以修正前的 `normalizeModel` 檢查也沒有任何一筆會被改變，因此移除後畫面不變。
- 不變：查詢、比對與基礎型號（`getBaseModelCode`、`getRandomBoosterBaseModel` 等）仍在使用處自行呼叫 `normalizeModel`；`addManualStockRow`、`saveEditRow` 對使用者輸入的正規化（既有輸入處理規則）；D-015 升級（`parseStockProductCode`／`stockRecordId`，不經 `normalizeModel`）。
- 已損壞的那 1 筆：維持 `UX-21 -01 CUSTOM`。修改該配置時 `buildInternalConfigModel` 以 `normalizeModel(既有型號)` 保留型號，因修正後的函式對此形式不做變更，也不會順帶修復。實際修復需另行授權。

### 3.3 D：與顯示狀態無關的讀值

修改前盤點（資料儲存格的內容來源）：
- 收藏、配置、零件、歷史的資料儲存格只由 `innerText` setter 寫入（`createBeybladeRow`、`createConfigRow`、`createPartRow`、`createHistoryRow`、`rebuildRow`、`saveEditRow`、`addConfig`）。setter 把換行轉成 `<br>`，其餘字元（空白、TAB、全形空白、NBSP、`<`、`&`）保存為文字節點。
- 操作按鈕、`collection-card-tags` 只在最後一欄（讀值排除最後一欄）；配置卡片的 `config-card-compact-content` 是加在 `<tr>` 上的 `<div>`，不在 `row.cells` 內；卡片標題、摘要以 `data-*` 屬性保存；編輯中的列（輸入框）走 `originalCells`。
- 所以資料儲存格只會有文字節點與 `<br>`。

`textContent` 驗證：能保留空白、TAB 與特殊字元且不受顯示狀態影響，但 **`<br>` 沒有文字，換行會遺失**，所以不能單獨使用。

修正（只在核准的讀取段落）：
- 新增 `readStoredCellText(cell)`：文字節點取原文、`<br>` 取 `"\n"`（`innerText` setter 的反向），**不 trim**；若儲存格出現文字與 `<br>` 以外的節點，退回原本的 `innerText.trim()`。
- `getTableData`：非編輯中的列改用 `readStoredCellText` 讀 9 欄與沒有 `data-stock-name` 時的 `mainStockName`；編輯中的列維持 `getPersistedRowCells`（`originalCells`）。
- `getHistoryData`：7 個欄位改用 `readStoredCellText`。
- 不全域取代 `innerText`：顯示層與確認文字仍用原讀法。（`getPersistedRowCells`、`getStockNameFromCell` 原本也留用舊讀法，後由 §3.4 追加修正改為 `readStoredCellText`。）
- 排序鍵（`sortTable`）也改用 `readStoredCellText(...).trim()`，排序不受顯示狀態影響。

已知限制：`\r\n` 與 `\r` 經 `innerText` setter 都變成 `<br>`，讀回為 `"\n"`（正式資料沒有換行）。原本被讀成 `"-"` 的空白歷史欄位（`createHistoryRow` 以 `|| "-"` 顯示）行為不變。

### 3.4 追加修正（2026-11-24，ChatGPT 核准）：編輯流程與庫存名稱身分

補測（真實頁面＋Emulator）發現兩個資料安全問題：
1. **編輯流程**：`editRow`（受保護）以 `innerText.trim()` 取原值與預填值；零件列是渲染中的列，連續空白、TAB 被摺疊、前後空白被刪除。取消會以這些值重建該列、之後不相關的儲存一併寫回；不修改直接儲存、只改數量也會把名稱存成摺疊後的值。
2. **庫存名稱**：`getTotalParts`／`getUsedParts`（受保護）以 `getPersistedRowCells`／`getStockNameFromCell` 的 `innerText` 讀名稱，比對鍵依各表的顯示狀態而不同（零件列摺疊、配置與收藏列為 `display:none` 的原文）；選單值取自這些鍵，新配置存成摺疊名稱，而存原始名稱的配置對不上零件（引用 0、可用 1、可再選＝可能超用）。

修正：
- **編輯流程**（`window.editRow`→`rebuildRow` 段落）：`editRow` 以 `readStoredCellText` 取原值（不 trim）、輸入框預填原值，並另存編輯器開啟後各控制項的初始值（`editInitialValues`；輸入框無法保存換行等，故不假設 `defaultValue` 等於原值）；`saveEditRow` 對控制項仍為初始值的欄位保留原值，只有改過的欄位才套用既有規則（trim、空白存 `-`、數量轉數字、型號正規化）；取消以原值重建。D1 確認、session、stale-row、同步防護不變。
- **庫存名稱身分**：零件身分為「類別＋原始名稱」精確比對。`getPersistedRowCells`、`getStockNameFromCell` 改用 `readStoredCellText`，所以 `getTotalParts`、`getUsedParts`、`getUsedPartsExceptRow`、7-2b 零件模型、D1 影響提示（函式本體都未修改）在任何顯示狀態下用同一個鍵；不同空白的名稱獨立計算，庫存公式與 CX、抽包、一體式、空值、`-` 等規則不變。
- **選單**：`refreshSelectors` 的選項值是原始名稱，顯示文字另以 `formatPartNameForMenu` 標出會被隱藏的空白（␣ 連續或前後空白、⇥ TAB、⍽ NBSP、↵ 換行）；`populateConfigEditorFromRow` 以原值選取，`addConfig` 存入使用者選的原始名稱（`addConfig` 儲存格寫入段落、`checkStock` 未修改）。
- **拆解／還原**：`buildHistoryRecordFromConfigRow`、`getConfigComboKeyFromRow` 以 `readStoredCellText` 讀配置；`normalizeComboValue` 保留原值（空白或 `-` 仍為 `-`），還原時引用同一個零件。
- 不自動修復舊配置：舊選單存成摺疊名稱的配置，若沒有完全相符的零件，顯示為「無對應的配置引用」，不扣其他零件的庫存。
- CRLF／LF 維持既有限制（見 §7）。

## 4. 受保護區段

A-09 原有 10 段中有四段因本規格（含 §3.4 追加修正）改變，其餘 6 段與 `addConfig` 儲存格寫入（`da046a3d56a07519`）、`checkStock`（`0bed51c10a056c87`）雜湊不變。

| 段落 | 原雜湊 | 新雜湊 | 變更 | 理由 |
|---|---|---|---|---|
| `function getTableData(` → `D-018 collection saves: begin`（含 `collectCurrentData`、`getHistoryData`，新增的 `readStoredCellText` 也在此段） | `383aeb872526af0b` | `02f67bb21e597b3e` | `getTableData`／`getHistoryData` 改用 `readStoredCellText`；`collectCurrentData` 加 `sortConfigTable()` | D、A／B |
| `function applyDataToTables(` → `function startCloudListener(` | `0d4c7a0a11b52e65` | `08c1de72b2266fec` | 移除 `normalizeAllModelCells()`，加 `sortConfigTable()` | C、B |
| `window.editRow = function` → `function rebuildRow(`（`editRow`、`saveEditRow`、`cancelEditRow`） | `8be3b0baca010150` | `3ec54b27ec414e19` | 原值以 `readStoredCellText` 取得、另存控制項初始值；未修改欄位保留原值；清除 `editInitialValues` | §3.4 編輯流程 |
| `function getStockNameFromCell(` → `function escapeHtml(`（含 `getPersistedRowCells`） | `bf558aecdc0ad038` | `c1230e4d43e39ba2` | 兩處讀值改為 `readStoredCellText` | §3.4 庫存名稱身分 |

`index.html` 的 `script.js` 快取參數改為 `20261124-phase7dc`；`SITE_VERSION` 不變（v1.14.1）。

## 5. 驗收條件

資料一致性：
- 載入後等待 ≥ 200 ms，D-018 指紋穩定、沒有 dirty 資料表；已排序與未排序原始資料都測。
- 不相關的收藏、零件操作不寫 `configTable`；除明確授權的操作外，原始資料內容不變。
- 型號（`UX-21-01 CUSTOM`、`BX-00-01 CUSTOM`、`UX-21 -01 CUSTOM`、單段型號）與空白（連續半形、TAB、全形、NBSP、前後空白、換行、HTML 特殊字元）不被改寫。
- 真實頁面在 390／820／821／1440、深色與米色、清單與卡片、可見／clip／`display:none` 下讀值與指紋一致。

真實交易與跨裝置（Firebase Emulator 真實頁面；寫入次數以實際成功的 Firestore commit 請求計數，不以前後 `updateTime` 推斷）：
- `addConfig`、`restoreHistoryRow` 各一次有效寫入；載入與純顯示操作零寫入；不相關操作只寫預期資料表。
- 兩裝置真正修改同一配置表時仍衝突，不覆蓋另一裝置。
- 登出、帳號切換與未儲存資料保護維持原行為。

回歸：全部 Node 測試；Phase 7-2 整合回歸 505/505；D-019 `addConfig` 接線測試；D-018／F-04 Emulator M 系列；H-1／D-015 型錄安全測試；賽事頁配置選單；validate、build、`git diff --check`。四項修正各有反向（突變）測試。

## 6. 驗收紀錄

見 `design/phase7/verification/phase7-dc/README.md`。第一階段摘要：Node 407/407（新增 24 項，含 7 項突變）；Emulator 真實頁面 8 組寬度×主題載入與顯示 0 次 commit、不相關操作只寫 `partTable`，`addConfig`／`restoreHistoryRow` 各 1 次 commit，兩裝置同時修改配置表時衝突且不覆蓋，登出／換帳號不寫入；換回修正前程式時同一操作會改寫型號與空白（反向檢查）；Phase 7-2 回歸 505/505；M01～M16 PASS。

追加修正摘要：Node 425/425（新增 18 項，含 6 項突變）；Emulator 真實頁面編輯取消／未修改儲存 0 次寫入、只改數量名稱原樣；選單分開列出相似名稱、配置存入原始名稱、庫存耗盡後直接送出仍阻擋、修改／拆解／還原各 1 次寫入且名稱原樣、D1 提示依精確名稱；正式備份修改前後離線比對：庫存、引用、零件模型、選單完全相同，0 次寫入；Phase 7-2 回歸、M01～M16 見驗收紀錄。

## 7. 剩餘風險

- 收藏顯示層（Phase 7-2）與 `deleteRow` 確認標題的名稱顯示會摺疊空白：兩個只差空白的零件在零件清單中看起來同名（各自獨立計數，選單以 ␣ 等標記區分）。
- CRLF／LF（已知限制）：同一資料表因其他列變更而重新儲存時，原 CRLF 會轉為 LF；不新增 Schema、dataset 原值保存或全域換行轉換。
- 收藏顯示層（Phase 7-2，`collection-view.js`）的預設排序仍用 `localeCompare`（只影響畫面）；與新規則在正式資料與測試樣本上相同。
- `createHistoryRow` 以 `|| "-"` 顯示空白欄位，讀回為 `"-"`：既有行為，未變更。
- `\r\n`、`\r` 經 `innerText` setter 後讀回為 `\n`。
- 正式資料中已損壞的 1 筆型號維持原值，修復需另行授權。
- 未在 Safari／iOS 實機驗證 `childNodes` 讀法（標準 DOM API）。
