import { afterEach, beforeEach } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { createDbInstance, setDbForTests } from "../../src/db/client.js";

/** Location of the drizzle-kit migration SQL, shared with the app boot path. */
const MIGRATIONS_FOLDER = path.join(import.meta.dirname, "../../drizzle");

/**
 * Point the application database at a fresh in-memory SQLite instance for
 * every test in the suite.
 *
 * Call this at the top of a test file (outside any test):
 *
 * ```ts
 * import { setupFreshDb } from "../utils/freshDb.js";
 * setupFreshDb();
 * ```
 *
 * Per test: open `:memory:`, run the same migrations the app runs at boot,
 * rebind the live `db` export (so modules like `logic/spools.ts` see it),
 * and close the handle afterwards. Tests can never touch the real `data/`
 * file, and every test starts from a clean, fully-migrated schema.
 *
 * @returns Nothing — registers `beforeEach`/`afterEach` hooks.
 */
export const setupFreshDb = (): void => {
  beforeEach(() => {
    const { db, sqlite } = createDbInstance(":memory:");
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    setDbForTests(db);
    afterEach(() => sqlite.close());
  });
};
