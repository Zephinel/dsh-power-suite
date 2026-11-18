/**
 * Composer-docked prompt-history preview.
 *
 * The dock registration is only a session-scoped data seat: the component
 * renders nothing in the composer flow. The rail is portaled into the native
 * Session-history turn-rail frame, directly below its marks and on its column,
 * separated by a short divider; the shell's own layout owns the rail's
 * position. The hover preview and search cards are portaled to the document
 * body as viewport-fixed overlays.
 *
 * The copy, stylesheet, geometry helpers and both cards live here; the entry
 * only passes the React runtime, the portal bridge, the inline glyph builder
 * and the Host prompt reader.
 *
 * @module
 */

import type { ReactElement } from 'react'

/** One Host prompt-history entry. */
export interface PromptHistoryEntry {
  seq: number
  text: string
  at?: number
}

/** Namespace-bound translate seat used by the rail. */
export type PromptHistoryTranslate = (key: string, params?: Record<string, unknown>) => string

/** One shell input-controller snapshot the dock seat selects from. */
export interface PromptHistoryInputState {
  phase: string
  [key: string]: unknown
}

/** The shell's `useInput` standard hook. */
export type PromptHistoryUseInput = <T>(selector: (state: PromptHistoryInputState) => T) => T

/** Composer input actions the rail calls. */
export interface PromptHistoryInputActions {
  setDraft(text: string): void
}

/** Props the shell hands the composer dock seat. */
export interface PromptHistoryPreviewProps {
  sessionId: string
  useInput: PromptHistoryUseInput
  inputActions: PromptHistoryInputActions
  t?: PromptHistoryTranslate
  [key: string]: unknown
}

/** Stable seats and helpers the browser entry owns. */
export interface PromptHistoryPreviewDeps {
  React: typeof import('react')
  ReactDOM: typeof import('react-dom')
  RemixGlyph: (path: string, size: number, className?: string) => unknown
  readPromptHistoryEntries: (sessionId: string) => Promise<PromptHistoryEntry[]>
}

/** The narrow client root context slice the installer reads. */
export interface PromptHistoryPreviewContext {
  effect(setup: () => (() => void) | void, label?: string): void
  locale: {
    bind(namespace: string): PromptHistoryTranslate
    register(namespace: string, dictionaries: { en: Record<string, string>, zh: Record<string, string> }): () => void
  }
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(
      registration: {
        name: string
        id?: string
        order?: number
        locale?: string
        inject?: () => Record<string, unknown>
      },
      component: (props: PromptHistoryPreviewProps) => ReactElement | null
    ): () => void
  }
}

/** The dock seat and its registration, bound to one entry instance. */
export interface PromptHistoryPreviewInstaller {
  PromptHistoryPreview: (props: PromptHistoryPreviewProps) => ReactElement | null
  installPromptHistoryPreview(ctx: PromptHistoryPreviewContext): void
}

/** One prompt snapshot the rail renders. */
interface PromptHistorySnapshot {
  sessionId: string | null
  status: 'idle' | 'loading' | 'ready'
  prompts: PromptHistoryEntry[]
}

/** Viewport geometry of the native turn-rail column. */
interface PromptHistoryLayout {
  right: number
  width: number
  composerTop: number
}

/** The hover preview card's anchored box. */
interface PromptHistoryPreviewCard {
  ordinal: number
  text: string
  time: string
  timeTitle: string
  top: number
  right: number
  width: number
}

/** Scroll-fade flags of the tick ladder. */
interface PromptHistoryFades {
  top: boolean
  bottom: boolean
}

/** The search card's anchored box. */
interface PromptHistorySearchAnchor {
  mode: 'below' | 'left'
  top: number
  right: number
}

/** Copy namespace of the composer-docked prompt-history preview. */
const PROMPT_HISTORY_PREVIEW_NS = 'powerSuitePromptHistoryPreview'

/** Registration identity of the composer-docked prompt-history preview. */
const PROMPT_HISTORY_PREVIEW_ID = 'power-suite.prompt-history-preview'

// Remix Icon path data (Apache-2.0, https://remixicon.com), inlined here so
// this feature needs no icon package at runtime.
const REMIX_SEARCH_LINE = 'M18.031 16.6168L22.3137 20.8995L20.8995 22.3137L16.6168 18.031C15.0769 19.263 13.124 20 11 20C6.032 20 2 15.968 2 11C2 6.032 6.032 2 11 2C15.968 2 20 6.032 20 11C20 13.124 19.263 15.0769 18.031 16.6168ZM16.0247 15.8748C17.2475 14.6146 18 12.8956 18 11C18 7.1325 14.8675 4 11 4C7.1325 4 4 7.1325 4 11C4 14.8675 7.1325 18 11 18C12.8956 18 14.6146 17.2475 15.8748 16.0247L16.0247 15.8748Z'

