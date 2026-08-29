// Run through the Browser skill's Node session with its documented browser/tab
// handles. No standalone Playwright, hidden app state, or cloud writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const output = path.resolve('artifacts/competition-stats');

export async function checkSize({tab,viewport,width,height,base='http://127.0.0.1:4328'}) {
  const prefix=`${width}x${height}`;
  await viewport.set({width,height});
  const url=`${base}/competition-stats.html`;
  if(await tab.url()===url) await tab.reload(); else await tab.goto(url);
  await tab.playwright.getByRole('heading',{name:'競賽統計',exact:true}).waitFor({state:'visible'});
  await tab.dom_cua.scroll({x:0,y:-10000});
  // Read only rendered DOM/layout. All locators are tied to the inspected UI.
  const layout=await tab.playwright.evaluate(()=>({
    width:innerWidth,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
    panels:[...document.querySelectorAll('.ranking-panel')].filter(x=>getComputedStyle(x).display!=='none').map(x=>({id:x.id,rows:x.querySelectorAll('tbody tr').length,x:x.getBoundingClientRect().x,y:x.getBoundingClientRect().y})),
    selected:[...document.querySelectorAll('#category-tabs [aria-selected=true]')].map(x=>x.textContent)
  }));
  assert.equal(layout.width,width);
  assert.equal(layout.overflow,false,`${prefix}: horizontal overflow`);
  assert.equal(layout.panels.length,width<768?1:4);
  assert.ok(layout.panels.every(x=>x.rows===10));
  assert.equal(JSON.stringify(layout.selected),JSON.stringify(['上蓋']));
  const blades=await tab.playwright.locator('#category-panel-blades').innerText();
  assert.match(blades,/魔導神杖[\s\S]*Wizard Rod/);
  assert.match(blades,/飛龍凌空[\s\S]*Hover Wyvern/);
  assert.match(blades,/天馬爆擊[\s\S]*Pegasus Blast/);
  assert.doesNotMatch(blades,/(Hover Wyvern|Pegasus Blast)[\s\S]{0,80}官方中文名待確認/);
  assert.match(blades,/霜輝銀狼[\s\S]*Silver Wolf/);
  if(width>=1400)assert.equal(new Set(layout.panels.map(x=>x.y)).size,1);
  else if(width>=768)assert.equal(new Set(layout.panels.map(x=>x.y)).size,2);
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,`rankings-${prefix}.png`),await tab.screenshot({fullPage:false}));
  if(width<768){
    for(const label of ['固鎖','軸心','輔助戰刃','上蓋']){
      await tab.playwright.getByRole('tab',{name:label,exact:true}).click();
      assert.equal(await tab.playwright.getByRole('tab',{name:label,exact:true}).getAttribute('aria-selected'),'true');
      assert.equal(await tab.playwright.getByRole('tabpanel',{name:label,exact:true}).isVisible(),true);
      if(label==='軸心'){
        const bitText=await tab.playwright.getByRole('tabpanel',{name:label,exact:true}).innerText();
        assert.match(bitText,/\bH\b[\s\S]*\bLR\b[\s\S]*\bR\b/);
        assert.doesNotMatch(bitText,/六角|Hexa|低衝刺|Low Rush/);
      }
    }
    await tab.playwright.getByRole('tab',{name:'上蓋',exact:true}).press('ArrowRight');
    assert.equal(await tab.playwright.getByRole('tab',{name:'固鎖',exact:true}).getAttribute('aria-selected'),'true');
    await tab.playwright.getByRole('tab',{name:'固鎖',exact:true}).press('Home');
    assert.equal(await tab.playwright.getByRole('tab',{name:'上蓋',exact:true}).getAttribute('aria-selected'),'true');
  }
  await tab.playwright.getByRole('link',{name:'魔導神杖 Wizard Rod',exact:true}).click();
  await tab.playwright.getByRole('heading',{name:'魔導神杖',exact:true}).waitFor({state:'visible'});
  await tab.dom_cua.scroll({x:0,y:-10000});
  const detail=await tab.playwright.evaluate(()=>({
    values:[...document.querySelectorAll('.summary-metrics dd')].map(x=>x.textContent),
    panels:[...document.querySelectorAll('.detail-panel')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.id),
    overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth
  }));
  assert.equal(JSON.stringify(detail.values),JSON.stringify(['62.2%','35.4%','5,750']));
  assert.equal(detail.overflow,false);
  assert.equal(detail.panels.length,width<768?1:3);
  const combos=await tab.playwright.locator('#detail-panel-combos').innerText();
  assert.match(combos,/魔導神杖 1-60 H/);
  assert.match(combos,/魔導神杖 1-60 FB/);
  assert.doesNotMatch(combos,/Wizard Rod 1-60H/);
  await fs.writeFile(path.join(output,`wizard-${prefix}.png`),await tab.screenshot({fullPage:false}));
  if(width<768){
    for(const label of ['固鎖','軸心','完整配置']){
      await tab.playwright.getByRole('tab',{name:label,exact:true}).click();
      assert.equal(await tab.playwright.getByRole('tabpanel',{name:label,exact:true}).isVisible(),true);
      assert.equal(await tab.playwright.getByRole('tab',{name:label,exact:true}).getAttribute('aria-selected'),'true');
      if(label!=='完整配置')assert.match(await tab.playwright.getByRole('tabpanel',{name:label,exact:true}).innerText(),/—/);
      if(label==='軸心')assert.doesNotMatch(await tab.playwright.getByRole('tabpanel',{name:label,exact:true}).innerText(),/Hexa|Free Ball|Low Orb/);
    }
  }
  await tab.reload();
  await tab.playwright.getByRole('heading',{name:'魔導神杖',exact:true}).waitFor({state:'visible'});
  assert.ok((await tab.url()).endsWith('#/blades/wizard-rod'));
  await tab.back();
  await tab.playwright.getByRole('heading',{name:'競賽統計',exact:true}).waitFor({state:'visible'});
  const errors=await tab.dev.logs({levels:['error'],limit:20});
  assert.equal(errors.length,0,JSON.stringify(errors));
  const result={size:prefix,layout,detail,reload:'PASS',back:'PASS',errors:0,result:'PASS'};
  await fs.writeFile(path.join(output,`check-${prefix}.json`),JSON.stringify(result,null,2));
  return result;
}

