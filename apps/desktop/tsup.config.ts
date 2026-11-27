import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "electron/main.ts",
    preload: "electron/preload.ts",
  },
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  target: "node20",
  outDir: "dist-electron",
  clean: true,
  noExternal: [/^(?!sql\.js|electron).*/],
  external: ["electron", "electron-liquid-glass", "sql.js", "sql.js/dist/sql-wasm-inline.js"],
  splitting: false,
  sourcemap: true,
});
