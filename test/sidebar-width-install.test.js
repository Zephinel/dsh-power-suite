/**
 * Unit tests for the stateful sidebar-width controller
 * (`src/browser/sidebar-width/install.ts`).
 *
 * The pure decisions are covered by `sidebar-width-model.test.js`; these tests
 * exercise the install boundary with a fake root context, layout store, DOM,
 * `localStorage` and `fetch`: boot re-apply, drag debounce + Host write, remote
 * adoption, collapse/reopen restore, and detach. No dependency is added and no
 * real browser is needed.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSidebarWidthController } from '../src/browser/sidebar-width/install.ts'
import { SIDEBAR_WIDTH_STORAGE_KEY } from '../src/browser/sidebar-width/model.ts'

/** The same-origin URL builder the entry passes as `deps.appUrl`. */
const appUrl = (relative) => new URL(relative, 'http://power-suite.test/').href

/**
 * Replace one global for the duration of a test.
 * @param {string} name - global name.
 * @param {unknown} value - replacement value.
 * @returns {() => void} restore function.
 */
function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  return () => {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, name)
    else Object.defineProperty(globalThis, name, descriptor)
  }
}

/**
 * Poll one predicate on real timers.
 * @param {() => boolean} predicate - condition to satisfy.
 * @param {number} [timeout=2000] - max wait in ms.
 * @returns {Promise<void>} resolves once the predicate is true.
 */
async function waitFor(predicate, timeout = 2000) {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition was not met before the timeout')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * Install the fake browser globals one controller reads.
 * @param {object} [options] - environment options.
 * @param {object | null} [options.cache] - seeded browser-cache document.
 * @param {number | null} [options.hostWidth] - width the fake Host document carries.
 * @returns {{ restore: () => void, store: ReturnType<typeof createFakeStore>, fetchCalls: Array<{ method: string, body: string | null }>, setDragging: (dragging: boolean) => void }} fake environment.
 */
function installFakeEnvironment(options = {}) {
  const storage = new Map()
  if (options.cache !== null && options.cache !== undefined) {
    storage.set(SIDEBAR_WIDTH_STORAGE_KEY, JSON.stringify(options.cache))
  }
  let hostWidth = options.hostWidth ?? null
  let dragging = false
  const windowListeners = new Map()
  const documentListeners = new Map()
  const fetchCalls = []
  let rafHandle = 0

  const documentStub = {
    visibilityState: 'visible',
    querySelector(selector) {
      return selector === '[data-dragging]' && dragging ? {} : null
    },
    addEventListener(type, listener) { documentListeners.set(type, listener) },
    removeEventListener(type, listener) { documentListeners.delete(type) }
  }
  const windowStub = {
    innerWidth: 1728,
    requestAnimationFrame() { rafHandle += 1; return rafHandle },
    cancelAnimationFrame() {},
    addEventListener(type, listener) { windowListeners.set(type, listener) },
    removeEventListener(type, listener) { windowListeners.delete(type) }
  }
  const localStorageStub = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null },
    setItem(key, value) { storage.set(key, String(value)) }
  }
  const fetchStub = async (_url, init = {}) => {
    const method = init.method ?? 'GET'
    fetchCalls.push({ method, body: typeof init.body === 'string' ? init.body : null })
    if (method === 'POST') {
      hostWidth = JSON.parse(init.body).sidebarWidth
    }
    return { ok: true, json: async () => ({ version: 1, sidebarWidth: hostWidth }) }
  }

  const restoreGlobals = [
    replaceGlobal('document', documentStub),
    replaceGlobal('window', windowStub),
    replaceGlobal('localStorage', localStorageStub),
    replaceGlobal('fetch', fetchStub),
    replaceGlobal('matchMedia', () => ({ matches: false }))
  ]
  const store = createFakeStore(options.storeWidth ?? 280)
  return {
    store,
    fetchCalls,
    setDragging: (value) => { dragging = value === true },
    restore() {
      for (const restore of restoreGlobals.reverse()) restore()
    }
  }
}

/**
 * A layout store instance shaped like the shell seat: one snapshot, the
 * `setSidebar` action, and a subscriber that fires on every write.
 * @param {number} initialWidth - initial `layoutInfo.sidebar`.
 * @returns {{ read: () => number, set: (width: number) => void, instance: object }} fake store.
 */
function createFakeStore(initialWidth) {
  let width = initialWidth
  const listeners = new Set()
  const notify = () => { for (const listener of listeners) listener() }
  return {
    read: () => width,
    set(next) {
      width = next
      notify()
    },
    instance: {
      getSnapshot: () => ({ layoutInfo: { sidebar: width } }),
      actions: {
        setSidebar(next) {
          width = next
          notify()
        }
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      }
    }
  }
}

/**
 * A root context whose `effect` runs the install body once and captures its
 * disposer, and whose `root` slot seat returns the fake store.
 * @param {object} storeInstance - fake layout store instance.
 * @returns {{ ctx: object, dispose: () => void }} fake context.
 */
