import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Observation, Report } from "@focus/shared";
import {
  ReportView,
  compactFocusAreaTag,
  formatReportNarrative,
  localizeTimelineMarkdown,
} from "./ReportView.js";

const observation: Observation = {
  id: "obs1",
  sessionId: "session1",
  batchId: "batch1",
  timestamp: Date.UTC(2026, 0, 2, 15, 4),
  app: "Chrome",
  windowTitle: "News",
  mouse: { x: 1, y: 2 },
  dwellMs: 300,
  novelty: "high",
  frameHash: "hash",
  summary: "You compared headlines.",
  inferredIntent: "You compared coverage.",
  confidence: 0.8,
  evidence: [],
  alternatives: [],
  suggestedNextAction: "",
};

const report: Report = {
  id: "report1",
  sessionId: "session1",
  createdAt: 1,
  objective: "The user is testing Focus.",
  focusAreas: ["Comparing coverage between CNN and Fox News"],
  timelineMarkdown: "- Jan 2, 3:04 PM | obs1 | The user reviewed a report.",
  significantScreenshots: [],
  interpretations: "The user needs better tests.",
  workflows: [],
  nextSteps: ["The user should run CI."],
  narrative: "Session Report\n\nThe user was adding tests.",
};

describe("ReportView", () => {
  it("compacts focus tags and normalizes narrative headings", () => {
    expect(compactFocusAreaTag("Comparing coverage between CNN and Fox News")).toBe(
      "CNN vs Fox coverage",
    );
    expect(formatReportNarrative("Session Report: Testing\n\nBody")).toBe(
      "### Field report: Testing\n\n\nBody",
    );
  });

  it("localizes timeline lines by observation id", () => {
    const localized = localizeTimelineMarkdown(report.timelineMarkdown, [observation]);
    expect(localized).toContain("obs1");
    expect(localized).not.toContain("Jan 2, 3:04 PM |");
  });

  it("renders report content in direct address", () => {
    render(<ReportView observations={[observation]} report={report} />);

    expect(screen.getByText("CNN vs Fox coverage")).toBeInTheDocument();
    expect(screen.getByText(/You were adding tests/)).toBeInTheDocument();
  });
});
