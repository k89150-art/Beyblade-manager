import {
  validateDomainModel,
  type AnalysisModelDefinition,
  type AnalysisModelRegistryReader,
  type CatalogEntityRegistryReader,
  type JsonValue,
  type MetaProfile,
  type RegistryResolution,
  type ValidationResult
} from "../domain/index.js";
import {
  COACH_MODEL_ID,
  generateMetaCoach,
  type MetaCoachEngineInput,
  type MetaCoachModelOutput
} from "../coach/index.js";
import {
  CONFIDENCE_MODEL_ID,
  calculateConfidence,
  confidenceOutputAsJson,
  type MetaProfileRepository
} from "../confidence/index.js";
import type {
  EvidenceEntry,
  EvidenceRepository
} from "../evidence/index.js";
import {
  MATURITY_MODEL_ID,
  calculateMaturity,
  maturityOutputAsJson
} from "../maturity/index.js";
import {
  RECOMMENDATION_MODEL_ID,
  calculateRecommendation,
  type RecommendationModelOutput
} from "../recommendation/index.js";
import {
  RISK_MODEL_ID,
  calculateRisk,
  type RiskModelOutput
} from "../risk/index.js";
import {
  TREND_MODEL_ID,
  calculateTrendWindows,
  trendOutputAsJson,
  type TrendModelOutput
} from "../trend/index.js";
import type {
  CoachStageRequest,
  FullAnalysisRequest,
  FullAnalysisResult,
  PipelineStage,
  PipelineTraceIds,
  RecommendationStageRequest,
  RiskStageRequest
} from "./types.js";

export interface FullAnalysisModelRegistry
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

export class FullAnalysisPipelineError extends Error {
  readonly stage: PipelineStage;
  readonly details: readonly string[];

  constructor(
    stage: PipelineStage,
    message: string,
    details: readonly string[]
  ) {
    super(message);
    this.name = "FullAnalysisPipelineError";
    this.stage = stage;
    this.details = details;
  }
}

function calculatedAt(analysisDate: string): string {
  return `${analysisDate}T00:00:00.000Z`;
}

function traceId(
  stage: Exclude<PipelineStage, "profile">,
  entityId: string,
  analysisDate: string,
  version: string
): string {
  return `${stage}-trace-${entityId}-${analysisDate}-v${version}`;
}

function riskOutputAsJson(output: RiskModelOutput): JsonValue {
  return {
    entityId: output.entityId,
    riskScore: output.riskScore,
    riskLevel: output.riskLevel,
    riskCodes: [...output.riskCodes],
    reasons: [...output.reasons],
    contributingFactors: [...output.contributingFactors],
    mitigatingFactors: [...output.mitigatingFactors],
    evidenceCount: output.evidenceCount,
    confidenceLevel: output.confidenceLevel,
    maturityStage: output.maturityStage,
    trendSummary: output.trendSummary.map((item) => ({ ...item })),
    calculatedAt: output.calculatedAt
  };
}

function recommendationOutputAsJson(
  output: RecommendationModelOutput
): JsonValue {
  return {
    entityId: output.entityId,
    recommendationStatus: output.recommendationStatus,
    recommendationStrength: output.recommendationStrength,
    recommendationScore: output.recommendationScore,
    stars: output.stars,
    recommendationCodes: [...output.recommendationCodes],
    title: output.title,
    summary: output.summary,
    reasons: [...output.reasons],
    cautions: [...output.cautions],
    suggestedActions: [...output.suggestedActions],
    supportingAnalysisIds: [...output.supportingAnalysisIds],
    calculatedAt: output.calculatedAt
  };
}

function coachOutputAsJson(output: MetaCoachModelOutput): JsonValue {
  return {
    entityId: output.entityId,
    locale: output.locale,
    headline: output.headline,
    verdict: output.verdict,
    overallAssessment: output.overallAssessment,
    whatIsWorking: [...output.whatIsWorking],
    whatToWatch: [...output.whatToWatch],
    recommendedNextStep: [...output.recommendedNextStep],
    evidenceSummary: output.evidenceSummary,
    confidenceExplanation: output.confidenceExplanation,
    trendExplanation: output.trendExplanation,
    riskExplanation: output.riskExplanation,
    recommendationExplanation: output.recommendationExplanation,
    warnings: [...output.warnings],
    traceReferences: [...output.traceReferences],
    generatedAt: output.generatedAt
  };
}

