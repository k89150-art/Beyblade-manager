# Phase 6 Production Integration Report

日期：2026-07-30

## 1. 正式整合位置

- 完整分析鏈已整合至既有戰鬥陀螺管理器，不另建第二套網站。
- 正式頁面沿用 `style.css`、`site-menu.css`、`site-menu.js` 與既有側欄／手機底部導覽。
- 配置卡片新增「Meta」入口，原本的配置分析、修改、刪除流程維持不變。
- Frozen Domain 與 Phase 2 至 Phase 5 Engine 未修改分析公式。

## 2. 路由

- 正式 Dashboard：`/meta.html`
- 指定 Entity：`/meta.html?entityId=<CanonicalEntityId>`
- 配置名稱解析：`/meta.html?name=<中文名或英文名>`
- 開發頁：`/evidence-mvp.html`，保留但不顯示於正式 Navigation。
- 無效 `entityId` 會顯示一般使用者可理解的錯誤，不顯示 raw stack trace。

## 3. Navigation

- 桌面側欄新增「Meta 分析」。
- 首頁新增 Meta 分析入口與功能說明。
- 配置卡片可直接帶入配置中的上蓋／戰刃名稱開啟 Meta 頁。
- 手機底部五項主要操作維持原結構，避免新增第六項造成點擊區過窄。
- 正式 Navigation 不包含舊 Evidence MVP 開發頁。

## 4. 頁面功能

- Entity 搜尋、選擇、直接連結與不存在狀態。
- Analysis Date 切換；切換 Entity 或日期會清除舊分析結果。
- 一鍵執行 Evidence → Confidence → Trend → Maturity → Risk →
  Recommendation → Meta Coach。
- 顯示 Loading、成功、資料不足與失敗階段。
- 顯示模型版本、計算時間與各階段 Trace ID。
- Dashboard 包含 Entity、Evidence、Confidence、Trend、Maturity、Risk、
  Recommendation 與 Meta Coach。
- Evidence 支援清單、Entity 篩選、日期排序、新增與 Validation Error。
- Domain Repository 尚未支援停用／刪除，因此正式頁未自行加入不相容操作。

## 5. 資料模式

- `production-preview`：正式資料目錄搭配空的 In-memory Evidence Repository。
- `development`：只允許 localhost 使用 `?mode=development`，載入明確標示的
  Seed Data，並使用專用 LocalStorage key。
- 非 localhost 無法用 query string 強制啟用開發 Seed。
- Production build 不會自動注入 Seed，也不把 LocalStorage 宣稱為正式持久層。
- LocalStorage 損壞時保留原內容、停止持久化並顯示警告，不會靜默覆寫。
- 正式資料目錄由既有 `beyblade_x_database_v1_zhTW.json` 建立，共解析
  209 個穩定且唯一的 Canonical Entity。

## 6. Seed 隔離方式

- 開發 Entity 與 Evidence Seed 只在 localhost development mode 建立。
- 開發 LocalStorage key：`beyblade-meta-development-evidence-v1`。
- 正式預覽 Repository 預設為空，Seed 不會混入正式資料。
- `/evidence-mvp.html` 繼續作為獨立開發驗證頁。

## 7. 響應式驗證

實際使用瀏覽器驗證：

- Desktop `1440 × 900`：側欄、控制列、Entity 摘要與 Evidence 區塊正常。
- Tablet `768 × 1024`：單欄控制列、分析卡片與導覽切換正常。
- Mobile `390 × 844`：底部導覽正常，主要操作按鈕高度 44px。
- 三種尺寸皆無水平溢出。
- 長 Reason、Canonical Entity ID 與 Trace ID 可換行，不破壞卡片。
- 手機分析區塊順序為 Confidence、Trend、Maturity、Risk、
  Recommendation、Meta Coach。

## 8. 錯誤與空狀態

- Entity 不存在：顯示明確錯誤並停用分析。
- 無 Evidence：完整鏈仍回傳明確的資料不足結果，不虛構可信度。
- Pipeline 失敗：保留失敗階段與一般訊息；技術資訊只放在可折疊區。
- Registry 模型版本或輸出不相容：由既有 Runtime Validation 拒絕。
- LocalStorage 損壞／Repository 無法持久化：降級至記憶體並顯示資料模式警告。
- Entity 或日期切換：立即清除先前結果，避免錯置。

## 9. 新增與修改檔案

新增：

- `meta.html`
- `meta.css`
- `src/meta/integration/types.ts`
- `src/meta/integration/catalog.ts`
- `src/meta/integration/environment.ts`
- `src/meta/integration/view-model.ts`
- `src/meta/integration/meta-page.ts`
- `src/meta/integration/index.ts`
- `tests/meta-integration/production-integration.test.ts`
- `.github/workflows/deploy-pages.yml`
- `PHASE6_PRODUCTION_INTEGRATION_REPORT.md`

修改：

- `home.html`
- `index.html`
- `script.js`
- `site-menu.js`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.test.json`

## 10. 測試與瀏覽器結果

- `npm run typecheck`：通過。
- `npm run lint`：通過。
- `npm test`：105/105 通過。
- `npm run build`：通過。
- 完整 Pipeline：六個結果區塊與七個階段 Trace 均建立。
- Evidence 新增：Runtime Validation、清單更新與舊結果清除正常。
- Entity／Analysis Date 切換：不沿用舊結果。
- 正式模式無 Seed；開發模式 Seed 與正式資料隔離。
- 正式 Navigation 無 `/evidence-mvp.html`。
- Desktop、Tablet、Mobile 均無頁面 Console Error。
- GitHub Pages workflow 會先執行 TypeScript build，再將靜態檔與產生的
  `dist/` 放入部署 artifact；`dist/` 本身不納入 Git。

## 11. Technical Debt

- 正式 Evidence 持久化仍為未來 Adapter 工作，本階段依限制未接 Firebase。
- 正式目錄缺少圖片的 Entity 以文字摘要顯示，不建立假圖片。
- 目前 Evidence Domain 未定義停用／刪除契約，因此只提供新增與查看。
- 部分正式資料的系列欄位本身較寬泛；本階段忠實顯示，不改寫資料庫。

## 12. 下一步 Firebase Integration Plan

1. 實作 `EvidenceRepository` 的 Firebase Adapter，不改 Service 或 UI 契約。
2. 建立正式 Evidence collection、索引與 Security Rules。
3. 將管理員寫入與一般使用者唯讀權限分離。
4. 加入資料遷移 dry-run、版本欄位與回滾策略。
5. 在 Emulator 完成 Rules、Repository 與 Pipeline 整合測試後再切換正式環境。
