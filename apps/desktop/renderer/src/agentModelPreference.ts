import { DEFAULT_AGENT_MODEL_ID, migrateAgentModelId, type AgentModelId } from "@focus/shared";

export const AGENT_MODEL_STORAGE_KEY = "focus.agentModel";

export function readAgentModelPreference(storage: Pick<Storage, "getItem">): AgentModelId {
  const stored = storage.getItem(AGENT_MODEL_STORAGE_KEY);
  return migrateAgentModelId(stored) ?? DEFAULT_AGENT_MODEL_ID;
}

export function writeAgentModelPreference(
  storage: Pick<Storage, "setItem">,
  modelId: AgentModelId,
): void {
  storage.setItem(AGENT_MODEL_STORAGE_KEY, modelId);
}
