# 11｜Phase 7-3：組裝器與配置管理（實作規格）

狀態：**7-3a 已隨 v1.14.1 部署**（功能 commit `fca352e`、release `f4d2546`，GitHub Pages deployment `8024719101`，2026-11-24；排序修改已撤回）；7-3b～7-3d 規格已定，尚未授權實作。

基準：`main` = `fa4e419`（origin/main = `17ac204`，正式網站 v1.14.0）。前置審查與 ChatGPT 有條件 PASS：2026-11-24。

## 1. 已定案決策（2026-11-24，使用者／ChatGPT）

| # | 決策 |
|---|---|
| A1 | 沿用已核准的 **A 零件槽設計**與 `prototypes/integrated-ac/` 原型的組裝器行為（08）；不採用 B 的疊層組裝器，不做疊層示意。 |
| A2 | 分四步：**7-3a** D-019 接線與配置排序修正；**7-3b** 配置顯示層、搜尋篩選排序、詳細面板與手機 sheet；**7-3c** 組裝器介面改版；**7-3d** 複製配置、從收藏陀螺建立配置（正式納入）。 |
| A3 | 7-3d 的快速建立只**預填組裝器**，不得直接儲存；儲存一律由使用者按下儲存、經 `addConfig` 的全部檢查。 |
| A4 | Tr／Op 搭配 CX 四件戰刃：只顯示**非阻擋式提示**，不新增違規規則（`assembly-rules.js` 不變）。 |
| A5 | 「歷史測試紀錄」改名為「**拆解紀錄**」，只改顯示文字；`historyTable` 資料結構與欄位不變。 |
| A6 | D-018 連續空白問題**獨立待修**，不在 7-3 處理；7-3 的顯示層只能用 clip 隱藏（K-1）。 |
| A7 | 配置排序：有條件核准「儲存前同步排序」；若無法完整解決，撤回該部分、保留為獨立待修，不擴大範圍（7-3a 結果：**已撤回**，見 §3.3）。 |

## 2. 不可變更（7-3 全程）

- Firestore Schema、Rules；正式資料、舊 RTDB、UID 隔離。
- D-018（`collection-sync.js` 與 `script.js` D-018 區段）、D-015、F-04；`data-session-guard.js`。
- 原始資料表（`#beybladeTable`、`#partTable`、`#configTable`、`#historyTable`）為唯一權威資料來源；配置 9 欄 `cells` 與 `mainStockName` 規則。
- 組裝判定規則（`assembly-rules.js`，D-019）、競賽統計、官方名稱型錄。
- Phase 7-2 已完成的功能（7-3d 只在收藏詳細面板加一個入口按鈕，見 §6）。
- 寫入路徑：`saveData()` 17 處、`runTransaction` 實際呼叫 1 處；不新增 `setDoc`／`updateDoc`／`deleteDoc`。
- 受保護雜湊：A-09 原有 10 段（`tests/collection-view.test.mjs`）；7-3a 新增 `addConfig` 儲存格寫入段落與 `checkStock`（`tests/config-assembly-wiring.test.mjs`）。

## 3. 7-3a：D-019 接線與配置排序

### 3.1 D-019 原有接線缺口（前置審查發現）

- 實際使用的配置儲存路徑是 Quick Editor 的 `window.addConfig`（「建立配置」與「⋯ → 修改」都走它）。它呼叫 `validateRatchetRules(model, axisSel, fixSel)`，**沒有傳入上蓋名稱**；`getNoRatchetFixValue` 也沒有。
- 結果：依上蓋名稱的規則在正式網站不會觸發，只剩型號備援（UX-19、UX-20、UX-16）。實測（真實程式）：惡魔冥界＋3-60、惡魔冥界＋Tr、非 UX-16 型號的時鐘幻象＋9-60 都能儲存。
- 修改既有違規配置時，`validateRatchetRules` 會直接阻擋，不會出現 D-019 規定的「確認後可儲存」。
- 符合 D-019 的 `checkConfigAssemblyRules` 在 `f1df0bc`（Phase 7-R）被接到已無入口的舊行內編輯 `saveConfigEditRow`；它讀取的是 Quick Editor 專用的 `configEditorRow`，可見原本是為 `addConfig` 寫的。當時的測試只驗證這個函式本身，沒有驗證 `addConfig` 呼叫它。

### 3.2 修正（只在 `script.js`）

