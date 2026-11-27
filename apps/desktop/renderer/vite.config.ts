import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: { port: 5173, strictPort: true },
  // Allow Vite to transpile the linked workspace package source.
  optimizeDeps: { exclude: ["@focus/shared"] },
  build: { outDir: "dist", sourcemap: true },
});
