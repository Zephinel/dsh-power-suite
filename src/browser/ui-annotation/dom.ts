/**
 * DOM, geometry and picker helpers of the UI element annotation mode.
 *
 * The controller keeps all mutable state; these functions only read the live
 * page and return plain values: event target resolution (including Shadow DOM
 * retargeting), viewport/frame measurements, stable identity and component
 * classification, descriptor capture, the candidate chain, floating-surface
 * decisions, labels and focus. They are extracted so the stateful controller
 * can move next without moving the DOM reading rules with it.
 *
 * @module
 */

import {
  annotationAncestorTagChain,
  annotationFirstTextLeafDescendant,
  annotationJsPathFor,
  annotationTextPositionOf,
  annotationTextQuoteOf,
  annotationXPathOf
} from './anchors.ts'
import {
  ANNOTATION_MAX_ANCESTORS,
  annotationIsGeneratedClass,
  annotationStableSelectorCandidate,
  annotationTagPath,
  buildElementRef,
  buildUniqueSelector,
  isDynamicValue,
  isFormTag
} from './identity.ts'
import type {
  AnnotationAnchorPath,
  AnnotationAttribute,
  AnnotationSelectorStep,
  AnnotationStableSelector,
  AnnotationTagPath,
  AnnotationTextPosition,
  AnnotationTextQuote
} from './identity.ts'
import { resolveNodeCandidate } from './resolution.ts'
import { bindAnnotationSurfaceDefaults } from './surface.ts'
import type { AnnotationSurfaceAccess, AnnotationSurfaceBox } from './surface.ts'
import {
  sanitizeAttributeName,
  sanitizeAttributeValue,
  sanitizeText,
  textDigest
} from './text.ts'

/** One viewport-relative rectangle in CSS pixels. */
export interface AnnotationRect {
  x: number
  y: number
  width: number
  height: number
}

/** The current viewport size. */
export interface AnnotationViewportSize {
  width: number
  height: number
}

/** Structural view of the element members these helpers read. */
interface AnnotationElementView {
  tagName?: unknown
  nodeType?: unknown
  parentElement?: Element | null
  previousElementSibling?: AnnotationElementView | null
  childElementCount?: number
  isContentEditable?: boolean
  children?: ArrayLike<unknown>
  attributes?: ArrayLike<{ name?: unknown, value?: unknown }>
  classList?: Iterable<unknown>
  textContent?: string | null
  innerText?: string
  matches?: (selector: string) => boolean
  closest?: (selector: string) => Element | null
  getRootNode?: () => unknown
  getClientRects?: () => ArrayLike<unknown>
  getBoundingClientRect?: () => { left?: number, top?: number, width?: number, height?: number }
  querySelectorAll?: (selector: string) => ArrayLike<Element>
  querySelector?: (selector: string) => Element | null
  contains?: (node: unknown) => boolean
}

/** Structural view of one event the entry forwards. */
interface AnnotationEventView {
  target?: unknown
  composedPath?: () => unknown[]
}

/** One stable ancestor captured for a descriptor. */
export interface AnnotationStableAncestorEntry {
  tag: string
  attrs: AnnotationAttribute[]
}

/** The descriptor `buildElementRef` consumes, shaped from one live element. */
export interface AnnotationDescriptor {
  tag: string
  id: string
  role: string
  name: string
  attrs: AnnotationAttribute[]
  text: string
  textDigest: string
  component: string
  path: string | null
  tagPath: AnnotationSelectorStep[]
  isEditable: boolean
  insideComposer: boolean
  uniqueSelector: string | null
  uniqueVerified: boolean
  ancestors: AnnotationStableAncestorEntry[]
  classes: string[]
  xpath: string
  jsPath: string
  textQuote: AnnotationTextQuote | null
  textPosition: AnnotationTextPosition | null
  anchorTarget: 'self' | 'descendant' | null
  anchorLeafTag: string | null
  anchorAncestorChain: string[] | null
  anchorSignature: { tag: string, attrs: AnnotationAttribute[] } | null
}

/** Localized labels for the two insertion formats. */
export interface AnnotationInsertLabels {
  title: string
  reference: string
  session: string
  noSession: string
  note: string
  emptyNote: string
  batchHeader: string
  status: string
  statusEphemeral: string
  statusAmbiguous: string
  statusChanged: string
  skipped: string
  removed: string
  removedCount: number
  noRemaining: string
}

/** Selector set of elements the picker treats as meaningful, nearest first. */
export const ANNOTATION_CANDIDATE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="link"], [role="dialog"], [role="menu"], [role="tooltip"], [role="list"], [role="listitem"], [role="treeitem"], [role="combobox"], [role="textbox"], [data-row-key], [data-conversation-region], [aria-label], h1, h2, h3, h4, h5, h6, li, td, pre, p, code, nav, aside, main, section'

