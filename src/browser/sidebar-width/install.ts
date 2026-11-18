/**
 * Browser controller for the persisted, Host-synced left sidebar width.
 *
 * `model.ts` owns the pure decisions; this module owns the stateful half that
 * used to live inline in `src/client.js`: the per-plugin-instance runtime, the
 * browser cache, attach/detach, drag capture, the debounced Host sync and
 * adoption/restore rules, and the read-only E2E probe.
 *
 * The shell keeps the sidebar width only in memory (`layoutInfo.sidebar`,
 * transient by design: closing the sidebar forgets the dragged width). This
 * feature mirrors that private store, caches the width per origin, and syncs it
 * through the Host's authenticated `/api` document so paired devices agree. It
 * renders no UI and owns no copy.
 *
 * Attach seam: the layout plugin registers its AppFrame into the built-in
 * `root` slot and seats a store handle on that registration whose `create()` is
 * overridden to return the one live store instance the frame renders. The
 * public StoredEntry face exposes that seat as `entry.store`, so
 * `ctx.slots.entries('root')` reaches exactly the store the drag handle
 * writes. When the seat shape changes the feature stays inert
 * (`probe().attached === false`) instead of guessing.
 *
 * @module
 */

import {
  SIDEBAR_WIDTH_ROUTE,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
  isValidSidebarWidth,
  normalizeSidebarWidthPayload,
  parseSidebarWidthCache,
  serializeSidebarWidthCache,
  shouldAdoptSidebarWidth,
  sidebarWidthBootstrap,
  sidebarWidthReopenRestore
} from './model.ts'
import type { SidebarWidthCache, SidebarWidthPayload } from './model.ts'

/** Debounce for persisting one drag gesture (300 ms after the last change). */
const SIDEBAR_WIDTH_SAVE_DEBOUNCE_MS = 300

/** Retry cadence while a local width is not yet confirmed by the Host. */
const SIDEBAR_WIDTH_SYNC_INTERVAL_MS = 30000

/** Attachment retry delays; a quiet give-up follows the last one. */
const SIDEBAR_WIDTH_ATTACH_DELAYS_MS = [0, 250, 1000, 2000]

/** Drop the attachment watchers after this delay; the feature stays inert. */
const SIDEBAR_WIDTH_ATTACH_GIVE_UP_MS = 5000

/** Viewport below which the shell auto-collapses the sidebar (its own breakpoint). */
const SIDEBAR_WIDTH_CHECK_VIEWPORT_MIN = 1024

/** One sync fetch may not wedge the state machine forever. */
const SIDEBAR_WIDTH_FETCH_TIMEOUT_MS = 8000

/** Consecutive mismatching self-check frames before the seam is declared unreachable. */
const SIDEBAR_WIDTH_SELF_CHECK_LIMIT = 3

/**
 * `fetch` init that both profiles accept: the browser `RequestInit` already
 * carries `cache`, while the Host profile's undici `RequestInit` does not.
 */
type SidebarWidthFetchInit = RequestInit & { cache: string }

/** Host sync state reported by the probe. */
export type SidebarWidthSyncState = 'idle' | 'pending' | 'error'

/** Read-only feature state consumed by the browser E2E. */
export interface SidebarWidthProbe {
  attached: boolean
  storeWidth: number | null
  desiredWidth: number | null
  syncState: SidebarWidthSyncState
  cache: SidebarWidthCache
}

/** Stable shell facts the controller cannot own. */
export interface SidebarWidthDeps {
  /** Build one same-origin app URL (the entry owns `document.baseURI`). */
  appUrl: (relative: string) => string
}

/** The narrow slice of the client root context this controller reads. */
export interface SidebarWidthContext {
  effect(setup: () => (() => void) | void, label?: string): void
  slots: SidebarWidthSlots
}

/** The narrow slot surface: the `root` seat and its late-registration signal. */
export interface SidebarWidthSlots {
  entries?: (name: string) => unknown
  subscribe?: (name: string, listener: () => void) => (() => void) | null
}

