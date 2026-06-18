import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { AgentRunKind, ThinkingLevel } from "@focus/shared";

export const MODEL_ID = "gemini-3.5-flash";

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

export function buildModel(kind: AgentRunKind, apiKey: string): ChatGoogleGenerativeAI {
  return new ChatGoogleGenerativeAI({
    model: MODEL_ID,
    apiKey,
    maxOutputTokens: MAX_OUTPUT_TOKENS_BY_KIND[kind],
    thinkingConfig: {
      // Gemini 3.x uses thinkingLevel (not thinkingBudget). The wrapper expects
      // the uppercase enum form.
      thinkingLevel: THINKING_BY_KIND[kind].toUpperCase() as "LOW" | "MEDIUM" | "HIGH",
      includeThoughts: true,
    },
  });
}
