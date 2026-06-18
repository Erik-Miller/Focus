import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  directAddressReportContent,
  directAddressText,
  type Observation,
  type Report,
  type Session,
} from "@focus/shared";
import { db } from "../firebaseApp.js";
import { runReport } from "../agent/runAgent.js";
import {
  CALLABLE_OPTS,
  HYPOTHESIS_PATH,
  WORKFLOWS_PATH,
  agentErrorMessage,
  cleanTimeZone,
  configureEnv,
  fileContent,
  loadSession,
  observationsDigest,
  recordUsage,
  requireAuth,
  toAgentHttpsError,
} from "./common.js";
import { synthesizePendingObservationBatch } from "./processObservations.js";

const REPORT_ANALYSIS_WAIT_MS = 210_000;
const REPORT_ANALYSIS_POLL_MS = 2_000;
const REPORT_ANALYSIS_MAX_PASSES = 24;

export const generateReport = onCall(CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId required.");
  const timeZone = cleanTimeZone(request.data?.timeZone);

  const { ref } = await loadSession(sessionId);
  const startedAt = Date.now();
  await ref.update({ status: "reporting" });

  try {
    await ensureObservationsSynthesizedBeforeReport(sessionId, ref);

    const sessionSnap = await ref.get();
    if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found.");
    const session = sessionSnap.data() as Session;

    const obsSnap = await ref.collection("observations").orderBy("timestamp", "asc").get();
    const observations = obsSnap.docs.map((d) => d.data() as Observation);
    const obsById = new Map(observations.map((o) => [o.id, o]));

    const apiKey = configureEnv();
    const result = await runReport({
      apiKey,
      hypothesis: fileContent(session.agentFiles, HYPOTHESIS_PATH),
      workflows: fileContent(session.agentFiles, WORKFLOWS_PATH),
      observationsDigest: observationsDigest(observations, timeZone),
      timeZone,
    });
    const report = directAddressReportContent(result.report);
    const usage = result.usage;

    const reportRef = session.reportId
      ? ref.collection("reports").doc(session.reportId)
      : ref.collection("reports").doc();
    const previousReportSnap = await reportRef.get();
    const previousReport = previousReportSnap.exists ? (previousReportSnap.data() as Report) : null;
    const now = Date.now();
    const significantScreenshots = (report.significantScreenshots ?? []).map((s) => {
      const obs = obsById.get(s.obsId);
      return {
        obsId: s.obsId,
        caption: directAddressText(s.caption),
        screenshotUrl: obs?.cursorCropUrl ?? obs?.fullScreenshotUrl,
      };
    });

    const doc: Report = {
      id: reportRef.id,
      sessionId,
      createdAt: previousReport?.createdAt ?? now,
      objective: report.objective,
      focusAreas: report.focusAreas,
      timelineMarkdown: report.timelineMarkdown,
      significantScreenshots,
      interpretations: report.interpretations,
      workflows: report.workflows,
      nextSteps: report.nextSteps,
      narrative: report.narrative,
    };
    if (previousReport) doc.updatedAt = now;
    await reportRef.set(doc);
    // Only flip back to "stopped" if the session is still reporting. If the user
    // hit "Start monitoring" again mid-report, it's "active" and must stay that way.
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      const status = (cur.data() as Session | undefined)?.status;
      const update: Record<string, unknown> = {
        reportId: reportRef.id,
        lastError: "",
        lastErrorAt: 0,
      };
      if (status === "reporting") update.status = "stopped";
      tx.update(ref, update);
    });

    await recordUsage(ref, "report", usage, Date.now() - startedAt);

    return { reportId: reportRef.id };
  } catch (err) {
    console.error("generateReport failed", err);
    const callableErr = toAgentHttpsError(err);
    await db
      .runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        const status = (cur.data() as Session | undefined)?.status;
        const update: Record<string, unknown> = {
          lastError: agentErrorMessage(err),
          lastErrorAt: Date.now(),
        };
        if (status === "reporting") update.status = "stopped";
        tx.update(ref, update);
      })
      .catch(() => undefined);
    throw callableErr;
  }
});

export async function ensureObservationsSynthesizedBeforeReport(
  sessionId: string,
  ref: FirebaseFirestore.DocumentReference,
  options: {
    maxWaitMs?: number;
    pollMs?: number;
    maxPasses?: number;
  } = {},
): Promise<void> {
  const maxWaitMs = options.maxWaitMs ?? REPORT_ANALYSIS_WAIT_MS;
  const pollMs = options.pollMs ?? REPORT_ANALYSIS_POLL_MS;
  const maxPasses = options.maxPasses ?? REPORT_ANALYSIS_MAX_PASSES;
  const startedAt = Date.now();
  let passes = 0;

  while (Date.now() - startedAt < maxWaitMs && passes < maxPasses) {
    if (!(await hasPendingObservationSummaries(ref))) return;

    await ref.update({
      agentActivity: "Finishing observation analysis before writing the report.",
      agentActivityAt: Date.now(),
    });

    const result = await synthesizePendingObservationBatch(sessionId, "stop");
    passes += result.interpreted ? 1 : 0;

    if (result.reason === "no-pending" || !(await hasPendingObservationSummaries(ref))) return;
    if (result.reason === "update-in-flight") await delay(pollMs);
  }

  throw new HttpsError(
    "deadline-exceeded",
    "Observation analysis is still catching up. Try generating the report again in a moment.",
  );
}

async function hasPendingObservationSummaries(
  ref: FirebaseFirestore.DocumentReference,
): Promise<boolean> {
  const pending = await ref.collection("observations").where("summary", "==", "").limit(1).get();
  return !pending.empty;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
