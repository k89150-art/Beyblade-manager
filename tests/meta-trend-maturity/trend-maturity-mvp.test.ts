import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIDENCE_MODEL_ID,
  CONFIDENCE_MODEL_VERSION,
  ConfidenceService,
  InMemoryMetaProfileRepository,
  type ConfidenceLevel,
  type ConfidenceModelOutput
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
  createEvidenceDevCatalog
} from "../../src/meta/evidence/seed.js";
import {
  MATURITY_MODEL_ID,
  MATURITY_MODEL_VERSION,
  MaturityService,
  MaturityViewModel,
  calculateMaturity,
  createPhase4AnalysisModelRegistry,
  type MaturityEngineInput
} from "../../src/meta/maturity/index.js";
import {
  TREND_MODEL_ID,
  TREND_MODEL_VERSION,
  TrendService,
  TrendViewModel,
  calculateTrend,
  calculateTrendWindows,
  type TrendEngineInput,
  type TrendModelOutput,
  type TrendWindowOutput
} from "../../src/meta/trend/index.js";

const ANALYSIS_DATE = "2026-07-30";

function scores(value: number) {
  return sixDimensionScores(value, value, value, value, value, value);
}

function draft(
  id: string,
  eventDate: string,
  value: number,
  overrides: Partial<EvidenceCreateDraft> = {}
): EvidenceCreateDraft {
  return {
    id,
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "development_observation",
    status: "verified",
    grade: "A",
    eventDate,
    sourceId: `source-${id}`,
    sourceName: `Source ${id}`,
    region: "TW",
    dimensionScores: scores(value),
    ...overrides
  };
}

async function entriesFrom(
  drafts: readonly EvidenceCreateDraft[]
): Promise<readonly EvidenceEntry[]> {
  const catalog = createEvidenceDevCatalog();
  const repository = new InMemoryEvidenceRepository();
  const service = new EvidenceService(repository, catalog.entities, {
    now: () => new Date("2026-07-30T00:00:00Z")
  });
  for (const item of drafts) {
    await service.create(item);
  }
  return repository.list();
}

function confidence(
  score = 90,
  level: ConfidenceLevel = "high"
): ConfidenceModelOutput {
  return {
    entityId: DEV_ENTITY_IDS.wizardRod,
    confidenceScore: score,
    hardCap: 100,
    confidenceLevel: level,
    evidenceCount: 8,
    sourceDiversity: { sourceCount: 3, score: 100 },
    recency: {
      newestEvidenceDate: "2026-07-25",
      ageDays: 5,
      score: 100
    },
    completeness: {
      knownDimensionCount: 48,
      totalDimensionCount: 48,
      score: 100
    },
    consistency: { score: 90, spread: 10 },
    dimensions: [
      {
        dimensionId: "sample_size",
        score: 100,
        explanation: "Test fixture."
      }
    ],
    includedEvidenceIds: [],
    excludedEvidence: [],
    reasonCodes: ["confidence.test_fixture"],
    reasons: ["Test fixture."],
    positiveFactors: ["Test fixture."],
    negativeFactors: [],
    calculatedAt: `${ANALYSIS_DATE}T00:00:00.000Z`
  };
}

function trendInput(
  evidenceRecords: readonly EvidenceEntry[],
  overrides: Partial<TrendEngineInput> = {}
): TrendEngineInput {
  return {
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceRecords,
    confidenceResult: confidence(),
    analysisDate: ANALYSIS_DATE,
    windowWeeks: 4,
    modelId: TREND_MODEL_ID,
    modelVersion: TREND_MODEL_VERSION,
    ...overrides
  };
}

function periodDrafts(
  previousValues: readonly number[],
  currentValues: readonly number[]
): readonly EvidenceCreateDraft[] {
  const previousDates = ["2026-06-10", "2026-06-24", "2026-06-28"];
  const currentDates = ["2026-07-08", "2026-07-18", "2026-07-27"];
  return [
    ...previousValues.map((value, index) =>
      draft(`previous-${index}-${value}`, previousDates[index] ?? "2026-06-12", value)
    ),
    ...currentValues.map((value, index) =>
      draft(`current-${index}-${value}`, currentDates[index] ?? "2026-07-12", value)
    )
  ];
}

