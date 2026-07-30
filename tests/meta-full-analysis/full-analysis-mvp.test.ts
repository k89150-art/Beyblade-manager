import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalysisModelRegistry,
  type CanonicalEntityId,
  type JsonValue,
  type MetaProfile,
  type ValidationResult
} from "../../src/meta/domain/index.js";
import {
  COACH_INPUT_SCHEMA,
  COACH_MODEL_ID,
  COACH_MODEL_VERSION,
  COACH_OUTPUT_SCHEMA,
  generateMetaCoach
} from "../../src/meta/coach/index.js";
import {
  CONFIDENCE_MODEL_VERSION,
  InMemoryMetaProfileRepository,
  type MetaProfileRepository
} from "../../src/meta/confidence/index.js";
import {
  EvidenceService,
  InMemoryEvidenceRepository,
  type EvidenceEntry,
  type EvidenceQuery,
  type EvidenceRepository
} from "../../src/meta/evidence/index.js";
import {
  DEV_ENTITY_IDS,
  EVIDENCE_SEED_DRAFTS,
  createEvidenceDevCatalog
} from "../../src/meta/evidence/seed.js";
import {
  FullAnalysisPipelineError,
  FullAnalysisPipelineService,
  FullAnalysisViewModel,
  createPhase5AnalysisModelRegistry,
  registerPhase5AnalysisModels,
  type FullAnalysisModelRegistry,
  type FullAnalysisRequest
} from "../../src/meta/full-analysis/index.js";
import { MATURITY_MODEL_VERSION } from "../../src/meta/maturity/index.js";
import {
  RECOMMENDATION_MODEL_ID,
  RECOMMENDATION_MODEL_VERSION,
  calculateRecommendation
} from "../../src/meta/recommendation/index.js";
import {
  RISK_INPUT_SCHEMA,
  RISK_MODEL_ID,
  RISK_MODEL_VERSION,
  RISK_OUTPUT_SCHEMA,
  calculateRisk
} from "../../src/meta/risk/index.js";
import { TREND_MODEL_VERSION } from "../../src/meta/trend/index.js";

const ANALYSIS_DATE = "2026-07-30";
const VERSIONS = {
  confidence: CONFIDENCE_MODEL_VERSION,
  trend: TREND_MODEL_VERSION,
  maturity: MATURITY_MODEL_VERSION,
  risk: RISK_MODEL_VERSION,
  recommendation: RECOMMENDATION_MODEL_VERSION,
  coach: COACH_MODEL_VERSION
} as const;

class CountingProfileRepository implements MetaProfileRepository {
  readonly #profiles = new Map<CanonicalEntityId, MetaProfile>();
  saveCount = 0;

  async getByEntityId(
    entityId: CanonicalEntityId
  ): Promise<MetaProfile | undefined> {
    const profile = this.#profiles.get(entityId);
    return profile === undefined ? undefined : structuredClone(profile);
  }

  async save(profile: MetaProfile): Promise<void> {
    if (profile.targetType !== "entity" || profile.entityId === undefined) {
      throw new Error("Test repository stores Entity profiles only.");
    }
    this.saveCount += 1;
    this.#profiles.set(profile.entityId, structuredClone(profile));
  }
}

class FailingEvidenceRepository implements EvidenceRepository {
  async add(): Promise<void> {
    throw new Error("Development Evidence adapter unavailable.");
  }

  async getById(): Promise<EvidenceEntry | undefined> {
    throw new Error("Development Evidence adapter unavailable.");
  }

  async list(): Promise<readonly EvidenceEntry[]> {
    throw new Error("Development Evidence adapter unavailable.");
  }
}

class DelayedEvidenceRepository implements EvidenceRepository {
  readonly #delegate: EvidenceRepository;

  constructor(delegate: EvidenceRepository) {
    this.#delegate = delegate;
  }

  async add(entry: EvidenceEntry): Promise<void> {
    await this.#delegate.add(entry);
  }

  async getById(id: string): Promise<EvidenceEntry | undefined> {
    return this.#delegate.getById(id);
  }

  async list(query?: EvidenceQuery): Promise<readonly EvidenceEntry[]> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return this.#delegate.list(query);
  }
}

async function seededEvidenceRepository(): Promise<InMemoryEvidenceRepository> {
  const catalog = createEvidenceDevCatalog();
  const repository = new InMemoryEvidenceRepository();
  const service = new EvidenceService(repository, catalog.entities, {
    now: () => new Date(`${ANALYSIS_DATE}T00:00:00Z`)
  });
  for (const draft of EVIDENCE_SEED_DRAFTS) {
    await service.create(draft);
  }
  return repository;
}

