// Phase 7-3a: runs the REAL main-page script (script.js from its first page
// variable to the end) inside an isolated VM over a small in-memory DOM, so the
// actual config flows (window.addConfig, window.restoreHistoryRow, the config
// sort, collectCurrentData, the D-018 load baseline and saveData) run exactly
// as written. Firebase calls go to the mock Firestore; data-session-guard.js,
// collection-sync.js, assembly-rules.js and collection-view.js are the real
// modules. Nothing here touches Firebase, the network or the working tree.
import fs from "node:fs";
import vm from "node:vm";
import * as guardModule from "../../data-session-guard.js";
import * as collectionModule from "../../collection-sync.js";
import * as assemblyModule from "../../assembly-rules.js";
import * as viewModule from "../../collection-view.js";
import * as configViewModule from "../../config-view.js";
import * as catalogNamesModule from "../../stock-catalog-names.js";

const SOURCE_URL = new URL("../../script.js", import.meta.url);
const TABLE_IDS = ["beybladeTable", "partTable", "configTable", "historyTable"];

function unescapeHtml(text) {
  return String(text)
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}

function escapeAttr(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// The child nodes a browser creates for `cell.innerText = text`: each line
// break (CRLF, CR or LF) becomes a <br>, everything else stays text.
export function innerTextNodes(text) {
  const nodes = [];
  String(text).split(/\r\n|\r|\n/).forEach((part, index) => {
    if (index) nodes.push({ nodeType: 1, nodeName: "BR" });
    if (part) nodes.push({ nodeType: 3, nodeName: "#text", nodeValue: part });
  });
  return nodes;
}

// ---------- in-memory DOM ----------

function createDom() {
  // How innerText reads data cells: "raw" like a display:none cell (the text
  // as stored), "rendered" like a visible cell (whitespace runs collapsed,
  // trimmed). Real pages switch between the two when card styles apply (D-023).
  const textView = { mode: "raw" };
  // Real pages enable every [data-write-action] button once the session is
  // writable (updateDataAccessUi); the page sets this after it starts.
  const writeState = { writable: () => false };
  const observers = [];
  const pendingTargets = new Set();
  let flushQueued = false;

  function notify(target) {
    if (!observers.some(item => item.target === target)) return;
    pendingTargets.add(target);
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(() => {
      flushQueued = false;
      const targets = [...pendingTargets];
      pendingTargets.clear();
      observers.filter(item => targets.includes(item.target) && item.active).forEach(item => item.callback([{ type: "childList" }], item.observer));
    });
  }

  class MutationObserver {
    constructor(callback) { this.callback = callback; this.entries = []; }
    observe(target) {
      const entry = { target, callback: this.callback, observer: this, active: true };
      this.entries.push(entry);
      observers.push(entry);
    }
    disconnect() { this.entries.forEach(entry => { entry.active = false; }); }
    takeRecords() { return []; }
  }

  function classList() {
    const set = new Set();
    return {
      add: (...names) => names.forEach(name => set.add(name)),
      remove: (...names) => names.forEach(name => set.delete(name)),
      toggle: (name, force) => {
        const on = force === undefined ? !set.has(name) : Boolean(force);
        if (on) set.add(name); else set.delete(name);
        return on;
      },
      contains: name => set.has(name)
    };
  }

  function genericElement(id = "") {
    const listeners = {};
    return {
      id,
      hidden: false,
      disabled: false,
      value: "",
      textContent: "",
      innerHTML: "",
      dataset: {},
      style: {},
      attributes: {},
      classList: classList(),
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      removeAttribute(name) { delete this.attributes[name]; },
      toggleAttribute(name, force) { const on = force ?? !(name in this.attributes); if (on) this.attributes[name] = ""; else delete this.attributes[name]; return on; },
      addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
      removeEventListener(type, handler) { listeners[type] = (listeners[type] || []).filter(item => item !== handler); },
      dispatch(type, event = {}) { (listeners[type] || []).forEach(handler => handler(event)); },
      focus() { document.activeElement = this; },
      blur() {},
      contains: () => false,
      closest: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      appendChild(child) { return child; },
      insertBefore(child) { return child; },
      remove() {},
      scrollIntoView() {}
    };
  }

  function createOption(value = "", text = "") {
    const option = { tag: "option", value: String(value), textContent: String(text), owner: null };
    option.remove = () => {
      if (!option.owner) return;
      option.owner.options = option.owner.options.filter(item => item !== option);
      if (option.owner.selected === option) option.owner.selected = null;
      option.owner = null;
    };
    return option;
  }

  // A <select>: the value can only be one of its options (as in a browser).
  function createSelect(id) {
    const select = genericElement(id);
    select.tag = "select";
    select.options = [];
    select.selected = null;
    Object.defineProperty(select, "children", { get() { return select.options; } });
    Object.defineProperty(select, "innerHTML", {
      get() { return select.options.map(option => `<option value="${escapeAttr(option.value)}">${option.textContent}</option>`).join(""); },
      set(html) {
        select.options = [];
        select.selected = null;
        for (const match of String(html).matchAll(/<option value="([^"]*)">([\s\S]*?)<\/option>/g)) {
          const option = createOption(unescapeHtml(match[1]), match[2].trim());
          option.owner = select;
          select.options.push(option);
        }
      }
    });
    Object.defineProperty(select, "value", {
      get() { return (select.selected || select.options[0])?.value ?? ""; },
      set(value) {
        const found = select.options.find(option => option.value === String(value));
        select.selected = found || null;
        if (!found) select.selected = { value: "" };
      }
    });
    select.querySelector = selector => {
      const match = String(selector).match(/^option\[value="([^"]*)"\]$/);
      return match ? select.options.find(option => option.value === match[1]) || null : null;
    };
    select.insertBefore = (option, reference) => {
      option.owner = select;
      const index = reference ? select.options.indexOf(reference) : -1;
      if (index >= 0) select.options.splice(index, 0, option); else select.options.push(option);
      return option;
    };
    return select;
  }

  function stripTags(html) {
    return unescapeHtml(String(html).replace(/<[^>]*>/g, ""));
  }

  function createTable(id) {
    const table = { id, tag: "table" };
    const tbody = { tag: "tbody", table, rows: [] };
    table.tbody = tbody;

    function createCell(row) {
      let text = "";
      let html = "";
      const cell = { tag: "td", dataset: {}, parentElement: row };
      Object.defineProperty(cell, "innerText", {
        get() { return textView.mode === "rendered" ? text.replace(/[ \t\r\n]+/g, " ").trim() : text; },
        set(value) { text = String(value); html = escapeAttr(text); if (row.parentElement === tbody) notify(tbody); }
      });
      Object.defineProperty(cell, "textContent", {
        get() { return text; },
        set(value) { cell.innerText = value; }
      });
      // Like the innerText setter: line breaks become <br>, everything else text.
      Object.defineProperty(cell, "childNodes", { get() { return innerTextNodes(text); } });
      // Form controls written through innerHTML (the original row editor):
      // <input> keeps its value attribute the way a browser sanitizes it (a
      // text input drops line breaks; a number input keeps only a valid
      // number); <select> only takes values it has an option for.
      let controls = [];
      Object.defineProperty(cell, "innerHTML", {
        get() { return html; },
        set(value) {
          html = String(value);
          text = stripTags(html).trim();
          controls = parseControls(html);
          if (row.parentElement === tbody) notify(tbody);
        }
      });
      cell.querySelector = selector => {
        // button[onclick^="x"] / button[onclick*="x"] (one or more): the
        // first <button> in the cell's HTML whose onclick matches them all.
        if (/^button\[onclick[*^]=/.test(String(selector))) {
          const rules = [...String(selector).matchAll(/\[onclick([*^])="([^"]*)"\]/g)].map(match => [match[1], match[2]]);
          for (const match of html.matchAll(/<button\b([^>]*)>/g)) {
            const onclick = unescapeHtml((/\bonclick="([^"]*)"/.exec(match[1]) || [])[1] || "");
            if (!rules.every(([kind, value]) => (kind === "^" ? onclick.startsWith(value) : onclick.includes(value)))) continue;
            return {
              tag: "button",
              get disabled() { return /\bdata-write-action\b/.test(match[1]) ? !writeState.writable() : /\sdisabled(\s|$|=)/.test(match[1]); },
              getAttribute: name => (name === "onclick" ? onclick : null),
              closest: name => (name === "tr" ? row : null),
              parentElement: { parentElement: row }
            };
          }
          return null;
        }
        const tags = String(selector).split(",").map(part => part.trim());
        const control = controls.find(item => tags.includes(item.tag));
        if (control) return control;
        return tags.some(tag => html.includes(`<${tag}`)) ? {} : null;
      };
      return cell;
    }

    function parseControls(source) {
      const found = [];
      for (const match of source.matchAll(/<input\b([^>]*)>/g)) {
        const type = (/\btype="([^"]*)"/.exec(match[1]) || [])[1] || "text";
        const raw = unescapeHtml((/\bvalue="([^"]*)"/.exec(match[1]) || [])[1] || "");
        const value = type === "number" ? (/^\s*-?\d+(\.\d+)?\s*$/.test(raw) ? raw.trim() : "") : raw.replace(/[\r\n]/g, "");
        found.push({ tag: "input", type, value, defaultValue: value });
      }
      for (const match of source.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/g)) {
        const options = [...match[1].matchAll(/<option value="([^"]*)"/g)].map(option => unescapeHtml(option[1]));
        let selected = options[0] ?? "";
        found.push({
          tag: "select",
          options,
          get value() { return selected; },
          set value(next) { if (options.includes(String(next))) selected = String(next); }
        });
      }
      return found;
    }

    function createRow() {
      const row = { tag: "tr", cells: [], dataset: {}, parentElement: null, classList: classList() };
      row.insertCell = (index = -1) => {
        const cell = createCell(row);
        if (index < 0 || index >= row.cells.length) row.cells.push(cell); else row.cells.splice(index, 0, cell);
        if (row.parentElement === tbody) notify(tbody);
        return cell;
      };
      row.deleteCell = index => {
        row.cells.splice(index, 1);
        if (row.parentElement === tbody) notify(tbody);
      };
      row.closest = selector => (selector === "table" && row.parentElement === tbody ? table : null);
      row.remove = () => {
        if (row.parentElement !== tbody) return;
        tbody.rows.splice(tbody.rows.indexOf(row), 1);
        row.parentElement = null;
        notify(tbody);
      };
      row.querySelector = () => null;
      row.querySelectorAll = () => [];
      Object.defineProperty(row, "isConnected", { get() { return row.parentElement === tbody; } });
      return row;
    }

    tbody.insertRow = () => {
      const row = createRow();
      row.parentElement = tbody;
      tbody.rows.push(row);
      notify(tbody);
      return row;
    };
    tbody.appendChild = row => {
      const index = tbody.rows.indexOf(row);
      if (index >= 0) tbody.rows.splice(index, 1);
      row.parentElement = tbody;
      tbody.rows.push(row);
      notify(tbody);
      return row;
    };
    tbody.querySelectorAll = selector => (selector === "tr" ? [...tbody.rows] : []);
    tbody.querySelector = selector => {
      const parts = String(selector).split(",").map(part => part.trim());
      return tbody.rows.some(row => row.cells.some(cell => parts.some(part => cell.innerHTML.includes(`<${part}`)))) ? {} : null;
    };
    Object.defineProperty(tbody, "innerHTML", {
      get() { return ""; },
      set(value) {
        if (String(value) !== "") throw new Error("harness: only clearing a tbody is supported");
        tbody.rows.forEach(row => { row.parentElement = null; });
        tbody.rows = [];
        notify(tbody);
      }
    });
    return table;
  }

  const tables = Object.fromEntries(TABLE_IDS.map(id => [id, createTable(id)]));
  const elements = new Map();
  const selectIds = ["sel上蓋", "sel紋章鎖", "sel主要戰刃", "sel超越戰刃", "sel金屬戰刃", "sel輔助戰刃", "sel固鎖", "sel軸心"];
  selectIds.forEach(id => elements.set(id, createSelect(id)));
  const editor = genericElement("configQuickEditor");
  editor.hidden = true;
  elements.set("configQuickEditor", editor);
  const stockChoiceDialog = genericElement("stockChoiceDialog");
  stockChoiceDialog.hidden = true;
  elements.set("stockChoiceDialog", stockChoiceDialog);
  const confModel = genericElement("confModel");
  confModel.value = "BX-CUSTOM";
  elements.set("confModel", confModel);

  const body = genericElement("body");
  const document = {
    body,
    activeElement: null,
    readyState: "complete",
    addEventListener() {},
    removeEventListener() {},
    createElement: tag => (tag === "option" ? createOption() : genericElement()),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, genericElement(id));
      return elements.get(id);
    },
    querySelector(selector) {
      const match = String(selector).match(/^#(\w+) tbody$/);
      if (match && tables[match[1]]) return tables[match[1]].tbody;
      return null;
    },
    querySelectorAll(selector) {
      const match = String(selector).match(/^#(\w+) tbody tr$/);
      if (match && tables[match[1]]) return [...tables[match[1]].tbody.rows];
      return [];
    }
  };
  return { document, tables, elements, MutationObserver, textView, writeState };
}

