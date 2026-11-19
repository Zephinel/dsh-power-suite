/**
 * Stateful controller of the UI element annotation mode.
 *
 * One controller per installed client owns the observable snapshot and every
 * stateful concern the React surface does not: capture-phase event isolation,
 * hover/selection geometry, the marquee, the layout frame, persistence,
 * Composer insertion, chip previews, the detail card and the exit ladder. The
 * pure models under this directory own the decisions; React only renders the
 * snapshot this module publishes.
 *
 * The composer seat mirrors the current Session identity into the shared
 * {@link AnnotationBridge}; the controller reads it for record capture and
 * insertion. All listeners, timers and observers live in `dispose`.
 *
 * @module
 */

import {
  ANNOTATION_BATCH_POPOVER_SIZE,
  ANNOTATION_CHIP_PREVIEW_SIZE,
  ANNOTATION_DETAIL_CLOSE_DELAY_MS,
  ANNOTATION_DETAIL_HOVER_DELAY_MS,
  ANNOTATION_FALLBACK_SCAN_MAX,
  ANNOTATION_PAINT_Z,
  ANNOTATION_PERSIST_DEBOUNCE_MS,
  ANNOTATION_RAISED_ATTR,
  ANNOTATION_STATE_EVENT,
  ANNOTATION_UNDO_WINDOW_MS,
  LAUNCHER_STORAGE_KEY,
  RAIL_STORAGE_KEY
} from './constants.ts'
import {
  ANNOTATION_LAUNCHER_SIZE,
  ANNOTATION_POPOVER_SIZE,
  annotationAccessibleName,
  annotationBoxCandidateElements,
  annotationCandidateChain,
  annotationDescriptorOf,
  annotationEventElement,
  annotationFocusComposer,
  annotationInsertLabels,
  annotationLayoutFrame,
  annotationMeasureSidebarWidths,
  annotationRectOf,
  annotationElementVisible,
  annotationResolveNode,
  annotationViewport
} from './dom.ts'
import {
  ANNOTATION_DETAIL_SIZE,
  clampDetailCardPosition,
  clampLauncherPosition,
  clampPopoverPosition,
  clampPopoverPositionToViewport,
  computeRailWidth,
  layoutModeFor
} from './geometry.ts'
import type { Point } from './geometry.ts'
import {
  ANNOTATION_MAX_ANCESTORS,
  annotationLocatorText,
  buildElementRef,
  describeLocator,
  elementLabel,
  identityKeyOf,
  isDynamicValue
} from './identity.ts'
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
  parseAnnotationStore,
  serializeAnnotationStore
} from './records.ts'
import { createAnnotationState, reduceAnnotationState } from './reducer.ts'
import {
  annotationResolveStatus,
  resolveNodeCandidate
} from './resolution.ts'
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
} from './serializers.ts'
import {
  SETTINGS_STORAGE_KEY,
  modifierMatches,
  parseStoredSettings,
  resolveModifierChange,
  serializeSettings
} from './settings.ts'
import {
  annotationRoutePath,
  annotationWorkspaceLabel,
  formatAnnotationTime,
  normalizeAnnotationBounds,
  sessionShortLabel
} from './format.ts'
import {
  annotationNormalizeQuoteText,
  normalizeUserNote,
  sanitizeText,
  textDigest
} from './text.ts'
import {
  ANNOTATION_EMPTY_TEXT_DIGEST,
  annotationCopyAnchorDecision,
  annotationDescendantAncestorMatches,
  annotationEphemeralOutcome,
  annotationFallbackCacheKey,
  annotationFullXPathOf,
  annotationHasStrongIdentity,
  annotationJsPathFor,
  annotationRenderedTextOf,
  annotationScopeAuthorityOutcome,
  annotationScoreQuoteMatches,
  annotationStatusConfidence,
  annotationStatusLabelKey,
  annotationXPathOf
} from './anchors.ts'
import {
  annotationLeafPickIndex,
  annotationRailRightForPane,
  annotationSurfaceLevels,
  annotationSurfacePinEligible,
  annotationSurfacePinEventMatches,
  annotationSurfaceRoot
} from './surface.ts'
import type {
  AnnotationBridge,
  AnnotationComposerServices,
  AnnotationControllerContext,
  AnnotationFallbackScanProbe,
  AnnotationInputActions,
  AnnotationMarkDescriptor,
  AnnotationMarkUndo,
  AnnotationSnapshot,
  AnnotationStatusDetail,
  AnnotationStore
} from './types.ts'
import type { AnnotationState } from './reducer.ts'
import type { AnnotationCollectionEntry } from './records.ts'
import type { AnnotationElementRef } from './identity.ts'
import type { AnnotationResolutionOutcome } from './anchors.ts'
import { annotationReadStorage, annotationWriteStorage } from './storage.ts'
import type { AnnotationModifierField } from './settings.ts'

/** XPathResult.ORDERED_NODE_SNAPSHOT_TYPE: the standard DOM constant. */
const ANNOTATION_XPATH_SNAPSHOT = 7

/** XPathResult.FIRST_ORDERED_NODE_TYPE: the standard DOM constant. */
const ANNOTATION_XPATH_FIRST = 9

/** NodeFilter.SHOW_TEXT: the standard DOM constant. */
const ANNOTATION_SHOW_TEXT = 4

/** Node.TEXT_NODE: the standard DOM constant. */
const ANNOTATION_TEXT_NODE = 3

/** Structural view of one text node during offset resolution. */
interface AnnotationTextNode {
  nodeValue?: string | null
  nodeType?: number
  parentElement?: Element | null
  nextSibling?: AnnotationTextNode | null
}

/** Structural XPath result used by the two fallback queries. */
interface AnnotationXPathSnapshot {
  snapshotLength: number
  snapshotItem(index: number): unknown
  singleNodeValue: unknown
}

/** One window listener recorded for removal. */
interface AnnotationPageListener {
  type: string
  handler: AnnotationListener
  options?: boolean | Record<string, unknown>
}

/** A listener the controller can install under both DOM type profiles. */
type AnnotationListener = (event: unknown) => void

/** Structural view of the pointer events the capture listeners receive. */
interface AnnotationPointerEventView {
  target?: unknown
  relatedTarget?: unknown
  button?: number
  clientX: number
  clientY: number
  pointerId?: number
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  defaultPrevented?: boolean
  preventDefault: () => void
  stopImmediatePropagation: () => void
  composedPath?: () => unknown[]
}

/** Structural view of the keyboard events the capture listeners receive. */
interface AnnotationKeyboardEventView {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
  preventDefault: () => void
  stopPropagation: () => void
  stopImmediatePropagation: () => void
}

/** One pointer gesture in flight. */
interface AnnotationGesturePointer {
  startX: number
  startY: number
  moved: boolean
  boxMode: boolean
  pointerId?: number
}

/** One candidate chain entry. */
interface AnnotationChainEntry {
  element: Element
  insideComposer: boolean
}

/** The picked chain cursor used by Parent/Child. */
interface AnnotationPick {
  entries: AnnotationChainEntry[]
  index: number
  parentStep: number
  surface: 'page' | 'floating'
}

/** One inline CSS property captured before the mode writes it. */
interface AnnotationInlineProperty {
  value: string
  priority: string
}

/** Captured shell-overlay z-index state. */
interface AnnotationPaintSnapshot {
  element: HTMLElement
  index: AnnotationInlineProperty
}

/** Captured layout-frame inline state. */
interface AnnotationFrameSnapshot {
  frame: HTMLElement
  paddingRight: AnnotationInlineProperty
  railWidth: AnnotationInlineProperty
}

/** The session-scoped Composer input facade the controller calls. */
interface AnnotationComposerInput {
  insertReference?: (reference: unknown, span: unknown) => boolean
  editor?: {
    update?: (callback: () => void) => void
    getEditorState?: () => unknown
    getElementByKey?: (key: string) => unknown
  }
}

/** Structural view of one captured locator. */
interface AnnotationLocatorView {
  tag?: unknown
  role?: unknown
  name?: unknown
  uniqueSelector?: unknown
  xpath?: unknown
  jsPath?: unknown
  candidates?: unknown
  ancestors?: unknown
  textQuote?: unknown
  textPosition?: unknown
  anchorTarget?: unknown
  anchorLeafTag?: unknown
  ephemeral?: unknown
  surface?: unknown
  [key: string]: unknown
}

/** Structural view of one captured record. */
interface AnnotationRecordView {
  id?: unknown
  note?: unknown
  requirement?: unknown
  bounds?: unknown
  viewport?: unknown
  text?: unknown
  textDigest?: unknown
  session?: unknown
  locator?: AnnotationLocatorView | null
  [key: string]: unknown
}

/** The inline-style surface the mode writes and restores. */
interface AnnotationInlineStyle {
  getPropertyValue(name: string): string
  getPropertyPriority(name: string): string
  setProperty(name: string, value: string, priority?: string): void
  removeProperty(name: string): void
}

/** Read one untrusted record. */
function annotationRecordOf(value: unknown): AnnotationRecordView {
  return value !== null && typeof value === 'object' ? value as AnnotationRecordView : {}
}

/** Read one record's locator. */
function annotationLocatorOf(value: unknown): AnnotationLocatorView {
  const locator = annotationRecordOf(value).locator
  return locator !== null && typeof locator === 'object' ? locator : {}
}

/** Read one record's Session identity. */
function annotationSessionIdOf(ref: unknown): string | null {
  const session = annotationRecordOf(ref).session
  if (session === null || typeof session !== 'object') return null
  const id = (session as { sessionId?: unknown }).sessionId
  return typeof id === 'string' && id.length > 0 ? id : null
}

/** Read one element's inline style through the structural surface. */
function annotationStyle(element: Element): AnnotationInlineStyle {
  return (element as unknown as { style: AnnotationInlineStyle }).style
}

/** Read one lowercase tag name through the structural surface. */
function annotationTagOf(element: Element): string {
  const tagName = (element as unknown as { tagName?: unknown }).tagName
  return typeof tagName === 'string' ? tagName.toLowerCase() : ''
}

/** Read one bounded tag collection through the structural document surface. */
function annotationElementsByTag(tag: string): ArrayLike<Element> {
  const host = document as unknown as { getElementsByTagName?: (name: string) => ArrayLike<Element> }
  return typeof host.getElementsByTagName === 'function' ? host.getElementsByTagName(tag) : []
}

/** Structural view of one mutation record target. */
interface AnnotationMutationTarget {
  nodeType?: unknown
  parentElement?: Element | null
  closest?: (selector: string) => Element | null
  querySelector?: (selector: string) => Element | null
}

/** Structural observer surface shared by the two MutationObserver users. */
interface AnnotationObserver {
  disconnect(): void
  observe(target: Element, options?: Record<string, unknown>): void
}

/** Stable dependencies the entry binds once per plugin factory. */
export interface AnnotationControllerDeps {
  bridge: AnnotationBridge
}

/** One-shot diagnostic for the Session-identity fallback (never fully silent). */
let annotationIdentityWarned = false

/**
 * Create the observable annotation store.
 * @param {object} initial - initial snapshot.
 * @returns {{ getSnapshot: Function, subscribe: Function, set: Function }} store.
 */
