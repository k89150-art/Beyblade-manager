# Phase 7-4 賽事記錄面板：前置盤點與實作規格（草案）

狀態：**規格定案，授權本機實作 7-4a、7-4b、7-4c**（2026-11-25，ChatGPT 前置審查通過、Q1～Q8 定案；各子階段個別本機 commit；不升版、不 push、不部署）。基準：正式版本 `049b0e6`（v1.17.0），本機 HEAD `c7fef06`。

沿用已核准設計，不重新製作原型：
- 賽事回合記錄採 **C 的大按鈕面板**，只用於回合記錄（`design/phase7/README.md:8`、`04:3`）。
- 3c：比分板與記錄回合面板固定在比賽頁頂部，對局清單在下方；「放在對局卡內」未採用（`README:11`、`08:75`）。
- 3d：3on3 重複零件提示，只提示不阻擋（戰神、帝王紋章鎖計入）（`README:12`、`08:76`）。
- 計分沿用 `SCORE_TYPES`、資料格式不變、寫入走 D-017（`05:25`、`06:23`、`08:57`）。
- 不採用 C 的整頁儀表板與手機全螢幕比分板（`README:8`）。

計畫中的 7-4 定義（`06:23`）：比賽詳細頁、對局編輯面板（取代 `prompt()`）、回合大按鈕；沿用 `tournament-sync.js` 操作與 D-017 交易；`tournament-*` 測試全過，新增面板草稿與衝突測試，Emulator E 系列重跑。

## 1. 現況盤點（程式）

### 1.1 資料
- 儲存在 `users/{uid}/appData/main` 的 `tournamentRecords` 陣列；每次寫入只含 `tournamentRecords` 與 `updatedAt`（D-017：不拆文件、不改 Schema）。
- 比賽：`{ id, tournamentName, date, location, participantCount, rank, note, isFinished, matches }`。
- 對局：`{ id, opponentName, deck: [{ source: "config"|"custom", configText } ×3], rounds }`；直接晉級另有 `advancementType: "bye"|"walkover"`、`deck: []`。
- 回合：`{ id, result: "win"|"lose", scoreType, point, myBeyblade, note }`；`roundNumber` 由交易內依伺服器最新資料重編。
- ID：`generateId(prefix)` 在交易外產生一次並凍結在操作中。冪等規則（`applyTournamentOperation`）：
  - 已存在：`IDENTITY`；
  - 刪除時已不存在：`ABSENT`；
  - 內容已相同：`STATE_MATCH`；
  - 其他不同：`CONFLICT`。

### 1.2 計分與完成判定（不得改變）
- `SCORE_TYPES`：極限 3、擊飛 2、爆裂 2、迴轉 1。
- 對局比分 `calculateMatchScore`（win 加我方、lose 加對手）。
- 對局結果 `getMatchOutcome`：直接晉級為 advance；任一方 ≥ 4 為勝或負，否則未完成。4 分門檻同時寫在 `getMatchStatus`。**到 4 分後仍可新增回合**（現行行為）。
- 名次 `calculateTournamentStanding`：每次渲染計算、不儲存；單淘汰 `ceil(log2(人數))` 輪；依對局陣列順序。
- 比賽完成只有 `isFinished`，由使用者按「完成」設定。完成後對局與回合鎖定（處理函式以 `alert()` 拒絕），只有編輯已完成比賽的對話框會重新開啟（L4）。

### 1.3 介面與寫入入口
- `tournament.html`：
  - 登入卡（含「賽事儲存版本：4B-1（交易保護）」）、新增比賽表單、`#tournamentList`；
  - 自有側欄與 inline CSS（≤ 700px 回合表格改卡片，依 `nth-child` 標籤）。
- `tournament.js` 以 `innerHTML` 整頁重繪：`renderTournamentList` → 卡片 → 詳細（新增對局表單、對局卡、新增回合表單、回合表）。修改比賽為 JS 建立的對話框；**修改對局用 4 次 `prompt()`**。
- 寫入入口共 10 個 `window.*` 處理函式，全部經 `createTournamentOperation` → `submitTournamentOperation` → `startTournamentTransaction` → `runTransaction(maxAttempts: 1)`：