export async function checkInteractions({tab,base='http://127.0.0.1:4328'}) {
  const url=`${base}/competition-stats.html`;
  if(await tab.url()===url)await tab.reload();else await tab.goto(url);
  await tab.playwright.getByRole('heading',{name:'競賽統計',exact:true}).waitFor({state:'visible'});
  const mobile=await tab.playwright.getByRole('tab',{name:'上蓋',exact:true}).isVisible();
  for(const [key,label,count] of [['blades','上蓋',120],['ratchets','固鎖',33],['bits','軸心',51],['assistBlades','輔助戰刃',16]]){
    if(mobile)await tab.playwright.getByRole('tab',{name:label,exact:true}).click();
    const expand=tab.playwright.getByRole('button',{name:`查看完整排行（${count} 筆）`,exact:true});
    if(await expand.isVisible())await expand.click();
    assert.equal(await tab.playwright.locator(`#category-panel-${key} tbody tr`).count(),count);
  }
  await tab.playwright.getByRole('searchbox',{name:'搜尋上蓋',exact:true}).fill('魔導神杖');
  assert.match(await tab.playwright.getByRole('list',{name:'上蓋搜尋結果'}).innerText(),/Wizard Rod/);
  await tab.playwright.getByRole('searchbox',{name:'搜尋上蓋',exact:true}).press('ArrowDown');
  const active=await tab.playwright.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent}));
  assert.equal(active.tag,'A');assert.match(active.text,/魔導神杖/);
  await tab.playwright.getByRole('list',{name:'上蓋搜尋結果'}).getByRole('link').press('Enter');
  await tab.playwright.getByRole('heading',{name:'魔導神杖',exact:true}).waitFor({state:'visible'});
  await tab.playwright.getByRole('link',{name:'← 返回排行榜',exact:true}).click();
  await tab.playwright.getByRole('heading',{name:'競賽統計',exact:true}).waitFor({state:'visible'});
  assert.equal(await tab.playwright.locator('#category-panel-assistBlades tbody tr').count(),16);
  assert.equal(await tab.playwright.getByRole('searchbox',{name:'搜尋上蓋',exact:true}).getAttribute('id'),'blade-search');
  assert.equal(await tab.playwright.getByRole('searchbox',{name:'搜尋上蓋',exact:true}).evaluate(el=>el.value),'魔導神杖');
  if(mobile)assert.equal(await tab.playwright.getByRole('tab',{name:'輔助戰刃',exact:true}).getAttribute('aria-selected'),'true');
  for(const query of ['Wizard Rod','WIZARD_ROD','TYRANNO_BEAT','Tyranno Beat','暴龍霸擊','グローリーワルキューレ','GLORY_VALKYRIE','Antler','Captain America','Hover Wyvern','飛龍凌空','HOVER_WYVERN','Pegasus Blast','天馬爆擊','PEGASUS_BLAST','霜輝銀狼','Silver Wolf','SILVER_WOLF']){
    await tab.playwright.getByRole('searchbox',{name:'搜尋上蓋',exact:true}).fill(query);
    assert.ok(await tab.playwright.getByRole('list',{name:'上蓋搜尋結果'}).getByRole('link').count(),query);
  }
  for(const [query,heading,english,status,slug] of [['Antler','Antler','官方中文名待確認','未排名／樣本不足','antler'],['Captain America','Captain America','官方中文名待確認','目前無可用競賽統計','captain-america'],['Hover Wyvern','飛龍凌空','Hover Wyvern','有排名','hover-wyvern'],['Pegasus Blast','天馬爆擊','Pegasus Blast','目前無可用競賽統計','pegasus-blast'],['SILVER_WOLF','霜輝銀狼','Silver Wolf','有排名','silver-wolf']]){
    await tab.playwright.getByRole('searchbox',{name:'搜尋上蓋',exact:true}).fill(query);
    await tab.playwright.getByRole('searchbox',{name:'搜尋上蓋',exact:true}).press('Enter');
    await tab.playwright.getByRole('heading',{name:heading,exact:true}).waitFor({state:'visible'});
    assert.match(await tab.playwright.locator('.status-pill').innerText(),new RegExp(status));
    assert.equal(await tab.playwright.locator('.english-name').innerText(),english);
    assert.ok((await tab.url()).endsWith(`#\/blades\/${slug}`));
    await tab.reload();
    await tab.playwright.getByRole('heading',{name:heading,exact:true}).waitFor({state:'visible'});
    await tab.playwright.getByRole('link',{name:'← 返回排行榜',exact:true}).click();
    await tab.playwright.getByRole('heading',{name:'競賽統計',exact:true}).waitFor({state:'visible'});
  }
  await tab.playwright.getByRole('button',{name:'清除',exact:true}).click();
  const allResults=await tab.playwright.getByRole('list',{name:'上蓋搜尋結果'}).getByRole('link').count();
  assert.ok(allResults>=132);
  await tab.playwright.getByRole('searchbox',{name:'搜尋上蓋',exact:true}).fill('no-such-blade-zzzz');
  assert.match(await tab.playwright.getByRole('status').innerText(),/找不到符合/);
  assert.equal(await tab.playwright.getByRole('list',{name:'上蓋搜尋結果'}).getByRole('link').count(),0);
  return {expansion:[120,33,51,16],search:'PASS',keyboard:'PASS',returnState:'PASS',unranked:'PASS',noData:'PASS',unmatched:'PASS',allResults,result:'PASS'};
}

