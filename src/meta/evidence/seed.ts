import {
  CatalogEntityRegistry,
  EntityTypeRegistry,
  type CanonicalEntityId,
  type CatalogEntity
} from "../domain/index.js";
import { sixDimensionScores } from "./service.js";
import type { EvidenceCreateDraft } from "./types.js";

const CREATED_AT = "2026-07-29T00:00:00Z";

export const DEV_ENTITY_IDS = {
  wizardRod: "ent_00000000-0000-4000-8000-000000000001",
  tyrannoBeat: "ent_00000000-0000-4000-8000-000000000002",
  cobaltDragoon: "ent_00000000-0000-4000-8000-000000000003",
  noEvidenceDemo: "ent_00000000-0000-4000-8000-000000000004",
  risingDemo: "ent_00000000-0000-4000-8000-000000000005",
  fallingDemo: "ent_00000000-0000-4000-8000-000000000006",
  volatileDemo: "ent_00000000-0000-4000-8000-000000000007",
  emergingDemo: "ent_00000000-0000-4000-8000-000000000008"
} as const satisfies Readonly<Record<string, CanonicalEntityId>>;

export interface EvidenceDevCatalog {
  readonly entities: CatalogEntityRegistry;
  readonly items: readonly CatalogEntity[];
}

export function createEvidenceDevCatalog(): EvidenceDevCatalog {
  const entityTypes = new EntityTypeRegistry();
  entityTypes.register({
    typeId: "blade",
    displayName: "Blade",
    category: "upper",
    supportedSeries: [],
    attributesSchema: {
      kind: "object",
      properties: {},
      required: [],
      additionalProperties: false,
      refinements: []
    },
    lifecycleStatus: "active",
    version: "1.0.0"
  });
  entityTypes.seal();

  const items: readonly CatalogEntity[] = [
    {
      id: DEV_ENTITY_IDS.wizardRod,
      entityTypeId: "blade",
      entityTypeVersion: "1.0.0",
      canonicalName: "wizard-rod",
      displayNameZh: "魔導神杖",
      referenceNameEn: "Wizard Rod",
      seriesIds: ["UX"],
      legacyIds: ["UX-03"],
      attributes: {},
      active: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    },
    {
      id: DEV_ENTITY_IDS.tyrannoBeat,
      entityTypeId: "blade",
      entityTypeVersion: "1.0.0",
      canonicalName: "tyranno-beat",
      displayNameZh: "暴龍霸擊",
      referenceNameEn: "Tyranno Beat",
      seriesIds: ["BX"],
      legacyIds: ["BX-31"],
      attributes: {},
      active: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    },
    {
      id: DEV_ENTITY_IDS.cobaltDragoon,
      entityTypeId: "blade",
      entityTypeVersion: "1.0.0",
      canonicalName: "cobalt-dragoon",
      displayNameZh: "蒼穹龍騎士",
      referenceNameEn: "Cobalt Dragoon",
      seriesIds: ["UX"],
      legacyIds: ["UX-01"],
      attributes: {},
      active: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    },
    {
      id: DEV_ENTITY_IDS.noEvidenceDemo,
      entityTypeId: "blade",
      entityTypeVersion: "1.0.0",
      canonicalName: "no-evidence-demo",
      displayNameZh: "無 Evidence 測試項目",
      referenceNameEn: "No Evidence Demo",
      seriesIds: ["DEVELOPMENT"],
      legacyIds: [],
      attributes: {},
      active: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    },
    {
      id: DEV_ENTITY_IDS.risingDemo,
      entityTypeId: "blade",
      entityTypeVersion: "1.0.0",
      canonicalName: "rising-demo",
      displayNameZh: "上升趨勢測試",
      referenceNameEn: "Rising Trend Demo",
      seriesIds: ["DEVELOPMENT"],
      legacyIds: [],
      attributes: {},
      active: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    },
    {
      id: DEV_ENTITY_IDS.fallingDemo,
      entityTypeId: "blade",
      entityTypeVersion: "1.0.0",
      canonicalName: "falling-demo",
      displayNameZh: "衰退趨勢測試",
      referenceNameEn: "Falling Trend Demo",
      seriesIds: ["DEVELOPMENT"],
      legacyIds: [],
      attributes: {},
      active: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    },
    {
      id: DEV_ENTITY_IDS.volatileDemo,
      entityTypeId: "blade",
      entityTypeVersion: "1.0.0",
      canonicalName: "volatile-demo",
      displayNameZh: "高波動測試",
      referenceNameEn: "Volatile Trend Demo",
      seriesIds: ["DEVELOPMENT"],
      legacyIds: [],
      attributes: {},
      active: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    },
    {
      id: DEV_ENTITY_IDS.emergingDemo,
      entityTypeId: "blade",
      entityTypeVersion: "1.0.0",
      canonicalName: "emerging-demo",
      displayNameZh: "新興階段測試",
      referenceNameEn: "Emerging Stage Demo",
      seriesIds: ["DEVELOPMENT"],
      legacyIds: [],
      attributes: {},
      active: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    }
  ];

  const entities = new CatalogEntityRegistry();
  items.forEach((entity) => entities.register(entity, entityTypes));
  entities.seal();
  return { entities, items };
}