| 處理函式 | 操作 | 由 DOM 讀取 |
|---|---|---|
| `addTournament` | ADD_TOURNAMENT | 5 個新增表單 id |
| `finishTournament` | UPDATE_TOURNAMENT `{isFinished:true}` | — |
| `editTournament` | UPDATE_TOURNAMENT | 修改對話框 |
| `deleteTournament` | DELETE_TOURNAMENT | — |
| `addMatch` | ADD_MATCH | `[data-tournament-id] [data-match-opponent]`、`[data-deck-select=N]`、`[data-deck-custom=N]` |
| `addDirectAdvance(id, bye/walkover)` | ADD_MATCH | — |
| `editMatch` | EDIT_MATCH | `prompt()` ×4，`matchEditDrafts` 合併 |
| `deleteMatch` | DELETE_MATCH | — |
| `addRound` | ADD_ROUND | `[data-match-id] [data-round-beyblade/result/score-type/note]` |
| `deleteRound` | DELETE_ROUND | — |

- 配置選單：`rebuildConfigOptions` 從同一次伺服器讀取的 `mainData.configTable` 依儲存順序建立（`config_<index>` 只在畫面使用、不儲存），文字由 `buildConfigTextFromCells` 產生；只讀。
- **目前沒有** 3on3 重複零件提示、手機快速記錄、即時同步（無 `onSnapshot`；其他裝置的變更在儲存或重新載入後才出現，為 D-017 已列殘餘風險）。

### 1.4 責任分界與 D-017 保護
- `tournament-sync.js`：純函式（操作建立、套用與衝突、冪等、重試迴圈、失敗分類、結果不明判定），無 DOM、無 Firebase。
- `tournament.js`：Firebase 與登入、Session 守衛、載入、渲染、SDK 交易轉接、`submitTournamentOperation`、草稿、對話框、10 個處理函式、登入狀態監聽。
- D-017 重點：
  - 交易內讀最新資料，並在讀取前後檢查 `canContinue()`；以整筆比賽的指紋比對，不同即 CONFLICT。
  - 一次只有一個儲存（`activeTournamentSave`），忙碌時所有 `[data-write-action]` 停用。
  - 頁面重試最多 5 次（300／600／1200／2400 ms）。
  - 15 秒逾時、5 秒慢速提示；已送出但結果不明時以 `getDocFromServer` 重讀，依操作 ID 確認，否則提示結果不明，並設有延遲提交監看。
  - 離線不排隊。
  - 草稿只在記憶體：新增對局與新增回合表單草稿以 DOM 祖先與屬性為鍵；`matchEditDrafts` 保存基準值與使用者輸入，雙方都改過的欄位要求選擇。
  - 換帳號時依序：取消待處理互動 → 放棄儲存 → 清除草稿 → 重設 Session → 重新載入。

### 1.5 寫入路徑基準（賽事端，與收藏端 17／1／0 無關）
- `tournament.js`：
  - `runTransaction(` 1、`transaction.update(` 1、`transaction.set(` 1、`getDocFromServer(` 2；
  - `createTournamentOperation(` 10 次呼叫、`submitTournamentOperation(` 11（1 定義＋10 呼叫）；
  - `setDoc`／`updateDoc`／`deleteDoc`／`writeBatch`／`addDoc`／`onSnapshot` 皆為 0；`localStorage` 0；`data-write-action` 13。
- `tournament-sync.js`：
  - `transaction.get/update/create` 轉接各 1；
  - `runTransaction`／`setDoc`／`updateDoc`／`deleteDoc` 0。
- `tournament.html`：`data-write-action` 1。

### 1.6 受保護區段雜湊（CRLF→LF 後 sha256 前 16 碼；`between(start, end)` 不含 end）

`tournament-sync.js`（整檔 `1cb48b722b4de582`）：

