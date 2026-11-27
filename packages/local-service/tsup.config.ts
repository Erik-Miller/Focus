import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "lib",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: true,
  esbuildOptions(options) {
    // Bundle the shared contracts into the local service.
    options.alias = {
      ...(options.alias ?? {}),
      "@focus/shared": path.resolve(dir, "../shared/dist/index.js"),
    };
  },
});
