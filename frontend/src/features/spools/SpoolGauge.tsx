import { Box } from "@mantine/core";
import type { Spool } from "@shared/types";

/**
 * The spool gauge — the app's signature element (ui-plan §3).
 *
 * A vertical filament-spool silhouette: a rounded track with thin "hub"
 * flanges top and bottom, filled from the bottom with the spool's
 * `colourHex`. The spool's own colour is what lights up the UI; the chrome
 * around it stays quiet.
 *
 * States:
 * - normal   → swatch fill
 * - low      → fill unchanged, *caller* turns the caption yellow (level here)
 * - empty    → track empty, caption red, reads "empty"
 * - finished → desaturated track, caption muted
 */

/** The visual state of a spool's remaining filament. */
export type SpoolLevel = "ok" | "low" | "empty" | "finished";

/**
 * Classify a spool's remaining filament.
 * @param spool The spool wire shape.
 * @returns `finished` when retired; `empty` at 0 g left; `low` under 20 %;
 *   otherwise `ok`.
 */
export const spoolLevel = (spool: Spool): SpoolLevel => {
  if (spool.isFinished) return "finished";
  if (spool.leftMg <= 0) return "empty";
  const fraction = spool.leftMg / spool.initialWeightMg;
  return fraction < 0.2 ? "low" : "ok";
};

/** Caption colour per level (Mantine color names are scheme-aware). */
export const spoolLevelColor = (level: SpoolLevel): string | undefined => {
  switch (level) {
    case "empty":
      return "red";
    case "low":
      return "yellow";
    case "finished":
      return "dimmed";
    default:
      return undefined;
  }
};

/** Gauge geometry per size (px). */
const GAUGE_SIZES = {
  sm: { width: 18, height: 64, hub: 4 },
  lg: { width: 28, height: 120, hub: 5 },
} as const;

export interface SpoolGaugeProps {
  /** The spool to render (initialWeightMg, leftMg, colourHex, isFinished). */
  spool: Spool;
  /** `sm` for cards, `lg` for the detail header. Default `sm`. */
  size?: "sm" | "lg";
}

/**
 * Render the gauge for a spool.
 * @param spool The spool wire shape.
 * @param size `sm` (cards) or `lg` (detail header).
 * @returns The gauge element (track + fill + hub flanges).
 */
const SpoolGauge = ({ spool, size = "sm" }: SpoolGaugeProps) => {
  const geom = size === "lg" ? GAUGE_SIZES.lg : GAUGE_SIZES.sm;
  const level = spoolLevel(spool);
  const fraction =
    spool.initialWeightMg > 0 ? Math.max(0, spool.leftMg) / spool.initialWeightMg : 0;
  const fill = spool.colourHex ?? "var(--mantine-color-teal-6)";

  return (
    <Box
      className="st-gauge"
      style={{ width: geom.width, height: geom.height }}
      role="img"
      aria-label={`${Math.round(fraction * 100)}% filament remaining`}
    >
      <Box className="st-gauge-hub" style={{ height: geom.hub }} />
      <Box
        className="st-gauge-track"
        style={
          level === "finished"
            ? { filter: "saturate(0.25)", opacity: 0.55 }
            : undefined
        }
      >
        <Box
          className="st-gauge-fill"
          style={{ height: `${fraction * 100}%`, backgroundColor: fill }}
        />
      </Box>
      <Box className="st-gauge-hub" style={{ height: geom.hub }} />
    </Box>
  );
};

export default SpoolGauge;