export const EVIDENCE_SEED_DRAFTS: readonly EvidenceCreateDraft[] = [
  {
    id: "evidence-high-1",
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "tournament_result",
    eventDate: "2026-07-20",
    status: "verified",
    grade: "A",
    sourceId: "source-high-tw",
    sourceName: "Development Tournament TW",
    region: "TW",
    dimensionScores: sixDimensionScores(92, 88, 84, 90, 91, 86)
  },
  {
    id: "evidence-high-2",
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "tournament_result",
    eventDate: "2026-06-28",
    status: "verified",
    grade: "A",
    sourceId: "source-high-jp",
    sourceName: "Development Tournament JP",
    region: "JP",
    dimensionScores: sixDimensionScores(90, 86, 82, 88, 89, 84)
  },
  {
    id: "evidence-high-3",
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "community_observation",
    eventDate: "2026-06-01",
    status: "verified",
    grade: "B",
    sourceId: "source-high-us",
    sourceName: "Development League US",
    region: "US",
    dimensionScores: sixDimensionScores(86, 83, 80, 85, 87, 82)
  },
  {
    id: "evidence-high-4",
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "tournament_result",
    eventDate: "2026-05-20",
    status: "verified",
    grade: "B",
    sourceId: "source-high-tw",
    sourceName: "Development Tournament TW",
    region: "TW",
    dimensionScores: sixDimensionScores(88, 84, 81, 86, 88, 83)
  },
  {
    id: "evidence-high-5",
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "tournament_result",
    eventDate: "2026-07-10",
    status: "verified",
    grade: "A",
    sourceId: "source-high-jp",
    sourceName: "Development Tournament JP",
    region: "JP",
    dimensionScores: sixDimensionScores(89, 86, 83, 88, 90, 85)
  },
  {
    id: "evidence-high-6",
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "tournament_result",
    eventDate: "2026-06-15",
    status: "verified",
    grade: "A",
    sourceId: "source-high-us",
    sourceName: "Development League US",
    region: "US",
    dimensionScores: sixDimensionScores(87, 84, 81, 86, 88, 83)
  },
  {
    id: "evidence-high-7",
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "archived_development_result",
    eventDate: "2026-04-15",
    status: "verified",
    grade: "B",
    sourceId: "source-high-tw",
    sourceName: "Development Tournament TW",
    region: "TW",
    dimensionScores: sixDimensionScores(88, 84, 82, 87, 89, 84)
  },
  {
    id: "evidence-high-8",
    entityId: DEV_ENTITY_IDS.wizardRod,
    evidenceType: "archived_development_result",
    eventDate: "2026-03-01",
    status: "verified",
    grade: "B",
    sourceId: "source-high-jp",
    sourceName: "Development Tournament JP",
    region: "JP",
    dimensionScores: sixDimensionScores(86, 83, 80, 85, 87, 82)
  },
  {
    id: "evidence-insufficient-1",
    entityId: DEV_ENTITY_IDS.tyrannoBeat,
    evidenceType: "community_observation",
    eventDate: "2026-07-25",
    status: "verified",
    grade: "A",
    sourceId: "source-insufficient",
    sourceName: "Single Development Observation",
    region: "TW",
    dimensionScores: sixDimensionScores(92, 85, 70, null, 88, null)
  },
  {
    id: "evidence-stale-1",
    entityId: DEV_ENTITY_IDS.cobaltDragoon,
    evidenceType: "archived_tournament_result",
    eventDate: "2025-11-12",
    status: "verified",
    grade: "D",
    sourceId: "source-stale-single",
    sourceName: "Archived Development Source",
    region: "TW",
    dimensionScores: sixDimensionScores(55, 40, 20, 35, 52, 25)
  },
  {
    id: "evidence-stale-2",
    entityId: DEV_ENTITY_IDS.cobaltDragoon,
    evidenceType: "archived_tournament_result",
    eventDate: "2025-10-02",
    status: "verified",
    grade: "E",
    sourceId: "source-stale-single",
    sourceName: "Archived Development Source",
    region: "TW",
    dimensionScores: sixDimensionScores(45, 35, 20, 30, 48, 20)
  },
  {
    id: "evidence-rising-prev-1",
    entityId: DEV_ENTITY_IDS.risingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-06-10",
    status: "verified",
    grade: "A",
    sourceId: "source-rising-a",
    sourceName: "Rising Development Source A",
    region: "TW",
    dimensionScores: sixDimensionScores(35, 35, 35, 35, 35, 35)
  },
  {
    id: "evidence-rising-prev-2",
    entityId: DEV_ENTITY_IDS.risingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-06-24",
    status: "verified",
    grade: "A",
    sourceId: "source-rising-b",
    sourceName: "Rising Development Source B",
    region: "JP",
    dimensionScores: sixDimensionScores(40, 40, 40, 40, 40, 40)
  },
  {
    id: "evidence-rising-now-1",
    entityId: DEV_ENTITY_IDS.risingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-07-10",
    status: "verified",
    grade: "A",
    sourceId: "source-rising-a",
    sourceName: "Rising Development Source A",
    region: "TW",
    dimensionScores: sixDimensionScores(75, 75, 75, 75, 75, 75)
  },
  {
    id: "evidence-rising-now-2",
    entityId: DEV_ENTITY_IDS.risingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-07-25",
    status: "verified",
    grade: "A",
    sourceId: "source-rising-c",
    sourceName: "Rising Development Source C",
    region: "US",
    dimensionScores: sixDimensionScores(80, 80, 80, 80, 80, 80)
  },
  {
    id: "evidence-falling-old-1",
    entityId: DEV_ENTITY_IDS.fallingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-03-01",
    status: "verified",
    grade: "A",
    sourceId: "source-falling-a",
    sourceName: "Falling Development Source A",
    region: "TW",
    dimensionScores: sixDimensionScores(90, 90, 90, 90, 90, 90)
  },
  {
    id: "evidence-falling-old-2",
    entityId: DEV_ENTITY_IDS.fallingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-04-15",
    status: "verified",
    grade: "A",
    sourceId: "source-falling-b",
    sourceName: "Falling Development Source B",
    region: "JP",
    dimensionScores: sixDimensionScores(85, 85, 85, 85, 85, 85)
  },
  {
    id: "evidence-falling-prev-1",
    entityId: DEV_ENTITY_IDS.fallingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-06-10",
    status: "verified",
    grade: "A",
    sourceId: "source-falling-a",
    sourceName: "Falling Development Source A",
    region: "TW",
    dimensionScores: sixDimensionScores(82, 82, 82, 82, 82, 82)
  },
  {
    id: "evidence-falling-prev-2",
    entityId: DEV_ENTITY_IDS.fallingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-06-24",
    status: "verified",
    grade: "A",
    sourceId: "source-falling-c",
    sourceName: "Falling Development Source C",
    region: "US",
    dimensionScores: sixDimensionScores(78, 78, 78, 78, 78, 78)
  },
  {
    id: "evidence-falling-now-1",
    entityId: DEV_ENTITY_IDS.fallingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-07-10",
    status: "verified",
    grade: "A",
    sourceId: "source-falling-b",
    sourceName: "Falling Development Source B",
    region: "JP",
    dimensionScores: sixDimensionScores(40, 40, 40, 40, 40, 40)
  },
  {
    id: "evidence-falling-now-2",
    entityId: DEV_ENTITY_IDS.fallingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-07-25",
    status: "verified",
    grade: "A",
    sourceId: "source-falling-c",
    sourceName: "Falling Development Source C",
    region: "US",
    dimensionScores: sixDimensionScores(35, 35, 35, 35, 35, 35)
  },
  {
    id: "evidence-volatile-prev-1",
    entityId: DEV_ENTITY_IDS.volatileDemo,
    evidenceType: "development_observation",
    eventDate: "2026-06-10",
    status: "verified",
    grade: "A",
    sourceId: "source-volatile-a",
    sourceName: "Volatile Development Source A",
    region: "TW",
    dimensionScores: sixDimensionScores(45, 45, 45, 45, 45, 45)
  },
  {
    id: "evidence-volatile-prev-2",
    entityId: DEV_ENTITY_IDS.volatileDemo,
    evidenceType: "development_observation",
    eventDate: "2026-06-24",
    status: "verified",
    grade: "A",
    sourceId: "source-volatile-b",
    sourceName: "Volatile Development Source B",
    region: "JP",
    dimensionScores: sixDimensionScores(50, 50, 50, 50, 50, 50)
  },
  {
    id: "evidence-volatile-now-1",
    entityId: DEV_ENTITY_IDS.volatileDemo,
    evidenceType: "development_observation",
    eventDate: "2026-07-10",
    status: "verified",
    grade: "A",
    sourceId: "source-volatile-a",
    sourceName: "Volatile Development Source A",
    region: "TW",
    dimensionScores: sixDimensionScores(20, 20, 20, 20, 20, 20)
  },
  {
    id: "evidence-volatile-now-2",
    entityId: DEV_ENTITY_IDS.volatileDemo,
    evidenceType: "development_observation",
    eventDate: "2026-07-25",
    status: "verified",
    grade: "A",
    sourceId: "source-volatile-c",
    sourceName: "Volatile Development Source C",
    region: "US",
    dimensionScores: sixDimensionScores(90, 90, 90, 90, 90, 90)
  },
  {
    id: "evidence-emerging-1",
    entityId: DEV_ENTITY_IDS.emergingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-06-20",
    status: "verified",
    grade: "B",
    sourceId: "source-emerging-a",
    sourceName: "Emerging Development Source A",
    region: "TW",
    dimensionScores: sixDimensionScores(55, 55, 55, 55, 55, 55)
  },
  {
    id: "evidence-emerging-2",
    entityId: DEV_ENTITY_IDS.emergingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-06-30",
    status: "verified",
    grade: "B",
    sourceId: "source-emerging-b",
    sourceName: "Emerging Development Source B",
    region: "JP",
    dimensionScores: sixDimensionScores(60, 60, 60, 60, 60, 60)
  },
  {
    id: "evidence-emerging-3",
    entityId: DEV_ENTITY_IDS.emergingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-07-10",
    status: "verified",
    grade: "A",
    sourceId: "source-emerging-a",
    sourceName: "Emerging Development Source A",
    region: "TW",
    dimensionScores: sixDimensionScores(70, 70, 70, 70, 70, 70)
  },
  {
    id: "evidence-emerging-4",
    entityId: DEV_ENTITY_IDS.emergingDemo,
    evidenceType: "development_observation",
    eventDate: "2026-07-25",
    status: "verified",
    grade: "A",
    sourceId: "source-emerging-b",
    sourceName: "Emerging Development Source B",
    region: "JP",
    dimensionScores: sixDimensionScores(75, 75, 75, 75, 75, 75)
  }
];
