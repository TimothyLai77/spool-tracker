import { count, desc, eq, sql } from "drizzle-orm";
import { jobs, spools } from "../schema.js";
import type { DbHandle } from "../handle.js";
import type { Spool, SpoolAttributes, SpoolRow } from "@shared/types.js";

/**
 * Spool data access — every Drizzle touch-point for the `spools` table.
 *
 * Layer rules (DESIGN.md §6): this module owns SQL and nothing else. It takes
 * a `DbHandle` (the app db, or an open transaction) as its first argument so
 * the caller decides where a query runs; it never imports the `db` singleton,
 * never opens a transaction, and never mints ids or timestamps — those are
 * `logic/spools.ts`'s job. Selections return the `Spool` API shape, derived
 * fields included, so the shape is assembled in exactly one place per table.
 */

/**
 * `Spool` API-shape columns: the row, plus `leftMg` computed in SQL and
 * `jobCount` from a grouped join on `jobs`.
 *
 * `count(jobs.id)` ignores the NULL produced by the LEFT JOIN for a spool with
 * no jobs, so empty spools come back as 0 without a COALESCE.
 */
const spoolSelect = {
  id: spools.id,
  name: spools.name,
  brand: spools.brand,
  material: spools.material,
  colour: spools.colour,
  colourHex: spools.colourHex,
  finish: spools.finish,
  initialWeightMg: spools.initialWeightMg,
  usedMg: spools.usedMg,
  costCents: spools.costCents,
  isFinished: spools.isFinished,
  notes: spools.notes,
  createdAt: spools.createdAt,
  updatedAt: spools.updatedAt,
  leftMg: sql<number>`${spools.initialWeightMg} - ${spools.usedMg}`,
  jobCount: count(jobs.id),
};

/**
 * All spools, active and finished, newest created first, with derived fields.
 * @param db The database or transaction to read.
 * @returns The `Spool` API shapes (`createdAt DESC`).
 */
export const listSpools = (db: DbHandle): Spool[] =>
  db
    .select(spoolSelect)
    .from(spools)
    .leftJoin(jobs, eq(jobs.spoolId, spools.id))
    .groupBy(spools.id)
    .orderBy(desc(spools.createdAt))
    .all();

/**
 * One spool with its derived fields.
 * @param db The database or transaction to read.
 * @param id Spool id.
 * @returns The `Spool` API shape, or undefined when it does not exist.
 */
export const findSpoolById = (db: DbHandle, id: string): Spool | undefined =>
  db
    .select(spoolSelect)
    .from(spools)
    .leftJoin(jobs, eq(jobs.spoolId, spools.id))
    .where(eq(spools.id, id))
    .groupBy(spools.id)
    .get();

/**
 * Insert a fully-formed spool row (id and timestamps supplied by the caller).
 * @param db The database or transaction to write.
 * @param row The complete row to insert.
 * @returns Nothing.
 */
export const insertSpool = (db: DbHandle, row: SpoolRow): void => {
  db.insert(spools).values(row).run();
};

/**
 * Apply a partial update to one spool.
 * @param db The database or transaction to write.
 * @param id Spool id.
 * @param changes Columns to change (never includes the id).
 * @returns The number of rows affected (0 when the id is absent).
 */
export const updateSpoolById = (db: DbHandle, id: string, changes: Partial<SpoolRow>): number =>
  db.update(spools).set(changes).where(eq(spools.id, id)).run().changes;

/**
 * Delete one spool. Its jobs (and `ams_mappings`) cascade via FK rules.
 * @param db The database or transaction to write.
 * @param id Spool id.
 * @returns The number of rows affected (0 when the id is absent).
 */
export const deleteSpoolById = (db: DbHandle, id: string): number =>
  db.delete(spools).where(eq(spools.id, id)).run().changes;

/**
 * Distinct stored attribute values for form suggestions (DESIGN §5).
 *
 * One `SELECT DISTINCT` over the four columns, then de-duped per column in JS
 * (the DISTINCT is over the whole tuple, so a value can repeat across rows).
 * The tables are small — a single-user spool shelf.
 * @param db The database to read.
 * @returns `{ brands, materials, colours, finishes }`, each sorted.
 */
export const listSpoolAttributes = (db: DbHandle): SpoolAttributes => {
  const rows = db
    .selectDistinct({
      brand: spools.brand,
      material: spools.material,
      colour: spools.colour,
      finish: spools.finish,
    })
    .from(spools)
    .all();

  const uniqueSorted = (pick: (row: (typeof rows)[number]) => string | null): string[] =>
    [...new Set(rows.map(pick).filter((value): value is string => value !== null))].sort();

  return {
    brands: uniqueSorted((row) => row.brand),
    materials: uniqueSorted((row) => row.material),
    colours: uniqueSorted((row) => row.colour),
    finishes: uniqueSorted((row) => row.finish),
  };
};
