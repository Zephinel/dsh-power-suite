/**
 * Draft attachment memory.
 *
 * The shell persists a Session draft's semantic text (and reference chips) per
 * Session, but browser-owned attachment objects (pasted images, dropped or
 * picked files) live only in the mounted input controller: switching to another
 * Session and back restores the words and silently drops the images. This seat
 * keeps the browser Files for each Session while the page stays open and
 * re-introduces them through the composer's own file-intake path (a synthetic
 * paste with the cached Files) when the Session is shown again and the shell
 * restored no attachments.
 *
 * It is a page-lifetime workaround, not persistence: a page reload still cannot
 * bring back a File object the browser did not keep. The seat, its memory and
 * the installer used to sit inline in `src/client.js`; the storage bounds, seat
 * id/order and behavior are unchanged.
 *
 * @module
 */

import type { ReactElement } from 'react'

/** Seat identity of the invisible session-scoped capture/restore seat. */
const DAM_SEAT = 'power-suite.draft-attachments'

/** Sessions whose draft attachments are remembered at once. */
const DAM_MAX_SESSIONS = 8

/** Files remembered for one Session. */
const DAM_MAX_FILES = 20

/** One Session's remembered Files and restore guard. */
interface DamEntry {
  files: File[]
  restored: boolean
  seq: number
}

/** The attachment row shape the input controller's selector exposes. */
export interface DraftAttachmentInputState {
  attachmentIds: readonly unknown[]
  phase: string
  [key: string]: unknown
}

/** The shell's `useInput` standard hook. */
export type DraftAttachmentUseInput = <T>(selector: (state: DraftAttachmentInputState) => T) => T

/** Props the shell hands the composer overlay seat. */
export interface DraftAttachmentSeatProps {
  sessionId: string
  useInput: DraftAttachmentUseInput
  [key: string]: unknown
}

/** One file item exposed by a clipboard/drop data transfer. */
interface DamTransferItem {
  readonly kind: string
  getAsFile(): File | null
}

/** The writable item list the synthetic paste builds. */
interface DamTransferItemList extends Iterable<DamTransferItem> {
  add(file: File): void
}

/** The transfer slice the seat reads. */
interface DamTransfer {
  readonly items: DamTransferItemList
  readonly files: Iterable<File>
}

/** A paste event's read surface. */
interface DamPasteEvent {
  readonly target: unknown
  readonly clipboardData: DamTransfer | null
}

/** A drop event's read surface. */
interface DamDropEvent {
  readonly target: unknown
  readonly dataTransfer: DamTransfer | null
}

/** A change event's read surface. */
interface DamChangeEvent {
  readonly target: unknown
}

/** The file-input surface the change listener narrows to. */
interface DamFileInput {
  readonly type: string
  readonly files: Iterable<File>
  closest(selector: string): Element | null
}

/** An editor element that accepts a dispatched paste event. */
interface DamEditor extends HTMLElement {
  dispatchEvent(event: object): boolean
}

/** The CSS escaper the browser may expose. */
interface DamCss {
  escape?(value: string): string
}

/** Constructors the synthetic paste feature-detects. */
interface DamGlobals {
  readonly DataTransfer?: new () => DamTransfer
  readonly ClipboardEvent?: new (
    type: string,
    init: { clipboardData: DamTransfer, bubbles: boolean, cancelable: boolean }
  ) => object
}

/** The narrow client-root context slice the installer reads. */
export interface DraftAttachmentContext {
  effect(setup: (() => void) | void, label?: string): void
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(
      registration: { name: string, id: string, order: number },
      component: (props: DraftAttachmentSeatProps) => ReactElement | null
    ): () => void
  }
}

/** The seat and its installer bound to one entry instance. */
export interface DraftAttachmentMemory {
  DraftAttachmentSeat: (props: DraftAttachmentSeatProps) => ReactElement | null
  installDraftAttachmentMemory(ctx: DraftAttachmentContext): void
}

/** Session id → remembered Files, restore guard and recency. */
const damMemory = new Map<string, DamEntry>()

/**
 * Escape one Session id for a quoted attribute selector.
 * @param value - Session identity.
 * @returns selector-safe value.
 */
