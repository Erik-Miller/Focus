# Focus
<img width="1037" height="718" alt="Screenshot 2026-06-17 at 6 52 54 PM" src="https://github.com/user-attachments/assets/1616485d-bbe8-4019-acab-664ac9137873" />
**An agent that watches your attention, explains your work, and spots what to automate.**

Focus is a quiet observer for your own work. During a real session it watches where your attention
lands on screen, builds a live theory of what you're doing, and afterward tells you: here is what you
worked on, here are the patterns I noticed, and here are the repetitive parts that might be worth
automating.

The key philosophy is _understanding before action_. Focus watches and thinks; it does not click,
type, edit files, or change anything on your computer. When it finds something worth automating, it
packages the workflow into a ready-made prompt you can save to your **Workflow Inbox** or hand off to
Claude Desktop/CLI to build.

Read more about the rationale for the work:
[Focus rationale](https://docs.google.com/document/d/1_J81AX0jKFAsakXlRQGSFJ6o1jm_Qr869qVEz-GmeEs/edit?usp=sharing)

## How it works

1. **It watches attention, not everything.** Focus waits for brief mouse pauses, then captures a
   250×250 crop around the cursor, periodic full-screen context frames, the active app, and the
   window title. A perceptual-hash novelty filter drops near-duplicate frames.
2. **It builds a running theory.** Small batches of observations go to a server-side agent harness
   and model, which maintain living session notes: `/hypothesis.md` for the current best explanation
   and `/workflows.md` for repeated patterns and automation ideas.
3. **It shows its understanding live.** The React UI streams session state from Firestore, including
   the current hypothesis, confidence, evidence, alternatives, timeline, chat, and token usage.
4. **It writes a report when you stop.** After a session, Focus generates a narrative summary with
   the likely objective, a timeline, telling screenshots, noticed workflows, and next steps.
5. **It hands off automation candidates.** Focus can save automatable workflows to the Workflow Inbox
   and launch a prepared prompt in Claude Desktop or Claude CLI. Focus supplies the context; the
   separate agent does the building.

## Architecture

```
Electron (macOS)                Firebase                         Model
  dwell detector  ──dwell──▶  processObservations ─┐
  250² crop + full frame     chatWithAgent        ├─▶ Agent harness
  active-win (osascript)     generateReport       ┘     structured output + usage
  dHash novelty filter             │
        │                          ├── saveWorkflowForLater ──▶ Workflow Inbox
        │                          │
        └── React UI ◀── Firestore onSnapshot (awareness, timeline, chat, reports, inbox)
                │
                └── Claude Desktop/CLI handoff for saved automation prompts
```

- **Electron** captures dwell moments locally and tags novelty with a perceptual hash before
  anything leaves the machine.
- **Cloud Functions** run the agent server‑side so the model key is never in the client.
- **Firestore** stores sessions/observations/chat/reports/saved workflows and streams live updates
  to the UI.
- **Two‑speed loop:** monitoring is throttled + batched (medium thinking); chat is unthrottled
  (medium); the report uses high thinking. See `packages/shared/src/monitoringConfig.ts`.
- **Workflow handoff:** Focus saves automation prompts and opens Claude Desktop/CLI, but the
  automation work happens outside Focus.

## Repo layout

| Path                    | What                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `packages/shared`       | Types, Zod schemas, monitoring config (shared by all packages) |
| `functions`             | Cloud Functions + the agent harness (`functions/src/agent`)    |
| `apps/desktop`          | Electron app, native capture, and the nested React renderer    |
| `apps/desktop/renderer` | Vite renderer loaded by the Electron shell                     |

## Prerequisites

- Node 24, `pnpm`, and Firebase CLI v15+ (`npx firebase-tools`).
- A Firebase project on the **Blaze** plan (Cloud Functions + Secret Manager require it).
- A **model API key** and (optional) tracing credentials.

## Setup

```bash
pnpm install

# Configure required model/tracing secrets in Secret Manager.
# Secret names are defined by the Functions environment.

# Build everything
pnpm build
```

### Agent setup prompt

Use this prompt with Claude, Codex, or another coding agent when starting from a fresh checkout:

```text
You are helping set up the Focus repo on this machine. Work in the current repository.

Please:
1. Inspect README.md, package.json, firebase.json, functions/package.json, and .nvmrc before making
   changes.
2. Ensure Node 24 is active. If a version manager is available, use .nvmrc. If Node 24 is not
   installed, tell me the exact install command for this machine and stop before making unrelated
   changes.
3. Ensure pnpm is available, and ensure Firebase CLI v15+ is available through either the global
   firebase command or npx firebase-tools.
4. Run pnpm install. Allow normal dependency and postinstall binary downloads, including Electron,
   esbuild/tsup, Vite, and Firebase tooling. If a binary download is blocked by network, proxy,
   cache, or permissions, report the failing package, URL or host if visible, and the command that
   failed.
5. Run pnpm build.
6. Do not deploy, do not create or change secrets, and do not print secret values. If local model
   credentials are already configured and I ask for the integration check, run:
   pnpm --filter @focus/functions run validate
   Otherwise skip validation and say credentials are required.
7. If the desktop app needs to be smoke-tested on macOS, run pnpm dev:desktop and remind me to grant
   Screen Recording and Accessibility permissions when prompted.
8. Report the Node, pnpm, and Firebase CLI versions, the commands you ran, whether the build passed,
   and any remaining blockers.

Do not modify application code unless a setup or build failure requires a minimal fix. Explain any
code/config change before making it.
```

## Run the desktop capture app (macOS)

```bash
pnpm dev:desktop
```

Grant **Screen Recording** and **Accessibility** to Electron in
_System Settings → Privacy & Security_ the first time (the cursor‑region screenshots and the active
window title need them). Then press **Start Focus**, work for a bit, and press **Stop Focus** to chat
while the session report generates automatically.

## Demo use case

A simple way to try the whole loop is a short news-browsing session:

1. Press **Start Focus**.
2. Visit 3-5 news sites and browse normally for a few minutes: scan headlines, open articles,
   compare coverage, search, and switch between tabs.
3. Press **Stop Focus** and wait for the session report to generate automatically.
4. Review what Focus thinks you were doing, including any repeated workflows it noticed.
5. If the report or Workflow Inbox includes an automation-ready workflow, click the Claude CLI
   handoff to launch the prepared prompt immediately.

This shows the intended shape of the product: Focus observes and explains the browsing workflow,
then packages any repetitive follow-up work for a separate agent to build.

## Testing

There is not a separate unit-test suite yet. Use the full build as the baseline check; it type-checks
the shared package, builds the Functions bundle, builds the renderer, and builds the Electron shell.

```bash
pnpm build
```

For an end-to-end check of the agent/model integration, export the model API key expected by your
local Functions config, then run:

```bash
pnpm --filter @focus/functions run validate
```

For capture behavior, run the desktop app and do a short manual session to confirm macOS permissions,
dwell capture, live awareness updates, chat, report generation, and Workflow Inbox handoff.

## Deploy

```bash
pnpm run deploy          # functions + firestore rules + storage rules
pnpm run deploy:functions
```

## Notes

- Model calls use per-role thinking settings; token usage (including thinking tokens) is tracked per
  call and aggregated per session, shown live in the UI.
- See [`DESIGN.md`](DESIGN.md) for the design rationale and tradeoffs.
- License: MIT.
