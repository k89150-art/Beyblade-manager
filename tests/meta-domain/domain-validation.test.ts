import assert from "node:assert/strict";
import test from "node:test";

import {
  AnalysisModelRegistry,
  BuildSystemRegistry,
  CatalogEntityRegistry,
  DOMAIN_MODEL_NAMES,
  DOMAIN_SCHEMAS,
  DomainValidationError,
  EntityTypeRegistry,
  RegistryRegistrationError,
  assertDomainModel,
  createDomainValidationContext,
  migrateLegacyStockConfigurationDraft,
  validateDomainModel,
  type AnalysisModelDefinition,
  type BuildSystemDefinition,
  type CanonicalEntityId,
  type CatalogEntity,
  type DomainValidationContext,
  type EntityTypeDefinition,
  type EvidenceRecord,
  type LegacyStockConfigurationDraft,
  type MetaProfile,
  type ObjectSchema,
  type RecommendationAnalysis,
  type Series,
  type SchemaNode,
  type StockConfiguration,
  type WeeklyMetaSnapshot
} from "../../src/meta/domain/index.js";

type MutableRecord = Record<string, unknown>;

const TIMESTAMP = "2026-07-29T00:00:00.000Z";

const EMPTY_ATTRIBUTES_SCHEMA = {
  kind: "object",
  properties: {},
  required: [],
  additionalProperties: true,
  refinements: []
} satisfies ObjectSchema;

const ANALYSIS_INPUT_SCHEMA = {
  kind: "object",
  properties: {
    subjectId: { kind: "string", minLength: 1 }
  },
  required: ["subjectId"],
  additionalProperties: false,
  refinements: []
} satisfies ObjectSchema;

const ANALYSIS_OUTPUT_SCHEMA = {
  kind: "object",
  properties: {
    summary: { kind: "string", minLength: 1 }
  },
  required: ["summary"],
  additionalProperties: false,
  refinements: []
} satisfies ObjectSchema;

function canonicalEntityId(seed: number): CanonicalEntityId {
  const suffix = String(seed).padStart(12, "0");
  return `ent_00000000-0000-4000-a000-${suffix}`;
}

function valueForSchema(schema: SchemaNode, seed = 0): unknown {
  switch (schema.kind) {
    case "string":
      if (schema.enum !== undefined) {
        return schema.enum[0];
      }
      if (schema.format === "date") {
        return "2026-07-29";
      }
      if (schema.format === "date-time") {
        return TIMESTAMP;
      }
      if (schema.format === "uri") {
        return `https://example.com/source-${seed}`;
      }
      if (schema.format === "canonical-entity-id") {
        return canonicalEntityId(seed);
      }
      return `value-${seed}`;
    case "number":
      return schema.minimum ?? 1;
    case "boolean":
      return schema.const ?? true;
    case "json":
      return `json-${seed}`;
    case "nullable":
      return null;
    case "record":
      return {};
    case "array": {
      const length = schema.minItems ?? 0;
      return Array.from({ length }, (_, index) =>
        valueForSchema(schema.items, seed + index + 1)
      );
    }
    case "object":
      return validObjectForSchema(schema, seed);
  }
}

function validObjectForSchema(schema: ObjectSchema, seed = 0): MutableRecord {
  const value: MutableRecord = {};

  schema.required.forEach((key, index) => {
    const propertySchema = schema.properties[key];
    if (propertySchema === undefined) {
      throw new Error(`Missing schema for required key ${key}`);
    }
    value[key] = valueForSchema(propertySchema, seed + index + 1);
  });

  if (schema.refinements.includes("exclusiveTargetReference")) {
    value.targetType = "entity";
    value.entityId = canonicalEntityId(seed);
    delete value.comboId;
  }

  if (schema.refinements.includes("trendWindowAllowed")) {
    value.windowWeeks = 4;
  }

  if (schema.refinements.includes("trendWindowsComplete")) {
    const windowsSchema = schema.properties.windows;
    if (windowsSchema?.kind !== "array") {
      throw new Error("TrendAnalysis.windows must use an array schema.");
    }
    if (windowsSchema.items.kind !== "object") {
      throw new Error("TrendAnalysis.windows items must use an object schema.");
    }
    const windowItemSchema = windowsSchema.items;
    value.windows = [4, 8, 12].map((windowWeeks, index) => ({
      ...validObjectForSchema(
        windowItemSchema,
        seed + index + 1
      ),
      windowWeeks
    }));
  }

  if (schema.refinements.includes("revisionChangesPresent")) {
    value.changes = { status: "reviewed" };
  }

  if (schema.refinements.includes("profileAnalysisResultsUnique")) {
    value.analysisResults = [
      {
        modelId: typedAnalysisModelFixture.modelId,
        modelVersion: typedAnalysisModelFixture.version,
        generatedAt: TIMESTAMP,
        output: { summary: "Validated profile output." },
        reasonCodes: ["test.analysis.validated"],
        sourceSnapshotId: `snapshot-${seed}`
      }
    ];
  }

  if (schema.refinements.includes("buildSystemSlotConsistency")) {
    value.slots = [
      {
        slotId: "futureCore",
        displayName: "Future Core",
        allowedEntityTypeIds: ["blade"],
        allowedEntityTypeVersions: { blade: "1.0.0" },
        minimumEntries: 1,
        maximumEntries: 1
      }
    ];
    value.exclusiveSlotGroups = [];
  }

  if (schema.refinements.includes("attributesSchemaDefinition")) {
    value.attributesSchema = EMPTY_ATTRIBUTES_SCHEMA;
  }

  if (schema.refinements.includes("recommendationExplanationConsistency")) {
    value.positiveFactors = ["supported-positive-factor"];
  }

  if (schema.refinements.includes("comboRouteSubjectPresent")) {
    value.primaryEntityId = canonicalEntityId(seed);
  }

  if (schema.refinements.includes("exclusiveCounterReferences")) {
    value.sourceEntityId = canonicalEntityId(seed);
    value.targetComboId = `target-${seed}`;
  }

  return value;
}

function fixture(modelName: (typeof DOMAIN_MODEL_NAMES)[number]): MutableRecord {
  if (modelName === "EntityTypeDefinition") {
    return { ...typedEntityTypeFixture };
  }
  if (modelName === "CatalogEntity") {
    return { ...typedCatalogFixture };
  }
  if (modelName === "StockConfiguration") {
    return structuredClone(typedStockConfigurationFixture);
  }
  if (modelName === "BuildSystemDefinition") {
    return structuredClone(typedBuildSystemFixture);
  }
  if (modelName === "AnalysisModelDefinition") {
    return { ...typedAnalysisModelFixture };
  }

  const value = validObjectForSchema(DOMAIN_SCHEMAS[modelName]);
  if (modelName === "AnalysisTrace") {
    value.modelId = typedAnalysisModelFixture.modelId;
    value.modelVersion = typedAnalysisModelFixture.version;
  }
  return value;
}

const typedSeriesFixture = {
  id: "series-future",
  code: "FUTURE",
  name: "Future Series",
  active: true,
  sortOrder: 1,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
} satisfies Series;

const typedEntityTypeFixture = {
  typeId: "blade",
  displayName: "Blade",
  category: "upper",
  supportedSeries: [],
  attributesSchema: EMPTY_ATTRIBUTES_SCHEMA,
  lifecycleStatus: "active",
  version: "1.0.0"
} satisfies EntityTypeDefinition;

