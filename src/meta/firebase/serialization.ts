import type { JsonValue } from "../domain/index.js";
import { FirebaseRepositoryError } from "./errors.js";
import type {
  FirestoreTimestampWire,
  FirestoreWireValue
} from "./types.js";

const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function timestamp(value: string): FirestoreTimestampWire {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new FirebaseRepositoryError(
      "invalid-data",
      `無法將 '${value}' 轉換為 Firestore Timestamp。`
    );
  }
  return {
    __firestoreType: "timestamp",
    iso: parsed.toISOString()
  };
}

export function toFirestoreWire(value: unknown): FirestoreWireValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new FirebaseRepositoryError(
        "invalid-data",
        "Firestore 資料不可包含 NaN 或 Infinity。"
      );
    }
    return value;
  }
  if (typeof value === "string") {
    return ISO_DATE_TIME.test(value) ? timestamp(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map(toFirestoreWire);
  }
  if (!isRecord(value)) {
    throw new FirebaseRepositoryError(
      "invalid-data",
      "Firestore 寫入只接受 JSON Serializable Domain 資料。"
    );
  }
  const result: Record<string, FirestoreWireValue> = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (entry === undefined) {
      throw new FirebaseRepositoryError(
        "invalid-data",
        `Firestore 欄位 '${key}' 不可為 undefined。`
      );
    }
    result[key] = toFirestoreWire(entry);
  });
  return result;
}
function isTimestampWire(value: Record<string, unknown>): boolean {
  return (
    value.__firestoreType === "timestamp" &&
    typeof value.iso === "string" &&
    Object.keys(value).length === 2
  );
}

export function fromFirestoreWire(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new FirebaseRepositoryError(
        "invalid-data",
        "Firestore 回傳了非有限數字。"
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(fromFirestoreWire);
  }
  if (!isRecord(value)) {
    throw new FirebaseRepositoryError(
      "invalid-data",
      "Firestore 回傳資料不是可驗證的 JSON 物件。"
    );
  }
  if (isTimestampWire(value)) {
    const iso = value.iso;
    if (typeof iso !== "string" || !ISO_DATE_TIME.test(iso)) {
      throw new FirebaseRepositoryError(
        "invalid-data",
        "Firestore Timestamp wire value 不合法。"
      );
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      throw new FirebaseRepositoryError(
        "invalid-data",
        "Firestore Timestamp 無法轉換為 ISO DateTime。"
      );
    }
    return date.toISOString();
  }
  const result: Record<string, JsonValue> = {};
  Object.entries(value).forEach(([key, entry]) => {
    result[key] = fromFirestoreWire(entry);
  });
  return result;
}
