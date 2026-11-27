export type SessionStatus = "active" | "stopped" | "reporting" | "error";

export type Novelty = "low" | "medium" | "high";

export type AgentRunKind = "observation" | "chat" | "report";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

/** The agent's virtual filesystem, persisted between invocations. */
export type AgentFiles = Record<string, string>;

export interface AlternativeHypothesis {
  hypothesis: string;
  confidence: number;
}

export interface Workflow {
  name: string;
  description: string;
  stepsObserved: string[];
  frequency: string;
  automatable: boolean;
  automationIdea: string;
  evidenceObsIds: string[];
}

export type SavedWorkflowLaunchTarget = "desktop" | "terminal" | "codex";

export interface SavedWorkflow {
  id: string;
  workflow: Workflow;
  prompt: string;
  sourceSessionId: string;
  sourceReportId?: string;
  sourceTitle: string;
  createdAt: number;
  updatedAt: number;
  lastLaunchedAt?: number;
  lastLaunchTarget?: SavedWorkflowLaunchTarget;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
}

export interface UsageAggregate extends TokenUsage {
  callCount: number;
  byKind: Record<AgentRunKind, TokenUsage & { callCount: number }>;
}

export interface Session {
  id: string;
  ownerUid: string;
  status: SessionStatus;
  isDemo: boolean;
  title?: string;
  startedAt: number;
  endedAt?: number;
  currentIntent: string;
  confidence: number;
  activeApps: string[];
  discoveredWorkflows: Workflow[];
  agentFiles: AgentFiles;
  reportId?: string;
  usage: UsageAggregate;
  lastUpdateAt: number;
  agentActivity?: string;
  agentActivityAt?: number;
  lastError?: string;
  lastErrorAt?: number;
  updateInFlight: boolean;
  /** When the in-flight interpretation lock was claimed; used to reclaim stale locks. */
  updateInFlightAt?: number;
}

export interface Observation {
  id: string;
  sessionId: string;
  batchId: string;
  timestamp: number;
  app: string;
  windowTitle: string;
  mouse: { x: number; y: number };
  dwellMs: number;
  novelty: Novelty;
  frameHash: string;
  fullScreenshotPath?: string;
  cursorCropPath?: string;
  fullScreenshotUrl?: string;
  cursorCropUrl?: string;
  summary: string;
  inferredIntent: string;
  confidence: number;
  evidence: string[];
  alternatives: AlternativeHypothesis[];
  suggestedNextAction: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  createdAt: number;
  usage?: TokenUsage;
  runId?: string;
}

export interface SignificantScreenshot {
  obsId: string;
  caption: string;
  screenshotUrl?: string;
}

export interface Report {
  id: string;
  sessionId: string;
  createdAt: number;
  updatedAt?: number;
  objective: string;
  focusAreas: string[];
  timelineMarkdown: string;
  significantScreenshots: SignificantScreenshot[];
  interpretations: string;
  workflows: Workflow[];
  nextSteps: string[];
  narrative: string;
}

export interface UsageEvent {
  id: string;
  kind: AgentRunKind;
  model: string;
  thinkingLevel: ThinkingLevel;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  latencyMs: number;
  createdAt: number;
}

/** Metadata captured client-side for a single dwell, before the agent sees it. */
export interface DwellInput {
  /** Stable client-generated id used to pair persisted observations with local captures. */
  clientObservationId?: string;
  timestamp: number;
  app: string;
  windowTitle: string;
  mouse: { x: number; y: number };
  dwellMs: number;
  novelty: Novelty;
  frameHash: string;
  /** data URL (jpeg) of the full screen, downscaled and captured on cadence. */
  fullScreenshotDataUrl?: string;
  /** data URL (jpeg) of the 250x250 cursor crop. */
  cursorCropDataUrl?: string;
}
