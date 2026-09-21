import { type ValidateResult, type ApiIssue } from "@shared/api.js";

/**
 * Project input validation (DESIGN.md §4, §5, §6).
 *
 * Hand-written per DESIGN: one `validateX()` per entity, no zod. Each
 * validator returns `{ data }` (ready for the DB) or `{ issues }` (per-field
 * 400 details) — it never throws for expected bad input.
 *
 * A project has a single field, `name`. There are no units to convert and no
 * canonicalization rules (project names are free text, not in the DESIGN §4
 * normalization list), so this validator is just a trimmed non-empty string
 * check on create and a partial variant on edit.
 */

/** The validated data for a new project. */
export interface CreateProjectData {
  name: string;
}

/** The validated, partial data for a project edit (only fields present). */
export interface EditProjectData {
  name?: string;
}

/**
 * Check that a value is a string.
 * @param value The value to check.
 * @returns True when it is a string.
 */
const isString = (value: unknown): value is string => typeof value === "string";

/**
 * Validate a `POST /api/projects` body.
 * @param body Raw JSON body of the request.
 * @returns `{ data }` with the canonical `name`, or `{ issues }` for a 400.
 */
export const validateCreateProject = (body: unknown): ValidateResult<CreateProjectData> => {
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

  if (issues.length > 0) {
    return { data: undefined, issues };
  }

  return { data: { name: name as string }, issues: undefined };
};

/**
 * Validate a `PATCH /api/projects/:id` body. `name` is optional; only the
 * fields present are checked. The result contains just the canonical values
 * for the provided fields — safe to spread into an update statement.
 * @param body Raw JSON body of the request.
 * @returns `{ data }` with the canonical values for provided fields, or `{ issues }`.
 */
export const validateEditProject = (body: unknown): ValidateResult<EditProjectData> => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { data: undefined, issues: [{ field: "", message: "body must be an object" }] };
  }
  const record = body as Record<string, unknown>;
  const issues: ApiIssue[] = [];
  const data: EditProjectData = {};

  if (record.name !== undefined) {
    if (!isString(record.name) || record.name.trim() === "") {
      issues.push({ field: "name", message: "name must be a non-empty string" });
    } else {
      data.name = record.name.trim();
    }
  }

  if (issues.length > 0) {
    return { data: undefined, issues };
  }

  return { data, issues: undefined };
};
