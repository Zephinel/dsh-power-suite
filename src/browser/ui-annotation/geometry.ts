/**
 * Pure geometry and layout math for UI-element annotation.
 *
 * The overlay, launcher, popover and detail card all position themselves
 * against the viewport, the native Sidebars and the annotation rail. These
 * helpers own that arithmetic plus the segmented-control index/label rules so
 * the controller only measures and renders. No DOM access, no timers and no
 * controller state: callers pass plain rectangles and sizes in.
 *
 * @module
 */

/** One viewport-relative point. */
export interface Point {
  x: number
  y: number
}

/** One width/height pair. */
export interface Size {
  width: number
  height: number
}

/** One viewport-relative rectangle. */
export interface Rect extends Point, Size {}

/** One clamped detail-card position plus the side it was placed on. */
export interface DetailCardPosition extends Point {
  placement: 'right' | 'left'
}

/** Layout mode chosen for the rail. */
export type AnnotationLayoutMode = 'shrink' | 'overlay'

/** One segmented-control movement. */
export type AnnotationSegmentMove = 'next' | 'prev' | 'first' | 'last'

/** A3/T6: detail card size used before its first measurement (width is fixed). */
export const ANNOTATION_DETAIL_SIZE: Readonly<Size> = { width: 320, height: 240 }

/** Default gap from every viewport edge. */
const VIEWPORT_MARGIN = 8

/** Default launcher edge length used by the clamp when no size is supplied. */
const LAUNCHER_DEFAULT_SIZE = 40

/** Fallback popover width/height used before the first measurement. */
const POPOVER_DEFAULT_WIDTH = 320
const POPOVER_DEFAULT_HEIGHT = 232

/** The collapsed rail strip width. */
const RAIL_COLLAPSED_WIDTH = 48

/** Rail width clamps for the collection/settings view and the compact rail. */
const RAIL_WIDE_MIN = 320
const RAIL_WIDE_MAX = 420
const RAIL_WIDE_RATIO = 0.24
const RAIL_COMPACT_MIN = 188
const RAIL_COMPACT_MAX = 236
const RAIL_COMPACT_RATIO = 0.116

/** Minimum content width required to shrink the page instead of overlaying. */
const LAYOUT_SHRINK_MIN = 560

/**
 * Read one numeric field from an untrusted object without throwing.
 * @param source - candidate object.
 * @param key - field name.
 * @returns the number when the field is a number, else null.
 */
function numberField(source: unknown, key: string): number | null {
  if (source === null || typeof source !== 'object') return null
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : null
}

/**
 * Read one finite numeric field from an untrusted object.
 * @param source - candidate object.
 * @param key - field name.
 * @returns the finite number when present, else null.
 */
function finiteField(source: unknown, key: string): number | null {
  const value = numberField(source, key)
  return value !== null && Number.isFinite(value) ? value : null
}

/**
 * A3/T55: move one segmented-control selection index (radiogroup semantics).
 * `next`/`prev` wrap; `first`/`last` clamp; an empty list has no active index.
 * @param current - current selected index (-1 when none).
 * @param move - movement.
 * @param length - segment count.
 * @returns next index, or -1 for an empty list.
 */
export function annotationSegmentedIndex(current: number, move: string, length: number): number {
  const count = typeof length === 'number' && Number.isFinite(length) && length > 0 ? Math.floor(length) : 0
  if (count === 0) return -1
  if (move === 'first') return 0
  if (move === 'last') return count - 1
  const base = typeof current === 'number' && Number.isFinite(current) && current >= 0 ? Math.floor(current) : 0
  if (move === 'prev') return ((base - 1) % count + count) % count
  return ((base + 1) % count + count) % count
}

/**
 * A3/T57: visible label for one segmented modifier option. The i18n labels are
 * `"<symbol> / <Name>"`; segments show symbol + short name (`⌥ Alt`, `⌃ Ctrl`).
 * Labels without a separator are returned unchanged.
 * @param label - dictionary label.
 * @returns display label.
 */
