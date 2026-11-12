import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  ACTIVITY_LEDGER_VERSION,
  ACTIVITY_READ_FAILED,
  MAX_ACTIVITY_SESSIONS,
  activityLedgerPath,
  capActivitySessions,
  createActivityLedger,
  mergeActivitySessions,
  parseActivityLedger,
  sanitizeActivitySessions,
  serializeActivityLedger
} from '../src/features/session-activity/store.js'
import {
  ACTIVITY_EVENT_TYPES,
  MAX_ACTIVITY_FUTURE_SKEW_MS,
  MAX_CACHE_DOCUMENT_BYTES,
  NON_ACTIVITY_EVENT_TYPES,
  SESSION_ACTIVITY_ROUTE,
  activityFromEvent,
  createProjectionCacheReader,
  harnessHome,
  installSessionActivity,
  isActivityBearingEvent,
  isSyntheticSeedEvent,
  readCachedDocumentActivity,
  seedActivityBaseline
} from '../src/features/session-activity/host.js'

/**
 * One listed Session record.
 * @param {object} header - header fields.
 * @returns {{ header: object, live: boolean, persisted: boolean }} record.
 */
function record(header) {
  return { header: { isSeeded: false, ...header }, live: false, persisted: true }
}

/**
 * Build a Host context for the activity ledger.
 * @param {object} [options] - fixture pieces.
 * @param {Array<object>} [options.records] - listSessions result.
 * @param {Error} [options.listError] - listSessions rejection.
 * @returns {object} fake context with captured effects/handlers.
 */
function makeContext({ records = [], listError } = {}) {
  const routes = new Map()
  const handlers = []
  const cleanups = []
  const ctx = {
    effect: (fn) => {
      const cleanup = fn()
      const dispose = typeof cleanup === 'function' ? cleanup : () => {}
      cleanups.push(dispose)
      return dispose
    },
    on: (name, handler, options) => {
      handlers.push({ name, handler, options })
      return () => {
        handlers.length = Math.max(0, handlers.length - 1)
      }
    },
    connection: {
      fetch: {
        register: (definition) => {
          routes.set(definition.path, definition)
          return () => {}
        }
      }
    },
    sessionQuery: {
      async listSessions() {
        if (listError !== undefined) throw listError
        return records
      }
    }
  }
  return { ctx, routes, handlers, cleanups }
}

/**
 * Build one context with a real ledger in a throwaway home.
 * @returns {Promise<{ home: string, ledger: object, ctx: object, routes: Map, handlers: Array, cleanups: Array }>} fixture.
 */
async function ledgerFixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  const ledger = createActivityLedger(home)
  const fixture = makeContext()
  return { home, ledger, ...fixture }
}

test('activity ledger sanitizes, merges maxima, and caps the oldest entries', () => {
  assert.deepEqual(sanitizeActivitySessions({
    'session-a': 10,
    'session-b': 0,
    'session-c': -1,
    'session-d': 'nope',
    '': 5,
    ['x'.repeat(201)]: 7
  }), { 'session-a': 10 })
  assert.deepEqual(mergeActivitySessions({ a: 100, b: 50 }, { a: 80, b: 90, c: 10 }), { a: 100, b: 90, c: 10 })
  assert.deepEqual(mergeActivitySessions(null, { a: 3 }), { a: 3 })

  const many = {}
  for (let index = 0; index < MAX_ACTIVITY_SESSIONS + 5; index += 1) many[`session-${String(index).padStart(5, '0')}`] = 1000 + index
  const capped = capActivitySessions(many)
  assert.equal(Object.keys(capped).length, MAX_ACTIVITY_SESSIONS)
  assert.equal(capped['session-00000'], undefined)
  assert.equal(capped['session-00005'], 1005)
})

