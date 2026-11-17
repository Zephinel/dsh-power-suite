/**
 * Host half of the suite's running-card pins: one authenticated route pair
 * serving the pinned main-Session ids the "Running & recent" card keeps on top.
 *
 * The document is Host-owned under $DSH_HOME, so every browser and profile
 * using the same DSH home (i.e. every paired device) agrees on the pinned set.
 * Clients keep a local cache for the first paint and offline use, queue small
 * idempotent operations, and merge the Host document back through this route.
 */

import { SESSION_PINS_READ_FAILED, createSessionPinStore, validatePinOps } from './store.ts'
import { harnessHome } from '../read-acks/host.ts'

/** Route serving and applying the session-pins document. */
export const SESSION_PINS_ROUTE = '/api/power-suite.session-pins'

/** Request bodies here are one small JSON object; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Answer with JSON and a no-store policy: the document is live state.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 * @returns {Response} the response.
 */
function sendJson(status: any, payload: any) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Narrow parsed JSON to a plain object.
 * @param {unknown} value - decoded value.
 * @returns {value is Record<string, any>} whether it is a record.
 */
function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate one apply request body.
 * @param {unknown} body - decoded request body.
 * @returns {{ ok: true, ops: Array<object> } | { ok: false, message: string }} accepted operations or a failure.
 */
export function validatePinApplyBody(body: any) {
  if (!isRecord(body)) return { ok: false, message: 'request body must be one JSON object' }
  return validatePinOps(body.ops)
}

/**
 * Register the session-pins route inside Connection's authentication fence.
 * @param {Record<string, any>} ctx - Host context carrying the connection service.
 * @param {object} [options] - injection points for tests.
 * @param {Record<string, any>} [options.store] - store override with `get`/`apply`.
 * @returns {void}
 */
export function installSessionPins(
  ctx: any,
  options: { store?: ReturnType<typeof createSessionPinStore> } = {}
) {
  const store = options.store ?? createSessionPinStore(harnessHome())
  ctx.effect(() => ctx.connection.fetch.register({
    path: SESSION_PINS_ROUTE,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request: any) => {
      if (request.method === 'GET') {
        try {
          return sendJson(200, await store.get())
        } catch (error: any) {
          if (error !== null && typeof error === 'object' && error.code === SESSION_PINS_READ_FAILED) {
            return sendJson(500, { code: 'store-read-failed', message: 'pinned sessions could not be read' })
          }
          return sendJson(500, { code: 'store-failed', message: 'pinned sessions could not be served' })
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
      const verdict = validatePinApplyBody(body)
      if (verdict.ok === false) {
        return sendJson(400, { code: 'bad-request', message: verdict.message })
      }
      try {
        return sendJson(200, await store.apply(verdict.ops))
      } catch (error: any) {
        if (error !== null && typeof error === 'object' && error.code === SESSION_PINS_READ_FAILED) {
          return sendJson(500, { code: 'store-read-failed', message: 'pinned sessions could not be read' })
        }
        return sendJson(500, { code: 'store-failed', message: 'pinned sessions could not be stored' })
      }
    }
  }), `power-suite: session-pins ${SESSION_PINS_ROUTE}`)
}
