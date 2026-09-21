import type {
  CommitStagedJobInput,
  CreateStagedJobInput,
  Job,
  StagedJob,
} from "@shared/types";
import { baseApi } from "./baseApi";

/**
 * Staged jobs RTK Query slice (DESIGN.md §5, §7; T10).
 *
 * Invalidation (DESIGN §7):
 * - create/delete invalidate `StagedJob`.
 * - `commitStagedJob` invalidates the four lists at once — `StagedJob` (the
 *   row is gone), `Job` (the new job), `Spool` (the debit changes
 *   `leftMg`/`jobCount`) and `Project` (totals are derived, so a grouped
 *   commit refreshes them for free).
 *
 * The list hook is called with `pollingInterval: 15_000` (DESIGN §7) so
 * printer-detected entries (T11) appear without a refresh.
 */
export const stagedJobsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** GET /api/stagedJobs — all staged jobs, most recent first. */
    listStagedJobs: build.query<StagedJob[], void>({
      query: () => "/stagedJobs",
      providesTags: ["StagedJob"],
    }),

    /** POST /api/stagedJobs (201) — manual entry; grams optional. */
    createStagedJob: build.mutation<StagedJob, CreateStagedJobInput>({
      query: (body) => ({ url: "/stagedJobs", method: "POST", body }),
      invalidatesTags: ["StagedJob"],
    }),

    /** DELETE /api/stagedJobs/:id (204) — discard; no spool involved. */
    deleteStagedJob: build.mutation<void, string>({
      query: (id) => ({ url: `/stagedJobs/${id}`, method: "DELETE" }),
      invalidatesTags: ["StagedJob"],
    }),

    /**
     * POST /api/stagedJobs/:id/commit — create the job under `spoolId` and
     * delete the staged row in one server-side transaction. The four-list
     * invalidation is the point of RTK Query tags (DESIGN §7).
     */
    commitStagedJob: build.mutation<Job, { id: string; body: CommitStagedJobInput }>({
      query: ({ id, body }) => ({
        url: `/stagedJobs/${id}/commit`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["StagedJob", "Job", "Spool", "Project"],
    }),
  }),
});

export const {
  useListStagedJobsQuery,
  useCreateStagedJobMutation,
  useDeleteStagedJobMutation,
  useCommitStagedJobMutation,
} = stagedJobsApi;
