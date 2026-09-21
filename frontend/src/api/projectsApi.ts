import type {
  CreateProjectInput,
  EditProjectInput,
  Project,
  ProjectDetail,
} from "@shared/types";
import { baseApi } from "./baseApi";

/**
 * Projects RTK Query slice (DESIGN.md §5, §7; T9).
 *
 * Invalidation (DESIGN §7): project mutations invalidate `Project` — that
 * refetches both the list (derived totals) and any open detail. The reverse
 * direction is already covered: `jobsApi` mutations invalidate `Project` too,
 * so a job create/edit/delete/reassign updates project totals live, with no
 * extra wiring here.
 */
export const projectsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** GET /api/projects — all projects with derived totals, alphabetical. */
    listProjects: build.query<Project[], void>({
      query: () => "/projects",
      providesTags: ["Project"],
    }),

    /** GET /api/projects/:id — `{ project, jobs }` envelope. */
    getProject: build.query<ProjectDetail, string>({
      query: (id) => `/projects/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Project", id }],
    }),

    /** POST /api/projects (201) — a fresh project has zero totals. */
    createProject: build.mutation<Project, CreateProjectInput>({
      query: (body) => ({ url: "/projects", method: "POST", body }),
      invalidatesTags: ["Project"],
    }),

    /** PATCH /api/projects/:id — partial edit (name only). */
    editProject: build.mutation<Project, { id: string; body: EditProjectInput }>({
      query: ({ id, body }) => ({
        url: `/projects/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Project"],
    }),

    /** DELETE /api/projects/:id (204) — member jobs are kept, unassigned. */
    deleteProject: build.mutation<void, string>({
      query: (id) => ({ url: `/projects/${id}`, method: "DELETE" }),
      invalidatesTags: ["Project"],
    }),
  }),
});

export const {
  useListProjectsQuery,
  useGetProjectQuery,
  useCreateProjectMutation,
  useEditProjectMutation,
  useDeleteProjectMutation,
} = projectsApi;
