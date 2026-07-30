import type {
  CanonicalEntityId,
  CoachVerdict,
  IsoDate,
  IsoDateTime
} from "../domain/index.js";
import type { ConfidenceModelOutput } from "../confidence/index.js";
import type { MaturityModelOutput } from "../maturity/index.js";
import type { RecommendationModelOutput } from "../recommendation/index.js";
import type { RiskModelOutput } from "../risk/index.js";
import type { TrendModelOutput } from "../trend/index.js";

export interface CoachEntitySummary {
  readonly entityId: CanonicalEntityId;
  readonly displayNameZh: string;
  readonly referenceNameEn: string | null;
}

export interface CoachEvidenceSummary {
  readonly verifiedCount: number;
  readonly sourceCount: number;
  readonly newestEvidenceDate: IsoDate | null;
}

export interface MetaCoachEngineInput {
  readonly entity: CoachEntitySummary;
  readonly evidenceSummary: CoachEvidenceSummary;
  readonly confidenceResult: ConfidenceModelOutput;
  readonly trendResults: TrendModelOutput;
  readonly maturityResult: MaturityModelOutput;
  readonly riskResult: RiskModelOutput;
  readonly recommendationResult: RecommendationModelOutput;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly locale: "zh-TW";
  readonly dataMode: "development" | "production";
  readonly traceReferences: readonly string[];
}

export interface MetaCoachModelOutput {
  readonly entityId: CanonicalEntityId;
  readonly locale: "zh-TW";
  readonly headline: string;
  readonly verdict: CoachVerdict;
  readonly overallAssessment: string;
  readonly whatIsWorking: readonly string[];
  readonly whatToWatch: readonly string[];
  readonly recommendedNextStep: readonly string[];
  readonly evidenceSummary: string;
  readonly confidenceExplanation: string;
  readonly trendExplanation: string;
  readonly riskExplanation: string;
  readonly recommendationExplanation: string;
  readonly warnings: readonly string[];
  readonly traceReferences: readonly string[];
  readonly generatedAt: IsoDateTime;
}
