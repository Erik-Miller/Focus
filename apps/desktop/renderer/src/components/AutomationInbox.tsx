import { useEffect, useRef, useState } from "react";
import { ChevronRight, Clipboard, Monitor, Terminal, Trash2 } from "lucide-react";
import {
  directAddressText,
  type SavedWorkflow,
  type SavedWorkflowLaunchTarget,
} from "@focus/shared";
import { callables } from "@/firebase";
import { getBridge } from "@/platform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SecondaryPage } from "./SecondaryPage";

type BusyAction = "copy" | "desktop" | "terminal" | "delete";
type ActionFeedback = { id: string; action: BusyAction; label: string };

export function AutomationInbox({ items, onBack }: { items: SavedWorkflow[]; onBack: () => void }) {
  const [busy, setBusy] = useState<{ id: string; action: BusyAction } | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const bridge = getBridge();

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  function showButtonFeedback(next: ActionFeedback) {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    setFeedback(next);
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback((current) =>
        current?.id === next.id && current.action === next.action ? null : current,
      );
      feedbackTimerRef.current = null;
    }, 1800);
  }

  async function copyPrompt(item: SavedWorkflow) {
    setBusy({ id: item.id, action: "copy" });
    setError(null);
    try {
      await writeTextToClipboard(item.prompt);
      showButtonFeedback({ id: item.id, action: "copy", label: "Copied" });
    } catch (err) {
      console.error("Failed to copy saved workflow prompt", err);
      setError({ id: item.id, message: errorMessage(err, "Could not copy the prompt.") });
    } finally {
      setBusy(null);
    }
  }

  async function launch(item: SavedWorkflow, target: SavedWorkflowLaunchTarget) {
    setBusy({ id: item.id, action: target });
    setError(null);
    try {
      if (!bridge?.runAutomation) throw new Error("Claude handoff is available in Focus desktop.");
      await bridge.runAutomation({
        target,
        title: item.workflow.name,
        prompt: item.prompt,
      });
      await callables
        .recordSavedWorkflowLaunch({ id: item.id, target })
        .catch((err) => console.error("Failed to record saved workflow launch", err));
      showButtonFeedback({
        id: item.id,
        action: target,
        label: target === "desktop" ? "Opened" : "Sent",
      });
    } catch (err) {
      console.error("Failed to launch saved workflow", err);
      setError({
        id: item.id,
        message: errorMessage(
          err,
          "Claude handoff failed. Check that Claude is installed and try again.",
        ),
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: SavedWorkflow) {
    setBusy({ id: item.id, action: "delete" });
    setError(null);
    try {
      await callables.deleteSavedWorkflow({ id: item.id });
    } catch (err) {
      console.error("Failed to remove saved workflow", err);
      setError({ id: item.id, message: errorMessage(err, "Could not remove the saved workflow.") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <SecondaryPage
      title="Workflow Inbox"
      count={items.length}
      className="automation-inbox-page"
      headerClassName="automation-inbox-page-head"
      contentClassName="automation-inbox-content"
      backClassName="automation-inbox-back report-back"
      onBack={onBack}
    >
      <section className="automation-inbox">
        {items.length ? (
          <div className="saved-workflow-list">
            {items.map((item) => {
              const rowBusy = busy && busy.id === item.id ? busy.action : null;
              const rowFeedback = feedback && feedback.id === item.id ? feedback : null;
              const rowError = error && error.id === item.id ? error.message : null;
              return (
                <SavedWorkflowRow
                  key={item.id}
                  item={item}
                  busy={rowBusy}
                  feedback={rowFeedback}
                  error={rowError}
                  canLaunch={Boolean(bridge?.runAutomation)}
                  onCopy={() => copyPrompt(item)}
                  onLaunch={(target) => launch(item, target)}
                  onDelete={() => remove(item)}
                />
              );
            })}
          </div>
        ) : (
          <div className="automation-inbox-empty">
            <strong>No saved workflows yet</strong>
          </div>
        )}
      </section>
    </SecondaryPage>
  );
}

function SavedWorkflowRow({
  item,
  busy,
  feedback,
  error,
  canLaunch,
  onCopy,
  onLaunch,
  onDelete,
}: {
  item: SavedWorkflow;
  busy: BusyAction | null;
  feedback: ActionFeedback | null;
  error: string | null;
  canLaunch: boolean;
  onCopy: () => void;
  onLaunch: (target: SavedWorkflowLaunchTarget) => void;
  onDelete: () => void;
}) {
  const disabled = Boolean(busy);
  const description = directAddressText(item.workflow.description);
  const automationIdea = directAddressText(item.workflow.automationIdea);

  return (
    <article className="saved-workflow">
      <div className="saved-workflow-head">
        <div className="saved-workflow-title">
          <strong>{item.workflow.name}</strong>
          <span className="saved-workflow-source">{item.sourceTitle}</span>
        </div>
        <div className="saved-workflow-head-actions">
          <div className="saved-workflow-badges">
            {item.lastLaunchedAt && <Badge variant="secondary">{lastLaunchLabel(item)}</Badge>}
          </div>
          <Button
            type="button"
            className="automation-action-delete"
            size="icon-sm"
            variant="ghost"
            onClick={onDelete}
            disabled={disabled}
            title="Remove saved workflow"
            aria-label={busy === "delete" ? "Removing saved workflow" : "Remove saved workflow"}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <p className="muted">{description}</p>
      <p className="automation">
        <span>Automation idea:</span> {automationIdea}
      </p>
      <div className="saved-workflow-meta">Saved {dateLabel(item.updatedAt)}</div>

      <details className="saved-workflow-prompt">
        <summary>
          <ChevronRight className="summary-chevron" aria-hidden />
          <span>Prompt</span>
        </summary>
        <pre>{item.prompt}</pre>
      </details>

      <div className="automation-actions saved-workflow-actions">
        <Button
          type="button"
          className="automation-action-save saved-workflow-action saved-workflow-action-copy"
          size="sm"
          variant="secondary"
          onClick={onCopy}
          disabled={disabled}
          title="Copy saved automation prompt"
        >
          <Clipboard />
          <span className="action-label-full">
            {buttonLabel({ busy, feedback, action: "copy", fallback: "Copy Prompt" })}
          </span>
          <span className="action-label-short">
            {buttonLabel({ busy, feedback, action: "copy", fallback: "Copy" })}
          </span>
        </Button>
        {canLaunch && (
          <>
            <Button
              type="button"
              className="automation-action-cta saved-workflow-action saved-workflow-action-desktop"
              size="sm"
              variant="secondary"
              onClick={() => onLaunch("desktop")}
              disabled={disabled}
              title="Copy the automation prompt and open Claude Desktop"
            >
              <Monitor />
              <span className="action-label-full">
                {buttonLabel({ busy, feedback, action: "desktop", fallback: "Claude Desktop" })}
              </span>
              <span className="action-label-short">
                {buttonLabel({ busy, feedback, action: "desktop", fallback: "Desktop" })}
              </span>
            </Button>
            <Button
              type="button"
              className="automation-action-cta saved-workflow-action saved-workflow-action-terminal"
              size="sm"
              variant="secondary"
              onClick={() => onLaunch("terminal")}
              disabled={disabled}
              title="Open Terminal and run Claude CLI"
            >
              <Terminal />
              <span>
                {buttonLabel({ busy, feedback, action: "terminal", fallback: "Claude Terminal" })}
              </span>
            </Button>
          </>
        )}
      </div>
      {error && (
        <p className="automation-error saved-workflow-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function buttonLabel({
  busy,
  feedback,
  action,
  fallback,
}: {
  busy: BusyAction | null;
  feedback: ActionFeedback | null;
  action: BusyAction;
  fallback: string;
}): string {
  if (busy === action) {
    if (action === "copy") return "Copying";
    if (action === "desktop") return "Opening";
    if (action === "terminal") return "Opening";
  }
  if (feedback?.action === action) return feedback.label;
  return fallback;
}

function lastLaunchLabel(item: SavedWorkflow): string {
  const target = item.lastLaunchTarget === "terminal" ? "Claude Terminal" : "Claude Desktop";
  return `${target} ${dateLabel(item.lastLaunchedAt!)}`;
}

function dateLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

async function writeTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      console.warn("navigator.clipboard.writeText failed; falling back to textarea copy", err);
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (!document.execCommand("copy")) throw new Error("Clipboard is not available.");
  } finally {
    document.body.removeChild(textarea);
  }
}
