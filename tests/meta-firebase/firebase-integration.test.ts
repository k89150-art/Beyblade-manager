import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateDomainModel,
  type MetaProfile
} from "../../src/meta/domain/index.js";
import {
  EvidenceService,
  InMemoryEvidenceRepository,
  validateEvidenceEntry,
  type EvidenceEntry
} from "../../src/meta/evidence/index.js";
import {
  DEV_ENTITY_IDS,
  EVIDENCE_SEED_DRAFTS,
  createEvidenceDevCatalog
} from "../../src/meta/evidence/seed.js";
import {
  EvidenceMigrationService,
  FirebaseEvidenceRepository,
  FirebaseMetaProfileRepository,
  FirebaseRepositoryError,
  FormalCatalogEntityReader,
  accessFor,
  fromFirestoreWire,
  normalizeFirebaseError,
  readMetaFirebaseConfig,
  toFirestoreWire,
  type FirestoreDocumentData,
  type FirestoreDocumentSnapshot,
  type FirestorePort,
  type FirestoreQueryFilter,
  type FirestoreWrite,
  type RuntimeParser
} from "../../src/meta/firebase/index.js";
import {
  FullAnalysisPipelineService,
  FullAnalysisViewModel,
  createPhase5AnalysisModelRegistry
} from "../../src/meta/full-analysis/index.js";
import {
  createFormalEntityCatalog,
  MetaDashboardViewModel
} from "../../src/meta/integration/index.js";
import { InMemoryMetaProfileRepository } from "../../src/meta/confidence/index.js";

const ANALYSIS_DATE = "2026-07-30";

class FakeFirestorePort implements FirestorePort {
  readonly documents = new Map<string, FirestoreDocumentData>();
  failCode: string | null = null;

  key(collectionPath: string, documentId: string): string {
    return `${collectionPath}/${documentId}`;
  }

  failIfRequested(): void {
    if (this.failCode === null) return;
    const error = new Error(`Fake Firestore failure: ${this.failCode}`);
    Object.assign(error, { code: this.failCode });
    throw error;
  }

  async createDocument(
    collectionPath: string,
    documentId: string,
    data: FirestoreDocumentData
  ): Promise<void> {
    this.failIfRequested();
    const key = this.key(collectionPath, documentId);
    if (this.documents.has(key)) {
      const error = new Error("Duplicate document.");
      Object.assign(error, { code: "already-exists" });
      throw error;
    }
    this.documents.set(key, structuredClone(data));
  }

  async getDocument(
    collectionPath: string,
    documentId: string
  ): Promise<FirestoreDocumentSnapshot | undefined> {
    this.failIfRequested();
    const data = this.documents.get(this.key(collectionPath, documentId));
    return data === undefined
      ? undefined
      : { id: documentId, data: structuredClone(data) };
  }

  async listDocuments(
    collectionPath: string,
    filter?: FirestoreQueryFilter
  ): Promise<readonly FirestoreDocumentSnapshot[]> {
    this.failIfRequested();
    const prefix = `${collectionPath}/`;
    return [...this.documents.entries()]
      .filter(([key, data]) => {
        if (!key.startsWith(prefix)) return false;
        if (key.slice(prefix.length).includes("/")) return false;
        return filter === undefined || data[filter.field] === filter.value;
      })
      .map(([key, data]) => ({
        id: key.slice(prefix.length),
        data: structuredClone(data)
      }));
  }

  async commit(writes: readonly FirestoreWrite[]): Promise<void> {
    this.failIfRequested();
    writes.forEach(write => {
      this.documents.set(
        this.key(write.collectionPath, write.documentId),
        structuredClone(write.data)
      );
    });
  }
}

function evidenceParser(
  entities: ReturnType<typeof createEvidenceDevCatalog>["entities"]
): RuntimeParser<EvidenceEntry> {
  return value => {
    const result = validateEvidenceEntry(value, entities);
    return result.success
      ? { success: true, data: result.data }
      : {
          success: false,
          messages: result.issues.map(
            issue => `${issue.path}: ${issue.message}`
          )
        };
  };
}

function profileParser(): RuntimeParser<MetaProfile> {
  const models = createPhase5AnalysisModelRegistry();
  return value => {
    const result = validateDomainModel(
      "MetaProfile",
      value,
      { analysisModels: models }
    );
    return result.success
      ? { success: true, data: result.data }
      : {
          success: false,
          messages: result.issues.map(
            issue => `${issue.path}: ${issue.message}`
          )
        };
  };
}