/** One controller per plugin factory; the entry keeps the probe reference. */
export interface SidebarWidthController {
  install(ctx: SidebarWidthContext): void
  probe(): SidebarWidthProbe
}

/** The live shell layout store reachable through the `root` slot seat. */
interface SidebarWidthLayoutStore {
  getSnapshot(): unknown
  actions: { setSidebar(width: number): void }
  subscribe(listener: () => void): () => void
}

/** Mutable state read by the probe. */
interface SidebarWidthRuntime {
  attached: boolean
  storeWidth: number | null
  desiredWidth: number | null
  syncState: SidebarWidthSyncState
  cache: SidebarWidthCache
}

/**
 * The live shell layout store instance seated on the built-in `root` slot.
 * The layout plugin passes a store handle whose `create()` is overridden to
 * return the one instance the frame renders, so this reaches the same store
 * the drag handle writes.
 * @param ctx - client root context.
 * @returns layout store instance, or null before/without the seat.
 */
function sidebarWidthLayoutStore(ctx: SidebarWidthContext): SidebarWidthLayoutStore | null {
  if (ctx === null || typeof ctx !== 'object') return null
  const slots = ctx.slots
  if (slots === null || typeof slots !== 'object' || typeof slots.entries !== 'function') return null
  let entries: unknown = null
  try {
    entries = slots.entries('root')
  } catch {
    return null
  }
  if (!Array.isArray(entries)) return null
  const rows: readonly unknown[] = entries
  for (const entry of rows) {
    const entryRecord = entry !== null && typeof entry === 'object' ? entry as { store?: unknown } : null
    const handle = entryRecord === null ? undefined : entryRecord.store
    if (handle === null || handle === undefined || typeof handle !== 'object') continue
    if (typeof (handle as { create?: unknown }).create !== 'function') continue
    let instance: unknown = null
    try {
      instance = (handle as { create(): unknown }).create()
    } catch {
      instance = null
    }
    if (instance === null || typeof instance !== 'object') continue
    const getSnapshot = (instance as { getSnapshot?: unknown }).getSnapshot
    const snapshot = typeof getSnapshot === 'function'
      ? (instance as { getSnapshot(): unknown }).getSnapshot()
      : null
    if (snapshot === null || typeof snapshot !== 'object') continue
    const layoutInfo = (snapshot as { layoutInfo?: unknown }).layoutInfo
    if (layoutInfo === null || layoutInfo === undefined || typeof layoutInfo !== 'object') continue
    const actions = (instance as { actions?: unknown }).actions
    if (actions === null || actions === undefined || typeof actions !== 'object') continue
    if (typeof (actions as { setSidebar?: unknown }).setSidebar !== 'function') continue
    if (typeof (instance as { subscribe?: unknown }).subscribe !== 'function') continue
    return instance as SidebarWidthLayoutStore
  }
  return null
}

/**
 * Read the current preference (0 = collapsed) from a layout store instance.
 * @param instance - layout store instance.
 * @returns sidebar preference, or null when unavailable.
 */
