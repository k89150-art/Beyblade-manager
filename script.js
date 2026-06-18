import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

import {
  getDatabase,
  ref,
  get
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js";

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

/*
  舊 Firebase：只用來匯入你原本已經記錄好的 Realtime Database 資料
*/
const oldFirebaseConfig = {
  apiKey: "AIzaSyAi_TtnfCr5DOCIkxWIf2yTkBoH9MWTchA",
  authDomain: "beyblade-wangbaboa.firebaseapp.com",
  databaseURL: "https://beyblade-wangbaboa-default-rtdb.firebaseio.com",
  projectId: "beyblade-wangbaboa",
  storageBucket: "beyblade-wangbaboa.firebasestorage.app",
  messagingSenderId: "258354745804",
  appId: "1:258354745804:web:56c93832f752d064eacd69"
};

const newApp = initializeApp(newFirebaseConfig, "newApp");
const oldApp = initializeApp(oldFirebaseConfig, "oldApp");

const auth = getAuth(newApp);
const provider = new GoogleAuthProvider();
const db = getFirestore(newApp);
const oldDatabase = getDatabase(oldApp);

/*
  你的舊資料路徑。
  你的網頁用 chris。
  朋友的網頁之後改成 friend。
*/
const OLD_USER_ID = "chris";
const OLD_DB_PATH = `beybladeData/${OLD_USER_ID}`;

let currentUser = null;
let unsubscribeCloudData = null;
let isApplyingRemoteData = false;

function getUserDocRef() {
  if (!currentUser) return null;
  return doc(db, "users", currentUser.uid, "appData", "main");
}

function requireLogin() {
  if (!currentUser) {
    alert("請先使用 Google 登入，才能操作資料。");
    setSyncStatus("請先登入後再操作", "muted");
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

function getSeriesFromModel(model) {
  const text = model.trim().toUpperCase();

  if (text.startsWith("CX")) return "CX";
  if (text.startsWith("BX")) return "BX";
  if (text.startsWith("UX")) return "UX";

  return "OTHER";
}

/* ====== 第一區排序：UX → BX → CX → 其他 ====== */

function sortBeybladeTable() {
  const tbody = document.querySelector("#beybladeTable tbody");
  if (!tbody) return;

  const order = {
    UX: 1,
    BX: 2,
    CX: 3,
    OTHER: 4
  };

  const rows = Array.from(tbody.querySelectorAll("tr"));

  rows.sort((a, b) => {
    const modelA = a.cells[0]?.innerText.trim() || "";
    const modelB = b.cells[0]?.innerText.trim() || "";

    const seriesA = getSeriesFromModel(modelA);
    const seriesB = getSeriesFromModel(modelB);

    const orderA = order[seriesA] || 99;
    const orderB = order[seriesB] || 99;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return modelA.localeCompare(modelB, "zh-Hant", {
      numeric: true,
      sensitivity: "base"
    });
  });

  rows.forEach(row => tbody.appendChild(row));
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
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
  return `
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

/* ====== 刪除功能 ====== */

window.deleteRow = function (button) {
  if (!requireLogin()) return;

  const row = button.parentElement.parentElement;
  const table = row.closest("table");
  const tableId = table ? table.id : "";

  let deleteName = "這筆資料";

  if (tableId === "beybladeTable") {
    const model = row.cells[0]?.innerText.trim() || "";
    const layer = row.cells[1]?.innerText.trim() || "";

    if (model || layer) {
      deleteName = `${model} ${layer}`.trim();
    }
  }

  else if (tableId === "partTable") {
    const type = row.cells[0]?.innerText.trim() || "";
    const name = row.cells[1]?.innerText.trim() || "";
    const count = row.cells[2]?.innerText.trim() || "";

    if (type || name) {
      deleteName = `${type}：${name}，數量 ${count}`;
    }
  }

  else if (tableId === "configTable") {
    const model = row.cells[0]?.innerText.trim() || "";
    const layer = row.cells[1]?.innerText.trim() || "";

    if (model || layer) {
      deleteName = `${model} ${layer}`.trim();
    }
  }

  const ok = confirm(`確定要刪除「${deleteName}」嗎？`);

  if (!ok) return;

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
      const currentText = row.cells[i].innerText.trim();

      row.cells[i].innerHTML = buildConfigEditSelect(type, currentText, row);
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

function buildConfigEditSelect(type, currentValue, editingRow) {
  const total = getTotalParts();
  const used = getUsedPartsExceptRow(editingRow);

  let html = `<select>`;
  html += `<option value="">不選擇</option>`;

  const names = new Set();

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
  const fixSel = getEditCellValue(row, 7);
  const axisSel = getEditCellValue(row, 8);

  let layer = "-";
  let lockPart = "-";
  let mainPart = "-";
  let transcendPart = "-";
  let metalPart = "-";
  let auxPart = "-";

  if (series === "CX") {
    if (!lockSel || !auxSel || !fixSel || !axisSel) {
      alert("CX 系列請選擇：紋章鎖、輔助戰刃、固鎖、軸心");
      return;
    }

    const useNormalMainBlade = mainSel && !transcendSel && !metalSel;
    const useSplitMainBlade = !mainSel && transcendSel && metalSel;

    if (!useNormalMainBlade && !useSplitMainBlade) {
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
    ["上蓋", series === "CX" ? "" : layerSel],
    ["紋章鎖", lockPart === "-" ? "" : lockPart],
    ["主要戰刃", mainPart.includes("/") ? "" : mainPart],
    ["超越戰刃", transcendPart === "-" ? "" : transcendPart],
    ["金屬戰刃", metalPart === "-" ? "" : metalPart],
    ["輔助戰刃", auxPart === "-" ? "" : auxPart],
    ["固鎖", fixSel],
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
    updatedAt: Date.now()
  };
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

/* ====== 匯入舊 Realtime Database 資料 ====== */

async function migrateOldDataToCurrentUser() {
  if (!currentUser) {
    alert("請先登入 Google 帳號");
    return;
  }

  const ok = confirm(
    "確定要把舊資料匯入到目前登入的 Google 帳號嗎？\n\n" +
    "這會覆蓋目前 Google 帳號雲端裡的資料。"
  );

  if (!ok) return;

  try {
    setSyncStatus("正在讀取舊資料...");

    const oldSnap = await get(ref(oldDatabase, OLD_DB_PATH));

    if (!oldSnap.exists()) {
      alert("找不到舊資料：" + OLD_DB_PATH);
      setSyncStatus("找不到舊資料");
      return;
    }

    const oldData = oldSnap.val();

    await setDoc(getUserDocRef(), {
      beybladeTable: oldData.beybladeTable || [],
      partTable: oldData.partTable || [],
      configTable: oldData.configTable || [],
      migratedFrom: OLD_DB_PATH,
      migratedAt: Date.now(),
      updatedAt: Date.now()
    });

    alert("舊資料匯入成功");
    setSyncStatus("舊資料已匯入到你的 Google 帳號");
  } catch (error) {
    console.error("匯入失敗：", error);
    alert("匯入失敗：" + error.message);
    setSyncStatus("匯入失敗");
  }
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
  const fix = getValue("fix");
  const axis = getValue("axis");

  let layer = "-";
  let lockPart = "-";
  let mainPart = "-";
  let transcendPart = "-";
  let metalPart = "-";
  let auxPart = "-";

  if (series === "CX") {
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

  if (count <= 0) {
    alert("數量必須大於 0");
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

      if (series === "CX" && type === "上蓋") {
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
};

function checkStock(type, name, total, used) {
  if (!name) return true;

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
  const fixSel = document.getElementById("sel固鎖").value;
  const axisSel = document.getElementById("sel軸心").value;

  let layer = "-";
  let lockPart = "-";
  let mainPart = "-";
  let transcendPart = "-";
  let metalPart = "-";
  let auxPart = "-";

  if (series === "CX") {
    if (!lockSel || !auxSel || !fixSel || !axisSel) {
      alert("CX 系列請選擇：紋章鎖、輔助戰刃、固鎖、軸心");
      return;
    }

    const useNormalMainBlade = mainSel && !transcendSel && !metalSel;
    const useSplitMainBlade = !mainSel && transcendSel && metalSel;

    if (!useNormalMainBlade && !useSplitMainBlade) {
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
    ["上蓋", series === "CX" ? "" : layerSel],
    ["紋章鎖", lockPart === "-" ? "" : lockPart],
    ["主要戰刃", mainPart.includes("/") ? "" : mainPart],
    ["超越戰刃", transcendPart === "-" ? "" : transcendPart],
    ["金屬戰刃", metalPart === "-" ? "" : metalPart],
    ["輔助戰刃", auxPart === "-" ? "" : auxPart],
    ["固鎖", fixSel],
    ["軸心", axisSel]
  ];

  for (const [type, name] of selectedParts) {
    if (!checkStock(type, name, total, used)) return;
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
  const migrateOldDataBtn = document.getElementById("migrateOldDataBtn");

  if (user) {
    if (googleLoginBtn) googleLoginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (userInfo) userInfo.style.display = "block";
    if (userEmail) userEmail.textContent = user.email || "";
    if (migrateOldDataBtn) migrateOldDataBtn.style.display = "none";
  } else {
    if (googleLoginBtn) googleLoginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userInfo) userInfo.style.display = "none";
    if (userEmail) userEmail.textContent = "";
    if (migrateOldDataBtn) migrateOldDataBtn.style.display = "none";
  }
}

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
  const migrateOldDataBtn = document.getElementById("migrateOldDataBtn");

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", loginWithGoogle);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutGoogle);
  }

  if (migrateOldDataBtn) {
    migrateOldDataBtn.addEventListener("click", migrateOldDataToCurrentUser);
  }

  clearAllTables();
  refreshSelectors();
  setSyncStatus("請先使用 Google 登入", "muted");

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
