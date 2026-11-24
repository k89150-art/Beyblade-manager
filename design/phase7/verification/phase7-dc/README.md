# Phase 7-DC 驗證紀錄（D-023 資料一致性）

日期：2026-11-24。基準 `21a9318`＋7-DC 修改。規格：[`../../12-data-consistency-spec.md`](../../12-data-consistency-spec.md)。正式 Firestore 沒有任何寫入；只讀取本機備份做統計（不輸出內容）。

## 1. 修改前的確認

- 排序規則：`compareSortText` 與舊 `localeCompare("zh-Hant", { numeric: true, sensitivity: "base" })` 對 2026-11-24 備份兩份文件的收藏表與配置表排出完全相同的順序；17 個樣本（含 `BXG-42`／`BXG08`、`BX-2`／`BX-10`、`bx-02`、`其他`）也相同（`tests/data-consistency.test.mjs`）。
- 資料儲存格盤點（規格 §3.3）：資料儲存格只由 `innerText` setter 寫入；按鈕、卡片標籤只在最後一欄；配置卡片內容是 `<tr>` 上的 `<div>`，不在 `row.cells`。`textContent` 會遺失 `<br>` 換行，所以採 `readStoredCellText`（文字節點＋`<br>`→`\n`）。
- 正式資料（備份統計）：全部已排序；無連續空白、TAB、NBSP、前後空白、換行；配置表 1 筆 `UX-nn -nn …`（C 已發生，待修復，不修改）。

## 2. Node（`tests/data-consistency.test.mjs`，24 項，真實 `script.js`＋mock Firestore）

| 項目 | 結果 |
|---|---|
| A `addConfig`、`restoreHistoryRow` | 各 1 次 commit，第一次就是排序後順序；回音快照與 250 ms 後沒有第二次寫入、沒有未儲存表 |
| B 已排序資料 | 載入、等待、重收同一份快照：0 次交易 |
| B 未排序資料 | 載入當下與 250 ms 後都沒有未儲存表；不相關的零件、收藏儲存不寫 `configTable`，雲端順序不變；`applyDataToTables` 返回時畫面已排序 |
| B 衝突 | 未排序雲端＋另一裝置已改配置，本頁新增配置 → 衝突、0 次 commit、雲端原樣 |
| B 排序規則 | 相同鍵保持原順序；`localeCompare` 呼叫 0 次 |
| C | `normalizeModel` 14 組輸入（含 `UX-21-01 CUSTOM`、`BX-00-01 CUSTOM`、`UX-21 -01 CUSTOM`、`ux01 custom`、`UX-21-01A`）與冪等；`getBaseModelCode` 不變；載入保留原值、不相關儲存保留、修改配置保留型號（損壞的不修復）、新建得到完整型號 |
| D | 儲存格「已渲染（摺疊空白）」與「`display:none`（原文）」兩種讀法下讀值相同、無未儲存表；不相關儲存只寫自己的表，連續空白、TAB、全形、NBSP、前後空白、換行、`<b>&amp;` 原樣；`readStoredCellText` 單元（含 CRLF→LF、其他標記退回舊讀法） |
| 賽事頁 | 以 `tournament.js` 的 `rebuildConfigOptions` 讀儲存順序：新增配置後既有項目相對順序不變，選單為排序後順序 |
| 突變（7 項） | 拿掉 `collectCurrentData` 的排序、恢復 80 ms 延遲重排（兩種情境）、拿掉 `applyDataToTables` 的排序、改回 `localeCompare`、改回只取第一組數字、載入時正規化型號、改回 `innerText.trim()`：對應測試全部失敗 |

既有測試調整：
- `tests/config-assembly-wiring.test.mjs`：7-3a 固定「只差順序」的已知問題那一項，改為驗證正確行為（新增後無未儲存表、真正修改配置仍與另一裝置衝突且不覆蓋）；原始重現保留在 `../phase7-3a/`。
- `tests/collection-view.test.mjs`：A-09 兩段雜湊更新（見 §5）；`sortTable` 測試改用新的切片範圍與 `childNodes`。
- `tests/collection-autofill-safety.test.mjs`、`tests/collection-parts.test.mjs`、`phase7-2-regression/frame.html`、`phase7-2d/frame.html`：切片結尾從已移除的 `normalizeAllModelCells` 改為下一個宣告；H-1 測試環境補上 `sortConfigTable`（與既有 `sortBeybladeTable` 相同為空函式，H-1 的配置表為空）與 `childNodes`。沒有修改任何斷言。
- `tests/helpers/config-page-harness.mjs`：不再呼叫已移除的 `installConfigSort`；儲存格提供 `childNodes`（模擬 `innerText` setter）與「已渲染／`display:none`」兩種 `innerText` 讀法。

`../phase7-3a/sort-repro.mjs` 在新程式的輸出：四個情境 250 ms 後都沒有未儲存表；`addConfig` 後的不相關儲存只寫 `partTable`；未排序雲端資料的順序維持不變（修正前的輸出保留在 `../phase7-3a/README.md`）。

## 3. Firebase Emulator 真實頁面（`exports/emulator-ui-7dc/`，Git 忽略）

完整網站建置複本（`demo-beyblade-7dc-ui`，Auth 9299、Firestore 8285），只改 Firebase 設定、Emulator 連線與 redirect 登入；`collection-sync.js` 等與專案逐位元組相同。測試帳號 tester-a／tester-b@example.test 只存在 Emulator。資料含連續空白、TAB、NBSP、前後空白、全形空白、換行、`<b>&amp;`、`UX-21-01 CUSTOM`、`UX-21 -01 CUSTOM`、`BX-00-01 CUSTOM`、CX 四件。

