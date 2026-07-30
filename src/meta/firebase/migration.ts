import type { CanonicalEntityId } from "../domain/index.js";
import type {
  EvidenceEntry,
  EvidenceRepository
} from "../evidence/index.js";
import type { FormalEntityCatalog } from "../integration/index.js";
import type { RuntimeParser } from "./types.js";

export type MigrationIssueCode =
  | "invalid-evidence"
  | "entity-not-found"
  | "duplicate-input"
  | "already-exists"
  | "development-seed";

export interface MigrationIssue {
  readonly code: MigrationIssueCode;
  readonly sourceIndex: number;
  readonly evidenceId: string | null;
  readonly entityId: string | null;
  readonly message: string;
  readonly suggestedAction: string;
}

export interface EvidenceMigrationDryRun {
  readonly total: number;
  readonly ready: readonly EvidenceEntry[];
  readonly issues: readonly MigrationIssue[];
  readonly canImport: boolean;
}

function targetEntity(entry: EvidenceEntry): CanonicalEntityId | null {
  return entry.target.targetType === "entity"
    ? entry.target.entityId
    : null;
}

function seedEvidence(entry: EvidenceEntry): boolean {
  return (
    entry.record.id.startsWith("evidence-high-") ||
    entry.record.id.startsWith("evidence-stale-") ||
    entry.record.id.startsWith("evidence-insufficient-") ||
    entry.record.sourceId.startsWith("source-high-") ||
    entry.record.sourceId.startsWith("source-insufficient")
  );
}

function rawEntityId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const target = Reflect.get(value, "target");
  if (
    typeof target !== "object" ||
    target === null ||
    Array.isArray(target)
  ) {
    return null;
  }
  const entityId = Reflect.get(target, "entityId");
  return typeof entityId === "string" ? entityId : null;
}

export class EvidenceMigrationService {
  readonly #repository: EvidenceRepository;
  readonly #catalog: FormalEntityCatalog;
  readonly #parse: RuntimeParser<EvidenceEntry>;

  constructor(
    repository: EvidenceRepository,
    catalog: FormalEntityCatalog,
    parse: RuntimeParser<EvidenceEntry>
  ) {
    this.#repository = repository;
    this.#catalog = catalog;
    this.#parse = parse;
  }

  async dryRun(candidates: readonly unknown[]): Promise<EvidenceMigrationDryRun> {
    const ready: EvidenceEntry[] = [];
    const issues: MigrationIssue[] = [];
    const seen = new Set<string>();
    for (const [sourceIndex, candidate] of candidates.entries()) {
      const candidateEntityId = rawEntityId(candidate);
      if (
        candidateEntityId !== null &&
        !this.#catalog.summaries.some(
          summary => summary.entity.id === candidateEntityId
        )
      ) {
        issues.push({
          code: "entity-not-found",
          sourceIndex,
          evidenceId: null,
          entityId: candidateEntityId,
          message: "Evidence 指向不存在的 Canonical Entity。",
          suggestedAction: "先完成明確 Entity Mapping，不得用中文名稱猜測。"
        });
        continue;
      }
      const parsed = this.#parse(candidate);
      if (!parsed.success) {
        issues.push({
          code: "invalid-evidence",
          sourceIndex,
          evidenceId: null,
          entityId: null,
          message: parsed.messages.join(" "),
          suggestedAction: "修正資料格式後重新執行 dry run。"
        });
        continue;
      }
      const entry = parsed.data;
      const entityId = targetEntity(entry);
      if (
        entityId === null ||
        this.#catalog.findById(entityId) === undefined
      ) {
        issues.push({
          code: "entity-not-found",
          sourceIndex,
          evidenceId: entry.record.id,
          entityId,
          message: "Evidence 指向不存在的 Canonical Entity。",
          suggestedAction: "先完成明確 Entity Mapping，不得用中文名稱猜測。"
        });
        continue;
      }
      if (seedEvidence(entry)) {
        issues.push({
          code: "development-seed",
          sourceIndex,
          evidenceId: entry.record.id,
          entityId,
          message: "開發 Seed 不可匯入正式 Firebase。",
          suggestedAction: "移除 Seed，改用經驗證的正式 Evidence。"
        });
        continue;
      }
      if (seen.has(entry.record.id)) {
        issues.push({
          code: "duplicate-input",
          sourceIndex,
          evidenceId: entry.record.id,
          entityId,
          message: "待匯入資料中有重複 Evidence ID。",
          suggestedAction: "保留唯一且可追溯的 Evidence ID。"
        });
        continue;
      }
      seen.add(entry.record.id);
      if (await this.#repository.getById(entry.record.id) !== undefined) {
        issues.push({
          code: "already-exists",
          sourceIndex,
          evidenceId: entry.record.id,
          entityId,
          message: "Firebase Repository 已存在相同 Evidence ID。",
          suggestedAction: "確認既有資料，不要重複匯入。"
        });
        continue;
      }
      ready.push(structuredClone(entry));
    }
    return {
      total: candidates.length,
      ready,
      issues,
      canImport: issues.length === 0 && ready.length > 0
    };
  }
}
