import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  SESSION_ACTIVITY_ROUTE,
  SESSION_ACTIVITY_TTL_MS,
  cachedLastMessageTime,
  collectSessionActivity,
  createProjectionCacheReader,
  installSessionActivity,
  readCachedDocumentActivity
} from '../src/features/session-activity/host.js'

/**
 * One listed Session record.
 * @param {object} header - header fields.
 * @param {boolean} [live] - live flag.
 * @returns {{ header: object, live: boolean, persisted: boolean }} the record.
 */
function record(header, live = false) {
  return { header: { isSeeded: false, ...header }, live, persisted: true }
}

/**
 * Build a projection-cache fake from per-Session last-message times.
 * @param {Record<string, number | null | undefined>} times - id → time.
 * @returns {object} the fake `sessionProjectionCache` service.
 */
function fakeCache(times) {
  return {
    cachedSnapshot(meta, keys) {
      assert.deepEqual(keys, ['timeContext'])
      const time = times[meta.id]
      if (time === undefined) return undefined
      return { asOfSeq: 1, values: { timeContext: { lastMessageTime: time } } }
    }
  }
}

/**
 * Build a Host context that records the session-activity route.
 * @param {object} options - fixture pieces.
 * @param {Array<object>} [options.records] - listSessions result.
 * @param {object} [options.cache] - projection-cache fake.
 * @param {Error} [options.listError] - when set, listSessions rejects.
 * @returns {{ ctx: object, routes: Map<string, object>, calls: { list: number } }} fixture.
 */
function makeContext({ records = [], cache, listError } = {}) {
  const routes = new Map()
  const calls = { list: 0 }
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
    },
    sessionQuery: {
      async listSessions() {
        calls.list += 1
        if (listError !== undefined) throw listError
        return records
      }
    },
    get(name) {
      return name === 'sessionProjectionCache' ? cache : undefined
    }
  }
  return { ctx, routes, calls }
}

test('cachedLastMessageTime tolerates missing cache, values, and errors', () => {
  assert.equal(cachedLastMessageTime(undefined, { id: 'a' }), null)
  assert.equal(cachedLastMessageTime({}, { id: 'a' }), null)
  assert.equal(cachedLastMessageTime(fakeCache({}), { id: 'a' }), null)
  assert.equal(cachedLastMessageTime(fakeCache({ a: null }), { id: 'a' }), null)
  assert.equal(cachedLastMessageTime(fakeCache({ a: 'nope' }), { id: 'a' }), null)
  assert.equal(cachedLastMessageTime(fakeCache({ a: 1234 }), { id: 'a' }), 1234)
  assert.equal(cachedLastMessageTime({ cachedSnapshot: () => { throw new Error('broken') } }, { id: 'a' }), null)
})

test('collectSessionActivity reports max(cache, header) per Session and includes subagents', async () => {
  const records = [
    record({ id: 'session-cached', createdAt: 100 }),
    record({ id: 'session-header', createdAt: 200 }),
    record({ id: 'session-updated', createdAt: 100, updatedAt: 400 }),
    record({ id: 'session-subagent', createdAt: 300, origin: 'subagent', parentSession: 'session-cached' }),
    record({ id: 'session-empty' })
  ]
  const { ctx } = makeContext({
    records,
    cache: fakeCache({
      'session-cached': 500,
      'session-header': 150,
      'session-subagent': 250
    })
  })
  assert.deepEqual(await collectSessionActivity(ctx, { readCachedDocument: async () => null }), {
    'session-cached': 500,
    'session-header': 200,
    'session-updated': 400,
    'session-subagent': 300
  })
})

test('collectSessionActivity works without the projection-cache service', async () => {
  const { ctx } = makeContext({
    records: [record({ id: 'session-a', createdAt: 100 }), record({ id: 'session-b', createdAt: 300, updatedAt: 200 })]
  })
  assert.deepEqual(await collectSessionActivity(ctx, { readCachedDocument: async () => null }), { 'session-a': 100, 'session-b': 300 })
})

