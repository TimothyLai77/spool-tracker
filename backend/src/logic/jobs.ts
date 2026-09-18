import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { jobs, projects, spools } from "../db/schema.js";
import { mgToGrams } from "@shared/units.js";
import type { ApiIssue } from "@shared/api.js";
import type { Job } from "@shared/types.js";
import type { CreateJobData, EditJobData } from "../validate/job.js";

/**
 * Job business logic (DESIGN.md §4, §5, §6).
 *
 * All mutations live here (never in routes). Every job mutation is a single
 * synchronous better-sqlite3 transaction that touches *both* the job and its
 * spool — that is what enforces the balance invariant (DESIGN §4 invariant
 * table):
 *
 *   create: check spool exists · check `usedMg + amt ≤ initialWeightMg` ·
 *           `usedMg += amt` · insert job
 *   edit:   `delta = oldAmt − newAmt` · check bounds · `usedMg += delta` ·
 *           update job
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
 * Select columns for the `Job` wire shape: job row columns plus the joined
 * project name (null when the job is unassigned — the opt-in, DESIGN §4).
 */
const jobWireSelect = {
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
 * Resolve one job to its wire shape (or undefined when it does not exist).
 * @param id Job id.
 * @returns The `Job` wire shape, or undefined.
 */
const getJobWire = (id: string): Job | undefined => {
  const row = db
    .select(jobWireSelect)
    .from(jobs)
    .leftJoin(projects, eq(jobs.projectId, projects.id))
    .where(eq(jobs.id, id))
    .get();
  return row as Job | undefined;
};

/**
 * List jobs, most recent print date first, with the joined `projectName`.
 * @param spoolId When given, only jobs on that spool (the `?spoolId=` filter).
 * @returns The `Job` wire shapes.
 */
export const listJobs = (spoolId?: string): Job[] => {
  const all = db
    .select(jobWireSelect)
    .from(jobs)
    .leftJoin(projects, eq(jobs.projectId, projects.id))
    .orderBy(desc(jobs.date), desc(jobs.createdAt));
  const query = spoolId === undefined ? all : all.where(eq(jobs.spoolId, spoolId));
  return query.all() as Job[];
};

/**
 * Build the 400 issue for an over-draft job amount (DESIGN §4: the spool's
 * initial weight is the hard bound).
 * @param spool The spool the job would draw from.
 * @returns The per-field issue.
 */
const overDraftIssue = (spool: { usedMg: number; initialWeightMg: number }): ApiIssue => {
  const leftMg = spool.initialWeightMg - spool.usedMg;
  return {
    field: "filamentUsedGrams",
    message: `filamentUsedGrams exceeds the ${mgToGrams(leftMg)} g left on the spool`,
  };
};

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
    const spool = tx.select().from(spools).where(eq(spools.id, data.spoolId)).get();
    if (!spool) return { status: "not-found" as const };

    if (data.projectId !== null) {
      const project = tx.select().from(projects).where(eq(projects.id, data.projectId)).get();
      if (!project) {
        return {
          status: "issues" as const,
          issues: [{ field: "projectId", message: "projectId does not reference an existing project" }],
        };
      }
    }

    if (spool.usedMg + data.filamentUsedMg > spool.initialWeightMg) {
      return { status: "issues" as const, issues: [overDraftIssue(spool)] };
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    // Derive at most when the caller omits cost; the spool's initial weight is
    // always > 0 (validator), so this division is safe.
    const costCents =
      data.costCents ?? Math.round((data.filamentUsedMg * spool.costCents) / spool.initialWeightMg);

    tx.update(spools)
      .set({ usedMg: spool.usedMg + data.filamentUsedMg, updatedAt: now })
      .where(eq(spools.id, spool.id))
      .run();
    tx.insert(jobs)
      .values({
        id,
        name: data.name,
        spoolId: spool.id,
        projectId: data.projectId,
        filamentUsedMg: data.filamentUsedMg,
        costCents,
        date: data.date ?? now,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Re-read through the outer `db` handle for the wire shape (same
    // connection, so the transaction's writes are visible).
    return { status: "ok" as const, job: getJobWire(id) as Job };
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
    const job = tx.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) return { status: "not-found" as const };

    // FK guarantees the spool exists while the job row does.
    const spool = tx.select().from(spools).where(eq(spools.id, job.spoolId)).get();
    if (!spool) return { status: "not-found" as const };

    const delta =
      data.filamentUsedMg !== undefined ? data.filamentUsedMg - job.filamentUsedMg : 0;

    if (delta > 0 && spool.usedMg + delta > spool.initialWeightMg) {
      return { status: "issues" as const, issues: [overDraftIssue(spool)] };
    }

    if (data.projectId !== undefined && data.projectId !== null) {
      const project = tx.select().from(projects).where(eq(projects.id, data.projectId)).get();
      if (!project) {
        return {
          status: "issues" as const,
          issues: [{ field: "projectId", message: "projectId does not reference an existing project" }],
        };
      }
    }

    const now = new Date().toISOString();

    // Only touch the spool when the filament amount actually changed.
    if (delta !== 0) {
      tx.update(spools)
        .set({ usedMg: spool.usedMg + delta, updatedAt: now })
        .where(eq(spools.id, spool.id))
        .run();
    }

    const changes: {
      name?: string;
      filamentUsedMg?: number;
      costCents?: number;
      projectId?: string | null;
    } = {};
    if (data.name !== undefined) changes.name = data.name;
    if (data.filamentUsedMg !== undefined) changes.filamentUsedMg = data.filamentUsedMg;
    if (data.costCents !== undefined) changes.costCents = data.costCents;
    if (data.projectId !== undefined) changes.projectId = data.projectId;

    if (Object.keys(changes).length > 0) {
      tx.update(jobs)
        .set({ ...changes, updatedAt: now })
        .where(eq(jobs.id, id))
        .run();
    }

    return { status: "ok" as const, job: getJobWire(id) as Job };
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
    const job = tx.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) return { status: "not-found" as const };

    // FK guarantees the spool exists while the job row does.
    const spool = tx.select().from(spools).where(eq(spools.id, job.spoolId)).get();
    if (!spool) return { status: "not-found" as const };

    const now = new Date().toISOString();
    tx.update(spools)
      .set({ usedMg: spool.usedMg - job.filamentUsedMg, updatedAt: now })
      .where(eq(spools.id, spool.id))
      .run();
    tx.delete(jobs).where(eq(jobs.id, id)).run();

    return { status: "ok" as const };
  });
};
