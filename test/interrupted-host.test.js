import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INTERRUPTED_EVENTS_ROUTE, installInterruptedSessions } from '../src/features/interrupted-sessions/host.ts'

/**
 * Build a Host context for the interrupted-sessions feature.
 * @param {object} options - fixture options.
 * @param {Map<string, object[]>} options.logs - Session id → events.
 * @param {Map<string, string | null>} options.parents - Session id → parent id.
 * @param {Set<string>} [options.running] - live running Session ids.
 * @returns {{ ctx: object, route: Function, emit: Function }} the context.
 */
function makeContext({ logs, parents, running = new Set(), controller, readSession }) {
  const events = {}
  const routes = new Map()
  const disposers = []
  const ctx = {
    effect: (fn) => {
      const dispose = fn()
      const run = typeof dispose === 'function' ? dispose : () => {}
      disposers.push(run)
      return run
    },
    on: (name, handler) => {
      events[name] = handler
      return () => {}
    },
    get: (name) => (name === 'sessionController' ? controller : undefined),
    connection: {
      fetch: {
        register: (definition) => {
          routes.set(definition.path, definition)
          return () => {}
        }
      }
    },
    sessionQuery: {
      async readSession(sessionId) {
        if (typeof readSession === 'function') return readSession(sessionId)
        const log = logs.get(sessionId)
        if (log === undefined) {
          const error = new Error('Session not found')
          error.code = 'SESSION_QUERY_SESSION_NOT_FOUND'
          throw error
        }
        return { session: { id: sessionId }, events: log }
      },
      async listSessions() {
        return [...logs.keys()].map((id) => ({
          header: {
            id,
            parentSession: parents.get(id) ?? undefined
          }
        }))
      }
    },
    agents: {
      get: (sessionId) => (running.has(sessionId) ? { status: 'running' } : undefined)
    }
  }
  installInterruptedSessions(ctx)
  return {
    ctx,
    route: routes.get('/api/power-suite.interrupted'),
    continueRoute: routes.get('/api/power-suite.continue'),
    eventsRoute: routes.get(INTERRUPTED_EVENTS_ROUTE),
    disposeAll: () => {
      for (const dispose of disposers.reverse()) dispose()
    },
    emit: (sessionId, event, options = {}) => {
      const session = { id: sessionId }
      if (options.header !== undefined) session.header = options.header
      if (typeof events['session/event'] === 'function') events['session/event'](session, event)
    }
  }
}

/**
 * Read one Session through the registered route.
 * @param {Function} route - route definition.
 * @param {string} sessionId - Session id.
 * @returns {Promise<object>} JSON payload.
 */
async function read(route, sessionId) {
  const response = await route.fetch(new Request(`http://localhost/api/power-suite.interrupted?sessionId=${encodeURIComponent(sessionId)}`))
  return response.json()
}

const turnStart = (turn, time, seq = 0) => ({ type: 'turn/start', seq, time, data: { turn } })
const turnEnd = (turn, time, kind, cause, seq = 1) => ({
  type: 'turn/end',
  seq,
  time,
  data: { turn, reason: cause === undefined ? { kind } : { kind, reason: { kind: cause } } }
})
const turnEndError = (turn, time, error, seq = 1) => ({
  type: 'turn/end',
  seq,
  time,
  data: { turn, reason: { kind: 'error', error } }
})

test('an interrupted subagent still active after the parent turn marks the parent', async () => {
  const logs = new Map([
    ['session-parent', [turnStart(1, 1000), turnEnd(1, 2000, 'completed')]],
    ['child-a', [turnStart(1, 2500)]]
  ])
  const parents = new Map([['session-parent', null], ['child-a', 'session-parent']])
  const { route } = makeContext({ logs, parents })
  const payload = await read(route, 'session-parent')
  assert.equal(payload.interrupted, true)
  assert.equal(payload.subagent, true)
})

test('a completed or pre-parent interrupted child does not mark the parent', async () => {
  const completed = new Map([
    ['session-parent', [turnStart(1, 1000), turnEnd(1, 2000, 'completed')]],
    ['child-done', [turnStart(1, 2500), turnEnd(1, 2600, 'completed', undefined, 2)]],
    ['child-old', [turnStart(1, 500), turnEnd(1, 1500, 'interrupted')]]
  ])
  const parents = new Map([
    ['session-parent', null],
    ['child-done', 'session-parent'],
    ['child-old', 'session-parent']
  ])
  const { route } = makeContext({ logs: completed, parents })
  const payload = await read(route, 'session-parent')
  assert.equal(payload.interrupted, false)
})

