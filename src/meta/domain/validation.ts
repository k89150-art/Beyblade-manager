import { TREND_WINDOWS } from "./enums.js";
import { DOMAIN_SCHEMAS } from "./schema.js";
import type { ObjectSchema, SchemaNode } from "./schema-types.js";
import type {
  AnalysisModelDefinition,
  BuildSystemDefinition,
  CanonicalEntityId,
  CatalogEntity,
  DomainModelMap,
  DomainModelName,
  EntityTypeDefinition,
  JsonValue
} from "./types.js";

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | {
      readonly success: true;
      readonly data: T;
      readonly issues: readonly [];
    }
  | {
      readonly success: false;
      readonly data: null;
      readonly issues: readonly ValidationIssue[];
    };

export type RegistryResolution<T> =
  | {
      readonly status: "found";
      readonly definition: T;
    }
  | {
      readonly status: "unknown";
      readonly availableVersions: readonly [];
    }
  | {
      readonly status: "version_mismatch";
      readonly availableVersions: readonly string[];
    }
  | {
      readonly status: "inactive";
      readonly definition: T;
    };

export interface EntityTypeRegistryReader {
  resolve(
    typeId: string,
    version: string
  ): RegistryResolution<EntityTypeDefinition>;
}

export interface AnalysisModelRegistryReader {
  resolveModel(
    modelId: string,
    version: string
  ): RegistryResolution<AnalysisModelDefinition>;
  validateOutput(
    modelId: string,
    version: string,
    value: unknown
  ): ValidationResult<JsonValue>;
}

export interface BuildSystemRegistryReader {
  resolve(
    buildSystemId: string,
    version: string
  ): RegistryResolution<BuildSystemDefinition>;
}

export interface CatalogEntityRegistryReader {
  get(entityId: CanonicalEntityId): CatalogEntity | undefined;
}

export interface DomainValidationContext {
  readonly entityTypes?: EntityTypeRegistryReader;
  readonly analysisModels?: AnalysisModelRegistryReader;
  readonly buildSystems?: BuildSystemRegistryReader;
  readonly entities?: CatalogEntityRegistryReader;
}

type UnknownRecord = Record<string, unknown>;
type Refinement = (
  value: UnknownRecord,
  path: string,
  issues: ValidationIssue[]
) => void;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/u;
const CANONICAL_ENTITY_ID_PATTERN =
  /^ent_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function addIssue(
  issues: ValidationIssue[],
  path: string,
  code: string,
  message: string
): void {
  issues.push({ path, code, message });
}

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(
  value: unknown,
  ancestors: ReadonlySet<object> = new Set<object>()
): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      return false;
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      return false;
    }

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(value);

    for (let index = 0; index < value.length; index += 1) {
      if (
        !Object.hasOwn(value, index) ||
        !isJsonValue(value[index], nextAncestors)
      ) {
        return false;
      }
    }

    return Object.keys(value).every((key) => {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && index < value.length;
    });
  }

  if (!isRecord(value) || ancestors.has(value)) {
    return false;
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) =>
      "value" in descriptor &&
      isJsonValue(descriptor.value, nextAncestors)
  );
}

