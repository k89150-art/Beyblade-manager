import {
  EVIDENCE_SCORE_DIMENSIONS,
  validateDomainModel,
  type CanonicalEntityId,
  type CatalogEntityRegistryReader,
  type EvidenceDimensionScores,
  type EvidenceTarget,
  type ValidationIssue,
  type ValidationResult
} from "../domain/index.js";
import type { EvidenceEntry } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(
  path: string,
  code: string,
  message: string
): ValidationIssue {
  return { path, code, message };
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[]
): string | null {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    issues.push(
      issue(`${path}.${key}`, "required_string", `${key} must be a non-empty string.`)
    );
    return null;
  }
  return candidate;
}

function readDimensionScores(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): EvidenceDimensionScores | null {
  if (!isRecord(value)) {
    issues.push(
      issue(path, "invalid_dimension_scores", "Six dimension scores are required.")
    );
    return null;
  }

  const allowed = new Set<string>(EVIDENCE_SCORE_DIMENSIONS);
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) {
      issues.push(
        issue(`${path}.${key}`, "unknown_dimension", `Unknown dimension '${key}'.`)
      );
    }
  });

  const scores: Record<string, number | null> = {};
  EVIDENCE_SCORE_DIMENSIONS.forEach((dimension) => {
    const score = value[dimension];
    if (score === null) {
      scores[dimension] = null;
      return;
    }
    if (
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100
    ) {
      issues.push(
        issue(
          `${path}.${dimension}`,
          "invalid_dimension_score",
          `${dimension} must be a finite number from 0 to 100.`
        )
      );
      return;
    }
    scores[dimension] = score;
  });

  if (issues.some((candidate) => candidate.path.startsWith(path))) {
    return null;
  }

  return {
    source_quality: scores.source_quality ?? null,
    sample_size: scores.sample_size ?? null,
    regional_diversity: scores.regional_diversity ?? null,
    time_consistency: scores.time_consistency ?? null,
    configuration_consistency: scores.configuration_consistency ?? null,
    independent_confirmation: scores.independent_confirmation ?? null
  };
}

export function validateEvidenceEntry(
  value: unknown,
  entities: CatalogEntityRegistryReader
): ValidationResult<EvidenceEntry> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      success: false,
      data: null,
      issues: [issue("EvidenceEntry", "expected_object", "Evidence Entry must be an object.")]
    };
  }

  const allowedKeys = new Set([
    "record",
    "target",
    "evidenceType",
    "sourceName",
    "dimensionScores",
    "validationStatus"
  ]);
  Object.keys(value).forEach((key) => {
    if (!allowedKeys.has(key)) {
      issues.push(
        issue(`EvidenceEntry.${key}`, "unknown_property", `Unknown property '${key}'.`)
      );
    }
  });

  const recordResult = validateDomainModel("EvidenceRecord", value.record);
  if (!recordResult.success) {
    issues.push(...recordResult.issues);
  }

  const targetResult = validateDomainModel("EvidenceTarget", value.target);
  if (!targetResult.success) {
    issues.push(...targetResult.issues);
  }

  const evidenceType = readRequiredString(
    value,
    "evidenceType",
    "EvidenceEntry",
    issues
  );
  const sourceName = readRequiredString(
    value,
    "sourceName",
    "EvidenceEntry",
    issues
  );
  const dimensionScores = readDimensionScores(
    value.dimensionScores,
    "EvidenceEntry.dimensionScores",
    issues
  );

  if (value.validationStatus !== "valid") {
    issues.push(
      issue(
        "EvidenceEntry.validationStatus",
        "invalid_validation_status",
        "Only validated Evidence Entries may be stored."
      )
    );
  }

  let target: EvidenceTarget | null = null;
  if (targetResult.success) {
    target = targetResult.data;
    if (target.targetType !== "entity") {
      issues.push(
        issue(
          "EvidenceTarget.targetType",
          "unsupported_evidence_target",
          "The Evidence MVP currently accepts entity targets only."
        )
      );
    } else if (entities.get(target.entityId) === undefined) {
      issues.push(
        issue(
          "EvidenceTarget.entityId",
          "unregistered_entity",
          `Entity '${target.entityId}' is not registered.`
        )
      );
    }
  }

  if (
    recordResult.success &&
    target !== null &&
    target.evidenceRecordId !== recordResult.data.id
  ) {
    issues.push(
      issue(
        "EvidenceTarget.evidenceRecordId",
        "evidence_record_mismatch",
        "Evidence Target must reference the containing Evidence Record."
      )
    );
  }

  if (
    issues.length > 0 ||
    !recordResult.success ||
    target === null ||
    evidenceType === null ||
    sourceName === null ||
    dimensionScores === null
  ) {
    return { success: false, data: null, issues };
  }

  return {
    success: true,
    data: {
      record: recordResult.data,
      target,
      evidenceType,
      sourceName,
      dimensionScores,
      validationStatus: "valid"
    },
    issues: []
  };
}

export function entityIdFromEntry(
  entry: EvidenceEntry
): CanonicalEntityId | null {
  return entry.target.targetType === "entity" ? entry.target.entityId : null;
}
