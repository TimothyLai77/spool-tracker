import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for the backend test suite (DESIGN.md §9).
 *
 * Tests run in Node against an in-memory SQLite database — a fresh one per
 * test (see `test/utils/freshDb.ts`). No temp dirs, no file I/O, and the
 * real `data/` directory can never be touched.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Same shared code as the app (DESIGN.md §8). Vite's resolver maps the
      // NodeNext-style `.js` specifiers (e.g. `@shared/api.js`) onto the `.ts`
      // sources, matching how the frontend imports extensionless.
      "@shared": path.join(import.meta.dirname, "../shared"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
