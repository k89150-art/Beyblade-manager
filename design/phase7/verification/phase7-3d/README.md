# Phase 7-3d 驗收紀錄：快速建立配置

日期：2026-11-25｜執行者：Claude Code｜基準 HEAD：`01d4046`（v1.16.0 部署結案，未 push；正式版本 `2cb2f2e`）｜規格：`design/phase7/11-phase7-3-assembler-spec.md` §6

範圍：兩個組裝器預填入口。寫入只經既有 `addConfig`；未新增寫入路徑；未修改 Schema、Rules、型錄、競賽統計、交易協定、權威資料表與 Phase 7-DC 精確名稱政策。未開始 Phase 7-4。

## 實作

| 項目 | 內容 |
|---|---|
| 複製配置 | 配置詳細面板新增「複製配置」（修改與拆解之間）。經 7-3b 既有新鮮度檢查（列仍存在、簽章相同）後，以該列的儲存名稱（`getPersistedStockName`，主要戰刃依 `mainStockName`）預填；以新增模式開啟組裝器（`configEditorRow` 為 null，標題「複製配置」）。手機 sheet 先關閉。 |
| 從收藏建立配置 | 收藏（原裝陀螺）詳細面板新增「建立配置」（與刪除並列，只在可寫入時顯示）。經 7-2 既有新鮮度檢查（含套組）後，以該顆的零件預填（零件名稱與 `getTotalParts` 相同的取法），標題「從收藏建立配置」。手機 sheet 先關閉。 |
| 結構判定 | 複製：沿用配置的模式，有超越／金屬即四件。收藏：`stockAssemblySystem` 為 CX_ 或 CX 型號（抽包只在列有 CX 零件時）為 CX，有超越／金屬為四件，否則三件；其他為標準三件式。 |
| 不猜測 | 只填結構本身的欄位、只填來源有寫的零件；「-」不當成固鎖（一體式由既有 `updateNoRatchetConfigOption` 處理）；同時有主要戰刃與超越／金屬時不填戰刃並提示「戰刃結構不明確」。 |
| 庫存 | 預填只選 `refreshSelectors` 提供的選項（新配置：計入所有配置，複製不會釋放原配置的零件）；沒有庫存的零件不選入，即時檢查提示「沒有可用庫存，未自動選入」（使用者選了該欄後提示消失）。 |
| 規則 | 複製視為新建：原配置的違規不會被豁免，即時檢查與 `addConfig` 都以新建規則阻擋，不出現「原本就不符合」確認。 |
| 資料來源 | 預填值在按下（已通過新鮮度檢查的）按鈕時才從目前的列讀取，不快取；開啟組裝器需要目前的寫入 Session；開啟與關閉時清除預填提示。 |

修改檔案：`config-view.js`（`prefillFromConfig`、`prefillFromStock`、`buildAssemblyChecks` 的 `prefill`）、`script.js`（新區塊「Phase 7-3d quick create」在 7-3c 區塊之後；`renderConfigDetail` 複製按鈕與說明、`runConfigViewAction` copy 分支、`renderStockDetail` 建立配置按鈕、`runCollectionViewAction` config 分支、預填提示的狀態與清除、`config-view.js` 匯入快取）、`index.html`（`script.js` 快取 `20261125-phase73d`）、`guide.html`（第四節）、`tests/config-quick-create.test.mjs`（新，10 項）、三個快取版本測試、`README.md`／`AGENTS.md`（測試指令）。

未修改：`addConfig`、`checkStock`、`checkConfigAssemblyRules`、`refreshSelectors`、`updateNoRatchetConfigOption`、`assembly-rules.js`、`collection-sync.js`、`data-session-guard.js`、`collection-view.js`、`site-menu.js`（未升版）。

## 測試

