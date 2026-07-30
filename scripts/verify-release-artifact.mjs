import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

const root = resolve(argument("--root", "_site"));
const failures = [];
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".txt"
]);
const forbiddenFiles = new Set([
  ".env",
  "evidence-mvp.css",
  "evidence-mvp.html",
  "evidence-page.js",
  "seed.js",
  "development-environment.js"
]);
const sensitivePatterns = [
  {
    label: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u
  },
  {
    label: "service-account credential",
    pattern: /"(?:private_key|private_key_id|client_email)"\s*:/u
  }
];
const seedPatterns = [
  /\bEVIDENCE_SEED_DRAFTS\b/u,
  /\bDEV_ENTITY_IDS\b/u,
  /\bevidence-wizard-/u,
  /\bevidence-rising-/u,
  /\bevidence-declining-/u
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

const rootStats = await stat(root).catch(() => null);
if (rootStats === null || !rootStats.isDirectory()) {
  throw new Error(`Release artifact directory does not exist: ${root}`);
}

const files = await walk(root);
for (const file of files) {
  const path = relative(root, file).replaceAll("\\", "/");
  const name = basename(file);
  if (name.endsWith(".map")) {
    failures.push(`${path}: source map must not ship`);
  }
  if (forbiddenFiles.has(name)) {
    failures.push(`${path}: development-only file must not ship`);
  }
  if (name.startsWith(".env")) {
    failures.push(`${path}: environment file must not ship`);
  }
  if (!textExtensions.has(extname(file))) continue;
  const content = await readFile(file, "utf8");
  if (/sourceMappingURL=/u.test(content)) {
    failures.push(`${path}: source map reference found`);
  }
  for (const item of sensitivePatterns) {
    if (item.pattern.test(content)) {
      failures.push(`${path}: ${item.label} found`);
    }
  }
  for (const pattern of seedPatterns) {
    if (pattern.test(content)) {
      failures.push(`${path}: development Seed marker found`);
    }
  }
}

const configPath = join(root, "firebase-meta-config.js");
const config = await readFile(configPath, "utf8").catch(() => "");
if (!/"mode": "production"/u.test(config)) {
  failures.push("firebase-meta-config.js: production mode is not configured");
}
if (/"firebase": null/u.test(config)) {
  failures.push("firebase-meta-config.js: Firebase config is missing");
}
if (!/"emulator": null/u.test(config)) {
  failures.push("firebase-meta-config.js: active Emulator config found");
}

const environmentPath = join(
  root,
  "dist",
  "meta",
  "integration",
  "environment.js"
);
const environment = await readFile(environmentPath, "utf8").catch(() => "");
for (const marker of [
  "LocalStorageEvidenceRepository",
  "beyblade-meta-development-evidence-v1",
  "createEvidenceDevCatalog",
  "EVIDENCE_SEED_DRAFTS"
]) {
  if (environment.includes(marker)) {
    failures.push(
      `dist/meta/integration/environment.js: production fallback marker '${marker}' found`
    );
  }
}

if (failures.length > 0) {
  console.error("Release artifact verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Release artifact verified: ${files.length} files, no Seed, source maps, private credentials, or LocalStorage Meta fallback.`
  );
}
