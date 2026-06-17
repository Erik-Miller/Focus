import { createDeepAgent } from "deepagents";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import {
  understandingUpdateSchema,
  reportContentSchema,
  type UnderstandingUpdate,
  type ReportContent,
  type ChatMessage,
  type TokenUsage,
} from "@focus/shared";
import { buildModel } from "./model.js";
import { sumUsage, messageText } from "./usage.js";
import { MONITOR_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT, REPORT_SYSTEM_PROMPT } from "./prompts.js";

const RECURSION_LIMIT = 500;

// The langchain message/response typings vary across zod versions; the runtime
// shapes are stable and validated, so we use light local typing + casts here.
type ContentPart = Record<string, unknown>;
type AgentResult = { structuredResponse?: unknown; messages: BaseMessage[] };

export interface BatchObservationInput {
  obsId: string;
  app: string;
  windowTitle: string;
  dwellMs: number;
  novelty: string;
  timestamp: number;
  fullScreenshotDataUrl?: string;
  cursorCropDataUrl?: string;
}

export interface MonitoringInput {
  apiKey: string;
  priorHypothesis: string;
  priorWorkflows: string;
  currentIntent: string;
  activeApps: string[];
  observations: BatchObservationInput[];
}

function imagePart(dataUrl: string): ContentPart {
  return { type: "image_url", image_url: dataUrl };
}

export async function runMonitoring(
  input: MonitoringInput,
): Promise<{ update: UnderstandingUpdate; usage: TokenUsage }> {
  const model = buildModel("observation", input.apiKey);
  const agent = createDeepAgent({
    model,
    systemPrompt: MONITOR_SYSTEM_PROMPT,
    responseFormat: understandingUpdateSchema as never,
  });

  const header = [
    "## Your prior understanding",
    `Current intent: ${input.currentIntent || "(none yet)"}`,
    `Active applications so far: ${input.activeApps.join(", ") || "(none yet)"}`,
    "",
    "### /hypothesis.md",
    input.priorHypothesis || "(empty)",
    "",
    "### /workflows.md",
    input.priorWorkflows || "(empty)",
    "",
    `## New batch of ${input.observations.length} observed moment(s)`,
    "For each, the active app/window, dwell time, and screenshots follow. Update your understanding and return the structured result.",
  ].join("\n");

  const content: ContentPart[] = [{ type: "text", text: header }];
  for (const obs of input.observations) {
    const when = new Date(obs.timestamp).toISOString();
    content.push({
      type: "text",
      text: `\n--- Observation ${obs.obsId} ---\nTime: ${when}\nApp: ${obs.app}\nWindow: ${obs.windowTitle}\nDwell: ${obs.dwellMs}ms | novelty: ${obs.novelty}`,
    });
    if (obs.cursorCropDataUrl) {
      content.push({ type: "text", text: "Cursor crop (250x250):" });
      content.push(imagePart(obs.cursorCropDataUrl));
    }
    if (obs.fullScreenshotDataUrl) {
      content.push({ type: "text", text: "Full screen:" });
      content.push(imagePart(obs.fullScreenshotDataUrl));
    }
  }

  const result = (await agent.invoke(
    { messages: [new HumanMessage({ content: content as never })] },
    { recursionLimit: RECURSION_LIMIT },
  )) as AgentResult;
  await awaitAllCallbacks();

  return {
    update: result.structuredResponse as UnderstandingUpdate,
    usage: sumUsage(result.messages),
  };
}

export interface ChatInput {
  apiKey: string;
  hypothesis: string;
  workflows: string;
  observationsDigest: string;
  history: Pick<ChatMessage, "role" | "content">[];
  message: string;
  signal?: AbortSignal;
}

export async function runChat(input: ChatInput): Promise<{ answer: string; usage: TokenUsage }> {
  const model = buildModel("chat", input.apiKey);
  const agent = createDeepAgent({ model, systemPrompt: CHAT_SYSTEM_PROMPT });

  const context = [
    "## Session knowledge",
    "### /hypothesis.md",
    input.hypothesis || "(empty)",
    "",
    "### /workflows.md",
    input.workflows || "(empty)",
    "",
    "### Observed moments (digest)",
    input.observationsDigest || "(none)",
  ].join("\n");

  const historyText = input.history
    .map((m) => `${m.role === "user" ? "User" : "Focus"}: ${m.content}`)
    .join("\n");

  const prompt = [
    context,
    "",
    "## Conversation so far",
    historyText || "(this is the first message)",
    "",
    "## New question",
    input.message,
  ].join("\n");

  const result = (await agent.invoke(
    { messages: [new HumanMessage(prompt)] },
    { recursionLimit: RECURSION_LIMIT, signal: input.signal },
  )) as AgentResult;
  await awaitAllCallbacks();

  const last = result.messages[result.messages.length - 1];
  return {
    answer: messageText(last?.content) || "(no answer produced)",
    usage: sumUsage(result.messages),
  };
}

export interface ReportInput {
  apiKey: string;
  hypothesis: string;
  workflows: string;
  observationsDigest: string;
  timeZone?: string;
}

export async function runReport(
  input: ReportInput,
): Promise<{ report: ReportContent; usage: TokenUsage }> {
  const model = buildModel("report", input.apiKey);
  const agent = createDeepAgent({
    model,
    systemPrompt: REPORT_SYSTEM_PROMPT,
    responseFormat: reportContentSchema as never,
  });

  const prompt = [
    "Write the final session report from the following accumulated understanding.",
    input.timeZone
      ? `Use the user's timezone (${input.timeZone}) for every timeline time. Do not convert those times to UTC.`
      : "Use the local times exactly as shown in the observed moments digest for every timeline time. Do not convert those times to UTC.",
    "",
    "### /hypothesis.md",
    input.hypothesis || "(empty)",
    "",
    "### /workflows.md",
    input.workflows || "(empty)",
    "",
    "### Observed moments (digest)",
    input.observationsDigest || "(none)",
  ].join("\n");

  const result = (await agent.invoke(
    { messages: [new HumanMessage(prompt)] },
    { recursionLimit: RECURSION_LIMIT },
  )) as AgentResult;
  await awaitAllCallbacks();

  return {
    report: result.structuredResponse as ReportContent,
    usage: sumUsage(result.messages),
  };
}
