export type AgentModelProvider = "gemini" | "anthropic" | "openai";

export interface AgentModelOption {
  id: string;
  label: string;
  provider: AgentModelProvider;
  description: string;
  supportsImages: true;
}

// Vision-capable chat models, verified against provider docs on 2026-11-26.
// OpenAI: https://developers.openai.com/api/docs/models/gpt-6.2-sol
// OpenAI: https://developers.openai.com/api/docs/models/gpt-5.4-mini
// Anthropic: https://platform.claude.com/docs/en/build-with-claude/vision
// Google: https://aistudio.google.com/docs/models/gemini-3.6-flash
export const AGENT_MODEL_OPTIONS = [
  {
    id: "gpt-6.2-sol",
    label: "OpenAI GPT-6.2 Sol",
    provider: "openai",
    description: "Balanced reasoning, tools, and screenshot understanding",
    supportsImages: true,
  },
  {
    id: "gpt-5.4-mini",
    label: "OpenAI GPT-5.4 mini",
    provider: "openai",
    description: "Reasoning and visual understanding",
    supportsImages: true,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    description: "Balanced reasoning and visual understanding",
    supportsImages: true,
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    provider: "gemini",
    description: "Fast multimodal analysis",
    supportsImages: true,
  },
] as const satisfies readonly AgentModelOption[];

export type AgentModelId = (typeof AGENT_MODEL_OPTIONS)[number]["id"];

export const DEFAULT_AGENT_MODEL_ID: AgentModelId = "claude-sonnet-4-6";

export function isAgentModelId(value: unknown): value is AgentModelId {
  return AGENT_MODEL_OPTIONS.some((option) => option.id === value);
}

export function agentModelOption(modelId: AgentModelId): (typeof AGENT_MODEL_OPTIONS)[number] {
  return (
    AGENT_MODEL_OPTIONS.find((option) => option.id === modelId) ??
    AGENT_MODEL_OPTIONS.find((option) => option.id === DEFAULT_AGENT_MODEL_ID)!
  );
}

export const DEFAULT_AGENT_MODEL_BY_PROVIDER: Record<AgentModelProvider, AgentModelId> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-3.6-flash",
};
export function migrateAgentModelId(value: unknown): AgentModelId | undefined {
  if (isAgentModelId(value)) return value;
  if (value === "gpt-4.1") return DEFAULT_AGENT_MODEL_BY_PROVIDER.openai;
  if (value === "claude-sonnet-4-5-20250929") return DEFAULT_AGENT_MODEL_BY_PROVIDER.anthropic;
  if (value === "gemini-3.5-flash") return DEFAULT_AGENT_MODEL_BY_PROVIDER.gemini;
  return undefined;
}
