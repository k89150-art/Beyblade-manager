export const DATA_SESSION_STATES = Object.freeze({
  UNAUTHENTICATED: "unauthenticated",
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
  READONLY: "readonly"
});

export const INITIAL_DOCUMENT_CONFLICT_CODE = "initial-document-conflict";

function getSessionKey(token) {
  if (!token) return "";
  return [token.ownerUid, token.targetUid, token.generation].join("|");
}

function normalizeFingerprintValue(value, seen) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new TypeError("Cannot fingerprint circular data");

  seen.add(value);
  const normalized = Array.isArray(value)
    ? value.map(item => normalizeFingerprintValue(item, seen))
    : Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) {
          result[key] = normalizeFingerprintValue(value[key], seen);
        }
        return result;
      }, {});
  seen.delete(value);
  return normalized;
}

export function createStableDataFingerprint(value) {
  return JSON.stringify(normalizeFingerprintValue(value, new WeakSet()));
}

export function createSessionSnapshotGate({ selectData = value => value } = {}) {
  let sessionKey = "";
  let cacheApplied = false;
  let serverConfirmed = false;
  let appliedFingerprint = null;

  function begin(token) {
    sessionKey = getSessionKey(token);
    cacheApplied = false;
    serverConfirmed = false;
    appliedFingerprint = null;
  }

  function matches(token) {
    return Boolean(sessionKey) && getSessionKey(token) === sessionKey;
  }

  function getFingerprint(data) {
    return createStableDataFingerprint(selectData(data));
  }

  function acceptCache(token, data) {
    if (!matches(token)) return Object.freeze({ current: false, apply: false });
    if (serverConfirmed || cacheApplied) {
      return Object.freeze({ current: true, apply: false });
    }

    cacheApplied = true;
    appliedFingerprint = getFingerprint(data);
    return Object.freeze({ current: true, apply: true });
  }

  function acceptServer(token, data) {
    if (!matches(token)) return Object.freeze({ current: false, apply: false });
    const fingerprint = getFingerprint(data);
    const apply = fingerprint !== appliedFingerprint;
    serverConfirmed = true;
    appliedFingerprint = fingerprint;
    return Object.freeze({ current: true, apply });
  }

  function noteApplied(token, data) {
    if (!matches(token)) return false;
    appliedFingerprint = getFingerprint(data);
    return true;
  }

  return Object.freeze({
    begin,
    acceptCache,
    acceptServer,
    noteApplied
  });
}

export function createPendingInteractionRegistry() {
  const cancelers = new Set();

  function register(cancel) {
    if (typeof cancel !== "function") {
      throw new TypeError("Pending interaction canceler must be a function");
    }
    cancelers.add(cancel);
    return () => cancelers.delete(cancel);
  }

  function cancelAll() {
    const pending = [...cancelers];
    cancelers.clear();
    pending.forEach(cancel => cancel());
  }

  function size() {
    return cancelers.size;
  }

  return Object.freeze({ register, cancelAll, size });
}

export async function writeDocumentSafely({ requiresCreate, createOnly, merge }) {
  if (requiresCreate) {
    try {
      return await createOnly();
    } catch (error) {
      if (error?.code === INITIAL_DOCUMENT_CONFLICT_CODE) throw error;
      throw error;
    }
  }
  return merge();
}

export function createDataSessionGuard() {
  let generation = 0;
  let session = Object.freeze({
    state: DATA_SESSION_STATES.UNAUTHENTICATED,
    ownerUid: null,
    targetUid: null,
    generation,
    readOnly: false
  });

  function snapshot() {
    return { ...session };
  }

  function matches(token) {
    return Boolean(token) &&
      token.generation === session.generation &&
      token.ownerUid === session.ownerUid &&
      token.targetUid === session.targetUid;
  }

  function begin({ ownerUid, targetUid = ownerUid, readOnly = false }) {
    if (!ownerUid || !targetUid) {
      throw new Error("Data session requires ownerUid and targetUid");
    }

    generation += 1;
    session = Object.freeze({
      state: DATA_SESSION_STATES.LOADING,
      ownerUid,
      targetUid,
      generation,
      readOnly: Boolean(readOnly)
    });
    return snapshot();
  }

  function markReady(token) {
    if (!matches(token) || ![
      DATA_SESSION_STATES.LOADING,
      DATA_SESSION_STATES.ERROR
    ].includes(session.state)) return false;

    session = Object.freeze({
      ...session,
      state: session.readOnly ? DATA_SESSION_STATES.READONLY : DATA_SESSION_STATES.READY
    });
    return true;
  }

  function markError(token) {
    if (!matches(token)) return false;
    session = Object.freeze({ ...session, state: DATA_SESSION_STATES.ERROR });
    return true;
  }

  function reset() {
    generation += 1;
    session = Object.freeze({
      state: DATA_SESSION_STATES.UNAUTHENTICATED,
      ownerUid: null,
      targetUid: null,
      generation,
      readOnly: false
    });
    return snapshot();
  }

  function captureWriteSession() {
    if (session.state !== DATA_SESSION_STATES.READY || session.readOnly) return null;
    if (!session.ownerUid || session.ownerUid !== session.targetUid) return null;
    return snapshot();
  }

  function isCurrent(token) {
    return matches(token);
  }

  function isWriteSessionCurrent(token) {
    return matches(token) &&
      session.state === DATA_SESSION_STATES.READY &&
      !session.readOnly &&
      session.ownerUid === session.targetUid;
  }

  return Object.freeze({
    begin,
    markReady,
    markError,
    reset,
    snapshot,
    isCurrent,
    captureWriteSession,
    isWriteSessionCurrent
  });
}
