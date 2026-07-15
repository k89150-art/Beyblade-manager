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
  getDoc
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyABQadKr-Am-55GgFJmhZ0tkRY-joARNAQ",
  authDomain: "k89150-web-login.firebaseapp.com",
  projectId: "k89150-web-login",
  storageBucket: "k89150-web-login.firebasestorage.app",
  messagingSenderId: "488040360398",
  appId: "1:488040360398:web:759698c16eb67e14f1639f"
};

const ADMIN_UID = "SesDhvXG6MUT38YhqGl0N6lVgMz1";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

let currentUser = null;

function getTargetUid() {
  return new URLSearchParams(location.search).get("uid") || "";
}

function isAdmin() {
  return currentUser && currentUser.uid === ADMIN_UID;
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

function renderTable(targetId, headers, rows) {
  const box = document.getElementById(targetId);
  if (!box) return;

  if (!rows || !rows.length) {
    box.innerHTML = `<div class="empty-state">沒有資料。</div>`;
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="view-table">
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>${row.map((cell, index) => `<td data-label="${escapeHtml(headers[index] || "欄位")}">${escapeHtml(cell || "-")}</td>`).join("")}</tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function hasDisplayValue(value) {
  const text = String(value ?? "").trim();
  return Boolean(text && text !== "-");
}

function getConfigCardData(item) {
  const cells = Array.isArray(item?.cells) ? item.cells : [];
  const [model, layer, crestLock, mainBlade, exceedBlade, metalBlade, assistBlade, ratchet, bit] = cells;
  const seriesMatch = String(model || "").trim().toUpperCase().match(/^(BX|UX|CX)/);
  const series = seriesMatch ? seriesMatch[1] : "X";
  const isCx = series === "CX";
  const hasCxParts = [crestLock, mainBlade, exceedBlade, metalBlade, assistBlade].some(hasDisplayValue);
  const cxCore = hasDisplayValue(metalBlade) ? metalBlade : mainBlade;
  const titlePart = isCx && hasCxParts
    ? [crestLock, cxCore].filter(hasDisplayValue).join("")
    : layer;
  const summaryParts = isCx && hasCxParts
    ? [
        crestLock,
        hasDisplayValue(metalBlade) ? "" : mainBlade,
        metalBlade,
        exceedBlade,
        assistBlade,
        ratchet,
        bit
      ]
    : [layer, ratchet, bit];
  const tags = [];

  if (isCx && hasCxParts) {
    if (hasDisplayValue(crestLock)) tags.push("紋章鎖");
    if (hasDisplayValue(metalBlade) && hasDisplayValue(exceedBlade)) {
      tags.push("金屬+超越");
    } else if (hasDisplayValue(mainBlade)) {
      tags.push("主要戰刃");
    } else {
      if (hasDisplayValue(metalBlade)) tags.push("金屬戰刃");
      if (hasDisplayValue(exceedBlade)) tags.push("超越戰刃");
    }
    if (hasDisplayValue(assistBlade)) tags.push("輔助");
  } else {
    if (hasDisplayValue(layer)) tags.push("上蓋");
    if (hasDisplayValue(ratchet)) tags.push("固鎖");
    if (hasDisplayValue(bit)) tags.push("軸心");
  }

  return {
    series,
    title: [model, titlePart].filter(hasDisplayValue).join(" ") || "未命名配置",
    summary: summaryParts.filter(hasDisplayValue).join(" ・ ") || "尚無零件資料",
    tags
  };
}

function renderConfigCards(targetId, items) {
  const box = document.getElementById(targetId);
  if (!box) return;

  if (!Array.isArray(items) || !items.length) {
    box.innerHTML = `<div class="empty-state">沒有資料。</div>`;
    return;
  }

  box.innerHTML = `
    <div class="readonly-config-grid">
      ${items.map(item => {
        const card = getConfigCardData(item);
        return `
          <article class="readonly-config-card" data-series="${escapeHtml(card.series)}">
            <span class="readonly-series-badge">${escapeHtml(card.series)}</span>
            <h4>${escapeHtml(card.title)}</h4>
            <p>${escapeHtml(card.summary)}</p>
            ${card.tags.length ? `
              <div class="readonly-config-tags">
                ${card.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}
              </div>
            ` : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderTournamentRecords(records) {
  const box = document.getElementById("tournamentBox");
  if (!box) return;

  if (!Array.isArray(records) || !records.length) {
    box.innerHTML = `<div class="empty-state">沒有參賽紀錄。</div>`;
    return;
  }

  box.innerHTML = records.map(record => {
    const matches = Array.isArray(record.matches) ? record.matches : [];
    return `
      <div class="view-card">
        <h3>${escapeHtml(record.tournamentName || "未命名比賽")}</h3>
        <div>日期：${escapeHtml(record.date || "-")}</div>
        <div>地點：${escapeHtml(record.location || "-")}</div>
        <div>名次：${escapeHtml(record.rank || "-")}</div>
        <div>備註：${escapeHtml(record.note || "-")}</div>
        <div>對局數：${matches.length}</div>
      </div>
    `;
  }).join("");
}

async function loadTargetUserData() {
  const targetUid = getTargetUid();
  const uidText = document.getElementById("targetUidText");
  if (uidText) uidText.textContent = targetUid || "未指定";

  if (!targetUid) {
    setSyncStatus("缺少使用者 UID", "error");
    return;
  }

  if (!currentUser) {
    setSyncStatus("請先登入", "muted");
    return;
  }

  if (!isAdmin()) {
    setSyncStatus("目前帳號不是管理員", "error");
    alert("目前帳號沒有管理員權限。");
    return;
  }

  try {
    setSyncStatus("讀取使用者資料中...", "saving");
    const ref = doc(db, "users", targetUid, "appData", "main");
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      setSyncStatus("找不到此使用者資料", "error");
      return;
    }

    const data = snapshot.data() || {};

    renderConfigCards("beybladeBox", data.beybladeTable || []);

    renderTable(
      "partBox",
      ["類別", "零件名稱", "數量"],
      (data.partTable || []).map(item => item.cells || [])
    );

    renderConfigCards("configBox", data.configTable || []);

    renderTable(
      "historyBox",
      ["型號", "組合", "固鎖", "軸心", "結果", "備註", "日期"],
      (data.historyTable || []).map(item => [
        item.model,
        item.combo,
        item.fix,
        item.axis,
        item.result,
        item.note,
        item.date
      ])
    );

    renderTournamentRecords(data.tournamentRecords || []);
    setSyncStatus("使用者資料已載入", "saved");
  } catch (error) {
    console.error("使用者資料讀取失敗：", error);
    alert("使用者資料讀取失敗：" + error.message);
    setSyncStatus("讀取失敗", "error");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (googleLoginBtn) googleLoginBtn.addEventListener("click", loginWithGoogle);
  if (logoutBtn) logoutBtn.addEventListener("click", logoutGoogle);

  onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAuthUI(user);
    loadTargetUserData();
  });
});
