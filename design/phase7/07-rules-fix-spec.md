# 07｜第一步實作規格：組裝規則修正（Phase 7-R）

狀態：**規格提案，等待使用者與 ChatGPT 核准後才開始實作**。

依據：README 已定案事項 5（官方規則阻擋儲存、推論只提示、既有違規只警告、G × エクリプス 暫不啟用、簡易固鎖改白名單）；規則內容與來源見 [01](01-beyblade-x-assembly-rules.md)。

## 1. 目標與範圍

修正現行程式與官方規則不一致之處，**不改畫面版面**（新組裝器 UI 屬於後續階段），只改規則判斷與既有提示。

| # | 官方規則 | 現況 | 修正後 |
|---|---|---|---|
| R1 | UX 擴展戰刃（彈丸獅鷲、榮耀戰神、惡魔冥界）沒有獨立固鎖 | 只認型號 UX-19、UX-20；惡魔冥界被要求填固鎖 | 依**上蓋名稱**判斷，三款都自動改為「無固鎖」 |
| R2 | UX 擴展戰刃不能裝 Tr／Op | 沒有檢查 | 阻擋 |
| R3 | Tr、Op 是固鎖一體型軸心，不能另裝固鎖 | 只認 Tr；Op 被要求填固鎖 | Tr、Op 都自動改為「無固鎖」；另填固鎖時阻擋 |
| R4 | クロックミラージュ（時鐘幻象）只能用 O 型簡易固鎖，也不能用 Tr／Op | 以型號 UX-16 判斷，簡易固鎖用「高度尾數 5」 | 依**上蓋名稱**判斷；固鎖改用官方白名單 3-85、4-55、M-85、9-65、7-55、M-65 |
| R5 | CX 四件戰刃必須有金屬戰刃 | 已要求「主要戰刃」或「超越＋金屬」其中一組 | 不變（已符合） |
| — | 輔助戰刃 G × 主戰刃エクリプス 禁止 | 沒有檢查 | **不實作**（G 是否為グラビティ未確認） |
| — | Tr／Op 裝在 CX 四件戰刃下（官方未說明） | 允許 | 允許，不提示（此階段不加新 UI；提示留給組裝器階段） |

### 為什麼要改成依上蓋與軸心判斷

配置的型號是用「收藏中第一個同名上蓋的型號」產生（`findSourceModelForLayer`，`script.js:462`）。UX-21 是三顆一組，其中只有惡魔冥界是一體型；霜輝銀狼、飛龍旋翼的配置型號同樣是 `UX-21-0x CUSTOM`。如果把 UX-21 加進現有的型號清單，會讓另外兩顆被誤判成無固鎖。所以規則改為看**上蓋名稱**與**軸心代號**；UX-19、UX-20 的型號判斷保留作為相容備援。

## 2. 設計

### 新增純函式模組 `assembly-rules.js`（根目錄，無 DOM、無 Firebase）

```js
export const INTEGRATED_RATCHET_BLADES = ["彈丸獅鷲", "榮耀戰神", "惡魔冥界"];   // 官方 /help/noratchet/
export const INTEGRATED_RATCHET_BITS = ["Tr", "Op"];                              // 官方 CX-07／CX-11 說明書
export const SIMPLE_RATCHET_ONLY_BLADES = ["時鐘幻象"];                            // 官方 /help/ratchet/
export const SIMPLE_RATCHETS = ["3-85", "4-55", "M-85", "9-65", "7-55", "M-65"]; // 官方列舉
export const LEGACY_NO_RATCHET_MODELS = ["UX-19", "UX-20"];                      // 現行相容

// 依現有 9 欄 cells 的值判斷；回傳阻擋與警告，不修改任何資料
export function evaluateAssembly({ model, layer, fix, axis }) → { noRatchet: boolean, blocks: [...], warnings: [...] }
export function newViolations(before, after) → 只回傳「修改後新產生」的違規
```

- 名稱比對沿用現有的空白與全形正規化；軸心代號比對不分大小寫（現行 `getAxisCode` 已轉大寫）。
- 清單只引用型錄與名稱對照中已存在的名稱，不新增譯名。測試會核對：型錄中 `ratchetMode: integrated_blade_ratchet` 的上蓋 ⊆ `INTEGRATED_RATCHET_BLADES`，`integratedRatchetBit` 的值 ⊆ `INTEGRATED_RATCHET_BITS`。

