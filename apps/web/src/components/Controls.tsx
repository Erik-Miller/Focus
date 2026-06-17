import { Inbox } from "lucide-react";
import type { Session } from "@focus/shared";
import { Button } from "@/components/ui/button";

interface Props {
  desktop: boolean;
  session: Session | null;
  busy: string | null;
  onStart: () => void;
  onStop: () => void;
  onLoadDemo: () => void;
  onNewSession: () => void;
  onGenerateReport: () => void;
  onOpenInbox: () => void;
  inboxActive: boolean;
  inboxCount: number;
}

export function Controls({
  desktop,
  session,
  busy,
  onStart,
  onStop,
  onLoadDemo,
  onNewSession,
  onGenerateReport,
  onOpenInbox,
  inboxActive,
  inboxCount,
}: Props) {
  const disabled = Boolean(busy);
  const active = session?.status === "active";
  const reporting = session?.status === "reporting";
  const stopped = session?.status === "stopped" || reporting;

  return (
    <div className="controls">
      {desktop && !session && (
        <Button onClick={onStart} disabled={disabled}>
          ● Start Focus
        </Button>
      )}
      {desktop && active && (
        <Button variant="secondary" onClick={onStop} disabled={disabled}>
          ■ Stop Focus
        </Button>
      )}
      {reporting && (
        <span className="report-status">
          {session?.reportId ? "Amending report…" : "Generating report…"}
        </span>
      )}
      {session && (stopped || session.isDemo) && !reporting && (
        <Button variant="secondary" onClick={onGenerateReport} disabled={disabled}>
          {session.reportId ? "Amend report" : "Generate report"}
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
        title="Automation Inbox"
      >
        <Inbox />
        Inbox{inboxCount > 0 ? ` ${inboxCount}` : ""}
      </Button>
    </div>
  );
}
