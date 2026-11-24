# Phase 7-3c 驗收紀錄：組裝器介面（本機實作，未 commit）

日期：2026-11-25｜執行者：Claude Code｜基準 HEAD：`9cb14ce`（v1.15.0 部署結案，未 push）｜規格：`design/phase7/11-phase7-3-assembler-spec.md` §5、原型 `design/phase7/prototypes/integrated-ac`（組裝器）

範圍：只在既有 Quick Editor 上加顯示層。保留 `configQuickEditor`、`confModel`、`sel上蓋`…`sel軸心`、`saveConfigEditorBtn`；寫入只經既有 `addConfig`（`checkStock`、D-019 `checkConfigAssemblyRules`、拆解紀錄確認不變）。未實作 7-3d（複製配置、從收藏建立配置）。

## 實作

| 項目 | 內容 |
|---|---|
| 結構選擇 | 頂部三個按鈕：標準三件式（BX／UX）、CX 三件戰刃、CX 四件戰刃。對應既有 `configEditorMode`（bxux／cx）。BX/UX ↔ CX 沿用既有清空；CX 三件 ↔ 四件清空新結構不顯示的戰刃（主要戰刃，或超越＋金屬），讓 `addConfig` 的二選一檢查只看到畫面上的值。修改既有 CX 配置時，有超越／金屬即開成四件。 |
| 零件槽 | 三件只顯示主要戰刃；四件只顯示超越＋金屬（順序依原型：超越、金屬）。 |
| 一體式固鎖 | 既有 `updateNoRatchetConfigOption` 照舊填「-」；固鎖值為「-」且上蓋或軸心為一體式時，固鎖欄改顯示「無獨立固鎖：固鎖與上蓋一體（官方）」或「無獨立固鎖：{軸心} 是固鎖一體型軸心（官方）」（原型文字），select 隱藏但值不變。 |
| 剩餘數量 | 既有 `refreshSelectors`。修正：組裝器開著修改配置時，`refreshSelectors()`（例如 `checkStock` 拒絕後）會繼續扣除該配置自己的零件（原本會把自己算成已使用）。 |
| 即時檢查（只讀） | 尚未選擇的欄位；規則（`evaluateAssembly` 帶上蓋名稱，修改時以 §3.2 身分比較分「原有（警告，儲存時再確認）」與「新產生（不能儲存）」）；庫存（與 `checkStock` 相同公式與完整名稱，不足時列出持有數與占用的配置）；修改時原本使用但已無庫存、選單無法提供的零件（「原本使用的…請改選其他零件」）；新配置的拆解紀錄重複（`findHistoryByComboKey`）；Tr／Op＋CX 四件戰刃提示（A4，不阻擋）；抽包配置提示；修改中的列已變更時提示重新開啟。全部通過時顯示「符合官方組裝規則，庫存足夠」。 |
| 對話框 | 桌面（≥ 821px）置中對話框 600px；手機（≤ 820px）全螢幕 sheet。Tab／Shift+Tab 限制在組裝器內，Esc 關閉（既有）。關閉時焦點回到開啟它的按鈕（詳細面板「修改」或「＋ 建立配置」）；儲存後詳細面板重繪時，焦點移到新的「修改」按鈕。 |
| 附帶修正 | `setConfigEditorMode` 原本以 `[data-config-mode]` 更新按鈕，會連帶改到 7-3b 清單（`data-config-mode="list"/"card"`）的 class 與 `aria-pressed`；改為只更新組裝器內的結構按鈕。 |

修改檔案：`config-view.js`（新增 7-3c 純函式）、`script.js`（7-3b 區塊後新增「Phase 7-3c assembler」區塊；`setConfigEditorMode`、`syncConfigModelFromSelection`、`openConfigQuickEditor`、`closeConfigQuickEditor`、`refreshSelectors`、初始化與 7-3b `writeConfigDetail` 的焦點保留小幅接線）、`index.html`（Quick Editor 內容、快取 `20261125-phase73c`）、`style.css`（7-3c 區塊）、`guide.html`（第四節）、`tests/config-assembler.test.mjs`（新）、`tests/helpers/config-page-harness.mjs`（讀取 `configEditorMode`／`configAssemblyStructure`）、三個快取版本測試、`README.md`／`AGENTS.md`（測試指令）。

未修改：`addConfig`、`checkStock`、`checkConfigAssemblyRules`、`updateNoRatchetConfigOption`、`assembly-rules.js`、`collection-sync.js`、`data-session-guard.js`、`collection-view.js`、Rules、Schema、資料格式、交易協定、目錄與競賽統計。

## 測試

| 項目 | 結果 |
|---|---|
| Node（19 檔） | 453/453（新增 `config-assembler.test.mjs` 14 項：純函式 C-01～C-04；真實頁面 harness C-05～C-13；C-14 組裝器區塊無寫入、`checkStock` 雜湊、D-019 呼叫保留） |
| Phase 7-2 整合回歸 | 505/505 |
| M01～M16（Firestore Emulator） | PASS 16／FAIL 0 |
| validate／build／`git diff --check` | PASS／PASS（36 files）／PASS |
| 核准雜湊 | `getTableData` `02f67bb21e597b3e`、`applyDataToTables` `08c1de72b2266fec`、`editRow`→`rebuildRow` `3ec54b27ec414e19`、`getStockNameFromCell`→`escapeHtml` `c1230e4d43e39ba2`、`addConfig` 寫入 `da046a3d56a07519`、`checkStock` `0bed51c10a056c87`（測試固定） |
| 寫入路徑 | `saveData(` 17、`runTransaction(` 1、`setDoc`／`updateDoc`／`deleteDoc` 0 |

