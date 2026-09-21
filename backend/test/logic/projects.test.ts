import { describe, expect, it } from "vitest";
import { createSpool, getSpool } from "../../src/logic/spools.js";
import { createJob, editJob, listJobs } from "../../src/logic/jobs.js";
import {
  createProject,
  deleteProject,
  editProject,
  getProject,
  listProjects,
} from "../../src/logic/projects.js";
import type { CreateJobData } from "../../src/validate/job.js";
import { setupFreshDb } from "../utils/freshDb.js";

/**
 * Logic tests for projects against a fresh in-memory database (DESIGN.md
 * §4, §9).
 *
 * Covers the derived totals (SUM/COUNT/MAX over member jobs — never stored),
 * and the two behavioural guarantees from DESIGN §9: deleting a project keeps
 * its jobs unassigned (spool balances untouched), and reassigning a job moves
 * its totals between projects. Jobs come from the real T6 job logic — no
 * seeding shims.
 */
setupFreshDb();

/**
 * Seed a standard 750 g spool.
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
    costCents: 1299,
    notes: null,
  });

/**
 * Create a job through the real job logic (spool debited, balance invariant
 * intact).
 * @param spoolId The spool the job draws from.
 * @param overrides Fields to replace on the base payload.
 * @returns The created job.
 */
const makeJob = (spoolId: string, overrides: Partial<CreateJobData> = {}) => {
  const result = createJob({
    name: "job",
    spoolId,
    filamentUsedMg: 40_000,
    date: "2026-01-05T00:00:00.000Z",
    costCents: 70,
    projectId: null,
    ...overrides,
  });
  if (result.status !== "ok") throw new Error(`job creation failed: ${JSON.stringify(result)}`);
  return result.job;
};

/**
 * Create a project through the real logic.
 * @param name Project name.
 * @returns The created project.
 */
const makeProject = (name: string) => createProject({ name });

describe("createProject / listProjects", () => {
  it("creates a project with zero derived totals", () => {
    const project = makeProject("Prints for Alice");

    expect(project.id).toBeTypeOf("string");
    expect(project.name).toBe("Prints for Alice");
    expect(project.totalFilamentMg).toBe(0);
    expect(project.totalCostCents).toBe(0);
    expect(project.jobCount).toBe(0);
    expect(project.lastJobDate).toBeNull();
  });

  it("lists projects alphabetically, with empty projects kept at zero", () => {
    const b = makeProject("beta project");
    const a = makeProject("alpha project");

    const list = listProjects();

    expect(list.map((p) => p.name)).toEqual(["alpha project", "beta project"]);
    for (const project of list) {
      expect(project.totalFilamentMg).toBe(0);
      expect(project.totalCostCents).toBe(0);
      expect(project.jobCount).toBe(0);
      expect(project.lastJobDate).toBeNull();
    }
    expect(list.map((p) => p.id)).toEqual([a.id, b.id]);
  });
});

describe("derived totals", () => {
  it("sums filament, cost and job count across spools; lastJobDate is the newest member job", () => {
    const spoolA = makeSpool("spool A");
    const spoolB = makeSpool("spool B");
    const project = makeProject("client job");

    makeJob(spoolA.id, {
      projectId: project.id,
      filamentUsedMg: 40_000,
      costCents: 70,
      date: "2026-01-02T00:00:00.000Z",
    });
    makeJob(spoolA.id, {
      projectId: project.id,
      filamentUsedMg: 15_000,
      costCents: 25,
      date: "2026-01-05T00:00:00.000Z",
    });
    makeJob(spoolB.id, {
      projectId: project.id,
      filamentUsedMg: 55_000,
      costCents: 105,
      date: "2026-01-01T00:00:00.000Z",
    });

    const listed = listProjects().find((p) => p.id === project.id);

    expect(listed?.totalFilamentMg).toBe(110_000); // 40 + 15 + 55 g
    expect(listed?.totalCostCents).toBe(200); // 70 + 25 + 105 ¢
    expect(listed?.jobCount).toBe(3);
    expect(listed?.lastJobDate).toBe("2026-01-05T00:00:00.000Z");
  });
});

