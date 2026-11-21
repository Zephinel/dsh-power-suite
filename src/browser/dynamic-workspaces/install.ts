/**
 * Dynamic Workspaces browser controller.
 *
 * The feature augments the native sidebar Workspaces browser instead of
 * replacing it: it inserts a Running & recent summary card above the header and
 * one bucket header into the list, then orders and folds the native group
 * sections through flex order. It also owns the card's Host-shared pin and
 * read-acknowledgement documents, the row "..." menu delegation, and the
 * current-row rainbow atmosphere.
 *
 * Everything that used to sit inline in `src/client.js` lives here behind one
 * factory: the browser entry creates the installer with the runtime modules and
 * cross-feature seats it owns, then calls `install(ctx)`. DOM markers, storage
 * keys, copy dictionaries and slot ids are unchanged; the only public surface
 * is `createDynamicWorkspacesInstaller`.
 *
 * @module
 */

import { ACTIVE_PROJECT_DAYS, RECENT_SESSION_MINUTES } from '../../shared/protocol.ts'
import type { Settings } from '../../shared/protocol.ts'
import { ROUTES, browserRoute } from '../../shared/routes.ts'
import { dwEffectiveUpdatedAt, dwPendingSessionIds } from './activity.ts'
import {
  DW_ATMOS_HUES,
  DW_ATMOS_PALETTES,
  DW_SMOKE,
  advanceAtmosphere,
  atmosphereArcHue,
  atmosphereMixWeight,
  atmospherePaint,
  createAtmosphereModel
} from './atmosphere.ts'
import { interruptedCardMark, interruptedIndicatorActive } from '../interrupted-sessions/model.ts'
import type { InterruptedRecord } from '../interrupted-sessions/model.ts'
import {
  DW_PIN_MAX_PENDING,
  DW_PIN_VERSION,
  dwPinEffectiveIds,
  dwPinPanelRows,
  dwReadPinCache,
  dwSanitizePinnedIds,
  dwWritePinCache
} from './pin.ts'
import type { PanelRow, PendingPinOp, PinCache } from './pin.ts'
import { DW_ROW_MENU_TARGET, dwRowMenuResolve } from './row-menu.ts'
import { dwOwningWorkspace, dwSessionRunning, dwWorkspaceLabel } from './rows.ts'
import type { Translate, WorkspaceRow } from './rows.ts'
import {
  DW_EN,
  DW_ZH,
  dwBilledInputTokens,
  dwCacheHitPercent,
  dwContextOccupancy,
  dwFormatCompactTokens,
  dwFormatExactTokens,
  dwFormatStatsDuration,
  dwFormatTps,
  dwNeedsProjectionRead,
  dwProjectionSections
} from './stats.ts'
import type { ProjectionSections } from './stats.ts'

/** Copy namespace for the dynamic Workspace buckets and the running panel. */
export const DW_NS = 'dynamicWorkspaces'

/** Element type produced by the shell's React runtime. */
type ReactElement = import('react').ReactElement

/** Mutable ref box exposed by the shell's React runtime. */
type MutableRefObject<T> = import('react').MutableRefObject<T>

/** Settings snapshot shape shared by the settings page and this feature. */
export interface SettingsSnapshot {
  status: 'loading' | 'ready' | 'error'
  value: Settings
}

/** One Session list summary as the card reads it. */
export interface SessionSummary {
  origin?: string
  blank?: boolean
  parentId?: string
  displayTitle?: string
  cwd?: string
  updatedAt?: number
  running?: boolean
  retainedBy?: { mainView?: number }
}

/** Session list snapshot shape. */
export interface SessionList {
  ids?: readonly string[]
  byId?: Record<string, SessionSummary | undefined>
  projectionsBySession?: Record<string, { values?: unknown } | undefined>
  phase?: string
}

/** Workspace list snapshot shape. */
export interface WorkspaceSnapshot {
  items?: readonly WorkspaceRow[]
  archivedSessionIds?: readonly string[]
}

/** Live Session-status snapshot keyed by Session id. */
export type SessionStatusMap = Map<string, unknown>

/** Host last-activity map. */
export type SessionActivity = Record<string, number>

/** Persisted bucket fold state. */
export interface DynamicWorkspaceFolds {
  active: boolean
  inactive: boolean
}

/** Live geometry this feature augments. */
export interface DynamicWorkspaceMounts {
  wrapper: HTMLElement
  root: HTMLElement
  list: HTMLElement
  panel: HTMLElement
  activeHeader: HTMLElement
  inactiveHeader: HTMLElement
}

/** Portal targets handed to React after a mount reconcile. */
interface DynamicWorkspacePortalMounts {
  panel: HTMLElement
  list: HTMLElement
  activeHeader: HTMLElement
  inactiveHeader: HTMLElement
}

/** One observed running duration. */
interface RunningDuration {
  at: number
  observed: boolean
}

/** One injected native-row atmosphere instance. */
interface NativeAtmosphere {
  host: HTMLElement
  wrapper: HTMLElement
  renderer: { destroy(): void }
  attr: string
}

/** Pin-sync runtime kept in one ref. */
interface PinRuntime {
  cache: PinCache
  flushing: boolean
  syncInFlight: boolean
  disposed: boolean
  flushTimer: number | null
}

/** Minimal click/focus event surface the card handlers use. */
interface UiEventLike {
  preventDefault(): void
  stopPropagation(): void
  readonly target: EventTarget | null
  readonly currentTarget: EventTarget | null
}

/** Minimal keyboard event surface the card handlers use. */
interface KeyEventLike extends UiEventLike {
  readonly key: string
}

/** Hover card state for one row. */
interface HoverTarget {
  row: DynamicRow
  top: number
  anchorLeft: number
}

/** A card row plus its parent/child role. */
type DynamicRow = PanelRow & { kind?: 'main' | 'child' }

/** One nested subagent row grouped under its parent. */
interface SubagentRow {
  id: string
  title: string
  workspaceId: unknown
  cwd: string | null
  updatedAt: number
  state: 'running' | 'done'
}

/** Props of the running/recent summary card. */
interface DynamicRunningPanelProps {
  t: Translate
  rows: readonly DynamicRow[]
  expanded: boolean
  showAll: boolean
  now: number
  durations: Map<string, RunningDuration>
  childrenByParent: Map<string, SubagentRow[]>
  collapsedParents: Set<string>
  acked: Map<string, number>
  onToggle: () => void
  onToggleAll: () => void
  onToggleChildren: (id: string) => void
  onOpen: (id: string) => void
  interruptedT: Translate
  onNewSession: (row: DynamicRow) => void
  currentSessionId: string | null
  projections: Record<string, { values?: unknown } | undefined> | undefined
  onEnsureProjections: (id: string) => void
  pinnedIds: Set<string>
  menuSessionId: string | null
  menuEnabled: boolean
  onOpenSessionMenu: (row: DynamicRow, element: Element | null) => void
  onTogglePin: (id: string) => void
  pendingIds: readonly string[]
}

/** Latest render inputs read by the MutationObserver callbacks. */
interface LatestSnapshot {
  sessions: SessionList | null
  statuses: SessionStatusMap | null
  workspaces: WorkspaceSnapshot | null
  folds: DynamicWorkspaceFolds
  windows: { recentMs: number, activeMs: number }
  activity: SessionActivity
  currentSessionId: string | null
}

/** One native section classified by the Active/Inactive rule. */
interface WorkspaceSection {
  element: HTMLElement
  row: Element
  workspaceId: string
  cacheKey: string
  active: boolean
  domIndex: number
  recency: number
}

/** Shell standard hooks handed to a root-scope slot entry. */
export interface DynamicWorkspacesSeatHooks {
  useSessions: (selector: (state: SessionList) => SessionList) => SessionList
  useSessionStatus: (selector: (state: SessionStatusMap) => SessionStatusMap) => SessionStatusMap
  useWorkspaces: (selector: (state: WorkspaceSnapshot) => WorkspaceSnapshot) => WorkspaceSnapshot
}

/** Slot props the seat accepts: this feature's seats plus the shell hooks. */
export interface DynamicWorkspacesSeatProps extends DynamicWorkspacesSeatHooks {
  t: Translate
  interruptedT: Translate
  uiWorkspace: DshUiWorkspaceService
  parentSessions: DshSessionsService
  contextMenus: DshContextMenuService
  [key: string]: unknown
}

/** The narrow slice of the client root context this installer reads. */
export interface DynamicWorkspacesContext {
  effect(setup: () => (() => void) | void, label?: string): void
  locale: {
    bind(namespace: string): Translate
    register(namespace: string, dictionaries: { en: Record<string, string>, zh: Record<string, string> }): () => void
  }
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(registration: { name: string, id?: string }, component: (props: DynamicWorkspacesSeatProps) => unknown): () => void
  }
  sessions: DshSessionsService
  uiWorkspace: DshUiWorkspaceService
  contextMenus: DshContextMenuService
}

/** Stable services and cross-feature seats the browser entry owns. */
export interface DynamicWorkspacesUiPrimitives {
  readonly IconEllipsisOutlineRegular?: unknown
  readonly IconPinFillRegular?: unknown
  readonly IconPinOutlineRegular?: unknown
}

export interface DynamicWorkspacesDeps {
  React: typeof import('react')
  ReactDOM: typeof import('react-dom')
  uiPrimitives: DynamicWorkspacesUiPrimitives
  RemixGlyph: (path: string, size: number, className?: string, scale?: number) => unknown
  RemixIcon: (props: { path: string, size?: number }) => unknown
  StateDot: (props: { state?: string, size?: number, className?: string }) => unknown
  appUrl: (relative: string) => string
  subscribeSettings: (listener: () => void) => () => void
  settingsSnapshot: () => SettingsSnapshot
  subscribeInterrupted: (listener: () => void) => () => void
  interruptedVersion: () => number
  interruptedRecord: (sessionId: string) => unknown
  ensureInterrupted: (sessionId: string) => void
  watchInterrupted: (sessionId: string) => () => void
  refreshInterrupted: (sessionId: string) => void
  requestContinue: (sessionId: string) => void
  remixPlayFill: string
  remixWarningFill: string
  interruptedNamespace: string
  testHookHost: { __POWER_SUITE_TEST_HOOKS__?: Record<string, Record<string, unknown>> }
}

/** The installer the browser entry keeps for its `apply` pass. */
export interface DynamicWorkspacesInstaller {
  install(ctx: DynamicWorkspacesContext): void
}

/**
 * Create the dynamic-Workspaces installer for one plugin instance.
 * @param deps - shell runtime modules and cross-feature seats.
 * @returns installer bound to those dependencies.
 */
