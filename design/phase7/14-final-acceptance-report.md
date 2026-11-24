# 14｜Phase 7-FINAL 全站最終驗收報告

日期：2026-11-25｜執行者：Claude Code｜基準：正式版本 v1.18.0（`f86490c`，GitHub Pages deployment `8039918758`）；本機 HEAD `ae189eb`（v1.18.0 部署結案，未 push）。

範圍：只做驗收、隔離環境測試、文件整理與問題分類；未修改功能程式、交易核心、Rules、Schema、正式資料、型錄或競賽統計。所有涉及資料變更的測試都在 Firebase Emulator（`demo-beyblade-7dc-ui`，127.0.0.1）、VM harness 或 mock 中執行。正式網站只做未登入唯讀檢查。

## 1. 驗收依據
- 本輪新增：
  - Emulator 大量資料效能；
  - 9 頁／分頁 × 6 寬度 × 2 主題版面矩陣；
  - hash 導覽；
  - 權限與備份工具唯讀稽核（Rules、管理員頁、寫入點、還原路徑）；
  - 剩餘問題逐項程式碼稽核。
- 沿用本輪發布前驗收（`f86490c`）：
  - Node 22 檔 492/492；Phase 7-2 整合回歸 505/505；
  - M01～M16（D-018／F-04）16/16；H2 E01～E16（D-017，真實 SDK）16/16；
  - validate、build、`git diff --check` PASS；
  - 正式網站唯讀驗收（見 `docs/AI_HANDOFF.md` v1.18.0 部署紀錄）。
- 沿用各階段驗收紀錄：`design/phase7/verification/`（7-2a～7-2d、7-3a～7-3d、7-4a～7-4c、phase7-dc）。

## 2. 全站功能驗收矩陣

| 功能 | 驗證方式 | 結果 |
|---|---|---|
| 首頁與全站導覽（D-020） | `site-navigation` 測試；正式網站 7 頁 × 1280／375 版本與導覽載入 | PASS |
| 登入、登出、帳號切換 | Emulator 真實頁面（主頁、賽事頁）；M08／M16；E13／E14；`data-session-safety` | PASS（正式 Google 登入見 §6） |
| 原裝陀螺收藏 | 505 回歸；7-2 Emulator；大量資料 300 筆 | PASS |
| 零件庫存與配置引用 | 505 回歸；`collection-parts`；7-DC 精確名稱 | PASS（名稱顯示見 P2-1） |
| 配置清單、組裝器、拆解紀錄 | `config-view`／`config-assembler`／`config-assembly-wiring`；7-3b／7-3c Emulator | PASS |
| 複製配置、從收藏建立配置 | `config-quick-create`；7-3d Emulator（含遠端更新、焦點） | PASS |
| 賽事清單、比分、回合、對局面板 | `tournament-*`、`tournament-panel`；7-4 Emulator；H2 E01～E16 | PASS |
| 競賽統計 | `competition-statistics` 測試；正式網站版面 | PASS（匯入器限制見 Deferred） |
| 使用說明與更新紀錄 | `help-pages` 測試；正式網站最新 v1.18.0、歷史 v1.2.0～v1.17.0 | PASS |
| 管理員唯讀檢視與資料權限 | 稽核 Rules、`admin.js`、`user-view.js`、`script.js` 檢視模式 | PASS（P2-3） |
| 新增快捷入口與 hash 導覽 | Emulator 真實頁面 7 個 hash | 部分 PASS（P2-2） |

hash 導覽實測（已登入，頁面載入後）：

| hash | 結果 |
|---|---|
| `#configSection`、`#historySection`、`#inventorySection` | 切到正確分頁 |
| `tournament.html#add-tournament` | 焦點在日期欄 |
| `index.html#add-collection`、`#add-part` | 切到正確分頁，但沒有聚焦輸入欄 |
| `index.html#configQuickEditor` | 沒有開啟組裝器 |

最後兩項見 P2-2。全部 0 次寫入。

## 3. 資料安全驗收

