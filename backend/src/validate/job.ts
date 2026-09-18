import { type ValidateResult, type ApiIssue } from "@shared/api.js";
import { costToCents, gramsToMg } from "@shared/units.js";

/**
 * Job input validation (DESIGN.md §4, §5, §6).
 *
 * Hand-written per DESIGN: one `validateX()` per entity, no zod. Each
 * validator returns `{ data }` (unit-converted, ready for the DB) or
 * `{ issues }` (per-field 400 details) — it never throws for expected bad
 * input.
 *
 * Existence checks (spool/project ids) are deliberately NOT done here — they
 * need the database and live in `logic/jobs.ts`, where the balance invariant
 * is enforced transactionally.
 */

/** The validated, unit-converted data for a new job. */
export interface CreateJobData {
  name: string;
  spoolId: string;
  /** Filament consumed in milligrams (always > 0 — no zero-gram jobs). */
  filamentUsedMg: number;
  /** Print date, ISO-8601 UTC; null when omitted (logic defaults to now). */
  date: string | null;
  /** Cost in cents; null when omitted (logic derives it from the spool). */
  costCents: number | null;
  /** Grouping project, or null for a personal print. */
  projectId: string | null;
}

/** The validated, partial data for a job edit (only fields present). */
export interface EditJobData {
  name?: string;
  filamentUsedMg?: number;
  costCents?: number;
  /** `null` unassigns from the current project; a string reassigns. */
  projectId?: string | null;
}

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
 * Check that a string is a parseable date (ISO-8601 in practice). Deliberately
 * light — the print date is display metadata, not a key; a garbage date is
 * a 400, not a crash.
 * @param value The value to check.
 * @returns True when it is a non-empty string that parses to a real date.
 */
const isParseableDate = (value: unknown): value is string =>
  isString(value) && value.trim() !== "" && !Number.isNaN(Date.parse(value));

/**
 * Validate a `POST /api/jobs` body.
 * Converts grams → mg and currency → cents. `date` and `cost` may be null in
 * the result — the logic layer resolves the defaults (now / spool-derived).
 * @param body Raw JSON body of the request.
 * @returns `{ data }` with the canonical row fields, or `{ issues }` for a 400.
 */
export const validateCreateJob = (body: unknown): ValidateResult<CreateJobData> => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { data: undefined, issues: [{ field: "", message: "body must be an object" }] };
  }
  const record = body as Record<string, unknown>;
  const issues: ApiIssue[] = [];

  let name: string | undefined;
  if (!isString(record.name) || record.name.trim() === "") {
    issues.push({ field: "name", message: "name must be a non-empty string" });
  } else {
    name = record.name.trim();
  }

  let spoolId: string | undefined;
  if (!isString(record.spoolId) || record.spoolId.trim() === "") {
    issues.push({ field: "spoolId", message: "spoolId must be a non-empty string" });
  } else {
    spoolId = record.spoolId.trim();
  }

  // A job is the record of a print — zero grams is not a print. This keeps
  // the balance-invariant logic free of zero-amount special cases (DESIGN §4).
  let filamentUsedMg: number | undefined;
  if (record.filamentUsedGrams === undefined) {
    issues.push({ field: "filamentUsedGrams", message: "filamentUsedGrams is required" });
  } else if (!isFiniteNumber(record.filamentUsedGrams) || record.filamentUsedGrams <= 0) {
    issues.push({ field: "filamentUsedGrams", message: "filamentUsedGrams must be a number greater than 0" });
  } else {
    filamentUsedMg = gramsToMg(record.filamentUsedGrams);
  }

  let date: string | null = null;
  if (record.date !== undefined) {
    if (!isParseableDate(record.date)) {
      issues.push({ field: "date", message: "date must be an ISO-8601 date string" });
    } else {
      date = record.date;
    }
  }

  let costCents: number | null = null;
  if (record.cost !== undefined) {
    if (!isFiniteNumber(record.cost) || record.cost < 0) {
      issues.push({ field: "cost", message: "cost must be a number of 0 or more" });
    } else {
      costCents = costToCents(record.cost);
    }
  }

  let projectId: string | null = null;
  if (record.projectId !== undefined) {
    if (!isString(record.projectId) || record.projectId.trim() === "") {
      issues.push({ field: "projectId", message: "projectId must be a non-empty string" });
    } else {
      projectId = record.projectId.trim();
    }
  }

  if (issues.length > 0) {
    return { data: undefined, issues };
  }

  return {
    data: {
      name: name as string,
      spoolId: spoolId as string,
      filamentUsedMg: filamentUsedMg as number,
      date,
      costCents,
      projectId,
    },
    issues: undefined,
  };
};

/**
 * Validate a `PATCH /api/jobs/:id` body. Every field is optional; only the
 * fields present are checked. The result contains just the canonical values
 * for the provided fields — safe to spread into an update statement.
 *
 * Balance note: the over-draft check (`usedMg + delta ≤ initialWeightMg`) is
 * NOT done here (it needs the current spool + job rows) — `logic/jobs.ts`
 * enforces it transactionally.
 * @param body Raw JSON body of the request.
 * @returns `{ data }` with the canonical values for provided fields, or `{ issues }`.
 */
export const validateEditJob = (body: unknown): ValidateResult<EditJobData> => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { data: undefined, issues: [{ field: "", message: "body must be an object" }] };
  }
  const record = body as Record<string, unknown>;
  const issues: ApiIssue[] = [];
  const data: EditJobData = {};

  if (record.name !== undefined) {
    if (!isString(record.name) || record.name.trim() === "") {
      issues.push({ field: "name", message: "name must be a non-empty string" });
    } else {
      data.name = record.name.trim();
    }
  }

  if (record.filamentUsedGrams !== undefined) {
    if (!isFiniteNumber(record.filamentUsedGrams) || record.filamentUsedGrams <= 0) {
      issues.push({ field: "filamentUsedGrams", message: "filamentUsedGrams must be a number greater than 0" });
    } else {
      data.filamentUsedMg = gramsToMg(record.filamentUsedGrams);
    }
  }

  if (record.cost !== undefined) {
    if (!isFiniteNumber(record.cost) || record.cost < 0) {
      issues.push({ field: "cost", message: "cost must be a number of 0 or more" });
    } else {
      data.costCents = costToCents(record.cost);
    }
  }

  if (record.projectId !== undefined) {
    if (record.projectId === null) {
      data.projectId = null;
    } else if (!isString(record.projectId) || record.projectId.trim() === "") {
      issues.push({ field: "projectId", message: "projectId must be a non-empty string or null" });
    } else {
      data.projectId = record.projectId.trim();
    }
  }

  if (issues.length > 0) {
    return { data: undefined, issues };
  }

  return { data, issues: undefined };
};
