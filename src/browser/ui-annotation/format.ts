/**
 * Pure display-formatting model for UI-element annotation.
 *
 * These helpers turn captured identity into the short labels the overlay,
 * serializers and persisted records show: a Session's compact id, a Workspace
 * basename, a query-free route path, a local clock time, the localized
 * label/value join, and normalized bounds/viewport rectangles. Nothing here
 * touches the DOM, storage or translation; the controller passes already
 * localized labels in and owns persistence.
 *
 * @module
 */

/** One normalized annotation bounds rectangle. */
export interface AnnotationBounds {
  x: number
  y: number
  width: number
  height: number
}

/** One normalized captured viewport size. */
export interface AnnotationViewport {
  width: number
  height: number
}

/** Maximum display length of a Workspace basename. */
const WORKSPACE_LABEL_MAX = 80

/** Maximum stored length of one route pathname. */
const ROUTE_PATH_MAX = 300

/**
 * Short display form of one Session identity.
 *
 * DSH Session ids carry a `session-` prefix followed by a UUID; the prefix
 * is dropped so two Sessions never render the same `session-` stem.
 * @param sessionId - Session identity.
 * @returns eight compact characters, or an empty string.
 */
export function sessionShortLabel(sessionId: unknown): string {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return ''
  const bare = sessionId.startsWith('session-') ? sessionId.slice('session-'.length) : sessionId
  const compact = bare.replace(/[^0-9A-Za-z]/g, '')
  if (compact.length > 0) return compact.slice(0, 8)
  return sessionId.slice(0, 8)
}

/**
 * Workspace display label derived from one Session's working directory.
 *
 * The full `cwd` is persisted (D6) so a record can name its Workspace across
 * reloads; only the basename is shown. Trailing separators are ignored and
 * both platforms' separators are accepted.
 * @param cwd - absolute working directory.
 * @returns display label, or null when unavailable.
 */
export function annotationWorkspaceLabel(cwd: unknown): string | null {
  if (typeof cwd !== 'string' || cwd.length === 0) return null
  const parts = cwd.split(/[\\/]+/).filter((part) => part.length > 0)
  const label = parts.length > 0 ? parts[parts.length - 1] : ''
  if (label.length === 0) return null
  return label.length > WORKSPACE_LABEL_MAX ? `${label.slice(0, WORKSPACE_LABEL_MAX - 1)}…` : label
}

/**
 * Normalize one navigation pathname for the persisted record.
 *
 * Only the pathname is kept: query strings and fragments can carry tokens and
 * are never stored (D11 privacy contract).
 * @param pathname - location.pathname or a raw route string.
 * @returns `/`-leading path without query/fragment.
 */
export function annotationRoutePath(pathname: unknown): string {
  if (typeof pathname !== 'string' || pathname.length === 0) return '/'
  const cut = pathname.split(/[?#]/)[0]
  const path = cut.startsWith('/') ? cut : `/${cut}`
  return path.length > ROUTE_PATH_MAX ? path.slice(0, ROUTE_PATH_MAX) : path
}

/**
 * Format one epoch-ms timestamp as local 24-hour HH:MM.
 * @param at - epoch milliseconds.
 * @returns clock label.
 */
export function formatAnnotationTime(at: unknown): string {
  const value = typeof at === 'number' && Number.isFinite(at) ? at : Date.now()
  const date = new Date(value)
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Join one colon-bearing label with its value. A full-width Chinese colon
 * takes no following space; an ASCII colon takes one.
 * @param label - localized label such as `Reference:` / `定位：`.
 * @param value - the value after the colon.
 * @returns one formatted line fragment.
 */
export function annotationJoinLabel(label: unknown, value: string): string {
  const text = typeof label === 'string' ? label.trimEnd() : ''
  if (text.length === 0) return value
  if (text.endsWith('：')) return `${text}${value}`
  if (text.endsWith(':')) return `${text} ${value}`
  return `${text}: ${value}`
}

/**
 * Normalize one bounds rectangle into plain rounded numbers.
 * @param bounds - possibly partial rectangle.
 * @returns normalized rectangle, or null when a field is missing/not finite.
 */
export function normalizeAnnotationBounds(bounds: unknown): AnnotationBounds | null {
  if (bounds === null || typeof bounds !== 'object') return null
  const source = bounds as Partial<AnnotationBounds>
  const x = typeof source.x === 'number' && Number.isFinite(source.x) ? Math.round(source.x) : null
  const y = typeof source.y === 'number' && Number.isFinite(source.y) ? Math.round(source.y) : null
  const width = typeof source.width === 'number' && Number.isFinite(source.width) ? Math.round(source.width) : null
  const height = typeof source.height === 'number' && Number.isFinite(source.height) ? Math.round(source.height) : null
  if (x === null || y === null || width === null || height === null) return null
  return { x, y, width, height }
}

/**
 * Normalize one captured viewport size.
 * @param viewport - possibly partial `{ width, height }`.
 * @returns normalized size, or null.
 */
export function normalizeAnnotationViewport(viewport: unknown): AnnotationViewport | null {
  if (viewport === null || typeof viewport !== 'object') return null
  const source = viewport as Partial<AnnotationViewport>
  const width = typeof source.width === 'number' && Number.isFinite(source.width) && source.width > 0 ? Math.round(source.width) : null
  const height = typeof source.height === 'number' && Number.isFinite(source.height) && source.height > 0 ? Math.round(source.height) : null
  if (width === null || height === null) return null
  return { width, height }
}
