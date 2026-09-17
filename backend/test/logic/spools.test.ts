import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import { jobs, spools } from "../../src/db/schema.js";
import type { CreateSpoolData } from "../../src/validate/spool.js";
import {
  createSpool,
  deleteSpool,
  editSpool,
  finishSpool,
  getSpool,
  getSpoolAttributes,
  listSpools,
} from "../../src/logic/spools.js";
import { setupFreshDb } from "../utils/freshDb.js";

/**
 * Logic tests for spools against a fresh in-memory database (DESIGN.md §4, §9).
 *
 * Covers CRUD + derived wire fields, and the balance invariant: an spool
 * edit that would set `initialWeightMg` below its `usedMg` is rejected with
 * `issues` (the route maps that to a 400) and leaves the spool untouched.
 */
setupFreshDb();

/**
 * A known-good create payload.
 * @param overrides Fields to replace on the base payload.
 * @returns The combined payload.
 */
const makeCreateData = (overrides: Partial<CreateSpoolData> = {}): CreateSpoolData => ({
  name: "Test spool",
  brand: "esun",
  material: "PLA",
  colour: "black",
  colourHex: "#1a1a1a",
  finish: null,
  initialWeightMg: 750_000,
  costCents: 1299,
  notes: null,
  ...overrides,
});

/**
 * Seed a job row directly (job logic lands in T6) so a spool carries usage.
 * Keeps the spool's `usedMg` in lockstep with the job, as the invariant
 * requires.
 * @param spoolId The spool the job belongs to.
 * @param usedMg Filament consumed by the job.
 */
const seedJob = (spoolId: string, usedMg: number): void => {
  const now = new Date().toISOString();
  db.insert(jobs)
    .values({
      id: crypto.randomUUID(),
      name: "seeded job",
      spoolId,
      projectId: null,
      filamentUsedMg: usedMg,
      costCents: 0,
      date: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.update(spools).set({ usedMg }).where(eq(spools.id, spoolId)).run();
};

describe("createSpool", () => {
  it("creates a spool with canonical defaults and derived fields", () => {
    const spool = createSpool(makeCreateData());

    expect(spool.id).toBeTypeOf("string");
    expect(spool.usedMg).toBe(0);
    expect(spool.leftMg).toBe(750_000); // derived: initial − used
    expect(spool.jobCount).toBe(0); // derived: count of jobs
    expect(spool.isFinished).toBe(false);
    expect(spool.name).toBe("Test spool");
  });
});

describe("getSpool / listSpools", () => {
  it("returns undefined for an unknown id", () => {
    expect(getSpool("nope")).toBeUndefined();
  });

  it("lists spools newest-first with derived fields", () => {
    const first = createSpool(makeCreateData({ name: "first" }));
    const second = createSpool(makeCreateData({ name: "second" }));
    seedJob(first.id, 40_000);

    const list = listSpools();

    expect(list.map((s) => s.id)).toEqual([second.id, first.id]);
    const listedFirst = list.find((s) => s.id === first.id);
    expect(listedFirst?.leftMg).toBe(710_000);
    expect(listedFirst?.jobCount).toBe(1);
  });
});

describe("editSpool", () => {
  it("applies a partial edit and keeps untouched fields", () => {
    const spool = createSpool(makeCreateData());

    const result = editSpool(spool.id, { name: "Renamed" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.spool.name).toBe("Renamed");
    expect(result.spool.brand).toBe("esun"); // untouched
    expect(getSpool(spool.id)?.name).toBe("Renamed");
  });

  it("returns not-found for an unknown id", () => {
    expect(editSpool("nope", { name: "x" })).toEqual({ status: "not-found" });
  });

  it("raises the initial weight above usedMg fine", () => {
    const spool = createSpool(makeCreateData());
    seedJob(spool.id, 40_000); // usedMg = 40 000

    const result = editSpool(spool.id, { initialWeightMg: 1_000_000 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.spool.initialWeightMg).toBe(1_000_000);
    expect(result.spool.leftMg).toBe(960_000); // derived recomputed
  });

  it("rejects an over-draft edit (initial < used) with issues and leaves the spool untouched", () => {
    const spool = createSpool(makeCreateData()); // 750 000 initial
    seedJob(spool.id, 400_000); // usedMg = 400 000

    const result = editSpool(spool.id, { initialWeightMg: 300_000 });

    expect(result.status).toBe("issues");
    if (result.status !== "issues") return;
    expect(result.issues[0]?.field).toBe("initialWeightGrams");

    const after = getSpool(spool.id);
    expect(after?.initialWeightMg).toBe(750_000); // spool untouched
    expect(after?.usedMg).toBe(400_000);
  });

  it("allows editing initial weight down to exactly usedMg (equal is legal)", () => {
    const spool = createSpool(makeCreateData());
    seedJob(spool.id, 400_000);

    const result = editSpool(spool.id, { initialWeightMg: 400_000 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.spool.leftMg).toBe(0);
  });
});

describe("finishSpool", () => {
  it("sets isFinished to true", () => {
    const spool = createSpool(makeCreateData());

    const result = finishSpool(spool.id);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.spool.isFinished).toBe(true);
    expect(getSpool(spool.id)?.isFinished).toBe(true);
  });

  it("returns not-found for an unknown id", () => {
    expect(finishSpool("nope")).toEqual({ status: "not-found" });
  });
});

describe("deleteSpool", () => {
  it("deletes the spool and cascades its jobs", () => {
    const spool = createSpool(makeCreateData());
    seedJob(spool.id, 10_000);

    expect(deleteSpool(spool.id)).toEqual({ status: "ok" });
    expect(getSpool(spool.id)).toBeUndefined();

    const jobRows = db.select().from(jobs).where(eq(jobs.spoolId, spool.id)).all();
    expect(jobRows).toHaveLength(0);
  });

  it("returns not-found for an unknown id", () => {
    expect(deleteSpool("nope")).toEqual({ status: "not-found" });
  });
});

describe("getSpoolAttributes", () => {
  beforeEach(() => {
    // Stored values are canonical (validators normalize them); the distinct
    // pass must de-dup repeated values across spools.
    createSpool(makeCreateData({ brand: "esun", material: "PLA", colour: "black", finish: "satin" }));
    createSpool(makeCreateData({ brand: "prusa", material: "PLA", colour: "black", finish: null }));
    createSpool(makeCreateData({ brand: "esun", material: "PETG", colour: "white" }));
  });

  it("returns sorted distinct values and excludes null finishes", () => {
    const attrs = getSpoolAttributes();

    expect(attrs.brands).toEqual(["esun", "prusa"]);
    expect(attrs.materials).toEqual(["PETG", "PLA"]);
    expect(attrs.colours).toEqual(["black", "white"]);
    expect(attrs.finishes).toEqual(["satin"]);
  });
});

describe("derived fields on an empty shelf", () => {
  it("listSpools and getSpoolAttributes return empty results", () => {
    expect(listSpools()).toEqual([]);
    expect(getSpoolAttributes()).toEqual({
      brands: [],
      materials: [],
      colours: [],
      finishes: [],
    });
  });
});
