# Getting started

[← Focus](../README.md)

### Prerequisites

- macOS, Node 24, and pnpm 11.7.0.
- Your own OpenAI, Anthropic, or Gemini API key for AI features. No Focus account or hosted backend is required.
- Optional for automation handoff: install Codex, Claude Desktop, and/or Claude Code CLI. Focus can save
  prompts to the Workflow Inbox without them, but the handoff buttons need the selected desktop app or
  a `claude` CLI command on PATH to open/send prompts to those platforms.

### Manual setup

```bash
git clone https://github.com/underdoginnovationinc/Focus.git
cd Focus
pnpm install --frozen-lockfile

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

## Save workflows and open them in another app

Discovered workflows appear directly on the session screen and in the session report. Choose
**Save workflow** on any card to keep its prompt locally, including workflows that are not yet
marked automation-ready. **Saved workflows** opens the Workflow Inbox, where you can review the
prompt, copy it, open it in Codex or Claude, or delete it.

Choose **Copy for agent**, then **Codex** or **Claude Desktop**, to copy the prompt and open the installed app.
Choose the project/chat you want and paste the prompt there; opening the app does not submit it.
The **Claude Terminal** menu option starts the installed Claude CLI with the prompt. **Copy Prompt** lets you use
any other assistant. A saved workflow stays in the Inbox even if you delete its source session.

## Try a short session

Start monitoring while comparing a few articles or research notes. Stop, review the report, and save a useful workflow. Use **Copy for agent** to bring the context into Codex or Claude. These are ideas to review, not actions Focus executes automatically.
