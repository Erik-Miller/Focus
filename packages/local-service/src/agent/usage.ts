import type { BaseMessage } from "@langchain/core/messages";
import type { TokenUsage } from "@focus/shared";

export function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0 };
}

interface UsageMetadataLike {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  output_token_details?: { reasoning?: number };
}

/** Aggregate token usage (including reasoning/thinking tokens) across all AI messages. */
export function sumUsage(messages: BaseMessage[]): TokenUsage {
  const usage = emptyUsage();
  for (const message of messages) {
    const meta = (message as { usage_metadata?: UsageMetadataLike }).usage_metadata;
    if (!meta) continue;
    usage.inputTokens += meta.input_tokens ?? 0;
    usage.outputTokens += meta.output_tokens ?? 0;
    usage.totalTokens += meta.total_tokens ?? 0;
    usage.thinkingTokens += meta.output_token_details?.reasoning ?? 0;
  }
  // Fallback if a provider omits total_tokens.
  if (usage.totalTokens === 0) {
    usage.totalTokens = usage.inputTokens + usage.outputTokens;
  }
  return usage;
}

/** Extract plain text from a message whose content may be a string or content parts. */
export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}
