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

    /** This feature's copy namespace. */
    const NS = 'sessionArtifacts'

    /** This feature's implementation identity: the tab key and the guide dispatch id. */
    const ID = '@rexxin/dsh-power-suite/artifacts'

    /** The page type opened by this plugin's guide card. */
    const KIND = 'session-artifacts'

    /** Authenticated exact routes registered by the Host half. */
    const LIST_ROUTE = 'api/session-artifacts.list'
    const RAW_ROUTE = 'api/session-artifacts.raw'
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
      'list.refresh': 'Refresh',
      'list.loading': 'Loading…',
      'list.empty.title': 'No artifacts yet',
      'list.empty.hint': 'Files this session writes, or delivers with present, appear here.',
      'list.error.title': 'Could not load artifacts',
      'list.retry': 'Retry',
      'meta.presented': 'Delivered',
      'meta.generated': 'Generated',
      'meta.turn': 'turn {turn}',
      'action.open': 'Open',
      'action.download': 'Download',
      'action.copy': 'Copy link',
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
      'list.refresh': '刷新',
      'list.loading': '加载中…',
      'list.empty.title': '还没有产物',
      'list.empty.hint': '本会话写入的文件，或用 present 交付的文件会出现在这里。',
      'list.error.title': '产物加载失败',
      'list.retry': '重试',
      'meta.presented': '已交付',
      'meta.generated': '已生成',
      'meta.turn': '第 {turn} 轮',
      'action.open': '打开',
      'action.download': '下载',
      'action.copy': '复制链接',
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
.dsa-list{list-style:none;margin:0;padding:0 8px 8px;overflow:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:2px}
.dsa-row{display:flex;align-items:center;gap:10px;padding:8px 8px;border-radius:var(--dsw-radius-lg,10px);min-width:0}
.dsa-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsa-icon{flex:none;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;justify-content:center}
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
    const REMIX_FILE_LINE = 'M9 2.00318V2H19.9978C20.5513 2 21 2.45531 21 2.9918V21.0082C21 21.556 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5501 3 20.9932V8L9 2.00318ZM5.82918 8H9V4.83086L5.82918 8ZM11 4V9C11 9.55228 10.5523 10 10 10H5V20H19V4H11Z'
    const REMIX_BOOK_OPEN_LINE = 'M13 21V23H11V21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H9C10.1947 3 11.2671 3.52375 12 4.35418C12.7329 3.52375 13.8053 3 15 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H13ZM20 19V5H15C13.8954 5 13 5.89543 13 7V19H20ZM11 19V7C11 5.89543 10.1046 5 9 5H4V19H11Z'
    const REMIX_DOWNLOAD_LINE = 'M3 19H21V21H3V19ZM13 13.1716L19.0711 7.1005L20.4853 8.51472L12 17L3.51472 8.51472L4.92893 7.1005L11 13.1716V2H13V13.1716Z'
    const REMIX_CHECK_LINE = 'M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z'
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
        add('"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'"' + template, 'string')
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
          const underRow = under instanceof Element
            ? under.closest('li[data-artifact-path], li[data-files-entry="file"][data-files-path]')
            : null
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
        ? null
        : Math.max(minHeight, Math.min(saved.height, maxHeight))
      let left = rect.left - width - 14
      if (left < 8) left = Math.min(rect.right + 14, viewportWidth - width - 8)
      left = Math.max(8, left)
      const top = Math.max(8, Math.min(rect.top - 12, viewportHeight - (height ?? 480) - 8))
      card.style.left = Math.round(left) + 'px'
      card.style.top = Math.round(top) + 'px'
      card.style.width = Math.round(width) + 'px'
      if (height === null) {
        card.style.height = ''
        card.style.maxHeight = ''
      } else {
        card.style.height = Math.round(height) + 'px'
        card.style.maxHeight = 'calc(100vh - 16px)'
      }
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
      download.href = artifactRawUrl(entry.path, entry.name, 'attachment')
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
      const inlineUrl = artifactRawUrl(entry.path, entry.name, 'inline')
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
      const previous = [...body.querySelectorAll('.dsa-quicklook-layer')].pop() ?? null
      for (const old of body.querySelectorAll('.dsa-quicklook-layer')) {
        if (old !== previous) old.remove()
      }
      body.replaceChildren()
      body.appendChild(layer)
      layer.style.opacity = '0'
      if (previous !== null) body.appendChild(previous)
      const reduced = quickLookReducedMotion()
      if (reduced) {
        layer.style.opacity = ''
        previous?.remove()
        return
      }
      if (previous === null) {
        layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }).onfinish = () => {
          layer.style.opacity = ''
        }
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
      ], { duration: 200, delay: 20, easing: 'cubic-bezier(0,0,0,1)', fill: 'both' })
      incoming.onfinish = () => {
        layer.style.opacity = ''
        previous.remove()
      }
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
     * Fetch (or reuse) the preview descriptor for one entry.
     * @param {object} entry - hover entry.
     * @returns {Promise<object | undefined>} descriptor, or undefined on failure.
     */
    async function requestQuickLookData(entry) {
      const cached = quickLookState.cache.get(entry.path)
      if (cached !== undefined) return cached
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
        quickLookState.cache.set(entry.path, data)
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

      /**
       * Copy one artifact's LAN link and acknowledge briefly on its row.
       * @param {object} artifact - the row.
       * @returns {void}
       */
      function onCopy(artifact) {
        copyText(rawUrl(artifact, 'inline', payload?.origin ?? null)).then((copied) => {
          if (!copied) return
          setCopiedPath(artifact.path)
          window.setTimeout(() => {
            setCopiedPath((current) => (current === artifact.path ? null : current))
          }, 1600)
        })
      }

      // Artifacts that no longer exist cannot be opened or downloaded; the
      // Session log keeps them, but the panel shows only files that are still
      // on disk. The list route still reports the full set.
      const artifacts = (payload !== null && Array.isArray(payload.artifacts) ? payload.artifacts : [])
        .filter((artifact) => artifact.missing !== true)
      const origin = payload !== null && typeof payload.origin === 'string' ? payload.origin : null
      const countText = artifacts.length === 1
        ? t('list.countOne')
        : t('list.count', { count: artifacts.length })

      const header = React.createElement('header', { className: 'dsa-header' },
        React.createElement('span', { className: 'dsa-count' }, phase === 'ready' ? countText : ''),
        React.createElement('button', {
          type: 'button',
          className: 'dsa-refresh',
          onClick: () => setReload((value) => value + 1),
          disabled: phase === 'loading',
          title: t('list.refresh'),
          'aria-label': t('list.refresh'),
          'data-loading': phase === 'loading' ? 'true' : undefined
        }, RemixGlyph(REMIX_REFRESH_LINE, 15)))

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

      const rows = artifacts.map((artifact) => {
        const facts = [
          artifact.presented === true ? t('meta.presented') : t('meta.generated'),
          t('meta.turn', { turn: artifact.turn })
        ]
        if (typeof artifact.size === 'number') facts.push(formatBytes(artifact.size))
        return React.createElement('li', {
          className: 'dsa-row',
          key: artifact.path,
          'data-artifact-path': artifact.path,
          'data-artifact-name': artifact.name
        },
        React.createElement('span', { className: 'dsa-icon' }, FileIcon()),
        React.createElement('div', { className: 'dsa-main' },
          React.createElement('div', { className: 'dsa-name', title: artifact.path }, artifact.name),
          React.createElement('div', { className: 'dsa-meta' }, facts.join(' · ')),
          artifact.description ? React.createElement('div', { className: 'dsa-desc' }, artifact.description) : null),
        React.createElement('div', { className: 'dsa-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'dsa-action',
            title: t('action.open'),
            'aria-label': t('action.open'),
            onClick: () => openArtifactPreview(sidebarRight, sessionId, artifact, origin)
          }, RemixGlyph(REMIX_BOOK_OPEN_LINE, 16)),
          React.createElement('a', {
            className: 'dsa-action',
            title: t('action.download'),
            'aria-label': t('action.download'),
            href: rawUrl(artifact, 'attachment', origin),
            download: artifact.name
          }, RemixGlyph(REMIX_DOWNLOAD_LINE, 16)),
          React.createElement('button', {
            type: 'button',
            className: 'dsa-action',
            title: copiedPath === artifact.path ? t('action.copied') : t('action.copy'),
            'aria-label': copiedPath === artifact.path ? t('action.copied') : t('action.copy'),
            onClick: () => onCopy(artifact),
            'data-copied': copiedPath === artifact.path ? 'true' : undefined
          }, RemixGlyph(copiedPath === artifact.path ? REMIX_CHECK_LINE : REMIX_LINK, 16))))
      })

      let body
      if (phase === 'loading' && payload === null) {
        body = React.createElement('div', { className: 'dsa-loading' }, t('list.loading'))
      } else if (artifacts.length === 0) {
        body = React.createElement('div', { className: 'dsa-empty' },
          React.createElement('div', { className: 'dsa-empty-icon' }, TrayIcon()),
          React.createElement('div', { className: 'dsa-empty-title' }, t('list.empty.title')),
          React.createElement('div', { className: 'dsa-empty-hint' }, t('list.empty.hint')))
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
     * Read one Session's prompt history from the Host.
     * @param {string} sessionId - Session identity.
     * @returns {Promise<string[]>} prompt texts oldest first; empty on failure.
     */
    async function readPromptHistory(sessionId) {
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
          if (entry !== null && typeof entry === 'object' && typeof entry.text === 'string' && entry.text.length > 0) {
            prompts.push(entry.text)
          }
        }
        return prompts
      } catch {
        return []
      }
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
      const history = React.useRef({ prompts: [], ready: false, loading: null })
      const anchor = React.useRef(null)
      const latest = React.useRef({ draft, phase, sessionId })
      latest.current.draft = draft
      latest.current.phase = phase
      latest.current.sessionId = sessionId

      const load = React.useCallback(() => {
        const target = sessionId
        if (history.current.loading !== null) return history.current.loading
        const task = readPromptHistory(target).then((prompts) => {
          history.current.loading = null
          if (prompts.length > 0 || !history.current.ready) {
            history.current.prompts = prompts
            history.current.ready = true
          }
          return history.current.prompts
        })
        history.current.loading = task
        return task
      }, [sessionId])

      React.useEffect(() => {
        history.current = { prompts: [], ready: false, loading: null }
        browsing.current = { index: null, saved: '', recalled: null }
        load()
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

    /** Defaults used before the Host answers and by a deployment without the route. */
    const DEFAULT_SETTINGS = { promptHistoryModifier: 'primary' }

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
      if (raw !== null && typeof raw === 'object' && PROMPT_HISTORY_MODIFIERS.includes(raw.promptHistoryModifier)) {
        settings.promptHistoryModifier = raw.promptHistoryModifier
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

      /**
       * Persist one modifier choice.
       * @param {string} mode - modifier mode.
       * @returns {void}
       */
      function choose(mode) {
        if (locked || mode === current) return
        setSaving(true)
        setFailed(false)
        saveSettings({ promptHistoryModifier: mode }).then((accepted) => {
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

      const options = PROMPT_HISTORY_MODIFIERS.map((mode) => React.createElement('label', {
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
        onChange: () => choose(mode)
      }),
      React.createElement('span', { className: 'dps-choice-text' }, t(`modifier.${mode}`))))

      return React.createElement('section', { className: 'dps-settings' },
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
            options)),
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
      maxActive: 2
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
      setInterruptedRecord(sessionId, { status: 'loading', interrupted: false })
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
        setInterruptedRecord(sessionId, { status: 'error', interrupted: false })
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

    /** Services captured at install time for row actions. */
    const interruptedRuntime = { uiWorkspace: null }

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
[class*="_contextRow"]:has([data-context-source="power-suite-continue"]){display:none!important}
html[data-power-suite-interrupted="true"] [data-conversation-region="composer"] button[class$="_primary"]>svg{display:none!important}
html[data-power-suite-interrupted="true"] [data-conversation-region="composer"] button[class$="_primary"]::before{content:"";display:block;width:16px;height:16px;background-color:currentColor;-webkit-mask:${PLAY_MASK} center/contain no-repeat;mask:${PLAY_MASK} center/contain no-repeat}
`
    //#endregion

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
          markInterrupted(target, false)
          window.setTimeout(() => refreshInterrupted(target), 2500)
        }).catch(() => {
          refreshInterrupted(target)
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
      ctx.effect(() => ctx.locale.register(INTERRUPTED_NS, { en: INTERRUPTED_EN, zh: INTERRUPTED_ZH }), 'power-suite: interrupted dictionaries')
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
        // The implicit continuation is a context injection, not a human
        // prompt. Hide only that producer's row so the transcript stays clean.
        let frame = null
        const hide = () => {
          frame = null
          for (const source of document.querySelectorAll('[data-context-source="power-suite-continue"]')) {
            const row = source.closest('[class*="_contextRow"]')
            if (row instanceof HTMLElement) row.style.display = 'none'
          }
        }
        const schedule = () => {
          if (frame !== null) return
          frame = window.requestAnimationFrame(hide)
        }
        schedule()
        const observer = new MutationObserver(schedule)
        observer.observe(document.body, { childList: true, subtree: true })
        return () => {
          observer.disconnect()
          if (frame !== null) window.cancelAnimationFrame(frame)
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
      installInterruptedSessions(ctx)
      installQuickLook(ctx)
      installSettingsPage(ctx)
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'contextMenus', 'remote', 'remote.agentPresets', 'uiWorkspace'],
      apply
    }
  }
})
