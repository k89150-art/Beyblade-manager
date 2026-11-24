# Phase 7-3b 驗證紀錄（配置顯示層，本機實作，未 commit）

日期：2026-11-25。基準 `568df18`（v1.14.2 部署結案）＋7-3b 本機修改。規格：[`../../11-phase7-3-assembler-spec.md`](../../11-phase7-3-assembler-spec.md) §4、D-022。

## 實作範圍

- 新檔 `config-view.js`（純函式，無 DOM／儲存／Firestore）：結構判斷（標準三件式、CX 三件、CX 四件、固鎖一體上蓋、Tr・Op 軸心；固鎖一體判斷沿用 `assembly-rules.js` 匯出）、零件列表（原始名稱）、搜尋（上蓋／組合、各零件、型號；忽略大小寫與空白）、系列與結構篩選、排序（預設＝表格順序，即 `sortTable` 的 UX→BX→CX；上蓋名稱）、控制項正規化、拆解紀錄搜尋、清單提示。
- `script.js` 新區塊「Phase 7-3b config view」（位於 7-2b 區塊之後）：比照 7-2 R2／7-2d——原始 `#configTable`／`#historyTable` 以 clip 隱藏（`setSourceBoxHidden`，不使用 `display:none`／`hidden`／`visibility:hidden`），顯示層從原始列快照（`getPersistedRowCells`、`readStoredCellText`）渲染、只寫在被觀察的 tbody 之外；「我的配置／拆解紀錄」分頁（A5：只改顯示文字，`historyTable` 不變）；桌面清單／卡片（獨立 localStorage key `beybladeConfigViewMode`，try/catch）；桌面詳細面板（≥ 821px）與手機 sheet（≤ 820px），焦點限制、Esc、關閉後焦點回到項目；面板內容：零件（原始名稱，以 ␣⇥⍽ 標出空白）與各零件可用／超用／無對應（7-2b 零件模型，只讀）、結構、既有違規警告（`evaluateAssembly`，只提示）、拆解紀錄中的相同組合（組合鍵）；操作只在面板：修改→`window.editRow(按鈕, "config")`（組裝器）、拆解→`window.deleteRow`（原因視窗）、還原→`restoreHistoryRow`、刪除紀錄→`deleteHistoryRow`，執行前做新鮮度檢查（列仍在原表、簽章相同），使用原始列自己的按鈕、不以合成點擊觸發 inert 內的按鈕；遠端重建時選取失效並提示；換帳號（Q1 重設）時清除搜尋、篩選與選取；收藏顯示層退回表格時配置顯示層也退回。
- 接線：`installUiSummaryObservers` 的 `refreshUi` 呼叫 `scheduleConfigViewRender`；`resetCollectionViewState` 呼叫 `resetConfigViewState`（`typeof` 保護）；`DOMContentLoaded` 呼叫 `installConfigView`。
- `index.html`：配置分頁列、配置與拆解紀錄的搜尋工具列、清單、面板（皆使用 `data-config-*`，不與收藏顯示層的 `data-view-mode` 等屬性相交）；原始兩個表格移到分頁區塊之外的 `#configSourceTables`（表格本身標記不變）；拆解紀錄標題改「拆解紀錄」。快取：`script.js`、`style.css` 改 `20261125-phase73b`，`config-view.js?v=20261125-phase73b`。
- `style.css`：新增配置清單模式（`data-config-mode`，只在桌面）、違規標籤、面板零件庫存與警告樣式；其餘沿用 7-2 的 `.cv-*`。

未修改：`collection-view.js`、`collection-sync.js`、`data-session-guard.js`、`assembly-rules.js`、`tournament.js`、Rules、Schema；資料一致性與交易核心（A-09 十段雜湊皆為 Phase 7-DC 後的核准值）；`addConfig` 儲存格寫入、`checkStock`。沒有新增寫入路徑。未實作 7-3c 組裝器與 7-3d 快速建立。

## Node（`tests/config-view.test.mjs`，14 項；全部 18 檔 439/439）

