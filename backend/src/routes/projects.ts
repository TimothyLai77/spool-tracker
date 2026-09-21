import { Router, type Response } from "express";
import {
  createProject,
  deleteProject,
  editProject,
  getProject,
  listProjects,
} from "../logic/projects.js";
import { validateCreateProject, validateEditProject } from "../validate/project.js";

/**
 * Project routes (DESIGN.md §5, §6).
 *
 * Routes are thin: parse → `validateX()` → `logic/projects.ts` → status map.
 * No validation logic and no SQL here. Error shapes follow the API
 * convention: 400 `{ "error", "issues" }`, 404 `{ "error" }`, 500 only for
 * real server errors.
 */

/** Router mounted at `/api` in `index.ts`. */
export const projectsRouter = Router();

/**
 * Map a 400-class failure (validation issues) to the standard response body.
 * @param issues Per-field problems from the validator.
 * @returns The `{ error, issues }` body.
 */
const badRequest = (issues: { field: string; message: string }[]) => ({
  error: "validation failed",
  issues,
});

/** Sentinel: a 500 has already been sent, so the handler must not respond. */
const RUN_FAILED = Symbol("run-failed");

/**
 * Run a logic-layer call and convert an unexpected throw into a real 500.
 * Uses a sentinel (not `undefined`) because logic functions may legitimately
 * return `undefined` (e.g. "not found"), which must still reach the handler.
 * @param res The Express response (used to send 500 on throw).
 * @param fn The synchronous logic call.
 * @returns The logic result, or `RUN_FAILED` after a 500 has been sent.
 */
const run = <T>(res: Response, fn: () => T): T | typeof RUN_FAILED => {
  try {
    return fn();
  } catch (err) {
    console.error("project route failure:", err);
    res.status(500).json({ error: "internal server error" });
    return RUN_FAILED;
  }
};

/** GET /api/projects — all projects with derived totals, alphabetical. */
projectsRouter.get("/projects", (_req, res) => {
  const result = run(res, () => listProjects());
  if (result === RUN_FAILED) return;
  res.json(result);
});

/** POST /api/projects — create (201); a fresh project has zero totals. */
projectsRouter.post("/projects", (req, res) => {
  const validated = validateCreateProject(req.body);
  if (validated.data === undefined) {
    res.status(400).json(badRequest(validated.issues));
    return;
  }
  const result = run(res, () => createProject(validated.data!));
  if (result === RUN_FAILED) return;
  res.status(201).json(result);
});

/**
 * GET /api/projects/:id — one project with derived totals plus its member
 * jobs (most recent print first). 404 when the project does not exist.
 */
projectsRouter.get("/projects/:id", (req, res) => {
  const result = run(res, () => getProject(req.params.id));
  if (result === RUN_FAILED) return;
  if (result === undefined) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(result);
});

/** PATCH /api/projects/:id — partial edit (name only). */
projectsRouter.patch("/projects/:id", (req, res) => {
  const validated = validateEditProject(req.body);
  if (validated.data === undefined) {
    res.status(400).json(badRequest(validated.issues));
    return;
  }
  const result = run(res, () => editProject(req.params.id, validated.data!));
  if (result === RUN_FAILED) return;
  if (result.status === "not-found") {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(result.project);
});

/** DELETE /api/projects/:id — 204; member jobs are kept (unassigned). */
projectsRouter.delete("/projects/:id", (req, res) => {
  const result = run(res, () => deleteProject(req.params.id));
  if (result === RUN_FAILED) return;
  if (result.status === "not-found") {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.status(204).end();
});
