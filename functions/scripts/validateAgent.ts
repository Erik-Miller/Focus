/**
 * Validates the deepagents + Gemini 3.5 Flash integration end-to-end:
 * structured monitoring output, image input, usage metadata, chat, report.
 *
 * Run: GEMINI_API_KEY=... pnpm --filter @focus/functions run validate
 */
import { runMonitoring, runChat, runReport } from "../src/agent/runAgent.js";
import { solidPngDataUrl } from "../src/util/png.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Set GEMINI_API_KEY to validate.");
  process.exit(1);
}

const crop = solidPngDataUrl(250, 250, [40, 44, 52]);
const full = solidPngDataUrl(320, 200, [30, 30, 30]);

async function main() {
  console.log("== Monitoring ==");
  const mon = await runMonitoring({
    apiKey: apiKey!,
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
    apiKey: apiKey!,
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
    apiKey: apiKey!,
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
