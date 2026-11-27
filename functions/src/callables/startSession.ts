import { localOperation, LocalError } from "../localCall.js";
import type { Session } from "@focus/shared";
import { db, bucket, FieldValue } from "../localStore.js";
import {
  emptyUsageAggregate,
  loadOwnedSession,
  requireAuth,
  requireSessionOwner,
} from "./common.js";

export const startSession = localOperation(async (request) => {
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
    throw new LocalError("internal", "Failed to create session.");
  }
  return { sessionId: ref.id };
});

export const stopSession = localOperation(async (request) => {
  const uid = requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  if (!sessionId) throw new LocalError("invalid-argument", "sessionId required.");

  const { ref } = await loadOwnedSession(sessionId, uid);
  await ref.update({ status: "stopped", endedAt: Date.now() });
  return { ok: true };
});

// Reactivate a stopped session so monitoring picks up in the same session,
// continuing on top of its existing observations, hypothesis, and workflows.
export const resumeSession = localOperation(async (request) => {
  const uid = requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  if (!sessionId) throw new LocalError("invalid-argument", "sessionId required.");

  const { ref } = await loadOwnedSession(sessionId, uid);
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

export const deleteSession = localOperation(async (request) => {
  const uid = requireAuth(request);
  const sessionId = cleanSessionId(request.data?.sessionId);
  if (!sessionId) throw new LocalError("invalid-argument", "Valid sessionId required.");

  const ref = db.collection("sessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };

  const session = snap.data() as Session;
  requireSessionOwner(session, uid);

  await db.recursiveDelete(ref);
  await bucket.deleteFiles({ prefix: `screenshots/${sessionId}/`, force: true });
  return { ok: true };
});

function cleanSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^[A-Za-z0-9_-]{1,160}$/.test(id) ? id : null;
}