async function validEvidence(): Promise<EvidenceEntry> {
  const catalog = createEvidenceDevCatalog();
  const repository = new InMemoryEvidenceRepository();
  const service = new EvidenceService(repository, catalog.entities, {
    now: () => new Date(`${ANALYSIS_DATE}T00:00:00.000Z`)
  });
  const seed = EVIDENCE_SEED_DRAFTS[0];
  assert.ok(seed);
  await service.create({
    ...seed,
    id: "official-evidence-1",
    sourceId: "official-source-tw",
    sourceName: "Verified Tournament TW"
  });
  const entry = await repository.getById("official-evidence-1");
  assert.ok(entry);
  return entry;
}

async function pipelineFixture(): Promise<{
  readonly profile: MetaProfile;
  readonly evidenceRepository: InMemoryEvidenceRepository;
}> {
  const catalog = createEvidenceDevCatalog();
  const repository = new InMemoryEvidenceRepository();
  const service = new EvidenceService(repository, catalog.entities, {
    now: () => new Date(`${ANALYSIS_DATE}T00:00:00.000Z`)
  });
  for (const draft of EVIDENCE_SEED_DRAFTS) {
    await service.create(draft);
  }
  const profileRepository = new InMemoryMetaProfileRepository();
  const pipeline = new FullAnalysisPipelineService(
    repository,
    profileRepository,
    createPhase5AnalysisModelRegistry(),
    catalog.entities
  );
  const result = await pipeline.run({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    versions: {
      confidence: "1.0.0",
      trend: "1.0.0",
      maturity: "1.0.0",
      risk: "1.0.0",
      recommendation: "1.0.0",
      coach: "1.0.0"
    },
    dataMode: "production",
    locale: "zh-TW"
  });
  return { profile: result.profile, evidenceRepository: repository };
}

test("Timestamp conversion is explicit and rejects non-JSON objects", () => {
  const wire = toFirestoreWire({
    createdAt: "2026-07-30T00:00:00.000Z",
    eventDate: "2026-07-30"
  });
  assert.deepEqual(fromFirestoreWire(wire), {
    createdAt: "2026-07-30T00:00:00.000Z",
    eventDate: "2026-07-30"
  });
  assert.throws(() => toFirestoreWire(new Date()), FirebaseRepositoryError);
});

test("Firebase Evidence adapter creates, reads, lists, filters, and sorts", async () => {
  const catalog = createEvidenceDevCatalog();
  const port = new FakeFirestorePort();
  const repository = new FirebaseEvidenceRepository(
    port,
    evidenceParser(catalog.entities)
  );
  const first = await validEvidence();
  const second = structuredClone(first);
  Object.assign(second.record, {
    id: "official-evidence-2",
    eventDate: "2026-07-29"
  });
  Object.assign(second.target, {
    id: "official-evidence-2-target",
    evidenceRecordId: "official-evidence-2"
  });
  await repository.add(second);
  await repository.add(first);
  assert.equal((await repository.getById(first.record.id))?.record.id, first.record.id);
  assert.deepEqual(
    (await repository.list({
      entityId: DEV_ENTITY_IDS.wizardRod,
      sortDirection: "descending"
    })).map(entry => entry.record.id),
    ["official-evidence-2", "official-evidence-1"]
  );
  await assert.rejects(
    repository.add(first),
    (error: unknown) =>
      error instanceof FirebaseRepositoryError &&
      error.code === "already-exists"
  );
});

test("Firebase Evidence adapter validates before write and after read", async () => {
  const catalog = createEvidenceDevCatalog();
  const port = new FakeFirestorePort();
  const repository = new FirebaseEvidenceRepository(
    port,
    evidenceParser(catalog.entities)
  );
  const entry = await validEvidence();
  const invalid = structuredClone(entry);
  Object.assign(invalid.dimensionScores, { source_quality: 101 });
  await assert.rejects(
    repository.add(invalid),
    (error: unknown) =>
      error instanceof FirebaseRepositoryError &&
      error.code === "invalid-data"
  );
  await repository.add(entry);
  const stored = port.documents.get(`metaEvidence/${entry.record.id}`);
  assert.ok(stored);
  const payload = stored.payload;
  assert.equal(typeof payload, "object");
  port.documents.set(`metaEvidence/${entry.record.id}`, {
    ...stored,
    payload: { broken: true }
  });
  await assert.rejects(
    repository.getById(entry.record.id),
    (error: unknown) =>
      error instanceof FirebaseRepositoryError &&
      error.code === "invalid-data"
  );
});

