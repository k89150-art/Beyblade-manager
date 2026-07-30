# Phase 1 Domain Layer Review

Review date: 2026-07-29
Review scope: Phase 1 Domain Types, Schema, Runtime Validation, and tests
Decision: **Changes required before Phase 2**

## Reviewed Sources

- `BEYBLADE_META_PLATFORM_V2/README.md`
- `BEYBLADE_META_PLATFORM_V2/01_PRD.md`
- `BEYBLADE_META_PLATFORM_V2/02_DATA_MODEL.md`
- `BEYBLADE_META_PLATFORM_V2/03_ANALYSIS_RULES.md`
- `BEYBLADE_META_PLATFORM_V2/07_CODE_STYLE.md`
- `BEYBLADE_META_PLATFORM_V2/09_DEVELOPMENT_ORDER.md`
- `BEYBLADE_META_PLATFORM_V2/10_ACCEPTANCE_TEST.md`
- `CURRENT_PROJECT_AUDIT.md`
- `src/meta/domain/**`
- `tests/meta-domain/**`

## Review Findings

### Blocker 1: Weekly snapshot date validation uses nonexistent fields

`WeeklyMetaSnapshot` consistently defines `weekStart` and `weekEnd` in the
Type and Schema:

- `src/meta/domain/types.ts:324-332`
- `src/meta/domain/schema.ts:732-751`

The `snapshotDateOrder` refinement instead reads `periodStart` and
`periodEnd`:

- `src/meta/domain/validation.ts:542-549`

As a result, a snapshot with `weekStart` later than `weekEnd` is accepted.
The current test also uses the same nonexistent `periodStart` and `periodEnd`
fields, so it passes without testing the actual contract:

- `tests/meta-domain/domain-validation.test.ts:203-213`

This violates the Historical principle and weakens Weekly Snapshot integrity.

### Blocker 2: Canonical identity policy is not yet safe for Raw Evidence

The Domain Layer supplies generic string `Identifier` values and
`CatalogEntity.legacyIds`, but does not define how the duplicate legacy Blade
IDs identified in `CURRENT_PROJECT_AUDIT.md` resolve to one canonical entity.

Phase 2 Evidence targets must reference stable canonical entities. Starting the
Raw Evidence layer before documenting and testing this identity rule risks
attaching evidence to an ambiguous or wrong entity.

The CX mapping is also unresolved: the current application distinguishes metal
and trans/over blades, while the V2 `EntityType` specification has no dedicated
values for them. The implementation correctly follows the written enum, but the
specification needs a deliberate mapping decision before evidence is imported.

### High: Build-system validation conflicts with dynamic series support

`BuildSystemDefinition` already contains `allowedSlots`, but runtime validation
uses a separate hardcoded `BUILD_SLOTS` set:

- `src/meta/domain/validation.ts:38-48`
- `src/meta/domain/validation.ts:424-437`

This produces two errors:

1. A future series with a valid new slot is rejected even when that slot is
   declared in `allowedSlots`.
2. A required slot from the hardcoded list is accepted even when it is absent
   from the same definition's `allowedSlots`.

The PRD and Data Model require dynamic series support, so slot validity should
come from the Build System definition and its internal relationships.

### High: JSON runtime validation accepts non-JSON objects

`isRecord` accepts every non-array object, and `isJsonValue` accepts any such
object whose enumerable values happen to validate:

- `src/meta/domain/validation.ts:59-80`
- `src/meta/domain/validation.ts:317-324`

For example, `new Date()` is accepted as `rawPayload`, even though it is not a
`JsonValue` according to the TypeScript type. Class instances and other
non-plain objects can pass for the same reason.

This creates a real Type/Runtime mismatch and can break reproducibility,
checksums, persistence, and evidence import.

### High: Important finite analysis concepts remain unrestricted strings

The core enums from `02_DATA_MODEL.md` are correctly implemented as const
arrays plus inferred Union Types. No TypeScript `enum` conversion is needed.

