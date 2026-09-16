import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit configuration.
 *
 * `dialect: "sqlite"` + `schema` point at the Drizzle schema; `generate`
 * diffs it and writes migration SQL into `./drizzle`. Migrations are applied
 * at app boot by `src/db/migrate.ts` — drizzle-kit is never called in prod.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
