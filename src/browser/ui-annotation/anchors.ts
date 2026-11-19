/**
 * Pure anchor model for UI-element annotation.
 *
 * Everything here turns a live element into the persisted re-anchoring data a
 * record carries: rendered-text extraction with rendered→raw offset spans, the
 * exact text quote and its surrounding context, text-position offsets, the
 * optimized and full XPath, the DevTools-style JS-path expression, bounded
 * Levenshtein quote scoring, the capture-scope authority decision, and the
 * status/confidence helpers the detail card shows. DOM globals (`document`,
 * `NodeFilter`, `Node`) are read inside the extraction helpers only, so
 * importing this module never touches a page. The controller still owns DOM
 * collection, candidate resolution and every side effect.
 *
 * @module
 */

import {
  ANNOTATION_JS_PATH_MAX,
  ANNOTATION_QUOTE_CONTEXT_MAX,
  ANNOTATION_QUOTE_TOTAL_MAX,
  ANNOTATION_TEXT_QUOTE_MAX,
  ANNOTATION_XPATH_MAX,
  annotationStableSelectorCandidate,
  annotationTagPath,
  isDynamicValue
} from './identity.ts'
import type { AnnotationTextPosition, AnnotationTextQuote } from './identity.ts'
import {
  annotationNormalizeQuoteText,
  cssString,
  sanitizeAttributeValue,
  textDigest
} from './text.ts'

/** The element members the anchor helpers read; never the whole DOM. */
export interface AnnotationAnchorElement {
  readonly tagName: string
  readonly parentElement: AnnotationAnchorElement | null
  readonly previousElementSibling: AnnotationAnchorElement | null
  readonly childElementCount: number
  readonly children: ArrayLike<AnnotationAnchorElement>
  readonly textContent?: string | null
  readonly isContentEditable?: boolean
  getAttribute(name: string): string | null
  contains(node: unknown): boolean
}

/** One node the extraction walker yields (element or text). */
interface AnnotationWalkedNode {
  readonly nodeType: number
  readonly nodeValue?: string | null
  readonly tagName?: string
  readonly parentElement: AnnotationAnchorElement | null
}

/** The tree walker slice the extraction helpers read. */
interface AnnotationTreeWalker {
  nextNode(): AnnotationWalkedNode | null
}

/** The document slice the extraction helpers read. */
interface AnnotationAnchorDocument {
  readonly body: AnnotationAnchorElement | null
  createTreeWalker(root: AnnotationAnchorElement, whatToShow: number): AnnotationTreeWalker
}

/** Browser globals read inside function bodies; never at module load. */
interface AnnotationDomGlobals {
  readonly document?: AnnotationAnchorDocument
  readonly NodeFilter: { readonly SHOW_ELEMENT: number; readonly SHOW_TEXT: number }
  readonly Node: { readonly TEXT_NODE: number }
}

/** One rendered-text span: normalized offsets plus the raw text-node range. */
export interface AnnotationRenderedSpan {
  start: number
  end: number
  rawStart: number
  rawEnd: number
}

/** One element's rendered text plus its rendered→raw span map. */
export interface AnnotationRenderedText {
  text: string
  spans: AnnotationRenderedSpan[]
}

/** One scored quote match inside a rendered text. */
export interface AnnotationQuoteMatch {
  index: number
  score: number
}

/** One resolution outcome the status helpers pass through. */
export interface AnnotationResolutionOutcome {
  status: string
  via?: string
}

/** The capture-scope authority decision for a descendant text anchor. */
export interface AnnotationScopeAuthorityOutcome {
  source: 'scope' | 'fallback' | 'none'
  target: unknown
  ambiguous: boolean
}

/** The copy-anchor decision: live node first, then the saved anchor. */
export interface AnnotationCopyAnchorDecision {
  text: string
  source: 'live' | 'saved' | 'none'
}

/** One input chunk accepted by the rendered-text joiner. */
interface AnnotationRenderChunkInput {
  text?: unknown
  blockBefore?: unknown
  rawStart?: unknown
  rawEnd?: unknown
}

/** One chunk produced by the extraction walker. */
interface AnnotationRenderChunk {
  text: string
  blockBefore: boolean
  rawStart: number
  rawEnd: number
}

/** Read an untrusted value as a plain record, or an empty record. */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

/** Read the browser globals without touching them at module load. */
function annotationDomGlobals(): AnnotationDomGlobals {
  return globalThis as unknown as AnnotationDomGlobals
}

/**
 * A3/T47 (R2): ephemeral/floating records have no document-wide re-anchoring.
 * A transient surface that is no longer present is Missing, never Changed or
 * Resolved through a look-alike. CSS resolution on the still-present surface is
 * the only accepted outcome.
 * @param ref - captured record.
 * @param outcome - resolution outcome.
 * @param surfacePresent - whether the captured surface is still mounted.
 * @returns contract-adjusted outcome.
 */
