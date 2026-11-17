/**
 * Host half of the suite's `interrupted-sessions` feature.
 *
 * One authenticated route reports whether a Session's last turn was cut off by
 * a Host restart. The answer folds the Session log the first time a browser asks
 * and then follows live `session/event` boundaries, so a row badge stays current
 * without re-reading every log on each request.
 *
 * A parent Session can finish its own turn while delegated subagent Sessions are
 * still running. If the Host restarts in that state, the parent log ends
 * `completed`, yet the delegated work was cut off. The route therefore folds
 * known child Sessions too: an interrupted descendant that was still active
 * after the parent's latest `turn/end` marks the parent as interrupted.
 */

import { randomUUID } from 'node:crypto'
import {
  INTERRUPTED_ROUTE,
  describeInterruption,
  isInterruptedEnd,
  lastEventTime,
  lastTurnEndTime,
  lastTurnStartTime,
  lastTurnState,
  subagentInterruptionAfter
} from './turns.ts'

/** Authenticated route that resumes an interrupted Session implicitly. */
export const CONTINUE_ROUTE = '/api/power-suite.continue'

/** Authenticated SSE route broadcasting interrupted-state invalidations. */
export const INTERRUPTED_EVENTS_ROUTE = '/api/power-suite.interrupted-events'

/** SSE heartbeat interval; comments keep proxies from idling the stream out. */
const EVENT_HEARTBEAT_MS = 25000

/** Cache bound: the route is asked per listed Session, including old ones. */
const MAX_CACHED = 2000
/** Child-session lineage is refreshed at most this often. */
const LINEAGE_TTL_MS = 5000
/** Parent values derived through descendants are cached briefly. */
const DERIVED_TTL_MS = 5000

/**
 * Answer with JSON and a no-store policy: the value changes with the log.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 * @returns {Response} the response.
 */
function sendJson(status: any, payload: any) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Read one Agent's running state without creating it.
 * @param {Record<string, any>} ctx - Host context carrying the Agent registry.
 * @param {string} sessionId - Session to inspect.
 * @returns {boolean} whether a live Agent is running.
 */
function agentRunning(ctx: any, sessionId: any) {
  const agent = ctx.agents.get(sessionId)
  return agent !== undefined && agent.status === 'running'
}

/**
 * The public wire fields of one interruption value.
 * @param {Record<string, any>} value - internal value with timing fields.
 * @returns {Record<string, any>} the wire value.
 */
function toWire(value: any) {
  const { lastStartTime, lastEndTime, lastEventTime: eventTime, interruptedAt, ...wire } = value
  return wire
}

/**
 * Reject a continue request with a stable JSON error.
 * @param {number} status - HTTP status.
 * @param {string} code - stable error code.
 * @param {string} message - human-readable message.
 * @returns {Response} the response.
 */
function sendError(status: any, code: any, message: any) {
  return sendJson(status, { code, message })
}

/**
 * Resume an interrupted Session without recording a human-authored prompt.
 *
 * The Session-controller command path accepts an explicit message source, so
 * this continuation is stored as context with source kind
 * `power-suite-continue`; Chat renders it as a context row and prompt history
 * ignores it. The browser hides that internal row, leaving the continuation
 * implicit while the model still receives a user-role instruction.
 * @param {Record<string, any>} ctx - Host context.
 * @param {Request} request - authenticated request.
 * @returns {Promise<Response>} accepted acknowledgement or a typed failure.
 */