export function annotationSegmentDisplayLabel(label: unknown): string {
  const text = typeof label === 'string' ? label.trim() : ''
  if (text.length === 0) return ''
  const parts = text.split('/').map((part) => part.trim()).filter((part) => part.length > 0)
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`
  return parts[0] ?? ''
}

/**
 * Clamp the launcher into the viewport with a margin.
 * @param pos - desired top-left position.
 * @param viewport - viewport size.
 * @param size - launcher edge length, default 40.
 * @param margin - minimum gap from every edge, default 8.
 * @returns clamped position.
 */
export function clampLauncherPosition(pos: unknown, viewport: unknown, size?: number, margin?: number): Point {
  const edge = typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : LAUNCHER_DEFAULT_SIZE
  const gap = typeof margin === 'number' && Number.isFinite(margin) && margin >= 0 ? margin : VIEWPORT_MARGIN
  const width = numberField(viewport, 'width') ?? 0
  const height = numberField(viewport, 'height') ?? 0
  const maxX = Math.max(gap, width - edge - gap)
  const maxY = Math.max(gap, height - edge - gap)
  const rawX = finiteField(pos, 'x') ?? width - edge - gap
  const rawY = finiteField(pos, 'y') ?? height - edge - gap
  return {
    x: Math.round(Math.min(Math.max(rawX, gap), maxX)),
    y: Math.round(Math.min(Math.max(rawY, gap), maxY))
  }
}

/**
 * Place the popover beside a target rect, inside the viewport and left of the rail.
 * @param rect - target rect.
 * @param popoverSize - popover size.
 * @param viewport - viewport size.
 * @param railWidth - reserved right strip width, default 0.
 * @param margin - minimum gap from every edge, default 8.
 * @returns clamped position.
 */
export function clampPopoverPosition(
  rect: unknown,
  popoverSize: unknown,
  viewport: unknown,
  railWidth?: number,
  margin?: number
): Point {
  const gap = typeof margin === 'number' && Number.isFinite(margin) && margin >= 0 ? margin : VIEWPORT_MARGIN
  const rail = typeof railWidth === 'number' && Number.isFinite(railWidth) && railWidth > 0 ? railWidth : 0
  const width = numberField(viewport, 'width') ?? 0
  const height = numberField(viewport, 'height') ?? 0
  const popoverWidth = numberField(popoverSize, 'width') ?? POPOVER_DEFAULT_WIDTH
  const popoverHeight = numberField(popoverSize, 'height') ?? POPOVER_DEFAULT_HEIGHT
  const targetX = finiteField(rect, 'x') ?? 0
  const targetY = finiteField(rect, 'y') ?? 0
  const targetWidth = finiteField(rect, 'width') ?? 0
  const targetHeight = finiteField(rect, 'height') ?? 0
  const maxX = Math.max(gap, width - rail - popoverWidth - gap)
  const maxY = Math.max(gap, height - popoverHeight - gap)
  let x = targetX + targetWidth + gap + 4
  if (x > maxX) x = targetX - popoverWidth - gap - 4
  let y = targetY
  if (y > maxY) y = targetY + targetHeight - popoverHeight
  return {
    x: Math.round(Math.min(Math.max(x, gap), maxX)),
    y: Math.round(Math.min(Math.max(y, gap), maxY))
  }
}

/**
 * Clamp one existing popover position into the viewport (pinned drags).
 * Unlike {@link clampPopoverPosition} this preserves the dragged offset and
 * only moves the popover as far as needed to stay on-screen.
 * @param position - current popover position.
 * @param popoverSize - measured popover size.
 * @param viewport - viewport size.
 * @param railWidth - reserved annotation rail width.
 * @param margin - edge margin (default 8).
 * @returns clamped position.
 */
export function clampPopoverPositionToViewport(
  position: unknown,
  popoverSize: unknown,
  viewport: unknown,
  railWidth?: number,
  margin?: number
): Point {
  const gap = typeof margin === 'number' && Number.isFinite(margin) && margin >= 0 ? margin : VIEWPORT_MARGIN
  const rail = typeof railWidth === 'number' && Number.isFinite(railWidth) && railWidth > 0 ? railWidth : 0
  const width = numberField(viewport, 'width') ?? 0
  const height = numberField(viewport, 'height') ?? 0
  const popoverWidth = numberField(popoverSize, 'width') ?? POPOVER_DEFAULT_WIDTH
  const popoverHeight = numberField(popoverSize, 'height') ?? POPOVER_DEFAULT_HEIGHT
  const x = finiteField(position, 'x') ?? gap
  const y = finiteField(position, 'y') ?? gap
  const maxX = Math.max(gap, width - rail - popoverWidth - gap)
  const maxY = Math.max(gap, height - popoverHeight - gap)
  return { x: Math.round(Math.min(Math.max(x, gap), maxX)), y: Math.round(Math.min(Math.max(y, gap), maxY)) }
}

/**
 * Place the floating detail card beside a marked rect (A3/T6).
 *
 * Prefers the right side of the element aligned to its top, flips to the left
 * when the card would cross the reserved rail strip, flips above when there is
 * no room below, and finally clamps to an 8 px viewport margin.
 * @param rect - mark rect.
 * @param cardSize - measured/estimated card size.
 * @param viewport - viewport size.
 * @param railWidth - reserved right strip width, default 0.
 * @param margin - minimum gap from every edge, default 8.
 * @returns clamped position plus the chosen side.
 */
export function clampDetailCardPosition(
  rect: unknown,
  cardSize: unknown,
  viewport: unknown,
  railWidth?: number,
  margin?: number
): DetailCardPosition {
  const gap = typeof margin === 'number' && Number.isFinite(margin) && margin >= 0 ? margin : VIEWPORT_MARGIN
  const rail = typeof railWidth === 'number' && Number.isFinite(railWidth) && railWidth > 0 ? railWidth : 0
  const width = numberField(viewport, 'width') ?? 0
  const height = numberField(viewport, 'height') ?? 0
  const measuredWidth = numberField(cardSize, 'width')
  const measuredHeight = numberField(cardSize, 'height')
  const cardWidth = measuredWidth !== null && measuredWidth > 0 ? measuredWidth : ANNOTATION_DETAIL_SIZE.width
  const cardHeight = measuredHeight !== null && measuredHeight > 0 ? measuredHeight : ANNOTATION_DETAIL_SIZE.height
  const targetX = finiteField(rect, 'x') ?? 0
  const targetY = finiteField(rect, 'y') ?? 0
  const targetWidth = finiteField(rect, 'width') ?? 0
  const targetHeight = finiteField(rect, 'height') ?? 0
  const maxX = Math.max(gap, width - rail - cardWidth - gap)
  const maxY = Math.max(gap, height - cardHeight - gap)
  let placement: 'right' | 'left' = 'right'
  let x = targetX + targetWidth + gap
  if (x > maxX) {
    placement = 'left'
    x = targetX - cardWidth - gap
  }
  x = Math.round(Math.min(Math.max(x, gap), maxX))
  // Align to the element's top; a card with no room below is bottom-aligned.
  let y = targetY
  if (y + cardHeight > height - gap) y = targetY + targetHeight - cardHeight
  y = Math.round(Math.min(Math.max(y, gap), maxY))
  return { x, y, placement }
}

/**
 * Compute the rail width for one viewport.
 * @param viewportWidth - window inner width.
 * @param collapsed - whether the rail is collapsed to its strip, default false.
 * @param view - active rail view; the collection/settings views use the wide clamp.
 * @returns rail width in pixels.
 */
export function computeRailWidth(viewportWidth: number, collapsed?: boolean, view?: string): number {
  if (collapsed === true) return RAIL_COLLAPSED_WIDTH
  const width = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) ? viewportWidth : 0
  // A3/T25: the redesigned collection sidebar needs room for readable rows and
  // group cards; status/settings keep the compact rail.
  if (view === 'collection' || view === 'settings') {
    return Math.min(RAIL_WIDE_MAX, Math.max(RAIL_WIDE_MIN, Math.round(width * RAIL_WIDE_RATIO)))
  }
  return Math.min(RAIL_COMPACT_MAX, Math.max(RAIL_COMPACT_MIN, Math.round(width * RAIL_COMPACT_RATIO)))
}

/**
 * Decide whether the layout can shrink or the rail must float over the page.
 * @param viewportWidth - window inner width.
 * @param sidebarWidth - native left + right sidebar widths.
 * @param railWidth - rail width to reserve.
 * @returns layout mode.
 */
export function layoutModeFor(viewportWidth: number, sidebarWidth: number, railWidth: number): AnnotationLayoutMode {
  const width = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) ? viewportWidth : 0
  const side = typeof sidebarWidth === 'number' && Number.isFinite(sidebarWidth) ? sidebarWidth : 0
  const rail = typeof railWidth === 'number' && Number.isFinite(railWidth) ? railWidth : 0
  return width - side - rail >= LAYOUT_SHRINK_MIN ? 'shrink' : 'overlay'
}
