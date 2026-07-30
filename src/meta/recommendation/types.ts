import type {
  CanonicalEntityId,
  CoachVerdict,
  IsoDate,
  IsoDateTime
} from "../domain/index.js";
import type { ConfidenceModelOutput } from "../confidence/index.js";
import type { EvidenceEntry } from "../evidence/index.js";
import type { MaturityModelOutput } from "../maturity/index.js";
import type { RiskModelOutput } from "../risk/index.js";
import type { TrendModelOutput } from "../trend/index.js";

export interface RecommendationEngineInput {
  readonly entityId: CanonicalEntityId;
  readonly evidenceRecords: readonly EvidenceEntry[];
  readonly confidenceResult: ConfidenceModelOutput;
  readonly trendResults: TrendModelOutput;
  readonly maturityResult: MaturityModelOutput;
  readonly riskResult: RiskModelOutput;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly supportingAnalysisIds: readonly string[];
}

export interface RecommendationModelOutput {
  readonly entityId: CanonicalEntityId;
  readonly recommendationStatus: CoachVerdict;
  readonly recommendationStrength: number | null;
  readonly recommendationScore: number | null;
  readonly stars: number | null;
  readonly recommendationCodes: readonly string[];
  readonly title: string;
  readonly summary: string;
  readonly reasons: readonly string[];
  readonly cautions: readonly string[];
  readonly suggestedActions: readonly string[];
  readonly supportingAnalysisIds: readonly string[];
  readonly calculatedAt: IsoDateTime;
}

export interface RecommendationAnalysisRequest {
  readonly entityId: CanonicalEntityId;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly confidenceResult: ConfidenceModelOutput | null;
  readonly trendResults: TrendModelOutput | null;
  readonly maturityResult: MaturityModelOutput | null;
  readonly riskResult: RiskModelOutput | null;
  readonly supportingAnalysisIds: readonly string[];
}
