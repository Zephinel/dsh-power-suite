/**
 * Pure locator-identity model for UI-element annotation.
 *
 * Everything here answers "which element is this, and how do we find it again":
 * sanitized selector candidates, the verified unique selector and its bounded
 * stable ancestors, the candidate ordering score, the structural
 * `tag:nth-of-type` path, the v2 ElementRef locator plus its identity key, and
 * the short labels the popover and serializers show. Capture stays in the
 * controller: this module only shapes already-captured descriptors. The two
 * DOM-facing selector helpers read element boundaries and attributes through a
 * narrow structural interface, so the live page remains the controller's.
 *
 * @module
 */

import {
  ANNOTATION_CONTROL_CHARS,
  STABLE_KEY_ATTRIBUTES,
  annotationNormalizeQuoteText,
  cssIdentifier,
  cssString,
  sanitizeAttributeValue,
  sanitizeText
} from './text.ts'
import {
  annotationRoutePath,
  annotationWorkspaceLabel,
  normalizeAnnotationBounds,
  normalizeAnnotationViewport
} from './format.ts'
import type { AnnotationBounds, AnnotationViewport } from './format.ts'

/** One captured attribute pair. */
export interface AnnotationAttribute {
  name: string
  value: string
}

/** One ordered locator candidate. */
export interface AnnotationSelectorCandidate {
  kind: string
  value: string
  reliability: number
}

/** One persisted stable ancestor: a tag plus its identity attributes. */
export interface AnnotationStableAncestor {
  tag: string
  attrs: Record<string, string>
}

/** One text quote anchor: exact text plus bounded surrounding context. */
export interface AnnotationTextQuote {
  exact: string
  prefix: string
  suffix: string
}

/** One text position anchor: container selector plus offsets. */
export interface AnnotationTextPosition {
  container: string
  start: number
  end: number
}

/** Sanitized descendant-anchor signature. */
export interface AnnotationAnchorSignature {
  tag: string
  attrs: AnnotationAttribute[]
}

/** A3/T38: persisted descendant-anchor metadata (all null for a leaf anchor). */
export interface AnnotationDescendantAnchor {
  anchorTarget: string | null
  anchorLeafTag: string | null
  anchorAncestorChain: string[] | null
  anchorSignature: AnnotationAnchorSignature | null
}

/** One relative `tag:nth-of-type(n)` step. */
export interface AnnotationSelectorStep {
  tag: string
  index: number
}

/** One stable-ancestor anchor: selector plus the steps down to the element. */
export interface AnnotationAnchorPath {
  selector: string
  steps: AnnotationSelectorStep[]
}

/** One structural tag path and its derived selector. */
export interface AnnotationTagPath {
  parts: AnnotationSelectorStep[]
  selector: string
}

/** The strongest stable attribute selector of one element. */
export interface AnnotationStableSelector {
  name: string
  value: string
  selector: string
}

/** Session identity copied onto one ElementRef. */
export interface AnnotationSessionRef {
  sessionId: string | null
  cwd: string | null
  workspaceLabel: string | null
}

/** The v2 locator half of one ElementRef. */
export interface AnnotationLocator {
  tag: string
  role: string
  name: string
  candidates: AnnotationSelectorCandidate[]
  key: string
  path: string
  uniqueSelector: string | null
  uniqueVerified: boolean
  ancestors: AnnotationStableAncestor[]
  xpath: string | null
  jsPath: string | null
  textQuote: AnnotationTextQuote | null
  textPosition: AnnotationTextPosition | null
  anchorTarget: string | null
  anchorLeafTag: string | null
  anchorAncestorChain: string[] | null
  anchorSignature: AnnotationAnchorSignature | null
  surface: 'page' | 'floating'
  ephemeral: boolean
}

/** One serializable ElementRef v2 (never a DOM node, never HTML). */
export interface AnnotationElementRef {
  version: 2
  id: string
  at: number
  updatedAt: number
  order: number
  session: AnnotationSessionRef
  route: string
  locator: AnnotationLocator
  component: string
  text: string
  textDigest: string
  context: string
  bounds: AnnotationBounds
  viewport: AnnotationViewport | null
  note: string
  included: boolean
  lastStatus: string
}

/** One element-like surface the structural selector helpers read. */
export interface AnnotationDomElement {
  readonly tagName: string
  readonly parentElement: AnnotationDomElement | null
  readonly previousElementSibling: AnnotationDomElement | null
}

/** The document boundaries the structural path stops at. */
interface AnnotationDocumentBoundary {
  body: unknown
  documentElement: unknown
}

/** Read an untrusted value as a plain record, or an empty record. */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

/** Maximum stored text-quote length. */
export const ANNOTATION_TEXT_QUOTE_MAX = 120

/** Maximum prefix/suffix context on one persisted text quote. */
export const ANNOTATION_QUOTE_CONTEXT_MAX = 60

/** Maximum exact + prefix + suffix length on one persisted text quote. */
export const ANNOTATION_QUOTE_TOTAL_MAX = 200

