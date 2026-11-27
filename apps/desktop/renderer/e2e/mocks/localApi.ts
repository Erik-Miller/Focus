import type { SavedWorkflowLaunchTarget, Workflow } from "@focus/shared";

type SavedWorkflowInput = {
  workflow: Workflow;
  prompt: string;
  sourceSessionId: string;
  sourceReportId?: string;
  sourceTitle: string;
};

export const savedWorkflows: SavedWorkflowInput[] = [];
export const launches: Array<{ id: string; target: SavedWorkflowLaunchTarget }> = [];
let pendingChatResolve: ((value: { data: { answer: string } }) => void) | null = null;

declare global {
  interface Window {
    focusE2eCancelChat?: () => Promise<{ data: { ok: boolean } }>;
  }
}

export function resetE2eLocalMocks(): void {
  savedWorkflows.length = 0;
  launches.length = 0;
  pendingChatResolve?.({ data: { answer: "" } });
  pendingChatResolve = null;
}

export const callables = {
  startSession: async () => ({ data: { sessionId: "session-e2e" } }),
  stopSession: async () => ({ data: { ok: true } }),
  resumeSession: async () => ({ data: { ok: true } }),
  deleteSession: async () => ({ data: { ok: true } }),
  processObservations: async () => ({
    data: {
      ok: true,
      interpreted: true,
      currentIntent: "You are testing Focus.",
      confidence: 0.84,
    },
  }),
  ingestObservations: async () => ({
    data: {
      ok: true,
      persisted: 1,
      observationIds: ["obs-e2e"],
    },
  }),
  synthesizePendingObservations: async () => ({
    data: {
      ok: true,
      interpreted: true,
      observationCount: 1,
      currentIntent: "You are testing Focus.",
      confidence: 0.84,
    },
  }),
  chatWithAgent: async () =>
    new Promise<{ data: { answer: string } }>((resolve) => {
      pendingChatResolve = resolve;
    }),
  cancelChatRun: async () => {
    pendingChatResolve?.({ data: { answer: "" } });
    pendingChatResolve = null;
    return { data: { ok: true } };
  },
  generateReport: async () => ({ data: { reportId: "report-e2e" } }),
  saveWorkflowForLater: async (input: SavedWorkflowInput) => {
    savedWorkflows.push(input);
    window.dispatchEvent(new CustomEvent("focus-e2e-saved-workflows"));
    return { data: { id: "saved-e2e" } };
  },
  deleteSavedWorkflow: async ({ id }: { id: string }) => {
    const index = savedWorkflows.findIndex((item) => item.workflow.name === id);
    if (index >= 0) savedWorkflows.splice(index, 1);
    window.dispatchEvent(new CustomEvent("focus-e2e-saved-workflows"));
    return { data: { ok: true } };
  },
  recordSavedWorkflowLaunch: async (launch: { id: string; target: SavedWorkflowLaunchTarget }) => {
    launches.push(launch);
    return { data: { ok: true } };
  },
};

window.focusE2eCancelChat = async () => callables.cancelChatRun();

export async function ensureLocalReady() {
  return { uid: "uid-e2e" };
}

export const app = {};
export const auth = {};
export const db = {};
export const functions = {};
