# Phase 8 Release Readiness Report

日期：2026-07-30

## 1. 工具環境

- Node.js：v24.18.0
- npm：v11.16.0
- Java：Microsoft OpenJDK 21.0.12 可攜版
- Firebase CLI：專案本地 firebase-tools 15.25.0
- GitHub CLI：2.95.0
- actionlint：1.7.12

系統原本沒有全域 Java 與 Firebase CLI。本階段遵守限制，只在暫存目錄使用官方 Microsoft OpenJDK，並使用專案本地 Firebase CLI，未修改 PATH、未安裝全域套件、未連接正式 Firebase。

Phase 9 已由專案擁有者確認正式 Firebase Project ID 為 `k89150-web-login`，並新增 `.firebaserc`，將 `default` 明確綁定至該專案。

## 2. Emulator 結果

使用 Demo Project `demo-beyblade-meta` 啟動 Authentication 與 Firestore Emulator。Demo Project 會阻止未模擬服務連到正式資源。

結果：8 / 8 組測試通過。

涵蓋：

- 未登入讀取拒絕、登入讀取允許
- 一般使用者寫入拒絕、Admin Evidence 寫入允許
- 非法 Canonical Entity ID、日期、型別、未知欄位、Seed 與缺欄位拒絕
- Evidence ID 冪等與重複寫入防護
- MetaProfile 僅 Admin 可寫，識別欄位不可篡改
- 非法 modelId、modelVersion、analysisDate 拒絕
- 相同分析版本 upsert，不同版本並存
- Evidence、MetaProfile、Analysis Result 正式資料刪除拒絕

所有測試皆由 `firebase emulators:exec` 執行，未使用正式 Firebase。

## 3. Security Rules 結果

`firestore.rules` 已補強：

- Canonical Entity ID 格式
- ISO Date / DateTime
- modelId 格式
- SemVer modelVersion
- Evidence eventDate
- Analysis Result analysisDate
- 欄位白名單與必要欄位
- Seed 禁止寫入
- create / update / delete 權限

Rules 測試不是字串比對，而是透過 Firestore Emulator 實際 assert allow / deny。既有 `users/{uid}/appData/{documentId}` 使用者資料規則保留。

Phase 9 已在再次通過 Emulator 與 dry-run 後，依使用者明確確認部署 Rules 與 Indexes 至 `k89150-web-login` 的 `(default)` 資料庫。

## 4. Firestore Index

新增 `firestore.indexes.json` 並由 `firebase.json` 引用。

目前 Firebase Repository 的實際查詢只有：

- Evidence：`entityId == value`
- 其餘日期排序在 Runtime Validation 後於客戶端進行
- MetaProfile / Analysis Result 使用明確 Document ID get / set

因此目前不需要 `entityId + eventDate`、`entityId + lifecycleStatus`、`entityId + modelId + modelVersion` 或 `entityId + analysisDate` 複合索引。檔案刻意保持空白，避免部署未使用索引。若日後把排序或多欄篩選移入 Firestore query，需先新增對應索引。

## 5. GitHub Variables

Phase 9 已設定並核對 Pages workflow 實際引用的 GitHub Repository Variables：

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `META_ADMIN_UIDS`

所有 7 個 Variable 均已存在；值未寫入 Repository、Log 或報告。缺少必要 Variable 時，`generate-meta-firebase-config.mjs` 仍會以非零狀態結束，並指出第一個缺少的名稱。

現有 Secret `FIREBASE_SERVICE_ACCOUNT_K89150_WEB_LOGIN` 未注入前端，只供 Firestore Rules workflow 使用。Repository 內沒有 Service Account、私鑰或 `.env` 實值。

## 6. Production Build

建議版本：`2.0.0-rc.1`

Production artifact Dry Run 共 107 個檔案，通過以下掃描：

- 無開發 Seed
- 無 `evidence-mvp` 正式入口
- 無 development environment adapter
- 無 source map
- 無 Service Account / private key 特徵
- 無 Meta LocalStorage fallback
- Production config 不啟用 Emulator

正式模式缺少 Firebase Config 時不會退回 LocalStorage，頁面會顯示「設定缺失」、停用分析，並隱藏新增 Evidence。

`npm audit --omit=dev`：0 vulnerabilities。

完整 dev dependency audit：3 moderate / 16 high，位於 firebase-tools 的 CLI 依賴鏈。npm 提供的完整修正會降至 firebase-tools 14.23.0 並造成 breaking change，因此未使用 `--force`。這不進 Production artifact，但應在 Firebase CLI 上游更新後再評估升級。

## 7. 瀏覽器驗證

最終乾淨 Production Candidate：

- 1440 x 900：無水平溢出
- 768 x 1024：無水平溢出
- 390 x 844：無水平溢出
- 資料模式：正式 Firebase
- Production Navigation：包含 Meta 分析，不包含 Evidence MVP
- Console Error：0

