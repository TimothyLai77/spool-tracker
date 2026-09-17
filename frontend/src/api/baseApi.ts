import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/**
 * Shared RTK Query base (DESIGN.md §7).
 *
 * All five feature slices (spools, jobs, projects, stagedJobs, printers)
 * `injectEndpoints` into this one base, so cross-feature invalidation is a
 * single declaration — e.g. committing a staged job invalidates `StagedJob`
 * + `Job` + `Spool` + `Project` from one place.
 *
 * `fetchBaseQuery('/api')` — same-origin: the Vite proxy in dev, Express
 * serving both in prod (no CORS).
 */
export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["Spool", "Job", "StagedJob", "Project", "SpoolAttributes"],
  endpoints: () => ({}),
});
