import { onCall, HttpsError } from "firebase-functions/v2/https";
import { directAddressText, type ChatMessage, type Observation } from "@focus/shared";
import { runChat } from "../agent/runAgent.js";
import { createSaveWorkflowTool } from "../agent/saveWorkflowTool.js";
import {
  CALLABLE_OPTS,
  HYPOTHESIS_PATH,
  WORKFLOWS_PATH,
  agentErrorMessage,
  configureEnv,
  fileContent,
  loadSession,
  observationsDigest,
  recordUsage,
  requireAuth,
  toAgentHttpsError,
} from "./common.js";

const CHAT_RUNS_COLLECTION = "chatRuns";
const CANCEL_POLL_MS = 400;

type ChatRunStatus = "running" | "canceled" | "completed" | "failed";

export function cleanRunId(value: unknown): string {
  const runId = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(runId)) {
    throw new HttpsError("invalid-argument", "Valid runId required.");
  }
  return runId;
}

async function isChatRunCanceled(runRef: FirebaseFirestore.DocumentReference): Promise<boolean> {
  const snap = await runRef.get();
  return snap.exists && snap.get("status") === "canceled";
}

function watchChatRunCancel(
  runRef: FirebaseFirestore.DocumentReference,
  controller: AbortController,
): () => void {
  let checking = false;
  const timer = setInterval(() => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    void isChatRunCanceled(runRef)
      .then((canceled) => {
        if (canceled && !controller.signal.aborted) controller.abort();
      })
      .catch(() => undefined)
      .finally(() => {
        checking = false;
      });
  }, CANCEL_POLL_MS);
  return () => clearInterval(timer);
}

async function updateChatRunStatus(
  runRef: FirebaseFirestore.DocumentReference,
  status: ChatRunStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await runRef
    .set({ status, updatedAt: Date.now(), ...extra }, { merge: true })
    .catch(() => undefined);
}

export const chatWithAgent = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  const message = (request.data?.message as string)?.trim();
  const runId = cleanRunId(request.data?.runId);
  if (!sessionId || !message) {
    throw new HttpsError("invalid-argument", "sessionId, runId, and message required.");
  }

  const { session, ref } = await loadSession(sessionId);
  const startedAt = Date.now();
  const runRef = ref.collection(CHAT_RUNS_COLLECTION).doc(runId);

  // Register the run before writing the user's turn; if Stop already arrived,
  // avoid reviving a canceled run.
  const userMsgRef = ref.collection("chat").doc();
  const userMsg: ChatMessage = {
    id: userMsgRef.id,
    role: "user",
    content: message,
    createdAt: Date.now(),
    runId,
  };
  const runAlreadyCanceled = await ref.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(runRef);
    if (snap.exists && snap.get("status") === "canceled") return true;
    tx.set(
      runRef,
      {
        id: runId,
        status: "running",
        createdAt: startedAt,
        updatedAt: startedAt,
        userMessageId: userMsgRef.id,
      },
      { merge: true },
    );
    return false;
  });
  if (runAlreadyCanceled) return { canceled: true };

  await userMsgRef.set(userMsg);

  // Load recent history (excluding the just-written message) + observations.
  const historySnap = await ref.collection("chat").orderBy("createdAt", "asc").limit(40).get();
  const history = historySnap.docs
    .map((d) => d.data() as ChatMessage)
    .filter((m) => m.id !== userMsg.id)
    .map((m) => ({ role: m.role, content: m.content }));

  const obsSnap = await ref.collection("observations").orderBy("timestamp", "asc").limit(60).get();
  const observations = obsSnap.docs.map((d) => d.data() as Observation);

  try {
    if (await isChatRunCanceled(runRef)) return { canceled: true };
    const controller = new AbortController();
    const stopWatchingCancel = watchChatRunCancel(runRef, controller);
    const apiKey = configureEnv();
    const sourceTitle = session.currentIntent || session.title || "Focus session";
    const saveWorkflowTool = createSaveWorkflowTool({
      uid,
      sourceSessionId: sessionId,
      sourceReportId: session.reportId,
      sourceTitle,
      promptContext: {
        label: "Focus observed this session intent",
        value: session.currentIntent,
        fallback: "(No session intent captured.)",
      },
      latestUserMessage: message,
      validObservationIds: observations.map((observation) => observation.id),
    });
    let result: Awaited<ReturnType<typeof runChat>>;
    try {
      result = await runChat({
        apiKey,
        hypothesis: fileContent(session.agentFiles, HYPOTHESIS_PATH),
        workflows: fileContent(session.agentFiles, WORKFLOWS_PATH),
        observationsDigest: observationsDigest(observations),
        history,
        message,
        tools: [saveWorkflowTool],
        signal: controller.signal,
      });
    } finally {
      stopWatchingCancel();
    }

    if (controller.signal.aborted || (await isChatRunCanceled(runRef))) {
      await updateChatRunStatus(runRef, "canceled", { canceledAt: Date.now() });
      await ref.update({ lastError: "", lastErrorAt: 0 }).catch(() => undefined);
      return { canceled: true };
    }

    const answer = directAddressText(result.answer);
    const agentMsgRef = ref.collection("chat").doc();
    const agentMsg: ChatMessage = {
      id: agentMsgRef.id,
      role: "agent",
      content: answer,
      createdAt: Date.now(),
      usage: result.usage,
      runId,
    };
    await agentMsgRef.set(agentMsg);

    await updateChatRunStatus(runRef, "completed", {
      completedAt: Date.now(),
      agentMessageId: agentMsgRef.id,
    });
    await recordUsage(ref, "chat", result.usage, Date.now() - startedAt);
    await ref.update({ lastError: "", lastErrorAt: 0 });

    return { answer };
  } catch (err) {
    if (await isChatRunCanceled(runRef)) {
      await updateChatRunStatus(runRef, "canceled", { canceledAt: Date.now() });
      await ref.update({ lastError: "", lastErrorAt: 0 }).catch(() => undefined);
      return { canceled: true };
    }
    console.error("chatWithAgent failed", err);
    await updateChatRunStatus(runRef, "failed", { failedAt: Date.now() });
    const callableErr = toAgentHttpsError(err);
    await ref
      .update({
        lastError: agentErrorMessage(err),
        lastErrorAt: Date.now(),
      })
      .catch(() => undefined);
    throw callableErr;
  }
});

export const cancelChatRun = onCall(CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  const sessionId = request.data?.sessionId as string;
  const runId = cleanRunId(request.data?.runId);
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId and runId required.");

  const { ref } = await loadSession(sessionId);
  await updateChatRunStatus(ref.collection(CHAT_RUNS_COLLECTION).doc(runId), "canceled", {
    canceledAt: Date.now(),
  });
  return { ok: true };
});
