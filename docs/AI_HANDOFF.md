# AI 工作交接

本文件只記錄可供下一位執行者接手的摘要，不保存聊天逐字稿。最新紀錄置頂。

## 協調狀態

- 目前執行者：無（Claude 完成 Phase 2 H-1，等待使用者確認是否 commit）
- 寫入範圍：目前沒有進行中的寫入任務
- Git 狀態（開始時）：`main` / `1120d859f7a1741d79c1db4225b852d76866c6ff`，與 `origin/main` 同步，工作樹乾淨

> 「目前執行者」僅供協調，不是可靠的檔案鎖。開始寫入前仍必須檢查 `git status`，並確認沒有其他 AI 或使用者正在修改同一工作樹。

## 紀錄格式

每次完成實質修改後新增一筆，保持精簡：

```markdown
### YYYY-MM-DD — Codex / Claude
- 任務：
- 主要內容：
- 修改檔案：
- 測試：
- Branch / HEAD：
- Git status：
- 未提交修改：
- 未完成事項：
- 已知問題：
- 資料庫／部署風險：
- 下一位注意：
- Commit / Deploy：未 commit、未部署 / commit `<hash>`、已部署 `<環境>`
```

## 最新紀錄

### 2026-10-29 — Claude（Phase 2）

- 任務：H-1 收藏資料保護（D-015）。
- 根本原因：`applyDataToTables()` 對每筆收藏呼叫 `upgradeStoredStockItem()`；`chooseStockProductForStoredItem()` 不檢查 `stockAutoFilled`，型號唯一或名稱相符就選型錄商品，再由 snapshot 流程自動 `saveData()` 寫回。手動新增的收藏也沒有任何標記。
- 主要內容：新增 `isExplicitStockAutoFilled()`，只有 `true`／`"true"` 可升級；有 recordId 時只以 recordId 識別、未知 recordId 不改用型號推測，無 recordId 時只接受唯一型號、移除名稱比對推測；手動新增寫入 `stockAutoFilled: "false"`；收藏列保留本頁不管理的欄位與 falsy metadata；`user-view.js` 管理員檢視套用相同規則；`script.js`、`user-view.js` 版本改為 `?v=20261029-phase2`。
- 修改檔案（本階段）：`script.js`、`index.html`、`user-view.js`、`user-view.html`、`tests/collection-autofill-safety.test.mjs`（新增）、`docs/PROJECT_DECISIONS.md`、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`。
- 測試（Claude 雲端隔離環境，非使用者 Windows 本機）：JavaScript syntax PASS；全部 7 個測試檔 140/140 PASS（需要 Git 歷史的 2 檔於 GitHub 公開 repo 的暫時 clone 上執行，執行後刪除）；新增 H-1 測試 15/15；網站結構 PASS；production build PASS；`git diff --check` PASS；390×844／1440×900 手動收藏載入不寫回、官方選擇與手動新增正確、無 overflow、Console Error 0；mutation：移除標記檢查、恢復未知 recordId 的型號推測、移除手動標記、移除欄位保留、移除管理員檢視檢查，測試皆會失敗。
- Branch / HEAD：`main` / `1120d859f7a1741d79c1db4225b852d76866c6ff`。
- Git status：未 stage；共 14 份未提交：11 份已追蹤檔案修改＋3 份新增（`data-session-guard.js`、`tests/data-session-safety.test.mjs`、`tests/collection-autofill-safety.test.mjs`）。
- 未完成事項：H-2、M-2、完整 Firestore 備份／復原、Emulator 測試；`AGENTS.md`／`README.md` 測試指令尚未納入新增的兩個測試檔。過去可能已被舊版改寫的收藏未辨識、未復原。
- 已知問題：`stockAutoFilled` 為非字串 truthy 值時，之後手動存檔會轉成字串（不會被視為 `true`）；`normalizeAllModelCells()` 會在顯示時正規化型號格式，使用者下次存檔時寫回（非型錄覆蓋，屬既有行為）。
- 資料庫／部署風險：未修改 Rules、型錄、競賽統計或正式資料；正式網站在部署前仍是舊行為。
- 下一位注意：D-015 狀態為「已實作，待正式部署」；不可描述為正式網站已受保護。
- Commit / Deploy：未 commit、未 push、未部署。

### 2026-10-29 — Claude

- 任務：Phase 1C 部署前補強（M-A 快取版本、M-B D-015 文件、M-C 測試修正、短暫斷線編輯保護）。
- 主要內容：`index.html`、`tournament.html` 的 script 與兩支 JS 對 `data-session-guard.js` 的 import 統一改為 `?v=20261029-phase1c`；cache metadata 事件只在實際重建 DOM 時才取消互動，短暫斷線不再關閉 Quick Editor／刪除 dialog，但伺服器再次確認前仍鎖住寫入；D-015 拆分為「已確認政策／目前程式狀態／Phase 2 待修／上線風險」；修正候選視窗 false positive 測試並加入 in-memory mutation 檢查；新增 15 項實際執行 `script.js` handler 的行為測試（刪除 modal、候選 dialog、Quick Editor、`updateDataAccessUi`、`onSnapshot`、`saveData` 佇列、transaction 建立／衝突／重試）。
- 修改檔案：`index.html`、`tournament.html`、`script.js`、`tournament.js`、`tests/data-session-safety.test.mjs`、`docs/PROJECT_DECISIONS.md`、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`（其餘 Phase 1／1B 修改保留不動）。
- 測試（Claude 在雲端隔離副本執行，非使用者 Windows 本機）：JavaScript syntax PASS；完整 6 個測試檔 125/125 PASS（含需要 Git 歷史的 2 檔，於 GitHub 公開 repo 的隔離 clone 上執行）；`data-session-safety` 31/31；網站結構 PASS；production build PASS（31 files）；`git diff --check` PASS；390×844／1440×900、深色／米色主頁與賽事頁無 overflow、Console Error 0；mutation：移除單一防護層可被測到（候選 dialog、刪除 modal、Quick Editor、transaction、cache 解鎖、斷線關閉編輯器），`saveData` 與 `onSnapshot` 為多層防護，需同時移除所有層才會失敗。
- Branch / HEAD：`main` / `1120d859f7a1741d79c1db4225b852d76866c6ff`。
- Git status：未 stage；共 11 份未提交檔案（9 份已追蹤修改 + 2 份新增），與 Phase 1B 相同檔案集合。
- 未提交修改：`data-session-guard.js`、`script.js`、`index.html`、`tournament.js`、`tournament.html`、`tests/data-session-safety.test.mjs`、`tests/manager-ui-refresh.test.mjs`、`tests/retirement.test.mjs`、`docs/PROJECT_ARCHITECTURE.md`、`docs/PROJECT_DECISIONS.md`、`docs/AI_HANDOFF.md`。
- 未完成事項：H-1（收藏型錄升級條件）、H-2（賽事多分頁覆蓋）、M-2（遠端更新時草稿合併）、完整 Firestore 備份／復原、Emulator 測試。`AGENTS.md`／`README.md` 的測試指令尚未包含 `tests/data-session-safety.test.mjs`。
- 已知問題：斷線期間若有已排入但尚未送出的存檔會被取消，恢復連線後不會自動補存（畫面內容仍在，下一次操作會一併存入）；舊版 HTML 快取期間（最長約 10 分鐘）載入新 script 時，寫入仍受 session 防護，但不會出現「重新載入」按鈕。
- 資料庫／部署風險：未修改 Rules、schema、型錄、競賽統計或正式資料；H-1 仍會在載入後自動改寫部分收藏並寫回（見 D-015）。
- 下一位注意：push 到 `main` 即上線；部署後需以真實帳號在正式網站驗證載入、寫入與重新載入流程。
- Commit / Deploy：未 commit、未 push、未部署。

