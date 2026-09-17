import { createTheme } from "@mantine/core";

/**
 * Spool Tracker theme — implements `.hidden/ui-plan.md` §2 ("quiet workbench").
 *
 * Design intent: chrome stays neutral so the spool `colourHex` swatches carry
 * the colour. Cool grey shell, slate-teal primary, flat surfaces (no shadows),
 * grotesque display type, and a monospace face for all measured numbers.
 *
 * Token map (plan names → Mantine 9 theme slots):
 * - `ink`     → `theme.black` (light-mode text, #1E211F)
 * - `muted`   → `gray[6]` (#6B716C light / #9AA19B dark)
 * - `line`    → `gray[3]`/`gray[4]` (light borders) / `dark[4]` (dark borders)
 * - `bg`      → body background, set per color scheme in `global.css`
 *               (#F4F5F3 light / #161819 dark)
 * - `surface` → `theme.white` (#FFFFFF) in light; dark surfaces sit on the
 *               page with a `dark[4]` border (Mantine 9 papers use the body
 *               color, so dark cards read flat + bordered)
 * - `primary` → custom `teal` palette centred on #3A6670 (flat — Mantine 9
 *               dropped the v7 `{ light, dark }` palette object form)
 */

/**
 * Cool grey scale (replaces Mantine's default `gray`): borders, dimmed text,
 * disabled states, light-mode input surfaces.
 */
const grayPalette = [
  "#F4F5F3", // 0 — matches the light page background
  "#E9EBE8", // 1
  "#E1E4E0", // 2 — `line` (light)
  "#C9CEC9", // 3 — default component borders (light)
  "#A6ACA7", // 4
  "#868D88", // 5
  "#6B716C", // 6 — `muted` (light)
  "#555B57", // 7
  "#3A3F3C", // 8
  "#242826", // 9
] as const;

/**
 * Dark scheme scale (replaces Mantine's default `dark`): text is `dark[0]`,
 * the page background is `dark[7]` (via Mantine's body variable).
 */
const darkPalette = [
  "#F2F4F1", // 0 — dark-mode text
  "#D8DDD8", // 1
  "#B4BAB4", // 2
  "#8F968F", // 3
  "#6E756E", // 4 — dark-mode borders
  "#565C56", // 5
  "#1F2224", // 6 — dark card surface (Mantine cards use `dark-6`)
  "#161819", // 7 — dark page background
  "#101213", // 8
  "#0B0D0E", // 9
] as const;

/**
 * Slate teal. Shade 6 (#3A6670) is the primary — a midpoint between the
 * light-scheme #38626B and the dark-scheme lift #5B8F99 from the plan,
 * holding contrast in both schemes.
 */
const tealPalette = [
  "#EDF3F4", // 0
  "#D5E4E6", // 1
  "#A9C6CA", // 2
  "#7FA8AE", // 3
  "#62929A", // 4
  "#4D7D85", // 5
  "#3A6670", // 6 — `primary`
  "#2F545C", // 7
  "#26434A", // 8
  "#1D3339", // 9
] as const;

export const theme = createTheme({
  primaryColor: "teal",
  // Mantine 9: body text (light) and page background (light) are plain
  // strings on the theme, not palettes.
  black: "#1E211F",
  white: "#FFFFFF",
  colors: {
    gray: grayPalette,
    dark: darkPalette,
    teal: tealPalette,
  },
  fontFamily: "'IBM Plex Sans Variable', -apple-system, 'Segoe UI', sans-serif",
  fontFamilyMonospace: "'IBM Plex Mono', ui-monospace, 'SF Mono', monospace",
  headings: {
    // Display face, used with restraint: page titles and spool names.
    fontFamily: "'Space Grotesk Variable', 'IBM Plex Sans Variable', sans-serif",
  },
  // Flat "workbench" surfaces — borders, not shadows (plan §2).
  shadows: {
    xs: "none",
    sm: "none",
    md: "none",
    lg: "none",
    xl: "none",
  },
});
