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
 * Pick a display locale for a currency code. CAD gets its natural `en-CA`
 * locale (renders `$12.99`); everything else falls back to a fixed `en-GB`
 * locale so rendering stays stable across machines.
 * @param currency ISO 4217 currency code, e.g. `"CAD"`.
 * @returns The BCP 47 locale tag to format with.
 */
const displayLocale = (currency: string): string =>
  currency === "CAD" ? "en-CA" : "en-GB";

/**
 * Convert integer cents to a currency string for display.
 * @param cents Amount in integer cents.
 * @param currency ISO 4217 currency code, e.g. `"CAD"` (default `"USD"`).
 * @returns Formatted currency string, e.g. `1299 → "$12.99"` (USD),
 *          `1299 → "$12.99"` (CAD, `en-CA`).
 */
export const centsToCurrency = (cents: number, currency: string = "USD"): string =>
  new Intl.NumberFormat(displayLocale(currency), {
    style: "currency",
    currency,
  }).format(cents / 100);

/**
 * Get the currency symbol for display, for use in input labels such as
 * `Cost ($)`. Uses the same locale rules as {@link centsToCurrency}.
 * @param currency ISO 4217 currency code (default `"USD"`).
 * @returns The currency symbol, e.g. `"$"` (USD, CAD) or `"£"` (GBP).
 */
export const currencySymbol = (currency: string = "USD"): string => {
  const parts = new Intl.NumberFormat(displayLocale(currency), {
    style: "currency",
    currency,
  }).formatToParts(1);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
};

/**
 * Convert a currency-amount input (e.g. `12.99`) to integer cents.
 * @param cost Amount in currency units (may be fractional).
 * @returns Amount in integer cents (`1299`).
 */
export const costToCents = (cost: number): number => Math.round(cost * 100);