### 2026-10-29 — Codex

- 任務：Phase 1B 跨 session 安全補修。
- 主要內容：收藏候選、配置刪除理由、Quick Editor 與賽事編輯 dialog 均綁定原始 UID／generation，session 失效時會關閉並使 Promise／callback 失效；cache metadata 不再重建已確認 DOM，相同 cache／server 資料不重複套用，錯誤後可由新 session 安全重試；伺服器確認文件不存在後，首次主頁寫入使用 transaction create-only 防止分頁並行初始化覆蓋。
- 修改檔案：延續 Phase 1 的 10 份檔案，另新增 `tests/data-session-safety.test.mjs`，並擴充 `data-session-guard.js`、`script.js`、`tournament.js`、`tests/manager-ui-refresh.test.mjs`、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`。
- 測試：JavaScript syntax PASS；完整測試 109/109 PASS；其中 15 項為可控 deferred Promise／session／snapshot／transaction 行為測試；網站結構 PASS；production build PASS（31 files，source data unchanged）；`git diff --check` PASS；390×844 與 1440×900 主頁／賽事頁無 overflow、Console Error 0。
- Branch / HEAD：`main` / `1120d859f7a1741d79c1db4225b852d76866c6ff`。
- Git status：保留 Phase 1 未提交修改；目前共 11 份未提交檔案，未 stage。
- 未提交修改：`data-session-guard.js`、`script.js`、`index.html`、`tournament.js`、`tournament.html`、`tests/data-session-safety.test.mjs`、`tests/manager-ui-refresh.test.mjs`、`tests/retirement.test.mjs`、`docs/PROJECT_ARCHITECTURE.md`、`docs/PROJECT_DECISIONS.md`、`docs/AI_HANDOFF.md`。
- 未完成事項：H-1 收藏型錄升級政策實作、H-2 賽事多分頁衝突防護與 M-2 真正遠端資料更新的完整編輯合併仍未處理；目前真正遠端更新會取消並提示未儲存編輯，不會靜默保留或合併草稿。
- 已知問題：正式 Firestore 完整備份／復原方案仍未經驗證；本階段沒有連線正式 Firebase 或測試 production 寫入。
- 資料庫／部署風險：未修改 Rules、schema 或正式資料；未 commit、未 push、未部署。
- 下一位注意：請唯讀重審實際 async handler、snapshot gate 與 transaction create-only 路徑；不要把 H-1、H-2 或 M-2 判定為本階段已修正。
- Commit / Deploy：未 commit、未 push、未部署。

### 2026-10-29 — Codex

- 任務：Phase 0 安全基準與 Phase 1 C-1 雲端資料覆蓋防護。
- 主要內容：新增綁定 UID／generation 的 data session guard；主頁只有 server snapshot 成功後可寫入，讀取失敗、快取未確認、帳號切換與管理員唯讀均封鎖寫入；賽事頁改為 server 首次讀取成功後才可寫入；記錄 H-1 收藏與競賽快照政策，未修改其程式。
- 修改檔案：`data-session-guard.js`、`script.js`、`index.html`、`tournament.js`、`tournament.html`、`tests/manager-ui-refresh.test.mjs`、`tests/retirement.test.mjs`、`docs/PROJECT_ARCHITECTURE.md`、`docs/PROJECT_DECISIONS.md`、`docs/AI_HANDOFF.md`。
- 測試：JavaScript syntax PASS；完整測試 93/93 PASS；網站結構 PASS；production build PASS（31 files，source data unchanged）；`git diff --check` PASS；1440×900 與 390×844 主頁／賽事頁無 overflow、寫入控制在未登入時停用、Console Error 0。
- Branch / HEAD：`main` / `1120d859f7a1741d79c1db4225b852d76866c6ff`。
- Git status：開始時乾淨；目前僅有上述未提交修改。
- 未提交修改：上述 10 份檔案；未 stage。
- 未完成事項：H-1 型錄升級程式與 H-2 多分頁衝突防護依任務要求留待後續階段。
- 已知問題：目前只有賽事欄位的手動 GitHub Actions 備份能力，尚無經驗證的完整 `users/{uid}/appData/main` 正式備份／復原方案；本次未讀取或匯出正式使用者資料。
- 資料庫／部署風險：未接觸正式 Firebase；前端無法取消已送出的 Firestore request，但固定 DocumentReference 可防止帳號切換後寫到另一 UID。
- 下一位注意：請先唯讀檢查 session guard、首次 server read 與 in-flight write 固定 UID；不要把 H-1／H-2 誤判為已修正。
- Commit / Deploy：未 commit、未 push、未部署。

### 2026-10-29 — Codex

- 任務：核對並完善 Codex + Claude 共同維護流程。
- 主要內容：確認唯一正式工作目錄、Git 與實際功能；補齊 OneDrive／worktree 檢查、高風險操作禁止、資料更新界線、系列 Badge 責任與完整交接欄位。
- 修改檔案：`AGENTS.md`、`CLAUDE.md`、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`、`docs/PROJECT_DECISIONS.md`。
- 測試：`node --test` 86/86 PASS；`scripts/validate-site.mjs` PASS；`scripts/build-site.mjs` PASS（30 files，source data unchanged）；`git diff --check` PASS。
- Branch / HEAD：`main` / `834f5dbd771b8d7525053a223358c234496ec886`。
- Git status：開始時乾淨，與 `origin/main` 同步；僅有本次文件修改。
- 未提交修改：上述 5 份協作文件。
- 未完成事項：等待使用者決定是否 commit／push。
- 已知問題：現有週六／週日資料排程不存於 repository；後續維護不得將 GitHub workflow 當成原排程重建。
- 資料庫／部署風險：無；本次未修改 Firebase、資料或部署設定。
- 下一位注意：開始任務前重新讀取本紀錄與 Git diff，不覆蓋未提交文件。
- Commit / Deploy：未 commit、未部署。

### 2026-10-28 — Codex

- 任務：建立 Codex × Claude 雙 AI 協作維護機制。
- 修改檔案：`README.md`、`AGENTS.md`、`CLAUDE.md`、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`、`docs/PROJECT_DECISIONS.md`。
- 主要內容：整理現況架構、權威開發規範、Claude 入口、交接格式與已確認決策；網站程式、CSS、Firebase Rules 與部署設定均未修改。
- 測試：`node --test` 86/86 PASS；`scripts/validate-site.mjs` PASS；`scripts/build-site.mjs` PASS；`git diff --check` PASS。
- 未完成事項：等待使用者確認協作文件。
- 已知問題：正式業務資料目前只存 Firestore；localStorage 只保存 UI 偏好，與部分舊描述中的「本機資料同步」概念不同。
- Git：後續已以 `834f5dbd771b8d7525053a223358c234496ec886` 提交並推送至 `main`。
- Deploy：未部署。