const typedCatalogFixture = {
  id: canonicalEntityId(1),
  entityTypeId: "blade",
  entityTypeVersion: "1.0.0",
  canonicalName: "opaque-entity",
  displayNameZh: "測試零件",
  seriesIds: ["BX", "UX", "CX", "FUTURE"],
  legacyIds: ["BX-31", "legacy-name"],
  attributes: {},
  active: true,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
} satisfies CatalogEntity;

const typedBuildSystemFixture = {
  id: "future-build-system",
  name: "Future Build System",
  seriesIds: ["FUTURE"],
  slots: [
    {
      slotId: "futureCore",
      displayName: "Future Core",
      allowedEntityTypeIds: ["blade"],
      allowedEntityTypeVersions: { blade: "1.0.0" },
      minimumEntries: 1,
      maximumEntries: 1
    },
    {
      slotId: "futureDriver",
      displayName: "Future Driver",
      allowedEntityTypeIds: ["blade"],
      allowedEntityTypeVersions: { blade: "1.0.0" },
      minimumEntries: 0,
      maximumEntries: 1
    }
  ],
  exclusiveSlotGroups: [],
  active: true,
  version: "1.0.0",
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
} satisfies BuildSystemDefinition;

const typedStockConfigurationFixture = {
  id: "stock-1",
  productId: "product-1",
  buildSystemId: typedBuildSystemFixture.id,
  buildSystemVersion: typedBuildSystemFixture.version,
  name: "Stock Configuration",
  entries: [
    {
      slotId: "futureCore",
      entityId: typedCatalogFixture.id
    }
  ],
  isDefault: true,
  legacyData: {},
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
} satisfies StockConfiguration;

const typedAnalysisModelFixture = {
  modelId: "test-analysis",
  version: "1.0.0",
  inputSchemaId: "test-analysis-input",
  inputSchemaVersion: "1.0.0",
  outputSchemaId: "test-analysis-output",
  outputSchemaVersion: "1.0.0",
  supportedEntityTypes: ["blade"],
  lifecycleStatus: "active",
  reasonCodeNamespace: "test.analysis"
} satisfies AnalysisModelDefinition;

const typedEvidenceFixture = {
  id: "evidence-1",
  sourceId: "source-1",
  status: "verified",
  grade: "A",
  eventName: "Verified Event",
  eventDate: "2026-07-29",
  region: "TW",
  independentSourceGroup: "source-group-1",
  observedAt: TIMESTAMP,
  performance: {
    matchWins: 2,
    matchLosses: 1,
    winRate: 0.67
  },
  rawPayload: {
    suppliedBySource: true
  },
  createdAt: TIMESTAMP,
  createdBy: "reviewer-1"
} satisfies EvidenceRecord;

const typedRecommendationFixture = {
  id: "recommendation-1",
  analysisRunId: "run-1",
  ruleDefinitionIds: ["rule-1"],
  calculatedAt: TIMESTAMP,
  reasons: ["Verified evidence supports this recommendation."],
  targetType: "entity",
  entityId: canonicalEntityId(1),
  verdict: "recommended",
  score: 80,
  stars: 4,
  positiveFactors: ["Multiple verified sources."],
  riskFactors: [],
  inputAnalysisIds: ["evidence-analysis-1"]
} satisfies RecommendationAnalysis;

const typedSnapshotFixture = {
  id: "snapshot-1",
  weekStart: "2026-07-20",
  weekEnd: "2026-07-26",
  analysisRunId: "run-1",
  profileIds: ["profile-1"],
  immutable: true,
  createdAt: TIMESTAMP
} satisfies WeeklyMetaSnapshot;

function createValidationContext(): DomainValidationContext {
  const entityTypes = new EntityTypeRegistry();
  entityTypes.register(typedEntityTypeFixture);

  const analysisModels = new AnalysisModelRegistry();
  analysisModels.registerSchema(
    typedAnalysisModelFixture.inputSchemaId,
    typedAnalysisModelFixture.inputSchemaVersion,
    ANALYSIS_INPUT_SCHEMA
  );
  analysisModels.registerSchema(
    typedAnalysisModelFixture.outputSchemaId,
    typedAnalysisModelFixture.outputSchemaVersion,
    ANALYSIS_OUTPUT_SCHEMA
  );
  analysisModels.registerModel(typedAnalysisModelFixture);

  const buildSystems = new BuildSystemRegistry(entityTypes);
  buildSystems.register(typedBuildSystemFixture);

  const entities = new CatalogEntityRegistry();
  entities.register(typedCatalogFixture, entityTypes);

  return createDomainValidationContext(
    entityTypes,
    analysisModels,
    buildSystems,
    entities
  );
}

const VALIDATION_CONTEXT = createValidationContext();

test("every Phase 1 domain model has an operational schema", () => {
  assert.equal(DOMAIN_MODEL_NAMES.length, 33);

  for (const modelName of DOMAIN_MODEL_NAMES) {
    const result = validateDomainModel(
      modelName,
      fixture(modelName),
      VALIDATION_CONTEXT
    );
    assert.equal(
      result.success,
      true,
      `${modelName}: ${result.success ? "" : JSON.stringify(result.issues)}`
    );
  }
});

test("independently typed fixtures satisfy their runtime schemas", () => {
  const fixtures = [
    ["Series", typedSeriesFixture],
    ["EntityTypeDefinition", typedEntityTypeFixture],
    ["CatalogEntity", typedCatalogFixture],
    ["StockConfiguration", typedStockConfigurationFixture],
    ["BuildSystemDefinition", typedBuildSystemFixture],
    ["AnalysisModelDefinition", typedAnalysisModelFixture],
    ["EvidenceRecord", typedEvidenceFixture],
    ["RecommendationAnalysis", typedRecommendationFixture],
    ["WeeklyMetaSnapshot", typedSnapshotFixture]
  ] as const;

  for (const [modelName, value] of fixtures) {
    const result = validateDomainModel(
      modelName,
      value,
      VALIDATION_CONTEXT
    );
    assert.equal(
      result.success,
      true,
      `${modelName}: ${result.success ? "" : JSON.stringify(result.issues)}`
    );
  }
});

test("canonical entity IDs are series-neutral and reject legacy names", () => {
  assert.equal(
    validateDomainModel(
      "CatalogEntity",
      typedCatalogFixture,
      VALIDATION_CONTEXT
    ).success,
    true
  );

  const invalid = {
    ...typedCatalogFixture,
    id: "BX-31"
  };
  const result = validateDomainModel(
    "CatalogEntity",
    invalid,
    VALIDATION_CONTEXT
  );
  assert.equal(result.success, false);
  assert.ok(result.issues.some((issue) => issue.code === "invalid_format"));
});

test("scores preserve null and reject values outside 0-100", () => {
  const valid = fixture("ConfidenceAnalysis");
  valid.score = null;
  assert.equal(validateDomainModel("ConfidenceAnalysis", valid).success, true);

  const invalid = structuredClone(valid);
  invalid.score = 101;
  const result = validateDomainModel("ConfidenceAnalysis", invalid);
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some(
      (issue) => issue.path.endsWith(".score") && issue.code === "too_large"
    )
  );
});

