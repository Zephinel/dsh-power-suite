/**
 * Stateful half of the shared hover quick-look card.
 *
 * One body-level card serves both the Artifacts list and the native Workspace
 * files tree. This module owns the pointer-intent state machine (opening →
 * open → switching/closing), the single-timer phase discipline, placement and
 * resize, the preview descriptor fetch/cache, and the card DOM. The pure
 * arithmetic and cache decisions live in `model.ts`; the Markdown subset and
 * the syntax tokenizer live in `markdown.ts`/`highlight.ts`; the stylesheet and
 * icons are injected/imported through the entry's factory binding.
 *
 * The entry only binds this installer to its locale, url builders, byte
 * formatter and icon paths; the card, its listeners and its copy stay here.
 *
 * @module
 */

import {
  QUICKLOOK_CACHE_LIMIT,
  QUICKLOOK_CARD_EXIT_DELAY,
  QUICKLOOK_MAX_WIDTH,
  QUICKLOOK_MIN_HEIGHT,
  QUICKLOOK_MIN_WIDTH,
  QUICKLOOK_OPEN_DELAY,
  QUICKLOOK_ROW_EXIT_FALLBACK,
  QUICKLOOK_SIZE_KEY,
  parseQuickLookSize,
  quickLookBasename,
  quickLookBox,
  quickLookCacheFresh,
  quickLookCacheKey
} from './model.ts'
import type {
  QuickLookAttachment,
  QuickLookCacheEntry,
  QuickLookData,
  QuickLookEntry,
  QuickLookPhase,
  QuickLookPoint,
  QuickLookProvidedEntry,
  QuickLookSize
} from './model.ts'
import { QUICKLOOK_CSS } from './styles.ts'
import {
  isQuickLookElement,
  isQuickLookNode,
  quickLookDocument,
  quickLookWindow,
  quickLookWindowOrNull
} from './dom.ts'
import type { QuickLookElement, QuickLookEvent, QuickLookKeyEvent, QuickLookPointerEvent } from './dom.ts'
import { renderQuickLookMarkdown, quickLookCodeElement } from './markdown.ts'
import { languageForFile } from './highlight.ts'

/** Localized card labels copied from the panel namespace at install time. */
interface QuickLookLabels {
  loading: string
  unavailable: string
  truncated: string
  open: string
  download: string
  resize: string
}

/** The icon paths the card draws (owned by the entry's icon table). */
export interface QuickLookIcons {
  file: string
  open: string
  download: string
}

/** The stable shell facts the installer binds once. */
export interface HoverQuickLookDeps {
  /** Feature copy resolver, bound to the entry's namespace. */
  t: (key: string) => string
  /** Resolve one Host route against the application base URL. */
  appUrl: (relative: string) => string
  /** Raw workspace-artifact route. */
  rawRoute: string
  /** Preview descriptor route. */
  previewRoute: string
  /** Build one user-provided attachment URL. */
  attachmentUrl: (attachment: QuickLookAttachment, disposition: 'inline' | 'attachment') => string
  /** Human byte size for the footer note. */
  formatBytes: (bytes: number) => string
  /** Inline Remix path data for the card glyphs. */
  icons: QuickLookIcons
}

/** The narrow client root context slice this installer reads. */
export interface HoverQuickLookContext {
  effect(setup: () => (() => void) | void, label?: string): void
}

/** One phase that owns a timer. */
type QuickLookTimerPhase = 'opening' | 'switching' | 'closing'

/** Mutable hover-card state; one surface per plugin instance. */
interface QuickLookState {
  card: QuickLookElement | null
  current: QuickLookEntry | null
  cache: Map<string, QuickLookCacheEntry>
  size: QuickLookSize | null
  resizing: boolean
  enteredCard: boolean
  lastCardDistance: number | null
  pendingRow: QuickLookElement | null
  pendingEntry: QuickLookEntry | null
  phase: QuickLookPhase
  timer: number | null
  switchToken: number
  lastPointer: QuickLookPoint | null
  switchDirection: number
  abort: AbortController | null
}

const DEFAULT_LABELS: QuickLookLabels = {
  loading: 'Loading preview…',
  unavailable: 'No preview available',
  truncated: 'Preview truncated',
  open: 'Open',
  download: 'Download',
  resize: 'Resize preview'
}

let quickLookLabels: QuickLookLabels = { ...DEFAULT_LABELS }

/** Bound once by {@link installQuickLook}; read by the render/fetch helpers. */
let quickLookDeps: HoverQuickLookDeps | null = null

const quickLookState: QuickLookState = {
  card: null,
  current: null,
  cache: new Map(),
  size: null,
  resizing: false,
  enteredCard: false,
  lastCardDistance: null,
  pendingRow: null,
  pendingEntry: null,
  phase: 'idle',
  timer: null,
  switchToken: 0,
  lastPointer: null,
  switchDirection: 1,
  abort: null
}

/**
 * Read the deps bound by install; every runtime path runs after install.
 * @returns the bound shell facts.
 */
function quickLookApi(): HoverQuickLookDeps {
  if (quickLookDeps === null) throw new Error('hover quick look: not installed')
  return quickLookDeps
}

/**
 * Read the remembered preview box.
 * @returns saved size, when valid.
 */
