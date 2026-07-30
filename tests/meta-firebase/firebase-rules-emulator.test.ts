import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  after,
  before,
  beforeEach,
  test
} from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from "firebase/firestore";

const PROJECT_ID = "demo-beyblade-meta";
const ADMIN_UID = "SesDhvXG6MUT38YhqGl0N6lVgMz1";
const USER_UID = "regular-user";
const ENTITY_ID = "ent_12345678-1234-4123-8123-123456789abc";
const SECOND_ENTITY_ID = "ent_87654321-4321-4123-8123-cba987654321";
const EVIDENCE_ID = "evidence-rules-1";
const PROFILE_ID = "profile-rules-1";
let environment: RulesTestEnvironment;

function evidence(
  id = EVIDENCE_ID,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    evidenceId: id,
    entityId: ENTITY_ID,
    lifecycleStatus: "active",
    dataMode: "production",
    eventDate: "2026-07-20",
    createdAt: Timestamp.fromDate(new Date("2026-07-20T10:00:00Z")),
    payload: { record: { id } },
    ...overrides
  };
}

function profile(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    profileId: PROFILE_ID,
    entityId: ENTITY_ID,
    analysisRunId: "analysis-run-rules-1",
    lifecycleStatus: "active",
    dataMode: "production",
    currentAt: Timestamp.fromDate(new Date("2026-07-30T00:00:00Z")),
    payload: { id: PROFILE_ID },
    ...overrides
  };
}

function analysisResult(
  version = "1.0.0",
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    entityId: ENTITY_ID,
    analysisDate: "2026-07-30",
    modelId: "confidence-mvp",
    modelVersion: version,
    generatedAt: Timestamp.fromDate(new Date("2026-07-30T00:00:00Z")),
    lifecycleStatus: "active",
    dataMode: "production",
    traceReferences: ["trace-1", "snapshot-2026-07-30"],
    payload: { confidenceScore: 80 },
    ...overrides
  };
}

function evidencePath(id = EVIDENCE_ID): string {
  return `metaEvidence/${id}`;
}

function profilePath(entityId = ENTITY_ID): string {
  return `metaProfiles/${entityId}`;
}

function resultPath(
  id = "confidence-2026-07-30-v1"
): string {
  return `${profilePath()}/analysisResults/${id}`;
}

before(async () => {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  assert.ok(firestoreHost, "Firestore Emulator environment is required.");
  assert.ok(authHost, "Authentication Emulator environment is required.");

  const [host, port = "8080"] = firestoreHost.split(":");
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync("firestore.rules", "utf8")
    }
  });

  const authResponse = await fetch(`http://${authHost}/`);
  assert.ok(
    authResponse.status >= 200 && authResponse.status < 500,
    "Authentication Emulator must be reachable."
  );
});

beforeEach(async () => {
  await environment.clearFirestore();
});

after(async () => {
  await environment.cleanup();
});

test("signed-in users can read, while anonymous users cannot", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), evidencePath()),
      evidence()
    );
  });

  await assertFails(
    getDoc(doc(environment.unauthenticatedContext().firestore(), evidencePath()))
  );
  await assertSucceeds(
    getDoc(
      doc(
        environment.authenticatedContext(USER_UID).firestore(),
        evidencePath()
      )
    )
  );
});

test("regular users cannot create Evidence, while Admin can", async () => {
  await assertFails(
    setDoc(
      doc(
        environment.authenticatedContext(USER_UID).firestore(),
        evidencePath()
      ),
      evidence()
    )
  );
  await assertSucceeds(
    setDoc(
      doc(
        environment.authenticatedContext(ADMIN_UID).firestore(),
        evidencePath()
      ),
      evidence()
    )
  );
});

test("Evidence rejects invalid IDs, dates, fields, Seed markers, and missing fields", async () => {
  const admin = environment.authenticatedContext(ADMIN_UID).firestore();
  await assertFails(
    setDoc(
      doc(admin, evidencePath("bad-entity")),
      evidence("bad-entity", { entityId: "UX-03" })
    )
  );
  await assertFails(
    setDoc(
      doc(admin, evidencePath("bad-date")),
      evidence("bad-date", { eventDate: "30/07/2026" })
    )
  );
  await assertFails(
    setDoc(
      doc(admin, evidencePath("unknown-field")),
      evidence("unknown-field", { unexpected: true })
    )
  );
  await assertFails(
    setDoc(
      doc(admin, evidencePath("seed-marker")),
      evidence("seed-marker", { seed: true })
    )
  );

  const missing = evidence("missing-payload");
  delete missing.payload;
  await assertFails(
    setDoc(doc(admin, evidencePath("missing-payload")), missing)
  );
});

