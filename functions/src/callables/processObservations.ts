import { createHash, randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  directAddressUnderstanding,
  type DwellInput,
  type Observation,
  type Session,
  type Workflow,
} from "@focus/shared";
import { db } from "../firebaseApp.js";
import { runMonitoring, type BatchObservationInput } from "../agent/runAgent.js";
import {
  CALLABLE_OPTS,
  HYPOTHESIS_PATH,
  WORKFLOWS_PATH,
  configureEnv,
  fileContent,
  agentErrorMessage,
  loadSession,
  recordUsage,
  requireAuth,
  toAgentHttpsError,
  uploadDataUrl,
} from "./common.js";

// A run holding the interpretation lock longer than this is treated as dead
// (timed out / crashed before releasing) and the lock is reclaimed.
const STALE_LOCK_MS = 120_000;
// How many recent still-"Analyzing" moments a winning run folds its
// interpretation into, so moments saved while the lock was held don't stay
// pending forever.
const PENDING_SWEEP_LIMIT = 40;

/**
 * Two-phase monitoring loop:
 *
 * 1. Always persist the raw dwell observations immediately so the attention
 *    timeline fills on every call, decoupled from the slow agent run.
 * 2. Try to claim a per-session lock for the expensive agent interpretation.
 *    If another run holds it, the observations are already saved, so we just
 *    skip the interpretation (no work and no moments are ever lost). A stale
 *    lock left by a crashed/timed-out run is reclaimed automatically.
 */
