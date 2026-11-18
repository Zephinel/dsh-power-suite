/**
 * Pure floating-surface and picker decisions for UI-element annotation.
 *
 * The annotation picker treats a body-level portal (hover card, dropdown menu,
 * tooltip) as its own mini document: it finds the outermost contiguous floating
 * ancestor, drills the surface's inner candidates and text rows, picks the
 * deepest eligible element under the pointer, and keeps the surface open while
 * a floating selection is edited. It also decides where the rail docks next to
 * the native right Sidebar.
 *
 * Nothing here reads the page at module load. Element accessors are injected
 * (`{ descendants, isCandidate, visible, rectOf, … }`) and the browser entry
 * binds its DOM adapters once through {@link bindAnnotationSurfaceDefaults}, so
 * the module is inert when imported by a unit test. A helper that receives no
 * predicate stays conservative (no surface, no eligible element) rather than
 * guessing.
 *
 * @module
 */

/** F2: inner drill levels are capped so a card with many rows stays navigable. */
const ANNOTATION_SURFACE_MAX_LEVELS = 12

/** One element-like value the surface walk reads; fake objects in unit tests. */
export interface AnnotationSurfaceElement {
  readonly tagName?: unknown
  readonly closest?: (selector: string) => unknown
  readonly matches?: (selector: string) => unknown
  readonly querySelectorAll?: (selector: string) => ArrayLike<unknown>
  readonly getBoundingClientRect?: () => unknown
  readonly getClientRects?: () => ArrayLike<unknown>
  readonly contains?: (node: unknown) => unknown
  readonly innerText?: unknown
  readonly textContent?: unknown
  readonly children?: ArrayLike<unknown>
}

/** One element box as the level filter reads it. */
export interface AnnotationSurfaceBox {
  readonly x?: number
  readonly y?: number
  readonly left?: number
  readonly top?: number
  readonly width?: number
  readonly height?: number
}

/** One surface root and its chain index. */
export interface AnnotationSurfaceRootMatch {
  root: unknown
  index: number
}

/** One drill level: the element plus composer membership. */
export interface AnnotationSurfaceLevel {
  element: unknown
  insideComposer: boolean
}

/** Accessors the level walk reads; tests inject a DOM-free set. */
export interface AnnotationSurfaceAccess {
  descendants: (root: unknown) => Iterable<unknown>
  isCandidate: (element: unknown) => boolean
  isOwn: (element: unknown) => boolean
  visible: (element: unknown) => boolean
  rectOf: (element: unknown) => AnnotationSurfaceBox | null
  textOf: (element: unknown) => string
  childCount: (element: unknown) => number
  insideComposer: (element: unknown) => boolean
}

/** The DOM adapters the browser entry binds once for default calls. */
export interface AnnotationSurfaceDefaults {
  readonly floating?: (element: unknown) => unknown
  readonly access?: () => AnnotationSurfaceAccess
  readonly leafEligible?: (element: unknown) => unknown
  readonly isCandidate?: (element: unknown) => unknown
}

/** The bound DOM adapters; empty until the browser entry configures them. */
let surfaceDefaults: AnnotationSurfaceDefaults = {}

/**
 * Bind the browser entry's DOM adapters to the optional default arguments.
 *
 * Callers that inject every predicate never reach these defaults, so unit tests
 * can import this module directly without a DOM. The browser entry binds once
 * at factory setup; a later bind replaces only the supplied slots.
 * @param defaults - DOM-backed predicate/accessor set.
 * @returns void.
 */
export function bindAnnotationSurfaceDefaults(defaults: AnnotationSurfaceDefaults | null | undefined): void {
  if (defaults === null || defaults === undefined || typeof defaults !== 'object') return
  surfaceDefaults = { ...surfaceDefaults, ...defaults }
}

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
function elementOf(value: unknown): AnnotationSurfaceElement | null {
  return value !== null && typeof value === 'object' ? value as AnnotationSurfaceElement : null
}

/**
 * The element of one chain entry, when the entry and element are objects.
 * @param entry - untrusted chain entry.
 * @returns the element, or null.
 */
function entryElement(entry: unknown): unknown {
  const source = objectOf(entry)
  if (source === null) return null
  const element = source.element
  return element !== null && element !== undefined ? element : null
}

