import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { db } from "./client.js";
import * as schema from "./schema.js";

/**
 * The transaction handle Drizzle passes to a `db.transaction()` callback.
 *
 * Derived from `client.ts` (rather than imported from drizzle's internals) so
 * it tracks exactly what the app's `db.transaction()` hands over, including
 * the full-schema generic.
 */
type TransactionHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Anything a query can run against: the application database, or an open
 * transaction on it.
 *
 * Every function in `db/queries/*` takes one of these as its first argument,
 * so a query is a pure function of (handle, arguments): `logic/*` opens the
 * transaction and passes `tx` to the queries that must be atomic, and passes
 * `db` to the ones that run on their own.
 */
export type DbHandle = BetterSQLite3Database<typeof schema> | TransactionHandle;
