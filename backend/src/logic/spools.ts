import { db } from "../db/client.js";
import * as spoolQueries from "../db/queries/spools.js";
import type { ApiIssue } from "@shared/api.js";
import type { Spool, SpoolAttributes } from "@shared/types.js";
import type { CreateSpoolData, EditSpoolData } from "../validate/spool.js";

/**
 * Spool business logic (DESIGN.md §4, §5, §6).
 *
 * All mutations live here (never in routes). This module owns the rules —
 * transactions, ids, timestamps, the balance invariant, the `status` results
 * routes map to HTTP codes — and delegates every SQL statement to
 * `db/queries/spools.ts`, passing `tx` inside a transaction and `db` outside
 * one. Derived API fields (`leftMg`, `jobCount`) are computed by the query
 * layer on read and are never stored.
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
 * List all spools (active and finished), most recently created first, with
 * derived `leftMg` and `jobCount`.
 * @returns The `Spool` API shapes.
 */
export const listSpools = (): Spool[] => spoolQueries.listSpools(db);

/**
 * Fetch a single spool by id.
 * @param id Spool id.
 * @returns The `Spool` API shape, or undefined when it does not exist.
 */
export const getSpool = (id: string): Spool | undefined => spoolQueries.findSpoolById(db, id);

/**
 * Insert a new spool from validated create data.
 * @param data Canonical row fields from `validateCreateSpool`.
 * @returns The created `Spool` API shape.
 */
export const createSpool = (data: CreateSpoolData): Spool => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  spoolQueries.insertSpool(db, {
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
  });
  return spoolQueries.findSpoolById(db, id)!;
};

/**
 * Apply a partial, validated edit to a spool.
 *
 * Balance-safe (DESIGN §4 invariant table): when the edit changes
 * `initialWeightMg`, the check `usedMg ≤ new initialWeightMg` and the update
 * run in one transaction. An over-draft returns `{ status: "issues" }` and
 * the spool is untouched.
 * @param id Spool id.
 * @param data Canonical partial from `validateEditSpool`.
 * @returns `ok` with the updated spool, `not-found`, or `issues` (→ 400).
 */
export const editSpool = (id: string, data: EditSpoolData): SpoolMutationResult => {
  return db.transaction((tx) => {
    const spool = spoolQueries.findSpoolById(tx, id);
    if (!spool) return { status: "not-found" as const };

    if (data.initialWeightMg !== undefined && data.initialWeightMg < spool.usedMg) {
      return {
        status: "issues" as const,
        issues: [
          {
            field: "initialWeightGrams",
            message: `initialWeightGrams cannot be less than the ${spool.usedMg / 1000} g already used`,
          },
        ],
      };
    }

    spoolQueries.updateSpoolById(tx, id, { ...data, updatedAt: new Date().toISOString() });

    // Re-read through the same transaction handle, so the write is visible and
    // the derived `leftMg` / `jobCount` reflect the post-edit state.
    return { status: "ok" as const, spool: spoolQueries.findSpoolById(tx, id)! };
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
  if (!spoolQueries.findSpoolById(db, id)) return { status: "not-found" };

  spoolQueries.updateSpoolById(db, id, { isFinished: true, updatedAt: new Date().toISOString() });

  return { status: "ok", spool: spoolQueries.findSpoolById(db, id)! };
};

/**
 * Delete a spool; its jobs (and ams_mappings) cascade via FK rules.
 * @param id Spool id.
 * @returns `ok` when deleted, or `not-found`.
 */
export const deleteSpool = (id: string): { status: "ok" } | { status: "not-found" } => {
  return spoolQueries.deleteSpoolById(db, id) > 0 ? { status: "ok" } : { status: "not-found" };
};

/**
 * Distinct stored values for form `<datalist>` suggestions (DESIGN §5).
 * Sorted for stable lists; null finishes excluded.
 * @returns `{ brands, materials, colours, finishes }`.
 */
export const getSpoolAttributes = (): SpoolAttributes => spoolQueries.listSpoolAttributes(db);
