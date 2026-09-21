import { describe, expect, it } from "vitest";
import { validateCreateProject, validateEditProject } from "../../src/validate/project.js";

/**
 * Validator unit tests for projects (DESIGN.md §9).
 *
 * No database involved — these check the contract: raw request body in,
 * canonical row data out (trimmed), or a per-field issues list ready for a
 * 400 response. Projects have a single field, so the matrix is small.
 */

/** A known-good create body. */
const validCreateBody = { name: "  Prints for Alice " };

describe("validateCreateProject", () => {
  it("accepts a valid body and trims the name", () => {
    const result = validateCreateProject(validCreateBody);

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual({ name: "Prints for Alice" });
  });

  it.each([
    ["null body", null],
    ["array body", [{ name: "x" }]],
    ["string body", "not an object"],
    ["number body", 42],
  ])("rejects a %s", (_label, body) => {
    const result = validateCreateProject(body);

    expect(result.data).toBeUndefined();
    expect(result.issues?.[0]).toEqual({
      field: "",
      message: "body must be an object",
    });
  });

  it.each([
    ["missing name", {}],
    ["empty name", { name: "" }],
    ["whitespace name", { name: "   " }],
    ["non-string name", { name: 42 }],
    ["null name", { name: null }],
  ])("rejects a %s", (_label, body) => {
    const result = validateCreateProject(body);

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      { field: "name", message: "name must be a non-empty string" },
    ]);
  });
});

describe("validateEditProject", () => {
  it("accepts a valid body and trims the name", () => {
    const result = validateEditProject(validCreateBody);

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual({ name: "Prints for Alice" });
  });

  it("accepts an empty body (a no-op edit)", () => {
    const result = validateEditProject({});

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual({});
  });

  it.each([
    ["null body", null],
    ["array body", [{}]],
    ["string body", "not an object"],
    ["number body", 42],
  ])("rejects a %s", (_label, body) => {
    const result = validateEditProject(body);

    expect(result.data).toBeUndefined();
    expect(result.issues?.[0]).toEqual({
      field: "",
      message: "body must be an object",
    });
  });

  it.each([
    ["empty name", { name: "" }],
    ["whitespace name", { name: "   " }],
    ["non-string name", { name: 42 }],
  ])("rejects a %s", (_label, body) => {
    const result = validateEditProject(body);

    expect(result.data).toBeUndefined();
    expect(result.issues).toEqual([
      { field: "name", message: "name must be a non-empty string" },
    ]);
  });
});
