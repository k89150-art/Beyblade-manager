# Phase 7-FINAL 最後修正驗收紀錄

日期：2026-11-25｜執行者：Claude Code｜基準：`ac91b63`（最終驗收文件 commit；正式版本 v1.18.0 `f86490c`）｜依據：`design/phase7/14-final-acceptance-report.md` §5、§7 與 ChatGPT 核准的修正範圍（P2-1、P2-2、P3-1、P3-2、P3-3、P3-4、P3-5、P3-7）。

只修改顯示、導覽與確認文字；未修改資料寫入、交易、Session、目標識別、D1 影響計算、Rules、Schema、型錄或競賽統計。

## 各項修正

| 項目 | 修正 | 驗證 |
|---|---|---|
| P2-1 只差空白的名稱 | 零件清單卡、零件詳細標題、無對應引用、收藏與零件刪除確認、D1 影響提示（刪除與改名）都用既有 `formatPartNameForMenu` 標示（␣ ⇥ ⍽ ↵）；一般名稱原樣顯示。`formatImpactText` 新增可選的 `formatName`，預設輸出不變 | F-01、F-02；Emulator：卡片與詳細顯示「空白␣␣名」，刪除確認「軸心：空白␣␣名，數量 1」，取消 0 次寫入，確認 1 次寫入且只刪除兩個空白的那筆（「空白 名」原樣保留） |
| P2-2 跨頁快捷入口 | `#add-collection`、`#add-part`、`#configQuickEditor` 在資料載入、有效寫入 Session 就緒時，經既有 `applyCollectionHash`／`openConfigQuickEditor` 執行一次（由 `updateDataAccessUi` 觸發，不使用計時器）。未登入進入、登出、換帳號、載入失敗、雜湊已改變時丟棄；只屬於開啟時的帳號 | F-04～F-06；Emulator：跨頁進入後組裝器開啟／焦點在「型號」或「零件名稱」；未登入進入後再登入不開啟；載入前改成 `#add-part` 只聚焦零件名稱；同頁重複點擊每次聚焦；同一雜湊再次切換不重複開啟；其他四項雜湊行為不變；0 次寫入 |
| P3-1 套組顆數 | 刪除整組確認改為「「代碼」是 N 顆陀螺套組」，N 與名單來自既有 `setRows`（與實際刪除範圍相同） | F-03；Emulator：「「UX-21」是 3 顆陀螺套組。確定要一起刪除「三顆甲、三顆乙、三顆丙」嗎？」，取消 0 次，確認刪除同 3 筆、1 次寫入 |
| P3-2 拆解紀錄 | 刪除與還原拆解紀錄的確認與提示、衝突提示的表名（`collection-sync.js` 顯示用表名，核准例外）、管理員使用者檢視標題、管理員總覽、使用教學、首頁、隱私權政策 | F-07；`historyTable`、欄位、交易類型、內部識別未改 |
| P3-3 回退表格位置 | 顯示層失敗時，把同一個原始表格容器移回所屬區塊（收藏、零件、配置、拆解紀錄）；不複製、不重建、列順序不變 | Emulator（測試複本 `?failCollectionView`、`?failConfigView`）：順序為各標題 → 各自表格；列數不變；回退介面刪除（取消 0、確認 1 次只寫 `partTable`）與編輯／取消可用 |
| P3-4 手機工具列 | `.cv-select > span` 不換行、不縮小 | 360／375／390／420 × 收藏／零件／配置工具列：標籤皆單行、選單寬 ≥ 60px、高 ≥ 36px、無水平溢出 |
| P3-5 遮罩與全站選單 | 手機詳細 sheet、刪除原因視窗、組裝器、陀螺選擇視窗開啟時，☰、側欄、底部導覽、＋新增選單設為 `inert`（依實際開啟狀態即時重算）；刪除原因視窗加上 Tab 限制 | Emulator 375：開啟時 ☰ 與底部導覽 inert，實際點擊 ☰ 不開啟側欄（點擊落在遮罩，依既有行為關閉視窗、0 次寫入）；Tab 在刪除原因視窗內循環、從外部會拉回；Esc 只關閉 sheet；關閉、登出、換帳號後全部恢復 |
| P3-7 3on3 提示 | 註明「參考官方大賽規則 B4 レギュレーション第 12 版（2026-03-13 施行）」、只依可辨識零件與原始名稱比對、不代表已確認所有官方賽制限制、依主辦方規則；未改判定 | F-07；判定、紋章鎖規則、自填「未檢查」不變 |

## 受保護區段例外

| 區段 | 原雜湊 | 新雜湊 | 差異 | 理由 | 測試 |
|---|---|---|---|---|---|
| `deleteRow`（A-09） | `0bc3c60c31499a7c` | `5260d10ffd5ebdf3` | 新增 `shownName` 顯示函式；`layer`、套組名單、零件 `name` 改為標示空白的顯示文字；套組確認改為 `${setRows.length} 顆陀螺套組`。目標（`setRows`、`row`）、D1 呼叫、刪除流程不變 | P2-1、P3-1 | `tests/final-fixes.test.mjs` F-02、F-03；`collection-parts` D1 wiring |
| `collection-sync.js` 表名 | 整檔 `d427877d1f126014` | `0cda868c6585949c` | `historyTable: "歷史測試紀錄"` → `"拆解紀錄"`（只由 `script.js` `formatCollectionTables` 用於顯示；不參與識別、交易或指紋） | P3-2 | F-07；`collection-sync` 測試、M01～M16 |

其他收藏端核准雜湊不變：`getTableData` `02f67bb21e597b3e`、`applyDataToTables` `08c1de72b2266fec`、`editRow`→`rebuildRow` `3ec54b27ec414e19`、`getStockNameFromCell`→`escapeHtml` `c1230e4d43e39ba2`、`addConfig` 寫入 `da046a3d56a07519`、`checkStock` `0bed51c10a056c87`，以及 A-09 其餘段落。賽事端 S1～S6、T1～T17 不變（T16 `0b152288040815c0`），`tournament-sync.js` 逐位元組不變。寫入路徑：收藏端 `saveData(` 17、`runTransaction(` 1、`setDoc`／`updateDoc`／`deleteDoc` 0；賽事端 `runTransaction(` 1、`submitTournamentOperation(` 11、`setDoc`／`updateDoc`／`deleteDoc`／`onSnapshot` 0。

## 回歸
見 `docs/AI_HANDOFF.md` 本次紀錄（Node、505、M01～M16、H2 E01～E16、108 組版面矩陣、validate、build、diff-check）。
