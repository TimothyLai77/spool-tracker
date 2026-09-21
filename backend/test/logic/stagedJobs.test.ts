import { describe, expect, it } from "vitest";
import { createSpool, getSpool } from "../../src/logic/spools.js";
import { listJobs } from "../../src/logic/jobs.js";
import { createProject } from "../../src/logic/projects.js";
import {
  commitStagedJob,
  createStagedJob,
  deleteStagedJob,
  listStagedJobs,
} from "../../src/logic/stagedJobs.js";
import type { CreateStagedJobData } from "../../src/validate/stagedJob.js";
import { setupFreshDb } from "../utils/freshDb.js";

/**
 * Logic tests for staged jobs against a fresh in-memory database (DESIGN.md
 * §5, §9).
 *
 * The centre of gravity is the commit-transaction test from DESIGN §9: the
 * job is created, the staged row is deleted, and the spool is debited in one
 * shot — and on every failure path the staged row and the spool are left
 * exactly as they were. Spools and jobs come from the real T3/T6 logic — no
 * seeding shims.
 */
setupFreshDb();

/**
 * Seed a standard 750 g spool at $20 (the balance-suite numbers).
 * @param name Spool label.
 * @returns The created spool.
 */
const makeSpool = (name: string) =>
  createSpool({
    name,
    brand: "esun",
    material: "PLA",
    colour: "black",
    colourHex: null,
    finish: null,
    initialWeightMg: 750_000,
    costCents: 2000,
    notes: null,
  });

/**
 * Create a staged job through the real logic.
 * @param overrides Fields to replace on the base payload.
 * @returns The created staged job.
 */
const makeStaged = (overrides: Partial<CreateStagedJobData> = {}) => {
  const result = createStagedJob({
    name: "staged print",
    filamentUsedMg: 40_000,
    date: "2026-02-01T12:00:00.000Z",
    ...overrides,
  });
  return result.staged;
};

describe("createStagedJob", () => {
  it("stores the manual entry with printerId/amsChannel null", () => {
    // Names arrive pre-trimmed — trimming happens in the validator.
    const staged = makeStaged({ name: "Manual print", filamentUsedMg: 12_500 });

    expect(staged.name).toBe("Manual print");
    expect(staged.filamentUsedMg).toBe(12_500);
    expect(staged.date).toBe("2026-02-01T12:00:00.000Z");
    expect(staged.printerId).toBeNull();
    expect(staged.amsChannel).toBeNull();
    expect(staged.createdAt).toBeTypeOf("string");
  });

  it("stores a null filamentUsedMg for unknown-grams entries", () => {
    const staged = makeStaged({ filamentUsedMg: null });

    expect(staged.filamentUsedMg).toBeNull();
  });
});

describe("listStagedJobs", () => {
  it("returns most recent first", async () => {
    const older = makeStaged({ name: "older" });
    // Push the next createdAt into a later millisecond so the ordering is
    // deterministic (the id tiebreaker would otherwise decide).
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = makeStaged({ name: "newer" });

    const list = listStagedJobs();

    expect(list.map((s) => s.id)).toEqual([newer.id, older.id]);
  });
});

describe("deleteStagedJob", () => {
  it("deletes the staged row (no spool involved)", () => {
    const spool = makeSpool("spool");
    const staged = makeStaged();

    expect(deleteStagedJob(staged.id).status).toBe("ok");
    expect(listStagedJobs()).toHaveLength(0);
    // Nothing was ever debited.
    expect(getSpool(spool.id)?.usedMg).toBe(0);
  });

  it("returns not-found for an unknown id", () => {
    expect(deleteStagedJob("nope").status).toBe("not-found");
  });
});