function hasOnlyKeys(
  value: UnknownRecord,
  allowedKeys: readonly string[]
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSchemaNodeDefinition(
  value: unknown,
  ancestors: ReadonlySet<object> = new Set<object>()
): value is SchemaNode {
  if (!isRecord(value) || ancestors.has(value) || typeof value.kind !== "string") {
    return false;
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  switch (value.kind) {
    case "string":
      return (
        hasOnlyKeys(value, ["kind", "minLength", "enum", "format"]) &&
        (!Object.hasOwn(value, "minLength") ||
          (typeof value.minLength === "number" &&
            Number.isInteger(value.minLength) &&
            value.minLength >= 0)) &&
        (!Object.hasOwn(value, "enum") ||
          (isStringArray(value.enum) && value.enum.length > 0)) &&
        (!Object.hasOwn(value, "format") ||
          value.format === "canonical-entity-id" ||
          value.format === "date" ||
          value.format === "date-time" ||
          value.format === "uri")
      );
    case "number":
      return (
        hasOnlyKeys(value, ["kind", "minimum", "maximum", "integer"]) &&
        (!Object.hasOwn(value, "minimum") ||
          (typeof value.minimum === "number" &&
            Number.isFinite(value.minimum))) &&
        (!Object.hasOwn(value, "maximum") ||
          (typeof value.maximum === "number" &&
            Number.isFinite(value.maximum))) &&
        (!Object.hasOwn(value, "integer") ||
          typeof value.integer === "boolean") &&
        (typeof value.minimum !== "number" ||
          typeof value.maximum !== "number" ||
          value.minimum <= value.maximum)
      );
    case "boolean":
      return (
        hasOnlyKeys(value, ["kind", "const"]) &&
        (!Object.hasOwn(value, "const") || typeof value.const === "boolean")
      );
    case "json":
      return hasOnlyKeys(value, ["kind"]);
    case "nullable":
      return (
        hasOnlyKeys(value, ["kind", "inner"]) &&
        Object.hasOwn(value, "inner") &&
        isSchemaNodeDefinition(value.inner, nextAncestors)
      );
    case "array":
      return (
        hasOnlyKeys(value, ["kind", "items", "minItems", "uniqueItems"]) &&
        Object.hasOwn(value, "items") &&
        isSchemaNodeDefinition(value.items, nextAncestors) &&
        (!Object.hasOwn(value, "minItems") ||
          (typeof value.minItems === "number" &&
            Number.isInteger(value.minItems) &&
            value.minItems >= 0)) &&
        (!Object.hasOwn(value, "uniqueItems") ||
          typeof value.uniqueItems === "boolean")
      );
    case "record":
      return (
        hasOnlyKeys(value, ["kind", "values"]) &&
        Object.hasOwn(value, "values") &&
        isSchemaNodeDefinition(value.values, nextAncestors)
      );
    case "object": {
      if (
        !hasOnlyKeys(value, [
          "kind",
          "properties",
          "required",
          "additionalProperties",
          "refinements"
        ]) ||
        !isRecord(value.properties) ||
        !isStringArray(value.required) ||
        typeof value.additionalProperties !== "boolean" ||
        !isStringArray(value.refinements)
      ) {
        return false;
      }

      const propertyNames = Object.keys(value.properties);
      return (
        Object.values(value.properties).every((property) =>
          isSchemaNodeDefinition(property, nextAncestors)
        ) &&
        new Set(value.required).size === value.required.length &&
        value.required.every((key) => propertyNames.includes(key))
      );
    }
    default:
      return false;
  }
}

export function validateSchemaDefinition(
  value: unknown,
  path = "SchemaDefinition"
): ValidationResult<ObjectSchema> {
  if (!isSchemaNodeDefinition(value) || value.kind !== "object") {
    return {
      success: false,
      data: null,
      issues: [
        {
          path,
          code: "invalid_schema_definition",
          message: "Expected a valid object schema definition."
        }
      ]
    };
  }

  return {
    success: true,
    data: value,
    issues: []
  };
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isValidDateTime(value: string): boolean {
  const match = DATE_TIME_PATTERN.exec(value);
  if (match === null) {
    return false;
  }

  const [, datePart, hourText, minuteText, secondText, timezone] = match;
  if (
    datePart === undefined ||
    hourText === undefined ||
    minuteText === undefined ||
    secondText === undefined ||
    timezone === undefined ||
    !isValidDate(datePart)
  ) {
    return false;
  }

  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  if (timezone !== "Z") {
    const [offsetHourText, offsetMinuteText] = timezone.slice(1).split(":");
    if (
      offsetHourText === undefined ||
      offsetMinuteText === undefined ||
      Number(offsetHourText) > 23 ||
      Number(offsetMinuteText) > 59
    ) {
      return false;
    }
  }

  return !Number.isNaN(Date.parse(value));
}

function isValidUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidCanonicalEntityId(
  value: string
): value is CanonicalEntityId {
  return CANONICAL_ENTITY_ID_PATTERN.test(value);
}

function validateString(
  schema: Extract<SchemaNode, { kind: "string" }>,
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): void {
  if (typeof value !== "string") {
    addIssue(issues, path, "invalid_type", "Expected a string.");
    return;
  }

  if (schema.minLength !== undefined && value.length < schema.minLength) {
    addIssue(
      issues,
      path,
      "too_short",
      `Expected at least ${schema.minLength} character(s).`
    );
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    addIssue(
      issues,
      path,
      "invalid_enum",
      `Expected one of: ${schema.enum.join(", ")}.`
    );
  }

  const validFormat =
    schema.format === undefined ||
    (schema.format === "canonical-entity-id" &&
      isValidCanonicalEntityId(value)) ||
    (schema.format === "date" && isValidDate(value)) ||
    (schema.format === "date-time" && isValidDateTime(value)) ||
    (schema.format === "uri" && isValidUri(value));

  if (!validFormat) {
    addIssue(
      issues,
      path,
      "invalid_format",
      `Expected a valid ${schema.format ?? "string"} value.`
    );
  }
}

function validateNumber(
  schema: Extract<SchemaNode, { kind: "number" }>,
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addIssue(issues, path, "invalid_type", "Expected a finite number.");
    return;
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    addIssue(
      issues,
      path,
      "too_small",
      `Expected a value greater than or equal to ${schema.minimum}.`
    );
  }

  if (schema.maximum !== undefined && value > schema.maximum) {
    addIssue(
      issues,
      path,
      "too_large",
      `Expected a value less than or equal to ${schema.maximum}.`
    );
  }

  if (schema.integer === true && !Number.isInteger(value)) {
    addIssue(issues, path, "not_integer", "Expected an integer.");
  }
}

function validateArray(
  schema: Extract<SchemaNode, { kind: "array" }>,
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): void {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "invalid_type", "Expected an array.");
    return;
  }

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    addIssue(
      issues,
      path,
      "too_few_items",
      `Expected at least ${schema.minItems} item(s).`
    );
  }

  if (schema.uniqueItems === true) {
    const serialized = value.map((item) => JSON.stringify(item));
    if (new Set(serialized).size !== serialized.length) {
      addIssue(issues, path, "duplicate_items", "Expected unique items.");
    }
  }

  value.forEach((item, index) => {
    validateNode(schema.items, item, `${path}[${index}]`, issues);
  });
}