test("star ratings accept null but reject fractional and out-of-range values", () => {
  const valid = fixture("RecommendationAnalysis");
  valid.stars = null;
  assert.equal(
    validateDomainModel("RecommendationAnalysis", valid).success,
    true
  );

  const invalid = structuredClone(valid);
  invalid.stars = 3.5;
  const result = validateDomainModel("RecommendationAnalysis", invalid);
  assert.equal(result.success, false);
  assert.ok(result.issues.some((issue) => issue.code === "not_integer"));
});

test("evidence targets require exactly one reference matching targetType", () => {
  const invalid = fixture("EvidenceTarget");
  invalid.targetType = "entity";
  invalid.entityId = "entity-1";
  invalid.comboId = "combo-1";

  const result = validateDomainModel("EvidenceTarget", invalid);
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some((issue) => issue.code === "invalid_target_reference")
  );
});

test("trend analysis requires one 4, 8, and 12 week window", () => {
  const invalid = fixture("TrendAnalysis");
  invalid.windows = [
    {
      windowWeeks: 4,
      state: null,
      score: null,
      reasons: []
    },
    {
      windowWeeks: 8,
      state: null,
      score: null,
      reasons: []
    },
    {
      windowWeeks: 8,
      state: null,
      score: null,
      reasons: []
    }
  ];

  const result = validateDomainModel("TrendAnalysis", invalid);
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some((issue) => issue.code === "incomplete_trend_windows")
  );
});

test("weekly snapshots are immutable and have ordered dates", () => {
  const reversed = {
    ...typedSnapshotFixture,
    weekStart: "2026-07-29",
    weekEnd: "2026-07-01"
  };

  const reversedResult = validateDomainModel("WeeklyMetaSnapshot", reversed);
  assert.equal(reversedResult.success, false);
  assert.ok(
    reversedResult.issues.some(
      (issue) =>
        issue.path === "WeeklyMetaSnapshot.weekEnd" &&
        issue.code === "invalid_date_order"
    )
  );

  const mutable = {
    ...typedSnapshotFixture,
    immutable: false
  };
  const mutableResult = validateDomainModel("WeeklyMetaSnapshot", mutable);
  assert.equal(mutableResult.success, false);
  assert.ok(
    mutableResult.issues.some((issue) => issue.code === "invalid_constant")
  );
});

test("unknown fields and malformed timestamps are rejected", () => {
  const invalid = fixture("Series");
  invalid.createdAt = "not-a-timestamp";
  invalid.legacyGuess = true;

  const result = validateDomainModel("Series", invalid);
  assert.equal(result.success, false);
  assert.ok(result.issues.some((issue) => issue.code === "invalid_format"));
  assert.ok(result.issues.some((issue) => issue.code === "unknown_field"));
});

test("resolved mapping tasks require complete resolution metadata", () => {
  const invalid = fixture("EntityMappingTask");
  invalid.status = "resolved";

  const result = validateDomainModel("EntityMappingTask", invalid);
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some(
      (issue) => issue.code === "incomplete_mapping_resolution"
    )
  );
});

test("non-resolved mapping tasks cannot contain resolution metadata", () => {
  const invalid = fixture("EntityMappingTask");
  invalid.status = "pending";
  invalid.resolvedEntityId = canonicalEntityId(1);

  const result = validateDomainModel("EntityMappingTask", invalid);
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some(
      (issue) => issue.code === "unexpected_mapping_resolution"
    )
  );
});

test("insufficient evidence cannot produce a recommendation score", () => {
  const invalid = fixture("RecommendationAnalysis");
  invalid.verdict = "insufficient_data";
  invalid.score = 70;
  invalid.stars = 4;

  const result = validateDomainModel("RecommendationAnalysis", invalid);
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some(
      (issue) => issue.code === "insufficient_evidence_score"
    )
  );
});

test("recommendations require reasons and verdict-appropriate factors", () => {
  const noReasons = fixture("RecommendationAnalysis");
  noReasons.reasons = [];
  assert.equal(
    validateDomainModel("RecommendationAnalysis", noReasons).success,
    false
  );

  const noPositiveFactor = fixture("RecommendationAnalysis");
  noPositiveFactor.verdict = "recommended";
  noPositiveFactor.positiveFactors = [];
  const positiveResult = validateDomainModel(
    "RecommendationAnalysis",
    noPositiveFactor
  );
  assert.equal(positiveResult.success, false);
  assert.ok(
    positiveResult.issues.some(
      (issue) => issue.code === "missing_positive_factor"
    )
  );

  const noRiskFactor = fixture("RecommendationAnalysis");
  noRiskFactor.verdict = "avoid";
  noRiskFactor.riskFactors = [];
  const riskResult = validateDomainModel(
    "RecommendationAnalysis",
    noRiskFactor
  );
  assert.equal(riskResult.success, false);
  assert.ok(
    riskResult.issues.some((issue) => issue.code === "missing_risk_factor")
  );
});

test("risk codes are limited to the documented business values", () => {
  const invalid = fixture("RiskAnalysis");
  invalid.riskCodes = ["typo_code"];

  const result = validateDomainModel("RiskAnalysis", invalid);
  assert.equal(result.success, false);
  assert.ok(result.issues.some((issue) => issue.code === "invalid_enum"));
});

test("evidence analysis requires all six bounded dimensions", () => {
  const missingDimension = fixture("EvidenceAnalysis");
  const dimensions = missingDimension.dimensionScores as MutableRecord;
  delete dimensions.source_quality;
  const missingResult = validateDomainModel(
    "EvidenceAnalysis",
    missingDimension
  );
  assert.equal(missingResult.success, false);
  assert.ok(missingResult.issues.some((issue) => issue.code === "required"));

  const invalidScore = fixture("EvidenceAnalysis");
  (invalidScore.dimensionScores as MutableRecord).sample_size = 101;
  const scoreResult = validateDomainModel("EvidenceAnalysis", invalidScore);
  assert.equal(scoreResult.success, false);
  assert.ok(scoreResult.issues.some((issue) => issue.code === "too_large"));

  const unknownDimension = fixture("EvidenceAnalysis");
  (unknownDimension.dimensionScores as MutableRecord).popularity = 50;
  const unknownResult = validateDomainModel(
    "EvidenceAnalysis",
    unknownDimension
  );
  assert.equal(unknownResult.success, false);
  assert.ok(
    unknownResult.issues.some((issue) => issue.code === "unknown_field")
  );
});

test("build slots are driven by each build-system definition", () => {
  assert.equal(
    validateDomainModel(
      "BuildSystemDefinition",
      typedBuildSystemFixture
    ).success,
    true
  );

  const invalidCardinality = {
    ...typedBuildSystemFixture,
    slots: [
      {
        ...typedBuildSystemFixture.slots[0],
        minimumEntries: 2,
        maximumEntries: 1
      }
    ]
  };
  const cardinalityResult = validateDomainModel(
    "BuildSystemDefinition",
    invalidCardinality
  );
  assert.equal(cardinalityResult.success, false);
  assert.ok(
    cardinalityResult.issues.some(
      (issue) => issue.code === "invalid_slot_cardinality"
    )
  );

  const undeclaredExclusive = {
    ...typedBuildSystemFixture,
    exclusiveSlotGroups: [["futureCore", "notDeclared"]]
  };
  const exclusiveResult = validateDomainModel(
    "BuildSystemDefinition",
    undeclaredExclusive
  );
  assert.equal(exclusiveResult.success, false);
  assert.ok(
    exclusiveResult.issues.some(
      (issue) => issue.code === "undeclared_exclusive_slot"
    )
  );
});

