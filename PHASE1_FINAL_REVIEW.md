# Phase 1 Final Review - Architecture Gate

Review date: 2026-07-29

Scope: the latest Phase 1.5 Domain Layer under `src/meta/domain` only. This
review does not assess or modify the existing browser application, Engine, API,
Database, Migration, or UI.

## 1. Review Summary

The Phase 1.5 fixes materially improved the Domain contract:

- Canonical Entity IDs are opaque, series-neutral `ent_<uuid>` identifiers.
- Build slots are declared by each `BuildSystemDefinition`, rather than by a
  global BX/UX/CX constant.
- Type, Schema, and current Runtime Validation agree for all 31 registered
  models.
- JSON validation rejects dates, maps, sets, class instances, sparse arrays,
  cycles, symbols, unsupported primitives, non-finite numbers, and explicit
  `undefined`.
- Evidence dimensions, risk codes, recommendation explanations, date ranges,
  targets, mapping state, and dynamic slot definitions have meaningful runtime
  constraints.
- The Domain dependency direction is acyclic:
  `enums -> types/schema -> validation -> index`.
- Existing contracts are sufficient for the five planned Engines:
  Evidence, Confidence, Trend, Recommendation, and Meta Coach.
- Validation performs no deep clone and has no internally repeated full-model
  validation.

The current implementation is stable for its registered models, but it does
not pass the requested Architecture Gate. Three contract-level blockers remain:

1. A new part kind requires editing the closed `EntityType` union and Schema.
2. A new analysis model requires editing multiple closed Domain registries.
3. `StockConfiguration` does not preserve the dynamic slot of each component.

Freezing the contract now would make those known gaps into later breaking
changes.

### Gate Result

- Architecture Score: **82 / 100**
- Domain Stability: **B**
- Freeze Domain Contract: **No**
- Start Phase 2: **No**

## 2. Contract Stability

### Type, Schema, and Validation

All currently registered models have matching Type and Schema shapes. The
independently authored fixtures and compiler audit reduce the chance of silent
drift, and all current validation tests pass.

There is still more than one source of truth:

- `DomainModelMap`
- `DOMAIN_MODEL_NAMES`
- `DOMAIN_SCHEMAS`
- `ANALYSIS_OUTPUT_TYPES` for analysis outputs

The Schema DSL is not generically inferred from `DomainModelMap`. A future
field edit can therefore compile while its runtime Schema is forgotten. This is
a medium maintenance risk, but it is not a blocker for the current 31 models.

### Domain Boundary

The Domain Layer remains independent from UI, Firebase, localStorage, API,
repository, and Engine behavior. Cross-record rules such as append-only
Evidence, snapshot immutability in storage, deduplication, and verified-only
scoring correctly remain outside single-object validation.

`CounterRelationship` is weaker at compile time than other target-bearing
models. Its four optional reference properties permit invalid TypeScript values;
runtime validation repairs this boundary by requiring exactly one source and
one target. This is a medium Engine-consumer risk, not a current runtime blocker.

### Canonical Entity ID

`CanonicalEntityId` and its runtime UUID check are series-neutral. IDs do not
encode BX, UX, CX, localized names, product codes, or slot roles. This contract
can support BXG, BXH, and future series without changing the ID format.

The TypeScript template type `ent_${string}` is intentionally broader than the
runtime UUID rule. Engine and repository boundaries must continue to call
runtime validation.

### Dynamic Build Slot

`BuildSystemDefinition.allowedSlots`, `requiredSlots`, and
`exclusiveSlotGroups` successfully allow a new series to define new slot names
without editing a global slot union. `ComboComponent.slot` can carry those
values.

The same capability is missing from `StockConfiguration`: it stores only
`componentEntityIds`. This is a contract gap, described as Blocker 3 below.

### JSON Serializable

The accepted values are substantially limited to JSON-safe data. One edge case
remains: plain objects with non-enumerable data properties pass validation even
though `JSON.stringify` silently drops those properties. This does not affect
normal parsed JSON input, but a strict no-data-loss boundary should reject it.

