import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  MAX_READ_ACKS,
  READ_ACKS_READ_FAILED,
  createReadAckStore,
  mergeAcked,
  normalizeAcked,
  parseReadAcks,
  readAcksPath,
  sanitizeAcked,
  serializeReadAcks
} from '../src/features/read-acks/store.js'
import { READ_ACKS_ROUTE, harnessHome, installReadAcks } from '../src/features/read-acks/host.js'

/**
 * Create one throwaway harness home.
 * @returns {Promise<string>} absolute directory.
 */
async function temporaryHome() {
  return mkdtemp(path.join(os.tmpdir(), 'ps-read-acks-'))
}

/**
 * Build entries for a cap test.
 * @param {number} count - number of entries.
 * @returns {Record<string, number>} id → ascending baselines.
 */
function manyEntries(count) {
  const acked = {}
  for (let index = 0; index < count; index += 1) {
    acked[`session-${String(index).padStart(4, '0')}`] = 1000 + index
  }
  return acked
}

test('a missing, corrupt, or foreign document reads as empty', () => {
  assert.deepEqual(parseReadAcks(''), {})
  assert.deepEqual(parseReadAcks('{not json'), {})
  assert.deepEqual(parseReadAcks('null'), {})
  assert.deepEqual(parseReadAcks('{"version":2,"acked":{"a":1}}'), {})
  assert.deepEqual(parseReadAcks('{"version":1}'), {})
  assert.deepEqual(parseReadAcks('{"version":1,"acked":[]}'), {})
})

test('a valid document parses sanitized and bounded entries', () => {
  const text = JSON.stringify({
    version: 1,
    acked: {
      'session-a': 1200,
      'session-b': 'nope',
      '': 5,
      'session-c': -3,
      'session-d': 0,
      'session-e': 7.5
    }
  })
  assert.deepEqual(parseReadAcks(text), { 'session-a': 1200, 'session-e': 7.5 })
  assert.deepEqual(sanitizeAcked(null), {})
  assert.deepEqual(sanitizeAcked({ ok: 10, bad: null }), { ok: 10 })
})

test('merge keeps the newer baseline per Session and ignores invalid entries', () => {
  assert.deepEqual(mergeAcked({ a: 100, b: 50 }, { a: 80, b: 90, c: 10 }), { a: 100, b: 90, c: 10 })
  assert.deepEqual(mergeAcked({ a: 1 }, { a: 5, bad: 'no', empty: 0, negative: -2 }), { a: 5 })
  assert.deepEqual(mergeAcked(null, { a: 3 }), { a: 3 })
  assert.deepEqual(mergeAcked({ a: 3 }, null), { a: 3 })
})

test('the cap keeps the newest baselines and drops the oldest first', () => {
  const capped = normalizeAcked(manyEntries(MAX_READ_ACKS + 5))
  assert.equal(Object.keys(capped).length, MAX_READ_ACKS)
  for (let index = 0; index < 5; index += 1) {
    assert.equal(capped[`session-${String(index).padStart(4, '0')}`], undefined)
  }
  assert.equal(capped[`session-${String(5).padStart(4, '0')}`], 1005)
  assert.equal(capped[`session-${String(MAX_READ_ACKS + 4).padStart(4, '0')}`], 1000 + MAX_READ_ACKS + 4)
})

