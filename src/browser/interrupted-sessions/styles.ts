/**
 * Interrupted-session stylesheet and submit-control mask.
 *
 * CSS text, selectors and tokens used to sit inline in `src/client.js` and are
 * unchanged.
 *
 * @module
 */

import { REMIX_PLAY_FILL } from './icons.ts'

/** Mask that turns the composer's submit glyph into a play triangle. */
export const PLAY_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${REMIX_PLAY_FILL}"/></svg>`)}")`

/** Interrupted rows, badge, Continue CTA and composer affordance stylesheet. */
export const INTERRUPTED_CSS = `
/* Interrupted native Session rows keep the shell's own hover surface and title;
   hovering only reveals the inline Continue triangle in the leading status cell.
   The old opaque ::before mask and the first/last-child z-index lift are gone: the
   mask erased the title/time on hover, and its positional "first child" selector
   caught the injected rainbow atmosphere wrapper (current Session row) and turned
   it from an absolute background layer into an in-flow pill that pushed the badge
   and collapsed the title (user report). The native leading cell is a fixed 16 px
   status column; it widens for this row so the 22 px triangle has room and the
   title slides right instead of being clipped. */
[data-row-key^="session:"][data-power-suite-interrupted]{position:relative}
[data-row-key^="session:"][data-power-suite-interrupted]>span:has(.dps-row-interrupted){width:auto;justify-content:flex-start}
.dps-row-interrupted{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-state-warn-primary);pointer-events:none;flex:none}
/* The leading cell's width snaps rather than animates: the shell's title
   marquee measures scrollWidth - clientWidth once on pointerenter, so an
   animated cell would leave the marquee 22 px short (and a title whose rest
   overflow is just above the shell's 8 px threshold would not marquee at all).
   Only the triangle's opacity animates. */
.dps-row-continue-slot{flex:none;display:inline-flex;align-items:center;justify-content:center;width:0;height:22px;margin:0;overflow:hidden;opacity:0;pointer-events:none;transition:opacity 120ms var(--ds-ease-in-out,ease)}
[data-row-key^="session:"][data-power-suite-interrupted]:hover .dps-row-continue-slot,
html[data-input-modality='keyboard'] [data-row-key^="session:"][data-power-suite-interrupted]:focus-within .dps-row-continue-slot{width:22px;opacity:1;pointer-events:auto}
@media (prefers-reduced-motion: reduce){
  [data-row-key^="session:"][data-power-suite-interrupted] .dps-row-continue-slot,
  [data-row-key^="session:"][data-power-suite-interrupted]:hover .dps-row-continue-slot,
  [data-row-key^="session:"][data-power-suite-interrupted]:focus-within .dps-row-continue-slot{transition:none}
}
.dps-row-continue{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;flex:none;opacity:1;pointer-events:auto}
.dps-row-continue svg{display:block;flex:none;pointer-events:none}
/* The native Session row is the hover surface (same one-surface rule as the
   card): Continue only lifts its glyph colour, so no second block is stacked
   inside a highlighted row. Its inner svg is pointer-transparent so an
   annotation pick lands on the labelled button, not on the anonymous icon. */
.dps-row-continue:hover{background:transparent;color:var(--dsw-alias-label-primary)}
.dps-row-continue:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
/* Hide only the native status dots that render directly under this cell while
   the native row still believes it is running (the decorator inserts the warning
   in their place). The idle leading seat is mounted through a display:contents
   slot wrapper shared with other plugins (e.g. the schedule clock mark and the
   liveshare fork mark), so the wrapper and everything inside it must stay
   untouched. */
[data-row-key^="session:"][data-power-suite-interrupted]>span:has(.dps-row-interrupted)>*:not(.dps-row-interrupted):not(.dps-row-continue-slot):not(span[data-slot]){display:none!important}
body:not([data-ds-dark-theme]) [data-psd-current-workspace='true'] .dps-row-interrupted,
body:not([data-ds-dark-theme]) [data-psd-current-session='true'] .dps-row-interrupted{color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 72%,var(--dsw-alias-label-primary))}
html[data-power-suite-interrupted="true"] [data-conversation-region="composer"] button[class$="_primary"]>svg{display:none!important}
html[data-power-suite-interrupted="true"] [data-conversation-region="composer"] button[class$="_primary"]::before{content:"";display:block;width:16px;height:16px;background-color:currentColor;-webkit-mask:${PLAY_MASK} center/contain no-repeat;mask:${PLAY_MASK} center/contain no-repeat}
`
