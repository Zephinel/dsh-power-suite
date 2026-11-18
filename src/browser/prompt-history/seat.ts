/**
 * Prompt-history keyboard seat and Host reader.
 *
 * An invisible Session-scoped composer seat turns the configured
 * primary-modifier Up/Down into navigation through the prompts already sent in
 * that Session, shell style. Plain arrows keep their caret behavior; a recalled
 * multi-line prompt is skipped as one history entry; any edit or submit leaves
 * browsing. The list comes from the Host, not from the loaded chat window, so
 * earlier pages are recallable too.
 *
 * The seat, its keydown capture, the Host reader and its installer used to sit
 * inline in `src/client.js`. The settings modifier is read from the shared
 * store. Slot id/order and behavior are unchanged.
 *
 * @module
 */

import type { MutableRefObject, ReactElement } from 'react'
import { ROUTES, browserRoute } from '../../shared/routes.ts'
import type { PromptHistoryEntry } from './preview.ts'
import type { SettingsStore } from '../settings/store.ts'

/** Seat identity of the composer overlay registration. */
const PROMPT_HISTORY_SEAT = 'power-suite.prompt-history'

/** Host route returning one Session's complete sent-prompt history. */
const PROMPT_HISTORY_ROUTE = browserRoute(ROUTES.promptHistoryList)

/** One shell input-controller snapshot the seat selects from. */
export interface PromptHistorySeatInputState {
  draft: string
  phase: string
  [key: string]: unknown
}

/** The shell's `useInput` standard hook. */
export type PromptHistorySeatUseInput = <T>(selector: (state: PromptHistorySeatInputState) => T) => T

/** Composer input actions the seat calls. */
export interface PromptHistorySeatInputActions {
  setDraft(text: string): void
}

/** Props the shell hands the composer overlay seat. */
export interface PromptHistorySeatProps {
  sessionId: string
  useInput: PromptHistorySeatUseInput
  inputActions: PromptHistorySeatInputActions
  [key: string]: unknown
}

/** A keydown captured on the document. */
interface PromptHistoryKeyEvent {
  readonly defaultPrevented: boolean
  readonly isComposing?: boolean
  readonly key: string
  readonly target: unknown
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  preventDefault(): void
  stopPropagation(): void
}

/** An element-like target: only `closest`/`getAttribute` are read. */
interface PromptHistoryElement {
  closest(selector: string): PromptHistoryElement | null
  getAttribute(name: string): string | null
}

/** Browsing position over the loaded prompt list. */
interface PromptHistoryBrowsing {
  index: number | null
  saved: string
  recalled: string | null
}

/** Per-Session prompt cache owned by the seat. */
interface PromptHistoryCache {
  prompts: string[]
  ready: boolean
  loading: Promise<string[]> | null
  sessionId: string | null
  generation: number
}

/** The narrow client-root context slice the installer reads. */
export interface PromptHistorySeatContext {
  effect(setup: () => (() => void) | void, label?: string): void
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(
      registration: { name: string, id: string, order: number },
      component: (props: PromptHistorySeatProps) => ReactElement | null
    ): () => void
  }
}

/** Runtime modules and cross-feature seats the seat closes over. */
export interface PromptHistorySeatDeps {
  React: typeof import('react')
  appUrl(relative: string): string
  settings: Pick<SettingsStore, 'current' | 'matchesHistoryModifier'>
}

/** The seat component and its installer. */
export interface PromptHistorySeatModule {
  PromptHistorySeat: (props: PromptHistorySeatProps) => ReactElement | null
  installPromptHistory(ctx: PromptHistorySeatContext): void
  /** Host reader reused by the composer-docked preview. */
  readPromptHistoryEntries(sessionId: string): Promise<PromptHistoryEntry[]>
}

/** A loose JSON object. */
type JsonRecord = Record<string, unknown>

/** Narrow an untrusted value to a JSON object. */
function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null ? value as JsonRecord : null
}

/** Narrow an event target to the element surface the handler reads. */
function asPromptHistoryElement(value: unknown): PromptHistoryElement | null {
  const record = asRecord(value)
  if (record === null) return null
  const closest = record.closest
  if (typeof closest !== 'function') return null
  return value as PromptHistoryElement
}

/** Whether a composer menu or listbox owns arrow keys right now. */
function arrowMenuOpen(): boolean {
  return document.querySelector('[data-trigger-menu], [role="listbox"], [role="menu"]') !== null
}

/**
 * Create the prompt-history seat and installer.
 * @param deps - React runtime, app URL builder and the shared settings store.
 * @returns the seat and its registration entry point.
 */