export function annotationEphemeralOutcome(ref: unknown, outcome: unknown, surfacePresent?: boolean): AnnotationResolutionOutcome {
  const source = (outcome !== null && typeof outcome === 'object' ? outcome : { status: 'missing' }) as AnnotationResolutionOutcome
  const record = asRecord(ref)
  const locator = typeof record.locator === 'object' && record.locator !== null ? record.locator as Record<string, unknown> : null
  const ephemeral = locator !== null && (locator.ephemeral === true || locator.surface === 'floating')
  if (ephemeral !== true) return source
  // CSS look-alikes never claim Changed for a transient surface; other outcomes
  // are gated on the captured surface still being present (A3/T49).
  if (surfacePresent === true) return source
  return { ...source, status: 'missing' }
}

/**
 * A3/T42: captured-scope authority decision. In-scope results are authoritative:
 * a unique in-scope target resolves even if out-of-scope duplicates exist; only
 * an EMPTY in-scope result may use the bounded document fallback. In-scope
 * ambiguity is terminal (real decoy inside the captured scope).
 * @param input - collected candidates.
 * @returns scope/fallback decision.
 */
export function annotationScopeAuthorityOutcome(input: unknown): AnnotationScopeAuthorityOutcome {
  const source = asRecord(input)
  const inScope = asRecord(source.inScope)
  const fallback = asRecord(source.fallback)
  const inTargets: unknown[] = Array.isArray(inScope.targets)
    ? inScope.targets.filter((target: unknown) => target !== null && target !== undefined)
    : []
  if (inScope.ambiguous === true || inTargets.length > 1) return { source: 'scope', target: null, ambiguous: true }
  if (inTargets.length === 1) return { source: 'scope', target: inTargets[0], ambiguous: false }
  const fbTargets: unknown[] = Array.isArray(fallback.targets)
    ? fallback.targets.filter((target: unknown) => target !== null && target !== undefined)
    : []
  if (fallback.ambiguous === true || fbTargets.length > 1) return { source: 'fallback', target: null, ambiguous: true }
  if (fbTargets.length === 1) return { source: 'fallback', target: fbTargets[0], ambiguous: false }
  return { source: 'none', target: null, ambiguous: false }
}

/**
 * A3/T38 (⑤): count non-overlapping occurrences of `exact` in rendered text.
 * Used by the capture climb so it never falls back to raw textContent.
 * @param text - rendered text.
 * @param exact - normalized exact text.
 * @returns repeat count.
 */
export function annotationRenderedTextRepeatCount(text: unknown, exact: unknown): number {
  const source = typeof text === 'string' ? text : ''
  const needle = typeof exact === 'string' ? exact : ''
  if (needle.length === 0 || source.length === 0) return 0
  let count = 0
  let at = source.indexOf(needle)
  while (at >= 0) {
    count += 1
    at = source.indexOf(needle, at + needle.length)
  }
  return count
}

/**
 * A3/T38 (③): first text-bearing leaf descendant (no element children, not
 * editable, rendered text non-empty), depth-first bounded.
 * @param element - target element.
 * @returns leaf, or null.
 */
export function annotationFirstTextLeafDescendant(element: unknown): AnnotationAnchorElement | null {
  const node = element as AnnotationAnchorElement | null
  if (node === null || typeof node !== 'object' || node.childElementCount === 0) return null
  const stack: AnnotationAnchorElement[] = Array.from(node.children ?? []).reverse()
  let visited = 0
  while (stack.length > 0 && visited < 200) {
    visited += 1
    const current = stack.pop()
    if (current === null || current === undefined || typeof current !== 'object') continue
    const tag = typeof current.tagName === 'string' ? current.tagName.toLowerCase() : ''
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'script' || tag === 'style') continue
    if (current.isContentEditable === true) continue
    if (current.childElementCount === 0) {
      if (annotationNormalizeQuoteText(typeof current.textContent === 'string' ? current.textContent : '', 0).length > 0) return current
      continue
    }
    const children = Array.from(current.children ?? [])
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index])
  }
  return null
}

/**
 * A3/T38 (③): tag chain from a leaf up to (and including) the recorded target.
 * @param leaf - text leaf.
 * @param target - recorded ancestor target.
 * @returns tags leaf→target.
 */
export function annotationAncestorTagChain(leaf: unknown, target: unknown): string[] {
  const chain: string[] = []
  const node = leaf as AnnotationAnchorElement
  let current = node.parentElement
  let depth = 0
  while (current !== null && current !== undefined && depth < 16) {
    const tag = typeof current.tagName === 'string' ? current.tagName.toLowerCase() : ''
    if (tag.length > 0) chain.push(tag)
    if (current === target) break
    current = current.parentElement
    depth += 1
  }
  return chain
}

