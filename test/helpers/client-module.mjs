/**
 * Materializes the browser half of the plugin (`src/client.js`) inside a
 * `node:vm` sandbox so its pure helpers can be unit-tested without a browser,
 * a React renderer, or a DOM.
 *
 * ## Why vm
 *
 * `src/client.js` is a classic browser script, not a module: it immediately
 * calls `window.__ModuleLoader__.load({ id, factory })` and the DSH shell later
 * invokes `factory(require)`. There is no build step and no `export` to import,
 * so the only portable way to reach the feature code from `node:test` is to
 * evaluate the file against browser stubs and grab the registration object.
 *
 * ## The test seam (CONTRACT.md §3.7)
 *
 * The factory ends with a guarded block: when `globalThis.__POWER_SUITE_TEST_
 * HOOKS__` is an object it sets `__POWER_SUITE_TEST_HOOKS__.uiAnnotation` to an
 * object of side-effect-free helpers (`normalizeSettings`, `sanitizeText`,
 * `buildElementRef`, `reduceAnnotationState`, the serializers, the collection
 * functions, the clamp/layout math, …). Production never defines the flag, so
 * the block is inert in the browser.
 *
 * This helper therefore:
 *
 *   1. reads `src/client.js` from the worktree (read-only),
 *   2. creates a vm context whose global carries the browser stubs and
 *      `__POWER_SUITE_TEST_HOOKS__ = {}` *before* evaluation (pass
 *      `{ hooksFlag: false }` to materialize the production path instead — the
 *      seam must then stay inert, which one test asserts),
 *   3. evaluates the file and captures the registration from
 *      `window.__ModuleLoader__.load`,
 *   4. calls `registration.factory(stubRequire)` — the stub `require` returns a
 *      minimal React (only what the factory top-level touches), a
 *      `react-dom.createPortal` stand-in, and `{}` for every other module-,
 *   5. returns `{ hooks, factory, registration }`; `hooks.uiAnnotation` is the
 *      seam object (undefined until the feature region lands).
 *
 * Only factory *top-level* executes. React components, event listeners and DOM
 * access live in functions that are never called here, which is why the stubs
 * can stay tiny — they exist to keep evaluation from throwing, not to emulate a
 * browser. If the factory top-level starts touching a new browser global, add
 * the smallest stub below instead of weakening the harness.
 *
 * Keep this file dependency-free and side-effect-free: it is loaded by the
 * unit-test file only, never by `src/**`, and never by the browser bundle.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

/**
 * Absolute path of the worktree's browser entry: the normal unit-test subject,
 * read fresh on every materialization.
 */
export const CLIENT_SOURCE_PATH = fileURLToPath(new URL('../../src/client.js', import.meta.url))

/**
 * Resolve which browser entry to evaluate. `options.sourcePath` wins, then the
 * `PSA_TEST_CLIENT_SOURCE` debug override (it points the harness at a candidate
 * copy of `src/client.js` — e.g. a local probe — without editing the worktree);
 * otherwise the worktree file itself is always used.
 * @param {object} options - `loadClientModule` options.
 * @returns {string} absolute source path.
 */
function resolveSourcePath(options) {
  const override = typeof options.sourcePath === 'string' ? options.sourcePath : process.env.PSA_TEST_CLIENT_SOURCE
  return typeof override === 'string' && override.length > 0 ? override : CLIENT_SOURCE_PATH
}

/**
 * A no-op Element stand-in: enough surface for factory top-level constants that
 * might create or inspect a node; the tests never exercise DOM behavior.
 * @returns {object} a fake element.
 */
function createElementStub() {
  const attributes = new Map()
  return {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
    children: [],
    childNodes: [],
    appendChild(child) { this.children.push(child); return child },
    removeChild() {},
    remove() {},
    insertBefore(child) { this.children.push(child); return child },
    setAttribute(name, value) { attributes.set(name, String(value)) },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null },
    removeAttribute(name) { attributes.delete(name) },
    hasAttribute(name) { return attributes.has(name) },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    blur() {},
    click() {},
    closest() { return null },
    querySelector() { return null },
    querySelectorAll() { return [] },
    getBoundingClientRect() { return { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 } },
    scrollIntoView() {}
  }
}

/**
 * Browser globals the evaluated script may read while defining the factory.
 * @param {object} registrationBox - `{ current }` receives the loader callback.
 * @param {object} shared - shared document/localStorage/navigator stand-ins.
 * @returns {object} the vm context global object.
 */
