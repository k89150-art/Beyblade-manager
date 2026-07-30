const ADMIN_UID = "SesDhvXG6MUT38YhqGl0N6lVgMz1";
const firebaseConfig = {
  apiKey: "AIzaSyABQadKr-Am-55GgFJmhZ0tkRY-joARNAQ",
  authDomain: "k89150-web-login.firebaseapp.com",
  projectId: "k89150-web-login",
  storageBucket: "k89150-web-login.firebasestorage.app",
  messagingSenderId: "488040360398",
  appId: "1:488040360398:web:759698c16eb67e14f1639f"
};

const SIDE_MENU_ITEMS = [
  { href: "index.html#collectionSection", label: "收藏", symbol: "C", group: "工具", section: "collectionSection", bottom: true },
  { href: "index.html#inventorySection", label: "庫存", symbol: "I", group: "工具", section: "inventorySection", bottom: true },
  { href: "index.html#configSection", label: "配置", symbol: "X", group: "工具", section: "configSection", bottom: true },
  { href: "analysis.html", label: "分析", symbol: "A", group: "工具", page: "analysis.html", bottom: true },
  { href: "tournament.html", label: "賽事", symbol: "3G", group: "工具", page: "tournament.html", bottom: true },
  { href: "home.html", label: "首頁", group: "說明" },
  { href: "guide.html", label: "使用教學", group: "說明" },
  { href: "changelog.html", label: "更新紀錄", group: "說明" },
  { href: "privacy.html", label: "隱私權政策", group: "說明" },
  { href: "about.html", label: "關於本站", group: "說明" },
  { href: "contact.html", label: "聯絡方式", group: "說明" },
  { href: "admin.html", label: "管理員後台", group: "管理", adminOnly: true }
];

const DESKTOP_NAV_STATE_KEY = "beybladeDesktopNavCollapsed";

function openSideMenu() {
  document.body.classList.add("side-menu-open");
}

function closeSideMenu() {
  document.body.classList.remove("side-menu-open");
}

function setDesktopNavCollapsed(collapsed, persist = true) {
  document.body.classList.toggle("desktop-nav-collapsed", collapsed);

  const button = document.querySelector(".side-menu-collapse");
  if (button) {
    button.textContent = collapsed ? "›" : "‹";
    button.title = collapsed ? "展開左側欄" : "收合左側欄";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-expanded", String(!collapsed));
  }

  if (persist) {
    try {
      localStorage.setItem(DESKTOP_NAV_STATE_KEY, collapsed ? "1" : "0");
    } catch (error) {
      console.warn("無法儲存側欄顯示狀態：", error);
    }
  }
}

function toggleDesktopNav() {
  setDesktopNavCollapsed(!document.body.classList.contains("desktop-nav-collapsed"));
}

function restoreDesktopNavState() {
  try {
    setDesktopNavCollapsed(localStorage.getItem(DESKTOP_NAV_STATE_KEY) === "1", false);
  } catch (error) {
    setDesktopNavCollapsed(false, false);
  }
}

function currentPageName() {
  return location.pathname.split("/").pop() || "index.html";
}

function getInitialToolSection() {
  const hash = location.hash.replace("#", "");
  return ["collectionSection", "inventorySection", "configSection"].includes(hash)
    ? hash
    : "collectionSection";
}

let activeToolSection = getInitialToolSection();

function isMenuItemActive(item) {
  const page = currentPageName();
  if (item.section) return page === "index.html" && item.section === activeToolSection;
  return (item.page || item.href.split("#")[0]) === page;
}

function buildMenuLinkInnerHtml(item) {
  const symbol = item.symbol ? `<span class="nav-symbol">${item.symbol}</span>` : "";
  return `${symbol}<span>${item.label}</span>`;
}

function buildSideMenuInnerHtml() {
  let html = `
    <div class="side-menu-title">戰鬥陀螺管理表</div>
    <div class="side-menu-subtitle">選擇要使用的功能頁面</div>
  `;
  let currentGroup = "";

  SIDE_MENU_ITEMS.forEach(item => {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      const hidden = item.adminOnly ? ' style="display:none;"' : "";
      html += `<div class="side-menu-section" data-menu-group="${item.group}"${hidden}>${item.group}</div>`;
    }

    const activeClass = isMenuItemActive(item) ? " active" : "";
    const hidden = item.adminOnly ? ' style="display:none;"' : "";
    const sectionTarget = item.section ? ` data-section-target="${item.section}"` : "";
    html += `<a href="${item.href}" class="side-menu-link${activeClass}"${sectionTarget}${hidden}>${buildMenuLinkInnerHtml(item)}</a>`;
  });

  html += `<button type="button" class="side-menu-close" onclick="closeSideMenu()">關閉選單</button>`;
  return html;
}

