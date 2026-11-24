# Phase 7-4a 驗收紀錄：比分板與回合大按鈕

日期：2026-11-25｜執行者：Claude Code｜基準 HEAD：`c7fef06`｜規格：`design/phase7/13-phase7-4-tournament-panel-spec.md`

## 實作
- 比賽詳細最上方的「記錄回合」面板（核准的 C 大按鈕，`data-round-panel`，容器帶目標對局的 `data-match-id`）：
  - 比分板：我方／對手比分、4 格、第 N 局與對手、第 N 回合、先到 4 分；
  - 目前記錄對象與比分；有多場可記錄對局時提供「記錄對局」切換（Q1）；
  - 本回合陀螺（大按鈕，只有一個有效陀螺時預選，Q3）、得分方（我方得分／失分，不預選）、勝利方式（極限 3、擊飛 2、爆裂 2、迴轉 1，不預選）、回合備註；
  - 即時預覽「我方 +N，比分變成 a：b｜這回合後：本局勝利／落敗／仍在進行」（用既有 `calculateMatchScore`／`getMatchOutcome`）；
  - 近期回合（最近 3 回合）；
  - 任一方達 4 分：面板改為完成狀態、不提供記錄按鈕；刪除回合使比分低於 4 分後恢復（Q2）。
- 面板只設定既有欄位（隱藏的 `data-round-beyblade／result／score-type` 與 `data-round-note`），按「記錄回合」時：
  - 先確認比賽、對局、面板目標、DOM 第一個 `[data-match-id]` 仍是這個面板，以及對局未分出勝負、三項都已選擇；
  - 再呼叫既有 `window.addRound`；送出中不重複送出。
- 對局卡不再各自顯示新增回合表單（一場對局只有一份欄位，草稿鍵不重複）。未完成且不是目前對象的對局卡提供「在上方記錄這場」。
- 新增 `tournament-panel.js`（純函式）；`tournament.js` 只修改渲染（`renderTournamentList`、`renderTournamentDetail`、`renderMatchCard`）並在 D-017 區塊之後新增「Phase 7-4 tournament record panel」區塊。`tournament.html` 新增面板樣式（比分區在深色與米色主題都維持深色）與快取 `tournament.js?v=20261126-phase74a`。
- 未修改：`tournament-sync.js`（逐位元組）、S1～S6、T1～T17（含 T14／T16）、寫入處理函式、計分、完成判定、名次、草稿與帳號隔離；收藏與配置端全部。

## 測試
- 新增 `tests/tournament-protection.test.mjs`：S1～S6、整檔、T1～T5、T7～T13、T15、T17 雜湊；T14 拆成 editMatch 前後兩段固定；T16 固定原值（7-4c 前）；賽事端寫入計數；「4B-1」文字。
- 新增 `tests/tournament-panel.test.mjs`：
  - 面板對象規則與 Q3 預選（R-01、R-02）；
  - 四種方式 × 得失分各 1 次交易、寫入只有 `tournamentRecords`／`updatedAt`（R-03）；
  - 未選擇不送出、`addRound` 的預設值不會被使用（R-04）；
  - 面板顯示的對局與要求的對局不同時不寫入（R-05），以及突變測試：移除目標檢查後同一呼叫寫到錯誤對局（R-05m）；
  - 4 分後不記錄、刪除回合後恢復（R-06）；連按只寫一次（R-07）；已完成比賽、輪空、找不到面板都拒絕（R-08）；離線不送出不排隊（R-09）。
- Node 22 檔 484/484；validate、build（37 files）、`git diff --check` PASS；收藏端 `saveData(` 17、`runTransaction(` 1。

### Emulator 真實頁面（`demo-beyblade-7dc-ui`，127.0.0.1；測試複本 `tournament.js` 以 `patch-tournament.cjs` 指向 Emulator）
| 情境 | 結果 |
|---|---|
| 預設對象 | 最後一場未完成的對局（第 4 局）；唯一陀螺「單一」預選；得分方與方式未預選；「賽事儲存版本：4B-1（交易保護）」不變 |
| 未選擇就記錄 | 面板提示「請先選擇：得分或失分、勝利方式」，0 次寫入 |
| 記錄（我方、極限） | 預覽「我方 +3，比分變成 3：0｜仍在進行」；1 次寫入 200，欄位只有 `tournamentRecords`／`updatedAt`；記錄後得分方與方式清空 |
| 切換對局 | 第 1 局選了陀螺、失分與備註後切到第 4 局：第 4 局沒有這些值；切回第 1 局：值仍在；記錄只寫到第 1 局（第 1 局 3 回合、第 4 局 1 回合） |
| 已分出勝負（第 3 局 4：0） | 完成狀態、沒有記錄按鈕 |
| 連按三次記錄 | 1 次寫入；達 5：0 後轉為完成狀態 |
| 刪除回合 | 1 次寫入，比分回到 3：0，記錄按鈕恢復 |
| 已完成的比賽 | 不顯示面板 |
| 版面 | 1024／821／820／375 × 深色／米色：無水平溢出；大按鈕與記錄按鈕高度 52px；≤ 700px 勝利方式 2×2 |