function createBrowserStubs(registrationBox, shared) {
  const { document, localStorage, navigator } = shared
  const windowStub = {
    __ModuleLoader__: {
      load(registration) { registrationBox.current = registration }
    },
    document,
    navigator,
    localStorage,
    location: { href: 'http://power-suite.test/', origin: 'http://power-suite.test' },
    innerWidth: 1728,
    innerHeight: 900,
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle() { return { getPropertyValue() { return '' } } },
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} } },
    requestAnimationFrame() { return 0 },
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    getSelection() { return null }
  }
  return windowStub
}

/**
 * Evaluate `src/client.js` and materialize its registration factory.
 * @param {object} [options] - options.
 * @param {string} [options.sourcePath] - alternative browser entry to evaluate.
 * @param {string} [options.source] - source text to evaluate instead of reading a file.
 * @param {boolean} [options.hooksFlag=true] - set the §3.7 flag inside the
 *   sandbox; `false` materializes the production path, where the seam must not
 *   run.
 * @param {object} [options.globals] - extra platform globals to install on the
 *   vm sandbox before evaluation (e.g. a sentinel `CSS.escape` to prove the
 *   platform path is exercised instead of the fallback).
 * @returns {{ hooks: object|undefined, factory: Function|null, registration: object|null, source: string, sourcePath: string|null }} the
 *   seam hook bag (`hooks.uiAnnotation` may be undefined before the feature
 *   region lands; `hooks` itself is undefined when `hooksFlag` is false), the
 *   materialized factory (null when evaluation did not register one), the
 *   captured module registration, and the evaluated source text plus its path
 *   (null when `options.source` was injected) for source-level regression
 *   assertions such as the popover edit wiring or region-marker balance.
 */
export function loadClientModule(options = {}) {
  const injectedSource = typeof options.source === 'string'
  const sourcePath = injectedSource ? null : resolveSourcePath(options)
  const source = injectedSource ? options.source : readFileSync(sourcePath, 'utf8')

  const registrationBox = { current: null }
  const document = {
    documentElement: createElementStub(),
    body: createElementStub(),
    head: createElementStub(),
    createElement: () => createElementStub(),
    createElementNS: () => createElementStub(),
    createTextNode: (text) => ({ nodeType: 3, textContent: text }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    getElementsByClassName: () => [],
    addEventListener() {},
    removeEventListener() {},
    getSelection() { return null },
    visibilityState: 'visible',
    readyState: 'complete'
  }
  const localStorageStore = new Map()
  const localStorage = {
    getItem(key) { return localStorageStore.has(key) ? localStorageStore.get(key) : null },
    setItem(key, value) { localStorageStore.set(key, String(value)) },
    removeItem(key) { localStorageStore.delete(key) },
    clear() { localStorageStore.clear() },
    key(index) { return [...localStorageStore.keys()][index] ?? null },
    get length() { return localStorageStore.size }
  }
  const navigator = { userAgent: 'power-suite-test', clipboard: null, language: 'en-US', languages: ['en-US'] }

  const sandbox = createBrowserStubs(registrationBox, { document, localStorage, navigator })
  sandbox.document = document
  sandbox.localStorage = localStorage
  sandbox.navigator = navigator
  sandbox.console = console
  sandbox.setTimeout = setTimeout
  sandbox.clearTimeout = clearTimeout
  sandbox.setInterval = setInterval
  sandbox.clearInterval = clearInterval
  sandbox.requestAnimationFrame = windowStubRequestAnimationFrame
  sandbox.cancelAnimationFrame = () => {}
  sandbox.queueMicrotask = queueMicrotask
  sandbox.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return [] } }
  sandbox.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
  sandbox.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }
  sandbox.HTMLElement = class HTMLElement {}
  sandbox.Element = class Element {}
  sandbox.Node = class Node {}
  sandbox.Event = class Event {
    constructor(type, init = {}) { this.type = type; Object.assign(this, init) }
    preventDefault() { this.defaultPrevented = true }
    stopPropagation() {}
    stopImmediatePropagation() {}
  }
  sandbox.CustomEvent = class CustomEvent extends sandbox.Event {}
  sandbox.KeyboardEvent = class KeyboardEvent extends sandbox.Event {}
  sandbox.MouseEvent = class MouseEvent extends sandbox.Event {}
  sandbox.PointerEvent = class PointerEvent extends sandbox.Event {}
  sandbox.getComputedStyle = () => ({ getPropertyValue() { return '' } })
  // §3.7 seam: only the harness defines this global. Production never does, so
  // the factory's seam block stays inert there.
  if (options.hooksFlag !== false) sandbox.__POWER_SUITE_TEST_HOOKS__ = {}
  if (options.globals !== null && typeof options.globals === 'object') {
    Object.assign(sandbox, options.globals)
  }

  // `window` must also be reachable from bare-global reads inside the script.
  sandbox.window = windowStubFromSandbox(sandbox, registrationBox, { document, localStorage, navigator })
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'src/client.js' })

  const registration = registrationBox.current
  const hooks = sandbox.__POWER_SUITE_TEST_HOOKS__
  let factory = null
  if (registration && typeof registration.factory === 'function') {
    factory = registration.factory(createStubRequire())
  }
  return { hooks, factory, registration, source, sourcePath }
}

