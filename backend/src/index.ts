import express from "express";
import { lt } from "drizzle-orm";
import { db } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { stagedJobs } from "./db/schema.js";
import { spoolsRouter } from "./routes/spools.js";

/**
 * Parse `STAGED_JOB_TTL_DAYS` (positive number of days, default 3).
 * Fails fast on bad input — this is deploy configuration, not user input.
 */
const parseTtlDays = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(`STAGED_JOB_TTL_DAYS must be a positive number of days, got: ${raw}`);
  }
  return days;
}

/**
 * Staged jobs are ephemeral (TTL via `STAGED_JOB_TTL_DAYS`, default 3 days).
 * Pruned once at startup — replaces the old app's recurring interval (DESIGN.md §6).
 */
const pruneStagedJobs = (): void => {
  const ttlDays = parseTtlDays(process.env.STAGED_JOB_TTL_DAYS, 3);
  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();
  db.delete(stagedJobs).where(lt(stagedJobs.createdAt, cutoff)).run();
}

/**
 * App startup: apply migrations, prune stale staged jobs, then serve.
 * Static client + SPA fallback land here once the frontend build exists.
 */
const createApp = (): express.Express => {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", spoolsRouter);

  return app;
}

runMigrations();
pruneStagedJobs();

const app = createApp();
const port = Number(process.env.APP_PORT ?? process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`spool-tracker backend listening on :${port}`);
});
