/**
 * Pure re-anchoring decisions for UI-element annotation.
 *
 * A stored ref carries an ordered list of CSS candidates (plus an optional
 * capture-verified unique selector), a weak/strong identity flag and optional
 * quote/identity assertions; a live page supplies the query engine and probes
 * through injected callbacks. These helpers own the resolution walk:
 *
 * - {@link resolveRefStatus} classifies one ref as resolved / ambiguous /
 *   missing / changed, including the two-phase stable-vs-generic candidate
 *   walk and the live text/name/digest comparisons.
 * - {@link resolveNodeCandidate} returns the unique element-like object the
 *   same walk would pick (used to paint the anchor geometry).
 * - {@link annotationResolveStatus} runs the CSS walk and then the recorded
 *   text-quote / text-position / XPath fallbacks in order.
 *
 * No DOM global, timer or controller state is touched here: every element,
 * query and probe is injected, so importing this module is inert. The browser
 * entry supplies the real `document.querySelectorAll`.
 *
 * @module
 */

import { sanitizeText } from './text.ts'

/** The four statuses one stored ref can resolve to. */
export type AnnotationRefStatus = 'resolved' | 'ambiguous' | 'missing' | 'changed'

/** The strategy that produced a multi-strategy resolution outcome. */
export type AnnotationResolveVia = 'css' | 'text-quote' | 'text-position' | 'xpath'

/** One multi-strategy resolution outcome: status plus the winning strategy. */
export interface AnnotationResolveStatusOutcome {
  status: string
  via: AnnotationResolveVia
}

/** The element-like surface the resolution walk reads; queries stay injected. */
export interface AnnotationQueryElement {
  readonly tagName?: unknown
}

/** The live-page probe result for one resolved element. */
interface AnnotationLiveInfo {
  readonly isConnected?: unknown
  readonly expectedText?: unknown
  readonly textContent?: unknown
  readonly expectedName?: unknown
  readonly actualName?: unknown
  readonly expectedDigest?: unknown
  readonly actualDigest?: unknown
}

/** One injected query engine: selector in, element-like iterable out. */
type AnnotationQueryAll = (selector: string) => unknown

/** One injected quote assertion: `false` rejects the candidate. */
type AnnotationQuoteAssertion = (element: unknown) => unknown

/** One injected identity corroboration: only `true` accepts the candidate. */
type AnnotationCorroborate = (element: unknown) => unknown

/** One injected live-page probe for the element the walk picked. */
type AnnotationLiveInfoProbe = (element: unknown) => unknown

/** One fallback resolver: a status string, `{ status, terminal }`, or null. */
type AnnotationFallbackResolver = () => unknown

/**
 * Read one untrusted value as a string-keyed object.
 * @param value - candidate value.
 * @returns the object view, or null.
 */
function objectOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

/**
 * Read one untrusted value as the element-like surface the walk reads.
 * @param value - candidate value.
 * @returns the element view, or null.
 */
function elementOf(value: unknown): AnnotationQueryElement | null {
  return value !== null && typeof value === 'object' ? value as AnnotationQueryElement : null
}

/**
 * The reliability sort key of one candidate; mirrors `right?.reliability ?? 0`
 * including numeric-string coercion.
 * @param candidate - untrusted candidate.
 * @returns numeric reliability (NaN for unusable values, like the original).
 */
function reliabilityOf(candidate: unknown): number {
  const source = objectOf(candidate)
  const value = source === null ? undefined : source.reliability
  return Number(value ?? 0)
}

/**
 * Filter a query result down to element-like hits of one expected tag.
 * @param raw - raw query result.
 * @param tag - normalized expected tag, or '' to accept every tag.
 * @returns tagged hits, or null when the result is not iterable.
 */
function taggedHits(raw: unknown, tag: string): AnnotationQueryElement[] | null {
  if (raw === null || raw === undefined) return null
  const iterable = raw as Record<symbol, unknown>
  if (typeof iterable[Symbol.iterator] !== 'function') return null
  const list: AnnotationQueryElement[] = []
  for (const value of raw as Iterable<unknown>) {
    const element = elementOf(value)
    if (element === null) continue
    if (typeof element.tagName !== 'string') continue
    if (tag.length === 0 || element.tagName.toLowerCase() === tag) list.push(element)
  }
  return list
}

