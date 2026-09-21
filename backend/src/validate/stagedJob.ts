import { type ValidateResult, type ApiIssue } from "@shared/api.js";
import { costToCents, gramsToMg } from "@shared/units.js";

/**
 * Staged-job input validation (DESIGN.md §4, §5, §6).
 *
 * Hand-written per DESIGN: one `validateX()` per entity, no zod. Each
 * validator returns `{ data }` (unit-converted, ready for the DB) or
 * `{ issues }` (per-field 400 details) — it never throws for expected bad
 * input.
 *
 * Existence checks (spool/project ids on commit) are deliberately NOT done
 * here — they need the database and live in `logic/stagedJobs.ts`, where the
 * commit transaction enforces the balance invariant.
 */

/** The validated data for a manually entered staged job. */
export interface CreateStagedJobData {
  name: string;
  /** Filament in milligrams, or null when the user doesn't know it. */
  filamentUsedMg: number | null;
  /** Print date, ISO-8601 UTC (required — a manual entry has a known date). */
  date: string;
}

/** The validated data for committing a staged job to a spool. */
export interface CommitStagedJobData {
  spoolId: string;
  /** Filament in milligrams (always > 0 — commit requires a known amount). */
  filamentUsedMg: number;
  /** Cost in cents; null when omitted (logic derives it from the spool). */
  costCents: number | null;
  /** Grouping project, or null for a personal print. */
  projectId: string | null;
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
 * Validate a `POST /api/stagedJobs` body (manual entry).
 * Converts grams → mg. `filamentUsedGrams` is optional — a manual entry can
 * leave it blank (the user fills it in at commit time); `date` is required.
 * @param body Raw JSON body of the request.
 * @returns `{ data }` with the canonical row fields, or `{ issues }` for a 400.
 */
export const validateCreateStagedJob = (
  body: unknown
): ValidateResult<CreateStagedJobData> => {
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

  // Optional by design: the same column carries printer-detected jobs whose
  // gcode header had no parseable grams. `null` means "unknown for now".
  let filamentUsedMg: number | null = null;
  if (record.filamentUsedGrams !== undefined) {
    if (!isFiniteNumber(record.filamentUsedGrams) || record.filamentUsedGrams <= 0) {
      issues.push({
        field: "filamentUsedGrams",
        message: "filamentUsedGrams must be a number greater than 0",
      });
    } else {
      filamentUsedMg = gramsToMg(record.filamentUsedGrams);
    }
  }

  let date: string | undefined;
  if (!isParseableDate(record.date)) {
    issues.push({ field: "date", message: "date must be an ISO-8601 date string" });
  } else {
    date = record.date;
  }

  if (issues.length > 0) {
    return { data: undefined, issues };
  }

  return {
    data: { name: name as string, filamentUsedMg, date: date as string },
    issues: undefined,
  };
};

/**
 * Validate a `POST /api/stagedJobs/:id/commit` body. Converts grams → mg and
 * currency → cents. The committed job's name and date come from the staged
 * row, so this body carries no `name`/`date` — only where it goes (spool,
 * optional project) and how much it used.
 *
 * Balance note: the over-draft check is NOT done here (it needs the current
 * spool row) — `logic/stagedJobs.ts` enforces it transactionally.
 * @param body Raw JSON body of the request.
 * @returns `{ data }` with the canonical commit fields, or `{ issues }`.
 */
export const validateCommitStagedJob = (
  body: unknown
): ValidateResult<CommitStagedJobData> => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { data: undefined, issues: [{ field: "", message: "body must be an object" }] };
  }
  const record = body as Record<string, unknown>;
  const issues: ApiIssue[] = [];

  let spoolId: string | undefined;
  if (!isString(record.spoolId) || record.spoolId.trim() === "") {
    issues.push({ field: "spoolId", message: "spoolId must be a non-empty string" });
  } else {
    spoolId = record.spoolId.trim();
  }

  // Commit always needs a known amount: the job is the permanent record, and
  // zero grams is not a print (same rule as job create, DESIGN §4).
  let filamentUsedMg: number | undefined;
  if (!isFiniteNumber(record.filamentUsedGrams) || record.filamentUsedGrams <= 0) {
    issues.push({
      field: "filamentUsedGrams",
      message: "filamentUsedGrams is required and must be a number greater than 0",
    });
  } else {
    filamentUsedMg = gramsToMg(record.filamentUsedGrams);
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
      spoolId: spoolId as string,
      filamentUsedMg: filamentUsedMg as number,
      costCents,
      projectId,
    },
    issues: undefined,
  };
};