/**
 * The default floating-surface predicate: none until the browser entry binds
 * its DOM adapter. Keeps an unconfigured module free of DOM access.
 * @param element - candidate element.
 * @returns false.
 */
function defaultFloating(element: unknown): boolean {
  void element
  return false
}

/**
 * The default level accessor set: one root level, no descendants. Only used
 * when the browser entry did not bind its DOM adapter.
 * @returns inert accessors.
 */
function defaultAccess(): AnnotationSurfaceAccess {
  if (typeof surfaceDefaults.access === 'function') return surfaceDefaults.access()
  return {
    descendants: () => [],
    isCandidate: () => false,
    isOwn: () => false,
    visible: () => true,
    rectOf: () => null,
    textOf: () => '',
    childCount: () => 0,
    insideComposer: () => false
  }
}

/**
 * The default leaf-eligibility predicate: nothing is eligible until the
 * browser entry binds its DOM adapter.
 * @param element - candidate element.
 * @returns false.
 */
function defaultLeafEligible(element: unknown): boolean {
  void element
  return false
}

/**
 * The default semantic-candidate predicate: nothing is semantic until the
 * browser entry binds its DOM adapter.
 * @param element - candidate element.
 * @returns false.
 */
function defaultSemantic(element: unknown): boolean {
  void element
  return false
}

/**
 * The outermost floating surface of one candidate chain (F2).
 *
 * The hit element may be a static text row inside a body-level portal card;
 * the first floating ancestor starts the surface run, and the run is extended
 * upward while ancestors are themselves floating boxes, so the returned root
 * is the whole card rather than its inner layer. Selection never crosses the
 * root to page ancestors behind the surface.
 * @param chain - candidate chain, nearest first.
 * @param isFloating - injectable predicate; the browser entry's DOM predicate by default.
 * @returns surface root and its chain index, or null.
 */
export function annotationSurfaceRoot(chain: unknown, isFloating?: unknown): AnnotationSurfaceRootMatch | null {
  const entries: unknown[] = Array.isArray(chain) ? chain : []
  const floating = typeof isFloating === 'function'
    ? isFloating as (element: unknown) => unknown
    : (surfaceDefaults.floating ?? defaultFloating)
  for (let index = 0; index < entries.length; index += 1) {
    const element = entryElement(entries[index])
    if (element === null) continue
    let matched
    try {
      matched = floating(element)
    } catch {
      matched = false
    }
    if (!matched) continue
    let root = element
    let rootIndex = index
    let above = index + 1
    while (above < entries.length) {
      const ancestor = entryElement(entries[above])
      if (ancestor === null) break
      let ancestorFloating
      try {
        ancestorFloating = floating(ancestor)
      } catch {
        ancestorFloating = false
      }
      if (!ancestorFloating) break
      root = ancestor
      rootIndex = above
      above += 1
    }
    return { root, index: rootIndex }
  }
  return null
}

/**
 * Drill levels of one floating surface: the whole root first, then its inner
 * candidate controls and text rows in document order (F2).
 *
 * A level is either a normal candidate (`button`, `[aria-label]`, row, …) or a
 * text block: an element with no element children, non-empty text, and a box
 * of at least 8×8. That second rule is what lets a hover card's title/path
 * rows be selected even though they carry no role or aria attribute.
 * @param root - surface root element.
 * @param access - accessor set; the browser entry's DOM accessors by default.
 * @returns levels, root first, capped.
 */
