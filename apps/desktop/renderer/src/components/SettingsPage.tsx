import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import {
  AGENT_MODEL_OPTIONS,
  agentModelOption,
  isAgentModelId,
  type AgentModelId,
  type AgentModelProvider,
} from "@focus/shared";
import type { ApiKeyStatus } from "@/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SecondaryPage } from "./SecondaryPage";

interface SettingsPageProps {
  keyStatuses: Partial<Record<AgentModelProvider, ApiKeyStatus>>;
  agentModel: AgentModelId;
  onBack: () => void;
  onAgentModelChange: (modelId: AgentModelId) => void;
  onRefreshKeys: () => Promise<void>;
  onSaveKey: (provider: AgentModelProvider, key: string) => Promise<void>;
  onClearKey: (provider: AgentModelProvider) => Promise<void>;
}
type Notice = { kind: "success" | "error"; text: string } | null;
export function SettingsPage({
  keyStatuses,
  agentModel,
  onBack,
  onAgentModelChange,
  onRefreshKeys,
  onSaveKey,
  onClearKey,
}: SettingsPageProps) {
  const selectedModel = agentModelOption(agentModel);
  useEffect(() => {
    void onRefreshKeys().catch(console.error);
  }, [onRefreshKeys]);
  return (
    <SecondaryPage
      title="Settings"
      className="settings-page"
      contentClassName="settings-page-content"
      onBack={onBack}
    >
      <section className="settings-section" aria-label="AI model">
        <div className="settings-section-heading">
          <h2>AI model</h2>
          <p>Choose the model for monitoring, chat, and reports.</p>
        </div>
        <div className="settings-card">
          <label className="settings-row settings-model-field">
            <span>Model</span>
            <select
              value={agentModel}
              aria-label="AI model"
              onChange={(event) => {
                if (isAgentModelId(event.target.value)) onAgentModelChange(event.target.value);
              }}
            >
              {AGENT_MODEL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="settings-help">{selectedModel.description}. Supports screenshots.</p>
      </section>
      <details className="settings-api-keys" open>
        <summary>
          <ChevronDown aria-hidden /> API Keys
        </summary>
        <div className="settings-provider-list">
          {(["openai", "anthropic", "gemini"] as const).map((provider) => (
            <ApiKeySection
              key={provider}
              provider={provider}
              status={keyStatuses[provider]}
              onSave={onSaveKey}
              onClear={onClearKey}
            />
          ))}
        </div>
      </details>
      <p className="settings-privacy">
        History stays on this Mac. AI requests send relevant context and screenshots directly to
        your selected provider.
      </p>
    </SecondaryPage>
  );
}
function ApiKeySection({
  provider,
  status,
  onSave,
  onClear,
}: {
  provider: AgentModelProvider;
  status?: ApiKeyStatus;
  onSave: SettingsPageProps["onSaveKey"];
  onClear: SettingsPageProps["onClearKey"];
}) {
  const label = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini" }[provider];
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const configured = Boolean(status?.configured);
  const encryptionAvailable = status?.encryptionAvailable === true;
  const canSave = encryptionAvailable && apiKey.trim().length > 0 && !busy;
  const savedAtLabel = useMemo(() => {
    if (!status?.savedAt) return null;
    return new Date(status.savedAt).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [status?.savedAt]);

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setNotice(null);
    try {
      await onSave(provider, apiKey);
      setApiKey("");
      setNotice({ kind: "success", text: "Key saved locally" });
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function clearKey() {
    setBusy(true);
    setNotice(null);
    try {
      await onClear(provider);
      setApiKey("");
      setNotice({ kind: "success", text: "Key cleared" });
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section" aria-label={`${label} API key`}>
      <div className="settings-section-heading">
        <h2>{label} API Key</h2>
        <p>
          Use your {label} API key with {provider === "anthropic" ? "Claude" : label} models. Usage
          is billed to your provider account.
        </p>
      </div>
      <form className="settings-card" onSubmit={saveKey}>
        <div className="settings-row settings-key-field">
          <label htmlFor={`api-key-${provider}`}>API Key</label>
          <Input
            id={`api-key-${provider}`}
            type="password"
            value={apiKey}
            autoComplete="off"
            spellCheck={false}
            placeholder={configured ? "Replace saved key" : "Enter API key"}
            aria-label={`${label} API key`}
            disabled={!encryptionAvailable || busy}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </div>
        <div className="settings-row">
          <div className="settings-key-status">
            <span>Secure storage</span>
            <span className="settings-status-detail">
              {status?.needsReentry
                ? "Re-enter this key to use it"
                : configured
                  ? "Secret saved"
                  : "No key saved"}
            </span>
          </div>
          <div className="settings-row-actions">
            <Button type="submit" variant="secondary" size="sm" disabled={!canSave}>
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!configured || busy}
              onClick={clearKey}
            >
              Clear
            </Button>
          </div>
        </div>
      </form>
      {configured && savedAtLabel && (
        <p className="settings-help">Saved on this device {savedAtLabel}.</p>
      )}
      {!encryptionAvailable && (
        <div className="settings-notice is-error">Secure storage unavailable</div>
      )}
      {status?.needsReentry && (
        <div className="settings-notice is-error" role="status">
          This saved key cannot be unlocked. Enter it again and save.
        </div>
      )}
      {notice && (
        <div className={`settings-notice is-${notice.kind}`} role="status">
          {notice.text}
        </div>
      )}
    </section>
  );
}
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Key update failed";
}
