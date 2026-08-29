import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { retireAnalysisCaches, RETIREMENT_MARKER, RETIRED_ASSET_NAMES } from '../retire-analysis-cache.js';

const baseline = 'a1f4159'; // Includes the user's newer tournament-standing work.
const read = file => fs.readFileSync(file, 'utf8');
const previous = file => execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8', maxBuffer: 5e6 });
const db = JSON.parse(read('beyblade_x_database_v1_zhTW.json'));
const oldDb = JSON.parse(previous('beyblade_x_database_v1_zhTW.json'));
const normalizeLines = text => text.replace(/\r\n/g, '\n');
const obsolete = RETIRED_ASSET_NAMES.filter(x => !x.includes('database'));
const forbidden = /^(?:tier|metaTier|independentTier|comboTier|tierScore|score|scores|comboScore|synergy|synergyScore|attack|stamina|defense|balance|role|roleTags|roles|primaryRoles|rank|displayOrder|confidence|metaConfidence|monthlyTier|monthlyWeightedRank|monthlyWeightedScore|recentWeightedRank|recentTwoWeekRank|bestWith|analysisRules|displayRules|priorityRules|independentEvaluation|independentEvaluationCoverage|routes|stockBonus|stock_bonus|stockRelationshipBonus|contextualPriority|roleConsistency|comboDeduplication|userOptInRequired|allowedRecommendationModes|autoFallbackEligible|autoRecommendationEligible|one_hit_specialist|low_height_attack_specialist)$/i;
function walk(x, fn, path = '') {
  if (Array.isArray(x)) x.forEach((v, i) => walk(v, fn, `${path}[${i}]`));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) {
    fn(k, v, `${path}.${k}`);
    walk(v, fn, `${path}.${k}`);
  }
}
test('舊引擎、推薦器、頁面與再生腳本實體不存在', () => {
  for (const file of [...obsolete, 'scripts/sync-analysis-compatibility-v7.mjs',
    'scripts/validate-analysis-database-v7.mjs', 'scripts/strip-retired-data.mjs',
    'tests/inventory-recommendation-v7.test.mjs', 'tests/inventory-recommendation-v10.test.mjs']) {
    assert.equal(fs.existsSync(file), false, file);
  }
});
test('前端沒有舊入口、候選器、推薦卡或空白導覽欄', () => {
  for (const file of fs.readdirSync('.').filter(x => /\.(html|js|css)$/.test(x) && x !== 'retire-analysis-cache.js')) {
    assert.doesNotMatch(read(file), /analysis\.html|analyzeConfigRow|makeConfigSuggestions|inventoryCandidateGate|selectTopInventorySuggestions|suggestFromStock|suggestion-card|配置分析|從我的庫存推薦/);
  }
  assert.match(read('site-menu.css'), /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(read('site-menu.js'), /competition-stats\.html/);
});
test('canonical、__v18、獨立相容檔及既有 exports 都沒有分析欄位', () => {
  const files = ['beyblade_x_database_v1_zhTW.json', 'beyblade_x_codex_database_v1_8_ASCII_SAFE.json',
    ...(fs.existsSync('exports') ? fs.readdirSync('exports').filter(x => x.endsWith('.json')).map(x => 'exports/' + x) : [])];
  for (const file of files) walk(JSON.parse(read(file)), (key, value, path) => {
    // Only source-provided rank in the new objective snapshot is valid.
    if (key === 'rank' && /^\.competitionStatistics\.(metaBeys\.categories\.(blades|ratchets|bits|assistBlades)|beywatch\.blades)\[\d+\]\.rank$/.test(path)) return;
    assert.equal(forbidden.test(key) || /recommend|synergy|fallback|contextual|speciali[sz]ed|hardExcludedGeneric|genericRecommendation/i.test(key), false, file + path);
  });
});

const identityKeys = `canonicalId recordId id model code displayCode displayName displayNameZh referenceNameEn
name name_en name_zh name_ja aliases legacyIds inventoryIdentityKeys deprecatedReferenceNames series productCode stockCombo
releaseDate releaseExamples weight_g height diameter_mm gearCount systemType ratchetMode ratchetSelectable
bitCode bitSelectable requiresOrientation mainBlade defaultAssist partType namespaceKey visible enabled searchable inventoryEligible`.split(/\s+/);
const project = part => Object.fromEntries(identityKeys.filter(k => k in part).map(k => [k, part[k]]));
const collections = data => [data.blades, data.ratchets, data.bits, data.parts, ...Object.values(data.cx || {}),
  data.__v18?.bladesTop30, data.__v18?.ratchets, data.__v18?.bits, data.__v18?.cxAssistBlades,
  data.__v18?.cxThreePiece, ...Object.values(data.__v18?.cxFourPiece || {})].filter(Array.isArray);
test('所有零件身分、名稱、別名、官方原裝與 CX 結構逐筆完整保留', () => {
  const currentCollections = collections(db), originalCollections = collections(oldDb);
  originalCollections.forEach((parts, i) => assert.deepEqual(currentCollections[i].slice(0,parts.length).map(project),parts.map(project)));
  assert.deepEqual(db.aliases.slice(0,oldDb.aliases.length), oldDb.aliases);
  for (const key of ['normalCombo', 'cx3Combo', 'cx4Combo']) assert.deepEqual(db.__v18.schema[key], oldDb.__v18.schema[key]);
  const oldStandalone = JSON.parse(previous('beyblade_x_codex_database_v1_8_ASCII_SAFE.json'));
  const standalone = JSON.parse(read('beyblade_x_codex_database_v1_8_ASCII_SAFE.json'));
  for (const key of ['bladesTop30','ratchets','bits','cxAssistBlades','cxThreePiece']) {
    assert.deepEqual(standalone[key].map(project), oldStandalone[key].map(project));
  }
});
test('231 筆官方產品、套組及查詢索引不變，只補完整型錄英文名稱', () => {
  const file = 'stock_products_AUTOFILL_SAFE_2026-07-29-v3.json';
  const stock = JSON.parse(read(file));
  const oldStock = JSON.parse(previous(file));
  const withoutCatalogNames = data => {
    const copy = structuredClone(data);
    if (copy.metadata) delete copy.metadata.nameCatalogUpdate;
    for (const product of copy.stockProducts) {
      delete product.displayNameEn;
      delete product.referenceNameEn;
    }
    return copy;
  };
  assert.deepEqual(withoutCatalogNames(stock), withoutCatalogNames(oldStock));
  assert.equal(stock.stockProducts.length, 231);
  const ids = new Set(stock.stockProducts.map(x => x.recordId));
  for (const entries of Object.values(stock.lookupIndexes)) for (const values of Object.values(entries)) {
    for (const id of values) assert.ok(ids.has(id), id);
  }
});
test('使用者資料契約、雲端同步與賽事流程保持相容', () => {
  const managerScript = normalizeLines(read('script.js'));
  assert.match(managerScript, /doc\(db, "users", uid, "appData", "main"\)/);
  assert.match(managerScript, /beybladeTable: getTableData\("beybladeTable", true\)/);
  assert.match(managerScript, /partTable: getTableData\("partTable", false\)/);
  assert.match(managerScript, /configTable: getTableData\("configTable", true\)/);
  assert.match(managerScript, /historyTable: getHistoryData\(\)/);
  assert.match(managerScript, /ownerUid: currentUser \? currentUser\.uid : ""/);
  assert.match(managerScript, /ownerEmail: currentUser \? currentUser\.email \|\| "" : ""/);
  assert.match(managerScript, /for \(let index = 0; index < 10; index \+= 1\) row\.insertCell\(index\)/);
  for (const file of ['tournament.js', 'admin.js', 'firestore.rules', 'firebase.json']) {
    assert.equal(normalizeLines(read(file)), normalizeLines(previous(file)), file);
  }
  assert.equal(
    normalizeLines(read('user-view.js')),
    normalizeLines(previous('user-view.js')).replace('?v=20260729-stock3', '?v=20260829-namecatalog2'),
    'user-view.js'
  );
});
test('客觀案例、前段次數、Beywatch 比例及 MetaBeys 使用占比保留', () => {
  for (let i = 0; i < oldDb.featuredBladeProfiles.length; i++) {
    const a = oldDb.featuredBladeProfiles[i].evidenceSummary, b = db.featuredBladeProfiles[i].evidenceSummary;
    for (const key of ['reportedTopCutAppearances','officialEventCase','recentWboCases','verifiedPlacementCases']) {
      assert.deepEqual(b[key], a[key], key);
    }
  }
  const a = oldDb.featuredCxPartProfiles[0], b = db.featuredCxPartProfiles[0];
  assert.deepEqual(b.evidenceSummary.partAggregate, a.evidenceSummary.partAggregate);
  assert.equal(b.evidenceSummary.independentAggregatorCrosscheck.providerUsageShare, 0.375);
  assert.equal(b.evidenceSummary.independentAggregatorCrosscheck.url, a.evidenceSummary.independentAggregatorCrosscheck.url);
  assert.equal(b.commonConfigurations.length, 9); // Eight measured examples plus one official stock combo; no inferred combos.
  const metrics = /^(reported.*|firstPlace.*|providerUsage.*|providerWinShare|usageRate|.*[Pp]lacements|.*[Pp]laceCases|count|wins|losses|eventsRepresented|configurationAppearances|configurationVariety|mostFrequentConfigurationAppearances|distinctEvents|distinctPlayers)$/;
  const leaves = data => {
    const values = [];
    walk(data, (key, value) => {
      if (metrics.test(key) && value !== null && typeof value !== 'object') values.push(`${key}:${value}`);
    });
    return values.sort();
  };
  const {competitionStatistics, competitionStatisticsImport, ...preserved} = db;
  assert.deepEqual(leaves(preserved), leaves(oldDb));
});
test('所有來源網址、快照日期與跨引用仍有效', () => {
  const urls = data => { const values = new Set(); walk(data, (k,v) => { if (k === 'url') values.add(v); }); return [...values].sort(); };
  const {competitionStatistics, competitionStatisticsImport, ...preserved} = db;
  assert.deepEqual(urls(preserved), urls(oldDb));
  assert.deepEqual(db.metaSnapshots.map(x=>[x.id,x.updated,x.sourceWindow,x.sample]), oldDb.metaSnapshots.map(x=>[x.id,x.updated,x.sourceWindow,x.sample]));
  const snapshots = new Set(db.metaSnapshots.map(x => x.id));
  walk(db, (key, value) => { if (key === 'sourceSnapshotId') assert.ok(snapshots.has(value), value); });
  for (const p of db.featuredBladeProfiles) assert.ok(db.blades.some(x=>x.id===p.bladeId));
  assert.ok(db.cx.assistBlades.some(x=>x.id===db.featuredCxPartProfiles[0].code));
});
test('Git 內所有既有排程完全未修改', () => {
  for (const name of fs.readdirSync('.github/workflows')) {
    const file = '.github/workflows/' + name;
    assert.equal(normalizeLines(read(file)), normalizeLines(previous(file)));
  }
});

function fakeEnvironment(fail = false) {
  const data = new Map([['inventory', '{"LR":2}'], ['products','official'], ['beybladeDesktopNavCollapsed','1'], ['history','keep']]);
  const requests = [
    'https://example.test/Beyblade-manager/analysis.html?old=1',
    'https://example.test/Beyblade-manager/beyblade_x_database_v1_zhTW.json?v=old',
    'https://example.test/Beyblade-manager/stock_products_AUTOFILL_SAFE_2026-07-29-v3.json',
    'https://example.test/another-project/analysis.html',
    'https://other.test/Beyblade-manager/analysis.html',
    'https://example.test/Beyblade-manager/index.html'
  ].map(url=>({url}));
  let opens = 0;
  return { data, requests, get opens(){return opens;},
    storage: {getItem:k=>data.get(k), setItem:(k,v)=>data.set(k,v)},
    baseUrl:'https://example.test/Beyblade-manager/index.html',
    cacheStorage: {keys:async()=>['shared-cache'],open:async()=>{ opens++; return {
      keys:async()=>[...requests], delete:async r=>{ if(fail)throw Error('temporaryquota'); requests.splice(requests.indexOf(r),1); return true; }
    };}}
  };
}
test('一次性快取 migration 只刪同站舊資源，保留產品、庫存及其他站', async () => {
  const env = fakeEnvironment();
  assert.deepEqual(await retireAnalysisCaches(env), {skipped:false,deleted:2});
  assert.equal(env.requests.length,4);
  assert.equal(env.data.get('inventory'), '{"LR":2}');
  assert.equal(env.data.get('products'),'official');
  assert.equal(env.data.get('history'),'keep');
  assert.equal(env.data.get('beybladeDesktopNavCollapsed'),'1');
  assert.deepEqual(await retireAnalysisCaches(env), {skipped:true,deleted:0});
  assert.equal(env.opens,1);
});
test('migration 失敗不標完成，可安全重試；不使用整庫刪除', async () => {
  const env = fakeEnvironment(true);
  await assert.rejects(retireAnalysisCaches(env));
  assert.equal([...env.data.keys()].some(x=>x.startsWith(RETIREMENT_MARKER)),false);
  assert.doesNotMatch(read('retire-analysis-cache.js'), /\.clear\(|deleteDatabase|indexedDB|removeItem\(/);
});
test('無 Cache Storage 的瀏覽器可正常啟動', async () => {
  assert.deepEqual(await retireAnalysisCaches({baseUrl:'https://example.test/index.html'}),{skipped:false,deleted:0});
});
