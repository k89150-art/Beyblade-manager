import {
  CatalogEntityRegistry,
  EntityTypeRegistry,
  type CanonicalEntityId,
  type CatalogEntity,
  type JsonValue
} from "../domain/index.js";
import type {
  FormalEntityCatalog,
  FormalEntitySummary
} from "./types.js";

const ENTITY_TYPE_VERSION = "1.0.0";
const CATALOG_TIMESTAMP = "2026-07-30T00:00:00.000Z";

const ENTITY_TYPES = [
  ["blade", "上蓋", "upper"],
  ["ratchet", "固鎖", "lower"],
  ["bit", "軸心", "lower"],
  ["lock_chip", "紋章鎖", "cx"],
  ["main_blade", "主要戰刃", "cx"],
  ["metal_blade", "金屬戰刃", "cx"],
  ["over_blade", "超越戰刃", "cx"],
  ["assist_blade", "輔助戰刃", "cx"]
] as const;

interface SourceGroup {
  readonly key: string;
  readonly typeId: string;
  readonly values: readonly unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(
  record: Record<string, unknown>,
  ...keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function stringArray(
  record: Record<string, unknown>,
  ...keys: readonly string[]
): readonly string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
      );
    }
  }
  return [];
}

function jsonValue(value: unknown): JsonValue | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => jsonValue(item));
  }
  if (isRecord(value)) {
    const result: Record<string, JsonValue> = {};
    Object.entries(value).forEach(([key, item]) => {
      result[key] = jsonValue(item);
    });
    return result;
  }
  return null;
}

function hasHan(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function normalizedAlias(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("zh-TW")
    .replace(/[\s_.()（）/\\-]+/gu, "");
}

function canonicalName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9\u3400-\u9fff]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized.length > 0 ? normalized : "unnamed-entity";
}

