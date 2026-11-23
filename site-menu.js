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

// Phase 7-1 (D-020): mobile bottom nav is 收藏／配置／＋新增／賽事／更多.
// "bottom" gives the bottom-nav position (3 = ＋新增 button, 5 = 更多 button).
const SIDE_MENU_ITEMS = [
  { href: "index.html#collectionSection", label: "收藏", symbol: "C", icon: "collection", group: "主要功能", section: "collectionSection", bottom: 1, bottomSections: ["collectionSection", "inventorySection"] },
  { href: "index.html#inventorySection", label: "零件", title: "額外零件庫存", icon: "inventory", group: "主要功能", section: "inventorySection", child: true },
  { href: "index.html#configSection", label: "配置紀錄", bottomLabel: "配置", symbol: "X", icon: "config", group: "主要功能", section: "configSection", bottom: 2, bottomSections: ["configSection"] },
  { href: "tournament.html", label: "賽事", symbol: "3G", icon: "trophy", group: "主要功能", page: "tournament.html", bottom: 4 },
  { href: "competition-stats.html", label: "競賽統計", icon: "stats", group: "參考", page: "competition-stats.html" },
  { href: "index.html#configQuickEditor", label: "建立配置（Quick Editor）", icon: "sliders", group: "工具", action: "quick-editor" },
  ...HELP_NAV_ITEMS
    .filter(item => item.sideMenu)
    .map(item => ({ ...item, group: "說明", suppressActive: item.href === "index.html" })),
  { href: "admin.html", label: "管理員後台", icon: "admin", group: "管理", adminOnly: true }
];

// ＋新增 menu. Navigation only: every write still goes through the page's own forms and guards.
const QUICK_ACTIONS = [
  { id: "add-collection", label: "新增收藏", href: "index.html#add-collection" },
  { id: "add-part", label: "新增零件", href: "index.html#add-part" },
  { id: "new-config", label: "建立配置", href: "index.html#configQuickEditor", action: "quick-editor" },
  { id: "add-tournament", label: "新增比賽", href: "tournament.html#add-tournament" },
  { id: "record-round", label: "記錄回合", href: "tournament.html", note: "開啟賽事頁" }
];
const QUICK_ACTION_TARGETS = {
  "add-collection": { page: "index.html", section: "collectionSection", focus: "model" },
  "add-part": { page: "index.html", section: "inventorySection", focus: "partName" },
  "add-tournament": { page: "tournament.html", focus: "tournamentDate" }
};
// Sections that light up a bottom-nav item; history belongs to 配置.
const SECTION_ALIASES = { historySection: "configSection" };

const DESKTOP_NAV_STATE_KEY = "beybladeDesktopNavCollapsed";
const SITE_THEME_STORAGE_KEY = "beybladeSiteTheme";
const SITE_THEMES = ["dark", "beige"];
const SITE_VERSION = "v1.13.0";

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
  admin: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.4 3.5-6.5 8-6.5s7.2 2.1 8 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
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

/* ===== nav model (pure: no DOM, tested in tests/site-navigation.test.mjs) ===== */
const TOOL_SECTIONS = ["collectionSection", "inventorySection", "configSection", "historySection"];

function sectionForHash(hash) {
  const id = String(hash || "").replace("#", "");
  if (TOOL_SECTIONS.includes(id)) return id;
  if (QUICK_ACTION_TARGETS[id]?.section) return QUICK_ACTION_TARGETS[id].section;
  return "collectionSection";
}

function getQuickActionTarget(hash, page) {
  const target = QUICK_ACTION_TARGETS[String(hash || "").replace("#", "")];
  return target && target.page === page ? target : null;
}

function navItemActive(item, page, section) {
  if (item.suppressActive || item.action) return false;
  if (item.section) return page === "index.html" && item.section === section;
  return (item.page || item.href.split("#")[0]) === page;
}

function bottomItemActive(item, page, section) {
  if (item.bottomSections) return page === "index.html" && item.bottomSections.includes(SECTION_ALIASES[section] || section);
  return navItemActive(item, page, section);
}

// "更多" lights up on pages that have no bottom-nav item of their own.
function moreActive(page) {
  return !["index.html", "tournament.html"].includes(page);
}

function buildBottomNavHtml(page, section) {
  const items = SIDE_MENU_ITEMS.filter(item => item.bottom).sort((a, b) => a.bottom - b.bottom);
  const link = item => {
    const active = bottomItemActive(item, page, section);
    const targets = item.bottomSections ? ` data-section-targets="${item.bottomSections.join(" ")}"` : "";
    return `<a href="${item.href}" class="bottom-nav-link${active ? " active" : ""}"${targets}${active ? ' aria-current="page"' : ""}>${buildMenuLinkInnerHtml(item, true)}</a>`;
  };
  const add = `<button type="button" class="bottom-nav-link bottom-nav-add" data-quick-add aria-haspopup="menu" aria-controls="quickAddMenu" aria-expanded="false"><span class="nav-symbol nav-symbol-add" aria-hidden="true">＋</span><span>新增</span></button>`;
  const more = `<button type="button" class="bottom-nav-link bottom-nav-more${moreActive(page) ? " active" : ""}" data-open-more aria-label="更多：競賽統計、說明與設定"><span class="nav-symbol" aria-hidden="true">⋯</span><span>更多</span></button>`;
  const byPos = new Map(items.map(item => [item.bottom, link(item)]));
  return [byPos.get(1), byPos.get(2), add, byPos.get(4), more].join("");
}

