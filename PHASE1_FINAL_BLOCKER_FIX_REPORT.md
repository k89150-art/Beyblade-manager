# Phase 1.7 Final Blocker Fix Report

日期：2026-07-29

範圍：只修正 `PHASE1_FINAL_ARCHITECTURE_GATE.md` 列出的 5 個
Blocker。沒有開始 Phase 2，沒有新增 Engine、UI、API、Database、
Firebase 或現有網站整合。

## 1. 五個 Blocker 的修正方式

### Blocker 1：Registry Definition 不可變性

`EntityTypeRegistry`、`AnalysisModelRegistry`、`BuildSystemRegistry` 與
`CatalogEntityRegistry` 現在：

- 先執行完整 Runtime Validation。
- 使用 `structuredClone()` 建立與呼叫端分離的 Snapshot。
- 遞迴凍結 Snapshot 的所有巢狀陣列、物件、Schema 與 Slot。
- 不使用 JSON stringify/parse 複製。
- `resolve()`、`get()`、`list()` 只暴露已深層凍結的資料。
- `list()` 回傳的容器陣列本身也會凍結。
- 相同 ID／Version 重複註冊會回傳明確錯誤。
- `seal()` 後永久拒絕所有後續註冊。

測試證明：

- 修改原始 Entity Type、Model、Schema、Build Slot 或 Entity 不影響 Registry。
- 修改讀取結果會失敗，也不影響 Registry。
- 巢狀 Schema 與 Slot 陣列均已凍結。
- 所有 Registry 的重複註冊與 seal 後註冊均被拒絕。

### Blocker 2：MetaProfile 動態分析模型

移除以下固定欄位：

- `evidenceAnalysisId`
- `confidenceAnalysisId`
- `trendAnalysisId`
- `maturityAnalysisId`
- `riskAnalysisId`
- `recommendationAnalysisId`
- `coachAnalysisId`

新契約使用 `MetaProfile.analysisResults[]`。每筆結果包含：

```text
modelId
modelVersion
generatedAt
output
reasonCodes
sourceSnapshotId
```

Context Validation 會：

- 用 `AnalysisModelRegistry` 解析 Model ID 與 Version。
- 拒絕未知、停用與版本不相容模型。
- 使用該 Model 註冊的 Output Schema 驗證 `output`。
- 確認 Reason Code 使用 Model 的 Namespace。
- 拒絕相同 Model ID／Version 的重複結果。
- 維持 `output` 為經驗證的 JSON Serializable 資料。

新增模型不需要修改 MetaProfile Type、Schema 或 Validator。

### Blocker 3：Build System 結構可解性

`BuildSlotDefinition` 保留 `allowedEntityTypeIds`，並新增：

```text
allowedEntityTypeVersions
```

每個允許的 Entity Type 都必須有明確版本。`BuildSystemRegistry` 現在要求
建構時傳入 `EntityTypeRegistry`，並在註冊時檢查：

- Slot ID 不重複。
- `minimumEntries` 與 `maximumEntries` 合法。
- 允許的 Entity Type 清單非空。
- Type ID 與 Version Map 完全一致。
- 指定 Entity Type 已註冊、啟用且版本相容。
- Exclusive Group 只引用已宣告 Slot。
- Slot 不會重複出現在不同 Exclusive Group。
- 同一 Exclusive Group 不可有兩個以上 Required Slot。

目前 Slot 的 Position Policy 由 Cardinality 唯一決定：

- `maximumEntries === 1`：禁止 `position`。
- `maximumEntries === null` 或大於 1：要求 `position`。

現有 Definition 沒有額外 Dependency DSL；在目前可表達的規則下，只要
Required Slot 不互斥、Cardinality 合法且 Type 可用，即存在理論合法配置。

### Blocker 4：Migration Error 完整化

新增 `StockConfigurationMigrationIssue`。每個錯誤固定包含：

```text
code
message
sourcePath
sourceIndex
entityId
buildSystemId
buildSystemVersion
candidateSlotIds
reason
suggestedAction
```

