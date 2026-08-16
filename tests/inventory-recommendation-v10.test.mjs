import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  findPartByIdentity,
  independentTierScore,
  inventoryCandidateGate,
  normalizedComboIdentity,
  partIdentityCandidates,
  recommendationTargetFromRole,
  selectTopInventorySuggestions
} from "../beyblade_x_inventory_recommendation_v1.js";

const database = JSON.parse(fs.readFileSync(new URL("../beyblade_x_database_v1_zhTW.json", import.meta.url), "utf8"));
const tyranno = database.blades.find(part => part.canonicalId === "TYRANNO_BEAT");
const samurai = database.blades.find(part => part.name === "武士魂斬");
const ratchet150 = database.ratchets.find(part => part.code === "1-50");
const ratchet560 = database.ratchets.find(part => part.code === "5-60");
const bits = Object.fromEntries(["I", "LR", "R", "GF"].map(code => [code, database.bits.find(part => part.code === code)]));

function gate(ratchet, bit, enabledModes = []) {
  return inventoryCandidateGate({
    blade: tyranno,
    ratchet,
    bit,
    databaseOrPolicy: database,
    enabledModes
  });
}

function suggestion(ratchet, bit, target = "attack", value = 10, actualTarget = target) {
  return {
    target,
    actualTarget,
    label: `暴龍霸擊 + ${ratchet.code} + ${bit.code}`,
    value,
    parts: { blade: tyranno, ratchet, bit }
  };
}

test("A：只有暴龍霸擊、1-50、I 時一般模式不產生推薦或 fallback", () => {
  assert.deepEqual(gate(ratchet150, bits.I), {
    allowed: false,
    reason: "specialized_mode_not_enabled",
    requiredMode: "one_hit_specialist"
  });
  assert.deepEqual(selectTopInventorySuggestions([]), []);
});

test("B：一般模式排除 1-50 與 I，特化模式只放行資料庫明定路線", () => {
  assert.equal(gate(ratchet560, bits.LR).allowed, true);
  assert.equal(gate(ratchet560, bits.R).allowed, true);
  assert.equal(gate(ratchet150, bits.R).allowed, false);
  assert.equal(gate(ratchet560, bits.I).allowed, false);

  const oneHit = gate(ratchet560, bits.I, ["one_hit_specialist"]);
  assert.equal(oneHit.allowed, true);
  assert.equal(oneHit.mode, "one_hit_specialist");

  const lowHeight = gate(ratchet150, bits.R, ["low_height_attack_specialist"]);
  assert.equal(lowHeight.allowed, true);
  assert.equal(lowHeight.mode, "low_height_attack_specialist");
  assert.equal(gate(ratchet150, bits.I, ["one_hit_specialist", "low_height_attack_specialist"]).allowed, false);
});

test("C：相同 canonical 完整配置全域最多顯示一次", () => {
  const attack = suggestion(ratchet560, bits.LR, "attack", 10, "attack");
  const mismatchDefense = suggestion(ratchet560, bits.LR, "defense", 99, "attack");
  const duplicateAttack = suggestion(ratchet560, bits.LR, "attack", 8, "attack");
  const selected = selectTopInventorySuggestions([mismatchDefense, duplicateAttack, attack]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].target, "attack");
  assert.equal(normalizedComboIdentity(selected[0]), normalizedComboIdentity(attack));
});

test("D：攻擊實際角色不得改標防守、持久或平衡來補卡", () => {
  assert.equal(recommendationTargetFromRole("可控重攻擊型", bits.LR), "attack");
  const selected = selectTopInventorySuggestions([
    suggestion(ratchet560, bits.LR, "attack", 10, "attack"),
    suggestion(ratchet560, bits.LR, "defense", 20, "attack"),
    suggestion(ratchet560, bits.LR, "stamina", 20, "attack"),
    suggestion(ratchet560, bits.LR, "balance", 20, "attack")
  ]);
  assert.deepEqual([...new Set(selected.map(item => item.target))], ["attack"]);
});

test("E：canonical、id、英文、中文、alias 與 inventoryIdentityKeys 都解析為 TYRANNO_BEAT", () => {
  const inputs = ["TYRANNO_BEAT", "Tyranno Beat", "暴龍霸擊", ...tyranno.aliases, ...tyranno.inventoryIdentityKeys];
  inputs.forEach(input => assert.strictEqual(findPartByIdentity(database.blades, input), tyranno));
  assert.ok(partIdentityCandidates(tyranno).includes("tyranno_beat"));
});

test("F：一般模式 I 完全不在候選池，且獨立分數低於 LR、R、GF", () => {
  assert.equal(gate(ratchet560, bits.I).allowed, false);
  assert.ok(independentTierScore(bits.LR) > independentTierScore(bits.I));
  assert.ok(independentTierScore(bits.R) > independentTierScore(bits.I));
  assert.ok(independentTierScore(bits.GF) > independentTierScore(bits.I));
  assert.equal(database.analysisRules.inventoryRecommendationPolicy.specialisedBits.I.autoRecommendationEligible, false);
});

test("G：1-50 不是任何上蓋或角色的 universal fallback", () => {
  assert.equal(database.analysisRules.inventoryRecommendationPolicy.roleRestrictedRatchets["1-50"].autoFallbackEligible, false);
  assert.equal(gate(ratchet150, bits.R).allowed, false);
  const otherBladeGate = inventoryCandidateGate({
    blade: samurai,
    ratchet: ratchet150,
    bit: bits.R,
    databaseOrPolicy: database
  });
  assert.equal(otherBladeGate.allowed, false);
});