function validateObject(
  schema: ObjectSchema,
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "invalid_type", "Expected an object.");
    return;
  }

  for (const requiredKey of schema.required) {
    if (!Object.hasOwn(value, requiredKey) || value[requiredKey] === undefined) {
      addIssue(
        issues,
        `${path}.${requiredKey}`,
        "required",
        "This field is required."
      );
    }
  }

  for (const [key, propertyValue] of Object.entries(value)) {
    const propertySchema = schema.properties[key];
    if (propertySchema === undefined) {
      if (!schema.additionalProperties) {
        addIssue(
          issues,
          `${path}.${key}`,
          "unknown_field",
          "This field is not part of the domain schema."
        );
      }
      continue;
    }

    if (propertyValue === undefined) {
      addIssue(
        issues,
        `${path}.${key}`,
        "undefined_value",
        "Optional fields must be omitted instead of set to undefined."
      );
    } else {
      validateNode(propertySchema, propertyValue, `${path}.${key}`, issues);
    }
  }

  for (const refinementName of schema.refinements) {
    const refinement = REFINEMENTS[refinementName];
    if (refinement === undefined) {
      addIssue(
        issues,
        path,
        "unknown_refinement",
        `Unknown validation refinement: ${refinementName}.`
      );
    } else {
      refinement(value, path, issues);
    }
  }
}

function validateNode(
  schema: SchemaNode,
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): void {
  switch (schema.kind) {
    case "string":
      validateString(schema, value, path, issues);
      break;
    case "number":
      validateNumber(schema, value, path, issues);
      break;
    case "boolean":
      if (typeof value !== "boolean") {
        addIssue(issues, path, "invalid_type", "Expected a boolean.");
      } else if (schema.const !== undefined && value !== schema.const) {
        addIssue(
          issues,
          path,
          "invalid_constant",
          `Expected ${String(schema.const)}.`
        );
      }
      break;
    case "json":
      if (!isJsonValue(value)) {
        addIssue(issues, path, "invalid_json", "Expected JSON-safe data.");
      }
      break;
    case "nullable":
      if (value !== null) {
        validateNode(schema.inner, value, path, issues);
      }
      break;
    case "array":
      validateArray(schema, value, path, issues);
      break;
    case "record":
      if (!isRecord(value)) {
        addIssue(issues, path, "invalid_type", "Expected a keyed object.");
      } else {
        for (const [key, item] of Object.entries(value)) {
          validateNode(schema.values, item, `${path}.${key}`, issues);
        }
      }
      break;
    case "object":
      validateObject(schema, value, path, issues);
      break;
  }
}

export function validateSchemaValue(
  schema: SchemaNode,
  value: unknown,
  path = "value"
): ValidationResult<JsonValue> {
  const issues: ValidationIssue[] = [];
  validateNode(schema, value, path, issues);

  if (!isJsonValue(value)) {
    if (!issues.some((issue) => issue.code === "invalid_json")) {
      addIssue(
        issues,
        path,
        "invalid_json",
        "Validated schema values must also be JSON-safe."
      );
    }
  }

  if (issues.length > 0 || !isJsonValue(value)) {
    return {
      success: false,
      data: null,
      issues
    };
  }

  return {
    success: true,
    data: value,
    issues: []
  };
}

function hasText(value: UnknownRecord, key: string): boolean {
  return typeof value[key] === "string" && value[key].length > 0;
}

function isDateBeforeOrEqual(left: unknown, right: unknown): boolean {
  return (
    typeof left !== "string" ||
    typeof right !== "string" ||
    Date.parse(left) <= Date.parse(right)
  );
}

