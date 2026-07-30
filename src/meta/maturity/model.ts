import {
  AnalysisModelRegistry,
  MATURITY_STAGES,
  type ObjectSchema
} from "../domain/index.js";
import { CONFIDENCE_LEVELS } from "../confidence/index.js";
import { registerConfidenceAnalysisModel } from "../confidence/model.js";
import { registerTrendAnalysisModel } from "../trend/model.js";

export const MATURITY_MODEL_ID = "maturity-mvp";
export const MATURITY_MODEL_VERSION = "1.0.0";
export const MATURITY_REASON_NAMESPACE = "maturity";

const text = { kind: "string", minLength: 1 } as const;
const date = { kind: "string", minLength: 1, format: "date" } as const;
const timestamp = {
  kind: "string",
  minLength: 1,
  format: "date-time"
} as const;
const number = { kind: "number", minimum: 0 } as const;
const score = { kind: "number", minimum: 0, maximum: 100 } as const;
const nullableScore = { kind: "nullable", inner: score } as const;
const nullableNumber = { kind: "nullable", inner: number } as const;
const stringArray = {
  kind: "array",
  items: text,
  uniqueItems: true
} as const;

const metricSchema: ObjectSchema = {
  kind: "object",
  properties: {
    value: nullableNumber,
    score: nullableScore
  },
  required: ["value", "score"],
  additionalProperties: false,
  refinements: []
};

export const MATURITY_INPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    analysisDate: date,
    evidenceIds: stringArray,
    confidenceModelId: text,
    confidenceModelVersion: text,
    trendModelId: text,
    trendModelVersion: text
  },
  required: [
    "entityId",
    "analysisDate",
    "evidenceIds",
    "confidenceModelId",
    "confidenceModelVersion",
    "trendModelId",
    "trendModelVersion"
  ],
  additionalProperties: false,
  refinements: []
};

export const MATURITY_OUTPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    maturityStage: {
      kind: "nullable",
      inner: { kind: "string", minLength: 1, enum: MATURITY_STAGES }
    },
    maturityScore: nullableScore,
    evidenceVolume: metricSchema,
    evidenceDuration: metricSchema,
    sourceDiversity: metricSchema,
    trendStability: metricSchema,
    confidenceLevel: {
      kind: "string",
      minLength: 1,
      enum: CONFIDENCE_LEVELS
    },
    reasonCodes: stringArray,
    reasons: { kind: "array", items: text, minItems: 1 },
    calculatedAt: timestamp
  },
  required: [
    "entityId",
    "maturityStage",
    "maturityScore",
    "evidenceVolume",
    "evidenceDuration",
    "sourceDiversity",
    "trendStability",
    "confidenceLevel",
    "reasonCodes",
    "reasons",
    "calculatedAt"
  ],
  additionalProperties: false,
  refinements: []
};

export function registerMaturityAnalysisModel(
  registry: AnalysisModelRegistry
): void {
  registry.registerSchema(
    "maturity-mvp-input",
    MATURITY_MODEL_VERSION,
    MATURITY_INPUT_SCHEMA
  );
  registry.registerSchema(
    "maturity-mvp-output",
    MATURITY_MODEL_VERSION,
    MATURITY_OUTPUT_SCHEMA
  );
  registry.registerModel({
    modelId: MATURITY_MODEL_ID,
    version: MATURITY_MODEL_VERSION,
    inputSchemaId: "maturity-mvp-input",
    inputSchemaVersion: MATURITY_MODEL_VERSION,
    outputSchemaId: "maturity-mvp-output",
    outputSchemaVersion: MATURITY_MODEL_VERSION,
    supportedEntityTypes: ["blade"],
    lifecycleStatus: "active",
    reasonCodeNamespace: MATURITY_REASON_NAMESPACE
  });
}

export function createPhase4AnalysisModelRegistry(): AnalysisModelRegistry {
  const registry = new AnalysisModelRegistry();
  registerConfidenceAnalysisModel(registry);
  registerTrendAnalysisModel(registry);
  registerMaturityAnalysisModel(registry);
  registry.seal();
  return registry;
}
