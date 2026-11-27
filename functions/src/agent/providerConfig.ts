import {
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_MODEL_PROVIDER,
  type AgentModelProvider,
} from "./model.js";
export interface AgentModelSelection {
  provider: AgentModelProvider;
  model: string;
}
export async function resolveAgentModelSelection(): Promise<AgentModelSelection> {
  return {
    provider: DEFAULT_MODEL_PROVIDER,
    model: DEFAULT_MODEL_BY_PROVIDER[DEFAULT_MODEL_PROVIDER],
  };
}
