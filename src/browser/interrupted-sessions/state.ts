/**
 * Interrupted-session browser state, handshake and row decoration.
 *
 * The shared record store bounds Host reads to two at a time, watches the
 * Sessions a mounted component shows, and publishes one version counter to
 * every subscriber. The handshake boxes carry a row CTA's Continue request to
 * the renderless composer seat; the decorator keeps native sidebar rows in
 * sync with the Host for rows the shell still renders as running.
 *
 * This code used to sit inline in `src/client.js` and is now typed, with the
 * same storage key, DOM markers, class names, polling and SSE behavior.
 *
 * @module
 */

import type { MutableRefObject } from 'react'
import { ROUTES, browserRoute } from '../../shared/routes.ts'
import { REMIX_PLAY_FILL, REMIX_WARNING_FILL } from './icons.ts'
import { interruptedIndicatorActive } from './model.ts'
import type { InterruptedRecord } from './model.ts'
import type {
  ContinueRequestBox,
  ContinueRuntimeBox,
  InterruptedRuntime,
  InterruptedTranslate
} from './components.ts'

/** One stored record: the Host fields plus this browser's observation time. */
export interface InterruptedStateRecord extends InterruptedRecord {
  at?: number
}

/** One queued Host read. */
interface InterruptedJob {
  sessionId: string
  force: boolean
  refreshHost: boolean
}

/** The shared store, including the queue internals the browser owns. */
export interface InterruptedStore {
  records: Map<string, InterruptedStateRecord>
  listeners: Set<() => void>
  watchers: Map<string, number>
  pollTimer: number | null
  version: number
  queue: InterruptedJob[]
  active: number
  maxActive: number
  inflight: Set<string>
}

/** Options one Host read accepts. */
export interface EnsureInterruptedOptions {
  /** Force a read even when a record is cached. */
  force?: boolean
  /** Ask the Host to recompute the record. */
  refreshHost?: boolean
}

/** A keydown-independent click event on a decorated row control. */
interface InterruptedDecorEvent {
  preventDefault(): void
  stopPropagation(): void
}

/** The CSS escaper the browser may expose. */
interface InterruptedCss {
  escape?(value: string): string
}

/** Dependencies the state reads at creation time. */
export interface InterruptedStateDeps {
  React: typeof import('react')
  appUrl(relative: string): string
}

/** Everything the entry, the components installer and the Workspace card share. */
export interface InterruptedState {
  interruptedStore: InterruptedStore
  interruptedRuntime: InterruptedRuntime
  continueRequest: ContinueRequestBox
  continueRuntime: ContinueRuntimeBox
  interruptedVersion(): number
  subscribeInterrupted(listener: () => void): () => void
  setInterruptedRecord(sessionId: string, record: InterruptedStateRecord | null): void
  interruptedRecord(sessionId: string): InterruptedStateRecord | null
  ensureInterrupted(sessionId: string, options?: EnsureInterruptedOptions): void
  markInterrupted(sessionId: string, interrupted: boolean): void
  markContinued(sessionId: string): void
  refreshInterrupted(sessionId: string): void
  refreshAllInterrupted(): void
  watchInterrupted(sessionId: string): () => void
  useInterruptedRecord(sessionId: string, autoFetch?: boolean): InterruptedRecord | null
  loadContinueTimes(): number[]
  rememberContinueTime(at: number): void
  requestContinue(sessionId: string): void
  escapeSelectorValue(value: string): string
  discoverInterruptedRows(): void
  syncInterruptedRows(): void
}

/** Host route reporting one Session's last-turn state. */
export const INTERRUPTED_ROUTE = browserRoute(ROUTES.interrupted)

/** Host SSE route broadcasting turn-boundary interruptions. */
export const INTERRUPTED_EVENTS_ROUTE = browserRoute(ROUTES.interruptedEvents)

/** Host route resuming one Session through a non-human context message. */
export const CONTINUE_ROUTE = browserRoute(ROUTES.continue)

/** localStorage key: when this browser sent an implicit continuation. */
const CONTINUE_TIMES_KEY = 'dsh-power-suite.continue-times'

/** Narrow an untrusted value to a JSON object. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

/**
 * Create the interrupted-session state for one plugin instance.
 * @param deps - React runtime and the app URL builder.
 * @returns the store, handshake boxes, readers and decorators.
 */
