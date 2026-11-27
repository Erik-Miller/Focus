import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testProjects } from "./test-projects";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    projects: testProjects,
    coverage: {
      provider: "v8",
      reportsDirectory: ".artifacts/coverage",
      include: [
        "packages/shared/src/automation.ts",
        "packages/shared/src/directAddress.ts",
        "packages/shared/src/monitoringConfig.ts",
        "packages/shared/src/schemas.ts",
        "packages/local-service/src/agent/model.ts",
        "packages/local-service/src/agent/saveWorkflowTool.ts",
        "packages/local-service/src/agent/usage.ts",
        "apps/desktop/electron/automationLaunch.ts",
        "apps/desktop/electron/captureLogic.ts",
        "apps/desktop/electron/crop.ts",
        "apps/desktop/electron/dwell.ts",
        "apps/desktop/electron/imageHash.ts",
        "apps/desktop/electron/windowGeometry.ts",
        "apps/desktop/renderer/src/appStatus.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/node_modules/**", "**/dist/**", "**/lib/**"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
        "packages/shared/src/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "packages/local-service/src/agent/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "apps/desktop/electron/**": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        "apps/desktop/renderer/src/appStatus.ts": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
