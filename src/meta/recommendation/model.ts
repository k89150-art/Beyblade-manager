import {
  AnalysisModelRegistry,
  COACH_VERDICTS,
  type ObjectSchema
} from "../domain/index.js";

export const RECOMMENDATION_MODEL_ID = "recommendation-mvp";
export const RECOMMENDATION_MODEL_VERSION = "1.0.0";
export const RECOMMENDATION_REASON_NAMESPACE = "recommendation";

const text = { kind: "string", minLength: 1 } as const;
const date = { kind: "string", minLength: 1, format: "date" } as const;
const timestamp = {
  kind: "string",
  minLength: 1,
  format: "date-time"
} as const;
const score = { kind: "number", minimum: 0, maximum: 100 } as const;
const nullableScore = { kind: "nullable", inner: score } as const;
const nullableStars = {
  kind: "nullable",
  inner: { kind: "number", minimum: 1, maximum: 5, integer: true }
} as const;
const stringArray = {
  kind: "array",
  items: text,
  uniqueItems: true
} as const;

export const RECOMMENDATION_INPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    analysisDate: date,
    evidenceIds: stringArray,
    confidenceModelVersion: text,
    trendModelVersion: text,
    maturityModelVersion: text,
    riskModelVersion: text,
    supportingAnalysisIds: stringArray
  },
  required: [
    "entityId",
    "analysisDate",
    "evidenceIds",
    "confidenceModelVersion",
    "trendModelVersion",
    "maturityModelVersion",
    "riskModelVersion",
    "supportingAnalysisIds"
  ],
  additionalProperties: false,
  refinements: []
};

export const RECOMMENDATION_OUTPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    recommendationStatus: {
      kind: "string",
      minLength: 1,
      enum: COACH_VERDICTS
    },
    recommendationStrength: nullableScore,
    recommendationScore: nullableScore,
    stars: nullableStars,
    recommendationCodes: stringArray,
    title: text,
    summary: text,
    reasons: { kind: "array", items: text, minItems: 1 },
    cautions: { kind: "array", items: text },
    suggestedActions: { kind: "array", items: text, minItems: 1 },
    supportingAnalysisIds: stringArray,
    calculatedAt: timestamp
  },
  required: [
    "entityId",
    "recommendationStatus",
    "recommendationStrength",
    "recommendationScore",
    "stars",
    "recommendationCodes",
    "title",
    "summary",
    "reasons",
    "cautions",
    "suggestedActions",
    "supportingAnalysisIds",
    "calculatedAt"
  ],
  additionalProperties: false,
  refinements: []
};

export function registerRecommendationAnalysisModel(
  registry: AnalysisModelRegistry
): void {
  registry.registerSchema(
    "recommendation-mvp-input",
    RECOMMENDATION_MODEL_VERSION,
    RECOMMENDATION_INPUT_SCHEMA
  );
  registry.registerSchema(
    "recommendation-mvp-output",
    RECOMMENDATION_MODEL_VERSION,
    RECOMMENDATION_OUTPUT_SCHEMA
  );
  registry.registerModel({
    modelId: RECOMMENDATION_MODEL_ID,
    version: RECOMMENDATION_MODEL_VERSION,
    inputSchemaId: "recommendation-mvp-input",
    inputSchemaVersion: RECOMMENDATION_MODEL_VERSION,
    outputSchemaId: "recommendation-mvp-output",
    outputSchemaVersion: RECOMMENDATION_MODEL_VERSION,
    supportedEntityTypes: ["blade"],
    lifecycleStatus: "active",
    reasonCodeNamespace: RECOMMENDATION_REASON_NAMESPACE
  });
}
