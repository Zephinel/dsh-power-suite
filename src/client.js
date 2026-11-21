//
// The entry is an ES module: the build bundles it into the classic-script IIFE
// the DSH shell loads. Pure browser models live under src/browser/ and are
// imported here instead of being redefined inline.
import { installQuickLook } from './browser/hover-quick-look/install.ts'
import { createUpdateCheck } from './browser/update-check/install.ts'
import { createSidebarWidthController } from './browser/sidebar-width/install.ts'
import {
  appUrl,
  attachmentUrl,
  formatBytes,
} from './browser/artifacts/urls.ts'
import { ARTIFACTS_NS } from './browser/artifacts/copy.ts'
import { createArtifactsComponents } from './browser/artifacts/panel.ts'
import { createPromptHistorySeat } from './browser/prompt-history/seat.ts'
import { createSettingsPage } from './browser/settings/page.ts'
import { createSettingsStore } from './browser/settings/store.ts'
import { createWorkspacePresets } from './browser/workspace-presets/install.ts'
import { REMIX_BOOK_OPEN_LINE, REMIX_DOWNLOAD_LINE, REMIX_FILE_COPY_LINE, REMIX_FILE_LINE, REMIX_LINK } from './browser/remix-icons.ts'
import { createDraftAttachmentMemory } from './browser/draft-attachments/install.ts'
import { createInterruptedSessionsFeature } from './browser/interrupted-sessions/install.ts'
import { createPromptHistoryPreview } from './browser/prompt-history/preview.ts'
import { ROUTES, browserRoute } from './shared/routes.ts'
import { createComposerImageGallery } from './browser/composer-gallery/install.ts'
import { createAnnotationComponents } from './browser/ui-annotation/components.ts'
import { ANNOTATION_EN, ANNOTATION_ZH } from './browser/ui-annotation/copy.ts'
import { createUiAnnotationInstaller } from './browser/ui-annotation/install.ts'
import {
  dwNeedsProjectionRead,
  dwProjectionSections
} from './browser/dynamic-workspaces/stats.ts'
import { DW_NS, createDynamicWorkspacesInstaller } from './browser/dynamic-workspaces/install.ts'
/**
 * Browser half of DSH Power Suite.
 *
 * One client entry owns every feature's browser surface, kept in its own
 * `#region feature:` marks so another feature can be added the same way.
 *
 * Session artifacts registers one action in the native Files page header that
 * swaps the pane content for an animated overlay listing the current Session's
 * artifacts (the standalone page type and its Start-guide card are gone). It
 * asks the Host for the list and renders each row with three zero-install actions:
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
  id: '@zephinel/dsh-power-suite',
  factory: (/** @type {DshRequire} */ require) => {
    const React = require('react')
    const ReactDOM = require('react-dom')
    // The shell seeds this module into every Web bundle; keep the feature
    // declarative when a foreign host omits it instead of failing to load.
    /** @type {Partial<typeof import('@deepseek-ai/dsh-client-ui-primitives')>} */
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
      : (/** @type {{ size?: number }} */ props) => React.createElement('span', {
        'aria-hidden': true,
        style: { display: 'inline-block', width: props.size ?? 10, height: props.size ?? 10, borderRadius: '50%', background: 'currentColor', opacity: 0.45 }
      })

    /**
     * Render one inline Remix glyph.
     * @param {string} path - Remix path data.
     * @param {number} size - pixel size.
     * @param {string} [className] - optional class.
     * @param {number} [scale] - optional inner-path scale; omitted keeps 1:1.
     * @returns {import('react').ReactElement} the SVG element.
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
     * Render one inline Remix icon seat (path + size) for the components.
     * @param {{ path: string, size?: number }} props - icon props.
     * @returns {import('react').ReactElement} the SVG element.
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

    /** Authenticated exact routes registered by the Host half. */
    const RAW_ROUTE = browserRoute(ROUTES.sessionArtifactsRaw)
    const PREVIEW_ROUTE = browserRoute(ROUTES.sessionArtifactsPreview)

    /** The bundle's npm package name: configuration slot key and settings identity. */
    const PACKAGE_NAME = '@zephinel/dsh-power-suite'

    /**
     * The documented test seams installed by the browser harness before load;
     * production never defines them.
     * @typedef {object} InterruptedTestHook
     * @property {(sessionId: string, patch: Record<string, unknown>) => unknown} set
     * @property {(sessionId: string) => void} clear
     * @property {(sessionId: string) => unknown} record
     * @property {() => void} sync
     *
     * @typedef {object} PowerSuiteTestHooks
     * @property {InterruptedTestHook} [interruptedSessions]
     * @property {{ debugFallbackScanProbe: () => unknown }} [uiAnnotation]
     * @property {{ probe: () => unknown }} [sidebarWidth]
     */
    /**
     * The browser global plus the optional end-to-end test seams installed by
     * the browser harness before load; production never defines them.
     * @type {typeof globalThis & {
     *   __POWER_SUITE_TEST_HOOKS__?: Record<string, Record<string, unknown>> & PowerSuiteTestHooks
     * }}
     */
    const testHookHost = globalThis













    //#region feature: settings — page
    //
    // The Host-backed settings store and the Plugins-page section live in
    // `src/browser/settings/{store,page}.ts`: the entry creates one store with
    // the app URL builder and hands it to the page installer. Copy, CSS, slot
    // key and the shared snapshot behavior are unchanged; this region is a
    // wiring point.
    const settingsStore = createSettingsStore({ appUrl })
    const settingsPage = createSettingsPage({
      React,
      store: settingsStore,
      packageName: PACKAGE_NAME
    })
    //#endregion

    //#region feature: interrupted sessions
    //
    // The store, decorator, copy, icons, stylesheet and seats live in
    // `src/browser/interrupted-sessions/{state,install,components}.ts`: the
    // entry only binds the React runtime, the inline icon seat and the app URL
    // builder. Storage key, DOM markers, slot ids/order and copy are unchanged;
    // this region is a wiring point.
    const interruptedSessions = createInterruptedSessionsFeature({
      React,
      RemixIcon,
      appUrl
    })
    //#endregion

    //#region feature: composer image gallery
    //
    // The gallery store, capture interceptor, overlay component, copy, icons
    // and stylesheet live in `src/browser/composer-gallery/**`: the entry only
    // binds the React runtime and the inline glyph builder, then installs the
    // overlay in `apply`. Slot id, DOM markers and behavior are unchanged; this
    // region is a wiring point.
    const composerGallery = createComposerImageGallery({ React, RemixGlyph })
    //#endregion

    //#region feature: draft attachment memory
    //
    // The capture/restore seat and its page-lifetime File cache live in
    // `src/browser/draft-attachments/install.ts`: the entry only binds the
    // React runtime and installs the seat in `apply`. Seat id/order, storage
    // bounds and behavior are unchanged; this region is a wiring point.
    const draftAttachments = createDraftAttachmentMemory({ React })
    //#endregion

    //#region feature: prompt history
    //
    // The invisible composer seat, its keydown capture and the Host reader live
    // in `src/browser/prompt-history/seat.ts`: the entry only binds the React
    // runtime, the app URL builder and the shared settings store, then installs
    // the seat in `apply`. Slot id/order and behavior are unchanged; this
    // region is a wiring point.
    const promptHistory = createPromptHistorySeat({
      React,
      appUrl,
      settings: settingsStore
    })
    //#endregion

    //#region feature: dynamic workspaces
    //
    // The controller lives in `src/browser/dynamic-workspaces/install.ts`: the
    // entry only creates the per-factory instance with the runtime modules and
    // cross-feature seats it owns (React, the shell primitives, the settings and
    // interruption stores, and the app URL builder), then installs it with the
    // client ctx in `apply`. DOM markers, storage keys, copy and slots are
    // unchanged; this region is a wiring point.
    const dynamicWorkspacesInstaller = createDynamicWorkspacesInstaller({
      React,
      ReactDOM,
      uiPrimitives,
      RemixGlyph,
      RemixIcon,
      StateDot,
      appUrl,
      subscribeSettings: settingsStore.subscribe,
      settingsSnapshot: settingsStore.snapshot,
      subscribeInterrupted: interruptedSessions.store.subscribeInterrupted,
      interruptedVersion: interruptedSessions.store.interruptedVersion,
      interruptedRecord: interruptedSessions.store.interruptedRecord,
      ensureInterrupted: interruptedSessions.store.ensureInterrupted,
      watchInterrupted: interruptedSessions.store.watchInterrupted,
      refreshInterrupted: interruptedSessions.store.refreshInterrupted,
      requestContinue: interruptedSessions.store.requestContinue,
      remixPlayFill: interruptedSessions.remixPlayFill,
      remixWarningFill: interruptedSessions.remixWarningFill,
      interruptedNamespace: interruptedSessions.namespace,
      testHookHost
    })
    //#endregion

    //#region feature: native session hover figures — retired
    //
    // The shell's session-info hover card used to be extended through a
    // `sidebar.session.row.hover` registration in
    // `src/browser/native-session-hover-figures/`. DSH 0.2.2 changed that card's
    // DOM and the seat stopped mounting, so the registration, its module and its
    // DOM anchor were removed: the plugin shows the figures on its own hover card
    // (the Running & recent rows) and leaves the shell's card untouched.
    //#endregion

    //#region feature: prompt history — preview
    //
    // The composer-docked rail lives in
    // `src/browser/prompt-history/preview.ts`: the entry only binds the React
    // runtime, the portal bridge, the inline glyph builder and the Host prompt
    // reader it already owns, then installs the dock seat in `apply`. Copy,
    // stylesheet, DOM markers, geometry and portals stay unchanged; this region
    // is a wiring point.
    const { installPromptHistoryPreview } = createPromptHistoryPreview({
      React,
      ReactDOM,
      RemixGlyph,
      readPromptHistoryEntries: promptHistory.readPromptHistoryEntries
    })
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
    //
    // Copy dictionaries live in `src/browser/ui-annotation/copy.ts` alongside the
    // pure annotation modules so tests and the text fence import them directly.

    /**
     * Long-lived bridge to the mounted Composer seat.
     *
     * The annotation surface renders outside the Session-scope slot tree and has
     * no Session list face on its own context, so the seat — which is a real
     * Session-scoped slot and therefore receives the `useSessions` standard hook —
     * mirrors the current Session's `cwd` here. Everything is all-or-nothing: the
     * Session id only exists while the seat's insertion actions do.
     */
    /** @type {import('./browser/ui-annotation/types.ts').AnnotationBridge} */
    const annotationBridge = { sessionId: null, inputActions: null, sessionCwd: null }

    // Remix Icon path data (Apache-2.0, https://remixicon.com), inlined so the
    // mode needs no icon package at runtime.
    const REMIX_FOCUS_3_LINE = 'M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4ZM12 8C14.2091 8 16 9.79086 16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8Z'
    const REMIX_CLOSE_LINE = 'M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z'
    const REMIX_ARROW_UP_LINE = 'M13.0001 7.82843V20H11.0001V7.82843L5.63614 13.1924L4.22192 11.7782L12.0001 4L19.7783 11.7782L18.3641 13.1924L13.0001 7.82843Z'
    const REMIX_ARROW_DOWN_LINE = 'M13.0001 16.1716L18.3641 10.8076L19.7783 12.2218L12.0001 20L4.22192 12.2218L5.63614 10.8076L11.0001 16.1716V4H13.0001V16.1716Z'
    const REMIX_DELETE_BIN_LINE = 'M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z'
    const REMIX_LIST_CHECK_2 = 'M11 4H21V6H11V4ZM11 8H17V10H11V8ZM11 14H21V16H11V14ZM11 18H17V20H11V18ZM3 4H9V10H3V4ZM5 6V8H7V6H5ZM3 14H9V20H3V14ZM5 16V18H7V16H5Z'
    // Remix Icon `settings-line` (hexagon + ring), Apache-2.0,
    // https://remixicon.com/icon/settings-line — inlined so the rail needs no
    // icon package at runtime.
    const REMIX_INFORMATION_LINE = 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 7H13V9H11V7ZM11 11H13V17H11V11Z'

    const REMIX_ANNOTATION_COPY_LINE = 'M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z'

    //#endregion



    /** The annotation React surface, built once with the entry's glyph + icons. */
    const annotationComponents = createAnnotationComponents({
      React: /** @type {typeof import('react')} */ (React),
      glyph: /** @type {(path: string, size?: number, className?: string, scale?: number) => import('react').ReactElement} */ (RemixGlyph),
      icons: {
        focus: REMIX_FOCUS_3_LINE,
        close: REMIX_CLOSE_LINE,
        arrowUp: REMIX_ARROW_UP_LINE,
        arrowDown: REMIX_ARROW_DOWN_LINE,
        delete: REMIX_DELETE_BIN_LINE,
        listCheck: REMIX_LIST_CHECK_2,
        information: REMIX_INFORMATION_LINE,
        annotationCopy: REMIX_ANNOTATION_COPY_LINE,
        fileCopy: REMIX_FILE_COPY_LINE,
        link: REMIX_LINK
      }
    })

    /** The per-factory annotation installer (install guard + controller + seats). */
    const uiAnnotationInstaller = createUiAnnotationInstaller({
      React: /** @type {typeof import('react')} */ (React),
      components: annotationComponents,
      copy: { en: ANNOTATION_EN, zh: ANNOTATION_ZH },
      bridge: annotationBridge
    })

    //#endregion


    //#region feature: update check
    //
    // The controller, card and `shell.overlay` registration live in
    // `src/browser/update-check/install.ts`: the entry only binds the React
    // runtime, the app URL builder, the Host route and this bundle's package
    // name, then installs it in `apply`. Copy, stylesheet, storage key, slot id
    // and the additive overlay-only rendering stay unchanged; this region is a
    // wiring point.
    const { installUpdatePrompt } = createUpdateCheck({
      React,
      appUrl,
      updateRoute: ROUTES.update,
      packageName: PACKAGE_NAME
    })
    //#endregion

    //#region feature: sidebar width
    //
    // Durable, Host-synced left sidebar width. The stateful controller and its
    // runtime live in `src/browser/sidebar-width/install.ts`; the entry only
    // creates the per-factory instance and hands it the app URL builder. That
    // typed module owns attach/detach, drag capture, the browser cache, Host
    // sync/adoption/reopen and the read-only E2E probe, so this region stays a
    // wiring point.
    const sidebarWidthController = createSidebarWidthController({ appUrl })
    //#endregion

    //#region feature: session artifacts — Files-header action
    //
    // The panel, the source filter, the Files-header toggle and the URL and
    // clipboard helpers live in `src/browser/artifacts/**`: the entry only
    // binds the React runtime and the inline glyph builder, then installs the
    // action in `apply`. Copy, CSS, DOM markers and slot ids are unchanged;
    // this region is a wiring point.
    const artifactsFeature = createArtifactsComponents({
      React,
      ReactDOM,
      RemixGlyph
    })
    //#endregion

    //#region feature: workspace default presets
    //
    // The menu contribution and the new-Session routing patch live in
    // `src/browser/workspace-presets/install.ts`: the entry only binds the
    // React runtime for the menu icon and passes the app URL builder, then
    // installs both in `apply`. Copy, menu ids and patch behavior are unchanged;
    // this region is a wiring point.
    const workspacePresets = createWorkspacePresets({ React })
    //#endregion



    //#region plugin
    /**
     * Register dictionaries, the page type, and its Session-scoped body.
     * @param {DshClientContext} ctx - client root context.
     * @returns {void}
     */
    function apply(ctx) {
      const t = ctx.locale.bind(ARTIFACTS_NS)
      // Documented test seam: seed/settle one interrupted record and re-sync the
      // native row decoration, so the E2E can exercise the interrupted-idle,
      // continued-running and completed phases without sending a real Continue.
      const testHooks = testHookHost.__POWER_SUITE_TEST_HOOKS__
      if (testHooks !== null && typeof testHooks === 'object') {
        testHooks.interruptedSessions = {
          set: (sessionId, patch) => {
            interruptedSessions.store.setInterruptedRecord(sessionId, { status: 'ready', interrupted: false, running: false, ...patch })
            interruptedSessions.store.syncInterruptedRows()
            return interruptedSessions.store.interruptedRecord(sessionId)
          },
          clear: (sessionId) => {
            interruptedSessions.store.interruptedStore.records.delete(sessionId)
            interruptedSessions.store.syncInterruptedRows()
          },
          record: (sessionId) => interruptedSessions.store.interruptedRecord(sessionId),
          sync: () => interruptedSessions.store.syncInterruptedRows()
        }
      }
      artifactsFeature.installArtifacts(/** @type {DshModuleContext<import('./browser/artifacts/panel.ts').ArtifactsContext>} */ (ctx))
      workspacePresets.installWorkspacePresetMenu(/** @type {import('./browser/workspace-presets/install.ts').WorkspacePresetsContext} */ (ctx), appUrl)
      workspacePresets.installWorkspacePresetRouting(/** @type {import('./browser/workspace-presets/install.ts').WorkspacePresetsContext} */ (ctx), appUrl)
      promptHistory.installPromptHistory(/** @type {DshModuleContext<import('./browser/prompt-history/seat.ts').PromptHistorySeatContext>} */ (ctx))
      installPromptHistoryPreview(/** @type {DshModuleContext<import('./browser/prompt-history/preview.ts').PromptHistoryPreviewContext>} */ (ctx))
      draftAttachments.installDraftAttachmentMemory(/** @type {DshModuleContext<import('./browser/draft-attachments/install.ts').DraftAttachmentContext>} */ (ctx))
      dynamicWorkspacesInstaller.install(/** @type {DshModuleContext<import('./browser/dynamic-workspaces/install.ts').DynamicWorkspacesContext>} */ (ctx))
      interruptedSessions.installInterruptedSessions(/** @type {DshModuleContext<import('./browser/interrupted-sessions/components.ts').InterruptedSessionComponentsContext>} */ (ctx))
      installQuickLook(/** @type {import('./browser/hover-quick-look/install.ts').HoverQuickLookContext} */ (ctx), {
        t,
        appUrl,
        rawRoute: RAW_ROUTE,
        previewRoute: PREVIEW_ROUTE,
        attachmentUrl: (attachment, disposition) => attachmentUrl(attachment, disposition, null),
        formatBytes,
        icons: { file: REMIX_FILE_LINE, open: REMIX_BOOK_OPEN_LINE, download: REMIX_DOWNLOAD_LINE }
      })
      settingsPage.installSettingsPage(/** @type {import('./browser/settings/page.ts').SettingsPageContext} */ (ctx))
      composerGallery.installComposerImageGallery(/** @type {import('./browser/composer-gallery/install.ts').ComposerGalleryContext} */ (ctx))
      installUpdatePrompt(/** @type {import('./browser/update-check/install.ts').UpdateCheckContext} */ (ctx))
      uiAnnotationInstaller.install(/** @type {import('./browser/ui-annotation/install.ts').UiAnnotationContext} */ (ctx))
      // The entry context is documented as a loose object; the sidebar module
      // declares the narrow slice it reads, so assert once at this boundary.
      sidebarWidthController.install(/** @type {import('./browser/sidebar-width/install.ts').SidebarWidthContext} */ (ctx))
    }

    // Test seam: the controller's deterministic fallback-scan probe is the only
    // diagnostic the browser E2E still needs (it proves the status cache does not
    // rescan the DOM). Every pure annotation model is imported from
    // `src/browser/ui-annotation/**` and unit-tested directly, so the retired
    // 112-key pass-through is not republished here. Production never defines the
    // flag, so this block is inert.
    if (typeof globalThis !== 'undefined'
      && typeof testHookHost.__POWER_SUITE_TEST_HOOKS__ === 'object'
      && testHookHost.__POWER_SUITE_TEST_HOOKS__ !== null) {
      testHookHost.__POWER_SUITE_TEST_HOOKS__.uiAnnotation = {
        debugFallbackScanProbe: () => uiAnnotationInstaller.debugFallbackScanProbe()
      }

      // Sidebar width: only the attach probe the browser E2E reads remains a
      // test hook; the pure decisions live in `src/browser/sidebar-width/model.ts`
      // and the controller in its `install.ts`, both covered directly. The
      // controller's `probe` is read-only.
      testHookHost.__POWER_SUITE_TEST_HOOKS__.sidebarWidth = { probe: sidebarWidthController.probe }
    }

    //#endregion

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'contextMenus', 'remote', 'remote.agentPresets', 'uiWorkspace', 'sessions'],
      apply
    }
  }
})
