import type {
  BuildSystemDefinition,
  CanonicalEntityId,
  Identifier,
  JsonValue,
  StockConfiguration,
  StockConfigurationEntry
} from "./types.js";
import {
  validateDomainModel,
  type DomainValidationContext,
  type ValidationIssue
} from "./validation.js";

export interface LegacyStockConfigurationDraft {
  readonly id: Identifier;
  readonly productId: Identifier;
  readonly buildSystemId: Identifier;
  readonly name: string;
  readonly componentEntityIds: readonly CanonicalEntityId[];
  readonly variantKey?: string;
  readonly setId?: Identifier;
  readonly isDefault: boolean;
  readonly legacyData: Readonly<Record<string, JsonValue>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LegacyStockConfigurationMigrationRequest {
  readonly legacy: LegacyStockConfigurationDraft;
  readonly buildSystemVersion: string;
  readonly entries?: readonly StockConfigurationEntry[];
}

export interface StockConfigurationMigrationIssue extends ValidationIssue {
  readonly sourcePath: string;
  readonly sourceIndex: number | null;
  readonly entityId: CanonicalEntityId | null;
  readonly buildSystemId: Identifier;
  readonly buildSystemVersion: string;
  readonly candidateSlotIds: readonly string[];
  readonly reason: string;
  readonly suggestedAction: string;
}

export type StockConfigurationMigrationResult =
  | {
      readonly success: true;
      readonly data: StockConfiguration;
      readonly issues: readonly [];
    }
  | {
      readonly success: false;
      readonly data: null;
      readonly issues: readonly StockConfigurationMigrationIssue[];
    };

interface LegacyEntityInspection {
  readonly entityId: CanonicalEntityId;
  readonly sourceIndex: number;
  readonly candidateSlotIds: readonly string[];
  readonly issues: readonly StockConfigurationMigrationIssue[];
}

function migrationFailure(
  issues: readonly StockConfigurationMigrationIssue[]
): StockConfigurationMigrationResult {
  return {
    success: false,
    data: null,
    issues
  };
}

function migrationIssue(
  request: LegacyStockConfigurationMigrationRequest,
  details: {
    readonly path: string;
    readonly code: string;
    readonly message: string;
    readonly sourcePath: string;
    readonly sourceIndex?: number | null;
    readonly entityId?: CanonicalEntityId | null;
    readonly candidateSlotIds?: readonly string[];
    readonly reason: string;
    readonly suggestedAction: string;
  }
): StockConfigurationMigrationIssue {
  return {
    path: details.path,
    code: details.code,
    message: details.message,
    sourcePath: details.sourcePath,
    sourceIndex: details.sourceIndex ?? null,
    entityId: details.entityId ?? null,
    buildSystemId: request.legacy.buildSystemId,
    buildSystemVersion: request.buildSystemVersion,
    candidateSlotIds: [...(details.candidateSlotIds ?? [])],
    reason: details.reason,
    suggestedAction: details.suggestedAction
  };
}

function resolveBuildSystem(
  request: LegacyStockConfigurationMigrationRequest,
  context: DomainValidationContext
):
  | {
      readonly success: true;
      readonly definition: BuildSystemDefinition;
    }
  | {
      readonly success: false;
      readonly issue: StockConfigurationMigrationIssue;
    } {
  if (context.buildSystems === undefined) {
    return {
      success: false,
      issue: migrationIssue(request, {
        path: "LegacyStockConfigurationMigrationRequest",
        code: "migration_build_registry_required",
        message: "Migration requires a Build System Registry.",
        sourcePath: "LegacyStockConfigurationDraft.buildSystemId",
        reason: "The Build System cannot be resolved without Registry context.",
        suggestedAction:
          "Provide the initialized Build System Registry and retry."
      })
    };
  }

  const resolution = context.buildSystems.resolve(
    request.legacy.buildSystemId,
    request.buildSystemVersion
  );
  if (resolution.status === "found") {
    return { success: true, definition: resolution.definition };
  }

  const code =
    resolution.status === "unknown"
      ? "unknown_migration_build_system"
      : resolution.status === "inactive"
        ? "inactive_migration_build_system"
        : "migration_build_system_version_mismatch";
  const available =
    resolution.status === "version_mismatch"
      ? ` Available versions: ${resolution.availableVersions.join(", ")}.`
      : "";
  return {
    success: false,
    issue: migrationIssue(request, {
      path: "LegacyStockConfigurationMigrationRequest.buildSystemVersion",
      code,
      message:
        `Build System '${request.legacy.buildSystemId}' version ` +
        `'${request.buildSystemVersion}' is ${resolution.status}.${available}`,
      sourcePath: "LegacyStockConfigurationDraft.buildSystemId",
      reason: `Build System resolution returned '${resolution.status}'.`,
      suggestedAction:
        "Select an active registered Build System version before assigning Slots."
    })
  };
}

function inspectLegacyEntity(
  request: LegacyStockConfigurationMigrationRequest,
  context: DomainValidationContext,
  buildSystem: BuildSystemDefinition,
  entityId: CanonicalEntityId,
  sourceIndex: number
): LegacyEntityInspection {
  const sourcePath =
    `LegacyStockConfigurationDraft.componentEntityIds[${sourceIndex}]`;
  const issues: StockConfigurationMigrationIssue[] = [];

  if (context.entities === undefined || context.entityTypes === undefined) {
    issues.push(
      migrationIssue(request, {
        path: sourcePath,
        code: "migration_entity_registries_required",
        message: "Migration requires Entity and Entity Type Registries.",
        sourcePath,
        sourceIndex,
        entityId,
        reason:
          "Candidate Slots cannot be calculated without Entity Registry context.",
        suggestedAction:
          "Provide initialized Entity and Entity Type Registries and retry."
      })
    );
    return { entityId, sourceIndex, candidateSlotIds: [], issues };
  }

  const entity = context.entities.get(entityId);
  if (entity === undefined) {
    issues.push(
      migrationIssue(request, {
        path: sourcePath,
        code: "unknown_migration_entity",
        message: `Legacy Entity '${entityId}' is not registered.`,
        sourcePath,
        sourceIndex,
        entityId,
        reason: "The legacy component cannot be resolved to a Catalog Entity.",
        suggestedAction:
          "Register or explicitly map this Entity before retrying migration."
      })
    );
    return { entityId, sourceIndex, candidateSlotIds: [], issues };
  }

  const typeResolution = context.entityTypes.resolve(
    entity.entityTypeId,
    entity.entityTypeVersion
  );
  if (typeResolution.status !== "found") {
    const code =
      typeResolution.status === "unknown"
        ? "unregistered_migration_entity_type"
        : typeResolution.status === "inactive"
          ? "inactive_migration_entity_type"
          : "migration_entity_type_version_mismatch";
    const available =
      typeResolution.status === "version_mismatch"
        ? ` Available versions: ${typeResolution.availableVersions.join(", ")}.`
        : "";
    issues.push(
      migrationIssue(request, {
        path: sourcePath,
        code,
        message:
          `Entity '${entityId}' references Entity Type ` +
          `'${entity.entityTypeId}' version '${entity.entityTypeVersion}', ` +
          `which is ${typeResolution.status}.${available}`,
        sourcePath,
        sourceIndex,
        entityId,
        reason:
          "The Entity Type must be active and version-compatible before Slot matching.",
        suggestedAction:
          "Register the required active Entity Type version or correct the Entity mapping."
      })
    );
    return { entityId, sourceIndex, candidateSlotIds: [], issues };
  }

  const candidateSlotIds = buildSystem.slots
    .filter(
      (slot) =>
        slot.allowedEntityTypeIds.includes(entity.entityTypeId) &&
        slot.allowedEntityTypeVersions[entity.entityTypeId] ===
          entity.entityTypeVersion
    )
    .map((slot) => slot.slotId);
  if (candidateSlotIds.length === 0) {
    issues.push(
      migrationIssue(request, {
        path: sourcePath,
        code: "no_candidate_slot",
        message:
          `Entity '${entityId}' has no compatible Slot in Build System ` +
          `'${buildSystem.id}' version '${buildSystem.version}'.`,
        sourcePath,
        sourceIndex,
        entityId,
        candidateSlotIds,
        reason:
          `No Slot accepts Entity Type '${entity.entityTypeId}' version ` +
          `'${entity.entityTypeVersion}'.`,
        suggestedAction:
          "Correct the Build System or Entity Type mapping; do not guess a Slot."
      })
    );
  }

  return { entityId, sourceIndex, candidateSlotIds, issues };
}

function locateEntryIndex(path: string): number | null {
  const match = /StockConfiguration\.entries\[(\d+)\]/u.exec(path);
  return match === null ? null : Number(match[1]);
}

export function migrateLegacyStockConfigurationDraft(
  request: LegacyStockConfigurationMigrationRequest,
  context: DomainValidationContext
): StockConfigurationMigrationResult {
  const buildResolution = resolveBuildSystem(request, context);
  if (!buildResolution.success) {
    return migrationFailure([buildResolution.issue]);
  }
  const buildSystem = buildResolution.definition;
  const issues: StockConfigurationMigrationIssue[] = [];
  const inspections = request.legacy.componentEntityIds.map(
    (entityId, sourceIndex) =>
      inspectLegacyEntity(
        request,
        context,
        buildSystem,
        entityId,
        sourceIndex
      )
  );
  inspections.forEach((inspection) => issues.push(...inspection.issues));

  const firstLegacyIndex = new Map<CanonicalEntityId, number>();
  request.legacy.componentEntityIds.forEach((entityId, sourceIndex) => {
    const firstIndex = firstLegacyIndex.get(entityId);
    if (firstIndex === undefined) {
      firstLegacyIndex.set(entityId, sourceIndex);
      return;
    }
    issues.push(
      migrationIssue(request, {
        path:
          `LegacyStockConfigurationDraft.componentEntityIds[${sourceIndex}]`,
        code: "duplicate_legacy_component",
        message:
          `Legacy Entity '${entityId}' is duplicated at indexes ` +
          `${firstIndex} and ${sourceIndex}.`,
        sourcePath:
          `LegacyStockConfigurationDraft.componentEntityIds[${sourceIndex}]`,
        sourceIndex,
        entityId,
        candidateSlotIds:
          inspections[sourceIndex]?.candidateSlotIds ?? [],
        reason: "One physical Entity cannot be migrated more than once.",
        suggestedAction:
          "Remove the duplicate legacy reference or map it to a distinct Entity ID."
      })
    );
  });

  const entries = request.entries;
  if (entries === undefined || entries.length === 0) {
    if (request.legacy.componentEntityIds.length === 0) {
      issues.push(
        migrationIssue(request, {
          path: "LegacyStockConfigurationDraft.componentEntityIds",
          code: "empty_legacy_configuration",
          message: "Legacy Stock Configuration contains no components.",
          sourcePath: "LegacyStockConfigurationDraft.componentEntityIds",
          reason: "There is no source Entity to assign to a Slot.",
          suggestedAction:
            "Correct the source record before attempting migration."
        })
      );
    }

    inspections.forEach((inspection) => {
      if (inspection.issues.length > 0) {
        return;
      }
      const ambiguous = inspection.candidateSlotIds.length > 1;
      issues.push(
        migrationIssue(request, {
          path: "LegacyStockConfigurationMigrationRequest.entries",
          code: ambiguous
            ? "ambiguous_candidate_slots"
            : "slot_assignment_required",
          message: ambiguous
            ? `Entity '${inspection.entityId}' matches multiple candidate Slots.`
            : `Entity '${inspection.entityId}' requires an explicit Slot assignment.`,
          sourcePath:
            `LegacyStockConfigurationDraft.componentEntityIds[` +
            `${inspection.sourceIndex}]`,
          sourceIndex: inspection.sourceIndex,
          entityId: inspection.entityId,
          candidateSlotIds: inspection.candidateSlotIds,
          reason: ambiguous
            ? "More than one Slot accepts the Entity Type and version."
            : "Migration never infers Slot identity, even with one candidate.",
          suggestedAction:
            "Choose one candidate Slot explicitly and provide it in entries."
        })
      );
    });
    return migrationFailure(issues);
  }

  const legacyIds = new Set(request.legacy.componentEntityIds);
  const assignedIndexes = new Map<CanonicalEntityId, number[]>();
  entries.forEach((entry, entryIndex) => {
    const indexes = assignedIndexes.get(entry.entityId) ?? [];
    indexes.push(entryIndex);
    assignedIndexes.set(entry.entityId, indexes);
  });

  inspections.forEach((inspection) => {
    if (!assignedIndexes.has(inspection.entityId)) {
      issues.push(
        migrationIssue(request, {
          path: "LegacyStockConfigurationMigrationRequest.entries",
          code: "missing_slot_assignment",
          message:
            `Legacy Entity '${inspection.entityId}' has no explicit Slot assignment.`,
          sourcePath:
            `LegacyStockConfigurationDraft.componentEntityIds[` +
            `${inspection.sourceIndex}]`,
          sourceIndex: inspection.sourceIndex,
          entityId: inspection.entityId,
          candidateSlotIds: inspection.candidateSlotIds,
          reason: "Every legacy Entity must appear exactly once in entries.",
          suggestedAction:
            "Add one explicit entry using a compatible candidate Slot."
        })
      );
    }
  });

  assignedIndexes.forEach((entryIndexes, entityId) => {
    if (entryIndexes.length > 1) {
      entryIndexes.slice(1).forEach((entryIndex) => {
        const inspection = inspections.find(
          (candidate) => candidate.entityId === entityId
        );
        issues.push(
          migrationIssue(request, {
            path:
              `LegacyStockConfigurationMigrationRequest.entries[` +
              `${entryIndex}].entityId`,
            code: "duplicate_slot_assignment",
            message:
              `Entity '${entityId}' is assigned more than once; duplicate at ` +
              `entry index ${entryIndex}.`,
            sourcePath:
              `LegacyStockConfigurationMigrationRequest.entries[` +
              `${entryIndex}]`,
            sourceIndex: entryIndex,
            entityId,
            candidateSlotIds: inspection?.candidateSlotIds ?? [],
            reason: "A legacy Entity must map to exactly one Slot entry.",
            suggestedAction: "Remove the duplicate assignment."
          })
        );
      });
    }
  });

  entries.forEach((entry, entryIndex) => {
    if (!legacyIds.has(entry.entityId)) {
      issues.push(
        migrationIssue(request, {
          path:
            `LegacyStockConfigurationMigrationRequest.entries[` +
            `${entryIndex}].entityId`,
          code: "unexpected_slot_assignment",
          message:
            `Entry index ${entryIndex} introduces Entity ` +
            `'${entry.entityId}', which is not in the legacy record.`,
          sourcePath:
            `LegacyStockConfigurationMigrationRequest.entries[${entryIndex}]`,
          sourceIndex: entryIndex,
          entityId: entry.entityId,
          reason: "Migration may not introduce additional Entities.",
          suggestedAction:
            "Remove this entry or first correct the legacy source record."
        })
      );
      return;
    }

    const inspection = inspections.find(
      (candidate) => candidate.entityId === entry.entityId
    );
    if (
      inspection !== undefined &&
      inspection.candidateSlotIds.length > 0 &&
      !inspection.candidateSlotIds.includes(entry.slotId)
    ) {
      issues.push(
        migrationIssue(request, {
          path:
            `LegacyStockConfigurationMigrationRequest.entries[` +
            `${entryIndex}].slotId`,
          code: "invalid_explicit_slot_assignment",
          message:
            `Slot '${entry.slotId}' is not compatible with Entity ` +
            `'${entry.entityId}'.`,
          sourcePath:
            `LegacyStockConfigurationMigrationRequest.entries[${entryIndex}]`,
          sourceIndex: entryIndex,
          entityId: entry.entityId,
          candidateSlotIds: inspection.candidateSlotIds,
          reason:
            "The explicit Slot is outside the candidates allowed by Entity Type and version.",
          suggestedAction:
            "Select one of candidateSlotIds; do not infer a different Slot."
        })
      );
    }
  });

  if (issues.length > 0) {
    return migrationFailure(issues);
  }

  const migrated: StockConfiguration = {
    id: request.legacy.id,
    productId: request.legacy.productId,
    buildSystemId: request.legacy.buildSystemId,
    buildSystemVersion: request.buildSystemVersion,
    name: request.legacy.name,
    entries,
    ...(request.legacy.variantKey === undefined
      ? {}
      : { variantKey: request.legacy.variantKey }),
    ...(request.legacy.setId === undefined
      ? {}
      : { setId: request.legacy.setId }),
    isDefault: request.legacy.isDefault,
    legacyData: {
      ...request.legacy.legacyData,
      componentEntityIds: request.legacy.componentEntityIds
    },
    createdAt: request.legacy.createdAt,
    updatedAt: request.legacy.updatedAt
  };

  const validation = validateDomainModel(
    "StockConfiguration",
    migrated,
    context
  );
  if (validation.success) {
    return validation;
  }

  return migrationFailure(
    validation.issues.map((issue) => {
      const sourceIndex = locateEntryIndex(issue.path);
      const entry =
        sourceIndex === null ? undefined : entries[sourceIndex];
      const inspection =
        entry === undefined
          ? undefined
          : inspections.find(
              (candidate) => candidate.entityId === entry.entityId
            );
      return migrationIssue(request, {
        path: issue.path,
        code: issue.code,
        message: issue.message,
        sourcePath: issue.path,
        sourceIndex,
        entityId: entry?.entityId ?? null,
        candidateSlotIds: inspection?.candidateSlotIds ?? [],
        reason: issue.message,
        suggestedAction:
          "Correct the referenced entry according to the Build System rules and retry."
      });
    })
  );
}