// ---------- page ----------

function clone(value) {
  return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value));
}

export function loadPageSource() {
  return fs.readFileSync(SOURCE_URL, "utf8");
}

export function createConfigPage({ mock, uid = "user-a", email = "a@example.test", source = loadPageSource() } = {}) {
  const dom = createDom();
  const effects = { alerts: [], confirms: [], confirmAnswers: [], defaultConfirm: true, listeners: [] };
  const start = source.indexOf("let currentUser = null;");
  if (start < 0) throw new Error("harness: page start not found");
  const code = source.slice(start);

  const windowObject = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  const context = {
    ...guardModule,
    ...collectionModule,
    ...catalogNamesModule,
    ...viewModule,
    ...configViewModule,
    evaluateAssembly: assemblyModule.evaluateAssembly,
    newAssemblyViolations: assemblyModule.newAssemblyViolations,
    isIntegratedRatchetBlade: assemblyModule.isIntegratedRatchetBlade,
    isIntegratedRatchetBit: assemblyModule.isIntegratedRatchetBit,
    isOfficialSimpleRatchet: assemblyModule.isSimpleRatchet,
    bitCode: assemblyModule.bitCode,
    auth: {},
    provider: {},
    db: {},
    doc: (db, ...segments) => ({ path: segments.join("/") }),
    getDocFromServer: ref => mock.getDocFromServer(ref),
    runTransaction: (db, updateFunction, options) => mock.runTransaction(db, updateFunction, options),
    onSnapshot: (ref, options, next, error) => {
      const listener = { ref, options, next, error, active: true };
      effects.listeners.push(listener);
      return () => { listener.active = false; };
    },
    onAuthStateChanged() {},
    signInWithPopup: async () => {},
    signOut: async () => {},
    fetch: async () => { throw new Error("harness: no network"); },
    document: dom.document,
    window: windowObject,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: windowObject.matchMedia,
    MutationObserver: dom.MutationObserver,
    requestAnimationFrame: callback => setTimeout(callback, 0),
    cancelAnimationFrame: id => clearTimeout(id),
    alert: message => effects.alerts.push(String(message)),
    confirm: message => {
      effects.confirms.push(String(message));
      return effects.confirmAnswers.length ? effects.confirmAnswers.shift() : effects.defaultConfirm;
    },
    console: { warn() {}, error() {}, log() {}, info() {} },
    location: { hash: "", hostname: "127.0.0.1", href: "http://127.0.0.1/" },
    history: { replaceState() {} },
    navigator: { onLine: true },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    structuredClone,
    Date,
    Math,
    JSON,
    Promise,
    Map,
    Set,
    WeakMap,
    Intl,
    Blob: class { constructor(parts) { this.text = parts.join(""); } },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} }
  };
  // In a browser `window` is the global object (window.addConfig is callable as addConfig).
  context.window = context;
  context.addEventListener = windowObject.addEventListener;
  context.removeEventListener = windowObject.removeEventListener;
  vm.createContext(context);
  vm.runInContext(`${code}
globalThis.__page = {
  setUser(user) { currentUser = user; },
  get sync() { return collectionSync; },
  get guard() { return dataSessionGuard; },
  get saving() { return isSavingCloudData; },
  get pending() { return hasPendingCloudSave; },
  get editorRow() { return configEditorRow; },
  get configView() { return configViewState; },
  get writable() { return Boolean(dataSessionGuard.captureWriteSession()); }
};`, context);
  const page = context.__page;
  dom.writeState.writable = () => page.writable;

  // What DOMContentLoaded does for the tables (D-023: no delayed config sort).
  context.clearAllTables();

  function rowCells(row) { return row.cells.slice(0, 9).map(cell => cell.innerText); }

  const api = {
    context,
    dom,
    effects,
    page,
    get window() { return context.window; },
    select(type, value) {
      const select = dom.elements.get(`sel${type}`);
      select.value = value;
      return select.value;
    },
    selectOptions(type) { return dom.elements.get(`sel${type}`).options.map(option => option.value); },
    configRows() { return [...dom.tables.configTable.tbody.rows]; },
    configCells() { return api.configRows().map(rowCells); },
    configStockNames() { return api.configRows().map(row => row.cells[3]?.dataset.stockName); },
    historyRows() { return [...dom.tables.historyTable.tbody.rows]; },
    stored() { return clone(mock.read(`users/${uid}/appData/main`)); },
    tables() { return context.collectCollectionTables(); },
    dirtyTables() { return page.sync.getDirtyTables(context.collectCollectionTables()); },
    signIn() {
      page.setUser({ uid, email });
      const token = context.beginDataSession(uid, false);
      context.startCloudListener(token);
      return token;
    },
    deliver({ fromCache = false } = {}) {
      const listener = effects.listeners.filter(item => item.active).at(-1);
      if (!listener) throw new Error("harness: no active listener");
      const raw = mock.read(listener.ref.path);
      listener.next({
        metadata: { fromCache, hasPendingWrites: false },
        exists: () => raw !== null && raw !== undefined,
        data: () => clone(raw)
      });
    },
    async wait(ms) { await new Promise(resolve => setTimeout(resolve, ms)); },
    async settle({ timeoutMs = 3000 } = {}) {
      const started = Date.now();
      for (;;) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!page.saving && !page.pending) {
          await new Promise(resolve => setTimeout(resolve, 0));
          if (!page.saving && !page.pending) return;
        }
        if (Date.now() - started > timeoutMs) throw new Error("harness: save did not settle");
      }
    },
    // Opens the real quick editor (new config, or editing an existing <tr>).
    openEditor(row = null) { context.openConfigQuickEditor(row); },
    editorOpen() { return !dom.elements.get("configQuickEditor").hidden; },
    setMode(mode) { context.setConfigEditorMode(mode, true); },
    // Picks parts in the editor like a user, then presses the save button.
    build({ mode, ...parts } = {}) {
      if (mode) api.setMode(mode);
      for (const [type, value] of Object.entries(parts)) {
        const set = api.select(type, value);
        if (set !== value) throw new Error(`harness: ${type} option "${value}" is not offered`);
        if (type === "上蓋") context.syncConfigModelFromSelection();
        if (type === "軸心") context.updateNoRatchetConfigOption();
      }
    },
    save() { return context.window.addConfig(); },
    restoreHistory(row) { return context.window.restoreHistoryRow({ parentElement: { parentElement: row } }); },
    // D-023: switch how innerText reads cells (see createDom).
    setInnerTextView(mode) { dom.textView.mode = mode; },
    rowCells
  };
  return api;
}

export function stockItem(model, layer, fix, axis, extra = {}) {
  return { cells: [model, layer, "-", "-", "-", "-", "-", fix, axis], mainStockName: "-", ...extra };
}

export function configItem(cells, mainStockName = cells[3]) {
  return { cells, mainStockName };
}
