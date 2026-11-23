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
  if (!signedIn) return kind === "parts" ? "登入後會顯示你的額外零件。" : "登入後會顯示你的收藏。";
  if (loading) return "正在載入雲端資料…";
  if (total === 0) return kind === "parts" ? "尚無額外零件。按「新增額外零件」開始。" : "尚無收藏。按「新增收藏」開始。";
  if (shown === 0) return "沒有符合條件的零件。";
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
