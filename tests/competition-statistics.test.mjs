import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createStatisticsStore, CATEGORIES, STATUS, normalizeName, formatValue, formatDate, sourceNumber, sourceRows, resolveBladeDisplayIdentity, resolveOfficialBladeDisplayName, formatCompetitionComboDisplayName, entryName, entryEnglish, entryStatus, entryRank, bladeHref, readRoute, makeStatisticsLoader, safeUrl} from '../competition-stats-data.js';
import {categoryMarkup, detailMarkup, detailTableMarkup, searchMarkup, tabsMarkup, sourceInfo, WARNING} from '../competition-stats-view.js';
const read = file => fs.readFileSync(file,'utf8');
const db = JSON.parse(read('beyblade_x_database_v1_zhTW.json'));
const stats = db.competitionStatistics;
const store = createStatisticsStore(db);
const wizard = store.blade('wizard-rod');
const baseline = JSON.parse(execFileSync('git',['show','7767eb3:beyblade_x_database_v1_zhTW.json'],{encoding:'utf8',maxBuffer:5e6}));
const DISPLAY_IDENTITY_FIELDS = new Set(['canonicalId','identityMatchStatus','displayNameZh','catalogEnglishName','catalogModels','catalogRecordIds','catalogMatchStatus']);
const withoutIdentityMetadata = value => Array.isArray(value) ? value.map(withoutIdentityMetadata) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => !DISPLAY_IDENTITY_FIELDS.has(key)).map(([key,item]) => [key,withoutIdentityMetadata(item)])) : value;
const objectiveStatisticsHash = value => crypto.createHash('sha256').update(JSON.stringify({metaBeys:withoutIdentityMetadata(value.metaBeys),beywatch:withoutIdentityMetadata(value.beywatch)})).digest('hex');
const OBJECTIVE_STATISTICS_HASH = '22139a94cc3c8e8ad6fc3672c5e41b1b97aabeecb1752801a80decf1607e05d4';

