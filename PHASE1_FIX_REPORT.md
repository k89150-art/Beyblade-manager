# Phase 1.5 Review Fix Report

Date: 2026-07-29
Scope: Domain Types, Schema, Runtime Validation, and Domain tests only
Status: Completed; Phase 2 not started

## 修正項目

### 1. WeeklyMetaSnapshot 日期驗證

- `snapshotDateOrder` 已改用實際契約中的 `weekStart` 與 `weekEnd`。
- 已移除所有 `periodStart`、`periodEnd` 舊引用。
- 反向週期現在會在 `WeeklyMetaSnapshot.weekEnd` 回傳
  `invalid_date_order`。
- 測試不再建立不存在的欄位，改用獨立手寫且經 TypeScript
  `satisfies WeeklyMetaSnapshot` 檢查的 fixture。

### 2. Canonical Entity ID

- 新增 `CanonicalEntityId`。
- Canonical ID 格式為 `ent_<uuid>`。
- ID 為 opaque、immutable，內容不包含：
  - BX、UX、CX 或未來系列代碼
  - 商品型號
  - 中文或英文名稱
  - 零件種類或 Build Slot
- 系列關係由 `CatalogEntity.seriesIds` 表達。
- 零件角色由動態 `BuildSystemDefinition` 與 Slot 表達。
- 舊 ID 與舊名稱保留於 `legacyIds`、`EntityAlias`，作為日後可回復的
  Migration 對照來源。
- Entity Target、Alias、Stock Configuration、Combo Component、Meta Route、
  Synergy 與 Counter 等所有 Entity foreign key 已使用 Canonical Entity
  ID 契約。

此設計不依賴目前暫定名稱，可支援 BX、UX、CX 與未來系列。

### 3. 動態 Build Slot

- 移除全域 `BUILD_SLOTS` 硬編碼。
- Slot 名稱由每筆 `BuildSystemDefinition.allowedSlots` 宣告。
- Runtime Validation 會檢查：
  - `allowedSlots` 至少一項且不可重複。
  - 每個 `requiredSlot` 必須存在於 `allowedSlots`。
  - 每個 exclusive group 至少包含兩個不同 Slot。
  - exclusive group 中的 Slot 必須存在於 `allowedSlots`。
- 測試加入未來自訂 Slot，確認不需修改 Domain 程式即可通過。

### 4. JSON Serializable Boundary

Runtime Validation 現在只接受：

- `null`
- string
- boolean
- finite number
- dense JSON array
- plain object 或 null-prototype plain object

以下資料會被拒絕：

- `Date`
- `Map`
- `Set`
- Class Instance
- cyclic object/array
- sparse array
- function
- symbol
- bigint
- `NaN`、`Infinity`
- 明確設為 `undefined` 的欄位

這避免 Raw Evidence、attributes 與 calculation details 在序列化時遺失或
改變內容。

### 5. Evidence 六維分數

Evidence dimensions 已固定為：

1. `source_quality`
2. `sample_size`
3. `regional_diversity`
4. `time_consistency`
5. `configuration_consistency`
6. `independent_confirmation`

每個維度：

- 必須存在。
- 值必須為 `0-100` 或 `null`。
- 不接受額外或拼錯的維度名稱。

`EvidenceAnalysis.dimensionScores` 已從 unrestricted record 改為明確的
`EvidenceDimensionScores`。

### 6. Risk Code

Risk Code 已改為 const-array 加 Union Type，合法值完全對應
`03_ANALYSIS_RULES.md`：

- `insufficient_sample`
- `single_source_dependency`
- `single_region_dependency`
- `configuration_not_converged`
- `short_observation_period`
- `counter_growth`
- `trend_instability`
- `new_release_uncertainty`
- `conflicting_evidence`
- `stale_data`
- `missing_match_data`

未知或拼錯的 Risk Code 會被 Runtime Validation 拒絕。

### 7. Recommendation 與 Explainability

- 所有 Derived Analysis 的 `reasons` 至少需要一項。
- 每個 Trend Window 的 `reasons` 至少需要一項。
- `strong_buy` 與 `recommended` 至少需要一項 positive factor。
- `conditional`、`wait`、`avoid`、`insufficient_data` 至少需要一項 risk
  factor。
- `insufficient_data` 仍強制 `score=null`、`stars=null`。
- Meta Coach 的 `actionAdvice` 至少需要一項。
- Analysis 與 Trace 至少需要一個 Rule Definition ID。
- Synergy 與 Counter 結果必須提供 reasons。

### 8. 其他 Review Business Rules

- Date-time 改為 calendar-strict RFC 3339 形式，必須包含 `Z` 或明確時區。
- 不可能日期如 `2026-02-30T00:00:00.000Z` 會被拒絕。
- URI 僅接受 HTTP/HTTPS。
- Optional 欄位不可明確設為 `undefined`，必須省略。
- Raw Performance 不再重新推導 win rate；來源提供的 rounded value 可原樣
  保留。
