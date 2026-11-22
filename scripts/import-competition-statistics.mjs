// Explicit import, never run at startup/build. Only the standalone objective
// competition snapshot may cross this boundary.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// D-016: dated snapshots in competition-statistics/ are history. This importer
// never deletes or overwrites one; a new snapshot is created exclusively ('wx').
// Writing the snapshot and the database are two separate file operations, not
// one atomic transaction; every interrupted state is detected on the next run.
const target = 'beyblade_x_database_v1_zhTW.json';
const baselineDirectory = 'competition-statistics';
const lockPath = '.competition-statistics-import.lock';
const SNAPSHOT_NAME = /^beyblade_x_competition_statistics_(\d{4}-\d{2}-\d{2})\.json$/;
// Test-only fault injection. It is honoured only inside a disposable test
// workspace (marker file present, not a Git checkout); anywhere else a set
// variable stops the import before anything is touched.
const FAULTS = new Set(['after-snapshot', 'db-temp-write', 'before-db-rename', 'pause-before-db-rename']);
const TEST_WORKSPACE_MARKER = '.competition-import-test-workspace';
const fault = process.env.COMPETITION_IMPORT_FAULT || '';
if (fault) {
  assert.ok(FAULTS.has(fault), `Unknown COMPETITION_IMPORT_FAULT value: ${fault}`);
  assert.ok(fs.existsSync(TEST_WORKSPACE_MARKER) && !fs.existsSync('.git'), 'COMPETITION_IMPORT_FAULT is set outside a test workspace; unset it. Nothing was imported.');
}
const statsHash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Only the lock this run created and this run's own temporary file may be
// removed. Snapshot files are never passed here.
function removeOwnFile(file) {
  assert.ok(file === lockPath || (file.endsWith('.tmp') && path.dirname(file) === '.'), `Refusing to remove ${file}`);
  try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

let lockFd;
try {
  lockFd = fs.openSync(lockPath, 'wx');
} catch (error) {
  if (error.code === 'EEXIST') {
    throw new Error(`Another competition import is running or was interrupted (${lockPath} exists). Confirm no import is running, check ${baselineDirectory}/ and ${target}, then remove the lock manually.`);
  }
  throw error;
}
fs.writeSync(lockFd, JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()}));
fs.closeSync(lockFd);
try {
  run();
} finally {
  removeOwnFile(lockPath);
}

