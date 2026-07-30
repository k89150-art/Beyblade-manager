# Phase 3 Confidence MVP Report

## 1. Confidence 計算規則對應

Confidence Engine 依照 `03_ANALYSIS_RULES.md` 實作下列正式規則：

- 只納入 `verified` 且符合目標 Entity、日期與去重規則的 Evidence。
- `pending`、`rejected`、`superseded`、未來日期、目標不符及重複 Evidence 會被排除並留下 reason code。
- Evidence Grade 權重為 A=1、B=0.85、C=0.65、D=0.35、E=0.15。
- 六維欄位缺值保持 `null`，不會當成零分 Evidence。
- 分別評估樣本數、來源多樣性、地區多樣性、時效、完整度、一致性與 Grade 品質。
- 單筆 Evidence、單一來源、單一地區、觀察期過短、D/E 佔多數、互相矛盾及資料過期會觸發扣分或 Hard Cap。
- 無有效 Evidence 時，`confidenceScore` 保持 `null`，`confidenceLevel` 為 `insufficient`。
- Engine 不讀取系統時間、不使用隨機值、不修改輸入 Evidence；`analysisDate` 完全由呼叫端提供。

正式文件有定義扣分與 Hard Cap 原則，但未提供所有數值門檻。MVP 將操作門檻集中在 `engine.ts` 的單一唯讀設定中，以維持可重現性；這些數值仍需日後由規格或實測資料正式核定。

## 2. 完成功能

- 純函式 `calculateConfidence()`。
- Confidence Input、Output、Dimension、Excluded Evidence 等 Domain Types。
- Confidence Analysis Model Definition、Input Schema、Output Schema 與 Registry 註冊。
- Confidence Service，透過 `EvidenceRepository` 取得資料並驗證輸出。
- `MetaProfileRepository` Interface 與暫存 In-memory Adapter。
- Service 會建立並驗證 `MetaProfile.analysisResults[]` 後再儲存。
- Confidence ViewModel，支援成功、空資料與錯誤狀態。
- Evidence MVP 頁面新增可操作的 Confidence 區塊。
- 顯示分數、等級、Evidence 數、來源多樣性、時效、完整度、一致性與計算時間。
- 顯示各維度結果、主要加分因素、主要扣分因素、被排除 Evidence 與排除原因。
- Evidence 新增後會提示重新計算，不會顯示舊結果為最新狀態。

## 3. 新增與修改檔案

新增：

- `src/meta/confidence/types.ts`
- `src/meta/confidence/model.ts`
- `src/meta/confidence/engine.ts`
- `src/meta/confidence/repository.ts`
- `src/meta/confidence/service.ts`
- `src/meta/confidence/view-model.ts`
- `src/meta/confidence/index.ts`
- `tests/meta-confidence/confidence-mvp.test.ts`
- `PHASE3_CONFIDENCE_MVP_REPORT.md`

修改：

- `src/meta/evidence/types.ts`
- `src/meta/evidence/validation.ts`
- `src/meta/evidence/service.ts`
- `src/meta/evidence/seed.ts`
- `src/meta/evidence/evidence-page.ts`
- `tests/meta-evidence/evidence-mvp.test.ts`
- `evidence-mvp.html`
- `evidence-mvp.css`
- `package.json`
- `package-lock.json`
- `eslint.config.js`
- `tsconfig.json`
- `tsconfig.test.json`
- `tsconfig.phase2.json`

## 4. 頁面路徑

- 開發頁面：`/evidence-mvp.html`
- 本機啟動：`npm run evidence:mvp`
- 預設網址：`http://127.0.0.1:4173/evidence-mvp.html`

頁面延伸既有 Evidence MVP，未重做全站 UI，也未接觸正式網站資料。

## 5. 測試案例與結果

Confidence 自動化測試共 13 項：

- 無 Evidence 保持未知與資料不足。
- 單筆 Evidence 觸發樣本 Hard Cap。
- 多來源 Evidence 可形成高 Confidence。
- 過期 Evidence 觸發時效限制。
- 不完整 Evidence 的缺值保持 `null`。
- 分數互相矛盾會降低一致性並觸發限制。
- 不合資格 Evidence 被排除並保留原因。
- 相同輸入產生相同結果。
- `analysisDate` 改變會影響 recency。
- Engine 不修改原始 Evidence。
- Service 正確從 Repository 讀取、驗證並儲存 Analysis Result。
- Analysis Result 通過 Registry 與 Runtime Validation。
- ViewModel 正確呈現成功、空資料與錯誤狀態。

整體測試結果：

- `typecheck`：通過
- `lint`：通過
- `test`：57/57 通過
- `build`：通過

實際瀏覽器驗證：

- 高可信度案例：98.26／非常高，4 筆 Evidence、3 個獨立來源。
- 證據不足案例：40／低，單筆 Evidence 且部分六維缺值。
- 過期單一來源案例：45／低，最新資料距分析日 259 天。
- 無 Evidence 案例：分數未知／資料不足。
- 瀏覽器 Console Error：0。

## 6. Seed Data 情境

所有 Seed 均為開發測試資料，不使用正式網站資料：

- 魔導神杖：多來源、多地區、近期且一致的高可信度案例。
- 暴龍霸擊：單筆且部分不完整的證據不足案例。
- 蒼穹龍騎士：過期、單一來源且低 Grade 為主的案例。
- No Evidence Demo：完全沒有 Evidence 的空資料案例。

開發用 LocalStorage key 已更新為 Phase 3 專用版本，避免舊 MVP Seed 阻礙展示；未修改正式網站或正式使用者資料。

## 7. Technical Debt

- 正式規格尚未給出所有 Confidence 數值門檻與 Hard Cap 數字，MVP 門檻需在未來規格核定後版本化。
- `MetaProfileRepository` 目前僅為 In-memory Adapter，重新整理後會重新計算，不做 Firebase 或正式資料庫保存。
- MVP 直接以符合資格的 Evidence Records 計算；若未來規格新增獨立 Evidence Analysis Model，Service 需改為消費該模型輸出。
- Model Registry 目前只註冊 MVP 使用的開發 Entity Type；正式 Entity Type Registry 整合留待資料接軌階段。

## 8. 下一個可見功能建議

下一個最小功能建議為 Trend MVP：沿用目前 Evidence 篩選與 Analysis Result 顯示方式，加入明確時間區間比較；開始前需先確認 Trend 的正式視窗、最小樣本與缺值規則。

本階段未實作 Trend、Maturity、Risk、Recommendation 或 Meta Coach。
