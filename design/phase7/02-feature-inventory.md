# 02｜現有功能盤點與保存對照

盤點基準：`main` = `2e3890f`（正式網站 `2c8e4a8`，兩者只差交接文件）。每項功能都由程式確認，標註 `檔案:行號`。「新位置」對應 [03-information-architecture.md](03-information-architecture.md) 的推薦架構（方向 A，見 [04-design-directions.md](04-design-directions.md)）。

保存方式代號：

- **原樣**：程式邏輯與資料流不變，只換位置或外觀。
- **換殼**：同一個函式／資料流，換新的 UI 元件呼叫。
- **強化**：保留原行為，再加不改資料格式的輔助（提示、搜尋、檢查）。

## 共用資料與安全機制（全部原樣保留）

| 項目 | 現況 | 保存方式 |
|---|---|---|
| 資料文件 | `users/{uid}/appData/main`：`beybladeTable`、`partTable`、`configTable`、`historyTable`、`tournamentRecords`、`ownerUid`、`ownerEmail`、`updatedAt`（`script.js:129`、`tournament.js:99`） | 原樣；欄位、型別、`cells` 結構不變 |
| D-018 收藏交易 | `collection-sync.js` 逐表交易、衝突、結果不明確認；`script.js` 的 D-018 區段 | 原樣；新 UI 只呼叫既有 `saveData()` |
| D-017 賽事交易 | `tournament-sync.js` 單場賽事衝突、`maxAttempts: 1` | 原樣 |
| D-015 手動收藏保護 | `isExplicitStockAutoFilled` `script.js:2116`、`upgradeStoredStockItem` `3510` | 原樣 |
| D-016 快照保護 | `scripts/import-competition-statistics.mjs` | 原樣（不屬於網站 UI） |
| F-04 草稿隔離 | `handleAuthStateChange`、`isDraftOwner` `script.js:2139` | 原樣；提示改放到新的「同步中心」 |
| 寫入閘門 | `data-write-action` 停用（`script.js:134-149`、`tournament.js:140-154`）、`requireLogin()` | 原樣；新元件一律標 `data-write-action` |
| Session 防護 | `data-session-guard.js` | 原樣 |
| localStorage | 只有 `beybladeSiteTheme`、`beybladeDesktopNavCollapsed`、退役快取標記 | 原樣；新 UI 偏好（例如清單／卡片檢視）也只能存 UI 偏好 |

## 主頁 `index.html` + `script.js`

