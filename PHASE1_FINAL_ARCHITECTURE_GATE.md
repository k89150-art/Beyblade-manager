# Phase 1 Final Architecture Gate

審查日期：2026-07-29

## 0. 審查範圍與版本狀態

本次沒有修改 Domain、測試、UI、API、Database 或任何既有功能，只新增本報告。

目前可寫入的主要工作區：

- 路徑：`C:\Users\阿傑\OneDrive\文件\戰鬥陀螺管理器`
- Git HEAD：`bb3c5a76237ae34c1f13fd8fcc4fe1998fd52962`
- 此工作區目前沒有 `src/meta/domain`、`tests/meta-domain`、
  `PHASE1_FINAL_REVIEW.md` 或 `PHASE1_EXTENSIBILITY_FIX_REPORT.md`

實際可供審查的最新 Phase 1.6 Domain Layer 位於：

- 路徑：
  `C:\Users\阿傑\Documents\Codex\2026-06-21\prior-conversation-with-codex-conversation-role\work\ui-mockup-audit-20260715`
- Git HEAD：`3427d3dcf484e0172a485dcd06db7c97a448d1a4`
- Phase 1 Domain、測試、套件設定及相關報告皆為未追蹤檔案

因此，本報告同時審查：

1. Phase 1.6 Domain 實作本身的架構品質。
2. 該契約是否已存在於目前專案內，並具備可凍結、可追溯的版本基準。

## 1. Review Summary

Phase 1.6 已正確完成三個原始 Blocker 的主要資料結構：

- Entity 使用 `entityTypeId` 與 `entityTypeVersion`，Entity Type 可由
  `EntityTypeDefinition` 動態註冊。
- 已建立單一 `AnalysisModelRegistry`，模型可綁定版本化輸入與輸出
  Schema。
- `StockConfiguration.entries` 明確保存 `slotId`、`entityId` 與選用的
  `position`。
- Build System、Entity Type、Analysis Model 都使用版本化 Registry。
- Stock 驗證不依賴陣列順序、零件名稱、產品名稱或系列名稱推測 Slot。
- Runtime Validation 維持 JSON-safe 邊界，且 Type／Schema 的 33 個模型
  欄位一致。
- Domain Layer 未包含 Evidence、Confidence、Trend、Maturity、Risk、
  Recommendation 或 Coach 分析演算法。

但是，本次獨立 Gate 找到 5 個 Blocker：

1. 最新 Domain Layer 尚未進入目前專案，也沒有可追溯的 Git 基準。
2. `MetaProfile` 仍以固定欄位封閉列舉分析類型，動態模型無法完整接入。
3. Registry 保存並回傳呼叫端物件參照，註冊後可被靜默改寫。
4. Build System 可註冊互相矛盾、永遠無法成立的必填／互斥 Slot。
5. Legacy migration 的錯誤沒有指出缺少、額外或重複的 Entity 與位置。

Gate 結論：

- Architecture Score：**70 / 100**
- Domain Stability：**C**
- 凍結 Domain Contract：**否**
- 核准進入 Phase 2：**否**

## 2. 三個原 Blocker 的逐項驗證

### 2.1 開放式 Entity Type

主要位置：

- `src/meta/domain/types.ts:58`
- `src/meta/domain/types.ts:73`
- `src/meta/domain/registry.ts:58`
- `src/meta/domain/validation.ts:1018`

通過：

- `CatalogEntity` 保存 `id`、`entityTypeId`、`entityTypeVersion`。
- `EntityTypeDefinition` 包含 Type ID、顯示名稱、分類、支援系列、
  Attributes Schema、Lifecycle 與版本。
- 新 Type 可只透過註冊 Definition 建立，不需修改封閉 Union。
- 未註冊、停用與版本不相容 Type 會得到明確錯誤。
- 核心 TypeScript 沒有 BX、UX、CX、BXG、BXH 分支。
- 完全重複的 Type ID／Version 註冊會被拒絕。

未通過：

- `EntityTypeRegistry.register()` 在
  `src/meta/domain/registry.ts:85` 保存呼叫端原始物件參照。
