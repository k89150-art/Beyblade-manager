import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import {
  DATA_SESSION_STATES,
  createDataSessionGuard,
  createPendingInteractionRegistry,
  createStableDataFingerprint
} from "./data-session-guard.js?v=20261029-phase1c";

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
  getDocFromServer,
  runTransaction
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

import {
  TOURNAMENT_APPLIED,
  TOURNAMENT_OPERATION_TYPES,
  TOURNAMENT_SYNC_CODES,
  TOURNAMENT_SYNC_MESSAGES,
  classifyTournamentSaveFailure,
  createTournamentOperation,
  isTournamentCommitUnresolved,
  isTournamentOperationApplied,
  startTournamentTransaction,
  waitForTournamentTransaction
} from "./tournament-sync.js?v=20261029-phase4b1";

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

const DIRECT_ADVANCE_TYPES = {
  bye: { label: "輪空／種子晉級", opponentName: "輪空" },
  walkover: { label: "對手棄權／未到", opponentName: "對手未到" }
};

let currentUser = null;
let mainData = {};
let tournamentRecords = [];
let configOptions = [];
const openedTournamentIds = new Set();
const dataSessionGuard = createDataSessionGuard();
const pendingTournamentInteractions = createPendingInteractionRegistry();

const ADMIN_UID = "SesDhvXG6MUT38YhqGl0N6lVgMz1";
// H2: shown on the page by this script, so a device that displays it is
// running the transaction-protected tournament code (old code shows nothing).
const TOURNAMENT_CLIENT_VERSION = "賽事儲存版本：4B-1（交易保護）";

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

function isAdminUser(user) {
  return Boolean(user && user.uid === ADMIN_UID);
}

function setAdminMenuVisibility(show) {
  document.body.classList.toggle("is-admin", show);
  document.querySelectorAll('.side-menu [data-admin-only="true"]').forEach(item => {
    item.setAttribute("aria-hidden", String(!show));
  });
}