| 現有功能 | 進入點 | 新位置 | 保存方式 |
|---|---|---|---|
| Google 登入／登出（有未儲存時確認） | `loginWithGoogle` `4130`、`logoutGoogle` `4139` | 頂列帳號選單 | 換殼 |
| 重新載入雲端資料 | `#retryDataLoadBtn` → `loadCloudDataForCurrentTarget` `2519` | 同步中心 | 換殼 |
| 同步狀態、收藏儲存版本列 | `#syncStatus`、`#collectionClientVersion` | 頂列同步指示燈＋同步中心（版本列必須保留，部署程序依賴它） | 原樣（文字不變） |
| 立即重試／載入雲端／以我的版本覆蓋 | `retryCollectionSave` `2046`、`resolveCollectionConflictWithCloud` `2055`、`...WithLocal` `2076` | 同步中心（衝突時以頂部橫幅提示） | 換殼，確認文字不變 |
| F-04 未儲存資料提示／下載／捨棄 | `#collectionDraftNotice`、`downloadOrphanedCollectionDraft` `2217`、`dismissOrphanedCollectionDraft` `2232` | 同步中心 | 換殼，UID 限制不變 |
| 離開頁面提示 | `beforeunload` `4301` | 同 | 原樣 |
| 新雲端資料取消編輯 | `applyCollectionRemoteWhenClean` `1732` | 同 | 原樣 |
| 收藏：輸入型號自動帶入、即時預覽、Enter 送出 | `#model`、`renderStockAutoPreview` `3341`、`addRow` `2672` | 收藏 →「新增收藏」面板 | 換殼 |
| 型號解析（全形、空白、破折號、`UX01`） | `parseStockProductCode` `3171` | 同 | 原樣 |
| 共用型號候選選擇（BX-00／CX-00）、全部加入 | `#stockChoiceDialog`、`openStockProductChoice` `3575` | 同（改為底部抽屜／對話框） | 換殼 |
| 套組一次加入（UX-21 等）、共用 `stockSetInstanceId` | `addAutoFilledStockProducts` `3549` | 同 | 原樣 |
| 手動輸入（BX/UX 三件、CX 分件、固鎖規則驗證） | `addManualStockRow` `2545`、`validateRatchetRules` `417` | 同（手動模式改為依結構顯示欄位） | 強化 |
| 刪除收藏（套組一起刪除確認） | `deleteRow` `1025` | 收藏卡片 ⋯ 選單 | 換殼；文案「雙陀螺套組」建議改為「套組」 |
| 收藏自動排序 UX→BX→CX | `sortTable` `492` | 預設排序；另加使用者可選排序 | 強化 |
| 收藏卡片零件順序（BX/UX、CX 分組） | `updateResponsiveTableCells` `2967` | 新收藏卡片 | 換殼，順序依 D-004 |
| D-015 型錄升級 | `upgradeStoredStockItem` `3510` | 背景行為 | 原樣 |
| 零件庫存：新增（8 種類別、數量驗證） | `addPart` `2758` | 零件 →「新增零件」 | 換殼 |
| 零件庫存：行內修改、取消（確認） | `editRow` `1089`、`saveEditRow` `1174`、`cancelEditRow` `1245` | 零件詳細面板 | 換殼 |
| 零件庫存：刪除（確認） | `deleteRow` `1064` | 零件 ⋯ 選單 | 強化：加「此零件被 N 個配置使用」提示 |
| 零件搜尋、類別篩選（全部／上蓋／固鎖／軸心／CX 分件） | `applyInventoryFilters` `2945` | 零件總覽 | 強化（D-005 分類保留） |
| 庫存摘要（種類、持有、使用中、可用） | `updateUiSummaries` `2868` | 零件總覽頂部＋首頁 | 原樣計算 |
| 配置：建立／修改（Quick Editor、BX/UX 與 CX 模式） | `openConfigQuickEditor` `3740`、`setConfigEditorMode` `3662`、`addConfig` `3853` | 配置 → 組裝器 | 換殼（寫入同一 9 欄 `cells`） |
| 側欄／網址 `#configQuickEditor` 開啟編輯器 | `site-menu.js:287`、`index.html` hash | 全域「建立配置」按鈕；舊 hash 保留導向 | 原樣相容 |
| 零件選項顯示剩餘數量 | `refreshSelectors` `3790` | 組裝器零件選擇器 | 強化 |
| 無固鎖選項（UX-19／UX-20、Tr 軸） | `updateNoRatchetConfigOption` `3633` | 組裝器依結構隱藏固鎖槽 | 強化（規則見 01） |
| 庫存檢查「已經沒有庫存」 | `checkStock` `3836` | 組裝器即時提示＋送出時檢查 | 強化 |
| 與歷史測試重複的提醒 | `addConfig` `3954-3983` | 組裝器即時提示 | 強化 |
| 配置 ⋯ 選單（修改、刪除） | `toggleConfigActionMenu` `688` | 配置卡片 | 換殼 |
| 刪除配置並記錄原因（5 種原因＋備註；「打錯，不記錄」不寫歷史） | `askDeleteReasonForConfig` `866` | 配置「拆解」對話框 | 換殼，原因選項不變 |
| 歷史測試：還原為配置、刪除 | `restoreHistoryRow` `925`、`deleteHistoryRow` `1012` | 配置 →「拆解紀錄」分頁 | 換殼 |
| 主題切換（深色／米色） | `site-menu.js:56-101` | 帳號選單／設定 | 原樣（D-001） |
| 側欄收合 | `toggleDesktopNav` | 桌面導覽 | 原樣 |

## 賽事 `tournament.html` + `tournament.js`

| 現有功能 | 進入點 | 新位置 | 保存方式 |
|---|---|---|---|
| 登入／登出、重新讀取、賽事儲存版本列 | `retryTournamentDataLoad` `1050`、版本列 `74` | 頂列＋同步中心 | 原樣文字 |
| 新增比賽（日期、名稱、地點、人數≥2、備註；重送沿用 ID） | `addTournament` `1058` | 賽事 →「新增比賽」 | 換殼 |
| 展開／收合、完成（確認並顯示名次）、修改（衝突對照）、刪除 | `toggleTournamentDetail` `1130`、`finishTournament` `1140`、`openTournamentEditDialog` `1185`、`deleteTournament` `1415` | 賽事詳細頁 | 換殼 |
| 輪空／對手未到直接晉級 | `addDirectAdvance` `1489` | 賽事詳細 →「下一場」 | 換殼 |
| 新增對局（對手、3 顆陀螺：從配置選或自填） | `addMatch` `1436` | 對局表單（步驟式） | 換殼 |
| 修改對局（目前用連續 `prompt()`、草稿與衝突確認） | `editMatch` `1523` | 對局編輯面板 | 換殼（流程改善最大） |
| 新增回合（陀螺、勝負、X/O/B/S 得分、備註）、刪除回合 | `addRound` `1643`、`deleteRound` `1697` | 對局內「記錄一回合」 | 換殼 |
| 刪除對局 | `deleteMatch` `1616` | 對局 ⋯ | 換殼 |
| 已完成比賽鎖定 | 多處 `isFinished` 檢查 | 同 | 原樣 |
| 計分、勝負判定（4 分）、單淘汰名次 | `calculateMatchScore` `253`、`getMatchOutcome` `270`、`calculateTournamentStanding` `284` | 賽事卡片與詳細頁 | 原樣計算 |
| 表單草稿保留、單一交易、離線拒絕、結果不明確認 | `captureTournamentFormDrafts` `943` 等 | 同 | 原樣 |