test('a running subagent is live work, not an interruption', async () => {
  const logs = new Map([
    ['session-parent', [turnStart(1, 1000), turnEnd(1, 2000, 'completed')]],
    ['child-live', [turnStart(1, 2500)]]
  ])
  const parents = new Map([['session-parent', null], ['child-live', 'session-parent']])
  const { route } = makeContext({ logs, parents, running: new Set(['child-live']) })
  const payload = await read(route, 'session-parent')
  assert.equal(payload.interrupted, false)
})

test('the parent keeps its own Harness-caused interruption', async () => {
  const logs = new Map([
    ['session-parent', [turnStart(1, 1000), turnEnd(1, 2000, 'aborted', 'disposed')]]
  ])
  const parents = new Map([['session-parent', null]])
  const { route } = makeContext({ logs, parents })
  const payload = await read(route, 'session-parent')
  assert.equal(payload.interrupted, true)
  assert.equal(payload.reason, 'aborted')
})

test('a child event invalidates the parent-derived value', async () => {
  const logs = new Map([
    ['session-parent', [turnStart(1, 1000), turnEnd(1, 2000, 'completed')]],
    ['child-a', [turnStart(1, 500), turnEnd(1, 1500, 'completed')]]
  ])
  const parents = new Map([['session-parent', null], ['child-a', 'session-parent']])
  const { route, emit } = makeContext({ logs, parents })
  assert.equal((await read(route, 'session-parent')).interrupted, false)

  // The child starts a new turn after the parent completed: it is now live and
  // then gets cut off. Emitting the start invalidates the derived cache.
  emit('child-a', turnStart(1, 2500, 10))
  logs.set('child-a', [turnStart(1, 2500, 10)])
  assert.equal((await read(route, 'session-parent')).interrupted, false)
  emit('child-a', turnEnd(1, 3000, 'aborted', 'disposed', 11))
  logs.set('child-a', [turnStart(1, 2500, 10), turnEnd(1, 3000, 'aborted', 'disposed', 11)])
  assert.equal((await read(route, 'session-parent')).interrupted, true)
})


test('a provider quota error leaves the Session resumable', async () => {
  const logs = new Map([
    ['session-quota', [
      turnStart(1, 1000),
      turnEndError(1, 2000, { code: 'QUOTA', message: '429: OpenCode Go usage limit reached' })
    ]]
  ])
  const parents = new Map([['session-quota', null]])
  const controller = { commands: { async prompt() { return { accepted: true } } } }
  const { route, continueRoute } = makeContext({ logs, parents, controller })
  const payload = await read(route, 'session-quota')
  assert.equal(payload.interrupted, true)
  assert.equal(payload.reason, 'error')
  const response = await continueRoute.fetch(new Request('http://localhost/api/power-suite.continue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-quota', prompt: 'Continue the interrupted task.' })
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { accepted: true })
})

test('any model/network/timeout error is resumable, not a final failure', async () => {
  const logs = new Map([
    ['session-error', [
      turnStart(1, 1000),
      turnEndError(1, 2000, { code: 'SERVER_ERROR', message: 'upstream exploded' })
    ]]
  ])
  const parents = new Map([['session-error', null]])
  const { route } = makeContext({ logs, parents })
  const payload = await read(route, 'session-error')
  assert.equal(payload.interrupted, true)
  assert.equal(payload.reason, 'error')
})

test('a transport timeout and max-tokens ending are resumable', async () => {
  const logs = new Map([
    ['session-timeout', [turnStart(1, 1000), turnEndError(1, 2000, { code: 'TRANSPORT', message: 'Connection error.' })]],
    ['session-max', [turnStart(1, 1000), { type: 'turn/end', seq: 1, time: 2000, data: { turn: 1, reason: { kind: 'max-tokens' } } }]]
  ])
  const parents = new Map([['session-timeout', null], ['session-max', null]])
  const { route } = makeContext({ logs, parents })
  assert.equal((await read(route, 'session-timeout')).interrupted, true)
  assert.equal((await read(route, 'session-max')).interrupted, true)
})

test('the live quota turn/end updates the interrupted cache', async () => {
  const logs = new Map([['session-live', [turnStart(1, 1000)]]])
  const parents = new Map([['session-live', null]])
  const { route, emit } = makeContext({ logs, parents })
  emit('session-live', turnEndError(1, 2000, { code: 'QUOTA', message: 'usage limit reached' }))
  const payload = await read(route, 'session-live')
  assert.equal(payload.interrupted, true)
  assert.equal(payload.reason, 'error')
})

