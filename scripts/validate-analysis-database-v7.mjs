import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeCombo as analyzeStandardCombo, getBlade } from "../beyblade_x_analysis_helper_v1_8_ASCII_SAFE.js";
import { analyzeCombo as analyzeLegacyCombo } from "../beyblade_x_analysis_engine_v1_zhTW.js";
import {
  findPartByIdentity,
  recommendationTargetsForBit,
  sortAndDedupeInventoryParts
} from "../beyblade_x_inventory_recommendation_v1.js";

const database = JSON.parse(fs.readFileSync(new URL("../beyblade_x_database_v1_zhTW.json", import.meta.url), "utf8"));
const analysisSource = fs.readFileSync(new URL("../analysis.js", import.meta.url), "utf8");
const analysisHtml = fs.readFileSync(new URL("../analysis.html", import.meta.url), "utf8");

assert.equal(database.metadata.updatePackage, "2026.08.05-inventory-recommendation-order-fix");
assert.match(analysisSource, /beyblade_x_database_v1_zhTW\.json\?v=20260805-inventory-v7/);
assert.match(analysisHtml, /analysis\.js\?v=20260805-inventory-v7/);

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
assert.deepEqual(recommendationTargetsForBit(bits.at(-1)), ["specializedAttack"]);

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

console.log(JSON.stringify({
  package: database.metadata.updatePackage,
  tyrannoCandidate: { id: tyranno.id, rank: tyranno.rank, eligible: tyranno.inventoryEligible },
  bitOrder: bits.map(part => `${part.code} (${part.independentEvaluation.baseTier})`),
  iTargets: recommendationTargetsForBit(bits.at(-1)),
  canonicalCompatibilityMatch: true,
  standardAnalysis: Boolean(standard.role),
  cxAnalysis: Boolean(cx.resolved.cx)
}, null, 2));