test("JSON validation rejects non-JSON and cyclic objects", () => {
  class UnsupportedPayload {
    readonly value = "not-plain-json";
  }

  const cyclic: MutableRecord = {};
  cyclic.self = cyclic;

  const invalidPayloads: readonly unknown[] = [
    new Date(),
    new Map([["key", "value"]]),
    new Set(["value"]),
    new UnsupportedPayload(),
    cyclic
  ];

  for (const rawPayload of invalidPayloads) {
    const invalid = fixture("EvidenceRecord");
    invalid.rawPayload = rawPayload;
    const result = validateDomainModel("EvidenceRecord", invalid);
    assert.equal(result.success, false);
    assert.ok(result.issues.some((issue) => issue.code === "invalid_json"));
  }
});

test("date-times require real calendar dates and explicit timezones", () => {
  const impossibleDate = {
    ...typedSeriesFixture,
    createdAt: "2026-02-30T00:00:00.000Z"
  };
  assert.equal(validateDomainModel("Series", impossibleDate).success, false);

  const missingTimezone = {
    ...typedSeriesFixture,
    createdAt: "2026-07-29T00:00:00"
  };
  assert.equal(validateDomainModel("Series", missingTimezone).success, false);
});

test("optional properties must be omitted instead of set to undefined", () => {
  const invalid = {
    ...typedCatalogFixture,
    referenceNameEn: undefined
  };
  const result = validateDomainModel(
    "CatalogEntity",
    invalid,
    VALIDATION_CONTEXT
  );
  assert.equal(result.success, false);
  assert.ok(result.issues.some((issue) => issue.code === "undefined_value"));
});

test("rounded source performance is preserved instead of recomputed", () => {
  const result = validateDomainModel("EvidenceRecord", typedEvidenceFixture);
  assert.equal(result.success, true);
});

test("assertDomainModel throws a structured validation error", () => {
  const invalid = fixture("Series");
  delete invalid.id;

  assert.throws(
    () => assertDomainModel("Series", invalid),
    (error: unknown) =>
      error instanceof DomainValidationError &&
      error.issues.some((issue) => issue.code === "required")
  );
});

function entityTypeDefinition(
  typeId: string,
  lifecycleStatus: "active" | "deprecated" | "inactive" = "active",
  attributesSchema: ObjectSchema = EMPTY_ATTRIBUTES_SCHEMA
): EntityTypeDefinition {
  return {
    typeId,
    displayName: typeId,
    category: "test-category",
    supportedSeries: [],
    attributesSchema,
    lifecycleStatus,
    version: "1.0.0"
  };
}

function catalogEntity(
  seed: number,
  entityTypeId: string,
  attributes: CatalogEntity["attributes"] = {}
): CatalogEntity {
  return {
    id: canonicalEntityId(seed),
    entityTypeId,
    entityTypeVersion: "1.0.0",
    canonicalName: `entity-${seed}`,
    displayNameZh: `零件 ${seed}`,
    seriesIds: ["DYNAMIC-SERIES"],
    legacyIds: [],
    attributes,
    active: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP
  };
}

function buildSystem(
  id: string,
  slots: BuildSystemDefinition["slots"]
): BuildSystemDefinition {
  return {
    id,
    name: id,
    seriesIds: ["DYNAMIC-SERIES"],
    slots,
    exclusiveSlotGroups: [],
    active: true,
    version: "1.0.0",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP
  };
}

function entityTypeVersions(
  ...typeIds: readonly string[]
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    typeIds.map((typeId) => [typeId, "1.0.0"])
  );
}

function stockConfiguration(
  definition: BuildSystemDefinition,
  entries: StockConfiguration["entries"]
): StockConfiguration {
  return {
    id: `stock-${definition.id}`,
    productId: `product-${definition.id}`,
    buildSystemId: definition.id,
    buildSystemVersion: definition.version,
    name: definition.name,
    entries,
    isDefault: true,
    legacyData: {},
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP
  };
}

function stockContext(
  definitions: readonly EntityTypeDefinition[],
  entitiesToRegister: readonly CatalogEntity[],
  definition: BuildSystemDefinition
): DomainValidationContext {
  const entityTypes = new EntityTypeRegistry();
  definitions.forEach((item) => entityTypes.register(item));

  const buildSystems = new BuildSystemRegistry(entityTypes);
  buildSystems.register(definition);

  const entities = new CatalogEntityRegistry();
  entitiesToRegister.forEach((entity) =>
    entities.register(entity, entityTypes)
  );

  return {
    entityTypes,
    buildSystems,
    entities
  };
}

test("a new Entity Type is registered without changing the core contract", () => {
  const attributesSchema = {
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
  } satisfies ObjectSchema;
  const definition = entityTypeDefinition(
    "future_multi_layer",
    "active",
    attributesSchema
  );
  const registry = new EntityTypeRegistry();
  registry.register(definition);

  const entity = catalogEntity(100, definition.typeId, { layerCount: 3 });
  const result = validateDomainModel("CatalogEntity", entity, {
    entityTypes: registry
  });
  assert.equal(result.success, true);
});

test("unknown, inactive, and incompatible Entity Type versions are rejected", () => {
  const registry = new EntityTypeRegistry();
  registry.register(entityTypeDefinition("inactive_type", "inactive"));
  registry.register(entityTypeDefinition("versioned_type"));

  const unknown = validateDomainModel(
    "CatalogEntity",
    catalogEntity(101, "not_registered"),
    { entityTypes: registry }
  );
  assert.equal(unknown.success, false);
  assert.ok(unknown.issues.some((issue) => issue.code === "unknown_entity_type"));

  const inactive = validateDomainModel(
    "CatalogEntity",
    catalogEntity(102, "inactive_type"),
    { entityTypes: registry }
  );
  assert.equal(inactive.success, false);
  assert.ok(
    inactive.issues.some((issue) => issue.code === "inactive_entity_type")
  );

  const wrongVersion = {
    ...catalogEntity(103, "versioned_type"),
    entityTypeVersion: "2.0.0"
  };
  const mismatch = validateDomainModel(
    "CatalogEntity",
    wrongVersion,
    { entityTypes: registry }
  );
  assert.equal(mismatch.success, false);
  assert.ok(
    mismatch.issues.some(
      (issue) => issue.code === "entity_type_version_mismatch"
    )
  );
});

