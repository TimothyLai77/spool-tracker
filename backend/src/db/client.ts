import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema.js";

/** A ready-to-use database: the Drizzle instance plus the raw handle. */
export interface DbInstance {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: Database.Database;
}

/**
 * Open a better-sqlite3 database and wrap it in a Drizzle instance.
 *
 * Applies the two pragmas the schema depends on: WAL mode and
 * `foreign_keys = ON` (required per-connection for the ON DELETE CASCADE /
 * SET NULL rules to take effect).
 *
 * @param dataDir Directory for the `spool-tracker.db` file, or the special
 * value `":memory:"` for an in-memory database (used by the test suite — no
 * directory is created in that case).
 * @returns The Drizzle instance and the raw better-sqlite3 handle.
 */
export const createDbInstance = (dataDir: string): DbInstance => {
  if (dataDir !== ":memory:") mkdirSync(dataDir, { recursive: true });
  const file = dataDir === ":memory:" ? dataDir : path.join(dataDir, "spool-tracker.db");
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return { db: drizzle(sqlite, { schema }), sqlite };
};

/**
 * Database location: `DATA_DIR` env (set to `/data` in the container),
 * defaulting to the repo's `data/` directory for local dev.
 */
export const dataDir =
  process.env.DATA_DIR ?? path.join(import.meta.dirname, "../../data");

const { sqlite, db: appDb } = createDbInstance(dataDir);

/**
 * The application database. Declared with `let` so the test suite can
 * rebind it to a fresh in-memory instance per test (ESM live bindings mean
 * every importer, e.g. `logic/spools.ts`, immediately sees the swap).
 */
export let db: BetterSQLite3Database<typeof schema> = appDb;

/**
 * Rebind the application `db` to a different instance (tests only).
 * @param instance The replacement Drizzle instance.
 */
export const setDbForTests = (instance: BetterSQLite3Database<typeof schema>): void => {
  db = instance;
};

/** Raw better-sqlite3 handle for the app database (raw SQL / debugging). */
export { sqlite };
