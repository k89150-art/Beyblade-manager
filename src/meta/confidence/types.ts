import type {
  CanonicalEntityId,
  IsoDate,
  IsoDateTime,
  MetaProfile
} from "../domain/index.js";
import type { EvidenceEntry } from "../evidence/index.js";

export const CONFIDENCE_LEVELS = [
  "very_high",
  "high",
  "medium",
  "low",
  "insufficient"
] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export interface ConfidenceEngineInput {
  readonly entityId: CanonicalEntityId;
  readonly evidenceRecords: readonly EvidenceEntry[];
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
}

export interface ConfidenceExcludedEvidence {
  readonly evidenceId: string;
  readonly reasonCode: string;
  readonly reason: string;
}

export interface ConfidenceDimensionResult {
  readonly dimensionId: string;
  readonly score: number | null;
  readonly explanation: string;
}

export interface ConfidenceSourceDiversity {
  readonly sourceCount: number;
  readonly score: number | null;
}

export interface ConfidenceRecency {
  readonly newestEvidenceDate: IsoDate | null;
  readonly ageDays: number | null;
  readonly score: number | null;
}

export interface ConfidenceCompleteness {
  readonly knownDimensionCount: number;
  readonly totalDimensionCount: number;
  readonly score: number | null;
}

export interface ConfidenceConsistency {
  readonly score: number | null;
  readonly spread: number | null;
}

export interface ConfidenceModelOutput {
  readonly entityId: CanonicalEntityId;
  readonly confidenceScore: number | null;
  readonly hardCap: number | null;
  readonly confidenceLevel: ConfidenceLevel;
  readonly evidenceCount: number;
  readonly sourceDiversity: ConfidenceSourceDiversity;
  readonly recency: ConfidenceRecency;
  readonly completeness: ConfidenceCompleteness;
  readonly consistency: ConfidenceConsistency;
  readonly dimensions: readonly ConfidenceDimensionResult[];
  readonly includedEvidenceIds: readonly string[];
  readonly excludedEvidence: readonly ConfidenceExcludedEvidence[];
  readonly reasonCodes: readonly string[];
  readonly reasons: readonly string[];
  readonly positiveFactors: readonly string[];
  readonly negativeFactors: readonly string[];
  readonly calculatedAt: IsoDateTime;
}

export interface ConfidenceAnalysisRequest {
  readonly entityId: CanonicalEntityId;
  readonly analysisDate: IsoDate;
  readonly modelId: string;
  readonly modelVersion: string;
}

export interface ConfidenceServiceResult {
  readonly output: ConfidenceModelOutput;
  readonly profile: MetaProfile;
}

export interface ConfidenceViewState {
  readonly result: ConfidenceModelOutput | null;
  readonly errors: readonly string[];
  readonly loading: boolean;
}