function loadQuickLookSize(): QuickLookSize | null {
  try {
    return parseQuickLookSize(localStorage.getItem(QUICKLOOK_SIZE_KEY))
  } catch {
    return null
  }
}

/**
 * Persist the current preview box.
 * @param width - card width.
 * @param height - card height.
 * @returns void
 */
function saveQuickLookSize(width: number, height: number): void {
  const size = { width: Math.round(width), height: Math.round(height) }
  quickLookState.size = size
  try {
    localStorage.setItem(QUICKLOOK_SIZE_KEY, JSON.stringify(size))
  } catch {
    // Storage can be unavailable; the in-memory size still applies.
  }
}

/**
 * Build one raw-artifact URL for a bare path.
 * @param path - absolute file path.
 * @param name - display file name.
 * @param disposition - inline rendering or download.
 * @returns the URL.
 */
function artifactRawUrl(path: string, name: string, disposition: 'inline' | 'attachment'): string {
  const deps = quickLookApi()
  const url = new URL(deps.appUrl(deps.rawRoute))
  url.searchParams.set('path', path)
  url.searchParams.set('name', name)
  url.searchParams.set('disposition', disposition)
  return url.href
}

/**
 * Build one SVG element from inline Remix path data.
 * @param path - path data.
 * @param size - pixel size.
 * @returns the SVG element.
 */
function quickLookSvg(path: string, size: number): QuickLookElement {
  const document = quickLookDocument()
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'currentColor')
  svg.setAttribute('aria-hidden', 'true')
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  shape.setAttribute('d', path)
  svg.appendChild(shape)
  return svg
}

/**
 * Whether the user prefers reduced motion.
 * @returns true when animations should be skipped.
 */