export function createDynamicWorkspacesInstaller(deps: DynamicWorkspacesDeps): DynamicWorkspacesInstaller {
  const {
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
    remixPlayFill,
    remixWarningFill,
    interruptedNamespace,
    testHookHost
  } = deps

    /** Seat identity of the frame-wide seat that owns this feature's DOM work. */
    const DW_SEAT = 'power-suite.dynamic-workspaces'

    /** Attribute marking every sidebar DOM node this feature owns, for cleanup. */
    const DW_ATTR = 'data-psd'

    /** localStorage key holding the two bucket fold states. */
    const DW_FOLD_KEY = 'power-suite.dynamic-workspaces.folds'

    /** Registration identity of this feature's contribution in the shared menu registry. */
    const DW_ROW_MENU_PROVIDER = 'power-suite.session-row-menu'

    /** Pending-interaction flag (24 viewBox, Remix flag-fill) shown before a
     *  waiting Session's title in amber, the native question-prompt colour. */
    const DW_FLAG_FILL_PATH = 'M3 3H12.382C12.7607 3 13.107 3.214 13.2764 3.55279L14 5H20C20.5523 5 21 5.44772 21 6V17C21 17.5523 20.5523 18 20 18H13.618C13.2393 18 12.893 17.786 12.7236 17.4472L12 16H5V22H3V3Z'

    /** Authenticated Host route sharing the card's pinned ids across devices. */
    const DW_PIN_ROUTE = browserRoute(ROUTES.sessionPins)

    /** How often the client re-reads the Host-shared pin document. */
    const DW_PIN_SYNC_POLL_MS = 30000

    /** Abort a hung pin GET/POST so the next sync cycle can retry. */
    const DW_PIN_REQUEST_TIMEOUT_MS = 8000

    /** Debounce before queued pin operations are published to the Host. */
    const DW_PIN_PUSH_DEBOUNCE_MS = 150

    /** Highest number of rows the summary card lists before "view all". */
    const DW_PANEL_LIMIT = 5

    /**
     * Width of the row hover card in pixels. The native session tooltip is
     * 244 px wide; the card grows to 320 px so each of the three native figure
     * sections fits its label and right-aligned value on one line. The left
     * edge still sits flush on the sidebar column's right edge.
     */
    const DW_HOVERCARD_WIDTH = 320

    /** Viewport-clamped ceiling for the row hover card once the figures show. */
    const DW_HOVERCARD_MAX_HEIGHT = 560

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
    function dwWindows(settings: unknown): { recentMs: number, activeMs: number } {
      const value = settings !== null && typeof settings === 'object' ? settings as Partial<Settings> : {}
      const recent = value.recentSessionMinutes
      const minutes = typeof recent === 'number' && (RECENT_SESSION_MINUTES as readonly number[]).includes(recent)
        ? recent
        : DW_DEFAULT_RECENT_MINUTES
      const active = value.activeProjectDays
      const days = typeof active === 'number' && (ACTIVE_PROJECT_DAYS as readonly number[]).includes(active)
        ? active
        : DW_DEFAULT_ACTIVE_DAYS
      return { recentMs: minutes * 60 * 1000, activeMs: days * 24 * 60 * 60 * 1000 }
    }

    // Remix Icon paths (Apache-2.0, https://remixicon.com), inlined here so the
    // activity card needs no icon package at runtime.
    const DW_DEEPSEEK_FILL = 'M23.7493 4.92674C23.5053 4.80721 23.4103 5.0349 23.2676 5.15064C23.2193 5.18858 23.1777 5.23791 23.137 5.28155C22.7804 5.66482 22.3643 5.91527 21.8215 5.88492C21.0261 5.84128 20.348 6.09173 19.7484 6.7027C19.6207 5.94942 19.197 5.49975 18.553 5.21135C18.2154 5.06146 17.8739 4.91156 17.6385 4.58522C17.473 4.35374 17.4285 4.0957 17.3452 3.84145C17.2932 3.68777 17.2403 3.53028 17.0644 3.50372C16.8733 3.47337 16.7986 3.63464 16.7239 3.76935C16.4232 4.31959 16.3077 4.92674 16.3182 5.54149C16.3446 6.92274 16.9263 8.0232 18.0801 8.80687C18.2116 8.89605 18.2456 8.98707 18.204 9.11802C18.1255 9.38741 18.0319 9.64931 17.9487 9.9187C17.8967 10.0914 17.8181 10.1293 17.6347 10.0534C17.0011 9.78784 16.4534 9.39508 15.9701 8.91878C15.1493 8.1219 14.4069 7.24157 13.481 6.55281C13.2634 6.39151 13.0469 6.24162 12.8217 6.09932C11.8769 5.1772 12.9457 4.42015 13.1925 4.33097C13.4516 4.23801 13.2823 3.91544 12.4463 3.91924C11.6112 3.92304 10.8461 4.20385 9.87196 4.57763C9.72921 4.63455 9.54598 4.73128 9.4256 4.70855C8.54132 4.54158 7.62304 4.50363 6.66308 4.61178C4.8567 4.8148 3.4135 5.67241 2.35237 7.13714C1.07845 8.89605 0.778651 10.8959 1.1456 12.9829C1.53147 15.1801 2.64839 17.0016 4.36587 18.4246C6.14576 19.8989 8.19617 20.6218 10.535 20.4832C11.9555 20.4016 13.5377 20.2101 15.3214 18.694C15.7715 18.9179 16.2434 19.0071 17.0275 19.0754C17.6309 19.1323 18.2116 19.0451 18.6617 18.952C19.3663 18.8022 19.3172 18.1476 19.0628 18.0261C16.9973 17.0604 17.4502 17.4532 17.0379 17.1363C18.0876 15.8879 19.6699 14.592 20.2884 10.395C20.3367 10.061 20.295 9.85235 20.2884 9.58102C20.2847 9.41782 20.3216 9.35331 20.5088 9.33437C21.0261 9.2755 21.5283 9.13318 21.9898 8.8771C23.3281 8.14278 23.8571 6.93799 23.9848 5.49216C24.0037 5.27207 23.981 5.04248 23.7493 4.92674ZM12.0983 17.937C10.0962 16.3565 9.12577 15.8366 8.72484 15.8594C8.35024 15.8802 8.41745 16.3109 8.49968 16.5918C8.58577 16.8688 8.6983 17.0604 8.85626 17.3033C8.96501 17.4645 9.03978 17.7055 8.7475 17.8838C8.10252 18.2861 6.98184 17.7492 6.92886 17.7226C5.62465 16.9523 4.5342 15.9333 3.76532 14.5407C3.02385 13.1993 2.59259 11.7611 2.52166 10.2261C2.50275 9.85419 2.61151 9.72324 2.97846 9.65689C3.46173 9.56771 3.96109 9.54877 4.44436 9.61891C6.48717 9.9187 8.22638 10.837 9.68379 12.2886C10.5161 13.1177 11.1459 14.1062 11.7947 15.072C12.4841 16.0985 13.2265 17.0756 14.1714 17.8762C14.5042 18.1571 14.7709 18.3715 15.0253 18.529C14.2575 18.6144 12.9749 18.6333 12.0983 17.937ZM13.0573 11.7383C13.0573 11.5732 13.1887 11.4423 13.3542 11.4423C13.3911 11.4423 13.4252 11.4499 13.4554 11.4613C13.4961 11.4764 13.5339 11.4992 13.5633 11.5333C13.6162 11.5846 13.6465 11.6605 13.6465 11.7383C13.6465 11.9034 13.515 12.0343 13.3504 12.0343C13.1849 12.0343 13.0573 11.9034 13.0573 11.7383ZM16.0373 13.2752C15.8463 13.353 15.6552 13.4213 15.4718 13.4288C15.1871 13.4421 14.8759 13.3264 14.7066 13.1841C14.4447 12.964 14.2575 12.8406 14.1779 12.4536C14.1448 12.2886 14.1638 12.0343 14.1931 11.8882C14.2612 11.5732 14.1855 11.3721 13.9652 11.1881C13.7846 11.0382 13.5566 10.9984 13.3051 10.9984C13.2114 10.9984 13.1253 10.9566 13.061 10.9224C12.9561 10.8693 12.87 10.7384 12.9523 10.5771C12.9787 10.5259 13.1065 10.3988 13.1367 10.376C13.4772 10.1806 13.8706 10.2451 14.2347 10.3912C14.5723 10.5296 14.8267 10.7839 15.1936 11.1425C15.5691 11.5771 15.6363 11.6985 15.8501 12.0229C16.0184 12.279 16.1726 12.5408 16.2775 12.8406C16.3409 13.0266 16.2586 13.1802 16.0373 13.2752Z'
    const DW_ROBOT_2_LINE = 'M13.5 2C13.5 2.44425 13.3069 2.84339 13 3.11805V5H18C19.6569 5 21 6.34315 21 8V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V8C3 6.34315 4.34315 5 6 5H11V3.11805C10.6931 2.84339 10.5 2.44425 10.5 2C10.5 1.17157 11.1716 0.5 12 0.5C12.8284 0.5 13.5 1.17157 13.5 2ZM6 7C5.44772 7 5 7.44772 5 8V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V8C19 7.44772 18.5523 7 18 7H13H11H6ZM2 10H0V16H2V10ZM22 10H24V16H22V10ZM9 14.5C9.82843 14.5 10.5 13.8284 10.5 13C10.5 12.1716 9.82843 11.5 9 11.5C8.17157 11.5 7.5 12.1716 7.5 13C7.5 13.8284 8.17157 14.5 9 14.5ZM15 14.5C15.8284 14.5 16.5 13.8284 16.5 13C16.5 12.1716 15.8284 11.5 15 11.5C14.1716 11.5 13.5 12.1716 13.5 13C13.5 13.8284 14.1716 14.5 15 14.5Z'
    const DW_NEW_CHAT_LINE = 'M6.455 19L2 22.5V4C2 2.89543 2.89543 2 4 2H20C21.1046 2 22 2.89543 22 4V18C22 19.1046 21.1046 20 20 20H6.455ZM4 4V18.385L5.763 17H20V4H4ZM11 10V7H13V10H16V12H13V15H11V12H8V10H11Z'
    /** Ellipsis glyph for the row's session-actions trigger (native icon when available). */
    const DW_MORE_ICON = typeof uiPrimitives.IconEllipsisOutlineRegular === 'function' ? uiPrimitives.IconEllipsisOutlineRegular : null
    /** Inline fallback path for the ellipsis (three filled dots, 24 viewBox). */
    const DW_MORE_PATH = 'M5 10.5C4.17157 10.5 3.5 11.1716 3.5 12C3.5 12.8284 4.17157 13.5 5 13.5C5.82843 13.5 6.5 12.8284 6.5 12C6.5 11.1716 5.82843 10.5 5 10.5ZM12 10.5C11.1716 10.5 10.5 11.1716 10.5 12C10.5 12.8284 11.1716 13.5 12 13.5C12.8284 13.5 13.5 12.8284 13.5 12C13.5 11.1716 12.8284 10.5 12 10.5ZM19 10.5C18.1716 10.5 17.5 11.1716 17.5 12C17.5 12.8284 18.1716 13.5 19 13.5C19.8284 13.5 20.5 12.8284 20.5 12C20.5 11.1716 19.8284 10.5 19 10.5Z'
    const DW_SPARKLING_LINE = 'M14 4.4375C15.3462 4.4375 16.4375 3.34619 16.4375 2H17.5625C17.5625 3.34619 18.6538 4.4375 20 4.4375V5.5625C18.6538 5.5625 17.5625 6.65381 17.5625 8H16.4375C16.4375 6.65381 15.3462 5.5625 14 5.5625V4.4375ZM1 11C4.31371 11 7 8.31371 7 5H9C9 8.31371 11.6863 11 15 11V13C11.6863 13 9 15.6863 9 19H7C7 15.6863 4.31371 13 1 13V11ZM4.87601 12C6.18717 12.7276 7.27243 13.8128 8 15.124 8.72757 13.8128 9.81283 12.7276 11.124 12 9.81283 11.2724 8.72757 10.1872 8 8.87601 7.27243 10.1872 6.18717 11.2724 4.87601 12ZM17.25 14C17.25 15.7949 15.7949 17.25 14 17.25V18.75C15.7949 18.75 17.25 20.2051 17.25 22H18.75C18.75 20.2051 20.2051 18.75 22 18.75V17.25C20.2051 17.25 18.75 15.7949 18.75 14H17.25Z'
    /* The shell's own disclosure glyph (primitives `triangle-right-fill`,
       16 viewBox): a filled triangle that points right when closed and rotates
       to point down when open — the native sidebar project-row arrow. */
    const DW_TRIANGLE_RIGHT_FILL_PATH = 'M5.5 4.5C5.5 4.40714 5.52586 4.31612 5.57467 4.23713C5.62349 4.15815 5.69334 4.09431 5.77639 4.05279C5.85945 4.01126 5.95242 3.99368 6.0449 4.00202C6.13738 4.01036 6.22572 4.04429 6.3 4.1L10.967 7.6C11.0291 7.64657 11.0795 7.70697 11.1142 7.77639C11.1489 7.84582 11.167 7.92238 11.167 8C11.167 8.07762 11.1489 8.15418 11.1142 8.22361C11.0795 8.29303 11.0291 8.35343 10.967 8.4L6.3 11.9C6.22572 11.9557 6.13738 11.9896 6.0449 11.998C5.95242 12.0063 5.85945 11.9887 5.77639 11.9472C5.69334 11.9057 5.62349 11.8419 5.57467 11.7629C5.52586 11.6839 5.5 11.5929 5.5 11.5V4.5Z'
    // Pin glyph pair for the running card's rows: the shell's own Pin components
    // when the seeded primitives expose them (the native Session-row pin button
    // uses the same pair, so the marker matches the sidebar exactly), with an
    // inline fallback for an older shell. The fallback paths are copied from the
    // shell icon set (16 viewBox): `pin-fill` and `pin-outline`.
    const DW_PIN_FILL = typeof uiPrimitives.IconPinFillRegular === 'function' ? uiPrimitives.IconPinFillRegular : null
    const DW_PIN_OUTLINE = typeof uiPrimitives.IconPinOutlineRegular === 'function' ? uiPrimitives.IconPinOutlineRegular : null
    const DW_PIN_PATH = 'M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z'
    const DW_PIN_NEEDLE_PATH = 'M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z'

    const DW_CSS = `
.psd-panel-slot{flex:none;min-width:0;display:block}
.psd-panel{--psd-lead-col:16px;--psd-tail-col:46px;--psd-chevron-col:24px;--psd-row-h:34px;margin:2px 8px 6px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.psd-panel-head{display:flex;align-items:center;gap:2px;padding:2px 12px 2px 2px}
.psd-panel-toggle{appearance:none;display:flex;align-items:center;gap:8px;flex:0 1 auto;min-width:0;height:30px;box-sizing:border-box;padding:0 8px 0 28px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px);font-weight:500;text-align:left;cursor:pointer}
.psd-panel-toggle:hover{background:var(--dsw-alias-interactive-bg-hover)}
.psd-panel-toggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-panel-head-spacer{flex:1 1 auto;min-width:8px}
.psd-panel-chevron{appearance:none;flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--psd-chevron-col,24px);height:30px;box-sizing:border-box;padding:0;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.psd-panel-chevron:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.psd-panel-chevron:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-panel-chevron[aria-expanded='false'] .psd-chevron{transform:rotate(-90deg)}
.psd-indicator{flex:none;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary)}
.psd-spark{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary)}
.psd-pulse{position:relative;flex:none;width:8px;height:8px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-state-business-primary)}
.psd-pulse::after{content:'';position:absolute;inset:-4px;border-radius:50%;corner-shape:round;border:1px solid var(--dsw-alias-state-business-primary);opacity:.45;animation:psd-pulse 2s var(--ds-ease-in-out,ease) infinite}
@keyframes psd-pulse{0%{transform:scale(.7);opacity:.6}70%{transform:scale(1.25);opacity:0}100%{transform:scale(1.25);opacity:0}}
@media (prefers-reduced-motion: reduce){.psd-pulse::after{animation:none}}
.psd-panel-title{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.psd-count{flex:none;min-width:18px;padding:0 6px;box-sizing:border-box;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px;text-align:center;font-variant-numeric:tabular-nums}
.psd-panel-link{flex:none;appearance:none;display:inline-flex;align-items:center;box-sizing:border-box;height:30px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px);padding:0 8px;border-radius:var(--dsw-radius-md,8px);cursor:pointer;white-space:nowrap}
.psd-panel-link:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.psd-panel-link:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.psd-chevron{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);transition:transform 160ms var(--ds-ease-in-out,ease)}
.psd-panel-body{position:relative;display:flex;flex-direction:column;gap:5px;padding:2px 4px 5px;max-height:min(46cqh,320px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}
.psd-panel-body::-webkit-scrollbar{display:none;width:0;height:0}
.psd-panel-empty{padding:6px 10px 8px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;display:flex;flex-direction:column;gap:2px}
.psd-panel-empty strong{color:var(--dsw-alias-label-secondary);font-weight:500}
.psd-item{display:flex;flex-direction:column;min-width:0}
.psd-run{position:relative;display:flex;align-items:center;gap:2px;min-width:0;min-height:var(--psd-row-h,34px);padding:0 8px 0 7px;border-radius:var(--dsw-radius-md,8px);cursor:pointer}
.psd-run-main{appearance:none;display:flex;flex:0 1 auto;box-sizing:border-box;min-width:0;min-height:var(--psd-row-h,34px);max-width:calc(100% - var(--psd-lead-col,16px) - var(--psd-tail-col,46px) - 8px);align-items:center;gap:0;padding:4px 10px 4px 0;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
/* The hover surface covers the whole row like the native sidebar rows (user
   request); the old content-paced inner pill highlighted only the title. It is
   the row's ONLY hover surface: no control inside it paints a second block
   (user request), so hovering the disclosure arrow, the "…" trigger, the pin or
   New session keeps the row bar and only the glyphs change colour.
   Keyboard focus mirrors the shell's own rule, which paints focus surfaces only
   for the keyboard modality, so a mouse click on a row control cannot leave a
   stuck surface behind after the pointer leaves. */
.psd-run:hover{background-color:var(--dsw-alias-interactive-bg-hover)}
html[data-input-modality='keyboard'] .psd-run:focus-within{background-color:var(--dsw-alias-interactive-bg-hover)}
.psd-run-open{appearance:none;display:flex;flex:1 1 auto;min-width:0;max-width:100%;align-items:center;padding:0;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;margin-left:var(--psd-title-shift,0px);transition:margin-left 220ms cubic-bezier(.4,0,.2,1)}
.psd-run-open:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px;border-radius:var(--dsw-radius-sm,6px)}
.psd-run-spacer,.psd-child-spacer{flex:1 1 auto;min-width:0}
/* One right-anchored trailing cell closes every row (user request: the time sits
   at the row's far right, in the native sidebar Session-row recipe). At rest the
   cell shows the relative time at 10 px in the tertiary label colour, exactly the
   native time cell; row hover/focus swaps the "…" trigger and the New session
   button over that same cell, the way a native row swaps time -> actions. */
.psd-run-tail{position:relative;flex:none;width:var(--psd-tail-col,46px);height:20px}
.psd-run-time,.psd-child-time{position:absolute;inset:0;text-align:right;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:20px;font-variant-numeric:tabular-nums}
.psd-run-time{transition:opacity 120ms var(--ds-ease-in-out,ease)}
.psd-run-more{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color 120ms var(--ds-ease-in-out,ease)}
.psd-run:hover .psd-run-time,.psd-run:focus-within .psd-run-time,.psd-run[data-menu-open='true'] .psd-run-time{opacity:0}
.psd-run-more:hover{color:var(--dsw-alias-label-primary)}
.psd-run-more:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-run[data-state='done'] .psd-run-title{color:var(--dsw-alias-label-secondary)}
/* The head is gap-less: the collapsed Continue slot is 0 px wide, so a flex
   gap between children would still push the title right before the pointer arrives
   (user report: the title started shifted on an interrupted row that was not
   hovered). Spacing is carried by the leading cell's 9 px right margin instead, so
   the rest title starts at the first-character-centred column and only the revealed
   slots move it; the pinned/hover column stays at 9 + 16 + 9 px. */
.psd-run-head{display:flex;align-items:center;gap:0;min-width:0;flex:1 1 auto;overflow:hidden;margin-right:0}
/* One fixed 16 px leading-glyph cell for every main-row state, so the 14 px state
   dots and the slightly larger sparkle share one centre column; the child-tree
   trunk and the pin column are aligned to that same geometry. Its 9 px right
   margin is the rest gap to the title when every slot is collapsed. */
.psd-run-glyph-cell{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:20px;margin-right:9px}
.psd-run-glyph{flex:none;display:inline-flex;align-items:center;justify-content:center}
/* Annotation targeting (user request): the status/identity glyph changes node
   type with the row state (spinner svg -> dot span -> sparkle svg -> warning),
   so a pointer pick that lands on the svg records a positional anchor and later
   reads "no longer on the page". The glyphs are therefore transparent to hit
   testing: the pointer picks the stable psd-run-glyph-cell / psd-child-glyph
   span instead, which carries the Session-scoped data-testid the annotation
   re-anchoring prefers. Row clicks are unaffected (the row body handles them). */
.psd-run-glyph-cell > :is(svg,span):not(.psd-pending-flag):not(.psd-interrupted),.psd-child-glyph > :is(svg,span):not(.psd-interrupted){pointer-events:none}
/* The same rule keeps the row controls' own glyphs from being the annotation
   target: the pointer then picks the button, whose aria-label is a semantic,
   Session-scoped anchor instead of an attribute-less svg. Hover and click
   behaviour are unchanged (the button remains the hit target). */
.psd-run-toggle > :is(svg,span),.psd-run-more > svg,.psd-row-action > svg,.psd-run-pin > svg,.psd-continue-inline > svg{pointer-events:none}
/* Card chrome follows the same rule: the header indicator swaps node types with
   the run state (pulse span <-> brand svg), so its glyphs are transparent to hit
   testing and the pick lands on the one psd-indicator span, which carries a
   stable data-testid; the fold chevrons and the bucket toggles route their glyphs
   to the labelled button instead. */
.psd-indicator > *,.psd-panel-chevron > *,.psd-group-toggle > .psd-chevron{pointer-events:none}
.psd-run-brand{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary)}
.psd-run-title{flex:1;min-width:0;overflow:hidden;text-overflow:clip;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px}
[data-clipped='true'].psd-run-title,[data-clipped='true'].psd-child-title{mask-image:linear-gradient(to right,#000 calc(100% - var(--psd-title-fade,28px)),#0000)}
/* Pin slot: collapsed to 0 px (with no trailing gap) while the control is
   hidden, so the title sits next to the leading glyph exactly like the pre-pin
   layout. Hovering or focusing the row runs a two-phase reveal: first the slot
   expands (the title's start slides right while every trailing column stays
   put), then the button fades in. Leaving reverses it: the button fades out
   first, then the slot collapses and the title expands back. Pinned rows keep
   the filled marker and its space permanently; the row tint marks the state. */
.psd-run-pin-slot{flex:none;display:inline-flex;align-items:center;justify-content:center;width:0;height:20px;margin-right:0;overflow:hidden;transition:width 220ms cubic-bezier(.4,0,.2,1) 160ms,margin-right 220ms cubic-bezier(.4,0,.2,1) 160ms}
.psd-run:hover .psd-run-pin-slot,.psd-run:focus-within .psd-run-pin-slot{width:16px;margin-right:9px;transition:width 220ms cubic-bezier(.4,0,.2,1) 0ms,margin-right 220ms cubic-bezier(.4,0,.2,1) 0ms}
.psd-run:hover .psd-run-open,.psd-run:focus-within .psd-run-open{margin-left:0}
.psd-run[data-pinned='true'] .psd-run-open{margin-left:0}
.psd-run[data-pinned='true'] .psd-run-pin-slot{width:16px;margin-right:9px;transition:none}
.psd-run-pin{appearance:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:16px;height:16px;padding:0;border:0;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;opacity:0;visibility:hidden;pointer-events:none;transition:opacity 160ms cubic-bezier(.4,0,.2,1) 0ms,visibility 0s linear 160ms,background-color 120ms var(--ds-ease-in-out,ease)}
.psd-run:hover .psd-run-pin,.psd-run:focus-within .psd-run-pin{opacity:1;visibility:visible;pointer-events:auto;transition:opacity 160ms cubic-bezier(.4,0,.2,1) 220ms,visibility 0s linear 220ms,background-color 120ms var(--ds-ease-in-out,ease)}
.psd-run-pin:hover{color:var(--dsw-alias-label-primary)}
.psd-run-pin:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-run[data-pinned='true']{background-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 7%,transparent)}
.psd-run[data-pinned='true'] .psd-run-pin{opacity:1;visibility:visible;pointer-events:none;color:var(--dsw-alias-state-business-primary);transition:background-color 120ms var(--ds-ease-in-out,ease)}
.psd-run[data-pinned='true']:hover .psd-run-pin,.psd-run[data-pinned='true']:focus-within .psd-run-pin{pointer-events:auto}
/* Pinned rows keep their violet tint under the full-row hover surface: this rule
   carries the same :not(:has(...)) guard as the generic hover rule, so its higher
   specificity (0,5,0) beats (0,4,0) and layers the hover token over the tint. The
   atmosphere suppression below stays at the same specificity and is declared later,
   so a pinned current row still keeps its transparent surface. */
.psd-run[data-pinned='true']:hover{background-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 7%,var(--dsw-alias-interactive-bg-hover))}
html[data-input-modality='keyboard'] .psd-run[data-pinned='true']:focus-within{background-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 7%,var(--dsw-alias-interactive-bg-hover))}
@media (prefers-reduced-motion: reduce){
  .psd-run-pin,.psd-run-pin-slot,.psd-run-open{transition:none}
  .psd-run:hover .psd-run-pin,.psd-run:focus-within .psd-run-pin,
  .psd-run:hover .psd-run-pin-slot,.psd-run:focus-within .psd-run-pin-slot,
  .psd-run:hover .psd-run-open,.psd-run:focus-within .psd-run-open,
  .psd-run[data-pinned='true'] .psd-run-pin,
  .psd-run[data-pinned='true'] .psd-run-pin-slot,
  .psd-run[data-pinned='true'] .psd-run-open,
  .psd-run[data-pinned='true']:hover .psd-run-pin,
  .psd-run[data-pinned='true']:focus-within .psd-run-pin{transition:none}
}
.psd-run-toggle{appearance:none;position:relative;z-index:1;flex:none;width:var(--psd-lead-col,16px);height:26px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}
.psd-run-toggle:hover{color:var(--dsw-alias-label-primary)}
.psd-run-toggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-run-toggle .psd-triangle{transition:transform 150ms var(--ds-ease-in-out,ease)}
.psd-run-toggle[aria-expanded='true'] .psd-triangle{transform:rotate(90deg)}
.psd-run-lead-spacer{flex:none;width:var(--psd-lead-col,16px)}
.psd-children{position:relative;display:flex;flex-direction:column;gap:5px;margin:4px 0 6px 32.5px;padding-left:9px;border-left:1px solid var(--dsw-alias-border-l2)}
.psd-child{position:relative;display:flex;align-items:center;gap:2px;min-width:0;min-height:var(--psd-row-h,34px);padding:0 8px 0 0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dsw-font-xs-13-font-size,13px);line-height:18px;text-align:left;cursor:pointer}
.psd-child-main{appearance:none;display:flex;flex:0 1 auto;box-sizing:border-box;min-width:0;min-height:var(--psd-row-h,34px);max-width:calc(100% - var(--psd-tail-col,46px) - 4px);align-items:center;gap:7px;padding:3px 8px 3px 10.5px;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.psd-child:hover{background-color:var(--dsw-alias-interactive-bg-hover)}
html[data-input-modality='keyboard'] .psd-child:focus-within{background-color:var(--dsw-alias-interactive-bg-hover)}
.psd-child::before{content:'';position:absolute;left:-10px;top:50%;width:14px;height:1px;background:var(--dsw-alias-border-l2);pointer-events:none}
.psd-child:last-child::after{content:'';position:absolute;left:-10px;top:calc(50% + 1px);bottom:-1px;width:2px;background:var(--dsw-alias-bg-layer-1);pointer-events:none}
.psd-child-main:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-child-glyph{flex:none;display:inline-flex;align-items:center;justify-content:center}
.psd-child-title{flex:1;min-width:0;overflow:hidden;text-overflow:clip;white-space:nowrap}
.psd-child-brand{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary)}
.psd-pending-flag{display:inline-flex;align-items:center;justify-content:center;flex:none;width:14px;height:14px;color:var(--dsw-alias-state-warn-primary);pointer-events:auto}
.dps-row-pending-flag{display:inline-flex;align-items:center;justify-content:center;flex:none;width:14px;height:14px;color:var(--dsw-alias-state-warn-primary);pointer-events:none}
.dps-row-pending-flag-fallback{margin-inline-end:6px}
.dps-row-pending-slot > :not(.dps-row-pending-flag){display:none!important}
.psd-hovercard{position:fixed;z-index:1000;box-sizing:border-box;width:${DW_HOVERCARD_WIDTH}px;max-height:min(${DW_HOVERCARD_MAX_HEIGHT}px,calc(100vh - 16px));overflow-x:hidden;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none;padding:12px 16px;border:0;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-hovercard-bg,#2c2c2e);color:var(--dsw-static-neutral-bluish-00,#fff);box-shadow:var(--dsw-shadow-lv3,0 0 1px #0003,0 0 4px #00000005,0 12px 32px #00000014);font:inherit;font-size:12px;line-height:16px;pointer-events:none}
.psd-hovercard::-webkit-scrollbar{display:none;width:0;height:0}
.psd-hovercard-content{display:flex;flex-direction:column;gap:8px}
.psd-hovercard-title{color:var(--dsw-static-neutral-bluish-00,#fff);font-size:14px;line-height:20px;font-weight:400;overflow-wrap:break-word}
.psd-hovercard-session{color:var(--dsw-static-neutral-bluish-00,#fff);font-size:13px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psd-hovercard-path{color:var(--dsw-static-neutral-bluish-300,#cfd3d6);font-size:12px;line-height:16px;white-space:normal;word-break:break-all;overflow-wrap:anywhere;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
.psd-hovercard-time{color:var(--dsw-static-neutral-bluish-300,#cfd3d6);font-size:12px;line-height:16px}
.psd-hovercard-status{display:flex;align-items:center;gap:8px;color:var(--dsw-static-neutral-bluish-400,#adb2b8);font-size:12px;line-height:20px}
.psd-hovercard-dot{flex:none;width:10px;height:10px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-state-business-primary)}
.psd-hovercard-dot[data-state='done']{background:var(--dsw-alias-state-success-primary)}
.psd-hovercard-row{display:flex;gap:8px;min-width:0;font-size:12px;line-height:16px}
.psd-hovercard-key{flex:none;color:var(--dsw-static-neutral-bluish-400,#adb2b8)}
.psd-hovercard-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-static-neutral-bluish-300,#cfd3d6)}
.psd-hovercard-section{display:flex;flex-direction:column;gap:2px;padding-top:8px;border-top:1px solid var(--psd-card-divider,rgba(255,255,255,.12))}
.psd-hovercard-section-head{display:flex;align-items:baseline;gap:8px;min-width:0;font-size:12px;line-height:16px}
.psd-hovercard-section-title{flex:none;color:var(--dsw-static-neutral-bluish-00,#fff)}
.psd-hovercard-section-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:var(--dsw-static-neutral-bluish-300,#cfd3d6);font-variant-numeric:tabular-nums}
.psd-hovercard-row-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:var(--dsw-static-neutral-bluish-300,#cfd3d6);font-variant-numeric:tabular-nums}
/* Theme-following session info cards (user fix). The plugin cards below copied
   the native hover-card recipe (#2C2C2E + static light palette) verbatim, so in
   light mode they stayed dark. Light mode now uses the light shell surface and
   theme text tokens; dark mode keeps the original recipe byte-identical (the
   fallback values are the static palette). */
body:not([data-ds-dark-theme]) .psd-hovercard,
body:not([data-ds-dark-theme]) .psp-rail-card,
body:not([data-ds-dark-theme]) .psp-search-card,
body:not([data-ds-dark-theme]) .dsa-quicklook{
  --psd-card-divider:var(--dsw-alias-border-l2);
  --dsw-hovercard-bg:var(--dsw-alias-bg-layer-1,#fff);
  --dsw-static-neutral-bluish-00:var(--dsw-alias-label-primary,#0f1115);
  --dsw-static-neutral-bluish-300:var(--dsw-alias-label-secondary,#61666b);
  --dsw-static-neutral-bluish-400:var(--dsw-alias-label-tertiary,#81858c);
}

/* Running & recent row text vs native Workspace rows (user fix). In light mode
   finished rows and child rows used the secondary label token (#61666b) titles while
   native Workspace session titles are the primary label token (#0f1115), so the panel
   read lighter/less readable. Align all row titles (and the child row/glyph) to
   the native primary token; time keeps the tertiary label like native rows, while
   the highlighted row keeps its earlier secondary-label lift for contrast on
   the pastel atmosphere. Dark mode unchanged. */
body:not([data-ds-dark-theme]) .psd-run[data-state='done'] .psd-run-title,
body:not([data-ds-dark-theme]) .psd-child-title,
body:not([data-ds-dark-theme]) .psd-child{color:var(--dsw-alias-label-primary,#0f1115)}
/* Running & recent icon colours (user fix): the minor row/panel icons used the
   tertiary label (#81858c) while the native Workspace icons the user compared
   against read darker. Light mode lifts the plugin's interactive/disclosure icons
   (row actions, disclosure toggle + chevron, child glyphs, status glyph) to the
   secondary label (#61666b) so they sit at or above the native row icon weight;
   the brand/sparkle/indicator glyphs already use the primary label. Geometry,
   sizes and layout are untouched; dark mode keeps its original tertiary icons. */
body:not([data-ds-dark-theme]) :is(.psd-row-action,.psd-chevron,.psd-panel-chevron){color:var(--dsw-alias-label-secondary,#61666b)}
.psd-run,.psd-child{--psd-title-fade:28px}
/* The trailing cell's overlay: the "…" trigger and the New session button,
   revealed over the time by opacity. Every row reserves the same cell, so every
   time ends on the same x. */
.psd-run-actions{position:absolute;inset:0;display:inline-flex;align-items:center;justify-content:flex-end;gap:2px;opacity:0;pointer-events:none;transition:opacity 120ms var(--ds-ease-in-out,ease)}
.psd-run:hover .psd-run-actions,.psd-run:focus-within .psd-run-actions,.psd-child:hover .psd-run-actions,.psd-child:focus-within .psd-run-actions,.psd-run[data-menu-open='true'] .psd-run-actions{opacity:1;pointer-events:auto}
/* Continue on an interrupted main row is an inline slot in the row head: it
   expands from 0 to 22 px over the faded title tail and never moves the time
   cell. */
.psd-continue-slot{flex:none;display:inline-flex;align-items:center;justify-content:center;width:0;height:20px;margin-right:0;overflow:hidden;opacity:0;pointer-events:none;transition:width 200ms var(--ds-ease-in-out,ease) 160ms,margin-right 200ms var(--ds-ease-in-out,ease) 160ms,opacity 120ms var(--ds-ease-in-out,ease) 0ms}
.psd-run:hover .psd-continue-slot,.psd-run:focus-within .psd-continue-slot,.psd-child:hover .psd-continue-slot,.psd-child:focus-within .psd-continue-slot{width:22px;margin-right:2px;opacity:1;pointer-events:auto;transition:width 200ms var(--ds-ease-in-out,ease) 0ms,margin-right 200ms var(--ds-ease-in-out,ease) 0ms,opacity 120ms var(--ds-ease-in-out,ease) 0ms}
.psd-child .psd-continue-slot{height:18px}
.psd-child:hover .psd-continue-slot,.psd-child:focus-within .psd-continue-slot{width:18px}
.psd-continue-inline{display:inline-flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;margin:0;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;opacity:1;pointer-events:auto}
.psd-continue-inline svg{display:block;flex:none}
.psd-continue-inline:hover{color:var(--dsw-alias-label-primary)}
.psd-continue-inline:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-child .psd-continue-inline{width:18px;height:18px}
body:not([data-ds-dark-theme]) .psd-run-current .psd-interrupted,
body:not([data-ds-dark-theme]) .psd-child-current .psd-interrupted{color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 72%,var(--dsw-alias-label-primary))}
.psd-row-action{appearance:none;display:inline-flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer}
.psd-row-action:hover{color:var(--dsw-alias-label-primary)}
.psd-row-action:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-row-action[data-variant='continue']{color:var(--dsw-alias-state-warn-primary)}
.psd-interrupted{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;color:var(--dsw-alias-state-warn-primary)}
@media (prefers-reduced-motion: reduce){
  .psd-run-actions,.psd-row-continue{transition:none}
  .psd-continue-slot,.psd-child .psd-continue-slot,
  .psd-run:hover .psd-continue-slot,.psd-run:focus-within .psd-continue-slot,
  .psd-child:hover .psd-continue-slot,.psd-child:focus-within .psd-continue-slot{transition:none}
}
.psd-group-header{flex:none;display:block;margin:3px 0 0}
.psd-group-header[data-group='inactive']{margin-top:10px;padding-top:3px;border-top:0.5px solid var(--dsw-alias-border-l1)}
.psd-group-toggle{appearance:none;display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:4px 8px 4px 10px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:14px;line-height:20px;font-weight:400;text-align:left;cursor:pointer}
.psd-group-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.psd-group-toggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psd-group-toggle[aria-expanded='false'] .psd-chevron{transform:rotate(-90deg)}
.psd-group-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psd-group-count{flex:none;min-width:16px;padding:0 5px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px;text-align:center;font-variant-numeric:tabular-nums;font-weight:500}
/* Shared rainbow focus ring for plugin inputs. Replaces solid-color focus borders;
   used by the prompt-history search field and the settings choice pills, and
   available to the annotation note editors once that surface is rewritten. */
@property --psf-ring-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
.psf-rainbow-focus{--psf-ring-sat:.92;--psf-ring-glow:5px;--psf-ring-glow-alpha:.38;--psf-ring-opacity:1;--psf-ring-thickness:2px;position:relative}
.psf-rainbow-focus::after{content:'';position:absolute;inset:-2px;border-radius:calc(var(--dsw-radius-sm,8px) + 2px);padding:var(--psf-ring-thickness,2px);background:conic-gradient(from var(--psf-ring-angle,0deg),#ff6b6b,#ffc46b,#e8e86b,#6bffab,#6bd9ff,#a78bff,#ff6bd4,#ff6b6b);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;opacity:0;transition:opacity 140ms var(--ds-ease-in-out,ease);filter:saturate(var(--psf-ring-sat,.92)) drop-shadow(0 0 var(--psf-ring-glow,5px) rgba(178,150,255,var(--psf-ring-glow-alpha,.38)));z-index:2}
.psf-rainbow-focus:focus-within::after,.psf-rainbow-focus:focus-visible::after{opacity:var(--psf-ring-opacity,1);animation:psf-ring-spin 3.2s linear infinite,psf-ring-hue 14s linear infinite}
@keyframes psf-ring-spin{to{--psf-ring-angle:360deg}}
@keyframes psf-ring-hue{from{filter:hue-rotate(0deg) saturate(var(--psf-ring-sat,.92)) drop-shadow(0 0 var(--psf-ring-glow,5px) rgba(178,150,255,var(--psf-ring-glow-alpha,.38)))}to{filter:hue-rotate(360deg) saturate(var(--psf-ring-sat,.92)) drop-shadow(0 0 var(--psf-ring-glow,5px) rgba(178,150,255,var(--psf-ring-glow-alpha,.38)))}}
@media (prefers-reduced-motion: reduce){.psf-rainbow-focus:focus-within::after,.psf-rainbow-focus:focus-visible::after{animation:none}}
@media (forced-colors: active){.psf-rainbow-focus::after{display:none}.psf-rainbow-focus:focus-within{outline:2px solid Highlight;outline-offset:1px}}
/* Current-session highlight: a full-pill rainbow "atmosphere" painted INSIDE the
   row's own rounded rectangle, with the real content layered on top (design doc
   "Rainbow Atmosphere V3 — Session Row Integration"). Layer order inside one
   clipped rounded rect: (0) the row's existing neutral surface is untouched;
   (1) .psd-atmos is an absolutely positioned, radius-clipped wrapper that holds
   a small Canvas 2D gas renderer (drifting prism blobs, screen blend, blurred);
   (2) .psd-atmos-scrim is a faint dark gradient above the canvas that keeps the
   title/time/actions readable; (3) the real row content is raised to z-index 2.
   Everything is pointer-events:none and clipped by the wrapper's overflow, so
   the row radius, grid, hover actions and hit areas never change. The same
   treatment is applied to the owning native Workspace row
   (data-psd-current-workspace) and, since B4 v3, to the native sidebar Session
   row of the open Session (data-psd-current-session); only highlighted rows get
   a renderer. Reduced motion paints one static pastel frame and stops rAF; a
   hidden tab pauses the loop; the renderer is destroyed when the row stops
   being highlighted. */
.psd-atmos{position:absolute;inset:0;z-index:0;border-radius:inherit;overflow:hidden;pointer-events:none;isolation:isolate;opacity:.78;transition:opacity 220ms var(--ds-ease-in-out,ease)}
.psd-atmos-canvas{display:block;width:100%;height:100%;pointer-events:none;filter:blur(3px) saturate(1.5) brightness(1.05);mix-blend-mode:multiply}
.psd-atmos-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(90deg,rgba(16,18,22,.08),rgba(16,18,22,.16))}
.psd-run-current:hover .psd-atmos,.psd-child-current:hover .psd-atmos,[data-psd-current-workspace='true']:hover .psd-atmos,[data-psd-current-session='true']:hover .psd-atmos{opacity:.92}
.psd-run-current,.psd-child-current,[data-psd-current-workspace='true'],[data-psd-current-session='true']{position:relative;isolation:isolate}
.psd-run-current > *:not(.psd-atmos),.psd-child-current > *:not(.psd-atmos){position:relative;z-index:2}
[data-psd-current-workspace='true'] > *:not([data-psd-atmos]),[data-psd-current-session='true'] > *:not([data-psd-atmos]){position:relative;z-index:2}
/* Rainbow-atmosphere rows must not receive the ordinary hover/pinned surface
   highlight on top of the animation: the extra rounded pill inside the rainbow
   rectangle reads as a second, misaligned highlight (user report). Suppress only
   the row-body surface highlight for atmosphere rows — the small control hovers
   (pin, New session, disclosure) stay. The native sidebar current Session and
   Workspace rows get the same treatment so their own hover/selected background
   never mixes into the rainbow paint. */
/* The suppression carries one extra class so it beats the plain row hover rule
   regardless of source order. */
.psd-run.psd-run-current:hover,
.psd-child.psd-child-current:hover{background-color:transparent}
html[data-input-modality='keyboard'] .psd-run.psd-run-current:focus-within,
html[data-input-modality='keyboard'] .psd-child.psd-child-current:focus-within{background-color:transparent}
.psd-run.psd-run-current[data-pinned='true']{background-color:transparent}
[data-psd-current-workspace='true'],[data-psd-current-session='true']{background-color:transparent!important}
/* With no surface highlight to paint, the row's affordance becomes a brightness
   lift on the content itself (user request: brighten the text/icons instead of
   the background). Atmosphere rows sit slightly brighter than plain rows while
   highlighted, and hover/focus lifts them one more step; the filter brightens
   the real text and SVG glyphs uniformly in both themes (white text clamps,
   grey icons/numbers gain contrast on the rainbow). */
.psd-run-current > *:not(.psd-atmos),.psd-child-current > *:not(.psd-atmos),[data-psd-current-session='true'] > *:not([data-psd-atmos]),[data-psd-current-workspace='true'] > *:not([data-psd-atmos]){filter:brightness(1.15);transition:filter 140ms var(--ds-ease-in-out,ease)}
.psd-run-current:hover > *:not(.psd-atmos),.psd-child-current:hover > *:not(.psd-atmos),[data-psd-current-session='true']:hover > *:not([data-psd-atmos]),[data-psd-current-workspace='true']:hover > *:not([data-psd-atmos]){filter:brightness(1.5)}
/* The focus half is keyboard-only, like the shell's own focus surfaces: a mouse
   click on a current-row control must not leave the whole row brightened. */
html[data-input-modality='keyboard'] .psd-run-current:focus-within > *:not(.psd-atmos),
html[data-input-modality='keyboard'] .psd-child-current:focus-within > *:not(.psd-atmos){filter:brightness(1.5)}
@media (prefers-reduced-motion: reduce){.psd-run-current > *:not(.psd-atmos),.psd-child-current > *:not(.psd-atmos),[data-psd-current-session='true'] > *:not([data-psd-atmos]),[data-psd-current-workspace='true'] > *:not([data-psd-atmos]){transition:none}}
/* Native sidebar rows' action buttons keep only the transparent-background
   suppression inside the rainbow rectangle (they must not stack a block on the
   row surface). They get no extra brightness step either: the row-level
   brightness lift is the only highlight, the same rule the card follows. */
[data-psd-current-session='true'] button:hover,[data-psd-current-session='true'] [role='button']:hover,[data-psd-current-workspace='true'] button:hover,[data-psd-current-workspace='true'] [role='button']:hover{background-color:transparent!important}
/* Dark-mode atmosphere is intentionally lighter/pastel than the first vivid
   recipe: the canvas keeps the screen blend but is less saturated and brighter,
   the wrapper is slightly less opaque, and the scrim is a soft white veil
   instead of a dark one (user request: lighten it, reference the light mode). */
body[data-ds-dark-theme] .psd-atmos-canvas{mix-blend-mode:screen;filter:blur(3px) saturate(1.30) brightness(1.35)}
body[data-ds-dark-theme] .psd-atmos{opacity:.62}
body[data-ds-dark-theme] .psd-run-current:hover .psd-atmos,body[data-ds-dark-theme] .psd-child-current:hover .psd-atmos,body[data-ds-dark-theme] [data-psd-current-workspace='true']:hover .psd-atmos,body[data-ds-dark-theme] [data-psd-current-session='true']:hover .psd-atmos{opacity:.68}
body[data-ds-dark-theme] .psd-atmos-scrim{background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.02))}
/* Light-mode readability (user fix). The multiply canvas over the light surface
   turned the pill into a medium saturated tone; the shell's tertiary time/icons
   and the hover-revealed row actions then nearly vanished. In light mode the
   rainbow stays visible as a brighter pastel veil: the canvas is a touch
   brighter and less saturated, the wrapper is less opaque, and the scrim is a
   light veil (not a dark one). The plugin's own secondary text/icons inside the
   highlighted rows are lifted from label-tertiary to label-secondary so they
   clear WCAG AA on the remaining pastel. Dark mode is untouched. */
body:not([data-ds-dark-theme]) .psd-atmos-canvas{filter:blur(3px) saturate(1.35) brightness(1.22)}
body:not([data-ds-dark-theme]) .psd-atmos{opacity:.60}
body:not([data-ds-dark-theme]) .psd-atmos-scrim{background:linear-gradient(90deg,rgba(255,255,255,.48),rgba(255,255,255,.36))}
body:not([data-ds-dark-theme]) .psd-run-current:hover .psd-atmos,body:not([data-ds-dark-theme]) .psd-child-current:hover .psd-atmos,body:not([data-ds-dark-theme]) [data-psd-current-workspace='true']:hover .psd-atmos,body:not([data-ds-dark-theme]) [data-psd-current-session='true']:hover .psd-atmos{opacity:.68}
body:not([data-ds-dark-theme]) .psd-run-current :is(.psd-run-brand,.psd-row-action),body:not([data-ds-dark-theme]) .psd-child-current :is(.psd-child-brand,.psd-row-action){color:var(--dsw-alias-label-secondary)}
body:not([data-ds-dark-theme]) .psd-run-current .psd-run-time,body:not([data-ds-dark-theme]) .psd-child-current .psd-child-time{color:var(--dsw-alias-label-primary)}
/* Status dots keep their semantic shell colours (user fix): the light-mode icon
   lift above must not repaint the shell StateDot currentColor. The wrapper keeps
   the task-62 secondary weight for non-dot child glyphs; the semantic state
   colours win for the dot itself: ongoing business, completed success green,
   idle idle colour. Dark mode keeps its shell tokens. */
body:not([data-ds-dark-theme]) :is(.psd-run,.psd-child) :is(.psd-run-glyph,.psd-child-glyph){color:var(--dsw-alias-label-primary,#0f1115)}
body:not([data-ds-dark-theme]) :is(.psd-run,.psd-child) :is(.psd-run-glyph,.psd-child-glyph)[data-state='ongoing'],
body:not([data-ds-dark-theme]) :is(.psd-run,.psd-child) :is(.psd-run-glyph,.psd-child-glyph) [data-state='ongoing']{color:var(--dsw-alias-state-business-primary)}
body:not([data-ds-dark-theme]) :is(.psd-run,.psd-child) :is(.psd-run-glyph,.psd-child-glyph)[data-state='done'],
body:not([data-ds-dark-theme]) :is(.psd-run,.psd-child) :is(.psd-run-glyph,.psd-child-glyph) [data-state='done']{color:var(--dsw-alias-state-success-primary)}
body:not([data-ds-dark-theme]) :is(.psd-run,.psd-child) :is(.psd-run-glyph,.psd-child-glyph)[data-state='idle'],
body:not([data-ds-dark-theme]) :is(.psd-run,.psd-child) :is(.psd-run-glyph,.psd-child-glyph) [data-state='idle']{color:var(--dsw-alias-state-idle-primary)}

/* Row action hover + keyboard focus (user fix): the light-mode icon-lift rule
   above (0,2,1) outranks the base .psd-row-action:hover (0,2,0), so re-assert the
   primary label for hover and focus-visible in light mode; dark mode already
   darkens through the base hover rule, which no colour override outranks. */

body:not([data-ds-dark-theme]) .psd-row-action:hover,
body:not([data-ds-dark-theme]) .psd-row-action:focus-visible{color:var(--dsw-alias-label-primary)}
/* Owner request: while a card row is highlighted — pointer on it, keyboard focus
   inside it, or an open row menu — every glyph in that row reads at the title
   colour (label-primary) and nothing else changes. The row bar is the only hover
   surface: no control paints its own block or its own brightness step (the
   rainbow row keeps its whole-content lift on the row, not on a control). This
   covers the disclosure triangle, the pin, the "…" trigger, New session,
   Continue and the brand/robot identity glyphs in both themes — light yields
   #0f1115 and dark #f9fafb, the same token the title uses on that row. A status
   dot keeps its shell state colour, because that colour is the
   running/finished/idle data rather than a text weight. Child combinators keep a
   nested subagent row's own controls out. */
.psd-run:hover > :is(.psd-run-main,.psd-run-tail) :is(.psd-run-brand,.psd-continue-inline,.psd-run-more,.psd-run-actions .psd-row-action),
.psd-run:hover > .psd-run-toggle,
.psd-run[data-menu-open='true'] > :is(.psd-run-main,.psd-run-tail) :is(.psd-run-brand,.psd-continue-inline,.psd-run-more,.psd-run-actions .psd-row-action),
.psd-run[data-menu-open='true'] > .psd-run-toggle,
html[data-input-modality='keyboard'] .psd-run:focus-within > :is(.psd-run-main,.psd-run-tail) :is(.psd-run-brand,.psd-continue-inline,.psd-run-more,.psd-run-actions .psd-row-action),
html[data-input-modality='keyboard'] .psd-run:focus-within > .psd-run-toggle,
.psd-child:hover > .psd-child-main :is(.psd-child-brand,.psd-continue-inline),
html[data-input-modality='keyboard'] .psd-child:focus-within > .psd-child-main :is(.psd-child-brand,.psd-continue-inline){color:var(--dsw-alias-label-primary)}
/* Same rule for the shell's own sidebar rows — Session rows and the Workspace
   (project) row above them: their strips pin the row-menu trigger and New
   session to label-tertiary and only darken while that single button is hovered,
   so on a highlighted row they read washed out next to the label-primary title.
   Rows are anchored by their stable data-row-key attribute (no hashed module
   class), the strip by the module class suffix, and the menu-open state by the
   same suffix on the row. Archived Session rows are excluded: the shell dims
   their title to label-caption on purpose, so the strip must stay dim too. */
:is([data-row-key^='session:'],[data-row-key^='workspace:']):not([class*='archived']):hover [class*='rowActions'] :is(button,[role='button']),
:is([data-row-key^='session:'],[data-row-key^='workspace:'])[class*='menuOpen'] [class*='rowActions'] :is(button,[role='button']),
html[data-input-modality='keyboard'] :is([data-row-key^='session:'],[data-row-key^='workspace:']):focus-within [class*='rowActions'] :is(button,[role='button']),
[data-psd-current-session='true'] [class*='rowActions'] :is(button,[role='button']),
[data-psd-current-workspace='true'] [class*='rowActions'] :is(button,[role='button']){color:var(--dsw-alias-label-primary)}
/* Owner request: on the native Workspace row the folder glyph and the
   disclosure chevron/arrow sit on the shell's tertiary slot / caption weights,
   so under the rainbow bar (and on hover) they read washed out next to the
   label-primary title. Highlighted Workspace rows — hover, keyboard focus, or
   the rainbow marker the plugin itself sets — carry the title colour on those
   glyphs instead. The shell puts slot + folder (or slot + chevron) on the same
   span, so the match is on the glyph class. The folder of the Workspace that
   holds the current Session (folderActive, business blue) is included on
   purpose: the business blue does not read on the rainbow, so on a highlighted
   row the title colour wins there too (owner decision). */
[data-row-key^='workspace:']:hover :is([class*='folder'],[class*='chevron']),
[data-psd-current-workspace='true'] :is([class*='folder'],[class*='chevron']),
html[data-input-modality='keyboard'] [data-row-key^='workspace:']:focus-within :is([class*='folder'],[class*='chevron']){color:var(--dsw-alias-label-primary)}
/* Owner follow-up: the row's own glyphs join the same rule. The brand sparkle is
   label-primary already and is demoted only by the light-mode current-row lift,
   so only that arm is needed; the pin is tertiary until it is shown (hover or a
   pinned row), and a pinned pin keeps the business colour. A status dot keeps
   its shell state colour because that colour is the running/finished/idle data,
   not a text weight. */
.psd-run.psd-run-current > .psd-run-main .psd-run-brand,
.psd-run:not([data-pinned='true']):hover > .psd-run-main .psd-run-pin,
html[data-input-modality='keyboard'] .psd-run:not([data-pinned='true']):focus-within > .psd-run-main .psd-run-pin{color:var(--dsw-alias-label-primary)}
/* Owner report: under the rainbow bar only, and in light mode only, the
   light-mode lift demotes the subagent row's brand span to label-secondary while
   the child title stays label-primary, so the robot glyph reads one step paler
   than its own title on the very row the atmosphere highlights. Restore the
   title colour there. Dark mode is left alone: there the child title is the
   dimmed secondary label while that glyph is primary, i.e. one step brighter. */
body:not([data-ds-dark-theme]) .psd-child.psd-child-current > .psd-child-main .psd-child-brand{color:var(--dsw-alias-label-primary)}
/* Owner request: on the highlighted row the time reads like the title, and the
   title/time carry the selection in bold (the gas behind them is not uniform). */
[data-psd-current-session='true'] [class*='timestamp'],
[data-psd-current-workspace='true'] [class*='timestamp']{color:var(--dsw-alias-label-primary)}
/* The gas is not uniformly dark, so text needs its own contrast guarantee: a
   soft halo behind the row content keeps the title/time readable on the bright
   hue patches without dimming the smoke itself. */
.psd-run-current > *:not(.psd-atmos),
.psd-child-current > *:not(.psd-atmos),
[data-psd-current-session='true'] > *:not([data-psd-atmos]),
[data-psd-current-workspace='true'] > *:not([data-psd-atmos]){text-shadow:0 1px 2px rgba(0,0,0,.55),0 0 1px rgba(0,0,0,.35)}
body:not([data-ds-dark-theme]) .psd-run-current > *:not(.psd-atmos),
body:not([data-ds-dark-theme]) .psd-child-current > *:not(.psd-atmos),
body:not([data-ds-dark-theme]) [data-psd-current-session='true'] > *:not([data-psd-atmos]),
body:not([data-ds-dark-theme]) [data-psd-current-workspace='true'] > *:not([data-psd-atmos]){text-shadow:0 1px 2px rgba(255,255,255,.85),0 0 1px rgba(255,255,255,.6)}
.psd-run-current :is(.psd-run-title,.psd-run-time),
.psd-child-current :is(.psd-child-title,.psd-child-time),
[data-psd-current-session='true'] [class*='_title'],
[data-psd-current-session='true'] [class*='timestamp'],
[data-psd-current-workspace='true'] [class*='_title'],
[data-psd-current-workspace='true'] [class*='timestamp']{font-weight:600}
@media (prefers-reduced-motion: reduce){.psd-atmos{transition:none}}

`

/**
 * Mount the Canvas 2D rainbow-gas renderer into one atmosphere wrapper.
 *
 * The canvas is the wrapper's first child; it fills the wrapper (the row's own
 * radius clips it), paints a handful of drifting prism blobs with a screen-like
 * additive blend, and is disposed when the row stops being highlighted. One
 * renderer per highlighted row; no RAFs for non-highlighted rows. A hidden tab
 * pauses the loop, reduced motion draws a single static frame.
 *
 * The motion itself lives in `atmosphere.ts` (hue slots + bounded spring); this
 * function only owns the canvas, the palette paint and the frame loop.
 * @param {HTMLElement} host - the .psd-atmos wrapper.
 * @returns {{ destroy: () => void }} disposer.
 */
function dwAtmosphereMount(host: HTMLElement): { destroy(): void } {
  const canvas = document.createElement('canvas')
  canvas.className = 'psd-atmos-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  host.insertBefore(canvas, host.firstChild)
  const ctx = canvas.getContext('2d', { alpha: true })
  if (ctx === null) {
    canvas.remove()
    return { destroy: () => {} }
  }
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  // The gas itself (particles, flow field, hue-arc blending) is a pure model so
  // its invariants are unit-testable; this closure only paints it. Density and
  // hue are separate layers: the mask blobs are white, and the colour is chosen
  // per pixel from the dominant hue layer, so hues can never average to grey.
  const model = createAtmosphereModel()
  const layerCanvases: HTMLCanvasElement[] = []
  for (let index = 0; index < DW_ATMOS_HUES.length; index += 1) {
    const layer = document.createElement('canvas')
    layerCanvases.push(layer)
  }
  const layerContexts = layerCanvases.map((layer) => layer.getContext('2d', { alpha: true }))
  let composite: ImageData | null = null
  let hueTable: Uint8ClampedArray | null = null
  let hueTableKey = ''
  let raf = 0
  let lastFrame = 0
  let lastDraw = 0
  let disposed = false
  const state = (running: boolean, motion: string): void => {
    host.setAttribute('data-psd-atmos-running', running ? 'true' : 'false')
    host.setAttribute('data-psd-atmos-motion', motion)
  }
  /** 360-entry hue -> RGB table for one theme (built once per palette). */
  const tableFor = (): Uint8ClampedArray => {
    const palette = document.body.hasAttribute('data-ds-dark-theme') ? DW_ATMOS_PALETTES.dark : DW_ATMOS_PALETTES.light
    const key = `${palette[0].l}:${palette[0].c}`
    if (hueTable !== null && hueTableKey === key) return hueTable
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    const px = probe.getContext('2d', { willReadFrequently: true })
    const table = new Uint8ClampedArray(360 * 3)
    if (px !== null) {
      for (let deg = 0; deg < 360; deg += 1) {
        px.fillStyle = atmospherePaint({ l: palette[0].l, c: palette[0].c, hue: deg }, 1)
        px.fillRect(0, 0, 1, 1)
        const data = px.getImageData(0, 0, 1, 1).data
        table[deg * 3] = data[0]
        table[deg * 3 + 1] = data[1]
        table[deg * 3 + 2] = data[2]
      }
    }
    hueTable = table
    hueTableKey = key
    return table
  }
  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
    // Composite slightly below the backing store: the CSS blur hides the
    // upscale, and eight layer buffers per renderer stay cheap.
    const width = Math.max(2, Math.round(rect.width * dpr * DW_SMOKE.layerScale))
    const height = Math.max(2, Math.round(rect.height * dpr * DW_SMOKE.layerScale))
    if (canvas.width === width && canvas.height === height) return false
    // Assigning width/height resets the bitmap: the caller must repaint in the
    // same task, before the browser paints the blank backing store.
    canvas.width = width
    canvas.height = height
    for (const layer of layerCanvases) {
      layer.width = width
      layer.height = height
    }
    composite = null
    return true
  }
  const drawBlob = (context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, alpha: number): void => {
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius)
    gradient.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(3)})`)
    gradient.addColorStop(0.55, `rgba(255,255,255,${(alpha * 0.5).toFixed(3)})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.beginPath()
    context.arc(cx, cy, radius, 0, Math.PI * 2)
    context.fill()
  }
  const draw = (): void => {
    if (disposed) return
    const width = canvas.width
    const height = canvas.height
    if (width === 0 || height === 0) return
    const span = Math.max(width, height)
    for (const context of layerContexts) context?.clearRect(0, 0, width, height)
    for (const particle of model.particles) {
      const context = layerContexts[particle.hue]
      const layer = layerCanvases[particle.hue]
      if (context === null || context === undefined || layer === undefined) continue
      const cx = particle.x * width
      const cy = particle.y * height
      const radius = Math.max(2, span * particle.size)
      drawBlob(context, cx, cy, radius, particle.alpha)
      // A wrapped particle has to be painted on both sides of the seam, or its
      // hue pops out of one edge and into the other.
      if (cx - radius < 0) drawBlob(context, cx + width, cy, radius, particle.alpha)
      if (cx + radius > width) drawBlob(context, cx - width, cy, radius, particle.alpha)
    }
    const layerData = layerCanvases.map((layer) => {
      const context = layer.getContext('2d', { willReadFrequently: true })
      return context === null ? null : context.getImageData(0, 0, width, height).data
    })
    if (composite === null) composite = ctx.createImageData(width, height)
    const data = composite.data
    // The buffer is reused, so leftover pixels from the previous frame would
    // survive as smears; clear it before compositing.
    data.fill(0)
    const table = tableFor()
    const total = width * height
    // Blend the hues that are close to the leader, weighted by how far above the
    // band threshold they are. A pure argmax produced flat slabs meeting at a
    // hard line (owner: "looks like a bucket of ink"), and a capped top-2 blend
    // only softened that line. The vector sum below is commutative, so the
    // colour is continuous when two layers swap the lead, and because every
    // layer keeps L/C fixed the blend never passes through grey.
    const band = 0.55
    const cos = DW_ATMOS_HUES.map((hue) => Math.cos(hue * Math.PI / 180))
    const sin = DW_ATMOS_HUES.map((hue) => Math.sin(hue * Math.PI / 180))
    const gain = DW_SMOKE.gain / 100
    for (let pixel = 0; pixel < total; pixel += 1) {
      let bestAlpha = 0
      for (let hue = 0; hue < layerData.length; hue += 1) {
        const layer = layerData[hue]
        if (layer === null) continue
        const alpha = layer[pixel * 4 + 3]
        if (alpha > bestAlpha) bestAlpha = alpha
      }
      // Very thin gas is left to the coverage pass below: its colour would be a
      // near-neutral blend and its alpha too low, which reads as a dark patch.
      if (bestAlpha < 40) continue
      const threshold = bestAlpha * band
      let sumX = 0
      let sumY = 0
      for (let hue = 0; hue < layerData.length; hue += 1) {
        const layer = layerData[hue]
        if (layer === null) continue
        const alpha = layer[pixel * 4 + 3]
        if (alpha <= threshold) continue
        const weight = (alpha - threshold) * (alpha - threshold)
        sumX += weight * cos[hue]
        sumY += weight * sin[hue]
      }
      const magnitude = Math.hypot(sumX, sumY)
      const deg = magnitude < 1e-6
        ? 0
        : Math.round(((Math.atan2(sumY, sumX) * 180 / Math.PI) % 360 + 360) % 360) % 360
      data[pixel * 4] = table[deg * 3]
      data[pixel * 4 + 1] = table[deg * 3 + 1]
      data[pixel * 4 + 2] = table[deg * 3 + 2]
      data[pixel * 4 + 3] = Math.min(255, bestAlpha * gain)
    }
    // Close the gaps between particles with the nearest solid colour instead of
    // leaving them transparent or very thin: both show the row's dark surface
    // and read as a black block in the gas (owner report, twice).
    const solid = 150
    for (let y = 0; y < height; y += 1) {
      const row = y * width
      let red = -1
      let green = 0
      let blue = 0
      for (let x = 0; x < width; x += 1) {
        const index = (row + x) * 4
        if (data[index + 3] >= solid) {
          red = data[index]
          green = data[index + 1]
          blue = data[index + 2]
        } else if (red >= 0) {
          data[index] = red
          data[index + 1] = green
          data[index + 2] = blue
          data[index + 3] = 205
        }
      }
      red = -1
      for (let x = width - 1; x >= 0; x -= 1) {
        const index = (row + x) * 4
        if (data[index + 3] >= solid) {
          if (red < 0) {
            red = data[index]
            green = data[index + 1]
            blue = data[index + 2]
          }
        } else if (red >= 0) {
          data[index] = red
          data[index + 1] = green
          data[index + 2] = blue
          data[index + 3] = 205
        }
      }
    }
    ctx.putImageData(composite, 0, 0)
  }
  const frame = (now: number): void => {
    raf = 0
    if (disposed || document.hidden) return
    // Real delta time: the model integrates seconds, so a dropped frame or a
    // 120 Hz display follows the same path (the 33 ms throttle below only
    // limits repaints, never the simulation).
    const dt = lastFrame > 0 ? (now - lastFrame) / 1000 : 0
    lastFrame = now
    advanceAtmosphere(model, dt)
    if (now - lastDraw >= 33) {
      lastDraw = now
      draw()
    }
    raf = window.requestAnimationFrame(frame)
  }
  const stop = () => {
    if (raf !== 0) window.cancelAnimationFrame(raf)
    raf = 0
    lastFrame = 0
  }
  const start = () => {
    stop()
    if (disposed || document.hidden) {
      state(false, motionQuery.matches ? 'static' : 'animated')
      return
    }
    if (motionQuery.matches) {
      state(false, 'static')
      resize()
      draw()
      return
    }
    state(true, 'animated')
    raf = window.requestAnimationFrame(frame)
  }
  const onVisibility = () => {
    if (document.hidden) {
      stop()
      state(false, motionQuery.matches ? 'static' : 'animated')
    } else {
      start()
    }
  }
  const onMotion = () => start()
  // A real size change clears the backing store; repaint synchronously in the
  // same task (before the browser paints), regardless of reduced motion. The
  // 33 ms animation throttle above only governs steady-state frames.
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (resize()) draw() }) : null
  if (observer !== null) observer.observe(canvas)
  document.addEventListener('visibilitychange', onVisibility)
  motionQuery.addEventListener('change', onMotion)
  resize()
  // Paint once synchronously at mount so the first frame is never blank.
  draw()
  start()
  return {
    destroy: () => {
      disposed = true
      stop()
      if (observer !== null) observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      motionQuery.removeEventListener('change', onMotion)
      canvas.remove()
    }
  }
}

