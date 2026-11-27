import type { AgentModelId, SavedWorkflowLaunchTarget, Workflow } from "@focus/shared";
import { getBridge } from "./platform";
export async function ensureLocalReady(): Promise<void> {
  if (!getBridge()) throw new Error("Open Focus in the desktop app to use local storage.");
}
function localCallable<Input, Output>(name: string) {
  return async (data: Input): Promise<{ data: Output }> => {
    const bridge = getBridge();
    if (!bridge) throw new Error("Focus desktop bridge unavailable.");
    return { data: (await bridge.localCall(name, data)) as Output };
  };
}
export const callables = {
  startSession: localCallable<{ title?: string }, { sessionId: string }>("startSession"),
  stopSession: localCallable<{ sessionId: string }, { ok: boolean }>("stopSession"),
  resumeSession: localCallable<{ sessionId: string }, { ok: boolean }>("resumeSession"),
  deleteSession: localCallable<{ sessionId: string }, { ok: boolean }>("deleteSession"),
  processObservations: localCallable<
    {
      sessionId: string;
      observations: unknown[];
      agentModel?: AgentModelId;
    },
    {
      ok?: boolean;
      skipped?: boolean;
      interpreted?: boolean;
      reason?: string;
      persisted?: number;
      currentIntent?: string;
      confidence?: number;
    }
  >("processObservations"),
  ingestObservations: localCallable<
    { sessionId: string; observations: unknown[] },
    {
      ok: boolean;
      persisted: number;
      observationIds: string[];
    }
  >("ingestObservations"),
  synthesizePendingObservations: localCallable<
    {
      sessionId: string;
      reason: "timer" | "stop";
      agentModel?: AgentModelId;
    },
    {
      ok: boolean;
      interpreted: boolean;
      observationCount: number;
      currentIntent?: string;
      confidence?: number;
      reason?: string;
    }
  >("synthesizePendingObservations"),
  chatWithAgent: localCallable<
    {
      sessionId: string;
      runId: string;
      message: string;
      agentModel?: AgentModelId;
    },
    { answer?: string; canceled?: boolean }
  >("chatWithAgent"),
  cancelChatRun: localCallable<{ sessionId: string; runId: string }, { ok: boolean }>(
    "cancelChatRun",
  ),
  generateReport: localCallable<
    {
      sessionId: string;
      timeZone?: string;
      agentModel?: AgentModelId;
    },
    { reportId: string }
  >("generateReport"),
  saveWorkflowForLater: localCallable<
    {
      workflow: Workflow;
      prompt: string;
      sourceSessionId: string;
      sourceReportId?: string;
      sourceTitle: string;
    },
    { id: string }
  >("saveWorkflowForLater"),
  deleteSavedWorkflow: localCallable<{ id: string }, { ok: boolean }>("deleteSavedWorkflow"),
  recordSavedWorkflowLaunch: localCallable<
    { id: string; target: SavedWorkflowLaunchTarget },
    { ok: boolean }
  >("recordSavedWorkflowLaunch"),
};
