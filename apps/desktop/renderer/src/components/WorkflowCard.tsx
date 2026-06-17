import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Save, Terminal, Zap } from "lucide-react";
import { directAddressText, type Workflow } from "@focus/shared";
import { buildAutomationPrompt, type WorkflowContext, type WorkflowSource } from "@/automation";
import { callables } from "@/firebase";
import { getBridge, type AutomationLaunchTarget } from "@/platform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type WorkflowCardProps = {
  workflow: Workflow;
  context: WorkflowContext;
  source: WorkflowSource;
  spotlight?: boolean;
};

export function WorkflowCard({ workflow, context, source, spotlight = false }: WorkflowCardProps) {
  const [launching, setLaunching] = useState<AutomationLaunchTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const saveFeedbackTimerRef = useRef<number | null>(null);
  const bridge = getBridge();
  const hasAutomationCandidate = Boolean(workflow.automatable && workflow.automationIdea);
  const canLaunch = Boolean(bridge?.runAutomation && hasAutomationCandidate);
  const description = directAddressText(workflow.description);
  const automationIdea = directAddressText(workflow.automationIdea);

  useEffect(() => {
    return () => {
      if (saveFeedbackTimerRef.current !== null) {
        window.clearTimeout(saveFeedbackTimerRef.current);
      }
    };
  }, []);

  async function saveForLater() {
    if (!hasAutomationCandidate) return;
    const prompt = buildAutomationPrompt(workflow, context);
    setError(null);
    setNotice(null);
    setSaveConfirmed(false);
    if (saveFeedbackTimerRef.current !== null) {
      window.clearTimeout(saveFeedbackTimerRef.current);
      saveFeedbackTimerRef.current = null;
    }
    setSaving(true);
    try {
      const input = {
        workflow,
        prompt,
        sourceSessionId: source.sessionId,
        sourceTitle: source.title,
      };
      await callables.saveWorkflowForLater(
        source.reportId ? { ...input, sourceReportId: source.reportId } : input,
      );
      setSaveConfirmed(true);
      saveFeedbackTimerRef.current = window.setTimeout(() => {
        setSaveConfirmed(false);
        saveFeedbackTimerRef.current = null;
      }, 1000);
    } catch (err) {
      console.error("Failed to save workflow", err);
      setError(errorMessage(err, "Failed to save workflow. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function launch(target: AutomationLaunchTarget) {
    if (!hasAutomationCandidate) return;
    const prompt = buildAutomationPrompt(workflow, context);
    setError(null);
    setNotice(null);
    setSaveConfirmed(false);
    setLaunching(target);
    try {
      if (!bridge?.runAutomation) {
        throw new Error("Claude handoff is available in Focus desktop.");
      }
      const result = await bridge.runAutomation({ target, title: workflow.name, prompt });
      if (target === "desktop") {
        setNotice(
          result.copied
            ? "Prompt copied. Paste it into Claude Desktop when it opens."
            : "Claude Desktop is opening.",
        );
      } else {
        setNotice(
          result.copied
            ? "Prompt copied and sent to Claude CLI in Terminal."
            : "Terminal is opening with Claude CLI.",
        );
      }
    } catch (err) {
      console.error("Failed to launch Claude automation", err);
      setError(
        errorMessage(err, "Claude handoff failed. Check that Claude is installed and try again."),
      );
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className={spotlight ? "workflow workflow-spotlight" : "workflow"}>
      <div className="workflow-head">
        <strong>{workflow.name}</strong>
        {workflow.automatable && (
          <Badge
            className="workflow-automation-badge"
            variant="outline"
            title="This workflow is ready to launch as an automation"
          >
            <Zap aria-hidden />
            Automation-ready
          </Badge>
        )}
      </div>
      <p className="muted">{description}</p>
      {hasAutomationCandidate && (
        <p className="automation">
          <span>Automation idea:</span> {automationIdea}
        </p>
      )}
      {hasAutomationCandidate && (
        <>
          <div className="automation-actions">
            <Button
              type="button"
              className={
                saveConfirmed ? "automation-action-save is-saved" : "automation-action-save"
              }
              size="sm"
              variant="secondary"
              onClick={saveForLater}
              disabled={saving || launching !== null}
              title={
                saveConfirmed ? "Saved to Workflow Inbox." : "Save this automation prompt for later"
              }
              aria-label={
                saveConfirmed ? "Saved to Workflow Inbox." : "Save this automation prompt for later"
              }
            >
              {saveConfirmed ? <Check /> : <Save />}
              {saveConfirmed ? "Saved" : saving ? "Saving" : "Save"}
            </Button>
            <Button
              type="button"
              className="automation-action-cta"
              size="sm"
              variant="secondary"
              onClick={() => launch("desktop")}
              disabled={!canLaunch || launching !== null}
              title={
                canLaunch
                  ? "Copy the automation prompt and open Claude Desktop"
                  : "Available in Focus desktop"
              }
            >
              <Monitor />
              {launching === "desktop" ? "Opening Claude Desktop" : "Copy & Open Claude Desktop"}
            </Button>
            <Button
              type="button"
              className="automation-action-cta"
              size="sm"
              variant="secondary"
              onClick={() => launch("terminal")}
              disabled={!canLaunch || launching !== null}
              title={canLaunch ? "Open Terminal and run Claude CLI" : "Available in Focus desktop"}
            >
              <Terminal />
              {launching === "terminal" ? "Opening Claude Terminal" : "Claude Terminal"}
            </Button>
          </div>
          {!bridge?.runAutomation && (
            <p className="automation-hint">Claude handoff is available in Focus desktop.</p>
          )}
          {notice && (
            <p className="automation-confirmation" aria-live="polite">
              {notice}
            </p>
          )}
          {error && (
            <p className="automation-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