/** Maximum stored XPath length. */
export const ANNOTATION_XPATH_MAX = 512

/** Maximum stored JS-path expression length. */
export const ANNOTATION_JS_PATH_MAX = 512

/** Stable ancestors kept on a record: bounded so one annotation stays a locator, not a page dump. */
export const ANNOTATION_MAX_ANCESTORS = 3

/** Attributes that make a stable locator, most reliable first. */
const LOCATOR_DATA_ATTRIBUTES: ReadonlyArray<readonly [string, number]> = [
  ['data-row-key', 0.98],
  ['data-chat-node-key', 0.97],
  ['data-chat-anchor-key', 0.96],
  ['data-chat-group-key', 0.95],
  ['data-chat-turn', 0.94],
  ['data-chat-flow-key', 0.93],
  ['data-conversation-region', 0.95],
  ['data-conversation-session', 0.86],
  ['data-testid', 0.92],
  ['data-slot', 0.9]
]

/**
 * A3/T32: explicit selector stability tiers. Higher is better; the numeric
 * reliability orders within a tier. Stable data attributes / ids / aria
 * attributes beat semantic roles and labels, which beat stable classes, which
 * beat positional tag/nth-of-type paths.
 */
const ANNOTATION_SELECTOR_TIERS: Readonly<Record<string, number>> = Object.freeze({
  data: 5,
  id: 5,
  aria: 5,
  roleName: 4,
  label: 3,
  role: 3,
  class: 2,
  tag: 1,
  path: 0
})

/** Attribute names that may anchor a verified unique selector, most reliable first. */
const UNIQUE_SELECTOR_ATTRIBUTES: readonly string[] = [
  'data-row-key',
  'data-chat-node-key',
  'data-chat-anchor-key',
  'data-chat-group-key',
  'data-chat-turn',
  'data-chat-flow-key',
  'data-conversation-region',
  'data-testid',
  'data-slot',
  'data-conversation-session'
]

/** Attribute names kept on one persisted stable-ancestor entry. */
const STABLE_ANCESTOR_ATTRIBUTES: ReadonlySet<string> = new Set([
  'data-row-key',
  'data-chat-node-key',
  'data-chat-anchor-key',
  'data-chat-group-key',
  'data-chat-turn',
  'data-chat-flow-key',
  'data-conversation-region',
  'data-conversation-session',
  'data-testid',
  'data-slot',
  'id',
  'aria-label'
])

/**
 * Whether a value looks generated per render instead of authored.
 * @param value - id/data-attribute/candidate value.
 * @returns whether the value is unstable.
 */
export function isDynamicValue(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return true
  if (value.length > 120) return true
  if (value.startsWith(':r') || value.includes(':r')) return true
  if (/^(?:react|radix|headlessui|mui|aria-)[-_]/i.test(value)) return true
  if (/_[A-Za-z0-9]{4,}$/.test(value)) return true
  if (/[A-Fa-f0-9]{12,}/.test(value)) return true
  if (/^[a-z]+-[0-9a-f]{4,}$/i.test(value)) return true
  return false
}

/**
 * Whether a tag is a form control.
 * @param tag - lowercase tag name.
 * @returns whether the tag is a form control.
 */
export function isFormTag(tag: string): boolean {
  return tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button'
}

/**
 * One short random token for a ref id.
 * @param length - token length.
 * @returns lowercase alphanumeric token.
 */
function annotationRandomToken(length: number): string {
  let token = ''
  while (token.length < length) token += Math.random().toString(36).slice(2)
  return token.slice(0, length)
}

/**
 * A3/T33: whether one class name looks generated/hashed (CSS modules, styled
 * components, build-tool tokens) rather than authored and stable. Ports the
 * finder/css-selector-generator heuristics: a class must read as word-like;
 * mixed-case+digit+underscore tokens and hash segments are rejected.
 * @param className - class token.
 * @returns whether the class should not become a selector candidate.
 */
