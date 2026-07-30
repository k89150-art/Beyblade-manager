import type {
  CanonicalEntityId,
  IsoDate,
  MetaProfile
} from "../domain/index.js";
import type { MetaCoachModelOutput } from "../coach/index.js";
import type { ConfidenceModelOutput } from "../confidence/index.js";
import type { MaturityModelOutput } from "../maturity/index.js";
import type { RecommendationModelOutput } from "../recommendation/index.js";
import type {
  RiskAnalysisRequest,
  RiskModelOutput
} from "../risk/index.js";
import type { TrendModelOutput } from "../trend/index.js";

export const PIPELINE_STAGES = [
  "evidence",
  "confidence",
  "trend",
  "maturity",
  "risk",
  "recommendation",
  "coach",
  "profile"
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface FullAnalysisModelVersions {
  readonly confidence: string;
  readonly trend: string;
  readonly maturity: string;
  readonly risk: string;
  readonly recommendation: string;
  readonly coach: string;
}

export interface FullAnalysisRequest {
  readonly entityId: CanonicalEntityId;
  readonly analysisDate: IsoDate;
  readonly versions: FullAnalysisModelVersions;
  readonly dataMode: "development" | "production";
  readonly locale: "zh-TW";
}

export interface PipelineTraceIds {
  readonly evidence: string;
  readonly confidence: string;
  readonly trend: string;
  readonly maturity: string;
  readonly risk: string;
  readonly recommendation: string;
  readonly coach: string;
}

export interface FullAnalysisResult {
  readonly confidence: ConfidenceModelOutput;
  readonly trend: TrendModelOutput;
  readonly maturity: MaturityModelOutput;
  readonly risk: RiskModelOutput;
  readonly recommendation: RecommendationModelOutput;
  readonly coach: MetaCoachModelOutput;
  readonly traceIds: PipelineTraceIds;
  readonly profile: MetaProfile;
}

export interface RecommendationStageRequest {
  readonly entityId: CanonicalEntityId;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly confidenceModelVersion: string;
  readonly trendModelVersion: string;
  readonly maturityModelVersion: string;
  readonly riskModelVersion: string;
  readonly confidence: ConfidenceModelOutput | null;
  readonly trend: TrendModelOutput | null;
  readonly maturity: MaturityModelOutput | null;
  readonly risk: RiskModelOutput | null;
  readonly supportingAnalysisIds: readonly string[];
}

export interface CoachStageRequest {
  readonly entityId: CanonicalEntityId;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly confidence: ConfidenceModelOutput | null;
  readonly trend: TrendModelOutput | null;
  readonly maturity: MaturityModelOutput | null;
  readonly risk: RiskModelOutput | null;
  readonly recommendation: RecommendationModelOutput | null;
  readonly traceReferences: readonly string[];
  readonly dataMode: "development" | "production";
}

export interface FullAnalysisViewState {
  readonly result: FullAnalysisResult | null;
  readonly risk: RiskModelOutput | null;
  readonly recommendation: RecommendationModelOutput | null;
  readonly coach: MetaCoachModelOutput | null;
  readonly currentStage: PipelineStage | "idle" | "completed";
  readonly errors: readonly string[];
  readonly loading: boolean;
}

export type RiskStageRequest = RiskAnalysisRequest;
