export type FirebaseRepositoryErrorCode =
  | "already-exists"
  | "permission-denied"
  | "unauthenticated"
  | "offline"
  | "missing-config"
  | "invalid-data"
  | "entity-not-found"
  | "repository-error";

export class FirebaseRepositoryError extends Error {
  readonly code: FirebaseRepositoryErrorCode;
  readonly retryable: boolean;
  readonly details: readonly string[];

  constructor(
    code: FirebaseRepositoryErrorCode,
    message: string,
    retryable = false,
    details: readonly string[] = []
  ) {
    super(message);
    this.name = "FirebaseRepositoryError";
    this.code = code;
    this.retryable = retryable;
    this.details = [...details];
  }
}

export function normalizeFirebaseError(error: unknown): FirebaseRepositoryError {
  if (error instanceof FirebaseRepositoryError) return error;
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";
  if (code.includes("permission-denied")) {
    return new FirebaseRepositoryError(
      "permission-denied",
      "你沒有執行這項 Firebase 操作的權限。"
    );
  }
  if (code.includes("unauthenticated")) {
    return new FirebaseRepositoryError(
      "unauthenticated",
      "請先登入 Google 帳號後再讀取正式 Meta 資料。"
    );
  }
  if (
    code.includes("unavailable") ||
    code.includes("network") ||
    code.includes("deadline-exceeded")
  ) {
    return new FirebaseRepositoryError(
      "offline",
      "目前無法連線至 Firebase，請檢查網路後重試。",
      true
    );
  }
  if (code.includes("already-exists")) {
    return new FirebaseRepositoryError(
      "already-exists",
      "相同 ID 的資料已存在，未重複寫入。"
    );
  }
  return new FirebaseRepositoryError(
    "repository-error",
    error instanceof Error ? error.message : "Firebase Repository 操作失敗。",
    true
  );
}
