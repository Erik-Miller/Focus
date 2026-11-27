import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedWorkflow } from "@focus/shared";
import { AutomationInbox } from "./AutomationInbox.js";

const mocks = vi.hoisted(() => ({
  deleteSavedWorkflow: vi.fn(),
  recordSavedWorkflowLaunch: vi.fn(),
  runAutomation: vi.fn(),
  writeText: vi.fn(),
  execCommand: vi.fn(),
}));

vi.mock("@/localApi", () => ({
  callables: {
    deleteSavedWorkflow: mocks.deleteSavedWorkflow,
    recordSavedWorkflowLaunch: mocks.recordSavedWorkflowLaunch,
  },
}));

vi.mock("@/platform", () => ({
  getBridge: () => ({ runAutomation: mocks.runAutomation }),
}));

const item: SavedWorkflow = {
  id: "a".repeat(32),
  workflow: {
    name: "Compare links",
    description: "The user compares links.",
    stepsObserved: ["Open link"],
    frequency: "twice",
    automatable: true,
    automationIdea: "Build a link comparison script.",
    evidenceObsIds: ["obs1"],
  },
  prompt: "Prompt body",
  sourceSessionId: "session1",
  sourceReportId: "report1",
  sourceTitle: "Report title",
  createdAt: Date.UTC(2026, 0, 2, 15, 4),
  updatedAt: Date.UTC(2026, 0, 2, 15, 4),
};

describe("AutomationInbox", () => {
  beforeEach(() => {
    mocks.deleteSavedWorkflow.mockReset();
    mocks.recordSavedWorkflowLaunch.mockReset();
    mocks.runAutomation.mockReset();
    mocks.deleteSavedWorkflow.mockResolvedValue({ data: { ok: true } });
    mocks.recordSavedWorkflowLaunch.mockResolvedValue({ data: { ok: true } });
    mocks.runAutomation.mockResolvedValue({ ok: true, copied: true });
    mocks.writeText.mockReset();
    mocks.writeText.mockResolvedValue(undefined);
    mocks.execCommand.mockReset();
    mocks.execCommand.mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: navigator.clipboard ?? { writeText: async () => undefined },
    });
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(mocks.writeText);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: mocks.execCommand,
    });
  });

  it("launches desktop handoff and records metadata", async () => {
    const user = userEvent.setup();
    render(<AutomationInbox items={[item]} onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Copy for agent" }));
    await user.click(screen.getByRole("menuitem", { name: "Claude Desktop" }));
    expect(mocks.runAutomation).toHaveBeenCalledWith({
      target: "desktop",
      title: "Compare links",
      prompt: "Prompt body",
    });
    expect(mocks.recordSavedWorkflowLaunch).toHaveBeenCalledWith({
      id: item.id,
      target: "desktop",
    });
  });

  it("deletes saved workflows and renders the empty state", async () => {
    const user = userEvent.setup();
    render(<AutomationInbox items={[item]} onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Remove saved workflow/i }));
    expect(mocks.deleteSavedWorkflow).toHaveBeenCalledWith({ id: item.id });

    render(<AutomationInbox items={[]} onBack={vi.fn()} />);
    expect(screen.getByText("No saved workflows yet")).toBeInTheDocument();
  });
});
