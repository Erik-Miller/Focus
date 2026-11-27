import type { Report, Session } from "@focus/shared";
import { Button } from "@/components/ui/button";
import { WorkflowCard } from "./WorkflowCard";

export function SessionWorkflows({
  session,
  report,
  savedCount,
  onOpenInbox,
}: {
  session: Session;
  report: Report | null;
  savedCount: number;
  onOpenInbox: () => void;
}) {
  const useReport = Boolean(
    report?.workflows.length &&
    session.status !== "active" &&
    (report.updatedAt ?? report.createdAt) >= session.lastUpdateAt,
  );
  const workflows = useReport && report ? report.workflows : session.discoveredWorkflows;
  return (
    <section className="session-workflows" aria-label="Discovered workflows">
      <div className="session-workflows-head">
        <h3>Discovered workflows</h3>
        <Button size="sm" variant="secondary" onClick={onOpenInbox}>
          Saved workflows ({savedCount})
        </Button>
      </div>
      {workflows.length ? (
        workflows.map((workflow, index) => (
          <WorkflowCard
            key={`${session.id}-${workflow.name}-${index}`}
            workflow={workflow}
            context={{
              label: "Session context",
              value: session.currentIntent,
              fallback: "No intent captured.",
            }}
            source={{
              sessionId: session.id,
              title: session.title || session.currentIntent || "Session",
              ...(useReport && report ? { reportId: report.id } : {}),
            }}
            onOpenInbox={onOpenInbox}
          />
        ))
      ) : (
        <p className="muted">
          Workflows will appear here as Focus identifies them. You can save any workflow and open
          its prompt in Codex or Claude.
        </p>
      )}
    </section>
  );
}
