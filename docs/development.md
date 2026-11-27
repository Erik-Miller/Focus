# Development

[← Focus](../README.md) · [Architecture](implementation-overview.md) · [Design](design.md)

## Repo layout

| Path                     | What                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `packages/shared`        | Types, Zod schemas, monitoring config (shared by all packages) |
| `packages/local-service` | Local SQLite storage, provider integrations, and agent harness |
| `apps/desktop`           | Electron app, native capture, and the nested React renderer    |
| `apps/desktop/renderer`  | Vite renderer loaded by the Electron shell                     |

Additional project files:

- `docs/`: [architecture](implementation-overview.md) and [design rationale](design.md).
- `scripts/`: repository maintenance checks.
- `config/`: linting, formatting, TypeScript, and test-runner configuration.
- `.artifacts/`: generated test results and coverage (ignored by Git).
- Root files cover the project overview, license, dependencies, workspace, Git ignores, and Node version.

Use the root `pnpm` commands below so tools load the configuration from `config/`.
ESLint and Prettier settings are also linked from `package.json` for editor discovery.
Formatting uses `config/prettierignore` to skip generated files.

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

GitHub Actions is currently disabled for this repository; run validation locally before opening a PR. The optional coverage command currently reports an existing agent branch-coverage shortfall against its configured threshold.