export function annotationSurfaceLevels(root: unknown, access?: unknown): AnnotationSurfaceLevel[] {
  if (root === null || root === undefined || typeof root !== 'object') return []
  const base = defaultAccess()
  const overrides = access !== null && typeof access === 'object' ? access as Partial<AnnotationSurfaceAccess> : null
  const api: AnnotationSurfaceAccess = overrides === null ? base : { ...base, ...overrides }
  const levels: AnnotationSurfaceLevel[] = [{ element: root, insideComposer: api.insideComposer(root) === true }]
  const seen = new Set<unknown>([root])
  const descendants = api.descendants(root)
  for (const element of descendants) {
    if (levels.length >= ANNOTATION_SURFACE_MAX_LEVELS) break
    if (element === null || element === undefined || typeof element !== 'object') continue
    if (seen.has(element)) continue
    if (api.isOwn(element)) continue
    const box = api.rectOf(element)
    if (box === null || box === undefined) continue
    if (Number(box.width) <= 0 || Number(box.height) <= 0) continue
    if (!api.visible(element)) continue
    const candidate = api.isCandidate(element) === true
    const textBlock = !candidate
      && api.childCount(element) === 0
      && api.textOf(element).length > 0
      && Number(box.width) >= 8
      && Number(box.height) >= 8
    if (!candidate && !textBlock) continue
    seen.add(element)
    levels.push({ element, insideComposer: api.insideComposer(element) === true })
  }
  return levels
}

/**
 * Choose the deepest eligible element of one pointer chain (DevTools-like
 * leaf-first picking, A3 follow-up).
 *
 * The chain is nearest-first, so index 0 is the element under the pointer.
 * The walk only moves upward when that element is ineligible (own UI, zero
 * box, structural tag) and NEVER crosses the floating-surface root: a hit
 * inside a floating surface resolves inside the surface, and a page hit
 * resolves within the page chain (up to the page container just below body).
 * @param chain - ancestor chain, nearest first.
 * @param isFloating - injectable surface predicate.
 * @param isEligible - injectable eligibility predicate.
 * @returns chosen chain index, or -1 when nothing is eligible.
 */
export function annotationLeafPickIndex(chain: unknown, isFloating?: unknown, isEligible?: unknown): number {
  const entries: unknown[] = Array.isArray(chain) ? chain : []
  if (entries.length === 0) return -1
  const surface = annotationSurfaceRoot(entries, isFloating)
  const boundary = surface !== null ? Math.min(surface.index, entries.length - 1) : entries.length - 1
  const eligible = typeof isEligible === 'function'
    ? isEligible as (element: unknown) => unknown
    : (surfaceDefaults.leafEligible ?? defaultLeafEligible)
  for (let index = 0; index <= boundary; index += 1) {
    const element = entryElement(entries[index])
    if (element === null) continue
    let ok = false
    try {
      ok = eligible(element) === true
    } catch {
      ok = false
    }
    if (ok) return index
  }
  return -1
}

/**
 * Choose the level a pointer hit should preview/select inside one floating
 * surface (A3 follow-up: inner elements are hoverable again).
 *
 * The hover/click target is the DEEPEST meaningful level under the pointer:
 * the nearest level element on the hit's ancestor chain (levels already mix
 * semantic candidates and text-block rows), then a containment fallback for
 * wrapper-only hits, and finally the surface root itself for background or
 * padding hits. The root keeps index 0 so Parent/Child drilling from an inner
 * level still walks the same level table.
 * @param chain - candidate chain, nearest first.
 * @param levels - surface levels, root first.
 * @param isFloating - injectable surface predicate.
 * @param isSemantic - injectable semantic-candidate predicate.
 * @returns chosen surface and level index (-1 without a surface).
 */
export function annotationSurfacePickLevel(
  chain: unknown,
  levels: unknown,
  isFloating?: unknown,
  isSemantic?: unknown
): { surface: AnnotationSurfaceRootMatch | null, index: number } {
  const entries: unknown[] = Array.isArray(chain) ? chain : []
  const surface = annotationSurfaceRoot(entries, isFloating)
  if (surface === null) return { surface: null, index: -1 }
  const list: unknown[] = Array.isArray(levels) ? levels : []
  if (list.length === 0) return { surface, index: 0 }
  const semantic = typeof isSemantic === 'function'
    ? isSemantic as (element: unknown) => unknown
    : (surfaceDefaults.isCandidate ?? defaultSemantic)
  const levelIndexByElement = new Map<unknown, number>()
  for (let index = 0; index < list.length; index += 1) {
    const element = entryElement(list[index])
    if (element !== null) levelIndexByElement.set(element, index)
  }
  // Prefer the nearest SEMANTIC candidate (button/role/row/aria...): a dropdown
  // row that is itself a control must win over the leaf text inside it.
  let textLevelIndex: number | null = null
  for (let index = 0; index < surface.index; index += 1) {
    const element = entryElement(entries[index])
    if (element === null) continue
    const levelIndex = levelIndexByElement.get(element)
    if (levelIndex === undefined) continue
    if (semantic(element) === true) return { surface, index: levelIndex }
    if (textLevelIndex === null) textLevelIndex = levelIndex
  }
  // No semantic candidate under the pointer: fall back to the nearest
  // text-block level (the Phase 1 drill rule) before the containment fallback.
  if (textLevelIndex !== null) return { surface, index: textLevelIndex }
  // Wrapper-only hit: levels are in document order (parents before children),
  // so the LAST level containing the hit element is the deepest one.
  const hit = entries.length > 0 ? entryElement(entries[0]) : null
  if (hit !== null) {
    let deepest = 0
    for (let index = 1; index < list.length; index += 1) {
      const element = elementOf(entryElement(list[index]))
      if (element === null || typeof element.contains !== 'function') continue
      try {
        if (element.contains(hit)) deepest = index
      } catch {
        // A throwing contains() cannot identify the hit; keep the previous level.
      }
    }
    return { surface, index: deepest }
  }
  return { surface, index: 0 }
}

