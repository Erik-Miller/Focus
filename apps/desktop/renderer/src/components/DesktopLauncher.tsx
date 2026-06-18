import { type MouseEvent as ReactMouseEvent } from "react";
import { ChevronsDownUp, ChevronsUpDown, Inbox, Play, Plus, Square } from "lucide-react";
import { getBridge } from "@/platform";

export type LiveMonitoringPhase = "monitoring" | "capturing" | "analyzing" | "stopping";

const LAUNCHER_DRAG_IGNORE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[data-slot='button']",
].join(",");

export function Launcher({
  busy,
  monitoring,
  label,
  phase,
  startingLabel,
  expanded,
  onStart,
  onStop,
  onNew,
  onOpenInbox,
  inboxActive,
  inboxCount,
  inboxPulseKey,
  onToggleExpand,
}: {
  busy: string | null;
  monitoring: boolean;
  label: string;
  phase: LiveMonitoringPhase;
  startingLabel: string | null;
  expanded: boolean;
  onStart: () => void;
  onStop: () => void;
  onNew: () => void;
  onOpenInbox: () => void;
  inboxActive: boolean;
  inboxCount: number;
  inboxPulseKey: number;
  onToggleExpand: () => void;
}) {
  const disabled = Boolean(busy);
  const startPending = Boolean(startingLabel);
  const startWindowDrag = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(LAUNCHER_DRAG_IGNORE_SELECTOR)) return;

    const bridge = getBridge();
    if (!bridge?.beginMove || !bridge.moveBy || !bridge.endMove) return;

    event.preventDefault();
    event.stopPropagation();
    const startX = event.screenX;
    const startY = event.screenY;
    void bridge.beginMove();

    const onMove = (moveEvent: MouseEvent) => {
      void bridge.moveBy({ dx: moveEvent.screenX - startX, dy: moveEvent.screenY - startY });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      void bridge.endMove();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
  };

  return (
    <div
      className={expanded ? "launcher-bar lb-header" : "launcher-bar lb-collapsed"}
      onMouseDown={startWindowDrag}
    >
      <button
        className="lb-btn lb-ghost"
        onClick={onNew}
        disabled={disabled || startPending}
        title="New session"
      >
        <Plus aria-hidden />
        <span>New</span>
      </button>

      <div className="lb-center">
        {monitoring ? (
          <div className="lb-live" data-phase={phase}>
            <span className="lb-livedot" />
            <span className="lb-livelabel">
              <span className="lb-livelabel-text" key={label}>
                {label}
              </span>
            </span>
            <button className="lb-stop" onClick={onStop} disabled={disabled}>
              <span className="lb-stop-mark" aria-hidden>
                <Square aria-hidden />
              </span>
              <span>Stop</span>
            </button>
          </div>
        ) : startingLabel ? (
          <div className="lb-starting" aria-live="polite">
            <span className="lb-starting-mark" aria-hidden />
            <span className="lb-starting-label">{startingLabel}</span>
          </div>
        ) : (
          <button className="lb-start" onClick={onStart} disabled={disabled}>
            <span className="lb-play-mark" aria-hidden>
              <Play aria-hidden />
            </span>
            <span>{busy ? "Starting..." : "Start monitoring"}</span>
          </button>
        )}
      </div>

      <div className="lb-right">
        <button
          className={`lb-icon${inboxActive ? " is-active" : ""}`}
          onClick={onOpenInbox}
          disabled={disabled}
          title="Workflow Inbox"
          aria-label="Workflow Inbox"
        >
          <Inbox aria-hidden />
          {inboxCount > 0 && (
            <span
              key={inboxPulseKey}
              className={`lb-count${inboxPulseKey > 0 ? " is-pulsing" : ""}`}
            >
              {inboxCount}
            </span>
          )}
        </button>
        <button
          className="lb-icon"
          onClick={onToggleExpand}
          disabled={disabled}
          title={expanded ? "Collapse" : "Expand"}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronsDownUp aria-hidden /> : <ChevronsUpDown aria-hidden />}
        </button>
      </div>
    </div>
  );
}

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const RESIZE_DIRS: ResizeDir[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

export function ResizeHandles() {
  const startResize = (dir: ResizeDir) => (e: ReactMouseEvent) => {
    const bridge = getBridge();
    if (!bridge?.beginResize) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.screenX;
    const startY = e.screenY;
    void bridge.beginResize(dir);

    const onMove = (ev: globalThis.MouseEvent) => {
      void bridge.resizeBy?.({ dx: ev.screenX - startX, dy: ev.screenY - startY });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      void bridge.endResize?.();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="rz-layer" aria-hidden>
      {RESIZE_DIRS.map((d) => (
        <div key={d} className={`rz rz-${d}`} onMouseDown={startResize(d)} />
      ))}
    </div>
  );
}