/**
 * A3/T38 (③): whether one ancestor matches the recorded descendant-anchor
 * signature (tag + stable attrs). Pure; used by the DOM climb.
 * @param ref - captured record.
 * @param ancestor - ancestor info.
 * @returns match.
 */
export function annotationDescendantAncestorMatches(ref: unknown, ancestor: unknown): boolean {
  if (ref === null || typeof ref !== 'object') return false
  const record = asRecord(ref)
  if (record.locator === null || typeof record.locator !== 'object' || record.locator === undefined) return false
  const locator = asRecord(record.locator)
  if (locator.anchorTarget !== 'descendant') return false
  const tag = typeof locator.tag === 'string' ? locator.tag.toLowerCase() : ''
  const ancestorRecord = asRecord(ancestor)
  const ancestorTag = typeof ancestorRecord.tag === 'string' ? ancestorRecord.tag.toLowerCase() : ''
  if (tag.length === 0 || ancestorTag !== tag) return false
  const chain: unknown[] = Array.isArray(locator.anchorAncestorChain) ? locator.anchorAncestorChain : []
  if (chain.length > 0 && chain[0] !== undefined) {
    // The recorded chain starts at the leaf's parent; the target is the last tag.
    if (chain[chain.length - 1] !== tag) return false
  }
  const signature = locator.anchorSignature !== null && typeof locator.anchorSignature === 'object'
    ? locator.anchorSignature as Record<string, unknown>
    : null
  const attrs = ancestorRecord.attrs !== null && typeof ancestorRecord.attrs === 'object'
    ? ancestorRecord.attrs as Record<string, unknown>
    : {}
  if (signature !== null && Array.isArray(signature.attrs)) {
    for (const attr of signature.attrs as unknown[]) {
      if (attr === null || typeof attr !== 'object') continue
      const attrRecord = asRecord(attr)
      if (typeof attrRecord.name !== 'string') continue
      if (attrs[attrRecord.name] !== attrRecord.value) return false
    }
  }
  return true
}

/**
 * A3/T38 (②): confidence orthogonal to the four statuses. A weakened structural
 * hit is 'weak'; everything else is 'strong'.
 * @param ref - captured record.
 * @param outcome - resolution outcome.
 * @returns confidence.
 */
export function annotationStatusConfidence(ref: unknown, outcome: unknown): 'weak' | 'strong' {
  const source = asRecord(outcome)
  const status = typeof source.status === 'string' ? source.status : ''
  const via = typeof source.via === 'string' ? source.via : ''
  if (status !== 'changed' || via === 'css') return 'strong'
  return annotationHasStrongIdentity(ref) ? 'strong' : 'weak'
}

/**
 * A3/T38 (②): i18n key for one status + confidence. Four statuses are unchanged;
 * weak structural outcomes get the honest "unverifiable" label.
 * @param status - status id.
 * @param confidence - 'weak' | 'strong'.
 * @returns dictionary key.
 */
export function annotationStatusLabelKey(status: string, confidence: string): string {
  if (status === 'changed' && confidence === 'weak') return 'status.unverifiableWeak'
  return `popover.status.${status}`
}

/** A3/T36: the FNV digest of empty text, i.e. the "no text identity" sentinel. */
export const ANNOTATION_EMPTY_TEXT_DIGEST = textDigest('')

/**
 * A3/T36 (MAJOR-1): whether a record carries a REAL identity signal. Empty
 * text (constant empty FNV digest), a tag-derived accessible name like
 * "button", or an unverified structural path are not identity. Structural
 * fallbacks (XPath/text-position) fail closed for weak-identity records.
 * @param ref - captured record.
 * @returns whether the record has strong identity.
 */
export function annotationHasStrongIdentity(ref: unknown): boolean {
  if (ref === null || typeof ref !== 'object') return false
  const record = asRecord(ref)
  const locator = record.locator !== null && typeof record.locator === 'object'
    ? record.locator as Record<string, unknown>
    : {}
  const text = typeof record.text === 'string' ? record.text.trim() : ''
  const digest = typeof record.textDigest === 'string' ? record.textDigest : ''
  const textIdentity = text.length > 0 && digest.length > 0 && digest !== ANNOTATION_EMPTY_TEXT_DIGEST
  const tag = typeof locator.tag === 'string' ? locator.tag.toLowerCase() : ''
  const role = typeof locator.role === 'string' ? locator.role.toLowerCase() : ''
  const name = typeof locator.name === 'string' ? locator.name.trim().toLowerCase() : ''
  // annotationAccessibleName falls back to the tag/role; that is not identity.
  const nameIdentity = name.length > 0 && name !== tag && name !== role
  const selectorIdentity = locator.uniqueVerified === true
    && typeof locator.uniqueSelector === 'string' && locator.uniqueSelector.length > 0
  return textIdentity || nameIdentity || selectorIdentity
}

