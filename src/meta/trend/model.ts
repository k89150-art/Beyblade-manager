import {
  AnalysisModelRegistry,
  type ObjectSchema
} from "../domain/index.js";
import { registerConfidenceAnalysisModel } from "../confidence/model.js";
import { TREND_DIRECTIONS } from "./types.js";

export const TREND_MODEL_ID = "trend-mvp";
export const TREND_MODEL_VERSION = "1.0.0";
export const TREND_REASON_NAMESPACE = "trend";

const text = { kind: "string", minLength: 1 } as const;
const date = { kind: "string", minLength: 1, format: "date" } as const;
const timestamp = {
  kind: "string",
  minLength: 1,
  format: "date-time"
} as const;
const number = { kind: "number", minimum: 0 } as const;
const score = { kind: "number", minimum: 0, maximum: 100 } as const;
const nullableSignedNumber = {
  kind: "nullable",
  inner: { kind: "number" }
} as const;
const nullableScore = { kind: "nullable", inner: score } as const;
const stringArray = {
  kind: "array",
  items: text,
  uniqueItems: true
} as const;

const excludedEvidenceSchema: ObjectSchema = {
  kind: "object",
  properties: {
    evidenceId: text,
    reasonCode: text,
    reason: text
  },
  required: ["evidenceId", "reasonCode", "reason"],
  additionalProperties: false,
  refinements: []
};

const trendWindowSchema: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    windowWeeks: {
      kind: "number",
      minimum: 4,
      maximum: 12,
      integer: true
    },
    periodStart: date,
    periodEnd: date,
    comparisonStart: date,
    comparisonEnd: date,
    trendDirection: {
      kind: "string",
      minLength: 1,
      enum: TREND_DIRECTIONS
    },
    trendStrength: nullableScore,
    currentValue: nullableScore,
    previousValue: nullableScore,
    absoluteChange: nullableSignedNumber,
    percentageChange: nullableSignedNumber,
    sampleCount: number,
    validSampleCount: number,
    currentSampleCount: number,
    comparisonSampleCount: number,
    confidence: nullableScore,
    reasonCodes: stringArray,
    reasons: { kind: "array", items: text, minItems: 1 },
    includedEvidenceIds: stringArray,
    excludedEvidence: { kind: "array", items: excludedEvidenceSchema },
    calculatedAt: timestamp
  },
  required: [
    "entityId",
    "windowWeeks",
    "periodStart",
    "periodEnd",
    "comparisonStart",
    "comparisonEnd",
    "trendDirection",
    "trendStrength",
    "currentValue",
    "previousValue",
    "absoluteChange",
    "percentageChange",
    "sampleCount",
    "validSampleCount",
    "currentSampleCount",
    "comparisonSampleCount",
    "confidence",
    "reasonCodes",
    "reasons",
    "includedEvidenceIds",
    "excludedEvidence",
    "calculatedAt"
  ],
  additionalProperties: false,
  refinements: []
};

export const TREND_INPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    analysisDate: date,
    evidenceIds: stringArray,
    confidenceModelId: text,
    confidenceModelVersion: text
  },
  required: [
    "entityId",
    "analysisDate",
    "evidenceIds",
    "confidenceModelId",
    "confidenceModelVersion"
  ],
  additionalProperties: false,
  refinements: []
};

export const TREND_OUTPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    analysisDate: date,
    windows: {
      kind: "array",
      items: trendWindowSchema,
      minItems: 3
    },
    reasonCodes: stringArray,
    calculatedAt: timestamp
  },
  required: [
    "entityId",
    "analysisDate",
    "windows",
    "reasonCodes",
    "calculatedAt"
  ],
  additionalProperties: false,
  refinements: []
};

export function registerTrendAnalysisModel(
  registry: AnalysisModelRegistry
): void {
  registry.registerSchema(
    "trend-mvp-input",
    TREND_MODEL_VERSION,
    TREND_INPUT_SCHEMA
  );
  registry.registerSchema(
    "trend-mvp-output",
    TREND_MODEL_VERSION,
    TREND_OUTPUT_SCHEMA
  );
  registry.registerModel({
    modelId: TREND_MODEL_ID,
    version: TREND_MODEL_VERSION,
    inputSchemaId: "trend-mvp-input",
    inputSchemaVersion: TREND_MODEL_VERSION,
    outputSchemaId: "trend-mvp-output",
    outputSchemaVersion: TREND_MODEL_VERSION,
    supportedEntityTypes: ["blade"],
    lifecycleStatus: "active",
    reasonCodeNamespace: TREND_REASON_NAMESPACE
  });
}

export function createTrendAnalysisModelRegistry(): AnalysisModelRegistry {
  const registry = new AnalysisModelRegistry();
  registerConfidenceAnalysisModel(registry);
  registerTrendAnalysisModel(registry);
  registry.seal();
  return registry;
}
