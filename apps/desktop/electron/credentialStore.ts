import fs from "node:fs";
import type { AgentModelProvider } from "@focus/shared";
export interface ApiKeyStatus {
  needsReentry?: boolean;
  configured: boolean;
  encryptionAvailable: boolean;
  savedAt?: number;
}
interface Encryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
type Store = Partial<Record<`${AgentModelProvider}ApiKeyEncrypted`, string>> &
  Partial<Record<`${AgentModelProvider}ApiKeySavedAt`, number>>;
export function providerName(value: unknown): AgentModelProvider {
  if (value !== "openai" && value !== "anthropic" && value !== "gemini")
    throw new Error("Unsupported provider");
  return value;
}
export function createCredentialStore(filename: () => string, encryption: Encryption) {
  function load(): Store {
    try {
      const parsed = JSON.parse(fs.readFileSync(filename(), "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Invalid credentials file");
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new Error(
        "Could not read saved credentials. Restore the credentials file before saving another key.",
      );
    }
  }
  function write(store: Store) {
    const temp = `${filename()}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(store)}\n`, { mode: 0o600 });
    fs.renameSync(temp, filename());
  }
  function requireEncryption() {
    if (!encryption.isEncryptionAvailable()) throw new Error("Secure key storage unavailable.");
  }
  function status(provider: AgentModelProvider): ApiKeyStatus {
    const store = load();
    let needsReentry = false;
    const encrypted = store[`${provider}ApiKeyEncrypted`];
    if (encrypted && encryption.isEncryptionAvailable()) {
      try {
        encryption.decryptString(Buffer.from(encrypted, "base64"));
      } catch {
        needsReentry = true;
      }
    }
    return {
      needsReentry,
      configured: Boolean(store[`${provider}ApiKeyEncrypted`]),
      encryptionAvailable: encryption.isEncryptionAvailable(),
      savedAt: store[`${provider}ApiKeySavedAt`],
    };
  }
  return {
    status,
    save(provider: AgentModelProvider, value: unknown): ApiKeyStatus {
      requireEncryption();
      const key = typeof value === "string" ? value.trim() : "";
      if (key.length < 20 || key.length > 4096 || /\s/.test(key))
        throw new Error("Enter a valid API key.");
      const store = load();
      store[`${provider}ApiKeyEncrypted`] = encryption.encryptString(key).toString("base64");
      store[`${provider}ApiKeySavedAt`] = Date.now();
      write(store);
      return status(provider);
    },
    read(provider: AgentModelProvider): string | undefined {
      const encrypted = load()[`${provider}ApiKeyEncrypted`];
      if (!encrypted) return undefined;
      requireEncryption();
      try {
        return encryption.decryptString(Buffer.from(encrypted, "base64"));
      } catch {
        throw new Error(
          `Your saved ${provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Anthropic" : "Gemini"} key cannot be unlocked. Re-enter it in Settings and save.`,
        );
      }
    },
    clear(provider: AgentModelProvider): ApiKeyStatus {
      const store = load();
      delete store[`${provider}ApiKeyEncrypted`];
      delete store[`${provider}ApiKeySavedAt`];
      write(store);
      return status(provider);
    },
  };
}
