import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { KeyValueStorage } from "../../src/meta/evidence/index.js";
import {
  canonicalEntityIdFor,
  createFormalEntityCatalog,
  createMetaEnvironment,
  MetaDashboardViewModel,
  parseMetaLocation,
  resolveMetaDataMode
} from "../../src/meta/integration/index.js";

const MOCK_DATABASE = {
  blades: [
    {
      id: "測試戰刃",
      model: "Test Blade",
      name: "測試戰刃",
      name_en: "Test Blade",
      series: "BX",
      role: "測試定位",
      metaTier: "B",
      recommendedRatchets: ["3-60"],
      recommendedBits: ["R"]
    },
    {
      id: "空資料戰刃",
      model: "Empty Blade",
      name: "空資料戰刃",
      name_en: "Empty Blade",
      series: "UX"
    }
  ],
  ratchets: [
    {
      id: "3-60",
      code: "3-60",
      name: "3-60",
      height: 60
    }
  ],
  bits: [
    {
      id: "R",
      code: "R",
      name: "衝刺",
      name_en: "Rush"
    }
  ],
  cx: {
    lockChips: [{ id: "測試紋章", name: "測試紋章" }],
    mainBlades: [],
    metalBlades: [],
    overBlades: [],
    assistBlades: []
  }
};

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("formal catalog creates stable unique canonical entities", () => {
  const first = createFormalEntityCatalog(MOCK_DATABASE);
  const second = createFormalEntityCatalog(MOCK_DATABASE);
  assert.equal(first.summaries.length, 5);
  assert.equal(
    first.summaries[0]?.entity.id,
    second.summaries[0]?.entity.id
  );
  assert.equal(
    new Set(first.summaries.map((item) => item.entity.id)).size,
    first.summaries.length
  );
  assert.match(canonicalEntityIdFor("blade", "Test Blade"), /^ent_/u);
});

test("formal catalog supports Chinese, English, model, and type search", () => {
  const catalog = createFormalEntityCatalog(MOCK_DATABASE);
  assert.equal(catalog.search("測試戰刃").length, 1);
  assert.equal(catalog.search("TestBlade").length, 1);
  assert.equal(catalog.search("3 60").length, 1);
  assert.ok(catalog.search("紋章鎖").length >= 1);
});

test("meta query parser supports direct entity and alias routes", () => {
  assert.deepEqual(
    parseMetaLocation("?entityId=ent_123&mode=development"),
    {
      entityId: "ent_123",
      alias: null,
      requestedDevelopmentMode: true
    }
  );
  assert.deepEqual(parseMetaLocation("?name=%E6%B8%AC%E8%A9%A6"), {
    entityId: null,
    alias: "測試",
    requestedDevelopmentMode: false
  });
});

test("development mode is localhost-only", () => {
  assert.equal(resolveMetaDataMode("127.0.0.1", true), "development");
  assert.equal(resolveMetaDataMode("localhost", true), "development");
  assert.equal(
    resolveMetaDataMode("k89150-art.github.io", true),
    "preview"
  );
});

test("production preview starts empty and never injects seed data", async () => {
  const environment = await createMetaEnvironment(
    MOCK_DATABASE,
    "preview",
    new MemoryStorage()
  );
  assert.equal(environment.status.seedEnabled, false);
  assert.equal(environment.status.persistent, false);
  assert.equal(environment.status.repositoryStatus, "missing-config");
  await assert.rejects(environment.evidenceRepository.list());
});

test("development mode uses isolated seed and storage", async () => {
  const storage = new MemoryStorage();
  const environment = await createMetaEnvironment(
    MOCK_DATABASE,
    "development",
    storage
  );
  assert.equal(environment.status.seedEnabled, true);
  assert.equal(environment.status.persistent, true);
  assert.ok((await environment.evidenceRepository.list()).length > 0);
  assert.ok(
    [...storage.values.keys()].every((key) =>
      key.includes("development")
    )
  );
});

test("corrupt development LocalStorage is preserved and safely downgraded", async () => {
  const storage = new MemoryStorage();
  storage.setItem("beyblade-meta-development-evidence-v1", "{broken");
  const environment = await createMetaEnvironment(
    MOCK_DATABASE,
    "development",
    storage
  );
  assert.equal(environment.status.persistent, false);
  assert.ok(environment.status.warnings.length >= 1);
  assert.equal(
    storage.getItem("beyblade-meta-development-evidence-v1"),
    "{broken"
  );
  assert.equal((await environment.evidenceRepository.list()).length, 0);
});

