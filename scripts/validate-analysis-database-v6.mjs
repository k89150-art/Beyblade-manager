import assert from "node:assert/strict";
import fs from "node:fs";
import {
  analyzeCombo,
  getBlade
} from "../beyblade_x_analysis_helper_v1_8_ASCII_SAFE.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const database = JSON.parse(read("../beyblade_x_database_v1_zhTW.json"));
const analysisSource = read("../analysis.js");
const helperSource = read("../beyblade_x_analysis_helper_v1_8_ASCII_SAFE.js");
const analysisHtml = read("../analysis.html");

assert.equal(database.metadata?.updatePackage, "2026.08.05-schema-layer-sync-fix");
assert.match(analysisSource, /beyblade_x_database_v1_zhTW\.json\?v=20260805-schema-sync-v6/);
assert.match(analysisHtml, /analysis\.js\?v=20260805-schema-sync-v6/);
assert.doesNotMatch(helperSource, /const v18\s*=|database\.__v18/);

const tyrannoMatches = database.blades.filter((part) => {
  const names = [
    part.id,
    part.name,
    part.name_en,
    part.canonicalId,
    ...(part.aliases || []),
    ...(part.legacyIds || [])
  ];
  return names.some((name) => ["暴龍霸擊", "tyranno beat", "tyranno_beat"].includes(String(name || "").toLowerCase()));
});
assert.equal(tyrannoMatches.length, 1, "暴龍霸擊 must occur once in the top-level blade collection");

const tyrannoByZh = getBlade(database, "暴龍霸擊");
const tyrannoByEn = getBlade(database, "Tyranno Beat");
const tyrannoById = getBlade(database, "TYRANNO_BEAT");
assert.ok(tyrannoByZh);
assert.strictEqual(tyrannoByZh, tyrannoByEn);
assert.strictEqual(tyrannoByZh, tyrannoById);
assert.equal(tyrannoByZh.id, "TYRANNO_BEAT");
assert.equal(tyrannoByZh.rank, 13);

const tyrannoProfile = database.featuredBladeProfiles?.find((profile) => profile.bladeId === "TYRANNO_BEAT");
assert.ok(tyrannoProfile?.integratedAssessment?.summary, "Tyranno analysis summary is missing");
assert.ok(tyrannoProfile?.recommendedRoutes?.length, "Tyranno recommendations are missing");
assert.ok(tyrannoProfile?.evidenceSummary?.monthlyRanking, "Tyranno monthly ranking is missing");
assert.ok(tyrannoProfile?.evidenceSummary?.officialEventCase, "Tyranno official event case is missing");
assert.ok(tyrannoProfile?.evidenceSummary?.recentWboCases?.length, "Tyranno WBO cases are missing");

const tyrannoAnalysis = analyzeCombo(
  { bladeIdOrName: "TYRANNO_BEAT", ratchetCode: "9-60", bitCode: "R" },
  database
);
assert.ok(tyrannoAnalysis?.role);
assert.ok(Array.isArray(tyrannoAnalysis?.suggestions));

const blitz = database.cx?.metalBlades?.find((part) => part.id === "Blitz");
assert.ok(blitz, "Blitz metal blade is missing");
assert.deepEqual(blitz.recommendedBits, ["LR", "R", "GF", "I"]);
assert.deepEqual(
  blitz.contextualRecommendationCandidates?.recommendedBits?.map((candidate) => candidate.part),
  ["LR", "R", "GF", "I"]
);

const blitzRecommendationLists = [];
function scanForBlitz(value, path = "database") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForBlitz(item, `${path}[${index}]`));
    return;
  }
  const names = [value.id, value.code, value.name, value.name_en, value.displayNameZh, value.referenceNameEn]
    .map((name) => String(name || "").toLowerCase());
  const isBlitz = names.some((name) => ["blitz", "閃擊", "龍王閃擊"].includes(name));
  if (isBlitz && Array.isArray(value.recommendedBits) && value.recommendedBits.length) {
    blitzRecommendationLists.push({ path, values: value.recommendedBits });
    assert.notEqual(value.recommendedBits[0], "I", `${path}.recommendedBits must not start with I`);
  }
  Object.entries(value).forEach(([key, item]) => scanForBlitz(item, `${path}.${key}`));
}
scanForBlitz(database);
assert.ok(blitzRecommendationLists.length > 0);

const groups = [
  database.blades,
  database.ratchets,
  database.bits,
  database.cx?.lockChips,
  database.cx?.mainBlades,
  database.cx?.metalBlades,
  database.cx?.overBlades,
  database.cx?.assistBlades,
  database.parts
];
const partRecords = groups.flat();
assert.equal(partRecords.length, 242);
partRecords.forEach((part) => {
  assert.equal(part.independentEvaluation?.enabled, true, `${part.id || part.code} missing independent evaluation`);
  assert.equal(part.independentEvaluation?.stockRelationshipBonus, 0, `${part.id || part.code} has stock bonus`);
  assert.equal(part.independentEvaluation?.synergyAppliedToBaseTier, false, `${part.id || part.code} applies synergy to base Tier`);
});

console.log(JSON.stringify({
  package: database.metadata.updatePackage,
  runtimeLayer: "top-level-only",
  tyranno: {
    id: tyrannoById.id,
    rank: tyrannoById.rank,
    topLevelMatches: tyrannoMatches.length,
    aliasesResolved: 3,
    profile: tyrannoProfile.id
  },
  blitz: {
    recommendedBits: blitz.recommendedBits,
    checkedLists: blitzRecommendationLists.length
  },
  independentPartRecords: partRecords.length
}, null, 2));
