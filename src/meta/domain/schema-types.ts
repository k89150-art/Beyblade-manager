export interface StringSchema {
  readonly kind: "string";
  readonly minLength?: number;
  readonly enum?: readonly string[];
  readonly format?: "canonical-entity-id" | "date" | "date-time" | "uri";
}

export interface NumberSchema {
  readonly kind: "number";
  readonly minimum?: number;
  readonly maximum?: number;
  readonly integer?: boolean;
}

export interface BooleanSchema {
  readonly kind: "boolean";
  readonly const?: boolean;
}

export interface JsonSchema {
  readonly kind: "json";
}

export interface NullableSchema {
  readonly kind: "nullable";
  readonly inner: SchemaNode;
}

export interface ArraySchema {
  readonly kind: "array";
  readonly items: SchemaNode;
  readonly minItems?: number;
  readonly uniqueItems?: boolean;
}

export interface RecordSchema {
  readonly kind: "record";
  readonly values: SchemaNode;
}

export interface ObjectSchema {
  readonly kind: "object";
  readonly properties: Readonly<Record<string, SchemaNode>>;
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
  readonly refinements: readonly string[];
}

export type SchemaNode =
  | StringSchema
  | NumberSchema
  | BooleanSchema
  | JsonSchema
  | NullableSchema
  | ArraySchema
  | RecordSchema
  | ObjectSchema;
