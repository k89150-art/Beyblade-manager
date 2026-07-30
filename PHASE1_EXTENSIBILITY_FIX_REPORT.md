# Phase 1.6 Domain Extensibility Fix Report

Date: 2026-07-29

Scope: only the three blockers identified by `PHASE1_FINAL_REVIEW.md`.
No Engine, API, UI, Database Migration, Firebase, localStorage, or website
feature was added or modified.

## 1. 三個 Blocker 的修正方式

### Blocker 1：開放式 Entity Type

The closed `ENTITY_TYPES` array and `EntityType` union were removed.

`CatalogEntity` now stores:

- `id: CanonicalEntityId`
- `entityTypeId: string`
- `entityTypeVersion: string`

The new `EntityTypeDefinition` stores:

- `typeId`
- `displayName`
- `category`
- `supportedSeries`
- `attributesSchema`
- `lifecycleStatus`
- `version`

`EntityTypeRegistry` is version-aware. A new part kind is introduced by
registering a new Definition; the core Type, Schema, and Validator do not
change.

Catalog validation is contextual and rejects:

- missing Registry context;
- unknown `entityTypeId`;
- inactive definitions;
- incompatible versions;
- unsupported Series;
- attributes that do not satisfy the registered `attributesSchema`.

The core entity contract contains no BX, UX, CX, BXG, or BXH branch.

### Blocker 2：可擴充 Analysis Model Registry

The closed `ANALYSIS_OUTPUT_TYPES` and `AnalysisOutputType` contract were
removed.

The new `AnalysisModelDefinition` stores:

- `modelId`
- `version`
- `inputSchemaId`
- `inputSchemaVersion`
- `outputSchemaId`
- `outputSchemaVersion`
- `supportedEntityTypes`
- `lifecycleStatus`
- `reasonCodeNamespace`

`AnalysisModelRegistry` is the single extension point for:

- versioned input Schemas;
- versioned output Schemas;
- Analysis Model Definitions;
- model lookup;
- input validation;
- output validation.

`AnalysisTrace` now references `modelId` and `modelVersion`.

The Registry rejects:

- duplicate Schemas or Models;
- a Model that references an unregistered Schema;
- unknown Models;
- inactive Models;
- incompatible Model versions;
- values that do not satisfy the selected input/output Schema.

The Registry contains no analysis algorithm. Existing Evidence, Confidence,
Trend, Maturity, Risk, Recommendation, and Coach output Types remain available
for the current core contract, but a new external model no longer needs to be
added to `DomainModelMap`, `DOMAIN_MODEL_NAMES`, or `DOMAIN_SCHEMAS`.

### Blocker 3：保存動態 Slot 的 StockConfiguration

`StockConfiguration.componentEntityIds` was replaced by:

```ts
interface StockConfigurationEntry {
  readonly slotId: string;
  readonly entityId: CanonicalEntityId;
  readonly position?: number;
}
```

`StockConfiguration` now stores:

- `buildSystemId`
- `buildSystemVersion`
- `entries`

`BuildSystemDefinition` now owns an explicit list of Slot definitions:

```ts
interface BuildSlotDefinition {
  readonly slotId: string;
  readonly displayName: string;
  readonly allowedEntityTypeIds: readonly string[];
  readonly minimumEntries: number;
  readonly maximumEntries: number | null;
}
```

The Validator obtains all behavior from the selected Build System version. It
checks:

- Build System existence, lifecycle, and exact version;
- declared Slot IDs;
- required Slot counts through `minimumEntries`;
- maximum Slot counts through `maximumEntries`;
- Entity existence;
- registered Entity Type and version;
- Entity Type compatibility with the Slot;
- duplicate Entity use;
- `position` required for multi-entry Slots;
- `position` forbidden for single-entry Slots;
- duplicate positions within one Slot;
- exclusive Slot groups.

No Slot is inferred from array order, Entity name, Product name, or Series name.

## 2. 新增與修改檔案

