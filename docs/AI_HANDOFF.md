# AI 工作交接

本文件只記錄可供下一位執行者接手的摘要，不保存聊天逐字稿。最新紀錄置頂。

## 協調狀態

- 目前執行者：無（v1.12.0 已正式部署）
- 寫入範圍：目前沒有進行中的寫入任務
- 正式版本：`b006f165a68a6d652ac13589cb38ac16ddd59ac9`（v1.12.0，`origin/main`，GitHub Pages deployment `8012230899` success）。本筆部署紀錄 commit 只在本機，未 push。
- Phase 7 設計文件已 commit 在 `design/phase7/`；Phase 7-2b 已隨 v1.12.0 部署；Phase 7-2c／7-2d 尚未授權。
- 維護分工：2026-11-23 起由 Claude Code 接手主要程式維護（先前為 Claude Cowork）；ChatGPT 負責架構審查、風險評估與部署驗收。

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

### 2026-11-24 — Claude Code（v1.12.0／Phase 7-2b，正式部署）

- 任務：ChatGPT 核准 v1.12.0 發布準備後，使用者授權 release commit、正式備份驗證、push、GitHub Pages 部署與唯讀驗收。
- 正式 commit：`b006f165a68a6d652ac13589cb38ac16ddd59ac9`（`chore(release): prepare v1.12.0 inventory release`），連同 `6f3f2b5`（v1.11.0 部署紀錄）與 `4267bee`（Phase 7-2b 功能）以 fast-forward 推送 `c18a33f..b006f16`，未 force push。
- 備份：`C:BeybladeBackupseyblade-appData-backup-20261124-060036.json`（使用者以管理員帳號建立，40,317 bytes）；建立時間 2026-11-23T22:00:36.612Z（台灣 06:00:36）；來源 `k89150-web-login`、`users/{uid}/appData/main`；文件數 2（summary 2）；`verify-backup.mjs` PASS；`integrity.documentsSha256` `4a602c7d98721c05e93d99d760dcf9c7ae67ddcb0750bdddca9576bd765524b8`；檔案 SHA-256 `10b7c2896e5b3a0b00091dad2e0fd45eab5959b3089bf7449e445f30809df414`。未還原、未匯入、未寫入；備份工具伺服器已關閉。
- Push 前：Node 350/350；validate-site PASS；build-site PASS（35 files）；`git diff --check` 通過；工作樹乾淨；遠端無新 commit；`origin/main..HEAD` 無 Rules、Schema、型錄、競賽統計資料或交易協定變更（`competition-stats.html` 只有快取參數）；A-09 只有已核准的 deleteRow／editRow D1 差異；使用者確認所有裝置舊分頁與 PWA 已關閉。
- 部署：GitHub Pages build `built`；deployment `8012230899`（`github-pages`）success；workflow `pages build and deployment` run `45275656136` success。
- 部署後唯讀驗收（未登入，內建瀏覽器）：18 個正式檔案（11 頁、`site-menu.js`／`.css`、`script.js`、`collection-view.js`、`style.css`、`collection-sync.js`、`stock-catalog-names.js`）與 commit 逐位元組相同；`SITE_VERSION` v1.12.0，側欄顯示 v1.12.0；首頁載入 `script.js?v=20261124-phase72b`、`site-menu.js?v=20261124-v1120`；五個 `partsSummary*` 摘要存在、舊 id 不存在；原裝陀螺搜尋欄存在且輸入搜尋不出錯（未登入顯示「登入後會顯示你的收藏。」）；零件分頁顯示新說明與摘要；更新紀錄最新為 v1.12.0（6 點）、歷史版本 v1.2.0～v1.11.0；使用說明第三節「零件庫存」9 點、無「使用中」；375px 與 1024px 無水平捲動；資源無 4xx／5xx；Console Error 0。
- 未驗證：登入後的零件卡片、配置引用／超用數字、搜尋結果與 D1 提示在正式資料上的顯示（只在 Emulator 與瀏覽器 harness 驗證過）；登入後 CRUD；正式 `signInWithPopup`；Safari／iOS。
- 既有問題（未處理）：D-018 基準遇連續空白；配置排序造成 configTable 順序後續改寫；三顆一組套組仍顯示「雙陀螺套組」；後備版面順序。
- 資料庫／部署風險：未部署 Rules、未寫入正式 Firestore、未建立測試資料。
- Commit / Deploy：已部署 `b006f16`；本筆紀錄為本機 commit，未 push。

### 2026-11-24 — Claude Code（v1.12.0 發布準備，已 release commit `b006f16`）

- 任務：ChatGPT 複審通過 Phase 7-2b commit 後，授權只更新版本、更新紀錄、使用說明與直接相關的測試及交接文件；不得 commit、push、deploy 或寫入正式 Firestore。
- 主要內容：`SITE_VERSION` v1.11.0 → v1.12.0（只改常數）；11 個載入 `site-menu.js` 的頁面快取參數 `20261124-v1110` → `20261124-v1120`，其他資源快取版本不變（`site-menu.css` 仍為 `v1100`，`style.css`／`script.js` 仍為 `phase72b`）。changelog 新增「v1.12.0｜零件庫存與配置引用」六點（只描述 7-2b 已完成功能），v1.11.0 移入歷史版本（v1.2.0～v1.11.0）。guide 第二節加入原裝陀螺搜尋與英文名限制、刪除影響提示；第三節改名「零件庫存」，說明四個數字、超用、摘要、只有額外持有可改刪、同名多筆各自修改／刪除、刪除／減量／改名提示、無對應引用；移除「配置使用中」說明；常見問題指向零件分頁的可用／超用。
- 修改檔案：`site-menu.js`、`about.html`、`admin.html`、`changelog.html`、`competition-stats.html`、`contact.html`、`guide.html`、`home.html`、`index.html`、`privacy.html`、`tournament.html`、`user-view.html`、`tests/collection-view.test.mjs`、`tests/help-pages.test.mjs`、`tests/manager-ui-refresh.test.mjs`、`docs/AI_HANDOFF.md`。
- 測試：Node 350/350；validate-site PASS；build-site PASS（35 files）；`git diff --check` 通過。測試只更新版本字串、快取參數與更新紀錄位置／日期次數，未放寬功能斷言。
- D1 失敗處理：影響計算發生例外時 `impactTextOrEmpty` 記錄 `console.warn` 並回傳空字串，只顯示原本的確認文字（畫面上與「沒有影響」相同，不會顯示錯誤的「沒有影響」結論）。
- Branch / HEAD：`main` / `4267bee`（Phase 7-2b 功能 commit），領先 `origin/main`（`c18a33f`，v1.11.0）2 筆。
- Git status：上列檔案於 release commit `chore(release): prepare v1.12.0 inventory release` 提交。
- 未完成事項：v1.12.0 尚在發布準備，未 commit、未部署；正式網站仍為 v1.11.0。Phase 7-2c／7-2d 尚未授權。
- Commit / Deploy：已 release commit；正式部署見上方紀錄。

### 2026-11-24 — Claude Code（Phase 7-2b，本機實作，已 commit `4267bee`）

