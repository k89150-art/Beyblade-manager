import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { attachCatalogNames, getOfficialStockCode, getStockCatalogLabel, getStockVariantLabel } from '../stock-catalog-names.js';

const stock = JSON.parse(fs.readFileSync('stock_products_AUTOFILL_SAFE_2026-07-29-v3.json', 'utf8'));
const script = fs.readFileSync('script.js', 'utf8');
const userView = fs.readFileSync('user-view.js', 'utf8');
const names = JSON.parse(fs.readFileSync('beyblade_x_model_chinese_english_2026-08-29.json', 'utf8'));
const products = attachCatalogNames(stock.stockProducts, names.records);

test('兩份原檔可解析，234 筆型號、中英文名稱與 recordId 一對一', () => {
  assert.equal(stock.stockProducts.length, 234);
  assert.equal(names.records.length, 234);
  assert.equal(new Set(products.map(item => item.recordId)).size, 234);
  for (const item of products) {
    assert.ok(item.productCode, item.recordId);
    assert.ok(item.displayNameZh, item.recordId);
    assert.match(item.displayNameEn, /[A-Za-z]/, item.recordId);
  }
});

test('共用型號仍由 recordId 對應正確名稱', () => {
  const get = id => products.find(item => item.recordId === id);
  assert.deepEqual(
    [get('BX-00-01-01').displayNameZh, get('BX-00-01-01').displayNameEn],
    ['歐比王肯諾比', 'Obi-Wan Kenobi']
  );
  assert.deepEqual(
    [get('CX-00-BUCKS-ANTLERS').displayNameZh, get('CX-00-BUCKS-ANTLERS').displayNameEn],
    ['雄鹿鹿角', 'Bucks Antlers']
  );
});

test('CX-19 三個顏色候選與自動帶入配置均正確', () => {
  const ids = ['CX-19-01', 'CX-19-02', 'CX-19-03'];
  const cx = products.filter(item => getOfficialStockCode(item) === 'CX-19');
  assert.deepEqual(cx.map(item => item.recordId), ids);
  for (const [index, item] of cx.entries()) {
    assert.equal(item.assemblySystem, 'CX_4P');
    assert.deepEqual(item.parts, {
      blade: null, lockChip: '巨鱷', mainBlade: null,
      metalBlade: '碾壓', overBlade: 'T', assistBlade: 'Q', ratchet: '5-50', bit: 'GN'
    });
    assert.equal(getStockCatalogLabel(item) + getStockVariantLabel(item),
      `CX-19 巨鱷碾壓／Croco Tread（顏色 0${index + 1}）`);
  }
  assert.deepEqual(stock.lookupIndexes.variantsByBaseCode.CX19, ids);

  const start = script.indexOf('function toHalfWidth(value)');
  const end = script.indexOf('function getStockProductLookup(value)', start);
  const rowStart = script.indexOf('function getStockProductRowData(product)');
  const rowEnd = script.indexOf('function chooseStockProductForStoredItem(item)', rowStart);
  assert.ok(start >= 0 && end > start && rowStart >= 0 && rowEnd > rowStart);
  const context = { getOfficialStockCode, console };
  vm.runInNewContext(`${script.slice(start, end)}\n${script.slice(rowStart, rowEnd)}\n` +
    'this.parse = parseStockProductCode; this.index = buildStockProductIndexes; this.row = getStockProductRowData;', context);
  const { exactIndex, baseIndex } = context.index(products);
  assert.equal((exactIndex.get(context.parse('CX-19').exactKey) || []).length, 0);
  assert.deepEqual(Array.from(baseIndex.get(context.parse('CX-19').baseKey), x => x.recordId), ids);
  for (const item of cx) {
    const row = context.row(item);
    assert.equal(row.cells[0], 'CX-19');
    assert.deepEqual(Array.from(row.cells).slice(2), ['巨鱷', 'T/碾壓', 'T', '碾壓', 'Q', '5-50', 'GN']);
    assert.equal(row.metadata.stockRecordId, item.recordId);
  }
});

test('BX-00／CX-00 多候選不變，CX-19 畫面顯示英文但既有中文規則保留', () => {
  const counts = [['BX00', 9], ['CX00', 8]];
  for (const [key, count] of counts) assert.equal(stock.lookupIndexes.exactByCode[key].length, count);
  assert.equal(getStockCatalogLabel(products.find(item => item.recordId === 'CX-00-BUCKS-ANTLERS')),
    'CX-00 雄鹿鹿角');
  assert.match(script, /getStockProductChoiceLabel\(product\)/);
  assert.match(script, /getStockCatalogLabel\(product\).*getStockVariantLabel\(product\)/);
  assert.match(userView, /stockDisplayLabel/);
});
