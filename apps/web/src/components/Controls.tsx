import { Inbox } from "lucide-react";
import type { Session } from "@focus/shared";
import { Button } from "@/components/ui/button";

interface Props {
  desktop: boolean;
  session: Session | null;
  busy: string | null;
  startingLabel: string | null;
  onStart: () => void;
  onStop: () => void;
  onLoadDemo: () => void;
  onNewSession: () => void;
  onGenerateReport: () => void;
  onOpenInbox: () => void;
  inboxActive: boolean;
  inboxCount: number;
  reportCountdownLabel: string | null;
}

export function Controls({
  desktop,
  session,
  busy,
  startingLabel,
  onStart,
  onStop,
  onLoadDemo,
  onNewSession,
  onGenerateReport,
  onOpenInbox,
  inboxActive,
  inboxCount,
  reportCountdownLabel,
}: Props) {
  const disabled = Boolean(busy);
  const starting = Boolean(startingLabel);
  const reporting = session?.status === "reporting";
  const reportQueued = Boolean(reportCountdownLabel && !reporting);
  const active = session?.status === "active" && !reportQueued && !starting;
  const stopped = !starting && (session?.status === "stopped" || reporting || reportQueued);

  return (
    <div className="controls">
      {desktop && !session && (
        starting ? (
          <span className="start-status">{startingLabel}</span>
        ) : (
          <Button onClick={onStart} disabled={disabled}>
            ● Start Focus
          </Button>
        )
      )}
      {desktop && active && (
        <Button variant="secondary" onClick={onStop} disabled={disabled}>
          ■ Stop Focus
        </Button>
      )}
      {reporting && (
        <span className="report-status">
          {session?.reportId ? "Updating summary..." : "Generating summary..."}
        </span>
      )}
      {session && (stopped || session.isDemo) && !reporting && !reportQueued && (
        <Button variant="secondary" onClick={onGenerateReport} disabled={disabled}>
          {session.reportId ? "Update summary" : "Generate summary"}
        </Button>
      )}
      {!session && !desktop && (
        <Button onClick={onLoadDemo} disabled={disabled}>
          Load demo
        </Button>
      )}
      {session && (
        <Button variant="ghost" onClick={onNewSession} disabled={disabled}>
          New session
        </Button>
      )}
      <Button
        variant={inboxActive ? "secondary" : "ghost"}
        onClick={onOpenInbox}
        disabled={disabled}
        title="Workflow Inbox"
      >
        <Inbox />
        Inbox{inboxCount > 0 ? ` ${inboxCount}` : ""}
      </Button>
    </div>
  );
}
