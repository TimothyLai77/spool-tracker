import type { ApiError, ApiIssue } from "@shared/api";

/**
 * Error extraction for RTK Query responses (ui-plan §6).
 *
 * `fetchBaseQuery` surfaces non-2xx responses as
 * `{ status, data }`, where `data` is the parsed body. The 400 convention is
 * `{ error, issues[] }` — `issues` maps 1:1 onto Mantine form field errors;
 * the 404 body is `{ error }`.
 */

/**
 * The raw error payload of an RTK Query mutation/query failure, if it was an
 * HTTP error with a parsed body.
 * @param error The `error` field of an RTK Query result.
 * @returns The parsed `ApiError` body, or undefined (network/500-class).
 */
export const getApiError = (
  error: unknown,
): ApiError | undefined => {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof (error as { data: unknown }).data === "object" &&
    (error as { data: unknown }).data !== null &&
    "error" in (error as { data: object }).data
  ) {
    return (error as { data: ApiError }).data;
  }
  return undefined;
};

/**
 * Per-field issues from a 400 validation failure, for form field mapping.
 * @param error The `error` field of an RTK Query result.
 * @returns The `issues` array, or undefined when the failure is not a
 *   validation 400 (callers fall back to a generic toast).
 */
export const getApiIssues = (error: unknown): ApiIssue[] | undefined =>
  getApiError(error)?.issues;

/**
 * A one-line message for toasts: the API's `error` string when present,
 * otherwise a generic message (network failure, 500).
 * @param error The `error` field of an RTK Query result.
 * @returns The display message.
 */
export const getErrorMessage = (error: unknown): string =>
  getApiError(error)?.error ?? "Something went wrong — please try again.";