/** Estimated popover size used for clamping. */
export const ANNOTATION_POPOVER_SIZE = { width: 320, height: 248 }

/** Launcher edge length in pixels; must match the stylesheet. */
export const ANNOTATION_LAUNCHER_SIZE = 44

/**
 * Resolve one event target (or node) to an Element.
 * @param {unknown} target - event target or node.
 * @returns {Element | null} the element, when available.
 */
export function annotationDomElement(target: unknown): Element | null {
  if (target === null || target === undefined || typeof target !== 'object') return null
  if (typeof Element !== 'undefined' && target instanceof Element) return target
  const view = target as AnnotationElementView
  if (typeof view.nodeType === 'number' && view.nodeType === 3) return annotationDomElement(view.parentElement)
  return null
}

/**
 * The event target element. The target is preferred over `composedPath()[0]`
 * because the DOM retargets a Shadow DOM hit to its host, which is exactly
 * the selectable boundary this feature documents.
 * @param {object} event - DOM event.
 * @returns {Element | null} the event target element.
 */
export function annotationEventElement(event: unknown): Element | null {
  if (event === null || typeof event !== 'object') return null
  const view = event as AnnotationEventView
  const target = annotationDomElement(view.target)
  if (target !== null) return target
  if (typeof view.composedPath === 'function') {
    const path = view.composedPath()
    if (Array.isArray(path)) {
      for (const entry of path) {
        const element = annotationDomElement(entry)
        if (element !== null) return element
      }
    }
  }
  return null
}

/**
 * Retarget one node inside a Shadow DOM to its host element.
 * @param {Element | null} node - node to retarget.
 * @returns {Element | null} the outermost host element.
 */
export function annotationShadowHost(node: Element | null): Element | null {
  let current: Element | null = node
  let depth = 0
  while (current !== null && depth < 8) {
    const view = current as unknown as AnnotationElementView
    const root = typeof view.getRootNode === 'function' ? view.getRootNode() : null
    const host = root !== null && typeof root === 'object' && 'host' in root
      ? (root as { host?: unknown }).host
      : null
    if (host !== null && host !== undefined && host !== document) {
      current = annotationDomElement(host)
      depth += 1
      continue
    }
    break
  }
  return current
}

/** @returns the current viewport size. */
export function annotationViewport(): AnnotationViewportSize {
  return {
    width: typeof window.innerWidth === 'number' ? window.innerWidth : 0,
    height: typeof window.innerHeight === 'number' ? window.innerHeight : 0
  }
}

/**
 * The layout frame: the element whose padding makes room for the rail.
 * @returns {Element | null} the frame element.
 */
export function annotationLayoutFrame() {
  const overlay = document.querySelector('[data-shell-overlay]')
  if (overlay === null) return null
  const frame = overlay.parentElement
  return frame instanceof HTMLElement ? frame : null
}

/**
 * Sum the widths of the native left and right Sidebar columns.
 * @returns {number} total sidebar width in pixels.
 */
export function annotationMeasureSidebarWidths() {
  let total = 0
  for (const selector of ['[class$="_sidebarCol"]', '[class$="_rightbarCol"]']) {
    const column = document.querySelector(selector)
    if (!(column instanceof HTMLElement)) continue
    const rect = column.getBoundingClientRect()
    if (rect.width > 0) total += rect.width
  }
  return total
}

/**
 * One element's viewport rectangle, rounded.
 * @param {unknown} element - candidate element.
 * @returns {{ x: number, y: number, width: number, height: number } | null} rectangle.
 */
export function annotationRectOf(element: unknown): AnnotationRect | null {
  if (element === null || typeof element !== 'object') return null
  const view = element as AnnotationElementView
  if (typeof view.getBoundingClientRect !== 'function') return null
  const rect = view.getBoundingClientRect()
  if (rect === null || typeof rect !== 'object') return null
  return {
    x: Math.round(rect.left ?? 0),
    y: Math.round(rect.top ?? 0),
    width: Math.round(rect.width ?? 0),
    height: Math.round(rect.height ?? 0)
  }
}

/**
 * Whether two rectangles intersect.
 * @param {{ x: number, y: number, width: number, height: number }} left - first rectangle.
 * @param {{ x: number, y: number, width: number, height: number }} right - second rectangle.
 * @returns {boolean} whether they overlap.
 */
