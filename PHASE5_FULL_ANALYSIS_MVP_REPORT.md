# Phase 5 Full Analysis MVP Report

## 1. Risk 規則

- 純函式輸入 Evidence、Confidence、4／8／12 週 Trend、Maturity、analysisDate 與模型版本。
- 僅使用分析日以前、`verified` 的 Evidence；未知值不當作 0。
- 可辨識資料／樣本不足、單一來源、單一地區、過期、短觀察期、證據衝突、配置未收斂、高波動、快速下降、新興不穩及成熟後衰退。
- 無有效 Evidence 或 Confidence 不足時，`riskScore` 為 `null`、`riskLevel` 為 `unknown`，不製造假精確分數。
- 文件未指定的權重與門檻集中於 `RISK_POLICY`，版本為 `risk-policy-v1.0.0`。
- 所有風險使用 Frozen Domain 的正式 Risk Code，並附 reasons、contributingFactors 與 mitigatingFactors。

## 2. Recommendation 規則

- 使用 Evidence、Confidence、Trend、Maturity 與 Risk 共同判斷，不由單一高分決定。
- 有效 Evidence 少於 2 筆、Confidence 未知或只有 Grade E 時，回傳 `insufficient_data`，分數與星等為 `null`。
- 低 Confidence、高 Risk、高波動及快速下降各有集中 Policy Cap。
- `strong_buy` 需要高／非常高 Confidence、低 Risk、足夠樣本、成熟度與非下降／非波動訊號同時成立。
- 「高 Risk＋快速下降＋至少 4 筆有效負面證據」優先判為 `avoid`；只有波動而未形成明確衰退時維持 `observe_and_test`。
- 每個結果保留 recommendationCodes、reasons、cautions、suggestedActions 與 supportingAnalysisIds。

## 3. Meta Coach 規則

- 完全使用固定 Template + Rule Mapping，不使用外部 AI API。
- 支援繁體中文 `zh-TW`，輸出 headline、整體評估、優勢、注意事項、下一步與五段分析解釋。
- 只重述已有 Evidence 與分析結果，不補猜勝率、名次或因果。
- 高波動時明示「時間相關訊號不代表因果」。
- 無 Evidence 時承認資料不足；開發 Seed 一律顯示「開發測試資料，不代表正式賽事結果或實戰保證」。
- 所有段落附 traceReferences。

## 4. Pipeline 流程

1. 由 EvidenceRepository 讀取 Entity Evidence。
2. 計算並驗證 Confidence。
3. 計算並驗證 4／8／12 週 Trend。
4. 計算並驗證 Maturity。
5. 計算並驗證 Risk。
6. 計算並驗證 Recommendation。
7. 產生並驗證 Meta Coach。
8. 以 Frozen Domain Runtime Validation 驗證完整 MetaProfile。
9. 全部成功後才單次寫入 MetaProfileRepository。

任何階段失敗會回傳 `FullAnalysisPipelineError.stage` 與詳細原因，且不保存部分結果。相同 Entity、日期、modelId/version 採 upsert；Registry 中仍有效的舊版本會保留並與目前版本隔離。

## 5. 完成功能

- Risk Engine、Schema、Registry Definition。
- Recommendation Engine、Schema、Registry Definition。
- Meta Coach、Schema、Registry Definition。
- 單一 FullAnalysisPipelineService 與 FullAnalysisViewModel。
- Risk、Recommendation、Coach 單階段按鈕。
- 一鍵完整分析、執行狀態、模型版本、錯誤階段與 7 個 Trace ID。
- Evidence 變更或 Entity／日期不一致時，清除下游舊結果並明確提示。
- 開發頁 Risk、Recommendation 與 Meta Coach 可見結果。

## 6. 新增與修改檔案

新增：

- `src/meta/risk/*`
- `src/meta/recommendation/*`
- `src/meta/coach/*`
- `src/meta/full-analysis/*`
- `tests/meta-full-analysis/full-analysis-mvp.test.ts`
- `PHASE5_FULL_ANALYSIS_MVP_REPORT.md`

修改：

- `src/meta/confidence/service.ts`
- `src/meta/evidence/evidence-page.ts`
- `evidence-mvp.html`
- `evidence-mvp.css`
- `package.json`
- `package-lock.json`
- `tsconfig.test.json`

## 7. 頁面路徑

`http://127.0.0.1:4173/evidence-mvp.html`

啟動：

```bash
npm run build
npm run serve:evidence
```

## 8. Seed 情境與結果

| 開發情境 | Risk | Recommendation |
|---|---|---|
| 高 Confidence、成熟、穩定／上升 | 低 | 強烈推薦 |
| 單筆高分 Evidence | 高 | 資料不足 |
| 單一來源且 Evidence 過期 | 高 | 等待更多資料 |
| 無 Evidence | 未知 | 資料不足 |
| 明顯上升 | 低 | 推薦 |
| 快速下降且成熟度轉 Legacy | 高 | 不建議 |
| 高波動且新興 | 高 | 觀察並測試 |
| 新興且證據持續增加 | 低 | 推薦 |

以上均為開發測試資料，不代表正式賽事結果。

## 9. 瀏覽器實測

- 於 1280 × 720 瀏覽器實際開啟頁面。
- 八個 Entity 均完成一鍵 Pipeline，狀態皆顯示「分析完成」。
- 快速下降案例顯示 Risk 高與「不建議」。
- 無 Evidence 顯示未知 Risk、null 分數與「資料不足，無法建議」。
- 切換 Entity 後單獨按 Risk，正確顯示前置資料不一致，且不殘留上一個 Entity 的結果。
- 完整結果顯示 7 個 Trace References。
- 瀏覽器 Console 無錯誤。
- 手機響應式 CSS 已維持單欄、全寬按鈕與可讀卡片；目前自動化瀏覽器工作階段固定為桌面 viewport，未產生 390 × 844 自動截圖。

## 10. 測試結果

- `typecheck`：通過
- `lint`：通過
- `test`：92／92 通過
- `build`：通過
- `git diff --check`：通過
- `git diff --cached --check`：通過

測試涵蓋 Risk、六種 Recommendation 狀態、Coach 可追溯性、Pipeline 成功與各階段失敗、Registry 拒絕、無部分保存、upsert、版本隔離及 ViewModel loading／success／error。

## 11. Technical Debt

- Risk 與 Recommendation 的 MVP 數值門檻雖已集中版本化，仍需以正式賽事資料校準。
- Evidence Domain 尚未保存逐場勝敗資料，因此目前會合理觸發 `missing_match_data`。
- 開發頁的 MetaProfile Repository 為記憶體實作，重新整理後只保留 Evidence LocalStorage，不保留分析結果。
- 正式網站整合前需補 390 × 844、768 × 1024 的實機或可調 viewport 視覺回歸截圖。

## 12. 下一步正式網站整合計畫

1. 將 Pipeline 置於正式配置分析頁的 Adapter 層，不讓 UI 直接接 Repository。
2. 建立正式 Entity Mapping，將目前配置零件對應 Canonical Entity ID。
3. 先採唯讀結果卡片與「開發／正式資料」來源標示。
4. 補正式 Evidence 寫入權限與審核流程後，再建立 Firebase Adapter。
5. 以既有 8 種情境作視覺回歸，確認手機版與現行收藏、配置、Firestore 流程互不影響。
