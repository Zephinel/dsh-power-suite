/**
 * Minimal DOM surface for browser-side pure models.
 *
 * `tsconfig.json` uses the ES2023 lib (the Host half never touches a DOM); the
 * browser models still need the few element APIs they inspect at runtime. These
 * declarations cover exactly that surface instead of enabling the full `dom`
 * lib, which would also type `Response`/`fetch` for the Host modules.
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

declare class HTMLElement extends Element {}

declare class HTMLImageElement extends HTMLElement {}
