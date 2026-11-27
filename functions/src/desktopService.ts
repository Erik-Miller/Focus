import * as sessions from "./callables/startSession.js";
import {
  ingestObservations,
  processObservations,
  synthesizePendingObservations,
} from "./callables/processObservations.js";
import { chatWithAgent, cancelChatRun } from "./callables/chatWithAgent.js";
import { generateReport } from "./callables/generateReport.js";
import {
  saveWorkflowForLater,
  deleteSavedWorkflow,
  recordSavedWorkflowLaunch,
} from "./callables/savedWorkflows.js";
import { db } from "./localStore.js";
import type { LocalRequest } from "./localCall.js";
const operations: Record<string, (request: LocalRequest) => Promise<unknown>> = {
  startSession: sessions.startSession,
  stopSession: sessions.stopSession,
  resumeSession: sessions.resumeSession,
  deleteSession: sessions.deleteSession,
  ingestObservations,
  processObservations,
  synthesizePendingObservations,
  chatWithAgent,
  cancelChatRun,
  generateReport,
  saveWorkflowForLater,
  deleteSavedWorkflow,
  recordSavedWorkflowLaunch,
};
export async function localCall(operation: string, data: unknown): Promise<unknown> {
  if (!Object.hasOwn(operations, operation)) throw new Error("Unknown local operation");
  return operations[operation]({
    data: data && typeof data === "object" ? (data as Record<string, unknown>) : {},
    auth: { uid: "local" },
  });
}
export async function localQuery(input: {
  kind: string;
  sessionId?: string;
  reportId?: string;
  max?: number;
}): Promise<unknown> {
  const max = Math.min(500, Math.max(1, Number(input.max) || 50));
  if (input.kind === "sessions")
    return (await db.collection("sessions").orderBy("startedAt", "desc").limit(max).get()).docs.map(
      (d) => d.data(),
    );
  if (input.kind === "savedWorkflows")
    return (
      await db
        .collection("users")
        .doc("local")
        .collection("savedWorkflows")
        .orderBy("updatedAt", "desc")
        .limit(max)
        .get()
    ).docs.map((d) => d.data());
  if (!input.sessionId) throw new Error("Session required");
  const ref = db.collection("sessions").doc(input.sessionId);
  if (input.kind === "session") return (await ref.get()).data() ?? null;
  if (input.kind === "report" && input.reportId)
    return (await ref.collection("reports").doc(input.reportId).get()).data() ?? null;
  if (input.kind === "observations" || input.kind === "chat")
    return (
      await ref
        .collection(input.kind)
        .orderBy(input.kind === "chat" ? "createdAt" : "timestamp")
        .get()
    ).docs.map((d) => d.data());
  throw new Error("Unknown local query");
}

/** Surface credential failures that happen before an agent operation starts. */
export async function recordLocalFailure(sessionId: unknown, message: string): Promise<void> {
  if (typeof sessionId !== "string") return;
  const ref = db.collection("sessions").doc(sessionId);
  if (!(await ref.get()).exists) return;
  await ref.update({
    lastError: message,
    lastErrorAt: Date.now(),
    updateInFlight: false,
    updateInFlightAt: 0,
  });
}
