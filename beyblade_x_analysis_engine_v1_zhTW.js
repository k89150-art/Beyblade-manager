// Beyblade X Analysis Engine v1.0-alpha
// 使用方式：import { analyzeCombo } from './beyblade_x_analysis_engine_v1_zhTW.js'
// analyzeCombo({ blade: 'PhoenixWing', ratchet: '3-60', bit: 'R' }, database, rules)

export function analyzeCombo(input, database, rules) {
  const ctx = buildContext(input, database);
  const scores = initScores(rules);
  const messages = [];
  const warnings = [];

  applyBase(ctx.blade, 'blade', scores, rules);
  applyBase(ctx.ratchet, 'ratchet', scores, rules);
  applyBase(ctx.bit, 'bit', scores, rules);

  if (ctx.cx) {
    applyBase(ctx.cx.assistBlade, 'cxAssist', scores, rules);
    applyBase(ctx.cx.metalBlade || ctx.cx.mainBlade, 'cxBlade', scores, rules);
  }

  applyTagScores(ctx, scores, rules);
  applyRatchetRules(ctx, scores, rules, messages, warnings);
  applyBitRules(ctx, scores, rules, messages, warnings);
  applySynergyRules(ctx, scores, rules, messages, warnings);
  applyCxRules(ctx, scores, rules, messages, warnings);

  const primaryRole = classifyPrimary(scores, rules);
  const flags = classifyFlags(scores, rules);
  const recommendations = buildRecommendations(messages, warnings, flags, rules);
  const deckRole = classifyDeckRole(scores, flags, primaryRole);
  const confidence = classifyConfidence(scores, ctx);

  return {
    input,
    resolved: summarizeResolved(ctx),
    summary: buildSummary(primaryRole, flags),
    scores: roundScores(scores),
    primaryRole,
    flags,
    strengths: messages,
    warnings,
    recommendations,
    deckRole,
    confidence
  };
}

function initScores(rules) {
  const out = {};
  for (const key of Object.keys(rules.scoreDimensions)) out[key] = 0;
  return out;
}

function normalize(s) { return (s || '').toString().trim().toLowerCase(); }

function findByAny(list, value, keys) {
  const v = normalize(value);
  if (!v || !Array.isArray(list)) return null;

  const exact = list.find(item => keys.some(k => normalize(item[k]) === v));
  if (exact) return exact;

  if (v.length < 2) return null;
  return list.find(item => keys.some(k => normalize(item[k]).includes(v))) || null;
}

function findRatchet(db, code) {
  return findByAny(db.ratchets, code, ['code','id']);
}
function findBit(db, code) {
  return findByAny(db.bits, code, ['code','name','id']);
}
function findBlade(db, value) {
  return findByAny(db.blades, value, ['id','model','name']);
}
function findCx(list, value, keys=['id','code','name']) {
  return findByAny(list, value, keys);
}

function buildContext(input, db) {
  const ratchet = findRatchet(db, input.ratchet || input.ratchetCode);
  const bit = findBit(db, input.bit || input.bitCode);
  let blade = findBlade(db, input.blade || input.bladeIdOrName);
  let cx = null;

  if (input.cx || input.lockChipName || input.assistBladeCode || input.metalBladeName || input.mainBladeName) {
    const cxInput = input.cx || input;
    const assistBlade = findCx(db.cx.assistBlades, cxInput.assistBladeCode || cxInput.assist || cxInput.assistCode, ['code','id','name']);
    const metalBlade = findCx(db.cx.metalBlades, cxInput.metalBladeName || cxInput.metal, ['name','id']);
    const mainBlade = findCx(db.cx.mainBlades, cxInput.mainBladeName || cxInput.main, ['name','id']);
    const overBlade = findCx(db.cx.overBlades, cxInput.overBladeCode || cxInput.over || cxInput.overCode, ['code','id','name']);
    const lockChip = findCx(db.cx.lockChips, cxInput.lockChipName || cxInput.lockChip, ['name','id']);
    cx = { assistBlade, metalBlade, mainBlade, overBlade, lockChip, mode: cxInput.mode || null };
    blade = blade || metalBlade || mainBlade;
  }

  return { blade, ratchet, bit, cx };
}

function applyBase(part, partType, scores, rules) {
  if (!part) return;
  const tierScore = rules.baseScores.metaTier[part.metaTier || 'unknown'] ?? 0;
  const confScore = rules.baseScores.confidence[part.confidence || 'unknown'] ?? 0;
  scores.metaConfidence += tierScore * 0.5 + confScore * 0.5;
}

function addScore(scores, delta={}) {
  for (const [k,v] of Object.entries(delta)) scores[k] = (scores[k] || 0) + v;
}

function allTags(ctx) {
  const tags = [];
  for (const item of [ctx.blade, ctx.ratchet, ctx.bit, ctx.cx?.assistBlade, ctx.cx?.metalBlade, ctx.cx?.mainBlade, ctx.cx?.overBlade]) {
    if (item?.roleTags) tags.push(...item.roleTags);
  }
  return tags;
}

function applyTagScores(ctx, scores, rules) {
  for (const tag of allTags(ctx)) {
    if (rules.tagScoreMap[tag]) addScore(scores, rules.tagScoreMap[tag]);
  }
}