- 任務：使用者授權實作 P2＋S1＋U2＋D1（階段調整：V3、篩選、排序延至 7-2c；詳細面板維持 7-2d；記錄於規格 10 第四部分與 D-021）。
- 主要內容：零件分頁依「類別＋名稱」彙總，顯示原裝內含／額外持有／配置引用／可用（超用），同名多筆額外列在卡片內各自修改／刪除，原裝內含只讀；列出「無對應的配置引用」。摘要改為原裝內含／額外持有／配置引用／超用品項／無對應引用（新 id `partsSummary*`，舊「使用中」公式不再顯示）。原裝陀螺分頁新增搜尋（型號、中文名、零件、只經明確自動帶入標記＋型錄 `recordId` 的英文名、套組代碼），換帳號時清除。刪除收藏、刪除套組、刪除額外零件、減少數量、改名時，在既有 confirm 文字後加入「不足／找不到對應／原本就不夠」提示，只提示不阻擋。
- 計算：新增唯讀區塊 `Phase 7-2b parts model`，以與 `getTotalParts` 相同的規則逐列建立零件數量（使用真實 `addStock`）；配置引用＝`getUsedParts` 逐列結果減去 CX（非抽包）配置的組合上蓋。`getTotalParts`／`getUsedParts` 本體未修改。
- 受保護函式：`deleteRow` 三行、`saveEditRow` 一行，只在 confirm 字串後附加提示（提示計算失敗回傳空字串）；A-09 兩段雜湊更新為 `0bc3c60c31499a7c`、`8be3b0baca010150`，其餘八段不變。D-018、D-015、F-04、Rules、Schema、型錄、競賽統計未修改；沒有新增寫入路徑。
- 修改檔案：`collection-view.js`、`script.js`、`index.html`（搜尋框、摘要、零件區標題與說明、快取版本 `phase72b`）、`style.css`、`tests/collection-parts.test.mjs`（新，15 項）、`tests/collection-view.test.mjs`、`tests/manager-ui-refresh.test.mjs`（K-7 斷言依 P-5 替換）、`tests/assembly-rules.test.mjs`／`tests/collection-sync.test.mjs`（快取版本）、`README.md`／`AGENTS.md`（測試指令）、`docs/PROJECT_DECISIONS.md`、`design/phase7/`（規格 10 第四部分、`verification/phase7-2b/`）。
- 測試：15 個測試檔 350/350 PASS；突變測試（移除 CX 排除、移除 D1 提示、移除無效數量判斷）皆被測到；validate、build、`git diff --check` 見本次回報。瀏覽器整合 174/174（`design/phase7/verification/phase7-2b/`）。Emulator（`exports/emulator-ui-72b/`，`demo-beyblade-72b-ui`，完整網站測試副本只改 Firebase 設定與 Emulator 連線）：以真實表單建立資料後，P2／U2 數字與手算一致、S1 英文名搜尋正確；D1 刪除收藏、刪除零件、改名三次取消後 Emulator `updateTime` 與四表指紋不變；確定刪除零件後只寫入預期資料，畫面出現無對應引用。
- 提交前修正（使用者核准）：額外零件數量不是有限數字（例如 "abc"、"NaN"、"Infinity"）時，P2 不計入（卡片標「未計入」、摘要不出現 NaN）；既有 `getTotalParts` 對這類值會得到 NaN／Infinity，本體未修改，只有這類列與它不同（測試已註明）。正式備份 20261124-050655 的 19 筆額外零件沒有這類數量。
- 發現（既有、非 7-2b）：新增配置後 `saveData` 先以新增順序儲存，80ms 後既有 `installConfigSort` 才排序畫面，下一次任何儲存會把 `configTable` 以排序後的順序重寫（內容相同、只有順序）。
- 未驗證：正式網站登入流程、Safari／iOS；版本號與說明頁尚未更新（未授權）。
- Commit / Deploy：未 commit、未 push、未部署。

### 2026-11-24 — Claude Code（v1.11.0／Phase 7-2a，正式部署）

- 任務：經使用者授權正式上線 v1.11.0（Phase 7-2a 收藏與零件分頁）。
- 版本 commit：`c18a33f`（chore(release): prepare v1.11.0 collection UI release，16 檔：`SITE_VERSION`、11 頁 `site-menu.js?v=20261124-v1110`、更新日誌、使用說明、3 個測試檔與本文件）。
- 正式備份（部署前，使用者以管理員帳號操作既有工具 `exports/firestore-backup-tool/`，只讀取）：`C:\BeybladeBackups\beyblade-appData-backup-20261124-050655.json`，建立時間 2026-11-23T21:06:55Z，來源 `k89150-web-login`，2 份文件，檔案 SHA-256 `2dacc906334578ddfb302fab8e4fe01c90922168a7e37c637036bbd0c832bb2e`，文件整體 SHA-256 `4a602c7d…524b8`（與 11-23 備份相同，期間正式資料未變）；`verify-backup.mjs` PASS（工具測試 9/9）。
- 部署前檢查：遠端仍為 `5c32213`、可快轉、工作樹乾淨；333/333 PASS；validate PASS；build PASS（35 files）；受保護檔案與 `origin/main` 相比只有 `competition-stats.html` 的 site-menu.js 快取參數；`SITE_VERSION` v1.11.0；11 頁載入 v1110；主頁載入 `script.js`／`style.css`／`collection-view.js` 的 `20261124-phase72a`。使用者確認所有裝置的舊收藏／賽事頁與 PWA 已關閉。
- Push：`git push origin main`，`5c32213..c18a33f`（快轉，無 force push），4 個 commit：`50169d7`、`3a3fc75`、`b6d10b8`、`c18a33f`。
- GitHub Pages：build `built`（`c18a33f`）；deployment `8011069119` success；workflow run `45266577803` success。
- 部署後唯讀驗收（瀏覽器確認沒有正式網站 Firebase 登入資料，未登入）：35 個網站檔案與 `c18a33f` 逐位元組相同。375 寬：側欄 v1.11.0、顯示層啟用且未回退、主要 JS／CSS 8 項 200（含 `collection-view.js`）、版本列「5B（交易保護）」、原始表格 clip 隱藏、分頁切換、新增區展開／收合、＋新增→新增零件聚焦 `#partName`、＋新增→新增收藏聚焦 `#model`、底部導覽五項不變。1024 寬分頁與側欄新增按鈕正常。更新日誌最新 v1.11.0（6 項）、歷史 v1.2.0～v1.10.0；使用說明新段落存在。各頁無水平捲動、Console Error 0。
- 正式 Firestore：備份只讀取；部署與驗收沒有任何寫入；Rules、Schema、型錄、競賽統計未修改，也沒有還原或匯入。
- 未驗證：正式網站登入後的新增／修改／刪除（包含正式版 `signInWithPopup`；登入後流程只在 Emulator 測試副本以 redirect 驗證）；Safari／iOS。
- 既有待處理（未修正）：上蓋名稱含連續空白／TAB 時 D-018 載入基準可能不一致；三顆套組刪除確認仍寫「雙陀螺套組」；回退表格介面時收藏表格排在零件區之後。
- Commit / Deploy：`c18a33f` 已 push 並部署；本筆紀錄為本機 commit，未 push。

### 2026-11-24 — Claude Code（Phase 7-2a 部署前版本與說明）

