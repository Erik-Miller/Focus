import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root = path.resolve(__dirname, "..");

const port = Number(process.env.FOCUS_E2E_PORT || 5174);

export default defineConfig({
  outputDir: "../.artifacts/test-results",
  testDir: "../apps/desktop/renderer/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    cwd: root,
    command: `pnpm --filter @focus/desktop-renderer run dev:e2e --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