function quickLookReducedMotion(): boolean {
  const window = quickLookWindowOrNull()
  return window !== null
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Whether a point is inside a rectangle (optionally with a margin).
 * @param rect - rectangle.
 * @param x - viewport x.
 * @param y - viewport y.
 * @param margin - extra pixels around the rectangle.
 * @returns true when inside.
 */
function pointInRect(
  rect: { readonly left: number, readonly right: number, readonly top: number, readonly bottom: number },
  x: number,
  y: number,
  margin: number
): boolean {
  return x >= rect.left - margin && x <= rect.right + margin
    && y >= rect.top - margin && y <= rect.bottom + margin
}

/**
 * Distance from a point to the nearest edge of the preview card (0 inside).
 * @param x - viewport x.
 * @param y - viewport y.
 * @returns pixel distance.
 */
function quickLookCardDistance(x: number, y: number): number {
  const card = quickLookState.card
  if (card === null) return Number.POSITIVE_INFINITY
  const rect = card.getBoundingClientRect()
  const dx = Math.max(rect.left - x, 0, x - rect.right)
  const dy = Math.max(rect.top - y, 0, y - rect.bottom)
  return Math.hypot(dx, dy)
}

/**
 * Whether a point is inside the traversal area between the source row and the
 * preview card. This is the rectangular-bridge form of Floating UI's
 * `safePolygon`: a generous rectangle covering both elements, so a diagonal
 * move from the row towards the card is not treated as leaving.
 * @param x - viewport x.
 * @param y - viewport y.
 * @returns true when inside the traversal area.
 */
function quickLookTraversalContains(x: number, y: number): boolean {
  const card = quickLookState.card
  if (card === null) return false
  const cardRect = card.getBoundingClientRect()
  if (pointInRect(cardRect, x, y, 48)) return true
  const current = quickLookState.current
  if (current === null || !current.element.isConnected) return false
  const rowRect = current.element.getBoundingClientRect()
  if (pointInRect(rowRect, x, y, 48)) return true
  const bounds = {
    left: Math.min(cardRect.left, rowRect.left),
    right: Math.max(cardRect.right, rowRect.right),
    top: Math.min(cardRect.top, rowRect.top),
    bottom: Math.max(cardRect.bottom, rowRect.bottom)
  }
  return pointInRect(bounds, x, y, 48)
}

/**
 * Locate the file row a pointer is over, in either supported surface.
 * @param target - event target.
 * @returns the row entry, or null outside both surfaces.
 */
function quickLookRowAt(target: unknown): QuickLookEntry | null {
  if (!isQuickLookElement(target)) return null
  if (target.closest('.dsa-quicklook') !== null) return null
  if (target.closest('.dsa-actions') !== null) return null
  const artifact = target.closest('li[data-artifact-path]')
  if (artifact !== null) {
    const path = artifact.getAttribute('data-artifact-path')
    if (path !== null) {
      return { element: artifact, path, name: artifact.getAttribute('data-artifact-name') ?? quickLookBasename(path) }
    }
  }
  const provided = target.closest('li[data-artifact-provided="true"]')
  if (provided !== null) {
    const attachmentId = provided.getAttribute('data-artifact-attachment-id')
    if (attachmentId !== null) {
      const attachment: QuickLookAttachment = {
        attachmentId,
        name: provided.getAttribute('data-artifact-name') ?? '',
        mediaType: provided.getAttribute('data-artifact-media-type') ?? ''
      }
      const bytes = Number(provided.getAttribute('data-artifact-bytes'))
      if (Number.isFinite(bytes)) attachment.bytes = bytes
      const width = Number(provided.getAttribute('data-artifact-width'))
      if (Number.isFinite(width)) attachment.width = width
      const height = Number(provided.getAttribute('data-artifact-height'))
      if (Number.isFinite(height)) attachment.height = height
      const name = attachment.name.length > 0 ? attachment.name : quickLookBasename(attachment.attachmentId)
      return {
        element: provided,
        provided: true,
        attachment,
        name,
        inlineUrl: quickLookApi().attachmentUrl(attachment, 'inline'),
        downloadUrl: quickLookApi().attachmentUrl(attachment, 'attachment')
      }
    }
  }
  const file = target.closest('li[data-files-entry="file"][data-files-path]')
  if (file !== null && file.closest('[data-files-navigator]') !== null) {
    const path = file.getAttribute('data-files-path')
    if (path === null || path === '') return null
    return { element: file, path, name: quickLookBasename(path) }
  }
  return null
}

/**
 * Open the row's own primary action when the card's Open control is used.
 * @param element - row element.
 * @returns click callback, when the row has one.
 */
function quickLookOpenHandler(element: QuickLookElement): (() => void) | null {
  const button = element.querySelector('.dsa-action') ?? element.querySelector('button')
  if (button === null) return null
  return () => {
    button.click()
  }
}

/**
 * Cancel and clear the single hover-preview timer.
 * @returns void
 */
function clearQuickLookTimer(): void {
  if (quickLookState.timer !== null) {
    quickLookWindow().clearTimeout(quickLookState.timer)
    quickLookState.timer = null
  }
}

/**
 * Move to a phase and arm its one timer. A phase owns exactly one timer, so
 * a close timer can never race an opening/switching timer.
 * @param phase - next phase.
 * @param delay - timer delay.
 * @param action - timer callback.
 * @returns void
 */
function enterQuickLookPhase(phase: QuickLookTimerPhase, delay: number, action: () => void): void {
  clearQuickLookTimer()
  quickLookState.phase = phase
  quickLookState.timer = quickLookWindow().setTimeout(() => {
    quickLookState.timer = null
    action()
  }, delay)
}

/**
 * Cancel a pending close and return to the open phase.
 * @returns void
 */
function cancelQuickLookClose(): void {
  if (quickLookState.phase !== 'closing') return
  clearQuickLookTimer()
  quickLookState.phase = quickLookState.card === null ? 'idle' : 'open'
}

/**
 * Close the card and abort its pending read.
 * @returns void
 */
function closeQuickLook(): void {
  clearQuickLookTimer()
  quickLookState.phase = 'idle'
  quickLookState.pendingRow = null
  quickLookState.pendingEntry = null
  quickLookState.switchToken += 1
  quickLookState.lastPointer = null
  if (quickLookState.abort !== null) {
    quickLookState.abort.abort()
    quickLookState.abort = null
  }
  if (quickLookState.card !== null) {
    quickLookState.card.remove()
    quickLookState.card = null
  }
  quickLookState.current = null
  quickLookState.enteredCard = false
  quickLookState.lastCardDistance = null
}

/**
 * Arm the delayed open/switch for one row.
 * @param entry - hover entry.
 * @returns void
 */
function armQuickLookOpen(entry: QuickLookEntry): void {
  quickLookState.pendingRow = entry.element
  quickLookState.pendingEntry = entry
  enterQuickLookPhase(quickLookState.card === null ? 'opening' : 'switching', QUICKLOOK_OPEN_DELAY, () => {
    const row = entry.element
    quickLookState.pendingRow = null
    quickLookState.pendingEntry = null
    if (!row.isConnected) return
    const pointer = quickLookState.lastPointer
    if (pointer !== null) {
      const under = quickLookDocument().elementFromPoint(pointer.x, pointer.y)
      const underRow = isQuickLookElement(under) ? quickLookRowAt(under)?.element ?? null : null
      if (underRow !== row) return
    }
    if (quickLookState.card === null) openQuickLook(entry)
    else switchQuickLook(entry)
  })
}

/**
 * Close after a short grace period so the pointer can reach the card.
 * @param delay - grace period in ms.
 * @returns void
 */
function scheduleQuickLookClose(delay?: number): void {
  if (quickLookState.resizing === true) return
  if (quickLookState.phase === 'opening' || quickLookState.phase === 'switching') return
  enterQuickLookPhase('closing', typeof delay === 'number' ? delay : QUICKLOOK_CARD_EXIT_DELAY, closeQuickLook)
}

/**
 * Position the card beside the hovered row, preferring the free side.
 * @param card - card element.
 * @param element - hovered row.
 * @returns void
 */
function positionQuickLook(card: QuickLookElement, element: QuickLookElement): void {
  const rect = element.getBoundingClientRect()
  const window = quickLookWindow()
  const box = quickLookBox(rect, { width: window.innerWidth, height: window.innerHeight }, quickLookState.size)
  card.style.left = box.left + 'px'
  card.style.top = box.top + 'px'
  card.style.width = box.width + 'px'
  // The content layers are absolutely positioned inside the body, so the
  // card needs an explicit height even before the user resizes it.
  card.style.height = box.height + 'px'
  card.style.maxHeight = 'calc(100vh - 16px)'
}

/**
 * Read one required card part; the shell built in `ensureQuickLookCard` always
 * publishes it, so a missing part means the DOM was replaced under the card.
 * @param card - card element.
 * @param selector - part selector.
 * @returns the part.
 */
function queryCardPart(card: QuickLookElement, selector: string): QuickLookElement {
  const part = card.querySelector(selector)
  if (part === null) throw new Error(`hover quick look: missing ${selector}`)
  return part
}

/**
 * Create the shared card shell once.
 * @returns the card element.
 */
function ensureQuickLookCard(): QuickLookElement {
  if (quickLookState.card !== null) return quickLookState.card
  const document = quickLookDocument()
  const icons = quickLookApi().icons
  const card = document.createElement('aside')
  card.className = 'dsa-quicklook'
  card.setAttribute('role', 'dialog')
  const header = document.createElement('div')
  header.className = 'dsa-quicklook-header'
  const icon = document.createElement('span')
  icon.className = 'dsa-icon'
  icon.appendChild(quickLookSvg(icons.file, 16))
  const title = document.createElement('div')
  title.className = 'dsa-quicklook-title'
  const name = document.createElement('div')
  name.className = 'dsa-quicklook-name'
  const meta = document.createElement('div')
  meta.className = 'dsa-quicklook-meta'
  title.append(name, meta)
  header.append(icon, title)
  const body = document.createElement('div')
  body.className = 'dsa-quicklook-body'
  const footer = document.createElement('div')
  footer.className = 'dsa-quicklook-footer'
  const note = document.createElement('span')
  note.className = 'dsa-quicklook-note'
  const actions = document.createElement('div')
  actions.className = 'dsa-quicklook-actions'
  footer.append(note, actions)
  const handle = document.createElement('div')
  handle.className = 'dsa-quicklook-resize'
  handle.setAttribute('role', 'separator')
  handle.setAttribute('aria-label', quickLookLabels.resize)
  handle.title = quickLookLabels.resize
  const resizeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  resizeIcon.setAttribute('viewBox', '0 0 24 24')
  resizeIcon.setAttribute('width', '16')
  resizeIcon.setAttribute('height', '16')
  resizeIcon.setAttribute('fill', 'none')
  resizeIcon.setAttribute('stroke', 'currentColor')
  resizeIcon.setAttribute('stroke-width', '1.6')
  resizeIcon.setAttribute('stroke-linecap', 'round')
  resizeIcon.setAttribute('stroke-linejoin', 'round')
  resizeIcon.setAttribute('aria-hidden', 'true')
  const resizeShape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  resizeShape.setAttribute('d', 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7')
  resizeIcon.appendChild(resizeShape)
  handle.appendChild(resizeIcon)
  handle.addEventListener('dblclick', (event: QuickLookPointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    quickLookState.size = null
    try {
      localStorage.removeItem(QUICKLOOK_SIZE_KEY)
    } catch {
      // Storage can be unavailable; the in-memory default still applies.
    }
    const current = quickLookState.current
    if (current !== null) positionQuickLook(card, current.element)
  })
  handle.addEventListener('mousedown', (event: QuickLookPointerEvent) => {
    if (quickLookState.card === null) return
    event.stopPropagation()
    const card = quickLookState.card
    const rect = card.getBoundingClientRect()
    const start = {
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width
    }
    quickLookState.resizing = true
    card.setAttribute('data-resizing', 'true')
    card.style.maxHeight = 'calc(100vh - 16px)'
    cancelQuickLookClose()
    const onMove = (moveEvent: QuickLookPointerEvent): void => {
      const maxWidth = Math.min(QUICKLOOK_MAX_WIDTH, start.right - 8)
      const minWidth = Math.min(QUICKLOOK_MIN_WIDTH, maxWidth)
      const maxHeight = quickLookWindow().innerHeight - start.top - 12
      const minHeight = Math.min(QUICKLOOK_MIN_HEIGHT, maxHeight)
      const width = Math.max(minWidth, Math.min(maxWidth, start.width + (start.x - moveEvent.clientX)))
      const height = Math.max(minHeight, Math.min(maxHeight, start.height + (moveEvent.clientY - start.y)))
      card.style.left = Math.round(start.right - width) + 'px'
      card.style.width = Math.round(width) + 'px'
      card.style.height = Math.round(height) + 'px'
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp)
      quickLookState.resizing = false
      card.removeAttribute('data-resizing')
      const box = card.getBoundingClientRect()
      saveQuickLookSize(box.width, box.height)
    }
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp)
  })
  card.append(header, body, footer, handle)
  card.addEventListener('mouseenter', (): void => {
    quickLookState.enteredCard = true
    cancelQuickLookClose()
  })
  card.addEventListener('mouseleave', (): void => scheduleQuickLookClose(QUICKLOOK_CARD_EXIT_DELAY))
  document.body.appendChild(card)
  quickLookState.card = card
  return card
}