test('activity ledger parses only its own version and serializes the documented shape', () => {
  assert.deepEqual(parseActivityLedger(''), {})
  assert.deepEqual(parseActivityLedger('{broken'), {})
  assert.deepEqual(parseActivityLedger('{"version":2,"sessions":{"a":1}}'), {})
  assert.deepEqual(parseActivityLedger('{"version":1,"sessions":{"a":1,"b":"x"}}'), { a: 1 })
  const text = serializeActivityLedger({ b: 5, a: 10 })
  assert.equal(text.endsWith('\n'), true)
  const parsed = JSON.parse(text)
  assert.equal(parsed.version, ACTIVITY_LEDGER_VERSION)
  assert.deepEqual(parsed.sessions, { a: 10, b: 5 })
})

test('the durable ledger writes atomically, reloads, and rewrites corrupt/missing files', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  try {
    const ledger = createActivityLedger(home)
    await ledger.load()
    ledger.record({ 'session-a': 1000, 'session-b': 500 })
    await ledger.flush()
    const document = JSON.parse(await readFile(activityLedgerPath(home), 'utf8'))
    assert.equal(document.version, ACTIVITY_LEDGER_VERSION)
    assert.deepEqual(document.sessions, { 'session-a': 1000, 'session-b': 500 })
    assert.equal((await stat(activityLedgerPath(home))).mode & 0o777, 0o600)
    const reopened = createActivityLedger(home)
    assert.deepEqual(await reopened.load(), { 'session-a': 1000, 'session-b': 500 })

    const file = activityLedgerPath(home)
    await writeFile(file, '{broken', 'utf8')
    const corrupt = createActivityLedger(home)
    assert.deepEqual(await corrupt.load(), {})
    await corrupt.flush()
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).sessions, {})

    await rm(file, { force: true })
    const missing = createActivityLedger(home)
    assert.deepEqual(await missing.load(), {})
    await missing.flush()
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).sessions, {})
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('an unreadable activity ledger is never replaced by an empty document', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  const file = activityLedgerPath(home)
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, serializeActivityLedger({ 'session-old': 1000 }), 'utf8')
    await chmod(file, 0o000)
    const ledger = createActivityLedger(home)
    await assert.rejects(ledger.load(), (error) => error.code === ACTIVITY_READ_FAILED)
    ledger.record({ 'session-new': 2000 })
    await ledger.flush()
    await chmod(file, 0o600)
    // The failed unreadable flush must not have written an empty document.
    const beforeRecovery = JSON.parse(await readFile(file, 'utf8'))
    assert.deepEqual(beforeRecovery.sessions, { 'session-old': 1000 })
    // A later load/flush retries the read and merges instead of clobbering history.
    await ledger.load()
    await ledger.flush()
    const afterRecovery = JSON.parse(await readFile(file, 'utf8'))
    assert.deepEqual(afterRecovery.sessions, { 'session-old': 1000, 'session-new': 2000 })
    await ledger.dispose()
  } finally {
    await chmod(file, 0o600).catch(() => {})
    await rm(home, { recursive: true, force: true })
  }
})

test('activityFromEvent accepts committed events and ignores seeds or invalid times', () => {
  const session = { id: 'session-a' }
  assert.deepEqual(activityFromEvent(session, { type: 'turn/end', time: 1000 }), { sessionId: 'session-a', time: 1000 })
  assert.equal(activityFromEvent({}, { type: 'turn/end', time: 1000 }), null)
  assert.equal(activityFromEvent(session, null), null)
  assert.equal(activityFromEvent(session, { type: 'turn/end', time: 0 }), null)
  assert.equal(activityFromEvent(session, { type: 'turn/end', time: Number.NaN }), null)
  assert.equal(activityFromEvent(session, { type: 'turn/end', time: 'now' }), null)
  for (const type of ['session/end-seed', 'session/start-seed', 'plugin:demo/seed', 'seed']) {
    assert.equal(isSyntheticSeedEvent(type), true)
    assert.equal(activityFromEvent(session, { type, time: 1000 }), null)
  }
  assert.equal(isSyntheticSeedEvent('turn/end'), false)
  // Explicit activity-bearing allowlist: every known activity family advances.
  for (const type of ACTIVITY_EVENT_TYPES) {
    assert.deepEqual(activityFromEvent(session, { type, time: 1000 }), { sessionId: 'session-a', time: 1000 })
    assert.equal(isActivityBearingEvent(type), true)
  }
  // Spot-check the families the third review called out.
  for (const type of ['job/registered', 'job/settled', 'command/run', 'command/done', 'compaction/start',
    'compaction/end', 'subagent/descriptor', 'goal/change', 'todo/write', 'approval/decided', 'plan/mode',
    'tool-workflow/run-start', 'tool/ptc-dispatch', 'hook/invoked', 'hook/result']) {
    assert.equal(isActivityBearingEvent(type), true)
  }
  // `ptc-mode` is a MessageSourceMap key, never a Session event.
  assert.equal(isActivityBearingEvent('ptc-mode'), false)
  // Metadata, automation-only, seed and unknown-future/plugin types never advance.
  for (const type of [...NON_ACTIVITY_EVENT_TYPES, 'plugin:demo/metadata', 'future/unknown-event', '']) {
    assert.equal(activityFromEvent(session, { type, time: 1000 }), null)
    assert.equal(isActivityBearingEvent(type), false)
  }
})

