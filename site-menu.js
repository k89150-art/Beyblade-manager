const ADMIN_UID = "SesDhvXG6MUT38YhqGl0N6lVgMz1";
const firebaseConfig = {
  apiKey: "AIzaSyABQadKr-Am-55GgFJmhZ0tkRY-joARNAQ",
  authDomain: "k89150-web-login.firebaseapp.com",
  projectId: "k89150-web-login",
  storageBucket: "k89150-web-login.firebasestorage.app",
  messagingSenderId: "488040360398",
  appId: "1:488040360398:web:759698c16eb67e14f1639f"
};

const HELP_NAV_ITEMS = [
  { href: "home.html", label: "首頁", icon: "home", sideMenu: true },
  { href: "index.html", label: "開始使用", icon: "play", sideMenu: true },
  { href: "guide.html", label: "使用教學", icon: "book", sideMenu: true },
  { href: "changelog.html", label: "更新紀錄", icon: "history", sideMenu: true },
  { href: "privacy.html", label: "隱私權政策", icon: "shield", sideMenu: true },
  { href: "about.html", label: "關於本站", icon: "info", sideMenu: true },
  { href: "contact.html", label: "聯絡方式", icon: "mail", sideMenu: true }
];

const SIDE_MENU_ITEMS = [
  { href: "index.html#collectionSection", label: "收藏", symbol: "C", icon: "collection", group: "主要功能", section: "collectionSection", bottom: true },
  { href: "index.html#inventorySection", label: "額外零件庫存", bottomLabel: "庫存", symbol: "I", icon: "inventory", group: "主要功能", section: "inventorySection", bottom: true },
  { href: "index.html#configSection", label: "配置紀錄", bottomLabel: "配置", symbol: "X", icon: "config", group: "主要功能", section: "configSection", bottom: true },
  { href: "competition-stats.html", label: "競賽統計", symbol: "S", icon: "stats", group: "主要功能", page: "competition-stats.html", bottom: true },
  { href: "tournament.html", label: "賽事", symbol: "3G", icon: "trophy", group: "主要功能", page: "tournament.html", bottom: true },
  { href: "index.html#configQuickEditor", label: "Quick Editor", icon: "sliders", group: "工具", action: "quick-editor" },
  ...HELP_NAV_ITEMS
    .filter(item => item.sideMenu)
    .map(item => ({ ...item, group: "說明", suppressActive: item.href === "index.html" })),
  { href: "admin.html", label: "管理員後台", icon: "admin", group: "管理", adminOnly: true }
];

const DESKTOP_NAV_STATE_KEY = "beybladeDesktopNavCollapsed";
const SITE_THEME_STORAGE_KEY = "beybladeSiteTheme";
const SITE_THEMES = ["dark", "beige"];
const SITE_VERSION = "v1.9.0";

const MENU_ICONS = {
  collection: '<path d="M6 3.75h12v17l-6-3.5-6 3.5z"/>',
  inventory: '<path d="m4 7 8-4 8 4-8 4z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4z"/><path d="M12 11v10"/>',
  config: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  trophy: '<path d="M8 4h8v4c0 4-1.8 6-4 6s-4-2-4-6z"/><path d="M8 6H4v2c0 2.2 1.4 4 4 4M16 6h4v2c0 2.2-1.4 4-4 4M12 14v4M8 21h8M9 18h6"/>',
  sliders: '<path d="M4 6h7M15 6h5M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  book: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  admin: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.4 3.5-6.5 8-6.5s7.2 2.1 8 6.5"/>'
};

function normalizeSiteTheme(theme) {
  return SITE_THEMES.includes(theme) ? theme : "dark";
}

function readStoredSiteTheme() {
  try {
    return normalizeSiteTheme(localStorage.getItem(SITE_THEME_STORAGE_KEY));
  } catch (error) {
    return "dark";
  }
}

