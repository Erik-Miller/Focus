import { describe, expect, it } from "vitest";
import { appleScriptString, cleanAutomationInput, shellQuote } from "./automationLaunch.js";

describe("automation launch helpers", () => {
  it("defaults target/title, trims prompt, and truncates oversized values", () => {
    const input = cleanAutomationInput({
      title: `  ${"A".repeat(200)}  `,
      prompt: `  ${"P".repeat(25_000)}  `,
      target: "desktop",
    });

    expect(input.target).toBe("desktop");
    expect(input.title).toHaveLength(160);
    expect(input.prompt).toHaveLength(24_000);
  });

  it("keeps terminal target and rejects empty prompts", () => {
    expect(cleanAutomationInput({ target: "terminal", prompt: "run it" }).target).toBe("terminal");
    expect(() => cleanAutomationInput({ prompt: "   " })).toThrow("Automation prompt is empty.");
  });

  it("escapes shell and AppleScript strings safely", () => {
    expect(shellQuote("it's ok")).toBe("'it'\\''s ok'");
    expect(appleScriptString('say "hi"')).toBe('"say \\"hi\\""');
  });
});