| 段落 | 起點 → 終點 | 雜湊 |
|---|---|---|
| S1 代碼與訊息 | `export const TOURNAMENT_OPERATION_TYPES` → `export class TournamentSyncError` | `7a4813251d56d938` |
| S2 建立操作 | `export function createTournamentOperation(` → `// Reads tournamentRecords from a document.` | `84ef22601aa39811` |
| S3 套用、衝突、冪等 | `export function readTournamentRecordsField(` → `function patchMatches(` | `e96de67f87d464de` |
| S4 已套用確認 | `function patchMatches(` → `// Firebase Web SDK 11.2.0 retries these codes itself` | `d5abaff383c3fa94` |
| S5 交易與重試 | `// Firebase Web SDK 11.2.0 retries these codes itself` → `export function classifyTournamentSaveFailure(` | `1d38fb31c2a4135e` |
| S6 失敗分類與等待 | `export function classifyTournamentSaveFailure(` → 檔尾 | `c8b670e079f4b596` |

`tournament.js`（整檔 `6ac9bd9e3332920d`）：

| 段落 | 起點 → 終點 | 雜湊 |
|---|---|---|
| T1 計分常數 | `const SCORE_TYPES = {` → `let currentUser = null;` | `cb17b55681c7bd92` |
| T2 寫入控制 | `function updateDataAccessUi(` → `async function loginWithGoogle(` | `4745f91fa8a76430` |
| T3 配置文字 | `function buildConfigTextFromCells(` → `function getDeckValue(` | `b9f4c8eded3e12e7` |
| T4 計分、完成判定、名次 | `function calculateMatchScore(` → `function renderTournamentList(` | `8d64ce662dee876d` |
| T5 伺服器載入 | `async function loadTournamentData(` → `/* ===== D-017 tournament transactions: begin ===== */` | `f204b4a3af1cb7a1` |
| T7 常數與狀態 | D-017 begin → `function isTournamentSaveBusy(` | `bc8f09d505c33816` |
| T8 忙碌、採用、SDK 轉接 | `function isTournamentSaveBusy(` → `function reportTournamentSaveFailure(` | `b1d725abbb7fed71` |
| T9 結果不明確認、延遲提交 | `function reportTournamentSaveFailure(` → `// Runs one operation against the latest server copy.` | `ed923ae03b556771` |
| T10 `submitTournamentOperation` | `// Runs one operation against the latest server copy.` → `const MATCH_EDIT_FIELDS = Object.freeze(` | `a1d3e5fbc1831779` |
| T11 表單草稿 | `/* ----- unsaved form drafts (memory only, tied to one account) ----- */` → `// Drafts never follow a sign-out or an account switch.` | `6f012162f46072f6` |
| T12 草稿帳號隔離 | `// Drafts never follow a sign-out or an account switch.` → `// Re-submitting an unchanged add form after an unclear result reuses the same` | `52d07486d483103a` |
| T13 新增 ID 重用（L5） | 同上 → `function retryTournamentDataLoad(` | `c3e722329c5613d8` |
| T14 所有寫入處理函式 | `window.addTournament = async function` → D-017 end | `7c35fde0b1617c11` |
| T15 修改比賽對話框衝突合併 | `// The dialog stays open until the save is confirmed` → `window.editTournament = async function` | `3a05b0e6a0de5d76` |
| T16 `editMatch` 草稿合併 | `window.editMatch = async function` → `window.deleteMatch = async function` | `73137bfdbaaf7c12` |
| T17 登入變更與帳號隔離 | `onAuthStateChanged(auth, user => {` → 檔尾 | `69dc7d5615d7584d` |

建議：S1～S6、T1～T5、T7～T13、T17 為嚴格基準（7-4 期間不得變更）。T14～T16 含 DOM 讀取與 `prompt()`，若 7-4c 核准修改，比照 A-09 記錄核准前後雜湊。實作開始時先新增 `tests/tournament-protection.test.mjs` 固定上述雜湊與寫入路徑計數。

## 2. 設計與現況差異

