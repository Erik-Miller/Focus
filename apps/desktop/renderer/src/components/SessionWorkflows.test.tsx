import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Report, Session, Workflow, WorkflowSource } from "@focus/shared";
import { SessionWorkflows } from "./SessionWorkflows";

vi.mock("./WorkflowCard", () => ({
  WorkflowCard: ({ workflow, source }: { workflow: Workflow; source: WorkflowSource }) => (
    <div data-testid="workflow" data-report={source.reportId}>
      {workflow.name}
    </div>
  ),
}));

const session = {
  id: "session1",
  status: "active",
  currentIntent: "Research",
  lastUpdateAt: 200,
  discoveredWorkflows: [{ name: "New discovery" }],
} as Session;
const report = {
  id: "report1",
  createdAt: 100,
  workflows: [{ name: "Old report workflow" }],
} as Report;

describe("session workflows", () => {
  it("shows live discoveries during resumed monitoring and after stopping with an old report", () => {
    const { rerender } = render(
      <SessionWorkflows session={session} report={report} savedCount={0} onOpenInbox={vi.fn()} />,
    );
    expect(screen.getByTestId("workflow")).toHaveTextContent("New discovery");
    expect(screen.getByTestId("workflow")).not.toHaveAttribute("data-report");
    rerender(
      <SessionWorkflows
        session={{ ...session, status: "stopped" }}
        report={report}
        savedCount={0}
        onOpenInbox={vi.fn()}
      />,
    );
    expect(screen.getByTestId("workflow")).toHaveTextContent("New discovery");
  });

  it("uses a refreshed report once it includes the latest session activity", () => {
    render(
      <SessionWorkflows
        session={{ ...session, status: "stopped" }}
        report={{ ...report, updatedAt: 300 }}
        savedCount={1}
        onOpenInbox={vi.fn()}
      />,
    );
    expect(screen.getByTestId("workflow")).toHaveTextContent("Old report workflow");
    expect(screen.getByTestId("workflow")).toHaveAttribute("data-report", "report1");
    expect(screen.getByRole("button", { name: "Saved workflows (1)" })).toBeInTheDocument();
  });
});
