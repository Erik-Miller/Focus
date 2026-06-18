import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "apps/desktop/renderer/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm --filter @focus/desktop-renderer run dev:e2e",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
