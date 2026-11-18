/**
 * Minimal DOM surface for browser-side models and controllers.
 *
 * `tsconfig.json` uses the ES2023 lib (the Host half never touches a DOM); the
 * browser half still needs the few element and global APIs it inspects at
 * runtime. These declarations cover exactly that surface instead of enabling
 * the full `dom` lib, which would also type `Response`/`fetch` for the Host
 * modules.
 */

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
  readonly children: ArrayLike<Element>
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
declare var document: {
  readonly visibilityState: string
  querySelector(selector: string): Element | null
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

declare var window: {
  readonly innerWidth: number
  requestAnimationFrame(callback: () => void): number
  cancelAnimationFrame(handle: number): void
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

declare function matchMedia(query: string): { readonly matches: boolean }