| 項目 | 結果 |
|---|---|
| 純函式 | 結構、零件順序與原始名稱、標題、搜尋（零件、型號、大小寫、空白）、系列＋結構篩選、預設排序維持表格順序、上蓋名稱排序、控制項、獨立 V3 key、分頁 hash、提示、拆解紀錄搜尋；`config-view.js` 不含 DOM／儲存／寫入 |
| 標記 | 分頁保留 `configSection`／`historySection`；原始表格不在分頁內、來源區不以 `hidden` 等隱藏、表頭不變；不使用收藏顯示層的屬性 |
| 程式 | 顯示層只讀列、不寫儲存格／列／儲存，操作只呼叫既有函式且有新鮮度檢查 |
| 真實 `script.js`（記憶體頁面＋mock Firestore，渲染讀法） | 搜尋、篩選、排序、清單／卡片、分頁、選取與關閉：0 次交易、無未儲存表、雲端與 `getTableData` 結果逐字相同（含特殊空白）；面板顯示原始名稱、各零件庫存、違規警告、相同組合紀錄；修改經既有組裝器開啟同一列；列變更後操作被擋（提示、不開啟）；從拆解紀錄還原 1 次寫入；遠端重建後面板提示並清除選取；換帳號重設 |

測試環境調整：`tests/helpers/config-page-harness.mjs` 注入 `config-view.js`、假元素加 `toggleAttribute`、儲存格可找到 `<button onclick=…>`（寫入按鈕依 session 可寫入與否，比照 `updateDataAccessUi`）、公開 `configViewState` 與可寫入狀態；`tests/collection-view.test.mjs` 的 T1 切片終點改為 `#configTabs`、快取字串更新；`tests/assembly-rules.test.mjs`、`tests/collection-sync.test.mjs` 快取字串更新。斷言未弱化。

## Emulator 真實頁面（`exports/emulator-ui-7dc/`，Git 忽略；commit 以 `documents:commit` 請求計數）

| 情境 | 結果 |
|---|---|
| 1440／821／820／375 × 深色／米色（8 組）：搜尋、系列、結構、排序、清單／卡片（桌面）、選取、面板／sheet、關閉、拆解紀錄分頁 | 每組 0 次 commit；原始列儲存值（含 `雙  空白`、TAB、CRLF 等）不變；來源區為 clip（`display:block`、`inert`）；≥ 821 為右側面板且有清單／卡片切換，≤ 820 為底部 sheet 且無切換；無水平捲動；搜尋、篩選結果正確 |
| 面板「修改」 | 開啟「修改配置」組裝器（同一列）；儲存 1 次（`configTable`） |
| 面板「拆解」 | 原因視窗；確認後 1 次（`configTable`＋`historyTable`） |
| 拆解紀錄「還原成配置」 | 既有確認；1 次（`configTable`） |
| 拆解紀錄「刪除紀錄」 | 既有確認；1 次（`historyTable`） |
| 選取中另一裝置修改配置 | 面板顯示「資料已更新，請重新選擇。」；原按鈕已脫離、點擊無作用、未開啟組裝器 |
| 有搜尋與選取時換帳號（tester-a → tester-b） | 搜尋與選取清除、清單為新帳號；0 次 commit；tester-b 無文件；tester-a 不變 |

## 其他回歸

Phase 7-2 整合回歸見下（505 項）；validate PASS；build PASS（36 files，含 `config-view.js`）；`git diff --check` PASS；A-09 十段雜湊為核准值（`1027d4a2debc9138`、`02f67bb21e597b3e`、`08c1de72b2266fec`、`70d4d345da4b1036`、`410384c3e2c96a4c`、`c1230e4d43e39ba2`、`0bc3c60c31499a7c`、`3ec54b27ec414e19`、`b6c58c122f6809ff`、`813fc6a101343c44`）；`addConfig` 儲存格寫入 `da046a3d56a07519`、`checkStock` `0bed51c10a056c87`；`saveData()` 17、`runTransaction(` 1、`setDoc`／`updateDoc`／`deleteDoc` 0。

## 剩餘事項

