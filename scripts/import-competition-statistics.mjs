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
const expectedCategories = {blades: 123, ratchets: 34, bits: 50, assistBlades: 14};
for (const [category, count] of Object.entries(expectedCategories)) {
  const rows = stats.metaBeys.categories[category];
  assert.equal(rows?.length, count, category);
  assert.deepEqual(rows.map(item => Number(item.rank)), Array.from({length: count}, (_, index) => index + 1), `${category} ranks`);
}
for (const category of ['blades', 'ratchets', 'bits']) {
  assert.equal(stats.metaBeys.categories[category].reduce((sum, item) => sum + Number(item.appearances), 0), 5433, `${category} appearances`);
}
assert.equal(stats.metaBeys.categories.assistBlades.reduce((sum, item) => sum + Number(item.appearances), 0), 317, 'assist blade appearances');
assert.deepEqual([
  stats.metaBeys.categories.blades[0].sourcePartName,
  stats.metaBeys.categories.blades.at(-1).sourcePartName,
  stats.metaBeys.categories.ratchets[0].sourcePartName,
  stats.metaBeys.categories.ratchets.at(-1).sourcePartName,
  stats.metaBeys.categories.bits[0].sourcePartName,
  stats.metaBeys.categories.bits.at(-1).sourcePartName,
  stats.metaBeys.categories.assistBlades[0].sourcePartName,
  stats.metaBeys.categories.assistBlades.at(-1).sourcePartName
], ['Wizard Rod', 'Wolf Hunt', '1-60', '9-90', 'Hexa', 'Yielding', 'Wheel', 'Guard Wheel']);
assert.deepEqual(stats.metaBeys.sourceTotals, {
  leaderboardCompleteCombos: 5433,
  homepageTopCutCombos: 5553,
  homepageAssistBladeCombos: 318,
  completedEventsShownOnHomepage: 268
});
const pages = stats.beywatch.blades;
assert.equal(pages.length, 135, 'Beywatch pages');
for (const [status, count] of Object.entries({ranked: 40, unranked_or_insufficient_sample: 79, no_data: 16})) {
  assert.equal(pages.filter(item => item.statisticsStatus === status).length, count, `Beywatch ${status}`);
}
for (const [key, count] of Object.entries({combos: 989, ratchets: 504, bits: 530})) {
  assert.equal(pages.reduce((sum, item) => sum + item[key].length, 0), count, `Beywatch ${key}`);
}
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(hash(stats.beywatch), '94116ed47b542a050a0ba1830f587a064c86d4cb419382e6557e4d606f0f1d05', 'Beywatch snapshot changed');
assert.equal(hash(stats.identityReport), 'e92256b110397b8004d9503e54d6604cd9b396d847efb161d83dd8b43165e84e', 'identityReport changed');
assert.equal(hash(stats.nameCatalog), '745b938e3750d8bed555e18d26d56331b020ac00bb59a0f878eeabddfaa2a943', 'nameCatalog changed');
const expectedAliases = new Map([
  ['Glary Valkyrie','Glory Valkyrie'], ['WizardRod','Wizard Rod'], ['SharkScale','Shark Scale'], ['Scale Shark','Shark Scale'],
  ['Scark Scale','Shark Scale'], ['AeroPegasus','Aero Pegasus'], ['Aero Pegaus','Aero Pegasus'], ['Areo Pegasus','Aero Pegasus'],
  ['Hover Wyern','Hover Wyvern'], ['Hovery Wyvern','Hover Wyvern'], ['Supress Superion','Suppress Superion'], ['Bahama Blitz','Bahamut Blitz'],
  ['Ceberus Blast','Cerberus Blast'], ['Goelm Rock','Golem Rock'], ['Meteo Dragoon','Meteor Dragoon'], ['Orochu Cluster','Orochi Cluster'],
  ['Pegaus Blast','Pegasus Blast'], ['Phoeniz Wing','Phoenix Wing'], ['Samurai Sabre','Samurai Saber'], ['SolEclipse','Sol Eclipse'],
  ['Tricerapress','Tricera Press'], ['T Rex','T-Rex']
]);
for (const [sourceName, canonicalName] of expectedAliases) {
  const row = stats.metaBeys.categories.blades.find(item => item.sourcePartName === sourceName);
  assert.ok(row, `Missing MetaBeys alias ${sourceName}`);
  assert.equal(row.identityMatchStatus, 'alias_exact', `${sourceName} identity status`);
  assert.equal(row.sourceAliasOf, canonicalName, `${sourceName} sourceAliasOf`);
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
