import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyABQadKr-Am-55GgFJmhZ0tkRY-joARNAQ",
  authDomain: "k89150-web-login.firebaseapp.com",
  projectId: "k89150-web-login",
  storageBucket: "k89150-web-login.firebasestorage.app",
  messagingSenderId: "488040360398",
  appId: "1:488040360398:web:759698c16eb67e14f1639f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

let currentUser = null;
let unsubscribeCloudData = null;
let currentData = null;
let analysisDb = null;
let analysisIndexes = null;

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

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function setSyncStatus(text, type = "muted") {
  const el = document.getElementById("syncStatus");
  if (!el) return;

  el.textContent = text;
  el.classList.remove("status-muted", "status-saving", "status-saved", "status-error", "status-login");
  el.classList.add(`status-${type}`);
}

function updateAuthUI(user) {
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userInfo = document.getElementById("userInfo");
  const userEmail = document.getElementById("userEmail");

  if (user) {
    if (googleLoginBtn) googleLoginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (userInfo) userInfo.style.display = "block";
    if (userEmail) userEmail.textContent = user.email || "";
  } else {
    if (googleLoginBtn) googleLoginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userInfo) userInfo.style.display = "none";
    if (userEmail) userEmail.textContent = "";
  }
}

async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Google 登入失敗：", error);
    alert("Google 登入失敗：" + error.message);
  }
}

async function logoutGoogle() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("登出失敗：", error);
    alert("登出失敗：" + error.message);
  }
}

async function loadAnalysisDb() {
  if (analysisDb) return analysisDb;

  const response = await fetch("./beyblade_x_part_analysis_db_v0_2.json?v=20260629-ratchet-v16");
  if (!response.ok) {
    throw new Error("分析資料庫讀取失敗");
  }

  analysisDb = await response.json();
  analysisIndexes = buildAnalysisIndexes(analysisDb);
  return analysisDb;
}

function addIndex(index, key, value) {
  const normalized = normalizeText(key);
  if (normalized) index.set(normalized, value);
}

function buildAnalysisIndexes(data) {
  const bladeIndex = new Map();
  const ratchetIndex = new Map();
  const bitIndex = new Map();

  Object.entries(data.blades || {}).forEach(([key, item]) => {
    addIndex(bladeIndex, key, item);
    addIndex(bladeIndex, item.zhName, item);
    addIndex(bladeIndex, item.enName, item);
    (item.aliases || []).forEach(alias => addIndex(bladeIndex, alias, item));
  });

  Object.entries(data.ratchets || {}).forEach(([key, item]) => {
    addIndex(ratchetIndex, key, item);
    addIndex(ratchetIndex, item.id, item);
  });

  Object.entries(data.bits || {}).forEach(([key, item]) => {
    addIndex(bitIndex, key, item);
    addIndex(bitIndex, item.id, item);
  });

  return { bladeIndex, ratchetIndex, bitIndex };
}

function getUserDocRef() {
  if (!currentUser) return null;
  return doc(db, "users", currentUser.uid, "appData", "main");
}

function startCloudListener() {
  const userDocRef = getUserDocRef();
  if (!userDocRef) return;

  if (unsubscribeCloudData) {
    unsubscribeCloudData();
    unsubscribeCloudData = null;
  }

  setSyncStatus("正在讀取你的庫存資料...", "saving");

  unsubscribeCloudData = onSnapshot(userDocRef, snapshot => {
    currentData = snapshot.exists() ? snapshot.data() : {};
    setSyncStatus("庫存資料已載入", "saved");
  }, error => {
    console.error("庫存資料讀取失敗：", error);
    setSyncStatus("庫存資料讀取失敗", "error");
  });
}

function addInventory(map, name, count = 1) {
  const text = String(name || "").trim();
  if (!text || text === "-") return;

  const key = normalizeText(text);
  if (!key) return;

  const old = map.get(key) || { name: text, total: 0, used: 0 };
  old.total += Number(count || 0);
  map.set(key, old);
}

function addUsed(map, name, count = 1) {
  const text = String(name || "").trim();
  if (!text || text === "-") return;

  const key = normalizeText(text);
  if (!key) return;

  const old = map.get(key) || { name: text, total: 0, used: 0 };
  old.used += Number(count || 0);
  map.set(key, old);
}

