import fs from "node:fs";

const databasePath = new URL("../beyblade_x_database_v1_zhTW.json", import.meta.url);
const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, "").toLowerCase();
}

function identities(part = {}) {
  return [
    part.canonicalId,
    part.id,
    part.code,
    part.model,
    part.referenceNameEn,
    part.displayNameZh,
    part.name,
    part.name_zh,
    part.name_en,
    ...(part.aliases || []),
    ...(part.legacyIds || [])
  ].map(normalize).filter(Boolean);
}

function findCanonical(records, compatibilityRecord) {
  const wanted = new Set(identities(compatibilityRecord));
  return (records || []).find(record => identities(record).some(token => wanted.has(token))) || null;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const recommendationFields = [
  "recommendedBits",
  "recommendedRatchets",
  "recommendedBlades",
  "recommendedAssistBlades",
  "recommendedOver",
  "bestWith",
  "preferredBits",
  "preferredRatchets"
];

function synchronizeRecord(compatibilityRecord, canonicalRecord, type) {
  if (!canonicalRecord) return compatibilityRecord;
  const synchronized = { ...compatibilityRecord };
  synchronized.canonicalId = canonicalRecord.canonicalId || canonicalRecord.id || canonicalRecord.code;
  if (type === "blade") {
    synchronized.name_zh = canonicalRecord.displayNameZh || canonicalRecord.name || canonicalRecord.name_zh;
    synchronized.name_en = canonicalRecord.referenceNameEn || canonicalRecord.name_en || canonicalRecord.model;
    if (canonicalRecord.rank !== undefined) synchronized.rank = canonicalRecord.rank;
  }
  recommendationFields.forEach(field => {
    if (canonicalRecord[field] !== undefined) synchronized[field] = clone(canonicalRecord[field]);
  });
  [
    "independentEvaluation",
    "recommendationArraySemantics",
    "contextualRecommendationCandidates",
    "stockDataIsMetadataOnly",
    "visible",
    "enabled",
    "searchable",
    "inventoryEligible",
    "evidenceClass"
  ].forEach(field => {
    if (canonicalRecord[field] !== undefined) synchronized[field] = clone(canonicalRecord[field]);
  });
  synchronized.aliases = [...new Set([
    ...(compatibilityRecord.aliases || []),
    ...(canonicalRecord.aliases || []),
    ...(canonicalRecord.legacyIds || []),
    canonicalRecord.id,
    canonicalRecord.model,
    canonicalRecord.referenceNameEn,
    canonicalRecord.displayNameZh,
    canonicalRecord.name,
    canonicalRecord.name_en
  ].filter(Boolean))];
  return synchronized;
}

function synchronizeCollection(compatibilityRecords, canonicalRecords, type) {
  return (compatibilityRecords || []).map(record => (
    synchronizeRecord(record, findCanonical(canonicalRecords, record), type)
  ));
}

database.__v18.bladesTop30 = synchronizeCollection(database.__v18.bladesTop30, database.blades, "blade");
database.__v18.ratchets = synchronizeCollection(database.__v18.ratchets, database.ratchets, "ratchet");
database.__v18.bits = synchronizeCollection(database.__v18.bits, database.bits, "bit");
database.__v18.cxAssistBlades = synchronizeCollection(
  database.__v18.cxAssistBlades,
  database.cx?.assistBlades,
  "assistBlade"
);
database.__v18.meta.updated = database.metadata.updated;
database.__v18.meta.sourcePackage = database.metadata.updatePackage;
database.__v18.meta.canonicalSource = "top-level collections";
database.__v18.meta.runtimeSource = false;

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  package: database.metadata.updatePackage,
  blades: database.__v18.bladesTop30.length,
  ratchets: database.__v18.ratchets.length,
  bits: database.__v18.bits.length,
  assists: database.__v18.cxAssistBlades.length
}));
