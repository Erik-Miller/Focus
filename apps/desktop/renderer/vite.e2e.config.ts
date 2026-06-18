import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(dir, "src");
const e2e = path.resolve(dir, "e2e");

export default defineConfig({
  root: e2e,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/firebase", replacement: path.resolve(e2e, "mocks/firebase.ts") },
      { find: "@/platform", replacement: path.resolve(e2e, "mocks/platform.ts") },
      {
        find: path.resolve(src, "firebase"),
        replacement: path.resolve(e2e, "mocks/firebase.ts"),
      },
      {
        find: path.resolve(src, "firebase.ts"),
        replacement: path.resolve(e2e, "mocks/firebase.ts"),
      },
      {
        find: path.resolve(src, "platform"),
        replacement: path.resolve(e2e, "mocks/platform.ts"),
      },
      {
        find: path.resolve(src, "platform.ts"),
        replacement: path.resolve(e2e, "mocks/platform.ts"),
      },
      { find: "@", replacement: src },
      {
        find: "@focus/shared",
        replacement: path.resolve(dir, "../../../packages/shared/src/index.ts"),
      },
    ],
  },
  server: { port: 5174, strictPort: true },
  optimizeDeps: { exclude: ["@focus/shared"] },
});
