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
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";


/*
  新 Firebase：Google 登入 + Firestore
*/
const newFirebaseConfig = {
  apiKey: "AIzaSyABQadKr-Am-55GgFJmhZ0tkRY-joARNAQ",
  authDomain: "k89150-web-login.firebaseapp.com",
  projectId: "k89150-web-login",
  storageBucket: "k89150-web-login.firebasestorage.app",
  messagingSenderId: "488040360398",
  appId: "1:488040360398:web:759698c16eb67e14f1639f"
};

const newApp = initializeApp(newFirebaseConfig);

const auth = getAuth(newApp);
const provider = new GoogleAuthProvider();
const db = getFirestore(newApp);

const ADMIN_UID = "SesDhvXG6MUT38YhqGl0N6lVgMz1";

let currentUser = null;
let viewingUserId = null;   // null = 看自己；有值 = 管理員在看別人
let unsubscribeCloudData = null;
let isApplyingRemoteData = false;

function isAdmin() {
  return currentUser && currentUser.uid === ADMIN_UID;
}

function setAdminMenuVisibility(show) {
  document.querySelectorAll('.side-menu a[href="admin.html"]').forEach(link => {
    link.style.display = show ? "block" : "none";
  });

  document.querySelectorAll(".side-menu-section").forEach(section => {
    if (section.textContent.trim() === "管理") {
      section.style.display = show ? "block" : "none";
    }
  });
}

function isReadOnly() {
  return viewingUserId !== null;
}

function getUserDocRef(targetUid) {
  if (!currentUser) return null;
  const uid = targetUid || viewingUserId || currentUser.uid;
  return doc(db, "users", uid, "appData", "main");
}

function requireLogin() {
  if (!currentUser) {
    alert("請先使用 Google 登入，才能操作資料。");
    setSyncStatus("請先登入後再操作", "muted");
    return false;
  }

  if (isReadOnly()) {
    alert("目前是瀏覽模式，無法修改其他使用者的資料。");
    return false;
  }

  return true;
}

const partTypes = [
  "上蓋",
  "紋章鎖",
  "主要戰刃",
  "超越戰刃",
  "金屬戰刃",
  "輔助戰刃",
  "固鎖",
  "軸心"
];

const selectorMap = {
  "上蓋": "sel上蓋",
  "紋章鎖": "sel紋章鎖",
  "主要戰刃": "sel主要戰刃",
  "超越戰刃": "sel超越戰刃",
  "金屬戰刃": "sel金屬戰刃",
  "輔助戰刃": "sel輔助戰刃",
  "固鎖": "sel固鎖",
  "軸心": "sel軸心"
};

const beybladeCellMap = {
  "上蓋": 1,
  "紋章鎖": 2,
  "主要戰刃": 3,
  "超越戰刃": 4,
  "金屬戰刃": 5,
  "輔助戰刃": 6,
  "固鎖": 7,
  "軸心": 8
};

const configCellMap = {
  "上蓋": 1,
  "紋章鎖": 2,
  "主要戰刃": 3,
  "超越戰刃": 4,
  "金屬戰刃": 5,
  "輔助戰刃": 6,
  "固鎖": 7,
  "軸心": 8
};

const configEditColumnMap = {
  1: "上蓋",
  2: "紋章鎖",
  3: "主要戰刃",
  4: "超越戰刃",
  5: "金屬戰刃",
  6: "輔助戰刃",
  7: "固鎖",
  8: "軸心"
};

function normalizeModel(model) {
  const text = String(model || "").trim().replace(/\s+/g, " ");

  const match = text.match(/^(UX|BX|CX)\s*-?\s*(\d+)(.*)$/i);

  if (!match) return text;

  const series = match[1].toUpperCase();
  const number = match[2];
  const rest = (match[3] || "").trim().replace(/\s+/g, " ");

  return `${series}-${number}${rest ? " " + rest : ""}`;
}

function normalizeAllModelCells() {
  let changed = false;

  ["beybladeTable", "configTable"].forEach(tableId => {
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);

    rows.forEach(row => {
      const cell = row.cells[0];
      if (!cell) return;

      const oldModel = cell.innerText.trim();
      const newModel = normalizeModel(oldModel);

      if (oldModel !== newModel) {
        cell.innerText = newModel;
        changed = true;
      }
    });
  });

  return changed;
}

// 抽包系列型號（不強制 CX 戰刃規則，也不強制上蓋）
const RANDOM_BOOSTER_MODELS = new Set([
  "BX-14", "BX-24", "BX-31", "BX-36", "UX-12",
  "BX-39", "CX-05", "CX-06", "CX-08", "UX-18",
  "BX-48", "CX-17", "BX-50", "CX-18"
]);

const NO_RATCHET_MODELS = new Set(["UX-19"]);

function getRandomBoosterBaseModel(model) {
  const normalized = normalizeModel(model).toUpperCase().trim();
  
  const match = normalized.match(/^(UX|BX|CX)-?\s*(\d+)/i);

  if (!match) return normalized;

  const series = match[1].toUpperCase();
  const number = match[2];

  return `${series}-${number}`;
}

function getBaseModelCode(model) {
  const normalized = normalizeModel(model).toUpperCase().trim();
  const match = normalized.match(/^(UX|BX|CX)-?\s*(\d+)/i);

  if (!match) return normalized;

  const series = match[1].toUpperCase();
  const number = match[2];

  return `${series}-${String(Number(number)).padStart(2, "0")}`;
}

function isRandomBooster(model) {
  const baseModel = getRandomBoosterBaseModel(model);
  return RANDOM_BOOSTER_MODELS.has(baseModel);
}

function isNoRatchetModel(model) {
  return NO_RATCHET_MODELS.has(getBaseModelCode(model));
}

function getAxisCode(axis) {
  const text = String(axis || "").trim();
  const match = text.match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : text.toUpperCase();
}

function isNoRatchetAxis(axis) {
  return getAxisCode(axis) === "TR";
}

function shouldUseNoRatchet(model, axis) {
  return isNoRatchetModel(model) || isNoRatchetAxis(axis);
}

function getNoRatchetFixValue(model, axis, value) {
  return shouldUseNoRatchet(model, axis) && !value ? "-" : value;
}

function isSimpleRatchet(ratchet) {
  const text = String(ratchet || "").trim();
  if (!text || text === "-") return false;

  const codeMatch = text.match(/\d+\s*-\s*(\d+)/);
  if (codeMatch) {
    return codeMatch[1].endsWith("5");
  }

  return text.endsWith("5");
}

function validateRatchetRules(model, axis, ratchet) {
  const fix = String(ratchet || "").trim();

  if (isNoRatchetAxis(axis) && fix && fix !== "-") {
    alert("Tr 軸無法使用固鎖。");
    return false;
  }

  if (isNoRatchetModel(model) && fix && fix !== "-") {
    alert("UX-19 無法使用固鎖。");
    return false;
  }

  if (getBaseModelCode(model) === "UX-16" && !isSimpleRatchet(fix)) {
    alert("時鐘幻象只能使用簡易固鎖");
    return false;
  }

  return true;
}

function getSeriesFromModel(model) {
  const text = model.trim().toUpperCase();

  if (text.startsWith("CX")) return "CX";
  if (text.startsWith("BX")) return "BX";
  if (text.startsWith("UX")) return "UX";

  return "OTHER";
}

/* ====== 排序：UX → BX → CX → 其他（第一區與第三區共用） ====== */

const TABLE_SORT_ORDER = { UX: 1, BX: 2, CX: 3, OTHER: 4 };

let _configSortTimer = null;
let _configSorting = false;

