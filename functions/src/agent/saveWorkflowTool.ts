import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import {
  buildAutomationPrompt,
  directAddressWorkflow,
  workflowSchema,
  type WorkflowContext,
} from "@focus/shared";
import { saveWorkflowForUser } from "../callables/savedWorkflows.js";

export interface SaveWorkflowToolContext {
  uid: string;
  sourceSessionId: string;
  sourceReportId?: string;
  sourceTitle: string;
  promptContext: WorkflowContext;
  latestUserMessage: string;
  validObservationIds: string[];
}

const SAVE_WORKFLOW_TOOL_SCHEMA = workflowSchema.describe(
  "An automatable workflow from this Focus session to save to the Workflow Inbox.",
);

export function createSaveWorkflowTool(
  context: SaveWorkflowToolContext,
): StructuredToolInterface {
  const validObservationIds = new Set(context.validObservationIds);

  return tool(
    async (workflow) => {
      if (!hasExplicitSaveWorkflowIntent(context.latestUserMessage)) {
        return toolResult({
          saved: false,
          reason: "The latest user message did not explicitly ask to save a workflow.",
        });
      }

      const addressedWorkflow = directAddressWorkflow(workflow);
      if (!addressedWorkflow.automatable || !addressedWorkflow.automationIdea.trim()) {
        return toolResult({
          saved: false,
          reason: "Only automatable workflows with a concrete automation idea can be saved.",
        });
      }

      const invalidEvidenceIds = addressedWorkflow.evidenceObsIds.filter(
        (id) => !validObservationIds.has(id),
      );
      if (invalidEvidenceIds.length > 0) {
        return toolResult({
          saved: false,
          reason: `Workflow evidence included unknown observation ids: ${invalidEvidenceIds.join(", ")}.`,
        });
      }

      const prompt = buildAutomationPrompt(addressedWorkflow, context.promptContext);
      const result = await saveWorkflowForUser(context.uid, {
        workflow: addressedWorkflow,
        prompt,
        sourceSessionId: context.sourceSessionId,
        sourceReportId: context.sourceReportId,
        sourceTitle: context.sourceTitle,
      });

      return toolResult({ saved: true, id: result.id });
    },
    {
      name: "save_workflow",
      description:
        "Save an explicitly user-requested, automatable Focus workflow to the user's Workflow Inbox. Only call this after the latest user message asks to save, add, bookmark, or put a workflow in the inbox.",
      schema: SAVE_WORKFLOW_TOOL_SCHEMA,
    },
  );
}

export function hasExplicitSaveWorkflowIntent(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (
    /\b(?:do not|don't|dont|never|no need to)\b.{0,50}\b(?:save|add|bookmark|stash|record|keep|store|put|send)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  if (
    /^\s*(?:should|could|can|would)\s+i\b.*\b(?:save|add|bookmark|stash|record|keep|store|put|send)\b/i.test(
      text,
    )
  ) {
    return false;
  }

  const saveVerb =
    /\b(?:save|add|bookmark|stash|record|keep|store|put|send)\b/i.test(text);
  const saveTarget =
    /\b(?:workflow|automation|candidate|inbox|later|that|this|it|one|these)\b/i.test(text);
  return saveVerb && saveTarget;
}

function toolResult(result: { saved: true; id: string } | { saved: false; reason: string }): string {
  return JSON.stringify(result);
}
