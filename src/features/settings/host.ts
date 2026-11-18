/**
 * Host half of the suite's `settings` feature: one authenticated route pair
 * serving and storing the durable preference document the Plugins page edits.
 *
 * The document is Host-owned so every browser sees the same preference. The
 * browser half reads it at startup and writes through this route; the
 * prompt-history key handler reads the shared client store, so a change applies
 * to the next keypress without a reload.
 */

import { type HostContext } from '../../host/context.ts'
import os from 'node:os'
import path from 'node:path'
import { createSettingsStore, validatePatch } from './store.ts'
import { ROUTES } from '../../shared/routes.ts'

/** Route serving and storing the settings document. */
export const SETTINGS_ROUTE = ROUTES.settings

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
function sendJson(status: number, payload: unknown) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Register the settings route inside Connection's authentication fence.
 * @param {Record<string, unknown>} ctx - Host context carrying the connection service.
 * @returns {void}
 */
export function installSettings(ctx: HostContext) {
  const store = createSettingsStore(harnessHome())
  ctx.effect(() => ctx.connection.fetch.register({
    path: SETTINGS_ROUTE,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request: Request) => {
      if (request.method === 'GET') {
        return sendJson(200, { settings: await store.get() })
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
      let patch
      try {
        patch = JSON.parse(text)
      } catch {
        return sendJson(400, { code: 'bad-request', message: 'request body is not JSON' })
      }
      const verdict = validatePatch(patch)
      if (verdict.ok === false) {
        return sendJson(400, { code: 'bad-request', message: verdict.message })
      }
      return sendJson(200, { settings: await store.update(verdict.value) })
    }
  }), `power-suite: settings ${SETTINGS_ROUTE}`)
}