export function annotationRectsIntersect(left: AnnotationRect, right: AnnotationRect): boolean {
  return left.x < right.x + right.width
    && right.x < left.x + left.width
    && left.y < right.y + right.height
    && right.y < left.y + left.height
}

/**
 * Whether one element is rendered and visible.
 * @param {Element | null} element - candidate element.
 * @returns {boolean} whether it has a box and is not hidden.
 */
export function annotationElementVisible(element: unknown): boolean {
  if (element === null || typeof element !== 'object') return false
  const view = element as AnnotationElementView
  if (typeof view.getClientRects !== 'function') return false
  if (view.getClientRects().length === 0) return false
  // Zero-area elements have no meaningful target to outline or annotate; the
  // primary picker check rejects them before any fallback path (F13).
  const rect = typeof view.getBoundingClientRect === 'function' ? view.getBoundingClientRect() : null
  if (rect === null || (rect.width ?? 0) <= 0 || (rect.height ?? 0) <= 0) return false
  const style = window.getComputedStyle(element as Element) as unknown as { visibility?: unknown, display?: unknown }
  if (style === null || typeof style !== 'object') return true
  return style.visibility !== 'hidden' && style.display !== 'none'
}

/**
 * Stable id of one element, empty when it looks generated.
 * @param {Element} element - candidate element.
 * @returns {string} stable id or ''.
 */
export function annotationStableId(element: unknown): string {
  if (element === null || typeof element !== 'object' || typeof (element as Element).getAttribute !== 'function') return ''
  const rawId = (element as Element).getAttribute('id')
  if (rawId === null || rawId.length === 0 || rawId.length > 48) return ''
  // The attribute sanitizer is the single authority for what may be captured;
  // an id is just another safe-named attribute value (F1).
  const id = sanitizeAttributeValue('id', rawId)
  if (id === null || isDynamicValue(id)) return ''
  return id
}

/**
 * Semantic role of one element, explicit role handled by the caller.
 * @param {string} tag - lowercase tag name.
 * @param {Element} element - candidate element.
 * @returns {string} role name or ''.
 */
export function annotationRoleOf(tag: string, element: Element): string {
  if (tag === 'button') return 'button'
  if (tag === 'a' && element.hasAttribute('href')) return 'link'
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase()
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'submit' || type === 'button' || type === 'reset') return 'button'
    return 'textbox'
  }
  if (tag === 'select') return 'combobox'
  if (tag === 'textarea') return 'textbox'
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (tag === 'li') return 'listitem'
  if (element.getAttribute('data-row-key') !== null) return 'row'
  if (tag === 'nav' || tag === 'aside' || tag === 'main' || tag === 'section') return 'region'
  return ''
}

/**
 * Component class used in the ElementRef and the popover label.
 * @param {string} tag - lowercase tag name.
 * @param {string} role - derived or explicit role.
 * @param {boolean} isEditable - whether the element is contenteditable.
 * @param {boolean} insideComposer - whether the element is the composer region.
 * @returns {string} component class.
 */
export function annotationComponentOf(tag: string, role: string, isEditable: boolean, insideComposer: boolean): string {
  if (isEditable) return 'editable'
  if (insideComposer) return 'region'
  if (role === 'button' || tag === 'button' || role === 'tab') return 'button'
  if (role === 'link' || tag === 'a') return 'link'
  if (role === 'textbox' || role === 'combobox' || role === 'checkbox' || role === 'radio'
    || tag === 'input' || tag === 'select' || tag === 'textarea') return 'input'
  if (role === 'menuitem' || role === 'menuitemcheckbox') return 'menu-item'
  if (role === 'row' || role === 'listitem' || tag === 'li' || tag === 'tr') return 'row'
  if (role === 'region' || tag === 'main' || tag === 'section' || tag === 'nav' || tag === 'aside') return 'region'
  if (role === 'heading' || tag === 'p' || tag === 'pre' || tag === 'code') return 'text'
  return 'container'
}

/**
 * Accessible name of one element. Never reads control values or editor content.
 * @param {Element} element - candidate element.
 * @param {string} tag - lowercase tag name.
 * @returns {string} sanitized name.
 */
