import type {
  CanonicalEntityId,
  IsoDate,
  IsoDateTime,
  MaturityStage,
  RiskCode,
  RiskLevel
} from "../domain/index.js";
import type {
  ConfidenceLevel,
  ConfidenceModelOutput
} from "../confidence/index.js";
import type { EvidenceEntry } from "../evidence/index.js";
import type { MaturityModelOutput } from "../maturity/index.js";
import type {
  TrendDirection,
  TrendModelOutput
} from "../trend/index.js";

export interface RiskTrendSummary {
  readonly windowWeeks: 4 | 8 | 12;
  readonly direction: TrendDirection;
  readonly confidence: number | null;
}

export interface RiskEngineInput {
  readonly entityId: CanonicalEntityId;
  readonly evidenceRecords: readonly EvidenceEntry[];
  readonly confidenceResult: ConfidenceModelOutput;
  readonly trendResults: TrendModelOutput;
  readonly maturityResult: MaturityModelOutput;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
}

export interface RiskModelOutput {
  readonly entityId: CanonicalEntityId;
  readonly riskScore: number | null;
  readonly riskLevel: RiskLevel;
  readonly riskCodes: readonly RiskCode[];
  readonly reasons: readonly string[];
  readonly contributingFactors: readonly string[];
  readonly mitigatingFactors: readonly string[];
  readonly evidenceCount: number;
  readonly confidenceLevel: ConfidenceLevel;
  readonly maturityStage: MaturityStage | null;
  readonly trendSummary: readonly RiskTrendSummary[];
  readonly calculatedAt: IsoDateTime;
}

export interface RiskAnalysisRequest {
  readonly entityId: CanonicalEntityId;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly confidenceModelVersion: string;
  readonly trendModelVersion: string;
  readonly maturityModelVersion: string;
  readonly confidenceResult: ConfidenceModelOutput | null;
  readonly trendResults: TrendModelOutput | null;
  readonly maturityResult: MaturityModelOutput | null;
}