function trendWindow(
  windowWeeks: 4 | 8 | 12,
  direction: TrendWindowOutput["trendDirection"] = "stable"
): TrendWindowOutput {
  return {
    entityId: DEV_ENTITY_IDS.wizardRod,
    windowWeeks,
    periodStart: windowWeeks === 4 ? "2026-07-03" : "2026-05-08",
    periodEnd: ANALYSIS_DATE,
    comparisonStart: "2026-02-13",
    comparisonEnd: "2026-05-07",
    trendDirection: direction,
    trendStrength: direction === "insufficient_data" ? null : 2,
    currentValue: direction === "insufficient_data" ? null : 75,
    previousValue: direction === "insufficient_data" ? null : 73,
    absoluteChange: direction === "insufficient_data" ? null : 2,
    percentageChange: direction === "insufficient_data" ? null : 2.74,
    sampleCount: 8,
    validSampleCount: 8,
    currentSampleCount: 4,
    comparisonSampleCount: 4,
    confidence: direction === "insufficient_data" ? null : 80,
    reasonCodes: [`trend.${direction}`],
    reasons: ["Test fixture."],
    includedEvidenceIds: [],
    excludedEvidence: [],
    calculatedAt: `${ANALYSIS_DATE}T00:00:00.000Z`
  };
}

function trendModel(
  directions: readonly [
    TrendWindowOutput["trendDirection"],
    TrendWindowOutput["trendDirection"],
    TrendWindowOutput["trendDirection"]
  ] = ["stable", "stable", "stable"]
): TrendModelOutput {
  return {
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    windows: [
      trendWindow(4, directions[0]),
      trendWindow(8, directions[1]),
      trendWindow(12, directions[2])
    ],
    reasonCodes: [...new Set(directions.map((item) => `trend.${item}`))],
    calculatedAt: `${ANALYSIS_DATE}T00:00:00.000Z`
  };
}

function maturityInput(
  evidenceRecords: readonly EvidenceEntry[],
  overrides: Partial<MaturityEngineInput> = {}
): MaturityEngineInput {
  return {
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceRecords,
    confidenceResult: confidence(),
    trendResults: trendModel(),
    analysisDate: ANALYSIS_DATE,
    modelId: MATURITY_MODEL_ID,
    modelVersion: MATURITY_MODEL_VERSION,
    ...overrides
  };
}

test("Trend supports deterministic 4, 8, and 12 week windows", async () => {
  const entries = await entriesFrom([
    draft("w-current-1", "2026-07-10", 70),
    draft("w-current-2", "2026-07-20", 72),
    draft("w-prev-1", "2026-06-10", 60),
    draft("w-prev-2", "2026-06-20", 62),
    draft("w-older-1", "2026-04-10", 50),
    draft("w-older-2", "2026-04-20", 52),
    draft("w-oldest-1", "2026-02-20", 40),
    draft("w-oldest-2", "2026-03-01", 42)
  ]);
  const windows = calculateTrendWindows({
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceRecords: entries,
    confidenceResult: confidence(),
    analysisDate: ANALYSIS_DATE,
    modelId: TREND_MODEL_ID,
    modelVersion: TREND_MODEL_VERSION
  });
  assert.deepEqual(windows.map((item) => item.windowWeeks), [4, 8, 12]);
  windows.forEach((window) => {
    assert.ok(window.comparisonEnd < window.periodStart);
    assert.equal(window.periodEnd, ANALYSIS_DATE);
  });
});

test("Trend identifies clear rising movement", async () => {
  const output = calculateTrend(
    trendInput(await entriesFrom(periodDrafts([35, 40], [75, 80])))
  );
  assert.equal(output.trendDirection, "strong_up");
  assert.ok((output.absoluteChange ?? 0) > 15);
});

test("Trend identifies clear falling movement", async () => {
  const output = calculateTrend(
    trendInput(await entriesFrom(periodDrafts([85, 80], [40, 35])))
  );
  assert.equal(output.trendDirection, "strong_down");
  assert.ok((output.absoluteChange ?? 0) < -15);
});

test("Trend identifies stable movement", async () => {
  const output = calculateTrend(
    trendInput(await entriesFrom(periodDrafts([70, 72], [72, 73])))
  );
  assert.equal(output.trendDirection, "stable");
});

test("Trend identifies high volatility before directional labels", async () => {
  const output = calculateTrend(
    trendInput(await entriesFrom(periodDrafts([45, 50], [20, 90])))
  );
  assert.equal(output.trendDirection, "volatile");
  assert.ok(output.reasonCodes.includes("trend.high_volatility"));
});

