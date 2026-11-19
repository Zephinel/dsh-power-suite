/**
 * Pure text model for UI-element annotation capture.
 *
 * Every string that leaves the page passes through these helpers: control and
 * zero-width characters are stripped, secret-shaped values are redacted, notes
 * the user typed survive verbatim, attribute names and values are allow-listed,
 * captured text is digested for change detection, and locator identifiers are
 * escaped for CSS. The helpers are side-effect free; the controller owns DOM
 * capture and persistence.
 *
 * @module
 */

/** Control and zero-width characters stripped from every captured string. */
export const ANNOTATION_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g

/** Redaction patterns, longest/most specific first. */
const ANNOTATION_REDACTIONS: readonly RegExp[] = [
  /\bbearer\s+[a-z0-9._~+/-]+=*/gi,
  /\bsk-[a-z0-9_-]{8,}/gi,
  /\bAKIA[0-9A-Z]{16}\b/gi,
  /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/gi,
  /\b(?:[A-Fa-f0-9]{24,}|[A-Za-z0-9+/_-]{24,}={0,2})\b/g,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
]

/** Attribute names never exposed through a locator. */
const SENSITIVE_ATTRIBUTE_NAMES = /token|secret|password|passwd|authorization|cookie|csrf|session[-_]?key/i

/**
 * Secret-shaped values that are rejected even for a known stable attribute.
 * A proven secret always wins over the namespace allowance. Matching is
 * case-insensitive so `Bearer`/`bearer`, `SK-`/`sk-`, AWS keys and JWTs are
 * all rejected by the same cheap pass (R3).
 */
const SENSITIVE_SECRET_VALUES = /bearer\s|sk-[a-z0-9_-]{8,}|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i

/** Attribute values that must never be captured, even under a safe name. */
const SENSITIVE_ATTRIBUTE_VALUES = /bearer\s|sk-[a-z0-9_-]{8,}|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b[A-Fa-f0-9]{24,}\b|\b[A-Za-z0-9+/_-]{24,}={0,2}\b/i

/**
 * Stable data attributes whose values may legitimately be a namespaced key
 * (`session:<uuid>`) or a bare UUID; those shapes are longer than the generic
 * long-token secret heuristic would allow.
 */
export const STABLE_KEY_ATTRIBUTES: ReadonlySet<string> = new Set([
  'data-row-key',
  'data-conversation-region',
  'data-conversation-session',
  'data-lexical-editor',
  'data-testid',
  'data-slot',
  'data-sidebar-toggle'
])

/** A colon-namespaced stable key such as `session:<uuid>`. */
const NAMESPACED_KEY_PATTERN = /^[a-z][a-z0-9_-]*:[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/

/** A bare UUID used as a stable key. */
const UUID_PATTERN = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/

/**
 * A DSH Session id shaped `session-<uuid>`, the real value the shell writes
 * into `data-conversation-session` (R2). Narrow on purpose: only this shape,
 * never a generic long token.
 */
const SESSION_ID_PATTERN = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Default maximum length of one sanitized display/capture string. */
const SANITIZED_TEXT_MAX = 80

/** Maximum length of the text a digest covers. */
const TEXT_DIGEST_MAX = 4096

/** The browser platform's CSS escaper, when the page provides one. */
interface CssEscaper {
  escape(value: string): string
}

/**
 * Escape one value for use inside a double-quoted CSS attribute selector.
 * @param value - raw attribute value.
 * @returns escaped value.
 */
export function cssString(value: unknown): string {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ')
}

/**
 * Escape one id for use in an id selector, using the platform escaper when present.
 * @param id - raw id value.
 * @returns escaped id.
 */
export function cssIdentifier(id: unknown): string {
  const text = String(id)
  try {
    const platformCss = (globalThis as { CSS?: Partial<CssEscaper> }).CSS
    if (platformCss !== undefined && platformCss !== null && typeof platformCss.escape === 'function') return platformCss.escape(text)
  } catch {
    // Fall through to the conservative escaper.
  }
  // CSS.escape fallback: a leading digit must become a hex escape, not a
  // bare identifier start (`123abc` is invalid as an id selector).
  let escaped = ''
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (index === 0 && /[0-9]/.test(character)) {
      const codePoint = character.codePointAt(0) ?? 0
      escaped += `\\${codePoint.toString(16)} `
      continue
    }
    escaped += /[A-Za-z0-9_-]/.test(character) ? character : `\\${character}`
  }
  return escaped
}