/**
 * A3/T36 (MAJOR-1): structural fallback gate. A structural hit may never claim
 * Resolved without strong identity; it degrades honestly to Changed.
 * @param ref - captured record.
 * @param status - candidate status.
 * @returns gated status.
 */
export function annotationStructuralFallbackStatus(ref: unknown, status: string): string {
  if (status !== 'resolved') return status
  return annotationHasStrongIdentity(ref) ? 'resolved' : 'changed'
}

/**
 * A3/T36 (P2 review): pure copy-anchor decision — live node first, then the
 * saved anchor, except full XPath which requires a live node.
 * @param input - candidates.
 * @returns copy-anchor decision.
 */
export function annotationCopyAnchorDecision(input: unknown): AnnotationCopyAnchorDecision {
  const source = asRecord(input)
  const liveText = typeof source.liveText === 'string' ? source.liveText : ''
  if (liveText.length > 0) return { text: liveText, source: 'live' }
  if (source.full === true) return { text: '', source: 'none' }
  const storedText = typeof source.storedText === 'string' ? source.storedText : ''
  return storedText.length > 0 ? { text: storedText, source: 'saved' } : { text: '', source: 'none' }
}

/** Elements whose boundary separates rendered text with one space. */
const ANNOTATION_BLOCK_TAGS: ReadonlySet<string> = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre',
  'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
])

/**
 * A3/T34 (W3): join rendered text chunks into one normalized string while
 * keeping a rendered→raw offset map. Block boundaries and `<br>` contribute a
 * single separating space (not a line break), matching what the user sees.
 * @param chunks - text chunks.
 * @returns rendered text plus spans.
 */
export function annotationRenderTextChunks(chunks: unknown): AnnotationRenderedText {
  const list: unknown[] = Array.isArray(chunks) ? chunks : []
  let text = ''
  let pendingSpace = false
  const spans: AnnotationRenderedSpan[] = []
  for (const chunk of list) {
    if (chunk === null || typeof chunk !== 'object') continue
    const source = chunk as AnnotationRenderChunkInput
    const rawText = typeof source.text === 'string' ? source.text : ''
    const rawStart = typeof source.rawStart === 'number' && Number.isFinite(source.rawStart) ? Math.max(0, Math.round(source.rawStart)) : 0
    const rawEnd = typeof source.rawEnd === 'number' && Number.isFinite(source.rawEnd) ? Math.max(rawStart, Math.round(source.rawEnd)) : rawStart + rawText.length
    const collapsed = annotationNormalizeQuoteText(rawText, 0)
    if (collapsed.length === 0) {
      // A3/T36 (MINOR-5): a whitespace-only text node is a real separator.
      if (text.length > 0 && /\s/.test(rawText)) pendingSpace = true
      continue
    }
    const needsSpace = text.length > 0 && (source.blockBefore === true || pendingSpace === true || text.endsWith(' ') || /^\s/.test(rawText))
    if (needsSpace && !text.endsWith(' ')) text += ' '
    pendingSpace = false
    const start = text.length
    text += collapsed
    spans.push({ start, end: text.length, rawStart, rawEnd })
  }
  // Keep span offsets aligned with the trimmed output (block separators can make
  // the pre-trim text start with a space); raw offsets are unaffected.
  const leading = text.length - text.trimStart().length
  const trimmed = text.trim()
  const adjusted = trimmed.length === 0 ? [] : spans.map((span) => ({
    ...span,
    start: Math.max(0, span.start - leading),
    end: Math.max(0, span.end - leading)
  })).filter((span) => span.end > span.start)
  return { text: trimmed, spans: adjusted }
}

/**
 * A3/T34 (W3): rendered text of one DOM element (`<br>`/block boundaries →
 * space) with a rendered→raw offset mapping. Text inside form controls is not
 * read (privacy contract).
 * @param element - root element.
 * @param maxChunks - safety cap, default 400.
 * @returns rendered text.
 */
