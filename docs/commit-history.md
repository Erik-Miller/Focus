# Archived Commit History

This file records the commit history that existed before the repository was reset to a single root commit on 2026-06-18.

- Original branch: `main`
- Archive branch: `archive/pre-cleanup-main-20260618`
- Bundle backup: `/Users/erikmiller/Projects/focus-pre-cleanup-main-20260618.bundle`
- Commit count: 32

## Cleanup Rerun - 2026-06-18

Before the second history reset, GitHub PRs were audited with `gh pr list`:

- Open PRs: 0
- Existing PRs reviewed: #1 through #12, all already merged
- Previous clean root: `4d0ae22d744f587a122a0ed7c4f22354fd4192bd` (`Reset project history`)
- Rerun archive branch: `archive/pre-cleanup-main-20260618-rerun`
- Rerun bundle backup: `/Users/erikmiller/Projects/focus-pre-cleanup-main-20260618-rerun.bundle`
- Stale remote branches pruned after the bundle backup: `origin/codex/completed-timeline-label`, `origin/codex/focus-dock-label`, `origin/codex/focus-session-report-updates`, `origin/codex/polish-icon-readme-overlay`, `origin/codex/readme-architecture-run-it`, `origin/codex/readme-demo-after-run-it`, `origin/codex/readme-manual-setup-deploy-note`, `origin/codex/readme-session-lifecycle-diagram`, `origin/codex/run-it-readme`, `origin/codex/smooth-setup-prompt`
- Stale local branches pruned after the bundle backup: `codex/focus-session-report-updates`, `codex/readme-architecture-run-it`, `codex/readme-demo-after-run-it`, `codex/readme-manual-setup-deploy-note`, `codex/readme-session-lifecycle-diagram`, `codex/run-it-readme`, `codex/test-suite-ui-polish`, `codex/welcome-headline`

## 316901d - Initial commit: Focus — Deep Agent attention-observing desktop app

- Full hash: `316901d16be65e345192d9ffef95a51e754d6766`
- Date: 2026-06-16
- Author: Erik <eamiller34@gmail.com>

Initial commit: Focus — Deep Agent attention-observing desktop app

Electron + React docklet that observes attention via dwell events and
screenshots, interprets activity with a Gemini-backed deepagents agent,
and generates narrative session reports. Includes Firebase Cloud Functions
backend (LangSmith tracing), session resume, session switcher UI, and a
monochrome glass UI.

Co-authored-by: Cursor <cursoragent@cursor.com>


## 387365f - Update session reporting and automation flows

- Full hash: `387365f87393f999565a479c2aab3eec2b281260`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Update session reporting and automation flows

Update session reporting and automation flows

## dbc280c - Move renderer into desktop app

- Full hash: `dbc280c9442bb9712482d7f8124c50a3d5d13213`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Move renderer into desktop app


## 959aa77 - Remove remaining web app config

- Full hash: `959aa7763d32bff7261d91bf2dc3f64732e8ed4e`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Remove remaining web app config


## 2490542 - Use in-app session delete dialog

- Full hash: `2490542293e47d278af0b57d8ccc99442abe43b0`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Use in-app session delete dialog


## d080abd - Remove demo mode remnants

- Full hash: `d080abdb96dfe8d7ea0058dbddd0eff482f65e59`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Remove demo mode remnants


## 1a85938 - Update README usage notes

- Full hash: `1a8593841900067e300f56e63339cdf1fa1704dd`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Update README usage notes


## 01d755e - Update README.md

- Full hash: `01d755e2a2aac416380583981dfbd697c7df17cc`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Update README.md

## 7af5147 - Add additional screenshot to README

- Full hash: `7af514753370ba74d45263a6ae588cbcdd63605f`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Add additional screenshot to README

Added a new image to the README to enhance visual content.

## 86cf5af - Move setup instructions above architecture

- Full hash: `86cf5afc366c0012e208f8df44edf5eaa5d84c45`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Move setup instructions above architecture

Moves the setup instructions above Architecture, renames the section to Run it, and puts the agent setup prompt first.

## 2a99703 - Smooth setup prompt and renderer helper

- Full hash: `2a99703c158d1edb75f371e5bd0ac54419f19e2c`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Smooth setup prompt and renderer helper

Refresh the README setup prompt with the smoother fresh-checkout flow, narrow the generated lib ignore rule, and add the missing renderer cn helper.

Validated with pnpm build on Node 24.16.0 and pnpm 9.15.9.

## 0d99387 - Rename completed timeline label

- Full hash: `0d99387447aa1f898affdd507e4adc8279f967e0`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Rename completed timeline label

Use Completed instead of Analyzed for finished timeline image analysis states.

Validated with pnpm --filter @focus/desktop-renderer run build.

## 988201b - add deterministic test suite

- Full hash: `988201b2accc25d716a65ae7609e1b962c9f341b`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

add deterministic test suite

Add deterministic tests, CI, and README test instructions.

