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
    /** Host route resuming one Session through a non-human context message. */
    const CONTINUE_ROUTE = 'api/power-suite.continue'

    const INTERRUPTED_EN = {
      'badge.aria': 'Task interrupted',
      'badge.title': 'The last task was interrupted. Hover this session to continue it.',
      'badge.title.subagent': 'A delegated subagent task was interrupted. Hover this session to continue it.',
      'continue.label': 'Continue',
      'continue.aria': 'Continue the interrupted task',
      'continue.prompt': 'Continue the interrupted task.',
      'continue.summary': 'Continue interrupted task',
      'continue.failed': 'Could not continue the task. Try again.'
    }
    const INTERRUPTED_ZH = {
      'badge.aria': '任务被中断',
      'badge.title': '上一个任务被中断，悬停此会话可继续。',
      'badge.title.subagent': '委派的子任务被中断，悬停此会话可继续。',
      'continue.label': '继续',
      'continue.aria': '继续被中断的任务',
      'continue.prompt': '继续完成被中断的任务。',
      'continue.summary': '继续被中断的任务',
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
      if (typeof CSS === 'object' && CSS !== null && typeof CSS.escape === 'function') return CSS.escape(value)
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
.psd-panel-body{position:relative;display:flex;flex-direction:column;padding:0 4px 5px;max-height:min(46cqh,320px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}
.psd-panel-body::-webkit-scrollbar{display:none;width:0;height:0}
.psd-panel-empty{padding:6px 10px 8px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;display:flex;flex-direction:column;gap:2px}
.psd-panel-empty strong{color:var(--dsw-alias-label-secondary);font-weight:500}
.psd-item{display:flex;flex-direction:column;min-width:0}
.psd-run{display:flex;align-items:center;gap:2px;min-width:0;min-height:28px;padding:0 0 0 7px;border-radius:var(--dsw-radius-md,8px)}
.psd-run-main:hover{background:var(--dsw-alias-interactive-bg-hover)}
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
     * @returns {Array<object>} running rows.
     */
    function dwRunningRows(list, statuses, workspaces, t, runningParents, archived) {
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
          updatedAt: typeof summary.updatedAt === 'number' ? summary.updatedAt : Date.now(),
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
     * @returns {Array<object>} recently finished rows, newest first.
     */
    function dwRecentRows(list, statuses, workspaces, t, now, runningParents, archived, recentMs) {
      const rows = []
      if (list === null || typeof list !== 'object' || list.byId === undefined || !Array.isArray(list.ids)) return rows
      const cutoff = now - recentMs
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary === undefined || summary.blank === true || summary.origin === 'subagent') continue
        if (archived.has(id)) continue
        if (dwSessionRunning(id, summary, statuses) || runningParents.has(id)) continue
        const updatedAt = typeof summary.updatedAt === 'number' ? summary.updatedAt : 0
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
     * @returns {{ rows: Array<object>, workspaceOf: Map<string, string> }} activity facts.
     */
    function dwActiveSessions(list, statuses, workspaces, now, archived, activeMs) {
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
        const updatedAt = typeof summary.updatedAt === 'number' ? summary.updatedAt : 0
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
     * @returns {Map<string, Array<object>>} parent id → child rows, newest first.
     */
    function dwSubagentChildren(list, statuses, now, archived, recentMs, workspaces) {
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
        const updatedAt = typeof summary.updatedAt === 'number' ? summary.updatedAt : 0
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
        onToggle, onToggleAll, onToggleChildren, onOpen, interruptedT, onNewSession
      } = props
      const visible = expanded && !showAll ? rows.slice(0, DW_PANEL_LIMIT) : rows
      const canExpand = rows.length > DW_PANEL_LIMIT
      const anyRunning = rows.some((row) => row.state === 'running')
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
            React.createElement('div', { className: 'psd-run', 'data-state': row.state },
              React.createElement('button', {
                type: 'button',
                className: 'psd-run-main',
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
                  : !acked.has(row.id)
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
                return React.createElement('div', {
                  key: child.id,
                  className: 'psd-child',
                  'data-state': child.state
                },
                React.createElement('button', {
                  type: 'button',
                  className: 'psd-child-main',
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
                    : !acked.has(child.id)
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
      const [ackedSessions, setAckedSessions] = React.useState(() => new Set())
      const [now, setNow] = React.useState(() => Date.now())

      const mountsRef = React.useRef(null)
      const latestRef = React.useRef(null)
      const aliveRef = React.useRef(true)
      const applyScheduledRef = React.useRef(false)
      const durationsRef = React.useRef(new Map())
      const firstRenderRef = React.useRef(true)

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
      const runningRows = dwRunningRows(sessions, statuses, workspaces, t, runningParents, archivedIds)
      const recentRows = dwRecentRows(sessions, statuses, workspaces, t, now, runningParents, archivedIds, windows.recentMs)
      const panelRows = runningRows.concat(recentRows)
      const childrenByParent = dwSubagentChildren(sessions, statuses, now, archivedIds, windows.recentMs, workspaces)
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

      latestRef.current = { sessions, statuses, workspaces: workspaceSnapshot, folds, windows }

      // A finished Session's green mark is an unread signal: opening that
      // Session (from this card or anywhere else) acknowledges it, and a new
      // run clears the acknowledgement so the next completion is visible.
      React.useEffect(() => {
        if (sessions === null || typeof sessions !== 'object' || !Array.isArray(sessions.ids)) return
        const running = new Set()
        const current = new Set()
        for (const id of sessions.ids) {
          const summary = sessions.byId?.[id]
          if (summary === undefined) continue
          if (dwSessionRunning(id, summary, statuses)) running.add(id)
          if ((summary.retainedBy?.mainView ?? 0) > 0) current.add(id)
        }
        setAckedSessions((previous) => {
          let changed = false
          const next = new Set(previous)
          for (const id of running) if (next.delete(id)) changed = true
          for (const id of current) if (!next.has(id)) { next.add(id); changed = true }
          return changed ? next : previous
        })
      }, [sessions, statuses])

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
          latest.windows.activeMs
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
        acked: ackedSessions,
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
    function PsvProjectHeader({ project, copy, nav, refresh, refreshing, t }) {
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
          void nav.openWorkspace(project.workspaceId)
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
      const refreshButton = psv('button', {
        type: 'button',
        className: 'psv-iconbtn',
        'aria-label': t('action.refresh'),
        title: t('action.refresh'),
        'data-busy': refreshing ? 'true' : undefined,
        disabled: refreshing,
        onClick: refresh
      }, RemixGlyph(REMIX_REFRESH_LINE, 15))
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
      const actions = psv('div', { className: 'psv-actions' }, openButton, newButton, refreshButton, moreMenu)
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
          void nav.openWorkspace(workspaceId)
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
      const [tab, setTab] = React.useState('overview')
      const snapshot = state.snapshot
      const close = props.onClose
      const navigation = React.useMemo(() => {
        const run = (action) => {
          try {
            action()
          } catch (error) {
            console.warn('[power-suite] project page navigation failed', error)
          }
        }
        return {
          openSession: (sessionId) => {
            run(() => props.uiWorkspace.openSession(sessionId))
            close()
          },
          openWorkspace: (id) => {
            run(() => { void props.uiWorkspace.openWorkspace(id) })
            close()
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
          }, t(entry.key)))),
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
            refreshing,
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
     * buttons stay fully native. Opening the page changes neither the current
     * Session nor the conversation view: the handler only dispatches
     * PROJECT_PAGE_EVENT and the shell.overlay seat reacts to it.
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
          setTarget({ workspaceId, title: projectWorkspaceTitle(ctx, workspaceId) })
        }
        window.addEventListener(PROJECT_PAGE_EVENT, onOpen)
        return () => window.removeEventListener(PROJECT_PAGE_EVENT, onOpen)
      }, [ctx])
      React.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
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
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'contextMenus', 'remote', 'remote.agentPresets', 'uiWorkspace', 'sessions'],
      apply
    }
  }
})