export function annotationRenderedTextOf(element: unknown, maxChunks?: number): AnnotationRenderedText {
  const empty: AnnotationRenderedText = { text: '', spans: [] }
  const globals = annotationDomGlobals()
  const root = element as AnnotationAnchorElement | null
  if (root === null || typeof root !== 'object' || globals.document === undefined) return empty
  const doc = globals.document
  const cap = typeof maxChunks === 'number' && Number.isFinite(maxChunks) && maxChunks > 0 ? Math.round(maxChunks) : 400
  const chunks: AnnotationRenderChunk[] = []
  const walker = doc.createTreeWalker(root, globals.NodeFilter.SHOW_ELEMENT | globals.NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  let blockPending = false
  let count = 0
  let rawCursor = 0
  while (node !== null && count < cap) {
    count += 1
    if (node.nodeType === globals.Node.TEXT_NODE) {
      const parent = node.parentElement
      const parentTag = parent === null ? '' : parent.tagName.toLowerCase()
      if (parent !== null && (parentTag === 'input' || parentTag === 'textarea' || parentTag === 'select')) {
        // A3/T36 (MINOR-5): a skipped form-control boundary separates text.
        blockPending = true
        node = walker.nextNode()
        continue
      }
      const rawValue = node.nodeValue ?? ''
      chunks.push({ text: rawValue, blockBefore: blockPending, rawStart: rawCursor, rawEnd: rawCursor + rawValue.length })
      rawCursor += rawValue.length
      blockPending = false
      node = walker.nextNode()
      continue
    }
    const tag = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : ''
    if (tag === 'br') {
      blockPending = true
      node = walker.nextNode()
      continue
    }
    if (ANNOTATION_BLOCK_TAGS.has(tag)) blockPending = true
    node = walker.nextNode()
  }
  return annotationRenderTextChunks(chunks)
}

/**
 * A3/T34 (W1): disambiguate a text quote against its capture scope. The target
 * occurrence is located by `targetIndex`; prefix/suffix expand symmetrically
 * until exactly one occurrence matches both contexts, or bounds are exhausted.
 * Returns null when the quote cannot be made unique (drop it rather than store
 * a misleading anchor).
 * @param scopeText - normalized scope text.
 * @param exact - normalized exact text.
 * @param targetIndex - rendered index of the target occurrence.
 * @param maxContext - max prefix/suffix chars each side, default 60.
 * @returns quote, or null.
 */
export function annotationDisambiguateQuote(scopeText: unknown, exact: unknown, targetIndex: number, maxContext?: number): AnnotationTextQuote | null {
  const text = typeof scopeText === 'string' ? scopeText : ''
  const needle = typeof exact === 'string' ? exact : ''
  if (needle.length === 0 || text.length === 0) return null
  const occurrences: number[] = []
  let at = text.indexOf(needle)
  while (at >= 0) {
    occurrences.push(at)
    at = text.indexOf(needle, at + 1)
  }
  if (occurrences.length === 0) return null
  const limit = typeof maxContext === 'number' && Number.isFinite(maxContext) && maxContext > 0 ? Math.round(maxContext) : ANNOTATION_QUOTE_CONTEXT_MAX
  const target = occurrences.includes(targetIndex) ? targetIndex : occurrences[0]
  if (occurrences.length === 1) return { exact: needle, prefix: '', suffix: '' }
  for (let size = 4; size <= limit; size += 4) {
    const prefix = text.slice(Math.max(0, target - size), target)
    const suffix = text.slice(target + needle.length, target + needle.length + size)
    let matches = 0
    for (const occurrence of occurrences) {
      const before = text.slice(0, occurrence)
      const after = text.slice(occurrence + needle.length)
      if ((prefix.length === 0 || before.endsWith(prefix)) && (suffix.length === 0 || after.startsWith(suffix))) matches += 1
    }
    if (matches === 1) {
      const quote = { exact: needle, prefix, suffix }
      if (needle.length + prefix.length + suffix.length > ANNOTATION_QUOTE_TOTAL_MAX) return null
      return quote
    }
  }
  return null
}

/**
 * Bounded Levenshtein distance; returns `max + 1` when the bound is exceeded.
 * @param a - first string.
 * @param b - second string.
 * @param max - bound.
 * @returns distance.
 */
export function annotationLevenshteinWithin(a: unknown, b: unknown, max: unknown): number {
  const left = typeof a === 'string' ? a : ''
  const right = typeof b === 'string' ? b : ''
  const bound = typeof max === 'number' && max >= 0 ? Math.round(max) : 0
  if (Math.abs(left.length - right.length) > bound) return bound + 1
  let previous: number[] = new Array(right.length + 1)
  for (let index = 0; index <= right.length; index += 1) previous[index] = index
  for (let row = 1; row <= left.length; row += 1) {
    const current: number[] = [row]
    let rowMin = row
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1
      const value = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost)
      current[column] = value
      if (value < rowMin) rowMin = value
    }
    if (rowMin > bound) return bound + 1
    previous = current
  }
  return previous[right.length]
}

/**
 * A3/T34 (W2): score quote matches in one rendered text. Exact matches come
 * first; bounded approximate matches are then searched. Score weights are
 * 0.7 (quote) / 0.15 (prefix) / 0.15 (suffix), normalized over the components
 * the quote actually carries. Returns matches sorted by score.
 * @param text - normalized rendered text.
 * @param quote - quote.
 * @param hintIndex - optional position hint.
 * @param maxMatches - cap, default 8.
 * @returns scored matches.
 */