export const processObservations = onCall(CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  const observations = (request.data?.observations as DwellInput[]) ?? [];
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required.");
  if (observations.length === 0) return { skipped: true, reason: "empty-batch" };

  const ref = db.collection("sessions").doc(sessionId);
  const { session } = await loadSession(sessionId);
  const batchId = randomUUID();

  // --- Phase 1: persist raw observations + screenshots immediately. ---
  const obsDocs: Observation[] = [];
  const agentInputs: BatchObservationInput[] = [];

  for (const dwell of observations) {
    const obsId = observationId(sessionId, dwell);
    let fullUrl: string | undefined;
    let cropUrl: string | undefined;
    if (dwell.fullScreenshotDataUrl) {
      fullUrl = await uploadDataUrl(
        `screenshots/${sessionId}/${obsId}-full`,
        dwell.fullScreenshotDataUrl,
      );
    }
    if (dwell.cursorCropDataUrl) {
      cropUrl = await uploadDataUrl(
        `screenshots/${sessionId}/${obsId}-crop`,
        dwell.cursorCropDataUrl,
      );
    }
    const obsDoc: Observation = {
      id: obsId,
      sessionId,
      batchId,
      timestamp: dwell.timestamp,
      app: dwell.app,
      windowTitle: dwell.windowTitle,
      mouse: dwell.mouse,
      dwellMs: dwell.dwellMs,
      novelty: dwell.novelty,
      frameHash: dwell.frameHash,
      summary: "",
      inferredIntent: "",
      confidence: 0,
      evidence: [],
      alternatives: [],
      suggestedNextAction: "",
    };
    // Only attach screenshot URLs when a capture succeeded; undefined values are
    // fine now that Firestore is configured with ignoreUndefinedProperties.
    if (fullUrl) obsDoc.fullScreenshotUrl = fullUrl;
    if (cropUrl) obsDoc.cursorCropUrl = cropUrl;
    obsDocs.push(obsDoc);
    agentInputs.push({
      obsId,
      app: dwell.app,
      windowTitle: dwell.windowTitle,
      dwellMs: dwell.dwellMs,
      novelty: dwell.novelty,
      timestamp: dwell.timestamp,
      fullScreenshotDataUrl: dwell.fullScreenshotDataUrl,
      cursorCropDataUrl: dwell.cursorCropDataUrl,
    });
  }

  const rawBatch = db.batch();
  for (const obs of obsDocs) {
    rawBatch.set(ref.collection("observations").doc(obs.id), obs, { merge: true });
  }
  await rawBatch.commit();
  await ref.update({
    agentActivity: activityForObservations(observations),
    agentActivityAt: Date.now(),
  });

  // --- Phase 2: claim the interpretation lock (reclaiming a stale one). ---
  const now = Date.now();
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Session not found.");
    const data = snap.data() as Session;
    const heldFresh = data.updateInFlight && now - (data.updateInFlightAt ?? 0) < STALE_LOCK_MS;
    if (heldFresh) return false;
    tx.update(ref, {
      updateInFlight: true,
      updateInFlightAt: now,
      agentActivity: reasoningActivity(obsDocs.length),
      agentActivityAt: now,
      lastError: "",
      lastErrorAt: 0,
    });
    return true;
  });

  if (!claimed) {
    // Observations are already saved; another run is interpreting. No data lost.
    return { ok: true, interpreted: false, reason: "update-in-flight", persisted: obsDocs.length };
  }

  try {
    const apiKey = configureEnv();
    const startedAt = Date.now();

    const result = await runMonitoring({
      apiKey,
      priorHypothesis: fileContent(session.agentFiles, HYPOTHESIS_PATH),
      priorWorkflows: fileContent(session.agentFiles, WORKFLOWS_PATH),
      currentIntent: session.currentIntent,
      activeApps: session.activeApps,
      observations: agentInputs,
    });
    const update = directAddressUnderstanding(result.update);
    const usage = result.usage;

    // Fold the interpretation into this batch plus any still-pending moments
    // that were saved while the lock was held, so nothing stays "Analyzing".
    const pendingSnap = await ref
      .collection("observations")
      .orderBy("timestamp", "desc")
      .limit(PENDING_SWEEP_LIMIT)
      .get();
    const toEnrich = new Map<string, FirebaseFirestore.DocumentReference>();
    for (const obs of obsDocs) toEnrich.set(obs.id, ref.collection("observations").doc(obs.id));
    for (const doc of pendingSnap.docs) {
      if (!(doc.data() as Observation).summary) toEnrich.set(doc.id, doc.ref);
    }

    const enrichBatch = db.batch();
    for (const docRef of toEnrich.values()) {
      enrichBatch.set(
        docRef,
        {
          summary: update.batchSummary,
          inferredIntent: update.currentIntent,
          confidence: update.confidence,
          evidence: update.evidence,
          alternatives: update.alternatives,
          suggestedNextAction: update.suggestedNextAction,
        },
        { merge: true },
      );
    }
    await enrichBatch.commit();

    const workflows: Workflow[] = update.discoveredWorkflows ?? [];
    await ref.update({
      status: "active",
      currentIntent: update.currentIntent,
      confidence: update.confidence,
      activeApps: update.activeApps,
      discoveredWorkflows: workflows,
      agentFiles: {
        ...session.agentFiles,
        [HYPOTHESIS_PATH]: update.hypothesisMarkdown,
        [WORKFLOWS_PATH]: update.workflowsMarkdown,
      },
      lastUpdateAt: Date.now(),
      agentActivity: update.batchSummary || update.currentIntent || "Agent update complete.",
      agentActivityAt: Date.now(),
      lastError: "",
      lastErrorAt: 0,
      updateInFlight: false,
      updateInFlightAt: 0,
    });

    await recordUsage(ref, "observation", usage, Date.now() - startedAt);

    return {
      ok: true,
      interpreted: true,
      currentIntent: update.currentIntent,
      confidence: update.confidence,
      observationCount: obsDocs.length,
    };
  } catch (err) {
    console.error("processObservations failed", err);
    const callableErr = toAgentHttpsError(err);
    await ref
      .update({
        updateInFlight: false,
        updateInFlightAt: 0,
        agentActivity: "Agent update failed.",
        agentActivityAt: Date.now(),
        lastError: agentErrorMessage(err),
        lastErrorAt: Date.now(),
      })
      .catch(() => undefined);
    throw callableErr;
  }
});

function observationId(sessionId: string, dwell: DwellInput): string {
  const clientId = cleanClientObservationId(dwell.clientObservationId);
  if (clientId) return clientId;

  const stable = JSON.stringify([
    sessionId,
    dwell.timestamp,
    dwell.app,
    dwell.windowTitle,
    dwell.dwellMs,
    dwell.novelty,
    dwell.frameHash,
    dwell.mouse?.x,
    dwell.mouse?.y,
  ]);
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

function cleanClientObservationId(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(id)) return null;
  return id;
}

function activityForObservations(observations: DwellInput[]): string {
  const count = observations.length;
  const latest = observations[count - 1];
  const app = latest?.app?.trim();
  if (count === 1 && app) return `Captured new activity in ${app}.`;
  return `Captured ${count} new moments.`;
}

function reasoningActivity(count: number): string {
  return count === 1
    ? "Agent is analyzing 1 new moment."
    : `Agent is analyzing ${count} new moments.`;
}