function buildInventoryMap(data) {
  const inventory = new Map();

  (data?.partTable || []).forEach(item => {
    const cells = item.cells || [];
    addInventory(inventory, cells[1], Number(cells[2] || 0));
  });

  (data?.beybladeTable || []).forEach(item => {
    const cells = item.cells || [];
    cells.slice(1, 9).forEach(name => addInventory(inventory, name, 1));
  });

  (data?.configTable || []).forEach(item => {
    const cells = item.cells || [];
    cells.slice(1, 9).forEach(name => addUsed(inventory, name, 1));
  });

  return inventory;
}

function getInventoryStatus(inventory, input) {
  const key = normalizeText(input);
  const item = inventory.get(key);

  if (!item) {
    return { total: 0, used: 0, available: 0, label: input };
  }

  return {
    total: item.total,
    used: item.used,
    available: Math.max(0, item.total - item.used),
    label: item.name
  };
}

function findBlade(input) {
  return analysisIndexes?.bladeIndex.get(normalizeText(input)) || null;
}

function findRatchet(input) {
  return analysisIndexes?.ratchetIndex.get(normalizeText(input)) || null;
}

function findBit(input) {
  return analysisIndexes?.bitIndex.get(normalizeText(input)) || null;
}

function clampScore(value) {
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

function getPartModifiers(part) {
  if (!part) return {};

  const modifiers = { ...(part.modifiers || {}) };
  const bonusMap = {
    attackBonus: "attack",
    defenseBonus: "defense",
    staminaBonus: "stamina",
    stabilityBonus: "stability",
    burstRiskModifier: "burstRisk",
    controlDifficultyModifier: "controlDifficulty"
  };

  Object.entries(bonusMap).forEach(([sourceKey, targetKey]) => {
    if (typeof part[sourceKey] === "number" && typeof modifiers[targetKey] !== "number") {
      modifiers[targetKey] = part[sourceKey];
    }
  });

  return modifiers;
}

function analyzeScores(blade, ratchet, bit) {
  const scores = {
    attack: blade?.scores?.attack ?? 5,
    defense: blade?.scores?.defense ?? 5,
    stamina: blade?.scores?.stamina ?? 5,
    stability: blade?.scores?.stability ?? 5,
    controlDifficulty: blade?.scores?.controlDifficulty ?? 5
  };

  [ratchet, bit].forEach(part => {
    const modifiers = getPartModifiers(part);
    Object.keys(scores).forEach(key => {
      if (typeof modifiers[key] === "number") scores[key] += modifiers[key];
    });
  });

  Object.keys(scores).forEach(key => {
    scores[key] = clampScore(scores[key]);
  });

  return scores;
}

function getComboRole(scores) {
  const candidates = [
    ["攻擊", scores.attack],
    ["防禦", scores.defense],
    ["持久", scores.stamina],
    ["穩定", scores.stability]
  ].sort((a, b) => b[1] - a[1]);

  if (candidates[0][1] - candidates[1][1] <= 0.7) return "平衡";
  return candidates[0][0];
}

function getOverallScore(scores) {
  const controlPenalty = Math.max(0, scores.controlDifficulty - 6) * 0.8;
  const value = (
    scores.attack * 0.28 +
    scores.defense * 0.23 +
    scores.stamina * 0.23 +
    scores.stability * 0.26
  ) - controlPenalty;

  return clampScore(value);
}

function getVerdict(score) {
  if (score >= 8.5) return "高度推薦測試";
  if (score >= 7.2) return "推薦測試";
  if (score >= 6) return "可測試";
  if (score >= 4.5) return "不優先";
  return "不建議";
}

function getConfidenceValue(parts) {
  const values = parts
    .map(part => part?.confidence)
    .filter(value => typeof value === "number");

  if (!values.length) return 25;

  const normalized = values.map(value => value <= 1 ? value * 100 : value);
  return Math.round(normalized.reduce((sum, value) => sum + value, 0) / normalized.length);
}

function getConfidenceLabel(confidence) {
  if (confidence >= 75) return "中高信心";
  if (confidence >= 55) return "中信心";
  if (confidence >= 35) return "低中信心";
  return "低信心";
}

function hasTag(part, pattern) {
  const text = [
    ...(part?.typeTags || []),
    part?.role,
    part?.notes,
    ...(part?.bestUse || []),
    ...(part?.badUse || []),
    ...(part?.simulationNotes || []),
    part?.enName,
    part?.zhName
  ].join(" ").toLowerCase();

  return text.includes(pattern.toLowerCase());
}

function getTopScoreEntries(scores) {
  return [
    ["攻擊", scores.attack],
    ["防禦", scores.defense],
    ["持久", scores.stamina],
    ["穩定", scores.stability]
  ].sort((a, b) => b[1] - a[1]);
}

function getStrengths(blade, ratchet, bit, scores) {
  const topScores = getTopScoreEntries(scores);
  const strengths = [];

  topScores.slice(0, 2).forEach(([label, value]) => {
    if (value >= 7) strengths.push(`${label}能力明顯，分數 ${value}`);
  });

  if (blade?.goodRatchets?.includes(ratchet?.id)) {
    strengths.push(`${ratchet.id} 是此上蓋的常見推薦固鎖`);
  }

  if (blade?.goodBits?.includes(bit?.id)) {
    strengths.push(`${bit.id} 是此上蓋的常見推薦軸心`);
  }

  if (ratchet?.typeTags?.some(tag => bit?.typeTags?.includes(tag))) {
    strengths.push("固鎖與軸心標籤方向接近，相性較一致");
  }

  if (ratchet?.recommendedBits?.includes(bit?.id)) {
    strengths.push(`${bit.id} 符合此固鎖資料中的推薦軸心方向`);
  }

  return strengths.length ? strengths : ["此配置沒有明顯突出優勢，建議以實測確認方向。"];
}

function getWeaknesses(blade, ratchet, bit, scores) {
  const weaknesses = [];

  if (scores.attack < 5) weaknesses.push("主動攻擊與得分壓力偏低");
  if (scores.defense < 5) weaknesses.push("防禦承受能力偏低");
  if (scores.stamina < 5) weaknesses.push("後段持久可能不足");
  if (scores.stability < 5) weaknesses.push("穩定性偏低，可能容易晃動或失控");
  if (blade?.badBits?.includes(bit?.id)) weaknesses.push(`${bit.id} 在此上蓋資料中被列為不建議軸心`);
  if (ratchet?.avoidBits?.includes(bit?.id)) weaknesses.push(`${bit.id} 在此固鎖資料中被列為應避免的軸心`);
  if (scores.controlDifficulty >= 7) weaknesses.push("操作難度偏高，對發射與控場要求較高");

  return weaknesses.length ? weaknesses : ["目前沒有明顯短板，但仍需要實戰確認。"];
}

function getRiskWarnings(blade, ratchet, bit, scores) {
  const warnings = [];
  const height = Number(ratchet?.height || 0);
  const attackTop = hasTag(blade, "attack");
  const staminaTop = hasTag(blade, "stamina");
  const attackBit = hasTag(bit, "attack");
  const staminaBit = hasTag(bit, "stamina");

  if (!blade || !ratchet || !bit) {
    warnings.push("部分零件尚未收錄分析資料，本次分數會以中性值估算。");
  }

  if (height >= 70 && scores.stability < 7) {
    warnings.push("高位固鎖搭配目前穩定分數不高，可能增加晃動、被抬起或自爆風險。");
  }

  if (attackTop && staminaBit) {
    warnings.push("攻擊型上蓋搭持久型軸心，可能降低主動得分能力。");
  }

  if (staminaTop && attackBit) {
    warnings.push("持久型上蓋搭攻擊型軸心，可能浪費持久特性並增加失速風險。");
  }

  if (scores.controlDifficulty >= 7) {
    warnings.push("此配置操作難度偏高，實戰穩定性需要測試。");
  }

  if (getPartModifiers(ratchet).burstRisk > 0.25) {
    warnings.push("此固鎖的爆裂或失誤風險偏高，建議注意對攻擊型對手的穩定性。");
  }

  if (ratchet?.avoidBits?.includes(bit?.id)) {
    warnings.push("目前軸心落在此固鎖資料的避免清單，建議優先測試其他軸心。");
  }

  return warnings;
}

function getMatchupPrediction(scores) {
  return {
    vsAttack: scores.defense + scores.stability >= 14 ? "對攻擊型有一定承受能力" : "面對攻擊型可能需要搶先得分或避免被正面重擊",
    vsDefense: scores.attack >= 7 ? "對防禦型有主動突破機會" : "對防禦型可能缺少突破力",
    vsStamina: scores.stamina >= 7 ? "可與持久型拉長局測試" : "對持久型可能需要前中期取得優勢",
    vsBalance: getOverallScore(scores) >= 7 ? "對平衡型具備可測試競爭力" : "對平衡型勝負可能取決於發射與對位"
  };
}

function getSuggestedChanges(blade, ratchet, bit, inventory) {
  const suggestions = [];

  (blade?.goodRatchets || []).slice(0, 3).forEach(id => {
    if (ratchet?.id !== id) {
      const status = getInventoryStatus(inventory, id);
      suggestions.push(`固鎖可測試 ${id}${status.available > 0 ? "（你目前有可用庫存）" : ""}`);
    }
  });

  (blade?.goodBits || []).slice(0, 3).forEach(id => {
    if (bit?.id !== id) {
      const status = getInventoryStatus(inventory, id);
      suggestions.push(`軸心可測試 ${id}${status.available > 0 ? "（你目前有可用庫存）" : ""}`);
    }
  });

  if (!suggestions.length && ratchet?.recommendedBits?.length) {
    ratchet.recommendedBits.slice(0, 3).forEach(id => suggestions.push(`依固鎖特性可測試軸心 ${id}`));
  }

  return suggestions.length ? suggestions.slice(0, 5) : ["資料庫暫無明確替代建議，建議先保留此配置實測。"];
}

function getTestFocus(scores, role) {
  const focus = [`確認是否符合「${role}」定位`];

  if (scores.attack >= 7) focus.push("測試前中期能否穩定打出有效碰撞");
  if (scores.stamina >= 7) focus.push("測試後段尾速與抗失速能力");
  if (scores.defense >= 7) focus.push("測試承受強攻後是否容易位移或爆裂");
  if (scores.stability < 6) focus.push("特別觀察晃動、自爆與出界風險");

  return focus;
}

function getStatusClass(status) {
  if (status.available > 0) return "status-good";
  if (status.total > 0) return "status-warn";
  return "status-bad";
}

function renderInventoryLine(label, input, status) {
  const className = getStatusClass(status);
  const message = status.available > 0
    ? `可用 ${status.available} / 持有 ${status.total}`
    : status.total > 0
      ? `已持有 ${status.total}，但目前可能已被配置使用`
      : "目前庫存未找到";

  return `<li class="${className}">${escapeHtml(label)}：${escapeHtml(input)}，${message}</li>`;
}

function renderAnalysis() {
  const result = document.getElementById("analysisResult");
  if (!result) return;

  if (!currentUser) {
    alert("請先登入。");
    return;
  }

  if (!currentData) {
    alert("庫存資料尚未載入完成，請稍後再試。");
    return;
  }

  const bladeInput = document.getElementById("analysisBladeInput")?.value.trim() || "";
  const ratchetInput = document.getElementById("analysisRatchetInput")?.value.trim() || "";
  const bitInput = document.getElementById("analysisBitInput")?.value.trim() || "";

  if (!bladeInput || !ratchetInput || !bitInput) {
    alert("請輸入戰刃、固鎖、軸心。");
    return;
  }

  const blade = findBlade(bladeInput);
  const ratchet = findRatchet(ratchetInput);
  const bit = findBit(bitInput);
  const inventory = buildInventoryMap(currentData);

  const bladeStatus = getInventoryStatus(inventory, bladeInput);
  const ratchetStatus = getInventoryStatus(inventory, ratchetInput);
  const bitStatus = getInventoryStatus(inventory, bitInput);

  const scores = analyzeScores(blade, ratchet, bit);
  const role = getComboRole(scores);
  const overallScore = getOverallScore(scores);
  const verdict = getVerdict(overallScore);
  const confidence = getConfidenceValue([blade, ratchet, bit]);
  const confidenceLabel = getConfidenceLabel(confidence);
  const strengths = getStrengths(blade, ratchet, bit, scores);
  const weaknesses = getWeaknesses(blade, ratchet, bit, scores);
  const riskWarnings = getRiskWarnings(blade, ratchet, bit, scores);
  const matchupPrediction = getMatchupPrediction(scores);
  const suggestedChanges = getSuggestedChanges(blade, ratchet, bit, inventory);
  const testFocus = getTestFocus(scores, role);

  const collectedLines = [
    `<li class="${blade ? "status-good" : "status-warn"}">戰刃分析資料：${blade ? `已收錄（${escapeHtml(blade.zhName || blade.enName || bladeInput)}）` : "尚未收錄分析資料"}</li>`,
    `<li class="${ratchet ? "status-good" : "status-warn"}">固鎖分析資料：${ratchet ? "已收錄" : "尚未收錄分析資料"}</li>`,
    `<li class="${bit ? "status-good" : "status-warn"}">軸心分析資料：${bit ? "已收錄" : "尚未收錄分析資料"}</li>`
  ];

  const inventoryLines = [
    renderInventoryLine("戰刃庫存", bladeInput, bladeStatus),
    renderInventoryLine("固鎖庫存", ratchetInput, ratchetStatus),
    renderInventoryLine("軸心庫存", bitInput, bitStatus)
  ];

  result.style.display = "block";
  result.innerHTML = `
    <h3>分析結果</h3>
    <div>
      <span class="analysis-pill">實驗版</span>
      <span class="analysis-pill">${escapeHtml(verdict)}</span>
      <span class="analysis-pill">${escapeHtml(role)}傾向</span>
      <span class="analysis-pill">${escapeHtml(confidenceLabel)} ${confidence}%</span>
    </div>
    <div class="analysis-result-grid">
      <div class="score-box"><div class="score-label">總評</div><div class="score-value">${overallScore}</div></div>
      <div class="score-box"><div class="score-label">攻擊</div><div class="score-value">${scores.attack}</div></div>
      <div class="score-box"><div class="score-label">防禦</div><div class="score-value">${scores.defense}</div></div>
      <div class="score-box"><div class="score-label">持久</div><div class="score-value">${scores.stamina}</div></div>
      <div class="score-box"><div class="score-label">穩定</div><div class="score-value">${scores.stability}</div></div>
      <div class="score-box"><div class="score-label">操作難度</div><div class="score-value">${scores.controlDifficulty}</div></div>
    </div>
    <h4>配置摘要</h4>
    <ul class="status-list">
      <li>判定：${escapeHtml(verdict)}</li>
      <li>定位：${escapeHtml(role)}傾向</li>
      <li>信心：${escapeHtml(confidenceLabel)}（${confidence}%）</li>
      <li>說明：${escapeHtml(`此配置目前以${role}方向較明顯，總評 ${overallScore}。`)}</li>
    </ul>
    <h4>資料收錄狀態</h4>
    <ul class="status-list">${collectedLines.join("")}</ul>
    <h4>你的庫存狀態</h4>
    <ul class="status-list">${inventoryLines.join("")}</ul>
    <h4>優點</h4>
    <ul class="status-list">${strengths.map(item => `<li class="status-good">${escapeHtml(item)}</li>`).join("")}</ul>
    <h4>短板</h4>
    <ul class="status-list">${weaknesses.map(item => `<li class="status-warn">${escapeHtml(item)}</li>`).join("")}</ul>
    ${riskWarnings.length ? `<h4>風險提醒</h4><ul class="status-list">${riskWarnings.map(item => `<li class="status-warn">${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    <h4>對局預測</h4>
    <ul class="status-list">
      <li>對攻擊：${escapeHtml(matchupPrediction.vsAttack)}</li>
      <li>對防禦：${escapeHtml(matchupPrediction.vsDefense)}</li>
      <li>對持久：${escapeHtml(matchupPrediction.vsStamina)}</li>
      <li>對平衡：${escapeHtml(matchupPrediction.vsBalance)}</li>
    </ul>
    <h4>替代建議</h4>
    <ul class="status-list">${suggestedChanges.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h4>實測重點</h4>
    <ul class="status-list">${testFocus.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <div class="analysis-note">分析結果為實驗版，建議搭配實戰測試與你的實際操作手感判斷。</div>
  `;
}

function clearAnalysis() {
  ["analysisBladeInput", "analysisRatchetInput", "analysisBitInput"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const result = document.getElementById("analysisResult");
  if (result) {
    result.style.display = "none";
    result.innerHTML = "";
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const analyzeComboBtn = document.getElementById("analyzeComboBtn");
  const clearAnalysisBtn = document.getElementById("clearAnalysisBtn");

  if (googleLoginBtn) googleLoginBtn.addEventListener("click", loginWithGoogle);
  if (logoutBtn) logoutBtn.addEventListener("click", logoutGoogle);
  if (analyzeComboBtn) analyzeComboBtn.addEventListener("click", renderAnalysis);
  if (clearAnalysisBtn) clearAnalysisBtn.addEventListener("click", clearAnalysis);

  try {
    await loadAnalysisDb();
  } catch (error) {
    console.error("分析資料庫初始化失敗：", error);
    setSyncStatus("分析資料庫讀取失敗", "error");
  }

  setSyncStatus("請先登入", "muted");

  onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAuthUI(user);

    if (unsubscribeCloudData) {
      unsubscribeCloudData();
      unsubscribeCloudData = null;
    }

    currentData = null;

    if (user) {
      startCloudListener();
    } else {
      setSyncStatus("尚未登入", "muted");
    }
  });
});
