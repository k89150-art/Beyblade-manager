# Phase 9 Production Launch Report

日期：2026-07-30

## 1. 正式 Firebase Project

- Project ID：`k89150-web-login`
- Firestore Database：`(default)`
- `.firebaserc`：`default` 已綁定正式 Project
- Firebase Web App：沿用現有 `k89150-github-web`
- Production Pages URL：`https://k89150-art.github.io/Beyblade-manager/`

## 2. GitHub Variables 狀態

以下 Repository Variables 已設定並核對名稱：

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `META_ADMIN_UIDS`

值未寫入 Repository、Log 或本報告。既有
`FIREBASE_SERVICE_ACCOUNT_K89150_WEB_LOGIN` Secret 僅供 Firestore Rules
workflow 使用，不會注入 Pages 前端。

## 3. Authorized Domains

Firebase Authentication 已確認包含：

- `k89150-art.github.io`
- `localhost`

`127.0.0.1` 刻意不在清單內，並用於驗證未授權網域的友善錯誤狀態。

## 4. Google Provider 狀態

- Google Sign-in Provider：已啟用
- Meta Admin UID：`SesDhvXG6MUT38YhqGl0N6lVgMz1`
- 獨立 Editor：暫不設定
- 管理員帳號 `k89150@gmail.com`：Popup 登入、登出、重新登入均成功
- 正式非管理員帳號 `lolas8228@gmail.com`：唯讀驗證通過

## 5. Rules／Indexes 部署結果

目標：`k89150-web-login` / `(default)`

- `firestore.rules`：編譯、上傳、發布成功
- `firestore.indexes.json`：部署成功
- 索引內容：無未使用複合索引
- Firebase Console：沒有建立中或錯誤索引
- 既有 `users/{uid}/appData/{documentId}` 規則保留
- Meta Collections 維持 Admin-only 寫入與禁止正式刪除

## 6. 正式登入與 Firebase Smoke Test

正式 Preview：`http://localhost:4175/meta.html`

- 未登入時為唯讀，不顯示 Evidence 新增功能
- Admin 登入後顯示管理員入口與 Evidence 新增功能
- 登出後權限立即清除
- 重新登入後權限正確恢復
- 使用 `0-60` 建立 RC Evidence 成功
- Source ID：`release-candidate-smoke-test-v2-0-0-rc-1`
- 重新整理後 Evidence 仍可從 Firebase 讀取
- 完整分析成功並顯示「分析結果已保存至 Firebase」
- Entity 與 Analysis Date 切換會清除舊分析結果
- Console Error：0
- 非管理員可讀取 RC Evidence，但不顯示新增 Evidence 或管理員後台
- 非管理員執行分析時明確標示僅供本次預覽，不會保存

RC Evidence 依正式 Rules 不允許刪除，保留作為發行稽核紀錄。

## 7. 發行前介面修正

- Firebase Auth 原始錯誤不再直接顯示給一般使用者。
- `auth/unauthorized-domain`、Popup 阻擋／關閉、取消與網路錯誤改為友善中文訊息。
- Evidence 表單改為明確標示正式模式會寫入 Firebase。
- 未修改 Frozen Domain、分析公式、Engine 或 Repository 契約。

## 8. 自動化驗證

- `typecheck`：PASS
- `lint`：PASS
- unit / integration：116 / 116 PASS
- `build`：PASS
- Firebase Auth + Firestore Emulator Rules：8 / 8 PASS
- actionlint：PASS
- `npm audit --omit=dev`：0 vulnerabilities
- Production artifact：105 個檔案，無 Seed、source map、私鑰、Service Account 或 Meta LocalStorage fallback

## 9. Commit／Tag／Push

- Commit Message：`chore(release): prepare Firebase Meta release candidate`
- Tag：`v2.0.0-rc.1`
- Branch：`main`
- Remote：`origin`
- 狀態：尚未執行，等待使用者明確確認

## 10. GitHub Actions 與 Pages

- 新 Pages workflow 已通過 actionlint 與本機等價命令
- GitHub Variables 已就緒
- Pages push/deploy：尚未執行
- 正式 Pages Smoke Test：尚未執行

## 11. Rollback 資訊

- 上一個可用 Commit SHA：`da7a97d`
- Phase 0 基準 Tag：`v2-phase0-baseline-20260729`
- GitHub Pages：可重新部署上一個可用 SHA
- Firestore Rules：可由 Firebase Console Rules 歷史版本回復
- 回復流程不刪除 Evidence、MetaProfile 或既有使用者資料

## 12. Remaining Technical Debt

- firebase-tools 的開發依賴鏈仍有已知 audit 警告；Production dependency audit 為 0。
- Pages 部署後仍需 Desktop、Tablet、Mobile Smoke Test。

## 13. 最終發行判定

目前狀態：`BLOCKED`

尚未完成：

1. 使用者確認 commit、tag、push。
2. GitHub Actions Pages 部署。
3. 正式 Pages URL 上線後 Smoke Test。

因此目前不得標記 `RELEASE CANDIDATE APPROVED` 或
`v2.0.0-rc.1 DEPLOYED`。