- 任務：部署前只更新版本資訊、更新日誌與使用說明；不改功能。
- 版本：v1.11.0（Phase 7-2a 為功能更新，沿用 minor 版號慣例；v1.11 未曾使用）。`SITE_VERSION` 只在 `site-menu.js` 定義並顯示於側欄底部，該檔只改這一行；11 頁 `site-menu.js?v=` 改為 `20261124-v1110`，`site-menu.css` 未變維持 `v1100`。
- 更新日誌：新增 v1.11.0（2026-11-24）六項，只描述已完成的 7-2a；v1.10.0 移入歷史版本（範圍改為 v1.2.0～v1.10.0）。
- 使用說明：加入分頁切換、展開／收合新增區、手機「＋新增」進入方式、收藏刪除、零件修改（顯示原本表格，保存／取消／Esc）與刪除、登出清除新增區；未描述 7-2b～7-2d。
- 測試同步（版本字串直接造成）：`help-pages`（site-menu.js 版本、最新版本與日期次數 1→2、歷史範圍）、`manager-ui-refresh`（SITE_VERSION）、`collection-view`（site-menu.js 版本，另加 site-menu.css 仍為 v1100）。
- 未修改：`script.js`、`index.html` 結構、`style.css`、`collection-view.js`、D-018／D-015／F-04、Rules、Schema、型錄、競賽統計。
- Commit / Deploy：本機 commit（chore(release): prepare v1.11.0 collection UI release）；push／部署依 v1.11.0 上線程序另行記錄。

### 2026-11-24 — Claude Code（Phase 7-2a，登入後整合驗收，未修改程式）

- 任務：以完整網站程式＋Firebase Emulator 補做登入後真實頁面驗收（CRUD、Q1-E1、K4-E1／E2、D-018 衝突）。未修改任何專案程式。
- 環境與隔離：測試副本在被 Git 忽略的 `exports/emulator-ui-72a/`（`site/` 為專案根目錄 35 個網站檔案的複本）。只有兩個檔案的副本被修改，其餘 33 個與專案逐位元組相同：`script.js`（Firebase 設定改為 `demo-beyblade-72a-ui`、連線 Auth Emulator 127.0.0.1:9199 與 Firestore Emulator 127.0.0.1:8185、非 localhost 拒絕執行；因內建瀏覽器窗格不支援彈出視窗，登入改用 `signInWithRedirect`，仍是同一個 Google provider）、`site-menu.js`（同一份 demo 設定；管理選單檢查先建立 Auth 時也連 Emulator）。頁面實際回報 projectId `demo-beyblade-72a-ui`；網路紀錄中 Firestore 讀寫全部為 `127.0.0.1:8185/v1/projects/demo-beyblade-72a-ui`，沒有任何 https 請求。測試帳號 tester-a／tester-b@example.test 只存在 Emulator。
- 結果（全部在真實頁面、真實 `addRow`／`addPart`／`deleteRow`／`editRow`／`saveEditRow`／`cancelEditRow`／D-018／F-04 程式上執行；確認對話框以記錄並回答的方式取代原生 confirm，因窗格無法點選原生對話框）：
  - CRUD：新增 UX-01、新增 BX-01×3 刪第二顆（以元素參照確認刪的是第二列）、新增 UX-21 套組由成員刪除（既有確認列出三顆、整組刪除）、新增零件、修改保存、修改後確認取消仍在編輯、Esc 取消、刪除零件：全部 PASS；每步原始表格、R2 顯示層與 Emulator 文件一致。
  - 非寫入操作（切分頁、篩選、搜尋、收合、鍵盤）與重新整理：Emulator `updateTime` 不變；重新整理後登入保持、資料與重新整理前一致。
  - Q1-E1：A 輸入未送出內容＋開啟零件編輯 → 另一分頁登出 → 11 個新增欄位清空、類別回「上蓋」、搜尋清空、F-04 提示（遮蔽 email、未登入不可下載）→ 另一分頁以 B 登入 → B 看不到 A 的輸入或草稿、B 的文件未建立 → 切回 A → 草稿依原規則（完整 email、可捨棄；此草稿只有編輯視窗、無資料表可下載）→ 同 UID 遠端快照時輸入保留：全部 PASS。
  - K4-E1（同款多顆）、K4-E2（套組）、修改版本：另一分頁刪除或修改後，本分頁原始列已重建，帶舊目標的點擊只提示「資料已更新」，沒有確認、沒有刪除或進入編輯：PASS。
  - D-018：兩分頁幾乎同時刪除同一資料表的不同列 → 後送出者被拒絕並顯示衝突、未寫入，雲端只有先送出者的變更；衝突期間顯示層按鈕停用；「載入雲端最新資料」後恢復：PASS。
- 發現：
  - 測試副本初版的 Auth 初始化競態（`site-menu.js` 先建立 Auth，`connectAuthEmulator` 拋錯導致 `script.js` 停止）。只存在於測試副本（正式版不呼叫 `connectAuthEmulator`），已在副本修正。該次載入出現一筆來源未確認的 400 錯誤，推測是未連 Emulator 的 Auth 實例嘗試向 Google token 服務刷新 Emulator 假 token（只含假 token 與 demo-api-key，未記錄到請求，未涉及正式資料）。
  - 背景分頁不執行 requestAnimationFrame，R2 顯示層在分頁回到前景的第一個畫格才更新；期間舊目標仍由操作前檢查擋下。非缺陷，不需修改。
  - 既有文案：三顆的 UX-21 套組刪除確認仍寫「雙陀螺套組」（7-2a 前就存在）。
- 未驗證：正式版的 `signInWithPopup` 流程（測試副本改用 redirect）；Safari／iOS。
- Commit / Deploy：已與 7-2a 實作一起本機 commit（見上方「目前執行者」），未 push、未部署；Emulator 與測試伺服器已關閉。

### 2026-11-24 — Claude Code（Phase 7-2a，本機實作，未 commit）

