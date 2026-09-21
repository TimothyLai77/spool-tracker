import type { CreateJobInput, EditJobInput, Job } from "@shared/types";
import { baseApi } from "./baseApi";

/**
 * Jobs RTK Query slice (DESIGN.md §5, §7; T7).
 *
 * Invalidation (DESIGN §7): create/edit/delete invalidate `Job` + `Spool`
 * (the spool's derived `leftMg`/`jobCount` change with every job mutation —
 * so the spool detail gauge refetches for free) + `Project` (project totals
 * are SUM/COUNT over member jobs, so any job mutation refreshes them).
 */
export const jobsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * GET /api/jobs — all jobs, or one spool's history with `spoolId`.
     * Newest print first (server-ordered by date desc, createdAt desc).
     */
    listJobs: build.query<Job[], { spoolId?: string }>({
      query: ({ spoolId }) =>
        spoolId ? `/jobs?spoolId=${encodeURIComponent(spoolId)}` : "/jobs",
      providesTags: ["Job"],
    }),

    /**
     * POST /api/jobs (201). Grams at the edge; cost omitted → derived from
     * the spool server-side. Over-draft → 400 with issues, spool untouched.
     */
    createJob: build.mutation<Job, CreateJobInput>({
      query: (body) => ({ url: "/jobs", method: "POST", body }),
      invalidatesTags: ["Job", "Spool", "Project"],
    }),

    /**
     * PATCH /api/jobs/:id — partial edit. Editing `filamentUsedGrams`
     * rebalances the owning spool server-side; over-draft → 400 issues.
     */
    editJob: build.mutation<Job, { id: string; body: EditJobInput }>({
      query: ({ id, body }) => ({
        url: `/jobs/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Job", "Spool", "Project"],
    }),

    /** DELETE /api/jobs/:id (204) — credits the spool back. */
    deleteJob: build.mutation<void, string>({
      query: (id) => ({ url: `/jobs/${id}`, method: "DELETE" }),
      invalidatesTags: ["Job", "Spool", "Project"],
    }),
  }),
});

export const {
  useListJobsQuery,
  useCreateJobMutation,
  useEditJobMutation,
  useDeleteJobMutation,
} = jobsApi;