However, several finite concepts needed by future engines are still plain
strings:

- `RiskAnalysis.riskCodes`
- `AnalysisRun.status`
- `EvidenceImportBatch.status`
- `EntityMappingTask.status`
- `EditorialNote.status`
- `AnalysisTrace.outputType`

In particular, `03_ANALYSIS_RULES.md` defines the supported risk codes, but the
current Domain Layer accepts arbitrary values such as `typo_code`. This makes
deterministic engine routing and reporting error-prone.

### High: Evidence dimensions and explainability reasons are under-validated

Evidence Score has six specified dimensions, but
`EvidenceAnalysis.dimensionScores` is an unrestricted record:

- `src/meta/domain/schema.ts:565-580`

An empty object or misspelled dimension is accepted. The Engine therefore
cannot rely on the six required dimensions being present.

Likewise, analysis and trend `reasons` arrays may be empty:

- `src/meta/domain/schema.ts:142-148`
- `src/meta/domain/schema.ts:163-172`

This conflicts with Explainable/Traceable requirements and the explicit rule
that every Trend result must include reasons.

### Medium: Date-time validation accepts impossible calendar dates

`isValidDateTime` checks `Date.parse` and a loose prefix:

- `src/meta/domain/validation.ts:95-101`

JavaScript normalizes some impossible dates, so values such as
`2026-02-30T00:00:00.000Z` are accepted. It also does not clearly require a
timezone offset or `Z`, which weakens reproducible cutoff-time calculations.

The date-only validator is stricter and does not have this issue.

### Medium: Optional properties containing `undefined` are accepted

The TypeScript configuration enables `exactOptionalPropertyTypes`, but the
runtime validator skips every known property whose value is `undefined`:

- `src/meta/domain/validation.ts:245-261`

Therefore `{ referenceNameEn: undefined }` passes runtime validation even
though it does not satisfy the intended exact optional contract. Optional
properties should normally be absent, not present with `undefined`, when data
will be serialized.

### Medium: Performance consistency can reject valid raw source data

`performanceConsistency` requires a supplied win rate to match wins/losses
within `0.001`:

- `src/meta/domain/validation.ts:362-383`

A source explicitly reporting 2 wins, 1 loss, and a rounded win rate of `0.67`
is rejected. The analysis rules say performance fields may only be shown when
the source supplies them; they do not require the Raw Evidence layer to
recalculate and reject rounded source values.

Raw evidence should preserve what the source reported. Any derived consistency
warning belongs in import review or analysis, with an explicit tolerance and
trace.

### Medium: Counter references are only safe at runtime

`TargetReference` is a strong discriminated union and is reused well by most
targeted models. `CounterRelationship` instead exposes four optional ID fields:

- `src/meta/domain/types.ts:368-379`

Runtime validation enforces one source and one target, but TypeScript allows
invalid combinations. A reusable discriminated subject/reference type would
provide the same guarantee to future Engine code at compile time.

### Medium: Stock Configuration loses explicit slot identity

`StockConfiguration.componentEntityIds` stores a flat list without slot
information. This is weaker than `Combo` plus `ComboComponent`, which records
the slot.

For CX stock configurations, especially where multiple component categories
map to a broader `main_blade` type, the Engine may not be able to reliably
distinguish each component's role without depending on array order or
`legacyData`. The canonical representation should define this before migration,
while preserving the current application data.

### Low: Domain definitions have multiple sources of truth

Model names and shapes are represented independently in:

- `DomainModelMap`
- `DOMAIN_MODEL_NAMES`
- `DOMAIN_SCHEMAS`

Current automated review found no property-name or required/optional mismatch
between Types and Schemas. However, the Schema is typed only as
`ObjectSchema`, not as a schema that is generically tied to each
`DomainModelMap` value. Future field changes can therefore compile while the
runtime schema drifts.

The current tests generate valid fixtures from the Schema itself, which cannot
reliably detect that kind of drift.

### Low: Small duplication and merge opportunities

No harmful duplicate Domain Type was found. Existing shared types are useful:

