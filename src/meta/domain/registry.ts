import type { ObjectSchema } from "./schema-types.js";
import type {
  AnalysisModelDefinition,
  BuildSystemDefinition,
  CanonicalEntityId,
  CatalogEntity,
  EntityTypeDefinition,
  JsonValue
} from "./types.js";
import {
  validateDomainModel,
  validateSchemaDefinition,
  validateSchemaValue,
  type AnalysisModelRegistryReader,
  type BuildSystemRegistryReader,
  type CatalogEntityRegistryReader,
  type DomainValidationContext,
  type EntityTypeRegistryReader,
  type RegistryResolution,
  type ValidationIssue,
  type ValidationResult
} from "./validation.js";

function registryKey(id: string, version: string): string {
  return `${id}\u0000${version}`;
}

function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || visited.has(value)) {
    return value;
  }

  visited.add(value);
  Reflect.ownKeys(value).forEach((key) => {
    deepFreeze(Reflect.get(value, key), visited);
  });
  Object.freeze(value);
  return value;
}

function immutableSnapshot<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function immutableList<T>(values: Iterable<T>): readonly T[] {
  return Object.freeze([...values]);
}

function versionsFor<T>(
  definitions: ReadonlyMap<string, T>,
  idFromDefinition: (definition: T) => string,
  versionFromDefinition: (definition: T) => string,
  id: string
): readonly string[] {
  return immutableList(
    [...definitions.values()]
      .filter((definition) => idFromDefinition(definition) === id)
      .map(versionFromDefinition)
      .sort()
  );
}

export class RegistryRegistrationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super(message);
    this.name = "RegistryRegistrationError";
    this.issues = issues;
  }
}

function assertRegistryOpen(registryName: string, sealed: boolean): void {
  if (!sealed) {
    return;
  }
  throw new RegistryRegistrationError(
    `${registryName} is sealed.`,
    registrationIssue(
      registryName,
      "registry_sealed",
      `${registryName} does not accept registrations after seal().`
    )
  );
}

function registrationIssue(
  path: string,
  code: string,
  message: string
): readonly ValidationIssue[] {
  return [{ path, code, message }];
}

export class EntityTypeRegistry implements EntityTypeRegistryReader {
  readonly #definitions = new Map<string, EntityTypeDefinition>();
  #sealed = false;

  get sealed(): boolean {
    return this.#sealed;
  }

  seal(): void {
    this.#sealed = true;
  }

