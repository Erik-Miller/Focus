# Focus

**An agent that watches your attention, explains your work, and spots what to automate.**

**Runs on your Mac. Bring your own AI API key. No Focus account, hosted backend, or product tracking.**

Focus is a self-hosted, MIT-licensed desktop project. Sessions and screenshots are stored locally;
AI analysis uses your selected provider directly. The project maintainers receive none of your
session data or API keys.

<img width="830" height="668" alt="Screenshot 2026-06-17 at 6 53 57 PM" src="https://github.com/user-attachments/assets/188c923d-129b-4d66-b4ce-1ccab7f28b46" />

Focus is a quiet observer for your own work. During a real session it watches where your attention
lands on screen, builds a live theory of what you're doing, and afterward tells you: here is what you
worked on, here are the patterns I noticed, and here are the repetitive parts that might be worth
automating.

The key philosophy is _understanding before action_. Focus watches and thinks; it does not click,
type, edit files, or change anything on your computer. When it finds something worth automating, it
packages the workflow into a ready-made prompt you can save to your **Workflow Inbox** or hand off to
Codex, Claude Desktop/CLI to build.

Read more about the rationale for the work:
[Focus rationale](https://docs.google.com/document/d/1_J81AX0jKFAsakXlRQGSFJ6o1jm_Qr869qVEz-GmeEs/edit?usp=sharing)

## How it works

1. **It watches attention, not everything.** Focus waits for brief mouse pauses, then captures a
   250×250 crop around the cursor, periodic full-screen context frames, the active app, and the
   window title. A perceptual-hash novelty filter drops near-duplicate frames.
2. **It builds a running theory.** Small batches of observations go to a local LangChain / Deep Agents harness
   that calls your chosen model provider directly, and maintains living session notes: `/hypothesis.md` for the current best explanation
   and `/workflows.md` for repeated patterns and automation ideas.
3. **It shows its understanding live.** The React UI subscribes to local SQLite updates, including
   the current hypothesis, confidence, evidence, alternatives, timeline, chat, and token usage.
4. **It writes a report when you stop.** After a session, Focus generates a narrative summary with
   the likely objective, a timeline, telling screenshots, noticed workflows, and next steps.
5. **It hands off automation candidates.** Focus can save automatable workflows to the Workflow Inbox
   and launch a prepared prompt in Claude Desktop or Claude CLI. Focus supplies the context; the
   separate agent does the building.

## Run it

### Prerequisites

- macOS, Node 24, and pnpm 11.7.0.
- Your own OpenAI, Anthropic, or Gemini API key for AI features. No Focus account or hosted backend is required.
- Optional for automation handoff: install Codex, Claude Desktop, and/or Claude Code CLI. Focus can save
  prompts to the Workflow Inbox without them, but the handoff buttons need the selected desktop app or
  a `claude` CLI command on PATH to open/send prompts to those platforms.

### Manual setup

```bash
pnpm install

# Build everything
pnpm build
```

### Run the desktop capture app (macOS)

```bash
pnpm dev:desktop
```

Grant **Screen Recording** and **Accessibility** to Electron in
_System Settings → Privacy & Security_ the first time (the cursor‑region screenshots and the active
window title need them). Then press **Start monitoring**, work for a bit, and press **Stop** to chat
while the session report generates automatically.

Open **Settings**, save your **OpenAI**, **Anthropic**, or **Gemini** API key, and select the matching
model before starting a session. OpenAI GPT-6.2 Sol, GPT-5.4 mini, Claude Sonnet 4.6, and Gemini 3.6 Flash support
screenshots. Keys are encrypted with Electron secure storage (macOS Keychain-backed encryption).
Only the main process decrypts the selected provider's key; it is never returned to the renderer.

Session data is stored in `local-data/focus.sqlite` under Electron's user-data directory
(on macOS, normally `~/Library/Application Support/@focus/desktop/`). Screenshots are in
`local-data/screenshots/`, and encrypted keys are in `focus-credentials.json` in the user-data directory.
The actual directory follows Electron's application name. Back up the local-data directory while
Focus is closed. The SQLite database is unencrypted; it is protected by your macOS account's file permissions.
Existing cloud sessions are not automatically downloaded or migrated; the local app starts with a fresh history.

## Privacy and data flow

Focus has no maintainer-operated service, shared API key, login, product analytics, crash reporting,
or hosted tracing. LangChain and Deep Agents run inside the desktop app. Tracing stays disabled in
all builds, even if your shell has tracing enabled.

| Data or action                                                     | Where it goes                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Sessions, reports, chat history, token counts, and saved workflows | Local SQLite database on your Mac                                                           |
| Captured screenshots                                               | Local files on your Mac; relevant images are also sent to your selected model for analysis  |
| AI analysis, chat, and report requests                             | Directly to OpenAI, Anthropic, or Google using the key you saved in Settings                |
| Provider API keys                                                  | Encrypted on your Mac; used by the main process to authenticate with that provider          |
| Optional workflow handoff                                          | The prepared prompt goes to Codex, Claude Desktop/CLI only when you choose a handoff action |

Starting monitoring enables screenshot capture and automatic AI analysis. Relevant screenshots,
active app/window titles, and session context may therefore leave your Mac for your chosen provider.
Chat and report generation also send the context they need. These requests require internet access,
are billed to your provider account, and are subject to that provider's data policies. Focus is not
an entirely offline AI app.

The maintainers receive no usage telemetry, screenshots, conversations, or API keys. You can review
local history and saved workflows without a Focus service. Deleting a session removes its local
records and screenshots; saved workflows remain independent and can be deleted from the Inbox.
Local database and screenshot files are not encrypted by Focus. API keys are encrypted separately.
Local databases, credentials, and test captures are excluded from Git.

## Save workflows and open them in another app

Discovered workflows appear directly on the session screen and in the session report. Choose
**Save workflow** on any card to keep its prompt locally, including workflows that are not yet
marked automation-ready. **Saved workflows** opens the Workflow Inbox, where you can review the
prompt, copy it, open it in Codex or Claude, or delete it.

**Copy & Open Codex** and **Copy & Open Claude Desktop** copy the prompt and open the installed app.
Choose the project/chat you want and paste the prompt there; opening the app does not submit it.
**Claude Terminal** starts the installed Claude CLI with the prompt. **Copy Prompt** lets you use
any other assistant. A saved workflow stays in the Inbox even if you delete its source session.

## Demo use case

A simple way to try the whole loop is a short news-browsing session:

1. Press **Start monitoring**.
2. Visit 3-5 news sites and browse normally for a few minutes: scan headlines, open articles,
   compare coverage, search, and switch between tabs.
3. Press **Stop** and wait for the session report to generate automatically.
4. Review what Focus thinks you were doing, including any repeated workflows it noticed.
5. If the report or Workflow Inbox includes an automation-ready workflow, click the Claude handoff to
   launch the prepared prompt immediately. Claude Desktop or Claude Code CLI must be installed for
   those handoff buttons to open/send the prompt.

This shows the intended shape of the product: Focus observes and explains the browsing workflow,
then packages any repetitive follow-up work for a separate agent to build.

## Architecture

```mermaid
%%{init: {"themeVariables": {"signalColor": "#ff8c00", "signalTextColor": "#ff8c00"}}}%%
sequenceDiagram
  actor FocusUser as Focus user
  participant UI as React UI
  participant Electron as Electron capture
  participant Process as processObservations
  participant Model as Agent harness + model
  participant SQLite
  participant Report as generateReport
  participant Save as saveWorkflowForLater
  participant Inbox as Workflow Inbox
  FocusUser->>UI: Start Focus
  UI->>Electron: Start monitoring
  loop Until monitoring stops
    Electron->>Electron: Detect dwell, capture screen, read active app/title, filter novelty
    Electron->>Process: Send observation metadata + images
    Process->>Model: Analyze observations
    Model-->>Process: Structured output + usage
    Process->>SQLite: Save awareness, timeline, observations, usage
    SQLite-->>UI: Local change event updates awareness + timeline
  end
  FocusUser->>UI: Stop Focus
  UI->>Report: Generate session report
  Report->>Model: Summarize session + workflow candidates
  Model-->>Report: Report + usage
  Report->>SQLite: Save report + usage
  SQLite-->>UI: Local change event shows report
  opt Focus user saves workflow
    FocusUser->>UI: Save workflow
    UI->>Save: Save automation prompt
    Save->>SQLite: Save workflow
    SQLite->>Inbox: Add to Workflow Inbox
    SQLite-->>UI: Local change event updates inbox
  end
```

- **Electron** captures dwell moments locally and tags novelty with a perceptual hash before
  anything leaves the machine.
- **Local agent service** runs LangChain and Deep Agents inside Electron, using the model selected
  in Settings and the user's key. No server, sign-in, deployment, or remote configuration is needed.
- **SQLite** stores sessions, observations, chat, reports, usage, and saved workflows. The small
  `sql.js` adapter serializes transactions and atomically saves the database before publishing local
  IPC updates. Screenshots stay in separate local files and are served through a restricted app protocol.
- **Two-speed loop:** monitoring is throttled and batched; chat is interactive. Reasoning budgets
  vary by provider and run type. See `functions/src/agent/model.ts` and
  `packages/shared/src/monitoringConfig.ts`.
- **Workflow handoff:** Focus saves automation prompts and opens Codex, Claude Desktop/CLI when installed;
  the automation work happens outside Focus.

## Repo layout

| Path                    | What                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| `packages/shared`       | Types, Zod schemas, monitoring config (shared by all packages)                 |
| `functions`             | Local service + agent harness (`@focus/local-service`; historical folder name) |
| `apps/desktop`          | Electron app, native capture, and the nested React renderer                    |
| `apps/desktop/renderer` | Vite renderer loaded by the Electron shell                                     |

## Testing

Automated tests are deterministic and do **not** call Gemini, Anthropic, OpenAI, or Deep Agents. They
require no model provider secrets; agent/model responses are mocked with fixed fixtures.

```bash
pnpm test:unit   # Vitest: shared logic, local service and SQLite, Electron logic, renderer UI
pnpm test:e2e    # Playwright against the mocked Vite renderer harness
pnpm test:ci     # Unit + mocked e2e, no secrets required
pnpm check:privacy # Reject hosted-backend remnants and publishable local user data
pnpm coverage    # Coverage for unit-test projects
pnpm build       # Type-check and build shared, local service, renderer, and Electron shell
```

Coverage thresholds are enforced per layer: shared and agent logic target 90% statements and
branches; renderer and Electron logic target 80%.

For an optional manual check of the live agent/model integration, provide the provider secret value
to the validation script in your shell, then run:

```bash
GEMINI_API_KEY=... \
pnpm --filter @focus/local-service run validate

ANTHROPIC_API_KEY=... \
FOCUS_AGENT_PROVIDER=anthropic \
pnpm --filter @focus/local-service run validate
```

That validation script is intentionally separate from `pnpm test:*` because it calls the live
provider API and can depend on quota, network, and credentials.

To validate OpenAI explicitly, set `OPENAI_API_KEY` and `FOCUS_AGENT_PROVIDER=openai` before
running the same validation script. Automated tests never use live API keys.

For native macOS capture behavior, run the desktop app and do a short manual smoke session:

1. Grant **Screen Recording** and **Accessibility** to Electron when prompted.
2. Start monitoring and confirm real cursor crops/full-screen context frames appear in the timeline.
3. Confirm active app/window metadata is captured.
4. Stop monitoring and confirm the report flow starts from the real desktop app.
5. Save a workflow candidate and confirm Claude handoff copies/sends the prompt when Claude Desktop
   or Claude Code CLI is installed locally.

## Local operation

There is no backend to deploy. `pnpm build` builds the complete local Mac application.
No maintainer-owned cloud project or shared API key is configured.

Token usage is tracked locally per call and session. Hosted tracing is disabled in all builds,
including when tracing environment variables are inherited from the shell. Model requests use the
selected provider’s official API endpoint and your own key. Optional Claude handoff sends the
prepared prompt to the separately installed Claude app/CLI when you explicitly choose it.

Local databases, credentials, screenshots, and UI-test artifacts are excluded from Git.
