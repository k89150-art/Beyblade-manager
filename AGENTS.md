# AGENTS.md

本文件是「戰鬥陀螺管理器」的主要開發規範。Codex、Claude、其他 AI 與人工開發者在讀寫本專案前都必須遵守。若其他說明與本文件衝突，以使用者最新明確指示為最高優先，其次為本文件、實際程式碼與測試。

## 1. 專案定位

- 本專案是已正式上線的 Beyblade X 管理網站，不是新專案或原型。
- 功能包含原裝收藏、額外零件庫存、自訂配置、歷史測試、客觀競賽統計、賽事紀錄、管理員檢視與說明頁面。
- 主要技術為原生 HTML、CSS、JavaScript ES Modules；沒有前端框架、ORM、路由框架或 npm 套件管理。
- Firebase Web SDK 由 CDN 載入。正式登入使用 Google Authentication，使用者資料存於 Cloud Firestore。
- 架構細節以 [`docs/PROJECT_ARCHITECTURE.md`](docs/PROJECT_ARCHITECTURE.md) 為準；已確認決策以 [`docs/PROJECT_DECISIONS.md`](docs/PROJECT_DECISIONS.md) 為準。

## 2. 主要檔案與職責

- `index.html`、`script.js`、`style.css`：收藏、額外零件庫存、配置、歷史測試及 Quick Editor。
- `site-menu.js`、`site-menu.css`：全站側欄、手機底部導覽、說明頁捷徑、深色／米色主題與 UI 偏好。
- `tournament.html`、`tournament.js`：賽事、對戰輪次、輪空／不戰晉級與參賽結果。
- `competition-stats.*`：只呈現可驗證的客觀競賽統計。
- `admin.html`、`admin.js`、`user-view.html`、`user-view.js`：管理員唯讀檢視。
- `home.html`、`guide.html`、`changelog.html`、`privacy.html`、`about.html`、`contact.html`：說明頁面。
- `beyblade_x_database_v1_zhTW.json`：正式零件與競賽統計主資料。
- `stock_products_AUTOFILL_SAFE_2026-07-29-v3.json`：收藏自動帶入的原裝產品資料。
- `beyblade_x_model_chinese_english_2026-08-29.json`、`stock-catalog-names.js`：名稱對照與型錄顯示支援。
- `firestore.rules`、`firebase.json`：正式 Firestore 權限與 Firebase CLI 設定。
- `scripts/`、`tests/`：靜態驗證、建置、資料維護與自動測試。

不得因檔案較大就擅自拆分或重構。修改範圍必須由任務需要決定。

## 3. 開始任務前

1. 閱讀本文件。
2. Claude 另閱讀 `CLAUDE.md`。
3. 閱讀 `docs/AI_HANDOFF.md` 最新紀錄。
4. 依任務需要閱讀 `docs/PROJECT_ARCHITECTURE.md` 與 `docs/PROJECT_DECISIONS.md`。
5. 執行 `git status --short --branch`，確認工作樹狀態。
6. 執行 `git worktree list`，確認沒有未知的平行工作樹或重複檢出。
7. 檢查 OneDrive 同步衝突副本與異常檔名；發現時先保留並回報，不自動覆蓋。
8. 明確界定本次允許修改的頁面、功能與檔案。
9. 確認沒有其他 AI 或使用者正在同一工作樹寫入。

`docs/AI_HANDOFF.md` 中的「目前執行者」只供協調，不是可靠的檔案鎖。若 Git 狀態、檔案時間或使用者訊息顯示另一位執行者正在修改同一工作樹，必須停止寫入並要求協調。

若未來需要真正平行開發，必須使用獨立 Git worktree 或分支，完成驗證後再整合；不得在同一份工作樹同時編輯。

## 4. 執行任務時

- 只修改使用者指定的功能，不以「順手整理」為由擴大範圍。
- 先閱讀相關 HTML、CSS、JavaScript、資料與測試，再決定修改方式。
- 保留已確認的 UI、資料契約、命名與操作流程；不得因個人偏好重做設計。
- 不確定是否涉及架構決策、資料相容性或正式權限時，先提出影響與最小方案並詢問。
- 發現其他 AI 或使用者的未提交修改時，不得覆蓋、還原、格式化掉或清除。
- 未經使用者明確授權，禁止執行 `git reset --hard`、任何 `git clean`、強制 checkout（包含用 `git checkout --` 覆蓋檔案）、commit、push、force push、merge、tag、deploy、正式資料庫 migration，或修改 GitHub repository 設定。
- 不得刪除重要資料、修改正式 Firebase 資料或 Security Rules，也不得將 API Key 以外的 Token、私鑰、Service Account 或個人資料寫入文件、日誌與 Git。

## 5. UI / UX 規範

- 維持現有深色與米色主題；兩個主題的結構、字級與互動應一致，只有色彩 token 不同。
- 手機優先，同時維持桌面合理的資訊密度；不得用固定單一螢幕尺寸硬湊畫面。
- 沿用既有 Design Tokens、元件與 responsive 規則，避免大量 inline style、重複樣式與 `!important`。
- 收藏、庫存、配置、競賽統計、賽事與說明頁具有不同責任；修改共用 CSS 前必須檢查是否造成其他頁面 regression。
- 手機底部五項主導覽、側欄資訊架構與主題切換是既有操作契約，不得擅自改變。
- 保持可讀性、觸控範圍、無水平 overflow、合理 focus/hover/disabled 狀態。
- 競賽統計與賽事若不在任務範圍內，不得因全域樣式調整而改變外觀或行為。

## 6. 資料結構與相容性

