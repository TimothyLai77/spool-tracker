/**
 * THROWAWAY (T2): proves the `@shared` path alias resolves from the backend
 * under `tsc --noEmit`. Imports one symbol from each shared module and uses
 * them in a way that would fail type-checking if resolution broke.
 *
 * This file is deleted at the end of T2 — see `.hidden/tasks.md`.
 */
import { Router } from "express";
import { normColour } from "@shared/normalize.js";
import { gramsToMg, centsToCurrency } from "@shared/units.js";
import type { ValidateResult } from "@shared/api.js";
import type { CreateSpoolInput } from "@shared/types.js";

const router = Router();

/**
 * Fake validator used only to exercise the shared types at the type level.
 * @param body Raw request body.
 * @returns A ValidateResult whose data is a normalized CreateSpoolInput.
 */
const validate: (body: unknown) => ValidateResult<CreateSpoolInput> = (body) => {
  const raw = body as Record<string, unknown>;
  return {
    data: {
      name: String(raw.name),
      brand: String(raw.brand),
      material: String(raw.material),
      colour: normColour(String(raw.colour)),
      initialWeightGrams: gramsToMg(Number(raw.initialWeightGrams)) / 1000,
      cost: centsToCurrency(Number(raw.cost)).length > 0 ? Number(raw.cost) : 0,
    },
    issues: undefined,
  };
};

router.get("/_sharedCheck", (_req, res) => {
  res.json({ ok: true, sample: validate({ name: "n", brand: "b", material: "m", colour: "Black", initialWeightGrams: 1, cost: 1 }).data });
});

export default router;