export function annotationAccessibleName(element: Element, tag: string): string {
  const ariaLabel = element.getAttribute('aria-label')
  if (ariaLabel !== null && ariaLabel.trim().length > 0) return sanitizeText(ariaLabel, 60)
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy !== null && labelledBy.length > 0) {
    const label = document.getElementById(labelledBy)
    if (label !== null) {
      const text = sanitizeText(label.textContent ?? '', 60)
      if (text.length > 0) return text
    }
  }
  if (tag === 'img') {
    const alt = element.getAttribute('alt')
    if (alt !== null && alt.trim().length > 0) return sanitizeText(alt, 60)
  }
  const wrappingLabel = typeof element.closest === 'function' ? element.closest('label') : null
  if (wrappingLabel !== null && wrappingLabel !== element) {
    const text = sanitizeText(wrappingLabel.textContent ?? '', 60)
    if (text.length > 0) return text
  }
  if (isFormTag(tag)) {
    const placeholder = element.getAttribute('placeholder')
    if (placeholder !== null && placeholder.trim().length > 0) return sanitizeText(placeholder, 60)
    const name = element.getAttribute('name')
    if (name !== null && name.trim().length > 0) return sanitizeText(name, 60)
    return sanitizeText(element.getAttribute('type') ?? tag, 40)
  }
  return ''
}

/** Selector of every surface whose content is user input, never page copy. */
export const ANNOTATION_LIVE_INPUT_SURFACE = 'input, textarea, select, [contenteditable], [data-lexical-editor="true"]'

/**
 * Whether one element is (or contains) a live input surface. Those live values
 * and editor contents are never read, copied, or summarized (F7).
 * @param {Element} element - candidate element.
 * @returns {boolean} whether text collection must be suppressed.
 */
export function annotationHasLiveInputSurface(element: Element): boolean {
  if (element === null || typeof element !== 'object') return false
  const view = element as unknown as AnnotationElementView
  if (typeof view.matches === 'function' && view.matches(ANNOTATION_LIVE_INPUT_SURFACE)) return true
  return typeof view.querySelector === 'function'
    && view.querySelector(ANNOTATION_LIVE_INPUT_SURFACE) !== null
}

/**
 * Sanitized text summary of one element. Never reads control values and never
 * descends into a native editor or password field.
 * @param {Element} element - candidate element.
 * @param {boolean} isEditable - whether the element is contenteditable.
 * @returns {string} sanitized summary.
 */
export function annotationTextSummary(element: Element, isEditable: boolean): string {
  if (isEditable) return ''
  if (annotationHasLiveInputSurface(element)) return ''
  const text = typeof (element as unknown as AnnotationElementView).textContent === 'string'
    ? (element as unknown as AnnotationElementView).textContent as string
    : ''
  return sanitizeText(text, 80)
}

/**
 * Digest of the full sanitized text of one element (F11). Privacy suppression is
 * the same as the text summary: live input surfaces yield '' so a digest can
 * never stand in for their content.
 * @param {Element} element - candidate element.
 * @param {boolean} isEditable - whether the element is contenteditable.
 * @returns {string} eight-hex digest, or ''.
 */
export function annotationTextDigest(element: Element, isEditable: boolean): string {
  if (isEditable) return ''
  if (annotationHasLiveInputSurface(element)) return ''
  const text = typeof (element as unknown as AnnotationElementView).textContent === 'string'
    ? (element as unknown as AnnotationElementView).textContent as string
    : ''
  return textDigest(text)
}

/**
 * Relative `tag:nth-of-type(n)` steps from one ancestor down to one element.
 * @param {Element} element - target element.
 * @param {Element} ancestor - ancestor to start from.
 * @returns {Array<{ tag: string, index: number }> | null} steps, or null when the ancestor is not on the path.
 */
export function annotationStructuralSteps(element: Element | null, ancestor: Element | null): AnnotationSelectorStep[] | null {
  if (element === null || ancestor === null || element === ancestor) return null
  const steps: AnnotationSelectorStep[] = []
  let current: Element | null = element
  let depth = 0
  while (current !== null && current !== ancestor && depth < 8) {
    const view = current as unknown as AnnotationElementView
    const tag = typeof view.tagName === 'string' ? view.tagName.toLowerCase() : ''
    if (tag.length === 0) return null
    let index = 1
    let sibling = view.previousElementSibling ?? null
    while (sibling !== null) {
      if (sibling.tagName === view.tagName) index += 1
      sibling = sibling.previousElementSibling ?? null
    }
    steps.push({ tag, index })
    current = view.parentElement ?? null
    depth += 1
  }
  if (current !== ancestor) return null
  steps.reverse()
  return steps
}

/**
 * Stable-anchor selector candidates for one element: the nearest stable
 * ancestors (up to three) plus the structural steps to reach the element.
 * @param {Element} element - live element.
 * @returns {Array<{ selector: string, steps: Array<{ tag: string, index: number }> }>} anchors, nearest first.
 */
