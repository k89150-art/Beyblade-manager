# 維護事項清單（Phase 7 結案後）

Phase 7 已完整結案（技術驗收與使用者實機驗收 9/9 PASS），進入日常維護模式。以下為已知、尚未處理的獨立事項；每一項都需要另行授權，不屬於 Phase 7。來源：`design/phase7/14-final-acceptance-report.md` §5、§9。

## 目前版本（2026-11-25 結案時）
- 正式：v1.18.1，`97ced93`（GitHub Pages deployment `8040915692` success）。收藏儲存版本 5B（D-018 交易保護）；賽事儲存版本 4B-1（D-017 交易保護）。
- 最近一次有效備份：v1.18.0 前 `beyblade-appData-backup-20261125-042907.json`（verify PASS）。v1.18.1 由使用者略過備份（單次例外）；下次涉及資料的發布前應重新備份。

## 安全基線（變更任一項都需要另行授權並更新測試釘選）
- 收藏端核准雜湊：`getTableData` `02f67bb21e597b3e`、`applyDataToTables` `08c1de72b2266fec`、`editRow`→`rebuildRow` `3ec54b27ec414e19`、`getStockNameFromCell`→`escapeHtml` `c1230e4d43e39ba2`、`addConfig` 寫入 `da046a3d56a07519`、`checkStock` `0bed51c10a056c87`；A-09 `deleteRow` `5260d10ffd5ebdf3`（D-025）；`collection-sync.js` 整檔 `0cda868c6585949c`。
- 賽事端：`tournament-sync.js` 逐位元組不變；S1～S6、T1～T17（T16 `0b152288040815c0`）釘選於 `tests/tournament-protection.test.mjs`。
- 寫入路徑：收藏端 `saveData(` 17、`runTransaction(` 1、`setDoc`／`updateDoc`／`deleteDoc` 0；賽事端 `runTransaction(` 1、`submitTournamentOperation(` 11、`setDoc`／`updateDoc`／`deleteDoc`／`onSnapshot` 0。
- 回歸基準：Node 23 檔 499/499；Phase 7-2 整合回歸 505/505；Emulator M01～M16、H2 E01～E16；validate、build、`git diff --check`。
- Rules、Schema、官方型錄、競賽統計、使用者 UID 隔離與舊 RTDB 保留資料不在日常維護範圍內。

## 待處理事項

| 編號 | 事項 | 影響 | 需要 |
|---|---|---|---|
| M-1（P2-3） | Firestore Rules 不驗證 `appData/main` 內容（`ownerUid`／`ownerEmail`、欄位格式）；使用者可在自己的文件寫入任意內容或刪除自己的文件 | 只影響本人資料與管理員清單顯示；無法跨帳號 | Rules 變更與部署授權 |
| M-2（P3-6） | 賽事頁首次建立文件時不寫 `ownerUid`／`ownerEmail`，管理員清單顯示「-」，直到主頁存檔 | 管理員顯示 | 涉及 `tournament-sync.js`（受保護） |
| M-3 | CRLF／LF：重新儲存時 CRLF 轉為 LF（D-023） | 換行字元形式 | 評估是否需要保留 CRLF |
| M-4 | 一筆已損壞的正式型號（「UX-21 -01」格式）不會自動修復 | 該筆顯示 | 正式資料修復授權 |
| M-5（F-06） | 型錄升級（D-015）強制寫整個 `beybladeTable`，與另一裝置同時修改該表時衝突 | 少見衝突提示 | D-018 核心變更 |
| M-6 | 競賽統計匯入器固定預期值（分類數、出場總數、名稱、SHA-256）；來源變動時拒絕匯入（fail-closed） | 每次更新需人工調整常數 | 匯入器設計變更 |
| M-7 | F-05／F-08 原始定義無法確認 | 文件 | 使用者確認或撤除 |
| M-8 | 修改對局未改動任何欄位仍寫入一次（既有行為，已接受） | 多一次相同內容寫入 | T16 後段或 D-017 變更 |
| M-9 | 管理員 UID 常數重複於 Rules 與 7 個以上檔案 | 變更時需同步修改 | 重構授權 |

## 使用者實機驗收（2026-11-25，v1.18.1：9/9 PASS）
由使用者本人親自操作並回報，結果見 `design/phase7/14-final-acceptance-report.md` §10（清單原為 §6）。

1. 電腦正式 Google 登入。
2. 原有收藏及配置資料正常。
3. iPhone Safari 登入與底部導覽。
4. 手機詳細資訊 Sheet 及組裝器。
5. 手機賽事比分板及回合記錄。
6. iOS PWA 顯示 v1.18.1。
7. 配置新增、修改、拆解及刪除。
8. 賽事新增、記錄回合、修改及刪除。
9. 另一台裝置重新整理後資料一致。
