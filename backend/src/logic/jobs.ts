import { db } from "../db/client.js";
import * as jobQueries from "../db/queries/jobs.js";
import * as spoolQueries from "../db/queries/spools.js";
import { mgToGrams } from "@shared/units.js";
import type { ApiIssue } from "@shared/api.js";
import type { Job, JobRow } from "@shared/types.js";
import type { CreateJobData, EditJobData } from "../validate/job.js";

/**
 * Job business logic (DESIGN.md §4, §5, §6).
 *
 * All mutations live here (never in routes). This module owns the rules —
 * transactions, ids, timestamps, the balance checks, the `status` results
 * routes map to HTTP codes — and delegates every SQL statement to
 * `db/queries/jobs.ts` (and `db/queries/spools.ts` for the balance writes),
 * passing `tx` inside a transaction and `db` outside one.
 *
 * Every job mutation is a single synchronous better-sqlite3 transaction that
 * touches *both* the job and its spool — that is what enforces the balance
 * invariant (DESIGN §4 invariant table):
 *
 *   create: check spool exists · check `usedMg + amt ≤ initialWeightMg` ·
 *           `usedMg += amt` · insert job
 *   edit:   `delta = oldAmt − newAmt` · check bounds · `usedMg += delta` · update job
 *   delete: `usedMg −= amt` · delete job
 *
 * Over-draft returns `{ status: "issues" }` (routes map that to a 400) and
 * the spool is left untouched — the transaction rolls back. No zero-amount
 * special cases: the validator rejects `filamentUsedGrams ≤ 0`.
 */

/** The outcome of a job mutation, mapped to a status by the route. */
export type JobMutationResult =
  | { status: "ok"; job: Job }
  | { status: "not-found" }
  | { status: "issues"; issues: ApiIssue[] };

/** Outcome of a job delete — 204, so no body to return. */
export type JobDeleteResult = { status: "ok" } | { status: "not-found" };

/**
 * List jobs, most recent print date first, with the joined `projectName`.
 * @param spoolId When given, only jobs on that spool (the `?spoolId=` filter).
 * @returns The `Job` API shapes.
 */
export const listJobs = (spoolId?: string): Job[] => jobQueries.listJobs(db, spoolId);

/**
 * Build the 400 issue for an over-draft job amount (DESIGN §4: the spool's
 * initial weight is the hard bound).
 * @param spool The spool the job would draw from.
 * @returns The per-field issue.
 */
const overDraftIssue = (spool: { leftMg: number }): ApiIssue => ({
  field: "filamentUsedGrams",
  message: `filamentUsedGrams exceeds the ${mgToGrams(spool.leftMg)} g left on the spool`,
});

/**
 * Create a job and debit its spool in one transaction.
 *
 * Checks, in order: spool exists (→ 404), project exists when given (→ 400),
 * no over-draft (→ 400, spool untouched). Cost is derived from the spool's
 * price-per-gram when the caller omits it (DESIGN §4 jobs table).
 * @param data Canonical fields from `validateCreateJob`.
 * @returns `ok` with the created job, `not-found`, or `issues` (→ 400).
 */
export const createJob = (data: CreateJobData): JobMutationResult => {
  return db.transaction((tx) => {
    const spool = spoolQueries.findSpoolById(tx, data.spoolId);
    if (!spool) return { status: "not-found" as const };

    if (data.projectId !== null && !jobQueries.findProjectId(tx, data.projectId)) {
      return {
        status: "issues" as const,
        issues: [{ field: "projectId", message: "projectId does not reference an existing project" }],
      };
    }

    if (spool.usedMg + data.filamentUsedMg > spool.initialWeightMg) {
      return { status: "issues" as const, issues: [overDraftIssue(spool)] };
    }

    const now = new Date().toISOString();
    // Derive at most when the caller omits cost; the spool's initial weight is
    // always > 0 (validator), so this division is safe.
    const costCents =
      data.costCents ?? Math.round((data.filamentUsedMg * spool.costCents) / spool.initialWeightMg);

    spoolQueries.updateSpoolById(tx, spool.id, { usedMg: spool.usedMg + data.filamentUsedMg, updatedAt: now });

    const row: JobRow = {
      id: crypto.randomUUID(),
      name: data.name,
      spoolId: spool.id,
      projectId: data.projectId,
      filamentUsedMg: data.filamentUsedMg,
      costCents,
      date: data.date ?? now,
      createdAt: now,
      updatedAt: now,
    };
    jobQueries.insertJob(tx, row);

    // Re-read through the same transaction handle, so the write is visible.
    return { status: "ok" as const, job: jobQueries.findJobById(tx, row.id)! };
  });
};

