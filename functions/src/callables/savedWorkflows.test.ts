import { describe, expect, it } from "vitest";
import { cleanDocId, cleanTitle, normalizeKey, savedWorkflowId } from "./savedWorkflows.js";

describe("saved workflow helpers", () => {
  it("normalizes workflow keys for deterministic dedupe ids", () => {
    expect(normalizeKey("  Compare   Headlines  ")).toBe("compare headlines");
    expect(
      savedWorkflowId({
        sourceSessionId: "session1",
        workflow: { name: "Compare Headlines", automationIdea: "Build a CLI" },
      }),
    ).toBe(
      savedWorkflowId({
        sourceSessionId: "session1",
        workflow: { name: " compare   headlines ", automationIdea: " build a cli " },
      }),
    );
    expect(
      savedWorkflowId({
        sourceSessionId: "session2",
        workflow: { name: "Compare Headlines", automationIdea: "Build a CLI" },
      }),
    ).not.toBe(
      savedWorkflowId({
        sourceSessionId: "session1",
        workflow: { name: "Compare Headlines", automationIdea: "Build a CLI" },
      }),
    );
  });

  it("cleans titles and doc ids", () => {
    expect(cleanTitle("  My   Session  ")).toBe("My Session");
    expect(cleanTitle("   ")).toBe("Untitled session");
    expect(cleanTitle("A".repeat(300))).toHaveLength(240);
    expect(cleanDocId("a".repeat(32))).toBe("a".repeat(32));
    expect(cleanDocId("g".repeat(32))).toBeNull();
    expect(cleanDocId("../bad")).toBeNull();
  });
});