- 註冊後把原物件 `lifecycleStatus` 從 `active` 改成 `inactive`，
  Registry 解析結果立即跟著改變，沒有重新註冊或驗證。

結論：擴充形式已建立，但 Registry 契約尚不具備不可變性。

### 2.2 可擴充 Analysis Model Registry

主要位置：

- `src/meta/domain/types.ts:259`
- `src/meta/domain/registry.ts:117`
- `src/meta/domain/registry.ts:163`
- `src/meta/domain/registry.ts:268`
- `src/meta/domain/types.ts:363`
- `src/meta/domain/schema.ts:774`
- `src/meta/domain/validation.ts:922`

通過：

- 專案內只有一個 `AnalysisModelRegistry` 實作。
- 新模型可註冊 Definition 與版本化 Input／Output Schema。
- Model 在 Schema 尚未註冊時會 fail-fast。
- 重複 Model／Schema 註冊會被拒絕。
- 未知、停用、版本不相容模型有獨立錯誤碼。
- Registry 僅處理契約解析與 Validation，沒有分析演算法。
- 沒有 `ANALYSIS_OUTPUT_TYPES`、`AnalysisOutputType` 或模型分派 switch。

未通過：

- `MetaProfile` 仍固定保存：
  `evidenceAnalysisId`、`confidenceAnalysisId`、`trendAnalysisId`、
  `maturityAnalysisId`、`riskAnalysisId`、`recommendationAnalysisId`、
  `coachAnalysisId`。
- `profileHasAnalysis` 也硬編碼相同七個欄位。
- 對抗測試註冊自訂模型後，`customAnalysisId` 仍被 MetaProfile Schema
  以 `unknown_field` 拒絕，並同時回傳 `empty_meta_profile`。
- `registerSchema()` 與 `registerModel()` 分別在
  `src/meta/domain/registry.ts:160`、`:227` 保存呼叫端原始物件參照。
  註冊後把輸出 Schema 上限從 100 改成 1000，原本被拒絕的 999
  立即變成合法；模型 Lifecycle 也可用相同方式被靜默改寫。

結論：模型驗證入口是開放式，但 Profile 聚合契約及 Registry
不可變性仍未完成，尚未達到端到端擴充。

### 2.3 StockConfiguration 與 Build System

主要位置：

- `src/meta/domain/types.ts:107`
- `src/meta/domain/types.ts:122`
- `src/meta/domain/types.ts:147`
- `src/meta/domain/validation.ts:725`
- `src/meta/domain/validation.ts:740`
- `src/meta/domain/validation.ts:1122`

通過：

- 每個 Stock Entity 都明確保存 `slotId`。
- 多件 Slot 使用 `position`；單件 Slot 禁止 `position`。
- 驗證涵蓋未知 Slot、必填數量、最大數量、重複 Position、
  重複 Entity、Entity Type 相容性、Build System Lifecycle 與精確版本。
- 可表示傳統三件式、一體式、複合式與未來多層系統。
- Build System Slot 由 Definition 動態建立。
- 沒有從系列、名稱或陣列位置推測 Slot。

未通過：

- `buildSystemSlotConsistency` 只檢查 Slot 是否存在、是否重複及
  Exclusive Group 是否重複引用。
- 一個 Exclusive Group 內可同時有兩個 `minimumEntries: 1` 的 Slot。
- 對抗測試證實 `BuildSystemRegistry.register()` 接受此 Definition；
  但任何 Stock Configuration 都必須同時填滿兩個 Slot，又會因互斥規則
  失敗，形成永遠無解的 Build System。
- `BuildSystemRegistry` 與 `CatalogEntityRegistry` 也分別在
  `src/meta/domain/registry.ts:359`、`:413` 保存可變原始參照。

結論：Stock 實例驗證完整度高，但 Definition 本身仍可註冊矛盾契約。

## 3. Remaining Blockers

### Blocker 1：目前專案沒有可凍結的 Domain 版本

失敗情境：

- 目前主要工作區找不到 Domain Source、Tests、Package Scripts 與前兩份
  Review 報告。
- 可審查的 Phase 1.6 檔案全部位於另一個工作樹且未被 Git 追蹤。
- Phase 2 若從目前專案開始，沒有可匯入或可追溯的 Frozen Contract。

