import { describe, expect, it } from "vitest";
import type { CreateSpoolData, EditSpoolData } from "../../src/validate/spool.js";
import { validateCreateSpool, validateEditSpool } from "../../src/validate/spool.js";

/**
 * Validator unit tests for spools (DESIGN.md §9).
 *
 * No database involved — these check the contract: raw request body in,
 * canonical row data out (normalization applied, grams → mg, currency →
 * cents), or a per-field issues list ready for a 400 response.
 */

/** A known-good create body, used as the base for mutation tests. */
const validCreateBody = {
  name: "Shelf spool one",
  brand: "  Prusa Research ",
  material: "pla",
  colour: "Black",
  colourHex: "#1a1a1a",
  finish: "Satin",
  initialWeightGrams: 750,
  cost: 12.99,
  notes: "bought at maker fair",
};

/**
 * Build a valid create body with some fields overridden.
 * @param overrides Fields to replace on the base body.
 * @returns The combined body.
 */
const withCreateOverrides = (overrides: Record<string, unknown>) => ({
  ...validCreateBody,
  ...overrides,
});

describe("validateCreateSpool", () => {
  it("accepts a full valid body and normalizes + converts every field", () => {
    const result = validateCreateSpool(validCreateBody);

    expect(result.issues).toBeUndefined();
    const data = result.data as CreateSpoolData;
    expect(data).toEqual({
      name: "Shelf spool one",
      brand: "prusa research", // lowercased + trimmed
      material: "PLA", // uppercased
      colour: "black", // lowercased
      colourHex: "#1a1a1a",
      finish: "satin", // lowercased
      initialWeightMg: 750_000, // grams → integer mg
      costCents: 1299, // currency → integer cents
      notes: "bought at maker fair",
    });
  });

  it("accepts a minimal body (optional fields default to null / cost 0 allowed)", () => {
    const result = validateCreateSpool(
      withCreateOverrides({
        colourHex: undefined,
        finish: undefined,
        notes: undefined,
        cost: 0,
      }),
    );

    expect(result.issues).toBeUndefined();
    const data = result.data as CreateSpoolData;
    expect(data.colourHex).toBeNull();
    expect(data.finish).toBeNull();
    expect(data.notes).toBeNull();
    expect(data.costCents).toBe(0);
  });

  it.each([
    ["null body", null],
    ["array body", [validCreateBody]],
    ["string body", "not an object"],
    ["number body", 42],
  ])("rejects a %s", (_label, body) => {
    const result = validateCreateSpool(body);

    expect(result.data).toBeUndefined();
    expect(result.issues).toHaveLength(1);
  });

  it("reports every missing required field at once", () => {
    const result = validateCreateSpool({});

    const fields = (result.issues ?? []).map((i) => i.field).sort();
    expect(fields).toEqual(
      ["brand", "colour", "cost", "initialWeightGrams", "material", "name"].sort(),
    );
  });

  it("rejects empty and whitespace-only required strings", () => {
    const result = validateCreateSpool(
      withCreateOverrides({ name: "   ", brand: "" }),
    );

    expect(result.data).toBeUndefined();
    const fields = (result.issues ?? []).map((i) => i.field).sort();
    expect(fields).toEqual(["brand", "name"]);
  });

  it.each([
    ["zero weight", 0],
    ["negative weight", -5],
    ["NaN weight", Number.NaN],
    ["Infinity weight", Number.POSITIVE_INFINITY],
  ])("rejects initialWeightGrams of %s", (_label, weight) => {
    const result = validateCreateSpool(withCreateOverrides({ initialWeightGrams: weight }));

    expect(result.data).toBeUndefined();
    expect(result.issues?.[0]?.field).toBe("initialWeightGrams");
  });

  it.each([
    ["negative cost", -0.01],
    ["NaN cost", Number.NaN],
  ])("rejects cost of %s", (_label, cost) => {
    const result = validateCreateSpool(withCreateOverrides({ cost }));

    expect(result.data).toBeUndefined();
    expect(result.issues?.[0]?.field).toBe("cost");
  });

  it.each(["red", "#abc", "#12345", "1a1a1a", "#1234567"])(
    "rejects colourHex of %s",
    (colourHex) => {
      const result = validateCreateSpool(withCreateOverrides({ colourHex }));

      expect(result.data).toBeUndefined();
      expect(result.issues?.some((i) => i.field === "colourHex")).toBe(true);
    },
  );

  it("rejects a non-string finish / notes", () => {
    const result = validateCreateSpool(
      withCreateOverrides({ finish: 3, notes: 4 }),
    );

    expect(result.data).toBeUndefined();
    const fields = (result.issues ?? []).map((i) => i.field).sort();
    expect(fields).toEqual(["finish", "notes"]);
  });

  it("rounds fractional units (grams half-up to mg, cost to cents)", () => {
    const result = validateCreateSpool(
      withCreateOverrides({ initialWeightGrams: 40.254, cost: 12.345 }),
    );

    const data = result.data as CreateSpoolData;
    expect(data.initialWeightMg).toBe(40_254);
    expect(data.costCents).toBe(1235); // 1234.5 rounds up
  });
});

describe("validateEditSpool", () => {
  it("accepts an empty body as a no-op edit", () => {
    const result = validateEditSpool({});

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual({});
  });

  it("validates only the fields present and normalizes them", () => {
    const result = validateEditSpool({ name: "  Renamed ", brand: "eSUN" });

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual({ name: "Renamed", brand: "esun" });
  });

  it("accepts explicit null for colourHex / finish / notes (clearing a field)", () => {
    const result = validateEditSpool({ colourHex: null, finish: null, notes: null });

    expect(result.issues).toBeUndefined();
    expect(result.data).toEqual({ colourHex: null, finish: null, notes: null });
  });

  it("rejects an over-draft initialWeightGrams at the value level (bounds are checked in logic)", () => {
    const result = validateEditSpool({ initialWeightGrams: 0 });

    expect(result.data).toBeUndefined();
    expect(result.issues?.[0]?.field).toBe("initialWeightGrams");
  });

  it("rejects non-object bodies", () => {
    expect(validateEditSpool(null).data).toBeUndefined();
    expect(validateEditSpool(["x"]).issues).toHaveLength(1);
  });

  it("rejects a negative cost", () => {
    const result = validateEditSpool({ cost: -1 });

    expect(result.data).toBeUndefined();
    expect(result.issues?.[0]?.field).toBe("cost");
  });
});