test('the continue route resumes through a non-human context source', async () => {
  const calls = []
  const controller = {
    commands: {
      async prompt(request, source) {
        calls.push({ request, source })
        return { accepted: true }
      }
    }
  }
  const logs = new Map([['session-parent', [turnStart(1, 1000), turnEnd(1, 2000, 'interrupted')]]])
  const parents = new Map([['session-parent', null]])
  const { continueRoute } = makeContext({ logs, parents, controller })
  const response = await continueRoute.fetch(new Request('http://localhost/api/power-suite.continue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-parent', prompt: 'Continue the interrupted task.', summary: 'Continue task' })
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { accepted: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].request.sessionId, 'session-parent')
  assert.equal(calls[0].request.mode, 'queue')
  assert.deepEqual(calls[0].request.content, [{ type: 'text', text: 'Continue the interrupted task.' }])
  assert.equal(calls[0].source.kind, 'power-suite-continue')
  assert.equal(calls[0].source.form, 'notice')
  assert.equal(calls[0].source.summary, 'Continue task')
})

test('the continue route fails cleanly without a session controller', async () => {
  const logs = new Map([['session-parent', [turnStart(1, 1000)]]])
  const parents = new Map([['session-parent', null]])
  const { continueRoute } = makeContext({ logs, parents })
  const response = await continueRoute.fetch(new Request('http://localhost/api/power-suite.continue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-parent', prompt: 'continue' })
  }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'continue-unavailable')
})

test('the continue route rejects empty prompts', async () => {
  const logs = new Map([['session-parent', []]])
  const parents = new Map([['session-parent', null]])
  const { continueRoute } = makeContext({ logs, parents })
  const response = await continueRoute.fetch(new Request('http://localhost/api/power-suite.continue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-parent', prompt: '   ' })
  }))
  assert.equal(response.status, 400)
})


test('a silent child that started during the parent turn marks the parent', async () => {
  const logs = new Map([
    ['session-parent', [turnStart(1, 1000), turnEnd(1, 2000, 'completed')]],
    ['child-silent', [turnStart(1, 1500)]]
  ])
  const parents = new Map([['session-parent', null], ['child-silent', 'session-parent']])
  const { route } = makeContext({ logs, parents })
  const payload = await read(route, 'session-parent')
  assert.equal(payload.interrupted, true)
  assert.equal(payload.subagent, true)
})

test('a read that resolves after a newer turn/end does not cache the stale snapshot', async () => {
  let resolveRead
  const readSession = (sessionId) => new Promise((resolve) => {
    resolveRead = () => resolve({
      session: { id: sessionId },
      // Deliberately stale: open turn with no end yet.
      events: [turnStart(1, 1000)]
    })
  })
  const logs = new Map([['session-parent', [turnStart(1, 1000)]]])
  const parents = new Map([['session-parent', null]])
  const { route, emit } = makeContext({ logs, parents, readSession })
  const pending = read(route, 'session-parent')
  await new Promise((resolve) => setTimeout(resolve, 5))
  // The turn completes while readSession is still awaiting.
  emit('session-parent', turnEnd(1, 2000, 'completed'))
  resolveRead()
  const payload = await pending
  assert.equal(payload.interrupted, false)
  assert.equal(payload.open, false)
})


test('the continue route requires application/json', async () => {
  const controller = { commands: { async prompt() { return { accepted: true } } } }
  const logs = new Map([['session-parent', [turnStart(1, 1000), turnEnd(1, 2000, 'interrupted')]]])
  const parents = new Map([['session-parent', null]])
  const { continueRoute } = makeContext({ logs, parents, controller })
  const response = await continueRoute.fetch(new Request('http://localhost/api/power-suite.continue', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ sessionId: 'session-parent', prompt: 'continue' })
  }))
  assert.equal(response.status, 415)
})

test('the continue route refuses a Session that is not interrupted', async () => {
  const calls = []
  const controller = { commands: { async prompt(request) { calls.push(request); return { accepted: true } } } }
  const logs = new Map([['session-parent', [turnStart(1, 1000), turnEnd(1, 2000, 'completed')]]])
  const parents = new Map([['session-parent', null]])
  const { continueRoute } = makeContext({ logs, parents, controller })
  const response = await continueRoute.fetch(new Request('http://localhost/api/power-suite.continue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-parent', prompt: 'continue' })
  }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'session-not-interrupted')
  assert.equal(calls.length, 0)
})

test('the continue route refuses a running Session', async () => {
  const controller = { commands: { async prompt() { return { accepted: true } } } }
  const logs = new Map([['session-parent', [turnStart(1, 1000)]]])
  const parents = new Map([['session-parent', null]])
  const { continueRoute } = makeContext({ logs, parents, controller, running: new Set(['session-parent']) })
  const response = await continueRoute.fetch(new Request('http://localhost/api/power-suite.continue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-parent', prompt: 'continue' })
  }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'session-busy')
})