async function environment(
  modelRegistry: FullAnalysisModelRegistry =
    createPhase5AnalysisModelRegistry(),
  profileRepository: CountingProfileRepository =
    new CountingProfileRepository()
) {
  const catalog = createEvidenceDevCatalog();
  const evidenceRepository = await seededEvidenceRepository();
  const service = new FullAnalysisPipelineService(
    evidenceRepository,
    profileRepository,
    modelRegistry,
    catalog.entities
  );
  return { catalog, evidenceRepository, profileRepository, service };
}

function request(
  entityId: CanonicalEntityId,
  overrides: Partial<FullAnalysisRequest> = {}
): FullAnalysisRequest {
  return {
    entityId,
    analysisDate: ANALYSIS_DATE,
    versions: VERSIONS,
    dataMode: "development",
    locale: "zh-TW",
    ...overrides
  };
}

test("Risk covers no Evidence, low Confidence, single source, and stale Evidence", async () => {
  const { service } = await environment();
  const noEvidence = await service.run(request(DEV_ENTITY_IDS.noEvidenceDemo));
  assert.equal(noEvidence.risk.riskScore, null);
  assert.equal(noEvidence.risk.riskLevel, "unknown");
  assert.ok(noEvidence.risk.riskCodes.includes("insufficient_sample"));

  const stale = await service.run(request(DEV_ENTITY_IDS.cobaltDragoon));
  assert.equal(stale.confidence.confidenceLevel, "low");
  assert.equal(stale.risk.riskLevel, "high");
  assert.ok(stale.risk.riskCodes.includes("single_source_dependency"));
  assert.ok(stale.risk.riskCodes.includes("stale_data"));
});

test("Risk detects volatility, rapid decline, mature decline, emerging uncertainty, and combined risks", async () => {
  const { service } = await environment();
  const volatile = await service.run(request(DEV_ENTITY_IDS.volatileDemo));
  assert.ok(volatile.risk.riskCodes.includes("trend_instability"));
  assert.ok(volatile.risk.riskCodes.includes("new_release_uncertainty"));
  assert.ok(volatile.risk.riskCodes.length >= 4);

  const falling = await service.run(request(DEV_ENTITY_IDS.fallingDemo));
  assert.equal(falling.maturity.maturityStage, "legacy");
  assert.equal(falling.risk.riskLevel, "high");
  assert.ok(
    falling.risk.contributingFactors.some((item) =>
      item.includes("快速下降")
    )
  );
});

test("Risk is deterministic and does not mutate prerequisite results", async () => {
  const { service, evidenceRepository } = await environment();
  const baseline = await service.run(request(DEV_ENTITY_IDS.wizardRod));
  const records = await evidenceRepository.list({
    entityId: DEV_ENTITY_IDS.wizardRod
  });
  const input = {
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceRecords: records,
    confidenceResult: baseline.confidence,
    trendResults: baseline.trend,
    maturityResult: baseline.maturity,
    analysisDate: ANALYSIS_DATE,
    modelId: RISK_MODEL_ID,
    modelVersion: RISK_MODEL_VERSION
  } as const;
  const before = structuredClone(input);
  assert.deepEqual(calculateRisk(input), calculateRisk(input));
  assert.deepEqual(input, before);
});

