import { describe, expect, it } from "vitest";
import {
  validateCommitStagedJob,
  validateCreateStagedJob,
} from "../../src/validate/stagedJob.js";

/**
 * Validator unit tests for staged jobs (DESIGN.md §9).
 *
 * No database involved — these check the contract: raw request body in,
 * canonical row data out (trimmed, grams → mg, currency → cents), or a
 * per-field issues list ready for a 400 response.
 */

/** A known-good manual-entry body (with grams). */
const validCreateBody = { name: "  Bracket set  ", filamentUsedGrams: 40.25, date: "2026-02-01T12:00:00Z" };

describe("validateCreateStagedJob", () => {
  it("accepts a valid body, trims the name and converts grams to mg", () => {
    const result = validateCreateStagedJob(validCreateBody);

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual({
      name: "Bracket set",
      filamentUsedMg: 40_250,
      date: "2026-02-01T12:00:00Z",
    });
  });

  it("leaves filamentUsedMg null when grams are omitted (unknown for now)", () => {
    const result = validateCreateStagedJob({
      name: "Mystery print",
      date: "2026-02-01T12:00:00Z",
    });

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual({
      name: "Mystery print",
      filamentUsedMg: null,
      date: "2026-02-01T12:00:00Z",
    });
  });

  it.each([
    ["null body", null],
    ["array body", [{ name: "x" }]],
    ["string body", "not an object"],
    ["number body", 42],
  ])("rejects a %s", (_label, body) => {
    const result = validateCreateStagedJob(body);

    expect(result.data).toBeUndefined();
    expect(result.issues?.[0]).toEqual({
      field: "",
      message: "body must be an object",
    });
  });

  it.each([
    ["missing name", { filamentUsedGrams: 1, date: "2026-02-01" }],
    ["empty name", { name: "", filamentUsedGrams: 1, date: "2026-02-01" }],
    ["whitespace name", { name: "   ", date: "2026-02-01" }],
    ["non-string name", { name: 42, date: "2026-02-01" }],
    ["null name", { name: null, date: "2026-02-01" }],
  ])("rejects a %s", (_label, body) => {
    const result = validateCreateStagedJob(body);

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      { field: "name", message: "name must be a non-empty string" },
    ]);
  });

  it.each([
    ["zero grams", 0],
    ["negative grams", -5],
    ["string grams", "40"],
    ["NaN grams", NaN],
    ["null grams (present but null)", null],
  ])("rejects %s", (_label, grams) => {
    const result = validateCreateStagedJob({
      name: "x",
      filamentUsedGrams: grams,
      date: "2026-02-01",
    });

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      { field: "filamentUsedGrams", message: "filamentUsedGrams must be a number greater than 0" },
    ]);
  });

  it.each([
    ["missing date", { name: "x" }],
    ["empty date", { name: "x", date: "" }],
    ["whitespace date", { name: "x", date: "   " }],
    ["unparseable date", { name: "x", date: "not-a-date" }],
    ["non-string date", { name: "x", date: 42 }],
  ])("rejects a %s", (_label, body) => {
    const result = validateCreateStagedJob(body);

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      { field: "date", message: "date must be an ISO-8601 date string" },
    ]);
  });

  it("reports all failing fields at once", () => {
    const result = validateCreateStagedJob({ name: "  ", filamentUsedGrams: -1 });

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      { field: "name", message: "name must be a non-empty string" },
      { field: "filamentUsedGrams", message: "filamentUsedGrams must be a number greater than 0" },
      { field: "date", message: "date must be an ISO-8601 date string" },
    ]);
  });
});

/** A known-good minimal commit body. */
const validCommitBody = { spoolId: "spool-1", filamentUsedGrams: 55 };

describe("validateCommitStagedJob", () => {
  it("accepts a valid body, converts grams to mg, and defaults cost/project to null", () => {
    const result = validateCommitStagedJob(validCommitBody);

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual({
      spoolId: "spool-1",
      filamentUsedMg: 55_000,
      costCents: null,
      projectId: null,
    });
  });

  it("accepts a full body (cost → cents, fractional grams → mg)", () => {
    const result = validateCommitStagedJob({
      spoolId: "  spool-2  ",
      filamentUsedGrams: 12.5,
      cost: 1.23,
      projectId: "project-1",
    });

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual({
      spoolId: "spool-2",
      filamentUsedMg: 12_500,
      costCents: 123,
      projectId: "project-1",
    });
  });

  it.each([
    ["null body", null],
    ["array body", [{ spoolId: "x" }]],
    ["string body", "not an object"],
    ["number body", 42],
  ])("rejects a %s", (_label, body) => {
    const result = validateCommitStagedJob(body);

    expect(result.data).toBeUndefined();
    expect(result.issues?.[0]).toEqual({
      field: "",
      message: "body must be an object",
    });
  });

  it.each([
    ["missing spoolId", { filamentUsedGrams: 1 }],
    ["empty spoolId", { spoolId: "", filamentUsedGrams: 1 }],
    ["whitespace spoolId", { spoolId: "   ", filamentUsedGrams: 1 }],
    ["non-string spoolId", { spoolId: 42, filamentUsedGrams: 1 }],
  ])("rejects a %s", (_label, body) => {
    const result = validateCommitStagedJob(body);

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      { field: "spoolId", message: "spoolId must be a non-empty string" },
    ]);
  });

  // Commit is where the amount becomes permanent — it is always mandatory.
  it.each([
    ["missing grams", { spoolId: "s" }],
    ["zero grams", { spoolId: "s", filamentUsedGrams: 0 }],
    ["negative grams", { spoolId: "s", filamentUsedGrams: -1 }],
    ["string grams", { spoolId: "s", filamentUsedGrams: "55" }],
    ["NaN grams", { spoolId: "s", filamentUsedGrams: NaN }],
  ])("rejects %s", (_label, body) => {
    const result = validateCommitStagedJob(body);

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      {
        field: "filamentUsedGrams",
        message: "filamentUsedGrams is required and must be a number greater than 0",
      },
    ]);
  });

  it.each([
    ["negative cost", -0.5],
    ["string cost", "1.00"],
    ["NaN cost", NaN],
  ])("rejects %s", (_label, cost) => {
    const result = validateCommitStagedJob({ ...validCommitBody, cost });

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      { field: "cost", message: "cost must be a number of 0 or more" },
    ]);
  });

  it.each([
    ["empty projectId", ""],
    ["whitespace projectId", "   "],
    ["non-string projectId", 42],
  ])("rejects %s", (_label, projectId) => {
    const result = validateCommitStagedJob({ ...validCommitBody, projectId });

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      { field: "projectId", message: "projectId must be a non-empty string" },
    ]);
  });

  it("reports all failing fields at once", () => {
    const result = validateCommitStagedJob({ spoolId: "", filamentUsedGrams: 0, cost: -1 });

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      { field: "spoolId", message: "spoolId must be a non-empty string" },
      {
        field: "filamentUsedGrams",
        message: "filamentUsedGrams is required and must be a number greater than 0",
      },
      { field: "cost", message: "cost must be a number of 0 or more" },
    ]);
  });
});
