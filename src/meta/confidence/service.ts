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
import { calculateConfidence, ConfidenceEngineError } from "./engine.js";
import type { MetaProfileRepository } from "./repository.js";
import type {
  ConfidenceAnalysisRequest,
  ConfidenceModelOutput,
  ConfidenceServiceResult
} from "./types.js";

export interface ConfidenceModelRegistry
extends AnalysisModelRegistryReader {
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

export class ConfidenceServiceError extends Error {
  readonly details: readonly string[];

  constructor(message: string, details: readonly string[]) {
    super(message);
    this.name = "ConfidenceServiceError";
    this.details = details;
  }
}

export function confidenceOutputAsJson(
  output: ConfidenceModelOutput
): JsonValue {
  return {
    entityId: output.entityId,
    confidenceScore: output.confidenceScore,
    hardCap: output.hardCap,
    confidenceLevel: output.confidenceLevel,
    evidenceCount: output.evidenceCount,
    sourceDiversity: {
      sourceCount: output.sourceDiversity.sourceCount,
      score: output.sourceDiversity.score
    },
    recency: {
      newestEvidenceDate: output.recency.newestEvidenceDate,
      ageDays: output.recency.ageDays,
      score: output.recency.score
    },
    completeness: {
      knownDimensionCount: output.completeness.knownDimensionCount,
      totalDimensionCount: output.completeness.totalDimensionCount,
      score: output.completeness.score
    },
    consistency: {
      score: output.consistency.score,
      spread: output.consistency.spread
    },
    dimensions: output.dimensions.map((item) => ({
      dimensionId: item.dimensionId,
      score: item.score,
      explanation: item.explanation
    })),
    includedEvidenceIds: [...output.includedEvidenceIds],
    excludedEvidence: output.excludedEvidence.map((item) => ({
      evidenceId: item.evidenceId,
      reasonCode: item.reasonCode,
      reason: item.reason
    })),
    reasonCodes: [...output.reasonCodes],
    reasons: [...output.reasons],
    positiveFactors: [...output.positiveFactors],
    negativeFactors: [...output.negativeFactors],
    calculatedAt: output.calculatedAt
  };
}

export class ConfidenceService {
  readonly #evidenceRepository: EvidenceRepository;
  readonly #profileRepository: MetaProfileRepository;
  readonly #models: ConfidenceModelRegistry;

  constructor(
    evidenceRepository: EvidenceRepository,
    profileRepository: MetaProfileRepository,
    models: ConfidenceModelRegistry
  ) {
    this.#evidenceRepository = evidenceRepository;
    this.#profileRepository = profileRepository;
    this.#models = models;
  }

  async calculate(
    request: ConfidenceAnalysisRequest
  ): Promise<ConfidenceServiceResult> {
    const resolution = this.#models.resolveModel(
      request.modelId,
      request.modelVersion
    );
    if (resolution.status !== "found") {
      throw new ConfidenceServiceError(
        "Confidence model is unavailable.",
        [`Model resolution status: ${resolution.status}.`]
      );
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
        evidenceIds: evidenceRecords.map((entry) => entry.record.id)
      }
    );
    if (!inputValidation.success) {
      throw new ConfidenceServiceError(
        "Confidence input validation failed.",
        inputValidation.issues.map(
          (issue) => `${issue.path}: ${issue.message}`
        )
      );
    }

    let output: ConfidenceModelOutput;
    try {
      output = calculateConfidence({
        entityId: request.entityId,
        evidenceRecords,
        analysisDate: request.analysisDate,
        modelId: request.modelId,
        modelVersion: request.modelVersion
      });
    } catch (error) {
      if (error instanceof ConfidenceEngineError) {
        throw new ConfidenceServiceError(error.message, [error.message]);
      }
      throw error;
    }

    const outputJson = confidenceOutputAsJson(output);
    const outputValidation = this.#models.validateOutput(
      request.modelId,
      request.modelVersion,
      outputJson
    );
    if (!outputValidation.success) {
      throw new ConfidenceServiceError(
        "Confidence output validation failed.",
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
    const profileCandidate = {
      id: previous?.id ?? `meta-profile-${request.entityId}`,
      targetType: "entity",
      entityId: request.entityId,
      analysisRunId: `confidence-run-${request.analysisDate}`,
      analysisResults: [...previousResults, currentResult],
      currentAt: output.calculatedAt
    };
    const profileValidation = validateDomainModel(
      "MetaProfile",
      profileCandidate,
      { analysisModels: this.#models }
    );
    if (!profileValidation.success) {
      throw new ConfidenceServiceError(
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
