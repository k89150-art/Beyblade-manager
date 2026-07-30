import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIDENCE_MODEL_ID,
  CONFIDENCE_MODEL_VERSION,
  ConfidenceService,
  ConfidenceViewModel,
  InMemoryMetaProfileRepository,
  calculateConfidence,
  createConfidenceAnalysisModelRegistry,
  type ConfidenceEngineInput
} from "../../src/meta/confidence/index.js";
import {
  EvidenceService,
  InMemoryEvidenceRepository,
  sixDimensionScores,
  type EvidenceCreateDraft,
  type EvidenceEntry
} from "../../src/meta/evidence/index.js";
import {
  DEV_ENTITY_IDS,
  EVIDENCE_SEED_DRAFTS,
  createEvidenceDevCatalog
} from "../../src/meta/evidence/seed.js";

const ANALYSIS_DATE = "2026-07-29";

function draft(
  id: string,
  overrides: Partial<EvidenceCreateDraft> = {}
): EvidenceCreateDraft {
  return {
    id,
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "tournament_result",
    status: "verified",
    grade: "A",
    eventDate: "2026-07-20",
    sourceId: `source-${id}`,
    sourceName: `Source ${id}`,
    region: "TW",
    dimensionScores: sixDimensionScores(85, 80, 75, 82, 84, 78),
    ...overrides
  };
}

async function entriesFrom(
  drafts: readonly EvidenceCreateDraft[]
): Promise<readonly EvidenceEntry[]> {
  const catalog = createEvidenceDevCatalog();
  const repository = new InMemoryEvidenceRepository();
  const service = new EvidenceService(repository, catalog.entities);
  for (const item of drafts) {
    await service.create(item);
  }
  return repository.list();
}

function engineInput(
  evidenceRecords: readonly EvidenceEntry[],
  overrides: Partial<ConfidenceEngineInput> = {}
): ConfidenceEngineInput {
  return {
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceRecords,
    analysisDate: ANALYSIS_DATE,
    modelId: CONFIDENCE_MODEL_ID,
    modelVersion: CONFIDENCE_MODEL_VERSION,
    ...overrides
  };
}

test("no Evidence returns null Confidence and an insufficient state", () => {
  const output = calculateConfidence(engineInput([]));
  assert.equal(output.confidenceScore, null);
  assert.equal(output.confidenceLevel, "insufficient");
  assert.equal(output.evidenceCount, 0);
  assert.ok(output.reasonCodes.includes("confidence.no_valid_evidence"));
});

test("one high-grade Evidence cannot produce very-high Confidence", async () => {
  const entries = await entriesFrom([draft("single")]);
  const output = calculateConfidence(engineInput(entries));
  assert.equal(output.evidenceCount, 1);
  assert.equal(output.confidenceLevel, "low");
  assert.ok((output.confidenceScore ?? 101) <= 40);
  assert.ok(output.reasonCodes.includes("confidence.insufficient_sample"));
});

test("multiple independent sources can produce high Confidence", async () => {
  const highDrafts = EVIDENCE_SEED_DRAFTS.filter(
    (item) => item.entityId === DEV_ENTITY_IDS.wizardRod
  );
  const output = calculateConfidence(
    engineInput(await entriesFrom(highDrafts))
  );
  assert.ok(output.evidenceCount >= 4);
  assert.equal(output.sourceDiversity.sourceCount, 3);
  assert.ok((output.confidenceScore ?? 0) >= 70);
});

test("stale Evidence receives a stale-data hard cap", async () => {
  const entries = await entriesFrom([
    draft("stale-1", {
      eventDate: "2025-08-01",
      sourceId: "stale-source",
      grade: "D"
    }),
    draft("stale-2", {
      eventDate: "2025-07-01",
      sourceId: "stale-source",
      grade: "D"
    })
  ]);
  const output = calculateConfidence(engineInput(entries));
  assert.ok(output.reasonCodes.includes("confidence.stale_data"));
  assert.ok((output.confidenceScore ?? 101) <= 45);
});

test("incomplete Evidence preserves null and lowers completeness", async () => {
  const entries = await entriesFrom([
    draft("incomplete", {
      dimensionScores: sixDimensionScores(90, null, 80, null, 85, null)
    })
  ]);
  const output = calculateConfidence(engineInput(entries));
  assert.equal(output.completeness.knownDimensionCount, 3);
  assert.equal(output.completeness.totalDimensionCount, 6);
  assert.equal(output.completeness.score, 50);
  assert.ok(output.reasonCodes.includes("confidence.incomplete_evidence"));
});

test("conflicting Evidence is reported and capped", async () => {
  const entries = await entriesFrom([
    draft("conflict-high", {
      sourceId: "source-high",
      region: "TW",
      dimensionScores: sixDimensionScores(95, 95, 95, 95, 95, 95)
    }),
    draft("conflict-low", {
      sourceId: "source-low",
      region: "JP",
      eventDate: "2026-06-01",
      dimensionScores: sixDimensionScores(20, 20, 20, 20, 20, 20)
    })
  ]);
  const output = calculateConfidence(engineInput(entries));
  assert.ok(output.reasonCodes.includes("confidence.conflicting_evidence"));
  assert.ok((output.confidenceScore ?? 101) <= 55);
});

