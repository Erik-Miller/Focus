import { afterEach, vi } from "vitest";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
process.env.GCLOUD_PROJECT ??= "focus-test";
process.env.FIREBASE_CONFIG ??= JSON.stringify({
  projectId: "focus-test",
  storageBucket: "focus-test.appspot.com",
});

afterEach(() => {
  vi.restoreAllMocks();
});
