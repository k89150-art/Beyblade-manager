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
  { href: "index.html", label: "陀螺配置", group: "工具" },
  { href: "tournament.html", label: "參賽紀錄", group: "工具" },
  { href: "analysis.html", label: "配置分析", group: "工具" },
  { href: "home.html", label: "首頁", group: "說明" },
  { href: "guide.html", label: "使用教學", group: "說明" },
  { href: "changelog.html", label: "更新紀錄", group: "說明" },
  { href: "privacy.html", label: "隱私權政策", group: "說明" },
  { href: "about.html", label: "關於本站", group: "說明" },
  { href: "contact.html", label: "聯絡方式", group: "說明" },
  { href: "admin.html", label: "管理員後台", group: "管理", adminOnly: true }
];

function openSideMenu() {
  document.body.classList.add("side-menu-open");
}

function closeSideMenu() {
  document.body.classList.remove("side-menu-open");
}

function currentPageName() {
  return location.pathname.split("/").pop() || "home.html";
}

function buildSideMenuInnerHtml() {
  const currentPage = currentPageName();
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

    const activeClass = item.href === currentPage ? " active" : "";
    const hidden = item.adminOnly ? ' style="display:none;"' : "";
    html += `<a href="${item.href}" class="side-menu-link${activeClass}"${hidden}>${item.label}</a>`;
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

  let menu = document.querySelector(".side-menu");
  if (!menu) {
    document.body.insertAdjacentHTML("afterbegin", `<nav class="side-menu" aria-label="主選單"></nav>`);
    menu = document.querySelector(".side-menu");
  }

  return menu;
}

function renderSideMenu() {
  const menu = ensureSideMenuShell();
  menu.innerHTML = buildSideMenuInnerHtml();
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
  renderSideMenu();
  installAdminMenuGuard();
})();

window.openSideMenu = openSideMenu;
window.closeSideMenu = closeSideMenu;