test("Trend reports insufficient samples and empty periods", async () => {
  const one = calculateTrend(
    trendInput(await entriesFrom([draft("only-one", "2026-07-20", 80)]))
  );
  assert.equal(one.trendDirection, "insufficient_data");
  assert.equal(one.absoluteChange, null);

  const comparisonOnly = calculateTrend(
    trendInput(
      await entriesFrom([
        draft("comp-1", "2026-06-10", 60),
        draft("comp-2", "2026-06-20", 65)
      ])
    )
  );
  assert.ok(
    comparisonOnly.reasonCodes.includes("trend.current_period_insufficient")
  );

  const currentOnly = calculateTrend(
    trendInput(
      await entriesFrom([
        draft("now-1", "2026-07-10", 70),
        draft("now-2", "2026-07-20", 75)
      ])
    )
  );
  assert.ok(
    currentOnly.reasonCodes.includes(
      "trend.comparison_period_insufficient"
    )
  );
});

test("zero baseline produces null percentage without Infinity", async () => {
  const output = calculateTrend(
    trendInput(await entriesFrom(periodDrafts([0, 0], [30, 35])))
  );
  assert.equal(output.percentageChange, null);
  assert.equal(output.trendDirection, "up");
  assert.ok(
    output.reasonCodes.includes("trend.percentage_baseline_unavailable")
  );
});

test("future Evidence is excluded with a reason", async () => {
  const entries = await entriesFrom([
    ...periodDrafts([50, 55], [60, 65]),
    draft("future", "2026-08-01", 100)
  ]);
  const output = calculateTrend(trendInput(entries));
  assert.equal(
    output.excludedEvidence.find((item) => item.evidenceId === "future")
      ?.reasonCode,
    "trend.future_evidence"
  );
});

test("period boundary Evidence belongs to exactly one period", async () => {
  const entries = await entriesFrom([
    draft("current-boundary", "2026-07-03", 70),
    draft("current-middle", "2026-07-20", 72),
    draft("comparison-boundary", "2026-07-02", 60),
    draft("comparison-middle", "2026-06-20", 62)
  ]);
  const output = calculateTrend(trendInput(entries));
  assert.equal(output.validSampleCount, 4);
  assert.equal(
    output.includedEvidenceIds.filter((id) => id === "current-boundary")
      .length,
    1
  );
  assert.equal(
    output.includedEvidenceIds.filter((id) => id === "comparison-boundary")
      .length,
    1
  );
});

test("analysisDate changes Trend windows and result deterministically", async () => {
  const entries = await entriesFrom(periodDrafts([50, 55], [70, 75]));
  const current = calculateTrend(trendInput(entries));
  const later = calculateTrend(
    trendInput(entries, { analysisDate: "2026-08-30" })
  );
  assert.notEqual(current.periodStart, later.periodStart);
  assert.notDeepEqual(current, later);
  assert.deepEqual(
    calculateTrend(trendInput(entries)),
    calculateTrend(trendInput(entries))
  );
});

test("Trend Engine does not modify original Evidence", async () => {
  const entries = await entriesFrom(periodDrafts([50, 55], [70, 75]));
  const before = structuredClone(entries);
  calculateTrend(trendInput(entries));
  assert.deepEqual(entries, before);
});

test("Maturity returns null for insufficient data", () => {
  const output = calculateMaturity(
    maturityInput([], {
      confidenceResult: confidence(0, "insufficient"),
      trendResults: trendModel([
        "insufficient_data",
        "insufficient_data",
        "insufficient_data"
      ])
    })
  );
  assert.equal(output.maturityStage, null);
  assert.equal(output.maturityScore, null);
});

test("Maturity distinguishes seed and emerging stages", async () => {
  const seedEntries = await entriesFrom([
    draft("seed-1", "2026-07-25", 90)
  ]);
  assert.equal(
    calculateMaturity(
      maturityInput(seedEntries, {
        confidenceResult: confidence(40, "low")
      })
    ).maturityStage,
    "seed"
  );

  const emergingEntries = await entriesFrom([
    draft("emerge-1", "2026-06-20", 55, { sourceId: "source-a" }),
    draft("emerge-2", "2026-06-30", 60, { sourceId: "source-b" }),
    draft("emerge-3", "2026-07-10", 70, { sourceId: "source-a" }),
    draft("emerge-4", "2026-07-25", 75, { sourceId: "source-b" })
  ]);
  assert.equal(
    calculateMaturity(
      maturityInput(emergingEntries, {
        confidenceResult: confidence(60, "medium"),
        trendResults: trendModel(["up", "up", "insufficient_data"])
      })
    ).maturityStage,
    "emerging"
  );
});