/**
 * Render the card footer actions for one entry.
 * @param entry - hover entry.
 * @param card - card element.
 * @returns void
 */
function renderQuickLookActions(entry: QuickLookEntry, card: QuickLookElement): void {
  const document = quickLookDocument()
  const icons = quickLookApi().icons
  const actions = queryCardPart(card, '.dsa-quicklook-actions')
  actions.replaceChildren()
  const onOpen = entry.onOpen
  if (typeof onOpen === 'function') {
    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'dsa-quicklook-action'
    open.title = quickLookLabels.open
    open.setAttribute('aria-label', quickLookLabels.open)
    open.appendChild(quickLookSvg(icons.open, 18))
    open.addEventListener('click', () => {
      closeQuickLook()
      onOpen()
    })
    actions.appendChild(open)
  }
  const download = document.createElement('a')
  download.className = 'dsa-quicklook-action'
  download.title = quickLookLabels.download
  download.setAttribute('aria-label', quickLookLabels.download)
  download.href = entry.provided === true
    ? entry.downloadUrl
    : entry.downloadUrl !== undefined
      ? entry.downloadUrl
      : artifactRawUrl(entry.path, entry.name, 'attachment')
  download.download = entry.name
  download.appendChild(quickLookSvg(icons.download, 18))
  actions.appendChild(download)
}

