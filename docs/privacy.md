# Privacy and data flow

[← Focus](../README.md)

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