不適用的 Index 或 Entity 使用 JSON-safe `null`，不會使用 `undefined`、
Date、Map、Set 或 Class Instance。

Migration 會一次收集所有可判斷錯誤，並區分：

- Build System 未知、停用、版本不相容。
- Legacy Entity 未註冊。
- Entity Type 未註冊、停用、版本不相容。
- 找不到候選 Slot。
- 存在多個候選 Slot。
- 缺少 Assignment。
- 重複 Assignment。
- 額外 Assignment。
- Explicit Slot 不相容。
- Legacy Entity 重複。

`candidateSlotIds` 只提供管理者診斷，不會自動選擇。任何錯誤都會讓整筆
Migration 失敗，不會部分成功或遺失元件。成功後仍會執行完整
StockConfiguration Validation，並把舊 `componentEntityIds` 保存在
`legacyData` 供稽核。

### Blocker 5：納入目前 Git 工作區

確認的 Git Repository Root：

```text
C:/Users/阿傑/OneDrive/文件/戰鬥陀螺管理器
```

Phase 1 至 Phase 1.7 的 Domain、Schema、Validator、Registry、Migration、
Tests、文件與工具設定已放入此根目錄。

先前的 Phase 1.6 工作樹仍存在於：

```text
C:\Users\阿傑\Documents\Codex\2026-06-21\
prior-conversation-with-codex-conversation-role\
work\ui-mockup-audit-20260715
```

它是歷史副本，不是目前 Repository Root。本次沒有刪除或修改該副本。

## 2. 修改與新增檔案

Domain：

- `src/meta/domain/enums.ts`
- `src/meta/domain/index.ts`
- `src/meta/domain/README.md`
- `src/meta/domain/registry.ts`
- `src/meta/domain/schema-types.ts`
- `src/meta/domain/schema.ts`
- `src/meta/domain/stock-configuration-migration.ts`
- `src/meta/domain/types.ts`
- `src/meta/domain/validation.ts`

測試：

- `tests/meta-domain/domain-validation.test.ts`

工具與設定：

- `.gitignore`
- `eslint.config.js`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `tsconfig.test.json`

Phase 文件：

- `PHASE1_REVIEW.md`
- `PHASE1_FIX_REPORT.md`
- `PHASE1_FINAL_REVIEW.md`
- `PHASE1_EXTENSIBILITY_FIX_REPORT.md`
- `PHASE1_FINAL_ARCHITECTURE_GATE.md`
- `PHASE1_FINAL_BLOCKER_FIX_REPORT.md`

## 3. Registry 不可變策略

流程：

```text
Input
 -> Runtime Validation
 -> structuredClone
 -> recursive deepFreeze
 -> Registry Map
 -> frozen resolve/get/list result
```

`deepFreeze` 使用 WeakSet 防止重複走訪，不依賴 JSON 序列化。Registry
內部 Map 不會暴露；Version List 與 List Container 也會凍結。

## 4. MetaProfile 新契約

MetaProfile 本身只知道「一組版本化模型結果」，不再知道 Evidence、
Confidence、Trend 或其他模型名稱。每筆 Output 都由對應的
AnalysisModelDefinition 選擇 Output Schema。

這讓未來新增模型只需要：

1. 註冊 Input Schema。
2. 註冊 Output Schema。
3. 註冊 AnalysisModelDefinition。
4. 寫入符合該 Model Output Schema 的 Profile Result。

不需要修改 MetaProfile 核心契約。

## 5. Build System 可解性規則

目前可解性條件：

1. 至少一個 Slot。
2. Slot ID 唯一。
3. 每個 Slot 至少允許一個明確 Type ID／Version。
4. 每個 Type ID／Version 已註冊且啟用。
5. `minimumEntries >= 0`。
6. 有限 `maximumEntries >= 1`。
7. `maximumEntries >= minimumEntries`。
8. Exclusive Group 只引用已宣告 Slot。
9. 一個 Slot 只屬於一個 Exclusive Group。
10. 一個 Exclusive Group 最多一個 Required Slot。
11. Position Policy 與單值／多值 Cardinality 一致。

