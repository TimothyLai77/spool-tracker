import { Router, type Response } from "express";
import {
  commitStagedJob,
  createStagedJob,
  deleteStagedJob,
  listStagedJobs,
} from "../logic/stagedJobs.js";
import {
  validateCommitStagedJob,
  validateCreateStagedJob,
} from "../validate/stagedJob.js";

/**
 * Staged-job routes (DESIGN.md §5, §6).
 *
 * Routes are thin: parse → `validateX()` → `logic/stagedJobs.ts` → status map.
 * No validation logic and no SQL here. Error shapes follow the API
 * convention: 400 `{ "error", "issues" }`, 404 `{ "error" }`, 500 only for
 * real server errors.
 */

/** Router mounted at `/api` in `index.ts`. */
export const stagedJobsRouter = Router();

/**
 * Map a 400-class failure (validation issues or an over-draft commit) to the
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
    console.error("staged job route failure:", err);
    res.status(500).json({ error: "internal server error" });
    return RUN_FAILED;
  }
};

/** GET /api/stagedJobs — all staged jobs, most recent first. */
stagedJobsRouter.get("/stagedJobs", (_req, res) => {
  const result = run(res, () => listStagedJobs());
  if (result === RUN_FAILED) return;
  res.json(result);
});

/** POST /api/stagedJobs — manual entry (201). Grams optional (blank = unknown). */
stagedJobsRouter.post("/stagedJobs", (req, res) => {
  const validated = validateCreateStagedJob(req.body);
  if (validated.data === undefined) {
    res.status(400).json(badRequest(validated.issues));
    return;
  }
  const result = run(res, () => createStagedJob(validated.data!));
  if (result === RUN_FAILED) return;
  res.status(201).json(result.staged);
});

/** DELETE /api/stagedJobs/:id — 204. No spool involved (it was never debited). */
stagedJobsRouter.delete("/stagedJobs/:id", (req, res) => {
  const result = run(res, () => deleteStagedJob(req.params.id));
  if (result === RUN_FAILED) return;
  if (result.status === "not-found") {
    res.status(404).json({ error: "staged job not found" });
    return;
  }
  res.status(204).end();
});

/**
 * POST /api/stagedJobs/:id/commit — create the real job under `spoolId` and
 * delete the staged row in one transaction; 200 with the created job.
 * Over-draft / bad project / missing spool → 400 (or 404), staged row kept.
 */
stagedJobsRouter.post("/stagedJobs/:id/commit", (req, res) => {
  const validated = validateCommitStagedJob(req.body);
  if (validated.data === undefined) {
    res.status(400).json(badRequest(validated.issues));
    return;
  }
  const result = run(res, () => commitStagedJob(req.params.id, validated.data!));
  if (result === RUN_FAILED) return;
  if (result.status === "not-found") {
    res.status(404).json({ error: "staged job or spool not found" });
    return;
  }
  if (result.status === "issues") {
    res.status(400).json(badRequest(result.issues));
    return;
  }
  res.json(result.job);
});