| 項目 | 核准設計（原型） | 現況 | 處理 |
|---|---|---|---|
| 回合記錄 | 頂部比分板＋大按鈕（陀螺 3、得分／失分、方式 4、備註、預覽、記錄） | 對局卡內的下拉選單表單 | 7-4a：大按鈕只設定既有 `[data-round-*]` 欄位，再呼叫既有 `addRound` |
| 面板對象 | 最後一場未完成對局（`currentMatch`） | 每場對局各有表單 | 待決 Q1 |
| 4 分後 | 面板自動消失 | 仍可新增回合 | 待決 Q2（不改計分規則） |
| 預設值 | 預選第 1 顆、擊飛、記住上次陀螺 | 必須選陀螺；方式預設極限 | 待決 Q3 |
| 新增對局 | 單一對話框＋3on3 提示 | 卡內表單（對手＋3 組選單／自填） | 7-4b：對話框沿用既有欄位屬性，呼叫既有 `addMatch`／`addDirectAdvance` |
| 修改對局 | 對話框 | 4 次 `prompt()` | 7-4c：需修改 T16，待決 Q4 |
| 3on3 提示 | 只比對配置文字 | 無 | 7-4b 新增純函式；自填陀螺標示「未檢查」（待決 Q7） |
| 回合刪除（復原） | 每列「刪除」＋確認 | 相同 | 沿用 `deleteRound` |
| 資料欄位名 | `name`／`opponent`／`type`… | `tournamentName`／`opponentName`／`scoreType`… | 以現況為準，原型欄位名不採用 |
| 交易處理 | 原型直接改狀態 | D-017 | 全部沿用 D-017，不新增寫入路徑 |

## 3. 實作建議（階段拆分）

原則：
- 比照 7-2／7-3 的「原始操作入口＋顯示層」。新面板只設定既有表單欄位、呼叫既有 `window.*` 處理函式；所有寫入仍經 `submitTournamentOperation`。
- 不新增 Firestore 呼叫；不改 `tournament-sync.js`；不改計分、完成判定、名次與既有紀錄語意。
- 顯示層的狀態（面板對象、展開）只存在記憶體；換帳號與每次重繪後依最新資料重建；過期面板（對局已不存在、比賽已完成、已達 4 分）不得送出。

| 步驟 | 內容 | 可能修改 | 受保護區段 |
|---|---|---|---|
| **7-4a** 比分板與回合大按鈕 | 比賽詳細的頂部比分板（我方／對手比分、4 格、第 N 回合、先到 4 分、`aria-live`）＋記錄回合面板（陀螺 3 顆、得分／失分、方式 4、備註、即時預覽「比分變成 a：b｜本局勝利／落敗／仍在進行」）；按「記錄回合」時把值寫入該對局既有 `[data-round-*]` 欄位並呼叫 `addRound(tId, mId)`；手機 2×2 方式按鈕、52px 觸控 | 新 `tournament-panel.js`（純函式）、`tournament.js` 渲染層（T14 以外）、`tournament.html`（CSS、快取） | 不動 S1～S6、T1～T17 |
| **7-4b** 新增對局對話框與 3on3 提示 | 對話框（對手、3 組「從配置選／自填」、輪空、對手未到）；以既有欄位屬性呼叫 `addMatch`／`addDirectAdvance`；3on3 重複零件提示（只提示） | 同上 | 不動 |
| **7-4c** 修改對局面板（取代 `prompt()`） | 對話框保留 M1 草稿合併（基準值、雙方都改過的欄位要求選擇） | `editMatch`（T16）— **需另行核准為例外** | T16 變更 |
| 不在 7-4 | 即時同步（`onSnapshot`）、4 分後封鎖寫入、手機全螢幕比分板、首頁直接開啟進行中的對局（Q2 已決定先開啟賽事頁）、Schema 延伸、個人戰績 | — | — |

部署注意：
- 修改 `tournament.js` 必須更新 `tournament.html` 的 `tournament.js?v=` 快取字串，並依 D-017 H2 程序要求所有裝置關閉舊分頁與 PWA。
- 「賽事儲存版本：4B-1（交易保護）」不改（`06:32`）。

