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
 *   `timeContext.lastMessageTime` tracks the newest model-visible event, but it
 *   does not advance on `turn/end`; the document mtime is therefore used as a
 *   safe last-activity/checkpoint floor (`turn/end` writes a checkpoint), so a
 *   just-finished long turn cannot look stale and vanish from the card.
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

/** A projection-cache document is small JSON; refuse to load absurd files. */
export const MAX_CACHE_DOCUMENT_BYTES = 2 * 1024 * 1024

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
 * `turn/end`), so the newer of its `timeContext.lastMessageTime` and the file
 * mtime is the cheap last-activity/checkpoint floor without replaying the
 * Session log. `timeContext` alone misses `turn/end`, so an interrupted/failed
 * long turn would otherwise keep a stale message time and drop out of the card.
 * `stat` on every id skips the JSON parse for unchanged documents, and an
 * oversized document (corrupt cache) is skipped before it is read into memory.
 * @param {string} dshHome - harness home directory.
 * @returns {function(string): Promise<number | null>} Session id → activity floor.
 */
export function createProjectionCacheReader(dshHome) {
  const directory = path.join(dshHome, ...PROJECTION_CACHE_PATH)
  const known = new Map()
  return async function readCachedDocument(id) {
    if (typeof id !== 'string' || id.length === 0 || !SESSION_ID_PATTERN.test(id)) return null
    const file = path.join(directory, `${id}.json`)
    let info
    try {
      info = await stat(file)
    } catch {
      known.delete(id)
      return null
    }
    if (info.size > MAX_CACHE_DOCUMENT_BYTES) return null
    const previous = known.get(id)
    if (previous !== undefined && previous.mtimeMs === info.mtimeMs) return previous.value
    let parsed = null
    try {
      parsed = readCachedDocumentActivity(await readFile(file, 'utf8'))
    } catch {
      parsed = null
    }
    // The checkpoint write time is a safe floor even when the document has no
    // usable timeContext row or the parse failed.
    const value = Math.max(parsed ?? 0, info.mtimeMs)
    known.set(id, { mtimeMs: info.mtimeMs, value })
    return value
  }
}

/**
 * Collect last-activity/checkpoint floors for every catalogued Session.
 *
 * The value per Session is the newest of the cached document floor (the newer
 * of its `timeContext` time and checkpoint mtime), the header `updatedAt`
 * (kept for forward compatibility), and the header `createdAt`. Only headers
 * with a usable timestamp are reported, so a Session whose cache row is absent
 * still gets its creation time as a safe minimum.
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
