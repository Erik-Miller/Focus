import { describe, expect, it } from "vitest";
import {
  directAddressReportContent,
  directAddressText,
  directAddressUnderstanding,
  directAddressWorkflow,
} from "./directAddress.js";
import type { UnderstandingUpdate } from "./schemas.js";
import type { Workflow } from "./types.js";

const workflow: Workflow = {
  name: "Review coverage",
  description: "The user is comparing coverage.",
  stepsObserved: ["The person is opening the first source.", "the user's notes are updated."],
  frequency: "twice",
  automatable: true,
  automationIdea: "The user needs a script to collect headlines.",
  evidenceObsIds: ["obs1"],
};

describe("direct address transforms", () => {
  it("rewrites third-person user references into direct address", () => {
    expect(
      directAddressText("The user is reading. They compare their notes with the person's draft."),
    ).toBe("You are reading. You compare your notes with your draft.");
  });

  it("leaves unrelated they/their references alone", () => {
    expect(directAddressText("The articles say they changed their framing.")).toBe(
      "The articles say they changed their framing.",
    );
  });

  it("rewrites workflow fields recursively", () => {
    expect(directAddressWorkflow(workflow)).toMatchObject({
      description: "You are comparing coverage.",
      stepsObserved: ["You are opening the first source.", "your notes are updated."],
      automationIdea: "You need a script to collect headlines.",
    });
  });

  it("rewrites understanding updates recursively", () => {
    const update: UnderstandingUpdate = {
      currentIntent: "The user is triaging workflows.",
      confidence: 0.8,
      batchSummary: "The person has narrowed the task.",
      evidence: ["The user's cursor pauses on a report."],
      alternatives: [{ hypothesis: "This person is browsing.", confidence: 0.2 }],
      suggestedNextAction: "The person needs to save the best candidate.",
      activeApps: ["Chrome"],
      discoveredWorkflows: [workflow],
      hypothesisMarkdown: "The user is deciding what to automate.",
      workflowsMarkdown: "The person does repeated review.",
    };

    expect(directAddressUnderstanding(update)).toMatchObject({
      currentIntent: "You are triaging workflows.",
      batchSummary: "You have narrowed the task.",
      evidence: ["Your cursor pauses on a report."],
      alternatives: [{ hypothesis: "You are browsing.", confidence: 0.2 }],
      suggestedNextAction: "You need to save the best candidate.",
      hypothesisMarkdown: "You are deciding what to automate.",
      workflowsMarkdown: "You do repeated review.",
    });
  });

  it("rewrites report content recursively", () => {
    const report = directAddressReportContent({
      objective: "The user is checking test coverage.",
      focusAreas: ["The user's tests"],
      timelineMarkdown: "- The person was reviewing failures.",
      significantScreenshots: [{ obsId: "obs1", caption: "The user has the report open." }],
      interpretations: "The person needs better tests.",
      workflows: [workflow],
      nextSteps: ["The user should add rules tests."],
      narrative: "The person was building confidence.",
    });

    expect(report.objective).toBe("You are checking test coverage.");
    expect(report.significantScreenshots[0]?.caption).toBe("You have the report open.");
    expect(report.nextSteps).toEqual(["You should add rules tests."]);
  });
});