/**
 * Replace the card body with loading feedback.
 * @param card - card element.
 * @returns void
 */
function showQuickLookLoading(card: QuickLookElement): void {
  const document = quickLookDocument()
  const body = queryCardPart(card, '.dsa-quicklook-body')
  body.replaceChildren()
  const loading = document.createElement('div')
  loading.className = 'dsa-quicklook-loading'
  loading.textContent = quickLookLabels.loading
  body.appendChild(loading)
}

/**
 * Build one content layer for a descriptor.
 * @param entry - hover entry.
 * @param data - Host descriptor, undefined for unavailable.
 * @returns the layer.
 */
function buildQuickLookLayer(entry: QuickLookEntry, data: QuickLookData | undefined): QuickLookElement {
  const document = quickLookDocument()
  const layer = document.createElement('div')
  layer.className = 'dsa-quicklook-layer'
  if (data === undefined) {
    layer.classList.add('dsa-quicklook-layer-media')
    const empty = document.createElement('div')
    empty.className = 'dsa-quicklook-empty'
    empty.appendChild(quickLookSvg(quickLookApi().icons.file, 16))
    const label = document.createElement('span')
    label.textContent = quickLookLabels.unavailable
    empty.appendChild(label)
    layer.appendChild(empty)
    return layer
  }
  if (data.kind === 'image' || data.kind === 'media') layer.classList.add('dsa-quicklook-layer-media')
  const inlineUrl = entry.provided === true
    ? entry.inlineUrl
    : entry.inlineUrl !== undefined
      ? entry.inlineUrl
      : artifactRawUrl(entry.path, entry.name, 'inline')
  if (data.kind === 'image') {
    const image = document.createElement('img')
    image.className = 'dsa-quicklook-image'
    image.src = inlineUrl
    image.alt = entry.name
    image.loading = 'lazy'
    layer.appendChild(image)
  } else if (data.kind === 'media') {
    const video = typeof data.mime === 'string' && data.mime.startsWith('video/')
    const media = document.createElement(video ? 'video' : 'audio')
    media.className = 'dsa-quicklook-media'
    media.src = inlineUrl
    media.controls = true
    media.preload = 'metadata'
    layer.appendChild(media)
  } else if (data.kind === 'pdf' || data.kind === 'html') {
    const frame = document.createElement('iframe')
    frame.className = 'dsa-quicklook-frame'
    frame.src = inlineUrl
    frame.title = entry.name
    if (data.kind === 'html') frame.setAttribute('sandbox', '')
    layer.appendChild(frame)
  } else if (data.kind === 'text') {
    const isMarkdown = /\.(md|markdown)$/i.test(entry.name) || (typeof data.mime === 'string' && data.mime.startsWith('text/markdown'))
    if (isMarkdown) {
      layer.appendChild(renderQuickLookMarkdown(data.text ?? '', entry, artifactRawUrl))
    } else {
      const language = languageForFile(entry.name)
      if (language === '') {
        const pre = document.createElement('pre')
        pre.className = 'dsa-quicklook-text'
        pre.textContent = data.text ?? ''
        layer.appendChild(pre)
      } else {
        layer.appendChild(quickLookCodeElement(data.text ?? '', language))
      }
    }
  } else {
    layer.classList.add('dsa-quicklook-layer-media')
    const empty = document.createElement('div')
    empty.className = 'dsa-quicklook-empty'
    empty.appendChild(quickLookSvg(quickLookApi().icons.file, 16))
    const label = document.createElement('span')
    label.textContent = quickLookLabels.unavailable
    empty.appendChild(label)
    layer.appendChild(empty)
  }
  return layer
}

/**
 * Mount a content layer, crossfading from the previous one (Material's
 * "fade through" with a shared-axis vertical offset).
 * @param card - card element.
 * @param layer - new content layer.
 * @returns void
 */