test("Recommendation produces strong, recommended, observe, conditional, avoid, and insufficient outcomes", async () => {
  const { service, evidenceRepository } = await environment();
  const strong = await service.run(request(DEV_ENTITY_IDS.wizardRod));
  const recommended = await service.run(request(DEV_ENTITY_IDS.risingDemo));
  const observe = await service.run(request(DEV_ENTITY_IDS.volatileDemo));
  const conditional = await service.run(request(DEV_ENTITY_IDS.cobaltDragoon));
  const insufficient = await service.run(
    request(DEV_ENTITY_IDS.noEvidenceDemo)
  );

  assert.equal(strong.recommendation.recommendationStatus, "strong_buy");
  assert.equal(recommended.recommendation.recommendationStatus, "recommended");
  assert.equal(observe.recommendation.recommendationStatus, "observe_and_test");
  assert.ok(
    ["conditional", "wait"].includes(
      conditional.recommendation.recommendationStatus
    )
  );
  assert.equal(
    insufficient.recommendation.recommendationStatus,
    "insufficient_data"
  );
  assert.equal(insufficient.recommendation.recommendationScore, null);

  const falling = await service.run(request(DEV_ENTITY_IDS.fallingDemo));
  assert.equal(falling.recommendation.recommendationStatus, "avoid");
  const nonVolatileTrend = {
    ...falling.trend,
    windows: falling.trend.windows.map((window) =>
      window.trendDirection === "volatile"
        ? { ...window, trendDirection: "down" as const }
        : window
    )
  };
  const fallingEvidence = await evidenceRepository.list({
    entityId: DEV_ENTITY_IDS.fallingDemo
  });
  const highRisk = calculateRisk({
    entityId: DEV_ENTITY_IDS.fallingDemo,
    evidenceRecords: fallingEvidence,
    confidenceResult: falling.confidence,
    trendResults: nonVolatileTrend,
    maturityResult: falling.maturity,
    analysisDate: ANALYSIS_DATE,
    modelId: RISK_MODEL_ID,
    modelVersion: RISK_MODEL_VERSION
  });
  const avoid = calculateRecommendation({
    entityId: DEV_ENTITY_IDS.fallingDemo,
    evidenceRecords: fallingEvidence,
    confidenceResult: falling.confidence,
    trendResults: nonVolatileTrend,
    maturityResult: falling.maturity,
    riskResult: highRisk,
    analysisDate: ANALYSIS_DATE,
    modelId: RECOMMENDATION_MODEL_ID,
    modelVersion: RECOMMENDATION_MODEL_VERSION,
    supportingAnalysisIds: ["confidence-trace", "trend-trace", "risk-trace"]
  });
  assert.equal(avoid.recommendationStatus, "avoid");
});

test("Recommendation caps high score when Confidence is low or Risk is high and keeps traceable reasons", async () => {
  const { service, evidenceRepository } = await environment();
  const baseline = await service.run(request(DEV_ENTITY_IDS.wizardRod));
  const records = await evidenceRepository.list({
    entityId: DEV_ENTITY_IDS.wizardRod
  });
  const lowConfidence = {
    ...baseline.confidence,
    confidenceScore: 95,
    confidenceLevel: "low" as const
  };
  const output = calculateRecommendation({
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceRecords: records,
    confidenceResult: lowConfidence,
    trendResults: baseline.trend,
    maturityResult: baseline.maturity,
    riskResult: { ...baseline.risk, riskLevel: "high", riskScore: 80 },
    analysisDate: ANALYSIS_DATE,
    modelId: RECOMMENDATION_MODEL_ID,
    modelVersion: RECOMMENDATION_MODEL_VERSION,
    supportingAnalysisIds: ["confidence-trace", "risk-trace"]
  });
  assert.notEqual(output.recommendationStatus, "strong_buy");
  assert.ok((output.recommendationScore ?? 100) <= 40);
  assert.deepEqual(output.supportingAnalysisIds, [
    "confidence-trace",
    "risk-trace"
  ]);
  assert.ok(output.reasons.length > 0);
  assert.ok(output.recommendationCodes.length > 0);
});

test("Meta Coach handles positive, risky, insufficient, and volatile cases in Traditional Chinese", async () => {
  const { service } = await environment();
  const positive = await service.run(request(DEV_ENTITY_IDS.wizardRod));
  const risky = await service.run(request(DEV_ENTITY_IDS.fallingDemo));
  const insufficient = await service.run(
    request(DEV_ENTITY_IDS.noEvidenceDemo)
  );
  const volatile = await service.run(request(DEV_ENTITY_IDS.volatileDemo));

  assert.equal(positive.coach.locale, "zh-TW");
  assert.ok(positive.coach.whatIsWorking.length > 0);
  assert.ok(risky.coach.whatToWatch.length > 0);
  assert.match(insufficient.coach.overallAssessment, /資料|證據/);
  assert.ok(
    volatile.coach.warnings.some((item) => item.includes("特定原因"))
  );
  assert.match(volatile.coach.trendExplanation, /不代表因果/);
  assert.ok(positive.coach.warnings.some((item) => item.includes("開發")));
});

