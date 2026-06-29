let analysisDb = null;
let indexes = null;
let currentMode = "standard";

const TIER_SCORE = { S: 90, A: 80, B: 68, C: 55, D: 42, "待驗證": 45, "資料不足": 38 };
const CONFIDENCE_SCORE = { high: 88, "medium-high": 76, medium: 62, "medium-low": 48, low: 34, "高": 88, "中高": 76, "中": 62, "中低": 48, "低": 34 };
const ROLE_LABELS = ["攻擊", "防禦", "持久", "平衡", "反攻", "抗攻擊", "左迴旋", "低身位"];
const INTEGRATED_BITS = new Set(["OP", "TR"]);

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

async function loadDb() {
  if (analysisDb) return analysisDb;

  const response = await fetch("./beyblade_x_database_v1_zhTW.json?v=20260630-analysis2");
  if (!response.ok) throw new Error("配置分析資料庫讀取失敗");

  analysisDb = await response.json();
  indexes = buildIndexes(analysisDb);
  fillOptions();
  return analysisDb;
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
    addIndex(index, item, [item.id, item.code, item.name, item.model].filter(Boolean));
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
  fillDatalist("bladeOptions", analysisDb.blades);
  fillDatalist("ratchetOptions", [{ id: "-", name: "無固鎖" }, ...(analysisDb.ratchets || [])]);
  fillDatalist("bitOptions", analysisDb.bits);
  fillDatalist("cxLockOptions", analysisDb.cx?.lockChips);
  fillDatalist("cxMainBladeOptions", analysisDb.cx?.mainBlades);
  fillDatalist("cxMetalOptions", analysisDb.cx?.metalBlades);
  fillDatalist("cxOverOptions", analysisDb.cx?.overBlades);
  fillDatalist("cxAssistOptions", analysisDb.cx?.assistBlades);
}

function findPart(indexName, input) {
  const value = String(input || "").trim();
  if (!value || value === "-") return null;
  return indexes[indexName].get(normalizeText(value)) || null;
}

