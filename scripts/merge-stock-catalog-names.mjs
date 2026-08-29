import fs from 'node:fs';
import path from 'node:path';

const [sourcePath, stockPath = 'stock_products_AUTOFILL_SAFE_2026-07-29-v3.json'] = process.argv.slice(2);
if (!sourcePath) {
  throw new Error('Usage: node scripts/merge-stock-catalog-names.mjs <catalog.json> [stock-catalog.json]');
}

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const source = readJson(sourcePath);
const stockText = fs.readFileSync(stockPath, 'utf8');
const stock = JSON.parse(stockText);
const sourceRecords = source.records || [];
const stockRecords = stock.stockProducts || [];

if (source.metadata?.unresolvedCount !== 0 || sourceRecords.length !== 231 || stockRecords.length !== 231) {
  throw new Error(`Catalog coverage must be complete: source=${sourceRecords.length}, stock=${stockRecords.length}, unresolved=${source.metadata?.unresolvedCount}`);
}

const sourceById = new Map();
for (const record of sourceRecords) {
  if (!record.recordId || !record.model || !record.chineseName || !record.englishName) {
    throw new Error(`Incomplete catalog record: ${record.recordId || '(missing recordId)'}`);
  }
  if (sourceById.has(record.recordId)) throw new Error(`Duplicate source recordId: ${record.recordId}`);
  sourceById.set(record.recordId, record);
}

for (const product of stockRecords) {
  const sourceRecord = sourceById.get(product.recordId);
  if (!sourceRecord) throw new Error(`Stock record is missing from source catalog: ${product.recordId}`);
  const stockModel = product.displayCode || product.productCode;
  if (stockModel !== sourceRecord.model) {
    throw new Error(`Model mismatch for ${product.recordId}: ${stockModel} / ${sourceRecord.model}`);
  }
  if (product.displayNameZh !== sourceRecord.chineseName) {
    throw new Error(`Chinese-name mismatch for ${product.recordId}: ${product.displayNameZh} / ${sourceRecord.chineseName}`);
  }
  for (const field of ['displayNameEn', 'referenceNameEn']) {
    if (product[field] && product[field] !== sourceRecord.englishName) {
      throw new Error(`English-name conflict for ${product.recordId}: ${product[field]} / ${sourceRecord.englishName}`);
    }
    product[field] = sourceRecord.englishName;
  }
}

stock.metadata.nameCatalogUpdate = {
  sourceFile: path.basename(sourcePath),
  appliedAt: '2026-08-29',
  sourceRecords: sourceRecords.length,
  matchedByRecordId: stockRecords.length,
  unresolvedRecords: 0,
  matchRule: 'Exact recordId match with identical model and Traditional Chinese name.',
  displayPolicy: 'English names are stored as catalog metadata; collection cards remain Chinese-only.'
};

const newline = stockText.includes('\r\n') ? '\r\n' : '\n';
fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2).replace(/\n/g, newline) + newline, 'utf8');

console.log(JSON.stringify({
  sourceRecords: sourceRecords.length,
  matchedByRecordId: stockRecords.length,
  englishNamesUpdated: stockRecords.length,
  unresolvedRecords: 0
}, null, 2));