async function handleContinue(ctx: any, request: any, readEffective: any, inFlight: any) {
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.startsWith('application/json')) {
    return sendError(415, 'bad-media-type', 'content-type must be application/json')
  }
  let body
  try {
    body = await request.json()
  } catch {
    return sendError(400, 'bad-request', 'JSON body is required')
  }
  if (body === null || typeof body !== 'object') return sendError(400, 'bad-request', 'JSON object is required')
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const summary = typeof body.summary === 'string' ? body.summary.trim() : ''
  if (sessionId.length === 0 || sessionId.length > 200) return sendError(400, 'bad-request', 'sessionId is required')
  if (prompt.length === 0 || prompt.length > 1000) return sendError(400, 'bad-request', 'prompt must be 1..1000 characters')
  const controller = ctx.get('sessionController')
  if (controller === undefined || typeof controller?.commands?.prompt !== 'function') {
    return sendError(503, 'continue-unavailable', 'Session controller is unavailable')
  }
  if (inFlight.has(sessionId)) {
    return sendError(409, 'continue-in-flight', 'A continuation is already being admitted')
  }
  inFlight.add(sessionId)
  try {
    const state = await readEffective(sessionId)
    if (state.running === true) {
      return sendError(409, 'session-busy', 'The Session is running; cannot continue it')
    }
    if (state.interrupted !== true) {
      return sendError(409, 'session-not-interrupted', 'The Session does not need continuation')
    }
    await controller.commands.prompt({
      requestId: randomUUID(),
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: prompt }]
    }, {
      kind: 'power-suite-continue',
      form: 'notice',
      summary: summary.length > 0 ? summary.slice(0, 120) : 'Continue interrupted task'
    })
  } catch (error: any) {
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code === 'session/not-found' || code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
      return sendError(404, 'session-not-found', 'Session not found')
    }
    if (code === 'session/invalid-time-zone' || code === 'gateway/bad-request') {
      return sendError(400, 'bad-request', typeof error.message === 'string' ? error.message : 'Invalid continue request')
    }
    return sendError(500, 'continue-failed', typeof error?.message === 'string' ? error.message : 'Could not continue the Session')
  } finally {
    inFlight.delete(sessionId)
  }
  return sendJson(200, { accepted: true })
}

/**
 * Register the interruption route and its live cache maintenance.
 * @param {Record<string, any>} ctx - Host context.
 * @returns {void}
 */
