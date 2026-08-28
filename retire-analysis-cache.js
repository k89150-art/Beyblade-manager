// No legacy localStorage/IndexedDB result keys existed in the audited application.
// Only exact same-project analysis asset requests may be removed from Cache Storage.
export const RETIREMENT_MARKER = 'beyblade:analysis-assets-retired:20260828';
export const RETIRED_ASSET_NAMES = Object.freeze([
  'analysis.html', 'analysis.js', 'analysis_inventory_nullsafe_v2.js',
  'beyblade_x_analysis_engine_v1_zhTW.js',
  'beyblade_x_analysis_helper_v1_8_ASCII_SAFE.js',
  'beyblade_x_analysis_rules_v1_zhTW.json',
  'beyblade_x_inventory_recommendation_v1.js',
  'beyblade_x_inventory_recommendation_nullsafe_v2.js',
  'beyblade_x_database_v1_zhTW.json',
  'beyblade_x_codex_database_v1_8_ASCII_SAFE.json'
]);

export async function retireAnalysisCaches({ storage, cacheStorage, baseUrl }) {
  const root = new URL('.', baseUrl);
  const marker = `${RETIREMENT_MARKER}:${root.pathname}`;
  if (storage?.getItem(marker) === 'done') return { skipped: true, deleted: 0 };
  const paths = new Set(RETIRED_ASSET_NAMES.map(name => new URL(name, root).pathname));
  let deleted = 0;
  if (cacheStorage) {
    for (const name of await cacheStorage.keys()) {
      const cache = await cacheStorage.open(name);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        if (url.origin === root.origin && paths.has(url.pathname)) {
          if (await cache.delete(request)) deleted += 1;
        }
      }
    }
  }
  // A failed deletion never marks this migration complete, so a retry is safe.
  storage?.setItem(marker, 'done');
  return { skipped: false, deleted };
}
