import { analyzeCombo as analyzeLegacyCombo } from "./beyblade_x_analysis_engine_v1_zhTW.js?v=20260630-v11-contextual1";
import { analyzeCombo as analyzeV18Combo } from "./beyblade_x_analysis_helper_v1_8_ASCII_SAFE.js?v=20260701-v18-data1";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

let database = null;
let rules = null;
let indexes = null;
let currentMode = "standard";
let currentUser = null;
let stockSuggestionCache = null;
const STOCK_SUGGEST_CACHE_MS = 60000;

const firebaseConfig = {
  apiKey: "AIzaSyABQadKr-Am-55GgFJmhZ0tkRY-joARNAQ",
  authDomain: "k89150-web-login.firebaseapp.com",
  projectId: "k89150-web-login",
  storageBucket: "k89150-web-login.firebasestorage.app",
  messagingSenderId: "488040360398",
  appId: "1:488040360398:web:759698c16eb67e14f1639f"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

onAuthStateChanged(auth, user => {
  currentUser = user;
  stockSuggestionCache = null;
});

const INTEGRATED_BITS = new Set(["OP", "TR"]);
const NO_RATCHET_MODELS = new Set(["UX-19"]);
const UX16_MODELS = new Set(["UX-16"]);
const BURST_BITS = new Set(["I", "IMPACT", "GF", "A", "V"]);
const CONTROL_ATTACK_BITS = new Set(["R", "LR"]);
const STAMINA_BITS = new Set(["B", "O", "DB", "LO"]);
const DEFENSE_BITS = new Set(["H", "WB", "BS"]);

const SCORE_LABELS = {
  attack: "攻擊",
  stamina: "持久",
  defense: "防禦",
  balance: "平衡",
  burstSafety: "爆裂安全",
  control: "操控",
  metaConfidence: "資料信心"
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeCode(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("資料載入失敗：" + url);
  return response.json();
}

function toV18Input(input) {
  return {
    blade: input.blade || input.bladeIdOrName || "",
    ratchet: input.ratchet || input.ratchetCode || "",
    bit: input.bit || input.bitCode || ""
  };
}

function hasCxAnalysisInput(input) {
  return Boolean(
    input.cx ||
    input.lockChipName ||
    input.mainBladeName ||
    input.metalBladeName ||
    input.overBladeCode ||
    input.assistBladeCode
  );
}

function adaptV18Analysis(raw) {
  const scores = raw?.scores || {};
  const confidenceScore = Number(scores.metaConfidence || 0);

  return {
    version: "v1.8-helper",
    input: raw?.input,
    summary: raw?.role || "待判斷配置",
    primaryRole: raw?.role || "待判斷配置",
    scores,
    strengths: raw?.advantages || [],
    warnings: raw?.risks || [],
    recommendations: raw?.suggestions || [],
    deckRole: raw?.mainScore === "attack"
      ? "主動攻擊位 / 奇襲測試位"
      : raw?.mainScore === "stamina"
        ? "保底持久位 / 後段收尾位"
        : raw?.mainScore === "defense"
          ? "抗攻擊位 / 防守反打位"
          : "平衡測試位 / 依隊伍缺口調整",
    confidence: confidenceScore >= 2 ? "高" : confidenceScore >= 1 ? "中" : "待驗證",
    notes: raw?.notes || []
  };
}

function analyzeCombo(input, db, options = {}) {
  if (!hasCxAnalysisInput(input)) {
    try {
      return adaptV18Analysis(analyzeV18Combo(toV18Input(input), db.__v18 || db));
    } catch (error) {
      console.warn("v1.8 分析失敗，改用相容分析器。", error);
    }
  }

  return analyzeLegacyCombo(input, db, options);
}
async function loadData() {
  if (database && rules) return;

  [database, rules] = await Promise.all([
    loadJson("./beyblade_x_database_v1_zhTW.json?v=20260701-v18-data1"),
    loadJson("./beyblade_x_analysis_rules_v1_zhTW.json?v=20260630-engine2")
  ]);

  indexes = buildIndexes(database);
  fillOptions();
}

function optionLabel(item) {
  const prefix = item.model ? `${item.model} ` : item.code && item.code !== item.id ? `${item.code} ` : "";
  const name = item.name || item.id || item.code || "";
  return `${prefix}${name}`.trim();
}

function addIndex(index, item, keys) {
  keys.forEach(key => {
    const normalized = normalizeText(key);
    if (normalized && !index.has(normalized)) index.set(normalized, item);
  });
}

function buildPartIndex(items = []) {
  const index = new Map();
  items.forEach(item => {
    addIndex(index, item, [
      item.id,
      item.code,
      item.name,
      item.model,
      optionLabel(item),
      item.model && item.name ? `${item.model}${item.name}` : ""
    ].filter(Boolean));
  });
  return index;
}

function buildIndexes(db) {
  return {
    blades: buildPartIndex(db.blades),
    ratchets: buildPartIndex(db.ratchets),
    bits: buildPartIndex(db.bits),
    cxLocks: buildPartIndex(db.cx?.lockChips),
    cxMains: buildPartIndex(db.cx?.mainBlades),
    cxMetals: buildPartIndex(db.cx?.metalBlades),
    cxOvers: buildPartIndex(db.cx?.overBlades),
    cxAssists: buildPartIndex(db.cx?.assistBlades)
  };
}

function fillDatalist(id, items = []) {
  const list = document.getElementById(id);
  if (!list) return;

  list.innerHTML = items
    .map(item => `<option value="${escapeHtml(item.id || item.name || item.code)}" label="${escapeHtml(optionLabel(item))}"></option>`)
    .join("");
}

function fillOptions() {
  fillDatalist("bladeOptions", database.blades);
  fillDatalist("ratchetOptions", [{ id: "-", name: "無固鎖" }, ...(database.ratchets || [])]);
  fillDatalist("bitOptions", database.bits);
  fillDatalist("cxLockOptions", database.cx?.lockChips);
  fillDatalist("cxMainBladeOptions", database.cx?.mainBlades);
  fillDatalist("cxMetalOptions", database.cx?.metalBlades);
  fillDatalist("cxOverOptions", database.cx?.overBlades);
  fillDatalist("cxAssistOptions", database.cx?.assistBlades);
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el && value) el.value = value;
}

function applyUrlPreset() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("mode")) return;

  const mode = params.get("mode") || "standard";
  setMode(mode);

  if (mode === "cx-main") {
    setInputValue("cxMainLockInput", params.get("lock"));
    setInputValue("cxMainBladeInput", params.get("main"));
    setInputValue("cxMainAssistInput", params.get("assist"));
    setInputValue("cxMainRatchetInput", params.get("ratchet"));
    setInputValue("cxMainBitInput", params.get("bit"));
  } else if (mode === "cx-split") {
    setInputValue("cxSplitLockInput", params.get("lock"));
    setInputValue("cxMetalInput", params.get("metal"));
    setInputValue("cxOverInput", params.get("over"));
    setInputValue("cxSplitAssistInput", params.get("assist"));
    setInputValue("cxSplitRatchetInput", params.get("ratchet"));
    setInputValue("cxSplitBitInput", params.get("bit"));
  } else {
    setInputValue("bladeInput", params.get("blade"));
    setInputValue("standardRatchetInput", params.get("ratchet"));
    setInputValue("standardBitInput", params.get("bit"));
  }

  if (params.get("auto") === "1") {
    renderAnalysis();
    document.getElementById("analysisResult")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function findPart(indexName, input) {
  const value = String(input || "").trim();
  if (!value || value === "-" || value === "無固鎖") return null;

  const exact = indexes[indexName].get(normalizeText(value));
  if (exact) return exact;

  const compact = normalizeText(value);
  for (const item of indexes[indexName].values()) {
    const combined = normalizeText(optionLabel(item));
    if (combined && compact.includes(combined)) return item;
    if (item.model && item.name && compact.includes(normalizeText(item.model)) && compact.includes(normalizeText(item.name))) return item;
  }

  return null;
}

function getInput(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".mode-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
  document.getElementById("standardFields").style.display = mode === "standard" ? "grid" : "none";
  document.getElementById("cxMainFields").style.display = mode === "cx-main" ? "grid" : "none";
  document.getElementById("cxSplitFields").style.display = mode === "cx-split" ? "grid" : "none";
  clearResult();
}

function isNoRatchetValue(value) {
  const text = String(value || "").trim();
  return !text || text === "-" || text === "無固鎖";
}

function codeOf(part) {
  return part?.code || part?.id || "";
}

function nameOf(part) {
  return part?.name || part?.id || part?.code || "";
}

function partTitle(part) {
  if (!part) return "";
  const code = part.code && part.code !== part.id ? ` / ${part.code}` : "";
  const model = part.model ? `${part.model} ` : "";
  return `${model}${part.name || part.id}${code}`;
}

function tagsOf(part) {
  return Array.isArray(part?.roleTags) ? part.roleTags : [];
}

function hasAnyTag(part, tags) {
  const wanted = Array.isArray(tags) ? tags : [tags];
  return tagsOf(part).some(tag => wanted.includes(tag));
}

function modelCodeOf(part) {
  const text = String(part?.model || part?.id || "").toUpperCase();
  const match = text.match(/^(UX|BX|CX)\s*-?\s*(\d+)/);
  if (!match) return text.trim();
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
}

function hasIntegratedBit(bit) {
  return INTEGRATED_BITS.has(normalizeCode(bit?.code || bit?.id));
}

function hasNoRatchetBlade(blade) {
  return NO_RATCHET_MODELS.has(modelCodeOf(blade));
}

function isUx16Blade(blade) {
  return UX16_MODELS.has(modelCodeOf(blade));
}

function isSimpleRatchet(ratchet) {
  const code = String(ratchet?.code || ratchet?.id || "").trim();
  const match = code.match(/\d+\s*-\s*(\d+)/);
  return Boolean(match && match[1].endsWith("5"));
}

function ratchetHeight(ratchet) {
  const source = String(ratchet?.height || ratchet?.code || ratchet?.id || "");
  const match = source.match(/-(\d+)/);
  return match ? Number(match[1]) : Number(ratchet?.height || 0);
}

function ratchetGear(ratchet) {
  const source = String(ratchet?.gearCount || ratchet?.code || ratchet?.id || "");
  const match = source.match(/^(\d+)/);
  return match ? Number(match[1]) : Number(ratchet?.gearCount || 0);
}

function bitCode(bit) {
  return normalizeCode(bit?.code || bit?.id || bit?.name);
}

function isAttackBlade(blade) {
  return hasAnyTag(blade, ["攻擊", "奇襲"]);
}

function isHeavyAttackBlade(blade) {
  const text = `${nameOf(blade)} ${partTitle(blade)} ${tagsOf(blade).join(" ")}`;
  return isAttackBlade(blade) && (/暴龍|爆擊|龍|衝擊|重攻擊|一擊|霸擊/.test(text) || hasAnyTag(blade, ["特化", "奇襲"]));
}

function isStaminaBlade(blade) {
  return hasAnyTag(blade, "持久");
}

function isDefenseBlade(blade) {
  return hasAnyTag(blade, ["防禦", "anti-attack", "反打"]);
}

function isLeftSpinBlade(blade) {
  return hasAnyTag(blade, "左迴旋") || /左/.test(String(blade?.role || ""));
}

function isAttackBit(bit) {
  return hasAnyTag(bit, ["攻擊", "奇襲"]);
}

function isStaminaBit(bit) {
  return hasAnyTag(bit, "持久") || STAMINA_BITS.has(bitCode(bit));
}

function isDefenseBit(bit) {
  return hasAnyTag(bit, ["防禦", "anti-attack"]) || DEFENSE_BITS.has(bitCode(bit));
}

function fieldLabel(key) {
  return {
    blade: "上蓋",
    lock: "紋章鎖",
    main: "主要戰刃",
    metal: "金屬戰刃",
    over: "超越戰刃",
    assist: "輔助戰刃",
    ratchet: "固鎖",
    bit: "軸心"
  }[key] || key;
}

function collectStandard() {
  const ratchetInput = getInput("standardRatchetInput");
  return {
    label: "BX / UX 配置",
    inputs: {
      blade: getInput("bladeInput"),
      ratchet: ratchetInput,
      bit: getInput("standardBitInput")
    },
    parts: {
      blade: findPart("blades", getInput("bladeInput")),
      ratchet: findPart("ratchets", ratchetInput),
      bit: findPart("bits", getInput("standardBitInput"))
    },
    required: ["blade", "bit"],
    ratchetInput
  };
}

function collectCxMain() {
  const ratchetInput = getInput("cxMainRatchetInput");
  return {
    label: "CX 主要戰刃",
    cxType: "main",
    inputs: {
      lock: getInput("cxMainLockInput"),
      main: getInput("cxMainBladeInput"),
      assist: getInput("cxMainAssistInput"),
      ratchet: ratchetInput,
      bit: getInput("cxMainBitInput")
    },
    parts: {
      lock: findPart("cxLocks", getInput("cxMainLockInput")),
      main: findPart("cxMains", getInput("cxMainBladeInput")),
      assist: findPart("cxAssists", getInput("cxMainAssistInput")),
      ratchet: findPart("ratchets", ratchetInput),
      bit: findPart("bits", getInput("cxMainBitInput"))
    },
    required: ["lock", "main", "assist", "bit"],
    ratchetInput
  };
}

function collectCxSplit() {
  const ratchetInput = getInput("cxSplitRatchetInput");
  return {
    label: "CX 金屬 + 超越",
    cxType: "split",
    inputs: {
      lock: getInput("cxSplitLockInput"),
      metal: getInput("cxMetalInput"),
      over: getInput("cxOverInput"),
      assist: getInput("cxSplitAssistInput"),
      ratchet: ratchetInput,
      bit: getInput("cxSplitBitInput")
    },
    parts: {
      lock: findPart("cxLocks", getInput("cxSplitLockInput")),
      metal: findPart("cxMetals", getInput("cxMetalInput")),
      over: findPart("cxOvers", getInput("cxOverInput")),
      assist: findPart("cxAssists", getInput("cxSplitAssistInput")),
      ratchet: findPart("ratchets", ratchetInput),
      bit: findPart("bits", getInput("cxSplitBitInput"))
    },
    required: ["lock", "metal", "over", "assist", "bit"],
    ratchetInput
  };
}

function collectConfig() {
  if (currentMode === "cx-main") return collectCxMain();
  if (currentMode === "cx-split") return collectCxSplit();
  return collectStandard();
}

function validateConfig(config) {
  const fatal = [];
  const warnings = [];
  const { parts, inputs } = config;
  const noRatchetSelected = isNoRatchetValue(config.ratchetInput);
  const integratedBit = parts.bit && hasIntegratedBit(parts.bit);
  const noRatchetBlade = parts.blade && hasNoRatchetBlade(parts.blade);

  config.required.forEach(key => {
    if (!inputs[key]) fatal.push(`請選擇${fieldLabel(key)}。`);
    else if (!parts[key]) fatal.push(`${fieldLabel(key)}「${inputs[key]}」不在目前資料庫中。`);
  });

  if (!noRatchetSelected && !parts.ratchet) fatal.push(`固鎖「${config.ratchetInput}」不在目前資料庫中。`);
  if (integratedBit && !noRatchetSelected) fatal.push("Op / Tr 軸無法使用固鎖。");
  if (noRatchetBlade && !noRatchetSelected) fatal.push("UX-19 無法使用固鎖。");
  if (!integratedBit && !noRatchetBlade && noRatchetSelected) fatal.push("一般配置需要選擇固鎖；只有 UX-19 或 Op / Tr 軸可以無固鎖。");
  if (isUx16Blade(parts.blade) && parts.ratchet && !isSimpleRatchet(parts.ratchet)) fatal.push("時鐘幻象只能使用簡易固鎖。");

  if (config.cxType === "main") {
    warnings.push("CX 主要戰刃模式會以紋章鎖、主要戰刃、輔助戰刃共同判斷上蓋方向。");
    const recommended = parts.main?.recommendedAssistBlades || [];
    if (recommended.length && parts.assist && !recommended.includes(codeOf(parts.assist))) {
      warnings.push(`${nameOf(parts.assist)} 不是 ${nameOf(parts.main)} 資料中優先建議的輔助戰刃，可測試但信心會較保守。`);
    }
  }

  if (config.cxType === "split") {
    warnings.push("CX 金屬 + 超越模式會以紋章鎖、金屬戰刃、超越戰刃、輔助戰刃共同判斷上蓋方向。");
  }

  return { fatal, warnings };
}

function toEngineInput(config) {
  const { parts } = config;
  const ratchetCode = codeOf(parts.ratchet);

  if (config.cxType === "main") {
    return {
      lockChipName: nameOf(parts.lock),
      mainBladeName: nameOf(parts.main),
      assistBladeCode: codeOf(parts.assist),
      ratchetCode,
      bitCode: codeOf(parts.bit)
    };
  }

  if (config.cxType === "split") {
    return {
      lockChipName: nameOf(parts.lock),
      metalBladeName: nameOf(parts.metal),
      overBladeCode: codeOf(parts.over),
      assistBladeCode: codeOf(parts.assist),
      ratchetCode,
      bitCode: codeOf(parts.bit)
    };
  }

  return {
    bladeIdOrName: nameOf(parts.blade),
    ratchetCode,
    bitCode: codeOf(parts.bit)
  };
}

function makeEmptyProfile() {
  return { attack: 0, stamina: 0, defense: 0, balance: 0, control: 0, risk: 0 };
}

function addWeighted(target, profile, weight) {
  Object.keys(target).forEach(key => {
    target[key] += (profile[key] || 0) * weight;
  });
}

function partProfile(part) {
  const profile = makeEmptyProfile();
  const tags = tagsOf(part);

  if (tags.includes("攻擊")) profile.attack += 2;
  if (tags.includes("奇襲")) { profile.attack += 1.5; profile.risk += 1; }
  if (tags.includes("持久")) profile.stamina += 2;
  if (tags.includes("防禦")) profile.defense += 2;
  if (tags.includes("anti-attack")) { profile.defense += 1.5; profile.balance += 0.5; }
  if (tags.includes("反打")) { profile.defense += 0.8; profile.attack += 0.6; }
  if (tags.includes("平衡")) profile.balance += 2;
  if (tags.includes("低身位")) profile.control += 0.5;
  if (tags.includes("高身位")) profile.risk += 0.8;
  if (tags.includes("特化")) profile.risk += 0.7;

  const code = bitCode(part);
  if (BURST_BITS.has(code)) { profile.attack += 1.5; profile.control -= 0.8; profile.risk += 1; }
  if (CONTROL_ATTACK_BITS.has(code)) { profile.attack += 1; profile.control += 0.5; }
  if (STAMINA_BITS.has(code)) profile.stamina += 1.2;
  if (DEFENSE_BITS.has(code)) { profile.defense += 1.2; profile.control += 0.4; }

  return profile;
}

function weightedProfile(config) {
  const profile = makeEmptyProfile();
  const { parts } = config;
  const bladeParts = config.cxType
    ? [parts.main, parts.metal, parts.over, parts.assist].filter(Boolean)
    : [parts.blade].filter(Boolean);
  const bladeWeight = bladeParts.length ? 0.45 / bladeParts.length : 0;

  bladeParts.forEach(part => addWeighted(profile, partProfile(part), bladeWeight));
  addWeighted(profile, partProfile(parts.bit), 0.35);
  addWeighted(profile, ratchetProfile(parts.ratchet), 0.20);
  return profile;
}

function ratchetProfile(ratchet) {
  const profile = makeEmptyProfile();
  const height = ratchetHeight(ratchet);
  const gear = ratchetGear(ratchet);

  if (height === 60) { profile.control += 1; profile.balance += 0.5; }
  if (height > 60) { profile.defense += 0.3; profile.risk += 0.7; }
  if (height <= 55 && height > 0) { profile.attack += 0.6; profile.control += 0.3; }
  if (gear === 1) { profile.attack += 0.8; profile.risk += 0.4; }
  if ([5, 7, 9].includes(gear)) { profile.defense += 0.5; profile.control += 0.4; }
  if (gear === 9) profile.stamina += 0.4;

  return profile;
}

function primaryBladePart(config) {
  return config.parts.blade || config.parts.main || config.parts.metal || config.parts.over || config.parts.assist;
}

function classifyBuild(config, analysis) {
  const blade = primaryBladePart(config);
  const bit = config.parts.bit;
  const ratchet = config.parts.ratchet;
  const profile = weightedProfile(config);
  const code = bitCode(bit);

  if (isHeavyAttackBlade(blade) && BURST_BITS.has(code)) return "低身位重攻擊 / 一擊爆發型";
  if (isHeavyAttackBlade(blade) && CONTROL_ATTACK_BITS.has(code)) return "可控重攻擊型";
  if (isAttackBlade(blade) && isAttackBit(bit)) return "攻擊壓制型";
  if (isAttackBlade(blade) && isStaminaBit(bit)) return "混合測試型 / 攻擊路線衝突";
  if (isStaminaBlade(blade) && isAttackBit(bit)) return "反打 / 特化攻擊型";
  if (isStaminaBlade(blade) && STAMINA_BITS.has(code)) return "持久穩定型";
  if (isLeftSpinBlade(blade) && code === "E") return "反旋末段 / 持久型";
  if (isDefenseBlade(blade) && DEFENSE_BITS.has(code)) return "anti-attack / 防守反打型";

  const sorted = [
    ["攻擊型", profile.attack],
    ["持久型", profile.stamina],
    ["防禦型", profile.defense],
    ["平衡型", profile.balance]
  ].sort((a, b) => b[1] - a[1]);

  if (sorted[0][1] - sorted[1][1] < 0.35) return "平衡測試型";
  if (ratchetHeight(ratchet) <= 55 && sorted[0][0] === "攻擊型") return "低身位攻擊型";
  return sorted[0][0] || analysis.primaryRole || "測試型";
}

function buildSummary(config, analysis, role) {
  const blade = primaryBladePart(config);
  const bit = config.parts.bit;
  const ratchet = config.parts.ratchet;
  const parts = [partTitle(blade), partTitle(ratchet), partTitle(bit)].filter(Boolean).join(" / ");
  return `${role}。${parts} 的組合方向以${role.replace(/\s*\/.*$/, "")}為主，建議用實戰確認發射穩定性與對位表現。`;
}

function buildStrengths(config, analysis) {
  const strengths = [];
  const blade = primaryBladePart(config);
  const bit = config.parts.bit;
  const ratchet = config.parts.ratchet;
  const bName = partTitle(blade) || "此上蓋";
  const bitName = partTitle(bit) || "此軸心";
  const rName = partTitle(ratchet) || "此固鎖";
  const code = bitCode(bit);
  const height = ratchetHeight(ratchet);
  const gear = ratchetGear(ratchet);

  if (isAttackBlade(blade) && isAttackBit(bit)) strengths.push(`${bName} 本身偏攻擊，搭配 ${bitName} 能提高主動接觸與得分壓力。`);
  if (isHeavyAttackBlade(blade) && BURST_BITS.has(code)) strengths.push(`${bName} 偏重攻擊，搭配 ${bitName} 可以提高瞬間衝擊與一擊爆發。`);
  if (isHeavyAttackBlade(blade) && CONTROL_ATTACK_BITS.has(code)) strengths.push(`${bitName} 能讓 ${bName} 的攻擊路線比較可控，不會只押一波爆發。`);
  if (isStaminaBlade(blade) && STAMINA_BITS.has(code)) strengths.push(`${bName} 的持久定位搭配 ${bitName}，方向清楚，適合拖長局。`);
  if (isLeftSpinBlade(blade) && code === "E") strengths.push(`${bName} 搭配 ${bitName} 可強化反旋末段與中後段維持。`);
  if (isDefenseBlade(blade) && DEFENSE_BITS.has(code)) strengths.push(`${bName} 搭配 ${bitName} 可往 anti-attack 或防守反打方向發展。`);
  if (height === 60) strengths.push(`${rName} 的 60 高度能讓 ${bName} 保持較穩定重心，並降低被打固鎖風險。`);
  if (height <= 55 && height > 0) strengths.push(`${rName} 的低高度能讓 ${bName} 更容易集中打點。`);
  if ([5, 7, 9].includes(gear)) strengths.push(`${gear} 系固鎖比 1 系更穩，能替 ${bitName} 補一點穩定性。`);
  if (gear === 9) strengths.push(`${rName} 的 9 系結構通常有較好的爆裂安全與持久穩定性。`);

  return uniqueItems(strengths.length ? strengths : (analysis.strengths || []));
}

function buildWarnings(config, analysis, baseWarnings) {
  const warnings = [...baseWarnings];
  const blade = primaryBladePart(config);
  const bit = config.parts.bit;
  const ratchet = config.parts.ratchet;
  const bName = partTitle(blade) || "此上蓋";
  const bitName = partTitle(bit) || "此軸心";
  const rName = partTitle(ratchet) || "此固鎖";
  const code = bitCode(bit);
  const height = ratchetHeight(ratchet);

  if (isAttackBlade(blade) && isStaminaBit(bit)) warnings.push(`${bName} 搭持久軸心 ${bitName} 可能降低主動得分，路線會偏混合或衝突。`);
  if (isStaminaBlade(blade) && isAttackBit(bit)) warnings.push(`${bName} 搭攻擊軸心 ${bitName} 屬於反打或特化玩法，不能只用純攻擊角度評估。`);
  if (isHeavyAttackBlade(blade) && BURST_BITS.has(code)) warnings.push(`${bitName} 屬於一擊型軸心，續航與控場風險偏高。`);
  if (isAttackBlade(blade) && !isStaminaBit(bit)) warnings.push(`若第一波沒有讓 ${bName} 打出有效接觸，後段可能會因 ${bitName} 的續航不足而失速。`);
  if (height >= 70) warnings.push(`${rName} 高度偏高，可能提高重心與被攻擊打到固鎖的機率。`);
  if (height === 60 && isHeavyAttackBlade(blade) && BURST_BITS.has(code)) warnings.push(`${rName} 雖然穩，但不如 1-60 / 3-60 這類配置更直接強化攻擊對位。`);
  if ((analysis.scores?.metaConfidence ?? 0) <= 0) warnings.push("資料信心偏低，建議先少量實戰測試再決定是否放入主力牌組。");

  if (!warnings.length) {
    warnings.push("目前沒有重大結構性風險，建議先實測發射穩定性與對攻擊型的抗壓能力。");
  }

  return uniqueItems(warnings);
}

function buildRecommendations(config, analysis) {
  const recommendations = [...(analysis.recommendations || [])];
  const blade = primaryBladePart(config);
  const bit = config.parts.bit;
  const ratchet = config.parts.ratchet;
  const code = bitCode(bit);
  const height = ratchetHeight(ratchet);

  if (isHeavyAttackBlade(blade) && BURST_BITS.has(code)) {
    recommendations.push("若想提高穩定攻擊，可改 R 或 LR。");
    recommendations.push("若想提高爆發，可保留 Impact / I 或測 GF、A、V 類軸心。");
    recommendations.push("若想讓攻擊打點更集中，可測 1-60 或 3-60。");
  } else if (isAttackBlade(blade)) {
    recommendations.push("若想提高攻擊穩定度，可優先測 R、LR、P 或 T 類軸心。");
    recommendations.push("若想提高爆發，可測 1-60、3-60 或更低身位固鎖。");
  }

  if (isStaminaBlade(blade)) recommendations.push("若想提高持久，可測 B、O、DB、LO 類軸心與 9-60 / 3-60 固鎖。 ");
  if (isDefenseBlade(blade)) recommendations.push("若想提高防守反打，可測 H、WB、BS 類軸心與 9 系或 7 系固鎖。 ");
  if (height >= 70) recommendations.push("目前固鎖偏高，可另測 60 高度版本，比較抗打與尾段穩定性。");
  if (hasIntegratedBit(bit)) recommendations.push("Op / Tr 屬於一體式軸心，調整重點應放在上蓋或 CX 戰刃相性。 ");

  if (!recommendations.length) {
    recommendations.push("此配置方向明確，可先保留核心零件測試，再依實戰結果微調固鎖或軸心。 ");
  }

  return uniqueItems(recommendations.map(item => item.trim()));
}

function buildDeckRole(config, role, analysis) {
  const blade = primaryBladePart(config);
  const bit = config.parts.bit;
  const code = bitCode(bit);

  if (isHeavyAttackBlade(blade) && BURST_BITS.has(code)) return "奇襲攻擊位，不建議當保底持久位。";
  if (isAttackBlade(blade) && CONTROL_ATTACK_BITS.has(code)) return "3G 前段攻擊位 / 5G 主動得分位。";
  if (isStaminaBlade(blade) && isStaminaBit(bit)) return "3G 後段持久位 / 5G 穩定收尾位。";
  if (isDefenseBlade(blade) && isDefenseBit(bit)) return "3G 中後段防守位 / 5G 抗攻擊消耗位。";
  if ((analysis.scores?.metaConfidence ?? 0) <= 0) return "測試位 / 資料信心不足，先不要放主力位。";
  return `${role}，可依隊伍缺口放在 3G 中段或 5G 補位。`;
}

function detailLine(part) {
  if (!part) return "";
  const tier = part.metaTier ? `Tier ${part.metaTier}` : "未標 Tier";
  const confidence = part.confidence ? `信心 ${part.confidence}` : "信心未標";
  const role = part.role ? `，${part.role}` : "";
  return `${partTitle(part)}，${tier}，${confidence}${role}`;
}

function scorePercent(value) {
  return Math.max(0, Math.min(100, Math.round((Number(value) || 0) * 10)));
}

function renderScores(scores) {
  return Object.entries(SCORE_LABELS).map(([key, label]) => {
    const value = scores?.[key] ?? 0;
    return `
      <div class="score-card">
        <div class="score-card-top">
          <div class="score-card-name">${escapeHtml(label)}</div>
          <div class="score-card-value">${escapeHtml(value)}</div>
        </div>
        <div class="score-bar"><div class="score-bar-fill" style="width:${scorePercent(value)}%"></div></div>
      </div>
    `;
  }).join("");
}

function renderList(items, className = "") {
  return (items || []).map(item => `<li class="${className}">${escapeHtml(item)}</li>`).join("");
}

function uniqueItems(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function userDocRef() {
  if (!currentUser) return null;
  return doc(db, "users", currentUser.uid, "appData", "main");
}

function isUsefulCell(value) {
  const text = String(value || "").trim();
  return Boolean(text && text !== "-" && text !== "無");
}

function addOwnedName(bucket, name, count = 1) {
  if (!isUsefulCell(name)) return;
  const key = normalizeText(name);
  const existing = bucket.get(key) || { name: String(name).trim(), count: 0 };
  existing.count += Math.max(1, Number(count) || 1);
  bucket.set(key, existing);
}

function createOwnedBuckets() {
  return {
    blades: new Map(),
    ratchets: new Map(),
    bits: new Map(),
    locks: new Map(),
    mains: new Map(),
    metals: new Map(),
    overs: new Map(),
    assists: new Map()
  };
}

function addBeybladeRowToOwned(owned, row) {
  const cells = row?.cells || [];
  addOwnedName(owned.blades, cells[1]);
  addOwnedName(owned.locks, cells[2]);
  addOwnedName(owned.mains, cells[3]);
  addOwnedName(owned.overs, cells[4]);
  addOwnedName(owned.metals, cells[5]);
  addOwnedName(owned.assists, cells[6]);
  addOwnedName(owned.ratchets, cells[7]);
  addOwnedName(owned.bits, cells[8]);
}

function addPartRowToOwned(owned, row) {
  const cells = row?.cells || [];
  const type = String(cells[0] || "").trim();
  const name = String(cells[1] || "").trim();
  const count = Number(cells[2]) || 1;

  const target = {
    上蓋: owned.blades,
    固鎖: owned.ratchets,
    軸心: owned.bits,
    紋章鎖: owned.locks,
    主要戰刃: owned.mains,
    金屬戰刃: owned.metals,
    超越戰刃: owned.overs,
    輔助戰刃: owned.assists
  }[type];

  if (target) addOwnedName(target, name, count);
}

function readOwnedPartsFromSavedData(data) {
  const owned = createOwnedBuckets();
  (data?.beybladeTable || []).forEach(row => addBeybladeRowToOwned(owned, row));
  (data?.partTable || []).forEach(row => addPartRowToOwned(owned, row));
  return owned;
}

function partsFromBucket(bucket, indexName, limit = 10) {
  return [...bucket.values()]
    .map(item => ({ owned: item, part: findPart(indexName, item.name) }))
    .filter(item => item.part)
    .sort((a, b) => b.owned.count - a.owned.count)
    .slice(0, limit)
    .map(item => item.part);
}

function noRatchetCandidatesFor(blade, bit, ratchets) {
  if (hasNoRatchetBlade(blade) || hasIntegratedBit(bit)) return [null];
  return ratchets;
}

function isSuggestionLegal(blade, ratchet, bit) {
  if (!bit) return false;
  if ((hasNoRatchetBlade(blade) || hasIntegratedBit(bit)) && ratchet) return false;
  if (!hasNoRatchetBlade(blade) && !hasIntegratedBit(bit) && !ratchet) return false;
  if (isUx16Blade(blade) && ratchet && !isSimpleRatchet(ratchet)) return false;
  return true;
}

function analysisScoreValue(analysis, target) {
  const scores = analysis?.scores || {};
  const base = {
    attack: (scores.attack || 0) * 1.45 + (scores.control || 0) * 0.7 + (scores.burstSafety || 0) * 0.35,
    stamina: (scores.stamina || 0) * 1.45 + (scores.burstSafety || 0) * 0.7 + (scores.control || 0) * 0.45,
    defense: (scores.defense || 0) * 1.45 + (scores.burstSafety || 0) * 0.7 + (scores.control || 0) * 0.45,
    balance: (scores.balance || 0) * 1.2 + (scores.control || 0) * 0.75 + (scores.burstSafety || 0) * 0.45
  }[target] || 0;

  return Math.round((base + (scores.metaConfidence || 0) * 0.25) * 10) / 10;
}

function makeStandardSuggestion(blade, ratchet, bit, target) {
  const config = {
    label: "庫存推薦",
    inputs: {},
    parts: { blade, ratchet, bit },
    required: ["blade", "bit"],
    ratchetInput: ratchet ? codeOf(ratchet) : "-"
  };

  const analysis = analyzeCombo(toEngineInput(config), database, { debug: false });
  const role = classifyBuild(config, analysis);
  const label = [partTitle(blade), ratchet ? partTitle(ratchet) : "無固鎖", partTitle(bit)].filter(Boolean).join(" / ");

  return {
    target,
    label,
    role,
    analysis,
    value: analysisScoreValue(analysis, target),
    strengths: buildStrengths(config, analysis).slice(0, 2),
    warnings: buildWarnings(config, analysis, analysis.warnings || []).slice(0, 2),
    recommendations: buildRecommendations(config, analysis).slice(0, 2),
    deckRole: buildDeckRole(config, role, analysis)
  };
}

function buildStandardSuggestions(owned) {
  const blades = partsFromBucket(owned.blades, "blades", 8);
  const ratchets = partsFromBucket(owned.ratchets, "ratchets", 10);
  const bits = partsFromBucket(owned.bits, "bits", 10);
  const suggestions = [];

  blades.forEach(blade => {
    bits.forEach(bit => {
      noRatchetCandidatesFor(blade, bit, ratchets).forEach(ratchet => {
        if (!isSuggestionLegal(blade, ratchet, bit)) return;
        ["attack", "stamina", "defense", "balance"].forEach(target => {
          suggestions.push(makeStandardSuggestion(blade, ratchet, bit, target));
        });
      });
    });
  });

  return suggestions;
}

function pickTopSuggestions(suggestions) {
  const labels = {
    attack: "攻擊推薦",
    stamina: "持久推薦",
    defense: "防守推薦",
    balance: "平衡推薦"
  };

  return Object.keys(labels).flatMap(target => {
    const seen = new Set();
    return suggestions
      .filter(item => item.target === target)
      .sort((a, b) => b.value - a.value)
      .filter(item => {
        const key = normalizeText(item.label);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 2)
      .map(item => ({ ...item, targetLabel: labels[target] }));
  });
}

function renderStockSuggestions(items, owned, fromCache = false) {
  const result = document.getElementById("stockSuggestResult");
  if (!result) return;

  if (!items.length) {
    result.style.display = "block";
    result.innerHTML = `
      <div class="status-bad">目前資料不足，找不到可分析的上蓋、固鎖與軸心。請先在工具頁新增持有零件或陀螺資料。</div>
    `;
    return;
  }

  const summary = `已讀取：上蓋 ${owned.blades.size}、固鎖 ${owned.ratchets.size}、軸心 ${owned.bits.size}。以下只列出分數較高的測試方向。${fromCache ? "（使用 60 秒內快取，未重新讀取雲端）" : ""}`;
  result.style.display = "block";
  result.innerHTML = `
    <div class="analysis-note">${escapeHtml(summary)}</div>
    <div class="suggestion-grid">
      ${items.map((item, index) => `
        <details class="suggestion-card" ${index === 0 ? "open" : ""}>
          <summary class="suggestion-summary">
            <span>
              <span class="analysis-pill">${escapeHtml(item.targetLabel)}</span>
              <span class="suggestion-title">${escapeHtml(item.label)}</span>
            </span>
            <span class="suggestion-score">${escapeHtml(item.value)}</span>
          </summary>
          <div class="analysis-note">${escapeHtml(item.role)}｜${escapeHtml(item.deckRole)}</div>
          <div class="suggestion-detail">
            <div class="section-title">優點</div>
            <ul class="status-list">${renderList(item.strengths, "status-good")}</ul>
            <div class="section-title">注意</div>
            <ul class="status-list">${renderList(item.warnings, "status-warn")}</ul>
            <div class="section-title">可怎麼測</div>
            <ul class="status-list">${renderList(item.recommendations)}</ul>
          </div>
        </details>
      `).join("")}
    </div>
  `;
}

async function renderStockSuggestionsFromCloud() {
  const result = document.getElementById("stockSuggestResult");
  if (!result) return;

  if (!currentUser) {
    result.style.display = "block";
    result.innerHTML = `<div class="status-bad">請先在工具頁使用 Google 登入，再回來產生庫存推薦。</div>`;
    return;
  }

  try {
    await loadData();

    const now = Date.now();
    if (
      stockSuggestionCache &&
      stockSuggestionCache.uid === currentUser.uid &&
      now - stockSuggestionCache.createdAt < STOCK_SUGGEST_CACHE_MS
    ) {
      renderStockSuggestions(stockSuggestionCache.suggestions, stockSuggestionCache.owned, true);
      return;
    }

    result.style.display = "block";
    result.innerHTML = `<div class="analysis-note">正在讀取你的庫存並產生建議...</div>`;

    const snap = await getDoc(userDocRef());
    if (!snap.exists()) {
      result.innerHTML = `<div class="status-bad">找不到你的雲端資料。請先到工具頁新增資料並確認已儲存。</div>`;
      return;
    }

    const owned = readOwnedPartsFromSavedData(snap.data());
    const suggestions = pickTopSuggestions(buildStandardSuggestions(owned));
    stockSuggestionCache = {
      uid: currentUser.uid,
      createdAt: Date.now(),
      owned,
      suggestions
    };
    renderStockSuggestions(suggestions, owned);
  } catch (error) {
    console.error("庫存推薦產生失敗", error);
    result.style.display = "block";
    result.innerHTML = `<div class="status-bad">庫存推薦產生失敗：${escapeHtml(error.message)}</div>`;
  }
}

function renderAnalysis() {
  const result = document.getElementById("analysisResult");
  const config = collectConfig();
  const validation = validateConfig(config);

  const detailParts = Object.entries(config.parts)
    .filter(([, part]) => part)
    .map(([key, part]) => `${fieldLabel(key)}：${detailLine(part)}`);

  if (validation.fatal.length) {
    result.style.display = "block";
    result.innerHTML = `
      <h3>無法分析</h3>
      <div class="result-card">
        <div class="section-title">需要先修正</div>
        <ul class="status-list">${renderList(validation.fatal, "status-bad")}</ul>
        <div class="section-title">已辨識零件</div>
        <ul class="status-list">${renderList(detailParts)}</ul>
      </div>
    `;
    return;
  }

  const analysis = analyzeCombo(toEngineInput(config), database, { debug: false });
  const role = classifyBuild(config, analysis);
  const summary = buildSummary(config, analysis, role);
  const strengths = buildStrengths(config, analysis);
  const warnings = buildWarnings(config, analysis, [...validation.warnings, ...(analysis.warnings || [])]);
  const recommendations = buildRecommendations(config, analysis);
  const deckRole = buildDeckRole(config, role, analysis);

  result.style.display = "block";
  result.innerHTML = `
    <h3>分析結果</h3>
    <div class="pill-row">
      <span class="analysis-pill">${escapeHtml(config.label)}</span>
      <span class="analysis-pill">${escapeHtml(role)}</span>
      <span class="analysis-pill">信心：${escapeHtml(analysis.confidence || "未判定")}</span>
      <span class="analysis-pill">${escapeHtml(deckRole)}</span>
    </div>
    <div class="result-card">
      <div class="section-title">一句話定位</div>
      <div>${escapeHtml(summary)}</div>
    </div>
    <div class="section-title">七維分數</div>
    <div class="score-card-grid">${renderScores(analysis.scores)}</div>
    <div class="section-title">已辨識零件</div>
    <ul class="status-list">${renderList(detailParts)}</ul>
    <div class="section-title">優點</div>
    <ul class="status-list">${renderList(strengths, "status-good")}</ul>
    <div class="section-title">風險提醒</div>
    <ul class="status-list">${renderList(warnings, "status-warn")}</ul>
    <div class="section-title">改裝建議</div>
    <ul class="status-list">${renderList(recommendations)}</ul>
    <div class="section-title">3G / 5G 建議位置</div>
    <div class="result-card">${escapeHtml(deckRole)}</div>
    <div class="analysis-note">分析使用零件權重與相性規則輔助判斷。這是理論輔助，不等於實戰勝率保證。</div>
  `;
}

function clearResult() {
  const result = document.getElementById("analysisResult");
  if (result) {
    result.style.display = "none";
    result.innerHTML = "";
  }
}

function clearForm() {
  document.querySelectorAll("input").forEach(input => input.value = "");
  clearResult();
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".mode-tab").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  document.getElementById("analyzeBtn")?.addEventListener("click", renderAnalysis);
  document.getElementById("clearBtn")?.addEventListener("click", clearForm);
  document.getElementById("suggestFromStockBtn")?.addEventListener("click", renderStockSuggestionsFromCloud);

  try {
    await loadData();
    applyUrlPreset();
  } catch (error) {
    console.error("配置分析資料載入失敗", error);
    const result = document.getElementById("analysisResult");
    if (result) {
      result.style.display = "block";
      result.innerHTML = `<h3>資料載入失敗</h3><div class="status-bad">${escapeHtml(error.message)}</div>`;
    }
  }
});
