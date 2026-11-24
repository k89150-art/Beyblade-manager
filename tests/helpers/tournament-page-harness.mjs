// Runs the real tournament.js inside an isolated VM. Only the ES module
// imports are replaced: Firebase calls go to a mock Firestore, while
// data-session-guard.js and tournament-sync.js are the real modules. Nothing
// here touches Firebase, the network or the working tree.
import fs from "node:fs";
import vm from "node:vm";
import * as guardModule from "../../data-session-guard.js";
import * as syncModule from "../../tournament-sync.js";
import * as panelModule from "../../tournament-panel.js";

const SOURCE_URL = new URL("../../tournament.js", import.meta.url);

export function loadTournamentSource() {
  return fs.readFileSync(SOURCE_URL, "utf8");
}

function stripImports(source) {
  const stripped = source.replace(/^import\s[\s\S]*?\sfrom\s+"[^"]+";[ \t]*\r?$/gm, "");
  if (/^import\s/m.test(stripped)) throw new Error("harness: an import statement was not stripped");
  return stripped;
}

function setConstant(source, name, value) {
  const pattern = new RegExp(`const ${name} = (\\d+|\\[[^\\]]*\\]);`);
  if (!pattern.test(source)) throw new Error(`harness: missing constant ${name}`);
  return source.replace(pattern, `const ${name} = ${value};`);
}

const ACCESSOR = `
globalThis.__test = {
  get records() { return tournamentRecords; },
  get mainData() { return mainData; },
  get session() { return dataSessionGuard.snapshot(); },
  get busy() { return isTournamentSaveBusy(); },
  get matchEditDrafts() { return matchEditDrafts; },
  get formDrafts() { return tournamentFormDrafts; },
  get opened() { return openedTournamentIds; },
  get pendingAdd() { return pendingAddTournamentDraft; },
  setEditDialog(fn) { openTournamentEditDialog = fn; },
  setMatchEditPanel(fn) { openMatchEditPanel = fn; }
};
`;

function createElement(initial = {}) {
  return {
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    style: {},
    dataset: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener() {},
    ...initial
  };
}

