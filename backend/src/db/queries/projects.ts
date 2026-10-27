import { asc, count, desc, eq, sql } from "drizzle-orm";
import { jobs, projects } from "../schema.js";
import { jobSelect } from "./jobs.js";
import type { DbHandle } from "../handle.js";
import type { Job, Project, ProjectRow } from "@shared/types.js";

/**
 * Project data access — every Drizzle touch-point for the `projects` table.
 *
 * Layer rules (DESIGN.md §6): SQL and nothing else. Each function takes a
 * `DbHandle` (the app db, or an open transaction) as its first argument. The
 * derived totals (`totalFilamentMg`, `totalCostCents`, `jobCount`,
 * `lastJobDate`) are computed in SQL on every read and never stored, so they
 * are part of the selection here and land in the `Project` API shape.
 */

/**
 * `Project` API-shape columns: the row plus the totals over its member jobs,
 * aggregated by the grouped LEFT JOIN.
 *
 * `COALESCE` folds the all-NULL row an empty project's join produces into
 * zeros; `count(jobs.id)` ignores the join's NULL for the same case;
 * `max(date)` stays null when there are no member jobs.
 */
const projectSelect = {
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
 * All projects with their derived totals, alphabetical by name for a stable,
 * scannable list.
 * @param db The database or transaction to read.
 * @returns The `Project` API shapes (`name ASC`).
 */
export const listProjects = (db: DbHandle): Project[] => {
  return db
    .select(projectSelect)
    .from(projects)
    .leftJoin(jobs, eq(jobs.projectId, projects.id))
    .groupBy(projects.id)
    .orderBy(asc(projects.name))
    .all();
};

/**
 * One project with its derived totals.
 * @param db The database or transaction to read.
 * @param id Project id.
 * @returns The `Project` API shape, or undefined when it does not exist.
 */
export const findProjectById = (db: DbHandle, id: string): Project | undefined => {
  return db
    .select(projectSelect)
    .from(projects)
    .leftJoin(jobs, eq(jobs.projectId, projects.id))
    .where(eq(projects.id, id))
    .groupBy(projects.id)
    .get();
};

/**
 * A project's member jobs, most recent print first (matching the job-list
 * order), each carrying the joined `projectName`.
 * @param db The database or transaction to read.
 * @param projectId The project whose jobs to list.
 * @returns The `Job` API shapes (`date DESC`, then `createdAt DESC`).
 */
export const listProjectJobs = (db: DbHandle, projectId: string): Job[] => {
  return db
    .select(jobSelect)
    .from(jobs)
    .leftJoin(projects, eq(jobs.projectId, projects.id))
    .where(eq(jobs.projectId, projectId))
    .orderBy(desc(jobs.date), desc(jobs.createdAt))
    .all();
};

/**
 * Insert a fully-formed project row (id and timestamps supplied by the caller).
 * @param db The database or transaction to write.
 * @param row The complete row to insert.
 * @returns Nothing.
 */
export const insertProject = (db: DbHandle, row: ProjectRow): void => {
  db.insert(projects).values(row).run();
};

/**
 * Apply a partial update to one project.
 * @param db The database or transaction to write.
 * @param id Project id.
 * @param changes Columns to change (never includes the id).
 * @returns The number of rows affected (0 when the id is absent).
 */
export const updateProjectById = (db: DbHandle, id: string, changes: Partial<ProjectRow>): number => {
  return db.update(projects).set(changes).where(eq(projects.id, id)).run().changes;
};

/**
 * Delete one project. Its member jobs are kept — `jobs.projectId` is set to
 * null by the `ON DELETE SET NULL` foreign key.
 * @param db The database or transaction to write.
 * @param id Project id.
 * @returns The number of rows affected (0 when the id is absent).
 */
export const deleteProjectById = (db: DbHandle, id: string): number => {
  return db.delete(projects).where(eq(projects.id, id)).run().changes;
};