function createAnnotationStore(initial: AnnotationSnapshot): AnnotationStore {
  let snapshot: AnnotationSnapshot = initial
  const listeners = new Set<() => void>()
  return {
    /** @returns {object} the current snapshot. */
    getSnapshot(): AnnotationSnapshot {
      return snapshot
    },
    /**
     * Subscribe one listener.
     * @param {Function} listener - change listener.
     * @returns {Function} unsubscribe.
     */
    subscribe(listener: () => void): () => void {
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
    set(next: AnnotationSnapshot): void {
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
export function createAnnotationController(t: DshTranslate, ctx: AnnotationControllerContext, deps: AnnotationControllerDeps) {
  const bridge = deps.bridge
  let settings = parseStoredSettings(annotationReadStorage(SETTINGS_STORAGE_KEY))
  let railCollapsed = annotationReadStorage(RAIL_STORAGE_KEY) === 'true'
  const viewport = annotationViewport()
  // Records are the feature's data spine: they survive reloads, so the store
  // starts from the validated persisted document instead of an empty list (D1).
  const storedDocument = parseAnnotationStore(annotationReadStorage(ANNOTATION_RECORDS_STORAGE_KEY))
  const storedEntries = storedDocument.entries
  const store = createAnnotationStore({
    state: { ...createAnnotationState(), collection: storedEntries },
    settings: { ...settings },
    launcherPosition: clampLauncherPosition(readLauncherPosition(), viewport, ANNOTATION_LAUNCHER_SIZE),
    launcherDragging: false,
    railWidth: computeRailWidth(viewport.width, railCollapsed, 'status'),
    railCollapsed,
    layoutMode: 'shrink',
    hoverRect: null,
    selectionRects: [],
    boxRect: null,
    popoverPosition: null,
    popoverPinned: false,
    batchPosition: null,
    batchPinned: false,
    flashRefId: null,
    flashRect: null,
    noteEditor: null,
    // A3/T21: composer reference-chip hover preview (transient, never persisted).
    chipPreview: null,
    // A3/T22: the × affordance shown over a hovered annotation reference chip.
    chipAction: null,
    // A3/T29: secondary confirmation before an exit that would clear records.
    exitConfirm: null,

    // A3 Phase 2-A transient UI state (never persisted): page marks derived per
    // geometry frame, the record under the pointer, the floating detail card,
    // and the single-slot undo payload.
    markRects: [],
    markerHoverId: null,
    detailCard: null,
    settingsOpen: false,
    markUndo: null
  })

  /** Installed window listeners, removed on deactivate. */
  const pageListeners: AnnotationPageListener[] = []
  /** Cleanups for temporary gesture listeners; teardown aborts all of them. */
  const activeGestures = new Set<(aborted: boolean) => void>()
  /** DOM revision: bumped by body mutations so resolved nodes can be reused safely (R1/R4). */
  let domRevision = 0
  /** Body mutation observer feeding domRevision; disconnected on deactivate/dispose. */
  let domObserver: AnnotationObserver | null = null
  /** Resolved-node cache: `{ node, rev }` per ref id, reused only at the same revision. */
  const resolvedNodeCache = new Map<string, { node: Element | null, rev: number }>()
  /** Per-DOM-revision resolution status cache for the mark geometry (keeps scroll frames cheap). */
  const markStatusCache = new Map<string, string>()
  let markStatusRevision = -1
  /** Hover identity tokens per element. */
  const elementTokens = new WeakMap<Element, string>()
  /** Chain and index of the last picked selection, for level up/down. */
  let lastPick: AnnotationPick | null = null
  /** Idle floating-launcher position captured when the mode activates (A3/T19). */
  let idleLauncherPosition: { x: number, y: number } | null = null
  /** Live element identity per selected ref id (A3/T18 leaf-first): the picked
   * chain element itself, so a selected span/svg row and its Parent/Child walk
   * paint their real rects even when an arbitrary ancestor's locator is weak
   * and re-resolution could land on a same-tag lookalike.
   */
  const pickedSelection = new Map<string, Element>()
  /** Pointer gesture in flight. */
  let pointer: AnnotationGesturePointer | null = null
  /** Last pointer point used for hover resolution. */
  let hoverPoint: { x: number, y: number } | null = null
  /** Hover rAF handle. */
  let hoverFrame: number | null = null
  /** F3 debounce: recompute hover/geometry after DOM mutations while the pointer stands still. */
  let hoverRecomputeTimer: number | null = null
  /** Geometry rAF handle. */
  let geometryFrame: number | null = null
  /** Resize debounce timer. */
  let resizeTimer: number | null = null
  /** Frame inline-style observer, the element it watches, and its debounce. */
  let frameObserver: AnnotationObserver | null = null
  let observedFrame: Element | null = null
  let frameObserverTimer: number | null = null
  /** Inline frame styles captured before the first mode write (F12). */
  let frameSnapshot: AnnotationFrameSnapshot | null = null
  /** Timer that drops the frame marker after the reverse transition (F12). */
  let frameRestoreTimer: number | null = null
  /** Feedback auto-dismiss timer. */
  let feedbackTimer: number | null = null
  /** Re-locate flash timer. */
  let flashTimer: number | null = null
  /** Until timestamp for the click that follows a launcher drag. */
  let suppressLauncherClickUntil = 0
  /** Ref id the current popover was placed for. */
  let popoverRefId: string | null = null
  /** Real mounted popover size used for clamping; the constant is only the fallback (F14). */
  let popoverMeasuredSize: { width: number, height: number } = { width: ANNOTATION_POPOVER_SIZE.width, height: ANNOTATION_POPOVER_SIZE.height }
  /** Measured batch popover size (updated on mount/resize) for viewport clamping. */
  let batchMeasuredSize: { width: number, height: number } = { width: ANNOTATION_BATCH_POPOVER_SIZE.width, height: ANNOTATION_BATCH_POPOVER_SIZE.height }
  /** Mounted batch popover root and its pending measurement frame. */
  let batchElement: Element | null = null
  let batchMeasureFrame: number | null = null
  /** Mounted popover element, only used for measurement. */
  let popoverElement: Element | null = null
  /** Pending popover measurement frame. */
  let popoverMeasureFrame: number | null = null
  /** Monotonic hover token. */
  let tokenSeq = 0
  /** F1: inline z-index captured from `[data-shell-overlay]` before raising it. */
  let paintSnapshot: AnnotationPaintSnapshot | null = null
  /** Pending records-persistence debounce timer (D1). */
  let persistTimer: number | null = null
  /** Last serialized records document, so no-op writes stay no-ops. */
  let persistedRecordsText: string | null = null
  /** Hover-intent timer that opens the detail card after the pointer rests on a mark. */
  let markerHoverTimer: number | null = null
  /** Grace timer that closes the detail card after the pointer leaves the mark/card union. */
  let detailCloseTimer: number | null = null
  /** Single-slot undo expiry timer (5 s from the last delete). */
  let undoExpireTimer: number | null = null
  /** Mounted detail card element and its measured size, used for clamping/keep-open. */
  let detailElement: Element | null = null
  let detailMeasuredSize: { width: number, height: number } = { width: ANNOTATION_DETAIL_SIZE.width, height: ANNOTATION_DETAIL_SIZE.height }
  /** Pending detail-card measurement frame. */
  let detailMeasureFrame: number | null = null
  /** Composer service faces attached by the dynamic T9 inject (may stay null). */
  let composerConversation: Record<string, unknown> | null = null
  let composerInputTriggers: Record<string, unknown> | null = null

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
   * @param {Record<string, unknown>} patch - partial snapshot.
   * @returns {void}
   */
  function publish(patch: Partial<AnnotationSnapshot>): void {
    const current = snapshot()
    let changed = false
    for (const key of Object.keys(patch) as Array<keyof AnnotationSnapshot>) {
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
  function eventInsideOwn(event: unknown): boolean {
    const element = annotationEventElement(event)
    if (element === null || typeof element.closest !== 'function') return false
    return element.closest('[data-psa-own]') !== null
  }

  /**
   * Whether an event target sits inside the composer region. The composer is
   * the destination of every insertion, so it stays natively interactive in
   * the mode: clicking the draft or Send must not be swallowed (otherwise an
   * inserted chip could never be sent).
   * @param {object} event - DOM event.
   * @returns {boolean} whether the target belongs to the composer.
   */
  function eventInsideComposer(event: unknown): boolean {
    const element = annotationEventElement(event)
    if (element === null || typeof element.closest !== 'function') return false
    return element.closest('[data-conversation-region="composer"]') !== null
  }

  /**
   * Whether the pass-through modifier is held for one event.
   * @param {object} event - DOM event.
   * @returns {boolean} whether the page keeps native semantics.
   */
  function passThroughEvent(event: AnnotationPointerEventView): boolean {
    return snapshot().state.passThrough || modifierMatches(event, settings.passThroughModifier)
  }

  /**
   * Apply one pass-through state to the reducer and the root cursor marker.
   * @param {boolean} on - whether the page has native mouse semantics.
   * @returns {void}
   */
  function setPassThrough(on: boolean): void {
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
  function blockEvent(event: AnnotationPointerEventView): boolean {
    if (!isActive()) return false
    if (eventInsideOwn(event)) return false
    if (eventInsideComposer(event)) return false
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
  function tokenOf(element: Element): string {
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
  function refForLevel(level: AnnotationChainEntry, like: unknown, surface: 'page' | 'floating') {
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
    const sessionId = bridge.sessionId ?? annotationConversationSessionId()
    const identity = sessionIdentity(sessionId)
    const previous = like !== null && typeof like === 'object' ? like as AnnotationRecordView : null
    const context = {
      sessionId: identity.sessionId,
      cwd: identity.cwd,
      workspaceLabel: identity.workspaceLabel,
      route: currentRoute(),
      viewport: annotationViewport(),
      surface: surface === 'floating' ? 'floating' : 'page',
      at: previous !== null && typeof previous.at === 'number' ? previous.at : Date.now(),
      order: previous !== null && typeof previous.order === 'number' ? previous.order : Date.now() % 1000000,
      bounds,
      levelChain
    }
    const ref = buildElementRef(descriptor, context)
    ref.note = previous !== null && typeof previous.note === 'string' ? previous.note : ''
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
  function pickLevels(chain: unknown): AnnotationPick {
    const entries = Array.isArray(chain) ? chain : []
    if (entries.length === 0) return { entries: [], index: -1, parentStep: 1, surface: 'page' }
    const surface = annotationSurfaceRoot(entries)
    if (surface !== null) {
      // A3 leaf-first: inside a floating surface the chain is cut at the
      // surface root (never escape upward), and the pick is the deepest
      // eligible element under the pointer (span/svg/path included). The
      // whole surface stays reachable through its background/padding hit or
      // by pressing Parent up the full chain.
      const boundary = entries.slice(0, Math.min(surface.index + 1, entries.length))
      return {
        entries: boundary,
        index: annotationLeafPickIndex(boundary),
        parentStep: 1,
        surface: 'floating'
      }
    }
    // Leaf-first everywhere: the page chain is the full ancestor chain and the
    // pick is the deepest eligible element (spans/svg included); Parent walks
    // up element by element towards the page container, Child back down.
    return {
      entries,
      index: annotationLeafPickIndex(entries),
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
  function refFromPick(pick: AnnotationPick, like: unknown) {
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
  /**
   * A3/T68: keep the annotation rail clear of the native right Sidebar pane.
   * The active document/files pane is identified from the Sidebar's own
   * `data-sidebar-right-tab` markers; the rail's `right` offset becomes the
   * pane's visible width. No pane => offset removed (rail stays at the edge).
   * @returns {void}
   */
  function syncRailDock() {
    let paneRect = null
    const panes = document.querySelectorAll('[data-dockkit-pane][data-dockkit-pane-active="true"]')
    for (const pane of panes) {
      if (!(pane instanceof HTMLElement)) continue
      if (pane.querySelector('[data-sidebar-right-tab]') === null) continue
      const rect = pane.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      paneRect = { left: rect.left, right: rect.right, width: rect.width }
      break
    }
    const offset = annotationRailRightForPane(paneRect, annotationViewport().width)
    const root = document.documentElement
    if (offset > 0) {
      if (annotationStyle(root).getPropertyValue('--psa-rail-right') !== `${offset}px`) annotationStyle(root).setProperty('--psa-rail-right', `${offset}px`)
      if (root.getAttribute('data-psa-rail-offset') !== 'true') root.setAttribute('data-psa-rail-offset', 'true')
    } else {
      if (annotationStyle(root).getPropertyValue('--psa-rail-right') !== '') annotationStyle(root).removeProperty('--psa-rail-right')
      if (root.hasAttribute('data-psa-rail-offset')) root.removeAttribute('data-psa-rail-offset')
    }
  }

  /** A3/T68: native right Sidebar pane changes need a rail re-dock without a resize. */
  let railDockObserver: AnnotationObserver | null = null

  /** @returns {void} */
  function ensureRailDockObserver() {
    if (railDockObserver !== null) return
    railDockObserver = new MutationObserver(() => { syncRailDock() })
    railDockObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-dockkit-pane-active', 'class', 'style']
    })
  }

  /** @returns {void} */
  function disconnectRailDockObserver() {
    if (railDockObserver === null) return
    railDockObserver.disconnect()
    railDockObserver = null
    annotationStyle(document.documentElement).removeProperty('--psa-rail-right')
    document.documentElement.removeAttribute('data-psa-rail-offset')
  }

  function capturePaintLayer() {
    const overlay = document.querySelector('[data-shell-overlay]')
    if (!(overlay instanceof HTMLElement)) return
    if (paintSnapshot !== null && paintSnapshot.element === overlay) {
      if (annotationStyle(overlay).getPropertyValue('z-index') !== String(ANNOTATION_PAINT_Z)) {
        annotationStyle(overlay).setProperty('z-index', String(ANNOTATION_PAINT_Z), 'important')
        document.documentElement.setAttribute(ANNOTATION_RAISED_ATTR, 'true')
      }
      return
    }
    if (paintSnapshot !== null) restorePaintLayer()
    paintSnapshot = {
      element: overlay,
      index: {
        value: annotationStyle(overlay).getPropertyValue('z-index'),
        priority: annotationStyle(overlay).getPropertyPriority('z-index')
      }
    }
    annotationStyle(overlay).setProperty('z-index', String(ANNOTATION_PAINT_Z), 'important')
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
    if (index.value === '' && index.priority === '') annotationStyle(element).removeProperty('z-index')
    else annotationStyle(element).setProperty('z-index', index.value, index.priority)
  }

  /**
   * Announce mode state for the dynamic-workspaces hover-card pinning (D3).
   * The dependent behavior is owned by that feature; this side only reports
   * state. Dispatched on `document` with bubbling so both document- and
   * window-level listeners observe it.
   * @param {boolean} active - whether annotation mode just turned on/off.
   * @returns {void}
   */
  function announceAnnotationState(active: boolean): void {
    try {
      const eventHost = globalThis as unknown as {
        CustomEvent?: new (type: string, init?: Record<string, unknown>) => unknown
      }
      const dispatchHost = document as unknown as { dispatchEvent?: (event: unknown) => boolean }
      if (typeof dispatchHost.dispatchEvent !== 'function') return
      if (typeof eventHost.CustomEvent !== 'function') return
      dispatchHost.dispatchEvent(new eventHost.CustomEvent(ANNOTATION_STATE_EVENT, {
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
  function sessionIdentity(sessionId: string | null) {
    const id = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
    if (id === null) return { sessionId: null, cwd: null, workspaceLabel: null }
    // Primary source: the Composer seat's Session-scope bridge. The annotation
    // overlay is not a slot and `ctx.sessions` has no live list face here, so
    // reading the bridge is the only reliable path (F-2).
    if (bridge.sessionId === id && typeof bridge.sessionCwd === 'string' && bridge.sessionCwd.length > 0) {
      return {
        sessionId: id,
        cwd: bridge.sessionCwd,
        workspaceLabel: annotationWorkspaceLabel(bridge.sessionCwd)
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
      const snapshotView = listSnapshot !== null && listSnapshot !== undefined && typeof listSnapshot === 'object'
        ? listSnapshot as { byId?: unknown }
        : null
      const byId = snapshotView !== null && snapshotView.byId !== null && typeof snapshotView.byId === 'object'
        ? snapshotView.byId as Record<string, unknown>
        : null
      const entry = byId === null ? null : byId[id]
      if (entry !== null && entry !== undefined && typeof entry === 'object'
        && typeof (entry as { cwd?: unknown }).cwd === 'string'
        && ((entry as { cwd: string }).cwd).length > 0) cwd = (entry as { cwd: string }).cwd
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
      const location = (window as unknown as { location?: { pathname?: unknown } }).location
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
   * A3/T32: copy the captured/generated XPath for one selection or record.
   * @param {string} [refId] - record id (defaults to the current selection).
   * @returns {Promise<boolean>} whether the copy succeeded.
   */
  async function copyXPath(refId?: string): Promise<boolean> {
    return copyAnchorText(refId, 'xpath')
  }

  /**
   * A3/T32: copy the DevTools-style JS path for one selection or record.
   * @param {string} [refId] - record id (defaults to the current selection).
   * @returns {Promise<boolean>} whether the copy succeeded.
   */
  async function copyJsPath(refId?: string): Promise<boolean> {
    return copyAnchorText(refId, 'jsPath')
  }

  /**
   * A3/T34 (P2): copy the FULL (non-short-circuited) XPath for one record.
   * Full XPath requires a live node; without one the action reports honestly
   * instead of fabricating a path.
   * @param {string} [refId] - record id (defaults to the current selection).
   * @returns {Promise<boolean>} whether the copy succeeded.
   */
  async function copyFullXPath(refId?: string): Promise<boolean> {
    return copyAnchorText(refId, 'xpath', { full: true })
  }

  /**
   * A3/T32: shared clipboard path for the XPath/JS-path actions.
   * @param {string | undefined} refId - record id or undefined for the selection.
   * @param {'xpath' | 'jsPath'} kind - which anchor to copy.
   * @param {{ full?: boolean }} [options] - `full` requests the full XPath.
   * @returns {Promise<boolean>} whether the copy succeeded.
   */
  async function copyAnchorText(refId: string | undefined, kind: string, options?: { full?: boolean }): Promise<boolean> {
    const current = snapshot()
    const state = current.state
    const detailId = current.detailCard === null ? null : current.detailCard.refId
    const ref = typeof refId === 'string' && refId.length > 0
      ? state.collection.find((entry) => entry !== null && typeof entry === 'object' && entry.id === refId)
      : (state.selection[0] ?? (detailId === null ? undefined : state.collection.find((entry) => entry !== null && typeof entry === 'object' && entry.id === detailId)))
    const opts = options !== null && typeof options === 'object' ? options : {}
    const full = opts.full === true
    const failKey = full ? 'feedback.copyFullXPathFailed' : (kind === 'xpath' ? 'feedback.copyXPathFailed' : 'feedback.copyJsPathFailed')
    if (ref === undefined || ref === null) {
      feedback(t(failKey), 'error')
      return false
    }
    const locator = annotationLocatorOf(ref)
    const node = liveNode(ref)
    let liveText = ''
    // A3/T34/T36 (P2): live node first (fresh optimized/full XPath + JS path);
    // the saved anchor is only the fallback and says so honestly.
    if (node !== null) {
      if (full) liveText = annotationFullXPathOf(node)
      else if (kind === 'xpath') liveText = annotationXPathOf(node)
      else liveText = annotationJsPathFor({ selector: typeof locator.uniqueSelector === 'string' ? locator.uniqueSelector : (typeof locator.path === 'string' ? locator.path : null), xpath: annotationXPathOf(node) })
    }
    const storedText = full ? '' : (kind === 'xpath' ? (typeof locator.xpath === 'string' ? locator.xpath : '') : (typeof locator.jsPath === 'string' ? locator.jsPath : ''))
    const decision = annotationCopyAnchorDecision({ liveText, storedText, full })
    const text = decision.text
    const source = decision.source
    if (typeof text !== 'string' || text.length === 0) {
      feedback(t(failKey), 'error')
      return false
    }
    let clipboard = null
    try {
      clipboard = typeof navigator !== 'undefined' && navigator !== null
        ? (navigator as unknown as { clipboard?: { writeText?: (text: string) => Promise<void> } }).clipboard ?? null
        : null
    } catch {
      clipboard = null
    }
    if (clipboard === null || clipboard === undefined || typeof clipboard.writeText !== 'function') {
      feedback(t(failKey), 'error')
      return false
    }
    try {
      await clipboard.writeText(text)
      if (full) feedback(t('feedback.copyFullXPathSuccess'))
      else if (source === 'saved') feedback(t(kind === 'xpath' ? 'feedback.copyXPathSaved' : 'feedback.copyJsPathSaved'))
      else feedback(t(kind === 'xpath' ? 'feedback.copyXPathSuccess' : 'feedback.copyJsPathSuccess'))
      return true
    } catch {
      feedback(t(failKey), 'error')
      return false
    }
  }

  /**
   * Copy the best locator of one record ("Copy locator", D10) and report the
   * outcome through the feedback toast. Uses the verified unique selector when
   * present, else the best ordered candidate.
   * @param {string} [refId] - collection entry id; omitted means the current selection.
   * @returns {boolean} whether a copy was attempted synchronously.
   */
  function copyLocator(refId?: string): boolean {
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
      clipboard = typeof navigator !== 'undefined' && navigator !== null
        ? (navigator as unknown as { clipboard?: { writeText?: (text: string) => Promise<void> } }).clipboard ?? null
        : null
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
    domObserver = new MutationObserver((mutations) => {
      // A3/T38 (④): own overlay/mark renders must not invalidate page-resolution
      // caches; only host-page mutations bump the DOM revision.
      let ownOnly = true
      for (const record of Array.isArray(mutations) ? mutations : []) {
        let node = (record as { target?: unknown }).target as AnnotationMutationTarget | null | undefined
        if (node !== null && node !== undefined && node.nodeType !== 1) node = node.parentElement
        if (node === null || node === undefined || typeof node.closest !== 'function') {
          ownOnly = false
          break
        }
        const isPageRoot = node === document.body || node === document.documentElement
        if (isPageRoot) {
          ownOnly = false
          break
        }
        // Own UI nodes, or the overlay-slot host container that React updates
        // when it inserts/replaces our overlay root, are not page mutations.
        if (node.closest('[data-psa-own]') !== null) continue
        if (typeof node.querySelector === 'function' && node.querySelector('[data-psa-own]') !== null) continue
        ownOnly = false
        break
      }
      if (ownOnly) return
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
    fallbackStatusCache.clear()
    fallbackNodeCache.clear()
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
  function liveNode(ref: unknown): Element | null {
    ensureDomObserver()
    const record = annotationRecordOf(ref)
    const id = typeof record.id === 'string' ? record.id : ''
    if (id.length === 0) return null
    const cached = resolvedNodeCache.get(id)
    if (cached !== undefined) {
      if (cached.rev === domRevision) {
        // A null entry is a real "ambiguous/unresolvable at this revision" result;
        // reusing it keeps scroll frames from re-scanning the same ref.
        if (cached.node === null) return null
        if (cached.node.isConnected !== false) return cached.node
      }
      resolvedNodeCache.delete(id)
    }
    const cssNode = annotationResolveNode(ref)
    // A3/T34: when CSS candidates fail, fall back to text quote/position/XPath
    // so page marks/geometry can still draw fallback-resolved records.
    const node = cssNode === null ? fallbackNodeFor(ref) : cssNode
    resolvedNodeCache.set(id, { node, rev: domRevision })
    return node
  }

  /**
   * Re-resolve one ref's status against the live document.
   * @param {object} ref - ElementRef.
   * @returns {'resolved' | 'ambiguous' | 'missing' | 'changed'} status.
   */
  /** A3/T30: the floating surface pinned open while a floating selection is edited. */
  let pinnedSurfaceElement: Element | null = null
  /** Capture-phase listeners installed by the active surface pin. */
  let pinnedSurfaceListeners: AnnotationPageListener[] = []

  /**
   * The surface root for the current pick: pickLevels cuts a floating hit's
   * chain at the surface root, so the last chain entry is that root.
   * @returns {Element | null} surface root element, or null.
   */
  function pinnedSurfaceCandidate() {
    const state = snapshot()
    if (!annotationSurfacePinEligible(state.state, isActive())) return null
    const pick = lastPick
    if (pick === null || pick.surface !== 'floating') return null
    const entries = Array.isArray(pick.entries) ? pick.entries : []
    if (entries.length === 0) return null
    const root = entries[entries.length - 1] !== null && typeof entries[entries.length - 1] === 'object'
      ? entries[entries.length - 1].element
      : null
    if (root === null || root === undefined || root.isConnected === false) return null
    return root
  }

  /** Detach the capture-phase hover-close suppression listeners. @returns {void} */
  function detachSurfacePinListeners() {
    for (const entry of pinnedSurfaceListeners) window.removeEventListener(entry.type, entry.handler, entry.options)
    pinnedSurfaceListeners = []
  }

  /**
   * Release the pinned surface; optionally emit a synthetic leave so a native
   * hover menu closes naturally once the pin is gone.
   * @param {boolean} [emitLeave] - dispatch mouseout/pointerout on the root.
   * @returns {void}
   */
  function releaseSurfacePin(emitLeave?: boolean): void {
    const root = pinnedSurfaceElement
    pinnedSurfaceElement = null
    detachSurfacePinListeners()
    if (emitLeave !== true || root === null || root === undefined || root.isConnected === false) return
    // If the pointer is still physically over the surface, let the real pointer
    // leave close it later; a synthetic leave here would confuse native hover
    // cards that are still hovered (and can make a reopened card unreachable).
    try {
      const rootView = root as unknown as { matches?: (selector: string) => boolean }
      if (typeof rootView.matches === 'function' && rootView.matches(':hover')) return
    } catch {
      // A throwing matches() keeps the synthetic-close path.
    }
    try {
      const eventHost = globalThis as unknown as {
        MouseEvent?: new (type: string, init?: Record<string, unknown>) => unknown
        PointerEvent?: new (type: string, init?: Record<string, unknown>) => unknown
      }
      const dispatchHost = root as unknown as { dispatchEvent?: (event: unknown) => boolean }
      if (typeof dispatchHost.dispatchEvent !== 'function') return
      if (typeof eventHost.MouseEvent === 'function') {
        dispatchHost.dispatchEvent(new eventHost.MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: document.body }))
        dispatchHost.dispatchEvent(new eventHost.MouseEvent('mouseleave', { bubbles: false, cancelable: false, relatedTarget: document.body }))
      }
      if (typeof eventHost.PointerEvent === 'function') {
        dispatchHost.dispatchEvent(new eventHost.PointerEvent('pointerout', { bubbles: true, cancelable: true, relatedTarget: document.body, pointerType: 'mouse' }))
        dispatchHost.dispatchEvent(new eventHost.PointerEvent('pointerleave', { bubbles: false, cancelable: false, relatedTarget: document.body, pointerType: 'mouse' }))
      }
    } catch {
      // Synthetic leave is best effort; releasing the pin is the guarantee.
    }
  }

  /**
   * Keep the current floating surface open while its annotation popover is
   * active. Capture-phase suppression of mouse/pointer leave events scoped to
   * the pinned subtree/ancestors stops React hover menus from closing as the
   * pointer moves into our requirement textarea.
   * @returns {void}
   */
  function syncSurfacePin() {
    const root = pinnedSurfaceCandidate()
    if (root === null) {
      // Selection/popover closed: unpin and let the native hover surface close.
      if (pinnedSurfaceElement !== null) releaseSurfacePin(true)
      return
    }
    if (pinnedSurfaceElement === root) return
    if (pinnedSurfaceElement !== null) releaseSurfacePin(false)
    pinnedSurfaceElement = root
    const handler = (event: unknown): void => {
      if (pinnedSurfaceElement === null) return
      const view = event as unknown as {
        target?: unknown
        relatedTarget?: unknown
        stopImmediatePropagation?: () => void
        stopPropagation?: () => void
      }
      const target = view.target !== null && view.target instanceof Element ? view.target : null
      const related = view.relatedTarget !== null && view.relatedTarget instanceof Element ? view.relatedTarget : null
      if (!annotationSurfacePinEventMatches(pinnedSurfaceElement, target, related)) return
      // Swallow the close trigger before React/document handlers see it.
      if (typeof view.stopImmediatePropagation === 'function') view.stopImmediatePropagation()
      if (typeof view.stopPropagation === 'function') view.stopPropagation()
    }
    for (const type of ['mouseout', 'mouseleave', 'pointerout', 'pointerleave']) {
      window.addEventListener(type, handler, { capture: true, passive: true })
      pinnedSurfaceListeners.push({ type, handler, options: { capture: true, passive: true } })
    }
  }

  /** A3/T34: per-(record, DOM revision) fallback status cache; avoids re-scanning on every geometry render. */
  const fallbackStatusCache = new Map<string, AnnotationStatusDetail>()
  const fallbackNodeCache = new Map<string, Element | null>()
  /** A3/T38 (④): fallback DOM-scan counter exposed on the root for the E2E probe. */
  let fallbackScanCount = 0
  /** A3/T38 (④): cache-miss resolution count (independent of fallback scan count). */
  let statusResolveCount = 0

  /** Count one fallback DOM scan (querySelectorAll/evaluate/getElementsByTagName etc). @returns {void} */
  function noteFallbackScan() {
    fallbackScanCount += 1
    try {
      document.documentElement.setAttribute('data-psa-fallback-scans', String(fallbackScanCount))
    } catch {
      // The counter is diagnostic only; rendering must not depend on it.
    }
  }

  /**
   * A3/T38 (③): climb a descendant-anchor text hit back to the recorded ancestor.
   * @param {object} ref - captured record.
   * @param {Element} leaf - matched text leaf.
   * @returns {{ target: Element | null, ambiguous?: boolean }} climb result.
   */
  function climbDescendantTarget(ref: unknown, leaf: Element): { target: Element | null, ambiguous?: boolean } {
    if (annotationLocatorOf(ref).anchorTarget !== 'descendant') return { target: leaf }
    const matches: Element[] = []
    let current: Element | null = leaf !== null && leaf !== undefined ? leaf.parentElement : null
    let depth = 0
    while (current !== null && current !== undefined && current !== document.body && depth < 16) {
      const attrs: Record<string, string> = {}
      try {
        const attributes = (current as unknown as { attributes?: ArrayLike<{ name?: unknown, value?: unknown }> }).attributes
        for (const attr of Array.from(attributes ?? [])) {
          if (typeof attr.name === 'string' && typeof attr.value === 'string') attrs[attr.name] = attr.value
        }
      } catch {
        // Attribute reads are best effort.
      }
      const tag = annotationTagOf(current)
      if (annotationDescendantAncestorMatches(ref, { tag, attrs })) matches.push(current)
      current = current.parentElement
      depth += 1
    }
    if (matches.length === 0) return { target: null }
    if (matches.length > 1) return { target: null, ambiguous: true }
    return { target: matches[0] }
  }

  /**
   * A3/T38 (③): climb + validate a descendant text hit.
   * @param {object} ref - captured record.
   * @param {Element} leaf - matched leaf.
   * @returns {{ status: string, element: Element | null } | null} outcome.
   */
  function resolveDescendantClimb(ref: unknown, leaf: Element): { status: string, element: Element | null } | null {
    const climbed = climbDescendantTarget(ref, leaf)
    if (climbed.ambiguous === true) return { status: 'ambiguous', element: null }
    if (climbed.target === null) return null
    const status = validateFallbackHit(climbed.target, ref, { proximity: true })
    if (status === 'resolved' || status === 'changed') return { status, element: climbed.target }
    return null
  }

  /**
   * A3/T34: resolve one rendered text offset back to the element containing it.
   * @param {Element} container - scope container.
   * @param {number} offset - rendered text offset.
   * @returns {Element | null} containing element.
   */
  function annotationElementAtRenderedOffset(container: Element, offset: number): Element | null {
    if (container === null || typeof container !== 'object' || typeof document === 'undefined') return null
    try {
      const rendered = annotationRenderedTextOf(container, 1200)
      let rawStart = 0
      for (const span of rendered.spans) {
        if (offset < span.start || offset >= span.end) continue
        const jump = offset - span.start
        const walkerHost = document as unknown as {
          createTreeWalker?: (root: unknown, whatToShow: number) => { nextNode(): AnnotationTextNode | null }
        }
        if (typeof walkerHost.createTreeWalker !== 'function') return null
        const walker = walkerHost.createTreeWalker(container, ANNOTATION_SHOW_TEXT)
        let node: AnnotationTextNode | null = walker.nextNode()
        rawStart = 0
        while (node !== null) {
          const value = node.nodeValue ?? ''
          if (rawStart <= span.rawStart && span.rawStart < rawStart + value.length) {
            const targetRaw = rawStart + jump
            let consumed = 0
            let current: AnnotationTextNode | null = node
            while (current !== null && consumed + (current.nodeValue ?? '').length <= targetRaw) {
              consumed += (current.nodeValue ?? '').length
              current = current.nextSibling ?? null
              while (current !== null && current.nodeType !== ANNOTATION_TEXT_NODE) current = current.nextSibling ?? null
            }
            return (current ?? node).parentElement ?? container
          }
          rawStart += value.length
          node = walker.nextNode()
        }
      }
    } catch {
      return null
    }
    return null
  }

  /**
   * A3/T49: whether a captured transient/floating surface is still present.
   * Uses the captured container, the verified selector, and captured stable
   * ancestors (the floating surface root is typically a stable ancestor).
   * @param {object} ref - captured record.
   * @returns {boolean} whether the captured surface still exists/visible.
   */
  function capturedSurfacePresent(ref: unknown): boolean {
    const record = annotationRecordOf(ref)
    const locator = annotationLocatorOf(ref)
    if (locator.ephemeral !== true && locator.surface !== 'floating') return true
    // A3/T49: the captured container is the authoritative surface anchor. If it
    // no longer resolves, the captured transient surface is gone.
    const position = locator.textPosition !== null && typeof locator.textPosition === 'object'
      ? locator.textPosition as { container?: unknown }
      : null
    if (position === null || typeof position.container !== 'string' || position.container.length === 0) return false
    try {
      const container = document.querySelector(position.container)
      if (container === null || container.isConnected === false || !annotationElementVisible(container)) return false
      // The captured surface must still sit in its captured screen area; a
      // look-alike elsewhere in the document is not the same transient surface.
      const bounds = record.bounds !== null && typeof record.bounds === 'object'
        ? record.bounds as { x?: unknown, y?: unknown, width?: unknown, height?: unknown }
        : null
      if (bounds !== null && typeof bounds.x === 'number' && typeof bounds.width === 'number') {
        const rect = container.getBoundingClientRect()
        const limit = Math.max(240, Math.max(bounds.width, typeof bounds.height === 'number' ? bounds.height : 0) * 3)
        if (Math.abs(rect.left + rect.width / 2 - (bounds.x + bounds.width / 2)) > limit) return false
        const boundsY = bounds.y as number
        if (Math.abs(rect.top + rect.height / 2 - (boundsY + (typeof bounds.height === 'number' ? bounds.height / 2 : 0))) > limit) return false
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * A3/T47 (R1-i): strong identity must still resolve to a real element. A stale
   * `uniqueVerified` selector (0 hits / disconnected) does not count as strong.
   * @param {object} ref - captured record.
   * @returns {boolean} whether the record still has strong, live identity.
   */
  function identityStillStrong(ref: unknown): boolean {
    if (annotationHasStrongIdentity(ref) !== true) return false
    const record = annotationRecordOf(ref)
    const locator = annotationLocatorOf(ref)
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    const digest = typeof record.textDigest === 'string' ? record.textDigest : ''
    const textStrong = text.length > 0 && digest.length > 0 && digest !== ANNOTATION_EMPTY_TEXT_DIGEST
    const tag = typeof locator.tag === 'string' ? locator.tag.toLowerCase() : ''
    const role = typeof locator.role === 'string' ? locator.role.toLowerCase() : ''
    const name = typeof locator.name === 'string' ? locator.name.trim().toLowerCase() : ''
    const nameStrong = name.length > 0 && name !== tag && name !== role
    if (textStrong || nameStrong) return true
    // Identity relies on the verified unique selector: it must still resolve.
    const selector = typeof locator.uniqueSelector === 'string' ? locator.uniqueSelector : ''
    if (selector.length === 0) return false
    try {
      const hits = document.querySelectorAll(selector)
      return hits.length === 1 && hits[0] !== null && hits[0].isConnected !== false && annotationElementVisible(hits[0])
    } catch {
      return false
    }
  }

  /**
   * A3/T47 (R1-iii): captured-ancestor corroboration for weak/generic CSS hits.
   * @param {object} ref - captured record.
   * @param {Element} element - candidate element.
   * @returns {boolean} whether a recorded stable ancestor is present on the candidate.
   */
  function ancestorCorroborates(ref: unknown, element: Element): boolean {
    if (element === null || typeof element !== 'object') return false
    const ancestorsValue = annotationLocatorOf(ref).ancestors
    const ancestors: unknown[] = Array.isArray(ancestorsValue) ? ancestorsValue : []
    if (ancestors.length === 0) return false
    let current: Element | null = element.parentElement
    let depth = 0
    while (current !== null && current !== undefined && depth < 12) {
      const tag = annotationTagOf(current)
      for (const ancestorValue of ancestors) {
        if (ancestorValue === null || typeof ancestorValue !== 'object') continue
        const ancestor = ancestorValue as { tag?: unknown, attrs?: unknown }
        if (typeof ancestor.tag === 'string' && ancestor.tag.toLowerCase() !== tag) continue
        const attrs = ancestor.attrs !== null && typeof ancestor.attrs === 'object'
          ? ancestor.attrs as Record<string, unknown>
          : null
        if (attrs === null) continue
        let matched = 0
        let total = 0
        for (const [name, value] of Object.entries(attrs)) {
          total += 1
          if (typeof value !== 'string') continue
          if (current.getAttribute(name) === value) matched += 1
        }
        if (total > 0 && matched === total) return true
      }
      current = current.parentElement
      depth += 1
    }
    return false
  }

  /**
   * A3/T47 (R1-ii): Hypothesis-style maybeAssertQuote for structural CSS hits.
   * @param {object} ref - captured record.
   * @param {Element} element - candidate element.
   * @returns {boolean} whether the captured quote asserts on the candidate.
   */
  function quoteAssertsOnElement(ref: unknown, element: Element): boolean {
    const quoteValue = annotationLocatorOf(ref).textQuote
    if (quoteValue === null || typeof quoteValue !== 'object') return false
    const quote = quoteValue as { exact?: unknown }
    if (typeof quote.exact !== 'string') return false
    if (element === null || typeof element !== 'object') return false
    const candidates: string[] = []
    candidates.push(annotationRenderedTextOf(element, 300).text)
    if (element.parentElement !== null) candidates.push(annotationRenderedTextOf(element.parentElement, 400).text)
    for (const text of candidates) {
      // Reference maybeAssertQuote first requires the quote text itself on the
      // candidate; context is corroboration, not a precondition for a range hit.
      if (annotationNormalizeQuoteText(text, 0).includes(quote.exact)) return true
      const matches = annotationScoreQuoteMatches(text, quote, undefined, 1)
      if (matches.length > 0 && matches[0].score >= 0.85) return true
    }
    return false
  }

  /**
   * A3/T34 (W4/W6): validate one fallback hit with tag, digest, accessible name
   * and (optionally) viewport proximity. Never fabricates Resolved.
   * @param {Element} element - candidate.
   * @param {object} ref - captured record.
   * @param {{ proximity?: boolean }} [options] - proximity check for structural hits.
   * @returns {'resolved' | 'changed' | 'missing' | null} status, null = reject/continue.
   */
  function validateFallbackHit(element: Element | null | undefined, ref: unknown, options: Record<string, unknown> = {}): 'resolved' | 'changed' | 'missing' | null {
    if (element === null || element === undefined || element.isConnected === false) return 'missing'
    const record = annotationRecordOf(ref)
    const locator = annotationLocatorOf(ref)
    const expectedTag = typeof locator.tag === 'string' ? locator.tag.toLowerCase() : ''
    const liveTag = annotationTagOf(element)
    if (expectedTag.length > 0 && liveTag !== expectedTag) return 'changed'
    const expectedDigest = typeof record.textDigest === 'string' ? record.textDigest : ''
    if (expectedDigest.length > 0) {
      const actual = textDigest(typeof element.textContent === 'string' ? element.textContent : '')
      if (actual !== expectedDigest) return 'changed'
    }
    const expectedName = typeof locator.name === 'string' ? locator.name : ''
    const actualName = liveTag.length > 0 ? annotationAccessibleName(element, liveTag) : ''
    if (expectedName.length > 0 && actualName.length > 0 && expectedName !== actualName) return 'changed'
    if (options !== null && typeof options === 'object' && options.proximity === true) {
      try {
        const rect = element.getBoundingClientRect()
        const bounds = record.bounds !== null && typeof record.bounds === 'object'
          ? record.bounds as { x?: unknown, y?: unknown, width?: unknown, height?: unknown }
          : null
        const viewport = record.viewport !== null && typeof record.viewport === 'object'
          ? record.viewport as { width?: unknown, height?: unknown }
          : null
        if (rect !== null && bounds !== null && typeof bounds.x === 'number' && typeof bounds.y === 'number'
          && typeof bounds.width === 'number' && typeof bounds.height === 'number' && viewport !== null) {
          const viewWidth = typeof viewport.width === 'number' ? viewport.width : 0
          const viewHeight = typeof viewport.height === 'number' ? viewport.height : 0
          const limit = Math.max(320, Math.max(viewWidth, viewHeight) * 0.7)
          const dx = (bounds.x + bounds.width / 2) - (rect.left + rect.width / 2)
          const dy = (bounds.y + bounds.height / 2) - (rect.top + rect.height / 2)
          if (Math.sqrt(dx * dx + dy * dy) > limit) return null
        }
      } catch {
        // Proximity is best effort; tag/name/digest checks still stand.
      }
    }
    // A3/T36 (MAJOR-1): structural hits require real identity; a tag-only match
    // can never be Resolved (it degrades honestly to Changed and is not marked).
    if (options !== null && typeof options === 'object' && options.structural === true) {
      // A3/T47 (R1): structural hit only resolves with live strong identity; a
      // weak/corroborated hit is honestly Changed; otherwise reject/continue.
      if (identityStillStrong(ref)) return 'resolved'
      return ancestorCorroborates(ref, element) ? 'changed' : null
    }
    return 'resolved'
  }

  /**
   * A3/T34: scope containers for text quote search — captured container first,
   * document body as the bounded fallback.
   * @param {object} ref - captured record.
   * @returns {Array<Element>} scopes.
   */
  function quoteSearchScopes(ref: unknown): Element[] {
    const scopes: Element[] = []
    const positionValue = annotationLocatorOf(ref).textPosition
    const position = positionValue !== null && typeof positionValue === 'object'
      ? positionValue as { container?: unknown }
      : null
    if (position !== null && typeof position.container === 'string') {
      try {
        const container = document.querySelector(position.container)
        if (container !== null) scopes.push(container)
      } catch {
        // Ignore malformed stored selectors; body scope still applies.
      }
    }
    if (scopes.length === 0 || scopes[0] !== document.body) scopes.push(document.body)
    return scopes
  }

  /**
   * A3/T34 (W2/W4): score-based quote resolution with bounded approximate
   * matching; returns null to continue the chain, or an honest status.
   * @param {object} ref - captured record.
   * @returns {string | null} status.
   */
  function resolveRefTextQuote(ref: unknown): string | { status: string, terminal: boolean } | null {
    noteFallbackScan()
    const locator = annotationLocatorOf(ref)
    const quoteValue = locator.textQuote
    if (quoteValue === null || typeof quoteValue !== 'object') return null
    const quote = quoteValue as { exact?: unknown }
    if (typeof quote.exact !== 'string' || quote.exact.length === 0) return null
    const textPosition = locator.textPosition !== null && typeof locator.textPosition === 'object'
      ? locator.textPosition as { start?: unknown, container?: unknown }
      : null
    const hint = textPosition !== null && typeof textPosition.start === 'number' ? textPosition.start : undefined
    if (locator.anchorTarget === 'descendant') {
      noteFallbackScan()
      const leafTag = typeof locator.anchorLeafTag === 'string' && locator.anchorLeafTag.length > 0
        ? locator.anchorLeafTag
        : (typeof locator.tag === 'string' ? locator.tag : '')
      /**
       * Collect valid climbed targets for one scope only (bounded).
       * @param {Element} scope - scope element.
       * @returns {{ targets: Array<object>, ambiguous: boolean }} valid targets + real ambiguity.
       */
      const collectScopeTargets = (scope: Element): { targets: Element[], ambiguous: boolean } => {
        const targets: Element[] = []
        let ambiguous = false
        const rendered = annotationRenderedTextOf(scope, 1400)
        const matches = annotationScoreQuoteMatches(rendered.text, quote, hint, 6)
        for (const match of matches) {
          if (match.score < 0.5) continue
          const leaf = annotationElementAtRenderedOffset(scope, match.index)
          if (leaf === null) continue
          const climb = resolveDescendantClimb(ref, leaf)
          if (climb === null) continue
          if (climb.status === 'ambiguous') { ambiguous = true; continue }
          if (climb.element === null) continue
          const status = validateFallbackHit(climb.element, ref, { proximity: true })
          if (status !== 'resolved' && status !== 'changed') continue
          if (!targets.includes(climb.element)) targets.push(climb.element)
        }
        return { targets, ambiguous }
      }
      // 1) Captured scope is authoritative when its selector still resolves.
      const containerSelector = textPosition !== null && typeof textPosition.container === 'string' ? textPosition.container : ''
      let container: Element | null = null
      if (containerSelector.length > 0) {
        try {
          container = document.querySelector(containerSelector)
        } catch {
          container = null
        }
      }
      if (container !== null) {
        const inScope = collectScopeTargets(container)
        const scoped = annotationScopeAuthorityOutcome({ inScope, fallback: { targets: [], ambiguous: false } })
        if (scoped.ambiguous) return { status: 'ambiguous', terminal: true }
        if (scoped.target !== null) {
          const status = validateFallbackHit(scoped.target as Element, ref, { proximity: true })
          if (status === 'resolved' || status === 'changed') return status
          // The in-scope hit failed validation: treat the scope as empty and use
          // the bounded document fallback (honest re-anchor).
        }
      }
      // 2) Bounded document fallback only when the scope is missing/broken/empty.
      const fallbackTargets: Element[] = []
      let fallbackAmbiguous = false
      const bodyRendered = annotationRenderedTextOf(document.body, 1400)
      const bodyMatches = annotationScoreQuoteMatches(bodyRendered.text, quote, hint, 6)
      for (const match of bodyMatches) {
        if (match.score < 0.5) continue
        const leaf = annotationElementAtRenderedOffset(document.body, match.index)
        if (leaf === null) continue
        const climb = resolveDescendantClimb(ref, leaf)
        if (climb === null) continue
        if (climb.status === 'ambiguous') { fallbackAmbiguous = true; continue }
        if (climb.element === null) continue
        const status = validateFallbackHit(climb.element, ref, { proximity: true })
        if (status !== 'resolved' && status !== 'changed') continue
        if (!fallbackTargets.includes(climb.element)) fallbackTargets.push(climb.element)
      }
      const elements = annotationElementsByTag(leafTag.length > 0 ? String(leafTag).toLowerCase() : '*')
      for (let index = 0; index < elements.length && index < ANNOTATION_FALLBACK_SCAN_MAX && fallbackTargets.length <= 32; index += 1) {
        const leaf = elements[index]
        if (leaf === null || typeof leaf !== 'object' || leaf.closest('[data-psa-own]') !== null) continue
        if (annotationRenderedTextOf(leaf, 120).text !== quote.exact) continue
        const climb = resolveDescendantClimb(ref, leaf)
        if (climb === null) continue
        if (climb.status === 'ambiguous') { fallbackAmbiguous = true; continue }
        if (climb.element === null) continue
        const status = validateFallbackHit(climb.element, ref, { proximity: true })
        if (status !== 'resolved' && status !== 'changed') continue
        if (!fallbackTargets.includes(climb.element)) fallbackTargets.push(climb.element)
      }
      const outcome = annotationScopeAuthorityOutcome({ inScope: { targets: [], ambiguous: false }, fallback: { targets: fallbackTargets, ambiguous: fallbackAmbiguous } })
      if (outcome.ambiguous) return { status: 'ambiguous', terminal: true }
      if (outcome.target !== null) {
        const status = validateFallbackHit(outcome.target as Element, ref, { proximity: true })
        if (status === 'resolved' || status === 'changed') return status
      }
      return null
    }
    for (const scope of quoteSearchScopes(ref)) {
      const rendered = annotationRenderedTextOf(scope, 1400)
      if (rendered.text.length === 0) continue
      const matches = annotationScoreQuoteMatches(rendered.text, quote, hint, 8)
      if (matches.length === 0) continue
      const best = matches[0]
      // Ties cannot identify one occurrence -> honest Matches several.
      if (matches.length > 1 && best.score - matches[1].score <= 0.02) return 'ambiguous'
      if (best.score < 0.5) continue
      if (best.score < 0.85) return 'changed'
      const element = annotationElementAtRenderedOffset(scope, best.index)
      if (element === null) continue
      if (locator.anchorTarget === 'descendant') {
        const climb = resolveDescendantClimb(ref, element)
        if (climb === null) continue
        if (climb.status === 'ambiguous') return 'ambiguous'
        return climb.status
      }
      const status = validateFallbackHit(element, ref, { proximity: false })
      if (status === 'resolved' || status === 'changed') return status
      continue
    }
    // Bounded per-element fallback: a scoped container selector may break while
    // the leaf text itself is unchanged (structure reorder). Compare each
    // candidate element's rendered text, count exact matches, and only resolve
    // when exactly one candidate carries the quote.
    const expectedTag = locator.anchorTarget === 'descendant' && typeof locator.anchorLeafTag === 'string' && locator.anchorLeafTag.length > 0
      ? locator.anchorLeafTag
      : (typeof locator.tag === 'string' && locator.tag.length > 0 ? locator.tag.toLowerCase() : '')
    const candidates: Element[] = []
    const elements = annotationElementsByTag(expectedTag.length > 0 ? expectedTag : '*')
    let scanned = 0
    for (let index = 0; index < elements.length && scanned < ANNOTATION_FALLBACK_SCAN_MAX && candidates.length <= 32; index += 1) {
      scanned += 1
      const element = elements[index]
      if (element === null || typeof element !== 'object') continue
      if (element.closest('[data-psa-own]') !== null) continue
      const elementText = annotationRenderedTextOf(element, 120).text
      if (elementText.length === 0) continue
      if (elementText === quote.exact) {
        // A3/T36: exact text alone is not identity for duplicate rows — score the
        // captured prefix/suffix against the parent's rendered text and only keep
        // the occurrence whose context matches.
        const parent = element.parentElement
        if (parent === null) continue
        const parentRendered = annotationRenderedTextOf(parent, 300)
        const contextMatches = annotationScoreQuoteMatches(parentRendered.text, quote, undefined, 1)
        if (contextMatches.length === 0 || contextMatches[0].score < 0.85) continue
        const mapped = annotationElementAtRenderedOffset(parent, contextMatches[0].index)
        if (mapped === null) continue
        if (mapped !== element && !element.contains(mapped) && !mapped.contains(element)) continue
        candidates.push(element)
        continue
      }
      const approximate = annotationScoreQuoteMatches(elementText, quote, undefined, 1)
      if (approximate.length > 0 && approximate[0].score >= 0.5) candidates.push(element)
    }
    if (candidates.length === 0) return null
    if (locator.anchorTarget === 'descendant') {
      const targets: Element[] = []
      let ambiguous = false
      for (const leaf of candidates) {
        const climb = resolveDescendantClimb(ref, leaf)
        if (climb === null) continue
        if (climb.status === 'ambiguous') ambiguous = true
        else if (climb.element !== null && !targets.includes(climb.element)) targets.push(climb.element)
      }
      if (ambiguous || targets.length > 1) return 'ambiguous'
      if (targets.length === 1) {
        const status = validateFallbackHit(targets[0], ref, { proximity: true })
        if (status === 'resolved' || status === 'changed') return status
      }
      return null
    }
    if (candidates.length > 1) return 'ambiguous'
    const status = validateFallbackHit(candidates[0], ref, { proximity: false })
    if (status === 'resolved' || status === 'changed') return status
    return null
  }

  /**
   * A3/T34 (W4/W6): text-position resolution using rendered offsets. Only a
   * unique container slice, validated for tag/name/digest/proximity, resolves.
   * @param {object} ref - captured record.
   * @returns {string | null} status.
   */
  function resolveRefTextPosition(ref: unknown): string | null {
    noteFallbackScan()
    const locator = annotationLocatorOf(ref)
    const positionValue = locator.textPosition
    if (positionValue === null || typeof positionValue !== 'object') return null
    const position = positionValue as { container: string, start: number, end: number }
    const quoteValue = locator.textQuote
    if (quoteValue === null || typeof quoteValue !== 'object') return null
    const quote = quoteValue as { exact: string }
    if (typeof quote.exact !== 'string') return null
    let container: Element | null = null
    try {
      container = document.querySelector(position.container)
    } catch {
      return null
    }
    if (container === null) return null
    const rendered = annotationRenderedTextOf(container, 1200)
    if (rendered.text.length === 0) return null
    const slice = rendered.text.slice(position.start, position.end)
    if (slice !== quote.exact) return 'changed'
    // A slice that occurs more than once cannot identify one occurrence.
    if (rendered.text.indexOf(quote.exact) !== position.start) return null
    const element = annotationElementAtRenderedOffset(container, position.start)
    if (element === null) return null
    if (locator.anchorTarget === 'descendant') {
      const climb = resolveDescendantClimb(ref, element)
      if (climb === null) return null
      if (climb.status === 'ambiguous') return 'ambiguous'
      if (climb.element === null) return null
      return validateFallbackHit(climb.element, ref, { proximity: true, structural: true })
    }
    return validateFallbackHit(element, ref, { proximity: true, structural: true })
  }

  /**
   * A3/T34 (W4): XPath is the LAST resort and must pass tag/digest/name +
   * proximity validation (structure-sensitive by nature).
   * @param {object} ref - captured record.
   * @returns {string | null} status or null to continue.
   */
  function resolveRefXPath(ref: unknown): string | null {
    noteFallbackScan()
    const xpathValue = annotationLocatorOf(ref).xpath
    const xpath = typeof xpathValue === 'string' ? xpathValue : ''
    if (xpath.length === 0) return null
    let snapshot: AnnotationXPathSnapshot | null = null
    try {
      const xpathHost = document as unknown as {
        evaluate?: (expression: string, context: unknown, resolver: unknown, type: number, result: unknown) => AnnotationXPathSnapshot
      }
      if (typeof xpathHost.evaluate !== 'function') return null
      snapshot = xpathHost.evaluate(xpath, document, null, ANNOTATION_XPATH_SNAPSHOT, null)
    } catch {
      return null
    }
    if (snapshot === null) return null
    const elements: Element[] = []
    for (let index = 0; index < snapshot.snapshotLength; index += 1) {
      const node = snapshot.snapshotItem(index)
      if (node !== null && typeof node === 'object' && typeof (node as { tagName?: unknown }).tagName === 'string') elements.push(node as Element)
    }
    if (elements.length > 1) return 'ambiguous'
    if (elements.length === 0) return null
    return validateFallbackHit(elements[0], ref, { proximity: true, structural: true })
  }

  /**
   * A3/T34: fallback-resolved live node for page marks (quote/position/XPath in
   * that order), cached per DOM revision.
   * @param {object} ref - captured record.
   * @returns {Element | null} node.
   */
  function fallbackNodeFor(ref: unknown): Element | null {
    const key = annotationFallbackCacheKey(annotationRecordOf(ref).id, domRevision)
    if (fallbackNodeCache.has(key)) return fallbackNodeCache.get(key) ?? null
    let found: Element | null = null
    try {
      found = resolveRefTextQuoteNode(ref) ?? resolveRefTextPositionNode(ref) ?? resolveRefXPathNode(ref)
    } catch {
      found = null
    }
    // A3/T36 (MINOR-4): same bound as the status cache; never grow per mutation.
    if (fallbackNodeCache.size > ANNOTATION_FALLBACK_SCAN_MAX) fallbackNodeCache.clear()
    fallbackNodeCache.set(key, found)
    return found
  }

  /** Resolve the quote's element for fallback marks. @param {object} ref - record. @returns {Element | null} node. */
  function resolveRefTextQuoteNode(ref: unknown): Element | null {
    noteFallbackScan()
    const locator = annotationLocatorOf(ref)
    const quoteValue = locator.textQuote
    if (quoteValue === null || typeof quoteValue !== 'object') return null
    const quote = quoteValue as { exact: string }
    if (typeof quote.exact !== 'string') return null
    // A3/T44: mirror the scope-authority decision for the fallback node: when the
    // captured container still resolves, only an in-scope unique target may be
    // used (an in-scope duplicate is terminal -> no live node for copy/marks).
    if (locator.anchorTarget === 'descendant') {
      const textPosition = locator.textPosition !== null && typeof locator.textPosition === 'object'
        ? locator.textPosition as { container?: unknown }
        : null
      const containerSelector = textPosition === null ? undefined : textPosition.container
      if (typeof containerSelector === 'string' && containerSelector.length > 0) {
        try {
          const container = document.querySelector(containerSelector)
          if (container !== null) {
            const rendered = annotationRenderedTextOf(container, 1400)
            const matches = annotationScoreQuoteMatches(rendered.text, quote, undefined, 6)
            const targets: Element[] = []
            let ambiguous = false
            for (const match of matches) {
              if (match.score < 0.5) continue
              const leaf = annotationElementAtRenderedOffset(container, match.index)
              if (leaf === null) continue
              const climb = resolveDescendantClimb(ref, leaf)
              if (climb === null) continue
              if (climb.status === 'ambiguous') { ambiguous = true; continue }
              if (climb.element === null) continue
              if (!targets.includes(climb.element)) targets.push(climb.element)
            }
            if (ambiguous || targets.length > 1) return null
            if (targets.length === 1) {
              return validateFallbackHit(targets[0], ref, { proximity: true }) === 'resolved' ? targets[0] : null
            }
          }
        } catch {
          // Fall through to the bounded document fallback.
        }
      }
    }
    for (const scope of quoteSearchScopes(ref)) {
      const rendered = annotationRenderedTextOf(scope, 1400)
      const matches = annotationScoreQuoteMatches(rendered.text, quote, undefined, 2)
      if (matches.length === 0 || matches[0].score < 0.85) continue
      const element = annotationElementAtRenderedOffset(scope, matches[0].index)
      if (element === null) continue
      if (locator.anchorTarget === 'descendant') {
        const climb = resolveDescendantClimb(ref, element)
        if (climb !== null && climb.status !== 'ambiguous' && climb.element !== null) return climb.element
        continue
      }
      if (validateFallbackHit(element, ref) === 'resolved') return element
    }
    const tag = locator.anchorTarget === 'descendant' && typeof locator.anchorLeafTag === 'string'
      ? locator.anchorLeafTag
      : (typeof locator.tag === 'string' ? locator.tag : '')
    const elements = annotationElementsByTag(tag.length > 0 ? String(tag).toLowerCase() : '*')
    for (let index = 0; index < elements.length && index < ANNOTATION_FALLBACK_SCAN_MAX; index += 1) {
      const element = elements[index]
      if (element === null || typeof element !== 'object' || element.closest('[data-psa-own]') !== null) continue
      if (annotationRenderedTextOf(element, 120).text !== quote.exact) continue
      const parent = element.parentElement
      if (parent === null) continue
      const parentRendered = annotationRenderedTextOf(parent, 300)
      const contextMatches = annotationScoreQuoteMatches(parentRendered.text, quote, undefined, 1)
      if (contextMatches.length === 0 || contextMatches[0].score < 0.85) continue
      const mapped = annotationElementAtRenderedOffset(parent, contextMatches[0].index)
      if (mapped !== element && (mapped === null || (!element.contains(mapped) && !mapped.contains(element)))) continue
      if (locator.anchorTarget === 'descendant') {
        const climb = resolveDescendantClimb(ref, element)
        if (climb !== null && climb.status !== 'ambiguous' && climb.element !== null) return climb.element
        continue
      }
      if (validateFallbackHit(element, ref) === 'resolved') return element
    }
    return null
  }

  /** Resolve the text-position element for fallback marks. @param {object} ref - record. @returns {Element | null} node. */
  function resolveRefTextPositionNode(ref: unknown): Element | null {
    noteFallbackScan()
    const locator = annotationLocatorOf(ref)
    const positionValue = locator.textPosition
    const quoteValue = locator.textQuote
    if (positionValue === null || typeof positionValue !== 'object') return null
    if (quoteValue === null || typeof quoteValue !== 'object') return null
    const position = positionValue as { container: string, start: number, end: number }
    const quote = quoteValue as { exact: string }
    if (typeof quote.exact !== 'string') return null
    try {
      const container = document.querySelector(position.container)
      if (container === null) return null
      const rendered = annotationRenderedTextOf(container, 1200)
      if (rendered.text.slice(position.start, position.end) !== quote.exact) return null
      const element = annotationElementAtRenderedOffset(container, position.start)
      if (element === null) return null
      if (locator.anchorTarget === 'descendant') {
        const climb = resolveDescendantClimb(ref, element)
        if (climb === null || climb.status === 'ambiguous' || climb.element === null) return null
        return validateFallbackHit(climb.element, ref, { proximity: true, structural: true }) === 'resolved' ? climb.element : null
      }
      return validateFallbackHit(element, ref, { structural: true }) === 'resolved' ? element : null
    } catch {
      return null
    }
  }

  /** Resolve the XPath element for fallback marks. @param {object} ref - record. @returns {Element | null} node. */
  function resolveRefXPathNode(ref: unknown): Element | null {
    noteFallbackScan()
    const xpathValue = annotationLocatorOf(ref).xpath
    const xpath = typeof xpathValue === 'string' ? xpathValue : ''
    if (xpath.length === 0) return null
    try {
      const xpathHost = document as unknown as {
        evaluate?: (expression: string, context: unknown, resolver: unknown, type: number, result: unknown) => AnnotationXPathSnapshot
      }
      if (typeof xpathHost.evaluate !== 'function') return null
      const snapshot = xpathHost.evaluate(xpath, document, null, ANNOTATION_XPATH_FIRST, null)
      const node = snapshot.singleNodeValue
      return validateFallbackHit(node as Element, ref, { proximity: true, structural: true }) === 'resolved' ? node as Element : null
    } catch {
      return null
    }
  }

  /**
   * A3/T32/T34: resolution outcome with the winning strategy for the UI, cached
   * per (record id, DOM revision).
   * @param {object} ref - captured record.
   * @returns {{ status: string, via: string }} outcome.
   */
  function statusDetailOf(ref: unknown): AnnotationStatusDetail {
    if (ref === null || typeof ref !== 'object') return { status: 'missing', via: 'css' }
    const record = annotationRecordOf(ref)
    if (record.locator === null || typeof record.locator !== 'object') return { status: 'missing', via: 'css' }
    const locator = annotationLocatorOf(ref)
    // Status cache correctness depends on the DOM revision observer being live.
    ensureDomObserver()
    const cacheKey = annotationFallbackCacheKey(record.id, domRevision)
    const cached = fallbackStatusCache.get(cacheKey)
    if (cached !== undefined) return cached
    statusResolveCount += 1
    const weakIdentity = identityStillStrong(ref) !== true
    const quoteValue = locator.textQuote
    const hasQuote = quoteValue !== null && typeof quoteValue === 'object'
      && typeof (quoteValue as { exact?: unknown }).exact === 'string'
      && ((quoteValue as { exact: string }).exact).length > 0
    let outcome: AnnotationResolutionOutcome = annotationResolveStatus({
      weakIdentity,
      assertQuote: hasQuote ? (element: Element) => quoteAssertsOnElement(ref, element) : undefined,
      // A3/T47: corroboration must also require the candidate to be visible — a
      // hidden/cloned same-tag node is not the unmounted original.
      corroborate: (element: Element) => ancestorCorroborates(ref, element) && annotationElementVisible(element),
      candidates: locator.candidates,
      expectedTag: locator.tag,
      uniqueSelector: typeof locator.uniqueSelector === 'string' ? locator.uniqueSelector : '',
      queryAll: (selector: string) => document.querySelectorAll(selector),
      liveInfo: (element: Element) => {
        const elementText = typeof element.textContent === 'string' ? element.textContent : ''
        const liveTag = annotationTagOf(element)
        return {
          isConnected: element.isConnected,
          textContent: elementText,
          expectedText: typeof record.text === 'string' ? record.text : '',
          expectedDigest: typeof record.textDigest === 'string' ? record.textDigest : '',
          actualDigest: textDigest(elementText),
          expectedName: typeof locator.name === 'string' ? locator.name : '',
          actualName: liveTag.length > 0 ? annotationAccessibleName(element, liveTag) : ''
        }
      },
      resolveTextQuote: () => resolveRefTextQuote(ref),
      resolveTextPosition: () => resolveRefTextPosition(ref),
      resolveXPath: () => resolveRefXPath(ref)
    })
    // A3/T38 (③): descendant anchors trust the text layer over a CSS "changed"
    // hit on a look-alike; resolved/ambiguous from the descendant decides.
    if (locator.anchorTarget === 'descendant' && outcome.status === 'changed') {
      const quoteStatus = resolveRefTextQuote(ref)
      if (quoteStatus === 'resolved') outcome = { status: 'resolved', via: 'text-quote' }
      else if (quoteStatus === 'ambiguous') outcome = { status: 'ambiguous', via: 'text-quote' }
    }
    // A3/T47 (R1): no real identity signal (no text, no usable name, no live
    // verified selector) and no quote means the target cannot be verified at all;
    // reference behavior is Missing, never a same-tag promotion.
    if (weakIdentity && hasQuote !== true) outcome = { status: 'missing', via: outcome.via }
    // A3/T47 (R2): transient surfaces only keep honest text-layer outcomes while
    // their captured surface still exists.
    outcome = annotationEphemeralOutcome(ref, outcome, capturedSurfacePresent(ref))
    // A3/T49: conservative controller policy — a transient surface can never be
    // confidently "Changed" (surface presence detection is heuristic); the pure
    // helper still models the still-present Changed branch for callers/tests.
    if ((locator.ephemeral === true || locator.surface === 'floating') && outcome.status === 'changed') {
      outcome = { status: 'missing', via: outcome.via }
    }
    let confidence = annotationStatusConfidence(ref, outcome)
    if (weakIdentity && outcome.status === 'changed' && (outcome.via === 'xpath' || outcome.via === 'text-position')) confidence = 'weak'
    const detail: AnnotationStatusDetail = { ...outcome, confidence: confidence as 'strong' | 'weak' }
    if (fallbackStatusCache.size > 400) fallbackStatusCache.clear()
    fallbackStatusCache.set(cacheKey, detail)
    return detail
  }

  /**
   * A3/T38 (④): deterministic test hook — resolve the first current record
   * twice and report scan-counter deltas (first may scan, second must be 0).
   * @returns {object} probe result.
   */
  function debugFallbackScanProbe() {
    const state = snapshot().state
    const ref = state.collection.find((entry) => entry !== null && typeof entry === 'object' && !annotationIsGroup(entry)
      && annotationSessionIdOf(entry) === currentSessionId())
    if (ref === undefined) return { ok: false, reason: 'no current record' }
    const before = fallbackScanCount
    const resolvesBefore = statusResolveCount
    statusDetailOf(ref)
    const afterFirst = fallbackScanCount
    const resolvesFirst = statusResolveCount
    const second = statusDetailOf(ref)
    const afterSecond = fallbackScanCount
    const resolvesSecond = statusResolveCount
    return {
      ok: true,
      id: typeof ref.id === 'string' ? ref.id : undefined,
      before,
      firstDelta: afterFirst - before,
      secondDelta: afterSecond - afterFirst,
      resolutionFirstDelta: resolvesFirst - resolvesBefore,
      resolutionSecondDelta: resolvesSecond - resolvesFirst,
      status: second.status,
      confidence: second.confidence ?? 'strong'
    }
  }

  /** Compat status accessor: the four statuses keep their meaning.      /** Compat status accessor: the four statuses keep their meaning. @param {object} ref - record. @returns {string} status. */
  function statusOf(ref: unknown): string {
    return statusDetailOf(ref).status
  }

  /**
   * The Session the bridge is currently attached to, or null when no composer is
   * mounted (start page, Plugins view, or a seat that has not mounted yet).
   * @returns {string | null} current Session identity.
   */
  function currentSessionId() {
    const sessionId = bridge.sessionId ?? snapshot().state.sessionId
    return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
  }

  /**
   * Whether one ref is already in the collection for its own Session.
   * @param {object} ref - ElementRef.
   * @returns {boolean} whether present.
   */
  function isInCollection(ref: unknown): boolean {
    const key = identityKeyOf(ref)
    const sessionId = annotationSessionIdOf(ref)
    return snapshot().state.collection.some((entry) => !annotationIsGroup(entry)
      && identityKeyOf(entry) === key && annotationSessionIdOf(entry) === sessionId)
  }

  /**
   * Current Session scope of one collection entry.
   * @param {object} ref - ElementRef.
   * @returns {'current' | 'other'} scope.
   */
  function collectionScopeOf(ref: unknown): 'current' | 'other' {
    const current = currentSessionId()
    if (current === null) return 'other'
    return annotationSessionIdOf(ref) === current ? 'current' : 'other'
  }

  /**
   * Whether one viewport point falls inside one rectangle.
   * @param {{ x: number, y: number }} point - viewport point.
   * @param {{ x: number, y: number, width: number, height: number }} rect - rectangle.
   * @returns {boolean} whether inside.
   */
  function annotationPointInRect(point: { x: number, y: number }, rect: { x: number, y: number, width: number, height: number } | null): boolean {
    if (rect === null || typeof rect !== 'object') return false
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
  function markRectsOf(state: unknown): AnnotationMarkDescriptor[] {
    const marks: AnnotationMarkDescriptor[] = []
    const collectionValue = state !== null && typeof state === 'object' ? (state as { collection?: unknown }).collection : null
    const collection: AnnotationCollectionEntry[] = Array.isArray(collectionValue) ? collectionValue as AnnotationCollectionEntry[] : []
    // A3/T29: page-mark badges use one ordinal per entry; every item of a group
    // shows the group's single number (#7, #7, …), and the next entry is #8.
    const ordinals = annotationEntryOrdinals(collection)
    const flattened: Array<{ record: AnnotationCollectionEntry, ordinal: number }> = []
    for (let index = 0; index < collection.length; index += 1) {
      const entry = collection[index]
      if (entry === null || typeof entry !== 'object') continue
      if (annotationIsGroup(entry)) {
        const requirement = typeof entry.requirement === 'string' ? entry.requirement : ''
        for (const item of annotationGroupItems(entry)) flattened.push({ record: { ...item, note: requirement }, ordinal: ordinals[index] })
      } else {
        flattened.push({ record: entry, ordinal: ordinals[index] })
      }
    }
    for (let index = 0; index < flattened.length; index += 1) {
      const entry = flattened[index].record
      const record = annotationRecordOf(entry)
      if (collectionScopeOf(entry) !== 'current') continue
      if (markStatusRevision !== domRevision) {
        markStatusCache.clear()
        markStatusRevision = domRevision
      }
      const entryId = typeof record.id === 'string' ? record.id : ''
      let status = markStatusCache.get(entryId)
      if (status === undefined) {
        status = statusOf(entry)
        markStatusCache.set(entryId, status)
      }
      if (status !== 'resolved' && status !== 'changed') continue
      const node = liveNode(entry)
      if (node === null) continue
      const rect = annotationRectOf(node)
      if (rect === null || rect.width <= 0 || rect.height <= 0) continue
      const excerpt = annotationMarkerBadgeText(record.note)
      marks.push({
        id: entryId,
        index: flattened[index].ordinal,
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
  function findMarkAt(point: { x: number, y: number }, marks: unknown): AnnotationMarkDescriptor | null {
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
  function detailCardRect(current: unknown) {
    const cardValue = current !== null && typeof current === 'object' ? (current as { detailCard?: unknown }).detailCard : null
    const card = cardValue !== null && typeof cardValue === 'object'
      ? cardValue as { x?: unknown, y?: unknown, mode?: unknown, refId?: unknown }
      : null
    if (card === null) return null
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
  function closeDetailCard(options?: Record<string, unknown>): boolean {
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
  function openDetailCard(mark: unknown): void {
    if (!isActive() || mark === null || typeof mark !== 'object') return
    const markView = mark as AnnotationMarkDescriptor
    const current = snapshot()
    if (current.state.selection.length > 0) return
    const position = clampDetailCardPosition(markView.rect, detailMeasuredSize, annotationViewport(), current.railWidth)
    cancelDetailClose()
    publish({
      detailCard: {
        refId: markView.id,
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
  function scheduleMarkerHoverOpen(mark: AnnotationMarkDescriptor): void {
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
      const detailCard = current.detailCard
      if (detailCard === null) return
      if (hoverPoint !== null && annotationPointInRect(hoverPoint, detailCardRect(current))) return
      if (hoverPoint !== null) {
        const hit = findMarkAt(hoverPoint, current.markRects)
        if (hit !== null && hit.id === detailCard.refId) return
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
    const detailCard = current.detailCard
    if (detailCard === null || typeof detailCard !== 'object') return
    const mark = (Array.isArray(current.markRects) ? current.markRects : []).find((item) => item.id === detailCard.refId)
    if (mark === undefined) return
    const position = clampDetailCardPosition(mark.rect, detailMeasuredSize, annotationViewport(), current.railWidth)
    if (position.x === detailCard.x && position.y === detailCard.y) return
    publish({ detailCard: { ...detailCard, x: position.x, y: position.y, placement: position.placement } })
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
  function updateMarkerHover(point: { x: number, y: number }): void {
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
  function attachDetailNode(node: Element | null): void {
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
   * Outline rect for one selected ref: prefer the live element identity captured
   * at pick time (leaf-first selections and their Parent/Child walk), then fall
   * back to locator resolution / captured bounds.
   * @param {object} ref - selected ElementRef.
   * @returns {{ x: number, y: number, width: number, height: number } | null} rect.
   */
  function selectionRectOf(ref: unknown) {
    const record = annotationRecordOf(ref)
    const refId = typeof record.id === 'string' ? record.id : ''
    if (refId.length > 0) {
      const picked = pickedSelection.get(refId)
      if (picked !== undefined && picked !== null && picked.isConnected !== false) {
        const pickedRect = annotationRectOf(picked)
        if (pickedRect !== null) return pickedRect
      }
    }
    const node = liveNode(ref)
    return node !== null ? annotationRectOf(node) : normalizeAnnotationBounds(record.bounds)
  }

  /**
   * Derive selection/popover geometry for one state.
   * @param {object} state - next state.
   * @param {object} previous - previous snapshot.
   * @returns {object} snapshot patch.
   */
  function deriveGeometry(state: AnnotationState, previous: AnnotationSnapshot): Partial<AnnotationSnapshot> {
    if (state.selection.length === 0 && pickedSelection.size > 0) pickedSelection.clear()
    const selectionRects: Array<{ id: string, rect: { x: number, y: number, width: number, height: number } }> = []
    for (const ref of state.selection) {
      const rect = selectionRectOf(ref)
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
        const rect = selectionRectOf(ref)
        popoverPosition = rect === null
          ? null
          : clampPopoverPosition(rect, popoverMeasuredSize, annotationViewport(), previous.railWidth)
      }
    } else {
      popoverRefId = null
      popoverPosition = null
      popoverPinned = false
    }
    // A3/T24: the multi-selection batch popover anchors beside the newest
    // selected element and follows the selection while items are added.
    let batchPosition: Point | null = null
    let batchPinned = false
    if (state.phase === 'multi' && state.selection.length > 1 && selectionRects.length > 0) {
      const previousSelection = previous.state !== null && typeof previous.state === 'object' && Array.isArray(previous.state.selection)
        ? previous.state.selection
        : []
      if (previous.batchPinned === true && previous.batchPosition !== null && previousSelection.length === state.selection.length) {
        batchPinned = true
        batchPosition = clampPopoverPositionToViewport(previous.batchPosition, batchMeasuredSize, annotationViewport(), previous.railWidth)
      } else {
        const anchor = selectionRects[selectionRects.length - 1].rect
        batchPosition = clampPopoverPosition(anchor, batchMeasuredSize, annotationViewport(), previous.railWidth)
      }
    }
    return { selectionRects, popoverPosition, popoverPinned, batchPosition, batchPinned, boxRect: state.box }
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
    const targetRect = selectionRectOf(ref)
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
  function attachPopoverNode(node: Element | null): void {
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

  /** Measure the mounted batch popover so clamping uses its real height. @returns {void} */
  function measureBatchPopover() {
    if (batchElement === null || typeof batchElement.getBoundingClientRect !== 'function') return
    const rect = batchElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const size = { width: Math.round(rect.width), height: Math.round(rect.height) }
    const changed = size.width !== batchMeasuredSize.width || size.height !== batchMeasuredSize.height
    batchMeasuredSize = size
    if (!changed) return
    const current = snapshot()
    if (current.batchPinned && current.batchPosition !== null) {
      publish({ batchPosition: clampPopoverPositionToViewport(current.batchPosition, batchMeasuredSize, annotationViewport(), current.railWidth) })
    }
  }

  /** Schedule one coalesced batch-popover measurement. @returns {void} */
  function scheduleBatchMeasure() {
    if (batchMeasureFrame !== null) return
    batchMeasureFrame = window.requestAnimationFrame(() => {
      batchMeasureFrame = null
      measureBatchPopover()
    })
  }

  /**
   * Track the mounted batch popover for measurement.
   * @param {Element | null} node - mounted batch popover root.
   * @returns {void}
   */
  function attachBatchNode(node: Element | null): void {
    if (!(node instanceof HTMLElement) || node === batchElement) return
    batchElement = node
    scheduleBatchMeasure()
  }

  /** Forget the mounted batch popover element. @returns {void} */
  function detachBatchNode() {
    batchElement = null
    if (batchMeasureFrame !== null) {
      window.cancelAnimationFrame(batchMeasureFrame)
      batchMeasureFrame = null
    }
  }

  /**
   * Reduce one action and publish the derived snapshot.
   * @param {object} action - reducer action.
   * @returns {object} next state.
   */
  /** Deferred batch-popover timer (A3/T24): it opens after the user stops adding. */
  let batchOpenTimer: number | null = null

  /**
   * Schedule the batch popover after multi-select activity settles, so the
   * popover does not appear between Shift-clicks and steal the pointer.
   * @param {object} nextState - next annotation state.
   * @param {object} previousState - previous annotation state.
   * @returns {void}
   */
  function scheduleBatchPopover(nextState: AnnotationState, previousState: AnnotationState): void {
    if (nextState.selection === previousState.selection && nextState.phase === previousState.phase) return
    if (batchOpenTimer !== null) {
      window.clearTimeout(batchOpenTimer)
      batchOpenTimer = null
    }
    if (nextState.phase === 'multi' && nextState.selection.length > 1 && nextState.batchOpen !== true) {
      batchOpenTimer = window.setTimeout(() => {
        batchOpenTimer = null
        const current = snapshot().state
        if (current.phase === 'multi' && current.selection.length > 1 && current.batchOpen !== true) {
          dispatch({ type: 'batchOpen', open: true })
        }
      }, 800)
    }
  }

  function dispatch(action: Record<string, unknown>): AnnotationState {
    const current = snapshot()
    const nextState = reduceAnnotationState(current.state, action)
    if (nextState === current.state) return current.state
    const patch = deriveGeometry(nextState, current)
    store.set({ ...current, state: nextState, ...patch })
    scheduleBatchPopover(nextState, current.state)
    syncSurfacePin()
    if (nextState.view !== current.state.view) updateLayout()
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
  function feedback(text: string, kind?: string): void {
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
  function persistLauncherPosition(position: { x: number, y: number }): void {
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
    const railWidth = computeRailWidth(size.width, current.railCollapsed, current.state.view)
    const mode = layoutModeFor(size.width, annotationMeasureSidebarWidths(), railWidth)
    const frame = annotationLayoutFrame()
    if (isActive() && frame !== null) {
      syncRailDock()
      captureFrameInline(frame)
      if (frameRestoreTimer !== null) {
        // Reactivating before the reverse transition finished must keep the marker.
        window.clearTimeout(frameRestoreTimer)
        frameRestoreTimer = null
      }
      if (frame.getAttribute('data-psa-frame') !== 'true') frame.setAttribute('data-psa-frame', 'true')
      if (mode === 'shrink') {
        const frameStyle = frame.style as unknown as { paddingRight?: string }
        if (frameStyle.paddingRight !== `${railWidth}px`) frameStyle.paddingRight = `${railWidth}px`
      } else if (frameSnapshot !== null) {
        // Overlay mode reserves no strip: put the host's own padding back instead
        // of writing '' over it or leaving the shrink padding behind (F12).
        restoreInlineProperty(frame, 'padding-right', frameSnapshot.paddingRight)
      }
      const railProperty = `${railWidth}px`
      if (annotationStyle(frame).getPropertyValue('--psa-rail-width') !== railProperty) annotationStyle(frame).setProperty('--psa-rail-width', railProperty)
      observeFrame(frame)
    }
    // The floating launcher only exists while idle; the active mode shows the
    // docked copy inside the rail, so the idle position is left untouched (and
    // persisted only by idle drags).
    const launcherPosition = isActive()
      ? current.launcherPosition
      : clampLauncherPosition(current.launcherPosition, size, ANNOTATION_LAUNCHER_SIZE)
    const patch: Partial<AnnotationSnapshot> = { railWidth, layoutMode: mode, launcherPosition }
    if (current.state.phase === 'multi' && current.batchPosition !== null && current.selectionRects.length > 0) {
      if (current.batchPinned) {
        patch.batchPosition = clampPopoverPositionToViewport(current.batchPosition, batchMeasuredSize, size, railWidth)
      } else {
        const anchor = current.selectionRects[current.selectionRects.length - 1].rect
        patch.batchPosition = clampPopoverPosition(anchor, batchMeasuredSize, size, railWidth)
      }
    }
    if (current.state.phase === 'selected' && current.selectionRects.length > 0 && current.popoverPosition !== null) {
      if (current.popoverPinned) {
        // A dragged/pinned popover keeps its offset but must stay on-screen.
        patch.popoverPosition = clampPopoverPositionToViewport(current.popoverPosition, popoverMeasuredSize, size, railWidth)
      } else {
        const ref = current.state.selection[0]
        const rect = ref === undefined ? null : selectionRectOf(ref)
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
  function persistLauncherPositionIfNeeded(next: Point, previous: Point): void {
    if (next.x === previous.x && next.y === previous.y) return
    persistLauncherPosition(next)
  }

  /**
   * Observe the frame's inline style so opening/closing native sidebars
   * re-evaluates the layout mode.
   * @param {Element} frame - layout frame.
   * @returns {void}
   */
  function observeFrame(frame: HTMLElement): void {
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
  function trackGesture(cleanup: (aborted: boolean) => void): () => void {
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
    const element = (document as unknown as { elementFromPoint?: (x: number, y: number) => Element | null }).elementFromPoint?.(hoverPoint.x, hoverPoint.y) ?? null
    if (element === null) {
      clearHover()
      return
    }
    if (element.closest('[data-psa-own]') !== null) {
      clearHover()
      return
    }
    const chain = annotationCandidateChain(element)
    // Hover shares the click pick table: inside a floating surface that means
    // the deepest meaningful inner element under the pointer (A3/T16), while a
    // background/padding hit keeps the whole surface.
    const levels = pickLevels(chain)
    if (levels.index < 0 || levels.index >= levels.entries.length) {
      clearHover()
      return
    }
    const candidate = levels.entries[levels.index].element
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
      const patch: Partial<AnnotationSnapshot> = { selectionRects: [] }
      const rects: Array<{ id: string, rect: { x: number, y: number, width: number, height: number } }> = []
      for (const ref of current.state.selection) {
        const rect = selectionRectOf(ref)
        if (rect !== null) rects.push({ id: ref.id, rect })
      }
      patch.selectionRects = rects
      // A3/T6: page marks are derived on the same rAF as the other geometry, so
      // scroll/resize/DOM-mutation frames keep them glued to their elements.
      patch.markRects = markRectsOf(current.state)
      const detailCard = current.detailCard
      if (detailCard !== null) {
        const cardMark = patch.markRects.find((mark) => mark.id === detailCard.refId)
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
          if (position.x !== detailCard.x || position.y !== detailCard.y) {
            patch.detailCard = { ...detailCard, x: position.x, y: position.y, placement: position.placement }
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
        const rect = ref === undefined ? null : selectionRectOf(ref)
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
  function onPointerDown(event: AnnotationPointerEventView): void {
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
  function onPointerMove(event: AnnotationPointerEventView): void {
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
    if (eventInsideComposer(event)) {
      // The composer is interactive, not a page target: no hover outline.
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
  function onPointerUp(event: AnnotationPointerEventView): void {
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
  function selectAt(event: AnnotationPointerEventView): void {
    const element = annotationEventElement(event)
    if (element === null) return
    const chain = annotationCandidateChain(element)
    const levels = pickLevels(chain)
    if (levels.index < 0) return
    const ref = refFromPick(levels, null)
    lastPick = levels
    pickedSelection.clear()
    pickedSelection.set(ref.id, levels.entries[levels.index].element)
    dispatch({ type: 'selectSingle', ref })
  }

  /**
   * One modifier click: toggle the clicked candidate in the selection.
   * @param {object} event - pointer event.
   * @returns {void}
   */
  function toggleSelectionAt(event: AnnotationPointerEventView): void {
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
    pickedSelection.set(ref.id, levels.entries[levels.index].element)
    dispatch({ type: 'toggleMulti', ref })
  }

  /**
   * Finish a marquee: collect intersecting candidates into the selection.
   * @param {object} event - pointer event that released the box.
   * @returns {void}
   */
  function finishMarquee(event: AnnotationPointerEventView): void {
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
      if (!isActive()) {
        const launcherPosition = clampLauncherPosition(current.launcherPosition, annotationViewport(), ANNOTATION_LAUNCHER_SIZE)
        if (launcherPosition.x !== current.launcherPosition.x || launcherPosition.y !== current.launcherPosition.y) {
          publish({ launcherPosition })
          persistLauncherPosition(launcherPosition)
        }
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
  function onKeyDown(event: AnnotationKeyboardEventView): void {
    if (!isActive()) return
    if (event.isComposing === true) return
    if (event.key === 'Escape' && snapshot().chipPreview !== null) {
      // The transient chip tooltip closes first: Esc must not also clear the
      // selection, close the popover, or leave the mode in the same keypress.
      event.preventDefault()
      event.stopPropagation()
      hideChipPreview()
      hideChipAction()
      return
    }
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
  function onKeyUp(event: AnnotationKeyboardEventView): void {
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
    // A3/T51: the settings popover is a transient surface; Esc closes it first.
    if (current.settingsOpen === true) {
      closeSettingsOpen()
      return
    }
    if (current.exitConfirm !== null) {
      cancelExitConfirm()
      return
    }
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
    // A3/T26: the managed list is the root body; only settings has a rung above
    // it, and the next Esc from the list leaves the mode (asking first when
    // records exist — A3/T29).
    if (state.view === 'settings') {
      dispatch({ type: 'exitOne' })
      return
    }
    requestExit()
  }

  /**
   * Install the capture-phase window listeners exactly once.
   * @returns {void}
   */
  function installPageListeners() {
    if (pageListeners.length > 0) return
    /** @param {string} type - event type. @param {Function} handler - listener. @param {object} options - addEventListener options. @returns {void} */
    const listen = (type: string, handler: (...args: never[]) => unknown, options?: boolean | Record<string, unknown>): void => {
      window.addEventListener(type, handler as never, options)
      pageListeners.push({ type, handler: handler as unknown as AnnotationListener, options })
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
  function captureFrameInline(frame: HTMLElement): void {
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
        value: annotationStyle(frame).getPropertyValue('padding-right'),
        priority: annotationStyle(frame).getPropertyPriority('padding-right')
      },
      railWidth: {
        value: annotationStyle(frame).getPropertyValue('--psa-rail-width'),
        priority: annotationStyle(frame).getPropertyPriority('--psa-rail-width')
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
  function restoreInlineProperty(frame: HTMLElement, name: string, saved: AnnotationInlineProperty): void {
    if (saved.value === '' && saved.priority === '') annotationStyle(frame).removeProperty(name)
    else annotationStyle(frame).setProperty(name, saved.value, saved.priority)
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
  function restoreAnnotationLayout(options?: Record<string, unknown>): void {
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
    idleLauncherPosition = snapshot().launcherPosition
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
      ensureRailDockObserver()
      syncRailDock()
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
      disconnectRailDockObserver()
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
      disconnectRailDockObserver()
      restoreAnnotationLayout()
      flushAnnotationRecords()
      return
    }
    try {
      releaseSurfacePin(true)
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
      publish({ markRects: [], markerHoverId: null, markUndo: null, chipPreview: null })
      uninstallPageListeners()
      disconnectFrameObserver()
      disconnectRailDockObserver()
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
        const restoreLauncher = idleLauncherPosition ?? snapshot().launcherPosition
        idleLauncherPosition = null
        publish({
          boxRect: null,
          popoverPosition: null,
          popoverPinned: false,
          hoverRect: null,
          noteEditor: null,
          launcherPosition: clampLauncherPosition(restoreLauncher, annotationViewport(), ANNOTATION_LAUNCHER_SIZE)
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
  function beginLauncherDrag(event: AnnotationPointerEventView): void {
    if (event.button !== 0) return
    event.preventDefault()
    const start = snapshot().launcherPosition
    const originX = event.clientX
    const originY = event.clientY
    let moved = false
    suppressLauncherClickUntil = 0
    /** @param {PointerEvent} moveEvent - pointermove. @returns {void} */
    const onMove = (moveEvent: AnnotationPointerEventView): void => {
      const dx = moveEvent.clientX - originX
      const dy = moveEvent.clientY - originY
      if (!moved && Math.hypot(dx, dy) < 4) return
      moved = true
      publish({ launcherDragging: true })
      publish({
        launcherPosition: clampLauncherPosition(
          { x: start.x + dx, y: start.y + dy },
          annotationViewport(),
          ANNOTATION_LAUNCHER_SIZE
        )
      })
    }
    /**
     * Settle the drag exactly once. An aborted drag (teardown, pass-through)
     * never persists a position and swallows the click that follows it.
     * @param {boolean} aborted - whether a teardown is aborting the gesture.
     * @returns {void}
     */
    const settle = (aborted: boolean): void => {
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
  function beginPopoverDrag(event: AnnotationPointerEventView): void {
    if (event.button !== 0) return
    const start = snapshot().popoverPosition
    if (start === null) return
    event.preventDefault()
    measurePopover()
    const originX = event.clientX
    const originY = event.clientY
    /** @param {PointerEvent} moveEvent - pointermove. @returns {void} */
    const onMove = (moveEvent: AnnotationPointerEventView): void => {
      const size = annotationViewport()
      const railWidth = snapshot().railWidth
      const maxX = Math.max(8, size.width - railWidth - popoverMeasuredSize.width - 8)
      const maxY = Math.max(8, size.height - popoverMeasuredSize.height - 8)
      const x = Math.min(Math.max(start.x + moveEvent.clientX - originX, 8), maxX)
      const y = Math.min(Math.max(start.y + moveEvent.clientY - originY, 8), maxY)
      publish({ popoverPosition: { x: Math.round(x), y: Math.round(y) }, popoverPinned: true })
    }
    /** @param {boolean} aborted - whether a teardown is aborting the gesture. @returns {void} */
    const settle = (aborted: boolean): void => {
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

  /**
   * Start dragging the multi-selection batch popover by its header, so a
   * popover anchored near a window edge can be moved fully on-screen.
   * @param {PointerEvent} event - pointerdown on the batch popover header.
   * @returns {void}
   */
  function beginBatchDrag(event: AnnotationPointerEventView): void {
    if (event.button !== 0) return
    const start = snapshot().batchPosition
    if (start === null) return
    event.preventDefault()
    measureBatchPopover()
    const originX = event.clientX
    const originY = event.clientY
    /** @param {PointerEvent} moveEvent - pointermove. @returns {void} */
    const onMove = (moveEvent: AnnotationPointerEventView): void => {
      const size = annotationViewport()
      const railWidth = snapshot().railWidth
      const maxX = Math.max(8, size.width - railWidth - batchMeasuredSize.width - 8)
      const maxY = Math.max(8, size.height - batchMeasuredSize.height - 8)
      const x = Math.min(Math.max(start.x + moveEvent.clientX - originX, 8), maxX)
      const y = Math.min(Math.max(start.y + moveEvent.clientY - originY, 8), maxY)
      publish({ batchPosition: { x: Math.round(x), y: Math.round(y) }, batchPinned: true })
    }
    /** @param {boolean} aborted - whether a teardown is aborting the gesture. @returns {void} */
    const settle = (aborted: boolean): void => {
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

  /** A3/T51: toggle the transient modifier-settings popover. @returns {void} */
  function toggleSettingsOpen() {
    publish({ settingsOpen: !snapshot().settingsOpen })
  }

  /** A3/T51: close the modifier-settings popover. @returns {void} */
  function closeSettingsOpen() {
    if (snapshot().settingsOpen) publish({ settingsOpen: false })
  }

  /** Show one rail view in place. @param {'status' | 'collection' | 'settings'} view - requested view. @returns {void} */
  function openView(view: string): void {
    dispatch({ type: 'openView', view })
  }

  /** Return the rail to its status view. @returns {void} */
  function backView() {
    dispatch({ type: 'openView', view: 'collection' })
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
  function updateNote(text: string): void {
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
   * A3/T24: commit the multi-selection as ONE group. Each selected element
   * becomes a group item with its full locator/bounds/session metadata; the
   * requirement is stored once on the group. The cap counts every item.
   * @param {object} state - current annotation state.
   * @param {{ feedback?: boolean }} [options] - feedback suppression (quick reference).
   * @returns {boolean} whether the group was saved.
   */
  function commitGroupSelection(state: AnnotationState, options?: Record<string, unknown>): boolean {
    const settingsForCommit = options !== null && typeof options === 'object' ? options : {}
    const sessionId = bridge.sessionId ?? state.sessionId ?? null
    const refs = state.selection.filter((ref) => ref !== null && typeof ref === 'object')
    if (refs.length === 0) return false
    if (annotationTotalItemCount(state.collection) + refs.length > ANNOTATION_RECORD_LIMIT) {
      feedback(t('collection.maxReached', { limit: ANNOTATION_RECORD_LIMIT }), 'error')
      return false
    }
    const enriched = refs.map((ref) => ({
      ...ref,
      session: { ...(ref.session !== null && typeof ref.session === 'object' ? ref.session : {}), sessionId: ref.session?.sessionId ?? sessionId }
    }))
    const group = annotationGroupFromSelection(enriched, state.note, sessionId, Date.now())
    if (group === null) return false
    const preview = collectionAddGroup(state.collection, group, ANNOTATION_RECORD_LIMIT)
    if (preview.rejected) {
      feedback(t('collection.maxReached', { limit: ANNOTATION_RECORD_LIMIT }), 'error')
      return false
    }
    closeDetailCard({ keepMarker: true })
    dispatch({ type: 'groupAdd', group })
    dispatch({ type: 'selectSingle', ref: null })
    if (settingsForCommit.feedback !== false) feedback(t('feedback.groupAdded', { count: annotationGroupItems(group).length }))
    return true
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
  function commitSelection(options?: Record<string, unknown>): boolean {
    const settingsForCommit = options !== null && typeof options === 'object' ? options : {}
    const current = snapshot()
    const state = current.state
    if (state.selection.length === 0) return false
    // A3/T24: a multi-selection is ONE batch group with ONE shared requirement,
    // never N independent records.
    if (state.selection.length > 1) return commitGroupSelection(state, settingsForCommit)
    const sessionId = bridge.sessionId ?? state.sessionId ?? null
    const identityMatches = (item: unknown, ref: AnnotationElementRef): boolean => identityKeyOf(item) === identityKeyOf(ref)
      && annotationSessionIdOf(item) === (ref.session?.sessionId ?? sessionId)
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
  function insertIntoComposer(text: string): boolean {
    const actions = bridge.inputActions
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
  function attachComposerServices(services: AnnotationComposerServices): void {
    const source = services !== null && typeof services === 'object' ? services : {}
    const conversation = source.conversation
    const inputTriggers = source.inputTriggers
    composerConversation = conversation !== null && conversation !== undefined && typeof conversation === 'object'
      ? conversation as Record<string, unknown>
      : null
    composerInputTriggers = inputTriggers !== null && inputTriggers !== undefined && typeof inputTriggers === 'object'
      ? inputTriggers as Record<string, unknown>
      : null
  }

  /**
   * Resolve the session-scoped input facade for one Session.
   * @param {string | null} sessionId - Session identity.
   * @returns {object | null} session input facade, or null when unavailable.
   */
  function composerInputFor(sessionId: string | null): AnnotationComposerInput | null {
    if (composerConversation === null || typeof sessionId !== 'string' || sessionId.length === 0) return null
    const sessions = ctx !== null && typeof ctx === 'object' ? ctx.sessions : null
    if (sessions === null || typeof sessions !== 'object' || typeof sessions.scope !== 'function') return null
    try {
      const actx = sessions.scope(sessionId)
      if (actx === undefined || actx === null) return null
      const conversation = composerConversation as { input?: unknown } | null
      const inputRegistry = conversation === null ? null : conversation.input
      if (inputRegistry === null || typeof inputRegistry !== 'object') return null
      const registry = inputRegistry as { for?: (scope: unknown) => unknown }
      if (typeof registry.for !== 'function') return null
      const resolved = registry.for(actx)
      return resolved !== null && resolved !== undefined && typeof resolved === 'object'
        ? resolved as AnnotationComposerInput
        : null
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
  function insertReferenceChip(records: unknown, options: Record<string, unknown>): boolean {
    const list = Array.isArray(records) ? records : []
    const settingsForInsert = options !== null && typeof options === 'object' ? options : {}
    if (list.length === 0) return false
    const batch = settingsForInsert.batch === true
    const fallbackText = typeof settingsForInsert.fallbackText === 'string' ? settingsForInsert.fallbackText : ''
    const sessionId = bridge.sessionId ?? snapshot().state.sessionId
    const actions = bridge.inputActions
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
            ? annotationChipRefBatch(list, t('chip.batchLabel', { count: annotationTotalItemCount(list) }))
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

  /** The chip element currently showing the hover preview (or null). */
  let chipPreviewElement: Element | null = null
  /** The chip element the × affordance currently targets (or null). */
  let chipActionElement: Element | null = null
  /** Pending delayed hide for the × affordance (keeps it alive while the pointer moves onto it). */
  let chipActionHideTimer: number | null = null

  /** Cancel a pending × affordance hide. @returns {void} */
  function cancelChipActionHide() {
    if (chipActionHideTimer !== null) {
      clearTimeout(chipActionHideTimer)
      chipActionHideTimer = null
    }
  }

  /** Hide the × affordance immediately. @returns {void} */
  function hideChipAction() {
    cancelChipActionHide()
    chipActionElement = null
    if (snapshot().chipAction !== null) publish({ chipAction: null })
  }

  /**
   * Delay the × affordance hide so the pointer can travel from the chip onto
   * the button; entering the button cancels the pending hide.
   * @returns {void}
   */
  function scheduleChipActionHide() {
    if (chipActionElement === null) return
    cancelChipActionHide()
    chipActionHideTimer = window.setTimeout(() => {
      chipActionHideTimer = null
      chipActionElement = null
      publish({ chipAction: null })
    }, 180)
  }

  /** Keep the × affordance visible (pointer entered it). @returns {void} */
  function keepChipAction() {
    cancelChipActionHide()
  }

  /**
   * Show the × affordance over one annotation chip.
   * @param {Element} chip - `[data-composer-chip="ui-annotation"]` element.
   * @returns {void}
   */
  function showChipAction(chip: Element): void {
    cancelChipActionHide()
    chipActionElement = chip
    const rect = chip.getBoundingClientRect()
    publish({
      chipAction: {
        x: Math.round(rect.right - 7),
        y: Math.round(rect.top - 7),
        width: 16,
        height: 16
      }
    })
  }

  /**
   * Remove the chip the × affordance targets THROUGH the shell's own editor
   * (Lexical node removal, the same mutation Backspace performs), so other
   * chips stay real chips, surrounding text/caret stay put, and the edit is one
   * undo step. Never rewrites the whole draft and never sends.
   * @returns {boolean} whether the chip was removed.
   */
  function removeChipAtAction() {
    const chip = chipActionElement
    if (chip === null || chip === undefined || chip.isConnected === false) {
      hideChipAction()
      return false
    }
    const sessionId = bridge.sessionId ?? snapshot().state.sessionId
    const input = composerInputFor(sessionId)
    const editor = input === null ? null : input.editor ?? null
    let removed: boolean = false
    if (editor !== null && typeof editor === 'object'
      && typeof editor.update === 'function'
      && typeof editor.getEditorState === 'function'
      && typeof editor.getElementByKey === 'function') {
      const editorView = editor as {
        update(callback: () => void): void
        getEditorState(): unknown
        getElementByKey(key: string): unknown
      }
      const stateMap = (state: unknown): Map<unknown, unknown> | null => {
        if (state === null || typeof state !== 'object') return null
        const nodeMap = (state as { _nodeMap?: unknown })._nodeMap
        return nodeMap instanceof Map ? nodeMap as Map<unknown, unknown> : null
      }
      try {
        const nodeMap = stateMap(editorView.getEditorState())
        let nodeKey: unknown = null
        if (nodeMap !== null) {
          for (const key of nodeMap.keys()) {
            if (editorView.getElementByKey(String(key)) === chip) {
              nodeKey = key
              break
            }
          }
        }
        if (nodeKey !== null) {
          editorView.update(() => {
            const liveMap = stateMap(editorView.getEditorState())
            const node = liveMap === null ? null : liveMap.get(nodeKey)
            if (node !== null && node !== undefined && typeof (node as { remove?: unknown }).remove === 'function') {
              (node as { remove(): void }).remove()
            }
          })
          const chipConnected = (chip as unknown as { isConnected?: boolean }).isConnected
          removed = chipConnected === false || (() => {
            try {
              const nextMap = stateMap(editorView.getEditorState())
              return nextMap !== null && !nextMap.has(nodeKey)
            } catch {
              return false
            }
          })()
        }
      } catch {
        removed = false
      }
    }
    if (!removed) {
      // Fallback: focus the editor, move the caret right after the chip through
      // the DOM selection, and let Lexical's own Backspace handler delete it.
      try {
        const editorRoot = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')
        if (editorRoot !== null) {
          const editorHost = editorRoot as unknown as {
            focus: () => void
            dispatchEvent: (event: unknown) => boolean
          }
          editorHost.focus()
          const rangeHost = document as unknown as {
            createRange: () => { setStartAfter(node: unknown): void, collapse(toStart?: boolean): void }
          }
          const range = rangeHost.createRange()
          range.setStartAfter(chip)
          range.collapse(true)
          const selectionHost = window as unknown as {
            getSelection: () => {
              removeAllRanges(): void
              addRange(range: unknown): void
            } | null
          }
          const selection = selectionHost.getSelection()
          if (selection !== null) {
            selection.removeAllRanges()
            selection.addRange(range)
          }
          const eventHost = globalThis as unknown as {
            KeyboardEvent: new (type: string, init?: Record<string, unknown>) => unknown
          }
          editorHost.dispatchEvent(new eventHost.KeyboardEvent('keydown', {
            key: 'Backspace',
            code: 'Backspace',
            keyCode: 8,
            which: 8,
            bubbles: true,
            cancelable: true
          }))
          removed = true
        }
      } catch {
        removed = false
      }
    }
    hideChipPreview()
    hideChipAction()
    if (!removed) feedback(t('feedback.chipRemoveFailed'), 'error')
    else annotationFocusComposer()
    return removed
  }

  /**
   * Hide the composer-chip hover preview.
   * @returns {boolean} whether a preview was visible.
   */
  function hideChipPreview() {
    const wasVisible = chipPreviewElement !== null || snapshot().chipPreview !== null
    chipPreviewElement = null
    if (snapshot().chipPreview !== null) publish({ chipPreview: null })
    return wasVisible
  }

  /**
   * Resolve one annotation reference chip to a preview model from the local
   * store only (no network): the chip label is matched against our records'
   * element labels, and the grouped batch chip against the localized batch
   * label. Native chips never match and therefore get no preview.
   * @param {Element} chip - `[data-composer-chip="ui-annotation"]` element.
   * @returns {object | null} preview model, or null for a lookalike chip.
   */
  function chipPreviewModel(chip: Element): { kind: 'batch', count: number, items: Array<{ label: string, note: string }> } | { kind: 'record', refId: string } | null {
    const chipView = chip as unknown as { innerText?: unknown }
    const label = String(chipView.innerText || chip.textContent || '').replace(/\s+/g, ' ').trim().replace(/^@\s*/, '')
    if (label.length === 0) return null
    const batchTemplate = t('chip.batchLabel')
    const batchPrefix = batchTemplate.split('{count}')[0].trim()
    if (batchPrefix.length > 0 && label.startsWith(batchPrefix)) {
      const parsed = /(\d+)/.exec(label)
      const sessionId = bridge.sessionId ?? snapshot().state.sessionId
      const selected = annotationSelectedEntries(snapshot().state.collection, sessionId)
      const flat = annotationFlattenRecords(selected)
      const count = parsed !== null ? Number(parsed[1]) : flat.length
      return {
        kind: 'batch',
        count: count > 0 ? count : flat.length,
        items: flat.slice(0, 6).map((record) => ({ label: elementLabel(record), note: typeof record.note === 'string' ? record.note : '' }))
      }
    }
    const flat = annotationFlattenRecords(snapshot().state.collection)
    const record = flat.find((entry) => (elementLabel(entry) || 'UI annotation') === label)
    if (record === undefined) return null
    const refId = annotationRecordOf(record).id
    if (typeof refId !== 'string') return null
    return { kind: 'record', refId }
  }

  /**
   * Pointer-over handler for the composer-chip hover preview. Delegated from
   * the plugin install: only chips rendered with our source are considered.
   * @param {PointerEvent} event - pointerover event.
   * @returns {void}
   */
  function onChipPointerOver(event: AnnotationPointerEventView): void {
    const target = event !== null && event.target instanceof Element ? event.target : null
    if (target === null) return
    const chip = typeof target.closest === 'function' ? target.closest('[data-composer-chip="ui-annotation"]') : null
    if (chip === null) {
      if (chipPreviewElement !== null) {
        // Layout churn under the pointer can emit pointerover events whose
        // target is not the chip; keep the preview while the chip is hovered.
        try {
          const previewView = chipPreviewElement as unknown as { matches?: (selector: string) => boolean }
          if (typeof previewView.matches === 'function' && previewView.matches(':hover')) return
        } catch {
          // fall through to hide
        }
        hideChipPreview()
      }
      return
    }
    if (chipPreviewElement === chip) return
    const editor = typeof chip.closest === 'function' ? chip.closest('[data-conversation-region="composer"] [data-lexical-editor="true"]') : null
    if (editor === null) return
    const model = chipPreviewModel(chip)
    if (model === null) {
      hideChipPreview()
      return
    }
    const rect = chip.getBoundingClientRect()
    const position = clampDetailCardPosition(
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      ANNOTATION_CHIP_PREVIEW_SIZE,
      annotationViewport(),
      isActive() ? snapshot().railWidth : 0
    )
    chipPreviewElement = chip
    publish({ chipPreview: { ...model, x: position.x, y: position.y, placement: position.placement } })
    showChipAction(chip)
  }

  /**
   * Scroll handler: hide the preview when the scrolled element is the document
   * or an ancestor of the chip (the chip moved with content). Unrelated scroll
   * containers (chat auto-scroll) must not flicker the preview away.
   * @param {Event} event - scroll event (capture).
   * @returns {void}
   */
  function onChipScroll(event: unknown): void {
    if (chipPreviewElement === null) return
    const target = event !== null && typeof event === 'object' ? (event as { target?: unknown }).target : null
    const isAncestorScroll = target === document
      || target === window
      || (target instanceof Element && (target === chipPreviewElement || target.contains(chipPreviewElement)))
    if (isAncestorScroll) {
      hideChipPreview()
      hideChipAction()
    }
  }

  /**
   * Pointer-out handler: hide the preview once the pointer leaves the chip.
   * @param {PointerEvent} event - pointerout event.
   * @returns {void}
   */
  function onChipPointerOut(event: AnnotationPointerEventView): void {
    if (chipPreviewElement === null) return
    const related = event !== null && event.relatedTarget instanceof Element ? event.relatedTarget : null
    if (related !== null && (related === chipPreviewElement || chipPreviewElement.contains(related))) return
    // React re-renders elsewhere on the page can emit spurious pointerout events
    // for nodes under the pointer; only hide when the physical pointer really
    // left the chip (`:hover` is the browser's own hit-test state).
    try {
      const previewView = chipPreviewElement as unknown as { matches?: (selector: string) => boolean }
      if (typeof previewView.matches === 'function' && previewView.matches(':hover')) return
    } catch {
      // A throwing matches() must not keep a stale preview on screen.
    }
    hideChipPreview()
    scheduleChipActionHide()
  }

  /**
   * The record a chip candidate names, for the `@` pick path.
   * @param {string} refId - record id from the candidate value.
   * @returns {object | null} record, or null when it was deleted meanwhile.
   */
  function chipRecord(refId: string | null | undefined) {
    return annotationFindRecord(snapshot().state.collection, refId)
  }

  /**
   * `@` group candidates: current-Session records only, ≤20, insertion order.
   * @param {string | null} sessionId - Session owning the composer.
   * @returns {Array<object>} trigger candidates.
   */
  function chipCandidates(sessionId: string | null) {
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
  function chipClipboardText(ref: unknown): string {
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
  function serializeChip(ref: unknown): string {
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
  function openChipReference(ref: unknown): boolean {
    hideChipPreview()
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
    const sessionId = bridge.sessionId ?? state.sessionId ?? null
    const record = snapshot().state.collection.find((entry) => !annotationIsGroup(entry)
      && identityKeyOf(entry) === identityKeyOf(ref)
      && annotationSessionIdOf(entry) === (ref.session?.sessionId ?? sessionId))
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
  function insertEntryChip(refId: string): void {
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
    const sessionId = bridge.sessionId ?? state.sessionId
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
    const fallbackText = serializeBatchEntries(selected, {
      ...annotationInsertLabels(t),
      skippedCount: split.other.length
    }, (record) => statusOf(record))
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
  function setEntryIncluded(refId: string, included: boolean): void {
    const entry = snapshot().state.collection.find((item) => item !== null && typeof item === 'object' && item.id === refId) ?? null
    if (entry === null) return
    const flag = collectionScopeOf(entry) === 'current' && included === true
    if (entry.included === flag) return
    dispatch({ type: 'annotationInclude', refId, included: flag })
  }

  /**
   * A3/T25: switch the sidebar filter (client-side).
   * @param {'all' | 'single' | 'group'} filter - target filter.
   * @returns {void}
   */
  function setFilter(filter: string): void {
    dispatch({ type: 'setFilter', filter })
  }

  /**
   * A3/T29: ask before leaving the mode while annotation records exist. With no
   * records the mode exits directly.
   * @returns {void}
   */
  function requestExit() {
    if (!isActive()) return
    const state = snapshot().state
    const count = annotationTotalItemCount(state.collection)
    if (count === 0) {
      deactivate()
      return
    }
    publish({ exitConfirm: { count } })
  }

  /** Dismiss the exit confirmation without changing anything. @returns {void} */
  function cancelExitConfirm() {
    if (snapshot().exitConfirm !== null) publish({ exitConfirm: null })
  }

  /**
   * Confirm the exit: clear ALL records (singles + groups), flush the empty v3
   * document immediately, close selection/popovers, and leave the mode.
   * @returns {void}
   */
  function confirmExitClear() {
    publish({ exitConfirm: null })
    dispatch({ type: 'collectionClear' })
    dispatch({ type: 'selectSingle', ref: null })
    flushAnnotationRecords()
    deactivate()
  }

  /**
   * A3/T25: footer primary action — save the current page selection (single
   * record or batch group) when one exists, otherwise return to the selection
   * status view so the user can pick elements.
   * @returns {void}
   */
  function primaryAddAnnotation() {
    const state = snapshot().state
    if (state.selection.length > 0) {
      commitSelection()
      return
    }
    // No page selection pending: the primary action now carries the collected
    // annotations to the composer instead of telling the user to select more.
    if (state.collection.length > 0) {
      insertBatch()
      return
    }
    if (state.view !== 'status') dispatch({ type: 'openView', view: 'status' })
    feedback(t('sidebar.addHint'))
  }

  /**
   * A3/T25: footer danger action — clear the current selection when there is
   * one, otherwise clear the whole collection (with undo).
   * @returns {void}
   */
  function clearSelectionOrCollection() {
    if (snapshot().state.selection.length > 0) {
      clearSelection()
      return
    }
    clearCollection()
  }

  /**
   * A3/T24: expand/collapse one group card.
   * @param {string} groupId - group id.
   * @returns {void}
   */
  function toggleGroup(groupId: string): void {
    dispatch({ type: 'groupToggleCollapsed', groupId })
  }

  /**
   * A3/T24: remove one child from a group (the group requirement remains). The
   * whole previous group is the undo payload, so one undo step restores it.
   * @param {string} groupId - group id.
   * @param {string} itemId - child record id.
   * @returns {void}
   */
  function removeGroupItem(groupId: string, itemId: string): void {
    const current = snapshot()
    const group = annotationFindGroup(current.state.collection, groupId)
    if (group === null) return
    const items = annotationGroupItems(group).filter((item) => item.id !== itemId)
    if (items.length === 0) {
      removeEntry(groupId)
      return
    }
    const next = { ...group, items, updatedAt: Date.now() }
    dispatch({ type: 'groupSet', group: next })
    setMarkUndo({ kind: 'groupRestore', group, at: Date.now() })
  }

  /**
   * Select every current-Session record for the batch (or clear the selection).
   * @param {boolean} included - target flag.
   * @returns {void}
   */
  function setAllCurrentIncluded(included: boolean): void {
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
  function moveEntry(refId: string, delta: number): void {
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
  function previewEntry(refId: string): void {
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
  function shiftChain(delta: number): void {
    const state = snapshot().state
    const ref = state.selection[0]
    if (ref === undefined || lastPick === null) return
    // `delta` is the Parent/Child direction in the old chain model (+1 parent);
    // a floating pick reverses it because its entry 0 is the whole card.
    const nextIndex = lastPick.index + delta * lastPick.parentStep
    if (nextIndex < 0 || nextIndex >= lastPick.entries.length) return
    lastPick = { ...lastPick, index: nextIndex }
    const nextRef = refFromPick(lastPick, { ...ref, note: state.note })
    pickedSelection.clear()
    pickedSelection.set(nextRef.id, lastPick.entries[nextIndex].element)
    dispatch({ type: 'selectSingle', ref: nextRef })
  }

  /**
   * Apply one settings select change, resolving modifier conflicts visibly.
   * @param {'passThroughModifier' | 'multiModifier'} field - changed field.
   * @param {string} value - requested modifier id.
   * @returns {void}
   */
  function setModifier(field: AnnotationModifierField, value: string): void {
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
  function updateCollectionNote(refId: string, note: string): void {
    dispatch({ type: 'annotationUpdateNote', refId, note: typeof note === 'string' ? note : '', now: Date.now() })
  }

  /**
   * Publish the single-slot undo payload and (re)arm its 5 s expiry (D5).
   * @param {object | null} undo - payload from `annotationUndoRemove`.
   * @returns {void}
   */
  function setMarkUndo(undo: AnnotationMarkUndo | null): void {
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
  function removeEntry(refId: string): void {
    const current = snapshot()
    if (!current.state.collection.some((entry) => annotationRecordOf(entry).id === refId)) return
    const removal = annotationUndoRemove(current.state.collection, refId, 'single', Date.now())
    dispatch({ type: 'annotationRemove', refId })
    const openNoteEditor = snapshot().noteEditor
    if (openNoteEditor !== null && openNoteEditor.refId === refId) publish({ noteEditor: null })
    const openDetailCard = snapshot().detailCard
    if (openDetailCard !== null && openDetailCard.refId === refId) closeDetailCard()
    setMarkUndo(removal.undo)
  }

  /** Remove the popover selection's existing collection record (danger X). @returns {void} */
  function removeSelection() {
    const state = snapshot().state
    const ref = state.selection[0]
    if (ref === undefined) return
    const record = snapshot().state.collection.find((entry) => identityKeyOf(entry) === identityKeyOf(ref)
      && annotationSessionIdOf(entry) === (ref.session?.sessionId ?? null))
    if (record === undefined) return
    const recordId = annotationRecordOf(record).id
    if (typeof recordId !== 'string') return
    removeEntry(recordId)
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
  function openDetailCardById(refId: string): boolean {
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
  function saveDetailNote(refId: string, note: string): void {
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
  function quickReferenceById(refId: string): void {
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
  function deleteDetail(refId?: string): void {
    if (typeof refId !== 'string') return
    removeEntry(refId)
  }

  /**
   * Scroll one collection entry's target into view and flash it.
   * @param {string} refId - ref id.
   * @returns {void}
   */
  function relocateEntry(refId: string): void {
    const ref = snapshot().state.collection.find((entry) => annotationRecordOf(entry).id === refId)
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
    const scrollHost = node as unknown as {
      scrollIntoView?: (options?: Record<string, unknown>) => void
    }
    try {
      if (typeof scrollHost.scrollIntoView === 'function') scrollHost.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch {
      if (typeof scrollHost.scrollIntoView === 'function') scrollHost.scrollIntoView()
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
  function openNoteEditor(refId: string): void {
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
  function sessionChanged(sessionId: string | null): void {
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
    bridge.inputActions = null
    bridge.sessionId = null
    bridge.sessionCwd = null
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
    beginBatchDrag,
    attachPopoverNode,
    detachPopoverNode,
    attachBatchNode,
    detachBatchNode,
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
    onChipPointerOver,
    onChipPointerOut,
    onChipScroll,
    hideChipPreview,
    hideChipAction,
    removeChipAtAction,
    keepChipAction,
    scheduleChipActionHide,
    chipClipboardText,
    serializeChip,
    openChipReference,
    copyLocator,
    levelUp: () => shiftChain(1),
    levelDown: () => shiftChain(-1),
    setModifier,
    toggleSettingsOpen,
    closeSettingsOpen,
    updateCollectionNote,
    toggleGroup,
    setFilter,
    primaryAddAnnotation,
    clearSelectionOrCollection,
    requestExit,
    cancelExitConfirm,
    confirmExitClear,
    removeGroupItem,
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
    statusDetailOf,
    copyXPath,
    copyJsPath,
    copyFullXPath,
    debugFallbackScanProbe,
    isInCollection,
    collectionScopeOf,
    currentSessionId,
    sessionChanged,
    dispose
  }
}


/**
 * One inline chevron glyph.
 * @param {'left' | 'right'} direction - pointing direction.
 * @returns {object} the SVG element.
 */
