/**
 * THROWAWAY (T2): proves the `@shared` alias resolves at tsx runtime (the dev
 * path), complementing the `tsc --noEmit` proof in `routes/_sharedCheck.ts`.
 * Deleted at the end of T2.
 */
import { normMaterial } from "@shared/normalize.js";
import { gramsToMg, mgToGrams } from "@shared/units.js";

console.log(
  "tsx runtime @shared OK:",
  gramsToMg(1.5),
  mgToGrams(40250),
  normMaterial(" pla "),
);