test("a new Analysis Model resolves one registered input and output contract", () => {
  const registry = new AnalysisModelRegistry();
  registry.registerSchema("custom-input", "1.0.0", ANALYSIS_INPUT_SCHEMA);
  registry.registerSchema("custom-output", "1.0.0", ANALYSIS_OUTPUT_SCHEMA);
  registry.registerModel({
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

  assert.equal(
    registry.validateInput(
      "custom-analysis",
      "1.0.0",
      { subjectId: "subject-1" }
    ).success,
    true
  );
  assert.equal(
    registry.validateOutput(
      "custom-analysis",
      "1.0.0",
      { summary: "Schema-selected output." }
    ).success,
    true
  );
  assert.equal(
    registry.validateOutput(
      "custom-analysis",
      "1.0.0",
      { score: 100 }
    ).success,
    false
  );
});

test("unknown, inactive, and incompatible Analysis Models are rejected", () => {
  const registry = new AnalysisModelRegistry();
  registry.registerSchema("input", "1.0.0", ANALYSIS_INPUT_SCHEMA);
  registry.registerSchema("output", "1.0.0", ANALYSIS_OUTPUT_SCHEMA);
  registry.registerModel({
    modelId: "inactive-analysis",
    version: "1.0.0",
    inputSchemaId: "input",
    inputSchemaVersion: "1.0.0",
    outputSchemaId: "output",
    outputSchemaVersion: "1.0.0",
    supportedEntityTypes: [],
    lifecycleStatus: "inactive",
    reasonCodeNamespace: "inactive.analysis"
  });

  const unknown = registry.validateInput(
    "unknown-analysis",
    "1.0.0",
    { subjectId: "subject-1" }
  );
  assert.equal(unknown.success, false);
  assert.ok(
    unknown.issues.some((issue) => issue.code === "unknown_analysis_model")
  );

  const inactive = registry.validateInput(
    "inactive-analysis",
    "1.0.0",
    { subjectId: "subject-1" }
  );
  assert.equal(inactive.success, false);
  assert.ok(
    inactive.issues.some((issue) => issue.code === "inactive_analysis_model")
  );

  const mismatch = registry.validateInput(
    "inactive-analysis",
    "2.0.0",
    { subjectId: "subject-1" }
  );
  assert.equal(mismatch.success, false);
  assert.ok(
    mismatch.issues.some(
      (issue) => issue.code === "analysis_model_version_mismatch"
    )
  );
});

test("required Stock Slots and Entity Type compatibility are enforced", () => {
  const upperType = entityTypeDefinition("upper");
  const driverType = entityTypeDefinition("driver");
  const upper = catalogEntity(110, upperType.typeId);
  const wrongDriver = catalogEntity(111, upperType.typeId);
  const definition = buildSystem("traditional-system", [
    {
      slotId: "upper",
      displayName: "Upper",
      allowedEntityTypeIds: [upperType.typeId],
      allowedEntityTypeVersions: entityTypeVersions(upperType.typeId),
      minimumEntries: 1,
      maximumEntries: 1
    },
    {
      slotId: "driver",
      displayName: "Driver",
      allowedEntityTypeIds: [driverType.typeId],
      allowedEntityTypeVersions: entityTypeVersions(driverType.typeId),
      minimumEntries: 1,
      maximumEntries: 1
    }
  ]);
  const context = stockContext(
    [upperType, driverType],
    [upper, wrongDriver],
    definition
  );

  const missing = validateDomainModel(
    "StockConfiguration",
    stockConfiguration(definition, [
      { slotId: "upper", entityId: upper.id }
    ]),
    context
  );
  assert.equal(missing.success, false);
  assert.ok(
    missing.issues.some(
      (issue) => issue.code === "missing_required_stock_slot"
    )
  );

  const incompatible = validateDomainModel(
    "StockConfiguration",
    stockConfiguration(definition, [
      { slotId: "upper", entityId: upper.id },
      { slotId: "driver", entityId: wrongDriver.id }
    ]),
    context
  );
  assert.equal(incompatible.success, false);
  assert.ok(
    incompatible.issues.some(
      (issue) => issue.code === "incompatible_slot_entity_type"
    )
  );
});

test("a compound multi-part system is stored without ambiguous Slots", () => {
  const typeIds = [
    "lock_chip",
    "metal_layer",
    "trans_layer",
    "assist_layer",
    "ratchet",
    "bit"
  ] as const;
  const definitions = typeIds.map((typeId) => entityTypeDefinition(typeId));
  const entities = typeIds.map((typeId, index) =>
    catalogEntity(120 + index, typeId)
  );
  const system = buildSystem(
    "compound-system",
    typeIds.map((typeId) => ({
      slotId: `${typeId}_slot`,
      displayName: `${typeId} Slot`,
      allowedEntityTypeIds: [typeId],
      allowedEntityTypeVersions: entityTypeVersions(typeId),
      minimumEntries: 1,
      maximumEntries: 1
    }))
  );
  const context = stockContext(definitions, entities, system);
  const stock = stockConfiguration(
    system,
    entities.map((entity, index) => ({
      slotId: `${typeIds[index] ?? "missing"}_slot`,
      entityId: entity.id
    }))
  );

  assert.equal(
    validateDomainModel("StockConfiguration", stock, context).success,
    true
  );
});

test("an integrated system is represented without inventing a missing Slot", () => {
  const integratedType = entityTypeDefinition("integrated_body");
  const tipType = entityTypeDefinition("tip");
  const integratedBody = catalogEntity(130, integratedType.typeId);
  const tip = catalogEntity(131, tipType.typeId);
  const system = buildSystem("integrated-system", [
    {
      slotId: "integrated_body",
      displayName: "Integrated Body",
      allowedEntityTypeIds: [integratedType.typeId],
      allowedEntityTypeVersions: entityTypeVersions(integratedType.typeId),
      minimumEntries: 1,
      maximumEntries: 1
    },
    {
      slotId: "tip",
      displayName: "Tip",
      allowedEntityTypeIds: [tipType.typeId],
      allowedEntityTypeVersions: entityTypeVersions(tipType.typeId),
      minimumEntries: 1,
      maximumEntries: 1
    }
  ]);
  const context = stockContext(
    [integratedType, tipType],
    [integratedBody, tip],
    system
  );
  const stock = stockConfiguration(system, [
    { slotId: "integrated_body", entityId: integratedBody.id },
    { slotId: "tip", entityId: tip.id }
  ]);

  assert.equal(
    validateDomainModel("StockConfiguration", stock, context).success,
    true
  );
});

test("a future multi-entry Slot is created entirely from its Definition", () => {
  const layerType = entityTypeDefinition("future_layer");
  const controlType = entityTypeDefinition("future_control");
  const layers = [
    catalogEntity(140, layerType.typeId),
    catalogEntity(141, layerType.typeId),
    catalogEntity(142, layerType.typeId)
  ];
  const control = catalogEntity(143, controlType.typeId);
  const system = buildSystem("future-stack-system", [
    {
      slotId: "stack",
      displayName: "Layer Stack",
      allowedEntityTypeIds: [layerType.typeId],
      allowedEntityTypeVersions: entityTypeVersions(layerType.typeId),
      minimumEntries: 2,
      maximumEntries: null
    },
    {
      slotId: "control",
      displayName: "Control",
      allowedEntityTypeIds: [controlType.typeId],
      allowedEntityTypeVersions: entityTypeVersions(controlType.typeId),
      minimumEntries: 1,
      maximumEntries: 1
    }
  ]);
  const context = stockContext(
    [layerType, controlType],
    [...layers, control],
    system
  );
  const stock = stockConfiguration(system, [
    ...layers.map((entity, position) => ({
      slotId: "stack",
      entityId: entity.id,
      position
    })),
    { slotId: "control", entityId: control.id }
  ]);

  assert.equal(
    validateDomainModel("StockConfiguration", stock, context).success,
    true
  );
});

test("illegal Slots, duplicate positions, and duplicate entities are rejected", () => {
  const layerType = entityTypeDefinition("layer");
  const first = catalogEntity(150, layerType.typeId);
  const second = catalogEntity(151, layerType.typeId);
  const system = buildSystem("multi-slot-system", [
    {
      slotId: "layers",
      displayName: "Layers",
      allowedEntityTypeIds: [layerType.typeId],
      allowedEntityTypeVersions: entityTypeVersions(layerType.typeId),
      minimumEntries: 1,
      maximumEntries: 3
    }
  ]);
  const context = stockContext([layerType], [first, second], system);

  const invalid = stockConfiguration(system, [
    { slotId: "layers", entityId: first.id, position: 0 },
    { slotId: "layers", entityId: second.id, position: 0 },
    { slotId: "illegal", entityId: first.id }
  ]);
  const result = validateDomainModel(
    "StockConfiguration",
    invalid,
    context
  );
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some((issue) => issue.code === "duplicate_stock_position")
  );
  assert.ok(
    result.issues.some((issue) => issue.code === "unknown_stock_slot")
  );
  assert.ok(
    result.issues.some((issue) => issue.code === "duplicate_stock_entity")
  );
});

test("Slot cardinality controls position and maximum entry rules", () => {
  const type = entityTypeDefinition("cardinality-component");
  const first = catalogEntity(155, type.typeId);
  const second = catalogEntity(156, type.typeId);
  const singleSystem = buildSystem("single-entry-system", [
    {
      slotId: "single",
      displayName: "Single",
      allowedEntityTypeIds: [type.typeId],
      allowedEntityTypeVersions: entityTypeVersions(type.typeId),
      minimumEntries: 1,
      maximumEntries: 1
    }
  ]);
  const singleContext = stockContext(
    [type],
    [first, second],
    singleSystem
  );
  const overCapacity = validateDomainModel(
    "StockConfiguration",
    stockConfiguration(singleSystem, [
      { slotId: "single", entityId: first.id, position: 0 },
      { slotId: "single", entityId: second.id }
    ]),
    singleContext
  );
  assert.equal(overCapacity.success, false);
  assert.ok(
    overCapacity.issues.some(
      (issue) => issue.code === "stock_slot_capacity_exceeded"
    )
  );
  assert.ok(
    overCapacity.issues.some(
      (issue) => issue.code === "unexpected_stock_position"
    )
  );

  const multiSystem = buildSystem("position-required-system", [
    {
      slotId: "multi",
      displayName: "Multi",
      allowedEntityTypeIds: [type.typeId],
      allowedEntityTypeVersions: entityTypeVersions(type.typeId),
      minimumEntries: 1,
      maximumEntries: 2
    }
  ]);
  const multiContext = stockContext(
    [type],
    [first, second],
    multiSystem
  );
  const missingPosition = validateDomainModel(
    "StockConfiguration",
    stockConfiguration(multiSystem, [
      { slotId: "multi", entityId: first.id }
    ]),
    multiContext
  );
  assert.equal(missingPosition.success, false);
  assert.ok(
    missingPosition.issues.some(
      (issue) => issue.code === "stock_position_required"
    )
  );
});

test("Stock Configuration requires an exactly compatible Build System version", () => {
  const type = entityTypeDefinition("versioned-component");
  const entity = catalogEntity(160, type.typeId);
  const system = buildSystem("versioned-system", [
    {
      slotId: "component",
      displayName: "Component",
      allowedEntityTypeIds: [type.typeId],
      allowedEntityTypeVersions: entityTypeVersions(type.typeId),
      minimumEntries: 1,
      maximumEntries: 1
    }
  ]);
  const context = stockContext([type], [entity], system);
  const stock = {
    ...stockConfiguration(system, [
      { slotId: "component", entityId: entity.id }
    ]),
    buildSystemVersion: "2.0.0"
  };

  const result = validateDomainModel(
    "StockConfiguration",
    stock,
    context
  );
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some(
      (issue) => issue.code === "build_system_version_mismatch"
    )
  );
});

