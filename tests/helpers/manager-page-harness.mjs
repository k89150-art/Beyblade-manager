// Runs the real save / snapshot code of script.js (main page) inside an
// isolated VM, one VM per simulated device. Firebase calls go to the shared
// mock Firestore (tests/helpers/mock-firestore.mjs); data-session-guard.js and
// collection-sync.js are the real modules. The DOM tables are replaced by a
// plain in-memory "screen" so tests can edit rows like a user would.
// Nothing here touches Firebase, the network or the working tree.
import fs from "node:fs";
import vm from "node:vm";
import * as guardModule from "../../data-session-guard.js";
import * as collectionModule from "../../collection-sync.js";
import { firestoreError, userDocPath } from "./mock-firestore.mjs";

const SOURCE_URL = new URL("../../script.js", import.meta.url);

export function loadManagerSource() {
  return fs.readFileSync(SOURCE_URL, "utf8");
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + 1);
  if (start < 0 || end <= start) throw new Error(`harness: missing source range ${startMarker}`);
  return source.slice(start, end);
}

function setConstantIfPresent(source, name, value) {
  const pattern = new RegExp(`const ${name} = (\\d+|\\[[^\\]]*\\]);`);
  return pattern.test(source) ? source.replace(pattern, `const ${name} = ${value};`) : source;
}

function setConstant(source, name, value) {
  const pattern = new RegExp(`const ${name} = (\\d+|\\[[^\\]]*\\]);`);
  if (!pattern.test(source)) throw new Error(`harness: missing constant ${name}`);
  return source.replace(pattern, `const ${name} = ${value};`);
}

export const MANAGER_SLICES = Object.freeze([
  ["let currentUser = null;", "const STOCK_PRODUCTS_URL"],
  ["function isReadOnly()", "function getUserDocRef("],
  ["function updateDataAccessUi()", "function cancelSessionInteractions()"],
  ["function beginDataSession(", "const partTypes"],
  ["/* ===== D-018 collection saves: begin", "/* ===== D-018 collection saves: end"],
  ["function startCloudListener(", "/* ====== 第一區"],
  ["/* ====== 管理員：切換檢視使用者 ====== */", "/* ====== Google 登入 / 登出 ====== */"]
]);

const ACCESSOR = `
globalThis.__test = {
  get guard() { return dataSessionGuard; },
  get sync() { return collectionSync; },
  get saving() { return isSavingCloudData; },
  get pending() { return hasPendingCloudSave; },
  get deferred() { return deferredCollectionRemote; },
  setUser(user) { currentUser = user; },
  get user() { return currentUser; }
};
`;

function clone(value) {
  return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value));
}

function createElement() {
  return {
    hidden: false,
    textContent: "",
    disabled: false,
    dataset: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); }
  };
}

