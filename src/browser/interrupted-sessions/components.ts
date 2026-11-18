/**
 * Interrupted-session browser components.
 *
 * The two shell seats and their installer live here, out of `src/client.js`:
 *
 * - `InterruptedBadge` is the always-visible mark in a Session row's leading
 *   seat, plus the hover Continue CTA;
 * - `InterruptedContinueSeat` is the renderless composer seat that turns the
 *   submit control into a play control and runs the continuation;
 * - `installInterruptedSessions` registers the dictionaries, the row decoration
 *   observer, the refresh cues, the SSE stream, the implicit-continuation row
 *   hider, the stylesheet and both seats.
 *
 * The store, the handshake boxes and the Host readers stay in the entry; the
 * installer receives them as explicit dependencies and the components read the
 * same objects by reference, so all state transitions keep their single owner.
 *
 * @module
 */

import type { ReactElement } from 'react'
import { interruptedIndicatorActive } from './model.ts'
import type { InterruptedRecord } from './model.ts'

/** Namespace-bound translate seat used by the seats. */
export type InterruptedTranslate = (key: string) => string

/** One shell input-controller snapshot the composer seat selects from. */
export interface InterruptedInputState {
  draft: string
  phase: string
  [key: string]: unknown
}

/** The shell's `useInput` standard hook. */
export type InterruptedUseInput = <T>(selector: (state: InterruptedInputState) => T) => T

/** Composer input actions the seat calls. */
export interface InterruptedInputActions {
  notify?: (kind: string, message: string) => void
}

/** Props the shell hands the row-leading badge seat. */
export interface InterruptedBadgeProps {
  sessionId: string
  t: InterruptedTranslate
  [key: string]: unknown
}

/** Props the shell hands the composer overlay seat. */
export interface InterruptedContinueSeatProps {
  sessionId: string
  useInput: InterruptedUseInput
  inputActions: InterruptedInputActions
  t: InterruptedTranslate
  [key: string]: unknown
}

/** One mounted composer's continue handler. */
export interface ContinueRuntimeSeat {
  sessionId: string
  interrupted: boolean
  run: () => boolean
}

/** Handshake box published by the mounted composer seat. */
export interface ContinueRuntimeBox {
  current: ContinueRuntimeSeat | null
  pending: boolean
}

/** Request a freshly opened Conversation should continue. */
export interface ContinueRequest {
  sessionId: string
  at: number
}

/** Pending-request box read by the composer seat. */
export interface ContinueRequestBox {
  pending: ContinueRequest | null
}

/** Shared interruption store slices the installer observes. */
export interface InterruptedStoreView {
  records: Map<string, InterruptedRecord>
  watchers: Map<string, number>
}

/** Services and timestamps captured by the entry for row actions and DOM decoration. */
export interface InterruptedRuntime {
  uiWorkspace: DshUiWorkspaceService | null
  t: InterruptedTranslate | null
  hideContinuationRows: (() => void) | null
  continueTimes: number[]
}

/** Stable seats and cross-region helpers the browser entry owns. */
export interface InterruptedSessionComponentsDeps {
  React: typeof import('react')
  RemixIcon: (props: { path: string, size?: number }) => unknown
  remixWarningFill: string
  remixPlayFill: string
  requestContinue: (sessionId: string) => void
  useInterruptedRecord: (sessionId: string, autoFetch?: boolean) => InterruptedRecord | null
  escapeSelectorValue: (value: string) => string
  appUrl: (relative: string) => string
  continueRoute: string
  rememberContinueTime: (at: number) => void
  markContinued: (sessionId: string) => void
  refreshInterrupted: (sessionId: string) => void
  subscribeInterrupted: (listener: () => void) => () => void
  discoverInterruptedRows: () => void
  syncInterruptedRows: () => void
  refreshAllInterrupted: () => void
  loadContinueTimes: () => number[]
  interruptedNamespace: string
  interruptedEn: Record<string, string>
  interruptedZh: Record<string, string>
  interruptedCss: string
  interruptedEventsRoute: string
  interruptedStore: InterruptedStoreView
  interruptedRuntime: InterruptedRuntime
  continueRequest: ContinueRequestBox
  continueRuntime: ContinueRuntimeBox
}

/** Mutation records read by the row decoration observer. */
interface InterruptedMutationRecord {
  readonly target: object
  readonly addedNodes: ArrayLike<object>
}

/** Props of the `sidebar.session.row.leading` seat. */
type BadgeComponent = (props: InterruptedBadgeProps) => ReactElement | null

/** Props of the `conversation.input.overlay` seat. */
type ContinueSeatComponent = (props: InterruptedContinueSeatProps) => null