- `TargetReference`
- `AnalysisRecordBase`
- `Score`
- `Stars`
- `JsonValue`

Possible consolidation, after correctness fixes:

- Add a `TargetedAnalysisRecord` composition to remove repeated
  `AnalysisRecordBase & TargetReference`.
- Reuse a discriminated reference for Counter source/target and route subjects.
- Remove the redundant `TREND_WINDOWS` re-export from `schema.ts`; consumers
  can import it from `enums.ts`.

Generic timestamp base interfaces could reduce a few repeated fields, but are
not currently justified enough to improve the design. They should not be added
only to reduce line count.

## Architecture Review

### Strengths

- The Domain Layer is additive and isolated from the existing application.
- Catalog, Raw, Derived, and Editorial concepts are represented separately.
- All 31 required models from `02_DATA_MODEL.md` are present.
- `null` is preserved separately from zero for Score and Stars.
- Rule definitions, analysis runs, cutoff time, input IDs, calculated time, and
  trace records provide a strong base for reproducible engines.
- Raw Evidence has no update/delete fields and has a Revision model.
- Snapshot immutability is represented in both Type and Schema.
- Runtime dependency direction is clear:
  `enums -> schema -> validation`, with Types imported type-only where needed.
- No circular runtime dependency was found.
- No paid API, generative AI, Engine, API, migration, UI, or database behavior
  was introduced.

### Architecture Concerns

- The custom Schema DSL is understandable but is not statically coupled to the
  Domain Type it claims to validate.
- Repository-level invariants are not yet separated/documented from local
  object validation and future Engine rules.
- Canonical identity and CX category mapping need a written decision before
  Evidence records can safely reference entities.

## Domain Review

### Specification Compliance

- Core Enum values match `02_DATA_MODEL.md`.
- Required models are complete.
- Score and Stars types match the specified nullable ranges when combined with
  runtime validation.
- TargetReference correctly models entity/combo exclusivity.
- Catalog, Meta, Raw, Derived, Editorial, Rule Version, Analysis Run, and Trace
  concepts align with the V2 architecture.

### Enum and Union Decision

The current const-array plus inferred Union Type pattern is the recommended
approach. It provides runtime values for Schema validation without using
TypeScript runtime enums.

Additional finite lifecycle statuses and risk codes should use the same
pattern. Extensible descriptive values such as source names or editorial text
should remain strings.

### Interface Merge Decision

No interfaces need immediate merging. The only worthwhile reuse candidates are
targeted analysis composition and discriminated subject references. A broad
`BaseEntity` or timestamp hierarchy would add abstraction without solving a
current problem.

## Validation Review

### Correctly Implemented

- Required fields and unknown-field rejection
- Score range `0-100 | null`
- Stars range `1-5 | null` with integer enforcement
- Entity/combo target exclusivity
- Trend window membership and exact 4/8/12 coverage
- Confidence hard cap
- `insufficient_data` requiring null score and stars
- Non-empty Evidence Revision changes
- Resolved mapping metadata requirement
- Analysis rule/run date ordering
- Counter source/target cardinality
- Snapshot `immutable: true`

### Local Rules Missing or Incorrect

- Snapshot ordering reads the wrong field names.
- JSON and Record values are not restricted to plain JSON-safe objects.
- Date-time validation is not calendar-strict.
- Optional `undefined` is accepted.
- Risk codes are unrestricted.
- Evidence dimension keys are unrestricted and may be empty.
- Explainability reason arrays may be empty.
- Build-system slot validation is hardcoded and internally inconsistent.
- Mapping tasks in a non-resolved status may still contain resolution fields.
- Lifecycle statuses are unrestricted strings.

### Rules That Must Be Enforced Later

These rules require related records, history, or transactions and should not be
forced into single-object validation:

- Only verified Evidence may contribute to scores.
- Event/source deduplication and independent-source grouping.
- Exactly one primary target across an Evidence record's targets.
- Raw Evidence append-only behavior and revision transactions.
- Snapshot non-overwrite behavior.
- Evidence/Confidence null, sample count, or E-only data producing
  `insufficient_data`.
