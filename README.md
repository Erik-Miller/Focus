# Focus

**An agent that watches your attention and explains your work.**

Focus is a Deep Agent–powered "smart sensor." During a real work session it observes brief
_moments of attention_ — points where your cursor pauses — captures the context (a full‑screen
frame, a 250×250 crop around the cursor, the active app, and the window title), and a
**Deep Agent (LangChain `deepagents` + Gemini 3.5 Flash)** gradually builds an evolving hypothesis
of what you're working on. When you stop, you can **chat with the agent** about the workflows it
noticed and which would be good to automate later, and generate a narrative **session report**.

This is an _understanding-first_ tool: the mouse is a sensor, the Deep Agent is the reasoning layer,
and the report/chat are the artifacts. It deliberately does **not** take actions.

## Architecture

```
Electron (macOS)                Firebase                         Gemini
  dwell detector  ──dwell──▶  processObservations ─┐
  full + 250² crop            chatWithAgent        ├─▶ Deep Agent (deepagents)
  active-win (osascript)      generateReport       │     gemini-3.5-flash
  dHash novelty filter        seedDemoSession      └─▶ structured output + usage
        │                          │  ▲
        └── React UI ◀── Firestore onSnapshot (live awareness, timeline, chat, usage)
```

- **Electron** captures dwell moments locally and tags novelty with a perceptual hash before
  anything leaves the machine.
- **Cloud Functions** run the agent server‑side so the Gemini key is never in the client.
- **Firestore** stores sessions/observations/chat/reports and streams live updates to the UI.
- **Two‑speed loop:** monitoring is throttled + batched (medium thinking); chat is unthrottled
  (medium); the report uses high thinking. See `packages/shared/src/monitoringConfig.ts`.

## Repo layout

| Path              | What                                                           |
| ----------------- | -------------------------------------------------------------- |
| `packages/shared` | Types, Zod schemas, monitoring config (shared by all packages) |
| `functions`       | Cloud Functions + the Deep Agent (`functions/src/agent`)       |
| `apps/web`        | React UI (Vite) used as the Electron renderer                  |
| `apps/desktop`    | Electron shell (native capture) that loads the renderer        |
| `demo`            | (bundled in `functions/src/demo`) sample dataset for Demo Mode |

## Prerequisites

- Node 20+ (22 recommended), `pnpm`, the Firebase CLI (`npx firebase-tools`).
- A Firebase project on the **Blaze** plan (Cloud Functions + Secret Manager require it).
- A **Gemini API key** and (optional) a **LangSmith API key** for tracing.

## Setup

```bash
pnpm install

# Secrets (stored in Secret Manager, never in the client)
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set LANGSMITH_API_KEY   # optional, enables tracing

# Build everything
pnpm build
```

## Run the renderer locally

```bash
pnpm dev:web        # http://localhost:5173
```

## Run the desktop capture app (macOS)

```bash
pnpm dev:desktop
```

Grant **Screen Recording** and **Accessibility** to Electron in
_System Settings → Privacy & Security_ the first time (the cursor‑region screenshots and the active
window title need them). Then press **Start Focus**, work for a bit, and press **Stop Focus** to chat
and generate a report.

## Deploy

```bash
pnpm run deploy          # functions + firestore rules + storage rules
pnpm run deploy:functions
```

## Validate the agent integration

```bash
GEMINI_API_KEY=... pnpm --filter @focus/functions run validate
```

## Notes

- Model: `gemini-3.5-flash` with `thinkingLevel` per role; token usage (including thinking tokens)
  is tracked per call and aggregated per session, shown live in the UI.
- See [`DESIGN.md`](DESIGN.md) for the design rationale and tradeoffs.
- License: MIT.
