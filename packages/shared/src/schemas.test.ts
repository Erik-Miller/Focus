import { describe, expect, it } from "vitest";
import {
  reportContentSchema,
  saveWorkflowForLaterInputSchema,
  savedWorkflowLaunchTargetSchema,
  understandingUpdateSchema,
  workflowSchema,
} from "./schemas.js";

const workflow = {
  name: "Review reports",
  description: "You compare session reports.",
  stepsObserved: ["Open report", "Review candidate"],
  frequency: "twice",
  automatable: true,
  automationIdea: "Create a report comparison command.",
  evidenceObsIds: ["obs1"],
};

describe("shared schemas", () => {
  it("accepts valid workflow and saved workflow input", () => {
    expect(workflowSchema.parse(workflow)).toEqual(workflow);
    expect(
      saveWorkflowForLaterInputSchema.parse({
        workflow,
        prompt: "Build this.",
        sourceSessionId: "session1",
        sourceReportId: null,
        sourceTitle: "Session",
      }),
    ).toMatchObject({ sourceSessionId: "session1" });
  });

  it("rejects invalid confidence and empty saved prompts", () => {
    expect(() =>
      understandingUpdateSchema.parse({
        currentIntent: "Testing",
        confidence: 1.1,
        batchSummary: "Summary",
        evidence: [],
        alternatives: [],
        suggestedNextAction: "",
        activeApps: [],
        discoveredWorkflows: [],
        hypothesisMarkdown: "",
        workflowsMarkdown: "",
      }),
    ).toThrow();

    expect(() =>
      saveWorkflowForLaterInputSchema.parse({
        workflow,
        prompt: "",
        sourceSessionId: "session1",
        sourceTitle: "Session",
      }),
    ).toThrow();
  });

  it("validates launch targets and report content", () => {
    expect(savedWorkflowLaunchTargetSchema.safeParse("desktop").success).toBe(true);
    expect(savedWorkflowLaunchTargetSchema.safeParse("browser").success).toBe(false);

    const report = reportContentSchema.parse({
      objective: "You added tests.",
      focusAreas: ["Test coverage"],
      timelineMarkdown: "- obs1",
      significantScreenshots: [{ obsId: "obs1", caption: "Test output" }],
      interpretations: "You were reducing risk.",
      workflows: [workflow],
      nextSteps: ["Run CI"],
      narrative: "You built a safety net.",
    });

    expect(report.significantScreenshots[0]?.obsId).toBe("obs1");
  });
});
