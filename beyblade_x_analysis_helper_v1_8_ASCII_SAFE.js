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
    item.updateId,
    ...(Array.isArray(item.aliases) ? item.aliases : [])
  ]);
}
function partDataPriority(item = {}) {
  return (item.updateId ? 1000 : 0)
    + (Array.isArray(item.routes) ? item.routes.length * 20 : 0)
    + (Array.isArray(item.primaryRoles) ? item.primaryRoles.length * 5 : 0)
    + (Array.isArray(item.trueConflictBits) ? item.trueConflictBits.length : 0)
    + (item.displayNameZh ? 2 : 0);
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
    return arr
      .filter(x => allNames(x).some(name => normalize(name) === n))
      .reduce((best, candidate) => (
        !best || partDataPriority(candidate) > partDataPriority(best)
          ? candidate
          : best
      ), null);
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
function bladeZh(blade) { return blade?.name || blade?.name_zh || blade?.displayNameZh || blade?.id || "此上蓋"; }
function bladeEn(blade) { return blade?.name_en || blade?.referenceNameEn || blade?.model || ""; }
function bitCode(bit) { return bit?.code || bit?.displayCode || bit?.id || ""; }
function tagsOf(part) { return [...(part?.tags || []), ...(part?.roleTags || [])]; }
function hasAny(part, tags) { return tags.some(tag => tagsOf(part).includes(tag)); }
function textOf(part) { return [...allNames(part), part?.role, ...(part?.primaryRoles || []), ...(part?.roles || [])].join(" "); }
function isAttackBlade(blade) { return hasAny(blade, ["攻擊", "meta_attack_core", "classic_attack", "heavy_attack", "burst_attack", "cx_one_hit_attack", "low_height_attack"]) || includesAny(textOf(blade), ["攻擊", "爆發", "重攻擊", "壓制"]); }
function isStaminaBlade(blade) { return hasAny(blade, ["持久", "meta_stamina_core", "stamina_baseline", "stable_stamina", "defense_stamina"]) || includesAny(textOf(blade), ["持久", "末段"]); }
function isDefenseBlade(blade) { return hasAny(blade, ["防禦", "anti_attack", "anti-attack", "defense_counter", "cx_defense", "thick_defense"]) || includesAny(textOf(blade), ["防守", "防禦", "anti-attack", "反打", "抗壓"]); }
function isLeftSpinBlade(blade) { return hasAny(blade, ["左迴旋"]) || includesAny(textOf(blade), ["左迴旋", "左旋", "反旋"]); }
function isAttackBit(bit) { return hasAny(bit, ["attack", "攻擊", "one_hit", "high_speed", "low_height_attack"]) || includesAny(textOf(bit), ["攻擊", "爆發", "高速"]); }
function isStaminaBit(bit) { return ["B","O","DB","FB","LO","E","L","Y","Nr"].includes(bitCode(bit)) || hasAny(bit, ["stamina", "持久", "left_spin", "endgame"]); }
function isDefenseBit(bit) { return ["H","WB","BS","UN","W"].includes(bitCode(bit)) || hasAny(bit, ["defense", "防禦", "anti_attack", "anti-attack"]); }
function addScore(scores, key, value) { scores[key] = Math.round(((scores[key] || 0) + value) * 10) / 10; }
function applyPartScores(scores, part, weight = 1) {
  const text = textOf(part);
  if (isAttackBlade(part) || isAttackBit(part)) addScore(scores, "attack", 2.5 * weight);
  if (isStaminaBlade(part) || isStaminaBit(part)) addScore(scores, "stamina", 2.5 * weight);
  if (isDefenseBlade(part) || isDefenseBit(part)) addScore(scores, "defense", 2.2 * weight);
  if (includesAny(text, ["平衡", "控制", "技術", "反打"])) addScore(scores, "balance", 1.8 * weight);
  if (includesAny(text, ["穩定", "控制", "反打", "anti-attack"])) addScore(scores, "control", 1.2 * weight);
  if (String(part?.confidence || part?.metaConfidence || "").includes("high") || String(part?.confidence || "").includes("高")) addScore(scores, "metaConfidence", 1 * weight);
}
function routeFor(blade, bit, ratchet) {
  const code = bitCode(bit);
  const rCode = ratchet?.code || ratchet?.id || "";
  return (blade?.routes || []).find(route => (route.bits || []).map(codeOf).includes(codeOf(code)) && (!(route.ratchets || []).length || (route.ratchets || []).includes(rCode)))
    || (blade?.routes || []).find(route => (route.bits || []).map(codeOf).includes(codeOf(code)));
}
const META_EVIDENCE_SETTINGS = {
  mainstream: { label: "主流實戰路線", scoreDelta: 1.5, priority: 5 },
  established_secondary: { label: "次主流實戰路線", scoreDelta: 1, priority: 4 },
  emerging: { label: "新興可測試路線", scoreDelta: 0, priority: 3 },
  successful_rogue: { label: "冷門成功案例", scoreDelta: 0, priority: 2 },
  experimental: { label: "低樣本實驗案例", scoreDelta: 0, priority: 1 }
};
const CX_META_VALUE_ALIASES = {
  lockChips: {
    emperor: ["帝王"],
    unicorn: ["獨角"]
  },
  overBlades: {
    peak: ["P"]
  }
};
function metaOptions(route, key) {
  return uniq([
    route?.[key],
    ...(route?.[`${key}Options`] || [])
  ]).map(codeOf);
}
function partMatchesMetaValue(database, section, actual, expected) {
  if (!expected) return true;
  if (!actual) return false;
  const expectedPart = findPart(database, section, expected);
  if (expectedPart && expectedPart === actual) return true;
  const expectedNames = new Set(
    (expectedPart ? allNames(expectedPart) : [expected]).map(normalize)
  );
  return allNames(actual).some(name => expectedNames.has(normalize(name)));
}
function cxItems(database, section) {
  return database?.cx?.[section] || [];
}
function cxValueTokens(database, section, value) {
  const tokens = new Set([normalize(value)]);
  const aliases = CX_META_VALUE_ALIASES[section]?.[normalize(value)] || [];
  aliases.forEach(alias => tokens.add(normalize(alias)));

  for (const alias of database.aliases || []) {
    const aliasNames = [
      alias.canonicalZh,
      alias.canonicalCode,
      alias.referenceEn,
      ...(alias.aliases || []),
      ...(alias.deprecatedAliases || [])
    ].filter(Boolean);
    if (aliasNames.some(name => tokens.has(normalize(name)))) {
      aliasNames.forEach(name => tokens.add(normalize(name)));
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const item of cxItems(database, section)) {
      const names = allNames(item).map(normalize);
      if (!names.some(name => tokens.has(name))) continue;
      for (const name of names) {
        if (!tokens.has(name)) {
          tokens.add(name);
          changed = true;
        }
      }
    }
  }
  return tokens;
}
function cxValueMatches(database, section, actual, expected) {
  if (!expected) return true;
  if (!actual) return false;
  const actualTokens = cxValueTokens(database, section, actual);
  const expectedTokens = cxValueTokens(database, section, expected);
  return [...actualTokens].some(token => expectedTokens.has(token));
}
function routeMatchesStandard(database, route, blade, ratchet, bit) {
  if (route.cx) return null;
  if (route.blade) {
    const bladeNames = [route.blade, route.displayNameZh].filter(Boolean);
    if (!bladeNames.some(name => partMatchesMetaValue(database, "blades", blade, name))) {
      return null;
    }
  }

  const ratchetOptions = metaOptions(route, "ratchet");
  const bitOptions = metaOptions(route, "bit");
  const ratchetCode = codeOf(ratchet?.code || ratchet?.id);
  const selectedBit = codeOf(bitCode(bit));
  if (ratchetOptions.length && !ratchetOptions.includes(ratchetCode)) return null;
  if (bitOptions.length && !bitOptions.includes(selectedBit)) return null;

  const specificity = (route.blade ? 4 : 0)
    + (ratchetOptions.length ? 2 : 0)
    + (bitOptions.length ? 2 : 0);
  return { route, specificity };
}
function routeMatchesCx(database, route, input) {
  if (!route.cx) return null;
  const cx = route.cx;
  if (!cxValueMatches(database, "lockChips", input.lockChipName, cx.lockChip)) return null;

  const bladeMatches = cxValueMatches(database, "mainBlades", input.mainBladeName, cx.mainBlade)
    || cxValueMatches(database, "metalBlades", input.metalBladeName, cx.mainBlade);
  if (cx.mainBlade && !bladeMatches) return null;
  if (!cxValueMatches(database, "overBlades", input.overBladeCode, cx.overBlade)) return null;
  if (!cxValueMatches(database, "assistBlades", input.assistBladeCode, cx.assistBlade)) return null;

  let matchedRoute = route;
  let specificity = 8;
  const ratchetCode = codeOf(input.ratchetCode || input.ratchet);
  const selectedBit = codeOf(input.bitCode || input.bit);
  const nested = (route.commonRoutes || []).find(item => (
    (!item.ratchet || codeOf(item.ratchet) === ratchetCode)
    && (!item.bit || codeOf(item.bit) === selectedBit)
  ));
  if (nested) {
    matchedRoute = { ...route, ...nested, parentRouteId: route.id };
    specificity += 4;
  }
  return { route: matchedRoute, specificity };
}
function metaMetricText(route) {
  const metrics = [];
  if (route.reportedTopCuts !== null && route.reportedTopCuts !== undefined
      && Number.isFinite(Number(route.reportedTopCuts))) {
    metrics.push(`${Number(route.reportedTopCuts)} 次前段名次紀錄`);
  }
  if (route.usageRate !== null && route.usageRate !== undefined
      && Number.isFinite(Number(route.usageRate))) {
    metrics.push(`使用率摘要 ${Math.round(Number(route.usageRate) * 1000) / 10}%`);
  }
  if (route.firstPlaceRate !== null && route.firstPlaceRate !== undefined
      && Number.isFinite(Number(route.firstPlaceRate))) {
    metrics.push(`第一名占比 ${Math.round(Number(route.firstPlaceRate) * 1000) / 10}%（非勝率）`);
  }
  return metrics.join("、");
}
export function getMetaEvidence(input, database) {
  const routes = database.metaCommonRoutes || [];
  const hasCxInput = Boolean(
    input?.lockChipName
    || input?.mainBladeName
    || input?.metalBladeName
    || input?.overBladeCode
    || input?.assistBladeCode
  );
  const blade = hasCxInput ? null : getBlade(database, input?.blade || input?.bladeIdOrName || "");
  const ratchet = hasCxInput ? null : getRatchet(database, input?.ratchet || input?.ratchetCode || "");
  const bit = hasCxInput ? null : getBit(database, input?.bit || input?.bitCode || "");

  const matches = routes
    .map(route => (
      hasCxInput
        ? (route.cx
          ? routeMatchesCx(database, route, input)
          : routeMatchesStandard(database, route, null, getRatchet(database, input?.ratchetCode || input?.ratchet || ""), getBit(database, input?.bitCode || input?.bit || "")))
        : routeMatchesStandard(database, route, blade, ratchet, bit)
    ))
    .filter(Boolean)
    .sort((a, b) => (
      b.specificity - a.specificity
      || (META_EVIDENCE_SETTINGS[b.route.evidenceClass]?.priority || 0)
        - (META_EVIDENCE_SETTINGS[a.route.evidenceClass]?.priority || 0)
    ));
  if (!matches.length) return null;

  const { route, specificity } = matches[0];
  const settings = META_EVIDENCE_SETTINGS[route.evidenceClass] || {
    label: "實戰案例",
    scoreDelta: 0,
    priority: 0
  };
  const reportedTopCuts = Number(route.reportedTopCuts);
  const firstPlaceRate = Number(route.firstPlaceRate);
  const sampleWarning = Boolean(
    route.sampleWarning
    || route.evidenceClass === "successful_rogue"
    || route.evidenceClass === "experimental"
    || (Number.isFinite(reportedTopCuts) && reportedTopCuts < 10
      && Number.isFinite(firstPlaceRate) && firstPlaceRate >= 0.3)
  );
  const metricText = metaMetricText(route);

  return {
    id: route.parentRouteId || route.id,
    evidenceClass: route.evidenceClass,
    label: settings.label,
    role: route.role || "",
    specificity,
    scoreDelta: settings.scoreDelta,
    sampleWarning,
    metricText,
    sourceWindow: route.sourceWindow || "",
    notes: route.notes || [],
    disclaimer: "前段名次紀錄，不等於逐場勝率。"
  };
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
  let role = rule?.role || "CX 測試配置";
  let roleLocked = Boolean(rule?.roleLocked);
  if (rule?.scoreDelta) for (const [k,v] of Object.entries(rule.scoreDelta)) addScore(scores, k, v);
  if (rule?.scoreFloor) for (const [k,v] of Object.entries(rule.scoreFloor)) scores[k] = Math.max(scores[k] || 0, v);
  if (rule) advantages.push(`命中 ${rule.id} 優先規則，定位鎖定為${role}。`);
  if (rule?.requiresOrientation) { risks.push("此 CX 組合有模式或方向要求，需確認安裝方向後再實測。"); flags.push("requiresOrientation"); }
  if (!rule) suggestions.push("此 CX 配置尚未命中優先規則，建議先以少量實戰確認路線。");
  if (!advantages.length) advantages.push("此 CX 配置可先依戰刃與軸心方向實測。");
  if (!risks.length) risks.push("目前沒有重大結構性風險，建議先確認發射穩定性。");
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
  let role = "待判斷配置";
  let roleLocked = false;
  if (blade) { applyPartScores(scores, blade, 1.2); notes.push(`${bladeZh(blade)}：${blade.role || ""}`); }
  if (ratchet) { addScore(scores, "burstSafety", 1); if (/60|55|50/.test(ratchet.code || ratchet.id || "")) addScore(scores, "control", 0.7); notes.push(`${ratchet.code || ratchet.id}：${ratchet.role || ""}`); }
  if (bit) { applyPartScores(scores, bit, 1.2); notes.push(`${bitCode(bit)}：${bit.role || ""}`); }
  const route = routeFor(blade, bit, ratchet);
  const metaEvidence = getMetaEvidence(input, database);
  if (route) {
    role = route.role;
    advantages.push(`${bladeZh(blade)} 搭配 ${bitCode(bit)} 命中「${route.role}」路線。`);
    if (!(metaEvidence?.scoreDelta > 0) && ["mainstream", "established_secondary"].includes(route.evidenceClass)) addScore(scores, "metaConfidence", 1.5);
    if (["successful_rogue", "single_sample"].includes(route.evidenceClass)) suggestions.push("此路線屬於特殊成功或單筆樣本，適合測試但不列為主要推薦。 ");
  }
  if (metaEvidence) {
    const evidenceSummary = [
      metaEvidence.label,
      metaEvidence.role,
      metaEvidence.metricText
    ].filter(Boolean).join("：");
    if (metaEvidence.scoreDelta > 0) {
      addScore(scores, "metaConfidence", metaEvidence.scoreDelta);
      advantages.push(`${bladeZh(blade)} 命中${evidenceSummary}。`);
      if (metaEvidence.specificity >= 6 && metaEvidence.role) role = metaEvidence.role;
    } else if (metaEvidence.evidenceClass === "emerging") {
      suggestions.push(`${evidenceSummary}；可列為測試方向，但不列為強推薦。`);
    } else if (metaEvidence.evidenceClass === "successful_rogue") {
      suggestions.push(`${evidenceSummary}；屬冷門成功案例，不列為主要推薦。`);
    } else if (metaEvidence.evidenceClass === "experimental") {
      suggestions.push(`${evidenceSummary}；有案例但樣本少，不增加 Meta 分數。`);
    }
    if (metaEvidence.sampleWarning) {
      risks.push("此實戰路線樣本偏少，名次占比不可直接解讀為穩定勝率。");
    }
    notes.push(metaEvidence.disclaimer, ...metaEvidence.notes);
  }
  const bName = bladeZh(blade);
  const bCode = bitCode(bit);
  if (/時鐘幻象|Clock Mirage/.test(textOf(blade)) && /-55$/.test(ratchet?.code || ratchet?.id || "") && ["FB","B","LO","O"].includes(bCode)) {
    role = "防守持久核心";
    roleLocked = true;
    addScore(scores, "defense", 2); addScore(scores, "stamina", 2); addScore(scores, "burstSafety", 1);
    advantages.push(`${bName} 搭配簡易固鎖與 ${bCode} 可走防守持久核心。`);
  } else if (isAttackBlade(blade) && ["I","GF","A","V","FF"].includes(bCode)) {
    role = route?.role || "一擊爆發攻擊型";
    addScore(scores, "attack", 2.5);
    advantages.push(`${bName} 搭配 ${bCode} 可以提高一擊爆發。`);
    risks.push(`${bCode} 續航與控場風險較高。`);
  } else if (isAttackBlade(blade) && ["R","LR","K"].includes(bCode)) {
    role = route?.role || "可控攻擊型";
  } else if (isStaminaBlade(blade) && ["B","O","DB","FB","LO"].includes(bCode)) {
    role = route?.role || "純持久 / 末段型";
  } else if (isDefenseBlade(blade) && isDefenseBit(bit)) {
    role = route?.role || "防守反打 / anti-attack";
  } else if (isLeftSpinBlade(blade) && bCode === "E") {
    role = route?.role || "反旋末段 / 持久型";
  }
  const avoid = (blade?.avoidConflictForBits || []).map(codeOf).includes(codeOf(bCode));
  const trueConflict = (blade?.trueConflictBits || []).map(codeOf).includes(codeOf(bCode));
  if (trueConflict || (isAttackBlade(blade) && !isStaminaBlade(blade) && isStaminaBit(bit) && !avoid && !route)) {
    flags.push("攻擊路線衝突");
    risks.push("攻擊上蓋搭持久軸心可能降低主動得分，需確認是否刻意做反打或特殊路線。");
  }
  if (/蒼龍爆刃|Cobalt Dragoon/.test(textOf(blade)) && ["B","O","FB"].includes(bCode)) {
    flags.push("攻擊路線衝突");
    risks.push("蒼龍爆刃搭純持久軸心容易偏離主動攻擊路線。");
  }
  if (/騎士圓甲|Knight Mail/.test(textOf(blade)) && ["R","LR","K","J"].includes(bCode)) role = "厚型移動反打 / anti-attack";
  if (/大蛇星叢|Orochi Cluster/.test(textOf(blade)) && bCode === "K") role = "控制攻擊 / 反打";
  if (!advantages.length) advantages.push("此配置可先依主要上蓋與軸心方向實測，再微調固鎖或軸心。 ");
  if (!risks.length) risks.push(database.analysisRules?.emptyResultText?.risks || "目前沒有重大結構性風險，建議先實測發射穩定性。 ");
  if (!suggestions.length) suggestions.push(database.analysisRules?.emptyResultText?.suggestions || "此配置方向明確，可先保留核心零件測試，再依實戰結果微調。 ");
  const mainScore = Object.keys(scores).reduce((a,b)=>scores[a] >= scores[b] ? a : b);
  return { role, roleLocked, scores, mainScore, advantages: uniq(advantages), risks: uniq(risks), suggestions: uniq(suggestions), notes: uniq(notes), flags: uniq(flags), metaEvidence, confidence: scores.metaConfidence >= 2 ? "高" : scores.metaConfidence >= 1 ? "中" : "待驗證" };
}