test("Firebase MetaProfile adapter upserts current profile and versioned results", async () => {
  const port = new FakeFirestorePort();
  const repository = new FirebaseMetaProfileRepository(port, profileParser());
  const { profile } = await pipelineFixture();
  await repository.save(profile);
  const restored = await repository.getByEntityId(
    DEV_ENTITY_IDS.wizardRod
  );
  assert.equal(restored?.analysisRunId, profile.analysisRunId);
  const resultKeys = [...port.documents.keys()].filter(key =>
    key.includes("/analysisResults/")
  );
  assert.equal(resultKeys.length, profile.analysisResults.length);

  const next = structuredClone(profile);
  Object.assign(next, {
    analysisRunId:
      `full-analysis-run-${DEV_ENTITY_IDS.wizardRod}-2026-07-31`,
    currentAt: "2026-07-31T00:00:00.000Z"
  });
  next.analysisResults.forEach(result => Object.assign(result, {
    generatedAt: "2026-07-31T00:00:00.000Z",
    sourceSnapshotId:
      `analysis-snapshot-${DEV_ENTITY_IDS.wizardRod}-2026-07-31`
  }));
  await repository.save(next);
  const allResultKeys = [...port.documents.keys()].filter(key =>
    key.includes("/analysisResults/")
  );
  assert.ok(allResultKeys.length > resultKeys.length);
});

test("permission denied and offline failures keep explicit repository codes", async () => {
  const catalog = createEvidenceDevCatalog();
  const port = new FakeFirestorePort();
  const repository = new FirebaseEvidenceRepository(
    port,
    evidenceParser(catalog.entities)
  );
  port.failCode = "permission-denied";
  await assert.rejects(
    repository.list(),
    (error: unknown) =>
      error instanceof FirebaseRepositoryError &&
      error.code === "permission-denied"
  );
  port.failCode = "unavailable";
  await assert.rejects(
    repository.list(),
    (error: unknown) =>
      error instanceof FirebaseRepositoryError &&
      error.code === "offline" &&
      error.retryable
  );
  assert.equal(normalizeFirebaseError(new Error("x")).code, "repository-error");
});

test("public config and access rules reject missing config and anonymous writes", () => {
  assert.throws(
    () => readMetaFirebaseConfig({ mode: "production", adminUids: [] }),
    FirebaseRepositoryError
  );
  const user = accessFor(
    { uid: "user", email: "user@example.com" },
    ["admin"],
    "production"
  );
  assert.equal(user.canRead, true);
  assert.equal(user.canWriteEvidence, false);
  const admin = accessFor(
    { uid: "admin", email: "admin@example.com" },
    ["admin"],
    "production"
  );
  assert.equal(admin.canWriteEvidence, true);
  assert.equal(accessFor(null, ["admin"], "production").canRead, false);
});

test("Migration dry run rejects Seed, duplicates, unknown entities, and invalid data", async () => {
  const catalog = createFormalEntityCatalog(
    {},
    createEvidenceDevCatalog().items
  );
  const repository = new InMemoryEvidenceRepository();
  const parser = evidenceParser(createEvidenceDevCatalog().entities);
  const migration = new EvidenceMigrationService(
    repository,
    catalog,
    parser
  );
  const official = await validEvidence();
  const seed = structuredClone(official);
  Object.assign(seed.record, {
    id: "evidence-high-99",
    sourceId: "source-high-tw"
  });
  Object.assign(seed.target, {
    id: "evidence-high-99-target",
    evidenceRecordId: "evidence-high-99"
  });
  const unknown = structuredClone(official);
  Object.assign(unknown.record, { id: "unknown-entity-evidence" });
  Object.assign(unknown.target, {
    id: "unknown-entity-evidence-target",
    evidenceRecordId: "unknown-entity-evidence",
    entityId: "ent_00000000-0000-4000-8000-000000000000"
  });
  const report = await migration.dryRun([
    official,
    official,
    seed,
    unknown,
    { broken: true }
  ]);
  assert.equal(report.canImport, false);
  assert.deepEqual(
    report.issues.map(issue => issue.code),
    [
      "duplicate-input",
      "development-seed",
      "entity-not-found",
      "invalid-evidence"
    ]
  );
});

test("formal Entity reader uses the existing catalog and rejects unknown IDs", () => {
  const catalog = createFormalEntityCatalog(
    {},
    createEvidenceDevCatalog().items
  );
  const reader = new FormalCatalogEntityReader(catalog);
  assert.equal(
    reader.get(DEV_ENTITY_IDS.wizardRod).id,
    DEV_ENTITY_IDS.wizardRod
  );
  assert.throws(
    () => reader.get(
      "ent_00000000-0000-4000-8000-000000000000"
    ),
    (error: unknown) =>
      error instanceof FirebaseRepositoryError &&
      error.code === "entity-not-found"
  );
});