export function annotationScoreQuoteMatches(text: unknown, quote: unknown, hintIndex?: number, maxMatches?: number): AnnotationQuoteMatch[] {
  const source = typeof text === 'string' ? text : ''
  const q = asRecord(quote)
  const exact = typeof q.exact === 'string' ? q.exact : ''
  if (exact.length === 0 || source.length === 0) return []
  const prefix = typeof q.prefix === 'string' ? q.prefix : ''
  const suffix = typeof q.suffix === 'string' ? q.suffix : ''
  const cap = typeof maxMatches === 'number' && maxMatches > 0 ? Math.round(maxMatches) : 8
  const weights = 0.7 + (prefix.length > 0 ? 0.15 : 0) + (suffix.length > 0 ? 0.15 : 0)
  // A3/T47 (R4): align the bounded error budget with Hypothesis matchQuote
  // (maxErrors = min(256, len/2), bounded here to 64 for our ≤120 quotes).
  const maxErrors = Math.min(64, Math.floor(exact.length / 2))
  const scoreAt = (index: number): number | null => {
    const candidate = source.slice(index, index + exact.length)
    const distance = annotationLevenshteinWithin(exact, candidate, maxErrors)
    if (distance > maxErrors) return null
    const quoteSim = exact.length === 0 ? 0 : Math.max(0, 1 - distance / exact.length)
    const before = source.slice(Math.max(0, index - prefix.length), index)
    const after = source.slice(index + exact.length, index + exact.length + suffix.length)
    const prefixSim = prefix.length === 0 ? 1 : (before === prefix ? 1 : annotationLevenshteinWithin(prefix, before, Math.max(2, Math.floor(prefix.length / 3))) <= Math.floor(prefix.length / 3) ? 0.5 : 0)
    const suffixSim = suffix.length === 0 ? 1 : (after === suffix ? 1 : annotationLevenshteinWithin(suffix, after, Math.max(2, Math.floor(suffix.length / 3))) <= Math.floor(suffix.length / 3) ? 0.5 : 0)
    let weighted = 0.7 * quoteSim
    if (prefix.length > 0) weighted += 0.15 * prefixSim
    if (suffix.length > 0) weighted += 0.15 * suffixSim
    let score = weighted / weights
    // A3/T34 (W2): an approximate hit can be honest "Content changed" but can
    // never claim the Resolved threshold — exactness is required for ≥0.85.
    if (distance > 0) score = Math.min(score, 0.8)
    // Reference hint score: 1 - |Δ|/text.length (distance-faded, weight ~2/92).
    if (typeof hintIndex === 'number' && Number.isFinite(hintIndex) && hintIndex >= 0) {
      score += 0.022 * Math.max(0, 1 - Math.abs(index - hintIndex) / Math.max(1, source.length))
    }
    return Math.min(1, score)
  }
  const matches: AnnotationQuoteMatch[] = []
  let at = source.indexOf(exact)
  while (at >= 0 && matches.length < cap) {
    const score = scoreAt(at)
    if (score !== null) matches.push({ index: at, score })
    at = source.indexOf(exact, at + 1)
  }
  if (matches.length === 0) {
    // Bounded approximate search: only where the first two chars match or every
    // 8th position, windows of exact length (quote ≤120).
    // Reference scans broadly; keep it bounded: step 1 up to 6000 chars, then 4.
    const step = source.length > 6000 ? 4 : 1
    for (let index = 0; index + Math.max(4, exact.length - 2) <= source.length && matches.length < cap; index += step) {
      if (source[index] !== exact[0] && index % 16 !== 0) continue
      const score = scoreAt(index)
      if (score !== null && score >= 0.5) matches.push({ index, score })
    }
  }
  matches.sort((left, right) => right.score - left.score)
  return matches.slice(0, cap)
}

/**
 * A3/T34 (P1.5): cache key for one fallback resolution within a DOM revision.
 * @param refId - record id.
 * @param revision - DOM revision counter.
 * @returns cache key.
 */
export function annotationFallbackCacheKey(refId: unknown, revision: unknown): string {
  const id = typeof refId === 'string' ? refId : ''
  const rev = typeof revision === 'number' && Number.isFinite(revision) ? Math.round(revision) : 0
  return `${id}:${rev}`
}

/**
 * A3/T34 (P2): full (non-short-circuited) absolute XPath for one live element,
 * used by "Copy full XPath" — unlike annotationXPathOf it never uses the id
 * shortcut. Full XPath requires a live node by contract.
 * @param element - live element.
 * @returns full xpath ('' when unavailable).
 */