function mountQuickLookLayer(card: QuickLookElement, layer: QuickLookElement): void {
  const body = queryCardPart(card, '.dsa-quicklook-body')
  const previous = [...body.querySelectorAll('.dsa-quicklook-layer')].pop() ?? null
  for (const old of body.querySelectorAll('.dsa-quicklook-layer')) {
    if (old !== previous) old.remove()
  }
  body.replaceChildren()
  body.appendChild(layer)
  if (previous !== null) body.appendChild(previous)
  const reduced = quickLookReducedMotion()
  if (reduced) {
    previous?.remove()
    return
  }
  if (previous === null) {
    // No inline opacity style: if the animation is dropped (throttled tab,
    // canceled animation) the layer is still visible at its natural opacity.
    layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' })
    return
  }
  const direction = quickLookState.switchDirection || 1
  const title = card.querySelector('.dsa-quicklook-title')
  if (title !== null) {
    title.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 160, easing: 'cubic-bezier(0,0,0,1)' })
  }
  // Outgoing fades out while the incoming layer fades in over it; both use a
  // small vertical shared-axis offset in the list's direction of travel.
  previous.animate([
    { opacity: 1, transform: 'translateY(0)' },
    { opacity: 0, transform: 'translateY(' + (-direction * 6) + 'px)' }
  ], { duration: 160, easing: 'ease-in', fill: 'forwards' })
  const incoming = layer.animate([
    { opacity: 0, transform: 'translateY(' + (direction * 6) + 'px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 200, delay: 20, easing: 'cubic-bezier(0,0,0,1)' })
  const dropPrevious = (): void => previous.remove()
  incoming.onfinish = dropPrevious
  // Fallback for a canceled or never-finishing animation.
  quickLookWindow().setTimeout(dropPrevious, 400)
}

/**
 * Render one preview descriptor into the card.
 * @param entry - hover entry.
 * @param data - Host descriptor.
 * @returns void
 */
function renderQuickLook(entry: QuickLookEntry, data: QuickLookData): void {
  const card = quickLookState.card
  if (card === null || quickLookState.current !== entry) return
  queryCardPart(card, '.dsa-quicklook-name').textContent = entry.name
  queryCardPart(card, '.dsa-quicklook-meta').textContent = typeof data.mime === 'string' ? data.mime : ''
  const note: string[] = []
  if (typeof data.size === 'number') note.push(quickLookApi().formatBytes(data.size))
  if (data.truncated === true) note.push(quickLookLabels.truncated)
  queryCardPart(card, '.dsa-quicklook-note').textContent = note.join(' · ')
  mountQuickLookLayer(card, buildQuickLookLayer(entry, data))
}

/**
 * Replace the card body with the unavailable state.
 * @param entry - hover entry.
 * @returns void
 */
function renderQuickLookUnavailable(entry: QuickLookEntry): void {
  const card = quickLookState.card
  if (card === null || quickLookState.current !== entry) return
  queryCardPart(card, '.dsa-quicklook-name').textContent = entry.name
  queryCardPart(card, '.dsa-quicklook-meta').textContent = ''
  queryCardPart(card, '.dsa-quicklook-note').textContent = ''
  mountQuickLookLayer(card, buildQuickLookLayer(entry, undefined))
}

/**
 * Build a preview descriptor for one user-provided attachment without the
 * workspace preview route: images and media use their attachment URL, text
 * files are fetched read-only and clipped, everything else is unavailable.
 * @param entry - provided-row hover entry.
 * @returns descriptor, or undefined on failure.
 */
async function providedQuickLookData(entry: QuickLookProvidedEntry): Promise<QuickLookData | undefined> {
  const mime = entry.attachment.mediaType
  const bytes = entry.attachment.bytes
  const size = typeof bytes === 'number' ? bytes : undefined
  if (mime.startsWith('image/')) return { mime, size, previewable: true, kind: 'image' }
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return { mime, size, previewable: true, kind: 'media' }
  const textLike = mime.startsWith('text/')
    || /^(?:application\/(?:json|xml|javascript|typescript|x-yaml|x-sh|x-httpd-php))/.test(mime)
    || /\.(?:md|markdown|txt|log|csv|tsv|json|ya?ml|xml|js|mjs|cjs|ts|tsx|jsx|css|scss|sass|sh|bash|zsh|py|go|rs|java|rb|php|html?|sql|diff|patch)$/i.test(entry.name)
  if (!textLike) {
    return { mime: mime.length > 0 ? mime : 'application/octet-stream', size, previewable: false, kind: 'binary' }
  }
  try {
    const response = await fetch(entry.inlineUrl, { credentials: 'same-origin' })
    if (!response.ok) return undefined
    const text = await response.text()
    const limit = 64 * 1024
    return {
      mime: mime.length > 0 ? mime : 'text/plain; charset=utf-8',
      size,
      previewable: true,
      kind: 'text',
      text: text.slice(0, limit),
      truncated: text.length > limit
    }
  } catch {
    return undefined
  }
}

/**
 * Fetch (or reuse) the preview descriptor for one entry.
 * @param entry - hover entry.
 * @returns descriptor, or undefined on failure.
 */
async function requestQuickLookData(entry: QuickLookEntry): Promise<QuickLookData | undefined> {
  const cacheKey = quickLookCacheKey(entry)
  const cached = quickLookState.cache.get(cacheKey)
  if (cached !== undefined) {
    if (quickLookCacheFresh(cached, Date.now())) return cached.data
    quickLookState.cache.delete(cacheKey)
  }
  if (entry.provided === true) return providedQuickLookData(entry)
  if (quickLookState.abort !== null) quickLookState.abort.abort()
  const controller = new AbortController()
  quickLookState.abort = controller
  try {
    const query = 'path=' + encodeURIComponent(entry.path) + '&name=' + encodeURIComponent(entry.name)
    const init: RequestInit & { priority: string } = {
      signal: controller.signal,
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      priority: 'high'
    }
    const response = await fetch(quickLookApi().appUrl(quickLookApi().previewRoute + '?' + query), init)
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const payload: unknown = await response.json()
    const data = payload as QuickLookData
    if (quickLookState.cache.size >= QUICKLOOK_CACHE_LIMIT && !quickLookState.cache.has(cacheKey)) {
      const oldest = quickLookState.cache.keys().next().value
      if (oldest !== undefined) quickLookState.cache.delete(oldest)
    }
    quickLookState.cache.set(cacheKey, { data, at: Date.now() })
    return data
  } catch {
    return undefined
  }
}

/**
 * Load and render a descriptor for the initial open path.
 * @param entry - hover entry.
 * @returns resolves after rendering.
 */
async function loadQuickLook(entry: QuickLookEntry): Promise<void> {
  const data = await requestQuickLookData(entry)
  if (quickLookState.card === null || quickLookState.current !== entry) return
  if (data === undefined) {
    renderQuickLookUnavailable(entry)
    return
  }
  renderQuickLook(entry, data)
}

/**
 * Open the card for one hover entry.
 * @param entry - hover entry.
 * @returns void
 */
function openQuickLook(entry: QuickLookEntry): void {
  clearQuickLookTimer()
  const card = ensureQuickLookCard()
  quickLookState.phase = 'open'
  quickLookState.current = entry
  quickLookState.enteredCard = false
  quickLookState.lastCardDistance = null
  quickLookState.pendingRow = null
  quickLookState.switchToken += 1
  positionQuickLook(card, entry.element)
  queryCardPart(card, '.dsa-quicklook-name').textContent = entry.name
  queryCardPart(card, '.dsa-quicklook-meta').textContent = ''
  queryCardPart(card, '.dsa-quicklook-note').textContent = ''
  renderQuickLookActions(entry, card)
  showQuickLookLoading(card)
  void loadQuickLook(entry)
}

/**
 * Swap the card to another file without removing and re-adding it. The old
 * content fades out, the card slides from its old position to the new one,
 * and the new content fades in. A single state phase owns the transition, so
 * no close timer can race it.
 * @param entry - hover entry for the next file.
 * @returns void
 */
function switchQuickLook(entry: QuickLookEntry): void {
  const card = quickLookState.card
  if (card === null) {
    openQuickLook(entry)
    return
  }
  clearQuickLookTimer()
  if (quickLookState.abort !== null) {
    quickLookState.abort.abort()
    quickLookState.abort = null
  }
  quickLookState.phase = 'switching'
  quickLookState.pendingRow = null
  quickLookState.lastCardDistance = null
  quickLookState.enteredCard = false
  const token = ++quickLookState.switchToken
  const reduced = quickLookReducedMotion()
  const previousRect = card.getBoundingClientRect()
  const previousEntry = quickLookState.current
  const previousRowRect = previousEntry !== null && previousEntry.element.isConnected
    ? previousEntry.element.getBoundingClientRect()
    : null
  const nextRowRect = entry.element.getBoundingClientRect()
  quickLookState.switchDirection = previousRowRect === null
    ? 1
    : (Math.sign(nextRowRect.top - previousRowRect.top) || 1)
  quickLookState.current = entry
  positionQuickLook(card, entry.element)
  queryCardPart(card, '.dsa-quicklook-note').textContent = quickLookLabels.loading
  renderQuickLookActions(entry, card)
  if (!reduced) {
    const nextRect = card.getBoundingClientRect()
    const dx = previousRect.left - nextRect.left
    const dy = previousRect.top - nextRect.top
    const animation = card.animate([
      { transform: 'translate(' + dx + 'px, ' + dy + 'px)' },
      { transform: 'translate(0, 0)' }
    ], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    animation.onfinish = () => {
      card.style.transform = ''
    }
  }
  // Keep the current body visible until the next descriptor is ready, then
  // swap content and fade the new content in. The card itself never fades.
  void requestQuickLookData(entry).then((data) => {
    if (token !== quickLookState.switchToken || quickLookState.card !== card) return
    quickLookState.phase = 'open'
    if (data === undefined) {
      renderQuickLookUnavailable(entry)
    } else {
      renderQuickLook(entry, data)
    }
    const pointer = quickLookState.lastPointer
    if (pointer !== null && !quickLookTraversalContains(pointer.x, pointer.y)) {
      scheduleQuickLookClose(QUICKLOOK_CARD_EXIT_DELAY)
    }
  })
}

/**
 * Install the shared hover-preview surface for both the Artifacts panel and
 * the native Workspace files tree.
 * @param ctx - client root context.
 * @param deps - locale, URL builders, byte formatter and icon paths.
 * @returns void
 */
export function installQuickLook(ctx: HoverQuickLookContext, deps: HoverQuickLookDeps): void {
  quickLookDeps = deps
  quickLookLabels = {
    loading: deps.t('preview.loading'),
    unavailable: deps.t('preview.unavailable'),
    truncated: deps.t('preview.truncated'),
    open: deps.t('action.open'),
    download: deps.t('action.download'),
    resize: deps.t('preview.resize')
  }
  quickLookState.size = loadQuickLookSize()
  ctx.effect(() => {
    const document = quickLookDocument()
    const tag = document.createElement('style')
    tag.dataset.powerSuiteCss = 'quicklook'
    tag.textContent = QUICKLOOK_CSS
    document.head.appendChild(tag)
    return () => tag.remove()
  }, 'power-suite: quick look styles')
  ctx.effect(() => {
    const document = quickLookDocument()
    const window = quickLookWindow()
    const onOver = (event: QuickLookPointerEvent): void => {
      if (quickLookState.resizing === true) return
      const row = quickLookRowAt(event.target)
      if (row === null) return
      cancelQuickLookClose()
      if (quickLookState.current !== null && quickLookState.current.element === row.element) return
      armQuickLookOpen({ ...row, onOpen: quickLookOpenHandler(row.element) })
    }
    const onOut = (event: QuickLookPointerEvent): void => {
      if (quickLookState.resizing === true) return
      const row = quickLookRowAt(event.target)
      if (row === null) return
      const related = event.relatedTarget
      if (isQuickLookNode(related) && row.element.contains(related)) return
      if ((quickLookState.phase === 'opening' || quickLookState.phase === 'switching')
        && quickLookState.pendingRow === row.element) {
        clearQuickLookTimer()
        quickLookState.phase = quickLookState.card === null ? 'idle' : 'open'
        quickLookState.pendingRow = null
        quickLookState.pendingEntry = null
      }
      if (isQuickLookNode(related) && quickLookState.card !== null && quickLookState.card.contains(related)) return
      if (quickLookState.phase === 'opening' || quickLookState.phase === 'switching') return
      if (quickLookTraversalContains(event.clientX, event.clientY)) return
      scheduleQuickLookClose(QUICKLOOK_ROW_EXIT_FALLBACK)
    }
    const onClose = (event: QuickLookEvent): void => {
      const card = quickLookState.card
      if (card !== null && isQuickLookNode(event.target) && card.contains(event.target)) return
      closeQuickLook()
    }
    const onMove = (event: QuickLookPointerEvent): void => {
      quickLookState.lastPointer = { x: event.clientX, y: event.clientY }
      if (quickLookState.phase === 'opening' || quickLookState.phase === 'switching') {
        const pendingRow = quickLookState.pendingRow
        const pendingEntry = quickLookState.pendingEntry
        if (pendingRow !== null && pendingEntry !== null && pendingRow.isConnected) {
          const rect = pendingRow.getBoundingClientRect()
          if (pointInRect(rect, event.clientX, event.clientY, 0)) {
            armQuickLookOpen(pendingEntry)
          }
        }
        return
      }
      const card = quickLookState.card
      if (card === null) return
      const distance = quickLookCardDistance(event.clientX, event.clientY)
      const approaching = quickLookState.lastCardDistance !== null
        && distance < quickLookState.lastCardDistance - 1
      quickLookState.lastCardDistance = distance
      if (distance === 0) {
        quickLookState.enteredCard = true
        cancelQuickLookClose()
        return
      }
      const current = quickLookState.current
      if (current !== null && current.element.isConnected) {
        const rowRect = current.element.getBoundingClientRect()
        if (pointInRect(rowRect, event.clientX, event.clientY, 0)) {
          cancelQuickLookClose()
          return
        }
      }
      if (!quickLookState.enteredCard && quickLookTraversalContains(event.clientX, event.clientY)) {
        cancelQuickLookClose()
        return
      }
      if (approaching) {
        cancelQuickLookClose()
        return
      }
      if (quickLookState.phase !== 'closing') {
        scheduleQuickLookClose(QUICKLOOK_CARD_EXIT_DELAY)
      }
    }
    const onKey = (event: QuickLookKeyEvent): void => {
      if (event.key === 'Escape') closeQuickLook()
    }
    const onWindowLeave = (): void => {
      if (quickLookState.phase !== 'opening' && quickLookState.phase !== 'switching') return
      clearQuickLookTimer()
      quickLookState.phase = quickLookState.card === null ? 'idle' : 'open'
      quickLookState.pendingRow = null
      quickLookState.pendingEntry = null
    }
    const onDismiss = (event: QuickLookPointerEvent): void => {
      const card = quickLookState.card
      if (card === null || !isQuickLookNode(event.target)) return
      if (card.contains(event.target)) return
      const current = quickLookState.current
      if (current !== null && current.element.isConnected && current.element.contains(event.target)) return
      closeQuickLook()
    }
    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('mousedown', onDismiss, true)
    document.addEventListener('mouseout', onOut, true)
    document.addEventListener('scroll', onClose, true)
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('keydown', onKey)
    document.documentElement.addEventListener('mouseleave', onWindowLeave)
    window.addEventListener('blur', onWindowLeave)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('mouseout', onOut, true)
      document.removeEventListener('mousedown', onDismiss, true)
      document.removeEventListener('scroll', onClose, true)
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('keydown', onKey)
      document.documentElement.removeEventListener('mouseleave', onWindowLeave)
      window.removeEventListener('blur', onWindowLeave)
      window.removeEventListener('resize', onClose)
      closeQuickLook()
    }
  }, 'power-suite: quick look listeners')
}