/**
 * Re-resolve one ref against a live document through injected queries.
 * @param input - `{ candidates, expectedTag, queryAll, liveInfo, ... }`.
 * @returns the resolved status.
 */
export function resolveRefStatus(input: unknown): AnnotationRefStatus {
  const source = objectOf(input) ?? {}
  const candidates = source.candidates
  const expectedTag = source.expectedTag
  const rawQueryAll = source.queryAll
  const weakIdentity = source.weakIdentity === true
  const assertQuote: AnnotationQuoteAssertion | null = typeof source.assertQuote === 'function'
    ? source.assertQuote as AnnotationQuoteAssertion
    : null
  const corroborate: AnnotationCorroborate | null = typeof source.corroborate === 'function'
    ? source.corroborate as AnnotationCorroborate
    : null
  if (typeof rawQueryAll !== 'function') return 'missing'
  const queryAll = rawQueryAll as AnnotationQueryAll
  const tag = typeof expectedTag === 'string' ? expectedTag.trim().toLowerCase() : ''
  const ordered: unknown[] = Array.isArray(candidates)
    ? candidates.slice().sort((left, right) => reliabilityOf(right) - reliabilityOf(left))
    : []
  let unique: AnnotationQueryElement | null = null
  let genericMatch: AnnotationQueryElement | null = null
  // A3/T33: two-phase resolution. Phase 1 collects per-candidate hit sets and
  // prefers the first candidate (highest tier/score) with exactly one hit;
  // a non-unique candidate never short-circuits to Ambiguous while another
  // candidate may still resolve uniquely.
  let stableAmbiguity = false
  let genericUnique = false
  const hasStableCandidate = ordered.some((candidate) => {
    const sourceCandidate = objectOf(candidate)
    if (sourceCandidate === null) return false
    const kind = sourceCandidate.kind
    return kind === 'data' || kind === 'id' || kind === 'label'
  })
  /**
   * Collect the tag-matching hits of one selector without throwing.
   * @param selector - selector to query.
   * @returns hits, or null when the query failed or was not iterable.
   */
  const queryTagged = (selector: string): AnnotationQueryElement[] | null => {
    let matches: unknown
    try {
      matches = queryAll(selector)
    } catch {
      return null
    }
    return taggedHits(matches, tag)
  }
  // A selector verified unique at capture is the strongest locator: a single
  // hit resolves (the liveInfo checks below still detect a changed element),
  // several hits are genuine ambiguity, and no hit falls through to the v1
  // candidate walk so an older locator keeps working.
  const uniqueSelector = typeof source.uniqueSelector === 'string' && source.uniqueSelector.length > 0
    ? source.uniqueSelector
    : ''
  if (uniqueSelector.length > 0) {
    const hits = queryTagged(uniqueSelector)
    if (hits !== null && hits.length > 1) {
      stableAmbiguity = true
    } else if (hits !== null && hits.length === 1) {
      // A3/T47 (R1-i): a strong identity must still resolve to an element that
      // corroborates the captured identity. A stale/weak unique hit does not win.
      const okayIdentity = !weakIdentity || (corroborate !== null && corroborate(hits[0]) === true)
      const okayQuote = assertQuote === null || assertQuote(hits[0]) !== false
      if (okayIdentity && okayQuote) unique = hits[0]
    }
  }
  if (unique === null) for (const candidate of ordered) {
    const sourceCandidate = objectOf(candidate)
    if (sourceCandidate === null) continue
    const value = sourceCandidate.value
    if (typeof value !== 'string' || value.length === 0) continue
    let matches: unknown
    try {
      matches = queryAll(value)
    } catch {
      continue
    }
    if (matches === null || matches === undefined) continue
    const list = taggedHits(matches, tag)
    if (list === null || list.length === 0) continue
    const kind = sourceCandidate.kind
    const generic = kind === 'tag' || kind === 'path' || kind === 'role' || kind === 'class'
    if (list.length > 1) {
      // A3/T33: record the ambiguity candidate and keep scanning — a lower-tier
      // candidate (unique structural path, unique ancestor anchor) may still
      // identify exactly one element.
      // Only a genuinely identifying (stable) candidate matching several
      // elements is CSS ambiguity; a generic role/tag matching many is weak and
      // must fall through to corroboration/fallback (P0).
      if (!generic) stableAmbiguity = true
      continue
    }
    // Phase 2: a unique STABLE candidate wins. A unique generic candidate is
    // remembered as the legacy generic match and the scan continues (a later
    // stable candidate still has priority; the generic result is corroborated
    // by text/name, never a silent identity).
    if (generic) {
      // A3/T47 (R1-iii): a generic/path CSS hit may only win when the captured
      // identity is strong, or when the recorded ancestor context corroborates it
      // AND the captured quote asserts on the candidate (reference maybeAssertQuote).
      const element = list[0]
      const corroborated = corroborate !== null && corroborate(element) === true
      const quoteOk = assertQuote !== null && assertQuote(element) === true
      const mayWin = weakIdentity !== true || (corroborated && quoteOk)
      if (mayWin && genericMatch === null) {
        genericMatch = element
        genericUnique = true
      }
      continue
    }
    // Stable candidate (data/id/label): quote assertion still applies when present.
    if (assertQuote !== null && assertQuote(list[0]) === false) continue
    unique = list[0]
    break
  }
  // A3/T33: if every viable candidate is non-unique, report genuine Ambiguous
  // instead of corroborating an arbitrary generic first hit.
  if (unique === null && stableAmbiguity && genericUnique !== true) return 'ambiguous'
  if (typeof source.liveInfo === 'function') {
    const liveInfo = source.liveInfo as AnnotationLiveInfoProbe
    const probe = unique === null ? genericMatch : unique
    if (probe !== null) {
      if (assertQuote !== null && assertQuote(probe) === false) return 'missing'
      const info = objectOf(liveInfo(probe)) as AnnotationLiveInfo | null
      if (info !== null) {
        if (info.isConnected === false) return 'missing'
        const expected = typeof info.expectedText === 'string' ? info.expectedText : ''
        const actual = typeof info.textContent === 'string' ? info.textContent : ''
        if (unique === null) {
          // A ref whose stable identity disappeared must be corroborated by the
          // captured text summary; with none (icon-only) a same-position
          // replacement reads as gone. A ref that never had a stable candidate
          // (anonymous icon-only control) still resolves on its unique generic hit.
          if (expected.length === 0) return hasStableCandidate ? 'missing' : 'resolved'
          return sanitizeText(actual) === sanitizeText(expected) ? 'resolved' : 'changed'
        }
        // Stable identity resolved. A changed accessible name means this is a
        // different control now, even when the tag/selector still matches.
        const expectedName = typeof info.expectedName === 'string' ? info.expectedName : ''
        const actualName = typeof info.actualName === 'string' ? info.actualName : ''
        if (expectedName.length > 0 && actualName.length > 0
          && sanitizeText(actualName, 60) !== expectedName) return 'changed'
        // A digest mismatch catches text changes beyond the 80-char summary and
        // the captured-empty -> now-has-text case (F11).
        const expectedDigest = typeof info.expectedDigest === 'string' ? info.expectedDigest : ''
        const actualDigest = typeof info.actualDigest === 'string' ? info.actualDigest : ''
        if (expectedDigest.length > 0 && actualDigest.length > 0 && expectedDigest !== actualDigest) return 'changed'
        if (expected.length > 0 && sanitizeText(actual) !== sanitizeText(expected)) return 'changed'
      }
    }
  }
  if (unique !== null) return 'resolved'
  if (stableAmbiguity) return 'ambiguous'
  return genericMatch === null ? 'missing' : 'resolved'
}

