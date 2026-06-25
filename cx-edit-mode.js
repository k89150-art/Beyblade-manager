(function () {
  function getSeriesFromModelText(model) {
    const text = String(model || "").trim().toUpperCase();
    if (text.startsWith("CX")) return "CX";
    return "OTHER";
  }

  function normalizeCellValue(text) {
    const value = String(text || "").trim();
    return value && value !== "-" ? value : "";
  }

  function prepareCxConfigEditRow(row) {
    if (!row || !row.cells || row.cells.length < 9) return;

    const model = normalizeCellValue(row.cells[0]?.innerText);
    if (getSeriesFromModelText(model) !== "CX") return;

    const mainDisplay = normalizeCellValue(row.dataset.originalCells ? JSON.parse(row.dataset.originalCells || "[]")[3] : row.cells[3]?.innerText);
    const transcendDisplay = normalizeCellValue(row.dataset.originalCells ? JSON.parse(row.dataset.originalCells || "[]")[4] : row.cells[4]?.innerText);
    const metalDisplay = normalizeCellValue(row.dataset.originalCells ? JSON.parse(row.dataset.originalCells || "[]")[5] : row.cells[5]?.innerText);

    const isSplitBladeConfig = mainDisplay.includes("/") && transcendDisplay && metalDisplay;
    const isNormalMainBladeConfig = mainDisplay && !mainDisplay.includes("/") && !transcendDisplay && !metalDisplay;

    const mainSelect = row.cells[3]?.querySelector("select");
    const transcendSelect = row.cells[4]?.querySelector("select");
    const metalSelect = row.cells[5]?.querySelector("select");

    if (isSplitBladeConfig) {
      if (mainSelect) {
        mainSelect.value = "";
        mainSelect.dataset.autoDisplayOnly = mainDisplay;
      }
      if (transcendSelect && transcendDisplay) transcendSelect.value = transcendDisplay;
      if (metalSelect && metalDisplay) metalSelect.value = metalDisplay;
      return;
    }

    if (isNormalMainBladeConfig) {
      if (transcendSelect) transcendSelect.value = "";
      if (metalSelect) metalSelect.value = "";
    }
  }

  function installCxEditModeHelper() {
    if (typeof window.editRow !== "function") {
      setTimeout(installCxEditModeHelper, 200);
      return;
    }

    if (window.editRow.__cxModeWrapped) return;

    const originalEditRow = window.editRow;

    window.editRow = function (button, tableType) {
      const row = button && button.closest ? button.closest("tr") : null;
      const result = originalEditRow.apply(this, arguments);

      if (tableType === "config") {
        setTimeout(() => prepareCxConfigEditRow(row), 30);
      }

      return result;
    };

    window.editRow.__cxModeWrapped = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installCxEditModeHelper);
  } else {
    installCxEditModeHelper();
  }
})();