function sortTable(tableId) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;

  // 編輯中不排序
  if (tbody.querySelector("input, select, textarea")) return;
  if (Array.from(tbody.rows).some(r => r.dataset.editing === "true")) return;

  const rows = Array.from(tbody.querySelectorAll("tr"));
  if (rows.length <= 1) return;

  const sorted = [...rows].sort((a, b) => {
    const modelA = a.cells[0]?.innerText.trim() || "";
    const modelB = b.cells[0]?.innerText.trim() || "";
    const orderA = TABLE_SORT_ORDER[getSeriesFromModel(modelA)] || 99;
    const orderB = TABLE_SORT_ORDER[getSeriesFromModel(modelB)] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return modelA.localeCompare(modelB, "zh-Hant", { numeric: true, sensitivity: "base" });
  });

  const alreadySorted = rows.every((r, i) => r === sorted[i]);
  if (alreadySorted) return;

  sorted.forEach(row => tbody.appendChild(row));
}

function sortBeybladeTable() {
  sortTable("beybladeTable");
}

function sortConfigTable() {
  if (_configSorting) return;
  _configSorting = true;
  sortTable("configTable");
  _configSorting = false;
}

function scheduleConfigSort() {
  clearTimeout(_configSortTimer);
  _configSortTimer = setTimeout(sortConfigTable, 80);
}

function installConfigSort() {
  const tbody = document.querySelector("#configTable tbody");
  if (!tbody) { setTimeout(installConfigSort, 200); return; }

  sortConfigTable();

  const observer = new MutationObserver(() => {
    if (!_configSorting) scheduleConfigSort();
  });
  observer.observe(tbody, { childList: true, subtree: true, characterData: true });
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}
function preventInvalidPartCountInput(input) {
  input.addEventListener("keydown", event => {
    if (["-", "+", ".", "e", "E"].includes(event.key)) {
      event.preventDefault();
    }
  });

  input.addEventListener("input", () => {
    const value = Number(input.value);

    if (input.value && (!Number.isInteger(value) || value < 1)) {
      input.value = "";
    }
  });
}