const REFINEMENTS: Readonly<Record<string, Refinement>> = {
  exclusiveTargetReference(value, path, issues) {
    const entityPresent = hasText(value, "entityId");
    const comboPresent = hasText(value, "comboId");

    if (
      (value.targetType === "entity" && (!entityPresent || comboPresent)) ||
      (value.targetType === "combo" && (!comboPresent || entityPresent))
    ) {
      addIssue(
        issues,
        path,
        "invalid_target_reference",
        "targetType must select exactly one matching entityId or comboId."
      );
    }
  },

  trendWindowAllowed(value, path, issues) {
    if (
      typeof value.windowWeeks === "number" &&
      !TREND_WINDOWS.some((windowWeeks) => windowWeeks === value.windowWeeks)
    ) {
      addIssue(
        issues,
        `${path}.windowWeeks`,
        "invalid_trend_window",
        "Trend windows must be 4, 8, or 12 weeks."
      );
    }
  },

  trendWindowsComplete(value, path, issues) {
    if (!Array.isArray(value.windows)) {
      return;
    }

    const windows = value.windows
      .filter(isRecord)
      .map((window) => window.windowWeeks);

    if (
      windows.length !== TREND_WINDOWS.length ||
      !TREND_WINDOWS.every(
        (expected) =>
          windows.filter((actual) => actual === expected).length === 1
      )
    ) {
      addIssue(
        issues,
        `${path}.windows`,
        "incomplete_trend_windows",
        "Trend analysis requires exactly one 4-, 8-, and 12-week window."
      );
    }
  },

  attributesSchemaDefinition(value, path, issues) {
    const result = validateSchemaDefinition(
      value.attributesSchema,
      `${path}.attributesSchema`
    );
    if (!result.success) {
      issues.push(...result.issues);
    }
  },

  buildSlotCardinality(value, path, issues) {
    if (
      typeof value.minimumEntries === "number" &&
      typeof value.maximumEntries === "number" &&
      value.minimumEntries > value.maximumEntries
    ) {
      addIssue(
        issues,
        `${path}.maximumEntries`,
        "invalid_slot_cardinality",
        "maximumEntries must not be lower than minimumEntries."
      );
    }
  },

  buildSlotEntityTypeVersions(value, path, issues) {
    if (
      !Array.isArray(value.allowedEntityTypeIds) ||
      !isRecord(value.allowedEntityTypeVersions)
    ) {
      return;
    }

    const typeIds = value.allowedEntityTypeIds.filter(
      (typeId): typeId is string => typeof typeId === "string"
    );
    const allowedEntityTypeVersions = value.allowedEntityTypeVersions;
    const versionTypeIds = Object.keys(allowedEntityTypeVersions);
    const missingVersions = typeIds.filter(
      (typeId) => !Object.hasOwn(allowedEntityTypeVersions, typeId)
    );
    const unexpectedVersions = versionTypeIds.filter(
      (typeId) => !typeIds.includes(typeId)
    );

    if (missingVersions.length > 0 || unexpectedVersions.length > 0) {
      addIssue(
        issues,
        `${path}.allowedEntityTypeVersions`,
        "entity_type_version_map_mismatch",
        "allowedEntityTypeVersions must contain exactly one version for " +
          `every allowedEntityTypeId. Missing: ${missingVersions.join(", ") || "-"}. ` +
          `Unexpected: ${unexpectedVersions.join(", ") || "-"}.`
      );
    }
  },

  buildSystemSlotConsistency(value, path, issues) {
    if (!Array.isArray(value.slots) || !Array.isArray(value.exclusiveSlotGroups)) {
      return;
    }

    const slotIds = value.slots
      .filter(isRecord)
      .map((slot) => slot.slotId)
      .filter((slotId): slotId is string => typeof slotId === "string");
    const declaredSlots = new Set(slotIds);
    const slots = value.slots;

    if (declaredSlots.size !== slotIds.length) {
      addIssue(
        issues,
        `${path}.slots`,
        "duplicate_slot_definition",
        "Each slotId may be declared only once."
      );
    }

    value.exclusiveSlotGroups.forEach((group, groupIndex) => {
      if (
        Array.isArray(group) &&
        group.some(
          (slot) => typeof slot === "string" && !declaredSlots.has(slot)
        )
      ) {
        addIssue(
          issues,
          `${path}.exclusiveSlotGroups[${groupIndex}]`,
          "undeclared_exclusive_slot",
          "Every exclusive slot must be declared in slots."
        );
      }

      if (Array.isArray(group)) {
        const requiredSlots = group.filter((slotId) =>
          slots.some(
            (slot) =>
              isRecord(slot) &&
              slot.slotId === slotId &&
              typeof slot.minimumEntries === "number" &&
              slot.minimumEntries > 0
          )
        );
        if (requiredSlots.length > 1) {
          addIssue(
            issues,
            `${path}.exclusiveSlotGroups[${groupIndex}]`,
            "unsatisfiable_exclusive_required_slots",
            "Exclusive Slots cannot contain more than one required Slot. " +
              `Conflicting Slots: ${requiredSlots.join(", ")}.`
          );
        }
      }
    });

    const repeatedExclusiveSlots = value.exclusiveSlotGroups
      .filter(Array.isArray)
      .flat()
      .filter((slot): slot is string => typeof slot === "string");
    if (
      repeatedExclusiveSlots.some(
        (slotId, index) => repeatedExclusiveSlots.indexOf(slotId) !== index
      )
    ) {
      addIssue(
        issues,
        `${path}.exclusiveSlotGroups`,
        "duplicate_exclusive_slot",
        "A slot may appear in only one exclusive slot group."
      );
    }
  },

  revisionChangesPresent(value, path, issues) {
    if (isRecord(value.changes) && Object.keys(value.changes).length === 0) {
      addIssue(
        issues,
        `${path}.changes`,
        "empty_revision",
        "Evidence revisions must contain at least one changed field."
      );
    }
  },

  mappingResolutionConsistency(value, path, issues) {
    const resolutionKeys = [
      "resolvedEntityId",
      "resolutionNote",
      "resolvedAt",
      "resolvedBy"
    ];

    if (
      value.status === "resolved" &&
      (!hasText(value, "resolvedEntityId") ||
        !hasText(value, "resolvedBy") ||
        !hasText(value, "resolvedAt"))
    ) {
      addIssue(
        issues,
        path,
        "incomplete_mapping_resolution",
        "Resolved mapping tasks require entity, actor, and timestamp."
      );
    } else if (
      value.status !== "resolved" &&
      resolutionKeys.some((key) => Object.hasOwn(value, key))
    ) {
      addIssue(
        issues,
        path,
        "unexpected_mapping_resolution",
        "Only resolved mapping tasks may contain resolution fields."
      );
    }
  },

  activeDateOrder(value, path, issues) {
    if (!isDateBeforeOrEqual(value.activeFrom, value.activeUntil)) {
      addIssue(
        issues,
        `${path}.activeUntil`,
        "invalid_date_order",
        "activeUntil must not be earlier than activeFrom."
      );
    }
  },

  runDateOrder(value, path, issues) {
    if (!isDateBeforeOrEqual(value.startedAt, value.completedAt)) {
      addIssue(
        issues,
        `${path}.completedAt`,
        "invalid_date_order",
        "completedAt must not be earlier than startedAt."
      );
    }
  },

  confidenceHardCap(value, path, issues) {
    if (
      typeof value.score === "number" &&
      typeof value.hardCap === "number" &&
      value.score > value.hardCap
    ) {
      addIssue(
        issues,
        `${path}.score`,
        "confidence_exceeds_cap",
        "Confidence score must not exceed its hard cap."
      );
    }
  },

  insufficientRecommendationIsNull(value, path, issues) {
    if (
      value.verdict === "insufficient_data" &&
      (value.score !== null || value.stars !== null)
    ) {
      addIssue(
        issues,
        path,
        "insufficient_evidence_score",
        "Recommendation score and stars must be null for insufficient data."
      );
    }
  },

  recommendationExplanationConsistency(value, path, issues) {
    if (!Array.isArray(value.positiveFactors) || !Array.isArray(value.riskFactors)) {
      return;
    }

    if (
      (value.verdict === "strong_buy" || value.verdict === "recommended") &&
      value.positiveFactors.length === 0
    ) {
      addIssue(
        issues,
        `${path}.positiveFactors`,
        "missing_positive_factor",
        "Positive recommendations require at least one positive factor."
      );
    }

    if (
      (value.verdict === "conditional" ||
        value.verdict === "wait" ||
        value.verdict === "avoid" ||
        value.verdict === "insufficient_data") &&
      value.riskFactors.length === 0
    ) {
      addIssue(
        issues,
        `${path}.riskFactors`,
        "missing_risk_factor",
        "Conditional, negative, and insufficient verdicts require a risk factor."
      );
    }
  },

  profileAnalysisResultsUnique(value, path, issues) {
    if (!Array.isArray(value.analysisResults)) {
      return;
    }

    const modelKeys = value.analysisResults
      .filter(isRecord)
      .map((result) =>
        typeof result.modelId === "string" &&
        typeof result.modelVersion === "string"
          ? `${result.modelId}\u0000${result.modelVersion}`
          : ""
      )
      .filter((key) => key.length > 0);
    if (new Set(modelKeys).size !== modelKeys.length) {
      addIssue(
        issues,
        `${path}.analysisResults`,
        "duplicate_meta_profile_model",
        "MetaProfile may contain only one result for each modelId/version."
      );
    }
  },

  snapshotDateOrder(value, path, issues) {
    if (!isDateBeforeOrEqual(value.weekStart, value.weekEnd)) {
      addIssue(
        issues,
        `${path}.weekEnd`,
        "invalid_date_order",
        "weekEnd must not be earlier than weekStart."
      );
    }
  },

  comboRouteSubjectPresent(value, path, issues) {
    if (!hasText(value, "comboId") && !hasText(value, "primaryEntityId")) {
      addIssue(
        issues,
        path,
        "missing_route_subject",
        "ComboRoute requires comboId or primaryEntityId."
      );
    }
  },

  exclusiveCounterReferences(value, path, issues) {
    const sourceCount = Number(hasText(value, "sourceEntityId")) +
      Number(hasText(value, "sourceComboId"));
    const targetCount = Number(hasText(value, "targetEntityId")) +
      Number(hasText(value, "targetComboId"));

    if (sourceCount !== 1 || targetCount !== 1) {
      addIssue(
        issues,
        path,
        "invalid_counter_reference",
        "CounterRelationship requires exactly one source and one target reference."
      );
    }
  }
};