test("Maturity distinguishes established and mature stages", async () => {
  const establishedEntries = await entriesFrom(
    [
      "2026-05-20",
      "2026-06-01",
      "2026-06-15",
      "2026-06-30",
      "2026-07-12",
      "2026-07-25"
    ].map((date, index) =>
      draft(`established-${index}`, date, 70, {
        sourceId: `source-${index % 2}`
      })
    )
  );
  assert.equal(
    calculateMaturity(
      maturityInput(establishedEntries, {
        confidenceResult: confidence(70, "medium")
      })
    ).maturityStage,
    "established"
  );

  const matureEntries = await entriesFrom(
    [
      "2026-03-01",
      "2026-03-20",
      "2026-04-15",
      "2026-05-10",
      "2026-06-01",
      "2026-06-20",
      "2026-07-10",
      "2026-07-25"
    ].map((date, index) =>
      draft(`mature-${index}`, date, 80, {
        sourceId: `source-${index % 3}`,
        region: ["TW", "JP", "US"][index % 3] ?? "TW"
      })
    )
  );
  assert.equal(
    calculateMaturity(maturityInput(matureEntries)).maturityStage,
    "mature"
  );
});

test("Maturity identifies legacy without treating it as avoid", async () => {
  const entries = await entriesFrom(
    [
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-20"
    ].map((date, index) =>
      draft(`legacy-${index}`, date, 80 - index * 8, {
        sourceId: `source-${index % 3}`
      })
    )
  );
  const output = calculateMaturity(
    maturityInput(entries, {
      trendResults: trendModel(["down", "down", "strong_down"])
    })
  );
  assert.equal(output.maturityStage, "legacy");
  assert.ok(output.reasons.some((reason) => reason.includes("不代表 avoid")));
});

test("many single-source Evidence cannot become mature", async () => {
  const entries = await entriesFrom(
    [
      "2026-03-01",
      "2026-03-20",
      "2026-04-15",
      "2026-05-10",
      "2026-06-01",
      "2026-06-20",
      "2026-07-10",
      "2026-07-25"
    ].map((date, index) =>
      draft(`single-source-${index}`, date, 80, {
        sourceId: "only-source"
      })
    )
  );
  const output = calculateMaturity(maturityInput(entries));
  assert.notEqual(output.maturityStage, "mature");
  assert.ok(output.reasonCodes.includes("maturity.single_source"));
});

test("few high-score Evidence remain seed", async () => {
  const entries = await entriesFrom([
    draft("few-high-1", "2026-07-20", 100),
    draft("few-high-2", "2026-07-25", 100, { sourceId: "other" })
  ]);
  assert.equal(
    calculateMaturity(maturityInput(entries)).maturityStage,
    "seed"
  );
});

test("unknown Confidence prevents Maturity classification", async () => {
  const entries = await entriesFrom(
    periodDrafts([60, 65], [70, 75])
  );
  const output = calculateMaturity(
    maturityInput(entries, {
      confidenceResult: confidence(0, "insufficient")
    })
  );
  assert.equal(output.maturityStage, null);
});

test("volatile Trend blocks mature and lowers stability", async () => {
  const entries = await entriesFrom(
    [
      "2026-03-01",
      "2026-03-20",
      "2026-04-15",
      "2026-05-10",
      "2026-06-01",
      "2026-06-20",
      "2026-07-10",
      "2026-07-25"
    ].map((date, index) =>
      draft(`volatile-maturity-${index}`, date, 80, {
        sourceId: `source-${index % 3}`
      })
    )
  );
  const output = calculateMaturity(
    maturityInput(entries, {
      trendResults: trendModel(["volatile", "stable", "stable"])
    })
  );
  assert.notEqual(output.maturityStage, "mature");
  assert.ok(output.reasonCodes.includes("maturity.trend_volatility"));
});

