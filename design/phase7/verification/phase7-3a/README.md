# Phase 7-3a 驗證紀錄（D-019 接線、配置排序）

日期：2026-11-24。基準 `fa4e419` ＋ 7-3a 修改（本機）。規格：[`../../11-phase7-3-assembler-spec.md`](../../11-phase7-3-assembler-spec.md)。

## 1. Node：真實 `addConfig` 路徑（`tests/config-assembly-wiring.test.mjs`，16 項）

`tests/helpers/config-page-harness.mjs` 把 `script.js` 從第一個頁面變數到檔尾整段放進 VM，配上小型記憶體 DOM（`<select>` 只能選到自己的選項、MutationObserver 以微任務送出），Firebase 換成 mock Firestore；`data-session-guard.js`、`collection-sync.js`、`assembly-rules.js`、`collection-view.js` 都是真實模組。每個案例都打開真實的 Quick Editor、從真實 `refreshSelectors` 提供的選項挑選，再呼叫 `window.addConfig`，經真實 `saveData`／D-018 交易寫入。

| 項目 | 結果 |
|---|---|
| 新建：惡魔冥界＋3-60、惡魔冥界＋Tr、非 UX-16 型號的時鐘幻象＋9-60 | 阻擋；不寫入、無交易、原始列不變、編輯器保持開啟 |
| 新建：UX-19 彈丸獅鷲＋3-60、UX-20 榮耀戰神＋Tr、UX-16 時鐘幻象＋9-60／＋Tr | 阻擋（原有規則不變）；時鐘幻象＋9-65 可儲存 |
| 無固鎖：固鎖選單清空後儲存惡魔冥界、BX 上蓋＋Op | `getNoRatchetFixValue` 帶入上蓋名稱，存成 `-` |
| 合法配置 9 欄與 `mainStockName` | BX/UX、CX 三件（`mainStockName`＝主要戰刃）、CX 四件（`""`、「超越/金屬」）與修正前相同 |
| 修改：保留原有違規 | 規則確認 → 儲存確認 → 儲存；儲存格與載入時相同時 D-018 不寫入 |
| 修改：同一違規只換固鎖 | 確認後儲存，一次寫入 |
| 修改：任一確認取消 | 不改原始列、不呼叫 `saveData`、雲端文件與交易數不變 |
| 修改：新違規（加 Tr、換成另一顆一體上蓋、時鐘幻象原因改為 Tr、合法改成違規） | 阻擋，不出現確認；其中兩項違規數量不變，證明比較的是身分 |
| 修改：完全修正 | 只有儲存確認 |
| 基準與失效列 | 比較基準是原始列（表單值不取代）；開啟期間列被移除或儲存值改變 → 提示、關閉、不寫入 |
| session | 開啟期間換帳號 → 關閉、不寫入，另一帳號無文件；遠端重建 → 關閉（既有保護） |
| 雜湊 | `addConfig` 儲存格寫入段落 `da046a3d56a07519`、`checkStock` `0bed51c10a056c87`，與 `fa4e419` 相同 |
| 排序回歸（3 項） | 見 §3 |

突變檢查：以 `fa4e419` 的 `script.js` 執行，9 項失敗（D-019 相關全部）；把 `assemblyViolationKey` 改成只回傳規則 id，「數量相同的新違規」一項失敗。

## 2. Emulator：真實頁面（`exports/emulator-ui-73a/`，Git 忽略）

完整網站複本，只改 Firebase 設定（`demo-beyblade-73a-ui`）與 Emulator 連線（Auth 9199、Firestore 8185），登入改 redirect（內建瀏覽器不支援彈出視窗）；其餘檔案與專案逐位元組相同。測試帳號 tester-a／tester-b@example.test 只存在 Emulator。以頁面上的按鈕與選單操作（`window.confirm`／`alert` 在頁面中替換為記錄器以便自動作答）。

| 情境 | 結果 | Emulator `updateTime` |
|---|---|---|
| 新建 惡魔冥界＋3-60／＋Tr、時鐘幻象＋9-60、彈丸獅鷲＋3-60 | 各自阻擋，訊息正確 | 不變 |
| 修改既有違規（惡魔冥界＋3-60）：規則確認取消、儲存確認取消、加 Tr、換成彈丸獅鷲 | 取消不寫入；後兩項阻擋 | 不變 |
| 修改既有違規：只換 4-60 | 兩次確認後儲存，只改 `configTable` | 寫入一次 |
| 修改：改為無固鎖 | 只有儲存確認 | 寫入 |
| 新建合法：惡魔冥界＋無固鎖＋Z、彈丸獅鷲＋無固鎖＋Z | 儲存，`cells` 正確 | 寫入 |
| 跨帳號：tester-a 修改中按登出 → 以 tester-b 登入 | 編輯器關閉、表格清空；之後按儲存不寫入；tester-a 文件不變，tester-b 無文件 | A 不變 |
| Console | Error 0 | |

## 3. 配置排序（儲存前同步排序已撤回）

`sort-repro.mjs`（真實程式，mock Firestore）在目前程式（7-3a，排序維持原樣）的輸出：

```
[sorted legacy]                      dirty after load+250ms: []                → 0 commits
[unsorted legacy + unrelated save]   dirty after load+250ms: ["configTable"]   → the part save also rewrites configTable order
[addConfig then unrelated save]      stored right after addConfig: insertion order; +250ms dirty ["configTable"]
[restoreHistoryRow then unrelated]   same as addConfig
```

加入「`addConfig`／`restoreHistoryRow` 在 `saveData()` 前同步排序」後，後兩項乾淨，但**未排序資料載入**仍在 250 ms 後變成未儲存（D-018 基準在載入當下取得；配置表由 MutationObserver 在 80 ms 後排序）。核准方案無法完整解決，依指示撤回（`script.js` 與只含 D-019 修正的版本逐位元組相同）。

Emulator 真實頁面另外確認（既有行為，7-3a 未改變）：
- 雲端為未排序資料時畫面已排序；閒置 6 秒沒有自動寫入；之後新增一個零件，這次儲存同時把 `configTable` 改寫為排序後順序。
- 一次 `addConfig` 會產生 **2 次** commit：第一次是新增順序，回音快照後 `scheduleCollectionSaveIfDirty` 再寫一次排序後順序。
- 同時發現：載入時 `normalizeAllModelCells` 把 `UX-21-01 CUSTOM` 顯示為 `UX-21 -01 CUSTOM`，之後 `configTable` 被寫入時會以這個值存回（既有，見 `docs/AI_HANDOFF.md`）。

保留的回歸測試：已排序資料載入 250 ms 後乾淨、不相關儲存不改寫 `configTable`；畫面重排後修改的是正確那一列；畫面重排造成的未儲存狀態遇到另一裝置修改配置時，D-018 進入衝突、不寫入、不覆蓋。

## 4. Phase 7-2 整合回歸

`phase7-2-regression/`（端口 4346）：17 組 **505/505**（a 4×32、b 4×31、c 4×38、d 2×24＋2×23、fail 7）；分類 same 273、entry 108、design 12、added 112，與 7-2d 紀錄相同。

## 5. 其他

Node 全部 16 個測試檔 383/383；`validate-site` PASS；build PASS（35 files）；`git diff --check` PASS；A-09 原有 10 段雜湊不變；寫入路徑 `saveData()` 17、`runTransaction(` 1、`setDoc`／`updateDoc`／`deleteDoc` 0；`assembly-rules.js`、`collection-sync.js`、`data-session-guard.js`、`collection-view.js`、`firestore.rules` 未修改。
