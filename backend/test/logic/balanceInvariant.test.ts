import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import { jobs } from "../../src/db/schema.js";
import { createSpool, getSpool } from "../../src/logic/spools.js";
import { createJob, deleteJob, editJob } from "../../src/logic/jobs.js";
import type { CreateSpoolData } from "../../src/validate/spool.js";
import type { CreateJobData } from "../../src/validate/job.js";
import { setupFreshDb } from "../utils/freshDb.js";

/**
 * The balance-invariant suite from DESIGN.md §9 — the core correctness
 * proof of the app.
 *
 * Every job mutation must keep the spool in lockstep:
 *
 *   spool: 750 g initial
 *   1. create job 40 g   → used 40 g, left 710 g
 *   2. edit job to 55 g  → used 55 g, left 695 g
 *   3. delete job        → used 0 g,  left 750 g
 *   4. create job 800 g  → rejected, spool untouched
 *   5. edit into over-draft → rejected
 *
 * Rejections must leave the spool (and the job table) completely untouched
 * — the transaction rolls back, nothing is half-applied. The steps run
 * sequentially against one fresh in-memory DB inside a single test, exactly
 * as the design specifies.
 */
setupFreshDb();

/**
 * A known-good 750 g spool create payload (the design's test spool).
 * @returns The create payload in milligram/cents units.
 */
const makeSpoolData = (): CreateSpoolData => ({
  name: "Invariant spool",
  brand: "esun",
  material: "PLA",
  colour: "black",
  colourHex: "#1a1a1a",
  finish: null,
  initialWeightMg: 750_000,
  costCents: 1299,
  notes: null,
});

/**
 * A job create payload on the given spool.
 * @param spoolId The spool the job draws from.
 * @param grams Filament used, in grams (converted to mg as the route does).
 * @returns The create payload in milligram/cents units.
 */
const makeJobData = (spoolId: string, grams: number): CreateJobData => ({
  name: `job ${grams} g`,
  spoolId,
  filamentUsedMg: grams * 1000,
  date: null,
  costCents: null,
  projectId: null,
});

/**
 * Count the job rows currently in the database.
 * @returns The number of jobs.
 */
const jobCount = (): number => db.select().from(jobs).all().length;

describe("balance invariant suite (DESIGN §9)", () => {
  it("create → edit → delete keeps the spool in lockstep, and over-drafts are rejected without touching the spool", () => {
    const spool = createSpool(makeSpoolData());

    // ---- 1. create job 40 g → used 40 g, left 710 g
    const created = createJob(makeJobData(spool.id, 40));
    expect(created.status).toBe("ok");
    if (created.status !== "ok") throw new Error("expected create to succeed");
    const job = created.job;
    expect(job.filamentUsedMg).toBe(40_000);
    expect(getSpool(spool.id)?.usedMg).toBe(40_000);
    expect(getSpool(spool.id)?.leftMg).toBe(710_000); // derived: 750 000 − 40 000
    expect(jobCount()).toBe(1);

    // ---- 2. edit job to 55 g → used 55 g, left 695 g
    const edited = editJob(job.id, { filamentUsedMg: 55_000 });
    expect(edited.status).toBe("ok");
    if (edited.status !== "ok") throw new Error("expected edit to succeed");
    expect(edited.job.filamentUsedMg).toBe(55_000);
    expect(getSpool(spool.id)?.usedMg).toBe(55_000);
    expect(getSpool(spool.id)?.leftMg).toBe(695_000);

    // ---- 3. delete job → used 0 g, left 750 g
    const deleted = deleteJob(job.id);
    expect(deleted).toEqual({ status: "ok" });
    expect(jobCount()).toBe(0);
    expect(getSpool(spool.id)?.usedMg).toBe(0);
    expect(getSpool(spool.id)?.leftMg).toBe(750_000);

    // ---- 4. create job 800 g → rejected, spool untouched
    const overDraft = createJob(makeJobData(spool.id, 800));
    expect(overDraft.status).toBe("issues");
    if (overDraft.status !== "issues") throw new Error("expected 800 g create to be rejected");
    expect(overDraft.issues[0]?.field).toBe("filamentUsedGrams");
    // Spool untouched: the rejected create must not debit anything…
    expect(getSpool(spool.id)?.usedMg).toBe(0);
    expect(getSpool(spool.id)?.leftMg).toBe(750_000);
    // …and must not leave a half-inserted job row behind.
    expect(jobCount()).toBe(0);

    // ---- 5. edit a job into over-draft → rejected, spool and job untouched
    const second = createJob(makeJobData(spool.id, 40));
    expect(second.status).toBe("ok");
    if (second.status !== "ok") throw new Error("expected second create to succeed");

    const overDraftEdit = editJob(second.job.id, { filamentUsedMg: 800_000 });
    expect(overDraftEdit.status).toBe("issues");
    if (overDraftEdit.status !== "issues") throw new Error("expected over-draft edit to be rejected");
    expect(overDraftEdit.issues[0]?.field).toBe("filamentUsedGrams");
    // Spool untouched: still debited for the original 40 g only.
    expect(getSpool(spool.id)?.usedMg).toBe(40_000);
    expect(getSpool(spool.id)?.leftMg).toBe(710_000);
    // Job untouched: the failed edit must not have rewritten its amount.
    expect(db.select().from(jobs).where(eq(jobs.id, second.job.id)).get()?.filamentUsedMg).toBe(40_000);
  });

  it("allows a job of exactly the spool's full remaining weight (equal is legal)", () => {
    const spool = createSpool(makeSpoolData());

    const result = createJob(makeJobData(spool.id, 750));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(getSpool(spool.id)?.usedMg).toBe(750_000);
    expect(getSpool(spool.id)?.leftMg).toBe(0);
    // …and any further create on it is an over-draft.
    expect(createJob(makeJobData(spool.id, 1)).status).toBe("issues");
  });

  it("keeps the spool untouched when an over-draft edit is rejected mid-way", () => {
    const spool = createSpool(makeSpoolData());
    createJob(makeJobData(spool.id, 700)); // 50 g left

    // Creating past the remaining 50 g is an over-draft…
    const overDraft = createJob(makeJobData(spool.id, 51));
    expect(overDraft.status).toBe("issues");
    expect(getSpool(spool.id)?.usedMg).toBe(700_000);
    expect(getSpool(spool.id)?.leftMg).toBe(50_000);

    // The boundary itself is legal: exactly the 50 g remaining.
    const atBoundary = createJob(makeJobData(spool.id, 50));
    expect(atBoundary.status).toBe("ok");
    expect(getSpool(spool.id)?.leftMg).toBe(0);
  });
});
