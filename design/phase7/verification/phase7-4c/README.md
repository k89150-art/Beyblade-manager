# Phase 7-4c 驗收紀錄：修改對局面板（T16 核准例外）

日期：2026-11-25｜執行者：Claude Code｜基準：7-4b commit｜規格：`design/phase7/13-phase7-4-tournament-panel-spec.md` Q4

## 實作
- `editMatch`（T16）中的四次 `prompt()` 改為單一 `openMatchEditPanel(match, defaults, session)`：
  - 對手名稱，以及 3 組「從配置選／或自填（優先）」，預填草稿合併後的預設值；
  - 預設值是目前配置文字時選在選單，否則放在自填欄；
  - 「3 顆陀螺不可空白」在面板內提示，不關閉；
  - 取消、Esc、背景、登出、換帳號（`pendingTournamentInteractions`）都回傳 null，不寫入；
  - Tab 限制在面板內；取消回到「修改對局」；儲存後待清單重繪完成再回到該局的「修改對局」；
  - 桌面置中 600px，手機（≤ 700px）全螢幕。
- 未修改的欄位保留原始值：面板回傳未改動的陀螺文字時沿用已儲存的整筆 `{ source, configText }`，未改動的對手名稱沿用原值；只有改動的欄位才 trim 並重新判定 `source`。
- `openMatchEditPanel` 是可替換的函式宣告（比照 `openTournamentEditDialog`），位於 D-017 區塊之外的 Phase 7-4 區塊。
- 新增 `restoreFocusAfterSave`：儲存使清單重繪後恢復焦點，用於記錄回合與修改對局，只影響顯示。
- 快取 `tournament.js?v=20261126-phase74c`。

## T16 雜湊與差異
| 項目 | 值 |
|---|---|
| T16 原雜湊（`c7fef06`） | `73137bfdbaaf7c12` |
| T16 新雜湊 | `0b152288040815c0` |
| T16 前段（函式開頭 → 草稿合併、雙方衝突選擇） | `7cbde7b9cc28e9e2`，前後相同 |
| T16 後段（`finalValues`、重新儲存確認、草稿、EDIT_MATCH 操作、onSaved） | `7a5b363512fea2f9`，前後相同 |
| T14／T6（包含 T16） | `7c35fde0b1617c11`→`2cb38ffdb401ae1f`／`146e29ed462f8f86`→`627443059c44f58b`，只因 T16；T14 其餘兩段（`addTournament`…`addDirectAdvance`、`deleteMatch`…`deleteRound`）雜湊不變 |

實際差異只在輸入取得：
- 刪除：`prompt("對手名稱")`，以及 3 次 `prompt("陀螺 N")` 迴圈（含空白 alert 與每次 trim）；
- 新增：`await openMatchEditPanel(...)`、null 即返回、空白檢查（同一句 alert）；未改動欄位沿用原值，改動欄位 trim 並判定 `source`；
- 對局 ID、草稿基準（`latestValues`）、欄位層級合併與衝突判斷、交易操作內容、D-017 重試／結果不明／冪等、Session 與跨帳號防護都未修改。

其他受保護區段（S1～S6、T1～T5、T7～T13、T15、T17）與 `tournament-sync.js` 逐位元組不變。

## 測試
- `tests/tournament-protection.test.mjs` P-05：T16 新雜湊、前段與後段雜湊與原版相同、沒有 `prompt()`。
- `tests/tournament-panel.test.mjs`：
  - E-01：未改欄位保留原值（前後空白、`source`），改動欄位 trim；回合不變；
  - E-02：取消與空白不寫入、不產生草稿；
  - E-03 突變測試：拿掉欄位層級衝突判斷後，另一裝置的修改被靜默覆蓋，真實程式則會詢問並保留雲端值。
- 既有 M1（欄位合併、雙方修改需選擇、拒絕最後確認不送出）、L2（延遲提交不刪較新草稿）與賽事頁測試，經測試替身以同樣的 4 個答案驅動面板，全部通過。
- Node 22 檔全數通過（見完整回歸）。

### Emulator 真實頁面
| 情境 | 結果 |
|---|---|
| 開啟 | 預填「  前後空白  」與陀螺；焦點在對手名稱 |
| Esc | 0 次寫入，焦點回到「修改對局」 |
| 空白陀螺 | 面板內提示、不關閉、0 次寫入 |
| 只改對手名稱 | 1 次寫入；儲存後焦點回到該局「修改對局」 |
| 未改動直接儲存 | 1 次寫入（內容相同；與原本 `prompt()` 流程相同：`editMatch` 沒有「未變更不送出」的捷徑，屬受保護後段，未改） |
| 開著面板登出 | 面板關閉、0 次寫入；B 帳號沒有前一帳號的面板或資料 |
| 兩裝置修改同一局 | B 先存「B 改的對手」；A 以舊資料存「A 改的對手」→ 既有衝突訊息、未寫入；A 重開 → 「你和其他裝置都修改了：你的「A 改的對手」／雲端「B 改的對手」」→ 選雲端 → 重新儲存確認 → 保留 B 的值 |
| 版面 | 820：置中對話框；375：全螢幕；深色與米色無水平溢出，「儲存修改」可見 |