function validateCatalogEntityContext(
  value: UnknownRecord,
  context: DomainValidationContext,
  issues: ValidationIssue[]
): void {
  if (context.entityTypes === undefined) {
    addIssue(
      issues,
      "CatalogEntity.entityTypeId",
      "entity_type_registry_required",
      "CatalogEntity validation requires an Entity Type Registry."
    );
    return;
  }

  if (
    typeof value.entityTypeId !== "string" ||
    typeof value.entityTypeVersion !== "string"
  ) {
    return;
  }

  const resolution = context.entityTypes.resolve(
    value.entityTypeId,
    value.entityTypeVersion
  );
  if (resolution.status === "unknown") {
    addIssue(
      issues,
      "CatalogEntity.entityTypeId",
      "unknown_entity_type",
      `Entity Type '${value.entityTypeId}' is not registered.`
    );
    return;
  }
  if (resolution.status === "version_mismatch") {
    addIssue(
      issues,
      "CatalogEntity.entityTypeVersion",
      "entity_type_version_mismatch",
      `Entity Type '${value.entityTypeId}' does not support version ` +
        `'${value.entityTypeVersion}'. Available: ` +
        `${resolution.availableVersions.join(", ")}.`
    );
    return;
  }
  if (resolution.status === "inactive") {
    addIssue(
      issues,
      "CatalogEntity.entityTypeId",
      "inactive_entity_type",
      `Entity Type '${value.entityTypeId}' version ` +
        `'${value.entityTypeVersion}' is inactive.`
    );
    return;
  }

  if (
    Array.isArray(value.seriesIds) &&
    resolution.definition.supportedSeries.length > 0
  ) {
    const unsupported = value.seriesIds.filter(
      (seriesId) =>
        typeof seriesId === "string" &&
        !resolution.definition.supportedSeries.includes(seriesId)
    );
    if (unsupported.length > 0) {
      addIssue(
        issues,
        "CatalogEntity.seriesIds",
        "unsupported_entity_series",
        `Entity Type '${value.entityTypeId}' does not support: ` +
          `${unsupported.join(", ")}.`
      );
    }
  }

  const attributesResult = validateSchemaValue(
    resolution.definition.attributesSchema,
    value.attributes,
    "CatalogEntity.attributes"
  );
  if (!attributesResult.success) {
    issues.push(...attributesResult.issues);
  }
}

