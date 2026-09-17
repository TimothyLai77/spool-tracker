/**
 * String normalization helpers (DESIGN.md §4, §8).
 *
 * Stored data is canonical: these run *inside the backend validators* on
 * create and edit, so "Black" can never coexist with "black" in the database.
 * The frontend reuses them to preview the normalized value in forms.
 */

/**
 * Normalize a filament material: trim, then uppercase (`PLA`).
 * @param material Raw material string from user input.
 * @returns The canonical material string.
 */
export const normMaterial = (material: string): string =>
  material.trim().toUpperCase();

/**
 * Normalize a filament colour: trim, then lowercase (`black`).
 * @param colour Raw colour string from user input.
 * @returns The canonical colour string.
 */
export const normColour = (colour: string): string => colour.trim().toLowerCase();

/**
 * Normalize a filament finish: trim, then lowercase (`satin`).
 * @param finish Raw finish string from user input.
 * @returns The canonical finish string.
 */
export const normFinish = (finish: string): string => finish.trim().toLowerCase();

/**
 * Normalize a filament brand: trim, then lowercase (`prusament`).
 * @param brand Raw brand string from user input.
 * @returns The canonical brand string.
 */
export const normBrand = (brand: string): string => brand.trim().toLowerCase();
