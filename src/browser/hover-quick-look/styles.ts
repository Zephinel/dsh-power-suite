/**
 * The hover quick-look surface stylesheet.
 *
 * One rule block for the card shell, its header/body/footer, the resize gutter,
 * the rendered Markdown subset and the syntax-token colors. It is injected once
 * per installed client as a `data-power-suite-css="quicklook"` style tag; both
 * the Artifacts list and the native Workspace files tree share it.
 *
 * @module
 */

export const QUICKLOOK_CSS = `
.dsa-quicklook{position:fixed;z-index:1000;box-sizing:border-box;display:flex;flex-direction:column;max-height:min(560px,calc(100vh - 32px));overflow:hidden;border:0;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-hovercard-bg,#2c2c2e);color:var(--dsw-static-neutral-bluish-00,#fff);box-shadow:var(--dsw-shadow-lv3,0 0 1px #0003,0 0 4px #00000005,0 12px 32px #00000014);animation:dsa-quicklook-in .16s cubic-bezier(.22,1,.36,1)}
.dsa-quicklook-header{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid var(--psd-card-divider,rgba(255,255,255,.12));min-width:0;flex:none}
.dsa-quicklook-title{min-width:0;flex:1}
.dsa-quicklook-name{font-size:14px;font-weight:500;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsa-quicklook-meta{color:var(--dsw-static-neutral-bluish-400,#adb2b8);font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:16px}
.dsa-quicklook-body{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:transparent}
.dsa-quicklook-layer{position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:center;overflow:auto;background:transparent}
.dsa-quicklook-layer-media{align-items:center}
.dsa-quicklook-layer .dsa-quicklook-image,.dsa-quicklook-layer .dsa-quicklook-media{margin:auto}
.dsa-quicklook-text{margin:0;padding:16px 20px;box-sizing:border-box;align-self:stretch;width:100%;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:17px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-static-neutral-bluish-300,#cfd3d6)}
.dsa-quicklook-image{display:block;max-width:100%;max-height:360px;object-fit:contain}
.dsa-quicklook-frame{width:100%;height:340px;border:0;background:#fff;align-self:stretch}
.dsa-quicklook-media{max-width:100%;max-height:340px}
.dsa-quicklook-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:32px 18px;text-align:center;color:var(--dsw-static-neutral-bluish-400,#adb2b8);font-size:12px}
.dsa-quicklook-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 20px 12px 40px;border-top:1px solid var(--psd-card-divider,rgba(255,255,255,.12));flex:none}
.dsa-quicklook-note{color:var(--dsw-static-neutral-bluish-400,#adb2b8);font-size:12px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsa-quicklook-actions{display:inline-flex;align-items:center;gap:6px;flex:none}
.dsa-quicklook-action{appearance:none;border:0;background:transparent;color:var(--dsw-static-neutral-bluish-300,#cfd3d6);cursor:pointer;padding:0;width:32px;height:32px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;text-decoration:none;transition:background .15s ease,color .15s ease}
.dsa-quicklook-action:hover{background:rgba(255,255,255,.1);color:var(--dsw-static-neutral-bluish-00,#fff)}
.dsa-quicklook-loading{padding:48px 20px;color:var(--dsw-static-neutral-bluish-400,#adb2b8);font-size:13px}
.dsa-quicklook-resize{position:absolute;left:0;bottom:0;z-index:3;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:nesw-resize;color:var(--dsw-static-neutral-bluish-400,#adb2b8);background:transparent;border:0;border-radius:0 var(--dsw-radius-sm,8px) 0 var(--dsw-radius-lg,16px);transition:background .15s ease,color .15s ease}
.dsa-quicklook-resize:hover{color:var(--dsw-static-neutral-bluish-00,#fff);background:rgba(255,255,255,.1)}
@keyframes dsa-quicklook-in{from{opacity:0}to{opacity:1}}
.dsa-quicklook[data-resizing=true]{user-select:none}
.dsa-md{padding:16px 20px;box-sizing:border-box;align-self:stretch;width:100%;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dsa-md h1,.dsa-md h2,.dsa-md h3,.dsa-md h4,.dsa-md h5,.dsa-md h6{margin:0 0 8px;font-weight:600;line-height:1.3}
.dsa-md h1{font-size:17px}.dsa-md h2{font-size:15px}.dsa-md h3{font-size:13.5px}.dsa-md h4,.dsa-md h5,.dsa-md h6{font-size:12.5px}
.dsa-md p{margin:0 0 9px}
.dsa-md ul,.dsa-md ol{margin:0 0 9px;padding-left:20px}
.dsa-md li{margin:0 0 2px}
.dsa-md blockquote{margin:0 0 9px;padding:0 0 0 10px;border-left:2px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));color:var(--dsw-alias-label-secondary)}
.dsa-md pre{margin:0 0 9px;padding:8px 10px;overflow:auto;border-radius:6px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));font-size:11px;line-height:16px}
.dsa-md code{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));padding:0 3px;border-radius:3px}
.dsa-md pre code{background:transparent;padding:0;font-size:inherit}
.dsa-md a{color:var(--dsw-alias-link);text-decoration:none}
.dsa-md a:hover{text-decoration:underline}
.dsa-md hr{border:0;border-top:1px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));margin:10px 0}
.dsa-md img{display:block;max-width:100%;height:auto;margin:0 0 9px;border-radius:4px}
.dsa-md table{border-collapse:collapse;margin:0 0 9px;font-size:11.5px;max-width:100%}
.dsa-md th,.dsa-md td{border:1px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));padding:3px 7px;text-align:left;vertical-align:top}
.dsa-code{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:17.5px;white-space:pre;display:block;padding:16px 20px;color:var(--dsw-alias-label-secondary);align-self:stretch;width:100%;box-sizing:border-box;overflow:auto}
.dsa-code .tok-comment{color:var(--dsw-alias-label-tertiary);font-style:italic}
.dsa-code .tok-string{color:var(--dsw-alias-state-success-primary)}
.dsa-code .tok-keyword{color:var(--dsw-alias-state-business-primary)}
.dsa-code .tok-number{color:var(--dsw-alias-state-warn-primary)}
.dsa-code .tok-boolean{color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,var(--dsw-alias-state-success-primary))}
.dsa-code .tok-type{color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,var(--dsw-alias-state-success-primary))}
.dsa-code .tok-function{color:var(--dsw-alias-state-business-primary);font-weight:500}
.dsa-code .tok-builtin{color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,var(--dsw-alias-label-primary))}
.dsa-code .tok-variable{color:var(--dsw-alias-state-warn-primary)}
.dsa-code .tok-tag{color:var(--dsw-alias-state-business-primary)}
.dsa-code .tok-attr{color:var(--dsw-alias-state-success-primary)}
.dsa-code .tok-property{color:var(--dsw-alias-label-primary);font-weight:500}
.dsa-code .tok-decorator{color:var(--dsw-alias-state-warn-primary)}
.dsa-code .tok-symbol{color:var(--dsw-alias-state-success-primary)}
.dsa-code .tok-operator{color:var(--dsw-alias-label-tertiary)}
.dsa-code .tok-punct{color:var(--dsw-alias-label-tertiary)}
`
