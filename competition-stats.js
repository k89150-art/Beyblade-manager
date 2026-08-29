import {loadStatistics, CATEGORIES, readRoute} from './competition-stats-data.js';
import {tabsMarkup, categoryMarkup, searchMarkup, sourceInfo, detailMarkup, detailTableMarkup, DETAIL_TABS, WARNING} from './competition-stats-view.js';

const $ = id => document.getElementById(id);
let store, route = null;
let homeState = {category:'blades', expanded:{}, query:'', resultsOpen:false, scroll:0};
const detailExpanded = {};
const mobile = window.matchMedia('(max-width: 767px)');
function syncPanelRoles() {
  for (const group of ['category','detail']) for (const panel of document.querySelectorAll(`[id^="${group}-panel-"]`)) {
    const key = panel.id.slice(`${group}-panel-`.length);
    panel.setAttribute('role',mobile.matches ? 'tabpanel' : 'region');
    panel.setAttribute('aria-labelledby',`${group}-${mobile.matches ? 'tab' : 'heading'}-${key}`);
    if(mobile.matches) panel.tabIndex=0; else panel.removeAttribute('tabindex');
  }
}
mobile.addEventListener('change',syncPanelRoles);
function saveHome() {
  if (route !== null || !store) return;
  homeState.scroll = window.scrollY;
  history.replaceState({...history.state, competitionStats: homeState}, '');
}
function renderSearch() {
  const entries = store.search(homeState.query);
  $('clear-search').disabled = !homeState.query;
  $('search-results-panel').hidden = !homeState.resultsOpen;
  $('search-count').textContent = entries.length ? `找到 ${entries.length} 個上蓋` : '找不到符合的上蓋';
  $('search-results').innerHTML = searchMarkup(entries);
}
function renderHome() {
  $('category-tabs').innerHTML = tabsMarkup(CATEGORIES, homeState.category, 'category');
  $('leaderboards').innerHTML = Object.keys(CATEGORIES).map(key => categoryMarkup(store, key, !!homeState.expanded[key], homeState.category)).join('');
  $('blade-search').value = homeState.query;
  renderSearch();
  $('meta-source').innerHTML = sourceInfo(store.statistics, 'metaBeys') + `<p class="stat-warning">${WARNING}</p>`;
}
function renderRoute() {
  const priorRoute = route;
  route = readRoute(location.hash);
  $('stats-home').hidden = route !== null;
  $('stats-detail').hidden = route === null;
  if (route !== null) {
    if (priorRoute === null && store && history.state?.competitionStats == null && !initialRoute) history.replaceState({statsFromHome:true}, '');
    $('stats-detail').innerHTML = detailMarkup(store, store.blade(route));
    Object.keys(detailExpanded).forEach(key => delete detailExpanded[key]);
    document.title = `${$('stats-detail').querySelector('h1')?.textContent || '上蓋'}｜競賽統計`;
    window.scrollTo(0,0);
    $('stats-detail').querySelector('h1')?.focus({preventScroll:true});
  } else {
    homeState = history.state?.competitionStats || homeState;
    renderHome();
    document.title = '競賽統計｜戰鬥陀螺管理表';
    requestAnimationFrame(() => window.scrollTo(0,homeState.scroll || 0));
  }
  initialRoute = false;
  syncPanelRoles();
}
let initialRoute = true;
async function start() {
  $('load-state').hidden = false;
  $('error-state').hidden = true;
  try {
    store = await loadStatistics();
    $('load-state').hidden = true;
    $('metric-definitions').hidden = false;
    renderRoute();
  } catch (error) {
    $('load-state').hidden = true;
    $('error-state').hidden = false;
    $('error-message').textContent = error.message;
  }
}
function activateTab(button) {
  const {tabGroup,tab} = button.dataset;
  const items = tabGroup === 'category' ? CATEGORIES : DETAIL_TABS;
  for (const key of Object.keys(items)) {
    const control = $(`${tabGroup}-tab-${key}`);
    control.setAttribute('aria-selected',String(key === tab));
    control.tabIndex = key === tab ? 0 : -1;
    $(`${tabGroup}-panel-${key}`).classList.toggle('mobile-active',key === tab);
  }
  if (tabGroup === 'category') { homeState.category = tab; saveHome(); }
}
document.addEventListener('click', event => {
  const target = event.target.closest('button,a');
  if (!target || !store) return;
  if (target.matches('[data-blade-link]')) saveHome();
  if (target.matches('[data-back]') && history.state?.statsFromHome) { event.preventDefault(); history.back(); }
  if (target.dataset.tab) activateTab(target);
  if (target.dataset.expand) {
    const key = target.dataset.expand;
    homeState.expanded[key] = !homeState.expanded[key];
    $(`category-panel-${key}`).outerHTML = categoryMarkup(store,key,homeState.expanded[key],homeState.category);
    syncPanelRoles();
    document.querySelector(`[data-expand="${key}"]`).focus({preventScroll:true});
    saveHome();
  }
  if (target.dataset.detailExpand) {
    const key = target.dataset.detailExpand;
    detailExpanded[key] = !detailExpanded[key];
    const entry = store.blade(route);
    $(`detail-panel-${key}`).innerHTML = detailTableMarkup(entry?.source?.[key],key,detailExpanded[key],{store,entry});
    document.querySelector(`[data-detail-expand="${key}"]`).focus({preventScroll:true});
  }
});
document.addEventListener('keydown', event => {
  const target = event.target.closest('[role=tab]');
  if (!target || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const controls = [...target.parentElement.querySelectorAll('[role=tab]')];
  const index = controls.indexOf(target);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + controls.length)%controls.length;
  activateTab(controls[next]); controls[next].focus();
});
$('blade-search').addEventListener('input', () => {
  homeState.query = $('blade-search').value; homeState.resultsOpen = true; renderSearch(); saveHome();
});
$('blade-search').addEventListener('focus', () => {
  if (!store) return;
  homeState.resultsOpen = true; renderSearch();
});
$('blade-search').addEventListener('keydown', event => {
  if (['ArrowDown','ArrowUp','Enter'].includes(event.key)) {
    event.preventDefault();
    const links = $('search-results').querySelectorAll('a');
    const target = event.key === 'ArrowUp' ? links[links.length-1] : links[0];
    if (event.key === 'Enter') target?.click(); else target?.focus();
  } else if (event.key === 'Escape') { homeState.resultsOpen = false; renderSearch(); }
});
$('search-results').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    const link = event.target.closest('a[data-blade-link]');
    if (link) { event.preventDefault(); link.click(); }
    return;
  }
  if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  const links = [...$('search-results').querySelectorAll('a')];
  const next = links.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1);
  if (next < 0) $('blade-search').focus(); else links[Math.min(next,links.length-1)]?.focus();
});
$('clear-search').addEventListener('click', () => {
  homeState.query = ''; homeState.resultsOpen = true; $('blade-search').value = ''; renderSearch(); saveHome(); $('blade-search').focus();
});
$('close-search').addEventListener('click', () => { homeState.resultsOpen = false; renderSearch(); saveHome(); });
$('retry-load').addEventListener('click',start);
window.addEventListener('hashchange', () => { if(store) renderRoute(); });
let scrollTimer;
window.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(saveHome,150); }, {passive:true});
start();