Validation returns the original object reference rather than cloning or
freezing it. This is efficient, but TypeScript `readonly` does not prevent a
JavaScript caller from mutating a successfully validated object afterward.
Repositories and Engines must treat validated inputs as immutable, or a later
contract revision should define an immutable boundary strategy.

## 3. Remaining Issues

### Blocker 1 - Part taxonomy is closed

Locations:

- `src/meta/domain/enums.ts:1`
- `src/meta/domain/schema.ts:254`
- `src/meta/domain/schema.ts:528`

`EntityType` accepts only `blade`, `main_blade`, `assist_blade`, `ratchet`,
`bit`, `lock`, and `combo`. A runtime probe confirmed that an arbitrary future
series is accepted, while a new `future_core` part kind is rejected.

This means:

- New series: data-only extension.
- New build slot: data-only extension.
- New part kind: Domain code change.

That conflicts with the explicit extensibility criterion. Before freezing,
define a stable extension mechanism, such as a data-backed entity-kind
definition or a stable broad class plus an extensible kind code. The solution
must preserve validation without turning every value into an unchecked string.

### Blocker 2 - Analysis model registry is closed

Locations:

- `src/meta/domain/enums.ts:118`
- `src/meta/domain/types.ts:406`
- `src/meta/domain/schema.ts:237`
- `src/meta/domain/schema.ts:720`

Adding a new analysis model requires coordinated edits to its Type,
`DomainModelMap`, `DOMAIN_MODEL_NAMES`, `DOMAIN_SCHEMAS`, and possibly
`ANALYSIS_OUTPUT_TYPES`. The existing five Engines are covered, but a sixth
analysis model is not an extension-only operation.

Before freezing, define whether analysis output models are deliberately
versioned core contracts or whether external models must be registerable. The
current implementation cannot satisfy the requested promise that a new
analysis model needs no existing Domain modification.

### Blocker 3 - Stock Configuration loses slot identity

Locations:

- `src/meta/domain/types.ts:95`
- `src/meta/domain/schema.ts:320`

`StockConfiguration.componentEntityIds` is a flat list. Unlike
`ComboComponent`, it cannot identify which dynamic slot an entity occupies.
Entity type inference is not sufficient for CX or future systems where multiple
components can share a broad type or where slot names are system-specific.

This affects reliable representation and migration of:

- CX split components
- future multi-component systems
- Random Booster variants
- Deck Set contents
- any stock configuration whose component order is not a contractual identity

Before freezing, stock components need an explicit slot-bearing canonical
representation. Existing application data can remain unchanged until Migration,
but the Domain contract must define the target shape now.

### Non-blocking Issues

1. `CounterRelationship` exclusivity exists only at runtime.
2. Type and Schema remain separate declarations.
3. Validated output retains a mutable reference to caller-owned data.
4. Non-enumerable plain-object properties can be lost during serialization.
5. JSON cycle detection copies the ancestor `Set` at each nested container.
6. Product variant semantics rely mainly on `attributes`, `variantKey`, and
   `setId`; identity policy for cosmetic and event variants is not yet explicit.

## 4. Future Compatibility

| Requirement | Status | Assessment |
| --- | --- | --- |
| BX | Supported | Series record plus current blade/ratchet/bit slots. |
| UX | Supported | No ID or slot constant is tied to UX. |
| CX | Partial | Combo slots are supported; stock component slot identity is missing. |
| BXG | Supported | Can be added as Series and Build System data. |
| BXH | Supported | Can be added as Series and Build System data. |
| Future Series | Supported with condition | New series and slots are data-driven; a genuinely new part kind is not. |
| Metal Coat | Representable | Can be a Product/entity attribute or variant; identity policy should be documented. |
| Limited Edition | Representable | Product attributes and aliases can model it without a new core model. |
| Random Booster | Partial | Multiple Stock Configurations and `variantKey` fit; component slots do not. |
| Deck Set | Partial | Multiple configurations and `setId` fit; component slots and set semantics need definition. |
| Event Exclusive | Representable | Product attributes can model it; identity policy should be documented. |

## 5. Engine Readiness

### Evidence Engine