test("ineligible Evidence is excluded with its reason", async () => {
  const entries = await entriesFrom([
    draft("verified"),
    draft("pending", { status: "pending" })
  ]);
  const output = calculateConfidence(engineInput(entries));
  assert.equal(output.evidenceCount, 1);
  assert.deepEqual(output.includedEvidenceIds, ["verified"]);
  assert.equal(output.excludedEvidence.length, 1);
  assert.equal(
    output.excludedEvidence[0]?.reasonCode,
    "confidence.unverified_evidence"
  );
});

test("the same input produces exactly the same output", async () => {
  const entries = await entriesFrom([
    draft("deterministic-1"),
    draft("deterministic-2", {
      sourceId: "source-other",
      region: "JP",
      eventDate: "2026-06-10"
    })
  ]);
  const input = engineInput(entries);
  assert.deepEqual(calculateConfidence(input), calculateConfidence(input));
});

test("analysisDate changes recency deterministically", async () => {
  const entries = await entriesFrom([draft("recency")]);
  const current = calculateConfidence(engineInput(entries));
  const later = calculateConfidence(
    engineInput(entries, { analysisDate: "2027-07-29" })
  );
  assert.ok(
    (current.recency.score ?? 0) > (later.recency.score ?? 0)
  );
  assert.ok((current.recency.ageDays ?? 0) < (later.recency.ageDays ?? 0));
});

test("Confidence Engine does not modify input Evidence", async () => {
  const entries = await entriesFrom([draft("immutable")]);
  const before = structuredClone(entries);
  calculateConfidence(engineInput(entries));
  assert.deepEqual(entries, before);
});

test("Confidence Service reads Repository data and saves MetaProfile", async () => {
  const entries = await entriesFrom([
    draft("service-1"),
    draft("service-2", {
      sourceId: "source-service-2",
      region: "JP",
      eventDate: "2026-06-01"
    })
  ]);
  const evidenceRepository = new InMemoryEvidenceRepository(entries);
  const profileRepository = new InMemoryMetaProfileRepository();
  const registry = createConfidenceAnalysisModelRegistry();
  const service = new ConfidenceService(
    evidenceRepository,
    profileRepository,
    registry
  );

  const result = await service.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    modelId: CONFIDENCE_MODEL_ID,
    modelVersion: CONFIDENCE_MODEL_VERSION
  });

  assert.equal(result.output.evidenceCount, 2);
  assert.deepEqual(
    await profileRepository.getByEntityId(DEV_ENTITY_IDS.wizardRod),
    result.profile
  );
});

test("Analysis output satisfies Registry and MetaProfile runtime validation", async () => {
  const entries = await entriesFrom([draft("registry")]);
  const registry = createConfidenceAnalysisModelRegistry();
  const service = new ConfidenceService(
    new InMemoryEvidenceRepository(entries),
    new InMemoryMetaProfileRepository(),
    registry
  );
  const result = await service.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    modelId: CONFIDENCE_MODEL_ID,
    modelVersion: CONFIDENCE_MODEL_VERSION
  });
  const storedOutput = result.profile.analysisResults[0]?.output;
  assert.notEqual(storedOutput, undefined);
  assert.equal(
    registry.validateOutput(
      CONFIDENCE_MODEL_ID,
      CONFIDENCE_MODEL_VERSION,
      storedOutput
    ).success,
    true
  );
});

test("Confidence ViewModel shows success, empty, and error states", async () => {
  const registry = createConfidenceAnalysisModelRegistry();
  const profileRepository = new InMemoryMetaProfileRepository();
  const emptyViewModel = new ConfidenceViewModel(
    new ConfidenceService(
      new InMemoryEvidenceRepository(),
      profileRepository,
      registry
    )
  );
  let state = await emptyViewModel.calculate({
    entityId: DEV_ENTITY_IDS.noEvidenceDemo,
    analysisDate: ANALYSIS_DATE,
    modelId: CONFIDENCE_MODEL_ID,
    modelVersion: CONFIDENCE_MODEL_VERSION
  });
  assert.equal(state.errors.length, 0);
  assert.equal(state.result?.confidenceLevel, "insufficient");

  const entries = await entriesFrom([draft("view-success")]);
  const successViewModel = new ConfidenceViewModel(
    new ConfidenceService(
      new InMemoryEvidenceRepository(entries),
      profileRepository,
      registry
    )
  );
  state = await successViewModel.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    modelId: CONFIDENCE_MODEL_ID,
    modelVersion: CONFIDENCE_MODEL_VERSION
  });
  assert.equal(state.errors.length, 0);
  assert.notEqual(state.result, null);

  state = await successViewModel.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: "not-a-date",
    modelId: CONFIDENCE_MODEL_ID,
    modelVersion: CONFIDENCE_MODEL_VERSION
  });
  assert.equal(state.result, null);
  assert.ok(state.errors.length > 0);
});