已以 Emulator 驗證：

- Admin 新增 Evidence 成功
- 完整 Pipeline 成功並保存
- 無權限 Evidence 寫入拒絕
- Pipeline 成功但保存失敗顯示僅供本次預覽
- Offline 顯示 Firebase 連線錯誤
- 無 Evidence 顯示資料不足
- Entity 與 Analysis Date 切換清除舊結果
- Missing Config 顯示安全錯誤狀態

Phase 9 已在正式 Firebase Preview 完成真實 Google Popup：

- `k89150@gmail.com` 管理員登入成功。
- 登出後管理功能立即隱藏。
- 重新登入後管理權限恢復。
- 正式 Firebase 已建立一筆 `0-60` RC Evidence，重新整理後仍可讀取。
- 完整分析成功並顯示已保存至 Firebase。
- Entity 與 Analysis Date 切換會清除舊結果。
- Console Error 為 0。

正式非管理員帳號 `lolas8228@gmail.com` 也已驗證：可讀取正式 Evidence，但不顯示 Evidence 新增與管理員功能；分析完成後明確標示僅供本次預覽，未保存至 Firebase。

瀏覽器截圖位於工作區外，不會加入 Git：

- `phase8-browser/desktop.png`
- `phase8-browser/tablet.png`
- `phase8-browser/mobile.png`

## 8. Deployment Dry Run

Pages workflow 現在包含：

1. checkout
2. setup-node
3. npm ci
4. typecheck
5. lint
6. test
7. build
8. 準備 `_site`
9. 產生公開 Firebase Config
10. Production artifact 安全掃描
11. configure-pages
12. upload artifact
13. deploy-pages

兩個 workflow 均通過 actionlint。

`meta.html` 與資源使用相對路徑，可從 GitHub Pages repository 子路徑載入。未執行 push、Pages deploy、Rules deploy 或正式 Firebase Project 切換。

## 9. Release Blockers

1. `commit`、`tag`、`push` 尚待使用者明確確認。
2. GitHub Pages workflow 與上線後 Smoke Test 尚未執行。

因此目前不能寫入 `RELEASE CANDIDATE APPROVED`。

## 10. User Action Required

1. Review staged diff 後明確確認 `commit`、`tag` 與 `push v2.0.0-rc.1`。
2. Push 後監看 Pages workflow，並完成正式網址 Smoke Test。

## 11. 新增與修改檔案

Phase 8 主要變更：

- `.github/workflows/deploy-pages.yml`
- `.gitignore`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `package.json`
- `package-lock.json`
- `firebase-meta-bridge.js`
- `scripts/evidence-mvp-server.mjs`
- `scripts/verify-release-artifact.mjs`
- `src/meta/evidence/index.ts`
- `src/meta/integration/development-environment.ts`
- `src/meta/integration/environment.ts`
- `src/meta/integration/meta-page.ts`
- `tests/meta-firebase/firebase-rules-emulator.test.ts`
- 受 Seed import 隔離影響的測試
- `tsconfig.build.json`
- `tsconfig.phase2.json`
- `RELEASE_CHECKLIST.md`
- `PHASE8_RELEASE_READINESS_REPORT.md`

## 12. 驗證指令與結果

- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS，116 / 116
- `npm run build`：PASS
- `npm run test:emulator`：PASS，8 / 8
- `node --check firebase-meta-bridge.js`：PASS
- `npm run verify:release-artifact -- --root _site-phase8`：PASS
- actionlint：PASS
- Production dependency audit：PASS，0 vulnerabilities
- `git diff --check`：完成 staging 後 PASS
- `git diff --cached --check`：完成 staging 後 PASS

## 13. 建議 Commit Message

```text
chore(release): prepare Firebase Meta release candidate
```

## 14. Release Notes

### Beyblade Manager 2.0.0-rc.1

- 正式整合 Meta Dashboard 與完整分析鏈。
- 新增 Firebase Evidence、MetaProfile 與 Analysis Result Repository Adapter。
- 加入正式環境、Preview、Development 與 Emulator 隔離。
- 補強 Firestore Security Rules 與真實 Emulator 測試。
- Production build 不再包含 Seed、MVP 開發頁、source map 或 LocalStorage 正式 fallback。
- 改善 Missing Config、Offline、Permission Denied 與分析保存失敗狀態。
- GitHub Pages 部署流程加入 typecheck、lint、test、build 與 artifact 安全掃描。

## 15. 是否可進入正式部署

判定：`BLOCKED`

程式候選版本、Emulator、Rules、Production artifact、GitHub Variables、Firebase Console 設定、Rules／Indexes 部署，以及管理員／非管理員 Google Login Smoke Test 已通過。剩餘項目為使用者確認 commit/tag/push，以及 Pages 上線後 Smoke Test。
