import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { Session } from "@focus/shared";
import { db, FieldValue } from "../firebaseApp.js";
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
