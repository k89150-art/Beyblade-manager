// A read-only view of the shared database; no scores, generated configurations,
// source blending, or writes to personal storage.
export const DATABASE_URL = 'beyblade_x_database_v1_zhTW.json';
export const CATEGORIES = Object.freeze({blades: '上蓋', ratchets: '固鎖', bits: '軸心', assistBlades: '輔助戰刃'});
export const STATUS = Object.freeze({ranked: '有排名', unranked_or_insufficient_sample: '未排名／樣本不足', no_available_competition_statistics: '目前無可用競賽統計'});
export const normalizeName = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s_\-‐‑–—・·]+/gu, '');
const array = value => Array.isArray(value) ? value : [];
const keysFor = p => [p?.canonicalId, p?.id, p?.recordId, p?.updateId, p?.model, p?.name, p?.name_en, p?.name_zh, p?.name_ja, p?.displayNameZh, p?.referenceNameEn, p?.referenceNameJa, ...array(p?.aliases), ...array(p?.inventoryIdentityKeys)].filter(x => typeof x === 'string' && x.trim());
const identityId = p => p.canonicalId || p.id;
const add = (map, key, value) => {
  key = normalizeName(key);
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
};
const unique = values => values?.size === 1 ? [...values][0] : null;
export const CONFIRMED_CATALOG_STATUSES = Object.freeze(new Set(['exact', 'alias_exact', 'model_verified_alias', 'user_confirmed', 'user_confirmed_alias']));
const catalogRecord = entry => entry?.catalog || entry?.source || null;
const catalogStatus = entry => catalogRecord(entry)?.catalogMatchStatus || null;
const confirmedCatalogRecord = record => Boolean(record && CONFIRMED_CATALOG_STATUSES.has(record.catalogMatchStatus));
const catalogKeys = record => confirmedCatalogRecord(record)
  ? [record.canonicalId, record.displayNameZh, record.catalogEnglishName, ...array(record.catalogModels), ...array(record.catalogRecordIds)].filter(Boolean)
  : [];
const hasVerifiedTraditionalChinese = value => /\p{Script=Han}/u.test(String(value || '')) && !/待確認|待對應|未確認/.test(String(value));
const verifiedChineseName = part => {
  for (const value of [part?.displayNameZh, part?.name_zh, part?.name, part?.id]) {
    if (hasVerifiedTraditionalChinese(value)) return String(value).trim();
  }
  return null;
};
const englishBladeName = (entry, part = entry?.canonical) => entry?.catalog?.sourcePartName || entry?.catalog?.name || entry?.source?.name || entry?.sourceName || part?.referenceNameEn || part?.name_en || part?.model || '';
export function resolveBladeDisplayIdentity(entry) {
  const catalog = catalogRecord(entry);
  const status = catalogStatus(entry);
  const catalogZh = confirmedCatalogRecord(catalog) && hasVerifiedTraditionalChinese(catalog.displayNameZh) ? String(catalog.displayNameZh).trim() : null;
  // Once the statistics snapshot declares a record unresolved or ambiguous,
  // a similarly named canonical part must not silently override that decision.
  const officialZh = catalogZh || (status ? (CONFIRMED_CATALOG_STATUSES.has(status) ? verifiedChineseName(entry?.canonical) : null) : verifiedChineseName(entry?.canonical));
  const english = englishBladeName(entry);
  return Object.freeze({
    primary: officialZh || english || entry?.canonical?.referenceNameJa || entry?.canonical?.name_ja || entry?.canonical?.id || '未命名來源',
    secondary: officialZh ? english : '官方中文名待確認',
    officialZh,
    english,
    hasOfficialZh: Boolean(officialZh)
  });
}
export const resolveOfficialBladeDisplayName = entry => resolveBladeDisplayIdentity(entry).primary;
export function safeUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
export function sourceSlug(source) {
  try { return decodeURIComponent(new URL(source.url).pathname.split('/').filter(Boolean).at(-1)); }
  catch { return source.slug || `source-${encodeURIComponent(source.name || source.sourcePartName || '')}`; }
}
const identitySlug = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '');
export function formatValue(value, percentage = false) {
  if (value === null || value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))) return '—';
  const text = String(value);
  return percentage && !text.includes('%') ? `${text}%` : text;
}
export function formatDate(value, missing = '來源未公開更新日期') {
  if (!value) return missing;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? missing : date.toLocaleDateString('zh-TW', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'});
}
export function sourceNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/[,％%]/g, '').trim());
  return Number.isFinite(number) ? number : null;
}
export function sourceRows(rows, expanded = false) { return expanded ? array(rows) : array(rows).slice(0, 10); }

