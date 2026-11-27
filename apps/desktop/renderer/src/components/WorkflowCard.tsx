import { AgentHandoffMenu } from "./AgentHandoffMenu";
import { useState } from "react";
import { Check, Save, Zap } from "lucide-react";
import { directAddressText, type Workflow } from "@focus/shared";
import { buildAutomationPrompt, type WorkflowContext, type WorkflowSource } from "@/automation";
import { callables } from "@/localApi";
import { getBridge, type AutomationLaunchTarget } from "@/platform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type WorkflowCardProps = {
  workflow: Workflow;
  context: WorkflowContext;
  source: WorkflowSource;
  spotlight?: boolean;
  onOpenInbox?: () => void;
};

export function WorkflowCard({
  workflow,
  context,
  source,
  spotlight = false,
  onOpenInbox,
}: WorkflowCardProps) {
  const [launching, setLaunching] = useState<AutomationLaunchTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bridge = getBridge();
  const hasAutomationCandidate = Boolean(workflow.automatable && workflow.automationIdea);
  const canLaunch = Boolean(bridge?.runAutomation);
  const description = directAddressText(workflow.description);
  const automationIdea = directAddressText(workflow.automationIdea);

  async function saveForLater() {
    const prompt = buildAutomationPrompt(workflow, context);
    setError(null);
    setNotice(null);
    setSaveConfirmed(false);
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
    } catch (err) {
      console.error("Failed to save workflow", err);
      setError(errorMessage(err, "Failed to save workflow. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function launch(target: AutomationLaunchTarget) {
    const prompt = buildAutomationPrompt(workflow, context);
    setError(null);
    setNotice(null);
    setSaveConfirmed(false);
    setLaunching(target);
    try {
      if (!bridge?.runAutomation) {
        throw new Error("App handoff is available in Focus desktop.");
      }
      const result = await bridge.runAutomation({ target, title: workflow.name, prompt });
      if (target === "codex") {
        setNotice("Prompt copied. In Codex, choose your project and paste it into a new chat.");
      } else if (target === "desktop") {
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
      console.error("Failed to open workflow", err);
      setError(
        errorMessage(err, "App handoff failed. Check that Claude is installed and try again."),
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
      {
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
              title={saveConfirmed ? "Saved to Workflow Inbox." : "Save workflow to Inbox"}
              aria-label={saveConfirmed ? "Saved to Workflow Inbox." : "Save workflow to Inbox"}
            >
              {saveConfirmed ? <Check /> : <Save />}
              {saveConfirmed ? "Saved to Inbox" : saving ? "Saving" : "Save workflow"}
            </Button>
            <AgentHandoffMenu
              disabled={!canLaunch || saving}
              busy={launching !== null}
              onLaunch={launch}
            />
          </div>
          {saveConfirmed && onOpenInbox && (
            <Button size="sm" variant="ghost" onClick={onOpenInbox}>
              Open Workflow Inbox
            </Button>
          )}
          {!bridge?.runAutomation && (
            <p className="automation-hint">App handoff is available in Focus desktop.</p>
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
      }
    </div>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