/** Copy for the prompt-history rail. */
const PROMPT_HISTORY_PREVIEW_EN: Record<string, string> = {
  'search.open': 'Search',
  'search.placeholder': 'Search prompts',
  'search.aria': 'Search prompt history',
  'list.aria': 'Prompt history',
  'mark.aria': 'Copy prompt #{index}: {text}',
  'empty.filtered': 'No matching prompts',
  'count.filtered': 'Showing {count} of {total}'
}
const PROMPT_HISTORY_PREVIEW_ZH: Record<string, string> = {
  'search.open': '搜索',
  'search.placeholder': '搜索历史提示',
  'search.aria': '搜索历史提示',
  'list.aria': '历史提示',
  'mark.aria': '复制第 {index} 条提示：{text}',
  'empty.filtered': '没有匹配的历史提示',
  'count.filtered': '显示 {count} / {total}'
}

const PROMPT_HISTORY_PREVIEW_CSS = `
.psp-rail{position:fixed;z-index:60;display:flex;flex-direction:column;align-items:center;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:16px;pointer-events:auto}
/* Portaled into the native TurnNavigator frame: reuse the native column's positioning (right + sticky band) and put the prompt rail directly below it. */
[class*="_frame"] > .psp-rail{position:absolute;top:calc(100% + 10px);right:0;left:auto;width:100%;max-height:min(420px,calc(var(--turn-rail-band,800px) / 2 - 50% - 16px));overflow:hidden;z-index:auto}
.psp-rail-divider{flex:none;align-self:flex-end;width:32px;height:1px;margin:2px 0 6px;border-radius:1px;background:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2))}
.psp-marks{flex:1 1 auto;width:100%;min-height:0;display:flex;flex-direction:column;align-items:stretch;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}
.psp-marks::-webkit-scrollbar{display:none;width:0;height:0}
.psp-marks[data-fade-top=true]{mask-image:linear-gradient(#0000 0,#000 24px 100%)}
.psp-marks[data-fade-bottom=true]{mask-image:linear-gradient(#000 0 calc(100% - 24px),#0000 100%)}
.psp-marks[data-fade-top=true][data-fade-bottom=true]{mask-image:linear-gradient(#0000 0,#000 24px calc(100% - 24px),#0000 100%)}
.psp-mark{position:relative;box-sizing:border-box;flex:none;width:100%;height:10px;margin:0;padding:0;border:0;border-radius:8px;background:0 0;cursor:pointer}
.psp-mark::before{content:"";position:absolute;top:50%;right:0;width:20px;height:2px;border-radius:2px;background:var(--dsw-alias-border-l4);transform-origin:100%;transform:translateY(-50%) scaleX(.6);transition:transform .14s,background-color .14s}
.psp-mark:hover::before{background:var(--dsw-alias-label-tertiary);transform:translateY(-50%) scaleX(.9)}
/* Keyboard focus keeps the native hairline: brand tick + a 20px ring on the
   right edge instead of the default outline. */
.psp-mark:focus-visible{outline:none}
.psp-mark:focus-visible::before{background:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));transform:translateY(-50%) scaleX(1)}
.psp-mark:focus-visible::after{content:"";position:absolute;inset:0 0 0 auto;width:20px;border-radius:inherit;outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}
.psp-search-toggle{box-sizing:border-box;flex:none;align-self:flex-end;display:inline-flex;align-items:center;justify-content:center;width:20px;height:22px;margin-top:3px;margin-right:-4px;padding:0;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.psp-search-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.psp-search-toggle[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.psp-search-toggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.psp-rail-card{position:fixed;z-index:61;box-sizing:border-box;overflow:hidden;padding:10px 12px;border:0;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-hovercard-bg,#2c2c2e);box-shadow:var(--dsw-shadow-lv3,none);color:var(--dsw-static-neutral-bluish-00,#fff);font-family:inherit;font-size:13px;line-height:20px}
.psp-rail-card-text{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:6;overflow:hidden;white-space:pre-wrap;word-break:break-word;font:var(--dsw-font-xs-strong-13,inherit);font-family:inherit;font-size:13px;font-weight:500;line-height:20px}
.psp-rail-card-time{margin-top:4px;color:var(--dsw-static-neutral-bluish-400,#adb2b8);font:var(--dsw-font-xxs-12,inherit);font-family:inherit;font-size:12px;line-height:18px}
.psp-search-card{position:fixed;z-index:61;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;overflow:hidden;width:min(300px,calc(100vw - 40px));padding:10px 12px;border:0;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-hovercard-bg,#2c2c2e);box-shadow:var(--dsw-shadow-lv3,none);color:var(--dsw-static-neutral-bluish-00,#fff);font-family:inherit;font-size:12px;line-height:16px}
.psp-search-row{display:flex;align-items:center;gap:6px}
.psp-search-field{position:relative;display:flex;flex:1;min-width:0;height:22px;align-items:center;border-radius:var(--dsw-radius-sm,8px)}
/* Calm rainbow focus ring around the WHOLE prompt-history search card (user
   request: ring the card, not the inner input). The ring hugs the card's border
   box, so the card keeps overflow visible (otherwise the inset -3px pseudo would
   be clipped); the inner input stays ringless with a clean focus state. The
   shared class keeps its original stronger defaults for the settings choice
   pills and the annotation surfaces. */
.psp-search-card.psf-rainbow-focus{--psf-ring-sat:.8;--psf-ring-glow:2.5px;--psf-ring-glow-alpha:.2;--psf-ring-opacity:.58;--psf-ring-thickness:1.5px;position:fixed;overflow:visible}
.psp-search-card.psf-rainbow-focus::after{inset:-3px;border-radius:calc(var(--dsw-radius-lg,16px) + 3px)}
.psp-search-card.psf-rainbow-focus:focus-within::after,.psp-search-card.psf-rainbow-focus:focus-visible::after{opacity:var(--psf-ring-opacity,.58);animation:psf-ring-spin 4.6s linear infinite,psf-ring-hue 20s linear infinite}
@media (prefers-reduced-motion: reduce){.psp-search-card.psf-rainbow-focus:focus-within::after,.psp-search-card.psf-rainbow-focus:focus-visible::after{animation:none}}
.psp-search-icon{flex:none;color:var(--dsw-static-neutral-bluish-400,#adb2b8)}
.psp-search-input{flex:1;min-width:0;height:22px;margin:0;padding:0;border:0;background:transparent;color:var(--dsw-static-neutral-bluish-00,#fff);font:inherit;font-size:12px;line-height:18px;outline:none}
.psp-search-input::placeholder{color:var(--dsw-static-neutral-bluish-400,#adb2b8)}
.psp-search-count{color:var(--dsw-static-neutral-bluish-400,#adb2b8);font-family:inherit;font-size:11px;line-height:15px}
.psp-search-empty{color:var(--dsw-static-neutral-bluish-400,#adb2b8);font-family:inherit;font-size:11px;line-height:15px}
.psp-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:no-preference){.psp-rail-card{animation:psp-rail-card-in .12s ease-out}}
@media (prefers-reduced-motion:reduce){.psp-mark::before{transition:none}}
@keyframes psp-rail-card-in{from{opacity:0;transform:translateX(4px)}to{opacity:1;transform:none}}
`