function getUserDocRef(targetUid) {
  if (!targetUid) return null;
  return doc(db, "users", targetUid, "appData", "main");
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

  setAdminMenuVisibility(isAdminUser(user));

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

function updateDataAccessUi() {
  const session = dataSessionGuard.snapshot();
  // A running tournament transaction keeps every write control disabled.
  const writable = session.state === DATA_SESSION_STATES.READY && !isTournamentSaveBusy();
  document.body.dataset.dataState = session.state;
  document.body.setAttribute("aria-busy", String(session.state === DATA_SESSION_STATES.LOADING));

  document.querySelectorAll("[data-write-action]").forEach(control => {
    control.disabled = !writable;
    control.setAttribute("aria-disabled", String(!writable));
  });

  const retryButton = document.getElementById("retryDataLoadBtn");
  if (retryButton) retryButton.hidden = session.state !== DATA_SESSION_STATES.ERROR || !currentUser;
}

function beginTournamentDataSession() {
  pendingTournamentInteractions.cancelAll();
  const token = dataSessionGuard.begin({ ownerUid: currentUser.uid, targetUid: currentUser.uid });
  updateDataAccessUi();
  return token;
}

function getDataWriteBlockMessage() {
  const { state } = dataSessionGuard.snapshot();
  if (state === DATA_SESSION_STATES.LOADING) return "參賽紀錄仍在載入，請稍候。";
  if (state === DATA_SESSION_STATES.ERROR) return "參賽紀錄讀取失敗，請先按「重新載入」再操作。";
  return "請先使用 Google 登入，並等待參賽紀錄載入完成。";
}

function requireLogin() {
  if (!currentUser) {
    alert("請先使用 Google 登入。");
    return false;
  }

  const writeSession = dataSessionGuard.captureWriteSession();
  if (!writeSession || writeSession.ownerUid !== currentUser.uid) {
    const message = getDataWriteBlockMessage();
    alert(message);
    setSyncStatus(message, dataSessionGuard.snapshot().state === DATA_SESSION_STATES.ERROR ? "error" : "muted");
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
      return { id: `config_${index}`, text };
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

function getMatchOutcome(match) {
  if (DIRECT_ADVANCE_TYPES[match?.advancementType]) return "advance";

  const score = calculateMatchScore(match || {});
  if (score.myScore >= 4) return "win";
  if (score.opponentScore >= 4) return "lose";
  return "incomplete";
}

function normalizeParticipantCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 2 ? count : null;
}

function calculateTournamentStanding(record) {
  const participantCount = normalizeParticipantCount(record?.participantCount);

  if (!participantCount) {
    return {
      label: record?.rank || "待輸入總人數",
      detail: record?.rank ? "舊版手動名次" : "輸入總人數後才可自動計算",
      isFinal: Boolean(record?.rank),
      advances: 0
    };
  }

  const totalRounds = Math.max(1, Math.ceil(Math.log2(participantCount)));
  let advances = 0;
  let hasLoss = false;
  let incompleteCount = 0;

  for (const match of record.matches || []) {
    const outcome = getMatchOutcome(match);
    if (outcome === "win" || outcome === "advance") {
      advances += 1;
    } else if (outcome === "lose") {
      hasLoss = true;
      break;
    } else {
      incompleteCount += 1;
      break;
    }
  }

  if (hasLoss) {
    const best = Math.min(participantCount, (2 ** Math.max(0, totalRounds - advances - 1)) + 1);
    const worst = Math.min(participantCount, 2 ** Math.max(0, totalRounds - advances));
    const label = best === worst ? `第 ${best} 名` : `第 ${best}–${worst} 名`;

    return {
      label,
      detail: `晉級 ${advances} 輪後落敗`,
      isFinal: true,
      advances
    };
  }

  if (advances >= totalRounds) {
    return {
      label: "冠軍（第 1 名）",
      detail: `完成 ${totalRounds} 輪晉級`,
      isFinal: true,
      advances
    };
  }

  if (incompleteCount > 0) {
    return {
      label: `第 ${advances + 1} 輪進行中`,
      detail: `已有 ${incompleteCount} 局尚未分出勝負`,
      isFinal: false,
      advances
    };
  }

  return {
    label: advances > 0 ? `已晉級第 ${advances + 1} 輪` : "尚未開始",
    detail: advances > 0 ? `已完成 ${advances} 輪晉級` : "尚無賽程紀錄",
    isFinal: false,
    advances
  };
}

function getMatchStatus(match) {
  const directAdvance = DIRECT_ADVANCE_TYPES[match?.advancementType];
  if (directAdvance) return directAdvance.label;

  const score = calculateMatchScore(match);

  if (score.myScore >= 4) return "本局勝利";
  if (score.opponentScore >= 4) return "本局落敗";

  return "進行中";
}

function getMatchStatusClass(match) {
  if (DIRECT_ADVANCE_TYPES[match?.advancementType]) return "win-text";

  const status = getMatchStatus(match);

  if (status === "本局勝利") return "win-text";
  if (status === "本局落敗") return "lose-text";

  return "progress-text";
}

function renderTournamentList() {
  const list = document.getElementById("tournamentList");
  if (!list) return;

  // Unsaved match/round inputs survive every re-render of the list.
  captureTournamentFormDrafts();

  if (!currentUser) {
    list.innerHTML = `<div class="empty-state">請先登入後查看參賽紀錄。</div>`;
    updateDataAccessUi();
    return;
  }

  const { state } = dataSessionGuard.snapshot();
  if (state === DATA_SESSION_STATES.LOADING) {
    list.innerHTML = `<div class="empty-state">正在安全載入參賽紀錄，完成前不會寫入資料。</div>`;
    updateDataAccessUi();
    return;
  }

  if (state === DATA_SESSION_STATES.ERROR) {
    list.innerHTML = `<div class="empty-state">參賽紀錄讀取失敗，已停止修改功能。請使用上方「重新載入」。</div>`;
    updateDataAccessUi();
    return;
  }

  if (!tournamentRecords.length) {
    list.innerHTML = `<div class="empty-state">目前沒有參賽紀錄。</div>`;
    updateDataAccessUi();
    return;
  }

  const sortedRecords = [...tournamentRecords].sort((a, b) => {
    return String(b.date || "").localeCompare(String(a.date || ""));
  });

  list.innerHTML = sortedRecords.map(record => renderTournamentCard(record)).join("");
  restoreTournamentFormDrafts();
  updateDataAccessUi();
}

function renderTournamentCard(record) {
  const isOpen = openedTournamentIds.has(record.id);
  const matchCount = (record.matches || []).length;
  const isFinished = record.isFinished === true;
  const participantCount = normalizeParticipantCount(record.participantCount);
  const standing = calculateTournamentStanding(record);

  return `
    <div class="tournament-card" data-tournament-id="${escapeHtml(record.id)}">
      <div class="tournament-summary">
        <div class="tournament-summary-main">
          <div class="tournament-title">${escapeHtml(record.tournamentName || "-")}</div>
          <div class="tournament-meta">
            <span>日期：${escapeHtml(record.date || "-")}</span>
            <span>地點：${escapeHtml(record.location || "-")}</span>
            <span>總人數：${escapeHtml(participantCount || "-")}</span>
            <span>成績：${escapeHtml(standing.label)}</span>
            <span>賽程紀錄：${matchCount}</span>
            <span class="${isFinished ? "win-text" : "progress-text"}">狀態：${isFinished ? "已完成" : "編輯中"}</span>
          </div>
          <div class="tournament-note">計算依據：${escapeHtml(standing.detail)}</div>
          ${record.note ? `<div class="tournament-note">備註：${escapeHtml(record.note)}</div>` : ""}
        </div>

        <div class="tournament-actions">
          <button type="button" onclick="toggleTournamentDetail('${escapeHtml(record.id)}')">
            ${isOpen ? "收合" : "展開"}
          </button>
          ${!isFinished ? `<button type="button" data-write-action onclick="finishTournament('${escapeHtml(record.id)}')" class="primary-btn">完成</button>` : ""}
          <button type="button" data-write-action onclick="editTournament('${escapeHtml(record.id)}')">修改</button>
          <button type="button" data-write-action onclick="deleteTournament('${escapeHtml(record.id)}')" class="danger-btn">刪除</button>
        </div>
      </div>

      ${isOpen ? renderTournamentDetail(record) : ""}
    </div>
  `;
}

function renderTournamentDetail(record) {
  const isFinished = record.isFinished === true;

  return `
    <div class="tournament-detail">
      ${isFinished
        ? `<div class="empty-state">這場比賽已完成。若要新增對局或回合，請先按「修改」。</div>`
        : `<h4>新增對局</h4>${renderAddMatchForm(record.id)}`
      }

      <h4>對局紀錄</h4>
      ${(record.matches || []).length
        ? record.matches.map((match, index) => renderMatchCard(record.id, match, isFinished, index + 1)).join("")
        : `<div class="empty-state">尚未新增對局。</div>`
      }
    </div>
  `;
}

function renderAddMatchForm(tournamentId) {
  return `
    <div class="match-form">
      <div class="direct-advance-actions">
        <button type="button" data-write-action onclick="addDirectAdvance('${escapeHtml(tournamentId)}', 'bye')">輪空／種子，直接晉級</button>
        <button type="button" data-write-action onclick="addDirectAdvance('${escapeHtml(tournamentId)}', 'walkover')">對手棄權／未到，直接晉級</button>
      </div>
      <div class="direct-advance-note">直接晉級會計入一輪晉級，但不會建立比分或回合紀錄。</div>

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

      <button type="button" data-write-action onclick="addMatch('${escapeHtml(tournamentId)}')" class="primary-btn">新增對局</button>
    </div>
  `;
}

function renderMatchCard(tournamentId, match, isFinished, matchNumber) {
  const score = calculateMatchScore(match);
  const status = getMatchStatus(match);
  const statusClass = getMatchStatusClass(match);
  const deck = match.deck || [];
  const directAdvance = DIRECT_ADVANCE_TYPES[match.advancementType];

  return `
    <div class="match-card" data-match-id="${escapeHtml(match.id)}">
      <div class="match-header">
        <div>
          <div class="match-title">第 ${escapeHtml(matchNumber)} 局｜${directAdvance ? escapeHtml(directAdvance.label) : `對手：${escapeHtml(match.opponentName || "-")}`}</div>
          ${directAdvance
            ? `<div class="match-score"><span class="direct-advance-badge">${escapeHtml(status)}</span></div>`
            : `<div class="match-score">比分：我方 ${score.myScore} : ${score.opponentScore} 對手 <span class="${statusClass}">${status}</span></div>`}
        </div>
        <div class="match-actions">
          ${!isFinished && !directAdvance ? `<button type="button" data-write-action onclick="editMatch('${escapeHtml(tournamentId)}', '${escapeHtml(match.id)}')">修改對局</button>` : ""}
          ${!isFinished ? `<button type="button" data-write-action onclick="deleteMatch('${escapeHtml(tournamentId)}', '${escapeHtml(match.id)}')" class="danger-btn">刪除對局</button>` : ""}
        </div>
      </div>

      ${!directAdvance ? `<div class="deck-list">
        <div><strong>陀螺 1：</strong>${escapeHtml(deck[0]?.configText || "-")}</div>
        <div><strong>陀螺 2：</strong>${escapeHtml(deck[1]?.configText || "-")}</div>
        <div><strong>陀螺 3：</strong>${escapeHtml(deck[2]?.configText || "-")}</div>
      </div>` : ""}

      ${!isFinished && !directAdvance ? `<h5>新增回合</h5>${renderAddRoundForm(tournamentId, match)}` : ""}

      ${!directAdvance ? `<div class="table-wrap round-table-wrap">
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
              ? (match.rounds || []).map(round => renderRoundRow(tournamentId, match.id, round, isFinished)).join("")
              : `<tr><td colspan="7">尚未新增回合。</td></tr>`
            }
          </tbody>
        </table>
      </div>` : `<div class="empty-state">本局未進行比賽，已直接晉級下一輪。</div>`}
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
      <button type="button" data-write-action onclick="addRound('${escapeHtml(tournamentId)}', '${escapeHtml(match.id)}')" class="primary-btn">新增回合</button>
    </div>
  `;
}

function renderRoundRow(tournamentId, matchId, round, isFinished) {
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
      <td class="${isFinished ? "round-action-empty" : ""}">
        ${!isFinished ? `<button type="button" data-write-action onclick="deleteRound('${escapeHtml(tournamentId)}', '${escapeHtml(matchId)}', '${escapeHtml(round.id)}')" class="danger-btn">刪除</button>` : ""}
      </td>
    </tr>
  `;
}

async function loadTournamentData(sessionToken) {
  if (!currentUser || !dataSessionGuard.isCurrent(sessionToken)) return;

  const userDocRef = getUserDocRef(sessionToken.targetUid);
  if (!userDocRef) return;

  try {
    setSyncStatus("載入參賽紀錄中...", "login");

    const snapshot = await getDocFromServer(userDocRef);
    if (!dataSessionGuard.isCurrent(sessionToken)) return;

    if (snapshot.exists()) {
      mainData = snapshot.data() || {};
      tournamentRecords = Array.isArray(mainData.tournamentRecords)
        ? mainData.tournamentRecords
        : [];
    } else {
      mainData = {};
      tournamentRecords = [];
    }

    if (!dataSessionGuard.markReady(sessionToken)) return;
    rebuildConfigOptions();
    renderTournamentList();
    setSyncStatus("參賽紀錄已同步", "saved");
  } catch (error) {
    if (!dataSessionGuard.isCurrent(sessionToken)) return;
    dataSessionGuard.markError(sessionToken);
    pendingTournamentInteractions.cancelAll();
    updateDataAccessUi();
    renderTournamentList();
    console.error("參賽紀錄讀取失敗：", error);
    alert("參賽紀錄讀取失敗，已停止資料修改。請按「重新載入」再試一次。\n\n" + error.message);
    setSyncStatus("讀取失敗，已停止寫入", "error");
  }
}

/* ===== D-017 tournament transactions: begin ===== */

const TOURNAMENT_SAVE_TIMEOUT_MS = 15000;
const TOURNAMENT_SAVE_SLOW_NOTICE_MS = 5000;
const TOURNAMENT_VERIFY_TIMEOUT_MS = 10000;
// Waits between single-attempt transactions (tournament-sync.js retries).
const TOURNAMENT_RETRY_DELAYS_MS = [300, 600, 1200, 2400];
const TOURNAMENT_BUSY_MESSAGE = "上一個參賽紀錄操作仍在儲存，請等候完成後再操作。你的輸入內容已保留。";
const MATCH_FORM_DRAFT_FIELDS = Object.freeze(["data-match-opponent", "data-deck-select", "data-deck-custom"]);
const ROUND_FORM_DRAFT_FIELDS = Object.freeze(["data-round-beyblade", "data-round-result", "data-round-score-type", "data-round-note"]);
const TOURNAMENT_DRAFT_FIELDS = Object.freeze([...MATCH_FORM_DRAFT_FIELDS, ...ROUND_FORM_DRAFT_FIELDS]);
const TOURNAMENT_DRAFT_SELECTOR = TOURNAMENT_DRAFT_FIELDS.map(name => `[${name}]`).join(",");
const ADD_TOURNAMENT_INPUT_IDS = Object.freeze([
  "tournamentDate",
  "tournamentName",
  "tournamentLocation",
  "tournamentParticipantCount",
  "tournamentNote"
]);

const TOURNAMENT_FAILURE_STATUS = Object.freeze({
  [TOURNAMENT_SYNC_CODES.CONFLICT]: "沒有儲存：賽事已在其他地方更新",
  [TOURNAMENT_SYNC_CODES.DELETED]: "沒有儲存：賽事已在其他地方刪除",
  [TOURNAMENT_SYNC_CODES.DELETE_CONFLICT]: "沒有刪除：賽事有新的變更",
  [TOURNAMENT_SYNC_CODES.DUPLICATE_ID]: "沒有儲存：雲端資料需要檢查",
  [TOURNAMENT_SYNC_CODES.MALFORMED]: "沒有儲存：雲端資料需要檢查",
  [TOURNAMENT_SYNC_CODES.INVALID]: "沒有儲存：請確認最新資料",
  [TOURNAMENT_SYNC_CODES.OFFLINE]: "沒有儲存：目前無法連線",
  [TOURNAMENT_SYNC_CODES.NETWORK]: "沒有儲存：目前無法連線",
  [TOURNAMENT_SYNC_CODES.PERMISSION]: "沒有儲存：雲端拒絕寫入"
});

let activeTournamentSave = null;
let tournamentSaveSequence = 0;
let tournamentDraftOwnerUid = null;
let pendingAddTournamentDraft = null;
const tournamentFormDrafts = new Map();
const matchEditDrafts = new Map();

function isTournamentSaveBusy() {
  return Boolean(activeTournamentSave) && dataSessionGuard.isWriteSessionCurrent(activeTournamentSave.session);
}

function isBrowserOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function resetTournamentSaveState() {
  if (activeTournamentSave) activeTournamentSave.abandoned = true;
  activeTournamentSave = null;
}

// Replaces the in-memory copy only with a whole document read from the server
// (a committed transaction result or a fresh read), never with local edits.
function adoptTournamentDocument(data) {
  mainData = data && typeof data === "object" ? data : {};
  tournamentRecords = Array.isArray(mainData.tournamentRecords) ? mainData.tournamentRecords : [];
  rebuildConfigOptions();
}

// One SDK attempt per call (maxAttempts: 1). tournament-sync.js retries
// itself so it can tell a rejected commit from one whose result is unknown.
function createTournamentTransactionRunner(userDocRef) {
  return updateFunction => runTransaction(db, transaction => updateFunction({
    get: async () => {
      const snapshot = await transaction.get(userDocRef);
      const exists = snapshot.exists();
      return { exists, data: exists ? snapshot.data() || {} : null };
    },
    update: fields => {
      transaction.update(userDocRef, fields);
    },
    create: fields => {
      transaction.set(userDocRef, fields);
    }
  }), { maxAttempts: 1 });
}

async function readTournamentDocumentFromServer(session) {
  const snapshot = await getDocFromServer(getUserDocRef(session.targetUid));
  return snapshot.exists() ? snapshot.data() || {} : {};
}

function withTournamentTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error("timeout");
      error.code = "deadline-exceeded";
      reject(error);
    }, timeoutMs);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function reportTournamentSaveFailure(code, notify) {
  const message = TOURNAMENT_SYNC_MESSAGES[code] || TOURNAMENT_SYNC_MESSAGES[TOURNAMENT_SYNC_CODES.NETWORK];
  setSyncStatus(TOURNAMENT_FAILURE_STATUS[code] || "沒有儲存", "error");
  if (notify !== "silent") alert(message);
  return message;
}

const TOURNAMENT_SAVED_STATUS = Object.freeze({
  [TOURNAMENT_APPLIED.WRITTEN]: "參賽紀錄已儲存",
  [TOURNAMENT_APPLIED.IDENTITY]: "參賽紀錄已儲存（先前中斷的儲存其實已完成，沒有重複新增）",
  [TOURNAMENT_APPLIED.STATE_MATCH]: "雲端資料已是這次要儲存的內容，沒有重複寫入",
  [TOURNAMENT_APPLIED.ABSENT]: "這筆資料已不存在，不需要再刪除"
});

const TOURNAMENT_VERIFIED_STATUS = Object.freeze({
  committed: "已確認這次操作已儲存",
  matches: "雲端資料已包含這次的變更內容（無法確認是否由這次操作寫入）"
});

function completeTournamentSave(data, onSaved, statusText) {
  adoptTournamentDocument(data);
  onSaved();
  renderTournamentList();
  setSyncStatus(statusText, "saved");
}

// A timeout or a dropped commit does not prove that nothing was written, so
// the latest server copy is read before telling the user anything definite.
async function confirmUnclearTournamentSave(operationSession, operation, onSaved, notify) {
  setSyncStatus("無法確認是否已儲存，正在重新讀取雲端資料...", "saving");

  let latest = null;
  try {
    latest = await withTournamentTimeout(readTournamentDocumentFromServer(operationSession), TOURNAMENT_VERIFY_TIMEOUT_MS);
  } catch (error) {
    latest = null;
  }

  if (!dataSessionGuard.isWriteSessionCurrent(operationSession)) {
    return { ok: false, code: TOURNAMENT_SYNC_CODES.SESSION_CHANGED };
  }

  if (latest) {
    adoptTournamentDocument(latest);
    const applied = isTournamentOperationApplied(tournamentRecords, operation);
    if (applied) {
      onSaved();
      renderTournamentList();
      setSyncStatus(TOURNAMENT_VERIFIED_STATUS[applied], "saved");
      return { ok: true, confirmed: applied };
    }
    renderTournamentList();
  }

  const message = TOURNAMENT_SYNC_MESSAGES[TOURNAMENT_SYNC_CODES.UNKNOWN_OUTCOME];
  setSyncStatus(latest ? "無法確認是否已儲存，畫面已更新為雲端最新資料" : "無法確認是否已儲存，請稍後按重新載入", "error");
  if (notify !== "silent") alert(message);
  return { ok: false, code: TOURNAMENT_SYNC_CODES.UNKNOWN_OUTCOME, message };
}

// A commit that was already on the wire when the wait timed out may still
// succeed. Its result is not trusted directly; the page re-reads the server.
function watchLateTournamentCommit(handle, operationSession, operation, onSaved) {
  handle.promise.then(async value => {
    if (!value || !dataSessionGuard.isWriteSessionCurrent(operationSession)) return;
    let latest;
    try {
      latest = await withTournamentTimeout(readTournamentDocumentFromServer(operationSession), TOURNAMENT_VERIFY_TIMEOUT_MS);
    } catch (error) {
      return;
    }
    if (!dataSessionGuard.isWriteSessionCurrent(operationSession)) return;
    adoptTournamentDocument(latest);
    if (isTournamentOperationApplied(tournamentRecords, operation)) onSaved();
    renderTournamentList();
    setSyncStatus(value.changed ? "稍早逾時的操作已完成儲存，畫面已更新" : "稍早逾時的操作已完成確認，畫面已更新", "saved");
  }, () => {});
}

// Runs one operation against the latest server copy. In-memory data and the
// page change only after the transaction has committed for this same session.
async function submitTournamentOperation(operationSession, operation, { onSaved = () => {}, notify = "alert" } = {}) {
  if (!dataSessionGuard.isWriteSessionCurrent(operationSession)) {
    return { ok: false, code: TOURNAMENT_SYNC_CODES.SESSION_CHANGED };
  }

  if (isTournamentSaveBusy()) {
    if (notify !== "silent") alert(TOURNAMENT_BUSY_MESSAGE);
    return { ok: false, code: "busy", message: TOURNAMENT_BUSY_MESSAGE };
  }

  if (isBrowserOffline()) {
    const message = reportTournamentSaveFailure(TOURNAMENT_SYNC_CODES.OFFLINE, notify);
    return { ok: false, code: TOURNAMENT_SYNC_CODES.OFFLINE, message };
  }

  const userDocRef = getUserDocRef(operationSession.targetUid);
  if (!userDocRef) return { ok: false, code: TOURNAMENT_SYNC_CODES.SESSION_CHANGED };

  const saveToken = { session: operationSession, id: ++tournamentSaveSequence, abandoned: false };
  activeTournamentSave = saveToken;
  updateDataAccessUi();
  setSyncStatus("儲存參賽紀錄中...", "saving");

  const slowTimer = setTimeout(() => {
    if (activeTournamentSave === saveToken && dataSessionGuard.isWriteSessionCurrent(operationSession)) {
      setSyncStatus("連線較慢，仍在等待雲端確認...", "saving");
    }
  }, TOURNAMENT_SAVE_SLOW_NOTICE_MS);

  const handle = startTournamentTransaction({
    operation,
    runTransaction: createTournamentTransactionRunner(userDocRef),
    canContinue: () => !saveToken.abandoned && dataSessionGuard.isWriteSessionCurrent(operationSession),
    retryDelaysMs: TOURNAMENT_RETRY_DELAYS_MS
  });

  try {
    const outcome = await waitForTournamentTransaction(handle, { timeoutMs: TOURNAMENT_SAVE_TIMEOUT_MS });
    clearTimeout(slowTimer);

    if (!dataSessionGuard.isWriteSessionCurrent(operationSession)) {
      return { ok: false, code: TOURNAMENT_SYNC_CODES.SESSION_CHANGED };
    }

    if (outcome.kind === "settled") {
      const applied = outcome.value.applied || TOURNAMENT_APPLIED.WRITTEN;
      completeTournamentSave(outcome.value.data, onSaved, TOURNAMENT_SAVED_STATUS[applied]);
      return { ok: true, applied };
    }

    if (outcome.kind === "timeout") {
      // Stop any further attempt. Only a commit already handed to the SDK, or
      // one whose result was lost, can still change the server.
      saveToken.abandoned = true;
      if (!isTournamentCommitUnresolved(handle.progress)) {
        const message = reportTournamentSaveFailure(TOURNAMENT_SYNC_CODES.NETWORK, notify);
        return { ok: false, code: TOURNAMENT_SYNC_CODES.NETWORK, message };
      }
      watchLateTournamentCommit(handle, operationSession, operation, onSaved);
      return await confirmUnclearTournamentSave(operationSession, operation, onSaved, notify);
    }

    const code = classifyTournamentSaveFailure(outcome.error, handle.progress);
    console.warn("參賽紀錄沒有儲存：", code);
    if (code === TOURNAMENT_SYNC_CODES.SESSION_CHANGED) return { ok: false, code };
    if (code === TOURNAMENT_SYNC_CODES.UNKNOWN_OUTCOME) {
      return await confirmUnclearTournamentSave(operationSession, operation, onSaved, notify);
    }

    if (outcome.error && outcome.error.latestData) {
      adoptTournamentDocument(outcome.error.latestData);
      renderTournamentList();
    }
    const message = reportTournamentSaveFailure(code, notify);
    return { ok: false, code, message };
  } finally {
    clearTimeout(slowTimer);
    if (activeTournamentSave === saveToken) {
      activeTournamentSave = null;
      if (dataSessionGuard.isCurrent(operationSession)) updateDataAccessUi();
    }
  }
}

const MATCH_EDIT_FIELDS = Object.freeze(["opponentName", "deck1", "deck2", "deck3"]);
const MATCH_EDIT_LABELS = Object.freeze({ opponentName: "對手名稱", deck1: "陀螺 1", deck2: "陀螺 2", deck3: "陀螺 3" });

function getMatchEditValues(match) {
  return {
    opponentName: String(match?.opponentName || ""),
    deck1: String(match?.deck?.[0]?.configText || ""),
    deck2: String(match?.deck?.[1]?.configText || ""),
    deck3: String(match?.deck?.[2]?.configText || "")
  };
}

/* ----- unsaved form drafts (memory only, tied to one account) ----- */

function getTournamentDraftKey(element) {
  const field = TOURNAMENT_DRAFT_FIELDS.find(name => element.hasAttribute(name));
  if (!field) return "";
  const tournamentId = element.closest("[data-tournament-id]")?.getAttribute("data-tournament-id") || "";
  const matchId = element.closest("[data-match-id]")?.getAttribute("data-match-id") || "";
  return JSON.stringify([tournamentId, matchId, field, element.getAttribute(field)]);
}

function canUseTournamentDrafts() {
  return Boolean(currentUser) && tournamentDraftOwnerUid === currentUser.uid;
}

function captureTournamentFormDrafts() {
  if (!canUseTournamentDrafts()) return;
  const list = document.getElementById("tournamentList");
  if (!list) return;
  list.querySelectorAll(TOURNAMENT_DRAFT_SELECTOR).forEach(element => {
    const key = getTournamentDraftKey(element);
    if (key) tournamentFormDrafts.set(key, element.value);
  });
}

function restoreTournamentFormDrafts() {
  if (!canUseTournamentDrafts()) return;
  const list = document.getElementById("tournamentList");
  if (!list) return;
  list.querySelectorAll(TOURNAMENT_DRAFT_SELECTOR).forEach(element => {
    const key = getTournamentDraftKey(element);
    if (!key || !tournamentFormDrafts.has(key)) return;
    const value = tournamentFormDrafts.get(key);
    if (element.tagName === "SELECT" && ![...element.options].some(option => option.value === value)) return;
    element.value = value;
  });
}

function clearTournamentFormDraft(tournamentId, matchId, fields) {
  [...tournamentFormDrafts.keys()].forEach(key => {
    const [draftTournamentId, draftMatchId, field] = JSON.parse(key);
    if (draftTournamentId === tournamentId && draftMatchId === matchId && fields.includes(field)) {
      tournamentFormDrafts.delete(key);
    }
  });

  const list = document.getElementById("tournamentList");
  if (!list) return;
  list.querySelectorAll(TOURNAMENT_DRAFT_SELECTOR).forEach(element => {
    const key = getTournamentDraftKey(element);
    if (!key) return;
    const [draftTournamentId, draftMatchId, field] = JSON.parse(key);
    if (draftTournamentId !== tournamentId || draftMatchId !== matchId || !fields.includes(field)) return;
    if (element.tagName === "SELECT") {
      element.selectedIndex = 0;
    } else {
      element.value = "";
    }
  });
}

// L2: a save may only clear the form contents it actually submitted.
function readTournamentFormScope(tournamentId, matchId, fields) {
  captureTournamentFormDrafts();
  const values = {};
  tournamentFormDrafts.forEach((value, key) => {
    const [draftTournamentId, draftMatchId, field] = JSON.parse(key);
    if (draftTournamentId === tournamentId && draftMatchId === matchId && fields.includes(field)) {
      values[key] = value;
    }
  });
  return values;
}

function clearTournamentFormDraftIfUnchanged(tournamentId, matchId, fields, submitted) {
  const current = readTournamentFormScope(tournamentId, matchId, fields);
  if (createStableDataFingerprint(current) !== createStableDataFingerprint(submitted)) return false;
  clearTournamentFormDraft(tournamentId, matchId, fields);
  return true;
}

function clearAddTournamentForm() {
  ADD_TOURNAMENT_INPUT_IDS.forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = "";
  });
}

// Drafts never follow a sign-out or an account switch.
function syncTournamentDraftOwner(user) {
  const uid = user ? user.uid : null;
  if (uid === tournamentDraftOwnerUid) return;
  tournamentFormDrafts.clear();
  matchEditDrafts.clear();
  pendingAddTournamentDraft = null;
  clearAddTournamentForm();
  const list = document.getElementById("tournamentList");
  if (list) list.innerHTML = "";
  tournamentDraftOwnerUid = uid;
}

// Re-submitting an unchanged add form after an unclear result reuses the same
// id, so a save that did reach the server is recognised instead of duplicated.
// L5: after an unclear result the earlier add may already exist, so a new id
// (a second, separate tournament) is only created after explicit confirmation.
function getAddTournamentId(values) {
  const key = createStableDataFingerprint(values);
  const pending = pendingAddTournamentDraft && pendingAddTournamentDraft.ownerUid === tournamentDraftOwnerUid
    ? pendingAddTournamentDraft
    : null;
  if (pending && pending.key === key) return pending.id;

  if (pending && pending.status === "unknown") {
    const createNew = confirm(`上一筆新增的比賽「${pending.name}」儲存結果仍無法確認，它可能已經存在。\n\n若只是想修正內容，請按「取消」，先確認列表後再用「修改」調整。\n若確定要另外建立一場全新的比賽，請按「確定」。`);
    if (!createNew) return null;
  }

  const id = generateId("tournament");
  pendingAddTournamentDraft = { key, id, name: values.tournamentName, ownerUid: tournamentDraftOwnerUid, status: "not-sent" };
  return id;
}

function retryTournamentDataLoad() {
  if (!currentUser) return;
  const sessionToken = beginTournamentDataSession();
  setSyncStatus("重新載入參賽紀錄中...", "login");
  renderTournamentList();
  void loadTournamentData(sessionToken);
}

window.addTournament = async function () {
  if (!requireLogin()) return;
  const operationSession = dataSessionGuard.captureWriteSession();
  if (!operationSession) return;

  const dateInput = document.getElementById("tournamentDate");
  const nameInput = document.getElementById("tournamentName");
  const locationInput = document.getElementById("tournamentLocation");
  const participantCountInput = document.getElementById("tournamentParticipantCount");
  const noteInput = document.getElementById("tournamentNote");

  const date = dateInput.value;
  const tournamentName = nameInput.value.trim();
  const location = locationInput.value.trim();
  const participantCount = normalizeParticipantCount(participantCountInput.value);
  const note = noteInput.value.trim();

  if (!date) {
    alert("請選擇日期。");
    return;
  }

  if (!tournamentName) {
    alert("請輸入比賽名稱。");
    return;
  }

  if (!participantCount) {
    alert("請輸入至少 2 人的比賽總人數（包含自己）。");
    return;
  }

  const submittedInputs = [dateInput.value, nameInput.value, locationInput.value, participantCountInput.value, noteInput.value];
  const id = getAddTournamentId({ tournamentName, date, location, participantCount, note });
  if (!id) return;
  const operation = createTournamentOperation({
    type: TOURNAMENT_OPERATION_TYPES.ADD_TOURNAMENT,
    tournamentId: id,
    updatedAt: Date.now(),
    record: {
      id,
      tournamentName,
      date,
      location,
      participantCount,
      rank: "",
      note,
      isFinished: false,
      matches: []
    }
  });

  const result = await submitTournamentOperation(operationSession, operation, {
    onSaved: () => {
      if (pendingAddTournamentDraft && pendingAddTournamentDraft.id === id) pendingAddTournamentDraft = null;
      openedTournamentIds.add(id);
      // Keep anything typed while the save was running.
      const inputs = [dateInput, nameInput, locationInput, participantCountInput, noteInput];
      if (inputs.every((input, index) => input.value === submittedInputs[index])) {
        inputs.forEach(input => { input.value = ""; });
      }
    }
  });

  if (!result.ok && result.code !== "busy" && pendingAddTournamentDraft && pendingAddTournamentDraft.id === id) {
    pendingAddTournamentDraft = {
      ...pendingAddTournamentDraft,
      status: result.code === TOURNAMENT_SYNC_CODES.UNKNOWN_OUTCOME ? "unknown" : "not-saved"
    };
  }
};

window.toggleTournamentDetail = function (tournamentId) {
  if (openedTournamentIds.has(tournamentId)) {
    openedTournamentIds.delete(tournamentId);
  } else {
    openedTournamentIds.add(tournamentId);
  }

  renderTournamentList();
};

window.finishTournament = async function (tournamentId) {
  if (!requireLogin()) return;
  const operationSession = dataSessionGuard.captureWriteSession();
  if (!operationSession) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  if (!record) return;

  const standing = calculateTournamentStanding(record);
  const incompleteWarning = standing.isFinal
    ? ""
    : `\n\n目前尚未算出最終名次，將顯示「${standing.label}」。`;
  const ok = confirm(`確定要完成這場比賽嗎？\n目前計算成績：${standing.label}${incompleteWarning}\n\n完成後會隱藏新增對局與新增回合；按修改可重新開啟編輯。`);
  if (!ok) return;

  await submitTournamentOperation(operationSession, createTournamentOperation({
    type: TOURNAMENT_OPERATION_TYPES.UPDATE_TOURNAMENT,
    tournamentId,
    base: record,
    patch: { isFinished: true },
    updatedAt: Date.now()
  }));
};

function describeTournamentForDialog(record) {
  return [
    `名稱：${record.tournamentName || "-"}`,
    `日期：${record.date || "-"}`,
    `地點：${record.location || "-"}`,
    `總人數：${record.participantCount || "-"}`,
    `備註：${record.note || "-"}`,
    `狀態：${record.isFinished === true ? "已完成" : "編輯中"}`
  ].join("\n");
}

const TOURNAMENT_FIELD_LABELS = Object.freeze({
  tournamentName: "比賽名稱",
  date: "日期",
  location: "地點",
  participantCount: "總人數",
  note: "備註"
});

// The dialog stays open until the save is confirmed, so a failed or rejected
// save never discards what the user typed.
function openTournamentEditDialog(record, operationSession, submitEdit) {
  pendingTournamentInteractions.cancelAll();
  return new Promise(resolve => {
    const oldOverlay = document.getElementById("tournamentEditOverlay");
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement("div");
    overlay.id = "tournamentEditOverlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.72)";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "16px";
    overlay.style.boxSizing = "border-box";

    overlay.innerHTML = `
      <div style="width:420px;max-width:100%;max-height:100%;overflow-y:auto;background:#1b1b1b;color:#fff;border:1px solid #3a3a3a;border-radius:14px;padding:16px;box-sizing:border-box;box-shadow:0 12px 32px rgba(0,0,0,0.65);font-family:Arial,'Microsoft JhengHei',sans-serif;">
        <h4 style="margin:0 0 12px 0;font-size:18px;color:#fff;">修改比賽</h4>

        <label style="display:block;margin-bottom:6px;color:#dcdcdc;font-size:14px;">比賽名稱</label>
        <input id="editTournamentName" type="text" value="${escapeHtml(record.tournamentName || "")}" style="width:100%;margin-bottom:10px;">

        <label style="display:block;margin-bottom:6px;color:#dcdcdc;font-size:14px;">日期</label>
        <input id="editTournamentDate" type="date" value="${escapeHtml(record.date || "")}" style="width:100%;margin-bottom:10px;">

        <label style="display:block;margin-bottom:6px;color:#dcdcdc;font-size:14px;">地點</label>
        <input id="editTournamentLocation" type="text" value="${escapeHtml(record.location || "")}" style="width:100%;margin-bottom:10px;">

        <label style="display:block;margin-bottom:6px;color:#dcdcdc;font-size:14px;">總人數（包含自己）</label>
        <input id="editTournamentParticipantCount" type="number" min="2" step="1" inputmode="numeric" value="${escapeHtml(record.participantCount || "")}" style="width:100%;margin-bottom:10px;">
        ${record.rank && !record.participantCount ? `<div style="margin:-3px 0 10px;color:#9ba8b5;font-size:12px;">舊版手動名次：${escapeHtml(record.rank)}。輸入總人數後將改由系統計算。</div>` : ""}

        <label style="display:block;margin-bottom:6px;color:#dcdcdc;font-size:14px;">備註</label>
        <input id="editTournamentNote" type="text" value="${escapeHtml(record.note || "")}" style="width:100%;margin-bottom:14px;">
        ${record.isFinished === true ? `<div style="margin:-4px 0 12px;color:#9ba8b5;font-size:12px;">這場比賽目前為「已完成」，儲存後會重新開啟編輯。</div>` : ""}

        <div id="tournamentEditMessage" role="alert" hidden style="margin:0 0 12px;padding:10px 12px;border:1px solid #8a5a1f;border-radius:10px;background:rgba(255,170,60,0.12);color:#ffd8a8;font-size:13px;line-height:1.6;white-space:pre-line;"></div>

        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          <button type="button" id="cancelTournamentEditBtn">取消</button>
          <button type="button" id="saveTournamentEditBtn" class="primary-btn" data-write-action>保存並進入編輯</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    updateDataAccessUi();

    const nameInput = overlay.querySelector("#editTournamentName");
    const dateInput = overlay.querySelector("#editTournamentDate");
    const locationInput = overlay.querySelector("#editTournamentLocation");
    const participantCountInput = overlay.querySelector("#editTournamentParticipantCount");
    const noteInput = overlay.querySelector("#editTournamentNote");
    const messageBox = overlay.querySelector("#tournamentEditMessage");
    const cancelBtn = overlay.querySelector("#cancelTournamentEditBtn");
    const saveBtn = overlay.querySelector("#saveTournamentEditBtn");
    const defaultSaveLabel = saveBtn.textContent;

    let settled = false;
    let saving = false;
    let baseRecord = record;
    // L4: only opening the dialog on a finished tournament means "reopen it".
    const reopensFinished = record.isFinished === true;
    let unregisterCancel = () => {};

    // After a conflict, fields the user did not touch are refreshed to the
    // latest values so a re-save cannot write back another device's old data.
    const fieldInputs = {
      tournamentName: nameInput,
      date: dateInput,
      location: locationInput,
      participantCount: participantCountInput,
      note: noteInput
    };
    let shownValues = Object.fromEntries(Object.entries(fieldInputs).map(([key, input]) => [key, input.value]));

    function getRecordInputValues(source) {
      return {
        tournamentName: String(source.tournamentName || ""),
        date: String(source.date || ""),
        location: String(source.location || ""),
        participantCount: source.participantCount ? String(source.participantCount) : "",
        note: String(source.note || "")
      };
    }

    function close(value) {
      if (settled) return;
      settled = true;
      unregisterCancel();
      overlay.remove();
      resolve(value);
    }

    function showMessage(text) {
      messageBox.textContent = text || "";
      messageBox.hidden = !text;
    }

    cancelBtn.onclick = () => close(null);

    saveBtn.onclick = async () => {
      if (saving) return;
      if (!dataSessionGuard.isWriteSessionCurrent(operationSession)) {
        close(null);
        return;
      }
      const tournamentName = nameInput.value.trim();
      const date = dateInput.value;

      if (!tournamentName) {
        alert("請輸入比賽名稱。");
        return;
      }

      if (!date) {
        alert("請選擇日期。");
        return;
      }

      const participantCount = normalizeParticipantCount(participantCountInput.value);
      if (!participantCount) {
        alert("請輸入至少 2 人的比賽總人數（包含自己）。");
        return;
      }

      const values = {
        tournamentName,
        date,
        location: locationInput.value.trim(),
        participantCount,
        note: noteInput.value.trim()
      };

      saving = true;
      saveBtn.textContent = "儲存中...";
      showMessage("");
      let result;
      try {
        result = await submitEdit(values, baseRecord, { reopen: reopensFinished });
      } finally {
        saving = false;
      }
      if (settled) return;
      saveBtn.textContent = defaultSaveLabel;

      if (result && result.ok) {
        close(values);
        return;
      }

      const code = result ? result.code : TOURNAMENT_SYNC_CODES.NETWORK;
      if (code === TOURNAMENT_SYNC_CODES.SESSION_CHANGED) {
        close(null);
        return;
      }

      const latestRecord = tournamentRecords.find(item => item.id === record.id) || null;
      if (code === TOURNAMENT_SYNC_CODES.DELETED || (code === TOURNAMENT_SYNC_CODES.CONFLICT && !latestRecord)) {
        showMessage(TOURNAMENT_SYNC_MESSAGES[TOURNAMENT_SYNC_CODES.DELETED]);
        saveBtn.hidden = true;
        saveBtn.removeAttribute("data-write-action");
        cancelBtn.textContent = "關閉";
        return;
      }

      if (code === TOURNAMENT_SYNC_CODES.CONFLICT) {
        // The next save is an explicit new decision made against this copy.
        // Untouched fields now show the latest values; edited ones are kept,
        // and fields that both sides changed are listed instead of merged.
        baseRecord = latestRecord;
        const latestValues = getRecordInputValues(latestRecord);
        const collisions = [];
        Object.entries(fieldInputs).forEach(([key, input]) => {
          const userEdited = input.value !== shownValues[key];
          if (!userEdited) {
            input.value = latestValues[key];
          } else if (latestValues[key] !== shownValues[key] && latestValues[key] !== input.value) {
            collisions.push(`${TOURNAMENT_FIELD_LABELS[key]}：你的「${input.value || "（空白）"}」／雲端「${latestValues[key] || "（空白）"}」`);
          }
        });
        shownValues = latestValues;
        const parts = [TOURNAMENT_SYNC_MESSAGES[code], `雲端最新內容：\n${describeTournamentForDialog(latestRecord)}`];
        if (collisions.length) {
          parts.push(`以下欄位你和其他裝置都修改了，重新儲存會以你的輸入取代雲端的值；若要保留雲端的值，請先改回：\n${collisions.join("\n")}`);
        }
        if (latestRecord.isFinished === true && !reopensFinished) {
          parts.push("這場比賽已在其他裝置標記為「已完成」；重新儲存只會更新基本資料，不會重新開啟。");
        }
        parts.push("未修改的欄位已更新為雲端最新值，你修改的內容仍保留。確認後若仍要套用，請再按「以表單內容重新儲存」。");
        showMessage(parts.join("\n\n"));
        saveBtn.textContent = "以表單內容重新儲存";
        return;
      }

      showMessage((result && result.message) || TOURNAMENT_SYNC_MESSAGES[TOURNAMENT_SYNC_CODES.NETWORK]);
    };
    unregisterCancel = pendingTournamentInteractions.register(() => close(null));
  });
}

