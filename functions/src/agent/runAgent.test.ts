import { describe, expect, it } from "vitest";
import { buildChatMessageContent, type ChatInput } from "./runAgent.js";

function input(overrides: Partial<ChatInput> = {}): ChatInput {
  return {
    modelConfig: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "test-key",
    },
    hypothesis: "The user is reviewing a dashboard.",
    workflows: "",
    observationsDigest: "Recent dashboard activity.",
    history: [],
    message: "What changed?",
    ...overrides,
  };
}

describe("runAgent chat content", () => {
  it("includes recent screenshots as multimodal image parts", () => {
    const content = buildChatMessageContent(
      input({
        observationImages: [
          {
            obsId: "obs1",
            app: "Chrome",
            windowTitle: "Metrics",
            timestamp: Date.UTC(2026, 6, 21, 21, 0),
            dataUrl: "data:image/jpeg;base64,abc123",
          },
        ],
      }),
    );

    expect(content).toContainEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,abc123" },
    });
    expect(content).toContainEqual(
      expect.objectContaining({ type: "text", text: expect.stringContaining("Chrome: Metrics") }),
    );
  });

  it("stays text-only when no screenshot is available", () => {
    expect(buildChatMessageContent(input())).toHaveLength(1);
  });
});
