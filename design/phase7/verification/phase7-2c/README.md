# Phase 7-2c 整合驗證（瀏覽器）

目的：在真實瀏覽器排版下，以修改後的 `index.html`、`style.css`、`script.js`（原始碼切片）、`collection-view.js` 與真實型錄檔，驗證 V3（桌面清單／卡片）、原裝陀螺系列／來源篩選與排序、零件狀態篩選與排序，以及它們與既有搜尋、類別篩選的組合。只讀、不連 Firebase、不修改專案檔案。

## 使用的真實程式

與 `phase7-2b/` 相同的切片（建列、讀取、`sortTable`、`deleteRow`／`editRow`／`saveEditRow`、摘要、Phase 7-2a 顯示層與 Phase 7-2b 零件模型）。`collection-view.js` 的所有匯出都提供給切片。

替身：登入狀態、寫入 session、`saveData`（只計數）、`confirm`（記錄文字並依步驟回答）、`alert`。頁面初始化（不在切片內）中「類別 chip 與零件搜尋框呼叫 `applyInventoryFilters()`」的兩個監聽器，以相同寫法在 frame 內補上。隱藏窗格不執行 `requestAnimationFrame`，以計時器代替。

## 執行

```powershell
node design/phase7/verification/phase7-2c/serve-72c.mjs .
```

開啟 `http://127.0.0.1:4344/harness.html`，結果在 `window.__i72c`。依序執行 390／768／1440 寬 × 深色／米色。

## 結果（2026-11-24，Chromium，`main` = `151b2db` ＋ 未提交的 7-2c 修改）

6 組 × 37 項＝222/222 通過。主要內容：

| 項目 | 結果 |
|---|---|
| 控制項在顯示層啟用後出現；V3 切換只在桌面（≥ 821px）出現，手機固定卡片 | 通過 |
| V3 預設清單；切換後兩個分頁同時改變並存入 `localStorage`；`localStorage` 讀寫丟出例外時回到清單且照常顯示（B-05） | 通過 |
| 預設排序＝原始表格順序（與 `sortTable` 相同）；型號、名稱排序 | 通過 |
| 系列（BX／CX）、來源（手動／自動帶入）篩選與筆數文字 | 通過 |
| 搜尋 3-60＋BX＋自動帶入＋型號排序＝兩顆 BX-01；再改 UX 顯示「沒有符合條件的收藏」 | 通過 |
| 零件狀態（超用：軸心 R；已全用：含固鎖 3-60；可用）與 P2 模型一致；可用數量排序；類別＋搜尋＋排序組合 | 通過 |
| 每一步之後：`collectCurrentData()`、D-018 指紋、原始列順序（同一個 `<tr>` 物件）都不變，`saveData` 0 次，原始零件列沒有 `hidden`／`order` | 通過 |
| 篩選＋排序後按刪除：確認文字是畫面上那一列（BX-04、第二筆 F 額外列）；取消不變；確定時只刪那一列、儲存一次、其餘列順序不變 | 通過 |
| 換帳號重設（`resetCollectionViewState`）：搜尋、系列、來源、排序、類別、狀態回到預設，V3 偏好保留 | 通過 |
| 版面無水平捲動 | 通過 |

另以同一份程式重跑 `phase7-2b/`（只在本機暫時把 frame 的匯入清單改為全部匯出，跑完已還原、無 diff）：174/174 通過。
