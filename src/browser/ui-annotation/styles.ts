/**
 * Stylesheet of the UI element annotation surface.
 *
 * One rule block for the launcher, paint layer and marks, the rail and its
 * collection rows, the popover/detail card, the modifier settings, the rainbow
 * focus field and the composer chip preview. It is injected once per installed
 * client as a `data-power-suite-css="ui-annotation"` style tag; every class and
 * DOM marker here is part of the browser E2E contract.
 *
 * @module
 */

export const ANNOTATION_CSS = `
[data-psa-frame="true"]{transition:padding-right .18s ease}
@media (prefers-reduced-motion:reduce){[data-psa-frame="true"]{transition:none}}
html[data-psa-active="true"] [data-psp-rail],
html[data-psa-active="true"] [data-psp-search-card],
html[data-psa-active="true"] [data-psp-preview-card],
html[data-psa-active="true"] [data-psp-rail-divider],
html[data-psa-active="true"] [data-psp-search-toggle]{display:none!important}
/* F4 (annotation side, D3): while the mode is on, the dynamic-workspaces
   hover card becomes hit-testable and sits above page content but below the
   annotation paint layer (z=150). The pin/lifetime behavior itself is owned by
   the dynamic-workspaces feature, which listens to power-suite:ui-annotation-state. */
html[data-psa-active="true"] [data-psd-hovercard]{pointer-events:auto;z-index:120!important}
html[data-psa-active="true"]:not([data-psa-passthrough="true"]) body{cursor:crosshair}
html[data-psa-active="true"][data-psa-passthrough="true"] body{cursor:auto}
.psa-launcher{transition:opacity 180ms ease,transform 180ms ease;transform-origin:center}
.psa-launcher[data-psa-launcher-hidden=true]{opacity:0;transform:scale(.72);pointer-events:none}
@media (prefers-reduced-motion:reduce){.psa-launcher{transition:none}}
.psa-launcher{position:fixed;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:0;border-radius:50%;corner-shape:round;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);box-shadow:0 2px 6px rgb(0 0 0 / 10%),0 8px 24px rgb(0 0 0 / 20%);cursor:grab;pointer-events:auto;touch-action:none;user-select:none;z-index:50}
.psa-launcher:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}
.psa-launcher[data-psa-active=true]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.psa-launcher[data-psa-dragging=true]{cursor:grabbing}
.psa-launcher:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.psa-launcher-icon{display:block}
.psa-launcher-count{position:absolute;top:-4px;right:-4px;box-sizing:border-box;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-secondary);border:0;font-size:10.5px;line-height:15px;text-align:center;font-variant-numeric:tabular-nums}
.psa-layer{position:fixed;inset:0;pointer-events:none;z-index:39}
html[data-psa-active="true"] .psa-layer{z-index:110}
.psa-hover{position:fixed;box-sizing:border-box;border:1px dashed var(--dsw-alias-state-business-primary);border-radius:3px}
.psa-selection{position:fixed;box-sizing:border-box;border:1.5px solid var(--dsw-alias-state-business-primary);border-radius:3px}
.psa-multi{position:fixed;box-sizing:border-box;border:1px solid var(--dsw-alias-state-business-primary);border-radius:3px}
.psa-selection[data-psa-flash=true],.psa-multi[data-psa-flash=true]{animation:psa-flash .6s ease-out 1}
@keyframes psa-flash{0%{box-shadow:0 0 0 6px var(--dsw-alias-state-business-primary)}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.psa-selection[data-psa-flash=true],.psa-multi[data-psa-flash=true],.psa-flash-outline{animation:none}}
.psa-box{position:fixed;box-sizing:border-box;border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));opacity:.65}
.psa-flash-outline{position:fixed;box-sizing:border-box;border:2px solid var(--dsw-alias-state-business-primary);border-radius:3px;animation:psa-flash .6s ease-out 1}
.psa-rail{position:fixed;top:0;right:var(--psa-rail-right,0px);bottom:0;box-sizing:border-box;display:flex;flex-direction:column;min-height:0;width:var(--psa-rail-width,200px);background:var(--dsw-alias-bg-layer-1);border:0;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;line-height:18px;pointer-events:auto;z-index:40}
.psa-rail[data-psa-mode=overlay]{top:8px;right:calc(var(--psa-rail-right,0px) + 8px);bottom:8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-lg,12px);box-shadow:var(--dsw-elevation-panel,0 10px 30px rgb(0 0 0 / 22%))}
.psa-rail[data-psa-collapsed=true]{align-items:center}
.psa-rail-header{display:flex;align-items:center;gap:4px;padding:8px 8px 6px;flex:none}
.psa-rail[data-psa-collapsed=true] .psa-rail-header{flex-direction:column;padding:8px 4px;gap:4px}
.psa-rail-title{flex:1;min-width:0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary);flex:none}
.psa-icon-btn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);width:24px;height:24px;padding:0;border-radius:var(--dsw-radius-sm,6px);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
.psa-icon-btn:hover:enabled{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.psa-icon-btn:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.psa-icon-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.psa-rail-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:8px;padding:2px 10px 10px}
.psa-rail[data-psa-collapsed=true] .psa-rail-body{display:none}
.psa-rail-section{display:flex;flex-direction:column;gap:6px}
.psa-status-line{color:var(--dsw-alias-label-secondary)}
.psa-status-strong{color:var(--dsw-alias-label-primary);font-weight:500}
.psa-muted{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.psa-truncate{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-btn{appearance:none;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:space-between;gap:6px;width:100%;min-height:28px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:17px;cursor:pointer;text-align:left}
.psa-btn:hover:enabled{background:var(--dsw-alias-interactive-bg-hover)}
.psa-btn:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.psa-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.psa-btn-primary{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.psa-btn-count{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px}
.psa-rail-footer{flex:none;display:flex;flex-direction:column;gap:6px;padding:8px 10px 10px;border-top:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent))}
.psa-entry{display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-md,8px)}
.psa-entry[data-psa-entry-scope=other]{border-style:dashed}
.psa-entry-head{display:flex;align-items:center;gap:6px;min-width:0}
.psa-entry-index{flex:none;min-width:13px;text-align:right;color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums}
.psa-entry-name{flex:1;min-width:0;appearance:none;border:0;background:transparent;padding:0;color:var(--dsw-alias-label-primary);font:inherit;font-weight:500;font-size:12px;line-height:17px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.psa-entry-name:hover{text-decoration:underline}
.psa-entry-name:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.psa-badge{flex:none;padding:0 4px;border-radius:6px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:14px}
.psa-status-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.psa-status-dot[data-psa-status=resolved]{background:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-tertiary))}
.psa-status-dot[data-psa-status=ambiguous],.psa-status-dot[data-psa-status=changed]{background:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-tertiary))}
.psa-status-dot[data-psa-status=missing]{background:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-tertiary))}
.psa-entry-locator{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-entry-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px;overflow-wrap:anywhere}
.psa-entry-check{display:inline-flex;align-items:center;flex:none;cursor:pointer}
.psa-entry-check input{margin:0;width:13px;height:13px;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer}
.psa-entry-check input:disabled{cursor:default;opacity:.55}
.psa-entry[data-psa-entry-scope=other] .psa-entry-check{opacity:.6}
.psa-rail-tools{display:flex;gap:4px}
.psa-rail-tools .psa-btn{flex:1;justify-content:center;min-height:24px;font-size:11.5px}
.psa-rail-max{color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-tertiary))}
.psa-entry-insert{flex:1 1 auto;min-width:0;max-width:100%;min-height:22px;padding:2px 6px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;justify-content:center}
.psa-btn-danger{border-color:var(--dsw-alias-state-error-primary,var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent)));color:var(--dsw-alias-state-error-primary)}
.psa-entry-note{box-sizing:border-box;width:100%;min-height:34px;max-height:72px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:17px;resize:vertical}
.psa-entry-actions{display:flex;align-items:center;justify-content:flex-end;gap:2px;flex-wrap:wrap}
.psa-empty{display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center;padding:18px 6px;border:0;border-radius:var(--dsw-radius-md,8px)}
.psa-empty-title{color:var(--dsw-alias-label-primary);font-weight:500}
.psa-field{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.psa-field-label{min-width:0;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-segmented{display:flex;align-items:stretch;gap:2px;padding:2px;box-sizing:border-box;border-radius:9px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);min-width:0}
 .psa-segmented-option{appearance:none;flex:1 1 0;min-width:0;height:24px;padding:0 3px;border:0;border-radius:7px;background:transparent;color:rgba(255,255,255,.78);font:inherit;font-size:10px;line-height:1;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;outline:none}
.psa-segmented-option:hover{background:rgba(255,255,255,.08)}
.psa-segmented-option[aria-checked=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary,#7C5CFF) 30%, transparent);color:var(--dsw-static-neutral-bluish-00,#fff);font-weight:500}
.psa-segmented-option:focus-visible{outline:none}
.psa-settings-row{display:flex;flex-direction:column;align-items:stretch;gap:6px;margin:9px 0}
.psa-settings-row-label{color:var(--dsw-static-neutral-bluish-00,#f5f6f8);white-space:nowrap}
.psa-settings-popover{position:fixed;box-sizing:border-box;z-index:46;padding:12px;border:0;border-radius:14px;background:var(--dsw-hovercard-bg,#2C2C2E);color:var(--dsw-static-neutral-bluish-00,#f5f6f8);box-shadow:var(--dsw-elevation-lv3,var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.35)));font-family:inherit;font-size:12px;line-height:18px;pointer-events:auto;animation:psa-modifier-in 120ms var(--ds-ease-out,ease-out)}
.psa-settings-title{font-size:12.5px;font-weight:500;margin:0 0 10px}
.psa-settings-feedback{min-height:16px;margin-top:8px;color:var(--dsw-alias-state-warn-primary,#ffc46b);font-size:11.5px;line-height:16px}
.psa-settings-note{margin-top:4px;color:rgba(255,255,255,.62);font-size:11.5px;line-height:16px}
@media (prefers-reduced-motion:reduce){.psa-settings-popover{animation:none}}
.psa-mark{position:fixed;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 62%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 7%,transparent);border-radius:4px;pointer-events:none}
.psa-mark[data-psa-mark-state=hovering]{border-width:1.5px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent)}
.psa-mark[data-psa-mark-stale=changed]{border-style:dashed;border-color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-state-business-primary))}
.psa-mark-badge{position:absolute;top:-9px;right:-1px;box-sizing:border-box;max-width:240px;height:17px;padding:0 5px;display:inline-flex;align-items:center;gap:4px;border-radius:9px;border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-business-primary);font-family:inherit;font-size:10.5px;font-weight:500;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-mark[data-psa-mark-badge-inside=true] .psa-mark-badge{top:2px;right:2px}
.psa-mark-badge[data-psa-mark-empty=true]{color:var(--dsw-alias-label-tertiary);border-color:var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent))}
.psa-mark-badge[data-psa-mark-stale=changed]{border-color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-state-business-primary));color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-state-business-primary))}
.psa-mark-badge-index{font-variant-numeric:tabular-nums;opacity:.85}
.psa-mark-badge-text{min-width:0;overflow:hidden;text-overflow:ellipsis}
.psa-mark-badge-stale{font-weight:700}
@media (prefers-reduced-motion:reduce){.psa-mark[data-psa-mark-state=flash]{animation:none;box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}}
.psa-detail-card{position:fixed;box-sizing:border-box;width:320px;max-height:min(60vh,420px);display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,0 10px 30px rgb(0 0 0 / 22%));color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:17px;pointer-events:auto;z-index:44;overflow:auto}
.psa-detail-head{display:flex;align-items:center;gap:6px}
.psa-detail-title{flex:1;min-width:0;font-weight:500;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-detail-section{display:flex;flex-direction:column;gap:3px}
.psa-detail-label{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.psa-detail-requirement{white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto;padding:4px 6px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary)}
.psa-detail-requirement[data-psa-detail-empty=true]{color:var(--dsw-alias-label-tertiary)}
.psa-detail-meta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 8px;margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.psa-detail-meta dt{margin:0;white-space:nowrap}
.psa-detail-meta dd{margin:0;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.psa-detail-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px}
.psa-detail-actions .psa-btn{width:auto;flex:none}
.psa-detail-danger{color:var(--dsw-alias-state-error-primary)}
.psa-detail-textarea{box-sizing:border-box;width:100%;min-height:64px;max-height:180px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:17px;resize:vertical}
.psa-undo-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:57;display:flex;align-items:center;gap:10px;max-width:min(520px,calc(100vw - 48px));padding:8px 10px 8px 12px;border:0;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1);box-shadow:0 2px 6px rgb(0 0 0 / 10%),0 8px 24px rgb(0 0 0 / 20%);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:17px;pointer-events:auto}
.psa-undo-toast .psa-btn{width:auto;min-height:24px;padding:2px 8px}
.psa-popover{position:fixed;box-sizing:border-box;width:320px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;gap:8px;padding:10px 12px 12px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,0 10px 30px rgb(0 0 0 / 22%));color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:17px;pointer-events:auto;z-index:45}
.psa-popover-head{display:flex;align-items:center;gap:6px;cursor:grab;user-select:none}
.psa-popover-title{flex:1;min-width:0;font-weight:500;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-popover-ref{display:flex;align-items:center;gap:4px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;min-width:0}
.psa-popover-ref .psa-truncate{flex:1;min-width:0}
.psa-popover-ref .psa-icon-btn{width:20px;height:20px}
.psa-popover-status{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}
.psa-levels{display:inline-flex;align-items:center;gap:2px;margin-left:auto}
.psa-popover-note{display:flex;flex-direction:column;gap:8px}
.psa-sb-rail-title{font-weight:600;font-size:13px;letter-spacing:.01em}
.psa-sb-total{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:18px;padding:0 6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;flex:none}
.psa-sb-head{display:flex;flex-direction:column;gap:2px;padding:2px 2px 0}
.psa-sb-hint{color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:14px}
.psa-sb-head-row{display:flex;align-items:center;gap:6px}
.psa-sb-back{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;padding:2px 4px;border-radius:var(--dsw-radius-sm,4px);cursor:pointer}
.psa-sb-back:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.psa-sb-subtitle{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}
.psa-sb-filters{display:flex;gap:4px;padding:0 2px}
.psa-sb-filter{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}
.psa-sb-filter:hover{background:var(--dsw-alias-interactive-bg-hover)}
.psa-sb-filter[aria-pressed=true]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);color:var(--dsw-alias-label-primary);border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)}
.psa-sb-filter-count{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.psa-sb-filter[aria-pressed=true] .psa-sb-filter-count{color:var(--dsw-alias-label-secondary)}
.psa-sb-scope{font-size:10.5px;padding:0 2px}
.psa-sb-tools{display:flex;gap:4px;padding:0 2px;flex-wrap:wrap}
.psa-sb-tool{min-height:24px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;cursor:pointer}
.psa-sb-tool:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.psa-sb-tool:disabled{opacity:.45;cursor:default}
.psa-sb-tool-primary{color:var(--dsw-alias-label-primary)}
.psa-sb-tool-danger{color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary))}
.psa-sb-sort{font-size:10.5px;color:var(--dsw-alias-label-tertiary);padding:0 2px}
.psa-sb-note{font-size:10.5px;color:var(--dsw-alias-label-tertiary);padding:0 2px}
.psa-sb-list{display:flex;flex-direction:column;gap:6px;padding:0 2px 4px}
.psa-sb-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 12px;border:0;border-radius:var(--dsw-radius-md,8px);text-align:center;color:var(--dsw-alias-label-tertiary)}
.psa-sb-empty-icon{color:var(--dsw-alias-label-tertiary);opacity:.7}
.psa-sb-empty-title{color:var(--dsw-alias-label-secondary);font-weight:600;font-size:12px}
.psa-sb-empty-hint{font-size:11px;line-height:15px;max-width:240px}
.psa-sb-type{flex:none;display:inline-flex;align-items:center;height:17px;padding:0 6px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:.02em;background:color-mix(in srgb,var(--dsw-alias-label-primary) 9%,transparent);color:var(--dsw-alias-label-secondary)}
.psa-sb-type[data-psa-type-badge=group]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,transparent);color:var(--dsw-alias-label-primary)}
.psa-sb-meta{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.psa-sb-selector{font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psa-sb-page{font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psa-sb-child-time{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary)}
.psa-entry{padding:9px;gap:5px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 3%,transparent)}
.psa-entry:hover{border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent);background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}
.psa-entry:focus-within{border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 34%,transparent)}
.psa-entry-actions{display:flex;align-items:center;justify-content:flex-end;gap:2px;flex-wrap:wrap;margin-top:2px}
.psa-entry-actions .psa-icon-btn{min-width:24px;min-height:24px}
.psa-group .psa-entry-name{font-weight:600}
.psa-group-items{margin-left:6px}
.psa-group-item{min-height:26px}
.psa-exit-confirm{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(360px,calc(100vw - 32px));box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:16px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:0 2px 6px rgb(0 0 0 / 10%),0 8px 24px rgb(0 0 0 / 20%);color:var(--dsw-alias-label-primary);pointer-events:auto;z-index:70;font-size:12.5px;line-height:18px}
.psa-exit-confirm-title{font-weight:600;font-size:13px}
.psa-exit-confirm-message{color:var(--dsw-alias-label-secondary)}
.psa-exit-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}
.psa-exit-confirm-danger{min-height:30px;padding:0 12px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary)) 55%,transparent);border-radius:var(--dsw-radius-sm,8px);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary)) 16%,transparent);color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary));font:inherit;font-size:12px;cursor:pointer}
.psa-sb-footer{flex:none;display:flex;gap:8px;padding:10px 12px 12px;border-top:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent))}
.psa-sb-primary{flex:1 1 50%;min-height:34px;border:0;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-state-business-primary);color:#fff;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.psa-sb-primary:hover:not(:disabled){filter:brightness(1.06)}
.psa-sb-primary:disabled{opacity:.5;cursor:default}
.psa-sb-danger{flex:1 1 50%;min-height:34px;padding:0 14px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary)) 55%,transparent);border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary));font:inherit;font-size:12px;cursor:pointer}
.psa-sb-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary)) 10%,transparent)}
.psa-sb-danger:disabled{opacity:.45;cursor:default}
.psa-sb-filter:focus-visible,.psa-sb-tool:focus-visible,.psa-sb-primary:focus-visible,.psa-sb-danger:focus-visible,.psa-entry-name:focus-visible,.psa-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.psa-group-items{display:flex;flex-direction:column;gap:3px;margin:2px 0 2px 18px;padding-left:8px;border-left:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent))}
.psa-group-item{display:flex;align-items:center;gap:5px;min-width:0;font-size:11px;line-height:16px}
.psa-group-item-name{flex:none;max-width:45%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:none;border:0;padding:0;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit}
.psa-group-item-name:hover{text-decoration:underline}
.psa-group-item-locator{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code,monospace);font-size:10px}
.psa-group .psa-entry-name{max-width:44%}
.psa-batch-popover{max-height:calc(100vh - 32px);overflow:auto}
.psa-batch-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;font-size:11.5px}
.psa-batch-item{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-popover-note-head{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:18px}
.psa-popover-note-head > .psa-muted{flex:1;min-width:0}
.psa-popover-note-head .psa-icon-btn{width:18px;height:18px;flex:none}
.psa-popover-textarea{box-sizing:border-box;width:100%;min-height:56px;max-height:150px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:17px;resize:vertical}
.psa-popover-actions{display:flex;flex-wrap:nowrap;gap:6px}
.psa-popover-actions .psa-btn{flex:1;justify-content:center}
.psa-note-editor{position:fixed;box-sizing:border-box;width:300px;display:flex;flex-direction:column;gap:6px;padding:10px 12px 12px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,0 10px 30px rgb(0 0 0 / 22%));color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:17px;pointer-events:auto;z-index:55}
.psa-note-editor-textarea{box-sizing:border-box;width:100%;min-height:96px;max-height:220px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:17px;resize:vertical}
.psa-feedback{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:56;max-width:min(520px,calc(100vw - 48px));padding:8px 12px;border:0;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1);box-shadow:0 2px 6px rgb(0 0 0 / 10%),0 8px 24px rgb(0 0 0 / 20%);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:17px;pointer-events:none}
.psa-feedback[data-psa-kind=error]{color:var(--dsw-alias-state-error-primary)}
/* Floating tooltip-like windows use the native DSH SESSION-ROW HOVER PREVIEW CARD
   recipe (the surface the user points at as "native"): the shell's own hover card
   defines --dsw-hovercard-bg:#2C2C2E as a fixed background in BOTH themes and
   paints var(--dsw-shadow-lv3), no border. Do not use the small tooltip bubble
   token here: --dsw-alias-tooltip-bg flips to #43454a in the dark theme and would
   diverge from the native hover card. */
.psa-popover,.psa-detail-card,.psa-note-editor{background:var(--dsw-hovercard-bg,#2C2C2E);border:0;box-shadow:var(--dsw-shadow-lv3,none);backdrop-filter:none;-webkit-backdrop-filter:none;color:var(--dsw-alias-label-primary,#f9fafb)}
/* Light theme: the annotation floating surfaces follow the shell surface/label
   tokens, matching the native session-row hover card (owner decision). Dark
   keeps the original #2C2C2E recipe byte-identical through the fallback values. */
body:not([data-ds-dark-theme]) .psa-popover,
body:not([data-ds-dark-theme]) .psa-detail-card,
body:not([data-ds-dark-theme]) .psa-note-editor,
body:not([data-ds-dark-theme]) .psa-settings-popover{
  --dsw-static-neutral-bluish-00:var(--dsw-alias-label-primary,#0f1115);
  --dsw-static-neutral-bluish-300:var(--dsw-alias-label-secondary,#61666b);
  --dsw-static-neutral-bluish-400:var(--dsw-alias-label-tertiary,#81858c);
  background:var(--dsw-alias-bg-layer-1,#fff);
  color:var(--dsw-alias-label-primary,#0f1115);
  border:0;
  box-shadow:var(--dsw-shadow-lv3,none);
}
.psa-popover .psa-muted,.psa-detail-card .psa-muted,.psa-note-editor .psa-muted{color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 64%,transparent)}
.psa-popover .psa-popover-ref,.psa-popover .psa-popover-status{color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 72%,transparent)}
.psa-detail-card .psa-detail-label,.psa-detail-card .psa-detail-meta{color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 64%,transparent)}
.psa-detail-card .psa-detail-meta dd{color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 82%,transparent)}
.psa-popover .psa-icon-btn,.psa-detail-card .psa-icon-btn,.psa-note-editor .psa-icon-btn{color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 76%,transparent)}
.psa-popover .psa-icon-btn:hover:enabled,.psa-detail-card .psa-icon-btn:hover:enabled,.psa-note-editor .psa-icon-btn:hover:enabled{background:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 12%,transparent);color:var(--dsw-static-neutral-bluish-00)}
.psa-popover .psa-btn,.psa-detail-card .psa-btn{border-color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 26%,transparent);background:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 4%,transparent);color:var(--dsw-static-neutral-bluish-00)}
.psa-popover .psa-btn:hover:enabled,.psa-detail-card .psa-btn:hover:enabled{background:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 12%,transparent)}
.psa-popover .psa-btn-primary,.psa-detail-card .psa-btn-primary{border-color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 55%,transparent);background:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 12%,transparent);color:var(--dsw-static-neutral-bluish-00)}
.psa-popover .psa-btn-primary:hover:enabled,.psa-detail-card .psa-btn-primary:hover:enabled{background:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 20%,transparent)}
.psa-popover .psa-popover-textarea,.psa-detail-card .psa-detail-textarea,.psa-note-editor .psa-note-editor-textarea{border-color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 22%,transparent);background:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 8%,transparent);color:var(--dsw-static-neutral-bluish-00);caret-color:var(--dsw-static-neutral-bluish-00)}
.psa-popover .psa-popover-textarea::placeholder,.psa-detail-card .psa-detail-textarea::placeholder,.psa-note-editor .psa-note-editor-textarea::placeholder{color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 52%,transparent)}
.psa-detail-card .psa-detail-requirement{background:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 8%,transparent);color:var(--dsw-static-neutral-bluish-00)}
.psa-detail-card .psa-detail-requirement[data-psa-detail-empty=true]{color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 52%,transparent)}
.psa-popover .psa-detail-danger,.psa-detail-card .psa-detail-danger{color:var(--dsw-alias-state-error-secondary,var(--dsw-alias-state-error-primary))}
/* A3/T21: composer reference-chip hover preview. Same native hover-card recipe as
   the detail card, pointer-transparent so it never traps the pointer. */
.psa-chip-delete{position:fixed;z-index:48;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0;border:0;border-radius:50%;background:var(--dsw-alias-bg-layer-2,var(--dsw-hovercard-bg,#2C2C2E));color:var(--dsw-alias-label-secondary);box-shadow:var(--dsw-shadow-lv2,none);cursor:pointer;pointer-events:auto}
.psa-chip-delete:hover{background:var(--dsw-alias-bg-layer-3,var(--dsw-hovercard-bg,#2C2C2E));color:var(--dsw-alias-label-primary)}
.psa-chip-delete:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.psa-chip-preview{position:fixed;box-sizing:border-box;width:320px;max-height:min(52vh,380px);overflow:auto;display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-hovercard-bg,#2C2C2E);box-shadow:var(--dsw-shadow-lv3,none);color:var(--dsw-static-neutral-bluish-00);font-family:inherit;font-size:12px;line-height:17px;pointer-events:none;z-index:47}
.psa-chip-preview-head{display:flex;align-items:center;gap:6px}
.psa-chip-preview-title{flex:1;min-width:0;font-weight:500;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-chip-preview-requirement{white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:auto;padding:4px 6px;border-radius:var(--dsw-radius-sm,6px);background:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 8%,transparent)}
.psa-chip-preview-meta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 8px;margin:0;font-size:11px;line-height:16px;color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 64%,transparent)}
.psa-chip-preview-meta dt{margin:0;white-space:nowrap}
.psa-chip-preview-meta dd{margin:0;color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 82%,transparent);overflow-wrap:anywhere}
.psa-chip-preview-count{color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 72%,transparent);font-size:11px}
.psa-chip-preview-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.psa-chip-preview-item{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px}
.psa-chip-preview-item-label{font-weight:500}
.psa-chip-preview-item-note{color:color-mix(in srgb,var(--dsw-static-neutral-bluish-00) 64%,transparent)}
/* B3: rainbow circulating focus ring for annotation inputs. */
 Values are copied from
   the shared dynamic-workspaces recipe (.psf-rainbow-focus) so every plugin input
   reads as one effect: identical conic stops, the same 140ms fade, 3.2s ring spin
   plus 14s hue drift, and the same reduced-motion/forced-colors fallbacks. The
   wrapper owns the ring; the control keeps its border and loses the solid focus
   outline, so keyboard focus stays visible without layout shift. */
@property --psa-ring-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
.psa-rainbow-field{position:relative;display:block;min-width:0}
.psa-field > .psa-rainbow-field{flex:none}
.psa-rainbow-field::after{content:'';position:absolute;inset:-2px;border-radius:calc(var(--dsw-radius-sm,8px) + 2px);padding:2px;background:conic-gradient(from var(--psa-ring-angle,0deg),#ff6b6b,#ffc46b,#e8e86b,#6bffab,#6bd9ff,#a78bff,#ff6bd4,#ff6b6b);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;opacity:0;transition:opacity 140ms var(--ds-ease-in-out,ease);filter:saturate(.92) drop-shadow(0 0 5px rgba(178,150,255,.38));z-index:2}
.psa-rainbow-field:focus-within::after,.psa-rainbow-field:focus-visible::after{opacity:1;animation:psa-ring-spin 3.2s linear infinite,psa-ring-hue 14s linear infinite}
.psa-rainbow-field > .psa-popover-textarea,
.psa-rainbow-field > .psa-entry-note,
.psa-rainbow-field > .psa-note-editor-textarea,
.psa-rainbow-field > .psa-detail-textarea{position:relative;z-index:1;outline:none}
/* The ring must hug the control's border box exactly: a textarea/input/select is
   inline-level by default, which leaves a baseline descender gap under it inside
   the wrapper; the ring (inset:-2px on the wrapper) then hangs below the control
   and the control's own bottom border shows through. Rendering the control as a
   block makes the wrapper's box exactly the control's border box. */
.psa-rainbow-field > textarea,
.psa-rainbow-field > input,
.psa-rainbow-field > select{display:block;vertical-align:top}
@keyframes psa-ring-spin{to{--psa-ring-angle:360deg}}
@keyframes psa-ring-hue{from{filter:hue-rotate(0deg) saturate(.92) drop-shadow(0 0 5px rgba(178,150,255,.38))}to{filter:hue-rotate(360deg) saturate(.92) drop-shadow(0 0 5px rgba(178,150,255,.38))}}
@media (prefers-reduced-motion:reduce){
.psa-rainbow-field:focus-within::after,.psa-rainbow-field:focus-visible::after{animation:none}
}
@media (forced-colors:active){
.psa-rainbow-field::after{display:none}
.psa-rainbow-field:focus-within{outline:2px solid Highlight;outline-offset:1px}
}
`