test("Maturity is deterministic and does not modify prerequisites", async () => {
  const entries = await entriesFrom(
    periodDrafts([60, 65], [70, 75])
  );
  const input = maturityInput(entries);
  const before = structuredClone(input);
  assert.deepEqual(calculateMaturity(input), calculateMaturity(input));
  assert.deepEqual(input, before);
});

test("Services validate, save, and replace same model results", async () => {
  const entries = await entriesFrom([
    ...periodDrafts([50, 55], [70, 75]),
    draft("service-old-1", "2026-03-01", 45),
    draft("service-old-2", "2026-04-01", 48)
  ]);
  const evidenceRepository = new InMemoryEvidenceRepository(entries);
  const profileRepository = new InMemoryMetaProfileRepository();
  const registry = createPhase4AnalysisModelRegistry();
  const confidenceService = new ConfidenceService(
    evidenceRepository,
    profileRepository,
    registry
  );
  const confidenceResult = await confidenceService.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    modelId: CONFIDENCE_MODEL_ID,
    modelVersion: CONFIDENCE_MODEL_VERSION
  });
  const trendService = new TrendService(
    evidenceRepository,
    profileRepository,
    registry
  );
  const firstTrend = await trendService.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    modelId: TREND_MODEL_ID,
    modelVersion: TREND_MODEL_VERSION,
    confidenceResult: confidenceResult.output
  });
  await trendService.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    modelId: TREND_MODEL_ID,
    modelVersion: TREND_MODEL_VERSION,
    confidenceResult: confidenceResult.output
  });
  const maturityService = new MaturityService(
    evidenceRepository,
    profileRepository,
    registry
  );
  const maturityResult = await maturityService.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    modelId: MATURITY_MODEL_ID,
    modelVersion: MATURITY_MODEL_VERSION,
    confidenceResult: confidenceResult.output,
    trendResults: firstTrend.output
  });
  const profile = await profileRepository.getByEntityId(
    DEV_ENTITY_IDS.wizardRod
  );
  assert.equal(
    profile?.analysisResults.filter(
      (result) => result.modelId === TREND_MODEL_ID
    ).length,
    1
  );
  assert.equal(profile?.analysisResults.length, 3);
  assert.equal(
    registry.validateOutput(
      MATURITY_MODEL_ID,
      MATURITY_MODEL_VERSION,
      maturityResult.profile.analysisResults.find(
        (result) => result.modelId === MATURITY_MODEL_ID
      )?.output
    ).success,
    true
  );
});

test("ViewModels expose success, empty, error, and missing prerequisites", async () => {
  const entries = await entriesFrom(periodDrafts([50, 55], [70, 75]));
  const evidenceRepository = new InMemoryEvidenceRepository(entries);
  const profiles = new InMemoryMetaProfileRepository();
  const registry = createPhase4AnalysisModelRegistry();
  const trendViewModel = new TrendViewModel(
    new TrendService(evidenceRepository, profiles, registry)
  );
  let trendState = await trendViewModel.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    modelId: TREND_MODEL_ID,
    modelVersion: TREND_MODEL_VERSION,
    confidenceResult: confidence()
  });
  assert.equal(trendState.errors.length, 0);
  assert.equal(trendState.result?.windows.length, 3);

  trendState = await trendViewModel.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: "bad-date",
    modelId: TREND_MODEL_ID,
    modelVersion: TREND_MODEL_VERSION,
    confidenceResult: confidence()
  });
  assert.equal(trendState.result, null);
  assert.ok(trendState.errors.length > 0);

  const maturityViewModel = new MaturityViewModel(
    new MaturityService(evidenceRepository, profiles, registry)
  );
  let maturityState = await maturityViewModel.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    modelId: MATURITY_MODEL_ID,
    modelVersion: MATURITY_MODEL_VERSION,
    confidenceResult: null,
    trendResults: null
  });
  assert.equal(maturityState.result, null);
  assert.ok(maturityState.errors.length > 0);

  maturityState = await maturityViewModel.calculate({
    entityId: DEV_ENTITY_IDS.wizardRod,
    analysisDate: ANALYSIS_DATE,
    modelId: MATURITY_MODEL_ID,
    modelVersion: MATURITY_MODEL_VERSION,
    confidenceResult: confidence(),
    trendResults: trendModel()
  });
  assert.equal(maturityState.errors.length, 0);
  assert.notEqual(maturityState.result, null);
});