/**
 * Redact and truncate one user/DOM string for display or insertion.
 * @param value - raw value.
 * @param max - maximum output length, default 80.
 * @returns sanitized text.
 */
export function sanitizeText(value: unknown, max?: number): string {
  if (typeof value !== 'string' || value.length === 0) return ''
  const limit = typeof max === 'number' && Number.isFinite(max) && max > 0 ? Math.round(max) : SANITIZED_TEXT_MAX
  let text = value.replace(ANNOTATION_CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
  if (text.length === 0) return ''
  for (const pattern of ANNOTATION_REDACTIONS) {
    pattern.lastIndex = 0
    text = text.replace(pattern, '[redacted]')
  }
  if (text.length > limit) {
    text = `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`
  }
  return text
}

/**
 * Normalize one user-authored annotation note without redaction or truncation.
 *
 * Page-derived text goes through {@link sanitizeText} (collapse + secret
 * redaction + limit); a note the user typed must survive verbatim, otherwise
 * the inserted request disagrees with what the UI displayed. NUL/C0 control
 * characters (except tab and newline) are removed, CRLF/CR is normalized to
 * `\n`, and internal spaces/newlines are preserved. Multi-line notes are
 * inserted as multi-line label content by both serializers.
 * @param value - raw user note.
 * @returns normalized note (empty for non-strings).
 */
export function normalizeUserNote(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return ''
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

/**
 * Deterministic FNV-1a 32-bit digest of one collapsed, sanitized text.
 *
 * This is derived data only: it lets re-resolution detect content changes
 * without storing the raw text in the ref. The offset basis is returned for an
 * empty string, so an empty-but-captured target can be recognized later.
 * @param value - raw text.
 * @returns eight lowercase hex digits, or '' for a non-string.
 */
export function textDigest(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = sanitizeText(value, TEXT_DIGEST_MAX)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Accept one attribute name for capture.
 * @param name - raw attribute name.
 * @returns lowercase name, or null when denied.
 */
export function sanitizeAttributeName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim().toLowerCase()
  if (trimmed.length === 0 || trimmed.length > 64) return null
  if (trimmed === 'class' || trimmed === 'style' || trimmed === 'value') return null
  if (trimmed.startsWith('on')) return null
  if (SENSITIVE_ATTRIBUTE_NAMES.test(trimmed)) return null
  return trimmed
}

/**
 * Accept one attribute value for capture.
 * @param name - attribute name, checked again.
 * @param value - raw attribute value.
 * @returns trimmed value, or null when denied.
 */
export function sanitizeAttributeValue(name: unknown, value: unknown): string | null {
  const safeName = sanitizeAttributeName(name)
  if (safeName === null || typeof value !== 'string') return null
  const trimmed = value.replace(ANNOTATION_CONTROL_CHARS, ' ').trim()
  if (trimmed.length === 0 || trimmed.length > 160) return null
  // A proven secret is never allowed, whatever the attribute is called.
  if (SENSITIVE_SECRET_VALUES.test(trimmed)) return null
  // Known stable data attributes keep namespaced ids/UUIDs, which are longer
  // than the generic opaque-token heuristic but are identity, not secrets.
  if (STABLE_KEY_ATTRIBUTES.has(safeName)
    && (NAMESPACED_KEY_PATTERN.test(trimmed) || UUID_PATTERN.test(trimmed) || SESSION_ID_PATTERN.test(trimmed))) {
    return trimmed
  }
  if (SENSITIVE_ATTRIBUTE_VALUES.test(trimmed)) return null
  return trimmed
}

/**
 * Normalize one quote text: whitespace-collapsed, trimmed, bounded.
 * @param text - raw text.
 * @param max - maximum length (0/undefined = no cap, tests).
 * @returns normalized text.
 */
export function annotationNormalizeQuoteText(text: unknown, max?: number): string {
  if (typeof text !== 'string') return ''
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const cap = typeof max === 'number' && Number.isFinite(max) && max > 0 ? Math.round(max) : 0
  if (cap === 0 || collapsed.length <= cap) return collapsed
  return collapsed.slice(0, cap)
}