test('快照與匯入附件指紋一致；四類完整 120/33/51/16 筆，來源名次與百分比不變', () => {
  assert.equal(objectiveStatisticsHash(stats),OBJECTIVE_STATISTICS_HASH);
  assert.deepEqual(Object.keys(CATEGORIES), ['blades','ratchets','bits','assistBlades']);
  for (const [key,count] of Object.entries({blades:120,ratchets:33,bits:51,assistBlades:16})) {
    assert.equal(store.category(key).length,count);
    assert.deepEqual(store.category(key).map(x=>x.raw),stats.metaBeys.categories[key]);
  }
});
test('獨立競賽統計基準是網站快照的唯一完整來源', () => {
  const standalone = JSON.parse(read('competition-statistics/beyblade_x_competition_statistics_2026-08-29.json'));
  assert.equal(standalone.metadata.contentScope,'objective-competition-statistics-only');
  assert.deepEqual(stats,standalone.competitionStatistics);
  assert.equal(db.competitionStatisticsImport.sourceFileName,'beyblade_x_competition_statistics_2026-08-29.json');
  assert.equal(db.competitionStatisticsImport.baselineFile,'competition-statistics/beyblade_x_competition_statistics_2026-08-29.json');
  assert.equal(db.competitionStatisticsImport.sha256,crypto.createHash('sha256').update(JSON.stringify(stats)).digest('hex'));
});
test('每週匯入器使用日期化專用基準、先完整驗證，且相同內容不建立新日期檔', () => {
  const importer=read('scripts/import-competition-statistics.mjs');
  assert.match(importer,/beyblade_x_competition_statistics_\\d\{4\}-\\d\{2\}-\\d\{2\}/);
  assert.match(importer,/priorSha256 === snapshotSha256/);
  assert.match(importer,/changed: false, retainedBaseline/);
  assert.ok(importer.indexOf('assert.equal(pages.length, 132') < importer.indexOf('fs.writeFileSync(target'));
  assert.ok(importer.indexOf('assert.deepEqual(preservedAfter, preservedBefore') < importer.indexOf('fs.writeFileSync(target'));
  assert.doesNotMatch(importer,/incoming\.blades|incoming\.aliases|recommended|tier|synergy/i);
});
test('Beywatch 全部 132 頁、39 排名、75 未排名、18 無資料與 945/486/508 明細完整', () => {
  assert.equal(stats.beywatch.blades.length,132);
  for(const [key,n] of Object.entries({ranked:39,unranked_or_insufficient_sample:75,no_available_competition_statistics:18})) assert.equal(stats.beywatch.blades.filter(x=>x.statisticsStatus===key).length,n);
  for(const [key,n] of Object.entries({combos:945,ratchets:486,bits:508})) assert.equal(stats.beywatch.blades.reduce((sum,x)=>sum+x[key].length,0),n);
  for(const source of stats.beywatch.blades) assert.equal(store.entries.filter(x=>x.source===source).length,1);
});
test('只新增競賽快照及三個明確 canonical 身分；既有主資料、名稱及原裝完整保留', () => {
  const {competitionStatistics,competitionStatisticsImport,...preserved} = structuredClone(db);
  const newBlades = preserved.blades.splice(-3), newAliases = preserved.aliases.splice(-3);
  preserved.__v18.bladesTop30 = preserved.__v18.bladesTop30.filter(item => !['HOVER_WYVERN','PEGASUS_BLAST'].includes(item.canonicalId));
  assert.deepEqual(newBlades.map(item=>item.canonicalId),['HOVER_WYVERN','PEGASUS_BLAST','GLORY_VALKYRIE']);
  assert.deepEqual(newAliases.map(item=>item.canonicalId),['GLORY_VALKYRIE','HOVER_WYVERN','PEGASUS_BLAST']);
  assert.deepEqual(preserved,baseline);
  assert.equal(newBlades[0].displayNameZh,'飛龍凌空');
  assert.equal(newBlades[1].displayNameZh,'天馬爆擊');
});
test('各分類初始 10 筆、展開後全部；Wheel 只屬於輔助戰刃', () => {
  for(const key of Object.keys(CATEGORIES)) {
    assert.equal((categoryMarkup(store,key).match(/<tr/g)||[]).length,11);
    assert.equal((categoryMarkup(store,key,true).match(/<tr/g)||[]).length,store.category(key).length+1);
  }
  assert.ok(store.category('assistBlades').some(x=>x.raw.sourcePartName==='Wheel'));
  assert.ok(!store.category('blades').some(x=>x.raw.sourcePartName==='Wheel'));
  assert.doesNotMatch(tabsMarkup(CATEGORIES,'blades','category'),/鎖芯|主戰刃|上戰刃/);
});
test('魔導神杖：點排行榜與名稱搜尋解析為同一來源頁，不依陣列位置', () => {
  const row = store.category('blades').find(x=>x.raw.sourcePartName==='Wizard Rod');
  assert.equal(row.entry,wizard);
  for(const query of ['魔導神杖','Wizard Rod','WIZARD_ROD']) assert.ok(store.search(query).includes(wizard),query);
  assert.equal(entryName(wizard),'魔導神杖');
  assert.equal(entryEnglish(wizard),'Wizard Rod');
  assert.equal(entryRank(wizard),'3');
  const reversed = createStatisticsStore({...db,competitionStatistics:{...stats,beywatch:{...stats.beywatch,blades:[...stats.beywatch.blades].reverse()}}});
  assert.deepEqual(reversed.blade('wizard-rod').source,wizard.source);
});
test('共用上蓋解析器讓排行榜、搜尋與詳細頁一致使用官方繁中＋英文副標', () => {
  const identity=resolveBladeDisplayIdentity(wizard);
  assert.deepEqual(identity,{primary:'魔導神杖',secondary:'Wizard Rod',officialZh:'魔導神杖',english:'Wizard Rod',hasOfficialZh:true});
  assert.equal(resolveOfficialBladeDisplayName(wizard),'魔導神杖');
  for(const html of [categoryMarkup(store,'blades'),searchMarkup([wizard]),detailMarkup(store,wizard)]){
    assert.match(html,/魔導神杖/);assert.match(html,/Wizard Rod/);
  }
  assert.match(categoryMarkup(store,'blades'),/魔導神杖<\/span><small lang="en">Wizard Rod/);
});
test('MetaBeys 與 Beywatch 精確 canonical／相容層名稱顯示官方繁中', () => {
  const silver=store.blade('silver-wolf');
  assert.equal(resolveOfficialBladeDisplayName(silver),'霜輝銀狼');
  assert.match(categoryMarkup(store,'blades'),/霜輝銀狼/);
  assert.match(detailMarkup(store,silver),/<h1 tabindex="-1">霜輝銀狼<\/h1><p class="english-name" lang="en">Silver Wolf/);
});
test('未確認中文的上蓋保留來源英文並明確標待確認，不用翻譯或假 canonical', () => {
  for(const slug of ['blast','bumblebee']){
    const entry=store.blade(slug);
    assert.ok(entry,slug);assert.equal(entry.canonical,null,slug);
    const identity=resolveBladeDisplayIdentity(entry);
    assert.equal(identity.primary,entry.source?.name||entry.sourceName);
    assert.equal(identity.secondary,'官方中文名待確認');
    assert.match(searchMarkup([entry]),/官方中文名待確認/);
  }
});
test('Hover Wyvern／飛龍凌空／slug／canonicalId 精確解析為同一身分與路由', () => {
  const hover=store.blade('hover-wyvern');
  assert.equal(hover.canonical.canonicalId,'HOVER_WYVERN');
  assert.deepEqual(resolveBladeDisplayIdentity(hover),{primary:'飛龍凌空',secondary:'Hover Wyvern',officialZh:'飛龍凌空',english:'Hover Wyvern',hasOfficialZh:true});
  for(const query of ['飛龍凌空','Hover Wyvern','hover wyvern','hover-wyvern','HOVER_WYVERN']) assert.ok(store.search(query).includes(hover),query);
  assert.equal(store.blade(readRoute('#/blades/hover-wyvern')),hover);
  assert.doesNotMatch(categoryMarkup(store,'blades'),/Hover Wyvern[\s\S]{0,80}官方中文名待確認/);
});
test('Pegasus Blast／天馬爆擊／slug／canonicalId 精確解析為同一身分與路由', () => {
  const pegasus=store.blade('pegasus-blast');
  assert.ok(pegasus);
  assert.equal(pegasus.canonical.canonicalId,'PEGASUS_BLAST');
  assert.deepEqual(resolveBladeDisplayIdentity(pegasus),{primary:'天馬爆擊',secondary:'Pegasus Blast',officialZh:'天馬爆擊',english:'Pegasus Blast',hasOfficialZh:true});
  for(const query of ['天馬爆擊','Pegasus Blast','pegasus blast','pegasus-blast','PEGASUS_BLAST']) assert.ok(store.search(query).includes(pegasus),query);
  assert.equal(store.blade(readRoute('#/blades/pegasus-blast')),pegasus);
  assert.doesNotMatch(categoryMarkup(store,'blades'),/Pegasus Blast[\s\S]{0,80}官方中文名待確認/);
});
test('Hover Wyvern 與 Pegasus Blast 不會合併相似但不同的既有上蓋', () => {
  const hover=store.blade('hover-wyvern'),pegasus=store.blade('pegasus-blast');
  const wyvernHover=store.blade('wyvern-hover');
  const aeroPegasus=store.blade('aero-pegasus');
  assert.ok(wyvernHover);assert.ok(aeroPegasus);
  assert.notEqual(hover.canonical,wyvernHover.canonical);
  assert.notEqual(pegasus.canonical,aeroPegasus.canonical);
  assert.equal(hover.canonical.referenceNameEn,'Hover Wyvern');
  assert.equal(wyvernHover.canonical.name_en,'Wyvern Hover');
});
test('兩個新 canonical 只改完整配置顯示，不改 Hover 與 Blast 頁來源原文', () => {
  const hover=store.blade('hover-wyvern'),blast=store.blade('blast');
  const hoverRaw=structuredClone(hover.source.combos),blastRaw=structuredClone(blast.source.combos);
  assert.equal(store.formatCombo(hover,'Hover Wyvern 9-60K'),'飛龍凌空 9-60 K');
  assert.equal(store.formatCombo(hover,'Hover Wyvern 1-60LR'),'飛龍凌空 1-60 LR');
  assert.equal(store.formatCombo(blast,'Pegasus Blast Heavy 9-60K'),'天馬爆擊 Heavy 9-60 K');
  assert.deepEqual(hover.source.combos,hoverRaw);
  assert.deepEqual(blast.source.combos,blastRaw);
});
test('MetaBeys 與 Beywatch 保留來源身分，型錄確認狀態負責中文顯示且客觀統計雜湊不變', () => {
  const hoverMeta=stats.metaBeys.categories.blades.find(x=>x.sourcePartName==='Hover Wyvern');
  const pegasusMeta=stats.metaBeys.categories.blades.find(x=>x.sourcePartName==='Pegasus Blast');
  const hoverWatch=stats.beywatch.blades.find(x=>x.name==='Hover Wyvern');
  assert.deepEqual([hoverMeta.canonicalId,hoverMeta.identityMatchStatus,hoverMeta.catalogMatchStatus,hoverMeta.displayNameZh],[null,'unmatched','user_confirmed','飛龍凌空']);
  assert.deepEqual([pegasusMeta.canonicalId,pegasusMeta.identityMatchStatus,pegasusMeta.catalogMatchStatus,pegasusMeta.displayNameZh],[null,'unmatched','exact','天馬爆擊']);
  assert.deepEqual([hoverWatch.canonicalId,hoverWatch.identityMatchStatus,hoverWatch.catalogMatchStatus,hoverWatch.displayNameZh],[null,'unmatched','user_confirmed','飛龍凌空']);
  assert.equal(hoverMeta.sourcePartName,'Hover Wyvern');assert.equal(pegasusMeta.sourcePartName,'Pegasus Blast');assert.equal(hoverWatch.name,'Hover Wyvern');
  assert.deepEqual([stats.identityReport.exactMatches,stats.identityReport.unresolvedCount],[1140,206]);
  assert.equal(stats.nameCatalog.matchCounts.user_confirmed,2);
  assert.equal(objectiveStatisticsHash(stats),OBJECTIVE_STATISTICS_HASH);
});
test('名稱型錄 174 筆可顯示中文、78 筆待確認，Flame 維持型號歧義', () => {
  const records=[...stats.metaBeys.categories.blades,...stats.beywatch.blades];
  const confirmed=new Set(['exact','alias_exact','model_verified_alias','user_confirmed','user_confirmed_alias']);
  assert.equal(records.filter(item=>confirmed.has(item.catalogMatchStatus)&&item.displayNameZh).length,174);
  assert.equal(stats.nameCatalog.unresolvedCount,78);
  const flame=store.blade('flame');
  assert.equal(flame.canonical,null);
  assert.deepEqual(resolveBladeDisplayIdentity(flame),{primary:'Flame',secondary:'官方中文名待確認',officialZh:null,english:'Flame',hasOfficialZh:false});
  assert.deepEqual(stats.nameCatalog.unresolved.find(item=>item.sourceName==='Flame').candidateModels,['CX-08-01','CX-08-02','BX-50-05']);
});
test('同英文名稱依每筆型號確認結果顯示，不建立全域一對一名稱表', () => {
  const one={source:{name:'EVA Arc',catalogMatchStatus:'model_verified_alias',displayNameZh:'福音戰士至尊',catalogModels:['BXG-57-01']},canonical:null};
  const two={source:{name:'EVA Arc',catalogMatchStatus:'model_verified_alias',displayNameZh:'EVA至尊',catalogModels:['CX-00-EVA-01']},canonical:null};
  assert.equal(resolveOfficialBladeDisplayName(one),'福音戰士至尊');
  assert.equal(resolveOfficialBladeDisplayName(two),'EVA至尊');
  const ambiguous={source:{name:'EVA Arc',catalogMatchStatus:'ambiguous_requires_model',displayNameZh:'不得採用'},canonical:{displayNameZh:'也不得採用'}};
  assert.equal(resolveOfficialBladeDisplayName(ambiguous),'EVA Arc');
});
test('MetaBeys 軸心排行榜只顯示經驗證縮寫，不顯示中英文雙行名稱', () => {
  const html=categoryMarkup(store,'bits',true);
  for(const code of ['H','LR','R','B','FB','K','L','P','E']) assert.match(html,new RegExp(`<span class="part-name">${code}<\\/span>`));
  assert.doesNotMatch(html,/六角|Hexa|低衝刺|Low Rush|衝刺|Rush/);
});
test('Beywatch 軸心頁籤只顯示縮寫，括號縮寫須由主資料驗證', () => {
  const html=detailTableMarkup(wizard.source.bits,'bits',true,{store,entry:wizard});
  for(const code of ['H','B','FB','LO','L']) assert.match(html,new RegExp(`class="row-name">${code}<\\/td>`));
  assert.doesNotMatch(html,/Hexa|Ball&nbsp;|Low Rush|Free Ball|Low Orb/);
  assert.equal(store.resolveBitAbbreviation({part:'Low Rush (LR)',identityMatchStatus:'exact'}),'LR');
  assert.equal(store.resolveBitAbbreviation({part:'Narrow (Nr)',identityMatchStatus:'exact'}),'Nr');
});
test('未知軸心不取英文首字母，保留來源名稱並發出開發警告', () => {
  const warnings=[], prior=console.warn;console.warn=(...args)=>warnings.push(args.join(' '));
  try{assert.equal(store.resolveBitAbbreviation({part:'Unknown Spinner'}),'Unknown Spinner');}
  finally{console.warn=prior;}
  assert.deepEqual(warnings,['unresolved bit abbreviation Unknown Spinner']);
  assert.notEqual(store.resolveBitAbbreviation({part:'Unknown Spinner'}),'U');
});
test('完整配置只改顯示：多字上蓋、固鎖與多字元軸心正確格式化', () => {
  const before=structuredClone(wizard.source.combos);
  assert.equal(formatCompetitionComboDisplayName('Wizard Rod 1-60H',wizard,store.resolveBitAbbreviation),'魔導神杖 1-60 H');
  assert.equal(store.formatCombo(wizard,'Wizard Rod 1-60FB'),'魔導神杖 1-60 FB');
  assert.match(detailTableMarkup(wizard.source.combos,'combos',true,{store,entry:wizard}),/魔導神杖 1-60 H[\s\S]*魔導神杖 1-60 FB/);
  assert.equal(formatCompetitionComboDisplayName('Many Word Blade Name 1-60H',{source:{name:'Many Word Blade Name'},canonical:null},store.resolveBitAbbreviation),'Many Word Blade Name 1-60 H');
  assert.deepEqual(wizard.source.combos,before);
});
test('顯示格式化不改任何 competitionStatistics 原始欄位或客觀數值', () => {
  const before=JSON.stringify(stats);
  for(const key of Object.keys(CATEGORIES))categoryMarkup(store,key,true);
  for(const entry of store.entries)detailMarkup(store,entry);
  assert.equal(JSON.stringify(stats),before);
  assert.equal(objectiveStatisticsHash(stats),OBJECTIVE_STATISTICS_HASH);
});
test('日文、canonicalId、alias、來源名稱均可搜尋；不虛構中文名稱', () => {
  const glory = store.search('GLORY_VALKYRIE');
  assert.ok(glory.length);
  for(const query of ['Glory Valkyrie','グローリーワルキューレ']) assert.ok(store.search(query).some(x=>glory.includes(x)));
  for(const query of ['TYRANNO_BEAT','Tyranno Beat','暴龍霸擊']) assert.ok(store.search(query).some(x=>x.slug==='tyranno-beat'));
  assert.equal(normalizeName('ＴＹＲＡＮＮＯ＿ＢＥＡＴ'),normalizeName('Tyranno Beat'));
  assert.doesNotMatch(entryName(glory[0]),/待確認/);
});
test('相容層明確 ID 橋接合併舊名稱；來源到來源連結不被別名碰撞阻斷', () => {
  const silver=store.blade('silver-wolf');
  for(const query of ['霜輝銀狼','銀狼','SILVER_WOLF','Silver Wolf']) assert.ok(store.search(query).includes(silver));
  assert.equal(store.category('blades').find(x=>x.raw.sourcePartName==='Silver Wolf').entry,silver);
  for(const row of store.category('blades')){
    const sources=store.entries.filter(x=>x.source && normalizeName(x.source.name)===normalizeName(row.raw.sourcePartName));
    if(sources.length===1)assert.equal(row.entry,sources[0],row.raw.sourcePartName);
  }
  const ambiguousDb={...db,blades:[{id:'A',aliases:['Shared']},{id:'B',aliases:['Shared']}],aliases:[],__v18:{},competitionStatistics:{...stats,beywatch:{...stats.beywatch,blades:[{name:'Shared',url:'https://beywatch.gg/blades/shared',canonicalId:'Shared',identityMatchStatus:'exact'}]}}};
  assert.equal(createStatisticsStore(ambiguousDb).blade('shared').canonical,null);
});
test('來源無 canonical 仍可採用型號驗證中文且不改寫來源身分', () => {
  const antler = store.blade('antler');
  assert.equal(antler.canonical,null);
  assert.equal(entryName(antler),'雄鹿鹿角');
  assert.equal(entryEnglish(antler),'Antler');
  assert.equal(entryStatus(antler),'未排名／樣本不足');
  assert.equal(entryRank(antler),'未排名');
  assert.match(detailMarkup(store,antler),/40\.0%/);
  assert.equal(stats.beywatch.blades.find(x=>x.name==='Antler').canonicalId,null);
});
test('ambiguous 不任選 canonical，即使來源附有 canonicalId 或相似名稱', () => {
  const ambiguous = {...wizard.source,identityMatchStatus:'ambiguous',catalogMatchStatus:'ambiguous_requires_model',displayNameZh:null};
  const s = createStatisticsStore({...db,competitionStatistics:{...stats,beywatch:{...stats.beywatch,blades:[ambiguous]}}});
  assert.equal(s.blade('wizard-rod').canonical,null);
  assert.equal(entryName(s.blade('wizard-rod')),'Wizard Rod');
});
test('未排名、无資料及 canonical-only 上蓋可搜尋進入，不以原裝填空', () => {
  const noData = store.blade('captain-america');
  assert.equal(entryStatus(noData),STATUS.no_available_competition_statistics);
  assert.ok(store.search('Captain America').includes(noData));
  assert.match(detailMarkup(store,noData),/目前無可用競賽統計/);
  assert.ok(store.entries.some(x=>x.canonical && !x.source));
  assert.equal(store.search('').length,store.entries.length);
  assert.equal(store.search('not-a-real-blade-zzzz').length,0);
});
test('第二層摘要與每一來源配置/固鎖/軸心明細保持來源順序和原數值', () => {
  const markup = detailMarkup(store,wizard);
  for(const value of ['62.2%','35.4%','5,750','52.5%','52.4%']) assert.ok(markup.includes(value));
  for(const source of stats.beywatch.blades) for(const kind of ['combos','ratchets','bits']) {
    const html = detailTableMarkup(source[kind],kind,true);
    assert.equal((html.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr>/g)||[]).length,source[kind].length);
    assert.deepEqual(sourceRows(source[kind],true),source[kind]);
  }
});
test('超過 10 筆明細能展開全部；缺值不填零；原始配置文字不拆解', () => {
  const rows = Array.from({length:14},(_,i)=>({combo:`Source text ${i} <unchanged>`,firstRate:null,topCuts:null}));
  assert.equal(sourceRows(rows).length,10);
  assert.equal(sourceRows(rows,true).length,14);
  assert.match(detailTableMarkup(rows,'combos'),/顯示全部（14 筆）/);
  assert.match(detailTableMarkup(rows,'combos',true),/Source text 13 &lt;unchanged&gt;/);
  const html = detailTableMarkup([{part:'Low Rush (LR)',pick:'0.02%',firstRate:null}],'bits');
  assert.match(html,/0\.02%/);assert.match(html,/data-label="Top Cuts">—/);assert.doesNotMatch(html,/>0<|NaN/);
});
test('百分比、千位分隔、日期與連結安全處理，不改原始值', () => {
  assert.equal(formatValue('0.02%',true),'0.02%');
  assert.equal(formatValue(.02,true),'0.02%');
  assert.equal(formatValue(null),'—');assert.equal(formatValue(0),'0');
  assert.equal(formatValue('1,922'),'1,922');assert.equal(sourceNumber('1,922'),1922);
  assert.equal(formatDate(null),'來源未公開更新日期');assert.equal(formatDate('bad'),'來源未公開更新日期');
  assert.equal(safeUrl('javascript:alert(1)'),null);
  assert.doesNotMatch(sourceInfo({...stats,metaBeys:{...stats.metaBeys,sourceUrl:null}},'metaBeys'),/href=|Invalid Date/);
  assert.match(searchMarkup([{slug:'safe',source:{name:'<img onerror=alert(1)>',statisticsStatus:'ranked',rank:null},canonical:null}]),/&lt;img/);
});
test('來源 slug / canonical 路由可往返，錯誤編碼安全且不使用索引', () => {
  for(const entry of store.entries) assert.equal(store.blade(readRoute(bladeHref(entry).split('.html')[1])),entry);
  assert.equal(readRoute('#/blades/%'),null);
  assert.match(detailMarkup(store,null),/找不到這個上蓋/);
  assert.equal(new Set(store.entries.map(x=>x.slug)).size,store.entries.length);
});
test('同一 JSON 初始化只 fetch 一次，切分類與搜尋不重抓；失敗可重試', async () => {
  let calls=0;
  const load = makeStatisticsLoader(async(url,options)=>{calls++;assert.equal(options.cache,'no-cache');return{ok:true,json:async()=>db};});
  const [a,b] = await Promise.all([load(),load()]);
  a.category('bits');a.search('Wizard');assert.equal(a,b);assert.equal(calls,1);
  let failures=0;
  const retry=makeStatisticsLoader(async()=>{if(!failures++)throw Error('offline');return{ok:true,json:async()=>db};});
  await assert.rejects(retry(),/offline/);assert.ok(await retry());
  await assert.rejects(makeStatisticsLoader(async()=>({ok:false,status:404}))(),/404/);
  assert.throws(()=>createStatisticsStore({}),/尚未提供/);
});
test('兩層手機頁籤 ARIA、鍵盤處理、四欄/兩欄/單欄規則存在', () => {
  const html = tabsMarkup(CATEGORIES,'bits','category');
  assert.equal((html.match(/aria-selected="true"/g)||[]).length,1);
  assert.match(html,/id="category-tab-bits" role="tab" aria-selected="true"/);
  assert.match(read('competition-stats.css'),/min-width:1400px/);
  assert.match(read('competition-stats.css'),/\.ranking-panel:not\(\.mobile-active\)/);
  assert.match(read('competition-stats.css'),/\.detail-panel:not\(\.mobile-active\)/);
  assert.match(read('competition-stats.js'),/ArrowLeft.*ArrowRight.*Home.*End/);
  for(const id of ['load-state','error-state','retry-load']) assert.ok(read('competition-stats.html').includes(id));
});
test('競賽統計密度樣式保留可讀列高、44px 觸控區與底部安全區', () => {
  const css=read('competition-stats.css'),html=read('competition-stats.html');
  for(const token of ['--stats-control:44px','--stats-panel-head:44px','--stats-table-head:34px','--stats-row:44px','--stats-row-bilingual:50px']) assert.match(css,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(css,/\.stats-tabs button\{[^}]*min-height:44px/);
  assert.match(css,/\.summary-metrics>div\{[^}]*min-height:70px/);
  assert.match(css,/padding:62px 12px calc\(76px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/\.detail-table tr\{[^}]*min-height:60px/);
  assert.match(css,/\.detail-table \.number\{[^}]*white-space:nowrap/);
  assert.doesNotMatch(css,/transform\s*:\s*scale|height\s*:\s*100vh|overflow\s*:\s*hidden[^}]*\.stats-main/);
  assert.match(html,/支援中文、英文、日文及零件 ID/);
  assert.match(html,/search-keyboard-help[^>]*class="sr-only"/);
});
test('統計顯示只用客觀來源，不重新引入分數/推薦/勝率解讀；僅保留使用者指定警語', () => {
  const html = Object.keys(CATEGORIES).map(key=>categoryMarkup(store,key,true)).join('') + store.entries.map(x=>detailMarkup(store,x)).join('');
  assert.doesNotMatch(html.replaceAll(WARNING,''),/勝率|Tier|最佳配置|推薦配置|最近上榜紀錄|協同效果|攻擊型|持久型|防守型|平衡型/);
  const code = ['competition-stats-data.js','competition-stats-view.js','competition-stats.js'].map(read).join('');
  assert.doesNotMatch(code,/recommendedBits|comboScore|inventoryRecommendation|independentTier|stockBonus|localStorage|indexedDB|\.sort\(/);
});