test('serialize writes the versioned document shape', () => {
  const text = serializeReadAcks({ b: 5, a: 10 })
  assert.equal(text.endsWith('\n'), true)
  const parsed = JSON.parse(text)
  assert.equal(parsed.version, 1)
  assert.deepEqual(parsed.acked, { a: 10, b: 5 })
  assert.match(text, /\n  "acked": \{\n/)
})

test('the durable store merges per id, persists atomically, and reloads', async () => {
  const home = await temporaryHome()
  try {
    const first = createReadAckStore(home)
    assert.deepEqual(await first.get(), {})
    assert.deepEqual(await first.record({ a: 100, b: 40 }), { a: 100, b: 40 })
    assert.deepEqual(await first.record({ a: 80, b: 90, c: 10 }), { a: 100, b: 90, c: 10 })
    const document = JSON.parse(await readFile(readAcksPath(home), 'utf8'))
    assert.equal(document.version, 1)
    assert.deepEqual(document.acked, { a: 100, b: 90, c: 10 })

    const second = createReadAckStore(home)
    assert.deepEqual(await second.get(), { a: 100, b: 90, c: 10 })

    await writeFile(readAcksPath(home), '{broken', 'utf8')
    const broken = createReadAckStore(home)
    assert.deepEqual(await broken.get(), {})
    assert.deepEqual(await broken.record({ d: 7 }), { d: 7 })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

/**
 * Build a Host context that records the read-acks route.
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
 * @returns {Promise<{ home: string, route: object, dispose: Function }>} fixture.
 */
async function routeFixture() {
  const home = await temporaryHome()
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const { ctx, routes } = makeContext()
  installReadAcks(ctx)
  if (previous === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previous
  const route = routes.get(READ_ACKS_ROUTE)
  return { home, route, dispose: async () => rm(home, { recursive: true, force: true }) }
}

/**
 * Build one JSON POST request.
 * @param {unknown} body - payload.
 * @returns {Request} the request.
 */
function postJson(body) {
  return new Request('http://host/api/power-suite.read-acks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

test('read-acks route serves an empty document with no-store', async () => {
  const fixture = await routeFixture()
  try {
    assert.deepEqual(fixture.route.methods, ['GET', 'POST'])
    assert.equal(fixture.route.requestBody, 'buffered')
    const response = await fixture.route.fetch(new Request('http://host/api/power-suite.read-acks'))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { acked: {} })
  } finally {
    await fixture.dispose()
  }
})

test('read-acks POST merges per-id maxima and returns the merged document', async () => {
  const fixture = await routeFixture()
  try {
    const first = await fixture.route.fetch(postJson({ acked: { 'session-a': 1000, 'session-b': 500 } }))
    assert.equal(first.status, 200)
    assert.deepEqual(await first.json(), { acked: { 'session-a': 1000, 'session-b': 500 } })

    const lower = await fixture.route.fetch(postJson({ acked: { 'session-a': 700 } }))
    assert.deepEqual(await lower.json(), { acked: { 'session-a': 1000, 'session-b': 500 } })

    const higher = await fixture.route.fetch(postJson({ acked: { 'session-a': 2000, 'session-c': 1500 } }))
    assert.deepEqual(await higher.json(), { acked: { 'session-a': 2000, 'session-b': 500, 'session-c': 1500 } })

    const get = await fixture.route.fetch(new Request('http://host/api/power-suite.read-acks'))
    assert.deepEqual(await get.json(), { acked: { 'session-a': 2000, 'session-b': 500, 'session-c': 1500 } })

    const document = JSON.parse(await readFile(readAcksPath(fixture.home), 'utf8'))
    assert.equal(document.version, 1)
    assert.deepEqual(document.acked, { 'session-a': 2000, 'session-b': 500, 'session-c': 1500 })
  } finally {
    await fixture.dispose()
  }
})

test('read-acks route rejects the wrong media type, malformed or oversized bodies', async () => {
  const fixture = await routeFixture()
  try {
    const wrongType = await fixture.route.fetch(new Request('http://host/api/power-suite.read-acks', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"acked":{}}'
    }))
    assert.equal(wrongType.status, 415)
    assert.equal((await wrongType.json()).code, 'unsupported-media-type')

    const malformed = await fixture.route.fetch(new Request('http://host/api/power-suite.read-acks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken'
    }))
    assert.equal(malformed.status, 400)
    assert.equal((await malformed.json()).code, 'bad-request')

    const oversized = await fixture.route.fetch(new Request('http://host/api/power-suite.read-acks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: `{"acked":{"x":1},"pad":"${'a'.repeat(70 * 1024)}"}`
    }))
    assert.equal(oversized.status, 413)
    assert.equal((await oversized.json()).code, 'too-large')

    // Multibyte content: under 64K UTF-16 code units but over 64 KiB of UTF-8.
    const multibyteBody = `{"acked":{},"pad":"${'汉'.repeat(30 * 1024)}"}`
    assert.ok(multibyteBody.length < 64 * 1024)
    assert.ok(Buffer.byteLength(multibyteBody, 'utf8') > 64 * 1024)
    const multibyte = await fixture.route.fetch(new Request('http://host/api/power-suite.read-acks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: multibyteBody
    }))
    assert.equal(multibyte.status, 413)
    assert.equal((await multibyte.json()).code, 'too-large')

    for (const body of [{}, { acked: [] }, { acked: { id: 'nope' } }, { acked: { id: 0 } }, { acked: { id: -5 } }, { acked: { ['x'.repeat(300)]: 10 } }]) {
      const response = await fixture.route.fetch(postJson(body))
      assert.equal(response.status, 400, JSON.stringify(body).slice(0, 60))
    }
  } finally {
    await fixture.dispose()
  }
})

test('an unreadable read-acks file throws typed on first read and retries after recovery', async () => {
  const home = await temporaryHome()
  const file = readAcksPath(home)
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, serializeReadAcks({ 'session-existing': 1000 }), 'utf8')
    await chmod(file, 0o000)
    const store = createReadAckStore(home)
    await assert.rejects(store.get(), (error) => error.code === READ_ACKS_READ_FAILED)
    await assert.rejects(store.record({ 'session-new': 2000 }), (error) => error.code === READ_ACKS_READ_FAILED)
    // The unreadable load must not have cached/published an empty state.
    await chmod(file, 0o600)
    const document = JSON.parse(await readFile(file, 'utf8'))
    assert.deepEqual(document.acked, { 'session-existing': 1000 })
    // The same store retries after recovery: old + newly recorded entries merge.
    assert.deepEqual(await store.get(), { 'session-existing': 1000 })
    assert.deepEqual(await store.record({ 'session-new': 2000 }), {
      'session-existing': 1000,
      'session-new': 2000
    })
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).acked, {
      'session-existing': 1000,
      'session-new': 2000
    })
  } finally {
    await chmod(file, 0o600).catch(() => {})
    await rm(home, { recursive: true, force: true })
  }
})