## 競賽統計 `competition-stats.*`（唯讀）

| 現有功能 | 新位置 | 保存方式 |
|---|---|---|
| 四類排行（上蓋／固鎖／軸心／輔助戰刃）、Top 10 展開 | 競賽統計 | 原樣內容；只調整版面 |
| 上蓋搜尋（中／英／日／ID）、鍵盤操作 | 同＋全域搜尋可跳轉 | 強化 |
| `#/blades/<slug>` 詳細頁（Usage、1st Rate、Top Cuts、配置／固鎖／軸心表） | 同 | 原樣 |
| 來源資訊、警語、指標定義、跳至內容連結 | 同 | 原樣（D-008：不加 Tier、推薦、勝率推估；不混算兩來源） |

## 管理員與說明頁

| 現有功能 | 新位置 | 保存方式 |
|---|---|---|
| `admin.html`：使用者清單、摘要、進入唯讀檢視 | 「管理」（僅管理員可見） | 原樣 |
| `user-view.html`：唯讀檢視使用者五類資料 | 同 | 原樣；建議賽事顯示改用計算後名次（目前顯示舊 `rank`） |
| 說明頁 6 頁、更新紀錄展開 | 「更多 → 說明」 | 原樣內容 |
| PWA `manifest.json`（`start_url ./home.html`） | 同 | 原樣；若首頁改為工作台需另行決定 |

## 盤點時發現、與重新設計有關的現況

1. **無固鎖規則不完整**：`NO_RATCHET_MODELS` 只有 UX-19、UX-20（`script.js:351`），軸心只認 `TR`（`isNoRatchetAxis`）。型錄中 UX-21-01 惡魔冥界同樣是 `integrated_blade_ratchet`，CX-11-01 帝王威能的 `Op` 軸也是 `integrated_ratchet_bit`，但配置時仍被要求填固鎖。官方資料已確認兩者都沒有獨立固鎖（見 [01](01-beyblade-x-assembly-rules.md) 第 3 節），所以現行程式會逼使用者存出不存在的組合。另外程式也沒有阻擋「UX 擴展戰刃＋Tr／Op」與「輔助戰刃 G × 主戰刃エクリプス」這兩個官方禁止組合。
2. **簡易固鎖規則**：UX-16 時鐘幻象只能使用「簡易固鎖」，程式以「高度個位數為 5」判斷（`isSimpleRatchet` `script.js:405`）。官方規則確實存在（`/help/ratchet/`），但官方定義是「接合部為 O 型」，不是數字；目前官方列出的例子剛好都符合尾數 5，建議改為白名單（見 01 第 3 節 D）。
3. **型錄已有結構欄位但未用於驗證**：每筆收藏保存 `stockAssemblySystem`（STANDARD／CX_3P／CX_4P／CX_INTEGRATED／UX_EXPAND）與 `stockRatchetMode`，目前只用於庫存計算排除 CX 上蓋。組裝器可直接利用，不需要改 Schema。
4. **刪除時沒有檢查使用中零件**：刪除庫存零件或收藏，不會提醒有配置正在使用。
5. **收藏沒有搜尋、篩選、使用者排序**；配置也沒有。
6. **賽事的對局修改使用連續 `prompt()`**，手機上體驗最差。
7. **賽事陀螺選項是配置的文字快照**（`configText`），不是配置 ID；配置改名或刪除後不會同步。
8. **不可達的舊程式**：收藏行內修改、配置行內修改、`script.js` 內的管理員切換檢視、`index.html` 內停用的舊無固鎖腳本。重新設計時不應以為這些是可用功能。
9. **收藏沒有數量欄位**：同款多顆是多列。