function sidebarWidthStoreValue(instance: SidebarWidthLayoutStore | null): number | null {
  if (instance === null || typeof instance !== 'object' || typeof instance.getSnapshot !== 'function') return null
  let snapshot: unknown = null
  try {
    snapshot = instance.getSnapshot()
  } catch {
    snapshot = null
  }
  const layoutInfo = snapshot !== null && typeof snapshot === 'object'
    ? (snapshot as { layoutInfo?: unknown }).layoutInfo
    : null
  const value = layoutInfo !== null && typeof layoutInfo === 'object'
    ? (layoutInfo as { sidebar?: unknown }).sidebar
    : null
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Whether the user is currently dragging a shell resize handle. The frame
 * and the handles publish `data-dragging` while a pointer is captured.
 * @returns whether a drag is in progress.
 */
function sidebarWidthDragging(): boolean {
  try {
    if (typeof document === 'object' && document !== null && typeof document.querySelector === 'function') {
      return document.querySelector('[data-dragging]') !== null
    }
  } catch {
    return false
  }
  return false
}

/**
 * Create the per-plugin-instance sidebar-width controller.
 *
 * Lifecycle: read the cache, attach to the shell's layout store (retried
 * because the layout plugin may load after this one), re-apply the cached
 * width before the first paint, then sync with the Host once. Every later
 * gesture is captured from the store subscription, debounced and written
 * through the Host; focus/visibility plus a 30 s interval retry while a write
 * is pending. All listeners, timers and subscriptions live in the
 * `ctx.effect` disposer. When the layout seat cannot be reached the feature
 * stays inert (no cache writes, no network).
 * @param deps - stable shell facts (the entry's `appUrl`).
 * @returns the install/probe pair the entry keeps for one factory lifetime.
 */
export function createSidebarWidthController(deps: SidebarWidthDeps): SidebarWidthController {
  /** Live attach state read by the browser E2E probe (reads only, never writes). */
  const runtime: SidebarWidthRuntime = {
    attached: false,
    storeWidth: null,
    desiredWidth: null,
    syncState: 'idle',
    cache: { sidebarWidth: null, pending: false }
  }

  /**
   * Read the browser cache without throwing (private mode, storage disabled).
   * @returns parsed cache.
   */
  function readSidebarWidthCache(): SidebarWidthCache {
    let text: string | null = null
    try {
      if (typeof localStorage === 'object' && localStorage !== null) {
        text = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
      }
    } catch {
      text = null
    }
    runtime.cache = parseSidebarWidthCache(text)
    return runtime.cache
  }

  /**
   * Write the browser cache without throwing. The Host document is
   * authoritative; a blocked localStorage only costs the boot fast path.
   * @param cache - next document.
   * @returns the written document.
   */
  function writeSidebarWidthCache(cache: unknown): SidebarWidthCache {
    const source: Partial<SidebarWidthCache> = cache !== null && typeof cache === 'object'
      ? cache as Partial<SidebarWidthCache>
      : {}
    const next: SidebarWidthCache = {
      sidebarWidth: isValidSidebarWidth(source.sidebarWidth) ? source.sidebarWidth : null,
      pending: source.pending === true
    }
    runtime.cache = next
    try {
      if (typeof localStorage === 'object' && localStorage !== null) {
        localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, serializeSidebarWidthCache(next))
      }
    } catch {
      // Best effort only.
    }
    return next
  }

  return {
    install(ctx: SidebarWidthContext): void {
      ctx.effect(() => {
        /** Set once the disposer ran. */
        let disposed = false
        /** Layout store instance once attached. */
        let instance: SidebarWidthLayoutStore | null = null
        /** Last preference observed on the store (px; 0 = collapsed). */
        let lastObservedWidth: number | null = null
        /** Last width this feature wrote/adopted, used to skip duplicate writes. */
        let lastPersisted: number | null = null
        /** Set while this feature writes the store (never captured as a user drag). */
        let applyingRemote = false
        /** Debounced drag width not yet sent. */
        let pendingWidth: number | null = null
        let saveTimer: ReturnType<typeof setTimeout> | null = null
        let retryTimer: ReturnType<typeof setInterval> | null = null
        let syncInFlight = false
        let saveInFlight = false
        let selfCheckRaf = 0
        let selfCheckFrames = 0
        let attachTimers: Array<ReturnType<typeof setTimeout>> = []
        let attachGiveUpTimer: ReturnType<typeof setTimeout> | null = null
        let slotsUnsubscribe: (() => void) | null = null
        let storeUnsubscribe: (() => void) | null = null
        /** Local write generation: async Host responses older than the newest local intent are dropped. */
        let localGeneration = 0
        /** Set when the render-frame self-check proves the attached seat is not the rendered store. */
        let seamUnreachable = false
        /** Consecutive self-check mismatch frames; a transient layout frame must not latch. */
        let selfCheckMismatches = 0

        runtime.attached = false
        runtime.storeWidth = null
        runtime.syncState = 'idle'
        const initialCache = readSidebarWidthCache()
        lastPersisted = initialCache.sidebarWidth
        runtime.desiredWidth = initialCache.sidebarWidth

        /**
         * The durable width this feature wants the sidebar to show.
         * @returns persisted/desired width, or null when unknown.
         */
        const preferenceWidth = (): number | null => {
          if (isValidSidebarWidth(runtime.desiredWidth)) return runtime.desiredWidth
          if (isValidSidebarWidth(lastPersisted)) return lastPersisted
          const cache = readSidebarWidthCache()
          if (isValidSidebarWidth(cache.sidebarWidth)) return cache.sidebarWidth
          // Nothing durable is known yet: the live preference is the only width
          // worth seeding the Host document with.
          return isValidSidebarWidth(lastObservedWidth) ? lastObservedWidth : null
        }

        /**
         * Write one width through the shell's own action (the drag handle's path).
         * @param width - candidate width.
         */
        const applyStoreWidth = (width: number): void => {
          if (instance === null || disposed || seamUnreachable) return
          const clamped = clampSidebarWidth(width)
          if (clamped === null) return
          const current = sidebarWidthStoreValue(instance)
          applyingRemote = true
          try {
            if (current === null || Math.round(current) !== clamped) instance.actions.setSidebar(clamped)
          } catch {
            // A failed write leaves the previous preference in place.
          } finally {
            applyingRemote = false
            localGeneration += 1
            lastObservedWidth = clamped
            runtime.storeWidth = clamped
          }
        }

        /** Re-arm or drop the retry interval from the current sync/cache state. */
        const armRetryInterval = (): void => {
          const cache = readSidebarWidthCache()
          const needsRetry = !disposed && (runtime.syncState !== 'idle' || cache.pending)
          if (needsRetry) {
            if (retryTimer === null) {
              retryTimer = setInterval(() => { void syncSidebarWidth() }, SIDEBAR_WIDTH_SYNC_INTERVAL_MS)
            }
          } else if (retryTimer !== null) {
            clearInterval(retryTimer)
            retryTimer = null
          }
        }

        /**
         * A bounded fetch signal so one stalled request cannot wedge the sync
         * flags until reload.
         * @returns the timeout signal when supported.
         */
        const sidebarWidthFetchSignal = (): AbortSignal | undefined => {
          // Keep the original `typeof === 'object'` capability probe: it also
          // guards an engine where the constructor is a plain object.
          if (typeof AbortSignal === 'object' && AbortSignal !== null) {
            const timeout = (AbortSignal as unknown as { timeout?: unknown }).timeout
            if (typeof timeout === 'function') {
              return (AbortSignal as unknown as { timeout(milliseconds: number): AbortSignal })
                .timeout(SIDEBAR_WIDTH_FETCH_TIMEOUT_MS)
            }
          }
          return undefined
        }

        /**
         * One POST of a local width. Marks the cache pending before the request
         * so a crash/reload still knows the Host may be behind.
         * @param width - positive width inside the range.
         * @returns whether the Host confirmed the write.
         */
        const saveSidebarWidth = async (width: number): Promise<boolean> => {
          if (disposed || seamUnreachable || typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return false
          const clamped = clampSidebarWidth(width)
          if (clamped === null) return false
          const generation = localGeneration
          writeSidebarWidthCache({ sidebarWidth: clamped, pending: true })
          runtime.desiredWidth = clamped
          runtime.syncState = 'pending'
          armRetryInterval()
          saveInFlight = true
          let payload: SidebarWidthPayload | null = null
          try {
            const signal = sidebarWidthFetchSignal()
            const init: SidebarWidthFetchInit = {
              method: 'POST',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ sidebarWidth: clamped }),
              ...(signal === undefined ? {} : { signal })
            }
            const response = await fetch(deps.appUrl(SIDEBAR_WIDTH_ROUTE), init)
            if (response.ok) {
              const body: unknown = await response.json()
              payload = normalizeSidebarWidthPayload(body)
            }
          } catch {
            payload = null
          } finally {
            saveInFlight = false
          }
          // A newer drag/local intent owns the state now: this response is stale,
          // so it must not confirm the width or clear the pending flag.
          if (disposed || generation !== localGeneration) return false
          if (payload !== null && payload.ok) {
            const confirmed = isValidSidebarWidth(payload.sidebarWidth) ? payload.sidebarWidth : clamped
            lastPersisted = confirmed
            runtime.desiredWidth = confirmed
            writeSidebarWidthCache({ sidebarWidth: confirmed, pending: false })
            runtime.syncState = 'idle'
            armRetryInterval()
            return true
          }
          runtime.syncState = 'error'
          armRetryInterval()
          return false
        }

        /**
         * One GET of the Host document.
         * @returns payload, or null on network/protocol failure.
         */
        const fetchSidebarWidth = async (): Promise<SidebarWidthPayload | null> => {
          try {
            const signal = sidebarWidthFetchSignal()
            const init: SidebarWidthFetchInit = {
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { accept: 'application/json' },
              ...(signal === undefined ? {} : { signal })
            }
            const response = await fetch(deps.appUrl(SIDEBAR_WIDTH_ROUTE), init)
            if (!response.ok) return null
            const body: unknown = await response.json()
            const payload = normalizeSidebarWidthPayload(body)
            return payload.ok ? payload : null
          } catch {
            return null
          }
        }

        /** Run one sync pass: finish a pending local write, else read the Host. */
        const syncSidebarWidth = async (): Promise<void> => {
          // A queued debounce or an in-flight write is newer than anything the
          // Host could answer with: never let a read race a local width.
          if (disposed || seamUnreachable || instance === null || syncInFlight || saveInFlight || pendingWidth !== null) return
          const attached = instance
          const generation = localGeneration
          syncInFlight = true
          try {
            const cache = readSidebarWidthCache()
            if (cache.pending && cache.sidebarWidth !== null) {
              await saveSidebarWidth(cache.sidebarWidth)
              return
            }
            const payload = await fetchSidebarWidth()
            // Re-validate after the await: a drag may have landed while the GET
            // was in flight, and that local intent must win over the stale answer.
            if (disposed || seamUnreachable || generation !== localGeneration || pendingWidth !== null || saveInFlight) return
            if (payload === null) {
              runtime.syncState = 'error'
              writeSidebarWidthCache({ sidebarWidth: cache.sidebarWidth, pending: true })
              armRetryInterval()
              return
            }
            if (payload.sidebarWidth !== null) {
              const remote = payload.sidebarWidth
              if (shouldAdoptSidebarWidth({
                currentWidth: sidebarWidthStoreValue(attached),
                remoteWidth: remote,
                dragging: sidebarWidthDragging()
              })) {
                applyStoreWidth(remote)
              }
              lastPersisted = remote
              runtime.desiredWidth = remote
              writeSidebarWidthCache({ sidebarWidth: remote, pending: false })
              runtime.syncState = 'idle'
              armRetryInterval()
              return
            }
            // The Host has no width yet: the first writer seeds the document.
            const local = preferenceWidth()
            if (local !== null) {
              await saveSidebarWidth(local)
              return
            }
            writeSidebarWidthCache({ sidebarWidth: null, pending: false })
            runtime.syncState = 'idle'
            armRetryInterval()
          } finally {
            syncInFlight = false
          }
        }

        /**
         * Debounce one drag result, then persist it.
         * @param width - positive width observed on the store.
         */
        const scheduleSave = (width: number): void => {
          if (disposed || seamUnreachable || typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return
          const clamped = clampSidebarWidth(width)
          if (clamped === null) return
          localGeneration += 1
          pendingWidth = clamped
          runtime.desiredWidth = clamped
          if (saveTimer !== null) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => {
            saveTimer = null
            const target = pendingWidth
            pendingWidth = null
            if (disposed || seamUnreachable || target === null) return
            if (target === lastPersisted && !readSidebarWidthCache().pending) return
            void saveSidebarWidth(target)
          }, SIDEBAR_WIDTH_SAVE_DEBOUNCE_MS)
        }

        /** Capture one store change: drags persist, collapse is ignored, reopen restores. */
        const onStoreChange = (): void => {
          if (disposed || seamUnreachable || instance === null) return
          const width = sidebarWidthStoreValue(instance)
          if (width === null) return
          const previous = lastObservedWidth
          lastObservedWidth = width
          runtime.storeWidth = width
          if (applyingRemote) return
          // Collapsed is a transient UI state, never a preference.
          if (width <= 0) return
          if (previous !== null && previous > 0 && Math.round(previous) === Math.round(width)) return
          if (previous === 0) {
            // Native re-open writes the shell default (280); re-apply the durable
            // preference instead so a collapse/expand cycle keeps the width.
            const restore = sidebarWidthReopenRestore({
              preferenceWidth: preferenceWidth(),
              width,
              dragging: sidebarWidthDragging()
            })
            if (restore !== null) {
              applyStoreWidth(restore)
              runtime.desiredWidth = restore
              void syncSidebarWidth()
              return
            }
          }
          scheduleSave(width)
        }

        /**
         * The sidebar slot outlet anchor, whose parent is the sidebar grid column.
         * @returns the measured column element, or null while unmounted.
         */
        const sidebarWidthColumn = (): Element | null => {
          try {
            if (typeof document !== 'object' || document === null || typeof document.querySelector !== 'function') return null
            const anchor = document.querySelector('[data-slot="sidebar"]')
            return anchor === null ? null : anchor.parentElement
          } catch {
            return null
          }
        }

        /**
         * Whether the shell places the sidebar at half the viewport (folded
         * landscape). The rendered column then legitimately differs from the
         * preference, so the frame self-check must skip that presentation.
         * @returns whether the shell uses the centered presentation.
         */
        const sidebarWidthCentered = (): boolean => {
          try {
            if (typeof matchMedia !== 'function') return false
            return matchMedia('(device-posture: folded) and (orientation: landscape)').matches
          } catch {
            return false
          }
        }

        /**
         * Stop writing once the self-check proves the attached store is not the
         * one the frame renders: the probe reports `attached: false`, the E2E
         * fails loudly, and the shell keeps its in-memory behavior instead of the
         * feature writing into a detached store.
         */
        const markSeamUnreachable = (): void => {
          seamUnreachable = true
          runtime.attached = false
          pendingWidth = null
          if (saveTimer !== null) {
            clearTimeout(saveTimer)
            saveTimer = null
          }
          if (retryTimer !== null) {
            clearInterval(retryTimer)
            retryTimer = null
          }
        }

        /**
         * Dev guard: after the first apply, verify the rendered column matches
         * the applied preference. A confirmed mismatch (not a transient layout
         * frame, not the folded-landscape centered presentation, not a collapse)
         * marks the seam unreachable so the E2E fails loudly instead of silently
         * rendering the wrong width.
         */
        const scheduleSelfCheck = (): void => {
          if (typeof window !== 'object' || window === null || typeof window.requestAnimationFrame !== 'function') return
          selfCheckFrames = 0
          selfCheckMismatches = 0
          const step = (): void => {
            selfCheckRaf = 0
            if (disposed || instance === null || seamUnreachable) return
            selfCheckFrames += 1
            const preference = sidebarWidthStoreValue(instance)
            const viewport = typeof window.innerWidth === 'number' ? window.innerWidth : 0
            const column = sidebarWidthColumn()
            if (column !== null && preference !== null
              && preference > 0 && viewport >= SIDEBAR_WIDTH_CHECK_VIEWPORT_MIN
              && !sidebarWidthDragging() && !sidebarWidthCentered()) {
              const measured = Math.round(column.getBoundingClientRect().width)
              if (Math.abs(measured - Math.round(preference)) <= 1) {
                selfCheckMismatches = 0
                return
              }
              selfCheckMismatches += 1
              if (selfCheckMismatches >= SIDEBAR_WIDTH_SELF_CHECK_LIMIT) {
                markSeamUnreachable()
                return
              }
              selfCheckRaf = window.requestAnimationFrame(step)
              return
            }
            // The frame may not have rendered yet; retry for ~2 s, then stop silently.
            if (selfCheckFrames < 120) selfCheckRaf = window.requestAnimationFrame(step)
          }
          selfCheckRaf = window.requestAnimationFrame(step)
        }

        /** Read the fresh cache, re-apply the boot width, and start syncing. */
        const onAttached = (): void => {
          if (instance === null) return
          runtime.attached = true
          lastObservedWidth = sidebarWidthStoreValue(instance)
          runtime.storeWidth = lastObservedWidth
          const cache = readSidebarWidthCache()
          lastPersisted = cache.sidebarWidth
          if (isValidSidebarWidth(cache.sidebarWidth)) runtime.desiredWidth = cache.sidebarWidth
          const boot = sidebarWidthBootstrap({
            cacheWidth: cache.sidebarWidth,
            currentWidth: lastObservedWidth,
            dragging: sidebarWidthDragging()
          })
          if (boot.apply !== null) applyStoreWidth(boot.apply)
          storeUnsubscribe = typeof instance.subscribe === 'function'
            ? instance.subscribe(() => onStoreChange())
            : null
          scheduleSelfCheck()
          void syncSidebarWidth()
        }

        /** Release the attachment watchers (slot subscription + retry timers). */
        const stopAttachWatchers = (): void => {
          for (const timer of attachTimers) clearTimeout(timer)
          attachTimers = []
          if (attachGiveUpTimer !== null) {
            clearTimeout(attachGiveUpTimer)
            attachGiveUpTimer = null
          }
          if (slotsUnsubscribe !== null) {
            try {
              slotsUnsubscribe()
            } catch {
              // A failing unsubscribe must not wedge the disposer.
            }
            slotsUnsubscribe = null
          }
        }

        /** Try once to reach the layout store; arm retries when it is not there yet. */
        const attach = (): void => {
          if (disposed || instance !== null) return
          const found = sidebarWidthLayoutStore(ctx)
          if (found === null) return
          instance = found
          stopAttachWatchers()
          onAttached()
        }

        /** Arm the retry watchers for a layout store that loads after this plugin. */
        const armAttachWatchers = (): void => {
          try {
            slotsUnsubscribe = typeof ctx.slots.subscribe === 'function' ? ctx.slots.subscribe('root', () => attach()) : null
          } catch {
            slotsUnsubscribe = null
          }
          for (const delay of SIDEBAR_WIDTH_ATTACH_DELAYS_MS) {
            attachTimers.push(setTimeout(() => attach(), delay))
          }
          attachGiveUpTimer = setTimeout(() => {
            attachGiveUpTimer = null
            if (instance !== null) return
            // No seat: stay inert (no cache writes, no network), report through probe().
            stopAttachWatchers()
          }, SIDEBAR_WIDTH_ATTACH_GIVE_UP_MS)
        }

        const onFocus = (): void => { void syncSidebarWidth() }
        const onVisibility = (): void => {
          let state = 'visible'
          try {
            state = typeof document === 'object' && document !== null ? String(document.visibilityState) : 'visible'
          } catch {
            state = 'visible'
          }
          if (state !== 'hidden') void syncSidebarWidth()
        }

        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisibility)
        attach()
        if (instance === null) armAttachWatchers()

        return () => {
          disposed = true
          stopAttachWatchers()
          if (saveTimer !== null) clearTimeout(saveTimer)
          saveTimer = null
          if (retryTimer !== null) clearInterval(retryTimer)
          retryTimer = null
          if (selfCheckRaf !== 0) {
            try {
              window.cancelAnimationFrame(selfCheckRaf)
            } catch {
              // Ignore a missing frame handle.
            }
            selfCheckRaf = 0
          }
          if (storeUnsubscribe !== null) {
            try {
              storeUnsubscribe()
            } catch {
              // A failing unsubscribe must not wedge the disposer.
            }
            storeUnsubscribe = null
          }
          window.removeEventListener('focus', onFocus)
          document.removeEventListener('visibilitychange', onVisibility)
          instance = null
          runtime.attached = false
          runtime.syncState = 'idle'
        }
      }, 'power-suite: sidebar width persistence')
    },

    probe(): SidebarWidthProbe {
      return {
        attached: runtime.attached === true,
        storeWidth: runtime.storeWidth,
        desiredWidth: runtime.desiredWidth,
        syncState: runtime.syncState,
        cache: readSidebarWidthCache()
      }
    }
  }
}
