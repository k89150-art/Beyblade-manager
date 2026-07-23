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
  collectionGroup,
  getDocs
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
let adminRows = [];

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

function setPermission(text, ok) {
  const el = document.getElementById("permissionStatus");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("status-ok", ok);
  el.classList.toggle("status-no", !ok);
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

function countArray(data, key) {
  return Array.isArray(data?.[key]) ? data[key].length : 0;
}

function formatTime(value) {
  if (!value) return "-";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getUidFromDoc(snapshot) {
  return snapshot.ref.parent.parent ? snapshot.ref.parent.parent.id : "未知 UID";
}

function renderEmptyRow(message) {
  const tbody = document.getElementById("adminTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";
  const row = tbody.insertRow();
  const cell = row.insertCell(0);
  cell.colSpan = 4;
  cell.textContent = message;
}

function renderTable() {
  const tbody = document.getElementById("adminTableBody");
  if (!tbody) return;

  if (!isAdmin()) {
    renderEmptyRow("請先以管理員帳號登入。");
    return;
  }

  if (!adminRows.length) {
    renderEmptyRow("目前沒有讀取到使用者資料。");
    return;
  }

  tbody.innerHTML = "";

  adminRows.forEach(rowData => {
    const row = tbody.insertRow();

    row.insertCell(0).textContent = rowData.email || "-";
    row.insertCell(1).textContent = rowData.uid;
    row.insertCell(2).textContent = rowData.updatedAtText;

    const actionCell = row.insertCell(3);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "進入頁面";
    button.addEventListener("click", () => openUserPage(rowData.uid));
    actionCell.appendChild(button);
  });
}

function renderSummary() {
  const summaryBox = document.getElementById("summaryBox");
  if (!summaryBox) return;

  if (!isAdmin() || !adminRows.length) {
    summaryBox.style.display = "none";
    return;
  }

  summaryBox.style.display = "grid";
  document.getElementById("summaryUsers").textContent = adminRows.length;
  document.getElementById("summaryConfigs").textContent = adminRows.reduce((sum, row) => sum + row.configCount, 0);
  document.getElementById("summaryHistory").textContent = adminRows.reduce((sum, row) => sum + row.historyCount, 0);
  document.getElementById("summaryTournaments").textContent = adminRows.reduce((sum, row) => sum + row.tournamentCount, 0);
}

window.openUserPage = function (uid) {
  if (!isAdmin()) {
    alert("目前帳號沒有管理員權限。");
    return;
  }
  window.location.href = `user-view.html?uid=${encodeURIComponent(uid)}`;
};

window.loadAdminData = async function () {
  if (!currentUser) {
    alert("請先登入。");
    return;
  }

  if (!isAdmin()) {
    alert("目前帳號沒有管理員權限。");
    setPermission("非管理員", false);
    return;
  }

  try {
    setSyncStatus("讀取管理員資料中...", "saving");
    setPermission("管理員", true);

    const querySnapshot = await getDocs(collectionGroup(db, "appData"));

    adminRows = querySnapshot.docs
      .filter(snapshot => snapshot.id === "main")
      .map(snapshot => {
        const data = snapshot.data() || {};
        const pathUid = getUidFromDoc(snapshot);
        return {
          uid: pathUid,
          email: data.ownerEmail || "-",
          configCount: countArray(data, "configTable"),
          historyCount: countArray(data, "historyTable"),
          tournamentCount: countArray(data, "tournamentRecords"),
          updatedAt: Number(data.updatedAt) || 0,
          updatedAtText: formatTime(data.updatedAt)
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);

    renderSummary();
    renderTable();
    setSyncStatus("管理員資料已更新", "saved");
  } catch (error) {
    console.error("管理員資料讀取失敗：", error);
    alert("管理員資料讀取失敗：" + error.message);
    setSyncStatus("讀取失敗", "error");
  }
};

document.addEventListener("DOMContentLoaded", function () {
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (googleLoginBtn) googleLoginBtn.addEventListener("click", loginWithGoogle);
  if (logoutBtn) logoutBtn.addEventListener("click", logoutGoogle);

  onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAuthUI(user);

    if (!user) {
      adminRows = [];
      setPermission("尚未登入", false);
      setSyncStatus("尚未登入", "muted");
      renderSummary();
      renderTable();
      return;
    }

    if (!isAdmin()) {
      adminRows = [];
      setPermission("非管理員", false);
      setSyncStatus("目前帳號不是管理員", "error");
      renderSummary();
      renderTable();
      return;
    }

    setPermission("管理員", true);
    setSyncStatus("管理員已登入", "saved");
    loadAdminData();
  });
});