- Single event/new release restrictions for `strong_up`.
- New releases not becoming `mature`.
- `legacy` not automatically becoming `avoid`.
- Avoid requiring sufficient negative Evidence.
- Synergy requiring verified shared success data.

These belong in Phase 2 Repository/Service constraints and the corresponding
Engine phases, with tests and trace output.

## Runtime Validation Review

The validator covers its supported primitive, object, array, nullable, record,
and refinement paths. It returns structured issues and has no unsafe `any`.

It is not yet complete enough to be treated as a trustworthy boundary for Raw
Evidence because:

- non-plain objects can be cast to typed JSON data;
- impossible date-times can pass;
- explicit `undefined` can pass;
- Schema/Type drift is not prevented by the type system;
- several finite business values are not constrained;
- current fixtures are Schema-generated rather than independently typed.

## Potential Problems

1. Invalid weekly periods can be stored despite passing validation.
2. New build systems can be blocked by old slot constants.
3. Non-serializable objects can enter evidence payloads and attributes.
4. Typos in risk/status/output identifiers can silently change Engine behavior.
5. Empty dimensions and reasons can produce apparently valid but
   non-explainable analysis output.
6. Ambiguous legacy IDs can attach Evidence to the wrong entity.
7. CX stock components may lose their canonical slot role.
8. Rounded source statistics may be rejected instead of preserved.
9. Passing tests may provide false confidence because fixtures are derived from
   the Schema under test.

## 建議修改

Recommended Phase 1 correction order:

1. Fix `snapshotDateOrder` to use `weekStart/weekEnd` and replace the current
   test with a real reversed-week regression test.
2. Document and test canonical Entity ID and CX metal/trans mapping policy.
3. Remove the global hardcoded slot gate; validate required and exclusive slots
   against each `BuildSystemDefinition.allowedSlots`.
4. Require plain JSON objects and reject Date/class instances, unsupported
   prototypes, and explicit `undefined`.
5. Make date-time validation calendar-strict and require an explicit timezone.
6. Add const-array Union Types and Schema enums for risk codes and finite
   lifecycle statuses.
7. Define the six Evidence dimension keys and require them in
   `EvidenceAnalysis`.
8. Require traceable reasons where the specification requires explanations.
9. Reconsider Raw Performance consistency as an import warning rather than a
   hard object-validation failure.
10. Strengthen Counter source/target types with discriminated references.
11. Define canonical slot identity for Stock Configuration without migrating
    existing user data yet.
12. Add independently authored typed fixtures and adversarial tests instead of
    deriving every valid fixture from `DOMAIN_SCHEMAS`.
13. Add a compile-time Type/Schema contract or schema inference so future field
    changes cannot drift silently.

## Verification

The following commands currently pass:

- `npm run typecheck`
- `npm run lint`
- `npm test` — 10/10 tests
- `npm run build`

An additional read-only TypeScript Compiler API audit found no current
property-name or required/optional mismatch between `DomainModelMap` and
`DOMAIN_SCHEMAS`.

Adversarial runtime checks confirmed that the current validator:

- accepts a reversed `weekStart/weekEnd` snapshot;
- accepts an impossible date-time;
- accepts a `Date` object as JSON payload;
- accepts explicit `undefined` on an optional field;
- accepts unknown risk codes;
- accepts empty Evidence dimensions and reasons;
- rejects a dynamically declared new slot;
- rejects a plausible rounded source win rate.

## Phase 2 Decision

**Do not proceed directly to Phase 2.**

The architecture is directionally sound, the required model inventory is
complete, and there is no circular dependency. However, the snapshot bug,
canonical identity ambiguity, dynamic slot conflict, and JSON boundary issue
must be corrected and regression-tested first.

After the Phase 1 corrections are implemented, run a focused second review.
Only then should Phase 1 be approved and Phase 2 Raw Evidence work begin.