| 項目 | 依據 | 結果 |
|---|---|---|
| D-015 型錄升級 | `collection-autofill-safety`（H-1）、M09 | PASS（F-06 見 Deferred） |
| D-017 賽事交易 | H2 E01～E16（並行新增／修改／刪除、同場衝突、離線、提交中斷、逾時後提交、換帳號、只寫 `tournamentRecords`／`updatedAt`）；7-4 Emulator 兩裝置 | PASS |
| D-018 收藏交易 | M01～M16；7-3b／7-3c／7-3d 兩裝置 | PASS |
| D-019 組裝規則 | `assembly-rules`、`config-assembly-wiring`；7-3c／7-3d Emulator | PASS |
| F-04 其他分頁登出、換帳號 | M16；`data-session-safety` | PASS |
| 精確名稱與庫存一致性（D-023） | `data-consistency`；7-DC Emulator | PASS |
| 單次操作寫入次數 | 各階段 Emulator commit 計數（新增、修改、記錄回合皆 1 次） | PASS |
| 取消與純顯示操作零寫入 | 各階段 Emulator；hash 導覽 0 次 | PASS |
| 跨裝置衝突防護 | M02／M12；E04／E05；7-3／7-4 兩分頁實測 | PASS |
| 結果不明與重試 | M05／M11／M15；E10／E11／E15 | PASS |
| 跨帳號隔離 | Rules 只允許 `auth.uid == userId` 寫入（`firestore.rules:21`）；管理員只讀；session guard 綁定 owner／target／generation；M08、E12～E14 | PASS |
| 備份工具完整性 | 只 import 讀取 API；只在 localhost 執行；`backup-tool.test.mjs` 9/9；本輪備份 `verify-backup.mjs` PASS | PASS |
| 沒有直接還原到 `appData/main` 的路徑 | 全 repo 無 `restore_to_main`、無 Admin SDK；備份 workflow 只寫 `users/{uid}/recovery/*`，拒絕含 `/appData/` 的 URL；`tournament-sync-regression` 驗證 | PASS |
| 寫入點總覽 | `script.js` `saveData(` 17／`runTransaction(` 1／`setDoc`·`updateDoc`·`deleteDoc` 0；`tournament.js` `runTransaction(` 1／`submitTournamentOperation(` 11／`setDoc`·`updateDoc`·`deleteDoc`·`onSnapshot` 0；`admin.js`、`user-view.js`、`site-menu.js` 無寫入；無 RTDB 寫入 | PASS |
| 機密 | 只有公開的 Firebase Web 設定；無私鑰、服務帳號 JSON、Token | PASS |

## 4. 介面與相容性

| 項目 | 結果 |
|---|---|
| 版面矩陣 | Emulator、大量資料：主頁收藏／零件／配置／拆解紀錄、賽事頁（展開比賽）、競賽統計、首頁、使用教學、更新紀錄 × 375／390／820／821／1024／1440 × 深色／米色，共 108 組，水平溢出 0 |
| 正式網站 | 7 頁 × 1280／375 無溢出；Console Error 0；未登入寫入控制全部停用（主頁 6、賽事頁 1） |
| 手機觸控 | 大按鈕與記錄按鈕 52px、對話框按鈕 ≥ 44px（7-4 驗收）；Chromium 觸控模擬，非實機 |
| Sheet、Dialog、焦點、遮罩 | 7-2d／7-3b sheet、7-3c 組裝器、7-4 對話框：Tab 限制、Esc、焦點回復與安全替代焦點、背景遮罩（見各驗收紀錄）。例外見 P3-5 |
| 顯示層初始化失敗回退 | 7-2 回歸 fail 套件、7-3b 強制失敗：原始表格可操作、不殘留顯示層。順序見 P3-3 |
| 大量資料效能 | 收藏 300、零件 200（清單 564 項）、配置 300、拆解紀錄 100、賽事 40 × 6 對局 × 5 回合。主頁：登入到完成顯示約 0.9 秒；搜尋約 60 ms；切分頁約 60～170 ms；開組裝器約 0.2 秒；選上蓋約 0.1 秒。賽事頁：清單約 0.2 秒；切換對局約 70 ms；記錄回合來回約 0.8 秒（1 次寫入）。無水平溢出 |
| 正式 Google 登入、Safari／iOS | 未驗證（現有環境無法實機操作；Chromium 結果不代表 Safari 實機）→ §6 |

## 5. 剩餘問題

只列目前仍存在、可重現的問題。已由 Phase 7-DC 解決的不列。

### P0（資料安全或權限）
無。

### P1（主要功能失效或高風險）
無。

### P2（操作體驗與相容性）

**P2-1 只差空白的名稱在部分畫面無法分辨**
- 位置：零件清單卡、零件詳細標題、無對應引用清單，以及收藏／零件刪除確認（`script.js:4018`、`4064`、`4158`、`1154`～`1184`）。這些地方使用未標記的文字，空白被摺疊。
- 重現：新增同類別的「A B」與「A  B」（兩個空白）兩筆額外零件。清單出現兩張看起來相同的卡，刪除確認都顯示「A B」。
- 影響：庫存與身分仍正確（D-023 精確比對），只有顯示無法分辨。

