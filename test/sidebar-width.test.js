/**
 * Host + store tests for the suite's persisted left sidebar width
 * (`src/features/sidebar-width/`).
 *
 * The feature is the Host-owned scalar document:
 *
 *   { "version": 1, "sidebarWidth": <integer 264..420> | null }
 *
 * under `$DSH_HOME/dsh-power-suite/sidebar-width.json`, served by the
 * authenticated route `/api/power-suite.sidebar-width` (GET document, POST
 * `{ "sidebarWidth": 320 }`). This file mirrors `test/session-pins.test.js`:
 * pure document helpers first, then the durable store over a throwaway
 * `$DSH_HOME`, then the route against a fake `ctx.connection.fetch.register`
 * capture. Client behavior (cache, drag capture, cross-device sync) is covered
 * by `test/sidebar-width-client.test.js` and the live `--layout` E2E harness.
 */
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  SIDEBAR_WIDTH_DIRECTORY,
  SIDEBAR_WIDTH_FILE,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_READ_FAILED,
  SIDEBAR_WIDTH_VERSION,
  createSidebarWidthStore,
  defaultSidebarWidthDocument,
  isSidebarWidth,
  parseSidebarWidthDocument,
  serializeSidebarWidthDocument,
  sidebarWidthPath
} from '../src/features/sidebar-width/store.ts'
import { SIDEBAR_WIDTH_ROUTE, installSidebarWidth } from '../src/features/sidebar-width/host.ts'

/** The canonical unset document every parse failure degrades to. */
const DEFAULT_DOCUMENT = { version: SIDEBAR_WIDTH_VERSION, sidebarWidth: null }

/** Absolute route URL used by the fake fetch registration. */
const ROUTE_URL = `http://host${SIDEBAR_WIDTH_ROUTE}`

/**
 * Create one throwaway harness home.
 * @returns {Promise<string>} absolute directory.
 */
async function temporaryHome() {
  return mkdtemp(path.join(os.tmpdir(), 'ps-sidebar-width-'))
}

/**
 * Read one persisted document back from the harness home.
 * @param {string} home - harness home.
 * @returns {Promise<object>} parsed document.
 */
async function readDocument(home) {
  return JSON.parse(await readFile(sidebarWidthPath(home), 'utf8'))
}

test('a missing, corrupt, or foreign document reads as unset', () => {
  assert.deepEqual(parseSidebarWidthDocument(''), DEFAULT_DOCUMENT)
  assert.deepEqual(parseSidebarWidthDocument('   '), DEFAULT_DOCUMENT)
  assert.deepEqual(parseSidebarWidthDocument('{not json'), DEFAULT_DOCUMENT)
  assert.deepEqual(parseSidebarWidthDocument('null'), DEFAULT_DOCUMENT)
  assert.deepEqual(parseSidebarWidthDocument('[]'), DEFAULT_DOCUMENT)
  assert.deepEqual(parseSidebarWidthDocument(JSON.stringify({ version: 2, sidebarWidth: 320 })), DEFAULT_DOCUMENT)
  assert.deepEqual(parseSidebarWidthDocument(JSON.stringify({ version: 1 })), DEFAULT_DOCUMENT)
  assert.deepEqual(parseSidebarWidthDocument(JSON.stringify({ version: 1, sidebarWidth: null })), DEFAULT_DOCUMENT)
  assert.deepEqual(
    parseSidebarWidthDocument(JSON.stringify({ version: 1, sidebarWidth: SIDEBAR_WIDTH_MIN - 1 })),
    DEFAULT_DOCUMENT
  )
  assert.deepEqual(
    parseSidebarWidthDocument(JSON.stringify({ version: 1, sidebarWidth: SIDEBAR_WIDTH_MAX + 1 })),
    DEFAULT_DOCUMENT
  )
  assert.deepEqual(parseSidebarWidthDocument(JSON.stringify({ version: 1, sidebarWidth: '320' })), DEFAULT_DOCUMENT)
  assert.deepEqual(parseSidebarWidthDocument(JSON.stringify({ version: 1, sidebarWidth: 320.5 })), DEFAULT_DOCUMENT)
  assert.deepEqual(parseSidebarWidthDocument(undefined), DEFAULT_DOCUMENT)
  // Defaults are fresh objects: callers cannot mutate shared state.
  assert.notEqual(defaultSidebarWidthDocument(), defaultSidebarWidthDocument())
})

