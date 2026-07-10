/**
 * Beyblade X analysis helper v1.9
 * 2026-07-11 delta-compatible analysis and display resolver.
 */
function normalize(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, "").toLowerCase();
}
function codeOf(value) {
  return String(value || "").normalize("NFKC").trim().toUpperCase();
}
function uniq(items) {
  return [...new Set((items || []).filter(Boolean))];
}
function includesAny(text, words) {
  return words.some(word => String(text || "").includes(word));
}
function allNames(item = {}) {
  return uniq([
    item.id,
    item.code,
    item.name,
    item.name_zh,
    item.name_en,
    item.displayName,
    item.displayNameZh,
    item.referenceNameEn,
    item.model,
    item.combo,
    item.updateId
  ]);
}
function buildAliasRecords(database = {}) {
  return database.aliases || [];
}
function aliasCanonical(database, type, input) {
  const n = normalize(input);
  for (const a of buildAliasRecords(database)) {
    if (a.type !== type) continue;
    const names = [a.canonicalZh, a.canonicalCode, a.referenceEn, ...(a.aliases || [])];
    if (names.some(name => normalize(name) === n)) return a.canonicalZh || a.canonicalCode || a.referenceEn || input;
  }
  return input;
}
function aliasCanonicalBit(database, input) {
  const n = normalize(input);
  for (const a of buildAliasRecords(database)) {
    if (a.type !== "bit") continue;
    const names = [a.canonicalCode, a.referenceEn, ...(a.aliases || [])];
    if (names.some(name => normalize(name) === n)) return a.canonicalCode || input;
  }
  return input;
}
function arrFor(database, section) {
  const v18 = database.__v18 || database;
  if (section === "blades") return uniq([...(database.blades || []), ...(v18.bladesTop30 || [])]);
  if (section === "bits") return uniq([...(database.bits || []), ...(v18.bits || [])]);
  if (section === "ratchets") return uniq([...(database.ratchets || []), ...(v18.ratchets || [])]);
  return database?.[section] || [];
}
export function findPart(database, section, matcher) {
  const arr = arrFor(database, section);
  if (typeof matcher === "string") {
    const canonical = section === "bits" ? aliasCanonicalBit(database, matcher) : aliasCanonical(database, section === "blades" ? "blade" : section, matcher);
    const n = normalize(canonical);
    return arr.find(x => allNames(x).some(name => normalize(name) === n));
  }
  return arr.find(matcher);
}
export function getBit(database, code) { return findPart(database, "bits", code); }
export function getRatchet(database, code) { return findPart(database, "ratchets", code); }
export function getBlade(database, name) { return findPart(database, "blades", name); }
export function resolvePrimaryName(database, type, input) {
  if (type === "bit") {
    const part = getBit(database, input);
    return part?.code || aliasCanonicalBit(database, input);
  }
  const part = type === "blade" ? getBlade(database, input) : null;
  return part?.name || part?.name_zh || part?.displayNameZh || aliasCanonical(database, type, input);
}
function bladeZh(blade) { return blade?.name || blade?.name_zh || blade?.displayNameZh || blade?.id || "甇支???; }
function bladeEn(blade) { return blade?.name_en || blade?.referenceNameEn || blade?.model || ""; }
function bitCode(bit) { return bit?.code || bit?.displayCode || bit?.id || ""; }
function tagsOf(part) { return [...(part?.tags || []), ...(part?.roleTags || [])]; }
function hasAny(part, tags) { return tags.some(tag => tagsOf(part).includes(tag)); }
function textOf(part) { return [...allNames(part), part?.role, ...(part?.primaryRoles || []), ...(part?.roles || [])].join(" "); }
function isAttackBlade(blade) { return hasAny(blade, ["?餅?", "meta_attack_core", "classic_attack", "heavy_attack", "burst_attack", "cx_one_hit_attack", "low_height_attack"]) || includesAny(textOf(blade), ["?餅?", "?", "???, "憯"]); }
function isStaminaBlade(blade) { return hasAny(blade, ["??", "meta_stamina_core", "stamina_baseline", "stable_stamina", "defense_stamina"]) || includesAny(textOf(blade), ["??", "?急挾"]); }
function isDefenseBlade(blade) { return hasAny(blade, ["?脩戌", "anti_attack", "anti-attack", "defense_counter", "cx_defense", "thick_defense"]) || includesAny(textOf(blade), ["?脣?", "?脩戌", "anti-attack", "??", "??"]); }
function isLeftSpinBlade(blade) { return hasAny(blade, ["撌西艘??]) || includesAny(textOf(blade), ["撌西艘??, "撌行?", "??"]); }
function isAttackBit(bit) { return hasAny(bit, ["attack", "?餅?", "one_hit", "high_speed", "low_height_attack"]) || includesAny(textOf(bit), ["?餅?", "?", "擃?]); }
function isStaminaBit(bit) { return ["B","O","DB","FB","LO","E","L","Y","Nr"].includes(bitCode(bit)) || hasAny(bit, ["stamina", "??", "left_spin", "endgame"]); }
function isDefenseBit(bit) { return ["H","WB","BS","UN","W"].includes(bitCode(bit)) || hasAny(bit, ["defense", "?脩戌", "anti_attack", "anti-attack"]); }
function addScore(scores, key, value) { scores[key] = Math.round(((scores[key] || 0) + value) * 10) / 10; }
function applyPartScores(scores, part, weight = 1) {
  const text = textOf(part);
  if (isAttackBlade(part) || isAttackBit(part)) addScore(scores, "attack", 2.5 * weight);
  if (isStaminaBlade(part) || isStaminaBit(part)) addScore(scores, "stamina", 2.5 * weight);
  if (isDefenseBlade(part) || isDefenseBit(part)) addScore(scores, "defense", 2.2 * weight);
  if (includesAny(text, ["撟唾﹛", "?批", "?銵?, "??"])) addScore(scores, "balance", 1.8 * weight);
  if (includesAny(text, ["蝛拙?", "?批", "??", "anti-attack"])) addScore(scores, "control", 1.2 * weight);
  if (String(part?.confidence || part?.metaConfidence || "").includes("high") || String(part?.confidence || "").includes("擃?)) addScore(scores, "metaConfidence", 1 * weight);
}
function routeFor(blade, bit, ratchet) {
  const code = bitCode(bit);
  const rCode = ratchet?.code || ratchet?.id || "";
  return (blade?.routes || []).find(route => (route.bits || []).map(codeOf).includes(codeOf(code)) && (!(route.ratchets || []).length || (route.ratchets || []).includes(rCode)))
    || (blade?.routes || []).find(route => (route.bits || []).map(codeOf).includes(codeOf(code)));
}
function cxName(input, key) { return input?.[key] || ""; }
function priorityMatchesValue(actual, expected) {
  if (!expected) return true;
  return normalize(actual) === normalize(expected) || normalize(actual).includes(normalize(expected)) || normalize(expected).includes(normalize(actual));
}
function findPriorityRule(database, input) {
  const rules = database.priorityRules || [];
  const actual = {
    mainBlade: cxName(input, "mainBladeName"),
    metalBlade: cxName(input, "metalBladeName"),
    overBlade: cxName(input, "overBladeCode"),
    assistBlade: cxName(input, "assistBladeCode"),
    bit: cxName(input, "bitCode") || cxName(input, "bit")
  };
  return rules.find(rule => {
    const w = rule.when || {};
    if (w.mainBlade && !priorityMatchesValue(actual.mainBlade, w.mainBlade)) return false;
    if (w.metalBlade && !priorityMatchesValue(actual.metalBlade, w.metalBlade)) return false;
    if (w.overBlade && codeOf(actual.overBlade) !== codeOf(w.overBlade)) return false;
    if (w.assistBlade && codeOf(actual.assistBlade) !== codeOf(w.assistBlade)) return false;
    if (w.bitIn && !w.bitIn.map(codeOf).includes(codeOf(actual.bit))) return false;
    return true;
  });
}
function analyzeCx(input, database) {
  const bit = getBit(database, input.bitCode || input.bit || "");
  const ratchet = getRatchet(database, input.ratchetCode || input.ratchet || "");
  const rule = findPriorityRule(database, input);
  const scores = { attack:0, stamina:0, defense:0, balance:0, burstSafety:0, control:0, metaConfidence:1 };
  const advantages = [], risks = [], suggestions = [], notes = [], flags = [];
  if (bit) applyPartScores(scores, bit, 1);
  if (ratchet) addScore(scores, "burstSafety", 1);
  let role = rule?.role || "CX 皜祈岫?蔭";
  let roleLocked = Boolean(rule?.roleLocked);
  if (rule?.scoreDelta) for (const [k,v] of Object.entries(rule.scoreDelta)) addScore(scores, k, v);
  if (rule?.scoreFloor) for (const [k,v] of Object.entries(rule.scoreFloor)) scores[k] = Math.max(scores[k] || 0, v);
  if (rule) advantages.push(`?賭葉 ${rule.id} ?芸?閬?嚗?雿?摰${role}?);
  if (rule?.requiresOrientation) { risks.push("甇?CX 蝯??芋撘??孵?閬?嚗?蝣箄?摰??孵?敺?撖行葫??); flags.push("requiresOrientation"); }
  if (!rule) suggestions.push("甇?CX ?蔭撠?賭葉?芸?閬?嚗遣霅啣?隞亙??祕?啁Ⅱ隤楝蝺?);
  if (!advantages.length) advantages.push("甇?CX ?蔭?臬?靘??頠詨??孵?撖行葫??);
  if (!risks.length) risks.push("?桀?瘝??之蝯??折◢?迎?撱箄降?Ⅱ隤撠帘摰扼?);
  const mainScore = Object.keys(scores).reduce((a,b)=>scores[a] >= scores[b] ? a : b);
  return { role, roleLocked, scores, mainScore, advantages, risks, suggestions, notes, flags, requiresOrientationWarning: flags.includes("requiresOrientation") };
}
export function analyzeCombo(input, database) {
  if (input?.lockChipName || input?.mainBladeName || input?.metalBladeName || input?.overBladeCode || input?.assistBladeCode) return analyzeCx(input, database);
  const blade = getBlade(database, input.blade || input.bladeIdOrName || "");
  const ratchet = getRatchet(database, input.ratchet || input.ratchetCode || "");
  const bit = getBit(database, input.bit || input.bitCode || "");
  const scores = { attack:0, stamina:0, defense:0, balance:0, burstSafety:0, control:0, metaConfidence:0 };
  const advantages = [], risks = [], suggestions = [], notes = [], flags = [];
  let role = "敺?琿?蝵?;
  let roleLocked = false;
  if (blade) { applyPartScores(scores, blade, 1.2); notes.push(`${bladeZh(blade)}嚗?{blade.role || ""}`); }
  if (ratchet) { addScore(scores, "burstSafety", 1); if (/60|55|50/.test(ratchet.code || ratchet.id || "")) addScore(scores, "control", 0.7); notes.push(`${ratchet.code || ratchet.id}嚗?{ratchet.role || ""}`); }
  if (bit) { applyPartScores(scores, bit, 1.2); notes.push(`${bitCode(bit)}嚗?{bit.role || ""}`); }
  const route = routeFor(blade, bit, ratchet);
  if (route) {
    role = route.role;
    advantages.push(`${bladeZh(blade)} ?剝? ${bitCode(bit)} ?賭葉??{route.role}?楝蝺);
    if (["mainstream", "established_secondary"].includes(route.evidenceClass)) addScore(scores, "metaConfidence", 1.5);
    if (["successful_rogue", "single_sample"].includes(route.evidenceClass)) suggestions.push("甇方楝蝺惇?潛畾????桃?璅?嚗?葫閰虫?銝??箔蜓閬?艾?");
  }
  const bName = bladeZh(blade);
  const bCode = bitCode(bit);
  if (/??撟餉情|Clock Mirage/.test(textOf(blade)) && /-55$/.test(ratchet?.code || ratchet?.id || "") && ["FB","B","LO","O"].includes(bCode)) {
    role = "?脣????詨?";
    roleLocked = true;
    addScore(scores, "defense", 2); addScore(scores, "stamina", 2); addScore(scores, "burstSafety", 1);
    advantages.push(`${bName} ?剝?蝪⊥??粹???${bCode} ?航粥?脣????詨??);
  } else if (isAttackBlade(blade) && ["I","GF","A","V","FF"].includes(bCode)) {
    role = route?.role || "銝???潭??";
    addScore(scores, "attack", 2.5);
    advantages.push(`${bName} ?剝? ${bCode} ?臭誑??銝???潦);
    risks.push(`${bCode} 蝥??湧◢?芾?擃);
  } else if (isAttackBlade(blade) && ["R","LR","K"].includes(bCode)) {
    role = route?.role || "?舀?餅???;
  } else if (isStaminaBlade(blade) && ["B","O","DB","FB","LO"].includes(bCode)) {
    role = route?.role || "蝝?銋?/ ?急挾??;
  } else if (isDefenseBlade(blade) && isDefenseBit(bit)) {
    role = route?.role || "?脣??? / anti-attack";
  } else if (isLeftSpinBlade(blade) && bCode === "E") {
    role = route?.role || "???急挾 / ????;
  }
  const avoid = (blade?.avoidConflictForBits || []).map(codeOf).includes(codeOf(bCode));
  const trueConflict = (blade?.trueConflictBits || []).map(codeOf).includes(codeOf(bCode));
  if (trueConflict || (isAttackBlade(blade) && !isStaminaBlade(blade) && isStaminaBit(bit) && !avoid && !route)) {
    flags.push("?餅?頝舐?銵?");
    risks.push("?餅?銝??剜?銋遘敹?賡?雿蜓?????蝣箄??臬?餅??????寞?頝舐???);
  }
  if (/?潮???|Cobalt Dragoon/.test(textOf(blade)) && ["B","O","FB"].includes(bCode)) {
    flags.push("?餅?頝舐?銵?");
    risks.push("?潮????剔???頠詨?摰寞??銝餃??餅?頝舐???);
  }
  if (/擉ㄚ?|Knight Mail/.test(textOf(blade)) && ["R","LR","K","J"].includes(bCode)) role = "??蝘餃??? / anti-attack";
  if (/憭扯??|Orochi Cluster/.test(textOf(blade)) && bCode === "K") role = "?批?餅? / ??";
  if (!advantages.length) advantages.push("甇日?蝵桀??銝餉?銝??遘敹?祕皜穿??凝隤踹??頠詨???");
  if (!risks.length) risks.push(database.analysisRules?.emptyResultText?.risks || "?桀?瘝??之蝯??折◢?迎?撱箄降?祕皜祉撠帘摰扼?");
  if (!suggestions.length) suggestions.push(database.analysisRules?.emptyResultText?.suggestions || "甇日?蝵格??蝣綽??臬?靽??詨??嗡辣皜祈岫嚗?靘祕?啁??凝隤踴?");
  const mainScore = Object.keys(scores).reduce((a,b)=>scores[a] >= scores[b] ? a : b);
  return { role, roleLocked, scores, mainScore, advantages: uniq(advantages), risks: uniq(risks), suggestions: uniq(suggestions), notes: uniq(notes), flags: uniq(flags), confidence: scores.metaConfidence >= 2 ? "擃? : scores.metaConfidence >= 1 ? "銝? : "敺?霅? };
}
