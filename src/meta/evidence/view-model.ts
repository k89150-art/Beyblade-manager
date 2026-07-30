import type { CanonicalEntityId, ValidationIssue } from "../domain/index.js";
import { EvidenceRepositoryError } from "./repository.js";
import {
  EvidenceService,
  EvidenceValidationError
} from "./service.js";
import type {
  EvidenceCreateDraft,
  EvidenceViewState
} from "./types.js";

const CANONICAL_ENTITY_ID_PATTERN =
  /^ent_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isCanonicalEntityId(value: string): value is CanonicalEntityId {
  return CANONICAL_ENTITY_ID_PATTERN.test(value);
}

export class EvidenceViewModel {
  readonly #service: EvidenceService;
  #filterEntityId = "";
  #entries: EvidenceViewState["entries"] = [];
  #errors: readonly ValidationIssue[] = [];
  #loading = false;

  constructor(service: EvidenceService) {
    this.#service = service;
  }

  get state(): EvidenceViewState {
    return {
      entries: this.#entries,
      filterEntityId: this.#filterEntityId,
      errors: this.#errors,
      loading: this.#loading
    };
  }

  async initialize(): Promise<EvidenceViewState> {
    return this.#refresh();
  }

  async setFilter(entityId: string): Promise<EvidenceViewState> {
    this.#filterEntityId = entityId;
    return this.#refresh();
  }

  async submit(draft: EvidenceCreateDraft): Promise<EvidenceViewState> {
    this.#loading = true;
    this.#errors = [];
    try {
      await this.#service.create(draft);
    } catch (error) {
      if (error instanceof EvidenceValidationError) {
        this.#errors = error.issues;
      } else if (error instanceof EvidenceRepositoryError) {
        this.#errors = [
          {
            path: "EvidenceRepository",
            code: "repository_error",
            message: error.message
          }
        ];
      } else {
        throw error;
      }
    } finally {
      this.#loading = false;
    }
    return this.#refresh(false);
  }

  async #refresh(clearErrors = true): Promise<EvidenceViewState> {
    this.#loading = true;
    if (clearErrors) {
      this.#errors = [];
    }
    try {
      const query = isCanonicalEntityId(this.#filterEntityId)
        ? {
            entityId: this.#filterEntityId,
            sortDirection: "descending" as const
          }
        : { sortDirection: "descending" as const };
      this.#entries = await this.#service.list(query);
    } finally {
      this.#loading = false;
    }
    return this.state;
  }
}
