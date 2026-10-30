// In-memory stand-in for the Firestore Web SDK calls used by tournament.js.
//
// Transaction retries follow @firebase/firestore 4.7.6 (Firebase JS SDK
// 11.2.0), TransactionRunner:
// - each attempt runs updateFunction with a fresh transaction;
// - an error thrown synchronously by updateFunction is returned at once;
// - a rejected updateFunction promise or a failed commit is retried while
//   attempts remain, but only for errors named "FirebaseError" whose code is
//   aborted, failed-precondition, already-exists or not permanent
//   (cancelled, unknown, deadline-exceeded, resource-exhausted, internal,
//   unavailable, unauthenticated); anything else is returned as-is;
// - maxAttempts defaults to 5 and can be set with { maxAttempts }.
// Commits carry the versions read in the attempt as preconditions, like
// Precondition.updateTime / exists:false, and fail with failed-precondition.
//
// It is still a simulation: no real network, timing, credentials or Rules.
// It is not a replacement for checking against the Firestore Emulator.

function clone(value) {
  return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value));
}

export function firestoreError(code, message = code) {
  const error = new Error(message);
  error.name = "FirebaseError";
  error.code = code;
  return error;
}

const RETRYABLE = new Set([
  "aborted", "failed-precondition", "already-exists",
  "cancelled", "unknown", "deadline-exceeded", "resource-exhausted", "internal", "unavailable", "unauthenticated"
]);

export function isSdkRetryable(error) {
  return Boolean(error) && error.name === "FirebaseError" && RETRYABLE.has(error.code);
}

export function createMockFirestore({ defaultMaxAttempts = 5 } = {}) {
  const docs = new Map();
  const hooks = { beforeGet: [], beforeCommit: [], afterCommit: [], beforeServerGet: [] };
  const stats = {
    transactions: 0,
    callbackRuns: 0,
    commits: 0,
    rejectedCommits: 0,
    sdkRetries: 0,
    serverGets: 0
  };
  const commitLog = [];
  let online = true;

  function entry(path) {
    if (!docs.has(path)) docs.set(path, { exists: false, data: null, version: 0 });
    return docs.get(path);
  }

  function snapshotOf(path) {
    const current = entry(path);
    const data = current.exists ? clone(current.data) : null;
    return { exists: () => current.exists, data: () => clone(data) };
  }

  async function runHook(name, context) {
    const hook = hooks[name].shift();
    if (hook) await hook(context);
  }

  function requireNetwork() {
    if (!online) throw firestoreError("unavailable", "mock: offline");
  }

  function on(name, hook) {
    hooks[name].push(hook);
  }

  function seed(path, data) {
    const current = entry(path);
    current.exists = true;
    current.data = clone(data);
    current.version += 1;
  }

  function read(path) {
    const current = entry(path);
    return current.exists ? clone(current.data) : null;
  }

  // Another device or the main page writing with merge semantics.
  function externalMerge(path, fields) {
    const current = entry(path);
    current.data = { ...(current.exists ? current.data : {}), ...clone(fields) };
    current.exists = true;
    current.version += 1;
  }

  async function runAttempt(updateFunction, attempt) {
    const reads = new Map();
    const writes = [];
    let lastTransactionError = null;
    const transaction = {
      get: async ref => {
        await runHook("beforeGet", { path: ref.path, attempt });
        requireNetwork();
        reads.set(ref.path, entry(ref.path).version);
        return snapshotOf(ref.path);
      },
      update: (ref, fields) => {
        if (!reads.has(ref.path)) throw new Error("mock: write before read");
        if (!entry(ref.path).exists || reads.get(ref.path) === 0) {
          // Like the SDK: remembered and thrown when the commit starts.
          lastTransactionError = firestoreError("invalid-argument", "Can't update a document that doesn't exist.");
          return transaction;
        }
        writes.push({ kind: "update", path: ref.path, fields: clone(fields) });
        return transaction;
      },
      set: (ref, fields, options) => {
        if (!reads.has(ref.path)) throw new Error("mock: write before read");
        writes.push({ kind: "set", path: ref.path, fields: clone(fields), merge: Boolean(options?.merge) });
        return transaction;
      }
    };

    stats.callbackRuns += 1;
    let pending;
    try {
      pending = updateFunction(transaction);
    } catch (error) {
      return { error, retryable: false };
    }
    let result;
    try {
      result = await pending;
    } catch (error) {
      return { error, retryable: isSdkRetryable(error) };
    }

    try {
      if (lastTransactionError) throw lastTransactionError;
      await runHook("beforeCommit", { attempt, writes });
      requireNetwork();
      // The read versions are the commit's preconditions.
      const stale = [...reads].some(([path, version]) => entry(path).version !== version);
      if (stale) {
        stats.rejectedCommits += 1;
        throw firestoreError("failed-precondition", "mock: document changed since it was read");
      }
      for (const write of writes) {
        const current = entry(write.path);
        if (write.kind === "update") {
          current.data = { ...current.data, ...write.fields };
        } else {
          current.data = write.merge && current.exists ? { ...current.data, ...write.fields } : write.fields;
          current.exists = true;
        }
        current.version += 1;
      }
      if (writes.length) {
        stats.commits += 1;
        commitLog.push(clone(writes));
      }
      // A throwing afterCommit hook models a lost acknowledgement: the write
      // is on the server but the client only sees an error.
      await runHook("afterCommit", { attempt, writes });
    } catch (error) {
      return { error, retryable: isSdkRetryable(error) };
    }
    return { result };
  }

  async function runTransaction(db, updateFunction, options = {}) {
    stats.transactions += 1;
    const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;
    if (maxAttempts < 1) throw firestoreError("invalid-argument", "Max attempts must be at least 1");
    let attemptsLeft = maxAttempts;
    for (let attempt = 1; ; attempt += 1) {
      attemptsLeft -= 1;
      const outcome = await runAttempt(updateFunction, attempt);
      if (!outcome.error) return outcome.result;
      if (!outcome.retryable || attemptsLeft <= 0) throw outcome.error;
      stats.sdkRetries += 1;
    }
  }

  async function getDocFromServer(ref) {
    stats.serverGets += 1;
    await runHook("beforeServerGet", { path: ref.path });
    requireNetwork();
    return snapshotOf(ref.path);
  }

  const doc = (db, ...segments) => ({ path: segments.join("/") });

  return {
    doc,
    runTransaction,
    getDocFromServer,
    seed,
    read,
    externalMerge,
    on,
    stats,
    commitLog,
    setOnline(value) { online = Boolean(value); },
    get online() { return online; }
  };
}

export function userDocPath(uid) {
  return `users/${uid}/appData/main`;
}

// Same adapter shape as createTournamentTransactionRunner() in tournament.js:
// one SDK attempt per call (maxAttempts: 1).
export function createRunner(mock, path) {
  const ref = { path };
  return updateFunction => mock.runTransaction(null, transaction => updateFunction({
    get: async () => {
      const snapshot = await transaction.get(ref);
      const exists = snapshot.exists();
      return { exists, data: exists ? snapshot.data() || {} : null };
    },
    update: fields => transaction.update(ref, fields),
    create: fields => transaction.set(ref, fields)
  }), { maxAttempts: 1 });
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
