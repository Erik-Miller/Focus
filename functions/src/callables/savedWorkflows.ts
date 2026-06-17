import { createHash } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  saveWorkflowForLaterInputSchema,
  savedWorkflowLaunchTargetSchema,
  type SavedWorkflow,
} from "@focus/shared";
import { db } from "../firebaseApp.js";
import { requireAuth } from "./common.js";

const SAVED_WORKFLOW_OPTS = {
  timeoutSeconds: 60,
  memory: "256MiB" as const,
  region: "us-central1" as const,
};

const MAX_PROMPT_LENGTH = 100_000;
const MAX_TITLE_LENGTH = 240;

export const saveWorkflowForLater = onCall(SAVED_WORKFLOW_OPTS, async (request) => {
  const uid = requireAuth(request);
  const parsed = saveWorkflowForLaterInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Valid saved workflow input required.");
  }

  const input = parsed.data;
  if (!input.workflow.automatable || !input.workflow.automationIdea.trim()) {
    throw new HttpsError("invalid-argument", "Only automatable workflows can be saved.");
  }
  if (input.prompt.length > MAX_PROMPT_LENGTH) {
    throw new HttpsError("invalid-argument", "Automation prompt is too large to save.");
  }

  const id = savedWorkflowId(input);
  const userRef = db.collection("users").doc(uid);
  const ref = userRef.collection("savedWorkflows").doc(id);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const prior = existing.exists ? (existing.data() as SavedWorkflow) : null;
    const saved: SavedWorkflow = {
      id,
      workflow: input.workflow,
      prompt: input.prompt,
      sourceSessionId: input.sourceSessionId,
      sourceTitle: cleanTitle(input.sourceTitle),
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
    };
    if (input.sourceReportId) saved.sourceReportId = input.sourceReportId;
    if (prior?.lastLaunchedAt) saved.lastLaunchedAt = prior.lastLaunchedAt;
    if (prior?.lastLaunchTarget) saved.lastLaunchTarget = prior.lastLaunchTarget;
    tx.set(userRef, { updatedAt: now }, { merge: true });
    tx.set(ref, saved);
  });

  return { id };
});

export const deleteSavedWorkflow = onCall(SAVED_WORKFLOW_OPTS, async (request) => {
  const uid = requireAuth(request);
  const id = cleanDocId(request.data?.id);
  if (!id) throw new HttpsError("invalid-argument", "Valid saved workflow id required.");

  await db.collection("users").doc(uid).collection("savedWorkflows").doc(id).delete();
  return { ok: true };
});

export const recordSavedWorkflowLaunch = onCall(SAVED_WORKFLOW_OPTS, async (request) => {
  const uid = requireAuth(request);
  const id = cleanDocId(request.data?.id);
  const targetParse = savedWorkflowLaunchTargetSchema.safeParse(request.data?.target);
  if (!id || !targetParse.success) {
    throw new HttpsError("invalid-argument", "Valid saved workflow id and launch target required.");
  }

  await db.collection("users").doc(uid).collection("savedWorkflows").doc(id).update({
    lastLaunchedAt: Date.now(),
    lastLaunchTarget: targetParse.data,
  });
  return { ok: true };
});

function savedWorkflowId(input: {
  sourceSessionId: string;
  workflow: { name: string; automationIdea: string };
}): string {
  return createHash("sha256")
    .update(input.sourceSessionId)
    .update("\0")
    .update(normalizeKey(input.workflow.name))
    .update("\0")
    .update(normalizeKey(input.workflow.automationIdea))
    .digest("hex")
    .slice(0, 32);
}

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanTitle(value: string): string {
  const title = value.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_LENGTH);
  return title || "Untitled session";
}

function cleanDocId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^[A-Fa-f0-9]{32}$/.test(id) ? id : null;
}
