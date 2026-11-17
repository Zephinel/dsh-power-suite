/**
 * Host half of the suite's read-acks feature: one authenticated route pair
 * serving the durable read baselines the activity card uses.
 *
 * The document is Host-owned under $DSH_HOME, so every browser and profile
 * using the same DSH home agrees on which Sessions were read, no matter which
 * Mac or browser acknowledged them.
 * Clients keep their localStorage copy as a fast/offline path and merge maxima
 * through this route; a browser with a stale cache simply reads the merged
 * document back.
 */

import os from 'node:os'
import path from 'node:path'
import { READ_ACKS_READ_FAILED, createReadAckStore, isAckBaseline, isSessionId } from './store.js'

/** Route serving and merging the read-acks document. */
export const READ_ACKS_ROUTE = '/api/power-suite.read-acks'

/** Request bodies here are one small JSON object; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Resolve the harness home from `DSH_HOME`, trimming surrounding whitespace and
 * resolving relative paths. An empty/whitespace override falls back to `~/.dsh`.
 * @returns {string} absolute harness home.
 */
export function harnessHome() {
  const configured = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  return configured.length > 0 ? path.resolve(configured) : path.join(os.homedir(), '.dsh')
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
 * @returns {value is Record<string, any>} whether it is a record.
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
 * @param {Record<string, any>} ctx - Host context carrying the connection service.
 * @param {object} [options] - injection points for tests.
 * @param {Record<string, any>} [options.store] - store override with `get`/`record`.
 * @returns {void}
 */
export function installReadAcks(ctx, options = {}) {
  const store = options.store ?? createReadAckStore(harnessHome())
  ctx.effect(() => ctx.connection.fetch.register({
    path: READ_ACKS_ROUTE,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      if (request.method === 'GET') {
        try {
          return sendJson(200, { acked: await store.get() })
        } catch (error) {
          if (error !== null && typeof error === 'object' && error.code === READ_ACKS_READ_FAILED) {
            return sendJson(500, { code: 'store-read-failed', message: 'read acknowledgements could not be read' })
          }
          return sendJson(500, { code: 'store-failed', message: 'read acknowledgements could not be served' })
        }
      }
      const mediaType = String(request.headers.get('content-type') ?? '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase()
      if (mediaType !== 'application/json') {
        return sendJson(415, { code: 'unsupported-media-type', message: 'content-type must be application/json' })
      }
      const text = await request.text()
      // Measure UTF-8 bytes, not UTF-16 code units: a multibyte body must not
      // slip past the 64 KiB request cap.
      if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
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
      let acked
      try {
        acked = await store.record(verdict.value)
      } catch (error) {
        // A read failure means the on-disk marks could not be merged safely; do
        // not overwrite them. The client treats both 5xx shapes as retryable.
        if (error !== null && typeof error === 'object' && error.code === READ_ACKS_READ_FAILED) {
          return sendJson(500, { code: 'store-read-failed', message: 'read acknowledgements could not be read' })
        }
        // A disk/permission failure must keep the documented error contract;
        // the client retries the pending baselines on its next sync cycle.
        return sendJson(500, { code: 'store-failed', message: 'read acknowledgements could not be stored' })
      }
      return sendJson(200, { acked })
    }
  }), `power-suite: read-acks ${READ_ACKS_ROUTE}`)
}
