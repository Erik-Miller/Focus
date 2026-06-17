import type { Workflow } from "@focus/shared";

export type WorkflowContext = {
  label: string;
  value: string;
  fallback: string;
};

export type WorkflowSource = {
  sessionId: string;
  reportId?: string;
  title: string;
};

export function buildAutomationPrompt(workflow: Workflow, context: WorkflowContext): string {
  const steps = workflow.stepsObserved?.length
    ? workflow.stepsObserved.map((step, i) => `${i + 1}. ${step}`).join("\n")
    : "(No ordered steps captured.)";
  const evidence = workflow.evidenceObsIds?.length
    ? workflow.evidenceObsIds.join(", ")
    : "(No observation ids captured.)";

  return [
    "You are Claude, launched from Focus to help implement an automation candidate.",
    "",
    `${context.label}:`,
    context.value || context.fallback,
    "",
    "Automation candidate:",
    workflow.name,
    "",
    "Workflow description:",
    workflow.description,
    "",
    "Observed steps:",
    steps,
    "",
    "Frequency:",
    workflow.frequency || "(Unknown)",
    "",
    "Automation idea:",
    workflow.automationIdea,
    "",
    "Supporting observation ids:",
    evidence,
    "",
    "Please inspect the relevant local workspace, propose the smallest practical implementation,",
    "then implement and verify it. Do not make destructive changes or use secrets without asking first.",
  ].join("\n");
}
