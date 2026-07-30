import type {
  CanonicalEntityId,
  IsoDate,
  IsoDateTime,
  MaturityStage,
  MetaProfile
} from "../domain/index.js";
import type { ConfidenceLevel, ConfidenceModelOutput } from "../confidence/index.js";
import type { EvidenceEntry } from "../evidence/index.js";
import type { TrendModelOutput } from "../trend/index.js";

export interface MaturityMetric {
  readonly value: number | null;
  readonly score: number | null;
}

export interface MaturityEngineInput {
  readonly entityId: CanonicalEntityId;
  readonly evidenceRecords: readonly EvidenceEntry[];
  readonly confidenceResult: ConfidenceModelOutput;
  readonly trendResults: TrendModelOutput;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
}

export interface MaturityModelOutput {
  readonly entityId: CanonicalEntityId;
  readonly maturityStage: MaturityStage | null;
  readonly maturityScore: number | null;
  readonly evidenceVolume: MaturityMetric;
  readonly evidenceDuration: MaturityMetric;
  readonly sourceDiversity: MaturityMetric;
  readonly trendStability: MaturityMetric;
  readonly confidenceLevel: ConfidenceLevel;
  readonly reasonCodes: readonly string[];
  readonly reasons: readonly string[];
  readonly calculatedAt: IsoDateTime;
}

export interface MaturityAnalysisRequest {
  readonly entityId: CanonicalEntityId;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly confidenceResult: ConfidenceModelOutput | null;
  readonly trendResults: TrendModelOutput | null;
}

export interface MaturityServiceResult {
  readonly output: MaturityModelOutput;
  readonly profile: MetaProfile;
}

export interface MaturityViewState {
  readonly result: MaturityModelOutput | null;
  readonly errors: readonly string[];
  readonly loading: boolean;
}
