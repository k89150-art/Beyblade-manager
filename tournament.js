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
  getDoc,
  setDoc
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

const SCORE_TYPES = {
  extreme: { label: "極限勝利", point: 3 },
  over: { label: "擊飛勝利", point: 2 },
  burst: { label: "爆裂勝利", point: 2 },
  spin: { label: "迴轉勝利", point: 1 }
};

let currentUser = null;
let mainData = {};
let tournamentRecords = [];
let configOptions = [];
const openedTournamentIds = new Set();

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function generateId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getUserDocRef() {
  if (!currentUser) return null;
  return doc(db, "users", currentUser.uid, "appData", "main");
}

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

function requireLogin() {
  if (!currentUser) {
    alert("請先使用 Google 登入。");
    return false;
  }
  return true;
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

function buildConfigTextFromCells(cells) {
  if (!Array.isArray(cells)) return "";

  const model = cells[0] || "-";
  const comboParts = [cells[1], cells[2], cells[3], cells[4], cells[5], cells[6]]
    .filter(item => item && item !== "-")
    .join(" / ");

  const fix = cells[7] && cells[7] !== "-" ? `固鎖：${cells[7]}` : "";
  const axis = cells[8] && cells[8] !== "-" ? `軸心：${cells[8]}` : "";

  return [model, comboParts, fix, axis]
    .filter(Boolean)
    .join("｜");
}

function rebuildConfigOptions() {
  const rows = mainData.configTable || [];

  configOptions = rows
    .map((item, index) => {
      const text = buildConfigTextFromCells(item.cells || []);
      return {
        id: `config_${index}`,
        text
      };
    })
    .filter(item => item.text);
}

function getDeckValue(tournamentId, slotNumber) {
  const select = document.querySelector(`[data-tournament-id="${tournamentId}"] [data-deck-select="${slotNumber}"]`);
  const custom = document.querySelector(`[data-tournament-id="${tournamentId}"] [data-deck-custom="${slotNumber}"]`);

  const customValue = custom ? custom.value.trim() : "";
  const selectValue = select ? select.value.trim() : "";

  return customValue || selectValue;
}

function buildConfigSelectHtml(attrName, selectedValue = "") {
  let html = `<select ${attrName}>`;
  html += `<option value="">從配置區選擇</option>`;

  configOptions.forEach(option => {
    const selected = option.text === selectedValue ? "selected" : "";
    html += `<option value="${escapeHtml(option.text)}" ${selected}>${escapeHtml(option.text)}</option>`;
  });

  html += `</select>`;
  return html;
}

function calculateMatchScore(match) {
  let myScore = 0;
  let opponentScore = 0;

  (match.rounds || []).forEach(round => {
    const point = Number(round.point || 0);

    if (round.result === "win") {
      myScore += point;
    } else if (round.result === "lose") {
      opponentScore += point;
    }
  });

  return { myScore, opponentScore };
}

function getMatchStatus(match) {
  const score = calculateMatchScore(match);

  if (score.myScore >= 4) return "本局勝利";
  if (score.opponentScore >= 4) return "本局落敗";

  return "進行中";
}

function getMatchStatusClass(match) {
  const status = getMatchStatus(match);

  if (status === "本局勝利") return "win-text";
  if (status === "本局落敗") return "lose-text";

  return "progress-text";
}

function renderTournamentList() {
  const list = document.getElementById("tournamentList");
  if (!list) return;

  if (!currentUser) {
    list.innerHTML = `<div class="empty-state">請先登入後查看參賽紀錄。</div>`;
    return;
  }

  if (!tournamentRecords.length) {
    list.innerHTML = `<div class="empty-state">目前沒有參賽紀錄。</div>`;
    return;
  }

  const sortedRecords = [...tournamentRecords].sort((a, b) => {
    return String(b.date || "").localeCompare(String(a.date || ""));
  });

  list.innerHTML = sortedRecords.map(record => renderTournamentCard(record)).join("");
}

function renderTournamentCard(record) {
  const isOpen = openedTournamentIds.has(record.id);
  const matchCount = (record.matches || []).length;

  return `
    <div class="tournament-card" data-tournament-id="${escapeHtml(record.id)}">
      <div class="tournament-summary">
        <div class="tournament-summary-main">
          <div class="tournament-title">${escapeHtml(record.tournamentName || "-")}</div>
          <div class="tournament-meta">
            <span>日期：${escapeHtml(record.date || "-")}</span>
            <span>地點：${escapeHtml(record.location || "-")}</span>
            <span>名次：${escapeHtml(record.rank || "-")}</span>
            <span>對局數：${matchCount}</span>
          </div>
          ${record.note ? `<div class="tournament-note">備註：${escapeHtml(record.note)}</div>` : ""}
        </div>

        <div class="tournament-actions">
          <button type="button" onclick="toggleTournamentDetail('${escapeHtml(record.id)}')">
            ${isOpen ? "收合" : "展開"}
          </button>
          <button type="button" onclick="editTournament('${escapeHtml(record.id)}')">修改</button>
          <button type="button" onclick="deleteTournament('${escapeHtml(record.id)}')" class="danger-btn">刪除</button>
        </div>
      </div>

      ${isOpen ? renderTournamentDetail(record) : ""}
    </div>
  `;
}

function renderTournamentDetail(record) {
  return `
    <div class="tournament-detail">
      <h4>新增對局</h4>
      ${renderAddMatchForm(record.id)}

      <h4>對局紀錄</h4>
      ${(record.matches || []).length
        ? record.matches.map(match => renderMatchCard(record.id, match)).join("")
        : `<div class="empty-state">尚未新增對局。</div>`
      }
    </div>
  `;
}

function renderAddMatchForm(tournamentId) {
  return `
    <div class="match-form">
      <input type="text" data-match-opponent placeholder="對手名稱">

      <div class="deck-input-group">
        <label>陀螺 1</label>
        ${buildConfigSelectHtml('data-deck-select="1"')}
        <input type="text" data-deck-custom="1" placeholder="或手動輸入陀螺 1">
      </div>

      <div class="deck-input-group">
        <label>陀螺 2</label>
        ${buildConfigSelectHtml('data-deck-select="2"')}
        <input type="text" data-deck-custom="2" placeholder="或手動輸入陀螺 2">
      </div>

      <div class="deck-input-group">
        <label>陀螺 3</label>
        ${buildConfigSelectHtml('data-deck-select="3"')}
        <input type="text" data-deck-custom="3" placeholder="或手動輸入陀螺 3">
      </div>

      <button type="button" onclick="addMatch('${escapeHtml(tournamentId)}')" class="primary-btn">新增對局</button>
    </div>
  `;
}

function renderMatchCard(tournamentId, match) {
  const score = calculateMatchScore(match);
  const status = getMatchStatus(match);
  const statusClass = getMatchStatusClass(match);
  const deck = match.deck || [];

  return `
    <div class="match-card" data-match-id="${escapeHtml(match.id)}">
      <div class="match-header">
        <div>
          <div class="match-title">對手：${escapeHtml(match.opponentName || "-")}</div>
          <div class="match-score">
            比分：我方 ${score.myScore} : ${score.opponentScore} 對手
            <span class="${statusClass}">${status}</span>
          </div>
        </div>
        <div class="match-actions">
          <button type="button" onclick="editMatch('${escapeHtml(tournamentId)}', '${escapeHtml(match.id)}')">修改對局</button>
          <button type="button" onclick="deleteMatch('${escapeHtml(tournamentId)}', '${escapeHtml(match.id)}')" class="danger-btn">刪除對局</button>
        </div>
      </div>

      <div class="deck-list">
        <div><strong>陀螺 1：</strong>${escapeHtml(deck[0]?.configText || "-")}</div>
        <div><strong>陀螺 2：</strong>${escapeHtml(deck[1]?.configText || "-")}</div>
        <div><strong>陀螺 3：</strong>${escapeHtml(deck[2]?.configText || "-")}</div>
      </div>

      <h5>新增回合</h5>
      ${renderAddRoundForm(tournamentId, match)}

      <div class="table-wrap round-table-wrap">
        <table class="round-table">
          <thead>
            <tr>
              <th>回合</th>
              <th>使用陀螺</th>
              <th>得失分</th>
              <th>方式</th>
              <th>分數</th>
              <th>備註</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${(match.rounds || []).length
              ? (match.rounds || []).map(round => renderRoundRow(tournamentId, match.id, round)).join("")
              : `<tr><td colspan="7">尚未新增回合。</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAddRoundForm(tournamentId, match) {
  const deckOptions = (match.deck || [])
    .map(item => item.configText)
    .filter(Boolean);

  return `
    <div class="round-form">
      <select data-round-beyblade>
        <option value="">選擇本回合陀螺</option>
        ${deckOptions.map(text => `<option value="${escapeHtml(text)}">${escapeHtml(text)}</option>`).join("")}
      </select>

      <select data-round-result>
        <option value="win">我方得分</option>
        <option value="lose">我方失分</option>
      </select>

      <select data-round-score-type>
        <option value="extreme">極限勝利 3 分</option>
        <option value="over">擊飛勝利 2 分</option>
        <option value="burst">爆裂勝利 2 分</option>
        <option value="spin">迴轉勝利 1 分</option>
      </select>

      <input type="text" data-round-note placeholder="回合備註">
      <button type="button" onclick="addRound('${escapeHtml(tournamentId)}', '${escapeHtml(match.id)}')" class="primary-btn">新增回合</button>
    </div>
  `;
}

function renderRoundRow(tournamentId, matchId, round) {
  const scoreInfo = SCORE_TYPES[round.scoreType] || { label: "-", point: Number(round.point || 0) };
  const resultText = round.result === "win" ? "我方得分" : "我方失分";
  const resultClass = round.result === "win" ? "win-text" : "lose-text";

  return `
    <tr>
      <td>${escapeHtml(round.roundNumber || "-")}</td>
      <td>${escapeHtml(round.myBeyblade || "-")}</td>
      <td class="${resultClass}">${resultText}</td>
      <td>${escapeHtml(scoreInfo.label)}</td>
      <td>${escapeHtml(round.point || scoreInfo.point || "-")}</td>
      <td>${escapeHtml(round.note || "-")}</td>
      <td>
        <button type="button" onclick="deleteRound('${escapeHtml(tournamentId)}', '${escapeHtml(matchId)}', '${escapeHtml(round.id)}')" class="danger-btn">刪除</button>
      </td>
    </tr>
  `;
}

async function loadTournamentData() {
  if (!currentUser) return;

  const userDocRef = getUserDocRef();
  if (!userDocRef) return;

  try {
    setSyncStatus("載入參賽紀錄中...", "login");

    const snapshot = await getDoc(userDocRef);

    if (snapshot.exists()) {
      mainData = snapshot.data() || {};
      tournamentRecords = Array.isArray(mainData.tournamentRecords)
        ? mainData.tournamentRecords
        : [];
    } else {
      mainData = {};
      tournamentRecords = [];
    }

    rebuildConfigOptions();
    renderTournamentList();
    setSyncStatus("參賽紀錄已同步", "saved");
  } catch (error) {
    console.error("參賽紀錄讀取失敗：", error);
    alert("參賽紀錄讀取失敗：" + error.message);
    setSyncStatus("讀取失敗", "error");
  }
}

async function saveTournamentData() {
  if (!requireLogin()) return;

  const userDocRef = getUserDocRef();
  if (!userDocRef) return;

  try {
    setSyncStatus("儲存參賽紀錄中...", "saving");

    const snapshot = await getDoc(userDocRef);
    const oldData = snapshot.exists() ? snapshot.data() : {};

    mainData = {
      ...oldData,
      tournamentRecords,
      updatedAt: Date.now()
    };

    await setDoc(userDocRef, mainData);

    rebuildConfigOptions();
    setSyncStatus("參賽紀錄已儲存", "saved");
  } catch (error) {
    console.error("參賽紀錄儲存失敗：", error);
    alert("參賽紀錄儲存失敗：" + error.message);
    setSyncStatus("儲存失敗", "error");
  }
}

window.addTournament = async function () {
  if (!requireLogin()) return;

  const dateInput = document.getElementById("tournamentDate");
  const nameInput = document.getElementById("tournamentName");
  const locationInput = document.getElementById("tournamentLocation");
  const rankInput = document.getElementById("tournamentRank");
  const noteInput = document.getElementById("tournamentNote");

  const date = dateInput.value;
  const tournamentName = nameInput.value.trim();
  const location = locationInput.value.trim();
  const rank = rankInput.value.trim();
  const note = noteInput.value.trim();

  if (!date) {
    alert("請選擇日期。");
    return;
  }

  if (!tournamentName) {
    alert("請輸入比賽名稱。");
    return;
  }

  tournamentRecords.push({
    id: generateId("tournament"),
    tournamentName,
    date,
    location,
    rank,
    note,
    matches: []
  });

  dateInput.value = "";
  nameInput.value = "";
  locationInput.value = "";
  rankInput.value = "";
  noteInput.value = "";

  await saveTournamentData();
  renderTournamentList();
};

window.toggleTournamentDetail = function (tournamentId) {
  if (openedTournamentIds.has(tournamentId)) {
    openedTournamentIds.delete(tournamentId);
  } else {
    openedTournamentIds.add(tournamentId);
  }

  renderTournamentList();
};

window.editTournament = async function (tournamentId) {
  if (!requireLogin()) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  if (!record) return;

  const tournamentName = prompt("比賽名稱", record.tournamentName || "");
  if (tournamentName === null) return;

  const date = prompt("日期，格式 YYYY-MM-DD", record.date || "");
  if (date === null) return;

  if (!tournamentName.trim() || !date.trim()) {
    alert("比賽名稱與日期不可空白。");
    return;
  }

  const location = prompt("地點", record.location || "");
  if (location === null) return;

  const rank = prompt("名次", record.rank || "");
  if (rank === null) return;

  const note = prompt("備註", record.note || "");
  if (note === null) return;

  record.tournamentName = tournamentName.trim();
  record.date = date.trim();
  record.location = location.trim();
  record.rank = rank.trim();
  record.note = note.trim();

  await saveTournamentData();
  renderTournamentList();
};

window.deleteTournament = async function (tournamentId) {
  if (!requireLogin()) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  if (!record) return;

  const ok = confirm(`確定要刪除「${record.tournamentName || "這場比賽"}」嗎？`);
  if (!ok) return;

  tournamentRecords = tournamentRecords.filter(item => item.id !== tournamentId);
  openedTournamentIds.delete(tournamentId);

  await saveTournamentData();
  renderTournamentList();
};

window.addMatch = async function (tournamentId) {
  if (!requireLogin()) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  if (!record) return;

  const card = document.querySelector(`[data-tournament-id="${tournamentId}"]`);
  if (!card) return;

  const opponentInput = card.querySelector("[data-match-opponent]");
  const opponentName = opponentInput ? opponentInput.value.trim() : "";

  const deckTexts = [
    getDeckValue(tournamentId, 1),
    getDeckValue(tournamentId, 2),
    getDeckValue(tournamentId, 3)
  ];

  if (deckTexts.some(text => !text)) {
    alert("每局請填寫或選擇 3 顆陀螺。");
    return;
  }

  if (!Array.isArray(record.matches)) {
    record.matches = [];
  }

  record.matches.push({
    id: generateId("match"),
    opponentName,
    deck: deckTexts.map(text => ({
      source: configOptions.some(option => option.text === text) ? "config" : "custom",
      configText: text
    })),
    rounds: []
  });

  openedTournamentIds.add(tournamentId);

  await saveTournamentData();
  renderTournamentList();
};

window.editMatch = async function (tournamentId, matchId) {
  if (!requireLogin()) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  const match = record?.matches?.find(item => item.id === matchId);
  if (!record || !match) return;

  const opponentName = prompt("對手名稱", match.opponentName || "");
  if (opponentName === null) return;

  const newDeck = [];

  for (let i = 0; i < 3; i++) {
    const value = prompt(`陀螺 ${i + 1}`, match.deck?.[i]?.configText || "");
    if (value === null) return;

    if (!value.trim()) {
      alert("3 顆陀螺不可空白。");
      return;
    }

    newDeck.push({
      source: configOptions.some(option => option.text === value.trim()) ? "config" : "custom",
      configText: value.trim()
    });
  }

  match.opponentName = opponentName.trim();
  match.deck = newDeck;

  await saveTournamentData();
  renderTournamentList();
};

window.deleteMatch = async function (tournamentId, matchId) {
  if (!requireLogin()) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  if (!record) return;

  const ok = confirm("確定要刪除這局對戰紀錄嗎？");
  if (!ok) return;

  record.matches = (record.matches || []).filter(item => item.id !== matchId);

  await saveTournamentData();
  renderTournamentList();
};

window.addRound = async function (tournamentId, matchId) {
  if (!requireLogin()) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  const match = record?.matches?.find(item => item.id === matchId);
  if (!record || !match) return;

  const matchEl = document.querySelector(`[data-match-id="${matchId}"]`);
  if (!matchEl) return;

  const beyblade = matchEl.querySelector("[data-round-beyblade]")?.value.trim() || "";
  const result = matchEl.querySelector("[data-round-result]")?.value || "win";
  const scoreType = matchEl.querySelector("[data-round-score-type]")?.value || "spin";
  const note = matchEl.querySelector("[data-round-note]")?.value.trim() || "";

  if (!beyblade) {
    alert("請選擇本回合使用的陀螺。");
    return;
  }

  const scoreInfo = SCORE_TYPES[scoreType];

  if (!Array.isArray(match.rounds)) {
    match.rounds = [];
  }

  match.rounds.push({
    id: generateId("round"),
    roundNumber: match.rounds.length + 1,
    result,
    scoreType,
    point: scoreInfo.point,
    myBeyblade: beyblade,
    note
  });

  await saveTournamentData();
  renderTournamentList();
};

window.deleteRound = async function (tournamentId, matchId, roundId) {
  if (!requireLogin()) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  const match = record?.matches?.find(item => item.id === matchId);
  if (!record || !match) return;

  const ok = confirm("確定要刪除這筆回合紀錄嗎？");
  if (!ok) return;

  match.rounds = (match.rounds || [])
    .filter(round => round.id !== roundId)
    .map((round, index) => ({
      ...round,
      roundNumber: index + 1
    }));

  await saveTournamentData();
  renderTournamentList();
};

document.addEventListener("DOMContentLoaded", function () {
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", loginWithGoogle);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutGoogle);
  }

  renderTournamentList();
  setSyncStatus("請先使用 Google 登入", "muted");

  onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAuthUI(user);

    if (user) {
      loadTournamentData();
    } else {
      mainData = {};
      tournamentRecords = [];
      configOptions = [];
      openedTournamentIds.clear();
      renderTournamentList();
      setSyncStatus("尚未登入", "muted");
    }
  });
});
