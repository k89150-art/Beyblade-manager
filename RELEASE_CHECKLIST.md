# Beyblade Manager v2.0.0-rc.1 Release Checklist

檢查日期：2026-07-30

狀態定義：

- `PASS`：已實際執行並通過。
- `BLOCKED`：目前條件不足，會阻擋正式部署。
- `NOT RUN`：尚未執行，不代表通過。
- `USER ACTION REQUIRED`：需要專案擁有者在外部後台確認或設定。

## 工具與專案

| 狀態 | 項目 | 結果 |
| --- | --- | --- |
| PASS | Node.js | v24.18.0 |
| PASS | npm | v11.16.0 |
| PASS | Java | Microsoft OpenJDK 21.0.12 可攜版，僅位於暫存目錄，未修改系統 PATH |
| PASS | Firebase CLI | 專案本地 firebase-tools 15.25.0 |
| PASS | GitHub CLI | gh 2.95.0 |
| PASS | Workflow 語法 | deploy-pages.yml 與 deploy-firestore-rules.yml 通過 actionlint 1.7.12 |
| PASS | Firebase Project ID | 已確認正式專案為 `k89150-web-login` |
| PASS | `.firebaserc` / Project Alias | `default` 已明確綁定 `k89150-web-login` |

## GitHub Repository Variables

以下 Repository Variables 已透過 GitHub CLI 設定並核對名稱；值未寫入 Repository、Log 或報告：

| 狀態 | Variable |
| --- | --- |
| PASS | `FIREBASE_API_KEY` |
| PASS | `FIREBASE_AUTH_DOMAIN` |
| PASS | `FIREBASE_PROJECT_ID` |
| PASS | `FIREBASE_STORAGE_BUCKET` |
| PASS | `FIREBASE_MESSAGING_SENDER_ID` |
| PASS | `FIREBASE_APP_ID` |
| PASS | `META_ADMIN_UIDS` |

`FIREBASE_SERVICE_ACCOUNT_K89150_WEB_LOGIN` 已存在於 Secrets，僅供獨立的 Firestore Rules 部署 workflow 使用；前端 Pages workflow 不使用 Service Account。

## Firebase Console

| 狀態 | 項目 | 操作 |
| --- | --- | --- |
| PASS | Authorized Domains | 已確認包含 `k89150-art.github.io` 與 `localhost` |
| PASS | Google Auth Provider | 已確認 Google 登入 Provider 啟用 |
| PASS | Firestore Database | `(default)` 已建立並可正常存取 |
| PASS | 管理員 UID | `SesDhvXG6MUT38YhqGl0N6lVgMz1` 與 Rules、Repository Variable 一致 |
| PASS | Firestore Rules 部署 | 已部署至 `k89150-web-login`，編譯、上傳與發布成功 |
| PASS | Firestore Index 部署 | 空索引設定已部署；Console 沒有建立中或錯誤索引 |

## 自動化驗證

| 狀態 | 項目 | 結果 |
| --- | --- | --- |
| PASS | typecheck | 無錯誤 |
| PASS | lint | 無錯誤 |
| PASS | unit / integration tests | 116 / 116 通過 |
| PASS | production build | 成功 |
| PASS | Firebase Emulator tests | 8 / 8 組通過 |
| PASS | Security Rules tests | Auth + Firestore Emulator 實際執行通過 |
| PASS | Production dependency audit | `npm audit --omit=dev` 為 0 vulnerabilities |
| USER ACTION REQUIRED | Dev dependency audit | firebase-tools 依賴鏈有 3 moderate / 16 high；修正建議會降版並造成 breaking change，未自動套用 |
| PASS | Production artifact scan | 107 個檔案；無 Seed、source map、私鑰、Service Account 或 Meta LocalStorage fallback |
| PASS | `git diff --check` | 完成 staging 後記錄於 Phase 8 報告 |
| PASS | `git diff --cached --check` | 完成 staging 後記錄於 Phase 8 報告 |

