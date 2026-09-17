import type {
  CreateSpoolInput,
  EditSpoolInput,
  Spool,
  SpoolAttributes,
} from "@shared/types";
import { baseApi } from "./baseApi";

/**
 * Spools RTK Query slice (DESIGN.md §5, §7; ui-plan step 3).
 *
 * Invalidation (DESIGN §7): create/edit/delete/finish invalidate `Spool`;
 * create/edit/delete additionally invalidate `SpoolAttributes` (distinct
 * brand/material/colour/finish lists feed the form datalists).
 */
export const spoolsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** GET /api/spools — all spools (derived leftMg/jobCount), newest first. */
    listSpools: build.query<Spool[], void>({
      query: () => "/spools",
      providesTags: ["Spool"],
    }),

    /** GET /api/spools/:id. */
    getSpool: build.query<Spool, string>({
      query: (id) => `/spools/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Spool", id }],
    }),

    /** POST /api/spools (201). */
    createSpool: build.mutation<Spool, CreateSpoolInput>({
      query: (body) => ({ url: "/spools", method: "POST", body }),
      invalidatesTags: ["Spool", "SpoolAttributes"],
    }),

    /** PATCH /api/spools/:id — partial edit (over-draft → 400 issues). */
    editSpool: build.mutation<
      Spool,
      { id: string; body: EditSpoolInput }
    >({
      query: ({ id, body }) => ({
        url: `/spools/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Spool", "SpoolAttributes"],
    }),

    /** DELETE /api/spools/:id (204) — jobs cascade. */
    deleteSpool: build.mutation<void, string>({
      query: (id) => ({ url: `/spools/${id}`, method: "DELETE" }),
      invalidatesTags: ["Spool", "SpoolAttributes"],
    }),

    /** POST /api/spools/:id/finish — manual retirement. */
    finishSpool: build.mutation<Spool, string>({
      query: (id) => ({ url: `/spools/${id}/finish`, method: "POST" }),
      invalidatesTags: ["Spool"],
    }),

    /** GET /api/spool-attributes — distinct values for datalists. */
    spoolAttributes: build.query<SpoolAttributes, void>({
      query: () => "/spool-attributes",
      providesTags: ["SpoolAttributes"],
    }),
  }),
});

export const {
  useListSpoolsQuery,
  useGetSpoolQuery,
  useCreateSpoolMutation,
  useEditSpoolMutation,
  useDeleteSpoolMutation,
  useFinishSpoolMutation,
  useSpoolAttributesQuery,
} = spoolsApi;