test("Meta Coach is deterministic, trace-complete, and does not invent unavailable statistics", async () => {
  const { service } = await environment();
  const result = await service.run(request(DEV_ENTITY_IDS.wizardRod));
  const input = {
    entity: {
      entityId: DEV_ENTITY_IDS.wizardRod,
      displayNameZh: "開發測試上蓋",
      referenceNameEn: "Development Blade"
    },
    evidenceSummary: {
      verifiedCount: result.risk.evidenceCount,
      sourceCount: result.confidence.sourceDiversity.sourceCount,
      newestEvidenceDate: result.confidence.recency.newestEvidenceDate
    },
    confidenceResult: result.confidence,
    trendResults: result.trend,
    maturityResult: result.maturity,
    riskResult: result.risk,
    recommendationResult: result.recommendation,
    analysisDate: ANALYSIS_DATE,
    modelId: COACH_MODEL_ID,
    modelVersion: COACH_MODEL_VERSION,
    locale: "zh-TW" as const,
    dataMode: "development" as const,
    traceReferences: Object.values(result.traceIds)
  };
  const first = generateMetaCoach(input);
  const second = generateMetaCoach(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first.traceReferences, Object.values(result.traceIds));
  assert.doesNotMatch(JSON.stringify(first), /勝率|99%|冠軍/);
});

test("Full pipeline succeeds atomically, produces every trace, and upserts the same versions", async () => {
  const profiles = new CountingProfileRepository();
  const { service } = await environment(
    createPhase5AnalysisModelRegistry(),
    profiles
  );
  const first = await service.run(request(DEV_ENTITY_IDS.wizardRod));
  const second = await service.run(request(DEV_ENTITY_IDS.wizardRod));
  assert.equal(Object.keys(first.traceIds).length, 7);
  assert.ok(Object.values(first.traceIds).every((id) => id.length > 0));
  assert.equal(first.profile.analysisResults.length, 6);
  assert.equal(second.profile.analysisResults.length, 6);
  assert.equal(profiles.saveCount, 2);
});

test("Pipeline reports Evidence, Confidence, and Trend failures with exact stages", async () => {
  const catalog = createEvidenceDevCatalog();
  const profiles = new CountingProfileRepository();
  const failing = new FullAnalysisPipelineService(
    new FailingEvidenceRepository(),
    profiles,
    createPhase5AnalysisModelRegistry(),
    catalog.entities
  );
  await assert.rejects(
    failing.run(request(DEV_ENTITY_IDS.wizardRod)),
    (error: unknown) =>
      error instanceof FullAnalysisPipelineError &&
      error.stage === "evidence"
  );

  const { service } = await environment();
  await assert.rejects(
    service.run(
      request(DEV_ENTITY_IDS.wizardRod, { analysisDate: "2026-02-30" })
    ),
    (error: unknown) =>
      error instanceof FullAnalysisPipelineError &&
      error.stage === "confidence"
  );
  await assert.rejects(
    service.run(
      request(DEV_ENTITY_IDS.wizardRod, {
        versions: { ...VERSIONS, trend: "99.0.0" }
      })
    ),
    (error: unknown) =>
      error instanceof FullAnalysisPipelineError && error.stage === "trend"
  );
});

test("Registry output rejection leaves no partial profile", async () => {
  const registry = new AnalysisModelRegistry();
  registerPhase5AnalysisModels(registry);
  const brokenVersion = "1.0.1-broken";
  registry.registerSchema(
    "risk-mvp-input-broken",
    brokenVersion,
    RISK_INPUT_SCHEMA
  );
  registry.registerSchema("risk-mvp-output-broken", brokenVersion, {
    ...RISK_OUTPUT_SCHEMA,
    properties: {
      ...RISK_OUTPUT_SCHEMA.properties,
      requiredSentinel: { kind: "string", minLength: 1 }
    },
    required: [...RISK_OUTPUT_SCHEMA.required, "requiredSentinel"]
  });
  registry.registerModel({
    modelId: RISK_MODEL_ID,
    version: brokenVersion,
    inputSchemaId: "risk-mvp-input-broken",
    inputSchemaVersion: brokenVersion,
    outputSchemaId: "risk-mvp-output-broken",
    outputSchemaVersion: brokenVersion,
    supportedEntityTypes: ["blade"],
    lifecycleStatus: "active",
    reasonCodeNamespace: "risk"
  });
  registry.seal();
  const profiles = new CountingProfileRepository();
  const { service } = await environment(registry, profiles);
  await assert.rejects(
    service.run(
      request(DEV_ENTITY_IDS.wizardRod, {
        versions: { ...VERSIONS, risk: brokenVersion }
      })
    ),
    (error: unknown) =>
      error instanceof FullAnalysisPipelineError && error.stage === "risk"
  );
  assert.equal(profiles.saveCount, 0);
  assert.equal(
    await profiles.getByEntityId(DEV_ENTITY_IDS.wizardRod),
    undefined
  );
});

