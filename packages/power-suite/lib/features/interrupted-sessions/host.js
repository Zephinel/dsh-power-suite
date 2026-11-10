/**
 * Host half of the suite's `interrupted-sessions` feature.
 *
 * One authenticated route reports whether a Session's last turn was cut off by
 * a Host restart. The answer folds the Session log the first time a browser asks
 * and then follows live `session/event` boundaries, so a row badge stays current
 * without re-reading every log on each request.
 */

import { INTERRUPTED_ROUTE, describeInterruption, isInterruptedEnd, lastTurnState } from './turns.js'

/** Cache bound: the route is asked per listed Session, including old ones. */
const MAX_CACHED = 2000

/**
 * Answer with JSON and a no-store policy: the value changes with the log.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 * @returns {Response} the response.
 */
function sendJson(status, payload) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Read one Agent's running state without creating it.
 * @param {object} ctx - Host context carrying the Agent registry.
 * @param {string} sessionId - Session to inspect.
 * @returns {boolean} whether a live Agent is running.
 */
function agentRunning(ctx, sessionId) {
  const agent = ctx.agents.get(sessionId)
  return agent !== undefined && agent.status === 'running'
}

/**
 * Read one Session's interruption state from its log.
 * @param {object} ctx - Host context.
 * @param {string} sessionId - Session to inspect.
 * @returns {Promise<object>} the wire value.
 */
async function readInterruption(ctx, sessionId) {
  const snapshot = await ctx.sessionQuery.readSession(sessionId)
  const state = lastTurnState(snapshot.events)
  return describeInterruption(state, agentRunning(ctx, sessionId))
}

/**
 * Register the interruption route and its live cache maintenance.
 * @param {object} ctx - Host context.
 * @returns {void}
 */
export function installInterruptedSessions(ctx) {
  const cache = new Map()

  /**
   * Store one computed value, evicting the oldest insert when full.
   * @param {string} sessionId - Session key.
   * @param {object} value - wire value.
   * @returns {void}
   */
  const remember = (sessionId, value) => {
    if (cache.size >= MAX_CACHED && !cache.has(sessionId)) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(sessionId, value)
  }

  ctx.effect(() => ctx.on('session/event', (session, event) => {
    if (session === null || typeof session !== 'object' || typeof session.id !== 'string') return
    if (event === null || typeof event !== 'object') return
    if (event.type === 'turn/start') {
      remember(session.id, { interrupted: false, running: true, turn: event.data?.turn ?? null, reason: null, open: true })
    } else if (event.type === 'turn/end') {
      const ending = event.data?.reason
      remember(session.id, {
        interrupted: isInterruptedEnd(ending),
        running: false,
        turn: null,
        reason: typeof ending?.kind === 'string' ? ending.kind : null,
        open: false
      })
    }
  }), 'power-suite: interrupted cache')


  ctx.effect(() => ctx.connection.fetch.register({
    path: INTERRUPTED_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const url = new URL(request.url)
      const sessionId = url.searchParams.get('sessionId')
      if (sessionId === null || sessionId.trim().length === 0) {
        return sendJson(400, { code: 'bad-request', message: 'sessionId is required' })
      }
      const refresh = url.searchParams.get('refresh') === '1'
      if (!refresh) {
        const cached = cache.get(sessionId)
        if (cached !== undefined) return sendJson(200, { sessionId, ...cached })
      }
      let value
      try {
        value = await readInterruption(ctx, sessionId)
      } catch (error) {
        const code = error !== null && typeof error === 'object' ? error.code : undefined
        if (code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
          return sendJson(404, { code: 'session-not-found', message: 'Session not found' })
        }
        return sendJson(500, {
          code: 'interrupted-unavailable',
          message: typeof error?.message === 'string' ? error.message : 'Interruption state unavailable'
        })
      }
      remember(sessionId, value)
      return sendJson(200, { sessionId, ...value })
    }
  }), `power-suite: interrupted GET ${INTERRUPTED_ROUTE}`)
}
