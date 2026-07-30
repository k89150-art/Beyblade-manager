# Phase 4 Trend + Maturity MVP Report

## 1. Trend 計算規則對應

Trend Engine 依 `03_ANALYSIS_RULES.md` 實作：

- 固定計算 4、8、12 週。
- 每個視窗分成等長且互不重疊的 current period 與 comparison period。
- 日期使用 ISO date，Engine 一律以 UTC 零時進行日期邊界運算。
- Evidence 位於邊界時只會進入其中一個期間。
- 只納入目標 Entity 的 `verified` Evidence。
- `pending`、`rejected`、`superseded`、未來日期、重複、無訊號及視窗外 Evidence 會被排除並留下原因。
- 六維分數缺值維持 `null`；六維全空才排除，不會把缺值當零分。
- Evidence 訊號以已知六維平均值乘上正式 Grade 權重 A=1、B=0.85、C=0.65、D=0.35、E=0.15。
- current 或 comparison 任一期間不足兩筆時回傳 `insufficient_data`。
- 分母為 0 或沒有比較基準時，`percentageChange` 保持 `null`，不會產生 Infinity 或 NaN。
- 單一事件、0→正值及未滿 7 日的新訊號不得成為 `strong_up`。
- 相同輸入與 `analysisDate` 必定得到相同輸出；Engine 不讀系統時間、不使用亂數、不修改 Evidence。

正式文件定義了固定視窗與安全限制，但沒有提供上升、強上升、高波動及樣本數的完整數值門檻。MVP 門檻集中在 `trend/engine.ts` 的唯讀版本設定中，待正式規格核定。

## 2. Maturity 判定規則對應

正式 Stage 使用 Frozen Domain 名稱：

- `seed`
- `emerging`
- `established`
- `mature`
- `legacy`

頁面顯示對照：

- Seed／早期資料
- Emerging／新興
- Established／成長
- Mature／成熟
- Legacy／衰退或歷史階段

判定同時考慮：

- verified Evidence 數量
- Evidence 持續時間
- 獨立來源群組數
- Confidence Score 與 Level
- 4／8／12 週 Trend 穩定度
- 下降、過期與高波動訊號

資料不足或 Confidence 未知時，Stage 與 Score 保持 `null`。新品或短期間資料無法直接成為 `mature`。`legacy` 的理由明確標示「不代表 avoid」。

正式文件未提供各 Stage 的完整數值門檻；MVP 門檻集中在 `maturity/engine.ts`，不得視為最終正式競技判定。

## 3. 完成功能

- 純函式 Trend Engine。
- 純函式 Maturity Engine。
- Trend 與 Maturity Input／Output Types。
- 動態 Analysis Model Definition、Input Schema、Output Schema。
- 共用 Phase 4 AnalysisModelRegistry，包含 Confidence、Trend、Maturity。
- TrendService 與 MaturityService。
- TrendViewModel 與 MaturityViewModel。
- Service 只依賴 EvidenceRepository 與 MetaProfileRepository Interface。
- Analysis Result 通過 Registry 與 Runtime Validation 後才保存。
- 相同 modelId／version 重新計算時取代舊結果，不會無限新增。
- Confidence、Trend、Maturity 共用同一個 In-memory MetaProfile Repository。
- Evidence MVP 頁面新增三張 4／8／12 週趨勢卡片與輕量數值條。
- 頁面新增 Maturity 指標、Stage、Score 與可解釋理由。
- 缺少前置 Confidence 或 Trend 時顯示明確錯誤。
- 新增 Evidence 後會將後續分析標記為過期並要求重新計算。

## 4. 新增與修改檔案

新增：

- `src/meta/trend/types.ts`
- `src/meta/trend/engine.ts`
- `src/meta/trend/model.ts`
- `src/meta/trend/service.ts`
- `src/meta/trend/view-model.ts`
- `src/meta/trend/index.ts`
- `src/meta/maturity/types.ts`
- `src/meta/maturity/engine.ts`
- `src/meta/maturity/model.ts`
- `src/meta/maturity/service.ts`
- `src/meta/maturity/view-model.ts`
- `src/meta/maturity/index.ts`
- `tests/meta-trend-maturity/trend-maturity-mvp.test.ts`
- `PHASE4_TREND_MATURITY_MVP_REPORT.md`

