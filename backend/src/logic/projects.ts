import { db } from "../db/client.js";
import * as projectQueries from "../db/queries/projects.js";
import type { Project, ProjectDetail, ProjectRow } from "@shared/types.js";
import type { CreateProjectData, EditProjectData } from "../validate/project.js";

/**
 * Project business logic (DESIGN.md §4, §5, §6).
 *
 * A project is a pure grouping — it owns no balance of its own, so none of
 * these mutations touch a spool and none need a transaction. This module owns
 * the rules (ids, timestamps, the `status` results routes map to HTTP codes,
 * the `ProjectDetail` envelope) and delegates every SQL statement to
 * `db/queries/projects.ts`. The derived totals (`totalFilamentMg`,
 * `totalCostCents`, `jobCount`, `lastJobDate`) are computed on read by the
 * query layer and are never stored (DESIGN §4).
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

/**
 * List all projects with their derived totals, alphabetical by name.
 * @returns The `Project` API shapes.
 */
export const listProjects = (): Project[] => projectQueries.listProjects(db);

/**
 * Fetch one project with its derived totals and its member jobs (most recent
 * print first, matching the job-list order).
 * @param id Project id.
 * @returns `{ project, jobs }`, or undefined when the project does not exist.
 */
export const getProject = (id: string): ProjectDetail | undefined => {
  const project = projectQueries.findProjectById(db, id);
  if (!project) return undefined;

  return { project, jobs: projectQueries.listProjectJobs(db, id) };
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
  const row: ProjectRow = { id, name: data.name, createdAt: now, updatedAt: now };
  projectQueries.insertProject(db, row);

  // A project's totals are derived from its jobs, and a fresh project has
  // none — so they are zeros by definition, no read needed.
  return { ...row, totalFilamentMg: 0, totalCostCents: 0, jobCount: 0, lastJobDate: null };
};

/**
 * Apply a validated edit to a project (only `name`, already validated).
 * A single-row update with no balance impact, so no transaction is needed.
 * @param id Project id.
 * @param data Canonical partial from `validateEditProject`.
 * @returns `ok` with the updated project, or `not-found`.
 */
export const editProject = (id: string, data: EditProjectData): ProjectMutationResult => {
  if (!projectQueries.findProjectById(db, id)) return { status: "not-found" };

  projectQueries.updateProjectById(db, id, { ...data, updatedAt: new Date().toISOString() });

  return { status: "ok", project: projectQueries.findProjectById(db, id)! };
};

/**
 * Delete a project. Its member jobs are kept — `jobs.projectId` is set to
 * null by the `ON DELETE SET NULL` foreign key, and the jobs' spools are
 * untouched (the balance invariant lives in the spool, not the project).
 * @param id Project id.
 * @returns `ok` when deleted, or `not-found`.
 */
export const deleteProject = (id: string): ProjectDeleteResult => {
  return projectQueries.deleteProjectById(db, id) > 0 ? { status: "ok" } : { status: "not-found" };
};