// upgrade(rows) may return { rows, count } to mimic D-015 catalog upgrades
// done while applying cloud rows to the screen.
export function createManagerDevice({
  mock,
  uid = "user-a",
  email = "a@example.test",
  source = loadManagerSource(),
  saveTimeoutMs = 15000,
  upgrade = null,
  retryDelaysMs = [0, 0, 0, 0],
  admin = false
} = {}) {
  const screen = { tables: collectionModule.pickCollectionTables(null) };
  const effects = { alerts: [], confirms: [], status: [], cancels: 0, rebuilds: 0, listeners: [], warnings: [] };
  let unsavedInteraction = false;
  let confirmAnswer = true;
  let offline = false;
  let serverReadsFail = false;
  const elements = new Map(["collectionSyncNotice", "collectionSyncMessage", "collectionRetryBtn",
    "collectionLoadCloudBtn", "collectionKeepLocalBtn", "retryDataLoadBtn", "syncStatus",
    "adminUidInput", "adminReturnBtn"].map(id => [id, { ...createElement(), value: "", style: {} }]));
  const body = createElement();

  let code = MANAGER_SLICES.map(([start, end]) => sourceBetween(source, start, end)).join("\n");
  code = setConstant(code, "COLLECTION_SAVE_TIMEOUT_MS", String(saveTimeoutMs));
  code = setConstantIfPresent(code, "COLLECTION_ECHO_VERIFY_RETRY_MS", "[0, 0]");

  const context = {
    ...guardModule,
    ...collectionModule,
    COLLECTION_RETRY_DELAYS_MS: retryDelaysMs,
    db: {},
    window: {},
    isAdmin: () => admin,
    getDocFromServer: ref => ((offline || serverReadsFail)
      ? Promise.reject(firestoreError("unavailable", "mock: server read failed"))
      : mock.getDocFromServer(ref)),
    document: {
      body,
      querySelectorAll: () => [],
      getElementById: id => elements.get(id) || null
    },
    getUserDocRef: targetUid => (targetUid ? { path: userDocPath(targetUid), uid: targetUid } : null),
    // Transactions need the server: an offline device fails at once (the SDK
    // does not queue them like plain writes).
    runTransaction: (db, updateFunction, options) => (offline
      ? Promise.reject(firestoreError("unavailable", "mock: device offline"))
      : mock.runTransaction(db, updateFunction, options)),
    onSnapshot: (ref, options, next, error) => {
      const listener = { ref, options, next, error, active: true };
      effects.listeners.push(listener);
      return () => { listener.active = false; };
    },
    collectCurrentData: () => ({
      ...clone(screen.tables),
      ownerUid: context.__test.user?.uid || "",
      ownerEmail: context.__test.user?.email || "",
      updatedAt: Date.now()
    }),
    applyDataToTables: data => {
      effects.rebuilds += 1;
      const tables = collectionModule.pickCollectionTables(data);
      let count = 0;
      if (upgrade) {
        const result = upgrade(tables.beybladeTable);
        tables.beybladeTable = result.rows;
        count = result.count;
      }
      screen.tables = tables;
      return count;
    },
    clearAllTables: () => { screen.tables = collectionModule.pickCollectionTables(null); },
    refreshSelectors() {},
    loadStockProducts: async () => {},
    cancelSessionInteractions: () => {
      effects.cancels += 1;
      unsavedInteraction = false;
    },
    hasUnsavedDomInteraction: () => unsavedInteraction,
    setSyncStatus: (text, type) => effects.status.push([text, type]),
    alert: message => effects.alerts.push(String(message)),
    confirm: message => {
      effects.confirms.push(String(message));
      return confirmAnswer;
    },
    console: { warn: (...args) => effects.warnings.push(args.join(" ")), error() {}, log() {} },
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Promise
  };
  vm.createContext(context);
  vm.runInContext(code + ACCESSOR, context);
  const t = context.__test;

  function listener() {
    return effects.listeners.filter(item => item.active).at(-1);
  }

  const device = {
    context,
    effects,
    screen,
    elements,
    body,
    get tables() { return screen.tables; },
    get state() { return t.sync.state; },
    get sync() { return t.sync; },
    get guard() { return t.guard; },
    get saving() { return t.saving; },
    get deferred() { return t.deferred; },
    setUnsavedInteraction(value) { unsavedInteraction = Boolean(value); },
    setConfirm(value) { confirmAnswer = Boolean(value); },
    setOffline(value) { offline = Boolean(value); },
    setServerReadsFail(value) { serverReadsFail = Boolean(value); },

    // Mirrors the admin "瀏覽" button (window.adminViewUser).
    adminView(targetUid) {
      elements.get("adminUidInput").value = targetUid;
      return context.window.adminViewUser();
    },

    // Mirrors onAuthStateChanged for a signed-in user.
    signIn(nextUid = uid, nextEmail = email) {
      context.cancelSessionInteractions();
      t.setUser({ uid: nextUid, email: nextEmail });
      context.cancelPendingCloudSaves();
      t.guard.reset();
      t.sync.reset();
      vm.runInContext("deferredCollectionRemote = null; initialDocumentMissingGeneration = null;", context);
      context.clearAllTables();
      const token = context.beginDataSession(nextUid, false);
      context.startCloudListener(token);
      return token;
    },

    signOut() {
      t.setUser(null);
      context.cancelPendingCloudSaves();
      t.guard.reset();
      t.sync.reset();
      context.clearAllTables();
    },

    reload() {
      context.loadCloudDataForCurrentTarget({ clearExisting: false });
    },

    // Delivers the cloud document as it is now (the device's sync "arrives").
    deliver({ fromCache = false, data } = {}) {
      const current = listener();
      if (!current) throw new Error("harness: no active listener");
      const raw = data !== undefined ? data : mock.read(current.ref.path);
      current.next({
        metadata: { fromCache, hasPendingWrites: false },
        exists: () => raw !== null && raw !== undefined,
        data: () => clone(raw)
      });
    },

    // Edits the screen like a user action, then calls the real saveData().
    edit(table, change) {
      const rows = clone(screen.tables[table]);
      screen.tables[table] = change(rows) || rows;
      return context.saveData();
    },

    save() {
      return context.saveData();
    },

    async settle({ timeoutMs = 3000 } = {}) {
      const started = Date.now();
      for (;;) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!t.saving && !t.pending) {
          await new Promise(resolve => setTimeout(resolve, 0));
          if (!t.saving && !t.pending) return;
        }
        if (Date.now() - started > timeoutMs) throw new Error("harness: save did not settle");
      }
    },

    partNames() {
      return screen.tables.partTable.map(row => row.cells[1]);
    }
  };
  return device;
}

export function partRow(name, count = "1") {
  return { cells: ["固鎖", name, String(count)] };
}
