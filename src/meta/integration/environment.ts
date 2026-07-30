import {
  InMemoryMetaProfileRepository,
  type MetaProfileRepository
} from "../confidence/index.js";
import {
  validateDomainModel,
  type MetaProfile
} from "../domain/index.js";
import { EvidenceService } from "../evidence/service.js";
import {
  type EvidenceEntryParser,
  type EvidenceRepository,
  type KeyValueStorage
} from "../evidence/repository.js";
import { validateEvidenceEntry } from "../evidence/validation.js";
import {
  FirebaseEvidenceRepository,
  FirebaseMetaProfileRepository,
  FirebaseRepositoryError,
  UnavailableEvidenceRepository,
  accessFor,
  normalizeFirebaseError,
  type FirebaseAuthPort,
  type FirebaseRepositoryStatus,
  type MetaAccess,
  type MetaFirebaseConfig,
  type MetaFirebaseRuntimeFactory,
  type RuntimeParser
} from "../firebase/index.js";
import {
  FullAnalysisPipelineService,
  FullAnalysisViewModel,
  createPhase5AnalysisModelRegistry
} from "../full-analysis/index.js";
import { createFormalEntityCatalog } from "./catalog.js";
import type {
  FormalEntityCatalog,
  MetaDataMode,
  MetaEnvironmentStatus,
  MetaLocationSelection
} from "./types.js";

export interface MetaEnvironment {
  readonly catalog: FormalEntityCatalog;
  readonly evidenceRepository: EvidenceRepository;
  readonly evidenceService: EvidenceService;
  readonly pipeline: FullAnalysisViewModel;
  readonly profileRepository: MetaProfileRepository | null;
  readonly auth: FirebaseAuthPort | null;
  readonly access: MetaAccess;
  readonly status: MetaEnvironmentStatus;
}

export interface MetaFirebaseEnvironmentOptions {
  readonly config: MetaFirebaseConfig;
  readonly runtimeFactory: MetaFirebaseRuntimeFactory | null;
}

export function parseMetaLocation(search: string): MetaLocationSelection {
  const params = new URLSearchParams(search);
  const entityId = params.get("entityId")?.trim() ?? "";
  const alias = (params.get("name") ?? params.get("q"))?.trim() ?? "";
  return {
    entityId: entityId.length > 0 ? entityId : null,
    alias: alias.length > 0 ? alias : null,
    requestedDevelopmentMode: params.get("mode") === "development"
  };
}

export function resolveMetaDataMode(
  hostname: string,
  requestedDevelopmentMode: boolean,
  configuredMode: MetaDataMode = "preview"
): MetaDataMode {
  const localHost =
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "[::1]";
  if (localHost && requestedDevelopmentMode) return "development";
  return configuredMode === "development" ? "preview" : configuredMode;
}

function evidenceParser(
  catalog: FormalEntityCatalog
): EvidenceEntryParser {
  return value => {
    const result = validateEvidenceEntry(value, catalog.entities);
    return result.success
      ? { success: true, data: result.data }
      : {
          success: false,
          messages: result.issues.map(
            issue => `${issue.path}: ${issue.message}`
          )
        };
  };
}

function profileParser(
  models: ReturnType<typeof createPhase5AnalysisModelRegistry>
): RuntimeParser<MetaProfile> {
  return value => {
    const result = validateDomainModel(
      "MetaProfile",
      value,
      { analysisModels: models }
    );
    return result.success
      ? { success: true, data: result.data }
      : {
          success: false,
          messages: result.issues.map(
            issue => `${issue.path}: ${issue.message}`
          )
        };
  };
}

function unavailable(
  error: FirebaseRepositoryError
): {
  readonly evidenceRepository: EvidenceRepository;
  readonly profileRepository: null;
  readonly auth: null;
  readonly access: MetaAccess;
  readonly repositoryStatus: FirebaseRepositoryStatus;
  readonly warnings: readonly string[];
} {
  return {
    evidenceRepository: new UnavailableEvidenceRepository(error),
    profileRepository: null,
    auth: null,
    access: accessFor(null, [], "preview"),
    repositoryStatus: error.code === "missing-config"
      ? "missing-config"
      : error.code === "offline"
        ? "offline"
        : "repository-error",
    warnings: [error.message]
  };
}

