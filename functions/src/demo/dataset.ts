import type { Workflow } from "@focus/shared";

export interface DemoObservation {
  app: string;
  windowTitle: string;
  offsetMs: number;
  dwellMs: number;
  novelty: "low" | "medium" | "high";
  summary: string;
  inferredIntent: string;
  evidence: string[];
  /** placeholder screenshot color [r,g,b] */
  color: [number, number, number];
}

export interface DemoDataset {
  title: string;
  currentIntent: string;
  confidence: number;
  activeApps: string[];
  hypothesisMarkdown: string;
  workflowsMarkdown: string;
  discoveredWorkflows: Workflow[];
  observations: DemoObservation[];
  welcomeMessage: string;
}

const VSCODE: [number, number, number] = [37, 42, 54];
const CHROME: [number, number, number] = [222, 226, 230];
const TERMINAL: [number, number, number] = [18, 18, 18];
const SLACK: [number, number, number] = [74, 21, 75];

export const DEMO_DATASET: DemoDataset = {
  title: "Demo: shipping the rate-limit fix",
  currentIntent:
    "Implementing and shipping a rate-limiting fix for the API, verifying it with tests, and preparing the pull request.",
  confidence: 0.86,
  activeApps: ["Visual Studio Code", "Google Chrome", "Terminal", "Slack"],
  hypothesisMarkdown: [
    "# Hypothesis",
    "",
    "The user is implementing a **rate-limiting fix** in an API codebase.",
    "",
    "- Started by reproducing a bug reported in Slack (429s under load).",
    "- Edited `rateLimiter.ts` in VS Code, focusing on the token-bucket refill logic.",
    "- Cross-referenced Redis `INCR`/`EXPIRE` docs in Chrome.",
    "- Ran the test suite in Terminal, iterated on a failing case, then got green.",
    "- Opened a GitHub PR and is writing the description.",
    "",
    "Confidence is high: the editor file, the docs consulted, the test runs, and the PR all point to the same task.",
  ].join("\n"),
  workflowsMarkdown: [
    "# Workflows observed",
    "",
    "1. **Reproduce-from-report**: read a bug report in Slack → reproduce locally. (automatable: auto-open repro scaffold from a linked issue)",
    "2. **Code ↔ docs loop**: edit code in VS Code, jump to Chrome to confirm an API, return. (automatable: inline doc lookup at the cursor)",
    "3. **Test-fix loop**: run tests in Terminal → read failure → edit → rerun. (automatable: auto-rerun affected tests on save)",
    "4. **PR prep**: summarize the diff into a PR description. (automatable: draft PR body from commits + changed files)",
  ].join("\n"),
  discoveredWorkflows: [
    {
      name: "Test-fix loop",
      description: "Run the test suite, read the failure, edit code, and rerun until green.",
      stepsObserved: [
        "Run `pnpm test` in Terminal",
        "Read the failing assertion",
        "Edit rateLimiter.ts in VS Code",
        "Rerun tests",
      ],
      frequency: "repeated 3+ times",
      automatable: true,
      automationIdea:
        "Auto-rerun only the affected tests on file save and surface the first failure.",
      evidenceObsIds: [],
    },
    {
      name: "Code-to-docs cross-reference",
      description: "Pause coding to verify an API in the browser docs, then return to the editor.",
      stepsObserved: [
        "Edit code that calls an external API",
        "Switch to Chrome and search the docs",
        "Return to VS Code and adjust the call",
      ],
      frequency: "several times",
      automatable: true,
      automationIdea: "Surface relevant API docs inline at the cursor for the symbol under focus.",
      evidenceObsIds: [],
    },
    {
      name: "Bug-report to repro",
      description: "Read a bug report in chat and reproduce it locally before fixing.",
      stepsObserved: ["Read Slack report of 429 errors", "Reproduce under load locally"],
      frequency: "once",
      automatable: true,
      automationIdea: "Generate a local reproduction scaffold from a linked issue.",
      evidenceObsIds: [],
    },
  ],
  welcomeMessage:
    "I watched this session and built an understanding of what you were doing. Ask me what you worked on, the workflows I noticed, or which would be good to automate later.",
  observations: [
    {
      app: "Slack",
      windowTitle: '#incidents — "API returning 429s under load"',
      offsetMs: 0,
      dwellMs: 4200,
      novelty: "high",
      summary:
        "Reading an incident report about the API returning 429 rate-limit errors under load.",
      inferredIntent: "Understanding a reported rate-limiting bug.",
      evidence: ["Slack #incidents channel", "Message mentions 429s under load"],
      color: SLACK,
    },
    {
      app: "Visual Studio Code",
      windowTitle: "rateLimiter.ts — api",
      offsetMs: 65_000,
      dwellMs: 5200,
      novelty: "high",
      summary: "Examining the token-bucket refill logic in rateLimiter.ts.",
      inferredIntent: "Locating the source of the rate-limiting bug.",
      evidence: ["File rateLimiter.ts open", "Cursor on refill() function"],
      color: VSCODE,
    },
    {
      app: "Google Chrome",
      windowTitle: "Redis INCR / EXPIRE — Redis Docs",
      offsetMs: 140_000,
      dwellMs: 3800,
      novelty: "medium",
      summary: "Reading Redis docs on INCR and EXPIRE for atomic counters.",
      inferredIntent: "Confirming correct Redis usage for the limiter.",
      evidence: ["Redis documentation page", "INCR/EXPIRE section"],
      color: CHROME,
    },
    {
      app: "Visual Studio Code",
      windowTitle: "rateLimiter.ts — api",
      offsetMs: 200_000,
      dwellMs: 6100,
      novelty: "medium",
      summary: "Editing refill logic to use an atomic Redis pipeline.",
      inferredIntent: "Implementing the fix.",
      evidence: ["Edits around pipeline()", "Adds EXPIRE call"],
      color: VSCODE,
    },
    {
      app: "Terminal",
      windowTitle: "pnpm test — api",
      offsetMs: 280_000,
      dwellMs: 4500,
      novelty: "high",
      summary: "Running the test suite; one rate-limiter test fails.",
      inferredIntent: "Verifying the fix.",
      evidence: ["pnpm test output", "1 failing test in rateLimiter.spec.ts"],
      color: TERMINAL,
    },
    {
      app: "Visual Studio Code",
      windowTitle: "rateLimiter.spec.ts — api",
      offsetMs: 340_000,
      dwellMs: 5000,
      novelty: "medium",
      summary: "Inspecting the failing assertion about burst behavior.",
      inferredIntent: "Fixing the failing test case.",
      evidence: ["Spec file open", "Assertion on burst window"],
      color: VSCODE,
    },
    {
      app: "Terminal",
      windowTitle: "pnpm test — api",
      offsetMs: 410_000,
      dwellMs: 3300,
      novelty: "medium",
      summary: "Tests pass after the edit.",
      inferredIntent: "Confirming green tests.",
      evidence: ["All tests passing", "No failures"],
      color: TERMINAL,
    },
    {
      app: "Google Chrome",
      windowTitle: "Fix rate limiter refill (#482) — GitHub",
      offsetMs: 480_000,
      dwellMs: 5800,
      novelty: "high",
      summary: "Writing the pull request description for the rate-limiter fix.",
      inferredIntent: "Preparing to ship the change.",
      evidence: ["GitHub PR #482", "Editing PR description"],
      color: CHROME,
    },
  ],
};