Ready for current scope. It has canonical targets, verified lifecycle values,
six bounded dimensions, source/input Evidence IDs, reasons, run IDs, and rule
IDs. Deduplication and verified-only scoring correctly belong to Engine or
repository logic.

### Confidence Engine

Ready for current scope. Score, hard cap, reasons, input Evidence Analysis IDs,
run identity, and rule identity are available.

### Trend Engine

Ready for current scope. The 4/8/12 week windows, state, score, reasons, target,
and input analysis references are validated.

### Recommendation Engine

Ready for current scope. Verdict, nullable score/stars, positive factors, risk
factors, reasons, and input analysis references support explainable output.
`AnalysisRuleDefinition.definition` can hold versioned recommendation rules
without changing the Domain.

### Meta Coach

Ready for current scope. Headline, verdict, factors, action advice, inputs, and
trace ID are present. The closed analysis-model registry remains a blocker only
for adding a new output model, not for implementing the specified Meta Coach.

## 6. Performance Review

### Positive Findings

- No deep clone is performed.
- Validation returns the validated reference directly.
- No full model is validated twice inside `validateDomainModel`.
- Schema lookup is direct through `DOMAIN_SCHEMAS[modelName]`.
- Object spreads are used mainly when constructing static Schema definitions,
  not repeatedly per validation call.
- A read-only probe with a 1,000-level JSON payload completed successfully in
  approximately 8 ms on the review machine.

### Risks

- JSON cycle detection creates `new Set(ancestors)` at every nested container.
  This causes increasing allocations with depth. Normal Evidence payloads are
  unlikely to notice it, but adversarial deeply nested input can become
  disproportionately expensive.
- `uniqueItems` serializes every array item before validating it. Current unique
  arrays contain primitive IDs/strings, so the practical cost is low. The
  generic Schema helper should not be used for large object arrays without a
  bounded strategy.
- Repeated validation is not present internally; API/repository design must
  avoid validating the same payload independently at several layers.

No current Schema bottleneck blocks Phase 1 operation. The performance risks
above are bounded hardening items, not freeze blockers.

## 7. Extensibility Decision

| Extension | Existing Domain change required? | Gate result |
| --- | --- | --- |
| New series | No | Pass |
| New build slot | No | Pass |
| New part kind | Yes | Fail |
| New analysis model | Yes | Fail |
| New Recommendation Rule | No | Pass |

The Domain is extensible in configuration and rules, but not in taxonomy or
analysis-output model registration. Therefore it does not yet meet the complete
extensibility requirement for a frozen contract.

## 8. Risk Assessment

- **High:** freezing before resolving the three blockers creates predictable
  breaking migrations in Catalog, Stock Configuration, Trace, and Schema
  consumers.
- **Medium:** Type/Schema drift and runtime-only counter exclusivity can let
  future Engine code compile with an invalid value.
- **Medium:** mutable validated references require strict caller discipline.
- **Low:** non-enumerable-property serialization and deep nesting affect
  constructed/adversarial values rather than ordinary parsed JSON.
- **Low:** current runtime performance and dependency structure are healthy.

## 9. Verification

The following commands passed against the latest Domain Layer:

- `npm run typecheck`
- `npm run lint`
- `npm test` - 21/21 tests passed
- `npm run build`

Additional read-only probes confirmed:

- an arbitrary future Series code is accepted;
- an unregistered future part kind is rejected;
- successful validation returns the caller's original mutable reference;
- a non-enumerable plain-object property can pass but disappear from serialized
  JSON;
- a 1,000-level nested JSON payload validates without failure on the review
  machine.

## 10. Architecture Gate Decision

The corrected Domain Layer is a strong Phase 1 foundation and is ready for
another focused contract correction. It is not yet safe to freeze because the
remaining issues affect public identity and extension contracts rather than
internal implementation details.

**Domain Contract must not be frozen yet.**

**Phase 2 is not approved yet.**

Recommended next step: a narrowly scoped Phase 1.6 contract fix for extensible
part kinds, extensible analysis output registration, and slot-bearing Stock
Configurations, followed by one final Architecture Gate review.