/**
 * Create the prompt-history preview seat for one plugin instance.
 * @param deps - the React/ReactDOM runtime, inline glyph builder and Host reader.
 * @returns the dock seat and its registration.
 */
export function createPromptHistoryPreview(deps: PromptHistoryPreviewDeps): PromptHistoryPreviewInstaller {
  const { React, ReactDOM, RemixGlyph, readPromptHistoryEntries } = deps

  /**
   * Focus the Lexical editor of the Conversation that owns `sessionId`.
   * @param sessionId - Session identity.
   * @returns void
   */
  function focusPromptHistoryComposer(sessionId: string): void {
    const occurrence = promptHistoryOccurrence(sessionId)
    const scope = occurrence ?? document
    const composer = scope.querySelector('[data-conversation-region="composer"]')
    const editor = (composer ?? scope).querySelector('[data-lexical-editor="true"]')
    if (editor instanceof HTMLElement) editor.focus()
  }

  /**
   * Display labels for one prompt timestamp.
   * @param at - epoch milliseconds.
   * @returns compact time and full hover title.
   */
  function promptHistoryTimeLabels(at: number): { label: string, title: string } {
    const date = new Date(at)
    const now = new Date()
    const pad = (value: number): string => String(value).padStart(2, '0')
    const monthDay = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    const fullDay = `${date.getFullYear()}-${monthDay}`
    let label = `${pad(date.getHours())}:${pad(date.getMinutes())}`
    if (date.toDateString() !== now.toDateString()) label = date.getFullYear() === now.getFullYear() ? monthDay : fullDay
    return { label, title: date.toLocaleString() }
  }

  /**
   * Find the Conversation occurrence that owns `sessionId`.
   * @param sessionId - Session identity.
   * @returns the occurrence body, when rendered.
   */
  function promptHistoryOccurrence(sessionId: string): Element | null {
    const occurrences = document.querySelectorAll('[data-conversation-session]')
    let fallback: Element | null = null
    for (const node of occurrences) {
      if (fallback === null) fallback = node
      if (node.getAttribute('data-conversation-session') === sessionId) return node
    }
    return fallback
  }

  /**
   * The Conversation's scroll surface.
   * @param sessionId - Session identity.
   * @returns the scroll surface.
   */
  function promptHistoryScrollSurface(sessionId: string): Element | null {
    const occurrence = promptHistoryOccurrence(sessionId)
    const scope = occurrence ?? document
    return scope.querySelector('[data-conversation-scroll]') ?? document.querySelector('[data-conversation-scroll]')
  }

  /**
   * The Conversation's composer seat (the live top edge of the composer).
   * @param sessionId - Session identity.
   * @returns the composer seat.
   */
  function promptHistoryComposerSeat(sessionId: string): Element | null {
    const occurrence = promptHistoryOccurrence(sessionId)
    const scope = occurrence ?? document
    return scope.querySelector('[data-conversation-region="composer"]') ?? document.querySelector('[data-conversation-region="composer"]')
  }

  /**
   * The native turn rail's stable frame element.
   *
   * The shell renders the rail as an absolutely positioned 28 px column inside
   * a sticky slot (class token `..._frame`). Measuring the frame instead of the
   * union of its mark buttons keeps our rail fixed while the Conversation
   * scrolls: marks move/select inside the frame, its outer box does not. A
   * narrow container hides the frame via a CSS container query; callers can
   * treat that as "native rail hidden" and hide the prompt rail too.
   * @param scroll - Conversation scroll surface.
   * @returns the frame, or null when the shell has none.
   */
  function promptHistoryTurnRailFrame(scroll: Element): HTMLElement | null {
    if (typeof document === 'undefined') return null
    const candidates = scroll.querySelectorAll('[class*="_frame"]')
    for (const node of candidates) {
      if (!(node instanceof HTMLElement)) continue
      let hasFrameToken = false
      for (const token of node.classList) {
        if (token === 'frame' || token.endsWith('_frame')) hasFrameToken = true
      }
      if (!hasFrameToken) continue
      // Several shell frames live inside the conversation scroll surface; the
      // native turn rail is the absolutely positioned 28 px column. Match its
      // box (computed even while a narrow container hides it) instead of taking
      // the first `_frame` in DOM order.
      const style = window.getComputedStyle(node)
      if (style.position === 'absolute' && style.width === '28px') return node
      if (node.getBoundingClientRect().width === 28) return node
    }
    return null
  }

  /**
   * Read the native turn-rail column and the composer clearance.
   *
   * The rail itself now lives inside the native frame, so this only supplies
   * the geometry the hover preview and search card need: the column's
   * viewport-right distance and the composer's top edge.
   * @param sessionId - Session identity.
   * @returns viewport geometry, or null before the Conversation/frame mounts.
   */
  function measurePromptHistoryRail(sessionId: string): PromptHistoryLayout | null {
    const scroll = promptHistoryScrollSurface(sessionId)
    if (scroll === null) return null
    const frame = promptHistoryTurnRailFrame(scroll)
    if (frame === null) return null
    const frameRect = frame.getBoundingClientRect()
    if (frameRect.width <= 0 || frameRect.height <= 0) return null
    const composer = promptHistoryComposerSeat(sessionId)
    const composerTop = composer === null ? window.innerHeight : composer.getBoundingClientRect().top
    return {
      right: Math.round(window.innerWidth - frameRect.right),
      width: Math.round(frameRect.width),
      composerTop: Math.round(composerTop)
    }
  }

  /**
   * Whether two rail measurements describe the same frame.
   * @param left - previous geometry.
   * @param right - next geometry.
   * @returns whether a re-render can be skipped.
   */
  function samePromptHistoryLayout(left: PromptHistoryLayout | null, right: PromptHistoryLayout | null): boolean {
    if (left === null || right === null) return left === right
    return left.right === right.right &&
      left.width === right.width &&
      left.composerTop === right.composerTop
  }

  /**
   * Compress and bound one prompt for a mark's accessible name.
   * @param text - prompt text.
   * @returns single-line text safe for an aria name.
   */
  function accessiblePromptText(text: string): string {
    const compact = text.replace(/\s+/g, ' ').trim()
    return compact.length > 140 ? `${compact.slice(0, 140)}…` : compact
  }

  /**
   * Prompt-history rail (requirement 3, corrected right-edge design).
   *
   * The composer dock registration is only a session-scoped data seat: this
   * component renders nothing in the composer flow. The rail is portaled into
   * the native Session-history turn-rail frame, directly below its marks and on
   * its column, separated from it by a short divider; the shell's own layout
   * owns the rail's position. The hover preview and search cards are portaled
   * to the document body as viewport-fixed overlays. It lists this Session's
   * sent prompts as fixed-pitch tick marks (oldest at top, newest at the
   * bottom), previews a mark's full text to its left on hover or focus, copies
   * it into the composer draft on click or Enter, and reveals a floating search
   * card from the rail's search button. Renders nothing until the Session has
   * at least one sent prompt.
   * @param props - dock seat props plus the injected locale seat.
   * @returns a document-body portal, or nothing.
   */
  function PromptHistoryPreview(props: PromptHistoryPreviewProps): ReactElement | null {
    const { sessionId, useInput, inputActions } = props
    const t: PromptHistoryTranslate = typeof props.t === 'function' ? props.t : (key) => key
    const phase = useInput((state) => state.phase)
    const [snapshot, setSnapshot] = React.useState<PromptHistorySnapshot>({ sessionId: null, status: 'idle', prompts: [] })
    const [query, setQuery] = React.useState('')
    const [searchOpen, setSearchOpen] = React.useState(false)
    const [reloadKey, setReloadKey] = React.useState(0)
    const [preview, setPreview] = React.useState<PromptHistoryPreviewCard | null>(null)
    const [layout, setLayout] = React.useState<PromptHistoryLayout | null>(null)
    const [fades, setFades] = React.useState<PromptHistoryFades>({ top: false, bottom: false })
    const [searchAnchor, setSearchAnchor] = React.useState<PromptHistorySearchAnchor | null>(null)
    const searchRef = React.useRef<HTMLElement | null>(null)
    const searchCardRef = React.useRef<HTMLElement | null>(null)
    const toggleRef = React.useRef<HTMLElement | null>(null)
    const marksRef = React.useRef<HTMLElement | null>(null)
    const previewTimer = React.useRef<number | null>(null)

    const prompts = snapshot.sessionId === sessionId && snapshot.status === 'ready' ? snapshot.prompts : []

    // Render the rail inside the native turn-rail frame instead of computing
    // its viewport box ourselves: the shell already keeps that column fixed,
    // follows dock/sidebar drags and hides it in a narrow container, so the
    // rail inherits exactly the native behavior (including during drags).
    const [frame, setFrame] = React.useState<HTMLElement | null>(null)
    React.useLayoutEffect(() => {
      let disposed = false
      let frameRequest = 0
      const resolve = (): void => {
        frameRequest = 0
        if (disposed) return
        const scroll = promptHistoryScrollSurface(sessionId)
        const next = scroll === null ? null : promptHistoryTurnRailFrame(scroll)
        setFrame((current) => {
          if (current === next) return current
          return next
        })
      }
      const schedule = (): void => {
        if (disposed || frameRequest !== 0) return
        frameRequest = window.requestAnimationFrame(resolve)
      }
      resolve()
      const observer = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null
      if (observer !== null) observer.observe(document.body, { childList: true, subtree: true })
      window.addEventListener('resize', schedule)
      const settle = window.setTimeout(schedule, 300)
      return () => {
        disposed = true
        window.clearTimeout(settle)
        if (frameRequest !== 0) window.cancelAnimationFrame(frameRequest)
        if (observer !== null) observer.disconnect()
        window.removeEventListener('resize', schedule)
      }
    }, [sessionId, prompts.length])

    // One request per Session and per finished turn. The per-effect guard drops
    // a response that resolves after a switch or a newer reload.
    React.useEffect(() => {
      let active = true
      const target = sessionId
      setSnapshot((current) => current.sessionId === target && current.status === 'ready'
        ? current
        : { sessionId: target, status: 'loading', prompts: [] })
      readPromptHistoryEntries(target).then((next) => {
        if (!active) return
        setSnapshot({ sessionId: target, status: 'ready', prompts: next })
      })
      return () => { active = false }
    }, [sessionId, reloadKey])

    // Switching Sessions starts the reading surface over.
    React.useEffect(() => {
      setQuery('')
      setSearchOpen(false)
      setPreview(null)
    }, [sessionId])

    // The newest prompt now sits at the rail's foot: keep it in view when the
    // list first loads or grows, without fighting a reader who scrolled up.
    const promptCount = prompts.length
    React.useEffect(() => {
      const marks = marksRef.current
      if (marks === null) return
      marks.scrollTop = marks.scrollHeight
    }, [sessionId, promptCount, frame])

    // A finished turn can have appended a prompt; refetch once input is plain again.
    const previousPhase = React.useRef(phase)
    React.useEffect(() => {
      const before = previousPhase.current
      previousPhase.current = phase
      if (before !== 'plain' && phase === 'plain') setReloadKey((value) => value + 1)
    }, [phase])

    React.useEffect(() => () => {
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current)
    }, [])

    // Keep the two body-portaled cards anchored to the native column and the
    // composer. The rail itself is inside the native frame and needs no
    // positioning loop here.
    React.useEffect(() => {
      let frame = 0
      let disposed = false
      const measure = (): void => {
        const next = measurePromptHistoryRail(sessionId)
        setLayout((current) => (samePromptHistoryLayout(current, next) ? current : next))
      }
      const schedule = (): void => {
        if (disposed || frame !== 0) return
        frame = window.requestAnimationFrame(() => {
          frame = 0
          if (!disposed) measure()
        })
      }
      schedule()
      const scroll = promptHistoryScrollSurface(sessionId)
      const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
      if (resizeObserver !== null) {
        if (scroll !== null) resizeObserver.observe(scroll)
        const composer = promptHistoryComposerSeat(sessionId)
        if (composer !== null) resizeObserver.observe(composer)
      }
      const mutationObserver = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null
      if (mutationObserver !== null) mutationObserver.observe(scroll ?? document.body, { childList: true, subtree: true })
      window.addEventListener('resize', schedule)
      const settle = window.setTimeout(schedule, 300)
      return () => {
        disposed = true
        window.clearTimeout(settle)
        if (frame !== 0) window.cancelAnimationFrame(frame)
        if (resizeObserver !== null) resizeObserver.disconnect()
        if (mutationObserver !== null) mutationObserver.disconnect()
        window.removeEventListener('resize', schedule)
      }
    }, [sessionId, prompts.length])

    // The preview card uses viewport coordinates; scrolling or resizing
    // invalidates its anchor, so close it instead of leaving it stale.
    React.useEffect(() => {
      if (preview === null) return undefined
      const dismiss = (): void => setPreview(null)
      document.addEventListener('scroll', dismiss, true)
      window.addEventListener('resize', dismiss)
      return () => {
        document.removeEventListener('scroll', dismiss, true)
        window.removeEventListener('resize', dismiss)
      }
    }, [preview])

    // Revealing the search card moves the caret there without touching the composer.
    React.useEffect(() => {
      if (!searchOpen || searchAnchor === null) return
      const input = searchRef.current
      if (input instanceof HTMLElement) input.focus()
    }, [searchOpen, searchAnchor])

    // A blank pointer press outside the search card and its toggle dismisses
    // the search and clears the filter; rail marks stay clickable.
    React.useEffect(() => {
      if (!searchOpen) return undefined
      const onPointerDown = (event: Event): void => {
        const target = event.target
        if (!(target instanceof Node)) return
        const card = searchCardRef.current
        if (card !== null && card.contains(target)) return
        const toggle = toggleRef.current
        if (toggle !== null && toggle.contains(target)) return
        if (target instanceof Element && target.closest('[data-psp-mark]') !== null) return
        setQuery('')
        setSearchOpen(false)
      }
      document.addEventListener('pointerdown', onPointerDown, true)
      return () => document.removeEventListener('pointerdown', onPointerDown, true)
    }, [searchOpen])

    // The tick ladder mirrors the native turn rail: scrollable ends get fade
    // masks, and the search button below never moves.
    React.useEffect(() => {
      const marks = marksRef.current
      if (marks === null) return undefined
      let frame = 0
      const update = (): void => {
        frame = 0
        const top = marks.scrollTop > 1
        const bottom = marks.scrollTop < marks.scrollHeight - marks.clientHeight - 1
        setFades((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }))
      }
      const schedule = (): void => {
        if (frame !== 0) return
        frame = window.requestAnimationFrame(update)
      }
      schedule()
      marks.addEventListener('scroll', schedule, { passive: true })
      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
      if (observer !== null) observer.observe(marks)
      return () => {
        if (frame !== 0) window.cancelAnimationFrame(frame)
        marks.removeEventListener('scroll', schedule)
        if (observer !== null) observer.disconnect()
      }
    }, [layout, prompts.length, query])

    // The search card never moves the rail: it hangs below the fixed toggle
    // when there is room, otherwise it flips to the toggle's left and is
    // clamped above the composer. Re-anchored on resize/filter changes.
    React.useEffect(() => {
      if (!searchOpen) {
        setSearchAnchor(null)
        return undefined
      }
      let frame = 0
      const place = (): void => {
        if (frame !== 0) return
        frame = window.requestAnimationFrame(() => {
          frame = 0
          const toggle = toggleRef.current
          if (toggle === null) return
          const rect = toggle.getBoundingClientRect()
          const estimate = 84
          const composerTop = layout === null ? window.innerHeight : layout.composerTop
          const next: PromptHistorySearchAnchor = composerTop - rect.bottom - 8 >= estimate
            ? { mode: 'below', top: Math.round(rect.bottom + 6), right: layout === null ? 12 : layout.right }
            : {
              mode: 'left',
              top: Math.round(Math.max(8, Math.min(rect.top + rect.height / 2 - estimate / 2, composerTop - 8 - estimate))),
              right: Math.round(window.innerWidth - (rect.left - 8))
            }
          setSearchAnchor((current) => (current !== null && current.mode === next.mode && current.top === next.top && current.right === next.right ? current : next))
        })
      }
      place()
      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null
      if (observer !== null && toggleRef.current !== null) observer.observe(toggleRef.current)
      window.addEventListener('resize', place)
      return () => {
        if (frame !== 0) window.cancelAnimationFrame(frame)
        if (observer !== null) observer.disconnect()
        window.removeEventListener('resize', place)
      }
    }, [searchOpen, layout, query, prompts.length])

    /**
     * Put one prompt into the composer draft.
     * @param prompt - the rail mark's prompt entry.
     * @returns void
     */
    function copyPrompt(prompt: PromptHistoryEntry): void {
      cancelHidePreview()
      inputActions.setDraft(prompt.text)
      focusPromptHistoryComposer(sessionId)
      setPreview(null)
    }

    /**
     * Anchor the full-text preview card to one mark.
     * @param prompt - the mark's prompt entry.
     * @param ordinal - reverse index shown to assistive tech.
     * @param element - the mark button.
     * @returns void
     */
    function showPreview(prompt: PromptHistoryEntry, ordinal: number, element: HTMLElement): void {
      cancelHidePreview()
      if (layout === null) return
      const rect = element.getBoundingClientRect()
      const width = Math.max(200, Math.min(300, Math.round(window.innerWidth - layout.right - layout.width - 30)))
      // The card clamps its text instead of scrolling, so a small fixed
      // estimate keeps it fully above the composer for bottom marks too.
      const topLimit = Math.max(8, layout.composerTop - 8 - 176)
      const top = Math.round(Math.max(8, Math.min(rect.top - 10, topLimit)))
      const time = typeof prompt.at === 'number' ? promptHistoryTimeLabels(prompt.at) : null
      setPreview({
        ordinal,
        text: prompt.text,
        time: time === null ? '' : time.label,
        timeTitle: time === null ? '' : time.title,
        top,
        right: layout.right + layout.width + 10,
        width
      })
    }

    /** Hide the preview card after a short pointer trip toward it. */
    function scheduleHidePreview(): void {
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current)
      previewTimer.current = window.setTimeout(() => {
        previewTimer.current = null
        setPreview(null)
      }, 160)
    }

    /** Cancel a scheduled hide, e.g. when the pointer reaches the preview card. */
    function cancelHidePreview(): void {
      if (previewTimer.current !== null) {
        window.clearTimeout(previewTimer.current)
        previewTimer.current = null
      }
    }

    if (prompts.length === 0 || frame === null) return null

    const needle = query.trim().toLowerCase()
    // Oldest first, newest at the rail's foot (reading order, like a chat log).
    const marks: Array<{ prompt: PromptHistoryEntry, ordinal: number }> = []
    for (let index = 0; index < prompts.length; index += 1) {
      const prompt = prompts[index]
      if (needle.length > 0 && !prompt.text.toLowerCase().includes(needle)) continue
      marks.push({ prompt, ordinal: index + 1 })
    }

    // The native frame caps the rail height (same CSS vars as the native
    // turn rail) so a long history scrolls its ticks internally while the
    // search button stays pinned and reachable at the rail's foot.
    const style = React.createElement('style', null, PROMPT_HISTORY_PREVIEW_CSS)

    const rail = React.createElement('div', {
      className: 'psp-rail',
      'data-psp-rail': '',
      role: 'group',
      'aria-label': t('list.aria')
    },
    React.createElement('div', {
      className: 'psp-rail-divider',
      'data-psp-rail-divider': '',
      'aria-hidden': 'true'
    }),
    React.createElement('div', {
      ref: marksRef,
      className: 'psp-marks',
      role: 'group',
      'aria-label': t('list.aria'),
      'data-fade-top': fades.top ? 'true' : undefined,
      'data-fade-bottom': fades.bottom ? 'true' : undefined
    },
    marks.map(({ prompt, ordinal }) => React.createElement('button', {
      key: String(ordinal),
      type: 'button',
      className: 'psp-mark',
      'data-psp-mark': '',
      'data-psp-index': String(ordinal),
      onClick: () => copyPrompt(prompt),
      onMouseEnter: (event: { readonly currentTarget: HTMLElement }) => showPreview(prompt, ordinal, event.currentTarget),
      onMouseLeave: scheduleHidePreview,
      onFocus: (event: { readonly currentTarget: HTMLElement }) => showPreview(prompt, ordinal, event.currentTarget),
      onBlur: scheduleHidePreview
    },
    // The accessible name carries the action and the prompt text, so the
    // visible tick never hides what the mark stands for.
    React.createElement('span', { className: 'psp-sr' }, t('mark.aria', { index: ordinal, text: accessiblePromptText(prompt.text) }))))),
    React.createElement('button', {
      ref: toggleRef,
      type: 'button',
      className: 'psp-search-toggle',
      'data-psp-search-toggle': '',
      'aria-expanded': searchOpen ? 'true' : 'false',
      'aria-label': t('search.open'),
      title: t('search.open'),
      onClick: () => {
        setPreview(null)
        if (searchOpen) {
          setQuery('')
          setSearchOpen(false)
          return
        }
        setSearchOpen(true)
      }
    }, RemixGlyph(REMIX_SEARCH_LINE, 13)))

    const previewCard = preview === null ? null : React.createElement('div', {
      className: 'psp-rail-card',
      'data-psp-preview-card': '',
      role: 'tooltip',
      'aria-hidden': 'true',
      style: { top: preview.top, right: preview.right, width: preview.width },
      onMouseEnter: cancelHidePreview,
      onMouseLeave: () => setPreview(null)
    },
    React.createElement('div', { className: 'psp-rail-card-text' }, preview.text),
    preview.time === ''
      ? null
      : React.createElement('div', { className: 'psp-rail-card-time', title: preview.timeTitle }, preview.time))

    // The card hangs below the fixed toggle when there is room, otherwise it
    // flips to the toggle's left; the toggle itself never moves.
    const searchCard = searchOpen && searchAnchor !== null ? React.createElement('div', {
      ref: searchCardRef,
      className: 'psp-search-card psf-rainbow-focus',
      'data-psp-search-card': '',
      'data-psp-search-mode': searchAnchor.mode,
      style: { top: searchAnchor.top, right: searchAnchor.right },
      onKeyDown: (event: { readonly key: string, preventDefault(): void, stopPropagation(): void }) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        setQuery('')
        setSearchOpen(false)
        const toggle = toggleRef.current
        if (toggle instanceof HTMLElement) toggle.focus()
      }
    },
    React.createElement('div', { className: 'psp-search-row' },
      RemixGlyph(REMIX_SEARCH_LINE, 13, 'psp-search-icon'),
      // The rainbow ring now wraps the whole search card (focus-within on the
      // card); the inner input stays borderless and ringless.
      React.createElement('span', { className: 'psp-search-field' },
        React.createElement('input', {
          ref: searchRef,
          type: 'text',
          className: 'psp-search-input',
          value: query,
          placeholder: t('search.placeholder'),
          'aria-label': t('search.aria'),
          autoComplete: 'off',
          spellCheck: false,
          onChange: (event: { readonly target: { readonly value: string } }) => setQuery(event.target.value)
        }))),
    React.createElement('div', { className: 'psp-search-count' },
      t('count.filtered', { count: marks.length, total: prompts.length })),
    needle.length > 0 && marks.length === 0
      ? React.createElement('div', { className: 'psp-search-empty' }, t('empty.filtered'))
      : null)
      : null

    // The rail lives inside the native frame so native layout owns its
    // position. The preview and search cards must stay viewport-fixed: the
    // native frame is transformed/contained, which would make `position:
    // fixed` resolve against the frame, so portal those two to the body.
    return React.createElement(React.Fragment, null,
      ReactDOM.createPortal(React.createElement(React.Fragment, null, style, rail), frame),
      ReactDOM.createPortal(previewCard, document.body),
      ReactDOM.createPortal(searchCard, document.body))
  }

  /**
   * Register the prompt-history rail's session-scoped data seat.
   * @param ctx - client root context.
   * @returns void
   */
  function installPromptHistoryPreview(ctx: PromptHistoryPreviewContext): void {
    const t = ctx.locale.bind(PROMPT_HISTORY_PREVIEW_NS)
    ctx.effect(() => ctx.locale.register(PROMPT_HISTORY_PREVIEW_NS, {
      en: PROMPT_HISTORY_PREVIEW_EN,
      zh: PROMPT_HISTORY_PREVIEW_ZH
    }), 'power-suite: prompt-history preview dictionaries')
    ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
      name: 'conversation.input.dock',
      id: PROMPT_HISTORY_PREVIEW_ID,
      order: 100,
      locale: PROMPT_HISTORY_PREVIEW_NS,
      inject: () => ({ t })
    }, PromptHistoryPreview)), 'power-suite: prompt-history preview dock')
  }

  return { PromptHistoryPreview, installPromptHistoryPreview }
}
