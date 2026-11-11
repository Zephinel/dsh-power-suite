/**
 * Host half of the suite's read-acks feature: one authenticated route pair
 * serving the durable, profile-wide read baselines the activity card uses.
 *
 * The document is Host-owned so every browser of the same DSH profile agrees on
 * which Sessions were read, no matter which Mac or browser acknowledged them.
 * Clients keep their localStorage copy as a fast/offline path and merge maxima
 * through this route; a browser with a stale cache simply reads the merged
 * document back.
 */

import os from 'node:os'
import path from 'node:path'
import { createReadAckStore, isAckBaseline, isSessionId } from './store.js'

/** Route serving and merging the read-acks document. */
export const READ_ACKS_ROUTE = '/api/power-suite.read-acks'

/** Request bodies here are one small JSON object; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * The harness home this process uses.
 * @returns {string} absolute harness home.
 */
function harnessHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.length > 0) return configured
  return path.join(os.homedir(), '.dsh')
}

/**
 * Answer with JSON and a no-store policy: the document is live state.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 * @returns {Response} the response.
 */
function sendJson(status, payload) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Narrow parsed JSON to a plain object.
 * @param {unknown} value - decoded value.
 * @returns {boolean} whether it is a record.
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate one merge request body.
 * @param {unknown} body - decoded request body.
 * @returns {{ ok: true, value: Record<string, number> } | { ok: false, message: string }} accepted entries or a failure.
 */
export function validateReadAckBody(body) {
  if (!isRecord(body)) return { ok: false, message: 'request body must be one JSON object' }
  if (!isRecord(body.acked)) return { ok: false, message: '"acked" must be one JSON object' }
  const acked = {}
  for (const [id, baseline] of Object.entries(body.acked)) {
    if (!isSessionId(id)) return { ok: false, message: `invalid Session id "${String(id).slice(0, 40)}"` }
    if (!isAckBaseline(baseline)) return { ok: false, message: `invalid baseline for "${id}"` }
    acked[id] = baseline
  }
  return { ok: true, value: acked }
}

/**
 * Register the read-acks route inside Connection's authentication fence.
 * @param {object} ctx - Host context carrying the connection service.
 * @returns {void}
 */
export function installReadAcks(ctx) {
  const store = createReadAckStore(harnessHome())
  ctx.effect(() => ctx.connection.fetch.register({
    path: READ_ACKS_ROUTE,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      if (request.method === 'GET') {
        return sendJson(200, { acked: await store.get() })
      }
      const mediaType = String(request.headers.get('content-type') ?? '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase()
      if (mediaType !== 'application/json') {
        return sendJson(415, { code: 'unsupported-media-type', message: 'content-type must be application/json' })
      }
      const text = await request.text()
      if (text.length > MAX_BODY_BYTES) {
        return sendJson(413, { code: 'too-large', message: 'request body is too large' })
      }
      let body
      try {
        body = JSON.parse(text)
      } catch {
        return sendJson(400, { code: 'bad-request', message: 'request body is not JSON' })
      }
      const verdict = validateReadAckBody(body)
      if (verdict.ok === false) {
        return sendJson(400, { code: 'bad-request', message: verdict.message })
      }
      return sendJson(200, { acked: await store.record(verdict.value) })
    }
  }), `power-suite: read-acks ${READ_ACKS_ROUTE}`)
}
