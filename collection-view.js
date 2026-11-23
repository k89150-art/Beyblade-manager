// Phase 7-2a (R2): pure helpers for the collection / parts display layer.
// No DOM, no Firebase, no writes. script.js reads the original table rows
// (the only stored data source) into plain snapshots and passes them here;
// these functions only decide what to show. Tested in tests/collection-view.test.mjs.

export const COLLECTION_VIEW_TABS = Object.freeze({
  stock: Object.freeze({ section: "collectionSection", addBody: "collectionAddBody", focus: "model" }),
  parts: Object.freeze({ section: "inventorySection", addBody: "inventoryAddBody", focus: "partName" })
});

const HASH_TARGETS = Object.freeze({
  collectionSection: Object.freeze({ tab: "stock", quickAdd: false }),
  "add-collection": Object.freeze({ tab: "stock", quickAdd: true }),
  inventorySection: Object.freeze({ tab: "parts", quickAdd: false }),
  "add-part": Object.freeze({ tab: "parts", quickAdd: true })
});

// Which tab a location hash belongs to, and whether it is a D-020 quick-add
// action (open the add form and focus its first field). Other hashes: null.
export function collectionHashTarget(hash) {
  const key = String(hash || "").replace(/^#/, "");
  const target = HASH_TARGETS[key];
  if (!target) return null;
  return { tab: target.tab, quickAdd: target.quickAdd, focus: target.quickAdd ? COLLECTION_VIEW_TABS[target.tab].focus : null };
}

export function otherTab(tab) {
  return tab === "parts" ? "stock" : "parts";
}

// Q1: the add form opens by itself only while the list is empty, unless the
// user has opened or closed it (userChoice true / false).
export function isAddPanelOpen(userChoice, rowCount) {
  if (userChoice === true || userChoice === false) return userChoice;
  return rowCount === 0;
}

// What the list area should say instead of (or in addition to) rows.
export function listNotice({ signedIn, loading, total, shown, kind }) {
  if (!signedIn) return kind === "parts" ? "登入後會顯示你的零件。" : "登入後會顯示你的收藏。";
  if (loading) return "正在載入雲端資料…";
  if (total === 0) return kind === "parts" ? "尚無零件。加入原裝收藏，或按「新增額外零件」開始。" : "尚無收藏。按「新增收藏」開始。";
  if (shown === 0) return kind === "parts" ? "沒有符合條件的零件。" : "沒有符合條件的收藏。";
  return "";
}

// A snapshot signature used only to confirm, right before an action, that the
// row the user saw is still the same row. It is never used as an identity.
export function rowSignature(snapshot) {
  return JSON.stringify([snapshot.cells || [], snapshot.mainStockName ?? null, snapshot.meta || {}]);
}

const hasValue = value => Boolean(value) && value !== "-";

// Stock rows keep their table order (sortBeybladeTable already ran).
export function buildStockItems(snapshots) {
  return snapshots.map(snapshot => {
    const cells = snapshot.cells || [];
    const model = cells[0] || "";
    const series = (model.toUpperCase().match(/^(BX|UX|CX)/) || [])[1] || "OTHER";
    const meta = snapshot.meta || {};
    return {
      key: snapshot.key,
      model,
      series,
      title: snapshot.display?.title || (hasValue(cells[1]) ? cells[1] : model),
      parts: (snapshot.display?.parts || []).filter(part => hasValue(part.value)),
      manual: meta.stockAutoFilled !== "true",
      inSet: Boolean(meta.stockSetInstanceId),
      editing: Boolean(snapshot.editing),
      canDelete: Boolean(snapshot.actions?.delete),
      deleteDisabled: Boolean(snapshot.actions?.deleteDisabled)
    };
  });
}

// Parts rows: the same matching as applyInventoryFilters (type filter plus a
// lower-cased "type name" search), ordered by the existing type rank and then
// by table order, like the previous CSS `order` layout.
export function buildPartItems(snapshots, { matchesType, query = "", rank = () => 0 } = {}) {
  const needle = String(query || "").trim().toLocaleLowerCase("zh-TW");
  return snapshots
    .map((snapshot, index) => {
      const cells = snapshot.cells || [];
      return {
        key: snapshot.key,
        index,
        type: cells[0] || "",
        name: cells[1] || "",
        count: cells[2] || "",
        tone: snapshot.tone || "neutral",
        editing: Boolean(snapshot.editing),
        canEdit: Boolean(snapshot.actions?.edit),
        canDelete: Boolean(snapshot.actions?.delete),
        editDisabled: Boolean(snapshot.actions?.editDisabled),
        deleteDisabled: Boolean(snapshot.actions?.deleteDisabled)
      };
    })
    .filter(item => item.editing || (
      (!matchesType || matchesType(item.type)) &&
      (!needle || `${item.type} ${item.name}`.toLocaleLowerCase("zh-TW").includes(needle))
    ))
    .sort((left, right) => (rank(left.type) - rank(right.type)) || (left.index - right.index));
}

/* ===== Phase 7-2b: parts model (P2 / U2), search (S1), impact text (D1) ===== */
// Part maps have the shape produced by script.js addStock():
// { [type]: { [name]: count } }. script.js builds one map per original row with
// the same rules as getTotalParts / getUsedParts (and the real addStock), so
// everything here is plain arithmetic on those maps. Nothing is written.

const PART_KEY_SEPARATOR = "\u0000";
const partKey = (type, name) => `${type}${PART_KEY_SEPARATOR}${name}`;

export function partMapEntries(map) {
  return Object.entries(map || {}).flatMap(([type, names]) =>
    Object.entries(names || {}).map(([name, count]) => ({ type, name, count })));
}

// P2 + U2. stockRows: [{ counts }]; extraRows: [{ key, type, name, countText,
// counts, editing, actions }]; configRows: [{ label, used, excluded }] where
// excluded is the CX (non-booster) combined blade name that getUsedParts counts
// as 上蓋 but that is not a part.
export function computePartsModel({ stockRows = [], extraRows = [], configRows = [] } = {}, { rank = () => 0 } = {}) {
  const items = new Map();
  const item = (type, name) => {
    const key = partKey(type, name);
    if (!items.has(key)) items.set(key, { key, type, name, orig: 0, extra: 0, ref: 0, configs: [], extraRows: [] });
    return items.get(key);
  };
  stockRows.forEach(row => partMapEntries(row.counts).forEach(({ type, name, count }) => { item(type, name).orig += count; }));
  extraRows.forEach(row => {
    partMapEntries(row.counts).forEach(({ type, name, count }) => { item(type, name).extra += count; });
    // Every original extra row stays visible with its own actions, even one the
    // stock count ignores (for example a zero count), so it can still be fixed.
    item(row.type, row.name).extraRows.push(row);
  });
  const orphans = new Map();
  configRows.forEach(row => {
    const excluded = new Map(partMapEntries(row.excluded).map(({ type, name, count }) => [partKey(type, name), count]));
    partMapEntries(row.used).forEach(({ type, name, count }) => {
      const key = partKey(type, name);
      const net = count - (excluded.get(key) || 0);
      if (net <= 0) return;
      const target = items.get(key);
      if (target) {
        // A card exists (held, or only an extra row the stock count ignores):
        // the reference shows on that card; held 0 shows as over-used.
        target.ref += net;
        target.configs.push(row.label);
      } else {
        if (!orphans.has(key)) orphans.set(key, { key, type, name, ref: 0, configs: [] });
        const orphan = orphans.get(key);
        orphan.ref += net;
        orphan.configs.push(row.label);
      }
    });
  });
  const list = [...items.values()].map(entry => ({ ...entry, held: entry.orig + entry.extra, avail: entry.orig + entry.extra - entry.ref }))
    .sort((a, b) => (rank(a.type) - rank(b.type)) || a.name.localeCompare(b.name, "zh-Hant", { numeric: true }));
  const orphanList = [...orphans.values()].sort((a, b) => (rank(a.type) - rank(b.type)) || a.name.localeCompare(b.name, "zh-Hant", { numeric: true }));
  return {
    items: list,
    orphans: orphanList,
    totals: {
      kinds: list.length,
      orig: list.reduce((sum, entry) => sum + entry.orig, 0),
      extra: list.reduce((sum, entry) => sum + entry.extra, 0),
      refs: list.reduce((sum, entry) => sum + entry.ref, 0),
      overused: list.filter(entry => entry.avail < 0).length,
      orphans: orphanList.length
    }
  };
}

// Parts tab filter: the existing type filter and "type name" search, on the
// aggregated items. An item with a row being edited stays visible.
export function filterPartItems(items, { matchesType, query = "" } = {}) {
  const needle = String(query || "").trim().toLocaleLowerCase("zh-TW");
  return items.filter(entry => entry.extraRows.some(row => row.editing) || (
    (!matchesType || matchesType(entry.type)) &&
    (!needle || `${entry.type} ${entry.name}`.toLocaleLowerCase("zh-TW").includes(needle))
  ));
}

// S1: text a collection row can be found by. English names only come from the
// catalog through a reliable recordId (supplied by script.js; never guessed).
export function stockSearchText(item) {
  return [item.model, item.title, ...item.parts.map(part => part.value), item.englishName || "", item.setCode || "", item.productCode || ""]
    .filter(Boolean).join(" ").toLocaleLowerCase("zh-TW");
}

export function filterStockItems(items, query = "") {
  const needle = String(query || "").trim().toLocaleLowerCase("zh-TW");
  if (!needle) return items;
  return items.filter(entry => entry.editing || stockSearchText(entry).includes(needle));
}

// D1: what a change does to configurations. remove / add are part maps.
// mode "delete" and "reduce": a name that disappears counts as held 0 (not
// enough). mode "rename": an old name that disappears is reported as "no
// matching part" instead. Only shortages caused by this change are listed;
// parts of this change that were already short get one separate line.
export function computeImpact(model, { remove = [], add = [], mode = "delete" } = {}) {
  const heldBefore = new Map(model.items.map(entry => [entry.key, entry.held]));
  const refs = new Map([...model.items, ...model.orphans].filter(entry => entry.ref > 0).map(entry => [entry.key, entry]));
  const heldAfter = new Map(heldBefore);
  const touched = new Set();
  remove.forEach(map => partMapEntries(map).forEach(({ type, name, count }) => {
    const key = partKey(type, name);
    touched.add(key);
    heldAfter.set(key, (heldAfter.get(key) || 0) - count);
  }));
  add.forEach(map => partMapEntries(map).forEach(({ type, name, count }) => {
    const key = partKey(type, name);
    heldAfter.set(key, (heldAfter.get(key) || 0) + count);
  }));
  const shortages = [], unmatched = [], alreadyShort = [];
  refs.forEach((entry, key) => {
    const before = heldBefore.get(key) || 0;
    const after = Math.max(0, heldAfter.get(key) || 0);
    const wasShort = entry.ref > before;
    if (wasShort) {
      if (mode === "rename" && touched.has(key) && before > 0 && after === 0) unmatched.push({ ...entry, held: 0 });
      else if (touched.has(key) && before > 0 && after < before) alreadyShort.push({ ...entry, held: before });
      return;
    }
    if (entry.ref <= after) return;
    if (mode === "rename" && after === 0) unmatched.push({ ...entry, held: after });
    else shortages.push({ ...entry, held: after });
  });
  return { shortages, unmatched, alreadyShort };
}

const listConfigs = configs => `${configs.slice(0, 3).join("、")}${configs.length > 3 ? ` 等 ${configs.length} 個` : ""}`;

export function formatImpactText(impact, { verb = "刪除後", oldName = "" } = {}) {
  const lines = [];
  if (impact.shortages.length) {
    lines.push(`${verb}，下列零件會不夠配置使用：`);
    impact.shortages.slice(0, 5).forEach(entry => lines.push(`・${entry.type} ${entry.name}：持有 ${entry.held}，配置引用 ${entry.ref}（${listConfigs(entry.configs)}）`));
    if (impact.shortages.length > 5) lines.push(`…等 ${impact.shortages.length} 個零件`);
  }
  if (impact.unmatched.length) {
    lines.push(`改名後，下列配置仍使用舊名稱「${oldName}」，將找不到對應零件：`);
    impact.unmatched.slice(0, 5).forEach(entry => lines.push(`・${entry.type} ${entry.name}：${listConfigs(entry.configs)}`));
  }
  impact.alreadyShort.slice(0, 5).forEach(entry => lines.push(`${entry.type} ${entry.name} 原本就不夠配置使用（持有 ${entry.held}，配置引用 ${entry.ref}），變更後會更不足。`));
  if (!lines.length) return "";
  lines.push(impact.unmatched.length ? "配置不會自動改名。" : "配置不會被修改。");
  return `\n${lines.join("\n")}`;
}
