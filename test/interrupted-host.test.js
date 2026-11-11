import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installInterruptedSessions } from '../src/features/interrupted-sessions/host.js'

/**
 * Build a Host context for the interrupted-sessions feature.
 * @param {object} options - fixture options.
 * @param {Map<string, object[]>} options.logs - Session id → events.
 * @param {Map<string, string | null>} options.parents - Session id → parent id.
 * @param {Set<string>} [options.running] - live running Session ids.
 * @returns {{ ctx: object, route: Function, emit: Function }} the context.
 */
function makeContext({ logs, parents, running = new Set(), controller }) {
  const events = {}
  const routes = new Map()
  const ctx = {
    effect: (fn) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
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
    emit: (sessionId, event) => {
      if (typeof events['session/event'] === 'function') events['session/event']({ id: sessionId }, event)
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
