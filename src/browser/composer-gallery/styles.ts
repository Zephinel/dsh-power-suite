/**
 * Stylesheet for the composer image gallery overlay.
 *
 * CSS text, selectors and tokens used to sit inline in `src/client.js` and are
 * unchanged.
 *
 * @module
 */

/** Native-lightbox-recipe gallery stylesheet. */
export const PSG_CSS = `
.psg-root{position:fixed;inset:0;z-index:1000;pointer-events:auto;animation:psg-fade 140ms ease-out}
.psg-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.24));backdrop-filter:var(--dsw-mask-blur,none)}
.psg-stage{position:absolute;inset:var(--dsh-frame-chrome-top,0px) 0 0;display:flex;align-items:center;justify-content:center;padding:40px;box-sizing:border-box;pointer-events:none}
.psg-image,.psg-close,.psg-nav,.psg-counter{pointer-events:auto}
.psg-image{position:relative;max-width:min(100%,1600px);max-height:100%;object-fit:contain;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-1));border:0;box-shadow:var(--dsw-elevation-prominent,var(--dsw-shadow-lv3,none))}
.psg-close,.psg-nav{position:absolute;z-index:2;display:grid;place-items:center;width:36px;height:36px;padding:0;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2-darkmode-thin,var(--dsw-alias-border-l2,transparent));border-radius:999px;corner-shape:round;background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);cursor:pointer;box-shadow:var(--dsw-elevation-panel,none)}
.psg-close{top:20px;right:20px}
.psg-nav{top:50%;transform:translateY(-50%)}
.psg-prev{left:20px}
.psg-next{right:20px}
.psg-close:hover,.psg-nav:hover:enabled{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
/* Annotation targeting: the pick lands on the labelled nav/close button, not on
   its icon (the gallery itself is a transient surface). */
.psg-close > svg,.psg-nav > svg{pointer-events:none}
.psg-close:focus-visible,.psg-nav:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:3px}
.psg-nav:disabled{opacity:.35;cursor:default}
.psg-counter{position:absolute;top:20px;left:50%;transform:translateX(-50%);z-index:2;display:inline-flex;align-items:center;height:36px;padding:0 14px;box-sizing:border-box;border-radius:999px;corner-shape:round;background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;font-variant-numeric:tabular-nums;box-shadow:var(--dsw-elevation-panel,none)}
@keyframes psg-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){.psg-root{animation:none}}
`