function damSelectorValue(value: string): string {
  const css = (globalThis as unknown as { CSS?: DamCss }).CSS
  if (css !== undefined && css !== null && typeof css.escape === 'function') return css.escape(value)
  return String(value).replace(/["\\]/g, '\\$&')
}

/**
 * Remember browser Files attached to one Session's draft.
 * @param sessionId - Session identity.
 * @param files - browser files from paste, drop, or picker.
 * @returns void
 */
function damRemember(sessionId: string, files: readonly File[]): void {
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
    let oldestKey: string | undefined
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
 * @param sessionId - Session identity.
 * @returns void
 */
function damForget(sessionId: string): void {
  damMemory.delete(sessionId)
}

/**
 * Re-introduce remembered Files through the composer's paste intake.
 * @param sessionId - Session identity.
 * @param files - remembered browser files.
 * @returns whether a paste event was dispatched.
 */
function damInject(sessionId: string, files: readonly File[]): boolean {
  if (files.length === 0) return false
  const scoped = document.querySelector(`[data-conversation-session="${damSelectorValue(sessionId)}"]`)
  if (!(scoped instanceof HTMLElement)) return false
  const composer = scoped.querySelector('[data-conversation-region="composer"]')
  if (!(composer instanceof HTMLElement)) return false
  const editor = composer.querySelector('[data-lexical-editor="true"]')
  if (!(editor instanceof HTMLElement)) return false
  const globals = globalThis as unknown as DamGlobals
  const DataTransfer = globals.DataTransfer
  const ClipboardEvent = globals.ClipboardEvent
  if (typeof DataTransfer !== 'function' || typeof ClipboardEvent !== 'function') return false
  let data
  try {
    data = new DataTransfer()
    for (const file of files) data.items.add(file)
  } catch {
    return false
  }
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
  const target = editor as DamEditor
  target.dispatchEvent(event)
  return true
}

/**
 * Create the draft-attachment seat for one plugin instance.
 * @param deps - React runtime.
 * @returns the seat and its installer.
 */
export function createDraftAttachmentMemory(deps: { React: typeof import('react') }): DraftAttachmentMemory {
  const { React } = deps

  /**
   * Invisible per-Session seat that captures draft Files and puts them back
   * after a Session round-trip.
   * @param props - session-scoped slot props.
   * @returns no DOM.
   */
  function DraftAttachmentSeat(props: DraftAttachmentSeatProps): ReactElement | null {
    const { sessionId, useInput } = props
    const attachmentIds = useInput((state) => state.attachmentIds)
    const phase = useInput((state) => state.phase)
    const previousAttachments = React.useRef(attachmentIds.length)

    // Capture every browser File the composer admits while this Session is
    // mounted, before the shell's own intake consumes it.
    React.useEffect(() => {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
      const inComposer = (node: unknown): boolean => (
        node instanceof Element ? node.closest('[data-conversation-region="composer"]') : null
      ) !== null
      const inThisSession = (node: unknown): boolean => {
        if (!(node instanceof Element)) return false
        const scoped = node.closest('[data-conversation-session]')
        if (scoped !== null) return scoped.getAttribute('data-conversation-session') === sessionId
        // A picker input appended outside the conversation still belongs to
        // the one mounted composer of this Session.
        return document.querySelector(`[data-conversation-session="${damSelectorValue(sessionId)}"]`) !== null
      }
      const remember = (files: Iterable<File> | undefined | null): void => {
        if (files === undefined || files === null) return
        const list: File[] = []
        for (const file of files) if (file instanceof File) list.push(file)
        damRemember(sessionId, list)
      }
      const onPaste = (event: DamPasteEvent): void => {
        if (!inComposer(event.target) || !inThisSession(event.target)) return
        const data = event.clipboardData
        if (data === null) return
        const files: File[] = []
        for (const item of data.items) {
          if (item.kind !== 'file') continue
          const file = item.getAsFile()
          if (file !== null) files.push(file)
        }
        remember(files)
      }
      const onDrop = (event: DamDropEvent): void => {
        if (!inComposer(event.target) || !inThisSession(event.target)) return
        const transfer = event.dataTransfer
        if (transfer !== null) remember(transfer.files)
      }
      const onChange = (event: DamChangeEvent): void => {
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
      let timer: number | null = null
      const attempt = (): void => {
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
   * @param ctx - client root context.
   * @returns void
   */
  function installDraftAttachmentMemory(ctx: DraftAttachmentContext): void {
    ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
      name: 'conversation.input.overlay',
      id: DAM_SEAT,
      order: 20
    }, DraftAttachmentSeat)), 'power-suite: draft attachment memory seat')
  }

  return { DraftAttachmentSeat, installDraftAttachmentMemory }
}