export function annotationAnchorPaths(element: Element | null): AnnotationAnchorPath[] {
  const anchors: AnnotationAnchorPath[] = []
  let current = element === null || typeof element !== 'object'
    ? null
    : (element as unknown as AnnotationElementView).parentElement ?? null
  let depth = 0
  while (current !== null && current !== undefined && current !== document.body && current !== document.documentElement && depth < 10 && anchors.length < 3) {
    const stable = annotationStableSelectorCandidate(current)
    if (stable !== null) {
      const steps = annotationStructuralSteps(element, current)
      if (steps !== null && steps.length > 0) anchors.push({ selector: stable.selector, steps })
    }
    current = (current as unknown as AnnotationElementView).parentElement ?? null
    depth += 1
  }
  return anchors
}

/**
 * Sanitized attribute pairs of one element, shaped for the record normalizer.
 * @param {Element} element - live element.
 * @returns {Array<{ name: string, value: string }>} sanitized pairs.
 */
export function annotationSanitizedAttributes(element: Element | null): AnnotationAttribute[] {
  const attrs: AnnotationAttribute[] = []
  if (element === null || typeof element !== 'object') return attrs
  const attributes = (element as unknown as AnnotationElementView).attributes
  if (attributes === undefined || attributes === null) return attrs
  for (const attribute of Array.from(attributes)) {
    if (typeof attribute.name !== 'string' || typeof attribute.value !== 'string') continue
    const name = sanitizeAttributeName(attribute.name)
    if (name === null) continue
    const value = sanitizeAttributeValue(name, attribute.value)
    if (value === null) continue
    attrs.push({ name, value })
  }
  return attrs
}

/**
 * Stable ancestors of one element, nearest first, bounded by the record schema.
 * @param {Element} element - live element.
 * @returns {Array<{ tag: string, attrs: Array<{ name: string, value: string }> }>} ancestor entries.
 */
export function annotationStableAncestorEntries(element: Element | null): AnnotationStableAncestorEntry[] {
  const entries: AnnotationStableAncestorEntry[] = []
  let current = element === null || typeof element !== 'object'
    ? null
    : (element as unknown as AnnotationElementView).parentElement ?? null
  let depth = 0
  while (current !== null && current !== undefined && current !== document.body && current !== document.documentElement && depth < 10 && entries.length < ANNOTATION_MAX_ANCESTORS) {
    const attrs = annotationSanitizedAttributes(current)
    const tagName = (current as unknown as AnnotationElementView).tagName
    if (attrs.length > 0 && typeof tagName === 'string') entries.push({ tag: tagName.toLowerCase(), attrs })
    current = (current as unknown as AnnotationElementView).parentElement ?? null
    depth += 1
  }
  return entries
}

/**
 * Build the descriptor consumed by `buildElementRef` from a live element.
 * @param {Element} element - candidate element.
 * @param {boolean} insideComposer - whether the element is the composer region.
 * @returns {object} element descriptor.
 */
