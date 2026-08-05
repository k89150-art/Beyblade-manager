import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  findPartByIdentity,
  independentTierLabel,
  partIdentityCandidates,
  recommendationCandidateText,
  recommendationTargetsForBit,
  selectTopInventorySuggestions,
  sortAndDedupeInventoryParts
} from "../beyblade_x_inventory_recommendation_v1.js";

const database = JSON.parse(fs.readFileSync(new URL("../beyblade_x_database_v1_zhTW.json", import.meta.url), "utf8"));
const analysisSource = fs.readFileSync(new URL("../analysis.js", import.meta.url), "utf8");
const helperSource = fs.readFileSync(new URL("../beyblade_x_analysis_helper_v1_8_ASCII_SAFE.js", import.meta.url), "utf8");

const tyranno = database.blades.find(part => part.canonicalId === "TYRANNO_BEAT");
const samurai = database.blades.find(part => part.name === "武士魂斬");
const ratchet760 = database.ratchets.find(part => part.code === "7-60");
const ratchet560 = database.ratchets.find(part => part.code === "5-60");
const bits = Object.fromEntries(["LR", "R", "GF", "I"].map(code => [code, database.bits.find(part => part.code === code)]));

test("canonical、英文與中文名稱解析為同一筆暴龍霸擊", () => {
  assert.ok(tyranno);
  assert.strictEqual(findPartByIdentity(database.blades, "TYRANNO_BEAT"), tyranno);
  assert.strictEqual(findPartByIdentity(database.blades, "Tyranno Beat"), tyranno);
  assert.strictEqual(findPartByIdentity(database.blades, "暴龍霸擊"), tyranno);
  assert.deepEqual(partIdentityCandidates(tyranno).slice(0, 3), ["tyranno_beat", "tyranno_beat", "tyrannobeat"]);
});

test("暴龍霸擊符合庫存候選資格且 canonical 合併後只保留一次", () => {
  assert.equal(tyranno.visible, true);
  assert.equal(tyranno.enabled, true);
  assert.equal(tyranno.searchable, true);
  assert.equal(tyranno.inventoryEligible, true);
  assert.equal(tyranno.rank, 13);
  assert.equal(tyranno.evidenceClass, "established_secondary");
  const legacyAliasRecord = {
    canonicalId: "LEGACY_TYRANNO_RECORD",
    name: "舊版暴龍紀錄",
    aliases: ["Tyranno Beat"],
    independentEvaluation: { baseTier: "B" }
  };
  assert.deepEqual(sortAndDedupeInventoryParts([legacyAliasRecord, tyranno, tyranno]), [tyranno]);
});

test("獨立 Tier 排序固定為 LR > R > GF > I", () => {
  const ordered = sortAndDedupeInventoryParts([bits.I, bits.GF, bits.R, bits.LR]);
  assert.deepEqual(ordered.map(part => part.code), ["LR", "R", "GF", "I"]);
  assert.deepEqual(ordered.map(independentTierLabel), ["S", "S-", "A", "A- specialized"]);
});

test("I 軸只產生一擊特化用途，不會成為泛用攻擊首推", () => {
  assert.deepEqual(recommendationTargetsForBit(bits.I), ["specializedAttack"]);
  assert.ok(recommendationTargetsForBit(bits.LR).includes("attack"));
  const selected = selectTopInventorySuggestions([
    { target: "attack", label: "武士魂斬 + 7-60 + LR", value: 1, parts: { blade: samurai, ratchet: ratchet760, bit: bits.LR } },
    { target: "attack", label: "武士魂斬 + 7-60 + I", value: 999, parts: { blade: samurai, ratchet: ratchet760, bit: bits.I } }
  ]);
  assert.equal(selected[0].parts.bit.code, "LR");
});

test("武士魂斬的兩組 I 軸只保留一個多樣化特化候選", () => {
  const selected = selectTopInventorySuggestions([
    { target: "attack", label: "武士魂斬 + 7-60 + LR", value: 10, parts: { blade: samurai, ratchet: ratchet760, bit: bits.LR } },
    { target: "specializedAttack", label: "武士魂斬 + 7-60 + I", value: 20, parts: { blade: samurai, ratchet: ratchet760, bit: bits.I } },
    { target: "specializedAttack", label: "武士魂斬 + 5-60 + I", value: 19, parts: { blade: samurai, ratchet: ratchet560, bit: bits.I } }
  ]);
  assert.equal(selected.filter(item => item.parts.bit.code === "I").length, 1);
  assert.equal(selected.find(item => item.parts.bit.code === "I")?.targetLabel, "一擊特化");
  assert.equal(selected.find(item => item.target === "attack")?.parts.bit.code, "LR");
});

test("缺少可選 CX 零件時庫存推薦不會讀取 null.canonicalId", () => {
  assert.deepEqual(partIdentityCandidates(null), []);
  assert.doesNotThrow(() => selectTopInventorySuggestions([
    {
      target: "attack",
      label: "暴龍霸擊 + 9-60 + LR",
      value: 10,
      parts: {
        blade: tyranno,
        ratchet: ratchet760,
        bit: bits.LR,
        lock: null,
        main: null,
        metal: null,
        over: null,
        assist: null
      }
    }
  ]));
});

test("推薦候選文字不自行加入順位，編號只交給 ol", () => {
  assert.equal(recommendationCandidateText({ part: "LR", tier: "S" }), "LR｜Tier S");
  assert.doesNotMatch(recommendationCandidateText({ part: "LR", tier: "S" }), /^\d+\./);
  assert.match(analysisSource, /<ol class="status-list">/);
  assert.doesNotMatch(analysisSource, /\$\{index \+ 1\}\. /);
});

test("canonical 與 __v18 相容層的暴龍霸擊結果一致", () => {
  const compatibility = database.__v18.bladesTop30.find(part => part.canonicalId === "TYRANNO_BEAT");
  assert.ok(compatibility);
  assert.equal(compatibility.rank, tyranno.rank);
  assert.equal(compatibility.independentEvaluation.baseTier, tyranno.independentEvaluation.baseTier);
  assert.deepEqual(compatibility.recommendedBits, tyranno.recommendedBits);
  assert.deepEqual(compatibility.recommendedRatchets, tyranno.recommendedRatchets);
});

test("執行期不讀 __v18，且 contextual override 文字與邏輯已移除", () => {
  assert.doesNotMatch(helperSource, /database\.__v18|const v18\s*=/);
  assert.doesNotMatch(analysisSource, /explicit contextual priority|candidate\.priority|independentPriority/);
  assert.doesNotMatch(JSON.stringify(database), /explicit contextual priority/);
});