規則不包含任何 BX、UX、CX、BXG、BXH 或產品名稱分支。

## 6. Migration Error 範例

```json
{
  "path": "LegacyStockConfigurationMigrationRequest.entries",
  "code": "ambiguous_candidate_slots",
  "message": "Entity 'ent_...' matches multiple candidate Slots.",
  "sourcePath": "LegacyStockConfigurationDraft.componentEntityIds[0]",
  "sourceIndex": 0,
  "entityId": "ent_...",
  "buildSystemId": "future-system",
  "buildSystemVersion": "1.0.0",
  "candidateSlotIds": ["upper-a", "upper-b"],
  "reason": "More than one Slot accepts the Entity Type and version.",
  "suggestedAction": "Choose one candidate Slot explicitly and provide it in entries."
}
```

## 7. Git 工作區狀態

`.gitignore` 排除：

- `node_modules/`
- `dist/`
- `.phase1-test/`
- `coverage/`
- TypeScript build info
- Logs、暫存檔、Swap、Backup
- VS Code／JetBrains 個人設定
- 常見 OneDrive conflict-copy 檔名

最終 Git 狀態：

```text
staged:   23 files
unstaged: 0 files
untracked: 0 files
ignored:  .phase1-test/, dist/, node_modules/
```

Staged 內容只有 Phase 1 至 Phase 1.7 的 Domain、測試、文件與工具設定。
沒有執行 commit、push、reset、clean 或 rebase。

## 8. Breaking Changes

Phase 1 Domain 尚未接入正式網站，因此以下變更不影響現有使用者功能：

- `MetaProfile` 固定 Analysis ID 欄位改為 `analysisResults[]`。
- `BuildSlotDefinition` 新增 `allowedEntityTypeVersions`。
- `BuildSystemRegistry` 建構時必須傳入 Entity Type Registry。
- Migration Failure 使用完整 `StockConfigurationMigrationIssue`。
- Registry 回傳內容為深層不可變 Snapshot。
- Registry 可透過 `seal()` 結束初始化。
- Package Version 更新為 `2.0.0-phase1.7`。

## 9. 測試與建置結果

```text
npm run typecheck  PASS
npm run lint       PASS
npm test           PASS - 38 passed, 0 failed
npm run build      PASS
```

Type／Schema Audit：

```text
Top-level Domain Models: 33
Top-level field mismatches: 0
MetaProfileAnalysisResult nested field mismatches: 0
```

靜態搜尋：

```text
Closed Analysis Model fields: 0
Raw mutable Registry storage: 0
Record<string, any>: 0
Unvalidated arbitrary model output: 0
any / ts-ignore / ts-nocheck / eslint-disable: 0
Hardcoded BX / UX / CX / BXG / BXH in Domain TS: 0
Slot inference implementation: 0
```

## 10. 已知限制

1. Registry 為記憶體內 Domain 元件；Persistence 屬於未來獨立階段。
2. Version Compatibility 仍採 Exact Match，尚未加入 SemVer Range。
3. Build System 尚未定義通用 Dependency／Conditional Slot DSL；未來若規格
   新增此類規則，必須同時加入 Definition-level satisfiability validation。
4. `structuredClone` 需要 ES2022 相容 Runtime。
5. Migration 只建立純函式契約，沒有執行正式 Database Migration。
6. `validateDomainModel` 在 Schema 與所有 Refinement 通過後使用一個受控
   泛型型別窄化；Type／Schema Audit 必須持續作為 Gate。
7. 舊 Phase 1.6 工作樹仍保留，避免在未授權下刪除使用者檔案。

## 11. Final Architecture Gate 建議

建議再次執行 Final Architecture Gate。

下一次 Gate 應以目前 Git 工作區的 staged Phase 1.7 檔案為唯一基準，
重新驗證 Registry 不可變性、MetaProfile 動態模型、Build System 可解性、
Migration 診斷與 Git 可追溯性。Phase 2 尚未開始。
