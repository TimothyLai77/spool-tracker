/**
 * Shared type definitions for spool-tracker (DESIGN.md §8).
 *
 * This is the hand-written single source of truth for the shapes that cross
 * the backend/frontend boundary. It is imported by both apps via the `@shared`
 * path alias.
 *
 * Conventions (DESIGN.md §4):
 * - IDs are `crypto.randomUUID()`, stored and carried as `string`.
 * - Filament is integer **milligrams** (`*Mg`), money is integer **cents**
 *   (`*Cents`). Input types, by contrast, take the human-facing units the API
 *   accepts — **grams** (`*Grams`) and **currency units** — and the backend
 *   converts them at the edge (see `shared/units.ts`).
 * - Timestamps are ISO-8601 UTC strings, formatted client-side.
 * - Derived values are never stored. The "Row" types are what lives in the
 *   database; the API types extend them with the values the backend computes
 *   on read (`leftMg`, `jobCount`, project totals, joined `projectName`).
 */

/* -------------------------------------------------------------------------- */
/* Row types (database columns)                                              */
/* -------------------------------------------------------------------------- */

/**
 * A filament spool, as stored in the `spools` table. `usedMg` is the
 * canonical balance — always the sum of the spool's jobs' `filamentUsedMg`.
 */
export interface SpoolRow {
  id: string;
  /** User-facing label. */
  name: string;
  /** Normalized brand (trimmed + lowercased). */
  brand: string;
  /** Normalized material (uppercased, e.g. `PLA`). */
  material: string;
  /** Normalized colour (lowercased, e.g. `black`). */
  colour: string;
  /** `#rrggbb` swatch, or null when unset. */
  colourHex: string | null;
  /** Normalized finish (lowercased), or null when unset. */
  finish: string | null;
  /** Total filament on the spool in milligrams. */
  initialWeightMg: number;
  /** Canonical balance in milligrams (sum of jobs). */
  usedMg: number;
  /** Total cost of the spool in cents. */
  costCents: number;
  /** Manual "retired" flag — spool put away with some left. */
  isFinished: boolean;
  /** Free-text notes. */
  notes: string | null;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/** A completed print against a spool, as stored in the `jobs` table. */
export interface JobRow {
  id: string;
  /** Print name (from the gcode object name or manual entry). */
  name: string;
  /** Owning spool (`ON DELETE CASCADE`). */
  spoolId: string;
  /**
   * Grouping project, or null for personal prints. `null` is the opt-in that
   * keeps the project feature invisible. `ON DELETE SET NULL`.
   */
  projectId: string | null;
  /** Filament consumed in milligrams. */
  filamentUsedMg: number;
  /** Cost attributable to this job in cents. */
  costCents: number;
  /** Print date, ISO-8601 UTC. */
  date: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/** An optional job grouping, as stored in the `projects` table. */
export interface ProjectRow {
  id: string;
  name: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/**
 * A detected (or manually entered) job awaiting commit to a spool, as stored
 * in the `staged_jobs` table. `filamentUsedMg` is nullable: printer-detected
 * jobs whose gcode header had no parseable grams leave it blank for the user
 * to fill in at commit time.
 */
export interface StagedJobRow {
  id: string;
  name: string;
  /** Filament in milligrams, or null when unparseable. */
  filamentUsedMg: number | null;
  /** Print date, ISO-8601 UTC. */
  date: string;
  /** Printer that detected the job, or null for manual entry. */
  printerId: string | null;
  /** AMS channel the job used (for spool pre-select), or null. */
  amsChannel: number | null;
  /** ISO-8601 UTC — used for TTL pruning. */
  createdAt: string;
}

/** A watched Bambu printer, as stored in the `printers` table (settings). */
export interface PrinterRow {
  id: string;
  /** Label, e.g. `A1`, `H2D`. */
  name: string;
  /** LAN address. */
  ip: string;
  /** Device serial (MQTT topic). */
  serial: string;
  /** 8-digit LAN access code. */
  accessCode: string;
  /** Model code, e.g. `N2S` (A1), `O1D` (H2D/X2D); null when unset. */
  model: string | null;
}

/* -------------------------------------------------------------------------- */
/* API shapes (row + derived / joined values, as sent over the API)         */
/* -------------------------------------------------------------------------- */

/** A spool as returned by the API: row columns plus derived balance fields. */
export interface Spool extends SpoolRow {
  /** `initialWeightMg - usedMg` — never stored. */
  leftMg: number;
  /** `count(jobs)` for this spool — never stored. */
  jobCount: number;
}

/** A job as returned by the API: row columns plus the joined project name. */
export interface Job extends JobRow {
  /** Project name for the `projectName` badge, or null when unassigned. */
  projectName: string | null;
}

/** A project as returned by the API: row columns plus derived totals. */
export interface Project extends ProjectRow {
  /** `SUM(filamentUsedMg)` over member jobs — never stored. */
  totalFilamentMg: number;
  /** `SUM(costCents)` over member jobs — never stored. */
  totalCostCents: number;
  /** `COUNT(jobs)` for this project — never stored. */
  jobCount: number;
  /** ISO date of the newest member job, or null when the project is empty. */
  lastJobDate: string | null;
}

/**
 * The `GET /api/projects/:id` envelope: one project with its derived totals
 * plus its member jobs (server-ordered, most recent print first). The jobs
 * already carry the joined `projectName`.
 */
export interface ProjectDetail {
  project: Project;
  jobs: Job[];
}

/**
 * A staged job over the API. Carries the row columns as-is; there are no
 * derived fields to add at this layer.
 */
export type StagedJob = StagedJobRow;

/** A printer over the API (settings). No derived fields. */
export type Printer = PrinterRow;

/**
 * An AMS channel → spool mapping over the API. Extends the stored triple with
 * the resolved spool name so the UI can render the picker without a second
 * fetch.
 */
export interface AmsMapping {
  printerId: string;
  /** AMS channel (1..n). */
  channel: number;
  spoolId: string;
  /** Resolved spool name for display. */
  spoolName: string | null;
}

/** Distinct spool attributes for form `<datalist>` suggestions. */
export interface SpoolAttributes {
  brands: string[];
  materials: string[];
  colours: string[];
  finishes: string[];
}

/* -------------------------------------------------------------------------- */
/* Input types (request bodies). Grams + currency units, not mg + cents.     */
/* -------------------------------------------------------------------------- */

/** Body for `POST /api/spools`. */
export interface CreateSpoolInput {
  name: string;
  brand: string;
  material: string;
  colour: string;
  /** `#rrggbb`; optional. */
  colourHex?: string;
  /** Optional finish. */
  finish?: string;
  /** Spool size in grams (converted to mg at the edge). */
  initialWeightGrams: number;
  /** Total cost in currency units (converted to cents at the edge). */
  cost: number;
  /** Free-text notes. */
  notes?: string;
}

/**
 * Body for `PATCH /api/spools/:id`. Every field is optional; the validator
 * only checks the fields present. `isFinished` is deliberately absent —
 * retirement goes through `POST /api/spools/:id/finish`.
 */
export type EditSpoolInput = Partial<
  Pick<
    CreateSpoolInput,
    | "name"
    | "brand"
    | "material"
    | "colour"
    | "colourHex"
    | "finish"
    | "initialWeightGrams"
    | "cost"
    | "notes"
  >
>;

/** Body for `POST /api/jobs`. */
export interface CreateJobInput {
  spoolId: string;
  name: string;
  /** Filament used in grams (converted to mg at the edge). */
  filamentUsedGrams: number;
  /** Print date, ISO-8601 UTC; defaults to now when omitted. */
  date?: string;
  /** Cost in currency units; derived from the spool when omitted. */
  cost?: number;
  /** Optional project to group under. */
  projectId?: string;
}

/**
 * Body for `PATCH /api/jobs/:id`. Editing `filamentUsedGrams` rebalances the
 * owning spool; setting `projectId` moves the job between projects (to `null`
 * to unassign).
 */
export interface EditJobInput {
  name?: string;
  filamentUsedGrams?: number;
  cost?: number;
  /** `null` unassigns from the current project. */
  projectId?: string | null;
}

/** Body for `POST /api/projects`. */
export interface CreateProjectInput {
  name: string;
}

/** Body for `PATCH /api/projects/:id`. */
export interface EditProjectInput {
  name: string;
}

/** Body for `POST /api/stagedJobs` (manual entry). */
export interface CreateStagedJobInput {
  name: string;
  /** Filament in grams; optional (left blank when unknown). */
  filamentUsedGrams?: number;
  /** Print date, ISO-8601 UTC. */
  date: string;
}

/**
 * Body for `POST /api/stagedJobs/:id/commit`. Creates the real job under
 * `spoolId` (under `projectId` when given) and deletes the staged job in one
 * transaction.
 */
export interface CommitStagedJobInput {
  spoolId: string;
  /** Filament in grams (converted to mg at the edge). */
  filamentUsedGrams: number;
  /** Cost in currency units; derived from the spool when omitted. */
  cost?: number;
  /** Optional project to group the new job under. */
  projectId?: string;
}

/** Body for `POST /api/printers`. */
export interface CreatePrinterInput {
  name: string;
  ip: string;
  serial: string;
  /** 8-digit LAN access code. */
  accessCode: string;
  /** Model code, e.g. `N2S`, `O1D`; optional. */
  model?: string;
}

/** Body for `PATCH /api/printers/:id`. Every field optional. */
export type EditPrinterInput = Partial<CreatePrinterInput>;

/** Body for `PUT /api/ams-mappings` (upsert). */
export interface AmsMappingInput {
  printerId: string;
  /** AMS channel (1..n). */
  channel: number;
  spoolId: string;
}
