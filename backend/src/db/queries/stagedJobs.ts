import { desc, eq, lt } from "drizzle-orm";
import { stagedJobs } from "../schema.js";
import type { DbHandle } from "../handle.js";
import type { StagedJob, StagedJobRow } from "@shared/types.js";

/**
 * Staged-job data access — every Drizzle touch-point for the `staged_jobs`
 * table.
 *
 * Layer rules (DESIGN.md §6): SQL and nothing else. Each function takes a
 * `DbHandle` (the app db, or an open transaction) as its first argument so the
 * caller decides where the statement runs; this module never imports the `db`
 * singleton, never opens a transaction, and never mints ids or timestamps.
 * A staged job has no derived fields, so rows are returned as-is.
 */

/**
 * All staged jobs, most recent first.
 * @param db The database or transaction to read.
 * @returns The staged jobs (`createdAt DESC`, then `id DESC`).
 */
export const listStagedJobs = (db: DbHandle): StagedJob[] => {
  return db
    .select()
    .from(stagedJobs)
    .orderBy(desc(stagedJobs.createdAt), desc(stagedJobs.id))
    .all();
};

/**
 * One staged job.
 * @param db The database or transaction to read.
 * @param id Staged job id.
 * @returns The staged job, or undefined when it does not exist.
 */
export const findStagedJobById = (db: DbHandle, id: string): StagedJob | undefined => {
  return db.select().from(stagedJobs).where(eq(stagedJobs.id, id)).get();
};

/**
 * Insert a fully-formed staged job row (id and timestamp supplied by the caller).
 * @param db The database or transaction to write.
 * @param row The complete row to insert.
 * @returns Nothing.
 */
export const insertStagedJob = (db: DbHandle, row: StagedJobRow): void => {
  db.insert(stagedJobs).values(row).run();
};

/**
 * Delete one staged job.
 * @param db The database or transaction to write.
 * @param id Staged job id.
 * @returns The number of rows affected (0 when the id is absent).
 */
export const deleteStagedJobById = (db: DbHandle, id: string): number => {
  return db.delete(stagedJobs).where(eq(stagedJobs.id, id)).run().changes;
};

/**
 * Delete every staged job created before a cutoff — the startup TTL prune
 * (DESIGN §6: staged jobs are ephemeral, `STAGED_JOB_TTL_DAYS`).
 * @param db The database to write.
 * @param cutoffIso ISO-8601 timestamp; rows with an older `createdAt` go.
 * @returns The number of rows deleted.
 */
export const deleteStagedJobsOlderThan = (db: DbHandle, cutoffIso: string): number => {
  return db.delete(stagedJobs).where(lt(stagedJobs.createdAt, cutoffIso)).run().changes;
};