**P2-2 跨頁快捷入口在主頁載入時不生效**
- 位置：`site-menu.js:398`～`406` 的 `handleQuickActionHash` 只在頁面初始化執行一次，當時資料尚在載入、欄位停用，因此不聚焦。`script.js` 在 DOMContentLoaded 時呼叫 `openConfigQuickEditor()`，尚無寫入 Session，因此直接返回。
- 重現：已登入時在賽事頁（或任何非主頁）按「＋新增 → 建立配置」，主頁載入後組裝器沒有開啟；「新增收藏／新增零件」切到分頁但輸入欄沒有焦點。
- 範圍：在主頁內使用不受影響（直接開啟）。不影響資料。

**P2-3 Rules 沒有驗證文件內容**
- 位置：`firestore.rules`，不檢查 `ownerUid`／`ownerEmail` 與欄位格式。
- 重現：使用者可在自己的文件寫入任意內容（包括假的 `ownerEmail`，管理員清單會顯示該值）或刪除自己的文件。
- 影響：只影響本人資料與管理員顯示，無法跨帳號。
- 修改 Rules 需另行授權，列為建議，不屬 P0。

### P3（文字、版面與其他低風險）
- **P3-1 三顆套組稱為「雙陀螺套組」**：`script.js:1165` 刪除整組確認文字寫死；例如 UX-21 三顆套組刪除時。測試 `collection-parts.test.mjs:308` 固定此字串。
- **P3-2「歷史測試紀錄」舊名稱**：`script.js:1131` 刪除紀錄確認；`collection-sync.js:22` 的表名，用在衝突提示與兩個選擇確認（`script.js:1822`、`2233`、`2254`、`2328`）；`user-view.html:73` 標題。另有「歷史紀錄」字樣在 `script.js:1048`～`1075`。
- **P3-3 顯示層失敗回退時表格順序錯位**：收藏表出現在零件區之後，配置表出現在拆解紀錄標題之後（原始表格集中在 `#collectionSourceTables`、`#configSourceTables`）。
- **P3-4 手機工具列兩字標籤可能換行**：`.cv-select span` 沒有 `white-space: nowrap`（`style.css:4187`～`4196`），在 360～420px 可能顯示為上下兩行。版面矩陣無水平溢出，屬視覺問題。
- **P3-5 全站選單按鈕 ☰（z-index 1200）在手機詳細 sheet 遮罩（959／960）與刪除原因視窗（999／1000）之上**：滑鼠或觸控可點開側欄；鍵盤已被限制。刪除原因視窗的情況先前未記錄。
- **P3-6 賽事頁首次建立文件時沒有 `ownerUid`／`ownerEmail`**：在主頁存檔前，管理員清單顯示「-」（`tournament-sync.js:422`～`428`；屬受保護區段，只記錄）。
- **P3-7 3on3 提示範圍**：程式內提示寫「官方規則」但未註明版本（更新紀錄與教學已註明 B4 第 12 版）。顏色不同但名稱不同的零件不會被判定為重複（依原始名稱比對）。

### Deferred（已知限制或需另行授權）

| 項目 | 狀態 |
|---|---|
| CRLF／LF | 重新儲存時 CRLF 轉為 LF（D-023 已記錄） |
| 一筆已損壞的正式型號（「UX-21 -01」格式） | 不自動修復；修復需另行授權（D-023） |
| F-06 型錄升級的表層級衝突 | 升級強制寫整個 `beybladeTable`，與另一裝置同時修改該表會衝突；需改 D-018 核心 |
| 競賽統計匯入器固定預期值 | 分類數、出場總數、名稱、SHA-256 等固定斷言。來源變動時拒絕匯入，屬 fail-closed，不損壞資料，但需人工更新常數 |
| F-05／F-08 | 原始定義在歷史、文件、測試中都找不到，仍無法確認 |
| 修改對局未改動仍寫入一次 | 既有行為，已接受（受保護後段） |
| 管理員 UID 常數重複於 7 處以上 | 變更時需同時修改 Rules 與各檔 |

## 6. 需使用者實機驗證（Chromium 結果不代表實機）

1. **正式 Google 登入**（電腦 Chrome／Edge）：
   - 登入後主頁顯示自己的收藏、零件、配置、拆解紀錄；
   - 「收藏儲存版本：5B」「賽事儲存版本：4B-1」；
   - 登出後清單清空、按鈕停用。
