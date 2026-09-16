import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// The single .env lives at the repo root (shared with the backend).
const rootEnv = loadEnv("development", path.join(dirname, ".."), "");

/**
 * Vite dev server + build config.
 * - `@shared` alias mirrors the backend tsconfig paths (DESIGN.md §8).
 * - Dev proxy: `/api → :8080` keeps the browser same-origin in dev too.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.join(dirname, "../shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Follows the backend port (root .env sets APP_PORT for dev; default
      // 8080 as in the docker-compose design).
      "/api": `http://localhost:${rootEnv.APP_PORT ?? 8080}`,
    },
  },
});
