# Icon brief

![Shipped icon: 48 px and 24 px on light and dark surfaces](assets/icon-preview.png)

The shipped plugin icon is a flat vector mark with light depth: a ruler, a
browser-window card, and a wrench rising out of a chat bubble, on a near-black
tile with one lime accent. It says "a set of tools around the conversation".
This page records its specification and how to replace it.

## Where the icon appears

- **Plugins** page: bundle list card and bundle detail header, inside a 48 px
  rounded, hairline-bordered tile.
- Settings → Built-in plugins inventory cards.
- It is rendered as `<img src="data:image/…">`, never inline SVG.

## Hard constraints

| Constraint | Value |
|---|---|
| Format | PNG, WebP, JPEG, or SVG, ≤ 256 KiB, inside the package |
| Canvas | Square; shipped as a `64×64` viewBox SVG (`icon.svg`, about 3 KB) |
| Theme | One file for both themes; all colors baked in, no `currentColor`/CSS variables/external references |
| Surface | Must not rely on a transparent background: the icon carries its own tile so it reads on light and dark pages |
| Content | Glyph optically centered on the tile; no text; the bubble and tools must stay readable at 24 px |

## Specification

The icon shares one system with the DSH Intelligent UI icon (same tile, bubble
shape, palette, and depth treatment), so the two read as a family.

| Part | Value |
|---|---|
| Tile | Rounded square `x 2, y 2, 60×60`, radius `13.5`; vertical gradient `#2A2D31 → #111418` (base `#15181D`) |
| Tile rim | Top-down white highlight (`16% → 0%` over the top half) and a `0.7` white hairline at `7%` |
| Glyph | Off-white `#EEF0EA`, top-lit gradient `#F8F9F7 → #DDDFDA` |
| Secondary | Wrench in grey `#B6BBB2`, gradient `#C8CCC5 → #A4A8A0` |
| Accent | Lime `#C8F031` (ruler), gradient `#D4F35E → #B4D82C`; ruler ticks `#9CBB26` |
| Detail | Window dots, header bar, and bubble text lines use the tile color `#15181D` (text lines at `28%`) |
| Depth | One soft drop shadow under the whole glyph: `dy 1.4`, blur `1.3`, black at `45%` |
| Bubble | `40×19` body, radius `9`, tail at the bottom-left starting where the corner arc ends; the whole tools-and-bubble group is drawn at `92%` |
| Separation | A `2.6` tile-colored outline around the bubble and window card keeps overlapping shapes apart |
| Centering | Glyph shifted so the mean of its bounding-box center and visual mass center sits at `y 32` |

## Replacing it

- Keep a square `64×64` SVG (or a `256×256` PNG) with its own tile; do not ship
  a transparent-only icon.
- Keep colors baked in; the Host shows the file through `<img>`, so CSS
  variables and `currentColor` do not resolve.
- Replace `icon.svg` at the repository root. If the format changes, update the
  `icon` field, the `./icon` export, and the `files` entry in `package.json`,
  the `<img>` at the top of both READMEs, and the required-file list in
  `scripts/release-check.mjs`.
- Bump the package version if the change ships to others.

## Verify before shipping

1. Replace the file, then reload the Plugins page.
2. Check the 48 px card and header tile on both light and dark page themes.
3. Check a 24 px rendering: the bubble, the window card, and the ruler and wrench
   must not collapse into a blur.