/**
 * React host for the atmosphere layers of a highlighted card row. Renders the
 * clipped wrapper (canvas is mounted imperatively) and the contrast scrim.
 * @returns {object} the wrapper element.
 */
function DwAtmosphere(): ReactElement {
  const hostRef = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    const host = hostRef.current
    if (!(host instanceof HTMLElement)) return undefined
    const renderer = dwAtmosphereMount(host)
    return () => renderer.destroy()
  }, [])
  return React.createElement('span', { ref: hostRef, className: 'psd-atmos', 'data-psd-atmos': 'card', 'aria-hidden': true },
    React.createElement('span', { className: 'psd-atmos-scrim', 'aria-hidden': true }))
}

/**
 * One injected native-row atmosphere instance.
 * @typedef {{ host: HTMLElement, wrapper: HTMLElement, renderer: { destroy: () => void }, attr: string }} DwNativeAtmosphere
 */

/** Native-row atmosphere instances, keyed by marker kind. @type {Record<string, DwNativeAtmosphere | null>} */
const dwNativeAtmospheres: Record<'workspace' | 'session', NativeAtmosphere | null> = { workspace: null, session: null }

/**
 * Destroy one injected native-row atmosphere (renderer + wrapper + marker).
 * @param {DwNativeAtmosphere} record - instance.
 * @returns {void}
 */