- 任務：依使用者核准的 Phase 7-2a（T1 分頁、R2 基礎顯示層、Q1 可收合新增表單、D-020 快速新增銜接、Q1 跨帳號清除），規格 `design/phase7/10-phase7-2-collection-parts-review.md`（含第三部分技術補強）。決策記錄為 D-021。
- 主要內容：收藏頁改為「原裝陀螺／零件」分頁；原始 `#beybladeTable`、`#partTable` 移到分頁區段外的 `#collectionSourceTables`，標記不變，只以 clip＋`inert`＋`aria-hidden` 隱藏；新的顯示層讀原始列畫清單（每列一項），刪除／修改以原始列按鈕呼叫既有 `deleteRow`／`editRow`，呼叫前確認原始列仍存在且內容未變；修改額外零件時直接顯示原始表格在原列編輯；初始化失敗回到原始表格。新增表單原位包成可收合面板（清單為空時展開）。`#add-collection`／`#add-part` 切分頁、展開、聚焦既有欄位（`site-menu.js` 未改）。`handleAuthStateChange` 在 F-04 草稿擷取與 `cancelSessionInteractions()` 後清空新增表單並重設顯示層搜尋與篩選（同 UID 不清）。零件篩選在顯示層啟用時不再隱藏原始列。
- 未修改：D-018 區段、`getTableData`、`collectCurrentData`、`applyDataToTables`、D-015 函式、`deleteRow`／`editRow`／`saveEditRow`、`getTotalParts`、`collection-sync.js`、`site-menu.js`、Firebase／Rules／Schema、型錄、競賽統計（`tests/collection-view.test.mjs` 以雜湊鎖定 10 個區段與 `50169d7` 相同）。7-2b～7-2d 功能（搜尋排序、P2、V3、S1、U2、D1、詳細面板、N2）未實作。
- 修改檔案：`index.html`（結構、`style.css?v=20261124-phase72a`、`script.js?v=20261124-phase72a`）、`script.js`、`style.css`、`collection-view.js`（新）、`tests/collection-view.test.mjs`（新，20 項）、`tests/helpers/manager-page-harness.mjs`（新增選用參數 `extraElements`）、`tests/assembly-rules.test.mjs`／`tests/collection-sync.test.mjs`（script 快取版本字串）、`README.md`／`AGENTS.md`（測試指令、模組說明）、`docs/PROJECT_DECISIONS.md`（D-021；D-020 狀態改為已部署）、`docs/PROJECT_ARCHITECTURE.md`、`design/phase7/`（規格狀態、`verification/phase7-2a/`）。
- 測試（使用者 Windows 本機，Node 24.18）：14 個測試檔 333/333 PASS（313＋新增 20）；Q1 突變測試（移除清除呼叫）5 項失敗、還原後全過；validate PASS；build PASS（35 files）；`git diff --check` PASS。瀏覽器整合驗證 `design/phase7/verification/phase7-2a/`（真實原始碼切片＋真實頁面與樣式，Chromium 156）：390／768／1440 × 深色／米色各 29 項＋失敗回退 5 項，179/179 PASS（K-1、A-01～A-05、A-08、R2、D-020、Q1、K4-01／04／06、K5）。本機預覽（未登入）：6 種寬度／主題無水平捲動、分頁與 clip 正確、Console Error 0；375 寬實際操作 ＋新增→新增零件／新增收藏、同 hash 重按、側欄「零件」、分頁方向鍵／End 皆正確。
- Emulator：`exports/firebase-emulator-6a`（`demo-beyblade-h2-test`，8185／9199）對含 7-2a 修改的工作樹執行 M01–M16 PASS 16／FAIL 0（D-018 交易與 F-04）。結果檔「專案檔案是否未被修改：否」是因為執行期間本人同時編輯 `docs/PROJECT_ARCHITECTURE.md`、`docs/PROJECT_DECISIONS.md`，非 Emulator 寫入。
- 未執行／未驗證：Q1-E1、K4-E1／E2 等以真實登入 UI 操作的 Emulator 情境（現有 Emulator 工具以陣列代替頁面，沒有新增表單與顯示層）；登入後在真實頁面新增、刪除、修改的操作；Safari／iOS（K-2）；大量收藏的效能（K-3）。
- 已知問題（既有、未修正）：收藏或配置上蓋欄含連續空白／TAB 時，D-018 載入後取得的畫面基準與卡片樣式套用後讀到的值不同，可能被視為有變更（見 `design/phase7/verification/phase7-2a/README.md`）；需調整 D-018 基準時點，超出本階段授權。
- Commit / Deploy：本機 commit（feat(collection): implement phase 7-2a tabs and read-only views），未 push、未部署。

### 2026-11-24 — Claude Code（Phase 7-1，正式部署）

- 任務：經使用者授權 push 並部署 Phase 7-1（全站導覽，D-020）。
- 部署前檢查：乾淨 clone 發現 `tests/site-navigation.test.mjs` 讀取 `site-menu.css` 未正規化換行，在 Windows（`core.autocrlf=true`）checkout 下失敗 1 項；經使用者同意另以 `5c32213` 修正（只改測試）。修正後乾淨 clone 313/313 PASS、validate PASS、build PASS（34 files）。差異只含導覽、頁面版本字串、說明文字、測試與文件；資料、儲存、同步、組裝規則、型錄、統計、Firebase、workflow 檔案皆未變更。`design/` 已確認不含個人資料或金鑰（部署後會公開可讀）。
- Push：`git push origin main`，`f1df0bc..5c32213`（快轉，無 force push），共 4 個 commit：`38afe4d`、`64263e4`、`1b6a989`、`5c32213`。推送前確認遠端仍為 `f1df0bc`、工作區乾淨。
- 正式版本：`5c32213934b9e955b9e4222f1b6fb14fb34b6cde`。GitHub Pages（legacy，`main` 根目錄）建置 `built`；deployment `8005259788` success；workflow run `45221998763` success。
- 部署前：備份以既有 `C:\BeybladeBackups\beyblade-appData-backup-20261123-062202.json` 為準（檔案可正常解析；本機找不到 `verify-backup.mjs`，本次未重新以該工具驗證〔2026-11-24 更正：工具其實在被 Git 忽略的 `exports/firestore-backup-tool/`，當時漏查該資料夾〕）；舊分頁關閉以使用者授權回覆為確認（比照 Phase 7-R）。本次未改變任何儲存路徑。
- 部署後唯讀驗收（瀏覽器確認沒有 Firebase 登入資料，未登入狀態）：17 個正式檔案與 commit 逐位元組相同。主頁（375 寬）載入 `site-menu.js?v=20261124-v1100`、`script.js`／`assembly-rules.js?v=20261123-phase7r`（未變），顯示 v1.10.0 與「收藏儲存版本：5B（交易保護）」；底部導覽「收藏／配置／＋新增／賽事／更多」、收藏 active；＋新增開啟五項、Escape 關閉並還原焦點。賽事頁載入 `tournament.js?v=20261029-phase4b1`（未變）、賽事 active、日期欄位存在。競賽統計（1024 寬）側欄有新增按鈕、競賽統計 active、底部導覽隱藏。三頁無水平 overflow，Console Error 0。
- 未驗證：未登入，未在正式網站實際新增收藏、零件或比賽（只驗證導向與聚焦）。
- 正式 Firestore：部署過程沒有任何寫入；Rules、Schema 未修改。
- Commit / Deploy：`5c32213` 已 push 並部署；本筆紀錄為本機 commit，未 push。

### 2026-11-24 — Claude Code（Phase 7-1，導覽骨架）

- 任務：依使用者核准的 `design/phase7/09-phase7-1-navigation-spec.md`（含三項預設：側欄「零件」放在收藏下、「記錄回合」開啟賽事頁、版本 v1.10.0）實作全站導覽（D-020）。
- 主要內容：手機底部導覽改為「收藏／配置／＋新增／賽事／更多」；新增「＋新增」快速選單（新增收藏、新增零件、建立配置、新增比賽、記錄回合），手機為底部 sheet、桌面為側欄上方按鈕＋popover；「更多」開啟側欄；競賽統計移到側欄「參考」。快速新增只以 hash 導向既有欄位並聚焦，不寫入資料。新增 `--ui-*` 設計 tokens（深色／米色）。版本 v1.10.0，更新日誌與使用說明同步。
- 修改檔案：`site-menu.js`、`site-menu.css`、11 個 HTML 頁（`site-menu.*?v=20261124-v1100`；`style.css`、`script.js`、`tournament.js` 版本未變）、`guide.html`、`changelog.html`、`tests/site-navigation.test.mjs`（新）、`tests/help-pages.test.mjs`、`tests/manager-ui-refresh.test.mjs`、`README.md`／`AGENTS.md`（測試指令、導覽契約）、`docs/PROJECT_DECISIONS.md`（D-020；D-019 狀態改為已部署）、`docs/PROJECT_ARCHITECTURE.md`、`design/phase7/`（規格 09）。
- 測試（使用者 Windows 本機，Node 24.18）：13 個測試檔 313/313 PASS（307＋新增 6）；validate PASS；build PASS（34 files）；`git diff --check` PASS。本機預覽（未登入）：11 頁 × 390／768／1440 × 深色／米色無水平 overflow、Console Error 0、active 狀態正確（主頁→收藏、賽事頁→賽事、其他→更多）；375 寬實際操作：＋新增開啟並聚焦第一項、方向鍵移動、Escape 關閉並還原焦點、點背景關閉、更多開啟側欄、新增零件導向 `#add-part` 並聚焦 `partName`。
- 未驗證：登入後的實際新增流程（只驗證導向與聚焦）；賽事頁 `#add-tournament` 只由測試確認欄位存在。
- 資料庫／部署風險：無資料、Schema、Rules、交易流程變更。部署只需確認載入 `site-menu.js?v=20261124-v1100`；舊分頁只會顯示舊導覽。
- 下一位注意：底部導覽與「＋新增」內容是 D-020 契約，改動需使用者核准；收藏「零件」分頁化、組裝器、賽事面板屬後續 Phase。
- Commit / Deploy：本機 commit，未 push、未部署。

