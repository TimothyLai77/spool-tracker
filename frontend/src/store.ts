import { configureStore } from "@reduxjs/toolkit";

/**
 * Redux store. The five RTK Query api slices (spools, jobs, projects,
 * stagedJobs, printers) are added here in phase 3+ as they land.
 */
export const store = configureStore({
  reducer: {},
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
