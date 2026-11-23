// Builds index.html from src.html for the Phase 7A prototype (design only, not part of the site build).
// - Injects assembly-rules.js verbatim (only `export` keywords removed) so the prototype
//   runs exactly the rules deployed in production (D-019).
// - Injects a small sample of the user-confirmed catalog.
// Usage (from the repository root): node design/phase7/prototypes/integrated-ac/build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const rulesSource = fs.readFileSync(path.join(root, "assembly-rules.js"), "utf8");
const rules = rulesSource.replace(/^export\s+/gm, "");
if (/\bexport\b/.test(rules.replace(/\/\/.*$/gm, ""))) throw new Error("unexpected export left in assembly-rules.js");

const catalog = JSON.parse(fs.readFileSync(path.join(root, "stock_products_AUTOFILL_SAFE_2026-07-29-v3.json"), "utf8")).stockProducts;
const ids = ["UX-01", "BX-01", "BX-02", "BX-03", "UX-03", "UX-16-01", "UX-19", "UX-20", "UX-21-01", "UX-21-02", "UX-21-03",
  "CX-01", "CX-07", "CX-11-01", "CX-13", "BX-50-04", "UX-15-01", "BX-00-01-01", "BX-00-01-02", "BX-00-STORM-PEGASIS"];
const sample = ids.map(id => catalog.find(p => p.recordId === id)).map(p => {
  if (!p) throw new Error("missing catalog record");
  return { id: p.recordId, code: p.productCode, name: p.displayNameZh, asm: p.assemblySystem, rm: p.ratchetMode, set: p.setId || null,
    parts: Object.fromEntries(Object.entries(p.parts).filter(([, v]) => v)), ib: p.integratedRatchetBit || null };
});

let html = fs.readFileSync(path.join(here, "src.html"), "utf8");
const put = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`missing marker ${marker}`);
  html = html.split(marker).join(value);
};
put("/*@@ASSEMBLY_RULES@@*/", `// --- assembly-rules.js (verbatim, exports removed) ---\n${rules}\n// --- end assembly-rules.js ---`);
put("/*@@CATALOG@@*/[]", JSON.stringify(sample));
fs.writeFileSync(path.join(here, "index.html"), html);
console.log(`index.html built: ${html.length} chars, ${sample.length} catalog records`);
