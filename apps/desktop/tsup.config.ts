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
  noExternal: ["@focus/shared"],
  external: ["electron", "electron-liquid-glass"],
  splitting: false,
  sourcemap: true,
});
