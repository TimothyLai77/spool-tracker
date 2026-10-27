import { desc, eq } from "drizzle-orm";
import { jobs, projects } from "../schema.js";
import type { DbHandle } from "../handle.js";
import type { Job, JobRow } from "@shared/types.js";

/**
 * Job data access — every Drizzle touch-point for the `jobs` table.
 *
 * Layer rules (DESIGN.md §6): SQL and nothing else. Each function takes a
 * `DbHandle` (the app db, or an open transaction) as its first argument so the
 * caller decides where the statement runs; this module never imports the `db`
 * singleton, never opens a transaction, and never mints ids or timestamps —
 * those are `logic/jobs.ts`'s job. The balance writes to `spools.usedMg` are
 * not here either; they live in `queries/spools.ts` because they belong to the
 * spool table.
 */

/**
 * `Job` API-shape columns: the row plus the joined `projectName`
 * (null for unassigned personal prints — the opt-in, DESIGN §4).
 *
 * Exported because the project detail endpoint returns member jobs in this
 * same shape (see `queries/projects.ts`).
 */
export const jobSelect = {
  id: jobs.id,
  name: jobs.name,
  spoolId: jobs.spoolId,
  projectId: jobs.projectId,
  filamentUsedMg: jobs.filamentUsedMg,
  costCents: jobs.costCents,
  date: jobs.date,
  createdAt: jobs.createdAt,
  updatedAt: jobs.updatedAt,
  projectName: projects.name,
};

/**
 * Jobs, most recent print first, with the joined `projectName`.
 * @param db The database or transaction to read.
 * @param spoolId When given, only the jobs on that spool (the `?spoolId=` filter).
 * @returns The `Job` API shapes (`date DESC`, then `createdAt DESC`).
 */
export const listJobs = (db: DbHandle, spoolId?: string): Job[] => {
  const query = db.select(jobSelect).from(jobs).leftJoin(projects, eq(jobs.projectId, projects.id));
  const filtered = spoolId === undefined ? query : query.where(eq(jobs.spoolId, spoolId));
  return filtered.orderBy(desc(jobs.date), desc(jobs.createdAt)).all();
};

/**
 * One job, with its joined `projectName`.
 * @param db The database or transaction to read.
 * @param id Job id.
 * @returns The `Job` API shape, or undefined when it does not exist.
 */
export const findJobById = (db: DbHandle, id: string): Job | undefined => {
  return db
    .select(jobSelect)
    .from(jobs)
    .leftJoin(projects, eq(jobs.projectId, projects.id))
    .where(eq(jobs.id, id))
    .get();
};

/**
 * Insert a fully-formed job row (id and timestamps supplied by the caller).
 * @param db The database or transaction to write.
 * @param row The complete row to insert.
 * @returns Nothing.
 */
export const insertJob = (db: DbHandle, row: JobRow): void => {
  db.insert(jobs).values(row).run();
};

/**
 * Apply a partial update to one job.
 * @param db The database or transaction to write.
 * @param id Job id.
 * @param changes Columns to change (never includes the id).
 * @returns The number of rows affected (0 when the id is absent).
 */
export const updateJobById = (db: DbHandle, id: string, changes: Partial<JobRow>): number => {
  return db.update(jobs).set(changes).where(eq(jobs.id, id)).run().changes;
};

/**
 * Delete one job.
 * @param db The database or transaction to write.
 * @param id Job id.
 * @returns The number of rows affected (0 when the id is absent).
 */
export const deleteJobById = (db: DbHandle, id: string): number => {
  return db.delete(jobs).where(eq(jobs.id, id)).run().changes;
};

/**
 * Existence check for a project id, used by the job create/edit rules (a
 * non-null `projectId` must reference a real project → 400).
 *
 * Lives here because it is the job rules that reference projects, not the
 * project rules. Returns the id rather than the row: callers only ask "does it
 * exist?".
 * @param db The database or transaction to read.
 * @param id Project id.
 * @returns The project id when it exists, otherwise undefined.
 */
export const findProjectId = (db: DbHandle, id: string): string | undefined => {
  const row = db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  return row?.id;
};
