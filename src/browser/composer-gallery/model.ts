/**
 * Pure composer image-gallery decisions for the browser half.
 *
 * The gallery overlay renders pasted-image thumbnails from the composer; these
 * helpers own index clamping, wheel debounce, rail reconciliation and the
 * thumbnail collection. The overlay/React/DOM wiring stays in the browser entry.
 *
 * @module
 */

/** Wheel distance that counts as one navigation gesture. */
export const PSG_WHEEL_STEP_PX = 24

/** Minimum distance between two wheel-driven steps, in milliseconds. */
export const PSG_WHEEL_COOLDOWN_MS = 260

/** One rail image. */
export interface GalleryImage {
  src: string
  name: string
}

/**
 * Clamp a gallery index into `[0, count - 1]` (0 for an empty list).
 * @param index - candidate index.
 * @param count - number of images.
 * @returns the clamped index.
 */
export function psgClampIndex(index: number, count: number): number {
  const length = Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0
  if (length === 0) return 0
  const value = Number.isFinite(index) ? Math.trunc(index) : 0
  return Math.min(Math.max(0, value), length - 1)
}

/**
 * Move one image in the given direction, clamped at the ends (no wrap).
 * @param index - current index.
 * @param count - number of images.
 * @param delta - positive for next, negative for previous.
 * @returns the next clamped index.
 */
export function psgStepIndex(index: number, count: number, delta: number): number {
  const length = Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0
  if (length === 0) return 0
  const current = psgClampIndex(index, length)
  if (delta > 0) return Math.min(current + 1, length - 1)
  if (delta < 0) return Math.max(current - 1, 0)
  return current
}

/**
 * Reconcile an open gallery with a new rail snapshot. When the displayed image
 * still exists its position follows that src; otherwise the index clamps into
 * the new list (shows the neighbour). An empty list yields an empty result.
 * @param images - fresh rail snapshot.
 * @param index - current index.
 * @param currentSrc - src currently displayed.
 * @returns reconciled state.
 */
export function psgSyncState(images: unknown, index: number, currentSrc: unknown): { images: GalleryImage[], index: number } {
  const list = Array.isArray(images) ? images as GalleryImage[] : []
  if (list.length === 0) return { images: [], index: 0 }
  if (typeof currentSrc === 'string' && currentSrc.length > 0) {
    const found = list.findIndex((image) => image !== null && typeof image === 'object' && image.src === currentSrc)
    if (found >= 0) return { images: list, index: found }
  }
  return { images: list, index: psgClampIndex(index, list.length) }
}

/**
 * One wheel-gesture decision. Small deltas accumulate; a step fires once the
 * accumulation reaches {@link PSG_WHEEL_STEP_PX} and the cooldown since the last
 * step has elapsed (momentum events inside the cooldown are swallowed).
 * @param accumulated - pending wheel distance.
 * @param deltaY - this event's delta.
 * @param now - current timestamp (ms).
 * @param lastStepAt - timestamp of the previous step (ms).
 * @returns the decision.
 */
export function psgWheelDecision(
  accumulated: number,
  deltaY: number,
  now: number,
  lastStepAt: number
): { accum: number, step: -1 | 0 | 1, lastStepAt: number } {
  const pending = (Number.isFinite(accumulated) ? accumulated : 0) + (Number.isFinite(deltaY) ? deltaY : 0)
  const time = Number.isFinite(now) ? now : 0
  const previous = Number.isFinite(lastStepAt) ? lastStepAt : Number.NEGATIVE_INFINITY
  if (Math.abs(pending) < PSG_WHEEL_STEP_PX) return { accum: pending, step: 0, lastStepAt: previous }
  if (time - previous < PSG_WHEEL_COOLDOWN_MS) return { accum: 0, step: 0, lastStepAt: previous }
  return { accum: 0, step: pending > 0 ? 1 : -1, lastStepAt: time }
}

/** One collected thumbnail. */
export interface CollectedImage {
  src: string
  name: string
  button: HTMLElement
}

/**
 * Collect the composer's openable pasted-image thumbnails in rail order.
 * @param composer - composer region element.
 * @returns rail images.
 */
export function psgCollectImages(composer: Element | null): CollectedImage[] {
  const images: CollectedImage[] = []
  if (typeof HTMLElement !== 'function' || !(composer instanceof HTMLElement)) return images
  const seen = new Set<string>()
  for (const button of composer.querySelectorAll('button')) {
    if (typeof HTMLElement !== 'function' || !(button instanceof HTMLElement)) continue
    const img = button.querySelector('img')
    if (typeof HTMLImageElement !== 'function' || !(img instanceof HTMLImageElement)) continue
    // The thumbnail button contains exactly the image; the remove button next to
    // it has an SVG, and refused/failed uploads carry an aria-label error.
    if (button.querySelector('svg') !== null) continue
    if (button.hasAttribute('aria-label')) continue
    if (button.children.length !== 1 || button.firstElementChild !== img) continue
    const title = button.getAttribute('title')
    if (typeof title !== 'string' || title.length === 0) continue
    const src = img.getAttribute('src')
    if (typeof src !== 'string' || src.length === 0 || seen.has(src)) continue
    seen.add(src)
    images.push({ src, name: img.getAttribute('alt') || '', button })
  }
  return images
}