### `script.js` 的修改點（只動規則相關函式）

| 位置 | 現在 | 修改 |
|---|---|---|
| `shouldUseNoRatchet`、`isNoRatchetModel`、`isNoRatchetAxis`、`isSimpleRatchet`、`validateRatchetRules`（`script.js:351-436`） | 型號與 Tr 判斷 | 改為呼叫 `assembly-rules.js`；函式名稱保留，呼叫端不變 |
| 編輯器「無固鎖」選項 `updateNoRatchetConfigOption`（`3633`） | 依型號／Tr | 依上蓋＋軸心；選到惡魔冥界、Op 也會自動帶「無固鎖」 |
| 建立／修改配置 `addConfig`（`3853`） | 違規即 alert 並中止 | **新建**：違規即阻擋（現行行為）。**修改**：只有新產生的違規才阻擋；原本就有的違規改為 confirm 警告後可儲存 |
| 收藏手動輸入 `addManualStockRow`（`2545`） | 同一套檢查 | 套用同一套新規則（見「需要確認」1） |
| 歷史測試還原 `restoreHistoryRow`（`925`） | 不檢查規則 | 維持不阻擋（見「需要確認」2） |
| 行內配置編輯（`1349`、`1429`） | 已無入口的舊程式 | 不修改 |

- `index.html` 的 `script.js` 快取版本號更新；`collection-sync.js`、`data-session-guard.js`、`tournament*.js`、Firestore 讀寫流程、`cells` 格式**完全不動**。
- 不新增或修改任何資料檔；型錄、名稱對照、競賽統計不動。

### 提示文字（沿用現有 alert／confirm 形式）

- R1／R3 自動帶入：固鎖欄位直接顯示「無固鎖」，不額外跳窗。
- R2 阻擋：「榮耀戰神是固鎖一體型上蓋，不能使用 Tr／Op 這類固鎖一體型軸心。」
- R3 阻擋：「Op 是固鎖一體型軸心，不能另外裝固鎖。」
- R4 阻擋：「時鐘幻象只能使用簡易固鎖（3-85、4-55、M-85、9-65、7-55、M-65），也不能使用 Tr／Op。」
- 既有違規的修改：「這個配置原本就不符合官方組裝規則（…）。仍要儲存這次修改嗎？」

## 3. 測試與驗收

1. **新增單元測試** `tests/assembly-rules.test.mjs`：R1～R4 每條的允許與阻擋案例；UX-21 另外兩顆仍需固鎖；UX-19／UX-20 舊型號相容；大小寫與空白；`newViolations` 只回傳新違規；清單與型錄一致性檢查；mutation 檢查（拿掉任一條規則會被測到）。
2. **頁面行為測試**：以既有 VM harness 方式執行真實 `addConfig`／`addManualStockRow` 路徑，驗證阻擋、自動「無固鎖」、既有違規的 confirm。
3. 既有 296 項測試全部通過；`validate-site`、build、`git diff --check`。
4. **資料不變驗證**：載入一份含既有違規配置的資料，不做任何操作時不觸發儲存；儲存未修改的配置時 `cells` 完全相同。
5. 瀏覽器：390／1440、深色／米色，配置編輯器的「無固鎖」自動帶入與提示文字正確，Console Error 0。
6. 本階段不修改交易流程，原則上不需 Emulator；若實作時觸及儲存路徑，加跑 M 系列。
7. `README.md`／`AGENTS.md` 測試指令加入新測試檔。

## 4. Commit 與部署

- 一個本機 commit（規則模組＋`script.js`＋`index.html` 版本號＋測試＋文件）。
- Push／部署需另行授權；部署程序比照 D-017／D-018（關閉舊分頁、確認版本列、部署前備份）。
- 回退：revert 該 commit 即可；資料格式不變，舊版程式可正常讀取所有資料。

## 5. 需要確認

1. **收藏手動輸入是否套用同一套規則？** 建議套用：手動輸入代表實體官方產品，官方產品本身不會違反規則，套用只會擋掉打錯的組合。
2. **歷史測試還原是否檢查規則？** 建議維持不阻擋：還原的是過去實際存在的資料；還原後若違規，再次修改時會出現「既有違規」警告。
3. **版本列**：主頁「收藏儲存版本：5B（交易保護）」是否維持不變（本階段沒有改交易）。建議維持，只更新 `script.js?v=` 快取版本。
