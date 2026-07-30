import {
  ANALYSIS_RUN_STATUSES,
  COACH_VERDICTS,
  DEFINITION_LIFECYCLE_STATUSES,
  EDITORIAL_NOTE_STATUSES,
  EVIDENCE_GRADES,
  EVIDENCE_IMPORT_BATCH_STATUSES,
  EVIDENCE_SCORE_DIMENSIONS,
  EVIDENCE_STATUSES,
  ENTITY_MAPPING_TASK_STATUSES,
  MATURITY_STAGES,
  RISK_CODES,
  RISK_LEVELS,
  TARGET_TYPES,
  TREND_STATES,
  TREND_WINDOWS
} from "./enums.js";
import type {
  ArraySchema,
  BooleanSchema,
  JsonSchema,
  NullableSchema,
  NumberSchema,
  ObjectSchema,
  RecordSchema,
  SchemaNode,
  StringSchema
} from "./schema-types.js";
import type { DomainModelName } from "./types.js";

const text = (minimumLength = 1): StringSchema => ({
  kind: "string",
  minLength: minimumLength
});

const enumText = (values: readonly string[]): StringSchema => ({
  kind: "string",
  enum: values
});

const number = (
  minimum?: number,
  maximum?: number,
  integer = false
): NumberSchema => ({
  kind: "number",
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
  ...(integer ? { integer: true } : {})
});

const nullable = (inner: SchemaNode): NullableSchema => ({
  kind: "nullable",
  inner
});

const array = (
  items: SchemaNode,
  options: Pick<ArraySchema, "minItems" | "uniqueItems"> = {}
): ArraySchema => ({
  kind: "array",
  items,
  ...options
});

const record = (values: SchemaNode): RecordSchema => ({
  kind: "record",
  values
});

const object = (
  properties: Readonly<Record<string, SchemaNode>>,
  required: readonly string[],
  refinements: readonly string[] = []
): ObjectSchema => ({
  kind: "object",
  properties,
  required,
  additionalProperties: false,
  refinements
});

const id = text();
const canonicalEntityId: StringSchema = {
  kind: "string",
  format: "canonical-entity-id"
};
const timestamp: StringSchema = { kind: "string", format: "date-time" };
const date: StringSchema = { kind: "string", format: "date" };
const uri: StringSchema = { kind: "string", format: "uri" };
const json: JsonSchema = { kind: "json" };
const boolean: BooleanSchema = { kind: "boolean" };
const score = nullable(number(0, 100));
const stars = nullable(number(1, 5, true));
const stringArray = array(text(), { uniqueItems: true });
const idArray = array(id, { uniqueItems: true });
const canonicalEntityIdArray = array(canonicalEntityId, { uniqueItems: true });
const nonEmptyIdArray = array(id, { minItems: 1, uniqueItems: true });
const jsonRecord = record(json);

const targetProperties = {
  targetType: enumText(TARGET_TYPES),
  entityId: canonicalEntityId,
  comboId: id
} satisfies Readonly<Record<string, SchemaNode>>;

const analysisBaseProperties = {
  id,
  analysisRunId: id,
  ruleDefinitionIds: nonEmptyIdArray,
  calculatedAt: timestamp,
  reasons: array(text(), { minItems: 1 })
} satisfies Readonly<Record<string, SchemaNode>>;

const targetRequired = [
  "targetType"
] as const;

const analysisRequired = [
  "id",
  "analysisRunId",
  "ruleDefinitionIds",
  "calculatedAt",
  "reasons",
  "targetType"
] as const;

const trendWindowSchema = object(
  {
    windowWeeks: { kind: "number", integer: true },
    state: nullable(enumText(TREND_STATES)),
    score,
    reasons: array(text(), { minItems: 1 })
  },
  ["windowWeeks", "state", "score", "reasons"],
  ["trendWindowAllowed"]
);

const performanceSchema = object(
  {
    matchWins: nullable(number(0, undefined, true)),
    matchLosses: nullable(number(0, undefined, true)),
    winRate: nullable(number(0, 1))
  },
  ["matchWins", "matchLosses", "winRate"]
);

const evidenceDimensionScoresSchema = object(
  Object.fromEntries(
    EVIDENCE_SCORE_DIMENSIONS.map((dimension) => [dimension, score])
  ),
  EVIDENCE_SCORE_DIMENSIONS
);

const stockConfigurationEntrySchema = object(
  {
    slotId: text(),
    entityId: canonicalEntityId,
    position: number(0, undefined, true)
  },
  ["slotId", "entityId"]
);

