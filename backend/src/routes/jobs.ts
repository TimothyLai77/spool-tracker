import { Router, type Response } from "express";
import {
  createJob,
  deleteJob,
  editJob,
  listJobs,
} from "../logic/jobs.js";
import { validateCreateJob, validateEditJob } from "../validate/job.js";

/**
 * Job routes (DESIGN.md §5, §6).
 *
 * Routes are thin: parse → `validateX()` → `logic/jobs.ts` → status map.
 * No validation logic and no SQL here. Error shapes follow the API
 * convention: 400 `{ "error", "issues" }`, 404 `{ "error" }`, 500 only for
 * real server errors.
 */

/** Router mounted at `/api` in `index.ts`. */
export const jobsRouter = Router();

/**
 * Map a 400-class failure (validation issues or an over-draft job) to the
 * standard response body.
 * @param issues Per-field problems from the validator or the logic layer.
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
    console.error("job route failure:", err);
    res.status(500).json({ error: "internal server error" });
    return RUN_FAILED;
  }
};

/**
 * Pull the optional `?spoolId=` filter out of the query string. Anything that
 * is not a non-empty string is treated as "no filter" rather than a 400 —
 * a job list with a junk filter value is just a list.
 * @param query The Express query object.
 * @returns The spool id, or undefined for the full list.
 */
const spoolIdFilter = (query: Record<string, unknown>): string | undefined => {
  const value = query.spoolId;
  return typeof value === "string" && value !== "" ? value : undefined;
};

/** GET /api/jobs — all jobs (or `?spoolId=` for one spool's history), newest print first. */
jobsRouter.get("/jobs", (req, res) => {
  const result = run(res, () => listJobs(spoolIdFilter(req.query)));
  if (result === RUN_FAILED) return;
  res.json(result);
});

/** POST /api/jobs — create (201); over-draft → 400 with issues, spool untouched. */
jobsRouter.post("/jobs", (req, res) => {
  const validated = validateCreateJob(req.body);
  if (validated.data === undefined) {
    res.status(400).json(badRequest(validated.issues));
    return;
  }
  const result = run(res, () => createJob(validated.data!));
  if (result === RUN_FAILED) return;
  if (result.status === "not-found") {
    res.status(404).json({ error: "spool not found" });
    return;
  }
  if (result.status === "issues") {
    res.status(400).json(badRequest(result.issues));
    return;
  }
  res.status(201).json(result.job);
});

/** PATCH /api/jobs/:id — partial edit; filament edits rebalance the spool, over-draft → 400. */
jobsRouter.patch("/jobs/:id", (req, res) => {
  const validated = validateEditJob(req.body);
  if (validated.data === undefined) {
    res.status(400).json(badRequest(validated.issues));
    return;
  }
  const result = run(res, () => editJob(req.params.id, validated.data!));
  if (result === RUN_FAILED) return;
  if (result.status === "not-found") {
    res.status(404).json({ error: "job not found" });
    return;
  }
  if (result.status === "issues") {
    res.status(400).json(badRequest(result.issues));
    return;
  }
  res.json(result.job);
});

/** DELETE /api/jobs/:id — 204; credits the spool back. */
jobsRouter.delete("/jobs/:id", (req, res) => {
  const result = run(res, () => deleteJob(req.params.id));
  if (result === RUN_FAILED) return;
  if (result.status === "not-found") {
    res.status(404).json({ error: "job not found" });
    return;
  }
  res.status(204).end();
});
