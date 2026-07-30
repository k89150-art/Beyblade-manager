import type {
  CanonicalEntityId,
  CatalogEntity,
  MetaProfile
} from "../domain/index.js";
import type { MetaProfileRepository } from "../confidence/index.js";
import {
  entityQuery,
  type EvidenceEntry,
  type EvidenceQuery,
  type EvidenceRepository
} from "../evidence/index.js";
import type { FormalEntityCatalog } from "../integration/index.js";
import {
  FirebaseRepositoryError,
  normalizeFirebaseError
} from "./errors.js";
import {
  fromFirestoreWire,
  toFirestoreWire
} from "./serialization.js";
import type {
  FirestoreDocumentData,
  FirestorePort,
  FirestoreWrite,
  RuntimeParser
} from "./types.js";

const EVIDENCE_COLLECTION = "metaEvidence";
const PROFILE_COLLECTION = "metaProfiles";
const ANALYSIS_RESULTS_COLLECTION = "analysisResults";
const ENVELOPE_VERSION = 1;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function eventTime(entry: EvidenceEntry): number {
  return Date.parse(`${entry.record.eventDate}T00:00:00Z`);
}

function evidenceEntityId(entry: EvidenceEntry): CanonicalEntityId {
  if (entry.target.targetType !== "entity") {
    throw new FirebaseRepositoryError(
      "invalid-data",
      "Firebase Evidence 只接受 Entity target。"
    );
  }
  return entry.target.entityId;
}

function evidenceEnvelope(entry: EvidenceEntry): FirestoreDocumentData {
  return {
    schemaVersion: ENVELOPE_VERSION,
    evidenceId: entry.record.id,
    entityId: evidenceEntityId(entry),
    lifecycleStatus: "active",
    dataMode: "production",
    eventDate: entry.record.eventDate,
    createdAt: toFirestoreWire(entry.record.createdAt),
    payload: toFirestoreWire(entry)
  };
}

function profileEnvelope(profile: MetaProfile): FirestoreDocumentData {
  if (profile.targetType !== "entity") {
    throw new FirebaseRepositoryError(
      "invalid-data",
      "Firebase MetaProfile 只接受 Entity target。"
    );
  }
  return {
    schemaVersion: ENVELOPE_VERSION,
    profileId: profile.id,
    entityId: profile.entityId,
    analysisRunId: profile.analysisRunId,
    lifecycleStatus: "active",
    dataMode: "production",
    currentAt: toFirestoreWire(profile.currentAt),
    payload: toFirestoreWire(profile)
  };
}

function analysisDate(
  sourceSnapshotId: string,
  generatedAt: string
): string {
  const match = sourceSnapshotId.match(/(\d{4}-\d{2}-\d{2})$/u);
  return match?.[1] ?? generatedAt.slice(0, 10);
}

function safeDocumentToken(value: string): string {
  return encodeURIComponent(value).replaceAll("%", "_");
}

function analysisResultDocumentId(
  entityId: string,
  modelId: string,
  modelVersion: string,
  date: string
): string {
  return [
    safeDocumentToken(entityId),
    date,
    safeDocumentToken(modelId),
    safeDocumentToken(modelVersion)
  ].join("__");
}

function analysisResultWrites(profile: MetaProfile): readonly FirestoreWrite[] {
  if (profile.targetType !== "entity") return [];
  const collectionPath =
    `${PROFILE_COLLECTION}/${profile.entityId}/${ANALYSIS_RESULTS_COLLECTION}`;
  return profile.analysisResults.map((result) => {
    const date = analysisDate(result.sourceSnapshotId, result.generatedAt);
    return {
      operation: "upsert",
      collectionPath,
      documentId: analysisResultDocumentId(
        profile.entityId,
        result.modelId,
        result.modelVersion,
        date
      ),
      data: {
        schemaVersion: ENVELOPE_VERSION,
        entityId: profile.entityId,
        analysisDate: date,
        modelId: result.modelId,
        modelVersion: result.modelVersion,
        generatedAt: toFirestoreWire(result.generatedAt),
        lifecycleStatus: "active",
        dataMode: "production",
        traceReferences: [profile.analysisRunId, result.sourceSnapshotId],
        payload: toFirestoreWire(result)
      }
    };
  });
}

function payloadFromEnvelope(value: unknown, documentId: string): unknown {
  const envelope = record(value);
  if (
    envelope === null ||
    envelope.schemaVersion !== ENVELOPE_VERSION ||
    !Object.hasOwn(envelope, "payload")
  ) {
    throw new FirebaseRepositoryError(
      "invalid-data",
      `Firestore 文件 '${documentId}' 的 envelope 不合法。`
    );
  }
  return fromFirestoreWire(envelope.payload);
}

export class FirebaseEvidenceRepository implements EvidenceRepository {
  readonly #port: FirestorePort;
  readonly #parse: RuntimeParser<EvidenceEntry>;

  constructor(port: FirestorePort, parse: RuntimeParser<EvidenceEntry>) {
    this.#port = port;
    this.#parse = parse;
  }

