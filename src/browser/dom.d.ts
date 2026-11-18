/**
 * Minimal DOM surface for browser-side models and controllers.
 *
 * `tsconfig.json` uses the ES2023 lib (the Host half never touches a DOM); the
 * browser half still needs the few element and global APIs it inspects at
 * runtime. These declarations cover exactly that surface instead of enabling
 * the full `dom` lib, which would also type `Response`/`fetch` for the Host
 * modules.
 */

declare class Node {}

/** Fetch cache mode the update check sets on its one Host request. */
interface RequestInit {
  cache?: string
}

declare class ElementList implements Iterable<Element> {
  readonly length: number
  [index: number]: Element
  [Symbol.iterator](): Iterator<Element>
}

declare class Element {
  querySelector(selector: string): Element | null
  querySelectorAll(selector: string): ElementList
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  readonly children: ElementList
  readonly firstElementChild: Element | null
}

/** Surfaces the sidebar-width controller measures on the mounted column. */
interface Element {
  readonly parentElement: Element | null
  getBoundingClientRect(): { readonly width: number }
}

declare class HTMLElement extends Element {}

declare class HTMLImageElement extends HTMLElement {}

/**
 * Browser globals the sidebar-width controller reads. `tsconfig.browser.json`
 * excludes this file and uses the full DOM lib instead; these declarations
 * cover the same call sites under the Host profile (`lib: ES2023`), which is
 * also where `localStorage` already comes from `@types/node`.
 */

/**
 * Extended, still minimal DOM surface for the browser controllers that mount
 * their own DOM (dynamic Workspaces, and the canvas atmosphere renderer).
 *
 * `tsconfig.browser.json` excludes this file and uses the full DOM lib; the
 * Host profile (`lib: ES2023`) uses these declarations only so the browser
 * modules stay in the root typecheck. Members are structural and cover exactly
 * what those modules call.
 */

interface ElementStyle {
  display: string
  order: string
  flexDirection: string
  setProperty(name: string, value: string): void
}

interface ElementClassList extends Iterable<string> {
  add(...tokens: string[]): void
  remove(...tokens: string[]): void
  contains(token: string): boolean
}

interface DOMRectLike {
  readonly width: number
  readonly height: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

interface Element {
  className: string
  readonly classList: ElementClassList
  readonly style: ElementStyle
  readonly children: ElementList
  readonly childElementCount: number
  readonly firstElementChild: Element | null
  readonly firstChild: Element | null
  readonly nextSibling: Element | null
  readonly isConnected: boolean
  readonly scrollWidth: number
  readonly clientWidth: number
  textContent: string | null
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  appendChild(node: Element): Element
  insertBefore(node: Element, child: Element | null): Element
  remove(): void
  closest(selector: string): Element | null
  matches(selector: string): boolean
  addEventListener(type: string, listener: (event: never) => void, options?: boolean | Record<string, unknown>): void
  removeEventListener(type: string, listener: (event: never) => void, options?: boolean | Record<string, unknown>): void
  contains(node: object | null): boolean
  getBoundingClientRect(): DOMRectLike
}

interface HTMLElement {
  readonly dataset: Record<string, string | undefined>
  readonly offsetHeight: number
  readonly scrollHeight: number
  readonly clientHeight: number
  scrollTop: number
  title: string
  type: string
  focus(): void
  focus(options?: { preventScroll?: boolean }): void
}

declare class HTMLCanvasElement extends HTMLElement {
  width: number
  height: number
  getContext(contextId: '2d', options?: { alpha?: boolean }): CanvasRenderingContext2D | null
}

interface CanvasGradient {
  addColorStop(offset: number, color: string): void
}

interface CanvasRenderingContext2D {
  globalCompositeOperation: string
  fillStyle: string | CanvasGradient
  font: string
  clearRect(x: number, y: number, width: number, height: number): void
  fillRect(x: number, y: number, width: number, height: number): void
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient
  beginPath(): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void
  fill(): void
  measureText(text: string): { readonly width: number }
}

interface ResizeObserver {
  observe(target: Element): void
  disconnect(): void
}

declare var ResizeObserver: {
  new (callback: () => void): ResizeObserver
}

interface MutationRecordLike {
  readonly target: object
  readonly addedNodes: ArrayLike<object>
}

interface MutationObserver {
  observe(target: object, options?: Record<string, unknown>): void
  disconnect(): void
}

declare var MutationObserver: {
  new (callback: (records: MutationRecordLike[]) => void): MutationObserver
}

/** Button state the interrupted composer seat reads and resets. */
declare class HTMLButtonElement extends HTMLElement {
  disabled: boolean
}

/** SSE message surface the interrupted refresh stream reads. */
interface EventSourceMessage {
  readonly data: unknown
}

/** Minimal EventSource surface the interrupted refresh stream uses. */
interface EventSource {
  addEventListener(type: string, listener: (message: EventSourceMessage) => void): void
  removeEventListener(type: string, listener: (message: EventSourceMessage) => void): void
  close(): void
}

declare var EventSource: {
  new (url: string, init?: { withCredentials?: boolean }): EventSource
}

/** Keyboard events consumed by the root profile's document listeners. */
declare class KeyboardEvent {
  readonly key: string
  preventDefault(): void
  stopPropagation(): void
}

declare var document: {
  readonly visibilityState: string
  readonly hidden: boolean
  readonly body: HTMLElement
  readonly head: HTMLElement
  readonly documentElement: HTMLElement
  querySelector(selector: string): Element | null
  querySelectorAll(selector: string): ElementList
  getElementById(id: string): HTMLElement | null
  createElement(tag: 'canvas'): HTMLCanvasElement
  createElement(tag: string): HTMLElement
  createElementNS(namespace: string, tag: string): Element
  addEventListener(type: string, listener: (event: never) => void, options?: boolean | Record<string, unknown>): void
  removeEventListener(type: string, listener: (event: never) => void, options?: boolean | Record<string, unknown>): void
}

declare var window: {
  readonly innerWidth: number
  readonly innerHeight: number
  readonly devicePixelRatio: number
  readonly localStorage: {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
  }
  requestAnimationFrame(callback: (time: number) => void): number
  cancelAnimationFrame(handle: number): void
  setTimeout(callback: () => void, delay?: number): number
  clearTimeout(handle: number): void
  setInterval(callback: () => void, delay?: number): number
  clearInterval(handle: number): void
  matchMedia(query: string): { readonly matches: boolean, addEventListener(type: string, listener: () => void): void, removeEventListener(type: string, listener: () => void): void }
  getComputedStyle(element: Element): { readonly font: string, readonly position: string, readonly width: string }
  addEventListener(type: string, listener: (event: never) => void, options?: boolean | Record<string, unknown>): void
  removeEventListener(type: string, listener: (event: never) => void, options?: boolean | Record<string, unknown>): void
}

declare function matchMedia(query: string): { readonly matches: boolean }