test("Firestore rules and Pages workflow preserve production boundaries", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  assert.match(rules, /match \/users\/\{userId\}\/appData\/\{documentId\}/u);
  assert.match(rules, /match \/metaEvidence\/\{evidenceId\}/u);
  assert.match(rules, /allow create: if isAdmin\(\)/u);
  assert.match(rules, /allow update, delete: if false/u);
  assert.doesNotMatch(rules, /allow read,\s*write:\s*if true/u);

  const workflow = readFileSync(
    ".github/workflows/deploy-pages.yml",
    "utf8"
  );
  assert.match(workflow, /Generate public Firebase config/u);
  assert.match(workflow, /vars\.FIREBASE_PROJECT_ID/u);
  assert.match(workflow, /META_ADMIN_UIDS/u);
  assert.doesNotMatch(workflow, /SERVICE_ACCOUNT|PRIVATE_KEY/u);

  const checkedInConfig = readFileSync("firebase-meta-config.js", "utf8");
  assert.match(checkedInConfig, /firebase:\s*null/u);
  assert.doesNotMatch(checkedInConfig, /AIza[0-9A-Za-z_-]{20,}/u);
});

test("unauthorized analysis stays preview-only and save failure never reports saved", async () => {
  const catalog = createEvidenceDevCatalog();
  const { evidenceRepository } = await pipelineFixture();
  const evidenceService = new EvidenceService(
    evidenceRepository,
    catalog.entities
  );
  const pipeline = new FullAnalysisViewModel(
    new FullAnalysisPipelineService(
      evidenceRepository,
      new InMemoryMetaProfileRepository(),
      createPhase5AnalysisModelRegistry(),
      catalog.entities
    )
  );
  const readOnly = new MetaDashboardViewModel(
    {
      summaries: catalog.items.map(entity => ({
        entity,
        model: entity.canonicalName,
        series: entity.seriesIds,
        entityTypeLabel: entity.entityTypeId,
        role: null,
        tier: null,
        relatedParts: [],
        imageUrl: null
      })),
      entities: catalog.entities,
      findById: id => {
        const entity = catalog.entities.get(id);
        return entity === undefined
          ? undefined
          : {
              entity,
              model: entity.canonicalName,
              series: entity.seriesIds,
              entityTypeLabel: entity.entityTypeId,
              role: null,
              tier: null,
              relatedParts: [],
              imageUrl: null
            };
      },
      findByAlias: () => [],
      search: () => []
    },
    evidenceService,
    pipeline,
    "production",
    ANALYSIS_DATE,
    {
      authenticated: true,
      canRead: true,
      canWriteEvidence: false,
      canSaveAnalysis: false,
      principal: { uid: "user", email: null }
    }
  );
  await readOnly.selectEntity(DEV_ENTITY_IDS.wizardRod);
  assert.equal((await readOnly.runAnalysis()).persistenceStatus, "preview-only");

  const failingProfileRepository = {
    getByEntityId: async () => undefined,
    save: async () => {
      throw new FirebaseRepositoryError(
        "permission-denied",
        "Save denied."
      );
    }
  };
  const authorized = new MetaDashboardViewModel(
    readOnly.state.selectedEntity === null
      ? createFormalEntityCatalog({})
      : {
          summaries: [],
          entities: catalog.entities,
          findById: id => id === DEV_ENTITY_IDS.wizardRod
            ? readOnly.state.selectedEntity ?? undefined
            : undefined,
          findByAlias: () => [],
          search: () => []
        },
    evidenceService,
    pipeline,
    "production",
    ANALYSIS_DATE,
    {
      authenticated: true,
      canRead: true,
      canWriteEvidence: true,
      canSaveAnalysis: true,
      principal: { uid: "admin", email: null }
    },
    failingProfileRepository
  );
  await authorized.selectEntity(DEV_ENTITY_IDS.wizardRod);
  const state = await authorized.runAnalysis();
  assert.equal(state.persistenceStatus, "save-failed");
  assert.notEqual(state.persistenceStatus, "saved");
  assert.ok(state.result);
});

test("authorized analysis is reported saved only after repository success", async () => {
  const catalog = createEvidenceDevCatalog();
  const formalCatalog = createFormalEntityCatalog({}, catalog.items);
  const { evidenceRepository } = await pipelineFixture();
  const evidenceService = new EvidenceService(
    evidenceRepository,
    catalog.entities
  );
  const pipeline = new FullAnalysisViewModel(
    new FullAnalysisPipelineService(
      evidenceRepository,
      new InMemoryMetaProfileRepository(),
      createPhase5AnalysisModelRegistry(),
      catalog.entities
    )
  );
  const profileRepository = new InMemoryMetaProfileRepository();
  const viewModel = new MetaDashboardViewModel(
    formalCatalog,
    evidenceService,
    pipeline,
    "production",
    ANALYSIS_DATE,
    {
      authenticated: true,
      canRead: true,
      canWriteEvidence: true,
      canSaveAnalysis: true,
      principal: { uid: "admin", email: "admin@example.com" }
    },
    profileRepository
  );
  await viewModel.selectEntity(DEV_ENTITY_IDS.wizardRod);
  const state = await viewModel.runAnalysis();
  assert.equal(state.persistenceStatus, "saved");
  assert.ok(
    await profileRepository.getByEntityId(DEV_ENTITY_IDS.wizardRod)
  );
});
