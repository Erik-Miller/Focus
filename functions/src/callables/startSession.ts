import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { Session } from "@focus/shared";
import { db, bucket, FieldValue } from "../firebaseApp.js";
import { CALLABLE_OPTS, emptyUsageAggregate, requireAuth } from "./common.js";

export const startSession = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const title = (request.data?.title as string | undefined)?.slice(0, 120);

  const ref = db.collection("sessions").doc();
  const now = Date.now();
  const session: Session = {
    id: ref.id,
    ownerUid: uid,
    status: "active",
    isDemo: false,
    title: title || "Focus session",
    startedAt: now,
    currentIntent: "",
    confidence: 0,
    activeApps: [],
    discoveredWorkflows: [],
    agentFiles: {},
    usage: emptyUsageAggregate(),
    lastUpdateAt: 0,
    updateInFlight: false,
  };
  await ref.set(session);

  if (!session.id) {
    throw new HttpsError("internal", "Failed to create session.");
  }
  return { sessionId: ref.id };
});

export const stopSession = onCall(CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required.");

  const ref = db.collection("sessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Session not found.");
  await ref.update({ status: "stopped", endedAt: Date.now(), updateInFlight: false });
  return { ok: true };
});

// Reactivate a stopped session so monitoring picks up in the same session,
// continuing on top of its existing observations, hypothesis, and workflows.
export const resumeSession = onCall(CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required.");

  const ref = db.collection("sessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Session not found.");
  await ref.update({
    status: "active",
    endedAt: FieldValue.delete(),
    updateInFlight: false,
    updateInFlightAt: 0,
    lastError: "",
    lastErrorAt: 0,
  });
  return { ok: true };
});

export const deleteSession = onCall(
  { timeoutSeconds: 120, memory: "512MiB", region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const sessionId = cleanSessionId(request.data?.sessionId);
    if (!sessionId) throw new HttpsError("invalid-argument", "Valid sessionId required.");

    const ref = db.collection("sessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) return { ok: true };

    const session = snap.data() as Session;
    if (session.ownerUid !== uid) {
      throw new HttpsError("permission-denied", "You can only delete your own sessions.");
    }

    await db.recursiveDelete(ref);
    await bucket.deleteFiles({ prefix: `screenshots/${sessionId}/`, force: true });
    return { ok: true };
  },
);

function cleanSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^[A-Za-z0-9_-]{1,160}$/.test(id) ? id : null;
}