| 位置 | 修改 |
|---|---|
| `window.addConfig` | `getNoRatchetFixValue(model, axisSel, fixSel, layerSel)`；`checkConfigAssemblyRules(model, layerSel, fixSel, axisSel)` 取代 `validateRatchetRules`。位置不變（必填檢查與庫存檢查之前），之後的流程、9 欄寫入、`mainStockName` 規則、`saveData` 呼叫都不變。 |
| `window.addConfig` 開頭 | 既有 session 檢查之後，修改時確認 `configEditorRow` 仍是開啟時那一列：仍在 `#configTable`、儲存值（`getPersistedRowCells`）與 `mainStockName` 相同。否則提示「這筆配置已經變更或不存在，請重新開啟後再修改。」、關閉編輯器、不寫入。 |
| `openConfigQuickEditor`／`closeConfigQuickEditor` | 開啟時記錄該列的簽章，關閉時清除（`configEditorRowSignature`）。 |
| `checkConfigAssemblyRules` | 新舊違規以**違規身分**比較（`assemblyViolationKey`），不只比 id 或數量：<br>• 固鎖一體上蓋＋固鎖：規則＋上蓋<br>• 固鎖一體上蓋＋Tr／Op：規則＋上蓋＋軸心<br>• Tr／Op＋固鎖：規則＋軸心<br>• 時鐘幻象：規則＋上蓋＋原因（Tr／Op 軸心，或非簡易固鎖）<br>上蓋以名稱（去空白）識別；沒有名稱時用型號代碼（舊 UX-19／UX-20／UX-16 備援）。同一條規則、同一個零件只換固鎖數值，仍視為原有違規（與 D-019 已核准的測試一致）。比較基準取自配置自己的原始資料列（儲存值），不使用表單值。 |
| import | 改為匯入 `bitCode`（`assembly-rules.js` 既有匯出）；移除不再使用的 `newAssemblyViolations` 匯入。`assembly-rules.js` 不變。 |
| `index.html` | `script.js?v=20261124-phase73a`（只換快取參數；`SITE_VERSION` 不變）。 |

行為（沿用 D-019 語意）：

| 情況 | 結果 |
|---|---|
| 新建違規配置 | 阻擋（alert 第一條違規），不寫入、編輯器保持開啟 |
| 修改既有配置並產生新違規 | 阻擋，不出現確認 |
| 保留既有違規、沒有新違規 | 規則確認 →「確定要保存這次配置修改嗎？」→ 儲存 |
| 完全修正違規 | 只有既有的儲存確認，正常儲存 |
| 任一確認按取消 | 不修改任何原始資料列、不呼叫 `saveData` |

未修改：`saveConfigEditRow`（舊行內編輯，無入口）、收藏手動輸入（`addManualStockRow` 已帶上蓋名稱）、`restoreHistoryRow`（D-019：還原不檢查）。

### 3.3 配置排序（已撤回，獨立待修）

重現（真實程式，`tests/helpers/config-page-harness.mjs`；腳本與輸出見 `verification/phase7-3a/`）：

| 情境 | 修正前 | 加上「儲存前同步排序」後 |
|---|---|---|
| `addConfig` 新增後 | 以新增順序儲存；80 ms 後畫面排序 → `configTable` 變成未儲存 → 下一次不相關的儲存連帶改寫順序 | 解決：儲存的順序＝排序後順序，之後不再變動 |
| `restoreHistoryRow` 還原後 | 同上 | 解決 |
| 已排序的資料載入 | 乾淨 | 乾淨 |
| **未排序的資料載入**（舊版本最後一次是新增配置、或仍開著的舊版分頁寫入） | D-018 基準取自載入當下；80 ms 後畫面排序 → `configTable` 變成未儲存 → 下一次不相關的儲存連帶改寫 | **仍存在** |

原因：載入時 `applyDataToTables` 只同步排序收藏表，配置表由 `installConfigSort` 的 MutationObserver 在 80 ms 後排序，晚於 D-018 取基準的時點。要完整解決，只能在 `applyDataToTables`（A-09 受保護）內排序、重新取基準，或停止載入後的畫面重排，都超出核准方案，且禁止以重新建立基準或忽略順序差異處理。因此依指示撤回排序修改，`addConfig`／`restoreHistoryRow` 維持原樣。

影響（不變）：內容不會遺失；另一裝置同時修改配置時 D-018 會進入衝突並暫停，不會覆蓋（已加回歸測試）。需要另行決定的方案見 `docs/AI_HANDOFF.md` 待決事項。

### 3.4 7-3a 驗收

見 §8 與 `verification/phase7-3a/README.md`。

## 4. 7-3b：配置顯示層（規格，未授權）

沿用 7-2 的 R2／7-2d 架構，不改資料流：