/**
 * A3/T30: whether the current selection should pin a detected floating surface
 * open while its popover is being edited. Eligible = active mode, a live
 * selection, and at least one selected ref captured inside a floating surface.
 * @param state - annotation state.
 * @param active - whether the mode is active.
 * @returns whether a surface pin is wanted.
 */
export function annotationSurfacePinEligible(state: unknown, active: unknown): boolean {
  if (active !== true) return false
  const source = objectOf(state)
  if (source === null) return false
  const selection = Array.isArray(source.selection) ? source.selection : []
  if (selection.length === 0) return false
  return selection.some((ref) => {
    const entry = objectOf(ref)
    if (entry === null) return false
    const locator = objectOf(entry.locator)
    return locator !== null && locator.surface === 'floating'
  })
}

/**
 * A3/T30: whether one leaving event must be suppressed to keep a pinned surface
 * open. Matches events whose target or relatedTarget belongs to the pinned
 * surface's subtree or to one of its ancestors (some menus close from an
 * ancestor wrapper). Injection-friendly for unit tests.
 * @param pinned - pinned surface element.
 * @param target - event target.
 * @param related - event relatedTarget.
 * @returns whether the event should be swallowed.
 */
export function annotationSurfacePinEventMatches(pinned: unknown, target: unknown, related: unknown): boolean {
  if (pinned === null || pinned === undefined || typeof pinned !== 'object') return false
  const pinnedElement = pinned as AnnotationSurfaceElement
  const relevant = (node: unknown): boolean => {
    if (node === null || node === undefined || typeof node !== 'object') return false
    if (node === pinned) return true
    if (typeof pinnedElement.contains === 'function' && pinnedElement.contains(node)) return true
    const nodeElement = node as AnnotationSurfaceElement
    if (typeof nodeElement.contains === 'function' && nodeElement.contains(pinned)) return true
    return false
  }
  return relevant(target) || relevant(related)
}

/**
 * A3/T68: annotation-rail right offset when the native right Sidebar (document
 * preview / files pane) is open. The rail docks just left of that pane instead
 * of painting over it, so preview content stays pointer-reachable. Only a
 * visible pane flush to the viewport's right edge counts; a fullscreen pane
 * (too wide to leave room) and absent/invalid panes keep the rail at the edge.
 * @param paneRect - native pane rect.
 * @param viewportWidth - viewport width.
 * @returns rail `right` offset in pixels (0 = keep the rail at the edge).
 */
export function annotationRailRightForPane(paneRect: unknown, viewportWidth: unknown): number {
  const pane = objectOf(paneRect)
  if (pane === null) return 0
  const width = Number(pane.width)
  const left = Number(pane.left)
  const right = Number(pane.right)
  const viewport = Number(viewportWidth)
  if (!Number.isFinite(width) || !Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(viewport) || viewport <= 0) return 0
  if (width < 120 || left < 0) return 0
  if (Math.abs(viewport - right) > 2) return 0
  const offset = Math.round(viewport - left)
  if (offset <= 0 || offset > viewport * 0.7) return 0
  return offset
}
