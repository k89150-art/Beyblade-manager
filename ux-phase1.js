(function () {
  const LOADING_TEXTS = [
    "已登入，正在載入雲端資料...",
    "正在載入雲端資料..."
  ];

  let loadingBox = null;
  let actionUnlockTimer = null;
  let lastActionAt = 0;

  function getStatusEl() {
    return document.getElementById("syncStatus");
  }

  function ensureLoadingBox() {
    if (loadingBox) return loadingBox;

    loadingBox = document.createElement("div");
    loadingBox.id = "cloudLoadingBox";
    loadingBox.textContent = "正在載入雲端資料...";
    loadingBox.style.cssText = [
      "display:none",
      "width:760px",
      "max-width:95vw",
      "margin:0 auto 14px auto",
      "box-sizing:border-box",
      "padding:12px 14px",
      "border-radius:12px",
      "border:1px solid rgba(116,192,252,0.35)",
      "background:rgba(116,192,252,0.10)",
      "color:#b9ddff",
      "font-size:14px",
      "font-weight:700",
      "line-height:1.5"
    ].join(";");

    const authArea = document.getElementById("authArea");
    if (authArea && authArea.parentNode) {
      authArea.parentNode.insertBefore(loadingBox, authArea.nextSibling);
    } else {
      document.body.prepend(loadingBox);
    }

    return loadingBox;
  }

  function setTablesLoading(isLoading) {
    const box = ensureLoadingBox();
    box.style.display = isLoading ? "block" : "none";

    document.querySelectorAll(".container .table-wrap").forEach(wrap => {
      wrap.style.opacity = isLoading ? "0.45" : "";
      wrap.style.pointerEvents = isLoading ? "none" : "";
    });
  }

  function updateLoadingFromStatus() {
    const status = getStatusEl();
    const text = status ? status.textContent.trim() : "";
    setTablesLoading(LOADING_TEXTS.includes(text));
  }

  function installLoadingStatus() {
    const status = getStatusEl();
    if (!status) {
      setTimeout(installLoadingStatus, 200);
      return;
    }

    updateLoadingFromStatus();

    const observer = new MutationObserver(updateLoadingFromStatus);
    observer.observe(status, { childList: true, subtree: true, characterData: true });
  }

  function normalizeCellValue(text) {
    const value = String(text || "").trim();
    return value && value !== "-" ? value : "";
  }

  function isCxModel(text) {
    return String(text || "").trim().toUpperCase().startsWith("CX");
  }

  function getOriginalCells(row) {
    try {
      return JSON.parse(row.dataset.originalCells || "[]");
    } catch (error) {
      return [];
    }
  }

  function prepareCxConfigEditRow(row) {
    if (!row || !row.cells || row.cells.length < 9) return;

    const originalCells = getOriginalCells(row);
    const model = normalizeCellValue(originalCells[0] || row.cells[0]?.innerText);
    if (!isCxModel(model)) return;

    const originalMain = normalizeCellValue(originalCells[3] || row.cells[3]?.innerText);
    const originalTranscend = normalizeCellValue(originalCells[4] || row.cells[4]?.innerText);
    const originalMetal = normalizeCellValue(originalCells[5] || row.cells[5]?.innerText);

    const mainSelect = row.cells[3]?.querySelector("select");
    const transcendSelect = row.cells[4]?.querySelector("select");
    const metalSelect = row.cells[5]?.querySelector("select");

    const isSplitBlade = originalMain.includes("/") && originalTranscend && originalMetal;
    const isNormalMainBlade = originalMain && !originalMain.includes("/") && !originalTranscend && !originalMetal;

    if (isSplitBlade) {
      if (mainSelect) mainSelect.value = "";
      if (transcendSelect) transcendSelect.value = originalTranscend;
      if (metalSelect) metalSelect.value = originalMetal;
      return;
    }

    if (isNormalMainBlade) {
      if (transcendSelect) transcendSelect.value = "";
      if (metalSelect) metalSelect.value = "";
    }
  }

  function scrollToEditingRow(row) {
    if (!row || !row.scrollIntoView) return;

    setTimeout(() => {
      row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

      const firstInput = row.querySelector("input, select, textarea");
      if (firstInput && firstInput.focus) {
        setTimeout(() => firstInput.focus({ preventScroll: true }), 250);
      }
    }, 80);
  }

  function installEditScroll() {
    if (typeof window.editRow !== "function") {
      setTimeout(installEditScroll, 200);
      return;
    }

    if (window.editRow.__phase1Wrapped) return;

    const originalEditRow = window.editRow;
    window.editRow = function (button, tableType) {
      const row = button && button.closest ? button.closest("tr") : null;
      const result = originalEditRow.apply(this, arguments);

      if (tableType === "config") {
        setTimeout(() => prepareCxConfigEditRow(row), 30);
      }

      scrollToEditingRow(row);
      return result;
    };

    window.editRow.__phase1Wrapped = true;
  }

  function installActionGuard() {
    document.addEventListener("click", event => {
      const button = event.target && event.target.closest ? event.target.closest("button") : null;
      if (!button) return;

      const text = button.textContent.trim();
      const isWriteButton = ["新增", "新增零件", "加入配置表", "保存", "確認刪除", "刪除", "還原"].some(label => text.includes(label));
      if (!isWriteButton) return;

      const now = Date.now();
      if (now - lastActionAt < 700) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      lastActionAt = now;
      button.dataset.phase1OriginalDisabled = button.disabled ? "1" : "0";
      button.disabled = true;

      clearTimeout(actionUnlockTimer);
      actionUnlockTimer = setTimeout(() => {
        if (button.dataset.phase1OriginalDisabled !== "1") button.disabled = false;
        delete button.dataset.phase1OriginalDisabled;
      }, 800);
    }, true);
  }

  function installPhase1() {
    installLoadingStatus();
    installEditScroll();
    installActionGuard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPhase1);
  } else {
    installPhase1();
  }
})();