- 既有函式的確認文字仍寫「歷史測試紀錄」（例如刪除紀錄的確認）；`collection-sync.js` 衝突提示表名也維持原字樣（規格 A5 另列待決）。
- 後備版面：配置顯示層退回時，原始配置表與拆解紀錄表出現在兩個分頁區塊之後。
- 手機 375 寬度下工具列的兩字標籤（結構、排序）與收藏工具列相同會換行。
- 同步衝突本身由既有 D-018 處理（面板操作呼叫的是同一個 `addConfig`／`deleteRow` 等，Phase 7-DC 已驗證兩裝置衝突）；本輪未另做面板觸發的兩裝置同時寫入。
- Safari／iOS 實機未驗證。

## 複審補測（2026-11-25，ChatGPT 有條件 PASS 的條件）

全部在 Emulator 真實頁面（commit 以 `documents:commit` 請求計數，讀回 Emulator 資料核對）。未修改程式。

| 項目 | 結果 |
|---|---|
| 兩裝置經詳細面板「修改」同一配置表（第二裝置為同帳號的獨立 iframe 頁面，同一 JS 工作內同時儲存） | 一方 200；另一方 400 → D-018 衝突提示、不再寫入；雲端只有成功一方的修改，未覆蓋 |
| 遠端重建後的舊面板操作 | 面板顯示「資料已更新，請重新選擇。」；舊按鈕已脫離、點擊不開啟組裝器 |
| 取消：修改（關閉組裝器）、拆解（原因視窗取消）、還原與刪除紀錄（確認取消） | 全部 0 次 commit，列數不變 |
| 手機 sheet（375）：Tab／Shift+Tab | 最後一項 Tab → 第一項；第一項 Shift+Tab → 最後一項；焦點在外部時 Tab 進入 sheet |
| Escape、遮罩、關閉按鈕 | 皆關閉 sheet、遮罩隱藏、焦點回到原項目；關閉後 Tab 不再被攔截 |
| 背景不可操作 | 遮罩（fixed、z-index 959）覆蓋整個畫面；只有全站選單按鈕（z-index 1200）在其上，與 7-2d 收藏 sheet 相同 |
| 選取項目消失（另一裝置刪除該配置） | sheet 關閉、遮罩隱藏、提示、焦點回到「我的配置」分頁、焦點限制解除 |
| 820 ↔ 821 | 一次重新渲染後 821 為一般面板（無 `is-sheet`／`is-open`、`role="region"`、無 `aria-modal`、遮罩隱藏、選取保留）；回 820 時 sheet 不自動開啟、無遮罩。本環境 App 視窗不可見，`matchMedia` change 與 resize 事件不會送出，所以斷點事件本身無法在此觀察（與 7-2d 相同的監聽機制） |
| 登出、換帳號（sheet 開啟中） | 無選取、無遮罩、搜尋清除、焦點限制解除；0 次 commit |
| 顯示層初始化失敗（測試複本 `?failConfigView` 在安裝前移除 `#historyDetail`） | `config-view-failed`；原始兩表可見、不 inert；兩個分頁區塊都顯示；分頁列、清單、面板、工具列、遮罩都不顯示；收藏顯示層不受影響；載入 0 次；原始列「⋯ → 修改」1 次、歷史「還原」1 次；收藏、零件、拆解紀錄資料不變，配置只有這兩列變更 |

回歸：Node 18 檔 439/439；Phase 7-2 整合回歸 505/505；M01～M16 PASS 16／FAIL 0；validate PASS；build PASS（36 files）；`git diff --check` PASS；核准雜湊（`getTableData` `02f67bb21e597b3e`、`applyDataToTables` `08c1de72b2266fec`、`editRow`→`rebuildRow` `3ec54b27ec414e19`、`getStockNameFromCell`→`escapeHtml` `c1230e4d43e39ba2`、`addConfig` 寫入 `da046a3d56a07519`、`checkStock` `0bed51c10a056c87`）與其餘段落不變；`saveData()` 17、`runTransaction(` 1、`setDoc`／`updateDoc`／`deleteDoc` 0。

待修（不在 7-3b 範圍）：既有確認視窗與 `collection-sync.js` 衝突提示中的「歷史測試紀錄」字樣；後備版面順序；手機工具列兩字標籤換行。