### 2026-11-23 — Claude Code（Phase 7-R，正式部署）

- 任務：經使用者授權 push 並部署 Phase 7-R（組裝規則修正，D-019）。
- Push：`git push origin main`，`2c8e4a8..f1df0bc`（快轉，無 force push），共 2 個 commit：`2e3890f`（Phase 6D-2 部署紀錄）、`f1df0bc`（Phase 7-R）。推送前確認遠端仍為 `2c8e4a8`、HEAD 為 `f1df0bc`、工作區只有未追蹤的 `design/`。
- 正式版本：`f1df0bc5da31eeaed64c6ea5a32e5074f4a731fa`。GitHub Pages（legacy，`main` 根目錄）建置 `built`；deployment `7989712953` success；workflow run `45106257808` success。
- 部署前：使用者確認舊分頁已關閉（以授權回覆為確認）；備份以 `C:\BeybladeBackups\beyblade-appData-backup-20261123-062202.json` 為準（使用者選擇不另做新備份；部署前再次以 `verify-backup.mjs` 驗證 PASS）。部署前檢查：乾淨 clone 307/307 PASS、validate PASS、build PASS（34 files）、受保護檔案無變更、D-018 儲存區段雜湊不變。
- 部署後唯讀驗收（瀏覽器沒有 Firebase 登入資料，未登入狀態）：11 個正式檔案與 commit 逐位元組相同；主頁載入 `script.js?v=20261123-phase7r`，`assembly-rules.js?v=20261123-phase7r` 回應 200，版本列「收藏儲存版本：5B（交易保護）」；賽事頁載入 `tournament.js?v=20261029-phase4b1`（未變更）；兩頁 Console Error 0，1440 與 375 寬無水平 overflow。
- 未驗證：未登入，未在正式網站實際操作配置編輯器（惡魔冥界／Op 自動無固鎖、違規阻擋）；這些路徑只以測試執行真實程式驗證。
- 正式 Firestore：部署過程沒有任何寫入；Rules、Schema 未修改。
- 仍待決定（Phase 7）：是否新增首頁工作台、Schema 擴充、型錄譯名核對（BX-50-04、CX-11-02）、輔助戰刃 G 是否為グラビティ、`design/phase7/` 是否 commit；UI 改造（導覽、收藏與零件、組裝器、賽事面板）尚未實作。
- Commit / Deploy：`f1df0bc` 已 push 並部署；本筆紀錄為本機 commit，未 push。

### 2026-11-23 — Claude Code（Phase 7-R，組裝規則修正）

