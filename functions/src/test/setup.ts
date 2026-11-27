import { afterEach, vi } from "vitest";
process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";
afterEach(() => {
  vi.restoreAllMocks();
});
