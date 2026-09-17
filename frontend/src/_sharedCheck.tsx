/**
 * THROWAWAY (T2): proves the `@shared` alias resolves from the frontend
 * (tsc + Vite). Imports one symbol from each shared module and renders a
 * derived value so a broken import fails the build.
 *
 * This file is deleted at the end of T2 — see `.hidden/tasks.md`.
 */
import { normMaterial } from "@shared/normalize";
import { mgToGrams, costToCents } from "@shared/units";
import type { Spool } from "@shared/types";

/**
 * Render a sample spool's derived values to exercise the shared types.
 * @param props The spool to display.
 * @returns A paragraph of formatted text.
 */
const SharedCheck = ({ spool }: { spool: Spool }) => {
  const remaining = mgToGrams(spool.leftMg);
  const cost = costToCents(12.99);
  return (
    <p>
      {normMaterial(spool.material)} · {remaining} g left · {cost} cents
    </p>
  );
};

export default SharedCheck;
