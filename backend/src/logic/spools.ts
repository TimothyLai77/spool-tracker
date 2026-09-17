import { count, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { jobs, spools } from "../db/schema.js";
import type { ApiIssue } from "@shared/api.js";
import type { Spool, SpoolAttributes } from "@shared/types.js";
import type { CreateSpoolData, EditSpoolData } from "../validate/spool.js";

/**
 * Spool business logic (DESIGN.md §4, §5, §6).
 *
 * All mutations live here (never in routes). Reads compute the derived wire
 * fields (`leftMg`, `jobCount`) on the fly — they are never stored.
 *
 * The balance invariant: a spool's `initialWeightMg` can never be edited
 * below its `usedMg`. Enforced transactionally in `editSpool` — the check and
 * the write are one synchronous better-sqlite3 transaction, so the spool is
 * either fully updated or fully untouched. Over-draft edits return `issues`
 * (routes map that to a 400), never exceptions.
 */

/** The outcome of a single-spool mutation, mapped to a status by the route. */
export type SpoolMutationResult =
  | { status: "ok"; spool: Spool }
  | { status: "not-found" }
  | { status: "issues"; issues: ApiIssue[] };

/**
 * Attach the derived wire fields to a row. At runtime derrives the amount of filament left in a spool
 * Derive at runtime to prevent messy two truths with storing filamentUsed & filamentLeft
 * @param row The `spools` table row.
 * @param jobCount The number of jobs on the spool.
 * @returns The API `Spool` shape.
 */
const attachDerivedFields = (row: typeof spools.$inferSelect, jobCount: number): Spool => ({
  ...row,
  leftMg: row.initialWeightMg - row.usedMg,
  jobCount,
});

/**
 * Job counts per spool as a `spoolId → count` map. One grouped query instead
 * of one count per spool.
 * @returns A Map of spool id to job count (absent ids have 0 jobs).
 */
const jobCountsBySpool = (): Map<string, number> => {
  const rows = db
    .select({ spoolId: jobs.spoolId, n: count() })
    .from(jobs)
    .groupBy(jobs.spoolId)
    .all();
  return new Map(rows.map((r) => [r.spoolId, r.n]));
};

/**
 * Resolve one spool row to the wire shape (or undefined when absent).
 * @param id Spool id.
 * @returns The `Spool` wire shape, or undefined.
 */
const getSpoolWire = (id: string): Spool | undefined => {
  const row = db.select().from(spools).where(eq(spools.id, id)).get();
  if (!row) return undefined;
  return attachDerivedFields(row, jobCountsBySpool().get(id) ?? 0);
};

/**
 * List all spools (active and finished), most recently created first, with
 * derived `leftMg` and `jobCount`.
 * @returns The `Spool` wire shapes.
 */
export const listSpools = (): Spool[] => {
  const rows = db
    .select()
    .from(spools)
    .orderBy(spools.createdAt)
    .all()
    .reverse(); // SQLite TEXT order is lexicographic; ISO strings sort ascending, so reverse for newest-first
  const counts = jobCountsBySpool();
  return rows.map((row) => attachDerivedFields(row, counts.get(row.id) ?? 0));
};

/**
 * Fetch a single spool by id.
 * @param id Spool id.
 * @returns The `Spool` wire shape, or undefined when it does not exist.
 */
export const getSpool = (id: string): Spool | undefined => getSpoolWire(id);

/**
 * Insert a new spool from validated create data.
 * @param data Canonical row fields from `validateCreateSpool`.
 * @returns The created `Spool` wire shape.
 */
export const createSpool = (data: CreateSpoolData): Spool => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.insert(spools)
    .values({
      id,
      name: data.name,
      brand: data.brand,
      material: data.material,
      colour: data.colour,
      colourHex: data.colourHex,
      finish: data.finish,
      initialWeightMg: data.initialWeightMg,
      usedMg: 0,
      costCents: data.costCents,
      isFinished: false,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getSpoolWire(id) as Spool;
};

/**
 * Apply a partial, validated edit to a spool.
 *
 * Balance-safe (DESIGN §4 invariant table): when the edit changes
 * `initialWeightMg`, the check `usedMg ≤ new initialWeightMg` and the update
 * run in one transaction. An over-draft returns `{ status: "issues" }` and
 * the spool is untouched.
 *
 * @param id Spool id.
 * @param data Canonical partial from `validateEditSpool`.
 * @returns `ok` with the updated spool, `not-found`, or `issues` (→ 400).
 */
export const editSpool = (id: string, data: EditSpoolData): SpoolMutationResult => {
  return db.transaction((tx) => {
    const row = tx.select().from(spools).where(eq(spools.id, id)).get();
    if (!row) return { status: "not-found" as const };

    if (data.initialWeightMg !== undefined && data.initialWeightMg < row.usedMg) {
      return {
        status: "issues" as const,
        issues: [
          {
            field: "initialWeightGrams",
            message: `initialWeightGrams cannot be less than the ${row.usedMg / 1000} g already used`,
          },
        ],
      };
    }

    tx.update(spools)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(spools.id, id))
      .run();

    // Re-read through the outer `db` handle for the derived fields (same
    // connection, so the transaction's write is visible).
    return { status: "ok" as const, spool: getSpoolWire(id) as Spool };
  });
};

/**
 * Mark a spool finished (manual retirement — it may still have filament left).
 * Cannot return `issues` (no user-provided values are involved), hence the
 * narrower outcome type.
 * @param id Spool id.
 * @returns `ok` with the updated spool, or `not-found`.
 */
export const finishSpool = (id: string): Extract<SpoolMutationResult, { status: "ok" | "not-found" }> => {
  const row = db.select().from(spools).where(eq(spools.id, id)).get();
  if (!row) return { status: "not-found" };

  db.update(spools)
    .set({ isFinished: true, updatedAt: new Date().toISOString() })
    .where(eq(spools.id, id))
    .run();

  return { status: "ok", spool: getSpoolWire(id) as Spool };
};

/**
 * Delete a spool; its jobs (and ams_mappings) cascade via FK rules.
 * @param id Spool id.
 * @returns `ok` when deleted, or `not-found`.
 */
export const deleteSpool = (id: string): { status: "ok" } | { status: "not-found" } => {
  const result = db.delete(spools).where(eq(spools.id, id)).run();
  return result.changes > 0 ? { status: "ok" } : { status: "not-found" };
};

/**
 * Distinct stored values for form `<datalist>` suggestions (DESIGN §5).
 * Sorted for stable lists; null finishes excluded.
 * @returns `{ brands, materials, colours, finishes }`.
 */
export const getSpoolAttributes = (): SpoolAttributes => {
  // De-dup in JS: the tables are small (single-user spool shelf), so this is
  // simpler than four separate DISTINCT queries and one pass over the columns.
  const rows = db.select().from(spools).all();
  const unique = (values: (string | null)[]): string[] =>
    [...new Set(values.filter((v): v is string => v !== null))].sort();

  return {
    brands: unique(rows.map((r) => r.brand)),
    materials: unique(rows.map((r) => r.material)),
    colours: unique(rows.map((r) => r.colour)),
    finishes: unique(rows.map((r) => r.finish)),
  };
}
