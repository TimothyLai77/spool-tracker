import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { stagedJobs } from "../db/schema.js";
import type { ApiIssue } from "@shared/api.js";
import type { Job, StagedJob } from "@shared/types.js";
import { createJob } from "./jobs.js";
import type {
  CommitStagedJobData,
  CreateStagedJobData,
} from "../validate/stagedJob.js";

/**
 * Staged-job business logic (DESIGN.md §4, §5, §6, §9).
 *
 * A staged job is a finished print awaiting commit to a spool — entered
 * manually (this module's `createStagedJob`) or inserted directly at the DB
 * layer by the printer sync (T11). Committing is the only mutation that
 * touches a spool, and it is a single better-sqlite3 transaction:
 *
 *   check staged exists · check spool exists · check project exists ·
 *   check no over-draft · `usedMg += amt` · insert job · delete staged
 *
 * The job half reuses `logic/jobs.ts` `createJob` nested inside the commit
 * transaction (better-sqlite3 maps the nesting to a SAVEPOINT — the commit
 * remains one BEGIN/COMMIT). Any failure path (404 / over-draft / bad
 * project) returns before the staged row is deleted: nothing is half-applied.
 */

/** The outcome of a staged-job commit, mapped to a status by the route. */
export type CommitStagedJobResult =
  | { status: "ok"; job: Job }
  | { status: "not-found" }
  | { status: "issues"; issues: ApiIssue[] };

/** Outcome of a staged-job create — 201, so the row is returned. */
export type StagedJobCreateResult = { status: "ok"; staged: StagedJob };

/** Outcome of a staged-job delete — 204, so no body to return. */
export type StagedJobDeleteResult = { status: "ok" } | { status: "not-found" };

/**
 * List staged jobs, most recent first.
 * @returns The staged jobs.
 */
export const listStagedJobs = (): StagedJob[] => {
  return db
    .select()
    .from(stagedJobs)
    .orderBy(desc(stagedJobs.createdAt), desc(stagedJobs.id))
    .all();
};

/**
 * Create a manually entered staged job. `printerId` and `amsChannel` are
 * null for manual entry; the printer sync (T11) sets them itself.
 * @param data Canonical fields from `validateCreateStagedJob`.
 * @returns The created staged job.
 */
export const createStagedJob = (data: CreateStagedJobData): StagedJobCreateResult => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.insert(stagedJobs)
    .values({
      id,
      name: data.name,
      filamentUsedMg: data.filamentUsedMg,
      date: data.date,
      printerId: null,
      amsChannel: null,
      createdAt: now,
    })
    .run();
  const staged = db.select().from(stagedJobs).where(eq(stagedJobs.id, id)).get();
  return { status: "ok", staged: staged as StagedJob };
};

/**
 * Delete a staged job (the user discards it — no spool involved).
 * @param id Staged job id.
 * @returns `ok` when deleted, or `not-found`.
 */
export const deleteStagedJob = (id: string): StagedJobDeleteResult => {
  const deleted = db.delete(stagedJobs).where(eq(stagedJobs.id, id)).run();
  return deleted.changes > 0 ? { status: "ok" } : { status: "not-found" };
};

/**
 * Commit a staged job to a spool in ONE transaction (DESIGN §4, §9):
 * create the real job (debiting the spool) and delete the staged row.
 *
 * The job inherits the staged row's `name` and `date`; the commit body
 * supplies `spoolId`, the (now mandatory) amount, and optional cost/project.
 * On any failure (staged missing, spool missing, project missing, over-draft)
 * the staged row is left in place and the spool untouched — the whole
 * transaction rolls back as one unit.
 * @param id Staged job id.
 * @param data Canonical fields from `validateCommitStagedJob`.
 * @returns `ok` with the created job, `not-found`, or `issues` (→ 400).
 */
export const commitStagedJob = (
  id: string,
  data: CommitStagedJobData
): CommitStagedJobResult => {
  return db.transaction((tx) => {
    const staged = tx.select().from(stagedJobs).where(eq(stagedJobs.id, id)).get();
    if (!staged) return { status: "not-found" as const };

    // Nested transaction → SAVEPOINT on the same connection, so this is all
    // one commit. `createJob` does the spool/project existence checks and
    // the over-draft bound, and returns issues without throwing — so we only
    // delete the staged row on the `ok` path below.
    const jobResult = createJob({
      name: staged.name,
      spoolId: data.spoolId,
      filamentUsedMg: data.filamentUsedMg,
      date: staged.date,
      costCents: data.costCents,
      projectId: data.projectId,
    });
    if (jobResult.status !== "ok") return jobResult;

    tx.delete(stagedJobs).where(eq(stagedJobs.id, id)).run();

    return { status: "ok" as const, job: jobResult.job };
  });
};