export function createInterruptedState(deps: InterruptedStateDeps): InterruptedState {
  const { React, appUrl } = deps

  /**
   * Escape one value for an attribute selector.
   * @param value - raw value.
   * @returns selector-safe text.
   */
  function escapeSelectorValue(value: string): string {
    const platformCss = (globalThis as unknown as { CSS?: InterruptedCss }).CSS
    if (typeof platformCss === 'object' && platformCss !== null && typeof platformCss.escape === 'function') {
      return platformCss.escape(value)
    }
    return String(value).replace(/["\\]/g, '\\$&')
  }

  /**
   * Browser-facing interruption state, shared by row badges, the row CTA, and
   * the composer seat. Reads run two at a time so one sidebar pass never floods
   * the Host with log reads.
   */
  const interruptedStore: InterruptedStore = {
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
   * @returns current version.
   */
  function interruptedVersion(): number {
    return interruptedStore.version
  }

  /**
   * Subscribe to interruption-state changes.
   * @param listener - change callback.
   * @returns unsubscribe.
   */
  function subscribeInterrupted(listener: () => void): () => void {
    interruptedStore.listeners.add(listener)
    return () => {
      interruptedStore.listeners.delete(listener)
    }
  }

  /**
   * Publish one store change.
   * @returns void
   */
  function notifyInterrupted(): void {
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
   * @param sessionId - Session identity.
   * @param record - next record.
   * @returns void
   */
  function setInterruptedRecord(sessionId: string, record: InterruptedStateRecord | null): void {
    if (record === null) interruptedStore.records.delete(sessionId)
    else interruptedStore.records.set(sessionId, { ...record, at: Date.now() })
    notifyInterrupted()
  }

  /**
   * Read one cached Session record.
   * @param sessionId - Session identity.
   * @returns the record, when known.
   */
  function interruptedRecord(sessionId: string): InterruptedStateRecord | null {
    return interruptedStore.records.get(sessionId) ?? null
  }

  /**
   * Queue one Host read unless the Session is already known or loading.
   * @param sessionId - Session identity.
   * @param options - force bypasses the cache; refreshHost asks the Host to recompute.
   * @returns void
   */
  function ensureInterrupted(sessionId: string, options: EnsureInterruptedOptions = {}): void {
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
   * @returns void
   */
  function drainInterruptedQueue(): void {
    while (interruptedStore.active < interruptedStore.maxActive && interruptedStore.queue.length > 0) {
      const job = interruptedStore.queue.shift()
      if (job === undefined) return
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
   * @param sessionId - Session identity.
   * @param force - ask the Host to bypass its cache.
   * @param refreshHost - also send `refresh=1` when forced.
   * @returns resolves after the record lands.
   */
  async function loadInterrupted(sessionId: string, force: boolean, refreshHost: boolean): Promise<void> {
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
      const payload = asRecord(await response.json())
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
   * @param sessionId - Session identity.
   * @param interrupted - next interruption flag.
   * @returns void
   */
  function markInterrupted(sessionId: string, interrupted: boolean): void {
    const existing = interruptedRecord(sessionId) ?? {}
    setInterruptedRecord(sessionId, { ...existing, status: 'ready', interrupted })
  }

  /**
   * Optimistically settle the record right after a Continue request succeeds:
   * the interruption is being resumed, so the badge/CTA disappears and the row
   * is running until the Host's next answer reconciles the record.
   * @param sessionId - Session identity.
   * @returns void
   */
  function markContinued(sessionId: string): void {
    const existing = interruptedRecord(sessionId) ?? {}
    setInterruptedRecord(sessionId, { ...existing, status: 'ready', interrupted: false, running: true })
  }

  /**
   * Ask the Host to recompute one record.
   * @param sessionId - Session identity.
   * @returns void
   */
  function refreshInterrupted(sessionId: string): void {
    ensureInterrupted(sessionId, { force: true, refreshHost: false })
  }

  /**
   * Refresh every Session already known to the browser. After a reconnect the
   * previous records can all be stale, including rows that are not mounted.
   * @returns void
   */
  function refreshAllInterrupted(): void {
    const ids = new Set([...interruptedStore.watchers.keys(), ...interruptedStore.records.keys()])
    for (const sessionId of ids) {
      ensureInterrupted(sessionId, { force: true, refreshHost: false })
    }
  }

  /**
   * Start or stop the shared poll as watched Sessions come and go.
   * @returns void
   */
  function ensureInterruptedPolling(): void {
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
   * @param sessionId - Session identity.
   * @returns unwatch.
   */
  function watchInterrupted(sessionId: string): () => void {
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
   * @param sessionId - Session identity.
   * @param autoFetch - whether the first mount asks the Host.
   * @returns the record.
   */
  function useInterruptedRecord(sessionId: string, autoFetch = true): InterruptedRecord | null {
    React.useSyncExternalStore(subscribeInterrupted, interruptedVersion, interruptedVersion)
    React.useEffect(() => {
      if (!autoFetch) return undefined
      ensureInterrupted(sessionId)
      return watchInterrupted(sessionId)
    }, [sessionId, autoFetch])
    return interruptedRecord(sessionId)
  }

  /** Pending request that a freshly opened Conversation should continue. */
  const continueRequest: ContinueRequestBox = { pending: null }

  /** The mounted composer's continue handler, if a Conversation is open. */
  const continueRuntime: ContinueRuntimeBox = { current: null, pending: false }

  /** Services captured at install time for row actions and DOM decoration. */
  const interruptedRuntime: InterruptedRuntime = { uiWorkspace: null, t: null, hideContinuationRows: null, continueTimes: [] }

  /**
   * Read the recent implicit-continuation timestamps.
   * @returns epoch milliseconds, pruned to the last ten minutes.
   */
  function loadContinueTimes(): number[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(CONTINUE_TIMES_KEY) ?? '[]')
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
   * @param at - epoch milliseconds when the request was sent.
   * @returns void
   */
  function rememberContinueTime(at: number): void {
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
   * first; the renderless composer seat observes the pending request and sends
   * the continuation once the Session is open and idle.
   * @param sessionId - Session identity.
   * @returns void
   */
  function requestContinue(sessionId: string): void {
    const runtime = continueRuntime.current
    if (runtime !== null && runtime.sessionId === sessionId) {
      runtime.run()
      return
    }
    continueRequest.pending = { sessionId, at: Date.now() }
    const ui = interruptedRuntime.uiWorkspace
    if (ui !== null && typeof ui.openSession === 'function') ui.openSession(sessionId)
  }

  /**
   * Build one standalone inline Remix icon for dynamically decorated rows
   * (the same 14 px markup the React slot path renders).
   * @param path - Remix icon path data.
   * @returns the icon.
   */
  function interruptedDecorIcon(path: string): Element {
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
   * Build the dynamic Continue CTA for a native row the shell still renders as
   * running.
   *
   * It mirrors the `InterruptedBadge` slot markup (`span.dps-row-continue-slot`
   * around `button.dps-row-continue`) so the existing reveal CSS applies on
   * both paths, and its click goes through the shared requestContinue
   * handshake: this decoration never sends a continuation itself.
   * @param t - interrupted-feature translate.
   * @param sessionId - Session identity.
   * @returns the Continue slot.
   */
  function interruptedDecorContinueSlot(t: InterruptedTranslate, sessionId: string): HTMLElement {
    const slot = document.createElement('span')
    slot.className = 'dps-row-continue-slot'
    slot.setAttribute('data-dynamic-continue', 'true')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'dps-row-continue'
    button.title = t('continue.aria')
    button.setAttribute('aria-label', t('continue.aria'))
    button.appendChild(interruptedDecorIcon(REMIX_PLAY_FILL))
    button.addEventListener('click', (event: InterruptedDecorEvent) => {
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
   * @returns void
   */
  function discoverInterruptedRows(): void {
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
   * Continue CTA in that native leading span and hides the stale spinner.
   * @returns void
   */
  function syncInterruptedRows(): void {
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
      // leftovers from an earlier running render.
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
        badge.appendChild(interruptedDecorIcon(REMIX_WARNING_FILL))
        leading.insertBefore(badge, leading.firstChild)
      }
      for (const duplicate of leading.querySelectorAll('.dps-row-interrupted[data-dynamic-badge="true"]')) {
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
      for (const duplicate of leading.querySelectorAll('.dps-row-continue-slot[data-dynamic-continue="true"]')) {
        if (duplicate !== slot) duplicate.remove()
      }
      const button = slot.querySelector('.dps-row-continue')
      if (button instanceof HTMLElement) {
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

  return {
    interruptedStore,
    interruptedRuntime,
    continueRequest,
    continueRuntime,
    interruptedVersion,
    subscribeInterrupted,
    setInterruptedRecord,
    interruptedRecord,
    ensureInterrupted,
    markInterrupted,
    markContinued,
    refreshInterrupted,
    refreshAllInterrupted,
    watchInterrupted,
    useInterruptedRecord,
    loadContinueTimes,
    rememberContinueTime,
    requestContinue,
    escapeSelectorValue,
    discoverInterruptedRows,
    syncInterruptedRows
  }
}