/**
 * A3/T34: full multi-strategy resolution. CSS candidates keep precedence; when
 * they do not resolve (ambiguous/missing), the injected fallbacks run from the
 * least structure-sensitive to the most: text quote (position.start as hint) →
 * text position → XPath.
 *
 * A fallback may return `{ status, terminal: true }` when its ambiguity is
 * authoritative (e.g. multiple distinct targets inside the captured descendant
 * scope); terminal ambiguity ends the chain. Weak ambiguity (xpath/position)
 * is remembered but a later text quote may still resolve uniquely.
 * @param input - base resolveRefStatus input plus optional `resolveXPath`,
 *   `resolveTextQuote`, `resolveTextPosition` functions returning a status or null.
 * @returns the winning status plus a `via` hint.
 */
export function annotationResolveStatus(input: unknown): AnnotationResolveStatusOutcome {
  const source = objectOf(input) ?? {}
  const cssStatus = resolveRefStatus(source)
  if (cssStatus === 'resolved' || cssStatus === 'changed') return { status: cssStatus, via: 'css' }
  const fallbacks: ReadonlyArray<readonly [string, AnnotationResolveVia]> = [
    ['resolveTextQuote', 'text-quote'],
    ['resolveTextPosition', 'text-position'],
    ['resolveXPath', 'xpath']
  ]
  let weakAmbiguity: AnnotationResolveStatusOutcome | null = null
  for (const [name, via] of fallbacks) {
    const rawResolver = source[name]
    if (typeof rawResolver !== 'function') continue
    let rawStatus: unknown = null
    try {
      rawStatus = (rawResolver as AnnotationFallbackResolver)()
    } catch {
      rawStatus = null
    }
    let terminal = false
    let status: string | null = null
    if (typeof rawStatus === 'string') {
      status = rawStatus
    } else if (rawStatus !== null && typeof rawStatus === 'object') {
      const outcome = rawStatus as Record<string, unknown>
      terminal = outcome.terminal === true
      status = typeof outcome.status === 'string' ? outcome.status : null
    }
    if (status === 'resolved' || status === 'changed') return { status, via }
    if (status === 'ambiguous') {
      if (terminal) return { status: 'ambiguous', via }
      // A3/T33: ambiguity from a WEAK strategy (xpath/position) must not stop the
      // chain — a later text quote can still resolve uniquely.
      if (weakAmbiguity === null) weakAmbiguity = { status: 'ambiguous', via }
    }
  }
  if (weakAmbiguity !== null) return weakAmbiguity
  return { status: cssStatus, via: 'css' }
}

