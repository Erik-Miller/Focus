import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCredentialStore, providerName } from "./credentialStore.js";
let directory: string;
let available: boolean;
const encryption = {
  isEncryptionAvailable: () => available,
  encryptString: (value: string) => Buffer.from([...value].reverse().join("")),
  decryptString: (value: Buffer) => [...value.toString()].reverse().join(""),
};
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "focus-keys-test-"));
  available = true;
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
describe("local credentials", () => {
  it("keeps provider keys separate, encrypted, and persistent", () => {
    const filename = path.join(directory, "keys.json");
    const store = createCredentialStore(() => filename, encryption);
    const key = "sk-test-openai-1234567890";
    store.save("openai", ` ${key} `);
    store.save("anthropic", "sk-ant-test-1234567890123");
    expect(fs.readFileSync(filename, "utf8")).not.toContain(key);
    expect(store.status("openai")).toMatchObject({ configured: true, encryptionAvailable: true });
    expect(store.status("openai")).not.toHaveProperty("apiKey");
    expect(createCredentialStore(() => filename, encryption).read("openai")).toBe(key);
    store.clear("openai");
    expect(store.read("openai")).toBeUndefined();
    expect(store.read("anthropic")).toBe("sk-ant-test-1234567890123");
  });
  it("refuses plaintext fallback and corrupt-file overwrites", () => {
    const filename = path.join(directory, "keys.json");
    const store = createCredentialStore(() => filename, encryption);
    available = false;
    expect(() => store.save("openai", "sk-test-openai-1234567890")).toThrow("Secure");
    expect(fs.existsSync(filename)).toBe(false);
    available = true;
    fs.writeFileSync(filename, "invalid");
    expect(() => store.save("openai", "sk-test-openai-1234567890")).toThrow("Could not read");
    expect(fs.readFileSync(filename, "utf8")).toBe("invalid");
    expect(() => providerName("other")).toThrow("Unsupported");
  });
});

it("marks an undecryptable key and explains how to recover without erasing it", () => {
  const filename = path.join(directory, "keys.json");
  const store = createCredentialStore(() => filename, encryption);
  store.save("anthropic", "sk-ant-test-1234567890123");
  const lockedStore = createCredentialStore(() => filename, {
    ...encryption,
    decryptString: () => {
      throw new Error("ciphertext failure");
    },
  });
  expect(lockedStore.status("anthropic")).toMatchObject({ configured: true, needsReentry: true });
  expect(() => lockedStore.read("anthropic")).toThrow("Re-enter it in Settings");
  expect(store.read("anthropic")).toBe("sk-ant-test-1234567890123");
});
