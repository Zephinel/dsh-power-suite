/**
 * Session-artifacts stylesheets.
 *
 * The list chrome and the Files-header overlay transition used to sit inline in
 * `src/client.js`; the CSS text, selectors and tokens are unchanged.
 *
 * @module
 */

/** Stylesheet for the artifacts list pane. */
export const ARTIFACTS_CSS = `
.dsa-root{display:flex;flex-direction:column;min-height:0;height:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dsa-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px 6px}
.dsa-count{color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsa-back{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm,6px)}
.dsa-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-back:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dsa-header-leading{display:inline-flex;align-items:center;gap:2px;min-width:0;flex:none}
.dsa-refresh{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm,6px)}
.dsa-refresh:hover:enabled{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-refresh:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dsa-refresh:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dsa-refresh[data-loading=true] svg{animation:dsa-spin .9s linear infinite}
@keyframes dsa-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.dsa-refresh[data-loading=true] svg{animation:none}}
.dsa-header-tools{display:inline-flex;align-items:center;gap:2px;flex:none}
.dsa-filter-wrap{position:relative;flex:none}
.dsa-filter-trigger{appearance:none;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 6px 0 8px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;line-height:18px;cursor:pointer}
.dsa-filter-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-filter-trigger[aria-expanded=true]{background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.dsa-filter-trigger:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dsa-filter-trigger-label{white-space:nowrap}
.dsa-filter-trigger-count{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px;font-variant-numeric:tabular-nums}
.dsa-filter-caret{display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary);transition:transform .16s ease}
.dsa-filter-trigger[aria-expanded=true] .dsa-filter-caret{transform:rotate(180deg)}
.dsa-filter-menu{position:absolute;z-index:40;top:calc(100% + 6px);right:0;min-width:196px;padding:4px;border-radius:12px;border:0;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,0 10px 30px rgb(0 0 0 / 22%));display:flex;flex-direction:column;gap:2px;animation:dsa-menu-in .12s ease-out}
@keyframes dsa-menu-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion: reduce){.dsa-filter-menu{animation:none}}
.dsa-filter-option{appearance:none;display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;line-height:18px;text-align:left;cursor:pointer}
.dsa-filter-option:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-filter-option:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dsa-filter-option[aria-checked=true]{background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);font-weight:500}
.dsa-filter-option-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsa-filter-option-count{color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums}
.dsa-filter-check{flex:none;display:inline-flex;align-items:center;color:var(--dsw-alias-label-primary)}
.dsa-list{list-style:none;margin:0;padding:0 8px 8px;overflow:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:2px}
.dsa-row{display:flex;align-items:center;gap:10px;padding:8px 8px;border-radius:var(--dsw-radius-lg,10px);min-width:0}
.dsa-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsa-icon{flex:none;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;justify-content:center}
.dsa-thumb{flex:none;display:block;width:40px;height:40px;border-radius:8px;object-fit:cover;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2,transparent)}
.dsa-main{flex:1;min-width:0}
.dsa-name{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsa-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsa-desc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:17px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.dsa-actions{flex:none;display:flex;align-items:center;gap:6px}
.dsa-action{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm,6px);text-decoration:none}
.dsa-action:hover:not(:disabled):not([data-copied=true]){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-action:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dsa-action[data-copied=true]{color:var(--dsw-alias-state-success-primary)}
.dsa-action:disabled{color:var(--dsw-alias-label-tertiary);cursor:default;background:transparent}
/* One hover surface per row (same rule as the Running & recent card): the row
   paints the surface, and its action buttons only lift their glyph colour while
   the row is hovered instead of stacking a second block inside it. */
.dsa-row:hover .dsa-action:not([data-copied=true]):not(:disabled){color:var(--dsw-alias-label-primary)}
.dsa-row:hover .dsa-action:hover:not(:disabled){background:transparent}
/* Annotation targeting: an icon is never the pick target inside the Files panel.
   The pointer lands on the labelled control (button/link aria-label) or, for the
   row glyph and thumbnail, on the row itself, so the recorded anchor is a
   semantic selector instead of a positional svg path. */
.dsa-action > svg,.dsa-back > svg,.dsa-refresh > svg,.dsa-filter-trigger > svg,.dsa-filter-caret,.dsa-icon,.dsa-thumb,.dsa-empty-icon{pointer-events:none}
.dsa-empty{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;text-align:center}
.dsa-empty-icon{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;justify-content:center}
.dsa-empty-title{font-weight:500}
.dsa-empty-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;max-width:260px}
.dsa-retry{margin-top:6px;appearance:none;border:0;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;padding:4px 12px;border-radius:var(--dsw-radius-md,8px)}
.dsa-footer{flex:none;padding:0 14px 10px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsa-loading{flex:1;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
`

/**
 * Files-pane chrome for the Artifacts action: the header tool button and the
 * in-pane overlay transition. Kept separate from the artifacts list stylesheet
 * because the button exists while the overlay is closed.
 */
export const FILES_ARTIFACTS_CSS = `
.psfa-tool{appearance:none;box-sizing:border-box;width:28px;height:28px;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-sm,8px);cursor:pointer;background:0 0;border:none;flex:none;justify-content:center;align-items:center;padding:5px;line-height:1;display:inline-flex}
.psfa-tool svg{width:18px;height:18px;pointer-events:none}
@media (hover:hover){.psfa-tool:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}}
.psfa-tool[aria-pressed='true']{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.psfa-tool:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psfa-view{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;min-height:0;box-sizing:border-box;overflow:hidden;background:var(--dsw-alias-bg-base)}
.psfa-view:focus{outline:none}
.psfa-view[data-psfa-state='opening']{animation:psfa-view-enter var(--psfa-enter-ms,180ms) cubic-bezier(.22,1,.36,1) both}
.psfa-view[data-psfa-state='closing']{animation:psfa-view-exit var(--psfa-exit-ms,160ms) cubic-bezier(.4,0,.2,1) both;pointer-events:none}
[data-files-page] [data-files-content] > :not([data-psfa-overlay]){transition:opacity var(--psfa-enter-ms,180ms) var(--ds-ease-in-out,ease),transform var(--psfa-enter-ms,180ms) var(--ds-ease-in-out,ease)}
[data-files-page][data-psfa-active='true'] [data-files-content] > :not([data-psfa-overlay]){opacity:0;transform:translateX(-14px);pointer-events:none}
@keyframes psfa-view-enter{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
@keyframes psfa-view-exit{from{opacity:1;transform:none}to{opacity:0;transform:translateX(14px)}}
@media (prefers-reduced-motion: reduce){.psfa-view[data-psfa-state='opening'],.psfa-view[data-psfa-state='closing']{animation:none}[data-files-page] [data-files-content] > :not([data-psfa-overlay]){transition:none}}
`