export async function checkDensity({tab,viewport,width,height,base='http://127.0.0.1:4328'}) {
  const size=`${width}x${height}`,url=`${base}/competition-stats.html?density=${size}`;
  await viewport.set({width,height});
  await tab.goto(url);
  await tab.playwright.getByRole('heading',{name:'競賽統計',exact:true}).waitFor({state:'visible'});
  const home=await tab.playwright.evaluate(()=>{
    const panels=[...document.querySelectorAll('.ranking-panel')].filter(node=>getComputedStyle(node).display!=='none');
    const nav=document.querySelector('.bottom-nav'),navHeight=nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().height:0;
    const safeBottom=innerHeight-navHeight,rows=panels[0]?[...panels[0].querySelectorAll('tbody tr')]:[];
    return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,panelCount:panels.length,visibleFirstPanelRows:rows.filter(row=>row.getBoundingClientRect().bottom<=safeBottom).length,navHeight,mainPaddingBottom:Number.parseFloat(getComputedStyle(document.querySelector('.stats-main')).paddingBottom),categoryTabHeights:[...document.querySelectorAll('#category-tabs [role=tab]')].filter(node=>getComputedStyle(node).display!=='none').map(node=>node.getBoundingClientRect().height)};
  });
  assert.deepEqual([home.width,home.height],[width,height]);
  assert.equal(home.overflow,false);
  assert.equal(home.panelCount,width<768?1:4);
  if(width<768)assert.ok(home.categoryTabHeights.every(value=>value>=44));
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,`density-after-${size}.png`),await tab.screenshot({fullPage:false}));
  let detail=null,bottomSafety=null;
  if(width<768){
    await tab.goto(`${url}#/blades/wizard-rod`);
    await tab.playwright.getByRole('heading',{name:'魔導神杖',exact:true}).waitFor({state:'visible'});
    detail=await tab.playwright.evaluate(()=>{
      const cards=[...document.querySelectorAll('.summary-metrics>div')],tabs=[...document.querySelectorAll('#detail-tab-combos,#detail-tab-ratchets,#detail-tab-bits')],numbers=[...document.querySelectorAll('#detail-panel-combos .number')];
      return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,cardsSameRow:new Set(cards.map(node=>node.getBoundingClientRect().top)).size===1,cardHeights:cards.map(node=>node.getBoundingClientRect().height),tabHeights:tabs.map(node=>node.getBoundingClientRect().height),topCutsNoWrap:getComputedStyle(cards[2].querySelector('dd')).whiteSpace==='nowrap'&&cards[2].querySelector('dd').scrollWidth<=cards[2].querySelector('dd').clientWidth,numbersUnclipped:numbers.every(node=>node.scrollWidth<=node.clientWidth+1)};
    });
    assert.equal(detail.overflow,false);assert.equal(detail.cardsSameRow,true);assert.equal(detail.topCutsNoWrap,true);assert.equal(detail.numbersUnclipped,true);assert.ok(detail.tabHeights.every(value=>value>=44));
    await fs.writeFile(path.join(output,`density-wizard-combos-${size}.png`),await tab.screenshot({fullPage:false}));
    await tab.playwright.getByRole('tab',{name:'軸心',exact:true}).click();
    await fs.writeFile(path.join(output,`density-wizard-bits-${size}.png`),await tab.screenshot({fullPage:false}));
    await tab.goto(url);await tab.playwright.getByRole('heading',{name:'競賽統計',exact:true}).waitFor({state:'visible'});
    await tab.playwright.getByRole('button',{name:/查看完整排行/}).click();
    await tab.playwright.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    bottomSafety=await tab.playwright.evaluate(()=>{const nav=document.querySelector('.bottom-nav').getBoundingClientRect(),last=document.querySelector('#category-panel-blades tbody tr:last-child').getBoundingClientRect();return {clear:last.bottom<=nav.top,lastBottom:last.bottom,navTop:nav.top};});
    assert.equal(bottomSafety.clear,true);
  }
  return {size,home,detail,bottomSafety,result:'PASS'};
}