export async function createMetaEnvironment(
  database: unknown,
  mode: MetaDataMode,
  storage?: KeyValueStorage,
  firebaseOptions?: MetaFirebaseEnvironmentOptions
): Promise<MetaEnvironment> {
  const development =
    mode === "development"
      ? await import("./development-environment.js")
      : null;
  const developmentCatalog = development?.createDevelopmentCatalog() ?? null;
  const catalog = createFormalEntityCatalog(
    database,
    developmentCatalog?.items ?? []
  );
  const models = createPhase5AnalysisModelRegistry();
  let evidenceRepository: EvidenceRepository;
  let profileRepository: MetaProfileRepository | null = null;
  let auth: FirebaseAuthPort | null = null;
  let access: MetaAccess;
  let repositoryStatus: FirebaseRepositoryStatus = "ready";
  let warnings: readonly string[];

  if (mode === "development" && development !== null) {
    const result = await development.createDevelopmentEvidenceRepository(
      catalog,
      evidenceParser(catalog),
      storage
    );
    evidenceRepository = result.repository;
    warnings = result.warnings;
    access = accessFor(null, [], "development");
  } else {
    const config = firebaseOptions?.config;
    const factory = firebaseOptions?.runtimeFactory;
    if (
      config === undefined ||
      config.firebase === null ||
      factory === null ||
      factory === undefined
    ) {
      const result = unavailable(
        new FirebaseRepositoryError(
          "missing-config",
          "缺少正式 Firebase 公開設定，Meta 資料目前不可讀寫。"
        )
      );
      evidenceRepository = result.evidenceRepository;
      profileRepository = result.profileRepository;
      auth = result.auth;
      access = result.access;
      repositoryStatus = result.repositoryStatus;
      warnings = result.warnings;
    } else {
      try {
        const runtime = await factory.create(
          config.firebase,
          config.emulator
        );
        const principal = await runtime.auth.getPrincipal();
        auth = runtime.auth;
        access = accessFor(principal, config.adminUids, mode);
        evidenceRepository = new FirebaseEvidenceRepository(
          runtime.firestore,
          evidenceParser(catalog)
        );
        profileRepository = new FirebaseMetaProfileRepository(
          runtime.firestore,
          profileParser(models)
        );
        repositoryStatus = principal === null ? "unauthenticated" : "ready";
        warnings = principal === null
          ? ["請先登入 Google 帳號以讀取正式 Meta 資料。"]
          : [];
      } catch (error) {
        const result = unavailable(normalizeFirebaseError(error));
        evidenceRepository = result.evidenceRepository;
        profileRepository = result.profileRepository;
        auth = result.auth;
        access = result.access;
        repositoryStatus = result.repositoryStatus;
        warnings = result.warnings;
      }
    }
  }

  const evidenceService = new EvidenceService(
    evidenceRepository,
    catalog.entities
  );
  const pipelineService = new FullAnalysisPipelineService(
    evidenceRepository,
    new InMemoryMetaProfileRepository(),
    models,
    catalog.entities
  );
  const status: MetaEnvironmentStatus =
    mode === "development"
      ? {
          mode,
          label: "開發模式",
          description:
            "使用開發 Seed 與專用 LocalStorage，不會連線正式 Firebase。",
          persistent: storage !== undefined && warnings.length === 0,
          seedEnabled: true,
          repositoryStatus,
          access,
          warnings
        }
      : {
          mode,
          label: mode === "production" ? "正式 Firebase" : "Firebase 預覽",
          description:
            "使用 Firebase Repository；不載入 Seed，也不以 LocalStorage 假裝正式持久化。",
          persistent: repositoryStatus === "ready",
          seedEnabled: false,
          repositoryStatus,
          access,
          warnings
        };

  return {
    catalog,
    evidenceRepository,
    evidenceService,
    pipeline: new FullAnalysisViewModel(pipelineService),
    profileRepository,
    auth,
    access,
    status
  };
}