test("legacy Stock Configuration migration never infers Slot identity", () => {
  const upperType = entityTypeDefinition("legacy-upper");
  const driverType = entityTypeDefinition("legacy-driver");
  const upper = catalogEntity(170, upperType.typeId);
  const driver = catalogEntity(171, driverType.typeId);
  const system = buildSystem("legacy-system", [
    {
      slotId: "upper",
      displayName: "Upper",
      allowedEntityTypeIds: [upperType.typeId],
      allowedEntityTypeVersions: entityTypeVersions(upperType.typeId),
      minimumEntries: 1,
      maximumEntries: 1
    },
    {
      slotId: "driver",
      displayName: "Driver",
      allowedEntityTypeIds: [driverType.typeId],
      allowedEntityTypeVersions: entityTypeVersions(driverType.typeId),
      minimumEntries: 1,
      maximumEntries: 1
    }
  ]);
  const context = stockContext(
    [upperType, driverType],
    [upper, driver],
    system
  );
  const legacy = {
    id: "legacy-stock",
    productId: "legacy-product",
    buildSystemId: system.id,
    name: "Legacy Stock",
    componentEntityIds: [upper.id, driver.id],
    isDefault: true,
    legacyData: {},
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP
  } satisfies LegacyStockConfigurationDraft;

  const ambiguous = migrateLegacyStockConfigurationDraft(
    {
      legacy,
      buildSystemVersion: system.version
    },
    context
  );
  assert.equal(ambiguous.success, false);
  assert.ok(
    ambiguous.issues.some(
      (issue) => issue.code === "slot_assignment_required"
    )
  );

  const incomplete = migrateLegacyStockConfigurationDraft(
    {
      legacy,
      buildSystemVersion: system.version,
      entries: [{ slotId: "upper", entityId: upper.id }]
    },
    context
  );
  assert.equal(incomplete.success, false);
  assert.ok(
    incomplete.issues.some(
      (issue) => issue.code === "missing_slot_assignment"
    )
  );

  const migrated = migrateLegacyStockConfigurationDraft(
    {
      legacy,
      buildSystemVersion: system.version,
      entries: [
        { slotId: "upper", entityId: upper.id },
        { slotId: "driver", entityId: driver.id }
      ]
    },
    context
  );
  assert.equal(migrated.success, true);
  if (migrated.success) {
    assert.deepEqual(
      migrated.data.legacyData.componentEntityIds,
      legacy.componentEntityIds
    );
  }
});