describe("getProject", () => {
  it("returns undefined for an unknown id", () => {
    expect(getProject("nope")).toBeUndefined();
  });

  it("returns the project plus its member jobs, most recent print first", () => {
    const spool = makeSpool("spool");
    const project = makeProject("client job");

    const newer = makeJob(spool.id, {
      projectId: project.id,
      date: "2026-01-05T00:00:00.000Z",
    });
    const older = makeJob(spool.id, {
      projectId: project.id,
      date: "2026-01-01T00:00:00.000Z",
    });
    makeJob(spool.id); // personal print — not a member

    const detail = getProject(project.id);

    expect(detail?.project.id).toBe(project.id);
    expect(detail?.project.jobCount).toBe(2);
    expect(detail?.jobs.map((j) => j.id)).toEqual([newer.id, older.id]);
    for (const job of detail?.jobs ?? []) {
      expect(job.projectId).toBe(project.id);
      expect(job.projectName).toBe("client job");
    }
  });
});

describe("editProject", () => {
  it("renames a project; totals are unaffected by the rename", () => {
    const spool = makeSpool("spool");
    const project = makeProject("old name");
    makeJob(spool.id, { projectId: project.id });

    const result = editProject(project.id, { name: "new name" });
    expect(result.status).toBe("ok");
    const updated = result.status === "ok" ? result.project : undefined;

    expect(updated?.name).toBe("new name");
    expect(updated?.jobCount).toBe(1);
    expect(updated?.totalFilamentMg).toBe(40_000);
  });

  it("returns not-found for an unknown id", () => {
    expect(editProject("nope", { name: "x" }).status).toBe("not-found");
  });
});

describe("deleteProject", () => {
  it("keeps its jobs unassigned and leaves spool balances intact", () => {
    const spoolA = makeSpool("spool A");
    const spoolB = makeSpool("spool B");
    const project = makeProject("client job");

    makeJob(spoolA.id, { projectId: project.id, filamentUsedMg: 40_000 });
    makeJob(spoolB.id, { projectId: project.id, filamentUsedMg: 55_000 });

    expect(deleteProject(project.id).status).toBe("ok");
    expect(getProject(project.id)).toBeUndefined();

    // The jobs survive, now unassigned personal prints…
    const remaining = listJobs();
    expect(remaining).toHaveLength(2);
    for (const job of remaining) {
      expect(job.projectId).toBeNull();
      expect(job.projectName).toBeNull();
    }

    // …and the spool balances are exactly as the invariant requires.
    // Re-read fresh: `createSpool` returns the as-created row, and the job
    // creations debited the stored rows, not that snapshot.
    expect(getSpool(spoolA.id)?.usedMg).toBe(40_000);
    expect(getSpool(spoolB.id)?.usedMg).toBe(55_000);
  });

  it("returns not-found for an unknown id", () => {
    expect(deleteProject("nope").status).toBe("not-found");
  });
});

describe("reassignment", () => {
  it("moving a job between projects moves its totals", () => {
    const spool = makeSpool("spool");
    const projectA = makeProject("project A");
    const projectB = makeProject("project B");

    const job = makeJob(spool.id, { projectId: projectA.id });

    const move = editJob(job.id, { projectId: projectB.id });
    expect(move.status).toBe("ok");

    const [a, b] = [projectA.id, projectB.id].map((id) =>
      listProjects().find((p) => p.id === id),
    );

    expect(a?.jobCount).toBe(0);
    expect(a?.totalFilamentMg).toBe(0);
    expect(a?.totalCostCents).toBe(0);
    expect(a?.lastJobDate).toBeNull();
    expect(b?.jobCount).toBe(1);
    expect(b?.totalFilamentMg).toBe(40_000);
    expect(b?.totalCostCents).toBe(70);
    expect(b?.lastJobDate).toBe("2026-01-05T00:00:00.000Z");

    // The spool balance never moves with a project reassignment.
    expect(getSpool(spool.id)?.usedMg).toBe(40_000);
  });

  it("unassigning a job (projectId null) removes it from the project totals", () => {
    const spool = makeSpool("spool");
    const project = makeProject("client job");

    const job = makeJob(spool.id, { projectId: project.id });

    const move = editJob(job.id, { projectId: null });
    expect(move.status).toBe("ok");

    const listed = listProjects().find((p) => p.id === project.id);
    expect(listed?.jobCount).toBe(0);
    expect(listed?.totalFilamentMg).toBe(0);
    expect(listed?.lastJobDate).toBeNull();
  });
});