test('concurrent get()/record() rounds never clobber or drop acknowledged entries', async () => {
  const home = await temporaryHome()
  const file = readAcksPath(home)
  try {
    const store = createReadAckStore(home)
    const expected = {}
    for (let round = 0; round < 20; round += 1) {
      const operations = []
      for (let index = 0; index < 4; index += 1) operations.push(store.get())
      for (let index = 0; index < 3; index += 1) {
        const key = `session-${round}-${index}`
        expected[key] = 1000 + round * 10 + index
        operations.push(store.record({ [key]: expected[key] }))
      }
      await Promise.all(operations)
    }
    const finalState = await store.get()
    assert.deepEqual(finalState, expected)
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).acked, expected)
    assert.deepEqual(await createReadAckStore(home).get(), expected)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('read-acks route turns a read failure into no-store 500 store-read-failed', async () => {
  const { ctx, routes } = makeContext()
  const readError = new Error('unreadable')
  readError.code = READ_ACKS_READ_FAILED
  installReadAcks(ctx, {
    store: {
      async get() {
        throw readError
      },
      async record() {
        throw readError
      }
    }
  })
  const route = routes.get(READ_ACKS_ROUTE)
  const getResponse = await route.fetch(new Request('http://host/api/power-suite.read-acks'))
  assert.equal(getResponse.status, 500)
  assert.equal(getResponse.headers.get('cache-control'), 'no-store')
  assert.equal((await getResponse.json()).code, 'store-read-failed')
  const postResponse = await route.fetch(postJson({ acked: { 'session-a': 1000 } }))
  assert.equal(postResponse.status, 500)
  assert.equal(postResponse.headers.get('cache-control'), 'no-store')
  assert.equal((await postResponse.json()).code, 'store-read-failed')
})

test('read-acks POST maps store failures to a no-store 500', async () => {
  const { ctx, routes } = makeContext()
  installReadAcks(ctx, {
    store: {
      async get() {
        return {}
      },
      async record() {
        throw new Error('disk full')
      }
    }
  })
  const route = routes.get(READ_ACKS_ROUTE)
  const response = await route.fetch(postJson({ acked: { 'session-a': 1000 } }))
  assert.equal(response.status, 500)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { code: 'store-failed', message: 'read acknowledgements could not be stored' })
})

test('read-acks harnessHome trims DSH_HOME, resolves relative paths, and falls back on whitespace', () => {
  const previous = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = '  '
    assert.equal(harnessHome(), path.join(os.homedir(), '.dsh'))
    process.env.DSH_HOME = 'relative/read-acks-home'
    assert.equal(harnessHome(), path.resolve('relative/read-acks-home'))
    process.env.DSH_HOME = '/tmp/read-acks-home'
    assert.equal(harnessHome(), '/tmp/read-acks-home')
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})