- 任務：依使用者核准的 `design/phase7/07-rules-fix-spec.md`，修正現行程式與官方組裝規則不一致之處（D-019）。Phase 7 設計方向已定案：A 工作台骨架、賽事回合記錄採 C 大按鈕面板、手機底部導覽「收藏／配置／＋新增／賽事／更多」、庫存併入收藏「零件」分頁、官方規則阻擋儲存；其餘 UI 改造尚未實作。
- 主要內容：新增 `assembly-rules.js`；`script.js` 的規則函式改為呼叫它（函式名稱與呼叫端保留），惡魔冥界與 Op 軸不再被要求填固鎖，擋下 UX 擴展戰刃＋Tr／Op、時鐘幻象非白名單固鎖；修改既有配置只擋新產生的違規。`index.html` 改為 `script.js?v=20261123-phase7r`。收藏儲存版本列維持 5B。交易、Session、賽事、型錄、統計、資料格式皆未修改。
- 修改檔案：`assembly-rules.js`（新）、`script.js`、`index.html`、`tests/assembly-rules.test.mjs`（新）、`tests/collection-autofill-safety.test.mjs`、`tests/manager-ui-refresh.test.mjs`、`tests/collection-sync.test.mjs`、`README.md`／`AGENTS.md`（測試指令）、`docs/PROJECT_DECISIONS.md`（D-019）、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`。
- 測試（使用者 Windows 本機，Node 24.18）：12 個測試檔 307/307 PASS（296＋新增 11）；型錄 234 筆官方產品全部通過規則；規則 mutation 7 項皆被測到；validate PASS；build PASS（34 files，含新模組）；`git diff --check` PASS；本機預覽主頁載入新模組 200、Console Error 0、390／1440 無 overflow。配置編輯器需登入，該路徑以 VM 執行真實程式驗證，未在瀏覽器中實際操作。未修改交易流程，未跑 Emulator。
- 部署注意：需另行授權；比照 D-017／D-018 程序（備份、關閉舊分頁、確認載入 `script.js?v=20261123-phase7r`）。舊版分頁仍會要求惡魔冥界／Op 填固鎖，但不會破壞資料。
- Commit / Deploy：本機 commit，未 push、未部署。

### 2026-11-23 — Claude Code（Phase 6D-2，正式部署）

- 任務：經使用者授權 push 並部署 Phase 6A／6C 的 8 個 commit。
- Push：`git push origin main`，`5617f4e..2c8e4a8`（快轉，無 force push）。推送的 8 個 commit 依序為 `ed4fee9`、`e6adf58`、`2558b7b`、`6987553`、`67ab4c1`、`a6ed126`、`d390749`、`2c8e4a8`。推送前 `git fetch` 確認遠端仍為 `5617f4e`、工作區乾淨。
- 正式版本：`2c8e4a85cb572dd959a87416324d8dc3b963717e`。GitHub Pages（legacy，`main` 根目錄）建置 `built`；deployment `7986025514`（github-pages）狀態 success；workflow run `45077711900`（pages-build-deployment）success。
- 部署前備份：使用者以既有備份工具建立 `C:\BeybladeBackups\beyblade-appData-backup-20261123-062202.json`（2026/11/23 06:22 台灣時間），`verify-backup.mjs` 驗證 PASS（`k89150-web-login`，2 份文件，整體 SHA-256 `4a602c7d…524b8`，與 2026-11-02 備份相同，代表期間正式資料未變）。部署前使用者已關閉所有裝置的舊主頁、賽事頁與 PWA。
- 部署前測試（Phase 6C／6D-1，非部署後重新執行）：`2c8e4a8` 乾淨 clone 上 Node 296/296 PASS、validate PASS、build PASS（33 files）、`git diff --check` PASS；Emulator M01–M16 PASS 16／FAIL 0（對 `d390749`，與 `2c8e4a8` 只差交接文件）。
- 部署後唯讀驗收：瀏覽器在該網站沒有 Firebase 登入資料，以未登入狀態檢查，不可能觸發寫入。首頁與賽事頁正常開啟，靜態資源全部 200，Console Error 0，桌面與 375 寬無水平 overflow；首頁載入 `script.js?v=20261123-phase6a`、顯示「收藏儲存版本：5B（交易保護）」；賽事頁載入 `tournament.js?v=20261029-phase4b1`、顯示「賽事儲存版本：4B-1（交易保護）」。19 個正式檔案（主要 JS／HTML、主資料庫、官方型錄、7 份競賽快照）與 commit blob 逐位元組相同。
- 已部署：R3 匯入器（D-016）與 6 份補回快照、R9 文件、F-04（含 Phase 6C 跨帳號隔離）、備份 workflow 的直接還原停用。遠端 workflow 只剩 Backup Recent Tournament Records、Deploy Firestore Rules 與 Pages 建置；沒有 `restore_to_main` 與 `updateMask.fieldPaths`；正常備份路徑存在；部署期間沒有執行任何備份或還原 workflow。
- 正式 Firestore：部署過程沒有任何寫入（沒有 Firestore 呼叫、沒有執行 workflow，只有本機備份檔的唯讀驗證）。Rules、Schema 未修改。
- 仍待處理：F-06（型錄升級以整表強制寫入，載入後立即儲存期間可能產生表層級衝突；需修改 D-018 核心協定，暫不處理）；競賽統計匯入器驗證協定（寫死數值改為預期值檔＋完整性檢查，已提設計，待核准）；F-05、F-08 找不到原始定義，維持「無法確認」。
- 下一位注意：使用者重新開啟網站時，每台裝置應看到上述兩個版本列；看不到時先重新整理，仍看不到不要在該裝置編輯。
- Commit / Deploy：`2c8e4a8` 已 push 並部署至 GitHub Pages；本筆紀錄為本機 commit，未 push。

### 2026-11-23 — Claude Code（Phase 6C，部署前補強）

- 任務：F-04 草稿跨帳號隔離；停用備份 workflow 的直接還原。
- F-04（`67ab4c1`）：草稿綁定擁有者 UID。只有同一帳號在該分頁重新登入（Firebase Auth）後，才顯示內容、表名與完整 email，並可下載或確認捨棄。未登入時只顯示遮罩 email 與份數；其他帳號只看到「有另一個帳號的未儲存資料」，無法查看、下載或捨棄。捨棄只清除目前帳號自己的草稿。仍只存在分頁記憶體，不寫入任何帳號、不會自動提交。殘餘：同分頁的 JavaScript 記憶體仍含草稿，能開啟開發者工具的人可讀取（瀏覽器本身的限制，UI 與下載不提供）。
- Workflow（`a6ed126`、`d390749`）：`backup-recent-tournament-records.yml` 移除 `restore_to_main` 輸入、環境變數與覆寫 `appData/main` 的 PATCH；唯一寫入經 `write_recovery_document()` 限制在 `users/{uid}/recovery/`；正常備份（readTime 掃描＋私人備份）不變；`backup_id` 只唯讀檢查。測試：靜態檢查＋以模擬網路實際執行內嵌 Python（設定 `RESTORE_TO_MAIN=true`），兩者對舊版 workflow 都會失敗。`a6ed126` 單獨會讓 `retirement.test.mjs` 的排程保護測試失敗 1 項（該測試要求所有 workflow 等於 `a1f4159`），由 `d390749` 改為只允許備份 workflow 等於審查後的 `a6ed126` 版本，其他 workflow 仍須等於 `a1f4159`。
- 測試（使用者 Windows 本機，Node 24.18）：11 個測試檔 296/296 PASS；validate PASS；build PASS（33 files）；`git diff --check` PASS。F-04 隔離 mutation 6 項、workflow mutation（移除 guard）皆被測到。Emulator：`exports/firebase-emulator-6a/` 對 `d390749` 執行 M01–M16 PASS 16／FAIL 0（M16 新增 B 無法匯出／捨棄 A 的草稿、A 重新登入後可存取且不寫入）。8085 埠被使用者另一個專案的 Emulator 佔用，本次改用 8185／9199，未關閉該程序。
- 完整性：自 `5617f4e` 起 `collection-sync.js`、`tournament-sync.js`、`tournament.js`、`data-session-guard.js`、Rules、官方型錄、主資料庫與 10-18 快照皆無變更；`script.js` 的 D-018 儲存區段雜湊不變。未寫入正式 Firestore。
- Commit / Deploy：本機 commit，未 push、未部署。

### 2026-11-23 — Claude Code（Phase 6A／6B 批次）

- 任務：R3 收尾、F-04、F-05～F-08 盤點、R9 文件整理、匯入器驗證與還原 workflow 的唯讀審查。
- Commit（本機，未 push）：`ed4fee9` R3 匯入器；`e6adf58` 補回 6 份歷史快照；`2558b7b` F-04；R9 文件 commit 見 `git log`。
- R3：中斷注入 `COMPETITION_IMPORT_FAULT` 只在含 `.competition-import-test-workspace` 標記、且不是 Git 檢出的暫存目錄生效，其他地方設定會在寫入前直接停止（新增測試 R3-11b）。
- F-04：主頁 `onAuthStateChanged` 改為呼叫 `handleAuthStateChange()`。其他分頁登出、切換帳號（或同帳號重複事件）時，清除前把未儲存的收藏資料表保留在記憶體，以 alert 與 `#collectionDraftNotice` 告知，可下載 JSON（不含 UID）或確認後捨棄；不寫入任何帳號、不會在 Session 恢復後自動提交；本頁確認登出則不保留。`collection-sync.js` 與 D-018 交易協定未修改。`script.js?v=20261123-phase6a`；收藏儲存版本列仍為 5B。
- F-05、F-08：Git 歷史、文件、測試與 `exports/` 都找不到原始定義，標記「無法確認」，未修改。F-06：評估後不修改（見下）。F-07：衝突處理文字與實際行為一致，結案。
- 測試（使用者 Windows 本機，Node 24.18）：11 個測試檔 291/291 PASS；validate PASS；build PASS（33 files）；`git diff --check` PASS；瀏覽器 390／1024 寬主頁無水平 overflow、Console Error 0、未儲存資料提示樣式正常。F-04 mutation 5 項皆被測到。
- Emulator（本次重新執行）：2026-11-23 在使用者本機以 `exports/firebase-emulator-6a/`（複製 5B 工具，HEAD 檢查改為 `2558b7b`，新增 M16 F-04 與每項 180 秒逾時）對 `2558b7b` 執行 Firestore＋Auth Emulator（`demo-beyblade-h2-test`），M01–M16 PASS 16／FAIL 0，專案檔案未被修改。前兩次嘗試在 M04 停住，原因是 PowerShell `*>` 轉向造成輸出管道阻塞；改用檔案轉向直接執行 `firebase emulators:exec` 後正常（未經 ps1 包裝，Git 與單元測試由本次另外執行）。歷史紀錄：E01–E16（2026-10-29）、M01–M15（2026-10-30）見 `docs/PROJECT_DECISIONS.md`。
- 已知問題：F-06 型錄升級以整個 `beybladeTable` 強制寫入，載入後立即儲存期間若其他裝置改同表會成為衝突（D-018 表層級保守設計，影響小，未修改）；匯入器寫死的統計數值仍需每週手動更新（已提設計，未實作）；`backup-recent-tournament-records.yml` 的 `restore_to_main` 有覆寫風險（已提建議，未修改）。
- 資料庫／部署風險：未寫入正式 Firestore、未修改 Rules／Schema、未 push、未部署。F-04 部署時須比照 D-017／D-018 部署程序：關閉所有裝置的舊主頁，部署後確認載入 `script.js?v=20261123-phase6a`。
- Commit / Deploy：本機 commit，未 push、未部署。

### 2026-11-23 — Claude Code（Phase 6A-2，R3）