test("dashboard rejects unknown entity and reports a user-facing error", async () => {
  const environment = await createMetaEnvironment(
    MOCK_DATABASE,
    "preview"
  );
  const viewModel = new MetaDashboardViewModel(
    environment.catalog,
    environment.evidenceService,
    environment.pipeline,
    "preview",
    "2026-07-30"
  );
  const state = await viewModel.selectEntity(
    "ent_00000000-0000-4000-8000-000000000099"
  );
  assert.equal(state.status, "error");
  assert.equal(state.selectedEntity, null);
  assert.match(state.errors[0] ?? "", /找不到指定/u);
});

test("empty Evidence still returns an explicit insufficient analysis", async () => {
  const environment = await createMetaEnvironment(
    MOCK_DATABASE,
    "development",
    new MemoryStorage()
  );
  const selected = environment.catalog.search("測試戰刃")[0];
  assert.ok(selected);
  const viewModel = new MetaDashboardViewModel(
    environment.catalog,
    environment.evidenceService,
    environment.pipeline,
    "development",
    "2026-07-30"
  );
  await viewModel.selectEntity(selected.entity.id);
  const pending = viewModel.runAnalysis();
  assert.equal(viewModel.state.status, "loading");
  const state = await pending;
  assert.equal(state.status, "ready");
  assert.equal(state.result?.confidence.evidenceCount, 0);
  assert.equal(state.result?.confidence.confidenceScore, null);
  assert.equal(
    state.result?.recommendation.recommendationStatus,
    "insufficient_data"
  );
});

test("entity and analysis-date changes clear stale results", async () => {
  const environment = await createMetaEnvironment(
    MOCK_DATABASE,
    "development",
    new MemoryStorage()
  );
  const [first, second] = environment.catalog.search("戰刃");
  assert.ok(first);
  assert.ok(second);
  const viewModel = new MetaDashboardViewModel(
    environment.catalog,
    environment.evidenceService,
    environment.pipeline,
    "development",
    "2026-07-30"
  );
  await viewModel.selectEntity(first.entity.id);
  assert.ok((await viewModel.runAnalysis()).result);
  assert.equal(viewModel.setAnalysisDate("2026-07-29").result, null);
  await viewModel.runAnalysis();
  assert.equal(
    (await viewModel.selectEntity(second.entity.id)).result,
    null
  );
});

test("Evidence creation flows through validation and clears old analysis", async () => {
  const environment = await createMetaEnvironment(
    MOCK_DATABASE,
    "development",
    new MemoryStorage()
  );
  const selected = environment.catalog.search("測試戰刃")[0];
  assert.ok(selected);
  const viewModel = new MetaDashboardViewModel(
    environment.catalog,
    environment.evidenceService,
    environment.pipeline,
    "development",
    "2026-07-30"
  );
  await viewModel.selectEntity(selected.entity.id);
  await viewModel.runAnalysis();
  const state = await viewModel.addEvidence({
    id: "formal-evidence-1",
    entityId: selected.entity.id,
    evidenceType: "tournament_result",
    eventDate: "2026-07-20",
    sourceId: "source-tw",
    sourceName: "Test Source",
    region: "TW",
    status: "verified",
    grade: "B",
    dimensionScores: {
      source_quality: 80,
      sample_size: 60,
      regional_diversity: 30,
      time_consistency: 70,
      configuration_consistency: 75,
      independent_confirmation: 50
    }
  });
  assert.equal(state.evidence.length, 1);
  assert.equal(state.result, null);
  assert.equal(state.errors.length, 0);
});

test("formal navigation exposes Meta and never exposes the development MVP", () => {
  const menu = readFileSync("site-menu.js", "utf8");
  assert.match(menu, /href: "meta\.html"/u);
  assert.doesNotMatch(menu, /evidence-mvp\.html/u);
});

test("formal page preserves mobile order and protects long trace text", () => {
  const html = readFileSync("meta.html", "utf8");
  const css = readFileSync("meta.css", "utf8");
  assert.ok(
    html.indexOf('id="metaEntitySummary"') <
      html.indexOf('id="metaEvidenceSummary"')
  );
  assert.ok(
    html.indexOf('id="metaEvidenceSummary"') <
      html.indexOf('id="metaAnalysisResults"')
  );
  assert.match(css, /@media \(max-width: 820px\)/u);
  assert.match(css, /@media \(max-width: 600px\)/u);
  assert.match(css, /#metaTechnicalContent[\s\S]*overflow-wrap: anywhere/u);
});