| 項目 | 結果 |
|---|---|
| Node（20 檔） | 468/468（新增 Q-01～Q-10） |
| Phase 7-2 整合回歸 | 505/505（7-2 收藏面板新增按鈕後） |
| M01～M16 | PASS 16／FAIL 0 |
| validate／build／`git diff --check` | PASS／PASS（36 files）／PASS |
| 核准雜湊 | 6 段不變（測試固定） |
| 寫入路徑 | `saveData(` 17、`runTransaction(` 1、`setDoc`／`updateDoc`／`deleteDoc` 0 |

快取字串在回歸與 M 系列之後才改為 `phase73d`（只改字串）；之後 Node 468/468、validate、build、diff-check 重跑通過。

### Emulator 真實頁面（`demo-beyblade-7dc-ui`，127.0.0.1）

| 情境 | 結果 |
|---|---|
| 複製合法配置 | 組裝器開啟（標題「複製配置」、新增模式、零件預填）；取消 0 次寫入，配置不變 |
| 複製並儲存（庫存足夠） | 1 次寫入 200；原配置保留 |
| 再複製一次（上蓋已用完） | 上蓋未選入並提示；儲存被既有必選檢查拒絕，0 次寫入 |
| 複製既有違規配置（惡魔冥界＋3-60） | 即時「不能儲存」；儲存被新建規則阻擋，無「原本就不符合」確認，0 次寫入 |
| 從收藏：BX-02「蒼龍  神劍」 | 標準三件式、原始名稱精準；拆解紀錄同組合提示 |
| 從收藏：CX-03／CX-01 | CX 四件／CX 三件，零件正確 |
| 從收藏：UX-21-01 | 一體式，固鎖欄「無獨立固鎖」 |
| 從收藏：BX-14 抽包 | 零件已被占用，均未選入並逐一提示 |
| 從收藏：CX-09（缺主要戰刃、輔助戰刃、軸心） | 只填紋章鎖與固鎖，其餘「尚未選擇」 |
| 收藏開啟／取消 | 0 次寫入，原裝收藏不變；儲存 1 次寫入，收藏仍不變 |
| 過期按鈕 | 收藏列與配置列被改動後按按鈕 → 既有「資料已更新」提示，不開啟 |
| 登出／換帳號 | 預填中的組裝器關閉、0 次寫入；B 帳號重開為空白「建立配置」，無前一帳號的值或提示 |
| 手機 | 兩個入口都先關閉 sheet，無殘留遮罩；深色與米色無水平溢出 |
| 版面 | 375／820／821／1440 × 深色／米色：配置面板三個按鈕、收藏面板兩個按鈕不溢出 |

## 未驗證／已知

- Safari／iOS 未驗證。
- 第一輪不 commit；ChatGPT 複審有條件 PASS，以下補測通過後 commit。

## 複審補測（2026-11-25）

| 項目 | 結果 |
|---|---|
| 遠端更新：複製配置 | A 開著預填的「複製配置」時，B 修改另一配置並儲存（200）→ A 的組裝器以既有「偵測到較新的雲端資料」關閉；之後按舊的儲存按鈕 0 次寫入；A 顯示 B 的值；重開一般「建立配置」無預填值或提示 |
| 遠端更新：從收藏建立配置 | 同上；A 全程 0 次寫入，收藏不變 |
| 焦點（新增顯示層修正） | 桌面：取消後回到面板上開啟它的按鈕（「建立配置」／「複製配置」）；手機（sheet 重繪、按鈕消失）：回到原收藏項目／原配置項目；兩者都消失：「＋ 建立配置」。一般開啟不會沿用先前的替代目標。未修改 session 與交易協定 |
| 資料保護 | 預填後切換結構 6 次、取消 0 次寫入；複製為新增模式（標題「複製配置」、無編輯目標）；第二次複製上蓋已無庫存而未選入（未釋放原配置占用）；複製違規配置被新建規則阻擋、無既有違規確認；缺件與無庫存零件不補入；複製與從收藏各 1 次寫入 200，原配置與收藏不變 |
| 回歸（phase73d 快取） | Node 469/469（新增 Q-11）；Phase 7-2 回歸 505/505；M01～M16 PASS；validate／build／diff-check PASS；核准雜湊與寫入路徑不變 |