test('the event handler creates/advances entries and the route serves the live ledger', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  try {
    const ledger = createActivityLedger(home)
    const { ctx, routes, handlers, cleanups } = makeContext()
    installSessionActivity(ctx, { ledger, readCachedDocument: async () => null })
    await ledger.load()
    assert.equal(handlers.length, 1)
    assert.equal(handlers[0].name, 'session/event')
    assert.equal(handlers[0].options?.global, true)
    const route = routes.get(SESSION_ACTIVITY_ROUTE)
    assert.equal(route.methods[0], 'GET')

    handlers[0].handler({ id: 'session-a' }, { type: 'turn/end', time: 1000 })
    handlers[0].handler({ id: 'session-a' }, { type: 'assistant/message', time: 2000 })
    handlers[0].handler({ id: 'session-a' }, { type: 'turn/end', time: 1500 })
    handlers[0].handler({ id: 'session-b' }, { type: 'session/end-seed', time: 9999 })
    const response = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { sessions: { 'session-a': 2000 } })

    await cleanups[0]()
    assert.equal(handlers.length, 0)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('the one-time baseline seeds missing Sessions, preserves newer entries, and falls back to headers', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  try {
    const ledger = createActivityLedger(home)
    await ledger.load()
    ledger.record({ 'session-newer': 5000 })
    const records = [
      record({ id: 'session-cached', createdAt: 100 }),
      record({ id: 'session-newer', createdAt: 100 }),
      record({ id: 'session-header', createdAt: 300 }),
      record({ id: 'session-empty' })
    ]
    const cache = new Map([
      ['session-cached', 1000],
      ['session-newer', 2000],
      ['session-empty', null]
    ])
    const { ctx } = makeContext({ records })
    const snapshot = await seedActivityBaseline(ctx, ledger, {
      readCachedDocument: async (id) => cache.get(id) ?? null
    })
    assert.equal(snapshot['session-cached'], 1000)
    assert.equal(snapshot['session-newer'], 5000)
    assert.equal(snapshot['session-header'], 300)
    assert.equal(snapshot['session-empty'], undefined)
    await ledger.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('baseline clamps corrupt/future cache times to now + 60 s', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  try {
    const ledger = createActivityLedger(home)
    await ledger.load()
    const { ctx } = makeContext({ records: [record({ id: 'session-future', createdAt: 100 })] })
    const future = Date.now() + 10 * 60 * 1000
    const before = Date.now()
    const snapshot = await seedActivityBaseline(ctx, ledger, { readCachedDocument: async () => future })
    const value = snapshot['session-future']
    assert.ok(value <= Date.now() + MAX_ACTIVITY_FUTURE_SKEW_MS + 2000)
    assert.ok(value >= before)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a listing failure leaves the baseline ledger untouched', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  try {
    const ledger = createActivityLedger(home)
    await ledger.load()
    ledger.record({ 'session-a': 1000 })
    const { ctx } = makeContext({ listError: new Error('corpus down') })
    assert.deepEqual(await seedActivityBaseline(ctx, ledger, { readCachedDocument: async () => 2000 }), { 'session-a': 1000 })
    await ledger.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('the route degrades to an empty map with no-store when the ledger fails', async () => {
  const { ctx, routes } = makeContext()
  installSessionActivity(ctx, {
    ledger: {
      async load() {},
      record() {},
      snapshot() { throw new Error('ledger unavailable') },
      async flush() {},
      async dispose() {}
    },
    readCachedDocument: async () => null
  })
  const response = await routes.get(SESSION_ACTIVITY_ROUTE).fetch(new Request('http://host/api/power-suite.session-activity'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { sessions: {} })
})

test('readCachedDocumentActivity takes the newer of lastMessageTime and lastInjectionTime', () => {
  const document = (val) => JSON.stringify({ version: 7, record: { rows: { timeContext: { ver: 3, seq: 1, val } } } })
  assert.equal(readCachedDocumentActivity(document({ lastMessageTime: 1000 })), 1000)
  assert.equal(readCachedDocumentActivity(document({ lastMessageTime: 1000, lastInjectionTime: 2000 })), 2000)
  assert.equal(readCachedDocumentActivity(document({ lastMessageTime: 3000, lastInjectionTime: 2000 })), 3000)
  assert.equal(readCachedDocumentActivity(document({ lastMessageTime: null, lastInjectionTime: null })), null)
  assert.equal(readCachedDocumentActivity('{broken'), null)
  assert.equal(readCachedDocumentActivity(JSON.stringify({ version: 7, record: { rows: {} } })), null)
})

test('the cache-document reader never returns mtime and skips oversized documents', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  try {
    const directory = path.join(home, 'storages', 'session_projcache', 'sessions')
    await mkdir(directory, { recursive: true })
    const file = path.join(directory, 'session-cached.json')
    const reader = createProjectionCacheReader(home)
    await writeFile(file, JSON.stringify({
      version: 7,
      record: { rows: { timeContext: { ver: 3, seq: 1, val: { lastMessageTime: 1000 } } } }
    }), 'utf8')
    await utimes(file, new Date(9000), new Date(9000))
    assert.equal(await reader('session-cached'), 1000)
    await writeFile(file, JSON.stringify({ version: 7, record: { rows: {} } }), 'utf8')
    await utimes(file, new Date(11000), new Date(11000))
    assert.equal(await reader('session-cached'), null)
    await writeFile(file, 'x'.repeat(MAX_CACHE_DOCUMENT_BYTES + 1), 'utf8')
    assert.equal(await reader('session-cached'), null)
    assert.equal(await reader('session-missing'), null)
    assert.equal(await reader('../etc/passwd'), null)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('dispose awaits an in-flight write, is idempotent, and loses no recorded event', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  try {
    const ledger = createActivityLedger(home)
    await ledger.load()
    ledger.record({ 'session-a': 1000 })
    // Start a flush and dispose while the write chain is active.
    const flushing = ledger.flush()
    ledger.record({ 'session-b': 2000 })
    const firstDispose = ledger.dispose()
    const secondDispose = ledger.dispose()
    await Promise.all([flushing, firstDispose, secondDispose])
    const document = JSON.parse(await readFile(activityLedgerPath(home), 'utf8'))
    assert.equal(document.sessions['session-a'], 1000)
    assert.equal(document.sessions['session-b'], 2000)
    // Repeated dispose after completion stays resolved and harmless.
    await ledger.dispose()
    assert.deepEqual(await createActivityLedger(home).load(), { 'session-a': 1000, 'session-b': 2000 })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('awaiting dispose() alone persists all entries (sensitive to a no-op dispose)', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  try {
    const ledger = createActivityLedger(home)
    await ledger.load()
    ledger.record({ 'session-a': 1000 })
    // Start a flush and deliberately DO NOT await it: dispose() itself must
    // serialize behind it and resolve only after bytes are on disk. Mutation
    // check: if dispose() were a no-op, the file would not exist/content yet
    // because the debounce timer is still pending and this test never awaits it.
    const inFlightFlush = ledger.flush()
    ledger.record({ 'session-b': 2000 })
    await ledger.dispose()
    const document = JSON.parse(await readFile(activityLedgerPath(home), 'utf8'))
    assert.equal(document.sessions['session-a'], 1000)
    assert.equal(document.sessions['session-b'], 2000)
    await inFlightFlush
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('concurrent flush()/dispose() rounds never resolve before the write is on disk', async () => {
  for (let round = 0; round < 8; round += 1) {
    const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-race-'))
    try {
      const ledger = createActivityLedger(home)
      await ledger.load()
      ledger.record({ [`session-${round}-a`]: 1000 })
      const flushPromise = ledger.flush()
      ledger.record({ [`session-${round}-b`]: 2000 })
      // Only dispose() is awaited here; it must include the in-flight flush.
      await ledger.dispose()
      const document = JSON.parse(await readFile(activityLedgerPath(home), 'utf8'))
      assert.equal(document.sessions[`session-${round}-a`], 1000)
      assert.equal(document.sessions[`session-${round}-b`], 2000)
      await flushPromise
      await ledger.dispose()
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  }
})

test('a durable write best-effort read-merges an externally modified ledger before writing', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  try {
    const ledger = createActivityLedger(home)
    await ledger.load()
    // Simulate another Host instance writing a newer entry before this flush.
    await mkdir(path.dirname(activityLedgerPath(home)), { recursive: true })
    await writeFile(activityLedgerPath(home), serializeActivityLedger({ 'session-b': 3000, 'session-c': 4000 }), 'utf8')
    ledger.record({ 'session-a': 2000 })
    await ledger.flush()
    const document = JSON.parse(await readFile(activityLedgerPath(home), 'utf8'))
    assert.deepEqual(document.sessions, { 'session-a': 2000, 'session-b': 3000, 'session-c': 4000 })
    // Later snapshots also see the external entries.
    assert.deepEqual(ledger.snapshot(), { 'session-a': 2000, 'session-b': 3000, 'session-c': 4000 })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('the route waits for the (single-flight) ledger load before serving', async () => {
  let loads = 0
  let loaded = false
  const fakeLedger = {
    async load() {
      loads += 1
      await new Promise((resolve) => setTimeout(resolve, 30))
      loaded = true
    },
    record() {},
    snapshot() {
      return loaded ? { 'session-loaded': 1000 } : {}
    },
    async flush() {},
    async dispose() {}
  }
  const { ctx, routes } = makeContext()
  installSessionActivity(ctx, { ledger: fakeLedger, readCachedDocument: async () => null })
  const route = routes.get(SESSION_ACTIVITY_ROUTE)
  const first = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
  assert.deepEqual(await first.json(), { sessions: { 'session-loaded': 1000 } })
  assert.equal(loads, 1)
  const second = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
  assert.deepEqual(await second.json(), { sessions: { 'session-loaded': 1000 } })
  assert.equal(loads, 1, 'load promise is single-flight')
})

test('fresh install: the FIRST route request already includes baseline seeding', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-ledger-'))
  try {
    const ledger = createActivityLedger(home)
    const records = [record({ id: 'session-seeded', createdAt: 100 })]
    const { ctx, routes } = makeContext({ records })
    installSessionActivity(ctx, {
      ledger,
      readCachedDocument: async (id) => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return id === 'session-seeded' ? 1234 : null
      }
    })
    const first = await routes.get(SESSION_ACTIVITY_ROUTE).fetch(new Request('http://host/api/power-suite.session-activity'))
    assert.equal(first.status, 200)
    assert.deepEqual(await first.json(), { sessions: { 'session-seeded': 1234 } })
    await ledger.dispose()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('seed timeout backs off, then resumes with seeded values when it settles', async () => {
  const state = { 'session-existing': 1000 }
  const fakeLedger = {
    async load() {},
    record(entries) { Object.assign(state, entries) },
    snapshot() { return { ...state } },
    async flush() {},
    async dispose() {}
  }
  let releaseSeed
  const seedGate = new Promise((resolve) => { releaseSeed = resolve })
  const { ctx, routes, cleanups } = makeContext()
  installSessionActivity(ctx, {
    ledger: fakeLedger,
    seedWaitMs: 300,
    seedBackoffMs: 500,
    seedBaseline: async () => {
      await seedGate
      fakeLedger.record({ 'session-seeded': 1234 })
    }
  })
  const route = routes.get(SESSION_ACTIVITY_ROUTE)
  const started = Date.now()
  const first = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
  const firstMs = Date.now() - started
  assert.ok(firstMs >= 200, `first cold GET should wait for the bounded seed window (${firstMs}ms)`)
  assert.deepEqual(await first.json(), { sessions: { 'session-existing': 1000 } })
  // Within the backoff window the route serves the current map immediately.
  const immediateStarted = Date.now()
  const second = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
  const secondMs = Date.now() - immediateStarted
  assert.ok(secondMs < 150, `backoff GET should be fast (${secondMs}ms)`)
  assert.deepEqual(await second.json(), { sessions: { 'session-existing': 1000 } })
  // Background seeding finishes; poll (rather than a fixed sleep) until the
  // next request includes the seeded value.
  releaseSeed()
  let seededBody = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    const response = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
    const body = await response.json()
    if (body.sessions?.['session-seeded'] === 1234) {
      seededBody = body
      break
    }
  }
  assert.deepEqual(seededBody, { sessions: { 'session-existing': 1000, 'session-seeded': 1234 } })
  await cleanups[0]()
})

test('a fail-once ledger load is retried by a later route GET', async () => {
  const state = {}
  let loads = 0
  const fakeLedger = {
    async load() {
      loads += 1
      if (loads === 1) {
        const error = new Error('unreadable ledger')
        error.code = ACTIVITY_READ_FAILED
        throw error
      }
      state['session-loaded'] = 2000
    },
    record(entries) { Object.assign(state, entries) },
    snapshot() { return { ...state } },
    async flush() {},
    async dispose() {}
  }
  const { ctx, routes, cleanups } = makeContext({ records: [] })
  installSessionActivity(ctx, {
    ledger: fakeLedger,
    seedWaitMs: 20,
    seedBackoffMs: 30,
    seedBaseline: async () => undefined
  })
  const route = routes.get(SESSION_ACTIVITY_ROUTE)
  const first = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { sessions: {} })
  assert.equal(loads, 1)
  // After the bounded seed backoff, the next GET retries load and serves the
  // recovered historical entries instead of caching the failure.
  await new Promise((resolve) => setTimeout(resolve, 60))
  const second = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
  assert.equal(second.status, 200)
  assert.deepEqual(await second.json(), { sessions: { 'session-loaded': 2000 } })
  assert.ok(loads >= 2)
  await cleanups[0]()
})

test('repeated create/record/dispose lifecycles leave no torn temp state', async () => {
  for (let round = 0; round < 20; round += 1) {
    const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-loop-'))
    try {
      const ledger = createActivityLedger(home)
      await ledger.load()
      ledger.record({ [`session-${round}`]: 1000 + round })
      await ledger.dispose()
      const reloaded = await createActivityLedger(home).load()
      assert.equal(reloaded[`session-${round}`], 1000 + round)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  }
})

test('harnessHome trims DSH_HOME, resolves relative paths, and falls back on whitespace', () => {
  const previous = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = '   '
    assert.equal(harnessHome(), path.join(os.homedir(), '.dsh'))
    process.env.DSH_HOME = 'relative/activity-home'
    assert.equal(harnessHome(), path.resolve('relative/activity-home'))
    process.env.DSH_HOME = '/tmp/activity-home'
    assert.equal(harnessHome(), '/tmp/activity-home')
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})