window.editTournament = async function (tournamentId) {
  if (!requireLogin()) return;
  const operationSession = dataSessionGuard.captureWriteSession();
  if (!operationSession) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  if (!record) return;

  await openTournamentEditDialog(record, operationSession, (values, baseRecord, { reopen = false } = {}) => {
    if (!dataSessionGuard.isWriteSessionCurrent(operationSession)) {
      return { ok: false, code: TOURNAMENT_SYNC_CODES.SESSION_CHANGED };
    }
    return submitTournamentOperation(operationSession, createTournamentOperation({
      type: TOURNAMENT_OPERATION_TYPES.UPDATE_TOURNAMENT,
      tournamentId,
      base: baseRecord,
      // isFinished changes only when the user reopened a finished tournament.
      patch: reopen ? { ...values, isFinished: false } : values,
      updatedAt: Date.now()
    }), {
      notify: "silent",
      onSaved: () => openedTournamentIds.add(tournamentId)
    });
  });
};

window.deleteTournament = async function (tournamentId) {
  if (!requireLogin()) return;
  const operationSession = dataSessionGuard.captureWriteSession();
  if (!operationSession) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  if (!record) return;

  const ok = confirm(`確定要刪除「${record.tournamentName || "這場比賽"}」嗎？`);
  if (!ok) return;

  await submitTournamentOperation(operationSession, createTournamentOperation({
    type: TOURNAMENT_OPERATION_TYPES.DELETE_TOURNAMENT,
    tournamentId,
    base: record,
    updatedAt: Date.now()
  }), {
    onSaved: () => openedTournamentIds.delete(tournamentId)
  });
};