function dwClearNativeAtmosphere(record: NativeAtmosphere): void {
  record.renderer.destroy()
  if (record.wrapper.isConnected) record.wrapper.remove()
  if (record.host.getAttribute(record.attr) === 'true') record.host.removeAttribute(record.attr)
}

/**
 * Ensure exactly one atmosphere instance per native marker kind, re-injecting it
 * after a native re-render (the node observer calls this on every reconcile).
 * @param {'workspace' | 'session'} kind - marker kind.
 * @param {HTMLElement | null} row - the native row, or null.
 * @param {string} attr - marker attribute.
 * @returns {void}
 */
function dwSyncNativeAtmosphere(kind: 'workspace' | 'session', row: HTMLElement | null, attr: string): void {
  const current = dwNativeAtmospheres[kind]
  if (current !== null && current.host !== row) {
    dwClearNativeAtmosphere(current)
    dwNativeAtmospheres[kind] = null
  }
  if (!(row instanceof HTMLElement)) return
  const existing = dwNativeAtmospheres[kind]
  if (existing !== null && existing.wrapper.isConnected) {
    if (row.getAttribute(attr) !== 'true') row.setAttribute(attr, 'true')
    return
  }
  if (existing !== null) dwClearNativeAtmosphere(existing)
  row.setAttribute(attr, 'true')
  const wrapper = document.createElement('span')
  wrapper.className = 'psd-atmos'
  wrapper.setAttribute('data-psd-atmos', kind)
  wrapper.setAttribute('aria-hidden', 'true')
  const scrim = document.createElement('span')
  scrim.className = 'psd-atmos-scrim'
  scrim.setAttribute('aria-hidden', 'true')
  wrapper.appendChild(scrim)
  row.insertBefore(wrapper, row.firstChild)
  const renderer = dwAtmosphereMount(wrapper)
  dwNativeAtmospheres[kind] = { host: row, wrapper, renderer, attr }
}

/**
 * Apply the atmosphere to the owning native Workspace row and to the native
 * sidebar Session row of the current Session (max two instances).
 * @param {HTMLElement | null} workspaceRow - owning native Workspace row.
 * @param {string | null} currentSessionId - Session open in the main view.
 * @returns {void}
 */