### Added

- `src/meta/domain/schema-types.ts`
- `src/meta/domain/registry.ts`
- `src/meta/domain/stock-configuration-migration.ts`
- `PHASE1_EXTENSIBILITY_FIX_REPORT.md`

### Modified

- `src/meta/domain/enums.ts`
- `src/meta/domain/types.ts`
- `src/meta/domain/schema.ts`
- `src/meta/domain/validation.ts`
- `src/meta/domain/index.ts`
- `src/meta/domain/README.md`
- `tests/meta-domain/domain-validation.test.ts`

No production website, HTML, CSS, Firebase, localStorage, API, or Database file
was changed.

## 3. Breaking Changes

This Phase intentionally changes the additive V2 Domain contract before it is
frozen.

### CatalogEntity

- Removed: `entityType`
- Added: `entityTypeId`
- Added: `entityTypeVersion`

### EntityMappingTask

- Renamed: `entityTypeGuess` to `entityTypeIdGuess`

### StockConfiguration

- Removed: `componentEntityIds`
- Added: `buildSystemVersion`
- Added: `entries`

### BuildSystemDefinition

- Removed: `allowedSlots`
- Removed: `requiredSlots`
- Added: `slots`
- Required status is represented by `minimumEntries > 0`.
- Single/multiple behavior is represented by `maximumEntries`.

### AnalysisTrace

- Removed: `outputType`
- Added: `modelId`
- Added: `modelVersion`

### Domain inventory

- Added: `EntityTypeDefinition`
- Added: `AnalysisModelDefinition`
- Model count changed from 31 to 33.

These changes do not break the current website because the Phase 1 Domain Layer
is still isolated from the existing browser application.

## 4. Migration Strategy

`migrateLegacyStockConfigurationDraft()` provides a pure Domain migration
boundary. It does not write to a Database.

Migration requires:

1. the legacy flat draft;
2. an explicit `buildSystemVersion`;
3. explicit Slot assignments in `entries`;
4. Entity, Entity Type, and Build System registries.

The function never uses legacy array order or names to infer Slots.

It returns:

- `slot_assignment_required` when assignments are absent;
- `incomplete_slot_assignment` when an Entity is missing, repeated, or added;
- `duplicate_legacy_component` for duplicate legacy IDs;
- normal Stock validation issues for an illegal Slot, incompatible Entity
  Type, invalid cardinality, duplicate position, or version mismatch.

Only after a complete one-to-one assignment passes does the function return a
new `StockConfiguration`. The original flat IDs are retained inside
`legacyData.componentEntityIds` for auditability.

## 5. Registry 擴充範例

### Entity Type

```ts
const entityTypes = new EntityTypeRegistry();

entityTypes.register({
  typeId: "future_multi_layer",
  displayName: "Future Multi Layer",
  category: "upper",
  supportedSeries: ["future-series"],
  attributesSchema: {
    kind: "object",
    properties: {
      layerCount: {
        kind: "number",
        minimum: 1,
        integer: true
      }
    },
    required: ["layerCount"],
    additionalProperties: false,
    refinements: []
  },
  lifecycleStatus: "active",
  version: "1.0.0"
});
```

No core Entity Type union or Schema is edited.

### Analysis Model

```ts
const models = new AnalysisModelRegistry();

models.registerSchema("custom-input", "1.0.0", inputSchema);
models.registerSchema("custom-output", "1.0.0", outputSchema);

models.registerModel({
  modelId: "custom-analysis",
  version: "1.0.0",
  inputSchemaId: "custom-input",
  inputSchemaVersion: "1.0.0",
  outputSchemaId: "custom-output",
  outputSchemaVersion: "1.0.0",
  supportedEntityTypes: ["future_multi_layer"],
  lifecycleStatus: "active",
  reasonCodeNamespace: "custom.analysis"
});

const result = models.validateOutput(
  "custom-analysis",
  "1.0.0",
  outputValue
);
```

