// Explicit import, never run at startup/build. Only the standalone objective
// competition snapshot may cross this boundary.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const input = process.argv[2];
assert.ok(input, 'Pass the latest cumulative JSON path');
const incoming = JSON.parse(fs.readFileSync(input, 'utf8'));
const target = 'beyblade_x_database_v1_zhTW.json';
const db = JSON.parse(fs.readFileSync(target, 'utf8'));
const stats = incoming.competitionStatistics;
assert.equal(incoming.metadata?.contentScope, 'objective-competition-statistics-only', 'Input is not the objective-only competition baseline');
assert.ok(stats?.metaBeys?.categories && Array.isArray(stats?.beywatch?.blades), 'Missing competitionStatistics');
const expectedCategories = {blades: 120, ratchets: 33, bits: 51, assistBlades: 16};
for (const [category, count] of Object.entries(expectedCategories)) {
  assert.equal(stats.metaBeys.categories[category]?.length, count, category);
}
const pages = stats.beywatch.blades;
assert.equal(pages.length, 134, 'Beywatch pages');
for (const [status, count] of Object.entries({ranked: 40, unranked_or_insufficient_sample: 79, no_statistics: 15})) {
  assert.equal(pages.filter(item => item.statisticsStatus === status).length, count, `Beywatch ${status}`);
}
for (const [key, count] of Object.entries({combos: 973, ratchets: 498, bits: 524})) {
  assert.equal(pages.reduce((sum, item) => sum + item[key].length, 0), count, `Beywatch ${key}`);
}
const pageUrls = pages.map(item => item.url);
assert.equal(new Set(pageUrls).size, pages.length, 'Beywatch page URLs must be unique');
assert.equal(new Set(pages.map(item => item.name)).size, pages.length, 'Beywatch identities must be unique');
for (const page of pages) {
  const comboNames = page.combos.map(item => item.combo);
  assert.equal(new Set(comboNames).size, comboNames.length, `Duplicate combo in ${page.name}`);
}
const preservedBefore = structuredClone(db);
delete preservedBefore.competitionStatistics;
delete preservedBefore.competitionStatisticsImport;
db.competitionStatistics = stats; // Exact source snapshot, not a computed derivative.
const snapshotSha256 = crypto.createHash('sha256').update(JSON.stringify(stats)).digest('hex');
const baselineDirectory = 'competition-statistics';
const sourceFileName = path.basename(input);
assert.match(sourceFileName, /^beyblade_x_competition_statistics_\d{4}-\d{2}-\d{2}\.json$/, 'Baseline filename must use its completion date');
const priorBaselines = fs.existsSync(baselineDirectory)
  ? fs.readdirSync(baselineDirectory).filter(name => /^beyblade_x_competition_statistics_\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()
  : [];
const latestPrior = priorBaselines.at(-1);
if (latestPrior && latestPrior !== sourceFileName) {
  const prior = JSON.parse(fs.readFileSync(path.join(baselineDirectory, latestPrior), 'utf8'));
  const priorSha256 = crypto.createHash('sha256').update(JSON.stringify(prior.competitionStatistics)).digest('hex');
  if (priorSha256 === snapshotSha256) {
    console.log(JSON.stringify({changed: false, retainedBaseline: path.join(baselineDirectory, latestPrior), sha256: snapshotSha256}, null, 2));
    process.exit(0);
  }
}
db.competitionStatisticsImport = {
  capturedAt: stats.capturedAt,
  sha256: snapshotSha256,
  sourceFileName,
  baselineFile: `competition-statistics/${sourceFileName}`
};
const preservedAfter = structuredClone(db);
delete preservedAfter.competitionStatistics;
delete preservedAfter.competitionStatisticsImport;
assert.deepEqual(preservedAfter, preservedBefore, 'Import changed non-competition data');
const baselineTarget = path.join(baselineDirectory, sourceFileName);
fs.mkdirSync(baselineDirectory, {recursive: true});
fs.writeFileSync(baselineTarget, JSON.stringify(incoming, null, 2) + '\n');
fs.writeFileSync(target, JSON.stringify(db, null, 2) + '\n');
for (const priorBaseline of priorBaselines) {
  if (priorBaseline !== sourceFileName) fs.rmSync(path.join(baselineDirectory, priorBaseline));
}
console.log(JSON.stringify({baselineTarget, metaBeys: stats.metaBeys.collectionTotals, beywatch: stats.beywatch.collectionTotals, ...db.competitionStatisticsImport}, null, 2));
