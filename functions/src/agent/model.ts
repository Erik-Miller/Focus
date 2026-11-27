import { disableHostedTelemetry } from "../privacy.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  DEFAULT_AGENT_MODEL_BY_PROVIDER,
  type AgentRunKind,
  type ThinkingLevel,
} from "@focus/shared";

export type AgentModelProvider = "gemini" | "anthropic" | "openai";

export interface AgentModelConfig {
  provider: AgentModelProvider;
  model: string;
  apiKey: string;
}

export const DEFAULT_MODEL_PROVIDER: AgentModelProvider = "gemini";
export const DEFAULT_MODEL_BY_PROVIDER = DEFAULT_AGENT_MODEL_BY_PROVIDER;

export const MODEL_ID = DEFAULT_MODEL_BY_PROVIDER.gemini;
export const ANTHROPIC_MODEL_ID = DEFAULT_MODEL_BY_PROVIDER.anthropic;

/**
 * Two-speed thinking budget: medium for monitoring + chat (responsive),
 * high for the end-of-session report (deepest synthesis).
 */
export const THINKING_BY_KIND: Record<AgentRunKind, ThinkingLevel> = {
  observation: "medium",
  chat: "medium",
  report: "high",
};

const MAX_OUTPUT_TOKENS_BY_KIND: Record<AgentRunKind, number> = {
  observation: 4096,
  chat: 2048,
  report: 8192,
};

export function isAgentModelProvider(value: string): value is AgentModelProvider {
  return value === "gemini" || value === "anthropic" || value === "openai";
}

export function buildModel(
  kind: AgentRunKind,
  config: AgentModelConfig,
): ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI {
  // Standalone local validation also must not inherit hosted tracing.
  disableHostedTelemetry();
  if (config.provider === "openai") {
    const isSol = config.model === "gpt-6.2-sol";
    return new ChatOpenAI({
      model: config.model,
      apiKey: config.apiKey,
      maxTokens: isSol ? (kind === "report" ? 16384 : 8192) : MAX_OUTPUT_TOKENS_BY_KIND[kind],
      configuration: { baseURL: "https://api.openai.com/v1" },
      useResponsesApi: isSol,
      reasoning: { effort: isSol ? (kind === "report" ? "medium" : "low") : "none" },
    });
  }
  if (config.provider === "anthropic") {
    return new ChatAnthropic({
      clientOptions: { baseURL: "https://api.anthropic.com" },
      model: config.model,
      apiKey: config.apiKey,
      maxTokens: MAX_OUTPUT_TOKENS_BY_KIND[kind],
    });
  }

  return new ChatGoogleGenerativeAI({
    baseUrl: "https://generativelanguage.googleapis.com",
    model: config.model,
    apiKey: config.apiKey,
    maxOutputTokens: MAX_OUTPUT_TOKENS_BY_KIND[kind],
    thinkingConfig: {
      // Gemini 3.x uses thinkingLevel (not thinkingBudget). The wrapper expects
      // the uppercase enum form.
      thinkingLevel: THINKING_BY_KIND[kind].toUpperCase() as "LOW" | "MEDIUM" | "HIGH",
      includeThoughts: true,
    },
  });
}