test("Registry snapshots are deeply immutable and isolated from callers", () => {
  const entityTypeSource = structuredClone(typedEntityTypeFixture);
  const entityTypes = new EntityTypeRegistry();
  entityTypes.register(entityTypeSource);

  assert.equal(Reflect.set(entityTypeSource, "lifecycleStatus", "inactive"), true);
  assert.equal(
    Reflect.set(entityTypeSource.attributesSchema, "additionalProperties", false),
    true
  );
  const entityTypeResolution = entityTypes.resolve(
    typedEntityTypeFixture.typeId,
    typedEntityTypeFixture.version
  );
  assert.equal(entityTypeResolution.status, "found");
  if (entityTypeResolution.status !== "found") {
    assert.fail("Expected registered Entity Type.");
  }
  assert.equal(entityTypeResolution.definition.lifecycleStatus, "active");
  assert.equal(
    entityTypeResolution.definition.attributesSchema.additionalProperties,
    true
  );
  assert.equal(Object.isFrozen(entityTypeResolution.definition), true);
  assert.equal(
    Object.isFrozen(entityTypeResolution.definition.attributesSchema),
    true
  );
  assert.equal(
    Reflect.set(entityTypeResolution.definition, "lifecycleStatus", "inactive"),
    false
  );

  const analysisModels = new AnalysisModelRegistry();
  const outputSchema = structuredClone(ANALYSIS_OUTPUT_SCHEMA);
  analysisModels.registerSchema("immutable-input", "1.0.0", ANALYSIS_INPUT_SCHEMA);
  analysisModels.registerSchema("immutable-output", "1.0.0", outputSchema);
  const modelSource: AnalysisModelDefinition = {
    ...typedAnalysisModelFixture,
    modelId: "immutable-model",
    inputSchemaId: "immutable-input",
    outputSchemaId: "immutable-output"
  };
  analysisModels.registerModel(modelSource);

  const sourceSummarySchema = outputSchema.properties.summary;
  assert.ok(sourceSummarySchema);
  assert.equal(Reflect.set(sourceSummarySchema, "minLength", 0), true);
  assert.equal(Reflect.set(modelSource, "lifecycleStatus", "inactive"), true);
  assert.equal(
    analysisModels.validateOutput(
      "immutable-model",
      "1.0.0",
      { summary: "" }
    ).success,
    false
  );
  const modelResolution = analysisModels.resolveModel(
    "immutable-model",
    "1.0.0"
  );
  assert.equal(modelResolution.status, "found");
  if (modelResolution.status !== "found") {
    assert.fail("Expected registered Analysis Model.");
  }
  assert.equal(modelResolution.definition.lifecycleStatus, "active");
  assert.equal(
    Reflect.set(modelResolution.definition, "lifecycleStatus", "inactive"),
    false
  );
  const registeredSchema = analysisModels.listSchemas().find(
    (item) => item.schemaId === "immutable-output"
  );
  assert.ok(registeredSchema);
  assert.equal(Object.isFrozen(registeredSchema.schema), true);
  assert.equal(
    Reflect.set(registeredSchema.schema.properties, "extra", {
      kind: "string"
    }),
    false
  );

  const buildSource = structuredClone(typedBuildSystemFixture);
  const buildSystems = new BuildSystemRegistry(entityTypes);
  buildSystems.register(buildSource);
  const sourceSlot = buildSource.slots[0];
  assert.ok(sourceSlot);
  assert.equal(Reflect.set(sourceSlot, "slotId", "polluted"), true);
  const buildResolution = buildSystems.resolve(
    typedBuildSystemFixture.id,
    typedBuildSystemFixture.version
  );
  assert.equal(buildResolution.status, "found");
  if (buildResolution.status !== "found") {
    assert.fail("Expected registered Build System.");
  }
  assert.equal(buildResolution.definition.slots[0]?.slotId, "futureCore");
  assert.equal(Object.isFrozen(buildResolution.definition.slots), true);
  const readSlot = buildResolution.definition.slots[0];
  assert.ok(readSlot);
  assert.equal(Reflect.set(readSlot, "slotId", "polluted"), false);

  const entities = new CatalogEntityRegistry();
  const entitySource = structuredClone(typedCatalogFixture);
  entities.register(entitySource, entityTypes);
  assert.equal(Reflect.set(entitySource, "canonicalName", "polluted"), true);
  const storedEntity = entities.get(typedCatalogFixture.id);
  assert.ok(storedEntity);
  assert.equal(storedEntity.canonicalName, typedCatalogFixture.canonicalName);
  assert.equal(Reflect.set(storedEntity, "canonicalName", "polluted"), false);
});

test("Registries reject duplicates and all registrations after seal", () => {
  const entityTypes = new EntityTypeRegistry();
  entityTypes.register(typedEntityTypeFixture);
  assert.throws(
    () => entityTypes.register(typedEntityTypeFixture),
    (error: unknown) =>
      error instanceof RegistryRegistrationError &&
      error.issues.some(
        (issue) => issue.code === "duplicate_entity_type_definition"
      )
  );
  entityTypes.seal();
  assert.equal(entityTypes.sealed, true);
  assert.throws(
    () => entityTypes.register(entityTypeDefinition("after-seal")),
    (error: unknown) =>
      error instanceof RegistryRegistrationError &&
      error.issues.some((issue) => issue.code === "registry_sealed")
  );

  const analysisModels = new AnalysisModelRegistry();
  analysisModels.registerSchema("input", "1.0.0", ANALYSIS_INPUT_SCHEMA);
  analysisModels.registerSchema("output", "1.0.0", ANALYSIS_OUTPUT_SCHEMA);
  analysisModels.registerModel({
    ...typedAnalysisModelFixture,
    inputSchemaId: "input",
    outputSchemaId: "output"
  });
  assert.throws(
    () =>
      analysisModels.registerModel({
        ...typedAnalysisModelFixture,
        inputSchemaId: "input",
        outputSchemaId: "output"
      }),
    (error: unknown) =>
      error instanceof RegistryRegistrationError &&
      error.issues.some(
        (issue) => issue.code === "duplicate_analysis_model_definition"
      )
  );
  analysisModels.seal();
  assert.throws(
    () =>
      analysisModels.registerSchema(
        "after-seal",
        "1.0.0",
        ANALYSIS_OUTPUT_SCHEMA
      ),
    (error: unknown) =>
      error instanceof RegistryRegistrationError &&
      error.issues.some((issue) => issue.code === "registry_sealed")
  );

  const buildSystems = new BuildSystemRegistry(entityTypes);
  buildSystems.register(typedBuildSystemFixture);
  assert.throws(
    () => buildSystems.register(typedBuildSystemFixture),
    (error: unknown) =>
      error instanceof RegistryRegistrationError &&
      error.issues.some(
        (issue) => issue.code === "duplicate_build_system_definition"
      )
  );
  buildSystems.seal();
  assert.throws(
    () =>
      buildSystems.register({
        ...typedBuildSystemFixture,
        id: "after-seal"
      }),
    (error: unknown) =>
      error instanceof RegistryRegistrationError &&
      error.issues.some((issue) => issue.code === "registry_sealed")
  );

  const entities = new CatalogEntityRegistry();
  entities.register(typedCatalogFixture, entityTypes);
  assert.throws(
    () => entities.register(typedCatalogFixture, entityTypes),
    (error: unknown) =>
      error instanceof RegistryRegistrationError &&
      error.issues.some((issue) => issue.code === "duplicate_catalog_entity")
  );
  entities.seal();
  assert.throws(
    () => entities.register(catalogEntity(999, "blade"), entityTypes),
    (error: unknown) =>
      error instanceof RegistryRegistrationError &&
      error.issues.some((issue) => issue.code === "registry_sealed")
  );
});