function applySiteTheme(theme, persist = true) {
  const nextTheme = normalizeSiteTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme === "beige" ? "light" : "dark";

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = nextTheme === "beige" ? "#f1eadf" : "#090d12";

  document.querySelectorAll("[data-theme-option]").forEach(button => {
    const active = button.dataset.themeOption === nextTheme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  if (persist) {
    try {
      localStorage.setItem(SITE_THEME_STORAGE_KEY, nextTheme);
    } catch (error) {
      console.warn("無法儲存主題設定：", error);
    }
  }

  return nextTheme;
}

function setSiteTheme(theme) {
  applySiteTheme(theme, true);
}

function toggleSiteTheme() {
  setSiteTheme(document.documentElement.dataset.theme === "beige" ? "dark" : "beige");
}

applySiteTheme(readStoredSiteTheme(), false);

import('./retire-analysis-cache.js?v=20260828-reference-only')
  .then(({ retireAnalysisCaches }) => retireAnalysisCaches({
    storage: window.localStorage,
    cacheStorage: window.caches,
    baseUrl: document.baseURI
  }))
  .catch(error => console.warn('舊功能資源快取清理未完成，稍後重試。', error));

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
  if (item.suppressActive || item.action) return false;
  const page = currentPageName();
  if (item.section) return page === "index.html" && item.section === activeToolSection;
  return (item.page || item.href.split("#")[0]) === page;
}

function buildMenuIcon(iconName) {
  const paths = MENU_ICONS[iconName];
  if (!paths) return "";
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function buildMenuLinkInnerHtml(item, bottom = false) {
  const icon = bottom
    ? (item.symbol ? `<span class="nav-symbol">${item.symbol}</span>` : "")
    : buildMenuIcon(item.icon);
  const label = bottom ? (item.bottomLabel || item.label) : item.label;
  return `${icon}<span>${label}</span>`;
}

function buildSideMenuInnerHtml() {
  let html = `
    <div class="side-menu-brand">
      <div class="side-menu-logo" aria-hidden="true">BX</div>
      <div>
        <div class="side-menu-title">戰鬥陀螺管理器</div>
        <div class="side-menu-subtitle">BEYBLADE MANAGER</div>
      </div>
    </div>
    <div class="side-menu-links">
  `;
  let currentGroup = "";

  SIDE_MENU_ITEMS.forEach(item => {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      const adminOnly = item.adminOnly ? ' data-admin-only="true" aria-hidden="true"' : "";
      html += `<div class="side-menu-section" data-menu-group="${item.group}"${adminOnly}>${item.group}</div>`;
    }

    const activeClass = isMenuItemActive(item) ? " active" : "";
    const adminOnly = item.adminOnly ? ' data-admin-only="true" aria-hidden="true"' : "";
    const sectionTarget = item.section ? ` data-section-target="${item.section}"` : "";
    const menuAction = item.action ? ` data-menu-action="${item.action}"` : "";
    const currentAttribute = activeClass ? ' aria-current="page"' : "";
    html += `<a href="${item.href}" class="side-menu-link${activeClass}"${sectionTarget}${menuAction}${adminOnly}${currentAttribute}>${buildMenuLinkInnerHtml(item)}</a>`;
  });

  html += `
    </div>
    <footer class="side-menu-footer">
      <button type="button" class="side-menu-close" onclick="closeSideMenu()">關閉選單</button>
      <section class="theme-switcher" aria-label="主題設定">
        <div class="theme-segment" role="group" aria-label="選擇顯示主題">
          <button type="button" class="theme-option" data-theme-option="dark" aria-pressed="false" onclick="setSiteTheme('dark')">
            <svg class="theme-option-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2z"/></svg>
            <span class="theme-segment-label">深色</span>
          </button>
          <button type="button" class="theme-option" data-theme-option="beige" aria-pressed="false" onclick="setSiteTheme('beige')">
            <svg class="theme-option-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            <span class="theme-segment-label">米色</span>
          </button>
        </div>
      </section>
      <div class="side-menu-version">${SITE_VERSION}</div>
    </footer>
  `;
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
      return `<a href="${item.href}" class="bottom-nav-link${activeClass}"${sectionTarget}>${buildMenuLinkInnerHtml(item, true)}</a>`;
    })
    .join("");
}

function installSideMenuActions() {
  document.querySelectorAll(".side-menu-link").forEach(link => {
    link.addEventListener("click", closeSideMenu);
  });

  document.querySelectorAll('[data-menu-action="quick-editor"]').forEach(link => {
    link.addEventListener("click", event => {
      if (currentPageName() !== "index.html") return;
      event.preventDefault();
      closeSideMenu();
      if (typeof window.openConfigQuickEditor === "function") {
        window.openConfigQuickEditor();
      }
    });
  });
}

function renderHelpPageNavigation() {
  document.querySelectorAll("[data-help-nav]").forEach(nav => {
    nav.innerHTML = HELP_NAV_ITEMS
      .map(item => {
        const active = currentPageName() === item.href;
        const activeClass = active ? " active" : "";
        const currentAttribute = active ? ' aria-current="page"' : "";
        return `<a class="help-nav-link${activeClass}" href="${item.href}"${currentAttribute}>${item.label}</a>`;
      })
      .join("");
  });
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
  applySiteTheme(document.documentElement.dataset.theme, false);
  installSideMenuActions();
  renderBottomNav();
}

function setAdminMenuVisibility(isAdmin) {
  document.body.classList.toggle("is-admin", isAdmin);

  document.querySelectorAll('.side-menu a[href="admin.html"]').forEach(link => {
    link.setAttribute("aria-hidden", String(!isAdmin));
  });

  document.querySelectorAll('.side-menu-section').forEach(section => {
    if (section.textContent.trim() === "管理") {
      section.setAttribute("aria-hidden", String(!isAdmin));
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
  renderHelpPageNavigation();
  restoreDesktopNavState();
  installToolSectionTracking();
  installAdminMenuGuard();

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeSideMenu();
  });
})();

window.openSideMenu = openSideMenu;
window.closeSideMenu = closeSideMenu;
window.toggleDesktopNav = toggleDesktopNav;
window.setSiteTheme = setSiteTheme;
window.toggleSiteTheme = toggleSiteTheme;