const buildSlotDefinitionSchema = object(
  {
    slotId: text(),
    displayName: text(),
    allowedEntityTypeIds: array(text(), {
      minItems: 1,
      uniqueItems: true
    }),
    allowedEntityTypeVersions: record(text()),
    minimumEntries: number(0, undefined, true),
    maximumEntries: nullable(number(1, undefined, true))
  },
  [
    "slotId",
    "displayName",
    "allowedEntityTypeIds",
    "allowedEntityTypeVersions",
    "minimumEntries",
    "maximumEntries"
  ],
  ["buildSlotCardinality", "buildSlotEntityTypeVersions"]
);

const metaProfileAnalysisResultSchema = object(
  {
    modelId: id,
    modelVersion: text(),
    generatedAt: timestamp,
    output: json,
    reasonCodes: array(text(), { minItems: 1, uniqueItems: true }),
    sourceSnapshotId: id
  },
  [
    "modelId",
    "modelVersion",
    "generatedAt",
    "output",
    "reasonCodes",
    "sourceSnapshotId"
  ]
);

export const DOMAIN_MODEL_NAMES = [
  "Series",
  "EntityTypeDefinition",
  "CatalogEntity",
  "EntityAlias",
  "Product",
  "StockConfiguration",
  "Combo",
  "ComboComponent",
  "BuildSystemDefinition",
  "EvidenceSource",
  "EvidenceRecord",
  "EvidenceTarget",
  "EvidenceRevision",
  "EvidenceImportBatch",
  "EntityMappingTask",
  "AnalysisRuleDefinition",
  "AnalysisModelDefinition",
  "AnalysisRun",
  "EvidenceAnalysis",
  "ConfidenceAnalysis",
  "TrendAnalysis",
  "MaturityAnalysis",
  "RiskAnalysis",
  "RecommendationAnalysis",
  "CoachAnalysis",
  "AnalysisTrace",
  "MetaProfile",
  "WeeklyMetaSnapshot",
  "MetaTimelineEvent",
  "ComboRoute",
  "ComponentSynergy",
  "CounterRelationship",
  "EditorialNote"
] as const satisfies readonly DomainModelName[];

