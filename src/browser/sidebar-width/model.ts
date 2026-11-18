/**
 * Pure sidebar-width decisions for the browser half.
 *
 * The feature mirrors the shell's live sidebar width into a per-origin cache and
 * the Host document. These helpers only validate and decide; attach, drag
 * capture and network belong to the controller in `src/client.js`.
 *
 * @module
 */

/** Host route serving and storing the durable sidebar-width document. */
export const SIDEBAR_WIDTH_ROUTE = 'api/power-suite.sidebar-width'

/** Per-origin browser cache of the last known width and sync state. */
export const SIDEBAR_WIDTH_STORAGE_KEY = 'power-suite.sidebar-width'

/** Width bounds; mirrors the shell's `clampWidth(px, 264, 420)` contract. */
export const SIDEBAR_WIDTH_MIN = 264
export const SIDEBAR_WIDTH_MAX = 420

/** Browser-cache document. */
export interface SidebarWidthCache {
  sidebarWidth: number | null
  pending: boolean
}

/** Host payload verdict. */
export interface SidebarWidthPayload {
  ok: boolean
  sidebarWidth: number | null
}

/**
 * Clamp one candidate width into the shell's sidebar range.
 * @param value - candidate width in px.
 * @returns integer px inside the range, or null when not a finite number.
 */
export function clampSidebarWidth(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(value)))
}

/**
 * Whether one value is already a persistable sidebar width.
 * @param value - candidate width.
 * @returns whether it is an integer inside [264, 420].
 */
export function isValidSidebarWidth(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= SIDEBAR_WIDTH_MIN && value <= SIDEBAR_WIDTH_MAX
}

/**
 * The empty browser-cache document.
 * @returns defaults.
 */
export function emptySidebarWidthCache(): SidebarWidthCache {
  return { sidebarWidth: null, pending: false }
}

/**
 * Parse the browser-cache document. Malformed text, an unknown version and an
 * out-of-range or non-integer width all read as the default document.
 * @param text - localStorage payload.
 * @returns parsed cache.
 */
export function parseSidebarWidthCache(text: unknown): SidebarWidthCache {
  if (typeof text !== 'string' || text.length === 0) return emptySidebarWidthCache()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return emptySidebarWidthCache()
  }
  if (parsed === null || typeof parsed !== 'object') return emptySidebarWidthCache()
  const record = parsed as Record<string, unknown>
  if (record.version !== 1) return emptySidebarWidthCache()
  return {
    sidebarWidth: isValidSidebarWidth(record.sidebarWidth) ? record.sidebarWidth : null,
    pending: record.pending === true
  }
}

/**
 * Serialize the browser-cache document (always version 1).
 * @param cache - `{ sidebarWidth, pending }`.
 * @returns JSON text.
 */
export function serializeSidebarWidthCache(cache: unknown): string {
  const source = cache !== null && typeof cache === 'object' ? cache as Record<string, unknown> : {}
  return JSON.stringify({
    version: 1,
    sidebarWidth: isValidSidebarWidth(source.sidebarWidth) ? source.sidebarWidth : null,
    pending: source.pending === true
  })
}

/**
 * Validate one Host GET/POST response body. A `null` width is a valid
 * "nothing stored yet" document; a wrong version, a missing field or an
 * out-of-range/non-integer width is a protocol failure.
 * @param payload - decoded JSON body.
 * @returns normalized payload.
 */
export function normalizeSidebarWidthPayload(payload: unknown): SidebarWidthPayload {
  const invalid: SidebarWidthPayload = { ok: false, sidebarWidth: null }
  if (payload === null || typeof payload !== 'object') return invalid
  const record = payload as Record<string, unknown>
  if (record.version !== 1) return invalid
  if (!Object.hasOwn(record, 'sidebarWidth')) return invalid
  if (record.sidebarWidth === null) return { ok: true, sidebarWidth: null }
  if (!isValidSidebarWidth(record.sidebarWidth)) return invalid
  return { ok: true, sidebarWidth: record.sidebarWidth }
}

/**
 * Decide whether boot should re-apply the cached width over the shell's
 * in-memory default. A collapsed sidebar stays collapsed and a live drag is
 * never fought; only a valid cached width that differs from the live
 * preference is written.
 * @param input - boot facts.
 * @returns `{ apply }`: the width to apply, or null for no write.
 */
export function sidebarWidthBootstrap(input: unknown): { apply: number | null } {
  const facts = input !== null && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (facts.dragging === true) return { apply: null }
  if (!isValidSidebarWidth(facts.cacheWidth)) return { apply: null }
  if (typeof facts.currentWidth !== 'number' || !Number.isFinite(facts.currentWidth) || facts.currentWidth <= 0) {
    return { apply: null }
  }
  return { apply: Math.round(facts.currentWidth) === facts.cacheWidth ? null : facts.cacheWidth }
}

/**
 * Decide whether one remote width may overwrite the live preference.
 * Adopting while collapsed would expand the sidebar against the user and
 * adopting during a drag would fight the pointer; an unchanged width is a
 * no-op.
 * @param input - adoption facts.
 * @returns whether the remote width may be applied now.
 */
export function shouldAdoptSidebarWidth(input: unknown): boolean {
  const facts = input !== null && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (facts.dragging === true) return false
  if (!isValidSidebarWidth(facts.remoteWidth)) return false
  if (typeof facts.currentWidth !== 'number' || !Number.isFinite(facts.currentWidth) || facts.currentWidth <= 0) {
    return false
  }
  return Math.round(facts.currentWidth) !== facts.remoteWidth
}

/**
 * Decide whether a `0 -> positive` shell toggle must re-apply the durable
 * width. The native toggle writes the contract default (280) on reopen, but a
 * persisted preference wins; a real drag is never fought.
 * @param input - reopen facts.
 * @returns width to re-apply, or null for no write.
 */
export function sidebarWidthReopenRestore(input: unknown): number | null {
  const facts = input !== null && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (facts.dragging === true) return null
  if (!isValidSidebarWidth(facts.preferenceWidth)) return null
  if (typeof facts.width !== 'number' || !Number.isFinite(facts.width) || facts.width <= 0) return null
  return Math.round(facts.width) === facts.preferenceWidth ? null : facts.preferenceWidth
}