export function annotationFullXPathOf(element: unknown): string {
  const node = element as AnnotationAnchorElement | null
  if (node === null || typeof node !== 'object' || typeof node.tagName !== 'string') return ''
  const parts: string[] = []
  let current: AnnotationAnchorElement | null = node
  let depth = 0
  while (current !== null && current !== undefined && typeof current.tagName === 'string'
    && current.tagName.toLowerCase() !== 'html' && depth < 60) {
    const tag = current.tagName.toLowerCase()
    let index = 1
    let sibling = current.previousElementSibling
    while (sibling !== null) {
      if (typeof sibling.tagName === 'string' && sibling.tagName.toLowerCase() === tag) index += 1
      sibling = sibling.previousElementSibling
    }
    parts.unshift(`${tag}[${index}]`)
    current = current.parentElement
    depth += 1
  }
  if (parts.length === 0) return ''
  return `/html[1]/${parts.join('/')}`.slice(0, ANNOTATION_XPATH_MAX)
}

/**
 * A3/T32: stable id usable in an XPath id short-circuit, or null.
 * @param element - live element.
 * @returns stable id.
 */
function annotationXPathId(element: unknown): string | null {
  const node = element as AnnotationAnchorElement | null
  if (node === null || typeof node !== 'object' || typeof node.getAttribute !== 'function') return null
  const raw = node.getAttribute('id')
  if (typeof raw !== 'string' || raw.length === 0) return null
  const value = sanitizeAttributeValue('id', raw)
  if (value === null || value.length === 0 || isDynamicValue(value)) return null
  return value
}

/**
 * A3/T32: absolute XPath for one element, with an id short-circuit where a
 * stable id exists (same idea as Chrome DevTools' Copy XPath).
 * @param element - live element.
 * @returns xpath ('' when unavailable).
 */
export function annotationXPathOf(element: unknown): string {
  const node = element as AnnotationAnchorElement | null
  if (node === null || typeof node !== 'object' || typeof node.tagName !== 'string') return ''
  const id = annotationXPathId(node)
  if (id !== null) return `//*[@id="${cssString(id)}"]`
  const parts: string[] = []
  let current: AnnotationAnchorElement | null = node
  let depth = 0
  while (current !== null && current !== undefined && typeof current.tagName === 'string'
    && current.tagName.toLowerCase() !== 'html' && depth < 40) {
    const tag = current.tagName.toLowerCase()
    let index = 1
    let sibling = current.previousElementSibling
    while (sibling !== null) {
      if (typeof sibling.tagName === 'string' && sibling.tagName.toLowerCase() === tag) index += 1
      sibling = sibling.previousElementSibling
    }
    parts.unshift(`${tag}[${index}]`)
    current = current.parentElement
    depth += 1
  }
  if (parts.length === 0) return ''
  return `/html[1]/${parts.join('/')}`.slice(0, ANNOTATION_XPATH_MAX)
}

/**
 * A3/T32: DevTools-style JS path expression (`document.querySelector(...)`,
 * or `document.evaluate(...)` for an XPath-only fallback).
 * @param anchors - captured anchors.
 * @returns JS expression ('' when unavailable).
 */
export function annotationJsPathFor(anchors: unknown): string {
  const source = asRecord(anchors)
  if (typeof source.selector === 'string' && source.selector.length > 0) {
    return `document.querySelector(${JSON.stringify(source.selector)})`.slice(0, ANNOTATION_JS_PATH_MAX)
  }
  if (typeof source.xpath === 'string' && source.xpath.length > 0) {
    return `document.evaluate(${JSON.stringify(source.xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`.slice(0, ANNOTATION_JS_PATH_MAX)
  }
  return ''
}

/**
 * A3/T34 (W1/W3): disambiguated quote for one text-bearing element, built from
 * rendered text and expanded until unique in the nearest scope. Returns null
 * (dropping the anchor) when the quote cannot be made unique — never stores a
 * misleading quote.
 * @param element - live element.
 * @returns quote, or null.
 */
