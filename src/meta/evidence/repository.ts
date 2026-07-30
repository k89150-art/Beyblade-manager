import type { CanonicalEntityId } from "../domain/index.js";
import type { EvidenceEntry, EvidenceQuery } from "./types.js";
import { entityIdFromEntry } from "./validation.js";

export interface EvidenceRepository {
  add(entry: EvidenceEntry): Promise<void>;
  getById(id: string): Promise<EvidenceEntry | undefined>;
  list(query?: EvidenceQuery): Promise<readonly EvidenceEntry[]>;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type EvidenceEntryParser = (
  value: unknown
) =>
  | { readonly success: true; readonly data: EvidenceEntry }
  | { readonly success: false; readonly messages: readonly string[] };

export class EvidenceRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceRepositoryError";
  }
}

function snapshot(entry: EvidenceEntry): EvidenceEntry {
  return structuredClone(entry);
}

function eventTime(entry: EvidenceEntry): number {
  return Date.parse(`${entry.record.eventDate}T00:00:00Z`);
}

function queryEntries(
  entries: readonly EvidenceEntry[],
  query: EvidenceQuery = {}
): readonly EvidenceEntry[] {
  const filtered =
    query.entityId === undefined
      ? entries
      : entries.filter(
          (entry) => entityIdFromEntry(entry) === query.entityId
        );
  const direction = query.sortDirection === "ascending" ? 1 : -1;
  return filtered
    .map(snapshot)
    .sort((left, right) => direction * (eventTime(left) - eventTime(right)));
}

export class InMemoryEvidenceRepository implements EvidenceRepository {
  readonly #entries = new Map<string, EvidenceEntry>();

  constructor(seedEntries: readonly EvidenceEntry[] = []) {
    seedEntries.forEach((entry) => {
      if (this.#entries.has(entry.record.id)) {
        throw new EvidenceRepositoryError(
          `Duplicate Evidence ID '${entry.record.id}' in seed data.`
        );
      }
      this.#entries.set(entry.record.id, snapshot(entry));
    });
  }

  async add(entry: EvidenceEntry): Promise<void> {
    if (this.#entries.has(entry.record.id)) {
      throw new EvidenceRepositoryError(
        `Evidence '${entry.record.id}' already exists.`
      );
    }
    this.#entries.set(entry.record.id, snapshot(entry));
  }

  async getById(id: string): Promise<EvidenceEntry | undefined> {
    const entry = this.#entries.get(id);
    return entry === undefined ? undefined : snapshot(entry);
  }

  async list(query: EvidenceQuery = {}): Promise<readonly EvidenceEntry[]> {
    return queryEntries([...this.#entries.values()], query);
  }
}

export class LocalStorageEvidenceRepository implements EvidenceRepository {
  readonly #storage: KeyValueStorage;
  readonly #storageKey: string;
  readonly #parseEntry: EvidenceEntryParser;

  constructor(
    storage: KeyValueStorage,
    storageKey: string,
    parseEntry: EvidenceEntryParser
  ) {
    this.#storage = storage;
    this.#storageKey = storageKey;
    this.#parseEntry = parseEntry;
  }

  async add(entry: EvidenceEntry): Promise<void> {
    const entries = this.#readAll();
    if (entries.some((candidate) => candidate.record.id === entry.record.id)) {
      throw new EvidenceRepositoryError(
        `Evidence '${entry.record.id}' already exists.`
      );
    }
    entries.push(snapshot(entry));
    this.#writeAll(entries);
  }

  async getById(id: string): Promise<EvidenceEntry | undefined> {
    const entry = this.#readAll().find(
      (candidate) => candidate.record.id === id
    );
    return entry === undefined ? undefined : snapshot(entry);
  }

  async list(query: EvidenceQuery = {}): Promise<readonly EvidenceEntry[]> {
    return queryEntries(this.#readAll(), query);
  }

  #readAll(): EvidenceEntry[] {
    const serialized = this.#storage.getItem(this.#storageKey);
    if (serialized === null) {
      return [];
    }

    let value: unknown;
    try {
      value = JSON.parse(serialized);
    } catch {
      throw new EvidenceRepositoryError(
        "Stored Evidence data is not valid JSON."
      );
    }

    if (!Array.isArray(value)) {
      throw new EvidenceRepositoryError(
        "Stored Evidence data must be an array."
      );
    }

    return value.map((candidate, index) => {
      const result = this.#parseEntry(candidate);
      if (!result.success) {
        throw new EvidenceRepositoryError(
          `Stored Evidence item ${index} is invalid: ${result.messages.join(" ")}`
        );
      }
      return snapshot(result.data);
    });
  }

  #writeAll(entries: readonly EvidenceEntry[]): void {
    this.#storage.setItem(this.#storageKey, JSON.stringify(entries));
  }
}

export function entityQuery(
  entityId: CanonicalEntityId,
  sortDirection: "ascending" | "descending" = "descending"
): EvidenceQuery {
  return { entityId, sortDirection };
}