test('session-activity route serves the map with no-store and reuses the short cache', async () => {
  const records = [record({ id: 'session-442a', createdAt: 1000 })]
  const { ctx, routes, calls } = makeContext({
    records,
    cache: fakeCache({ 'session-442a': 1794423139284 })
  })
  installSessionActivity(ctx, { readCachedDocument: async () => 1794423139284 })
  const route = routes.get(SESSION_ACTIVITY_ROUTE)
  assert.deepEqual(route.methods, ['GET'])
  assert.equal(route.requestBody, 'buffered')

  const first = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await first.json(), { sessions: { 'session-442a': 1794423139284 } })
  assert.equal(calls.list, 1)

  const second = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
  assert.deepEqual(await second.json(), { sessions: { 'session-442a': 1794423139284 } })
  assert.equal(calls.list, 1, 'a second request inside the TTL must not list again')
  assert.ok(SESSION_ACTIVITY_TTL_MS >= 5000 && SESSION_ACTIVITY_TTL_MS <= 10000)
})

test('session-activity route degrades to an empty map with 200 when listing fails', async () => {
  const { ctx, routes, calls } = makeContext({ listError: new Error('corpus down') })
  installSessionActivity(ctx, { readCachedDocument: async () => null })
  const route = routes.get(SESSION_ACTIVITY_ROUTE)
  const first = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await first.json(), { sessions: {} })
  // Failures are not cached: the next poll retries.
  const second = await route.fetch(new Request('http://host/api/power-suite.session-activity'))
  assert.deepEqual(await second.json(), { sessions: {} })
  assert.equal(calls.list, 2)
})

test('readCachedDocumentActivity extracts the timeContext row and tolerates corruption', () => {
  const document = JSON.stringify({
    version: 7,
    record: { rows: { timeContext: { ver: 3, seq: 1836, val: { lastMessageTime: 1794423139036 } } } }
  })
  assert.equal(readCachedDocumentActivity(document), 1794423139036)
  assert.equal(readCachedDocumentActivity('{broken'), null)
  assert.equal(readCachedDocumentActivity(''), null)
  assert.equal(readCachedDocumentActivity(JSON.stringify({ version: 7, record: { rows: {} } })), null)
  assert.equal(readCachedDocumentActivity(JSON.stringify({ version: 7, record: { rows: { timeContext: { val: { lastMessageTime: null } } } } })), null)
})

test('createProjectionCacheReader reads timeContext from the per-record cache document and re-reads on change', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ps-activity-'))
  try {
    const directory = path.join(home, 'storages', 'session_projcache', 'sessions')
    await mkdir(directory, { recursive: true })
    const file = path.join(directory, 'session-442a0000-e8e9-4f56-8d43-583e63c9b79d.json')
    await writeFile(file, JSON.stringify({
      version: 7,
      record: { rows: { timeContext: { ver: 3, seq: 10, val: { lastMessageTime: 1000 } } } }
    }), 'utf8')
    const reader = createProjectionCacheReader(home)
    assert.equal(await reader('session-442a0000-e8e9-4f56-8d43-583e63c9b79d'), 1000)
    // Same document/mtime: the cached value is reused.
    assert.equal(await reader('session-442a0000-e8e9-4f56-8d43-583e63c9b79d'), 1000)
    await writeFile(file, JSON.stringify({
      version: 7,
      record: { rows: { timeContext: { ver: 3, seq: 20, val: { lastMessageTime: 2000 } } } }
    }), 'utf8')
    const future = new Date(Date.now() + 2000)
    await utimes(file, future, future)
    assert.equal(await reader('session-442a0000-e8e9-4f56-8d43-583e63c9b79d'), 2000)
    assert.equal(await reader('session-missing'), null)
    assert.equal(await reader('../etc/passwd'), null)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
