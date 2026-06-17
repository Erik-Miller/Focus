import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Session } from "@focus/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  overlay?: boolean;
}

export function SessionList({ sessions, activeId, onSelect, overlay = false }: Props) {
  const [open, setOpen] = useState(false);
  if (sessions.length === 0) return null;

  return (
    <Card
      className={`session-list gap-0 py-0${overlay ? " session-list-overlay" : " overflow-hidden"}`}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="panel-head">
          <div className="panel-title sl-title">
            Sessions <span className="count">{sessions.length}</span>
          </div>
          <span className={`chevron${open ? " is-open" : ""}`} aria-hidden>
            <ChevronRight />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="session-list-content">
          <ul className="sl-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`sl-item${s.id === activeId ? " is-current" : ""}`}
                  onClick={() => {
                    onSelect(s.id);
                    if (overlay) setOpen(false);
                  }}
                >
                  <span className={`sl-status sl-${s.status}`} aria-hidden />
                  <span className="sl-body">
                    <span className="sl-name">{label(s)}</span>
                    <span className="sl-meta">{when(s)}</span>
                  </span>
                  {s.status === "reporting" && <span className="sl-tag sl-tag-live">report…</span>}
                  {s.reportId && <Badge variant="secondary">report</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function label(s: Session): string {
  return s.currentIntent?.trim() || s.title?.trim() || "Untitled session";
}

function when(s: Session): string {
  const d = new Date(s.startedAt);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