- Mapping Task 使用有限狀態：
  `pending`、`resolved`、`dismissed`。
- 非 `resolved` Mapping Task 不可夾帶 resolution fields。
- `resolved` Mapping Task 必須有 Entity、Actor 與 Timestamp。
- Analysis Run、Evidence Import Batch、Editorial Note、Analysis Output Type
  已改為有限 Union Type。

## 影響範圍

修改檔案：

- `src/meta/domain/enums.ts`
- `src/meta/domain/types.ts`
- `src/meta/domain/schema.ts`
- `src/meta/domain/validation.ts`
- `src/meta/domain/README.md`
- `tests/meta-domain/domain-validation.test.ts`

新增檔案：

- `PHASE1_FIX_REPORT.md`

未修改：

- 現有 HTML、CSS、JavaScript 頁面
- 收藏、庫存、配置、分析與賽事功能
- Firebase Auth
- Firestore
- localStorage
- Security Rules
- 既有 JSON 資料庫
- API
- UI
- Engine
- Database Schema
- Migration

## 是否有 Breaking Change

### 對目前正式網站

沒有。新的 Domain Layer 尚未接入目前正式功能，因此使用者資料與操作流程
不受影響。

### 對 Phase 1 草稿契約

有以下刻意的 Domain-level breaking changes：

- Entity foreign key 現在必須使用 `CanonicalEntityId`。
- Risk Code 不再接受任意字串。
- Evidence dimensions 必須完整且名稱固定。
- Derived Analysis reasons 不可為空。
- 部分 lifecycle status 不再接受任意字串。
- Date-time 必須是有效且有時區的 RFC 3339 值。
- Optional `undefined` 與非 JSON-safe payload 不再接受。

這些變更發生在任何 Phase 2 資料建立之前，因此現在修正的成本最低。

## 測試結果

### Commands

- `npm run typecheck`：通過
- `npm run lint`：通過
- `npm test`：21/21 通過
- `npm run build`：通過

### Contract Audit

- Domain Model 數量：31
- Type/Schema property mismatch：0
- Type/Schema required/optional mismatch：0
- Circular runtime dependency：0
- `periodStart` / `periodEnd` stale reference：0
- Global Build Slot hardcode：0

### 新增回歸測試

- 真正的 `weekStart/weekEnd` 反向日期
- Snapshot immutable
- Series-neutral Canonical Entity ID
- Legacy/model name 不可作 Canonical ID
- 未來自訂 Build Slot
- required/exclusive Slot consistency
- Date、Map、Set、Class Instance、cyclic JSON
- impossible date-time 與 missing timezone
- explicit optional `undefined`
- 完整 Evidence 六維分數
- Evidence dimension 缺漏、超界與未知欄位
- Risk Code 合法值
- Recommendation reasons 與 factors
- Mapping resolution 正反向一致性
- rounded source win rate 原樣保留
- 獨立手寫且通過 TypeScript `satisfies` 的 Domain fixtures

## 是否仍有已知限制

有，以下限制刻意留在後續正確層級，未在 Phase 1.5 越界實作：

1. Canonical ID 與現有資料的實際 mapping table 尚未建立；這屬於
   Migration 階段。本次只完成安全契約與 legacy mapping 入口。
2. Raw Evidence append-only、Snapshot 不覆蓋與 Transaction 必須由未來
   Repository/Database 層保證，單筆物件 Validation 無法保證。
3. verified-only scoring、Evidence deduplication、單一 primary target、
   sample count、E-only、strong_up、maturity、avoid 與 synergy 規則需要跨
   Record 或 Engine context，沒有放入單筆 Domain Validator。
4. `StockConfiguration.componentEntityIds` 仍是 flat canonical ID list；
   CX 的 canonical slot mapping 需在正式 Migration 設計前再次確認。
5. `CounterRelationship` 的 source/target exclusivity 目前由 Runtime
   Validation 保證，TypeScript shape 仍保留 optional foreign keys。
6. 自訂 Schema DSL 與 Type 仍是兩份宣告；本次透過獨立 typed fixture 與
   Compiler API audit 降低 drift 風險，但尚未改為 schema inference。

這些限制不代表已開始 Phase 2，也沒有在本次加入 Repository、Engine 或
Migration 行為。

## 是否建議重新進行 Phase 1 Review

**建議。**

本次已修正 `PHASE1_REVIEW.md` 中所有 Phase 1 阻擋項目及可在單筆 Domain
Validation 正確處理的 Business Rules。進入 Phase 2 前，應進行一次聚焦的
Phase 1 Re-Review，確認：

- Canonical identity 契約可接受。
- CX component/slot mapping 的已知限制有明確後續位置。
- 新增 Union 值符合預期 workflow。
- Type、Schema、Validation 與 21 項測試一致。

本次工作到此停止，未開始 Phase 2。
