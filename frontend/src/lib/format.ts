import dayjs from "dayjs";
import {
  centsToCurrency,
  currencySymbol as currencySymbolFor,
} from "@shared/units";

/**
 * Display-layer unit formatting (DESIGN.md §4: DB stores mg/cents, the UI
 * shows grams/currency; ui-plan §6: mono font, right-aligned in tables).
 */

/** Display currency from the root .env (injected by vite.config.ts). */
const CURRENCY: string = import.meta.env.CURRENCY ?? "USD";

/**
 * Format milligrams as grams for display: whole grams have no decimal,
 * fractional grams one decimal (`750000 → "750 g"`, `40250 → "40.3 g"`).
 * @param mg Weight in integer milligrams.
 * @returns The display string, e.g. `712 g`.
 */
export const formatGrams = (mg: number): string => {
  const grams = mg / 1000;
  const rounded = Math.round(grams * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} g`;
};

/**
 * Format integer cents as currency for display, using the configured
 * display currency (root .env `CURRENCY`, default USD).
 * @param cents Amount in integer cents.
 * @returns The display string, e.g. `"$12.99"`.
 */
export const formatCents = (cents: number): string =>
  centsToCurrency(cents, CURRENCY);

/**
 * Currency symbol for the configured display currency, for input labels.
 * @returns The symbol, e.g. `"$"` (USD, CAD).
 */
export const currencySymbol = (): string => currencySymbolFor(CURRENCY);

/**
 * Format an ISO-8601 UTC timestamp as a plain date.
 * @param iso ISO-8601 string.
 * @returns `YYYY-MM-DD`.
 */
export const formatDate = (iso: string): string => dayjs(iso).format("YYYY-MM-DD");
