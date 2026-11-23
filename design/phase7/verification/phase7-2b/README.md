# Phase 7-2b 整合驗證（瀏覽器）

目的：在真實瀏覽器排版下，以修改後的 `index.html`、`style.css`、`script.js`（原始碼切片）、`collection-view.js` 與真實型錄檔，驗證 P2（零件完整顯示）、U2（摘要）、S1（原裝陀螺搜尋）與 D1（刪除與修改提示）。只讀、不連 Firebase、不修改專案檔案。

## 使用的真實程式

- `index.html` 結構（移除 script）、`style.css`、`site-menu.css`。
- `script.js` 原始碼切片：建列、讀取、排序、`deleteRow`／`editRow`／`saveEditRow`／`cancelEditRow`、`getTotalParts`～`updateResponsiveTableCells`（含 `updateUiSummaries`）、`installUiSummaryObservers`、Q1、Phase 7-2a 顯示層與 Phase 7-2b 零件模型區塊。
- `collection-view.js`、`collection-sync.js`、`stock-catalog-names.js`（`attachCatalogNames` 套用真實型錄與中英名稱檔）。

替身：登入狀態、寫入 session、`saveData`（只計數）、`refreshSelectors`、`confirm`（記錄文字並依步驟回答）、`alert`。隱藏窗格不執行 `requestAnimationFrame`，以計時器代替。

## 執行

```powershell
node design/phase7/verification/phase7-2b/serve-72b.mjs .
```

開啟 `http://127.0.0.1:4343/harness.html`，結果在 `window.__i72b`。依序執行 390／768／1440 寬 × 深色／米色。

## 結果（2026-11-24，Chromium 156，`main` = `6f3f2b5` ＋ 未提交的 7-2b 修改）

6 組 × 29 項＝174/174 通過。主要內容：

| 項目 | 結果 |
|---|---|
| U2 摘要 id 顯示零件模型總數；舊 id 已移除；本資料黃金值 原裝 24／額外 7／引用 15／超用 1／無對應 3（依規則手算） | 通過 |
| P2 一種零件一張卡；固鎖 3-60＝2／2／4／0；軸心 R 超用 1；同名兩筆額外列各自有按鈕；只有原裝內含的卡沒有操作；CX 組合名稱不是零件；無對應引用列出軸心 LF | 通過 |
| S1 英文名（DranBuster／DranSword、Obi-Wan Kenobi）、手動列不能用英文名搜到、套組代碼與零件搜尋、無結果提示 | 通過 |
| 顯示操作不改資料、不儲存 | 通過 |
| D1 五種：刪除單顆（不足清單）、刪除套組（本資料沒有配置使用套組零件，確認文字不變）、刪除已不足的零件（「原本就不夠」）、減少數量、改名（找不到對應） | 通過（確認文字逐字比對） |
| D1 每次取消：資料與開始時相同、`saveData` 0 次 | 通過 |
| 確定路徑：刪除同名第二筆額外列，只刪該列、儲存一次、無提示 | 通過 |
| 版面無水平捲動 | 通過 |