function dwSyncNativeAtmospheres(workspaceRow: HTMLElement | null, currentSessionId: string | null): void {
  dwSyncNativeAtmosphere('workspace', workspaceRow instanceof HTMLElement ? workspaceRow : null, 'data-psd-current-workspace')
  let sessionRow: HTMLElement | null = null
  if (typeof currentSessionId === 'string' && currentSessionId.length > 0) {
    for (const candidate of document.querySelectorAll('[data-row-key^="session:"]')) {
      if (candidate.getAttribute('data-row-key') === `session:${currentSessionId}`) {
        sessionRow = candidate instanceof HTMLElement ? candidate : null
        break
      }
    }
  }
  dwSyncNativeAtmosphere('session', sessionRow, 'data-psd-current-session')
}

/** Tear down every native-row atmosphere instance (panel unmount). */
function dwClearNativeAtmospheres() {
  for (const kind of Object.keys(dwNativeAtmospheres) as Array<'workspace' | 'session'>) {
    const record = dwNativeAtmospheres[kind]
    if (record !== null) dwClearNativeAtmosphere(record)
    dwNativeAtmospheres[kind] = null
  }
}

    /**
     * Format a running duration for the summary card.
     * @param {number} ms - elapsed milliseconds.
     * @param {Function} t - namespace-bound translate.
     * @returns {string} compact duration.
     */
    function dwFormatDuration(ms: number, t: Translate): string {
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
     *
     * The buckets and their thresholds copy the shell's own `relativeTime`
     * helper verbatim (now / minutes / hours / days / months / years), so a card
     * row and a native sidebar Session row never disagree about the same
     * distance.
     * @param {number} ms - elapsed milliseconds.
     * @param {Function} t - namespace-bound translate.
     * @returns {string} relative label.
     */
    function dwFormatRelative(ms: number, t: Translate): string {
      const total = Math.max(0, Math.floor(Number.isFinite(ms) ? ms / 1000 : 0))
      if (total < 60) return t('time.now')
      const minutes = Math.floor(total / 60)
      if (minutes < 60) return t('time.min', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('time.hour', { n: hours })
      const days = Math.floor(hours / 24)
      if (days < 30) return t('time.day', { n: days })
      if (days < 365) return t('time.month', { n: Math.floor(days / 30) })
      return t('time.year', { n: Math.floor(days / 365) })
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
    function dwRunningSubagentParents(list: SessionList | null | undefined, statuses: SessionStatusMap | null | undefined): Map<string, number> {
      const parents = new Map<string, number>()
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
     * Absolute local date-time label for hover detail.
     * @param {number} at - epoch milliseconds.
     * @returns {string} `YYYY-MM-DD HH:MM`, or an empty string for invalid input.
     */
    function dwFormatAbsoluteTime(at: number): string {
      if (typeof at !== 'number' || !Number.isFinite(at)) return ''
      const date = new Date(at)
      const pad = (value: number): string => String(value).padStart(2, '0')
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
    function dwRunningRows(
      list: SessionList | null | undefined,
      statuses: SessionStatusMap | null | undefined,
      workspaces: readonly WorkspaceRow[],
      t: Translate,
      runningParents: Map<string, number>,
      archived: Set<string>,
      activity: Record<string, number>
    ): PanelRow[] {
      const rows: PanelRow[] = []
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
    function dwRecentRows(
      list: SessionList | null | undefined,
      statuses: SessionStatusMap | null | undefined,
      workspaces: readonly WorkspaceRow[],
      t: Translate,
      now: number,
      runningParents: Map<string, number>,
      archived: Set<string>,
      recentMs: number,
      activity: Record<string, number>
    ): PanelRow[] {
      const rows: PanelRow[] = []
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
     * Read the Host-shared pin document. A missing route (older Host, service not
     * restarted yet) or a transport failure reads as null and leaves the local
     * cache authoritative.
     * @returns {Promise<{ rev: number, pinned: string[] } | null>} the document or null.
     */
    async function dwFetchPinnedSessions(): Promise<{ rev: number, pinned: string[] } | null> {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), DW_PIN_REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(appUrl(DW_PIN_ROUTE), {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal: controller.signal
        })
        if (!response.ok) return null
        const payload = await response.json() as { rev?: unknown, pinned?: unknown } | null
        if (payload === null || typeof payload !== 'object') return null
        const rev = typeof payload.rev === 'number' && Number.isFinite(payload.rev) && payload.rev >= 0
          ? Math.floor(payload.rev)
          : 0
        return { rev, pinned: [...dwSanitizePinnedIds(payload.pinned)] }
      } catch {
        return null
      } finally {
        window.clearTimeout(timer)
      }
    }

    /**
     * Publish queued pin operations to the Host and read back the authoritative
     * document.
     * @param {readonly Array<{ op: 'pin' | 'unpin', id: string }>} ops - operations to apply.
     * @returns {Promise<{ rev: number, pinned: string[] } | null>} the document or null.
     */
    async function dwPostPinOps(ops: readonly PendingPinOp[]): Promise<{ rev: number, pinned: string[] } | null> {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), DW_PIN_REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(appUrl(DW_PIN_ROUTE), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ ops }),
          signal: controller.signal
        })
        if (!response.ok) return null
        const payload = await response.json() as { rev?: unknown, pinned?: unknown } | null
        if (payload === null || typeof payload !== 'object') return null
        const rev = typeof payload.rev === 'number' && Number.isFinite(payload.rev) && payload.rev >= 0
          ? Math.floor(payload.rev)
          : 0
        return { rev, pinned: [...dwSanitizePinnedIds(payload.pinned)] }
      } catch {
        return null
      } finally {
        window.clearTimeout(timer)
      }
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
    function dwActiveSessions(
      list: SessionList | null | undefined,
      statuses: SessionStatusMap | null | undefined,
      workspaces: readonly WorkspaceRow[],
      now: number,
      archived: Set<string>,
      activeMs: number,
      activity: Record<string, number>
    ): { rows: Array<{ id: string, running: boolean, updatedAt: number }>, workspaceOf: Map<string, unknown> } {
      const workspaceOf = new Map<string, unknown>()
      for (const workspace of workspaces) {
        for (const id of (workspace.sessionIds ?? []) as readonly string[]) workspaceOf.set(id, workspace.workspaceId)
      }
      const rows: Array<{ id: string, running: boolean, updatedAt: number }> = []
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
    function dwReadFolds(): DynamicWorkspaceFolds {
      try {
        const raw = window.localStorage.getItem(DW_FOLD_KEY)
        if (raw === null) return { active: false, inactive: false }
        const value = JSON.parse(raw) as DynamicWorkspaceFolds | null
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
    function dwWriteFolds(folds: DynamicWorkspaceFolds): void {
      try {
        window.localStorage.setItem(DW_FOLD_KEY, JSON.stringify({ active: folds.active, inactive: folds.inactive }))
      } catch {
        // A storage-denied browser keeps the in-memory state only.
      }
    }

    /**
     * localStorage key holding the last observed Active/Inactive bucket of every
     * Workspace. On reload the Session store is still empty for the first paint,
     * so without this cache every native section classifies as Inactive and a
     * persisted fold visibly does not apply until the stores hydrate.
     */
    const DW_BUCKET_KEY = 'power-suite.dynamic-workspaces.buckets'

    /** Document version of the persisted bucket-classification cache. */
    const DW_BUCKET_VERSION = 1

    /** Cache key used for the native ungrouped section (no `workspace:` suffix). */
    const DW_BUCKET_UNGROUPED = '__ungrouped__'

    /**
     * Read the last observed bucket classification of each Workspace, degrading
     * to an empty map on a corrupt, missing, or storage-denied document.
     * @returns {Map<string, boolean>} workspace id (or the ungrouped key) → active.
     */
    function dwReadBucketCache(): Map<string, boolean> {
      const cache = new Map<string, boolean>()
      try {
        const raw = window.localStorage.getItem(DW_BUCKET_KEY)
        if (raw === null) return cache
        const value = JSON.parse(raw) as { workspaces?: unknown } | null
        const source = value !== null && typeof value === 'object' && value.workspaces !== null && typeof value.workspaces === 'object'
          ? value.workspaces
          : null
        if (source === null) return cache
        for (const [id, bucket] of Object.entries(source)) {
          if (typeof id !== 'string' || id.length === 0) continue
          if (bucket !== 'active' && bucket !== 'inactive') continue
          cache.set(id, bucket === 'active')
        }
      } catch {
        // A corrupt document or a storage-denied browser starts empty.
      }
      return cache
    }

    /**
     * Persist the last observed bucket classification of each Workspace.
     * @param {Map<string, boolean>} cache - workspace id (or ungrouped) → active.
     * @returns {void}
     */
    function dwWriteBucketCache(cache: Map<string, boolean>): void {
      try {
        const workspaces: Record<string, 'active' | 'inactive'> = {}
        for (const [id, active] of cache) workspaces[id] = active ? 'active' : 'inactive'
        window.localStorage.setItem(DW_BUCKET_KEY, JSON.stringify({ version: DW_BUCKET_VERSION, workspaces }))
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
    const DW_ACK_ROUTE = browserRoute(ROUTES.readAcks)

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
    const DW_ACTIVITY_ROUTE = browserRoute(ROUTES.sessionActivity)

    /**
     * Read the persisted acknowledgement baselines: Session id → the effective
     * `updatedAt` observed when the user last opened that completed Session
     * (the Host activity map supersedes the stale catalog prompt time). Corrupt,
     * missing, or storage-denied documents read as empty.
     * @returns {Map<string, number>} baselines.
     */
    function dwReadAckedBaselines(): Map<string, number> {
      const baselines = new Map<string, number>()
      try {
        const raw = window.localStorage.getItem(DW_ACK_KEY)
        if (raw === null) return baselines
        const value = JSON.parse(raw) as { acked?: unknown } | null
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
    function dwWriteAckedBaselines(baselines: Map<string, number>): void {
      try {
        const acked: Record<string, number> = {}
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
    function dwSanitizeAckEntries(value: unknown): Record<string, number> {
      const entries: Record<string, number> = {}
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
    function dwCapAckedBaselines(baselines: Map<string, number>): Map<string, number> {
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
    function dwMergeAckedBaselines(baselines: Map<string, number>, entries: Record<string, number>): Map<string, number> {
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
    function dwAckedRecords(baselines: Map<string, number>): Record<string, number> {
      const entries: Record<string, number> = {}
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
    function dwIsAcked(baselines: Map<string, number> | null | undefined, sessionId: string, updatedAt: number | undefined): boolean {
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
    async function dwFetchReadAcks(): Promise<Record<string, number> | null> {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), DW_ACK_REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(appUrl(DW_ACK_ROUTE), {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal: controller.signal
        })
        if (!response.ok) return null
        const payload = await response.json() as { acked?: unknown } | null
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
     * @returns {Promise<{ merged: Record<string, number> | null, status: number, retryable: boolean }>} merged entries, HTTP status, and retryability.
     */
    async function dwPostReadAcks(entries: Record<string, number>): Promise<{ merged: Record<string, number> | null, status: number, retryable: boolean }> {
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
        const payload = await response.json() as { acked?: unknown } | null
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
    function dwAckPushBatches(pending: Map<string, number>): Array<Record<string, number>> {
      const batches: Array<Record<string, number>> = []
      let batch: Record<string, number> = {}
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
    function dwCapAckPending(pending: Map<string, number>): Map<string, number> {
      if (pending.size <= DW_ACK_MAX_ENTRIES) return pending
      const entries = [...pending.entries()].sort((left, right) => (right[1] - left[1]) || left[0].localeCompare(right[0]))
      return new Map(entries.slice(0, DW_ACK_MAX_ENTRIES))
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
    function dwMergeActivityMaps(
      previous: Record<string, number>,
      incoming: Record<string, number>,
      sessionIds: readonly string[] | null
    ): Record<string, number> {
      const next: Record<string, number> = {}
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
    async function dwFetchSessionActivity(): Promise<Record<string, number> | null> {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), DW_ACK_REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(appUrl(DW_ACTIVITY_ROUTE), {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal: controller.signal
        })
        if (!response.ok) return null
        const payload = await response.json() as { sessions?: unknown } | null
        const sessions = payload !== null && typeof payload === 'object' ? payload.sessions : null
        if (sessions === null || typeof sessions !== 'object' || Array.isArray(sessions)) return null
        const activity: Record<string, number> = {}
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
    function dwFindMounts(): DynamicWorkspaceMounts | null {
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
      let panel: HTMLElement
      if (existingPanel instanceof HTMLElement) panel = existingPanel
      else {
        panel = document.createElement('div')
        panel.setAttribute(DW_ATTR, 'panel')
        panel.className = 'psd-panel-slot'
        root.insertBefore(panel, root.firstElementChild)
      }
      panel.style.display = ''
      const existingActive = list.querySelector(`:scope > [${DW_ATTR}="group"][data-group="active"]`)
      let activeHeader: HTMLElement
      if (existingActive instanceof HTMLElement) activeHeader = existingActive
      else {
        activeHeader = document.createElement('div')
        activeHeader.setAttribute(DW_ATTR, 'group')
        activeHeader.dataset.group = 'active'
        activeHeader.className = 'psd-group-header'
        list.appendChild(activeHeader)
      }
      const existingInactive = list.querySelector(`:scope > [${DW_ATTR}="group"][data-group="inactive"]`)
      let inactiveHeader: HTMLElement
      if (existingInactive instanceof HTMLElement) inactiveHeader = existingInactive
      else {
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
    function DwChevron(): ReactElement {
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
     * Native sidebar disclosure glyph: the shell's filled
     * `IconTriangleRightFillRegular` (16 viewBox, 14 px, currentColor fill).
     * `aria-expanded` on the toggle rotates it 90 deg when the children are open,
     * exactly like a native Workspace project row.
     * @returns {object} the triangle svg.
     */
    function DwTriangle(): ReactElement {
      return React.createElement('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': true,
        focusable: 'false'
      }, React.createElement('path', { d: DW_TRIANGLE_RIGHT_FILL_PATH, fill: 'currentColor' }))
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
    function dwSubagentChildren(
      list: SessionList | null | undefined,
      statuses: SessionStatusMap | null | undefined,
      now: number,
      archived: Set<string>,
      recentMs: number,
      workspaces: readonly WorkspaceRow[],
      activity: Record<string, number>
    ): Map<string, SubagentRow[]> {
      const children = new Map<string, SubagentRow[]>()
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
        const row: SubagentRow = {
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
    function DwNewChatGlyph(): unknown {
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
     * Continue CTA for an interrupted Session row: it opens that Session and
     * requests the continuation; it never opens the row.
     *
     * It renders inline in the row head (`.psd-continue-slot` ->
     * `.psd-continue-inline`) for both row kinds: the slot expands over the faded
     * title tail and never moves the trailing time cell.
     * @param {object} props - action props.
     * @param {Function} props.interruptedT - interrupted-feature translate.
     * @param {object} props.row - row carrying id.
     * @param {string} [props.className] - extra class for the button (inline form).
     * @returns {object} the button element.
     */
    function DwContinueAction({ interruptedT, row, className }: { interruptedT: Translate, row: DynamicRow, className?: string }): ReactElement {
      const label = interruptedT('continue.aria')
      return React.createElement('button', {
        type: 'button',
        className: className === undefined ? 'psd-row-action' : className,
        'data-variant': 'continue',
        'aria-label': label,
        title: label,
        onClick: (event: UiEventLike) => {
          event.preventDefault()
          event.stopPropagation()
          requestContinue(row.id)
        }
      }, React.createElement(RemixIcon, { path: remixPlayFill, size: 12 }))
    }

    /**
     * New session action: creates and opens a blank Session in the row's own
     * directory. It fills the trailing cell next to the "…" trigger, so the time
     * never moves while the controls swap in.
     * @param {object} props - action props.
     * @param {Function} props.t - dynamic-Workspaces translate.
     * @param {object} props.row - row carrying id/workspaceId/cwd.
     * @param {Function} props.onNewSession - create-and-open same-directory Session.
     * @returns {object} the button element.
     */
    function DwNewSessionAction({ t, row, onNewSession }: { t: Translate, row: DynamicRow, onNewSession: (row: DynamicRow) => void }): ReactElement {
      const label = t('hover.newSession')
      return React.createElement('button', {
        type: 'button',
        className: 'psd-row-action',
        'data-variant': 'new-session',
        'aria-label': label,
        title: label,
        onClick: (event: UiEventLike) => {
          event.preventDefault()
          event.stopPropagation()
          onNewSession(row)
        }
      }, React.createElement(DwNewChatGlyph))
    }

    /**
     * Inline copy of the shell's pin glyph pair (16 viewBox), used only when the
     * seeded primitives do not expose `IconPinFillRegular` / `IconPinOutlineRegular`
     * (older shell). The filled variant paints the head; the outline variant keeps
     * it hollow but both share the needle.
     * @param {object} props - glyph props.
     * @param {boolean} props.filled - filled head or outline head.
     * @param {number} [props.size] - rendered square size in px.
     * @returns {object} the svg element.
     */
    function DwPinGlyph({ filled, size }: { filled: boolean, size?: number }): ReactElement {
      const length = typeof size === 'number' && Number.isFinite(size) ? size : 14
      return React.createElement('svg', {
        width: length,
        height: length,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': true,
        focusable: 'false'
      },
      React.createElement('path', {
        d: DW_PIN_PATH,
        fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor',
        strokeWidth: 1.25,
        strokeLinejoin: 'round'
      }),
      React.createElement('path', { d: DW_PIN_NEEDLE_PATH, fill: 'currentColor' }))
    }

    /**
     * Pin toggle in a main row's reserved title-left slot.
     *
     * The slot itself is the fixed geometry: CSS keeps its 16 px width in every
     * state and only toggles the button's opacity/visibility, so revealing or
     * hiding the control never moves the title or any trailing column. The filled
     * violet marker stays visible on a pinned row after the pointer leaves
     * (`pointer-events:none` until hover/focus) so the reason the row sits at the
     * top is still readable.
     * @param {object} props - component props.
     * @param {Function} props.t - dynamic-Workspaces translate.
     * @param {boolean} props.pinned - whether the Session is pinned.
     * @param {Function} props.onToggle - toggle callback.
     * @returns {object} the slot element.
     */
    function DwPinSlot({ t, pinned, onToggle }: { t: Translate, pinned: boolean, onToggle: () => void }): ReactElement {
      const label = t(pinned ? 'pin.unpin' : 'pin.pin')
      const glyph = pinned
        ? (DW_PIN_FILL === null
            ? React.createElement(DwPinGlyph, { filled: true })
            : React.createElement(DW_PIN_FILL, { size: 14 }))
        : (DW_PIN_OUTLINE === null
            ? React.createElement(DwPinGlyph, { filled: false })
            : React.createElement(DW_PIN_OUTLINE, { size: 14 }))
      return React.createElement('span', {
        className: 'psd-run-pin-slot',
        'data-pinned': pinned ? 'true' : undefined
      },
      React.createElement('button', {
        type: 'button',
        className: 'psd-run-pin',
        'aria-pressed': pinned ? 'true' : 'false',
        'aria-label': label,
        title: label,
        'data-pinned': pinned ? 'true' : undefined,
        onClick: (event: UiEventLike) => {
          event.preventDefault()
          event.stopPropagation()
          onToggle()
        }
      }, glyph))
    }

    /**
     * One native-figure section of the row hover card: a header line (label plus
     * a right-aligned headline value) and right-aligned key/value rows, matching
     * the shell's Session-statistics dialog list.
     * @param {object} props - section props.
     * @param {string} props.title - left-hand section label.
     * @param {string} [props.value] - right-aligned headline value.
     * @param {Array<[string, string]>} props.rows - label/value row pairs.
     * @returns {object} the section element.
     */
    function DwHovercardSection({ title, value, rows }: { title: string, value?: string, rows: Array<[string, string]> }): ReactElement {
      return React.createElement('div', { className: 'psd-hovercard-section' },
        React.createElement('div', { className: 'psd-hovercard-section-head' },
          React.createElement('span', { className: 'psd-hovercard-section-title' }, title),
          value === undefined ? null : React.createElement('span', { className: 'psd-hovercard-section-value' }, value)),
        rows.map(([label, text]) => React.createElement('div', { className: 'psd-hovercard-row', key: label },
          React.createElement('span', { className: 'psd-hovercard-key' }, label),
          React.createElement('span', { className: 'psd-hovercard-row-value' }, text))))
    }

    /**
     * The three native figures the shell shows for a Session, appended to the
     * hover card: Session statistics, Token usage, and context occupancy with
     * the heuristic composition. Each section is omitted entirely when its
     * projection data is absent, so a Session with no data keeps the plain card.
     * @param {object} props - component props.
     * @param {{ stats: object | null, usage: object | null, context: object | null }} props.sections -
     *   normalized sections from {@link dwProjectionSections}.
     * @param {Function} props.t - namespace-bound translate.
     * @returns {object | null} the fragment, or null when no section has data.
     */
    function DwHovercardProjectionSections({ sections, t }: { sections: ProjectionSections, t: Translate }): ReactElement | null {
      if (sections === null || typeof sections !== 'object') return null
      const { stats, usage, context } = sections
      const blocks: ReactElement[] = []
      if (stats !== null) {
        const rows: Array<[string, string]> = []
        if (stats.llmMs > 0) rows.push([t('stats.llmTime'), dwFormatStatsDuration(stats.llmMs, t)])
        if (stats.toolMs > 0) rows.push([t('stats.toolTime'), dwFormatStatsDuration(stats.toolMs, t)])
        if (stats.ttftSteps > 0) rows.push([t('stats.ttft'), dwFormatStatsDuration(stats.ttftMs / stats.ttftSteps, t)])
        const speed = dwFormatTps(stats.decodeTokens, stats.decodeMs, t)
        if (speed !== null) rows.push([t('stats.speed'), speed])
        blocks.push(React.createElement(DwHovercardSection, {
          key: 'stats',
          title: t('stats.title'),
          value: t('stats.counts', { turns: stats.turns, steps: stats.steps }),
          rows
        }))
      }
      if (usage !== null) {
        const exact = (value: number): string => t('usage.count', { count: dwFormatExactTokens(value, t) })
        const rows: Array<[string, string]> = []
        if (usage.cacheHitPercent !== null) rows.push([t('usage.cacheHit'), `${usage.cacheHitPercent}%`])
        rows.push([t('usage.input'), exact(usage.uncachedInputTokens)])
        rows.push([t('usage.cacheRead'), exact(usage.cacheReadTokens)])
        if (usage.cacheWriteTokens !== 0) rows.push([t('usage.cacheWrite'), exact(usage.cacheWriteTokens)])
        rows.push([t('usage.output'), exact(usage.outputTokens)])
        blocks.push(React.createElement(DwHovercardSection, {
          key: 'usage',
          title: t('usage.title'),
          value: exact(usage.totalTokens),
          rows
        }))
      }
      if (context !== null) {
        const rows: Array<[string, string]> = []
        if (context.breakdown !== null) {
          rows.push([t('context.system'), `~${dwFormatCompactTokens(context.breakdown.systemTokens, t)}`])
          rows.push([t('context.tools'), `~${dwFormatCompactTokens(context.breakdown.toolsTokens, t)}`])
          rows.push([t('context.messages'), `~${dwFormatCompactTokens(context.breakdown.messageTokens, t)}`])
        }
        blocks.push(React.createElement(DwHovercardSection, {
          key: 'context',
          title: t('context.aria', { percent: `${context.percent}%` }),
          value: `~${dwFormatCompactTokens(context.usedTokens, t)} / ${dwFormatCompactTokens(context.contextWindow, t)}`,
          rows
        }))
      }
      if (blocks.length === 0) return null
      return React.createElement(React.Fragment, null, blocks)
    }

/** One vertical wheel step over the card's own scroller. */
interface PanelWheelEvent {
  readonly deltaY: number
  readonly ctrlKey: boolean
  stopPropagation(): void
}

    /**
     * Render the running-Sessions summary card.
     * @param {object} props - component props.
     * @returns {object} React element.
     */
    function DynamicRunningPanel(props: DynamicRunningPanelProps): ReactElement {
      const {
        t, rows, expanded, showAll, now, durations, childrenByParent, collapsedParents, acked,
        onToggle, onToggleAll, onToggleChildren, onOpen, interruptedT, onNewSession, currentSessionId,
        projections, onEnsureProjections, pinnedIds, menuSessionId, menuEnabled, onOpenSessionMenu, onTogglePin,
        pendingIds
      } = props
      // The sidebar viewport (DSH's `scroll-handoff`) splits wheel gestures in
      // JavaScript: over anything inside the navigation it calls
      // preventDefault and scrolls the viewport itself, which stops a nested
      // scroller from ever moving. The card therefore claims the gesture while
      // its own body can still scroll in that direction — native scrolling
      // stays in charge (`overscroll-behavior: contain` keeps it here) — and
      // steps aside at either end so the sidebar keeps its usual hand-off.
      const bodyRef = React.useRef<HTMLElement | null>(null)
      React.useEffect(() => {
        const body = bodyRef.current
        if (!(body instanceof HTMLElement)) return undefined
        const onWheel = (event: PanelWheelEvent): void => {
          if (event.ctrlKey || event.deltaY === 0) return
          const max = body.scrollHeight - body.clientHeight
          if (max <= 1) return
          if (event.deltaY > 0 ? body.scrollTop >= max - 1 : body.scrollTop <= 1) return
          event.stopPropagation()
        }
        body.addEventListener('wheel', onWheel, { passive: true })
        return () => body.removeEventListener('wheel', onWheel)
      }, [expanded])
      const visible = expanded && !showAll ? rows.slice(0, DW_PANEL_LIMIT) : rows
      // Waiting Sessions get an inline flag in front of their row title; no
      // floating popup is rendered at all (the row itself is the actionable
      // surface, so the flag only has to be visible).
      const pendingKey = Array.isArray(pendingIds) ? pendingIds.join('|') : ''
      const pendingSet = React.useMemo(() => new Set(pendingKey.length > 0 ? pendingKey.split('|') : []), [pendingKey])
      const canExpand = rows.length > DW_PANEL_LIMIT
      const anyRunning = rows.some((row) => row.state === 'running')
      const isRead = (sessionId: string, updatedAt: number): boolean => dwIsAcked(acked, sessionId, updatedAt)
      const isCurrent = (sessionId: string): boolean => typeof currentSessionId === 'string' && sessionId === currentSessionId
      const isPinned = (row: DynamicRow): boolean => row.pinned === true || (pinnedIds !== null && pinnedIds !== undefined && typeof pinnedIds.has === 'function' && pinnedIds.has(row.id))
      // Card rows share the suite's interruption records; the rows also exist in
      // the native sidebar, whose badge seats already pull them, but ensuring and
      // watching here keeps this card correct on its own after a reconnect.
      React.useSyncExternalStore(subscribeInterrupted, interruptedVersion, interruptedVersion)
      const interruptedIds: string[] = []
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
      const rowInterrupted = React.useCallback((sessionId: string): boolean => {
        // The Host record alone decides, never the card row's combined shell
        // running state: a parent whose own turn was interrupted while delegated
        // subagent children still run stays in the running group by derivation,
        // but its own row must present the interrupted truth. The record's own
        // `running` already excludes the post-Continue phase.
        return interruptedCardMark(interruptedRecord(sessionId))
      }, [])
      // A new local turn can start while a stale interrupted-idle record is cached: the
      // record refreshes on the Host SSE boundary, the 20 s poll and the focus/online
      // cues, but nothing pushes it when this browser sends a new prompt. Force one
      // authoritative refresh when a listed row transitions to running so the card does
      // not keep the old interrupted mark on live work.
      const runningKey = visible.map((row) => `${row.id}:${row.state === 'running' ? 'r' : 'i'}`).join('|')
      const runningTransitions = React.useRef<Map<string, boolean>>(new Map())
      React.useEffect(() => {
        const previous = runningTransitions.current
        for (const row of visible) {
          const running = row.state === 'running'
          if (previous.get(row.id) === false && running && interruptedIndicatorActive(interruptedRecord(row.id))) {
            refreshInterrupted(row.id)
          }
          previous.set(row.id, running)
        }
        for (const id of [...previous.keys()]) {
          if (!visible.some((row) => row.id === id)) previous.delete(id)
        }
      }, [runningKey])
      const interruptedTitle = (sessionId: string): string => {
        const record = interruptedRecord(sessionId)
        return record !== null && typeof record === 'object' && (record as InterruptedRecord).subagent === true
          ? interruptedT('badge.title.subagent')
          : interruptedT('badge.title')
      }

      // Hover detail card for one row: the row itself only carries the title,
      // state and time; the workspace and other facts live in the card. Like the
      // native sidebar tooltip it starts flush on the sidebar column's right edge
      // and on the hovered row's top, so it sits entirely outside the sidebar and
      // can never cover the row's trailing actions.
      const [hover, setHover] = React.useState<HoverTarget | null>(null)
      // Whether the UI annotation mode is active; while it is, a shown hovercard is
      // pinned (pointer-interactive, marked with data-psd-pinned) so it can be
      // inspected and annotated. Normal mode never sets the marker.
      const [annotationActive, setAnnotationActive] = React.useState(
        () => document.documentElement.getAttribute('data-psa-active') === 'true'
      )
      const hoverCardRef = React.useRef<HTMLElement | null>(null)
      const panelRootRef = React.useRef<HTMLElement | null>(null)
      const hoverTimer = React.useRef<number | null>(null)
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
        const onKeyDown = (event: KeyboardEvent) => {
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
      // Native-style right-edge fade: mask a row title only while it actually
      // overflows its fixed column, so a short title never loses its last glyphs
      // to the gradient. Runs after every render (row titles/time update live).
      /** Cached 2D context used to measure a title's first glyph. */
      let titleMeasureContext: CanvasRenderingContext2D | null = null
      /**
       * Advance width of one string at a computed font.
       * @param {string} text - measured text.
       * @param {string} font - CSS font shorthand from getComputedStyle.
       * @returns {number} width in px (0 when it cannot be measured).
       */
      function measureTextWidth(text: string, font: string): number {
        if (typeof document === 'undefined' || text.length === 0) return 0
        if (titleMeasureContext === null) titleMeasureContext = document.createElement('canvas').getContext('2d')
        if (titleMeasureContext === null) return 0
        if (typeof font === 'string' && font.length > 0) titleMeasureContext.font = font
        const width = titleMeasureContext.measureText(text).width
        return Number.isFinite(width) ? width : 0
      }
      const measureClippedTitles = React.useCallback(() => {
        const root = panelRootRef.current
        if (!(root instanceof HTMLElement)) return
        for (const title of root.querySelectorAll('.psd-run-title,.psd-child-title')) {
          const clipped = title.scrollWidth > title.clientWidth + 1
          if (clipped) {
            if (title.getAttribute('data-clipped') !== 'true') title.setAttribute('data-clipped', 'true')
          } else if (title.hasAttribute('data-clipped')) {
            title.removeAttribute('data-clipped')
          }
          // User-requested alignment (C): in the default state the title's first
          // character is centred on the child status-dot column. The offset is the
          // measured half-width of that first glyph, applied only while the pin
          // slot is collapsed (hover/focus/pinned states force it back to 0).
          const open = title.closest('.psd-run-open')
          if (open instanceof HTMLElement) {
            const style = window.getComputedStyle(title)
            const first = Array.from((title.textContent ?? '').trim())[0] ?? ''
            const width = measureTextWidth(first, style.font)
            // The advance-centre reads ~1-2 px left of the dot line because of the
            // glyph's left side bearing, so the measured offset carries a small
            // right bias (user feedback: "稍微往右一点点").
            const shift = width > 0 ? Math.max(0, 8 - width / 2 + 2) : 0
            open.style.setProperty('--psd-title-shift', `${Math.round(shift * 100) / 100}px`)
          }
        }
      }, [])
      React.useLayoutEffect(() => {
        measureClippedTitles()
      })
      React.useEffect(() => {
        const root = panelRootRef.current
        if (!(root instanceof HTMLElement) || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(() => measureClippedTitles())
        observer.observe(root)
        return () => observer.disconnect()
      }, [measureClippedTitles])
      // Keep the card inside the viewport (native tooltips are clamped at the
      // bottom edge); measuring after mount avoids guessing the content height.
      // Projection values land asynchronously for cold Sessions and grow the
      // card, so re-clamp whenever the Session list snapshot changes.
      React.useLayoutEffect(() => {
        if (hover === null) return
        const element = hoverCardRef.current
        if (!(element instanceof HTMLElement)) return
        const maxTop = Math.max(8, window.innerHeight - element.offsetHeight - 8)
        if (hover.top > maxTop) {
          setHover((previous) => (previous === null ? previous : { ...previous, top: maxTop }))
        }
      }, [hover, projections])
      // Every Session id asked for once per seat lifetime: cold (persisted)
      // Sessions carry only summary projections, so the hover trigger starts one
      // `refreshProjections` read and the card fills in when the values arrive.
      // Nothing is polled, and error / migration states are never retried.
      const projectionRequestsRef = React.useRef<Set<string>>(new Set())
      const ensureRowProjections = (sessionId: string): void => {
        if (typeof onEnsureProjections !== 'function') return
        if (projectionRequestsRef.current.has(sessionId)) return
        if (!dwNeedsProjectionRead(projections?.[sessionId])) return
        projectionRequestsRef.current.add(sessionId)
        onEnsureProjections(sessionId)
      }
      const showHover = (row: DynamicRow, element: EventTarget | null): void => {
        ensureRowProjections(row.id)
        clearHoverTimer()
        hoverTimer.current = window.setTimeout(() => {
          if (!(element instanceof HTMLElement) || !element.isConnected) return
          const rect = element.getBoundingClientRect()
          // Native row tooltips start flush on the sidebar column's right edge and
          // on the hovered row's top. Fall back to the old panel anchor only when
          // the sidebar column cannot be identified.
          const sidebar = element.closest('[class*="_sidebarCol"]')
          const panel = element.closest('.psd-panel')
          const anchorLeft = sidebar instanceof HTMLElement
            ? Math.round(sidebar.getBoundingClientRect().right)
            : panel instanceof HTMLElement
              ? Math.round(panel.getBoundingClientRect().right + 10)
              : Math.round(rect.right)
          setHover({ row, top: Math.round(rect.top), anchorLeft })
        }, 260)
      }
      const hideHover = (): void => {
        clearHoverTimer()
        // While the annotation mode is active the hovercard becomes an annotatable
        // surface: it stays open when the pointer leaves the row so the pointer can
        // travel onto the card itself (the annotation stylesheet makes it
        // pointer-interactive only in that mode).
        if (document.documentElement.getAttribute('data-psa-active') === 'true') return
        hoverTimer.current = window.setTimeout(() => setHover(null), 140)
      }

      // The annotation mode broadcasts its state; leaving the mode must never
      // leave a pinned hovercard behind, entering it must cancel a pending hide.
      React.useEffect(() => {
        const onAnnotationState = (event: Event) => {
          const active = event instanceof CustomEvent && event.detail !== null && typeof event.detail === 'object'
            ? event.detail.active === true
            : false
          setAnnotationActive(active)
          if (active) clearHoverTimer()
          else setHover(null)
        }
        document.addEventListener('power-suite:ui-annotation-state', onAnnotationState)
        return () => document.removeEventListener('power-suite:ui-annotation-state', onAnnotationState)
      }, [])

      const headChildren: unknown[] = [
        React.createElement('button', {
          key: 'toggle',
          type: 'button',
          className: 'psd-panel-toggle',
          'aria-expanded': expanded,
          'aria-label': expanded ? t('panel.collapse') : t('panel.expand'),
          onClick: onToggle
        },
        React.createElement('span', { className: 'psd-indicator', 'aria-hidden': true, 'data-testid': 'psd-panel-indicator' },
          anyRunning
            ? React.createElement('span', { className: 'psd-pulse' })
            // Identity glyph swap (user-requested): the all-complete header mark is
            // the DeepSeek brand glyph; the read parent-row mark is the sparkle.
            : React.createElement('span', { className: 'psd-spark' }, RemixGlyph(DW_DEEPSEEK_FILL, 14))),
        React.createElement('span', { className: 'psd-panel-title' }, t('panel.title'))),
        React.createElement('span', { key: 'spacer', className: 'psd-panel-head-spacer', 'aria-hidden': true })
      ]
      if (expanded && canExpand) {
        headChildren.push(React.createElement('button', {
          key: 'all',
          type: 'button',
          className: 'psd-panel-link',
          onClick: onToggleAll
        }, showAll ? t('panel.showLess') : t('panel.viewAll', { count: rows.length })))
      }
      // Header trailing controls: the count badge sits on the row's trailing
      // column (the same right edge the row times end on) and the header chevron
      // folds the whole card from the row's right edge.
      headChildren.push(React.createElement('span', { key: 'count', className: 'psd-count' }, t('count', { count: rows.length })))
      headChildren.push(React.createElement('button', {
        key: 'chevron',
        type: 'button',
        className: 'psd-panel-chevron',
        'aria-expanded': expanded,
        'aria-label': expanded ? t('panel.collapse') : t('panel.expand'),
        onClick: onToggle
      }, React.createElement('span', { className: 'psd-chevron' }, React.createElement(DwChevron, null))))
      const head = React.createElement('div', {
        key: 'head',
        className: 'psd-panel-head',
        onClick: (event: UiEventLike) => {
          const target = event.target
          if (target instanceof Element && target.closest('button') !== null) return
          onToggle()
        }
      }, headChildren)
      const children = [head]
      if (expanded) {
        const body = []
        if (rows.length === 0) {
          body.push(React.createElement('div', { key: 'empty', className: 'psd-panel-empty' },
            React.createElement('strong', null, t('panel.empty.title')),
            React.createElement('span', null, t('panel.empty.hint'))))
        } else {
          for (const row of visible) {
            const running = row.state === 'running'
            const interrupted = rowInterrupted(row.id)
            const duration = durations.get(row.id)
            // An interrupted row shows its last activity, never a running
            // duration: its own turn already stopped even when delegated subagent
            // children keep the row in the running group.
            const time = running && !interrupted
              ? (duration === undefined || duration.observed !== true
                  ? dwFormatRelative(now - row.updatedAt, t)
                  : dwFormatDuration(now - duration.at, t))
              : dwFormatRelative(now - row.updatedAt, t)
            const rowChildren = childrenByParent.get(row.id) ?? []
            const collapsed = collapsedParents.has(row.id)
            const hasChildren = rowChildren.length > 0
            const pinned = isPinned(row)
            const menuOpen = menuEnabled && typeof menuSessionId === 'string' && menuSessionId === row.id
            // Two fixed cells frame the row: a 16 px leading disclosure cell
            // (parent rows only; child rows are already indented under the trunk)
            // and one right-anchored 46 px trailing cell that holds the time and,
            // on a main row, the revealed "…"/New session controls. The row keeps
            // an 8 px right inset, so every time ends on one x; the title takes
            // the remaining width and fades out at its right edge only while it is
            // actually clipped.
            body.push(React.createElement('div', {
              key: row.id,
              className: 'psd-item',
              'data-state': row.state
            },
            React.createElement('div', {
              className: isCurrent(row.id) ? 'psd-run psd-run-current' : 'psd-run',
              'data-state': row.state,
              'data-psd-session': row.id,
              'data-pinned': pinned ? 'true' : undefined,
              'data-menu-open': menuOpen ? 'true' : undefined,
              'data-menuable': menuEnabled ? 'true' : undefined,
              'aria-current': isCurrent(row.id) ? 'true' : undefined,
              'data-actions': interrupted ? 'continue+new' : 'new',
              onClick: (event: UiEventLike) => {
                const target = event.target
                if (target instanceof Element && target.closest('button') !== null) return
                onOpen(row.id)
              },
              onMouseEnter: (event: UiEventLike) => showHover(row, event.currentTarget),
              onMouseLeave: hideHover
            },
              isCurrent(row.id) ? React.createElement(DwAtmosphere, { key: 'atmos' }) : null,
              // The native project-row disclosure sits at the row's far left: a
              // filled triangle (rotated when open) in a fixed 16 px cell, with an
              // equal spacer on rows that have no subagents so every status glyph
              // and title keeps one column.
              hasChildren
                ? React.createElement('button', {
                  type: 'button',
                  className: 'psd-run-toggle',
                  'aria-expanded': !collapsed,
                  'aria-label': t(collapsed ? 'panel.expandChildren' : 'panel.collapseChildren', { title: row.title }),
                  onClick: () => onToggleChildren(row.id)
                }, React.createElement('span', { className: 'psd-triangle' }, React.createElement(DwTriangle)))
                : React.createElement('span', { className: 'psd-run-lead-spacer', 'aria-hidden': true }),
              React.createElement('div', { className: 'psd-run-main' },
              React.createElement('span', { className: 'psd-run-head' },
                // The identity/status cell is the annotation-friendly target for this
                // row: it is one stable node per Session (React reuses the same span
                // across state changes) and carries a white-listed `data-testid`, so a
                // UI annotation recorded on it survives re-renders and row-state
                // flips instead of degrading to "No longer on the page". Its glyphs
                // are non-hit-testable (CSS), so the pointer picks this cell rather
                // than the svg that the state branch happens to render.
                React.createElement('span', {
                  className: 'psd-run-glyph-cell',
                  'data-testid': `psd-session-glyph:${row.id}`
                },
                  pendingSet.has(row.id)
                    ? React.createElement('span', {
                      className: 'psd-pending-flag',
                      role: 'img',
                      'aria-label': t('row.pending'),
                      title: t('row.pending')
                    }, RemixGlyph(DW_FLAG_FILL_PATH, 13))
                    : interrupted
                    ? React.createElement('span', {
                      className: 'psd-interrupted',
                      role: 'img',
                      'aria-label': interruptedT('badge.aria'),
                      title: interruptedTitle(row.id)
                    }, RemixGlyph(remixWarningFill, 13))
                    : running
                      ? React.createElement(StateDot, { state: 'ongoing', size: 14, className: 'psd-run-glyph' })
                      : !isRead(row.id, row.updatedAt)
                        ? React.createElement(StateDot, { state: 'done', size: 14, className: 'psd-run-glyph' })
                        : React.createElement('span', { className: 'psd-run-brand', 'aria-hidden': true },
                          RemixGlyph(DW_SPARKLING_LINE, 16, undefined, 0.82))),
                interrupted
                  ? React.createElement('span', { className: 'psd-continue-slot' },
                    React.createElement(DwContinueAction, {
                      className: 'psd-continue-inline',
                      interruptedT,
                      row
                    }))
                  : null,
                React.createElement(DwPinSlot, {
                  key: 'pin',
                  t,
                  pinned,
                  onToggle: () => onTogglePin(row.id)
                }),
                React.createElement('button', {
                  type: 'button',
                  className: 'psd-run-open',
                  'aria-current': isCurrent(row.id) ? 'true' : undefined,
                  'aria-label': t('panel.open', { title: row.title }),
                  onClick: (event: UiEventLike) => {
                    event.stopPropagation()
                    onOpen(row.id)
                  },
                  onFocus: (event: UiEventLike) => showHover(row, event.currentTarget),
                  onBlur: hideHover
                }, React.createElement('span', { className: 'psd-run-title' }, row.title)))),
              React.createElement('span', { key: 'spacer', className: 'psd-run-spacer', 'aria-hidden': true }),
              // One right-anchored tail: the relative time at rest, and the "…"
              // trigger plus New session over the same cell on hover/focus.
              React.createElement('span', { key: 'tail', className: 'psd-run-tail' },
                React.createElement('span', { className: 'psd-run-time' }, time),
                React.createElement('span', { key: 'actions', className: 'psd-run-actions' },
                menuEnabled ? React.createElement('button', {
                  type: 'button',
                  className: 'psd-run-more',
                  'data-context-menu-trigger': '',
                  'aria-haspopup': 'menu',
                  'aria-expanded': menuOpen ? 'true' : undefined,
                  'aria-label': t('row.more', { title: row.title }),
                  onClick: (event: UiEventLike) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onOpenSessionMenu(row, event.currentTarget instanceof Element ? event.currentTarget : null)
                  },
                  onPointerDown: (event: UiEventLike) => event.stopPropagation()
                }, DW_MORE_ICON === null
                  ? RemixGlyph(DW_MORE_PATH, 14)
                  : React.createElement(DW_MORE_ICON, { size: 14 }))
                : null,
                React.createElement(DwNewSessionAction, { key: 'new-session', t, row, onNewSession })))),
            hasChildren && !collapsed
              ? React.createElement('div', { className: 'psd-children' }, rowChildren.map((child) => {
                const childRow: DynamicRow = {
                  ...row,
                  kind: 'child',
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
                  'data-state': child.state,
                  'data-psd-session': child.id,
                  'aria-current': childCurrent ? 'true' : undefined,
                  'data-actions': childInterrupted ? 'continue' : 'none',
                  onClick: (event: UiEventLike) => {
                    const target = event.target
                    if (target instanceof Element && target.closest('button') !== null) return
                    onOpen(child.id)
                  },
                  onMouseEnter: (event: UiEventLike) => showHover(childRow, event.currentTarget),
                  onMouseLeave: hideHover
                },
                childCurrent ? React.createElement(DwAtmosphere, { key: 'atmos' }) : null,
                React.createElement('button', {
                  type: 'button',
                  className: 'psd-child-main',
                  'aria-current': childCurrent ? 'true' : undefined,
                  'aria-label': t('panel.open', { title: child.title }),
                  onClick: () => onOpen(child.id),
                  onFocus: (event: UiEventLike) => showHover(childRow, event.currentTarget),
                  onBlur: hideHover
                },
                React.createElement('span', {
                  className: 'psd-child-glyph',
                  'data-testid': `psd-session-glyph:${child.id}`
                },
                  childInterrupted
                    ? React.createElement('span', {
                      className: 'psd-interrupted',
                      role: 'img',
                      'aria-label': interruptedT('badge.aria'),
                      title: interruptedTitle(child.id)
                    }, RemixGlyph(remixWarningFill, 12))
                    : child.state === 'running'
                      ? React.createElement(StateDot, { state: 'ongoing', size: 10 })
                      : !isRead(child.id, child.updatedAt)
                        ? React.createElement(StateDot, { state: 'done', size: 10 })
                        : React.createElement('span', { className: 'psd-child-brand', 'aria-hidden': true },
                          RemixGlyph(DW_ROBOT_2_LINE, 12))),
                React.createElement('span', { className: 'psd-child-title' }, child.title)),
                React.createElement('span', { key: 'spacer', className: 'psd-child-spacer', 'aria-hidden': true }),
                React.createElement('span', { key: 'tail', className: 'psd-run-tail' },
                  React.createElement('span', { className: 'psd-child-time' }, dwFormatRelative(now - child.updatedAt, t))))
              }))
              : null))
          }
        }
        children.push(React.createElement('div', { key: 'body', className: 'psd-panel-body', ref: bodyRef }, body))
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
        const cardLeft = Math.round(Math.max(8, Math.min(hover.anchorLeft, window.innerWidth - DW_HOVERCARD_WIDTH - 8)))
        children.push(React.createElement('div', {
          key: 'hover',
          ref: hoverCardRef,
          className: 'psd-hovercard',
          role: 'tooltip',
          'aria-hidden': true,
          'data-psd-hovercard': '',
          'data-psd-pinned': annotationActive ? 'true' : undefined,
          onMouseLeave: () => {
            clearHoverTimer()
            setHover(null)
          },
          style: { top: Math.round(hover.top), left: cardLeft }
        },
        React.createElement('div', { className: 'psd-hovercard-content' },
          React.createElement('div', { className: 'psd-hovercard-title' }, row.workspace),
          // A subagent row's card is titled with the owning Workspace, so add the
          // hovered Session's own compact title to say which subagent it is.
          row.kind === 'child'
            ? React.createElement('div', { className: 'psd-hovercard-session' }, row.title)
            : null,
          row.workspacePath.length === 0
            ? null
            : React.createElement('div', { className: 'psd-hovercard-path' }, row.workspacePath),
          React.createElement('div', { className: 'psd-hovercard-time' }, dwFormatRelative(now - row.updatedAt, t)),
          React.createElement('div', { className: 'psd-hovercard-status' },
            React.createElement('span', {
              className: 'psd-hovercard-dot',
              'data-state': running ? 'running' : 'done',
              'aria-hidden': true
            }),
            React.createElement('span', null,
              `${running ? t('hover.running') : t('hover.done')} · ${statusTime}`)),
          // Remaining native-tooltip-style detail rows.
          React.createElement('div', { className: 'psd-hovercard-row' },
            React.createElement('span', { className: 'psd-hovercard-key' }, t('hover.updated')),
            React.createElement('span', { className: 'psd-hovercard-value' }, dwFormatAbsoluteTime(row.updatedAt))),
          row.subagents > 0
            ? React.createElement('div', { className: 'psd-hovercard-row' },
              React.createElement('span', { className: 'psd-hovercard-key' },
                row.subagents === 1 ? t('hover.subagentsOne') : t('hover.subagents', { count: row.subagents })))
            : null,
          // The three native figures for this Session (parent or nested
          // subagent). Each section is omitted when the projection has no data,
          // so an empty Session keeps exactly the card it has today.
          React.createElement(DwHovercardProjectionSections, {
            sections: dwProjectionSections(projections?.[row.id]?.values),
            t
          }))))
      }
      return React.createElement('div', { ref: panelRootRef, className: 'psd-panel' }, children)
    }

    /**
     * The bucket header rendered into the native tree as a foreign child node.
     * @param {object} props - component props.
     * @returns {object} React element.
     */
    function DynamicGroupHeader(props: { t: Translate, group: 'active' | 'inactive', count: number, collapsed: boolean, onToggle: () => void }): ReactElement {
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
    function DynamicWorkspaceSeat(props: DynamicWorkspacesSeatProps): ReactElement | null {
      const { t, uiWorkspace, parentSessions, interruptedT, contextMenus } = props
      const sessions = props.useSessions((state) => state)
      const statuses = props.useSessionStatus((state) => state)
      const workspaceSnapshot = props.useWorkspaces((state) => state)
      const settings = React.useSyncExternalStore(subscribeSettings, settingsSnapshot, settingsSnapshot)
      const windows = dwWindows(settings.value)

      const [mounts, setMounts] = React.useState<DynamicWorkspacePortalMounts | null>(null)
      const [groupCounts, setGroupCounts] = React.useState({ active: 0, inactive: 0 })
      const [folds, setFolds] = React.useState<DynamicWorkspaceFolds>(dwReadFolds)
      const [panelExpanded, setPanelExpanded] = React.useState(true)
      const [showAll, setShowAll] = React.useState(false)
      const [collapsedParents, setCollapsedParents] = React.useState<Set<string>>(() => new Set())
      const [ackedBaselines, setAckedBaselines] = React.useState<Map<string, number>>(dwReadAckedBaselines)
      const [sessionActivity, setSessionActivity] = React.useState<SessionActivity>({})
      const [now, setNow] = React.useState(() => Date.now())
      // The row "..." menu is the shared native context-menu popup, opened
      // against this feature's own captured-target kind. The contribution
      // registered in `installDynamicWorkspaces` delegates to the native
      // `session` action providers, so the shared popup supplies the native
      // icons, shortcut hints, material, placement, focus and dismissal; only
      // the Pin/Unpin entry is filtered out because the card's title-left pin
      // button is the only pin owner. `menuSessionId` mirrors the shared popup's
      // active target so each row can show its open state.
      const [menuSessionId, setMenuSessionId] = React.useState<string | null>(null)
      React.useEffect(() => {
        if (contextMenus === null || contextMenus === undefined) return undefined
        const active = contextMenus.active
        if (active === null || active === undefined
          || typeof active.subscribe !== 'function'
          || typeof active.getSnapshot !== 'function') return undefined
        const sync = () => {
          let target = null
          try {
            target = active.getSnapshot()
          } catch {
            target = null
          }
          const targetRecord = target !== null && typeof target === 'object' ? target as Record<string, unknown> : null
          const value = targetRecord !== null && targetRecord.kind === DW_ROW_MENU_TARGET
            ? targetRecord.value
            : null
          setMenuSessionId(
            value !== null && typeof value === 'object'
              && typeof (value as Record<string, unknown>).sessionId === 'string'
              && ((value as Record<string, unknown>).sessionId as string).length > 0
              ? (value as Record<string, unknown>).sessionId as string
              : null
          )
        }
        sync()
        const unsubscribe = active.subscribe(sync)
        return () => {
          if (typeof unsubscribe === 'function') unsubscribe()
          // Teardown while our popup is open would leave it empty (the contribution
          // is withdrawn with this plugin), so close the shared popup explicitly.
          try {
            const current = active.getSnapshot()
            if (current !== null && typeof current === 'object'
              && (current as Record<string, unknown>).kind === DW_ROW_MENU_TARGET
              && typeof contextMenus.close === 'function') contextMenus.close()
          } catch {
            // The service may already be disposed with the plugin.
          }
        }
      }, [contextMenus])
      /**
       * Open the shared context-menu popup for one card row.
       *
       * The trigger is focused first because the shared popup captures
       * `document.activeElement` as its focus-restoration target on open. The
       * popup position is the trigger's left/bottom edge; opening the same row
       * again within the service's 4 px toggle radius closes it.
       * @param {object} row - card row carrying `id` and `title`.
       * @param {Element} element - the row's "..." trigger button.
       * @returns {void}
       */
      const openSessionMenu = React.useCallback((row: DynamicRow, element: Element): void => {
        if (row === null || typeof row !== 'object') return
        if (!(element instanceof HTMLElement)) return
        const sessionId = typeof row.id === 'string' && row.id.length > 0 ? row.id : ''
        if (sessionId.length === 0) return
        if (contextMenus === null || contextMenus === undefined || typeof contextMenus.open !== 'function') return
        try {
          element.focus({ preventScroll: true })
        } catch {
          element.focus()
        }
        const rect = element.getBoundingClientRect()
        try {
          contextMenus.open({
            kind: DW_ROW_MENU_TARGET,
            value: {
              sessionId,
              displayTitle: typeof row.title === 'string' ? row.title : ''
            }
          }, { x: Math.round(rect.left), y: Math.round(rect.bottom) })
        } catch {
          // A withdrawn service leaves the row inert; the next snapshot re-renders it.
        }
      }, [contextMenus])

      const mountsRef = React.useRef<DynamicWorkspaceMounts | null>(null)
      const latestRef = React.useRef<LatestSnapshot | null>(null)
      const mainViewRef = React.useRef<{ ids: Set<string>, currentId: string | null }>({ ids: new Set(), currentId: null })
      const bucketCacheRef = React.useRef<Map<string, boolean>>(dwReadBucketCache())
      const markedWorkspaceRef = React.useRef<Set<Element>>(new Set())
      const aliveRef = React.useRef(true)
      const applyScheduledRef = React.useRef(false)
      const durationsRef = React.useRef<Map<string, RunningDuration>>(new Map())
      const firstRenderRef = React.useRef(true)

      // Read-state synchronization with the Host-shared document. The local
      // localStorage cache stays authoritative for rendering; the Host merges
      // maxima so every browser/profile sees the same acknowledgements.
      const ackedRef = React.useRef(ackedBaselines)
      ackedRef.current = ackedBaselines
      const ackedPushTimerRef = React.useRef<number | null>(null)
      const ackedPendingPushRef = React.useRef<Map<string, number>>(new Map())
      const ackedPushInFlightPromiseRef = React.useRef<Promise<void> | null>(null)
      const ackedPushInFlightRef = React.useRef(false)
      const ackedSyncInFlightRef = React.useRef(false)
      const ackedMigrationRef = React.useRef(false)
      const applyAckedHostEntries = React.useCallback((entries: Record<string, number>): Map<string, number> => {
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
            console.warn('[power-suite] read-acks push failed', error !== null && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string' ? ((error as { message: string }).message).slice(0, 200) : error)
          } finally {
            ackedPushInFlightRef.current = false
            ackedPushInFlightPromiseRef.current = null
          }
        })()
        ackedPushInFlightPromiseRef.current = run
        return run
      }, [applyAckedHostEntries])
      const scheduleAckedPush = React.useCallback((entries: Record<string, number>): void => {
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

      const newSessionInFlightRef = React.useRef<Set<string>>(new Set())
      /**
       * Create a blank Session in the same directory as one card row and open it,
       * without opening the row's own Session. Falls back to the Workspace's New
       * Session flow when the cwd is unknown or creation fails; an in-flight set
       * guards double clicks.
       * @param {object} row - card row carrying id/workspaceId/cwd.
       * @returns {void}
       */
      const openNewSession = React.useCallback((row: DynamicRow): void => {
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
        const request: { workspaceId?: string, cwd?: string } = {}
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

      // The card pin is this panel's own fixed state, shared through the Host so
      // it follows the user across every paired browser/device but never imports
      // the native sidebar's project-organisation pins (those must not surface
      // here). The local cache paints instantly and queues operations while the
      // Host route is unreachable (e.g. before the service restart that installs
      // it); the Host document is authoritative once a GET succeeds.
      const [pinCache, setPinCache] = React.useState<PinCache>(dwReadPinCache)
      const pinnedIds = React.useMemo(
        () => dwPinEffectiveIds(pinCache.pinned, pinCache.pending),
        [pinCache]
      )
      const [pinShared, setPinShared] = React.useState(false)
      React.useEffect(() => {
        dwWritePinCache(pinCache)
      }, [pinCache])
      const pinStateRef = React.useRef<PinRuntime>({ cache: pinCache, flushing: false, syncInFlight: false, disposed: false, flushTimer: null })
      pinStateRef.current.cache = pinCache
      const schedulePinFlushRef = React.useRef<() => void>(() => {})
      // Publish the queued operations. A no-op when nothing is queued; runs after
      // the debounce, after a successful sync, and on every sync cycle (retry).
      const flushPinOps = React.useCallback(async () => {
        const state = pinStateRef.current
        if (state.disposed || state.flushing) return
        const ops = state.cache.pending
        if (ops.length === 0) return
        state.flushing = true
        try {
          const document = await dwPostPinOps(ops)
          if (document === null || state.disposed) {
            if (!state.disposed) setPinShared(false)
            return
          }
          setPinShared(true)
          setPinCache((previous) => {
            // Operations appended while the request was in flight stay queued.
            const rest = previous.pending.length > ops.length ? previous.pending.slice(ops.length) : []
            return { version: DW_PIN_VERSION, rev: document.rev, pinned: document.pinned, pending: rest, migrated: true }
          })
        } finally {
          state.flushing = false
        }
        // Publish anything queued during the request once the render lands.
        if (state.cache.pending.length > 0) schedulePinFlushRef.current()
      }, [])
      const schedulePinFlush = React.useCallback(() => {
        const state = pinStateRef.current
        if (state.disposed || state.flushTimer !== null) return
        state.flushTimer = window.setTimeout(() => {
          state.flushTimer = null
          void flushPinOps()
        }, DW_PIN_PUSH_DEBOUNCE_MS)
      }, [flushPinOps])
      schedulePinFlushRef.current = schedulePinFlush
      // Read the authoritative Host document. On first contact this browser's
      // cached pins are merged in (publishing any the Host does not know yet), so
      // pins made before the Host route existed are not lost; afterwards the Host
      // document wins and the queued operations simply replay on top.
      const syncPinDocument = React.useCallback(async () => {
        const state = pinStateRef.current
        if (state.disposed || state.syncInFlight) return
        state.syncInFlight = true
        try {
          const document = await dwFetchPinnedSessions()
          if (document === null || state.disposed) {
            if (!state.disposed) setPinShared(false)
            return
          }
          setPinShared(true)
          setPinCache((previous) => {
            const pending = previous.pending
            if (!previous.migrated) {
              const merged = [...document.pinned]
              for (const id of previous.pinned) if (!merged.includes(id)) merged.push(id)
              const ops: PendingPinOp[] = []
              for (const id of merged) if (!document.pinned.includes(id)) ops.push({ op: 'pin', id })
              const nextPending = ops.length === 0 ? pending : pending.concat(ops)
              return {
                version: DW_PIN_VERSION,
                rev: document.rev,
                pinned: merged,
                pending: nextPending.length > DW_PIN_MAX_PENDING
                  ? nextPending.slice(nextPending.length - DW_PIN_MAX_PENDING)
                  : nextPending,
                migrated: true
              }
            }
            return { version: DW_PIN_VERSION, rev: document.rev, pinned: document.pinned, pending, migrated: true }
          })
          schedulePinFlushRef.current()
        } finally {
          state.syncInFlight = false
        }
      }, [])
      React.useEffect(() => {
        const state = pinStateRef.current
        state.disposed = false
        const sync = () => { void syncPinDocument() }
        sync()
        const timer = window.setInterval(sync, DW_PIN_SYNC_POLL_MS)
        const onFocus = () => sync()
        const onVisibility = () => {
          if (document.visibilityState === 'visible') sync()
        }
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          state.disposed = true
          window.clearInterval(timer)
          window.removeEventListener('focus', onFocus)
          document.removeEventListener('visibilitychange', onVisibility)
          if (state.flushTimer !== null) {
            window.clearTimeout(state.flushTimer)
            state.flushTimer = null
          }
        }
      }, [syncPinDocument])
      const togglePin = React.useCallback((sessionId: string): void => {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return
        setPinCache((previous) => {
          const effective = dwPinEffectiveIds(previous.pinned, previous.pending)
          const op = effective.has(sessionId) ? 'unpin' : 'pin'
          const pending = previous.pending.concat({ op, id: sessionId })
          if (pending.length > DW_PIN_MAX_PENDING) pending.splice(0, pending.length - DW_PIN_MAX_PENDING)
          return { ...previous, pending }
        })
        schedulePinFlush()
      }, [schedulePinFlush])

      const runningParents = dwRunningSubagentParents(sessions, statuses)
      const workspaces = workspaceSnapshot?.items ?? []
      const archivedIds = new Set(workspaceSnapshot?.archivedSessionIds ?? [])
      // The current Session is the one the main conversation shows. The client
      // summary's `retainedBy.mainView` counter is the same source the read-baseline
      // effect trusts; a Session that just gained retention wins over an older one
      // that is still being released, so opening a Session anywhere (card, native
      // sidebar, elsewhere) moves the highlight immediately.
      const mainViewIds: string[] = []
      if (sessions !== null && typeof sessions === 'object' && Array.isArray(sessions.ids)) {
        for (const id of sessions.ids) {
          if ((sessions.byId?.[id]?.retainedBy?.mainView ?? 0) > 0) mainViewIds.push(id)
        }
      }
      const previousMain = mainViewRef.current
      const newlyRetained = mainViewIds.find((id) => !previousMain.ids.has(id))
      let currentSessionId: string | null = null
      if (newlyRetained !== undefined) currentSessionId = newlyRetained
      else if (previousMain.currentId !== null && mainViewIds.includes(previousMain.currentId)) currentSessionId = previousMain.currentId
      else currentSessionId = mainViewIds[0] ?? null
      mainViewRef.current = { ids: new Set(mainViewIds), currentId: currentSessionId }
      const runningRows = dwRunningRows(sessions, statuses, workspaces, t, runningParents, archivedIds, sessionActivity)
      const recentRows = dwRecentRows(sessions, statuses, workspaces, t, now, runningParents, archivedIds, windows.recentMs, sessionActivity)
      // Pending question/plan-review/approval notices: derived from the same
      // Session status snapshot the native composer cards use, filtered to the
      // Sessions that are not open in the main view. Re-derived every render, so
      // switching to the asking Session (or the interaction settling) hides it.
      const pendingIds = dwPendingSessionIds({
        list: sessions,
        statuses,
        currentSessionId,
        archived: archivedIds,
        activity: sessionActivity
      })
      // Waiting Sessions also get the inline flag in the native Workspaces tree:
      // a small amber flag-fill immediately before the Session title. No popup is
      // rendered and the row itself stays the click target.
      const pendingNativeKey = Array.isArray(pendingIds) ? pendingIds.join('|') : ''
      React.useLayoutEffect(() => {
        if (typeof document === 'undefined') return undefined
        const pending = new Set(pendingNativeKey.length > 0 ? pendingNativeKey.split('|') : [])
        const label = t('row.pending')
        const makeFlag = () => {
          const flag = document.createElement('span')
          flag.className = 'dps-row-pending-flag'
          flag.setAttribute('role', 'img')
          flag.setAttribute('aria-label', label)
          flag.title = label
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          svg.setAttribute('width', '12')
          svg.setAttribute('height', '12')
          svg.setAttribute('viewBox', '0 0 24 24')
          svg.setAttribute('fill', 'currentColor')
          svg.setAttribute('aria-hidden', 'true')
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', DW_FLAG_FILL_PATH)
          svg.appendChild(path)
          flag.appendChild(svg)
          return flag
        }
        // Match individual class tokens (the shell hashes them, e.g.
        // `YDXeBa_slot`), not the whole className string: our own
        // `dps-row-pending-slot` class on the same element must not break the match.
        const hasClassSuffix = (element: Element, suffix: string): boolean => {
          if (!(element instanceof HTMLElement)) return false
          for (const token of element.classList) {
            if (token === suffix || token.endsWith(`_${suffix}`)) return true
          }
          return false
        }
        const directChild = (row: Element, suffix: string): Element | null => {
          for (const child of row.children) {
            if (hasClassSuffix(child, suffix)) return child
          }
          return null
        }
        const slotOf = (row: Element): Element | null => directChild(row, 'slot')
        const titleOf = (row: Element): Element | null => directChild(row, 'title')
        const isFlag = (element: Element): boolean => element instanceof HTMLElement && element.classList.contains('dps-row-pending-flag')
        const apply = () => {
          const root = document.querySelector('[class*="_sidebarCol"]')
          if (root === null) return
          for (const row of root.querySelectorAll('[data-row-key^="session:"]')) {
            const key = row.getAttribute('data-row-key') ?? ''
            const sessionId = key.slice('session:'.length)
            const wanted = pending.has(sessionId)
            const slot = slotOf(row)
            // React can recreate the row's leading slot between renders, leaving a
            // stray flag at row level next to the fresh slot one; keep exactly one
            // flag, inside the slot when the shell provides it.
            const stray = [...row.children].filter((child) => isFlag(child))
            const inSlot = slot === null ? [] : [...slot.children].filter((child) => isFlag(child))
            if (wanted) {
              row.setAttribute('data-power-suite-pending', '')
              for (const extra of stray) extra.remove()
              if (slot !== null) {
                slot.classList.add('dps-row-pending-slot')
                for (const extra of inSlot.slice(1)) extra.remove()
                if (inSlot.length === 0) slot.appendChild(makeFlag())
              } else {
                for (const extra of inSlot) extra.remove()
                const flags = [...row.children].filter((child) => isFlag(child))
                if (flags.length === 0) {
                  const title = titleOf(row)
                  if (title !== null) {
                    const flag = makeFlag()
                    flag.classList.add('dps-row-pending-flag-fallback')
                    row.insertBefore(flag, title)
                  }
                }
              }
            } else {
              row.removeAttribute('data-power-suite-pending')
              for (const extra of [...stray, ...inSlot]) extra.remove()
              if (slot !== null) slot.classList.remove('dps-row-pending-slot')
            }
          }
        }
        let observedRoot = document.querySelector('[class*="_sidebarCol"]')
        let frame = 0
        const schedule = () => {
          if (frame !== 0) return
          frame = window.requestAnimationFrame(() => {
            frame = 0
            apply()
          })
        }
        const observer = typeof MutationObserver === 'undefined' || document.body === null
          ? null
          : new MutationObserver((records) => {
            const root = document.querySelector('[class*="_sidebarCol"]')
            if (root !== observedRoot) {
              // The shell replaced the whole column (rail toggle/remount): follow
              // the new root; the body observer stays attached to the stable page.
              observedRoot = root
              schedule()
              return
            }
            if (root === null) return
            for (const record of records) {
              if (root.contains(record.target)) {
                schedule()
                return
              }
            }
          })
        if (observer !== null) observer.observe(document.body, { childList: true, subtree: true })
        apply()
        return () => {
          if (frame !== 0) window.cancelAnimationFrame(frame)
          if (observer !== null) observer.disconnect()
          const root = observedRoot ?? document
          for (const flag of root.querySelectorAll('.dps-row-pending-flag')) flag.remove()
          for (const slot of root.querySelectorAll('.dps-row-pending-slot')) slot.classList.remove('dps-row-pending-slot')
          for (const row of root.querySelectorAll('[data-row-key^="session:"][data-power-suite-pending]')) row.removeAttribute('data-power-suite-pending')
        }
      }, [pendingNativeKey, t])
      // Pinned main Sessions lead the card and never retire with time; every other
      // row keeps exactly the existing running-then-recent order. Toggling a pin
      // updates the card's own pinned document, which re-derives the row from its
      // original end time, so no timer or end time is ever rewritten here.
      const panelRows = dwPinPanelRows({
        list: sessions,
        statuses,
        workspaces,
        t,
        runningParents,
        archived: archivedIds,
        activity: sessionActivity,
        pinnedIds,
        runningRows,
        recentRows
      })
      const childrenByParent = dwSubagentChildren(sessions, statuses, now, archivedIds, windows.recentMs, workspaces, sessionActivity)
      const runningIds = new Set(runningRows.map((row) => row.id))
      const durations = new Map<string, RunningDuration>()
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

      latestRef.current = { sessions, statuses, workspaces: workspaceSnapshot, folds, windows, activity: sessionActivity, currentSessionId }
      // Test seam for the live hover-card figures: expose which Session each card
      // row maps to and a scoped patch/restore on the live projection snapshot, so
      // the E2E harness can prove the open card re-reads pushed projection frames
      // (no polling involved) without waiting for real model activity.
      const liveHooks = testHookHost.__POWER_SUITE_TEST_HOOKS__
      if (liveHooks !== null && typeof liveHooks === 'object') {
        const stash = new Map<string, unknown>()
        liveHooks.dynamicWorkspacesLive = {
          snapshot: () => {
            const latest = latestRef.current as LatestSnapshot
            const source = latest.sessions
            const ids = source !== null && typeof source === 'object' && Array.isArray(source.ids) ? source.ids : []
            const byId = source !== null && typeof source === 'object' ? source.byId : undefined
            const projections = source !== null && typeof source === 'object' ? source.projectionsBySession : undefined
            return {
              currentSessionId: latest.currentSessionId,
              // The card's own effective pin set (Host document + queued local
              // operations), mirrored so E2E can verify the shared state and the
              // local fallback without reading React internals.
              pinnedIds: [...pinnedIds],
              pinShared,
              rows: ids.map((id) => ({ id, title: byId?.[id]?.displayTitle ?? null, state: latest.statuses?.get?.(id) ?? null })),
              values: Object.fromEntries(ids.map((id) => [id, projections?.[id]?.values ?? null]).filter(([, value]) => value !== null))
            }
          },
          patchStats: (sessionId: string, deltaTurns: number, deltaSteps: number) => {
            const latest = latestRef.current
            if (latest === null) return false
            const record = latest.sessions?.projectionsBySession?.[sessionId]
            if (record === null || record === undefined || typeof record.values !== 'object' || record.values === null) return false
            const values = record.values as Record<string, unknown>
            stash.set(sessionId, values)
            const base = values.sessionStats
            if (base === null || base === undefined || typeof base !== 'object') return false
            const baseRecord = base as Record<string, unknown>
            record.values = {
              ...values,
              sessionStats: {
                ...baseRecord,
                turns: (Number(baseRecord.turns) || 0) + deltaTurns,
                steps: (Number(baseRecord.steps) || 0) + deltaSteps
              }
            }
            return true
          },
          restoreStats: (sessionId: string) => {
            const original = stash.get(sessionId)
            if (original === undefined) return false
            const record = latestRef.current?.sessions?.projectionsBySession?.[sessionId]
            if (record !== null && record !== undefined) record.values = original
            stash.delete(sessionId)
            return true
          }
        }
      }
      // Read state is derived at render time from the acknowledged baseline:
      // opening a Session raises its baseline to the observed `updatedAt`, and a
      // genuinely newer activity naturally exceeds that baseline again. There is
      // no running-based clearing branch, so a transient status flag can never
      // flip a read row back to unread.
      React.useEffect(() => {
        if (sessions === null || typeof sessions !== 'object' || !Array.isArray(sessions.ids) || sessions.ids.length === 0) return
        const raised: Record<string, number> = {}
        let changed = false
        const next = new Map<string, number>(ackedBaselines)
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
            console.warn('[power-suite] activity/ack sync failed', error !== null && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string' ? ((error as { message: string }).message).slice(0, 200) : error)
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
        // First paint after a reload happens before the Session catalog hydrates,
        // and an empty catalog classifies every section as Inactive — a persisted
        // Active fold would visibly paint expanded and then collapse. During that
        // pre-hydration pass only, reuse the last observed bucket classification;
        // live data always wins as soon as the catalog exists.
        const sessionIds = Array.isArray(latest.sessions?.ids) ? latest.sessions.ids : []
        const cachedBuckets = bucketCacheRef.current
        // `phase` is the shell catalog's pending → ready edge; older shell builds do
        // not expose it, so an empty id list also counts as not hydrated.
        const catalogPhase = latest.sessions?.phase
        const catalogReady = catalogPhase === 'ready' || (catalogPhase === undefined && sessionIds.length > 0)
        const useCachedBuckets = !catalogReady && cachedBuckets.size > 0
        const activity = useCachedBuckets
          ? null
          : dwActiveSessions(
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
        if (activity !== null) {
          for (const row of activity.rows) {
            const workspaceId = activity.workspaceOf.get(row.id)
            if (workspaceId === undefined) {
              ungroupedActive = true
              continue
            }
            activeIds.add(workspaceId)
            recencyByWorkspace.set(workspaceId, Math.max(recencyByWorkspace.get(workspaceId) ?? 0, row.updatedAt))
          }
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
          const cacheKey = workspaceId.length === 0 ? DW_BUCKET_UNGROUPED : workspaceId
          const active = useCachedBuckets
            ? cachedBuckets.get(cacheKey) === true
            : (workspaceId.length === 0 ? ungroupedActive : activeIds.has(workspaceId))
          sections.push({ element: child, row, workspaceId, cacheKey, active, domIndex, recency: recencyByWorkspace.get(workspaceId) ?? 0 })
          domIndex += 1
        }
        const activeSections = sections.filter((section) => section.active)
        const inactiveSections = sections.filter((section) => !section.active)
        activeSections.sort((left, right) => (right.recency - left.recency) || (left.domIndex - right.domIndex))
        const ordered = [...activeSections, ...inactiveSections]
        // Only touch the native inline style when it actually changes: redundant
        // writes would retrigger the style observer below in a loop.
        ordered.forEach((section, index) => {
          const order = String((section.active ? 100 : 5001) + index)
          if (section.element.style.order !== order) section.element.style.order = order
        })
        for (const section of sections) {
          const collapsed = section.active ? latest.folds.active : latest.folds.inactive
          const display = collapsed ? 'none' : ''
          if (section.element.style.display !== display) section.element.style.display = display
        }
        if (refs.activeHeader.style.order !== '0') refs.activeHeader.style.order = '0'
        if (refs.inactiveHeader.style.order !== '5000') refs.inactiveHeader.style.order = '5000'
        const empty = sections.length === 0
        const headerDisplay = empty ? 'none' : ''
        if (refs.activeHeader.style.display !== headerDisplay) refs.activeHeader.style.display = headerDisplay
        if (refs.inactiveHeader.style.display !== headerDisplay) refs.inactiveHeader.style.display = headerDisplay
        // Current-Session marker: the native Workspace row that owns the Session
        // open in the main view carries the same rainbow wave as the card row.
        const marked = markedWorkspaceRef.current
        for (const element of marked) element.removeAttribute('data-psd-current-workspace')
        marked.clear()
        let currentWorkspaceKey = null
        if (typeof latest.currentSessionId === 'string' && latest.currentSessionId.length > 0) {
          let owner = dwOwningWorkspace(latest.currentSessionId, workspaces)
          if (owner === null) {
            // A subagent Session opened from a card child row has no own Workspace
            // entry; its parent Session's Workspace is the project the user opened.
            const summary = latest.sessions?.byId?.[latest.currentSessionId]
            const parentId = summary !== null && typeof summary === 'object' && typeof summary.parentId === 'string'
              ? summary.parentId
              : ''
            if (parentId.length > 0) owner = dwOwningWorkspace(parentId, workspaces)
          }
          currentWorkspaceKey = owner !== null && typeof owner.workspaceId === 'string' && owner.workspaceId.length > 0
            ? owner.workspaceId
            : DW_BUCKET_UNGROUPED
        }
        let markedWorkspaceRow = null
        if (currentWorkspaceKey !== null) {
          for (const section of sections) {
            if (section.cacheKey !== currentWorkspaceKey) continue
            section.row.setAttribute('data-psd-current-workspace', 'true')
            marked.add(section.row)
            markedWorkspaceRow = section.row
            break
          }
        }
        // B4 v3: the owning Workspace row and the native Session row of the open
        // Session get the same internal rainbow atmosphere (max two renderers).
        dwSyncNativeAtmospheres(
          markedWorkspaceRow instanceof HTMLElement ? markedWorkspaceRow : null,
          typeof latest.currentSessionId === 'string' ? latest.currentSessionId : null
        )
        // Remember this classification so the next reload can apply persisted
        // folds before the stores hydrate (see useCachedBuckets above).
        if (activity !== null) {
          let changed = cachedBuckets.size !== sections.length
          const next = new Map()
          for (const section of sections) {
            next.set(section.cacheKey, section.active)
            if (!changed && cachedBuckets.get(section.cacheKey) !== section.active) changed = true
          }
          if (changed) {
            bucketCacheRef.current = next
            dwWriteBucketCache(next)
          }
        }
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
        let observer: MutationObserver | null = null
        let observedTarget: HTMLElement | null = null
        let retry: number | null = null
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
          // Attribute watches catch a native re-render that resets an inline
          // `display`/`order` we already applied; every write above compares the
          // current value first, so this cannot loop on our own updates.
          observer.observe(sidebar, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
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
          if (retry !== null) window.clearInterval(retry)
          if (observer !== null) observer.disconnect()
          const refs = mountsRef.current
          mountsRef.current = null
          if (refs !== null) {
            if (refs.panel instanceof HTMLElement) refs.panel.remove()
            if (refs.activeHeader instanceof HTMLElement) refs.activeHeader.remove()
            if (refs.inactiveHeader instanceof HTMLElement) refs.inactiveHeader.remove()
            for (const element of markedWorkspaceRef.current) element.removeAttribute('data-psd-current-workspace')
            markedWorkspaceRef.current.clear()
            dwClearNativeAtmospheres()
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
      // The list snapshot already carries every projection value the Host pushes
      // for live Sessions; a cold (persisted) Session gets one one-shot read when
      // its row is hovered. Both stay client-only: no Host route, no new inject.
      const sessionProjections = sessions !== null && typeof sessions === 'object'
        ? sessions.projectionsBySession
        : undefined
      const ensureProjections = (sessionId: string): void => {
        if (parentSessions === null || parentSessions === undefined) return
        if (typeof parentSessions.refreshProjections !== 'function') return
        try {
          const pending = parentSessions.refreshProjections(sessionId)
          if (pending !== null && pending !== undefined && typeof (pending as { catch?: unknown }).catch === 'function') (pending as Promise<unknown>).catch(() => {})
        } catch {
          // A Host without the projection units leaves the figures out; the card
          // itself still renders.
        }
      }
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
        projections: sessionProjections,
        onEnsureProjections: ensureProjections,
        onNewSession: openNewSession,
        pinnedIds,
        onTogglePin: togglePin,
        menuSessionId,
        menuEnabled: contextMenus !== null && contextMenus !== undefined && typeof contextMenus.open === 'function',
        onOpenSessionMenu: openSessionMenu,
        pendingIds,
        onToggle: () => setPanelExpanded((value) => !value),
        onToggleAll: () => setShowAll((value) => !value),
        onToggleChildren: (id: string) => setCollapsedParents((value) => {
          const next = new Set(value)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }),
        onOpen: (id: string) => {
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
    function installDynamicWorkspaces(ctx: DynamicWorkspacesContext): void {
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
      }, (props: DynamicWorkspacesSeatProps) => React.createElement(DynamicWorkspaceSeat, {
        ...props,
        t,
        uiWorkspace: ctx.uiWorkspace,
        parentSessions: ctx.sessions,
        contextMenus: ctx.contextMenus,
        interruptedT: ctx.locale.bind(interruptedNamespace)
      }))), 'power-suite: dynamic-workspaces seat')
      // The card row "..." menu is the shared native context-menu popup. This
      // contribution serves the plugin-owned captured-target kind the card opens;
      // it resolves the native `session` target (which collects every provider's
      // session actions) and delegates the resulting views as delegating actions,
      // filtered of Pin/Unpin. Selecting one runs the nested native resolution's
      // `select`, so native and plugin-contributed behavior is preserved while
      // the native popup supplies icons, shortcut hints, material and dismissal.
      ctx.effect(() => {
        const contextMenus = ctx.contextMenus
        if (contextMenus === null || contextMenus === undefined || typeof contextMenus.register !== 'function') return undefined
        return contextMenus.register({
          id: DW_ROW_MENU_PROVIDER,
          target: DW_ROW_MENU_TARGET,
          order: 100,
          resolve: (value: unknown, signal: AbortSignal | null | undefined) => dwRowMenuResolve(contextMenus, value, signal)
        })
      }, 'power-suite: session row menu')
    }
  return { install: installDynamicWorkspaces }
}
