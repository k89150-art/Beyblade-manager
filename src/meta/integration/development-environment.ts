import {
  InMemoryEvidenceRepository,
  LocalStorageEvidenceRepository,
  type EvidenceEntryParser,
  type EvidenceRepository,
  type KeyValueStorage
} from "../evidence/repository.js";
import {
  EVIDENCE_SEED_DRAFTS,
  createEvidenceDevCatalog
} from "../evidence/seed.js";
import { EvidenceService } from "../evidence/service.js";
import type { FormalEntityCatalog } from "./types.js";

const DEVELOPMENT_STORAGE_KEY = "beyblade-meta-development-evidence-v1";

export function createDevelopmentCatalog() {
  return createEvidenceDevCatalog();
}

async function seed(
  repository: EvidenceRepository,
  catalog: FormalEntityCatalog
): Promise<void> {
  const service = new EvidenceService(repository, catalog.entities);
  for (const draft of EVIDENCE_SEED_DRAFTS) {
    await service.create(draft);
  }
}

export async function createDevelopmentEvidenceRepository(
  catalog: FormalEntityCatalog,
  parser: EvidenceEntryParser,
  storage?: KeyValueStorage
): Promise<{
  readonly repository: EvidenceRepository;
  readonly warnings: readonly string[];
}> {
  if (storage === undefined) {
    const repository = new InMemoryEvidenceRepository();
    await seed(repository, catalog);
    return { repository, warnings: [] };
  }

  const repository = new LocalStorageEvidenceRepository(
    storage,
    DEVELOPMENT_STORAGE_KEY,
    parser
  );
  try {
    const existing = await repository.list();
    if (existing.length === 0) await seed(repository, catalog);
    return { repository, warnings: [] };
  } catch (error) {
    return {
      repository: new InMemoryEvidenceRepository(),
      warnings: [
        "Development LocalStorage is unavailable. Original data was preserved and this session now uses in-memory storage.",
        error instanceof Error ? error.message : "LocalStorage read failed."
      ]
    };
  }
}
