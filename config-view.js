// Phase 7-3b: pure functions for the config display layer (D-022, spec 11 §4).
// No DOM, no storage, no Firestore: script.js reads the original #configTable /
// #historyTable rows into snapshots and passes them here; these functions only
// shape, filter and sort what is shown. Nothing here is ever saved.
import { isIntegratedRatchetBit, isIntegratedRatchetBlade } from "./assembly-rules.js?v=20261123-phase7r";

export const CONFIG_VIEW_TABS = Object.freeze({
  configs: { section: "configSection", label: "我的配置" },
  history: { section: "historySection", label: "拆解紀錄" }
});

// A5: only the display text changes; historyTable and its data are unchanged.
export const HISTORY_LABEL = "拆解紀錄";

export const CONFIG_VIEW_MODE_STORAGE_KEY = "beybladeConfigViewMode";
export const CONFIG_SERIES_FILTERS = Object.freeze(["all", "BX", "UX", "CX"]);
export const CONFIG_STRUCTURE_FILTERS = Object.freeze(["all", "standard", "cx3", "cx4", "integratedBlade", "integratedBit"]);
export const CONFIG_SORTS = Object.freeze(["default", "blade"]);
export const CONFIG_STRUCTURE_LABELS = Object.freeze({
  standard: "標準三件式",
  cx3: "CX 三件戰刃",
  cx4: "CX 四件戰刃",
  integratedBlade: "固鎖一體上蓋",
  integratedBit: "Tr・Op 軸心"
});

const hasValue = value => typeof value === "string" ? value.trim() !== "" && value.trim() !== "-" : Boolean(value);
const text = value => String(value ?? "");

