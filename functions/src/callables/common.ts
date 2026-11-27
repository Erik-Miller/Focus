import { disableHostedTelemetry } from "../privacy.js";
import type { DocumentReference } from "../localStore.js";
import { LocalError, type LocalRequest } from "../localCall.js";
import {
  agentModelOption,
  isAgentModelId,
  type AgentModelId,
  type AgentRunKind,
  type Observation,
  type Session,
  type ThinkingLevel,
  type TokenUsage,
} from "@focus/shared";
import { db, bucket, FieldValue } from "../localStore.js";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  THINKING_BY_KIND,
  type AgentModelConfig,
  type AgentModelProvider,
} from "../agent/model.js";
import { resolveAgentModelSelection } from "../agent/providerConfig.js";

export const HYPOTHESIS_PATH = "/hypothesis.md";
export const WORKFLOWS_PATH = "/workflows.md";

export interface AgentCredentialInput {
  agentModel?: unknown;
  anthropicApiKey?: unknown;
  openaiApiKey?: unknown;
  geminiApiKey?: unknown;
}

/** Disable hosted tracing for local execution. */
export function configureEnv(): void {
  // Local runs never upload tracing/analytics, even if inherited from the shell.
  disableHostedTelemetry();
}

export function agentCredentialsFromData(data: unknown): AgentCredentialInput {
  if (!data || typeof data !== "object") return {};
  const { agentModel, anthropicApiKey, openaiApiKey, geminiApiKey } = data as {
    agentModel?: unknown;
    anthropicApiKey?: unknown;
    openaiApiKey?: unknown;
    geminiApiKey?: unknown;
  };
  return {
    ...(openaiApiKey === undefined ? {} : { openaiApiKey }),
    ...(geminiApiKey === undefined ? {} : { geminiApiKey }),
    ...(agentModel === undefined ? {} : { agentModel }),
    ...(anthropicApiKey === undefined ? {} : { anthropicApiKey }),
  };
}

export function cleanAgentModelId(value: unknown): AgentModelId | undefined {
  if (value === undefined) return undefined;
  if (!isAgentModelId(value)) {
    throw new LocalError("invalid-argument", "Select a supported AI model.");
  }
  return value;
}

export function cleanAnthropicApiKey(value: unknown): string | undefined {
  const apiKey = typeof value === "string" ? value.trim() : "";
  if (!apiKey) return undefined;
  if (apiKey.length < 20 || apiKey.length > 4096 || /\s/.test(apiKey)) {
    throw new LocalError("invalid-argument", "Valid Anthropic API key required.");
  }
  return apiKey;
}

export function cleanProviderApiKey(value: unknown, provider: string): string | undefined {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) return undefined;
  if (key.length < 20 || key.length > 4096 || /\s/.test(key))
    throw new LocalError("invalid-argument", `Valid ${provider} API key required.`);
  return key;
}

export async function loadAgentModelConfig(
  credentials: AgentCredentialInput = {},
): Promise<AgentModelConfig> {
  configureEnv();
  const requestedModel = cleanAgentModelId(credentials.agentModel);
  const selection = requestedModel
    ? {
        provider: agentModelOption(requestedModel).provider,
        model: requestedModel,
      }
    : await resolveAgentModelSelection();
  const apiKey = apiKeyForProvider(selection.provider, credentials);
  if (!apiKey) {
    throw new LocalError("failed-precondition", missingApiKeyMessage(selection.provider));
  }
  return { ...selection, apiKey };
}

function apiKeyForProvider(
  provider: AgentModelProvider,
  credentials: AgentCredentialInput,
): string | undefined {
  if (provider === "anthropic") {
    return cleanAnthropicApiKey(credentials.anthropicApiKey);
  }
  return cleanProviderApiKey(
    provider === "openai" ? credentials.openaiApiKey : credentials.geminiApiKey,
    provider,
  );
}

function missingApiKeyMessage(provider: AgentModelProvider): string {
  if (provider === "anthropic") {
    return "Claude is enabled, but no Anthropic API key was provided. Add one in Focus settings.";
  }
  return `Add your ${provider === "openai" ? "OpenAI" : "Gemini"} API key in Focus settings.`;
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

export function isProviderQuotaError(err: unknown): boolean {
  const text = collectErrorMessages(err).join("\n");
  return /429|rate.?limit|too many requests|quota exceeded|resource_exhausted/i.test(text);
}

export function toAgentLocalError(err: unknown): LocalError {
  if (err instanceof LocalError) return err;
  if (
    /401|authentication_error|invalid.{0,12}api.?key|incorrect.{0,12}api.?key/i.test(
      collectErrorMessages(err).join("\n"),
    )
  ) {
    return new LocalError(
      "unauthenticated",
      "Your API key was rejected by the provider. Open Settings and save a valid key for the selected model.",
    );
  }
  if (isProviderQuotaError(err)) {
    return new LocalError(
      "resource-exhausted",
      "The configured model provider is rate-limited or out of quota. Wait for the quota reset or switch the model in Focus settings.",
    );
  }
  return new LocalError("internal", "Agent run failed. Check the local application logs.");
}

export function agentErrorMessage(err: unknown): string {
  const friendly = toAgentLocalError(err);
  if (friendly.code !== "internal") return friendly.message;
  return collectErrorMessages(err)[0] || "Agent run failed. Check the local application logs.";
}

export function requireAuth(request: LocalRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new LocalError(
      "unauthenticated",
      "Local workspace identity is unavailable. Restart Focus.",
    );
  }
  return uid;
}

export function requireSessionOwner(session: Session, uid: string): void {
  if (session.ownerUid !== uid) {
    throw new LocalError("permission-denied", "You can only access your own sessions.");
  }
}

export async function loadOwnedSession(
  sessionId: string,
  uid: string,
): Promise<{ session: Session; ref: DocumentReference }> {
  const ref = db.collection("sessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new LocalError("not-found", "Session not found.");
  }
  const session = snap.data() as Session;
  requireSessionOwner(session, uid);
  return { session, ref };
}

export function fileContent(agentFiles: Record<string, string>, path: string): string {
  return agentFiles?.[path] ?? "";
}

/** Save a data URL to the local screenshots directory and return an app-protocol URL. */
export async function uploadDataUrl(path: string, dataUrl: string): Promise<string> {
  const match = /^data:(.+?);base64,(.*)$/.exec(dataUrl);
  if (!match) {
    throw new LocalError("invalid-argument", "Malformed data URL.");
  }
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const file = bucket.file(path);
  await file.save(buffer, { contentType });
  return `focus-image://local/${path}`;
}

/** Read a local screenshot in the data URL shape expected by image models. */
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
  if (candidate.startsWith("focus-image://local/"))
    return candidate.slice("focus-image://local/".length);
  if (/^screenshots\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(candidate)) return candidate;
  return null;
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
  sessionRef: DocumentReference,
  kind: AgentRunKind,
  usage: TokenUsage,
  latencyMs: number,
  model: string = DEFAULT_MODEL_BY_PROVIDER.gemini,
): Promise<void> {
  const thinkingLevel: ThinkingLevel = THINKING_BY_KIND[kind];
  const eventRef = sessionRef.collection("usageEvents").doc();
  await eventRef.set({
    id: eventRef.id,
    kind,
    model,
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