## 瀏覽器驗證

| 狀態 | 項目 | 結果 |
| --- | --- | --- |
| PASS | 1440 x 900 | 正常，無水平溢出 |
| PASS | 768 x 1024 | 正常，無水平溢出 |
| PASS | 390 x 844 | 正常，無水平溢出 |
| PASS | Missing Config | 顯示「設定缺失」，寫入與分析操作停用 |
| PASS | 未登入唯讀 | 正式模式不顯示可寫操作 |
| PASS | 真實 Google Popup 完整登入 | `k89150@gmail.com` 登入、登出與重新登入成功 |
| PASS | 真實非管理員帳號 | `lolas8228@gmail.com` 顯示唯讀，可讀 Evidence，不顯示新增與管理員功能 |
| PASS | 無 Editor 權限 | 分析結果僅供本次預覽，不顯示為已保存 |
| PASS | Editor / Admin 權限 | Emulator 中可新增 Evidence 並保存分析 |
| PASS | Evidence 新增成功 | 正式 Firebase 已建立 `0-60` RC Evidence，重新整理後仍可讀取 |
| PASS | Evidence 寫入拒絕 | 表單保留，筆數不變，顯示權限錯誤 |
| PASS | 完整分析與保存 | 正式 Preview Pipeline 完整、6 張分析卡並顯示已保存至 Firebase |
| PASS | 分析成功但保存失敗 | 明確顯示「分析已完成，但 Firebase 保存失敗」 |
| PASS | Offline | 使用 server-only read 後顯示 Firebase 離線錯誤，不讀快取冒充成功 |
| PASS | Entity 不存在 | 顯示明確錯誤 |
| PASS | 無 Evidence | 顯示資料不足結果，不假裝有可信度 |
| PASS | Entity 切換 | 舊分析結果清除 |
| PASS | Analysis Date 切換 | 舊分析結果清除 |
| PASS | Console Error | 最終乾淨候選版為 0 |

## GitHub Pages Dry Run

| 狀態 | 項目 | 結果 |
| --- | --- | --- |
| PASS | `npm ci` 等價依賴狀態 | package-lock 已更新，專案本地安裝可用 |
| PASS | typecheck / lint / test / build steps | workflow 已包含且本機等價命令通過 |
| PASS | Pages artifact | `_site-phase8` 本機 Dry Run 通過掃描 |
| PASS | Base path | `meta.html` 與靜態資源使用相對路徑，可由 GitHub Pages 專案子路徑載入 |
| PASS | Production Seed 隔離 | 舊 MVP、Seed 與 development adapter 不進 artifact |
| PASS | dist 不納入 Git | `dist/` 已被 `.gitignore` 忽略 |
| PASS | GitHub Pages Variables | 7 個公開設定 Variable 已完成 |
| NOT RUN | Pages Deploy | 依要求未部署 |
| PASS | Firestore Rules Deploy | 已依明確確認部署至 `k89150-web-login` |

## 備份、提交與上線

| 狀態 | 項目 | 結果 |
| --- | --- | --- |
| PASS | Rollback 基礎 | 上一個可用 SHA 為 `da7a97d`，Phase 0 基準 Tag 為 `v2-phase0-baseline-20260729` |
| NOT RUN | Commit | 依要求未執行 |
| NOT RUN | Push | 依要求未執行 |
| NOT RUN | Tag | 依要求未執行 |
| NOT RUN | Pages Deploy | 依要求未執行 |
| NOT RUN | 上線後 Smoke Test | 等正式部署後執行 |

## Release Gate

目前狀態：`BLOCKED`

阻擋原因：

1. `commit`、`tag` 與 `push` 尚待使用者明確確認。
2. GitHub Pages workflow、正式 Pages Smoke Test 與上線後回復點尚未完成。

在以上項目完成前，不標記 `RELEASE CANDIDATE APPROVED`。