### Emulator 真實頁面（`demo-beyblade-7dc-ui`，127.0.0.1，測試複本 `exports/emulator-ui-7dc`）

以真實 UI 操作（結構按鈕、select change、儲存按鈕、配置詳細面板「修改」），攔截 `documents:commit` 計數：

| 情境 | 結果 |
|---|---|
| 開啟 | 標準三件式、上蓋／固鎖／軸心、「尚未選擇」、焦點在組裝器內 |
| 標準三件式＋特殊空白名稱「蒼龍  神劍」＋拆解紀錄同組合 | 提示「以前拆解過（結果：不好用）」；儲存時既有確認；1 次寫入 200，儲存原始名稱 |
| CX 三件 | 1 次寫入；切到四件時主要戰刃清空、提示尚未選擇超越／金屬 |
| CX 四件＋Tr | 固鎖欄「無獨立固鎖：Tr 是固鎖一體型軸心（官方）」；A4 提示；1 次寫入，固鎖「-」 |
| 一體式上蓋（惡魔冥界） | 「無獨立固鎖：固鎖與上蓋一體（官方）」；1 次寫入 |
| 一體式上蓋＋Tr | 即時「不能儲存」；儲存被既有規則阻擋，0 次寫入 |
| 取消、Esc | 0 次寫入；焦點回到「＋ 建立配置」 |
| 修改既有標準配置、不變更就儲存 | 檢查通過（扣除自身）；既有確認後 0 次寫入 |
| 修改既有違規配置 | 警告「原本就不符合…（儲存時會再確認）」；改成新違規 → 即時與儲存都阻擋；改回後 D-019 確認按取消 → 0 次寫入 |
| 合法修改 | 1 次寫入 200；焦點回到詳細面板「修改」 |
| 修改超用配置（龍騎 1 個，2 個配置使用） | 「原本使用的主要戰刃「龍騎」已經沒有庫存（持有 1，已被 1 個配置使用：飛龍龍騎H），請改選其他零件」；儲存被既有檢查阻擋，0 次寫入 |
| 抽包配置 | 抽包提示；不變更儲存 0 次寫入 |
| 開著時零件被用完（在頁面模擬加入占用列後 `refreshSelectors`） | 列出持有數與占用配置；`checkStock` 阻擋，0 次寫入；模擬列移除 |
| 兩裝置 | B 開著修改同一配置時 A 儲存（200）→ B 組裝器以既有「偵測到較新的雲端資料」關閉，B 0 次寫入，顯示 A 的值 |
| 登出／換帳號 | 組裝器關閉、0 次寫入；B 帳號載入自己的資料，重開為標準三件式、檢查重設 |
| 焦點限制 | Tab 由最後一個回到第一個、Shift+Tab 反向、外部 Tab 被拉回；Esc 關閉 |
| 版面 | 1440／821：置中 600px 對話框；820／375：全螢幕 sheet；深色與米色皆無水平溢出；≤ 420px 隱藏結構說明小字 |

## 未驗證／已知

- Safari／iOS、正式 `signInWithPopup` 未驗證；正式網站未操作。
- 「開著時零件被用完」只能在頁面上模擬：遠端變更會先以既有機制關閉組裝器。
- 既有：修改超用配置時，用完的零件不在選單中，欄位開啟為空（`refreshSelectors` 既有行為，未改），即時檢查會提示原本使用的零件。
- 既有：其他確認文字仍寫「歷史測試紀錄」（未修改受保護流程）。
- 第一輪不 commit；ChatGPT 複審有條件 PASS，以下補測通過後 commit。

## 複審補測（2026-11-25）

| 項目 | 結果 |
|---|---|
| 選單扣除自身（C-08、C-15） | 修改中重新整理 4 次，剩餘數量不變（不重複扣除或釋放）；關閉後恢復計入 |
| 超用配置欄位空白（C-10、C-16） | 儲存被既有必選檢查拒絕，文件、9 格、未儲存表皆不變，0 次寫入 |
| 不變更儲存（C-08、Emulator） | 0 次寫入，原配置不變 |
| 庫存不足（C-09、Emulator） | `checkStock` 阻擋，0 次寫入 |
| 原有違規（C-12、`config-assembly-wiring`） | 警告；確認取消 0 次寫入；確認後依 D-019 既有行為 |
| CX 三↔四（C-17） | 隱藏的超越／金屬不會存入；修改四件配置切換結構後取消，原配置與文件不變 |
| 即時與最終判定一致（C-18） | 5 組合：即時阻擋 ⇔ `addConfig` 不寫入 |
| 模式按鈕（C-19、Emulator） | 組裝器切換結構 4 次後，兩個清單的 class、`aria-pressed`、`data-config-mode`、系列篩選與檢視模式完全相同 |
| 焦點 | 儲存→新的面板「修改」；取消→面板「修改」；原目標被移除→「＋ 建立配置」；遠端更新關閉組裝器→「＋ 建立配置」（新增：焦點在組裝器內時的安全替代焦點；`cancelSessionInteractions` 未修改） |
| 手機 | 由詳細 sheet 開啟組裝器時 sheet 與遮罩先關閉；Tab 留在組裝器；取消後無遮罩、無焦點限制，焦點在清單項目；無水平溢出 |
| 背景 | 組裝器開啟時背景點擊落在組裝器遮罩上；Tab 限制在組裝器內 |
| 回歸 | Node 458/458；Phase 7-2 回歸 505/505；M01～M16 PASS；validate／build／diff-check PASS；核准雜湊與寫入路徑不變；Emulator 完整情境重跑（4 次新建＋1 次合法修改＝5 次 200，其餘 0） |
