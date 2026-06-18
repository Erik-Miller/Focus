import { describe, expect, it } from "vitest";
import { buildAutomationPrompt } from "./automation.js";
import type { Workflow } from "./types.js";

const baseWorkflow: Workflow = {
  name: "Collect candidate links",
  description: "You collect article links before summarizing them.",
  stepsObserved: ["Open source A", "Copy link", "Compare against notes"],
  frequency: "repeated several times",
  automatable: true,
  automationIdea: "Build a CLI that accepts URLs and writes a comparison table.",
  evidenceObsIds: ["obs1", "obs2"],
};

describe("buildAutomationPrompt", () => {
  it("formats workflow, source context, steps, and evidence for handoff", () => {
    const prompt = buildAutomationPrompt(baseWorkflow, {
      label: "Focus observed this session intent",
      value: "You are comparing coverage.",
      fallback: "(No intent captured.)",
    });

    expect(prompt).toContain("Focus observed this session intent:\nYou are comparing coverage.");
    expect(prompt).toContain("Automation candidate:\nCollect candidate links");
    expect(prompt).toContain("1. Open source A\n2. Copy link\n3. Compare against notes");
    expect(prompt).toContain("Supporting observation ids:\nobs1, obs2");
    expect(prompt).toContain(
      "Do not make destructive changes or use secrets without asking first.",
    );
  });

  it("uses fallbacks for empty context, steps, frequency, and evidence", () => {
    const prompt = buildAutomationPrompt(
      {
        ...baseWorkflow,
        stepsObserved: [],
        frequency: "",
        evidenceObsIds: [],
      },
      {
        label: "Context",
        value: "",
        fallback: "(Fallback context.)",
      },
    );

    expect(prompt).toContain("Context:\n(Fallback context.)");
    expect(prompt).toContain("Observed steps:\n(No ordered steps captured.)");
    expect(prompt).toContain("Frequency:\n(Unknown)");
    expect(prompt).toContain("Supporting observation ids:\n(No observation ids captured.)");
  });
});
