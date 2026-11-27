import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const logicCoverageExclude = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/types.ts",
  "**/prompts.ts",
  "**/index.ts",
  "**/main.tsx",
  "**/vite*.config.ts",
  "**/tsup.config.ts",
  "**/node_modules/**",
  "**/dist/**",
  "**/lib/**",
  "**/dist-electron/**",
];

export const testProjects = [
  defineProject({
    test: {
      name: "shared",
      environment: "node",
      include: ["packages/shared/src/**/*.test.ts"],
      coverage: {
        provider: "v8",
        include: ["packages/shared/src/**/*.ts"],
        exclude: logicCoverageExclude,
        thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  }),
  defineProject({
    resolve: {
      alias: {
        "@focus/shared": path.resolve(root, "packages/shared/src/index.ts"),
      },
    },
    test: {
      name: "local-service",
      environment: "node",
      include: ["packages/local-service/src/**/*.test.ts"],
      setupFiles: ["packages/local-service/src/test/setup.ts"],
      coverage: {
        provider: "v8",
        include: ["packages/local-service/src/**/*.ts"],
        exclude: logicCoverageExclude,
        thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  }),
  defineProject({
    resolve: {
      alias: {
        "@focus/shared": path.resolve(root, "packages/shared/src/index.ts"),
      },
    },
    test: {
      name: "electron",
      environment: "node",
      include: ["apps/desktop/electron/**/*.test.ts"],
      coverage: {
        provider: "v8",
        include: ["apps/desktop/electron/**/*.ts"],
        exclude: [...logicCoverageExclude, "**/main.ts", "**/preload.ts"],
        thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  }),
  defineProject({
    resolve: {
      alias: {
        "@": path.resolve(root, "apps/desktop/renderer/src"),
        "@focus/shared": path.resolve(root, "packages/shared/src/index.ts"),
      },
    },
    test: {
      name: "renderer",
      environment: "jsdom",
      include: [
        "apps/desktop/renderer/src/**/*.test.ts",
        "apps/desktop/renderer/src/**/*.test.tsx",
      ],
      setupFiles: ["apps/desktop/renderer/src/test/setup.ts"],
      css: false,
      coverage: {
        provider: "v8",
        include: ["apps/desktop/renderer/src/**/*.ts", "apps/desktop/renderer/src/**/*.tsx"],
        exclude: [...logicCoverageExclude, "**/components/ui/**", "**/styles.css"],
        thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  }),
];

export default testProjects;
