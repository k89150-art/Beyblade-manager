import type { JsonValue } from "../domain/index.js";

export type FirebaseMetaMode = "development" | "preview" | "production";

export interface FirebaseWebConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly storageBucket?: string;
  readonly messagingSenderId?: string;
  readonly appId: string;
}

export interface FirebaseEmulatorConfig {
  readonly firestoreHost: string;
  readonly firestorePort: number;
  readonly authUrl: string;
}

export interface MetaFirebaseConfig {
  readonly mode: FirebaseMetaMode;
  readonly firebase: FirebaseWebConfig | null;
  readonly adminUids: readonly string[];
  readonly emulator: FirebaseEmulatorConfig | null;
}

export interface MetaPrincipal {
  readonly uid: string;
  readonly email: string | null;
}

export interface MetaAccess {
  readonly authenticated: boolean;
  readonly canRead: boolean;
  readonly canWriteEvidence: boolean;
  readonly canSaveAnalysis: boolean;
  readonly principal: MetaPrincipal | null;
}

export interface FirestoreTimestampWire {
  readonly __firestoreType: "timestamp";
  readonly iso: string;
}

export type FirestoreWireValue =
  | JsonValue
  | FirestoreTimestampWire
  | readonly FirestoreWireValue[]
  | { readonly [key: string]: FirestoreWireValue };

export interface FirestoreDocumentData {
  readonly [key: string]: FirestoreWireValue;
}

export interface FirestoreDocumentSnapshot {
  readonly id: string;
  readonly data: unknown;
}

export interface FirestoreQueryFilter {
  readonly field: string;
  readonly value: string;
}

export interface FirestoreWrite {
  readonly operation: "upsert";
  readonly collectionPath: string;
  readonly documentId: string;
  readonly data: FirestoreDocumentData;
}

export interface FirestorePort {
  createDocument(
    collectionPath: string,
    documentId: string,
    data: FirestoreDocumentData
  ): Promise<void>;
  getDocument(
    collectionPath: string,
    documentId: string
  ): Promise<FirestoreDocumentSnapshot | undefined>;
  listDocuments(
    collectionPath: string,
    filter?: FirestoreQueryFilter
  ): Promise<readonly FirestoreDocumentSnapshot[]>;
  commit(writes: readonly FirestoreWrite[]): Promise<void>;
}

export interface FirebaseAuthPort {
  getPrincipal(): Promise<MetaPrincipal | null>;
  signInWithGoogle(): Promise<MetaPrincipal>;
  signOut(): Promise<void>;
}

export interface MetaFirebaseRuntime {
  readonly firestore: FirestorePort;
  readonly auth: FirebaseAuthPort;
}

export interface MetaFirebaseRuntimeFactory {
  create(
    config: FirebaseWebConfig,
    emulator: FirebaseEmulatorConfig | null
  ): Promise<MetaFirebaseRuntime>;
}

declare global {
  var __META_FIREBASE_CONFIG__: MetaFirebaseConfig | undefined;
  var __META_FIREBASE_RUNTIME_FACTORY__:
    | MetaFirebaseRuntimeFactory
    | undefined;
}

export type RuntimeParser<T> = (
  value: unknown
) =>
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly messages: readonly string[] };

export type FirebaseRepositoryStatus =
  | "ready"
  | "missing-config"
  | "unauthenticated"
  | "permission-denied"
  | "offline"
  | "invalid-data"
  | "repository-error";

export interface FirebaseOperationState {
  readonly status: FirebaseRepositoryStatus;
  readonly message: string;
  readonly retryable: boolean;
}
