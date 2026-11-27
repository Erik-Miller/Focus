import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workflow } from "@focus/shared";
import { WorkflowCard } from "./WorkflowCard.js";

const mocks = vi.hoisted(() => ({
  saveWorkflowForLater: vi.fn(),
  runAutomation: vi.fn(),
}));

vi.mock("@/localApi", () => ({
  callables: {
    saveWorkflowForLater: mocks.saveWorkflowForLater,
  },
}));

vi.mock("@/platform", () => ({
  getBridge: () => ({ runAutomation: mocks.runAutomation }),
}));

const workflow: Workflow = {
  name: "Compare links",
  description: "The user compares links.",
  stepsObserved: ["Open link", "Copy summary"],
  frequency: "twice",
  automatable: true,
  automationIdea: "Build a link comparison script.",
  evidenceObsIds: ["obs1"],
};

function renderCard() {
  render(
    <WorkflowCard
      workflow={workflow}
      context={{ label: "Context", value: "You compare links.", fallback: "(none)" }}
      source={{ sessionId: "session1", reportId: "report1", title: "Report title" }}
    />,
  );
}

describe("WorkflowCard", () => {
  beforeEach(() => {
    mocks.saveWorkflowForLater.mockReset();
    mocks.runAutomation.mockReset();
    mocks.saveWorkflowForLater.mockResolvedValue({ data: { id: "saved1" } });
    mocks.runAutomation.mockResolvedValue({ ok: true, copied: true });
  });

  it("saves an automation candidate for later", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: /Save this automation prompt/i }));

    expect(mocks.saveWorkflowForLater).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSessionId: "session1",
        sourceReportId: "report1",
        sourceTitle: "Report title",
        prompt: expect.stringContaining("Build a link comparison script."),
      }),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /Saved/i })).toBeInTheDocument());
  });

  it("launches the mocked desktop handoff", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: /Copy & Open Claude Desktop/i }));

    expect(mocks.runAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "desktop",
        title: "Compare links",
        prompt: expect.stringContaining("Automation candidate:\nCompare links"),
      }),
    );
    expect(await screen.findByText(/Prompt copied/)).toBeInTheDocument();
  });
});