**寫入次數**以實際送出的 Firestore commit 計數：頁面內攔截 `POST …/documents:commit`（XHR／fetch）記錄 HTTP 狀態與每次寫入的欄位，並以瀏覽器網路紀錄逐筆核對（全程共 16 筆 commit 請求：15 筆 200、1 筆 400，與下表各操作逐筆對應，另有 1 筆是確認攔截方式時的零件新增），不以前後 `updateTime` 推斷。

| 情境 | 結果 |
|---|---|
| 載入＋等待 ≥ 300 ms＋切換收藏／零件分頁＋清單／卡片（桌面）：390／820／821／1440 × 深色／米色，共 8 組 | 每組 0 次 commit；之後新增一個零件：每組恰好 1 次 commit（200），只寫 `partTable`（＋`ownerUid`／`ownerEmail`／`updatedAt`），2.5 秒內無第二次寫入；Console Error 0 |
| 同上，儲存後讀回 Emulator 文件 | `partTable` 的 `雙  空白`、`換\n行`、`<b>&amp;` 原樣；其他表未被寫入 |
| `addConfig`（地獄鐮刀＋4-60＋T，排在中間） | 1 次 commit，只寫 `configTable`；雲端順序＝畫面順序；`UX-21 -01 CUSTOM`、`BX-00-01 CUSTOM`、空白值原樣；3.5 秒內無第二次 |
| `restoreHistoryRow` | 1 次 commit，只寫 `configTable` |
| 未排序雲端資料 | 畫面已排序；載入與顯示 0 次 commit；新增零件只寫 `partTable`，雲端配置順序不變 |
| 兩裝置同時新增配置（同帳號，第二裝置為獨立 iframe 頁面，同一 JS 工作內同時按儲存） | 裝置 B commit 200；裝置 A commit 400（前置條件失敗）→ D-018 衝突提示「其他裝置已修改「配置紀錄」…」，之後沒有任何寫入；雲端只有 B 的新增，A 未覆蓋 |
| 衝突保留中登出 → 以 tester-b 登入 | 既有「尚未儲存…確定要登出嗎」確認；登出、換帳號 0 次 commit；tester-b 無文件；tester-a 文件不變 |
| 反向檢查：同一複本換回修正前的 `script.js`（`21a9318`） | 畫面型號顯示為 `UX-21 -01 CUSTOM`、`BX-00 -01 CUSTOM`；新增一個零件時同一次 commit 另外改寫 `beybladeTable`、`configTable`：雲端被存成 `UX-21 -01 CUSTOM`／`BX-00 -01 CUSTOM`、`前後空白`（被 trim）、零件 `雙 空白`（被摺疊）。修正後同一操作只寫 `partTable` |

診斷（非判定依據）：各寬度載入後 166 個資料儲存格中 133 個為 `display:none`，有 4 個儲存格的 `innerText` 與原值不同——舊讀法會受影響的正是這類儲存格。

## 4. 其他回歸

| 項目 | 結果 |
|---|---|
| Node 全部 17 個測試檔 | 407/407 |
| Phase 7-2 整合回歸（`phase7-2-regression/`） | 505/505（a 4×32、b 4×31、c 4×38、d 2×24＋2×23、fail 7；same 273、entry 108、design 12、added 112） |
| D-018／F-04 Emulator M 系列（`exports/firebase-emulator-7dc/`，自 6a 複製，只把 HEAD 檢查改為 `21a9318`、測試清單改為目前 17 檔） | M01～M16 PASS 16／FAIL 0（真實 SDK＋Emulator；頁面為 harness） |
| D-019 `addConfig` 接線（`tests/config-assembly-wiring.test.mjs`） | 16/16（含 `addConfig` 儲存格寫入 `da046a3d56a07519`、`checkStock` `0bed51c10a056c87` 雜湊不變） |
| H-1／D-015（`tests/collection-autofill-safety.test.mjs`） | 全部通過，斷言未改 |
| validate／build／`git diff --check` | PASS／PASS（35 files）／PASS |
| 寫入路徑 | `saveData()` 17、`runTransaction(` 1；`setDoc`／`updateDoc`／`deleteDoc` 0 |
| 受保護檔案 | `collection-sync.js`、`data-session-guard.js`、`assembly-rules.js`、`collection-view.js`、`style.css`、`tournament.js`、`site-menu.js`、`firestore.rules` 未修改 |

## 5. 受保護區段雜湊

| 段落 | 原雜湊 | 新雜湊 | 實際變更 | 理由 | 測試 |
|---|---|---|---|---|---|
| `function getTableData(` → `D-018 collection saves: begin` | `383aeb872526af0b` | `02f67bb21e597b3e` | `getTableData`：非編輯列以 `readStoredCellText` 讀 9 欄與後備 `mainStockName`；`collectCurrentData`：加 `sortConfigTable()`；`getHistoryData`：7 欄改用 `readStoredCellText`；新增 `readStoredCellText` | D；A／B | D 與 A 各項、突變 A、D |
| `function applyDataToTables(` → `function startCloudListener(` | `0d4c7a0a11b52e65` | `08c1de72b2266fec` | 移除 `normalizeAllModelCells()`，加 `sortConfigTable()`，註解 | C；B | C 載入、B 載入、突變 B、C |

A-09 其餘 8 段（D-018 儲存、D-015 三段、`getStockNameFromCell`…`escapeHtml`、`deleteRow`、`editRow`、F-04 草稿、`getTotalParts`）與 7-3a 的兩段雜湊不變。另修改但不在 A-09 的程式：`normalizeModel`、`compareSortText`（新增）、`sortTable`、`sortConfigTable`，以及移除 `normalizeAllModelCells`、`scheduleConfigSort`、`installConfigSort` 與其呼叫。
