/**
 * Composer image gallery.
 *
 * Pasted screenshots render as several `button > img` thumbnails in the
 * composer's attachment rail. This feature intercepts a click on a rail image
 * when the composer holds two or more openable images and opens one continuous
 * viewer instead of the native single-image lightbox; single-image composers
 * keep native behavior.
 *
 * The rail is DOM-measured because the shell's classes are hashed: openable
 * pasted images are buttons inside `[data-conversation-region="composer"]` that
 * contain exactly one `img`, carry a non-empty `title`, and have no
 * `aria-label` (refused uploads set one). Order is DOM order.
 *
 * The store, interception, overlay component, copy, icons, stylesheet and
 * installer used to sit inline in `src/client.js`; the slot id, DOM markers and
 * behavior are unchanged.
 *
 * @module
 */

import type { MutableRefObject, ReactElement } from 'react'
import {
  psgClampIndex,
  psgCollectImages,
  psgStepIndex,
  psgSyncState,
  psgWheelDecision
} from './model.ts'
import type { CollectedImage, GalleryImage } from './model.ts'
import { PSG_EN, PSG_NS, PSG_ZH } from './copy.ts'
import { PSG_ARROW_LEFT_LINE, PSG_ARROW_RIGHT_LINE, PSG_CLOSE_LINE } from './icons.ts'
import { PSG_CSS } from './styles.ts'

/** Namespace-bound translate seat used by the overlay. */
export type GalleryTranslate = (key: string, params?: Record<string, unknown>) => string

/** Inline Remix glyph builder the entry owns. */
export type GalleryGlyph = (path: string, size: number, className?: string, scale?: number) => ReactElement

/** Slot cell identity of the gallery overlay. */
const PSG_SLOT_ID = 'power-suite.composer-image-gallery'

/** Deepest composer region the interception is scoped to. */
const PSG_COMPOSER_SELECTOR = '[data-conversation-region="composer"]'

/** One click on the document, narrowed to the members the interceptor reads. */
interface GalleryMouseEvent {
  readonly target: unknown
  readonly button: number
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly defaultPrevented: boolean
  preventDefault(): void
  stopImmediatePropagation(): void
}

/** One keydown while the overlay is open. */
interface GalleryKeyEvent {
  readonly key: string
  readonly defaultPrevented: boolean
  preventDefault(): void
  stopPropagation(): void
}

/** One wheel event on the overlay root. */
interface GalleryWheelEvent {
  readonly deltaY: number
  preventDefault(): void
}

/** Props the overlay renders from. */
export interface ComposerImageGalleryProps {
  t: GalleryTranslate
  [key: string]: unknown
}

/** One open overlay snapshot. */
interface GalleryState {
  open: boolean
  images: GalleryImage[]
  index: number
}

/** The narrow client-root context slice the installer reads. */
export interface ComposerGalleryContext {
  effect(setup: () => (() => void) | void, label?: string): void
  locale: {
    bind(namespace: string): GalleryTranslate
    register(namespace: string, dictionaries: { en: Record<string, string>, zh: Record<string, string> }): () => void
  }
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(
      registration: { name: string, id: string },
      component: (props: Record<string, unknown>) => ReactElement | null
    ): () => void
  }
}

/** Runtime modules the overlay closes over. */
export interface ComposerGalleryDeps {
  React: typeof import('react')
  RemixGlyph: GalleryGlyph
}

/** The overlay component and its installer. */
export interface ComposerGallery {
  ComposerImageGallery: (props: ComposerImageGalleryProps) => ReactElement | null
  installComposerImageGallery(ctx: ComposerGalleryContext): void
}

/**
 * Create the composer gallery store, component and installer.
 * @param deps - React runtime and the shared glyph builder.
 * @returns the overlay and its registration entry point.
 */