function buildQuickAddMenuHtml() {
  return QUICK_ACTIONS.map(action => {
    const menuAction = action.action ? ` data-menu-action="${action.action}"` : "";
    const note = action.note ? `<small>${action.note}</small>` : "";
    return `<a role="menuitem" href="${action.href}" class="quick-add-item" data-quick-action="${action.id}"${menuAction}><span>${action.label}</span>${note}</a>`;
  }).join("");
}
/* ===== end nav model ===== */

let activeToolSection = sectionForHash(location.hash);

function isMenuItemActive(item) {
  return navItemActive(item, currentPageName(), activeToolSection);
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
    <button type="button" class="side-menu-add" data-quick-add aria-haspopup="menu" aria-controls="quickAddMenu" aria-expanded="false">${buildMenuIcon("plus")}<span>新增</span></button>
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
    const childClass = item.child ? " is-child" : "";
    const title = item.title ? ` title="${item.title}"` : "";
    html += `<a href="${item.href}" class="side-menu-link${childClass}${activeClass}"${sectionTarget}${menuAction}${adminOnly}${currentAttribute}${title}>${buildMenuLinkInnerHtml(item)}</a>`;
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
  nav.innerHTML = buildBottomNavHtml(currentPageName(), activeToolSection);
  nav.querySelector("[data-open-more]")?.addEventListener("click", openSideMenu);
}

/* ===== ＋新增 menu ===== */
let quickAddTrigger = null;

function ensureQuickAddMenu() {
  let menu = document.getElementById("quickAddMenu");
  if (!menu) {
    document.body.insertAdjacentHTML("beforeend", `<div class="quick-add-backdrop" hidden></div><div id="quickAddMenu" class="quick-add-menu" role="menu" aria-label="新增" hidden>${buildQuickAddMenuHtml()}</div>`);
    menu = document.getElementById("quickAddMenu");
    document.querySelector(".quick-add-backdrop").addEventListener("click", () => closeQuickAddMenu(false));
    menu.addEventListener("keydown", event => {
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      const index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown") { event.preventDefault(); items[(index + 1) % items.length].focus(); }
      if (event.key === "ArrowUp") { event.preventDefault(); items[(index - 1 + items.length) % items.length].focus(); }
      if (event.key === "Home") { event.preventDefault(); items[0].focus(); }
      if (event.key === "End") { event.preventDefault(); items[items.length - 1].focus(); }
      if (event.key === "Tab") closeQuickAddMenu(false);
    });
    menu.querySelectorAll(".quick-add-item").forEach(item => item.addEventListener("click", () => closeQuickAddMenu(false)));
    installQuickEditorLinks(menu);
  }
  return menu;
}

function openQuickAddMenu(trigger) {
  const menu = ensureQuickAddMenu();
  closeSideMenu();
  quickAddTrigger = trigger;
  menu.hidden = false;
  document.querySelector(".quick-add-backdrop").hidden = false;
  document.body.classList.add("quick-add-open");
  document.querySelectorAll("[data-quick-add]").forEach(button => button.setAttribute("aria-expanded", String(button === trigger)));
  menu.querySelector('[role="menuitem"]')?.focus();
}

function closeQuickAddMenu(restoreFocus = true) {
  const menu = document.getElementById("quickAddMenu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  document.querySelector(".quick-add-backdrop").hidden = true;
  document.body.classList.remove("quick-add-open");
  document.querySelectorAll("[data-quick-add]").forEach(button => button.setAttribute("aria-expanded", "false"));
  if (restoreFocus) quickAddTrigger?.focus();
  quickAddTrigger = null;
}

function installQuickAddTriggers() {
  document.querySelectorAll("[data-quick-add]").forEach(button => {
    button.addEventListener("click", () => {
      const menu = document.getElementById("quickAddMenu");
      if (menu && !menu.hidden && quickAddTrigger === button) closeQuickAddMenu();
      else openQuickAddMenu(button);
    });
  });
}

// Scrolls to and focuses the field for #add-collection / #add-part / #add-tournament.
function handleQuickActionHash() {
  const target = getQuickActionTarget(location.hash, currentPageName());
  if (!target) return;
  if (target.section) updateNavigationActiveState(target.section);
  const field = document.getElementById(target.focus);
  if (!field) return;
  field.scrollIntoView({ block: "center", behavior: "smooth" });
  if (!field.disabled) field.focus({ preventScroll: true });
}

function installSideMenuActions() {
  document.querySelectorAll(".side-menu-link").forEach(link => {
    link.addEventListener("click", closeSideMenu);
  });

  installQuickEditorLinks(document);
}

function installQuickEditorLinks(root) {
  root.querySelectorAll('[data-menu-action="quick-editor"]').forEach(link => {
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
  const onIndex = currentPageName() === "index.html";

  document.querySelectorAll("[data-section-target]").forEach(link => {
    link.classList.toggle("active", onIndex && link.dataset.sectionTarget === activeToolSection);
  });
  document.querySelectorAll("[data-section-targets]").forEach(link => {
    const active = onIndex && link.dataset.sectionTargets.split(" ").includes(SECTION_ALIASES[activeToolSection] || activeToolSection);
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
}

function installToolSectionTracking() {
  if (currentPageName() !== "index.html") return;

  const sections = TOOL_SECTIONS
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
  ensureQuickAddMenu();
  installQuickAddTriggers();
  handleQuickActionHash();
  window.addEventListener("hashchange", handleQuickActionHash);

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closeQuickAddMenu();
    closeSideMenu();
  });
})();

window.openSideMenu = openSideMenu;
window.closeSideMenu = closeSideMenu;
window.toggleDesktopNav = toggleDesktopNav;
window.setSiteTheme = setSiteTheme;
window.toggleSiteTheme = toggleSiteTheme;
window.openQuickAddMenu = openQuickAddMenu;
window.closeQuickAddMenu = closeQuickAddMenu;
