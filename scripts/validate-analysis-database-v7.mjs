import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeCombo as analyzeStandardCombo, getBlade } from "../beyblade_x_analysis_helper_v1_8_ASCII_SAFE.js";
import { analyzeCombo as analyzeLegacyCombo } from "../beyblade_x_analysis_engine_v1_zhTW.js";
import {
  findPartByIdentity,
  inventoryCandidateGate,
  recommendationTargetsForBit,
  sortAndDedupeInventoryParts
} from "../beyblade_x_inventory_recommendation_v1.js";

const database = JSON.parse(fs.readFileSync(new URL("../beyblade_x_database_v1_zhTW.json", import.meta.url), "utf8"));
const analysisSource = fs.readFileSync(new URL("../analysis.js", import.meta.url), "utf8");
const analysisHtml = fs.readFileSync(new URL("../analysis.html", import.meta.url), "utf8");

assert.equal(database.metadata.updatePackage, "2026.08.16-generic-recommender-hard-gates");
assert.match(analysisSource, /beyblade_x_database_v1_zhTW\.json\?v=20260816-hard-gates-v10/);
assert.match(analysisHtml, /analysis_inventory_nullsafe_v2\.js/);
assert.match(analysisHtml, /推薦程式版本：2026-08-16\.10/);
assert.match(analysisHtml, /分析資料庫版本：2026-08-16/);
assert.match(analysisSource, /beyblade_x_inventory_recommendation_nullsafe_v2\.js/);

const tyranno = getBlade(database, "TYRANNO_BEAT");
assert.strictEqual(getBlade(database, "Tyranno Beat"), tyranno);
assert.strictEqual(getBlade(database, "暴龍霸擊"), tyranno);
assert.strictEqual(findPartByIdentity(database.blades, "暴龍霸擊"), tyranno);
assert.equal(tyranno.inventoryEligible, true);
assert.deepEqual(sortAndDedupeInventoryParts([tyranno, tyranno]), [tyranno]);

const bits = sortAndDedupeInventoryParts(
  ["I", "GF", "R", "LR"].map(code => database.bits.find(part => part.code === code))
);
assert.deepEqual(bits.map(part => part.code), ["LR", "R", "GF", "I"]);
assert.deepEqual(recommendationTargetsForBit(bits.at(-1)), []);
const ratchet150 = database.ratchets.find(part => part.code === "1-50");
const ratchet560 = database.ratchets.find(part => part.code === "5-60");
assert.equal(inventoryCandidateGate({ blade: tyranno, ratchet: ratchet150, bit: bits.at(-1), databaseOrPolicy: database }).allowed, false);
assert.equal(inventoryCandidateGate({ blade: tyranno, ratchet: ratchet560, bit: bits.at(-1), databaseOrPolicy: database }).allowed, false);
assert.equal(inventoryCandidateGate({ blade: tyranno, ratchet: ratchet560, bit: bits.at(-1), databaseOrPolicy: database, enabledModes: ["one_hit_specialist"] }).allowed, true);

const standard = analyzeStandardCombo({ bladeIdOrName: "TYRANNO_BEAT", ratchetCode: "9-60", bitCode: "LR" }, database);
assert.ok(standard.role);
const cx = analyzeLegacyCombo({
  cx: { lockChip: "龍王", metalBlade: "Blitz", overBlade: "Break", assistBlade: "K" },
  ratchet: "1-50",
  bit: "LR"
}, database);
assert.ok(cx.resolved.cx);

const compatibility = database.__v18.bladesTop30.find(part => part.canonicalId === "TYRANNO_BEAT");
assert.deepEqual(compatibility.recommendedBits, tyranno.recommendedBits);
assert.deepEqual(compatibility.recommendedRatchets, tyranno.recommendedRatchets);
assert.equal(database.__v18.meta.runtimeSource, false);

const monthlySnapshot = database.metaSnapshots.find(item => item.id === "meta_snapshot_2026-08-16_july_monthly");
assert.ok(monthlySnapshot);
assert.equal(monthlySnapshot.sample.rankedEvents, 81);
assert.equal(monthlySnapshot.sample.participants, 2463);

const wyvernHover = database.blades.find(item => item.id === "飛龍颶風");
assert.equal(wyvernHover.recentMetaEvidence.monthlyWeightedRank, 4);
assert.equal(wyvernHover.recentMetaEvidence.configurationAppearances["9-60 K"], 13);
assert.equal(wyvernHover.recentMetaEvidence.actualMatchWinRate, null);

const dranStrike = database.blades.find(item => item.id === "蒼龍突擊");
assert.equal(dranStrike.recentMetaEvidence.monthlyWeightedRank, 9);
assert.equal(dranStrike.recentMetaEvidence.reportedPlacements, 21);
assert.equal(dranStrike.independentEvaluation.baseTier, "A");

const narrow = database.bits.find(item => item.code === "Nr");
assert.equal(narrow.independentEvaluation.baseTier, "A-");
assert.equal(narrow.monthlyMetaEvidence.eventsRepresented, 14);
assert.equal(narrow.monthlyMetaEvidence.firstPlaceCases, 3);
assert.equal(narrow.monthlyMetaEvidence.actualMatchWinRate, null);
const compatibilityNarrow = database.__v18.bits.find(item => item.code === "Nr");
assert.equal(compatibilityNarrow.independentEvaluation.baseTier, narrow.independentEvaluation.baseTier);
assert.deepEqual(compatibilityNarrow.monthlyMetaEvidence, narrow.monthlyMetaEvidence);

const inventoryPolicy = database.analysisRules.inventoryRecommendationPolicy;
assert.equal(inventoryPolicy.fallbackPolicy.whenNoCompatibleOwnedComponent, "omit_recommendation_card");
assert.equal(inventoryPolicy.roleConsistency.mismatchAction, "reject_candidate");
assert.equal(inventoryPolicy.comboDeduplication.allowSameComboAcrossRoles, false);
assert.equal(inventoryPolicy.specialisedBits.I.autoRecommendationEligible, false);
assert.equal(inventoryPolicy.roleRestrictedRatchets["1-50"].autoFallbackEligible, false);
assert.deepEqual(inventoryPolicy.hardExcludedGenericComponentsByBlade.TYRANNO_BEAT.bits, ["I"]);
assert.deepEqual(inventoryPolicy.hardExcludedGenericComponentsByBlade.TYRANNO_BEAT.ratchets, ["1-50"]);
assert.equal(database.displayRules.recommendations.neverUseFirstArrayItemAsPrimary, true);

console.log(JSON.stringify({
  package: database.metadata.updatePackage,
  tyrannoCandidate: { id: tyranno.id, rank: tyranno.rank, eligible: tyranno.inventoryEligible },
  bitOrder: bits.map(part => `${part.code} (${part.independentEvaluation.baseTier})`),
  iTargets: recommendationTargetsForBit(bits.at(-1)),
  canonicalCompatibilityMatch: true,
  metaWatch: {
    rankedEvents: monthlySnapshot.sample.rankedEvents,
    participants: monthlySnapshot.sample.participants,
    wyvernRank: wyvernHover.recentMetaEvidence.monthlyWeightedRank,
    dranStrikeRank: dranStrike.recentMetaEvidence.monthlyWeightedRank,
    narrowTier: narrow.independentEvaluation.baseTier
  },
  standardAnalysis: Boolean(standard.role),
  cxAnalysis: Boolean(cx.resolved.cx)
}, null, 2));
