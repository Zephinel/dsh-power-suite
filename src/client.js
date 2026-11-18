// @ts-nocheck — Phase 3 keeps the browser half out of the type gate while its entries are split into modules; see docs/plans/typescript-migration.md.
//
// The entry is an ES module: the build bundles it into the classic-script IIFE
// the DSH shell loads. Pure browser models live under src/browser/ and are
// imported here instead of being redefined inline.
import { installQuickLook } from './browser/hover-quick-look/install.ts'
import { createUpdateCheck } from './browser/update-check/install.ts'
import { createSidebarWidthController } from './browser/sidebar-width/install.ts'
import {
  ACTIVE_PROJECT_DAYS,
  DEFAULT_SETTINGS,
  PROMPT_HISTORY_MODIFIERS,
  RECENT_SESSION_MINUTES
} from './shared/protocol.ts'
import {
  filesArtifactsInitialState,
  filesArtifactsPhaseMs,
  filesArtifactsReduce
} from './browser/artifacts/model.ts'
import { interruptedCardMark, interruptedIndicatorActive } from './browser/interrupted-sessions/model.ts'
import {
  appUrl,
  artifactContentKind,
  artifactKey,
  artifactUrl,
  attachmentUrl,
  formatBytes,
  isImageArtifact,
  openArtifactPreview
} from './browser/artifacts/urls.ts'
import { copyArtifactContent, copyText } from './browser/artifacts/clipboard.ts'
import { ARTIFACTS_NS } from './browser/artifacts/copy.ts'
import { createArtifactsComponents } from './browser/artifacts/panel.ts'
import { createWorkspacePresets } from './browser/workspace-presets/install.ts'
import { REMIX_BOOK_OPEN_LINE, REMIX_DOWNLOAD_LINE, REMIX_FILE_COPY_LINE, REMIX_FILE_LINE, REMIX_LINK } from './browser/remix-icons.ts'
import { createInterruptedSessionComponents } from './browser/interrupted-sessions/components.ts'
import { createPromptHistoryPreview } from './browser/prompt-history/preview.ts'
import { mergeSettingsPayload } from './browser/settings/model.ts'
import { ROUTES, browserRoute } from './shared/routes.ts'
import {
  PSG_WHEEL_COOLDOWN_MS,
  PSG_WHEEL_STEP_PX,
  psgClampIndex,
  psgCollectImages,
  psgStepIndex,
  psgSyncState,
  psgWheelDecision
} from './browser/composer-gallery/model.ts'
import {
  MODIFIER_CHOICES,
  SETTINGS_STORAGE_KEY,
  modifierMatches,
  parseStoredSettings,
  resolveModifierChange,
  serializeSettings
} from './browser/ui-annotation/settings.ts'
import {
  annotationNormalizeQuoteText,
  normalizeUserNote,
  sanitizeAttributeName,
  sanitizeAttributeValue,
  sanitizeText,
  textDigest
} from './browser/ui-annotation/text.ts'
import {
  ANNOTATION_EMPTY_TEXT_DIGEST,
  annotationAncestorTagChain,
  annotationCopyAnchorDecision,
  annotationDescendantAncestorMatches,
  annotationEphemeralOutcome,
  annotationFallbackCacheKey,
  annotationFirstTextLeafDescendant,
  annotationFullXPathOf,
  annotationHasStrongIdentity,
  annotationJsPathFor,
  annotationRenderedTextOf,
  annotationScopeAuthorityOutcome,
  annotationScoreQuoteMatches,
  annotationStatusConfidence,
  annotationStatusLabelKey,
  annotationTextPositionOf,
  annotationTextQuoteOf,
  annotationXPathOf
} from './browser/ui-annotation/anchors.ts'
import {
  annotationRoutePath,
  annotationWorkspaceLabel,
  formatAnnotationTime,
  normalizeAnnotationBounds,
  sessionShortLabel
} from './browser/ui-annotation/format.ts'
import {
  ANNOTATION_DETAIL_SIZE,
  annotationSegmentDisplayLabel,
  annotationSegmentedIndex,
  clampDetailCardPosition,
  clampLauncherPosition,
  clampPopoverPosition,
  clampPopoverPositionToViewport,
  computeRailWidth,
  layoutModeFor
} from './browser/ui-annotation/geometry.ts'
import {
  ANNOTATION_MAX_ANCESTORS,
  annotationIsGeneratedClass,
  annotationLocatorText,
  annotationStableSelectorCandidate,
  annotationTagPath,
  buildElementRef,
  buildUniqueSelector,
  describeLocator,
  elementLabel,
  identityKeyOf,
  isDynamicValue,
  isFormTag
} from './browser/ui-annotation/identity.ts'
import {
  ANNOTATION_RECORD_LIMIT,
  ANNOTATION_RECORDS_STORAGE_KEY,
  annotationEntryOrdinals,
  annotationFilterEntries,
  annotationFindGroup,
  annotationFindRecord,
  annotationFlattenRecords,
  annotationGroupFromSelection,
  annotationGroupItems,
  annotationIsGroup,
  annotationMarkerBadgeText,
  annotationScopeCounts,
  annotationSelectedEntries,
  annotationSidebarCounts,
  annotationTotalItemCount,
  annotationUndoRemove,
  annotationUndoRemoveMany,
  collectionAddGroup,
  collectionClear,
  parseAnnotationStore,
  serializeAnnotationStore
} from './browser/ui-annotation/records.ts'
import {
  createAnnotationState,
  reduceAnnotationState
} from './browser/ui-annotation/reducer.ts'
import {
  annotationResolveStatus,
  resolveNodeCandidate
} from './browser/ui-annotation/resolution.ts'
import {
  ANNOTATION_CHIP_CANDIDATE_LIMIT,
  ANNOTATION_CHIP_SOURCE,
  annotationChipCandidates,
  annotationChipRefBatch,
  annotationChipRefOf,
  batchScopeSplit,
  parseAnnotationChipRef,
  serializeAnnotationChip,
  serializeBatchEntries,
  serializeQuickReference
} from './browser/ui-annotation/serializers.ts'
import {
  annotationLeafPickIndex,
  annotationRailRightForPane,
  annotationSurfaceLevels,
  annotationSurfacePinEligible,
  annotationSurfacePinEventMatches,
  annotationSurfaceRoot,
  bindAnnotationSurfaceDefaults
} from './browser/ui-annotation/surface.ts'
import { ANNOTATION_CSS } from './browser/ui-annotation/styles.ts'
import { createAnnotationComponents } from './browser/ui-annotation/components.ts'
import { createUiAnnotationInstaller } from './browser/ui-annotation/install.ts'
import { createAnnotationController } from './browser/ui-annotation/controller.ts'
import {
  ANNOTATION_CHIP_ORDER,
  ANNOTATION_CHIP_TRIGGER,
  ANNOTATION_NS,
  ANNOTATION_OVERLAY_ID,
  ANNOTATION_SEAT_ID
} from './browser/ui-annotation/constants.ts'
import {
  ANNOTATION_LAUNCHER_SIZE,
  ANNOTATION_POPOVER_SIZE,
  annotationAccessibleName,
  annotationBoxCandidateElements,
  annotationCandidateChain,
  annotationDescriptorOf,
  annotationElementVisible,
  annotationEventElement,
  annotationFocusComposer,
  annotationInsertLabels,
  annotationLayoutFrame,
  annotationMeasureSidebarWidths,
  annotationRectOf,
  annotationResolveNode,
  annotationViewport
} from './browser/ui-annotation/dom.ts'
import { annotationReadStorage, annotationWriteStorage } from './browser/ui-annotation/storage.ts'
import {
  dwNeedsProjectionRead,
  dwProjectionSections
} from './browser/dynamic-workspaces/stats.ts'
import { DW_NS, createDynamicWorkspacesInstaller } from './browser/dynamic-workspaces/install.ts'
import { createNativeSessionHoverFigures } from './browser/native-session-hover-figures/install.ts'
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

    /** Authenticated exact routes registered by the Host half. */
    const RAW_ROUTE = browserRoute(ROUTES.sessionArtifactsRaw)
    const ATTACHMENT_ROUTE = browserRoute(ROUTES.sessionArtifactsAttachment)
    const PREVIEW_ROUTE = browserRoute(ROUTES.sessionArtifactsPreview)

    /** The bundle's npm package name: configuration slot key and settings identity. */
    const PACKAGE_NAME = '@zephinel/dsh-power-suite'

    /**
     * The browser global plus the optional end-to-end test seam installed by the
     * browser harness before load; production never defines it.
     * @type {typeof globalThis & { __POWER_SUITE_TEST_HOOKS__?: Record<string, object> }}
     */
    const testHookHost = globalThis










    //#region feature: prompt history
    /** Seat identity of the composer overlay registration. */
    const PROMPT_HISTORY_SEAT = 'power-suite.prompt-history'

    /** Host route returning one Session's complete sent-prompt history. */
    const PROMPT_HISTORY_ROUTE = browserRoute(ROUTES.promptHistoryList)

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
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
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
    const SETTINGS_ROUTE = browserRoute(ROUTES.settings)

    const SETTINGS_EN = {
      'history.group': 'Prompt history',
      'history.groupHint': 'Hold the chosen modifier and press ↑ or ↓ in the composer to switch between prompts already sent in this session. Plain arrows keep their normal editing behavior, including inside a recalled multi-line prompt. Primary is ⌘ on macOS and Ctrl on Windows and Linux; Alt is ⌥ on macOS and Alt on Windows and Linux.',
      'history.label': 'Shortcut modifier',
      'history.current': 'Current shortcut: {shortcut}',
      'modifier.primary': '⌘ / Ctrl',
      'modifier.alt': '⌥ / Alt',
      'modifier.ctrl': '⌃ / Ctrl',
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
      'modifier.ctrl': '⌃ / Ctrl',
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

    /** @typedef {import('./shared/protocol.ts').Settings} Settings */
    /** @typedef {import('./shared/protocol.ts').SettingsPatch} SettingsPatch */
    /** @typedef {'promptHistoryModifier' | 'recentSessionMinutes' | 'activeProjectDays'} SettingsField */
    /** @typedef {{ status: 'loading' | 'ready' | 'error', value: Settings }} SettingsSnapshot */

    /**
     * Host-backed settings shared by the page and the composer key handler.
     * @type {{ snapshot: SettingsSnapshot, listeners: Set<Function>, loading: Promise<void> | null }}
     */
    const settingsStore = {
      snapshot: { status: 'loading', value: { ...DEFAULT_SETTINGS } },
      listeners: new Set(),
      loading: null
    }

    /**
     * Read the current shared settings snapshot.
     * @returns {SettingsSnapshot} the snapshot.
     */
    function settingsSnapshot() {
      return settingsStore.snapshot
    }

    /**
     * Subscribe to settings changes.
     * @param {() => void} listener - change callback.
     * @returns {() => void} unsubscribe.
     */
    function subscribeSettings(listener) {
      settingsStore.listeners.add(listener)
      return () => {
        settingsStore.listeners.delete(listener)
      }
    }

    /**
     * Publish one new settings snapshot.
     * @param {SettingsSnapshot} snapshot - next snapshot.
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
     * @returns {Settings} current settings.
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
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
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
       * @param {SettingsPatch} patch - recognized fields to write.
       * @param {SettingsField} field - field the patch changes.
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
        className: 'dps-choice-option psf-rainbow-focus',
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
        className: 'dps-choice-option psf-rainbow-focus',
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
        className: 'dps-choice-option psf-rainbow-focus',
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
    const INTERRUPTED_ROUTE = browserRoute(ROUTES.interrupted)
    /** Host SSE route broadcasting turn-boundary interruptions. */
    const INTERRUPTED_EVENTS_ROUTE = browserRoute(ROUTES.interruptedEvents)
    /** Host route resuming one Session through a non-human context message. */
    const CONTINUE_ROUTE = browserRoute(ROUTES.continue)

    const INTERRUPTED_EN = {
      'badge.aria': 'Task did not finish',
      'badge.title': 'The last task did not finish. Hover this session to continue it.',
      'badge.title.subagent': 'A delegated subagent task did not finish. Hover this session to continue it.',
      'continue.aria': 'Continue the unfinished task',
      'continue.prompt': 'Continue the unfinished task.',
      'continue.summary': 'Continue unfinished task',
      'continue.failed': 'Could not continue the task. Try again.'
    }
    const INTERRUPTED_ZH = {
      'badge.aria': '任务未完成',
      'badge.title': '上一个任务未完成，悬停此会话可继续。',
      'badge.title.subagent': '委派的子任务未完成，悬停此会话可继续。',
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
     * @param {() => void} listener - change callback.
     * @returns {() => void} unsubscribe.
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
     * @returns {import('./browser/interrupted-sessions/model.ts').InterruptedRecord | null} the record, when known.
     */
    function interruptedRecord(sessionId) {
      return interruptedStore.records.get(sessionId) ?? null
    }

    /**
     * Queue one Host read unless the Session is already known or loading.
     * @param {string} sessionId - Session identity.
     * @param {{ force?: boolean, refreshHost?: boolean }} options - force bypasses the cache; refreshHost asks the Host to recompute.
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
     * @param {boolean} refreshHost - also send `refresh=1` when forced.
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
     * Optimistically settle the record right after a Continue request succeeds:
     * the interruption is being resumed, so the badge/CTA disappears and the row
     * is running until the Host's next answer reconciles the record.
     * @param {string} sessionId - Session identity.
     * @returns {void}
     */
    function markContinued(sessionId) {
      const existing = interruptedRecord(sessionId) ?? {}
      setInterruptedRecord(sessionId, { ...existing, status: 'ready', interrupted: false, running: true })
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
     * @returns {() => void} unwatch.
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
.dps-row-continue svg{display:block;flex:none}
.dps-row-continue:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);color:var(--dsw-alias-label-primary)}
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
    //#endregion

    /**
     * Build one standalone inline Remix icon for dynamically decorated rows
     * (the same 14 px markup the React slot path renders).
     * @param {string} path - Remix icon path data.
     * @returns {SVGElement} the icon.
     */
    function interruptedDecorIcon(path) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', '14')
      svg.setAttribute('height', '14')
      svg.setAttribute('fill', 'currentColor')
      svg.setAttribute('aria-hidden', 'true')
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      shape.setAttribute('d', path)
      svg.appendChild(shape)
      return svg
    }

    /**
     * Build one standalone warning icon element for dynamically decorated rows.
     * @returns {SVGElement} the icon.
     */
    function interruptedDecorBadgeIcon() {
      return interruptedDecorIcon(REMIX_WARNING_FILL)
    }

    /**
     * Build the dynamic Continue CTA for a native row the shell still renders as
     * running.
     *
     * It mirrors the `InterruptedBadge` slot markup (`span.dps-row-continue-slot`
     * around `button.dps-row-continue`) so the existing reveal CSS applies on
     * both paths, and its click goes through the shared {@link requestContinue}
     * handshake: this decoration never sends a continuation itself.
     * @param {Function} t - interrupted-feature translate.
     * @param {string} sessionId - Session identity.
     * @returns {HTMLSpanElement} the Continue slot.
     */
    function interruptedDecorContinueSlot(t, sessionId) {
      const slot = document.createElement('span')
      slot.className = 'dps-row-continue-slot'
      slot.setAttribute('data-dynamic-continue', 'true')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dps-row-continue'
      button.title = t('continue.aria')
      button.setAttribute('aria-label', t('continue.aria'))
      button.appendChild(interruptedDecorIcon(REMIX_PLAY_FILL))
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        // Resolve the Session from the live row at click time: a native row element
        // is the shell's to reuse, so the captured id is only the fallback.
        const row = button.closest('[data-row-key^="session:"]')
        const key = row === null ? '' : row.getAttribute('data-row-key') ?? ''
        const target = key.startsWith('session:') ? key.slice('session:'.length) : ''
        requestContinue(target.length > 0 ? target : sessionId)
      })
      slot.appendChild(button)
      return slot
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
     * and no leading slot. This decoration places the warning badge AND its hover
     * Continue CTA in that native leading span and hides the stale spinner, so the
     * interrupted state is visible immediately after a reconnect rather than after
     * opening the Session. Both injected parts carry their own marker attributes
     * so the slot path's markup is never mistaken for this decoration.
     * @returns {void}
     */
    function syncInterruptedRows() {
      const t = interruptedRuntime.t
      if (t === null) return
      for (const [sessionId, record] of interruptedStore.records) {
        const row = document.querySelector(`[data-row-key="session:${escapeSelectorValue(sessionId)}"]`)
        if (row === null) continue
        const interrupted = interruptedIndicatorActive(record)
        if (interrupted !== true) {
          row.removeAttribute('data-power-suite-interrupted')
          for (const element of row.querySelectorAll('[data-dynamic-badge="true"], [data-dynamic-continue="true"]')) element.remove()
          continue
        }
        row.setAttribute('data-power-suite-interrupted', '')
        // The rainbow-atmosphere wrapper is injected as the row's first child; the
        // stale-spinner badge and its Continue CTA must land in the native leading
        // cell instead, never inside the atmosphere layer.
        const leading = [...row.children].find((child) => !child.hasAttribute('data-psd-atmos')) ?? null
        if (leading === null) continue
        // A row the shell renders as idle mounts the custom leading slot, which
        // owns the same badge + Continue pair. Keep that pair and drop dynamic
        // leftovers from an earlier running render (a row can move from running to
        // idle between two syncs).
        const persistent = [...row.querySelectorAll('.dps-row-interrupted')]
          .find((badge) => badge.getAttribute('data-dynamic-badge') !== 'true')
        if (persistent !== undefined) {
          for (const element of row.querySelectorAll('[data-dynamic-badge="true"], [data-dynamic-continue="true"]')) element.remove()
          continue
        }
        let badge = leading.querySelector('.dps-row-interrupted[data-dynamic-badge="true"]')
        if (badge === null) {
          badge = document.createElement('span')
          badge.className = 'dps-row-interrupted'
          badge.setAttribute('data-dynamic-badge', 'true')
          badge.setAttribute('role', 'img')
          badge.appendChild(interruptedDecorBadgeIcon())
          leading.insertBefore(badge, leading.firstChild)
        }
        for (const duplicate of [...leading.querySelectorAll('.dps-row-interrupted[data-dynamic-badge="true"]')]) {
          if (duplicate !== badge) duplicate.remove()
        }
        const badgeAria = t('badge.aria')
        if (badge.getAttribute('aria-label') !== badgeAria) badge.setAttribute('aria-label', badgeAria)
        const badgeTitle = record.subagent === true ? t('badge.title.subagent') : t('badge.title')
        if (badge.getAttribute('title') !== badgeTitle) badge.setAttribute('title', badgeTitle)
        const continueLabel = t('continue.aria')
        let slot = leading.querySelector('.dps-row-continue-slot[data-dynamic-continue="true"]')
        if (slot === null) {
          slot = interruptedDecorContinueSlot(t, sessionId)
          leading.insertBefore(slot, badge.nextSibling)
        }
        for (const duplicate of [...leading.querySelectorAll('.dps-row-continue-slot[data-dynamic-continue="true"]')]) {
          if (duplicate !== slot) duplicate.remove()
        }
        const button = slot.querySelector('.dps-row-continue')
        if (button !== null) {
          if (button.getAttribute('title') !== continueLabel) button.title = continueLabel
          if (button.getAttribute('aria-label') !== continueLabel) button.setAttribute('aria-label', continueLabel)
        }
      }
      for (const row of document.querySelectorAll('[data-row-key^="session:"][data-power-suite-interrupted]')) {
        const key = row.getAttribute('data-row-key')
        if (key === null) continue
        const sessionId = key.slice('session:'.length)
        const record = interruptedStore.records.get(sessionId)
        if (interruptedIndicatorActive(record)) continue
        row.removeAttribute('data-power-suite-interrupted')
        for (const element of row.querySelectorAll('[data-dynamic-badge="true"], [data-dynamic-continue="true"]')) element.remove()
      }
    }

    //#region feature: interrupted sessions — components
    //
    // Both seats and their installer live in
    // `src/browser/interrupted-sessions/components.ts`: the entry only binds the
    // shared store, the continue handshake boxes, the row helpers and the copy
    // dictionaries it already owns, then installs the seats in `apply`. Props,
    // DOM markers, effects, slot ids/order and copy stay unchanged; this region
    // is a wiring point.
    const { installInterruptedSessions } = createInterruptedSessionComponents({
      React,
      RemixIcon,
      remixWarningFill: REMIX_WARNING_FILL,
      remixPlayFill: REMIX_PLAY_FILL,
      requestContinue,
      useInterruptedRecord,
      escapeSelectorValue,
      appUrl,
      continueRoute: CONTINUE_ROUTE,
      rememberContinueTime,
      markContinued,
      refreshInterrupted,
      subscribeInterrupted,
      discoverInterruptedRows,
      syncInterruptedRows,
      refreshAllInterrupted,
      loadContinueTimes,
      interruptedNamespace: INTERRUPTED_NS,
      interruptedEn: INTERRUPTED_EN,
      interruptedZh: INTERRUPTED_ZH,
      interruptedCss: INTERRUPTED_CSS,
      interruptedEventsRoute: INTERRUPTED_EVENTS_ROUTE,
      interruptedStore,
      interruptedRuntime,
      continueRequest,
      continueRuntime
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
      subscribeSettings,
      settingsSnapshot,
      subscribeInterrupted,
      interruptedVersion,
      interruptedRecord,
      ensureInterrupted,
      watchInterrupted,
      refreshInterrupted,
      requestContinue,
      remixPlayFill: REMIX_PLAY_FILL,
      remixWarningFill: REMIX_WARNING_FILL,
      interruptedNamespace: INTERRUPTED_NS,
      testHookHost
    })
    //#endregion

    //#region feature: native session hover figures
    //
    // The seat and its registration live in
    // `src/browser/native-session-hover-figures/install.ts`: the entry only binds
    // the React runtime and the section/projection helpers the dynamic-Workspaces
    // installer already owns, then installs it in `apply`. DOM markers, slot id,
    // copy and ordering stay unchanged; this region is a wiring point.
    const { installSessionHoverFigures } = createNativeSessionHoverFigures({
      React,
      hovercardSections: dynamicWorkspacesInstaller.hovercardSections,
      projectionSections: dwProjectionSections,
      needsProjectionRead: dwNeedsProjectionRead,
      namespace: DW_NS
    })
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
      readPromptHistoryEntries
    })
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
      'settings.open': 'Modifier settings',
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
      'status.unverifiableWeak': 'Unverifiable · weak identity',
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
      'popover.copyXPath': 'Copy XPath',
      'popover.copyJsPath': 'Copy JS path',
      'popover.copyFullXPath': 'Copy full XPath',
      'via.css': 'locator',
      'via.xpath': 'XPath',
      'via.text-quote': 'text anchor',
      'via.text-position': 'text position',
      'popover.ephemeralHint': 'Transient surface: kept open while you edit this annotation; it may disappear after the popover closes (the locator is kept).',
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
      'chip.remove': 'Remove reference',
      'chip.removeHint': 'Remove this reference chip (one undo step)',
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
      'modifier.ctrl': '⌃ / Ctrl',
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
      'feedback.copyXPathSuccess': 'XPath copied',
      'feedback.copyJsPathSuccess': 'JS path copied',
      'feedback.copyXPathFailed': 'XPath unavailable for this target',
      'feedback.copyJsPathFailed': 'JS path unavailable for this target',
      'feedback.copyXPathSaved': 'Copied saved XPath (target not live)',
      'feedback.copyJsPathSaved': 'Copied saved JS path (target not live)',
      'feedback.copyFullXPathSuccess': 'Full XPath copied',
      'feedback.copyFullXPathFailed': 'Full XPath needs a live target',
      'feedback.locatorCopyFailed': 'Could not copy the locator',
      'feedback.chipInserted': 'Inserted as a reference chip (not sent)',
      'feedback.chipRemoveFailed': 'Could not remove that reference chip',
      'feedback.chipBatchInserted': 'Inserted one batch reference chip (not sent)',
      'feedback.chipFallback': 'Reference chips unavailable here; inserted as plain text',
      'feedback.chipMissing': 'This reference\'s annotation is no longer available',
      'feedback.selectedDeleted': 'Selected annotations deleted',
      'feedback.marked': 'Marked · {count} total',
      'feedback.groupAdded': 'Group saved · {count} elements',
      'batch.title': '{count} elements selected',
      'batch.requirement': 'Requirement (shared by all selected elements)',
      'batch.hint': 'One requirement for the whole selection; each element keeps its own locator.',
      'batch.saveGroup': 'Save as group',
      'batch.clear': 'Clear selection',
      'insert.groupHeader': 'Group',
      'insert.groupRequirement': 'Requirement:',
      'insert.groupReference': 'Element:',
      'insert.itemsCountLabel': 'items',
      'sidebar.title': 'Annotations',
      'sidebar.subtitle': 'Manage single annotations and batch groups together.',
      'sidebar.hint': 'Click an element to annotate it · {passThrough}-click keeps the page usable · {multi}-click adds to the selection.',
      'sidebar.filter.all': 'All',
      'sidebar.filter.single': 'Singles',
      'sidebar.type.single': 'Single',
      'sidebar.type.group': 'Group',
      'sidebar.filter.group': 'Groups',
      'sidebar.groupBadge': 'Group · {count} items',
      'sidebar.groupUntitled': 'Untitled group',
      'sidebar.updated': 'Updated {time}',
      'sidebar.page': 'Page',
      'sidebar.area': 'Area',
      'sidebar.selector': 'Selector',
      'sidebar.addAnnotation': 'Add annotation',
      'sidebar.clearSelection': 'Clear selection',
      'sidebar.clearCollection': 'Clear collection',
      'sidebar.cancelAnnotation': 'Cancel Annotation',
      'exitConfirm.title': 'Clear annotations and exit?',
      'exitConfirm.message': 'Exit annotation mode and clear {count} annotations? These will not be kept for the next session.',
      'exitConfirm.cancel': 'Cancel',
      'exitConfirm.clear': 'Clear & exit',
      'sidebar.emptyTitle': 'No annotations yet',
      'sidebar.emptyHint': 'Select an element on the page to add your first annotation.',
      'sidebar.filterEmpty': 'Nothing matches this filter.',
      'sidebar.addHint': 'Switch to the page and select elements to annotate.',
      'sidebar.edit': 'Edit annotation',
      'sidebar.delete': 'Delete annotation',
      'sidebar.insert': 'Insert reference',
      'sidebar.include': 'Include in batch',
      'sidebar.total': '{count} total',
      'collection.groupBadge': 'Batch',
      'collection.groupCount': '{count} items',
      'collection.groupUntitled': 'Untitled batch',
      'collection.groupPreview': 'Show items',
      'collection.groupRequirementPlaceholder': 'Requirement shared by all items',
      'collection.groupEditorTitle': 'Batch requirement · {count} items',
      'collection.collapse': 'Collapse',
      'collection.expand': 'Expand',
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
      'settings.open': '修饰键设置',
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
      'status.unverifiableWeak': '无法验证 · 弱身份',
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
      'popover.copyXPath': '复制 XPath',
      'popover.copyJsPath': '复制 JS 路径',
      'popover.copyFullXPath': '复制完整 XPath',
      'via.css': '定位器',
      'via.xpath': 'XPath',
      'via.text-quote': '文本锚点',
      'via.text-position': '文本位置',
      'popover.ephemeralHint': '瞬态浮层：编辑这条标注期间会保持打开；关闭气泡后该浮层可能消失（定位信息会保留）。',
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
      'chip.remove': '移除引用',
      'chip.removeHint': '移除这个引用控件（可撤销一步）',
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
      'modifier.ctrl': '⌃ / Ctrl',
      'modifier.meta': '⌘ / Meta',
      'modifier.shift': '⇧ / Shift',
      'feedback.copyXPathSuccess': '已复制 XPath',
      'feedback.copyJsPathSuccess': '已复制 JS 路径',
      'feedback.copyXPathFailed': '该目标没有可用的 XPath',
      'feedback.copyJsPathFailed': '该目标没有可用的 JS 路径',
      'feedback.copyXPathSaved': '已复制保存的 XPath（目标当前不在页面）',
      'feedback.copyJsPathSaved': '已复制保存的 JS 路径（目标当前不在页面）',
      'feedback.copyFullXPathSuccess': '已复制完整 XPath',
      'feedback.copyFullXPathFailed': '完整 XPath 需要目标仍在页面',
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
      'feedback.chipRemoveFailed': '无法移除该引用控件',
      'feedback.chipBatchInserted': '已插入批量引用控件（未发送）',
      'feedback.chipFallback': '此处不支持引用控件，已插入纯文本',
      'feedback.chipMissing': '该引用对应的标注已不存在',
      'feedback.selectedDeleted': '已删除选中的标注',
      'feedback.marked': '已标记 · 共 {count} 条',
      'feedback.groupAdded': '已保存为分组 · {count} 个元素',
      'batch.title': '已选择 {count} 个元素',
      'batch.requirement': '要求（所选元素共用）',
      'batch.hint': '整批元素共用一条要求；每个元素仍保留自己的定位信息。',
      'batch.saveGroup': '保存为分组',
      'batch.clear': '清空选择',
      'insert.groupHeader': '分组',
      'insert.groupRequirement': '要求：',
      'insert.groupReference': '元素：',
      'insert.itemsCountLabel': '项',
      'sidebar.title': '标注',
      'sidebar.subtitle': '单条标注与批量分组在同一列表中管理。',
      'sidebar.hint': '点击页面元素开始标注 · {passThrough}-点击可正常使用页面 · {multi}-点击可加选。',
      'sidebar.filter.all': '全部',
      'sidebar.filter.single': '单条',
      'sidebar.type.single': '单条',
      'sidebar.type.group': '分组',
      'sidebar.filter.group': '分组',
      'sidebar.groupBadge': '分组 · {count} 项',
      'sidebar.groupUntitled': '未命名分组',
      'sidebar.updated': '更新于 {time}',
      'sidebar.page': '页面',
      'sidebar.area': '区域',
      'sidebar.selector': '选择器',
      'sidebar.addAnnotation': '添加标注',
      'sidebar.clearSelection': '清空选择',
      'sidebar.clearCollection': '清空标注集',
      'sidebar.cancelAnnotation': '取消标注',
      'exitConfirm.title': '清除标注并退出？',
      'exitConfirm.message': '退出标注模式并清除 {count} 条标注？这些标注不会被保留到下一次进入。',
      'exitConfirm.cancel': '取消',
      'exitConfirm.clear': '清除并退出',
      'sidebar.emptyTitle': '还没有标注',
      'sidebar.emptyHint': '在页面上选择一个元素即可添加第一条标注。',
      'sidebar.filterEmpty': '当前筛选下没有内容。',
      'sidebar.addHint': '切换到页面并选择要标注的元素。',
      'sidebar.edit': '编辑标注',
      'sidebar.delete': '删除标注',
      'sidebar.insert': '插入引用',
      'sidebar.include': '加入批量',
      'sidebar.total': '共 {count} 条',
      'collection.groupBadge': '批量',
      'collection.groupCount': '{count} 项',
      'collection.groupUntitled': '未命名分组',
      'collection.groupPreview': '查看项',
      'collection.groupRequirementPlaceholder': '整组共用的要求',
      'collection.groupEditorTitle': '分组要求 · {count} 项',
      'collection.collapse': '收起',
      'collection.expand': '展开',
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

    //#region feature: composer image gallery
    /**
     * Composer image gallery: intercepts clicks on multiple pasted screenshots in
     * the composer's attachment rail and opens one continuous viewer instead of the
     * native single-image lightbox. Single-image composers keep native behavior.
     *
     * The native rail is DOM-measured (shell classes are hashed): openable pasted
     * images are `button` elements inside `[data-conversation-region="composer"]`
     * that contain exactly one `img`, carry a non-empty `title`, and have no
     * `aria-label` (refused uploads set an aria-label error). Order is DOM order.
     */

    /** Copy namespace for the composer image gallery. */
    const PSG_NS = 'composerImageGallery'

    /** Slot cell identity of the gallery overlay. */
    const PSG_SLOT_ID = 'power-suite.composer-image-gallery'

    /** Deepest composer region the interception is scoped to. */
    const PSG_COMPOSER_SELECTOR = '[data-conversation-region="composer"]'

    /** Localised copy for the gallery overlay. */
    const PSG_EN = {
      'dialog': 'Image gallery',
      'close': 'Close image gallery',
      'previous': 'Previous image',
      'next': 'Next image',
      'counter': '{index} / {total}'
    }
    const PSG_ZH = {
      'dialog': '图片查看器',
      'close': '关闭图片查看器',
      'previous': '上一张',
      'next': '下一张',
      'counter': '{index} / {total}'
    }

    // Remix Icon paths (Apache-2.0, https://remixicon.com), inlined for zero-install.
    const PSG_ARROW_LEFT_LINE = 'M10.8284 12.0007L15.7782 16.9504L14.364 18.3646L8 12.0007L14.364 5.63672L15.7782 7.05093L10.8284 12.0007Z'
    const PSG_ARROW_RIGHT_LINE = 'M13.1717 12.0007L8.22192 7.05093L9.63614 5.63672L16.0001 12.0007L9.63614 18.3646L8.22192 16.9504L13.1717 12.0007Z'
    const PSG_CLOSE_LINE = 'M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z'

    /** Module-level gallery store: exactly one overlay can exist. */
    let psgState = { open: false, images: [], index: 0 }
    const psgListeners = new Set()
    let psgSourceButton = null
    let psgComposerRegion = null

    /** Notify overlay subscribers. */
    function psgEmit() {
      for (const listener of [...psgListeners]) {
        try {
          listener()
        } catch {
          // A subscriber throw cannot break the store.
        }
      }
    }

    /**
     * Subscribe the overlay component to gallery state.
     * @param {Function} listener - change callback.
     * @returns {Function} unsubscribe.
     */
    function psgSubscribe(listener) {
      psgListeners.add(listener)
      return () => psgListeners.delete(listener)
    }

    /** @returns {{ open: boolean, images: Array<object>, index: number }} current snapshot. */
    function psgSnapshot() {
      return psgState
    }

    /**
     * Open the gallery on a collected rail snapshot.
     * @param {Array<{ src: string, name: string, button: HTMLElement }>} collected - rail images.
     * @param {number} index - clicked image index.
     * @param {HTMLElement} sourceButton - clicked thumbnail (focus return target).
     * @param {HTMLElement} composer - composer region (mutation watch target).
     * @returns {void}
     */
    function psgOpen(collected, index, sourceButton, composer) {
      const images = collected.map(({ src, name }) => ({ src, name }))
      psgSourceButton = sourceButton
      psgComposerRegion = composer
      psgState = { open: true, images, index: psgClampIndex(index, images.length) }
      psgEmit()
    }

    /**
     * Close the gallery and optionally return focus to the clicked thumbnail.
     * @param {{ restoreFocus?: boolean }} [options] - focus behavior.
     * @returns {void}
     */
    function psgClose(options) {
      const restoreFocus = options === null || options === undefined || options.restoreFocus !== false
      const button = psgSourceButton
      const wasOpen = psgState.open
      psgSourceButton = null
      psgComposerRegion = null
      if (!wasOpen) return
      psgState = { open: false, images: [], index: 0 }
      psgEmit()
      if (restoreFocus && button instanceof HTMLElement && button.isConnected) {
        try {
          button.focus({ preventScroll: true })
        } catch {
          button.focus()
        }
      }
    }

    /**
     * Move the open gallery one image in the given direction (clamped).
     * @param {number} delta - positive for next, negative for previous.
     * @returns {void}
     */
    function psgStep(delta) {
      if (!psgState.open) return
      const index = psgStepIndex(psgState.index, psgState.images.length, delta)
      if (index === psgState.index) return
      psgState = { ...psgState, index }
      psgEmit()
    }

    /**
     * Re-read the composer rail while the gallery is open and reconcile the state:
     * removed attachments clamp the index, an emptied rail closes the overlay.
     * @returns {void}
     */
    function psgSync() {
      if (!psgState.open) return
      const composer = psgComposerRegion
      if (!(composer instanceof HTMLElement) || !composer.isConnected) {
        psgClose({ restoreFocus: false })
        return
      }
      const collected = psgCollectImages(composer)
      const currentSrc = psgState.images[psgState.index]?.src ?? ''
      const next = psgSyncState(collected.map(({ src, name }) => ({ src, name })), psgState.index, currentSrc)
      if (next.images.length === 0) {
        psgClose({ restoreFocus: false })
        return
      }
      if (next.images.length === psgState.images.length
        && next.index === psgState.index
        && next.images.every((image, position) => image.src === psgState.images[position]?.src)) return
      psgState = { ...psgState, images: next.images, index: next.index }
      psgEmit()
    }

    /**
     * Document capture click handler: suppresses the native single-image lightbox
     * when the composer holds two or more openable pasted images.
     * @param {MouseEvent} event - click event.
     * @returns {void}
     */
    function psgOnDocumentClick(event) {
      if (psgState.open) return
      if (event.defaultPrevented) return
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button')
      if (!(button instanceof HTMLElement)) return
      const composer = button.closest(PSG_COMPOSER_SELECTOR)
      if (!(composer instanceof HTMLElement)) return
      const collected = psgCollectImages(composer)
      if (collected.length < 2) return
      const index = collected.findIndex((image) => image.button === button)
      if (index < 0) return
      // Capture phase runs above React's delegated handler; both calls are needed
      // to replace the native lightbox instead of stacking a second overlay.
      event.preventDefault()
      event.stopImmediatePropagation()
      psgOpen(collected, index, button, composer)
    }

    /** Stylesheet for the gallery overlay (native lightbox recipe on shell tokens). */
    const PSG_CSS = `
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
.psg-close:focus-visible,.psg-nav:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:3px}
.psg-nav:disabled{opacity:.35;cursor:default}
.psg-counter{position:absolute;top:20px;left:50%;transform:translateX(-50%);z-index:2;display:inline-flex;align-items:center;height:36px;padding:0 14px;box-sizing:border-box;border-radius:999px;corner-shape:round;background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;font-variant-numeric:tabular-nums;box-shadow:var(--dsw-elevation-panel,none)}
@keyframes psg-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){.psg-root{animation:none}}
`

    /**
     * The gallery overlay component. Subscribes to the module store, reconciles
     * with the composer rail while open, and owns the modal input handling.
     * @param {object} props - slot props plus injected t.
     * @returns {object | null} the overlay, or null while closed.
     */
    function ComposerImageGallery(props) {
      const { t } = props
      const state = React.useSyncExternalStore(psgSubscribe, psgSnapshot, psgSnapshot)
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
      const rootRef = React.useRef(null)
      const open = state.open

      // Reconcile with the live composer rail: attachment removal and Session
      // switches change or empty the rail; a short interval catches a composer
      // region that is replaced without mutations inside the old element.
      React.useEffect(() => {
        if (!open) return undefined
        const composer = psgComposerRegion
        const observer = typeof MutationObserver === 'function' && composer instanceof HTMLElement
          ? new MutationObserver(() => psgSync())
          : null
        if (observer !== null && composer instanceof HTMLElement) {
          observer.observe(composer, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
        }
        const interval = window.setInterval(() => psgSync(), 400)
        return () => {
          if (observer !== null) observer.disconnect()
          window.clearInterval(interval)
        }
      }, [open])

      // Modal keys while open: Esc closes, Left/Right navigate. Capture so shell
      // shortcuts never see the arrows first.
      React.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.defaultPrevented) return
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            psgClose()
            return
          }
          if (event.key === 'ArrowLeft' || event.key === 'Left') {
            event.preventDefault()
            event.stopPropagation()
            psgStep(-1)
            return
          }
          if (event.key === 'ArrowRight' || event.key === 'Right') {
            event.preventDefault()
            event.stopPropagation()
            psgStep(1)
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [open])

      // One step per wheel gesture; the overlay must not scroll the page behind it.
      React.useEffect(() => {
        if (!open) return undefined
        const root = rootRef.current
        if (!(root instanceof HTMLElement)) return undefined
        let accumulated = 0
        let lastStepAt = Number.NEGATIVE_INFINITY
        const onWheel = (event) => {
          event.preventDefault()
          const decision = psgWheelDecision(accumulated, event.deltaY, Date.now(), lastStepAt)
          accumulated = decision.accum
          if (decision.step === 0) return
          lastStepAt = decision.lastStepAt
          psgStep(decision.step)
        }
        root.addEventListener('wheel', onWheel, { passive: false })
        return () => root.removeEventListener('wheel', onWheel)
      }, [open])

      // Move focus into the dialog on open; closing returns it to the thumbnail.
      React.useEffect(() => {
        if (!open) return
        const close = rootRef.current?.querySelector('[data-psg-close]')
        if (close instanceof HTMLElement) close.focus()
      }, [open])

      if (!open || state.images.length === 0) return null
      const total = state.images.length
      const index = psgClampIndex(state.index, total)
      const image = state.images[index]
      return React.createElement('div', {
        className: 'psg-root',
        ref: rootRef,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('dialog'),
        'data-psg-gallery': '',
        'data-psg-index': String(index),
        'data-psg-total': String(total)
      },
      React.createElement('div', {
        className: 'psg-mask',
        'aria-hidden': true,
        onClick: () => psgClose()
      }),
      React.createElement('div', { className: 'psg-stage' },
        React.createElement('img', {
          className: 'psg-image',
          src: image.src,
          alt: image.name,
          draggable: false,
          'data-psg-image': ''
        })),
      React.createElement('div', {
        className: 'psg-counter',
        'aria-live': 'polite',
        'data-psg-counter': ''
      }, t('counter', { index: index + 1, total })),
      React.createElement('button', {
        type: 'button',
        className: 'psg-nav psg-prev',
        'data-psg-prev': '',
        'aria-label': t('previous'),
        title: t('previous'),
        disabled: index <= 0,
        onClick: () => psgStep(-1)
      }, RemixGlyph(PSG_ARROW_LEFT_LINE, 18)),
      React.createElement('button', {
        type: 'button',
        className: 'psg-nav psg-next',
        'data-psg-next': '',
        'aria-label': t('next'),
        title: t('next'),
        disabled: index >= total - 1,
        onClick: () => psgStep(1)
      }, RemixGlyph(PSG_ARROW_RIGHT_LINE, 18)),
      React.createElement('button', {
        type: 'button',
        className: 'psg-close',
        'data-psg-close': '',
        'aria-label': t('close'),
        title: t('close'),
        onClick: () => psgClose()
      }, RemixGlyph(PSG_CLOSE_LINE, 16)))
    }

    /**
     * Install the composer image gallery: dictionaries, stylesheet, the capture
     * click interceptor, and the overlay slot entry.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installComposerImageGallery(ctx) {
      const t = ctx.locale.bind(PSG_NS)
      ctx.effect(() => ctx.locale.register(PSG_NS, { en: PSG_EN, zh: PSG_ZH }), 'power-suite: composer image gallery dictionaries')
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.powerSuiteCss = 'composer-gallery'
        tag.textContent = PSG_CSS
        document.head.appendChild(tag)
        return () => { tag.remove() }
      }, 'power-suite: composer image gallery styles')
      ctx.effect(() => {
        document.addEventListener('click', psgOnDocumentClick, true)
        return () => {
          document.removeEventListener('click', psgOnDocumentClick, true)
          psgClose({ restoreFocus: false })
        }
      }, 'power-suite: composer image gallery interceptor')
      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: PSG_SLOT_ID
      }, (props) => React.createElement(ComposerImageGallery, { ...props, t }))), 'power-suite: composer image gallery overlay')
    }
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
     * @param {object} ctx - client root context.
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
            setInterruptedRecord(sessionId, { status: 'ready', interrupted: false, running: false, ...patch })
            syncInterruptedRows()
            return interruptedRecord(sessionId)
          },
          clear: (sessionId) => {
            interruptedStore.records.delete(sessionId)
            syncInterruptedRows()
          },
          record: (sessionId) => interruptedRecord(sessionId),
          sync: () => syncInterruptedRows()
        }
      }
      artifactsFeature.installArtifacts(/** @type {import('./browser/artifacts/panel.ts').ArtifactsContext} */ (ctx))
      workspacePresets.installWorkspacePresetMenu(/** @type {import('./browser/workspace-presets/install.ts').WorkspacePresetsContext} */ (ctx), appUrl)
      workspacePresets.installWorkspacePresetRouting(/** @type {import('./browser/workspace-presets/install.ts').WorkspacePresetsContext} */ (ctx), appUrl)
      installPromptHistory(ctx)
      installPromptHistoryPreview(/** @type {import('./browser/prompt-history/preview.ts').PromptHistoryPreviewContext} */ (ctx))
      installDraftAttachmentMemory(ctx)
      dynamicWorkspacesInstaller.install(/** @type {import('./browser/dynamic-workspaces/install.ts').DynamicWorkspacesContext} */ (ctx))
      installSessionHoverFigures(/** @type {import('./browser/native-session-hover-figures/install.ts').NativeSessionHoverFiguresContext} */ (ctx))
      installInterruptedSessions(/** @type {import('./browser/interrupted-sessions/components.ts').InterruptedSessionComponentsContext} */ (ctx))
      installQuickLook(/** @type {import('./browser/hover-quick-look/install.ts').HoverQuickLookContext} */ (ctx), {
        t,
        appUrl,
        rawRoute: RAW_ROUTE,
        previewRoute: PREVIEW_ROUTE,
        attachmentUrl: (attachment, disposition) => attachmentUrl(attachment, disposition, null),
        formatBytes,
        icons: { file: REMIX_FILE_LINE, open: REMIX_BOOK_OPEN_LINE, download: REMIX_DOWNLOAD_LINE }
      })
      installSettingsPage(ctx)
      installComposerImageGallery(ctx)
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
