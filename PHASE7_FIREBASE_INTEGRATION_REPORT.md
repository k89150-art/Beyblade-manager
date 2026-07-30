# Phase 7 Firebase Integration Report

日期：2026-07-30

## 1. Firebase 現況

- 專案原本已使用 Firebase Web SDK 11.2.0、Google Authentication 與
  Cloud Firestore，Firebase Project ID 為 `k89150-web-login`。
- 既有收藏、配置與賽事資料仍使用原本的
  `users/{uid}/appData/main`，本階段沒有修改其資料格式或 Repository。
- 專案沒有使用 Realtime Database 或 Storage。
- 已有 `firestore.rules`、`firebase.json` 與手動部署 Rules 的 GitHub
  Actions workflow；本階段沿用同一個 Firebase 專案與登入政策。
- 前端沒有加入 Firebase Admin SDK、Service Account 或私鑰。

## 2. Repository Adapter

新增的 Firebase 層位於 `src/meta/firebase/`：

- `FirebaseEvidenceRepository`
  - create-only 寫入，Evidence ID 具冪等性。
  - 單筆讀取、全部列出、依 `entityId` 篩選及日期排序。
  - 寫入前與讀取後都執行 Runtime Validation。
  - 重複 ID、權限不足、離線、設定缺失及非法資料使用明確錯誤代碼。
- `FirebaseMetaProfileRepository`
  - 讀取 Entity 目前的 MetaProfile。
  - 以 batch upsert 保存 MetaProfile 與 Analysis Results。
  - 相同 Entity、Analysis Date、Model ID、Model Version 更新同一文件。
  - 不同日期或模型版本可並存。
- `FormalCatalogEntityReader`
  - 直接讀取正式 `beyblade_x_database_v1_zhTW.json` 建立的既有 Entity
    Catalog，不建立第二份 Entity Master。
- 原有 In-memory 與 LocalStorage Adapter 完整保留。
- Service、Pipeline 與 ViewModel 只依賴 Repository Interface，不直接匯入
  Firebase SDK。

## 3. Collection／Document 結構

```text
metaEvidence/{evidenceId}
metaProfiles/{canonicalEntityId}
metaProfiles/{canonicalEntityId}/analysisResults/
  {entityId__analysisDate__modelId__modelVersion}
```

每份 Firestore 文件使用明確 envelope，至少包含：

- `schemaVersion`
- `entityId`
- `lifecycleStatus`
- `dataMode`
- 對應的 ID、日期與模型版本欄位
- `payload`

Analysis Result 額外保存 `traceReferences`。Entity 主鍵一律使用 Canonical
Entity ID，不使用中文名稱，也不依陣列順序推測資料。

## 4. Environment Strategy

- `development`
  - 只允許 localhost 加上明確的 `?mode=development`。
  - 使用隔離的 Seed 與專用 LocalStorage。
  - 不連線正式 Firebase，也不保存 MetaProfile 至 Firebase。
- `preview`
  - 使用 Firebase 測試／預覽設定。
  - 不載入 Seed，不會退回 LocalStorage 假裝正式成功。
- `production`
  - 使用正式 Firebase 公開 Web Config。
  - 不載入 Seed。
  - 缺少 Config 時進入明確的 `missing-config` 狀態。

`firebase-meta-config.js` 是安全的開發預設值，不含有效 API Key。部署時由
GitHub Actions 使用 Repository Variables 產生 artifact 內的正式設定。

## 5. Authentication／Authorization

- 沿用既有 Google Authentication，不建立第二套登入系統。
- 未登入：
  - 依目前 Firestore 政策不可讀 Meta Firebase 資料。
- 一般已登入使用者：
  - 可查看 Evidence 與 Meta 分析。
  - 可執行本次預覽計算，但不能新增 Evidence 或保存分析。
- 管理員 UID：
  - 可新增 Evidence。
  - 可保存 MetaProfile 與 Analysis Results。
