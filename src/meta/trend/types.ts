import type {
  CanonicalEntityId,
  IsoDate,
  IsoDateTime,
  MetaProfile,
  TrendWindow
} from "../domain/index.js";
import type { ConfidenceModelOutput } from "../confidence/index.js";
import type { EvidenceEntry } from "../evidence/index.js";

export const TREND_DIRECTIONS = [
  "strong_up",
  "up",
  "stable",
  "down",
  "strong_down",
  "volatile",
  "insufficient_data"
] as const;

export type TrendDirection = (typeof TREND_DIRECTIONS)[number];

export interface TrendPeriod {
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly comparisonStart: IsoDate;
  readonly comparisonEnd: IsoDate;
}

export interface TrendExcludedEvidence {
  readonly evidenceId: string;
  readonly reasonCode: string;
  readonly reason: string;
}

export interface TrendEngineInput {
  readonly entityId: CanonicalEntityId;
  readonly evidenceRecords: readonly EvidenceEntry[];
  readonly confidenceResult: ConfidenceModelOutput;
  readonly analysisDate: IsoDate;
  readonly windowWeeks: TrendWindow;
  readonly modelId: string;
  readonly modelVersion: string;
}

export interface TrendWindowOutput extends TrendPeriod {
  readonly entityId: CanonicalEntityId;
  readonly windowWeeks: TrendWindow;
  readonly trendDirection: TrendDirection;
  readonly trendStrength: number | null;
  readonly currentValue: number | null;
  readonly previousValue: number | null;
  readonly absoluteChange: number | null;
  readonly percentageChange: number | null;
  readonly sampleCount: number;
  readonly validSampleCount: number;
  readonly currentSampleCount: number;
  readonly comparisonSampleCount: number;
  readonly confidence: number | null;
  readonly reasonCodes: readonly string[];
  readonly reasons: readonly string[];
  readonly includedEvidenceIds: readonly string[];
  readonly excludedEvidence: readonly TrendExcludedEvidence[];
  readonly calculatedAt: IsoDateTime;
}

export interface TrendModelOutput {
  readonly entityId: CanonicalEntityId;
  readonly analysisDate: IsoDate;
  readonly windows: readonly TrendWindowOutput[];
  readonly reasonCodes: readonly string[];
  readonly calculatedAt: IsoDateTime;
}

export interface TrendAnalysisRequest {
  readonly entityId: CanonicalEntityId;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly confidenceResult: ConfidenceModelOutput;
}

export interface TrendServiceResult {
  readonly output: TrendModelOutput;
  readonly profile: MetaProfile;
}

export interface TrendViewState {
  readonly result: TrendModelOutput | null;
  readonly errors: readonly string[];
  readonly loading: boolean;
}
