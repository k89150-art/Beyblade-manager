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
    ...(Array.isArray(part.inventoryIdentityKeys) ? part.inventoryIdentityKeys : []),
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

function generalityScore(part) {
  if (!part) return 0;
  const text = [
    independentTierLabel(part),
    part?.role,
    ...(Array.isArray(part?.roleTags) ? part.roleTags : [])
  ].join(" ").toLowerCase();
  if (/specialized|特化|一擊|低身位|奇襲/.test(text)) return 0;
  if (/泛用|平衡|控制|穩定/.test(text)) return 3;
  return 2;
}

export function comparePartsByIndependentRank(left, right) {
  return independentTierScore(right) - independentTierScore(left)
    || confidenceScore(right) - confidenceScore(left)
    || generalityScore(right) - generalityScore(left)
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
  if (isSpecializedPart(bit)) return [];
  const tags = new Set(bit?.roleTags || []);
  const role = String(bit?.role || "");
  const targets = [];
  if (tags.has("攻擊") || /攻擊|衝刺|爆發/.test(role)) targets.push("attack");
  if (tags.has("持久") || /持久|續航|反旋/.test(role)) targets.push("stamina");
  if (tags.has("防禦") || tags.has("anti-attack") || /防守|防禦|反打/.test(role)) targets.push("defense");
  targets.push("balance");
  return [...new Set(targets)];
}

function listContainsPart(values, part) {
  const wanted = new Set(partIdentityCandidates(part));
  return (Array.isArray(values) ? values : [])
    .map(normalizeInventoryIdentity)
    .some(value => wanted.has(value));
}

function routeContainsPart(route, field, part) {
  if (!part) return !(Array.isArray(route?.[field]) && route[field].length);
  return listContainsPart(route?.[field], part);
}

function matchingSpecializedRoute(blade, ratchet, bit, enabledModes) {
  return (Array.isArray(blade?.specializedRoutes) ? blade.specializedRoutes : []).find(route => {
    const modes = Array.isArray(route?.allowedRecommendationModes) ? route.allowedRecommendationModes : [];
    return modes.some(mode => enabledModes.has(mode))
      && routeContainsPart(route, "ratchets", ratchet)
      && routeContainsPart(route, "bits", bit);
  }) || null;
}

function policyFor(databaseOrPolicy) {
  return databaseOrPolicy?.analysisRules?.inventoryRecommendationPolicy
    || databaseOrPolicy?.inventoryRecommendationPolicy
    || databaseOrPolicy
    || {};
}

function restrictedModeForComponent(policy, ratchet, bit) {
  const bitCode = String(bit?.code || bit?.id || "");
  const ratchetCode = String(ratchet?.code || ratchet?.id || "");
  return policy?.specialisedBits?.[bitCode]?.requiresExplicitUserMode
    || policy?.roleRestrictedRatchets?.[ratchetCode]?.requiresExplicitUserMode
    || "";
}

function bladeHardExclusions(policy, blade) {
  const rules = policy?.hardExcludedGenericComponentsByBlade || {};
  return Object.entries(rules).find(([identity]) => (
    partIdentityCandidates(blade).includes(normalizeInventoryIdentity(identity))
  ))?.[1] || null;
}

function genericHardExcludes(blade, ratchet, bit, policy) {
  const bladeRule = bladeHardExclusions(policy, blade);
  const bladeOwnRule = blade?.genericRecommendationHardExclusions || {};
  return listContainsPart(bladeRule?.bits, bit)
    || listContainsPart(bladeRule?.ratchets, ratchet)
    || listContainsPart(bladeOwnRule?.bits, bit)
    || listContainsPart(bladeOwnRule?.ratchets, ratchet);
}

function componentIsBladeCompatible(blade, ratchet, bit) {
  const genericRoutes = Array.isArray(blade?.routes) ? blade.routes : [];
  const exactRoute = genericRoutes.some(route => (
    routeContainsPart(route, "ratchets", ratchet)
    && routeContainsPart(route, "bits", bit)
  ));
  if (exactRoute) return true;

  const bitCandidates = blade?.recommendedBits;
  const ratchetCandidates = blade?.recommendedRatchets;
  const bitCompatible = Array.isArray(bitCandidates) && bitCandidates.length
    ? listContainsPart(bitCandidates, bit)
    : genericRoutes.some(route => routeContainsPart(route, "bits", bit));
  const ratchetCompatible = ratchet
    ? (Array.isArray(ratchetCandidates) && ratchetCandidates.length
      ? listContainsPart(ratchetCandidates, ratchet)
      : genericRoutes.some(route => routeContainsPart(route, "ratchets", ratchet)))
    : true;
  return Boolean(bitCompatible && ratchetCompatible);
}