export function annotationIsGeneratedClass(className: unknown): boolean {
  if (typeof className !== 'string') return true
  const name = className.trim()
  if (name.length === 0 || name.length > 64) return true
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) return true
  // `_card_bgejw_9`, `_portal_bgejw_96`: leading _, word, hash segment, digits.
  if (/^_[a-z][a-z0-9]*_[a-z0-9]{4,8}(?:_?\d+)?$/i.test(name)) return true
  // `YDXeBa_sessionRow`: random mixed-case prefix + camel suffix.
  if (/^[A-Za-z0-9]{4,8}_[a-z][A-Za-z0-9]*$/.test(name) && !/^[a-z]+(?:_[a-z]+)*$/.test(name)) {
    const prefix = name.slice(0, name.indexOf('_'))
    if ((prefix.match(/[A-Z]/g) ?? []).length >= 2 || /\d/.test(prefix)) return true
  }
  // `hHd-Xa_brand` / `wSkVaW_body`: hashed mixed-case tokens with separators.
  const segments = name.split(/[_-]+/)
  if (segments.length >= 2) {
    for (const segment of segments) {
      if (segment.length < 4) continue
      const upper = (segment.match(/[A-Z]/g) ?? []).length
      const lower = (segment.match(/[a-z]/g) ?? []).length
      const digits = (segment.match(/\d/g) ?? []).length
      if (upper >= 2 && lower >= 1 && digits >= 1) return true
      if (upper >= 2 && lower >= 2 && /^[A-Za-z]{4,8}$/.test(segment)) return true
    }
  }
  // `hHd-Xa_brand`: short mixed-case hash segments joined by `-`/`_` before a
  // word-like suffix (finder's generated-token heuristic).
  const prefixPart = name.includes('_') ? name.slice(0, name.lastIndexOf('_')) : name
  if (/[A-Z]/.test(prefixPart) && /[-_]/.test(prefixPart) && prefixPart.length <= 12) {
    const upperPrefix = (prefixPart.match(/[A-Z]/g) ?? []).length
    if (upperPrefix >= 2 && /[a-z]/.test(prefixPart)) return true
  }
  // `psd-hoverPath`: semantic-ish prefix + camel hash suffix.
  if (/^(?:psd|dsw|ds)-[a-z]+[A-Z][A-Za-z0-9]*$/.test(name)) return true
  // Finder-style: require at least one vowel-containing word-like segment.
  const wordLike = segments.some((segment) => /^[a-z]+$/i.test(segment) && /[aeiouy]/i.test(segment))
  const bemLike = /__?|--/.test(name) && /^[a-z][a-z0-9]*(?:[-_]{1,2}[a-z][a-z0-9]*)*$/i.test(name)
  return !(wordLike || bemLike)
}

/**
 * The stability tier of one locator candidate.
 * @param candidate - `{ kind, value, reliability }`.
 * @returns tier (0..5).
 */
function annotationSelectorTier(candidate: unknown): number {
  const source = asRecord(candidate)
  const kind = typeof source.kind === 'string' ? source.kind : ''
  const value = typeof source.value === 'string' ? source.value : ''
  if (kind === 'label' && value.includes('aria-label')) {
    // role+name composite has its own tier below stable data/id/aria.
    if (value.startsWith('[role=') || value.includes('][aria-label=')) return ANNOTATION_SELECTOR_TIERS.roleName ?? 0
    return ANNOTATION_SELECTOR_TIERS.aria ?? 0
  }
  return ANNOTATION_SELECTOR_TIERS[kind] ?? ANNOTATION_SELECTOR_TIERS.tag ?? 0
}

/**
 * The ordering score of one locator candidate (tier first, reliability inside).
 * @param candidate - `{ kind, value, reliability }`.
 * @returns score.
 */
export function annotationSelectorScore(candidate: unknown): number {
  const source = asRecord(candidate)
  const reliability = typeof source.reliability === 'number' && Number.isFinite(source.reliability)
    ? source.reliability
    : 0
  const length = typeof source.value === 'string' ? source.value.length : 0
  // A3/T47 (R4): explicit length penalty (reference selector generators penalise
  // long/composite selectors).
  return annotationSelectorTier(candidate) * 100 + Math.round(reliability * 100) - Math.min(12, Math.floor(length / 20))
}

/**
 * Order locator candidates from one element descriptor, most reliable first.
 *
 * Only stable, sanitized selectors are emitted: dynamic ids/hashed data values
 * are skipped and class names are never used unverified.
 * @param descriptor - element descriptor from the controller.
 * @returns ordered candidates (at most six).
 */