export function createPromptHistorySeat(deps: PromptHistorySeatDeps): PromptHistorySeatModule {
  const { React, appUrl, settings } = deps

  /**
   * Read one Session's prompt history entries from the Host.
   * @param sessionId - Session identity.
   * @returns prompts oldest first; empty on failure.
   */
  async function readPromptHistoryEntries(sessionId: string): Promise<PromptHistoryEntry[]> {
    try {
      const response = await fetch(`${appUrl(PROMPT_HISTORY_ROUTE)}?sessionId=${encodeURIComponent(sessionId)}`, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
      if (!response.ok) return []
      const value: unknown = await response.json()
      const record = asRecord(value)
      if (record === null || !Array.isArray(record.prompts)) return []
      const prompts: PromptHistoryEntry[] = []
      for (const entry of record.prompts) {
        const row = asRecord(entry)
        if (row === null || typeof row.text !== 'string' || row.text.length === 0) continue
        const prompt: PromptHistoryEntry = { seq: typeof row.seq === 'number' ? row.seq : 0, text: row.text }
        // The Host may report the prompt's epoch-ms `at`; older Hosts omit it,
        // in which case the preview simply hides every timestamp surface.
        if (typeof row.at === 'number' && Number.isFinite(row.at)) prompt.at = row.at
        prompts.push(prompt)
      }
      return prompts
    } catch {
      return []
    }
  }

  /**
   * Read one Session's prompt history from the Host.
   * @param sessionId - Session identity.
   * @returns prompt texts oldest first; empty on failure.
   */
  async function readPromptHistory(sessionId: string): Promise<string[]> {
    const prompts = await readPromptHistoryEntries(sessionId)
    return prompts.map((prompt) => prompt.text)
  }

  /**
   * Invisible composer seat that owns prompt-history key handling.
   *
   * It renders nothing. Its effect watches the focused Lexical composer and
   * turns the primary-modifier Up/Down into prompt-history switching.
   * @param props - standard session slot props.
   * @returns no DOM.
   */
  function PromptHistorySeat(props: PromptHistorySeatProps): ReactElement | null {
    const { sessionId, useInput, inputActions } = props
    const draft = useInput((state) => state.draft)
    const phase = useInput((state) => state.phase)
    const browsing: MutableRefObject<PromptHistoryBrowsing> = React.useRef({ index: null, saved: '', recalled: null })
    const history: MutableRefObject<PromptHistoryCache> = React.useRef({
      prompts: [],
      ready: false,
      loading: null,
      sessionId: null,
      generation: 0
    })
    const anchor: MutableRefObject<HTMLElement | null> = React.useRef<HTMLElement | null>(null)
    const latest = React.useRef({ draft, phase, sessionId })
    latest.current.draft = draft
    latest.current.phase = phase
    latest.current.sessionId = sessionId

    const load = React.useCallback((): Promise<string[]> => {
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
       * @param text - draft text to place.
       * @returns void
       */
      const recall = (text: string): void => {
        browsing.current.recalled = text
        inputActions.setDraft(text)
      }
      /**
       * Start browsing from the current draft, whatever it holds.
       * @param prompts - history oldest first.
       * @returns void
       */
      const beginBrowsing = (prompts: string[]): void => {
        if (browsing.current.index !== null) return
        if (prompts.length === 0) return
        browsing.current.saved = latest.current.draft
        browsing.current.index = prompts.length - 1
        recall(prompts[browsing.current.index])
      }
      /**
       * Handle one keydown captured before Lexical moves the caret.
       * @param event - the composer keydown.
       * @returns void
       */
      const onKeyDown = (event: PromptHistoryKeyEvent): void => {
        if (event.defaultPrevented || event.isComposing === true) return
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        if (!settings.matchesHistoryModifier(event, settings.current().promptHistoryModifier)) return
        const target = asPromptHistoryElement(event.target)
        if (target === null) return
        const editor = target.closest('[data-lexical-editor="true"]')
        if (editor === null) return
        const region = editor.closest('[data-conversation-region="composer"]')
        if (region === null) return
        const own = anchor.current === null ? null : asPromptHistoryElement(anchor.current)?.closest('[data-conversation-region="composer"]') ?? null
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
   * @param ctx - client root context.
   * @returns void
   */
  function installPromptHistory(ctx: PromptHistorySeatContext): void {
    ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
      name: 'conversation.input.overlay',
      id: PROMPT_HISTORY_SEAT,
      order: 40
    }, PromptHistorySeat)), 'power-suite: prompt history seat')
  }

  return { PromptHistorySeat, installPromptHistory, readPromptHistoryEntries }
}