window.addMatch = async function (tournamentId) {
  if (!requireLogin()) return;
  const operationSession = dataSessionGuard.captureWriteSession();
  if (!operationSession) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  if (!record) return;

  if (record.isFinished) {
    alert("這場比賽已完成。請先按修改，再新增對局。");
    return;
  }

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

  const submittedDraft = readTournamentFormScope(tournamentId, "", MATCH_FORM_DRAFT_FIELDS);
  await submitTournamentOperation(operationSession, createTournamentOperation({
    type: TOURNAMENT_OPERATION_TYPES.ADD_MATCH,
    tournamentId,
    base: record,
    updatedAt: Date.now(),
    match: {
      id: generateId("match"),
      opponentName,
      deck: deckTexts.map(text => ({
        source: configOptions.some(option => option.text === text) ? "config" : "custom",
        configText: text
      })),
      rounds: []
    }
  }), {
    onSaved: () => {
      openedTournamentIds.add(tournamentId);
      clearTournamentFormDraftIfUnchanged(tournamentId, "", MATCH_FORM_DRAFT_FIELDS, submittedDraft);
    }
  });
};

window.addDirectAdvance = async function (tournamentId, advancementType) {
  if (!requireLogin()) return;
  const operationSession = dataSessionGuard.captureWriteSession();
  if (!operationSession) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  const advanceInfo = DIRECT_ADVANCE_TYPES[advancementType];
  if (!record || !advanceInfo) return;

  if (record.isFinished) {
    alert("這場比賽已完成。請先按修改，再新增直接晉級紀錄。");
    return;
  }

  const ok = confirm(`確定要新增「${advanceInfo.label}」嗎？\n這筆紀錄會計為晉級一輪，不會建立比分或回合。`);
  if (!ok) return;

  await submitTournamentOperation(operationSession, createTournamentOperation({
    type: TOURNAMENT_OPERATION_TYPES.ADD_MATCH,
    tournamentId,
    base: record,
    updatedAt: Date.now(),
    match: {
      id: generateId("match"),
      advancementType,
      opponentName: advanceInfo.opponentName,
      deck: [],
      rounds: []
    }
  }), {
    onSaved: () => openedTournamentIds.add(tournamentId)
  });
};

