/**
 * Browser half of DSH Power Suite.
 *
 * One client entry owns every feature's browser surface, kept in its own
 * `#region feature:` marks so another feature can be added the same way.
 *
 * Session artifacts registers one page type in the right Sidebar and one card
 * for its Start guide. The panel asks the Host for the current Session's
 * artifact list and renders each row with three zero-install actions:
 *
 * - Open: the file in the right Sidebar's native document preview (the
 *   workspace-files + document-preview pipeline), through a
 *   `dsh-resource://file/session/…` address; the raw route is only the fallback
 *   when no preview type claims the address.
 * - Download: the Host's authenticated raw route with an attachment disposition.
 * - Copy link: the LAN address of that raw route, for another paired device.
 *
 * Opening with an application on the *viewing* device is the step a web page
 * cannot take itself; `Download` hands the file to the operating system, which
 * owns the app choice. The footer says so in place of a control that would
 * silently launch on the Host instead.
 *
 * Workspace presets contributes one Workspace context-menu submenu that sets
 * the default agent preset for new Sessions in that Workspace.
 *
 * Prompt history turns a modifier+Up/Down in the focused composer into
 * navigation through the Session's already-sent human prompts, shell style.
 * Settings owns the Plugins-page configuration for it: the modifier choice is
 * stored by the Host and shared with the key handler.
 */

window.__ModuleLoader__.load({
  id: '@rexxin/dsh-power-suite',
  factory: (require) => {
    const React = require('react')
    const ReactDOM = require('react-dom')
    // The shell seeds this module into every Web bundle; keep the feature
    // declarative when a foreign host omits it instead of failing to load.
    const uiPrimitives = (() => {
      try {
        return require('@deepseek-ai/dsh-client-ui-primitives')
      } catch {
        return {}
      }
    })()
    /** The shell's own state/loading indicator, with a static fallback dot. */
    const StateDot = typeof uiPrimitives.StateDot === 'function'
      ? uiPrimitives.StateDot
      : ({ size }) => React.createElement('span', {
        'aria-hidden': true,
        style: { display: 'inline-block', width: size ?? 10, height: size ?? 10, borderRadius: '50%', background: 'currentColor', opacity: 0.45 }
      })

    /** This feature's copy namespace. */
    const NS = 'sessionArtifacts'

    /** This feature's implementation identity: the tab key and the guide dispatch id. */
    const ID = '@rexxin/dsh-power-suite/artifacts'

    /** The page type opened by this plugin's guide card. */
    const KIND = 'session-artifacts'

    /** Authenticated exact routes registered by the Host half. */
    const LIST_ROUTE = 'api/session-artifacts.list'
    const RAW_ROUTE = 'api/session-artifacts.raw'
    const ATTACHMENT_ROUTE = 'api/session-artifacts.attachment'
    const PREVIEW_ROUTE = 'api/session-artifacts.preview'

    /** The bundle's npm package name: configuration slot key and settings identity. */
    const PACKAGE_NAME = '@rexxin/dsh-power-suite'

    //#region copy
    const EN = {
      'guide.title': 'Artifacts',
      'guide.description': 'Files this session created or delivered',
      'tab.title': 'Artifacts',
      'list.count': '{count} artifacts',
      'list.countOne': '1 artifact',
      'list.countOf': '{shown} of {total} artifacts',
      'list.refresh': 'Refresh',
      'list.loading': 'Loading…',
      'list.empty.title': 'No artifacts yet',
      'list.empty.hint': 'Files this session writes, or delivers with present, appear here.',
      'list.empty.filtered': 'No artifacts in this filter',
      'list.error.title': 'Could not load artifacts',
      'list.retry': 'Retry',
      'filter.label': 'Artifact source',
      'filter.all': 'All',
      'filter.generated': 'Generated',
      'filter.provided': 'Provided',
      'meta.presented': 'Delivered',
      'meta.generated': 'Generated',
      'meta.provided': 'Provided',
      'meta.turn': 'turn {turn}',
      'meta.prompt': 'prompt {prompt}',
      'action.open': 'Open',
      'action.download': 'Download',
      'action.copy': 'Copy link',
      'action.copyContent': 'Copy content',
      'action.copyImage': 'Copy image',
      'action.copied': 'Copied',
      'footer.note': 'Open previews the file in the right Sidebar. Download saves the file so the system can hand it to a local app.',
      'preview.loading': 'Loading preview…',
      'preview.unavailable': 'No preview available',
      'preview.truncated': 'Preview truncated',
      'preview.resize': 'Resize preview'
    }
    const ZH = {
      'guide.title': '产物',
      'guide.description': '本会话创建或交付的文件',
      'tab.title': '产物',
      'list.count': '{count} 个产物',
      'list.countOne': '1 个产物',
      'list.countOf': '显示 {shown} / 共 {total} 个产物',
      'list.refresh': '刷新',
      'list.loading': '加载中…',
      'list.empty.title': '还没有产物',
      'list.empty.hint': '本会话写入的文件，或用 present 交付的文件会出现在这里。',
      'list.empty.filtered': '此筛选下没有产物',
      'list.error.title': '产物加载失败',
      'list.retry': '重试',
      'filter.label': '产物来源',
      'filter.all': '全部',
      'filter.generated': '生成',
      'filter.provided': '用户提供',
      'meta.presented': '已交付',
      'meta.generated': '已生成',
      'meta.provided': '用户提供',
      'meta.turn': '第 {turn} 轮',
      'meta.prompt': '第 {prompt} 条提示',
      'action.open': '打开',
      'action.download': '下载',
      'action.copy': '复制链接',
      'action.copyContent': '复制内容',
      'action.copyImage': '复制图片',
      'action.copied': '已复制',
      'footer.note': '「打开」在右侧边栏中预览；「下载」保存文件后由系统交给本地应用。',
      'preview.loading': '正在加载预览…',
      'preview.unavailable': '此文件暂无预览',
      'preview.truncated': '预览已截断',
      'preview.resize': '拖动调整预览大小'
    }
    //#endregion

    //#region feature: workspace default presets — copy and routes
    /** Copy namespace for the Workspace default-preset menu. */
    const PRESET_NS = 'workspacePresets'

    /** Exact routes the Host half serves for the override map. */
    const PRESET_GET_ROUTE = 'api/workspace-presets.get'
    const PRESET_SET_ROUTE = 'api/workspace-presets.set'

    const PRESET_EN = {
      'menu.followGlobal': 'Follow the global default',
      'menu.followGlobalCurrent': 'Follow the global default (currently {name})',
      'menu.current': 'Default agent preset: {name}',
      'preset.standard': 'Standard mode',
      'preset.ptc': 'PTC mode',
      'preset.minimal': 'Minimal mode',
      'preset.cordis': 'Creator mode',
      'menu.currentMark': '{name} (current)',
      'menu.unavailableMark': '{name} (unavailable)',
      'menu.globalDefault': 'Global default',
      'menu.loadFailed': 'Could not read agent presets',
      'menu.saveFailed': 'Could not save the default agent preset',
      'menu.saved': 'Default agent preset saved'
    }
    const PRESET_ZH = {
      'menu.followGlobal': '跟随全局默认',
      'menu.followGlobalCurrent': '跟随全局默认（当前为 {name}）',
      'menu.current': '默认 Agent 预设：{name}',
      'preset.standard': '标准模式',
      'preset.ptc': 'PTC 模式',
      'preset.minimal': '极简模式',
      'preset.cordis': '创造模式',
      'menu.currentMark': '{name}（当前）',
      'menu.unavailableMark': '{name}（不可用）',
      'menu.globalDefault': '全局默认',
      'menu.loadFailed': '无法读取 Agent 预设',
      'menu.saveFailed': '无法保存默认 Agent 预设',
      'menu.saved': '默认 Agent 预设已保存'
    }
    //#endregion

    //#region styles
    const CSS = `
.dsa-root{display:flex;flex-direction:column;min-height:0;height:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dsa-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px 6px}
.dsa-count{color:var(--dsw-alias-label-tertiary);font-size:12px}
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
.dsa-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-action:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dsa-action[data-copied=true]{color:var(--dsw-alias-state-success-primary)}
.dsa-action:disabled{color:var(--dsw-alias-label-tertiary);cursor:default;background:transparent}
.dsa-empty{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;text-align:center}
.dsa-empty-icon{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;justify-content:center}
.dsa-empty-title{font-weight:500}
.dsa-empty-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;max-width:260px}
.dsa-retry{margin-top:6px;appearance:none;border:0;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;padding:4px 12px;border-radius:var(--dsw-radius-md,8px)}
.dsa-footer{flex:none;padding:0 14px 10px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsa-loading{flex:1;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
`
    /**
     * Render the local stylesheet with the panel.
     *
     * A component-local style element is the sanctioned mechanism (no global
     * DOM owner). It travels with the panel instance, so several panels mount
     * duplicate copies rather than sharing global state.
     * @returns {object} the style element.
     */
    function panelStyle() {
      return React.createElement('style', null, CSS)
    }
    //#endregion

    //#region icons
    // Remix Icon path data (Apache-2.0, https://remixicon.com), inlined so the
    // panel needs no icon package at runtime.
    const REMIX_AI_GENERATE_3D_LINE = 'M15.1416 2.81836L13.1016 3.94824L12 3.31055L4.5 7.65234V7.6582L12 12V20.6895L19.5 16.3467V11.5L21.5 10.3291V17.5L12 23L2.5 17.5V6.5L12 1L15.1416 2.81836ZM18.5293 2.31934C18.7059 1.8935 19.2943 1.89349 19.4707 2.31934L19.7236 2.93066C20.1556 3.97346 20.9615 4.80618 21.9746 5.25684L22.6924 5.57617C23.1026 5.75901 23.1026 6.3562 22.6924 6.53906L21.9326 6.87695C20.9449 7.31624 20.1534 8.11944 19.7139 9.12793L19.4668 9.69336C19.2864 10.1075 18.7137 10.1075 18.5332 9.69336L18.2871 9.12793C17.8476 8.11929 17.0552 7.31628 16.0674 6.87695L15.3076 6.53906C14.8974 6.35622 14.8974 5.75899 15.3076 5.57617L16.0254 5.25684C17.0385 4.80618 17.8445 3.97348 18.2764 2.93066L18.5293 2.31934Z'
    const REMIX_REFRESH_LINE = 'M5.46257 4.43262C7.21556 2.91688 9.5007 2 12 2C17.5228 2 22 6.47715 22 12C22 14.1361 21.3302 16.1158 20.1892 17.7406L17 12H20C20 7.58172 16.4183 4 12 4C9.84982 4 7.89777 4.84827 6.46023 6.22842L5.46257 4.43262ZM18.5374 19.5674C16.7844 21.0831 14.4993 22 12 22C6.47715 22 2 17.5228 2 12C2 9.86386 2.66979 7.88416 3.8108 6.25944L7 12H4C4 16.4183 7.58172 20 12 20C14.1502 20 16.1022 19.1517 17.5398 17.7716L18.5374 19.5674Z'
    const REMIX_FILTER_LINE = 'M21 4V6H20L15 13.5V22H9V13.5L4 6H3V4H21ZM6.4037 6L11 12.8944V20H13V12.8944L17.5963 6H6.4037Z'
    /**
     * Thin stroked chevron used by the artifacts filter trigger, matching the
     * shell's native dropdown caret rather than a filled arrow glyph.
     * @param {number} size - rendered edge length in pixels.
     * @returns {object} the SVG element.
     */
    function FilterCaretGlyph(size) {
      return React.createElement('svg', {
        viewBox: '0 0 24 24',
        width: size ?? 12,
        height: size ?? 12,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false'
      }, React.createElement('path', { d: 'M6 9.5 12 15.5 18 9.5' }))
    }
    const REMIX_FILE_LINE = 'M9 2.00318V2H19.9978C20.5513 2 21 2.45531 21 2.9918V21.0082C21 21.556 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5501 3 20.9932V8L9 2.00318ZM5.82918 8H9V4.83086L5.82918 8ZM11 4V9C11 9.55228 10.5523 10 10 10H5V20H19V4H11Z'
    const REMIX_BOOK_OPEN_LINE = 'M13 21V23H11V21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H9C10.1947 3 11.2671 3.52375 12 4.35418C12.7329 3.52375 13.8053 3 15 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H13ZM20 19V5H15C13.8954 5 13 5.89543 13 7V19H20ZM11 19V7C11 5.89543 10.1046 5 9 5H4V19H11Z'
    const REMIX_DOWNLOAD_LINE = 'M3 19H21V21H3V19ZM13 13.1716L19.0711 7.1005L20.4853 8.51472L12 17L3.51472 8.51472L4.92893 7.1005L11 13.1716V2H13V13.1716Z'
    const REMIX_CHECK_LINE = 'M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z'
    const REMIX_FILE_COPY_LINE = 'M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z'
    const REMIX_LINK = 'M18.3638 15.5355L16.9496 14.1213L18.3638 12.7071C20.3164 10.7545 20.3164 7.58866 18.3638 5.63604C16.4112 3.68341 13.2453 3.68341 11.2927 5.63604L9.87849 7.05025L8.46428 5.63604L9.87849 4.22182C12.6122 1.48815 17.0443 1.48815 19.778 4.22182C22.5117 6.95549 22.5117 11.3876 19.778 14.1213L18.3638 15.5355ZM15.5353 18.364L14.1211 19.7782C11.3875 22.5118 6.95531 22.5118 4.22164 19.7782C1.48797 17.0445 1.48797 12.6123 4.22164 9.87868L5.63585 8.46446L7.05007 9.87868L5.63585 11.2929C3.68323 13.2455 3.68323 16.4113 5.63585 18.364C7.58847 20.3166 10.7543 20.3166 12.7069 18.364L14.1211 16.9497L15.5353 18.364ZM14.8282 7.75736L16.2425 9.17157L9.17139 16.2426L7.75717 14.8284L14.8282 7.75736Z'

    /**
     * Render one inline Remix glyph.
     * @param {string} path - Remix path data.
     * @param {number} size - pixel size.
     * @param {string} [className] - optional class.
     * @returns {object} the SVG element.
     */
    function RemixGlyph(path, size, className, scale) {
      const shape = React.createElement('path', { d: path })
      return React.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'currentColor',
        className,
        'aria-hidden': true,
        focusable: 'false'
      }, scale === undefined
        ? shape
        : React.createElement('g', { transform: `translate(12 12) scale(${scale}) translate(-12 -12)` }, shape))
    }

    /**
     * The guide card's glyph: a generated 3D package (Remix ai-generate-3d-line).
     * @param {{ size?: number, className?: string }} props - slot-supplied icon props.
     * @returns {object} the SVG element.
     */
    function GuideIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18
      // Remix art fills its 24-unit box edge to edge, while the native guide
      // glyphs keep internal padding; scale it down to match their optical size.
      return RemixGlyph(REMIX_AI_GENERATE_3D_LINE, size, props.className, 0.72)
    }

    /**
     * The row's glyph: one file outline.
     * @returns {object} the SVG element.
     */
    function FileIcon() {
      return React.createElement('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true
      },
      React.createElement('path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z' }),
      React.createElement('path', { d: 'M14 3v5h5' }))
    }

    /**
     * One artifact row's leading glyph: an image thumbnail for image artifacts
     * (lazily loaded and rounded), the generic file outline otherwise. A
     * thumbnail that fails to load falls back to the outline so a row never
     * shows a broken-image glyph.
     * @param {{ artifact: object, origin: string | null }} props - row and Host origin.
     * @returns {object} the img or icon element.
     */
    function ArtifactGlyph(props) {
      const { artifact, origin } = props
      const [failed, setFailed] = React.useState(false)
      if (!isImageArtifact(artifact) || failed) {
        return React.createElement('span', { className: 'dsa-icon' }, FileIcon())
      }
      return React.createElement('img', {
        className: 'dsa-thumb',
        src: artifactUrl(artifact, 'inline', origin),
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        draggable: false,
        onError: () => setFailed(true)
      })
    }

    /**
     * The empty state's glyph: an open tray.
     * @returns {object} the SVG element.
     */
    function TrayIcon() {
      return React.createElement('svg', {
        width: 28,
        height: 28,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true
      },
      React.createElement('path', { d: 'M4 13.5 6.2 5.8A2 2 0 0 1 8.1 4.4h7.8a2 2 0 0 1 1.9 1.4L20 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z' }),
      React.createElement('path', { d: 'M4 13.5h4.6l1.2 2h4.4l1.2-2H20' }))
    }
    //#endregion

    //#region helpers
    /**
     * Resolve one Host route against the application's base URL.
     * @param {string} relative - route below the application root.
     * @returns {string} the absolute URL.
     */
    function appUrl(relative) {
      return new URL(relative, document.baseURI).href
    }

    /**
     * Build one raw-artifact URL, preferring the Host's LAN origin for links
     * shared with another device.
     * @param {object} artifact - row from the list response.
     * @param {'inline' | 'attachment'} disposition - inline rendering or download.
     * @param {string | null} origin - absolute origin reported by the Host.
     * @returns {string} the URL.
     */
    function rawUrl(artifact, disposition, origin) {
      let base = appUrl(RAW_ROUTE)
      if (typeof origin === 'string' && origin.length > 0) {
        try {
          const lanBase = new URL('api/session-artifacts.raw', origin.endsWith('/') ? origin : `${origin}/`)
          base = lanBase.href
        } catch {
          base = appUrl(RAW_ROUTE)
        }
      }
      const url = new URL(base)
      url.searchParams.set('path', artifact.path)
      url.searchParams.set('name', artifact.name)
      url.searchParams.set('disposition', disposition)
      return url.href
    }

    /**
     * Build the `dsh-resource://file/…` address the right Sidebar's document
     * preview claims for a Session file. The grammar mirrors
     * `@deepseek-ai/dsh-util-workspace-path` (component encoding, `:` kept for
     * Windows drives) so this plugin needs no extra client dependency.
     * @param {string} sessionId - authorizing Session.
     * @param {string} path - absolute file path.
     * @returns {string} the resource address.
     */
    function artifactFileAddress(sessionId, path) {
      const encode = (segment) => encodeURIComponent(segment).replace(/%3A/gi, ':')
      const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
      return `dsh-resource://file/session/${encode(sessionId)}/${normalized.split('/').map(encode).join('/')}`
    }

    /**
     * Build one user-provided attachment URL, preferring the Host's LAN origin
     * for links shared with another device.
     *
     * The query repeats the durable reference fields the Session log recorded
     * (never a host path); the Host's attachment store verifies the object
     * against them before serving any bytes.
     * @param {object} artifact - provided row from the list response.
     * @param {'inline' | 'attachment'} disposition - inline rendering or download.
     * @param {string | null} origin - absolute origin reported by the Host.
     * @returns {string} the URL.
     */
    function attachmentUrl(artifact, disposition, origin) {
      let base = appUrl(ATTACHMENT_ROUTE)
      if (typeof origin === 'string' && origin.length > 0) {
        try {
          const lanBase = new URL('api/session-artifacts.attachment', origin.endsWith('/') ? origin : `${origin}/`)
          base = lanBase.href
        } catch {
          base = appUrl(ATTACHMENT_ROUTE)
        }
      }
      const url = new URL(base)
      url.searchParams.set('attachmentId', artifact.attachmentId)
      if (typeof artifact.name === 'string' && artifact.name.length > 0) {
        url.searchParams.set('name', artifact.name)
      }
      if (typeof artifact.mediaType === 'string' && artifact.mediaType.length > 0) {
        url.searchParams.set('mediaType', artifact.mediaType)
      }
      if (typeof artifact.bytes === 'number') url.searchParams.set('bytes', String(artifact.bytes))
      if (typeof artifact.width === 'number') url.searchParams.set('width', String(artifact.width))
      if (typeof artifact.height === 'number') url.searchParams.set('height', String(artifact.height))
      url.searchParams.set('disposition', disposition)
      return url.href
    }

    /**
     * Build the current source URL for one artifact row: workspace files use the
     * raw path route, user-provided attachments use the attachment route.
     * @param {object} artifact - row from the list response.
     * @param {'inline' | 'attachment'} disposition - inline rendering or download.
     * @param {string | null} origin - absolute origin reported by the Host.
     * @returns {string} the URL.
     */
    function artifactUrl(artifact, disposition, origin) {
      return artifact.provided === true
        ? attachmentUrl(artifact, disposition, origin)
        : rawUrl(artifact, disposition, origin)
    }

    /**
     * Stable identity of one artifact row (a workspace path or an attachment id).
     * @param {object} artifact - row from the list response.
     * @returns {string} the row key.
     */
    function artifactKey(artifact) {
      return artifact.provided === true ? String(artifact.attachmentId) : artifact.path
    }

    /**
     * Whether one artifact row renders an image thumbnail.
     * @param {object} artifact - row from the list response.
     * @returns {boolean} true when the Host reports an image media type.
     */
    function isImageArtifact(artifact) {
      return typeof artifact.mime === 'string' && artifact.mime.startsWith('image/')
    }

    /**
     * Classify one artifact for content copying: text can be copied verbatim,
     * images are copied as a picture when the browser allows it, anything else
     * has no meaningful clipboard representation.
     * @param {object} artifact - row from the list response.
     * @returns {'text' | 'image' | 'none'} the content kind.
     */
    function artifactContentKind(artifact) {
      const mime = typeof artifact.mime === 'string' ? artifact.mime : ''
      if (mime.startsWith('image/')) return 'image'
      if (mime.startsWith('text/')
        || /^(?:application\/(?:json|xml|javascript|typescript|rtf|x-yaml|x-sh|x-httpd-php))/.test(mime)
        || /\.(?:md|markdown|txt|log|csv|tsv|json|ya?ml|xml|js|mjs|cjs|ts|tsx|jsx|css|scss|sass|sh|bash|zsh|py|go|rs|java|rb|php|html?|sql|diff|patch|ini|toml|cfg|conf)$/i.test(artifact.name)) {
        return 'text'
      }
      return 'none'
    }

    /**
     * Convert an image blob to PNG so the clipboard can take it.
     * @param {Blob} blob - source image bytes.
     * @returns {Promise<Blob | null>} PNG bytes, or null when conversion fails.
     */
    async function imageBlobToPng(blob) {
      try {
        const bitmap = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')
        if (context === null) return null
        context.drawImage(bitmap, 0, 0)
        bitmap.close?.()
        return await new Promise((resolve) => {
          try {
            canvas.toBlob((png) => resolve(png), 'image/png')
          } catch {
            resolve(null)
          }
        })
      } catch {
        return null
      }
    }

    /**
     * Copy an image by selecting a hidden `<img>` and issuing the legacy copy
     * command. Works on insecure origins where the async clipboard is missing;
     * the clipboard receives HTML containing the image, so rich editors paste it
     * as an image while plain-text targets may only see the alt text.
     * @param {string} url - inline image URL.
     * @param {string} name - display name used as alt text.
     * @returns {Promise<boolean>} whether the copy command succeeded.
     */
    async function copyImageViaSelection(url, name) {
      const host = document.createElement('div')
      host.setAttribute('contenteditable', 'true')
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;'
      const image = document.createElement('img')
      image.src = url
      image.alt = name
      host.appendChild(image)
      document.body.appendChild(host)
      try {
        await new Promise((resolve) => {
          if (image.complete) resolve()
          else {
            image.onload = resolve
            image.onerror = resolve
          }
        })
        if (!image.complete || image.naturalWidth === 0) return false
        const range = document.createRange()
        range.selectNodeContents(host)
        const selection = window.getSelection()
        if (selection === null) return false
        selection.removeAllRanges()
        selection.addRange(range)
        host.focus()
        const copied = document.execCommand('copy')
        selection.removeAllRanges()
        return copied
      } finally {
        host.remove()
      }
    }

    /**
     * Copy one artifact's content to the clipboard: text verbatim, images as a
     * picture when the async clipboard and ClipboardItem exist, otherwise the
     * legacy HTML-image clipboard path, then the inline URL as a last resort.
     * @param {object} artifact - row from the list response.
     * @param {string | null} origin - Host LAN origin for the inline URL.
     * @returns {Promise<boolean>} whether something was copied.
     */
    async function copyArtifactContent(artifact, origin) {
      const kind = artifactContentKind(artifact)
      if (kind === 'none') return false
      const url = artifactUrl(artifact, 'inline', origin)
      let response
      try {
        response = await fetch(url, { credentials: 'same-origin' })
      } catch {
        return false
      }
      if (!response.ok) return false
      if (kind === 'text') {
        try {
          return await copyText(await response.text())
        } catch {
          return false
        }
      }
      let imageBlob = null
      try {
        if (navigator.clipboard !== undefined && typeof ClipboardItem === 'function') {
          imageBlob = await response.blob()
          const png = imageBlob.type === 'image/png' ? imageBlob : await imageBlobToPng(imageBlob)
          if (png !== null) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
            return true
          }
        }
      } catch {
        // Fall through to the legacy/URL fallbacks.
      }
      // Plain-HTTP LAN pages have no async clipboard API. Selecting a hidden
      // image and running the legacy copy command still puts the image markup
      // on the clipboard, which rich editors paste as the picture itself.
      try {
        if (await copyImageViaSelection(url, artifact.name)) return true
      } catch {
        // Fall through to the URL fallback.
      }
      // Last resort: the inline URL is at least paste-able as text.
      return copyText(url)
    }

    /**
     * Open one artifact in the right Sidebar's native document preview
     * (workspace files + document preview), falling back to the raw route in a
     * browser tab when no preview type claims the address.
     * @param {object} sidebarRight - right Sidebar navigation service.
     * @param {string} sessionId - Session that owns the artifact rows.
     * @param {object} artifact - row from the list response.
     * @param {string | null} origin - Host LAN origin for the fallback URL.
     * @returns {boolean} whether the native preview handled the open.
     */
    function openArtifactPreview(sidebarRight, sessionId, artifact, origin) {
      try {
        sidebarRight.openResource(artifactFileAddress(sessionId, artifact.path))
        return true
      } catch {
        window.open(rawUrl(artifact, 'inline', origin), '_blank', 'noopener,noreferrer')
        return false
      }
    }

    /**
     * Human byte size.
     * @param {number} bytes - byte count.
     * @returns {string} compact size text.
     */
    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return ''
      if (bytes < 1024) return `${bytes} B`
      const units = ['KB', 'MB', 'GB', 'TB']
      let value = bytes / 1024
      let unit = 0
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
      }
      return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`
    }

    /**
     * Write text to the clipboard. Plain-HTTP pages have no async Clipboard API,
     * so the legacy selection path is the only fallback on a LAN deployment.
     * @param {string} text - text to copy.
     * @returns {Promise<boolean>} whether the copy was issued.
     */
    function copyText(text) {
      if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(
          () => true,
          () => fallbackCopy(text)
        )
      }
      return Promise.resolve(fallbackCopy(text))
    }

    /**
     * Copy through a temporary selected textarea.
     * @param {string} text - text to copy.
     * @returns {boolean} whether the browser accepted the copy command.
     */
    function fallbackCopy(text) {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.top = '-1px'
      area.style.left = '-1px'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      let copied = false
      try {
        copied = document.execCommand('copy')
      } catch {
        copied = false
      }
      area.remove()
      return copied
    }
    //#endregion

    //#region feature: hover quick look
    /**
     * Shared Quick Look-style hover preview used by the Artifacts rows and the
     * native Workspace files tree. The card is plain DOM appended to the body so
     * both surfaces can use it; content comes from the artifacts preview route.
     */
    const QUICKLOOK_CSS = `
.dsa-quicklook{position:fixed;z-index:1000;box-sizing:border-box;display:flex;flex-direction:column;max-height:min(560px,calc(100vh - 32px));overflow:hidden;border-radius:20px;border:1px solid var(--dsw-alias-border-l2,transparent);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);box-shadow:0 12px 36px rgb(0 0 0 / 16%),0 2px 8px rgb(0 0 0 / 6%);animation:dsa-quicklook-in .16s cubic-bezier(.22,1,.36,1)}
.dsa-quicklook-header{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid var(--dsw-alias-border-l2,transparent);min-width:0;flex:none}
.dsa-quicklook-title{min-width:0;flex:1}
.dsa-quicklook-name{font-size:14px;font-weight:600;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsa-quicklook-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:16px}
.dsa-quicklook-body{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--dsw-alias-bg-layer-2,transparent)}
.dsa-quicklook-layer{position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:center;overflow:auto;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}
.dsa-quicklook-layer-media{align-items:center}
.dsa-quicklook-layer .dsa-quicklook-image,.dsa-quicklook-layer .dsa-quicklook-media{margin:auto}
.dsa-quicklook-text{margin:0;padding:16px 20px;box-sizing:border-box;align-self:stretch;width:100%;font-family:var(--dsw-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:17px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary)}
.dsa-quicklook-image{display:block;max-width:100%;max-height:360px;object-fit:contain}
.dsa-quicklook-frame{width:100%;height:340px;border:0;background:#fff;align-self:stretch}
.dsa-quicklook-media{max-width:100%;max-height:340px}
.dsa-quicklook-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:32px 18px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsa-quicklook-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 20px 12px 40px;border-top:1px solid var(--dsw-alias-border-l2,transparent);flex:none}
.dsa-quicklook-note{color:var(--dsw-alias-label-tertiary);font-size:12px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsa-quicklook-actions{display:inline-flex;align-items:center;gap:6px;flex:none}
.dsa-quicklook-action{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;width:32px;height:32px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;text-decoration:none;transition:background .15s ease,color .15s ease}
.dsa-quicklook-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-quicklook-loading{padding:48px 20px;color:var(--dsw-alias-label-tertiary);font-size:13px}
.dsa-quicklook-resize{position:absolute;left:0;bottom:0;z-index:3;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:nesw-resize;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l2,transparent);border-left:0;border-bottom:0;border-radius:0 10px 0 19px;box-shadow:2px -2px 6px rgb(0 0 0 / 6%);transition:background .15s ease,color .15s ease}
.dsa-quicklook-resize:hover{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-interactive-bg-hover)}
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
.dsa-md code{font-family:var(--dsw-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));padding:0 3px;border-radius:3px}
.dsa-md pre code{background:transparent;padding:0;font-size:inherit}
.dsa-md a{color:var(--dsw-alias-link);text-decoration:none}
.dsa-md a:hover{text-decoration:underline}
.dsa-md hr{border:0;border-top:1px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));margin:10px 0}
.dsa-md img{display:block;max-width:100%;height:auto;margin:0 0 9px;border-radius:4px}
.dsa-md table{border-collapse:collapse;margin:0 0 9px;font-size:11.5px;max-width:100%}
.dsa-md th,.dsa-md td{border:1px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));padding:3px 7px;text-align:left;vertical-align:top}
.dsa-code{font-family:var(--dsw-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:17.5px;white-space:pre;display:block;padding:16px 20px;color:var(--dsw-alias-label-secondary);align-self:stretch;width:100%;box-sizing:border-box;overflow:auto}
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

    /** Extension → highlighter language. */
    const QUICKLOOK_LANGUAGES = {
      js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
      ts: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts',
      json: 'json', jsonc: 'json', json5: 'json',
      css: 'css', scss: 'css', less: 'css',
      html: 'html', htm: 'html', vue: 'html', svelte: 'html', astro: 'html',
      xml: 'xml', svg: 'xml',
      sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', shell: 'shell',
      py: 'python', python: 'python',
      yaml: 'yaml', yml: 'yaml',
      go: 'go',
      rs: 'rust', rust: 'rust',
      java: 'java',
      c: 'c', h: 'c',
      cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp',
      kt: 'kotlin', kts: 'kotlin',
      swift: 'swift',
      rb: 'ruby', ruby: 'ruby',
      php: 'php',
      sql: 'sql',
      toml: 'toml',
      ini: 'ini',
      md: 'markdown', markdown: 'markdown',
      csv: '', tsv: '', txt: '', log: '', text: ''
    }

    /** Common fence aliases → canonical language ids. */
    const QUICKLOOK_LANGUAGE_ALIASES = {
      javascript: 'js', js: 'js', node: 'js',
      typescript: 'ts', ts: 'ts',
      shell: 'shell', sh: 'shell', bash: 'shell', zsh: 'shell', console: 'shell',
      python: 'python', py: 'python',
      yaml: 'yaml', yml: 'yaml',
      markdown: 'markdown', md: 'markdown',
      'c++': 'cpp', cpp: 'cpp', cxx: 'cpp',
      golang: 'go', go: 'go',
      rs: 'rust', rust: 'rust',
      rb: 'ruby', ruby: 'ruby',
      kt: 'kotlin', kotlin: 'kotlin',
      html5: 'html', xml: 'xml', svg: 'xml',
      sql: 'sql', php: 'php', java: 'java', swift: 'swift',
      toml: 'toml', ini: 'ini', c: 'c', h: 'c'
    }

    /** Per-language keyword and builtin sets. Booleans are handled separately. */
    const QUICKLOOK_KEYWORDS = {
      js: {
        keywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'new', 'this', 'typeof', 'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw', 'switch', 'case', 'break', 'continue', 'delete', 'void', 'yield', 'static', 'get', 'set', 'super'],
        builtins: ['console', 'document', 'window', 'globalThis', 'Math', 'JSON', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp', 'Error', 'Symbol', 'BigInt', 'Intl', 'Reflect', 'Proxy']
      },
      ts: {
        keywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'new', 'this', 'typeof', 'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw', 'switch', 'case', 'break', 'continue', 'delete', 'void', 'yield', 'static', 'get', 'set', 'super', 'interface', 'type', 'enum', 'implements', 'public', 'private', 'protected', 'readonly', 'declare', 'namespace', 'as', 'satisfies', 'keyof', 'infer', 'any', 'string', 'number', 'boolean', 'unknown', 'never', 'abstract', 'override', 'module'],
        builtins: ['console', 'document', 'window', 'globalThis', 'Math', 'JSON', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp', 'Error', 'Symbol', 'Partial', 'Record', 'Readonly', 'Pick', 'Omit', 'Required', 'ReturnType', 'Parameters', 'Awaited']
      },
      python: {
        keywords: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'lambda', 'yield', 'async', 'await', 'pass', 'break', 'continue', 'raise', 'and', 'or', 'not', 'in', 'is', 'global', 'nonlocal', 'assert', 'del', 'match', 'case'],
        builtins: ['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'open', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'sum', 'min', 'max', 'abs', 'isinstance', 'super', 'self', 'cls', 'Exception', 'ValueError', 'TypeError', 'KeyError']
      },
      shell: {
        keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'local', 'export', 'source', 'set', 'unset', 'readonly', 'shift', 'trap'],
        builtins: ['echo', 'cd', 'pwd', 'ls', 'cat', 'grep', 'sed', 'awk', 'curl', 'wget', 'git', 'npm', 'pnpm', 'node', 'python3', 'pip', 'mkdir', 'rm', 'cp', 'mv', 'chmod', 'chown', 'sudo', 'printf', 'read', 'test', 'exit', 'eval', 'exec']
      },
      json: { keywords: [], builtins: [] },
      yaml: { keywords: [], builtins: [] },
      css: { keywords: [], builtins: [] },
      html: { keywords: [], builtins: [] },
      xml: { keywords: [], builtins: [] },
      go: {
        keywords: ['package', 'import', 'func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'defer', 'go', 'select', 'map', 'struct', 'interface', 'type', 'var', 'const', 'chan', 'fallthrough'],
        builtins: ['fmt', 'strings', 'strconv', 'errors', 'os', 'time', 'sync', 'context', 'bytes', 'bufio', 'io', 'log', 'math', 'rand', 'sort', 'make', 'len', 'cap', 'new', 'append', 'copy', 'delete', 'close', 'panic', 'recover', 'print', 'println']
      },
      rust: {
        keywords: ['fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'impl', 'trait', 'for', 'while', 'loop', 'if', 'else', 'match', 'return', 'use', 'mod', 'pub', 'crate', 'self', 'super', 'where', 'async', 'await', 'move', 'ref', 'in', 'as', 'break', 'continue', 'dyn', 'box', 'unsafe', 'extern'],
        builtins: ['String', 'Vec', 'Option', 'Result', 'Some', 'None', 'Ok', 'Err', 'Box', 'Rc', 'Arc', 'RefCell', 'Mutex', 'HashMap', 'HashSet', 'BTreeMap', 'println', 'vec', 'format']
      },
      java: {
        keywords: ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'static', 'final', 'abstract', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'new', 'this', 'super', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'void', 'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short'],
        builtins: ['System', 'String', 'Integer', 'Long', 'Double', 'Boolean', 'Object', 'List', 'Map', 'Set', 'ArrayList', 'HashMap', 'HashSet', 'StringBuilder', 'Math']
      },
      c: {
        keywords: ['int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'signed', 'struct', 'union', 'enum', 'typedef', 'static', 'extern', 'const', 'volatile', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'goto', 'sizeof'],
        builtins: ['printf', 'fprintf', 'sprintf', 'malloc', 'calloc', 'realloc', 'free', 'NULL', 'stdin', 'stdout', 'stderr', 'FILE']
      },
      cpp: {
        keywords: ['class', 'namespace', 'template', 'typename', 'public', 'private', 'protected', 'virtual', 'override', 'final', 'new', 'delete', 'this', 'using', 'auto', 'constexpr', 'nullptr', 'const', 'static', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'struct', 'enum'],
        builtins: ['std', 'cout', 'cin', 'cerr', 'endl', 'vector', 'string', 'map', 'set', 'unique_ptr', 'shared_ptr', 'optional', 'size_t']
      },
      ruby: {
        keywords: ['def', 'class', 'module', 'end', 'if', 'elsif', 'else', 'unless', 'while', 'until', 'for', 'in', 'do', 'return', 'yield', 'begin', 'rescue', 'ensure', 'raise', 'require', 'require_relative', 'attr_accessor', 'attr_reader', 'attr_writer', 'self', 'super'],
        builtins: ['puts', 'print', 'p', 'gets', 'loop', 'each', 'map', 'select', 'reject', 'reduce']
      },
      php: {
        keywords: ['function', 'class', 'interface', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'return', 'if', 'else', 'elseif', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'new', 'echo', 'print', 'require', 'include', 'namespace', 'use', 'try', 'catch', 'finally', 'throw'],
        builtins: ['isset', 'empty', 'array', 'count', 'strlen', 'json_encode', 'json_decode', 'str_replace', 'explode', 'implode']
      },
      sql: {
        keywords: ['select', 'from', 'where', 'insert', 'update', 'delete', 'create', 'table', 'join', 'left', 'right', 'inner', 'outer', 'on', 'group', 'by', 'order', 'limit', 'offset', 'values', 'into', 'set', 'as', 'and', 'or', 'not', 'is', 'like', 'in', 'between', 'union', 'all', 'distinct'],
        builtins: ['count', 'sum', 'avg', 'min', 'max']
      },
      kotlin: {
        keywords: ['fun', 'val', 'var', 'class', 'object', 'interface', 'data', 'enum', 'sealed', 'when', 'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'package', 'import', 'as', 'is', 'in', 'throw', 'try', 'catch', 'finally', 'this', 'super'],
        builtins: ['println', 'print', 'listOf', 'mapOf', 'setOf', 'mutableListOf', 'Array', 'String', 'Int', 'Long', 'Double', 'Boolean']
      },
      swift: {
        keywords: ['func', 'let', 'var', 'class', 'struct', 'enum', 'protocol', 'extension', 'import', 'if', 'else', 'for', 'while', 'repeat', 'switch', 'case', 'default', 'return', 'break', 'continue', 'guard', 'defer', 'throw', 'throws', 'try', 'catch', 'as', 'is', 'in', 'self', 'super'],
        builtins: ['print', 'String', 'Int', 'Double', 'Bool', 'Array', 'Dictionary', 'Set', 'Optional']
      },
      toml: { keywords: [], builtins: [] },
      ini: { keywords: [], builtins: [] },
      markdown: { keywords: [], builtins: [] }
    }

    /**
     * Escape one literal for a regular expression.
     * @param {string} text - source text.
     * @returns {string} escaped text.
     */
    function escapeRegExp(text) {
      return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    /**
     * Build the tokenizer for one language. Groups run in precedence order:
     * comments, strings, language-specific literals, keywords, builtins,
     * functions, types, numbers, operators, punctuation.
     * @param {string} language - highlighter language id.
     * @returns {{ regex: RegExp, classes: string[] } | null} tokenizer or null.
     */
    function codeTokenizer(language) {
      const spec = QUICKLOOK_KEYWORDS[language]
      if (spec === undefined) return null
      const parts = []
      const classes = []
      const add = function (source, className) {
        parts.push(source)
        classes.push(className)
      }
      const slashComments = ['js', 'ts', 'go', 'rust', 'java', 'c', 'cpp', 'kotlin', 'swift', 'php', 'sql']
      const hashComments = ['python', 'shell', 'yaml', 'toml', 'ini', 'ruby']
      const markup = language === 'html' || language === 'xml'
      if (slashComments.indexOf(language) !== -1) add('//[^\\n]*|/\\*[\\s\\S]*?\\*/', 'comment')
      if (hashComments.indexOf(language) !== -1) add('#[^\\n]*', 'comment')
      if (markup) add('<!--[\\s\\S]*?-->', 'comment')
      if (language === 'python') add("'''[\\s\\S]*?'''|\"\"\"[\\s\\S]*?\"\"\"", 'string')
      if (language === 'json') {
        add('"(?:\\\\.|[^"\\\\\\n])*"(?=\\s*:)', 'property')
        add('"(?:\\\\.|[^"\\\\\\n])*"', 'string')
      } else {
        const template = language === 'js' || language === 'ts' ? '|`(?:\\\\.|[^`\\\\])*`' : ''
        add('"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'' + template, 'string')
      }
      if (language === 'python') add('@[A-Za-z_][\\w.]*', 'decorator')
      if (language === 'shell') add('\\$\\{[^}]*\\}|\\$[A-Za-z_][\\w]*|\\$[0-9@#?$!*-]', 'variable')
      if (language === 'ruby') add(':[A-Za-z_][\\w!?]*', 'symbol')
      if (markup) {
        add('<!DOCTYPE[^>]*>', 'comment')
        add('</?[A-Za-z][\\w:-]*', 'tag')
        add('[A-Za-z_:][-\\w:.]*(?==)', 'attr')
      }
      if (language === 'css' || language === 'scss' || language === 'less') {
        add('@[A-Za-z-]+', 'keyword')
        add('#[0-9a-fA-F]{3,8}', 'number')
        add('[A-Za-z-]+(?=\\s*:)', 'property')
      }
      if (language === 'yaml' || language === 'toml' || language === 'ini') {
        add('^[ \\t-]*[A-Za-z0-9_.-]+(?=\\s*[:=])', 'property')
      }
      add('\\b(?:true|false|null|undefined|None|True|False|nil|NULL)\\b', 'boolean')
      if (spec.keywords.length > 0) add('\\b(?:' + spec.keywords.map(escapeRegExp).join('|') + ')\\b', 'keyword')
      if (spec.builtins.length > 0) add('\\b(?:' + spec.builtins.map(escapeRegExp).join('|') + ')\\b', 'builtin')
      add('\\b[A-Za-z_$][\\w$]*(?=\\s*\\()', 'function')
      add('\\b[A-Z][A-Za-z0-9_$]*\\b', 'type')
      add('\\b(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?)\\b', 'number')
      add('[-+*/%=<>!&|^~?:]+', 'operator')
      add('[{}()\\[\\];,.]', 'punct')
      try {
        const regex = new RegExp(parts.map(function (part) { return '(' + part + ')' }).join('|'), 'gm')
        return { regex, classes }
      } catch {
        return null
      }
    }

    /**
     * Build one tokenized `<code>` element.
     * @param {string} code - source text.
     * @param {string} language - highlighter language id, empty for plain text.
     * @returns {HTMLElement} the code element.
     */
    function quickLookCodeElement(code, language) {
      const element = document.createElement('code')
      element.className = 'dsa-code'
      const tokenizer = language.length > 0 ? codeTokenizer(language) : null
      if (tokenizer === null) {
        element.textContent = code
        return element
      }
      let last = 0
      for (const match of code.matchAll(tokenizer.regex)) {
        if (match[0].length === 0) continue
        const index = match.index ?? 0
        if (index > last) element.appendChild(document.createTextNode(code.slice(last, index)))
        let kind = ''
        for (let group = 0; group < tokenizer.classes.length; group += 1) {
          if (match[group + 1] !== undefined) {
            kind = tokenizer.classes[group]
            break
          }
        }
        if (kind === '') {
          element.appendChild(document.createTextNode(match[0]))
        } else {
          const span = document.createElement('span')
          span.className = 'tok-' + kind
          span.textContent = match[0]
          element.appendChild(span)
        }
        last = index + match[0].length
      }
      if (last < code.length) element.appendChild(document.createTextNode(code.slice(last)))
      return element
    }

    /**
     * Parse the leading language of a Markdown fence and map it.
     * @param {string} fence - text after the opening backticks.
     * @param {string} fileName - enclosing file name for a fallback.
     * @returns {string} highlighter language id.
     */
    function fenceLanguage(fence, fileName) {
      const language = String(fence ?? '').trim().toLowerCase()
      if (language === '') return languageForFile(fileName)
      const normalized = QUICKLOOK_LANGUAGE_ALIASES[language] ?? language
      return QUICKLOOK_KEYWORDS[normalized] === undefined ? '' : normalized
    }

    /**
     * Pick a highlighter language from a file name.
     * @param {string} name - file name.
     * @returns {string} language id, empty when unknown.
     */
    function languageForFile(name) {
      const extension = String(name ?? '').split('.').pop().toLowerCase()
      return QUICKLOOK_LANGUAGES[extension] ?? ''
    }

    /**
     * Build one inline Markdown fragment into an element.
     * @param {HTMLElement} parent - target element.
     * @param {string} text - inline source.
     * @param {object} context - enclosing file descriptor.
     * @returns {void}
     */
    function appendMarkdownInline(parent, text, context) {
      const pattern = /`[^`]*`|!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~/g
      let last = 0
      for (const match of text.matchAll(pattern)) {
        const token = match[0]
        const index = match.index ?? 0
        if (index > last) parent.appendChild(document.createTextNode(text.slice(last, index)))
        if (token.startsWith('`')) {
          const code = document.createElement('code')
          code.textContent = token.slice(1, -1)
          parent.appendChild(code)
        } else if (token.startsWith('![')) {
          const close = token.indexOf('](')
          const alt = token.slice(2, close)
          const src = token.slice(close + 2, -1).trim()
          const resolved = resolveMarkdownImage(src, context)
          if (resolved !== null) {
            const image = document.createElement('img')
            image.src = resolved
            image.alt = alt
            image.loading = 'lazy'
            parent.appendChild(image)
          } else {
            parent.appendChild(document.createTextNode(alt))
          }
        } else if (token.startsWith('[')) {
          const close = token.indexOf('](')
          const label = token.slice(1, close)
          const href = token.slice(close + 2, -1).trim()
          if (/^https?:\/\//i.test(href)) {
            const link = document.createElement('a')
            link.href = href
            link.target = '_blank'
            link.rel = 'noopener noreferrer'
            link.textContent = label
            parent.appendChild(link)
          } else {
            parent.appendChild(document.createTextNode(label))
          }
        } else if (token.startsWith('**') || token.startsWith('__')) {
          const strong = document.createElement('strong')
          strong.textContent = token.slice(2, -2)
          parent.appendChild(strong)
        } else if (token.startsWith('~~')) {
          const del = document.createElement('del')
          del.textContent = token.slice(2, -2)
          parent.appendChild(del)
        } else {
          const emphasis = document.createElement('em')
          emphasis.textContent = token.slice(1, -1)
          parent.appendChild(emphasis)
        }
        last = index + token.length
      }
      if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)))
    }

    /**
     * Resolve one Markdown image source against the previewed file.
     * @param {string} src - authored source.
     * @param {object} context - enclosing file descriptor.
     * @returns {string | null} a raw URL, or null when local resolution fails.
     */
    function resolveMarkdownImage(src, context) {
      if (/^https?:\/\//i.test(src)) return src
      if (context === undefined || typeof context.path !== 'string') return null
      let decoded = src
      try {
        decoded = decodeURI(src)
      } catch {
        decoded = src
      }
      if (decoded.startsWith('/')) return artifactRawUrl(decoded, basenameOf(decoded), 'inline')
      const directory = context.path.replace(/[\\/][^\\/]*$/, '')
      const parts = (directory + '/' + decoded).replace(/\\/g, '/').split('/')
      const normalized = []
      for (const part of parts) {
        if (part === '' && normalized.length === 0) {
          normalized.push('')
          continue
        }
        if (part === '' || part === '.') continue
        if (part === '..') {
          if (normalized.length > 1) normalized.pop()
          continue
        }
        normalized.push(part)
      }
      const target = normalized.join('/')
      if (target === '') return null
      return artifactRawUrl(target, basenameOf(target), 'inline')
    }

    /**
     * Render a small, safe Markdown subset into DOM.
     * @param {string} text - Markdown source.
     * @param {object} context - enclosing file descriptor.
     * @returns {HTMLElement} the rendered block.
     */
    function renderMarkdown(text, context) {
      const root = document.createElement('div')
      root.className = 'dsa-md'
      const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
      let index = 0
      const special = (line) => /^(#{1,6}\s|```|>\s?|\s*(?:[-*+]|\d+[.)])\s+|\s*(?:-{3,}|\*{3,})\s*$)/.test(line)
      while (index < lines.length) {
        const line = lines[index]
        if (line.trim() === '') {
          index += 1
          continue
        }
        const fence = line.match(/^```\s*([A-Za-z0-9_+#.-]*)\s*$/)
        if (fence !== null) {
          const language = fenceLanguage(fence[1], context?.name)
          index += 1
          const code = []
          while (index < lines.length && !/^```\s*$/.test(lines[index])) {
            code.push(lines[index])
            index += 1
          }
          index += 1
          const pre = document.createElement('pre')
          pre.appendChild(quickLookCodeElement(code.join('\n'), language))
          root.appendChild(pre)
          continue
        }
        const heading = line.match(/^(#{1,6})\s+(.*)$/)
        if (heading !== null) {
          const element = document.createElement('h' + heading[1].length)
          appendMarkdownInline(element, heading[2].trim(), context)
          root.appendChild(element)
          index += 1
          continue
        }
        if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) {
          root.appendChild(document.createElement('hr'))
          index += 1
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          const quote = document.createElement('blockquote')
          const paragraphs = []
          while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
            paragraphs.push(lines[index].replace(/^\s*>\s?/, ''))
            index += 1
          }
          appendMarkdownInline(quote, paragraphs.join(' ').trim(), context)
          root.appendChild(quote)
          continue
        }
        const listMatch = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/)
        if (listMatch !== null) {
          const ordered = /^\d/.test(listMatch[1])
          const list = document.createElement(ordered ? 'ol' : 'ul')
          while (index < lines.length) {
            const item = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/)
            if (item === null || /^\d/.test(item[1]) !== ordered) break
            const entry = document.createElement('li')
            appendMarkdownInline(entry, item[2].trim(), context)
            list.appendChild(entry)
            index += 1
          }
          root.appendChild(list)
          continue
        }
        if (line.includes('|') && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[index + 1])) {
          const cellsOf = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map(function (cell) { return cell.trim() })
          const table = document.createElement('table')
          const headRow = document.createElement('tr')
          for (const cell of cellsOf(line)) {
            const th = document.createElement('th')
            appendMarkdownInline(th, cell, context)
            headRow.appendChild(th)
          }
          const thead = document.createElement('thead')
          thead.appendChild(headRow)
          table.appendChild(thead)
          index += 2
          const tbody = document.createElement('tbody')
          while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
            const row = document.createElement('tr')
            for (const cell of cellsOf(lines[index])) {
              const td = document.createElement('td')
              appendMarkdownInline(td, cell, context)
              row.appendChild(td)
            }
            tbody.appendChild(row)
            index += 1
          }
          table.appendChild(tbody)
          root.appendChild(table)
          continue
        }
        const paragraph = []
        while (index < lines.length && lines[index].trim() !== '' && !special(lines[index])) {
          paragraph.push(lines[index])
          index += 1
        }
        const element = document.createElement('p')
        appendMarkdownInline(element, paragraph.join(' '), context)
        root.appendChild(element)
      }
      return root
    }

    /** Localized labels copied from the panel namespace at install time. */
    let quickLookLabels = {
      loading: 'Loading preview…',
      unavailable: 'No preview available',
      truncated: 'Preview truncated',
      open: 'Open',
      download: 'Download'
    }

    /** localStorage key remembering the resized preview box across visits. */
    const QUICKLOOK_SIZE_KEY = 'dsh-power-suite.quicklook.size'

    // Geometry mirrors the Dex extension popup panel: 570px default width,
    // 800px maximum, 400px minimum height; every value is still clamped to the
    // viewport before use.
    const QUICKLOOK_DEFAULT_WIDTH = 570
    const QUICKLOOK_MIN_WIDTH = 380
    const QUICKLOOK_MAX_WIDTH = 800
    const QUICKLOOK_MIN_HEIGHT = 280
    const QUICKLOOK_DEFAULT_HEIGHT = 360
    const QUICKLOOK_CACHE_LIMIT = 120
    const QUICKLOOK_CACHE_TTL_MS = 30000
    const QUICKLOOK_ROW_EXIT_FALLBACK = 1000
    const QUICKLOOK_CARD_EXIT_DELAY = 300

    /**
     * Read the remembered preview box.
     * @returns {{ width: number, height: number } | null} saved size, when valid.
     */
    function loadQuickLookSize() {
      try {
        const raw = localStorage.getItem(QUICKLOOK_SIZE_KEY)
        if (raw === null) return null
        const value = JSON.parse(raw)
        if (value === null || typeof value !== 'object') return null
        if (typeof value.width !== 'number' || typeof value.height !== 'number') return null
        if (!Number.isFinite(value.width) || !Number.isFinite(value.height)) return null
        return { width: value.width, height: value.height }
      } catch {
        return null
      }
    }

    /**
     * Persist the current preview box.
     * @param {number} width - card width.
     * @param {number} height - card height.
     * @returns {void}
     */
    function saveQuickLookSize(width, height) {
      const size = { width: Math.round(width), height: Math.round(height) }
      quickLookState.size = size
      try {
        localStorage.setItem(QUICKLOOK_SIZE_KEY, JSON.stringify(size))
      } catch {
        // Storage can be unavailable; the in-memory size still applies.
      }
    }

    /** Shared hover-preview state. */
    const quickLookState = {
      card: null,
      current: null,
      cache: new Map(),
      size: loadQuickLookSize(),
      resizing: false,
      enteredCard: false,
      lastCardDistance: null,
      pendingRow: null,
      pendingEntry: null,
      phase: 'idle',
      timer: null,
      switchToken: 0,
      lastPointer: null,
      switchDirection: 1,
      abort: null
    }

    /**
     * Last path segment of a file path.
     * @param {string} path - file path.
     * @returns {string} the file name.
     */
    function basenameOf(path) {
      return String(path).split(/[\\/]/).pop() ?? ''
    }

    /**
     * Build one raw-artifact URL for a bare path.
     * @param {string} path - absolute file path.
     * @param {string} name - display file name.
     * @param {'inline' | 'attachment'} disposition - inline rendering or download.
     * @returns {string} the URL.
     */
    function artifactRawUrl(path, name, disposition) {
      const url = new URL(appUrl(RAW_ROUTE))
      url.searchParams.set('path', path)
      url.searchParams.set('name', name)
      url.searchParams.set('disposition', disposition)
      return url.href
    }

    /**
     * Build one SVG element from inline Remix path data.
     * @param {string} path - path data.
     * @param {number} size - pixel size.
     * @returns {SVGElement} the SVG element.
     */
    function quickLookSvg(path, size) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', String(size))
      svg.setAttribute('height', String(size))
      svg.setAttribute('fill', 'currentColor')
      svg.setAttribute('aria-hidden', 'true')
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      shape.setAttribute('d', path)
      svg.appendChild(shape)
      return svg
    }

    /**
     * Whether the user prefers reduced motion.
     * @returns {boolean} true when animations should be skipped.
     */
    function quickLookReducedMotion() {
      return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }

    /**
     * Whether a point is inside a rectangle (optionally with a margin).
     * @param {DOMRectReadOnly} rect - rectangle.
     * @param {number} x - viewport x.
     * @param {number} y - viewport y.
     * @param {number} margin - extra pixels around the rectangle.
     * @returns {boolean} true when inside.
     */
    function pointInRect(rect, x, y, margin) {
      return x >= rect.left - margin && x <= rect.right + margin
        && y >= rect.top - margin && y <= rect.bottom + margin
    }

    /**
     * Distance from a point to the nearest edge of the preview card (0 inside).
     * @param {number} x - viewport x.
     * @param {number} y - viewport y.
     * @returns {number} pixel distance.
     */
    function quickLookCardDistance(x, y) {
      const card = quickLookState.card
      if (card === null) return Number.POSITIVE_INFINITY
      const rect = card.getBoundingClientRect()
      const dx = Math.max(rect.left - x, 0, x - rect.right)
      const dy = Math.max(rect.top - y, 0, y - rect.bottom)
      return Math.hypot(dx, dy)
    }

    /**
     * Whether a point is inside the traversal area between the source row and
     * the preview card. This is the rectangular-bridge form of Floating UI's
     * `safePolygon`: a generous rectangle covering both elements, so a diagonal
     * move from the row towards the card is not treated as leaving.
     * @param {number} x - viewport x.
     * @param {number} y - viewport y.
     * @returns {boolean} true when inside the traversal area.
     */
    function quickLookTraversalContains(x, y) {
      const card = quickLookState.card
      if (card === null) return false
      const cardRect = card.getBoundingClientRect()
      if (pointInRect(cardRect, x, y, 48)) return true
      const current = quickLookState.current
      if (current === null || !current.element.isConnected) return false
      const rowRect = current.element.getBoundingClientRect()
      if (pointInRect(rowRect, x, y, 48)) return true
      const bounds = {
        left: Math.min(cardRect.left, rowRect.left),
        right: Math.max(cardRect.right, rowRect.right),
        top: Math.min(cardRect.top, rowRect.top),
        bottom: Math.max(cardRect.bottom, rowRect.bottom)
      }
      return pointInRect(bounds, x, y, 48)
    }

    /**
     * Locate the file row a pointer is over, in either supported surface.
     * @param {EventTarget | null} target - event target.
     * @returns {{ element: HTMLElement, path: string, name: string } | null} the row.
     */
    function quickLookRowAt(target) {
      if (!(target instanceof Element)) return null
      if (target.closest('.dsa-quicklook') !== null) return null
      if (target.closest('.dsa-actions') !== null) return null
      const artifact = target.closest('li[data-artifact-path]')
      if (artifact !== null && artifact.getAttribute('data-artifact-path') !== null) {
        const path = artifact.getAttribute('data-artifact-path')
        return { element: artifact, path, name: artifact.getAttribute('data-artifact-name') ?? basenameOf(path) }
      }
      const provided = target.closest('li[data-artifact-provided="true"]')
      if (provided !== null && provided.getAttribute('data-artifact-attachment-id') !== null) {
        const attachment = {
          attachmentId: provided.getAttribute('data-artifact-attachment-id'),
          name: provided.getAttribute('data-artifact-name') ?? '',
          mediaType: provided.getAttribute('data-artifact-media-type') ?? ''
        }
        const bytes = Number(provided.getAttribute('data-artifact-bytes'))
        if (Number.isFinite(bytes)) attachment.bytes = bytes
        const width = Number(provided.getAttribute('data-artifact-width'))
        if (Number.isFinite(width)) attachment.width = width
        const height = Number(provided.getAttribute('data-artifact-height'))
        if (Number.isFinite(height)) attachment.height = height
        const name = attachment.name.length > 0 ? attachment.name : basenameOf(attachment.attachmentId)
        return {
          element: provided,
          provided: true,
          attachment,
          name,
          inlineUrl: attachmentUrl(attachment, 'inline', null),
          downloadUrl: attachmentUrl(attachment, 'attachment', null)
        }
      }
      const file = target.closest('li[data-files-entry="file"][data-files-path]')
      if (file !== null && file.closest('[data-files-navigator]') !== null) {
        const path = file.getAttribute('data-files-path')
        if (path === null || path === '') return null
        return { element: file, path, name: basenameOf(path) }
      }
      return null
    }

    /**
     * Open the row's own primary action when the card's Open control is used.
     * @param {HTMLElement} element - row element.
     * @returns {(() => void) | null} click callback, when the row has one.
     */
    function quickLookOpenHandler(element) {
      const button = element.querySelector('.dsa-action') ?? element.querySelector('button')
      if (button === null) return null
      return () => {
        button.click()
      }
    }

    /**
     * Cancel and clear the single hover-preview timer.
     * @returns {void}
     */
    function clearQuickLookTimer() {
      if (quickLookState.timer !== null) {
        window.clearTimeout(quickLookState.timer)
        quickLookState.timer = null
      }
    }

    /**
     * Move to a phase and arm its one timer. A phase owns exactly one timer, so
     * a close timer can never race an opening/switching timer.
     * @param {'opening' | 'open' | 'switching' | 'closing'} phase - next phase.
     * @param {number} delay - timer delay.
     * @param {Function} action - timer callback.
     * @returns {void}
     */
    function enterQuickLookPhase(phase, delay, action) {
      clearQuickLookTimer()
      quickLookState.phase = phase
      quickLookState.timer = window.setTimeout(() => {
        quickLookState.timer = null
        action()
      }, delay)
    }

    /**
     * Cancel a pending close and return to the open phase.
     * @returns {void}
     */
    function cancelQuickLookClose() {
      if (quickLookState.phase !== 'closing') return
      clearQuickLookTimer()
      quickLookState.phase = quickLookState.card === null ? 'idle' : 'open'
    }

    /**
     * Close the card and abort its pending read.
     * @returns {void}
     */
    function closeQuickLook() {
      clearQuickLookTimer()
      quickLookState.phase = 'idle'
      quickLookState.pendingRow = null
      quickLookState.pendingEntry = null
      quickLookState.switchToken += 1
      quickLookState.lastPointer = null
      if (quickLookState.abort !== null) {
        quickLookState.abort.abort()
        quickLookState.abort = null
      }
      if (quickLookState.card !== null) {
        quickLookState.card.remove()
        quickLookState.card = null
      }
      quickLookState.current = null
      quickLookState.enteredCard = false
      quickLookState.lastCardDistance = null
    }

    /**
     * Arm the delayed open/switch for one row.
     * @param {object} entry - hover entry.
     * @returns {void}
     */
    function armQuickLookOpen(entry) {
      quickLookState.pendingRow = entry.element
      quickLookState.pendingEntry = entry
      enterQuickLookPhase(quickLookState.card === null ? 'opening' : 'switching', 420, () => {
        const row = entry.element
        quickLookState.pendingRow = null
        quickLookState.pendingEntry = null
        if (!row.isConnected) return
        const pointer = quickLookState.lastPointer
        if (pointer !== null) {
          const under = document.elementFromPoint(pointer.x, pointer.y)
          const underRow = under instanceof Element ? quickLookRowAt(under)?.element ?? null : null
          if (underRow !== row) return
        }
        if (quickLookState.card === null) openQuickLook(entry)
        else switchQuickLook(entry)
      })
    }

    /**
     * Close after a short grace period so the pointer can reach the card.
     * @returns {void}
     */
    function scheduleQuickLookClose(delay) {
      if (quickLookState.resizing === true) return
      if (quickLookState.phase === 'opening' || quickLookState.phase === 'switching') return
      enterQuickLookPhase('closing', typeof delay === 'number' ? delay : QUICKLOOK_CARD_EXIT_DELAY, closeQuickLook)
    }

    /**
     * Position the card beside the hovered row, preferring the free side.
     * @param {HTMLElement} card - card element.
     * @param {HTMLElement} element - hovered row.
     * @returns {void}
     */
    function positionQuickLook(card, element) {
      const rect = element.getBoundingClientRect()
      const saved = quickLookState.size
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const maxWidth = Math.min(QUICKLOOK_MAX_WIDTH, viewportWidth - 24)
      const minWidth = Math.min(QUICKLOOK_MIN_WIDTH, maxWidth)
      const width = Math.max(minWidth, Math.min(saved === null ? QUICKLOOK_DEFAULT_WIDTH : saved.width, maxWidth))
      const maxHeight = viewportHeight - 32
      const minHeight = Math.min(QUICKLOOK_MIN_HEIGHT, maxHeight)
      const height = saved === null
        ? Math.max(minHeight, Math.min(QUICKLOOK_DEFAULT_HEIGHT, maxHeight))
        : Math.max(minHeight, Math.min(saved.height, maxHeight))
      let left = rect.left - width - 14
      if (left < 8) left = Math.min(rect.right + 14, viewportWidth - width - 8)
      left = Math.max(8, left)
      const top = Math.max(8, Math.min(rect.top - 12, viewportHeight - height - 8))
      card.style.left = Math.round(left) + 'px'
      card.style.top = Math.round(top) + 'px'
      card.style.width = Math.round(width) + 'px'
      // The content layers are absolutely positioned inside the body, so the
      // card needs an explicit height even before the user resizes it.
      card.style.height = Math.round(height) + 'px'
      card.style.maxHeight = 'calc(100vh - 16px)'
    }

    /**
     * Create the shared card shell once.
     * @returns {HTMLElement} the card element.
     */
    function ensureQuickLookCard() {
      if (quickLookState.card !== null) return quickLookState.card
      const card = document.createElement('aside')
      card.className = 'dsa-quicklook'
      card.setAttribute('role', 'dialog')
      const header = document.createElement('div')
      header.className = 'dsa-quicklook-header'
      const icon = document.createElement('span')
      icon.className = 'dsa-icon'
      icon.appendChild(quickLookSvg(REMIX_FILE_LINE, 16))
      const title = document.createElement('div')
      title.className = 'dsa-quicklook-title'
      const name = document.createElement('div')
      name.className = 'dsa-quicklook-name'
      const meta = document.createElement('div')
      meta.className = 'dsa-quicklook-meta'
      title.append(name, meta)
      header.append(icon, title)
      const body = document.createElement('div')
      body.className = 'dsa-quicklook-body'
      const footer = document.createElement('div')
      footer.className = 'dsa-quicklook-footer'
      const note = document.createElement('span')
      note.className = 'dsa-quicklook-note'
      const actions = document.createElement('div')
      actions.className = 'dsa-quicklook-actions'
      footer.append(note, actions)
      const handle = document.createElement('div')
      handle.className = 'dsa-quicklook-resize'
      handle.setAttribute('role', 'separator')
      handle.setAttribute('aria-label', quickLookLabels.resize)
      handle.title = quickLookLabels.resize
      const resizeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      resizeIcon.setAttribute('viewBox', '0 0 24 24')
      resizeIcon.setAttribute('width', '16')
      resizeIcon.setAttribute('height', '16')
      resizeIcon.setAttribute('fill', 'none')
      resizeIcon.setAttribute('stroke', 'currentColor')
      resizeIcon.setAttribute('stroke-width', '1.6')
      resizeIcon.setAttribute('stroke-linecap', 'round')
      resizeIcon.setAttribute('stroke-linejoin', 'round')
      resizeIcon.setAttribute('aria-hidden', 'true')
      const resizeShape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      resizeShape.setAttribute('d', 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7')
      resizeIcon.appendChild(resizeShape)
      handle.appendChild(resizeIcon)
      handle.addEventListener('dblclick', (event) => {
        event.preventDefault()
        event.stopPropagation()
        quickLookState.size = null
        try {
          localStorage.removeItem(QUICKLOOK_SIZE_KEY)
        } catch {
          // Storage can be unavailable; the in-memory default still applies.
        }
        const current = quickLookState.current
        if (current !== null) positionQuickLook(card, current.element)
      })
      handle.addEventListener('mousedown', (event) => {
        if (quickLookState.card === null) return
        event.stopPropagation()
        const card = quickLookState.card
        const rect = card.getBoundingClientRect()
        const start = {
          x: event.clientX,
          y: event.clientY,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
          right: rect.left + rect.width
        }
        quickLookState.resizing = true
        card.setAttribute('data-resizing', 'true')
        card.style.maxHeight = 'calc(100vh - 16px)'
        cancelQuickLookClose()
        const onMove = (moveEvent) => {
          const maxWidth = Math.min(QUICKLOOK_MAX_WIDTH, start.right - 8)
          const minWidth = Math.min(QUICKLOOK_MIN_WIDTH, maxWidth)
          const maxHeight = window.innerHeight - start.top - 12
          const minHeight = Math.min(QUICKLOOK_MIN_HEIGHT, maxHeight)
          const width = Math.max(minWidth, Math.min(maxWidth, start.width + (start.x - moveEvent.clientX)))
          const height = Math.max(minHeight, Math.min(maxHeight, start.height + (moveEvent.clientY - start.y)))
          card.style.left = Math.round(start.right - width) + 'px'
          card.style.width = Math.round(width) + 'px'
          card.style.height = Math.round(height) + 'px'
        }
        const onUp = () => {
          document.removeEventListener('mousemove', onMove, true)
          document.removeEventListener('mouseup', onUp)
          quickLookState.resizing = false
          card.removeAttribute('data-resizing')
          const box = card.getBoundingClientRect()
          saveQuickLookSize(box.width, box.height)
        }
        document.addEventListener('mousemove', onMove, true)
        document.addEventListener('mouseup', onUp)
      })
      card.append(header, body, footer, handle)
      card.addEventListener('mouseenter', () => {
        quickLookState.enteredCard = true
        cancelQuickLookClose()
      })
      card.addEventListener('mouseleave', () => scheduleQuickLookClose(QUICKLOOK_CARD_EXIT_DELAY))
      document.body.appendChild(card)
      quickLookState.card = card
      return card
    }

    /**
     * Render the card footer actions for one entry.
     * @param {object} entry - hover entry.
     * @param {HTMLElement} card - card element.
     * @returns {void}
     */
    function renderQuickLookActions(entry, card) {
      const actions = card.querySelector('.dsa-quicklook-actions')
      actions.replaceChildren()
      if (typeof entry.onOpen === 'function') {
        const open = document.createElement('button')
        open.type = 'button'
        open.className = 'dsa-quicklook-action'
        open.title = quickLookLabels.open
        open.setAttribute('aria-label', quickLookLabels.open)
        open.appendChild(quickLookSvg(REMIX_BOOK_OPEN_LINE, 18))
        open.addEventListener('click', () => {
          closeQuickLook()
          entry.onOpen()
        })
        actions.appendChild(open)
      }
      const download = document.createElement('a')
      download.className = 'dsa-quicklook-action'
      download.title = quickLookLabels.download
      download.setAttribute('aria-label', quickLookLabels.download)
      download.href = entry.downloadUrl !== undefined ? entry.downloadUrl : artifactRawUrl(entry.path, entry.name, 'attachment')
      download.download = entry.name
      download.appendChild(quickLookSvg(REMIX_DOWNLOAD_LINE, 18))
      actions.appendChild(download)
    }

    /**
     * Replace the card body with loading feedback.
     * @param {HTMLElement} card - card element.
     * @returns {void}
     */
    function showQuickLookLoading(card) {
      const body = card.querySelector('.dsa-quicklook-body')
      body.replaceChildren()
      const loading = document.createElement('div')
      loading.className = 'dsa-quicklook-loading'
      loading.textContent = quickLookLabels.loading
      body.appendChild(loading)
    }

    /**
     * Render one preview descriptor into the card.
     * @param {object} entry - hover entry.
     * @param {object} data - Host descriptor.
     * @returns {void}
     */
    /**
     * Build one content layer for a descriptor.
     * @param {object} entry - hover entry.
     * @param {object | undefined} data - Host descriptor, undefined for unavailable.
     * @returns {HTMLElement} the layer.
     */
    function buildQuickLookLayer(entry, data) {
      const layer = document.createElement('div')
      layer.className = 'dsa-quicklook-layer'
      if (data === undefined) {
        layer.classList.add('dsa-quicklook-layer-media')
        const empty = document.createElement('div')
        empty.className = 'dsa-quicklook-empty'
        empty.appendChild(quickLookSvg(REMIX_FILE_LINE, 16))
        const label = document.createElement('span')
        label.textContent = quickLookLabels.unavailable
        empty.appendChild(label)
        layer.appendChild(empty)
        return layer
      }
      if (data.kind === 'image' || data.kind === 'media') layer.classList.add('dsa-quicklook-layer-media')
      const inlineUrl = entry.inlineUrl !== undefined ? entry.inlineUrl : artifactRawUrl(entry.path, entry.name, 'inline')
      if (data.kind === 'image') {
        const image = document.createElement('img')
        image.className = 'dsa-quicklook-image'
        image.src = inlineUrl
        image.alt = entry.name
        image.loading = 'lazy'
        layer.appendChild(image)
      } else if (data.kind === 'media') {
        const video = typeof data.mime === 'string' && data.mime.startsWith('video/')
        const media = document.createElement(video ? 'video' : 'audio')
        media.className = 'dsa-quicklook-media'
        media.src = inlineUrl
        media.controls = true
        media.preload = 'metadata'
        layer.appendChild(media)
      } else if (data.kind === 'pdf' || data.kind === 'html') {
        const frame = document.createElement('iframe')
        frame.className = 'dsa-quicklook-frame'
        frame.src = inlineUrl
        frame.title = entry.name
        if (data.kind === 'html') frame.setAttribute('sandbox', '')
        layer.appendChild(frame)
      } else if (data.kind === 'text') {
        const isMarkdown = /\.(md|markdown)$/i.test(entry.name) || (typeof data.mime === 'string' && data.mime.startsWith('text/markdown'))
        if (isMarkdown) {
          layer.appendChild(renderMarkdown(data.text ?? '', entry))
        } else {
          const language = languageForFile(entry.name)
          if (language === '') {
            const pre = document.createElement('pre')
            pre.className = 'dsa-quicklook-text'
            pre.textContent = data.text ?? ''
            layer.appendChild(pre)
          } else {
            layer.appendChild(quickLookCodeElement(data.text ?? '', language))
          }
        }
      } else {
        layer.classList.add('dsa-quicklook-layer-media')
        const empty = document.createElement('div')
        empty.className = 'dsa-quicklook-empty'
        empty.appendChild(quickLookSvg(REMIX_FILE_LINE, 16))
        const label = document.createElement('span')
        label.textContent = quickLookLabels.unavailable
        empty.appendChild(label)
        layer.appendChild(empty)
      }
      return layer
    }

    /**
     * Mount a content layer, crossfading from the previous one (Material's
     * "fade through" with a shared-axis vertical offset).
     * @param {HTMLElement} card - card element.
     * @param {HTMLElement} layer - new content layer.
     * @returns {void}
     */
    function mountQuickLookLayer(card, layer) {
      const body = card.querySelector('.dsa-quicklook-body')
      if (body === null) return
      const previous = [...body.querySelectorAll('.dsa-quicklook-layer')].pop() ?? null
      for (const old of body.querySelectorAll('.dsa-quicklook-layer')) {
        if (old !== previous) old.remove()
      }
      body.replaceChildren()
      body.appendChild(layer)
      if (previous !== null) body.appendChild(previous)
      const reduced = quickLookReducedMotion()
      if (reduced) {
        previous?.remove()
        return
      }
      if (previous === null) {
        // No inline opacity style: if the animation is dropped (throttled tab,
        // canceled animation) the layer is still visible at its natural opacity.
        layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' })
        return
      }
      const direction = quickLookState.switchDirection || 1
      const title = card.querySelector('.dsa-quicklook-title')
      if (title !== null) {
        title.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 160, easing: 'cubic-bezier(0,0,0,1)' })
      }
      // Outgoing fades out while the incoming layer fades in over it; both use a
      // small vertical shared-axis offset in the list's direction of travel.
      previous.animate([
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(' + (-direction * 6) + 'px)' }
      ], { duration: 160, easing: 'ease-in', fill: 'forwards' })
      const incoming = layer.animate([
        { opacity: 0, transform: 'translateY(' + (direction * 6) + 'px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 200, delay: 20, easing: 'cubic-bezier(0,0,0,1)' })
      const dropPrevious = () => previous.remove()
      incoming.onfinish = dropPrevious
      // Fallback for a canceled or never-finishing animation.
      window.setTimeout(dropPrevious, 400)
    }

    function renderQuickLook(entry, data) {
      const card = quickLookState.card
      if (card === null || quickLookState.current !== entry) return
      card.querySelector('.dsa-quicklook-name').textContent = entry.name
      card.querySelector('.dsa-quicklook-meta').textContent = typeof data.mime === 'string' ? data.mime : ''
      const note = []
      if (typeof data.size === 'number') note.push(formatBytes(data.size))
      if (data.truncated === true) note.push(quickLookLabels.truncated)
      card.querySelector('.dsa-quicklook-note').textContent = note.join(' · ')
      mountQuickLookLayer(card, buildQuickLookLayer(entry, data))
    }

    /**
     * Replace the card body with the unavailable state.
     * @param {object} entry - hover entry.
     * @returns {void}
     */
    function renderQuickLookUnavailable(entry) {
      const card = quickLookState.card
      if (card === null || quickLookState.current !== entry) return
      card.querySelector('.dsa-quicklook-name').textContent = entry.name
      card.querySelector('.dsa-quicklook-meta').textContent = ''
      card.querySelector('.dsa-quicklook-note').textContent = ''
      mountQuickLookLayer(card, buildQuickLookLayer(entry, undefined))
    }

    /**
     * Fetch and render one preview descriptor.
     * @param {object} entry - hover entry.
     * @returns {Promise<void>} resolves after rendering or failure.
     */
    /**
     * Build a preview descriptor for one user-provided attachment without the
     * workspace preview route: images and media use their attachment URL, text
     * files are fetched read-only and clipped, everything else is unavailable.
     * @param {object} entry - provided-row hover entry.
     * @returns {Promise<object | undefined>} descriptor, or undefined on failure.
     */
    async function providedQuickLookData(entry) {
      const mime = entry.attachment.mediaType
      const bytes = entry.attachment.bytes
      const size = typeof bytes === 'number' ? bytes : undefined
      if (mime.startsWith('image/')) return { mime, size, previewable: true, kind: 'image' }
      if (mime.startsWith('video/') || mime.startsWith('audio/')) return { mime, size, previewable: true, kind: 'media' }
      const textLike = mime.startsWith('text/')
        || /^(?:application\/(?:json|xml|javascript|typescript|x-yaml|x-sh|x-httpd-php))/.test(mime)
        || /\.(?:md|markdown|txt|log|csv|tsv|json|ya?ml|xml|js|mjs|cjs|ts|tsx|jsx|css|scss|sass|sh|bash|zsh|py|go|rs|java|rb|php|html?|sql|diff|patch)$/i.test(entry.name)
      if (!textLike) {
        return { mime: mime.length > 0 ? mime : 'application/octet-stream', size, previewable: false, kind: 'binary' }
      }
      try {
        const response = await fetch(entry.inlineUrl, { credentials: 'same-origin' })
        if (!response.ok) return undefined
        const text = await response.text()
        const limit = 64 * 1024
        return {
          mime: mime.length > 0 ? mime : 'text/plain; charset=utf-8',
          size,
          previewable: true,
          kind: 'text',
          text: text.slice(0, limit),
          truncated: text.length > limit
        }
      } catch {
        return undefined
      }
    }

    /**
     * Fetch (or reuse) the preview descriptor for one entry.
     * @param {object} entry - hover entry.
     * @returns {Promise<object | undefined>} descriptor, or undefined on failure.
     */
    async function requestQuickLookData(entry) {
      const cacheKey = entry.provided === true ? 'attachment:' + entry.attachment.attachmentId : entry.path
      const cached = quickLookState.cache.get(cacheKey)
      if (cached !== undefined) {
        if (Date.now() - cached.at < QUICKLOOK_CACHE_TTL_MS) return cached.data
        quickLookState.cache.delete(cacheKey)
      }
      if (entry.provided === true) return providedQuickLookData(entry)
      if (quickLookState.abort !== null) quickLookState.abort.abort()
      const controller = new AbortController()
      quickLookState.abort = controller
      try {
        const query = 'path=' + encodeURIComponent(entry.path) + '&name=' + encodeURIComponent(entry.name)
        const response = await fetch(appUrl(PREVIEW_ROUTE + '?' + query), {
          signal: controller.signal,
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          priority: 'high'
        })
        if (!response.ok) throw new Error('HTTP ' + response.status)
        const data = await response.json()
        if (quickLookState.cache.size >= QUICKLOOK_CACHE_LIMIT && !quickLookState.cache.has(cacheKey)) {
          const oldest = quickLookState.cache.keys().next().value
          if (oldest !== undefined) quickLookState.cache.delete(oldest)
        }
        quickLookState.cache.set(cacheKey, { data, at: Date.now() })
        return data
      } catch {
        return undefined
      }
    }


    /**
     * Load and render a descriptor for the initial open path.
     * @param {object} entry - hover entry.
     * @returns {Promise<void>} resolves after rendering.
     */
    async function loadQuickLook(entry) {
      const data = await requestQuickLookData(entry)
      if (quickLookState.card === null || quickLookState.current !== entry) return
      if (data === undefined) {
        renderQuickLookUnavailable(entry)
        return
      }
      renderQuickLook(entry, data)
    }

    /**
     * Open the card for one hover entry.
     * @param {object} entry - hover entry.
     * @returns {void}
     */
    function openQuickLook(entry) {
      clearQuickLookTimer()
      const card = ensureQuickLookCard()
      quickLookState.phase = 'open'
      quickLookState.current = entry
      quickLookState.enteredCard = false
      quickLookState.lastCardDistance = null
      quickLookState.pendingRow = null
      quickLookState.switchToken += 1
      positionQuickLook(card, entry.element)
      card.querySelector('.dsa-quicklook-name').textContent = entry.name
      card.querySelector('.dsa-quicklook-meta').textContent = ''
      card.querySelector('.dsa-quicklook-note').textContent = ''
      renderQuickLookActions(entry, card)
      showQuickLookLoading(card)
      void loadQuickLook(entry)
    }

    /**
     * Swap the card to another file without removing and re-adding it. The old
     * content fades out, the card slides from its old position to the new one,
     * and the new content fades in. A single state phase owns the transition, so
     * no close timer can race it.
     * @param {object} entry - hover entry for the next file.
     * @returns {void}
     */
    function switchQuickLook(entry) {
      const card = quickLookState.card
      if (card === null) {
        openQuickLook(entry)
        return
      }
      clearQuickLookTimer()
      if (quickLookState.abort !== null) {
        quickLookState.abort.abort()
        quickLookState.abort = null
      }
      quickLookState.phase = 'switching'
      quickLookState.pendingRow = null
      quickLookState.lastCardDistance = null
      quickLookState.enteredCard = false
      const token = ++quickLookState.switchToken
      const reduced = quickLookReducedMotion()
      const previousRect = card.getBoundingClientRect()
      const previousEntry = quickLookState.current
      const previousRowRect = previousEntry !== null && previousEntry.element.isConnected
        ? previousEntry.element.getBoundingClientRect()
        : null
      const nextRowRect = entry.element.getBoundingClientRect()
      quickLookState.switchDirection = previousRowRect === null
        ? 1
        : (Math.sign(nextRowRect.top - previousRowRect.top) || 1)
      quickLookState.current = entry
      positionQuickLook(card, entry.element)
      card.querySelector('.dsa-quicklook-note').textContent = quickLookLabels.loading
      renderQuickLookActions(entry, card)
      if (!reduced) {
        const nextRect = card.getBoundingClientRect()
        const dx = previousRect.left - nextRect.left
        const dy = previousRect.top - nextRect.top
        const animation = card.animate([
          { transform: 'translate(' + dx + 'px, ' + dy + 'px)' },
          { transform: 'translate(0, 0)' }
        ], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
        animation.onfinish = () => {
          card.style.transform = ''
        }
      }
      // Keep the current body visible until the next descriptor is ready, then
      // swap content and fade the new content in. The card itself never fades.
      void requestQuickLookData(entry).then((data) => {
        if (token !== quickLookState.switchToken || quickLookState.card !== card) return
        quickLookState.phase = 'open'
        if (data === undefined) {
          renderQuickLookUnavailable(entry)
        } else {
              renderQuickLook(entry, data)
        }
        const pointer = quickLookState.lastPointer
        if (pointer !== null && !quickLookTraversalContains(pointer.x, pointer.y)) {
          scheduleQuickLookClose(QUICKLOOK_CARD_EXIT_DELAY)
        }
      })
    }

    /**
     * Install the shared hover-preview surface for both the Artifacts panel and
     * the native Workspace files tree.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installQuickLook(ctx) {
      const t = ctx.locale.bind(NS)
      quickLookLabels = {
        loading: t('preview.loading'),
        unavailable: t('preview.unavailable'),
        truncated: t('preview.truncated'),
        open: t('action.open'),
        download: t('action.download'),
        resize: t('preview.resize')
      }
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.powerSuiteCss = 'quicklook'
        tag.textContent = QUICKLOOK_CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'power-suite: quick look styles')
      ctx.effect(() => {
        const onOver = (event) => {
          if (quickLookState.resizing === true) return
          const row = quickLookRowAt(event.target)
          if (row === null) return
          cancelQuickLookClose()
          if (quickLookState.current !== null && quickLookState.current.element === row.element) return
          armQuickLookOpen({ ...row, onOpen: quickLookOpenHandler(row.element) })
        }
        const onOut = (event) => {
          if (quickLookState.resizing === true) return
          const row = quickLookRowAt(event.target)
          if (row === null) return
          const related = event.relatedTarget
          if (related instanceof Node && row.element.contains(related)) return
          if ((quickLookState.phase === 'opening' || quickLookState.phase === 'switching')
            && quickLookState.pendingRow === row.element) {
            clearQuickLookTimer()
            quickLookState.phase = quickLookState.card === null ? 'idle' : 'open'
            quickLookState.pendingRow = null
            quickLookState.pendingEntry = null
          }
          if (related instanceof Node && quickLookState.card !== null && quickLookState.card.contains(related)) return
          if (quickLookState.phase === 'opening' || quickLookState.phase === 'switching') return
          if (quickLookTraversalContains(event.clientX, event.clientY)) return
          scheduleQuickLookClose(QUICKLOOK_ROW_EXIT_FALLBACK)
        }
        const onClose = (event) => {
          const card = quickLookState.card
          if (card !== null && event.target instanceof Node && card.contains(event.target)) return
          closeQuickLook()
        }
        const onMove = (event) => {
          quickLookState.lastPointer = { x: event.clientX, y: event.clientY }
          if (quickLookState.phase === 'opening' || quickLookState.phase === 'switching') {
            const pendingRow = quickLookState.pendingRow
            const pendingEntry = quickLookState.pendingEntry
            if (pendingRow !== null && pendingEntry !== null && pendingRow.isConnected) {
              const rect = pendingRow.getBoundingClientRect()
              if (pointInRect(rect, event.clientX, event.clientY, 0)) {
                armQuickLookOpen(pendingEntry)
              }
            }
            return
          }
          const card = quickLookState.card
          if (card === null) return
          const distance = quickLookCardDistance(event.clientX, event.clientY)
          const approaching = quickLookState.lastCardDistance !== null
            && distance < quickLookState.lastCardDistance - 1
          quickLookState.lastCardDistance = distance
          if (distance === 0) {
            quickLookState.enteredCard = true
            cancelQuickLookClose()
            return
          }
          const current = quickLookState.current
          if (current !== null && current.element.isConnected) {
            const rowRect = current.element.getBoundingClientRect()
            if (pointInRect(rowRect, event.clientX, event.clientY, 0)) {
              cancelQuickLookClose()
              return
            }
          }
          if (!quickLookState.enteredCard && quickLookTraversalContains(event.clientX, event.clientY)) {
            cancelQuickLookClose()
            return
          }
          if (approaching) {
            cancelQuickLookClose()
            return
          }
          if (quickLookState.phase !== 'closing') {
            scheduleQuickLookClose(QUICKLOOK_CARD_EXIT_DELAY)
          }
        }
        const onKey = (event) => {
          if (event.key === 'Escape') closeQuickLook()
        }
        const onWindowLeave = () => {
          if (quickLookState.phase !== 'opening' && quickLookState.phase !== 'switching') return
          clearQuickLookTimer()
          quickLookState.phase = quickLookState.card === null ? 'idle' : 'open'
          quickLookState.pendingRow = null
          quickLookState.pendingEntry = null
        }
        const onDismiss = (event) => {
          const card = quickLookState.card
          if (card === null || !(event.target instanceof Node)) return
          if (card.contains(event.target)) return
          const current = quickLookState.current
          if (current !== null && current.element.isConnected && current.element.contains(event.target)) return
          closeQuickLook()
        }
        document.addEventListener('mouseover', onOver, true)
        document.addEventListener('mousedown', onDismiss, true)
        document.addEventListener('mouseout', onOut, true)
        document.addEventListener('scroll', onClose, true)
        document.addEventListener('mousemove', onMove, true)
        document.addEventListener('keydown', onKey)
        document.documentElement.addEventListener('mouseleave', onWindowLeave)
        window.addEventListener('blur', onWindowLeave)
        window.addEventListener('resize', onClose)
        return () => {
          document.removeEventListener('mouseover', onOver, true)
          document.removeEventListener('mouseout', onOut, true)
          document.removeEventListener('mousedown', onDismiss, true)
          document.removeEventListener('scroll', onClose, true)
          document.removeEventListener('mousemove', onMove, true)
          document.removeEventListener('keydown', onKey)
          document.documentElement.removeEventListener('mouseleave', onWindowLeave)
          window.removeEventListener('blur', onWindowLeave)
          window.removeEventListener('resize', onClose)
          closeQuickLook()
        }
      }, 'power-suite: quick look listeners')
    }
    //#endregion
    //#region panel
    /** Artifact source filters, in display order. */
    const FILTER_OPTIONS = ['all', 'generated', 'provided']

    /**
     * Render the artifact list for one Session.
     * @param {{ sessionId: string, t: Function }} props - Session scope and copy.
     * @returns {object} the panel element.
     */
    function ArtifactsPanel(props) {
      const { sessionId, t, sidebarRight } = props
      const [phase, setPhase] = React.useState('loading')
      const [payload, setPayload] = React.useState(null)
      const [failure, setFailure] = React.useState('')
      const [reload, setReload] = React.useState(0)
      const [copiedPath, setCopiedPath] = React.useState(null)
      const [copiedContentKey, setCopiedContentKey] = React.useState(null)
      const [filter, setFilter] = React.useState('all')
      const [filterOpen, setFilterOpen] = React.useState(false)
      const filterWrapRef = React.useRef(null)
      const filterMenuRef = React.useRef(null)

      React.useEffect(() => {
        let active = true
        const controller = new AbortController()
        setPhase('loading')
        setFailure('')
        fetch(appUrl(LIST_ROUTE) + `?sessionId=${encodeURIComponent(sessionId)}`, {
          signal: controller.signal,
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
          .then(async (response) => {
            if (!response.ok) {
              let message = `HTTP ${response.status}`
              try {
                const body = await response.json()
                if (body !== null && typeof body === 'object' && typeof body.message === 'string') {
                  message = body.message
                }
              } catch {
                // Keep the status text.
              }
              throw new Error(message)
            }
            return response.json()
          })
          .then((value) => {
            if (!active) return
            setPayload(value)
            setPhase('ready')
          })
          .catch((error) => {
            if (!active || error?.name === 'AbortError') return
            setFailure(error?.message ? String(error.message) : String(error))
            setPhase('error')
          })
        return () => {
          active = false
          controller.abort()
        }
      }, [sessionId, reload])

      // A different Session starts from the whole list, so a filter cannot hide
      // every new row.
      React.useEffect(() => {
        setFilter('all')
        setFilterOpen(false)
      }, [sessionId])

      // The dropdown closes on any outside press and on Escape; opening it moves
      // focus to the selected option so the menu is usable without a pointer.
      React.useEffect(() => {
        if (!filterOpen) return undefined
        const onPointerDown = (event) => {
          const wrap = filterWrapRef.current
          if (wrap !== null && event.target instanceof Node && wrap.contains(event.target)) return
          setFilterOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          setFilterOpen(false)
          const trigger = filterWrapRef.current?.querySelector('.dsa-filter-trigger')
          if (trigger instanceof HTMLElement) trigger.focus()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        const selected = filterMenuRef.current?.querySelector('[aria-checked="true"]')
        if (selected instanceof HTMLElement) selected.focus()
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [filterOpen])

      /**
       * Copy one artifact's LAN link and acknowledge briefly on its row.
       * @param {object} artifact - the row.
       * @returns {void}
       */
      function onCopy(artifact) {
        copyText(artifactUrl(artifact, 'inline', payload?.origin ?? null)).then((copied) => {
          if (!copied) return
          const key = artifactKey(artifact)
          setCopiedPath(key)
          window.setTimeout(() => {
            setCopiedPath((current) => (current === key ? null : current))
          }, 1600)
        })
      }

      /**
       * Copy one artifact's content and acknowledge briefly on its row.
       * @param {object} artifact - the row.
       * @returns {void}
       */
      function onCopyContent(artifact) {
        const key = artifactKey(artifact)
        copyArtifactContent(artifact, payload?.origin ?? null).then((copied) => {
          if (!copied) return
          setCopiedContentKey(key)
          window.setTimeout(() => {
            setCopiedContentKey((current) => (current === key ? null : current))
          }, 1600)
        })
      }

      /**
       * Open one artifact: workspace files through the right Sidebar's preview,
       * provided attachments through their inline URL (their bytes live in the
       * attachment store, not the workspace, so the native file preview cannot
       * claim them).
       * @param {object} artifact - the row.
       * @returns {void}
       */
      function onOpen(artifact) {
        if (artifact.provided === true) {
          window.open(attachmentUrl(artifact, 'inline', payload?.origin ?? null), '_blank', 'noopener,noreferrer')
          return
        }
        openArtifactPreview(sidebarRight, sessionId, artifact, payload?.origin ?? null)
      }

      // Artifacts that no longer exist cannot be opened or downloaded; the
      // Session log keeps them, but the panel shows only files that are still
      // on disk. The list route still reports the full set.
      const artifacts = (payload !== null && Array.isArray(payload.artifacts) ? payload.artifacts : [])
        .filter((artifact) => artifact.missing !== true)
      const origin = payload !== null && typeof payload.origin === 'string' ? payload.origin : null
      // "Generated" filters the session's own workspace artifacts (written or
      // delivered); provided rows are the attachments the user supplied.
      const generatedCount = artifacts.filter((artifact) => artifact.provided !== true).length
      const providedCount = artifacts.length - generatedCount
      const filterCounts = { all: artifacts.length, generated: generatedCount, provided: providedCount }
      const shownArtifacts = filter === 'all'
        ? artifacts
        : artifacts.filter((artifact) => (filter === 'provided' ? artifact.provided === true : artifact.provided !== true))
      let countText
      if (filter !== 'all') countText = t('list.countOf', { shown: shownArtifacts.length, total: artifacts.length })
      else if (artifacts.length === 1) countText = t('list.countOne')
      else countText = t('list.count', { count: artifacts.length })

      // A custom source-filter dropdown: filtering is purely client-side, so it
      // never re-reads the Session log. Counts describe the whole list; the
      // selected option's count is separate from the header's shown/total count.
      const filterMenu = filterOpen
        ? React.createElement('div', {
          className: 'dsa-filter-menu',
          role: 'menu',
          'aria-label': t('filter.label'),
          ref: filterMenuRef
        }, FILTER_OPTIONS.map((option) => React.createElement('button', {
          key: option,
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': filter === option,
          className: 'dsa-filter-option',
          'data-filter': option,
          onClick: () => {
            setFilter(option)
            setFilterOpen(false)
          }
        },
        React.createElement('span', { className: 'dsa-filter-option-label' }, t(`filter.${option}`)),
        React.createElement('span', { className: 'dsa-filter-option-count' }, filterCounts[option]),
        filter === option ? React.createElement('span', { className: 'dsa-filter-check' }, RemixGlyph(REMIX_CHECK_LINE, 14)) : null)))
        : null

      const filterTrigger = artifacts.length > 0
        ? React.createElement('div', { className: 'dsa-filter-wrap', ref: filterWrapRef },
          React.createElement('button', {
            type: 'button',
            className: 'dsa-filter-trigger',
            'aria-haspopup': 'menu',
            'aria-expanded': filterOpen,
            title: t('filter.label'),
            'aria-label': t('filter.label'),
            'data-filter': filter,
            onClick: () => setFilterOpen((value) => !value)
          },
          RemixGlyph(REMIX_FILTER_LINE, 12),
          React.createElement('span', { className: 'dsa-filter-trigger-label' }, t(`filter.${filter}`)),
          React.createElement('span', { className: 'dsa-filter-trigger-count' }, filterCounts[filter]),
          React.createElement('span', { className: 'dsa-filter-caret' }, FilterCaretGlyph(14))),
          filterMenu)
        : null

      const header = React.createElement('header', { className: 'dsa-header' },
        React.createElement('span', { className: 'dsa-count' }, phase === 'ready' ? countText : ''),
        React.createElement('div', { className: 'dsa-header-tools' },
          filterTrigger,
          React.createElement('button', {
            type: 'button',
            className: 'dsa-refresh',
            onClick: () => setReload((value) => value + 1),
            disabled: phase === 'loading',
            title: t('list.refresh'),
            'aria-label': t('list.refresh'),
            'data-loading': phase === 'loading' ? 'true' : undefined
          }, RemixGlyph(REMIX_REFRESH_LINE, 14))))

      if (phase === 'error') {
        return React.createElement('div', { className: 'dsa-root' },
          panelStyle(),
          header,
          React.createElement('div', { className: 'dsa-empty' },
            React.createElement('div', { className: 'dsa-empty-icon' }, TrayIcon()),
            React.createElement('div', { className: 'dsa-empty-title' }, t('list.error.title')),
            React.createElement('div', { className: 'dsa-empty-hint' }, failure),
            React.createElement('button', {
              type: 'button',
              className: 'dsa-retry',
              onClick: () => setReload((value) => value + 1)
            }, t('list.retry'))))
      }

      const rows = shownArtifacts.map((artifact) => {
        const key = artifactKey(artifact)
        const provided = artifact.provided === true
        const contentKind = artifactContentKind(artifact)
        const facts = provided
          ? [t('meta.provided')]
          : [artifact.presented === true ? t('meta.presented') : t('meta.generated'), t('meta.turn', { turn: artifact.turn })]
        if (provided && typeof artifact.promptOrdinal === 'number') {
          facts.push(t('meta.prompt', { prompt: artifact.promptOrdinal }))
        }
        if (typeof artifact.size === 'number') facts.push(formatBytes(artifact.size))
        return React.createElement('li', {
          className: 'dsa-row',
          key,
          ...(provided
            ? {
                'data-artifact-provided': 'true',
                'data-artifact-attachment-id': artifact.attachmentId,
                ...typeof (artifact.mime ?? artifact.mediaType) === 'string'
                  ? { 'data-artifact-media-type': artifact.mime ?? artifact.mediaType }
                  : {},
                ...typeof artifact.bytes === 'number' ? { 'data-artifact-bytes': String(artifact.bytes) } : {},
                ...typeof artifact.width === 'number' ? { 'data-artifact-width': String(artifact.width) } : {},
                ...typeof artifact.height === 'number' ? { 'data-artifact-height': String(artifact.height) } : {}
              }
            : { 'data-artifact-path': artifact.path }),
          'data-artifact-name': artifact.name
        },
        React.createElement(ArtifactGlyph, { artifact, origin }),
        React.createElement('div', { className: 'dsa-main' },
          React.createElement('div', { className: 'dsa-name', title: provided ? artifact.name : artifact.path }, artifact.name),
          React.createElement('div', { className: 'dsa-meta' }, facts.join(' · ')),
          artifact.description ? React.createElement('div', { className: 'dsa-desc' }, artifact.description) : null),
        React.createElement('div', { className: 'dsa-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'dsa-action',
            title: t('action.open'),
            'aria-label': t('action.open'),
            onClick: () => onOpen(artifact)
          }, RemixGlyph(REMIX_BOOK_OPEN_LINE, 16)),
          React.createElement('a', {
            className: 'dsa-action',
            title: t('action.download'),
            'aria-label': t('action.download'),
            href: artifactUrl(artifact, 'attachment', origin),
            download: artifact.name
          }, RemixGlyph(REMIX_DOWNLOAD_LINE, 16)),
          contentKind === 'none' ? null : React.createElement('button', {
            type: 'button',
            className: 'dsa-action',
            title: copiedContentKey === key
              ? t('action.copied')
              : t(contentKind === 'image' ? 'action.copyImage' : 'action.copyContent'),
            'aria-label': copiedContentKey === key
              ? t('action.copied')
              : t(contentKind === 'image' ? 'action.copyImage' : 'action.copyContent'),
            onClick: () => onCopyContent(artifact),
            'data-copied': copiedContentKey === key ? 'true' : undefined
          }, RemixGlyph(copiedContentKey === key ? REMIX_CHECK_LINE : REMIX_FILE_COPY_LINE, 16)),
          React.createElement('button', {
            type: 'button',
            className: 'dsa-action',
            title: copiedPath === key ? t('action.copied') : t('action.copy'),
            'aria-label': copiedPath === key ? t('action.copied') : t('action.copy'),
            onClick: () => onCopy(artifact),
            'data-copied': copiedPath === key ? 'true' : undefined
          }, RemixGlyph(copiedPath === key ? REMIX_CHECK_LINE : REMIX_LINK, 16))))
      })

      let body
      if (phase === 'loading' && payload === null) {
        body = React.createElement('div', { className: 'dsa-loading' }, t('list.loading'))
      } else if (artifacts.length === 0) {
        body = React.createElement('div', { className: 'dsa-empty' },
          React.createElement('div', { className: 'dsa-empty-icon' }, TrayIcon()),
          React.createElement('div', { className: 'dsa-empty-title' }, t('list.empty.title')),
          React.createElement('div', { className: 'dsa-empty-hint' }, t('list.empty.hint')))
      } else if (shownArtifacts.length === 0) {
        body = React.createElement('div', { className: 'dsa-empty' },
          React.createElement('div', { className: 'dsa-empty-icon' }, TrayIcon()),
          React.createElement('div', { className: 'dsa-empty-title' }, t('list.empty.filtered')))
      } else {
        body = React.createElement('ul', { className: 'dsa-list' }, rows)
      }

      return React.createElement('div', { className: 'dsa-root' },
        panelStyle(),
        header,
        body,
        artifacts.length > 0 ? React.createElement('footer', { className: 'dsa-footer' }, t('footer.note')) : null)
    }
    //#endregion

    //#region feature: workspace default presets — menu
    /** Built-in preset ids whose display names the host UI localizes itself. */
    const BUILT_IN_NAME_KEYS = {
      standard: 'preset.standard',
      ptc: 'preset.ptc',
      minimal: 'preset.minimal',
      cordis: 'preset.cordis'
    }

    /**
     * Display one preset's name: the published custom name when it has one,
     * the host's built-in label for a built-in id, else the raw id.
     * @param {Function} t - namespace-bound translate.
     * @param {{ id: string, name?: string }} preset - roster row or stored id.
     * @returns {string} the display name.
     */
    function presetDisplayName(t, preset) {
      if (typeof preset.name === 'string' && preset.name.length > 0) return preset.name
      const key = BUILT_IN_NAME_KEYS[preset.id]
      return key === undefined ? preset.id : t(key)
    }

    /**
     * The menu row's glyph: a small preset badge.
     * @returns {object} the SVG element.
     */
    function WorkspacePresetIcon() {
      return React.createElement('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true
      },
      React.createElement('rect', { x: 3.5, y: 5, width: 17, height: 14, rx: 4 }),
      React.createElement('path', { d: 'M8 10h8' }),
      React.createElement('path', { d: 'M8 14h5' }))
    }

    /**
     * Read the Agent preset roster for the menu.
     * @param {object} ctx - client root context.
     * @returns {Promise<{ ok: true, presets: object[] } | { ok: false }>} the roster or a failure.
     */
    async function readPresetRoster(ctx) {
      try {
        const result = await ctx.remote.agentPresets.list()
        if (result.ok === true) {
          const presets = result.value !== null && typeof result.value === 'object' && Array.isArray(result.value.presets)
            ? result.value.presets
            : []
          return { ok: true, presets }
        }
        if (result.error !== undefined && result.error !== null && result.error.code === 'gateway/invocation-unavailable') {
          return { ok: true, presets: [] }
        }
        return { ok: false }
      } catch {
        return { ok: false }
      }
    }

    /**
     * Read one Workspace's stored default preset.
     * @param {string} workspaceId - Workspace identity.
     * @param {AbortSignal} signal - menu preparation cancellation.
     * @returns {Promise<string | null>} the stored preset id, or null for none.
     */
    async function readWorkspacePreset(workspaceId, signal) {
      const response = await fetch(`${appUrl(PRESET_GET_ROUTE)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        signal,
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const value = await response.json()
      return value !== null && typeof value === 'object' && typeof value.preset === 'string' ? value.preset : null
    }

    /**
     * Store or clear one Workspace's default preset.
     * @param {string} workspaceId - Workspace identity.
     * @param {string | null} preset - preset id, or null for no override.
     * @returns {Promise<void>} resolves after the Host persisted the value.
     */
    async function writeWorkspacePreset(workspaceId, preset) {
      const response = await fetch(appUrl(PRESET_SET_ROUTE), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, preset })
      })
      if (response.ok) return
      let message = `HTTP ${response.status}`
      try {
        const body = await response.json()
        if (body !== null && typeof body === 'object' && typeof body.message === 'string') message = body.message
      } catch {
        // Keep the status text.
      }
      throw new Error(message)
    }

    /**
     * Save a Workspace default and acknowledge it on success; a rejection
     * reaches the shared menu toast through the action's failureLabel.
     * @param {object} ctx - client root context.
     * @param {Function} t - namespace-bound translate.
     * @param {string} workspaceId - Workspace identity.
     * @param {string | null} preset - preset id, or null for no override.
     * @param {string} name - display name for the success notice.
     * @returns {Promise<void>} resolves after the write settles.
     */
    async function saveWorkspacePreset(ctx, t, workspaceId, preset, name) {
      await writeWorkspacePreset(workspaceId, preset)
      ctx.contextMenus.notify(t('menu.saved', { name }), true)
    }

    /**
     * Contribute the Workspace context-menu submenu and its icon.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installWorkspacePresetMenu(ctx) {
      const t = ctx.locale.bind(PRESET_NS)
      ctx.effect(() => ctx.locale.register(PRESET_NS, { en: PRESET_EN, zh: PRESET_ZH }), 'power-suite: workspace-presets dictionaries')
      ctx.effect(() => ctx.slots.inject('contextMenu.icon', () => ctx.slots.register({
        name: 'contextMenu.icon',
        key: 'power-suite.workspacePreset'
      }, WorkspacePresetIcon)), 'power-suite: workspace-presets icon')
      ctx.effect(() => ctx.contextMenus.register({
        id: 'power-suite.workspace-default-preset',
        target: 'workspace',
        order: 150,
        resolve: async (target, signal) => {
          const workspaceId = target.workspaceId
          let roster
          let current
          try {
            [roster, current] = await Promise.all([
              readPresetRoster(ctx),
              readWorkspacePreset(workspaceId, signal)
            ])
          } catch {
            signal.throwIfAborted()
            return [{ id: 'unavailable', label: t('menu.loadFailed'), disabled: true }]
          }
          signal.throwIfAborted()
          if (roster.ok !== true) {
            return [{ id: 'unavailable', label: t('menu.loadFailed'), disabled: true }]
          }
          signal.throwIfAborted()
          const currentRow = current === null ? undefined : roster.presets.find((preset) => preset.id === current)
          const globalRow = roster.presets.find((preset) => preset.isDefault === true)
          const currentName = current === null
            ? t('menu.globalDefault')
            : currentRow === undefined ? current : presetDisplayName(t, currentRow)
          const globalName = globalRow === undefined ? t('menu.globalDefault') : presetDisplayName(t, globalRow)
          const children = [{
            id: 'global',
            label: current === null ? t('menu.followGlobalCurrent', { name: globalName }) : t('menu.followGlobal'),
            disabled: current === null,
            failureLabel: t('menu.saveFailed'),
            run: () => saveWorkspacePreset(ctx, t, workspaceId, null, t('menu.globalDefault'))
          }]
          for (const preset of roster.presets) {
            const name = presetDisplayName(t, preset)
            const label = preset.id === current
              ? t('menu.currentMark', { name })
              : preset.broken === undefined
                ? name
                : t('menu.unavailableMark', { name })
            children.push({
              id: `preset:${preset.id}`,
              label,
              disabled: preset.broken !== undefined,
              failureLabel: t('menu.saveFailed'),
              run: () => saveWorkspacePreset(ctx, t, workspaceId, preset.id, name)
            })
          }
          return [{
            id: 'workspaceDefaultPreset',
            icon: { key: 'power-suite.workspacePreset' },
            label: t('menu.current', { name: currentName }),
            children
          }]
        }
      }), 'power-suite: workspace default preset menu')
    }
    //#endregion

    //#region feature: workspace default presets — creation routing
    /**
     * Read one workspace's default preset and check that it is still usable.
     *
     * A stale or broken preference must never break New Session, so an
     * unresolvable store or a broken roster answer yields null and the caller
     * falls back to the user's global default.
     * @param {object} ctx - client root context.
     * @param {string} workspaceId - Workspace identity.
     * @returns {Promise<string | null>} a usable preset id, or null.
     */
    async function usableWorkspacePreset(ctx, workspaceId) {
      let preset
      try {
        preset = await readWorkspacePreset(workspaceId)
      } catch {
        return null
      }
      if (preset === null) return null
      const roster = await readPresetRoster(ctx)
      if (roster.ok !== true) return null
      const row = roster.presets.find((entry) => entry.id === preset)
      if (row === undefined || row.broken !== undefined) return null
      return preset
    }

    /**
     * Return options that name the Workspace default preset.
     * @param {object | undefined} options - caller-supplied options.
     * @param {string | null} preset - the Workspace default.
     * @returns {object | undefined} options carrying an explicit preset.
     */
    function withWorkspacePreset(options, preset) {
      if (preset === null) return options
      if (options !== null && typeof options === 'object' && options.agentPreset !== undefined) return options
      return { ...(options ?? {}), agentPreset: preset }
    }

    /**
     * Route new-Session flows through the Workspace default.
     *
     * The sidebar's New Session calls `ctx.uiWorkspace.openWorkspace` without
     * naming a preset, and the Host's reuse path then resets an existing blank
     * to the global default. Naming the preset on the request keeps that reuse
     * under the Workspace choice and creates new Sessions composed under it.
     * Explicit requests (Creator mode and other flows) already carry
     * `agentPreset` and pass through untouched.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installWorkspacePresetRouting(ctx) {
      const ui = ctx.uiWorkspace
      if (ui === null || typeof ui !== 'object') return
      if (typeof ui.openWorkspace !== 'function' || typeof ui.connectWorkspace !== 'function') return
      const marker = { patched: true }
      if (ui.__powerSuitePresetRouting !== undefined) return
      const originalOpen = ui.openWorkspace
      const originalConnect = ui.connectWorkspace
      async function openWorkspaceWithPreset(workspaceId, beforeOpen, options) {
        const preset = await usableWorkspacePreset(ctx, workspaceId)
        return originalOpen.call(ui, workspaceId, beforeOpen, withWorkspacePreset(options, preset))
      }
      async function connectWorkspaceWithPreset(workspaceId, options) {
        const preset = await usableWorkspacePreset(ctx, workspaceId)
        return originalConnect.call(ui, workspaceId, withWorkspacePreset(options, preset))
      }
      ui.openWorkspace = openWorkspaceWithPreset
      ui.connectWorkspace = connectWorkspaceWithPreset
      ui.__powerSuitePresetRouting = marker
      ctx.effect(() => () => {
        if (ui.__powerSuitePresetRouting !== marker) return
        delete ui.__powerSuitePresetRouting
        if (ui.openWorkspace === openWorkspaceWithPreset) ui.openWorkspace = originalOpen
        if (ui.connectWorkspace === connectWorkspaceWithPreset) ui.connectWorkspace = originalConnect
      }, 'power-suite: workspace-presets routing cleanup')
    }
    //#endregion

    //#region feature: prompt history
    /** Seat identity of the composer overlay registration. */
    const PROMPT_HISTORY_SEAT = 'power-suite.prompt-history'

    /** Host route returning one Session's complete sent-prompt history. */
    const PROMPT_HISTORY_ROUTE = 'api/prompt-history.list'

    /**
     * Whether a composer menu or listbox owns arrow keys right now.
     * @returns {boolean} whether Up/Down belong to an open popup.
     */
    function arrowMenuOpen() {
      return document.querySelector('[data-trigger-menu], [role="listbox"], [role="menu"]') !== null
    }

    /**
     * Read one Session's prompt history entries from the Host.
     * @param {string} sessionId - Session identity.
     * @returns {Promise<Array<{ seq: number, text: string, at?: number }>>} prompts oldest first; empty on failure.
     */
    async function readPromptHistoryEntries(sessionId) {
      try {
        const response = await fetch(`${appUrl(PROMPT_HISTORY_ROUTE)}?sessionId=${encodeURIComponent(sessionId)}`, {
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
        if (!response.ok) return []
        const value = await response.json()
        if (value === null || typeof value !== 'object' || !Array.isArray(value.prompts)) return []
        const prompts = []
        for (const entry of value.prompts) {
          if (entry === null || typeof entry !== 'object' || typeof entry.text !== 'string' || entry.text.length === 0) continue
          const prompt = { seq: typeof entry.seq === 'number' ? entry.seq : 0, text: entry.text }
          // The Host may report the prompt's epoch-ms `at`; older Hosts omit it,
          // in which case the preview simply hides every timestamp surface.
          if (typeof entry.at === 'number' && Number.isFinite(entry.at)) prompt.at = entry.at
          prompts.push(prompt)
        }
        return prompts
      } catch {
        return []
      }
    }

    /**
     * Read one Session's prompt history from the Host.
     * @param {string} sessionId - Session identity.
     * @returns {Promise<string[]>} prompt texts oldest first; empty on failure.
     */
    async function readPromptHistory(sessionId) {
      const prompts = await readPromptHistoryEntries(sessionId)
      return prompts.map((prompt) => prompt.text)
    }

    /**
     * Invisible composer seat that owns prompt-history key handling.
     *
     * It renders nothing. Its effect watches the focused Lexical composer and
     * turns the primary-modifier Up/Down into prompt-history switching. Plain
     * arrows keep their original caret behavior; a recalled multi-line prompt
     * is skipped as one history entry instead of moving the caret inside it.
     * Any edit or submit leaves browsing. The list comes from the Host, not
     * from the loaded chat window, so earlier pages are recallable too.
     * @param {object} props - standard session slot props.
     * @returns {null} no DOM.
     */
    function PromptHistorySeat(props) {
      const { sessionId, useInput, inputActions } = props
      const draft = useInput((state) => state.draft)
      const phase = useInput((state) => state.phase)
      const browsing = React.useRef({ index: null, saved: '', recalled: null })
      const history = React.useRef({ prompts: [], ready: false, loading: null, sessionId: null, generation: 0 })
      const anchor = React.useRef(null)
      const latest = React.useRef({ draft, phase, sessionId })
      latest.current.draft = draft
      latest.current.phase = phase
      latest.current.sessionId = sessionId

      const load = React.useCallback(() => {
        const target = sessionId
        const state = history.current
        if (state.sessionId !== target) return Promise.resolve(state.prompts)
        if (state.loading !== null) return state.loading
        const generation = state.generation
        const task = readPromptHistory(target).then((prompts) => {
          // A stale response from a previous Session must never write into the
          // new Session's cache, even if it resolves after the switch.
          const current = history.current
          if (current.generation !== generation || current.sessionId !== target) return current.prompts
          current.loading = null
          if (prompts.length > 0 || !current.ready) {
            current.prompts = prompts
            current.ready = true
          }
          return current.prompts
        }, () => {
          const current = history.current
          if (current.generation !== generation || current.sessionId !== target) return current.prompts
          current.loading = null
          return current.prompts
        })
        state.loading = task
        return task
      }, [sessionId])

      React.useEffect(() => {
        const generation = history.current.generation + 1
        history.current = { prompts: [], ready: false, loading: null, sessionId, generation }
        browsing.current = { index: null, saved: '', recalled: null }
        load()
        return () => {
          // Invalidate any response that arrives after this Session unmounts.
          history.current.generation += 1
        }
      }, [sessionId, load])

      React.useEffect(() => {
        browsing.current = { index: null, saved: '', recalled: null }
      }, [sessionId])

      React.useEffect(() => {
        if (browsing.current.index === null) return
        if (draft !== browsing.current.recalled) {
          browsing.current = { index: null, saved: '', recalled: null }
        }
      }, [draft])

      const previousPhase = React.useRef(phase)
      React.useEffect(() => {
        const before = previousPhase.current
        previousPhase.current = phase
        if (phase !== 'plain') {
          browsing.current = { index: null, saved: '', recalled: null }
          return
        }
        if (before !== 'plain') load()
      }, [phase, load])

      React.useEffect(() => {
        /**
         * Commit one prompt (or the saved draft) into the editor.
         * @param {string} text - draft text to place.
         * @returns {void}
         */
        const recall = (text) => {
          browsing.current.recalled = text
          inputActions.setDraft(text)
        }
        /**
         * Start browsing from the current draft, whatever it holds.
         * @param {readonly string[]} prompts - history oldest first.
         * @returns {void}
         */
        const beginBrowsing = (prompts) => {
          if (browsing.current.index !== null) return
          if (prompts.length === 0) return
          browsing.current.saved = latest.current.draft
          browsing.current.index = prompts.length - 1
          recall(prompts[browsing.current.index])
        }
        /**
         * Handle one keydown captured before Lexical moves the caret.
         * @param {KeyboardEvent} event - the composer keydown.
         * @returns {void}
         */
        const onKeyDown = (event) => {
          if (event.defaultPrevented || event.isComposing) return
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          if (!matchesHistoryModifier(event, currentSettings().promptHistoryModifier)) return
          const target = event.target
          if (target === null || typeof target.closest !== 'function') return
          const editor = target.closest('[data-lexical-editor="true"]')
          if (editor === null) return
          const region = editor.closest('[data-conversation-region="composer"]')
          if (region === null) return
          const own = anchor.current === null ? null : anchor.current.closest('[data-conversation-region="composer"]')
          if (own !== null && own !== region) return
          const occurrence = editor.closest('[data-conversation-session]')
          const currentSession = latest.current.sessionId
          if (occurrence !== null && currentSession !== undefined && occurrence.getAttribute('data-conversation-session') !== currentSession) return
          if (arrowMenuOpen()) return
          const state = latest.current
          const list = history.current.prompts
          const browse = browsing.current
          if (browse.index !== null && (browse.index >= list.length || list.length === 0)) {
            browsing.current = { index: null, saved: '', recalled: null }
            return
          }
          if (event.key === 'ArrowUp') {
            if (browse.index !== null) {
              if (browse.index > 0) {
                browse.index -= 1
                recall(list[browse.index])
              }
              event.preventDefault()
              event.stopPropagation()
              return
            }
            event.preventDefault()
            event.stopPropagation()
            if (history.current.ready) {
              beginBrowsing(history.current.prompts)
              return
            }
            load().then(beginBrowsing)
            return
          }
          if (browse.index === null) return
          if (browse.index < list.length - 1) {
            browse.index += 1
            recall(list[browse.index])
          } else {
            const saved = browse.saved
            browsing.current = { index: null, saved: '', recalled: null }
            recall(saved)
          }
          event.preventDefault()
          event.stopPropagation()
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [inputActions, load])

      // A zero-size anchor keeps each seat bound to the composer occurrence it
      // rendered in, so a second mounted composer of the same Session never
      // handles the same key twice.
      return React.createElement('span', {
        ref: anchor,
        style: { display: 'none' },
        'aria-hidden': true
      })
    }

    /**
     * Contribute the invisible prompt-history composer seat.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installPromptHistory(ctx) {
      ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: PROMPT_HISTORY_SEAT,
        order: 40
      }, PromptHistorySeat)), 'power-suite: prompt history seat')
    }
    //#endregion

    //#region feature: settings — copy and shared state
    /** Copy namespace for the Plugins-page configuration section. */
    const SETTINGS_NS = 'powerSuiteSettings'

    /** Host route serving and storing the suite's preference document. */
    const SETTINGS_ROUTE = 'api/power-suite.settings'

    /** Modifier choices accepted by the Host and shown on the page. */
    const PROMPT_HISTORY_MODIFIERS = ['primary', 'alt', 'ctrl', 'shift', 'off']

    /** Finished-Session retention windows accepted by the Host, in minutes. */
    const RECENT_SESSION_MINUTES = [60, 120, 360, 720, 1440]

    /** Active Projects retention windows accepted by the Host, in days. */
    const ACTIVE_PROJECT_DAYS = [1, 3, 7, 14, 30]

    /** Defaults used before the Host answers and by a deployment without the route. */
    const DEFAULT_SETTINGS = { promptHistoryModifier: 'primary', recentSessionMinutes: 120, activeProjectDays: 7 }

    const SETTINGS_EN = {
      'history.group': 'Prompt history',
      'history.groupHint': 'Hold the chosen modifier and press ↑ or ↓ in the composer to switch between prompts already sent in this session. Plain arrows keep their normal editing behavior, including inside a recalled multi-line prompt. Primary is ⌘ on macOS and Ctrl on Windows and Linux; Alt is ⌥ on macOS and Alt on Windows and Linux.',
      'history.label': 'Shortcut modifier',
      'history.current': 'Current shortcut: {shortcut}',
      'modifier.primary': '⌘ / Ctrl',
      'modifier.alt': '⌥ / Alt',
      'modifier.ctrl': 'Ctrl',
      'modifier.shift': '⇧ / Shift',
      'modifier.off': 'Off',
      'shortcut.primary.mac': '⌘ + ↑ / ↓',
      'shortcut.primary.other': 'Ctrl + ↑ / ↓',
      'shortcut.alt.mac': '⌥ + ↑ / ↓',
      'shortcut.alt.other': 'Alt + ↑ / ↓',
      'shortcut.ctrl': 'Ctrl + ↑ / ↓',
      'shortcut.shift.mac': '⇧ + ↑ / ↓',
      'shortcut.shift.other': 'Shift + ↑ / ↓',
      'shortcut.off': 'Off',
      'dynamic.group': 'Active & recent',
      'dynamic.groupHint': 'Choose how long a finished Session stays in the Running & recent card, and how long a project stays in Active Projects after its last activity. Running Sessions are always listed and count as active.',
      'recent.label': 'Finished Session retention',
      'recent.current': 'Currently {value}. Finished Sessions leave the card after this window.',
      'recent.60': '1 hour',
      'recent.120': '2 hours',
      'recent.360': '6 hours',
      'recent.720': '12 hours',
      'recent.1440': '24 hours',
      'active.label': 'Active project retention',
      'active.current': 'Currently {value}. After this window the project moves to Inactive Projects.',
      'active.1': '1 day',
      'active.3': '3 days',
      'active.7': '7 days',
      'active.14': '14 days',
      'active.30': '30 days',
      'settings.loading': 'Loading settings…',
      'settings.unavailable': 'Settings are unavailable. The default shortcut stays active.',
      'settings.error': 'Could not save the setting. Try again.'
    }
    const SETTINGS_ZH = {
      'history.group': '提示历史',
      'history.groupHint': '在输入框里按住所选修饰键再按 ↑ 或 ↓，即可在本次会话已发送的提示之间切换。普通方向键保持原来的编辑行为，包括在回填的多行提示内部移动。Primary 在 macOS 上是 ⌘、在 Windows / Linux 上是 Ctrl；Alt 在 macOS 上是 ⌥、其他平台是 Alt。',
      'history.label': '快捷键修饰键',
      'history.current': '当前快捷键：{shortcut}',
      'modifier.primary': '⌘ / Ctrl',
      'modifier.alt': '⌥ / Alt',
      'modifier.ctrl': 'Ctrl',
      'modifier.shift': '⇧ / Shift',
      'modifier.off': '关闭',
      'shortcut.primary.mac': '⌘ + ↑ / ↓',
      'shortcut.primary.other': 'Ctrl + ↑ / ↓',
      'shortcut.alt.mac': '⌥ + ↑ / ↓',
      'shortcut.alt.other': 'Alt + ↑ / ↓',
      'shortcut.ctrl': 'Ctrl + ↑ / ↓',
      'shortcut.shift.mac': '⇧ + ↑ / ↓',
      'shortcut.shift.other': 'Shift + ↑ / ↓',
      'shortcut.off': '已关闭',
      'dynamic.group': '活跃与最近',
      'dynamic.groupHint': '设置完成会话留在「进行中与最近活跃」卡片里的时长，以及项目最后一次活动后保留在活跃项目分组里的时长。进行中的会话始终显示并计为活跃。',
      'recent.label': '完成会话保留时长',
      'recent.current': '当前：{value}。超过后完成的会话从卡片移除。',
      'recent.60': '1 小时',
      'recent.120': '2 小时',
      'recent.360': '6 小时',
      'recent.720': '12 小时',
      'recent.1440': '24 小时',
      'active.label': '活跃项目保留时长',
      'active.current': '当前：{value}。超过后项目归入非活跃项目。',
      'active.1': '1 天',
      'active.3': '3 天',
      'active.7': '7 天',
      'active.14': '14 天',
      'active.30': '30 天',
      'settings.loading': '正在读取设置…',
      'settings.unavailable': '设置暂不可用，快捷键保持默认。',
      'settings.error': '保存设置失败，请重试。'
    }

    /** Host-backed settings shared by the page and the composer key handler. */
    const settingsStore = {
      snapshot: { status: 'loading', value: { ...DEFAULT_SETTINGS } },
      listeners: new Set(),
      loading: null
    }

    /**
     * Read the current shared settings snapshot.
     * @returns {{ status: string, value: { promptHistoryModifier: string } }} the snapshot.
     */
    function settingsSnapshot() {
      return settingsStore.snapshot
    }

    /**
     * Subscribe to settings changes.
     * @param {Function} listener - change callback.
     * @returns {Function} unsubscribe.
     */
    function subscribeSettings(listener) {
      settingsStore.listeners.add(listener)
      return () => {
        settingsStore.listeners.delete(listener)
      }
    }

    /**
     * Publish one new settings snapshot.
     * @param {{ status: string, value: object }} snapshot - next snapshot.
     * @returns {void}
     */
    function publishSettings(snapshot) {
      settingsStore.snapshot = snapshot
      for (const listener of [...settingsStore.listeners]) {
        try {
          listener()
        } catch {
          // A failing listener must not block the others.
        }
      }
    }

    /**
     * Keep only settings fields this build understands.
     * @param {unknown} raw - decoded settings object.
     * @returns {object} recognized fields.
     */
    function knownSettings(raw) {
      const settings = {}
      if (raw === null || typeof raw !== 'object') return settings
      if (PROMPT_HISTORY_MODIFIERS.includes(raw.promptHistoryModifier)) {
        settings.promptHistoryModifier = raw.promptHistoryModifier
      }
      if (RECENT_SESSION_MINUTES.includes(raw.recentSessionMinutes)) {
        settings.recentSessionMinutes = raw.recentSessionMinutes
      }
      if (ACTIVE_PROJECT_DAYS.includes(raw.activeProjectDays)) {
        settings.activeProjectDays = raw.activeProjectDays
      }
      return settings
    }

    /**
     * Merge one Host settings payload over the defaults.
     * @param {unknown} payload - decoded response body.
     * @returns {{ promptHistoryModifier: string }} the merged settings.
     */
    function mergeSettingsPayload(payload) {
      const raw = payload !== null && typeof payload === 'object' ? payload.settings : undefined
      return { ...DEFAULT_SETTINGS, ...knownSettings(raw) }
    }

    /**
     * Load the Host settings once per page.
     * @returns {Promise<void>} resolves after the snapshot updates.
     */
    async function loadSettings() {
      if (settingsStore.loading !== null) return settingsStore.loading
      const task = (async () => {
        try {
          const response = await fetch(appUrl(SETTINGS_ROUTE), {
            credentials: 'same-origin',
            headers: { accept: 'application/json' }
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          publishSettings({ status: 'ready', value: mergeSettingsPayload(payload) })
        } catch {
          publishSettings({ status: 'error', value: { ...settingsStore.snapshot.value } })
        } finally {
          settingsStore.loading = null
        }
      })()
      settingsStore.loading = task
      return task
    }

    /**
     * Save one settings patch through the Host and publish the result.
     * @param {object} patch - recognized fields to write.
     * @returns {Promise<boolean>} whether the Host accepted the write.
     */
    async function saveSettings(patch) {
      try {
        const response = await fetch(appUrl(SETTINGS_ROUTE), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch)
        })
        if (!response.ok) return false
        const payload = await response.json()
        publishSettings({ status: 'ready', value: mergeSettingsPayload(payload) })
        return true
      } catch {
        return false
      }
    }

    /**
     * Read the settings the features currently use, without subscribing.
     * @returns {{ promptHistoryModifier: string }} current settings.
     */
    function currentSettings() {
      return settingsStore.snapshot.value
    }

    /**
     * Whether this browser runs on Apple hardware, where the primary shortcut
     * modifier is Command instead of Control.
     * @returns {boolean} whether the platform primary modifier is Command.
     */
    function isApplePlatform() {
      if (typeof navigator !== 'object' || navigator === null) return false
      const platform = typeof navigator.userAgentData === 'object' && navigator.userAgentData !== null
        ? String(navigator.userAgentData.platform ?? '')
        : ''
      if (/mac|iphone|ipad|ipod/i.test(platform)) return true
      const legacy = String(navigator.platform ?? '')
      if (/mac|iphone|ipad|ipod/i.test(legacy)) return true
      return /Mac OS X|iPhone|iPad|iPod/.test(String(navigator.userAgent ?? ''))
    }

    /**
     * Whether a keydown carries exactly the configured history modifier.
     * @param {KeyboardEvent} event - the keydown.
     * @param {string} mode - configured modifier mode.
     * @returns {boolean} whether the event matches.
     */
    function matchesHistoryModifier(event, mode) {
      if (mode === 'shift') {
        return event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
      }
      if (event.shiftKey) return false
      switch (mode) {
        case 'primary':
          return isApplePlatform()
            ? event.metaKey && !event.ctrlKey && !event.altKey
            : event.ctrlKey && !event.metaKey && !event.altKey
        case 'ctrl':
          return event.ctrlKey && !event.metaKey && !event.altKey
        case 'alt':
          return event.altKey && !event.metaKey && !event.ctrlKey
        default:
          return false
      }
    }

    /**
     * One modifier mode's shortcut as displayed text.
     * @param {Function} t - namespace-bound translate.
     * @param {string} mode - modifier mode.
     * @returns {string} the shortcut text.
     */
    function shortcutText(t, mode) {
      switch (mode) {
        case 'primary':
          return t(isApplePlatform() ? 'shortcut.primary.mac' : 'shortcut.primary.other')
        case 'alt':
          return t(isApplePlatform() ? 'shortcut.alt.mac' : 'shortcut.alt.other')
        case 'ctrl':
          return t('shortcut.ctrl')
        case 'shift':
          return t(isApplePlatform() ? 'shortcut.shift.mac' : 'shortcut.shift.other')
        default:
          return t('shortcut.off')
      }
    }
    //#endregion

    //#region feature: settings — page
    const SETTINGS_CSS = `
.dps-settings{display:flex;flex-direction:column;gap:14px;max-width:620px;color:var(--dsw-alias-label-primary)}
.dps-settings-head{display:flex;flex-direction:column;gap:3px}
.dps-settings-title{margin:0;font-size:15px;font-weight:600;line-height:22px}
.dps-settings-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dps-settings-group{display:flex;flex-direction:column;gap:10px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l1)}
.dps-settings-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;padding:14px 16px;border-radius:16px;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-2));box-shadow:0 1px 2px rgb(0 0 0 / 3%)}
.dps-settings-copy{min-width:0}
.dps-settings-label{font-size:13px;font-weight:500;line-height:20px}
.dps-settings-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dps-settings-note[data-error=true]{color:var(--dsw-alias-state-error-primary)}
.dps-choice{display:inline-flex;align-items:center;gap:2px;flex:none;margin:0;padding:2px;border:0;border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.dps-choice-option{position:relative;display:inline-flex;align-items:center;border-radius:8px;cursor:pointer}
.dps-choice-option input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.dps-choice-text{white-space:nowrap;padding:4px 10px;border-radius:8px;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dps-choice-option[data-selected=true] .dps-choice-text{background:var(--dsw-alias-bg-layer-4,var(--dsw-alias-bg-layer-3));color:var(--dsw-alias-label-primary)}
.dps-choice-option input:focus-visible+.dps-choice-text{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dps-choice-option input:disabled+.dps-choice-text{opacity:.5;cursor:default}
.dps-visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
`

    /**
     * Render the bundle's configuration on its Plugins-page detail page.
     *
     * One group holds the prompt-history shortcut modifier. The page reads the
     * shared Host-backed settings store, so a successful write updates both this
     * page and the composer key handler in the same turn.
     * @param {object} props - bundle-config owner props plus the injected locale seat.
     * @returns {object} the settings section.
     */
    function PowerSuiteSettingsPage(props) {
      const t = props.t ?? ((key) => key)
      const snapshot = React.useSyncExternalStore(subscribeSettings, settingsSnapshot, settingsSnapshot)
      const [saving, setSaving] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const ready = snapshot.status === 'ready'
      const locked = !ready || saving
      const current = snapshot.value.promptHistoryModifier
      const currentText = shortcutText(t, current)
      const currentRecent = snapshot.value.recentSessionMinutes
      const currentActive = snapshot.value.activeProjectDays
      const pageRef = React.useRef(null)

      // The bundle page draws the package README above this configuration
      // section. The suite's settings surface is self-contained, so the
      // document is hidden while the section is mounted and restored on unmount.
      React.useEffect(() => {
        const page = pageRef.current
        if (!(page instanceof HTMLElement)) return undefined
        const config = page.closest('[data-plugin-config]')
        const sections = config?.parentElement
        if (!(sections instanceof HTMLElement)) return undefined
        const hidden = []
        for (const child of Array.from(sections.children)) {
          if (child instanceof HTMLElement && child.hasAttribute('data-detail-document')) {
            hidden.push({ element: child, display: child.style.display })
            child.style.display = 'none'
          }
        }
        return () => {
          for (const entry of hidden) entry.element.style.display = entry.display
        }
      }, [])

      /**
       * Persist one settings patch.
       * @param {object} patch - recognized fields to write.
       * @param {string} field - field the patch changes.
       * @returns {void}
       */
      function choosePatch(patch, field) {
        if (locked || patch[field] === snapshot.value[field]) return
        setSaving(true)
        setFailed(false)
        saveSettings(patch).then((accepted) => {
          setSaving(false)
          if (!accepted) setFailed(true)
        })
      }

      let note = null
      let noteIsError = false
      if (failed) {
        note = t('settings.error')
        noteIsError = true
      } else if (snapshot.status === 'error') {
        note = t('settings.unavailable')
      }

      const modifierOptions = PROMPT_HISTORY_MODIFIERS.map((mode) => React.createElement('label', {
        key: mode,
        className: 'dps-choice-option',
        'data-selected': mode === current ? 'true' : undefined
      },
      React.createElement('input', {
        type: 'radio',
        name: 'dsh-power-suite-history-modifier',
        value: mode,
        checked: mode === current,
        disabled: locked,
        onChange: () => choosePatch({ promptHistoryModifier: mode }, 'promptHistoryModifier')
      }),
      React.createElement('span', { className: 'dps-choice-text' }, t(`modifier.${mode}`))))

      const recentOptions = RECENT_SESSION_MINUTES.map((minutes) => React.createElement('label', {
        key: minutes,
        className: 'dps-choice-option',
        'data-selected': minutes === currentRecent ? 'true' : undefined
      },
      React.createElement('input', {
        type: 'radio',
        name: 'dsh-power-suite-recent-session-window',
        value: String(minutes),
        checked: minutes === currentRecent,
        disabled: locked,
        onChange: () => choosePatch({ recentSessionMinutes: minutes }, 'recentSessionMinutes')
      }),
      React.createElement('span', { className: 'dps-choice-text' }, t(`recent.${minutes}`))))

      const activeOptions = ACTIVE_PROJECT_DAYS.map((days) => React.createElement('label', {
        key: days,
        className: 'dps-choice-option',
        'data-selected': days === currentActive ? 'true' : undefined
      },
      React.createElement('input', {
        type: 'radio',
        name: 'dsh-power-suite-active-project-window',
        value: String(days),
        checked: days === currentActive,
        disabled: locked,
        onChange: () => choosePatch({ activeProjectDays: days }, 'activeProjectDays')
      }),
      React.createElement('span', { className: 'dps-choice-text' }, t(`active.${days}`))))

      return React.createElement('section', { className: 'dps-settings', ref: pageRef },
        React.createElement('style', null, SETTINGS_CSS),
        React.createElement('div', { className: 'dps-settings-head' },
          React.createElement('h3', { className: 'dps-settings-title' }, t('history.group')),
          React.createElement('p', { className: 'dps-settings-hint' }, t('history.groupHint'))),
        React.createElement('div', { className: 'dps-settings-row' },
          React.createElement('div', { className: 'dps-settings-copy' },
            React.createElement('div', { className: 'dps-settings-label' }, t('history.label')),
            React.createElement('p', { className: 'dps-settings-hint' }, t('history.current', { shortcut: currentText }))),
          React.createElement('fieldset', { className: 'dps-choice', disabled: locked },
            React.createElement('legend', { className: 'dps-visually-hidden' }, t('history.label')),
            modifierOptions)),
        React.createElement('div', { className: 'dps-settings-group' },
          React.createElement('div', { className: 'dps-settings-head' },
            React.createElement('h3', { className: 'dps-settings-title' }, t('dynamic.group')),
            React.createElement('p', { className: 'dps-settings-hint' }, t('dynamic.groupHint'))),
          React.createElement('div', { className: 'dps-settings-row' },
            React.createElement('div', { className: 'dps-settings-copy' },
              React.createElement('div', { className: 'dps-settings-label' }, t('recent.label')),
              React.createElement('p', { className: 'dps-settings-hint' }, t('recent.current', { value: t(`recent.${currentRecent}`) }))),
            React.createElement('fieldset', { className: 'dps-choice', disabled: locked },
              React.createElement('legend', { className: 'dps-visually-hidden' }, t('recent.label')),
              recentOptions)),
          React.createElement('div', { className: 'dps-settings-row' },
            React.createElement('div', { className: 'dps-settings-copy' },
              React.createElement('div', { className: 'dps-settings-label' }, t('active.label')),
              React.createElement('p', { className: 'dps-settings-hint' }, t('active.current', { value: t(`active.${currentActive}`) }))),
            React.createElement('fieldset', { className: 'dps-choice', disabled: locked },
              React.createElement('legend', { className: 'dps-visually-hidden' }, t('active.label')),
              activeOptions))),
        note === null ? null : React.createElement('p', {
          className: 'dps-settings-note',
          role: 'status',
          'data-error': noteIsError ? 'true' : undefined
        }, note))
    }

    /**
     * Register the Plugins-page configuration section and its dictionaries.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installSettingsPage(ctx) {
      const t = ctx.locale.bind(SETTINGS_NS)
      ctx.effect(() => ctx.locale.register(SETTINGS_NS, { en: SETTINGS_EN, zh: SETTINGS_ZH }), 'power-suite: settings dictionaries')
      ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
        inject: () => ({ t })
      }, PowerSuiteSettingsPage)), 'power-suite: settings page')
      loadSettings()
    }
    //#endregion

    //#region feature: interrupted sessions — copy, icons, shared state
    /** Copy namespace for the interrupted-task affordances. */
    const INTERRUPTED_NS = 'powerSuiteInterrupted'

    /** Host route reporting one Session's last-turn state. */
    const INTERRUPTED_ROUTE = 'api/power-suite.interrupted'
    /** Host SSE route broadcasting turn-boundary interruptions. */
    const INTERRUPTED_EVENTS_ROUTE = 'api/power-suite.interrupted-events'
    /** Host route resuming one Session through a non-human context message. */
    const CONTINUE_ROUTE = 'api/power-suite.continue'

    const INTERRUPTED_EN = {
      'badge.aria': 'Task did not finish',
      'badge.title': 'The last task did not finish. Hover this session to continue it.',
      'badge.title.subagent': 'A delegated subagent task did not finish. Hover this session to continue it.',
      'continue.label': 'Continue',
      'continue.aria': 'Continue the unfinished task',
      'continue.prompt': 'Continue the unfinished task.',
      'continue.summary': 'Continue unfinished task',
      'continue.failed': 'Could not continue the task. Try again.'
    }
    const INTERRUPTED_ZH = {
      'badge.aria': '任务未完成',
      'badge.title': '上一个任务未完成，悬停此会话可继续。',
      'badge.title.subagent': '委派的子任务未完成，悬停此会话可继续。',
      'continue.label': '继续',
      'continue.aria': '继续未完成的任务',
      'continue.prompt': '继续完成上一个任务。',
      'continue.summary': '继续未完成的任务',
      'continue.failed': '继续任务失败，请重试。'
    }

    // Remix Icon path data (Apache-2.0, https://remixicon.com), inlined so the
    // plugin renders offline without a package or a sprite dependency.
    const REMIX_WARNING_FILL = 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11 15V17H13V15H11ZM11 7V13H13V7H11Z'
    const REMIX_PLAY_FILL = 'M19.376 12.4161L8.77735 19.4818C8.54759 19.635 8.23715 19.5729 8.08397 19.3432C8.02922 19.261 8 19.1645 8 19.0658V4.93433C8 4.65818 8.22386 4.43433 8.5 4.43433C8.59871 4.43433 8.69522 4.46355 8.77735 4.5183L19.376 11.584C19.6057 11.7372 19.6678 12.0477 19.5146 12.2774C19.478 12.3323 19.4309 12.3795 19.376 12.4161Z'
    const REMIX_PLAY_CIRCLE_FILL = 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM10.6219 8.41459C10.5562 8.37078 10.479 8.34741 10.4 8.34741C10.1791 8.34741 10 8.52649 10 8.74741V15.2526C10 15.3316 10.0234 15.4088 10.0672 15.4745C10.1897 15.6583 10.4381 15.708 10.6219 15.5854L15.5008 12.3328C15.5447 12.3035 15.5824 12.2658 15.6117 12.2219C15.7343 12.0381 15.6846 11.7897 15.5008 11.6672L10.6219 8.41459Z'

    /**
     * Render one inline Remix icon.
     * @param {object} props - icon props.
     * @returns {object} the SVG element.
     */
    function RemixIcon(props) {
      return React.createElement('svg', {
        viewBox: '0 0 24 24',
        width: props.size ?? 16,
        height: props.size ?? 16,
        fill: 'currentColor',
        'aria-hidden': 'true',
        focusable: 'false'
      }, React.createElement('path', { d: props.path }))
    }

    /**
     * Escape one value for an attribute selector.
     * @param {string} value - raw value.
     * @returns {string} selector-safe text.
     */
    function escapeSelectorValue(value) {
      const platformCss = typeof globalThis !== 'undefined' ? globalThis.CSS : undefined
      if (typeof platformCss === 'object' && platformCss !== null && typeof platformCss.escape === 'function') return platformCss.escape(value)
      return String(value).replace(/["\\]/g, '\\$&')
    }

    /**
     * Browser-facing interruption state, shared by row badges, the row CTA, and
     * the composer seat. Reads run two at a time so one sidebar pass never floods
     * the Host with log reads.
     */
    const interruptedStore = {
      records: new Map(),
      listeners: new Set(),
      watchers: new Map(),
      pollTimer: null,
      version: 0,
      queue: [],
      active: 0,
      maxActive: 2,
      inflight: new Set()
    }

    /**
     * Read the shared change counter.
     * @returns {number} current version.
     */
    function interruptedVersion() {
      return interruptedStore.version
    }

    /**
     * Subscribe to interruption-state changes.
     * @param {Function} listener - change callback.
     * @returns {Function} unsubscribe.
     */
    function subscribeInterrupted(listener) {
      interruptedStore.listeners.add(listener)
      return () => {
        interruptedStore.listeners.delete(listener)
      }
    }

    /**
     * Publish one store change.
     * @returns {void}
     */
    function notifyInterrupted() {
      interruptedStore.version += 1
      for (const listener of [...interruptedStore.listeners]) {
        try {
          listener()
        } catch {
          // One failing subscriber must not block the others.
        }
      }
    }

    /**
     * Write or clear one Session record.
     * @param {string} sessionId - Session identity.
     * @param {object | null} record - next record.
     * @returns {void}
     */
    function setInterruptedRecord(sessionId, record) {
      if (record === null) interruptedStore.records.delete(sessionId)
      else interruptedStore.records.set(sessionId, { ...record, at: Date.now() })
      notifyInterrupted()
    }

    /**
     * Read one cached Session record.
     * @param {string} sessionId - Session identity.
     * @returns {object | null} the record, when known.
     */
    function interruptedRecord(sessionId) {
      return interruptedStore.records.get(sessionId) ?? null
    }

    /**
     * Queue one Host read unless the Session is already known or loading.
     * @param {string} sessionId - Session identity.
     * @param {{ force?: boolean }} options - force bypasses the cache.
     * @returns {void}
     */
    function ensureInterrupted(sessionId, options = {}) {
      const force = options.force === true
      const refreshHost = options.refreshHost === true
      const existing = interruptedStore.records.get(sessionId)
      if (existing !== undefined && !force) return
      if (existing?.status === 'loading' && !force) return
      if (interruptedStore.inflight.has(sessionId)) return
      interruptedStore.inflight.add(sessionId)
      // A forced refresh must not downgrade a known-good badge to loading:
      // keep the current record visible until the new answer replaces it.
      if (existing === undefined) {
        setInterruptedRecord(sessionId, { status: 'loading', interrupted: false })
      }
      interruptedStore.queue.push({ sessionId, force, refreshHost })
      drainInterruptedQueue()
    }

    /**
     * Run queued Host reads within the concurrency bound.
     * @returns {void}
     */
    function drainInterruptedQueue() {
      while (interruptedStore.active < interruptedStore.maxActive && interruptedStore.queue.length > 0) {
        const job = interruptedStore.queue.shift()
        interruptedStore.active += 1
        loadInterrupted(job.sessionId, job.force, job.refreshHost).finally(() => {
          interruptedStore.active -= 1
          interruptedStore.inflight.delete(job.sessionId)
          drainInterruptedQueue()
        })
      }
    }

    /**
     * Read one Session's interruption state from the Host.
     * @param {string} sessionId - Session identity.
     * @param {boolean} force - ask the Host to bypass its cache.
     * @returns {Promise<void>} resolves after the record lands.
     */
    async function loadInterrupted(sessionId, force, refreshHost) {
      try {
        const query = `sessionId=${encodeURIComponent(sessionId)}${force && refreshHost ? '&refresh=1' : ''}`
        const response = await fetch(appUrl(`${INTERRUPTED_ROUTE}?${query}`), {
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
        if (response.status === 404) {
          setInterruptedRecord(sessionId, { status: 'missing', interrupted: false })
          return
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json()
        setInterruptedRecord(sessionId, {
          status: 'ready',
          interrupted: payload?.interrupted === true,
          turn: typeof payload?.turn === 'number' ? payload.turn : null,
          running: payload?.running === true,
          open: payload?.open === true,
          reason: typeof payload?.reason === 'string' ? payload.reason : null,
          subagent: payload?.subagent === true
        })
      } catch {
        const existing = interruptedRecord(sessionId)
        if (existing === null || existing.status !== 'ready') {
          setInterruptedRecord(sessionId, { status: 'error', interrupted: false })
        }
      }
    }

    /**
     * Locally settle a record after an action the Host has not observed yet.
     * @param {string} sessionId - Session identity.
     * @param {boolean} interrupted - next interruption flag.
     * @returns {void}
     */
    function markInterrupted(sessionId, interrupted) {
      const existing = interruptedRecord(sessionId) ?? {}
      setInterruptedRecord(sessionId, { ...existing, status: 'ready', interrupted })
    }

    /**
     * Ask the Host to recompute one record.
     * @param {string} sessionId - Session identity.
     * @returns {void}
     */
    function refreshInterrupted(sessionId) {
      ensureInterrupted(sessionId, { force: true, refreshHost: false })
    }

    /**
     * Refresh every Session already known to the browser. After a reconnect the
     * previous records can all be stale, including rows that are not mounted.
     * @returns {void}
     */
    function refreshAllInterrupted() {
      const ids = new Set([...interruptedStore.watchers.keys(), ...interruptedStore.records.keys()])
      for (const sessionId of ids) {
        ensureInterrupted(sessionId, { force: true, refreshHost: false })
      }
    }

    /**
     * Start or stop the shared poll as watched Sessions come and go.
     * @returns {void}
     */
    function ensureInterruptedPolling() {
      if (interruptedStore.watchers.size === 0) {
        if (interruptedStore.pollTimer !== null) {
          window.clearInterval(interruptedStore.pollTimer)
          interruptedStore.pollTimer = null
        }
        return
      }
      if (interruptedStore.pollTimer !== null) return
      interruptedStore.pollTimer = window.setInterval(refreshAllInterrupted, 20000)
    }

    /**
     * Keep one mounted component's Session fresh while it stays mounted.
     * @param {string} sessionId - Session identity.
     * @returns {Function} unwatch.
     */
    function watchInterrupted(sessionId) {
      interruptedStore.watchers.set(sessionId, (interruptedStore.watchers.get(sessionId) ?? 0) + 1)
      ensureInterruptedPolling()
      return () => {
        const remaining = (interruptedStore.watchers.get(sessionId) ?? 1) - 1
        if (remaining <= 0) interruptedStore.watchers.delete(sessionId)
        else interruptedStore.watchers.set(sessionId, remaining)
        ensureInterruptedPolling()
      }
    }

    /**
     * Subscribe one component to a Session's interruption record.
     * @param {string} sessionId - Session identity.
     * @param {boolean} autoFetch - whether the first mount asks the Host.
     * @returns {object | null} the record.
     */
    function useInterruptedRecord(sessionId, autoFetch = true) {
      React.useSyncExternalStore(subscribeInterrupted, interruptedVersion, interruptedVersion)
      React.useEffect(() => {
        if (!autoFetch) return undefined
        ensureInterrupted(sessionId)
        return watchInterrupted(sessionId)
      }, [sessionId, autoFetch])
      return interruptedRecord(sessionId)
    }

    /** Pending request that a freshly opened Conversation should continue. */
    const continueRequest = { pending: null }

    /** The mounted composer's continue handler, if a Conversation is open. */
    const continueRuntime = { current: null, pending: false }

    /** Services captured at install time for row actions and DOM decoration. */
    const interruptedRuntime = { uiWorkspace: null, t: null, hideContinuationRows: null, continueTimes: [] }

    /** localStorage key: when this browser sent an implicit continuation. */
    const CONTINUE_TIMES_KEY = 'dsh-power-suite.continue-times'

    /**
     * Read the recent implicit-continuation timestamps.
     * @returns {number[]} epoch milliseconds, pruned to the last ten minutes.
     */
    function loadContinueTimes() {
      try {
        const parsed = JSON.parse(localStorage.getItem(CONTINUE_TIMES_KEY) ?? '[]')
        if (!Array.isArray(parsed)) return []
        const cutoff = Date.now() - 10 * 60 * 1000
        return parsed.filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= cutoff)
      } catch {
        return []
      }
    }

    /**
     * Remember one implicit continuation so its turn-trigger row can be hidden
     * after the React tree renders it (and after a page reload).
     * @param {number} at - epoch milliseconds when the request was sent.
     * @returns {void}
     */
    function rememberContinueTime(at) {
      const cutoff = Date.now() - 10 * 60 * 1000
      interruptedRuntime.continueTimes = [...interruptedRuntime.continueTimes, at]
        .filter((value) => value >= cutoff)
      try {
        localStorage.setItem(CONTINUE_TIMES_KEY, JSON.stringify(interruptedRuntime.continueTimes))
      } catch {
        // Storage may be unavailable; the in-memory value still applies.
      }
    }

    /**
     * Start continuing one Session from a row action.
     *
     * When that Session is not already the open conversation this opens it
     * first; the renderless composer seat (InterruptedContinueSeat) observes the
     * pending request and sends the continuation once the Session is open and
     * idle. The row CTA never sends into a different Session.
     * @param {string} sessionId - Session identity.
     * @returns {void}
     */
    function requestContinue(sessionId) {
      const runtime = continueRuntime.current
      if (runtime !== null && runtime.sessionId === sessionId) {
        runtime.run()
        return
      }
      continueRequest.pending = { sessionId, at: Date.now() }
      const ui = interruptedRuntime.uiWorkspace
      if (ui !== null && typeof ui.openSession === 'function') ui.openSession(sessionId)
    }
    //#endregion

    //#region feature: interrupted sessions — styles
    const PLAY_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${REMIX_PLAY_FILL}"/></svg>`)}")`

    const INTERRUPTED_CSS = `
[data-row-key^="session:"][data-power-suite-interrupted]{position:relative}
[data-row-key^="session:"][data-power-suite-interrupted]::before{content:"";position:absolute;inset:0;z-index:1;border-radius:var(--dsw-radius-md);background-color:var(--dsw-specific-sidebar-fill);background-image:linear-gradient(var(--dsw-alias-interactive-bg-hover),var(--dsw-alias-interactive-bg-hover));opacity:0;pointer-events:none}
[data-row-key^="session:"][data-power-suite-interrupted]:hover::before,
html[data-input-modality="keyboard"] [data-row-key^="session:"][data-power-suite-interrupted]:focus-within::before{opacity:1}
[data-row-key^="session:"][data-power-suite-interrupted]:hover>span:first-child,
[data-row-key^="session:"][data-power-suite-interrupted]:hover>span:last-child,
html[data-input-modality="keyboard"] [data-row-key^="session:"][data-power-suite-interrupted]:focus-within>span:first-child,
html[data-input-modality="keyboard"] [data-row-key^="session:"][data-power-suite-interrupted]:focus-within>span:last-child{position:relative;z-index:2}
.dps-row-interrupted{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-state-warn-primary);pointer-events:none}
.dps-row-continue{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px 0 5px;border:0;border-radius:var(--dsw-radius-sm,4px);background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1;cursor:pointer;flex:none}
.dps-row-continue:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent);color:var(--dsw-alias-label-primary)}
.dps-row-continue:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
[data-row-key^="session:"][data-power-suite-interrupted] > span:first-child > svg{display:none!important}
html[data-power-suite-interrupted="true"] [data-conversation-region="composer"] button[class$="_primary"]>svg{display:none!important}
html[data-power-suite-interrupted="true"] [data-conversation-region="composer"] button[class$="_primary"]::before{content:"";display:block;width:16px;height:16px;background-color:currentColor;-webkit-mask:${PLAY_MASK} center/contain no-repeat;mask:${PLAY_MASK} center/contain no-repeat}
`
    //#endregion

    /**
     * Build one standalone warning icon element for dynamically decorated rows.
     * @returns {SVGElement} the icon.
     */
    function interruptedDecorBadgeIcon() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', '14')
      svg.setAttribute('height', '14')
      svg.setAttribute('fill', 'currentColor')
      svg.setAttribute('aria-hidden', 'true')
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      shape.setAttribute('d', REMIX_WARNING_FILL)
      svg.appendChild(shape)
      return svg
    }

    /**
     * Fetch interruption state for every Session row currently in the sidebar.
     * Running rows do not mount the custom leading slot, so without this walk
     * they would never get a record and the stale-spinner replacement could not
     * run after a reconnect.
     * @returns {void}
     */
    function discoverInterruptedRows() {
      for (const row of document.querySelectorAll('[data-row-key^="session:"]')) {
        const key = row.getAttribute('data-row-key')
        if (key === null) continue
        const sessionId = key.slice('session:'.length)
        if (sessionId.length === 0) continue
        if (interruptedStore.records.has(sessionId) || interruptedStore.inflight.has(sessionId)) continue
        ensureInterrupted(sessionId)
      }
    }

    /**
     * Keep native Session rows visually in sync with the Host interruption state.
     *
     * The shell only renders the custom leading slot for idle rows; a row that
     * the native client still believes is running renders its own green spinner
     * and no leading slot. This decoration places the warning badge in that
     * native leading span and hides the stale spinner, so the interrupted state
     * is visible immediately after a reconnect rather than after opening the
     * Session.
     * @returns {void}
     */
    function syncInterruptedRows() {
      const t = interruptedRuntime.t
      if (t === null) return
      for (const [sessionId, record] of interruptedStore.records) {
        const row = document.querySelector(`[data-row-key="session:${escapeSelectorValue(sessionId)}"]`)
        if (row === null) continue
        const interrupted = record.status === 'ready' && record.interrupted === true
        if (interrupted !== true) {
          row.removeAttribute('data-power-suite-interrupted')
          for (const badge of row.querySelectorAll('.dps-row-interrupted[data-dynamic-badge="true"]')) badge.remove()
          continue
        }
        row.setAttribute('data-power-suite-interrupted', '')
        const leading = row.firstElementChild
        if (leading === null) continue
        const badges = [...row.querySelectorAll('.dps-row-interrupted')]
        const persistent = badges.find((badge) => badge.getAttribute('data-dynamic-badge') !== 'true')
        if (persistent !== undefined) {
          for (const badge of badges) {
            if (badge !== persistent) badge.remove()
          }
          continue
        }
        let badge = badges[0]
        if (badge === undefined) {
          badge = document.createElement('span')
          badge.className = 'dps-row-interrupted'
          badge.setAttribute('data-dynamic-badge', 'true')
          badge.setAttribute('role', 'img')
          badge.setAttribute('aria-label', t('badge.aria'))
          badge.title = record.subagent === true ? t('badge.title.subagent') : t('badge.title')
          badge.appendChild(interruptedDecorBadgeIcon())
          leading.insertBefore(badge, leading.firstChild)
        }
      }
      for (const row of document.querySelectorAll('[data-row-key^="session:"][data-power-suite-interrupted]')) {
        const key = row.getAttribute('data-row-key')
        if (key === null) continue
        const sessionId = key.slice('session:'.length)
        const record = interruptedStore.records.get(sessionId)
        if (record !== undefined && record.status === 'ready' && record.interrupted === true) continue
        row.removeAttribute('data-power-suite-interrupted')
        for (const badge of row.querySelectorAll('.dps-row-interrupted[data-dynamic-badge="true"]')) badge.remove()
      }
    }

    //#region feature: interrupted sessions — components
    /**
     * Always-visible interruption mark in a Session row's leading seat: the cell
     * left of the title, where an idle row shows its status dot.
     * @param {object} props - row seat props plus the injected locale seat.
     * @returns {object | null} the mark, when the Session was interrupted.
     */
    function InterruptedBadge(props) {
      const { sessionId, t } = props
      const record = useInterruptedRecord(sessionId)
      const interrupted = record !== null && record.status === 'ready' && record.interrupted === true
      React.useEffect(() => {
        const row = document.querySelector(`[data-row-key="session:${escapeSelectorValue(sessionId)}"]`)
        if (row === null) return undefined
        if (!interrupted) {
          row.removeAttribute('data-power-suite-interrupted')
          return undefined
        }
        row.setAttribute('data-power-suite-interrupted', '')
        return () => row.removeAttribute('data-power-suite-interrupted')
      }, [sessionId, interrupted])
      if (!interrupted) return null
      return React.createElement('span', {
        className: 'dps-row-interrupted',
        role: 'img',
        'aria-label': t('badge.aria'),
        title: record.subagent === true ? t('badge.title.subagent') : t('badge.title')
      }, React.createElement(RemixIcon, { path: REMIX_WARNING_FILL, size: 14 }))
    }

    /**
     * Hover-only Continue action at the trailing edge of an interrupted Session
     * row. The row's own action area is hidden until hover, so this CTA appears
     * only then; the row mask keeps the underlying title clear.
     * @param {object} props - row action seat props plus the injected locale seat.
     * @returns {object | null} the action, when the Session was interrupted.
     */
    function InterruptedContinueAction(props) {
      const { sessionId, t } = props
      const record = useInterruptedRecord(sessionId, false)
      const interrupted = record !== null && record.status === 'ready' && record.interrupted === true
      if (!interrupted) return null
      return React.createElement('button', {
        type: 'button',
        className: 'dps-row-continue',
        title: t('continue.aria'),
        'aria-label': t('continue.aria'),
        onClick: (event) => {
          event.preventDefault()
          event.stopPropagation()
          requestContinue(sessionId)
        }
      }, React.createElement(RemixIcon, { path: REMIX_PLAY_FILL, size: 11 }), React.createElement('span', null, t('continue.label')))
    }

    /**
     * Renderless composer seat owning the interrupted-session affordance for the
     * open Conversation: mark the shell, turn the submit control into a play
     * control, and run the continue action from a row CTA, a pending request, or
     * the play control itself.
     * @param {object} props - overlay seat props plus the injected locale seat.
     * @returns {null} this seat renders nothing.
     */
    function InterruptedContinueSeat(props) {
      const { sessionId, useInput, inputActions, t } = props
      const draft = useInput((state) => state.draft)
      const phase = useInput((state) => state.phase)
      const record = useInterruptedRecord(sessionId, true)
      const interrupted = record !== null && record.status === 'ready' && record.interrupted === true
      const latest = React.useRef({})
      latest.current = { sessionId, draft, phase, interrupted, inputActions, t }

      const run = React.useCallback(() => {
        const now = latest.current
        if (now.interrupted !== true) return false
        if (now.phase !== 'plain') return false
        if (now.draft.trim() !== '') return false
        if (continueRuntime.pending === true) return false
        const target = now.sessionId
        const sentAt = Date.now()
        continueRuntime.pending = true
        fetch(appUrl(CONTINUE_ROUTE), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            sessionId: target,
            prompt: now.t('continue.prompt'),
            summary: now.t('continue.summary')
          })
        }).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          rememberContinueTime(sentAt)
          interruptedRuntime.hideContinuationRows?.()
          markInterrupted(target, false)
          window.setTimeout(() => refreshInterrupted(target), 2500)
        }).catch(() => {
          refreshInterrupted(target)
          if (typeof now.inputActions?.notify === 'function') {
            now.inputActions.notify('error', now.t('continue.failed'))
          }
        }).finally(() => {
          continueRuntime.pending = false
        })
        return true
      }, [])

      React.useEffect(() => {
        refreshInterrupted(sessionId)
      }, [sessionId])

      React.useEffect(() => {
        continueRuntime.current = { sessionId, interrupted, run }
        return () => {
          if (continueRuntime.current !== null && continueRuntime.current.sessionId === sessionId) {
            continueRuntime.current = null
          }
        }
      }, [sessionId, interrupted, run])

      React.useEffect(() => {
        const pending = continueRequest.pending
        if (pending === null || pending.sessionId !== sessionId) return
        if (Date.now() - pending.at > 30000) {
          continueRequest.pending = null
          return
        }
        if (record === null || record.status === 'loading') return
        if (!interrupted) {
          continueRequest.pending = null
          return
        }
        if (phase !== 'plain') return
        continueRequest.pending = null
        run()
      }, [sessionId, record, interrupted, phase, run])

      React.useEffect(() => {
        if (!interrupted) return undefined
        document.documentElement.dataset.powerSuiteInterrupted = 'true'
        const scope = document.querySelector('[data-conversation-region="composer"]')
        const button = scope === null ? null : scope.querySelector('button[class$="_primary"]')
        // Keep the empty-draft submit enabled while the Session is interrupted.
        // The shell owns the original attributes again on its next render, so this
        // effect never restores a stale label over the running Stop control.
        const apply = () => {
          if (!(button instanceof HTMLButtonElement)) return
          if (button.disabled) button.disabled = false
          if (button.getAttribute('aria-label') !== t('continue.aria')) button.setAttribute('aria-label', t('continue.aria'))
          if (button.getAttribute('title') !== t('continue.aria')) button.title = t('continue.aria')
        }
        apply()
        const observer = button instanceof HTMLButtonElement ? new MutationObserver(apply) : null
        if (observer !== null) observer.observe(button, { attributes: true, attributeFilter: ['disabled', 'aria-label', 'title'] })
        const onClick = (event) => {
          const now = latest.current
          if (now.interrupted !== true || now.phase !== 'plain' || now.draft.trim() !== '') return
          const target = event.target instanceof Element ? event.target.closest('button') : null
          if (target === null || button === null || target !== button) return
          event.preventDefault()
          event.stopPropagation()
          run()
        }
        document.addEventListener('click', onClick, true)
        return () => {
          document.removeEventListener('click', onClick, true)
          if (observer !== null) observer.disconnect()
          delete document.documentElement.dataset.powerSuiteInterrupted
        }
      }, [interrupted, sessionId, run, t])

      return null
    }

    /**
     * Register the interrupted-session affordances.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installInterruptedSessions(ctx) {
      const t = ctx.locale.bind(INTERRUPTED_NS)
      interruptedRuntime.uiWorkspace = ctx.uiWorkspace
      interruptedRuntime.t = t
      interruptedRuntime.continueTimes = loadContinueTimes()
      ctx.effect(() => ctx.locale.register(INTERRUPTED_NS, { en: INTERRUPTED_EN, zh: INTERRUPTED_ZH }), 'power-suite: interrupted dictionaries')
      ctx.effect(() => {
        let timer = null
        const schedule = () => {
          if (timer !== null) return
          timer = window.setTimeout(() => {
            timer = null
            discoverInterruptedRows()
            syncInterruptedRows()
          }, 80)
        }
        const touchesSessionRow = (records) => records.some((record) => {
          const target = record.target
          if (target instanceof Element && target.closest('[data-row-key^="session:"]') !== null) return true
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue
            if (node.matches('[data-row-key^="session:"]') || node.querySelector('[data-row-key^="session:"]') !== null) return true
          }
          return false
        })
        const unsubscribe = subscribeInterrupted(schedule)
        const observer = new MutationObserver((records) => {
          if (touchesSessionRow(records)) schedule()
        })
        observer.observe(document.body, { childList: true, subtree: true })
        schedule()
        return () => {
          unsubscribe()
          observer.disconnect()
          if (timer !== null) window.clearTimeout(timer)
        }
      }, 'power-suite: interrupted row decoration')
      ctx.effect(() => {
        const refresh = () => refreshAllInterrupted()
        const onVisibility = () => {
          if (document.visibilityState === 'visible') refresh()
        }
        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('focus', refresh)
        window.addEventListener('online', refresh)
        return () => {
          document.removeEventListener('visibilitychange', onVisibility)
          window.removeEventListener('focus', refresh)
          window.removeEventListener('online', refresh)
        }
      }, 'power-suite: interrupted refresh cues')
      ctx.effect(() => {
        // Every established Connection generation means the Host may have
        // restarted; wire-derived interruption state must be repulled.
        const dispose = ctx.on('connection/reset', () => refreshAllInterrupted())
        return typeof dispose === 'function' ? dispose : undefined
      }, 'power-suite: interrupted connection reset')
      ctx.effect(() => {
        // Near-real-time cross-device invalidation over the Host's SSE stream.
        // EventSource auto-reconnects; the 20 s poll above stays as fallback for
        // browsers without EventSource (or when the stream is unavailable).
        if (typeof EventSource !== 'function') return undefined
        let source = null
        try {
          source = new EventSource(appUrl(INTERRUPTED_EVENTS_ROUTE), { withCredentials: true })
        } catch {
          return undefined
        }
        const onOpen = () => refreshAllInterrupted()
        const onInterrupted = (message) => {
          let payload = null
          try {
            payload = JSON.parse(typeof message?.data === 'string' ? message.data : '')
          } catch {
            return
          }
          if (payload === null || typeof payload !== 'object') return
          const candidates = [payload.sessionId, payload.parentSession]
          for (const sessionId of candidates) {
            if (typeof sessionId !== 'string' || sessionId.length === 0) continue
            if (interruptedStore.watchers.has(sessionId) || interruptedStore.records.has(sessionId)) {
              refreshInterrupted(sessionId)
            }
          }
        }
        source.addEventListener('open', onOpen)
        source.addEventListener('interrupted', onInterrupted)
        return () => {
          source.removeEventListener('open', onOpen)
          source.removeEventListener('interrupted', onInterrupted)
          source.close()
        }
      }, 'power-suite: interrupted SSE stream')
      ctx.effect(() => {
        /**
         * The injected context producer renders as a native ContextInjectionRow.
         * Its source label is the element text; `data-context-source` itself is a
         * boolean marker. Hide the smallest ancestor that contains both the label
         * and the injection body, without depending on hashed CSS-module classes.
         * @param {Element} source - the `[data-context-source]` element.
         * @returns {void}
         */
        const hideOne = (source) => {
          if ((source.textContent ?? '').trim() !== 'power-suite-continue') return
          const body = source.closest('[data-context-injection-body]')
          if (body === null) {
            const trigger = source.closest('[data-turn-trigger]')
            if (trigger instanceof HTMLElement) trigger.style.display = 'none'
            return
          }
          let row = source.parentElement
          while (row !== null && !row.contains(body)) row = row.parentElement
          if (row instanceof HTMLElement) row.style.display = 'none'
        }
        const hideOneTrigger = (section) => {
          const time = section.querySelector('time[datetime]')
          const at = time === null ? Number.NaN : Date.parse(time.getAttribute('datetime') ?? '')
          if (Number.isNaN(at)) return
          // A continuation starts immediately after its request; hide only the
          // turn-trigger card correlated with one of our recent requests.
          if (interruptedRuntime.continueTimes.some((sentAt) => at >= sentAt - 1500 && at <= sentAt + 20000)) {
            section.style.display = 'none'
          }
        }
        const hideIn = (node) => {
          if (!(node instanceof Element)) return
          if (node.hasAttribute('data-context-source')) hideOne(node)
          for (const source of node.querySelectorAll('[data-context-source]')) hideOne(source)
          if (node.matches('section[data-turn-trigger]')) hideOneTrigger(node)
          for (const trigger of node.querySelectorAll('section[data-turn-trigger]')) hideOneTrigger(trigger)
        }
        const scan = () => hideIn(document.body)
        interruptedRuntime.hideContinuationRows = scan
        scan()
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const added of record.addedNodes) hideIn(added)
            hideIn(record.target)
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
        return () => {
          observer.disconnect()
          if (interruptedRuntime.hideContinuationRows === scan) interruptedRuntime.hideContinuationRows = null
        }
      }, 'power-suite: hide implicit continuation rows')
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.powerSuiteCss = 'interrupted'
        tag.textContent = INTERRUPTED_CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'power-suite: interrupted styles')
      ctx.effect(() => ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register({
        name: 'sidebar.session.row.leading',
        id: 'power-suite.interrupted-badge',
        order: 20,
        inject: () => ({ t })
      }, InterruptedBadge)), 'power-suite: interrupted badge')
      ctx.effect(() => ctx.slots.inject('sidebar.workspaces.session.row.action', () => ctx.slots.register({
        name: 'sidebar.workspaces.session.row.action',
        id: 'power-suite.interrupted-continue',
        order: 30,
        inject: () => ({ t })
      }, InterruptedContinueAction)), 'power-suite: interrupted continue action')
      ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'power-suite.interrupted-continue-seat',
        order: 30,
        inject: () => ({ t })
      }, InterruptedContinueSeat)), 'power-suite: interrupted continue seat')
    }
    //#endregion

    //#region feature: dynamic workspaces
    /** Copy namespace for the dynamic Workspace buckets and the running panel. */
    const DW_NS = 'dynamicWorkspaces'

    /** Seat identity of the frame-wide seat that owns this feature's DOM work. */
    const DW_SEAT = 'power-suite.dynamic-workspaces'

    /** Attribute marking every sidebar DOM node this feature owns, for cleanup. */
    const DW_ATTR = 'data-psd'

    /** localStorage key holding the two bucket fold states. */
    const DW_FOLD_KEY = 'power-suite.dynamic-workspaces.folds'

    /** Highest number of rows the summary card lists before "view all". */
    const DW_PANEL_LIMIT = 5

    /** Minutes a finished Session stays in the card by default. */
    const DW_DEFAULT_RECENT_MINUTES = 120

    /** Days a project stays Active by default. */
    const DW_DEFAULT_ACTIVE_DAYS = 7

    /**
     * The two retention windows the settings document controls, in
     * milliseconds. A finished Session stays in the summary card for
     * `recentMs`; a project stays in Active Projects for `activeMs` after its
     * last activity. Running Sessions ignore both windows.
     * @param {object} settings - current settings value.
     * @returns {{ recentMs: number, activeMs: number }} window lengths.
     */
    function dwWindows(settings) {
      const value = settings !== null && typeof settings === 'object' ? settings : {}
      const minutes = RECENT_SESSION_MINUTES.includes(value.recentSessionMinutes)
        ? value.recentSessionMinutes
        : DW_DEFAULT_RECENT_MINUTES
      const days = ACTIVE_PROJECT_DAYS.includes(value.activeProjectDays)
        ? value.activeProjectDays
        : DW_DEFAULT_ACTIVE_DAYS
      return { recentMs: minutes * 60 * 1000, activeMs: days * 24 * 60 * 60 * 1000 }
    }

    // Remix Icon paths (Apache-2.0, https://remixicon.com), inlined here so the
    // activity card needs no icon package at runtime.
    const DW_DEEPSEEK_FILL = 'M23.7493 4.92674C23.5053 4.80721 23.4103 5.0349 23.2676 5.15064C23.2193 5.18858 23.1777 5.23791 23.137 5.28155C22.7804 5.66482 22.3643 5.91527 21.8215 5.88492C21.0261 5.84128 20.348 6.09173 19.7484 6.7027C19.6207 5.94942 19.197 5.49975 18.553 5.21135C18.2154 5.06146 17.8739 4.91156 17.6385 4.58522C17.473 4.35374 17.4285 4.0957 17.3452 3.84145C17.2932 3.68777 17.2403 3.53028 17.0644 3.50372C16.8733 3.47337 16.7986 3.63464 16.7239 3.76935C16.4232 4.31959 16.3077 4.92674 16.3182 5.54149C16.3446 6.92274 16.9263 8.0232 18.0801 8.80687C18.2116 8.89605 18.2456 8.98707 18.204 9.11802C18.1255 9.38741 18.0319 9.64931 17.9487 9.9187C17.8967 10.0914 17.8181 10.1293 17.6347 10.0534C17.0011 9.78784 16.4534 9.39508 15.9701 8.91878C15.1493 8.1219 14.4069 7.24157 13.481 6.55281C13.2634 6.39151 13.0469 6.24162 12.8217 6.09932C11.8769 5.1772 12.9457 4.42015 13.1925 4.33097C13.4516 4.23801 13.2823 3.91544 12.4463 3.91924C11.6112 3.92304 10.8461 4.20385 9.87196 4.57763C9.72921 4.63455 9.54598 4.73128 9.4256 4.70855C8.54132 4.54158 7.62304 4.50363 6.66308 4.61178C4.8567 4.8148 3.4135 5.67241 2.35237 7.13714C1.07845 8.89605 0.778651 10.8959 1.1456 12.9829C1.53147 15.1801 2.64839 17.0016 4.36587 18.4246C6.14576 19.8989 8.19617 20.6218 10.535 20.4832C11.9555 20.4016 13.5377 20.2101 15.3214 18.694C15.7715 18.9179 16.2434 19.0071 17.0275 19.0754C17.6309 19.1323 18.2116 19.0451 18.6617 18.952C19.3663 18.8022 19.3172 18.1476 19.0628 18.0261C16.9973 17.0604 17.4502 17.4532 17.0379 17.1363C18.0876 15.8879 19.6699 14.592 20.2884 10.395C20.3367 10.061 20.295 9.85235 20.2884 9.58102C20.2847 9.41782 20.3216 9.35331 20.5088 9.33437C21.0261 9.2755 21.5283 9.13318 21.9898 8.8771C23.3281 8.14278 23.8571 6.93799 23.9848 5.49216C24.0037 5.27207 23.981 5.04248 23.7493 4.92674ZM12.0983 17.937C10.0962 16.3565 9.12577 15.8366 8.72484 15.8594C8.35024 15.8802 8.41745 16.3109 8.49968 16.5918C8.58577 16.8688 8.6983 17.0604 8.85626 17.3033C8.96501 17.4645 9.03978 17.7055 8.7475 17.8838C8.10252 18.2861 6.98184 17.7492 6.92886 17.7226C5.62465 16.9523 4.5342 15.9333 3.76532 14.5407C3.02385 13.1993 2.59259 11.7611 2.52166 10.2261C2.50275 9.85419 2.61151 9.72324 2.97846 9.65689C3.46173 9.56771 3.96109 9.54877 4.44436 9.61891C6.48717 9.9187 8.22638 10.837 9.68379 12.2886C10.5161 13.1177 11.1459 14.1062 11.7947 15.072C12.4841 16.0985 13.2265 17.0756 14.1714 17.8762C14.5042 18.1571 14.7709 18.3715 15.0253 18.529C14.2575 18.6144 12.9749 18.6333 12.0983 17.937ZM13.0573 11.7383C13.0573 11.5732 13.1887 11.4423 13.3542 11.4423C13.3911 11.4423 13.4252 11.4499 13.4554 11.4613C13.4961 11.4764 13.5339 11.4992 13.5633 11.5333C13.6162 11.5846 13.6465 11.6605 13.6465 11.7383C13.6465 11.9034 13.515 12.0343 13.3504 12.0343C13.1849 12.0343 13.0573 11.9034 13.0573 11.7383ZM16.0373 13.2752C15.8463 13.353 15.6552 13.4213 15.4718 13.4288C15.1871 13.4421 14.8759 13.3264 14.7066 13.1841C14.4447 12.964 14.2575 12.8406 14.1779 12.4536C14.1448 12.2886 14.1638 12.0343 14.1931 11.8882C14.2612 11.5732 14.1855 11.3721 13.9652 11.1881C13.7846 11.0382 13.5566 10.9984 13.3051 10.9984C13.2114 10.9984 13.1253 10.9566 13.061 10.9224C12.9561 10.8693 12.87 10.7384 12.9523 10.5771C12.9787 10.5259 13.1065 10.3988 13.1367 10.376C13.4772 10.1806 13.8706 10.2451 14.2347 10.3912C14.5723 10.5296 14.8267 10.7839 15.1936 11.1425C15.5691 11.5771 15.6363 11.6985 15.8501 12.0229C16.0184 12.279 16.1726 12.5408 16.2775 12.8406C16.3409 13.0266 16.2586 13.1802 16.0373 13.2752Z'
    const DW_ROBOT_2_LINE = 'M13.5 2C13.5 2.44425 13.3069 2.84339 13 3.11805V5H18C19.6569 5 21 6.34315 21 8V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V8C3 6.34315 4.34315 5 6 5H11V3.11805C10.6931 2.84339 10.5 2.44425 10.5 2C10.5 1.17157 11.1716 0.5 12 0.5C12.8284 0.5 13.5 1.17157 13.5 2ZM6 7C5.44772 7 5 7.44772 5 8V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V8C19 7.44772 18.5523 7 18 7H13H11H6ZM2 10H0V16H2V10ZM22 10H24V16H22V10ZM9 14.5C9.82843 14.5 10.5 13.8284 10.5 13C10.5 12.1716 9.82843 11.5 9 11.5C8.17157 11.5 7.5 12.1716 7.5 13C7.5 13.8284 8.17157 14.5 9 14.5ZM15 14.5C15.8284 14.5 16.5 13.8284 16.5 13C16.5 12.1716 15.8284 11.5 15 11.5C14.1716 11.5 13.5 12.1716 13.5 13C13.5 13.8284 14.1716 14.5 15 14.5Z'
    const DW_NEW_CHAT_LINE = 'M6.455 19L2 22.5V4C2 2.89543 2.89543 2 4 2H20C21.1046 2 22 2.89543 22 4V18C22 19.1046 21.1046 20 20 20H6.455ZM4 4V18.385L5.763 17H20V4H4ZM11 10V7H13V10H16V12H13V15H11V12H8V10H11Z'
    const DW_SPARKLING_LINE = 'M14 4.4375C15.3462 4.4375 16.4375 3.34619 16.4375 2H17.5625C17.5625 3.34619 18.6538 4.4375 20 4.4375V5.5625C18.6538 5.5625 17.5625 6.65381 17.5625 8H16.4375C16.4375 6.65381 15.3462 5.5625 14 5.5625V4.4375ZM1 11C4.31371 11 7 8.31371 7 5H9C9 8.31371 11.6863 11 15 11V13C11.6863 13 9 15.6863 9 19H7C7 15.6863 4.31371 13 1 13V11ZM4.87601 12C6.18717 12.7276 7.27243 13.8128 8 15.124 8.72757 13.8128 9.81283 12.7276 11.124 12 9.81283 11.2724 8.72757 10.1872 8 8.87601 7.27243 10.1872 6.18717 11.2724 4.87601 12ZM17.25 14C17.25 15.7949 15.7949 17.25 14 17.25V18.75C15.7949 18.75 17.25 20.2051 17.25 22H18.75C18.75 20.2051 20.2051 18.75 22 18.75V17.25C20.2051 17.25 18.75 15.7949 18.75 14H17.25Z'

    const DW_EN = {
      'panel.title': 'Running & recent',
      'panel.viewAll': 'View all {count}',
      'panel.showLess': 'Show less',
      'panel.collapse': 'Collapse recent sessions',
      'panel.expand': 'Expand recent sessions',
      'panel.open': 'Open {title}',
      'panel.done': 'done',
      'panel.children': '{count} subagents',
      'panel.expandChildren': 'Show subagents of {title}',
      'panel.collapseChildren': 'Hide subagents of {title}',
      'panel.empty.title': 'No running sessions',
      'panel.empty.hint': 'Sessions in progress across every Workspace appear here.',
      'hover.workspace': 'Workspace',
      'hover.status': 'Status',
      'hover.running': 'Running',
      'hover.done': 'Finished',
      'hover.updated': 'Last active',
      'hover.subagents': '{count} subagents',
      'hover.subagentsOne': '1 subagent',
      'hover.open': 'Click to open',
      'hover.newSession': 'New session in this directory',
      'count': '{count}',
      'group.active': 'Active Projects',
      'group.inactive': 'Inactive Projects',
      'group.toggleActive': 'Toggle active projects',
      'group.toggleInactive': 'Toggle inactive projects',
      'group.untitled': 'Untitled project',
      'group.ungrouped': 'Ungrouped',
      'time.now': 'now',
      'time.min': '{n}min',
      'time.hour': '{n}h',
      'time.day': '{n}d',
      'duration.seconds': '{s}s',
      'duration.minutes': '{m}m {s}s',
      'duration.hours': '{h}h {m}m'
    }
    const DW_ZH = {
      'panel.title': '进行中与最近活跃',
      'panel.viewAll': '查看全部 {count}',
      'panel.showLess': '收起',
      'panel.collapse': '收起最近活跃的 Session',
      'panel.expand': '展开最近活跃的 Session',
      'panel.open': '打开 {title}',
      'panel.done': '已完成',
      'panel.children': '{count} 个子代理',
      'panel.expandChildren': '展开 {title} 的子代理',
      'panel.collapseChildren': '收起 {title} 的子代理',
      'panel.empty.title': '没有进行中的 Session',
      'panel.empty.hint': '所有 Workspace 中正在进行的 Session 会汇总在这里。',
      'hover.workspace': '工作区',
      'hover.status': '状态',
      'hover.running': '进行中',
      'hover.done': '已完成',
      'hover.updated': '最后活动',
      'hover.subagents': '{count} 个子代理',
      'hover.subagentsOne': '1 个子代理',
      'hover.open': '点击打开',
      'hover.newSession': '在相同目录新建 Session',
      'count': '{count}',
      'group.active': '活跃项目',
      'group.inactive': '非活跃项目',
      'group.toggleActive': '收起或展开活跃项目',
      'group.toggleInactive': '收起或展开非活跃项目',
      'group.untitled': '未命名项目',
      'group.ungrouped': '未分组',
      'time.now': '刚刚',
      'time.min': '{n}分钟',
      'time.hour': '{n}小时',
      'time.day': '{n}天',
      'duration.seconds': '{s}秒',
      'duration.minutes': '{m}分 {s}秒',
      'duration.hours': '{h}小时 {m}分'
    }

    const DW_CSS = `
.psd-panel-slot{flex:none;min-width:0;display:block}
.psd-panel{margin:2px 8px 6px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.psd-panel-head{display:flex;align-items:center;gap:2px;padding:2px 4px 2px 2px}
.psd-panel-toggle{appearance:none;display:flex;align-items:center;gap:8px;flex:1;min-width:0;height:30px;box-sizing:border-box;padding:0 8px 0 17px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;font-weight:600;text-align:left;cursor:pointer}
.psd-panel-toggle:hover{background:var(--dsw-alias-interactive-bg-hover)}
.psd-panel-toggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-panel-chevron{appearance:none;flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:30px;box-sizing:border-box;padding:0;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.psd-panel-chevron:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.psd-panel-chevron:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-panel-chevron[aria-expanded='false'] .psd-chevron{transform:rotate(-90deg)}
.psd-indicator{flex:none;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary)}
.psd-spark{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary)}
.psd-pulse{position:relative;flex:none;width:8px;height:8px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-state-business-primary)}
.psd-pulse::after{content:'';position:absolute;inset:-4px;border-radius:50%;corner-shape:round;border:1px solid var(--dsw-alias-state-business-primary);opacity:.45;animation:psd-pulse 2s var(--ds-ease-in-out,ease) infinite}
@keyframes psd-pulse{0%{transform:scale(.7);opacity:.6}70%{transform:scale(1.25);opacity:0}100%{transform:scale(1.25);opacity:0}}
@media (prefers-reduced-motion: reduce){.psd-pulse::after{animation:none}}
.psd-panel-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.psd-count{flex:none;min-width:18px;padding:0 6px;box-sizing:border-box;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px;text-align:center;font-variant-numeric:tabular-nums}
.psd-panel-link{flex:none;appearance:none;display:inline-flex;align-items:center;box-sizing:border-box;height:30px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:18px;padding:0 8px;border-radius:var(--dsw-radius-md,8px);cursor:pointer;white-space:nowrap}
.psd-panel-link:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.psd-panel-link:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.psd-chevron{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);transition:transform 160ms var(--ds-ease-in-out,ease)}
.psd-panel-body{position:relative;display:flex;flex-direction:column;padding:2px 4px 5px;max-height:min(46cqh,320px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}
.psd-panel-body::-webkit-scrollbar{display:none;width:0;height:0}
.psd-panel-empty{padding:6px 10px 8px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;display:flex;flex-direction:column;gap:2px}
.psd-panel-empty strong{color:var(--dsw-alias-label-secondary);font-weight:500}
.psd-item{display:flex;flex-direction:column;min-width:0}
.psd-run{display:flex;align-items:center;gap:2px;min-width:0;min-height:28px;padding:0 0 0 7px;border-radius:var(--dsw-radius-md,8px)}
.psd-run-main:hover{background:var(--dsw-alias-interactive-bg-hover)}
@property --psd-ring-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
.psd-run-current{position:relative;isolation:isolate}
.psd-run-current::before{content:'';position:absolute;inset:-2px;border-radius:calc(var(--dsw-radius-md,8px) + 2px);padding:2px;background:conic-gradient(from var(--psd-ring-angle,0deg),#ff6b6b,#ffc46b,#e8e86b,#6bffab,#6bd9ff,#a78bff,#ff6bd4,#ff6b6b);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;z-index:0;filter:saturate(.92) drop-shadow(0 0 5px rgba(178,150,255,.38))}
.psd-run-current > *{position:relative;z-index:1}
.psd-child-ring{content:'';position:absolute;inset:-1px;border-radius:calc(var(--dsw-radius-sm,6px) + 1px);padding:2px;background:conic-gradient(from var(--psd-ring-angle,0deg),#ff6b6b,#ffc46b,#e8e86b,#6bffab,#6bd9ff,#a78bff,#ff6bd4,#ff6b6b);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;z-index:0;filter:saturate(.92) drop-shadow(0 0 4px rgba(178,150,255,.32))}
.psd-child-current{position:relative;isolation:isolate}
.psd-child-current > *:not(.psd-child-ring){position:relative;z-index:1}
@keyframes psd-ring-spin{to{--psd-ring-angle:360deg}}
@keyframes psd-ring-hue{from{filter:hue-rotate(0deg) saturate(.92) drop-shadow(0 0 5px rgba(178,150,255,.38))}to{filter:hue-rotate(360deg) saturate(.92) drop-shadow(0 0 5px rgba(178,150,255,.38))}}
.psd-run-current::before,.psd-child-ring{animation:psd-ring-spin 3.2s linear infinite,psd-ring-hue 14s linear infinite}
@media (prefers-reduced-motion: reduce){.psd-run-current::before,.psd-child-ring{animation:none}}
.psd-run-toggle{appearance:none;position:relative;z-index:1;flex:none;width:24px;height:26px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.psd-run-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.psd-run-toggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-run-toggle .psd-chevron{transition:transform 160ms var(--ds-ease-in-out,ease)}
.psd-run-toggle[aria-expanded='false'] .psd-chevron{transform:rotate(-90deg)}
.psd-run-toggle-spacer{flex:none;width:24px}
.psd-run-main{appearance:none;display:flex;flex:1;min-width:0;align-items:center;padding:4px 8px;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.psd-run-main:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-children{position:relative;display:flex;flex-direction:column;gap:1px;margin:0 0 4px 22px;padding-left:9px;border-left:1px solid var(--dsw-alias-border-l2)}
.psd-child{position:relative;display:flex;align-items:center;gap:2px;min-width:0;padding:0 4px 0 0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;text-align:left}
.psd-child-main{appearance:none;display:flex;align-items:center;gap:7px;flex:1;min-width:0;padding:3px 3px 3px 4px;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.psd-child::before{content:'';position:absolute;left:-10px;top:50%;width:14px;height:1px;background:var(--dsw-alias-border-l2);pointer-events:none}
.psd-child:last-child::after{content:'';position:absolute;left:-10px;top:calc(50% + 1px);bottom:-1px;width:2px;background:var(--dsw-alias-bg-layer-1);pointer-events:none}
.psd-child:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.psd-child-main:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-child-glyph{flex:none;display:inline-flex;align-items:center;justify-content:center}
.psd-child-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psd-child-time{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:16px;font-variant-numeric:tabular-nums}
.psd-run-head{display:flex;align-items:center;gap:8px;min-width:0;flex:1}
.psd-run-glyph{flex:none;display:inline-flex;align-items:center;justify-content:center}
.psd-run-brand{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary)}
.psd-child-brand{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary)}
.psd-run[data-state='done'] .psd-run-title{color:var(--dsw-alias-label-secondary)}
.psd-run-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:13px;line-height:19px}
.psd-run-time{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;font-variant-numeric:tabular-nums}
.psd-hovercard{position:fixed;z-index:1000;box-sizing:border-box;width:300px;max-height:320px;overflow:hidden;padding:10px 12px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,var(--dsw-shadow-lv2,none));color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:17px;pointer-events:none}
.psd-hovercard-title{font-size:13px;line-height:19px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psd-hovercard-path{margin-top:2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px;white-space:normal;word-break:break-all;overflow-wrap:anywhere;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
.psd-hovercard-row{display:flex;gap:6px;margin-top:6px;min-width:0}
.psd-hovercard-key{flex:none;min-width:62px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.psd-hovercard-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.psd-run-actions{display:flex;align-items:center;gap:2px;flex:none;opacity:0;pointer-events:none;transition:opacity 120ms var(--ds-ease-in-out,ease)}
.psd-run:hover .psd-run-actions,.psd-run:focus-within .psd-run-actions,.psd-child:hover .psd-run-actions,.psd-child:focus-within .psd-run-actions{opacity:1;pointer-events:auto}
.psd-row-action{appearance:none;display:inline-flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer}
.psd-row-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.psd-row-action:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-row-action[data-variant='continue']{color:var(--dsw-alias-state-warn-primary)}
.psd-row-action[data-hidden='true']{visibility:hidden;pointer-events:none}
.psd-interrupted{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;color:var(--dsw-alias-state-warn-primary)}
@media (prefers-reduced-motion: reduce){.psd-run-actions{transition:none}}
.psd-group-header{flex:none;display:block;margin:3px 0 0}
.psd-group-header[data-group='inactive']{margin-top:10px;padding-top:3px;border-top:0.5px solid var(--dsw-alias-border-l1)}
.psd-group-toggle{appearance:none;display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:4px 8px 4px 10px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:16px;font-weight:600;letter-spacing:.02em;text-align:left;cursor:pointer}
.psd-group-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.psd-group-toggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-group-toggle[aria-expanded='false'] .psd-chevron{transform:rotate(-90deg)}
.psd-group-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase}
.psd-group-count{flex:none;min-width:16px;padding:0 5px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px;text-align:center;font-variant-numeric:tabular-nums;font-weight:500}

`

    /**
     * Format a running duration for the summary card.
     * @param {number} ms - elapsed milliseconds.
     * @param {Function} t - namespace-bound translate.
     * @returns {string} compact duration.
     */
    function dwFormatDuration(ms, t) {
      const total = Math.max(0, Math.floor(Number.isFinite(ms) ? ms / 1000 : 0))
      const hours = Math.floor(total / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const seconds = total % 60
      if (hours > 0) return t('duration.hours', { h: hours, m: minutes })
      if (minutes > 0) return t('duration.minutes', { m: minutes, s: seconds })
      return t('duration.seconds', { s: seconds })
    }

    /**
     * Format a coarse relative distance for Session rows.
     * @param {number} ms - elapsed milliseconds.
     * @param {Function} t - namespace-bound translate.
     * @returns {string} relative label.
     */
    function dwFormatRelative(ms, t) {
      const total = Math.max(0, Math.floor(Number.isFinite(ms) ? ms / 1000 : 0))
      if (total < 60) return t('time.now')
      const minutes = Math.floor(total / 60)
      if (minutes < 60) return t('time.min', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('time.hour', { n: hours })
      return t('time.day', { n: Math.floor(hours / 24) })
    }

    /**
     * Display label of one Workspace: durable title, then directory basename.
     * @param {object} workspace - WorkspaceView row.
     * @param {Function} t - namespace-bound translate.
     * @returns {string} label.
     */
    function dwWorkspaceLabel(workspace, t) {
      if (workspace === null || typeof workspace !== 'object') return t('group.untitled')
      const title = typeof workspace.title === 'string' ? workspace.title.trim() : ''
      if (title.length > 0) return title
      const path = typeof workspace.path === 'string' ? workspace.path.replace(/[\\/]+$/, '') : ''
      const parts = path.split(/[\\/]/)
      const base = parts.length > 0 ? parts[parts.length - 1] : ''
      return base.length > 0 ? base : t('group.untitled')
    }

    /**
     * Whether one Session currently counts as running.
     *
     * The live Session-status snapshot is authoritative once it knows the row;
     * the list summary's running bit is the fallback while the status baseline
     * is still in flight.
     * @param {string} sessionId - Session identity.
     * @param {object} summary - Session list summary, if any.
     * @param {Map | undefined} statuses - live status snapshot.
     * @returns {boolean} whether the Session is running.
     */
    function dwSessionRunning(sessionId, summary, statuses) {
      if (statuses !== undefined && statuses !== null && typeof statuses.get === 'function') {
        const status = statuses.get(sessionId)
        if (status !== undefined && status !== null && typeof status.running === 'boolean') return status.running
      }
      return summary !== undefined && summary !== null && summary.running === true
    }

    /**
     * Count the running direct subagent children of each Session.
     *
     * A parent whose own turn has closed is still working while a delegated
     * child runs, so the card and the buckets must not treat that parent as
     * finished — a finished child is not a finished task.
     * @param {object} list - Session list state.
     * @param {Map | undefined} statuses - live status snapshot.
     * @returns {Map<string, number>} parent id → running direct children.
     */
    function dwRunningSubagentParents(list, statuses) {
      const parents = new Map()
      if (list === null || typeof list !== 'object' || list.byId === undefined || !Array.isArray(list.ids)) return parents
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary === undefined || summary.origin !== 'subagent' || summary.blank === true) continue
        if (!dwSessionRunning(id, summary, statuses)) continue
        const parentId = typeof summary.parentId === 'string' ? summary.parentId : ''
        if (parentId.length === 0) continue
        parents.set(parentId, (parents.get(parentId) ?? 0) + 1)
      }
      return parents
    }

    /**
     * Workspace display label for one Session: its owning Workspace's label,
     * or the ungrouped fallback when no Workspace accounts for it.
     * @param {string} sessionId - Session identity.
     * @param {readonly object[]} workspaces - Workspace rows.
     * @param {Function} t - namespace-bound translate.
     * @returns {string} workspace label.
     */
    function dwOwningWorkspace(sessionId, workspaces) {
      for (const candidate of workspaces) {
        if (Array.isArray(candidate.sessionIds) && candidate.sessionIds.includes(sessionId)) return candidate
      }
      return null
    }

    /**
     * Absolute local date-time label for hover detail.
     * @param {number} at - epoch milliseconds.
     * @returns {string} `YYYY-MM-DD HH:MM`, or an empty string for invalid input.
     */
    function dwFormatAbsoluteTime(at) {
      if (typeof at !== 'number' || !Number.isFinite(at)) return ''
      const date = new Date(at)
      const pad = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /**
     * Derive the running Session rows shown by the summary card, newest first.
     * @param {object} list - Session list state.
     * @param {Map | undefined} statuses - live status snapshot.
     * @param {readonly object[]} workspaces - Workspace rows.
     * @param {Function} t - namespace-bound translate.
     * @param {Map<string, number>} runningParents - parent id → running child count.
     * @param {Set<string>} archived - archived Session ids.
     * @param {Record<string, number>} activity - Host last-activity map.
     * @returns {Array<object>} running rows.
     */
    function dwRunningRows(list, statuses, workspaces, t, runningParents, archived, activity) {
      const rows = []
      if (list === null || typeof list !== 'object' || list.byId === undefined || !Array.isArray(list.ids)) return rows
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary === undefined || summary.blank === true || summary.origin === 'subagent') continue
        if (archived.has(id)) continue
        const own = dwSessionRunning(id, summary, statuses)
        const subagents = runningParents.get(id) ?? 0
        if (!own && subagents === 0) continue
        const owner = dwOwningWorkspace(id, workspaces)
        rows.push({
          id,
          title: typeof summary.displayTitle === 'string' && summary.displayTitle.length > 0 ? summary.displayTitle : id,
          workspace: owner === null ? t('group.ungrouped') : dwWorkspaceLabel(owner, t),
          workspacePath: owner !== null && typeof owner.path === 'string' ? owner.path : '',
          workspaceId: owner !== null ? owner.workspaceId : null,
          cwd: typeof summary.cwd === 'string' && summary.cwd.length > 0 ? summary.cwd : null,
          updatedAt: dwEffectiveUpdatedAt(activity, id, summary) || Date.now(),
          subagents,
          state: 'running'
        })
      }
      rows.sort((left, right) => right.updatedAt - left.updatedAt)
      return rows
    }

    /**
     * Derive the recently finished Session rows the card keeps after a stop.
     *
     * The card is the "find it again" surface, so a Session sits here for the
     * retention window after its last activity instead of vanishing the moment
     * its turn closes.
     * @param {object} list - Session list state.
     * @param {Map | undefined} statuses - live status snapshot.
     * @param {readonly object[]} workspaces - Workspace rows.
     * @param {Function} t - namespace-bound translate.
     * @param {number} now - current epoch milliseconds.
     * @param {number} recentMs - finished-Session retention window.
     * @param {Record<string, number>} activity - Host last-activity map.
     * @returns {Array<object>} recently finished rows, newest first.
     */
    function dwRecentRows(list, statuses, workspaces, t, now, runningParents, archived, recentMs, activity) {
      const rows = []
      if (list === null || typeof list !== 'object' || list.byId === undefined || !Array.isArray(list.ids)) return rows
      const cutoff = now - recentMs
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary === undefined || summary.blank === true || summary.origin === 'subagent') continue
        if (archived.has(id)) continue
        if (dwSessionRunning(id, summary, statuses) || runningParents.has(id)) continue
        const updatedAt = dwEffectiveUpdatedAt(activity, id, summary)
        if (updatedAt < cutoff) continue
        const owner = dwOwningWorkspace(id, workspaces)
        rows.push({
          id,
          title: typeof summary.displayTitle === 'string' && summary.displayTitle.length > 0 ? summary.displayTitle : id,
          workspace: owner === null ? t('group.ungrouped') : dwWorkspaceLabel(owner, t),
          workspacePath: owner !== null && typeof owner.path === 'string' ? owner.path : '',
          workspaceId: owner !== null ? owner.workspaceId : null,
          cwd: typeof summary.cwd === 'string' && summary.cwd.length > 0 ? summary.cwd : null,
          updatedAt,
          subagents: 0,
          state: 'done'
        })
      }
      rows.sort((left, right) => right.updatedAt - left.updatedAt)
      return rows
    }

    /**
     * Sessions that keep a Workspace Active: running now, or last active
     * inside the retention window.
     * @param {object} list - Session list state.
     * @param {Map | undefined} statuses - live status snapshot.
     * @param {readonly object[]} workspaces - Workspace rows.
     * @param {number} now - current epoch milliseconds.
     * @param {number} activeMs - Active Projects retention window.
     * @param {Record<string, number>} activity - Host last-activity map.
     * @returns {{ rows: Array<object>, workspaceOf: Map<string, string> }} activity facts.
     */
    function dwActiveSessions(list, statuses, workspaces, now, archived, activeMs, activity) {
      const workspaceOf = new Map()
      for (const workspace of workspaces) {
        for (const id of workspace.sessionIds ?? []) workspaceOf.set(id, workspace.workspaceId)
      }
      const rows = []
      if (list === null || typeof list !== 'object' || list.byId === undefined || !Array.isArray(list.ids)) {
        return { rows, workspaceOf }
      }
      const runningParents = dwRunningSubagentParents(list, statuses)
      const cutoff = now - activeMs
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary === undefined || summary.blank === true || summary.origin === 'subagent') continue
        if (archived.has(id)) continue
        const running = dwSessionRunning(id, summary, statuses) || runningParents.has(id)
        const updatedAt = dwEffectiveUpdatedAt(activity, id, summary)
        if (!running && updatedAt < cutoff) continue
        rows.push({ id, running, updatedAt })
      }
      return { rows, workspaceOf }
    }

    /**
     * Read the persisted bucket fold states, degrading to expanded.
     * @returns {{ active: boolean, inactive: boolean }} fold states.
     */
    function dwReadFolds() {
      try {
        const raw = window.localStorage.getItem(DW_FOLD_KEY)
        if (raw === null) return { active: false, inactive: false }
        const value = JSON.parse(raw)
        return { active: value?.active === true, inactive: value?.inactive === true }
      } catch {
        return { active: false, inactive: false }
      }
    }

    /**
     * Persist the bucket fold states.
     * @param {{ active: boolean, inactive: boolean }} folds - fold states.
     * @returns {void}
     */
    function dwWriteFolds(folds) {
      try {
        window.localStorage.setItem(DW_FOLD_KEY, JSON.stringify({ active: folds.active, inactive: folds.inactive }))
      } catch {
        // A storage-denied browser keeps the in-memory state only.
      }
    }

    /** localStorage key holding acknowledged completed Sessions and their baselines. */
    const DW_ACK_KEY = 'dsh-power-suite.acked-sessions'

    /** Schema version of the persisted acknowledgement document. */
    const DW_ACK_VERSION = 1

    /**
     * Confidence window for the derived read predicate: a row is read when its
     * acknowledged baseline is at least `updatedAt - tolerance`. `updatedAt` can
     * move for metadata-only reasons; genuinely newer activity raises it past
     * this window and the unread mark returns on every device.
     */
    const DW_ACK_TOLERANCE_MS = 1000

    /** Authenticated Host route that shares read baselines across browsers. */
    const DW_ACK_ROUTE = 'api/power-suite.read-acks'

    /** How often the client re-reads the Host-shared document. */
    const DW_ACK_SYNC_POLL_MS = 30000

    /** Debounce before increased local baselines are pushed to the Host. */
    const DW_ACK_PUSH_DEBOUNCE_MS = 250

    /** Abort a hung read-acks GET/POST so the next sync cycle can retry. */
    const DW_ACK_REQUEST_TIMEOUT_MS = 8000

    /** Most entries one read-acks POST carries (Host cap is 64 KiB UTF-8). */
    const DW_ACK_PUSH_BATCH_ENTRIES = 200

    /** Conservative byte budget for one read-acks POST batch. */
    const DW_ACK_PUSH_BATCH_BYTES = 48 * 1024


    /** Most entries the local cache keeps; the oldest baselines drop first. */
    const DW_ACK_MAX_ENTRIES = 1000

    /** Longest Session id the Host accepts in a read-acks document. */
    const DW_ACK_MAX_ID_LENGTH = 200

    /** Authenticated Host route exposing true last-activity timestamps. */
    const DW_ACTIVITY_ROUTE = 'api/power-suite.session-activity'

    /**
     * Read the persisted acknowledgement baselines: Session id → the effective
     * `updatedAt` observed when the user last opened that completed Session
     * (the Host activity map supersedes the stale catalog prompt time). Corrupt,
     * missing, or storage-denied documents read as empty.
     * @returns {Map<string, number>} baselines.
     */
    function dwReadAckedBaselines() {
      const baselines = new Map()
      try {
        const raw = window.localStorage.getItem(DW_ACK_KEY)
        if (raw === null) return baselines
        const value = JSON.parse(raw)
        const source = value !== null && typeof value === 'object' && value.acked !== null && typeof value.acked === 'object'
          ? value.acked
          : null
        if (source === null) return baselines
        for (const [id, at] of Object.entries(source)) {
          if (typeof id !== 'string' || id.length === 0) continue
          if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) continue
          baselines.set(id, at)
        }
      } catch {
        // A corrupt document or a storage-denied browser starts empty.
      }
      // Never load more than the bounded map the Host accepts; the extras would
      // only bloat every migration push.
      return dwCapAckedBaselines(baselines)
    }

    /**
     * Persist the acknowledgement baselines under the versioned document.
     * @param {Map<string, number>} baselines - Session id → acknowledged updatedAt.
     * @returns {void}
     */
    function dwWriteAckedBaselines(baselines) {
      try {
        const acked = {}
        for (const [id, at] of baselines) {
          if (typeof id !== 'string' || id.length === 0) continue
          if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) continue
          acked[id] = at
        }
        window.localStorage.setItem(DW_ACK_KEY, JSON.stringify({ version: DW_ACK_VERSION, acked }))
      } catch {
        // A storage-denied browser keeps the in-memory state only.
      }
    }

    /**
     * Sanitize one decoded `acked` object into plain entries the Host accepts.
     * @param {unknown} value - candidate entries from localStorage or a Host payload.
     * @returns {Record<string, number>} valid id → baseline entries.
     */
    function dwSanitizeAckEntries(value) {
      const entries = {}
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return entries
      for (const [id, baseline] of Object.entries(value)) {
        if (typeof id !== 'string' || id.length === 0 || id.length > DW_ACK_MAX_ID_LENGTH) continue
        if (typeof baseline !== 'number' || !Number.isFinite(baseline) || baseline <= 0) continue
        entries[id] = baseline
      }
      return entries
    }

    /**
     * Bound a baseline map, dropping the oldest acknowledged Sessions first.
     * @param {Map<string, number>} baselines - baselines.
     * @returns {Map<string, number>} the same map when already bounded, else a capped copy.
     */
    function dwCapAckedBaselines(baselines) {
      if (baselines.size <= DW_ACK_MAX_ENTRIES) return baselines
      const entries = [...baselines.entries()].sort((left, right) => (right[1] - left[1]) || left[0].localeCompare(right[0]))
      const capped = new Map(entries.slice(0, DW_ACK_MAX_ENTRIES))
      return capped
    }

    /**
     * Merge Host/local entries into a baseline map per Session id.
     * @param {Map<string, number>} baselines - current baselines.
     * @param {Record<string, number>} entries - incoming sanitized entries.
     * @returns {Map<string, number>} the same map when nothing changed, else the merged map.
     */
    function dwMergeAckedBaselines(baselines, entries) {
      const sanitized = dwSanitizeAckEntries(entries)
      let changed = false
      const next = new Map(baselines)
      for (const [id, baseline] of Object.entries(sanitized)) {
        const previous = next.get(id)
        if (previous !== undefined && previous >= baseline) continue
        next.set(id, baseline)
        changed = true
      }
      if (!changed) return baselines
      return dwCapAckedBaselines(next)
    }

    /**
     * Plain JSON object of one baseline map, for a Host POST body.
     * @param {Map<string, number>} baselines - baselines.
     * @returns {Record<string, number>} the entries.
     */
    function dwAckedRecords(baselines) {
      const entries = {}
      for (const [id, baseline] of baselines) entries[id] = baseline
      return entries
    }

    /**
     * Derived read state for one activity-card row or child.
     *
     * An acknowledgement only remembers the last-read `updatedAt`; a row is read
     * while that baseline covers the row's current activity. No running-status
     * input is involved, so a transient flag can never flip a read row back to
     * unread.
     * @param {Map<string, number>} baselines - acknowledged baselines.
     * @param {string} sessionId - Session identity.
     * @param {number | undefined} updatedAt - the row's current activity timestamp.
     * @returns {boolean} whether the row is read.
     */
    function dwIsAcked(baselines, sessionId, updatedAt) {
      if (baselines === null || baselines === undefined || typeof baselines.get !== 'function') return false
      const baseline = baselines.get(sessionId)
      if (typeof baseline !== 'number') return false
      const current = typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : 0
      return baseline >= current - DW_ACK_TOLERANCE_MS
    }

    /**
     * Read the Host-shared read baselines. A missing route (older Host) or a
     * transport failure reads as null and leaves the local cache authoritative.
     * @returns {Promise<Record<string, number> | null>} sanitized entries or null.
     */
    async function dwFetchReadAcks() {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), DW_ACK_REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(appUrl(DW_ACK_ROUTE), {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal: controller.signal
        })
        if (!response.ok) return null
        const payload = await response.json()
        const acked = payload !== null && typeof payload === 'object' ? payload.acked : null
        return dwSanitizeAckEntries(acked)
      } catch {
        return null
      } finally {
        window.clearTimeout(timer)
      }
    }

    /**
     * Merge local baselines into the Host document. Failures are silent so an
     * older Host keeps the local-only behavior.
     * @param {Record<string, number>} entries - increased local baselines.
     * @returns {Promise<Record<string, number> | null>} the merged entries or null.
     */
    async function dwPostReadAcks(entries) {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), DW_ACK_REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(appUrl(DW_ACK_ROUTE), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ acked: entries }),
          signal: controller.signal
        })
        if (!response.ok) {
          // Permanent responses (other non-retryable 4xx: bad shape, too large,
          // media type, missing route, ...) drop that batch immediately so it
          // can never block newer acks. 5xx (including store-failed), 401/403
          // (token/connection hiccup), 408, 425, 429 and network/timeout
          // failures stay queued for a later sync.
          const retryable = response.status >= 500 || response.status === 401 || response.status === 403
            || response.status === 408 || response.status === 425 || response.status === 429
          return { merged: null, status: response.status, retryable }
        }
        const payload = await response.json()
        const acked = payload !== null && typeof payload === 'object' ? payload.acked : null
        return { merged: dwSanitizeAckEntries(acked), status: response.status, retryable: false }
      } catch {
        // Timeout/network: retry on a later sync cycle.
        return { merged: null, status: 0, retryable: true }
      } finally {
        window.clearTimeout(timer)
      }
    }

    /**
     * Split one pending baseline map into POST-sized batches.
     *
     * The Host caps a request body at 64 KiB UTF-8; 200 entries and a
     * conservative estimated-byte budget keep every batch far below that even
     * for long ids, so a large local cache can never pin the sync loop in a
     * permanent 413. Values are estimated as UTF-16 code units × 3 (worst-case
     * UTF-8 expansion) plus JSON punctuation.
     * @param {Map<string, number>} pending - queued baselines.
     * @returns {Array<Record<string, number>>} batches, each under the entry and byte caps.
     */
    function dwAckPushBatches(pending) {
      const batches = []
      let batch = {}
      let entries = 0
      let bytes = 0
      for (const [id, baseline] of pending) {
        const entryBytes = id.length * 3 + 32
        if (entries > 0 && (entries >= DW_ACK_PUSH_BATCH_ENTRIES || bytes + entryBytes > DW_ACK_PUSH_BATCH_BYTES)) {
          batches.push(batch)
          batch = {}
          entries = 0
          bytes = 0
        }
        batch[id] = baseline
        entries += 1
        bytes += entryBytes
      }
      if (entries > 0) batches.push(batch)
      return batches
    }

    /**
     * Bound the pending ack map to the same 1000-entry limit as the local map,
     * dropping the oldest (smallest) baselines first. Pending entries retained
     * after a failed push therefore can never grow into an unbounded queue.
     * @param {Map<string, number>} pending - queued baselines.
     * @returns {Map<string, number>} the same map when already bounded, else a capped copy.
     */
    function dwCapAckPending(pending) {
      if (pending.size <= DW_ACK_MAX_ENTRIES) return pending
      const entries = [...pending.entries()].sort((left, right) => (right[1] - left[1]) || left[0].localeCompare(right[0]))
      return new Map(entries.slice(0, DW_ACK_MAX_ENTRIES))
    }

    /**
     * Last observed activity for one Session.
     *
     * The catalog summary's `updatedAt` is the last *prompt* time, which is
     * stale for a turn that ran for hours. The Host activity route carries the
     * real latest model-visible activity, so the card prefers whichever is
     * newer and falls back to the summary when the route is unavailable (older
     * Host).
     * @param {Record<string, number>} activity - Host activity map.
     * @param {string} sessionId - Session identity.
     * @param {object | undefined} summary - catalog session summary.
     * @returns {number} effective epoch milliseconds, 0 when neither source has one.
     */
    function dwEffectiveUpdatedAt(activity, sessionId, summary) {
      const summaryAt = summary !== null && typeof summary === 'object'
        && typeof summary.updatedAt === 'number' && Number.isFinite(summary.updatedAt)
        ? summary.updatedAt
        : 0
      const hostAt = activity !== null && typeof activity === 'object'
        && typeof activity[sessionId] === 'number' && Number.isFinite(activity[sessionId])
        ? activity[sessionId]
        : 0
      return Math.max(summaryAt, hostAt)
    }

    /**
     * Merge a fresh Host activity map monotonically: per-id max(previous, next),
     * then prune ids no longer present in a non-empty Session catalog. A partial
     * response, a cold-seed timeout or an HMR overlap therefore cannot drop a
     * Session's known activity; only a catalog that no longer lists the Session
     * removes it. When the catalog is empty or still loading, previous entries
     * are kept untouched (no prune) so known activity survives until a real
     * catalog arrives. The client bundle is an unexported module-loader closure,
     * so this rule is not unit-tested in the node harness (stated gap).
     * @param {Record<string, number>} previous - current client activity map.
     * @param {Record<string, number>} incoming - Host response map.
     * @param {readonly string[] | null} sessionIds - current Session catalog ids.
     * @returns {Record<string, number>} merged/pruned map.
     */
    function dwMergeActivityMaps(previous, incoming, sessionIds) {
      const next = {}
      if (previous !== null && typeof previous === 'object') {
        for (const [id, time] of Object.entries(previous)) {
          if (typeof time === 'number' && Number.isFinite(time) && time > 0) next[id] = time
        }
      }
      if (incoming !== null && typeof incoming === 'object') {
        for (const [id, time] of Object.entries(incoming)) {
          if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) continue
          const current = next[id]
          if (current === undefined || time > current) next[id] = time
        }
      }
      if (Array.isArray(sessionIds) && sessionIds.length > 0) {
        const allowed = new Set(sessionIds)
        for (const id of Object.keys(next)) {
          if (!allowed.has(id)) delete next[id]
        }
      }
      return next
    }

    /**
     * Read the Host-backed last-activity map. A missing route (older Host) or a
     * transport failure reads as null and leaves summary timestamps in charge.
     * @returns {Promise<Record<string, number> | null>} Session id → activity time, or null.
     */
    async function dwFetchSessionActivity() {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), DW_ACK_REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(appUrl(DW_ACTIVITY_ROUTE), {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal: controller.signal
        })
        if (!response.ok) return null
        const payload = await response.json()
        const sessions = payload !== null && typeof payload === 'object' ? payload.sessions : null
        if (sessions === null || typeof sessions !== 'object' || Array.isArray(sessions)) return null
        const activity = {}
        for (const [id, at] of Object.entries(sessions)) {
          if (typeof id !== 'string' || id.length === 0) continue
          if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue
          activity[id] = at
        }
        return activity
      } catch {
        return null
      } finally {
        window.clearTimeout(timer)
      }
    }

    /**
     * Find the live geometry this feature augments.
     *
     * The native browser keeps owning `sidebar.workspaces`; this feature only
     * inserts two sibling nodes into it (a summary slot above the header and
     * one bucket header inside the list) and sets flex order on the native
     * group sections. Anchors are the slot wrapper and the tree role, so a
     * native re-render never needs matching hashed class names.
     * @returns {object | null} mount refs, or null while the expanded browser is absent.
     */
    function dwFindMounts() {
      const wrapper = document.querySelector('[data-slot="sidebar.workspaces"]')
      if (!(wrapper instanceof HTMLElement)) return null
      const root = wrapper.firstElementChild
      if (!(root instanceof HTMLElement)) return null
      const list = root.querySelector('[role="tree"]')
      const existingPanel = root.querySelector(`:scope > [${DW_ATTR}="panel"]`)
      if (!(list instanceof HTMLElement)) {
        // Rail state keeps the panel node but hides it until the column widens.
        if (existingPanel instanceof HTMLElement) existingPanel.style.display = 'none'
        return null
      }
      let panel = existingPanel
      if (!(panel instanceof HTMLElement)) {
        panel = document.createElement('div')
        panel.setAttribute(DW_ATTR, 'panel')
        panel.className = 'psd-panel-slot'
        root.insertBefore(panel, root.firstElementChild)
      }
      panel.style.display = ''
      let activeHeader = list.querySelector(`:scope > [${DW_ATTR}="group"][data-group="active"]`)
      if (!(activeHeader instanceof HTMLElement)) {
        activeHeader = document.createElement('div')
        activeHeader.setAttribute(DW_ATTR, 'group')
        activeHeader.dataset.group = 'active'
        activeHeader.className = 'psd-group-header'
        list.appendChild(activeHeader)
      }
      let inactiveHeader = list.querySelector(`:scope > [${DW_ATTR}="group"][data-group="inactive"]`)
      if (!(inactiveHeader instanceof HTMLElement)) {
        inactiveHeader = document.createElement('div')
        inactiveHeader.setAttribute(DW_ATTR, 'group')
        inactiveHeader.dataset.group = 'inactive'
        inactiveHeader.className = 'psd-group-header'
        list.appendChild(inactiveHeader)
      }
      if (list.style.display !== 'flex') list.style.display = 'flex'
      if (list.style.flexDirection !== 'column') list.style.flexDirection = 'column'
      return { wrapper, root, list, panel, activeHeader, inactiveHeader }
    }

    /**
     * The 12px disclosure chevron.
     * @returns {object} React element.
     */
    function DwChevron() {
      return React.createElement('svg', {
        width: 12,
        height: 12,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: 'false'
      }, React.createElement('path', { d: 'm6 9 6 6 6-6' }))
    }

    /**
     * Direct subagent Sessions grouped under their parent Session.
     *
     * Only recent children (running now or last active inside the retention
     * window) are returned: a parent accumulates subagent Sessions over time,
     * and the card is about the current work. Subagent Sessions never render
     * as top-level card rows.
     * @param {object} list - Session list state.
     * @param {Map | undefined} statuses - live status snapshot.
     * @param {number} now - current epoch milliseconds.
     * @param {number} recentMs - finished-Session retention window.
     * @param {Set<string>} archived - archived Session ids.
     * @param {readonly object[]} workspaces - Workspace rows.
     * @param {Record<string, number>} activity - Host last-activity map.
     * @returns {Map<string, Array<object>>} parent id → child rows, newest first.
     */
    function dwSubagentChildren(list, statuses, now, archived, recentMs, workspaces, activity) {
      const children = new Map()
      if (list === null || typeof list !== 'object' || list.byId === undefined || !Array.isArray(list.ids)) return children
      const cutoff = now - recentMs
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary === undefined || summary.origin !== 'subagent' || summary.blank === true) continue
        if (archived.has(id)) continue
        const parentId = typeof summary.parentId === 'string' ? summary.parentId : ''
        if (parentId.length === 0) continue
        const running = dwSessionRunning(id, summary, statuses)
        const updatedAt = dwEffectiveUpdatedAt(activity, id, summary)
        if (!running && updatedAt < cutoff) continue
        const owner = dwOwningWorkspace(id, workspaces)
        const row = {
          id,
          title: typeof summary.displayTitle === 'string' && summary.displayTitle.length > 0 ? summary.displayTitle : id,
          workspaceId: owner !== null ? owner.workspaceId : null,
          cwd: typeof summary.cwd === 'string' && summary.cwd.length > 0 ? summary.cwd : null,
          updatedAt,
          state: running ? 'running' : 'done'
        }
        const siblings = children.get(parentId)
        if (siblings === undefined) children.set(parentId, [row])
        else siblings.push(row)
      }
      for (const rows of children.values()) rows.sort((left, right) => right.updatedAt - left.updatedAt)
      return children
    }

    /**
     * The native shell's "new chat" sprite icon, with an inlined Remix fallback
     * for a shell build that does not ship the symbol.
     * @returns {object} the SVG element.
     */
    function DwNewChatGlyph() {
      const sprite = document.getElementById('dsw-icon-new-chat-outline-regular')
      if (sprite !== null) {
        return React.createElement('svg', {
          width: 14,
          height: 14,
          'data-icon': 'dsw-icon-new-chat-outline-regular',
          'aria-hidden': true,
          focusable: 'false'
        }, React.createElement('use', { href: '#dsw-icon-new-chat-outline-regular' }))
      }
      return RemixGlyph(DW_NEW_CHAT_LINE, 14)
    }

    /**
     * Fixed row trailing action cluster: [Continue (interrupted)] [New session].
     *
     * It lives inside the row, immediately before the disclosure chevron, in
     * reserved fixed-width slots that are revealed on row hover/focus-within
     * through opacity only, so the title/time layout never shifts. Both buttons
     * stop the row's open handler.
     * @param {object} props - action props.
     * @param {Function} props.t - dynamic-Workspaces translate.
     * @param {Function} props.interruptedT - interrupted-feature translate.
     * @param {object} props.row - row carrying id/workspaceId/cwd.
     * @param {boolean} props.interrupted - whether this Session was interrupted.
     * @param {Function} props.onNewSession - create-and-open same-directory Session.
     * @returns {object} the cluster element.
     */
    function DwRowActionCluster({ t, interruptedT, row, interrupted, onNewSession }) {
      const continueLabel = interruptedT('continue.aria')
      const newLabel = t('hover.newSession')
      return React.createElement('span', { className: 'psd-run-actions' },
        React.createElement('button', {
          type: 'button',
          className: 'psd-row-action',
          'data-variant': 'continue',
          'data-hidden': interrupted ? undefined : 'true',
          disabled: !interrupted,
          tabIndex: interrupted ? 0 : -1,
          'aria-label': continueLabel,
          title: continueLabel,
          onClick: (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!interrupted) return
            requestContinue(row.id)
          }
        }, React.createElement(RemixIcon, { path: REMIX_PLAY_FILL, size: 12 })),
        React.createElement('button', {
          type: 'button',
          className: 'psd-row-action',
          'data-variant': 'new-session',
          'aria-label': newLabel,
          title: newLabel,
          onClick: (event) => {
            event.preventDefault()
            event.stopPropagation()
            onNewSession(row)
          }
        }, React.createElement(DwNewChatGlyph)))
    }

    /**
     * Render the running-Sessions summary card.
     * @param {object} props - component props.
     * @returns {object} React element.
     */
    function DynamicRunningPanel(props) {
      const {
        t, rows, expanded, showAll, now, durations, childrenByParent, collapsedParents, acked,
        onToggle, onToggleAll, onToggleChildren, onOpen, interruptedT, onNewSession, currentSessionId
      } = props
      const visible = expanded && !showAll ? rows.slice(0, DW_PANEL_LIMIT) : rows
      const canExpand = rows.length > DW_PANEL_LIMIT
      const anyRunning = rows.some((row) => row.state === 'running')
      const isRead = (sessionId, updatedAt) => dwIsAcked(acked, sessionId, updatedAt)
      const isCurrent = (sessionId) => typeof currentSessionId === 'string' && sessionId === currentSessionId
      // Card rows share the suite's interruption records; the rows also exist in
      // the native sidebar, whose badge seats already pull them, but ensuring and
      // watching here keeps this card correct on its own after a reconnect.
      React.useSyncExternalStore(subscribeInterrupted, interruptedVersion, interruptedVersion)
      const interruptedIds = []
      for (const row of visible) {
        interruptedIds.push(row.id)
        if (collapsedParents.has(row.id)) continue
        for (const child of childrenByParent.get(row.id) ?? []) interruptedIds.push(child.id)
      }
      const interruptedKey = interruptedIds.join('|')
      React.useEffect(() => {
        const unwatch = interruptedIds.map((sessionId) => {
          ensureInterrupted(sessionId)
          return watchInterrupted(sessionId)
        })
        return () => {
          for (const dispose of unwatch) dispose()
        }
      }, [interruptedKey])
      const rowInterrupted = React.useCallback((sessionId) => {
        const record = interruptedRecord(sessionId)
        return record !== null && record.status === 'ready' && record.interrupted === true
      }, [])
      const interruptedTitle = (sessionId) => {
        const record = interruptedRecord(sessionId)
        return record !== null && record.subagent === true ? interruptedT('badge.title.subagent') : interruptedT('badge.title')
      }

      // Hover detail card for one row: the row itself only carries the title,
      // state and time; the workspace and other facts live in the card. The card
      // anchors to the panel's right edge (not the row's), so it sits entirely
      // outside the sidebar and can never cover the row's trailing actions.
      const [hover, setHover] = React.useState(null)
      const hoverTimer = React.useRef(null)
      const clearHoverTimer = () => {
        if (hoverTimer.current !== null) {
          window.clearTimeout(hoverTimer.current)
          hoverTimer.current = null
        }
      }
      React.useEffect(() => () => clearHoverTimer(), [])
      React.useEffect(() => {
        if (hover === null) return undefined
        const dismiss = () => setHover(null)
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          dismiss()
        }
        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('scroll', dismiss, true)
        window.addEventListener('resize', dismiss)
        return () => {
          window.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('scroll', dismiss, true)
          window.removeEventListener('resize', dismiss)
        }
      }, [hover])
      const showHover = (row, element) => {
        clearHoverTimer()
        hoverTimer.current = window.setTimeout(() => {
          if (!(element instanceof HTMLElement) || !element.isConnected) return
          const rect = element.getBoundingClientRect()
          const panel = element.closest('.psd-panel')
          const anchorRight = panel instanceof HTMLElement ? panel.getBoundingClientRect().right : rect.right
          setHover({ row, top: Math.round(rect.top), anchorRight: Math.round(anchorRight) })
        }, 260)
      }
      const hideHover = () => {
        clearHoverTimer()
        hoverTimer.current = window.setTimeout(() => setHover(null), 140)
      }

      const headChildren = [
        React.createElement('button', {
          key: 'toggle',
          type: 'button',
          className: 'psd-panel-toggle',
          'aria-expanded': expanded,
          'aria-label': expanded ? t('panel.collapse') : t('panel.expand'),
          onClick: onToggle
        },
        React.createElement('span', { className: 'psd-indicator', 'aria-hidden': true },
          anyRunning
            ? React.createElement('span', { className: 'psd-pulse' })
            : React.createElement('span', { className: 'psd-spark' }, RemixGlyph(DW_SPARKLING_LINE, 14))),
        React.createElement('span', { className: 'psd-panel-title' }, t('panel.title')),
        React.createElement('span', { className: 'psd-count' }, t('count', { count: rows.length })))
      ]
      if (expanded && canExpand) {
        headChildren.push(React.createElement('button', {
          key: 'all',
          type: 'button',
          className: 'psd-panel-link',
          onClick: onToggleAll
        }, showAll ? t('panel.showLess') : t('panel.viewAll', { count: rows.length })))
      }
      // Every disclosure chevron lives at the row's far right.
      headChildren.push(React.createElement('button', {
        key: 'chevron',
        type: 'button',
        className: 'psd-panel-chevron',
        'aria-expanded': expanded,
        'aria-label': expanded ? t('panel.collapse') : t('panel.expand'),
        onClick: onToggle
      }, React.createElement('span', { className: 'psd-chevron' }, React.createElement(DwChevron, null))))
      const children = [React.createElement('div', { key: 'head', className: 'psd-panel-head' }, headChildren)]
      if (expanded) {
        const body = []
        if (rows.length === 0) {
          body.push(React.createElement('div', { key: 'empty', className: 'psd-panel-empty' },
            React.createElement('strong', null, t('panel.empty.title')),
            React.createElement('span', null, t('panel.empty.hint'))))
        } else {
          for (const row of visible) {
            const running = row.state === 'running'
            const duration = durations.get(row.id)
            const time = running
              ? (duration === undefined || duration.observed !== true
                  ? dwFormatRelative(now - row.updatedAt, t)
                  : dwFormatDuration(now - duration.at, t))
              : dwFormatRelative(now - row.updatedAt, t)
            const rowChildren = childrenByParent.get(row.id) ?? []
            const collapsed = collapsedParents.has(row.id)
            const hasChildren = rowChildren.length > 0
            const interrupted = rowInterrupted(row.id)
            body.push(React.createElement('div', {
              key: row.id,
              className: 'psd-item',
              'data-state': row.state
            },
            React.createElement('div', {
              className: isCurrent(row.id) ? 'psd-run psd-run-current' : 'psd-run',
              'data-state': row.state
            },
              React.createElement('button', {
                type: 'button',
                className: 'psd-run-main',
                'aria-current': isCurrent(row.id) ? 'true' : undefined,
                'aria-label': t('panel.open', { title: row.title }),
                onClick: () => onOpen(row.id),
                onMouseEnter: (event) => showHover(row, event.currentTarget),
                onMouseLeave: hideHover,
                onFocus: (event) => showHover(row, event.currentTarget),
                onBlur: hideHover
              },
              React.createElement('span', { className: 'psd-run-head' },
                running
                  ? React.createElement(StateDot, { state: 'ongoing', size: 14, className: 'psd-run-glyph' })
                  : !isRead(row.id, row.updatedAt)
                    ? React.createElement(StateDot, { state: 'done', size: 14, className: 'psd-run-glyph' })
                    : React.createElement('span', { className: 'psd-run-brand', 'aria-hidden': true },
                      RemixGlyph(DW_DEEPSEEK_FILL, 14, undefined, 0.82)),
                interrupted
                  ? React.createElement('span', {
                    className: 'psd-interrupted',
                    role: 'img',
                    'aria-label': interruptedT('badge.aria'),
                    title: interruptedTitle(row.id)
                  }, RemixGlyph(REMIX_WARNING_FILL, 13))
                  : null,
                React.createElement('span', { className: 'psd-run-title' }, row.title),
                React.createElement('span', { className: 'psd-run-time' }, time))),
              React.createElement(DwRowActionCluster, {
                t,
                interruptedT,
                row,
                interrupted,
                onNewSession
              }),
              hasChildren
                ? React.createElement('button', {
                  type: 'button',
                  className: 'psd-run-toggle',
                  'aria-expanded': !collapsed,
                  'aria-label': t(collapsed ? 'panel.expandChildren' : 'panel.collapseChildren', { title: row.title }),
                  onClick: () => onToggleChildren(row.id)
                }, React.createElement('span', { className: 'psd-chevron' }, React.createElement(DwChevron, null)))
                : React.createElement('span', { className: 'psd-run-toggle-spacer', 'aria-hidden': true })),
            hasChildren && !collapsed
              ? React.createElement('div', { className: 'psd-children' }, rowChildren.map((child) => {
                const childRow = {
                  ...row,
                  id: child.id,
                  title: child.title,
                  state: child.state,
                  updatedAt: child.updatedAt,
                  subagents: 0,
                  workspaceId: child.workspaceId ?? row.workspaceId ?? null,
                  cwd: child.cwd ?? row.cwd ?? null
                }
                const childInterrupted = rowInterrupted(child.id)
                const childCurrent = isCurrent(child.id)
                return React.createElement('div', {
                  key: child.id,
                  className: childCurrent ? 'psd-child psd-child-current' : 'psd-child',
                  'data-state': child.state
                },
                childCurrent
                  ? React.createElement('span', { key: 'ring', className: 'psd-child-ring', 'aria-hidden': true })
                  : null,
                React.createElement('button', {
                  type: 'button',
                  className: 'psd-child-main',
                  'aria-current': childCurrent ? 'true' : undefined,
                  'aria-label': t('panel.open', { title: child.title }),
                  onClick: () => onOpen(child.id),
                  onMouseEnter: (event) => showHover(childRow, event.currentTarget),
                  onMouseLeave: hideHover,
                  onFocus: (event) => showHover(childRow, event.currentTarget),
                  onBlur: hideHover
                },
                React.createElement('span', { className: 'psd-child-glyph' },
                  child.state === 'running'
                    ? React.createElement(StateDot, { state: 'ongoing', size: 10 })
                    : !isRead(child.id, child.updatedAt)
                      ? React.createElement(StateDot, { state: 'done', size: 10 })
                      : React.createElement('span', { className: 'psd-child-brand', 'aria-hidden': true },
                        RemixGlyph(DW_ROBOT_2_LINE, 12))),
                childInterrupted
                  ? React.createElement('span', {
                    className: 'psd-interrupted',
                    role: 'img',
                    'aria-label': interruptedT('badge.aria'),
                    title: interruptedTitle(child.id)
                  }, RemixGlyph(REMIX_WARNING_FILL, 13))
                  : null,
                React.createElement('span', { className: 'psd-child-title' }, child.title),
                React.createElement('span', { className: 'psd-child-time' }, dwFormatRelative(now - child.updatedAt, t))),
                React.createElement(DwRowActionCluster, {
                  t,
                  interruptedT,
                  row: childRow,
                  interrupted: childInterrupted,
                  onNewSession
                }))
              }))
              : null))
          }
        }
        children.push(React.createElement('div', { key: 'body', className: 'psd-panel-body' }, body))
      }
      if (hover !== null) {
        const row = hover.row
        const running = row.state === 'running'
        const duration = durations.get(row.id)
        const statusTime = running
          ? (duration === undefined || duration.observed !== true
              ? dwFormatRelative(now - row.updatedAt, t)
              : dwFormatDuration(now - duration.at, t))
          : dwFormatRelative(now - row.updatedAt, t)
        const cardTop = Math.round(Math.max(8, Math.min(hover.top - 8, window.innerHeight - 320)))
        const cardLeft = Math.round(Math.min(hover.anchorRight + 10, window.innerWidth - 300 - 8))
        children.push(React.createElement('div', {
          key: 'hover',
          className: 'psd-hovercard',
          role: 'tooltip',
          'aria-hidden': true,
          style: { top: cardTop, left: cardLeft }
        },
        React.createElement('div', { className: 'psd-hovercard-title' }, row.workspace),
        row.workspacePath.length === 0
          ? null
          : React.createElement('div', { className: 'psd-hovercard-path' }, row.workspacePath),
        React.createElement('div', { className: 'psd-hovercard-row' },
          React.createElement('span', { className: 'psd-hovercard-key' }, t('hover.status')),
          React.createElement('span', { className: 'psd-hovercard-value' },
            `${running ? t('hover.running') : t('hover.done')} · ${statusTime}`)),
        React.createElement('div', { className: 'psd-hovercard-row' },
          React.createElement('span', { className: 'psd-hovercard-key' }, t('hover.updated')),
          React.createElement('span', { className: 'psd-hovercard-value' }, dwFormatAbsoluteTime(row.updatedAt))),
        row.subagents > 0
          ? React.createElement('div', { className: 'psd-hovercard-row' },
            React.createElement('span', { className: 'psd-hovercard-key' },
              row.subagents === 1 ? t('hover.subagentsOne') : t('hover.subagents', { count: row.subagents })))
          : null))
      }
      return React.createElement('div', { className: 'psd-panel' }, children)
    }

    /**
     * The bucket header rendered into the native tree as a foreign child node.
     * @param {object} props - component props.
     * @returns {object} React element.
     */
    function DynamicGroupHeader(props) {
      const { t, group, count, collapsed, onToggle } = props
      return React.createElement('button', {
        type: 'button',
        className: 'psd-group-toggle',
        'aria-expanded': !collapsed,
        'aria-label': t(group === 'active' ? 'group.toggleActive' : 'group.toggleInactive'),
        onClick: onToggle
      },
      React.createElement('span', { className: 'psd-group-label' }, t(group === 'active' ? 'group.active' : 'group.inactive')),
      React.createElement('span', { className: 'psd-group-count' }, t('count', { count })),
      React.createElement('span', { className: 'psd-chevron' }, React.createElement(DwChevron, null)))
    }

    /**
     * Invisible seat that owns the dynamic-Workspace DOM augmentation.
     *
     * The native browser is never replaced: this seat portals a summary card
     * above its header and one bucket header into its list, then keeps the
     * native group sections ordered and folded through flex order. Every
     * native row behavior (menus, search, add, drag, dialogs) keeps working
     * because those nodes are untouched.
     * @param {object} props - standard slot props plus this feature's t/uiWorkspace.
     * @returns {object | null} portal group.
     */
    function DynamicWorkspaceSeat(props) {
      const { t, uiWorkspace, parentSessions, interruptedT } = props
      const sessions = props.useSessions((state) => state)
      const statuses = props.useSessionStatus((state) => state)
      const workspaceSnapshot = props.useWorkspaces((state) => state)
      const settings = React.useSyncExternalStore(subscribeSettings, settingsSnapshot, settingsSnapshot)
      const windows = dwWindows(settings.value)

      const [mounts, setMounts] = React.useState(null)
      const [groupCounts, setGroupCounts] = React.useState({ active: 0, inactive: 0 })
      const [folds, setFolds] = React.useState(dwReadFolds)
      const [panelExpanded, setPanelExpanded] = React.useState(true)
      const [showAll, setShowAll] = React.useState(false)
      const [collapsedParents, setCollapsedParents] = React.useState(() => new Set())
      const [ackedBaselines, setAckedBaselines] = React.useState(dwReadAckedBaselines)
      const [sessionActivity, setSessionActivity] = React.useState({})
      const [now, setNow] = React.useState(() => Date.now())

      const mountsRef = React.useRef(null)
      const latestRef = React.useRef(null)
      const aliveRef = React.useRef(true)
      const applyScheduledRef = React.useRef(false)
      const durationsRef = React.useRef(new Map())
      const firstRenderRef = React.useRef(true)

      // Read-state synchronization with the Host-shared document. The local
      // localStorage cache stays authoritative for rendering; the Host merges
      // maxima so every browser/profile sees the same acknowledgements.
      const ackedRef = React.useRef(ackedBaselines)
      ackedRef.current = ackedBaselines
      const ackedPushTimerRef = React.useRef(null)
      const ackedPendingPushRef = React.useRef(new Map())
      const ackedPushInFlightPromiseRef = React.useRef(null)
      const ackedPushInFlightRef = React.useRef(false)
      const ackedSyncInFlightRef = React.useRef(false)
      const ackedMigrationRef = React.useRef(false)
      const applyAckedHostEntries = React.useCallback((entries) => {
        const current = ackedRef.current
        const next = dwMergeAckedBaselines(current, entries)
        if (next !== current) {
          ackedRef.current = next
          setAckedBaselines(next)
        }
        return next
      }, [])
      // Pending pushes are sent in small sequential batches (200 entries / a
      // conservative 48 KiB budget) so a large local cache can never exceed the
      // Host's 64 KiB body cap and pin the queue in a permanent 413. Network and
      // 5xx failures stay queued for the next sync cycle; a permanent 4xx drops
      // only that batch so newer acks can still sync. At most one POST is in
      // flight, and only entries that still hold the pushed value are dropped.
      const flushAckedPush = React.useCallback(() => {
        if (ackedPushInFlightRef.current) {
          // Awaiting the actual in-flight promise means callers can rely on
          // "no push is in flight" once their await returns. No recursive call
          // is involved, so this cannot deadlock.
          return ackedPushInFlightPromiseRef.current ?? Promise.resolve()
        }
        if (ackedPushTimerRef.current !== null) {
          window.clearTimeout(ackedPushTimerRef.current)
          ackedPushTimerRef.current = null
        }
        if (ackedPendingPushRef.current.size === 0) return Promise.resolve()
        ackedPushInFlightRef.current = true
        const run = (async () => {
          try {
            let rounds = 0
            while (ackedPendingPushRef.current.size > 0 && rounds < 64) {
              rounds += 1
              const batch = dwAckPushBatches(ackedPendingPushRef.current)[0]
              if (batch === undefined) return
              const result = await dwPostReadAcks(batch)
              if (result.merged === null && result.retryable) return
              for (const [id, baseline] of Object.entries(batch)) {
                const pending = ackedPendingPushRef.current.get(id)
                if (pending !== undefined && pending <= baseline) ackedPendingPushRef.current.delete(id)
              }
              if (result.merged !== null) applyAckedHostEntries(result.merged)
              // A permanent 4xx already dropped this batch above; continue with
              // the next one rather than retrying it forever.
            }
          } catch (error) {
            // Bounded diagnostic, no retry loop here: pending entries stay
            // queued for the next poll/focus cycle.
            console.warn('[power-suite] read-acks push failed', error !== null && typeof error === 'object' && typeof error.message === 'string' ? error.message.slice(0, 200) : error)
          } finally {
            ackedPushInFlightRef.current = false
            ackedPushInFlightPromiseRef.current = null
          }
        })()
        ackedPushInFlightPromiseRef.current = run
        return run
      }, [applyAckedHostEntries])
      const scheduleAckedPush = React.useCallback((entries) => {
        const sanitized = dwSanitizeAckEntries(entries)
        let added = false
        for (const [id, baseline] of Object.entries(sanitized)) {
          const previous = ackedPendingPushRef.current.get(id)
          ackedPendingPushRef.current.set(id, previous === undefined ? baseline : Math.max(previous, baseline))
          added = true
        }
        if (!added) return
        ackedPendingPushRef.current = dwCapAckPending(ackedPendingPushRef.current)
        if (ackedPushTimerRef.current !== null) window.clearTimeout(ackedPushTimerRef.current)
        ackedPushTimerRef.current = window.setTimeout(() => {
          ackedPushTimerRef.current = null
          void flushAckedPush()
        }, DW_ACK_PUSH_DEBOUNCE_MS)
      }, [flushAckedPush])

      const newSessionInFlightRef = React.useRef(new Set())
      /**
       * Create a blank Session in the same directory as one card row and open it,
       * without opening the row's own Session. Falls back to the Workspace's New
       * Session flow when the cwd is unknown or creation fails; an in-flight set
       * guards double clicks.
       * @param {object} row - card row carrying id/workspaceId/cwd.
       * @returns {void}
       */
      const openNewSession = React.useCallback((row) => {
        if (row === null || typeof row !== 'object') return
        const key = typeof row.id === 'string' ? row.id : ''
        if (key.length > 0) {
          if (newSessionInFlightRef.current.has(key)) return
          newSessionInFlightRef.current.add(key)
        }
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          if (key.length > 0) newSessionInFlightRef.current.delete(key)
        }
        const workspaceId = typeof row.workspaceId === 'string' && row.workspaceId.length > 0 ? row.workspaceId : null
        const fallback = () => {
          try {
            if (workspaceId !== null && uiWorkspace !== null && uiWorkspace !== undefined && typeof uiWorkspace.startSession === 'function') {
              uiWorkspace.startSession(workspaceId)
            }
          } catch {
            // The row disappears with the next snapshot; a failed fallback is not fatal.
          }
          finish()
        }
        const cwd = typeof row.cwd === 'string' && row.cwd.length > 0 ? row.cwd : null
        if (parentSessions === null || parentSessions === undefined || typeof parentSessions.create !== 'function'
          || (workspaceId === null && cwd === null)) {
          fallback()
          return
        }
        const request = {}
        if (workspaceId !== null) request.workspaceId = workspaceId
        if (cwd !== null) request.cwd = cwd
        Promise.resolve(parentSessions.create(request)).then((newSessionId) => {
          if (typeof newSessionId !== 'string' || newSessionId.length === 0) {
            fallback()
            return
          }
          try {
            if (uiWorkspace !== null && uiWorkspace !== undefined && typeof uiWorkspace.openSession === 'function') {
              uiWorkspace.openSession(newSessionId)
            } else {
              fallback()
            }
          } catch {
            fallback()
          }
          finish()
        }, () => {
          fallback()
        })
      }, [parentSessions, uiWorkspace])

      const runningParents = dwRunningSubagentParents(sessions, statuses)
      const workspaces = workspaceSnapshot?.items ?? []
      const archivedIds = new Set(workspaceSnapshot?.archivedSessionIds ?? [])
      // The rainbow ring marks the Session the main conversation currently shows.
      // The client summary's `retainedBy.mainView` counter is the same source the
      // read-baseline effect trusts, so the highlight follows every way of
      // opening a Session (card, sidebar, elsewhere).
      let currentSessionId = null
      if (sessions !== null && typeof sessions === 'object' && Array.isArray(sessions.ids)) {
        for (const id of sessions.ids) {
          if ((sessions.byId?.[id]?.retainedBy?.mainView ?? 0) > 0) {
            currentSessionId = id
            break
          }
        }
      }
      const runningRows = dwRunningRows(sessions, statuses, workspaces, t, runningParents, archivedIds, sessionActivity)
      const recentRows = dwRecentRows(sessions, statuses, workspaces, t, now, runningParents, archivedIds, windows.recentMs, sessionActivity)
      const panelRows = runningRows.concat(recentRows)
      const childrenByParent = dwSubagentChildren(sessions, statuses, now, archivedIds, windows.recentMs, workspaces, sessionActivity)
      const runningIds = new Set(runningRows.map((row) => row.id))
      const durations = new Map()
      for (const id of runningIds) {
        let entry = durationsRef.current.get(id)
        if (entry === undefined) {
          entry = { at: Date.now(), observed: firstRenderRef.current !== true }
          durationsRef.current.set(id, entry)
        }
        durations.set(id, entry)
      }
      for (const id of [...durationsRef.current.keys()]) {
        if (!runningIds.has(id)) durationsRef.current.delete(id)
      }

      latestRef.current = { sessions, statuses, workspaces: workspaceSnapshot, folds, windows, activity: sessionActivity }

      // Read state is derived at render time from the acknowledged baseline:
      // opening a Session raises its baseline to the observed `updatedAt`, and a
      // genuinely newer activity naturally exceeds that baseline again. There is
      // no running-based clearing branch, so a transient status flag can never
      // flip a read row back to unread.
      React.useEffect(() => {
        if (sessions === null || typeof sessions !== 'object' || !Array.isArray(sessions.ids) || sessions.ids.length === 0) return
        const raised = {}
        let changed = false
        const next = new Map(ackedBaselines)
        for (const id of sessions.ids) {
          const summary = sessions.byId?.[id]
          if (summary === undefined) continue
          if ((summary.retainedBy?.mainView ?? 0) <= 0) continue
          const updatedAt = dwEffectiveUpdatedAt(sessionActivity, id, summary)
          const baseline = ackedBaselines.get(id)
          if (baseline !== undefined && baseline >= updatedAt) continue
          next.set(id, updatedAt)
          raised[id] = updatedAt
          changed = true
        }
        if (!changed) return
        const capped = dwCapAckedBaselines(next)
        setAckedBaselines(capped)
        scheduleAckedPush(raised)
      }, [sessions, sessionActivity, ackedBaselines, scheduleAckedPush])

      React.useEffect(() => {
        dwWriteAckedBaselines(ackedBaselines)
      }, [ackedBaselines])

      // Keep the card's Host-backed state in sync on mount, on window focus, on
      // visibility, and every 30 s: merge the shared read-acks document, retry
      // any queued migration/increased-baseline pushes (a failed or timed-out
      // POST stays queued for the next cycle), and refresh the true
      // last-activity map driving card retention/time. Missing routes (older
      // Host) degrade silently to the local summaries.
      React.useEffect(() => {
        let disposed = false
        const sync = async () => {
          if (disposed || ackedSyncInFlightRef.current) return
          ackedSyncInFlightRef.current = true
          try {
            const hostEntries = await dwFetchReadAcks()
            if (!disposed && hostEntries !== null) {
              const merged = applyAckedHostEntries(hostEntries)
              if (!ackedMigrationRef.current) {
                ackedMigrationRef.current = true
                scheduleAckedPush(dwAckedRecords(merged))
              }
            }
            if (!disposed && ackedPendingPushRef.current.size > 0) await flushAckedPush()
            if (!disposed) {
              const activity = await dwFetchSessionActivity()
              if (!disposed && activity !== null) {
                // Monotonic per-id merge (plus prune against a non-empty
                // catalog) so a partial/cold/HMR-overlap response can never
                // regress a known Session's activity.
                setSessionActivity((previous) => {
                  const ids = latestRef.current?.sessions?.ids
                  return dwMergeActivityMaps(previous, activity, Array.isArray(ids) ? ids : null)
                })
              }
            }
          } catch (error) {
            // The card sync must never surface an unhandled rejection; the next
            // poll/focus retries with the same pending state.
            console.warn('[power-suite] activity/ack sync failed', error !== null && typeof error === 'object' && typeof error.message === 'string' ? error.message.slice(0, 200) : error)
          } finally {
            ackedSyncInFlightRef.current = false
          }
        }
        void sync()
        const timer = window.setInterval(sync, DW_ACK_SYNC_POLL_MS)
        const onFocus = () => { void sync() }
        const onVisibility = () => {
          if (document.visibilityState === 'visible') void sync()
        }
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          disposed = true
          window.clearInterval(timer)
          window.removeEventListener('focus', onFocus)
          document.removeEventListener('visibilitychange', onVisibility)
          if (ackedPushTimerRef.current !== null) {
            window.clearTimeout(ackedPushTimerRef.current)
            ackedPushTimerRef.current = null
          }
        }
      }, [applyAckedHostEntries, flushAckedPush, scheduleAckedPush])

      React.useEffect(() => {
        aliveRef.current = true
        firstRenderRef.current = false
        return () => { aliveRef.current = false }
      }, [])

      const applyGrouping = React.useCallback(() => {
        const refs = mountsRef.current
        const latest = latestRef.current
        if (refs === null || latest === null) return
        if (!(refs.list instanceof HTMLElement) || refs.activeHeader.isConnected !== true) return
        const workspaces = latest.workspaces?.items ?? []
        const activity = dwActiveSessions(
          latest.sessions,
          latest.statuses,
          workspaces,
          Date.now(),
          new Set(latest.workspaces?.archivedSessionIds ?? []),
          latest.windows.activeMs,
          latest.activity ?? {}
        )
        const activeIds = new Set()
        const recencyByWorkspace = new Map()
        let ungroupedActive = false
        for (const row of activity.rows) {
          const workspaceId = activity.workspaceOf.get(row.id)
          if (workspaceId === undefined) {
            ungroupedActive = true
            continue
          }
          activeIds.add(workspaceId)
          recencyByWorkspace.set(workspaceId, Math.max(recencyByWorkspace.get(workspaceId) ?? 0, row.updatedAt))
        }
        const sections = []
        let domIndex = 0
        for (const child of Array.from(refs.list.children)) {
          if (child === refs.activeHeader || child === refs.inactiveHeader) continue
          if (!(child instanceof HTMLElement)) continue
          const row = child.querySelector('[data-row-key^="workspace:"]')
          if (row === null) { domIndex += 1; continue }
          const key = row.getAttribute('data-row-key') ?? ''
          const workspaceId = key.slice('workspace:'.length)
          const active = workspaceId.length === 0 ? ungroupedActive : activeIds.has(workspaceId)
          sections.push({ element: child, active, domIndex, recency: recencyByWorkspace.get(workspaceId) ?? 0 })
          domIndex += 1
        }
        const activeSections = sections.filter((section) => section.active)
        const inactiveSections = sections.filter((section) => !section.active)
        activeSections.sort((left, right) => (right.recency - left.recency) || (left.domIndex - right.domIndex))
        const ordered = [...activeSections, ...inactiveSections]
        ordered.forEach((section, index) => {
          section.element.style.order = String((section.active ? 100 : 5001) + index)
        })
        for (const section of sections) {
          const collapsed = section.active ? latest.folds.active : latest.folds.inactive
          section.element.style.display = collapsed ? 'none' : ''
        }
        refs.activeHeader.style.order = '0'
        refs.inactiveHeader.style.order = '5000'
        const empty = sections.length === 0
        refs.activeHeader.style.display = empty ? 'none' : ''
        refs.inactiveHeader.style.display = empty ? 'none' : ''
        const counts = { active: activeSections.length, inactive: inactiveSections.length }
        if (aliveRef.current) {
          setGroupCounts((previous) => (
            previous.active === counts.active && previous.inactive === counts.inactive ? previous : counts
          ))
        }
      }, [setGroupCounts])

      const scheduleApply = React.useCallback(() => {
        if (applyScheduledRef.current) return
        applyScheduledRef.current = true
        window.requestAnimationFrame(() => {
          applyScheduledRef.current = false
          if (!aliveRef.current) return
          applyGrouping()
        })
      }, [applyGrouping])

      // Mount geometry: find the native browser, insert the foreign nodes, and
      // keep them present across native re-renders and sidebar fold changes.
      React.useEffect(() => {
        let disposed = false
        let observer = null
        let observedTarget = null
        let retry = null
        aliveRef.current = true

        const ensureObserver = () => {
          const sidebar = document.querySelector('[data-slot="sidebar"]')
          if (!(sidebar instanceof HTMLElement)) return
          if (observer !== null && observedTarget === sidebar) return
          if (observer !== null) observer.disconnect()
          observedTarget = sidebar
          observer = new MutationObserver(() => {
            if (disposed) return
            reconcile()
            scheduleApply()
          })
          observer.observe(sidebar, { childList: true, subtree: true })
        }

        const reconcile = () => {
          if (disposed) return
          const refs = dwFindMounts()
          if (refs === null) {
            if (mountsRef.current !== null) {
              mountsRef.current = null
              setMounts(null)
            }
            ensureObserver()
            return
          }
          const previous = mountsRef.current
          mountsRef.current = refs
          ensureObserver()
          if (previous === null
            || previous.panel !== refs.panel
            || previous.list !== refs.list
            || previous.activeHeader !== refs.activeHeader
            || previous.inactiveHeader !== refs.inactiveHeader) {
            setMounts({
              panel: refs.panel,
              list: refs.list,
              activeHeader: refs.activeHeader,
              inactiveHeader: refs.inactiveHeader
            })
          }
          scheduleApply()
        }

        reconcile()
        retry = window.setInterval(() => {
          if (disposed) return
          const current = mountsRef.current
          if (current === null || current.panel.isConnected !== true) reconcile()
        }, 500)
        return () => {
          disposed = true
          aliveRef.current = false
          window.clearInterval(retry)
          if (observer !== null) observer.disconnect()
          const refs = mountsRef.current
          mountsRef.current = null
          if (refs !== null) {
            if (refs.panel instanceof HTMLElement) refs.panel.remove()
            if (refs.activeHeader instanceof HTMLElement) refs.activeHeader.remove()
            if (refs.inactiveHeader instanceof HTMLElement) refs.inactiveHeader.remove()
            if (refs.list instanceof HTMLElement) {
              refs.list.style.display = ''
              refs.list.style.flexDirection = ''
              for (const child of Array.from(refs.list.children)) {
                if (!(child instanceof HTMLElement)) continue
                child.style.order = ''
                child.style.display = ''
              }
            }
          }
          setMounts(null)
        }
      }, [scheduleApply])

      React.useEffect(() => {
        scheduleApply()
      }, [sessions, statuses, workspaceSnapshot, folds, windows.activeMs, windows.recentMs, scheduleApply])

      React.useEffect(() => {
        if (!panelExpanded || runningRows.length === 0) return undefined
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
      }, [panelExpanded, runningRows.length])

      // Retention-window tick: a Workspace leaves Active and a finished row
      // leaves the card when its window expires, even with no new data events.
      React.useEffect(() => {
        const timer = window.setInterval(() => {
          setNow(Date.now())
          scheduleApply()
        }, 30000)
        return () => window.clearInterval(timer)
      }, [scheduleApply])

      if (mounts === null) return null
      const portal = []
      portal.push(ReactDOM.createPortal(React.createElement(DynamicRunningPanel, {
        t,
        rows: panelRows,
        expanded: panelExpanded,
        showAll,
        now,
        durations,
        childrenByParent,
        collapsedParents,
        acked: ackedBaselines,
        currentSessionId,
        interruptedT,
        onNewSession: openNewSession,
        onToggle: () => setPanelExpanded((value) => !value),
        onToggleAll: () => setShowAll((value) => !value),
        onToggleChildren: (id) => setCollapsedParents((value) => {
          const next = new Set(value)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }),
        onOpen: (id) => {
          try {
            if (uiWorkspace !== null && uiWorkspace !== undefined && typeof uiWorkspace.openSession === 'function') {
              uiWorkspace.openSession(id)
            }
          } catch {
            // A stale row is dropped by the next snapshot; a rejected open is not fatal.
          }
        }
      }), mounts.panel, 'running-panel'))
      if (mounts.activeHeader.isConnected) {
        portal.push(ReactDOM.createPortal(React.createElement(DynamicGroupHeader, {
          t,
          group: 'active',
          count: groupCounts.active,
          collapsed: folds.active,
          onToggle: () => setFolds((value) => {
            const next = { ...value, active: !value.active }
            dwWriteFolds(next)
            return next
          })
        }), mounts.activeHeader, 'active-header'))
      }
      if (mounts.inactiveHeader.isConnected) {
        portal.push(ReactDOM.createPortal(React.createElement(DynamicGroupHeader, {
          t,
          group: 'inactive',
          count: groupCounts.inactive,
          collapsed: folds.inactive,
          onToggle: () => setFolds((value) => {
            const next = { ...value, inactive: !value.inactive }
            dwWriteFolds(next)
            return next
          })
        }), mounts.inactiveHeader, 'inactive-header'))
      }
      return React.createElement(React.Fragment, null, portal)
    }

    /**
     * Register the dynamic-Workspace seat, its dictionaries, and its styles.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installDynamicWorkspaces(ctx) {
      const t = ctx.locale.bind(DW_NS)
      ctx.effect(() => ctx.locale.register(DW_NS, { en: DW_EN, zh: DW_ZH }), 'power-suite: dynamic-workspaces dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute(DW_ATTR, 'style')
        style.textContent = DW_CSS
        document.head.appendChild(style)
        return () => { style.remove() }
      }, 'power-suite: dynamic-workspaces styles')
      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: DW_SEAT
      }, (props) => React.createElement(DynamicWorkspaceSeat, {
        ...props,
        t,
        uiWorkspace: ctx.uiWorkspace,
        parentSessions: ctx.sessions,
        interruptedT: ctx.locale.bind(INTERRUPTED_NS)
      }))), 'power-suite: dynamic-workspaces seat')
    }
    //#endregion

    //#region feature: prompt history — preview
    /** Copy namespace of the composer-docked prompt-history preview. */
    const PROMPT_HISTORY_PREVIEW_NS = 'powerSuitePromptHistoryPreview'

    /** Registration identity of the composer-docked prompt-history preview. */
    const PROMPT_HISTORY_PREVIEW_ID = 'power-suite.prompt-history-preview'

    // Remix Icon path data (Apache-2.0, https://remixicon.com), inlined here so
    // this feature needs no icon package at runtime.
    const REMIX_SEARCH_LINE = 'M18.031 16.6168L22.3137 20.8995L20.8995 22.3137L16.6168 18.031C15.0769 19.263 13.124 20 11 20C6.032 20 2 15.968 2 11C2 6.032 6.032 2 11 2C15.968 2 20 6.032 20 11C20 13.124 19.263 15.0769 18.031 16.6168ZM16.0247 15.8748C17.2475 14.6146 18 12.8956 18 11C18 7.1325 14.8675 4 11 4C7.1325 4 4 7.1325 4 11C4 14.8675 7.1325 18 11 18C12.8956 18 14.6146 17.2475 15.8748 16.0247L16.0247 15.8748Z'

    /**
     * React DOM bridge for the rail portal.
     *
     * The composer dock lives inside the shell's fixed composer layer, so the
     * rail must leave the dock and portal to the document body. The bridge
     * itself is required once at the top of this module.
     */

    /** Copy for the prompt-history rail. */
    const PROMPT_HISTORY_PREVIEW_EN = {
      'search.open': 'Search',
      'search.placeholder': 'Search prompts',
      'search.aria': 'Search prompt history',
      'list.aria': 'Prompt history',
      'mark.aria': 'Copy prompt #{index}: {text}',
      'empty.filtered': 'No matching prompts',
      'count.filtered': 'Showing {count} of {total}'
    }
    const PROMPT_HISTORY_PREVIEW_ZH = {
      'search.open': '搜索',
      'search.placeholder': '搜索历史提示',
      'search.aria': '搜索历史提示',
      'list.aria': '历史提示',
      'mark.aria': '复制第 {index} 条提示：{text}',
      'empty.filtered': '没有匹配的历史提示',
      'count.filtered': '显示 {count} / {total}'
    }

    const PROMPT_HISTORY_PREVIEW_CSS = `
.psp-rail{position:fixed;z-index:60;display:flex;flex-direction:column;align-items:center;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:16px;pointer-events:auto}
.psp-rail-divider{flex:none;align-self:flex-end;width:32px;height:1px;margin:2px 0 6px;border-radius:1px;background:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2))}
.psp-marks{flex:1 1 auto;width:100%;min-height:0;display:flex;flex-direction:column;align-items:stretch;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}
.psp-marks::-webkit-scrollbar{display:none;width:0;height:0}
.psp-marks[data-fade-top=true]{mask-image:linear-gradient(#0000 0,#000 24px 100%)}
.psp-marks[data-fade-bottom=true]{mask-image:linear-gradient(#000 0 calc(100% - 24px),#0000 100%)}
.psp-marks[data-fade-top=true][data-fade-bottom=true]{mask-image:linear-gradient(#0000 0,#000 24px calc(100% - 24px),#0000 100%)}
.psp-mark{position:relative;box-sizing:border-box;flex:none;width:100%;height:10px;margin:0;padding:0;border:0;border-radius:8px;background:0 0;cursor:pointer}
.psp-mark::before{content:"";position:absolute;top:50%;right:0;width:20px;height:2px;border-radius:2px;background:var(--dsw-alias-border-l4);transform-origin:100%;transform:translateY(-50%) scaleX(.6);transition:transform .14s,background-color .14s}
.psp-mark:hover::before{background:var(--dsw-alias-label-tertiary);transform:translateY(-50%) scaleX(.9)}
/* Keyboard focus keeps the native hairline: brand tick + a 20px ring on the
   right edge instead of the default outline. */
.psp-mark:focus-visible{outline:none}
.psp-mark:focus-visible::before{background:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));transform:translateY(-50%) scaleX(1)}
.psp-mark:focus-visible::after{content:"";position:absolute;inset:0 0 0 auto;width:20px;border-radius:inherit;outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}
.psp-search-toggle{box-sizing:border-box;flex:none;align-self:flex-end;display:inline-flex;align-items:center;justify-content:center;width:20px;height:22px;margin-top:3px;margin-right:-4px;padding:0;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.psp-search-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.psp-search-toggle[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.psp-search-toggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.psp-rail-card{position:fixed;z-index:61;box-sizing:border-box;overflow:hidden;padding:10px 12px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,none);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px}
.psp-rail-card-text{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:6;overflow:hidden;white-space:pre-wrap;word-break:break-word;font:var(--dsw-font-xs-strong-13,inherit);font-family:inherit;font-size:13px;font-weight:500;line-height:20px}
.psp-rail-card-time{margin-top:4px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));font:var(--dsw-font-xxs-12,inherit);font-family:inherit;font-size:12px;line-height:18px}
.psp-search-card{position:fixed;z-index:61;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;overflow:hidden;width:min(300px,calc(100vw - 40px));padding:10px 12px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,none);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:16px}
.psp-search-row{display:flex;align-items:center;gap:6px}
.psp-search-icon{flex:none;color:var(--dsw-alias-label-tertiary)}
.psp-search-input{flex:1;min-width:0;height:22px;margin:0;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;outline:none}
.psp-search-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.psp-search-count{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));font-family:inherit;font-size:11px;line-height:15px}
.psp-search-empty{color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:11px;line-height:15px}
.psp-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:no-preference){.psp-rail-card{animation:psp-rail-card-in .12s ease-out}}
@media (prefers-reduced-motion:reduce){.psp-mark::before{transition:none}}
@keyframes psp-rail-card-in{from{opacity:0;transform:translateX(4px)}to{opacity:1;transform:none}}
`

    /**
     * Focus the Lexical editor of the Conversation that owns `sessionId`.
     * @param {string} sessionId - Session identity.
     * @returns {void}
     */
    function focusPromptHistoryComposer(sessionId) {
      const occurrence = promptHistoryOccurrence(sessionId)
      const scope = occurrence ?? document
      const composer = scope.querySelector('[data-conversation-region="composer"]')
      const editor = (composer ?? scope).querySelector('[data-lexical-editor="true"]')
      if (editor instanceof HTMLElement) editor.focus()
    }

    /**
     * Display labels for one prompt timestamp.
     * @param {number} at - epoch milliseconds.
     * @returns {{ label: string, title: string }} compact time and full hover title.
     */
    function promptHistoryTimeLabels(at) {
      const date = new Date(at)
      const now = new Date()
      const pad = (value) => String(value).padStart(2, '0')
      const monthDay = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      const fullDay = `${date.getFullYear()}-${monthDay}`
      let label = `${pad(date.getHours())}:${pad(date.getMinutes())}`
      if (date.toDateString() !== now.toDateString()) label = date.getFullYear() === now.getFullYear() ? monthDay : fullDay
      return { label, title: date.toLocaleString() }
    }

    /**
     * Find the Conversation occurrence that owns `sessionId`.
     * @param {string} sessionId - Session identity.
     * @returns {Element | null} the occurrence body, when rendered.
     */
    function promptHistoryOccurrence(sessionId) {
      const occurrences = document.querySelectorAll('[data-conversation-session]')
      let fallback = null
      for (const node of occurrences) {
        if (fallback === null) fallback = node
        if (node.getAttribute('data-conversation-session') === sessionId) return node
      }
      return fallback
    }

    /**
     * The Conversation's scroll surface.
     * @param {string} sessionId - Session identity.
     * @returns {Element | null} the scroll surface.
     */
    function promptHistoryScrollSurface(sessionId) {
      const occurrence = promptHistoryOccurrence(sessionId)
      const scope = occurrence ?? document
      return scope.querySelector('[data-conversation-scroll]') ?? document.querySelector('[data-conversation-scroll]')
    }

    /**
     * The Conversation's composer seat (the live top edge of the composer).
     * @param {string} sessionId - Session identity.
     * @returns {Element | null} the composer seat.
     */
    function promptHistoryComposerSeat(sessionId) {
      const occurrence = promptHistoryOccurrence(sessionId)
      const scope = occurrence ?? document
      return scope.querySelector('[data-conversation-region="composer"]') ?? document.querySelector('[data-conversation-region="composer"]')
    }

    /**
     * Bounding box of the native Turn navigation marks, found by geometry.
     *
     * The native rail exposes no stable class name; its marks are the tiny,
     * fixed-width buttons stacked near the scroll surface's right edge.
     * @param {Element} scroll - Conversation scroll surface.
     * @returns {{ right: number, bottom: number } | null} the rail box.
     */
    function promptHistoryTurnRailBox(scroll) {
      const scrollRect = scroll.getBoundingClientRect()
      const buttons = scroll.querySelectorAll('button')
      let right = 0
      let bottom = 0
      let count = 0
      for (const button of buttons) {
        const rect = button.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue
        if (rect.width > 44 || rect.height > 24) continue
        if (rect.right < scrollRect.right - 64 || rect.right > scrollRect.right + 8) continue
        if (rect.top < scrollRect.top - 8 || rect.bottom > scrollRect.bottom + 8) continue
        count += 1
        right = Math.max(right, rect.right)
        bottom = Math.max(bottom, rect.bottom)
      }
      return count === 0 ? null : { right, bottom }
    }

    /**
     * Measure the fixed rail's frame against the Conversation's right edge.
     *
     * The rail sits in the native turn rail's column: directly below it when
     * there is room (a short divider between them), otherwise at the vertical
     * middle of the usable scrollport. Its bottom stops above the composer.
     * @param {string} sessionId - Session identity.
     * @returns {object | null} viewport geometry, or null before the Conversation mounts.
     */
    function measurePromptHistoryRail(sessionId) {
      const scroll = promptHistoryScrollSurface(sessionId)
      if (scroll === null) return null
      const scrollRect = scroll.getBoundingClientRect()
      if (scrollRect.width <= 0 || scrollRect.height <= 0) return null
      const composer = promptHistoryComposerSeat(sessionId)
      const composerTop = composer === null ? Math.min(scrollRect.bottom, window.innerHeight) : composer.getBoundingClientRect().top
      const bottomLimit = Math.min(composerTop, window.innerHeight) - 16
      const turnRail = promptHistoryTurnRailBox(scroll)
      let top = null
      if (turnRail !== null && bottomLimit - (turnRail.bottom + 10) >= 90) top = turnRail.bottom + 10
      if (top === null) {
        // No room below the native rail (or no native rail): fall back to the
        // vertical middle of the scrollport and keep the rail usable.
        top = Math.max(scrollRect.top + 16, Math.round(scrollRect.top + (bottomLimit - scrollRect.top) / 2))
      }
      if (bottomLimit - top < 90) top = Math.max(scrollRect.top + 8, bottomLimit - 90)
      return {
        top: Math.round(top),
        right: Math.round(window.innerWidth - (turnRail === null ? scrollRect.right - 12 : turnRail.right)),
        width: 28,
        maxHeight: Math.round(Math.max(90, bottomLimit - top)),
        composerTop: Math.round(composerTop)
      }
    }

    /**
     * Whether two rail measurements describe the same frame.
     * @param {object | null} left - previous geometry.
     * @param {object | null} right - next geometry.
     * @returns {boolean} whether a re-render can be skipped.
     */
    function samePromptHistoryLayout(left, right) {
      if (left === null || right === null) return left === right
      return left.top === right.top &&
        left.right === right.right &&
        left.width === right.width &&
        left.maxHeight === right.maxHeight &&
        left.composerTop === right.composerTop
    }

    /**
     * Compress and bound one prompt for a mark's accessible name.
     * @param {string} text - prompt text.
     * @returns {string} single-line text safe for an aria name.
     */
    function accessiblePromptText(text) {
      const compact = text.replace(/\s+/g, ' ').trim()
      return compact.length > 140 ? `${compact.slice(0, 140)}…` : compact
    }

    /**
     * Prompt-history rail (requirement 3, corrected right-edge design).
     *
     * The composer dock registration is only a session-scoped data seat: this
     * component renders nothing in the composer flow and portals a fixed rail
     * to the document body. The rail sits in the Conversation's right-edge
     * column directly below the native Turn navigation, separated from it by a
     * short divider. It lists this Session's sent prompts as fixed-pitch tick
     * marks (newest at top), previews a mark's full text to its left on hover
     * or focus, copies it into the composer draft on click or Enter, and
     * reveals a floating search card from the rail's search button. Renders
     * nothing until the Session has at least one sent prompt.
     * @param {object} props - dock seat props plus the injected locale seat.
     * @returns {object | null} a document-body portal, or nothing.
     */
    function PromptHistoryPreview(props) {
      const { sessionId, useInput, inputActions } = props
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const phase = useInput((state) => state.phase)
      const [snapshot, setSnapshot] = React.useState({ sessionId: null, status: 'idle', prompts: [] })
      const [query, setQuery] = React.useState('')
      const [searchOpen, setSearchOpen] = React.useState(false)
      const [reloadKey, setReloadKey] = React.useState(0)
      const [preview, setPreview] = React.useState(null)
      const [layout, setLayout] = React.useState(null)
      const [fades, setFades] = React.useState({ top: false, bottom: false })
      const [searchAnchor, setSearchAnchor] = React.useState(null)
      const searchRef = React.useRef(null)
      const searchCardRef = React.useRef(null)
      const toggleRef = React.useRef(null)
      const marksRef = React.useRef(null)
      const previewTimer = React.useRef(null)

      const prompts = snapshot.sessionId === sessionId && snapshot.status === 'ready' ? snapshot.prompts : []

      // One request per Session and per finished turn. The per-effect guard
      // drops a response that resolves after a switch or a newer reload.
      React.useEffect(() => {
        let active = true
        const target = sessionId
        setSnapshot((current) => current.sessionId === target && current.status === 'ready'
          ? current
          : { sessionId: target, status: 'loading', prompts: [] })
        readPromptHistoryEntries(target).then((next) => {
          if (!active) return
          setSnapshot({ sessionId: target, status: 'ready', prompts: next })
        })
        return () => { active = false }
      }, [sessionId, reloadKey])

      // Switching Sessions starts the reading surface over.
      React.useEffect(() => {
        setQuery('')
        setSearchOpen(false)
        setPreview(null)
      }, [sessionId])

      // A finished turn can have appended a prompt; refetch once input is plain again.
      const previousPhase = React.useRef(phase)
      React.useEffect(() => {
        const before = previousPhase.current
        previousPhase.current = phase
        if (before !== 'plain' && phase === 'plain') setReloadKey((value) => value + 1)
      }, [phase])

      React.useEffect(() => () => {
        if (previewTimer.current !== null) window.clearTimeout(previewTimer.current)
      }, [])

      // Keep the fixed rail glued to the Conversation's right-edge rail column.
      // One rAF-coalesced measurement serves resizes, composer height changes,
      // sidebar width changes, scrolling, and the native rail appearing/loading.
      React.useEffect(() => {
        let frame = 0
        let disposed = false
        let followUp = 0
        let lateSettle = 0
        const measure = () => {
          const next = measurePromptHistoryRail(sessionId)
          setLayout((current) => (samePromptHistoryLayout(current, next) ? current : next))
        }
        const schedule = () => {
          if (disposed || frame !== 0) return
          frame = window.requestAnimationFrame(() => {
            frame = 0
            if (disposed) return
            measure()
            // Layout often settles a frame or two after a resize or a sidebar
            // transition; re-measure once more so a transiently undetectable
            // native rail can never leave the prompt rail in fallback position.
            if (followUp !== 0) window.clearTimeout(followUp)
            followUp = window.setTimeout(() => {
              followUp = 0
              if (!disposed) measure()
            }, 240)
            // Sidebar width transitions can outlast one follow-up frame.
            if (lateSettle !== 0) window.clearTimeout(lateSettle)
            lateSettle = window.setTimeout(() => {
              lateSettle = 0
              if (!disposed) measure()
            }, 700)
          })
        }
        schedule()
        const scroll = promptHistoryScrollSurface(sessionId)
        const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
        if (resizeObserver !== null) {
          if (scroll !== null) resizeObserver.observe(scroll)
          const composer = promptHistoryComposerSeat(sessionId)
          if (composer !== null) resizeObserver.observe(composer)
        }
        const mutationObserver = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null
        if (mutationObserver !== null) mutationObserver.observe(scroll ?? document.body, { childList: true, subtree: true })
        window.addEventListener('resize', schedule)
        if (scroll !== null) scroll.addEventListener('scroll', schedule, { passive: true })
        document.addEventListener('scroll', schedule, true)
        const settle = window.setTimeout(schedule, 300)
        return () => {
          disposed = true
          window.clearTimeout(settle)
          if (frame !== 0) window.cancelAnimationFrame(frame)
          if (followUp !== 0) window.clearTimeout(followUp)
          if (lateSettle !== 0) window.clearTimeout(lateSettle)
          if (resizeObserver !== null) resizeObserver.disconnect()
          if (mutationObserver !== null) mutationObserver.disconnect()
          window.removeEventListener('resize', schedule)
          if (scroll !== null) scroll.removeEventListener('scroll', schedule)
          document.removeEventListener('scroll', schedule, true)
        }
      }, [sessionId, prompts.length])

      // The preview card uses viewport coordinates; scrolling or resizing
      // invalidates its anchor, so close it instead of leaving it stale.
      React.useEffect(() => {
        if (preview === null) return undefined
        const dismiss = () => setPreview(null)
        document.addEventListener('scroll', dismiss, true)
        window.addEventListener('resize', dismiss)
        return () => {
          document.removeEventListener('scroll', dismiss, true)
          window.removeEventListener('resize', dismiss)
        }
      }, [preview])

      // Revealing the search card moves the caret there without touching the composer.
      React.useEffect(() => {
        if (!searchOpen || searchAnchor === null) return
        const input = searchRef.current
        if (input instanceof HTMLElement) input.focus()
      }, [searchOpen, searchAnchor])

      // A blank pointer press outside the search card and its toggle dismisses
      // the search and clears the filter; rail marks stay clickable.
      React.useEffect(() => {
        if (!searchOpen) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (!(target instanceof Node)) return
          const card = searchCardRef.current
          if (card !== null && card.contains(target)) return
          const toggle = toggleRef.current
          if (toggle !== null && toggle.contains(target)) return
          if (target instanceof Element && target.closest('[data-psp-mark]') !== null) return
          setQuery('')
          setSearchOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => document.removeEventListener('pointerdown', onPointerDown, true)
      }, [searchOpen])

      // The tick ladder mirrors the native turn rail: scrollable ends get fade
      // masks, and the search button below never moves.
      React.useEffect(() => {
        const marks = marksRef.current
        if (marks === null) return undefined
        let frame = 0
        const update = () => {
          frame = 0
          const top = marks.scrollTop > 1
          const bottom = marks.scrollTop < marks.scrollHeight - marks.clientHeight - 1
          setFades((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }))
        }
        const schedule = () => {
          if (frame !== 0) return
          frame = window.requestAnimationFrame(update)
        }
        schedule()
        marks.addEventListener('scroll', schedule, { passive: true })
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
        if (observer !== null) observer.observe(marks)
        return () => {
          if (frame !== 0) window.cancelAnimationFrame(frame)
          marks.removeEventListener('scroll', schedule)
          if (observer !== null) observer.disconnect()
        }
      }, [layout, prompts.length, query])

      // The search card never moves the rail: it hangs below the fixed toggle
      // when there is room, otherwise it flips to the toggle's left and is
      // clamped above the composer. Re-anchored on resize/filter changes.
      React.useEffect(() => {
        if (!searchOpen) {
          setSearchAnchor(null)
          return undefined
        }
        let frame = 0
        const place = () => {
          if (frame !== 0) return
          frame = window.requestAnimationFrame(() => {
            frame = 0
            const toggle = toggleRef.current
            if (toggle === null) return
            const rect = toggle.getBoundingClientRect()
            const estimate = 84
            const composerTop = layout === null ? window.innerHeight : layout.composerTop
            const next = composerTop - rect.bottom - 8 >= estimate
              ? { mode: 'below', top: Math.round(rect.bottom + 6), right: layout === null ? 12 : layout.right }
              : {
                mode: 'left',
                top: Math.round(Math.max(8, Math.min(rect.top + rect.height / 2 - estimate / 2, composerTop - 8 - estimate))),
                right: Math.round(window.innerWidth - (rect.left - 8))
              }
            setSearchAnchor((current) => (current !== null && current.mode === next.mode && current.top === next.top && current.right === next.right ? current : next))
          })
        }
        place()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null
        if (observer !== null && toggleRef.current !== null) observer.observe(toggleRef.current)
        window.addEventListener('resize', place)
        return () => {
          if (frame !== 0) window.cancelAnimationFrame(frame)
          if (observer !== null) observer.disconnect()
          window.removeEventListener('resize', place)
        }
      }, [searchOpen, layout, query, prompts.length])

      /**
       * Put one prompt into the composer draft.
       * @param {object} prompt - the rail mark's prompt entry.
       * @returns {void}
       */
      function copyPrompt(prompt) {
        cancelHidePreview()
        inputActions.setDraft(prompt.text)
        focusPromptHistoryComposer(sessionId)
        setPreview(null)
      }

      /**
       * Anchor the full-text preview card to one mark.
       * @param {object} prompt - the mark's prompt entry.
       * @param {number} ordinal - reverse index shown to assistive tech.
       * @param {object} element - the mark button.
       * @returns {void}
       */
      function showPreview(prompt, ordinal, element) {
        cancelHidePreview()
        if (layout === null) return
        const rect = element.getBoundingClientRect()
        const width = Math.max(200, Math.min(300, Math.round(window.innerWidth - layout.right - layout.width - 30)))
        // The card clamps its text instead of scrolling, so a small fixed
        // estimate keeps it fully above the composer for bottom marks too.
        const topLimit = Math.max(8, layout.composerTop - 8 - 176)
        const top = Math.round(Math.max(8, Math.min(rect.top - 10, topLimit)))
        const time = typeof prompt.at === 'number' ? promptHistoryTimeLabels(prompt.at) : null
        setPreview({
          ordinal,
          text: prompt.text,
          time: time === null ? '' : time.label,
          timeTitle: time === null ? '' : time.title,
          top,
          right: layout.right + layout.width + 10,
          width
        })
      }

      /** Hide the preview card after a short pointer trip toward it. */
      function scheduleHidePreview() {
        if (previewTimer.current !== null) window.clearTimeout(previewTimer.current)
        previewTimer.current = window.setTimeout(() => {
          previewTimer.current = null
          setPreview(null)
        }, 160)
      }

      /** Cancel a scheduled hide, e.g. when the pointer reaches the preview card. */
      function cancelHidePreview() {
        if (previewTimer.current !== null) {
          window.clearTimeout(previewTimer.current)
          previewTimer.current = null
        }
      }

      if (prompts.length === 0 || layout === null) return null

      const needle = query.trim().toLowerCase()
      const marks = []
      for (let index = prompts.length - 1; index >= 0; index -= 1) {
        const prompt = prompts[index]
        if (needle.length > 0 && !prompt.text.toLowerCase().includes(needle)) continue
        marks.push({ prompt, ordinal: index + 1 })
      }

      // The rail caps its height like the native turn rail so a long history
      // scrolls its ticks internally while the search button stays pinned and
      // reachable at the rail's foot.
      const railMaxHeight = Math.min(layout.maxHeight, 420)
      const style = React.createElement('style', null, PROMPT_HISTORY_PREVIEW_CSS)
      const railStyle = { top: layout.top, right: layout.right, width: layout.width, maxHeight: railMaxHeight }

      const rail = React.createElement('div', {
        className: 'psp-rail',
        'data-psp-rail': '',
        style: railStyle
      },
      React.createElement('div', {
        className: 'psp-rail-divider',
        'data-psp-rail-divider': '',
        'aria-hidden': 'true'
      }),
      React.createElement('div', {
        ref: marksRef,
        className: 'psp-marks',
        role: 'group',
        'aria-label': t('list.aria'),
        'data-fade-top': fades.top ? 'true' : undefined,
        'data-fade-bottom': fades.bottom ? 'true' : undefined
      },
      marks.map(({ prompt, ordinal }) => React.createElement('button', {
        key: String(ordinal),
        type: 'button',
        className: 'psp-mark',
        'data-psp-mark': '',
        'data-psp-index': String(ordinal),
        onClick: (event) => copyPrompt(prompt),
        onMouseEnter: (event) => showPreview(prompt, ordinal, event.currentTarget),
        onMouseLeave: scheduleHidePreview,
        onFocus: (event) => showPreview(prompt, ordinal, event.currentTarget),
        onBlur: scheduleHidePreview
      },
      // The accessible name carries the action and the prompt text, so the
      // visible tick never hides what the mark stands for.
      React.createElement('span', { className: 'psp-sr' }, t('mark.aria', { index: ordinal, text: accessiblePromptText(prompt.text) }))))),
      React.createElement('button', {
        ref: toggleRef,
        type: 'button',
        className: 'psp-search-toggle',
        'data-psp-search-toggle': '',
        'aria-expanded': searchOpen ? 'true' : 'false',
        'aria-label': t('search.open'),
        title: t('search.open'),
        onClick: () => {
          setPreview(null)
          if (searchOpen) {
            setQuery('')
            setSearchOpen(false)
            return
          }
          setSearchOpen(true)
        }
      }, RemixGlyph(REMIX_SEARCH_LINE, 13)))

      const previewCard = preview === null ? null : React.createElement('div', {
        className: 'psp-rail-card',
        'data-psp-preview-card': '',
        role: 'tooltip',
        'aria-hidden': 'true',
        style: { top: preview.top, right: preview.right, width: preview.width },
        onMouseEnter: cancelHidePreview,
        onMouseLeave: () => setPreview(null)
      },
      React.createElement('div', { className: 'psp-rail-card-text' }, preview.text),
      preview.time === ''
        ? null
        : React.createElement('div', { className: 'psp-rail-card-time', title: preview.timeTitle }, preview.time))

      // The card hangs below the fixed toggle when there is room, otherwise it
      // flips to the toggle's left; the toggle itself never moves.
      const searchCard = searchOpen && searchAnchor !== null ? React.createElement('div', {
        ref: searchCardRef,
        className: 'psp-search-card',
        'data-psp-search-card': '',
        'data-psp-search-mode': searchAnchor.mode,
        style: { top: searchAnchor.top, right: searchAnchor.right },
        onKeyDown: (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          setQuery('')
          setSearchOpen(false)
          const toggle = toggleRef.current
          if (toggle instanceof HTMLElement) toggle.focus()
        }
      },
      React.createElement('div', { className: 'psp-search-row' },
        RemixGlyph(REMIX_SEARCH_LINE, 13, 'psp-search-icon'),
        React.createElement('input', {
          ref: searchRef,
          type: 'text',
          className: 'psp-search-input',
          value: query,
          placeholder: t('search.placeholder'),
          'aria-label': t('search.aria'),
          autoComplete: 'off',
          spellCheck: false,
          onChange: (event) => setQuery(event.target.value)
        })),
      React.createElement('div', { className: 'psp-search-count' },
        t('count.filtered', { count: marks.length, total: prompts.length })),
      needle.length > 0 && marks.length === 0
        ? React.createElement('div', { className: 'psp-search-empty' }, t('empty.filtered'))
        : null)
        : null

      return ReactDOM.createPortal(
        React.createElement(React.Fragment, null, style, rail, previewCard, searchCard),
        document.body)
    }

    /**
     * Register the prompt-history rail's session-scoped data seat.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installPromptHistoryPreview(ctx) {
      const t = ctx.locale.bind(PROMPT_HISTORY_PREVIEW_NS)
      ctx.effect(() => ctx.locale.register(PROMPT_HISTORY_PREVIEW_NS, {
        en: PROMPT_HISTORY_PREVIEW_EN,
        zh: PROMPT_HISTORY_PREVIEW_ZH
      }), 'power-suite: prompt-history preview dictionaries')
      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: PROMPT_HISTORY_PREVIEW_ID,
        order: 100,
        locale: PROMPT_HISTORY_PREVIEW_NS,
        inject: () => ({ t })
      }, PromptHistoryPreview)), 'power-suite: prompt-history preview dock')
    }
    //#endregion

    //#region feature: draft attachment memory
    /**
     * Draft attachment memory.
     *
     * The shell persists a Session draft's semantic text (and reference chips)
     * per Session, but browser-owned attachment objects (pasted images, dropped
     * or picked files) live only in the mounted input controller: switching to
     * another Session and back restores the words and silently drops the
     * images/attachments. This feature keeps the browser Files for each Session
     * while the page stays open and re-introduces them through the composer's
     * own file-intake path (a synthetic paste with the cached Files) when the
     * Session is shown again and the shell restored no attachments.
     *
     * It is a page-lifetime workaround, not persistence: a page reload still
     * cannot bring back a File object the browser did not keep.
     */

    /** Seat identity of the invisible session-scoped capture/restore seat. */
    const DAM_SEAT = 'power-suite.draft-attachments'

    /** Sessions whose draft attachments are remembered at once. */
    const DAM_MAX_SESSIONS = 8

    /** Files remembered for one Session. */
    const DAM_MAX_FILES = 20

    /** Session id → { files: File[], restored: boolean, seq: number }. */
    const damMemory = new Map()

    /**
     * Escape one Session id for a quoted attribute selector.
     * @param {string} value - Session identity.
     * @returns {string} selector-safe value.
     */
    function damSelectorValue(value) {
      const css = globalThis.CSS
      if (css !== undefined && css !== null && typeof css.escape === 'function') return css.escape(value)
      return String(value).replace(/["\\]/g, '\\$&')
    }

    /**
     * Remember browser Files attached to one Session's draft.
     * @param {string} sessionId - Session identity.
     * @param {readonly File[]} files - browser files from paste, drop, or picker.
     * @returns {void}
     */
    function damRemember(sessionId, files) {
      if (!Array.isArray(files) || files.length === 0) return
      let entry = damMemory.get(sessionId)
      if (entry === undefined) {
        entry = { files: [], restored: false, seq: 0 }
        damMemory.set(sessionId, entry)
      }
      for (const file of files) {
        if (!(file instanceof File)) continue
        const duplicate = entry.files.some((known) => (
          known.name === file.name && known.size === file.size && known.lastModified === file.lastModified
        ))
        if (!duplicate) entry.files.push(file)
      }
      while (entry.files.length > DAM_MAX_FILES) entry.files.shift()
      entry.restored = false
      entry.seq = Date.now()
      while (damMemory.size > DAM_MAX_SESSIONS) {
        let oldestKey
        let oldestSeq = Number.POSITIVE_INFINITY
        for (const [key, value] of damMemory) {
          if (value.seq < oldestSeq) {
            oldestSeq = value.seq
            oldestKey = key
          }
        }
        if (oldestKey === undefined) break
        damMemory.delete(oldestKey)
      }
    }

    /**
     * Drop every remembered file for one Session (draft sent or cleared).
     * @param {string} sessionId - Session identity.
     * @returns {void}
     */
    function damForget(sessionId) {
      damMemory.delete(sessionId)
    }

    /**
     * Re-introduce remembered Files through the composer's paste intake.
     * @param {string} sessionId - Session identity.
     * @param {readonly File[]} files - remembered browser files.
     * @returns {boolean} whether a paste event was dispatched.
     */
    function damInject(sessionId, files) {
      if (files.length === 0) return false
      const scoped = document.querySelector(`[data-conversation-session="${damSelectorValue(sessionId)}"]`)
      if (!(scoped instanceof HTMLElement)) return false
      const composer = scoped.querySelector('[data-conversation-region="composer"]')
      if (!(composer instanceof HTMLElement)) return false
      const editor = composer.querySelector('[data-lexical-editor="true"]')
      if (!(editor instanceof HTMLElement)) return false
      if (typeof DataTransfer !== 'function' || typeof ClipboardEvent !== 'function') return false
      let data
      try {
        data = new DataTransfer()
        for (const file of files) data.items.add(file)
      } catch {
        return false
      }
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      editor.dispatchEvent(event)
      return true
    }

    /**
     * Invisible per-Session seat that captures draft Files and puts them back
     * after a Session round-trip.
     * @param {object} props - session-scoped slot props.
     * @returns {null} no DOM.
     */
    function DraftAttachmentSeat(props) {
      const { sessionId, useInput } = props
      const attachmentIds = useInput((state) => state.attachmentIds)
      const phase = useInput((state) => state.phase)
      const previousAttachments = React.useRef(attachmentIds.length)

      // Capture every browser File the composer admits while this Session is
      // mounted, before the shell's own intake consumes it.
      React.useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
        const inComposer = (node) => (node instanceof Element ? node.closest('[data-conversation-region="composer"]') : null) !== null
        const inThisSession = (node) => {
          if (!(node instanceof Element)) return false
          const scoped = node.closest('[data-conversation-session]')
          if (scoped !== null) return scoped.getAttribute('data-conversation-session') === sessionId
          // A picker input appended outside the conversation still belongs to
          // the one mounted composer of this Session.
          return document.querySelector(`[data-conversation-session="${damSelectorValue(sessionId)}"]`) !== null
        }
        const remember = (files) => {
          if (files === undefined || files === null) return
          const list = []
          for (const file of files) if (file instanceof File) list.push(file)
          damRemember(sessionId, list)
        }
        const onPaste = (event) => {
          if (!inComposer(event.target) || !inThisSession(event.target)) return
          const data = event.clipboardData
          if (data === null) return
          const files = []
          for (const item of data.items) {
            if (item.kind !== 'file') continue
            const file = item.getAsFile()
            if (file !== null) files.push(file)
          }
          remember(files)
        }
        const onDrop = (event) => {
          if (!inComposer(event.target) || !inThisSession(event.target)) return
          const transfer = event.dataTransfer
          if (transfer !== null) remember(transfer.files)
        }
        const onChange = (event) => {
          const target = event.target
          if (!(target instanceof HTMLInputElement) || target.type !== 'file') return
          if (!inComposer(target) || !inThisSession(target)) return
          remember(target.files)
        }
        document.addEventListener('paste', onPaste, true)
        document.addEventListener('drop', onDrop, true)
        document.addEventListener('change', onChange, true)
        return () => {
          document.removeEventListener('paste', onPaste, true)
          document.removeEventListener('drop', onDrop, true)
          document.removeEventListener('change', onChange, true)
        }
      }, [sessionId])

      // Restore after a round-trip: the shell brings the words back first; if
      // no attachment came back with them, feed the remembered Files through
      // the composer's own paste path.
      React.useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
        const entry = damMemory.get(sessionId)
        if (entry === undefined || entry.files.length === 0 || entry.restored === true) return undefined
        if (phase !== 'plain') return undefined
        if (attachmentIds.length > 0) {
          entry.restored = true
          return undefined
        }
        let cancelled = false
        let attempts = 0
        let timer = null
        const attempt = () => {
          if (cancelled) return
          if (damInject(sessionId, entry.files)) {
            entry.restored = true
            return
          }
          attempts += 1
          if (attempts < 20) timer = window.setTimeout(attempt, 100)
        }
        timer = window.setTimeout(attempt, 80)
        return () => {
          cancelled = true
          if (timer !== null) window.clearTimeout(timer)
        }
      }, [sessionId, phase, attachmentIds.length])

      // Forget the cache when the draft leaves through a send (or is cleared),
      // and reset the restored guard so a second round-trip restores again.
      React.useEffect(() => {
        const previous = previousAttachments.current
        previousAttachments.current = attachmentIds.length
        if (phase !== 'plain') {
          damForget(sessionId)
          return
        }
        const entry = damMemory.get(sessionId)
        if (entry !== undefined && entry.restored === true && previous > 0 && attachmentIds.length === 0) {
          // Every attachment was removed by the human; do not resurrect them.
          damForget(sessionId)
        }
      }, [attachmentIds.length, phase, sessionId])

      React.useEffect(() => {
        if (typeof sessionId !== 'string') return undefined
        return () => {
          const entry = damMemory.get(sessionId)
          if (entry !== undefined) entry.restored = false
        }
      }, [sessionId])

      return null
    }

    /**
     * Register the invisible draft-attachment capture/restore seat.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installDraftAttachmentMemory(ctx) {
      ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: DAM_SEAT,
        order: 20
      }, DraftAttachmentSeat)), 'power-suite: draft attachment memory seat')
    }
    //#endregion

    //#region feature: project view
    /** Copy namespace of the standalone Project page. */
    const PROJECT_VIEW_NS = 'powerSuiteProjectView'

    /** Invisible shell.overlay seat that owns the standalone page. */
    const PROJECT_PAGE_SEAT_ID = 'power-suite.project-page'

    /** Window event that asks the seat to open one Workspace's Project page. */
    const PROJECT_PAGE_EVENT = 'power-suite:open-project'

    /** Window event asking the UI annotation mode to deactivate (page takes over). */
    const ANNOTATION_EXIT_EVENT = 'power-suite:ui-annotation-exit'

    /** Root attribute marking that the Project page is open (hides the prompt rail). */
    const PROJECT_PAGE_ATTR = 'data-power-suite-project-page'

    /** Host route serving one Workspace's project snapshot. */
    const PROJECT_ROUTE = 'api/power-suite.project'

    /** Snapshot polling cadence while the tab is visible. */
    const PROJECT_VIEW_POLL_MS = 15_000

    /** Runs rendered in one batch before "show more" grows the window. */
    const PROJECT_VIEW_RUN_PAGE = 60

    /** Local element factory; keeps the region readable without JSX. */
    const psv = React.createElement

    // Remix Icon paths (Apache-2.0, https://remixicon.com), inlined here so the
    // view needs no icon package at runtime.
    const PsvFolderLine = 'M4 5V19H20V7H11.5858L9.5858 5H4ZM12.4142 5H21C21.5523 5 22 5.44772 22 6V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H10.4142L12.4142 5Z'
    const PsvPlayFill = 'M19.376 12.4161L8.77735 19.4818C8.54759 19.635 8.23715 19.5729 8.08397 19.3432C8.02922 19.261 8 19.1645 8 19.0658V4.93433C8 4.65928 8.22296 4.43633 8.49801 4.43633C8.59669 4.43633 8.69321 4.46566 8.77539 4.52041L19.374 11.5861C19.6038 11.7393 19.6658 12.0498 19.5126 12.2796C19.4759 12.3347 19.4293 12.3812 19.376 12.4161Z'
    const PsvCheckCircle = 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11.0026 16L18.0737 8.9289L16.6595 7.51469L11.0026 13.1716L8.17421 10.3431L6.75999 11.7574L11.0026 16Z'
    const PsvStackLine = 'M4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM5 5V19H19V5H5ZM7 8H10V10H7V8ZM7 12H12V14H7V12ZM7 16H9V18H7V16ZM14 8H17V10H14V8ZM14 12H17V14H14V12Z'
    const PsvTimerLine = 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM13 12H17V14H11V7H13V12Z'
    const PsvPlusLine = 'M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z'
    const PsvExternalLine = 'M10 3V5H5V19H19V14H21V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3H10ZM13 3H21V11H19V6.41421L10.7071 14.7071L9.29289 13.2929L17.5858 5H13V3Z'
    const PsvMoreLine = 'M12 3C12.5523 3 13 3.44772 13 4C13 4.55228 12.5523 5 12 5C11.4477 5 11 4.55228 11 4C11 3.44772 11.4477 3 12 3ZM12 11C12.5523 11 13 11.4477 13 12C13 12.5523 12.5523 13 12 13C11.4477 13 11 12.5523 11 12C11 11.4477 11.4477 11 12 11ZM12 19C12.5523 19 13 19.4477 13 20C13 20.5523 12.5523 21 12 21C11.4477 21 11 20.5523 11 20C11 19.4477 11.4477 19 12 19Z'
    const PsvChevronDown = 'M12 13.1716L6.34315 7.51472L4.92893 8.92893L12 16L19.0711 8.92893L17.6569 7.51472L12 13.1716Z'
    const PsvChevronRight = 'M13.1716 12L7.51472 17.6569L8.92893 19.0711L16 12L8.92893 4.92893L7.51472 6.34315L13.1716 12Z'
    const PsvActivityLine = 'M11 2V6.5L15.5 9L11 11.5V22H9V11.5L4.5 9L9 6.5V2H11ZM13 2H18V4H13V2ZM13 6H20V8H13V6ZM13 10H18V12H13V10Z'
    const PsvChevronLeftLine = 'M10.8284 12L16.4853 17.6569L15.0711 19.0711L8 12L15.0711 4.92893L16.4853 6.34315L10.8284 12Z'

    /** Copy for the standalone Project page. */
    const PROJECT_VIEW_EN = {
      'tabs.label': 'Project sections',
      'page.close': 'Close project page',
      'page.label': 'Project page',
      'tab.overview': 'Overview',
      'tab.sessions': 'Sessions',
      'tab.runs': 'Runs',
      'tab.settings': 'Settings',
      'state.loading': 'Loading project…',
      'state.error': 'Could not load this project.',
      'state.retry': 'Retry',
      'state.empty.title': 'Workspace not found',
      'state.empty.hint': 'This Workspace is no longer in the registry. Close the page and refresh the sidebar.',
      'header.titleFallback': 'Untitled project',
      'header.active': 'Active',
      'header.inactive': 'Inactive',
      'header.created': 'Created {date}',
      'header.lastActive': 'Last active {time}',
      'action.openWorkspace': 'Open Workspace',
      'action.newSession': 'New Session',
      'action.more': 'More actions',
      'action.refresh': 'Refresh',
      'action.copyPath': 'Copy project path',
      'action.copied': 'Copied',
      'stat.running': 'Running sessions',
      'stat.completedToday': 'Completed today',
      'stat.totalRuns': 'Total runs',
      'stat.average': 'Avg duration',
      'stat.none': '—',
      'overview.sessions.sub': '{count} sessions',
      'stat.running.hint': 'Sessions of this Workspace running right now.',
      'stat.completedToday.hint': 'Turns that completed since local midnight, measured from the newest sessions.',
      'stat.totalRuns.hint': 'Turns recorded in the measured sessions.',
      'stat.average.hint': 'Mean duration of completed turns that carry timing.',
      'stat.truncated': 'Measured from the newest {count} sessions',
      'overview.sessions.title': 'Sessions',
      'overview.sessions.viewAll': 'View all',
      'overview.sessions.empty': 'No sessions yet',
      'overview.explain.title': 'Dynamic bucketing & auto-archiving',
      'overview.explain.body': 'The sidebar keeps this Workspace in Active Projects while a Session runs or its last activity is inside the active window ({days}). Finished Sessions stay in the Running & recent card for {minutes}. Both windows are edited on the Plugins page.',
      'unit.daysOne': '1 day',
      'unit.days': '{n} days',
      'unit.minutesOne': '1 minute',
      'unit.minutes': '{n} minutes',
      'overview.explain.activity.title': 'Activity detection',
      'overview.explain.activity.body': 'A running Session, or activity inside the active window.',
      'overview.explain.grouping.title': 'Auto-bucketing',
      'overview.explain.grouping.body': 'Active and Inactive groups follow the active window.',
      'overview.explain.archive.title': 'Archive & wake',
      'overview.explain.archive.body': 'Archiving is not implemented yet; Inactive only means outside the window.',
      'overview.activity.title': 'Recent activity',
      'overview.activity.empty': 'No measured activity yet.',
      'activity.kind.run-completed': 'Turn completed',
      'activity.kind.run-failed': 'Turn failed',
      'activity.kind.run-interrupted': 'Turn interrupted',
      'activity.kind.run-stopped': 'Turn stopped',
      'activity.kind.session-updated': 'Session activity',
      'activity.turn': 'Turn {turn}',
      'sessions.filter.all': 'All',
      'sessions.filter.running': 'Running',
      'sessions.filter.completed': 'Completed',
      'sessions.filter.interrupted': 'Interrupted',
      'sessions.search.placeholder': 'Search sessions',
      'sessions.search.aria': 'Search sessions by title',
      'sessions.empty': 'No sessions match this filter.',
      'sessions.untitled': 'Untitled session',
      'sessions.runs': '{count} runs',
      'sessions.runsOne': '1 run',
      'sessions.updated': 'Updated {time}',
      'sessions.subagent': 'Subagent',
      'status.running': 'Running',
      'status.completed': 'Completed',
      'status.interrupted': 'Interrupted',
      'status.failed': 'Failed',
      'status.stopped': 'Stopped',
      'status.notStarted': 'Not started',
      'runs.filter.all': 'All',
      'runs.filter.running': 'Running',
      'runs.filter.completed': 'Completed',
      'runs.filter.interrupted': 'Interrupted',
      'runs.filter.failed': 'Failed',
      'runs.filter.stopped': 'Stopped',
      'runs.sessionFilter.all': 'All sessions',
      'runs.sessionFilter.label': 'Filter runs by session',
      'runs.search.placeholder': 'Search runs or jobs',
      'runs.search.aria': 'Search runs by session, turn, or job',
      'runs.includeJobs': 'Include jobs',
      'runs.includeJobs.hint': 'Show the job records folded under each turn.',
      'runs.empty': 'No runs match this filter.',
      'runs.turn': 'Turn {turn}',
      'runs.started': 'Started {time}',
      'runs.toolCalls': '{count} tool calls',
      'runs.toolCallsOne': '1 tool call',
      'runs.jobs': '{count} jobs',
      'runs.jobsOne': '1 job',
      'runs.expand': 'Show jobs of turn {turn}',
      'runs.collapse': 'Hide jobs of turn {turn}',
      'runs.jobsEmpty': 'No job records in this turn.',
      'runs.jobsCapped': 'Showing {shown} of {total} jobs.',
      'runs.more': 'Show {count} more runs',
      'runs.capped': 'The newest {shown} of {total} measured runs are shown.',
      'runs.live': 'running',
      'settings.preset.title': 'Default agent preset',
      'settings.preset.hint': 'New Sessions in this Workspace start under this preset. Follow global default otherwise.',
      'settings.preset.global': 'Follow global default',
      'settings.preset.loading': 'Loading presets…',
      'settings.preset.unavailable': 'Presets are unavailable right now.',
      'settings.preset.saveFailed': 'Could not save the preset.',
      'settings.preset.saved': 'Saved',
      'settings.windows.title': 'Grouping windows',
      'settings.windows.body': 'Finished Sessions stay in the Running & recent card for {minutes}; the project stays Active for {days} after its last activity. Edit these on the Plugins page — this view only reads them.',
      'settings.path.title': 'Workspace path',
      'settings.warnings': '{count} Session logs could not be read.',
      'duration.seconds': '{s}s',
      'duration.minutes': '{m}m {s}s',
      'duration.hours': '{h}h {m}m',
      'duration.days': '{d}d {h}h',
      'time.now': 'now',
      'time.minutes': '{n}m ago',
      'time.hours': '{n}h ago',
      'time.days': '{n}d ago',
      'time.unknown': 'unknown',
      'preset.standard': 'Standard',
      'preset.ptc': 'PTC',
      'preset.minimal': 'Minimal',
      'preset.cordis': 'Cordis'
    }
    const PROJECT_VIEW_ZH = {
      'tabs.label': '项目分区',
      'page.close': '关闭项目页',
      'page.label': '项目页',
      'tab.overview': '项目概览',
      'tab.sessions': '会话管理',
      'tab.runs': '运行记录',
      'tab.settings': '设置',
      'state.loading': '正在加载项目…',
      'state.error': '无法加载项目数据。',
      'state.retry': '重试',
      'state.empty.title': '找不到工作区',
      'state.empty.hint': '该工作区已不在注册表中。请关闭页面并刷新侧边栏。',
      'header.titleFallback': '未命名项目',
      'header.active': '活跃',
      'header.inactive': '非活跃',
      'header.created': '创建于 {date}',
      'header.lastActive': '最近活跃 {time}',
      'action.openWorkspace': '打开工作区',
      'action.newSession': '新建 Session',
      'action.more': '更多操作',
      'action.refresh': '刷新',
      'action.copyPath': '复制项目路径',
      'action.copied': '已复制',
      'stat.running': '运行中的会话',
      'stat.completedToday': '今日完成',
      'stat.totalRuns': '累计运行',
      'stat.average': '平均时长',
      'stat.none': '—',
      'overview.sessions.sub': '{count} 个会话',
      'stat.running.hint': '当前工作区正在运行的会话数。',
      'stat.completedToday.hint': '本地时间今日内完成的回合数（基于最新测得的会话）。',
      'stat.totalRuns.hint': '已测会话中记录的回合总数。',
      'stat.average.hint': '有时长数据的已完成回合的平均时长。',
      'stat.truncated': '统计基于最新 {count} 个会话',
      'overview.sessions.title': '会话列表',
      'overview.sessions.viewAll': '查看全部',
      'overview.sessions.empty': '暂无会话',
      'overview.explain.title': '动态分组与自动归档',
      'overview.explain.body': '只要有会话正在运行，或最后一次活动仍在活跃窗口（{days}）内，侧边栏就把该工作区保留在「活跃项目」中。完成的会话在「进行中与最近活跃」卡片里保留 {minutes}。两个窗口都在 Plugins 页修改。',
      'unit.daysOne': '1 天',
      'unit.days': '{n} 天',
      'unit.minutesOne': '1 分钟',
      'unit.minutes': '{n} 分钟',
      'overview.explain.activity.title': '活动检测',
      'overview.explain.activity.body': '会话正在运行，或活动发生在活跃窗口内。',
      'overview.explain.grouping.title': '自动分组',
      'overview.explain.grouping.body': '「活跃项目」与「非活跃项目」按活跃窗口归类。',
      'overview.explain.archive.title': '归档与唤醒',
      'overview.explain.archive.body': '归档尚未实现；「非活跃」仅表示超出活跃窗口。',
      'overview.activity.title': '最近动态',
      'overview.activity.empty': '暂无活动记录。',
      'activity.kind.run-completed': '回合完成',
      'activity.kind.run-failed': '回合失败',
      'activity.kind.run-interrupted': '回合中断',
      'activity.kind.run-stopped': '回合停止',
      'activity.kind.session-updated': '会话动态',
      'activity.turn': '第 {turn} 回合',
      'sessions.filter.all': '全部',
      'sessions.filter.running': '运行中',
      'sessions.filter.completed': '已完成',
      'sessions.filter.interrupted': '已中断',
      'sessions.search.placeholder': '搜索会话',
      'sessions.search.aria': '按标题搜索会话',
      'sessions.empty': '没有符合条件的会话。',
      'sessions.untitled': '未命名会话',
      'sessions.runs': '{count} 次运行',
      'sessions.runsOne': '1 次运行',
      'sessions.updated': '更新于 {time}',
      'sessions.subagent': '子代理',
      'status.running': '运行中',
      'status.completed': '已完成',
      'status.interrupted': '已中断',
      'status.failed': '失败',
      'status.stopped': '已停止',
      'status.notStarted': '未开始',
      'runs.filter.all': '全部',
      'runs.filter.running': '运行中',
      'runs.filter.completed': '已完成',
      'runs.filter.interrupted': '已中断',
      'runs.filter.failed': '失败',
      'runs.filter.stopped': '已停止',
      'runs.sessionFilter.all': '全部会话',
      'runs.sessionFilter.label': '按会话筛选运行记录',
      'runs.search.placeholder': '搜索运行或 Job',
      'runs.search.aria': '按会话、回合或 Job 搜索运行记录',
      'runs.includeJobs': '包含 Job',
      'runs.includeJobs.hint': '显示折叠在每个回合下的 Job 记录。',
      'runs.empty': '没有符合条件的运行记录。',
      'runs.turn': '第 {turn} 回合',
      'runs.started': '开始于 {time}',
      'runs.toolCalls': '{count} 次工具调用',
      'runs.toolCallsOne': '1 次工具调用',
      'runs.jobs': '{count} 个 Job',
      'runs.jobsOne': '1 个 Job',
      'runs.expand': '展开第 {turn} 回合的 Job',
      'runs.collapse': '收起第 {turn} 回合的 Job',
      'runs.jobsEmpty': '本回合没有 Job 记录。',
      'runs.jobsCapped': '显示 {shown} / {total} 个 Job。',
      'runs.more': '再显示 {count} 条运行记录',
      'runs.capped': '仅显示最新 {shown} / 共 {total} 条已测运行记录。',
      'runs.live': '运行中',
      'settings.preset.title': '默认 Agent 预设',
      'settings.preset.hint': '该工作区新建 Session 时使用此预设，否则跟随全局默认。',
      'settings.preset.global': '跟随全局默认',
      'settings.preset.loading': '正在读取预设…',
      'settings.preset.unavailable': '预设暂不可用。',
      'settings.preset.saveFailed': '保存预设失败。',
      'settings.preset.saved': '已保存',
      'settings.windows.title': '分组窗口',
      'settings.windows.body': '完成的会话在「进行中与最近活跃」卡片中保留 {minutes}；项目在最后一次活动后 {days} 内保持活跃。请在 Plugins 页修改，本视图只读取。',
      'settings.path.title': '工作区路径',
      'settings.warnings': '有 {count} 个会话日志无法读取。',
      'duration.seconds': '{s}s',
      'duration.minutes': '{m}m {s}s',
      'duration.hours': '{h}h {m}m',
      'duration.days': '{d}d {h}h',
      'time.now': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
      'time.unknown': '未知',
      'preset.standard': '标准',
      'preset.ptc': 'PTC',
      'preset.minimal': '极简',
      'preset.cordis': 'Cordis'
    }

    const PROJECT_VIEW_CSS = `
.psv-page{position:fixed;top:0;left:0;z-index:200;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);animation:psv-page-in .14s ease-out}
.psv-page .psv-root{flex:1 1 auto;min-height:0}
html[${PROJECT_PAGE_ATTR}='true'] [data-psp-rail],html[${PROJECT_PAGE_ATTR}='true'] [data-psp-preview-card],html[${PROJECT_PAGE_ATTR}='true'] [data-psp-search-card],html[${PROJECT_PAGE_ATTR}='true'] [data-psp-rail-divider],html[${PROJECT_PAGE_ATTR}='true'] [data-psp-search-toggle]{display:none!important}
.psv-page-bar{flex:none;display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.psv-page-back{width:30px;height:30px;flex:none}
.psv-page-title{min-width:0;font-size:15px;font-weight:600;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psv-page-spacer{flex:1 1 auto}
@keyframes psv-page-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.psv-page{animation:none}}
.psv-root{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;height:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;overflow:hidden;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-1))}
.psv-tabbar{flex:none;display:flex;align-items:center;gap:8px;padding:8px 24px 0;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.psv-tabs{display:flex;align-items:center;gap:2px;min-width:0;overflow-x:auto;scrollbar-width:none}
.psv-tabs::-webkit-scrollbar{display:none}
.psv-tab{appearance:none;position:relative;box-sizing:border-box;height:36px;padding:0 12px;border:0;border-radius:var(--dsw-radius-sm,6px) var(--dsw-radius-sm,6px) 0 0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;cursor:pointer;white-space:nowrap}
.psv-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.psv-tab[aria-selected=true]{color:var(--dsw-alias-label-primary);font-weight:600}
.psv-tab[aria-selected=true]::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px;background:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.psv-tab:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psv-tabbar-actions{display:flex;align-items:center;gap:4px;margin-left:auto;padding-bottom:6px}
.psv-iconbtn{appearance:none;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.psv-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.psv-iconbtn:disabled{opacity:.55;cursor:default}
.psv-iconbtn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
@keyframes psv-spin{to{transform:rotate(360deg)}}
.psv-iconbtn[data-busy=true] svg{animation:psv-spin .9s linear infinite}
.psv-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:20px 24px 44px;box-sizing:border-box}
.psv-inner{max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.psv-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.psv-header{display:flex;flex-direction:column;gap:14px;padding:18px 20px}
.psv-header-main{display:flex;align-items:flex-start;gap:14px;min-width:0;flex-wrap:wrap}
.psv-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-business-primary)}
.psv-title-wrap{min-width:0;flex:1 1 260px;display:flex;flex-direction:column;gap:4px}
.psv-title-row{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}
.psv-title{margin:0;min-width:0;font-size:18px;font-weight:600;line-height:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psv-badge{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:500;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.psv-badge[data-state=active]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.psv-badge-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.psv-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psv-desc code{font-family:var(--dsw-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-secondary);background:transparent}
.psv-actions{display:flex;align-items:center;gap:8px;flex:none;margin-left:auto}
.psv-btn{appearance:none;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:18px;cursor:pointer;white-space:nowrap}
.psv-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.psv-btn[data-variant=primary]{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-bg-layer-1)}
.psv-btn[data-variant=primary]:hover{filter:brightness(1.06)}
.psv-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.psv-btn:disabled{opacity:.6;cursor:default}
.psv-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.psv-stat{display:flex;align-items:center;gap:12px;min-width:0;padding:14px 16px}
.psv-stat-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.psv-stat[data-tone=success] .psv-stat-icon{color:var(--dsw-alias-state-success-primary)}
.psv-stat[data-tone=business] .psv-stat-icon{color:var(--dsw-alias-state-business-primary)}
.psv-stat[data-tone=warn] .psv-stat-icon{color:var(--dsw-alias-state-warn-primary)}
.psv-stat-body{min-width:0;display:flex;flex-direction:column;gap:1px}
.psv-stat-label{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psv-stat-value{font-size:20px;font-weight:600;line-height:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psv-section{display:flex;flex-direction:column;gap:10px}
.psv-section-head{display:flex;align-items:center;gap:10px;min-width:0}
.psv-section-title{margin:0;font-size:14px;font-weight:600;line-height:20px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psv-section-sub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psv-section-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex:none}
.psv-list{display:flex;flex-direction:column}
.psv-row{appearance:none;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;min-width:0}
.psv-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.psv-row:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psv-row+.psv-row{border-top:1px solid var(--dsw-alias-border-l1)}
.psv-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.psv-dot[data-status=running]{background:var(--dsw-alias-state-business-primary)}
.psv-dot[data-status=completed]{background:var(--dsw-alias-state-success-primary)}
.psv-dot[data-status=interrupted]{background:var(--dsw-alias-state-warn-primary)}
.psv-dot[data-status=failed]{background:var(--dsw-alias-state-error-primary)}
.psv-dot[data-status=stopped]{background:var(--dsw-alias-label-tertiary)}
.psv-row-main{min-width:0;flex:1 1 auto;display:flex;flex-direction:column;gap:1px}
.psv-row-title{font-size:13px;line-height:19px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psv-row-meta{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px;min-width:0;white-space:nowrap;overflow:hidden}
.psv-row-side{flex:none;display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px;white-space:nowrap}
.psv-status-chip{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:var(--dsw-radius-sm,6px);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:nowrap}
.psv-status-chip[data-status=running]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.psv-status-chip[data-status=completed]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.psv-status-chip[data-status=interrupted]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.psv-status-chip[data-status=failed]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.psv-filterbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
.psv-chips{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
.psv-chip{appearance:none;box-sizing:border-box;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.psv-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.psv-chip[data-active=true]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}
.psv-chip-count{color:var(--dsw-alias-label-tertiary);font-size:11px}
.psv-chip[data-active=true] .psv-chip-count{color:var(--dsw-alias-label-secondary)}
.psv-chip:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.psv-search{position:relative;display:flex;align-items:center;gap:6px;box-sizing:border-box;height:28px;min-width:180px;max-width:260px;flex:1 1 180px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary)}
.psv-search:focus-within{border-color:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.psv-search input{flex:1;min-width:0;height:100%;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}
.psv-search input::placeholder{color:var(--dsw-alias-label-tertiary)}
.psv-toggle{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;user-select:none;white-space:nowrap}
.psv-toggle input{appearance:none;margin:0;width:26px;height:15px;border-radius:999px;background:var(--dsw-alias-border-l3);position:relative;cursor:pointer;transition:background .15s ease}
.psv-toggle input::after{content:"";position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);transition:transform .15s ease}
.psv-toggle input:checked{background:var(--dsw-alias-state-business-primary)}
.psv-toggle input:checked::after{transform:translateX(11px)}
.psv-toggle input:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.psv-dd{position:relative;display:inline-flex;flex:none}
.psv-dd-trigger{appearance:none;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:28px;max-width:220px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.psv-dd-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.psv-dd-trigger>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psv-dd-trigger:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.psv-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:50;box-sizing:border-box;min-width:190px;max-width:min(320px,calc(100vw - 48px));max-height:320px;overflow-y:auto;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel,none)}
.psv-menu[data-align=end]{left:auto;right:0}
.psv-menu-item{appearance:none;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;padding:7px 9px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:inherit;font:inherit;font-size:12.5px;line-height:18px;text-align:left;cursor:pointer;white-space:nowrap}
.psv-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.psv-menu-item:disabled{opacity:.5;cursor:default}
.psv-menu-item:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}
.psv-menu-item>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.psv-menu-check{margin-left:auto;flex:none;display:inline-flex;color:var(--dsw-alias-state-business-primary)}
.psv-empty{padding:26px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:18px}
.psv-state{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:24px 20px}
.psv-state-title{font-size:14px;font-weight:600;line-height:20px}
.psv-state-body{color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:18px}
.psv-note{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px}
.psv-activity{display:flex;flex-direction:column}
.psv-activity-row{display:flex;align-items:center;gap:10px;padding:8px 10px;min-width:0}
.psv-activity-row+.psv-activity-row{border-top:1px solid var(--dsw-alias-border-l1)}
.psv-activity-kind{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}
.psv-activity-kind[data-kind=run-completed]{color:var(--dsw-alias-state-success-primary)}
.psv-activity-kind[data-kind=run-failed]{color:var(--dsw-alias-state-error-primary)}
.psv-activity-kind[data-kind=run-interrupted]{color:var(--dsw-alias-state-warn-primary)}
.psv-activity-kind[data-kind=session-updated]{color:var(--dsw-alias-state-business-primary)}
.psv-activity-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px}
.psv-activity-title{font-size:12.5px;line-height:18px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psv-activity-meta{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psv-activity-time{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px;white-space:nowrap}
.psv-explainer{display:flex;flex-direction:column;gap:12px;padding:16px 18px}
.psv-explainer-head{display:flex;align-items:flex-start;gap:12px;min-width:0}
.psv-explainer-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-business-primary)}
.psv-explainer-copy{min-width:0;display:flex;flex-direction:column;gap:3px}
.psv-explainer-title{font-size:14px;font-weight:600;line-height:20px}
.psv-explainer-body{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.psv-explainer-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.psv-explainer-step{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);min-width:0}
.psv-explainer-step-title{font-size:12.5px;font-weight:600;line-height:18px}
.psv-explainer-step-body{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px}
.psv-run{display:flex;flex-direction:column;min-width:0}
.psv-run+.psv-run{border-top:1px solid var(--dsw-alias-border-l1)}
.psv-run-head{appearance:none;display:flex;align-items:center;gap:10px;width:100%;min-width:0;padding:9px 10px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.psv-run-head:hover{background:var(--dsw-alias-interactive-bg-hover)}
.psv-run-head:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psv-run-chevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary);transition:transform .12s ease}
.psv-run[data-open=true] .psv-run-chevron{transform:rotate(90deg)}
.psv-run-main{min-width:0;flex:1 1 auto;display:flex;flex-direction:column;gap:1px}
.psv-run-title{display:flex;align-items:center;gap:8px;min-width:0;font-size:13px;line-height:19px;font-weight:500}
.psv-run-session{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psv-run-turn{flex:none;color:var(--dsw-alias-label-tertiary);font-weight:400;font-size:11.5px;line-height:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-xs,4px);padding:0 5px}
.psv-run-meta{display:flex;align-items:center;gap:10px;color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px;min-width:0;white-space:nowrap;overflow:hidden}
.psv-run-side{flex:none;display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px;white-space:nowrap}
.psv-jobs{margin:0 10px 8px 34px;display:flex;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l2);padding-left:10px}
.psv-job{display:flex;align-items:center;gap:8px;padding:4px 0;min-width:0;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:17px}
.psv-job-kind{flex:none;display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:14px;white-space:nowrap}
.psv-job-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.psv-job-status{flex:none}
.psv-job-meta{flex:none;color:var(--dsw-alias-label-tertiary)}
.psv-job-detail{flex:none;max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}
.psv-jobs-note{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;padding:2px 0}
.psv-loadmore{display:flex;justify-content:center;padding:8px 0 2px}
.psv-footer-note{padding:2px 10px 0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.psv-settings{display:flex;flex-direction:column;gap:16px}
.psv-field{display:flex;flex-direction:column;gap:6px;padding:14px 16px}
.psv-field-label{font-size:12.5px;font-weight:600;line-height:18px}
.psv-field-hint{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px}
.psv-field-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.psv-path{display:flex;align-items:center;gap:8px;min-width:0}
.psv-path-text{font-family:var(--dsw-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psv-toast{display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-state-success-primary);font-size:11.5px;line-height:16px}
.psv-error-text{color:var(--dsw-alias-state-error-primary);font-size:11.5px;line-height:16px}
.psv-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (max-width:920px){.psv-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.psv-explainer-grid{grid-template-columns:1fr}.psv-tabbar{padding-left:14px}.psv-scroll{padding:16px 14px 40px}}
@media (max-width:640px){.psv-stats{grid-template-columns:1fr}.psv-actions{margin-left:0;width:100%;flex-wrap:wrap}.psv-run-side{display:none}}
@media (prefers-reduced-motion:reduce){.psv-tab,.psv-btn,.psv-chip,.psv-toggle input,.psv-toggle input::after,.psv-run-chevron,.psv-iconbtn svg{transition:none;animation:none}}
`

    /**
     * Format one measured duration for compact display.
     * @param {number | null} ms - milliseconds, or null.
     * @param {Function} t - namespace-bound translate.
     * @returns {string} duration text, or an em dash when unknown.
     */
    function psvDuration(ms, t) {
      if (!Number.isFinite(ms) || ms < 0) return t('stat.none')
      const total = Math.max(0, Math.round(ms / 1000))
      const days = Math.floor(total / 86400)
      const hours = Math.floor((total % 86400) / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const seconds = total % 60
      if (days > 0) return t('duration.days', { d: days, h: hours })
      if (hours > 0) return t('duration.hours', { h: hours, m: minutes })
      if (minutes > 0) return t('duration.minutes', { m: minutes, s: seconds })
      return t('duration.seconds', { s: seconds })
    }

    /**
     * Format the distance from `at` to `now` in coarse units.
     * @param {number | null} at - epoch milliseconds.
     * @param {number} now - current epoch milliseconds.
     * @param {Function} t - namespace-bound translate.
     * @returns {string} relative label.
     */
    function psvRelative(at, now, t) {
      if (!Number.isFinite(at)) return t('time.unknown')
      const total = Math.max(0, Math.floor((now - at) / 1000))
      if (total < 45) return t('time.now')
      const minutes = Math.floor(total / 60)
      if (minutes < 60) return t('time.minutes', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('time.hours', { n: hours })
      return t('time.days', { n: Math.floor(hours / 24) })
    }

    /**
     * Full local timestamp, used as an exact-time tooltip and date value.
     * @param {number | null} at - epoch milliseconds.
     * @returns {string} localized timestamp, or an empty string.
     */
    function psvExact(at) {
      return Number.isFinite(at) ? new Date(at).toLocaleString() : ''
    }

    /**
     * Local calendar date for one timestamp.
     * @param {number | null} at - epoch milliseconds.
     * @returns {string} localized date, or an empty string.
     */
    function psvDate(at) {
      if (!Number.isFinite(at)) return ''
      const date = new Date(at)
      return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
    }

    /**
     * Display title of one measured Session: the log's own title, then the
     * browser's list row, then a localized placeholder. The Host never invents
     * a title it cannot read from the log.
     * @param {object} row - session row from the snapshot.
     * @param {object} sessionsSnapshot - browser Session list snapshot.
     * @param {Function} t - namespace-bound translate.
     * @returns {string} display title.
     */
    function psvSessionTitle(row, sessionsSnapshot, t) {
      if (row !== null && typeof row === 'object' && typeof row.title === 'string' && row.title.length > 0) return row.title
      const sessionId = row !== null && typeof row === 'object' ? row.sessionId : undefined
      const summary = typeof sessionId === 'string' && sessionsSnapshot !== null && typeof sessionsSnapshot === 'object'
        ? sessionsSnapshot.byId?.[sessionId]
        : undefined
      if (summary !== undefined && summary !== null) {
        if (typeof summary.title === 'string' && summary.title.length > 0) return summary.title
        if (typeof summary.displayTitle === 'string' && summary.displayTitle.length > 0) return summary.displayTitle
      }
      return t('sessions.untitled')
    }

    /**
     * Run-status filter list, in display order.
     * @returns {string[]} status ids.
     */
    function psvRunStatuses() {
      return ['running', 'completed', 'interrupted', 'failed', 'stopped']
    }

    /**
     * Session status of one measured row.
     * @param {object} row - session row from the snapshot.
     * @returns {'running'|'interrupted'|'completed'|'notStarted'} status.
     */
    function psvSessionStatus(row) {
      if (row?.running === true) return 'running'
      if (row?.interrupted === true) return 'interrupted'
      if (Number.isFinite(row?.runCount) && row.runCount > 0) return 'completed'
      return 'notStarted'
    }

    /**
     * Read the browser Session list snapshot through a source, tolerating a
     * deployment without the Session service.
     * @param {object | undefined} source - observable source.
     * @returns {object} the snapshot.
     */
    function usePsvSessions(source) {
      const subscribe = React.useCallback((listener) => {
        if (source === undefined || source === null || typeof source.subscribe !== 'function') return () => {}
        return source.subscribe(listener)
      }, [source])
      const getSnapshot = React.useCallback(() => {
        if (source === undefined || source === null || typeof source.getSnapshot !== 'function') return { ids: [], byId: {} }
        return source.getSnapshot()
      }, [source])
      return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    }

    /**
     * Tick `now` forward so relative labels and live elapsed times stay current.
     * @param {number} intervalMs - tick interval.
     * @returns {number} current epoch milliseconds.
     */
    function usePsvNow(intervalMs) {
      const [now, setNow] = React.useState(() => Date.now())
      React.useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
        return () => window.clearInterval(timer)
      }, [intervalMs])
      return now
    }

    /**
     * Fetch the Host project snapshot for one Workspace and keep it warm.
     *
     * The Workspace id is the only key. Polling refreshes silently; a manual
     * refresh sets the refresh flag and asks the Host to bypass its cache.
     * A Workspace switch aborts the previous request and drops its snapshot, so
     * a slower earlier answer can never overwrite the newer Workspace's data.
     * @param {string | null} workspaceId - Workspace identity to measure.
     * @returns {{ state: object, refreshing: boolean, refresh: Function }} snapshot state.
     */
    function usePsvProject(workspaceId) {
      const [state, setState] = React.useState({ status: 'loading', workspaceId: null, snapshot: null, error: null })
      const [nonce, setNonce] = React.useState(0)
      const [refreshing, setRefreshing] = React.useState(false)
      const manualRef = React.useRef(false)
      React.useEffect(() => {
        if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
          setState({ status: 'loading', workspaceId: null, snapshot: null, error: null })
          return undefined
        }
        let disposed = false
        const controller = new AbortController()
        let inFlight = false
        const load = async (manual) => {
          if (inFlight) return
          inFlight = true
          if (manual) setRefreshing(true)
          try {
            const suffix = manual ? '&refresh=1' : ''
            const response = await fetch(appUrl(`${PROJECT_ROUTE}?workspaceId=${encodeURIComponent(workspaceId)}${suffix}`), {
              signal: controller.signal,
              credentials: 'same-origin',
              headers: { accept: 'application/json' }
            })
            if (!response.ok) {
              if (response.status === 404) {
                let body = null
                try {
                  body = await response.json()
                } catch {
                  body = null
                }
                if (body !== null && typeof body === 'object' && body.code === 'workspace-not-found') {
                  if (!disposed) setState({ status: 'empty', workspaceId, snapshot: null, error: null })
                  return
                }
              }
              throw new Error(`HTTP ${response.status}`)
            }
            const snapshot = await response.json()
            if (disposed) return
            setState({ status: 'ready', workspaceId, snapshot, error: null })
          } catch (error) {
            if (disposed || controller.signal.aborted) return
            const message = error instanceof Error && error.message.length > 0 ? error.message : 'request failed'
            setState((previous) => previous.snapshot !== null && previous.workspaceId === workspaceId
              ? { ...previous, status: 'ready' }
              : { status: 'error', workspaceId, snapshot: null, error: message })
          } finally {
            inFlight = false
            if (!disposed) setRefreshing(false)
          }
        }
        setState((previous) => previous.workspaceId === workspaceId && previous.snapshot !== null
          ? previous
          : { status: 'loading', workspaceId, snapshot: null, error: null })
        const manual = manualRef.current
        manualRef.current = false
        load(manual)
        const timer = window.setInterval(() => load(false), PROJECT_VIEW_POLL_MS)
        const onFocus = () => load(false)
        window.addEventListener('focus', onFocus)
        return () => {
          disposed = true
          controller.abort()
          window.clearInterval(timer)
          window.removeEventListener('focus', onFocus)
        }
      }, [workspaceId, nonce])
      const refresh = React.useCallback(() => {
        manualRef.current = true
        setNonce((value) => value + 1)
      }, [])
      return { state, refreshing, refresh }
    }

    /**
     * Chevron for one run row.
     * @param {{ open: boolean }} props - open state.
     * @returns {object} the element.
     */
    function PsvRunChevron({ open }) {
      return psv('span', { className: 'psv-run-chevron', 'aria-hidden': 'true' },
        RemixGlyph(open ? PsvChevronDown : PsvChevronRight, 14))
    }

    /**
     * One status dot with an accessible hidden label.
     * @param {{ status: string, label: string }} props - status and its text.
     * @returns {object} the element.
     */
    function PsvStatusDot({ status, label }) {
      return psv('span', { className: 'psv-dot', 'data-status': status, role: 'img', 'aria-label': label })
    }

    /**
     * One compact status chip.
     * @param {{ status: string, label: string }} props - status and its text.
     * @returns {object} the element.
     */
    function PsvStatusChip({ status, label }) {
      return psv('span', { className: 'psv-status-chip', 'data-status': status }, label)
    }

    /**
     * Accessible dropdown trigger + menu with outside-press and Escape close,
     * arrow-key navigation, and focus return to the trigger.
     * @param {object} props - dropdown props.
     * @param {Function} props.t - namespace-bound translate.
     * @param {string} props.label - accessible trigger label.
     * @param {object} props.trigger - trigger content.
     * @param {'start'|'end'} [props.align] - menu alignment.
     * @param {string} [props.className] - extra root class.
     * @param {Function} props.renderItems - receives `close`.
     * @returns {object} the dropdown element.
     */
    function PsvDropdown({ t, label, trigger, align = 'start', className, renderItems }) {
      const [open, setOpen] = React.useState(false)
      const rootRef = React.useRef(null)
      const triggerRef = React.useRef(null)
      const menuRef = React.useRef(null)
      React.useEffect(() => {
        if (!open) return undefined
        const focusTimer = window.setTimeout(() => {
          const menu = menuRef.current
          if (menu === null) return
          const target = menu.querySelector('[data-checked=true]') ?? menu.querySelector('button:not([disabled])')
          if (target instanceof HTMLElement) target.focus()
        }, 0)
        const onPointer = (event) => {
          const root = rootRef.current
          if (root !== null && event.target instanceof Node && root.contains(event.target)) return
          setOpen(false)
        }
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          const target = triggerRef.current
          if (target instanceof HTMLElement) target.focus()
        }
        document.addEventListener('pointerdown', onPointer, true)
        document.addEventListener('keydown', onKey, true)
        return () => {
          window.clearTimeout(focusTimer)
          document.removeEventListener('pointerdown', onPointer, true)
          document.removeEventListener('keydown', onKey, true)
        }
      }, [open])
      const onMenuKeyDown = (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
        const menu = menuRef.current
        if (menu === null) return
        const items = [...menu.querySelectorAll('button:not([disabled])')].filter((node) => node instanceof HTMLElement)
        if (items.length === 0) return
        event.preventDefault()
        const index = items.indexOf(document.activeElement)
        let next = 0
        if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length
        else if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1
        else if (event.key === 'End') next = items.length - 1
        items[next].focus()
      }
      return psv('div', { className: `psv-dd ${className ?? ''}`, ref: rootRef },
        psv('button', {
          ref: triggerRef,
          type: 'button',
          className: 'psv-dd-trigger',
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': label,
          title: label,
          onClick: () => setOpen((value) => !value)
        }, trigger, RemixGlyph(PsvChevronDown, 12)),
        open
          ? psv('div', {
            ref: menuRef,
            className: 'psv-menu',
            role: 'menu',
            'data-align': align,
            'aria-label': label,
            onKeyDown: onMenuKeyDown
          }, renderItems(() => setOpen(false)))
          : null)
    }

    /**
     * One selectable menu row.
     * @param {object} props - item props.
     * @param {boolean} [props.checked] - radio selection; omit for a plain item.
     * @param {boolean} [props.disabled] - disabled state.
     * @param {Function} props.onSelect - selection handler.
     * @returns {object} the menu row.
     */
    function PsvMenuItem({ checked, disabled = false, onSelect, children }) {
      return psv('button', {
        type: 'button',
        role: checked === undefined ? 'menuitem' : 'menuitemradio',
        className: 'psv-menu-item',
        'data-checked': checked === true ? 'true' : undefined,
        'aria-checked': checked === undefined ? undefined : checked ? 'true' : 'false',
        disabled,
        onClick: () => {
          if (!disabled) onSelect()
        }
      }, psv('span', null, children), checked === true ? psv('span', { className: 'psv-menu-check' }, RemixGlyph(REMIX_CHECK_LINE, 14)) : null)
    }

    /**
     * Four stat cards derived from the Host snapshot.
     * @param {object} props - stat props.
     * @returns {object} the stat grid.
     */
    function PsvStatCards({ stats, t }) {
      const truncated = stats?.truncated === true && Number.isFinite(stats.measuredSessions)
      const cards = [
        { id: 'running', icon: PsvPlayFill, tone: 'business', value: String(stats?.runningSessions ?? 0), hint: t('stat.running.hint') },
        { id: 'completedToday', icon: PsvCheckCircle, tone: 'success', value: String(stats?.completedToday ?? 0), hint: t('stat.completedToday.hint') },
        { id: 'totalRuns', icon: PsvStackLine, tone: 'business', value: String(stats?.totalRuns ?? 0), hint: t('stat.totalRuns.hint') },
        { id: 'average', icon: PsvTimerLine, tone: 'warn', value: Number.isFinite(stats?.averageDurationMs) ? psvDuration(stats.averageDurationMs, t) : t('stat.none'), hint: t('stat.average.hint') }
      ]
      return psv('div', { className: 'psv-stats', 'data-psv-stats': '' },
        cards.map((card) => psv('div', { key: card.id, className: 'psv-card psv-stat', 'data-tone': card.tone, title: card.hint },
          psv('span', { className: 'psv-stat-icon', 'aria-hidden': 'true' }, RemixGlyph(card.icon, 18)),
          psv('div', { className: 'psv-stat-body' },
            psv('span', { className: 'psv-stat-label' }, t(`stat.${card.id}`)),
            psv('span', { className: 'psv-stat-value' }, card.value)))),
        truncated
          ? psv('div', { className: 'psv-footer-note', style: { gridColumn: '1 / -1' } }, t('stat.truncated', { count: stats.measuredSessions }))
          : null)
    }

    /**
     * Project header: identity, Active badge, facts, and the three actions.
     * @param {object} props - header props.
     * @returns {object} the header card.
     */
    function PsvProjectHeader({ project, copy, nav, refresh, t }) {
      const [copied, setCopied] = React.useState(false)
      const copyTimer = React.useRef(null)
      React.useEffect(() => () => {
        if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
      }, [])
      const copyPath = async () => {
        const copiedOk = await copy(project.path)
        if (!copiedOk) return
        setCopied(true)
        if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
        copyTimer.current = window.setTimeout(() => {
          copyTimer.current = null
          setCopied(false)
        }, 1600)
      }
      const openWorkspace = () => {
        try {
          const pending = nav.openWorkspace(project.workspaceId)
          if (pending !== null && pending !== undefined && typeof pending.then === 'function') {
            pending.catch((error) => console.warn('[power-suite] open workspace failed', error !== null && typeof error === 'object' && typeof error.message === 'string' ? error.message : error))
          }
        } catch (error) {
          console.warn('[power-suite] open workspace failed', error)
        }
      }
      const newSession = () => {
        try {
          nav.startSession(project.workspaceId)
        } catch (error) {
          console.warn('[power-suite] new session failed', error)
        }
      }
      const created = psvDate(Date.parse(project.createdAt))
      const lastActive = Number.isFinite(project.lastActivityAt) ? psvRelative(project.lastActivityAt, Date.now(), t) : t('time.unknown')
      const title = project.title.length > 0 ? project.title : t('header.titleFallback')
      const badge = psv('span', { className: 'psv-badge', 'data-state': project.state === 'active' ? 'active' : 'inactive' },
        psv('span', { className: 'psv-badge-dot', 'aria-hidden': 'true' }),
        project.state === 'active' ? t('header.active') : t('header.inactive'))
      const facts = psv('div', { className: 'psv-desc', title: project.path },
        psv('code', null, project.path),
        created.length > 0 ? ` · ${t('header.created', { date: created })}` : '',
        ` · ${t('header.lastActive', { time: lastActive })}`)
      const titleWrap = psv('div', { className: 'psv-title-wrap' },
        psv('div', { className: 'psv-title-row' },
          psv('h1', { className: 'psv-title', title }, title),
          badge),
        facts)
      const openButton = psv('button', { type: 'button', className: 'psv-btn', onClick: openWorkspace },
        RemixGlyph(PsvExternalLine, 14), t('action.openWorkspace'))
      const newButton = psv('button', { type: 'button', className: 'psv-btn', 'data-variant': 'primary', onClick: newSession },
        RemixGlyph(PsvPlusLine, 14), t('action.newSession'))
      const moreMenu = psv(PsvDropdown, {
        t,
        label: t('action.more'),
        align: 'end',
        className: '',
        trigger: RemixGlyph(PsvMoreLine, 16),
        renderItems: (close) => [
          psv(PsvMenuItem, { key: 'refresh', onSelect: () => { close(); refresh() } }, t('action.refresh')),
          psv(PsvMenuItem, { key: 'copy', onSelect: () => { close(); void copyPath() } },
            copied ? t('action.copied') : t('action.copyPath'))
        ]
      })
      const actions = psv('div', { className: 'psv-actions' }, openButton, newButton, moreMenu)
      const main = psv('div', { className: 'psv-header-main' },
        psv('span', { className: 'psv-mark', 'aria-hidden': 'true' }, RemixGlyph(PsvFolderLine, 22)),
        titleWrap,
        actions)
      const toast = copied
        ? psv('div', { className: 'psv-toast', role: 'status' }, RemixGlyph(REMIX_CHECK_LINE, 13), t('action.copied'))
        : null
      return psv('div', { className: 'psv-card psv-header', 'data-psv-header': '' }, main, toast)
    }

    //#region feature: project view — overview
    /**
     * Overview tab: recent sessions, the grouping explainer, and recent activity.
     * @param {object} props - overview props.
     * @returns {object} the overview content.
     */
    function PsvOverviewTab({ snapshot, sessionsSnapshot, t, now, settings, onOpenSession, onViewAll }) {
      const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : []
      const preview = [...sessions]
        .sort((left, right) => (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0))
        .slice(0, 6)
      const project = snapshot.project ?? {}
      const windows = settings?.value ?? {}
      const days = Number.isFinite(project.activeWindowDays) ? project.activeWindowDays : windows.activeProjectDays ?? 7
      const minutes = Number.isFinite(project.recentSessionMinutes) ? project.recentSessionMinutes : windows.recentSessionMinutes ?? 120
      const activity = Array.isArray(snapshot.recentActivity) ? snapshot.recentActivity : []
      const daysLabel = days === 1 ? t('unit.daysOne') : t('unit.days', { n: days })
      const minutesLabel = minutes === 1 ? t('unit.minutesOne') : t('unit.minutes', { n: minutes })
      return psv('div', { className: 'psv-section' },
        psv('div', { className: 'psv-card psv-section' },
          psv('div', { className: 'psv-section-head', style: { padding: '14px 16px 0' } },
            psv('h2', { className: 'psv-section-title' }, t('overview.sessions.title')),
            psv('span', { className: 'psv-section-sub' }, t('overview.sessions.sub', { count: sessions.length })),
            psv('div', { className: 'psv-section-actions' },
              psv('button', { type: 'button', className: 'psv-btn', onClick: onViewAll }, t('overview.sessions.viewAll')))),
          preview.length === 0
            ? psv('div', { className: 'psv-empty' }, t('overview.sessions.empty'))
            : psv('div', { className: 'psv-list', style: { padding: '4px 6px 8px' } },
              preview.map((row) => {
                const status = psvSessionStatus(row)
                const title = psvSessionTitle(row, sessionsSnapshot, t)
                return psv('button', {
                  key: row.sessionId,
                  type: 'button',
                  className: 'psv-row',
                  onClick: () => onOpenSession(row.sessionId),
                  title
                },
                psv(PsvStatusDot, { status, label: t(`status.${status}`) }),
                psv('span', { className: 'psv-row-main' },
                  psv('span', { className: 'psv-row-title' }, title),
                  psv('span', { className: 'psv-row-meta' },
                    psv('span', null, typeof row.runCount === 'number' && row.runCount === 1 ? t('sessions.runsOne') : t('sessions.runs', { count: row.runCount ?? 0 })),
                    psv('span', null, t('sessions.updated', { time: psvRelative(row.lastActivityAt, now, t) })))),
                psv('span', { className: 'psv-row-side' },
                  psv(PsvStatusChip, { status, label: t(`status.${status}`) })))
              }))),
        psv('div', { className: 'psv-card psv-explainer' },
          psv('div', { className: 'psv-explainer-head' },
            psv('span', { className: 'psv-explainer-icon', 'aria-hidden': 'true' }, RemixGlyph(PsvActivityLine, 20)),
            psv('div', { className: 'psv-explainer-copy' },
              psv('span', { className: 'psv-explainer-title' }, t('overview.explain.title')),
              psv('span', { className: 'psv-explainer-body' }, t('overview.explain.body', { days: daysLabel, minutes: minutesLabel })))),
          psv('div', { className: 'psv-explainer-grid' },
            psv('div', { className: 'psv-explainer-step' },
              psv('span', { className: 'psv-explainer-step-title' }, t('overview.explain.activity.title')),
              psv('span', { className: 'psv-explainer-step-body' }, t('overview.explain.activity.body'))),
            psv('div', { className: 'psv-explainer-step' },
              psv('span', { className: 'psv-explainer-step-title' }, t('overview.explain.grouping.title')),
              psv('span', { className: 'psv-explainer-step-body' }, t('overview.explain.grouping.body'))),
            psv('div', { className: 'psv-explainer-step' },
              psv('span', { className: 'psv-explainer-step-title' }, t('overview.explain.archive.title')),
              psv('span', { className: 'psv-explainer-step-body' }, t('overview.explain.archive.body'))))),
        psv('div', { className: 'psv-card psv-section' },
          psv('div', { className: 'psv-section-head', style: { padding: '14px 16px 0' } },
            psv('h2', { className: 'psv-section-title' }, t('overview.activity.title'))),
          activity.length === 0
            ? psv('div', { className: 'psv-empty' }, t('overview.activity.empty'))
            : psv('div', { className: 'psv-activity', style: { padding: '4px 8px 8px' } },
              activity.map((row, index) => {
                const kind = typeof row.kind === 'string' ? row.kind : 'session-updated'
                const title = psvSessionTitle(row, sessionsSnapshot, t)
                const detail = typeof row.detail === 'string' && /^turn \d+$/.test(row.detail)
                  ? t('activity.turn', { turn: row.detail.slice(5) })
                  : t(`activity.kind.${kind}`)
                const kindIcon = kind === 'run-failed' ? PsvActivityLine : kind === 'session-updated' ? PsvFolderLine : kind === 'run-interrupted' ? PsvTimerLine : PsvCheckCircle
                return psv('div', { key: `${kind}:${row.sessionId}:${index}`, className: 'psv-activity-row' },
                  psv('span', { className: 'psv-activity-kind', 'data-kind': kind, 'aria-hidden': 'true' }, RemixGlyph(kindIcon, 15)),
                  psv('span', { className: 'psv-activity-main' },
                    psv('span', { className: 'psv-activity-title' }, title),
                    psv('span', { className: 'psv-activity-meta' }, detail)),
                  psv('span', { className: 'psv-activity-time', title: psvExact(row.at) }, psvRelative(row.at, now, t)))
              }))))
    }
    //#endregion

    //#region feature: project view — sessions
    /**
     * Sessions tab: status filter counts, title search, and the full session list.
     * @param {object} props - sessions props.
     * @returns {object} the sessions content.
     */
    function PsvSessionsTab({ snapshot, sessionsSnapshot, t, now, onOpenSession }) {
      const [filter, setFilter] = React.useState('all')
      const [query, setQuery] = React.useState('')
      const rows = Array.isArray(snapshot.sessions) ? snapshot.sessions : []
      const counted = rows.map((row) => ({ row, status: psvSessionStatus(row) }))
      const counts = {
        all: counted.length,
        running: counted.filter((entry) => entry.status === 'running').length,
        completed: counted.filter((entry) => entry.status === 'completed').length,
        interrupted: counted.filter((entry) => entry.status === 'interrupted').length
      }
      const needle = query.trim().toLowerCase()
      const filtered = counted.filter((entry) => {
        if (filter !== 'all' && entry.status !== filter) return false
        if (needle.length === 0) return true
        return psvSessionTitle(entry.row, sessionsSnapshot, t).toLowerCase().includes(needle)
      })
      filtered.sort((left, right) => {
        if (left.status === 'running' && right.status !== 'running') return -1
        if (right.status === 'running' && left.status !== 'running') return 1
        return (right.row.lastActivityAt ?? 0) - (left.row.lastActivityAt ?? 0)
      })
      const chips = ['all', 'running', 'completed', 'interrupted']
      return psv('div', { className: 'psv-card psv-section', 'data-psv-sessions': '' },
        psv('div', { className: 'psv-section-head', style: { padding: '14px 16px 0' } },
          psv('h2', { className: 'psv-section-title' }, t('overview.sessions.title')),
          psv('span', { className: 'psv-section-sub' }, t('overview.sessions.sub', { count: rows.length }))),
        psv('div', { className: 'psv-filterbar', style: { padding: '8px 16px 4px' } },
          psv('div', { className: 'psv-chips', role: 'group', 'aria-label': t('overview.sessions.title') },
            chips.map((id) => psv('button', {
              key: id,
              type: 'button',
              className: 'psv-chip',
              'data-active': filter === id ? 'true' : 'false',
              'aria-pressed': filter === id ? 'true' : 'false',
              onClick: () => setFilter(id)
            }, t(`sessions.filter.${id}`), psv('span', { className: 'psv-chip-count' }, String(counts[id] ?? 0))))),
          psv('label', { className: 'psv-search' },
            RemixGlyph(REMIX_SEARCH_LINE, 13),
            psv('input', {
              type: 'text',
              value: query,
              placeholder: t('sessions.search.placeholder'),
              'aria-label': t('sessions.search.aria'),
              autoComplete: 'off',
              spellCheck: false,
              onChange: (event) => setQuery(event.target.value)
            }))),
        filtered.length === 0
          ? psv('div', { className: 'psv-empty' }, t('sessions.empty'))
          : psv('div', { className: 'psv-list', style: { padding: '2px 6px 8px' } },
            filtered.map(({ row }) => {
              const status = psvSessionStatus(row)
              const title = psvSessionTitle(row, sessionsSnapshot, t)
              return psv('button', {
                key: row.sessionId,
                type: 'button',
                className: 'psv-row',
                title,
                onClick: () => onOpenSession(row.sessionId)
              },
              psv(PsvStatusDot, { status, label: t(`status.${status}`) }),
              psv('span', { className: 'psv-row-main' },
                psv('span', { className: 'psv-row-title' }, title),
                psv('span', { className: 'psv-row-meta' },
                  psv('span', null, (row.runCount ?? 0) === 1 ? t('sessions.runsOne') : t('sessions.runs', { count: row.runCount ?? 0 })),
                  psv('span', null, t('sessions.updated', { time: psvRelative(row.lastActivityAt, now, t) })),
                  row.origin === 'subagent' ? psv('span', null, t('sessions.subagent')) : null)),
              psv('span', { className: 'psv-row-side' },
                psv(PsvStatusChip, { status, label: t(`status.${status}`) })))
            })))
    }
    //#endregion

    //#region feature: project view — runs
    /**
     * Jobs folded under one expanded run.
     * @param {object} props - jobs props.
     * @returns {object | null} the nested job rows.
     */
    function PsvRunJobs({ run, t }) {
      const jobs = Array.isArray(run.jobs) ? run.jobs : []
      if (jobs.length === 0) return psv('div', { className: 'psv-jobs' }, psv('div', { className: 'psv-jobs-note' }, t('runs.jobsEmpty')))
      return psv('div', { className: 'psv-jobs', role: 'group', 'aria-label': t('runs.turn', { turn: run.turn }) },
        jobs.map((job) => psv('div', { key: job.jobId, className: 'psv-job', title: `${job.label}${job.detail !== null && job.detail !== undefined ? ` — ${job.detail}` : ''}` },
          psv('span', { className: 'psv-job-kind' }, job.kind ?? 'job'),
          psv('span', { className: 'psv-job-label' }, job.label !== undefined && job.label.length > 0 ? job.label : job.jobId),
          psv('span', { className: 'psv-job-status' }, psv(PsvStatusChip, { status: job.status === 'killed' ? 'stopped' : job.status === 'failed' ? 'failed' : job.status === 'running' ? 'running' : 'completed', label: t(`status.${job.status === 'killed' ? 'stopped' : job.status === 'failed' ? 'failed' : job.status === 'running' ? 'running' : 'completed'}`) })),
          psv('span', { className: 'psv-job-meta' }, psvDuration(job.durationMs, t)),
          job.detail !== null && job.detail !== undefined && job.detail.length > 0
            ? psv('span', { className: 'psv-job-detail' }, job.detail)
            : null)),
        run.jobCount > jobs.length
          ? psv('div', { className: 'psv-jobs-note' }, t('runs.jobsCapped', { shown: jobs.length, total: run.jobCount }))
          : null)
    }

    /**
     * Runs tab: the combined turn record with nested job rows, status/session
     * filters, a text search, and a job-visibility toggle.
     * @param {object} props - runs props.
     * @returns {object} the runs content.
     */
    function PsvRunsTab({ snapshot, sessionsSnapshot, t, now }) {
      const [status, setStatus] = React.useState('all')
      const [sessionFilter, setSessionFilter] = React.useState('all')
      const [includeJobs, setIncludeJobs] = React.useState(true)
      const [query, setQuery] = React.useState('')
      const [expanded, setExpanded] = React.useState(() => new Set())
      const [visible, setVisible] = React.useState(PROJECT_VIEW_RUN_PAGE)
      const runs = Array.isArray(snapshot.runs) ? snapshot.runs : []
      const statuses = psvRunStatuses()
      const counts = { all: runs.length }
      for (const id of statuses) counts[id] = runs.filter((run) => run.status === id).length
      const needle = query.trim().toLowerCase()
      const sessionRows = [...(Array.isArray(snapshot.sessions) ? snapshot.sessions : [])]
        .sort((left, right) => (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0))
      const filtered = runs.filter((run) => {
        if (status !== 'all' && run.status !== status) return false
        if (sessionFilter !== 'all' && run.sessionId !== sessionFilter) return false
        if (needle.length === 0) return true
        const title = psvSessionTitle({ ...run, sessionId: run.sessionId, title: run.sessionTitle }, sessionsSnapshot, t).toLowerCase()
        if (title.includes(needle)) return true
        if (`turn ${run.turn}`.includes(needle)) return true
        return Array.isArray(run.jobs) && run.jobs.some((job) => typeof job.label === 'string' && job.label.toLowerCase().includes(needle))
      })
      const shownRuns = filtered.slice(0, visible)
      const hasRunning = filtered.some((run) => run.status === 'running')
      const tick = usePsvNow(hasRunning ? 1000 : 30000)
      const currentNow = Math.max(now, tick)
      const toggleRun = (runId) => {
        setExpanded((previous) => {
          const next = new Set(previous)
          if (next.has(runId)) next.delete(runId)
          else next.add(runId)
          return next
        })
      }
      const sessionLabel = sessionFilter === 'all'
        ? t('runs.sessionFilter.all')
        : psvSessionTitle(sessionRows.find((row) => row.sessionId === sessionFilter) ?? null, sessionsSnapshot, t)
      return psv('div', { className: 'psv-card psv-section', 'data-psv-runs': '' },
        psv('div', { className: 'psv-section-head', style: { padding: '14px 16px 0' } },
          psv('h2', { className: 'psv-section-title' }, t('tab.runs')),
          psv('span', { className: 'psv-section-sub' }, t('sessions.runs', { count: filtered.length }))),
        psv('div', { className: 'psv-filterbar', style: { padding: '8px 16px 4px' } },
          psv('div', { className: 'psv-chips', role: 'group', 'aria-label': t('tab.runs') },
            ['all', ...statuses].map((id) => psv('button', {
              key: id,
              type: 'button',
              className: 'psv-chip',
              'data-active': status === id ? 'true' : 'false',
              'aria-pressed': status === id ? 'true' : 'false',
              onClick: () => {
                setStatus(id)
                setVisible(PROJECT_VIEW_RUN_PAGE)
              }
            }, t(`runs.filter.${id}`), psv('span', { className: 'psv-chip-count' }, String(counts[id] ?? 0))))),
          psv(PsvDropdown, {
            t,
            label: t('runs.sessionFilter.label'),
            trigger: psv('span', null, sessionLabel),
            renderItems: (close) => [
              psv(PsvMenuItem, {
                key: 'all',
                checked: sessionFilter === 'all',
                onSelect: () => {
                  setSessionFilter('all')
                  setVisible(PROJECT_VIEW_RUN_PAGE)
                  close()
                }
              }, t('runs.sessionFilter.all')),
              ...sessionRows.map((row) => psv(PsvMenuItem, {
                key: row.sessionId,
                checked: sessionFilter === row.sessionId,
                onSelect: () => {
                  setSessionFilter(row.sessionId)
                  setVisible(PROJECT_VIEW_RUN_PAGE)
                  close()
                }
              }, psvSessionTitle(row, sessionsSnapshot, t)))
            ]
          }),
          psv('label', { className: 'psv-toggle', title: t('runs.includeJobs.hint') },
            psv('input', {
              type: 'checkbox',
              checked: includeJobs,
              onChange: (event) => setIncludeJobs(event.target.checked)
            }),
            t('runs.includeJobs')),
          psv('label', { className: 'psv-search' },
            RemixGlyph(REMIX_SEARCH_LINE, 13),
            psv('input', {
              type: 'text',
              value: query,
              placeholder: t('runs.search.placeholder'),
              'aria-label': t('runs.search.aria'),
              autoComplete: 'off',
              spellCheck: false,
              onChange: (event) => {
                setQuery(event.target.value)
                setVisible(PROJECT_VIEW_RUN_PAGE)
              }
            }))),
        filtered.length === 0
          ? psv('div', { className: 'psv-empty' }, t('runs.empty'))
          : psv('div', { className: 'psv-list', style: { padding: '2px 6px 4px' } },
            shownRuns.map((run) => {
              const open = expanded.has(run.id)
              const sessionTitle = psvSessionTitle({ sessionId: run.sessionId, title: run.sessionTitle }, sessionsSnapshot, t)
              const duration = Number.isFinite(run.endedAt) && Number.isFinite(run.startedAt)
                ? run.endedAt - run.startedAt
                : Number.isFinite(run.startedAt) && run.status === 'running'
                  ? currentNow - run.startedAt
                  : null
              const expandable = includeJobs && (run.jobCount > 0)
              return psv('div', { key: run.id, className: 'psv-run', 'data-open': open ? 'true' : 'false', 'data-status': run.status },
                psv('button', {
                  type: 'button',
                  className: 'psv-run-head',
                  'aria-expanded': expandable ? (open ? 'true' : 'false') : undefined,
                  'aria-label': expandable
                    ? open ? t('runs.collapse', { turn: run.turn }) : t('runs.expand', { turn: run.turn })
                    : t('runs.turn', { turn: run.turn }),
                  onClick: expandable ? () => toggleRun(run.id) : undefined
                },
                expandable ? psv(PsvRunChevron, { open }) : psv('span', { className: 'psv-run-chevron', 'aria-hidden': 'true' }),
                psv(PsvStatusDot, { status: run.status, label: t(`status.${run.status}`) }),
                psv('span', { className: 'psv-run-main' },
                  psv('span', { className: 'psv-run-title' },
                    psv('span', { className: 'psv-run-session' }, sessionTitle),
                    psv('span', { className: 'psv-run-turn' }, t('runs.turn', { turn: run.turn }))),
                  psv('span', { className: 'psv-run-meta' },
                    psv('span', { title: psvExact(run.startedAt) }, t('runs.started', { time: psvRelative(run.startedAt, currentNow, t) })),
                    psv('span', null, (run.toolCalls ?? 0) === 1 ? t('runs.toolCallsOne') : t('runs.toolCalls', { count: run.toolCalls ?? 0 })),
                    psv('span', null, (run.jobCount ?? 0) === 1 ? t('runs.jobsOne') : t('runs.jobs', { count: run.jobCount ?? 0 })))),
                psv('span', { className: 'psv-run-side' },
                  psv(PsvStatusChip, { status: run.status, label: t(`status.${run.status}`) }),
                  psv('span', { title: psvExact(run.endedAt) }, psvDuration(duration, t)))),
                open && includeJobs ? psv(PsvRunJobs, { run, t }) : null)
            })),
        visible < filtered.length
          ? psv('div', { className: 'psv-loadmore' },
            psv('button', {
              type: 'button',
              className: 'psv-btn',
              onClick: () => setVisible((value) => value + PROJECT_VIEW_RUN_PAGE)
            }, t('runs.more', { count: Math.min(PROJECT_VIEW_RUN_PAGE, filtered.length - visible) })))
          : null,
        snapshot.limits !== undefined && snapshot.limits.runsTruncated === true
          ? psv('div', { className: 'psv-footer-note' }, t('runs.capped', {
            shown: runs.length,
            total: Number.isFinite(snapshot.limits.totalRunsMeasured) ? snapshot.limits.totalRunsMeasured : runs.length
          }))
          : null)
    }
    //#endregion

    //#region feature: project view — settings
    /**
     * Settings tab: the Workspace default preset, the read-only grouping
     * windows, the Workspace path, and the open action.
     * @param {object} props - settings props.
     * @returns {object} the settings content.
     */
    function PsvSettingsTab({ snapshot, t, presetRoster, presetRead, presetWrite, presetName, nav }) {
      const project = snapshot.project ?? {}
      const workspaceId = project.workspaceId
      const settings = React.useSyncExternalStore(subscribeSettings, settingsSnapshot, settingsSnapshot)
      const [roster, setRoster] = React.useState({ status: 'loading', presets: [] })
      const [current, setCurrent] = React.useState(undefined)
      const [saving, setSaving] = React.useState(false)
      const [error, setError] = React.useState(false)
      const [saved, setSaved] = React.useState(false)
      React.useEffect(() => {
        void loadSettings()
      }, [])
      React.useEffect(() => {
        let cancelled = false
        const controller = new AbortController()
        setRoster({ status: 'loading', presets: [] })
        setCurrent(undefined)
        Promise.all([presetRoster(), presetRead(workspaceId, controller.signal)])
          .then(([result, stored]) => {
            if (cancelled) return
            if (result.ok !== true) {
              setRoster({ status: 'error', presets: [] })
              return
            }
            setRoster({ status: 'ready', presets: Array.isArray(result.presets) ? result.presets : [] })
            setCurrent(typeof stored === 'string' ? stored : null)
          })
          .catch(() => {
            if (!cancelled) setRoster({ status: 'error', presets: [] })
          })
        return () => {
          cancelled = true
          controller.abort()
        }
      }, [workspaceId])
      const savePreset = async (preset) => {
        if (saving) return
        setSaving(true)
        setError(false)
        setSaved(false)
        try {
          await presetWrite(workspaceId, preset)
          setCurrent(preset)
          setSaved(true)
          window.setTimeout(() => setSaved(false), 1600)
        } catch {
          setError(true)
        } finally {
          setSaving(false)
        }
      }
      const presets = roster.presets
      const currentRow = current === null || current === undefined ? undefined : presets.find((preset) => preset.id === current)
      const currentLabel = current === undefined
        ? t('settings.preset.loading')
        : current === null
          ? t('settings.preset.global')
          : currentRow === undefined ? current : presetName(currentRow)
      const values = settings !== null && settings !== undefined && settings.value !== null && settings.value !== undefined ? settings.value : DEFAULT_SETTINGS
      const days = Number.isFinite(project.activeWindowDays) ? project.activeWindowDays : values.activeProjectDays
      const minutes = Number.isFinite(project.recentSessionMinutes) ? project.recentSessionMinutes : values.recentSessionMinutes
      const daysLabel = days === 1 ? t('unit.daysOne') : t('unit.days', { n: days })
      const minutesLabel = minutes === 1 ? t('unit.minutesOne') : t('unit.minutes', { n: minutes })
      const openWorkspace = () => {
        try {
          const pending = nav.openWorkspace(workspaceId)
          if (pending !== null && pending !== undefined && typeof pending.then === 'function') {
            pending.catch((error) => console.warn('[power-suite] open workspace failed', error !== null && typeof error === 'object' && typeof error.message === 'string' ? error.message : error))
          }
        } catch (failure) {
          console.warn('[power-suite] open workspace failed', failure)
        }
      }
      return psv('div', { className: 'psv-settings', 'data-psv-settings': '' },
        psv('div', { className: 'psv-card psv-field' },
          psv('span', { className: 'psv-field-label' }, t('settings.preset.title')),
          psv('span', { className: 'psv-field-hint' }, t('settings.preset.hint')),
          roster.status === 'loading'
            ? psv('span', { className: 'psv-field-hint' }, t('settings.preset.loading'))
            : roster.status === 'error'
              ? psv('span', { className: 'psv-error-text' }, t('settings.preset.unavailable'))
              : psv('div', { className: 'psv-field-row' },
                psv(PsvDropdown, {
                  t,
                  label: t('settings.preset.title'),
                  trigger: psv('span', null, currentLabel),
                  renderItems: (close) => [
                    psv(PsvMenuItem, {
                      key: 'global',
                      checked: current === null,
                      onSelect: () => {
                        close()
                        void savePreset(null)
                      }
                    }, t('settings.preset.global')),
                    ...presets.map((preset) => psv(PsvMenuItem, {
                      key: preset.id,
                      checked: current === preset.id,
                      disabled: preset.broken !== undefined,
                      onSelect: () => {
                        close()
                        void savePreset(preset.id)
                      }
                    }, presetName(preset)))
                  ]
                }),
                saving ? psv('span', { className: 'psv-field-hint' }, t('state.loading')) : null,
                saved ? psv('span', { className: 'psv-toast', role: 'status' }, RemixGlyph(REMIX_CHECK_LINE, 13), t('settings.preset.saved')) : null,
                error ? psv('span', { className: 'psv-error-text', role: 'alert' }, t('settings.preset.saveFailed')) : null)),
        psv('div', { className: 'psv-card psv-field' },
          psv('span', { className: 'psv-field-label' }, t('settings.windows.title')),
          psv('span', { className: 'psv-field-hint' }, t('settings.windows.body', { minutes: minutesLabel, days: daysLabel }))),
        psv('div', { className: 'psv-card psv-field' },
          psv('span', { className: 'psv-field-label' }, t('settings.path.title')),
          psv('div', { className: 'psv-field-row' },
            psv('span', { className: 'psv-path' }, RemixGlyph(PsvFolderLine, 14), psv('span', { className: 'psv-path-text' }, project.path)),
            psv('button', {
              type: 'button',
              className: 'psv-btn',
              onClick: () => {
                void copyText(project.path)
              }
            }, RemixGlyph(REMIX_FILE_COPY_LINE, 14), t('action.copyPath')),
            psv('button', { type: 'button', className: 'psv-btn', onClick: openWorkspace },
              RemixGlyph(PsvExternalLine, 14), t('action.openWorkspace')))))
    }
    //#endregion

    /**
     * The standalone Project page body: the four-tab project detail rendered
     * inside the fixed page surface the seat positions over the conversation
     * column. Every navigation action closes the page afterwards so the user
     * lands on the Session/Workspace the action opened instead of on a page
     * hiding the change.
     * @param {object} props - page services, Workspace target, and close callback.
     * @returns {object} the Project page element.
     */
    function ProjectPage(props) {
      const t = props.t
      const workspaceId = typeof props.workspaceId === 'string' ? props.workspaceId : ''
      const { state, refreshing, refresh } = usePsvProject(workspaceId)
      const sessionsSnapshot = usePsvSessions(props.sessionsSource)
      const now = usePsvNow(15000)
      // Page-level state (tab, filters, searches, expanded rows) intentionally
      // survives Workspace switches: this component instance stays mounted and
      // only the data hook follows `workspaceId`. Documented as intended UX.
      const [tab, setTab] = React.useState('overview')
      const snapshot = state.snapshot
      const close = props.onClose
      const navigation = React.useMemo(() => {
        const run = (action) => {
          try {
            return action()
          } catch (error) {
            console.warn('[power-suite] project page navigation failed', error)
            return undefined
          }
        }
        return {
          openSession: (sessionId) => {
            run(() => props.uiWorkspace.openSession(sessionId))
            close()
          },
          openWorkspace: (id) => {
            // Fire-and-forget UI navigation: hand the promise back so the
            // header/settings callers can attach their rejection guard.
            const pending = run(() => props.uiWorkspace.openWorkspace(id))
            close()
            return pending
          },
          startSession: (id) => {
            run(() => props.uiWorkspace.startSession(id))
            close()
          }
        }
      }, [close, props.uiWorkspace])
      const settingsValue = React.useSyncExternalStore(subscribeSettings, settingsSnapshot, settingsSnapshot)
      const tabs = [
        { id: 'overview', key: 'tab.overview' },
        { id: 'sessions', key: 'tab.sessions' },
        { id: 'runs', key: 'tab.runs' },
        { id: 'settings', key: 'tab.settings' }
      ]
      const tabRefs = React.useRef([])
      const onTabKeyDown = (event) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
        if (!keys.includes(event.key)) return
        event.preventDefault()
        const index = tabs.findIndex((entry) => entry.id === tab)
        let next = 0
        if (event.key === 'ArrowLeft') next = index <= 0 ? tabs.length - 1 : index - 1
        else if (event.key === 'ArrowRight') next = index < 0 ? 0 : (index + 1) % tabs.length
        else if (event.key === 'End') next = tabs.length - 1
        setTab(tabs[next].id)
        const target = tabRefs.current[next]
        if (target instanceof HTMLElement) target.focus()
      }
      const project = snapshot !== null && snapshot !== undefined ? snapshot.project : null
      const pageTitle = project !== null && typeof project.title === 'string' && project.title.length > 0
        ? project.title
        : (typeof props.workspaceTitle === 'string' && props.workspaceTitle.length > 0
          ? props.workspaceTitle
          : t('header.titleFallback'))
      const pageBar = psv('div', { className: 'psv-page-bar' },
        psv('button', {
          type: 'button',
          className: 'psv-iconbtn psv-page-back',
          'aria-label': t('page.close'),
          title: t('page.close'),
          onClick: close
        }, RemixGlyph(PsvChevronLeftLine, 18)),
        psv('span', { className: 'psv-page-title', title: pageTitle }, pageTitle),
        project !== null && project.state !== undefined
          ? psv('span', { className: 'psv-badge', 'data-state': project.state === 'active' ? 'active' : 'inactive' },
            psv('span', { className: 'psv-badge-dot', 'aria-hidden': 'true' }),
            project.state === 'active' ? t('header.active') : t('header.inactive'))
          : null,
        psv('span', { className: 'psv-page-spacer' }),
        psv('div', { className: 'psv-tabbar-actions' },
          psv('button', {
            type: 'button',
            className: 'psv-iconbtn',
            'aria-label': t('action.refresh'),
            title: t('action.refresh'),
            'data-busy': refreshing ? 'true' : undefined,
            disabled: refreshing,
            onClick: refresh
          }, RemixGlyph(REMIX_REFRESH_LINE, 15))))
      const tabBar = psv('div', { className: 'psv-tabbar' },
        psv('div', { className: 'psv-tabs', role: 'tablist', 'aria-label': t('tabs.label'), onKeyDown: onTabKeyDown },
          tabs.map((entry, index) => psv('button', {
            key: entry.id,
            ref: (node) => {
              tabRefs.current[index] = node
            },
            id: `psv-tab-${entry.id}`,
            type: 'button',
            role: 'tab',
            className: 'psv-tab',
            'aria-selected': tab === entry.id ? 'true' : 'false',
            'aria-controls': `psv-panel-${entry.id}`,
            tabIndex: tab === entry.id ? 0 : -1,
            onClick: () => setTab(entry.id)
          }, t(entry.key)))))
      let content = null
      if (state.status === 'loading') {
        content = psv('div', { className: 'psv-card psv-state', role: 'status' },
          psv('span', { className: 'psv-state-title' }, t('state.loading')),
          psv(StateDot, { state: 'ongoing', size: 10 }))
      } else if (state.status === 'empty') {
        content = psv('div', { className: 'psv-card psv-state' },
          psv('span', { className: 'psv-state-title' }, t('state.empty.title')),
          psv('span', { className: 'psv-state-body' }, t('state.empty.hint')),
          psv('button', { type: 'button', className: 'psv-btn', onClick: close }, t('page.close')))
      } else if (state.status === 'error') {
        content = psv('div', { className: 'psv-card psv-state' },
          psv('span', { className: 'psv-state-title' }, t('state.error')),
          psv('button', { type: 'button', className: 'psv-btn', onClick: refresh }, t('state.retry')))
      } else if (snapshot !== null) {
        const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : []
        let panel = null
        if (tab === 'overview') {
          panel = psv(PsvOverviewTab, {
            snapshot,
            sessionsSnapshot,
            t,
            now,
            settings: settingsValue,
            onOpenSession: navigation.openSession,
            onViewAll: () => setTab('sessions')
          })
        } else if (tab === 'sessions') {
          panel = psv(PsvSessionsTab, { snapshot, sessionsSnapshot, t, now, onOpenSession: navigation.openSession })
        } else if (tab === 'runs') {
          panel = psv(PsvRunsTab, { snapshot, sessionsSnapshot, t, now })
        } else {
          panel = psv(PsvSettingsTab, {
            snapshot,
            t,
            nav: navigation,
            presetRoster: props.presetRoster,
            presetRead: props.presetRead,
            presetWrite: props.presetWrite,
            presetName: props.presetName
          })
        }
        content = psv('div', { className: 'psv-inner' },
          psv(PsvProjectHeader, {
            project: snapshot.project,
            copy: props.copy,
            nav: navigation,
            refresh,
            t
          }),
          psv(PsvStatCards, { stats: snapshot.stats, t }),
          warnings.length > 0
            ? psv('div', { className: 'psv-note', role: 'status' }, t('settings.warnings', { count: warnings.length }))
            : null,
          psv('div', { id: `psv-panel-${tab}`, role: 'tabpanel', 'aria-labelledby': `psv-tab-${tab}`, tabIndex: -1 }, panel))
      }
      return psv('div', { className: 'psv-root', 'data-psv-root': '' },
        psv('style', null, PROJECT_VIEW_CSS),
        pageBar,
        tabBar,
        psv('div', { className: 'psv-scroll' }, content))
    }

    //#region feature: project view — sidebar entry
    /** Attribute-value prefix of one sidebar Workspace row. */
    const PROJECT_WORKSPACE_ROW_PREFIX = 'workspace:'

    /** Pointer movement above this many CSS pixels counts as a drag, not a click. */
    const PROJECT_WORKSPACE_DRAG_SLOP = 6

    /**
     * Whether one click target belongs to a control the native Workspace row
     * owns: fold chevron, row actions, generic buttons/links/editables, or a
     * nested Session row. Those clicks must never open the Project page.
     * @param {unknown} target - click target.
     * @returns {boolean} whether the click stays native.
     */
    function projectWorkspaceRowControl(target) {
      if (!(target instanceof Element)) return true
      if (target.closest('[data-row-key^="session:"]') !== null) return true
      return target.closest('[data-context-menu-trigger], button, a, input, select, textarea, [role="button"], [role="tab"], [contenteditable="true"], [class*="rowActions"], [class*="chevron"]') !== null
    }

    /**
     * The Client Workspace service, read lazily because this feature does not
     * declare it as a hard dependency: a deployment whose Workspace UI is
     * absent must still load the rest of the suite.
     * @param {object} ctx - client root context.
     * @returns {object | undefined} the Workspace service.
     */
    function projectWorkspacesService(ctx) {
      if (typeof ctx.get !== 'function') return undefined
      try {
        return ctx.get('workspaces')
      } catch {
        return undefined
      }
    }

    /**
     * Install the sidebar Workspace-row entry: one document-level capture click
     * handler that turns a plain click on a Workspace row (title/folder area)
     * into opening this Workspace's standalone Project page. Chevron folds, row
     * action buttons, Session rows, drags, modified clicks, and non-primary
     * buttons stay fully native. A touch/no-hover tap on the title/folder area is
     * intentionally the page entry; only the native small chevron folds the
     * Workspace. Opening the page changes neither the current Session nor the
     * conversation view: the handler only dispatches PROJECT_PAGE_EVENT and the
     * shell.overlay seat reacts to it.
     * @param {object} ctx - client root context.
     * @returns {Function} cleanup.
     */
    function installProjectWorkspaceEntry(ctx) {
      let pressed = null
      let dragged = false
      const resetPress = () => {
        pressed = null
        dragged = false
      }
      const onPointerDown = (event) => {
        if (event.button !== 0) {
          resetPress()
          return
        }
        pressed = { x: event.clientX, y: event.clientY }
        dragged = false
      }
      const onPointerMove = (event) => {
        if (pressed === null || dragged) return
        if (Math.abs(event.clientX - pressed.x) > PROJECT_WORKSPACE_DRAG_SLOP
          || Math.abs(event.clientY - pressed.y) > PROJECT_WORKSPACE_DRAG_SLOP) dragged = true
      }
      const onDragStart = () => {
        dragged = true
      }
      const onClick = (event) => {
        const start = pressed
        const wasDragged = dragged
        resetPress()
        if (wasDragged || event.button !== 0) return
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
        if (event.detail > 0 && start !== null
          && (Math.abs(event.clientX - start.x) > PROJECT_WORKSPACE_DRAG_SLOP
            || Math.abs(event.clientY - start.y) > PROJECT_WORKSPACE_DRAG_SLOP)) return
        if (projectWorkspaceRowControl(event.target)) return
        const row = event.target instanceof Element
          ? event.target.closest(`[data-row-key^="${PROJECT_WORKSPACE_ROW_PREFIX}"]`)
          : null
        if (!(row instanceof HTMLElement)) return
        const key = row.getAttribute('data-row-key') ?? ''
        const workspaceId = key.slice(PROJECT_WORKSPACE_ROW_PREFIX.length)
        if (workspaceId.length === 0) return
        // Keep the native row behavior when the services this feature needs are
        // absent, instead of swallowing the click for nothing.
        if (ctx.uiWorkspace === undefined) return
        const workspacesService = projectWorkspacesService(ctx)
        if (workspacesService?.list === undefined) return
        let known = false
        try {
          const snapshot = workspacesService.list.getSnapshot()
          const items = snapshot !== null && snapshot !== undefined && Array.isArray(snapshot.items) ? snapshot.items : []
          known = items.some((item) => item !== null && typeof item === 'object' && item.workspaceId === workspaceId)
        } catch {
          known = false
        }
        if (!known) return
        event.preventDefault()
        event.stopPropagation()
        window.dispatchEvent(new CustomEvent(PROJECT_PAGE_EVENT, { detail: { workspaceId } }))
      }
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('pointermove', onPointerMove, true)
      document.addEventListener('dragstart', onDragStart, true)
      document.addEventListener('click', onClick, true)
      return () => {
        document.removeEventListener('pointerdown', onPointerDown, true)
        document.removeEventListener('pointermove', onPointerMove, true)
        document.removeEventListener('dragstart', onDragStart, true)
        document.removeEventListener('click', onClick, true)
      }
    }
    //#endregion

    //#region feature: project view — standalone page
    /**
     * Resolve one Workspace's display title from the live Workspace snapshot so
     * the page top bar can show it before its own snapshot loads. Fail-soft: a
     * missing Workspace service or row just yields null and the page falls back
     * to the loaded snapshot's title.
     * @param {object} ctx - client root context.
     * @param {string} workspaceId - Workspace identity.
     * @returns {string | null} the title, or null when unavailable.
     */
    function projectWorkspaceTitle(ctx, workspaceId) {
      const workspaces = projectWorkspacesService(ctx)
      if (workspaces?.list === undefined) return null
      try {
        const snapshot = workspaces.list.getSnapshot()
        const items = snapshot !== null && snapshot !== undefined && Array.isArray(snapshot.items) ? snapshot.items : []
        const workspace = items.find((item) => item !== null && typeof item === 'object' && item.workspaceId === workspaceId)
        return workspace !== undefined && typeof workspace.title === 'string' && workspace.title.length > 0
          ? workspace.title
          : null
      } catch {
        return null
      }
    }

    /** Fallback page area used before the first measurement lands. */
    function fallbackProjectPageArea() {
      return { left: 0, top: 0, width: Math.max(0, window.innerWidth), height: Math.max(0, window.innerHeight) }
    }

    /**
     * Measure the content area right of the left Workspaces sidebar.
     *
     * The sidebar slot (`[data-slot="sidebar"]`, the same shell contract the
     * suite's other decorations use) renders as `display: contents`; its first
     * element child is the docked box that owns the visible width. A zero-width
     * or absent sidebar (hidden/rail-less layout) puts the page at the viewport
     * left edge instead. The page always ends at the viewport's right edge, so an
     * open right sidebar and the history rails stay covered.
     * @returns {{ left: number, top: number, width: number, height: number }} page geometry.
     */
    function measureProjectPageArea() {
      const viewportWidth = Math.max(0, window.innerWidth)
      const viewportHeight = Math.max(0, window.innerHeight)
      const slot = document.querySelector('[data-slot="sidebar"]')
      let sidebarRight = 0
      if (slot !== null) {
        let box = slot
        let rect = box.getBoundingClientRect()
        if (!(rect.width > 0) && slot.firstElementChild !== null) {
          box = slot.firstElementChild
          rect = box.getBoundingClientRect()
        }
        if (rect.width > 0) sidebarRight = Math.round(rect.right)
      }
      const left = Math.max(0, Math.min(sidebarRight, viewportWidth))
      return {
        left,
        top: 0,
        width: Math.max(0, viewportWidth - left),
        height: viewportHeight
      }
    }

    /**
     * Keep the page aligned with the content area right of the left sidebar.
     *
     * Re-measures through one rAF-coalesced callback driven by a ResizeObserver
     * on the sidebar slot, its docked child, and their container (expand,
     * rail/collapse, hide), plus window resize and a scoped MutationObserver for
     * a replaced sidebar subtree. A light interval only covers CSS transitions
     * that resize without observer callbacks; state updates are identity-guarded
     * so it cannot re-render needlessly. Everything is cleaned up on close.
     * @param {boolean} open - whether the page is open.
     * @returns {{ left: number, top: number, width: number, height: number }} current page geometry.
     */
    function useProjectPageArea(open) {
      const [area, setArea] = React.useState(() => fallbackProjectPageArea())
      React.useEffect(() => {
        if (!open) return undefined
        let disposed = false
        let frame = null
        const apply = () => {
          frame = null
          if (disposed) return
          const next = measureProjectPageArea()
          setArea((previous) => previous.left === next.left
            && previous.top === next.top
            && previous.width === next.width
            && previous.height === next.height
            ? previous
            : next)
        }
        const schedule = () => {
          if (frame === null) frame = window.requestAnimationFrame(apply)
        }
        schedule()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
        const observed = new Set()
        const observeSidebar = () => {
          if (observer === null) return
          const slot = document.querySelector('[data-slot="sidebar"]')
          for (const target of [slot, slot?.firstElementChild ?? null, slot?.parentElement ?? null]) {
            if (target === null || observed.has(target)) continue
            observed.add(target)
            observer.observe(target)
          }
          const body = document.body
          if (body !== null && !observed.has(body)) {
            observed.add(body)
            observer.observe(body)
          }
        }
        observeSidebar()
        const mutation = typeof MutationObserver === 'function' && typeof document.body !== 'undefined'
          ? new MutationObserver(() => {
            observeSidebar()
            schedule()
          })
          : null
        const mutationRoot = document.querySelector('[data-slot="sidebar"]')?.parentElement ?? document.body
        if (mutation !== null && mutationRoot !== null) {
          mutation.observe(mutationRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
        }
        window.addEventListener('resize', schedule)
        const interval = window.setInterval(schedule, 500)
        return () => {
          disposed = true
          if (frame !== null) window.cancelAnimationFrame(frame)
          if (observer !== null) observer.disconnect()
          if (mutation !== null) mutation.disconnect()
          window.removeEventListener('resize', schedule)
          window.clearInterval(interval)
        }
      }, [open])
      return area
    }

    /**
     * Invisible seat that owns the standalone Project page: it listens for the
     * sidebar entry's window event, keeps the open Workspace, and renders one
     * page instance over the content area right of the left sidebar (which stays
     * visible and interactive). Switching Workspace from that sidebar updates
     * this same instance (its data hook aborts stale requests); Esc or the close
     * control unmounts it and returns to the untouched conversation, composer,
     * and sidebar state.
     * @param {object} props - slot props plus the bound locale, client context, and workspace navigation.
     * @returns {object | null} the page, or null while closed.
     */
    function ProjectPageSeat({ t, ctx, uiWorkspace, ...props }) {
      const [target, setTarget] = React.useState(null)
      const open = target !== null
      const area = useProjectPageArea(open)
      const close = React.useCallback(() => setTarget(null), [])
      React.useEffect(() => {
        const onOpen = (event) => {
          const workspaceId = event?.detail?.workspaceId
          if (typeof workspaceId !== 'string' || workspaceId.length === 0) return
          // The project page covers the annotation layers (z-index) while its
          // capture surface would keep swallowing page clicks; leave annotation
          // mode first so exactly one Esc ladder and one pointer source remain.
          window.dispatchEvent(new CustomEvent(ANNOTATION_EXIT_EVENT))
          setTarget({ workspaceId, title: projectWorkspaceTitle(ctx, workspaceId) })
        }
        window.addEventListener(PROJECT_PAGE_EVENT, onOpen)
        return () => window.removeEventListener(PROJECT_PAGE_EVENT, onOpen)
      }, [ctx])
      React.useEffect(() => {
        if (!open) return undefined
        const root = document.documentElement
        root.setAttribute(PROJECT_PAGE_ATTR, 'true')
        return () => root.removeAttribute(PROJECT_PAGE_ATTR)
      }, [open])
      React.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          // A page dropdown/menu handles Escape itself in document capture and
          // stops propagation. While one is open the first Escape must close
          // only that menu; the next Escape (no menu) closes the page.
          const page = document.querySelector('[data-psv-page]')
          if (page !== null && page.querySelector('.psv-menu') !== null) return
          event.preventDefault()
          event.stopPropagation()
          close()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [open, close])
      if (target === null) return null
      const pageProps = {
        ...props,
        t,
        uiWorkspace,
        onClose: close,
        workspaceId: target.workspaceId,
        workspaceTitle: target.title,
        sessionsSource: ctx.sessions?.list,
        copy: copyText,
        presetRoster: () => readPresetRoster(ctx),
        presetRead: (workspaceId, signal) => readWorkspacePreset(workspaceId, signal),
        presetWrite: (workspaceId, preset) => writeWorkspacePreset(workspaceId, preset),
        presetName: (preset) => presetDisplayName(t, preset)
      }
      return psv('div', {
        className: 'psv-page',
        'data-psv-page': '',
        'data-workspace': target.workspaceId,
        'data-area-left': String(area.left),
        role: 'dialog',
        'aria-label': t('page.label'),
        style: {
          left: `${area.left}px`,
          top: `${area.top}px`,
          width: `${area.width}px`,
          height: `${area.height}px`
        }
      }, psv(ProjectPage, pageProps))
    }
    //#endregion

    /**
     * Register the standalone Project page seat, its sidebar entry, and its
     * locale dictionaries. The conversation view registration is intentionally
     * gone: Project is a page of its own, opened from a Workspace row.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installProjectView(ctx) {
      const t = ctx.locale.bind(PROJECT_VIEW_NS)
      ctx.effect(() => ctx.locale.register(PROJECT_VIEW_NS, {
        en: PROJECT_VIEW_EN,
        zh: PROJECT_VIEW_ZH
      }), 'power-suite: project view dictionaries')
      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: PROJECT_PAGE_SEAT_ID
      }, (props) => React.createElement(ProjectPageSeat, {
        ...props,
        t,
        ctx,
        uiWorkspace: ctx.uiWorkspace
      }))), 'power-suite: project page seat')
      ctx.effect(() => installProjectWorkspaceEntry(ctx), 'power-suite: project view workspace entry')
    }
    //#endregion

    //#region feature: ui element annotation
    //
    // Browser-only mode that lets the user outline real DSH elements, give each
    // one a requested change, and insert a structured reference into the
    // current Session Composer. It never edits the page, never reads field
    // values, and never sends a message.
    //
    // Architecture: one always-mounted `shell.overlay` surface (launcher, rail,
    // highlights, popover, feedback), one renderless `conversation.input.overlay`
    // seat that keeps the Composer bridge current, one imperative controller
    // (capture listeners, geometry, layout, persistence, insertion), and one
    // pure reducer/store that connects them. The mode is page-wide: the layout
    // frame keeps its inline grid and makes room through `padding-right`, so the
    // rail sits in the freed strip without covering any native column.
    //
    // Host boundaries: Shadow DOM hosts are selectable (internals are not),
    // cross-origin iframes are not selectable, native `<input>`/`<textarea>`/
    // contenteditable contents are never read, canvas content has no DOM target,
    // and body-level portals are ordinary DOM and selectable.

    //#region ui element annotation — pure model

    /** Copy namespace of the UI element annotation mode. */
    const ANNOTATION_NS = 'powerSuiteAnnotation'

    /** The always-mounted overlay seat that renders the annotation surface. */
    const ANNOTATION_OVERLAY_ID = 'power-suite.ui-annotation-overlay'

    /** The renderless Composer seat that maintains the insertion bridge. */
    const ANNOTATION_SEAT_ID = 'power-suite.ui-annotation-seat'

    /** Browser-owned persistence keys. The mode itself is intentionally not restored. */
    const SETTINGS_STORAGE_KEY = 'power-suite.ui-annotation.settings'
    const LAUNCHER_STORAGE_KEY = 'power-suite.ui-annotation.launcher'
    const RAIL_STORAGE_KEY = 'power-suite.ui-annotation.rail-collapsed'

    /**
     * Persisted annotation records. Unlike the other keys this one holds page
     * identity (locator, route, cwd) and user notes, so it is versioned and
     * validated: a v2 document `{ version, updatedAt, records }`.
     */
    const ANNOTATION_RECORDS_STORAGE_KEY = 'power-suite.ui-annotation.annotations'

    /** Hard cap on persisted/collected annotations (D15: explicit refusal, never silent loss). */
    const ANNOTATION_RECORD_LIMIT = 100

    /** Debounce for the persisted annotation document (D1). */
    const ANNOTATION_PERSIST_DEBOUNCE_MS = 250

    /** D5: single-slot undo window after a delete (newest delete replaces it). */
    const ANNOTATION_UNDO_WINDOW_MS = 5000

    /** A3/T6: hover-intent delay before the floating detail card appears. */
    const ANNOTATION_DETAIL_HOVER_DELAY_MS = 120

    /** A3/T6: grace period before the detail card closes after the pointer leaves. */
    const ANNOTATION_DETAIL_CLOSE_DELAY_MS = 120

    /** A3/T6: detail card size used before its first measurement (width is fixed). */
    const ANNOTATION_DETAIL_SIZE = { width: 320, height: 240 }

    /** A3/T6: the badge requirement summary is a one-line excerpt of this many characters. */
    const ANNOTATION_MARK_SUMMARY_MAX = 18

    /** A3/T9: the composer trigger source that owns annotation reference chips. */
    const ANNOTATION_CHIP_SOURCE = 'ui-annotation'

    /** A3/T9: trigger character the annotation source binds to (`@`). */
    const ANNOTATION_CHIP_TRIGGER = '@'

    /** A3/T9: menu order after the native `@reference` group. */
    const ANNOTATION_CHIP_ORDER = 900

    /** A3/T9: at most this many current-Session candidates appear in the menu (D8). */
    const ANNOTATION_CHIP_CANDIDATE_LIMIT = 20

    /** A3/T9: a batch chip ref is `batch:<id>|<id>…`. */
    const ANNOTATION_CHIP_BATCH_PREFIX = 'batch:'

    /** A3/T9: one bare record id inside a chip ref (ids are `psa-<order>-<token>`). */
    const ANNOTATION_CHIP_REF_PATTERN = /^psa-[A-Za-z0-9_-]{1,120}$/

    /** F2: a floating surface root needs at least this computed z-index. */
    const ANNOTATION_SURFACE_MIN_Z = 10

    /** F2: inner drill levels are capped so a card with many rows stays navigable. */
    const ANNOTATION_SURFACE_MAX_LEVELS = 12

    /** F1: annotation paint layer z-index: above native hover cards (100), below modals (1000)/menus (1100). */
    const ANNOTATION_PAINT_Z = 150

    /** Root marker for the raised paint layer, asserted by the live E2E. */
    const ANNOTATION_RAISED_ATTR = 'data-psa-raised'

    /**
     * Module event announced when the mode turns on/off. The dynamic-workspaces
     * feature owns the dependent hover-card pinning behavior; this annotation
     * region only dispatches the state (D3: ownership split).
     */
    const ANNOTATION_STATE_EVENT = 'power-suite:ui-annotation-state'

    /** The two configurable modifiers, in native select order. */
    const MODIFIER_CHOICES = ['alt', 'ctrl', 'meta', 'shift']

    /** Defaults: Alt/Option passes clicks through, Shift adds to the selection. */
    const ANNOTATION_DEFAULT_SETTINGS = Object.freeze({
      passThroughModifier: 'alt',
      multiModifier: 'shift'
    })

    /** Copy for the UI element annotation mode. */
    const ANNOTATION_EN = {
      'launcher.enter': 'Annotate UI elements',
      'launcher.exit': 'Exit annotation mode',
      'rail.aria': 'UI element annotation',
      'rail.title': 'UI annotation',
      'rail.collapse': 'Collapse rail',
      'rail.expand': 'Expand rail',
      'rail.exit': 'Exit annotation mode',
      'rail.hint': 'Click an element to annotate it. {passThrough}-click keeps the page usable; {multi}-click adds to the selection.',
      'rail.status.idle': 'Click an element to annotate it',
      'rail.status.selected': '1 element selected',
      'rail.status.multi': '{count} elements selected',
      'rail.openCollection': 'Collection',
      'rail.openSettings': 'Settings',
      'rail.back': 'Back',
      'rail.addMulti': 'Add {count} to collection',
      'rail.clearSelection': 'Clear selection',
      'rail.selectedName': 'Selected element',
      'rail.surfaceFloating': 'Floating surface (hover preview)',
      'rail.surfaceTransient': 'transient',
      'popover.aria': 'Element annotation',
      'popover.drag': 'Drag popover',
      'popover.statusLabel': 'Target',
      'popover.status.resolved': 'Resolved',
      'popover.status.ambiguous': 'Matches several',
      'popover.status.missing': 'No longer resolves',
      'popover.status.changed': 'Content changed',
      'popover.levelUp': 'Parent element',
      'popover.levelDown': 'Child element',
      'popover.noteLabel': 'Requested change',
      'popover.notePlaceholder': 'Describe the requested change',
      'popover.quickRef': 'Quick reference',
      'popover.add': 'Add to collection',
      'popover.update': 'Update requirement',
      'popover.commit': 'Mark requirement',
      'popover.delete': 'Delete annotation',
      'popover.close': 'Close',
      'popover.copyLocator': 'Copy locator',
      'popover.ephemeralHint': 'Transient surface: this element can disappear when its card closes; the locator is kept.',
      'detail.title': 'Annotation details',
      'detail.requirement': 'Requirement',
      'detail.emptyRequirement': 'No requirement yet',
      'detail.addRequirement': 'Add requirement',
      'detail.locator': 'Locator',
      'detail.position': 'Position',
      'detail.session': 'Session',
      'detail.workspace': 'Workspace',
      'detail.status': 'Status',
      'detail.surfaceFloating': 'Floating surface (hover preview)',
      'detail.ephemeral': 'Transient surface — may disappear',
      'detail.quickRef': 'Quick reference',
      'detail.edit': 'Edit requirement',
      'detail.save': 'Save',
      'detail.cancel': 'Cancel',
      'detail.delete': 'Delete',
      'detail.relocate': 'Go to element',
      'detail.copyLocator': 'Copy locator',
      'detail.close': 'Close',
      'detail.marks': 'Marks are shown on the page while the mode is on',
      'chip.batchLabel': 'UI annotations × {count}',
      'chip.candidateLabel': 'UI annotation · {name}',
      'collection.countScope': '{current} current · {other} other',
      'collection.include': 'Include in batch insert',
      'collection.selectAllCurrent': 'Select current session',
      'collection.deselectAll': 'Clear selection',
      'collection.deleteSelected': 'Delete selected',
      'collection.insertChip': 'Insert reference',
      'collection.moveUp': 'Move up',
      'collection.moveDown': 'Move down',
      'collection.preview': 'Preview the element',
      'collection.sortHint': 'Insertion order; ↑↓ adjusts the batch order',
      'collection.otherSessionHint': 'From another session; batch insert skips it',
      'collection.batchDisabled': 'Nothing to insert: select a current-session annotation first',
      'collection.title': 'Collection',
      'collection.count': '{count} elements',
      'collection.countOne': '1 element',
      'collection.empty': 'No annotated elements',
      'collection.emptyHint': 'Select an element, write a note, then add it to the collection.',
      'collection.otherSession': 'Other session',
      'collection.notePlaceholder': 'Note',
      'collection.expand': 'Edit note in a larger editor',
      'collection.relocate': 'Re-locate',
      'collection.remove': 'Remove',
      'collection.clear': 'Clear',
      'collection.insertBatch': 'Insert all into composer',
      'collection.crossSession': '{count} from other sessions will be skipped',
      'collection.noteEditorTitle': 'Note',
      'collection.noteEditorClose': 'Close',
      'collection.copyLocator': 'Copy locator',
      'collection.maxReached': 'The collection is full ({limit} annotations). Remove entries before adding more.',
      'settings.title': 'Settings',
      'settings.passThrough': 'Pass-through modifier',
      'settings.multi': 'Multi-select modifier',
      'settings.field.passThrough': 'Pass-through',
      'settings.field.multi': 'Multi-select',
      'settings.conflict': '{field} was moved to {value} because both modifiers cannot be the same key.',
      'settings.saved': 'Settings saved',
      'settings.hint': 'Hold the pass-through key to use the page normally. Hold the multi-select key to add elements or drag a box.',
      'modifier.alt': '⌥ / Alt',
      'modifier.ctrl': 'Ctrl',
      'modifier.meta': '⌘ / Meta',
      'modifier.shift': '⇧ / Shift',
      'feedback.modeOn': 'Annotation mode on',
      'feedback.inserted': 'Inserted into the current session composer (not sent)',
      'feedback.insertFailed': 'Could not insert into the composer',
      'feedback.noComposer': 'Open a session before inserting a reference',
      'feedback.added': 'Added to the collection',
      'feedback.updated': 'Updated the existing collection entry',
      'feedback.removed': 'Removed from the collection',
      'feedback.cleared': 'Collection cleared',
      'feedback.relocated': 'Moved to the element',
      'feedback.relocateFailed': 'The element cannot be located ({status})',
      'feedback.relocateOtherSession': 'This annotation belongs to another session',
      'feedback.locatorCopied': 'Locator copied',
      'feedback.locatorCopyFailed': 'Could not copy the locator',
      'feedback.chipInserted': 'Inserted as a reference chip (not sent)',
      'feedback.chipBatchInserted': 'Inserted one batch reference chip (not sent)',
      'feedback.chipFallback': 'Reference chips unavailable here; inserted as plain text',
      'feedback.chipMissing': 'This reference\'s annotation is no longer available',
      'feedback.selectedDeleted': 'Selected annotations deleted',
      'feedback.marked': 'Marked · {count} total',
      'feedback.markUpdated': 'Requirement updated',
      'feedback.markDeleted': 'Annotation deleted',
      'feedback.undo': 'Undo',
      'feedback.restored': 'Annotation restored',
      'feedback.batchEmpty': 'Nothing to insert from the current session',
      'insert.title': 'UI annotation',
      'insert.reference': 'Reference:',
      'insert.session': 'Session:',
      'insert.noSession': '—',
      'insert.note': 'Note:',
      'insert.emptyNote': '—',
      'insert.batchHeader': 'Please adjust the UI elements below. Each item lists its reference and the requested change.',
      'insert.status': 'Status: target no longer resolves (locator only)',
      'insert.statusEphemeral': 'Status: transient surface no longer present (locator only)',
      'insert.statusAmbiguous': 'Status: target matches more than one element (locator only)',
      'insert.statusChanged': 'Status: target content changed',
      'insert.skipped': '({count} annotation(s) from other sessions skipped)',
      'insert.removed': '({count} annotation(s) no longer exist and were skipped)',
      'insert.noRemaining': '(no annotations remain for this reference)'
    }

    /** Copy for the UI element annotation mode, Chinese. */
    const ANNOTATION_ZH = {
      'launcher.enter': '标注 UI 元素',
      'launcher.exit': '退出标注模式',
      'rail.aria': 'UI 元素标注',
      'rail.title': 'UI 标注',
      'rail.collapse': '收起工具条',
      'rail.expand': '展开工具条',
      'rail.exit': '退出标注模式',
      'rail.hint': '点击页面元素开始标注。按住 {passThrough} 点击可正常使用页面；按住 {multi} 点击可加选。',
      'rail.status.idle': '点击页面元素开始标注',
      'rail.status.selected': '已选择 1 个元素',
      'rail.status.multi': '已选择 {count} 个元素',
      'rail.openCollection': '标注集',
      'rail.openSettings': '设置',
      'rail.back': '返回',
      'rail.addMulti': '将 {count} 个加入标注集',
      'rail.clearSelection': '取消选择',
      'rail.selectedName': '已选元素',
      'rail.surfaceFloating': '浮动层（悬停预览）',
      'rail.surfaceTransient': '瞬态',
      'popover.aria': '元素标注',
      'popover.drag': '拖动浮层',
      'popover.statusLabel': '目标',
      'popover.status.resolved': '可定位',
      'popover.status.ambiguous': '有多个匹配',
      'popover.status.missing': '无法定位',
      'popover.status.changed': '内容已变化',
      'popover.levelUp': '上一级元素',
      'popover.levelDown': '下一级元素',
      'popover.noteLabel': '修改说明',
      'popover.notePlaceholder': '描述需要修改的内容',
      'popover.quickRef': '快速引用',
      'popover.add': '加入标注集',
      'popover.update': '更新需求',
      'popover.commit': '标记需求',
      'popover.delete': '删除标注',
      'popover.close': '关闭',
      'popover.copyLocator': '复制定位器',
      'popover.ephemeralHint': '瞬态浮层：卡片关闭后该元素可能消失，仅保留定位信息。',
      'detail.title': '标注详情',
      'detail.requirement': '需求',
      'detail.emptyRequirement': '尚未填写需求',
      'detail.addRequirement': '添加需求',
      'detail.locator': '定位',
      'detail.position': '位置',
      'detail.session': '会话',
      'detail.workspace': '工作区',
      'detail.status': '状态',
      'detail.surfaceFloating': '浮动层（悬停预览）',
      'detail.ephemeral': '瞬态浮层 — 可能消失',
      'detail.quickRef': '快速引用',
      'detail.edit': '编辑需求',
      'detail.save': '保存',
      'detail.cancel': '取消',
      'detail.delete': '删除',
      'detail.relocate': '定位到元素',
      'detail.copyLocator': '复制定位器',
      'detail.close': '关闭',
      'detail.marks': '模式开启时页面会持续显示标注遮罩',
      'chip.batchLabel': 'UI 标注 × {count}',
      'chip.candidateLabel': 'UI 标注 · {name}',
      'collection.countScope': '当前会话 {current} · 其他会话 {other}',
      'collection.include': '加入批量插入',
      'collection.selectAllCurrent': '全选当前会话',
      'collection.deselectAll': '取消全选',
      'collection.deleteSelected': '删除选中',
      'collection.insertChip': '插入引用',
      'collection.moveUp': '上移',
      'collection.moveDown': '下移',
      'collection.preview': '预览该元素',
      'collection.sortHint': '按插入顺序排列，可用 ↑↓ 调整批量顺序',
      'collection.otherSessionHint': '来自其他会话，批量插入会跳过',
      'collection.batchDisabled': '没有可插入的标注：请先选择当前会话的标注',
      'collection.title': '标注集',
      'collection.count': '{count} 项',
      'collection.countOne': '1 项',
      'collection.empty': '还没有标注',
      'collection.emptyHint': '选择元素、写下修改说明，然后加入标注集。',
      'collection.otherSession': '其他会话',
      'collection.notePlaceholder': '备注',
      'collection.expand': '在较大编辑器中编辑备注',
      'collection.relocate': '重新定位',
      'collection.remove': '移除',
      'collection.clear': '清空',
      'collection.insertBatch': '全部插入输入框',
      'collection.crossSession': '另有 {count} 条来自其他会话，插入时将跳过',
      'collection.noteEditorTitle': '备注',
      'collection.noteEditorClose': '关闭',
      'collection.copyLocator': '复制定位器',
      'collection.maxReached': '标注集已满（{limit} 条）。请先移除条目再添加。',
      'settings.title': '设置',
      'settings.passThrough': '透传修饰键',
      'settings.multi': '多选修饰键',
      'settings.field.passThrough': '透传',
      'settings.field.multi': '多选',
      'settings.conflict': '{field}已改为 {value}，两个修饰键不能相同。',
      'settings.saved': '设置已保存',
      'settings.hint': '按住透传键可正常操作页面；按住多选键可加选元素或拖出选框。',
      'modifier.alt': '⌥ / Alt',
      'modifier.ctrl': 'Ctrl',
      'modifier.meta': '⌘ / Meta',
      'modifier.shift': '⇧ / Shift',
      'feedback.modeOn': '已进入标注模式',
      'feedback.inserted': '已插入当前会话输入框（不会发送）',
      'feedback.insertFailed': '无法插入输入框',
      'feedback.noComposer': '打开一个会话后可以插入引用',
      'feedback.added': '已加入标注集',
      'feedback.updated': '已更新标注集中的条目',
      'feedback.removed': '已从标注集移除',
      'feedback.cleared': '标注集已清空',
      'feedback.relocated': '已定位到该元素',
      'feedback.relocateFailed': '无法定位该元素（{status}）',
      'feedback.relocateOtherSession': '这条标注来自其他会话',
      'feedback.locatorCopied': '已复制定位器',
      'feedback.locatorCopyFailed': '复制定位器失败',
      'feedback.chipInserted': '已插入引用控件（未发送）',
      'feedback.chipBatchInserted': '已插入批量引用控件（未发送）',
      'feedback.chipFallback': '此处不支持引用控件，已插入纯文本',
      'feedback.chipMissing': '该引用对应的标注已不存在',
      'feedback.selectedDeleted': '已删除选中的标注',
      'feedback.marked': '已标记 · 共 {count} 条',
      'feedback.markUpdated': '需求已更新',
      'feedback.markDeleted': '标注已删除',
      'feedback.undo': '撤销',
      'feedback.restored': '标注已恢复',
      'feedback.batchEmpty': '当前会话没有可插入的标注',
      'insert.title': 'UI 标注',
      'insert.reference': '定位：',
      'insert.session': '会话：',
      'insert.noSession': '—',
      'insert.note': '备注：',
      'insert.emptyNote': '—',
      'insert.batchHeader': '请调整以下 UI 元素，每项都附有定位和修改说明。',
      'insert.status': '状态：目标已无法定位（仅保留定位信息）',
      'insert.statusEphemeral': '状态：瞬态浮层已不存在（仅保留定位信息）',
      'insert.statusAmbiguous': '状态：目标匹配到多个元素（仅保留定位信息）',
      'insert.statusChanged': '状态：目标内容已变化',
      'insert.skipped': '（已跳过 {count} 条来自其他会话的标注）',
      'insert.removed': '（已跳过 {count} 条已被删除的标注）',
      'insert.noRemaining': '（该引用对应的标注已全部删除）'
    }

    /**
     * Long-lived bridge to the mounted Composer seat.
     *
     * The annotation surface renders outside the Session-scope slot tree and has
     * no Session list face on its own context, so the seat — which is a real
     * Session-scoped slot and therefore receives the `useSessions` standard hook —
     * mirrors the current Session's `cwd` here. Everything is all-or-nothing: the
     * Session id only exists while the seat's insertion actions do.
     */
    const annotationBridge = { sessionId: null, inputActions: null, sessionCwd: null }

    /** Install guard: a remount must never register the surface twice. */
    let annotationInstalled = false

    /** One-shot diagnostic for the Session-identity fallback (never fully silent). */
    let annotationIdentityWarned = false

    /** The controller singleton, or `null` while the feature is uninstalled. */
    let annotationController = null

    // Remix Icon path data (Apache-2.0, https://remixicon.com), inlined so the
    // mode needs no icon package at runtime.
    const REMIX_FOCUS_3_LINE = 'M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4ZM12 8C14.2091 8 16 9.79086 16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8Z'
    const REMIX_CLOSE_LINE = 'M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z'
    const REMIX_ARROW_UP_LINE = 'M13.0001 7.82843V20H11.0001V7.82843L5.63614 13.1924L4.22192 11.7782L12.0001 4L19.7783 11.7782L18.3641 13.1924L13.0001 7.82843Z'
    const REMIX_ARROW_DOWN_LINE = 'M13.0001 16.1716L18.3641 10.8076L19.7783 12.2218L12.0001 20L4.22192 12.2218L5.63614 10.8076L11.0001 16.1716V4H13.0001V16.1716Z'
    const REMIX_DELETE_BIN_LINE = 'M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z'
    const REMIX_LIST_CHECK_2 = 'M11 4H21V6H11V4ZM11 8H17V10H11V8ZM11 14H21V16H11V14ZM11 18H17V20H11V18ZM3 4H9V10H3V4ZM5 6V8H7V6H5ZM3 14H9V20H3V14ZM5 16V18H7V16H5Z'
    const REMIX_SETTINGS_3_LINE = 'M8.68637 4.0001L10.293 2.39348C11.6835 1.00295 13.9379 1.00295 15.3284 2.39348L16.935 4.0001H19.2427C20.8995 4.0001 22.2427 5.34325 22.2427 7.0001V9.30772L23.8492 10.9143C25.2398 12.3048 25.2398 14.5592 23.8492 15.9497L22.2427 17.5564V19.864C22.2427 21.5208 20.8995 22.864 19.2427 22.864H16.935L15.3284 24.4706C13.9379 25.8611 11.6835 25.8611 10.293 24.4706L8.68637 22.864H6.37874C4.72189 22.864 3.37874 21.5208 3.37874 19.864V17.5564L1.77212 15.9497C0.381596 14.5592 0.381596 12.3048 1.77212 10.9143L3.37874 9.30772V7.0001C3.37874 5.34325 4.72189 4.0001 6.37874 4.0001H8.68637ZM13.9143 4.41431C13.1332 3.63326 11.8669 3.63326 11.0858 4.41431L8.9431 6.55701H6.37874C5.82645 6.55701 5.37874 7.00472 5.37874 7.55701V10.1214L3.23603 12.2641C2.45498 13.0451 2.45498 14.3114 3.23603 15.0925L5.37874 17.2352V19.864C5.37874 20.4163 5.82645 20.864 6.37874 20.864H9.00754L11.0858 22.9423C11.8669 23.7234 13.1332 23.7234 13.9143 22.9423L15.9925 20.864H18.6213C19.1736 20.864 19.6213 20.4163 19.6213 19.864V17.2352L21.764 15.0925C22.5451 14.3114 22.5451 13.0451 21.764 12.2641L19.6213 10.1214V7.55701C19.6213 7.00472 19.1736 6.55701 18.6213 6.55701H16.0569L13.9143 4.41431ZM12.6213 13.864C13.7259 13.864 14.6213 12.9686 14.6213 11.864C14.6213 10.7595 13.7259 9.86402 12.6213 9.86402C11.5167 9.86402 10.6213 10.7595 10.6213 11.864C10.6213 12.9686 11.5167 13.864 12.6213 13.864Z'

    const REMIX_ANNOTATION_COPY_LINE = 'M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z'
    /** Control and zero-width characters stripped from every captured string. */
    const ANNOTATION_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g

    /** Redaction patterns, longest/most specific first. */
    const ANNOTATION_REDACTIONS = [
      /\bbearer\s+[a-z0-9._~+/-]+=*/gi,
      /\bsk-[a-z0-9_-]{8,}/gi,
      /\bAKIA[0-9A-Z]{16}\b/gi,
      /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/gi,
      /\b(?:[A-Fa-f0-9]{24,}|[A-Za-z0-9+/_-]{24,}={0,2})\b/g,
      /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
    ]

    /** Attribute names never exposed through a locator. */
    const SENSITIVE_ATTRIBUTE_NAMES = /token|secret|password|passwd|authorization|cookie|csrf|session[-_]?key/i

    /**
     * Secret-shaped values that are rejected even for a known stable attribute.
     * A proven secret always wins over the namespace allowance. Matching is
     * case-insensitive so `Bearer`/`bearer`, `SK-`/`sk-`, AWS keys and JWTs are
     * all rejected by the same cheap pass (R3).
     */
    const SENSITIVE_SECRET_VALUES = /bearer\s|sk-[a-z0-9_-]{8,}|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i

    /** Attribute values that must never be captured, even under a safe name. */
    const SENSITIVE_ATTRIBUTE_VALUES = /bearer\s|sk-[a-z0-9_-]{8,}|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b[A-Fa-f0-9]{24,}\b|\b[A-Za-z0-9+/_-]{24,}={0,2}\b/i

    /**
     * Stable data attributes whose values may legitimately be a namespaced key
     * (`session:<uuid>`) or a bare UUID; those shapes are longer than the generic
     * long-token secret heuristic would allow.
     */
    const STABLE_KEY_ATTRIBUTES = new Set([
      'data-row-key',
      'data-conversation-region',
      'data-conversation-session',
      'data-lexical-editor',
      'data-testid',
      'data-slot',
      'data-sidebar-toggle'
    ])

    /** A colon-namespaced stable key such as `session:<uuid>`. */
    const NAMESPACED_KEY_PATTERN = /^[a-z][a-z0-9_-]*:[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/

    /** A bare UUID used as a stable key. */
    const UUID_PATTERN = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/

    /**
     * A DSH Session id shaped `session-<uuid>`, the real value the shell writes
     * into `data-conversation-session` (R2). Narrow on purpose: only this shape,
     * never a generic long token.
     */
    const SESSION_ID_PATTERN = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

    /** Attributes that make a stable locator, most reliable first. */
    const LOCATOR_DATA_ATTRIBUTES = [
      ['data-row-key', 0.98],
      ['data-conversation-region', 0.95],
      ['data-conversation-session', 0.86],
      ['data-testid', 0.92],
      ['data-slot', 0.9]
    ]

    /**
     * Whether a value looks generated per render instead of authored.
     * @param {string} value - id/data-attribute/candidate value.
     * @returns {boolean} whether the value is unstable.
     */
    function isDynamicValue(value) {
      if (typeof value !== 'string' || value.length === 0) return true
      if (value.length > 120) return true
      if (value.startsWith(':r') || value.includes(':r')) return true
      if (/^(?:react|radix|headlessui|mui|aria-)[-_]/i.test(value)) return true
      if (/_[A-Za-z0-9]{4,}$/.test(value)) return true
      if (/[A-Fa-f0-9]{12,}/.test(value)) return true
      if (/^[a-z]+-[0-9a-f]{4,}$/i.test(value)) return true
      return false
    }

    /**
     * Escape one value for use inside a double-quoted CSS attribute selector.
     * @param {string} value - raw attribute value.
     * @returns {string} escaped value.
     */
    function cssString(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ')
    }

    /**
     * Escape one id for use in an id selector, using the platform escaper when present.
     * @param {string} id - raw id value.
     * @returns {string} escaped id.
     */
    function cssIdentifier(id) {
      const text = String(id)
      try {
        const platformCss = typeof globalThis !== 'undefined' ? globalThis.CSS : undefined
        if (platformCss !== undefined && platformCss !== null && typeof platformCss.escape === 'function') return platformCss.escape(text)
      } catch {
        // Fall through to the conservative escaper.
      }
      // CSS.escape fallback: a leading digit must become a hex escape, not a
      // bare identifier start (`123abc` is invalid as an id selector).
      let escaped = ''
      for (let index = 0; index < text.length; index += 1) {
        const character = text[index]
        if (index === 0 && /[0-9]/.test(character)) {
          escaped += `\\${character.codePointAt(0).toString(16)} `
          continue
        }
        escaped += /[A-Za-z0-9_-]/.test(character) ? character : `\\${character}`
      }
      return escaped
    }

    /**
     * Redact and truncate one user/DOM string for display or insertion.
     * @param {unknown} value - raw value.
     * @param {number} [max] - maximum output length, default 80.
     * @returns {string} sanitized text.
     */
    function sanitizeText(value, max) {
      if (typeof value !== 'string' || value.length === 0) return ''
      const limit = typeof max === 'number' && Number.isFinite(max) && max > 0 ? Math.round(max) : 80
      let text = value.replace(ANNOTATION_CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
      if (text.length === 0) return ''
      for (const pattern of ANNOTATION_REDACTIONS) {
        pattern.lastIndex = 0
        text = text.replace(pattern, '[redacted]')
      }
      if (text.length > limit) {
        text = `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`
      }
      return text
    }

    /**
     * Normalize one user-authored annotation note without redaction or truncation.
     *
     * Page-derived text goes through {@link sanitizeText} (collapse + secret
     * redaction + limit); a note the user typed must survive verbatim, otherwise
     * the inserted request disagrees with what the UI displayed. NUL/C0 control
     * characters (except tab and newline) are removed, CRLF/CR is normalized to
     * `\n`, and internal spaces/newlines are preserved. Multi-line notes are
     * inserted as multi-line label content by both serializers.
     * @param {unknown} value - raw user note.
     * @returns {string} normalized note (empty for non-strings).
     */
    function normalizeUserNote(value) {
      if (typeof value !== 'string' || value.length === 0) return ''
      return value
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    }

    /**
     * Deterministic FNV-1a 32-bit digest of one collapsed, sanitized text.
     *
     * This is derived data only: it lets re-resolution detect content changes
     * without storing the raw text in the ref. The offset basis is returned for an
     * empty string, so an empty-but-captured target can be recognized later.
     * @param {unknown} value - raw text.
     * @returns {string} eight lowercase hex digits, or '' for a non-string.
     */
    function textDigest(value) {
      if (typeof value !== 'string') return ''
      const text = sanitizeText(value, 4096)
      let hash = 0x811c9dc5
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
      }
      return (hash >>> 0).toString(16).padStart(8, '0')
    }

    /**
     * Accept one attribute name for capture.
     * @param {unknown} name - raw attribute name.
     * @returns {string | null} lowercase name, or null when denied.
     */
    function sanitizeAttributeName(name) {
      if (typeof name !== 'string') return null
      const trimmed = name.trim().toLowerCase()
      if (trimmed.length === 0 || trimmed.length > 64) return null
      if (trimmed === 'class' || trimmed === 'style' || trimmed === 'value') return null
      if (trimmed.startsWith('on')) return null
      if (SENSITIVE_ATTRIBUTE_NAMES.test(trimmed)) return null
      return trimmed
    }

    /**
     * Accept one attribute value for capture.
     * @param {unknown} name - attribute name, checked again.
     * @param {unknown} value - raw attribute value.
     * @returns {string | null} trimmed value, or null when denied.
     */
    function sanitizeAttributeValue(name, value) {
      const safeName = sanitizeAttributeName(name)
      if (safeName === null || typeof value !== 'string') return null
      const trimmed = value.replace(ANNOTATION_CONTROL_CHARS, ' ').trim()
      if (trimmed.length === 0 || trimmed.length > 160) return null
      // A proven secret is never allowed, whatever the attribute is called.
      if (SENSITIVE_SECRET_VALUES.test(trimmed)) return null
      // Known stable data attributes keep namespaced ids/UUIDs, which are longer
      // than the generic opaque-token heuristic but are identity, not secrets.
      if (STABLE_KEY_ATTRIBUTES.has(safeName)
        && (NAMESPACED_KEY_PATTERN.test(trimmed) || UUID_PATTERN.test(trimmed) || SESSION_ID_PATTERN.test(trimmed))) {
        return trimmed
      }
      if (SENSITIVE_ATTRIBUTE_VALUES.test(trimmed)) return null
      return trimmed
    }

    /**
     * Merge raw persisted settings with defaults, keeping the modifiers distinct.
     * @param {unknown} raw - parsed value or anything else.
     * @returns {{ passThroughModifier: string, multiModifier: string }} normalized settings.
     */
    function normalizeSettings(raw) {
      const source = raw !== null && typeof raw === 'object' ? raw : {}
      let passThroughModifier = MODIFIER_CHOICES.includes(source.passThroughModifier)
        ? source.passThroughModifier
        : ANNOTATION_DEFAULT_SETTINGS.passThroughModifier
      let multiModifier = MODIFIER_CHOICES.includes(source.multiModifier)
        ? source.multiModifier
        : ANNOTATION_DEFAULT_SETTINGS.multiModifier
      if (multiModifier === passThroughModifier) {
        multiModifier = MODIFIER_CHOICES.find((choice) => choice !== passThroughModifier) ?? ANNOTATION_DEFAULT_SETTINGS.multiModifier
      }
      return { passThroughModifier, multiModifier }
    }

    /**
     * Apply one modifier choice and move the other field off a collision.
     * @param {object} settings - current settings.
     * @param {'passThroughModifier' | 'multiModifier'} field - changed field.
     * @param {unknown} value - requested modifier id.
     * @returns {{ settings: object, adjustedField?: string }} next settings, plus the moved field.
     */
    function resolveModifierChange(settings, field, value) {
      const current = normalizeSettings(settings)
      if (field !== 'passThroughModifier' && field !== 'multiModifier') return { settings: current }
      if (!MODIFIER_CHOICES.includes(value)) return { settings: current }
      const otherField = field === 'passThroughModifier' ? 'multiModifier' : 'passThroughModifier'
      const next = { ...current, [field]: value }
      if (next[otherField] === value) {
        next[otherField] = MODIFIER_CHOICES.find((choice) => choice !== value) ?? current[otherField]
        return { settings: next, adjustedField: otherField }
      }
      return { settings: next }
    }

    /**
     * Parse the persisted settings document.
     * @param {string | null} text - raw localStorage value.
     * @returns {{ passThroughModifier: string, multiModifier: string }} normalized settings.
     */
    function parseStoredSettings(text) {
      if (typeof text !== 'string' || text.length === 0) return normalizeSettings(null)
      try {
        return normalizeSettings(JSON.parse(text))
      } catch {
        return normalizeSettings(null)
      }
    }

    /**
     * Serialize settings for localStorage, normalized.
     * @param {object} settings - settings to store.
     * @returns {string} JSON document.
     */
    function serializeSettings(settings) {
      return JSON.stringify(normalizeSettings(settings))
    }

    /**
     * Whether a keyboard or mouse event carries one configured modifier.
     * @param {object} eventLike - event with altKey/ctrlKey/metaKey/shiftKey.
     * @param {string} modifier - modifier id from `MODIFIER_CHOICES`.
     * @returns {boolean} whether the modifier is held.
     */
    function modifierMatches(eventLike, modifier) {
      if (eventLike === null || typeof eventLike !== 'object') return false
      if (modifier === 'alt') return eventLike.altKey === true
      if (modifier === 'ctrl') return eventLike.ctrlKey === true
      if (modifier === 'meta') return eventLike.metaKey === true
      if (modifier === 'shift') return eventLike.shiftKey === true
      return false
    }

    /**
     * Short display form of one Session identity.
     *
     * DSH Session ids carry a `session-` prefix followed by a UUID; the prefix
     * is dropped so two Sessions never render the same `session-` stem.
     * @param {unknown} sessionId - Session identity.
     * @returns {string} eight compact characters, or an empty string.
     */
    function sessionShortLabel(sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return ''
      const bare = sessionId.startsWith('session-') ? sessionId.slice('session-'.length) : sessionId
      const compact = bare.replace(/[^0-9A-Za-z]/g, '')
      if (compact.length > 0) return compact.slice(0, 8)
      return sessionId.slice(0, 8)
    }

    /**
     * Workspace display label derived from one Session's working directory.
     *
     * The full `cwd` is persisted (D6) so a record can name its Workspace across
     * reloads; only the basename is shown. Trailing separators are ignored and
     * both platforms' separators are accepted.
     * @param {unknown} cwd - absolute working directory.
     * @returns {string | null} display label, or null when unavailable.
     */
    function annotationWorkspaceLabel(cwd) {
      if (typeof cwd !== 'string' || cwd.length === 0) return null
      const parts = cwd.split(/[\\/]+/).filter((part) => part.length > 0)
      const label = parts.length > 0 ? parts[parts.length - 1] : ''
      if (label.length === 0) return null
      return label.length > 80 ? `${label.slice(0, 79)}…` : label
    }

    /**
     * Normalize one navigation pathname for the persisted record.
     *
     * Only the pathname is kept: query strings and fragments can carry tokens and
     * are never stored (D11 privacy contract).
     * @param {unknown} pathname - location.pathname or a raw route string.
     * @returns {string} `/`-leading path without query/fragment.
     */
    function annotationRoutePath(pathname) {
      if (typeof pathname !== 'string' || pathname.length === 0) return '/'
      const cut = pathname.split(/[?#]/)[0]
      const path = cut.startsWith('/') ? cut : `/${cut}`
      return path.length > 300 ? path.slice(0, 300) : path
    }

    /**
     * Format one epoch-ms timestamp as local 24-hour HH:MM.
     * @param {unknown} at - epoch milliseconds.
     * @returns {string} clock label.
     */
    function formatAnnotationTime(at) {
      const value = typeof at === 'number' && Number.isFinite(at) ? at : Date.now()
      const date = new Date(value)
      const pad = (part) => String(part).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /**
     * Join one colon-bearing label with its value. A full-width Chinese colon
     * takes no following space; an ASCII colon takes one.
     * @param {string} label - localized label such as `Reference:` / `定位：`.
     * @param {string} value - the value after the colon.
     * @returns {string} one formatted line fragment.
     */
    function annotationJoinLabel(label, value) {
      const text = typeof label === 'string' ? label.trimEnd() : ''
      if (text.length === 0) return value
      if (text.endsWith('：')) return `${text}${value}`
      if (text.endsWith(':')) return `${text} ${value}`
      return `${text}: ${value}`
    }

    /**
     * One short random token for a ref id.
     * @param {number} length - token length.
     * @returns {string} lowercase alphanumeric token.
     */
    function annotationRandomToken(length) {
      let token = ''
      while (token.length < length) token += Math.random().toString(36).slice(2)
      return token.slice(0, length)
    }

    /**
     * Normalize one bounds rectangle into plain rounded numbers.
     * @param {unknown} bounds - possibly partial rectangle.
     * @returns {{ x: number, y: number, width: number, height: number } | null} normalized rectangle.
     */
    function normalizeAnnotationBounds(bounds) {
      if (bounds === null || typeof bounds !== 'object') return null
      const parts = ['x', 'y', 'width', 'height'].map((key) => (typeof bounds[key] === 'number' && Number.isFinite(bounds[key]) ? Math.round(bounds[key]) : null))
      if (parts.some((part) => part === null)) return null
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
    }

    /**
     * Normalize one captured viewport size.
     * @param {unknown} viewport - possibly partial `{ width, height }`.
     * @returns {{ width: number, height: number } | null} normalized size, or null.
     */
    function normalizeAnnotationViewport(viewport) {
      if (viewport === null || typeof viewport !== 'object') return null
      const width = typeof viewport.width === 'number' && Number.isFinite(viewport.width) && viewport.width > 0 ? Math.round(viewport.width) : null
      const height = typeof viewport.height === 'number' && Number.isFinite(viewport.height) && viewport.height > 0 ? Math.round(viewport.height) : null
      if (width === null || height === null) return null
      return { width, height }
    }

    /**
     * Order locator candidates from one element descriptor, most reliable first.
     *
     * Only stable, sanitized selectors are emitted: dynamic ids/hashed data
     * values are skipped and class names are never used.
     * @param {object} descriptor - element descriptor from the controller.
     * @returns {Array<{ kind: string, value: string, reliability: number }>} candidates.
     */
    function selectorCandidates(descriptor) {
      const source = descriptor !== null && typeof descriptor === 'object' ? descriptor : {}
      const tag = typeof source.tag === 'string' ? source.tag.trim().toLowerCase() : ''
      const attrs = Array.isArray(source.attrs) ? source.attrs : []
      const candidates = []
      const seen = new Set()
      /**
       * Push one deduplicated candidate.
       * @param {string} kind - candidate kind.
       * @param {string} value - CSS selector or tag.
       * @param {number} reliability - 0..1 ordering weight.
       * @returns {void}
       */
      const push = (kind, value, reliability) => {
        if (typeof value !== 'string' || value.length === 0 || seen.has(value)) return
        seen.add(value)
        candidates.push({ kind, value, reliability })
      }
      /**
       * Read one captured attribute value.
       * @param {string} name - attribute name.
       * @returns {string | null} safe value.
       */
      const attrValue = (name) => {
        const attr = attrs.find((item) => item !== null && typeof item === 'object' && item.name === name)
        if (attr === undefined) return null
        return sanitizeAttributeValue(name, attr.value)
      }
      for (const [name, reliability] of LOCATOR_DATA_ATTRIBUTES) {
        const value = attrValue(name)
        if (value === null) continue
        push('data', `[${name}="${cssString(value)}"]`, reliability)
      }
      const knownAttributes = new Set(LOCATOR_DATA_ATTRIBUTES.map(([name]) => name))
      for (const attr of attrs) {
        if (attr === null || typeof attr !== 'object') continue
        if (typeof attr.name !== 'string' || !attr.name.startsWith('data-')) continue
        if (knownAttributes.has(attr.name)) continue
        const value = sanitizeAttributeValue(attr.name, attr.value)
        if (value === null) continue
        // Allow-listed stable attributes are identity even when their value is a
        // long opaque id (e.g. `session-<uuid>`); unknown attributes still go
        // through the generated-value heuristic (R2).
        if (!STABLE_KEY_ATTRIBUTES.has(attr.name) && isDynamicValue(value)) continue
        push('data', `[${attr.name}="${cssString(value)}"]`, 0.7)
      }
      // Defensive: descriptors are pure-model data too, so an id that did not go
      // through annotationStableId still has to pass the same sanitizer here.
      let id = typeof source.id === 'string' ? source.id : ''
      if (id.length > 0) id = sanitizeAttributeValue('id', id) ?? ''
      if (id.length === 0) {
        const idAttr = attrs.find((item) => item !== null && typeof item === 'object' && item.name === 'id')
        if (idAttr !== undefined) {
          const idValue = sanitizeAttributeValue('id', idAttr.value)
          if (idValue !== null) id = idValue
        }
      }
      if (id.length > 0 && !isDynamicValue(id)) push('id', `#${cssIdentifier(id)}`, 0.88)
      const labelValue = attrValue('aria-label')
      if (labelValue !== null) push('label', `[aria-label="${cssString(labelValue)}"]`, 0.8)
      if (isFormTag(tag)) {
        const nameValue = attrValue('name')
        if (nameValue !== null && !isDynamicValue(nameValue)) push('label', `[name="${cssString(nameValue)}"]`, 0.72)
      }
      const role = typeof source.role === 'string' ? source.role.trim() : ''
      if (role.length > 0) push('role', `[role="${cssString(role)}"]`, 0.35)
      if (tag.length > 0 && tag !== 'html' && tag !== 'body') push('tag', tag, 0.2)
      const path = typeof source.path === 'string' ? source.path : ''
      if (path.length > 0) push('path', path, 0.1)
      candidates.sort((left, right) => right.reliability - left.reliability)
      return candidates.slice(0, 6)
    }

    /**
     * Whether a tag is a form control.
     * @param {string} tag - lowercase tag name.
     * @returns {boolean} whether the tag is a form control.
     */
    function isFormTag(tag) {
      return tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button'
    }

    /** Stable ancestors kept on a record: bounded so one annotation stays a locator, not a page dump. */
    const ANNOTATION_MAX_ANCESTORS = 3

    /** Attribute names that may anchor a verified unique selector, most reliable first. */
    const UNIQUE_SELECTOR_ATTRIBUTES = [
      'data-row-key',
      'data-conversation-region',
      'data-testid',
      'data-slot',
      'data-conversation-session'
    ]

    /** Attribute names kept on one persisted stable-ancestor entry. */
    const STABLE_ANCESTOR_ATTRIBUTES = new Set([
      'data-row-key',
      'data-conversation-region',
      'data-conversation-session',
      'data-testid',
      'data-slot',
      'id',
      'aria-label'
    ])

    /**
     * Normalize the bounded, sanitized stable-ancestor list of one record.
     *
     * Only identity-shaped attributes survive (no class/style/text): each value
     * goes through the same sanitizer as a locator candidate, and a generated
     * `id` is dropped like it is everywhere else.
     * @param {Array<object>} entries - nearest-first `[{ tag, attrs: [{ name, value }] }]`.
     * @returns {Array<{ tag: string, attrs: Record<string, string> }>} up to three entries.
     */
    function buildStableAncestors(entries) {
      const list = Array.isArray(entries) ? entries : []
      const result = []
      for (const entry of list) {
        if (result.length >= ANNOTATION_MAX_ANCESTORS) break
        if (entry === null || typeof entry !== 'object') continue
        const tag = typeof entry.tag === 'string' ? entry.tag.trim().toLowerCase() : ''
        if (tag.length === 0 || tag === 'body' || tag === 'html') continue
        const attrs = Array.isArray(entry.attrs) ? entry.attrs : []
        const kept = {}
        for (const attr of attrs) {
          if (attr === null || typeof attr !== 'object') continue
          const name = typeof attr.name === 'string' ? attr.name.trim().toLowerCase() : ''
          if (!STABLE_ANCESTOR_ATTRIBUTES.has(name)) continue
          const value = sanitizeAttributeValue(name, attr.value)
          if (value === null) continue
          if (name === 'id' && isDynamicValue(value)) continue
          kept[name] = value
        }
        if (Object.keys(kept).length === 0) continue
        result.push({ tag, attrs: kept })
      }
      return result
    }

    /**
     * Build one verified-unique CSS selector for a captured element.
     *
     * Candidate order: the element's own stable data/id/aria-label attribute, then
     * the nearest stable ancestor plus a `tag:nth-of-type(n)` relative path (at
     * most six steps). Class names are never used, and every candidate is checked
     * with the injected `queryAll`, so `uniqueVerified` is truthful rather than
     * hopeful. Pure: the caller injects the query engine, which is how the unit
     * seam tests the algorithm without a DOM (D11).
     * @param {object} descriptor - `{ tag, attrs: [{ name, value }], anchorPaths?: [{ selector, steps: [{ tag, index }] }] }`.
     * @param {Function} queryAll - selector => iterable of element-likes with `tagName`.
     * @returns {{ selector: string | null, verified: boolean }} the verified selector, or a null fallback.
     */
    function buildUniqueSelector(descriptor, queryAll) {
      const none = { selector: null, verified: false }
      if (typeof queryAll !== 'function') return none
      const source = descriptor !== null && typeof descriptor === 'object' ? descriptor : {}
      const tag = typeof source.tag === 'string' ? source.tag.trim().toLowerCase() : ''
      if (tag.length === 0) return none
      const attrs = Array.isArray(source.attrs) ? source.attrs : []
      /**
       * Read one already-captured attribute, re-sanitizing it.
       * @param {string} name - attribute name.
       * @returns {string | null} safe value.
       */
      const attrValue = (name) => {
        const attr = attrs.find((item) => item !== null && typeof item === 'object' && item.name === name)
        if (attr === undefined) return null
        return sanitizeAttributeValue(name, attr.value)
      }
      /**
       * Whether a selector matches exactly one element and that element has the expected tag.
       * @param {string} selector - candidate selector.
       * @returns {boolean} whether it is unique for this tag.
       */
      const matchesOne = (selector) => {
        let list
        try {
          list = queryAll(selector)
        } catch {
          return false
        }
        if (list === null || list === undefined || typeof list[Symbol.iterator] !== 'function') return false
        let count = 0
        for (const element of list) {
          if (element === null || typeof element !== 'object') continue
          if (typeof element.tagName !== 'string') continue
          if (element.tagName.toLowerCase() !== tag) continue
          count += 1
          if (count > 1) return false
        }
        return count === 1
      }
      for (const name of UNIQUE_SELECTOR_ATTRIBUTES) {
        const value = attrValue(name)
        if (value === null) continue
        const selector = `${tag}[${name}="${cssString(value)}"]`
        if (matchesOne(selector)) return { selector, verified: true }
      }
      const id = attrValue('id')
      if (id !== null && !isDynamicValue(id)) {
        const selector = `#${cssIdentifier(id)}`
        if (matchesOne(selector)) return { selector, verified: true }
      }
      const label = attrValue('aria-label')
      if (label !== null) {
        const selector = `${tag}[aria-label="${cssString(label)}"]`
        if (matchesOne(selector)) return { selector, verified: true }
      }
      const anchors = Array.isArray(source.anchorPaths) ? source.anchorPaths : []
      for (const anchor of anchors) {
        if (anchor === null || typeof anchor !== 'object') continue
        if (typeof anchor.selector !== 'string' || anchor.selector.length === 0) continue
        const steps = Array.isArray(anchor.steps) ? anchor.steps.slice(0, 6) : []
        if (steps.length === 0) continue
        const tail = []
        let usable = true
        for (const step of steps) {
          const stepTag = step !== null && typeof step === 'object' && typeof step.tag === 'string' ? step.tag.trim().toLowerCase() : ''
          const index = step !== null && typeof step === 'object' && typeof step.index === 'number' && Number.isFinite(step.index) && step.index >= 1
            ? Math.round(step.index)
            : 1
          if (stepTag.length === 0) {
            usable = false
            break
          }
          tail.push(`${stepTag}:nth-of-type(${index})`)
        }
        if (!usable) continue
        const selector = `${anchor.selector} > ${tail.join(' > ')}`
        if (matchesOne(selector)) return { selector, verified: true }
      }
      return none
    }

    /**
     * Text used by the "Copy locator" action: the verified unique selector when
     * present, else the best ordered candidate, else the structural path.
     * @param {object} ref - ElementRef.
     * @returns {string} locator text (empty only for a malformed ref).
     */
    function annotationLocatorText(ref) {
      const locator = ref !== null && typeof ref === 'object' && ref.locator !== null && typeof ref.locator === 'object' ? ref.locator : {}
      const unique = typeof locator.uniqueSelector === 'string' && locator.uniqueSelector.length > 0 ? locator.uniqueSelector : ''
      if (unique.length > 0) return unique
      const candidates = Array.isArray(locator.candidates) ? locator.candidates : []
      const best = candidates.find((candidate) => candidate !== null && typeof candidate === 'object'
        && typeof candidate.value === 'string' && candidate.value.length > 0
        && candidate.kind !== 'tag' && candidate.kind !== 'path')
      if (best !== undefined) return best.value
      const path = typeof locator.path === 'string' && locator.path.length > 0 ? locator.path : ''
      if (path.length > 0) return path
      return describeLocator(ref)
    }

    /**
     * Stable identity key for one element, used for collection de-duplication.
     * @param {string} tag - lowercase tag name.
     * @param {object} source - element descriptor.
     * @param {Array<object>} candidates - ordered candidates.
     * @returns {string} identity key.
     */
    function identityKeyForCandidates(tag, source, candidates) {
      // A data attribute or id is a real identity; an accessible label alone is not
      // (two different "Close" buttons share it), so label-only identity carries the
      // structural context needed to tell those elements apart (F3).
      const stable = candidates.find((candidate) => candidate.kind === 'data' || candidate.kind === 'id')
      if (stable !== undefined) return `${stable.kind}:${stable.value}`
      const path = typeof source.path === 'string' && source.path.length > 0 ? source.path : tag
      const label = candidates.find((candidate) => candidate.kind === 'label')
      if (label !== undefined) return `label:${label.value}|${tag}|${path}`
      const role = typeof source.role === 'string' && source.role.length > 0 ? source.role : ''
      const text = sanitizeText(source.text, 40)
      return `path:${role}:${path}:${text}`
    }

    /**
     * Build one serializable ElementRef v2 (never a DOM node, never HTML).
     *
     * v2 adds the identity and "find it again" fields the audit approved (D11):
     * a verified unique selector, bounded sanitized stable ancestors, the surface
     * kind / ephemeral flag, Session Workspace identity, route, and a viewport
     * snapshot. It deliberately carries no outerHTML, JS path, XPath, computed
     * styles, or input values.
     * @param {object} descriptor - { tag, id, role, name, attrs, text, component, path, tagPath, isEditable, insideComposer, uniqueSelector?, uniqueVerified?, ancestors? }.
     * @param {object} context - { sessionId, at, order, bounds, levelChain, cwd?, workspaceLabel?, route?, viewport?, surface? }.
     * @returns {object} the ElementRef.
     */
    function buildElementRef(descriptor, context) {
      const source = descriptor !== null && typeof descriptor === 'object' ? descriptor : {}
      const scope = context !== null && typeof context === 'object' ? context : {}
      const tag = (typeof source.tag === 'string' ? source.tag.trim().toLowerCase() : '') || 'element'
      const candidates = selectorCandidates(source)
      const levelChain = Array.isArray(scope.levelChain) ? scope.levelChain : []
      const contextLabels = levelChain.filter((label) => typeof label === 'string' && label.length > 0).slice(0, 2)
      const at = typeof scope.at === 'number' && Number.isFinite(scope.at) ? scope.at : Date.now()
      const order = typeof scope.order === 'number' && Number.isFinite(scope.order) ? scope.order : 0
      const bounds = normalizeAnnotationBounds(scope.bounds) ?? { x: 0, y: 0, width: 0, height: 0 }
      const sessionId = typeof scope.sessionId === 'string' && scope.sessionId.length > 0 ? scope.sessionId : null
      const cwd = typeof scope.cwd === 'string' && scope.cwd.length > 0 ? scope.cwd : null
      const workspaceLabel = typeof scope.workspaceLabel === 'string' && scope.workspaceLabel.length > 0
        ? scope.workspaceLabel
        : annotationWorkspaceLabel(cwd)
      const surface = scope.surface === 'floating' ? 'floating' : 'page'
      const uniqueSelector = typeof source.uniqueSelector === 'string' && source.uniqueSelector.length > 0
        ? source.uniqueSelector
        : null
      return {
        version: 2,
        id: `psa-${order}-${annotationRandomToken(6)}`,
        at,
        updatedAt: at,
        order,
        session: { sessionId, cwd, workspaceLabel },
        route: annotationRoutePath(scope.route),
        locator: {
          tag,
          role: sanitizeText(source.role, 32),
          name: sanitizeText(source.name, 60),
          candidates,
          key: identityKeyForCandidates(tag, source, candidates),
          path: typeof source.path === 'string' ? source.path : '',
          uniqueSelector,
          uniqueVerified: uniqueSelector !== null && source.uniqueVerified === true,
          ancestors: buildStableAncestors(source.ancestors),
          surface,
          // A floating surface is transient by definition: it can disappear when
          // the card/menu closes, so its locator is the only thing that survives.
          ephemeral: surface === 'floating'
        },
        component: typeof source.component === 'string' && source.component.length > 0 ? source.component : 'other',
        text: sanitizeText(source.text, 80),
        // Derived from the full sanitized text; never the text itself (F11).
        textDigest: typeof source.textDigest === 'string' ? source.textDigest : '',
        context: contextLabels.join(' › '),
        bounds,
        viewport: normalizeAnnotationViewport(scope.viewport),
        note: '',
        // Phase 1 keeps the collection semantics: every collected record is part of
        // the batch. Phase 2 owns the per-item include toggle.
        included: true,
        // Capture-time resolution status; Phase 2 refreshes it for the detail card.
        lastStatus: 'resolved'
      }
    }

    /**
     * The stable identity of one ref, used for de-duplication.
     * @param {object} ref - ElementRef.
     * @returns {string} identity key.
     */
    function identityKeyOf(ref) {
      if (ref === null || typeof ref !== 'object') return ''
      const locator = ref.locator
      if (locator === null || typeof locator !== 'object') return ''
      return typeof locator.key === 'string' ? locator.key : ''
    }

    /**
     * Human-readable locator summary: tag, label, and the most stable selector.
     * @param {object} ref - ElementRef.
     * @returns {string} one-line summary.
     */
    function describeLocator(ref) {
      const locator = ref !== null && typeof ref === 'object' && ref.locator !== null && typeof ref.locator === 'object' ? ref.locator : {}
      const tag = typeof locator.tag === 'string' && locator.tag.length > 0 ? locator.tag : 'element'
      const name = typeof locator.name === 'string' ? locator.name : ''
      const candidates = Array.isArray(locator.candidates) ? locator.candidates : []
      const stable = candidates.find((candidate) => candidate !== null && typeof candidate === 'object' && candidate.kind !== 'tag' && candidate.kind !== 'path')
      const unique = typeof locator.uniqueSelector === 'string' && locator.uniqueSelector.length > 0 ? locator.uniqueSelector : ''
      const head = name.length > 0 ? `${tag} "${name}"` : tag
      const tail = unique.length > 0
        ? unique
        : (stable !== undefined
          ? stable.value
          : (typeof locator.path === 'string' && locator.path.length > 0 ? locator.path : ''))
      const summary = tail.length > 0 ? `${head} · ${tail}` : head
      return summary.length > 160 ? `${summary.slice(0, 159)}…` : summary
    }

    /**
     * Display label of one element: accessible name, then text summary, then tag.
     * @param {object} ref - ElementRef.
     * @returns {string} label.
     */
    function elementLabel(ref) {
      const locator = ref !== null && typeof ref === 'object' && ref.locator !== null && typeof ref.locator === 'object' ? ref.locator : {}
      const name = typeof locator.name === 'string' ? locator.name : ''
      if (name.length > 0) return name
      const text = ref !== null && typeof ref === 'object' && typeof ref.text === 'string' ? ref.text : ''
      if (text.length > 0) return text
      return typeof locator.tag === 'string' && locator.tag.length > 0 ? locator.tag : 'element'
    }

    /** Locator candidate kinds persisted by the resolver. */
    const ANNOTATION_CANDIDATE_KINDS = new Set(['data', 'id', 'label', 'role', 'tag', 'path'])

    /** Resolution statuses a persisted record may carry (display-only in Phase 1). */
    const ANNOTATION_STATUS_VALUES = new Set(['resolved', 'ambiguous', 'missing', 'changed'])

    /**
     * Accept one stored selector string from localStorage.
     *
     * Records are untrusted input after a reload: only a bounded selector-shaped
     * string survives, and it is still passed through `querySelectorAll` inside a
     * try/catch by the resolver. No HTML can be stored or executed (D11/D14).
     * @param {unknown} value - raw stored value.
     * @returns {string | null} safe selector text.
     */
    function sanitizeStoredSelector(value) {
      if (typeof value !== 'string') return null
      const text = value.replace(ANNOTATION_CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
      if (text.length === 0 || text.length > 400) return null
      if (text.includes('<') || text.includes('javascript:')) return null
      return text
    }

    /**
     * Normalize one stored locator candidate list.
     * @param {unknown} raw - raw candidate array.
     * @returns {Array<{ kind: string, value: string, reliability: number }>} at most six candidates.
     */
    function normalizeStoredCandidates(raw) {
      if (!Array.isArray(raw)) return []
      const result = []
      const seen = new Set()
      for (const item of raw) {
        if (item === null || typeof item !== 'object') continue
        const kind = typeof item.kind === 'string' && ANNOTATION_CANDIDATE_KINDS.has(item.kind) ? item.kind : ''
        const value = sanitizeStoredSelector(item.value)
        if (kind.length === 0 || value === null || seen.has(value)) continue
        seen.add(value)
        const reliability = typeof item.reliability === 'number' && Number.isFinite(item.reliability)
          ? Math.min(1, Math.max(0, item.reliability))
          : 0.1
        result.push({ kind, value, reliability })
      }
      result.sort((left, right) => right.reliability - left.reliability)
      return result.slice(0, 6)
    }

    /**
     * Normalize one persisted AnnotationRecord (v2, v1 tolerated).
     *
     * This is the storage boundary: every field is whitelisted, every string
     * sanitized, and invalid records are dropped instead of repaired into
     * something that claims a target it cannot resolve. `note` is user-authored
     * and survives verbatim (no redaction, no truncation) like the draft itself.
     * @param {unknown} raw - parsed record.
     * @param {number} [fallbackOrder] - order to use when the record has none.
     * @returns {object | null} normalized record, or null when it must be dropped.
     */
    function normalizeAnnotationRecord(raw, fallbackOrder) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
      const version = raw.version
      if (version !== undefined && version !== 1 && version !== 2) return null
      const id = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 120 ? raw.id : ''
      if (id.length === 0) return null
      const rawLocator = raw.locator !== null && typeof raw.locator === 'object' ? raw.locator : null
      if (rawLocator === null) return null
      const candidates = normalizeStoredCandidates(rawLocator.candidates)
      if (candidates.length === 0) return null
      const tag = (typeof rawLocator.tag === 'string' ? rawLocator.tag.trim().toLowerCase().slice(0, 40) : '') || 'element'
      const path = typeof rawLocator.path === 'string' ? sanitizeStoredSelector(rawLocator.path) ?? '' : ''
      const role = typeof rawLocator.role === 'string' ? sanitizeText(rawLocator.role, 32) : ''
      const name = typeof rawLocator.name === 'string' ? sanitizeText(rawLocator.name, 60) : ''
      const text = typeof raw.text === 'string' ? sanitizeText(raw.text, 80) : ''
      const key = typeof rawLocator.key === 'string' && rawLocator.key.length > 0 && rawLocator.key.length <= 300
        ? rawLocator.key
        : identityKeyForCandidates(tag, { path, role, text }, candidates)
      const uniqueSelector = sanitizeStoredSelector(rawLocator.uniqueSelector)
      const uniqueVerified = uniqueSelector !== null && rawLocator.uniqueVerified === true
      const surface = rawLocator.surface === 'floating' ? 'floating' : 'page'
      const ancestorInput = Array.isArray(rawLocator.ancestors) ? rawLocator.ancestors : []
      const ancestors = buildStableAncestors(ancestorInput.map((entry) => {
        const item = entry !== null && typeof entry === 'object' ? entry : {}
        const attrs = item.attrs !== null && typeof item.attrs === 'object' && !Array.isArray(item.attrs)
          ? Object.entries(item.attrs).map(([attrName, attrValue]) => ({ name: attrName, value: attrValue }))
          : []
        return { tag: item.tag, attrs }
      }))
      const rawSession = raw.session !== null && typeof raw.session === 'object' ? raw.session : {}
      const sessionId = typeof rawSession.sessionId === 'string' && rawSession.sessionId.length > 0 && rawSession.sessionId.length <= 120
        ? rawSession.sessionId
        : null
      const cwd = typeof rawSession.cwd === 'string' && rawSession.cwd.length > 0 && rawSession.cwd.length <= 4096
        ? rawSession.cwd.replace(ANNOTATION_CONTROL_CHARS, '')
        : null
      const workspaceLabel = typeof rawSession.workspaceLabel === 'string' && rawSession.workspaceLabel.length > 0
        ? sanitizeText(rawSession.workspaceLabel, 80)
        : annotationWorkspaceLabel(cwd)
      const at = typeof raw.at === 'number' && Number.isFinite(raw.at) && raw.at > 0 ? Math.round(raw.at) : 0
      const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? Math.round(raw.updatedAt) : at
      const order = typeof raw.order === 'number' && Number.isFinite(raw.order) && raw.order >= 0
        ? Math.round(raw.order)
        : (typeof fallbackOrder === 'number' && Number.isFinite(fallbackOrder) ? Math.round(fallbackOrder) : 0)
      const component = typeof raw.component === 'string' && raw.component.length > 0 ? raw.component.slice(0, 32) : 'other'
      const context = typeof raw.context === 'string' ? sanitizeText(raw.context, 120) : ''
      const textDigestValue = typeof raw.textDigest === 'string' && /^[0-9a-f]{0,8}$/.test(raw.textDigest) ? raw.textDigest : ''
      const lastStatus = typeof raw.lastStatus === 'string' && ANNOTATION_STATUS_VALUES.has(raw.lastStatus) ? raw.lastStatus : null
      return {
        version: 2,
        id,
        at,
        updatedAt,
        order,
        session: { sessionId, cwd, workspaceLabel },
        route: annotationRoutePath(raw.route),
        locator: {
          tag,
          role,
          name,
          candidates,
          key,
          path,
          uniqueSelector,
          uniqueVerified,
          ancestors,
          surface,
          ephemeral: surface === 'floating'
        },
        component,
        text,
        textDigest: textDigestValue,
        context,
        bounds: normalizeAnnotationBounds(raw.bounds) ?? { x: 0, y: 0, width: 0, height: 0 },
        viewport: normalizeAnnotationViewport(raw.viewport),
        note: normalizeUserNote(raw.note),
        included: raw.included !== false,
        lastStatus
      }
    }

    /**
     * Parse the persisted annotation document.
     *
     * Tolerant by contract: bad JSON, unknown document versions, malformed records,
     * and extra fields never throw; valid records are normalized, invalid ones
     * dropped, duplicates removed, and the list capped at the record limit.
     * @param {unknown} text - raw localStorage value.
     * @returns {{ version: number, updatedAt: number, records: Array<object> }} sanitized document.
     */
    function parseAnnotationStore(text) {
      const empty = { version: 2, updatedAt: 0, records: [] }
      if (typeof text !== 'string' || text.length === 0) return empty
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        return empty
      }
      let rawRecords
      if (Array.isArray(parsed)) {
        // Tolerate the bare-array shape while still validating every record.
        rawRecords = parsed
      } else if (parsed !== null && typeof parsed === 'object') {
        const version = parsed.version
        if (version !== undefined && version !== 1 && version !== 2) return empty
        rawRecords = Array.isArray(parsed.records) ? parsed.records : []
      } else {
        return empty
      }
      const updatedAt = parsed !== null && typeof parsed === 'object' && typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
        ? Math.round(parsed.updatedAt)
        : 0
      const records = []
      const seen = new Set()
      for (let index = 0; index < rawRecords.length; index += 1) {
        if (records.length >= ANNOTATION_RECORD_LIMIT) break
        const record = normalizeAnnotationRecord(rawRecords[index], index)
        if (record === null) continue
        if (seen.has(record.id)) continue
        seen.add(record.id)
        records.push(record)
      }
      records.sort((left, right) => (left.order - right.order) || (left.at - right.at))
      return { version: 2, updatedAt, records }
    }

    /**
     * Serialize the persisted annotation document.
     * @param {Array<object>} records - collection records.
     * @param {number} updatedAt - epoch ms of this write.
     * @returns {string} JSON document, records normalized and capped.
     */
    function serializeAnnotationStore(records, updatedAt) {
      const list = []
      const seen = new Set()
      const input = Array.isArray(records) ? records : []
      for (let index = 0; index < input.length; index += 1) {
        if (list.length >= ANNOTATION_RECORD_LIMIT) break
        const record = normalizeAnnotationRecord(input[index], index)
        if (record === null) continue
        if (seen.has(record.id)) continue
        seen.add(record.id)
        list.push(record)
      }
      list.sort((left, right) => (left.order - right.order) || (left.at - right.at))
      const at = typeof updatedAt === 'number' && Number.isFinite(updatedAt) && updatedAt > 0 ? Math.round(updatedAt) : Date.now()
      return JSON.stringify({ version: 2, updatedAt: at, records: list })
    }

    /**
     * One ordered collection entry list update, never mutating the input.
     *
     * The record cap is enforced here, at the single commit boundary (D15): an
     * add that would exceed the limit is refused explicitly (`rejected: true`)
     * instead of silently dropping the oldest record or the new one.
     * @param {Array<object>} list - current entries (ElementRefs with `note`).
     * @param {object} entry - ElementRef to add or update.
     * @param {number} [limit] - maximum record count, default 100.
     * @returns {{ list: Array<object>, added: boolean, updated: boolean, rejected: boolean }} next list and what happened.
     */
    function collectionAdd(list, entry, limit) {
      const current = Array.isArray(list) ? list : []
      const cap = typeof limit === 'number' && Number.isFinite(limit) && limit >= 1 ? Math.round(limit) : ANNOTATION_RECORD_LIMIT
      const ref = entry !== null && typeof entry === 'object' && entry.ref !== null && typeof entry.ref === 'object' ? entry.ref : entry
      if (ref === null || typeof ref !== 'object') return { list: current.slice(), added: false, updated: false, rejected: false }
      const key = identityKeyOf(ref)
      const sessionId = ref.session !== null && typeof ref.session === 'object' ? ref.session.sessionId ?? null : null
      const index = current.findIndex((item) => {
        const candidate = item !== null && typeof item === 'object' && item.ref !== null && typeof item.ref === 'object' ? item.ref : item
        if (candidate === null || typeof candidate !== 'object') return false
        const candidateSession = candidate.session !== null && typeof candidate.session === 'object' ? candidate.session.sessionId ?? null : null
        return identityKeyOf(candidate) === key && candidateSession === sessionId
      })
      if (index >= 0) {
        const next = current.slice()
        const existing = next[index] !== null && typeof next[index] === 'object' && next[index].ref !== null && typeof next[index].ref === 'object' ? next[index].ref : next[index]
        // Re-adding a selected element must not wipe a note the user already wrote:
        // only an explicit non-empty note updates it here. Clearing a note is the
        // collection editor's explicit `collectionSetNote` path (F4).
        const incomingNote = typeof ref.note === 'string' ? ref.note.trim() : ''
        next[index] = {
          ...ref,
          id: existing.id ?? ref.id,
          at: existing.at ?? ref.at,
          order: typeof existing.order === 'number' ? existing.order : ref.order,
          note: incomingNote.length > 0
            ? ref.note
            : (typeof existing.note === 'string' ? existing.note : '')
        }
        return { list: next, added: false, updated: true, rejected: false }
      }
      if (current.length >= cap) return { list: current.slice(), added: false, updated: false, rejected: true }
      return { list: current.concat([ref]), added: true, updated: false, rejected: false }
    }

    /**
     * Remove one collection entry by ref id.
     * @param {Array<object>} list - current entries.
     * @param {string} refId - ref id to remove.
     * @returns {Array<object>} next entries.
     */
    function collectionRemove(list, refId) {
      if (!Array.isArray(list)) return []
      return list.filter((entry) => {
        const ref = entry !== null && typeof entry === 'object' && entry.ref !== null && typeof entry.ref === 'object' ? entry.ref : entry
        return ref === null || typeof ref !== 'object' || ref.id !== refId
      })
    }

    /**
     * Clear the collection.
     * @returns {Array<object>} an empty list.
     */
    function collectionClear() {
      return []
    }

    /**
     * Update one collection entry's note, keeping order.
     * @param {Array<object>} list - current entries.
     * @param {string} refId - ref id to update.
     * @param {string} note - replacement note.
     * @returns {Array<object>} next entries.
     */
    function collectionSetNote(list, refId, note) {
      if (!Array.isArray(list)) return []
      const text = typeof note === 'string' ? note : ''
      return list.map((entry) => {
        const ref = entry !== null && typeof entry === 'object' && entry.ref !== null && typeof entry.ref === 'object' ? entry.ref : entry
        if (ref === null || typeof ref !== 'object' || ref.id !== refId) return entry
        return { ...ref, note: text }
      })
    }

    /**
     * Next collection `order` value: one past the highest existing order.
     * @param {Array<object>} list - current entries.
     * @returns {number} next order.
     */
    function nextAnnotationOrder(list) {
      let highest = -1
      for (const entry of Array.isArray(list) ? list : []) {
        if (entry !== null && typeof entry === 'object' && typeof entry.order === 'number' && Number.isFinite(entry.order)) {
          highest = Math.max(highest, Math.round(entry.order))
        }
      }
      return highest + 1
    }

    /**
     * Commit one record: insert a new annotation or update the existing identity in
     * place (A3/T5). An update keeps `id`/`at`/`order`/`included` and refreshes the
     * locator, non-empty note, `lastStatus`, and `updatedAt`; the cap is enforced at
     * this single commit boundary (D15) instead of silently dropping a record.
     * @param {Array<object>} list - current collection entries.
     * @param {object} record - ElementRef v2 to commit.
     * @param {number} [limit] - maximum record count, default 100.
     * @param {number} [now] - epoch ms of this commit, default `record.updatedAt`/Date.now().
     * @returns {{ list: Array<object>, added: boolean, updated: boolean, rejected: boolean }} result.
     */
    function upsertAnnotationRecord(list, record, limit, now) {
      const current = Array.isArray(list) ? list : []
      const cap = typeof limit === 'number' && Number.isFinite(limit) && limit >= 1 ? Math.round(limit) : ANNOTATION_RECORD_LIMIT
      if (record === null || typeof record !== 'object' || Array.isArray(record)) {
        return { list: current.slice(), added: false, updated: false, rejected: false }
      }
      const stamp = typeof now === 'number' && Number.isFinite(now) && now > 0
        ? Math.round(now)
        : (typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) && record.updatedAt > 0 ? Math.round(record.updatedAt) : Date.now())
      const key = identityKeyOf(record)
      const sessionId = record.session !== null && typeof record.session === 'object' ? record.session.sessionId ?? null : null
      const index = current.findIndex((entry) => {
        if (entry === null || typeof entry !== 'object') return false
        const entrySession = entry.session !== null && typeof entry.session === 'object' ? entry.session.sessionId ?? null : null
        return identityKeyOf(entry) === key && entrySession === sessionId
      })
      if (index >= 0) {
        const existing = current[index]
        const next = current.slice()
        const incomingNote = typeof record.note === 'string' ? record.note.trim() : ''
        next[index] = {
          ...record,
          id: typeof existing.id === 'string' && existing.id.length > 0 ? existing.id : record.id,
          at: typeof existing.at === 'number' && Number.isFinite(existing.at) ? existing.at : record.at,
          order: typeof existing.order === 'number' && Number.isFinite(existing.order) ? existing.order : record.order,
          updatedAt: stamp,
          included: existing.included !== false,
          lastStatus: typeof record.lastStatus === 'string' ? record.lastStatus : (existing.lastStatus ?? null),
          note: incomingNote.length > 0 ? record.note : (typeof existing.note === 'string' ? existing.note : '')
        }
        return { list: next, added: false, updated: true, rejected: false }
      }
      if (current.length >= cap) return { list: current.slice(), added: false, updated: false, rejected: true }
      return {
        list: current.concat([{
          ...record,
          version: 2,
          updatedAt: stamp,
          // Commit order is the collection's insertion position, never the pick
          // timestamp: the collection is an ordered list and persistence sorts by
          // `order`, so a new record must land after the current last one.
          order: nextAnnotationOrder(current),
          included: record.included !== false,
          lastStatus: typeof record.lastStatus === 'string' ? record.lastStatus : null
        }]),
        added: true,
        updated: false,
        rejected: false
      }
    }

    /**
     * Remove one record by id (A3/T5). Immutable; a missing id is a no-op copy.
     * @param {Array<object>} list - current entries.
     * @param {string} refId - record id.
     * @returns {Array<object>} next entries.
     */
    function removeAnnotationRecord(list, refId) {
      return collectionRemove(list, refId)
    }

    /**
     * Restore one removed record at its original array position (A3/T5 undo).
     * @param {Array<object>} list - current entries.
     * @param {object} record - removed record.
     * @param {number} [index] - original array index; clamped, default append.
     * @returns {Array<object>} next entries.
     */
    function restoreAnnotationRecord(list, record, index) {
      const current = Array.isArray(list) ? list : []
      if (record === null || typeof record !== 'object' || Array.isArray(record)) return current.slice()
      const at = typeof index === 'number' && Number.isFinite(index)
        ? Math.min(Math.max(Math.round(index), 0), current.length)
        : current.length
      return current.slice(0, at).concat([record], current.slice(at))
    }

    /**
     * Move one record one slot up or down and keep `order` contiguous (A3/T5;
     * wired here for the Phase 2-B rail, which reuses the same action).
     * @param {Array<object>} list - current entries.
     * @param {string} refId - record id.
     * @param {number} delta - -1 to move up (towards index 0), +1 to move down.
     * @returns {Array<object>} next entries.
     */
    function moveAnnotationRecord(list, refId, delta) {
      const current = Array.isArray(list) ? list.slice() : []
      const index = current.findIndex((entry) => entry !== null && typeof entry === 'object' && entry.id === refId)
      if (index < 0) return current
      const step = delta === -1 || (typeof delta === 'number' && delta < 0) ? -1 : 1
      const target = index + step
      if (target < 0 || target >= current.length) return current
      const next = current.slice()
      const moved = next[index]
      next[index] = next[target]
      next[target] = moved
      return next.map((entry, position) => (entry !== null && typeof entry === 'object' ? { ...entry, order: position } : entry))
    }

    /**
     * Set one record's batch-include flag (A3/T5). The controller forces other-session
     * records to `included: false`; the pure helper only applies what it is given.
     * @param {Array<object>} list - current entries.
     * @param {string} refId - record id.
     * @param {boolean} included - whether the record participates in a batch.
     * @returns {Array<object>} next entries.
     */
    function toggleAnnotationInclude(list, refId, included) {
      if (!Array.isArray(list)) return []
      const flag = included === true
      return list.map((entry) => {
        if (entry === null || typeof entry !== 'object' || entry.id !== refId) return entry
        if (entry.included === flag) return entry
        return { ...entry, included: flag }
      })
    }

    /**
     * Remove one record (or clear the whole list) while capturing the single-slot
     * undo payload (A3/T5/D5). The newest removal replaces any previous slot.
     * @param {Array<object>} list - current entries.
     * @param {string} refId - record id to remove (ignored when kind is `clear`).
     * @param {'single' | 'clear'} [kind] - removal shape, default `single`.
     * @param {number} [at] - epoch ms of the removal.
     * @returns {{ list: Array<object>, undo: object | null }} next entries and undo payload.
     */
    function annotationUndoRemove(list, refId, kind, at) {
      const current = Array.isArray(list) ? list : []
      const stamp = typeof at === 'number' && Number.isFinite(at) && at > 0 ? Math.round(at) : Date.now()
      if (kind === 'clear') {
        if (current.length === 0) return { list: current.slice(), undo: null }
        return { list: [], undo: { kind: 'clear', records: current.slice(), at: stamp } }
      }
      const index = current.findIndex((entry) => entry !== null && typeof entry === 'object' && entry.id === refId)
      if (index < 0) return { list: current.slice(), undo: null }
      return {
        list: collectionRemove(current, refId),
        undo: { kind: 'single', record: current[index], index, at: stamp }
      }
    }

    /**
     * Apply one undo payload (A3/T5/D5): restore a single record at its original
     * index, or rebuild a cleared collection in its original order.
     * @param {Array<object>} list - current entries.
     * @param {object | null} undo - payload returned by {@link annotationUndoRemove}.
     * @returns {Array<object>} next entries.
     */
    function annotationUndoRestore(list, undo) {
      const current = Array.isArray(list) ? list : []
      if (undo === null || typeof undo !== 'object') return current.slice()
      if (undo.kind === 'clear') {
        const records = Array.isArray(undo.records) ? undo.records : []
        if (records.length === 0) return current.slice()
        const ids = new Set(current.map((entry) => (entry !== null && typeof entry === 'object' ? entry.id : null)))
        const merged = current.concat(records.filter((record) => record !== null && typeof record === 'object' && !ids.has(record.id)))
        const orderOf = (entry) => (typeof entry?.order === 'number' && Number.isFinite(entry.order) ? entry.order : 0)
        const atOf = (entry) => (typeof entry?.at === 'number' && Number.isFinite(entry.at) ? entry.at : 0)
        return merged.slice().sort((left, right) => (orderOf(left) - orderOf(right)) || (atOf(left) - atOf(right)))
      }
      if (undo.kind === 'multi') {
        // Restore in ascending original-index order so every record lands back
        // where it was removed from; a newer duplicate id is left untouched.
        const entries = Array.isArray(undo.entries) ? undo.entries : []
        if (entries.length === 0) return current.slice()
        const ids = new Set(current.map((entry) => (entry !== null && typeof entry === 'object' ? entry.id : null)))
        const ordered = entries
          .filter((item) => item !== null && typeof item === 'object'
            && item.record !== null && typeof item.record === 'object' && !ids.has(item.record.id))
          .slice()
          .sort((left, right) => (Number(left.index) || 0) - (Number(right.index) || 0))
        let next = current
        for (const item of ordered) next = restoreAnnotationRecord(next, item.record, item.index)
        return next
      }
      if (undo.record === null || typeof undo.record !== 'object') return current.slice()
      return restoreAnnotationRecord(current, undo.record, undo.index)
    }

    /**
     * One-line requirement excerpt for a page mark badge (A3/T6): first non-empty
     * line, whitespace collapsed, truncated to `max` characters with an ellipsis.
     * @param {unknown} note - requirement text.
     * @param {number} [max] - maximum characters, default 18.
     * @returns {{ text: string, empty: boolean, truncated: boolean }} excerpt.
     */
    function annotationMarkerBadgeText(note, max) {
      const source = typeof note === 'string' ? note : ''
      const limit = typeof max === 'number' && Number.isFinite(max) && max > 1 ? Math.round(max) : ANNOTATION_MARK_SUMMARY_MAX
      let line = ''
      for (const candidate of source.split(/\r?\n/)) {
        const collapsed = candidate.replace(/\s+/g, ' ').trim()
        if (collapsed.length > 0) {
          line = collapsed
          break
        }
      }
      if (line.length === 0) return { text: '', empty: true, truncated: false }
      if (line.length <= limit) return { text: line, empty: false, truncated: false }
      return { text: `${line.slice(0, Math.max(1, limit - 1)).trimEnd()}…`, empty: false, truncated: true }
    }

    /**
     * Remove several records at once while capturing a multi-entry undo payload
     * (A3/T8/D5: `delete selected` also enters the 5 s undo slot).
     * @param {Array<object>} list - current entries.
     * @param {Array<string>} refIds - record ids to remove.
     * @param {number} [at] - epoch ms of the removal.
     * @returns {{ list: Array<object>, undo: object | null }} next entries and undo payload.
     */
    function annotationUndoRemoveMany(list, refIds, at) {
      const current = Array.isArray(list) ? list : []
      const wanted = new Set(Array.isArray(refIds) ? refIds.filter((id) => typeof id === 'string' && id.length > 0) : [])
      if (wanted.size === 0) return { list: current.slice(), undo: null }
      const entries = []
      const next = []
      for (let index = 0; index < current.length; index += 1) {
        const entry = current[index]
        if (entry !== null && typeof entry === 'object' && wanted.has(entry.id)) entries.push({ record: entry, index })
        else next.push(entry)
      }
      if (entries.length === 0) return { list: current.slice(), undo: null }
      const stamp = typeof at === 'number' && Number.isFinite(at) && at > 0 ? Math.round(at) : Date.now()
      return { list: next, undo: { kind: 'multi', entries, at: stamp } }
    }

    /**
     * Scope counts for the rail header/footer (A3/T8).
     * @param {Array<object>} list - collection entries.
     * @param {string | null} sessionId - current Session identity.
     * @returns {{ current: number, other: number, included: number, otherIncluded: number, total: number }} counts.
     */
    function annotationScopeCounts(list, sessionId) {
      let current = 0
      let other = 0
      let included = 0
      let otherIncluded = 0
      for (const entry of Array.isArray(list) ? list : []) {
        if (entry === null || typeof entry !== 'object') continue
        const entrySession = entry.session !== null && typeof entry.session === 'object' ? entry.session.sessionId ?? null : null
        if (typeof sessionId === 'string' && sessionId.length > 0 && entrySession === sessionId) {
          current += 1
          if (entry.included !== false) included += 1
        } else {
          other += 1
          if (entry.included !== false) otherIncluded += 1
        }
      }
      return { current, other, included, otherIncluded, total: current + other }
    }

    /**
     * The ordered current-Session records selected for a batch insert (A3/T8):
     * only `included !== false` entries of the current Session qualify; an
     * other-Session record can never be part of a batch.
     * @param {Array<object>} list - collection entries.
     * @param {string | null} sessionId - current Session identity.
     * @returns {Array<object>} ordered batch entries.
     */
    function annotationSelectedEntries(list, sessionId) {
      const selected = []
      for (const entry of Array.isArray(list) ? list : []) {
        if (entry === null || typeof entry !== 'object') continue
        const entrySession = entry.session !== null && typeof entry.session === 'object' ? entry.session.sessionId ?? null : null
        if (typeof sessionId !== 'string' || sessionId.length === 0 || entrySession !== sessionId) continue
        if (entry.included === false) continue
        selected.push(entry)
      }
      return selected
    }

    /**
     * Apply several include-flag changes in one immutable pass (A3/T8
     * select-all / deselect-all / other-Session forced exclusion).
     * @param {Array<object>} list - collection entries.
     * @param {Array<{ refId: string, included: boolean }>} changes - requested flags.
     * @returns {Array<object>} next entries.
     */
    function annotationApplyIncludes(list, changes) {
      if (!Array.isArray(list)) return []
      const flags = new Map()
      for (const change of Array.isArray(changes) ? changes : []) {
        if (change === null || typeof change !== 'object' || typeof change.refId !== 'string') continue
        flags.set(change.refId, change.included === true)
      }
      if (flags.size === 0) return list.slice()
      return list.map((entry) => {
        if (entry === null || typeof entry !== 'object' || !flags.has(entry.id)) return entry
        const flag = flags.get(entry.id)
        return entry.included === flag ? entry : { ...entry, included: flag }
      })
    }

    /**
     * The chip reference (ReferenceInsert) for one annotation record (A3/T9).
     * @param {object} record - annotation record.
     * @returns {{ source: string, ref: string, label: string, clipboardText: string }} chip insertion.
     */
    function annotationChipRefOf(record) {
      const label = elementLabel(record) || 'UI annotation'
      return {
        source: ANNOTATION_CHIP_SOURCE,
        ref: typeof record?.id === 'string' ? record.id : '',
        label,
        clipboardText: `@${label}`
      }
    }

    /**
     * The ONE group chip reference for a batch insert (D2: per-item chips rejected).
     * @param {Array<object>} records - selected current-Session records, insertion order.
     * @param {string} label - localized batch label (`UI annotations × N`).
     * @returns {{ source: string, ref: string, label: string, clipboardText: string }} chip insertion.
     */
    function annotationChipRefBatch(records, label) {
      const ids = (Array.isArray(records) ? records : [])
        .map((record) => (record !== null && typeof record === 'object' ? record.id : null))
        .filter((id) => typeof id === 'string' && ANNOTATION_CHIP_REF_PATTERN.test(id))
      const text = typeof label === 'string' && label.length > 0 ? label : `UI annotations × ${ids.length}`
      return {
        source: ANNOTATION_CHIP_SOURCE,
        ref: `${ANNOTATION_CHIP_BATCH_PREFIX}${ids.join('|')}`,
        label: text,
        clipboardText: `@${text}`
      }
    }

    /**
     * Parse one annotation chip ref (`<record-id>` or `batch:<id>|<id>…`).
     * @param {unknown} ref - chip ref string.
     * @returns {{ kind: 'single', id: string } | { kind: 'batch', ids: Array<string> } | null} parsed ref.
     */
    function parseAnnotationChipRef(ref) {
      if (typeof ref !== 'string' || ref.length === 0) return null
      if (ref.startsWith(ANNOTATION_CHIP_BATCH_PREFIX)) {
        const ids = ref.slice(ANNOTATION_CHIP_BATCH_PREFIX.length).split('|').filter((id) => ANNOTATION_CHIP_REF_PATTERN.test(id))
        return { kind: 'batch', ids }
      }
      return ANNOTATION_CHIP_REF_PATTERN.test(ref) ? { kind: 'single', id: ref } : null
    }

    /**
     * Menu candidates for the annotation `@` group: current-Session records only,
     * insertion order, capped at D8's 20 (an empty list means the group is absent).
     * @param {Array<object>} list - collection entries.
     * @param {string | null} sessionId - current Session identity.
     * @param {number} [limit] - maximum candidates, default 20.
     * @param {string} [labelTemplate] - optional display-label template with `{name}`;
     *   the source uses it so annotation rows are identifiable in the mixed `@` list
     *   without a custom group header (the shell's slash menu has no title slot for us).
     * @returns {Array<{ name: string, label: string, description?: string, value: string }>} candidates.
     */
    function annotationChipCandidates(list, sessionId, limit, labelTemplate) {
      const cap = typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? Math.round(limit) : ANNOTATION_CHIP_CANDIDATE_LIMIT
      const candidates = []
      for (const entry of Array.isArray(list) ? list : []) {
        if (candidates.length >= cap) break
        if (entry === null || typeof entry !== 'object') continue
        const entrySession = entry.session !== null && typeof entry.session === 'object' ? entry.session.sessionId ?? null : null
        if (typeof sessionId !== 'string' || sessionId.length === 0 || entrySession !== sessionId) continue
        if (typeof entry.id !== 'string' || !ANNOTATION_CHIP_REF_PATTERN.test(entry.id)) continue
        const label = elementLabel(entry) || 'UI annotation'
        const displayLabel = typeof labelTemplate === 'string' && labelTemplate.length > 0
          ? labelTemplate.replace('{name}', label)
          : label
        const excerpt = annotationMarkerBadgeText(entry.note).text
        // `name` stays the raw element label so search and exact-match keep working;
        // only the rendered row is prefixed.
        const candidate = { name: label, label: displayLabel, value: entry.id }
        if (excerpt.length > 0) candidate.description = excerpt
        candidates.push(candidate)
      }
      return candidates
    }

    /**
     * Serialize one annotation chip to the model text the existing Phase 1
     * serializers produce (A3/T9): a single chip == quick-reference block, a batch
     * chip == one ordered batch request. Deleted batch members are skipped and
     * counted honestly; a single missing record returns `text: null` so the
     * controller can fail the send instead of silently downgrading (D9).
     * @param {unknown} ref - chip ref.
     * @param {Array<object>} list - current collection entries.
     * @param {object} labels - insertion labels plus `removed`/`noRemaining`.
     * @param {(record: object) => string} [statusOf] - live status resolver.
     * @returns {{ text: string | null, missing: number, remaining: number }} serialization result.
     */
    function serializeAnnotationChip(ref, list, labels, statusOf) {
      const source = labels !== null && typeof labels === 'object' ? labels : {}
      const parsed = parseAnnotationChipRef(ref)
      const records = Array.isArray(list) ? list : []
      const resolveStatus = typeof statusOf === 'function' ? statusOf : () => 'resolved'
      if (parsed === null) return { text: null, missing: 0, remaining: 0 }
      if (parsed.kind === 'single') {
        const record = records.find((entry) => entry !== null && typeof entry === 'object' && entry.id === parsed.id)
        if (record === undefined) return { text: null, missing: 1, remaining: 0 }
        return {
          text: serializeQuickReference({ ...record, status: resolveStatus(record) }, record.note ?? '', source),
          missing: 0,
          remaining: 1
        }
      }
      const byId = new Map()
      for (const record of records) {
        if (record !== null && typeof record === 'object' && typeof record.id === 'string') byId.set(record.id, record)
      }
      const found = []
      for (const id of parsed.ids) {
        const record = byId.get(id)
        if (record !== undefined) found.push(record)
      }
      const missing = parsed.ids.length - found.length
      if (found.length === 0) {
        const line = typeof source.noRemaining === 'string' ? source.noRemaining : '(no annotations remain)'
        return { text: `${line}\n`, missing, remaining: 0 }
      }
      const items = found.map((record) => ({ ref: { ...record, status: resolveStatus(record) }, note: record.note ?? '' }))
      return {
        text: serializeBatchRequest(items, { ...source, skippedCount: 0, removedCount: missing }),
        missing,
        remaining: found.length
      }
    }

    /**
     * The initial annotation state: mode off, nothing selected, empty collection.
     * @returns {object} fresh state.
     */
    function createAnnotationState() {
      return {
        phase: 'off',
        view: 'status',
        hoverId: null,
        selection: [],
        note: '',
        editing: false,
        collection: [],
        passThrough: false,
        box: null,
        feedback: null,
        sessionId: null
      }
    }

    /**
     * Phase implied by a selection cardinality.
     * @param {number} count - selected element count.
     * @returns {'idle' | 'selected' | 'multi'} phase.
     */
    function annotationPhaseForCount(count) {
      if (count <= 0) return 'idle'
      return count === 1 ? 'selected' : 'multi'
    }

    /**
     * One deactivation path shared by every phase.
     * @param {object} state - current state.
     * @returns {object} next state.
     */
    function annotationDeactivateState(state) {
      return {
        ...state,
        phase: 'off',
        view: 'status',
        hoverId: null,
        selection: [],
        note: '',
        editing: false,
        passThrough: false,
        box: null,
        feedback: null
      }
    }

    /**
     * Pure annotation reducer.
     *
     * Actions: activate, deactivate, hover {targetId}, selectSingle {ref},
     * toggleMulti {ref}, setMulti {refs}, setNote {text}, beginEdit, endEdit,
     * openView {view}, collectionAdd {entry}, collectionUpdateNote {refId,
     * note}, collectionRemove {refId}, collectionClear, annotationCommit {record},
     * annotationUpdateNote {refId, note}, annotationRemove {refId},
     * annotationRestore {record, index}, annotationUndo {undo},
     * annotationInclude {refId, included}, annotationMove {refId, delta},
     * passThrough {on}, box {box}, feedback {feedback}, session {sessionId},
     * exitOne.
     * @param {object} state - current state.
     * @param {object} action - one action.
     * @returns {object} next state, or the same reference when unchanged.
     */
    function reduceAnnotationState(state, action) {
      const current = state !== null && typeof state === 'object' ? state : createAnnotationState()
      const payload = action !== null && typeof action === 'object' ? action : {}
      switch (payload.type) {
        case 'activate': {
          if (current.phase !== 'off') return current
          return { ...current, phase: 'idle', view: 'status', hoverId: null, selection: [], note: '', editing: false, box: null, feedback: null }
        }
        case 'deactivate':
          return annotationDeactivateState(current)
        case 'hover': {
          if (current.phase === 'off') return current
          const targetId = typeof payload.targetId === 'string' && payload.targetId.length > 0 ? payload.targetId : null
          const phase = current.selection.length > 0 ? current.phase : (targetId === null ? 'idle' : 'inspect')
          if (current.hoverId === targetId && current.phase === phase) return current
          return { ...current, hoverId: targetId, phase }
        }
        case 'selectSingle': {
          const ref = payload.ref !== null && typeof payload.ref === 'object' ? payload.ref : null
          if (ref === null) return { ...current, phase: 'idle', selection: [], note: '', editing: false }
          return { ...current, phase: 'selected', selection: [ref], note: ref.note ?? '', editing: false, view: 'status', hoverId: null }
        }
        case 'toggleMulti': {
          const ref = payload.ref !== null && typeof payload.ref === 'object' ? payload.ref : null
          if (ref === null) return current
          const key = identityKeyOf(ref)
          const index = current.selection.findIndex((item) => identityKeyOf(item) === key)
          const selection = index >= 0
            ? current.selection.filter((item, itemIndex) => itemIndex !== index)
            : current.selection.concat([ref])
          return {
            ...current,
            selection,
            phase: annotationPhaseForCount(selection.length),
            note: selection.length === 1 ? (selection[0].note ?? '') : '',
            editing: false,
            view: 'status',
            hoverId: null
          }
        }
        case 'setMulti': {
          const refs = Array.isArray(payload.refs) ? payload.refs : []
          const seen = new Set()
          const selection = []
          for (const ref of refs) {
            if (ref === null || typeof ref !== 'object') continue
            const key = identityKeyOf(ref)
            if (seen.has(key)) continue
            seen.add(key)
            selection.push(ref)
          }
          const merged = current.selection.concat(selection.filter((ref) => !current.selection.some((item) => identityKeyOf(item) === identityKeyOf(ref))))
          return {
            ...current,
            selection: merged,
            phase: annotationPhaseForCount(merged.length),
            note: '',
            editing: false,
            view: 'status',
            hoverId: null
          }
        }
        case 'setNote':
          return { ...current, note: typeof payload.text === 'string' ? payload.text : '' }
        case 'beginEdit':
          return { ...current, editing: true }
        case 'endEdit':
          return { ...current, editing: false }
        case 'openView': {
          const view = payload.view === 'collection' || payload.view === 'settings' ? payload.view : 'status'
          const phase = view === 'collection' ? 'collection' : 'idle'
          if (current.view === view && current.phase === phase && current.selection.length === 0) return current
          return { ...current, view, phase, selection: [], note: '', editing: false, hoverId: null }
        }
        case 'collectionAdd': {
          const result = collectionAdd(current.collection, payload.entry)
          if (!result.added && !result.updated) return current
          return { ...current, collection: result.list }
        }
        case 'collectionUpdateNote':
          return { ...current, collection: collectionSetNote(current.collection, payload.refId, payload.note) }
        case 'collectionRemove':
          return { ...current, collection: collectionRemove(current.collection, payload.refId) }
        case 'collectionClear':
          return { ...current, collection: collectionClear() }
        case 'annotationCommit': {
          const record = payload.record !== null && typeof payload.record === 'object' ? payload.record : null
          if (record === null) return current
          const result = upsertAnnotationRecord(current.collection, record, ANNOTATION_RECORD_LIMIT, payload.now)
          if (!result.added && !result.updated) return current
          return { ...current, collection: result.list }
        }
        case 'annotationUpdateNote': {
          const refId = typeof payload.refId === 'string' ? payload.refId : ''
          if (refId.length === 0) return current
          const note = typeof payload.note === 'string' ? payload.note : ''
          const stamp = typeof payload.now === 'number' && Number.isFinite(payload.now) && payload.now > 0 ? Math.round(payload.now) : Date.now()
          let changed = false
          const collection = current.collection.map((entry) => {
            if (entry === null || typeof entry !== 'object' || entry.id !== refId) return entry
            changed = true
            return { ...entry, note, updatedAt: stamp }
          })
          return changed ? { ...current, collection } : current
        }
        case 'annotationRemove': {
          const next = removeAnnotationRecord(current.collection, payload.refId)
          return next.length === current.collection.length ? current : { ...current, collection: next }
        }
        case 'annotationRestore': {
          const record = payload.record !== null && typeof payload.record === 'object' ? payload.record : null
          if (record === null) return current
          return { ...current, collection: restoreAnnotationRecord(current.collection, record, payload.index) }
        }
        case 'annotationUndo': {
          const undo = payload.undo !== null && typeof payload.undo === 'object' ? payload.undo : null
          if (undo === null) return current
          return { ...current, collection: annotationUndoRestore(current.collection, undo) }
        }
        case 'annotationInclude': {
          const next = toggleAnnotationInclude(current.collection, payload.refId, payload.included)
          let changed = false
          for (let index = 0; index < next.length; index += 1) {
            if (next[index] !== current.collection[index]) {
              changed = true
              break
            }
          }
          return changed ? { ...current, collection: next } : current
        }
        case 'annotationIncludes': {
          const changes = Array.isArray(payload.changes) ? payload.changes : []
          const next = annotationApplyIncludes(current.collection, changes)
          let changed = false
          for (let index = 0; index < next.length; index += 1) {
            if (next[index] !== current.collection[index]) {
              changed = true
              break
            }
          }
          return changed ? { ...current, collection: next } : current
        }
        case 'annotationRemoveMany': {
          const refIds = Array.isArray(payload.refIds) ? payload.refIds : []
          let collection = current.collection
          for (const refId of refIds) collection = removeAnnotationRecord(collection, refId)
          return collection.length === current.collection.length ? current : { ...current, collection }
        }
        case 'annotationMove': {
          const delta = payload.delta === -1 ? -1 : 1
          const next = moveAnnotationRecord(current.collection, payload.refId, delta)
          let changed = false
          for (let index = 0; index < next.length; index += 1) {
            if (next[index] !== current.collection[index]) {
              changed = true
              break
            }
          }
          return changed ? { ...current, collection: next } : current
        }
        case 'passThrough': {
          const on = payload.on === true
          if (current.passThrough === on) return current
          return { ...current, passThrough: on }
        }
        case 'box': {
          const box = normalizeAnnotationBounds(payload.box)
          if (box === null && current.box === null) return current
          return { ...current, box }
        }
        case 'feedback': {
          const feedback = payload.feedback !== null && typeof payload.feedback === 'object'
            ? payload.feedback
            : null
          if (feedback === null && current.feedback === null) return current
          return { ...current, feedback }
        }
        case 'session': {
          const sessionId = typeof payload.sessionId === 'string' && payload.sessionId.length > 0 ? payload.sessionId : null
          if (current.sessionId === sessionId) return current
          return {
            ...current,
            sessionId,
            hoverId: null,
            selection: [],
            note: '',
            editing: false,
            box: null,
            view: 'status',
            phase: current.phase === 'off' ? 'off' : 'idle'
          }
        }
        case 'exitOne': {
          if (current.editing) return { ...current, editing: false }
          if (current.selection.length > 0) return { ...current, selection: [], note: '', editing: false, phase: 'idle', hoverId: null }
          if (current.view !== 'status') return { ...current, view: 'status', phase: 'idle' }
          if (current.phase !== 'off') return annotationDeactivateState(current)
          return current
        }
        default:
          return current
      }
    }

    /**
     * Serialize one quick-reference insertion block.
     * @param {object} ref - ElementRef.
     * @param {string} note - requested change.
     * @param {object} labels - { title, reference, session, noSession, note, emptyNote, time? }.
     * @returns {string} insertion text, trailing newline included.
     */
    function serializeQuickReference(ref, note, labels) {
      const source = labels !== null && typeof labels === 'object' ? labels : {}
      const title = typeof source.title === 'string' ? source.title : 'UI annotation'
      const reference = typeof source.reference === 'string' ? source.reference : 'Reference:'
      const sessionLabel = typeof source.session === 'string' ? source.session : 'Session:'
      const noteLabel = typeof source.note === 'string' ? source.note : 'Note:'
      const emptyNote = typeof source.emptyNote === 'string' ? source.emptyNote : '—'
      const timeText = typeof source.time === 'string' ? source.time : formatAnnotationTime(ref?.at)
      const sessionText = sessionShortLabel(ref?.session?.sessionId) || (typeof source.noSession === 'string' ? source.noSession : '—')
      const noteText = normalizeUserNote(note) || emptyNote
      const lines = [
        `${title} · ${elementLabel(ref)}`,
        annotationJoinLabel(reference, describeLocator(ref)),
        annotationJoinLabel(sessionLabel, `${sessionText} · ${timeText}`),
        annotationJoinLabel(noteLabel, noteText)
      ]
      // A stale or ambiguous target is called out explicitly, locator only. A
      // transient floating-surface target says it is gone, not that it moved.
      const status = ref !== null && typeof ref === 'object' ? ref.status : undefined
      const ephemeral = ref !== null && typeof ref === 'object' && ref.locator !== null && typeof ref.locator === 'object'
        && ref.locator.ephemeral === true
      if (status === 'missing') {
        lines.push(ephemeral && typeof source.statusEphemeral === 'string'
          ? source.statusEphemeral
          : (typeof source.status === 'string' ? source.status : 'Status: target no longer resolves (locator only)'))
      }
      else if (status === 'ambiguous') lines.push(typeof source.statusAmbiguous === 'string' ? source.statusAmbiguous : 'Status: target matches more than one element (locator only)')
      else if (status === 'changed') lines.push(typeof source.statusChanged === 'string' ? source.statusChanged : 'Status: target content changed')
      lines.push('')
      return lines.join('\n')
    }

    /**
     * Serialize the ordered batch request.
     * @param {Array<object>} items - [{ ref, note }] in collection order.
     * @param {object} labels - batch labels plus optional `skippedCount`.
     * @returns {string} insertion text, trailing newline included.
     */
    function serializeBatchRequest(items, labels) {
      const source = labels !== null && typeof labels === 'object' ? labels : {}
      const batchHeader = typeof source.batchHeader === 'string'
        ? source.batchHeader
        : 'Please adjust the UI elements below. Each item lists its reference and the requested change.'
      const reference = typeof source.reference === 'string' ? source.reference : 'Reference:'
      const noteLabel = typeof source.note === 'string' ? source.note : 'Note:'
      const emptyNote = typeof source.emptyNote === 'string' ? source.emptyNote : '—'
      const statusLabel = typeof source.status === 'string' ? source.status : 'Status: target no longer resolves (locator only)'
      const statusEphemeral = typeof source.statusEphemeral === 'string'
        ? source.statusEphemeral
        : 'Status: transient surface no longer present (locator only)'
      const statusAmbiguous = typeof source.statusAmbiguous === 'string' ? source.statusAmbiguous : 'Status: target matches more than one element (locator only)'
      const statusChanged = typeof source.statusChanged === 'string' ? source.statusChanged : 'Status: target content changed'
      const skippedTemplate = typeof source.skipped === 'string' ? source.skipped : '({count} annotation(s) from other sessions skipped)'
      const skippedCount = typeof source.skippedCount === 'number' && Number.isFinite(source.skippedCount) && source.skippedCount > 0
        ? Math.round(source.skippedCount)
        : 0
      const removedTemplate = typeof source.removed === 'string' ? source.removed : '({count} annotation(s) no longer exist and were skipped)'
      const removedCount = typeof source.removedCount === 'number' && Number.isFinite(source.removedCount) && source.removedCount > 0
        ? Math.round(source.removedCount)
        : 0
      const lines = [batchHeader]
      if (removedCount > 0) {
        lines.push('')
        lines.push(removedTemplate.replace('{count}', String(removedCount)))
      }
      if (skippedCount > 0) {
        lines.push('')
        lines.push(skippedTemplate.replace('{count}', String(skippedCount)))
      }
      lines.push('')
      const entries = Array.isArray(items) ? items : []
      entries.forEach((item, index) => {
        const ref = item !== null && typeof item === 'object' && item.ref !== null && typeof item.ref === 'object' ? item.ref : item
        const note = item !== null && typeof item === 'object' && typeof item.note === 'string' ? item.note : (ref?.note ?? '')
        const label = elementLabel(ref)
        lines.push(`${index + 1}. ${label}`)
        lines.push(`   ${annotationJoinLabel(reference, describeLocator(ref))}`)
        lines.push(`   ${annotationJoinLabel(noteLabel, normalizeUserNote(note) || emptyNote)}`)
        const status = ref !== null && typeof ref === 'object' ? ref.status : undefined
        const ephemeral = ref !== null && typeof ref === 'object' && ref.locator !== null && typeof ref.locator === 'object'
          && ref.locator.ephemeral === true
        if (status === 'missing') lines.push(`   ${ephemeral ? statusEphemeral : statusLabel}`)
        else if (status === 'ambiguous') lines.push(`   ${statusAmbiguous}`)
        else if (status === 'changed') lines.push(`   ${statusChanged}`)
        if (index < entries.length - 1) lines.push('')
      })
      lines.push('')
      return lines.join('\n')
    }

    /**
     * Split entries into the current Session and all other Sessions, keeping order.
     * @param {Array<object>} items - [{ ref, note }] or bare ElementRefs.
     * @param {string | null} sessionId - current Session identity.
     * @returns {{ current: Array<object>, other: Array<object> }} the two ordered lists.
     */
    function batchScopeSplit(items, sessionId) {
      const entries = Array.isArray(items) ? items : []
      const current = []
      const other = []
      for (const item of entries) {
        const ref = item !== null && typeof item === 'object' && item.ref !== null && typeof item.ref === 'object' ? item.ref : item
        const refSession = ref !== null && typeof ref === 'object' && ref.session !== null && typeof ref.session === 'object' ? ref.session.sessionId ?? null : null
        if (typeof sessionId === 'string' && sessionId.length > 0 && refSession === sessionId) current.push(item)
        else other.push(item)
      }
      return { current, other }
    }

    /**
     * Re-resolve one ref against a live document through injected queries.
     * @param {object} input - { candidates, expectedTag, queryAll, liveInfo }.
     * @returns {'resolved' | 'ambiguous' | 'missing' | 'changed'} status.
     */
    function resolveRefStatus(input) {
      const source = input !== null && typeof input === 'object' ? input : {}
      const { candidates, expectedTag, queryAll, liveInfo } = source
      if (typeof queryAll !== 'function') return 'missing'
      const tag = typeof expectedTag === 'string' ? expectedTag.trim().toLowerCase() : ''
      const ordered = Array.isArray(candidates) ? candidates.slice().sort((left, right) => (right?.reliability ?? 0) - (left?.reliability ?? 0)) : []
      let unique = null
      let genericMatch = null
      const hasStableCandidate = ordered.some((candidate) => candidate !== null && typeof candidate === 'object'
        && (candidate.kind === 'data' || candidate.kind === 'id' || candidate.kind === 'label'))
      /**
       * Collect the tag-matching hits of one selector without throwing.
       * @param {string} selector - selector to query.
       * @returns {Array<object> | null} hits, or null when the query failed.
       */
      const queryTagged = (selector) => {
        let matches
        try {
          matches = queryAll(selector)
        } catch {
          return null
        }
        if (matches === null || matches === undefined) return null
        if (typeof matches[Symbol.iterator] !== 'function') return null
        const list = []
        for (const element of matches) {
          if (element === null || typeof element !== 'object') continue
          if (typeof element.tagName !== 'string') continue
          if (tag.length === 0 || element.tagName.toLowerCase() === tag) list.push(element)
        }
        return list
      }
      // A selector verified unique at capture is the strongest locator: a single
      // hit resolves (the liveInfo checks below still detect a changed element),
      // several hits are genuine ambiguity, and no hit falls through to the v1
      // candidate walk so an older locator keeps working.
      const uniqueSelector = typeof source.uniqueSelector === 'string' && source.uniqueSelector.length > 0 ? source.uniqueSelector : ''
      if (uniqueSelector.length > 0) {
        const hits = queryTagged(uniqueSelector)
        if (hits !== null && hits.length > 1) return 'ambiguous'
        if (hits !== null && hits.length === 1) unique = hits[0]
      }
      if (unique === null) for (const candidate of ordered) {
        if (candidate === null || typeof candidate !== 'object' || typeof candidate.value !== 'string' || candidate.value.length === 0) continue
        let matches
        try {
          matches = queryAll(candidate.value)
        } catch {
          continue
        }
        if (matches === null || matches === undefined) continue
        if (typeof matches[Symbol.iterator] !== 'function') continue
        const list = []
        for (const element of matches) {
          if (element === null || typeof element !== 'object') continue
          if (typeof element.tagName !== 'string') continue
          const elementTag = element.tagName.toLowerCase()
          if (tag.length === 0 || elementTag === tag) list.push(element)
        }
        if (list.length === 0) continue
        const generic = candidate.kind === 'tag' || candidate.kind === 'path' || candidate.kind === 'role'
        if (list.length > 1) {
          // A generic locator matching several elements cannot identify one; a stable
          // locator matching several is a genuine ambiguity.
          if (generic) continue
          return 'ambiguous'
        }
        if (generic) {
          // Remember the first generic hit, but keep looking for a stable identity.
          if (genericMatch === null) genericMatch = list[0]
          continue
        }
        unique = list[0]
        break
      }
      if (typeof liveInfo === 'function') {
        const probe = unique === null ? genericMatch : unique
        if (probe !== null) {
          const info = liveInfo(probe)
          if (info !== null && typeof info === 'object') {
            if (info.isConnected === false) return 'missing'
            const expected = typeof info.expectedText === 'string' ? info.expectedText : ''
            const actual = typeof info.textContent === 'string' ? info.textContent : ''
            if (unique === null) {
              // A ref whose stable identity disappeared must be corroborated by the
              // captured text summary; with none (icon-only) a same-position
              // replacement reads as gone. A ref that never had a stable candidate
              // (anonymous icon-only control) still resolves on its unique generic hit.
              if (expected.length === 0) return hasStableCandidate ? 'missing' : 'resolved'
              return sanitizeText(actual) === sanitizeText(expected) ? 'resolved' : 'changed'
            }
            // Stable identity resolved. A changed accessible name means this is a
            // different control now, even when the tag/selector still matches.
            const expectedName = typeof info.expectedName === 'string' ? info.expectedName : ''
            const actualName = typeof info.actualName === 'string' ? info.actualName : ''
            if (expectedName.length > 0 && actualName.length > 0
              && sanitizeText(actualName, 60) !== expectedName) return 'changed'
            // A digest mismatch catches text changes beyond the 80-char summary and
            // the captured-empty -> now-has-text case (F11).
            const expectedDigest = typeof info.expectedDigest === 'string' ? info.expectedDigest : ''
            const actualDigest = typeof info.actualDigest === 'string' ? info.actualDigest : ''
            if (expectedDigest.length > 0 && actualDigest.length > 0 && expectedDigest !== actualDigest) return 'changed'
            if (expected.length > 0 && sanitizeText(actual) !== sanitizeText(expected)) return 'changed'
          }
        }
      }
      if (unique !== null) return 'resolved'
      return genericMatch === null ? 'missing' : 'resolved'
    }

    /**
     * Clamp the launcher into the viewport with a margin.
     * @param {{ x: number, y: number } | null} pos - desired top-left position.
     * @param {{ width: number, height: number }} viewport - viewport size.
     * @param {number} [size] - launcher edge length, default 40.
     * @param {number} [margin] - minimum gap from every edge, default 8.
     * @returns {{ x: number, y: number }} clamped position.
     */
    function clampLauncherPosition(pos, viewport, size, margin) {
      const edge = typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 40
      const gap = typeof margin === 'number' && Number.isFinite(margin) && margin >= 0 ? margin : 8
      const width = viewport !== null && typeof viewport === 'object' && typeof viewport.width === 'number' ? viewport.width : 0
      const height = viewport !== null && typeof viewport === 'object' && typeof viewport.height === 'number' ? viewport.height : 0
      const maxX = Math.max(gap, width - edge - gap)
      const maxY = Math.max(gap, height - edge - gap)
      const rawX = pos !== null && typeof pos === 'object' && typeof pos.x === 'number' && Number.isFinite(pos.x) ? pos.x : width - edge - gap
      const rawY = pos !== null && typeof pos === 'object' && typeof pos.y === 'number' && Number.isFinite(pos.y) ? pos.y : height - edge - gap
      return {
        x: Math.round(Math.min(Math.max(rawX, gap), maxX)),
        y: Math.round(Math.min(Math.max(rawY, gap), maxY))
      }
    }

    /**
     * Place the popover beside a target rect, inside the viewport and left of the rail.
     * @param {{ x: number, y: number, width: number, height: number }} rect - target rect.
     * @param {{ width: number, height: number }} popoverSize - popover size.
     * @param {{ width: number, height: number }} viewport - viewport size.
     * @param {number} [railWidth] - reserved right strip width, default 0.
     * @param {number} [margin] - minimum gap from every edge, default 8.
     * @returns {{ x: number, y: number }} clamped position.
     */
    function clampPopoverPosition(rect, popoverSize, viewport, railWidth, margin) {
      const gap = typeof margin === 'number' && Number.isFinite(margin) && margin >= 0 ? margin : 8
      const rail = typeof railWidth === 'number' && Number.isFinite(railWidth) && railWidth > 0 ? railWidth : 0
      const width = viewport !== null && typeof viewport === 'object' && typeof viewport.width === 'number' ? viewport.width : 0
      const height = viewport !== null && typeof viewport === 'object' && typeof viewport.height === 'number' ? viewport.height : 0
      const popoverWidth = popoverSize !== null && typeof popoverSize === 'object' && typeof popoverSize.width === 'number' ? popoverSize.width : 320
      const popoverHeight = popoverSize !== null && typeof popoverSize === 'object' && typeof popoverSize.height === 'number' ? popoverSize.height : 232
      const target = rect !== null && typeof rect === 'object' ? rect : { x: 0, y: 0, width: 0, height: 0 }
      const targetX = typeof target.x === 'number' && Number.isFinite(target.x) ? target.x : 0
      const targetY = typeof target.y === 'number' && Number.isFinite(target.y) ? target.y : 0
      const targetWidth = typeof target.width === 'number' && Number.isFinite(target.width) ? target.width : 0
      const targetHeight = typeof target.height === 'number' && Number.isFinite(target.height) ? target.height : 0
      const maxX = Math.max(gap, width - rail - popoverWidth - gap)
      const maxY = Math.max(gap, height - popoverHeight - gap)
      let x = targetX + targetWidth + gap + 4
      if (x > maxX) x = targetX - popoverWidth - gap - 4
      let y = targetY
      if (y > maxY) y = targetY + targetHeight - popoverHeight
      return {
        x: Math.round(Math.min(Math.max(x, gap), maxX)),
        y: Math.round(Math.min(Math.max(y, gap), maxY))
      }
    }

    /**
     * Clamp one existing popover position into the viewport (pinned drags).
     * Unlike {@link clampPopoverPosition} this preserves the dragged offset and
     * only moves the popover as far as needed to stay on-screen.
     * @param {{ x: number, y: number }} position - current popover position.
     * @param {object} popoverSize - measured popover size.
     * @param {object} viewport - { width, height }.
     * @param {number} railWidth - reserved annotation rail width.
     * @param {number} [margin] - edge margin (default 8).
     * @returns {{ x: number, y: number }} clamped position.
     */
    function clampPopoverPositionToViewport(position, popoverSize, viewport, railWidth, margin) {
      const gap = typeof margin === 'number' && Number.isFinite(margin) && margin >= 0 ? margin : 8
      const rail = typeof railWidth === 'number' && Number.isFinite(railWidth) && railWidth > 0 ? railWidth : 0
      const width = viewport !== null && typeof viewport === 'object' && typeof viewport.width === 'number' ? viewport.width : 0
      const height = viewport !== null && typeof viewport === 'object' && typeof viewport.height === 'number' ? viewport.height : 0
      const popoverWidth = popoverSize !== null && typeof popoverSize === 'object' && typeof popoverSize.width === 'number' ? popoverSize.width : 320
      const popoverHeight = popoverSize !== null && typeof popoverSize === 'object' && typeof popoverSize.height === 'number' ? popoverSize.height : 232
      const point = position !== null && typeof position === 'object' ? position : { x: gap, y: gap }
      const x = typeof point.x === 'number' && Number.isFinite(point.x) ? point.x : gap
      const y = typeof point.y === 'number' && Number.isFinite(point.y) ? point.y : gap
      const maxX = Math.max(gap, width - rail - popoverWidth - gap)
      const maxY = Math.max(gap, height - popoverHeight - gap)
      return { x: Math.round(Math.min(Math.max(x, gap), maxX)), y: Math.round(Math.min(Math.max(y, gap), maxY)) }
    }

    /**
     * Place the floating detail card beside a marked rect (A3/T6).
     *
     * Prefers the right side of the element aligned to its top, flips to the left
     * when the card would cross the reserved rail strip, flips above when there is
     * no room below, and finally clamps to an 8 px viewport margin.
     * @param {{ x: number, y: number, width: number, height: number }} rect - mark rect.
     * @param {{ width: number, height: number }} cardSize - measured/estimated card size.
     * @param {{ width: number, height: number }} viewport - viewport size.
     * @param {number} [railWidth] - reserved right strip width, default 0.
     * @param {number} [margin] - minimum gap from every edge, default 8.
     * @returns {{ x: number, y: number, placement: 'right' | 'left' }} clamped position.
     */
    function clampDetailCardPosition(rect, cardSize, viewport, railWidth, margin) {
      const gap = typeof margin === 'number' && Number.isFinite(margin) && margin >= 0 ? margin : 8
      const rail = typeof railWidth === 'number' && Number.isFinite(railWidth) && railWidth > 0 ? railWidth : 0
      const width = viewport !== null && typeof viewport === 'object' && typeof viewport.width === 'number' ? viewport.width : 0
      const height = viewport !== null && typeof viewport === 'object' && typeof viewport.height === 'number' ? viewport.height : 0
      const cardWidth = cardSize !== null && typeof cardSize === 'object' && typeof cardSize.width === 'number' && cardSize.width > 0
        ? cardSize.width
        : ANNOTATION_DETAIL_SIZE.width
      const cardHeight = cardSize !== null && typeof cardSize === 'object' && typeof cardSize.height === 'number' && cardSize.height > 0
        ? cardSize.height
        : ANNOTATION_DETAIL_SIZE.height
      const target = rect !== null && typeof rect === 'object' ? rect : { x: 0, y: 0, width: 0, height: 0 }
      const targetX = typeof target.x === 'number' && Number.isFinite(target.x) ? target.x : 0
      const targetY = typeof target.y === 'number' && Number.isFinite(target.y) ? target.y : 0
      const targetWidth = typeof target.width === 'number' && Number.isFinite(target.width) ? target.width : 0
      const targetHeight = typeof target.height === 'number' && Number.isFinite(target.height) ? target.height : 0
      const maxX = Math.max(gap, width - rail - cardWidth - gap)
      const maxY = Math.max(gap, height - cardHeight - gap)
      let placement = 'right'
      let x = targetX + targetWidth + gap
      if (x > maxX) {
        placement = 'left'
        x = targetX - cardWidth - gap
      }
      x = Math.round(Math.min(Math.max(x, gap), maxX))
      // Align to the element's top; a card with no room below is bottom-aligned.
      let y = targetY
      if (y + cardHeight > height - gap) y = targetY + targetHeight - cardHeight
      y = Math.round(Math.min(Math.max(y, gap), maxY))
      return { x, y, placement }
    }

    /**
     * Compute the rail width for one viewport.
     * @param {number} viewportWidth - window inner width.
     * @param {boolean} [collapsed] - whether the rail is collapsed to its strip, default false.
     * @returns {number} rail width in pixels.
     */
    function computeRailWidth(viewportWidth, collapsed) {
      if (collapsed === true) return 48
      const width = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) ? viewportWidth : 0
      return Math.min(236, Math.max(188, Math.round(width * 0.116)))
    }

    /**
     * Decide whether the layout can shrink or the rail must float over the page.
     * @param {number} viewportWidth - window inner width.
     * @param {number} sidebarWidth - native left + right sidebar widths.
     * @param {number} railWidth - rail width to reserve.
     * @returns {'shrink' | 'overlay'} layout mode.
     */
    function layoutModeFor(viewportWidth, sidebarWidth, railWidth) {
      const width = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) ? viewportWidth : 0
      const side = typeof sidebarWidth === 'number' && Number.isFinite(sidebarWidth) ? sidebarWidth : 0
      const rail = typeof railWidth === 'number' && Number.isFinite(railWidth) ? railWidth : 0
      return width - side - rail >= 560 ? 'shrink' : 'overlay'
    }
    //#endregion

    /** Selector set of elements the picker treats as meaningful, nearest first. */
    const ANNOTATION_CANDIDATE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="link"], [role="dialog"], [role="menu"], [role="tooltip"], [role="list"], [role="listitem"], [role="treeitem"], [role="combobox"], [role="textbox"], [data-row-key], [data-conversation-region], [aria-label], h1, h2, h3, h4, h5, h6, li, td, pre, p, code, nav, aside, main, section'

    /** Estimated popover size used for clamping. */
    const ANNOTATION_POPOVER_SIZE = { width: 320, height: 248 }

    /** Launcher edge length in pixels; must match the stylesheet. */
    const ANNOTATION_LAUNCHER_SIZE = 44

    /**
     * Clamp the launcher for the current layout. While a rail is visible the
     * launcher must stay in the main area and never sit under the rail strip (it
     * would cover the rail footer actions); when the mode is off the whole
     * viewport is available again.
     * @param {{ x: number, y: number } | null} pos - desired position.
     * @param {{ width: number, height: number }} viewport - viewport size.
     * @param {number} [reservedRight] - visible rail strip width, default 0.
     * @returns {{ x: number, y: number }} clamped position.
     */
    function clampLauncherForLayout(pos, viewport, reservedRight) {
      const clamped = clampLauncherPosition(pos, viewport, ANNOTATION_LAUNCHER_SIZE)
      const reserved = typeof reservedRight === 'number' && Number.isFinite(reservedRight) && reservedRight > 0
        ? reservedRight
        : 0
      if (reserved === 0) return clamped
      const width = viewport !== null && typeof viewport === 'object' && typeof viewport.width === 'number' ? viewport.width : 0
      const maxX = Math.max(8, Math.round(width - reserved - ANNOTATION_LAUNCHER_SIZE - 8))
      return { x: Math.min(clamped.x, maxX), y: clamped.y }
    }

    /**
     * Resolve one event target (or node) to an Element.
     * @param {unknown} target - event target or node.
     * @returns {Element | null} the element, when available.
     */
    function annotationDomElement(target) {
      if (target === null || target === undefined || typeof target !== 'object') return null
      if (typeof Element !== 'undefined' && target instanceof Element) return target
      if (typeof target.nodeType === 'number' && target.nodeType === 3) return annotationDomElement(target.parentElement)
      return null
    }

    /**
     * The event target element. The target is preferred over `composedPath()[0]`
     * because the DOM retargets a Shadow DOM hit to its host, which is exactly
     * the selectable boundary this feature documents.
     * @param {object} event - DOM event.
     * @returns {Element | null} the event target element.
     */
    function annotationEventElement(event) {
      if (event === null || typeof event !== 'object') return null
      const target = annotationDomElement(event.target)
      if (target !== null) return target
      if (typeof event.composedPath === 'function') {
        const path = event.composedPath()
        if (Array.isArray(path)) {
          for (const entry of path) {
            const element = annotationDomElement(entry)
            if (element !== null) return element
          }
        }
      }
      return null
    }

    /**
     * Retarget one node inside a Shadow DOM to its host element.
     * @param {Element | null} node - node to retarget.
     * @returns {Element | null} the outermost host element.
     */
    function annotationShadowHost(node) {
      let current = node
      let depth = 0
      while (current !== null && depth < 8) {
        const root = typeof current.getRootNode === 'function' ? current.getRootNode() : null
        if (root !== null && root !== undefined && root !== document
          && root.host !== null && root.host !== undefined && root.host !== document) {
          current = annotationDomElement(root.host)
          depth += 1
          continue
        }
        break
      }
      return current
    }

    /** @returns {{ width: number, height: number }} the current viewport size. */
    function annotationViewport() {
      return {
        width: typeof window.innerWidth === 'number' ? window.innerWidth : 0,
        height: typeof window.innerHeight === 'number' ? window.innerHeight : 0
      }
    }

    /**
     * The layout frame: the element whose padding makes room for the rail.
     * @returns {Element | null} the frame element.
     */
    function annotationLayoutFrame() {
      const overlay = document.querySelector('[data-shell-overlay]')
      if (overlay === null) return null
      const frame = overlay.parentElement
      return frame instanceof HTMLElement ? frame : null
    }

    /**
     * Sum the widths of the native left and right Sidebar columns.
     * @returns {number} total sidebar width in pixels.
     */
    function annotationMeasureSidebarWidths() {
      let total = 0
      for (const selector of ['[class$="_sidebarCol"]', '[class$="_rightbarCol"]']) {
        const column = document.querySelector(selector)
        if (!(column instanceof HTMLElement)) continue
        const rect = column.getBoundingClientRect()
        if (rect.width > 0) total += rect.width
      }
      return total
    }

    /**
     * One element's viewport rectangle, rounded.
     * @param {unknown} element - candidate element.
     * @returns {{ x: number, y: number, width: number, height: number } | null} rectangle.
     */
    function annotationRectOf(element) {
      if (element === null || typeof element !== 'object' || typeof element.getBoundingClientRect !== 'function') return null
      const rect = element.getBoundingClientRect()
      if (rect === null || typeof rect !== 'object') return null
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    }

    /**
     * Whether two rectangles intersect.
     * @param {{ x: number, y: number, width: number, height: number }} left - first rectangle.
     * @param {{ x: number, y: number, width: number, height: number }} right - second rectangle.
     * @returns {boolean} whether they overlap.
     */
    function annotationRectsIntersect(left, right) {
      return left.x < right.x + right.width
        && right.x < left.x + left.width
        && left.y < right.y + right.height
        && right.y < left.y + left.height
    }

    /**
     * Whether one element is rendered and visible.
     * @param {Element | null} element - candidate element.
     * @returns {boolean} whether it has a box and is not hidden.
     */
    function annotationElementVisible(element) {
      if (element === null || typeof element !== 'object') return false
      if (typeof element.getClientRects !== 'function') return false
      if (element.getClientRects().length === 0) return false
      // Zero-area elements have no meaningful target to outline or annotate; the
      // primary picker check rejects them before any fallback path (F13).
      const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
      if (rect === null || rect.width <= 0 || rect.height <= 0) return false
      const style = window.getComputedStyle(element)
      if (style === null || typeof style !== 'object') return true
      return style.visibility !== 'hidden' && style.display !== 'none'
    }

    /**
     * Stable id of one element, empty when it looks generated.
     * @param {Element} element - candidate element.
     * @returns {string} stable id or ''.
     */
    function annotationStableId(element) {
      const rawId = element.getAttribute('id')
      if (rawId === null || rawId.length === 0 || rawId.length > 48) return ''
      // The attribute sanitizer is the single authority for what may be captured;
      // an id is just another safe-named attribute value (F1).
      const id = sanitizeAttributeValue('id', rawId)
      if (id === null || isDynamicValue(id)) return ''
      return id
    }

    /**
     * Semantic role of one element, explicit role handled by the caller.
     * @param {string} tag - lowercase tag name.
     * @param {Element} element - candidate element.
     * @returns {string} role name or ''.
     */
    function annotationRoleOf(tag, element) {
      if (tag === 'button') return 'button'
      if (tag === 'a' && element.hasAttribute('href')) return 'link'
      if (tag === 'input') {
        const type = (element.getAttribute('type') ?? 'text').toLowerCase()
        if (type === 'checkbox') return 'checkbox'
        if (type === 'radio') return 'radio'
        if (type === 'submit' || type === 'button' || type === 'reset') return 'button'
        return 'textbox'
      }
      if (tag === 'select') return 'combobox'
      if (tag === 'textarea') return 'textbox'
      if (/^h[1-6]$/.test(tag)) return 'heading'
      if (tag === 'li') return 'listitem'
      if (element.getAttribute('data-row-key') !== null) return 'row'
      if (tag === 'nav' || tag === 'aside' || tag === 'main' || tag === 'section') return 'region'
      return ''
    }

    /**
     * Component class used in the ElementRef and the popover label.
     * @param {string} tag - lowercase tag name.
     * @param {string} role - derived or explicit role.
     * @param {boolean} isEditable - whether the element is contenteditable.
     * @param {boolean} insideComposer - whether the element is the composer region.
     * @returns {string} component class.
     */
    function annotationComponentOf(tag, role, isEditable, insideComposer) {
      if (isEditable) return 'editable'
      if (insideComposer) return 'region'
      if (role === 'button' || tag === 'button' || role === 'tab') return 'button'
      if (role === 'link' || tag === 'a') return 'link'
      if (role === 'textbox' || role === 'combobox' || role === 'checkbox' || role === 'radio'
        || tag === 'input' || tag === 'select' || tag === 'textarea') return 'input'
      if (role === 'menuitem' || role === 'menuitemcheckbox') return 'menu-item'
      if (role === 'row' || role === 'listitem' || tag === 'li' || tag === 'tr') return 'row'
      if (role === 'region' || tag === 'main' || tag === 'section' || tag === 'nav' || tag === 'aside') return 'region'
      if (role === 'heading' || tag === 'p' || tag === 'pre' || tag === 'code') return 'text'
      return 'container'
    }

    /**
     * Accessible name of one element. Never reads control values or editor content.
     * @param {Element} element - candidate element.
     * @param {string} tag - lowercase tag name.
     * @returns {string} sanitized name.
     */
    function annotationAccessibleName(element, tag) {
      const ariaLabel = element.getAttribute('aria-label')
      if (ariaLabel !== null && ariaLabel.trim().length > 0) return sanitizeText(ariaLabel, 60)
      const labelledBy = element.getAttribute('aria-labelledby')
      if (labelledBy !== null && labelledBy.length > 0) {
        const label = document.getElementById(labelledBy)
        if (label !== null) {
          const text = sanitizeText(label.textContent ?? '', 60)
          if (text.length > 0) return text
        }
      }
      if (tag === 'img') {
        const alt = element.getAttribute('alt')
        if (alt !== null && alt.trim().length > 0) return sanitizeText(alt, 60)
      }
      const wrappingLabel = typeof element.closest === 'function' ? element.closest('label') : null
      if (wrappingLabel !== null && wrappingLabel !== element) {
        const text = sanitizeText(wrappingLabel.textContent ?? '', 60)
        if (text.length > 0) return text
      }
      if (isFormTag(tag)) {
        const placeholder = element.getAttribute('placeholder')
        if (placeholder !== null && placeholder.trim().length > 0) return sanitizeText(placeholder, 60)
        const name = element.getAttribute('name')
        if (name !== null && name.trim().length > 0) return sanitizeText(name, 60)
        return sanitizeText(element.getAttribute('type') ?? tag, 40)
      }
      return ''
    }

    /** Selector of every surface whose content is user input, never page copy. */
    const ANNOTATION_LIVE_INPUT_SURFACE = 'input, textarea, select, [contenteditable], [data-lexical-editor="true"]'

    /**
     * Whether one element is (or contains) a live input surface. Those live values
     * and editor contents are never read, copied, or summarized (F7).
     * @param {Element} element - candidate element.
     * @returns {boolean} whether text collection must be suppressed.
     */
    function annotationHasLiveInputSurface(element) {
      if (element === null || typeof element !== 'object') return false
      if (typeof element.matches === 'function' && element.matches(ANNOTATION_LIVE_INPUT_SURFACE)) return true
      return typeof element.querySelector === 'function'
        && element.querySelector(ANNOTATION_LIVE_INPUT_SURFACE) !== null
    }

    /**
     * Sanitized text summary of one element. Never reads control values and never
     * descends into a native editor or password field.
     * @param {Element} element - candidate element.
     * @param {boolean} isEditable - whether the element is contenteditable.
     * @returns {string} sanitized summary.
     */
    function annotationTextSummary(element, isEditable) {
      if (isEditable) return ''
      if (annotationHasLiveInputSurface(element)) return ''
      const text = typeof element.textContent === 'string' ? element.textContent : ''
      return sanitizeText(text, 80)
    }

    /**
     * Digest of the full sanitized text of one element (F11). Privacy suppression is
     * the same as the text summary: live input surfaces yield '' so a digest can
     * never stand in for their content.
     * @param {Element} element - candidate element.
     * @param {boolean} isEditable - whether the element is contenteditable.
     * @returns {string} eight-hex digest, or ''.
     */
    function annotationTextDigest(element, isEditable) {
      if (isEditable) return ''
      if (annotationHasLiveInputSurface(element)) return ''
      const text = typeof element.textContent === 'string' ? element.textContent : ''
      return textDigest(text)
    }

    /**
     * One short structural path (at most four levels) with nth-of-type steps.
     * @param {Element} element - candidate element.
     * @returns {{ parts: Array<{ tag: string, index: number }>, selector: string }} path parts and selector.
     */
    function annotationTagPath(element) {
      const parts = []
      let current = element
      let depth = 0
      while (current !== null && current !== document.body && current !== document.documentElement && depth < 4) {
        const tag = current.tagName.toLowerCase()
        let index = 1
        let sibling = current.previousElementSibling
        while (sibling !== null) {
          if (sibling.tagName === current.tagName) index += 1
          sibling = sibling.previousElementSibling
        }
        parts.unshift({ tag, index })
        current = current.parentElement
        depth += 1
      }
      const selector = parts.map((part) => (part.index > 1 ? `${part.tag}:nth-of-type(${part.index})` : part.tag)).join(' > ')
      return { parts, selector }
    }

    /**
     * The strongest stable attribute selector of one element (no class names).
     * @param {Element} element - live element.
     * @returns {{ name: string, value: string, selector: string } | null} candidate, or null.
     */
    function annotationStableSelectorCandidate(element) {
      if (element === null || typeof element !== 'object' || typeof element.getAttribute !== 'function') return null
      const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
      if (tag.length === 0) return null
      const names = [...UNIQUE_SELECTOR_ATTRIBUTES, 'id', 'aria-label']
      for (const name of names) {
        const raw = element.getAttribute(name)
        if (raw === null || raw.length === 0) continue
        const value = sanitizeAttributeValue(name, raw)
        if (value === null) continue
        if (name === 'id' && isDynamicValue(value)) continue
        const selector = name === 'id'
          ? `#${cssIdentifier(value)}`
          : `${tag}[${name}="${cssString(value)}"]`
        return { name, value, selector }
      }
      return null
    }

    /**
     * Relative `tag:nth-of-type(n)` steps from one ancestor down to one element.
     * @param {Element} element - target element.
     * @param {Element} ancestor - ancestor to start from.
     * @returns {Array<{ tag: string, index: number }> | null} steps, or null when the ancestor is not on the path.
     */
    function annotationStructuralSteps(element, ancestor) {
      if (element === null || ancestor === null || element === ancestor) return null
      const steps = []
      let current = element
      let depth = 0
      while (current !== null && current !== ancestor && depth < 8) {
        const tag = typeof current.tagName === 'string' ? current.tagName.toLowerCase() : ''
        if (tag.length === 0) return null
        let index = 1
        let sibling = current.previousElementSibling
        while (sibling !== null) {
          if (sibling.tagName === current.tagName) index += 1
          sibling = sibling.previousElementSibling
        }
        steps.push({ tag, index })
        current = current.parentElement
        depth += 1
      }
      if (current !== ancestor) return null
      steps.reverse()
      return steps
    }

    /**
     * Stable-anchor selector candidates for one element: the nearest stable
     * ancestors (up to three) plus the structural steps to reach the element.
     * @param {Element} element - live element.
     * @returns {Array<{ selector: string, steps: Array<{ tag: string, index: number }> }>} anchors, nearest first.
     */
    function annotationAnchorPaths(element) {
      const anchors = []
      let current = element === null || typeof element !== 'object' ? null : element.parentElement
      let depth = 0
      while (current !== null && current !== undefined && current !== document.body && current !== document.documentElement && depth < 10 && anchors.length < 3) {
        const stable = annotationStableSelectorCandidate(current)
        if (stable !== null) {
          const steps = annotationStructuralSteps(element, current)
          if (steps !== null && steps.length > 0) anchors.push({ selector: stable.selector, steps })
        }
        current = current.parentElement
        depth += 1
      }
      return anchors
    }

    /**
     * Sanitized attribute pairs of one element, shaped for the record normalizer.
     * @param {Element} element - live element.
     * @returns {Array<{ name: string, value: string }>} sanitized pairs.
     */
    function annotationSanitizedAttributes(element) {
      const attrs = []
      if (element === null || typeof element !== 'object' || typeof element.attributes === 'undefined' || element.attributes === null) return attrs
      for (const attribute of Array.from(element.attributes)) {
        const name = sanitizeAttributeName(attribute.name)
        if (name === null) continue
        const value = sanitizeAttributeValue(name, attribute.value)
        if (value === null) continue
        attrs.push({ name, value })
      }
      return attrs
    }

    /**
     * Stable ancestors of one element, nearest first, bounded by the record schema.
     * @param {Element} element - live element.
     * @returns {Array<{ tag: string, attrs: Array<{ name: string, value: string }> }>} ancestor entries.
     */
    function annotationStableAncestorEntries(element) {
      const entries = []
      let current = element === null || typeof element !== 'object' ? null : element.parentElement
      let depth = 0
      while (current !== null && current !== undefined && current !== document.body && current !== document.documentElement && depth < 10 && entries.length < ANNOTATION_MAX_ANCESTORS) {
        const attrs = annotationSanitizedAttributes(current)
        if (attrs.length > 0) entries.push({ tag: current.tagName.toLowerCase(), attrs })
        current = current.parentElement
        depth += 1
      }
      return entries
    }

    /**
     * Build the descriptor consumed by `buildElementRef` from a live element.
     * @param {Element} element - candidate element.
     * @param {boolean} insideComposer - whether the element is the composer region.
     * @returns {object} element descriptor.
     */
    function annotationDescriptorOf(element, insideComposer) {
      const tag = element.tagName.toLowerCase()
      const isEditable = tag !== 'input' && tag !== 'textarea' && tag !== 'select' && element.isContentEditable === true
      const attrs = []
      for (const attribute of Array.from(element.attributes)) {
        const name = sanitizeAttributeName(attribute.name)
        if (name === null) continue
        const value = sanitizeAttributeValue(name, attribute.value)
        if (value === null) continue
        attrs.push({ name, value })
      }
      const role = sanitizeText(element.getAttribute('role') ?? '', 32) || annotationRoleOf(tag, element)
      const pathInfo = annotationTagPath(element)
      // A verified unique selector costs a handful of querySelectorAll calls at
      // select time (never on the pointermove hot path) and is the locator that
      // fixes duplicate-label controls such as `New session` (A2/D11).
      const unique = buildUniqueSelector({
        tag,
        attrs,
        anchorPaths: annotationAnchorPaths(element)
      }, (selector) => document.querySelectorAll(selector))
      return {
        tag,
        id: annotationStableId(element),
        role,
        name: annotationAccessibleName(element, tag),
        attrs,
        text: annotationTextSummary(element, isEditable),
        textDigest: annotationTextDigest(element, isEditable),
        component: annotationComponentOf(tag, role, isEditable, insideComposer === true),
        path: pathInfo.selector,
        tagPath: pathInfo.parts,
        isEditable,
        insideComposer: insideComposer === true,
        uniqueSelector: unique.selector,
        uniqueVerified: unique.verified,
        ancestors: annotationStableAncestorEntries(element)
      }
    }

    /**
     * First node of a candidate chain: text nodes resolve to their parent, our
     * own UI is rejected, and an editable's contents resolve to the composer
     * region (whose internals are never read).
     * @param {unknown} target - event target.
     * @returns {Element | null} the chain's start element.
     */
    function annotationStartNode(target) {
      const shadowHost = annotationShadowHost(annotationDomElement(target))
      const node = shadowHost === null ? annotationDomElement(target) : shadowHost
      if (node === null) return null
      if (typeof node.closest !== 'function') return null
      if (node.closest('[data-psa-own]') !== null) return null
      const editable = node.closest('[data-lexical-editor="true"], [contenteditable="true"]')
      if (editable !== null) {
        const composer = editable.closest('[data-conversation-region="composer"]')
        return composer ?? editable
      }
      return node
    }

    /**
     * Walk the ancestor chain of one target, nearest first.
     * @param {unknown} target - event target.
     * Descriptors are intentionally NOT built here: pointermove walks up to 16
     * ancestors, and each descriptor reads full textContent twice (summary +
     * digest). The chain keeps elements (+ composer membership) only; the
     * descriptor is built lazily for the chosen element and ≤2 context ancestors
     * in `refFromChain`.
     * @returns {Array<{ element: Element, insideComposer: boolean }>} the chain.
     */
    function annotationCandidateChain(target) {
      const start = annotationStartNode(target)
      if (start === null) return []
      const chain = []
      let current = start
      let depth = 0
      while (current !== null && current !== document.body && current !== document.documentElement && depth < 16) {
        const insideComposer = typeof current.closest === 'function' && current.closest('[data-conversation-region="composer"]') !== null
        chain.push({ element: current, insideComposer })
        current = current.parentElement
        depth += 1
      }
      return chain
    }

    /**
     * Whether one chain element is a meaningful candidate.
     * @param {Element} element - chain element.
     * @returns {boolean} whether the picker accepts it.
     */
    function annotationIsCandidate(element) {
      if (element === null || typeof element !== 'object') return false
      const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
      if (tag === '' || tag === 'html' || tag === 'body') return false
      if (typeof element.closest !== 'function') return false
      if (element.closest('[data-psa-own]') !== null) return false
      if (typeof element.matches !== 'function' || !element.matches(ANNOTATION_CANDIDATE_SELECTOR)) return false
      return annotationElementVisible(element)
    }

    /**
     * Computed z-index of one element, as a number, or null when it participates
     * in no explicit stacking layer (`z-index: auto`).
     * @param {Element} element - live element.
     * @returns {number | null} computed z-index.
     */
    function annotationComputedZIndex(element) {
      if (element === null || typeof element !== 'object') return null
      const style = window.getComputedStyle(element)
      if (style === null || typeof style !== 'object') return null
      const raw = style.zIndex
      if (typeof raw !== 'string' || raw.length === 0 || raw === 'auto') return null
      const value = Number.parseInt(raw, 10)
      return Number.isFinite(value) ? value : null
    }

    /**
     * Whether one element is a floating surface box: out of normal flow, with an
     * explicit stacking layer, a real box, and no annotation UI inside it.
     *
     * The test intentionally uses computed style, never hashed DSH class names,
     * so a DSH rebuild cannot silently disable the surface picker. `<svg>` and
     * zero-size decorations are excluded; our own nodes are never targets.
     * @param {Element} element - live element.
     * @returns {boolean} whether the element is a floating box.
     */
    function annotationFloatingBox(element) {
      if (element === null || typeof element !== 'object') return false
      if (typeof element.tagName !== 'string') return false
      const tag = element.tagName.toLowerCase()
      if (tag === 'html' || tag === 'body' || tag === 'svg') return false
      if (typeof element.closest !== 'function') return false
      if (element.closest('[data-psa-own]') !== null) return false
      if (!annotationElementVisible(element)) return false
      const style = window.getComputedStyle(element)
      if (style === null || typeof style !== 'object') return false
      if (style.position !== 'fixed' && style.position !== 'absolute') return false
      const zIndex = annotationComputedZIndex(element)
      return zIndex !== null && zIndex >= ANNOTATION_SURFACE_MIN_Z
    }

    /**
     * The outermost floating surface of one candidate chain (F2).
     *
     * The hit element may be a static text row inside a body-level portal card;
     * the first floating ancestor starts the surface run, and the run is extended
     * upward while ancestors are themselves floating boxes, so the returned root
     * is the whole card rather than its inner layer. Selection never crosses the
     * root to page ancestors behind the surface.
     * @param {Array<{ element: Element, insideComposer: boolean }>} chain - candidate chain, nearest first.
     * @param {(element: Element) => boolean} [isFloating] - injectable predicate for unit tests.
     * @returns {{ root: Element, index: number } | null} surface root and its chain index.
     */
    function annotationSurfaceRoot(chain, isFloating) {
      const entries = Array.isArray(chain) ? chain : []
      const floating = typeof isFloating === 'function' ? isFloating : annotationFloatingBox
      for (let index = 0; index < entries.length; index += 1) {
        const element = entries[index] !== null && typeof entries[index] === 'object' ? entries[index].element : null
        if (element === null || element === undefined) continue
        let matched
        try {
          matched = floating(element)
        } catch {
          matched = false
        }
        if (!matched) continue
        let root = element
        let rootIndex = index
        let above = index + 1
        while (above < entries.length) {
          const ancestor = entries[above] !== null && typeof entries[above] === 'object' ? entries[above].element : null
          if (ancestor === null || ancestor === undefined) break
          let ancestorFloating
          try {
            ancestorFloating = floating(ancestor)
          } catch {
            ancestorFloating = false
          }
          if (!ancestorFloating) break
          root = ancestor
          rootIndex = above
          above += 1
        }
        return { root, index: rootIndex }
      }
      return null
    }

    /**
     * DOM accessors used by {@link annotationSurfaceLevels}; injectable so the
     * level algorithm is unit-testable without a browser.
     * @returns {object} accessor set.
     */
    function annotationSurfaceAccess() {
      return {
        descendants: (root) => (typeof root.querySelectorAll === 'function' ? Array.from(root.querySelectorAll('*')) : []),
        isCandidate: (element) => annotationIsCandidate(element),
        isOwn: (element) => typeof element.closest === 'function' && element.closest('[data-psa-own]') !== null,
        visible: (element) => annotationElementVisible(element),
        rectOf: (element) => annotationRectOf(element),
        textOf: (element) => (typeof element.innerText === 'string' ? element.innerText : (element.textContent ?? '')).trim(),
        childCount: (element) => (typeof element.children?.length === 'number' ? element.children.length : 0),
        insideComposer: (element) => typeof element.closest === 'function' && element.closest('[data-conversation-region="composer"]') !== null
      }
    }

    /**
     * Drill levels of one floating surface: the whole root first, then its inner
     * candidate controls and text rows in document order (F2).
     *
     * A level is either a normal candidate (`button`, `[aria-label]`, row, …) or a
     * text block: an element with no element children, non-empty text, and a box
     * of at least 8×8. That second rule is what lets a hover card's title/path
     * rows be selected even though they carry no role or aria attribute.
     * @param {Element} root - surface root element.
     * @param {object} [access] - accessor set (tests inject a DOM-free one).
     * @returns {Array<{ element: Element, insideComposer: boolean }>} levels, root first, capped.
     */
    function annotationSurfaceLevels(root, access) {
      if (root === null || root === undefined || typeof root !== 'object') return []
      const api = access !== null && typeof access === 'object' ? { ...annotationSurfaceAccess(), ...access } : annotationSurfaceAccess()
      const levels = [{ element: root, insideComposer: api.insideComposer(root) === true }]
      const seen = new Set([root])
      const descendants = api.descendants(root)
      for (const element of descendants) {
        if (levels.length >= ANNOTATION_SURFACE_MAX_LEVELS) break
        if (element === null || element === undefined || typeof element !== 'object') continue
        if (seen.has(element)) continue
        if (api.isOwn(element)) continue
        const box = api.rectOf(element)
        if (box === null || box === undefined || box.width <= 0 || box.height <= 0) continue
        if (!api.visible(element)) continue
        const candidate = api.isCandidate(element) === true
        const textBlock = !candidate
          && api.childCount(element) === 0
          && api.textOf(element).length > 0
          && box.width >= 8
          && box.height >= 8
        if (!candidate && !textBlock) continue
        seen.add(element)
        levels.push({ element, insideComposer: api.insideComposer(element) === true })
      }
      return levels
    }

    /**
     * Choose the meaningful index in one candidate chain.
     *
     * A hit inside a floating surface defaults to the surface root (the whole
     * card), never to a page ancestor behind it; everything else keeps the v1
     * semantic-candidate-then-solid-box behavior.
     * @param {Array<{ element: Element, insideComposer: boolean }>} chain - candidate chain.
     * @returns {number} chosen index, or -1.
     */
    function annotationPickChainIndex(chain) {
      const surface = annotationSurfaceRoot(chain)
      if (surface !== null) return surface.index
      for (let index = 0; index < chain.length; index += 1) {
        if (annotationIsCandidate(chain[index].element)) return index
      }
      for (let index = 0; index < chain.length; index += 1) {
        const rect = annotationRectOf(chain[index].element)
        if (rect !== null && rect.width > 0 && rect.height > 0) return index
      }
      return -1
    }

    /**
     * Resolve one unique element-like object from ordered locator candidates.
     *
     * Mirrors `resolveRefStatus`'s walk: a STABLE kind (`data`/`id`/`label`)
     * matching several elements is genuine ambiguity and stops the walk; a GENERIC
     * kind (`role`/`tag`/`path`) matching several cannot discriminate, so the walk
     * continues to less reliable candidates. A unique match wins, and the first
     * unique generic match is remembered as the fallback (R1).
     *
     * Pure: `queryAll(selector)` and `elementLike.tagName` are injected, so this is
     * shared with the unit-test seam. A capture-verified unique selector is tried
     * first; one hit is the node, several hits are genuine ambiguity, and no hit
     * falls back to the ordered v1 candidates (D11).
     * @param {{ candidates?: Array<object>, expectedTag?: string, queryAll?: Function, uniqueSelector?: string }} input - resolver input.
     * @returns {object | null} the unique element-like object, or null.
     */
    function resolveNodeCandidate(input) {
      const source = input !== null && typeof input === 'object' ? input : {}
      const { candidates, expectedTag, queryAll } = source
      if (typeof queryAll !== 'function') return null
      const tag = typeof expectedTag === 'string' ? expectedTag.trim().toLowerCase() : ''
      const ordered = Array.isArray(candidates)
        ? candidates.slice().sort((left, right) => (right?.reliability ?? 0) - (left?.reliability ?? 0))
        : []
      const uniqueSelector = typeof source.uniqueSelector === 'string' && source.uniqueSelector.length > 0 ? source.uniqueSelector : ''
      if (uniqueSelector.length > 0) {
        let uniqueHits = null
        try {
          uniqueHits = queryAll(uniqueSelector)
        } catch {
          uniqueHits = null
        }
        if (uniqueHits !== null && uniqueHits !== undefined && typeof uniqueHits[Symbol.iterator] === 'function') {
          const tagged = []
          for (const element of uniqueHits) {
            if (element === null || typeof element !== 'object') continue
            if (typeof element.tagName !== 'string') continue
            if (tag.length === 0 || element.tagName.toLowerCase() === tag) tagged.push(element)
          }
          if (tagged.length > 1) return null
          if (tagged.length === 1) return tagged[0]
        }
      }
      let genericMatch = null
      for (const candidate of ordered) {
        if (candidate === null || typeof candidate !== 'object' || typeof candidate.value !== 'string' || candidate.value.length === 0) continue
        let matches
        try {
          matches = queryAll(candidate.value)
        } catch {
          continue
        }
        if (matches === null || matches === undefined) continue
        if (typeof matches[Symbol.iterator] !== 'function') continue
        const list = []
        for (const element of matches) {
          if (element === null || typeof element !== 'object') continue
          if (typeof element.tagName !== 'string') continue
          const elementTag = element.tagName.toLowerCase()
          if (tag.length === 0 || elementTag === tag) list.push(element)
        }
        if (list.length === 0) continue
        const generic = candidate.kind === 'tag' || candidate.kind === 'path' || candidate.kind === 'role'
        if (list.length > 1) {
          // Stable ambiguity is final; generic ambiguity just means "keep looking".
          if (generic) continue
          return null
        }
        if (generic) {
          if (genericMatch === null) genericMatch = list[0]
          continue
        }
        return list[0]
      }
      return genericMatch
    }

    /**
     * Resolve one ref to its unique live element.
     * @param {object} ref - ElementRef.
     * @returns {Element | null} the element when exactly one candidate resolves.
     */
    function annotationResolveNode(ref) {
      if (ref === null || typeof ref !== 'object') return null
      const locator = ref.locator
      if (locator === null || typeof locator !== 'object') return null
      return resolveNodeCandidate({
        candidates: locator.candidates,
        expectedTag: locator.tag,
        uniqueSelector: typeof locator.uniqueSelector === 'string' ? locator.uniqueSelector : '',
        queryAll: (selector) => document.querySelectorAll(selector)
      })
    }

    /**
     * Collect marquee candidates intersecting one rectangle. A single bounded
     * query runs at release; nested candidates keep the deepest element.
     * @param {{ x: number, y: number, width: number, height: number }} rect - marquee rectangle.
     * @returns {Element[]} ordered candidates, capped.
     */
    function annotationBoxCandidateElements(rect) {
      if (rect === null || typeof rect !== 'object') return []
      const hits = []
      let nodes
      try {
        // One bounded scan at release, over exactly the click picker's candidates (F15).
        nodes = document.querySelectorAll(ANNOTATION_CANDIDATE_SELECTOR)
      } catch {
        return []
      }
      for (const node of nodes) {
        if (!(node instanceof Element)) continue
        if (node.closest('[data-psa-own]') !== null) continue
        if (!annotationElementVisible(node)) continue
        const box = annotationRectOf(node)
        if (box === null || box.width === 0 || box.height === 0) continue
        if (!annotationRectsIntersect(rect, box)) continue
        hits.push(node)
      }
      const specific = hits.filter((node) => !hits.some((other) => other !== node && node.contains(other)))
      return specific.slice(0, 24)
    }

    /**
     * Localized labels for the two insertion formats.
     * @param {Function} t - namespace-bound translate.
     * @returns {object} insertion labels.
     */
    function annotationInsertLabels(t) {
      return {
        title: t('insert.title'),
        reference: t('insert.reference'),
        session: t('insert.session'),
        noSession: t('insert.noSession'),
        note: t('insert.note'),
        emptyNote: t('insert.emptyNote'),
        batchHeader: t('insert.batchHeader'),
        status: t('insert.status'),
        statusEphemeral: t('insert.statusEphemeral'),
        statusAmbiguous: t('insert.statusAmbiguous'),
        statusChanged: t('insert.statusChanged'),
        skipped: t('insert.skipped'),
        removed: t('insert.removed'),
        removedCount: 0,
        noRemaining: t('insert.noRemaining')
      }
    }

    /**
     * Focus the current Conversation's Lexical editor after an insertion.
     * @returns {void}
     */
    function annotationFocusComposer() {
      const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')
      if (editor instanceof HTMLElement) editor.focus()
    }

    /**
     * Read one localStorage key, tolerating blocked storage.
     * @param {string} key - storage key.
     * @returns {string | null} stored text.
     */
    function annotationReadStorage(key) {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    }

    /**
     * Write one localStorage key, tolerating blocked storage.
     * @param {string} key - storage key.
     * @param {string} value - value to store.
     * @returns {void}
     */
    function annotationWriteStorage(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // Private mode or a hostile embedding: persistence is best effort.
      }
    }

    /**
     * Create the observable annotation store.
     * @param {object} initial - initial snapshot.
     * @returns {{ getSnapshot: Function, subscribe: Function, set: Function }} store.
     */
    function createAnnotationStore(initial) {
      let snapshot = initial
      const listeners = new Set()
      return {
        /** @returns {object} the current snapshot. */
        getSnapshot() {
          return snapshot
        },
        /**
         * Subscribe one listener.
         * @param {Function} listener - change listener.
         * @returns {Function} unsubscribe.
         */
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        /**
         * Replace the snapshot and notify listeners.
         * @param {object} next - next snapshot.
         * @returns {void}
         */
        set(next) {
          snapshot = next
          for (const listener of [...listeners]) {
            try {
              listener()
            } catch {
              // A failing subscriber must not break the controller.
            }
          }
        }
      }
    }

    /**
     * Create the annotation controller singleton.
     *
     * Owns capture-phase event isolation, hover/selection geometry, the marquee,
     * the layout frame, persistence, and Composer insertion. React only renders
     * the snapshot.
     * @param {Function} t - namespace-bound translate.
     * @param {object} ctx - client root context.
     * @returns {object} the controller face used by the React surface.
     */
    function createAnnotationController(t, ctx) {
      let settings = parseStoredSettings(annotationReadStorage(SETTINGS_STORAGE_KEY))
      let railCollapsed = annotationReadStorage(RAIL_STORAGE_KEY) === 'true'
      const viewport = annotationViewport()
      // Records are the feature's data spine: they survive reloads, so the store
      // starts from the validated persisted document instead of an empty list (D1).
      const storedRecords = parseAnnotationStore(annotationReadStorage(ANNOTATION_RECORDS_STORAGE_KEY)).records
      const store = createAnnotationStore({
        state: { ...createAnnotationState(), collection: storedRecords },
        settings: { ...settings },
        launcherPosition: clampLauncherPosition(readLauncherPosition(), viewport, ANNOTATION_LAUNCHER_SIZE),
        launcherDragging: false,
        railWidth: computeRailWidth(viewport.width, railCollapsed),
        railCollapsed,
        layoutMode: 'shrink',
        hoverRect: null,
        selectionRects: [],
        boxRect: null,
        popoverPosition: null,
        popoverPinned: false,
        flashRefId: null,
        flashRect: null,
        noteEditor: null,
        // A3 Phase 2-A transient UI state (never persisted): page marks derived per
        // geometry frame, the record under the pointer, the floating detail card,
        // and the single-slot undo payload.
        markRects: [],
        markerHoverId: null,
        detailCard: null,
        markUndo: null
      })

      /** Installed window listeners, removed on deactivate. */
      const pageListeners = []
      /** Cleanups for temporary gesture listeners; teardown aborts all of them. */
      const activeGestures = new Set()
      /** DOM revision: bumped by body mutations so resolved nodes can be reused safely (R1/R4). */
      let domRevision = 0
      /** Body mutation observer feeding domRevision; disconnected on deactivate/dispose. */
      let domObserver = null
      /** Resolved-node cache: `{ node, rev }` per ref id, reused only at the same revision. */
      const resolvedNodeCache = new Map()
      /** Per-DOM-revision resolution status cache for the mark geometry (keeps scroll frames cheap). */
      const markStatusCache = new Map()
      let markStatusRevision = -1
      /** Hover identity tokens per element. */
      const elementTokens = new WeakMap()
      /** Chain and index of the last picked selection, for level up/down. */
      let lastPick = null
      /** Pointer gesture in flight. */
      let pointer = null
      /** Last pointer point used for hover resolution. */
      let hoverPoint = null
      /** Hover rAF handle. */
      let hoverFrame = null
      /** F3 debounce: recompute hover/geometry after DOM mutations while the pointer stands still. */
      let hoverRecomputeTimer = null
      /** Geometry rAF handle. */
      let geometryFrame = null
      /** Resize debounce timer. */
      let resizeTimer = null
      /** Frame inline-style observer, the element it watches, and its debounce. */
      let frameObserver = null
      let observedFrame = null
      let frameObserverTimer = null
      /** Inline frame styles captured before the first mode write (F12). */
      let frameSnapshot = null
      /** Timer that drops the frame marker after the reverse transition (F12). */
      let frameRestoreTimer = null
      /** Feedback auto-dismiss timer. */
      let feedbackTimer = null
      /** Re-locate flash timer. */
      let flashTimer = null
      /** Until timestamp for the click that follows a launcher drag. */
      let suppressLauncherClickUntil = 0
      /** Ref id the current popover was placed for. */
      let popoverRefId = null
      /** Real mounted popover size used for clamping; the constant is only the fallback (F14). */
      let popoverMeasuredSize = { width: ANNOTATION_POPOVER_SIZE.width, height: ANNOTATION_POPOVER_SIZE.height }
      /** Mounted popover element, only used for measurement. */
      let popoverElement = null
      /** Pending popover measurement frame. */
      let popoverMeasureFrame = null
      /** Monotonic hover token. */
      let tokenSeq = 0
      /** F1: inline z-index captured from `[data-shell-overlay]` before raising it. */
      let paintSnapshot = null
      /** Pending records-persistence debounce timer (D1). */
      let persistTimer = null
      /** Last serialized records document, so no-op writes stay no-ops. */
      let persistedRecordsText = null
      /** Hover-intent timer that opens the detail card after the pointer rests on a mark. */
      let markerHoverTimer = null
      /** Grace timer that closes the detail card after the pointer leaves the mark/card union. */
      let detailCloseTimer = null
      /** Single-slot undo expiry timer (5 s from the last delete). */
      let undoExpireTimer = null
      /** Mounted detail card element and its measured size, used for clamping/keep-open. */
      let detailElement = null
      let detailMeasuredSize = { width: ANNOTATION_DETAIL_SIZE.width, height: ANNOTATION_DETAIL_SIZE.height }
      /** Pending detail-card measurement frame. */
      let detailMeasureFrame = null
      /** Composer service faces attached by the dynamic T9 inject (may stay null). */
      let composerConversation = null
      let composerInputTriggers = null

      /**
       * The current snapshot.
       * @returns {object} snapshot.
       */
      function snapshot() {
        return store.getSnapshot()
      }

      /**
       * Whether annotation mode is on.
       * @returns {boolean} whether active.
       */
      function isActive() {
        return snapshot().state.phase !== 'off'
      }

      /**
       * Merge a patch into the snapshot and notify React.
       * @param {object} patch - partial snapshot.
       * @returns {void}
       */
      function publish(patch) {
        const current = snapshot()
        let changed = false
        for (const key of Object.keys(patch)) {
          if (patch[key] !== current[key]) {
            changed = true
            break
          }
        }
        if (!changed) return
        store.set({ ...current, ...patch })
      }

      /**
       * Whether an event target sits inside our own surface, which is never blocked.
       * @param {object} event - DOM event.
       * @returns {boolean} whether the target is ours.
       */
      function eventInsideOwn(event) {
        const element = annotationEventElement(event)
        if (element === null || typeof element.closest !== 'function') return false
        return element.closest('[data-psa-own]') !== null
      }

      /**
       * Whether the pass-through modifier is held for one event.
       * @param {object} event - DOM event.
       * @returns {boolean} whether the page keeps native semantics.
       */
      function passThroughEvent(event) {
        return snapshot().state.passThrough || modifierMatches(event, settings.passThroughModifier)
      }

      /**
       * Apply one pass-through state to the reducer and the root cursor marker.
       * @param {boolean} on - whether the page has native mouse semantics.
       * @returns {void}
       */
      function setPassThrough(on) {
        const active = on === true
        if (active) document.documentElement.setAttribute('data-psa-passthrough', 'true')
        else document.documentElement.removeAttribute('data-psa-passthrough')
        dispatch({ type: 'passThrough', on: active })
        if (active) {
          // Native mouse semantics resume: no hover outline, and an in-flight
          // marquee is cancelled instead of selecting on release (F10).
          abortGestures()
          clearHover()
        }
      }

      /**
       * Block one page-level event when the mode owns it.
       * @param {object} event - DOM event.
       * @returns {boolean} whether it was blocked.
       */
      function blockEvent(event) {
        if (!isActive()) return false
        if (eventInsideOwn(event)) return false
        if (passThroughEvent(event)) return false
        event.preventDefault()
        event.stopImmediatePropagation()
        return true
      }

      /**
       * Token identifying one hovered element inside the snapshot.
       * @param {Element} element - hovered element.
       * @returns {string} token.
       */
      function tokenOf(element) {
        const existing = elementTokens.get(element)
        if (existing !== undefined) return existing
        tokenSeq += 1
        const token = `psa-hover-${tokenSeq}`
        elementTokens.set(element, token)
        return token
      }

      /**
       * Build one ref from one drill level, preserving the order/timestamp of the
       * ref it replaces (level up/down must not churn collection identity).
       *
       * The descriptor is built lazily for the chosen element plus at most two
       * context ancestors, so walking the hover chain stays cheap; the v2 capture
       * fields (unique selector, ancestors, session/route identity, surface) are
       * added here at select time, never on the pointermove hot path.
       * @param {{ element: Element, insideComposer: boolean }} level - chosen level.
       * @param {object | null} like - ref being replaced, when any.
       * @param {'page' | 'floating'} [surface] - whether the level is a floating surface.
       * @returns {object} new ElementRef.
       */
      function refForLevel(level, like, surface) {
        const element = level.element
        const bounds = annotationRectOf(element)
        const descriptor = annotationDescriptorOf(element, level.insideComposer)
        // The chain above the chosen element supplies the <=2 context labels and
        // never builds more descriptors than that (F5 performance contract).
        const chain = annotationCandidateChain(element)
        const levelChain = chain.slice(1, 3).map((item) => {
          const ancestor = annotationDescriptorOf(item.element, item.insideComposer)
          return ancestor.name || ancestor.component || ancestor.tag
        })
        const sessionId = annotationBridge.sessionId ?? annotationConversationSessionId()
        const identity = sessionIdentity(sessionId)
        const context = {
          sessionId: identity.sessionId,
          cwd: identity.cwd,
          workspaceLabel: identity.workspaceLabel,
          route: currentRoute(),
          viewport: annotationViewport(),
          surface: surface === 'floating' ? 'floating' : 'page',
          at: like !== null && typeof like === 'object' && typeof like.at === 'number' ? like.at : Date.now(),
          order: like !== null && typeof like === 'object' && typeof like.order === 'number' ? like.order : Date.now() % 1000000,
          bounds,
          levelChain
        }
        const ref = buildElementRef(descriptor, context)
        ref.note = like !== null && typeof like === 'object' && typeof like.note === 'string' ? like.note : ''
        return ref
      }

      /**
       * Drill levels for one pick: an ordinary page pick walks the v1 ancestor
       * chain (Parent = next entry), a floating-surface pick returns the root
       * plus its inner candidates/text rows (Child = next entry). The single
       * `entries`/`index`/`parentStep` shape keeps both directions honest.
       * @param {Array<object>} chain - candidate chain, nearest first.
       * @returns {{ entries: Array<object>, index: number, parentStep: number, surface: 'page' | 'floating' }} pick levels.
       */
      function pickLevels(chain) {
        const surface = annotationSurfaceRoot(chain)
        if (surface !== null) {
          const levels = annotationSurfaceLevels(surface.root)
          return {
            entries: levels.length > 0 ? levels : [{ element: surface.root, insideComposer: false }],
            index: 0,
            parentStep: -1,
            surface: 'floating'
          }
        }
        return {
          entries: chain.map((entry) => ({ element: entry.element, insideComposer: entry.insideComposer })),
          index: annotationPickChainIndex(chain),
          parentStep: 1,
          surface: 'page'
        }
      }

      /**
       * Build the ref of one lastPick level with its preserved note.
       * @param {object} pick - lastPick shape.
       * @param {object | null} like - ref being replaced, when any.
       * @returns {object} new ElementRef.
       */
      function refFromPick(pick, like) {
        return refForLevel(pick.entries[pick.index], like, pick.surface)
      }

      /**
       * The current Conversation Session identity from the DOM.
       * @returns {string | null} Session id.
       */
      function annotationConversationSessionId() {
        const occurrence = document.querySelector('[data-conversation-session]')
        if (occurrence === null) return null
        const value = occurrence.getAttribute('data-conversation-session')
        return value !== null && value.length > 0 ? value : null
      }

      /**
       * Capture the raised paint layer (F1): remember the shell overlay's own
       * inline z-index value and priority, then raise it above native hover cards
       * (z=100) while staying below native modals (1000) and menus (1100).
       *
       * `!important` is used so a React re-render that rewrites the inline style
       * cannot silently drop the raise; exit restores the captured pair exactly.
       * @returns {void}
       */
      function capturePaintLayer() {
        const overlay = document.querySelector('[data-shell-overlay]')
        if (!(overlay instanceof HTMLElement)) return
        if (paintSnapshot !== null && paintSnapshot.element === overlay) {
          if (overlay.style.getPropertyValue('z-index') !== String(ANNOTATION_PAINT_Z)) {
            overlay.style.setProperty('z-index', String(ANNOTATION_PAINT_Z), 'important')
            document.documentElement.setAttribute(ANNOTATION_RAISED_ATTR, 'true')
          }
          return
        }
        if (paintSnapshot !== null) restorePaintLayer()
        paintSnapshot = {
          element: overlay,
          index: {
            value: overlay.style.getPropertyValue('z-index'),
            priority: overlay.style.getPropertyPriority('z-index')
          }
        }
        overlay.style.setProperty('z-index', String(ANNOTATION_PAINT_Z), 'important')
        document.documentElement.setAttribute(ANNOTATION_RAISED_ATTR, 'true')
      }

      /**
       * Restore the paint layer to the exact captured inline z-index state (F1).
       * @returns {void}
       */
      function restorePaintLayer() {
        document.documentElement.removeAttribute(ANNOTATION_RAISED_ATTR)
        if (paintSnapshot === null) return
        const saved = paintSnapshot
        paintSnapshot = null
        const element = saved.element
        if (element === null || element === undefined || typeof element.style !== 'object') return
        const index = saved.index
        if (index.value === '' && index.priority === '') element.style.removeProperty('z-index')
        else element.style.setProperty('z-index', index.value, index.priority)
      }

      /**
       * Announce mode state for the dynamic-workspaces hover-card pinning (D3).
       * The dependent behavior is owned by that feature; this side only reports
       * state. Dispatched on `document` with bubbling so both document- and
       * window-level listeners observe it.
       * @param {boolean} active - whether annotation mode just turned on/off.
       * @returns {void}
       */
      function announceAnnotationState(active) {
        try {
          document.dispatchEvent(new CustomEvent(ANNOTATION_STATE_EVENT, {
            detail: { active: active === true },
            bubbles: true
          }))
        } catch {
          // Announcement is contract glue; a hostile embedding must not break the mode.
        }
      }

      /**
       * Session identity enrichment for captured records (D6): full `cwd` is
       * persisted (local only), the Workspace label is its basename.
       * @param {string | null} sessionId - Session identity.
       * @returns {{ sessionId: string | null, cwd: string | null, workspaceLabel: string | null }} identity.
       */
      function sessionIdentity(sessionId) {
        const id = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
        if (id === null) return { sessionId: null, cwd: null, workspaceLabel: null }
        // Primary source: the Composer seat's Session-scope bridge. The annotation
        // overlay is not a slot and `ctx.sessions` has no live list face here, so
        // reading the bridge is the only reliable path (F-2).
        if (annotationBridge.sessionId === id && typeof annotationBridge.sessionCwd === 'string' && annotationBridge.sessionCwd.length > 0) {
          return {
            sessionId: id,
            cwd: annotationBridge.sessionCwd,
            workspaceLabel: annotationWorkspaceLabel(annotationBridge.sessionCwd)
          }
        }
        // Fallback for a record captured before the seat mirrored identity, or in
        // an embedding without the seat. An unexpected failure is reported once
        // instead of being swallowed silently.
        let cwd = null
        try {
          const sessions = ctx !== null && typeof ctx === 'object' ? ctx.sessions : null
          const list = sessions !== null && typeof sessions === 'object' ? sessions.list : null
          const listSnapshot = list !== null && typeof list === 'object' && typeof list.getSnapshot === 'function'
            ? list.getSnapshot()
            : null
          const entry = listSnapshot !== null && listSnapshot !== undefined
            && listSnapshot.byId !== null && typeof listSnapshot.byId === 'object'
            ? listSnapshot.byId[id]
            : null
          if (entry !== null && entry !== undefined && typeof entry.cwd === 'string' && entry.cwd.length > 0) cwd = entry.cwd
        } catch (error) {
          if (!annotationIdentityWarned) {
            annotationIdentityWarned = true
            try {
              console.warn('power-suite: annotation Session identity fallback failed', error)
            } catch {
              // Console may be unavailable in a hostile embedding.
            }
          }
        }
        return { sessionId: id, cwd, workspaceLabel: annotationWorkspaceLabel(cwd) }
      }

      /** @returns {string} current SPA route pathname, never query or fragment. */
      function currentRoute() {
        try {
          const location = window.location
          return annotationRoutePath(location !== null && typeof location === 'object' ? location.pathname : '/')
        } catch {
          return '/'
        }
      }

      /**
       * Write the persisted records document now (D1). No-op when nothing changed.
       * @returns {void}
       */
      function flushAnnotationRecords() {
        if (persistTimer !== null) {
          window.clearTimeout(persistTimer)
          persistTimer = null
        }
        let text
        try {
          text = serializeAnnotationStore(snapshot().state.collection, Date.now())
        } catch {
          return
        }
        if (text === persistedRecordsText) return
        persistedRecordsText = text
        annotationWriteStorage(ANNOTATION_RECORDS_STORAGE_KEY, text)
      }

      /**
       * Debounce one records write after a collection mutation (D1: 250 ms).
       * @returns {void}
       */
      function scheduleAnnotationRecordsPersist() {
        if (persistTimer !== null) window.clearTimeout(persistTimer)
        persistTimer = window.setTimeout(() => {
          persistTimer = null
          flushAnnotationRecords()
        }, ANNOTATION_PERSIST_DEBOUNCE_MS)
      }

      /**
       * Copy the best locator of one record ("Copy locator", D10) and report the
       * outcome through the feedback toast. Uses the verified unique selector when
       * present, else the best ordered candidate.
       * @param {string} [refId] - collection entry id; omitted means the current selection.
       * @returns {boolean} whether a copy was attempted synchronously.
       */
      function copyLocator(refId) {
        const current = snapshot().state
        const ref = typeof refId === 'string' && refId.length > 0
          ? current.collection.find((entry) => entry.id === refId)
          : current.selection[0]
        if (ref === undefined || ref === null) return false
        const text = annotationLocatorText(ref)
        if (typeof text !== 'string' || text.length === 0) {
          feedback(t('feedback.locatorCopyFailed'), 'error')
          return false
        }
        let clipboard = null
        try {
          clipboard = typeof navigator !== 'undefined' && navigator !== null ? navigator.clipboard : null
        } catch {
          clipboard = null
        }
        if (clipboard === null || clipboard === undefined || typeof clipboard.writeText !== 'function') {
          feedback(t('feedback.locatorCopyFailed'), 'error')
          return false
        }
        try {
          const result = clipboard.writeText(text)
          if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
            result.then(
              () => feedback(t('feedback.locatorCopied')),
              () => feedback(t('feedback.locatorCopyFailed'), 'error')
            )
          } else {
            feedback(t('feedback.locatorCopied'))
          }
          return true
        } catch {
          feedback(t('feedback.locatorCopyFailed'), 'error')
          return false
        }
      }

      /**
       * Start the body mutation observer that feeds the resolved-node revision.
       * Only childList/characterData are observed: an attribute-only change keeps
       * the same node, so it cannot swap the element identity we resolved (R1/R4).
       * @returns {void}
       */
      function ensureDomObserver() {
        if (domObserver !== null) return
        if (typeof MutationObserver !== 'function') return
        if (typeof document === 'undefined' || document.body === null) return
        domObserver = new MutationObserver(() => {
          domRevision += 1
          // F3: a floating card that appears/expands under a stationary pointer has
          // no pointermove to trigger a recompute. Re-resolve after a short debounce
          // so the outline follows the DOM rather than lagging on the old target.
          if (!isActive() || hoverPoint === null || snapshot().state.passThrough) return
          if (hoverRecomputeTimer !== null) window.clearTimeout(hoverRecomputeTimer)
          hoverRecomputeTimer = window.setTimeout(() => {
            hoverRecomputeTimer = null
            if (!isActive() || hoverPoint === null) return
            scheduleHover()
            scheduleGeometry()
          }, 60)
        })
        domObserver.observe(document.body, { childList: true, subtree: true, characterData: true })
      }

      /**
       * Drop the resolved-node cache and stop observing DOM mutations.
       * Called on deactivate, activation rollback, and disposal.
       * @returns {void}
       */
      function clearResolvedNodeCache() {
        resolvedNodeCache.clear()
        markStatusCache.clear()
        markStatusRevision = -1
        domRevision += 1
        if (domObserver !== null) {
          domObserver.disconnect()
          domObserver = null
        }
      }

      /**
       * Resolve one ref's live node.
       *
       * The resolved node is cached together with the DOM revision. A scroll frame
       * reuses it only while no body mutation happened and the node is still
       * connected; any mutation (or a missing node entry) re-runs the unique
       * candidate resolver, so a re-render cannot leave us highlighting the stale
       * first hit a selector happened to match (F3 + R1/R4).
       * @param {object} ref - ElementRef.
       * @returns {Element | null} the unique live element, or null.
       */
      function liveNode(ref) {
        ensureDomObserver()
        const cached = resolvedNodeCache.get(ref.id)
        if (cached !== undefined) {
          if (cached.rev === domRevision) {
            // A null entry is a real "ambiguous/unresolvable at this revision" result;
            // reusing it keeps scroll frames from re-scanning the same ref.
            if (cached.node === null) return null
            if (cached.node.isConnected !== false) return cached.node
          }
          resolvedNodeCache.delete(ref.id)
        }
        const node = annotationResolveNode(ref)
        resolvedNodeCache.set(ref.id, { node, rev: domRevision })
        return node
      }

      /**
       * Re-resolve one ref's status against the live document.
       * @param {object} ref - ElementRef.
       * @returns {'resolved' | 'ambiguous' | 'missing' | 'changed'} status.
       */
      function statusOf(ref) {
        if (ref === null || typeof ref !== 'object' || ref.locator === null || typeof ref.locator !== 'object') return 'missing'
        return resolveRefStatus({
          candidates: ref.locator.candidates,
          expectedTag: ref.locator.tag,
          uniqueSelector: typeof ref.locator.uniqueSelector === 'string' ? ref.locator.uniqueSelector : '',
          queryAll: (selector) => document.querySelectorAll(selector),
          liveInfo: (element) => {
            const elementText = typeof element.textContent === 'string' ? element.textContent : ''
            const liveTag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
            return {
              isConnected: element.isConnected,
              textContent: elementText,
              expectedText: typeof ref.text === 'string' ? ref.text : '',
              expectedDigest: typeof ref.textDigest === 'string' ? ref.textDigest : '',
              actualDigest: textDigest(elementText),
              expectedName: ref.locator !== null && typeof ref.locator === 'object' && typeof ref.locator.name === 'string' ? ref.locator.name : '',
              actualName: liveTag.length > 0 ? annotationAccessibleName(element, liveTag) : ''
            }
          }
        })
      }

      /**
       * The Session the bridge is currently attached to, or null when no composer is
       * mounted (start page, Plugins view, or a seat that has not mounted yet).
       * @returns {string | null} current Session identity.
       */
      function currentSessionId() {
        const sessionId = annotationBridge.sessionId ?? snapshot().state.sessionId
        return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
      }

      /**
       * Whether one ref is already in the collection for its own Session.
       * @param {object} ref - ElementRef.
       * @returns {boolean} whether present.
       */
      function isInCollection(ref) {
        const key = identityKeyOf(ref)
        const sessionId = ref?.session?.sessionId ?? null
        return snapshot().state.collection.some((entry) => identityKeyOf(entry) === key && (entry?.session?.sessionId ?? null) === sessionId)
      }

      /**
       * Current Session scope of one collection entry.
       * @param {object} ref - ElementRef.
       * @returns {'current' | 'other'} scope.
       */
      function collectionScopeOf(ref) {
        const current = currentSessionId()
        if (current === null) return 'other'
        return ref?.session?.sessionId === current ? 'current' : 'other'
      }

      /**
       * Whether one viewport point falls inside one rectangle.
       * @param {{ x: number, y: number }} point - viewport point.
       * @param {{ x: number, y: number, width: number, height: number }} rect - rectangle.
       * @returns {boolean} whether inside.
       */
      function annotationPointInRect(point, rect) {
        if (point === null || rect === null || typeof point !== 'object' || typeof rect !== 'object') return false
        const x = typeof point.x === 'number' ? point.x : NaN
        const y = typeof point.y === 'number' ? point.y : NaN
        const left = typeof rect.x === 'number' ? rect.x : NaN
        const top = typeof rect.y === 'number' ? rect.y : NaN
        const width = typeof rect.width === 'number' ? rect.width : NaN
        const height = typeof rect.height === 'number' ? rect.height : NaN
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(left) || !Number.isFinite(top)) return false
        return x >= left && x <= left + width && y >= top && y <= top + height
      }

      /**
       * Page marks for the current collection (A3/T6).
       *
       * Only a record of the current Session whose live target resolves (or
       * resolves as changed) is drawn; a missing/ambiguous/other-Session record is
       * never drawn because a mark would point at the wrong element. Geometry is
       * recomputed on the existing geometry frames (scroll/resize/mutations).
       * @param {object} state - annotation state.
       * @returns {Array<object>} mark descriptors `{ id, index, rect, stale, summary, empty }`.
       */
      function markRectsOf(state) {
        const marks = []
        const collection = state !== null && typeof state === 'object' && Array.isArray(state.collection) ? state.collection : []
        for (let index = 0; index < collection.length; index += 1) {
          const entry = collection[index]
          if (entry === null || typeof entry !== 'object') continue
          if (collectionScopeOf(entry) !== 'current') continue
          if (markStatusRevision !== domRevision) {
            markStatusCache.clear()
            markStatusRevision = domRevision
          }
          let status = markStatusCache.get(entry.id)
          if (status === undefined) {
            status = statusOf(entry)
            markStatusCache.set(entry.id, status)
          }
          if (status !== 'resolved' && status !== 'changed') continue
          const node = liveNode(entry)
          if (node === null) continue
          const rect = annotationRectOf(node)
          if (rect === null || rect.width <= 0 || rect.height <= 0) continue
          const excerpt = annotationMarkerBadgeText(entry.note)
          marks.push({
            id: entry.id,
            index: index + 1,
            rect,
            stale: status === 'changed',
            summary: excerpt.text,
            empty: excerpt.empty
          })
        }
        return marks
      }

      /**
       * The mark under one viewport point, topmost (last drawn) first.
       * @param {{ x: number, y: number }} point - viewport point.
       * @param {Array<object>} marks - current mark descriptors.
       * @returns {object | null} hit mark.
       */
      function findMarkAt(point, marks) {
        const list = Array.isArray(marks) ? marks : []
        for (let index = list.length - 1; index >= 0; index -= 1) {
          const mark = list[index]
          if (mark !== null && typeof mark === 'object' && mark.rect !== null && typeof mark.rect === 'object' && annotationPointInRect(point, mark.rect)) return mark
        }
        return null
      }

      /**
       * The detail card's kept-open rectangle (pointer may enter it).
       * @param {object} current - current snapshot.
       * @returns {{ x: number, y: number, width: number, height: number } | null} card rect.
       */
      function detailCardRect(current) {
        const card = current !== null && typeof current === 'object' ? current.detailCard : null
        if (card === null || typeof card !== 'object') return null
        return {
          x: typeof card.x === 'number' ? card.x : 0,
          y: typeof card.y === 'number' ? card.y : 0,
          width: detailMeasuredSize.width,
          height: detailMeasuredSize.height
        }
      }

      /** Cancel the hover-intent timer that would open the detail card. @returns {void} */
      function cancelMarkerHoverTimer() {
        if (markerHoverTimer !== null) {
          window.clearTimeout(markerHoverTimer)
          markerHoverTimer = null
        }
      }

      /** Cancel the pending detail-card close. @returns {void} */
      function cancelDetailClose() {
        if (detailCloseTimer !== null) {
          window.clearTimeout(detailCloseTimer)
          detailCloseTimer = null
        }
      }

      /** Close the detail card and (by default) drop its marker-hover state. @param {{ keepMarker?: boolean }} [options] - close options. @returns {boolean} whether a card was open. */
      function closeDetailCard(options) {
        const settingsForClose = options !== null && typeof options === 'object' ? options : {}
        cancelDetailClose()
        cancelMarkerHoverTimer()
        const current = snapshot()
        const hadCard = current.detailCard !== null
        if (hadCard) publish({ detailCard: null })
        if (settingsForClose.keepMarker !== true && current.markerHoverId !== null) publish({ markerHoverId: null })
        return hadCard
      }

      /**
       * Open the detail card for one mark at its clamped position (A3/T6).
       * @param {object} mark - mark descriptor from {@link markRectsOf}.
       * @returns {void}
       */
      function openDetailCard(mark) {
        if (!isActive() || mark === null || typeof mark !== 'object') return
        const current = snapshot()
        if (current.state.selection.length > 0) return
        const position = clampDetailCardPosition(mark.rect, detailMeasuredSize, annotationViewport(), current.railWidth)
        cancelDetailClose()
        publish({
          detailCard: {
            refId: mark.id,
            x: position.x,
            y: position.y,
            placement: position.placement,
            mode: 'view'
          }
        })
      }

      /**
       * Arm the hover-intent timer for one mark (120 ms, A3/T6).
       * @param {object} mark - mark descriptor.
       * @returns {void}
       */
      function scheduleMarkerHoverOpen(mark) {
        cancelMarkerHoverTimer()
        if (!isActive()) return
        markerHoverTimer = window.setTimeout(() => {
          markerHoverTimer = null
          if (!isActive()) return
          const current = snapshot()
          if (current.state.selection.length > 0) return
          const fresh = (Array.isArray(current.markRects) ? current.markRects : []).find((item) => item.id === mark.id)
          if (fresh === undefined) return
          openDetailCard(fresh)
        }, ANNOTATION_DETAIL_HOVER_DELAY_MS)
      }

      /**
       * Close the detail card after a 120 ms grace period unless the pointer is on
       * the mark or inside the card (A3/T6 keep-open union).
       * @returns {void}
       */
      function scheduleDetailClose() {
        if (detailCloseTimer !== null) return
        detailCloseTimer = window.setTimeout(() => {
          detailCloseTimer = null
          if (!isActive()) return
          const current = snapshot()
          if (current.detailCard === null) return
          if (hoverPoint !== null && annotationPointInRect(hoverPoint, detailCardRect(current))) return
          if (hoverPoint !== null) {
            const hit = findMarkAt(hoverPoint, current.markRects)
            if (hit !== null && hit.id === current.detailCard.refId) return
          }
          closeDetailCard()
        }, ANNOTATION_DETAIL_CLOSE_DELAY_MS)
      }

      /**
       * Recompute the detail position against its mark (scroll/resize/mutation).
       * @returns {void}
       */
      function reclampDetailCard() {
        const current = snapshot()
        if (current.detailCard === null || typeof current.detailCard !== 'object') return
        const mark = (Array.isArray(current.markRects) ? current.markRects : []).find((item) => item.id === current.detailCard.refId)
        if (mark === undefined) return
        const position = clampDetailCardPosition(mark.rect, detailMeasuredSize, annotationViewport(), current.railWidth)
        if (position.x === current.detailCard.x && position.y === current.detailCard.y) return
        publish({ detailCard: { ...current.detailCard, x: position.x, y: position.y, placement: position.placement } })
      }

      /**
       * Marker-hover detection fed by pointer movement (A3/T6).
       *
       * The mark layer is pointer-transparent, so hit testing is numeric against
       * the per-frame mark rects. A hit arms the 120 ms hover-intent timer; the
       * pointer may then move into the detail card, which keeps it open.
       * @param {{ x: number, y: number } | null} point - current viewport point.
       * @returns {void}
       */
      function updateMarkerHover(point) {
        if (!isActive() || point === null) return
        const current = snapshot()
        if (annotationPointInRect(point, detailCardRect(current))) {
          cancelDetailClose()
          return
        }
        const hit = findMarkAt(point, current.markRects)
        const markerHoverId = hit !== null ? hit.id : null
        if (current.markerHoverId !== markerHoverId) publish({ markerHoverId })
        // The detail card and the popover are mutually exclusive: a draft selection
        // always wins, and a click on the page closes the card before selecting.
        if (current.state.selection.length > 0) {
          if (current.detailCard !== null) closeDetailCard()
          return
        }
        if (hit === null) {
          if (current.detailCard !== null) scheduleDetailClose()
          else cancelMarkerHoverTimer()
          return
        }
        cancelDetailClose()
        if (current.detailCard !== null) {
          if (current.detailCard.refId === hit.id) return
          closeDetailCard({ keepMarker: true })
        }
        scheduleMarkerHoverOpen(hit)
      }

      /** Track the mounted detail card for measurement. @param {Element | null} node - detail card root. @returns {void} */
      function attachDetailNode(node) {
        if (node === null || node === undefined) {
          detachDetailNode()
          return
        }
        if (!(node instanceof HTMLElement) || node === detailElement) return
        detailElement = node
        scheduleDetailMeasure()
      }

      /** Forget the mounted detail card. @returns {void} */
      function detachDetailNode() {
        detailElement = null
        if (detailMeasureFrame !== null) {
          window.cancelAnimationFrame(detailMeasureFrame)
          detailMeasureFrame = null
        }
      }

      /** Measure the detail card and re-clamp once its real size is known. @returns {void} */
      function measureDetailCard() {
        if (detailElement === null || typeof detailElement.getBoundingClientRect !== 'function') return
        const rect = detailElement.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const size = { width: Math.round(rect.width), height: Math.round(rect.height) }
        const changed = size.width !== detailMeasuredSize.width || size.height !== detailMeasuredSize.height
        detailMeasuredSize = size
        if (changed) reclampDetailCard()
      }

      /** Schedule one coalesced detail-card measurement. @returns {void} */
      function scheduleDetailMeasure() {
        if (detailMeasureFrame !== null) return
        detailMeasureFrame = window.requestAnimationFrame(() => {
          detailMeasureFrame = null
          measureDetailCard()
        })
      }

      /**
       * Derive selection/popover geometry for one state.
       * @param {object} state - next state.
       * @param {object} previous - previous snapshot.
       * @returns {object} snapshot patch.
       */
      function deriveGeometry(state, previous) {
        const selectionRects = []
        for (const ref of state.selection) {
          const node = liveNode(ref)
          const rect = node !== null ? annotationRectOf(node) : normalizeAnnotationBounds(ref.bounds)
          if (rect !== null) selectionRects.push({ id: ref.id, rect })
        }
        let popoverPosition = previous.popoverPosition
        let popoverPinned = previous.popoverPinned
        if (state.phase === 'selected' && state.selection.length === 1) {
          const ref = state.selection[0]
          if (popoverRefId !== ref.id) {
            popoverRefId = ref.id
            popoverPinned = false
            popoverPosition = null
          }
          if (popoverPosition === null || !popoverPinned) {
            const node = liveNode(ref)
            const rect = node !== null ? annotationRectOf(node) : normalizeAnnotationBounds(ref.bounds)
            popoverPosition = rect === null
              ? null
              : clampPopoverPosition(rect, popoverMeasuredSize, annotationViewport(), previous.railWidth)
          }
        } else {
          popoverRefId = null
          popoverPosition = null
          popoverPinned = false
        }
        return { selectionRects, popoverPosition, popoverPinned, boxRect: state.box }
      }

      /**
       * Re-clamp a pinned or target-anchored popover with the last measured size.
       * @returns {void}
       */
      function reclampPopoverWithMeasuredSize() {
        const current = snapshot()
        if (current.state.phase !== 'selected' || current.state.selection.length !== 1) return
        const viewport = annotationViewport()
        if (current.popoverPinned && current.popoverPosition !== null) {
          publish({ popoverPosition: clampPopoverPositionToViewport(current.popoverPosition, popoverMeasuredSize, viewport, current.railWidth) })
          return
        }
        const ref = current.state.selection[0]
        const node = liveNode(ref)
        const targetRect = node !== null ? annotationRectOf(node) : normalizeAnnotationBounds(ref.bounds)
        if (targetRect === null) return
        publish({ popoverPosition: clampPopoverPosition(targetRect, popoverMeasuredSize, viewport, current.railWidth) })
      }

      /**
       * Measure the mounted popover and use its real height/width for clamping; a
       * fixed estimate could overflow for a long note or a narrow viewport (F14).
       * @returns {void}
       */
      function measurePopover() {
        if (popoverElement === null || typeof popoverElement.getBoundingClientRect !== 'function') return
        const rect = popoverElement.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const size = { width: Math.round(rect.width), height: Math.round(rect.height) }
        const changed = size.width !== popoverMeasuredSize.width || size.height !== popoverMeasuredSize.height
        popoverMeasuredSize = size
        if (changed) reclampPopoverWithMeasuredSize()
      }

      /** Schedule one coalesced popover measurement. @returns {void} */
      function schedulePopoverMeasure() {
        if (popoverMeasureFrame !== null) return
        popoverMeasureFrame = window.requestAnimationFrame(() => {
          popoverMeasureFrame = null
          measurePopover()
        })
      }

      /**
       * Track the mounted popover element for measurement.
       * @param {Element | null} node - mounted popover root.
       * @returns {void}
       */
      function attachPopoverNode(node) {
        if (!(node instanceof HTMLElement) || node === popoverElement) return
        popoverElement = node
        schedulePopoverMeasure()
      }

      /** Forget the mounted popover element. @returns {void} */
      function detachPopoverNode() {
        popoverElement = null
        if (popoverMeasureFrame !== null) {
          window.cancelAnimationFrame(popoverMeasureFrame)
          popoverMeasureFrame = null
        }
      }

      /**
       * Reduce one action and publish the derived snapshot.
       * @param {object} action - reducer action.
       * @returns {object} next state.
       */
      function dispatch(action) {
        const current = snapshot()
        const nextState = reduceAnnotationState(current.state, action)
        if (nextState === current.state) return current.state
        const patch = deriveGeometry(nextState, current)
        store.set({ ...current, state: nextState, ...patch })
        // D1: every collection mutation schedules one debounced records write.
        if (nextState.collection !== current.state.collection) {
          scheduleAnnotationRecordsPersist()
          // A3/T6: marks are derived from the collection, so a commit/remove/restore
          // must repaint them on the next geometry frame.
          scheduleGeometry()
          const card = snapshot().detailCard
          if (card !== null && !nextState.collection.some((entry) => entry.id === card.refId)) closeDetailCard()
        }
        return nextState
      }

      /**
       * Show one transient feedback message.
       * @param {string} text - localized message.
       * @param {'info' | 'error'} [kind] - severity.
       * @returns {void}
       */
      function feedback(text, kind) {
        if (typeof text !== 'string' || text.length === 0) return
        dispatch({
          type: 'feedback',
          feedback: { kind: kind === 'error' ? 'error' : 'info', text, at: Date.now() }
        })
        if (feedbackTimer !== null) window.clearTimeout(feedbackTimer)
        feedbackTimer = window.setTimeout(() => {
          feedbackTimer = null
          dispatch({ type: 'feedback', feedback: null })
        }, 3200)
      }

      /**
       * Clamp and store the launcher position.
       * @param {{ x: number, y: number }} position - desired position.
       * @returns {void}
       */
      function persistLauncherPosition(position) {
        annotationWriteStorage(LAUNCHER_STORAGE_KEY, JSON.stringify(position))
      }

      /**
       * Read the remembered launcher position.
       * @returns {{ x: number, y: number } | null} remembered position.
       */
      function readLauncherPosition() {
        const raw = annotationReadStorage(LAUNCHER_STORAGE_KEY)
        if (raw === null) return null
        try {
          const parsed = JSON.parse(raw)
          if (parsed === null || typeof parsed !== 'object') return null
          if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null
          return { x: parsed.x, y: parsed.y }
        } catch {
          return null
        }
      }

      /**
       * Recompute rail width, layout mode, and the frame padding.
       * @returns {void}
       */
      function updateLayout() {
        const current = snapshot()
        const size = annotationViewport()
        const railWidth = computeRailWidth(size.width, current.railCollapsed)
        const mode = layoutModeFor(size.width, annotationMeasureSidebarWidths(), railWidth)
        const frame = annotationLayoutFrame()
        if (isActive() && frame !== null) {
          captureFrameInline(frame)
          if (frameRestoreTimer !== null) {
            // Reactivating before the reverse transition finished must keep the marker.
            window.clearTimeout(frameRestoreTimer)
            frameRestoreTimer = null
          }
          if (frame.getAttribute('data-psa-frame') !== 'true') frame.setAttribute('data-psa-frame', 'true')
          if (mode === 'shrink') {
            if (frame.style.paddingRight !== `${railWidth}px`) frame.style.paddingRight = `${railWidth}px`
          } else if (frameSnapshot !== null) {
            // Overlay mode reserves no strip: put the host's own padding back instead
            // of writing '' over it or leaving the shrink padding behind (F12).
            restoreInlineProperty(frame, 'padding-right', frameSnapshot.paddingRight)
          }
          const railProperty = `${railWidth}px`
          if (frame.style.getPropertyValue('--psa-rail-width') !== railProperty) frame.style.setProperty('--psa-rail-width', railProperty)
          observeFrame(frame)
        }
        const launcherPosition = clampLauncherForLayout(current.launcherPosition, size, isActive() ? railWidth : 0)
        const patch = { railWidth, layoutMode: mode, launcherPosition }
        if (current.state.phase === 'selected' && current.selectionRects.length > 0 && current.popoverPosition !== null) {
          if (current.popoverPinned) {
            // A dragged/pinned popover keeps its offset but must stay on-screen.
            patch.popoverPosition = clampPopoverPositionToViewport(current.popoverPosition, popoverMeasuredSize, size, railWidth)
          } else {
            const ref = current.state.selection[0]
            const node = ref === undefined ? null : liveNode(ref)
            const rect = node !== null ? annotationRectOf(node) : normalizeAnnotationBounds(ref?.bounds)
            if (rect !== null) patch.popoverPosition = clampPopoverPosition(rect, popoverMeasuredSize, size, railWidth)
          }
        }
        publish(patch)
        persistLauncherPositionIfNeeded(launcherPosition, current.launcherPosition)
      }

      /**
       * Persist a clamped launcher position when resize moved it.
       * @param {{ x: number, y: number }} next - clamped position.
       * @param {{ x: number, y: number }} previous - previous position.
       * @returns {void}
       */
      function persistLauncherPositionIfNeeded(next, previous) {
        if (next.x === previous.x && next.y === previous.y) return
        persistLauncherPosition(next)
      }

      /**
       * Observe the frame's inline style so opening/closing native sidebars
       * re-evaluates the layout mode.
       * @param {Element} frame - layout frame.
       * @returns {void}
       */
      function observeFrame(frame) {
        if (frameObserver !== null && observedFrame === frame) return
        if (frameObserver !== null) {
          frameObserver.disconnect()
          frameObserver = null
        }
        observedFrame = frame
        if (typeof MutationObserver !== 'function') return
        frameObserver = new MutationObserver(() => {
          if (frameObserverTimer !== null) window.clearTimeout(frameObserverTimer)
          frameObserverTimer = window.setTimeout(() => {
            frameObserverTimer = null
            if (!isActive()) return
            updateLayout()
          }, 140)
        })
        frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'class'] })
      }

      /** Stop observing the frame. @returns {void} */
      function disconnectFrameObserver() {
        if (frameObserverTimer !== null) {
          window.clearTimeout(frameObserverTimer)
          frameObserverTimer = null
        }
        if (frameObserver !== null) {
          frameObserver.disconnect()
          frameObserver = null
        }
        observedFrame = null
      }

      /**
       * Register one temporary gesture cleanup so teardown can abort it.
       * @param {(aborted: boolean) => void} cleanup - removes listeners and settles the gesture.
       * @returns {Function} unregister handle.
       */
      function trackGesture(cleanup) {
        activeGestures.add(cleanup)
        return () => {
          activeGestures.delete(cleanup)
        }
      }

      /**
       * Abort every in-flight gesture (launcher drag, popover drag, marquee) without
       * changing the mode or persisting a half-finished interaction.
       * @returns {void}
       */
      function abortGestures() {
        for (const cleanup of [...activeGestures]) {
          try {
            cleanup(true)
          } catch {
            // One broken gesture must not block the remaining cleanups.
          }
        }
        activeGestures.clear()
        pointer = null
        publish({ launcherDragging: false })
        if (snapshot().state.box !== null || snapshot().boxRect !== null) {
          publish({ boxRect: null })
          dispatch({ type: 'box', box: null })
        }
      }

      /**
       * Cancel a pending hover computation and clear the hover highlight.
       * @returns {void}
       */
      function clearHover() {
        if (hoverFrame !== null) {
          window.cancelAnimationFrame(hoverFrame)
          hoverFrame = null
        }
        hoverPoint = null
        if (snapshot().state.hoverId !== null || snapshot().hoverRect !== null) {
          publish({ hoverRect: null })
          dispatch({ type: 'hover', targetId: null })
        }
      }

      /**
       * Schedule one coalesced hover resolution.
       * @returns {void}
       */
      function scheduleHover() {
        if (hoverFrame !== null) return
        hoverFrame = window.requestAnimationFrame(() => {
          hoverFrame = null
          resolveHover()
        })
      }

      /**
       * Resolve the element under the last pointer point and publish its outline.
       * @returns {void}
       */
      function resolveHover() {
        if (!isActive() || hoverPoint === null) return
        if (snapshot().state.passThrough) {
          clearHover()
          return
        }
        const element = document.elementFromPoint(hoverPoint.x, hoverPoint.y)
        if (element === null) {
          clearHover()
          return
        }
        if (element.closest('[data-psa-own]') !== null) {
          clearHover()
          return
        }
        const chain = annotationCandidateChain(element)
        const index = annotationPickChainIndex(chain)
        if (index < 0) {
          clearHover()
          return
        }
        const candidate = chain[index].element
        const token = tokenOf(candidate)
        const rect = annotationRectOf(candidate)
        if (snapshot().state.hoverId !== token) dispatch({ type: 'hover', targetId: token })
        publish({ hoverRect: rect })
      }

      /**
       * Schedule one coalesced selection-outline refresh.
       * @returns {void}
       */
      function scheduleGeometry() {
        if (geometryFrame !== null) return
        geometryFrame = window.requestAnimationFrame(() => {
          geometryFrame = null
          const current = snapshot()
          if (!isActive()) return
          const patch = { selectionRects: [] }
          const rects = []
          for (const ref of current.state.selection) {
            const node = liveNode(ref)
            const rect = node !== null ? annotationRectOf(node) : normalizeAnnotationBounds(ref.bounds)
            if (rect !== null) rects.push({ id: ref.id, rect })
          }
          patch.selectionRects = rects
          // A3/T6: page marks are derived on the same rAF as the other geometry, so
          // scroll/resize/DOM-mutation frames keep them glued to their elements.
          patch.markRects = markRectsOf(current.state)
          if (current.detailCard !== null) {
            const cardMark = patch.markRects.find((mark) => mark.id === current.detailCard.refId)
            const nextHover = current.markerHoverId !== null && patch.markRects.some((mark) => mark.id === current.markerHoverId)
              ? current.markerHoverId
              : null
            if (nextHover !== current.markerHoverId) patch.markerHoverId = nextHover
            if (cardMark === undefined) {
              // The target stopped resolving (or moved out of the current Session):
              // a card pointing at a missing element is worse than no card.
              patch.detailCard = null
              cancelDetailClose()
            } else {
              const position = clampDetailCardPosition(cardMark.rect, detailMeasuredSize, annotationViewport(), current.railWidth)
              if (position.x !== current.detailCard.x || position.y !== current.detailCard.y) {
                patch.detailCard = { ...current.detailCard, x: position.x, y: position.y, placement: position.placement }
              }
            }
          }
          if (current.flashRefId !== null) {
            const flashRef = current.state.collection.find((entry) => entry.id === current.flashRefId)
            const flashNode = flashRef === undefined ? null : liveNode(flashRef)
            patch.flashRect = flashNode !== null ? annotationRectOf(flashNode) : null
          }
          if (current.popoverPosition !== null && current.popoverPinned === false && current.state.phase === 'selected') {
            const ref = current.state.selection[0]
            const node = ref === undefined ? null : liveNode(ref)
            const rect = node !== null ? annotationRectOf(node) : normalizeAnnotationBounds(ref?.bounds)
            if (rect !== null) patch.popoverPosition = clampPopoverPosition(rect, popoverMeasuredSize, annotationViewport(), current.railWidth)
          }
          publish(patch)
        })
      }

      /**
       * Handle one left-button pointer press on the page.
       * @param {PointerEvent} event - pointerdown.
       * @returns {void}
       */
      function onPointerDown(event) {
        if (!isActive()) return
        if (eventInsideOwn(event)) return
        if (passThroughEvent(event)) {
          clearHover()
          return
        }
        if (!blockEvent(event)) return
        // A3/T6: a page press dismisses the hover card before the click selection.
        closeDetailCard()
        if (event.button !== 0) {
          pointer = null
          return
        }
        pointer = {
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          boxMode: modifierMatches(event, settings.multiModifier),
          pointerId: event.pointerId
        }
        lastPick = null
        clearHover()
      }

      /**
       * Handle pointer movement: marquee growth, hover resolution, click slop.
       * @param {PointerEvent} event - pointermove.
       * @returns {void}
       */
      function onPointerMove(event) {
        if (!isActive()) return
        if (pointer !== null) {
          const dx = event.clientX - pointer.startX
          const dy = event.clientY - pointer.startY
          if (!pointer.moved && Math.hypot(dx, dy) > 4) pointer.moved = true
          if (pointer.boxMode) {
            if (pointer.moved) {
              const box = {
                x: Math.round(Math.min(pointer.startX, event.clientX)),
                y: Math.round(Math.min(pointer.startY, event.clientY)),
                width: Math.round(Math.abs(event.clientX - pointer.startX)),
                height: Math.round(Math.abs(event.clientY - pointer.startY))
              }
              if (snapshot().state.box === null) dispatch({ type: 'box', box })
              publish({ boxRect: box })
            }
            return
          }
        }
        if (passThroughEvent(event)) {
          clearHover()
          return
        }
        if (eventInsideOwn(event)) {
          // The pointer may sit on our own detail card: that keeps it open. Any
          // other own-surface hit (rail/popover) dismisses it via the no-hit path.
          updateMarkerHover({ x: event.clientX, y: event.clientY })
          clearHover()
          return
        }
        hoverPoint = { x: event.clientX, y: event.clientY }
        scheduleHover()
        updateMarkerHover(hoverPoint)
      }

      /**
       * Handle pointer release: click selection, modifier toggle, or marquee finish.
       * @param {PointerEvent} event - pointerup.
       * @returns {void}
       */
      function onPointerUp(event) {
        if (!isActive()) {
          pointer = null
          return
        }
        const gesture = pointer
        pointer = null
        if (gesture === null) return
        if (gesture.boxMode && gesture.moved) {
          if (!eventInsideOwn(event)) blockEvent(event)
          finishMarquee(event)
          return
        }
        if (eventInsideOwn(event)) return
        if (passThroughEvent(event)) {
          publish({ boxRect: null })
          dispatch({ type: 'box', box: null })
          return
        }
        if (!blockEvent(event)) return
        if (gesture.boxMode) {
          toggleSelectionAt(event)
          return
        }
        if (gesture.moved) return
        selectAt(event)
      }

      /**
       * One plain click: pick a candidate and open its popover.
       * @param {object} event - pointer event.
       * @returns {void}
       */
      function selectAt(event) {
        const element = annotationEventElement(event)
        if (element === null) return
        const chain = annotationCandidateChain(element)
        const levels = pickLevels(chain)
        if (levels.index < 0) return
        const ref = refFromPick(levels, null)
        lastPick = levels
        dispatch({ type: 'selectSingle', ref })
      }

      /**
       * One modifier click: toggle the clicked candidate in the selection.
       * @param {object} event - pointer event.
       * @returns {void}
       */
      function toggleSelectionAt(event) {
        const element = annotationEventElement(event)
        if (element === null) return
        const chain = annotationCandidateChain(element)
        const levels = pickLevels(chain)
        if (levels.index < 0) return
        const state = snapshot().state
        const existing = state.selection.find((item) => identityKeyOf(item) === identityKeyOf(refFromPick(levels, null)))
        const like = existing !== undefined ? { ...existing, note: state.note } : null
        const ref = refFromPick(levels, like)
        lastPick = levels
        dispatch({ type: 'toggleMulti', ref })
      }

      /**
       * Finish a marquee: collect intersecting candidates into the selection.
       * @param {object} event - pointer event that released the box.
       * @returns {void}
       */
      function finishMarquee(event) {
        const box = snapshot().boxRect
        publish({ boxRect: null })
        dispatch({ type: 'box', box: null })
        if (box === null || box.width < 4 || box.height < 4) return
        const elements = annotationBoxCandidateElements(box)
        const refs = []
        const seen = new Set()
        for (const element of elements) {
          const chain = annotationCandidateChain(element)
          const levels = pickLevels(chain)
          if (levels.index < 0) continue
          const ref = refFromPick(levels, null)
          const key = identityKeyOf(ref)
          if (seen.has(key)) continue
          seen.add(key)
            refs.push(ref)
        }
        if (refs.length === 0) return
        dispatch({ type: 'setMulti', refs })
      }

      /**
       * Handle a wheel event: the page keeps its native scrolling; only highlights
       * are refreshed.
       * @returns {void}
       */
      function onWheel() {
        if (isActive()) scheduleGeometry()
      }

      /**
       * Handle window scroll: refresh highlight geometry once per frame.
       * @returns {void}
       */
      function onScroll() {
        if (isActive()) scheduleGeometry()
      }

      /**
       * Handle window resize with a trailing debounce. Runs for the whole
       * plugin lifetime: the launcher must stay clamped inside the viewport even
       * when the mode is off (the rail/layout work only applies while active).
       * @returns {void}
       */
      function onInstalledResize() {
        if (resizeTimer !== null) window.clearTimeout(resizeTimer)
        resizeTimer = window.setTimeout(() => {
          resizeTimer = null
          const current = snapshot()
          const launcherPosition = clampLauncherForLayout(current.launcherPosition, annotationViewport(), isActive() ? current.railWidth : 0)
          if (launcherPosition.x !== current.launcherPosition.x || launcherPosition.y !== current.launcherPosition.y) {
            publish({ launcherPosition })
            persistLauncherPosition(launcherPosition)
          }
          if (!isActive()) return
          updateLayout()
          scheduleGeometry()
        }, 120)
      }

      /**
       * Track the pass-through modifier while active and consume Esc.
       * @param {KeyboardEvent} event - keydown.
       * @returns {void}
       */
      function onKeyDown(event) {
        if (!isActive()) return
        if (event.isComposing === true) return
        const wantPassThrough = modifierMatches(event, settings.passThroughModifier)
        if (snapshot().state.passThrough !== wantPassThrough) setPassThrough(wantPassThrough)
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          escapeOne()
          return
        }
        // All other keys keep their native behavior, including browser shortcuts.
      }

      /**
       * Refresh pass-through state when a modifier key is released.
       * @param {KeyboardEvent} event - keyup.
       * @returns {void}
       */
      function onKeyUp(event) {
        if (!isActive()) return
        const wantPassThrough = modifierMatches(event, settings.passThroughModifier)
        if (snapshot().state.passThrough !== wantPassThrough) setPassThrough(wantPassThrough)
      }

      /**
       * Reset transient modifier and gesture state when focus leaves the window.
       * @returns {void}
       */
      function onWindowBlur() {
        if (!isActive()) return
        if (snapshot().state.passThrough) setPassThrough(false)
        abortGestures()
        clearHover()
      }

      /**
       * Cancel an in-flight page gesture without selecting anything.
       * @returns {void}
       */
      function onPointerCancel() {
        pointer = null
        if (isActive() && (snapshot().state.box !== null || snapshot().boxRect !== null)) {
          publish({ boxRect: null })
          dispatch({ type: 'box', box: null })
        }
        clearHover()
      }

      /**
       * Drop transient state when the page is hidden.
       * @returns {void}
       */
      function onVisibilityChange() {
        if (document.visibilityState === 'hidden') {
          // D1: a hidden tab is the last reliable moment to persist records.
          flushAnnotationRecords()
          if (!isActive()) return
          if (snapshot().state.passThrough) setPassThrough(false)
          clearHover()
        }
      }

      /**
       * Step out one level: expanded note editor, then selection, then rail view,
       * then mode off.
       * @returns {void}
       */
      function escapeOne() {
        const current = snapshot()
        const state = current.state
        if (state.phase === 'off') return
        // A3/T6: the hover detail card is the first Esc rung (it was opened last).
        if (current.detailCard !== null) {
          closeDetailCard()
          return
        }
        if (current.noteEditor !== null) {
          closeNoteEditor()
          return
        }
        if (state.box !== null) {
          publish({ boxRect: null })
          dispatch({ type: 'box', box: null })
          return
        }
        if (state.editing) {
          dispatch({ type: 'endEdit' })
          return
        }
        if (state.selection.length > 0) {
          dispatch({ type: 'exitOne' })
          return
        }
        if (state.view !== 'status') {
          dispatch({ type: 'openView', view: 'status' })
          return
        }
        deactivate()
      }

      /**
       * Install the capture-phase window listeners exactly once.
       * @returns {void}
       */
      function installPageListeners() {
        if (pageListeners.length > 0) return
        /** @param {string} type - event type. @param {Function} handler - listener. @param {object} options - addEventListener options. @returns {void} */
        const listen = (type, handler, options) => {
          window.addEventListener(type, handler, options)
          pageListeners.push({ type, handler, options })
        }
        listen('pointerdown', onPointerDown, { capture: true, passive: false })
        listen('pointerup', onPointerUp, { capture: true, passive: false })
        listen('mousedown', blockEvent, { capture: true, passive: false })
        listen('pointerup', blockEvent, { capture: true, passive: false })
        listen('mouseup', blockEvent, { capture: true, passive: false })
        listen('click', blockEvent, { capture: true, passive: false })
        listen('auxclick', blockEvent, { capture: true, passive: false })
        listen('dblclick', blockEvent, { capture: true, passive: false })
        listen('contextmenu', blockEvent, { capture: true, passive: false })
        listen('dragstart', blockEvent, { capture: true, passive: false })
        listen('pointercancel', onPointerCancel, { capture: true, passive: true })
        listen('pointermove', onPointerMove, { capture: true, passive: true })
        listen('wheel', onWheel, { capture: true, passive: true })
        listen('scroll', onScroll, { capture: true, passive: true })
        listen('keydown', onKeyDown, { capture: true, passive: false })
        listen('keyup', onKeyUp, { capture: true, passive: true })
        listen('blur', onWindowBlur, { capture: false, passive: true })
        listen('visibilitychange', onVisibilityChange, { capture: false, passive: true })
      }

      /** Remove every installed window listener. @returns {void} */
      function uninstallPageListeners() {
        for (const entry of pageListeners) window.removeEventListener(entry.type, entry.handler, entry.options)
        pageListeners.length = 0
        pointer = null
        hoverPoint = null
      }

      /** Cancel every pending frame and timer. @returns {void} */
      function clearTimers() {
        if (hoverFrame !== null) window.cancelAnimationFrame(hoverFrame)
        if (geometryFrame !== null) window.cancelAnimationFrame(geometryFrame)
        if (hoverRecomputeTimer !== null) window.clearTimeout(hoverRecomputeTimer)
        hoverFrame = null
        geometryFrame = null
        hoverRecomputeTimer = null
        if (resizeTimer !== null) window.clearTimeout(resizeTimer)
        if (frameObserverTimer !== null) window.clearTimeout(frameObserverTimer)
        if (feedbackTimer !== null) window.clearTimeout(feedbackTimer)
        if (flashTimer !== null) window.clearTimeout(flashTimer)
        if (frameRestoreTimer !== null) window.clearTimeout(frameRestoreTimer)
        if (popoverMeasureFrame !== null) window.cancelAnimationFrame(popoverMeasureFrame)
        popoverMeasureFrame = null
        if (persistTimer !== null) window.clearTimeout(persistTimer)
        persistTimer = null
        if (markerHoverTimer !== null) window.clearTimeout(markerHoverTimer)
        if (detailCloseTimer !== null) window.clearTimeout(detailCloseTimer)
        if (undoExpireTimer !== null) window.clearTimeout(undoExpireTimer)
        if (detailMeasureFrame !== null) window.cancelAnimationFrame(detailMeasureFrame)
        markerHoverTimer = null
        detailCloseTimer = null
        undoExpireTimer = null
        detailMeasureFrame = null
        resizeTimer = null
        frameObserverTimer = null
        feedbackTimer = null
        flashTimer = null
        frameRestoreTimer = null
      }

      /** @returns {boolean} whether the host asks for reduced motion. */
      function prefersReducedMotion() {
        try {
          return typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
        } catch {
          return false
        }
      }

      /**
       * Remember the frame's own inline padding-right and --psa-rail-width (value
       * and priority) before the mode writes them, so exit restores the exact
       * previous state instead of blanket-clearing host inline styles (F12).
       * @param {HTMLElement} frame - layout frame.
       * @returns {void}
       */
      function captureFrameInline(frame) {
        if (frameSnapshot !== null && frameSnapshot.frame === frame) return
        if (frameSnapshot !== null) {
          const previousFrame = frameSnapshot.frame
          restoreFrameInline()
          if (previousFrame !== null && previousFrame !== undefined && typeof previousFrame.removeAttribute === 'function') {
            previousFrame.removeAttribute('data-psa-frame')
          }
        }
        frameSnapshot = {
          frame,
          paddingRight: {
            value: frame.style.getPropertyValue('padding-right'),
            priority: frame.style.getPropertyPriority('padding-right')
          },
          railWidth: {
            value: frame.style.getPropertyValue('--psa-rail-width'),
            priority: frame.style.getPropertyPriority('--psa-rail-width')
          }
        }
      }

      /**
       * Restore one inline property to exactly its captured value and priority.
       * @param {HTMLElement} frame - layout frame.
       * @param {string} name - CSS property name.
       * @param {{ value: string, priority: string }} saved - captured property state.
       * @returns {void}
       */
      function restoreInlineProperty(frame, name, saved) {
        if (saved.value === '' && saved.priority === '') frame.style.removeProperty(name)
        else frame.style.setProperty(name, saved.value, saved.priority)
      }

      /**
       * Restore the captured inline frame styles. Never a blanket clear.
       * @returns {void}
       */
      function restoreFrameInline() {
        if (frameSnapshot === null) return
        const frame = frameSnapshot.frame
        if (frame !== null && frame !== undefined && typeof frame.style === 'object') {
          restoreInlineProperty(frame, 'padding-right', frameSnapshot.paddingRight)
          restoreInlineProperty(frame, '--psa-rail-width', frameSnapshot.railWidth)
        }
        frameSnapshot = null
      }

      /**
       * Remove every layout marker this mode added, restoring the frame exactly.
       *
       * Exit restores the captured inline padding while the transition rule is
       * still present, then drops the frame marker after the reverse transition
       * (immediately under reduced motion, and always on disposal/rollback).
       * @param {{ immediate?: boolean }} [options] - force the marker removal now.
       * @returns {void}
       */
      function restoreAnnotationLayout(options) {
        const settingsForRestore = options !== null && typeof options === 'object' ? options : {}
        const immediate = settingsForRestore.immediate === true || prefersReducedMotion()
        const frame = annotationLayoutFrame()
        const snapshotFrame = frameSnapshot === null ? null : frameSnapshot.frame
        restorePaintLayer()
        document.documentElement.removeAttribute('data-psa-active')
        document.documentElement.removeAttribute('data-psa-passthrough')
        if (frameRestoreTimer !== null) {
          window.clearTimeout(frameRestoreTimer)
          frameRestoreTimer = null
        }
        if (snapshotFrame !== null && snapshotFrame !== undefined) restoreFrameInline()
        const markerFrame = snapshotFrame !== null && snapshotFrame !== undefined ? snapshotFrame : frame
        if (markerFrame === null || markerFrame === undefined) return
        if (immediate) {
          markerFrame.removeAttribute('data-psa-frame')
          if (frame !== null && frame !== markerFrame) frame.removeAttribute('data-psa-frame')
          return
        }
        // Keep the marker while the restored padding animates back, then remove it.
        frameRestoreTimer = window.setTimeout(() => {
          frameRestoreTimer = null
          if (markerFrame.isConnected !== false) markerFrame.removeAttribute('data-psa-frame')
          const current = annotationLayoutFrame()
          if (current !== null && current !== markerFrame) current.removeAttribute('data-psa-frame')
        }, 180)
      }

      /**
       * Turn annotation mode on: markers, layout, listeners.
       *
       * Activation touches page-level state (root attribute, frame padding, window
       * listeners). If any step throws, every one of those is rolled back before the
       * error leaves this function, so the page can never keep blockers or padding
       * from a half-applied mode.
       * @returns {void}
       */
      function activate() {
        if (isActive()) return
        document.documentElement.setAttribute('data-psa-active', 'true')
        try {
          installPageListeners()
          // F3 needs the body observer even before any record resolves, because a
          // floating card can appear under a stationary pointer with no selection.
          ensureDomObserver()
          dispatch({ type: 'activate' })
          updateLayout()
          // F1: raise the paint layer above native hover cards for the whole
          // active window, after the frame works so a failed activation never
          // leaves the shell chrome raised.
          capturePaintLayer()
          scheduleGeometry()
        } catch (error) {
          try {
            dispatch({ type: 'deactivate' })
          } catch {
            // The rollback below does not depend on the reducer.
          }
          uninstallPageListeners()
          disconnectFrameObserver()
          clearResolvedNodeCache()
          clearTimers()
          restoreAnnotationLayout({ immediate: true })
          announceAnnotationState(false)
          throw error
        }
        // F4: tell the dynamic-workspaces feature the mode is on (D3 split).
        announceAnnotationState(true)
        feedback(t('feedback.modeOn'))
      }

      /** Turn annotation mode off and restore the exact original layout. @returns {void} */
      function deactivate() {
        // F4: announce before teardown so the dependent hover card cannot outlive
        // the mode; a defensive call while already off is harmless.
        announceAnnotationState(false)
        if (!isActive()) {
          // Defensive cleanup: no state says "active", but an interrupted activation or a
          // foreign removal could still have page-level leftovers. None of these calls
          // depend on the reducer, so they are always safe. The resolved-node cache and
          // its body observer are cleared here too, so this defensive path cannot leave
          // them behind (NIT-6).
          uninstallPageListeners()
          disconnectFrameObserver()
          clearResolvedNodeCache()
          restoreAnnotationLayout()
          flushAnnotationRecords()
          return
        }
        try {
          dispatch({ type: 'deactivate' })
        } finally {
          // Layout restoration and listener removal come first and unconditionally; the
          // UI-state refresh below is best effort.
          abortGestures()
          clearResolvedNodeCache()
          if (hoverRecomputeTimer !== null) {
            window.clearTimeout(hoverRecomputeTimer)
            hoverRecomputeTimer = null
          }
          lastPick = null
          cancelMarkerHoverTimer()
          cancelDetailClose()
          closeDetailCard()
          publish({ markRects: [], markerHoverId: null, markUndo: null })
          uninstallPageListeners()
          disconnectFrameObserver()
          restoreAnnotationLayout()
          flushAnnotationRecords()
          if (feedbackTimer !== null) window.clearTimeout(feedbackTimer)
          feedbackTimer = null
          try {
            clearHover()
          } catch {
            // A throwing subscriber must not keep page markers alive.
          }
          try {
            publish({
              boxRect: null,
              popoverPosition: null,
              popoverPinned: false,
              hoverRect: null,
              noteEditor: null,
              launcherPosition: clampLauncherPosition(snapshot().launcherPosition, annotationViewport(), ANNOTATION_LAUNCHER_SIZE)
            })
            dispatch({ type: 'feedback', feedback: null })
          } catch {
            // Snapshot refresh is cosmetic once the layout is restored.
          }
        }
      }

      /** Toggle annotation mode. @returns {void} */
      function toggleMode() {
        if (isActive()) deactivate()
        else activate()
      }

      /**
       * Start dragging the launcher; a moved drag never toggles the mode.
       * @param {PointerEvent} event - pointerdown on the launcher.
       * @returns {void}
       */
      function beginLauncherDrag(event) {
        if (event.button !== 0) return
        event.preventDefault()
        const start = snapshot().launcherPosition
        const originX = event.clientX
        const originY = event.clientY
        let moved = false
        suppressLauncherClickUntil = 0
        /** @param {PointerEvent} moveEvent - pointermove. @returns {void} */
        const onMove = (moveEvent) => {
          const dx = moveEvent.clientX - originX
          const dy = moveEvent.clientY - originY
          if (!moved && Math.hypot(dx, dy) < 4) return
          moved = true
          publish({ launcherDragging: true })
          publish({
            launcherPosition: clampLauncherForLayout(
              { x: start.x + dx, y: start.y + dy },
              annotationViewport(),
              isActive() ? snapshot().railWidth : 0
            )
          })
        }
        /**
         * Settle the drag exactly once. An aborted drag (teardown, pass-through)
         * never persists a position and swallows the click that follows it.
         * @param {boolean} aborted - whether a teardown is aborting the gesture.
         * @returns {void}
         */
        const settle = (aborted) => {
          if (settled === true) return
          settled = true
          unregister()
          window.removeEventListener('pointermove', onMove, true)
          window.removeEventListener('pointerup', onUp, true)
          window.removeEventListener('pointercancel', onCancel, true)
          publish({ launcherDragging: false })
          if (aborted) {
            suppressLauncherClickUntil = Date.now() + 600
            return
          }
          if (!moved) return
          suppressLauncherClickUntil = Date.now() + 600
          persistLauncherPosition(snapshot().launcherPosition)
        }
        const onUp = () => settle(false)
        const onCancel = () => settle(true)
        let settled = false
        const unregister = trackGesture(settle)
        window.addEventListener('pointermove', onMove, true)
        window.addEventListener('pointerup', onUp, true)
        window.addEventListener('pointercancel', onCancel, true)
      }

      /**
       * Consume the click that would otherwise toggle the mode after a drag.
       * @returns {boolean} whether the click must be ignored.
       */
      function consumeLauncherClickSuppressed() {
        if (Date.now() > suppressLauncherClickUntil) return false
        suppressLauncherClickUntil = 0
        return true
      }

      /**
       * Start dragging the popover by its header.
       * @param {PointerEvent} event - pointerdown on the popover header.
       * @returns {void}
       */
      function beginPopoverDrag(event) {
        if (event.button !== 0) return
        const start = snapshot().popoverPosition
        if (start === null) return
        event.preventDefault()
        measurePopover()
        const originX = event.clientX
        const originY = event.clientY
        /** @param {PointerEvent} moveEvent - pointermove. @returns {void} */
        const onMove = (moveEvent) => {
          const size = annotationViewport()
          const railWidth = snapshot().railWidth
          const maxX = Math.max(8, size.width - railWidth - popoverMeasuredSize.width - 8)
          const maxY = Math.max(8, size.height - popoverMeasuredSize.height - 8)
          const x = Math.min(Math.max(start.x + moveEvent.clientX - originX, 8), maxX)
          const y = Math.min(Math.max(start.y + moveEvent.clientY - originY, 8), maxY)
          publish({ popoverPosition: { x: Math.round(x), y: Math.round(y) }, popoverPinned: true })
        }
        /** @param {boolean} aborted - whether a teardown is aborting the gesture. @returns {void} */
        const settle = (aborted) => {
          if (settled === true) return
          settled = true
          unregister()
          window.removeEventListener('pointermove', onMove, true)
          window.removeEventListener('pointerup', onUp, true)
          window.removeEventListener('pointercancel', onCancel, true)
          if (aborted) return
        }
        const onUp = () => settle(false)
        const onCancel = () => settle(true)
        let settled = false
        const unregister = trackGesture(settle)
        window.addEventListener('pointermove', onMove, true)
        window.addEventListener('pointerup', onUp, true)
        window.addEventListener('pointercancel', onCancel, true)
      }

      /** Toggle the collapsed rail strip. @returns {void} */
      function toggleRailCollapsed() {
        const next = !snapshot().railCollapsed
        publish({ railCollapsed: next })
        annotationWriteStorage(RAIL_STORAGE_KEY, next ? 'true' : 'false')
        updateLayout()
      }

      /** Show one rail view in place. @param {'status' | 'collection' | 'settings'} view - requested view. @returns {void} */
      function openView(view) {
        dispatch({ type: 'openView', view })
      }

      /** Return the rail to its status view. @returns {void} */
      function backView() {
        dispatch({ type: 'openView', view: 'status' })
      }

      /** Clear the current selection and close the popover. @returns {void} */
      function clearSelection() {
        dispatch({ type: 'selectSingle', ref: null })
      }

      /**
       * Update the popover's note draft.
       * @param {string} text - note text.
       * @returns {void}
       */
      function updateNote(text) {
        dispatch({ type: 'setNote', text: typeof text === 'string' ? text : '' })
      }

      /**
       * Mark the popover note as being edited. The first Esc then ends editing and
       * keeps both the note and the popover (F6).
       * @returns {void}
       */
      function beginEdit() {
        if (!isActive()) return
        dispatch({ type: 'beginEdit' })
      }

      /**
       * End note editing without clearing the note or the selection.
       * @returns {void}
       */
      function endEdit() {
        if (!isActive()) return
        dispatch({ type: 'endEdit' })
      }

      /**
       * Commit the current selection into the collection (A3/T5/T7).
       *
       * This is the popover's primary action: it adds or updates the requirement,
       * then auto-dismisses the popover + selection (spec §4.4) while the page marks
       * stay visible. Multi-select keeps the Phase 1 batch wording but shares the
       * same commit boundary. The 100-record cap is checked before any record is
       * written (D15: explicit refusal, never a partial commit).
       * @param {{ feedback?: boolean }} [options] - `feedback: false` suppresses the toast (quick reference).
       * @returns {boolean} whether the selection was committed.
       */
      function commitSelection(options) {
        const settingsForCommit = options !== null && typeof options === 'object' ? options : {}
        const current = snapshot()
        const state = current.state
        if (state.selection.length === 0) return false
        const sessionId = annotationBridge.sessionId ?? state.sessionId ?? null
        const identityMatches = (item, ref) => identityKeyOf(item) === identityKeyOf(ref)
          && (item?.session?.sessionId ?? null) === (ref.session?.sessionId ?? sessionId)
        let additions = 0
        for (const ref of state.selection) {
          if (!state.collection.some((item) => identityMatches(item, ref))) additions += 1
        }
        if (state.collection.length + additions > ANNOTATION_RECORD_LIMIT) {
          feedback(t('collection.maxReached', { limit: ANNOTATION_RECORD_LIMIT }), 'error')
          return false
        }
        let updated = false
        for (const ref of state.selection) {
          const existing = snapshot().state.collection.some((item) => identityMatches(item, ref))
          if (existing) updated = true
          const entry = {
            ...ref,
            // Preserve the full captured identity (cwd/workspaceLabel) on every
            // commit path; dropping them silently would break D6 across a reload.
            session: {
              ...(ref.session !== null && typeof ref.session === 'object' ? ref.session : {}),
              sessionId: ref.session?.sessionId ?? sessionId
            },
            note: state.selection.length === 1 ? state.note : (ref.note ?? '')
          }
          dispatch({ type: 'annotationCommit', record: entry, now: Date.now() })
        }
        // Auto-dismiss: close the popover/card, clear the selection, keep the marks
        // that the commit just refreshed (spec §4.4).
        closeDetailCard({ keepMarker: true })
        dispatch({ type: 'selectSingle', ref: null })
        if (settingsForCommit.feedback !== false) {
          if (state.selection.length > 1) feedback(updated ? t('feedback.updated') : t('feedback.added'))
          else if (updated) feedback(t('feedback.markUpdated'))
          else feedback(t('feedback.marked', { count: snapshot().state.collection.length }))
        }
        return true
      }

      /**
       * Add the current selection to the collection (legacy name used by the rail
       * multi-select action; same commit boundary as the popover primary action).
       * @returns {void}
       */
      function addSelectionToCollection() {
        commitSelection()
      }

      /**
       * Insert one text block into the current Composer without sending it.
       * @param {string} text - text to insert.
       * @returns {boolean} whether insertion succeeded.
       */
      function insertIntoComposer(text) {
        const actions = annotationBridge.inputActions
        if (actions === null || typeof actions !== 'object'
          || typeof actions.captureInsertion !== 'function' || typeof actions.insertText !== 'function') {
          feedback(t('feedback.noComposer'), 'error')
          return false
        }
        try {
          const span = actions.captureInsertion()
          if (actions.insertText(text, span) !== true) {
            feedback(t('feedback.insertFailed'), 'error')
            return false
          }
        } catch {
          feedback(t('feedback.insertFailed'), 'error')
          return false
        }
        annotationFocusComposer()
        feedback(t('feedback.inserted'))
        return true
      }

      /**
       * Attach the composer services resolved by the dynamic T9 inject. Kept
       * replaceable and nullable: an embedding without the chat UI simply never
       * calls this, and every insertion path falls back to plain text (D9).
       * @param {{ conversation?: object, inputTriggers?: object }} services - service faces.
       * @returns {void}
       */
      function attachComposerServices(services) {
        const source = services !== null && typeof services === 'object' ? services : {}
        composerConversation = source.conversation !== undefined && source.conversation !== null ? source.conversation : null
        composerInputTriggers = source.inputTriggers !== undefined && source.inputTriggers !== null ? source.inputTriggers : null
      }

      /**
       * Resolve the session-scoped input facade for one Session.
       * @param {string | null} sessionId - Session identity.
       * @returns {object | null} session input facade, or null when unavailable.
       */
      function composerInputFor(sessionId) {
        if (composerConversation === null || typeof sessionId !== 'string' || sessionId.length === 0) return null
        const sessions = ctx !== null && typeof ctx === 'object' ? ctx.sessions : null
        if (sessions === null || typeof sessions !== 'object' || typeof sessions.scope !== 'function') return null
        try {
          const actx = sessions.scope(sessionId)
          if (actx === undefined || actx === null) return null
          const inputRegistry = composerConversation.input
          if (inputRegistry === null || typeof inputRegistry !== 'object' || typeof inputRegistry.for !== 'function') return null
          return inputRegistry.for(actx)
        } catch {
          return null
        }
      }

      /**
       * Insert one annotation reference as a native composer chip, or fall back to
       * the Phase 1 plain-text block with an explanatory toast (A3/T9/D9).
       * @param {Array<object>} records - record(s) to reference (one for single, N for the ONE group chip).
       * @param {{ batch?: boolean, fallbackText: string }} options - batch flag and fallback text.
       * @returns {boolean} whether any insertion applied.
       */
      function insertReferenceChip(records, options) {
        const list = Array.isArray(records) ? records : []
        const settingsForInsert = options !== null && typeof options === 'object' ? options : {}
        if (list.length === 0) return false
        const batch = settingsForInsert.batch === true
        const fallbackText = typeof settingsForInsert.fallbackText === 'string' ? settingsForInsert.fallbackText : ''
        const sessionId = annotationBridge.sessionId ?? snapshot().state.sessionId
        const actions = annotationBridge.inputActions
        if (sessionId !== null && actions !== null && typeof actions === 'object' && typeof actions.captureInsertion === 'function') {
          let span = null
          try {
            span = actions.captureInsertion()
          } catch {
            span = null
          }
          const input = span === null ? null : composerInputFor(sessionId)
          if (input !== null && typeof input.insertReference === 'function') {
            try {
              const ref = batch
                ? annotationChipRefBatch(list, t('chip.batchLabel', { count: list.length }))
                : annotationChipRefOf(list[0])
              if (ref.ref.length > 0 && input.insertReference(ref, span) === true) {
                feedback(t(batch ? 'feedback.chipBatchInserted' : 'feedback.chipInserted'))
                annotationFocusComposer()
                return true
              }
            } catch {
              // Fall through to the plain-text path with its explanatory toast.
            }
          }
        }
        const inserted = fallbackText.length > 0 ? insertIntoComposer(fallbackText) : false
        if (inserted) feedback(t('feedback.chipFallback'))
        return inserted
      }

      /**
       * The record a chip candidate names, for the `@` pick path.
       * @param {string} refId - record id from the candidate value.
       * @returns {object | null} record, or null when it was deleted meanwhile.
       */
      function chipRecord(refId) {
        return snapshot().state.collection.find((entry) => entry !== null && typeof entry === 'object' && entry.id === refId) ?? null
      }

      /**
       * `@` group candidates: current-Session records only, ≤20, insertion order.
       * @param {string | null} sessionId - Session owning the composer.
       * @returns {Array<object>} trigger candidates.
       */
      function chipCandidates(sessionId) {
        return annotationChipCandidates(
          snapshot().state.collection,
          sessionId,
          ANNOTATION_CHIP_CANDIDATE_LIMIT,
          t('chip.candidateLabel')
        )
      }

      /**
       * Clipboard projection of one annotation chip.
       * @param {unknown} ref - chip ref.
       * @returns {string} clipboard text.
       */
      function chipClipboardText(ref) {
        const parsed = parseAnnotationChipRef(ref)
        if (parsed === null) return ''
        if (parsed.kind === 'single') {
          const record = chipRecord(parsed.id)
          return record === null ? '' : annotationChipRefOf(record).clipboardText
        }
        return annotationChipRefBatch([], t('chip.batchLabel', { count: parsed.ids.length })).clipboardText
      }

      /**
       * Model serialization of one annotation chip (the submit pipeline calls this
       * through the source codec). A missing single record throws so the shell
       * blocks the send instead of silently downgrading (D9); a batch chip skips
       * deleted members and states the count honestly.
       * @param {unknown} ref - chip ref.
       * @returns {string} model text.
       */
      function serializeChip(ref) {
        const result = serializeAnnotationChip(ref, snapshot().state.collection, annotationInsertLabels(t), (record) => statusOf(record))
        if (result.text === null) throw new Error(t('feedback.chipMissing'))
        return result.text
      }

      /**
       * Chip click handler: single → the record's detail card, batch → the rail
       * collection view (the group has no single element to outline).
       * @param {unknown} ref - chip ref.
       * @returns {boolean} whether the preview was accepted.
       */
      function openChipReference(ref) {
        const parsed = parseAnnotationChipRef(ref)
        if (parsed === null) return false
        if (parsed.kind === 'batch') {
          if (!isActive()) return false
          dispatch({ type: 'openView', view: 'collection' })
          return true
        }
        return openDetailCardById(parsed.id)
      }

      /**
       * Insert the current selection as one quick reference.
       *
       * The annotation is committed first (if it is new), then a native reference
       * chip is inserted; an unavailable chip path falls back to the Phase 1 plain
       * text with `feedback.chipFallback` (D9). The popover auto-closes first.
       * @returns {void}
       */
      function quickReference() {
        const state = snapshot().state
        const ref = state.selection[0]
        if (ref === undefined) return
        const note = state.note
        const fallbackText = serializeQuickReference({ ...ref, note, status: statusOf(ref) }, note, annotationInsertLabels(t))
        const committed = commitSelection({ feedback: false })
        if (!committed) return
        const sessionId = annotationBridge.sessionId ?? state.sessionId ?? null
        const record = snapshot().state.collection.find((entry) => identityKeyOf(entry) === identityKeyOf(ref)
          && (entry?.session?.sessionId ?? null) === (ref.session?.sessionId ?? sessionId))
        if (record === undefined) {
          insertIntoComposer(fallbackText)
          return
        }
        insertReferenceChip([record], { fallbackText })
      }

      /**
       * Insert one rail row's reference as a native single chip (with fallback).
       * @param {string} refId - record id.
       * @returns {void}
       */
      function insertEntryChip(refId) {
        const record = chipRecord(refId)
        if (record === null) return
        const fallbackText = serializeQuickReference({ ...record, status: statusOf(record) }, record.note ?? '', annotationInsertLabels(t))
        insertReferenceChip([record], { fallbackText })
      }

      /**
       * Insert the selected current-Session annotations as ONE group chip (D2);
       * other-Session records can never be part of a batch (A3/T8). Auto-dismiss
       * follows §4.4: popover/card closed, selection cleared, collection view kept.
       * @returns {void}
       */
      function insertBatch() {
        const state = snapshot().state
        if (state.collection.length === 0) return
        const sessionId = annotationBridge.sessionId ?? state.sessionId
        if (sessionId === null || sessionId === undefined) {
          feedback(t('feedback.noComposer'), 'error')
          return
        }
        const selected = annotationSelectedEntries(state.collection, sessionId)
        if (selected.length === 0) {
          feedback(t('feedback.batchEmpty'), 'error')
          return
        }
        const split = batchScopeSplit(state.collection.map((entry) => ({ ref: entry, note: entry.note ?? '' })), sessionId)
        const fallbackItems = selected.map((record) => ({ ref: { ...record, status: statusOf(record) }, note: record.note ?? '' }))
        const fallbackText = serializeBatchRequest(fallbackItems, { ...annotationInsertLabels(t), skippedCount: split.other.length })
        closeDetailCard()
        if (snapshot().state.selection.length > 0) dispatch({ type: 'selectSingle', ref: null })
        insertReferenceChip(selected, { batch: true, fallbackText })
      }

      /**
       * Toggle one record's batch inclusion. Other-Session records are forced out
       * of every selection (the row is disabled in the rail).
       * @param {string} refId - record id.
       * @param {boolean} included - requested flag.
       * @returns {void}
       */
      function setEntryIncluded(refId, included) {
        const record = chipRecord(refId)
        if (record === null) return
        const flag = collectionScopeOf(record) === 'current' && included === true
        if (record.included === flag) return
        dispatch({ type: 'annotationInclude', refId, included: flag })
      }

      /**
       * Select every current-Session record for the batch (or clear the selection).
       * @param {boolean} included - target flag.
       * @returns {void}
       */
      function setAllCurrentIncluded(included) {
        const current = snapshot()
        const sessionId = currentSessionId()
        const changes = []
        for (const entry of current.state.collection) {
          const isCurrent = collectionScopeOf(entry) === 'current'
          const flag = included === true && isCurrent
          if (entry.included !== flag) changes.push({ refId: entry.id, included: flag })
        }
        if (changes.length === 0) return
        dispatch({ type: 'annotationIncludes', changes })
        const sessionIdForSelection = sessionId
        if (sessionIdForSelection === null && included === true) feedback(t('feedback.noComposer'), 'error')
      }

      /**
       * Move one rail row one slot up or down (A3/T8; order stays contiguous).
       * @param {string} refId - record id.
       * @param {number} delta - -1 up, +1 down.
       * @returns {void}
       */
      function moveEntry(refId, delta) {
        dispatch({ type: 'annotationMove', refId, delta: delta === -1 ? -1 : 1 })
      }

      /**
       * Delete every selected annotation as one undo step (A3/T8/D5).
       * @returns {void}
       */
      function removeSelected() {
        const current = snapshot()
        const ids = annotationSelectedEntries(current.state.collection, currentSessionId()).map((entry) => entry.id)
        if (ids.length === 0) return
        const removal = annotationUndoRemoveMany(current.state.collection, ids, Date.now())
        if (removal.undo === null) return
        dispatch({ type: 'annotationRemoveMany', refIds: ids })
        closeDetailCard()
        if (snapshot().noteEditor !== null) publish({ noteEditor: null })
        setMarkUndo(removal.undo)
      }

      /**
       * Rail preview: scroll to the element, flash it, then open its detail card.
       * Other-Session rows keep the existing refusal message.
       * @param {string} refId - record id.
       * @returns {void}
       */
      function previewEntry(refId) {
        const record = chipRecord(refId)
        if (record === null) return
        if (collectionScopeOf(record) !== 'current') {
          feedback(t('feedback.relocateOtherSession'), 'error')
          return
        }
        relocateEntry(refId)
        openDetailCardById(refId)
      }

      /**
       * Move one chain position for the level up/down controls.
       * @param {number} delta - +1 for a parent, -1 for a child.
       * @returns {void}
       */
      function shiftChain(delta) {
        const state = snapshot().state
        const ref = state.selection[0]
        if (ref === undefined || lastPick === null) return
        // `delta` is the Parent/Child direction in the old chain model (+1 parent);
        // a floating pick reverses it because its entry 0 is the whole card.
        const nextIndex = lastPick.index + delta * lastPick.parentStep
        if (nextIndex < 0 || nextIndex >= lastPick.entries.length) return
        lastPick = { ...lastPick, index: nextIndex }
        const nextRef = refFromPick(lastPick, { ...ref, note: state.note })
        dispatch({ type: 'selectSingle', ref: nextRef })
      }

      /**
       * Apply one settings select change, resolving modifier conflicts visibly.
       * @param {'passThroughModifier' | 'multiModifier'} field - changed field.
       * @param {string} value - requested modifier id.
       * @returns {void}
       */
      function setModifier(field, value) {
        const result = resolveModifierChange(settings, field, value)
        const changed = result.settings.passThroughModifier !== settings.passThroughModifier
          || result.settings.multiModifier !== settings.multiModifier
        if (!changed) return
        settings = result.settings
        annotationWriteStorage(SETTINGS_STORAGE_KEY, serializeSettings(settings))
        publish({ settings: { ...settings } })
        if (result.adjustedField !== undefined) {
          const fieldLabel = result.adjustedField === 'passThroughModifier' ? t('settings.field.passThrough') : t('settings.field.multi')
          const movedValue = t(`modifier.${settings[result.adjustedField]}`)
          feedback(t('settings.conflict', { field: fieldLabel, value: movedValue }))
        } else {
          feedback(t('settings.saved'))
        }
      }

      /**
       * Update one collection entry note live.
       * @param {string} refId - ref id.
       * @param {string} note - note text.
       * @returns {void}
       */
      function updateCollectionNote(refId, note) {
        dispatch({ type: 'annotationUpdateNote', refId, note: typeof note === 'string' ? note : '', now: Date.now() })
      }

      /**
       * Publish the single-slot undo payload and (re)arm its 5 s expiry (D5).
       * @param {object | null} undo - payload from `annotationUndoRemove`.
       * @returns {void}
       */
      function setMarkUndo(undo) {
        if (undoExpireTimer !== null) window.clearTimeout(undoExpireTimer)
        undoExpireTimer = null
        publish({ markUndo: undo })
        if (undo !== null) {
          undoExpireTimer = window.setTimeout(() => {
            undoExpireTimer = null
            publish({ markUndo: null })
          }, ANNOTATION_UNDO_WINDOW_MS)
        }
      }

      /**
       * Remove one collection entry and show its 5 s undo toast (A3/T7/D4/D5).
       * The newest removal replaces any previous undo slot.
       * @param {string} refId - ref id.
       * @returns {void}
       */
      function removeEntry(refId) {
        const current = snapshot()
        if (!current.state.collection.some((entry) => entry.id === refId)) return
        const removal = annotationUndoRemove(current.state.collection, refId, 'single', Date.now())
        dispatch({ type: 'annotationRemove', refId })
        if (snapshot().noteEditor !== null && snapshot().noteEditor.refId === refId) publish({ noteEditor: null })
        if (snapshot().detailCard !== null && snapshot().detailCard.refId === refId) closeDetailCard()
        setMarkUndo(removal.undo)
      }

      /** Remove the popover selection's existing collection record (danger X). @returns {void} */
      function removeSelection() {
        const state = snapshot().state
        const ref = state.selection[0]
        if (ref === undefined) return
        const record = snapshot().state.collection.find((entry) => identityKeyOf(entry) === identityKeyOf(ref)
          && (entry?.session?.sessionId ?? null) === (ref.session?.sessionId ?? null))
        if (record === undefined) return
        removeEntry(record.id)
        dispatch({ type: 'selectSingle', ref: null })
      }

      /** Restore the single-slot undo payload (A3/T7/D5). @returns {void} */
      function undoMark() {
        const current = snapshot()
        if (current.markUndo === null) return
        const undo = current.markUndo
        dispatch({ type: 'annotationUndo', undo })
        setMarkUndo(null)
        feedback(t('feedback.restored'))
      }

      /** Clear the collection, keeping its records in the same 5 s undo slot. @returns {void} */
      function clearCollection() {
        const current = snapshot()
        if (current.state.collection.length === 0) return
        const removal = annotationUndoRemove(current.state.collection, null, 'clear', Date.now())
        dispatch({ type: 'collectionClear' })
        closeDetailCard()
        if (snapshot().noteEditor !== null) publish({ noteEditor: null })
        setMarkUndo(removal.undo)
      }

      /**
       * Open the detail card for a collection record by id (rail preview seam for
       * Phase 2-B; the page path opens it through pointer hover).
       * @param {string} refId - record id.
       * @returns {boolean} whether the card opened.
       */
      function openDetailCardById(refId) {
        const current = snapshot()
        const mark = current.markRects.find((item) => item.id === refId)
        if (mark === undefined) return false
        openDetailCard(mark)
        return snapshot().detailCard !== null
      }

      /** Enter the detail card's edit mode (requirement textarea). @returns {void} */
      function beginDetailEdit() {
        const current = snapshot()
        if (current.detailCard === null) return
        if (current.detailCard.mode === 'edit') return
        publish({ detailCard: { ...current.detailCard, mode: 'edit' } })
      }

      /** Leave the detail card's edit mode without saving. @returns {void} */
      function cancelDetailEdit() {
        const current = snapshot()
        if (current.detailCard === null || current.detailCard.mode !== 'edit') return
        publish({ detailCard: { ...current.detailCard, mode: 'view' } })
      }

      /**
       * Save one requirement from the detail card, bumping `updatedAt` (D4).
       * @param {string} refId - record id.
       * @param {string} note - requirement text.
       * @returns {void}
       */
      function saveDetailNote(refId, note) {
        if (typeof refId !== 'string' || refId.length === 0) return
        dispatch({ type: 'annotationUpdateNote', refId, note: normalizeUserNote(note), now: Date.now() })
        const current = snapshot()
        if (current.detailCard !== null && current.detailCard.refId === refId) {
          publish({ detailCard: { ...current.detailCard, mode: 'view' } })
        }
        feedback(t('feedback.markUpdated'))
      }

      /**
       * Insert one collection record as a quick reference (Phase 1 plain text) from
       * the detail card, then auto-dismiss the card (spec §4.4).
       * @param {string} refId - record id.
       * @returns {void}
       */
      function quickReferenceById(refId) {
        const record = snapshot().state.collection.find((entry) => entry.id === refId)
        if (record === undefined) return
        const fallbackText = serializeQuickReference({ ...record, status: statusOf(record) }, record.note ?? '', annotationInsertLabels(t))
        closeDetailCard()
        insertReferenceChip([record], { fallbackText })
      }

      /**
       * Delete one record from the detail card (same undo toast as every other X).
       * @param {string} refId - record id.
       * @returns {void}
       */
      function deleteDetail(refId) {
        removeEntry(refId)
      }

      /**
       * Scroll one collection entry's target into view and flash it.
       * @param {string} refId - ref id.
       * @returns {void}
       */
      function relocateEntry(refId) {
        const ref = snapshot().state.collection.find((entry) => entry.id === refId)
        if (ref === undefined) return
        if (collectionScopeOf(ref) !== 'current') {
          // Another Session's entry is not part of the current DOM; resolving it
          // against this page could jump into an unrelated lookalike (F9).
          feedback(t('feedback.relocateOtherSession'), 'error')
          return
        }
        const status = statusOf(ref)
        const node = status === 'resolved' ? liveNode(ref) : null
        if (node === null) {
          feedback(t('feedback.relocateFailed', { status: t(`popover.status.${status}`) }), 'error')
          return
        }
        try {
          node.scrollIntoView({ block: 'center', behavior: 'smooth' })
        } catch {
          node.scrollIntoView()
        }
        if (flashTimer !== null) window.clearTimeout(flashTimer)
        publish({ flashRefId: refId, flashRect: annotationRectOf(node) })
        flashTimer = window.setTimeout(() => {
          flashTimer = null
          publish({ flashRefId: null, flashRect: null })
        }, 600)
        feedback(t('feedback.relocated'))
        scheduleGeometry()
      }

      /**
       * Open the temporary expanded note editor for one collection entry.
       * @param {string} refId - ref id.
       * @returns {void}
       */
      function openNoteEditor(refId) {
        const ref = snapshot().state.collection.find((entry) => entry.id === refId)
        if (ref === undefined) return
        const current = snapshot()
        const size = annotationViewport()
        const width = 300
        const x = Math.max(8, size.width - current.railWidth - width - 16)
        const y = Math.max(8, Math.min(96, size.height - 220))
        publish({ noteEditor: { refId, x, y } })
      }

      /** Close the expanded note editor. @returns {void} */
      function closeNoteEditor() {
        publish({ noteEditor: null })
      }

      /**
       * Notify the controller that the mounted Composer seat changed Session.
       * @param {string | null} sessionId - Session identity, or null.
       * @returns {void}
       */
      function sessionChanged(sessionId) {
        closeDetailCard()
        dispatch({ type: 'session', sessionId })
        scheduleGeometry()
      }

      // The launcher must obey the viewport for the whole plugin lifetime, not
      // only while the annotation mode is active.
      window.addEventListener('resize', onInstalledResize, { passive: true })

      /** Tear everything down (plugin unmount). @returns {void} */
      function dispose() {
        announceAnnotationState(false)
        window.removeEventListener('resize', onInstalledResize)
        abortGestures()
        clearResolvedNodeCache()
        detachPopoverNode()
        detachDetailNode()
        cancelMarkerHoverTimer()
        cancelDetailClose()
        uninstallPageListeners()
        disconnectFrameObserver()
        clearTimers()
        restoreAnnotationLayout({ immediate: true })
        flushAnnotationRecords()
        if (flashTimer !== null) window.clearTimeout(flashTimer)
        flashTimer = null
        pointer = null
        lastPick = null
        try {
          clearHover()
        } catch {
          // Disposal never depends on a subscriber.
        }
        annotationBridge.inputActions = null
        annotationBridge.sessionId = null
        annotationBridge.sessionCwd = null
      }

      return {
        store,
        t,
        toggleMode,
        activate,
        deactivate,
        beginLauncherDrag,
        consumeLauncherClickSuppressed,
        beginPopoverDrag,
        attachPopoverNode,
        detachPopoverNode,
        toggleRailCollapsed,
        openView,
        backView,
        clearSelection,
        updateNote,
        beginEdit,
        endEdit,
        addSelectionToCollection,
        commitSelection,
        quickReference,
        quickReferenceById,
        insertBatch,
        insertEntryChip,
        setEntryIncluded,
        selectAllCurrent: () => setAllCurrentIncluded(true),
        deselectAll: () => setAllCurrentIncluded(false),
        moveEntry,
        removeSelected,
        previewEntry,
        attachComposerServices,
        chipCandidates,
        chipRecord,
        chipClipboardText,
        serializeChip,
        openChipReference,
        copyLocator,
        levelUp: () => shiftChain(1),
        levelDown: () => shiftChain(-1),
        setModifier,
        updateCollectionNote,
        removeEntry,
        removeSelection,
        undoMark,
        clearCollection,
        openDetailCardById,
        closeDetailCard,
        beginDetailEdit,
        cancelDetailEdit,
        saveDetailNote,
        deleteDetail,
        attachDetailNode,
        detachDetailNode,
        relocateEntry,
        openNoteEditor,
        closeNoteEditor,
        statusOf,
        isInCollection,
        collectionScopeOf,
        currentSessionId,
        sessionChanged,
        dispose
      }
    }

    /** Stylesheet of the UI element annotation surface; injected once per plugin install. */
    const ANNOTATION_CSS = `
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
.psa-launcher{position:fixed;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:50%;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);box-shadow:var(--dsw-elevation-panel,0 6px 24px rgb(0 0 0 / 18%));cursor:grab;pointer-events:auto;touch-action:none;user-select:none;z-index:50}
.psa-launcher:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}
.psa-launcher[data-psa-active=true]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.psa-launcher[data-psa-dragging=true]{cursor:grabbing}
.psa-launcher:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.psa-launcher-icon{display:block}
.psa-launcher-count{position:absolute;top:-4px;right:-4px;box-sizing:border-box;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));font-size:10.5px;line-height:15px;text-align:center;font-variant-numeric:tabular-nums}
.psa-layer{position:fixed;inset:0;pointer-events:none;z-index:39}
.psa-hover{position:fixed;box-sizing:border-box;border:1px dashed var(--dsw-alias-state-business-primary);border-radius:3px}
.psa-selection{position:fixed;box-sizing:border-box;border:1.5px solid var(--dsw-alias-state-business-primary);border-radius:3px}
.psa-multi{position:fixed;box-sizing:border-box;border:1px solid var(--dsw-alias-state-business-primary);border-radius:3px}
.psa-selection[data-psa-flash=true],.psa-multi[data-psa-flash=true]{animation:psa-flash .6s ease-out 1}
@keyframes psa-flash{0%{box-shadow:0 0 0 6px var(--dsw-alias-state-business-primary)}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.psa-selection[data-psa-flash=true],.psa-multi[data-psa-flash=true],.psa-flash-outline{animation:none}}
.psa-box{position:fixed;box-sizing:border-box;border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));opacity:.65}
.psa-flash-outline{position:fixed;box-sizing:border-box;border:2px solid var(--dsw-alias-state-business-primary);border-radius:3px;animation:psa-flash .6s ease-out 1}
.psa-rail{position:fixed;top:0;right:0;bottom:0;box-sizing:border-box;display:flex;flex-direction:column;min-height:0;width:var(--psa-rail-width,200px);background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;line-height:18px;pointer-events:auto;z-index:40}
.psa-rail[data-psa-mode=overlay]{top:8px;right:8px;bottom:8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-lg,12px);box-shadow:var(--dsw-elevation-panel,0 10px 30px rgb(0 0 0 / 22%))}
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
.psa-empty{display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center;padding:18px 6px;border:1px dashed var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-md,8px)}
.psa-empty-title{color:var(--dsw-alias-label-primary);font-weight:500}
.psa-field{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.psa-field-label{min-width:0;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-select{appearance:none;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
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
.psa-undo-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:57;display:flex;align-items:center;gap:10px;max-width:min(520px,calc(100vw - 48px));padding:8px 10px 8px 12px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,0 8px 24px rgb(0 0 0 / 18%));color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:17px;pointer-events:auto}
.psa-undo-toast .psa-btn{width:auto;min-height:24px;padding:2px 8px}
.psa-popover{position:fixed;box-sizing:border-box;width:320px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;gap:8px;padding:10px 12px 12px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,0 10px 30px rgb(0 0 0 / 22%));color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:17px;pointer-events:auto;z-index:45}
.psa-popover-head{display:flex;align-items:center;gap:6px;cursor:grab;user-select:none}
.psa-popover-title{flex:1;min-width:0;font-weight:500;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psa-popover-ref{display:flex;align-items:center;gap:4px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;min-width:0}
.psa-popover-ref .psa-truncate{flex:1;min-width:0}
.psa-popover-ref .psa-icon-btn{width:20px;height:20px}
.psa-popover-status{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}
.psa-levels{display:inline-flex;align-items:center;gap:2px;margin-left:auto}
.psa-popover-note{display:flex;flex-direction:column;gap:4px}
.psa-popover-textarea{box-sizing:border-box;width:100%;min-height:56px;max-height:150px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:17px;resize:vertical}
.psa-popover-actions{display:flex;gap:6px}
.psa-popover-actions .psa-btn{flex:1;justify-content:center}
.psa-note-editor{position:fixed;box-sizing:border-box;width:300px;display:flex;flex-direction:column;gap:6px;padding:10px 12px 12px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,0 10px 30px rgb(0 0 0 / 22%));color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:17px;pointer-events:auto;z-index:55}
.psa-note-editor-textarea{box-sizing:border-box;width:100%;min-height:96px;max-height:220px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:17px;resize:vertical}
.psa-feedback{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:56;max-width:min(520px,calc(100vw - 48px));padding:8px 12px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,transparent));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,0 8px 24px rgb(0 0 0 / 18%));color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:17px;pointer-events:none}
.psa-feedback[data-psa-kind=error]{color:var(--dsw-alias-state-error-primary)}
/* Tooltip-like floating windows use the native DSH tooltip recipe exactly:
   same background token, no border, no panel shadow, no backdrop filter, the same
   near-white label color, in both light and dark themes. The shell switches the
   token set on body[data-ds-dark-theme], so this needs no theme-specific branch. */
.psa-popover,.psa-detail-card,.psa-note-editor{background:var(--dsw-alias-tooltip-bg);border:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;color:var(--dsw-static-neutral-bluish-00)}
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
.psa-rainbow-field > .psa-detail-textarea,
.psa-rainbow-field > .psa-select{position:relative;z-index:1;outline:none}
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

    /**
     * One inline chevron glyph.
     * @param {'left' | 'right'} direction - pointing direction.
     * @returns {object} the SVG element.
     */
    function AnnotationChevron(direction) {
      return React.createElement('svg', {
        viewBox: '0 0 24 24',
        width: 13,
        height: 13,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: 'false',
        style: { transform: direction === 'right' ? 'none' : 'rotate(180deg)' }
      }, React.createElement('path', { d: 'M9 5 16 12 9 19' }))
    }

    /**
     * Inline style for one viewport-relative rectangle.
     * @param {{ x: number, y: number, width: number, height: number }} rect - rectangle.
     * @returns {object} style object.
     */
    function annotationRectStyle(rect) {
      return {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      }
    }

    /**
     * Subscribe one component to the annotation store.
     * @param {object} controller - annotation controller.
     * @returns {object} current snapshot.
     */
    function useAnnotationSnapshot(controller) {
      const subscribe = React.useCallback((listener) => controller.store.subscribe(listener), [controller])
      const getSnapshot = React.useCallback(() => controller.store.getSnapshot(), [controller])
      if (typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      }
      const [value, setValue] = React.useState(getSnapshot)
      React.useEffect(() => subscribe(() => setValue(getSnapshot())), [subscribe, getSnapshot])
      return value
    }

    /**
     * The always-mounted annotation surface: launcher, rail, highlights,
     * popover, note editor, and feedback.
     * @param {{ t: Function, controller: object }} props - bound translate and controller.
     * @returns {object} React fragment.
     */
    function AnnotationOverlay(props) {
      const { t, controller } = props
      const snapshot = useAnnotationSnapshot(controller)
      const state = snapshot.state
      const active = state.phase !== 'off'
      const node = []
      node.push(React.createElement(AnnotationLauncher, { key: 'launcher', t, controller, snapshot }))
      if (active) {
        node.push(React.createElement(AnnotationHighlights, { key: 'layer', snapshot, t }))
        node.push(React.createElement(AnnotationRail, { key: 'rail', t, controller, snapshot }))
        if (state.phase === 'selected') {
          node.push(React.createElement(AnnotationPopover, { key: 'popover', t, controller, snapshot }))
        }
        if (snapshot.detailCard !== null) {
          node.push(React.createElement(AnnotationDetailCard, { key: 'detail', t, controller, snapshot }))
        }
      }
      if (snapshot.noteEditor !== null) node.push(React.createElement(AnnotationNoteEditor, { key: 'note-editor', t, controller, snapshot }))
      if (snapshot.markUndo !== null) {
        const undo = snapshot.markUndo
        node.push(React.createElement('div', {
          key: 'undo-toast',
          className: 'psa-undo-toast',
          'data-psa-undo-toast': '',
          'data-psa-own': '',
          role: 'status',
          'aria-live': 'polite'
        },
        React.createElement('span', { 'data-psa-undo-text': '' },
          undo.kind === 'clear' ? t('feedback.cleared') : (undo.kind === 'multi' ? t('feedback.selectedDeleted') : t('feedback.markDeleted'))),
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-undo': '',
          'data-psa-own': '',
          onClick: () => controller.undoMark()
        }, t('feedback.undo'))))
      }
      if (state.feedback !== null) {
        node.push(React.createElement('div', {
          key: 'feedback',
          className: 'psa-feedback',
          'data-psa-feedback': '',
          'data-psa-own': '',
          'data-psa-kind': state.feedback.kind,
          role: 'status',
          'aria-live': 'polite'
        }, state.feedback.text))
      }
      return React.createElement(React.Fragment, null, node)
    }

    /**
     * The round floating entry button: drag to move, click to toggle the mode.
     * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
     * @returns {object} the launcher button.
     */
    function AnnotationLauncher(props) {
      const { t, controller, snapshot } = props
      const active = snapshot.state.phase !== 'off'
      const count = snapshot.state.collection.length
      return React.createElement('button', {
        type: 'button',
        className: 'psa-launcher',
        'data-psa-launcher': '',
        'data-psa-own': '',
        'data-psa-active': active ? 'true' : 'false',
        'data-psa-dragging': snapshot.launcherDragging ? 'true' : undefined,
        'aria-pressed': active ? 'true' : 'false',
        'aria-label': active ? t('launcher.exit') : t('launcher.enter'),
        title: active ? t('launcher.exit') : t('launcher.enter'),
        style: { left: `${snapshot.launcherPosition.x}px`, top: `${snapshot.launcherPosition.y}px` },
        onPointerDown: (event) => controller.beginLauncherDrag(event),
        onClick: () => {
          if (controller.consumeLauncherClickSuppressed()) return
          controller.toggleMode()
        }
      },
      RemixGlyph(REMIX_FOCUS_3_LINE, 20, 'psa-launcher-icon'),
      count > 0
        ? React.createElement('span', { className: 'psa-launcher-count', 'data-psa-own': '' }, String(count))
        : null)
    }

    /**
     * The page mark badges for the current Session's resolved annotations (A3/T6).
     *
     * Marks are decorative overlay children only: `aria-hidden`, pointer-events
     * none (CSS), and no attribute is ever written to the page's own elements.
     * @param {object} snapshot - current annotation snapshot.
     * @param {Function} t - namespace-bound translate.
     * @returns {Array<object>} mark elements.
     */
    function annotationMarkElements(snapshot, t) {
      const marks = Array.isArray(snapshot.markRects) ? snapshot.markRects : []
      const nodes = []
      for (const mark of marks) {
        const hovering = snapshot.markerHoverId === mark.id
        const summary = mark.empty === true ? t('detail.emptyRequirement') : String(mark.summary ?? '')
        const title = `#${mark.index} · ${summary}${mark.stale === true ? ` · ${t('popover.status.changed')}` : ''}`
        const badgeInside = mark.rect !== null && typeof mark.rect === 'object' && typeof mark.rect.y === 'number' && mark.rect.y < 12
        nodes.push(React.createElement('div', {
          key: `mark-${mark.id}`,
          className: 'psa-mark',
          'data-psa-mark': '',
          'data-psa-mark-id': mark.id,
          'data-psa-mark-index': String(mark.index),
          'data-psa-mark-state': hovering ? 'hovering' : 'marked',
          'data-psa-mark-stale': mark.stale === true ? 'changed' : undefined,
          'data-psa-mark-badge-inside': badgeInside ? 'true' : undefined,
          'data-psa-own': '',
          'aria-hidden': 'true',
          style: annotationRectStyle(mark.rect)
        },
        React.createElement('span', {
          className: 'psa-mark-badge',
          'data-psa-mark-badge': '',
          'data-psa-mark-empty': mark.empty === true ? 'true' : undefined,
          'data-psa-mark-stale': mark.stale === true ? 'changed' : undefined,
          title
        },
        React.createElement('span', { className: 'psa-mark-badge-index' }, `#${mark.index}`),
        mark.stale === true ? React.createElement('span', { className: 'psa-mark-badge-stale', 'aria-hidden': 'true' }, '!') : null,
        React.createElement('span', { className: 'psa-mark-badge-text' }, summary))))
      }
      return nodes
    }

    /**
     * Hover, selection, marquee, mark, and re-locate flash rectangles.
     * @param {{ snapshot: object, t: Function }} props - surface props.
     * @returns {object} the highlight layer.
     */
    function AnnotationHighlights(props) {
      const { snapshot, t } = props
      const state = snapshot.state
      const boxes = []
      if (snapshot.hoverRect !== null) {
        boxes.push(React.createElement('div', {
          key: 'hover',
          className: 'psa-hover',
          'data-psa-hover': '',
          'data-psa-own': '',
          style: annotationRectStyle(snapshot.hoverRect)
        }))
      }
      const multi = state.selection.length > 1
      for (const item of snapshot.selectionRects) {
        boxes.push(React.createElement('div', {
          key: `${multi ? 'multi' : 'selection'}-${item.id}`,
          className: multi ? 'psa-multi' : 'psa-selection',
          'data-psa-selection': multi ? undefined : '',
          'data-psa-multi-outline': multi ? '' : undefined,
          'data-psa-ref': item.id,
          'data-psa-flash': snapshot.flashRefId === item.id ? 'true' : undefined,
          'data-psa-own': '',
          style: annotationRectStyle(item.rect)
        }))
      }
      if (snapshot.flashRect !== null) {
        boxes.push(React.createElement('div', {
          key: 'flash',
          className: 'psa-flash-outline',
          'data-psa-flash': snapshot.flashRefId ?? '',
          'data-psa-own': '',
          style: annotationRectStyle(snapshot.flashRect)
        }))
      }
      if (snapshot.boxRect !== null) {
        boxes.push(React.createElement('div', {
          key: 'box',
          className: 'psa-box',
          'data-psa-box': '',
          'data-psa-own': '',
          style: annotationRectStyle(snapshot.boxRect)
        }))
      }
      boxes.push(...annotationMarkElements(snapshot, t))
      return React.createElement('div', { className: 'psa-layer', 'data-psa-layer': '', 'data-psa-own': '' }, boxes)
    }

    /**
     * The constant narrow right tool rail; its inner view swaps in place.
     * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
     * @returns {object} the rail.
     */
    function AnnotationRail(props) {
      const { t, controller, snapshot } = props
      const state = snapshot.state
      const collapsed = snapshot.railCollapsed
      const count = state.collection.length
      const title = state.view === 'collection'
        ? t('collection.title')
        : (state.view === 'settings' ? t('settings.title') : t('rail.title'))
      const collapseButton = React.createElement('button', {
        type: 'button',
        className: 'psa-icon-btn',
        'data-psa-collapse': '',
        'data-psa-own': '',
        'aria-label': collapsed ? t('rail.expand') : t('rail.collapse'),
        title: collapsed ? t('rail.expand') : t('rail.collapse'),
        onClick: () => controller.toggleRailCollapsed()
      }, AnnotationChevron(collapsed ? 'right' : 'left'))
      const exitButton = React.createElement('button', {
        type: 'button',
        className: 'psa-icon-btn',
        'data-psa-exit': '',
        'data-psa-own': '',
        'aria-label': t('rail.exit'),
        title: t('rail.exit'),
        onClick: () => controller.deactivate()
      }, RemixGlyph(REMIX_CLOSE_LINE, 14))
      if (collapsed) {
        return React.createElement('aside', {
          className: 'psa-rail',
          'data-psa-rail': '',
          'data-psa-own': '',
          'data-psa-collapsed': 'true',
          'data-psa-mode': snapshot.layoutMode,
          role: 'complementary',
          'aria-label': t('rail.aria')
        },
        React.createElement('div', { className: 'psa-rail-header' },
          collapseButton,
          count > 0
            ? React.createElement('button', {
              type: 'button',
              className: 'psa-btn',
              'data-psa-open-collection': '',
              'data-psa-own': '',
              'aria-label': t('rail.openCollection'),
              title: t('rail.openCollection'),
              style: { width: 'auto', minHeight: '22px', padding: '0 4px' },
              onClick: () => {
                controller.toggleRailCollapsed()
                controller.openView('collection')
              }
            }, String(count))
            : null,
          exitButton))
      }
      const footer = state.view === 'collection' ? annotationCollectionFooter(t, controller, snapshot) : null
      return React.createElement('aside', {
        className: 'psa-rail',
        'data-psa-rail': '',
        'data-psa-own': '',
        'data-psa-mode': snapshot.layoutMode,
        role: 'complementary',
        'aria-label': t('rail.aria')
      },
      React.createElement('div', { className: 'psa-rail-header' },
        React.createElement('span', { className: 'psa-dot', 'aria-hidden': true }),
        React.createElement('span', { className: 'psa-rail-title', title }, title),
        collapseButton,
        exitButton),
      React.createElement('div', { className: 'psa-rail-body', 'data-psa-rail-panel': state.view, 'data-psa-own': '' },
        state.view === 'collection'
          ? AnnotationCollectionView({ t, controller, snapshot })
          : (state.view === 'settings'
            ? AnnotationSettingsView({ t, controller, snapshot })
            : AnnotationStatusView({ t, controller, snapshot }))),
      footer)
    }

    /**
     * Rail status view: mode state, selection guidance, and the two view switches.
     * @param {{ t: Function, controller: object, snapshot: object }} props - rail props.
     * @returns {object} the status view.
     */
    function AnnotationStatusView(props) {
      const { t, controller, snapshot } = props
      const state = snapshot.state
      const count = state.collection.length
      const selection = state.selection
      const settings = snapshot.settings
      const hint = t('rail.hint', {
        passThrough: t(`modifier.${settings.passThroughModifier}`),
        multi: t(`modifier.${settings.multiModifier}`)
      })
      const status = selection.length === 0
        ? t('rail.status.idle')
        : (selection.length === 1 ? t('rail.status.selected') : t('rail.status.multi', { count: selection.length }))
      const nodes = [
        React.createElement('div', { key: 'status', className: 'psa-rail-section' },
          React.createElement('div', { className: 'psa-status-line psa-status-strong' }, status),
          selection.length === 1
            ? React.createElement('div', { className: 'psa-muted psa-truncate', title: elementLabel(selection[0]) }, `${t('rail.selectedName')} · ${elementLabel(selection[0])}`)
            : null,
          selection.length === 1 && selection[0]?.locator?.surface === 'floating'
            ? React.createElement('div', {
              className: 'psa-muted',
              'data-psa-surface-badge': 'floating',
              'data-psa-own': ''
            }, `${t('rail.surfaceFloating')} · ${t('rail.surfaceTransient')}`)
            : null,
          React.createElement('div', { className: 'psa-muted' }, hint))
      ]
      if (selection.length > 1) {
        nodes.push(React.createElement('div', { key: 'multi', className: 'psa-rail-section' },
          React.createElement('button', {
            type: 'button',
            className: 'psa-btn psa-btn-primary',
            'data-psa-add-multi': '',
            'data-psa-own': '',
            onClick: () => controller.addSelectionToCollection()
          }, t('rail.addMulti', { count: selection.length })),
          React.createElement('button', {
            type: 'button',
            className: 'psa-btn',
            'data-psa-own': '',
            onClick: () => controller.clearSelection()
          }, t('rail.clearSelection'))))
      }
      nodes.push(React.createElement('div', { key: 'nav', className: 'psa-rail-section' },
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-open-collection': '',
          'data-psa-own': '',
          onClick: () => controller.openView('collection')
        },
        React.createElement('span', null, t('rail.openCollection')),
        React.createElement('span', { className: 'psa-btn-count' }, String(count))),
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-open-settings': '',
          'data-psa-own': '',
          onClick: () => controller.openView('settings')
        },
        React.createElement('span', null, t('rail.openSettings')),
        RemixGlyph(REMIX_SETTINGS_3_LINE, 13))))
      return React.createElement(React.Fragment, null, nodes)
    }

    /**
     * Rail collection view (A3/T8): scope counts, batch selection tools, ordered
     * rows, empty/cap/other-Session notices, and the batch footer.
     * @param {{ t: Function, controller: object, snapshot: object }} props - rail props.
     * @returns {object} the collection view.
     */
    function AnnotationCollectionView(props) {
      const { t, controller, snapshot } = props
      const state = snapshot.state
      const entries = state.collection
      const sessionId = controller.currentSessionId()
      const counts = annotationScopeCounts(entries, sessionId)
      const nodes = [
        React.createElement('div', { key: 'head', className: 'psa-rail-section' },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            React.createElement('button', {
              type: 'button',
              className: 'psa-icon-btn',
              'data-psa-own': '',
              'aria-label': t('rail.back'),
              title: t('rail.back'),
              onClick: () => controller.backView()
            }, AnnotationChevron('left')),
            React.createElement('span', { className: 'psa-status-line psa-status-strong' }, t('collection.title')),
            React.createElement('span', { className: 'psa-btn-count', style: { marginLeft: 'auto' } },
              entries.length === 1 ? t('collection.countOne') : t('collection.count', { count: entries.length })))),
        React.createElement('div', {
          key: 'scope',
          className: 'psa-muted',
          'data-psa-scope-counts': '',
          'data-psa-current-count': String(counts.current),
          'data-psa-other-count': String(counts.other),
          'data-psa-included-count': String(counts.included)
        }, t('collection.countScope', { current: counts.current, other: counts.other })),
        React.createElement('div', { key: 'tools', className: 'psa-rail-tools', 'data-psa-rail-tools': '', 'data-psa-own': '' },
          React.createElement('button', {
            type: 'button',
            className: 'psa-btn',
            'data-psa-select-all': '',
            'data-psa-own': '',
            disabled: counts.current === 0 || counts.included === counts.current,
            onClick: () => controller.selectAllCurrent()
          }, t('collection.selectAllCurrent')),
          React.createElement('button', {
            type: 'button',
            className: 'psa-btn',
            'data-psa-deselect-all': '',
            'data-psa-own': '',
            disabled: counts.included === 0,
            onClick: () => controller.deselectAll()
          }, t('collection.deselectAll'))),
        React.createElement('div', { key: 'sort', className: 'psa-muted' }, t('collection.sortHint'))
      ]
      if (sessionId === null && entries.length > 0) {
        // Without a mounted Composer seat there is no current Session, so scope is
        // unknown for every entry; say that explicitly instead of implying the
        // entries are merely from another Session (F8).
        nodes.push(React.createElement('div', {
          key: 'no-session',
          className: 'psa-muted',
          'data-psa-no-session': '',
          'data-psa-own': ''
        }, t('feedback.noComposer')))
      } else if (counts.other > 0) {
        nodes.push(React.createElement('div', { key: 'other', className: 'psa-muted', 'data-psa-other-notice': '' }, t('collection.crossSession', { count: counts.other })))
      }
      if (entries.length >= ANNOTATION_RECORD_LIMIT) {
        nodes.push(React.createElement('div', {
          key: 'cap',
          className: 'psa-muted psa-rail-max',
          'data-psa-max-reached': '',
          'data-psa-own': ''
        }, t('collection.maxReached', { limit: ANNOTATION_RECORD_LIMIT })))
      }
      if (entries.length === 0) {
        nodes.push(React.createElement('div', { key: 'empty', className: 'psa-empty', 'data-psa-empty': '', 'data-psa-own': '' },
          React.createElement('div', { className: 'psa-empty-title' }, t('collection.empty')),
          React.createElement('div', { className: 'psa-muted' }, t('collection.emptyHint'))))
      } else {
        const rows = entries.map((entry, index) => React.createElement(AnnotationEntryRow, {
          key: entry.id,
          t,
          controller,
          snapshot,
          entry,
          index
        }))
        nodes.push(React.createElement('div', { key: 'rows', className: 'psa-rail-section' }, rows))
      }
      return React.createElement(React.Fragment, null, nodes)
    }

    /**
     * One collection row (A3/T8): include checkbox (other-Session rows disabled),
     * index, element label → preview, status, Session/Workspace/surface metadata,
     * locator, inline rainbow note editor, and the per-row actions.
     * @param {{ t: Function, controller: object, snapshot: object, entry: object, index: number }} props - row props.
     * @returns {object} the row.
     */
    function AnnotationEntryRow(props) {
      const { t, controller, entry, index } = props
      const scope = controller.collectionScopeOf(entry)
      // A resolution chip only means something for the current page's Session; for
      // another Session the row is marked `other` instead of claiming a live match (F9).
      const status = scope === 'current' ? controller.statusOf(entry) : 'other'
      const locator = describeLocator(entry)
      const included = scope === 'current' && entry.included !== false
      const sessionId = entry.session !== null && typeof entry.session === 'object' ? entry.session.sessionId : null
      const metadata = []
      metadata.push(`${t('detail.session')} ${sessionShortLabel(sessionId) || t('insert.noSession')}`)
      const workspace = entry.session !== null && typeof entry.session === 'object'
        ? (entry.session.workspaceLabel || annotationWorkspaceLabel(entry.session.cwd))
        : null
      if (typeof workspace === 'string' && workspace.length > 0) metadata.push(`${t('detail.workspace')} ${workspace}`)
      const face = entry.locator !== null && typeof entry.locator === 'object' ? entry.locator.surface : 'page'
      if (face === 'floating') metadata.push(t('rail.surfaceFloating'))
      return React.createElement('div', {
        className: 'psa-entry',
        'data-psa-entry': '',
        'data-psa-own': '',
        'data-psa-ref': entry.id,
        'data-psa-entry-scope': scope,
        'data-psa-status': status,
        'data-psa-entry-included': included ? 'true' : 'false'
      },
      React.createElement('div', { className: 'psa-entry-head' },
        React.createElement('label', {
          className: 'psa-entry-check',
          'data-psa-entry-include': '',
          'data-psa-own': '',
          title: scope === 'current' ? t('collection.include') : t('collection.otherSessionHint')
        },
        React.createElement('input', {
          type: 'checkbox',
          checked: included,
          disabled: scope !== 'current',
          'data-psa-own': '',
          onChange: (event) => controller.setEntryIncluded(entry.id, event.currentTarget.checked === true)
        })),
        React.createElement('span', { className: 'psa-entry-index' }, `#${index + 1}`),
        React.createElement('button', {
          type: 'button',
          className: 'psa-entry-name',
          'data-psa-entry-relocate': '',
          'data-psa-entry-preview': '',
          'data-psa-own': '',
          title: scope === 'current' ? t('collection.preview') : t('collection.otherSessionHint'),
          onClick: () => controller.previewEntry(entry.id)
        }, elementLabel(entry)),
        scope === 'other'
          ? React.createElement('span', { className: 'psa-badge', 'data-psa-own': '' }, t('collection.otherSession'))
          : React.createElement('span', {
            className: 'psa-status-dot',
            'data-psa-status': status,
            'data-psa-own': '',
            title: t(`popover.status.${status}`),
            'aria-label': t(`popover.status.${status}`)
          })),
      React.createElement('div', { className: 'psa-entry-meta', 'data-psa-entry-meta': '', 'data-psa-own': '' }, metadata.join(' · ')),
      React.createElement('div', { className: 'psa-entry-locator', title: locator }, locator),
      React.createElement('div', { className: 'psa-rainbow-field', 'data-psa-own': '' },
        React.createElement('textarea', {
          className: 'psa-entry-note',
          'data-psa-entry-note': '',
          'data-psa-own': '',
          rows: 2,
          value: typeof entry.note === 'string' ? entry.note : '',
          placeholder: t('collection.notePlaceholder'),
          'aria-label': t('collection.notePlaceholder'),
          onChange: (event) => {
            const textarea = event.currentTarget
            if (textarea !== null && typeof textarea === 'object') {
              textarea.style.height = 'auto'
              textarea.style.height = `${Math.min(textarea.scrollHeight ?? 34, 72)}px`
            }
            controller.updateCollectionNote(entry.id, textarea === null ? '' : textarea.value)
          }
        })),
      React.createElement('div', { className: 'psa-entry-actions', 'data-psa-own': '' },
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn psa-entry-insert',
          'data-psa-entry-insert': '',
          'data-psa-own': '',
          disabled: scope !== 'current',
          title: scope === 'current' ? t('collection.insertChip') : t('collection.otherSessionHint'),
          onClick: () => controller.insertEntryChip(entry.id)
        }, t('collection.insertChip')),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-entry-copy-locator': '',
          'data-psa-own': '',
          'aria-label': t('collection.copyLocator'),
          title: t('collection.copyLocator'),
          onClick: () => controller.copyLocator(entry.id)
        }, RemixGlyph(REMIX_ANNOTATION_COPY_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-entry-expand': '',
          'data-psa-own': '',
          'aria-label': t('collection.expand'),
          title: t('collection.expand'),
          onClick: () => controller.openNoteEditor(entry.id)
        }, RemixGlyph(REMIX_LIST_CHECK_2, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-entry-move-up': '',
          'data-psa-own': '',
          disabled: index === 0,
          'aria-label': t('collection.moveUp'),
          title: t('collection.moveUp'),
          onClick: () => controller.moveEntry(entry.id, -1)
        }, RemixGlyph(REMIX_ARROW_UP_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-entry-move-down': '',
          'data-psa-own': '',
          disabled: index >= (props.snapshot.state.collection.length - 1),
          'aria-label': t('collection.moveDown'),
          title: t('collection.moveDown'),
          onClick: () => controller.moveEntry(entry.id, 1)
        }, RemixGlyph(REMIX_ARROW_DOWN_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn psa-detail-danger',
          'data-psa-entry-remove': '',
          'data-psa-own': '',
          'aria-label': t('collection.remove'),
          title: t('collection.remove'),
          onClick: () => controller.removeEntry(entry.id)
        }, RemixGlyph(REMIX_DELETE_BIN_LINE, 13))))
    }

    /**
     * Rail collection footer (A3/T8): delete the selected annotations, insert the
     * selected current-Session annotations as ONE group chip, or clear everything;
     * each destructive action uses the same 5 s undo slot. Visible disable reasons
     * explain why a batch insert is unavailable.
     * @param {Function} t - bound translate.
     * @param {object} controller - annotation controller.
     * @param {object} snapshot - current snapshot.
     * @returns {object} footer element.
     */
    function annotationCollectionFooter(t, controller, snapshot) {
      const state = snapshot.state
      const sessionId = controller.currentSessionId()
      const counts = annotationScopeCounts(state.collection, sessionId)
      const canInsert = counts.included > 0
      const reason = state.collection.length === 0
        ? t('collection.emptyHint')
        : (sessionId === null ? t('feedback.noComposer') : (counts.current === 0 ? t('collection.crossSession', { count: counts.other }) : t('collection.batchDisabled')))
      return React.createElement('div', { className: 'psa-rail-footer', 'data-psa-own': '' },
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn psa-btn-danger',
          'data-psa-delete-selected': '',
          'data-psa-own': '',
          disabled: counts.included === 0,
          title: counts.included === 0 ? t('collection.batchDisabled') : t('collection.deleteSelected'),
          onClick: () => controller.removeSelected()
        }, `${t('collection.deleteSelected')} (${counts.included})`),
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn psa-btn-primary',
          'data-psa-insert-batch': '',
          'data-psa-own': '',
          disabled: !canInsert,
          title: canInsert ? t('collection.insertChip') : reason,
          onClick: () => controller.insertBatch()
        }, `${t('collection.insertBatch')} (${counts.included})`),
        canInsert
          ? null
          : React.createElement('div', { className: 'psa-muted', 'data-psa-batch-reason': '', 'data-psa-own': '' }, reason),
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-clear': '',
          'data-psa-own': '',
          disabled: state.collection.length === 0,
          onClick: () => controller.clearCollection()
        }, t('collection.clear')))
    }

    /**
     * Rail settings view: the two configurable modifiers.
     * @param {{ t: Function, controller: object, snapshot: object }} props - rail props.
     * @returns {object} the settings view.
     */
    function AnnotationSettingsView(props) {
      const { t, controller, snapshot } = props
      const settings = snapshot.settings
      /**
       * One modifier field.
       * @param {string} labelKey - dictionary key of the field label.
       * @param {string} dataAttribute - required DOM marker.
       * @param {string} field - settings field name.
       * @param {string} value - current modifier id.
       * @returns {object} the field.
       */
      const field = (labelKey, dataAttribute, fieldName, value) => React.createElement('label', {
        className: 'psa-field',
        'data-psa-own': ''
      },
      React.createElement('span', { className: 'psa-field-label' }, t(labelKey)),
      React.createElement('span', { className: 'psa-rainbow-field', 'data-psa-own': '' },
        React.createElement('select', {
          className: 'psa-select',
          'data-psa-own': '',
          [dataAttribute]: '',
          value,
          onChange: (event) => controller.setModifier(fieldName, event.target.value)
        }, MODIFIER_CHOICES.map((choice) => React.createElement('option', { key: choice, value: choice }, t(`modifier.${choice}`))))))
      const message = snapshot.state.feedback === null ? '' : snapshot.state.feedback.text
      return React.createElement('div', { className: 'psa-rail-section' },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          React.createElement('button', {
            type: 'button',
            className: 'psa-icon-btn',
            'data-psa-own': '',
            'aria-label': t('rail.back'),
            title: t('rail.back'),
            onClick: () => controller.backView()
          }, AnnotationChevron('left')),
          React.createElement('span', { className: 'psa-status-line psa-status-strong' }, t('settings.title'))),
        field('settings.passThrough', 'data-psa-setting-passthrough', 'passThroughModifier', settings.passThroughModifier),
        field('settings.multi', 'data-psa-setting-multi', 'multiModifier', settings.multiModifier),
        React.createElement('div', {
          className: 'psa-muted',
          'data-psa-settings-feedback': '',
          'data-psa-own': '',
          role: 'status',
          'aria-live': 'polite'
        }, message),
        React.createElement('div', { className: 'psa-muted' }, t('settings.hint')))
    }

    /**
     * Hover detail card for one current-Session annotation (A3/T6).
     *
     * Opens after 120 ms of pointer rest on a page mark, anchored beside the mark
     * with side/vertical flip and viewport clamping; the pointer may move into the
     * card (keep-open union). It never steals focus on hover; explicit actions
     * (Edit requirement / Add requirement) may focus their textarea.
     * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
     * @returns {object | null} the detail card.
     */
    function AnnotationDetailCard(props) {
      const { t, controller, snapshot } = props
      const card = snapshot.detailCard
      /** Requirement draft; uncontrolled so hover reopen never fights the record value. */
      const noteRef = React.useRef(null)
      const setDetailNode = React.useCallback((node) => {
        if (node === null) controller.detachDetailNode()
        else controller.attachDetailNode(node)
      }, [controller])
      if (card === null) return null
      const record = snapshot.state.collection.find((entry) => entry.id === card.refId)
      if (record === undefined) return null
      const status = controller.statusOf(record)
      const editing = card.mode === 'edit'
      const locator = annotationLocatorText(record)
      const mark = (Array.isArray(snapshot.markRects) ? snapshot.markRects : []).find((item) => item.id === record.id)
      const liveBounds = mark !== undefined && mark.rect !== null ? mark.rect : normalizeAnnotationBounds(record.bounds)
      const bounds = liveBounds ?? { x: 0, y: 0, width: 0, height: 0 }
      const positionText = `${Math.round(bounds.x)}, ${Math.round(bounds.y)} · ${Math.round(bounds.width)}×${Math.round(bounds.height)}`
      const sessionId = record.session !== null && typeof record.session === 'object' ? record.session.sessionId : null
      const sessionText = `${sessionShortLabel(sessionId) || t('insert.noSession')} · ${formatAnnotationTime(record.at)}`
      const cwd = record.session !== null && typeof record.session === 'object' ? record.session.cwd : null
      const workspaceText = (record.session !== null && typeof record.session === 'object' ? record.session.workspaceLabel : null)
        || annotationWorkspaceLabel(cwd)
        || '—'
      const surface = record.locator !== null && typeof record.locator === 'object' ? record.locator.surface : 'page'
      const ephemeral = record.locator !== null && typeof record.locator === 'object' && record.locator.ephemeral === true
      const requirement = typeof record.note === 'string' ? record.note : ''
      /**
       * One metadata row.
       * @param {string} label - localized label.
       * @param {string} value - display value.
       * @param {string} marker - data attribute for E2E.
       * @returns {Array<object>} dt/dd pair.
       */
      const metaRow = (label, value, marker) => React.createElement(React.Fragment, null,
        React.createElement('dt', null, label),
        React.createElement('dd', { [marker]: '' }, value))
      return React.createElement('div', {
        ref: setDetailNode,
        className: 'psa-detail-card',
        'data-psa-detail': '',
        'data-psa-own': '',
        'data-psa-detail-ref': record.id,
        'data-psa-detail-mode': card.mode,
        'data-psa-status': status,
        role: 'dialog',
        'aria-label': t('detail.title'),
        style: { left: `${card.x}px`, top: `${card.y}px` }
      },
      React.createElement('div', { className: 'psa-detail-head', 'data-psa-own': '' },
        React.createElement('span', { className: 'psa-status-dot', 'data-psa-status': status, 'data-psa-own': '' }),
        React.createElement('span', { className: 'psa-detail-title', 'data-psa-detail-title': '' }, elementLabel(record)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-detail-close': '',
          'data-psa-own': '',
          'aria-label': t('detail.close'),
          title: t('detail.close'),
          onClick: () => controller.closeDetailCard()
        }, RemixGlyph(REMIX_CLOSE_LINE, 14))),
      React.createElement('div', { className: 'psa-detail-section', 'data-psa-own': '' },
        React.createElement('span', { className: 'psa-detail-label' }, t('detail.requirement')),
        editing
          ? React.createElement('div', { className: 'psa-rainbow-field', 'data-psa-own': '' },
            React.createElement('textarea', {
              key: `detail-note-${record.id}`,
              className: 'psa-detail-textarea',
              'data-psa-detail-note': '',
              'data-psa-own': '',
              ref: noteRef,
              defaultValue: requirement,
              rows: 3,
              placeholder: t('popover.notePlaceholder'),
              'aria-label': t('detail.requirement'),
              autoFocus: true
            }))
          : React.createElement('div', {
            className: 'psa-detail-requirement',
            'data-psa-detail-requirement': '',
            'data-psa-own': '',
            'data-psa-detail-empty': requirement.length === 0 ? 'true' : undefined
          }, requirement.length > 0 ? requirement : t('detail.emptyRequirement')),
        !editing && requirement.length === 0
          ? React.createElement('button', {
            type: 'button',
            className: 'psa-btn',
            'data-psa-detail-add': '',
            'data-psa-own': '',
            style: { width: 'auto', alignSelf: 'flex-start' },
            onClick: () => controller.beginDetailEdit()
          }, t('detail.addRequirement'))
          : null,
        editing
          ? React.createElement('div', { className: 'psa-detail-actions', 'data-psa-own': '' },
            React.createElement('button', {
              type: 'button',
              className: 'psa-btn',
              'data-psa-detail-cancel': '',
              'data-psa-own': '',
              onClick: () => controller.cancelDetailEdit()
            }, t('detail.cancel')),
            React.createElement('button', {
              type: 'button',
              className: 'psa-btn psa-btn-primary',
              'data-psa-detail-save': '',
              'data-psa-own': '',
              onClick: () => {
                const text = noteRef.current !== null && noteRef.current !== undefined ? noteRef.current.value : ''
                controller.saveDetailNote(record.id, text)
              }
            }, t('detail.save')))
          : null),
      React.createElement('dl', { className: 'psa-detail-meta', 'data-psa-detail-meta': '', 'data-psa-own': '' },
        metaRow(t('detail.status'), t(`popover.status.${status}`), 'data-psa-detail-status'),
        metaRow(t('detail.locator'), locator, 'data-psa-detail-locator'),
        metaRow(t('detail.position'), positionText, 'data-psa-detail-position'),
        metaRow(t('detail.session'), sessionText, 'data-psa-detail-session'),
        metaRow(t('detail.workspace'), workspaceText, 'data-psa-detail-workspace'),
        surface === 'floating'
          ? metaRow(t('detail.surfaceFloating'), ephemeral ? t('detail.ephemeral') : t('detail.surfaceFloating'), 'data-psa-detail-surface')
          : null),
      React.createElement('div', { className: 'psa-detail-actions', 'data-psa-own': '' },
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-detail-quick-ref': '',
          'data-psa-own': '',
          onClick: () => controller.quickReferenceById(record.id)
        }, t('detail.quickRef')),
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-detail-edit': '',
          'data-psa-own': '',
          onClick: () => controller.beginDetailEdit()
        }, t('detail.edit')),
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-detail-relocate': '',
          'data-psa-own': '',
          onClick: () => controller.relocateEntry(record.id)
        }, t('detail.relocate')),
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-detail-copy-locator': '',
          'data-psa-own': '',
          onClick: () => controller.copyLocator(record.id)
        }, t('detail.copyLocator')),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn psa-detail-danger',
          'data-psa-detail-delete': '',
          'data-psa-own': '',
          'aria-label': t('detail.delete'),
          title: t('detail.delete'),
          onClick: () => controller.deleteDetail(record.id)
        }, RemixGlyph(REMIX_DELETE_BIN_LINE, 14))))
    }

    /**
     * The draggable element popover with the note editor and the two actions.
     * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
     * @returns {object | null} the popover.
     */
    function AnnotationPopover(props) {
      const { t, controller, snapshot } = props
      const state = snapshot.state
      const setPopoverNode = React.useCallback((node) => {
        if (node === null) controller.detachPopoverNode()
        else controller.attachPopoverNode(node)
      }, [controller])
      const ref = state.selection[0]
      if (ref === undefined || snapshot.popoverPosition === null) return null
      const status = controller.statusOf(ref)
      const inCollection = controller.isInCollection(ref)
      const locator = describeLocator(ref)
      const surface = ref?.locator?.surface === 'floating' ? 'floating' : 'page'
      const ephemeral = surface === 'floating'
      return React.createElement('div', {
        ref: setPopoverNode,
        className: 'psa-popover',
        'data-psa-popover': '',
        'data-psa-own': '',
        'data-psa-surface': surface,
        'data-psa-ephemeral': ephemeral ? 'true' : undefined,
        role: 'dialog',
        'aria-label': t('popover.aria'),
        style: { left: `${snapshot.popoverPosition.x}px`, top: `${snapshot.popoverPosition.y}px` }
      },
      React.createElement('div', {
        className: 'psa-popover-head',
        'data-psa-own': '',
        title: t('popover.drag'),
        onPointerDown: (event) => controller.beginPopoverDrag(event)
      },
      React.createElement('span', { className: 'psa-popover-title', 'data-psa-popover-title': '' }, elementLabel(ref)),
      React.createElement('button', {
        type: 'button',
        className: 'psa-icon-btn',
        'data-psa-popover-close': '',
        'data-psa-own': '',
        'aria-label': t('popover.close'),
        title: t('popover.close'),
        onClick: () => controller.clearSelection()
      }, RemixGlyph(REMIX_CLOSE_LINE, 14))),
      React.createElement('div', { className: 'psa-popover-ref', 'data-psa-popover-ref': '', title: locator },
        React.createElement('span', { className: 'psa-truncate', 'data-psa-own': '' }, locator),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-popover-copy-locator': '',
          'data-psa-own': '',
          'aria-label': t('popover.copyLocator'),
          title: t('popover.copyLocator'),
          onClick: () => controller.copyLocator()
        }, RemixGlyph(REMIX_ANNOTATION_COPY_LINE, 13))),
      ephemeral
        ? React.createElement('div', {
          className: 'psa-muted',
          'data-psa-ephemeral-hint': '',
          'data-psa-own': ''
        }, t('popover.ephemeralHint'))
        : null,
      React.createElement('div', {
        className: 'psa-popover-status',
        'data-psa-popover-status': '',
        'data-psa-status': status
      },
      React.createElement('span', { className: 'psa-status-dot', 'data-psa-status': status, 'data-psa-own': '' }),
      React.createElement('span', { 'data-psa-own': '' }, `${t('popover.statusLabel')} · ${t(`popover.status.${status}`)}`),
      React.createElement('span', { className: 'psa-levels' },
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-level-up': '',
          'data-psa-own': '',
          'aria-label': t('popover.levelUp'),
          title: t('popover.levelUp'),
          onClick: () => controller.levelUp()
        }, RemixGlyph(REMIX_ARROW_UP_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-level-down': '',
          'data-psa-own': '',
          'aria-label': t('popover.levelDown'),
          title: t('popover.levelDown'),
          onClick: () => controller.levelDown()
        }, RemixGlyph(REMIX_ARROW_DOWN_LINE, 13)))),
      React.createElement('label', { className: 'psa-popover-note', 'data-psa-own': '' },
        React.createElement('span', { className: 'psa-muted' }, t('detail.requirement')),
        React.createElement('div', { className: 'psa-rainbow-field', 'data-psa-own': '' },
          React.createElement('textarea', {
            className: 'psa-popover-textarea',
            'data-psa-note': '',
            'data-psa-own': '',
            rows: 3,
            value: state.note,
            placeholder: t('popover.notePlaceholder'),
            'aria-label': t('popover.noteLabel'),
            onChange: (event) => controller.updateNote(event.target.value),
            onFocus: () => controller.beginEdit(),
            onBlur: () => controller.endEdit()
          }))),
      React.createElement('div', { className: 'psa-popover-actions' },
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-quick-ref': '',
          'data-psa-own': '',
          onClick: () => controller.quickReference()
        }, t('popover.quickRef')),
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn psa-btn-primary',
          'data-psa-add': '',
          'data-psa-commit': '',
          'data-psa-own': '',
          onClick: () => controller.commitSelection()
        }, inCollection ? t('popover.update') : t('popover.commit')),
        inCollection
          ? React.createElement('button', {
            type: 'button',
            className: 'psa-icon-btn psa-detail-danger',
            'data-psa-popover-delete': '',
            'data-psa-own': '',
            'aria-label': t('popover.delete'),
            title: t('popover.delete'),
            onClick: () => controller.removeSelection()
          }, RemixGlyph(REMIX_DELETE_BIN_LINE, 14))
          : null))
    }

    /**
     * Temporary expanded note editor for one collection entry, anchored beside
     * the rail so it never covers the canvas permanently.
     * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
     * @returns {object | null} the editor.
     */
    function AnnotationNoteEditor(props) {
      const { t, controller, snapshot } = props
      const editor = snapshot.noteEditor
      if (editor === null) return null
      const entry = snapshot.state.collection.find((item) => item.id === editor.refId)
      if (entry === undefined) return null
      return React.createElement('div', {
        className: 'psa-note-editor',
        'data-psa-entry-note-editor': '',
        'data-psa-own': '',
        style: { left: `${editor.x}px`, top: `${editor.y}px` }
      },
      React.createElement('div', { className: 'psa-popover-head', 'data-psa-own': '' },
        React.createElement('span', { className: 'psa-popover-title' }, t('collection.noteEditorTitle')),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-own': '',
          'aria-label': t('collection.noteEditorClose'),
          title: t('collection.noteEditorClose'),
          onClick: () => controller.closeNoteEditor()
        }, RemixGlyph(REMIX_CLOSE_LINE, 14))),
      React.createElement('div', { className: 'psa-muted psa-truncate' }, elementLabel(entry)),
      React.createElement('div', { className: 'psa-rainbow-field', 'data-psa-own': '' },
        React.createElement('textarea', {
          className: 'psa-note-editor-textarea',
          'data-psa-own': '',
          value: typeof entry.note === 'string' ? entry.note : '',
          placeholder: t('collection.notePlaceholder'),
          'aria-label': t('collection.notePlaceholder'),
          autoFocus: true,
          onChange: (event) => controller.updateCollectionNote(entry.id, event.target.value),
          onBlur: () => controller.closeNoteEditor()
        })))
    }

    /**
     * Invisible Composer seat that keeps the insertion bridge current and resets
     * selection state when the viewed Session changes.
     * @param {object} props - session slot props.
     * @returns {object} a hidden anchor element.
     */
    function AnnotationSessionSeat(props) {
      const { sessionId, inputActions } = props
      // Session-scoped slots receive the global `useSessions` standard hook. The
      // annotation overlay itself is not a slot, so this seat mirrors the Session's
      // workspace identity (cwd) into the bridge for record capture (F-2). The hook
      // presence is fixed by the slot contract for this seat's lifetime.
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : null
      const sessionsList = useSessions !== null ? useSessions((state) => state) : null
      const sessionCwd = sessionId !== undefined && sessionsList !== null && typeof sessionsList === 'object'
        && sessionsList.byId !== null && typeof sessionsList.byId === 'object'
        && typeof sessionsList.byId[sessionId]?.cwd === 'string'
        && sessionsList.byId[sessionId].cwd.length > 0
        ? sessionsList.byId[sessionId].cwd
        : null
      React.useEffect(() => {
        annotationBridge.sessionId = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
        annotationBridge.inputActions = inputActions ?? null
        annotationBridge.sessionCwd = sessionCwd
        if (annotationController !== null) annotationController.sessionChanged(annotationBridge.sessionId)
        return () => {
          // The bridge is all-or-nothing: a session id without its Composer actions (or the
          // reverse) would keep collection scope and insertion decisions stale after this
          // seat unmounts (e.g. leaving the conversation for the Plugins view).
          annotationBridge.sessionId = null
          annotationBridge.inputActions = null
          annotationBridge.sessionCwd = null
          if (annotationController !== null) annotationController.sessionChanged(null)
        }
      }, [sessionId, inputActions, sessionCwd])
      return React.createElement('span', {
        style: { display: 'none' },
        'aria-hidden': true
      })
    }

    /**
     * Build the `@` trigger source that owns annotation reference chips (A3/T9).
     *
     * The source receives the controller lazily so registration can happen before
     * the controller effect settles; every callback resolves the current
     * controller instance. `codec.serialize` throws for a deleted record so the
     * shell blocks the send instead of silently downgrading (D9).
     * @param {() => object | null} controllerAt - current annotation controller getter.
     * @param {Function} t - namespace-bound translate.
     * @returns {object} trigger source for `ctx.inputTriggers.registerSource`.
     */
    function createAnnotationChipSource(controllerAt, t) {
      /** @returns {object | null} the current controller. */
      const controller = () => {
        try {
          return controllerAt()
        } catch {
          return null
        }
      }
      return {
        trigger: ANNOTATION_CHIP_TRIGGER,
        name: ANNOTATION_CHIP_SOURCE,
        order: ANNOTATION_CHIP_ORDER,
        // The shell's slash-menu dictionary has no annotation title, and locale
        // registration cannot take over another owner's namespace, so a custom group
        // header would render the raw source name. Native reference sources use the
        // same no-title treatment; candidates self-identify via `chip.candidateLabel`.
        showGroupTitle: false,
        /**
         * Current-Session candidates only; an empty array hides the group (D8).
         * @param {object} session - composer Session projection.
         * @returns {Promise<Array<object>>} candidates.
         */
        async candidates(session) {
          const current = controller()
          if (current === null || session === null || typeof session !== 'object') return []
          const sessionId = typeof session.sessionId === 'string' ? session.sessionId : ''
          if (sessionId.length === 0) return []
          return current.chipCandidates(sessionId)
        },
        /**
         * A menu pick inserts the record's chip through the scoped input pipeline.
         * @param {object} pick - pipeline pick (`candidate`, `session`, `span`).
         * @returns {object | undefined} insert outcome, or undefined for a stale candidate.
         */
        onPick(pick) {
          const current = controller()
          if (current === null || pick === null || typeof pick !== 'object') return undefined
          const candidate = pick.candidate !== null && typeof pick.candidate === 'object' ? pick.candidate : null
          const value = candidate === null ? null : candidate.value
          if (typeof value !== 'string') return undefined
          const record = current.chipRecord(value)
          if (record === null) return undefined
          return { insert: annotationChipRefOf(record) }
        },
        /**
         * A chip click opens the record's detail card (single) or the rail
         * collection view (batch group).
         * @param {object} _session - composer Session projection.
         * @param {{ ref: string }} reference - chip reference.
         * @returns {boolean} whether the preview was accepted.
         */
        openReference(_session, reference) {
          const current = controller()
          if (current === null || reference === null || typeof reference !== 'object') return false
          return current.openChipReference(reference.ref)
        },
        codec: {
          /**
           * Clipboard projection of one chip.
           * @param {string} ref - chip ref.
           * @returns {string} clipboard text.
           */
          clipboardText: (ref) => {
            const current = controller()
            return current === null ? '' : current.chipClipboardText(ref)
          },
          /**
           * Model text for one chip; failure rejects the send (never downgraded).
           * @param {string} ref - chip ref.
           * @returns {Promise<string>} serialized model text.
           */
          serialize: async (ref) => {
            const current = controller()
            if (current === null) throw new Error(t('feedback.chipMissing'))
            return current.serializeChip(ref)
          }
        }
      }
    }

    /**
     * Install the browser-only UI element annotation mode.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installUiAnnotation(ctx) {
      if (annotationInstalled) return
      annotationInstalled = true
      const t = ctx.locale.bind(ANNOTATION_NS)
      ctx.effect(() => ctx.locale.register(ANNOTATION_NS, {
        en: ANNOTATION_EN,
        zh: ANNOTATION_ZH
      }), 'power-suite: ui annotation dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-power-suite-css', 'ui-annotation')
        style.textContent = ANNOTATION_CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'power-suite: ui annotation stylesheet')
      ctx.effect(() => {
        try {
          annotationController = createAnnotationController(t, ctx)
        } catch (error) {
          // The guard must not wedge this factory into a "installed" state with no controller.
          annotationInstalled = false
          throw error
        }
        return () => {
          if (annotationController !== null) annotationController.dispose()
          annotationController = null
          annotationInstalled = false
        }
      }, 'power-suite: ui annotation controller')
      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: ANNOTATION_OVERLAY_ID
      }, (props) => React.createElement(AnnotationOverlay, {
        ...props,
        t,
        controller: annotationController
      }))), 'power-suite: ui annotation overlay')
      ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: ANNOTATION_SEAT_ID,
        order: 60
      }, AnnotationSessionSeat)), 'power-suite: ui annotation composer seat')
      // A3/T9: the composer chip pipeline is injected dynamically so the plugin
      // keeps working on embeds without the chat UI. `conversation`+`inputTriggers`
      // arrive when the composer services are installed; the source registration
      // dies with the dynamic inject's fiber.
      try {
        ctx.inject(['conversation', 'inputTriggers'], (scoped) => {
          const scope = scoped !== undefined && scoped !== null && typeof scoped.get === 'function' ? scoped : ctx
          let conversation = null
          let inputTriggers = null
          try {
            conversation = scope.get('conversation')
            inputTriggers = scope.get('inputTriggers')
          } catch {
            conversation = null
            inputTriggers = null
          }
          if (conversation === undefined || conversation === null || inputTriggers === undefined || inputTriggers === null) return
          if (annotationController !== null) annotationController.attachComposerServices({ conversation, inputTriggers })
          const register = typeof scope.effect === 'function' ? scope.effect.bind(scope) : ctx.effect.bind(ctx)
          register(() => inputTriggers.registerSource(createAnnotationChipSource(() => annotationController, t)),
            'power-suite: ui annotation chip source')
        })
      } catch {
        // A missing dynamic-inject API leaves the plain-text insertion path (D9).
      }
    }
    //#endregion

    //#region plugin
    /**
     * The page type and its Start-guide card.
     * @param {Function} t - namespace-bound translate.
     * @returns {object} the registry definition.
     */
    function artifactsDefinition(t) {
      return {
        id: ID,
        kind: KIND,
        title: () => t('tab.title'),
        guide: [{
          id: 'open',
          order: 62,
          title: () => t('guide.title'),
          description: () => t('guide.description'),
          icon: GuideIcon
        }]
      }
    }

    /**
     * Register dictionaries, the page type, and its Session-scoped body.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'power-suite: session-artifacts dictionaries')
      ctx.effect(() => ctx.sidebarRightTabs.register(artifactsDefinition(t)), 'power-suite: session-artifacts page type')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: ID,
        locale: NS,
        inject: (sessionId) => ({ sessionId, t, sidebarRight: ctx.sidebarRight })
      }, ArtifactsPanel)), 'power-suite: session-artifacts tab body')
      installWorkspacePresetMenu(ctx)
      installWorkspacePresetRouting(ctx)
      installPromptHistory(ctx)
      installPromptHistoryPreview(ctx)
      installDraftAttachmentMemory(ctx)
      installDynamicWorkspaces(ctx)
      installInterruptedSessions(ctx)
      installQuickLook(ctx)
      installSettingsPage(ctx)
      installProjectView(ctx)
      installUiAnnotation(ctx)
    }

    // Test seam: `test/helpers/client-module.mjs` materializes this factory under a
    // DOM stub and reads these pure helpers. Production never defines the flag.
    if (typeof globalThis !== 'undefined'
      && typeof globalThis.__POWER_SUITE_TEST_HOOKS__ === 'object'
      && globalThis.__POWER_SUITE_TEST_HOOKS__ !== null) {
      globalThis.__POWER_SUITE_TEST_HOOKS__.uiAnnotation = {
        DEFAULT_SETTINGS: ANNOTATION_DEFAULT_SETTINGS,
        MODIFIER_CHOICES,
        SETTINGS_STORAGE_KEY,
        RECORDS_STORAGE_KEY: ANNOTATION_RECORDS_STORAGE_KEY,
        RECORD_LIMIT: ANNOTATION_RECORD_LIMIT,
        normalizeSettings,
        resolveModifierChange,
        parseStoredSettings,
        serializeSettings,
        modifierMatches,
        sanitizeText,
        normalizeUserNote,
        textDigest,
        sanitizeAttributeName,
        sanitizeAttributeValue,
        buildElementRef,
        selectorCandidates,
        identityKeyOf,
        describeLocator,
        elementLabel,
        cssIdentifier,
        clampPopoverPositionToViewport,
        createAnnotationState,
        reduceAnnotationState,
        serializeQuickReference,
        serializeBatchRequest,
        batchScopeSplit,
        resolveRefStatus,
        resolveNodeCandidate,
        clampLauncherPosition,
        clampPopoverPosition,
        computeRailWidth,
        layoutModeFor,
        collectionAdd,
        collectionRemove,
        collectionClear,
        collectionSetNote,
        annotationWorkspaceLabel,
        annotationRoutePath,
        normalizeAnnotationViewport,
        buildStableAncestors,
        buildUniqueSelector,
        annotationLocatorText,
        normalizeAnnotationRecord,
        parseAnnotationStore,
        serializeAnnotationStore,
        annotationSurfaceRoot,
        annotationSurfaceLevels,
        upsertAnnotationRecord,
        removeAnnotationRecord,
        restoreAnnotationRecord,
        moveAnnotationRecord,
        toggleAnnotationInclude,
        annotationUndoRemove,
        annotationUndoRestore,
        annotationMarkerBadgeText,
        clampDetailCardPosition,
        annotationUndoRemoveMany,
        annotationScopeCounts,
        annotationSelectedEntries,
        annotationApplyIncludes,
        annotationChipRefOf,
        annotationChipRefBatch,
        parseAnnotationChipRef,
        annotationChipCandidates,
        serializeAnnotationChip
      }
    }

    //#endregion

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'contextMenus', 'remote', 'remote.agentPresets', 'uiWorkspace', 'sessions'],
      apply
    }
  }
})
