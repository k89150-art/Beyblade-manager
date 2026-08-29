import {CATEGORIES, formatValue, formatDate, safeUrl, sourceRows, resolveBladeDisplayIdentity, entryName, entryEnglish, entryRank, entryStatus, bladeHref} from './competition-stats-data.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const e = escapeHtml;
const link = (url, label) => safeUrl(url) ? `<a href="${e(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>` : e(label);
export const WARNING = '以上數據依來源網站的統計定義呈現，不等同完整對戰勝率，也不代表本站推薦。';
export const DETAIL_TABS = {combos: '完整配置', ratchets: '固鎖', bits: '軸心'};
export function tabsMarkup(items, active, group) {
  return `<div class="stats-tabs" role="tablist" aria-label="${group === 'category' ? '零件分類' : '上蓋統計區塊'}">${Object.entries(items).map(([key, label]) => `<button type="button" id="${group}-tab-${key}" role="tab" aria-selected="${active === key}" aria-controls="${group}-panel-${key}" tabindex="${active === key ? 0 : -1}" data-tab-group="${group}" data-tab="${key}">${e(label)}</button>`).join('')}</div>`;
}
export function categoryMarkup(store, category, expanded = false, active = 'blades') {
  const rows = store.category(category);
  return `<section class="ranking-panel ${active === category ? 'mobile-active' : ''}" id="category-panel-${category}" aria-labelledby="category-heading-${category}">
    <header class="panel-heading"><h3 id="category-heading-${category}">${CATEGORIES[category]}</h3><span>${rows.length} 筆</span></header>
    <table class="ranking-table"><caption class="sr-only">${CATEGORIES[category]} Part Popularity</caption><thead><tr><th scope="col">名次</th><th scope="col">零件</th><th scope="col">Part Popularity</th></tr></thead><tbody>${sourceRows(rows, expanded).map(({raw, part, entry}) => {
      const bladeIdentity = category === 'blades' ? resolveBladeDisplayIdentity({...entry, canonical:entry?.canonical || part, catalog:raw, sourceName:raw.sourcePartName}) : null;
      const name = category === 'bits' ? store.resolveBitAbbreviation(raw, part) : category === 'blades' ? bladeIdentity.primary : part?.displayNameZh || part?.name_zh || part?.name || raw.sourcePartName;
      const secondary = category === 'bits' ? '' : category === 'blades' ? bladeIdentity.secondary : name !== raw.sourcePartName ? raw.sourcePartName : '';
      const content = `<span class="part-name">${e(name)}</span>${secondary ? `<small${bladeIdentity?.hasOfficialZh ? ' lang="en"' : ' class="unverified-name"'}>${e(secondary)}</small>` : ''}`;
      return `<tr${Number(raw.rank) <= 3 ? ' class="leading-row"' : ''}><td class="rank">${e(formatValue(raw.rank))}</td><td>${entry ? `<a href="${e(bladeHref(entry))}" data-blade-link>${content}</a>` : content}</td><td class="number">${e(formatValue(raw.popularity, true))}</td></tr>`;
    }).join('')}</tbody></table>
    ${!rows.length ? '<p class="empty-state">目前無可用競賽統計</p>' : ''}
    ${rows.length > 10 ? `<button class="expand-button" type="button" data-expand="${category}" aria-expanded="${expanded}">${expanded ? '收合至 Top 10' : `查看完整排行（${rows.length} 筆）`}</button>` : ''}
  </section>`;
}
export function searchMarkup(entries) {
  return entries.map(entry => `<li><a href="${e(bladeHref(entry))}" data-blade-link class="search-result"><span><strong>${e(entryName(entry))}</strong><small>${e(entryEnglish(entry))}</small></span><span class="search-state">${e(entryStatus(entry))}${entry.source?.statisticsStatus === 'ranked' ? ` · #${e(entryRank(entry))}` : ''}${entry.source?.usage != null ? `<small>Usage ${e(formatValue(entry.source.usage, true))}</small>` : ''}</span></a></li>`).join('');
}
export function sourceInfo(stats, source, page = null) {
  const isMeta = source === 'metaBeys';
  const data = stats[source];
  const first = isMeta ? data.categories.blades?.[0] : null;
  const scope = page?.sourceScope ?? data.scope;
  const scopeLabel = scope === 'all_time' ? '所有期間' : scope === 'all_time_world_all_rulesets_all_formats' ? '所有期間 · 所有規則與賽制' : scope || '來源未提供範圍';
  const region = page?.region || data.region || (scope === 'all_time_world_all_rulesets_all_formats' ? '全球' : '來源未提供地區');
  const updatedAt = page && 'sourceUpdatedAt' in page ? page.sourceUpdatedAt : data.sourceUpdatedAt ?? first?.sourceUpdatedAt;
  return `<div class="source-info"><span>資料範圍：${e(scopeLabel)}</span><span>地區：${e(region)}</span><span>網站更新：${e(formatDate(updatedAt))}</span><span>擷取日期：${e(formatDate(page?.capturedAt ?? stats.capturedAt, '未提供'))}</span><span>資料來源：${link(page?.url || data.sourceUrl, isMeta ? 'MetaBeys' : 'Beywatch')}</span></div>`;
}
export function detailTableMarkup(rows, kind, expanded = false, context = {}) {
  const isCombo = kind === 'combos';
  const title = isCombo ? '完整配置統計' : `${DETAIL_TABS[kind]}統計`;
  const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const columns = isCombo ? [['combo','完整配置'],['firstRate','1st Rate'],['topCuts','Top Cuts']] : [['part',DETAIL_TABS[kind]],['pick','Pick %'],['firstRate','1st Rate'],['topCuts','Top Cuts']];
  const display = (row, key) => key === 'combo' && context.entry ? context.store.formatCombo(context.entry, row.combo) : key === 'part' && kind === 'bits' && context.store ? context.store.resolveBitAbbreviation(row) : row[key];
  return `<header class="panel-heading"><h3 id="detail-heading-${kind}">${title}</h3><span>${safeRows.length} 筆 · 來源順序</span></header>${safeRows.length ? `<table class="detail-table"><caption class="sr-only">${title}，沿用來源順序</caption><thead><tr>${columns.map(([,label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${sourceRows(safeRows, expanded).map(row => `<tr>${columns.map(([key,label], i) => `<td${i ? ` class="number" data-label="${label}"` : ' class="row-name"'}>${e(formatValue(display(row,key), ['pick','firstRate'].includes(key)))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty-state">目前無可用競賽統計</p>'}${safeRows.length > 10 ? `<button class="expand-button" type="button" data-detail-expand="${kind}" aria-expanded="${expanded}">${expanded ? '收合至前 10 筆' : `顯示全部（${safeRows.length} 筆）`}</button>` : ''}`;
}
export function detailMarkup(store, entry) {
  if (!entry) return '<a href="competition-stats.html#/" class="back-link">← 返回排行榜</a><h1 tabindex="-1">找不到這個上蓋</h1><p class="empty-state">請返回排行榜搜尋上蓋。</p>';
  const source = entry.source;
  return `<a href="competition-stats.html#/" class="back-link" data-back>← 返回排行榜</a>
    <header class="detail-heading"><p class="eyebrow">BEYWATCH / BLADE STATISTICS</p><h1 tabindex="-1">${e(entryName(entry))}</h1><p class="english-name" lang="en">${e(entryEnglish(entry))}</p><p class="status-pill">${source?.statisticsStatus === 'ranked' ? `#${e(entryRank(entry))} · 有排名` : e(entryStatus(entry))}</p></header>
    <dl class="summary-metrics">${[['usage','Usage'],['firstRate','1st Rate'],['topCuts','Top Cuts']].map(([key,label]) => `<div><dt>${label}</dt><dd>${e(formatValue(source?.[key],key !== 'topCuts'))}</dd></div>`).join('')}</dl>
    <div class="desktop-source">${sourceInfo(store.statistics, 'beywatch', source)}</div>
    ${tabsMarkup(DETAIL_TABS, 'combos', 'detail')}
    <div class="detail-grid">${Object.keys(DETAIL_TABS).map(kind => `<section class="detail-panel ${kind === 'combos' ? 'mobile-active wide-panel' : ''}" id="detail-panel-${kind}" aria-labelledby="detail-heading-${kind}">${detailTableMarkup(source?.[kind], kind, false, {store,entry})}</section>`).join('')}</div>
    <footer><div class="mobile-source">${sourceInfo(store.statistics, 'beywatch', source)}</div><p class="stat-warning">${WARNING}</p></footer>`;
}