  register(definition: EntityTypeDefinition): void {
    assertRegistryOpen("EntityTypeRegistry", this.#sealed);
    const validation = validateDomainModel(
      "EntityTypeDefinition",
      definition
    );
    if (!validation.success) {
      throw new RegistryRegistrationError(
        "Invalid Entity Type Definition.",
        validation.issues
      );
    }

    const snapshot = immutableSnapshot(validation.data);
    const key = registryKey(snapshot.typeId, snapshot.version);
    if (this.#definitions.has(key)) {
      throw new RegistryRegistrationError(
        "Duplicate Entity Type Definition.",
        registrationIssue(
          "EntityTypeDefinition",
          "duplicate_entity_type_definition",
          `Entity Type '${definition.typeId}' version ` +
            `'${definition.version}' is already registered.`
        )
      );
    }
    this.#definitions.set(key, snapshot);
  }

  list(): readonly EntityTypeDefinition[] {
    return immutableList(this.#definitions.values());
  }

  resolve(
    typeId: string,
    version: string
  ): RegistryResolution<EntityTypeDefinition> {
    const definition = this.#definitions.get(registryKey(typeId, version));
    if (definition !== undefined) {
      return definition.lifecycleStatus === "inactive"
        ? { status: "inactive", definition }
        : { status: "found", definition };
    }

    const availableVersions = versionsFor(
      this.#definitions,
      (candidate) => candidate.typeId,
      (candidate) => candidate.version,
      typeId
    );
    return availableVersions.length === 0
      ? { status: "unknown", availableVersions: [] }
      : { status: "version_mismatch", availableVersions };
  }
}

export interface RegisteredAnalysisSchema {
  readonly schemaId: string;
  readonly version: string;
  readonly schema: ObjectSchema;
}

export class AnalysisModelRegistry implements AnalysisModelRegistryReader {
  readonly #models = new Map<string, AnalysisModelDefinition>();
  readonly #schemas = new Map<string, RegisteredAnalysisSchema>();
  #sealed = false;

  get sealed(): boolean {
    return this.#sealed;
  }

  seal(): void {
    this.#sealed = true;
  }

  registerSchema(
    schemaId: string,
    version: string,
    schema: ObjectSchema
  ): void {
    assertRegistryOpen("AnalysisModelRegistry", this.#sealed);
    if (schemaId.length === 0 || version.length === 0) {
      throw new RegistryRegistrationError(
        "Invalid Analysis Schema identity.",
        registrationIssue(
          "AnalysisSchema",
          "invalid_analysis_schema_identity",
          "Analysis Schema ID and version must be non-empty."
        )
      );
    }

    const validation = validateSchemaDefinition(
      schema,
      `AnalysisSchema(${schemaId}@${version})`
    );
    if (!validation.success) {
      throw new RegistryRegistrationError(
        "Invalid Analysis Schema.",
        validation.issues
      );
    }

    const key = registryKey(schemaId, version);
    if (this.#schemas.has(key)) {
      throw new RegistryRegistrationError(
        "Duplicate Analysis Schema.",
        registrationIssue(
          "AnalysisSchema",
          "duplicate_analysis_schema",
          `Analysis Schema '${schemaId}' version '${version}' is already ` +
            "registered."
        )
      );
    }
    this.#schemas.set(
      key,
      immutableSnapshot({ schemaId, version, schema })
    );
  }

  registerModel(definition: AnalysisModelDefinition): void {
    assertRegistryOpen("AnalysisModelRegistry", this.#sealed);
    const validation = validateDomainModel(
      "AnalysisModelDefinition",
      definition
    );
    if (!validation.success) {
      throw new RegistryRegistrationError(
        "Invalid Analysis Model Definition.",
        validation.issues
      );
    }

    const missingSchemas: ValidationIssue[] = [];
    if (
      !this.#schemas.has(
        registryKey(
          definition.inputSchemaId,
          definition.inputSchemaVersion
        )
      )
    ) {
      missingSchemas.push({
        path: "AnalysisModelDefinition.inputSchemaId",
        code: "unknown_analysis_input_schema",
        message:
          `Input Schema '${definition.inputSchemaId}' version ` +
          `'${definition.inputSchemaVersion}' is not registered.`
      });
    }
    if (
      !this.#schemas.has(
        registryKey(
          definition.outputSchemaId,
          definition.outputSchemaVersion
        )
      )
    ) {
      missingSchemas.push({
        path: "AnalysisModelDefinition.outputSchemaId",
        code: "unknown_analysis_output_schema",
        message:
          `Output Schema '${definition.outputSchemaId}' version ` +
          `'${definition.outputSchemaVersion}' is not registered.`
      });
    }
    if (missingSchemas.length > 0) {
      throw new RegistryRegistrationError(
        "Analysis Model references an unknown Schema.",
        missingSchemas
      );
    }

    const snapshot = immutableSnapshot(validation.data);
    const key = registryKey(snapshot.modelId, snapshot.version);
    if (this.#models.has(key)) {
      throw new RegistryRegistrationError(
        "Duplicate Analysis Model Definition.",
        registrationIssue(
          "AnalysisModelDefinition",
          "duplicate_analysis_model_definition",
          `Analysis Model '${definition.modelId}' version ` +
            `'${definition.version}' is already registered.`
        )
      );
    }
    this.#models.set(key, snapshot);
  }

  listModels(): readonly AnalysisModelDefinition[] {
    return immutableList(this.#models.values());
  }

  listSchemas(): readonly RegisteredAnalysisSchema[] {
    return immutableList(this.#schemas.values());
  }

  resolveModel(
    modelId: string,
    version: string
  ): RegistryResolution<AnalysisModelDefinition> {
    const definition = this.#models.get(registryKey(modelId, version));
    if (definition !== undefined) {
      return definition.lifecycleStatus === "inactive"
        ? { status: "inactive", definition }
        : { status: "found", definition };
    }

    const availableVersions = versionsFor(
      this.#models,
      (candidate) => candidate.modelId,
      (candidate) => candidate.version,
      modelId
    );
    return availableVersions.length === 0
      ? { status: "unknown", availableVersions: [] }
      : { status: "version_mismatch", availableVersions };
  }

  validateInput(
    modelId: string,
    version: string,
    value: unknown
  ): ValidationResult<JsonValue> {
    return this.validateModelValue("input", modelId, version, value);
  }

  validateOutput(
    modelId: string,
    version: string,
    value: unknown
  ): ValidationResult<JsonValue> {
    return this.validateModelValue("output", modelId, version, value);
  }

  private validateModelValue(
    direction: "input" | "output",
    modelId: string,
    version: string,
    value: unknown
  ): ValidationResult<JsonValue> {
    const resolution = this.resolveModel(modelId, version);
    if (resolution.status !== "found") {
      const code =
        resolution.status === "unknown"
          ? "unknown_analysis_model"
          : resolution.status === "inactive"
            ? "inactive_analysis_model"
            : "analysis_model_version_mismatch";
      return {
        success: false,
        data: null,
        issues: [
          {
            path: "AnalysisModel",
            code,
            message:
              `Analysis Model '${modelId}' version '${version}' is ` +
              `${resolution.status}.`
          }
        ]
      };
    }

    const schemaId =
      direction === "input"
        ? resolution.definition.inputSchemaId
        : resolution.definition.outputSchemaId;
    const schemaVersion =
      direction === "input"
        ? resolution.definition.inputSchemaVersion
        : resolution.definition.outputSchemaVersion;
    const registeredSchema = this.#schemas.get(
      registryKey(schemaId, schemaVersion)
    );
    if (registeredSchema === undefined) {
      return {
        success: false,
        data: null,
        issues: [
          {
            path: "AnalysisModel",
            code: "analysis_schema_unavailable",
            message:
              `Analysis ${direction} Schema '${schemaId}' version ` +
              `'${schemaVersion}' is unavailable.`
          }
        ]
      };
    }

    return validateSchemaValue(
      registeredSchema.schema,
      value,
      `AnalysisModel(${modelId}@${version}).${direction}`
    );
  }
}

export class BuildSystemRegistry implements BuildSystemRegistryReader {
  readonly #definitions = new Map<string, BuildSystemDefinition>();
  readonly #entityTypes: EntityTypeRegistryReader;
  #sealed = false;

  constructor(entityTypes: EntityTypeRegistryReader) {
    this.#entityTypes = entityTypes;
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  seal(): void {
    this.#sealed = true;
  }

  register(definition: BuildSystemDefinition): void {
    assertRegistryOpen("BuildSystemRegistry", this.#sealed);
    const validation = validateDomainModel(
      "BuildSystemDefinition",
      definition,
      { entityTypes: this.#entityTypes }
    );
    if (!validation.success) {
      throw new RegistryRegistrationError(
        "Invalid Build System Definition.",
        validation.issues
      );
    }

    const snapshot = immutableSnapshot(validation.data);
    const key = registryKey(snapshot.id, snapshot.version);
    if (this.#definitions.has(key)) {
      throw new RegistryRegistrationError(
        "Duplicate Build System Definition.",
        registrationIssue(
          "BuildSystemDefinition",
          "duplicate_build_system_definition",
          `Build System '${definition.id}' version ` +
            `'${definition.version}' is already registered.`
        )
      );
    }
    this.#definitions.set(key, snapshot);
  }

  list(): readonly BuildSystemDefinition[] {
    return immutableList(this.#definitions.values());
  }

  resolve(
    buildSystemId: string,
    version: string
  ): RegistryResolution<BuildSystemDefinition> {
    const definition = this.#definitions.get(
      registryKey(buildSystemId, version)
    );
    if (definition !== undefined) {
      return definition.active
        ? { status: "found", definition }
        : { status: "inactive", definition };
    }

    const availableVersions = versionsFor(
      this.#definitions,
      (candidate) => candidate.id,
      (candidate) => candidate.version,
      buildSystemId
    );
    return availableVersions.length === 0
      ? { status: "unknown", availableVersions: [] }
      : { status: "version_mismatch", availableVersions };
  }
}

export class CatalogEntityRegistry implements CatalogEntityRegistryReader {
  readonly #entities = new Map<CanonicalEntityId, CatalogEntity>();
  #sealed = false;

  get sealed(): boolean {
    return this.#sealed;
  }

  seal(): void {
    this.#sealed = true;
  }

  register(
    entity: CatalogEntity,
    entityTypes: EntityTypeRegistryReader
  ): void {
    assertRegistryOpen("CatalogEntityRegistry", this.#sealed);
    const validation = validateDomainModel("CatalogEntity", entity, {
      entityTypes
    });
    if (!validation.success) {
      throw new RegistryRegistrationError(
        "Invalid Catalog Entity.",
        validation.issues
      );
    }
    const snapshot = immutableSnapshot(validation.data);
    if (this.#entities.has(snapshot.id)) {
      throw new RegistryRegistrationError(
        "Duplicate Catalog Entity.",
        registrationIssue(
          "CatalogEntity.id",
          "duplicate_catalog_entity",
          `Catalog Entity '${entity.id}' is already registered.`
        )
      );
    }
    this.#entities.set(snapshot.id, snapshot);
  }

  get(entityId: CanonicalEntityId): CatalogEntity | undefined {
    return this.#entities.get(entityId);
  }

  list(): readonly CatalogEntity[] {
    return immutableList(this.#entities.values());
  }
}

export function createDomainValidationContext(
  entityTypes: EntityTypeRegistry,
  analysisModels: AnalysisModelRegistry,
  buildSystems: BuildSystemRegistry,
  entities: CatalogEntityRegistry
): DomainValidationContext {
  return {
    entityTypes,
    analysisModels,
    buildSystems,
    entities
  };
}
