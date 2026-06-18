import { describe, expect, it } from "vitest";
import { buildModel, MODEL_ID, THINKING_BY_KIND } from "./model.js";

describe("agent model config", () => {
  it("uses the expected model and thinking levels by run kind", () => {
    expect(MODEL_ID).toBe("gemini-3.5-flash");
    expect(THINKING_BY_KIND).toEqual({
      observation: "medium",
      chat: "medium",
      report: "high",
    });
  });

  it("builds a Gemini chat model without making network calls", () => {
    expect(buildModel("report", "test-key")).toBeDefined();
  });
});