function matchWhen(ctx, when={}) {
  const bitCode = ctx.bit?.code;
  const ratchetCode = ctx.ratchet?.code;
  const ratchetHeight = ctx.ratchet?.height;
  const bladeTags = ctx.blade?.roleTags || [];
  if (when.bitCodes && !when.bitCodes.includes(bitCode)) return false;
  if (when.bitCodesNot && when.bitCodesNot.includes(bitCode)) return false;
  if (when.height !== undefined && ratchetHeight !== when.height) return false;
  if (when.heightMin !== undefined && !(ratchetHeight >= when.heightMin)) return false;
  if (when.heightMax !== undefined && !(ratchetHeight <= when.heightMax)) return false;
  if (when.ratchetHeightMin !== undefined && !(ratchetHeight >= when.ratchetHeightMin)) return false;
  if (when.ratchetHeightMax !== undefined && !(ratchetHeight <= when.ratchetHeightMax)) return false;
  if (when.codeStartsWith && !(ratchetCode || '').startsWith(when.codeStartsWith)) return false;
  if (when.bladeTagsAny && !when.bladeTagsAny.some(t => bladeTags.includes(t))) return false;
  return true;
}

function applyRuleList(ctx, scores, rulesList, messages, warnings) {
  for (const rule of rulesList || []) {
    let ok = true;
    if (rule.when) ok = matchWhen(ctx, rule.when);
    if (rule.bitCodes) ok = ctx.bit && rule.bitCodes.includes(ctx.bit.code);
    if (rule.assistCodes) ok = ctx.cx?.assistBlade && rule.assistCodes.includes(ctx.cx.assistBlade.code);
    if (rule.overCodes) ok = ctx.cx?.overBlade && rule.overCodes.includes(ctx.cx.overBlade.code);
    if (rule.metalNames) ok = ctx.cx?.metalBlade && rule.metalNames.includes(ctx.cx.metalBlade.name);
    if (!ok) continue;
    addScore(scores, rule.score);
    if (rule.message) messages.push(rule.message);
    if (rule.warning) warnings.push(rule.warning);
  }
}
function applyRatchetRules(ctx, scores, rules, messages, warnings) { applyRuleList(ctx, scores, rules.ratchetHeightRules, messages, warnings); }
function applyBitRules(ctx, scores, rules, messages, warnings) { applyRuleList(ctx, scores, rules.bitRoleRules, messages, warnings); }
function applySynergyRules(ctx, scores, rules, messages, warnings) { applyRuleList(ctx, scores, rules.synergyRules, messages, warnings); }
function applyCxRules(ctx, scores, rules, messages, warnings) { if (ctx.cx) applyRuleList(ctx, scores, rules.cxRules, messages, warnings); }

function classifyPrimary(scores, rules) {
  const keys = ['attack','stamina','defense','balance'];
  const top = keys.sort((a,b)=>scores[b]-scores[a])[0];
  return rules.outcomeClassifier.primaryRoleByHighestScore[top] || top;
}

function classifyFlags(scores, rules) {
  const flags = [];
  for (const f of rules.outcomeClassifier.secondaryFlags || []) {
    if (f.dimension) {
      if (f.min !== undefined && scores[f.dimension] >= f.min) flags.push(f.label);
      if (f.max !== undefined && scores[f.dimension] <= f.max) flags.push(f.label);
    } else if (f.conditions) {
      const c = f.conditions;
      let ok = true;
      if (c.attackMin !== undefined) ok &&= scores.attack >= c.attackMin;
      if (c.controlMax !== undefined) ok &&= scores.control <= c.controlMax;
      if (c.staminaMin !== undefined) ok &&= scores.stamina >= c.staminaMin;
      if (c.defenseMax !== undefined) ok &&= scores.defense <= c.defenseMax;
      if (ok) flags.push(f.label);
    }
  }
  return [...new Set(flags)];
}

function buildRecommendations(messages, warnings, flags, rules) {
  const recs = [];
  for (const r of rules.recommendationRules || []) {
    let ok = false;
    if (r.whenFlags) ok ||= r.whenFlags.some(f => flags.includes(f));
    if (r.whenMessagesContain) ok ||= r.whenMessagesContain.some(s => messages.some(m => m.includes(s)));
    if (r.whenWarningsContain) ok ||= r.whenWarningsContain.some(s => warnings.some(w => w.includes(s)));
    if (ok) recs.push(...r.suggest);
  }
  return [...new Set(recs)];
}

function classifyDeckRole(scores, flags, primaryRole) {
  if (flags.includes('高爆發高風險')) return '奇襲位 / 攻擊搏分位';
  if (primaryRole.includes('持久') && scores.control >= 2) return '保底位 / 持久穩定位';
  if (primaryRole.includes('防禦')) return '反制位 / 抗攻擊位';
  if (primaryRole.includes('攻擊') && scores.control >= 1) return '主動攻擊位';
  if (flags.includes('資料待驗證')) return '測試位';
  return '平衡位 / 依隊伍缺口調整';
}

function classifyConfidence(scores, ctx) {
  if (scores.metaConfidence >= 4) return '高';
  if (scores.metaConfidence >= 2) return '中';
  return '待驗證';
}

function roundScores(scores) {
  return Object.fromEntries(Object.entries(scores).map(([k,v]) => [k, Math.round(v*10)/10]));
}
function summarizeResolved(ctx) {
  return {
    blade: ctx.blade?.name || ctx.blade?.id || null,
    ratchet: ctx.ratchet?.code || null,
    bit: ctx.bit?.code || null,
    cx: ctx.cx ? {
      lockChip: ctx.cx.lockChip?.name || null,
      mainBlade: ctx.cx.mainBlade?.name || null,
      metalBlade: ctx.cx.metalBlade?.name || null,
      overBlade: ctx.cx.overBlade?.code || null,
      assistBlade: ctx.cx.assistBlade?.code || null,
      mode: ctx.cx.mode || null
    } : null
  };
}
function buildSummary(primaryRole, flags) {
  return `${primaryRole}${flags.length ? '，' + flags.join('、') : ''}`;
}