function clearFirstAreaInputs() {
  [
    "model",
    "layer",
    "lock",
    "primaryBlade",
    "transcendBlade",
    "metalBlade",
    "aux",
    "fix",
    "axis"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function addStock(total, type, name, count) {
  if (!name || name === "-" || count <= 0) return;

  if (!total[type][name]) {
    total[type][name] = 0;
  }

  total[type][name] += count;
}

function getStockNameFromCell(cell) {
  if (!cell) return "";

  if (cell.dataset.stockName !== undefined) {
    return cell.dataset.stockName;
  }

  return cell.innerText.trim();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getOperationButtons(tableType) {
  const analyzeButton = tableType === "config"
    ? '<button onclick="analyzeConfigRow(this)">分析</button>'
    : "";

  if (isReadOnly()) return analyzeButton;

  return `
    ${analyzeButton}
    <button onclick="editRow(this, '${tableType}')">修改</button>
    <button onclick="deleteRow(this)">刪除</button>
  `;
}

function getEditingButtons(tableType) {
  return `
    <button onclick="saveEditRow(this, '${tableType}')">保存</button>
    <button onclick="cancelEditRow(this, '${tableType}')">取消</button>
  `;
}
function normalizeComboValue(value) {
  const text = String(value || "").trim();
  return text && text !== "-" ? text : "-";
}

function getConfigComboKeyFromValues(values) {
  return values.map(normalizeComboValue).join("|");
}

function getConfigComboKeyFromRow(row) {
  const values = [];

  for (let i = 1; i <= 8; i++) {
    const cell = row.cells[i];

    if (i === 3) {
      values.push(getStockNameFromCell(cell) || cell?.innerText.trim() || "-");
    } else {
      values.push(cell?.innerText.trim() || "-");
    }
  }

  return getConfigComboKeyFromValues(values);
}

function getTextCell(row, index) {
  return row.cells[index]?.innerText.trim() || "-";
}

function cleanAnalysisValue(value) {
  const text = String(value || "").trim();
  return text && text !== "-" ? text : "";
}

window.analyzeConfigRow = function (button) {
  const row = button?.closest("tr");
  if (!row) return;

  const model = getTextCell(row, 0);
  const layer = getTextCell(row, 1);
  const lock = getTextCell(row, 2);
  const main = getStockNameFromCell(row.cells[3]) || getTextCell(row, 3);
  const transcend = getTextCell(row, 4);
  const metal = getTextCell(row, 5);
  const aux = getTextCell(row, 6);
  const ratchet = getTextCell(row, 7);
  const bit = getTextCell(row, 8);
  const params = new URLSearchParams();

  if (cleanAnalysisValue(lock) && cleanAnalysisValue(aux) && cleanAnalysisValue(metal) && cleanAnalysisValue(transcend)) {
    params.set("mode", "cx-split");
    params.set("lock", lock);
    params.set("metal", metal);
    params.set("over", transcend);
    params.set("assist", aux);
  } else if (cleanAnalysisValue(lock) && cleanAnalysisValue(aux) && cleanAnalysisValue(main)) {
    params.set("mode", "cx-main");
    params.set("lock", lock);
    params.set("main", main);
    params.set("assist", aux);
  } else {
    params.set("mode", "standard");
    params.set("blade", layer);
  }

  params.set("model", model);
  params.set("ratchet", ratchet);
  params.set("bit", bit);
  params.set("auto", "1");

  window.location.href = `analysis.html?${params.toString()}`;
};

function buildHistoryRecordFromConfigRow(row, result, note) {
  const model = normalizeModel(row.cells[0]?.innerText.trim() || "");
  const layer = row.cells[1]?.innerText.trim() || "-";
  const lock = row.cells[2]?.innerText.trim() || "-";
  const main = row.cells[3]?.innerText.trim() || "-";
  const transcend = row.cells[4]?.innerText.trim() || "-";
  const metal = row.cells[5]?.innerText.trim() || "-";
  const aux = row.cells[6]?.innerText.trim() || "-";
  const fix = row.cells[7]?.innerText.trim() || "-";
  const axis = row.cells[8]?.innerText.trim() || "-";

  const comboParts = [layer, lock, main, transcend, metal, aux]
    .filter(item => item && item !== "-")
    .join(" / ");

  return {
    model,
    combo: comboParts || "-",
    fix,
    axis,
    result,
    note: note || "",
    date: new Date().toLocaleDateString("zh-TW"),
    comboKey: getConfigComboKeyFromRow(row)
  };
}

function buildHistoryRecordFromConfigValues(data) {
  const comboParts = [
    data.layer,
    data.lockPart,
    data.mainPart,
    data.transcendPart,
    data.metalPart,
    data.auxPart
  ]
    .filter(item => item && item !== "-")
    .join(" / ");

  const comboKey = getConfigComboKeyFromValues([
    data.layer,
    data.lockPart,
    data.mainPart,
    data.transcendPart,
    data.metalPart,
    data.auxPart,
    data.fix,
    data.axis
  ]);

  return {
    model: data.model,
    combo: comboParts || "-",
    fix: data.fix || "-",
    axis: data.axis || "-",
    result: "",
    note: "",
    date: "",
    comboKey
  };
}

function createHistoryRow(record) {
  const tbody = document.querySelector("#historyTable tbody");
  if (!tbody) return;

  const row = tbody.insertRow();

  row.dataset.comboKey = record.comboKey || "";

  row.insertCell(0).innerText = record.model || "-";
  row.insertCell(1).innerText = record.combo || "-";
  row.insertCell(2).innerText = record.fix || "-";
  row.insertCell(3).innerText = record.axis || "-";
  row.insertCell(4).innerText = record.result || "-";
  row.insertCell(5).innerText = record.note || "-";
  row.insertCell(6).innerText = record.date || "-";
  row.insertCell(7).innerHTML = isReadOnly() ? "" :
    '<button onclick="restoreHistoryRow(this)">還原</button>' +
    '<button onclick="deleteHistoryRow(this)">刪除</button>';
}

function findHistoryByComboKey(comboKey) {
  if (!comboKey) return null;

  const rows = document.querySelectorAll("#historyTable tbody tr");

  for (const row of rows) {
    if (row.dataset.comboKey === comboKey) {
      return {
        model: row.cells[0]?.innerText.trim() || "",
        combo: row.cells[1]?.innerText.trim() || "",
        fix: row.cells[2]?.innerText.trim() || "",
        axis: row.cells[3]?.innerText.trim() || "",
        result: row.cells[4]?.innerText.trim() || "",
        note: row.cells[5]?.innerText.trim() || "",
        date: row.cells[6]?.innerText.trim() || "",
        comboKey
      };
    }
  }

  return null;
}

function askDeleteReasonForConfig(row) {
  return new Promise(resolve => {
    const modal = document.getElementById("deleteConfigModal");
    const reasonSelect = document.getElementById("deleteReasonSelect");
    const noteInput = document.getElementById("deleteNoteInput");
    const confirmBtn = document.getElementById("deleteConfigConfirmBtn");
    const cancelBtn = document.getElementById("deleteConfigCancelBtn");
    const backdrop = document.getElementById("deleteConfigModalBackdrop");

    reasonSelect.value = "";
    noteInput.value = "";
    reasonSelect.style.borderColor = "";
    modal.style.display = "block";

    function cleanup() {
      modal.style.display = "none";
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      backdrop.removeEventListener("click", onCancel);
    }

    function onConfirm() {
      const reason = reasonSelect.value;
      if (!reason) {
        reasonSelect.style.borderColor = "#ff8787";
        reasonSelect.focus();
        return;
      }
      reasonSelect.style.borderColor = "";
      cleanup();
      if (reason === "打錯，不記錄") {
        resolve(false);
        return;
      }
      const note = noteInput.value.trim();
      resolve(buildHistoryRecordFromConfigRow(row, reason, note));
    }

    function onCancel() {
      cleanup();
      resolve(null);
    }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    backdrop.addEventListener("click", onCancel);
  });
}

window.restoreHistoryRow = function (button) {
  if (!requireLogin()) return;

  const historyRow = button.parentElement.parentElement;
  const comboKey = historyRow.dataset.comboKey || "";

  if (!comboKey) {
    alert("這筆歷史紀錄缺少組合資料，無法還原。");
    return;
  }

  const parts = comboKey.split("|");

  if (parts.length < 8) {
    alert("這筆歷史紀錄格式不完整，無法還原。");
    return;
  }

  const model = normalizeModel(historyRow.cells[0]?.innerText.trim() || "");
  const layer = parts[0] || "-";
  const lockPart = parts[1] || "-";
  const mainPart = parts[2] || "-";
  const transcendPart = parts[3] || "-";
  const metalPart = parts[4] || "-";
  const auxPart = parts[5] || "-";
  const fix = parts[6] || "-";
  const axis = parts[7] || "-";

  if (!model) {
    alert("這筆歷史紀錄缺少型號，無法還原。");
    return;
  }

  const ok = confirm(
    "確定要把這筆歷史紀錄還原到配置紀錄區嗎？\n\n" +
    "型號：" + model + "\n" +
    "組合：" + (historyRow.cells[1]?.innerText.trim() || "-") + "\n" +
    "固鎖：" + fix + "\n" +
    "軸心：" + axis
  );

  if (!ok) return;

  const total = getTotalParts();
  const used = getUsedParts();

  const series = getSeriesFromModel(model);

  const selectedParts = [
    ["上蓋", (series === "CX" && !isRandomBooster(model)) ? "" : layer],
    ["紋章鎖", lockPart === "-" ? "" : lockPart],
    ["主要戰刃", mainPart.includes("/") ? "" : mainPart],
    ["超越戰刃", transcendPart === "-" ? "" : transcendPart],
    ["金屬戰刃", metalPart === "-" ? "" : metalPart],
    ["輔助戰刃", auxPart === "-" ? "" : auxPart],
    ["固鎖", fix === "-" ? "" : fix],
    ["軸心", axis === "-" ? "" : axis]
  ];

  for (const [type, name] of selectedParts) {
    if (!checkStock(type, name, total, used)) return;
  }

  const cells = [
    model,
    layer,
    lockPart,
    mainPart,
    transcendPart,
    metalPart,
    auxPart,
    fix,
    axis
  ];

  const mainStockName =
    transcendPart !== "-" && metalPart !== "-"
      ? ""
      : mainPart;

  createConfigRow(cells, mainStockName);

  sortBeybladeTable();
  refreshSelectors();
  saveData();
};

window.deleteHistoryRow = function (button) {
  if (!requireLogin()) return;

  const ok = confirm("確定要刪除這筆歷史測試紀錄嗎？");

  if (!ok) return;

  button.parentElement.parentElement.remove();
  saveData();
};

/* ====== 刪除功能 ====== */

window.deleteRow = async function (button) {
  if (!requireLogin()) return;

  const row = button.parentElement.parentElement;
  const table = row.closest("table");
  const tableId = table ? table.id : "";

  let deleteName = "這筆資料";

  if (tableId === "beybladeTable") {
    const model = row.cells[0]?.innerText.trim() || "";
    const layer = row.cells[1]?.innerText.trim() || "";
    if (model || layer) deleteName = `${model} ${layer}`.trim();
    const ok = confirm(`確定要刪除「${deleteName}」嗎？`);
    if (!ok) return;
  }

  else if (tableId === "partTable") {
    const type = row.cells[0]?.innerText.trim() || "";
    const name = row.cells[1]?.innerText.trim() || "";
    const count = row.cells[2]?.innerText.trim() || "";
    if (type || name) deleteName = `${type}：${name}，數量 ${count}`;
    const ok = confirm(`確定要刪除「${deleteName}」嗎？`);
    if (!ok) return;
  }

  else if (tableId === "configTable") {
    const historyRecord = await askDeleteReasonForConfig(row);
    if (historyRecord === null) return;
    if (historyRecord) createHistoryRow(historyRecord);
  }

  row.remove();
  sortBeybladeTable();
  refreshSelectors();
  saveData();
};

/* ====== 表格內修改功能 ====== */

window.editRow = function (button, tableType) {
    if (!requireLogin()) return;
  const row = button.parentElement.parentElement;
    if (row.dataset.editing === "true") return;

  row.dataset.editing = "true";
  row.classList.add("editing-row");

  const originalCells = Array.from(row.cells)
    .slice(0, -1)
    .map(cell => cell.innerText.trim());

  const originalMainStockName =
    row.cells[3]?.dataset.stockName ??
    row.cells[3]?.innerText.trim() ??
    "";

  row.dataset.originalCells = JSON.stringify(originalCells);
  row.dataset.originalMainStockName = originalMainStockName;

  const lastIndex = row.cells.length - 1;

  for (let i = 0; i < lastIndex; i++) {
    if (tableType === "part" && i === 0) {
      const currentType = row.cells[i].innerText.trim();

      row.cells[i].innerHTML = `
        <select>
          <option value="上蓋">上蓋</option>
          <option value="紋章鎖">紋章鎖</option>
          <option value="主要戰刃">主要戰刃</option>
          <option value="超越戰刃">超越戰刃</option>
          <option value="金屬戰刃">金屬戰刃</option>
          <option value="輔助戰刃">輔助戰刃</option>
          <option value="固鎖">固鎖</option>
          <option value="軸心">軸心</option>
        </select>
      `;

      row.cells[i].querySelector("select").value = currentType;
    }

    else if (tableType === "part" && i === 2) {
      const currentText = row.cells[i].innerText.trim();

      row.cells[i].innerHTML = `
        <input type="number" min="1" step="1" value="${escapeHtml(currentText)}">
      `;
    }

    else if (tableType === "config" && i === 0) {
      const currentText = row.cells[i].innerText.trim();

      row.cells[i].innerHTML = `
        <input type="text" value="${escapeHtml(currentText)}">
      `;
    }

    else if (tableType === "config" && configEditColumnMap[i]) {
      const type = configEditColumnMap[i];
      const currentText = getConfigEditCurrentValue(row, i);

      row.cells[i].innerHTML = isCxAutoLayerEdit(row, i)
        ? buildCxAutoLayerEditControl()
        : buildConfigEditSelect(type, currentText, row);
    }

    else {
      const currentText = row.cells[i].innerText.trim();

      row.cells[i].innerHTML = `
        <input type="text" value="${escapeHtml(currentText)}">
      `;
    }
  }

  row.cells[lastIndex].innerHTML = getEditingButtons(tableType);
};

window.saveEditRow = function (button, tableType) {
  if (!requireLogin()) return;
  
  if (tableType === "config") {
    saveConfigEditRow(button);
    return;
  }

  const ok = confirm("確定要保存這次修改嗎？");

  if (!ok) return;

  const row = button.parentElement.parentElement;
  const lastIndex = row.cells.length - 1;

  const newValues = [];

  for (let i = 0; i < lastIndex; i++) {
    const input = row.cells[i].querySelector("input");
    const select = row.cells[i].querySelector("select");

    if (input) {
      newValues.push(input.value.trim() || "-");
    } else if (select) {
      newValues.push(select.value);
    } else {
      newValues.push(row.cells[i].innerText.trim() || "-");
    }
  }

  if (tableType === "part") {
    const partName = newValues[1];
    const partCount = Number(newValues[2]);

    if (!partName || partName === "-") {
      alert("零件名稱不能空白");
      return;
    }

    if (!partCount || partCount <= 0) {
      alert("數量必須大於 0");
      return;
    }

    newValues[2] = String(partCount);
  }
  
  if (tableType === "beyblade") {
  newValues[0] = normalizeModel(newValues[0]);
  }

  for (let i = 0; i < lastIndex; i++) {
    row.cells[i].innerText = newValues[i];
  }

  if (tableType === "beyblade") {
    updateMainStockName(row);
    sortBeybladeTable();
  }

  row.cells[lastIndex].innerHTML = getOperationButtons(tableType);

  delete row.dataset.originalCells;
  delete row.dataset.originalMainStockName;
  delete row.dataset.editing;
  row.classList.remove("editing-row");

  refreshSelectors();
  saveData();
};

window.cancelEditRow = function (button, tableType) {
  const ok = confirm("確定要取消這次修改嗎？");

  if (!ok) return;

  const row = button.parentElement.parentElement;
  const originalCells = JSON.parse(row.dataset.originalCells || "[]");
  const originalMainStockName = row.dataset.originalMainStockName ?? "";

  rebuildRow(row, originalCells, originalMainStockName, tableType);

  delete row.dataset.originalCells;
  delete row.dataset.originalMainStockName;
  delete row.dataset.editing;
  row.classList.remove("editing-row");

  sortBeybladeTable();
  refreshSelectors();
};

function rebuildRow(row, cells, mainStockName, tableType) {
  while (row.cells.length > 0) {
    row.deleteCell(0);
  }

  cells.forEach((text, index) => {
    const cell = row.insertCell(index);
    cell.innerText = text;

    if ((tableType === "beyblade" || tableType === "config") && index === 3) {
      cell.dataset.stockName = mainStockName;
    }
  });

  const operationIndex = cells.length;
  row.insertCell(operationIndex).innerHTML = getOperationButtons(tableType);
}

function updateMainStockName(row) {
  const mainCell = row.cells[3];
  const main = row.cells[3]?.innerText.trim() || "-";
  const transcend = row.cells[4]?.innerText.trim() || "-";
  const metal = row.cells[5]?.innerText.trim() || "-";

  if (!mainCell) return;

  if (transcend !== "-" && metal !== "-") {
    mainCell.dataset.stockName = "";
  } else {
    mainCell.dataset.stockName = main;
  }
}

function getConfigEditCurrentValue(row, index) {
  const currentText = row.cells[index]?.innerText.trim() || "";
  const model = normalizeModel(row.cells[0]?.innerText.trim() || "");

  if (getSeriesFromModel(model) !== "CX" || isRandomBooster(model)) {
    return currentText;
  }

  if (index === 1) {
    return "";
  }

  if (index === 3) {
    const transcend = row.cells[4]?.innerText.trim() || "-";
    const metal = row.cells[5]?.innerText.trim() || "-";

    if (transcend !== "-" && metal !== "-") {
      return "";
    }
  }

  return currentText;
}

function isCxAutoLayerEdit(row, index) {
  if (index !== 1) return false;

  const model = normalizeModel(row.cells[0]?.innerText.trim() || "");

  return getSeriesFromModel(model) === "CX" && !isRandomBooster(model);
}

function buildCxAutoLayerEditControl() {
  return `
    <select>
      <option value="">儲存後自動產生</option>
    </select>
  `;
}

function buildConfigEditSelect(type, currentValue, editingRow) {
  const total = getTotalParts();
  const used = getUsedPartsExceptRow(editingRow);
  const model = normalizeModel(editingRow.cells[0]?.innerText.trim() || "");
  const axis = getEditCellValue(editingRow, 8) || editingRow.cells[8]?.innerText.trim() || "";

  let html = `<select>`;
  html += `<option value="">不選擇</option>`;

  const names = new Set();

  if (type === "固鎖" && shouldUseNoRatchet(model, axis)) {
    names.add("-");
  }

  Object.keys(total[type] || {}).forEach(name => {
    const totalCount = total[type][name] || 0;
    const usedCount = used[type][name] || 0;
    const remainCount = totalCount - usedCount;

    if (remainCount > 0 || name === currentValue) {
      names.add(name);
    }
  });

  if (currentValue && currentValue !== "-") {
    names.add(currentValue);
  }

  names.forEach(name => {
    const selected = name === currentValue ? "selected" : "";

    html += `
      <option value="${escapeHtml(name)}" ${selected}>
        ${escapeHtml(name)}
      </option>
    `;
  });

  html += `</select>`;

  return html;
}

function getUsedPartsExceptRow(excludedRow) {
  const used = {};

  partTypes.forEach(type => {
    used[type] = {};
  });

  const configRows = document.querySelectorAll("#configTable tbody tr");

  configRows.forEach(row => {
    if (row === excludedRow) return;

    partTypes.forEach(type => {
      const cellIndex = configCellMap[type];
      const cell = row.cells[cellIndex];
      const name = getStockNameFromCell(cell);

      addStock(used, type, name, 1);
    });
  });

  return used;
}

function saveConfigEditRow(button) {
  const ok = confirm("確定要保存這次修改嗎？");

  if (!ok) return;

  const row = button.parentElement.parentElement;

  const model = normalizeModel(getEditCellValue(row, 0));

  if (!model) {
    alert("請輸入陀螺型號！");
    return;
  }

  const series = getSeriesFromModel(model);

  const layerSel = getEditCellValue(row, 1);
  const lockSel = getEditCellValue(row, 2);
  const mainSel = getEditCellValue(row, 3);
  const transcendSel = getEditCellValue(row, 4);
  const metalSel = getEditCellValue(row, 5);
  const auxSel = getEditCellValue(row, 6);
  let fixSel = getEditCellValue(row, 7);
  const axisSel = getEditCellValue(row, 8);
  fixSel = getNoRatchetFixValue(model, axisSel, fixSel);

  if (!validateRatchetRules(model, axisSel, fixSel)) return;

  let layer = "-";
  let lockPart = "-";
  let mainPart = "-";
  let transcendPart = "-";
  let metalPart = "-";
  let auxPart = "-";

  const isBooster = isRandomBooster(model);

  if (series === "CX" && !isBooster) {
    if (!lockSel || !auxSel || !fixSel || !axisSel) {
      alert("CX 系列請選擇：紋章鎖、輔助戰刃、固鎖、軸心");
      return;
    }

    const hasSplitMainBlade = Boolean(transcendSel && metalSel);
    const hasPartialSplitMainBlade = Boolean(transcendSel || metalSel) && !hasSplitMainBlade;
    const useNormalMainBlade = Boolean(mainSel && !hasSplitMainBlade && !hasPartialSplitMainBlade);
    const useSplitMainBlade = hasSplitMainBlade;

    if (hasPartialSplitMainBlade || (!useNormalMainBlade && !useSplitMainBlade)) {
      alert("CX 系列主要戰刃請二選一選擇：\n1. 主要戰刃\n2. 超越戰刃 + 金屬戰刃");
      return;
    }

    if (useNormalMainBlade) {
      layer = `${lockSel}${mainSel}${auxSel}`;
      lockPart = lockSel;
      mainPart = mainSel;
      transcendPart = "-";
      metalPart = "-";
      auxPart = auxSel;
    }

    if (useSplitMainBlade) {
      layer = `${lockSel}${metalSel}${transcendSel}${auxSel}`;
      lockPart = lockSel;
      mainPart = `${transcendSel}/${metalSel}`;
      transcendPart = transcendSel;
      metalPart = metalSel;
      auxPart = auxSel;
    }
  } else if (isBooster) {
    if (!fixSel || !axisSel) {
      alert("抽包系列請選擇：固鎖、軸心（其他選填）");
      return;
    }
    layer = layerSel || "-";
    lockPart = lockSel || "-";
    mainPart = mainSel || "-";
    transcendPart = transcendSel || "-";
    metalPart = metalSel || "-";
    auxPart = auxSel || "-";
  } else {
    if (!layerSel || !fixSel || !axisSel) {
      alert("BX / UX 系列請選擇：上蓋、固鎖、軸心");
      return;
    }
    layer = layerSel;
  }

  const total = getTotalParts();
  const used = getUsedPartsExceptRow(row);

  const selectedParts = [
    ["上蓋", (series === "CX" && !isBooster) ? "" : layerSel],
    ["紋章鎖", lockPart === "-" ? "" : lockPart],
    ["主要戰刃", mainPart.includes("/") ? "" : mainPart],
    ["超越戰刃", transcendPart === "-" ? "" : transcendPart],
    ["金屬戰刃", metalPart === "-" ? "" : metalPart],
    ["輔助戰刃", auxPart === "-" ? "" : auxPart],
    ["固鎖", fixSel === "-" ? "" : fixSel],
    ["軸心", axisSel]
  ];

  for (const [type, name] of selectedParts) {
    if (!checkStock(type, name, total, used)) return;
  }

  row.cells[0].innerText = model;
  row.cells[1].innerText = layer;
  row.cells[2].innerText = lockPart;

  row.cells[3].innerText = mainPart;

  if (transcendPart !== "-" && metalPart !== "-") {
    row.cells[3].dataset.stockName = "";
  } else {
    row.cells[3].dataset.stockName = mainPart;
  }

  row.cells[4].innerText = transcendPart;
  row.cells[5].innerText = metalPart;
  row.cells[6].innerText = auxPart;
  row.cells[7].innerText = fixSel;
  row.cells[8].innerText = axisSel;

  row.cells[9].innerHTML = getOperationButtons("config");

  delete row.dataset.originalCells;
  delete row.dataset.originalMainStockName;
  delete row.dataset.editing;
  row.classList.remove("editing-row");

  refreshSelectors();
  saveData();
}

function getEditCellValue(row, index) {
  const input = row.cells[index].querySelector("input");
  const select = row.cells[index].querySelector("select");

  if (input) return input.value.trim();
  if (select) return select.value.trim();

  return row.cells[index].innerText.trim();
}
/* ====== 儲存資料：改存到登入者自己的 Firestore ====== */

function getTableData(tableId, hasStockName = false) {
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  const data = [];

  rows.forEach(row => {
    const cells = Array.from(row.cells).map(cell => cell.innerText.trim());

    const item = {
      cells: cells.slice(0, -1)
    };

    if (hasStockName) {
      item.mainStockName =
        row.cells[3]?.dataset.stockName ??
        row.cells[3]?.innerText.trim() ??
        "";
    }

    data.push(item);
  });

  return data;
}

function collectCurrentData() {
  sortBeybladeTable();

  return {
    beybladeTable: getTableData("beybladeTable", true),
    partTable: getTableData("partTable", false),
    configTable: getTableData("configTable", true),
    historyTable: getHistoryData(),
    ownerUid: currentUser ? currentUser.uid : "",
    ownerEmail: currentUser ? currentUser.email || "" : "",
    updatedAt: Date.now()
  };
}

function getHistoryData() {
  const rows = document.querySelectorAll("#historyTable tbody tr");
  const data = [];

  rows.forEach(row => {
    data.push({
      model: row.cells[0]?.innerText.trim() || "",
      combo: row.cells[1]?.innerText.trim() || "",
      fix: row.cells[2]?.innerText.trim() || "",
      axis: row.cells[3]?.innerText.trim() || "",
      result: row.cells[4]?.innerText.trim() || "",
      note: row.cells[5]?.innerText.trim() || "",
      date: row.cells[6]?.innerText.trim() || "",
      comboKey: row.dataset.comboKey || ""
    });
  });

  return data;
}

async function saveData() {
if (isApplyingRemoteData) return;

const userDocRef = getUserDocRef();

if (!userDocRef) {
console.log("尚未登入，暫不儲存");
setSyncStatus("尚未登入，資料不會儲存到雲端", "muted");
return;
}

const data = collectCurrentData();

try {
setSyncStatus("儲存中...", "saving");

await setDoc(userDocRef, data);

setSyncStatus("已儲存", "saved");

} catch (error) {
console.error("Firestore 儲存失敗：", error);
alert("Firestore 儲存失敗：" + error.message);
setSyncStatus("儲存失敗", "error");
}
}


/* ====== 載入資料 ====== */

function createBeybladeRow(cells, mainStockName) {
  const tbody = document.querySelector("#beybladeTable tbody");
  const row = tbody.insertRow();

  cells.forEach((text, index) => {
    const cell = row.insertCell(index);
    cell.innerText = text;

    if (index === 3 && mainStockName !== undefined) {
      cell.dataset.stockName = mainStockName;
    }
  });

  row.insertCell(9).innerHTML = getOperationButtons("beyblade");
}

function createPartRow(cells) {
  const tbody = document.querySelector("#partTable tbody");
  const row = tbody.insertRow();

  cells.forEach((text, index) => {
    row.insertCell(index).innerText = text;
  });

  row.insertCell(3).innerHTML = getOperationButtons("part");
}

function createConfigRow(cells, mainStockName) {
  const tbody = document.querySelector("#configTable tbody");
  const row = tbody.insertRow();

  cells.forEach((text, index) => {
    const cell = row.insertCell(index);
    cell.innerText = text;

    if (index === 3 && mainStockName !== undefined) {
      cell.dataset.stockName = mainStockName;
    }
  });

  row.insertCell(9).innerHTML = getOperationButtons("config");
}

function clearAllTables() {
  document.querySelector("#beybladeTable tbody").innerHTML = "";
  document.querySelector("#partTable tbody").innerHTML = "";
  document.querySelector("#configTable tbody").innerHTML = "";

  const historyBody = document.querySelector("#historyTable tbody");
  if (historyBody) historyBody.innerHTML = "";
}

function applyDataToTables(data) {
  isApplyingRemoteData = true;

  clearAllTables();

  if (!data) {
    refreshSelectors();
    isApplyingRemoteData = false;
    return;
  }

  if (data.beybladeTable) {
    data.beybladeTable.forEach(item => {
      createBeybladeRow(item.cells, item.mainStockName);
    });
  }

  if (data.partTable) {
    data.partTable.forEach(item => {
      createPartRow(item.cells);
    });
  }
    if (data.historyTable) {
    data.historyTable.forEach(item => {
      createHistoryRow(item);
    });
  }

  if (data.configTable) {
    data.configTable.forEach(item => {
      createConfigRow(item.cells, item.mainStockName);
    });
  }

  const changedByNormalize = normalizeAllModelCells();

  sortBeybladeTable();
  refreshSelectors();

  isApplyingRemoteData = false;

  if (changedByNormalize) {
    saveData();
  }
}

function startCloudListener() {
  const userDocRef = getUserDocRef();

  if (!userDocRef) return;

  if (unsubscribeCloudData) {
    unsubscribeCloudData();
    unsubscribeCloudData = null;
  }

  unsubscribeCloudData = onSnapshot(
    userDocRef,
    snapshot => {
      if (!snapshot.exists()) {
        clearAllTables();
        refreshSelectors();
        setSyncStatus("目前沒有資料，可以開始新增", "muted");
        return;
      }

      applyDataToTables(snapshot.data());
      setSyncStatus("資料已同步", "saved");
    },
    error => {
      console.error("Firestore 讀取失敗：", error);
      alert("Firestore 讀取失敗：" + error.message);
      setSyncStatus("讀取失敗", "error");
    }
  );
}


/* ====== 第一區：新增陀螺配置 ====== */

window.addRow = function () {
  if (!requireLogin()) return;
  
  const tbody = document.querySelector("#beybladeTable tbody");

  if (!tbody) return;

  const model = normalizeModel(getValue("model"));

  if (!model) {
    alert("請輸入型號");
    return;
  }

  const series = getSeriesFromModel(model);

  const layerInput = getValue("layer");
  const lock = getValue("lock");
  const primaryBlade = getValue("primaryBlade");
  const transcendBlade = getValue("transcendBlade");
  const metalBlade = getValue("metalBlade");
  const aux = getValue("aux");
  let fix = getValue("fix");
  const axis = getValue("axis");
  fix = getNoRatchetFixValue(model, axis, fix);

  if (!validateRatchetRules(model, axis, fix)) return;

  let layer = "-";
  let lockPart = "-";
  let mainPart = "-";
  let transcendPart = "-";
  let metalPart = "-";
  let auxPart = "-";

  const isBooster = isRandomBooster(model);

  if (series === "CX" && !isBooster) {
    if (!lock || !aux || !fix || !axis) {
      alert("CX 系列請填：紋章鎖、輔助戰刃、固鎖、軸心");
      return;
    }

    const useNormalMainBlade = primaryBlade && !transcendBlade && !metalBlade;
    const useSplitMainBlade = !primaryBlade && transcendBlade && metalBlade;

    if (!useNormalMainBlade && !useSplitMainBlade) {
      alert("CX 系列主要戰刃請二選一填寫：\n1. 主要戰刃\n2. 超越戰刃 + 金屬戰刃");
      return;
    }

    if (useNormalMainBlade) {
      layer = `${lock}${primaryBlade}${aux}`;
      lockPart = lock;
      mainPart = primaryBlade;
      transcendPart = "-";
      metalPart = "-";
      auxPart = aux;
    }

    if (useSplitMainBlade) {
      layer = `${lock}${metalBlade}${transcendBlade}${aux}`;
      lockPart = lock;
      mainPart = `${transcendBlade}/${metalBlade}`;
      transcendPart = transcendBlade;
      metalPart = metalBlade;
      auxPart = aux;
    }
  } else if (isBooster) {
    // 抽包系列：只需要固鎖和軸心，其餘選填
    if (!fix || !axis) {
      alert("抽包系列請填：固鎖、軸心（其他欄位選填）");
      return;
    }
    layer = layerInput || "-";
    lockPart = lock || "-";
    mainPart = primaryBlade || "-";
    transcendPart = transcendBlade || "-";
    metalPart = metalBlade || "-";
    auxPart = aux || "-";
  } else {
    if (!layerInput || !fix || !axis) {
      alert("BX / UX 系列請填：上蓋、固鎖、軸心");
      return;
    }
    layer = layerInput;
  }

  const row = tbody.insertRow();

  row.insertCell(0).innerText = model;
  row.insertCell(1).innerText = layer;
  row.insertCell(2).innerText = lockPart;

  const mainCell = row.insertCell(3);
  mainCell.innerText = mainPart;

  if (transcendPart !== "-" && metalPart !== "-") {
    mainCell.dataset.stockName = "";
  } else {
    mainCell.dataset.stockName = mainPart;
  }

  row.insertCell(4).innerText = transcendPart;
  row.insertCell(5).innerText = metalPart;
  row.insertCell(6).innerText = auxPart;
  row.insertCell(7).innerText = fix;
  row.insertCell(8).innerText = axis;

  row.insertCell(9).innerHTML = getOperationButtons("beyblade");

  clearFirstAreaInputs();
  sortBeybladeTable();
  refreshSelectors();
  saveData();
};

/* ====== 第二區：新增零件庫存 ====== */

window.addPart = function () {
  if (!requireLogin()) return;
  
  const type = document.getElementById("partType").value;
  const nameInput = document.getElementById("partName");
  const countInput = document.getElementById("partCount");

  const name = nameInput.value.trim();
  const count = Number(countInput.value || 0);

  if (!type || !name) {
    alert("請輸入零件名稱");
    return;
  }

  if (!Number.isInteger(count) || count <= 0) {
    alert("數量必須是大於 0 的整數");
    return;
  }

  const tbody = document.querySelector("#partTable tbody");

  if (!tbody) return;

  const row = tbody.insertRow();

  row.insertCell(0).innerText = type;
  row.insertCell(1).innerText = name;
  row.insertCell(2).innerText = String(count);
  row.insertCell(3).innerHTML = getOperationButtons("part");

  nameInput.value = "";
  countInput.value = "";

  refreshSelectors();
  saveData();
};

/* ====== 庫存計算 ====== */

function getTotalParts() {
  const total = {};

  partTypes.forEach(type => {
    total[type] = {};
  });

  const beybladeRows = document.querySelectorAll("#beybladeTable tbody tr");

  beybladeRows.forEach(row => {
    const model = row.cells[0].innerText.trim();
    const series = getSeriesFromModel(model);

    partTypes.forEach(type => {
      const cellIndex = beybladeCellMap[type];
      const cell = row.cells[cellIndex];
      const name = getStockNameFromCell(cell);

      if (series === "CX" && type === "上蓋" && !isRandomBooster(model)) {
        return;
      }

      addStock(total, type, name, 1);
    });
  });

  const partRows = document.querySelectorAll("#partTable tbody tr");

  partRows.forEach(row => {
    const type = row.cells[0].innerText.trim();
    const name = row.cells[1].innerText.trim();
    const count = Number(row.cells[2].innerText.trim() || 0);

    if (partTypes.includes(type)) {
      addStock(total, type, name, count);
    }
  });

  return total;
}

function getUsedParts() {
  const used = {};

  partTypes.forEach(type => {
    used[type] = {};
  });

  const configRows = document.querySelectorAll("#configTable tbody tr");

  configRows.forEach(row => {
    partTypes.forEach(type => {
      const cellIndex = configCellMap[type];
      const cell = row.cells[cellIndex];
      const name = getStockNameFromCell(cell);

      addStock(used, type, name, 1);
    });
  });

  return used;
}

function setUiSummaryValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function updateUiSummaries() {
  const collectionRows = document.querySelectorAll("#beybladeTable tbody tr");
  const inventoryRows = document.querySelectorAll("#partTable tbody tr");
  const configRows = document.querySelectorAll("#configTable tbody tr");
  const historyRows = document.querySelectorAll("#historyTable tbody tr");
  const inventoryByPart = new Map();
  let inventoryTotal = 0;

  inventoryRows.forEach(row => {
    const type = row.cells[0]?.innerText.trim() || "";
    const name = row.cells[1]?.innerText.trim() || "";
    const count = Number(row.cells[2]?.innerText.trim() || 0);
    if (!type || !name || !Number.isFinite(count)) return;

    const key = `${type}\u0000${name}`;
    inventoryByPart.set(key, (inventoryByPart.get(key) || 0) + count);
    inventoryTotal += count;
  });

  const usedParts = getUsedParts();
  let inventoryUsed = 0;

  inventoryByPart.forEach((count, key) => {
    const [type, name] = key.split("\u0000");
    inventoryUsed += Math.min(count, usedParts[type]?.[name] || 0);
  });

  setUiSummaryValue("collectionCount", collectionRows.length);
  setUiSummaryValue("inventoryKinds", inventoryByPart.size);
  setUiSummaryValue("inventoryKindSummary", inventoryByPart.size);
  setUiSummaryValue("inventoryTotal", inventoryTotal);
  setUiSummaryValue("inventoryUsed", inventoryUsed);
  setUiSummaryValue("inventoryAvailable", Math.max(0, inventoryTotal - inventoryUsed));
  setUiSummaryValue("configCount", configRows.length);
  setUiSummaryValue("historyCount", historyRows.length);
}

function updateResponsiveTableCells() {
  ["beybladeTable", "configTable", "historyTable"].forEach(tableId => {
    const table = document.getElementById(tableId);
    if (!table) return;

    const labels = Array.from(table.querySelectorAll("thead th"), th => th.textContent.trim());

    table.querySelectorAll("tbody tr").forEach(row => {
      const cells = Array.from(row.cells);
      const model = cells[0]?.textContent.trim() || "";
      const seriesMatch = model.toUpperCase().match(/^(BX|UX|CX)/);
      const series = seriesMatch ? seriesMatch[1] : "OTHER";

      row.dataset.series = series;
      if (cells[0]) cells[0].dataset.series = series;

      if (tableId === "configTable") {
        const layer = cells[1]?.textContent.trim() || "";
        const summary = cells
          .slice(1, 9)
          .map(cell => cell.textContent.trim())
          .filter(value => value && value !== "-")
          .join(" · ");

        if (cells[0]) {
          cells[0].dataset.cardTitle = [model, layer !== "-" ? layer : ""]
            .filter(Boolean)
            .join(" ");
        }
        if (cells[1]) cells[1].dataset.cardSummary = summary || "-";
      }

      if (tableId === "historyTable") {
        const result = cells[4]?.textContent.trim() || "";
        row.dataset.resultTone = result.includes("不好")
          ? "bad"
          : result.includes("好用")
            ? "good"
            : "neutral";
      }

      cells.forEach((cell, index) => {
        cell.dataset.label = labels[index] || "";

        const isOperationCell = index === cells.length - 1;
        const hasEditor = Boolean(cell.querySelector("input, select, textarea"));
        const value = cell.textContent.trim();
        const isEmptyValue = !isOperationCell
          && !hasEditor
          && !cell.hasAttribute("colspan")
          && (!value || value === "-");

        cell.classList.toggle("empty-value-cell", isEmptyValue);
      });
    });
  });
}

function installUiSummaryObservers() {
  const refreshUi = () => {
    updateUiSummaries();
    updateResponsiveTableCells();
  };

  ["beybladeTable", "partTable", "configTable", "historyTable"].forEach(tableId => {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;

    const observer = new MutationObserver(refreshUi);
    observer.observe(tbody, { childList: true, subtree: true, characterData: true });
  });

  refreshUi();
}

function updateNoRatchetConfigOption() {
  const modelInput = document.getElementById("confModel");
  const fixSelect = document.getElementById(selectorMap["固鎖"]);
  const axisSelect = document.getElementById(selectorMap["軸心"]);

  if (!modelInput || !fixSelect) return;

  const noRatchet = shouldUseNoRatchet(modelInput.value, axisSelect?.value || "");
  let option = fixSelect.querySelector('option[value="-"]');

  if (noRatchet) {
    if (!option) {
      option = document.createElement("option");
      option.value = "-";
      option.textContent = "無固鎖";
      fixSelect.insertBefore(option, fixSelect.children[1] || null);
    }

    if (!fixSelect.value) {
      fixSelect.value = "-";
    }

    return;
  }

  if (option) option.remove();
  if (fixSelect.value === "-") fixSelect.value = "";
}

window.refreshSelectors = function () {
  const total = getTotalParts();
  const used = getUsedParts();

  partTypes.forEach(type => {
    const selectId = selectorMap[type];
    const sel = document.getElementById(selectId);

    if (!sel) return;

    const currentValue = sel.value;

    sel.innerHTML = `<option value="">選擇${type}</option>`;

    Object.keys(total[type]).forEach(name => {
      const totalCount = total[type][name] || 0;
      const usedCount = used[type][name] || 0;
      const remainCount = totalCount - usedCount;

      if (remainCount > 0 || name === currentValue) {
        sel.innerHTML += `
          <option value="${escapeHtml(name)}">
            ${escapeHtml(name)}，剩餘 ${remainCount}
          </option>
        `;
      }
    });

    if (currentValue) {
      sel.value = currentValue;
    }
  });

  updateNoRatchetConfigOption();
};

function checkStock(type, name, total, used) {
  if (!name || name === "-") return true;

  const totalCount = total[type][name] || 0;
  const usedCount = used[type][name] || 0;
  const remainCount = totalCount - usedCount;

  if (remainCount <= 0) {
    alert(`${type}「${name}」已經沒有庫存，不能再使用`);
    refreshSelectors();
    return false;
  }

  return true;
}
/* ====== 第三區：新增配置紀錄 ====== */

window.addConfig = function () {
  if (!requireLogin()) return;
  
  const modelInput = document.getElementById("confModel");
  const model = normalizeModel(modelInput.value.trim());

  if (!model) {
    alert("請輸入陀螺型號！");
    return;
  }

  const series = getSeriesFromModel(model);

  const layerSel = document.getElementById("sel上蓋").value;
  const lockSel = document.getElementById("sel紋章鎖").value;
  const mainSel = document.getElementById("sel主要戰刃").value;
  const transcendSel = document.getElementById("sel超越戰刃").value;
  const metalSel = document.getElementById("sel金屬戰刃").value;
  const auxSel = document.getElementById("sel輔助戰刃").value;
  let fixSel = document.getElementById("sel固鎖").value;
  const axisSel = document.getElementById("sel軸心").value;
  fixSel = getNoRatchetFixValue(model, axisSel, fixSel);

  if (!validateRatchetRules(model, axisSel, fixSel)) return;

  let layer = "-";
  let lockPart = "-";
  let mainPart = "-";
  let transcendPart = "-";
  let metalPart = "-";
  let auxPart = "-";

  const isBooster = isRandomBooster(model);

  if (series === "CX" && !isBooster) {
    if (!lockSel || !auxSel || !fixSel || !axisSel) {
      alert("CX 系列請選擇：紋章鎖、輔助戰刃、固鎖、軸心");
      return;
    }

    const useNormalMainBlade = mainSel && !transcendSel && !metalSel;
    const useSplitMainBlade = !mainSel && transcendSel && metalSel;

    if (!useNormalMainBlade && !useSplitMainBlade) {
      alert("CX 系列主要戰刃請二選一選擇:\n1. 主要戰刃\n2. 超越戰刃 + 金屬戰刃");
      return;
    }

    if (useNormalMainBlade) {
      layer = `${lockSel}${mainSel}${auxSel}`;
      lockPart = lockSel;
      mainPart = mainSel;
      transcendPart = "-";
      metalPart = "-";
      auxPart = auxSel;
    }

    if (useSplitMainBlade) {
      layer = `${lockSel}${metalSel}${transcendSel}${auxSel}`;
      lockPart = lockSel;
      mainPart = `${transcendSel}/${metalSel}`;
      transcendPart = transcendSel;
      metalPart = metalSel;
      auxPart = auxSel;
    }
  } else if (isBooster) {
    if (!fixSel || !axisSel) {
      alert("抽包系列請選擇：固鎖、軸心（其他選填）");
      return;
    }
    layer = layerSel || "-";
    lockPart = lockSel || "-";
    mainPart = mainSel || "-";
    transcendPart = transcendSel || "-";
    metalPart = metalSel || "-";
    auxPart = auxSel || "-";
  } else {
    if (!layerSel || !fixSel || !axisSel) {
      alert("BX / UX 系列請選擇：上蓋、固鎖、軸心");
      return;
    }
    layer = layerSel;
  }

  const total = getTotalParts();
  const used = getUsedParts();

  const selectedParts = [
    ["上蓋", (series === "CX" && !isBooster) ? "" : layerSel],
    ["紋章鎖", lockPart === "-" ? "" : lockPart],
    ["主要戰刃", mainPart.includes("/") ? "" : mainPart],
    ["超越戰刃", transcendPart === "-" ? "" : transcendPart],
    ["金屬戰刃", metalPart === "-" ? "" : metalPart],
    ["輔助戰刃", auxPart === "-" ? "" : auxPart],
    ["固鎖", fixSel === "-" ? "" : fixSel],
    ["軸心", axisSel]
  ];

  for (const [type, name] of selectedParts) {
    if (!checkStock(type, name, total, used)) return;
  }

  const candidateHistory = buildHistoryRecordFromConfigValues({
    model,
    layer,
    lockPart,
    mainPart,
    transcendPart,
    metalPart,
    auxPart,
    fix: fixSel,
    axis: axisSel
  });

  const oldHistory = findHistoryByComboKey(candidateHistory.comboKey);

  if (oldHistory) {
    const stillAdd = confirm(
      "這個組合以前測試過！\n\n" +
      `型號：${oldHistory.model}\n` +
      `組合：${oldHistory.combo}\n` +
      `固鎖：${oldHistory.fix}\n` +
      `軸心：${oldHistory.axis}\n` +
      `結果：${oldHistory.result}\n` +
      `備註：${oldHistory.note || "無"}\n` +
      `日期：${oldHistory.date || "無"}\n\n` +
      "是否仍要加入配置表？"
    );

    if (!stillAdd) return;
  }

  const tbody = document.querySelector("#configTable tbody");

  if (!tbody) {
    alert("找不到配置表");
    return;
  }

  const row = tbody.insertRow();

  row.insertCell(0).innerText = model;
  row.insertCell(1).innerText = layer;
  row.insertCell(2).innerText = lockPart;

  const mainCell = row.insertCell(3);
  mainCell.innerText = mainPart;

  if (transcendPart !== "-" && metalPart !== "-") {
    mainCell.dataset.stockName = "";
  } else {
    mainCell.dataset.stockName = mainPart;
  }

  row.insertCell(4).innerText = transcendPart;
  row.insertCell(5).innerText = metalPart;
  row.insertCell(6).innerText = auxPart;
  row.insertCell(7).innerText = fixSel;
  row.insertCell(8).innerText = axisSel;

  row.insertCell(9).innerHTML = getOperationButtons("config");

  modelInput.value = "";

  partTypes.forEach(type => {
    const sel = document.getElementById(selectorMap[type]);
    if (sel) sel.value = "";
  });

  refreshSelectors();
  saveData();
};

/* ====== 登入狀態顯示 ====== */

function setSyncStatus(text, type = "muted") {
  const el = document.getElementById("syncStatus");
  if (!el) return;

  el.textContent = text;

  el.classList.remove(
    "status-muted",
    "status-saving",
    "status-saved",
    "status-error",
    "status-login"
  );

  el.classList.add(`status-${type}`);
}

function updateAuthUI(user) {
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userInfo = document.getElementById("userInfo");
  const userEmail = document.getElementById("userEmail");
  const adminPanel = document.getElementById("adminPanel");
  const adminVisible = Boolean(user && isAdmin());

  setAdminMenuVisibility(adminVisible);

  if (user) {
    if (googleLoginBtn) googleLoginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (userInfo) userInfo.style.display = "block";
    if (userEmail) userEmail.textContent = user.email || "";
    if (adminPanel) adminPanel.style.display = adminVisible ? "block" : "none";
  } else {
    if (googleLoginBtn) googleLoginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userInfo) userInfo.style.display = "none";
    if (userEmail) userEmail.textContent = "";
    if (adminPanel) adminPanel.style.display = "none";
  }
}

/* ====== 管理員：切換檢視使用者 ====== */

window.adminViewUser = async function () {
  if (!isAdmin()) return;

  const targetUid = document.getElementById("adminUidInput")?.value.trim();

  if (!targetUid) {
    alert("請輸入使用者 UID");
    return;
  }

  if (targetUid === currentUser.uid) {
    adminViewSelf();
    return;
  }

  viewingUserId = targetUid;

  setSyncStatus(`瀏覽模式：${targetUid}`, "login");

  const returnBtn = document.getElementById("adminReturnBtn");
  if (returnBtn) returnBtn.style.display = "inline-block";

  if (unsubscribeCloudData) {
    unsubscribeCloudData();
    unsubscribeCloudData = null;
  }

  startCloudListener();
};

window.adminViewSelf = function () {
  if (!isAdmin()) return;

  viewingUserId = null;

  const returnBtn = document.getElementById("adminReturnBtn");
  if (returnBtn) returnBtn.style.display = "none";

  const uidInput = document.getElementById("adminUidInput");
  if (uidInput) uidInput.value = "";

  setSyncStatus("已回到自己的資料", "saved");

  if (unsubscribeCloudData) {
    unsubscribeCloudData();
    unsubscribeCloudData = null;
  }

  startCloudListener();
};

/* ====== Google 登入 / 登出 ====== */

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
/* ====== 初始化 ====== */

document.addEventListener("DOMContentLoaded", function () {
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const partCountInput = document.getElementById("partCount");
  const configModelInput = document.getElementById("confModel");
  const configAxisSelect = document.getElementById(selectorMap["軸心"]);

  if (partCountInput) {
    preventInvalidPartCountInput(partCountInput);
  }

  if (configModelInput) {
    configModelInput.addEventListener("input", updateNoRatchetConfigOption);
    configModelInput.addEventListener("change", updateNoRatchetConfigOption);
  }

  if (configAxisSelect) {
    configAxisSelect.addEventListener("change", updateNoRatchetConfigOption);
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", loginWithGoogle);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutGoogle);
  }

  clearAllTables();
  refreshSelectors();
  installUiSummaryObservers();
  setSyncStatus("請先使用 Google 登入", "muted");
  installConfigSort();

  onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAuthUI(user);

    if (unsubscribeCloudData) {
      unsubscribeCloudData();
      unsubscribeCloudData = null;
    }

    if (user) {
      setSyncStatus("已登入，正在載入雲端資料...", "login");
      startCloudListener();
    } else {
      clearAllTables();
      refreshSelectors();
      setSyncStatus("尚未登入", "muted");
    }
  });
});
