# Focus implementation overview

Focus is a local Mac desktop app. Electron captures cursor dwell events and screenshots, React
presents session awareness and history, and a local LangChain / Deep Agents service interprets
activity using the user's selected AI provider.

## Packages

- `apps/desktop`: Electron main process, secure key storage, capture, IPC, and local screenshot protocol.
- `apps/desktop/renderer`: React UI, model settings, monitoring buffers, and local query hooks.
- `packages/shared`: model catalog, types, schemas, and monitoring configuration.
- `packages/local-service`: local SQLite storage and the LangChain / Deep Agents harness, bundled into Electron.

## Data flow

Capture → local ingest operation → SQLite and screenshot files → IPC change event → React.
Monitoring synthesis → local Deep Agent → selected provider → validated interpretation → SQLite.
Chat and reports reuse the session hypothesis, workflows, and observation context. Chat can save
workflow candidates through a local tool. The Workflow Inbox can hand off prompts to Claude Desktop/CLI.

## Storage and concurrency

SQLite is implemented with sql.js (an embedded SQLite engine without native addon rebuilds).
The document repository implements the queries, transactions, increments, batches, and recursive
deletion used by the agent operations. Writes are serialized. Each committed database snapshot is
written to a temporary file, flushed, and atomically renamed before notifying the UI. A failed
write restores the previous in-memory database. Only one app instance owns the store.

Data lives in Electron userData/local-data/focus.sqlite. Screenshots are separate files below
local-data/screenshots, accessible through the restricted focus-image://local protocol. Deleting
a session deletes its records and screenshots. Saved workflows remain independently available.
On restart, interrupted synthesis locks are cleared and interrupted reports return to stopped.
Existing cloud history is not automatically migrated.

## Models and privacy

Settings offers OpenAI GPT-6.2 Sol, GPT-5.4 mini, Claude Sonnet 4.6, and Gemini 3.6 Flash. All support screenshots and require the user's own
API key. Keys are encrypted using Electron safeStorage; existing Anthropic keys retain their
storage format. The renderer can save/clear a key and read its status, but cannot retrieve it.
The main process injects only the selected provider's key into an agent operation.

The LangChain integrations call the provider directly. Relevant context and screenshots leave the
Mac only for those AI requests. There is no Focus login, hosted API, remote configuration,
or product analytics. LangSmith tracing is disabled for local runs. Local history and saved workflows
are usable offline; AI features require the provider's network access and quota.

## Validation

Unit tests cover the shared contracts, agent operations, secure key behavior, and SQLite persistence,
transaction rollback, concurrent updates, session deletion, path validation, and provider routing.
Renderer tests and mocked Playwright flows cover monitoring, chat cancellation, and workflow handoff.
Live model validation remains opt-in through the local service's validate script.
