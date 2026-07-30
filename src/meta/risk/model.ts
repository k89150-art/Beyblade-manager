import {
  AnalysisModelRegistry,
  MATURITY_STAGES,
  RISK_CODES,
  RISK_LEVELS,
  type ObjectSchema
} from "../domain/index.js";
import { CONFIDENCE_LEVELS } from "../confidence/index.js";
import { TREND_DIRECTIONS } from "../trend/index.js";

export const RISK_MODEL_ID = "risk-mvp";
export const RISK_MODEL_VERSION = "1.0.0";
export const RISK_REASON_NAMESPACE = "risk";

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
const stringArray = {
  kind: "array",
  items: text,
  uniqueItems: true
} as const;

const trendSummarySchema: ObjectSchema = {
  kind: "object",
  properties: {
    windowWeeks: {
      kind: "number",
      minimum: 4,
      maximum: 12,
      integer: true
    },
    direction: {
      kind: "string",
      minLength: 1,
      enum: TREND_DIRECTIONS
    },
    confidence: nullableScore
  },
  required: ["windowWeeks", "direction", "confidence"],
  additionalProperties: false,
  refinements: []
};

export const RISK_INPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    analysisDate: date,
    evidenceIds: stringArray,
    confidenceModelVersion: text,
    trendModelVersion: text,
    maturityModelVersion: text
  },
  required: [
    "entityId",
    "analysisDate",
    "evidenceIds",
    "confidenceModelVersion",
    "trendModelVersion",
    "maturityModelVersion"
  ],
  additionalProperties: false,
  refinements: []
};

export const RISK_OUTPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    riskScore: nullableScore,
    riskLevel: { kind: "string", minLength: 1, enum: RISK_LEVELS },
    riskCodes: {
      kind: "array",
      items: { kind: "string", minLength: 1, enum: RISK_CODES },
      uniqueItems: true
    },
    reasons: { kind: "array", items: text, minItems: 1 },
    contributingFactors: { kind: "array", items: text },
    mitigatingFactors: { kind: "array", items: text },
    evidenceCount: number,
    confidenceLevel: {
      kind: "string",
      minLength: 1,
      enum: CONFIDENCE_LEVELS
    },
    maturityStage: {
      kind: "nullable",
      inner: { kind: "string", minLength: 1, enum: MATURITY_STAGES }
    },
    trendSummary: {
      kind: "array",
      items: trendSummarySchema,
      minItems: 3
    },
    calculatedAt: timestamp
  },
  required: [
    "entityId",
    "riskScore",
    "riskLevel",
    "riskCodes",
    "reasons",
    "contributingFactors",
    "mitigatingFactors",
    "evidenceCount",
    "confidenceLevel",
    "maturityStage",
    "trendSummary",
    "calculatedAt"
  ],
  additionalProperties: false,
  refinements: []
};

export function registerRiskAnalysisModel(
  registry: AnalysisModelRegistry
): void {
  registry.registerSchema(
    "risk-mvp-input",
    RISK_MODEL_VERSION,
    RISK_INPUT_SCHEMA
  );
  registry.registerSchema(
    "risk-mvp-output",
    RISK_MODEL_VERSION,
    RISK_OUTPUT_SCHEMA
  );
  registry.registerModel({
    modelId: RISK_MODEL_ID,
    version: RISK_MODEL_VERSION,
    inputSchemaId: "risk-mvp-input",
    inputSchemaVersion: RISK_MODEL_VERSION,
    outputSchemaId: "risk-mvp-output",
    outputSchemaVersion: RISK_MODEL_VERSION,
    supportedEntityTypes: ["blade"],
    lifecycleStatus: "active",
    reasonCodeNamespace: RISK_REASON_NAMESPACE
  });
}
