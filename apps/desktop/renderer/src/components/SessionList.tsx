import { useState } from "react";
import { ChevronRight, MoreHorizontal, Trash2 } from "lucide-react";
import type { Session } from "@focus/shared";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => Promise<void> | void;
  overlay?: boolean;
}

export function SessionList({ sessions, activeId, onSelect, onDelete, overlay = false }: Props) {
  const [open, setOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  if (sessions.length === 0) return null;

  const deleteSession = async (session: Session) => {
    if (!onDelete || deletingId) return;
    const sessionLabel = label(session);
    const confirmed = window.confirm(`Delete "${sessionLabel}"? This cannot be undone.`);
    if (!confirmed) {
      setMenuOpenId(null);
      return;
    }

    setDeletingId(session.id);
    try {
      await onDelete(session.id);
      setMenuOpenId(null);
    } finally {
      setDeletingId(null);
    }
  };

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
          <ul className={`sl-list${menuOpenId ? " has-open-menu" : ""}`}>
            {sessions.map((s) => (
              <li key={s.id}>
                <div
                  className={`sl-row${s.id === activeId ? " is-current" : ""}${menuOpenId === s.id ? " has-open-menu" : ""}`}
                >
                  <button
                    type="button"
                    className="sl-item"
                    onClick={() => {
                      setMenuOpenId(null);
                      onSelect(s.id);
                      if (overlay) setOpen(false);
                    }}
                  >
                    <span className={`sl-status sl-${s.status}`} aria-hidden />
                    <span className="sl-body">
                      <span className="sl-name">{label(s)}</span>
                      <span className="sl-meta">{when(s)}</span>
                    </span>
                    {s.status === "reporting" && (
                      <span className="sl-tag sl-tag-live">summary…</span>
                    )}
                  </button>
                  {onDelete && (
                    <span className="sl-actions">
                      <button
                        type="button"
                        className="sl-more"
                        aria-label={`Session actions for ${label(s)}`}
                        aria-haspopup="menu"
                        aria-expanded={menuOpenId === s.id}
                        disabled={deletingId === s.id}
                        onClick={() => setMenuOpenId((current) => (current === s.id ? null : s.id))}
                      >
                        <MoreHorizontal aria-hidden />
                      </button>
                      {menuOpenId === s.id && (
                        <span className="sl-menu" role="menu">
                          <button
                            type="button"
                            className="sl-menu-item sl-menu-delete"
                            role="menuitem"
                            disabled={deletingId === s.id}
                            onClick={() => void deleteSession(s)}
                          >
                            <Trash2 aria-hidden />
                            <span>{deletingId === s.id ? "Deleting..." : "Delete session"}</span>
                          </button>
                        </span>
                      )}
                    </span>
                  )}
                </div>
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
