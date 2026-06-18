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
  OBSERVATION_INGEST_CALLABLE_OPTS,
  WORKFLOWS_PATH,
  configureEnv,
  downloadStorageImageAsDataUrl,
  fileContent,
  agentErrorMessage,
  loadSession,
  recordUsage,
  requireAuth,
  storagePathFromDownloadUrl,
  toAgentHttpsError,
  uploadDataUrl,
} from "./common.js";

// A run holding the interpretation lock longer than this is treated as dead
// (timed out / crashed before releasing) and the lock is reclaimed.
const STALE_LOCK_MS = 120_000;
export const SYNTHESIS_BATCH_SIZE = 8;

type SynthesisReason = "timer" | "stop";

interface IngestResult {
  persisted: number;
  observationIds: string[];
}

interface SynthesisResult {
  ok: true;
  interpreted: boolean;
  observationCount: number;
  currentIntent?: string;
  confidence?: number;
  reason?: string;
}

/**
 * Two-phase monitoring loop:
 *
 * 1. ingestObservations persists raw dwell observations immediately so the
 *    attention timeline fills quickly and independently.
 * 2. synthesizePendingObservations claims a per-session lock and interprets the
 *    oldest unsummarized batch. The hypothesis remains single-writer even when
 *    ingest calls run in parallel.
 * 3. processObservations remains as a compatibility wrapper for older clients.
 */
export const ingestObservations = onCall(OBSERVATION_INGEST_CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  const observations = (request.data?.observations as DwellInput[]) ?? [];
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required.");
  if (observations.length === 0) {
    return { ok: true, persisted: 0, observationIds: [] };
  }

  const result = await persistRawObservations(sessionId, observations);
  return { ok: true, ...result };
});

export const synthesizePendingObservations = onCall(CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required.");
  return synthesizePendingObservationBatch(sessionId, cleanSynthesisReason(request.data?.reason));
});

export const processObservations = onCall(CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  const observations = (request.data?.observations as DwellInput[]) ?? [];
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required.");
  if (observations.length === 0) return { skipped: true, reason: "empty-batch" };

  const ingest = await persistRawObservations(sessionId, observations);
  const synthesis = await synthesizePendingObservationBatch(sessionId, "timer");
  return {
    ...synthesis,
    persisted: ingest.persisted,
    observationIds: ingest.observationIds,
  };
});

