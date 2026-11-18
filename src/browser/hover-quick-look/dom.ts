/**
 * Narrow DOM facade for the hover quick-look surface.
 *
 * The Host profile (`lib: ES2023`, no DOM lib) type-checks every module under
 * `src/browser/`, while the browser profile supplies the real DOM. This file
 * declares only the members the controller actually reads, so the module
 * compiles under both profiles without widening the shared
 * `src/browser/dom.d.ts` shim.
 *
 * The globals are read inside function bodies (never at module load), so
 * importing the module stays inert outside a browser.
 *
 * @module
 */

/** One viewport-relative rectangle, as `getBoundingClientRect` reports it. */
export interface QuickLookRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

/** One inline style slice the controller writes. */
export interface QuickLookStyle {
  left: string
  top: string
  width: string
  height: string
  maxHeight: string
  transform: string
}

/** The `classList` slice used while building a layer. */
export interface QuickLookClassList {
  add(...tokens: string[]): void
}

/** One entry of a `dataset` assignment. */
export type QuickLookDataset = Record<string, string>

/** One text node; only appending matters for the rendered Markdown. */
export interface QuickLookTextNode {
  readonly textContent: string | null
}

/** One DOM node accepted by `appendChild`/`replaceChildren`. */
export type QuickLookNode = QuickLookElement | QuickLookTextNode

/** One Web Animation handle (the crossfade/slide animations). */
export interface QuickLookAnimation {
  onfinish: (() => void) | null
}

/** One keyframe passed to `Element.animate`. */
export type QuickLookKeyframe = Record<string, string | number>

/** One animation timing bag. */
export interface QuickLookAnimationOptions {
  readonly duration?: number
  readonly delay?: number
  readonly easing?: string
  readonly fill?: 'none' | 'forwards' | 'backwards' | 'both' | 'auto'
}

/** The base event surface every handler may use. */
export interface QuickLookEvent {
  readonly target: unknown
  readonly relatedTarget?: unknown
  preventDefault(): void
  stopPropagation(): void
}

/** A pointer event: hover, move, press and double-click. */
export interface QuickLookPointerEvent extends QuickLookEvent {
  readonly clientX: number
  readonly clientY: number
}

/** A keyboard event (Escape closes the card). */
export interface QuickLookKeyEvent {
  readonly key: string
}

/** One element-like surface; the real `HTMLElement`/`SVGElement` supplies it. */
export interface QuickLookElement {
  className: string
  readonly classList: QuickLookClassList
  readonly style: QuickLookStyle
  readonly dataset: QuickLookDataset
  textContent: string | null
  title: string
  href: string
  download: string
  src: string
  alt: string
  type: string
  controls: boolean
  preload: string
  loading: string
  rel: string
  target: string
  readonly isConnected: boolean
  readonly children: ArrayLike<QuickLookElement>
  appendChild(child: QuickLookNode): QuickLookNode
  append(...children: QuickLookNode[]): void
  replaceChildren(...children: QuickLookNode[]): void
  remove(): void
  querySelector(selector: string): QuickLookElement | null
  querySelectorAll(selector: string): QuickLookElement[]
  closest(selector: string): QuickLookElement | null
  contains(node: unknown): boolean
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  addEventListener<T>(type: string, listener: (event: T) => void, capture?: boolean): void
  removeEventListener<T>(type: string, listener: (event: T) => void, capture?: boolean): void
  getBoundingClientRect(): QuickLookRect
  animate(keyframes: QuickLookKeyframe[], options: QuickLookAnimationOptions): QuickLookAnimation
  click(): void
}

/** The document slice the surface reads and writes. */
export interface QuickLookDocument {
  readonly baseURI: string
  readonly body: QuickLookElement
  readonly head: QuickLookElement
  readonly documentElement: QuickLookElement
  createElement(tag: string): QuickLookElement
  createElementNS(namespace: string, tag: string): QuickLookElement
  createTextNode(text: string): QuickLookTextNode
  elementFromPoint(x: number, y: number): QuickLookElement | null
  addEventListener<T>(type: string, listener: (event: T) => void, capture?: boolean): void
  removeEventListener<T>(type: string, listener: (event: T) => void, capture?: boolean): void
}

/** The window slice the surface reads and writes. */
export interface QuickLookWindow {
  readonly innerWidth: number
  readonly innerHeight: number
  setTimeout(handler: () => void, delay?: number): number
  clearTimeout(handle: number): void
  matchMedia(query: string): { readonly matches: boolean }
  addEventListener<T>(type: string, listener: (event: T) => void, capture?: boolean): void
  removeEventListener<T>(type: string, listener: (event: T) => void, capture?: boolean): void
}

/** Browser globals, all optional so a non-browser import stays inert. */
interface QuickLookGlobals {
  readonly document?: QuickLookDocument
  readonly window?: QuickLookWindow
  readonly Element?: new (...args: never[]) => QuickLookElement
  readonly Node?: new (...args: never[]) => object
}

/** Read the browser globals without touching them at module load. */
function quickLookGlobals(): QuickLookGlobals {
  return globalThis as unknown as QuickLookGlobals
}

/**
 * The live document. Only called from installed handlers, never at import.
 * @returns the document facade.
 */
export function quickLookDocument(): QuickLookDocument {
  const document = quickLookGlobals().document
  if (document === undefined) throw new Error('hover quick look: document unavailable')
  return document
}

/**
 * The live window, when there is one (the reduced-motion probe tolerates
 * environments without it).
 * @returns the window facade or null.
 */
export function quickLookWindowOrNull(): QuickLookWindow | null {
  return quickLookGlobals().window ?? null
}

/**
 * The live window. Only called from installed handlers, never at import.
 * @returns the window facade.
 */
export function quickLookWindow(): QuickLookWindow {
  const window = quickLookWindowOrNull()
  if (window === null) throw new Error('hover quick look: window unavailable')
  return window
}

/**
 * Whether a value is an element (the `instanceof Element` guard).
 * @param value - untrusted value.
 * @returns true for an element.
 */
export function isQuickLookElement(value: unknown): value is QuickLookElement {
  const Element = quickLookGlobals().Element
  return typeof Element === 'function' && value instanceof Element
}

/**
 * Whether a value is a DOM node (the `instanceof Node` guard).
 * @param value - untrusted value.
 * @returns true for a node.
 */
export function isQuickLookNode(value: unknown): boolean {
  const Node = quickLookGlobals().Node
  return typeof Node === 'function' && value instanceof Node
}