- UI 只有在 Repository 寫入成功後才顯示「已保存」。
- Pipeline 成功但保存失敗時保留本次結果，狀態明確顯示為
  `save-failed`，不會冒充已保存。

## 6. Security Rules

`firestore.rules` 採最小增量修改：

- 保留既有 `users/{uid}/appData/main` 讀寫規則與管理員唯讀規則。
- `metaEvidence`
  - 已登入可讀。
  - 只有管理員可 create。
  - 禁止 update 與 delete。
- `metaProfiles` 與 `analysisResults`
  - 已登入可讀。
  - 只有管理員可 create／update。
  - update 不得改寫 Entity、日期、Model ID 或 Model Version。
  - 禁止 delete。
- 驗證 Canonical Entity ID、必要欄位、資料型別、production data mode、
  lifecycle status 與 Seed 標記。
- 沒有 `allow read, write: if true`。

## 7. Timestamp Conversion

- Frozen Domain 內仍只使用 ISO Date／DateTime 字串。
- Firebase Adapter 寫入前先將 ISO DateTime 轉成明確 wire marker。
- Browser Firebase bridge 再將 marker 轉為 Firestore `Timestamp`。
- 讀取時做反向轉換，完成後才交給 Runtime Validation。
- `Date`、`Map`、`Set`、Class Instance、循環參考、`NaN` 與 `Infinity`
  都會被拒絕，不會進入 Frozen Domain。

## 8. Migration Strategy

新增 `EvidenceMigrationService.dryRun()`，目前只提供安全的預覽能力：

- 一次驗證全部輸入。
- 驗證 Runtime Contract 與 Entity Mapping。
- 檢查輸入內重複 ID 與 Repository 既有 ID。
- 拒絕開發 Seed。
- 回傳成功、失敗數量與每筆失敗原因。
- 不會部分寫入、不會自動匯入，也不會修改正式 Firebase。

本階段沒有開放正式 Migration UI，符合「不得執行正式資料 Migration」限制。

## 9. 正式頁面行為

`/meta.html` 已支援：

- Firebase loading、ready、missing config、permission denied、offline、
  invalid data 與 repository error。
- Retry、Google 登入／登出與目前資料模式。
- 未授權者唯讀提示。
- 管理員 Evidence 新增入口。
- 從目前 Repository 重新讀取 Evidence。
- 執行既有完整 Pipeline。
- 已保存／僅本次預覽／保存失敗的明確狀態。
- Entity 或 Analysis Date 改變時清除舊結果。
- 登入 popup 失敗時顯示安全訊息，不顯示 raw stack trace。

`/evidence-mvp.html` 保留為 development-only 頁面，正式 Navigation 不顯示。

## 10. 離線與錯誤處理

- Firebase `unavailable` 轉為可重試的 `offline` 錯誤。
- 寫入失敗不顯示成功。
- Evidence create 使用 create-only transaction，重試相同 ID 不會產生重複資料。
- Analysis Result 使用 deterministic document ID 明確 upsert。
- 不合法的 Firebase 舊資料會被拒絕，不會自動修補。
- Config 缺失時不會退回正式 LocalStorage。
- Firebase bridge 沒有使用 Snapshot Listener，因此沒有離頁解除監聽問題。

## 11. 新增與修改檔案

新增：

- `firebase-meta-config.js`
- `firebase-meta-bridge.js`
- `scripts/generate-meta-firebase-config.mjs`
- `src/meta/firebase/types.ts`
- `src/meta/firebase/errors.ts`
- `src/meta/firebase/serialization.ts`
- `src/meta/firebase/repositories.ts`
- `src/meta/firebase/migration.ts`
- `src/meta/firebase/bootstrap.ts`
- `src/meta/firebase/index.ts`
- `tests/meta-firebase/firebase-integration.test.ts`
- `PHASE7_FIREBASE_INTEGRATION_REPORT.md`

修改：

