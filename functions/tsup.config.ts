import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "lib",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  esbuildOptions(options) {
    // Resolve the workspace package to its built output so it is bundled inline.
    // This keeps `workspace:*` out of the deployed package.json (Cloud Build runs
    // `npm install`, which cannot resolve the workspace: protocol).
    options.alias = {
      ...(options.alias ?? {}),
      "@focus/shared": path.resolve(dir, "../packages/shared/dist/index.js"),
    };
  },
});
