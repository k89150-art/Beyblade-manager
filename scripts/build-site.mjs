// This site's production runtime is plain static HTML/CSS/JS: no transpiler,
// framework or data generation. Output is isolated and never deployed here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['--experimental-vm-modules','scripts/validate-site.mjs'],{stdio:'inherit'});
const root = fs.realpathSync('.');
const output = path.join(root,'.site-build');
if(fs.existsSync(output) && fs.realpathSync(output)!==output) throw new Error('Build output must not be a symlink');
fs.mkdirSync(output,{recursive:true});
const files = fs.readdirSync(root).filter(f=>/\.(html|css|js|json|svg)$/.test(f) && f!=='firebase.json');
const manifest = {};
for(const file of files){
  if(!fs.statSync(file).isFile())continue;
  const bytes=fs.readFileSync(file);
  fs.writeFileSync(path.join(output,file),bytes);
  manifest[file]=crypto.createHash('sha256').update(bytes).digest('hex');
}
// No stale runtime artifacts are silently shipped.
for(const file of fs.readdirSync(output)) if(file!=='build-manifest.json' && !manifest[file]) throw new Error(`Unexpected build artifact: ${file}`);
fs.writeFileSync(path.join(output,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Static production build PASS: ${Object.keys(manifest).length} files; source data unchanged.`);