function getInput(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function setMode(mode) {
  currentMode = mode;

  document.querySelectorAll(".mode-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  document.getElementById("standardFields").style.display = mode === "standard" ? "grid" : "none";
  document.getElementById("cxMainFields").style.display = mode === "cx-main" ? "grid" : "none";
  document.getElementById("cxSplitFields").style.display = mode === "cx-split" ? "grid" : "none";

  clearResult();
}

function partRoles(part) {
  const text = [
    ...(part?.roleTags || []),
    part?.role,
    part?.metaTier,
    ...(part?.strengths || []),
    ...(part?.weaknesses || []),
    ...(part?.recommendedDirections || [])
  ].join(" ");

  return ROLE_LABELS.filter(role => text.includes(role));
}

function allRoles(parts) {
  const scores = new Map();
  parts.forEach(part => {
    partRoles(part).forEach(role => scores.set(role, (scores.get(role) || 0) + 1));
  });
  return [...scores.entries()].sort((a, b) => b[1] - a[1]);
}

function scorePart(part) {
  if (!part) return 40;
  const tier = TIER_SCORE[part.metaTier] ?? 52;
  const confidence = CONFIDENCE_SCORE[part.confidence] ?? 52;
  return tier * 0.65 + confidence * 0.35;
}

function scoreToVerdict(score, fatalIssues) {
  if (fatalIssues.length) return "不合法";
  if (score >= 78) return "推薦測試";
  if (score >= 65) return "可測試";
  if (score >= 52) return "不優先";
  return "不建議";
}

function scoreToConfidence(parts) {
  const values = parts
    .filter(Boolean)
    .map(part => CONFIDENCE_SCORE[part.confidence] ?? 52);
  if (!values.length) return ["低", 0];

  const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  if (average >= 80) return ["高", average];
  if (average >= 68) return ["中高", average];
  if (average >= 52) return ["中", average];
  if (average >= 40) return ["中低", average];
  return ["低", average];
}

function hasIntegratedBit(bit) {
  return INTEGRATED_BITS.has(normalizeCode(bit?.code || bit?.id));
}

function isNoRatchetValue(value) {
  const text = String(value || "").trim();
  return !text || text === "-" || text === "無固鎖";
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
    label: "CX 三件式",
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
    label: "CX 分體式",
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

  config.required.forEach(key => {
    if (!inputs[key]) fatal.push(`請選擇${fieldLabel(key)}。`);
    else if (!parts[key]) fatal.push(`${fieldLabel(key)}「${inputs[key]}」不在目前資料庫中。`);
  });

  if (!isNoRatchetValue(config.ratchetInput) && !parts.ratchet) {
    fatal.push(`固鎖「${config.ratchetInput}」不在目前資料庫中。`);
  }

  if (parts.bit && hasIntegratedBit(parts.bit) && !isNoRatchetValue(config.ratchetInput)) {
    fatal.push("Op / Tr 是固鎖一體式軸心，不能再搭配一般固鎖。");
  }

  if (parts.bit && !hasIntegratedBit(parts.bit) && isNoRatchetValue(config.ratchetInput)) {
    fatal.push("一般軸心需要搭配固鎖；只有 Op / Tr 這類一體式軸心可不選固鎖。");
  }

  if (config.cxType === "main") {
    warnings.push("CX 三件式應使用：紋章鎖 + 主要戰刃 + 輔助戰刃。");
    const recommended = parts.main?.recommendedAssistBlades || [];
    if (recommended.length && parts.assist && !recommended.includes(parts.assist.code || parts.assist.id)) {
      warnings.push(`${parts.assist.id} 不在「${parts.main.name || parts.main.id}」目前推薦輔助戰刃清單中，可測但建議注意相性。`);
    }
  }

  if (config.cxType === "split") {
    warnings.push("CX 分體式應使用：紋章鎖 + 金屬戰刃 + 超越戰刃 + 輔助戰刃。");
  }

  const height = Number(parts.ratchet?.height || 0);
  if (height >= 70) warnings.push("固鎖高度 70 以上，需注意重心、被抬起與後段晃動。");
  if (height <= 55 && parts.ratchet) warnings.push("低身位固鎖可降低重心，但也要注意刮地與接觸角度。");

  return { fatal, warnings };
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

function analyzeConfig(config) {
  const validation = validateConfig(config);
  const parts = Object.values(config.parts).filter(Boolean);
  const base = parts.length ? parts.reduce((sum, part) => sum + scorePart(part), 0) / parts.length : 0;
  const roleEntries = allRoles(parts);
  const primaryRole = roleEntries[0]?.[0] || "未判定";
  const confidence = scoreToConfidence(parts);
  let synergy = 0;

  if (roleEntries[0]?.[1] >= 3) synergy += 7;
  if (roleEntries[0]?.[1] === 2) synergy += 3;
  if (config.cxType === "main") {
    const assistId = config.parts.assist?.code || config.parts.assist?.id;
    if ((config.parts.main?.recommendedAssistBlades || []).includes(assistId)) synergy += 8;
  }
  if (config.parts.ratchet && config.parts.bit && partRoles(config.parts.ratchet).some(role => partRoles(config.parts.bit).includes(role))) synergy += 4;

  const finalScore = Math.max(0, Math.min(100, Math.round(base + synergy - validation.fatal.length * 25)));
  const verdict = scoreToVerdict(finalScore, validation.fatal);
  return { validation, parts, finalScore, verdict, primaryRole, confidence, roleEntries };
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
  return `${partTitle(part)}：${tier}，${confidence}${role}`;
}

function collectStrengths(parts) {
  return parts.flatMap(part => (part.strengths || []).map(text => `${part.name || part.id}：${text}`)).slice(0, 8);
}

function collectWeaknesses(parts) {
  return parts.flatMap(part => (part.weaknesses || []).map(text => `${part.name || part.id}：${text}`)).slice(0, 8);
}

function getSuggestions(config, analysis) {
  const suggestions = [];
  const { parts } = config;
  const quickRules = analysisDb.analysisModel?.quickRules || [];

  quickRules
    .filter(rule => rule.need.includes(analysis.primaryRole) || analysis.primaryRole.includes(rule.need))
    .slice(0, 2)
    .forEach(rule => {
      if (rule.preferRatchets?.length) suggestions.push(`${rule.need} 可優先測試固鎖：${rule.preferRatchets.join("、")}`);
      if (rule.preferBits?.length) suggestions.push(`${rule.need} 可優先測試軸心：${rule.preferBits.join("、")}`);
    });

  if (config.cxType === "main" && parts.main?.recommendedAssistBlades?.length) {
    suggestions.push(`此主要戰刃可測輔助戰刃：${parts.main.recommendedAssistBlades.join("、")}`);
  }

  if (parts.metal?.recommendedDirections?.length) {
    suggestions.push(`金屬戰刃方向：${parts.metal.recommendedDirections.join("、")}`);
  }

  if (!suggestions.length) suggestions.push("目前資料庫沒有明確替代建議，建議先實測這組配置。");
  return suggestions.slice(0, 6);
}

function renderList(items, className = "") {
  return items.length
    ? items.map(item => `<li class="${className}">${escapeHtml(item)}</li>`).join("")
    : `<li class="${className}">目前資料不足，建議實測補充。</li>`;
}

function renderAnalysis() {
  const result = document.getElementById("analysisResult");
  const config = collectConfig();
  const analysis = analyzeConfig(config);
  const detailParts = Object.entries(config.parts)
    .filter(([, part]) => part)
    .map(([key, part]) => `${fieldLabel(key)}：${detailLine(part)}`);
  const strengths = collectStrengths(analysis.parts);
  const weaknesses = collectWeaknesses(analysis.parts);
  const suggestions = getSuggestions(config, analysis);
  const roleText = analysis.roleEntries.map(([role, count]) => `${role} x${count}`).join("、") || "未判定";

  result.style.display = "block";
  result.innerHTML = `
    <h3>分析結果</h3>
    <div class="pill-row">
      <span class="analysis-pill">${escapeHtml(config.label)}</span>
      <span class="analysis-pill">${escapeHtml(analysis.verdict)}</span>
      <span class="analysis-pill">${escapeHtml(analysis.primaryRole)}傾向</span>
      <span class="analysis-pill">信心 ${escapeHtml(analysis.confidence[0])} ${analysis.confidence[1]}%</span>
    </div>
    <div class="result-summary">
      <div class="summary-box"><div class="summary-label">判定</div><div class="summary-value">${escapeHtml(analysis.verdict)}</div></div>
      <div class="summary-box"><div class="summary-label">定位</div><div class="summary-value">${escapeHtml(analysis.primaryRole)}</div></div>
      <div class="summary-box"><div class="summary-label">總評</div><div class="summary-value">${analysis.finalScore}</div></div>
    </div>
    <div class="section-title">合法性 / CX 條件</div>
    <ul class="status-list">
      ${renderList(analysis.validation.fatal, "status-bad")}
      ${renderList(analysis.validation.warnings, "status-warn")}
    </ul>
    <div class="section-title">零件判讀</div>
    <ul class="status-list">${renderList(detailParts)}</ul>
    <div class="section-title">方向相性</div>
    <ul class="status-list">
      <li>主要方向：${escapeHtml(roleText)}</li>
      <li>若多個零件集中在同一方向，代表配置目標較清楚；若分散，較偏實驗或平衡。</li>
    </ul>
    <div class="section-title">優點</div>
    <ul class="status-list">${renderList(strengths, "status-good")}</ul>
    <div class="section-title">風險 / 短板</div>
    <ul class="status-list">${renderList(weaknesses, "status-warn")}</ul>
    <div class="section-title">替代建議</div>
    <ul class="status-list">${renderList(suggestions)}</ul>
    <div class="analysis-note">分析只依目前資料庫推論，不代表實戰勝率。CX 請優先確認欄位結構是否符合三件式或分體式。</div>
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
  document.querySelectorAll(".mode-tab").forEach(button => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  document.getElementById("analyzeBtn")?.addEventListener("click", renderAnalysis);
  document.getElementById("clearBtn")?.addEventListener("click", clearForm);

  try {
    await loadDb();
  } catch (error) {
    console.error("配置分析資料庫讀取失敗：", error);
    const result = document.getElementById("analysisResult");
    if (result) {
      result.style.display = "block";
      result.innerHTML = `<h3>資料庫讀取失敗</h3><div class="status-bad">${escapeHtml(error.message)}</div>`;
    }
  }
});