2. **iPhone Safari**：
   - Google 登入成功（不出現空白頁或無限重新導向）；
   - 底部導覽與「＋新增」選單可點；
   - 收藏／配置詳細 sheet 從底部開啟，可關閉，背景不可捲動；
   - 組裝器全螢幕、選單可選、儲存與取消；
   - 賽事頁記錄回合大按鈕可點、無水平捲動。
3. **iOS 主畫面 PWA**：
   - 開啟後顯示 v1.18.0；
   - 登入狀態保留；
   - 舊版快取不殘留（更新紀錄最新為 v1.18.0）。
4. **建議用一筆可刪除的資料試一次**：
   - 新增配置 → 修改 → 拆解 → 刪除紀錄；
   - 新增比賽 → 新增對局 → 記錄兩回合 → 修改對局 → 刪除比賽；
   - 每步確認畫面與其他裝置重新整理後一致。

## 7. 建議最後修正範圍（需另行授權）

| 優先 | 內容 | 涉及 |
|---|---|---|
| 1 | P2-2 跨頁快捷入口：主頁資料就緒後再處理 hash（聚焦欄位、開啟組裝器） | `site-menu.js`／`script.js` 顯示層；不涉交易 |
| 2 | P2-1 名稱顯示：零件清單卡、零件詳細標題、刪除確認改用既有空白標記 | `deleteRow` 確認文字屬既有流程，需確認是否在受保護範圍 |
| 3 | P3-1、P3-2 文字：「N 顆套組」；確認與衝突提示改「拆解紀錄」 | `collection-sync.js` 表名屬受保護檔案，需核准；測試字串同步 |
| 4 | P3-4、P3-5 版面：工具列標籤 nowrap；sheet 與刪除原因視窗開啟時，☰ 設為不可操作或提高 z-index | CSS 與顯示層 |
| 5 | P3-3 回退時表格順序 | 顯示層 |
| 另行評估 | P2-3 Rules 內容驗證、P3-6 文件擁有者欄位、F-06 | Rules／交易核心，需專案層級授權 |

## 8. Git 與受保護區段（驗收當下）
- HEAD `ae189eb`（main，領先 origin 1：v1.18.0 部署結案）；正式 `f86490c`。
- 收藏端核准雜湊：`getTableData` `02f67bb21e597b3e`、`applyDataToTables` `08c1de72b2266fec`、`editRow`→`rebuildRow` `3ec54b27ec414e19`、`getStockNameFromCell`→`escapeHtml` `c1230e4d43e39ba2`、`addConfig` 寫入 `da046a3d56a07519`、`checkStock` `0bed51c10a056c87`。
- 賽事端：`tournament-sync.js` 逐位元組不變；S1～S6、T1～T17 除 T16（`0b152288040815c0`，前段 `7cbde7b9cc28e9e2`、後段 `7a5b363512fea2f9`）外不變。
- Rules、Schema、官方型錄、競賽統計、備份還原機制未修改。

## 9. 最後修正（2026-11-25，ChatGPT 核准；v1.18.1）

以上 §1～§8 為修正前的驗收結果，保留原樣。核准修正 P2-1、P2-2、P3-1、P3-2、P3-3、P3-4、P3-5、P3-7，只涉及顯示、導覽與確認文字；驗收紀錄 `design/phase7/verification/phase7-final/README.md`。

| 項目 | 修正後狀態 |
|---|---|
| P2-1 只差空白的名稱 | 已修正（零件清單卡、零件詳細、無對應引用、刪除確認、D1 提示以 ␣⇥⍽↵ 標示；儲存值、庫存鍵、搜尋不變） |
| P2-2 跨頁快捷入口 | 已修正（資料與寫入 Session 就緒後經既有入口執行一次；登出、換帳號、載入失敗、雜湊改變時丟棄） |
| P3-1 套組顆數 | 已修正（「N 顆陀螺套組」，N 來自既有刪除目標） |
| P3-2 拆解紀錄名稱 | 已修正（確認、衝突提示、管理員檢視、說明頁；資料欄位不變） |
| P3-3 回退表格位置 | 已修正（原始表格容器移回所屬區塊） |
| P3-4 手機工具列 | 已修正（標籤不換行） |
| P3-5 遮罩與全站選單 | 已修正（開啟 sheet／視窗時導覽 inert；刪除原因視窗 Tab 限制） |
| P3-7 3on3 提示文案 | 已修正（註明 B4 第 12 版、比對範圍與限制） |
| P2-3、P3-6 與 Deferred 各項 | 未處理，列入 `docs/MAINTENANCE_BACKLOG.md` |
