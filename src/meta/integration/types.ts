import type {
  CanonicalEntityId,
  CatalogEntity,
  IsoDate
} from "../domain/index.js";
import type { EvidenceCreateDraft, EvidenceEntry } from "../evidence/index.js";
import type {
  FullAnalysisResult,
  PipelineStage
} from "../full-analysis/index.js";
import type {
  FirebaseAuthPort,
  FirebaseRepositoryStatus,
  MetaAccess
} from "../firebase/index.js";

export type MetaDataMode = "development" | "preview" | "production";

export interface FormalEntitySummary {
  readonly entity: CatalogEntity;
  readonly model: string;
  readonly series: readonly string[];
  readonly entityTypeLabel: string;
  readonly role: string | null;
  readonly tier: string | null;
  readonly relatedParts: readonly string[];
  readonly imageUrl: string | null;
}

export interface FormalEntityCatalog {
  readonly summaries: readonly FormalEntitySummary[];
  readonly entities: import("../domain/index.js").CatalogEntityRegistry;
  findById(entityId: CanonicalEntityId): FormalEntitySummary | undefined;
  findByAlias(alias: string): readonly FormalEntitySummary[];
  search(query: string): readonly FormalEntitySummary[];
}

export interface MetaEnvironmentStatus {
  readonly mode: MetaDataMode;
  readonly label: string;
  readonly description: string;
  readonly persistent: boolean;
  readonly seedEnabled: boolean;
  readonly repositoryStatus: FirebaseRepositoryStatus;
  readonly access: MetaAccess;
  readonly warnings: readonly string[];
}

export type MetaPersistenceStatus =
  | "not-calculated"
  | "preview-only"
  | "saved"
  | "save-failed";

export type MetaDashboardStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error";

export interface MetaDashboardState {
  readonly status: MetaDashboardStatus;
  readonly selectedEntity: FormalEntitySummary | null;
  readonly analysisDate: IsoDate;
  readonly evidence: readonly EvidenceEntry[];
  readonly result: FullAnalysisResult | null;
  readonly failedStage: PipelineStage | null;
  readonly persistenceStatus: MetaPersistenceStatus;
  readonly persistenceMessage: string;
  readonly errors: readonly string[];
}

export interface MetaLocationSelection {
  readonly entityId: string | null;
  readonly alias: string | null;
  readonly requestedDevelopmentMode: boolean;
}

export interface MetaAuthenticationActions {
  readonly auth: FirebaseAuthPort | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

export interface MetaDashboardActions {
  selectEntity(entityId: string): Promise<MetaDashboardState>;
  setAnalysisDate(value: string): MetaDashboardState;
  loadEvidence(): Promise<MetaDashboardState>;
  addEvidence(draft: EvidenceCreateDraft): Promise<MetaDashboardState>;
  runAnalysis(): Promise<MetaDashboardState>;
}
