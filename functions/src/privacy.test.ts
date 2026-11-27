import { afterEach, expect, it, vi } from "vitest";
import { CallbackManager } from "@langchain/core/callbacks/manager";
import { disableHostedTelemetry } from "./privacy.js";

afterEach(() => vi.unstubAllEnvs());

it("disables inherited tracing and removes credentials before LangChain configures callbacks", async () => {
  for (const name of [
    "LANGSMITH_TRACING",
    "LANGSMITH_TRACING_V2",
    "LANGCHAIN_TRACING",
    "LANGCHAIN_TRACING_V2",
    "LANGSMITH_OTEL_ENABLED",
    "LANGSMITH_API_KEY",
    "LANGCHAIN_API_KEY",
    "LANGSMITH_PROJECT",
    "LANGCHAIN_PROJECT",
    "LANGSMITH_ENDPOINT",
    "LANGCHAIN_ENDPOINT",
  ])
    vi.stubEnv(name, "true");
  vi.stubEnv("OTEL_SDK_DISABLED", "false");
  disableHostedTelemetry();
  expect(process.env.LANGSMITH_TRACING).toBe("false");
  expect(process.env.LANGSMITH_TRACING_V2).toBe("false");
  expect(process.env.LANGCHAIN_TRACING_V2).toBe("false");
  expect(process.env.LANGCHAIN_TRACING).toBeUndefined();
  expect(process.env.LANGSMITH_API_KEY).toBeUndefined();
  expect(process.env.LANGCHAIN_API_KEY).toBeUndefined();
  expect(process.env.LANGSMITH_ENDPOINT).toBeUndefined();
  expect(process.env.LANGSMITH_OTEL_ENABLED).toBeUndefined();
  expect(process.env.OTEL_SDK_DISABLED).toBe("true");
  const manager = await CallbackManager.configure([]);
  expect(manager?.handlers ?? []).toEqual([]);
});
