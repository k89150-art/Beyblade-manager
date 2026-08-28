// This repository ships static HTML/JS directly. Validate the production inputs
// without generating another copy of any database or executing browser code.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const files = fs.readdirSync('.').filter(x => fs.statSync(x).isFile());
let modules = 0, documents = 0, jsonFiles = 0, localReferences = 0;
function verifyReference(reference, owner) {
  if (!reference || /^(https?:|mailto:|tel:|data:|#)/i.test(reference)) return;
  const target = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!target) return;
  assert.ok(fs.existsSync(path.resolve(path.dirname(owner), target)), `${owner}: missing ${reference}`);
  localReferences++;
}
function parseModule(source, identifier) {
  const module = new vm.SourceTextModule(source, {identifier});
  for (const dependency of module.dependencySpecifiers) verifyReference(dependency, identifier);
  modules++;
}
for (const file of files) {
  const source = /\.(js|html|json)$/.test(file) ? fs.readFileSync(file, 'utf8') : '';
  if (file.endsWith('.js')) parseModule(source,file);
  if (file.endsWith('.json')) { JSON.parse(source); jsonFiles++; }
  if (file.endsWith('.html')) {
    for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) verifyReference(match[1],file);
    for (const match of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!/\bsrc=/.test(match[1]) && match[2].trim()) parseModule(match[2],file);
    }
    assert.doesNotMatch(source, /analysis\.html|suggestFromStockBtn|suggestion-card/);
    documents++;
  }
}
assert.ok(!fs.existsSync('analysis.html'));
console.log(JSON.stringify({documents,modules,jsonFiles,localReferences,result:'PASS'},null,2));