function hashPart(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function canonicalEntityIdFor(
  entityTypeId: string,
  identity: string
): CanonicalEntityId {
  const source = `${entityTypeId}:${identity.normalize("NFKC")}`;
  const hex = [
    hashPart(source, 2166136261),
    hashPart(source, 2246822507),
    hashPart(source, 3266489909),
    hashPart(source, 668265263)
  ].join("");
  return `ent_${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function sourceGroups(database: unknown): readonly SourceGroup[] {
  if (!isRecord(database)) return [];
  const cx = isRecord(database.cx) ? database.cx : {};
  return [
    { key: "blades", typeId: "blade", values: recordArray(database.blades) },
    {
      key: "ratchets",
      typeId: "ratchet",
      values: recordArray(database.ratchets)
    },
    { key: "bits", typeId: "bit", values: recordArray(database.bits) },
    {
      key: "lockChips",
      typeId: "lock_chip",
      values: recordArray(cx.lockChips)
    },
    {
      key: "mainBlades",
      typeId: "main_blade",
      values: recordArray(cx.mainBlades)
    },
    {
      key: "metalBlades",
      typeId: "metal_blade",
      values: recordArray(cx.metalBlades)
    },
    {
      key: "overBlades",
      typeId: "over_blade",
      values: recordArray(cx.overBlades)
    },
    {
      key: "assistBlades",
      typeId: "assist_blade",
      values: recordArray(cx.assistBlades)
    }
  ];
}

function seriesValues(
  record: Record<string, unknown>,
  typeId: string
): readonly string[] {
  const rawSeries = stringValue(record, "series", "system");
  if (rawSeries !== null) {
    const values = rawSeries
      .split(/[/,|]+/u)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (values.length > 0) return values;
  }
  return typeId.includes("blade") || typeId === "lock_chip"
    ? ["CX"]
    : ["通用"];
}

function relatedParts(record: Record<string, unknown>): readonly string[] {
  return [
    ...stringArray(record, "recommendedRatchets", "bestRatchets"),
    ...stringArray(record, "recommendedBits", "bestBits"),
    ...stringArray(record, "recommendedBlades", "bestWith"),
    ...stringArray(record, "recommendedAssistBlades"),
    ...stringArray(record, "recommendedOver")
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function displayName(record: Record<string, unknown>): string {
  const candidates = [
    stringValue(record, "displayName"),
    stringValue(record, "name"),
    stringValue(record, "id"),
    stringValue(record, "code"),
    stringValue(record, "model")
  ].filter((value): value is string => value !== null);
  return candidates.find(hasHan) ?? candidates[0] ?? "未命名零件";
}

function referenceName(
  record: Record<string, unknown>,
  display: string
): string | undefined {
  const candidates = [
    stringValue(record, "name_en"),
    stringValue(record, "model"),
    stringValue(record, "code"),
    stringValue(record, "id")
  ].filter((value): value is string => value !== null);
  return candidates.find((value) => value !== display && !hasHan(value));
}

function sourceIdentity(
  record: Record<string, unknown>,
  group: SourceGroup
): string {
  return (
    stringValue(record, "code", "model", "id", "name", "displayName") ??
    `${group.key}-${group.values.indexOf(record)}`
  );
}

function createSummary(
  record: Record<string, unknown>,
  group: SourceGroup,
  typeLabel: string
): FormalEntitySummary {
  const identity = sourceIdentity(record, group);
  const display = displayName(record);
  const reference = referenceName(record, display);
  const model =
    stringValue(record, "productCode", "code", "model", "id") ?? identity;
  const aliases = [
    identity,
    display,
    reference,
    model,
    stringValue(record, "name"),
    stringValue(record, "displayName")
  ].filter((value): value is string => typeof value === "string");
  const entity: CatalogEntity = {
    id: canonicalEntityIdFor(group.typeId, identity),
    entityTypeId: group.typeId,
    entityTypeVersion: ENTITY_TYPE_VERSION,
    canonicalName: canonicalName(reference ?? identity),
    displayNameZh: display,
    ...(reference === undefined ? {} : { referenceNameEn: reference }),
    seriesIds: seriesValues(record, group.typeId),
    legacyIds: aliases.filter(
      (value, index, values) => values.indexOf(value) === index
    ),
    attributes: { sourceRecord: jsonValue(record) },
    active: true,
    createdAt: CATALOG_TIMESTAMP,
    updatedAt: CATALOG_TIMESTAMP
  };
  return {
    entity,
    model,
    series: entity.seriesIds,
    entityTypeLabel: typeLabel,
    role: stringValue(record, "role"),
    tier: stringValue(record, "metaTier", "tier"),
    relatedParts: relatedParts(record),
    imageUrl: stringValue(record, "imageUrl", "image")
  };
}

export function createFormalEntityCatalog(
  database: unknown,
  extraEntities: readonly CatalogEntity[] = []
): FormalEntityCatalog {
  const entityTypes = new EntityTypeRegistry();
  ENTITY_TYPES.forEach(([typeId, typeLabel, category]) => {
    entityTypes.register({
      typeId,
      displayName: typeLabel,
      category,
      supportedSeries: [],
      attributesSchema: {
        kind: "object",
        properties: { sourceRecord: { kind: "json" } },
        required: ["sourceRecord"],
        additionalProperties: false,
        refinements: []
      },
      lifecycleStatus: "active",
      version: ENTITY_TYPE_VERSION
    });
  });
  entityTypes.seal();

  const typeLabels = new Map<string, string>(
    ENTITY_TYPES.map(([typeId, label]) => [typeId, label])
  );
  const summaries: FormalEntitySummary[] = [];
  sourceGroups(database).forEach((group) => {
    group.values.forEach((value) => {
      if (!isRecord(value)) return;
      summaries.push(
        createSummary(
          value,
          group,
          typeLabels.get(group.typeId) ?? group.typeId
        )
      );
    });
  });

  extraEntities.forEach((entity) => {
    const compatibleEntity: CatalogEntity = {
      ...entity,
      attributes: { sourceRecord: entity.attributes }
    };
    summaries.push({
      entity: compatibleEntity,
      model: compatibleEntity.legacyIds[0] ?? compatibleEntity.canonicalName,
      series: compatibleEntity.seriesIds,
      entityTypeLabel:
        typeLabels.get(compatibleEntity.entityTypeId) ??
        compatibleEntity.entityTypeId,
      role: "開發測試資料",
      tier: null,
      relatedParts: [],
      imageUrl: null
    });
  });

  const entities = new CatalogEntityRegistry();
  const unique = new Map<CanonicalEntityId, FormalEntitySummary>();
  summaries.forEach((summary) => {
    if (unique.has(summary.entity.id)) return;
    entities.register(summary.entity, entityTypes);
    unique.set(summary.entity.id, summary);
  });
  entities.seal();
  const items = [...unique.values()].sort((left, right) =>
    `${left.entity.displayNameZh}${left.model}`.localeCompare(
      `${right.entity.displayNameZh}${right.model}`,
      "zh-TW"
    )
  );

  const aliasIndex = new Map<string, FormalEntitySummary[]>();
  items.forEach((summary) => {
    const aliases = [
      summary.entity.id,
      summary.entity.displayNameZh,
      summary.entity.referenceNameEn,
      summary.entity.canonicalName,
      summary.model,
      ...summary.entity.legacyIds
    ].filter((value): value is string => typeof value === "string");
    aliases.forEach((alias) => {
      const key = normalizedAlias(alias);
      const matches = aliasIndex.get(key) ?? [];
      if (!matches.includes(summary)) matches.push(summary);
      aliasIndex.set(key, matches);
    });
  });

  return {
    summaries: items,
    entities,
    findById: (entityId) => unique.get(entityId),
    findByAlias: (alias) => aliasIndex.get(normalizedAlias(alias)) ?? [],
    search: (query) => {
      const normalized = normalizedAlias(query);
      if (normalized.length === 0) return items;
      return items.filter((summary) =>
        [
          summary.entity.displayNameZh,
          summary.entity.referenceNameEn ?? "",
          summary.entity.canonicalName,
          summary.model,
          summary.entity.entityTypeId,
          summary.entityTypeLabel,
          ...summary.entity.legacyIds
        ].some((value) => normalizedAlias(value).includes(normalized))
      );
    }
  };
}
