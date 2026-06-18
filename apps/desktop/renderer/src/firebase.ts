import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { SavedWorkflowLaunchTarget, Workflow } from "@focus/shared";

const firebaseConfig = {
  apiKey: "AIzaSyA1j-pfsd8fXz1QymwDEB7U-Tyc4-u7Ixc",
  authDomain: "focus-9bf4b.firebaseapp.com",
  projectId: "focus-9bf4b",
  storageBucket: "focus-9bf4b.firebasestorage.app",
  messagingSenderId: "141136258602",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");

export function ensureSignedIn(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    });
    signInAnonymously(auth).catch(reject);
  });
}

export const callables = {
  startSession: httpsCallable<{ title?: string }, { sessionId: string }>(functions, "startSession"),
  stopSession: httpsCallable<{ sessionId: string }, { ok: boolean }>(functions, "stopSession"),
  resumeSession: httpsCallable<{ sessionId: string }, { ok: boolean }>(functions, "resumeSession"),
  deleteSession: httpsCallable<{ sessionId: string }, { ok: boolean }>(functions, "deleteSession"),
  processObservations: httpsCallable<
    { sessionId: string; observations: unknown[] },
    {
      ok?: boolean;
      skipped?: boolean;
      interpreted?: boolean;
      reason?: string;
      persisted?: number;
      currentIntent?: string;
      confidence?: number;
    }
  >(functions, "processObservations"),
  ingestObservations: httpsCallable<
    { sessionId: string; observations: unknown[] },
    {
      ok: boolean;
      persisted: number;
      observationIds: string[];
    }
  >(functions, "ingestObservations"),
  synthesizePendingObservations: httpsCallable<
    { sessionId: string; reason: "timer" | "stop" },
    {
      ok: boolean;
      interpreted: boolean;
      observationCount: number;
      currentIntent?: string;
      confidence?: number;
      reason?: string;
    }
  >(functions, "synthesizePendingObservations"),
  chatWithAgent: httpsCallable<
    { sessionId: string; runId: string; message: string },
    { answer?: string; canceled?: boolean }
  >(functions, "chatWithAgent"),
  cancelChatRun: httpsCallable<{ sessionId: string; runId: string }, { ok: boolean }>(
    functions,
    "cancelChatRun",
  ),
  generateReport: httpsCallable<{ sessionId: string; timeZone?: string }, { reportId: string }>(
    functions,
    "generateReport",
  ),
  saveWorkflowForLater: httpsCallable<
    {
      workflow: Workflow;
      prompt: string;
      sourceSessionId: string;
      sourceReportId?: string;
      sourceTitle: string;
    },
    { id: string }
  >(functions, "saveWorkflowForLater"),
  deleteSavedWorkflow: httpsCallable<{ id: string }, { ok: boolean }>(
    functions,
    "deleteSavedWorkflow",
  ),
  recordSavedWorkflowLaunch: httpsCallable<
    { id: string; target: SavedWorkflowLaunchTarget },
    { ok: boolean }
  >(functions, "recordSavedWorkflowLaunch"),
};
