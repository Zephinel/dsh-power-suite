/**
 * Host + store tests for the Running & recent card's pinned Session ids
 * (`src/features/session-pins/`).
 *
 * The feature is the panel-owned Host-shared pin document:
 *
 *   { "version": 1, "rev": <n>, "pinned": ["<sessionId>", ...] }
 *
 * under `$DSH_HOME/dsh-power-suite/session-pins.json`, served by the
 * authenticated route `/api/power-suite.session-pins` (GET document, POST
 * `{ ops: [{ op: 'pin' | 'unpin', id }] }`). This file mirrors
 * `test/read-acks.test.js`: pure document helpers first, then the durable store
 * over a throwaway `$DSH_HOME`, then the route against a fake
 * `ctx.connection.fetch.register` capture. Client behavior (cache, optimistic
 * queue, migration, UI) is covered by `test/dynamic-workspaces-pin.test.js` and
 * the live `--pin` E2E harness.
 */
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  MAX_PIN_OPS,
  MAX_PINNED_SESSIONS,
  PIN_OP_VALUES,
  SESSION_PINS_READ_FAILED,
  SESSION_PINS_VERSION,
  applyPinOps,
  createSessionPinStore,
  normalizeSessionPins,
  parseSessionPins,
  sanitizePinned,
  serializeSessionPins,
  sessionPinsPath,
  validatePinOps
} from '../src/features/session-pins/store.ts'
import {
  SESSION_PINS_ROUTE,
  installSessionPins,
  validatePinApplyBody
} from '../src/features/session-pins/host.ts'

/** The canonical empty document every parse failure degrades to. */
const EMPTY_DOCUMENT = { version: SESSION_PINS_VERSION, rev: 0, pinned: [] }

/**
 * Create one throwaway harness home.
 * @returns {Promise<string>} absolute directory.
 */
async function temporaryHome() {
  return mkdtemp(path.join(os.tmpdir(), 'ps-session-pins-'))
}

/**
 * Read one persisted document back from the harness home.
 * @param {string} home - harness home.
 * @returns {Promise<object>} parsed document.
 */
async function readDocument(home) {
  return JSON.parse(await readFile(sessionPinsPath(home), 'utf8'))
}

test('a missing, corrupt, or foreign document reads as empty', () => {
  assert.deepEqual(parseSessionPins(''), EMPTY_DOCUMENT)
  assert.deepEqual(parseSessionPins('{not json'), EMPTY_DOCUMENT)
  assert.deepEqual(parseSessionPins('null'), EMPTY_DOCUMENT)
  assert.deepEqual(parseSessionPins('[]'), EMPTY_DOCUMENT)
  assert.deepEqual(parseSessionPins('{"version":2,"rev":3,"pinned":["session-a"]}'), EMPTY_DOCUMENT)
  assert.deepEqual(parseSessionPins('{"version":1}'), EMPTY_DOCUMENT)
  assert.deepEqual(normalizeSessionPins(null), EMPTY_DOCUMENT)
  assert.deepEqual(normalizeSessionPins({ rev: -5, pinned: 'session-a' }), EMPTY_DOCUMENT)
})

test('a valid document parses sanitized and bounded pins', () => {
  const text = JSON.stringify({
    version: 1,
    rev: 4,
    pinned: ['session-a', 'session-a', '', null, 42, 'session-b']
  })
  assert.deepEqual(parseSessionPins(text), { version: 1, rev: 4, pinned: ['session-a', 'session-b'] })
  // `rev` is floored; ids are bounded to 200 characters.
  assert.deepEqual(
    parseSessionPins(JSON.stringify({ version: 1, rev: 1.9, pinned: ['x'.repeat(200), 'y'.repeat(201)] })),
    { version: 1, rev: 1, pinned: ['x'.repeat(200)] }
  )
  assert.deepEqual(sanitizePinned(null), [])
  assert.deepEqual(sanitizePinned(['session-a', 'session-a', 'session-b', '']), ['session-a', 'session-b'])
  // The cap keeps insertion order and drops the newest overflow.
  const many = Array.from({ length: MAX_PINNED_SESSIONS + 5 }, (_, index) => `session-${index}`)
  const bounded = sanitizePinned(many)
  assert.equal(bounded.length, MAX_PINNED_SESSIONS)
  assert.equal(bounded[0], 'session-0')
  assert.equal(bounded[MAX_PINNED_SESSIONS - 1], `session-${MAX_PINNED_SESSIONS - 1}`)
})

