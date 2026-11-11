/**
 * Host half of the suite's `session-activity` feature: one authenticated,
 * read-only route that reports the last observed activity timestamp of every
 * catalogued Session.
 *
 * The client session-list summary carries the *last prompt* time, so a Session
 * whose turn ran for hours looks stale the moment it stops: the activity card
 * drops it from the retention window and its relative time is wrong. This route
 * supplies the real last-activity values without reading any Session log:
 *
 * - `ctx.sessionQuery.listSessions()` lists the logical corpus (live plus
 *   persisted, subagents included) from metadata alone.
 * - For each listed header, the optional `ctx.sessionProjectionCache` is asked
 *   for the cached `timeContext` row. `timeContext` is registered without a
 *   wire view, so `cachedSnapshot()` cannot expose it; the same projection-cache
 *   document is therefore read directly from the per-record JSON storage
 *   (`storages/session_projcache/sessions/<id>.json`) as a mtime-guarded fallback.
 *   `timeContext.lastMessageTime` is the time of the newest model-visible event
 *   (user/assistant message or tool result) known to the cache.
 * - A Session with no cache row at all falls back to its header timestamps.
 *
 * Values are bounded by a short in-memory cache because the browser polls this
 * route; every response is `cache-control: no-store`. A failed listing yields
 * an empty map with 200 so clients silently keep using their own timestamps.
 */

import { readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** Route serving the last-activity map. */
export const SESSION_ACTIVITY_ROUTE = '/api/power-suite.session-activity'

/** How long one activity map stays warm; the browser polls faster than this. */
export const SESSION_ACTIVITY_TTL_MS = 5000

/** Projection-cache storage path fragments inside one harness home. */
const PROJECTION_CACHE_PATH = ['storages', 'session_projcache', 'sessions']

/** Session ids are harness-generated tokens; refuse anything path-like. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

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
 * Answer with JSON and a no-store policy: the map tracks live activity.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 * @returns {Response} the response.
 */
function sendJson(status, payload) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Read one header's cached last-message time through the projection-cache
 * service. This only serves wire projections, so in current compositions it is
 * usually null; the document fallback below covers `timeContext`.
 * @param {object | undefined} cache - `ctx.get('sessionProjectionCache')` result.
 * @param {object} header - cloned Session header from the corpus listing.
 * @returns {number | null} cached `timeContext.lastMessageTime`, or null.
 */
export function cachedLastMessageTime(cache, header) {
  if (cache === undefined || cache === null || typeof cache.cachedSnapshot !== 'function') return null
  try {
    const snapshot = cache.cachedSnapshot(header, ['timeContext'])
    const values = snapshot !== undefined && snapshot !== null ? snapshot.values : undefined
    const timeContext = values !== null && typeof values === 'object' ? values.timeContext : undefined
    const lastMessageTime = timeContext !== null && typeof timeContext === 'object' ? timeContext.lastMessageTime : undefined
    return typeof lastMessageTime === 'number' && Number.isFinite(lastMessageTime) ? lastMessageTime : null
  } catch {
    return null
  }
}

/**
 * Extract `timeContext.lastMessageTime` from one persisted projection-cache
 * document. Corrupt or foreign documents read as null.
 * @param {unknown} text - document contents.
 * @returns {number | null} last model-visible event time, or null.
 */
export function readCachedDocumentActivity(text) {
  if (typeof text !== 'string' || text.length === 0) return null
  let document
  try {
    document = JSON.parse(text)
  } catch {
    return null
  }
  const rows = document !== null && typeof document === 'object' && document.record !== null && typeof document.record === 'object'
    ? document.record.rows
    : undefined
  const row = rows !== null && typeof rows === 'object' ? rows.timeContext : undefined
  const value = row !== null && typeof row === 'object' && row.val !== null && typeof row.val === 'object' ? row.val : undefined
  const lastMessageTime = value !== null && typeof value === 'object' ? value.lastMessageTime : undefined
  return typeof lastMessageTime === 'number' && Number.isFinite(lastMessageTime) ? lastMessageTime : null
}

/**
 * Open a mtime-guarded reader for the per-record projection-cache documents.
 *
 * A cold Session's cache document is written at checkpoint points (notably
 * `turn/end`), so its `timeContext` row is the cheap proof of the last
 * model-visible event without replaying the Session log. `stat` on every id
 * skips the JSON parse for unchanged documents; only live checkpoints re-read.
 * @param {string} dshHome - harness home directory.
 * @returns {function(string): Promise<number | null>} Session id → cached time.
 */
export function createProjectionCacheReader(dshHome) {
  const directory = path.join(dshHome, ...PROJECTION_CACHE_PATH)
  const known = new Map()
  return async function readCachedDocument(id) {
    if (typeof id !== 'string' || id.length === 0 || !SESSION_ID_PATTERN.test(id)) return null
    const file = path.join(directory, `${id}.json`)
    let version
    try {
      version = (await stat(file)).mtimeMs
    } catch {
      known.delete(id)
      return null
    }
    const previous = known.get(id)
    if (previous !== undefined && previous.mtimeMs === version) return previous.value
    let value = null
    try {
      value = readCachedDocumentActivity(await readFile(file, 'utf8'))
    } catch {
      value = null
    }
    known.set(id, { mtimeMs: version, value })
    return value
  }
}

/**
 * Collect last-activity timestamps for every catalogued Session.
 *
 * The value per Session is the newest of the cached `timeContext` time, the
 * header `updatedAt` (kept for forward compatibility), and the header
 * `createdAt`. Only headers with a usable timestamp are reported, so a Session
 * whose cache row is absent still gets its creation time as a safe minimum.
 * @param {object} ctx - Host context carrying `sessionQuery` and optional services.
 * @param {object} [options] - injection points for tests.
 * @param {function(string): Promise<number | null>} [options.readCachedDocument] - document reader.
 * @returns {Promise<Record<string, number>>} Session id → last-activity epoch milliseconds.
 */
export async function collectSessionActivity(ctx, options = {}) {
  const sessions = {}
  const records = await ctx.sessionQuery.listSessions()
  const cache = typeof ctx.get === 'function' ? ctx.get('sessionProjectionCache') : undefined
  const readCachedDocument = typeof options.readCachedDocument === 'function'
    ? options.readCachedDocument
    : createProjectionCacheReader(harnessHome())
  for (const record of Array.isArray(records) ? records : []) {
    const header = record !== null && typeof record === 'object' ? record.header : undefined
    if (header === null || typeof header !== 'object') continue
    const id = typeof header.id === 'string' ? header.id : ''
    if (id.length === 0) continue
    let cached = cachedLastMessageTime(cache, header)
    if (cached === null) {
      try {
        cached = await readCachedDocument(id)
      } catch {
        cached = null
      }
    }
    const updatedAt = typeof header.updatedAt === 'number' && Number.isFinite(header.updatedAt) ? header.updatedAt : 0
    const createdAt = typeof header.createdAt === 'number' && Number.isFinite(header.createdAt) ? header.createdAt : 0
    const at = Math.max(cached ?? 0, updatedAt, createdAt)
    if (at > 0) sessions[id] = at
  }
  return sessions
}

/**
 * Register the session-activity route inside Connection's authentication fence.
 * @param {object} ctx - Host context carrying the connection service.
 * @param {object} [options] - injection points for tests.
 * @param {function(string): Promise<number | null>} [options.readCachedDocument] - document reader.
 * @returns {void}
 */
export function installSessionActivity(ctx, options = {}) {
  const readCachedDocument = typeof options.readCachedDocument === 'function'
    ? options.readCachedDocument
    : createProjectionCacheReader(harnessHome())
  let cachedAt = 0
  let cachedValue = null
  ctx.effect(() => ctx.connection.fetch.register({
    path: SESSION_ACTIVITY_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      const now = Date.now()
      if (cachedValue !== null && now - cachedAt < SESSION_ACTIVITY_TTL_MS) {
        return sendJson(200, { sessions: cachedValue })
      }
      try {
        const sessions = await collectSessionActivity(ctx, { readCachedDocument })
        cachedValue = sessions
        cachedAt = Date.now()
        return sendJson(200, { sessions })
      } catch {
        // A missing or failing corpus service must not fail the browser's
        // periodic card refresh; clients fall back to their own timestamps.
        return sendJson(200, { sessions: {} })
      }
    }
  }), `power-suite: session-activity GET ${SESSION_ACTIVITY_ROUTE}`)
}
