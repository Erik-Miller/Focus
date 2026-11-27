import { z } from "zod";

export const workflowSchema = z.object({
  name: z.string().describe("Short, human-readable name for the repeatable workflow."),
  description: z
    .string()
    .describe("One concise second-person sentence describing what you repeat."),
  stepsObserved: z.array(z.string()).describe("Short concrete steps observed, in order."),
  frequency: z
    .string()
    .describe("How often this appeared (e.g. 'once', 'repeated several times')."),
  automatable: z
    .boolean()
    .describe(
      "Whether a concrete local script, check, command, or integration could reduce this repeated effort.",
    ),
  automationIdea: z
    .string()
    .describe("If automatable, one specific implementation-oriented idea; otherwise empty."),
  evidenceObsIds: z.array(z.string()).describe("Observation ids that support this workflow."),
});

export const savedWorkflowLaunchTargetSchema = z.enum(["desktop", "terminal", "codex"]);

export const saveWorkflowForLaterInputSchema = z.object({
  workflow: workflowSchema,
  prompt: z.string().min(1),
  sourceSessionId: z.string().min(1),
  sourceReportId: z.string().min(1).nullish(),
  sourceTitle: z.string().min(1),
});

export const savedWorkflowSchema = saveWorkflowForLaterInputSchema.extend({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastLaunchedAt: z.number().optional(),
  lastLaunchTarget: savedWorkflowLaunchTargetSchema.optional(),
});

export type SaveWorkflowForLaterInput = z.infer<typeof saveWorkflowForLaterInputSchema>;
export type SavedWorkflowRecord = z.infer<typeof savedWorkflowSchema>;

export const alternativeHypothesisSchema = z.object({
  hypothesis: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * Structured result the monitoring agent must produce for each batch of dwell
 * observations. This is the agent's updated understanding of the session.
 */
export const understandingUpdateSchema = z.object({
  currentIntent: z
    .string()
    .describe("Single best hypothesis of what you are currently working on."),
  confidence: z.number().min(0).max(1).describe("Confidence (0-1) in the current intent."),
  batchSummary: z
    .string()
    .describe("One brief second-person sentence summarizing what this batch added or confirmed."),
  evidence: z
    .array(z.string())
    .describe("Up to 3 short evidence bullets supporting the current intent."),
  alternatives: z
    .array(alternativeHypothesisSchema)
    .describe("Up to 2 plausible alternative hypotheses with confidence."),
  suggestedNextAction: z
    .string()
    .describe("One short next action that does not repeat the automationIdea fields."),
  activeApps: z.array(z.string()).describe("Distinct applications seen so far this session."),
  discoveredWorkflows: z
    .array(workflowSchema)
    .describe(
      "Repeatable workflows discovered so far, with concrete automation candidates when warranted.",
    ),
  hypothesisMarkdown: z
    .string()
    .describe(
      "Compact /hypothesis.md contents: current intent plus at most 3 bullets, no repeated evidence/workflow sections.",
    ),
  workflowsMarkdown: z
    .string()
    .describe("Compact /workflows.md index of workflows and automation ideas."),
});

export type UnderstandingUpdate = z.infer<typeof understandingUpdateSchema>;

export const significantScreenshotSchema = z.object({
  obsId: z.string(),
  caption: z.string(),
});

export const reportContentSchema = z.object({
  objective: z.string().describe("Your overall objective for the session."),
  focusAreas: z
    .array(z.string())
    .describe("Compact focus tags: 2-5 word noun phrases, no leading gerunds or trailing periods."),
  timelineMarkdown: z
    .string()
    .describe(
      "A markdown timeline of activity across the session using the local times shown in the observed moments digest.",
    ),
  significantScreenshots: z
    .array(significantScreenshotSchema)
    .describe("The most telling observations, by id, with a caption each."),
  interpretations: z
    .string()
    .describe("Markdown: the agent's interpretation of why things happened."),
  workflows: z
    .array(workflowSchema)
    .describe("Workflows observed and which are good automation candidates."),
  nextSteps: z.array(z.string()).describe("Suggested next steps for you."),
  narrative: z
    .string()
    .describe("A polished, second-person work-journal style narrative of the whole session."),
});

export type ReportContent = z.infer<typeof reportContentSchema>;
