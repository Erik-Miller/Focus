import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Observation, Session } from "@focus/shared";
import { AgentAwareness } from "./AgentAwareness.js";

const session: Session = {
  id: "session1",
  ownerUid: "uid1",
  status: "active",
  isDemo: false,
  startedAt: 1,
  currentIntent: "The user is adding tests.",
  confidence: 0.8,
  activeApps: ["Code"],
  discoveredWorkflows: [],
  agentFiles: { "/hypothesis.md": "# Current Intent\n\nThe user is covering the app." },
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
    callCount: 0,
    byKind: {
      observation: {
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        totalTokens: 0,
        callCount: 0,
      },
      chat: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, callCount: 0 },
      report: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, callCount: 0 },
    },
  },
  lastUpdateAt: 1,
  updateInFlight: false,
  agentActivity: "The person has focused on tests.",
};

const observation: Observation = {
  id: "obs1",
  sessionId: "session1",
  batchId: "batch1",
  timestamp: 1,
  app: "Code",
  windowTitle: "tests",
  mouse: { x: 1, y: 2 },
  dwellMs: 300,
  novelty: "high",
  frameHash: "hash",
  summary: "",
  inferredIntent: "",
  confidence: 0,
  evidence: ["The user's editor shows Vitest."],
  alternatives: [{ hypothesis: "The user is refactoring.", confidence: 0.2 }],
  suggestedNextAction: "The user should run CI.",
};

describe("AgentAwareness", () => {
  it("renders direct-address details when expanded", async () => {
    const user = userEvent.setup();
    render(<AgentAwareness session={session} observations={[observation]} />);

    expect(screen.getByText("You are adding tests.")).toBeInTheDocument();
    await user.click(screen.getByText("View Details"));

    await user.click(screen.getByText("Current activity"));
    expect(screen.getByText("You have focused on tests.")).toBeInTheDocument();
    await user.click(screen.getByText("Supporting evidence"));
    expect(screen.getByText("Your editor shows Vitest.")).toBeInTheDocument();
    await user.click(screen.getByText("Anticipated next step"));
    expect(screen.getByText("You should run CI.")).toBeInTheDocument();
    await user.click(screen.getByText("Alternative hypotheses"));
    expect(screen.getByText("20%")).toBeInTheDocument();
  });
});