export function annotationDescriptorOf(element: Element, insideComposer: boolean): AnnotationDescriptor {
  const view = element as unknown as AnnotationElementView
  const tag = typeof view.tagName === 'string' ? view.tagName.toLowerCase() : 'element'
  const isEditable = tag !== 'input' && tag !== 'textarea' && tag !== 'select' && view.isContentEditable === true
  const attrs: AnnotationAttribute[] = []
  for (const attribute of Array.from(view.attributes ?? [])) {
    if (typeof attribute.name !== 'string' || typeof attribute.value !== 'string') continue
    const name = sanitizeAttributeName(attribute.name)
    if (name === null) continue
    const value = sanitizeAttributeValue(name, attribute.value)
    if (value === null) continue
    attrs.push({ name, value })
  }
  const role = sanitizeText(element.getAttribute('role') ?? '', 32) || annotationRoleOf(tag, element)
  const pathInfo: AnnotationTagPath = annotationTagPath(element as unknown as Parameters<typeof annotationTagPath>[0])
  const classes: string[] = []
  if (view.classList !== undefined && view.classList !== null) {
    for (const className of Array.from(view.classList).slice(0, 8)) {
      if (typeof className !== 'string') continue
      if (isDynamicValue(className)) continue
      if (!/^[A-Za-z_][A-Za-z0-9_-]{1,39}$/.test(className)) continue
      if (annotationIsGeneratedClass(className)) continue
      classes.push(className)
      if (classes.length >= 3) break
    }
  }
  // A verified unique selector costs a handful of querySelectorAll calls at
  // select time (never on the pointermove hot path) and is the locator that
  // fixes duplicate-label controls such as `New session` (A2/D11).
  const unique = buildUniqueSelector({
    tag,
    attrs,
    anchorPaths: annotationAnchorPaths(element)
  }, (selector) => document.querySelectorAll(selector))
  const textBearingLeaf = (view.childElementCount ?? 0) === 0 && !isEditable
  const xpath = annotationXPathOf(element)
  // A3/T38 (③): non-leaf targets capture the first text leaf descendant's
  // quote/position plus the recorded ancestor chain + stable target signature.
  let textQuote: AnnotationTextQuote | null = textBearingLeaf ? annotationTextQuoteOf(element) : null
  let textPosition: AnnotationTextPosition | null = textBearingLeaf ? annotationTextPositionOf(element) : null
  let anchorTarget: 'self' | 'descendant' | null = textBearingLeaf ? 'self' : null
  let anchorLeafTag: string | null = null
  let anchorAncestorChain: string[] | null = null
  let anchorSignature: { tag: string, attrs: AnnotationAttribute[] } | null = null
  if (!textBearingLeaf && !isEditable) {
    const leaf = annotationFirstTextLeafDescendant(element)
    if (leaf !== null) {
      const leafQuote = annotationTextQuoteOf(leaf)
      if (leafQuote !== null) {
        textQuote = leafQuote
        textPosition = annotationTextPositionOf(leaf)
        anchorTarget = 'descendant'
        anchorLeafTag = typeof leaf.tagName === 'string' ? leaf.tagName.toLowerCase() : null
        anchorAncestorChain = annotationAncestorTagChain(leaf, element)
        const stableAttrs: AnnotationAttribute[] = []
        for (const attr of attrs) {
          if (attr === null || typeof attr !== 'object') continue
          if (typeof attr.name !== 'string') continue
          if (!/^(data-|aria-|role$|id$|name$)/.test(attr.name)) continue
          stableAttrs.push({ name: attr.name, value: attr.value })
          if (stableAttrs.length >= 6) break
        }
        anchorSignature = { tag, attrs: stableAttrs }
      }
    }
  }
  const jsPath = annotationJsPathFor({ selector: unique.selector, xpath })
  return {
    tag,
    id: annotationStableId(element),
    role,
    name: annotationAccessibleName(element, tag),
    attrs,
    text: annotationTextSummary(element, isEditable),
    textDigest: annotationTextDigest(element, isEditable),
    component: annotationComponentOf(tag, role, isEditable, insideComposer === true),
    path: pathInfo.selector,
    tagPath: pathInfo.parts,
    isEditable,
    insideComposer: insideComposer === true,
    uniqueSelector: unique.selector,
    uniqueVerified: unique.verified,
    ancestors: annotationStableAncestorEntries(element),
    classes,
    xpath,
    jsPath,
    textQuote,
    textPosition,
    anchorTarget,
    anchorLeafTag,
    anchorAncestorChain,
    anchorSignature
  }
}

/**
 * First node of a candidate chain: text nodes resolve to their parent, our
 * own UI is rejected, and an editable's contents resolve to the composer
 * region (whose internals are never read).
 * @param {unknown} target - event target.
 * @returns {Element | null} the chain's start element.
 */
export function annotationStartNode(target: unknown): Element | null {
  const shadowHost = annotationShadowHost(annotationDomElement(target))
  const node = shadowHost === null ? annotationDomElement(target) : shadowHost
  if (node === null) return null
  if (typeof node.closest !== 'function') return null
  if (node.closest('[data-psa-own]') !== null) return null
  const editable = node.closest('[data-lexical-editor="true"], [contenteditable="true"]')
  if (editable !== null) {
    const composer = editable.closest('[data-conversation-region="composer"]')
    return composer ?? editable
  }
  return node
}

/**
 * Walk the ancestor chain of one target, nearest first.
 * @param {unknown} target - event target.
 * Descriptors are intentionally NOT built here: pointermove walks up to 16
 * ancestors, and each descriptor reads full textContent twice (summary +
 * digest). The chain keeps elements (+ composer membership) only; the
 * descriptor is built lazily for the chosen element and ≤2 context ancestors
 * in `refFromChain`.
 * @returns {Array<{ element: Element, insideComposer: boolean }>} the chain.
 */
export function annotationCandidateChain(target: unknown): Array<{ element: Element, insideComposer: boolean }> {
  const start = annotationStartNode(target)
  if (start === null) return []
  const chain: Array<{ element: Element, insideComposer: boolean }> = []
  let current: Element | null = start
  let depth = 0
  while (current !== null && current !== document.body && current !== document.documentElement && depth < 16) {
    const insideComposer = typeof current.closest === 'function' && current.closest('[data-conversation-region="composer"]') !== null
    chain.push({ element: current, insideComposer })
    current = (current as unknown as AnnotationElementView).parentElement ?? null
    depth += 1
  }
  return chain
}

