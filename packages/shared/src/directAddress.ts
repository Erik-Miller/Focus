import type { Report, Workflow } from "./types.js";
import type { ReportContent, UnderstandingUpdate } from "./schemas.js";

export function directAddressText(value: string): string {
  const referencedUser = /\b(?:(?:the|this) user|(?:the|this) person)(?:['’]s)?\b/i.test(value);
  let text = value;

  text = text
    .replace(/\bThis person is\b/g, "You are")
    .replace(/\bthis person is\b/g, "you are")
    .replace(/\bThe person is\b/g, "You are")
    .replace(/\bthe person is\b/g, "you are")
    .replace(/\bThis person was\b/g, "You were")
    .replace(/\bthis person was\b/g, "you were")
    .replace(/\bThe person was\b/g, "You were")
    .replace(/\bthe person was\b/g, "you were")
    .replace(/\bThis person has\b/g, "You have")
    .replace(/\bthis person has\b/g, "you have")
    .replace(/\bThe person has\b/g, "You have")
    .replace(/\bthe person has\b/g, "you have")
    .replace(/\bThis person does\b/g, "You do")
    .replace(/\bthis person does\b/g, "you do")
    .replace(/\bThe person does\b/g, "You do")
    .replace(/\bthe person does\b/g, "you do")
    .replace(/\bThis person needs\b/g, "You need")
    .replace(/\bthis person needs\b/g, "you need")
    .replace(/\bThe person needs\b/g, "You need")
    .replace(/\bthe person needs\b/g, "you need")
    .replace(/\bThe user is\b/g, "You are")
    .replace(/\bthe user is\b/g, "you are")
    .replace(/\bThe user was\b/g, "You were")
    .replace(/\bthe user was\b/g, "you were")
    .replace(/\bThe user has\b/g, "You have")
    .replace(/\bthe user has\b/g, "you have")
    .replace(/\bThe user does\b/g, "You do")
    .replace(/\bthe user does\b/g, "you do")
    .replace(/\bThe user needs\b/g, "You need")
    .replace(/\bthe user needs\b/g, "you need")
    .replace(/\bThis person's\b/g, "Your")
    .replace(/\bthis person's\b/g, "your")
    .replace(/\bThe person's\b/g, "Your")
    .replace(/\bthe person's\b/g, "your")
    .replace(/\bThis person’s\b/g, "Your")
    .replace(/\bthis person’s\b/g, "your")
    .replace(/\bThe person’s\b/g, "Your")
    .replace(/\bthe person’s\b/g, "your")
    .replace(/\bThe user's\b/g, "Your")
    .replace(/\bthe user's\b/g, "your")
    .replace(/\bThe user’s\b/g, "Your")
    .replace(/\bthe user’s\b/g, "your")
    .replace(/\bThis user's\b/g, "Your")
    .replace(/\bthis user's\b/g, "your")
    .replace(/\bThis user’s\b/g, "Your")
    .replace(/\bthis user’s\b/g, "your")
    .replace(/\bThe user\b/g, "You")
    .replace(/\bthe user\b/g, "you")
    .replace(/\bThis user\b/g, "You")
    .replace(/\bthis user\b/g, "you")
    .replace(/\bThis person\b/g, "You")
    .replace(/\bthis person\b/g, "you")
    .replace(/\bThe person\b/g, "You")
    .replace(/\bthe person\b/g, "you");

  if (referencedUser) {
    text = text
      .replace(/(^|[.!?]\s+)They\b/g, "$1You")
      .replace(/(^|[.!?]\s+)they\b/g, "$1you")
      .replace(/\bTheir\b/g, "Your")
      .replace(/\btheir\b/g, "your");
  }

  return text;
}

export function directAddressList(values: string[]): string[] {
  return values.map(directAddressText);
}

export function directAddressWorkflow(workflow: Workflow): Workflow {
  return {
    ...workflow,
    description: directAddressText(workflow.description),
    stepsObserved: directAddressList(workflow.stepsObserved),
    automationIdea: directAddressText(workflow.automationIdea),
  };
}

export function directAddressUnderstanding(update: UnderstandingUpdate): UnderstandingUpdate {
  return {
    ...update,
    currentIntent: directAddressText(update.currentIntent),
    batchSummary: directAddressText(update.batchSummary),
    evidence: directAddressList(update.evidence),
    alternatives: update.alternatives.map((alternative) => ({
      ...alternative,
      hypothesis: directAddressText(alternative.hypothesis),
    })),
    suggestedNextAction: directAddressText(update.suggestedNextAction),
    discoveredWorkflows: update.discoveredWorkflows.map(directAddressWorkflow),
    hypothesisMarkdown: directAddressText(update.hypothesisMarkdown),
    workflowsMarkdown: directAddressText(update.workflowsMarkdown),
  };
}

export function directAddressReportContent(report: ReportContent): ReportContent {
  return {
    ...report,
    objective: directAddressText(report.objective),
    focusAreas: directAddressList(report.focusAreas),
    timelineMarkdown: directAddressText(report.timelineMarkdown),
    significantScreenshots: report.significantScreenshots.map((screenshot) => ({
      ...screenshot,
      caption: directAddressText(screenshot.caption),
    })),
    interpretations: directAddressText(report.interpretations),
    workflows: report.workflows.map(directAddressWorkflow),
    nextSteps: directAddressList(report.nextSteps),
    narrative: directAddressText(report.narrative),
  };
}

export function directAddressReport(report: Report): Report {
  return {
    ...report,
    objective: directAddressText(report.objective),
    focusAreas: directAddressList(report.focusAreas),
    timelineMarkdown: directAddressText(report.timelineMarkdown),
    significantScreenshots: report.significantScreenshots.map((screenshot) => ({
      ...screenshot,
      caption: directAddressText(screenshot.caption),
    })),
    interpretations: directAddressText(report.interpretations),
    workflows: report.workflows.map(directAddressWorkflow),
    nextSteps: directAddressList(report.nextSteps),
    narrative: directAddressText(report.narrative),
  };
}