export function createComposerImageGallery(deps: ComposerGalleryDeps): ComposerGallery {
  const { React, RemixGlyph } = deps

  /** Module-level gallery store: exactly one overlay can exist. */
  let psgState: GalleryState = { open: false, images: [], index: 0 }
  const psgListeners = new Set<() => void>()
  let psgSourceButton: HTMLElement | null = null
  let psgComposerRegion: HTMLElement | null = null

  /** Notify overlay subscribers. */
  function psgEmit(): void {
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
   * @param listener - change callback.
   * @returns unsubscribe.
   */
  function psgSubscribe(listener: () => void): () => void {
    psgListeners.add(listener)
    return () => {
      psgListeners.delete(listener)
    }
  }

  /** @returns current snapshot. */
  function psgSnapshot(): GalleryState {
    return psgState
  }

  /**
   * Open the gallery on a collected rail snapshot.
   * @param collected - rail images.
   * @param index - clicked image index.
   * @param sourceButton - clicked thumbnail (focus return target).
   * @param composer - composer region (mutation watch target).
   * @returns void
   */
  function psgOpen(
    collected: CollectedImage[],
    index: number,
    sourceButton: HTMLElement,
    composer: HTMLElement
  ): void {
    const images = collected.map(({ src, name }) => ({ src, name }))
    psgSourceButton = sourceButton
    psgComposerRegion = composer
    psgState = { open: true, images, index: psgClampIndex(index, images.length) }
    psgEmit()
  }

  /**
   * Close the gallery and optionally return focus to the clicked thumbnail.
   * @param options - focus behavior.
   * @returns void
   */
  function psgClose(options?: { restoreFocus?: boolean }): void {
    const restoreFocus = options === null || options === undefined || options.restoreFocus !== false
    const button = psgSourceButton
    const wasOpen = psgState.open
    psgSourceButton = null
    psgComposerRegion = null
    if (!wasOpen) return
    psgState = { open: false, images: [], index: 0 }
    psgEmit()
    if (restoreFocus && button !== null && button.isConnected) {
      try {
        button.focus({ preventScroll: true })
      } catch {
        button.focus()
      }
    }
  }

  /**
   * Move the open gallery one image in the given direction (clamped).
   * @param delta - positive for next, negative for previous.
   * @returns void
   */
  function psgStep(delta: number): void {
    if (!psgState.open) return
    const index = psgStepIndex(psgState.index, psgState.images.length, delta)
    if (index === psgState.index) return
    psgState = { ...psgState, index }
    psgEmit()
  }

  /**
   * Re-read the composer rail while the gallery is open and reconcile the state:
   * removed attachments clamp the index, an emptied rail closes the overlay.
   * @returns void
   */
  function psgSync(): void {
    if (!psgState.open) return
    const composer = psgComposerRegion
    if (composer === null || !composer.isConnected) {
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
   * @param event - click event.
   * @returns void
   */
  function psgOnDocumentClick(event: GalleryMouseEvent): void {
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

  /**
   * The gallery overlay component. Subscribes to the module store, reconciles
   * with the composer rail while open, and owns the modal input handling.
   * @param props - slot props plus injected t.
   * @returns the overlay, or null while closed.
   */
  function ComposerImageGallery(props: ComposerImageGalleryProps): ReactElement | null {
    const { t } = props
    const state = React.useSyncExternalStore(psgSubscribe, psgSnapshot, psgSnapshot)
    const rootRef: MutableRefObject<HTMLElement | null> = React.useRef<HTMLElement | null>(null)
    const open = state.open

    // Reconcile with the live composer rail: attachment removal and Session
    // switches change or empty the rail; a short interval catches a composer
    // region that is replaced without mutations inside the old element.
    React.useEffect(() => {
      if (!open) return undefined
      const composer = psgComposerRegion
      const observer = typeof MutationObserver === 'function' && composer !== null
        ? new MutationObserver(() => psgSync())
        : null
      if (observer !== null && composer !== null) {
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
      const onKeyDown = (event: GalleryKeyEvent): void => {
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
      const onWheel = (event: GalleryWheelEvent): void => {
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
   * @param ctx - client root context.
   * @returns void
   */
  function installComposerImageGallery(ctx: ComposerGalleryContext): void {
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

  return { ComposerImageGallery, installComposerImageGallery }
}
