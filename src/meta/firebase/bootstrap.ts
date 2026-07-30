import { FirebaseRepositoryError } from "./errors.js";
import type {
  FirebaseMetaMode,
  FirebaseWebConfig,
  MetaAccess,
  MetaFirebaseConfig,
  MetaFirebaseRuntimeFactory,
  MetaPrincipal
} from "./types.js";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function webConfig(value: unknown): FirebaseWebConfig | null {
  const candidate = record(value);
  if (candidate === null) return null;
  const apiKey = text(candidate.apiKey);
  const authDomain = text(candidate.authDomain);
  const projectId = text(candidate.projectId);
  const appId = text(candidate.appId);
  if (
    apiKey === null ||
    authDomain === null ||
    projectId === null ||
    appId === null
  ) {
    throw new FirebaseRepositoryError(
      "missing-config",
      "Firebase 公開設定缺少 apiKey、authDomain、projectId 或 appId。"
    );
  }
  const storageBucket = text(candidate.storageBucket);
  const messagingSenderId = text(candidate.messagingSenderId);
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    ...(storageBucket === null ? {} : { storageBucket }),
    ...(messagingSenderId === null ? {} : { messagingSenderId })
  };
}

export function readMetaFirebaseConfig(value: unknown): MetaFirebaseConfig {
  const candidate = record(value);
  if (candidate === null) {
    throw new FirebaseRepositoryError(
      "missing-config",
      "找不到 Meta Firebase 公開設定。"
    );
  }
  const mode = candidate.mode;
  if (
    mode !== "development" &&
    mode !== "preview" &&
    mode !== "production"
  ) {
    throw new FirebaseRepositoryError(
      "missing-config",
      "Meta Firebase mode 必須是 development、preview 或 production。"
    );
  }
  if (mode !== "development" && candidate.firebase == null) {
    throw new FirebaseRepositoryError(
      "missing-config",
      "Preview／Production 模式必須提供 Firebase 公開設定。"
    );
  }
  if (
    !Array.isArray(candidate.adminUids) ||
    !candidate.adminUids.every(
      item => typeof item === "string" && item.trim().length > 0
    )
  ) {
    throw new FirebaseRepositoryError(
      "missing-config",
      "Meta Firebase adminUids 格式不合法。"
    );
  }
  if (mode !== "development" && candidate.adminUids.length === 0) {
    throw new FirebaseRepositoryError(
      "missing-config",
      "Preview／Production 模式必須設定至少一個授權 UID。"
    );
  }
  const emulatorCandidate = record(candidate.emulator);
  const emulator = emulatorCandidate === null
    ? null
    : {
        firestoreHost:
          text(emulatorCandidate.firestoreHost) ?? "127.0.0.1",
        firestorePort:
          typeof emulatorCandidate.firestorePort === "number" &&
          Number.isInteger(emulatorCandidate.firestorePort)
            ? emulatorCandidate.firestorePort
            : 8080,
        authUrl:
          text(emulatorCandidate.authUrl) ?? "http://127.0.0.1:9099"
      };
  return {
    mode,
    firebase: candidate.firebase === null
      ? null
      : webConfig(candidate.firebase),
    adminUids: candidate.adminUids.map(item => item.trim()),
    emulator
  };
}

export function globalMetaFirebaseConfig(): MetaFirebaseConfig {
  return readMetaFirebaseConfig(globalThis.__META_FIREBASE_CONFIG__);
}

export function globalMetaFirebaseRuntimeFactory():
MetaFirebaseRuntimeFactory | null {
  return globalThis.__META_FIREBASE_RUNTIME_FACTORY__ ?? null;
}

export function accessFor(
  principal: MetaPrincipal | null,
  adminUids: readonly string[],
  mode: FirebaseMetaMode
): MetaAccess {
  if (mode === "development") {
    return {
      authenticated: principal !== null,
      canRead: true,
      canWriteEvidence: true,
      canSaveAnalysis: false,
      principal
    };
  }
  const authorized =
    principal !== null && adminUids.includes(principal.uid);
  return {
    authenticated: principal !== null,
    canRead: principal !== null,
    canWriteEvidence: authorized,
    canSaveAnalysis: authorized,
    principal
  };
}
