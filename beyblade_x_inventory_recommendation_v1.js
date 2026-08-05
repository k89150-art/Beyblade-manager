export function normalizeInventoryIdentity(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function partIdentityCandidates(part = {}) {
  if (!part || typeof part !== "object") return [];
  return [
    part.canonicalId,
    part.id,
    part.model,
    part.referenceNameEn,
    part.displayNameZh,
    part.name,
    part.name_en,
    ...(Array.isArray(part.aliases) ? part.aliases : []),
    ...(Array.isArray(part.legacyIds) ? part.legacyIds : [])
  ]
    .map(normalizeInventoryIdentity)
    .filter(Boolean);
}

export function canonicalPartIdentity(part = {}) {
  return partIdentityCandidates(part)[0] || "";
}

export function partsShareIdentity(left, right) {
  const leftTokens = new Set(partIdentityCandidates(left));
  return partIdentityCandidates(right).some(token => leftTokens.has(token));
}

export function findPartByIdentity(parts, input) {
  const wanted = normalizeInventoryIdentity(input);
  if (!wanted) return null;
  return (parts || []).find(part => partIdentityCandidates(part).includes(wanted)) || null;
}

export function isInventoryEligiblePart(part) {
  if (!part) return false;
  return ["visible", "enabled", "searchable", "inventoryEligible"]
    .every(field => part[field] !== false);
}

const TIER_BASE = {
  S: 700,
  A: 600,
  B: 500,
  C: 400,
  D: 300,
  E: 200,
  F: 100
};

export function independentTierLabel(part) {
  return String(
    part?.independentEvaluation?.baseTier
    || part?.metaTier
    || part?.tier
    || ""
  ).trim();
}

export function independentTierScore(part) {
  const label = independentTierLabel(part).toUpperCase();
  const match = label.match(/^([SABCDEF])([+-]?)/);
  if (!match) return 0;
  const modifier = match[2] === "+" ? 20 : match[2] === "-" ? -20 : 0;
  return (TIER_BASE[match[1]] || 0) + modifier;
}

function confidenceScore(part) {
  const value = String(
    part?.independentEvaluation?.confidence
    || part?.confidence
    || part?.metaConfidence
    || ""
  ).toLowerCase();
  return {
    high: 5,
    "medium-high": 4,
    medium: 3,
    "medium-low": 2,
    low: 1
  }[value] || 0;
}

function recencyScore(part) {
  const values = [part?.researchUpdated, part?.updated, part?.releaseDate]
    .map(value => Date.parse(value || ""))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

export function comparePartsByIndependentRank(left, right) {
  return independentTierScore(right) - independentTierScore(left)
    || confidenceScore(right) - confidenceScore(left)
    || recencyScore(right) - recencyScore(left)
    || canonicalPartIdentity(left).localeCompare(canonicalPartIdentity(right));
}

export function sortAndDedupeInventoryParts(parts) {
  const seenTokens = new Set();
  return (parts || [])
    .filter(isInventoryEligiblePart)
    .sort(comparePartsByIndependentRank)
    .filter(part => {
      const tokens = partIdentityCandidates(part);
      if (!tokens.length || tokens.some(token => seenTokens.has(token))) return false;
      tokens.forEach(token => seenTokens.add(token));
      return true;
    });
}

export function isSpecializedPart(part) {
  const text = [
    independentTierLabel(part),
    part?.role,
    ...(Array.isArray(part?.roleTags) ? part.roleTags : [])
  ].join(" ").toLowerCase();
  return /specialized|一擊特化|一擊爆發/.test(text);
}

export function recommendationTargetsForBit(bit) {
  if (isSpecializedPart(bit)) return ["specializedAttack"];
  const tags = new Set(bit?.roleTags || []);
  const role = String(bit?.role || "");
  const targets = [];
  if (tags.has("攻擊") || /攻擊|衝刺|爆發/.test(role)) targets.push("attack");
  if (tags.has("持久") || /持久|續航|反旋/.test(role)) targets.push("stamina");
  if (tags.has("防禦") || tags.has("anti-attack") || /防守|防禦|反打/.test(role)) targets.push("defense");
  targets.push("balance");
  return [...new Set(targets)];
}

function suggestionPartScore(suggestion, slot) {
  return independentTierScore(suggestion?.parts?.[slot]);
}

function suggestionPartConfidence(suggestion, slot) {
  return confidenceScore(suggestion?.parts?.[slot]);
}

export function compareSuggestionsByIndependentParts(left, right) {
  const leftSpecialized = isSpecializedPart(left?.parts?.bit) ? 1 : 0;
  const rightSpecialized = isSpecializedPart(right?.parts?.bit) ? 1 : 0;
  return leftSpecialized - rightSpecialized
    || suggestionPartScore(right, "bit") - suggestionPartScore(left, "bit")
    || suggestionPartScore(right, "blade") - suggestionPartScore(left, "blade")
    || suggestionPartScore(right, "ratchet") - suggestionPartScore(left, "ratchet")
    || suggestionPartConfidence(right, "bit") - suggestionPartConfidence(left, "bit")
    || suggestionPartConfidence(right, "blade") - suggestionPartConfidence(left, "blade")
    || Number(right?.value || 0) - Number(left?.value || 0)
    || String(left?.label || "").localeCompare(String(right?.label || ""));
}

export function suggestionDiversityIdentity(suggestion) {
  const blade = canonicalPartIdentity(suggestion?.parts?.blade);
  const bit = canonicalPartIdentity(suggestion?.parts?.bit);
  const cx = ["lock", "main", "metal", "over", "assist"]
    .map(slot => canonicalPartIdentity(suggestion?.parts?.[slot]))
    .filter(Boolean)
    .join(":");
  return [suggestion?.target, blade || cx, bit].join(":");
}

export function recommendationDisplayLabel(target) {
  return {
    attack: "攻擊推薦",
    specializedAttack: "一擊特化",
    stamina: "持久推薦",
    defense: "防守推薦",
    balance: "平衡推薦"
  }[target] || target;
}

export function recommendationCandidateText(candidate) {
  const part = String(candidate?.part || "").trim();
  const tier = String(candidate?.tier || "").trim();
  return [part, tier ? `Tier ${tier}` : ""].filter(Boolean).join("｜");
}

export function selectTopInventorySuggestions(suggestions, limits = {}) {
  const sourceSuggestions = Array.isArray(suggestions)
    ? suggestions.filter(item => item && typeof item === "object")
    : [];
  const targets = ["attack", "specializedAttack", "stamina", "defense", "balance"];
  return targets.flatMap(target => {
    const seenConfigurations = new Set();
    const seenDiversity = new Set();
    const limit = limits[target] ?? (target === "specializedAttack" ? 1 : 2);
    return sourceSuggestions
      .filter(item => item.target === target)
      .sort(compareSuggestionsByIndependentParts)
      .filter(item => {
        const configurationKey = normalizeInventoryIdentity(item.label);
        if (seenConfigurations.has(configurationKey)) return false;
        seenConfigurations.add(configurationKey);
        const diversityKey = suggestionDiversityIdentity(item);
        if (seenDiversity.has(diversityKey)) return false;
        seenDiversity.add(diversityKey);
        return true;
      })
      .slice(0, limit)
      .map(item => ({
        ...item,
        targetLabel: recommendationDisplayLabel(target),
        specialized: isSpecializedPart(item.parts?.bit)
      }));
  });
}