test('applyPinOps applies pin/unpin with last-write-wins and only bumps rev on change', () => {
  const document = { version: 1, rev: 3, pinned: ['session-a'] }
  // No-ops keep the exact document (same rev).
  assert.deepEqual(applyPinOps(document, [{ op: 'pin', id: 'session-a' }]), document)
  assert.deepEqual(applyPinOps(document, [{ op: 'unpin', id: 'session-ghost' }]), document)
  // A real change bumps rev once, even when the batch carries several changes.
  assert.deepEqual(applyPinOps(document, [{ op: 'pin', id: 'session-b' }]), {
    version: 1,
    rev: 4,
    pinned: ['session-a', 'session-b']
  })
  assert.deepEqual(applyPinOps(document, [{ op: 'unpin', id: 'session-a' }]), {
    version: 1,
    rev: 4,
    pinned: []
  })
  // Arrival order decides the final state of one id.
  assert.deepEqual(applyPinOps(document, [{ op: 'pin', id: 'session-b' }, { op: 'unpin', id: 'session-b' }]), {
    version: 1,
    rev: 4,
    pinned: ['session-a']
  })
  assert.deepEqual(applyPinOps(document, [{ op: 'unpin', id: 'session-a' }, { op: 'pin', id: 'session-a' }]), {
    version: 1,
    rev: 4,
    pinned: ['session-a']
  })
  // The bound drops the oldest pins first when new ones overflow it.
  const full = {
    version: 1,
    rev: 0,
    pinned: Array.from({ length: MAX_PINNED_SESSIONS }, (_, index) => `session-${index}`)
  }
  const overflow = applyPinOps(full, [{ op: 'pin', id: 'extra-1' }, { op: 'pin', id: 'extra-2' }])
  assert.equal(overflow.pinned.length, MAX_PINNED_SESSIONS)
  assert.equal(overflow.pinned[0], 'session-2', 'the two oldest pins dropped')
  assert.equal(overflow.pinned.includes('session-0'), false)
  assert.equal(overflow.pinned.includes('session-1'), false)
  assert.equal(overflow.pinned[overflow.pinned.length - 1], 'extra-2')
})

test('validatePinOps accepts canonical operations and rejects malformed lists', () => {
  assert.deepEqual(validatePinOps([{ op: 'pin', id: 'session-a' }, { op: 'unpin', id: 'session-b', extra: true }]), {
    ok: true,
    ops: [{ op: 'pin', id: 'session-a' }, { op: 'unpin', id: 'session-b' }]
  })
  const malformed = [
    undefined,
    null,
    'pin',
    {},
    [],
    [null],
    [{ op: 'toggle', id: 'session-a' }],
    [{ op: 'pin' }],
    [{ op: 'pin', id: '' }],
    [{ op: 'pin', id: 42 }],
    [{ op: 'pin', id: 'x'.repeat(201) }],
    Array.from({ length: MAX_PIN_OPS + 1 }, () => ({ op: 'pin', id: 'session-a' }))
  ]
  for (const value of malformed) {
    const verdict = validatePinOps(value)
    assert.equal(verdict.ok, false, `expected rejection for ${JSON.stringify(value)?.slice(0, 60)}`)
    assert.equal(typeof verdict.message, 'string')
  }
  assert.equal(PIN_OP_VALUES.join(','), 'pin,unpin')
  assert.equal(validatePinApplyBody(null).ok, false)
  assert.equal(validatePinApplyBody({}).ok, false)
  assert.equal(validatePinApplyBody({ ops: [] }).ok, false)
  assert.equal(validatePinApplyBody({ ops: [{ op: 'pin', id: 'session-a' }] }).ok, true)
})

