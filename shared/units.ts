/**
 * Unit conversion helpers (DESIGN.md §4, §8).
 *
 * The database stores filament in integer **milligrams** and money in integer
 * **cents**; the API accepts the human-facing units **grams** and **currency
 * units**, and the display layer converts back. Rounding happens here so the
 * rest of the codebase only ever sees integers.
 */

/**
 * Convert grams to integer milligrams, rounding half-up.
 * @param grams Weight in grams (may be fractional, e.g. `40.25`).
 * @returns Weight in integer milligrams (`40250`).
 */
export const gramsToMg = (grams: number): number => Math.round(grams * 1000);

/**
 * Convert integer milligrams to grams.
 * @param mg Weight in integer milligrams.
 * @returns Weight in grams (`40250 → 40.25`).
 */
export const mgToGrams = (mg: number): number => mg / 1000;

/**
 * Convert integer cents to a currency string for display.
 * Uses a fixed locale/currency so rendering is stable across machines;
 * change `locale`/`currency` here if the app's currency ever needs to.
 * @param cents Amount in integer cents.
 * @returns Formatted currency string, e.g. `12.99 → "$12.99"`.
 */
export const centsToCurrency = (cents: number): string =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );

/**
 * Convert a currency-amount input (e.g. `12.99`) to integer cents.
 * @param cost Amount in currency units (may be fractional).
 * @returns Amount in integer cents (`1299`).
 */
export const costToCents = (cost: number): number => Math.round(cost * 100);
