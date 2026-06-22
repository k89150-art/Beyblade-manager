function openSideMenu() {
  document.body.classList.add("side-menu-open");
}

function closeSideMenu() {
  document.body.classList.remove("side-menu-open");
}

(function initSideMenu() {
  if (document.querySelector(".side-menu")) return;

  const currentPage = location.pathname.split("/").pop() || "home.html";

  const items = [
    { href: "index.html", label: "陀螺配置", group: "工具" },
    { href: "tournament.html", label: "參賽紀錄", group: "工具" },
    { href: "home.html", label: "首頁", group: "說明" },
    { href: "guide.html", label: "使用教學", group: "說明" },
    { href: "changelog.html", label: "更新紀錄", group: "說明" },
    { href: "privacy.html", label: "隱私權政策", group: "說明" },
    { href: "about.html", label: "關於本站", group: "說明" },
    { href: "contact.html", label: "聯絡方式", group: "說明" }
  ];

  let html = `
    <button type="button" class="side-menu-button" onclick="openSideMenu()">☰</button>
    <div class="side-menu-backdrop" onclick="closeSideMenu()"></div>
    <nav class="side-menu" aria-label="主選單">
      <div class="side-menu-title">戰鬥陀螺管理表</div>
      <div class="side-menu-subtitle">選擇要使用的功能頁面</div>
  `;

  let currentGroup = "";
  items.forEach(item => {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      html += `<div class="side-menu-section">${currentGroup}</div>`;
    }

    const activeClass = item.href === currentPage ? " active" : "";
    html += `<a href="${item.href}" class="side-menu-link${activeClass}">${item.label}</a>`;
  });

  html += `
      <button type="button" class="side-menu-close" onclick="closeSideMenu()">關閉選單</button>
    </nav>
  `;

  document.body.insertAdjacentHTML("afterbegin", html);
})();

window.openSideMenu = openSideMenu;
window.closeSideMenu = closeSideMenu;
