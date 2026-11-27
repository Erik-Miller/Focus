import { describe, expect, it } from "vitest";
import { resolveAgentModelSelection } from "./providerConfig.js";
describe("local provider default", () => {
  it("resolves locally without remote configuration", async () => {
    await expect(resolveAgentModelSelection()).resolves.toEqual({
      provider: "gemini",
      model: "gemini-3.6-flash",
    });
  });
});
