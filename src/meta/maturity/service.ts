import {
  validateDomainModel,
  type AnalysisModelDefinition,
  type AnalysisModelRegistryReader,
  type JsonValue,
  type MetaProfile,
  type RegistryResolution,
  type ValidationResult
} from "../domain/index.js";
import {
  CONFIDENCE_MODEL_ID,
  CONFIDENCE_MODEL_VERSION,
  type MetaProfileRepository
} from "../confidence/index.js";
import type { EvidenceRepository } from "../evidence/index.js";
import {
  TREND_MODEL_ID,
  TREND_MODEL_VERSION
} from "../trend/index.js";
import { calculateMaturity, MaturityEngineError } from "./engine.js";
import type {
  MaturityAnalysisRequest,
  MaturityModelOutput,
  MaturityServiceResult
} from "./types.js";

export interface MaturityModelRegistry extends AnalysisModelRegistryReader {
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

export class MaturityServiceError extends Error {
  readonly details: readonly string[];

  constructor(message: string, details: readonly string[]) {
    super(message);
    this.name = "MaturityServiceError";
    this.details = details;
  }
}

export function maturityOutputAsJson(output: MaturityModelOutput): JsonValue {
  return {
    entityId: output.entityId,
    maturityStage: output.maturityStage,
    maturityScore: output.maturityScore,
    evidenceVolume: { ...output.evidenceVolume },
    evidenceDuration: { ...output.evidenceDuration },
    sourceDiversity: { ...output.sourceDiversity },
    trendStability: { ...output.trendStability },
    confidenceLevel: output.confidenceLevel,
    reasonCodes: [...output.reasonCodes],
    reasons: [...output.reasons],
    calculatedAt: output.calculatedAt
  };
}

export class MaturityService {
  readonly #evidenceRepository: EvidenceRepository;
  readonly #profileRepository: MetaProfileRepository;
  readonly #models: MaturityModelRegistry;

  constructor(
    evidenceRepository: EvidenceRepository,
    profileRepository: MetaProfileRepository,
    models: MaturityModelRegistry
  ) {
    this.#evidenceRepository = evidenceRepository;
    this.#profileRepository = profileRepository;
    this.#models = models;
  }

  async calculate(
    request: MaturityAnalysisRequest
  ): Promise<MaturityServiceResult> {
    if (
      request.confidenceResult === null ||
      request.trendResults === null
    ) {
      throw new MaturityServiceError(
        "Maturity prerequisites are missing.",
        ["請先以相同 Entity 與 Analysis Date 計算 Confidence 與 Trend。"]
      );
    }
    const resolution = this.#models.resolveModel(
      request.modelId,
      request.modelVersion
    );
    if (resolution.status !== "found") {
      throw new MaturityServiceError("Maturity model is unavailable.", [
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
        confidenceModelVersion: CONFIDENCE_MODEL_VERSION,
        trendModelId: TREND_MODEL_ID,
        trendModelVersion: TREND_MODEL_VERSION
      }
    );
    if (!inputValidation.success) {
      throw new MaturityServiceError(
        "Maturity input validation failed.",
        inputValidation.issues.map(
          (issue) => `${issue.path}: ${issue.message}`
        )
      );
    }

    let output: MaturityModelOutput;
    try {
      output = calculateMaturity({
        entityId: request.entityId,
        evidenceRecords,
        confidenceResult: request.confidenceResult,
        trendResults: request.trendResults,
        analysisDate: request.analysisDate,
        modelId: request.modelId,
        modelVersion: request.modelVersion
      });
    } catch (error) {
      if (error instanceof MaturityEngineError) {
        throw new MaturityServiceError(error.message, [error.message]);
      }
      throw error;
    }
    const outputJson = maturityOutputAsJson(output);
    const outputValidation = this.#models.validateOutput(
      request.modelId,
      request.modelVersion,
      outputJson
    );
    if (!outputValidation.success) {
      throw new MaturityServiceError(
        "Maturity output validation failed.",
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
        `analysis-snapshot-${request.entityId}-${request.analysisDate}`
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
        analysisRunId: `maturity-run-${request.analysisDate}`,
        analysisResults: [...previousResults, currentResult],
        currentAt: output.calculatedAt
      },
      { analysisModels: this.#models }
    );
    if (!profileValidation.success) {
      throw new MaturityServiceError(
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
