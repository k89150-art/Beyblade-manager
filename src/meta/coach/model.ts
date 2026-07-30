import {
  AnalysisModelRegistry,
  COACH_VERDICTS,
  type ObjectSchema
} from "../domain/index.js";

export const COACH_MODEL_ID = "meta-coach-mvp";
export const COACH_MODEL_VERSION = "1.0.0";
export const COACH_REASON_NAMESPACE = "coach";

const text = { kind: "string", minLength: 1 } as const;
const date = { kind: "string", minLength: 1, format: "date" } as const;
const timestamp = {
  kind: "string",
  minLength: 1,
  format: "date-time"
} as const;
const stringArray = {
  kind: "array",
  items: text,
  uniqueItems: true
} as const;

export const COACH_INPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    analysisDate: date,
    locale: { kind: "string", minLength: 1, enum: ["zh-TW"] },
    dataMode: {
      kind: "string",
      minLength: 1,
      enum: ["development", "production"]
    },
    traceReferences: stringArray
  },
  required: [
    "entityId",
    "analysisDate",
    "locale",
    "dataMode",
    "traceReferences"
  ],
  additionalProperties: false,
  refinements: []
};

export const COACH_OUTPUT_SCHEMA: ObjectSchema = {
  kind: "object",
  properties: {
    entityId: { kind: "string", minLength: 1, format: "canonical-entity-id" },
    locale: { kind: "string", minLength: 1, enum: ["zh-TW"] },
    headline: text,
    verdict: { kind: "string", minLength: 1, enum: COACH_VERDICTS },
    overallAssessment: text,
    whatIsWorking: { kind: "array", items: text },
    whatToWatch: { kind: "array", items: text },
    recommendedNextStep: { kind: "array", items: text, minItems: 1 },
    evidenceSummary: text,
    confidenceExplanation: text,
    trendExplanation: text,
    riskExplanation: text,
    recommendationExplanation: text,
    warnings: { kind: "array", items: text },
    traceReferences: stringArray,
    generatedAt: timestamp
  },
  required: [
    "entityId",
    "locale",
    "headline",
    "verdict",
    "overallAssessment",
    "whatIsWorking",
    "whatToWatch",
    "recommendedNextStep",
    "evidenceSummary",
    "confidenceExplanation",
    "trendExplanation",
    "riskExplanation",
    "recommendationExplanation",
    "warnings",
    "traceReferences",
    "generatedAt"
  ],
  additionalProperties: false,
  refinements: []
};

export function registerCoachAnalysisModel(
  registry: AnalysisModelRegistry
): void {
  registry.registerSchema(
    "meta-coach-mvp-input",
    COACH_MODEL_VERSION,
    COACH_INPUT_SCHEMA
  );
  registry.registerSchema(
    "meta-coach-mvp-output",
    COACH_MODEL_VERSION,
    COACH_OUTPUT_SCHEMA
  );
  registry.registerModel({
    modelId: COACH_MODEL_ID,
    version: COACH_MODEL_VERSION,
    inputSchemaId: "meta-coach-mvp-input",
    inputSchemaVersion: COACH_MODEL_VERSION,
    outputSchemaId: "meta-coach-mvp-output",
    outputSchemaVersion: COACH_MODEL_VERSION,
    supportedEntityTypes: ["blade"],
    lifecycleStatus: "active",
    reasonCodeNamespace: COACH_REASON_NAMESPACE
  });
}
