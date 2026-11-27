import { describe, expect, it, vi } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { AGENT_MODEL_OPTIONS } from "@focus/shared";
import { buildModel } from "./model.js";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
describe("vision transport for every selectable model", () => {
  for (const option of AGENT_MODEL_OPTIONS) {
    it(`serializes screenshot input for ${option.id}`, async () => {
      const requests: Record<string, unknown>[] = [];
      const destinations: string[] = [];
      vi.stubEnv("LANGSMITH_TRACING", "true");
      vi.stubEnv("LANGCHAIN_TRACING", "true");
      vi.stubEnv("LANGSMITH_API_KEY", "test-tracing-key");
      vi.stubEnv("OPENAI_BASE_URL", "https://unexpected.example/v1");
      vi.stubEnv("ANTHROPIC_BASE_URL", "https://unexpected.example");
      const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        destinations.push(new URL(request.url).hostname);
        requests.push((await request.json()) as Record<string, unknown>);
        const content =
          option.id === "gpt-6.2-sol"
            ? {
                id: "resp_test",
                object: "response",
                model: option.id,
                status: "completed",
                output: [
                  {
                    id: "msg_test",
                    type: "message",
                    role: "assistant",
                    status: "completed",
                    content: [{ type: "output_text", text: "Image received", annotations: [] }],
                  },
                ],
                usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
              }
            : option.provider === "openai"
              ? {
                  id: "chat_test",
                  object: "chat.completion",
                  model: option.id,
                  choices: [
                    {
                      index: 0,
                      message: { role: "assistant", content: "Image received" },
                      finish_reason: "stop",
                    },
                  ],
                  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                }
              : option.provider === "anthropic"
                ? {
                    id: "msg_test",
                    type: "message",
                    role: "assistant",
                    model: option.id,
                    content: [{ type: "text", text: "Image received" }],
                    stop_reason: "end_turn",
                    usage: { input_tokens: 1, output_tokens: 1 },
                  }
                : {
                    candidates: [
                      {
                        content: { role: "model", parts: [{ text: "Image received" }] },
                        finishReason: "STOP",
                      },
                    ],
                    usageMetadata: {
                      promptTokenCount: 1,
                      candidatesTokenCount: 1,
                      totalTokenCount: 2,
                    },
                  };
        return new Response(JSON.stringify(content), {
          headers: { "content-type": "application/json" },
        });
      });
      try {
        const model = buildModel("chat", {
          provider: option.provider,
          model: option.id,
          apiKey: "test-only-key-not-real-123456789",
        });
        await model.invoke([
          new HumanMessage({
            content: [
              { type: "text", text: "Describe the screenshot" },
              { type: "image_url", image_url: { url: image } },
            ],
          }),
        ]);
        await awaitAllCallbacks();
        expect(destinations).toEqual([
          option.provider === "openai"
            ? "api.openai.com"
            : option.provider === "anthropic"
              ? "api.anthropic.com"
              : "generativelanguage.googleapis.com",
        ]);
        expect(requests).toHaveLength(1);
        const body = JSON.stringify(requests[0]);
        expect(body).toContain("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB");
        expect(body).toContain("Describe the screenshot");
        if (option.id === "gpt-6.2-sol") {
          expect(body).toContain("input_image");
          expect(requests[0]).toMatchObject({
            reasoning: { effort: "low" },
            max_output_tokens: 8192,
          });
        } else if (option.provider === "openai") {
          expect(body).toContain("image_url");
          expect(requests[0]).toMatchObject({
            reasoning_effort: "none",
            max_completion_tokens: 2048,
          });
          expect(requests[0]).not.toHaveProperty("max_tokens");
        }
        if (option.provider === "anthropic") expect(body).toContain('"type":"image"');
        if (option.provider === "gemini") expect(body).toContain("inlineData");
      } finally {
        fetch.mockRestore();
        vi.unstubAllEnvs();
      }
    });
  }
});
