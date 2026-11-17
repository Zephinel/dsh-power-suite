/**
 * Host half of the suite's persisted sidebar width: one authenticated route
 * pair serving the scalar width document.
 *
 * The shell keeps the left sidebar width only in memory, so the Host owns the
 * durable value under $DSH_HOME and every browser and profile using the same
 * DSH home (i.e. every paired device) agrees on it. Clients keep a localStorage
 * cache for the first paint and write the dragged width through this route.
 */

import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_READ_FAILED,
  createSidebarWidthStore,
  isSidebarWidth
} from './store.ts'
import { harnessHome } from '../read-acks/host.ts'

/** Route serving and storing the sidebar-width document. */
export const SIDEBAR_WIDTH_ROUTE = '/api/power-suite.sidebar-width'

/** Request bodies here are one tiny JSON object; anything larger is hostile. */
const MAX_BODY_BYTES = 1024

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
 * Whether one thrown error is the store's typed read failure.
 * @param {unknown} error - thrown error.
 * @returns {boolean} whether it is a read failure.
 */
function isReadFailure(error: any) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === SIDEBAR_WIDTH_READ_FAILED
}

/**
 * Validate one write request body.
 *
 * The body must carry exactly one field, `sidebarWidth`: extra fields are
 * rejected rather than ignored, so a stale client cannot smuggle a different
 * document shape past the route.
 * @param {unknown} body - decoded request body.
 * @returns {{ ok: true, sidebarWidth: number } | { ok: false, message: string }} the accepted width or a failure.
 */
function validateSidebarWidthBody(body: any) {
  if (!isRecord(body)) return { ok: false, message: 'request body must be one JSON object' }
  const fields = Object.keys(body)
  if (fields.length !== 1 || fields[0] !== 'sidebarWidth') {
    return { ok: false, message: 'request body must carry exactly one field "sidebarWidth"' }
  }
  if (!isSidebarWidth(body.sidebarWidth)) {
    return {
      ok: false,
      message: `"sidebarWidth" must be an integer between ${SIDEBAR_WIDTH_MIN} and ${SIDEBAR_WIDTH_MAX}`
    }
  }
  return { ok: true, sidebarWidth: body.sidebarWidth }
}

/**
 * Register the sidebar-width route inside Connection's authentication fence.
 * @param {Record<string, any>} ctx - Host context carrying the connection service.
 * @param {object} [options] - injection points for tests.
 * @param {Record<string, any>} [options.store] - store override with `get`/`set`.
 * @returns {void}
 */
export function installSidebarWidth(
  ctx: any,
  options: { store?: ReturnType<typeof createSidebarWidthStore> } = {}
) {
  const store = options.store ?? createSidebarWidthStore(harnessHome())
  ctx.effect(() => ctx.connection.fetch.register({
    path: SIDEBAR_WIDTH_ROUTE,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request: any) => {
      if (request.method === 'GET') {
        try {
          return sendJson(200, await store.get())
        } catch (error: any) {
          if (isReadFailure(error)) {
            return sendJson(500, { code: 'store-read-failed', message: 'sidebar width could not be read' })
          }
          return sendJson(500, { code: 'store-failed', message: 'sidebar width could not be served' })
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
      // slip past the 1 KiB request cap.
      if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
        return sendJson(413, { code: 'too-large', message: 'request body is too large' })
      }
      let body
      try {
        body = JSON.parse(text)
      } catch {
        return sendJson(400, { code: 'bad-request', message: 'request body is not JSON' })
      }
      const verdict = validateSidebarWidthBody(body)
      if (verdict.ok === false) {
        return sendJson(400, { code: 'bad-request', message: verdict.message })
      }
      try {
        return sendJson(200, await store.set(verdict.sidebarWidth))
      } catch (error: any) {
        if (isReadFailure(error)) {
          return sendJson(500, { code: 'store-read-failed', message: 'sidebar width could not be read' })
        }
        return sendJson(500, { code: 'store-failed', message: 'sidebar width could not be stored' })
      }
    }
  }), `power-suite: sidebar-width ${SIDEBAR_WIDTH_ROUTE}`)
}