Validated locally with pnpm test:ci, pnpm lint, and pnpm build.

## 3d118c0 - Add deterministic tests and polish monitoring UI

- Full hash: `3d118c0159effe871871ac87acc5c911f67f45da`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Add deterministic tests and polish monitoring UI

Adds deterministic coverage and CI, polishes the desktop monitoring UI, stabilizes chat cancellation, and keeps CI on checks available in the GitHub runner while retaining rules tests as a separate command.

## cb7ce07 - Shorten welcome headline

- Full hash: `cb7ce07e6e756e1fdcfa02745f133f0646d33108`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Shorten welcome headline

Shortens the welcome headline copy.

## 5f348e6 - parallelize observation ingest

- Full hash: `5f348e6141fd7af91486594565effc37d88ba9f9`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

parallelize observation ingest


## c5e1a02 - Merge pull request #8 from Erik-Miller/codex/parallel-ingest-report-gate

- Full hash: `c5e1a02673be07f9db5f0a2c942cabee0043a887`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Merge pull request #8 from Erik-Miller/codex/parallel-ingest-report-gate

[codex] parallelize observation ingest

## 7cb3a56 - Polish icon and timeline overlays

- Full hash: `7cb3a56a6868a449f00b5222834310ef778ff109`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Polish icon and timeline overlays


## 07e09e5 - Polish desktop chat and window controls

- Full hash: `07e09e590b593cf716510f2b9cb0380451f341bd`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Polish desktop chat and window controls


## f6b6416 - Merge pull request #9 from Erik-Miller/codex/polish-icon-readme-overlay

- Full hash: `f6b6416844b7e164e46fd25fdf1aa3af9a9d57e4`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Merge pull request #9 from Erik-Miller/codex/polish-icon-readme-overlay

[codex] polish icon and desktop overlays

## 9707420 - Polish current focus report copy

- Full hash: `97074201c1c1cc978ba0c46ced70a5550fa1d193`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Polish current focus report copy


## 48c307e - Merge pull request #10 from Erik-Miller/codex/focus-dock-label

- Full hash: `48c307efbcfd1f1babe3d665cb2d7f478f0875b4`
- Date: 2026-06-17
- Author: Erik <eamiller34@gmail.com>

Merge pull request #10 from Erik-Miller/codex/focus-dock-label

[codex] polish current focus report copy

## dd87146 - Update README.md

- Full hash: `dd871462735209bbca80547b1d8f0f04eb864ca5`
- Date: 2026-06-18
- Author: Erik <eamiller34@gmail.com>

Update README.md

## 57c1cc6 - Improve README run instructions and architecture diagram

- Full hash: `57c1cc6ff16ee25ac683111f16a830542656e15b`
- Date: 2026-06-18
- Author: Erik <eamiller34@gmail.com>

Improve README run instructions and architecture diagram


## 8be40e6 - Merge README architecture and run instructions

- Full hash: `8be40e6ed0badc094074442cb4b232ffcf2eddbb`
- Date: 2026-06-18
- Author: Erik <eamiller34@gmail.com>

Merge README architecture and run instructions


## b9302dc - Show README architecture as session lifecycle

- Full hash: `b9302dc8b97295a1eb9c9acf095db5c8a98d2e5d`
- Date: 2026-06-18
- Author: Erik <eamiller34@gmail.com>

Show README architecture as session lifecycle


## aa60a7b - Merge README session lifecycle diagram

- Full hash: `aa60a7ba4a0bc86fcbe74fe02d04355100588659`
- Date: 2026-06-18
- Author: Erik <eamiller34@gmail.com>

Merge README session lifecycle diagram


## 51c0741 - Clarify README manual setup and deploy requirements

- Full hash: `51c07411c58d82304606d9bd80c6413e75fbb709`
- Date: 2026-06-18
- Author: Erik <eamiller34@gmail.com>

Clarify README manual setup and deploy requirements


## 53ed93e - Merge README manual setup and deploy requirements

- Full hash: `53ed93e948617d5a0c04053b6fde2ae277c14342`
- Date: 2026-06-18
- Author: Erik <eamiller34@gmail.com>

Merge README manual setup and deploy requirements

Merge PR #11: clarify README manual setup and deploy requirements

## 7940b19 - Move README demo use case after run instructions

- Full hash: `7940b1921641abf5fdc5ba759870c12e3ad74bd8`
- Date: 2026-06-18
- Author: Erik <eamiller34@gmail.com>

Move README demo use case after run instructions


## e15b05c - Merge README demo use case placement

- Full hash: `e15b05c93b1bdbfb9912fcaedd9a123b92495337`
- Date: 2026-06-18
- Author: Erik <eamiller34@gmail.com>

Merge README demo use case placement

Merge PR #12: move README demo use case after run instructions

## 9075af0 - Format codebase

- Full hash: `9075af00eb9ed488d1fe8e5225638f0a367feff2`
- Date: 2026-06-18
- Author: Erik <eamiller34@gmail.com>

Format codebase