export function selectorCandidates(descriptor: unknown): AnnotationSelectorCandidate[] {
  const source = asRecord(descriptor)
  const tag = typeof source.tag === 'string' ? source.tag.trim().toLowerCase() : ''
  const attrs = Array.isArray(source.attrs) ? source.attrs : []
  const candidates: AnnotationSelectorCandidate[] = []
  const seen = new Set<string>()
  /**
   * Push one deduplicated candidate.
   * @param kind - candidate kind.
   * @param value - CSS selector or tag.
   * @param reliability - 0..1 ordering weight.
   */
  const push = (kind: string, value: string, reliability: number): void => {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) return
    seen.add(value)
    candidates.push({ kind, value, reliability })
  }
  /**
   * Read one captured attribute value.
   * @param name - attribute name.
   * @returns safe value.
   */
  const attrValue = (name: string): string | null => {
    const attr = attrs.find((item): boolean => item !== null && typeof item === 'object'
      && (item as { name?: unknown }).name === name)
    if (attr === undefined) return null
    return sanitizeAttributeValue(name, (attr as { value?: unknown }).value)
  }
  for (const [name, reliability] of LOCATOR_DATA_ATTRIBUTES) {
    const value = attrValue(name)
    if (value === null) continue
    push('data', `[${name}="${cssString(value)}"]`, reliability)
  }
  const knownAttributes = new Set(LOCATOR_DATA_ATTRIBUTES.map(([name]) => name))
  for (const attr of attrs) {
    if (attr === null || typeof attr !== 'object') continue
    const name = (attr as { name?: unknown }).name
    if (typeof name !== 'string' || !name.startsWith('data-')) continue
    if (knownAttributes.has(name)) continue
    const value = sanitizeAttributeValue(name, (attr as { value?: unknown }).value)
    if (value === null) continue
    // Allow-listed stable attributes are identity even when their value is a
    // long opaque id (e.g. `session-<uuid>`); unknown attributes still go
    // through the generated-value heuristic (R2).
    if (!STABLE_KEY_ATTRIBUTES.has(name) && isDynamicValue(value)) continue
    push('data', `[${name}="${cssString(value)}"]`, 0.7)
  }
  // Defensive: descriptors are pure-model data too, so an id that did not go
  // through annotationStableId still has to pass the same sanitizer here.
  let id = typeof source.id === 'string' ? source.id : ''
  if (id.length > 0) id = sanitizeAttributeValue('id', id) ?? ''
  if (id.length === 0) {
    const idAttr = attrs.find((item): boolean => item !== null && typeof item === 'object'
      && (item as { name?: unknown }).name === 'id')
    if (idAttr !== undefined) {
      const idValue = sanitizeAttributeValue('id', (idAttr as { value?: unknown }).value)
      if (idValue !== null) id = idValue
    }
  }
  if (id.length > 0 && !isDynamicValue(id)) push('id', `#${cssIdentifier(id)}`, 0.88)
  const labelValue = attrValue('aria-label')
  if (labelValue !== null) push('label', `[aria-label="${cssString(labelValue)}"]`, 0.9)
  if (isFormTag(tag)) {
    const nameValue = attrValue('name')
    if (nameValue !== null && !isDynamicValue(nameValue)) push('label', `[name="${cssString(nameValue)}"]`, 0.72)
  }
  // A3/T32: stable, non-generated classes are a middle tier anchor.
  const classes = Array.isArray(source.classes) ? source.classes : []
  for (const className of classes.slice(0, 2)) {
    if (typeof className !== 'string' || className.length === 0 || isDynamicValue(className)) continue
    if (annotationIsGeneratedClass(className)) continue
    push('class', `.${cssIdentifier(className)}`, 0.55)
  }
  const role = typeof source.role === 'string' ? source.role.trim() : ''
  if (role.length > 0) {
    // A3/T47 (R4): reference role+name composite candidate.
    if (labelValue !== null) push('label', `[role="${cssString(role)}"][aria-label="${cssString(labelValue)}"]`, 0.8)
    push('role', `[role="${cssString(role)}"]`, 0.5)
  }
  if (tag.length > 0 && tag !== 'html' && tag !== 'body') push('tag', tag, 0.2)
  const path = typeof source.path === 'string' ? source.path : ''
  if (path.length > 0) push('path', path, 0.1)
  candidates.sort((left, right) => annotationSelectorScore(right) - annotationSelectorScore(left))
  return candidates.slice(0, 6)
}

/**
 * A3/T32: sanitize one stored anchor string (control chars stripped, bounded).
 * @param value - raw anchor.
 * @param max - maximum length.
 * @returns safe string or null.
 */
export function sanitizeAnchorString(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  const cleaned = value.replace(ANNOTATION_CONTROL_CHARS, '').trim()
  if (cleaned.length === 0) return null
  return cleaned.slice(0, typeof max === 'number' && max > 0 ? max : 512)
}

/**
 * A3/T32: sanitize one stored quote anchor.
 * @param raw - raw quote.
 * @returns quote, or null when there is no exact text.
 */
export function sanitizeTextQuote(raw: unknown): AnnotationTextQuote | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const exact = annotationNormalizeQuoteText(typeof source.exact === 'string' ? source.exact : '', ANNOTATION_TEXT_QUOTE_MAX)
  if (exact.length === 0) return null
  // A3/T36 (MINOR-2): one source of truth — persist what capture verified
  // (≤60 prefix/suffix each) and enforce the same ≤200 total invariant.
  let prefix = annotationNormalizeQuoteText(typeof source.prefix === 'string' ? source.prefix : '', ANNOTATION_QUOTE_CONTEXT_MAX)
  let suffix = annotationNormalizeQuoteText(typeof source.suffix === 'string' ? source.suffix : '', ANNOTATION_QUOTE_CONTEXT_MAX)
  let excess = exact.length + prefix.length + suffix.length - ANNOTATION_QUOTE_TOTAL_MAX
  if (excess > 0) {
    const suffixCut = Math.min(excess, suffix.length)
    suffix = suffix.slice(0, suffix.length - suffixCut)
    excess -= suffixCut
  }
  if (excess > 0) prefix = prefix.slice(0, Math.max(0, prefix.length - excess))
  return { exact, prefix, suffix }
}

/**
 * A3/T32: sanitize one stored text-position anchor.
 * @param raw - raw position.
 * @returns position, or null when it is not a bounded slice.
 */