最小修正：

- 在另一次明確授權的工作中，把經確認的 Phase 1 檔案納入目前工作區。
- 建立單一 Git 存檔點，記錄 Domain、Schema、Registry、Tests 與報告。
- 從該 Commit 重新執行 Architecture Gate。

### Blocker 2：MetaProfile 仍封閉分析模型

精確位置：

- `src/meta/domain/types.ts:363-373`
- `src/meta/domain/schema.ts:774-789`
- `src/meta/domain/validation.ts:922-940`

最小修正：

- 建立通用 Analysis Reference，例如
  `modelId`、`modelVersion`、`analysisId` 的陣列。
- 由 `AnalysisModelRegistry` 驗證 Model 與版本。
- 為現有七個固定欄位定義明確遷移規格；不得用欄位名稱推測模型。

### Blocker 3：Registry 可在註冊後被外部靜默改寫

精確位置：

- `src/meta/domain/registry.ts:85`
- `src/meta/domain/registry.ts:160`
- `src/meta/domain/registry.ts:227`
- `src/meta/domain/registry.ts:359`
- `src/meta/domain/registry.ts:413`

失敗情境：

- 已註冊 Schema 的 `maximum` 可由呼叫端改寫，直接放寬 Runtime
  Validation。
- 已註冊 Entity Type／Model 的 Lifecycle 可在不重新驗證下改變。
- `resolve()`／`get()` 回傳相同物件，也可成為反向改寫入口。

最小修正：

- Registry 註冊時建立經驗證的不可變 Snapshot。
- 對巢狀 Schema、Slot、陣列與 Attributes 做結構化複製及 deep-freeze。
- 解析時不得暴露 Registry 內部可變參照。

### Blocker 4：Build System Definition 可形成無解契約

精確位置：

- `src/meta/domain/validation.ts:725-792`

失敗情境：

- 同一 Exclusive Group 內兩個以上 Slot 都要求
  `minimumEntries > 0`，Definition 仍通過。
- 後續任何 Stock Configuration 都不可能同時滿足 Required 與
  Exclusive 規則。

最小修正：

- 在 Build System Definition refinement 拒絕同一互斥群組內多個
  Required Slot。
- 回傳指向該 Group 與衝突 Slot ID 的明確錯誤。

### Blocker 5：Migration Error 不足以直接修正資料

精確位置：

- `src/meta/domain/stock-configuration-migration.ts:74-95`

失敗情境：

- 缺少 Legacy Entity、加入額外 Entity、或 Entries 重複 Entity，
  都只回傳相同的 `incomplete_slot_assignment`。
- Path 只指向整個 `entries`，訊息沒有缺少的 Entity ID、額外 ID 或
  重複 Entry index。

最小修正：

- 分別回傳 missing、unexpected、duplicate assignment 錯誤。
- 錯誤需包含 Legacy index 或 Entry index、Entity ID、原因與明確修正方式。
- 維持「無法判斷 Slot 時立即失敗」，不得加入自動猜測。

## 4. Non-blocking Risks

1. `supportedEntityTypes` 與 Build Slot 的 `allowedEntityTypeIds` 在 Definition
   註冊時不會交叉檢查 Entity Type Registry；拼字錯誤會延後到使用時才發現。
2. Version 相容性目前只有 exact match，尚無 SemVer 相容範圍。
3. `validateDomainModel()` 在完整 Schema 與 refinement 通過後使用一次受控
   型別斷言回傳泛型資料；目前 Type／Schema audit 支撐此斷言，但日後欄位
   變更仍必須持續執行 audit。
4. `TREND_WINDOWS.includes()` 有一次受限於常數 Tuple 的窄化斷言，未形成
   任意資料繞過。
5. Migration function 參數是 TypeScript 型別，而不是直接接收 `unknown`；
   未來 API／Repository 邊界仍需先驗證 migration request。
6. JSON cycle 檢查在深層物件會重建 ancestor Set，可能造成不必要配置成本。

## 5. Contract Consistency

