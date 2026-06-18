import { randomUUID } from "node:crypto";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import type { AgentRunKind, Observation, Session, ThinkingLevel, TokenUsage } from "@focus/shared";
import { db, bucket, FieldValue } from "../firebaseApp.js";
import { THINKING_BY_KIND } from "../agent/model.js";

export const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
export const LANGSMITH_API_KEY = defineSecret("LANGSMITH_API_KEY");

export const HYPOTHESIS_PATH = "/hypothesis.md";
export const WORKFLOWS_PATH = "/workflows.md";

/** Runtime options shared by every agent-backed callable. */
export const CALLABLE_OPTS = {
  secrets: [GEMINI_API_KEY, LANGSMITH_API_KEY],
  timeoutSeconds: 300,
  memory: "1GiB" as const,
  region: "us-central1" as const,
};

/** Lightweight callable options for session bookkeeping that does not run agents. */
export const SESSION_CALLABLE_OPTS = {
  timeoutSeconds: 30,
  memory: "256MiB" as const,
  region: "us-central1" as const,
};

/** Lightweight callable options for screenshot/observation persistence. */
export const OBSERVATION_INGEST_CALLABLE_OPTS = {
  timeoutSeconds: 120,
  memory: "512MiB" as const,
  region: "us-central1" as const,
};

/** Wire LangSmith tracing + Gemini key into the process env for this invocation. */
export function configureEnv(): string {
  const langsmithKey = LANGSMITH_API_KEY.value();
  if (langsmithKey) {
    process.env.LANGSMITH_API_KEY = langsmithKey;
    process.env.LANGSMITH_TRACING = "true";
    process.env.LANGSMITH_PROJECT = "Focus";
    // In serverless (Cloud Run) the instance is frozen as soon as the response
    // returns, so background trace uploads never finish. Run callbacks inline
    // and block on them before returning so traces are actually flushed.
    process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "false";
  }
  return GEMINI_API_KEY.value();
}

function collectErrorMessages(err: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = err;
  const seen = new Set<unknown>();

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error && current.message) {
      messages.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    if (typeof current === "object" && "message" in current) {
      const message = String((current as { message?: unknown }).message ?? "");
      if (message) messages.push(message);
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    break;
  }

  return messages;
}

export function isGeminiQuotaError(err: unknown): boolean {
  const text = collectErrorMessages(err).join("\n");
  return /429|too many requests|quota exceeded|resource_exhausted/i.test(text);
}

export function toAgentHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  if (isGeminiQuotaError(err)) {
    return new HttpsError(
      "resource-exhausted",
      "Gemini quota is exhausted for gemini-3.5-flash. Wait for the quota reset or move the Gemini API key to a paid/higher-quota project.",
    );
  }
  return new HttpsError("internal", "Agent run failed. Check the Cloud Functions logs.");
}

export function agentErrorMessage(err: unknown): string {
  if (isGeminiQuotaError(err)) return toAgentHttpsError(err).message;
  return collectErrorMessages(err)[0] || "Agent run failed. Check the Cloud Functions logs.";
}

export function requireAuth(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in (anonymous is fine) to use Focus.");
  }
  return uid;
}

export async function loadSession(
  sessionId: string,
): Promise<{ session: Session; ref: FirebaseFirestore.DocumentReference }> {
  const ref = db.collection("sessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Session not found.");
  }
  return { session: snap.data() as Session, ref };
}

export function fileContent(agentFiles: Record<string, string>, path: string): string {
  return agentFiles?.[path] ?? "";
}

