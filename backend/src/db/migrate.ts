import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { db } from "./client.js";

/**
 * Apply all pending drizzle-kit migrations (idempotent — already-applied
 * migrations are tracked in the `__drizzle_migrations` table and skipped).
 * Called once at app boot so `docker compose up` is the only deploy step.
 */
export const runMigrations = (): void => {
  migrate(db, {
    migrationsFolder: path.join(import.meta.dirname, "../../drizzle"),
  });
}
