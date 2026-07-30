import assert from "node:assert/strict";
import test from "node:test";
import {
  EvidenceService,
  EvidenceValidationError,
  EvidenceViewModel,
  InMemoryEvidenceRepository,
  sixDimensionScores,
  type EvidenceClock,
  type EvidenceCreateDraft
} from "../../src/meta/evidence/index.js";
import {
  DEV_ENTITY_IDS,
  createEvidenceDevCatalog
} from "../../src/meta/evidence/seed.js";

const FIXED_TIME = new Date("2026-07-29T08:00:00Z");
const fixedClock: EvidenceClock = {
  now: () => FIXED_TIME
};

function validDraft(
  overrides: Partial<EvidenceCreateDraft> = {}
): EvidenceCreateDraft {
  return {
    id: "evidence-test-1",
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "tournament_result",
    status: "verified",
    grade: "A",
    eventDate: "2026-07-20",
    sourceId: "source-test",
    sourceName: "Test Tournament",
    region: "TW",
    dimensionScores: sixDimensionScores(80, 70, 60, 75, 85, 65),
    ...overrides
  };
}

function setup(): {
  readonly repository: InMemoryEvidenceRepository;
  readonly service: EvidenceService;
} {
  const catalog = createEvidenceDevCatalog();
  const repository = new InMemoryEvidenceRepository();
  return {
    repository,
    service: new EvidenceService(repository, catalog.entities, fixedClock)
  };
}

async function expectValidationFailure(
  draft: EvidenceCreateDraft,
  expectedCode: string
): Promise<void> {
  const { service } = setup();
  await assert.rejects(
    () => service.create(draft),
    (error: unknown) =>
      error instanceof EvidenceValidationError &&
      error.issues.some((validationIssue) => validationIssue.code === expectedCode)
  );
}

test("legal Evidence is created and available by ID", async () => {
  const { service } = setup();
  const created = await service.create(validDraft());
  assert.equal(created.validationStatus, "valid");
  assert.equal(created.record.eventDate, "2026-07-20");
  assert.deepEqual(await service.getById(created.record.id), created);
});

test("invalid six-dimension scores are rejected", async () => {
  await expectValidationFailure(
    validDraft({
      dimensionScores: {
        ...sixDimensionScores(80, 70, 60, 75, 85, 65),
        sample_size: 101
      }
    }),
    "invalid_dimension_score"
  );
});

test("invalid Evidence dates are rejected by Domain validation", async () => {
  await expectValidationFailure(
    validDraft({ eventDate: "2026-02-30" }),
    "invalid_format"
  );
});

test("unregistered Evidence entities are rejected", async () => {
  await expectValidationFailure(
    validDraft({
      entityId: "ent_ffffffff-ffff-4fff-8fff-ffffffffffff"
    }),
    "unregistered_entity"
  );
});

test("repository adds, reads, filters, and sorts Evidence", async () => {
  const { repository, service } = setup();
  await service.create(
    validDraft({
      id: "evidence-older",
      eventDate: "2026-07-01",
      entityId: DEV_ENTITY_IDS.wizardRod
    })
  );
  await service.create(
    validDraft({
      id: "evidence-newer",
      eventDate: "2026-07-22",
      entityId: DEV_ENTITY_IDS.tyrannoBeat
    })
  );
  await service.create(
    validDraft({
      id: "evidence-middle",
      eventDate: "2026-07-15",
      entityId: DEV_ENTITY_IDS.wizardRod
    })
  );

  assert.equal((await repository.getById("evidence-newer"))?.record.id, "evidence-newer");
  assert.deepEqual(
    (await repository.list()).map((entry) => entry.record.id),
    ["evidence-newer", "evidence-middle", "evidence-older"]
  );
  assert.deepEqual(
    (
      await repository.list({
        entityId: DEV_ENTITY_IDS.wizardRod,
        sortDirection: "ascending"
      })
    ).map((entry) => entry.record.id),
    ["evidence-older", "evidence-middle"]
  );
});

test("Evidence ViewModel loads, submits, filters, and reports errors", async () => {
  const { service } = setup();
  const viewModel = new EvidenceViewModel(service);

  assert.equal((await viewModel.initialize()).entries.length, 0);
  let state = await viewModel.submit(validDraft());
  assert.equal(state.entries.length, 1);
  assert.equal(state.errors.length, 0);

  state = await viewModel.setFilter(DEV_ENTITY_IDS.tyrannoBeat);
  assert.equal(state.entries.length, 0);

  state = await viewModel.setFilter("");
  assert.equal(state.entries.length, 1);

  state = await viewModel.submit(
    validDraft({
      id: "evidence-invalid",
      eventDate: "not-a-date"
    })
  );
  assert.equal(state.entries.length, 1);
  assert.ok(state.errors.length > 0);
});