export async function waitFor(predicate, { timeoutMs = 2000, label = "condition" } = {}) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`harness: timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}

export async function createTournamentPage({
  mock,
  source = loadTournamentSource(),
  saveTimeoutMs = 15000,
  verifyTimeoutMs = 10000,
  slowNoticeMs = 5000,
  retryDelaysMs = [0],
  idTag = ""
} = {}) {
  let transformed = stripImports(source);
  transformed = setConstant(transformed, "TOURNAMENT_SAVE_TIMEOUT_MS", saveTimeoutMs);
  transformed = setConstant(transformed, "TOURNAMENT_VERIFY_TIMEOUT_MS", verifyTimeoutMs);
  transformed = setConstant(transformed, "TOURNAMENT_SAVE_SLOW_NOTICE_MS", slowNoticeMs);
  transformed = setConstant(transformed, "TOURNAMENT_RETRY_DELAYS_MS", JSON.stringify(retryDelaysMs));
  transformed += ACCESSOR;

  const alerts = [];
  const confirms = [];
  const statuses = [];
  const warnings = [];
  const promptAnswers = [];
  const idLog = [];
  let confirmAnswer = true;
  const confirmAnswers = [];
  let renders = 0;
  let domReady = null;
  let authCallback = null;
  let idCounter = 0;

  const elements = {};
  ["tournamentDate", "tournamentName", "tournamentLocation", "tournamentParticipantCount", "tournamentNote",
    "googleLoginBtn", "logoutBtn", "userInfo", "userEmail", "retryDataLoadBtn"].forEach(id => {
    elements[id] = createElement();
  });

  // Phase 7-4a: tests can place one fake record panel in the list.
  let panelElement = null;
  let dialogElement = null;
  const list = createElement({
    querySelectorAll: selector => {
      if (panelElement && (selector === "[data-round-panel]" || selector === "[data-round-panel][data-match-id]")) return [panelElement];
      if (dialogElement && selector === "[data-match-dialog]") return [dialogElement];
      return [];
    }
  });
  let listHtml = "";
  Object.defineProperty(list, "innerHTML", {
    get: () => listHtml,
    set: value => { listHtml = value; renders += 1; }
  });
  elements.tournamentList = list;

  const syncStatus = createElement();
  syncStatus.classList = {
    remove() {},
    add(className) { statuses.push({ text: syncStatus.textContent, type: className.replace(/^status-/, "") }); }
  };
  elements.syncStatus = syncStatus;

  const cards = new Map();
  const document = {
    body: createElement({ classList: { toggle() {} }, appendChild() {} }),
    getElementById: id => elements[id] || null,
    querySelectorAll: () => [],
    querySelector: selector => cards.get(selector) || null,
    addEventListener: (type, listener) => {
      if (type === "DOMContentLoaded") domReady = listener;
    },
    createElement: () => {
      throw new Error("harness: the edit dialog is replaced in VM tests");
    }
  };

  const navigator = { onLine: true };
  const context = {
    window: {},
    document,
    navigator,
    console: { warn: (...args) => warnings.push(args), error: () => {}, log: () => {} },
    alert: message => alerts.push(String(message)),
    confirm: message => {
      confirms.push(String(message));
      return confirmAnswers.length ? confirmAnswers.shift() : confirmAnswer;
    },
    prompt: (message, defaultValue) => {
      const answer = promptAnswers.shift();
      return typeof answer === "function" ? answer(defaultValue, message) : answer === undefined ? defaultValue : answer;
    },
    setTimeout,
    clearTimeout,
    initializeApp: () => ({}),
    getAuth: () => ({}),
    GoogleAuthProvider: class {},
    signInWithPopup: async () => {},
    signOut: async () => {},
    onAuthStateChanged: (auth, callback) => {
      authCallback = callback;
      return () => {};
    },
    getFirestore: () => ({}),
    doc: mock.doc,
    getDocFromServer: mock.getDocFromServer,
    runTransaction: mock.runTransaction,
    ...guardModule,
    ...syncModule,
    ...panelModule
  };

  vm.createContext(context);
  vm.runInContext(transformed, context, { filename: "tournament.js" });
  // Deterministic ids that still go through generateId() exactly once per call.
  vm.runInContext(`generateId = function (prefix = "id") { return globalThis.__nextId(prefix); };`, context);
  // Phase 7-4c: the edit-match panel (DOM) is replaced by the same four
  // prompt() answers the tests queue, asked in the original order: a cancel
  // stops, and a blank bey stops (editMatch then shows its alert).
  vm.runInContext(`openMatchEditPanel = async function (match, defaults) {
    const opponentName = prompt("對手名稱", defaults.opponentName);
    if (opponentName === null) return null;
    const decks = [];
    for (let i = 0; i < 3; i++) {
      const value = prompt("陀螺 " + (i + 1), defaults["deck" + (i + 1)]);
      if (value === null) return null;
      decks.push(value);
      if (!String(value).trim()) break;
    }
    return { opponentName, decks };
  };`, context);
  context.__nextId = prefix => {
    idCounter += 1;
    const id = `${prefix}_${idTag}${idCounter}`;
    idLog.push(id);
    return id;
  };
  domReady();

  const api = context.__test;
  const page = {
    context,
    window: context.window,
    api,
    alerts,
    confirms,
    statuses,
    warnings,
    idLog,
    navigator,
    elements,
    get renders() { return renders; },
    get listHtml() { return listHtml; },
    setConfirm(value) { confirmAnswer = value; },
    queueConfirms(...answers) { confirmAnswers.push(...answers); },
    queuePrompts(...answers) { promptAnswers.push(...answers); },
    setMatchEditPanel(fn) { api.setMatchEditPanel(fn); },
    setCard(selector, element) { cards.set(selector, element); },
    // Phase 7-4a: a record panel for (tournamentId, matchId) holding the round
    // fields; it is also the first [data-match-id] element, as on the page.
    setPanel(tournamentId, matchId, values = {}) {
      const fields = {
        "[data-round-beyblade]": { value: values.beyblade ?? "" },
        "[data-round-result]": { value: values.result ?? "" },
        "[data-round-score-type]": { value: values.scoreType ?? "" },
        "[data-round-note]": { value: values.note ?? "" }
      };
      const message = { textContent: "" };
      panelElement = {
        attributes: { "data-round-panel": tournamentId, "data-match-id": matchId },
        getAttribute(name) { return this.attributes[name] ?? null; },
        querySelector: selector => (selector === "[data-panel-message]" ? message : fields[selector] || null),
        querySelectorAll: () => [],
        fields,
        message
      };
      cards.set(`[data-match-id="${matchId}"]`, panelElement);
      return panelElement;
    },
    clearPanel() { panelElement = null; },
    // Phase 7-4b: the new-match dialog element for one tournament (its fields
    // are the ones setMatchForm registers for addMatch).
    setMatchDialog(tournamentId) {
      dialogElement = tournamentId ? { getAttribute: name => (name === "data-match-dialog" ? tournamentId : null), querySelector: () => null } : null;
    },
    lastStatus() { return statuses.at(-1) || null; },
    plain(value) { return JSON.parse(JSON.stringify(value ?? null)); },
    setAddForm(values) {
      Object.entries(values).forEach(([id, value]) => { elements[id].value = value; });
    },
    async signIn(uid) {
      authCallback(uid ? { uid, email: `${uid}@example.test` } : null);
      if (uid) await waitFor(() => api.session.state !== "loading", { label: "tournament load" });
    },
    useEditDialog(values) {
      const calls = [];
      api.setEditDialog(async (record, session, submitEdit) => {
        // Mirrors the real dialog: opening it on a finished tournament means reopen.
        const result = await submitEdit(values, record, { reopen: record.isFinished === true });
        calls.push(result);
        return result && result.ok ? values : null;
      });
      return calls;
    }
  };
  return page;
}

// Registers the DOM pieces addMatch() reads for one tournament card.
export function setMatchForm(page, tournamentId, { opponent = "", deck = ["", "", ""] } = {}) {
  const card = `[data-tournament-id="${tournamentId}"]`;
  page.setCard(card, { querySelector: selector => (selector === "[data-match-opponent]" ? { value: opponent } : null) });
  deck.forEach((value, index) => page.setCard(`${card} [data-deck-custom="${index + 1}"]`, { value }));
}

// Registers the DOM pieces addRound() reads for one match card.
export function setRoundForm(page, matchId, { beyblade = "", result = "win", scoreType = "spin", note = "" } = {}) {
  const fields = {
    "[data-round-beyblade]": { value: beyblade },
    "[data-round-result]": { value: result },
    "[data-round-score-type]": { value: scoreType },
    "[data-round-note]": { value: note }
  };
  page.setCard(`[data-match-id="${matchId}"]`, { querySelector: selector => fields[selector] || null });
}