/**
 * Whether one chain element is a meaningful candidate.
 * @param {Element} element - chain element.
 * @returns {boolean} whether the picker accepts it.
 */
export function annotationIsCandidate(element: unknown): boolean {
  if (element === null || typeof element !== 'object') return false
  const view = element as AnnotationElementView
  const tag = typeof view.tagName === 'string' ? view.tagName.toLowerCase() : ''
  if (tag === '' || tag === 'html' || tag === 'body') return false
  if (typeof view.closest !== 'function') return false
  if (view.closest('[data-psa-own]') !== null) return false
  if (typeof view.matches !== 'function' || !view.matches(ANNOTATION_CANDIDATE_SELECTOR)) return false
  return annotationElementVisible(element)
}

/**
 * Computed z-index of one element, as a number, or null when it participates
 * in no explicit stacking layer (`z-index: auto`).
 * @param {Element} element - live element.
 * @returns {number | null} computed z-index.
 */
export function annotationComputedZIndex(element: unknown): number | null {
  if (element === null || typeof element !== 'object') return null
  const style = window.getComputedStyle(element as Element) as unknown as { zIndex?: unknown }
  if (style === null || typeof style !== 'object') return null
  const raw = style.zIndex
  if (typeof raw !== 'string' || raw.length === 0 || raw === 'auto') return null
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : null
}

/**
 * Whether one element is a floating surface box: out of normal flow, with an
 * explicit stacking layer, a real box, and no annotation UI inside it.
 *
 * The test intentionally uses computed style, never hashed DSH class names,
 * so a DSH rebuild cannot silently disable the surface picker. `<svg>` and
 * zero-size decorations are excluded; our own nodes are never targets.
 * @param {Element} element - live element.
 * @returns {boolean} whether the element is a floating box.
 */
export function annotationFloatingBox(element: unknown): boolean {
  if (element === null || typeof element !== 'object') return false
  const view = element as AnnotationElementView
  if (typeof view.tagName !== 'string') return false
  const tag = view.tagName.toLowerCase()
  if (tag === 'html' || tag === 'body' || tag === 'svg') return false
  if (typeof view.closest !== 'function') return false
  if (view.closest('[data-psa-own]') !== null) return false
  if (!annotationElementVisible(element)) return false
  const style = window.getComputedStyle(element as Element) as unknown as { position?: unknown }
  if (style === null || typeof style !== 'object') return false
  if (style.position !== 'fixed' && style.position !== 'absolute') return false
  const zIndex = annotationComputedZIndex(element)
  return zIndex !== null && zIndex >= ANNOTATION_SURFACE_MIN_Z
}

/** Minimum computed z-index that makes an element a floating surface. */
export const ANNOTATION_SURFACE_MIN_Z = 10

/**
 * DOM accessors used by {@link annotationSurfaceLevels}; injectable so the
 * level algorithm is unit-testable without a browser.
 * @returns {object} accessor set.
 */
export function annotationSurfaceAccess(): AnnotationSurfaceAccess {
  return {
    descendants: (root: unknown): Iterable<unknown> => {
      const view = root as AnnotationElementView
      return typeof view.querySelectorAll === 'function' ? Array.from(view.querySelectorAll('*')) : []
    },
    isCandidate: (element: unknown): boolean => annotationIsCandidate(element),
    isOwn: (element: unknown): boolean => {
      const view = element as AnnotationElementView
      return typeof view.closest === 'function' && view.closest('[data-psa-own]') !== null
    },
    visible: (element: unknown): boolean => annotationElementVisible(element),
    rectOf: (element: unknown): AnnotationSurfaceBox | null => annotationRectOf(element),
    textOf: (element: unknown): string => {
      const view = element as AnnotationElementView
      return typeof view.innerText === 'string' ? view.innerText : (view.textContent ?? '').trim()
    },
    childCount: (element: unknown): number => {
      const children = (element as AnnotationElementView).children
      return children !== undefined && children !== null && typeof children.length === 'number' ? children.length : 0
    },
    insideComposer: (element: unknown): boolean => {
      const view = element as AnnotationElementView
      return typeof view.closest === 'function' && view.closest('[data-conversation-region="composer"]') !== null
    }
  }
}

/** Structural tags that are never a pick target; the walk falls through them. */
export const ANNOTATION_INELIGIBLE_TAGS = new Set([
  'html', 'body', 'head', 'script', 'style', 'link', 'meta', 'title', 'template',
  'noscript', 'br', 'wbr', 'base', 'col', 'colgroup'
])

