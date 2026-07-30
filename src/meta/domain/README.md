# Meta Platform Domain Layer

This directory contains the additive Phase 1 domain contract for Meta Platform
V2. It is deliberately independent from the current browser application.

- `enums.ts` defines shared finite lifecycle and analysis values.
- `schema-types.ts` defines the reusable runtime Schema contract.
- `types.ts` defines the complete Phase 1 domain model.
- `schema.ts` describes the runtime shape of every domain model.
- `validation.ts` validates untrusted values and cross-field invariants.
- `registry.ts` provides version-aware Entity Type, Analysis Model, Build
  System, and Catalog Entity registries.
- `stock-configuration-migration.ts` requires explicit Slot assignments when
  converting a legacy flat Stock Configuration.
- `index.ts` is the public domain-only entry point.

Scores and star ratings use `null` for missing or insufficient evidence. A
numeric zero is a measured value and must not be used as a missing-data marker.

Canonical entity IDs use `ent_<uuid>`. They are opaque, immutable, and never
contain a series code, product model, localized name, or component role.
Series relate to an entity through `seriesIds`; component roles come from
dynamic `BuildSystemDefinition` slots. Existing IDs and names remain migration
inputs through `legacyIds` and `EntityAlias`; they are not canonical IDs.

Entity Types are not a closed union. Each `CatalogEntity` references a
versioned `EntityTypeDefinition`, and contextual validation rejects unknown,
inactive, or incompatible definitions. The definition also owns the runtime
Schema for entity attributes.

Analysis Models are registered with versioned input and output Schemas in one
`AnalysisModelRegistry`. Registration and validation are contract operations;
the Registry contains no analysis algorithm. `MetaProfile.analysisResults`
stores model ID, model version, generation time, validated JSON output, reason
codes, and source snapshot identity without enumerating known model names.

All registries store structured-cloned, deeply frozen snapshots. Original
registration objects and values returned by `get`, `list`, or `resolve` cannot
mutate registry state. Registration can be permanently closed with `seal()`.

Build slots are declared by each Build System. Every Stock Configuration entry
stores its Slot and Entity explicitly. Slot cardinality and allowed Entity Type
IDs and versions come from the selected Build System version. Build System
registration verifies referenced Entity Types and rejects definitions whose
required Slots contradict exclusive Slot groups. Validation never derives Slot
identity from a series name, product name, entity name, or array position.

Legacy flat `componentEntityIds` are accepted only by the explicit migration
function. Migration fails unless the caller supplies a complete one-to-one Slot
assignment. Failures return JSON-safe item-level diagnostics with source
location, Entity ID, Build System identity, candidate Slots, reason, and a
suggested action. Candidate Slots are diagnostic information only; migration
never selects one automatically.

Runtime JSON validation accepts only JSON-safe primitives, dense arrays, and
plain objects. Dates, Maps, Sets, class instances, cyclic structures,
non-finite numbers, functions, symbols, bigints, and explicit `undefined` are
rejected at the domain boundary.

This layer does not contain analysis-engine behavior, API handlers, database
migrations, Firebase integration, or UI code.
