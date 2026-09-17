import { Router, type Response } from "express";
import {
  deleteSpool,
  editSpool,
  finishSpool,
  getSpool,
  getSpoolAttributes,
  listSpools,
  createSpool,
} from "../logic/spools.js";
import { validateCreateSpool, validateEditSpool } from "../validate/spool.js";

/**
 * Spool routes (DESIGN.md §5, §6).
 *
 * Routes are thin: parse → `validateX()` → `logic/spools.ts` → status map.
 * No validation logic and no SQL here. Error shapes follow the API
 * convention: 400 `{ "error", "issues" }`, 404 `{ "error" }`, 500 only for
 * real server errors.
 */

/** Router mounted at `/api` in `index.ts`. */
export const spoolsRouter = Router();

/**
 * Map a 400-class failure (validation issues or an over-draft edit) to the
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
    console.error("spool route failure:", err);
    res.status(500).json({ error: "internal server error" });
    return RUN_FAILED;
  }
};

/** GET /api/spools — all spools with derived leftMg/jobCount. */
spoolsRouter.get("/spools", (_req, res) => {
  const result = run(res, () => listSpools());
  if (result === RUN_FAILED) return;
  res.json(result);
});

/** GET /api/spool-attributes — distinct values for form suggestions. */
spoolsRouter.get("/spool-attributes", (_req, res) => {
  const result = run(res, () => getSpoolAttributes());
  if (result === RUN_FAILED) return;
  res.json(result);
});

/** POST /api/spools — create (201). */
spoolsRouter.post("/spools", (req, res) => {
  const validated = validateCreateSpool(req.body);
  if (validated.data === undefined) {
    res.status(400).json(badRequest(validated.issues));
    return;
  }
  const result = run(res, () => createSpool(validated.data!));
  if (result === RUN_FAILED) return;
  res.status(201).json(result);
});

/** GET /api/spools/:id */
spoolsRouter.get("/spools/:id", (req, res) => {
  const result = run(res, () => getSpool(req.params.id));
  if (result === RUN_FAILED) return;
  if (!result) {
    res.status(404).json({ error: "spool not found" });
    return;
  }
  res.json(result);
});

/** PATCH /api/spools/:id — partial edit; over-draft → 400 with issues. */
spoolsRouter.patch("/spools/:id", (req, res) => {
  const validated = validateEditSpool(req.body);
  if (validated.data === undefined) {
    res.status(400).json(badRequest(validated.issues));
    return;
  }
  const result = run(res, () => editSpool(req.params.id, validated.data!));
  if (result === RUN_FAILED) return;
  if (result.status === "not-found") {
    res.status(404).json({ error: "spool not found" });
    return;
  }
  if (result.status === "issues") {
    res.status(400).json(badRequest(result.issues));
    return;
  }
  res.json(result.spool);
});

/** DELETE /api/spools/:id — 204; jobs cascade via FK. */
spoolsRouter.delete("/spools/:id", (req, res) => {
  const result = run(res, () => deleteSpool(req.params.id));
  if (result === RUN_FAILED) return;
  if (result.status === "not-found") {
    res.status(404).json({ error: "spool not found" });
    return;
  }
  res.status(204).end();
});

/** POST /api/spools/:id/finish — manual retirement. */
spoolsRouter.post("/spools/:id/finish", (req, res) => {
  const result = run(res, () => finishSpool(req.params.id));
  if (result === RUN_FAILED) return;
  if (result.status === "not-found") {
    res.status(404).json({ error: "spool not found" });
    return;
  }
  res.json(result.spool);
});
