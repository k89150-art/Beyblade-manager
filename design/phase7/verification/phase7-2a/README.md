# Phase 7-2a 整合驗證（瀏覽器）

目的：在真實瀏覽器排版下，以**修改後**的 `index.html`、`style.css`、`script.js`（原始碼切片）與 `collection-view.js` 驗證分頁、R2 顯示層、Q1、D-020 與 K-1。只讀、不連 Firebase、不修改專案檔案。

## 使用的真實程式

`frame.html` 從專案讀取（`/repo/…` 對應專案根目錄）：

- `index.html` 結構（移除 script）、`style.css`、`site-menu.css`。
- `script.js` 原始碼切片：建列與讀取（`createBeybladeRow`…`clearAllTables`、`getPersistedRowCells`、`getTableData`、`collectCurrentData`）、排序、`deleteRow`／`editRow`／`saveEditRow`／`cancelEditRow`／`rebuildRow`、`getTotalParts`～`updateResponsiveTableCells`（含 `applyInventoryFilters`）、`installUiSummaryObservers`、Q1 的 `resetQuickAddFormsForAccountChange`、以及整個 `Phase 7-2a collection view (R2)` 區塊。
- `collection-view.js`、`collection-sync.js`（`fingerprintTable`）、`stock-catalog-names.js` 直接 import。

替身：登入狀態（`currentUser`）、寫入 session、`saveData`（只計數，不寫入）、`refreshSelectors`、`confirm`／`alert`（記錄並回答「確定」）。隱藏的瀏覽器窗格不執行 `requestAnimationFrame`，驗證時以計時器代替。

## 執行

```powershell
node design/phase7/verification/phase7-2a/serve-72a.mjs .
```

開啟 `http://127.0.0.1:4342/harness.html`，結果在 `window.__i72a`。7 個 iframe 依序執行：390／768／1440 寬 × 深色／米色（各 29 項）＋ 初始化失敗回退（5 項）。

## 結果（2026-11-24，Chromium 156，`main` = `50169d7` ＋ 未提交的 7-2a 修改）

全部 179 項通過（6 × 29 ＋ 5）。主要內容：

| 項目 | 結果 |
|---|---|
| K-1：原始表格容器為 clip＋`inert`＋`aria-hidden`；表格與容器沒有 `display:none`／`visibility`／`hidden` | 通過 |
| A-04：顯示層啟用（clip）後 `collectCurrentData()` 與啟用前（可見）完全相同（cells、mainStockName、metadata、未知欄位、順序、四表指紋） | 通過 |
| A-01／A-02：切換分頁 10 次、方向鍵／Home、hash（`#inventorySection`、`#add-collection`）、收合表單、篩選、搜尋後，每一步資料與指紋相同；原始 `<tr>` 的元素與順序不變；篩選不再隱藏原始列 | 通過 |
| A-05：以上操作 `saveData` 呼叫 0 次 | 通過 |
| R2：一列一項（同款三顆、套組兩顆各自分開）、分頁數量、篩選只作用在顯示層 | 通過 |
| D-020：`#add-part` 切到零件、展開、聚焦 `#partName`；`#add-collection` 切到原裝陀螺、展開、聚焦 `#model` | 通過 |
| Q1：收合後重新展開保留同一個輸入元素與內容；同 UID 保留；A→B 清空表單（類別回到「上蓋」）並重設搜尋與篩選；資料不變 | 通過 |
| K4-01：從顯示層刪除同款三顆中的第二顆，被移除的正是第二個原始列；其餘保留未知欄位 | 通過 |
| K4-06：刪除套組任一顆，走既有套組確認並一起刪除 | 通過 |
| K4-04：原始列內容在清單畫出後改變，按刪除時不刪、提示 | 通過 |
| K5：修改額外零件時顯示原始表格（解除 clip 與 inert）並聚焦該列；保存走 `saveEditRow`（一次儲存）；完成後恢復 clip；Esc 走 `cancelEditRow` 還原、不儲存 | 通過 |
| A-08：顯示層初始化失敗 → 回到原始表格介面（兩區段顯示、分頁列隱藏），資料不變，不儲存 | 通過 |
| 版面：沒有水平捲動 | 通過 |

## 附帶發現（既有行為，與 7-2a 無關）

`frame.html?mode=probe`：同一頁面在「剛建立原始列」與「第一次 `refreshUi`（卡片樣式）之後」，`collectCurrentData()` 對**收藏上蓋欄與配置上蓋欄中含連續空白或 TAB 的值**結果不同（前者被摺疊，後者保留原值）。正式網站的 D-018 會在 `applyDataToTables` 之後立即取畫面基準，因此這類資料載入後可能被視為有變更。官方型錄名稱不含連續空白或 TAB，只影響使用者自行輸入的名稱。7-2a 未改變這個時序（K-1 已證明 clip 與可見結果相同）；修正需要調整 D-018 的基準時點，不在本階段範圍。