export function sanitizeTextPosition(raw: unknown): AnnotationTextPosition | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const container = sanitizeAnchorString(source.container, 256)
  if (container === null) return null
  const start = typeof source.start === 'number' && Number.isFinite(source.start) && source.start >= 0 ? Math.round(source.start) : -1
  const end = typeof source.end === 'number' && Number.isFinite(source.end) && source.end > start ? Math.round(source.end) : -1
  if (start < 0 || end < 0) return null
  return { container, start, end }
}

/**
 * A3/T38: sanitize the descendant-anchor metadata persisted with a record.
 * @param rawTarget - anchor target ('self' | 'descendant').
 * @param rawLeafTag - leaf tag.
 * @param rawChain - ancestor tag chain.
 * @param rawSignature - target signature `{ tag, attrs }`.
 * @returns safe fields (all null unless the target is a descendant).
 */
export function sanitizeDescendantAnchor(
  rawTarget: unknown,
  rawLeafTag: unknown,
  rawChain: unknown,
  rawSignature: unknown
): AnnotationDescendantAnchor {
  const anchorTarget = rawTarget === 'descendant' ? 'descendant' : null
  if (anchorTarget !== 'descendant') {
    return { anchorTarget: null, anchorLeafTag: null, anchorAncestorChain: null, anchorSignature: null }
  }
  const anchorLeafTag = typeof rawLeafTag === 'string' && /^[a-z][a-z0-9-]{0,39}$/i.test(rawLeafTag) ? rawLeafTag.toLowerCase() : null
  const chain: string[] = []
  if (Array.isArray(rawChain)) {
    for (const tag of rawChain.slice(0, 16)) {
      if (typeof tag === 'string' && /^[a-z][a-z0-9-]{0,39}$/i.test(tag)) chain.push(tag.toLowerCase())
    }
  }
  let anchorSignature: AnnotationAnchorSignature | null = null
  const signature = asRecord(rawSignature)
  if (rawSignature !== null && typeof rawSignature === 'object' && Array.isArray(signature.attrs)) {
    const attrs: AnnotationAttribute[] = []
    for (const attr of signature.attrs.slice(0, 8)) {
      if (attr === null || typeof attr !== 'object') continue
      const name = sanitizeAnchorString((attr as { name?: unknown }).name, 64)
      const value = sanitizeAnchorString((attr as { value?: unknown }).value, 128)
      if (name === null || value === null) continue
      attrs.push({ name, value })
    }
    const tag = sanitizeAnchorString(signature.tag, 40)
    if (tag !== null) anchorSignature = { tag: tag.toLowerCase(), attrs }
  }
  return { anchorTarget, anchorLeafTag, anchorAncestorChain: chain.length > 0 ? chain : null, anchorSignature }
}

/**
 * Normalize the bounded, sanitized stable-ancestor list of one record.
 *
 * Only identity-shaped attributes survive (no class/style/text): each value
 * goes through the same sanitizer as a locator candidate, and a generated
 * `id` is dropped like it is everywhere else.
 * @param entries - nearest-first `[{ tag, attrs: [{ name, value }] }]`.
 * @returns up to three entries.
 */
export function buildStableAncestors(entries: unknown): AnnotationStableAncestor[] {
  const list = Array.isArray(entries) ? entries : []
  const result: AnnotationStableAncestor[] = []
  for (const entry of list) {
    if (result.length >= ANNOTATION_MAX_ANCESTORS) break
    const ancestor = asRecord(entry)
    if (entry === null || typeof entry !== 'object') continue
    const tag = typeof ancestor.tag === 'string' ? ancestor.tag.trim().toLowerCase() : ''
    if (tag.length === 0 || tag === 'body' || tag === 'html') continue
    const attrs = Array.isArray(ancestor.attrs) ? ancestor.attrs : []
    const kept: Record<string, string> = {}
    for (const attr of attrs) {
      if (attr === null || typeof attr !== 'object') continue
      const name = typeof (attr as { name?: unknown }).name === 'string'
        ? ((attr as { name: string }).name).trim().toLowerCase()
        : ''
      if (!STABLE_ANCESTOR_ATTRIBUTES.has(name)) continue
      const value = sanitizeAttributeValue(name, (attr as { value?: unknown }).value)
      if (value === null) continue
      if (name === 'id' && isDynamicValue(value)) continue
      kept[name] = value
    }
    if (Object.keys(kept).length === 0) continue
    result.push({ tag, attrs: kept })
  }
  return result
}

/**
 * Build one verified-unique CSS selector for a captured element.
 *
 * Candidate order: the element's own stable data/id/aria-label attribute, then
 * the nearest stable ancestor plus a `tag:nth-of-type(n)` relative path (at
 * most six steps). Class names are never used, and every candidate is checked
 * with the injected `queryAll`, so `uniqueVerified` is truthful rather than
 * hopeful. Pure: the caller injects the query engine, which is how the unit
 * seam tests the algorithm without a DOM (D11).
 * @param descriptor - `{ tag, attrs, anchorPaths }` descriptor.
 * @param queryAll - selector => iterable of element-likes with `tagName`.
 * @returns the verified selector, or a null fallback.
 */