- 任務：競賽統計匯入器刪除歷史快照（R3）修正，並補回 6 份歷史快照（D-016）。
- 根本原因：`import-competition-statistics.mjs` 每次匯入以 `rmSync` 刪除所有其他日期快照（`266691c` 起）；同檔名時不比內容直接覆寫；舊測試反而要求目錄只有一份快照、腳本必須含 `rmSync`。
- 主要內容：實作 D-016 R-1～R-6（永不刪除／覆寫、內容 hash 為版本身分、檔名日期＝`metadata.generatedAt`、整個歷史目錄去重、等於較舊快照拒絕回退、同日期不同內容中止、`wx` 排他建立、主資料暫存檔＋改名前確認未被修改、只在可驗證狀態下恢復、匯入鎖）。原有來源驗證全部保留。快照與主資料寫入不是原子交易，中斷狀態在下次執行時偵測。
- 變更分兩組（供分別 commit）：
  - A 程式修正：`scripts/import-competition-statistics.mjs`、`tests/competition-statistics.test.mjs`、`docs/PROJECT_DECISIONS.md`（D-016）、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`。
  - B 歷史快照補回：`competition-statistics/` 新增 2026-08-29、09-06、09-13、09-20、09-27、10-14 六份，取自原始 commit blob，`git hash-object` 與原 blob 完全相同；未修改內容、未補欄位；10-18 未變。
- 測試（使用者 Windows 本機，Node 24.18）：全部 11 個測試檔 286/286 PASS（270＋新增 16，含中斷注入只在測試工作區生效的保護）；R3 測試皆在暫存目錄執行真實匯入器，並驗證正式快照與主資料逐位元不變；A 組單獨套用於 CRLF 檢出的暫存 clone 亦全部 PASS；mutation 8 項（取消 `wx`、同名檢查、回退檢查、歷史 hash 檢查、鎖、主資料變更檢查、暫存檔清除、恢復條件）皆被測到；validate PASS；build PASS（33 files）；`git diff --check` PASS。
- 已知問題：匯入器內寫死的筆數與 hash 仍需每週手動更新（未在本階段處理）；repo 外的 ChatGPT 週日 20:00 排程無法由本機檢查，需確認它不依賴「目錄只有一份快照」或同日重跑覆寫；中斷後殘留的鎖檔需人工移除。
- 資料庫／部署風險：未修改 Firestore、Rules、`script.js`、`collection-sync.js`、`tournament.js`、`tournament-sync.js`、官方型錄或主資料內容；網站不讀取歷史快照。
- Commit / Deploy：未 commit、未 push、未部署。

### 2026-10-30 — Claude（Phase 5B-2C-1）

- 任務：修正 Phase 5B-2B 獨立審查的 F-01、F-02，並最小修正 F-03。
- 主要內容：F-01：`planCollectionCommit()` 只有在有證據（本頁結果不明提交的確切內容、同一次儲存流程的結果不明嘗試、型錄升級的確切內容）時，才把「雲端等於預期」判為已完成；證據存在 tracker 內，依帳號／目標、資料表、內容綁定，確認提交、套用雲端或重設時清除；沒有證據一律衝突。F-02：疑似舊快照改由 `getDocFromServer` 確認，不用時間判斷；讀取失敗重試兩次後直接顯示最新收到的雲端資料；直接讀取不解除監聽延遲的保護。F-03：`adminViewUser`／`adminViewSelf` 在有未儲存變更時先確認。
- 修改檔案（相對 5B-2A）：`collection-sync.js`、`script.js`、`tests/collection-sync.test.mjs`、`tests/helpers/manager-page-harness.mjs`、`docs/PROJECT_DECISIONS.md`、`docs/AI_HANDOFF.md`。
- 測試（Claude 雲端隔離環境）：11 個測試檔 270/270 PASS（5B-2A 257 → 新增 13）；validate PASS；build PASS（33 files）；`git diff --check` PASS；真實 `index.html` 兩裝置 S0–S5 與 RV1–RV6 符合預期；新增破壞性測試 10 項全部被偵測（含原本未偵測的 M11）。
- Git status：未 stage；8 份已追蹤修改＋3 份新增（與 5B-2A 相同的檔案集合）。
- 已知問題：兩台裝置做出完全相同的結果也會成為衝突（刻意保守）；Low 項目 F-04～F-08 未處理。
- 下一位注意：Emulator 需實測 `getDocFromServer` 確認流程、相同新增衝突、M11 情境。
- Commit / Deploy：未 commit、未 push、未部署。

### 2026-10-30 — Claude（Phase 5B-2A）

- 任務：主頁並行寫入保護（D-018，Phase 5A 的 R2）。
- 根本原因：`saveData()` 每次從畫面收集全部四個資料表，以 `setDoc(..., { merge: true })` 整欄寫入且沒有前提條件；未同步的裝置會把其他裝置的新增、刪除整表蓋掉（5B-1 重現 S1–S5）。
- 主要內容：新增 `collection-sync.js`（逐表差異、交易內衝突判定、結果分類、追蹤雲端／畫面基準）；`saveData()` 改為 transaction（`maxAttempts: 1`，自行重試 5 次），只寫有變更的表＋owner 欄位＋`updatedAt`，雲端已是預期內容視為完成，其他差異整次不寫入；狀態流程 clean／saving／pending-network／pending-unknown／conflict 公開於 `body[data-collection-sync]` 與 `#collectionSyncNotice`；衝突時停用寫入並提供「載入雲端最新資料」「以我的版本覆蓋」（皆需確認）；未儲存時暫存雲端更新、不重建畫面，伺服器恢復後自動重試；同帳號「重新載入」保留未儲存內容；登出／離開頁面有未儲存提示；主頁版本列「收藏儲存版本：5B（交易保護）」。移除 `setDoc` 與 `writeDocumentSafely` 的使用（`data-session-guard.js` 未修改）。
- 修改檔案：`script.js`、`index.html`（`script.js?v=20261030-phase5b`、版本列、同步提示）、`collection-sync.js`（新增）、`tests/collection-sync.test.mjs`（新增）、`tests/helpers/manager-page-harness.mjs`（新增）、`tests/data-session-safety.test.mjs`、`tests/collection-autofill-safety.test.mjs`、`tests/manager-ui-refresh.test.mjs`、`docs/PROJECT_DECISIONS.md`、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`。
- 測試（Claude 雲端隔離環境，非使用者 Windows 本機）：11 個測試檔 257/257 PASS（原 221 → 新增 36）；validate-site PASS；build PASS（33 files）；`git diff --check` PASS；真實 `index.html` 兩裝置 Playwright（Firestore stub）S0–S5、S4b、載入不寫回皆符合預期，390／1440 版面正常、Console Error 0；mutation 13 項中 12 項被測到。
- Branch / HEAD：`main` / `4c6d090`。
- Git status：未 stage；8 份已追蹤修改＋3 份新增。
- 未完成事項：Firestore Emulator 驗證（建議延伸主頁 M 系列）；`AGENTS.md`／`README.md` 測試指令。
- 已知問題：同表不同筆的並行修改會成為衝突（刻意保守）；回應遺失後若他人又改同一表，只能顯示衝突並註明可能已儲存；舊版主頁分頁仍會整欄覆寫。
- 資料庫／部署風險：未修改 Rules、Schema、官方型錄、競賽統計或賽事保護；部署需比照 D-017 關閉所有裝置的舊主頁並確認版本列。
- 下一位注意：建議獨立審查 `planCollectionCommit()`、`planRemote()`（未儲存表保留與舊版本回音）、`submitCollectionSave()` 的結果分類與 Session 變更處理。
- Commit / Deploy：未 commit、未 push、未部署。

### 2026-10-29 — Claude（Phase 4B-1）

- 任務：依 Phase 4C 審查修正 H1、M1、M2、L2、L4、L5，並提出 H2 部署方案。
- 根本原因：H1：SDK 預設自行重試，回應遺失後重跑時把自己剛寫入的資料當成他人修改，回報「沒有儲存」並誘發重複新增。M1：修改對局草稿沒有保存基準值。M2：mock 不依 SDK 重試規則。L2：延遲完成的 `onSaved` 不辨識草稿身分。L4：修改比賽一律寫入 `isFinished: false`。L5：同 ID 但內容不同時判定衝突，導致改用新 ID。
- 主要內容：`runTransaction` 改為 `maxAttempts: 1`，由 `tournament-sync.js` 自行重試並記錄 commit 是否結果不明；新增操作以自身 ID 辨識已套用，無 ID 操作以「已是預期結果」不重寫且不宣稱由本次寫入；提交結果分為已確認已提交、已確認未提交、結果不明；逾時時若尚未送出 commit，直接確認未儲存；對局草稿與比賽 dialog 逐欄位合併並列出雙方都改的欄位；延遲完成只清除自己的草稿；只有對已完成比賽開啟修改才重新開啟；結果不明後換新 ID 需確認；賽事頁顯示新版版本列。
- 修改檔案（相對 Phase 4B）：`tournament.js`、`tournament.html`（版本 `?v=20261029-phase4b1`、版本列）、`tournament-sync.js`、`tests/helpers/mock-firestore.mjs`、`tests/helpers/tournament-page-harness.mjs`、`tests/tournament-sync.test.mjs`、`tests/tournament-page-sync.test.mjs`、`tests/tournament-sync-regression.test.mjs`（新增）、`docs/PROJECT_DECISIONS.md`、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`。
- 測試（Claude 雲端隔離環境，非使用者 Windows 本機）：全部 10 個測試檔 221/221 PASS（Phase 4B 194 → 221）；JavaScript syntax、網站結構、Build（32 files）、`git diff --check` PASS；Playwright 390／1440 各 17 項 PASS；mutation 23 項（Node 19＋瀏覽器 4）皆被測到；Phase 4C 的 R1、R2 重現腳本已不再重現，R3（舊版分頁覆寫）仍可重現，屬部署殘餘風險。
- Branch / HEAD：`main` / `f9c9ea8833ae0415fbe7c66bc723c70a91d00818`。
- Git status：未 stage；8 份已追蹤修改＋6 份新增（`tournament-sync.js`、`tests/tournament-sync.test.mjs`、`tests/tournament-page-sync.test.mjs`、`tests/tournament-sync-regression.test.mjs`、`tests/helpers/mock-firestore.mjs`、`tests/helpers/tournament-page-harness.mjs`）。
- 未完成事項：Firestore Emulator 驗證（本環境無法下載 Emulator）；`AGENTS.md`／`README.md` 測試指令；Phase 4C 的 L1、L3 未在本階段要求內（L1 已順帶改善：逾時且未送出 commit 時確認未儲存）。
- 已知問題：修改類操作在結果不明且他人又改同一場時，只能顯示結果不明；修改比賽 dialog 在手機寬度訊息較長，需在 dialog 內捲動才看到按鈕。
- 資料庫／部署風險：未修改 Rules、Schema 或正式資料；部署必須依 D-017「部署前必須遵守」程序處理舊版分頁。
- 下一位注意：建議由 Codex 獨立審查 `startTournamentTransaction()` 的重試與分類，以及部署程序。
- Commit / Deploy：未 commit、未 push、未部署。

