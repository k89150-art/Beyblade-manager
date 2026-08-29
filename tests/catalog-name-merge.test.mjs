import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const stock = JSON.parse(fs.readFileSync('stock_products_AUTOFILL_SAFE_2026-07-29-v3.json', 'utf8'));
const script = fs.readFileSync('script.js', 'utf8');
const userView = fs.readFileSync('user-view.js', 'utf8');

test('231 筆原裝型錄都有型號、中文名與英文名', () => {
  assert.equal(stock.stockProducts.length, 231);
  assert.equal(new Set(stock.stockProducts.map(item => item.recordId)).size, 231);
  for (const item of stock.stockProducts) {
    assert.ok(item.displayCode || item.productCode, item.recordId);
    assert.ok(item.displayNameZh, item.recordId);
    assert.match(item.displayNameEn, /[A-Za-z]/, item.recordId);
    assert.equal(item.displayNameEn, item.referenceNameEn, item.recordId);
  }
});

test('共用型號仍由 recordId 對應正確名稱', () => {
  const get = id => stock.stockProducts.find(item => item.recordId === id);
  assert.deepEqual(
    [get('BX-00-01-01').displayNameZh, get('BX-00-01-01').displayNameEn],
    ['歐比王肯諾比', 'Obi-Wan Kenobi']
  );
  assert.deepEqual(
    [get('CX-00-BUCKS-ANTLERS').displayNameZh, get('CX-00-BUCKS-ANTLERS').displayNameEn],
    ['雄鹿鹿角', 'Bucks Antlers']
  );
});

test('收藏卡維持既有的中文顯示規則', () => {
  assert.match(script, /product\.displayNameZh/);
  assert.doesNotMatch(userView, /displayNameEn/);
  assert.equal(stock.metadata.nameCatalogUpdate.sourceFile, 'beyblade_x_model_chinese_english_2026-08-29.json');
  assert.equal(stock.metadata.nameCatalogUpdate.matchedByRecordId, 231);
});
