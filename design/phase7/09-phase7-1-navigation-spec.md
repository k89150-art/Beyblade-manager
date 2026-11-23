# 09｜Phase 7-1 實作規格：導覽骨架與導覽元件

狀態：**規格提案，等待使用者與 ChatGPT 核准後才開始實作**。

依據：README 已定案事項（A 工作台骨架、手機底部導覽「收藏／配置／＋新增／賽事／更多」、額外零件庫存併入收藏「零件」、首頁工作台從左上標誌進入、PWA 起始頁維持 `home.html`）。

## 1. 目標與範圍

把全站導覽換成已定案的結構，並建立之後各階段共用的導覽元件與設計 token。**只改導覽層**，頁面內容（收藏卡片、組裝器、賽事比分板等）留給後續階段。

### 本階段做

| # | 內容 |
|---|---|
| N1 | 手機底部導覽改為：收藏／配置／＋新增／賽事／更多 |
| N2 | 「＋新增」選單：新增收藏、新增零件、建立配置、新增比賽、記錄回合 |
| N3 | 「更多」開啟現有側欄（含競賽統計、說明、主題、管理） |
| N4 | 桌面側欄重新分組，頂部加入「＋新增」按鈕（同一個選單） |
| N5 | 跨頁快速動作用網址錨點（例如 `index.html#add-collection`），由 `site-menu.js` 捲動並聚焦對應欄位 |
| N6 | 導覽元件的設計 token（深色／米色），供後續階段沿用 |
| N7 | 更新 `guide.html` 導覽說明、`changelog.html` 新版紀錄、`AGENTS.md` 導覽契約描述、架構文件 |

### 本階段不做

- 首頁工作台：導覽決定由左上標誌進入，但首頁本身屬於下一階段。本階段左上標誌維持現狀（手機為 ☰ 開啟側欄；桌面側欄標題不變）。
- 把「額外零件庫存」改成收藏頁內的分頁、頁面標題改名：屬於收藏與零件階段。本階段導覽先把它列在「收藏」底下，名稱見「需要確認」1。
- 賽事比分板、直接跳到記錄回合：屬於賽事階段。本階段「記錄回合」先開啟賽事頁。
- 任何資料、交易、Session、Rules、型錄、統計的修改。

## 2. 新導覽內容

### 手機底部（5 格）

| 位置 | 項目 | 連結 | 亮起條件 |
|---|---|---|---|
| 1 | 收藏 | `index.html#collectionSection` | 主頁的收藏或額外零件區 |
| 2 | 配置 | `index.html#configSection` | 主頁的配置或歷史測試區 |
| 3 | ＋新增 | 開啟選單（按鈕，不是連結） | 不亮 |
| 4 | 賽事 | `tournament.html` | 賽事頁 |
| 5 | 更多 | 開啟側欄（按鈕） | 競賽統計、說明頁、管理頁 |

「競賽統計」離開底部導覽，改在「更多」。底部仍是 5 格（`grid-template-columns: repeat(5, …)` 不變）。

### 桌面側欄

```
[＋ 新增]
主要功能   收藏
           　零件（額外零件庫存）
           配置紀錄
           賽事
參考       競賽統計
工具       建立配置（Quick Editor）
說明       首頁／開始使用／使用教學／更新紀錄／隱私權政策／關於本站／聯絡方式
管理       管理員後台（僅管理員）
```

所有現有項目都保留；只有分組、順序與「零件」顯示方式改變。

### 「＋新增」選單

| 項目 | 目的地 | 行為 |
|---|---|---|
| 新增收藏 | `index.html#add-collection` | 捲到收藏區、聚焦型號輸入框（未登入時只捲動） |
| 新增零件 | `index.html#add-part` | 捲到額外零件區、聚焦零件名稱 |
| 建立配置 | 主頁上直接開啟 Quick Editor；其他頁前往 `index.html#configQuickEditor`（沿用現有網址） | 與現有 Quick Editor 入口相同 |
| 新增比賽 | `tournament.html#add-tournament` | 捲到新增比賽表單、聚焦日期 |
| 記錄回合 | `tournament.html` | 本階段先開啟賽事頁；賽事階段改為直接開啟進行中的對局 |

元件規格：
- 手機：底部抽屜；桌面：從側欄按鈕展開的選單。
- 按鈕帶 `aria-haspopup="menu"`、`aria-expanded`；選單 `role="menu"`，項目 `role="menuitem"`；方向鍵移動、Esc 關閉並把焦點還給按鈕、點選單外關閉。
- 觸控目標至少 44px。
- 只是導覽，不執行寫入；寫入仍由各頁既有表單與函式處理，登入與寫入閘門不變。

## 3. 修改檔案