function ensureSideMenuShell() {
  if (!document.querySelector(".side-menu-button")) {
    document.body.insertAdjacentHTML("afterbegin", `<button type="button" class="side-menu-button" onclick="openSideMenu()">☰</button>`);
  }

  if (!document.querySelector(".side-menu-backdrop")) {
    document.body.insertAdjacentHTML("afterbegin", `<div class="side-menu-backdrop" onclick="closeSideMenu()"></div>`);
  }

  if (!document.querySelector(".side-menu-collapse")) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<button type="button" class="side-menu-collapse" onclick="toggleDesktopNav()" aria-label="收合左側欄" aria-expanded="true" title="收合左側欄">‹</button>`
    );
  }

  let menu = document.querySelector(".side-menu");
  if (!menu) {
    document.body.insertAdjacentHTML("afterbegin", `<nav class="side-menu" aria-label="主選單"></nav>`);
    menu = document.querySelector(".side-menu");
  }

  return menu;
}

function ensureBottomNavShell() {
  let nav = document.querySelector(".bottom-nav");
  if (!nav) {
    document.body.insertAdjacentHTML("beforeend", '<nav class="bottom-nav" aria-label="手機版主要導覽"></nav>');
    nav = document.querySelector(".bottom-nav");
  }

  return nav;
}

function renderBottomNav() {
  const nav = ensureBottomNavShell();
  nav.innerHTML = SIDE_MENU_ITEMS
    .filter(item => item.bottom)
    .map(item => {
      const activeClass = isMenuItemActive(item) ? " active" : "";
      const sectionTarget = item.section ? ` data-section-target="${item.section}"` : "";
      return `<a href="${item.href}" class="bottom-nav-link${activeClass}"${sectionTarget}>${buildMenuLinkInnerHtml(item)}</a>`;
    })
    .join("");
}

function updateNavigationActiveState(sectionId) {
  if (sectionId) activeToolSection = sectionId;

  document.querySelectorAll("[data-section-target]").forEach(link => {
    link.classList.toggle(
      "active",
      currentPageName() === "index.html" && link.dataset.sectionTarget === activeToolSection
    );
  });
}

function installToolSectionTracking() {
  if (currentPageName() !== "index.html") return;

  const sections = ["collectionSection", "inventorySection", "configSection"]
    .map(id => document.getElementById(id))
    .filter(Boolean);

  document.querySelectorAll("[data-section-target]").forEach(link => {
    link.addEventListener("click", () => updateNavigationActiveState(link.dataset.sectionTarget));
  });

  if (!("IntersectionObserver" in window) || sections.length === 0) return;

  const observer = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) updateNavigationActiveState(visible.target.id);
  }, { rootMargin: "-18% 0px -62%", threshold: [0, 0.1, 0.35] });

  sections.forEach(section => observer.observe(section));
}

function renderSideMenu() {
  const menu = ensureSideMenuShell();
  menu.innerHTML = buildSideMenuInnerHtml();
  renderBottomNav();
}

function setAdminMenuVisibility(isAdmin) {
  document.body.classList.toggle("is-admin", isAdmin);

  document.querySelectorAll('.side-menu a[href="admin.html"]').forEach(link => {
    link.style.display = isAdmin ? "block" : "none";
  });

  document.querySelectorAll('.side-menu-section').forEach(section => {
    if (section.textContent.trim() === "管理") {
      section.style.display = isAdmin ? "block" : "none";
    }
  });
}

function installAdminMenuGuard() {
  setAdminMenuVisibility(false);

  import("https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js")
    .then(appModule => Promise.all([
      appModule,
      import("https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js")
    ]))
    .then(([appModule, authModule]) => {
      const app = appModule.getApps().length
        ? appModule.getApp()
        : appModule.initializeApp(firebaseConfig);
      const auth = authModule.getAuth(app);

      authModule.onAuthStateChanged(auth, user => {
        setAdminMenuVisibility(Boolean(user && user.uid === ADMIN_UID));
      });
    })
    .catch(error => {
      console.warn("管理員選單權限檢查初始化失敗：", error);
      setAdminMenuVisibility(false);
    });
}

(function initSideMenu() {
  document.body.classList.add("site-shell-ready");
  renderSideMenu();
  restoreDesktopNavState();
  installToolSectionTracking();
  installAdminMenuGuard();
})();

window.openSideMenu = openSideMenu;
window.closeSideMenu = closeSideMenu;
window.toggleDesktopNav = toggleDesktopNav;
