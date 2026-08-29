import fs from 'node:fs';
import {createStatisticsStore,normalizeName,resolveBladeDisplayIdentity} from '../competition-stats-data.js';
const db=JSON.parse(fs.readFileSync('beyblade_x_database_v1_zhTW.json','utf8'));
const store=createStatisticsStore(db);
const unresolvedBlades=[];const seenBlades=new Set();
for(const entry of store.entries){
  const identity=resolveBladeDisplayIdentity(entry);
  const name=entry.source?.name||entry.sourceName||identity.english||identity.primary;
  const key=normalizeName(name);
  if(!identity.hasOfficialZh&&name&&!seenBlades.has(key)){seenBlades.add(key);unresolvedBlades.push(name);}
}
for(const {raw,part} of store.category('bits'))store.resolveBitAbbreviation(raw,part);
for(const entry of store.entries)for(const row of entry.source?.bits||[])store.resolveBitAbbreviation(row);
const unresolvedBits=[...store.unresolvedBits];
const lines=['# 競賽統計名稱對應報告','',`產生日期：2026-08-29。未對應項目保留來源名稱；沒有建立翻譯或假 canonicalId。`,'',`## 尚無已驗證台灣官方繁中上蓋（${unresolvedBlades.length}）`,'',...unresolvedBlades.map(x=>`- ${x}`),'',`## 無法由主資料驗證縮寫的軸心來源名稱（${unresolvedBits.length}）`,'',...(unresolvedBits.length?unresolvedBits.map(x=>`- ${x}`):['- 無']),''];
fs.writeFileSync('COMPETITION_NAME_REPORT.md',lines.join('\n'));
console.log(JSON.stringify({unresolvedBlades:unresolvedBlades.length,unresolvedBits},null,2));
