import { describe, expect, it, vi } from "vitest";
import {
  AGENT_MODEL_STORAGE_KEY,
  readAgentModelPreference,
  writeAgentModelPreference,
} from "./agentModelPreference.js";

describe("agent model preference", () => {
  it("uses the saved supported model or the Claude default", () => {
    expect(readAgentModelPreference({ getItem: () => "gemini-3.6-flash" })).toBe(
      "gemini-3.6-flash",
    );
    expect(readAgentModelPreference({ getItem: () => "unknown" })).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("writes the preference under a stable local key", () => {
    const setItem = vi.fn();
    writeAgentModelPreference({ setItem }, "claude-sonnet-4-6");
    expect(setItem).toHaveBeenCalledWith(AGENT_MODEL_STORAGE_KEY, "claude-sonnet-4-6");
  });
});

it("migrates older saved models within the same provider", () => {
  expect(readAgentModelPreference({ getItem: () => "gpt-4.1" })).toBe("gpt-5.4-mini");
  expect(readAgentModelPreference({ getItem: () => "gemini-3.5-flash" })).toBe("gemini-3.6-flash");
  expect(readAgentModelPreference({ getItem: () => "claude-sonnet-4-5-20250929" })).toBe("claude-sonnet-4-6");
});