/** One slot registration descriptor. */
interface InterruptedSlotRegistration {
  name: string
  id?: string
  order?: number
  inject?: () => Record<string, unknown>
}

/** The narrow client root context slice this installer reads. */
export interface InterruptedSessionComponentsContext {
  effect(setup: () => (() => void) | void, label?: string): void
  locale: {
    bind(namespace: string): InterruptedTranslate
    register(namespace: string, dictionaries: { en: Record<string, string>, zh: Record<string, string> }): () => void
  }
  on(event: string, listener: (...args: unknown[]) => void): () => void
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(registration: InterruptedSlotRegistration, component: BadgeComponent): () => void
    register(registration: InterruptedSlotRegistration, component: ContinueSeatComponent): () => void
  }
  uiWorkspace: DshUiWorkspaceService
}

/** The seats and their installer, bound to one entry instance. */
export interface InterruptedSessionComponentsInstaller {
  InterruptedBadge: BadgeComponent
  InterruptedContinueSeat: ContinueSeatComponent
  installInterruptedSessions(ctx: InterruptedSessionComponentsContext): void
}

/** Latest render inputs read by the seat's event callbacks. */
interface ContinueLatest {
  sessionId: string
  draft: string
  phase: string
  interrupted: boolean
  inputActions: InterruptedInputActions
  t: InterruptedTranslate
}

/**
 * Create the interrupted-session seats for one plugin instance.
 * @param deps - the React runtime, the shared store/handshake seats and helpers.
 * @returns both seats and their installer.
 */