test('serialize writes the versioned file shape and the path lives under the suite directory', () => {
  const text = serializeSessionPins({ version: 1, rev: 2, pinned: ['session-b', 'session-a'] })
  assert.equal(text.endsWith('\n'), true)
  assert.match(text, /\n  "pinned": \[\n/)
  const parsed = JSON.parse(text)
  assert.equal(parsed.version, SESSION_PINS_VERSION)
  assert.equal(parsed.rev, 2)
  assert.deepEqual(parsed.pinned, ['session-b', 'session-a'])
  assert.equal(sessionPinsPath('/tmp/example-home'), path.join('/tmp/example-home', 'dsh-power-suite', 'session-pins.json'))
  assert.equal(SESSION_PINS_VERSION, 1)
  assert.equal(MAX_PINNED_SESSIONS, 500)
  assert.equal(MAX_PIN_OPS, 200)
})

test('the durable store starts empty, applies atomically, and reloads from disk', async () => {
  const home = await temporaryHome()
  try {
    const file = sessionPinsPath(home)
    const first = createSessionPinStore(home)
    assert.deepEqual(await first.get(), EMPTY_DOCUMENT)
    assert.deepEqual(await first.apply([{ op: 'pin', id: 'session-a' }, { op: 'pin', id: 'session-b' }]), {
      version: 1,
      rev: 1,
      pinned: ['session-a', 'session-b']
    })
    // A no-op never bumps rev nor rewrites the document.
    assert.deepEqual(await first.apply([{ op: 'pin', id: 'session-a' }]), {
      version: 1,
      rev: 1,
      pinned: ['session-a', 'session-b']
    })
    assert.deepEqual(await readDocument(home), { version: 1, rev: 1, pinned: ['session-a', 'session-b'] })
    // Only the document is left behind: writes land through a temp sibling + rename.
    assert.deepEqual(await readdir(path.dirname(file)), ['session-pins.json'])
    // A second store instance (a restart) reads persisted state.
    const second = createSessionPinStore(home)
    assert.deepEqual(await second.get(), { version: 1, rev: 1, pinned: ['session-a', 'session-b'] })
    assert.deepEqual(await second.apply([{ op: 'unpin', id: 'session-a' }]), {
      version: 1,
      rev: 2,
      pinned: ['session-b']
    })
    assert.deepEqual(await readDocument(home), { version: 1, rev: 2, pinned: ['session-b'] })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a corrupt store file reads empty and the next write replaces it', async () => {
  const home = await temporaryHome()
  try {
    const file = sessionPinsPath(home)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, '{broken', 'utf8')
    const store = createSessionPinStore(home)
    assert.deepEqual(await store.get(), EMPTY_DOCUMENT)
    assert.deepEqual(await store.apply([{ op: 'pin', id: 'session-c' }]), {
      version: 1,
      rev: 1,
      pinned: ['session-c']
    })
    assert.deepEqual(await readDocument(home), { version: 1, rev: 1, pinned: ['session-c'] })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('an unreadable store file throws typed and retries after recovery', async () => {
  const home = await temporaryHome()
  const file = sessionPinsPath(home)
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, serializeSessionPins({ version: 1, rev: 2, pinned: ['session-existing'] }), 'utf8')
    await chmod(file, 0o000)
    const store = createSessionPinStore(home)
    await assert.rejects(store.get(), (error) => error.code === SESSION_PINS_READ_FAILED)
    await assert.rejects(
      store.apply([{ op: 'pin', id: 'session-new' }]),
      (error) => error.code === SESSION_PINS_READ_FAILED
    )
    // The failed load must not have published an empty state over the file.
    await chmod(file, 0o600)
    assert.deepEqual(await readDocument(home), { version: 1, rev: 2, pinned: ['session-existing'] })
    // The same store retries after recovery and preserves the recovered pins.
    assert.equal((await store.get()).rev, 2)
    assert.deepEqual(await store.apply([{ op: 'pin', id: 'session-new' }]), {
      version: 1,
      rev: 3,
      pinned: ['session-existing', 'session-new']
    })
    assert.deepEqual((await readDocument(home)).pinned, ['session-existing', 'session-new'])
  } finally {
    await chmod(file, 0o600).catch(() => {})
    await rm(home, { recursive: true, force: true })
  }
})

test('a directory at the document path is a typed read failure, not an empty document', async () => {
  const home = await temporaryHome()
  const file = sessionPinsPath(home)
  try {
    await mkdir(file, { recursive: true })
    const store = createSessionPinStore(home)
    await assert.rejects(store.get(), (error) => error.code === SESSION_PINS_READ_FAILED)
    await assert.rejects(
      store.apply([{ op: 'pin', id: 'session-a' }]),
      (error) => error.code === SESSION_PINS_READ_FAILED
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('concurrent applies serialize on one chain without losing operations', async () => {
  const home = await temporaryHome()
  try {
    const store = createSessionPinStore(home)
    const operations = []
    for (let index = 0; index < 10; index += 1) {
      operations.push(store.apply([{ op: 'pin', id: `session-${index}` }]))
    }
    await Promise.all(operations)
    const document = await readDocument(home)
    assert.equal(document.rev, 10)
    assert.equal(document.pinned.length, 10)
    for (let index = 0; index < 10; index += 1) assert.equal(document.pinned[index], `session-${index}`)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

/**
 * Build a Host context that records the session-pins route.
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
 * @param {object} [options] - `installSessionPins` options (store override).
 * @returns {Promise<{ home: string, route: object, dispose: Function }>} fixture.
 */
async function routeFixture(options = {}) {
  const home = await temporaryHome()
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const { ctx, routes } = makeContext()
  installSessionPins(ctx, options)
  if (previous === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previous
  const route = routes.get(SESSION_PINS_ROUTE)
  return { home, route, dispose: async () => rm(home, { recursive: true, force: true }) }
}

/**
 * Build one JSON POST request.
 * @param {unknown} body - payload.
 * @returns {Request} the request.
 */
function postJson(body) {
  return new Request('http://host/api/power-suite.session-pins', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

test('session-pins route serves an empty document with no-store', async () => {
  const fixture = await routeFixture()
  try {
    assert.deepEqual(fixture.route.methods, ['GET', 'POST'])
    assert.equal(fixture.route.requestBody, 'buffered')
    const response = await fixture.route.fetch(new Request('http://host/api/power-suite.session-pins'))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), EMPTY_DOCUMENT)
  } finally {
    await fixture.dispose()
  }
})

test('session-pins POST applies pin/unpin, bumps rev only on change, and persists', async () => {
  const fixture = await routeFixture()
  try {
    const first = await fixture.route.fetch(postJson({
      ops: [{ op: 'pin', id: 'session-a' }, { op: 'pin', id: 'session-b' }]
    }))
    assert.equal(first.status, 200)
    assert.deepEqual(await first.json(), { version: 1, rev: 1, pinned: ['session-a', 'session-b'] })

    const noop = await fixture.route.fetch(postJson({ ops: [{ op: 'pin', id: 'session-a' }] }))
    assert.equal(noop.status, 200)
    assert.deepEqual(await noop.json(), { version: 1, rev: 1, pinned: ['session-a', 'session-b'] })

    const unpin = await fixture.route.fetch(postJson({ ops: [{ op: 'unpin', id: 'session-a' }] }))
    assert.deepEqual(await unpin.json(), { version: 1, rev: 2, pinned: ['session-b'] })

    const get = await fixture.route.fetch(new Request('http://host/api/power-suite.session-pins'))
    assert.deepEqual(await get.json(), { version: 1, rev: 2, pinned: ['session-b'] })
    assert.deepEqual(await readDocument(fixture.home), { version: 1, rev: 2, pinned: ['session-b'] })
  } finally {
    await fixture.dispose()
  }
})

test('session-pins route rejects wrong media type, malformed or oversized bodies', async () => {
  const fixture = await routeFixture()
  try {
    const wrongType = await fixture.route.fetch(new Request('http://host/api/power-suite.session-pins', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"ops":[]}'
    }))
    assert.equal(wrongType.status, 415)
    assert.equal((await wrongType.json()).code, 'unsupported-media-type')

    const malformed = await fixture.route.fetch(new Request('http://host/api/power-suite.session-pins', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken'
    }))
    assert.equal(malformed.status, 400)
    assert.equal((await malformed.json()).code, 'bad-request')

    const rejectedBodies = [
      {},
      { ops: [] },
      { ops: 'pin:session-a' },
      { ops: [null] },
      { ops: [{ op: 'toggle', id: 'session-a' }] },
      { ops: [{ op: 'pin', id: '' }] },
      { ops: [{ op: 'pin', id: 42 }] },
      { ops: [{ op: 'pin', id: 'x'.repeat(201) }] },
      { ops: Array.from({ length: MAX_PIN_OPS + 1 }, () => ({ op: 'pin', id: 'session-a' })) }
    ]
    for (const body of rejectedBodies) {
      const response = await fixture.route.fetch(postJson(body))
      assert.equal(response.status, 400, JSON.stringify(body).slice(0, 60))
      assert.equal((await response.json()).code, 'bad-request')
    }

    const oversized = await fixture.route.fetch(new Request('http://host/api/power-suite.session-pins', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: `{"ops":[{"op":"pin","id":"session-a"}],"pad":"${'a'.repeat(70 * 1024)}"}`
    }))
    assert.equal(oversized.status, 413)
    assert.equal((await oversized.json()).code, 'too-large')

    // Multibyte content: under 64K UTF-16 code units but over 64 KiB of UTF-8.
    const multibyteBody = `{"ops":[{"op":"pin","id":"session-a"}],"pad":"${'汉'.repeat(30 * 1024)}"}`
    assert.ok(multibyteBody.length < 64 * 1024)
    assert.ok(Buffer.byteLength(multibyteBody, 'utf8') > 64 * 1024)
    const multibyte = await fixture.route.fetch(new Request('http://host/api/power-suite.session-pins', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: multibyteBody
    }))
    assert.equal(multibyte.status, 413)
  } finally {
    await fixture.dispose()
  }
})

test('session-pins route turns a read failure into a no-store 500 store-read-failed', async () => {
  const { ctx, routes } = makeContext()
  const readError = new Error('unreadable')
  readError.code = SESSION_PINS_READ_FAILED
  installSessionPins(ctx, {
    store: {
      async get() {
        throw readError
      },
      async apply() {
        throw readError
      }
    }
  })
  const route = routes.get(SESSION_PINS_ROUTE)
  const getResponse = await route.fetch(new Request('http://host/api/power-suite.session-pins'))
  assert.equal(getResponse.status, 500)
  assert.equal(getResponse.headers.get('cache-control'), 'no-store')
  assert.equal((await getResponse.json()).code, 'store-read-failed')
  const postResponse = await route.fetch(postJson({ ops: [{ op: 'pin', id: 'session-a' }] }))
  assert.equal(postResponse.status, 500)
  assert.equal(postResponse.headers.get('cache-control'), 'no-store')
  assert.equal((await postResponse.json()).code, 'store-read-failed')
})

test('session-pins POST maps a store write failure to a no-store 500 store-failed', async () => {
  const { ctx, routes } = makeContext()
  installSessionPins(ctx, {
    store: {
      async get() {
        return EMPTY_DOCUMENT
      },
      async apply() {
        throw new Error('disk full')
      }
    }
  })
  const route = routes.get(SESSION_PINS_ROUTE)
  const response = await route.fetch(postJson({ ops: [{ op: 'pin', id: 'session-a' }] }))
  assert.equal(response.status, 500)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { code: 'store-failed', message: 'pinned sessions could not be stored' })
})
