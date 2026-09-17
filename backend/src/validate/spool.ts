import { type ValidateResult, type ApiIssue } from "@shared/api.js";
import { normBrand, normColour, normFinish, normMaterial } from "@shared/normalize.js";
import { costToCents, gramsToMg } from "@shared/units.js";

/**
 * Spool input validation (DESIGN.md §4, §5, §6).
 *
 * Hand-written per DESIGN: one `validateX()` per entity, no zod. Each
 * validator returns `{ data }` (normalized + unit-converted, ready for the DB)
 * or `{ issues }` (per-field 400 details) — it never throws for expected bad
 * input.
 *
 * String normalization (brand lower, material upper, colour/finish lower)
 * happens *here*, inside the validator, so it cannot be bypassed by a route
 * (DESIGN §4: "stored data is canonical").
 */

/** The validated, normalized + unit-converted data for a new spool. */
export interface CreateSpoolData {
  name: string;
  brand: string;
  material: string;
  colour: string;
  colourHex: string | null;
  finish: string | null;
  initialWeightMg: number;
  costCents: number;
  notes: string | null;
}

/** The validated, partial data for a spool edit (only fields present). */
export interface EditSpoolData {
  name?: string;
  brand?: string;
  material?: string;
  colour?: string;
  colourHex?: string | null;
  finish?: string | null;
  initialWeightMg?: number;
  costCents?: number;
  notes?: string | null;
}

/**
 * A `#rrggbb` hex colour, e.g. `#1a2b3c`. Optional on the input.
 */
const COLOUR_HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Check that a value is a finite number (JSON can deliver anything, and
 * `typeof 42 === "number"` is true for `NaN` too).
 * @param value The value to check.
 * @returns True when it is a finite number.
 */
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Check that a value is a string.
 * @param value The value to check.
 * @returns True when it is a string.
 */
const isString = (value: unknown): value is string => typeof value === "string";

/**
 * Require a non-empty string field (after trim) and return its trimmed form.
 * @param body The raw request body.
 * @param field The field name (used both to look up and to report).
 * @param issues Accumulator for problems found so far.
 * @returns The trimmed value, or `undefined` when the field is invalid.
 */
const requiredTrimmedString = (
  body: Record<string, unknown>,
  field: string,
  issues: ApiIssue[],
): string | undefined => {
  const value = body[field];
  if (value === undefined) {
    issues.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (!isString(value) || value.trim() === "") {
    issues.push({ field, message: `${field} must be a non-empty string` });
    return undefined;
  }
  return value.trim();
}

/**
 * Validate a `POST /api/spools` body.
 * Normalizes brand/material/colour/finish and converts grams → mg and
 * currency → cents, so the returned data is exactly the row to insert
 * (minus id, usedMg, isFinished, timestamps).
 * @param body Raw JSON body of the request.
 * @returns `{ data }` with the canonical row fields, or `{ issues }` for a 400.
 */
export const validateCreateSpool = (
  body: unknown,
): ValidateResult<CreateSpoolData> => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { data: undefined, issues: [{ field: "", message: "body must be an object" }] };
  }
  const record = body as Record<string, unknown>;
  const issues: ApiIssue[] = [];

  const name = requiredTrimmedString(record, "name", issues);
  const brand = requiredTrimmedString(record, "brand", issues);
  const material = requiredTrimmedString(record, "material", issues);
  const colour = requiredTrimmedString(record, "colour", issues);

  let colourHex: string | null = null;
  if (record.colourHex !== undefined) {
    if (!isString(record.colourHex) || !COLOUR_HEX_RE.test(record.colourHex)) {
      issues.push({ field: "colourHex", message: "colourHex must be #rrggbb" });
    } else {
      colourHex = record.colourHex;
    }
  }

  let finish: string | null = null;
  if (record.finish !== undefined) {
    if (!isString(record.finish)) {
      issues.push({ field: "finish", message: "finish must be a string" });
    } else {
      finish = normFinish(record.finish);
    }
  }

  let initialWeightMg: number | undefined;
  if (record.initialWeightGrams === undefined) {
    issues.push({ field: "initialWeightGrams", message: "initialWeightGrams is required" });
  } else if (!isFiniteNumber(record.initialWeightGrams) || record.initialWeightGrams <= 0) {
    issues.push({ field: "initialWeightGrams", message: "initialWeightGrams must be a number greater than 0" });
  } else {
    initialWeightMg = gramsToMg(record.initialWeightGrams);
  }

  // Cost may be 0 (free spool) but not negative; job cost derivation only
  // divides by initialWeightMg, which is already constrained > 0.
  let costCents: number | undefined;
  if (record.cost === undefined) {
    issues.push({ field: "cost", message: "cost is required" });
  } else if (!isFiniteNumber(record.cost) || record.cost < 0) {
    issues.push({ field: "cost", message: "cost must be a number of 0 or more" });
  } else {
    costCents = costToCents(record.cost);
  }

  let notes: string | null = null;
  if (record.notes !== undefined) {
    if (!isString(record.notes)) {
      issues.push({ field: "notes", message: "notes must be a string" });
    } else {
      notes = record.notes;
    }
  }

  if (issues.length > 0) {
    return { data: undefined, issues };
  }

  return {
    data: {
      name: name as string,
      brand: normBrand(brand as string),
      material: normMaterial(material as string),
      colour: normColour(colour as string),
      colourHex,
      finish,
      initialWeightMg: initialWeightMg as number,
      costCents: costCents as number,
      notes,
    },
    issues: undefined,
  };
};

