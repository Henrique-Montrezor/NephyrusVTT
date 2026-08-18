import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { fileURLToPath, URL } from "node:url";

// O backend FastAPI local (host do mestre) roda em :8000 durante o desenvolvimento.
const BACKEND = "http://localhost:8000";

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/storage": { target: BACKEND, changeOrigin: true },
      "/ws": { target: BACKEND, ws: true, changeOrigin: true },
      "/health": { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    // Gera para uma pasta consumida pelo FastAPI em produção (Fase 5).
    outDir: "dist",
    emptyOutDir: true,
  },
});