describe("commitStagedJob", () => {
  it("creates the job, deletes the staged row and debits the spool in one shot", () => {
    const spool = makeSpool("spool");
    const staged = makeStaged({ name: "Bracket set", date: "2026-02-01T12:00:00.000Z" });

    const result = commitStagedJob(staged.id, {
      spoolId: spool.id,
      filamentUsedMg: 40_000,
      costCents: null,
      projectId: null,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    // The job inherits the staged row's name and date…
    expect(result.job.name).toBe("Bracket set");
    expect(result.job.spoolId).toBe(spool.id);
    expect(result.job.filamentUsedMg).toBe(40_000);
    expect(result.job.date).toBe("2026-02-01T12:00:00.000Z");
    // …cost is derived from the spool when omitted: 40 g of $20/750 g.
    expect(result.job.costCents).toBe(107);
    // …the staged row is gone…
    expect(listStagedJobs()).toHaveLength(0);
    // …and the spool is debited exactly by the job amount.
    expect(getSpool(spool.id)?.usedMg).toBe(40_000);
  });

  it("uses the commit body's amount (the staged row's is only a pre-fill)", () => {
    const spool = makeSpool("spool");
    const staged = makeStaged({ filamentUsedMg: 40_000 });

    const result = commitStagedJob(staged.id, {
      spoolId: spool.id,
      filamentUsedMg: 55_000,
      costCents: 99,
      projectId: null,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.job.filamentUsedMg).toBe(55_000);
    expect(result.job.costCents).toBe(99);
    expect(getSpool(spool.id)?.usedMg).toBe(55_000);
  });

  it("groups the job under the given project", () => {
    const spool = makeSpool("spool");
    const project = createProject({ name: "client job" });
    const staged = makeStaged();

    const result = commitStagedJob(staged.id, {
      spoolId: spool.id,
      filamentUsedMg: 40_000,
      costCents: null,
      projectId: project.id,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.job.projectId).toBe(project.id);
    expect(result.job.projectName).toBe("client job");
  });

  it("rejects an over-draft commit — staged kept, spool untouched, no job", () => {
    const spool = makeSpool("spool");
    const staged = makeStaged({ name: "too big" });

    // 750 g spool, 800 g ask: 50 g over the full spool.
    const result = commitStagedJob(staged.id, {
      spoolId: spool.id,
      filamentUsedMg: 800_000,
      costCents: null,
      projectId: null,
    });

    expect(result.status).toBe("issues");
    if (result.status !== "issues") return;
    expect(result.issues[0]?.field).toBe("filamentUsedGrams");

    // No half-applied commit: the staged row survives, the spool is exactly
    // as before, and no job was inserted.
    expect(listStagedJobs().map((s) => s.id)).toEqual([staged.id]);
    expect(getSpool(spool.id)?.usedMg).toBe(0);
    expect(listJobs()).toHaveLength(0);
  });

  it("rejects a commit that crosses the balance after earlier jobs", () => {
    const spool = makeSpool("spool");
    // Seed 40 g of existing usage, leaving 710 g.
    const first = makeStaged({ name: "first" });
    expect(
      commitStagedJob(first.id, {
        spoolId: spool.id,
        filamentUsedMg: 40_000,
        costCents: null,
        projectId: null,
      }).status,
    ).toBe("ok");

    const staged = makeStaged({ name: "second" });
    const result = commitStagedJob(staged.id, {
      spoolId: spool.id,
      filamentUsedMg: 720_000, // 40 + 720 > 750
      costCents: null,
      projectId: null,
    });

    expect(result.status).toBe("issues");
    expect(listStagedJobs().map((s) => s.id)).toEqual([staged.id]);
    expect(getSpool(spool.id)?.usedMg).toBe(40_000);
    expect(listJobs()).toHaveLength(1);
  });

  it("returns not-found for an unknown staged id (spool untouched)", () => {
    const spool = makeSpool("spool");

    const result = commitStagedJob("nope", {
      spoolId: spool.id,
      filamentUsedMg: 40_000,
      costCents: null,
      projectId: null,
    });

    expect(result.status).toBe("not-found");
    expect(getSpool(spool.id)?.usedMg).toBe(0);
  });

  it("returns not-found for an unknown spool and keeps the staged row", () => {
    const staged = makeStaged();

    const result = commitStagedJob(staged.id, {
      spoolId: "nope",
      filamentUsedMg: 40_000,
      costCents: null,
      projectId: null,
    });

    expect(result.status).toBe("not-found");
    expect(listStagedJobs().map((s) => s.id)).toEqual([staged.id]);
  });

  it("rejects a commit under an unknown project — staged kept, spool untouched", () => {
    const spool = makeSpool("spool");
    const staged = makeStaged();

    const result = commitStagedJob(staged.id, {
      spoolId: spool.id,
      filamentUsedMg: 40_000,
      costCents: null,
      projectId: "nope",
    });

    expect(result.status).toBe("issues");
    if (result.status !== "issues") return;
    expect(result.issues[0]).toEqual({
      field: "projectId",
      message: "projectId does not reference an existing project",
    });
    expect(listStagedJobs().map((s) => s.id)).toEqual([staged.id]);
    expect(getSpool(spool.id)?.usedMg).toBe(0);
    expect(listJobs()).toHaveLength(0);
  });
});
