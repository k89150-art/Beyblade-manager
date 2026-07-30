import type {
  CatalogEntityRegistryReader,
  ValidationIssue
} from "../domain/index.js";
import type { EvidenceRepository } from "./repository.js";
import type {
  EvidenceCreateDraft,
  EvidenceEntry,
  EvidenceInputDimensionScores,
  EvidenceQuery
} from "./types.js";
import { validateEvidenceEntry } from "./validation.js";

export class EvidenceValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`Evidence validation failed with ${issues.length} issue(s).`);
    this.name = "EvidenceValidationError";
    this.issues = issues;
  }
}

export interface EvidenceClock {
  now(): Date;
}

const systemClock: EvidenceClock = {
  now: () => new Date()
};

export class EvidenceService {
  readonly #repository: EvidenceRepository;
  readonly #entities: CatalogEntityRegistryReader;
  readonly #clock: EvidenceClock;

  constructor(
    repository: EvidenceRepository,
    entities: CatalogEntityRegistryReader,
    clock: EvidenceClock = systemClock
  ) {
    this.#repository = repository;
    this.#entities = entities;
    this.#clock = clock;
  }

  async create(draft: EvidenceCreateDraft): Promise<EvidenceEntry> {
    const now = this.#clock.now().toISOString();
    const entryCandidate = {
      record: {
        id: draft.id,
        sourceId: draft.sourceId,
        status: draft.status,
        grade: draft.grade,
        eventName: draft.evidenceType,
        eventDate: draft.eventDate,
        region: draft.region,
        independentSourceGroup: draft.sourceId,
        observedAt: now,
        performance: {
          matchWins: null,
          matchLosses: null,
          winRate: null
        },
        rawPayload: {
          evidenceType: draft.evidenceType,
          sourceName: draft.sourceName,
          dimensionScores: draft.dimensionScores
        },
        createdAt: now,
        createdBy: "evidence-mvp"
      },
      target: {
        id: `${draft.id}-target`,
        evidenceRecordId: draft.id,
        targetType: "entity",
        entityId: draft.entityId,
        isPrimary: true,
        createdAt: now
      },
      evidenceType: draft.evidenceType,
      sourceName: draft.sourceName,
      dimensionScores: draft.dimensionScores,
      validationStatus: "valid"
    };

    const result = validateEvidenceEntry(entryCandidate, this.#entities);
    if (!result.success) {
      throw new EvidenceValidationError(result.issues);
    }

    await this.#repository.add(result.data);
    return result.data;
  }

  async getById(id: string): Promise<EvidenceEntry | undefined> {
    return this.#repository.getById(id);
  }

  async list(query: EvidenceQuery = {}): Promise<readonly EvidenceEntry[]> {
    return this.#repository.list(query);
  }
}

export function sixDimensionScores(
  sourceQuality: number | null,
  sampleSize: number | null,
  regionalDiversity: number | null,
  timeConsistency: number | null,
  configurationConsistency: number | null,
  independentConfirmation: number | null
): EvidenceInputDimensionScores {
  return {
    source_quality: sourceQuality,
    sample_size: sampleSize,
    regional_diversity: regionalDiversity,
    time_consistency: timeConsistency,
    configuration_consistency: configurationConsistency,
    independent_confirmation: independentConfirmation
  };
}
