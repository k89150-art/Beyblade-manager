import {
  AnalysisModelRegistry,
  type ObjectSchema
} from "../domain/index.js";
import { CONFIDENCE_LEVELS } from "./types.js";

export const CONFIDENCE_MODEL_ID = "confidence-mvp";
export const CONFIDENCE_MODEL_VERSION = "1.0.0";
export const CONFIDENCE_RULE_DEFINITION_ID =
  "confidence-rules-v2-mvp-1.0.0";
export const CONFIDENCE_REASON_NAMESPACE = "confidence";

const text = { kind: "string", minLength: 1 } as const;
const id = text;
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
const nullableDate = { kind: "nullable", inner: date } as const;
const stringArray = {
  kind: "array",
  items: text,
  uniqueItems: true
} as const;

const sourceDiversitySchema: ObjectSchema = {
  kind: "object",
  properties: {
    sourceCount: number,
    score: nullableScore
  },
  required: ["sourceCount", "score"],
  additionalProperties: false,
  refinements: []
};

const recencySchema: ObjectSchema = {
  kind: "object",
  properties: {
    newestEvidenceDate: nullableDate,
    ageDays: nullableNumber,
    score: nullableScore
  },
  required: ["newestEvidenceDate", "ageDays", "score"],
  additionalProperties: false,
  refinements: []
};

const completenessSchema: ObjectSchema = {
  kind: "object",
  properties: {
    knownDimensionCount: number,
    totalDimensionCount: number,
    score: nullableScore
  },
  required: ["knownDimensionCount", "totalDimensionCount", "score"],
  additionalProperties: false,
  refinements: []
};

const consistencySchema: ObjectSchema = {
  kind: "object",
  properties: {
    score: nullableScore,
    spread: nullableNumber
  },
  required: ["score", "spread"],
  additionalProperties: false,
  refinements: []
};

const dimensionResultSchema: ObjectSchema = {
  kind: "object",
  properties: {
    dimensionId: text,
    score: nullableScore,
    explanation: text
  },
  required: ["dimensionId", "score", "explanation"],
  additionalProperties: false,
  refinements: []
};

const excludedEvidenceSchema: ObjectSchema = {
  kind: "object",
  properties: {
    evidenceId: id,
    reasonCode: text,
    reason: text
  },
  required: ["evidenceId", "reasonCode", "reason"],
  additionalProperties: false,
  refinements: []
};

export const CONFIDENCE_INPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    analysisDate: date,
    evidenceIds: stringArray
  },
  required: ["entityId", "analysisDate", "evidenceIds"],
  additionalProperties: false,
  refinements: []
};

export const CONFIDENCE_OUTPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    confidenceScore: nullableScore,
    hardCap: nullableScore,
    confidenceLevel: {
      kind: "string",
      minLength: 1,
      enum: CONFIDENCE_LEVELS
    },
    evidenceCount: number,
    sourceDiversity: sourceDiversitySchema,
    recency: recencySchema,
    completeness: completenessSchema,
    consistency: consistencySchema,
    dimensions: {
      kind: "array",
      items: dimensionResultSchema,
      minItems: 1
    },
    includedEvidenceIds: stringArray,
    excludedEvidence: {
      kind: "array",
      items: excludedEvidenceSchema
    },
    reasonCodes: {
      kind: "array",
      items: text,
      minItems: 1,
      uniqueItems: true
    },
    reasons: {
      kind: "array",
      items: text,
      minItems: 1
    },
    positiveFactors: {
      kind: "array",
      items: text
    },
    negativeFactors: {
      kind: "array",
      items: text
    },
    calculatedAt: timestamp
  },
  required: [
    "entityId",
    "confidenceScore",
    "hardCap",
    "confidenceLevel",
    "evidenceCount",
    "sourceDiversity",
    "recency",
    "completeness",
    "consistency",
    "dimensions",
    "includedEvidenceIds",
    "excludedEvidence",
    "reasonCodes",
    "reasons",
    "positiveFactors",
    "negativeFactors",
    "calculatedAt"
  ],
  additionalProperties: false,
  refinements: []
};

export function registerConfidenceAnalysisModel(
  registry: AnalysisModelRegistry
): void {
  registry.registerSchema(
    "confidence-mvp-input",
    CONFIDENCE_MODEL_VERSION,
    CONFIDENCE_INPUT_SCHEMA
  );
  registry.registerSchema(
    "confidence-mvp-output",
    CONFIDENCE_MODEL_VERSION,
    CONFIDENCE_OUTPUT_SCHEMA
  );
  registry.registerModel({
    modelId: CONFIDENCE_MODEL_ID,
    version: CONFIDENCE_MODEL_VERSION,
    inputSchemaId: "confidence-mvp-input",
    inputSchemaVersion: CONFIDENCE_MODEL_VERSION,
    outputSchemaId: "confidence-mvp-output",
    outputSchemaVersion: CONFIDENCE_MODEL_VERSION,
    supportedEntityTypes: ["blade"],
    lifecycleStatus: "active",
    reasonCodeNamespace: CONFIDENCE_REASON_NAMESPACE
  });
}

export function createConfidenceAnalysisModelRegistry(): AnalysisModelRegistry {
  const registry = new AnalysisModelRegistry();
  registerConfidenceAnalysisModel(registry);
  registry.seal();
  return registry;
}