| 檢查 | 結果 |
| --- | --- |
| Domain Model 數量 | 33 |
| Type／Schema 欄位差異 | 0 |
| Required／Optional 差異 | 0 |
| 封閉 Entity Type Union | 未發現 |
| 分散 Analysis Registry | 未發現第二套 Registry |
| 核心系列名稱硬編碼 | 可執行 Domain TS 未發現 |
| Slot 順序／名稱推測 | 未發現 |
| `any` | 未發現 |
| `ts-ignore`／`ts-nocheck` | 未發現 |
| `eslint-disable` | 未發現 |
| `as any`／`as unknown` | 未發現 |
| JSON 非法物件 | Date、Map、Set、Class、Cycle 等測試均拒絕 |
| Canonical Entity ID | 系列中立 `ent_<uuid>`，Runtime 驗證正常 |

## 6. Migration Safety

通過：

- 沒有 Entries 時回傳 `slot_assignment_required`。
- 不依賴順序、名稱或系列猜測 Slot。
- Legacy Entity 必須與 Entries 一對一。
- 遷移後再次執行完整 Stock Context Validation。
- 原始 `componentEntityIds` 保留在 `legacyData` 供稽核。

未通過：

- 錯誤診斷粒度不足，無法直接定位缺少、額外或重複的 Entry。

## 7. Phase 2 Readiness

| Engine | Domain 欄位準備度 | Gate 判定 |
| --- | --- | --- |
| Evidence Engine | 六維分數、來源、Target、Reason、Rule、Run 已具備 | 結構可用 |
| Confidence Engine | Score、Cap、Reasons、Inputs 已具備 | 結構可用 |
| Trend Engine | 4／8／12 週、狀態、分數、Target 已具備 | 結構可用 |
| Maturity Engine | 階段、分數、Reasons、Inputs 已具備 | 結構可用 |
| Risk Engine | 合法 Risk Code、Level、Reasons、Inputs 已具備 | 結構可用 |
| Recommendation Engine | Verdict、Score、Factors、Reasons、Inputs 已具備 | 結構可用 |
| Meta Coach | Headline、Verdict、Factors、Advice、Trace 已具備 | 結構可用 |

七個既定 Engine 的資料模型足夠開始設計，但共用的 Analysis Reference
仍封閉、Registry 仍可被突變，而且目前專案沒有正式 Domain 基準。
因此整體 Phase 2 Readiness 判定仍為不通過。

## 8. 驗證指令與結果

在 Phase 1.6 審查工作樹執行：

```text
npm run typecheck  PASS
npm run lint       PASS
npm test           PASS - 33 passed, 0 failed
npm run build      PASS
```

額外稽核：

```text
Type/Schema AST audit:
33 models, 0 field mismatch, 0 required mismatch

Closed Entity Type scan:
0 result

Analysis Registry scan:
1 implementation; no closed analysis output union

Core series literal scan:
0 executable Domain result

Slot inference scan:
0 implementation result

Unsafe suppression scan:
0 any, 0 ts-ignore, 0 ts-nocheck, 0 eslint-disable
```

對抗性 Runtime Probe：

```text
duplicate Entity Type registration: rejected
duplicate Analysis Model registration: rejected
Model registered before its Schemas: rejected
post-registration Entity lifecycle mutation: registry changed (FAIL)
post-registration Model lifecycle mutation: registry changed (FAIL)
post-registration Schema limit mutation: rejected 999 became accepted (FAIL)
required Slots inside one exclusive group: definition accepted (FAIL)
custom model reference in MetaProfile: unknown_field (FAIL)
```

## 9. Final Decision

Phase 1.6 解決了原始三個 Blocker 的主要資料形狀，但尚未形成可安全凍結的
端到端契約。尤其 Registry 可被註冊後突變、MetaProfile 仍封閉列舉模型，
以及 Build System 可註冊永遠無解的定義，會直接影響所有 Phase 2 Engine
的輸入可信度。

本次不凍結 Domain Contract，也不核准進入 Phase 2。

建議下一步是一次範圍嚴格受限的 Gate Fix，只修正本報告 5 個 Blocker，
完成後把 Domain 納入目前專案的 Git 存檔點，再重新執行 Final
Architecture Gate。