export function installInterruptedSessions(ctx: any) {
  const cache = new Map()
  const derived = new Map()
  const epochs = new Map()
  let derivedVersion = 0
  const lineage = {
    at: 0,
    promise: null,
    parentBySession: new Map(),
    childrenByParent: new Map()
  }

  /**
   * Store one computed base value, evicting the oldest insert when full.
   * @param {string} sessionId - Session key.
   * @param {Record<string, any>} value - wire value plus internal timing.
   * @returns {void}
   */
  const remember = (sessionId: any, value: any) => {
    if (cache.size >= MAX_CACHED && !cache.has(sessionId)) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(sessionId, value)
  }

  /**
   * Read one Session's interruption state from its log.
   * @param {string} sessionId - Session to inspect.
   * @returns {Promise<Record<string, any>>} public value plus internal timing fields.
   */
  async function readBase(sessionId: any) {
    const cached = cache.get(sessionId)
    if (cached !== undefined) return cached
    const startEpoch = epochs.get(sessionId) ?? 0
    const snapshot = await ctx.sessionQuery.readSession(sessionId)
    const state = lastTurnState(snapshot.events)
    const running = agentRunning(ctx, sessionId)
    const described = describeInterruption(state, running)
    const eventTime = lastEventTime(snapshot.events)
    const value = {
      ...described,
      lastStartTime: lastTurnStartTime(snapshot.events),
      lastEndTime: lastTurnEndTime(snapshot.events),
      lastEventTime: eventTime,
      interruptedAt: described.interrupted ? eventTime : null
    }
    // A live event may have landed while readSession was awaiting. Never let
    // that older snapshot replace the newer event-handler value in the cache.
    if ((epochs.get(sessionId) ?? 0) === startEpoch) remember(sessionId, value)
    const live = cache.get(sessionId)
    return live ?? value
  }

  /**
   * Load child-session lineage. `listSessions` is body-free and cheap; the
   * promise is shared so a burst of row requests reads it once.
   * @returns {Promise<Record<string, any>>} the lineage state.
   */
  async function loadLineage() {
    if (Date.now() - lineage.at < LINEAGE_TTL_MS) return lineage
    if (lineage.promise !== null) return lineage.promise
    lineage.promise = ctx.sessionQuery.listSessions()
      .then((records: any) => {
        const parentBySession = new Map()
        const childrenByParent = new Map()
        for (const record of Array.isArray(records) ? records : []) {
          const header = record?.header
          if (typeof header?.id !== 'string' || typeof header?.parentSession !== 'string') continue
          parentBySession.set(header.id, header.parentSession)
          const siblings = childrenByParent.get(header.parentSession) ?? []
          siblings.push(header.id)
          childrenByParent.set(header.parentSession, siblings)
        }
        lineage.parentBySession = parentBySession
        lineage.childrenByParent = childrenByParent
        lineage.at = Date.now()
        return lineage
      })
      .catch(() => {
        lineage.parentBySession = new Map()
        lineage.childrenByParent = new Map()
        lineage.at = Date.now()
        return lineage
      })
      .finally(() => {
        lineage.promise = null
      })
    return lineage.promise
  }

  /**
   * Read one Session's effective interruption state, inheriting interrupted
   * descendants that were active after the Session's latest completed turn.
   * @param {string} sessionId - Session to inspect.
   * @param {Set<string>} seen - recursion guard.
   * @returns {Promise<Record<string, any>>} public value plus internal timing fields.
   */
  async function readEffective(sessionId: any, seen = new Set()) {
    if (seen.has(sessionId)) return readBase(sessionId)
    seen.add(sessionId)
    const base = await readBase(sessionId)
    if (base.running === true || base.interrupted === true) return base
    const cached = derived.get(sessionId)
    if (cached !== undefined && Date.now() - cached.at < DERIVED_TTL_MS) return cached.value
    const startVersion = derivedVersion
    let value = base
    try {
      const graph = await loadLineage()
      const children = graph === null ? [] : graph.childrenByParent.get(sessionId) ?? []
      for (const childId of children) {
        const child = await readEffective(childId, new Set(seen))
        if (child.interrupted !== true) continue
        if (!subagentInterruptionAfter(
          base.lastStartTime,
          base.lastEndTime,
          true,
          child.running === true,
          child.lastStartTime,
          child.lastEventTime
        )) continue
        value = {
          ...base,
          interrupted: true,
          reason: typeof child.reason === 'string' ? child.reason : 'interrupted',
          interruptedAt: child.lastStartTime ?? child.lastEventTime,
          subagent: true
        }
        break
      }
    } catch {
      // Without lineage, fall back to the Session's own turn state.
    }
    if (derivedVersion === startVersion) derived.set(sessionId, { at: Date.now(), value })
    return value
  }

  /** One connected SSE tab. */
  interface EventStreamClient {
    readonly closed: boolean
    send(type: string, payload: unknown): boolean
    cleanup(): void
  }

  /** Open SSE clients; one entry per connected browser/tab. */
  const eventClients = new Set<EventStreamClient>()
  const eventEncoder = new TextEncoder()

  ctx.effect(() => ctx.on('session/event', (session: any, event: any) => {
    if (session === null || typeof session !== 'object' || typeof session.id !== 'string') return
    if (event === null || typeof event !== 'object') return
    const time = typeof event.time === 'number' ? event.time : null
    epochs.set(session.id, (epochs.get(session.id) ?? 0) + 1)
    derivedVersion += 1
    const previous = cache.get(session.id)
    if (event.type === 'turn/start') {
      remember(session.id, {
        interrupted: false,
        running: true,
        turn: event.data?.turn ?? null,
        reason: null,
        open: true,
        lastStartTime: time ?? previous?.lastStartTime ?? null,
        lastEndTime: previous?.lastEndTime ?? null,
        lastEventTime: time,
        interruptedAt: null
      })
    } else if (event.type === 'turn/end') {
      const ending = event.data?.reason
      const interrupted = isInterruptedEnd(ending)
      remember(session.id, {
        interrupted,
        running: false,
        turn: null,
        reason: typeof ending?.kind === 'string' ? ending.kind : null,
        open: false,
        lastStartTime: previous?.lastStartTime ?? null,
        lastEndTime: time ?? previous?.lastEndTime ?? null,
        lastEventTime: time,
        interruptedAt: interrupted ? time : null
      })
    }
    derived.clear()
    if (event.type === 'subagent/descriptor') lineage.at = 0
    if (event.type === 'turn/start' || event.type === 'turn/end') {
      const parentSession = typeof session.header?.parentSession === 'string' ? session.header.parentSession : null
      for (const client of [...eventClients]) {
        if (!client.send('interrupted', { sessionId: session.id, parentSession, event: event.type })) {
          eventClients.delete(client)
        }
      }
    }
  }), 'power-suite: interrupted cache')


  const continueInFlight = new Set()

  /**
   * Open one server-sent-events stream for interrupted-state invalidations.
   * The stream starts with a comment/retry hint, then receives one `interrupted`
   * event per turn boundary and a comment heartbeat every 25 s. Cleanup is
   * idempotent and runs on request abort, stream cancel, or Host disposal.
   * @param {Request} request - authenticated stream request.
   * @returns {Response} streaming SSE response.
   */
  function openEventStream(request: any) {
    let client: EventStreamClient | null = null
    const body = new ReadableStream({
      start(controller) {
        let closed = false
        const heartbeat = setInterval(() => {
          if (closed) return
          try {
            controller.enqueue(eventEncoder.encode(': ping\n\n'))
          } catch {
            cleanup()
          }
        }, EVENT_HEARTBEAT_MS)
        const cleanup = () => {
          if (closed) return
          closed = true
          clearInterval(heartbeat)
          if (client !== null) eventClients.delete(client)
          if (request.signal !== null && typeof request.signal.removeEventListener === 'function') {
            request.signal.removeEventListener('abort', cleanup)
          }
          try {
            controller.close()
          } catch {
            // Already closed/cancelled by the peer.
          }
        }
        client = {
          get closed() { return closed },
          send(type, data) {
            if (closed) return false
            try {
              controller.enqueue(eventEncoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
              return true
            } catch {
              cleanup()
              return false
            }
          },
          cleanup
        }
        eventClients.add(client)
        if (request.signal !== null && typeof request.signal.addEventListener === 'function') {
          request.signal.addEventListener('abort', cleanup, { once: true })
        }
        try {
          controller.enqueue(eventEncoder.encode(': connected\nretry: 10000\n\n'))
        } catch {
          cleanup()
        }
      },
      cancel() {
        if (client !== null) client.cleanup()
      }
    })
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no'
      }
    })
  }

  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: INTERRUPTED_EVENTS_ROUTE,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request: any) => openEventStream(request)
    })
    return () => {
      if (typeof dispose === 'function') dispose()
      for (const client of [...eventClients]) {
        try {
          client.cleanup()
        } catch {
          // Best-effort stream teardown on Host disposal.
        }
      }
      eventClients.clear()
    }
  }, `power-suite: interrupted SSE ${INTERRUPTED_EVENTS_ROUTE}`)

  ctx.effect(() => ctx.connection.fetch.register({
    path: CONTINUE_ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request: any) => handleContinue(ctx, request, readEffective, continueInFlight)
  }), `power-suite: continue POST ${CONTINUE_ROUTE}`)

  ctx.effect(() => ctx.connection.fetch.register({
    path: INTERRUPTED_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request: any) => {
      const url = new URL(request.url)
      const sessionId = url.searchParams.get('sessionId')
      if (sessionId === null || sessionId.trim().length === 0) {
        return sendJson(400, { code: 'bad-request', message: 'sessionId is required' })
      }
      const refresh = url.searchParams.get('refresh') === '1'
      if (refresh) {
        cache.delete(sessionId)
        epochs.set(sessionId, (epochs.get(sessionId) ?? 0) + 1)
        derived.clear()
        derivedVersion += 1
        lineage.at = 0
      }
      let value
      try {
        value = await readEffective(sessionId)
      } catch (error: any) {
        const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined
        if (code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
          return sendJson(404, { code: 'session-not-found', message: 'Session not found' })
        }
        return sendJson(500, {
          code: 'interrupted-unavailable',
          message: typeof error?.message === 'string' ? error.message : 'Interruption state unavailable'
        })
      }
      return sendJson(200, { sessionId, ...toWire(value) })
    }
  }), `power-suite: interrupted GET ${INTERRUPTED_ROUTE}`)
}