- `.github/workflows/deploy-pages.yml`
- `.gitignore`
- `firebase.json`
- `firestore.rules`
- `meta.html`
- `meta.css`
- `src/meta/integration/environment.ts`
- `src/meta/integration/meta-page.ts`
- `src/meta/integration/types.ts`
- `src/meta/integration/view-model.ts`
- `tests/meta-integration/production-integration.test.ts`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.test.json`

沒有修改 Frozen Domain 或任何分析 Engine 公式。

## 12. 測試及 Emulator 結果

通過：

- `npm run typecheck`
- `npm run lint`
- `npm test`：116／116 通過
- `npm run build`
- `node --check firebase-meta-bridge.js`
- `node --check scripts/generate-meta-firebase-config.mjs`
- Production config generator 的必要變數與輸出語法測試
- Firestore Rules／Pages workflow 的安全邊界靜態測試

涵蓋情境：

- Evidence create／read／list／filter／sort
- 寫入前與讀取後 Runtime Validation
- Timestamp 雙向轉換
- 非法 Firebase payload
- 重複 Evidence ID
- Entity 不存在
- MetaProfile get／upsert
- 同版 upsert 與不同日期／版本並存
- permission denied、offline、missing config
- Seed 隔離
- 未授權只讀與管理員保存
- Pipeline 成功但保存失敗不顯示已保存
- Migration dry run 全量錯誤

官方 Firebase Emulator 測試未執行。原因是目前機器沒有 Firebase CLI 與
Java Runtime；為避免污染正式專案，沒有用 production Firebase 代替 Emulator。
目前使用同一份 Repository Contract 的 Fake Firestore Port 執行 Adapter 測試。
正式上線前仍需在具備 Java 與 Firebase CLI 的環境執行 Rules／Emulator 測試。

## 13. GitHub Pages 部署設定

Pages workflow 現在會：

1. `npm ci`
2. `npm run build`
3. 建立 `_site` artifact
4. 從 GitHub Repository Variables 產生公開 Firebase Config
5. 上傳 Pages artifact

Production artifact 不包含 Seed、`src/`、tests、scripts、node_modules 或
Service Account。`dist/` 只存在於部署 artifact，不提交 Git。沒有新增
Firebase Hosting deploy，也不會自動部署到其他 Firebase Project。

## 14. 尚需使用者提供的設定

GitHub Repository 的 Actions Variables 需要設定：

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`（專案有使用時）
- `FIREBASE_MESSAGING_SENDER_ID`（專案有使用時）
- `FIREBASE_APP_ID`
- `META_ADMIN_UIDS`

設定值應對應既有 `k89150-web-login` 專案。Web Config 是公開設定，不可放入
Service Account JSON、Admin SDK Credential 或私鑰。

Rules 仍需使用既有手動 workflow 或 Firebase Console 部署。未部署 Rules
前，正式 Meta collection 會依目前線上 Rules 拒絕或無法正確授權。

## 15. Technical Debt

- 官方 Emulator／Rules 整合測試需在安裝 Java 與 Firebase CLI 後補跑。
- GitHub Actions workflow 目前由測試檢查必要步驟與敏感字樣；本機沒有
  `actionlint`，因此尚未執行 actionlint。
- Firestore Rules 目前採管理員 UID 清單；若未來管理員增加，建議改由
  Custom Claims 管理，但本階段不改動既有登入政策。
- Migration 目前只有 Service 與 Dry Run，尚未建立 Admin-only 確認 UI。

## 16. 下一步上線建議

1. 在 GitHub Repository Variables 設定公開 Firebase Web Config 與管理員 UID。
2. 安裝 Java 與 Firebase CLI，在 Emulator 執行 Repository 與 Rules 測試。
3. 部署更新後的 Firestore Rules。
4. 先以 preview Firebase project 驗證管理員／一般使用者／未登入三種權限。
5. 確認 preview 無誤後再讓 Pages production 指向既有正式 project。
6. 使用 Admin-only dry run 檢查待匯入 Evidence，仍不要自動匯入 Seed。