export async function persistRawObservations(
  sessionId: string,
  observations: DwellInput[],
): Promise<IngestResult> {
  const { ref } = await loadSession(sessionId);
  const batchId = randomUUID();

  const obsDocs: Observation[] = [];

  for (const dwell of observations) {
    const obsId = observationId(sessionId, dwell);
    const fullPath = `screenshots/${sessionId}/${obsId}-full`;
    const cropPath = `screenshots/${sessionId}/${obsId}-crop`;
    let fullUrl: string | undefined;
    let cropUrl: string | undefined;
    if (dwell.fullScreenshotDataUrl) {
      fullUrl = await uploadDataUrl(fullPath, dwell.fullScreenshotDataUrl);
    }
    if (dwell.cursorCropDataUrl) {
      cropUrl = await uploadDataUrl(cropPath, dwell.cursorCropDataUrl);
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
    if (fullUrl) {
      obsDoc.fullScreenshotUrl = fullUrl;
      obsDoc.fullScreenshotPath = fullPath;
    }
    if (cropUrl) {
      obsDoc.cursorCropUrl = cropUrl;
      obsDoc.cursorCropPath = cropPath;
    }
    obsDocs.push(obsDoc);
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

  return {
    persisted: obsDocs.length,
    observationIds: obsDocs.map((obs) => obs.id),
  };
}

export async function synthesizePendingObservationBatch(
  sessionId: string,
  _reason: SynthesisReason,
): Promise<SynthesisResult> {
  const { ref } = await loadSession(sessionId);
  const now = Date.now();
  const claimed = await claimSynthesisLock(ref, now);

  if (!claimed) {
    return { ok: true, interpreted: false, observationCount: 0, reason: "update-in-flight" };
  }

  try {
    const pending = await loadPendingObservations(ref);
    if (pending.length === 0) {
      await releaseSynthesisLock(ref);
      return { ok: true, interpreted: false, observationCount: 0, reason: "no-pending" };
    }

    await ref.update({
      agentActivity: reasoningActivity(pending.length),
      agentActivityAt: Date.now(),
    });

    const sessionSnap = await ref.get();
    if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found.");
    const session = sessionSnap.data() as Session;
    const apiKey = configureEnv();
    const startedAt = Date.now();

    const result = await runMonitoring({
      apiKey,
      priorHypothesis: fileContent(session.agentFiles, HYPOTHESIS_PATH),
      priorWorkflows: fileContent(session.agentFiles, WORKFLOWS_PATH),
      currentIntent: session.currentIntent,
      activeApps: session.activeApps,
      observations: await Promise.all(pending.map(agentInputFromObservation)),
    });
    const update = directAddressUnderstanding(result.update);
    const usage = result.usage;

    const enrichBatch = db.batch();
    const observationSummary =
      update.batchSummary || update.currentIntent || "Analyzed captured activity.";
    for (const obs of pending) {
      enrichBatch.set(
        ref.collection("observations").doc(obs.id),
        {
          summary: observationSummary,
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
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      const status = (cur.data() as Session | undefined)?.status;
      const sessionUpdate: Record<string, unknown> = {
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
      };
      if (status === "active") sessionUpdate.status = "active";
      tx.update(ref, sessionUpdate);
    });

    await recordUsage(ref, "observation", usage, Date.now() - startedAt);

    return {
      ok: true,
      interpreted: true,
      currentIntent: update.currentIntent,
      confidence: update.confidence,
      observationCount: pending.length,
    };
  } catch (err) {
    console.error("synthesizePendingObservations failed", err);
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
}

async function claimSynthesisLock(
  ref: FirebaseFirestore.DocumentReference,
  now: number,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Session not found.");
    const data = snap.data() as Session;
    const heldFresh = data.updateInFlight && now - (data.updateInFlightAt ?? 0) < STALE_LOCK_MS;
    if (heldFresh) return false;
    tx.update(ref, {
      updateInFlight: true,
      updateInFlightAt: now,
      lastError: "",
      lastErrorAt: 0,
    });
    return true;
  });
}

async function releaseSynthesisLock(ref: FirebaseFirestore.DocumentReference): Promise<void> {
  await ref.update({
    updateInFlight: false,
    updateInFlightAt: 0,
  });
}

async function loadPendingObservations(
  ref: FirebaseFirestore.DocumentReference,
): Promise<Observation[]> {
  const snap = await ref
    .collection("observations")
    .where("summary", "==", "")
    .orderBy("timestamp", "asc")
    .limit(SYNTHESIS_BATCH_SIZE)
    .get();
  return snap.docs.map((doc) => doc.data() as Observation);
}

export async function agentInputFromObservation(obs: Observation): Promise<BatchObservationInput> {
  return {
    obsId: obs.id,
    app: obs.app,
    windowTitle: obs.windowTitle,
    dwellMs: obs.dwellMs,
    novelty: obs.novelty,
    timestamp: obs.timestamp,
    fullScreenshotDataUrl: await observationImageDataUrl(
      obs.fullScreenshotPath,
      obs.fullScreenshotUrl,
    ),
    cursorCropDataUrl: await observationImageDataUrl(obs.cursorCropPath, obs.cursorCropUrl),
  };
}

async function observationImageDataUrl(
  storagePath: string | undefined,
  downloadUrl: string | undefined,
): Promise<string | undefined> {
  const existingDataUrl = [storagePath, downloadUrl].find((value) => value?.startsWith("data:"));
  if (existingDataUrl) return existingDataUrl;

  const resolvedPath =
    storagePath && !storagePath.startsWith("http") && !storagePath.startsWith("gs://")
      ? storagePath
      : (storagePathFromDownloadUrl(storagePath ?? "") ??
        storagePathFromDownloadUrl(downloadUrl ?? ""));
  if (!resolvedPath) return undefined;

  try {
    return await downloadStorageImageAsDataUrl(resolvedPath);
  } catch (err) {
    console.warn("Failed to load persisted observation image for synthesis", {
      storagePath: resolvedPath,
      err,
    });
    return undefined;
  }
}

function cleanSynthesisReason(value: unknown): SynthesisReason {
  return value === "stop" ? "stop" : "timer";
}

export function observationId(sessionId: string, dwell: DwellInput): string {
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

export function cleanClientObservationId(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(id)) return null;
  return id;
}

export function activityForObservations(observations: DwellInput[]): string {
  const count = observations.length;
  const latest = observations[count - 1];
  const app = latest?.app?.trim();
  if (count === 1 && app) return `Captured new activity in ${app}.`;
  return `Captured ${count} new moments.`;
}

export function reasoningActivity(count: number): string {
  return count === 1
    ? "Agent is analyzing 1 new moment."
    : `Agent is analyzing ${count} new moments.`;
}