function run() {
const input = process.argv[2];
assert.ok(input, 'Pass the latest cumulative JSON path');
const incoming = JSON.parse(fs.readFileSync(input, 'utf8'));
const dbRawBefore = fs.readFileSync(target, 'utf8');
const db = JSON.parse(dbRawBefore);
const stats = incoming.competitionStatistics;
assert.equal(incoming.metadata?.contentScope, 'objective-competition-statistics-only', 'Input is not the objective-only competition baseline');
assert.ok(stats?.metaBeys?.categories && Array.isArray(stats?.beywatch?.blades), 'Missing competitionStatistics');
const timestamp = value => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
};
const assertNotOlder = (currentValue, incomingValue, label) => {
  const currentTime = timestamp(currentValue);
  const incomingTime = timestamp(incomingValue);
  if (currentTime !== null) {
    assert.notEqual(incomingTime, null, `${label} is missing while the current database has ${currentValue}`);
    assert.ok(incomingTime >= currentTime, `${label} regressed from ${currentValue} to ${incomingValue}`);
  }
};
assertNotOlder(db.competitionStatistics?.capturedAt, stats.capturedAt, 'competition snapshot date');
assertNotOlder(db.competitionStatistics?.metaBeys?.capturedAt, stats.metaBeys.capturedAt, 'MetaBeys capturedAt');
assertNotOlder(db.competitionStatistics?.beywatch?.sourceUpdatedAt, stats.beywatch.sourceUpdatedAt, 'Beywatch sourceUpdatedAt');
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
assert.equal(pages.length, 136, 'Beywatch pages');
for (const [status, count] of Object.entries({ranked: 40, unranked_or_insufficient_sample: 80, no_data: 16})) {
  assert.equal(pages.filter(item => item.statisticsStatus === status).length, count, `Beywatch ${status}`);
}
for (const [key, count] of Object.entries({combos: 998, ratchets: 510, bits: 535})) {
  assert.equal(pages.reduce((sum, item) => sum + item[key].length, 0), count, `Beywatch ${key}`);
}
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(hash(stats.beywatch), '0492107eae64da9f7f35a71f69d15021a9e218bdbe1e6d4b7372d11f25d12b20', 'Beywatch snapshot changed');
assert.equal(hash(stats.identityReport), 'b0883ef2adf28e06c3949bb2f71d93fdc2f21ccc1b4fc972ddd6b26de45ece29', 'identityReport changed');
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
const priorPagesByUrl = new Map((db.competitionStatistics?.beywatch?.blades ?? []).map(item => [item.url, item]));
for (const page of pages) {
  const prior = priorPagesByUrl.get(page.url);
  if (prior?.canonicalId && prior.identityMatchStatus === 'exact') {
    assert.equal(page.canonicalId, prior.canonicalId, `canonicalId regressed for ${page.name}`);
    assert.equal(page.identityMatchStatus, 'exact', `identity match regressed for ${page.name}`);
    assert.equal(page.displayNameZh, prior.displayNameZh, `confirmed Chinese name regressed for ${page.name}`);
  }
}
for (const page of pages) {
  const comboNames = page.combos.map(item => item.combo);
  assert.equal(new Set(comboNames).size, comboNames.length, `Duplicate combo in ${page.name}`);
}
const preservedBefore = structuredClone(db);
delete preservedBefore.competitionStatistics;
delete preservedBefore.competitionStatisticsImport;
// R-2: a version is identified by the SHA-256 of JSON.stringify(competitionStatistics),
// the same value stored in competitionStatisticsImport.sha256. Bytes on disk
// (line endings) and filenames do not decide whether two versions are equal.
const snapshotSha256 = statsHash(stats);
// R-3: the filename date is the completion date in metadata.generatedAt.
const sourceFileName = path.basename(input);
const sourceMatch = SNAPSHOT_NAME.exec(sourceFileName);
assert.ok(sourceMatch, 'Baseline filename must use its completion date');
const sourceDate = sourceMatch[1];
assert.equal(incoming.metadata?.generatedAt, sourceDate, 'Baseline filename date must equal metadata.generatedAt');

// Every file in the history directory must be a readable dated snapshot; a
// damaged or unexpected file stops the import before anything is written.
const history = fs.existsSync(baselineDirectory)
  ? fs.readdirSync(baselineDirectory).sort().map(name => {
    const match = SNAPSHOT_NAME.exec(name);
    assert.ok(match, `Unexpected file in ${baselineDirectory}/: ${name}. The history directory may only contain dated snapshots; check it manually.`);
    const file = path.join(baselineDirectory, name);
    let snapshot;
    try {
      snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`History snapshot ${file} is damaged or unreadable: ${error.message}`);
    }
    assert.equal(snapshot?.metadata?.contentScope, 'objective-competition-statistics-only', `History snapshot ${file} is not an objective competition snapshot`);
    assert.equal(snapshot.metadata.generatedAt, match[1], `History snapshot ${file} filename date does not match metadata.generatedAt`);
    assert.ok(snapshot.competitionStatistics && typeof snapshot.competitionStatistics === 'object', `History snapshot ${file} has no competitionStatistics`);
    return {name, date: match[1], file, sha256: statsHash(snapshot.competitionStatistics), documentSha256: statsHash(snapshot)};
  })
  : [];
const latest = history.at(-1) ?? null;

// The database must point at a snapshot whose content it still holds.
const recorded = db.competitionStatisticsImport ?? null;
let dbEntry = null;
if (recorded) {
  const dbSha256 = statsHash(db.competitionStatistics);
  assert.equal(dbSha256, recorded.sha256, `${target} competitionStatistics no longer matches competitionStatisticsImport.sha256; check it manually`);
  dbEntry = history.find(entry => `${baselineDirectory}/${entry.name}` === recorded.baselineFile) ?? null;
  assert.ok(dbEntry, `${target} refers to ${recorded.baselineFile}, which is missing from ${baselineDirectory}/`);
  assert.equal(dbEntry.sha256, dbSha256, `${dbEntry.file} does not match the statistics recorded in ${target} (hash mismatch)`);
} else {
  assert.ok(history.length <= 1, `${target} has no competitionStatisticsImport record while ${baselineDirectory}/ already holds ${history.length} snapshots; check it manually`);
}
const dbAtLatest = !latest || dbEntry?.name === latest.name;