- `#configTable`、`#historyTable` 以 clip 隱藏（K-1），不得用 `display:none`、`hidden`、`row.hidden`、`visibility:hidden`；顯示層從原始列快照渲染（`getPersistedRowCells`、`cells[3].dataset.stockName`），只寫在被觀察的 tbody 以外。
- 分頁：「我的配置」「拆解紀錄」（A5；只改顯示文字。`collection-sync.js` 的衝突提示表名不在 7-3 修改範圍，維持「歷史測試紀錄」字樣，另列待決）。
- 搜尋：上蓋／組合名稱、各零件名稱、型號。篩選：系列（全部／BX／UX／CX）、結構（標準／CX 三件／CX 四件／固鎖一體上蓋／Tr・Op 軸心），結構由 `cells` 以純函式判斷（固鎖一體判斷沿用 `assembly-rules.js` 匯出）。排序：預設（與 `sortTable` 相同：UX→BX→CX，再依型號）、上蓋名稱。篩選排序只在畫面，不寫入、不保存到雲端。
- 清單／卡片切換沿用 V3（另一個 localStorage key，try/catch）。
- 詳細面板（≥ 821px）與手機 sheet（≤ 820px）沿用 7-2d 的 CSS、`trapSheetFocus`、焦點回復、寬度切換與重建時關閉。內容：零件（依結構）、結構、規則提示（既有違規顯示為警告）、各零件可用／超用（`computePartsModel`，只讀）、拆解紀錄中的同組合紀錄。
- 操作只在面板：「修改」→ 既有 `window.editRow(row, "config")`（開啟組裝器）；「拆解」→ 既有 `window.deleteRow(row)`（原因視窗、拆解紀錄）。拆解紀錄：「還原」「刪除」→ 既有 `restoreHistoryRow`／`deleteHistoryRow`。執行前做 7-2d 的新鮮度檢查（列仍存在、簽章相同），不以合成點擊觸發 inert 內的按鈕。
- 清單上的「⋯」選單移除（操作在面板）。配置排序待修問題不受影響（顯示層自行排序）。
- 新純函式放在新檔 `config-view.js`；`collection-view.js` 不改。

## 5. 7-3c：組裝器（規格，未授權）

- 保留 Quick Editor 的元素 id（`configQuickEditor`、`confModel`、`sel上蓋`…`sel軸心`、`saveConfigEditorBtn`），讓 `addConfig` 讀取方式不變；寫入只經 `addConfig`。
- 頂部選結構：標準三件式（BX／UX）、CX 三件戰刃、CX 四件戰刃；CX 三件只顯示「主要戰刃」，四件只顯示「超越＋金屬」（對應 `addConfig` 既有的二選一檢查）。固鎖一體上蓋與 Tr／Op 自動「無固鎖」（既有 `updateNoRatchetConfigOption`），固鎖槽顯示為「無固鎖」。
- 選項顯示剩餘數量（既有 `refreshSelectors`）。
- 即時檢查區（只讀、不阻擋；阻擋仍由 `addConfig` 決定）：庫存（可用數、超用時列出占用的配置）、規則（`evaluateAssembly` 帶上蓋名稱；修改時以 §3.2 的身分比較區分「原有」與「新產生」）、拆解紀錄重複（`findHistoryByComboKey`）、Tr／Op＋CX 四件戰刃提示（A4）。
- 桌面為對話框，手機為底部全螢幕 sheet；焦點限制與 Esc 關閉沿用 7-2d。

## 6. 7-3d：複製配置、從收藏陀螺建立配置（規格，未授權）

- 「複製」：配置詳細面板的按鈕，以該配置的零件**預填**組裝器（新建模式，`configEditorRow = null`）。
- 「用這顆建立配置」：收藏詳細面板的按鈕（Phase 7-2 面板只新增此入口），以該收藏的零件預填；CX 收藏預填 CX 模式。
- 只預填 `refreshSelectors` 提供的選項；用完或沒有的零件不自動選入，在即時檢查區提示。**不直接儲存**（A3）。

## 7. 預計修改檔案

| 步驟 | 檔案 |
|---|---|
| 7-3a | `script.js`、`index.html`（快取參數）、`tests/config-assembly-wiring.test.mjs`（新）、`tests/helpers/config-page-harness.mjs`（新）、三個快取版本測試、`README.md`／`AGENTS.md`（測試指令）、本文件、`docs/PROJECT_DECISIONS.md`、`docs/AI_HANDOFF.md`、`design/phase7/verification/phase7-3a/` |
| 7-3b | `script.js`（新的配置顯示層區塊）、`config-view.js`（新）、`index.html`、`style.css`、`guide.html`、測試、驗證頁 |
| 7-3c | `index.html`（Quick Editor 內容）、`script.js`、`style.css`、`guide.html`、測試、驗證頁 |
| 7-3d | `script.js`、`index.html`、`guide.html`、測試 |

發布（升版、`site-menu.js`、`changelog.html`）各自另行授權。

## 8. 驗收

每一步共同：全部 Node 測試；`validate-site`、build、`git diff --check`；A-09 與 7-3a 新增雜湊；寫入路徑 17／1／0／0／0；`assembly-rules.js`、`collection-sync.js`、`data-session-guard.js` 未修改；重跑 Phase 7-2 整合回歸 505 項；涉及寫入的步驟跑 Emulator（真實頁面）並比對 `updateTime`。

7-3a 專屬：
- 以真實 `addConfig` 操作路徑測試新建、修改、確認取消、身分比較、原始列失效、session 失效（`tests/config-assembly-wiring.test.mjs`；以 fa4e419 的 `script.js` 執行時 9 項失敗，證明測試打到修正點；把身分比較改成只比 id 時，身分測試失敗）。
- 阻擋與取消：Emulator 文件 `updateTime` 與四表指紋不變。
- 排序：§3.3 的重現與回歸測試（已排序資料載入乾淨、重排後修改目標正確、D-018 衝突不覆蓋）。

7-3b～7-3d：依 §4～§6 另定測試清單（比照 10 的 A／B／C 系列），實作前補入本文件。
