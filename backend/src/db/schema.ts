import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema — single source of truth for the SQLite database.
 *
 * Conventions (DESIGN.md §4):
 * - IDs are `crypto.randomUUID()`, stored as TEXT primary keys.
 * - Filament is integer milligrams (`*Mg`), money is integer cents (`*Cents`).
 * - Timestamps are ISO-8601 UTC strings (plain `text`), formatted client-side.
 * - Derived values (leftMg, jobCount, project totals) are never stored.
 */

/**
 * A filament spool. `usedMg` is the canonical balance: always the sum of the
 * spool's jobs' `filamentUsedMg`, kept consistent by the transactional logic
 * in `src/logic/`.
 */
export const spools = sqliteTable("spools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  material: text("material").notNull(),
  colour: text("colour").notNull(),
  colourHex: text("colourHex"),
  finish: text("finish"),
  initialWeightMg: integer("initialWeightMg").notNull(),
  usedMg: integer("usedMg").notNull().default(0),
  costCents: integer("costCents").notNull(),
  // `mode: "boolean"` stores INTEGER but maps boolean ↔ 0/1 at bind time
  // (better-sqlite3 cannot bind booleans).
  isFinished: integer("isFinished", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes"),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

/**
 * An optional grouping of jobs (e.g. prints for a friend). Deleting a project
 * keeps its jobs — `jobs.projectId` is `ON DELETE SET NULL`.
 */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

/**
 * A completed print against a spool. `projectId` is nullable — the opt-in
 * that keeps the project feature invisible for personal prints.
 */
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  spoolId: text("spoolId")
    .notNull()
    .references(() => spools.id, { onDelete: "cascade" }),
  projectId: text("projectId").references(() => projects.id, {
    onDelete: "set null",
  }),
  filamentUsedMg: integer("filamentUsedMg").notNull(),
  costCents: integer("costCents").notNull(),
  date: text("date").notNull(),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
},
  (table) => [
    // `?spoolId=` job history filter + per-spool totals
    index("idx_jobs_spoolId").on(table.spoolId),
    // derived project totals (SUM/COUNT) + cascade lookups
    index("idx_jobs_projectId").on(table.projectId),
  ]
);

/**
 * A job detected from the printer (or entered manually) waiting for a user to
 * commit it to a spool. `filamentUsedMg` is nullable: printer-detected jobs
 * with an unparseable gcode header leave it blank for the user to fill in.
 * Pruned at app startup (3-day TTL). No FK on `printerId` — a deleted printer
 * doesn't destroy history in flight.
 */
export const stagedJobs = sqliteTable("staged_jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  filamentUsedMg: integer("filamentUsedMg"),
  date: text("date").notNull(),
  printerId: text("printerId"),
  amsChannel: integer("amsChannel"),
  createdAt: text("createdAt").notNull(),
});

/** A Bambu printer on the LAN the app watches (settings). */
export const printers = sqliteTable("printers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  serial: text("serial").notNull(),
  accessCode: text("accessCode").notNull(),
  model: text("model"),
});

/**
 * "Channel N on printer X = spool Y" — drives commit pre-select.
 * Composite PK: one mapping per (printer, channel).
 */
export const amsMappings = sqliteTable(
  "ams_mappings",
  {
    printerId: text("printerId")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    channel: integer("channel").notNull(),
    spoolId: text("spoolId")
      .notNull()
      .references(() => spools.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.printerId, table.channel] }),
  ],
);