test('a valid width parses canonically and the accepted range is exact', () => {
  assert.deepEqual(parseSidebarWidthDocument(JSON.stringify({ version: 1, sidebarWidth: 320 })), {
    version: SIDEBAR_WIDTH_VERSION,
    sidebarWidth: 320
  })
  for (const value of [SIDEBAR_WIDTH_MIN, 300, 320, SIDEBAR_WIDTH_MAX]) {
    assert.deepEqual(parseSidebarWidthDocument(serializeSidebarWidthDocument({ version: 1, sidebarWidth: value })), {
      version: SIDEBAR_WIDTH_VERSION,
      sidebarWidth: value
    })
  }
  assert.equal(isSidebarWidth(SIDEBAR_WIDTH_MIN - 1), false)
  assert.equal(isSidebarWidth(SIDEBAR_WIDTH_MIN), true)
  assert.equal(isSidebarWidth(SIDEBAR_WIDTH_MAX), true)
  assert.equal(isSidebarWidth(SIDEBAR_WIDTH_MAX + 1), false)
  assert.equal(isSidebarWidth(320.5), false)
  assert.equal(isSidebarWidth('320'), false)
  assert.equal(isSidebarWidth(null), false)
  assert.equal(isSidebarWidth(undefined), false)
  assert.equal(isSidebarWidth(NaN), false)
  assert.equal(isSidebarWidth(Infinity), false)
  assert.equal(isSidebarWidth(true), false)
})

test('serialize writes the versioned file shape with one trailing newline', () => {
  const text = serializeSidebarWidthDocument({ version: 1, sidebarWidth: 320 })
  assert.equal(text.endsWith('\n'), true)
  assert.equal(text.endsWith('\n\n'), false)
  assert.deepEqual(JSON.parse(text), { version: SIDEBAR_WIDTH_VERSION, sidebarWidth: 320 })
  // An unusable width serializes as unset instead of writing a value the
  // browser could never apply.
  assert.deepEqual(JSON.parse(serializeSidebarWidthDocument({ version: 1, sidebarWidth: 999 })), DEFAULT_DOCUMENT)
  assert.deepEqual(JSON.parse(serializeSidebarWidthDocument(null)), DEFAULT_DOCUMENT)
  assert.equal(
    sidebarWidthPath('/tmp/example-home'),
    path.join('/tmp/example-home', 'dsh-power-suite', 'sidebar-width.json')
  )
  assert.equal(SIDEBAR_WIDTH_VERSION, 1)
  assert.equal(SIDEBAR_WIDTH_MIN, 264)
  assert.equal(SIDEBAR_WIDTH_MAX, 420)
  assert.equal(SIDEBAR_WIDTH_DIRECTORY, 'dsh-power-suite')
  assert.equal(SIDEBAR_WIDTH_FILE, 'sidebar-width.json')
})

