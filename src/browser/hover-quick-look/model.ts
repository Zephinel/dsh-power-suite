/**
 * Pure state and geometry for the hover quick-look card.
 *
 * The card is the shared Quick Look-style preview used by the Artifacts rows
 * and the native Workspace files tree. This module owns the types both halves
 * exchange, the persisted box size, the placement arithmetic and the cache
 * decisions. DOM access, timers and the listeners stay in `install.ts`, so the
 * decisions here are inert and testable without a browser.
 *
 * @module
 */

import type { QuickLookElement, QuickLookRect } from './dom.ts'

/** One width/height pair of the persistent preview box. */
export interface QuickLookSize {
  width: number
  height: number
}

/** One viewport point. */
export interface QuickLookPoint {
  x: number
  y: number
}

/** The four edges of the placed card. */
export interface QuickLookBox {
  left: number
  top: number
  width: number
  height: number
}

/** The viewport facts the placement reads. */
export interface QuickLookViewport {
  readonly width: number
  readonly height: number
}

/** One user-provided attachment row carried by the preview. */
export interface QuickLookAttachment {
  attachmentId: string
  name: string
  mediaType: string
  bytes?: number
  width?: number
  height?: number
}

/** Fields every hover entry shares. */
interface QuickLookEntryBase {
  element: QuickLookElement
  name: string
  inlineUrl?: string
  downloadUrl?: string
  onOpen?: (() => void) | null
}

/** A workspace file row (Artifacts list or native Workspace files tree). */
export interface QuickLookPathEntry extends QuickLookEntryBase {
  provided?: false
  path: string
}

/** A user-provided attachment row; both URLs are prebuilt from its reference. */
export interface QuickLookProvidedEntry extends QuickLookEntryBase {
  provided: true
  attachment: QuickLookAttachment
  inlineUrl: string
  downloadUrl: string
}

/** One row that can open the shared preview. */
export type QuickLookEntry = QuickLookPathEntry | QuickLookProvidedEntry

/** The Host preview descriptor rendered by the card. */
export interface QuickLookData {
  kind?: string
  mime?: string
  size?: number
  truncated?: boolean
  text?: string
  previewable?: boolean
}

/** One cached descriptor read. */
export interface QuickLookCacheEntry {
  data: QuickLookData
  at: number
}

/** The file descriptor the Markdown renderer resolves relative images against. */
export interface QuickLookRenderContext {
  name: string
  path?: string
}

/** Card phases; a phase owns exactly one timer. */
export type QuickLookPhase = 'idle' | 'opening' | 'open' | 'switching' | 'closing'

/** One requested preview-box size saved in localStorage. */
export const QUICKLOOK_SIZE_KEY = 'dsh-power-suite.quicklook.size'

// Geometry mirrors the Dex extension popup panel: 570px default width,
// 800px maximum, 400px minimum height; every value is still clamped to the
// viewport before use.
export const QUICKLOOK_DEFAULT_WIDTH = 570
export const QUICKLOOK_MIN_WIDTH = 380
export const QUICKLOOK_MAX_WIDTH = 800
export const QUICKLOOK_MIN_HEIGHT = 280
export const QUICKLOOK_DEFAULT_HEIGHT = 360

/** Bounded preview-descriptor cache. */
export const QUICKLOOK_CACHE_LIMIT = 120
export const QUICKLOOK_CACHE_TTL_MS = 30000

/** Grace periods around the row/card traversal. */
export const QUICKLOOK_ROW_EXIT_FALLBACK = 1000
export const QUICKLOOK_CARD_EXIT_DELAY = 300

/** Delay before the card opens or switches to another row. */
export const QUICKLOOK_OPEN_DELAY = 420

/**
 * Parse the remembered preview box without trusting localStorage.
 * @param raw - stored JSON text, or null.
 * @returns the saved size, or null when the value is unusable.
 */
export function parseQuickLookSize(raw: string | null): QuickLookSize | null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== 'object') return null
    const width = (value as { width?: unknown }).width
    const height = (value as { height?: unknown }).height
    if (typeof width !== 'number' || typeof height !== 'number') return null
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    return { width, height }
  } catch {
    return null
  }
}

/**
 * Place the card beside the hovered row, preferring the free side.
 * The returned pixels are already rounded for direct style assignment.
 * @param rect - hovered row rectangle.
 * @param viewport - viewport size.
 * @param saved - remembered box size, when any.
 * @returns the placed box.
 */
export function quickLookBox(
  rect: Pick<QuickLookRect, 'left' | 'right' | 'top'>,
  viewport: QuickLookViewport,
  saved: QuickLookSize | null
): QuickLookBox {
  const viewportWidth = viewport.width
  const viewportHeight = viewport.height
  const maxWidth = Math.min(QUICKLOOK_MAX_WIDTH, viewportWidth - 24)
  const minWidth = Math.min(QUICKLOOK_MIN_WIDTH, maxWidth)
  const width = Math.max(minWidth, Math.min(saved === null ? QUICKLOOK_DEFAULT_WIDTH : saved.width, maxWidth))
  const maxHeight = viewportHeight - 32
  const minHeight = Math.min(QUICKLOOK_MIN_HEIGHT, maxHeight)
  const height = saved === null
    ? Math.max(minHeight, Math.min(QUICKLOOK_DEFAULT_HEIGHT, maxHeight))
    : Math.max(minHeight, Math.min(saved.height, maxHeight))
  let left = rect.left - width - 14
  if (left < 8) left = Math.min(rect.right + 14, viewportWidth - width - 8)
  left = Math.max(8, left)
  const top = Math.max(8, Math.min(rect.top - 12, viewportHeight - height - 8))
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height)
  }
}

/**
 * Stable cache identity of one hover entry: its attachment id or path.
 * @param entry - hover entry.
 * @returns the cache key.
 */
export function quickLookCacheKey(entry: QuickLookEntry): string {
  return entry.provided === true ? `attachment:${entry.attachment.attachmentId}` : entry.path
}

/**
 * Whether a cached descriptor is still fresh.
 * @param entry - cached read.
 * @param now - current timestamp.
 * @returns true when the entry can be reused.
 */
export function quickLookCacheFresh(entry: QuickLookCacheEntry, now: number): boolean {
  return now - entry.at < QUICKLOOK_CACHE_TTL_MS
}

/**
 * Last path segment of a file path.
 * @param path - file path.
 * @returns the file name.
 */
export function quickLookBasename(path: string): string {
  return path.split(/[\\/]/).pop() ?? ''
}
