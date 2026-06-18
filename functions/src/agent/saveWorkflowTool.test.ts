import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workflow } from "@focus/shared";

const saveWorkflowForUser = vi.fn();

vi.mock("../callables/savedWorkflows.js", () => ({
  saveWorkflowForUser,
}));

const { createSaveWorkflowTool, hasExplicitSaveWorkflowIntent } =
  await import("./saveWorkflowTool.js");

const workflow: Workflow = {
  name: "Compare articles",
  description: "The user is comparing coverage.",
  stepsObserved: ["Open article", "Copy notes"],
  frequency: "twice",
  automatable: true,
  automationIdea: "Build a link comparison script.",
  evidenceObsIds: ["obs1"],
};

describe("save workflow tool", () => {
  beforeEach(() => {
    saveWorkflowForUser.mockReset();
    saveWorkflowForUser.mockResolvedValue({ id: "saved1" });
  });

  it("detects explicit save intent and rejects tentative or negative phrasing", () => {
    expect(hasExplicitSaveWorkflowIntent("Save that workflow to the inbox")).toBe(true);
    expect(hasExplicitSaveWorkflowIntent("bookmark this automation for later")).toBe(true);
    expect(hasExplicitSaveWorkflowIntent("Should I save this workflow?")).toBe(false);
    expect(hasExplicitSaveWorkflowIntent("Do not save that workflow")).toBe(false);
  });

  it("saves an explicitly requested automatable workflow with direct-addressed prompt", async () => {
    const tool = createSaveWorkflowTool({
      uid: "uid1",
      sourceSessionId: "session1",
      sourceReportId: "report1",
      sourceTitle: "Session title",
      promptContext: {
        label: "Focus observed this session intent",
        value: "The user is reviewing coverage.",
        fallback: "(No session intent captured.)",
      },
      latestUserMessage: "Save this workflow for later",
      validObservationIds: ["obs1"],
    });

    await expect(tool.invoke(workflow)).resolves.toBe(
      JSON.stringify({ saved: true, id: "saved1" }),
    );
    expect(saveWorkflowForUser).toHaveBeenCalledWith(
      "uid1",
      expect.objectContaining({
        sourceSessionId: "session1",
        sourceReportId: "report1",
        workflow: expect.objectContaining({
          description: "You are comparing coverage.",
          automationIdea: "Build a link comparison script.",
        }),
        prompt: expect.stringContaining("Workflow description:\nYou are comparing coverage."),
      }),
    );
  });

  it("does not save without explicit intent, automatable idea, or valid evidence ids", async () => {
    const noIntent = createSaveWorkflowTool({
      uid: "uid1",
      sourceSessionId: "session1",
      sourceTitle: "Session title",
      promptContext: { label: "Context", value: "", fallback: "(none)" },
      latestUserMessage: "Which workflow should I automate?",
      validObservationIds: ["obs1"],
    });
    await expect(noIntent.invoke(workflow)).resolves.toContain("did not explicitly ask");

    const invalidEvidence = createSaveWorkflowTool({
      uid: "uid1",
      sourceSessionId: "session1",
      sourceTitle: "Session title",
      promptContext: { label: "Context", value: "", fallback: "(none)" },
      latestUserMessage: "Save this workflow",
      validObservationIds: ["obs2"],
    });
    await expect(invalidEvidence.invoke(workflow)).resolves.toContain("unknown observation ids");

    await expect(
      invalidEvidence.invoke({ ...workflow, evidenceObsIds: ["obs2"], automationIdea: "" }),
    ).resolves.toContain("Only automatable workflows");
    expect(saveWorkflowForUser).not.toHaveBeenCalled();
  });
});