export function createInterruptedSessionComponents(
  deps: InterruptedSessionComponentsDeps
): InterruptedSessionComponentsInstaller {
  const {
    React,
    RemixIcon,
    remixWarningFill,
    remixPlayFill,
    requestContinue,
    useInterruptedRecord,
    escapeSelectorValue,
    appUrl,
    continueRoute,
    rememberContinueTime,
    markContinued,
    refreshInterrupted,
    subscribeInterrupted,
    discoverInterruptedRows,
    syncInterruptedRows,
    refreshAllInterrupted,
    loadContinueTimes,
    interruptedNamespace,
    interruptedEn,
    interruptedZh,
    interruptedCss,
    interruptedEventsRoute,
    interruptedStore,
    interruptedRuntime,
    continueRequest,
    continueRuntime
  } = deps

  /**
   * Always-visible interruption mark in a Session row's leading seat: the cell
   * left of the title, where an idle row shows its status dot.
   * @param props - row seat props plus the injected locale seat.
   * @returns the mark, when the Session was interrupted.
   */
  function InterruptedBadge(props: InterruptedBadgeProps): ReactElement | null {
    const { sessionId, t } = props
    const record = useInterruptedRecord(sessionId)
    const interrupted = interruptedIndicatorActive(record)
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
    const badgeTitle = record?.subagent === true ? t('badge.title.subagent') : t('badge.title')
    return React.createElement(React.Fragment, null,
      React.createElement('span', {
        className: 'dps-row-interrupted',
        role: 'img',
        'aria-label': t('badge.aria'),
        title: badgeTitle
      }, React.createElement(RemixIcon, { path: remixWarningFill, size: 14 })),
      React.createElement('span', { className: 'dps-row-continue-slot' },
        React.createElement('button', {
          type: 'button',
          className: 'dps-row-continue',
          title: t('continue.aria'),
          'aria-label': t('continue.aria'),
          onClick: (event: Event) => {
            event.preventDefault()
            event.stopPropagation()
            requestContinue(sessionId)
          }
        }, React.createElement(RemixIcon, { path: remixPlayFill, size: 14 }))))
  }

  /**
   * Renderless composer seat owning the interrupted-session affordance for the
   * open Conversation: mark the shell, turn the submit control into a play
   * control, and run the continue action from a row CTA, a pending request, or
   * the play control itself.
   * @param props - overlay seat props plus the injected locale seat.
   * @returns this seat renders nothing.
   */
  function InterruptedContinueSeat(props: InterruptedContinueSeatProps): null {
    const { sessionId, useInput, inputActions, t } = props
    const draft = useInput((state) => state.draft)
    const phase = useInput((state) => state.phase)
    const record = useInterruptedRecord(sessionId, true)
    const interrupted = interruptedIndicatorActive(record)
    const latest = React.useRef<ContinueLatest>({ sessionId, draft, phase, interrupted, inputActions, t })
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
      fetch(appUrl(continueRoute), {
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
        markContinued(target)
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
      const primary = button instanceof HTMLButtonElement ? button : null
      const apply = () => {
        if (primary === null) return
        if (primary.disabled) primary.disabled = false
        if (primary.getAttribute('aria-label') !== t('continue.aria')) primary.setAttribute('aria-label', t('continue.aria'))
        if (primary.getAttribute('title') !== t('continue.aria')) primary.title = t('continue.aria')
      }
      apply()
      const observer = primary === null ? null : new MutationObserver(apply)
      if (observer !== null && primary !== null) observer.observe(primary, { attributes: true, attributeFilter: ['disabled', 'aria-label', 'title'] })
      const onClick = (event: Event) => {
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
   * @param ctx - client root context.
   * @returns void
   */
  function installInterruptedSessions(ctx: InterruptedSessionComponentsContext): void {
    const t = ctx.locale.bind(interruptedNamespace)
    interruptedRuntime.uiWorkspace = ctx.uiWorkspace
    interruptedRuntime.t = t
    interruptedRuntime.continueTimes = loadContinueTimes()
    ctx.effect(() => ctx.locale.register(interruptedNamespace, { en: interruptedEn, zh: interruptedZh }), 'power-suite: interrupted dictionaries')
    ctx.effect(() => {
      let timer: number | null = null
      const schedule = () => {
        if (timer !== null) return
        timer = window.setTimeout(() => {
          timer = null
          discoverInterruptedRows()
          syncInterruptedRows()
        }, 80)
      }
      const touchesSessionRow = (records: readonly InterruptedMutationRecord[]): boolean => records.some((record) => {
        const target = record.target
        if (target instanceof Element && target.closest('[data-row-key^="session:"]') !== null) return true
        for (let index = 0; index < record.addedNodes.length; index += 1) {
          const node = record.addedNodes[index]
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
      let source: EventSource | null = null
      try {
        source = new EventSource(appUrl(interruptedEventsRoute), { withCredentials: true })
      } catch {
        return undefined
      }
      const stream = source
      const onOpen = () => refreshAllInterrupted()
      const onInterrupted = (message: { readonly data?: unknown }) => {
        let payload: unknown = null
        try {
          payload = JSON.parse(typeof message?.data === 'string' ? message.data : '')
        } catch {
          return
        }
        if (payload === null || typeof payload !== 'object') return
        const record = payload as Record<string, unknown>
        const candidates = [record.sessionId, record.parentSession]
        for (const sessionId of candidates) {
          if (typeof sessionId !== 'string' || sessionId.length === 0) continue
          if (interruptedStore.watchers.has(sessionId) || interruptedStore.records.has(sessionId)) {
            refreshInterrupted(sessionId)
          }
        }
      }
      stream.addEventListener('open', onOpen)
      stream.addEventListener('interrupted', onInterrupted)
      return () => {
        stream.removeEventListener('open', onOpen)
        stream.removeEventListener('interrupted', onInterrupted)
        stream.close()
      }
    }, 'power-suite: interrupted SSE stream')
    ctx.effect(() => {
      /**
       * The injected context producer renders as a native ContextInjectionRow.
       * Its source label is the element text; `data-context-source` itself is a
       * boolean marker. Hide the smallest ancestor that contains both the label
       * and the injection body, without depending on hashed CSS-module classes.
       * @param source - the `[data-context-source]` element.
       * @returns void
       */
      const hideOne = (source: Element): void => {
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
      const hideOneTrigger = (section: Element): void => {
        const time = section.querySelector('time[datetime]')
        const at = time === null ? Number.NaN : Date.parse(time.getAttribute('datetime') ?? '')
        if (Number.isNaN(at) || !(section instanceof HTMLElement)) return
        // A continuation starts immediately after its request; hide only the
        // turn-trigger card correlated with one of our recent requests.
        if (interruptedRuntime.continueTimes.some((sentAt) => at >= sentAt - 1500 && at <= sentAt + 20000)) {
          section.style.display = 'none'
        }
      }
      const hideIn = (node: unknown): void => {
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
          for (let index = 0; index < record.addedNodes.length; index += 1) hideIn(record.addedNodes[index])
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
      tag.textContent = interruptedCss
      document.head.appendChild(tag)
      return () => tag.remove()
    }, 'power-suite: interrupted styles')
    ctx.effect(() => ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register({
      name: 'sidebar.session.row.leading',
      id: 'power-suite.interrupted-badge',
      order: 20,
      inject: () => ({ t })
    }, InterruptedBadge)), 'power-suite: interrupted badge')
    ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
      name: 'conversation.input.overlay',
      id: 'power-suite.interrupted-continue-seat',
      order: 30,
      inject: () => ({ t })
    }, InterruptedContinueSeat)), 'power-suite: interrupted continue seat')
  }

  return { InterruptedBadge, InterruptedContinueSeat, installInterruptedSessions }
}