/**
 * Apply a partial, validated edit to a job, rebalancing its spool.
 *
 * The filament change rebalances transactionally (DESIGN §4 invariant table):
 * `delta = newMg − oldMg`, and an over-draft (`usedMg + delta >
 * initialWeightMg`) returns `issues` with the spool untouched. A non-null
 * `projectId` must reference an existing project.
 * @param id Job id.
 * @param data Canonical partial from `validateEditJob` (only fields present).
 * @returns `ok` with the updated job, `not-found`, or `issues` (→ 400).
 */
export const editJob = (id: string, data: EditJobData): JobMutationResult => {
  return db.transaction((tx) => {
    const job = jobQueries.findJobById(tx, id);
    if (!job) return { status: "not-found" as const };

    // FK guarantees the spool exists while the job row does.
    const spool = spoolQueries.findSpoolById(tx, job.spoolId);
    if (!spool) return { status: "not-found" as const };

    const delta = data.filamentUsedMg !== undefined ? data.filamentUsedMg - job.filamentUsedMg : 0;

    if (delta > 0 && delta > spool.leftMg) {
      return { status: "issues" as const, issues: [overDraftIssue(spool)] };
    }

    if (data.projectId !== undefined && data.projectId !== null && !jobQueries.findProjectId(tx, data.projectId)) {
      return {
        status: "issues" as const,
        issues: [{ field: "projectId", message: "projectId does not reference an existing project" }],
      };
    }

    const now = new Date().toISOString();

    // Only touch the spool when the filament amount actually changed.
    if (delta !== 0) {
      spoolQueries.updateSpoolById(tx, spool.id, { usedMg: spool.usedMg + delta, updatedAt: now });
    }

    const changes: Partial<JobRow> = { updatedAt: now };
    if (data.name !== undefined) changes.name = data.name;
    if (data.filamentUsedMg !== undefined) changes.filamentUsedMg = data.filamentUsedMg;
    if (data.costCents !== undefined) changes.costCents = data.costCents;
    if (data.projectId !== undefined) changes.projectId = data.projectId;

    if (Object.keys(changes).length > 1) {
      jobQueries.updateJobById(tx, id, changes);
    }

    return { status: "ok" as const, job: jobQueries.findJobById(tx, id)! };
  });
};

/**
 * Delete a job and credit its spool back in one transaction (DESIGN §4
 * invariant table: `usedMg −= amt` · delete job).
 * @param id Job id.
 * @returns `ok` when deleted, or `not-found`.
 */
export const deleteJob = (id: string): JobDeleteResult => {
  return db.transaction((tx) => {
    const job = jobQueries.findJobById(tx, id);
    if (!job) return { status: "not-found" as const };

    // FK guarantees the spool exists while the job row does.
    const spool = spoolQueries.findSpoolById(tx, job.spoolId);
    if (!spool) return { status: "not-found" as const };

    spoolQueries.updateSpoolById(tx, spool.id, {
      usedMg: spool.usedMg - job.filamentUsedMg,
      updatedAt: new Date().toISOString(),
    });
    jobQueries.deleteJobById(tx, id);

    return { status: "ok" as const };
  });
};