### 2026-10-29 — Claude（Phase 4B）

- 任務：H-2 賽事並行寫入安全修正（D-017）。
- 根本原因：`saveTournamentData()` 以 `setDoc(..., { tournamentRecords, updatedAt }, { merge: true })` 寫入整個陣列；`merge` 只合併最上層欄位，陣列整欄取代，多分頁／多裝置後寫者覆蓋。各操作又先修改記憶體再存檔，失敗的變更會被下一次成功存檔帶出。
- 主要內容：新增 `tournament-sync.js`（純函式操作、單場賽事基準指紋比對、冪等新增／刪除、結果判定與分類）；`tournament.js` 十個寫入操作改為 transaction 內以最新資料重新計算，只 `update` `tournamentRecords` 與 `updatedAt`，移除 `setDoc`；成功後才以交易結果更新記憶體與畫面；離線直接拒絕、15 秒逾時或提交中斷時重新讀取確認；同頁一次一個交易；新增／對局／回合表單、修改比賽 dialog、修改對局 prompt 的草稿保留，切換帳號清除；修改比賽衝突時保留使用者輸入、未修改欄位更新為雲端最新值。`tournament.html` 版本改為 `?v=20261029-phase4b`。
- 修改檔案：`tournament.js`、`tournament.html`、`tournament-sync.js`（新增）、`tests/tournament-sync.test.mjs`（新增）、`tests/tournament-page-sync.test.mjs`（新增）、`tests/helpers/mock-firestore.mjs`（新增）、`tests/helpers/tournament-page-harness.mjs`（新增）、`tests/data-session-safety.test.mjs`、`tests/manager-ui-refresh.test.mjs`、`tests/retirement.test.mjs`、`docs/PROJECT_DECISIONS.md`、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`。`script.js`、`data-session-guard.js`、Rules、型錄、統計與備份工具未修改。
- 測試（Claude 雲端隔離環境，非使用者 Windows 本機）：全部 9 個測試檔 194/194 PASS（原 140 + 新增 54）；JavaScript syntax PASS；網站結構 PASS；production build PASS（32 files）；`git diff --check` PASS；Playwright 以 Firestore stub 在 390×844／1440×900 驗證 13 項 × 2（草稿跨重新渲染保留、同場衝突提示、衝突後重新操作、dialog 衝突與已刪除、儲存中停用、離線不送出、帳號切換清除草稿、收藏欄位不變、無 overflow、Console Error 0）；mutation 16 項（基準比對、刪除比對、交易內使用最新資料、交易外 ID、重送沿用 ID、callback 內與完成後 Session 檢查、失敗不修改記憶體、表單／對局草稿、切換帳號清草稿、逾時確認、放棄後停止重試、重新渲染保留草稿、衝突時更新未修改欄位）皆會被測到。
- Branch / HEAD：`main` / `f9c9ea8833ae0415fbe7c66bc723c70a91d00818`。
- Git status：未 stage；13 份未提交（8 份已追蹤修改＋5 份新增）。
- 未完成事項：真實 Firebase SDK 交易行為尚未以 Emulator 或正式環境驗證；沒有即時監聽（Phase 4C 可評估）；`AGENTS.md`／`README.md` 測試指令尚未納入新測試檔。
- 已知問題：已送出的 commit 無法取消（固定 UID＋Rules 確保不會跨帳號）；同一場賽事不同對局同時修改也會衝突（D-017 刻意保守）；D-015 段落的「待正式部署」狀態文字未在本階段更新。
- 資料庫／部署風險：未修改 Rules、schema 或正式資料；部署後已開啟的舊版分頁仍會用舊程式整份覆寫，所有裝置需重新整理賽事頁。
- 下一位注意：建議由另一位執行者獨立審查 `tournament-sync.js` 與 `submitTournamentOperation()`；部署前先以 Phase 2.5 備份工具做快照。
- Commit / Deploy：未 commit、未 push、未部署。

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
