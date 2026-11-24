// Phase 7-4 (spec 13): pure functions for the tournament record panel.
// No DOM, no storage, no Firestore, and no scoring of their own: scores and
// match outcomes always come from tournament.js (calculateMatchScore /
// getMatchOutcome), passed in as callbacks. Nothing here is ever saved.

const picked = value => typeof value === "string" && value.trim() !== "" && value.trim() !== "-";

/* ----- 7-4a: round panel ----- */

// Matches that take rounds (not a bye or walkover), with their 1-based number
// among all matches of the tournament (the number shown on the match cards).
export function recordableMatches(record, isDirectAdvance) {
  return (record?.matches || [])
    .map((match, index) => ({ match, number: index + 1 }))
    .filter(item => !isDirectAdvance(item.match));
}

// Q1: the panel works on the match the user chose while it still exists and
// takes rounds; otherwise on the last match that is still in progress, or
// (all decided) the last one, which then shows its finished state (Q2).
export function resolveRoundPanelTarget(record, chosenId, { isDirectAdvance, outcomeOf }) {
  const items = recordableMatches(record, isDirectAdvance);
  if (!items.length) return "";
  if (chosenId && items.some(item => item.match.id === chosenId)) return chosenId;
  const open = items.filter(item => outcomeOf(item.match) === "incomplete");
  return (open.at(-1) || items.at(-1)).match.id;
}

// The beys a round can use: this match's deck texts, in order, without blanks
// or repeats (the same list the old round form offered, de-duplicated).
export function roundPanelBeyblades(match) {
  const seen = new Set();
  return (match?.deck || [])
    .map(item => String(item?.configText || ""))
    .filter(text => text && !seen.has(text) && seen.add(text));
}

// Q3: a bey is preselected only when there is exactly one to choose from.
// Result and finish type are never preselected.
export function preselectedBeyblade(match) {
  const options = roundPanelBeyblades(match);
  return options.length === 1 ? options[0] : "";
}

// The panel sends nothing until bey, result and finish type are all chosen
// from what the match offers (addRound would otherwise fall back to defaults).
export function roundPanelSelectionError({ beyblade, result, scoreType }, match, scoreTypes) {
  const missing = [];
  if (!roundPanelBeyblades(match).includes(beyblade)) missing.push("使用陀螺");
  if (result !== "win" && result !== "lose") missing.push("得分或失分");
  if (!Object.hasOwn(scoreTypes, scoreType || "")) missing.push("勝利方式");
  return missing.length ? `請先選擇：${missing.join("、")}` : "";
}

/* ----- 7-4b: 3on3 duplicate parts (hint only) ----- */

// Catalog names of the two lock chips that may appear only once (ワルキューレ,
// エンペラー; confirmed by the user 2026-11-23, design 08 item 3d). Other lock
// chips may repeat.
export const LIMITED_LOCK_CHIPS = Object.freeze(["戰神", "帝王"]);

// The parts of one stored config row ({ cells, mainStockName }), as
// [type, exact stored name]. Same structure rules as the main page: "-" is no
// part, a CX config's 上蓋 column is its combined name (not a part), and the
// main blade is the row's mainStockName ("" for a split blade).
export function configRowParts(item) {
  const cells = Array.isArray(item?.cells) ? item.cells.map(cell => String(cell ?? "")) : [];
  const isCx = [2, 3, 4, 5, 6].some(index => picked(cells[index]));
  const split = picked(cells[4]) || picked(cells[5]);
  // Without a stored mainStockName, a split blade's column 3 is "超越/金屬".
  const main = typeof item?.mainStockName === "string" ? item.mainStockName : (split ? "" : cells[3]);
  const parts = isCx
    ? [["紋章鎖", cells[2]], ["主要戰刃", main], ["超越戰刃", cells[4]], ["金屬戰刃", cells[5]], ["輔助戰刃", cells[6]]]
    : [["上蓋", cells[1]]];
  parts.push(["固鎖", cells[7]], ["軸心", cells[8]]);
  return parts.filter(([, name]) => picked(name));
}

// text → parts for the stored config rows. A text shared by rows with
// different parts cannot be resolved reliably and maps to null.
export function buildConfigPartIndex(rows, textOf) {
  const index = new Map();
  (rows || []).forEach(item => {
    const text = textOf(item);
    if (!text) return;
    const parts = configRowParts(item);
    const key = JSON.stringify(parts);
    if (!index.has(text)) index.set(text, { parts, key });
    else if (index.get(text) && index.get(text).key !== key) index.set(text, null);
  });
  return index;
}

// Q7: deckTexts are the three chosen texts (custom text wins, as getDeckValue).
// Each slot is "checked" (a config with known parts), "custom" (no config with
// this text), "ambiguous" (several configs share the text) or "empty".
// Duplicates are counted across slots (the same config chosen twice repeats
// all of its parts). passed is true only when all three were checked and
// nothing repeats.
export function checkDeckDuplicates(deckTexts, partIndex) {
  const slots = (deckTexts || []).map(raw => {
    const text = String(raw ?? "").trim();
    if (!text) return { text, status: "empty", parts: [] };
    if (!partIndex.has(text)) return { text, status: "custom", parts: [] };
    const entry = partIndex.get(text);
    return entry ? { text, status: "checked", parts: entry.parts } : { text, status: "ambiguous", parts: [] };
  });
  const seen = new Map();
  const duplicates = new Map();
  slots.forEach((slot, slotIndex) => {
    slot.parts.forEach(([type, name]) => {
      if (type === "紋章鎖" && !LIMITED_LOCK_CHIPS.includes(name)) return;
      const key = JSON.stringify([type, name]);
      if (seen.has(key) && seen.get(key) !== slotIndex) {
        const entry = duplicates.get(key) || { type, name, slots: new Set([seen.get(key)]) };
        entry.slots.add(slotIndex);
        duplicates.set(key, entry);
      } else if (!seen.has(key)) {
        seen.set(key, slotIndex);
      }
    });
  });
  const list = [...duplicates.values()].map(entry => ({ type: entry.type, name: entry.name, slots: [...entry.slots].sort().map(index => index + 1) }));
  const unchecked = slots.map((slot, index) => ({ ...slot, number: index + 1 })).filter(slot => slot.status !== "checked");
  return { slots, duplicates: list, unchecked, passed: unchecked.length === 0 && list.length === 0 && slots.length === 3 };
}
