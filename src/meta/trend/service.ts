import {
  validateDomainModel,
  type AnalysisModelDefinition,
  type AnalysisModelRegistryReader,
  type JsonValue,
  type MetaProfile,
  type RegistryResolution,
  type ValidationResult
} from "../domain/index.js";
import type { EvidenceRepository } from "../evidence/index.js";
import {
  CONFIDENCE_MODEL_ID,
  CONFIDENCE_MODEL_VERSION,
  type MetaProfileRepository
} from "../confidence/index.js";
import { calculateTrendWindows, TrendEngineError } from "./engine.js";
import type {
  TrendAnalysisRequest,
  TrendModelOutput,
  TrendServiceResult,
  TrendWindowOutput
} from "./types.js";

export interface TrendModelRegistry extends AnalysisModelRegistryReader {
  validateInput(
    modelId: string,
    version: string,
    value: unknown
  ): ValidationResult<JsonValue>;
  resolveModel(
    modelId: string,
    version: string
  ): RegistryResolution<AnalysisModelDefinition>;
}

export class TrendServiceError extends Error {
  readonly details: readonly string[];

  constructor(message: string, details: readonly string[]) {
    super(message);
    this.name = "TrendServiceError";
    this.details = details;
  }
}

function windowAsJson(window: TrendWindowOutput): JsonValue {
  return {
    entityId: window.entityId,
    windowWeeks: window.windowWeeks,
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    comparisonStart: window.comparisonStart,
    comparisonEnd: window.comparisonEnd,
    trendDirection: window.trendDirection,
    trendStrength: window.trendStrength,
    currentValue: window.currentValue,
    previousValue: window.previousValue,
    absoluteChange: window.absoluteChange,
    percentageChange: window.percentageChange,
    sampleCount: window.sampleCount,
    validSampleCount: window.validSampleCount,
    currentSampleCount: window.currentSampleCount,
    comparisonSampleCount: window.comparisonSampleCount,
    confidence: window.confidence,
    reasonCodes: [...window.reasonCodes],
    reasons: [...window.reasons],
    includedEvidenceIds: [...window.includedEvidenceIds],
    excludedEvidence: window.excludedEvidence.map((item) => ({
      evidenceId: item.evidenceId,
      reasonCode: item.reasonCode,
      reason: item.reason
    })),
    calculatedAt: window.calculatedAt
  };
}

export function trendOutputAsJson(output: TrendModelOutput): JsonValue {
  return {
    entityId: output.entityId,
    analysisDate: output.analysisDate,
    windows: output.windows.map(windowAsJson),
    reasonCodes: [...output.reasonCodes],
    calculatedAt: output.calculatedAt
  };
}

export class TrendService {
  readonly #evidenceRepository: EvidenceRepository;
  readonly #profileRepository: MetaProfileRepository;
  readonly #models: TrendModelRegistry;

  constructor(
    evidenceRepository: EvidenceRepository,
    profileRepository: MetaProfileRepository,
    models: TrendModelRegistry
  ) {
    this.#evidenceRepository = evidenceRepository;
    this.#profileRepository = profileRepository;
    this.#models = models;
  }

  async calculate(
    request: TrendAnalysisRequest
  ): Promise<TrendServiceResult> {
    const resolution = this.#models.resolveModel(
      request.modelId,
      request.modelVersion
    );
    if (resolution.status !== "found") {
      throw new TrendServiceError("Trend model is unavailable.", [
        `Model resolution status: ${resolution.status}.`
      ]);
    }

    const evidenceRecords = await this.#evidenceRepository.list({
      entityId: request.entityId,
      sortDirection: "descending"
    });
    const inputValidation = this.#models.validateInput(
      request.modelId,
      request.modelVersion,
      {
        entityId: request.entityId,
        analysisDate: request.analysisDate,
        evidenceIds: evidenceRecords.map((entry) => entry.record.id),
        confidenceModelId: CONFIDENCE_MODEL_ID,
        confidenceModelVersion: CONFIDENCE_MODEL_VERSION
      }
    );
    if (!inputValidation.success) {
      throw new TrendServiceError(
        "Trend input validation failed.",
        inputValidation.issues.map(
          (issue) => `${issue.path}: ${issue.message}`
        )
      );
    }

    let windows: readonly TrendWindowOutput[];
    try {
      windows = calculateTrendWindows({
        entityId: request.entityId,
        evidenceRecords,
        confidenceResult: request.confidenceResult,
        analysisDate: request.analysisDate,
        modelId: request.modelId,
        modelVersion: request.modelVersion
      });
    } catch (error) {
      if (error instanceof TrendEngineError) {
        throw new TrendServiceError(error.message, [error.message]);
      }
      throw error;
    }
    const output: TrendModelOutput = {
      entityId: request.entityId,
      analysisDate: request.analysisDate,
      windows,
      reasonCodes: [
        ...new Set(windows.flatMap((window) => window.reasonCodes))
      ],
      calculatedAt: `${request.analysisDate}T00:00:00.000Z`
    };
    const outputJson = trendOutputAsJson(output);
    const outputValidation = this.#models.validateOutput(
      request.modelId,
      request.modelVersion,
      outputJson
    );
    if (!outputValidation.success) {
      throw new TrendServiceError(
        "Trend output validation failed.",
        outputValidation.issues.map(
          (issue) => `${issue.path}: ${issue.message}`
        )
      );
    }

    const previous = await this.#profileRepository.getByEntityId(
      request.entityId
    );
    const currentResult = {
      modelId: request.modelId,
      modelVersion: request.modelVersion,
      generatedAt: output.calculatedAt,
      output: outputJson,
      reasonCodes: output.reasonCodes,
      sourceSnapshotId:
        `evidence-snapshot-${request.entityId}-${request.analysisDate}`
    };
    const previousResults =
      previous?.analysisResults.filter(
        (result) =>
          result.modelId !== request.modelId ||
          result.modelVersion !== request.modelVersion
      ) ?? [];
    const profileValidation = validateDomainModel(
      "MetaProfile",
      {
        id: previous?.id ?? `meta-profile-${request.entityId}`,
        targetType: "entity",
        entityId: request.entityId,
        analysisRunId: `trend-run-${request.analysisDate}`,
        analysisResults: [...previousResults, currentResult],
        currentAt: output.calculatedAt
      },
      { analysisModels: this.#models }
    );
    if (!profileValidation.success) {
      throw new TrendServiceError(
        "Meta Profile validation failed.",
        profileValidation.issues.map(
          (issue) => `${issue.path}: ${issue.message}`
        )
      );
    }

    const profile: MetaProfile = profileValidation.data;
    await this.#profileRepository.save(profile);
    return { output, profile };
  }
}