function validateAnalysisTraceContext(
  value: UnknownRecord,
  context: DomainValidationContext,
  issues: ValidationIssue[]
): void {
  if (context.analysisModels === undefined) {
    addIssue(
      issues,
      "AnalysisTrace.modelId",
      "analysis_model_registry_required",
      "AnalysisTrace validation requires an Analysis Model Registry."
    );
    return;
  }

  if (
    typeof value.modelId !== "string" ||
    typeof value.modelVersion !== "string"
  ) {
    return;
  }

  const resolution = context.analysisModels.resolveModel(
    value.modelId,
    value.modelVersion
  );
  if (resolution.status === "unknown") {
    addIssue(
      issues,
      "AnalysisTrace.modelId",
      "unknown_analysis_model",
      `Analysis Model '${value.modelId}' is not registered.`
    );
  } else if (resolution.status === "version_mismatch") {
    addIssue(
      issues,
      "AnalysisTrace.modelVersion",
      "analysis_model_version_mismatch",
      `Analysis Model '${value.modelId}' does not support version ` +
        `'${value.modelVersion}'. Available: ` +
        `${resolution.availableVersions.join(", ")}.`
    );
  } else if (resolution.status === "inactive") {
    addIssue(
      issues,
      "AnalysisTrace.modelId",
      "inactive_analysis_model",
      `Analysis Model '${value.modelId}' version ` +
        `'${value.modelVersion}' is inactive.`
    );
  }
}

function validateMetaProfileContext(
  value: UnknownRecord,
  context: DomainValidationContext,
  issues: ValidationIssue[]
): void {
  if (context.analysisModels === undefined) {
    addIssue(
      issues,
      "MetaProfile.analysisResults",
      "analysis_model_registry_required",
      "MetaProfile validation requires an Analysis Model Registry."
    );
    return;
  }
  if (!Array.isArray(value.analysisResults)) {
    return;
  }
  const analysisModels = context.analysisModels;

  value.analysisResults.forEach((resultValue, index) => {
    if (!isRecord(resultValue)) {
      return;
    }
    const resultPath = `MetaProfile.analysisResults[${index}]`;
    const modelId = resultValue.modelId;
    const modelVersion = resultValue.modelVersion;
    if (typeof modelId !== "string" || typeof modelVersion !== "string") {
      return;
    }

    const resolution = analysisModels.resolveModel(modelId, modelVersion);
    if (resolution.status === "unknown") {
      addIssue(
        issues,
        `${resultPath}.modelId`,
        "unknown_analysis_model",
        `Analysis Model '${modelId}' is not registered.`
      );
      return;
    }
    if (resolution.status === "version_mismatch") {
      addIssue(
        issues,
        `${resultPath}.modelVersion`,
        "analysis_model_version_mismatch",
        `Analysis Model '${modelId}' does not support version ` +
          `'${modelVersion}'. Available: ` +
          `${resolution.availableVersions.join(", ")}.`
      );
      return;
    }
    if (resolution.status === "inactive") {
      addIssue(
        issues,
        `${resultPath}.modelId`,
        "inactive_analysis_model",
        `Analysis Model '${modelId}' version '${modelVersion}' is inactive.`
      );
      return;
    }

    if (Array.isArray(resultValue.reasonCodes)) {
      resultValue.reasonCodes.forEach((reasonCode, reasonIndex) => {
        if (
          typeof reasonCode === "string" &&
          reasonCode !== resolution.definition.reasonCodeNamespace &&
          !reasonCode.startsWith(
            `${resolution.definition.reasonCodeNamespace}.`
          )
        ) {
          addIssue(
            issues,
            `${resultPath}.reasonCodes[${reasonIndex}]`,
            "invalid_reason_code_namespace",
            `Reason Code '${reasonCode}' must use namespace ` +
              `'${resolution.definition.reasonCodeNamespace}'.`
          );
        }
      });
    }

    const outputValidation = analysisModels.validateOutput(
      modelId,
      modelVersion,
      resultValue.output
    );
    if (!outputValidation.success) {
      outputValidation.issues.forEach((issue) => {
        addIssue(
          issues,
          `${resultPath}.output`,
          issue.code,
          issue.message
        );
      });
    }
  });
}

