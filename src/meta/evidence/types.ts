import type {
  CanonicalEntityId,
  EvidenceDimensionScores,
  EvidenceGrade,
  EvidenceRecord,
  EvidenceScoreDimension,
  EvidenceStatus,
  EvidenceTarget,
  ValidationIssue
} from "../domain/index.js";

export type EvidenceInputDimensionScores = Readonly<
  Record<EvidenceScoreDimension, number | null>
>;

export interface EvidenceEntry {
  readonly record: EvidenceRecord;
  readonly target: EvidenceTarget;
  readonly evidenceType: string;
  readonly sourceName: string;
  readonly dimensionScores: EvidenceDimensionScores;
  readonly validationStatus: "valid";
}

export interface EvidenceCreateDraft {
  readonly id: string;
  readonly entityId: string;
  readonly evidenceType: string;
  readonly status: EvidenceStatus;
  readonly grade: EvidenceGrade;
  readonly eventDate: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly region: string;
  readonly dimensionScores: EvidenceInputDimensionScores;
}

export interface EvidenceQuery {
  readonly entityId?: CanonicalEntityId;
  readonly sortDirection?: "ascending" | "descending";
}

export interface EvidenceViewState {
  readonly entries: readonly EvidenceEntry[];
  readonly filterEntityId: string;
  readonly errors: readonly ValidationIssue[];
  readonly loading: boolean;
}