/**
 * Whether one DOM element is a valid LEAF pick target (A3 leaf-first picking).
 *
 * Eligible = a real visible box, not our own annotation UI, and not a
 * structural tag. Everything else (spans, SVGs, paths, buttons, rows, …) is
 * eligible, exactly like a DevTools inspect hit; ineligible nodes are skipped
 * and the ancestor walk continues.
 * @param {unknown} element - element under consideration.
 * @returns {boolean} whether the element can be hovered/selected itself.
 */
export function annotationLeafEligible(element: unknown): boolean {
  if (element === null || element === undefined || typeof element !== 'object') return false
  const view = element as AnnotationElementView
  if (typeof view.tagName !== 'string' || typeof view.closest !== 'function') return false
  const tag = view.tagName.toLowerCase()
  if (tag.length === 0 || ANNOTATION_INELIGIBLE_TAGS.has(tag)) return false
  if (view.closest('[data-psa-own]') !== null) return false
  try {
    if (!annotationElementVisible(element)) return false
  } catch {
    return false
  }
  const rect = annotationRectOf(element)
  if (rect === null || rect === undefined) return false
  return rect.width > 0 && rect.height > 0
}

// The surface model owns the DOM-free picker algorithms; the browser entry
// binds its DOM adapters once so an unparameterized call keeps the exact
// pre-extraction behavior (and an imported module stays inert in tests).
bindAnnotationSurfaceDefaults({
  floating: annotationFloatingBox,
  access: annotationSurfaceAccess,
  leafEligible: annotationLeafEligible,
  isCandidate: annotationIsCandidate
})

/**
 * Resolve one ref to its unique live element.
 * @param {object} ref - ElementRef.
 * @returns {Element | null} the element when exactly one candidate resolves.
 */
export function annotationResolveNode(ref: unknown): Element | null {
  if (ref === null || typeof ref !== 'object') return null
  const locator = (ref as { locator?: unknown }).locator
  if (locator === null || typeof locator !== 'object') return null
  const view = locator as { candidates?: unknown, tag?: unknown, uniqueSelector?: unknown }
  const resolved = resolveNodeCandidate({
    candidates: view.candidates,
    expectedTag: view.tag,
    uniqueSelector: typeof view.uniqueSelector === 'string' ? view.uniqueSelector : '',
    queryAll: (selector: string) => document.querySelectorAll(selector)
  })
  return resolved === null ? null : resolved as unknown as Element
}

/**
 * Collect marquee candidates intersecting one rectangle. A single bounded
 * query runs at release; nested candidates keep the deepest element.
 * @param {{ x: number, y: number, width: number, height: number }} rect - marquee rectangle.
 * @returns {Element[]} ordered candidates, capped.
 */
export function annotationBoxCandidateElements(rect: AnnotationRect): Element[] {
  if (rect === null || typeof rect !== 'object') return []
  const hits: Element[] = []
  let nodes
  try {
    // One bounded scan at release, over exactly the click picker's candidates (F15).
    nodes = document.querySelectorAll(ANNOTATION_CANDIDATE_SELECTOR)
  } catch {
    return []
  }
  for (const node of nodes) {
    if (!(node instanceof Element)) continue
    if (node.closest('[data-psa-own]') !== null) continue
    if (!annotationElementVisible(node)) continue
    const box = annotationRectOf(node)
    if (box === null || box.width === 0 || box.height === 0) continue
    if (!annotationRectsIntersect(rect, box)) continue
    hits.push(node)
  }
  const specific = hits.filter((node) => !hits.some((other) => other !== node && node.contains(other)))
  return specific.slice(0, 24)
}

/**
 * Localized labels for the two insertion formats.
 * @param {Function} t - namespace-bound translate.
 * @returns {object} insertion labels.
 */
export function annotationInsertLabels(t: DshTranslate): AnnotationInsertLabels {
  return {
    title: t('insert.title'),
    reference: t('insert.reference'),
    session: t('insert.session'),
    noSession: t('insert.noSession'),
    note: t('insert.note'),
    emptyNote: t('insert.emptyNote'),
    batchHeader: t('insert.batchHeader'),
    status: t('insert.status'),
    statusEphemeral: t('insert.statusEphemeral'),
    statusAmbiguous: t('insert.statusAmbiguous'),
    statusChanged: t('insert.statusChanged'),
    skipped: t('insert.skipped'),
    removed: t('insert.removed'),
    removedCount: 0,
    noRemaining: t('insert.noRemaining')
  }
}

/**
 * Focus the current Conversation's Lexical editor after an insertion.
 * @returns {void}
 */
export function annotationFocusComposer() {
  const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')
  if (editor instanceof HTMLElement) editor.focus()
}