export function createStatisticsStore(database) {
  const statistics = database?.competitionStatistics;
  if (!statistics?.metaBeys?.categories || !Array.isArray(statistics?.beywatch?.blades)) throw new Error('資料庫尚未提供競賽統計');
  const identities = new Map(), canonical = [], strongIds = new Map();
  // Only explicit ID bridges may merge identities, never a shared alias.
  for (const part of [...array(database.blades), ...array(database.__v18?.bladesTop30)]) {
    if (!part || !identityId(part)) continue;
    const ids = [part.canonicalId,part.id,part.recordId].filter(Boolean).map(normalizeName);
    const groups = [...new Set(ids.map(id=>strongIds.get(id)).filter(Boolean))];
    const record = groups[0] || {part,keys:new Set()};
    if (!groups.length) canonical.push(record);
    for (const other of groups.slice(1)) {
      for (const key of other.keys) record.keys.add(key);
      for (const [key,value] of strongIds) if(value === other) strongIds.set(key,record);
      canonical.splice(canonical.indexOf(other),1);
    }
    for (const key of keysFor(part)) record.keys.add(key);
    for (const id of ids) strongIds.set(id,record);
  }
  for (const record of canonical) for (const key of record.keys) add(identities,key,record);
  for (const alias of array(database.aliases).filter(a => ['blade', 'expandBladeProduct'].includes(a.type))) {
    const record = unique(identities.get(normalizeName(alias.canonicalId || alias.canonicalZh)));
    if (!record) continue;
    for (const key of [alias.referenceEn, alias.referenceJa, ...array(alias.aliases)].filter(Boolean)) { record.keys.add(key); add(identities, key, record); }
  }
  const partMaps = {};
  for (const [category, parts] of Object.entries({blades: canonical.map(x => x.part), ratchets: [...array(database.ratchets), ...array(database.__v18?.ratchets)], bits: [...array(database.bits), ...array(database.__v18?.bits)], assistBlades: [...array(database.cx?.assistBlades), ...array(database.__v18?.cxAssistBlades)]})) {
    const map = new Map();
    for (const part of parts) for (const key of keysFor(part)) {
      // Two compatibility records with the same identity are not two parts.
      const prior = map.get(normalizeName(key));
      if (!map.has(normalizeName(key))) map.set(normalizeName(key), part);
      else if (prior && identityId(prior) !== identityId(part)) map.set(normalizeName(key), null);
    }
    partMaps[category] = map;
  }
  const bitRecords = new Set([...array(database.bits), ...array(database.__v18?.bits)]);
  const bitIdentities = new Map();
  const bitCodes = new Set();
  for (const part of bitRecords) {
    const code = [part?.code, part?.id, part?.canonicalId].find(value => /^[A-Z][A-Za-z0-9]{0,3}$/.test(String(value || '')));
    if (!code) continue;
    bitCodes.add(code);
    for (const key of keysFor(part)) add(bitIdentities, key, {part, code});
  }
  for (const alias of array(database.aliases).filter(item => item.type === 'bit')) {
    const record = unique(bitIdentities.get(normalizeName(alias.canonicalCode || alias.canonicalId)));
    if (!record) continue;
    for (const key of [alias.referenceEn, ...array(alias.aliases), ...array(alias.deprecatedAliases)].filter(Boolean)) add(bitIdentities, key, record);
  }
  const unresolvedBits = new Set();
  function resolveBitAbbreviation(record, matchedPart = null) {
    const sourceName = record?.part || record?.sourcePartName || record?.name || '';
    const directKeys = [record?.canonicalId, matchedPart?.canonicalId, matchedPart?.id, matchedPart?.code];
    if (record?.identityMatchStatus === 'exact' || matchedPart) directKeys.push(sourceName);
    for (const key of directKeys.filter(Boolean)) {
      const resolved = unique(bitIdentities.get(normalizeName(key)));
      if (resolved && bitCodes.has(resolved.code)) return resolved.code;
      if (bitCodes.has(String(key))) return String(key);
    }
    const bracket = /[（(]\s*([A-Z][A-Za-z0-9]{0,3})\s*[)）]\s*$/u.exec(String(sourceName));
    if (bracket && bitCodes.has(bracket[1])) return bracket[1];
    const aliasResolved = unique(bitIdentities.get(normalizeName(sourceName)));
    if (aliasResolved && bitCodes.has(aliasResolved.code)) return aliasResolved.code;
    const fallback = String(sourceName || '—').replace(/\u00a0/g, ' ').trim() || '—';
    if (fallback !== '—' && !unresolvedBits.has(fallback)) {
      unresolvedBits.add(fallback);
      console.warn('unresolved bit abbreviation', fallback);
    }
    return fallback;
  }
  const entries = [], bySlug = new Map(), byCanonicalId = new Map(), byName = new Map(), bySourceName = new Map(), linked = new Set();
  function addEntry(entry, keys) {
    entry.searchKeys = [...new Set(keys.filter(Boolean).map(normalizeName))];
    entries.push(entry);
    bySlug.set(entry.slug, entry);
    for (const key of keys) add(byName, key, entry);
    if (entry.canonical) for (const key of keysFor(entry.canonical)) add(byCanonicalId, key, entry);
  }
  for (const source of statistics.beywatch.blades) {
    if (!source || !source.name) continue;
    const catalogBlocked = source.catalogMatchStatus && !CONFIRMED_CATALOG_STATUSES.has(source.catalogMatchStatus);
    const match = source.identityMatchStatus === 'ambiguous' || catalogBlocked ? null
      : unique(identities.get(normalizeName(source.canonicalId))) || unique(identities.get(normalizeName(source.name)));
    if (match) linked.add(match);
    const entry = {slug: sourceSlug(source), source, canonical: match?.part || null};
    addEntry(entry, [source.name, sourceSlug(source), ...catalogKeys(source), ...(match ? [...match.keys] : [])]);
    add(bySourceName,source.name,entry);
    add(bySourceName,sourceSlug(source),entry);
    if(match)for(const key of match.keys)add(byCanonicalId,key,entry);
  }
  for (const record of canonical) if (!linked.has(record)) {
    const preferredSlug = identitySlug(record.part.referenceNameEn || record.part.name_en || record.part.model);
    const slug = preferredSlug && !bySlug.has(preferredSlug) ? preferredSlug : `canonical-${encodeURIComponent(identityId(record.part))}`;
    addEntry({slug, canonical: record.part, source: null}, [...record.keys]);
  }
  // MetaBeys-only identities remain navigable; never infer a canonical match.
  const categories = {};
  for (const category of Object.keys(CATEGORIES)) {
    categories[category] = array(statistics.metaBeys.categories[category]).filter(Boolean).map(row => {
      const catalogBlocked = row.catalogMatchStatus && !CONFIRMED_CATALOG_STATUSES.has(row.catalogMatchStatus);
      const matched = row.identityMatchStatus === 'ambiguous' || catalogBlocked ? null : category === 'blades'
        ? (unique(identities.get(normalizeName(row.canonicalId))) || unique(identities.get(normalizeName(row.sourcePartName))))?.part
        : partMaps[category].get(normalizeName(row.canonicalId)) || partMaps[category].get(normalizeName(row.sourcePartName));
      let entry = null;
      if (category === 'blades') {
        // The source-to-source link is independent of canonical name ambiguity.
        entry = unique(bySourceName.get(normalizeName(row.sourcePartName)));
        if (!entry) entry = unique(byName.get(normalizeName(row.sourcePartName)));
        if (!entry && row.identityMatchStatus === 'exact') entry = unique(byCanonicalId.get(normalizeName(row.canonicalId)));
        if (!entry) {
          const exactSlug = matched && row.identityMatchStatus === 'exact' ? identitySlug(matched.referenceNameEn || matched.name_en || row.sourcePartName) : '';
          entry = {slug: exactSlug || `metabeys-${encodeURIComponent(row.sourcePartName)}`, source: null, canonical: matched || null, sourceName: row.sourcePartName, catalog: row};
          addEntry(entry, [row.sourcePartName, ...catalogKeys(row), ...(matched ? keysFor(matched) : [])]);
        }
      }
      return {raw: row, part: matched || null, entry};
    });
  }
  return {
    statistics, entries, bySlug, byCanonicalId, unresolvedBits,
    category: key => categories[key] || [],
    blade: slug => bySlug.get(slug) || null,
    search: query => { const key = normalizeName(query); return key ? entries.filter(e => e.searchKeys.some(k => k.includes(key))) : entries; },
    resolveBitAbbreviation,
    formatCombo: (entry, combo) => formatCompetitionComboDisplayName(combo, entry, resolveBitAbbreviation, value => {
      let best = null;
      for (const record of canonical) for (const name of record.keys) {
        if ((!best || name.length > best.name.length) && value.startsWith(`${name} `)) best = {name,part:record.part};
      }
      return best;
    })
  };
}
export function entryName(entry) { return resolveBladeDisplayIdentity(entry).primary; }
export function entryEnglish(entry) { return resolveBladeDisplayIdentity(entry).secondary; }
export function formatCompetitionComboDisplayName(combo, entry, bitResolver, prefixResolver = null) {
  const original = String(combo ?? '');
  if (!original || !entry || typeof bitResolver !== 'function') return original;
  const candidates = [entry.source?.name, resolveBladeDisplayIdentity(entry).english, entry.canonical?.referenceNameEn, entry.canonical?.name_en, entry.canonical?.model, ...array(entry.canonical?.aliases)].filter(Boolean);
  let prefix = '';
  for (const candidate of candidates) {
    if (candidate.length <= prefix.length) continue;
    if (original.startsWith(candidate) && /^\s/.test(original.slice(candidate.length))) prefix = candidate;
  }
  let resolvedPart = null;
  if (!prefix && typeof prefixResolver === 'function') {
    const resolved = prefixResolver(original);
    prefix = resolved?.name || '';
    resolvedPart = resolved?.part || null;
  }
  if (!prefix) return original;
  const remainder = original.slice(prefix.length).trim();
  const match = /^(.*?\s+)?(\d+-\d+)\s*([A-Z][A-Za-z0-9]{0,3})$/u.exec(remainder);
  if (!match) return original;
  const bit = bitResolver({canonicalId: match[3], identityMatchStatus: 'exact', part: match[3]});
  if (bit !== match[3]) return original;
  const bladeName = resolvedPart ? resolveOfficialBladeDisplayName({canonical:resolvedPart,sourceName:prefix}) : resolveOfficialBladeDisplayName(entry);
  const middle = String(match[1] || '').trim();
  return `${bladeName}${middle ? ` ${middle}` : ''} ${match[2]} ${bit}`;
}
export function entryStatus(entry) { return STATUS[entry.source?.statisticsStatus] || STATUS.no_available_competition_statistics; }
export function entryRank(entry) { return entry.source?.statisticsStatus === 'ranked' ? formatValue(entry.source.rank) : '未排名'; }
export function bladeHref(entry) { return `competition-stats.html#/blades/${encodeURIComponent(entry.slug)}`; }
export function readRoute(hash) {
  const match = /^#\/blades\/(.+)$/.exec(hash);
  try { return match ? decodeURIComponent(match[1]) : null; } catch { return null; }
}
export function makeStatisticsLoader(fetcher = (...args) => fetch(...args)) {
  let pending;
  return () => pending ||= fetcher(DATABASE_URL, {cache: 'no-cache'}).then(response => {
    if (!response.ok) throw new Error(`資料載入失敗（${response.status}）`);
    return response.json();
  }).then(createStatisticsStore).catch(error => { pending = null; throw error; });
}
export const loadStatistics = makeStatisticsLoader();
