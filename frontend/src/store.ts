import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "./api/baseApi";

/**
 * Redux store. `baseApi` hosts all five RTK Query slices (spools, jobs,
 * projects, stagedJobs, printers) via `injectEndpoints` — the feature
 * slices register their endpoints, not their own store slices.
 */
export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
