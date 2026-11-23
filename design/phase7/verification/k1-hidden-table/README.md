# K-1 隔離驗證：原始表格隱藏方式

目的：確認 Phase 7-2（R2）把 `beybladeTable`、`partTable` 隱藏後，`getTableData()`／`collectCurrentData()` 的結果與「表格可見」時完全相同。只讀、不連 Firebase、不修改正式網站檔案。

## 使用的真實程式

`frame.html` 從專案讀取以下檔案（`/repo/…` 對應專案根目錄，唯讀）：

- `index.html`：真實頁面結構（移除 `<script>` 後放入）與它引用的本機樣式表（`style.css`、`site-menu.css`）。
- `script.js`：以函式標記切出**原始碼本身**後在瀏覽器執行（與 `tests/*.test.mjs` 相同做法）：
  `partTypes`～`getInventoryTypeDisplayRank`、`getSeriesFromModel`、`TABLE_SORT_ORDER`／`sortTable`／`sortBeybladeTable`、`getStockNameFromCell`／`getPersistedRowCells`／`getPersistedStockName`／`escapeHtml`／`getOperationButtons`、`createHistoryRow`、`getTableData`／`collectCurrentData`／`getHistoryData`、`STOCK_ROW_METADATA_KEYS`～`clearAllTables`（含 `createBeybladeRow`、`createPartRow`、`createConfigRow`、`getStoredItemExtras`）、`inventoryTypeMatchesFilter`～`updateResponsiveTableCells`（含 `applyInventoryFilters`）。
- `collection-sync.js`：`fingerprintTable`、`pickCollectionTables`（ES module 直接 import）。
- `stock-catalog-names.js`：卡片標題用到的三個函式。

替身（stub）只有：`isReadOnly() → false`、`dataSessionGuard.captureWriteSession() → {}`、`currentUser = null`、空的 `stockProductsByRecordId`。載入順序與 `applyDataToTables` 相同（收藏 → 零件 → 歷史 → 配置 → `sortBeybladeTable`）；型錄升級、`normalizeAllModelCells`、`refreshSelectors` 不在範圍內。載入後與正式頁面一樣執行 `updateResponsiveTableCells()`、`applyInventoryFilters()`。

## 執行方式

```powershell
node design/phase7/verification/k1-hidden-table/serve-k1.mjs .
```

瀏覽器開啟 `http://127.0.0.1:4341/harness.html`，結果放在 `window.__k1` 與頁面上方。harness 以 390、1440 寬 × 深色、米色 × 7 種狀態，共 28 個 iframe 執行。

## 結果（2026-11-24，Chromium 156，`main` = `50169d7`）

基準：可見、1440 寬、深色。比對 `cells`、`mainStockName`、metadata、未知欄位、列順序與 `fingerprintTable` 四表指紋。

| 狀態 | 結果 |
|---|---|
| 可見（390／1440 × 深色／米色） | 4 組彼此完全相同 |
| **視覺隱藏容器（clip-path，`aria-hidden`＋`inert`，同時隱藏兩個區段）** | **4 組與基準完全相同** |
| 零件篩選「軸心」（現行 `applyInventoryFilters`） | 相同（本組被隱藏的列不含連續空白，不能證明篩選安全，見下一列） |
| 每列 `row.hidden`（現行篩選使用的方式） | **不同**：`partTable` 名稱「雙␣␣空白」可見時存成「雙␣空白」，隱藏時存成「雙␣␣空白」 |
| 表格 `display:none`、區段 `hidden` | **不同**：同上 |
| `visibility:hidden` | **嚴重不同**：所有儲存格 `innerText` 變成空字串（會清空資料），絕對禁止 |

固定不變的項目（所有狀態都相同）：同款三顆的順序與各自的未知欄位、套組兩顆的 `stockSetInstanceId`、CX 三件 `mainStockName` 的連續空白、CX 分件 `mainStockName = ""`、`stockAutoFilled:false` 的保留、收藏表內連續空白／全形空白／NBSP／TAB。

K-7 黃金值（同一份資料，執行現行 `updateUiSummaries()`）：`inventoryKinds` 4、`inventoryTotal` 8、`inventoryUsed`（舊「使用中」）2、`inventoryAvailable` 6。真實 `getUsedParts()` 含 CX 配置的組合上蓋 `上蓋|紋章鎖金屬超越S: 1`，`getTotalParts()` 沒有此鍵。排除後的「配置引用」加總為 9。

註：第一次執行時，測試資料把 BX／UX 的上蓋名稱也放進主要戰刃欄（與正式資料不符，正式資料該欄為「-」），已修正後重跑；上表為修正後結果，結論與第一次相同。

可見狀態下，資料「進入表格再收集」本身已有的變化（**現行正式網站就存在，與 R2 無關**）：

- 收藏儲存格內的換行被移除（「換行\n字元」→「換行字元」；`mainStockName` 保留換行）。
- 收藏儲存格前後空白被去除（`trim`）。
- 零件名稱、歷史測試的組合與備註，連續空白被摺疊成一個。

## inert 與 `click()`（K-2 附帶檢查）

Chromium 156：對 `inert` 容器內按鈕呼叫 `click()` 或派送 click 事件，`onclick` 仍會執行；按鈕無法取得焦點。其他瀏覽器（Safari／iOS）未測；規格仍規定直接以按鈕元素呼叫既有函式，不依賴點擊。
