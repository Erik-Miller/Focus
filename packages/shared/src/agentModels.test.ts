import { describe, expect, it } from "vitest";
import {
  AGENT_MODEL_OPTIONS,
  DEFAULT_AGENT_MODEL_ID,
  agentModelOption,
  isAgentModelId,
} from "./agentModels.js";

describe("agent model catalog", () => {
  it("only exposes multimodal models", () => {
    expect(AGENT_MODEL_OPTIONS).toHaveLength(4);
    expect(AGENT_MODEL_OPTIONS.every((option) => option.supportsImages)).toBe(true);
  });

  it("validates model ids and resolves their providers", () => {
    expect(agentModelOption("gpt-5.4-mini").provider).toBe("openai");
    expect(isAgentModelId(DEFAULT_AGENT_MODEL_ID)).toBe(true);
    expect(isAgentModelId("made-up-model")).toBe(false);
    expect(agentModelOption("gemini-3.6-flash").provider).toBe("gemini");
    expect(agentModelOption("claude-sonnet-4-6").provider).toBe("anthropic");
  });
});

it("rejects text-only and image-generation models from the vision chat selector", () => {
  for (const id of ["gpt-3.5-turbo", "gpt-image-1", "text-embedding-3-small", "gemini-3.5-flash", "claude-sonnet-4-5-20250929"]) expect(isAgentModelId(id)).toBe(false);
});
