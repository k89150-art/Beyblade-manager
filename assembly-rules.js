// Phase 7-R: official BEYBLADE X assembly rules (design/phase7/01-beyblade-x-assembly-rules.md).
// Pure module: no DOM, no Firebase, no data writes. Rules are decided by the
// blade (上蓋) name and the bit (軸心) code, not by the internal config model,
// because a config's model is borrowed from the first collection row with the
// same blade (UX-21 is a three-bey set where only 惡魔冥界 has an integrated ratchet).

// Blades with an integrated ratchet: no ratchet, no ratchet-integrated bit.
// Official: https://beyblade.takaratomy.co.jp/beyblade-x/help/noratchet/
export const INTEGRATED_RATCHET_BLADES = Object.freeze(["彈丸獅鷲", "榮耀戰神", "惡魔冥界"]);
// Bits with an integrated ratchet (cannot be split; no separate ratchet).
// Official: CX-07 / CX-11 instruction sheets.
export const INTEGRATED_RATCHET_BITS = Object.freeze(["Tr", "Op"]);
// Blades that accept only simple (O-joint) ratchets and no ratchet-integrated bit.
// Official: https://beyblade.takaratomy.co.jp/beyblade-x/help/ratchet/
export const SIMPLE_RATCHET_ONLY_BLADES = Object.freeze(["時鐘幻象"]);
// Simple (O-joint) ratchets listed by official sources.
export const SIMPLE_RATCHETS = Object.freeze(["3-85", "4-55", "M-85", "9-65", "7-55", "M-65"]);
// Kept from the previous model-based rules so existing configs behave the same.
export const LEGACY_NO_RATCHET_MODELS = Object.freeze(["UX-19", "UX-20"]);
export const LEGACY_SIMPLE_RATCHET_ONLY_MODELS = Object.freeze(["UX-16"]);

const FULL_WIDTH = /[！-～]/g;
const DASHES = /[‐-―−﹘﹣－]/g;

function toHalfWidth(value) {
  return String(value ?? "").replace(FULL_WIDTH, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, " ");
}

function normalizeName(value) {
  return toHalfWidth(value).replace(/\s+/g, "").trim();
}

export function normalizeRatchetCode(value) {
  return toHalfWidth(value).replace(DASHES, "-").replace(/\s+/g, "").toUpperCase();
}

// Leading letters of the bit, upper-cased ("Tr" → "TR", "op" → "OP", "LF" → "LF").
export function bitCode(value) {
  const match = toHalfWidth(value).trim().match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : "";
}

function baseModelCode(model) {
  const match = toHalfWidth(model).toUpperCase().trim().match(/^(UX|BX|CX)\s*-?\s*(\d+)/);
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}` : "";
}

const INTEGRATED_BLADE_SET = new Set(INTEGRATED_RATCHET_BLADES.map(normalizeName));
const INTEGRATED_BIT_SET = new Set(INTEGRATED_RATCHET_BITS.map(code => code.toUpperCase()));
const SIMPLE_ONLY_BLADE_SET = new Set(SIMPLE_RATCHET_ONLY_BLADES.map(normalizeName));
const SIMPLE_RATCHET_SET = new Set(SIMPLE_RATCHETS.map(normalizeRatchetCode));
const LEGACY_NO_RATCHET_SET = new Set(LEGACY_NO_RATCHET_MODELS);
const LEGACY_SIMPLE_ONLY_SET = new Set(LEGACY_SIMPLE_RATCHET_ONLY_MODELS);

export function isIntegratedRatchetBlade(layer, model = "") {
  return INTEGRATED_BLADE_SET.has(normalizeName(layer)) || LEGACY_NO_RATCHET_SET.has(baseModelCode(model));
}

export function isIntegratedRatchetBit(axis) {
  return INTEGRATED_BIT_SET.has(bitCode(axis));
}

export function isSimpleRatchetOnlyBlade(layer, model = "") {
  return SIMPLE_ONLY_BLADE_SET.has(normalizeName(layer)) || LEGACY_SIMPLE_ONLY_SET.has(baseModelCode(model));
}

export function isSimpleRatchet(ratchet) {
  return SIMPLE_RATCHET_SET.has(normalizeRatchetCode(ratchet));
}

function hasRatchet(fix) {
  const text = String(fix ?? "").trim();
  return Boolean(text) && text !== "-";
}

function bladeLabel(layer, model) {
  const name = String(layer ?? "").trim();
  return name && name !== "-" ? name : baseModelCode(model) || "這個上蓋";
}

// Returns whether the ratchet slot is replaced by an integrated part, and the
// official-rule violations of this combination (first one is the most specific).
export function evaluateAssembly({ model = "", layer = "", fix = "", axis = "" } = {}) {
  const integratedBlade = isIntegratedRatchetBlade(layer, model);
  const integratedBit = isIntegratedRatchetBit(axis);
  const simpleOnly = isSimpleRatchetOnlyBlade(layer, model);
  const violations = [];
  const blade = bladeLabel(layer, model);
  const bit = String(axis ?? "").trim();

  if (integratedBlade && integratedBit) {
    violations.push({ id: "integrated-blade-integrated-bit", message: `${blade} 是固鎖一體型上蓋，不能使用 Tr／Op 這類固鎖一體型軸心。` });
  }
  if (integratedBlade && hasRatchet(fix)) {
    violations.push({ id: "integrated-blade-ratchet", message: `${blade} 是固鎖一體型上蓋，無法使用固鎖。` });
  }
  if (integratedBit && !integratedBlade && hasRatchet(fix)) {
    violations.push({ id: "integrated-bit-ratchet", message: `${bit} 軸無法使用固鎖（固鎖一體型軸心）。` });
  }
  if (simpleOnly && (integratedBit || !isSimpleRatchet(fix))) {
    violations.push({ id: "simple-ratchet-only", message: `時鐘幻象只能使用簡易固鎖（${SIMPLE_RATCHETS.join("、")}），也不能使用 Tr／Op。` });
  }

  return { noRatchet: integratedBlade || integratedBit, violations };
}

// Violations present in `after` that `before` did not already have.
export function newAssemblyViolations(before, after) {
  const existing = new Set((before?.violations || []).map(item => item.id));
  return (after?.violations || []).filter(item => !existing.has(item.id));
}