// R-4 / R-6: decide what this run does before writing anything.
const equalContent = history.find(entry => entry.sha256 === snapshotSha256) ?? null;
const sameName = history.find(entry => entry.name === sourceFileName) ?? null;
let outcome;
if (equalContent) {
  if (equalContent.name !== latest.name) {
    throw new Error(`Input equals the older snapshot ${equalContent.file}, not the latest ${latest.file}. Refusing to roll the database back; check the source manually.`);
  }
  if (dbAtLatest) {
    // Same content again: nothing is written, not even time fields.
    console.log(JSON.stringify({changed: false, retainedBaseline: path.join(baselineDirectory, latest.name), sha256: snapshotSha256}, null, 2));
    return;
  }
  // R-6: an earlier run created this snapshot and stopped before updating the
  // database. Finish only if the state is exactly that one.
  const previous = history.at(-2) ?? null;
  assert.equal(equalContent.name, sourceFileName, `Recovery requires the same snapshot filename as ${equalContent.name}`);
  assert.equal(equalContent.documentSha256, statsHash(incoming), `Recovery requires ${equalContent.file} to equal the input exactly`);
  assert.ok(previous ? dbEntry?.name === previous.name : !recorded, `${target} is at ${dbEntry?.name ?? 'no snapshot'}, not the snapshot right before ${latest.name}; check it manually`);
  outcome = 'recovered';
} else {
  if (sameName) {
    throw new Error(`${sameName.file} already exists with different content (existing ${sameName.sha256}, input ${snapshotSha256}). Refusing to overwrite a history snapshot.`);
  }
  assert.ok(dbAtLatest, `${target} is at ${dbEntry?.name ?? 'no snapshot'} but the latest snapshot is ${latest?.name}; finish or check that import first`);
  if (latest) assert.ok(sourceDate > latest.date, `Snapshot date ${sourceDate} is not newer than the latest snapshot ${latest.date}`);
  outcome = 'created';
}

db.competitionStatistics = stats; // Exact source snapshot, not a computed derivative.
db.competitionStatisticsImport = {
  capturedAt: stats.capturedAt,
  sha256: snapshotSha256,
  sourceFileName,
  baselineFile: `${baselineDirectory}/${sourceFileName}`
};
const preservedAfter = structuredClone(db);
delete preservedAfter.competitionStatistics;
delete preservedAfter.competitionStatisticsImport;
assert.deepEqual(preservedAfter, preservedBefore, 'Import changed non-competition data');

// WRITE PHASE. Everything above only reads and validates.
const baselineTarget = path.join(baselineDirectory, sourceFileName);
if (outcome === 'created') {
  fs.mkdirSync(baselineDirectory, {recursive: true});
  // R-5: exclusive create; an existing file is never replaced.
  fs.writeFileSync(baselineTarget, JSON.stringify(incoming, null, 2) + '\n', {flag: 'wx'});
  assert.equal(statsHash(JSON.parse(fs.readFileSync(baselineTarget, 'utf8'))), statsHash(incoming), `${baselineTarget} read-back does not match the input`);
}
if (fault === 'after-snapshot') throw new Error('Injected fault: after-snapshot');
// The temporary database file lives next to the database, never in the history
// directory, and its .tmp name cannot match a snapshot filename.
const tempPath = `${target}.import-${process.pid}.tmp`;
try {
  if (fault === 'db-temp-write') throw new Error('Injected fault: db-temp-write');
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2) + '\n', {flag: 'wx'});
  if (fault === 'before-db-rename') throw new Error('Injected fault: before-db-rename');
  if (fault === 'pause-before-db-rename') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  assert.equal(fs.readFileSync(target, 'utf8'), dbRawBefore, `${target} was changed by another process during this import; not overwriting it`);
  fs.renameSync(tempPath, target);
} catch (error) {
  removeOwnFile(tempPath);
  error.message += `\n${baselineTarget} is kept; ${target} was not updated. Fix the cause and re-run the same import to finish.`;
  throw error;
}
console.log(JSON.stringify({outcome, changed: true, baselineTarget, metaBeys: stats.metaBeys.collectionTotals, beywatch: stats.beywatch.collectionTotals, ...db.competitionStatisticsImport}, null, 2));
}