export function configTabFromHash(hash) {
  const id = String(hash || "").replace(/^#/, "");
  if (id === CONFIG_VIEW_TABS.history.section) return "history";
  if (id === CONFIG_VIEW_TABS.configs.section) return "configs";
  return null;
}

export function otherConfigTab(tab) {
  return tab === "history" ? "configs" : "history";
}

export function seriesOfModel(model) {
  const code = text(model).trim().toUpperCase();
  if (code.startsWith("CX")) return "CX";
  if (code.startsWith("BX")) return "BX";
  if (code.startsWith("UX")) return "UX";
  return "OTHER";
}

// Structure tags of one config, from its 9 stored cells only. A config can be
// e.g. CX three-piece and use a Tr／Op bit at the same time.
export function configStructures(cells) {
  const [model, layer, lock, main, transcend, metal, aux, , axis] = (cells || []).map(text);
  const tags = [];
  if (hasValue(transcend) && hasValue(metal)) tags.push("cx4");
  else if (hasValue(lock) || hasValue(aux) || (seriesOfModel(model) === "CX" && hasValue(main))) tags.push("cx3");
  else tags.push("standard");
  if (isIntegratedRatchetBlade(layer, model)) tags.push("integratedBlade");
  if (isIntegratedRatchetBit(axis)) tags.push("integratedBit");
  return tags;
}

// The parts of one config in assembly order, as stored (exact names).
export function configParts(cells) {
  const [, layer, lock, main, transcend, metal, aux, fix, axis] = (cells || []).map(text);
  const cx4 = hasValue(transcend) && hasValue(metal);
  const cx3 = !cx4 && (hasValue(lock) || hasValue(aux));
  const parts = [];
  if (cx4) {
    parts.push(["紋章鎖", lock], ["超越戰刃", transcend], ["金屬戰刃", metal], ["輔助戰刃", aux]);
  } else if (cx3) {
    parts.push(["紋章鎖", lock], ["主要戰刃", main], ["輔助戰刃", aux]);
  } else {
    parts.push(["上蓋", layer]);
  }
  parts.push(["固鎖", fix], ["軸心", axis]);
  return parts
    .filter(([, value]) => hasValue(value))
    .map(([type, value]) => ({ type, value }));
}

// The name a config is shown with: its blade, or the CX combination.
export function configTitle(cells) {
  const [model, layer] = (cells || []).map(text);
  if (hasValue(layer)) return layer;
  const parts = configParts(cells).filter(part => !["固鎖", "軸心"].includes(part.type));
  return parts.length ? parts.map(part => part.value).join("") : text(model);
}

// snapshots: [{ key, cells, mainStockName }] in table order (sortConfigTable).
export function buildConfigItems(snapshots) {
  return (snapshots || []).map((snapshot, index) => {
    const cells = (snapshot.cells || []).map(text);
    const model = cells[0] || "";
    return {
      key: snapshot.key,
      order: index,
      model,
      series: seriesOfModel(model),
      title: configTitle(cells),
      parts: configParts(cells),
      structures: configStructures(cells),
      cells,
      mainStockName: snapshot.mainStockName ?? null
    };
  });
}

// Search: blade / combination name, every part name and the model; ignores
// case and whitespace differences (display only, never an identity).
const searchKey = value => text(value).toLowerCase().replace(/\s+/g, "");

export function configSearchText(item) {
  return searchKey([item.model, item.title, ...item.parts.map(part => part.value)].join("|"));
}

export function filterConfigItems(items, query = "") {
  const needle = searchKey(query);
  if (!needle) return [...items];
  return items.filter(item => configSearchText(item).includes(needle));
}

export function filterConfigByControls(items, { series = "all", structure = "all" } = {}) {
  return items.filter(item =>
    (series === "all" || item.series === series) &&
    (structure === "all" || item.structures.includes(structure)));
}

const zhCompare = (left, right) => text(left).localeCompare(text(right), "zh-Hant", { numeric: true, sensitivity: "base" });

// "default" keeps the table order (the same order as sortTable: UX→BX→CX,
// then model); "blade" sorts by the shown name. Display only.
export function sortConfigItems(items, sort = "default") {
  const list = [...items];
  if (sort === "blade") return list.sort((a, b) => zhCompare(a.title, b.title) || a.order - b.order);
  return list.sort((a, b) => a.order - b.order);
}

export function defaultConfigControls() {
  return { series: "all", structure: "all", sort: "default" };
}

export function normalizeConfigControls(controls = {}) {
  return {
    series: CONFIG_SERIES_FILTERS.includes(controls.series) ? controls.series : "all",
    structure: CONFIG_STRUCTURE_FILTERS.includes(controls.structure) ? controls.structure : "all",
    sort: CONFIG_SORTS.includes(controls.sort) ? controls.sort : "default"
  };
}

export function normalizeConfigViewMode(value) {
  return value === "card" ? "card" : "list";
}

// snapshots: [{ key, cells: [model, combo, fix, axis, result, note, date], comboKey }]
export function buildHistoryItems(snapshots) {
  return (snapshots || []).map((snapshot, index) => {
    const [model, combo, fix, axis, result, note, date] = (snapshot.cells || []).map(text);
    return { key: snapshot.key, order: index, model, combo, fix, axis, result, note, date, comboKey: text(snapshot.comboKey) };
  });
}

export function filterHistoryItems(items, query = "") {
  const needle = searchKey(query);
  if (!needle) return [...items];
  return items.filter(item => searchKey([item.model, item.combo, item.fix, item.axis, item.result, item.note, item.date].join("|")).includes(needle));
}

export function configListNotice({ signedIn, loading, total, shown, kind }) {
  if (!signedIn) return kind === "history" ? "登入後會顯示你的拆解紀錄。" : "登入後會顯示你的配置。";
  if (loading) return "正在載入雲端資料…";
  if (total === 0) return kind === "history" ? "還沒有拆解紀錄。拆解配置並選擇保留紀錄後會出現在這裡。" : "尚無配置。按「＋ 建立配置」開始。";
  if (shown === 0) return kind === "history" ? "沒有符合條件的拆解紀錄。" : "沒有符合條件的配置。";
  return "";
}

export function configCountText(shown, total, unit) {
  return shown === total ? `共 ${total} ${unit}` : `顯示 ${shown} / ${total} ${unit}`;
}

/* ===== Phase 7-3c assembler (spec 11 §5): display only =====
   The quick editor keeps its select ids and saves only through addConfig.
   These functions shape what the editor shows (structure, slots, live checks);
   they never decide a save. addConfig, checkStock and the D-019 check still do.
   Part values are the exact stored names from the selects (D-023). */

export const ASSEMBLY_STRUCTURES = Object.freeze({
  std: { label: "標準三件式", hint: "BX／UX：上蓋＋固鎖＋軸心", mode: "bxux", slots: ["上蓋", "固鎖", "軸心"] },
  cx3: { label: "CX 三件戰刃", hint: "紋章鎖＋主要戰刃＋輔助戰刃", mode: "cx", slots: ["紋章鎖", "主要戰刃", "輔助戰刃", "固鎖", "軸心"] },
  cx4: { label: "CX 四件戰刃", hint: "紋章鎖＋超越＋金屬＋輔助", mode: "cx", slots: ["紋章鎖", "超越戰刃", "金屬戰刃", "輔助戰刃", "固鎖", "軸心"] }
});

const ASSEMBLY_CHECK_USER_LIMIT = 5;
const picked = value => Boolean(value) && value !== "-";

export function normalizeAssemblyStructure(value) {
  return Object.hasOwn(ASSEMBLY_STRUCTURES, value) ? value : "std";
}

// The editor mode addConfig reads (configEditorMode): "bxux" or "cx".
export function assemblyModeOf(structure) {
  return ASSEMBLY_STRUCTURES[normalizeAssemblyStructure(structure)].mode;
}

// Structure of a config being opened: the editor mode plus whether the split
// main blade (超越／金屬) is used, the same either/or addConfig checks.
export function assemblyStructureFromValues(mode, values = {}) {
  if (mode !== "cx") return "std";
  return picked(values["超越戰刃"]) || picked(values["金屬戰刃"]) ? "cx4" : "cx3";
}

// CX blade fields a structure does not show (cleared when switching CX 3 ↔ 4).
export function assemblyHiddenBladeTypes(structure) {
  if (structure === "cx3") return ["超越戰刃", "金屬戰刃"];
  if (structure === "cx4") return ["主要戰刃"];
  return [];
}

// Same composition as addConfig (cells 1–6), for the teardown-record lookup.
export function assemblyRecordValues(structure, values = {}, { booster = false } = {}) {
  const v = type => values[type] || "";
  if (booster) {
    return {
      layer: v("上蓋") || "-",
      lockPart: v("紋章鎖") || "-",
      mainPart: v("主要戰刃") || "-",
      transcendPart: v("超越戰刃") || "-",
      metalPart: v("金屬戰刃") || "-",
      auxPart: v("輔助戰刃") || "-"
    };
  }
  if (structure === "cx3") {
    return { layer: `${v("紋章鎖")}${v("主要戰刃")}${v("輔助戰刃")}`, lockPart: v("紋章鎖"), mainPart: v("主要戰刃"), transcendPart: "-", metalPart: "-", auxPart: v("輔助戰刃") };
  }
  if (structure === "cx4") {
    return {
      layer: `${v("紋章鎖")}${v("金屬戰刃")}${v("超越戰刃")}${v("輔助戰刃")}`,
      lockPart: v("紋章鎖"),
      mainPart: `${v("超越戰刃")}/${v("金屬戰刃")}`,
      transcendPart: v("超越戰刃"),
      metalPart: v("金屬戰刃"),
      auxPart: v("輔助戰刃")
    };
  }
  return { layer: v("上蓋"), lockPart: "-", mainPart: "-", transcendPart: "-", metalPart: "-", auxPart: "-" };
}

// The parts addConfig passes to checkStock, in the same order.
export function assemblySelectedParts(structure, values = {}, { booster = false } = {}) {
  const record = assemblyRecordValues(structure, values, { booster });
  const cxBlades = structure !== "std" && !booster;
  return [
    ["上蓋", cxBlades ? "" : values["上蓋"] || ""],
    ["紋章鎖", record.lockPart],
    ["主要戰刃", record.mainPart.includes("/") ? "" : record.mainPart],
    ["超越戰刃", record.transcendPart],
    ["金屬戰刃", record.metalPart],
    ["輔助戰刃", record.auxPart],
    ["固鎖", values["固鎖"] || ""],
    ["軸心", values["軸心"] || ""]
  ].filter(([, name]) => picked(name)).map(([type, name]) => ({ type, name }));
}

// Slots still empty, as addConfig requires them. `values["固鎖"]` is the value
// after the integrated-part "-" is applied (getNoRatchetFixValue).
export function assemblyMissingSlots(structure, values = {}, { booster = false } = {}) {
  const required = booster ? ["固鎖", "軸心"] : ASSEMBLY_STRUCTURES[normalizeAssemblyStructure(structure)].slots;
  return required.filter(type => !values[type]);
}

export function assemblyRatchetFixedText({ integratedBlade = false, integratedBit = false, axisLabel = "" } = {}) {
  if (integratedBlade) return "無獨立固鎖：固鎖與上蓋一體（官方）";
  if (integratedBit) return `無獨立固鎖：${axisLabel} 是固鎖一體型軸心（官方）`;
  return "";
}

// Live checks: [{ level: "ok" | "info" | "warn" | "block", text }].
// violations: [{ id, message, kept }] (kept = the edited config already had it).
// shortages: [{ label, total, users: [config titles], dropped }] (dropped: the
// edited config's own part that is no longer offered).
export function buildAssemblyChecks({
  structure = "std",
  booster = false,
  stale = false,
  missing = [],
  violations = [],
  fixEmpty = false,
  integratedBit = false,
  shortages = [],
  history = null
} = {}) {
  const out = [];
  if (stale) {
    out.push({ level: "block", text: "這筆配置已經變更或不存在，請關閉後重新開啟。" });
    return out;
  }
  if (booster) out.push({ level: "info", text: "抽包配置：固鎖與軸心必選，其他零件選填。" });
  if (missing.length) out.push({ level: "info", text: `尚未選擇：${missing.join("、")}` });
  // An empty ratchet on 時鐘幻象 is "not chosen yet", not a rule error.
  const shown = violations.filter(item => !(item.id === "simple-ratchet-only" && fixEmpty && !integratedBit));
  shown.forEach(item => out.push(item.kept
    ? { level: "warn", text: `原本就不符合官方組裝規則：${item.message}（儲存時會再確認）` }
    : { level: "block", text: `${item.message}（官方規則，不能儲存）` }));
  shortages.forEach(item => {
    const users = item.users || [];
    const names = users.slice(0, ASSEMBLY_CHECK_USER_LIMIT).join("、") + (users.length > ASSEMBLY_CHECK_USER_LIMIT ? ` 等 ${users.length} 個` : "");
    const detail = users.length ? `持有 ${item.total}，已被 ${users.length} 個配置使用：${names}` : `持有 ${item.total}`;
    out.push(item.dropped
      ? { level: "block", text: `原本使用的${item.label}已經沒有庫存（${detail}），請改選其他零件` }
      : { level: "block", text: `${item.label} 已經沒有庫存（${detail}）` });
  });
  if (structure === "cx4" && integratedBit) out.push({ level: "warn", text: "Tr／Op 裝在 CX 四件戰刃下：官方未說明，僅提示。" });
  if (history) {
    const result = picked(text(history.result).trim()) ? `（結果：${text(history.result).trim()}）` : "";
    out.push({ level: "warn", text: `這個組合以前拆解過${result}，可在「拆解紀錄」查看；儲存時會再詢問。` });
  }
  if (!missing.length && !shown.length && !shortages.length) out.push({ level: "ok", text: "符合官方組裝規則，庫存足夠。" });
  return out;
}