/**
 * Resolve one unique element-like object from ordered locator candidates.
 *
 * Mirrors `resolveRefStatus`'s walk: a STABLE kind (`data`/`id`/`label`)
 * matching several elements is genuine ambiguity and stops the walk; a GENERIC
 * kind (`role`/`tag`/`path`) matching several cannot discriminate, so the walk
 * continues to less reliable candidates. A unique match wins, and the first
 * unique generic match is remembered as the fallback (R1).
 *
 * A capture-verified unique selector is tried first; one hit is the node,
 * several hits are genuine ambiguity, and no hit falls back to the ordered v1
 * candidates (D11).
 * @param input - `{ candidates, expectedTag, queryAll, uniqueSelector }`.
 * @returns the unique element-like object, or null.
 */
export function resolveNodeCandidate(input: unknown): AnnotationQueryElement | null {
  const source = objectOf(input) ?? {}
  const candidates = source.candidates
  const expectedTag = source.expectedTag
  const rawQueryAll = source.queryAll
  if (typeof rawQueryAll !== 'function') return null
  const queryAll = rawQueryAll as AnnotationQueryAll
  const tag = typeof expectedTag === 'string' ? expectedTag.trim().toLowerCase() : ''
  const ordered: unknown[] = Array.isArray(candidates)
    ? candidates.slice().sort((left, right) => reliabilityOf(right) - reliabilityOf(left))
    : []
  const uniqueSelector = typeof source.uniqueSelector === 'string' && source.uniqueSelector.length > 0
    ? source.uniqueSelector
    : ''
  if (uniqueSelector.length > 0) {
    let uniqueHits: unknown = null
    try {
      uniqueHits = queryAll(uniqueSelector)
    } catch {
      uniqueHits = null
    }
    const tagged = taggedHits(uniqueHits, tag)
    if (tagged !== null) {
      if (tagged.length > 1) return null
      if (tagged.length === 1) return tagged[0]
    }
  }
  let genericMatch: AnnotationQueryElement | null = null
  for (const candidate of ordered) {
    const sourceCandidate = objectOf(candidate)
    if (sourceCandidate === null) continue
    const value = sourceCandidate.value
    if (typeof value !== 'string' || value.length === 0) continue
    let matches: unknown
    try {
      matches = queryAll(value)
    } catch {
      continue
    }
    if (matches === null || matches === undefined) continue
    const list = taggedHits(matches, tag)
    if (list === null || list.length === 0) continue
    const kind = sourceCandidate.kind
    const generic = kind === 'tag' || kind === 'path' || kind === 'role'
    if (list.length > 1) {
      // Stable ambiguity is final; generic ambiguity just means "keep looking".
      if (generic) continue
      return null
    }
    if (generic) {
      if (genericMatch === null) genericMatch = list[0]
      continue
    }
    return list[0]
  }
  return genericMatch
}
