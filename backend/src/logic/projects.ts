import { asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { jobs, projects } from "../db/schema.js";
import type { Job, Project } from "@shared/types.js";
import type { CreateProjectData, EditProjectData } from "../validate/project.js";

/**
 * Project business logic (DESIGN.md §4, §5, §6).
 *
 * A project is a pure grouping — it owns no balance of its own, so none of
 * these mutations touch a spool and none need a transaction. The derived
 * totals (`totalFilamentMg`, `totalCostCents`, `jobCount`, `lastJobDate`)
 * are always computed on read as `SUM` / `COUNT` / `MAX` over the member
 * jobs; they are never stored (DESIGN §4).
 *
 * Deleting a project keeps its jobs: `jobs.projectId` is `ON DELETE SET NULL`
 * (the client enables `foreign_keys = ON`), so the member jobs simply become
 * unassigned personal prints.
 */

/** The outcome of a project mutation, mapped to a status by the route. */
export type ProjectMutationResult =
  | { status: "ok"; project: Project }
  | { status: "not-found" };

/** Outcome of a project delete — 204, so no body to return. */
export type ProjectDeleteResult = { status: "ok" } | { status: "not-found" };

/** A project with its member jobs, for the detail endpoint. */
export interface ProjectDetail {
  project: Project;
  jobs: Job[];
}

/**
 * Column set for the `Project` API shape: the row plus the derived totals,
 * computed in one grouped aggregate over the member jobs. `COALESCE` folds
 * the all-NULL row an empty project's `LEFT JOIN` produces into zeros;
 * `lastJobDate` stays null when there are no jobs.
 */
const projectTotalsSelect = {
  id: projects.id,
  name: projects.name,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  totalFilamentMg: sql<number>`coalesce(sum(${jobs.filamentUsedMg}), 0)`,
  totalCostCents: sql<number>`coalesce(sum(${jobs.costCents}), 0)`,
  jobCount: count(jobs.id),
  lastJobDate: sql<string | null>`max(${jobs.date})`,
};

/**
 * Select columns for a member job's `Job` API shape — the row plus the joined
 * `projectName` (mirrors `logic/jobs.ts`, so lists render the badge without a
 * second fetch).
 */
const jobSelect = {
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
 * List all projects with their derived totals, alphabetical by name for a
 * stable, scannable list.
 * @returns The `Project` API shapes.
 */
export const listProjects = (): Project[] => {
  return db
    .select(projectTotalsSelect)
    .from(projects)
    .leftJoin(jobs, eq(jobs.projectId, projects.id))
    .groupBy(projects.id)
    .orderBy(asc(projects.name))
    .all() as Project[];
};

/**
 * Fetch one project with its derived totals and its member jobs (most recent
 * print first, matching the job-list order).
 * @param id Project id.
 * @returns `{ project, jobs }`, or undefined when the project does not exist.
 */
export const getProject = (id: string): ProjectDetail | undefined => {
  const project = db
    .select(projectTotalsSelect)
    .from(projects)
    .leftJoin(jobs, eq(jobs.projectId, projects.id))
    .where(eq(projects.id, id))
    .groupBy(projects.id)
    .get() as Project | undefined;
  if (!project) return undefined;

  const memberJobs = db
    .select(jobSelect)
    .from(jobs)
    .leftJoin(projects, eq(jobs.projectId, projects.id))
    .where(eq(jobs.projectId, id))
    .orderBy(desc(jobs.date), desc(jobs.createdAt))
    .all() as Job[];

  return { project, jobs: memberJobs };
};

/**
 * Insert a new project from validated create data. A fresh project has no
 * member jobs, so its derived totals are returned directly as zero / null
 * rather than re-reading the aggregate.
 * @param data Canonical row fields from `validateCreateProject`.
 * @returns The created `Project` API shape.
 */
export const createProject = (data: CreateProjectData): Project => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.insert(projects)
    .values({ id, name: data.name, createdAt: now, updatedAt: now })
    .run();
  return {
    id,
    name: data.name,
    createdAt: now,
    updatedAt: now,
    totalFilamentMg: 0,
    totalCostCents: 0,
    jobCount: 0,
    lastJobDate: null,
  };
};

/**
 * Apply a validated edit to a project (only `name`, already validated).
 * A single-row update with no balance impact, so no transaction is needed.
 * @param id Project id.
 * @param data Canonical partial from `validateEditProject`.
 * @returns `ok` with the updated project, or `not-found`.
 */
export const editProject = (id: string, data: EditProjectData): ProjectMutationResult => {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!row) return { status: "not-found" };

  db.update(projects)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(projects.id, id))
    .run();

  const updated = db
    .select(projectTotalsSelect)
    .from(projects)
    .leftJoin(jobs, eq(jobs.projectId, projects.id))
    .where(eq(projects.id, id))
    .groupBy(projects.id)
    .get();

  return { status: "ok", project: updated as Project };
};

/**
 * Delete a project. Its member jobs are kept — `jobs.projectId` is set to
 * null by the `ON DELETE SET NULL` foreign key, and the jobs' spools are
 * untouched (the balance invariant lives in the spool, not the project).
 * @param id Project id.
 * @returns `ok` when deleted, or `not-found`.
 */
export const deleteProject = (id: string): ProjectDeleteResult => {
  const result = db.delete(projects).where(eq(projects.id, id)).run();
  return result.changes > 0 ? { status: "ok" } : { status: "not-found" };
};
