import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_MODEL_ID,
  buildModel,
  DEFAULT_MODEL_BY_PROVIDER,
  MODEL_ID,
  THINKING_BY_KIND,
} from "./model.js";

describe("agent model config", () => {
  it("builds OpenAI with the supplied key and output budget without calling the API", () => {
    const model = buildModel("chat", {
      provider: "openai",
      model: "gpt-5.4-mini",
      apiKey: "sk-test-only-key-1234567890",
    });
    expect(model.model).toBe("gpt-5.4-mini");
    expect(model).toHaveProperty("maxTokens", 2048);
  });
  it("uses the expected model and thinking levels by run kind", () => {
    expect(MODEL_ID).toBe("gemini-3.6-flash");
    expect(ANTHROPIC_MODEL_ID).toBe("claude-sonnet-4-6");
    expect(DEFAULT_MODEL_BY_PROVIDER).toEqual({
      openai: "gpt-5.4-mini",
      gemini: "gemini-3.6-flash",
      anthropic: "claude-sonnet-4-6",
    });
    expect(THINKING_BY_KIND).toEqual({
      observation: "medium",
      chat: "medium",
      report: "high",
    });
  });

  it("builds a Gemini chat model without making network calls", () => {
    expect(
      buildModel("report", {
        provider: "gemini",
        model: DEFAULT_MODEL_BY_PROVIDER.gemini,
        apiKey: "test-key",
      }),
    ).toBeDefined();
  });

  it("builds an Anthropic chat model without making network calls", () => {
    const model = buildModel("report", {
      provider: "anthropic",
      model: DEFAULT_MODEL_BY_PROVIDER.anthropic,
      apiKey: "test-key",
    });

    expect(model).toBeDefined();
    expect("outputConfig" in model ? model.outputConfig : undefined).toBeUndefined();
  });
});