test("MetaProfile accepts dynamically registered model outputs only", () => {
  const analysisModels = new AnalysisModelRegistry();
  analysisModels.registerSchema("profile-input", "1.0.0", ANALYSIS_INPUT_SCHEMA);
  analysisModels.registerSchema(
    "profile-output",
    "1.0.0",
    ANALYSIS_OUTPUT_SCHEMA
  );
  analysisModels.registerModel({
    modelId: "future-profile-model",
    version: "1.0.0",
    inputSchemaId: "profile-input",
    inputSchemaVersion: "1.0.0",
    outputSchemaId: "profile-output",
    outputSchemaVersion: "1.0.0",
    supportedEntityTypes: [],
    lifecycleStatus: "active",
    reasonCodeNamespace: "future.profile"
  });

  const profile = {
    id: "profile-dynamic",
    targetType: "entity",
    entityId: canonicalEntityId(200),
    analysisRunId: "run-dynamic",
    analysisResults: [
      {
        modelId: "future-profile-model",
        modelVersion: "1.0.0",
        generatedAt: TIMESTAMP,
        output: { summary: "Dynamic output." },
        reasonCodes: ["future.profile.supported"],
        sourceSnapshotId: "snapshot-dynamic"
      }
    ],
    currentAt: TIMESTAMP
  } satisfies MetaProfile;

  assert.equal(
    validateDomainModel("MetaProfile", profile, { analysisModels }).success,
    true
  );

  const unknownModel = structuredClone(profile);
  const unknownModelResult = unknownModel.analysisResults[0];
  assert.ok(unknownModelResult);
  unknownModelResult.modelId = "unknown-profile-model";
  const unknownResult = validateDomainModel(
    "MetaProfile",
    unknownModel,
    { analysisModels }
  );
  assert.equal(unknownResult.success, false);
  assert.ok(
    unknownResult.issues.some(
      (issue) => issue.code === "unknown_analysis_model"
    )
  );

  const invalidOutput = structuredClone(profile);
  const invalidModelResult = invalidOutput.analysisResults[0];
  assert.ok(invalidModelResult);
  assert.equal(
    Reflect.set(invalidModelResult, "output", { score: 100 }),
    true
  );
  const invalidOutputResult = validateDomainModel(
    "MetaProfile",
    invalidOutput,
    { analysisModels }
  );
  assert.equal(invalidOutputResult.success, false);
  assert.ok(
    invalidOutputResult.issues.some(
      (issue) =>
        issue.path === "MetaProfile.analysisResults[0].output" &&
        issue.code === "unknown_field"
    )
  );
});

test("Build System Registry rejects definitions with no valid solution", () => {
  const type = entityTypeDefinition("solvable-component");
  const entityTypes = new EntityTypeRegistry();
  entityTypes.register(type);
  const buildSystems = new BuildSystemRegistry(entityTypes);
  const impossible: BuildSystemDefinition = {
    ...buildSystem("impossible-system", [
      {
        slotId: "left",
        displayName: "Left",
        allowedEntityTypeIds: [type.typeId],
        allowedEntityTypeVersions: entityTypeVersions(type.typeId),
        minimumEntries: 1,
        maximumEntries: 1
      },
      {
        slotId: "right",
        displayName: "Right",
        allowedEntityTypeIds: [type.typeId],
        allowedEntityTypeVersions: entityTypeVersions(type.typeId),
        minimumEntries: 1,
        maximumEntries: 1
      }
    ]),
    exclusiveSlotGroups: [["left", "right"]]
  };

  assert.throws(
    () => buildSystems.register(impossible),
    (error: unknown) =>
      error instanceof RegistryRegistrationError &&
      error.issues.some(
        (issue) =>
          issue.code === "unsatisfiable_exclusive_required_slots" &&
          issue.message.includes("left") &&
          issue.message.includes("right")
      )
  );

  const unknownTypeSystem = buildSystem("unknown-type-system", [
    {
      slotId: "unknown",
      displayName: "Unknown",
      allowedEntityTypeIds: ["not-registered"],
      allowedEntityTypeVersions: {
        "not-registered": "1.0.0"
      },
      minimumEntries: 1,
      maximumEntries: 1
    }
  ]);
  assert.throws(
    () => buildSystems.register(unknownTypeSystem),
    (error: unknown) =>
      error instanceof RegistryRegistrationError &&
      error.issues.some(
        (issue) => issue.code === "unknown_build_slot_entity_type"
      )
  );
});

test("Migration returns complete JSON-safe item-level diagnostics", () => {
  const sharedType = entityTypeDefinition("shared-migration-type");
  const orphanType = entityTypeDefinition("orphan-migration-type");
  const entityTypes = new EntityTypeRegistry();
  entityTypes.register(sharedType);
  entityTypes.register(orphanType);

  const system: BuildSystemDefinition = {
    ...buildSystem("diagnostic-migration-system", [
      {
        slotId: "shared-a",
        displayName: "Shared A",
        allowedEntityTypeIds: [sharedType.typeId],
        allowedEntityTypeVersions: entityTypeVersions(sharedType.typeId),
        minimumEntries: 0,
        maximumEntries: 1
      },
      {
        slotId: "shared-b",
        displayName: "Shared B",
        allowedEntityTypeIds: [sharedType.typeId],
        allowedEntityTypeVersions: entityTypeVersions(sharedType.typeId),
        minimumEntries: 0,
        maximumEntries: 1
      }
    ])
  };
  const buildSystems = new BuildSystemRegistry(entityTypes);
  buildSystems.register(system);

  const ambiguousEntity = catalogEntity(210, sharedType.typeId);
  const noCandidateEntity = catalogEntity(211, orphanType.typeId);
  const unknownTypeEntity: CatalogEntity = {
    ...catalogEntity(212, "missing-migration-type"),
    entityTypeVersion: "9.0.0"
  };
  const entities = new CatalogEntityRegistry();
  entities.register(ambiguousEntity, entityTypes);
  entities.register(noCandidateEntity, entityTypes);
  const entityReader = {
    get(entityId: CanonicalEntityId): CatalogEntity | undefined {
      return entityId === unknownTypeEntity.id
        ? unknownTypeEntity
        : entities.get(entityId);
    }
  };
  const legacy = {
    id: "diagnostic-legacy",
    productId: "diagnostic-product",
    buildSystemId: system.id,
    name: "Diagnostic Legacy",
    componentEntityIds: [
      ambiguousEntity.id,
      noCandidateEntity.id,
      unknownTypeEntity.id
    ],
    isDefault: true,
    legacyData: {},
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP
  } satisfies LegacyStockConfigurationDraft;
  const context: DomainValidationContext = {
    entityTypes,
    buildSystems,
    entities: entityReader
  };

  const result = migrateLegacyStockConfigurationDraft(
    { legacy, buildSystemVersion: system.version },
    context
  );
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.code === "ambiguous_candidate_slots" &&
        issue.path === "LegacyStockConfigurationMigrationRequest.entries"
    )
  );
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.code === "no_candidate_slot" &&
        issue.path.endsWith("[1]")
    )
  );
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.code === "unregistered_migration_entity_type" &&
        issue.path.endsWith("[2]")
    )
  );
  assert.ok(result.issues.length >= 3);
  result.issues.forEach((issue) => {
    assert.equal(typeof issue.code, "string");
    assert.equal(typeof issue.message, "string");
    assert.equal(typeof issue.sourcePath, "string");
    assert.equal(typeof issue.buildSystemId, "string");
    assert.equal(typeof issue.buildSystemVersion, "string");
    assert.ok(Array.isArray(issue.candidateSlotIds));
    assert.equal(typeof issue.reason, "string");
    assert.equal(typeof issue.suggestedAction, "string");
  });
  assert.doesNotThrow(() => JSON.stringify(result.issues));
});
