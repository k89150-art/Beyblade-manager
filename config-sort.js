(function () {
  let isSorting = false;
  let sortTimer = null;

  const seriesOrder = {
    UX: 1,
    BX: 2,
    CX: 3,
    OTHER: 4
  };

  function getSeriesFromModel(model) {
    const text = String(model || "").trim().toUpperCase();
    if (text.startsWith("UX")) return "UX";
    if (text.startsWith("BX")) return "BX";
    if (text.startsWith("CX")) return "CX";
    return "OTHER";
  }

  function getModelFromRow(row) {
    const cell = row.cells && row.cells[0];
    if (!cell) return "";

    const input = cell.querySelector("input");
    if (input) return input.value.trim();

    return cell.innerText.trim();
  }

  function shouldSkipSort(tbody) {
    return !!tbody.querySelector("input, select, textarea") ||
           Array.from(tbody.rows).some(row => row.dataset.editing === "true");
  }

  function sortConfigTable() {
    const tbody = document.querySelector("#configTable tbody");
    if (!tbody || isSorting || shouldSkipSort(tbody)) return;

    const rows = Array.from(tbody.querySelectorAll("tr"));
    if (rows.length <= 1) return;

    const sortedRows = [...rows].sort((a, b) => {
      const modelA = getModelFromRow(a);
      const modelB = getModelFromRow(b);

      const seriesA = getSeriesFromModel(modelA);
      const seriesB = getSeriesFromModel(modelB);

      const orderA = seriesOrder[seriesA] || 99;
      const orderB = seriesOrder[seriesB] || 99;

      if (orderA !== orderB) return orderA - orderB;

      return modelA.localeCompare(modelB, "zh-Hant", {
        numeric: true,
        sensitivity: "base"
      });
    });

    const alreadySorted = rows.every((row, index) => row === sortedRows[index]);
    if (alreadySorted) return;

    isSorting = true;
    sortedRows.forEach(row => tbody.appendChild(row));
    isSorting = false;
  }

  function scheduleSort() {
    clearTimeout(sortTimer);
    sortTimer = setTimeout(sortConfigTable, 80);
  }

  function installConfigSort() {
    const tbody = document.querySelector("#configTable tbody");
    if (!tbody) {
      setTimeout(installConfigSort, 200);
      return;
    }

    sortConfigTable();

    const observer = new MutationObserver(() => {
      if (!isSorting) scheduleSort();
    });

    observer.observe(tbody, {
      childList: true,
      subtree: true,
      characterData: true
    });

    document.addEventListener("click", event => {
      const target = event.target;
      if (!target || !target.closest) return;
      if (target.closest("#configTable") || target.closest("#config-selector")) {
        scheduleSort();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installConfigSort);
  } else {
    installConfigSort();
  }
})();