function validateBuildSystemDefinitionContext(
  value: UnknownRecord,
  context: DomainValidationContext,
  issues: ValidationIssue[]
): void {
  if (context.entityTypes === undefined || !Array.isArray(value.slots)) {
    return;
  }
  const entityTypes = context.entityTypes;

  value.slots.forEach((slotValue, slotIndex) => {
    if (
      !isRecord(slotValue) ||
      !Array.isArray(slotValue.allowedEntityTypeIds) ||
      !isRecord(slotValue.allowedEntityTypeVersions)
    ) {
      return;
    }
    const allowedEntityTypeVersions = slotValue.allowedEntityTypeVersions;

    slotValue.allowedEntityTypeIds.forEach((typeId, typeIndex) => {
      if (typeof typeId !== "string") {
        return;
      }
      const version = allowedEntityTypeVersions[typeId];
      if (typeof version !== "string") {
        return;
      }

      const resolution = entityTypes.resolve(typeId, version);
      const path =
        `BuildSystemDefinition.slots[${slotIndex}]` +
        `.allowedEntityTypeIds[${typeIndex}]`;
      if (resolution.status === "unknown") {
        addIssue(
          issues,
          path,
          "unknown_build_slot_entity_type",
          `Slot '${slotValue.slotId}' references unregistered Entity Type ` +
            `'${typeId}'.`
        );
      } else if (resolution.status === "version_mismatch") {
        addIssue(
          issues,
          path,
          "build_slot_entity_type_version_mismatch",
          `Slot '${slotValue.slotId}' requests Entity Type '${typeId}' ` +
            `version '${version}'. Available: ` +
            `${resolution.availableVersions.join(", ")}.`
        );
      } else if (resolution.status === "inactive") {
        addIssue(
          issues,
          path,
          "inactive_build_slot_entity_type",
          `Slot '${slotValue.slotId}' references inactive Entity Type ` +
            `'${typeId}' version '${version}'.`
        );
      }
    });
  });
}