function createFakeContext(storeInstance) {
  let disposer = null
  return {
    ctx: {
      effect(setup) {
        disposer = setup()
        return () => {}
      },
      slots: {
        entries: (name) => (name === 'root'
          ? [{ store: { create: () => storeInstance } }]
          : []),
        subscribe: () => () => {}
      }
    },
    dispose: () => {
      if (disposer !== null) {
        const teardown = disposer
        disposer = null
        teardown()
      }
    }
  }
}

test('install attaches, re-applies the cached width before paint, and detaches', async () => {
  const controller = createSidebarWidthController({ appUrl })
  assert.deepEqual(structuredClone(controller.probe()), {
    attached: false,
    storeWidth: null,
    desiredWidth: null,
    syncState: 'idle',
    cache: { sidebarWidth: null, pending: false }
  })

  const env = installFakeEnvironment({
    cache: { version: 1, sidebarWidth: 320, pending: false },
    hostWidth: 320,
    storeWidth: 280
  })
  const { ctx, dispose } = createFakeContext(env.store.instance)
  try {
    controller.install(ctx)
    assert.equal(env.store.read(), 320, 'the cached width must replace the shell default')
    assert.equal(controller.probe().attached, true)
    assert.equal(controller.probe().storeWidth, 320)
    assert.equal(controller.probe().desiredWidth, 320)
    assert.deepEqual(controller.probe().cache, { sidebarWidth: 320, pending: false })
    await waitFor(() => controller.probe().syncState === 'idle')

    dispose()
    assert.equal(controller.probe().attached, false)
    env.store.set(300)
    assert.equal(controller.probe().desiredWidth, 320, 'the store subscription must be released')
    assert.equal(controller.probe().syncState, 'idle')
  } finally {
    dispose()
    env.restore()
  }
})

test('a drag is debounced, persisted through the Host, and mirrored by the probe', async () => {
  const env = installFakeEnvironment({
    cache: { version: 1, sidebarWidth: 320, pending: false },
    hostWidth: 320,
    storeWidth: 320
  })
  const { ctx, dispose } = createFakeContext(env.store.instance)
  const controller = createSidebarWidthController({ appUrl })
  try {
    controller.install(ctx)
    await waitFor(() => controller.probe().syncState === 'idle')
    const writesBefore = env.fetchCalls.filter((call) => call.method === 'POST').length

    env.store.set(305)
    assert.equal(controller.probe().desiredWidth, 305, 'the local intent is visible immediately')
    assert.equal(env.fetchCalls.filter((call) => call.method === 'POST').length, writesBefore, 'the write waits for the debounce')

    await waitFor(() => controller.probe().cache.sidebarWidth === 305 && controller.probe().syncState === 'idle')
    const writes = env.fetchCalls.filter((call) => call.method === 'POST')
    assert.equal(writes.length, writesBefore + 1)
    assert.deepEqual(JSON.parse(writes.at(-1).body), { sidebarWidth: 305 })
    assert.equal(env.store.read(), 305)
    assert.deepEqual(controller.probe().cache, { sidebarWidth: 305, pending: false })
  } finally {
    dispose()
    env.restore()
  }
})

test('a fresh cache adopts the Host width once the layout store is seated', async () => {
  const env = installFakeEnvironment({ cache: null, hostWidth: 340, storeWidth: 280 })
  const { ctx, dispose } = createFakeContext(env.store.instance)
  const controller = createSidebarWidthController({ appUrl })
  try {
    controller.install(ctx)
    await waitFor(() => env.store.read() === 340)
    assert.equal(controller.probe().desiredWidth, 340)
    assert.deepEqual(controller.probe().cache, { sidebarWidth: 340, pending: false })
    assert.equal(env.fetchCalls.filter((call) => call.method === 'POST').length, 0, 'adoption must not re-write the Host')
  } finally {
    dispose()
    env.restore()
  }
})

test('collapse is ignored and reopening restores the stored width instead of the default', async () => {
  const env = installFakeEnvironment({
    cache: { version: 1, sidebarWidth: 320, pending: false },
    hostWidth: 320,
    storeWidth: 280
  })
  const { ctx, dispose } = createFakeContext(env.store.instance)
  const controller = createSidebarWidthController({ appUrl })
  try {
    controller.install(ctx)
    await waitFor(() => controller.probe().syncState === 'idle')
    assert.equal(env.store.read(), 320)

    env.store.set(0)
    assert.equal(env.store.read(), 0, 'collapsing must not be overwritten')
    assert.equal(controller.probe().desiredWidth, 320, 'a collapse is not a preference')

    env.store.set(280)
    assert.equal(env.store.read(), 320, 'the native 280 default must be replaced by the stored width')
    assert.equal(controller.probe().desiredWidth, 320)
    assert.equal(env.fetchCalls.filter((call) => call.method === 'POST').length, 0)
  } finally {
    dispose()
    env.restore()
  }
})
