import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let env: RulesTestEnvironment;

describe("Firebase security rules", () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: `focus-rules-${Date.now()}`,
      firestore: {
        rules: fs.readFileSync(path.join(root, "firestore.rules"), "utf8"),
      },
      storage: {
        rules: fs.readFileSync(path.join(root, "storage.rules"), "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.clearStorage();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "sessions/session1"), {
        ownerUid: "uid1",
        startedAt: 1,
      });
      await setDoc(doc(context.firestore(), "sessions/session1/observations/obs1"), {
        app: "Chrome",
      });
      await setDoc(doc(context.firestore(), "users/uid1/savedWorkflows/workflow1"), {
        prompt: "Build it",
      });
      await uploadBytes(ref(context.storage(), "screenshots/session1/obs1-crop"), new Blob(["ok"]));
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("allows signed-in reads for sessions and denies session writes", async () => {
    const authed = env.authenticatedContext("uid1").firestore();
    const anon = env.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(authed, "sessions/session1")));
    await assertSucceeds(getDoc(doc(authed, "sessions/session1/observations/obs1")));
    await assertFails(getDoc(doc(anon, "sessions/session1")));
    await assertFails(updateDoc(doc(authed, "sessions/session1"), { status: "active" }));
    await assertFails(setDoc(doc(authed, "sessions/session2"), { ownerUid: "uid1" }));
  });

  it("allows users to read only their own saved workflows and denies all client writes", async () => {
    const owner = env.authenticatedContext("uid1").firestore();
    const other = env.authenticatedContext("uid2").firestore();

    await assertSucceeds(getDoc(doc(owner, "users/uid1/savedWorkflows/workflow1")));
    await assertFails(getDoc(doc(other, "users/uid1/savedWorkflows/workflow1")));
    await assertFails(setDoc(doc(owner, "users/uid1/savedWorkflows/workflow2"), { prompt: "x" }));
    await assertFails(
      updateDoc(doc(owner, "users/uid1/savedWorkflows/workflow1"), { prompt: "x" }),
    );
  });

  it("allows signed-in screenshot reads and denies writes/other paths", async () => {
    const authed = env.authenticatedContext("uid1").storage();
    const anon = env.unauthenticatedContext().storage();

    await assertSucceeds(getBytes(ref(authed, "screenshots/session1/obs1-crop")));
    await assertFails(getBytes(ref(anon, "screenshots/session1/obs1-crop")));
    await assertFails(uploadBytes(ref(authed, "screenshots/session1/new-crop"), new Blob(["x"])));
    await assertFails(getBytes(ref(authed, "other/session1/obs1-crop")));
  });
});
