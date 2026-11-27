/** Focus never opts in to hosted tracing, including in production builds. */
export function disableHostedTelemetry(): void {
  // Remove inherited project names, endpoints, keys, and legacy opt-in flags.
  // A legacy tracing flag treats any nonempty string (even "false") as truthy.
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("LANGSMITH_") || name.startsWith("LANGCHAIN_")) {
      delete process.env[name];
    }
  }
  process.env.LANGSMITH_TRACING = "false";
  process.env.LANGSMITH_TRACING_V2 = "false";
  process.env.LANGCHAIN_TRACING_V2 = "false";
  process.env.OTEL_SDK_DISABLED = "true";
}

// Run before importing the agent service, as well as before each model call.
disableHostedTelemetry();