| 檔案 | 修改 |
|---|---|
| `site-menu.js` | `SIDE_MENU_ITEMS` 重新分組（新增 `bottomOrder`／`parent` 等欄位）；`renderBottomNav` 改為 5 格含兩個按鈕；新增「＋新增」選單與錨點處理（`#add-collection`、`#add-part`、`#add-tournament`）；`getInitialToolSection`／active 判斷納入新錨點與「更多」；`SITE_VERSION` 改為 `v1.10.0` |
| `site-menu.css` | 新增導覽 token 與「＋新增」按鈕、選單、抽屜樣式（深色／米色）；底部 5 格格線維持 |
| 11 個 HTML（`index`、`tournament`、`competition-stats`、`admin`、`user-view`、6 個說明頁） | 只更新 `site-menu.js`、`site-menu.css` 的快取版本號 |
| `guide.html` | 改寫導覽說明段落（底部「收藏／配置／＋新增／賽事／更多」、競賽統計在「更多」） |
| `changelog.html` | 新增 v1.10.0 紀錄 |
| 測試 | 見第 5 節 |
| `AGENTS.md` | 第 2、5 節的導覽描述改為新結構；仍維持「底部五項導覽是操作契約，變更需使用者同意」 |
| `docs/PROJECT_ARCHITECTURE.md`、`docs/PROJECT_DECISIONS.md`（新增 D-020 導覽）、`docs/AI_HANDOFF.md` | 文件 |

**不修改**：`script.js`、`collection-sync.js`、`data-session-guard.js`、`tournament.js`、`tournament-sync.js`、`assembly-rules.js`、`competition-stats*.js`、`admin.js`、`user-view.js`、`manifest.json`、所有資料檔、Rules。

錨點處理放在 `site-menu.js`，不需要改 `script.js` 與 `tournament.js`；Quick Editor 沿用現有的 `window.openConfigQuickEditor` 與 `#configQuickEditor`。

## 4. 設計 token（N6）

在 `site-menu.css` 的 `:root` 與 `[data-theme="beige"]` 新增一組前綴 `--ui-` 的 token，只供導覽元件使用，不改既有變數：

- 色彩：`--ui-surface`、`--ui-surface-raised`、`--ui-line`、`--ui-text`、`--ui-text-muted`、`--ui-accent`、`--ui-accent-text`、系列色 `--ui-bx`／`--ui-ux`／`--ui-cx`。
- 形狀與間距：`--ui-radius-sm/md/lg`、`--ui-space-1…6`、`--ui-touch: 44px`。
- 層級：`--ui-z-nav`、`--ui-z-sheet`。

數值取自 A＋C 原型並對齊現有主題色；兩個主題結構、字級相同，只換色彩（D-001）。後續階段的頁面元件沿用同一組 token。

## 5. 測試與驗收

**需要更新的既有測試**（這些測試鎖住舊導覽，屬於已核准的變更）：
- `tests/manager-ui-refresh.test.mjs`：`label: "額外零件庫存", bottomLabel: "庫存"` 等斷言改為新結構。
- `tests/help-pages.test.mjs`：`site-menu` 版本號；`guide.html` 導覽說明文字。
- `tests/retirement.test.mjs`：底部 5 欄格線與 `competition-stats.html` 連結仍成立，預期不需改。

**新增測試**（`tests/site-navigation.test.mjs`，以 VM 執行真實 `site-menu.js`）：
1. 底部恰好 5 項，順序為收藏、配置、＋新增、賽事、更多；＋新增與更多是按鈕。
2. 側欄包含所有既有目的地（收藏、額外零件、配置、Quick Editor、競賽統計、賽事、7 個說明頁、管理員後台），沒有遺漏。
3. 各頁 active 狀態：主頁三區、賽事、競賽統計（亮「更多」）、說明頁。
4. ＋新增選單 5 項與對應網址；Esc 關閉與焦點返回。
5. 錨點處理：`#add-collection`／`#add-part`／`#add-tournament` 捲動並聚焦正確元素；`#configQuickEditor` 行為不變。
6. 管理員項目只對管理員顯示（沿用現有測試方式）。

**整體驗收**：
- 全部 Node 測試、`validate-site`、build、`git diff --check`。
- 瀏覽器：11 個頁面 × 390／768／1440 × 深色／米色，無水平溢出、Console Error 0；底部導覽、＋新增選單、更多側欄、桌面側欄收合都能操作；鍵盤操作可用。
- 主頁「收藏儲存版本：5B」、賽事頁「賽事儲存版本：4B-1」文字不變。
- 不觸及資料寫入，不需要 Emulator。

## 6. Commit、部署與回退

- 一個本機 commit；push／部署另行授權。
- 部署風險低：不改資料與寫入流程；舊快取頁面只會顯示舊導覽，下次載入即更新（HTML 版本號已更新）。
- 回退：revert 該 commit 即可，資料不受影響。

## 7. 需要確認

1. **「零件」在導覽中的名稱**：本階段頁面標題仍是「額外零件庫存」。建議側欄顯示「零件」並縮排在「收藏」下（滑鼠提示「額外零件庫存」），等收藏與零件階段再把頁面標題一起改成「零件」。另一個做法是本階段先沿用「額外零件庫存」。
2. **「記錄回合」**：本階段先開啟賽事頁（建議）；或先不放進選單，等賽事階段再加入。
3. **網站版本號**：建議 `v1.10.0`，並在更新紀錄寫明導覽調整。
