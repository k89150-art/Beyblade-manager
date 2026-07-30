import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

function required(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

const output = resolve(argument("--output", "firebase-meta-config.js"));
const mode = argument("--mode", process.env.META_DATA_MODE || "preview");
if (!["development", "preview", "production"].includes(mode)) {
  throw new Error(`Unsupported META_DATA_MODE '${mode}'.`);
}

const firebase = mode === "development" && !process.env.FIREBASE_PROJECT_ID
  ? null
  : {
      apiKey: required("FIREBASE_API_KEY"),
      authDomain: required("FIREBASE_AUTH_DOMAIN"),
      projectId: required("FIREBASE_PROJECT_ID"),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
      messagingSenderId:
        process.env.FIREBASE_MESSAGING_SENDER_ID || undefined,
      appId: required("FIREBASE_APP_ID")
    };

const adminUids = (process.env.META_ADMIN_UIDS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

if (mode !== "development" && adminUids.length === 0) {
  throw new Error("META_ADMIN_UIDS must contain at least one authorized UID.");
}

const emulator = process.env.FIRESTORE_EMULATOR_HOST
  ? {
      firestoreHost:
        process.env.FIRESTORE_EMULATOR_HOST.split(":")[0] || "127.0.0.1",
      firestorePort: Number(
        process.env.FIRESTORE_EMULATOR_HOST.split(":")[1] || "8080"
      ),
      authUrl:
        process.env.FIREBASE_AUTH_EMULATOR_URL || "http://127.0.0.1:9099"
    }
  : null;

const serialized = JSON.stringify(
  { mode, firebase, adminUids, emulator },
  null,
  2
);
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  `globalThis.__META_FIREBASE_CONFIG__ = Object.freeze(${serialized});\n`,
  "utf8"
);
console.log(`Generated public Meta Firebase config: ${output}`);