test('a second concurrent continue is rejected while the first is admitting', async () => {
  let release
  const admitted = new Promise((resolve) => { release = resolve })
  const controller = { commands: { async prompt() { await admitted; return { accepted: true } } } }
  const logs = new Map([['session-parent', [turnStart(1, 1000), turnEnd(1, 2000, 'interrupted')]]])
  const parents = new Map([['session-parent', null]])
  const { continueRoute } = makeContext({ logs, parents, controller })
  const request = () => continueRoute.fetch(new Request('http://localhost/api/power-suite.continue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-parent', prompt: 'continue' })
  }))
  const first = request()
  await new Promise((resolve) => setTimeout(resolve, 5))
  const second = await request()
  assert.equal(second.status, 409)
  assert.equal((await second.json()).code, 'continue-in-flight')
  release()
  assert.equal((await first).status, 200)
})

/**
 * Read the next SSE chunk from a stream reader.
 * @param {ReadableStreamDefaultReader<Uint8Array>} reader - stream reader.
 * @returns {Promise<string>} decoded chunk.
 */
async function readSseChunk(reader) {
  const chunk = await reader.read()
  assert.equal(chunk.done, false, 'SSE stream closed unexpectedly')
  return new TextDecoder().decode(chunk.value)
}

test('the interrupted SSE route streams connected, boundary events, parentSession, and closes cleanly', async () => {
  const logs = new Map([['session-sse', [turnStart(1, 1000)]]])
  const parents = new Map([['session-sse', 'session-parent']])
  const { eventsRoute, emit, disposeAll } = makeContext({ logs, parents })
  assert.equal(typeof eventsRoute, 'object', 'event route is registered')
  assert.deepEqual(eventsRoute.methods, ['GET'])
  const controller = new AbortController()
  let reader = null
  try {
    const response = await eventsRoute.fetch(new Request('http://localhost/api/power-suite.interrupted-events', { signal: controller.signal }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-accel-buffering'), 'no')
    reader = response.body.getReader()
    const connected = await readSseChunk(reader)
    assert.ok(connected.includes(': connected'), connected)
    assert.ok(connected.includes('retry: 10000'), connected)

    // Non-boundary events must not emit anything.
    let pendingRead = reader.read().then((result) => ({ result }))
    const timedOut = await Promise.race([
      pendingRead.then(() => false),
      new Promise((resolve) => setTimeout(() => resolve(true), 60))
    ])
    assert.equal(timedOut, true, 'non-boundary event produced an SSE frame')
    // The pending read now consumes the next boundary frame.
    emit('session-sse', turnStart(2, 2000), { header: { parentSession: 'session-parent' } })
    const startChunk = new TextDecoder().decode((await pendingRead).result.value)
    assert.ok(startChunk.includes('event: interrupted'), startChunk)
    const startPayload = JSON.parse(startChunk.split('data: ')[1].split('\n')[0])
    assert.deepEqual(startPayload, { sessionId: 'session-sse', parentSession: 'session-parent', event: 'turn/start' })

    const endChunkPromise = readSseChunk(reader)
    emit('session-sse', turnEnd(2, 3000, 'completed'))
    const endChunk = await endChunkPromise
    assert.ok(endChunk.includes('event: interrupted'), endChunk)
    const endPayload = JSON.parse(endChunk.split('data: ')[1].split('\n')[0])
    assert.deepEqual(endPayload, { sessionId: 'session-sse', parentSession: null, event: 'turn/end' })

    // Abort must stop the heartbeat/stream without throwing or hanging.
    controller.abort()
    const finalChunk = await Promise.race([
      reader.read().then((result) => result).catch(() => ({ done: true })),
      new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 200))
    ])
    assert.notEqual(finalChunk.timedOut, true, 'aborted SSE stream did not close')
    assert.equal(finalChunk.done, true)
  } finally {
    if (reader !== null) await reader.cancel().catch(() => {})
    controller.abort()
    disposeAll()
  }
})

test('Host disposal closes open SSE clients without throwing', async () => {
  const logs = new Map([['session-dispose', [turnStart(1, 1000)]]])
  const parents = new Map([['session-dispose', null]])
  const { eventsRoute, disposeAll } = makeContext({ logs, parents })
  let reader = null
  try {
    const response = await eventsRoute.fetch(new Request('http://localhost/api/power-suite.interrupted-events'))
    reader = response.body.getReader()
    assert.ok((await readSseChunk(reader)).includes(': connected'))
    disposeAll()
    const finalChunk = await Promise.race([
      reader.read().then((result) => result).catch(() => ({ done: true })),
      new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 200))
    ])
    assert.notEqual(finalChunk.timedOut, true, 'Host-disposed SSE stream did not close')
    assert.equal(finalChunk.done, true)
  } finally {
    if (reader !== null) await reader.cancel().catch(() => {})
  }
})