  async add(entry: EvidenceEntry): Promise<void> {
    const validated = this.#parse(entry);
    if (!validated.success) {
      throw new FirebaseRepositoryError(
        "invalid-data",
        "Evidence 寫入前 Runtime Validation 失敗。",
        false,
        validated.messages
      );
    }
    try {
      await this.#port.createDocument(
        EVIDENCE_COLLECTION,
        validated.data.record.id,
        evidenceEnvelope(validated.data)
      );
    } catch (error) {
      throw normalizeFirebaseError(error);
    }
  }

  async getById(id: string): Promise<EvidenceEntry | undefined> {
    try {
      const snapshot = await this.#port.getDocument(EVIDENCE_COLLECTION, id);
      if (snapshot === undefined) return undefined;
      return this.#parseSnapshot(snapshot.id, snapshot.data);
    } catch (error) {
      throw normalizeFirebaseError(error);
    }
  }

  async list(query: EvidenceQuery = {}): Promise<readonly EvidenceEntry[]> {
    try {
      const snapshots = await this.#port.listDocuments(
        EVIDENCE_COLLECTION,
        query.entityId === undefined
          ? undefined
          : { field: "entityId", value: query.entityId }
      );
      const entries = snapshots.map((snapshot) =>
        this.#parseSnapshot(snapshot.id, snapshot.data)
      );
      const direction = query.sortDirection === "ascending" ? 1 : -1;
      return entries.sort(
        (left, right) => direction * (eventTime(left) - eventTime(right))
      );
    } catch (error) {
      throw normalizeFirebaseError(error);
    }
  }

  #parseSnapshot(id: string, value: unknown): EvidenceEntry {
    const payload = payloadFromEnvelope(value, id);
    const parsed = this.#parse(payload);
    if (!parsed.success) {
      throw new FirebaseRepositoryError(
        "invalid-data",
        `Firestore Evidence '${id}' 讀取後驗證失敗。`,
        false,
        parsed.messages
      );
    }
    if (parsed.data.record.id !== id) {
      throw new FirebaseRepositoryError(
        "invalid-data",
        `Firestore Evidence '${id}' 的 Evidence ID 不一致。`
      );
    }
    return structuredClone(parsed.data);
  }
}

export class UnavailableEvidenceRepository implements EvidenceRepository {
  readonly #error: FirebaseRepositoryError;

  constructor(error: FirebaseRepositoryError) {
    this.#error = error;
  }

  async add(): Promise<void> {
    throw this.#error;
  }

  async getById(): Promise<undefined> {
    throw this.#error;
  }

  async list(): Promise<readonly EvidenceEntry[]> {
    throw this.#error;
  }
}

export class FirebaseMetaProfileRepository
implements MetaProfileRepository {
  readonly #port: FirestorePort;
  readonly #parse: RuntimeParser<MetaProfile>;

  constructor(port: FirestorePort, parse: RuntimeParser<MetaProfile>) {
    this.#port = port;
    this.#parse = parse;
  }

  async getByEntityId(
    entityId: CanonicalEntityId
  ): Promise<MetaProfile | undefined> {
    try {
      const snapshot = await this.#port.getDocument(
        PROFILE_COLLECTION,
        entityId
      );
      if (snapshot === undefined) return undefined;
      const payload = payloadFromEnvelope(snapshot.data, snapshot.id);
      const parsed = this.#parse(payload);
      if (!parsed.success) {
        throw new FirebaseRepositoryError(
          "invalid-data",
          `Firestore MetaProfile '${entityId}' 讀取後驗證失敗。`,
          false,
          parsed.messages
        );
      }
      if (
        parsed.data.targetType !== "entity" ||
        parsed.data.entityId !== entityId
      ) {
        throw new FirebaseRepositoryError(
          "invalid-data",
          `Firestore MetaProfile '${entityId}' 的 Entity ID 不一致。`
        );
      }
      return structuredClone(parsed.data);
    } catch (error) {
      throw normalizeFirebaseError(error);
    }
  }

  async save(profile: MetaProfile): Promise<void> {
    const parsed = this.#parse(profile);
    if (!parsed.success) {
      throw new FirebaseRepositoryError(
        "invalid-data",
        "MetaProfile 寫入前 Runtime Validation 失敗。",
        false,
        parsed.messages
      );
    }
    if (parsed.data.targetType !== "entity") {
      throw new FirebaseRepositoryError(
        "invalid-data",
        "Firebase MetaProfile 只接受 Entity target。"
      );
    }
    const writes: FirestoreWrite[] = [
      {
        operation: "upsert",
        collectionPath: PROFILE_COLLECTION,
        documentId: parsed.data.entityId,
        data: profileEnvelope(parsed.data)
      },
      ...analysisResultWrites(parsed.data)
    ];
    try {
      await this.#port.commit(writes);
    } catch (error) {
      throw normalizeFirebaseError(error);
    }
  }
}

export class FormalCatalogEntityReader {
  readonly #catalog: FormalEntityCatalog;

  constructor(catalog: FormalEntityCatalog) {
    this.#catalog = catalog;
  }

  get(entityId: CanonicalEntityId): CatalogEntity {
    const entity = this.#catalog.entities.get(entityId);
    if (entity === undefined) {
      throw new FirebaseRepositoryError(
        "entity-not-found",
        `找不到 Entity '${entityId}'。`
      );
    }
    return entity;
  }
}

export function firebaseEntityQuery(
  entityId: CanonicalEntityId,
  sortDirection: "ascending" | "descending" = "descending"
): EvidenceQuery {
  return entityQuery(entityId, sortDirection);
}
