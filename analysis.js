import { analyzeCombo } from "./beyblade_x_analysis_engine_v1_zhTW.js?v=20260630-engine2";

let database = null;
let rules = null;
let indexes = null;
let currentMode = "standard";

const INTEGRATED_BITS = new Set(["OP", "TR"]);
const NO_RATCHET_MODELS = new Set(["UX-19"]);
const UX16_MODELS = new Set(["UX-16"]);

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
  if (!response.ok) throw new Error(`資料載入失敗：${url}`);
  return response.json();
}

async function loadData() {
  if (database && rules) return;

  [database, rules] = await Promise.all([
    loadJson("./beyblade_x_database_v1_zhTW.json?v=20260630-engine2"),
    loadJson("./beyblade_x_analysis_rules_v1_zhTW.json?v=20260630-engine2")
  ]);

  indexes = buildIndexes(database);
  fillOptions();
}

function addIndex(index, item, keys) {
  keys.forEach(key => {
    const normalized = normalizeText(key);
    if (normalized && !index.has(normalized)) index.set(normalized, item);
  });
}

function buildPartIndex(items = []) {
  const index = new Map();
  items.forEach(item => addIndex(index, item, [item.id, item.code, item.name, item.model].filter(Boolean)));
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

function optionLabel(item) {
  const prefix = item.model ? `${item.model} ` : item.code && item.code !== item.id ? `${item.code} ` : "";
  const name = item.name || item.id || item.code || "";
  return `${prefix}${name}`.trim();
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

function findPart(indexName, input) {
  const value = String(input || "").trim();
  if (!value || value === "-" || value === "無固鎖") return null;
  return indexes[indexName].get(normalizeText(value)) || null;
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

function nameOf(part) {
  return part?.name || part?.id || part?.code || "";
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
    warnings.push("CX 主要戰刃模式會以：紋章鎖 + 主要戰刃 + 輔助戰刃分析。暫不自動推回完整上蓋名稱。");
    const recommended = parts.main?.recommendedAssistBlades || [];
    if (recommended.length && parts.assist && !recommended.includes(codeOf(parts.assist))) {
      warnings.push(`${nameOf(parts.assist)} 不是 ${nameOf(parts.main)} 資料中優先建議的輔助戰刃，可測試但信心會較保守。`);
    }
  }

  if (config.cxType === "split") {
    warnings.push("CX 金屬 + 超越模式會以：紋章鎖 + 金屬戰刃 + 超越戰刃 + 輔助戰刃分析。");
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

function partTitle(part) {
  if (!part) return "";
  const code = part.code && part.code !== part.id ? ` / ${part.code}` : "";
  const model = part.model ? `${part.model} ` : "";
  return `${model}${part.name || part.id}${code}`;
}

function detailLine(part) {
  if (!part) return "";
  const tier = part.metaTier ? `Tier ${part.metaTier}` : "未標 Tier";
  const confidence = part.confidence ? `信心 ${part.confidence}` : "信心未標";
  const role = part.role ? `，${part.role}` : "";
  return `${partTitle(part)}，${tier}，${confidence}${role}`;
}

function scorePercent(value) {
  return Math.max(0, Math.min(100, Math.round(((Number(value) || 0) + 5) * 10)));
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
  return items?.length
    ? items.map(item => `<li class="${className}">${escapeHtml(item)}</li>`).join("")
    : `<li class="${className}">目前沒有明顯項目。</li>`;
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

  const analysis = analyzeCombo(toEngineInput(config), database, rules);
  const warnings = [...validation.warnings, ...(analysis.warnings || [])];

  result.style.display = "block";
  result.innerHTML = `
    <h3>分析結果</h3>
    <div class="pill-row">
      <span class="analysis-pill">${escapeHtml(config.label)}</span>
      <span class="analysis-pill">${escapeHtml(analysis.primaryRole || "定位未明")}</span>
      <span class="analysis-pill">信心：${escapeHtml(analysis.confidence || "未判定")}</span>
      <span class="analysis-pill">${escapeHtml(analysis.deckRole || "牌組位置未判定")}</span>
    </div>
    <div class="result-card">
      <div class="section-title">一句話定位</div>
      <div>${escapeHtml(analysis.summary || "目前資料不足，建議先作為測試配置觀察。")}</div>
    </div>
    <div class="section-title">七維分數</div>
    <div class="score-card-grid">${renderScores(analysis.scores)}</div>
    <div class="section-title">已辨識零件</div>
    <ul class="status-list">${renderList(detailParts)}</ul>
    <div class="section-title">優點</div>
    <ul class="status-list">${renderList(analysis.strengths || [], "status-good")}</ul>
    <div class="section-title">風險提醒</div>
    <ul class="status-list">${renderList(warnings, "status-warn")}</ul>
    <div class="section-title">改裝建議</div>
    <ul class="status-list">${renderList(analysis.recommendations || [])}</ul>
    <div class="section-title">3G / 5G 建議位置</div>
    <div class="result-card">${escapeHtml(analysis.deckRole || "建議先作為測試位，累積實戰後再調整。")}</div>
    <div class="analysis-note">分析使用 analyzeCombo() 與 v1.0-alpha 規則。這是理論輔助，不等於實戰勝率保證。</div>
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

  try {
    await loadData();
  } catch (error) {
    console.error("配置分析資料載入失敗", error);
    const result = document.getElementById("analysisResult");
    if (result) {
      result.style.display = "block";
      result.innerHTML = `<h3>資料載入失敗</h3><div class="status-bad">${escapeHtml(error.message)}</div>`;
    }
  }
});