test('the durable store starts unset, writes atomically, and reloads from disk', async () => {
  const home = await temporaryHome()
  try {
    const file = sidebarWidthPath(home)
    const first = createSidebarWidthStore(home)
    assert.deepEqual(await first.get(), DEFAULT_DOCUMENT)
    assert.deepEqual(await first.set(320), { version: 1, sidebarWidth: 320 })
    assert.deepEqual(await readDocument(home), { version: 1, sidebarWidth: 320 })
    // Only the document is left behind: writes land through a temp sibling + rename.
    assert.deepEqual(await readdir(path.dirname(file)), ['sidebar-width.json'])
    // get returns a copy, not the in-memory object.
    const snapshot = await first.get()
    snapshot.sidebarWidth = SIDEBAR_WIDTH_MIN
    assert.deepEqual(await first.get(), { version: 1, sidebarWidth: 320 })
    // A second store instance (a restart) reads the persisted value.
    const second = createSidebarWidthStore(home)
    assert.deepEqual(await second.get(), { version: 1, sidebarWidth: 320 })
    assert.deepEqual(await second.set(SIDEBAR_WIDTH_MAX), { version: 1, sidebarWidth: SIDEBAR_WIDTH_MAX })
    assert.deepEqual(await readDocument(home), { version: 1, sidebarWidth: SIDEBAR_WIDTH_MAX })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('set refuses widths outside the shell clamp and never touches the disk', async () => {
  const home = await temporaryHome()
  try {
    const store = createSidebarWidthStore(home)
    const rejected = [
      SIDEBAR_WIDTH_MIN - 1,
      SIDEBAR_WIDTH_MAX + 1,
      320.5,
      '320',
      null,
      undefined,
      NaN,
      Infinity,
      {}
    ]
    for (const value of rejected) await assert.rejects(store.set(value), TypeError)
    // Validation runs before any load or mkdir: the suite directory never appears.
    await assert.rejects(readdir(path.join(home, SIDEBAR_WIDTH_DIRECTORY)), { code: 'ENOENT' })
    assert.deepEqual(await store.get(), DEFAULT_DOCUMENT)
    assert.deepEqual(await store.set(SIDEBAR_WIDTH_MIN), { version: 1, sidebarWidth: SIDEBAR_WIDTH_MIN })
    assert.deepEqual(await readDocument(home), { version: 1, sidebarWidth: SIDEBAR_WIDTH_MIN })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a corrupt store file reads unset and the next write replaces it', async () => {
  const home = await temporaryHome()
  try {
    const file = sidebarWidthPath(home)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, '{broken', 'utf8')
    const store = createSidebarWidthStore(home)
    assert.deepEqual(await store.get(), DEFAULT_DOCUMENT)
    assert.deepEqual(await store.set(SIDEBAR_WIDTH_MAX), { version: 1, sidebarWidth: SIDEBAR_WIDTH_MAX })
    assert.deepEqual(await readDocument(home), { version: 1, sidebarWidth: SIDEBAR_WIDTH_MAX })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a directory at the document path is a typed read failure and later calls retry', async () => {
  const home = await temporaryHome()
  const file = sidebarWidthPath(home)
  try {
    await mkdir(file, { recursive: true })
    const store = createSidebarWidthStore(home)
    await assert.rejects(store.get(), (error) => error.code === SIDEBAR_WIDTH_READ_FAILED)
    // A write must not paper over a document it failed to read.
    await assert.rejects(store.set(320), (error) => error.code === SIDEBAR_WIDTH_READ_FAILED)
    // Recovery: once the path is readable again the same store retries.
    await rm(file, { recursive: true, force: true })
    assert.deepEqual(await store.get(), DEFAULT_DOCUMENT)
    assert.deepEqual(await store.set(320), { version: 1, sidebarWidth: 320 })
    assert.deepEqual(await readDocument(home), { version: 1, sidebarWidth: 320 })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('an unreadable store file throws typed and retries after recovery', async () => {
  const home = await temporaryHome()
  const file = sidebarWidthPath(home)
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, serializeSidebarWidthDocument({ version: 1, sidebarWidth: 400 }), 'utf8')
    await chmod(file, 0o000)
    const store = createSidebarWidthStore(home)
    await assert.rejects(store.get(), (error) => error.code === SIDEBAR_WIDTH_READ_FAILED)
    await assert.rejects(store.set(320), (error) => error.code === SIDEBAR_WIDTH_READ_FAILED)
    await chmod(file, 0o600)
    // The failed load must not have replaced the persisted document.
    assert.deepEqual(await readDocument(home), { version: 1, sidebarWidth: 400 })
    assert.deepEqual(await store.get(), { version: 1, sidebarWidth: 400 })
    assert.deepEqual(await store.set(320), { version: 1, sidebarWidth: 320 })
  } finally {
    await chmod(file, 0o600).catch(() => {})
    await rm(home, { recursive: true, force: true })
  }
})

test('concurrent sets serialize on one chain and the last value wins', async () => {
  const home = await temporaryHome()
  try {
    const store = createSidebarWidthStore(home)
    await Promise.all([store.set(300), store.set(400)])
    assert.deepEqual(await readDocument(home), { version: 1, sidebarWidth: 400 })
    assert.deepEqual(await store.get(), { version: 1, sidebarWidth: 400 })
    assert.deepEqual(await readdir(path.join(home, SIDEBAR_WIDTH_DIRECTORY)), ['sidebar-width.json'])
    // A rejected set must not poison the write chain for later writes.
    await assert.rejects(store.set(SIDEBAR_WIDTH_MAX + 1), TypeError)
    assert.deepEqual(await store.set(SIDEBAR_WIDTH_MIN), { version: 1, sidebarWidth: SIDEBAR_WIDTH_MIN })
    assert.deepEqual(await readDocument(home), { version: 1, sidebarWidth: SIDEBAR_WIDTH_MIN })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

/**
 * Build a Host context that records the sidebar-width route.
 * @returns {{ ctx: object, routes: Map<string, object> }} the fake context.
 */
function makeContext() {
  const routes = new Map()
  const ctx = {
    effect: (fn) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    connection: {
      fetch: {
        register: (definition) => {
          routes.set(definition.path, definition)
          return () => {}
        }
      }
    }
  }
  return { ctx, routes }
}

/**
 * Install the feature over a throwaway harness home and return its route.
 * @param {object} [options] - `installSidebarWidth` options (store override).
 * @returns {Promise<{ home: string, route: object, dispose: Function }>} fixture.
 */
async function routeFixture(options = {}) {
  const home = await temporaryHome()
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const { ctx, routes } = makeContext()
  installSidebarWidth(ctx, options)
  if (previous === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previous
  const route = routes.get(SIDEBAR_WIDTH_ROUTE)
  return { home, route, dispose: async () => rm(home, { recursive: true, force: true }) }
}

/**
 * Build one JSON POST request.
 * @param {unknown} body - payload.
 * @param {object} [headers] - request headers.
 * @returns {Request} the request.
 */
function postJson(body, headers = { 'content-type': 'application/json' }) {
  return new Request(ROUTE_URL, { method: 'POST', headers, body: JSON.stringify(body) })
}

/**
 * Build one raw-body POST request.
 * @param {string} text - request body.
 * @returns {Request} the request.
 */
function postRaw(text) {
  return new Request(ROUTE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: text
  })
}

test('sidebar-width route serves the unset document with no-store', async () => {
  const fixture = await routeFixture()
  try {
    assert.deepEqual(fixture.route.methods, ['GET', 'POST'])
    assert.equal(fixture.route.requestBody, 'buffered')
    assert.equal(typeof fixture.route.fetch, 'function')
    const response = await fixture.route.fetch(new Request(ROUTE_URL))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), DEFAULT_DOCUMENT)
  } finally {
    await fixture.dispose()
  }
})

test('sidebar-width POST persists the width and GET serves it back', async () => {
  const fixture = await routeFixture()
  try {
    const first = await fixture.route.fetch(postJson({ sidebarWidth: 320 }))
    assert.equal(first.status, 200)
    assert.equal(first.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await first.json(), { version: 1, sidebarWidth: 320 })
    assert.deepEqual(await readDocument(fixture.home), { version: 1, sidebarWidth: 320 })

    const get = await fixture.route.fetch(new Request(ROUTE_URL))
    assert.equal(get.status, 200)
    assert.deepEqual(await get.json(), { version: 1, sidebarWidth: 320 })

    // The media type is compared without its parameters.
    const withCharset = await fixture.route.fetch(
      postJson({ sidebarWidth: SIDEBAR_WIDTH_MIN }, { 'content-type': 'application/json; charset=utf-8' })
    )
    assert.equal(withCharset.status, 200)
    assert.deepEqual(await withCharset.json(), { version: 1, sidebarWidth: SIDEBAR_WIDTH_MIN })
    assert.deepEqual(await readDocument(fixture.home), { version: 1, sidebarWidth: SIDEBAR_WIDTH_MIN })
    assert.deepEqual(await readdir(path.join(fixture.home, SIDEBAR_WIDTH_DIRECTORY)), ['sidebar-width.json'])
  } finally {
    await fixture.dispose()
  }
})

test('sidebar-width route rejects wrong media types and oversized bodies', async () => {
  const fixture = await routeFixture()
  try {
    const wrongType = await fixture.route.fetch(new Request(ROUTE_URL, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"sidebarWidth":320}'
    }))
    assert.equal(wrongType.status, 415)
    assert.equal(wrongType.headers.get('cache-control'), 'no-store')
    assert.equal((await wrongType.json()).code, 'unsupported-media-type')

    const invalidJson = await fixture.route.fetch(postRaw('{broken'))
    assert.equal(invalidJson.status, 400)
    assert.equal(invalidJson.headers.get('cache-control'), 'no-store')
    assert.equal((await invalidJson.json()).code, 'bad-request')

    // Exactly 1024 UTF-8 bytes is accepted; one byte more is 413.
    const validBody = JSON.stringify({ sidebarWidth: 320 })
    const padded = (bytes) => `${validBody}${' '.repeat(bytes - Buffer.byteLength(validBody, 'utf8'))}`
    const atCap = padded(1024)
    assert.equal(Buffer.byteLength(atCap, 'utf8'), 1024)
    const accepted = await fixture.route.fetch(postRaw(atCap))
    assert.equal(accepted.status, 200)
    assert.deepEqual(await accepted.json(), { version: 1, sidebarWidth: 320 })

    const overCap = padded(1025)
    assert.equal(Buffer.byteLength(overCap, 'utf8'), 1025)
    const oversized = await fixture.route.fetch(postRaw(overCap))
    assert.equal(oversized.status, 413)
    assert.equal(oversized.headers.get('cache-control'), 'no-store')
    assert.equal((await oversized.json()).code, 'too-large')

    // Multibyte content: under 1024 UTF-16 code units but over 1024 UTF-8 bytes.
    const multibyteBody = `{"sidebarWidth":320,"pad":"${'汉'.repeat(400)}"}`
    assert.ok(multibyteBody.length < 1024)
    assert.ok(Buffer.byteLength(multibyteBody, 'utf8') > 1024)
    const multibyte = await fixture.route.fetch(postRaw(multibyteBody))
    assert.equal(multibyte.status, 413)
    assert.equal((await multibyte.json()).code, 'too-large')
  } finally {
    await fixture.dispose()
  }
})

test('sidebar-width POST rejects anything but exactly one valid sidebarWidth field', async () => {
  const fixture = await routeFixture()
  try {
    const rejected = [
      {},
      null,
      [],
      '320',
      { version: 1, sidebarWidth: 320 },
      { sidebarWidth: 320, extra: true },
      { width: 320 },
      { sidebarWidth: SIDEBAR_WIDTH_MIN - 1 },
      { sidebarWidth: SIDEBAR_WIDTH_MAX + 1 },
      { sidebarWidth: 320.5 },
      { sidebarWidth: '320' },
      { sidebarWidth: null }
    ]
    for (const body of rejected) {
      const response = await fixture.route.fetch(postJson(body))
      assert.equal(response.status, 400, JSON.stringify(body))
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const payload = await response.json()
      assert.equal(payload.code, 'bad-request', JSON.stringify(body))
      assert.equal(typeof payload.message, 'string')
    }
    // Rejected writes never touched the document.
    await assert.rejects(readFile(sidebarWidthPath(fixture.home)), { code: 'ENOENT' })
  } finally {
    await fixture.dispose()
  }
})

test('sidebar-width route turns an unreadable document into a no-store 500 store-read-failed', async () => {
  const fixture = await routeFixture()
  try {
    // A directory where the document should be makes the read fail (EISDIR).
    await mkdir(sidebarWidthPath(fixture.home), { recursive: true })
    const getResponse = await fixture.route.fetch(new Request(ROUTE_URL))
    assert.equal(getResponse.status, 500)
    assert.equal(getResponse.headers.get('cache-control'), 'no-store')
    assert.equal((await getResponse.json()).code, 'store-read-failed')
    const postResponse = await fixture.route.fetch(postJson({ sidebarWidth: 320 }))
    assert.equal(postResponse.status, 500)
    assert.equal(postResponse.headers.get('cache-control'), 'no-store')
    assert.equal((await postResponse.json()).code, 'store-read-failed')
  } finally {
    await fixture.dispose()
  }
})

test('sidebar-width route maps an overridden store read failure to store-read-failed', async () => {
  const readError = new Error('unreadable')
  readError.code = SIDEBAR_WIDTH_READ_FAILED
  const fixture = await routeFixture({
    store: {
      async get() {
        throw readError
      },
      async set() {
        throw readError
      }
    }
  })
  try {
    const getResponse = await fixture.route.fetch(new Request(ROUTE_URL))
    assert.equal(getResponse.status, 500)
    assert.equal(getResponse.headers.get('cache-control'), 'no-store')
    assert.equal((await getResponse.json()).code, 'store-read-failed')
    const postResponse = await fixture.route.fetch(postJson({ sidebarWidth: 320 }))
    assert.equal(postResponse.status, 500)
    assert.equal((await postResponse.json()).code, 'store-read-failed')
  } finally {
    await fixture.dispose()
  }
})

test('sidebar-width POST maps a store write failure to a no-store 500 store-failed', async () => {
  const fixture = await routeFixture({
    store: {
      async get() {
        return DEFAULT_DOCUMENT
      },
      async set() {
        throw new Error('disk full')
      }
    }
  })
  try {
    const response = await fixture.route.fetch(postJson({ sidebarWidth: 320 }))
    assert.equal(response.status, 500)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), {
      code: 'store-failed',
      message: 'sidebar width could not be stored'
    })
    // The injected store's read path still serves normally.
    const getResponse = await fixture.route.fetch(new Request(ROUTE_URL))
    assert.equal(getResponse.status, 200)
    assert.deepEqual(await getResponse.json(), DEFAULT_DOCUMENT)
  } finally {
    await fixture.dispose()
  }
})

test('sidebar-width route uses the injected store instead of $DSH_HOME', async () => {
  const widths = []
  const fixture = await routeFixture({
    store: {
      async get() {
        return DEFAULT_DOCUMENT
      },
      async set(sidebarWidth) {
        widths.push(sidebarWidth)
        return { version: 1, sidebarWidth }
      }
    }
  })
  try {
    const response = await fixture.route.fetch(postJson({ sidebarWidth: 400 }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { version: 1, sidebarWidth: 400 })
    assert.deepEqual(widths, [400])
    await assert.rejects(readFile(sidebarWidthPath(fixture.home)), { code: 'ENOENT' })
  } finally {
    await fixture.dispose()
  }
})