window.editMatch = async function (tournamentId, matchId) {
  if (!requireLogin()) return;
  const operationSession = dataSessionGuard.captureWriteSession();
  if (!operationSession) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  const match = record?.matches?.find(item => item.id === matchId);
  if (!record || !match) return;

  if (DIRECT_ADVANCE_TYPES[match.advancementType]) {
    alert("直接晉級紀錄不需要修改對手或陀螺；若類型選錯，請刪除後重新新增。");
    return;
  }

  if (record.isFinished) {
    alert("這場比賽已完成。請先按修改，再調整對局。");
    return;
  }

  // M1: a draft keeps the values the user started from (base) and what the
  // user typed (values). Reusing it after a failed save only carries over the
  // fields the user changed; everything else comes from the latest copy.
  const draftKey = JSON.stringify([tournamentId, matchId]);
  const draft = canUseTournamentDrafts() ? matchEditDrafts.get(draftKey) : null;
  const latestValues = getMatchEditValues(match);
  const defaults = { ...latestValues };

  if (draft) {
    const collisions = [];
    MATCH_EDIT_FIELDS.forEach(field => {
      const userChanged = draft.values[field] !== draft.base[field];
      if (!userChanged) return;
      defaults[field] = draft.values[field];
      const otherChanged = latestValues[field] !== draft.base[field];
      if (otherChanged && latestValues[field] !== draft.values[field]) collisions.push(field);
    });

    if (collisions.length) {
      const lines = collisions.map(field => `${MATCH_EDIT_LABELS[field]}：你的「${draft.values[field] || "（空白）"}」／雲端「${latestValues[field] || "（空白）"}」`);
      const keepMine = confirm(`以下欄位你和其他裝置都修改了：\n${lines.join("\n")}\n\n按「確定」以你的輸入作為預設值繼續編輯；按「取消」改用雲端最新值。`);
      if (!keepMine) collisions.forEach(field => { defaults[field] = latestValues[field]; });
    }
  }

  const opponentName = prompt("對手名稱", defaults.opponentName);
  if (opponentName === null) return;

  const newDeck = [];

  for (let i = 0; i < 3; i++) {
    const value = prompt(`陀螺 ${i + 1}`, defaults[`deck${i + 1}`]);
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

  if (!dataSessionGuard.isWriteSessionCurrent(operationSession)) return;
  const patch = { opponentName: opponentName.trim(), deck: newDeck };
  const finalValues = { opponentName: patch.opponentName };
  newDeck.forEach((item, index) => { finalValues[`deck${index + 1}`] = item.configText; });

  // A save that reuses an earlier unsaved draft needs an explicit go-ahead.
  if (draft) {
    const summary = MATCH_EDIT_FIELDS.map(field => `${MATCH_EDIT_LABELS[field]}：${finalValues[field] || "（空白）"}`).join("\n");
    if (!confirm(`確定要以這些內容重新儲存這局嗎？\n\n${summary}`)) return;
  }

  const newDraft = { base: latestValues, values: finalValues };
  if (canUseTournamentDrafts()) matchEditDrafts.set(draftKey, newDraft);

  await submitTournamentOperation(operationSession, createTournamentOperation({
    type: TOURNAMENT_OPERATION_TYPES.EDIT_MATCH,
    tournamentId,
    base: record,
    matchId,
    patch,
    updatedAt: Date.now()
  }), {
    // L2: only the draft created for this save may be cleared by it.
    onSaved: () => {
      if (matchEditDrafts.get(draftKey) === newDraft) matchEditDrafts.delete(draftKey);
    }
  });
};

window.deleteMatch = async function (tournamentId, matchId) {
  if (!requireLogin()) return;
  const operationSession = dataSessionGuard.captureWriteSession();
  if (!operationSession) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  if (!record) return;

  if (record.isFinished) {
    alert("這場比賽已完成。請先按修改，再刪除對局。");
    return;
  }

  const ok = confirm("確定要刪除這局對戰紀錄嗎？");
  if (!ok) return;

  await submitTournamentOperation(operationSession, createTournamentOperation({
    type: TOURNAMENT_OPERATION_TYPES.DELETE_MATCH,
    tournamentId,
    base: record,
    matchId,
    updatedAt: Date.now()
  }), {
    onSaved: () => matchEditDrafts.delete(JSON.stringify([tournamentId, matchId]))
  });
};

window.addRound = async function (tournamentId, matchId) {
  if (!requireLogin()) return;
  const operationSession = dataSessionGuard.captureWriteSession();
  if (!operationSession) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  const match = record?.matches?.find(item => item.id === matchId);
  if (!record || !match) return;

  if (DIRECT_ADVANCE_TYPES[match.advancementType]) {
    alert("直接晉級紀錄不需要新增回合。");
    return;
  }

  if (record.isFinished) {
    alert("這場比賽已完成。請先按修改，再新增回合。");
    return;
  }

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

  const submittedDraft = readTournamentFormScope(tournamentId, matchId, ROUND_FORM_DRAFT_FIELDS);
  await submitTournamentOperation(operationSession, createTournamentOperation({
    type: TOURNAMENT_OPERATION_TYPES.ADD_ROUND,
    tournamentId,
    base: record,
    matchId,
    updatedAt: Date.now(),
    round: {
      id: generateId("round"),
      result,
      scoreType,
      point: scoreInfo.point,
      myBeyblade: beyblade,
      note
    }
  }), {
    onSaved: () => clearTournamentFormDraftIfUnchanged(tournamentId, matchId, ROUND_FORM_DRAFT_FIELDS, submittedDraft)
  });
};

window.deleteRound = async function (tournamentId, matchId, roundId) {
  if (!requireLogin()) return;
  const operationSession = dataSessionGuard.captureWriteSession();
  if (!operationSession) return;

  const record = tournamentRecords.find(item => item.id === tournamentId);
  const match = record?.matches?.find(item => item.id === matchId);
  if (!record || !match) return;

  if (record.isFinished) {
    alert("這場比賽已完成。請先按修改，再刪除回合。");
    return;
  }

  const ok = confirm("確定要刪除這筆回合紀錄嗎？");
  if (!ok) return;

  await submitTournamentOperation(operationSession, createTournamentOperation({
    type: TOURNAMENT_OPERATION_TYPES.DELETE_ROUND,
    tournamentId,
    base: record,
    matchId,
    roundId,
    updatedAt: Date.now()
  }));
};

/* ===== D-017 tournament transactions: end ===== */

document.addEventListener("DOMContentLoaded", function () {
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const retryDataLoadBtn = document.getElementById("retryDataLoadBtn");

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", loginWithGoogle);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutGoogle);
  }

  if (retryDataLoadBtn) {
    retryDataLoadBtn.addEventListener("click", retryTournamentDataLoad);
  }

  const clientVersion = document.getElementById("tournamentClientVersion");
  if (clientVersion) {
    clientVersion.textContent = TOURNAMENT_CLIENT_VERSION;
    clientVersion.hidden = false;
  }

  renderTournamentList();
  setSyncStatus("請先使用 Google 登入", "muted");

  onAuthStateChanged(auth, user => {
    pendingTournamentInteractions.cancelAll();
    resetTournamentSaveState();
    syncTournamentDraftOwner(user);
    currentUser = user;
    updateAuthUI(user);
    dataSessionGuard.reset();
    mainData = {};
    tournamentRecords = [];
    configOptions = [];
    openedTournamentIds.clear();
    updateDataAccessUi();

    if (user) {
      const sessionToken = beginTournamentDataSession();
      setSyncStatus("已登入，正在載入參賽紀錄...", "login");
      renderTournamentList();
      void loadTournamentData(sessionToken);
    } else {
      renderTournamentList();
      setSyncStatus("尚未登入", "muted");
    }
  });
});
