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

  const response = await fetch("./beyblade_x_part_analysis_db_v0_2.json?v=20260629-analysis1");
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

function analyzeScores(blade, ratchet, bit) {
  const scores = {
    attack: blade?.scores?.attack ?? 5,
    defense: blade?.scores?.defense ?? 5,
    stamina: blade?.scores?.stamina ?? 5,
    stability: blade?.scores?.stability ?? 5,
    controlDifficulty: blade?.scores?.controlDifficulty ?? 5
  };

  [ratchet, bit].forEach(part => {
    const modifiers = part?.modifiers || {};
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

  const warnings = [];
  if (!blade || !ratchet || !bit) {
    warnings.push("部分零件尚未收錄分析資料，本次分數會以中性值估算。");
  }
  if (scores.controlDifficulty >= 7) {
    warnings.push("此配置操作難度偏高，實戰穩定性需要測試。");
  }

  result.style.display = "block";
  result.innerHTML = `
    <h3>分析結果</h3>
    <div>
      <span class="analysis-pill">實驗版</span>
      <span class="analysis-pill">${escapeHtml(role)}傾向</span>
    </div>
    <div class="analysis-result-grid">
      <div class="score-box"><div class="score-label">攻擊</div><div class="score-value">${scores.attack}</div></div>
      <div class="score-box"><div class="score-label">防禦</div><div class="score-value">${scores.defense}</div></div>
      <div class="score-box"><div class="score-label">持久</div><div class="score-value">${scores.stamina}</div></div>
      <div class="score-box"><div class="score-label">穩定</div><div class="score-value">${scores.stability}</div></div>
    </div>
    <h4>資料收錄狀態</h4>
    <ul class="status-list">${collectedLines.join("")}</ul>
    <h4>你的庫存狀態</h4>
    <ul class="status-list">${inventoryLines.join("")}</ul>
    ${warnings.length ? `<h4>提醒</h4><ul class="status-list">${warnings.map(item => `<li class="status-warn">${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
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
