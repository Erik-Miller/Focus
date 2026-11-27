/**
 * Validates the deepagents + model provider integration end-to-end:
 * structured monitoring output, image input, usage metadata, chat, report.
 *
 * Run:
 *   GEMINI_API_KEY=... pnpm --filter @focus/local-service run validate
 *   or
 *   ANTHROPIC_API_KEY=... FOCUS_AGENT_PROVIDER=anthropic pnpm --filter @focus/local-service run validate
 */
import { runMonitoring, runChat, runReport } from "../src/agent/runAgent.js";
import { DEFAULT_MODEL_BY_PROVIDER, type AgentModelProvider } from "../src/agent/model.js";
import { solidPngDataUrl } from "../src/util/png.js";

const provider = cleanProvider(process.env.FOCUS_AGENT_PROVIDER) ?? "gemini";
const apiKey =
  process.env[`${provider.toUpperCase()}_API_KEY`];
if (!apiKey) {
  console.error(
    `Set ${provider.toUpperCase()}_API_KEY to validate.`,
  );
  process.exit(1);
}
const modelConfig = {
  provider,
  model: process.env.FOCUS_AGENT_MODEL || DEFAULT_MODEL_BY_PROVIDER[provider],
  apiKey,
};

const crop = solidPngDataUrl(250, 250, [40, 44, 52]);
const full = solidPngDataUrl(320, 200, [30, 30, 30]);

async function main() {
  console.log("== Monitoring ==");
  const mon = await runMonitoring({
    modelConfig,
    priorHypothesis: "",
    priorWorkflows: "",
    currentIntent: "",
    activeApps: [],
    observations: [
      {
        obsId: "obs1",
        app: "Visual Studio Code",
        windowTitle: "runAgent.ts — focus",
        dwellMs: 1200,
        novelty: "high",
        timestamp: Date.now(),
        cursorCropDataUrl: crop,
        fullScreenshotDataUrl: full,
      },
      {
        obsId: "obs2",
        app: "Google Chrome",
        windowTitle: "deepagents docs - LangChain",
        dwellMs: 800,
        novelty: "medium",
        timestamp: Date.now(),
        cursorCropDataUrl: crop,
      },
    ],
  });
  console.log("intent:", mon.update.currentIntent);
  console.log("confidence:", mon.update.confidence);
  console.log("workflows:", mon.update.discoveredWorkflows.length);
  console.log("usage:", mon.usage);

  console.log("\n== Chat ==");
  const chat = await runChat({
    modelConfig,
    hypothesis: mon.update.hypothesisMarkdown,
    workflows: mon.update.workflowsMarkdown,
    observationsDigest: "obs1 VS Code editing runAgent.ts; obs2 Chrome reading deepagents docs",
    history: [],
    message: "What workflows did you notice and which should I automate later?",
  });
  console.log("answer:", chat.answer.slice(0, 400));
  console.log("usage:", chat.usage);

  console.log("\n== Report ==");
  const report = await runReport({
    modelConfig,
    hypothesis: mon.update.hypothesisMarkdown,
    workflows: mon.update.workflowsMarkdown,
    observationsDigest: "obs1 VS Code editing runAgent.ts; obs2 Chrome reading deepagents docs",
  });
  console.log("objective:", report.report.objective);
  console.log("focusAreas:", report.report.focusAreas);
  console.log("usage:", report.usage);

  console.log("\nVALIDATION OK");
}

main().catch((err) => {
  console.error("VALIDATION FAILED:", err);
  process.exit(1);
});

function cleanProvider(value: string | undefined): AgentModelProvider | null {
  return value === "gemini" || value === "anthropic" || value === "openai" ? value : null;
}
