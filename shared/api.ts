/**
 * Shared API response/error types (DESIGN.md §5, §8).
 *
 * The 400 shape (`error` + per-field `issues`) is the single validation
 * convention: `issues` feeds Mantine form errors field-by-field, and the
 * hand-written `validateX()` helpers all return the same `ValidateResult`.
 */

/** A single per-field validation problem, mapped onto a form field. */
export interface ApiIssue {
  /** The input field the problem belongs to (e.g. `initialWeightGrams`). */
  field: string;
  /** Human-readable explanation. */
  message: string;
}

/** The `400 { "error", "issues" }` and `404 { "error" }` response body. */
export interface ApiError {
  /** One-line summary of the problem. */
  error: string;
  /** Per-field details, present on 400 validation failures. */
  issues?: ApiIssue[];
}

/**
 * Return type of every `validateX()` helper: either the typed, normalized
 * `data` to use, or the `issues` to send back as a 400. Never throws for
 * expected bad input.
 *
 * @typeParam T The shape of the validated, normalized data.
 */
export type ValidateResult<T> =
  | { data: T; issues: undefined }
  | { data: undefined; issues: ApiIssue[] };