export const DOMAIN_SCHEMAS: Readonly<Record<DomainModelName, ObjectSchema>> = {
  Series: object(
    {
      id,
      code: text(),
      name: text(),
      active: boolean,
      sortOrder: number(0, undefined, true),
      createdAt: timestamp,
      updatedAt: timestamp
    },
    ["id", "code", "name", "active", "sortOrder", "createdAt", "updatedAt"]
  ),

  EntityTypeDefinition: object(
    {
      typeId: text(),
      displayName: text(),
      category: text(),
      supportedSeries: idArray,
      attributesSchema: json,
      lifecycleStatus: enumText(DEFINITION_LIFECYCLE_STATUSES),
      version: text()
    },
    [
      "typeId",
      "displayName",
      "category",
      "supportedSeries",
      "attributesSchema",
      "lifecycleStatus",
      "version"
    ],
    ["attributesSchemaDefinition"]
  ),

  CatalogEntity: object(
    {
      id: canonicalEntityId,
      entityTypeId: text(),
      entityTypeVersion: text(),
      canonicalName: text(),
      displayNameZh: text(),
      referenceNameEn: text(),
      seriesIds: idArray,
      legacyIds: stringArray,
      attributes: jsonRecord,
      active: boolean,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    [
      "id",
      "entityTypeId",
      "entityTypeVersion",
      "canonicalName",
      "displayNameZh",
      "seriesIds",
      "legacyIds",
      "attributes",
      "active",
      "createdAt",
      "updatedAt"
    ]
  ),

  EntityAlias: object(
    {
      id,
      entityId: canonicalEntityId,
      value: text(),
      normalizedValue: text(),
      locale: text(),
      source: text(),
      active: boolean,
      createdAt: timestamp
    },
    ["id", "entityId", "value", "normalizedValue", "active", "createdAt"]
  ),

  Product: object(
    {
      id,
      productCode: text(),
      displayName: text(),
      seriesId: id,
      stockConfigurationIds: idArray,
      legacyRecordIds: stringArray,
      attributes: jsonRecord,
      active: boolean,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    [
      "id",
      "productCode",
      "displayName",
      "seriesId",
      "stockConfigurationIds",
      "legacyRecordIds",
      "attributes",
      "active",
      "createdAt",
      "updatedAt"
    ]
  ),

  StockConfiguration: object(
    {
      id,
      productId: id,
      buildSystemId: id,
      buildSystemVersion: text(),
      name: text(),
      entries: array(stockConfigurationEntrySchema, { minItems: 1 }),
      variantKey: text(),
      setId: id,
      isDefault: boolean,
      legacyData: jsonRecord,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    [
      "id",
      "productId",
      "buildSystemId",
      "buildSystemVersion",
      "name",
      "entries",
      "isDefault",
      "legacyData",
      "createdAt",
      "updatedAt"
    ]
  ),

  Combo: object(
    {
      id,
      buildSystemId: id,
      name: text(),
      componentIds: idArray,
      legacyKey: text(),
      createdAt: timestamp,
      updatedAt: timestamp
    },
    ["id", "buildSystemId", "componentIds", "createdAt", "updatedAt"]
  ),

  ComboComponent: object(
    {
      id,
      comboId: id,
      entityId: canonicalEntityId,
      slot: text(),
      order: number(0, undefined, true),
      createdAt: timestamp
    },
    ["id", "comboId", "entityId", "slot", "order", "createdAt"]
  ),

  BuildSystemDefinition: object(
    {
      id,
      name: text(),
      seriesIds: idArray,
      slots: array(buildSlotDefinitionSchema, { minItems: 1 }),
      exclusiveSlotGroups: array(
        array(text(), { minItems: 2, uniqueItems: true })
      ),
      active: boolean,
      version: text(),
      createdAt: timestamp,
      updatedAt: timestamp
    },
    [
      "id",
      "name",
      "seriesIds",
      "slots",
      "exclusiveSlotGroups",
      "active",
      "version",
      "createdAt",
      "updatedAt"
    ],
    ["buildSystemSlotConsistency"]
  ),

  EvidenceSource: object(
    {
      id,
      name: text(),
      sourceType: text(),
      uri,
      region: text(),
      independentSourceGroup: text(),
      defaultGrade: enumText(EVIDENCE_GRADES),
      active: boolean,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    [
      "id",
      "name",
      "sourceType",
      "independentSourceGroup",
      "defaultGrade",
      "active",
      "createdAt",
      "updatedAt"
    ]
  ),

  EvidenceRecord: object(
    {
      id,
      sourceId: id,
      status: enumText(EVIDENCE_STATUSES),
      grade: enumText(EVIDENCE_GRADES),
      eventName: text(),
      eventDate: date,
      region: text(),
      independentSourceGroup: text(),
      observedAt: timestamp,
      importBatchId: id,
      placement: number(1, undefined, true),
      performance: performanceSchema,
      rawPayload: json,
      createdAt: timestamp,
      createdBy: id
    },
    [
      "id",
      "sourceId",
      "status",
      "grade",
      "eventName",
      "eventDate",
      "region",
      "independentSourceGroup",
      "observedAt",
      "performance",
      "rawPayload",
      "createdAt",
      "createdBy"
    ]
  ),

  EvidenceTarget: object(
    {
      id,
      evidenceRecordId: id,
      ...targetProperties,
      isPrimary: boolean,
      createdAt: timestamp
    },
    ["id", "evidenceRecordId", ...targetRequired, "isPrimary", "createdAt"],
    ["exclusiveTargetReference"]
  ),

  EvidenceRevision: object(
    {
      id,
      evidenceRecordId: id,
      revisionNumber: number(1, undefined, true),
      supersedesRevisionId: id,
      reason: text(),
      changes: jsonRecord,
      createdAt: timestamp,
      createdBy: id
    },
    [
      "id",
      "evidenceRecordId",
      "revisionNumber",
      "reason",
      "changes",
      "createdAt",
      "createdBy"
    ],
    ["revisionChangesPresent"]
  ),

  EvidenceImportBatch: object(
    {
      id,
      sourceId: id,
      importKey: text(),
      status: enumText(EVIDENCE_IMPORT_BATCH_STATUSES),
      checksum: text(),
      recordCount: number(0, undefined, true),
      importedAt: timestamp,
      importedBy: id
    },
    [
      "id",
      "sourceId",
      "importKey",
      "status",
      "checksum",
      "recordCount",
      "importedAt",
      "importedBy"
    ]
  ),

  EntityMappingTask: object(
    {
      id,
      rawName: text(),
      normalizedName: text(),
      entityTypeIdGuess: text(),
      sourceId: id,
      status: enumText(ENTITY_MAPPING_TASK_STATUSES),
      resolvedEntityId: canonicalEntityId,
      resolutionNote: text(),
      createdAt: timestamp,
      resolvedAt: timestamp,
      resolvedBy: id
    },
    ["id", "rawName", "normalizedName", "status", "createdAt"],
    ["mappingResolutionConsistency"]
  ),

  AnalysisRuleDefinition: object(
    {
      id,
      engine: text(),
      version: text(),
      activeFrom: timestamp,
      activeUntil: timestamp,
      definition: json,
      checksum: text(),
      createdAt: timestamp,
      createdBy: id
    },
    [
      "id",
      "engine",
      "version",
      "activeFrom",
      "definition",
      "checksum",
      "createdAt",
      "createdBy"
    ],
    ["activeDateOrder"]
  ),

  AnalysisModelDefinition: object(
    {
      modelId: id,
      version: text(),
      inputSchemaId: id,
      inputSchemaVersion: text(),
      outputSchemaId: id,
      outputSchemaVersion: text(),
      supportedEntityTypes: stringArray,
      lifecycleStatus: enumText(DEFINITION_LIFECYCLE_STATUSES),
      reasonCodeNamespace: text()
    },
    [
      "modelId",
      "version",
      "inputSchemaId",
      "inputSchemaVersion",
      "outputSchemaId",
      "outputSchemaVersion",
      "supportedEntityTypes",
      "lifecycleStatus",
      "reasonCodeNamespace"
    ]
  ),

  AnalysisRun: object(
    {
      id,
      status: enumText(ANALYSIS_RUN_STATUSES),
      cutoffAt: timestamp,
      startedAt: timestamp,
      completedAt: timestamp,
      ruleDefinitionIds: nonEmptyIdArray,
      inputHash: text(),
      createdBy: id
    },
    [
      "id",
      "status",
      "cutoffAt",
      "startedAt",
      "ruleDefinitionIds",
      "inputHash",
      "createdBy"
    ],
    ["runDateOrder"]
  ),

  EvidenceAnalysis: object(
    {
      ...analysisBaseProperties,
      ...targetProperties,
      score,
      dimensionScores: evidenceDimensionScoresSchema,
      inputEvidenceIds: idArray
    },
    [
      ...analysisRequired,
      "score",
      "dimensionScores",
      "inputEvidenceIds"
    ],
    ["exclusiveTargetReference"]
  ),

  ConfidenceAnalysis: object(
    {
      ...analysisBaseProperties,
      ...targetProperties,
      score,
      hardCap: score,
      inputEvidenceAnalysisIds: idArray
    },
    [
      ...analysisRequired,
      "score",
      "hardCap",
      "inputEvidenceAnalysisIds"
    ],
    ["exclusiveTargetReference", "confidenceHardCap"]
  ),

  TrendAnalysis: object(
    {
      ...analysisBaseProperties,
      ...targetProperties,
      windows: array(trendWindowSchema, { minItems: 3 }),
      inputAnalysisIds: idArray
    },
    [...analysisRequired, "windows", "inputAnalysisIds"],
    ["exclusiveTargetReference", "trendWindowsComplete"]
  ),

  MaturityAnalysis: object(
    {
      ...analysisBaseProperties,
      ...targetProperties,
      stage: nullable(enumText(MATURITY_STAGES)),
      score,
      inputAnalysisIds: idArray
    },
    [...analysisRequired, "stage", "score", "inputAnalysisIds"],
    ["exclusiveTargetReference"]
  ),

  RiskAnalysis: object(
    {
      ...analysisBaseProperties,
      ...targetProperties,
      level: enumText(RISK_LEVELS),
      score,
      riskCodes: array(enumText(RISK_CODES), { uniqueItems: true }),
      inputAnalysisIds: idArray
    },
    [
      ...analysisRequired,
      "level",
      "score",
      "riskCodes",
      "inputAnalysisIds"
    ],
    ["exclusiveTargetReference"]
  ),

  RecommendationAnalysis: object(
    {
      ...analysisBaseProperties,
      ...targetProperties,
      verdict: enumText(COACH_VERDICTS),
      score,
      stars,
      positiveFactors: array(text()),
      riskFactors: array(text()),
      inputAnalysisIds: idArray
    },
    [
      ...analysisRequired,
      "verdict",
      "score",
      "stars",
      "positiveFactors",
      "riskFactors",
      "inputAnalysisIds"
    ],
    [
      "exclusiveTargetReference",
      "insufficientRecommendationIsNull",
      "recommendationExplanationConsistency"
    ]
  ),

  CoachAnalysis: object(
    {
      ...analysisBaseProperties,
      ...targetProperties,
      headline: text(),
      verdict: enumText(COACH_VERDICTS),
      positiveFactors: array(text()),
      riskFactors: array(text()),
      actionAdvice: array(text(), { minItems: 1 }),
      inputAnalysisIds: idArray,
      traceId: id
    },
    [
      ...analysisRequired,
      "headline",
      "verdict",
      "positiveFactors",
      "riskFactors",
      "actionAdvice",
      "inputAnalysisIds",
      "traceId"
    ],
    ["exclusiveTargetReference"]
  ),

  AnalysisTrace: object(
    {
      id,
      modelId: id,
      modelVersion: text(),
      outputId: id,
      analysisRunId: id,
      ruleDefinitionIds: nonEmptyIdArray,
      inputEvidenceIds: idArray,
      inputAnalysisIds: idArray,
      calculatedAt: timestamp,
      calculationDetails: json
    },
    [
      "id",
      "modelId",
      "modelVersion",
      "outputId",
      "analysisRunId",
      "ruleDefinitionIds",
      "inputEvidenceIds",
      "inputAnalysisIds",
      "calculatedAt",
      "calculationDetails"
    ]
  ),

  MetaProfile: object(
    {
      id,
      ...targetProperties,
      analysisRunId: id,
      analysisResults: array(metaProfileAnalysisResultSchema, {
        minItems: 1
      }),
      currentAt: timestamp
    },
    [
      "id",
      ...targetRequired,
      "analysisRunId",
      "analysisResults",
      "currentAt"
    ],
    ["exclusiveTargetReference", "profileAnalysisResultsUnique"]
  ),

  WeeklyMetaSnapshot: object(
    {
      id,
      weekStart: date,
      weekEnd: date,
      analysisRunId: id,
      profileIds: idArray,
      immutable: { kind: "boolean", const: true },
      createdAt: timestamp
    },
    [
      "id",
      "weekStart",
      "weekEnd",
      "analysisRunId",
      "profileIds",
      "immutable",
      "createdAt"
    ],
    ["snapshotDateOrder"]
  ),

  MetaTimelineEvent: object(
    {
      id,
      ...targetProperties,
      eventType: text(),
      occurredAt: timestamp,
      snapshotId: id,
      summary: text(),
      sourceEvidenceIds: idArray,
      createdAt: timestamp
    },
    [
      "id",
      ...targetRequired,
      "eventType",
      "occurredAt",
      "summary",
      "sourceEvidenceIds",
      "createdAt"
    ],
    ["exclusiveTargetReference"]
  ),

  ComboRoute: object(
    {
      id,
      name: text(),
      comboId: id,
      primaryEntityId: canonicalEntityId,
      componentEntityIds: canonicalEntityIdArray,
      role: text(),
      evidenceIds: idArray,
      notes: array(text()),
      createdAt: timestamp,
      updatedAt: timestamp
    },
    [
      "id",
      "name",
      "componentEntityIds",
      "role",
      "evidenceIds",
      "notes",
      "createdAt",
      "updatedAt"
    ],
    ["comboRouteSubjectPresent"]
  ),

  ComponentSynergy: object(
    {
      id,
      componentEntityIds: array(canonicalEntityId, {
        minItems: 2,
        uniqueItems: true
      }),
      score,
      confidenceScore: score,
      evidenceIds: idArray,
      reasons: array(text(), { minItems: 1 }),
      analysisRunId: id,
      calculatedAt: timestamp
    },
    [
      "id",
      "componentEntityIds",
      "score",
      "confidenceScore",
      "evidenceIds",
      "reasons",
      "analysisRunId",
      "calculatedAt"
    ]
  ),

  CounterRelationship: object(
    {
      id,
      sourceEntityId: canonicalEntityId,
      sourceComboId: id,
      targetEntityId: canonicalEntityId,
      targetComboId: id,
      score,
      evidenceIds: idArray,
      reasons: array(text(), { minItems: 1 }),
      analysisRunId: id,
      calculatedAt: timestamp
    },
    [
      "id",
      "score",
      "evidenceIds",
      "reasons",
      "analysisRunId",
      "calculatedAt"
    ],
    ["exclusiveCounterReferences"]
  ),

  EditorialNote: object(
    {
      id,
      ...targetProperties,
      title: text(),
      body: text(),
      status: enumText(EDITORIAL_NOTE_STATUSES),
      authorId: id,
      relatedEvidenceIds: idArray,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: timestamp
    },
    [
      "id",
      ...targetRequired,
      "title",
      "body",
      "status",
      "authorId",
      "relatedEvidenceIds",
      "createdAt",
      "updatedAt"
    ],
    ["exclusiveTargetReference"]
  )
};

export { TREND_WINDOWS };