export function buildUniqueSelector(
  descriptor: unknown,
  queryAll: ((selector: string) => unknown) | undefined
): { selector: string | null; verified: boolean } {
  const none = { selector: null, verified: false }
  if (typeof queryAll !== 'function') return none
  const source = asRecord(descriptor)
  const tag = typeof source.tag === 'string' ? source.tag.trim().toLowerCase() : ''
  if (tag.length === 0) return none
  const attrs = Array.isArray(source.attrs) ? source.attrs : []
  /**
   * Read one already-captured attribute, re-sanitizing it.
   * @param name - attribute name.
   * @returns safe value.
   */
  const attrValue = (name: string): string | null => {
    const attr = attrs.find((item): boolean => item !== null && typeof item === 'object'
      && (item as { name?: unknown }).name === name)
    if (attr === undefined) return null
    return sanitizeAttributeValue(name, (attr as { value?: unknown }).value)
  }
  /**
   * Whether a selector matches exactly one element and that element has the expected tag.
   * @param selector - candidate selector.
   * @returns whether it is unique for this tag.
   */
  const matchesOne = (selector: string): boolean => {
    let list: unknown
    try {
      list = queryAll(selector)
    } catch {
      return false
    }
    if (list === null || list === undefined) return false
    if (typeof (list as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function') return false
    let count = 0
    for (const element of list as Iterable<unknown>) {
      if (element === null || typeof element !== 'object') continue
      const elementTag = (element as { tagName?: unknown }).tagName
      if (typeof elementTag !== 'string') continue
      if (elementTag.toLowerCase() !== tag) continue
      count += 1
      if (count > 1) return false
    }
    return count === 1
  }
  for (const name of UNIQUE_SELECTOR_ATTRIBUTES) {
    const value = attrValue(name)
    if (value === null) continue
    const selector = `${tag}[${name}="${cssString(value)}"]`
    if (matchesOne(selector)) return { selector, verified: true }
  }
  const id = attrValue('id')
  if (id !== null && !isDynamicValue(id)) {
    const selector = `#${cssIdentifier(id)}`
    if (matchesOne(selector)) return { selector, verified: true }
  }
  const label = attrValue('aria-label')
  if (label !== null) {
    const selector = `${tag}[aria-label="${cssString(label)}"]`
    if (matchesOne(selector)) return { selector, verified: true }
  }
  const anchors = Array.isArray(source.anchorPaths) ? source.anchorPaths : []
  for (const anchor of anchors) {
    const anchorPath = asRecord(anchor)
    if (anchor === null || typeof anchor !== 'object') continue
    if (typeof anchorPath.selector !== 'string' || anchorPath.selector.length === 0) continue
    const steps = Array.isArray(anchorPath.steps) ? anchorPath.steps.slice(0, 6) : []
    if (steps.length === 0) continue
    const tail: string[] = []
    let usable = true
    for (const step of steps) {
      const stepSource = asRecord(step)
      const stepTag = typeof stepSource.tag === 'string' ? stepSource.tag.trim().toLowerCase() : ''
      const index = typeof stepSource.index === 'number' && Number.isFinite(stepSource.index) && stepSource.index >= 1
        ? Math.round(stepSource.index)
        : 1
      if (stepTag.length === 0) {
        usable = false
        break
      }
      tail.push(`${stepTag}:nth-of-type(${index})`)
    }
    if (!usable) continue
    const selector = `${anchorPath.selector} > ${tail.join(' > ')}`
    if (matchesOne(selector)) return { selector, verified: true }
  }
  return none
}

/**
 * Text used by the "Copy locator" action: the verified unique selector when
 * present, else the best ordered candidate, else the structural path.
 * @param ref - ElementRef.
 * @returns locator text (empty only for a malformed ref).
 */
export function annotationLocatorText(ref: unknown): string {
  const locator = asRecord(asRecord(ref).locator)
  const unique = typeof locator.uniqueSelector === 'string' && locator.uniqueSelector.length > 0 ? locator.uniqueSelector : ''
  if (unique.length > 0) return unique
  const candidates = Array.isArray(locator.candidates) ? locator.candidates : []
  const best = candidates.find((candidate): boolean => candidate !== null && typeof candidate === 'object'
    && typeof (candidate as { value?: unknown }).value === 'string'
    && ((candidate as { value: string }).value).length > 0
    && (candidate as { kind?: unknown }).kind !== 'tag'
    && (candidate as { kind?: unknown }).kind !== 'path')
  if (best !== undefined) return (best as { value: string }).value
  const path = typeof locator.path === 'string' && locator.path.length > 0 ? locator.path : ''
  if (path.length > 0) return path
  return describeLocator(ref)
}

/**
 * Stable identity key for one element, used for collection de-duplication.
 * @param tag - lowercase tag name.
 * @param source - element descriptor.
 * @param candidates - ordered candidates.
 * @returns identity key.
 */
export function identityKeyForCandidates(tag: string, source: Record<string, unknown>, candidates: readonly AnnotationSelectorCandidate[]): string {
  // A3/T33: a verified unique selector is the strongest identity signal; it
  // includes its stable ancestor anchors, so two same-label controls do not
  // collapse into one record. Fall back to the legacy candidate hierarchy.
  const uniqueSelector = typeof source.uniqueSelector === 'string' ? source.uniqueSelector : ''
  if (uniqueSelector.length > 0 && source.uniqueVerified === true) return `unique:${uniqueSelector}`
  // A data attribute or id is a real identity; an accessible label alone is not
  // (two different "Close" buttons share it), so label-only identity carries the
  // structural context needed to tell those elements apart (F3).
  const stable = candidates.find((candidate) => candidate.kind === 'data' || candidate.kind === 'id')
  if (stable !== undefined) return `${stable.kind}:${stable.value}`
  const path = typeof source.path === 'string' && source.path.length > 0 ? source.path : tag
  const label = candidates.find((candidate) => candidate.kind === 'label')
  if (label !== undefined) return `label:${label.value}|${tag}|${path}`
  const role = typeof source.role === 'string' && source.role.length > 0 ? source.role : ''
  const text = sanitizeText(source.text, 40)
  return `path:${role}:${path}:${text}`
}

/**
 * Build one serializable ElementRef v2 (never a DOM node, never HTML).
 *
 * v2 adds the identity and "find it again" fields the audit approved (D11):
 * a verified unique selector, bounded sanitized stable ancestors, the surface
 * kind / ephemeral flag, Session Workspace identity, route, and a viewport
 * snapshot. It deliberately carries no outerHTML, JS path, XPath, computed
 * styles, or input values.
 * @param descriptor - captured descriptor from `annotationDescriptorOf`.
 * @param context - capture context (session, time, order, bounds, level chain, route, viewport, surface).
 * @returns the ElementRef.
 */
export function buildElementRef(descriptor: unknown, context: unknown): AnnotationElementRef {
  const source = asRecord(descriptor)
  const scope = asRecord(context)
  const tag = (typeof source.tag === 'string' ? source.tag.trim().toLowerCase() : '') || 'element'
  const candidates = selectorCandidates(source)
  const levelChain = Array.isArray(scope.levelChain) ? scope.levelChain : []
  const contextLabels = levelChain.filter((label): boolean => typeof label === 'string' && label.length > 0).slice(0, 2) as string[]
  const at = typeof scope.at === 'number' && Number.isFinite(scope.at) ? scope.at : Date.now()
  const order = typeof scope.order === 'number' && Number.isFinite(scope.order) ? scope.order : 0
  const bounds = normalizeAnnotationBounds(scope.bounds) ?? { x: 0, y: 0, width: 0, height: 0 }
  const sessionId = typeof scope.sessionId === 'string' && scope.sessionId.length > 0 ? scope.sessionId : null
  const cwd = typeof scope.cwd === 'string' && scope.cwd.length > 0 ? scope.cwd : null
  const workspaceLabel = typeof scope.workspaceLabel === 'string' && scope.workspaceLabel.length > 0
    ? scope.workspaceLabel
    : annotationWorkspaceLabel(cwd)
  const surface = scope.surface === 'floating' ? 'floating' : 'page'
  const uniqueSelector = typeof source.uniqueSelector === 'string' && source.uniqueSelector.length > 0
    ? source.uniqueSelector
    : null
  return {
    version: 2,
    id: `psa-${order}-${annotationRandomToken(6)}`,
    at,
    updatedAt: at,
    order,
    session: { sessionId, cwd, workspaceLabel },
    route: annotationRoutePath(scope.route),
    locator: {
      tag,
      role: sanitizeText(source.role, 32),
      name: sanitizeText(source.name, 60),
      candidates,
      key: identityKeyForCandidates(tag, source, candidates),
      path: typeof source.path === 'string' ? source.path : '',
      uniqueSelector,
      uniqueVerified: uniqueSelector !== null && source.uniqueVerified === true,
      ancestors: buildStableAncestors(source.ancestors),
      // A3/T32 fallback anchors (text leaves; backward compatible optional).
      xpath: sanitizeAnchorString(source.xpath, ANNOTATION_XPATH_MAX),
      jsPath: sanitizeAnchorString(source.jsPath, ANNOTATION_JS_PATH_MAX),
      textQuote: sanitizeTextQuote(source.textQuote),
      textPosition: sanitizeTextPosition(source.textPosition),
      // A3/T38 (③): descendant-anchor metadata (nil for leaf/self anchors).
      // Floating surfaces are transient: a descendant text hit elsewhere must
      // not turn a genuinely removed card into a false "changed" identity.
      ...sanitizeDescendantAnchor(surface === 'floating' ? null : source.anchorTarget, source.anchorLeafTag, source.anchorAncestorChain, source.anchorSignature),
      surface,
      // A floating surface is transient by definition: it can disappear when
      // the card/menu closes, so its locator is the only thing that survives.
      ephemeral: surface === 'floating'
    },
    component: typeof source.component === 'string' && source.component.length > 0 ? source.component : 'other',
    text: sanitizeText(source.text, 80),
    // Derived from the full sanitized text; never the text itself (F11).
    textDigest: typeof source.textDigest === 'string' ? source.textDigest : '',
    context: contextLabels.join(' › '),
    bounds,
    viewport: normalizeAnnotationViewport(scope.viewport),
    note: '',
    // Phase 1 keeps the collection semantics: every collected record is part of
    // the batch. Phase 2 owns the per-item include toggle.
    included: true,
    // Capture-time resolution status; Phase 2 refreshes it for the detail card.
    lastStatus: 'resolved'
  }
}

/**
 * The stable identity of one ref, used for de-duplication.
 * @param ref - ElementRef.
 * @returns identity key.
 */
export function identityKeyOf(ref: unknown): string {
  const locator = asRecord(ref).locator
  if (locator === null || typeof locator !== 'object') return ''
  return typeof (locator as { key?: unknown }).key === 'string' ? (locator as { key: string }).key : ''
}

/**
 * Human-readable locator summary: tag, label, and the most stable selector.
 * @param ref - ElementRef.
 * @returns one-line summary (at most 160 characters).
 */
export function describeLocator(ref: unknown): string {
  const locator = asRecord(asRecord(ref).locator)
  const tag = typeof locator.tag === 'string' && locator.tag.length > 0 ? locator.tag : 'element'
  const name = typeof locator.name === 'string' ? locator.name : ''
  const candidates = Array.isArray(locator.candidates) ? locator.candidates : []
  const stable = candidates.find((candidate): boolean => candidate !== null && typeof candidate === 'object'
    && (candidate as { kind?: unknown }).kind !== 'tag'
    && (candidate as { kind?: unknown }).kind !== 'path')
  const unique = typeof locator.uniqueSelector === 'string' && locator.uniqueSelector.length > 0 ? locator.uniqueSelector : ''
  const head = name.length > 0 ? `${tag} "${name}"` : tag
  const tail = unique.length > 0
    ? unique
    : (stable !== undefined
      ? (stable as { value: string }).value
      : (typeof locator.path === 'string' && locator.path.length > 0 ? locator.path : ''))
  const summary = tail.length > 0 ? `${head} · ${tail}` : head
  return summary.length > 160 ? `${summary.slice(0, 159)}…` : summary
}

/**
 * Display label of one element: accessible name, then text summary, then tag.
 * @param ref - ElementRef.
 * @returns label.
 */
export function elementLabel(ref: unknown): string {
  const record = asRecord(ref)
  const locator = asRecord(record.locator)
  const name = typeof locator.name === 'string' ? locator.name : ''
  if (name.length > 0) return name
  const text = typeof record.text === 'string' ? record.text : ''
  if (text.length > 0) return text
  return typeof locator.tag === 'string' && locator.tag.length > 0 ? locator.tag : 'element'
}

/**
 * One short structural path (at most four levels) with nth-of-type steps.
 * @param element - candidate element.
 * @returns path parts and selector.
 */
export function annotationTagPath(element: AnnotationDomElement): AnnotationTagPath {
  const doc = (globalThis as unknown as { document: AnnotationDocumentBoundary }).document
  const parts: AnnotationSelectorStep[] = []
  let current: AnnotationDomElement | null = element
  let depth = 0
  while (current !== null && current !== doc.body && current !== doc.documentElement && depth < 4) {
    const tag = current.tagName.toLowerCase()
    let index = 1
    let sibling = current.previousElementSibling
    while (sibling !== null) {
      if (sibling.tagName === current.tagName) index += 1
      sibling = sibling.previousElementSibling
    }
    parts.unshift({ tag, index })
    current = current.parentElement
    depth += 1
  }
  const selector = parts.map((part) => (part.index > 1 ? `${part.tag}:nth-of-type(${part.index})` : part.tag)).join(' > ')
  return { parts, selector }
}

/**
 * The strongest stable attribute selector of one element (no class names).
 * @param element - live element.
 * @returns candidate, or null.
 */
export function annotationStableSelectorCandidate(element: unknown): AnnotationStableSelector | null {
  if (element === null || typeof element !== 'object') return null
  const node = element as { tagName?: unknown; getAttribute?: unknown }
  if (typeof node.getAttribute !== 'function') return null
  // Bind: a bare extracted DOM method throws `Illegal invocation` when called.
  const getAttribute = (node.getAttribute as (name: string) => string | null).bind(node)
  const tag = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : ''
  if (tag.length === 0) return null
  const names = [...UNIQUE_SELECTOR_ATTRIBUTES, 'id', 'aria-label']
  for (const name of names) {
    const raw = getAttribute(name)
    if (raw === null || raw.length === 0) continue
    const value = sanitizeAttributeValue(name, raw)
    if (value === null) continue
    if (name === 'id' && isDynamicValue(value)) continue
    const selector = name === 'id'
      ? `#${cssIdentifier(value)}`
      : `${tag}[${name}="${cssString(value)}"]`
    return { name, value, selector }
  }
  return null
}