export class FullAnalysisPipelineService {
  readonly #evidenceRepository: EvidenceRepository;
  readonly #profileRepository: MetaProfileRepository;
  readonly #models: FullAnalysisModelRegistry;
  readonly #entities: CatalogEntityRegistryReader;

  constructor(
    evidenceRepository: EvidenceRepository,
    profileRepository: MetaProfileRepository,
    models: FullAnalysisModelRegistry,
    entities: CatalogEntityRegistryReader
  ) {
    this.#evidenceRepository = evidenceRepository;
    this.#profileRepository = profileRepository;
    this.#models = models;
    this.#entities = entities;
  }

  #assertModel(stage: PipelineStage, modelId: string, version: string): void {
    const resolution = this.#models.resolveModel(modelId, version);
    if (resolution.status !== "found") {
      throw new FullAnalysisPipelineError(
        stage,
        `${modelId} is unavailable.`,
        [`Model resolution status: ${resolution.status}.`]
      );
    }
  }

  #validateInput(
    stage: PipelineStage,
    modelId: string,
    version: string,
    value: JsonValue
  ): void {
    this.#assertModel(stage, modelId, version);
    const result = this.#models.validateInput(modelId, version, value);
    if (!result.success) {
      throw new FullAnalysisPipelineError(
        stage,
        `${modelId} input validation failed.`,
        result.issues.map((issue) => `${issue.path}: ${issue.message}`)
      );
    }
  }

  #validateOutput(
    stage: PipelineStage,
    modelId: string,
    version: string,
    value: JsonValue
  ): void {
    const result = this.#models.validateOutput(modelId, version, value);
    if (!result.success) {
      throw new FullAnalysisPipelineError(
        stage,
        `${modelId} output validation failed.`,
        result.issues.map((issue) => `${issue.path}: ${issue.message}`)
      );
    }
  }

  async #evidence(entityId: RiskStageRequest["entityId"]): Promise<
    readonly EvidenceEntry[]
  > {
    try {
      return await this.#evidenceRepository.list({
        entityId,
        sortDirection: "descending"
      });
    } catch (error) {
      throw new FullAnalysisPipelineError("evidence", "Evidence read failed.", [
        error instanceof Error ? error.message : "Unknown Evidence error."
      ]);
    }
  }

  async calculateRiskStage(
    request: RiskStageRequest
  ): Promise<RiskModelOutput> {
    if (
      request.confidenceResult === null ||
      request.trendResults === null ||
      request.maturityResult === null
    ) {
      throw new FullAnalysisPipelineError("risk", "Risk prerequisites missing.", [
        "請先用相同的 Entity 與分析日期計算 Confidence、Trend 與 Maturity。"
      ]);
    }
    const evidenceRecords = await this.#evidence(request.entityId);
    this.#validateInput("risk", request.modelId, request.modelVersion, {
      entityId: request.entityId,
      analysisDate: request.analysisDate,
      evidenceIds: evidenceRecords.map((entry) => entry.record.id),
      confidenceModelVersion: request.confidenceModelVersion,
      trendModelVersion: request.trendModelVersion,
      maturityModelVersion: request.maturityModelVersion
    });
    const output = calculateRisk({
      entityId: request.entityId,
      evidenceRecords,
      confidenceResult: request.confidenceResult,
      trendResults: request.trendResults,
      maturityResult: request.maturityResult,
      analysisDate: request.analysisDate,
      modelId: request.modelId,
      modelVersion: request.modelVersion
    });
    this.#validateOutput(
      "risk",
      request.modelId,
      request.modelVersion,
      riskOutputAsJson(output)
    );
    return output;
  }

  async calculateRecommendationStage(
    request: RecommendationStageRequest
  ): Promise<RecommendationModelOutput> {
    if (
      request.confidence === null ||
      request.trend === null ||
      request.maturity === null ||
      request.risk === null
    ) {
      throw new FullAnalysisPipelineError(
        "recommendation",
        "Recommendation prerequisites missing.",
        ["請先用相同的 Entity 與分析日期完成 Risk 計算。"]
      );
    }
    const evidenceRecords = await this.#evidence(request.entityId);
    this.#validateInput(
      "recommendation",
      request.modelId,
      request.modelVersion,
      {
        entityId: request.entityId,
        analysisDate: request.analysisDate,
        evidenceIds: evidenceRecords.map((entry) => entry.record.id),
        confidenceModelVersion: request.confidenceModelVersion,
        trendModelVersion: request.trendModelVersion,
        maturityModelVersion: request.maturityModelVersion,
        riskModelVersion: request.riskModelVersion,
        supportingAnalysisIds: [...request.supportingAnalysisIds]
      }
    );
    const output = calculateRecommendation({
      entityId: request.entityId,
      evidenceRecords,
      confidenceResult: request.confidence,
      trendResults: request.trend,
      maturityResult: request.maturity,
      riskResult: request.risk,
      analysisDate: request.analysisDate,
      modelId: request.modelId,
      modelVersion: request.modelVersion,
      supportingAnalysisIds: request.supportingAnalysisIds
    });
    this.#validateOutput(
      "recommendation",
      request.modelId,
      request.modelVersion,
      recommendationOutputAsJson(output)
    );
    return output;
  }

  async calculateCoachStage(
    request: CoachStageRequest
  ): Promise<MetaCoachModelOutput> {
    if (
      request.confidence === null ||
      request.trend === null ||
      request.maturity === null ||
      request.risk === null ||
      request.recommendation === null
    ) {
      throw new FullAnalysisPipelineError(
        "coach",
        "Meta Coach prerequisites missing.",
        ["請先用相同的 Entity 與分析日期完成 Recommendation 計算。"]
      );
    }
    const entity = this.#entities.get(request.entityId);
    if (entity === undefined) {
      throw new FullAnalysisPipelineError("coach", "Entity not found.", [
        `Unknown Entity '${request.entityId}'.`
      ]);
    }
    const evidenceRecords = await this.#evidence(request.entityId);
    this.#validateInput("coach", request.modelId, request.modelVersion, {
      entityId: request.entityId,
      analysisDate: request.analysisDate,
      locale: "zh-TW",
      dataMode: request.dataMode,
      traceReferences: [...request.traceReferences]
    });
    const verified = evidenceRecords.filter(
      (entry) =>
        entry.record.status === "verified" &&
        entry.record.eventDate <= request.analysisDate
    );
    const newestEvidenceDate =
      verified.length === 0
        ? null
        : [...verified]
            .map((entry) => entry.record.eventDate)
            .sort()
            .at(-1) ?? null;
    const input: MetaCoachEngineInput = {
      entity: {
        entityId: entity.id,
        displayNameZh: entity.displayNameZh,
        referenceNameEn: entity.referenceNameEn ?? null
      },
      evidenceSummary: {
        verifiedCount: verified.length,
        sourceCount: new Set(
          verified.map((entry) => entry.record.independentSourceGroup)
        ).size,
        newestEvidenceDate
      },
      confidenceResult: request.confidence,
      trendResults: request.trend,
      maturityResult: request.maturity,
      riskResult: request.risk,
      recommendationResult: request.recommendation,
      analysisDate: request.analysisDate,
      modelId: request.modelId,
      modelVersion: request.modelVersion,
      locale: "zh-TW",
      dataMode: request.dataMode,
      traceReferences: request.traceReferences
    };
    const output = generateMetaCoach(input);
    this.#validateOutput(
      "coach",
      request.modelId,
      request.modelVersion,
      coachOutputAsJson(output)
    );
    return output;
  }

  async run(request: FullAnalysisRequest): Promise<FullAnalysisResult> {
    const evidenceRecords = await this.#evidence(request.entityId);
    const entity = this.#entities.get(request.entityId);
    if (entity === undefined) {
      throw new FullAnalysisPipelineError("evidence", "Entity not found.", [
        `Unknown Entity '${request.entityId}'.`
      ]);
    }
    const traceIds: PipelineTraceIds = {
      evidence: traceId(
        "evidence",
        request.entityId,
        request.analysisDate,
        "1.0.0"
      ),
      confidence: traceId(
        "confidence",
        request.entityId,
        request.analysisDate,
        request.versions.confidence
      ),
      trend: traceId(
        "trend",
        request.entityId,
        request.analysisDate,
        request.versions.trend
      ),
      maturity: traceId(
        "maturity",
        request.entityId,
        request.analysisDate,
        request.versions.maturity
      ),
      risk: traceId(
        "risk",
        request.entityId,
        request.analysisDate,
        request.versions.risk
      ),
      recommendation: traceId(
        "recommendation",
        request.entityId,
        request.analysisDate,
        request.versions.recommendation
      ),
      coach: traceId(
        "coach",
        request.entityId,
        request.analysisDate,
        request.versions.coach
      )
    };

    this.#validateInput(
      "confidence",
      CONFIDENCE_MODEL_ID,
      request.versions.confidence,
      {
        entityId: request.entityId,
        analysisDate: request.analysisDate,
        evidenceIds: evidenceRecords.map((entry) => entry.record.id)
      }
    );
    const confidence = calculateConfidence({
      entityId: request.entityId,
      evidenceRecords,
      analysisDate: request.analysisDate,
      modelId: CONFIDENCE_MODEL_ID,
      modelVersion: request.versions.confidence
    });
    const confidenceJson = confidenceOutputAsJson(confidence);
    this.#validateOutput(
      "confidence",
      CONFIDENCE_MODEL_ID,
      request.versions.confidence,
      confidenceJson
    );

    this.#validateInput("trend", TREND_MODEL_ID, request.versions.trend, {
      entityId: request.entityId,
      analysisDate: request.analysisDate,
      evidenceIds: evidenceRecords.map((entry) => entry.record.id),
      confidenceModelId: CONFIDENCE_MODEL_ID,
      confidenceModelVersion: request.versions.confidence
    });
    const trend: TrendModelOutput = {
      entityId: request.entityId,
      analysisDate: request.analysisDate,
      windows: calculateTrendWindows({
        entityId: request.entityId,
        evidenceRecords,
        confidenceResult: confidence,
        analysisDate: request.analysisDate,
        modelId: TREND_MODEL_ID,
        modelVersion: request.versions.trend
      }),
      reasonCodes: [],
      calculatedAt: calculatedAt(request.analysisDate)
    };
    const trendWithCodes: TrendModelOutput = {
      ...trend,
      reasonCodes: [
        ...new Set(trend.windows.flatMap((window) => window.reasonCodes))
      ]
    };
    const trendJson = trendOutputAsJson(trendWithCodes);
    this.#validateOutput(
      "trend",
      TREND_MODEL_ID,
      request.versions.trend,
      trendJson
    );

    this.#validateInput(
      "maturity",
      MATURITY_MODEL_ID,
      request.versions.maturity,
      {
        entityId: request.entityId,
        analysisDate: request.analysisDate,
        evidenceIds: evidenceRecords.map((entry) => entry.record.id),
        confidenceModelId: CONFIDENCE_MODEL_ID,
        confidenceModelVersion: request.versions.confidence,
        trendModelId: TREND_MODEL_ID,
        trendModelVersion: request.versions.trend
      }
    );
    const maturity = calculateMaturity({
      entityId: request.entityId,
      evidenceRecords,
      confidenceResult: confidence,
      trendResults: trendWithCodes,
      analysisDate: request.analysisDate,
      modelId: MATURITY_MODEL_ID,
      modelVersion: request.versions.maturity
    });
    const maturityJson = maturityOutputAsJson(maturity);
    this.#validateOutput(
      "maturity",
      MATURITY_MODEL_ID,
      request.versions.maturity,
      maturityJson
    );

    const risk = await this.calculateRiskStage({
      entityId: request.entityId,
      analysisDate: request.analysisDate,
      modelId: RISK_MODEL_ID,
      modelVersion: request.versions.risk,
      confidenceModelVersion: request.versions.confidence,
      trendModelVersion: request.versions.trend,
      maturityModelVersion: request.versions.maturity,
      confidenceResult: confidence,
      trendResults: trendWithCodes,
      maturityResult: maturity
    });
    const recommendation = await this.calculateRecommendationStage({
      entityId: request.entityId,
      analysisDate: request.analysisDate,
      modelId: RECOMMENDATION_MODEL_ID,
      modelVersion: request.versions.recommendation,
      confidenceModelVersion: request.versions.confidence,
      trendModelVersion: request.versions.trend,
      maturityModelVersion: request.versions.maturity,
      riskModelVersion: request.versions.risk,
      confidence,
      trend: trendWithCodes,
      maturity,
      risk,
      supportingAnalysisIds: [
        traceIds.confidence,
        traceIds.trend,
        traceIds.maturity,
        traceIds.risk
      ]
    });
    const coach = await this.calculateCoachStage({
      entityId: request.entityId,
      analysisDate: request.analysisDate,
      modelId: COACH_MODEL_ID,
      modelVersion: request.versions.coach,
      confidence,
      trend: trendWithCodes,
      maturity,
      risk,
      recommendation,
      traceReferences: [
        traceIds.evidence,
        traceIds.confidence,
        traceIds.trend,
        traceIds.maturity,
        traceIds.risk,
        traceIds.recommendation
      ],
      dataMode: request.dataMode
    });

    const outputs: readonly {
      modelId: string;
      version: string;
      output: JsonValue;
      reasonCodes: readonly string[];
    }[] = [
      {
        modelId: CONFIDENCE_MODEL_ID,
        version: request.versions.confidence,
        output: confidenceJson,
        reasonCodes: confidence.reasonCodes
      },
      {
        modelId: TREND_MODEL_ID,
        version: request.versions.trend,
        output: trendJson,
        reasonCodes: trendWithCodes.reasonCodes
      },
      {
        modelId: MATURITY_MODEL_ID,
        version: request.versions.maturity,
        output: maturityJson,
        reasonCodes: maturity.reasonCodes
      },
      {
        modelId: RISK_MODEL_ID,
        version: request.versions.risk,
        output: riskOutputAsJson(risk),
        reasonCodes: risk.riskCodes.map((code) => `risk.${code}`)
      },
      {
        modelId: RECOMMENDATION_MODEL_ID,
        version: request.versions.recommendation,
        output: recommendationOutputAsJson(recommendation),
        reasonCodes: recommendation.recommendationCodes
      },
      {
        modelId: COACH_MODEL_ID,
        version: request.versions.coach,
        output: coachOutputAsJson(coach),
        reasonCodes: ["coach.template_generated"]
      }
    ];
    const previous = await this.#profileRepository.getByEntityId(
      request.entityId
    );
    const currentKeys = new Set(
      outputs.map((item) => `${item.modelId}@${item.version}`)
    );
    const preserved =
      previous?.analysisResults.filter(
        (result) =>
          !currentKeys.has(`${result.modelId}@${result.modelVersion}`)
      ) ?? [];
    const currentResults = outputs.map((item) => ({
      modelId: item.modelId,
      modelVersion: item.version,
      generatedAt: calculatedAt(request.analysisDate),
      output: item.output,
      reasonCodes: [...item.reasonCodes],
      sourceSnapshotId:
        `analysis-snapshot-${request.entityId}-${request.analysisDate}`
    }));
    const profileValidation = validateDomainModel(
      "MetaProfile",
      {
        id: previous?.id ?? `meta-profile-${request.entityId}`,
        targetType: "entity",
        entityId: request.entityId,
        analysisRunId:
          `full-analysis-run-${request.entityId}-${request.analysisDate}`,
        analysisResults: [...preserved, ...currentResults],
        currentAt: calculatedAt(request.analysisDate)
      },
      { analysisModels: this.#models }
    );
    if (!profileValidation.success) {
      throw new FullAnalysisPipelineError(
        "profile",
        "Atomic Meta Profile validation failed.",
        profileValidation.issues.map(
          (issue) => `${issue.path}: ${issue.message}`
        )
      );
    }
    const profile: MetaProfile = profileValidation.data;
    await this.#profileRepository.save(profile);
    return {
      confidence,
      trend: trendWithCodes,
      maturity,
      risk,
      recommendation,
      coach,
      traceIds,
      profile
    };
  }
}
