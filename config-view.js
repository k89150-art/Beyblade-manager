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