## 4. 預計修改檔案
- `tournament.html`（面板容器、CSS、快取字串）；`tournament.js`（僅渲染與面板接線，T14 以外；7-4c 另含 T16）。
- 新增 `tournament-panel.js`（純函式：預覽比分、面板對象、3on3 重複零件；import 與 `?v=` 依現有慣例）。
- 測試：
  - 新增 `tests/tournament-panel.test.mjs`、`tests/tournament-protection.test.mjs`；
  - 更新 `tests/helpers/tournament-page-harness.mjs`（新元素、選擇器）與快取版本測試。
- `guide.html`（賽事操作說明）；發布時另行授權 `site-menu.js`、`changelog.html`。
- 文件：本規格、`docs/PROJECT_DECISIONS.md`、`docs/AI_HANDOFF.md`、`design/phase7/verification/phase7-4x/`。

## 5. 驗收矩陣

| 類別 | 項目 | 7-4a | 7-4b | 7-4c |
|---|---|---|---|---|
| 保護 | S1～S6、T1～T13、T17 雜湊不變；賽事寫入計數不變（`runTransaction(` 1、`submitTournamentOperation(` 11、`createTournamentOperation(` 10、`setDoc`／`updateDoc`／`deleteDoc`／`onSnapshot` 0）；收藏端 17／1／0 與核准雜湊不變 | ✓ | ✓ | ✓（T16 例外記錄） |
| 寫入 | 每次記錄回合／新增對局／修改對局恰好 1 次交易；寫入欄位只有 `tournamentRecords`、`updatedAt`；`beybladeTable`／`configTable` 不變 | ✓ | ✓ | ✓ |
| 計分 | 各方式分數、4 分判定、名次與現況函式結果一致（同輸入比對）；直接晉級不顯示面板 | ✓ | ✓ | — |
| 鎖定 | 已完成比賽不顯示面板、處理函式仍拒絕；直接晉級對局拒絕記錄回合 | ✓ | ✓ | ✓ |
| 過期 | 面板對象對局被刪除、比賽完成、資料重新載入後舊按鈕不送出 | ✓ | ✓ | ✓ |
| D-017 | 忙碌時面板按鈕停用；重試、離線、結果不明（逾時、回應遺失）、衝突訊息與最新資料採用沿用；新增回合不重複寫入（同 ID 冪等） | ✓ | ✓ | ✓ |
| 草稿 | 面板輸入在重繪、儲存失敗後保留；換帳號清除；不同對局不互相混用 | ✓ | ✓ | ✓（M1 合併） |
| 帳號 | 開啟面板時登出／換帳號：面板關閉、0 次寫入、不帶到下一帳號 | ✓ | ✓ | ✓ |
| 3on3 | 重複零件提示（戰神、帝王計入，其他紋章鎖不計），只提示不阻擋；自填陀螺的處理依 Q7 | — | ✓ | ✓ |
| 無障礙 | 大按鈕 `aria-pressed`；比分 `aria-live`；對話框焦點限制、Esc、焦點回復與安全替代焦點；手機 sheet 遮罩阻擋背景 | ✓ | ✓ | ✓ |
| 版面 | 375／820／821／1440 × 深色／米色無水平溢出；Console Error 0 | ✓ | ✓ | ✓ |
| 回歸 | 全部 Node（含 `tournament-*` 三檔）、Phase 7-2 回歸 505、M01～M16、Emulator E 系列（賽事頁真實操作）、validate、build、`git diff --check` | ✓ | ✓ | ✓ |