- 使用者正式資料位於 `users/{uid}/appData/main`，目前包含收藏、額外零件、配置、歷史測試及賽事紀錄等欄位。
- `script.js` 管理 `beybladeTable`、`partTable`、`configTable`、`historyTable`；`tournament.js` 管理 `tournamentRecords`。跨頁寫入必須保留其他模組擁有的欄位，使用 merge，不可用不完整物件覆蓋整份文件。
- 既有表格資料使用相容性欄位與 `cells` 結構；不得任意重新命名欄位、改變型別或清除舊資料。
- UI 移除欄位不等於可刪除舊資料欄位。必須確保舊收藏、舊配置、舊賽事仍可讀取、修改與刪除。
- 不得清除或重建使用者資料來解決顯示或驗證問題。
- 目前 localStorage 僅保存主題、側欄等 UI 偏好；正式業務資料以登入後的 Firestore 為準。不得憑印象新增第二套本機資料來源。
- 收藏原裝配置資料只用於收藏自動帶入，不得未經明確需求混入競賽統計或主觀評分。

## 7. Firebase 與安全規範

- 正式 Firebase project：`k89150-web-login`。
- 正式資料庫：Cloud Firestore。
- 使用者資料路徑：`users/{uid}/appData/main`。
- Google Authentication 的 Firebase UID 是使用者資料隔離依據。
- 現行 Rules 允許使用者讀寫自己的文件，並允許指定管理員唯讀檢視。任何 Rules 修改都必須先提出計畫、影響與測試方式，取得使用者明確同意後才可執行。
- 不得擅自部署 `firestore.rules`、修改管理員 UID、放寬讀寫權限、搬移資料或執行正式 migration。
- 舊 project `beyblade-wangbaboa` 的 RTDB `beyblade-wangbaboa-default-rtdb` 已全面封鎖 `.read: false`、`.write: false`。不得重新開放，也不得擅自刪除或搬移其中保留資料。
- Firebase Web API key 是公開前端設定，不等同資料庫授權。真正敏感的 Service Account、私鑰、Token、database secret 與 `.env` 實值不得寫入程式、文件、日誌或 Git。
- 不得使用正式資料庫作為一般自動測試目標。

## 8. 競賽統計內容界線

- 競賽統計只展示來源可追溯的客觀資料。
- 不重新加入 Tier、主觀配置推薦、推估勝率或已退役分析 UI。
- `retire-analysis-cache.js` 僅清理退役分析介面的舊網址／快取標記，不得擴大成清除使用者資料。
- 歷史或參考 JSON 中仍可能存在研究欄位，不代表可重新接回正式 UI。

## 8.1 資料更新界線

- 官方原裝配置與競賽統計是兩條獨立更新流程：前者檢查 TAKARA TOMY 官方型號、名稱與原裝配置；後者匯入 MetaBeys 與 Beywatch 客觀統計。
- 現有週六／週日排程屬 repository 之外的運作設定，不是 `.github/workflows` 內可重建的一般 CI。未經明確授權，不得執行、新增、重建或修改這些排程。
- 資料更新必須保留日期化快照、來源時間、canonical 主資料、已確認繁中名稱與現有 JSON schema；軸心縮寫維持英文。

## 9. 測試與驗收

依修改範圍執行針對性測試，完成實質修改時至少執行：

```powershell
node --test tests/catalog-name-merge.test.mjs tests/competition-statistics.test.mjs tests/help-pages.test.mjs tests/manager-ui-refresh.test.mjs tests/retirement.test.mjs
node --experimental-vm-modules scripts/validate-site.mjs
node scripts/build-site.mjs
git diff --check
```

- 修改 JavaScript 時，另對受影響檔案執行 `node --check <file>`。
- UI 修改必須以實際瀏覽器驗證要求尺寸、深色／米色、無水平 overflow 與 Console Error = 0。
- Firebase 修改必須在 Emulator 或安全測試環境驗證，不得直接以 production 寫入測試。
- 測試失敗時先確認測試是否已過時；不得為通過測試而降低資料驗證或破壞已確認 UI。
- `.site-build/`、`artifacts/`、`exports/`、測試截圖與暫存檔不得提交。

## 10. Git 與部署限制

- 未經使用者明確同意，不得 commit、push、merge、tag、deploy 或修改正式 Firebase。
- commit 前檢查 `git status`、`git diff`、`git diff --check`，只納入本次預期檔案。
- 不得提交敏感資訊、建置產物、測試截圖、暫存檔或個人 IDE 設定。
- GitHub Pages 目前由 `main` 分支根目錄提供正式網站；不得擅自改部署來源或 workflow。
- 任何正式部署後都必須實際開啟 production site 驗證，不能只以命令成功判定完成。

## 11. 完成任務後

1. 執行相關測試。
2. 執行 production build。
3. 執行 `git diff --check`。
4. 檢查修改檔案與未追蹤檔案。
5. 更新 `docs/AI_HANDOFF.md`，保持精簡。
6. 若架構或正式資料流改變，更新 `docs/PROJECT_ARCHITECTURE.md`。
7. 若使用者確認新的長期決策，更新 `docs/PROJECT_DECISIONS.md`。
8. 回報測試、尚未完成事項、已知問題，以及 commit／deploy 狀態。
9. 等待使用者決定是否 commit、push 或 deploy，除非該次任務已明確授權。

## 12. 雙 AI 交接原則

- 同一時間只允許一個 AI 修改目前工作樹；另一個 AI 可唯讀分析。
- 接手者先讀最新 handoff 與 Git diff，不重新做已完成工作，也不假設 handoff 等同程式實況。
- 每次交接記錄任務、修改檔案、測試、未完成事項、已知問題與 Git／部署狀態，不貼聊天逐字稿。
- 若 handoff、Git 狀態與實際檔案不一致，以 Git 與實際檔案為準，停止寫入並先釐清。
