import type {
  CanonicalEntityId,
  MetaProfile
} from "../domain/index.js";

export interface MetaProfileRepository {
  getByEntityId(entityId: CanonicalEntityId): Promise<MetaProfile | undefined>;
  save(profile: MetaProfile): Promise<void>;
}

function snapshot(profile: MetaProfile): MetaProfile {
  return structuredClone(profile);
}

export class InMemoryMetaProfileRepository
implements MetaProfileRepository {
  readonly #profiles = new Map<CanonicalEntityId, MetaProfile>();

  async getByEntityId(
    entityId: CanonicalEntityId
  ): Promise<MetaProfile | undefined> {
    const profile = this.#profiles.get(entityId);
    return profile === undefined ? undefined : snapshot(profile);
  }

  async save(profile: MetaProfile): Promise<void> {
    if (profile.targetType !== "entity") {
      throw new Error("Confidence MVP stores Entity Meta Profiles only.");
    }
    this.#profiles.set(profile.entityId, snapshot(profile));
  }
}