/** requestAnimationFrame that never calls back (top-level only needs the API). */
function windowStubRequestAnimationFrame() {
  return 0
}

/**
 * `window` as seen from inside the script: the loader capture plus the shared
 * globals. Kept separate from the vm global because some code reads
 * `window.document` while other code reads bare `document`.
 * @param {object} sandbox - vm global object.
 * @param {object} registrationBox - loader capture box.
 * @param {object} shared - shared document/localStorage/navigator stand-ins.
 * @returns {object} window stand-in.
 */
function windowStubFromSandbox(sandbox, registrationBox, shared) {
  return {
    ...createBrowserStubs(registrationBox, shared),
    document: shared.document,
    localStorage: shared.localStorage,
    navigator: shared.navigator
  }
}

/**
 * Minimal React stand-in: the factory top-level calls `require('react')` and
 * builds elements/components, but never renders them in unit tests.
 * @returns {object} React-like object.
 */
export function createStubReact() {
  const identity = (value) => value
  const useStub = (initial) => [initial, () => {}]
  return {
    createElement: (type, props, ...children) => ({ $$typeof: 'react.element', type, props, children }),
    cloneElement: (element, props, ...children) => ({ ...element, props, children }),
    createRef: () => ({ current: null }),
    createContext: (defaultValue) => ({ Provider: identity, Consumer: identity, _currentValue: defaultValue }),
    useContext: () => ({}),
    Fragment: Symbol.for('react.fragment'),
    StrictMode: identity,
    memo: identity,
    forwardRef: identity,
    useState: useStub,
    useReducer: useStub,
    useRef: (initial) => ({ current: initial ?? null }),
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    useEffect: () => {},
    useLayoutEffect: () => {},
    useInsertionEffect: () => {},
    useImperativeHandle: () => {},
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useId: () => ':r0:',
    useTransition: () => [false, identity],
    useDeferredValue: identity,
    startTransition: (callback) => callback?.(),
    Children: { toArray: (children) => (Array.isArray(children) ? children : [children]), map: identity, only: identity, count: (children) => (Array.isArray(children) ? children.length : 1) }
  }
}

/**
 * The `require` the factory receives. Only modules the factory top-level reads
 * need real shapes; everything else is `{}` as specified by the testing
 * contract.
 * @returns {Function} stub require.
 */
export function createStubRequire() {
  const React = createStubReact()
  const ReactDOM = {
    createPortal: (children) => children,
    flushSync: (callback) => callback?.(),
    Version: 'test'
  }
  const known = { react: React, 'react-dom': ReactDOM }
  return function stubRequire(specifier) {
    return known[specifier] ?? {}
  }
}

/**
 * Read the UI-annotation seam with a clear failure when it is missing.
 * @param {object} [hooks] - hook bag from {@link loadClientModule}.
 * @returns {object} the `uiAnnotation` seam object.
 * @throws {Error} when `src/client.js` has no seam (pre-feature state).
 */
export function requireUiAnnotation(hooks) {
  const bag = hooks ?? loadClientModule().hooks
  if (!bag || typeof bag !== 'object' || bag.uiAnnotation === undefined || bag.uiAnnotation === null) {
    const found = bag && typeof bag === 'object' ? Object.keys(bag) : []
    throw new Error(
      'src/client.js does not expose the UI-annotation test seam yet: '
      + 'expected the factory to set globalThis.__POWER_SUITE_TEST_HOOKS__.uiAnnotation '
      + `(CONTRACT.md §3.7). Hook keys found: ${found.length > 0 ? found.join(', ') : '(none)'}.`
    )
  }
  return bag.uiAnnotation
}