/**
 * Validate a `PATCH /api/spools/:id` body. Every field is optional; only the
 * fields present are checked. The result contains just the canonical values
 * for the provided fields — safe to spread into an update statement.
 *
 * Balance note: the `usedMg ≤ new initialWeightMg` bound check is NOT done
 * here (it needs the current spool row) — `logic/spools.ts` enforces it.
 * @param body Raw JSON body of the request.
 * @returns `{ data }` with the canonical values for provided fields, or `{ issues }`.
 */
export const validateEditSpool = (body: unknown): ValidateResult<EditSpoolData> => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { data: undefined, issues: [{ field: "", message: "body must be an object" }] };
  }
  const record = body as Record<string, unknown>;
  const issues: ApiIssue[] = [];
  const data: EditSpoolData = {};

  if (record.name !== undefined) {
    const value = requiredTrimmedString(record, "name", issues);
    if (value !== undefined) data.name = value;
  }

  if (record.brand !== undefined) {
    const value = requiredTrimmedString(record, "brand", issues);
    if (value !== undefined) data.brand = normBrand(value);
  }

  if (record.material !== undefined) {
    const value = requiredTrimmedString(record, "material", issues);
    if (value !== undefined) data.material = normMaterial(value);
  }

  if (record.colour !== undefined) {
    const value = requiredTrimmedString(record, "colour", issues);
    if (value !== undefined) data.colour = normColour(value);
  }

  if (record.colourHex !== undefined) {
    if (record.colourHex === null) {
      data.colourHex = null;
    } else if (!isString(record.colourHex) || !COLOUR_HEX_RE.test(record.colourHex)) {
      issues.push({ field: "colourHex", message: "colourHex must be #rrggbb" });
    } else {
      data.colourHex = record.colourHex;
    }
  }

  if (record.finish !== undefined) {
    if (record.finish === null) {
      data.finish = null;
    } else if (!isString(record.finish)) {
      issues.push({ field: "finish", message: "finish must be a string" });
    } else {
      data.finish = normFinish(record.finish);
    }
  }

  if (record.initialWeightGrams !== undefined) {
    if (!isFiniteNumber(record.initialWeightGrams) || record.initialWeightGrams <= 0) {
      issues.push({ field: "initialWeightGrams", message: "initialWeightGrams must be a number greater than 0" });
    } else {
      data.initialWeightMg = gramsToMg(record.initialWeightGrams);
    }
  }

  if (record.cost !== undefined) {
    if (!isFiniteNumber(record.cost) || record.cost < 0) {
      issues.push({ field: "cost", message: "cost must be a number of 0 or more" });
    } else {
      data.costCents = costToCents(record.cost);
    }
  }

  if (record.notes !== undefined) {
    if (record.notes === null) {
      data.notes = null;
    } else if (!isString(record.notes)) {
      issues.push({ field: "notes", message: "notes must be a string" });
    } else {
      data.notes = record.notes;
    }
  }

  if (issues.length > 0) {
    return { data: undefined, issues };
  }

  return { data, issues: undefined };
};