/** Decode a data URL and upload it to Storage, returning a tokenized download URL. */
export async function uploadDataUrl(path: string, dataUrl: string): Promise<string> {
  const match = /^data:(.+?);base64,(.*)$/.exec(dataUrl);
  if (!match) {
    throw new HttpsError("invalid-argument", "Malformed data URL.");
  }
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const token = randomUUID();
  const file = bucket.file(path);
  await file.save(buffer, {
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    path,
  )}?alt=media&token=${token}`;
}

/** Download a Storage object and present it in the data URL shape expected by image models. */
export async function downloadStorageImageAsDataUrl(path: string): Promise<string> {
  const file = bucket.file(path);
  const [buffer] = await file.download();
  let contentType = "image/jpeg";
  try {
    const [metadata] = await file.getMetadata();
    if (typeof metadata.contentType === "string" && metadata.contentType) {
      contentType = metadata.contentType;
    }
  } catch {
    // The bytes are enough for the model; default JPEG matches our capture path.
  }
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export function storagePathFromDownloadUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  if (candidate.startsWith("gs://")) {
    const [, ...pathParts] = candidate.slice("gs://".length).split("/");
    const path = pathParts.join("/");
    return path || null;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) return candidate;

  try {
    const url = new URL(candidate);
    if (url.hostname !== "firebasestorage.googleapis.com") return null;
    const marker = "/o/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    const encodedPath = url.pathname.slice(index + marker.length);
    return decodeURIComponent(encodedPath) || null;
  } catch {
    return null;
  }
}

/** Build a compact text digest of observations for chat/report context. */
export function observationsDigest(observations: Observation[], timeZone?: string): string {
  return observations
    .map(
      (o) =>
        `- [${o.id}] ${observationTimeLabel(o.timestamp, timeZone)} | ${o.app} — ${o.windowTitle} | ${observationDigestText(o)}`,
    )
    .join("\n");
}

function observationDigestText(observation: Observation): string {
  const interpreted = observation.summary || observation.inferredIntent;
  if (interpreted) return interpreted;
  const imageState =
    observation.cursorCropUrl || observation.fullScreenshotUrl
      ? "screenshot available"
      : "no screenshot";
  return `Unanalyzed ${observation.novelty} dwell (${observation.dwellMs}ms, ${imageState}).`;
}

function observationTimeLabel(timestamp: number, timeZone?: string): string {
  const iso = new Date(timestamp).toISOString();
  const local = formatTimestampForTimeZone(timestamp, timeZone);
  if (!local) return iso;
  return `${local} (${timeZone})`;
}

export function cleanTimeZone(value: unknown): string | undefined {
  const timeZone = typeof value === "string" ? value.trim() : "";
  if (!timeZone || timeZone.length > 80) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return undefined;
  }
}

export function formatTimestampForTimeZone(timestamp: number, timeZone?: string): string | null {
  if (!timeZone) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(timestamp));
  } catch {
    return null;
  }
}

/** Persist a usage event and atomically increment the session usage aggregate. */
export async function recordUsage(
  sessionRef: FirebaseFirestore.DocumentReference,
  kind: AgentRunKind,
  usage: TokenUsage,
  latencyMs: number,
): Promise<void> {
  const thinkingLevel: ThinkingLevel = THINKING_BY_KIND[kind];
  const eventRef = sessionRef.collection("usageEvents").doc();
  await eventRef.set({
    id: eventRef.id,
    kind,
    model: "gemini-3.5-flash",
    thinkingLevel,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    thinkingTokens: usage.thinkingTokens,
    totalTokens: usage.totalTokens,
    latencyMs,
    createdAt: Date.now(),
  });

  await sessionRef.update({
    "usage.inputTokens": FieldValue.increment(usage.inputTokens),
    "usage.outputTokens": FieldValue.increment(usage.outputTokens),
    "usage.thinkingTokens": FieldValue.increment(usage.thinkingTokens),
    "usage.totalTokens": FieldValue.increment(usage.totalTokens),
    "usage.callCount": FieldValue.increment(1),
    [`usage.byKind.${kind}.inputTokens`]: FieldValue.increment(usage.inputTokens),
    [`usage.byKind.${kind}.outputTokens`]: FieldValue.increment(usage.outputTokens),
    [`usage.byKind.${kind}.thinkingTokens`]: FieldValue.increment(usage.thinkingTokens),
    [`usage.byKind.${kind}.totalTokens`]: FieldValue.increment(usage.totalTokens),
    [`usage.byKind.${kind}.callCount`]: FieldValue.increment(1),
  });
}

export function emptyUsageAggregate() {
  const zero = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, callCount: 0 };
  return {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
    callCount: 0,
    byKind: {
      observation: { ...zero },
      chat: { ...zero },
      report: { ...zero },
    },
  };
}
