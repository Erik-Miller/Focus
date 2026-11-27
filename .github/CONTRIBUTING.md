# Contributing to Focus

Thanks for helping make Focus useful. Bug fixes, documentation improvements, and focused feature ideas are welcome.

## Before you start

- Search existing issues first. For a substantial feature, open an issue describing the problem and proposed behavior before building it.
- Follow the [setup guide](../docs/getting-started.md) and [development guide](../docs/development.md).
- Keep changes focused. Include screenshots for UI changes and explain how you checked the behavior.

## Validate a pull request

Run these commands from the repository root with Node 24 and pnpm 11.7.0:

```bash
pnpm install --frozen-lockfile
pnpm check:privacy
pnpm lint
pnpm test:ci
pnpm build
```

Browser tests require Chromium: `pnpm exec playwright install chromium`.
Tests use mocked provider responses; no API keys are required. GitHub Actions is currently disabled, so include local validation results in your PR.

## Protect local data

Never commit API keys, session databases, screenshots from private sessions, or test artifacts. Use synthetic data in screenshots and bug reports. Keep provider calls opt-in and do not add product analytics or hosted tracing. See the [privacy guide](../docs/privacy.md).

Report security vulnerabilities privately using the [security policy](SECURITY.md).