test("Pipeline preserves an older registered model version beside the current result", async () => {
  const registry = new AnalysisModelRegistry();
  registerPhase5AnalysisModels(registry);
  const oldVersion = "0.9.0";
  registry.registerSchema("meta-coach-mvp-input", oldVersion, COACH_INPUT_SCHEMA);
  registry.registerSchema(
    "meta-coach-mvp-output",
    oldVersion,
    COACH_OUTPUT_SCHEMA
  );
  registry.registerModel({
    modelId: COACH_MODEL_ID,
    version: oldVersion,
    inputSchemaId: "meta-coach-mvp-input",
    inputSchemaVersion: oldVersion,
    outputSchemaId: "meta-coach-mvp-output",
    outputSchemaVersion: oldVersion,
    supportedEntityTypes: ["blade"],
    lifecycleStatus: "active",
    reasonCodeNamespace: "coach"
  });
  registry.seal();
  const profiles = new CountingProfileRepository();
  const { service } = await environment(registry, profiles);
  await service.run(
    request(DEV_ENTITY_IDS.wizardRod, {
      versions: { ...VERSIONS, coach: oldVersion }
    })
  );
  const current = await service.run(request(DEV_ENTITY_IDS.wizardRod));
  const coachVersions = current.profile.analysisResults
    .filter((item) => item.modelId === COACH_MODEL_ID)
    .map((item) => item.modelVersion)
    .sort();
  assert.deepEqual(coachVersions, [oldVersion, COACH_MODEL_VERSION].sort());
  assert.equal(current.profile.analysisResults.length, 7);
});

test("ViewModel exposes loading, success, and stage-specific error states", async () => {
  const catalog = createEvidenceDevCatalog();
  const delayed = new DelayedEvidenceRepository(
    await seededEvidenceRepository()
  );
  const successViewModel = new FullAnalysisViewModel(
    new FullAnalysisPipelineService(
      delayed,
      new InMemoryMetaProfileRepository(),
      createPhase5AnalysisModelRegistry(),
      catalog.entities
    )
  );
  const pending = successViewModel.run(request(DEV_ENTITY_IDS.wizardRod));
  assert.equal(successViewModel.state.loading, true);
  const completed = await pending;
  assert.equal(completed.loading, false);
  assert.equal(completed.currentStage, "completed");
  assert.ok(completed.result !== null);
  const mismatched = await successViewModel.calculateRisk({
    entityId: DEV_ENTITY_IDS.noEvidenceDemo,
    analysisDate: ANALYSIS_DATE,
    modelId: RISK_MODEL_ID,
    modelVersion: RISK_MODEL_VERSION,
    confidenceModelVersion: CONFIDENCE_MODEL_VERSION,
    trendModelVersion: TREND_MODEL_VERSION,
    maturityModelVersion: MATURITY_MODEL_VERSION,
    confidenceResult: null,
    trendResults: null,
    maturityResult: null
  });
  assert.equal(mismatched.currentStage, "risk");
  assert.equal(mismatched.risk, null);
  assert.equal(mismatched.recommendation, null);
  assert.equal(mismatched.coach, null);

  const errorViewModel = new FullAnalysisViewModel(
    new FullAnalysisPipelineService(
      new FailingEvidenceRepository(),
      new InMemoryMetaProfileRepository(),
      createPhase5AnalysisModelRegistry(),
      catalog.entities
    )
  );
  const failed = await errorViewModel.run(request(DEV_ENTITY_IDS.wizardRod));
  assert.equal(failed.loading, false);
  assert.equal(failed.currentStage, "evidence");
  assert.ok(failed.errors.length > 0);
});

test("Phase 5 model outputs remain JSON serializable and Registry-valid", async () => {
  const registry = createPhase5AnalysisModelRegistry();
  const { service } = await environment(registry);
  const result = await service.run(request(DEV_ENTITY_IDS.wizardRod));
  const modelPairs = [
    [RISK_MODEL_ID, RISK_MODEL_VERSION],
    [RECOMMENDATION_MODEL_ID, RECOMMENDATION_MODEL_VERSION],
    [COACH_MODEL_ID, COACH_MODEL_VERSION]
  ] as const;
  const outputs: readonly [string, string, JsonValue][] = modelPairs.map(
    ([modelId, version]) => {
    const analysis = result.profile.analysisResults.find(
      (item) =>
        item.modelId === modelId && item.modelVersion === version
    );
    assert.ok(analysis !== undefined);
      return [modelId, version, analysis.output];
    }
  );
  outputs.forEach(([modelId, version, output]) => {
    const validation: ValidationResult<JsonValue> =
      registry.validateOutput(modelId, version, output);
    assert.equal(validation.success, true);
  });
});