修改：

- `src/meta/confidence/model.ts`
- `src/meta/evidence/seed.ts`
- `src/meta/evidence/evidence-page.ts`
- `tests/meta-confidence/confidence-mvp.test.ts`
- `evidence-mvp.html`
- `evidence-mvp.css`
- `package.json`
- `package-lock.json`
- `tsconfig.test.json`

## 5. 頁面路徑

- 頁面：`/evidence-mvp.html`
- 啟動：`npm run serve:evidence`
- 本機網址：`http://127.0.0.1:4173/evidence-mvp.html`

頁面預設日期使用 `Asia/Taipei`，Engine 仍以呼叫端提供的 ISO date 與固定 UTC 日期邊界運算。

## 6. Seed Data 情境

所有 Seed 均為開發資料，不使用正式網站資料：

- 魔導神杖：高 Confidence、穩定／上升、Mature。
- 上升趨勢測試：4 週 Strong Up、Emerging。
- 衰退趨勢測試：4 週 Strong Down、Legacy。
- 高波動測試：4 週 Volatile。
- 新興階段測試：短期跨來源累積、Emerging。
- 暴龍霸擊：單筆 Evidence、Seed／資料偏少。
- 蒼穹龍騎士：過期且來源單一。
- No Evidence Demo：Trend 與 Maturity 資料不足。

Phase 4 使用新的開發 LocalStorage key，不會清除或修改正式網站資料。

## 7. 瀏覽器實測結果

實際開啟 `http://127.0.0.1:4173/evidence-mvp.html` 驗證：

- Seed Evidence：29 筆，8 個開發 Entity。
- 上升案例：4 週「強勢上升」，Maturity 為 Emerging。
- 下降案例：4 週「強勢下降」，Maturity 為 Legacy。
- 穩定／成熟案例：4 週穩定、8／12 週上升，Maturity 為 Mature。
- 高波動案例：4 週「高波動」，理由顯示期內訊號差距。
- 無 Evidence：4／8／12 週皆「資料不足」，Maturity Stage 與 Score 未知。
- 未先計算 Trend 時按 Maturity：顯示明確前置結果提示。
- 頁面預設台北日期：`2026-07-30`。
- Browser Console Error：0。

## 8. 測試結果

新增測試涵蓋：

- 4／8／12 週視窗與不重疊區間
- 上升、下降、穩定、高波動
- 樣本不足、本期空白、比較期空白
- 零分分母
- 未來 Evidence 排除
- 邊界 Evidence 不重複
- `analysisDate` 變動與確定性
- Evidence 不被修改
- Maturity 的 null、seed、emerging、established、mature、legacy
- 多 Evidence 但來源單一
- 少量高分 Evidence
- Confidence 未知
- 高波動阻擋 mature
- 前置結果不被修改
- Service 讀取、驗證、保存與更新策略
- ViewModel 成功、錯誤與缺少前置結果

整體結果：

- `typecheck`：通過
- `lint`：通過
- `test`：79/79 通過
- `build`：通過
- `git diff --check`：通過
- `git diff --cached --check`：通過

## 9. Technical Debt

- Trend 與 Maturity 的完整數值門檻尚未出現在正式規格，需日後以版本化 Rule Definition 核定。
- Trend MVP 使用 Evidence 六維平均值乘 Grade 權重作為時間訊號；若未來 EvidenceAnalysis 提供正式綜合分數，Trend 應改為消費該模型輸出。
- MetaProfile 暫存仍為 In-memory Adapter；未接 Firebase 或正式資料庫。
- 頁面為開發工具，趨勢圖僅使用 CSS 數值條，未加入完整時間序列圖。
- Maturity 的 `legacy` 代表衰退或歷史階段，不代表不建議使用；未來需由 Risk／Recommendation 分開判定。

## 10. 下一個可見功能建議

下一個最小功能建議為 Risk MVP：以目前已驗證的 Evidence、Confidence、Trend 與 Maturity Result 產生可解釋 Risk Code 與風險層級，但不得把 Risk 直接當 Recommendation。

本階段未實作 Risk、Recommendation 或 Meta Coach。