test("Evidence ID is create-only and repeated writes remain idempotent", async () => {
  const admin = environment.authenticatedContext(ADMIN_UID).firestore();
  await assertSucceeds(
    setDoc(doc(admin, evidencePath()), evidence())
  );
  await assertFails(
    setDoc(
      doc(admin, evidencePath()),
      evidence(EVIDENCE_ID, { payload: { record: { id: "changed" } } })
    )
  );
  await assertSucceeds(
    getDoc(doc(admin, evidencePath()))
  );
});

test("MetaProfile writes are Admin-only and immutable identity is protected", async () => {
  const user = environment.authenticatedContext(USER_UID).firestore();
  const admin = environment.authenticatedContext(ADMIN_UID).firestore();
  await assertFails(setDoc(doc(user, profilePath()), profile()));
  await assertSucceeds(setDoc(doc(admin, profilePath()), profile()));
  await assertFails(
    updateDoc(doc(admin, profilePath()), {
      profileId: "changed-profile"
    })
  );
  await assertFails(
    updateDoc(doc(admin, profilePath()), {
      entityId: SECOND_ENTITY_ID
    })
  );
  await assertFails(
    updateDoc(doc(admin, profilePath()), {
      lifecycleStatus: "disabled"
    })
  );
  await assertFails(
    updateDoc(doc(admin, profilePath()), {
      payload: deleteField()
    })
  );
});

test("Analysis Results reject invalid model identity and unauthorized writes", async () => {
  const user = environment.authenticatedContext(USER_UID).firestore();
  const admin = environment.authenticatedContext(ADMIN_UID).firestore();
  await assertFails(
    setDoc(doc(user, resultPath()), analysisResult())
  );
  await assertFails(
    setDoc(
      doc(admin, resultPath("bad-model")),
      analysisResult("1.0.0", { modelId: "../confidence" })
    )
  );
  await assertFails(
    setDoc(
      doc(admin, resultPath("bad-version")),
      analysisResult("latest")
    )
  );
  await assertFails(
    setDoc(
      doc(admin, resultPath("bad-date")),
      analysisResult("1.0.0", { analysisDate: "2026/07/30" })
    )
  );
});

test("Analysis Result upsert preserves identity and supports version coexistence", async () => {
  const admin = environment.authenticatedContext(ADMIN_UID).firestore();
  await assertSucceeds(
    setDoc(doc(admin, resultPath()), analysisResult())
  );
  await assertSucceeds(
    updateDoc(doc(admin, resultPath()), {
      generatedAt: Timestamp.fromDate(new Date("2026-07-30T01:00:00Z")),
      payload: { confidenceScore: 82 }
    })
  );
  await assertSucceeds(
    setDoc(
      doc(admin, resultPath("confidence-2026-07-30-v2")),
      analysisResult("2.0.0")
    )
  );
  await assertFails(
    updateDoc(doc(admin, resultPath()), {
      modelId: "trend-mvp"
    })
  );
  await assertFails(
    updateDoc(doc(admin, resultPath()), {
      modelVersion: "3.0.0"
    })
  );
  await assertFails(
    updateDoc(doc(admin, resultPath()), {
      analysisDate: "2026-07-29"
    })
  );
  await assertFails(
    updateDoc(doc(admin, resultPath()), {
      unexpected: true
    })
  );
});

test("Admin still cannot delete formal Evidence, profiles, or results", async () => {
  const admin = environment.authenticatedContext(ADMIN_UID).firestore();
  await assertSucceeds(
    setDoc(doc(admin, evidencePath()), evidence())
  );
  await assertSucceeds(
    setDoc(doc(admin, profilePath()), profile())
  );
  await assertSucceeds(
    setDoc(doc(admin, resultPath()), analysisResult())
  );

  await assertFails(deleteDoc(doc(admin, evidencePath())));
  await assertFails(deleteDoc(doc(admin, profilePath())));
  await assertFails(deleteDoc(doc(admin, resultPath())));
});