## 6. 定案（2026-11-25，ChatGPT 前置審查）
- **Q1 面板對象**：可切換到較早尚未完成的對局（面板內的對局選擇，以及對局卡的「在上方記錄這場」），清楚顯示目前操作對象（第 N 局、對手）與比分。切換只改顯示，不寫入；切換前輸入的回合草稿以「比賽＋對局」為鍵保留，不會送到另一場。
- **Q2 4 分後**：任一方達既有 4 分門檻時停用面板的快速記錄（不顯示記錄按鈕，顯示完成狀態），保留回合表的刪除；比分重新低於門檻時恢復。底層計分、寫入規則與比賽完成判定不變（`addRound` 不加限制）。
- **Q3 預設值**：只有一個有效陀螺選項時預選；多個由使用者選擇。勝負方與勝利方式不預選，也不沿用上一回合；面板在三者都選定前不送出（既有 `addRound` 對空白勝負與方式的預設值不會被使用）。
- **Q4 7-4c**：核准 T16 `editMatch` 有限例外：四次 `prompt()` 改為單一修改對局面板。允許修改面板開關、欄位呈現與預填、輸入取得、確認／取消／焦點與維持原語意所需的最小接線；不得改變對局 ID、草稿比較基準、欄位層級合併與衝突判斷、交易操作內容、D-017 重試／結果不明／冪等、Session 與跨帳號防護。未修改的欄位保留原始值（不因顯示格式改寫）。記錄 T16 前後雜湊與差異。
- **Q5**：新增比賽、修改比賽維持現狀。
- **Q6**：首頁近期賽事工作台延後，不納入 Phase 7。
- **Q7**：3on3 重複零件只提示、不阻擋。自填、缺少或無法可靠辨識（例如多個配置文字相同但零件不同）的陀螺顯示「未檢查重複零件」，不得標示為已通過；全部三顆都完成檢查且沒有重複時才顯示通過。零件身分為「類別＋原始名稱」，沿用 CX、抽包、一體式結構（「-」不是零件、CX 配置的上蓋欄不是零件、主要戰刃依 `mainStockName`）；紋章鎖可重複，只有戰神、帝王各限一個（3d 已確認）。以陀螺欄位（而非文字）判斷，同一配置選兩次也會提示。不把配置零件回寫到賽事紀錄。
- **Q8**：更正 `08-integrated-ac-prototype.md` 過時的狀態文字，不修改已核准設計。

### 6.1 實作接線（子階段共同）
- 新增純函式模組 `tournament-panel.js`（面板對象、可選陀螺、3on3 重複零件判斷）；比分與勝負一律呼叫既有 `calculateMatchScore`／`getMatchOutcome`，不另寫計分。
- 7-4a：記錄回合面板放在比賽詳細最上方，容器帶 `data-match-id="<目標對局>"`，內含既有欄位屬性 `data-round-beyblade／result／score-type`（隱藏欄位，由大按鈕設定）與 `data-round-note`；面板位於對局卡之前，既有 `addRound` 讀到的就是面板欄位。對局卡不再有各自的新增回合表單（避免草稿鍵重複）。面板的「記錄回合」先確認比賽、對局、面板目標、DOM 第一個 `[data-match-id]` 與選項都仍有效，再呼叫既有 `window.addRound`；送出中不重複送出。
- 7-4b：新增對局對話框放在該比賽卡內（`data-tournament-id` 之下），使用既有欄位屬性 `data-match-opponent`／`data-deck-select`／`data-deck-custom`，按鈕呼叫既有 `addMatch`／`addDirectAdvance`；開啟狀態只存在記憶體，重繪後保留；儲存成功（草稿被既有流程清除）才關閉。
- 7-4c：`editMatch` 以 `openMatchEditPanel(match, defaults, session)`（可替換的函式宣告，比照 `openTournamentEditDialog`）取得輸入；面板在 `#tournamentList` 之外，登出與換帳號經 `pendingTournamentInteractions` 關閉。
- 快取：`tournament.html` 的 `tournament.js?v=` 更新；「賽事儲存版本：4B-1（交易保護）」不變。發布時依 D-017 H2 程序要求關閉所有舊分頁與 PWA。

## 7. 本輪未做
- 未修改任何程式、測試或部署；未新增雜湊測試（建議在 7-4a 開始時加入）。
- 未讀寫正式 Firestore；未執行賽事頁 Emulator（屬實作階段驗收）。