function validateStockConfigurationContext(
  value: UnknownRecord,
  context: DomainValidationContext,
  issues: ValidationIssue[]
): void {
  if (
    context.buildSystems === undefined ||
    context.entities === undefined ||
    context.entityTypes === undefined
  ) {
    addIssue(
      issues,
      "StockConfiguration",
      "stock_validation_context_required",
      "StockConfiguration validation requires Build System, Entity, and " +
        "Entity Type registries."
    );
    return;
  }

  const buildSystems = context.buildSystems;
  const entities = context.entities;
  const entityTypes = context.entityTypes;

  if (
    typeof value.buildSystemId !== "string" ||
    typeof value.buildSystemVersion !== "string" ||
    !Array.isArray(value.entries)
  ) {
    return;
  }

  const buildResolution = buildSystems.resolve(
    value.buildSystemId,
    value.buildSystemVersion
  );
  if (buildResolution.status === "unknown") {
    addIssue(
      issues,
      "StockConfiguration.buildSystemId",
      "unknown_build_system",
      `Build System '${value.buildSystemId}' is not registered.`
    );
    return;
  }
  if (buildResolution.status === "version_mismatch") {
    addIssue(
      issues,
      "StockConfiguration.buildSystemVersion",
      "build_system_version_mismatch",
      `Build System '${value.buildSystemId}' does not support version ` +
        `'${value.buildSystemVersion}'. Available: ` +
        `${buildResolution.availableVersions.join(", ")}.`
    );
    return;
  }
  if (buildResolution.status === "inactive") {
    addIssue(
      issues,
      "StockConfiguration.buildSystemId",
      "inactive_build_system",
      `Build System '${value.buildSystemId}' version ` +
        `'${value.buildSystemVersion}' is inactive.`
    );
    return;
  }

  const buildSystem = buildResolution.definition;
  const slotsById = new Map(
    buildSystem.slots.map((slot) => [slot.slotId, slot])
  );
  const entriesBySlot = new Map<string, UnknownRecord[]>();
  const usedEntities = new Set<string>();

  value.entries.forEach((entryValue, index) => {
    if (!isRecord(entryValue)) {
      return;
    }

    const entryPath = `StockConfiguration.entries[${index}]`;
    const slotId = entryValue.slotId;
    const entityId = entryValue.entityId;
    if (typeof slotId !== "string" || typeof entityId !== "string") {
      return;
    }

    if (usedEntities.has(entityId)) {
      addIssue(
        issues,
        `${entryPath}.entityId`,
        "duplicate_stock_entity",
        `Entity '${entityId}' is already used in this Stock Configuration.`
      );
    }
    usedEntities.add(entityId);

    const slot = slotsById.get(slotId);
    if (slot === undefined) {
      addIssue(
        issues,
        `${entryPath}.slotId`,
        "unknown_stock_slot",
        `Slot '${slotId}' is not declared by Build System ` +
          `'${buildSystem.id}' version '${buildSystem.version}'.`
      );
      return;
    }

    const slotEntries = entriesBySlot.get(slotId) ?? [];
    slotEntries.push(entryValue);
    entriesBySlot.set(slotId, slotEntries);

    if (!isValidCanonicalEntityId(entityId)) {
      return;
    }
    const entity = entities.get(entityId);
    if (entity === undefined) {
      addIssue(
        issues,
        `${entryPath}.entityId`,
        "unknown_stock_entity",
        `Entity '${entityId}' is not registered.`
      );
      return;
    }

    const entityTypeResolution = entityTypes.resolve(
      entity.entityTypeId,
      entity.entityTypeVersion
    );
    if (entityTypeResolution.status !== "found") {
      addIssue(
        issues,
        `${entryPath}.entityId`,
        "unavailable_stock_entity_type",
        `Entity '${entityId}' references an unavailable Entity Type.`
      );
    } else {
      const allowedEntityTypeVersions = slot.allowedEntityTypeVersions;
      if (
        !slot.allowedEntityTypeIds.includes(entity.entityTypeId) ||
        allowedEntityTypeVersions[entity.entityTypeId] !==
          entity.entityTypeVersion
      ) {
        addIssue(
          issues,
          `${entryPath}.entityId`,
          "incompatible_slot_entity_type",
          `Entity Type '${entity.entityTypeId}' version ` +
            `'${entity.entityTypeVersion}' is not allowed in Slot '${slotId}'.`
        );
      }
    }

    const allowsMultiple =
      slot.maximumEntries === null || slot.maximumEntries > 1;
    if (allowsMultiple && typeof entryValue.position !== "number") {
      addIssue(
        issues,
        `${entryPath}.position`,
        "stock_position_required",
        `Slot '${slotId}' accepts multiple entries, so position is required.`
      );
    } else if (!allowsMultiple && Object.hasOwn(entryValue, "position")) {
      addIssue(
        issues,
        `${entryPath}.position`,
        "unexpected_stock_position",
        `Slot '${slotId}' accepts one entry, so position must be omitted.`
      );
    }
  });

  for (const slot of buildSystem.slots) {
    const entries = entriesBySlot.get(slot.slotId) ?? [];
    if (entries.length < slot.minimumEntries) {
      addIssue(
        issues,
        "StockConfiguration.entries",
        "missing_required_stock_slot",
        `Slot '${slot.slotId}' requires at least ` +
          `${slot.minimumEntries} entry or entries.`
      );
    }
    if (
      slot.maximumEntries !== null &&
      entries.length > slot.maximumEntries
    ) {
      addIssue(
        issues,
        "StockConfiguration.entries",
        "stock_slot_capacity_exceeded",
        `Slot '${slot.slotId}' allows at most ` +
          `${slot.maximumEntries} entry or entries.`
      );
    }

    if (slot.maximumEntries === null || slot.maximumEntries > 1) {
      const positions = entries
        .map((entry) => entry.position)
        .filter((position): position is number => typeof position === "number");
      if (new Set(positions).size !== positions.length) {
        addIssue(
          issues,
          "StockConfiguration.entries",
          "duplicate_stock_position",
          `Slot '${slot.slotId}' contains duplicate positions.`
        );
      }
    }
  }

  for (const group of buildSystem.exclusiveSlotGroups) {
    const occupiedSlots = group.filter(
      (slotId) => (entriesBySlot.get(slotId)?.length ?? 0) > 0
    );
    if (occupiedSlots.length > 1) {
      addIssue(
        issues,
        "StockConfiguration.entries",
        "exclusive_stock_slots",
        `Only one of these Slots may be occupied: ${group.join(", ")}.`
      );
    }
  }
}

function validateContextualModel(
  modelName: DomainModelName,
  value: UnknownRecord,
  context: DomainValidationContext,
  issues: ValidationIssue[]
): void {
  if (modelName === "CatalogEntity") {
    validateCatalogEntityContext(value, context, issues);
  } else if (modelName === "BuildSystemDefinition") {
    validateBuildSystemDefinitionContext(value, context, issues);
  } else if (modelName === "StockConfiguration") {
    validateStockConfigurationContext(value, context, issues);
  } else if (modelName === "AnalysisTrace") {
    validateAnalysisTraceContext(value, context, issues);
  } else if (modelName === "MetaProfile") {
    validateMetaProfileContext(value, context, issues);
  }
}

export function validateDomainModel<K extends DomainModelName>(
  modelName: K,
  value: unknown,
  context: DomainValidationContext = {}
): ValidationResult<DomainModelMap[K]> {
  const issues: ValidationIssue[] = [];
  validateObject(DOMAIN_SCHEMAS[modelName], value, modelName, issues);
  if (issues.length === 0 && isRecord(value)) {
    validateContextualModel(modelName, value, context, issues);
  }

  if (issues.length > 0) {
    return {
      success: false,
      data: null,
      issues
    };
  }

  return {
    success: true,
    data: value as DomainModelMap[K],
    issues: []
  };
}

export class DomainValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(modelName: DomainModelName, issues: readonly ValidationIssue[]) {
    super(`Invalid ${modelName}: ${issues.length} validation issue(s).`);
    this.name = "DomainValidationError";
    this.issues = issues;
  }
}

export function assertDomainModel<K extends DomainModelName>(
  modelName: K,
  value: unknown,
  context: DomainValidationContext = {}
): asserts value is DomainModelMap[K] {
  const result = validateDomainModel(modelName, value, context);
  if (!result.success) {
    throw new DomainValidationError(modelName, result.issues);
  }
}