export function annotationTextQuoteOf(element: unknown): AnnotationTextQuote | null {
  const globals = annotationDomGlobals()
  const doc = globals.document
  const node = element as AnnotationAnchorElement | null
  if (node === null || typeof node !== 'object' || doc === undefined) return null
  const own = annotationRenderedTextOf(node, 120)
  const exact = annotationNormalizeQuoteText(own.text, ANNOTATION_TEXT_QUOTE_MAX)
  if (exact.length === 0) return null
  let container: AnnotationAnchorElement | null = node.parentElement
  let depth = 0
  while (container !== null && container !== undefined && depth < 4) {
    const rendered = annotationRenderedTextOf(container, 600)
    if (rendered.text.length > 0 && rendered.spans.length > 0) {
      // Locate the target occurrence through the rendered→raw span map.
      const elementRawRanges: Array<{ start: number }> = []
      let rawCursor = 0
      const walker = doc.createTreeWalker(container, globals.NodeFilter.SHOW_TEXT)
      let current = walker.nextNode()
      while (current !== null) {
        const value = current.nodeValue ?? ''
        const start = rawCursor
        rawCursor += value.length
        if (node.contains(current) && annotationNormalizeQuoteText(value, 0).length > 0) elementRawRanges.push({ start })
        current = walker.nextNode()
      }
      const firstRaw = elementRawRanges.length > 0 ? elementRawRanges[0].start : 0
      let targetIndex = -1
      for (const span of rendered.spans) {
        if (span.rawStart !== firstRaw && !(span.rawStart <= firstRaw && firstRaw < span.rawEnd)) continue
        const local = rendered.text.slice(span.start, span.start + exact.length)
        if (annotationNormalizeQuoteText(local, 0) === exact) targetIndex = span.start
        break
      }
      if (targetIndex < 0) {
        // A3/T36 (MINOR-3): never fall back to the FIRST indexOf for duplicate
        // text — accept only an explicit unique occurrence, else drop the quote.
        const at = rendered.text.indexOf(exact)
        if (at < 0 || rendered.text.indexOf(exact, at + 1) >= 0) {
          container = container.parentElement
          depth += 1
          continue
        }
        targetIndex = at
      }
      const quote = annotationDisambiguateQuote(rendered.text, exact, targetIndex, ANNOTATION_QUOTE_CONTEXT_MAX)
      // A3/T36: uniqueness inside the immediate parent is not enough when the
      // same text repeats elsewhere in the document — climb to a wider scope so
      // the persisted prefix/suffix actually distinguishes this occurrence.
      if (quote !== null && quote.prefix.length === 0 && quote.suffix.length === 0 && container !== doc.body) {
        // A3/T38 (⑤): climb/duplicate probe uses the rendered-text pipeline
        // (same <br>/block-boundary normalization as matching), never raw textContent.
        const parentScope = container.parentElement
        const parentRendered = parentScope === null ? '' : annotationRenderedTextOf(parentScope, 800).text
        if (annotationRenderedTextRepeatCount(parentRendered, exact) > 1) {
          container = container.parentElement
          depth += 1
          continue
        }
      }
      if (quote !== null) return quote
    }
    container = container.parentElement
    depth += 1
  }
  // No scope could make the quote unique: drop it rather than store a guess.
  return null
}

/**
 * A3/T32: text position anchor: nearest ancestor container selector + offsets
 * of the element's normalized text inside the container's normalized text.
 * @param element - live element.
 * @returns position, or null.
 */
export function annotationTextPositionOf(element: unknown): AnnotationTextPosition | null {
  const globals = annotationDomGlobals()
  const node = element as AnnotationAnchorElement | null
  if (node === null || typeof node !== 'object' || globals.document === undefined) return null
  const own = annotationRenderedTextOf(node, 120)
  const exact = annotationNormalizeQuoteText(own.text, ANNOTATION_TEXT_QUOTE_MAX)
  if (exact.length === 0) return null
  let container: AnnotationAnchorElement | null = node.parentElement
  let depth = 0
  let selector = ''
  while (container !== null && container !== undefined && depth < 4) {
    const candidate = annotationStableSelectorCandidate(container)
    if (candidate !== null) { selector = candidate.selector; break }
    const pathInfo = annotationTagPath(container)
    if (pathInfo !== null && typeof pathInfo.selector === 'string' && pathInfo.selector.length > 0) { selector = pathInfo.selector; break }
    container = container.parentElement
    depth += 1
  }
  if (container === null || container === undefined || selector.length === 0) return null
  const rendered = annotationRenderedTextOf(container, 800)
  if (rendered.text.length === 0) return null
  const at = rendered.text.indexOf(exact)
  if (at < 0) return null
  // Only a unique slice is a trustworthy position anchor.
  if (rendered.text.indexOf(exact, at + 1) >= 0) return null
  return { container: selector.slice(0, 256), start: at, end: at + exact.length }
}

/**
 * A3/T32: whether one normalized text string contains the quote exactly once
 * (prefix/suffix disambiguate multiple occurrences).
 * @param text - candidate normalized text.
 * @param quote - quote with exact/prefix/suffix.
 * @returns whether the quote matches uniquely in this text.
 */
export function annotationTextQuoteMatches(text: unknown, quote: unknown): boolean {
  const normalized = annotationNormalizeQuoteText(text, 0)
  const source = asRecord(quote)
  const exact = typeof source.exact === 'string' ? source.exact : ''
  if (exact.length === 0 || normalized.length === 0) return false
  const prefix = typeof source.prefix === 'string' ? source.prefix : ''
  const suffix = typeof source.suffix === 'string' ? source.suffix : ''
  let matches = 0
  let at = normalized.indexOf(exact)
  while (at >= 0) {
    const before = normalized.slice(0, at)
    const after = normalized.slice(at + exact.length)
    if ((prefix.length === 0 || before.endsWith(prefix)) && (suffix.length === 0 || after.startsWith(suffix))) matches += 1
    at = normalized.indexOf(exact, at + 1)
  }
  return matches === 1
}
