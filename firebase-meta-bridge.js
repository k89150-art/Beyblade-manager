function firebaseError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function toFirestore(value, Timestamp) {
  if (Array.isArray(value)) {
    return value.map(entry => toFirestore(entry, Timestamp));
  }
  if (value && typeof value === "object") {
    if (
      value.__firestoreType === "timestamp" &&
      typeof value.iso === "string"
    ) {
      return Timestamp.fromDate(new Date(value.iso));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        toFirestore(entry, Timestamp)
      ])
    );
  }
  return value;
}

function fromFirestore(value, Timestamp) {
  if (value instanceof Timestamp) {
    return {
      __firestoreType: "timestamp",
      iso: value.toDate().toISOString()
    };
  }
  if (Array.isArray(value)) {
    return value.map(entry => fromFirestore(entry, Timestamp));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        fromFirestore(entry, Timestamp)
      ])
    );
  }
  return value;
}

function principal(user) {
  return user
    ? { uid: user.uid, email: user.email || null }
    : null;
}

async function loadFirebaseModules() {
  return Promise.all([
    import("https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js")
  ]);
}

async function createRuntime(config, emulator) {
  const [appModule, authModule, firestoreModule] =
    await loadFirebaseModules();
  const existing = appModule.getApps().find(
    app => app.options.projectId === config.projectId
  );
  const app = existing ||
    (appModule.getApps().length === 0
      ? appModule.initializeApp(config)
      : appModule.initializeApp(config, `meta-${config.projectId}`));
  const auth = authModule.getAuth(app);
  const db = firestoreModule.getFirestore(app);

  if (emulator && !globalThis.__META_FIREBASE_EMULATORS_CONNECTED__) {
    authModule.connectAuthEmulator(
      auth,
      emulator.authUrl,
      { disableWarnings: true }
    );
    firestoreModule.connectFirestoreEmulator(
      db,
      emulator.firestoreHost,
      emulator.firestorePort
    );
    globalThis.__META_FIREBASE_EMULATORS_CONNECTED__ = true;
  }

  return Object.freeze({
    auth: {
      getPrincipal() {
        if (auth.currentUser) {
          return Promise.resolve(principal(auth.currentUser));
        }
        return new Promise(resolve => {
          const unsubscribe = authModule.onAuthStateChanged(auth, user => {
            unsubscribe();
            resolve(principal(user));
          });
        });
      },
      async signInWithGoogle() {
        const result = await authModule.signInWithPopup(
          auth,
          new authModule.GoogleAuthProvider()
        );
        return principal(result.user);
      },
      signOut() {
        return authModule.signOut(auth);
      }
    },
    firestore: {
      async createDocument(collectionPath, documentId, data) {
        const reference = firestoreModule.doc(
          db,
          collectionPath,
          documentId
        );
        await firestoreModule.runTransaction(db, async transaction => {
          const current = await transaction.get(reference);
          if (current.exists()) {
            throw firebaseError(
              "already-exists",
              `Document '${collectionPath}/${documentId}' already exists.`
            );
          }
          transaction.set(
            reference,
            toFirestore(data, firestoreModule.Timestamp)
          );
        });
      },
      async getDocument(collectionPath, documentId) {
        const snapshot = await firestoreModule.getDocFromServer(
          firestoreModule.doc(db, collectionPath, documentId)
        );
        return snapshot.exists()
          ? {
              id: snapshot.id,
              data: fromFirestore(
                snapshot.data(),
                firestoreModule.Timestamp
              )
            }
          : undefined;
      },
      async listDocuments(collectionPath, filter) {
        const base = firestoreModule.collection(db, collectionPath);
        const source = filter
          ? firestoreModule.query(
              base,
              firestoreModule.where(filter.field, "==", filter.value)
            )
          : base;
        const snapshot = await firestoreModule.getDocsFromServer(source);
        return snapshot.docs.map(item => ({
          id: item.id,
          data: fromFirestore(item.data(), firestoreModule.Timestamp)
        }));
      },
      async commit(writes) {
        const batch = firestoreModule.writeBatch(db);
        writes.forEach(write => {
          if (write.operation !== "upsert") {
            throw firebaseError(
              "invalid-argument",
              `Unsupported Firestore operation '${write.operation}'.`
            );
          }
          batch.set(
            firestoreModule.doc(
              db,
              write.collectionPath,
              write.documentId
            ),
            toFirestore(write.data, firestoreModule.Timestamp)
          );
        });
        await batch.commit();
      }
    }
  });
}

globalThis.__META_FIREBASE_RUNTIME_FACTORY__ = Object.freeze({
  create: createRuntime
});