No Engine algorithm or core Analysis output switch is added.

## 6. Build System 擴充範例

```ts
const futureStackSystem = {
  id: "future-stack-system",
  name: "Future Stack System",
  seriesIds: ["future-series"],
  slots: [
    {
      slotId: "stack",
      displayName: "Layer Stack",
      allowedEntityTypeIds: ["future_multi_layer"],
      minimumEntries: 2,
      maximumEntries: null
    },
    {
      slotId: "control",
      displayName: "Control",
      allowedEntityTypeIds: ["future_control"],
      minimumEntries: 1,
      maximumEntries: 1
    }
  ],
  exclusiveSlotGroups: [],
  active: true,
  version: "1.0.0",
  createdAt: timestamp,
  updatedAt: timestamp
};
```

The corresponding Stock Configuration stores every layer explicitly:

```ts
{
  buildSystemId: "future-stack-system",
  buildSystemVersion: "1.0.0",
  entries: [
    { slotId: "stack", entityId: layerAId, position: 0 },
    { slotId: "stack", entityId: layerBId, position: 1 },
    { slotId: "control", entityId: controlId }
  ]
}
```

Traditional three-part, integrated-body, compound multi-part, and future
multi-layer structures use the same contract and Validator.

## 7. 測試結果

All required commands passed:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

Test result:

- 33 tests
- 33 passed
- 0 failed

Coverage added for:

- dynamic Entity Type registration;
- unknown Entity Type rejection;
- inactive Entity Type rejection;
- incompatible Entity Type version;
- registered Entity attribute Schema;
- dynamic Analysis Model registration;
- Model-selected input and output Schema;
- unknown, inactive, and incompatible Analysis Models;
- required Slots;
- Entity Type and Slot incompatibility;
- compound multi-part stock structure;
- integrated stock structure;
- future multi-entry Build System;
- illegal Slots;
- duplicate Entity use;
- duplicate positions;
- Slot maximum capacity;
- `position` required/forbidden behavior;
- Build System version mismatch;
- missing and incomplete legacy Slot assignments;
- successful explicit legacy migration.

Additional audits:

- Closed `ENTITY_TYPES` / `EntityType` remnants: none.
- Closed `ANALYSIS_OUTPUT_TYPES` / `AnalysisOutputType` remnants: none.
- Hardcoded BX/UX/CX/BXG/BXH in executable Domain TypeScript: none.
- Stock Slot inference from array order or names: none.
- Type/Schema comparison: 33 models, 0 field mismatches, 0
  required/optional mismatches.

Remaining `componentEntityIds` references are limited to:

- the explicit legacy migration input and audit copy;
- `ComboRoute` and `ComponentSynergy`, where the field represents an unordered
  analysis subject rather than Stock Slot identity.

## 8. 已知限制

1. Registry contents are in-memory Domain definitions. Persistence and loading
   belong to later Repository/API phases.
2. Version compatibility is exact. SemVer ranges and automatic compatibility
   negotiation are intentionally not implemented.
3. Registry definitions are TypeScript `readonly`, but the Registry does not
   deep-clone caller objects.
4. External Analysis Schemas can add structural contracts immediately.
   Registering new executable custom refinement functions is not included in
   this Phase.
5. `supportedEntityTypes` is model metadata. Cross-checking every referenced
   Type during Model registration can be added when Registry loading order is
   defined.
6. No actual legacy data was migrated. The pure migration function and failure
   contract are ready for a later, separately approved Migration phase.
7. No analysis calculation is implemented.

## 9. 是否建議再次執行 Architecture Gate

**Yes.**

The three identified blockers are now implemented and covered by regression
tests. A final Architecture Gate should independently verify:

- Registry contract stability;
- Registry loading and lifecycle semantics;
- Stock Slot expressiveness;
- migration failure behavior;
- whether the remaining exact-version and structural-Schema limitations are
  acceptable before freezing the Domain Contract.

Phase 2 has not started.