export function inventoryCandidateGate({
  blade,
  ratchet,
  bit,
  databaseOrPolicy,
  enabledModes = []
} = {}) {
  const policy = policyFor(databaseOrPolicy);
  const modes = new Set(Array.isArray(enabledModes) ? enabledModes : [...enabledModes]);
  if (!isInventoryEligiblePart(bit) || (blade && !isInventoryEligiblePart(blade))) {
    return { allowed: false, reason: "ineligible_part" };
  }
  if (ratchet && !isInventoryEligiblePart(ratchet)) {
    return { allowed: false, reason: "ineligible_ratchet" };
  }

  const restrictedMode = restrictedModeForComponent(policy, ratchet, bit);
  const specializedRoute = matchingSpecializedRoute(blade, ratchet, bit, modes);
  if (restrictedMode) {
    if (!modes.has(restrictedMode)) {
      return { allowed: false, reason: "specialized_mode_not_enabled", requiredMode: restrictedMode };
    }
    if (!specializedRoute) {
      return { allowed: false, reason: "specialized_route_mismatch", requiredMode: restrictedMode };
    }
    return { allowed: true, mode: restrictedMode, route: specializedRoute };
  }

  if (genericHardExcludes(blade, ratchet, bit, policy)) {
    return { allowed: false, reason: "generic_hard_exclusion" };
  }
  if (blade && !componentIsBladeCompatible(blade, ratchet, bit)) {
    return { allowed: false, reason: "role_or_structure_incompatible" };
  }
  return { allowed: true, mode: "generic" };
}

export function recommendationTargetFromRole(role, bit) {
  const roleText = String(role || "");
  if (/攻擊|爆發|衝刺/.test(roleText)) return "attack";
  if (/持久|續航|反旋/.test(roleText)) return "stamina";
  if (/防守|防禦|反打|anti-attack/i.test(roleText)) return "defense";
  if (/平衡|控制/.test(roleText)) return "balance";
  const bitText = `${(bit?.roleTags || []).join(" ")} ${String(bit?.role || "")}`;
  if (/攻擊|爆發|衝刺/.test(bitText)) return "attack";
  if (/持久|續航|反旋/.test(bitText)) return "stamina";
  if (/防守|防禦|反打|anti-attack/i.test(bitText)) return "defense";
  if (/平衡|控制/.test(bitText)) return "balance";
  return "";
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

export function normalizedComboIdentity(suggestion) {
  const parts = suggestion?.parts || {};
  const cxParts = ["lock", "main", "metal", "over", "assist"]
    .map(slot => canonicalPartIdentity(parts[slot]));
  const hasCx = cxParts.some(Boolean);
  const identities = hasCx
    ? [...cxParts, canonicalPartIdentity(parts.ratchet), canonicalPartIdentity(parts.bit)]
    : [canonicalPartIdentity(parts.blade), canonicalPartIdentity(parts.ratchet), canonicalPartIdentity(parts.bit)];
  return identities.map(identity => identity || "-").join("+");
}

export function isRoleConsistentSuggestion(suggestion) {
  return !suggestion?.actualTarget || suggestion.actualTarget === suggestion.target;
}

export function recommendationDisplayLabel(target) {
  return {
    attack: "攻擊推薦",
    one_hit_specialist: "一擊特化",
    low_height_attack_specialist: "低身位攻擊特化",
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
    ? suggestions.filter(item => item && typeof item === "object" && isRoleConsistentSuggestion(item))
    : [];
  const globallyDeduped = [];
  const comboIndexes = new Map();
  [...sourceSuggestions].sort(compareSuggestionsByIndependentParts).forEach(item => {
    const key = normalizedComboIdentity(item);
    if (!key || comboIndexes.has(key)) return;
    comboIndexes.set(key, globallyDeduped.length);
    globallyDeduped.push(item);
  });
  const targets = ["attack", "stamina", "defense", "balance", "one_hit_specialist", "low_height_attack_specialist"];
  return targets.flatMap(target => {
    const seenDiversity = new Set();
    const limit = limits[target] ?? (target.includes("specialist") ? 1 : 2);
    return globallyDeduped
      .filter(item => item.target === target)
      .sort(compareSuggestionsByIndependentParts)
      .filter(item => {
        const diversityKey = suggestionDiversityIdentity(item);
        if (seenDiversity.has(diversityKey)) return false;
        seenDiversity.add(diversityKey);
        return true;
      })
      .slice(0, limit)
      .map(item => ({
        ...item,
        targetLabel: recommendationDisplayLabel(target),
        specialized: target.includes("specialist")
      }));
  });
}
