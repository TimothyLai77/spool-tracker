import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema.js";

/**
 * Database location: `DATA_DIR` env (set to `/data` in the container),
 * defaulting to the repo's `data/` directory for local dev.
 */
const dataDir =
  process.env.DATA_DIR ?? path.join(import.meta.dirname, "../../data");
mkdirSync(dataDir, { recursive: true });

/**
 * Synchronous SQLite handle. WAL mode for read/write concurrency on the
 * single file; `foreign_keys` must be enabled per-connection for the
 * ON DELETE CASCADE / SET NULL rules in the schema to take effect.
 */
const sqlite = new Database(path.join(dataDir, "spool-tracker.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

/** Drizzle instance over the raw handle, with the schema for typing. */
export const db = drizzle(sqlite, { schema });

/** Raw better-sqlite3 handle (for raw SQL / tests). */
export { sqlite, dataDir };
