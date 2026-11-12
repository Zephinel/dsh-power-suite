/**
 * Host half of the suite's `session-activity` feature: an event-sourced,
 * durable last-activity ledger plus one authenticated read-only route.
 *
 * Why a ledger: the client card needs an authoritative "when did this Session
 * last do anything". Catalog `updatedAt` is the last-prompt time (stale for
 * long turns) and the projection-cache document mtime is rewritten by Host
 * maintenance (`session/end-seed`) long after real activity, so both are
 * proxies. This feature instead uses the same committed event stream DSH uses:
 * every `session/event` advances `sessionId → max(time)`, so long completed
 * turns, interrupted/failed turns and maintenance rewrites all follow one rule.
 *
 * - **Live authority:** `ctx.on('session/event', (session, event) => …)`.
 *   Only explicit activity-bearing event types advance an entry (turn/step/
 *   message/tool events; metadata-only `request/header`, `request/context` and
 *   synthetic seed/maintenance types are ignored), and only with a finite
 *   positive `event.time` for a valid Session id. This keeps a title/metadata
 *   write from resurrecting an already-read Session's unread dot.
 * - **Durable ledger:** `$DSH_HOME/dsh-power-suite/session-activity.json`
 *   `{ version: 1, sessions: { [id]: lastActivityAt } }`, bounded to the newest
 *   5000 entries, max-merged, atomic 0600 writes serialized and debounced.
 * - **One-time baseline:** at install, Sessions in `ctx.sessionQuery`'s corpus
 *   without a ledger entry are seeded from their per-record projection-cache
 *   document's `max(timeContext.lastMessageTime, lastInjectionTime)` without
 *   reading Session logs and without overwriting newer live entries. The
 *   document mtime is only a re-parse guard, never a value. A Session with no
 *   usable cache row falls back to its header `createdAt` only (the Session
 *   header has no `updatedAt`). Durable writes read-merge the on-disk document
 *   before replacing it, so overlapping Host instances cannot clobber each
 *   other's newer entries.
 * - **Route:** `GET /api/power-suite.session-activity` returns a snapshot of
 *   the live ledger (same `{ sessions }` contract the client already consumes),
 *   `cache-control: no-store`, empty map on failure.
 *
 * Accepted limits: activity is exact for events observed by this Host process;
 * pre-existing Sessions rely on the one-time cache-document approximation
 * (falling back to header timestamps when no cache row exists), so a historical
 * completion or a seed-only rewrite can be under-reported. That is deliberate:
 * the ledger never fabricates recency from mtime or catalog prompt times.
 */

import { readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createActivityLedger,
  isActivitySessionId,
  isActivityTime
} from './store.js'

/** Route serving the live activity ledger snapshot. */
export const SESSION_ACTIVITY_ROUTE = '/api/power-suite.session-activity'

/** Projection-cache storage path fragments inside one harness home. */
const PROJECTION_CACHE_PATH = ['storages', 'session_projcache', 'sessions']

/** Session ids are harness-generated tokens; refuse anything path-like. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** A cache document is a fold shortcut; bound what one request may load. */
export const MAX_CACHE_DOCUMENT_BYTES = 16 * 1024 * 1024

/** Synthetic seed/maintenance event types that must never count as activity. */
const SEED_EVENT_PATTERN = /(?:^|[/-])seed$/i

/**
 * Explicit allowlist of DSH `SessionEventMap` types that represent real work.
 * Metadata/request bookkeeping is deliberately excluded so a title or request
 * header write cannot make an old Session look freshly active; unknown future
 * or plugin event types are ignored for the same reason (a missing event only
 * under-reports, never fabricates recency).
 */
export const ACTIVITY_EVENT_TYPES = new Set([
  'turn/start',
  'turn/end',
  'step/start',
  'step/end',
  'user/message',
  'developer/message',
  'system/message',
  'assistant/message',
  'assistant/attempt',
  'tool/call',
  'tool/result'
])

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
 * Answer with JSON and a no-store policy: the ledger is live state.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 * @returns {Response} the response.
 */
function sendJson(status, payload) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Whether a committed event type is a synthetic seed/maintenance boundary.
 * Seed events are documented not to publish on `session/event`; the guard keeps
 * a future or plugin-generated variant from fabricating activity.
 * @param {unknown} type - event type.
 * @returns {boolean} whether it must be ignored.
 */
export function isSyntheticSeedEvent(type) {
  return typeof type === 'string' && SEED_EVENT_PATTERN.test(type)
}

/**
 * Whether one committed event type is activity-bearing under the explicit
 * allowlist above.
 * @param {unknown} type - event type.
 * @returns {boolean} whether it advances the activity ledger.
 */
export function isActivityBearingEvent(type) {
  return typeof type === 'string' && ACTIVITY_EVENT_TYPES.has(type)
}

/**
 * Project one committed Session event onto a ledger entry.
 * @param {object} session - committed Session subject.
 * @param {object} event - committed Session event.
 * @returns {{ sessionId: string, time: number } | null} entry, or null when ignored.
 */
export function activityFromEvent(session, event) {
  if (session === null || typeof session !== 'object') return null
  const sessionId = session.id
  if (!isActivitySessionId(sessionId)) return null
  if (event === null || typeof event !== 'object') return null
  if (isSyntheticSeedEvent(event.type) || !isActivityBearingEvent(event.type)) return null
  if (!isActivityTime(event.time)) return null
  return { sessionId, time: event.time }
}

/**
 * Extract the cheap historical approximation from one projection-cache
 * document: the newer of `timeContext.lastMessageTime` and
 * `timeContext.lastInjectionTime`. Corrupt, foreign, or time-less documents
 * read as null. Document mtime is deliberately never a value.
 * @param {unknown} text - document contents.
 * @returns {number | null} cached activity approximation, or null.
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
  if (value === null || typeof value !== 'object') return null
  const times = [value.lastMessageTime, value.lastInjectionTime].filter((time) => typeof time === 'number' && Number.isFinite(time))
  return times.length === 0 ? null : Math.max(...times)
}

/**
 * Open a reader for the per-record projection-cache documents used by the
 * one-time baseline. `stat` mtime only skips re-parsing unchanged files; it is
 * never an activity value because Host maintenance may rewrite a document long
 * after real activity. Oversized documents are skipped before they are read.
 * @param {string} dshHome - harness home directory.
 * @returns {function(string): Promise<number | null>} Session id → cached activity.
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
    let value = null
    try {
      value = readCachedDocumentActivity(await readFile(file, 'utf8'))
    } catch {
      value = null
    }
    known.set(id, { mtimeMs: info.mtimeMs, value })
    return value
  }
}

/**
 * Seed the ledger for pre-existing Sessions from the projection-cache corpus.
 *
 * Runs once per install (background): for every catalogued Session without a
 * ledger entry, take the cache document's activity approximation, falling back
 * to the header timestamps when the document is missing or time-less. Entries
 * are merged with max semantics, so live events recorded while the baseline
 * runs are never overwritten with older history. Listing failures leave the
 * current ledger untouched.
 * @param {object} ctx - Host context; `sessionQuery` is optional.
 * @param {object} ledger - activity ledger handle.
 * @param {object} [options] - injection points for tests.
 * @param {function(string): Promise<number | null>} [options.readCachedDocument] - cache reader.
 * @returns {Promise<Record<string, number>>} the ledger snapshot after seeding.
 */
export async function seedActivityBaseline(ctx, ledger, options = {}) {
  const query = ctx !== null && typeof ctx === 'object' ? ctx.sessionQuery : undefined
  if (query === undefined || query === null || typeof query.listSessions !== 'function') {
    return ledger.snapshot()
  }
  let records
  try {
    records = await query.listSessions()
  } catch {
    return ledger.snapshot()
  }
  const current = ledger.snapshot()
  const readCachedDocument = typeof options.readCachedDocument === 'function'
    ? options.readCachedDocument
    : createProjectionCacheReader(harnessHome())
  const seeds = {}
  for (const record of Array.isArray(records) ? records : []) {
    const header = record !== null && typeof record === 'object' ? record.header : undefined
    if (header === null || typeof header !== 'object') continue
    const id = typeof header.id === 'string' ? header.id : ''
    if (!isActivitySessionId(id) || current[id] !== undefined) continue
    let cached = null
    try {
      cached = await readCachedDocument(id)
    } catch {
      cached = null
    }
    // SessionHeader has no `updatedAt`; createdAt is the only header fallback.
    const createdAt = typeof header.createdAt === 'number' && Number.isFinite(header.createdAt) ? header.createdAt : 0
    const at = Math.max(cached ?? 0, createdAt)
    if (at > 0) seeds[id] = at
  }
  if (Object.keys(seeds).length > 0) ledger.record(seeds)
  return ledger.snapshot()
}

/**
 * Register the activity ledger lifecycle and read-only route.
 * @param {object} ctx - Host context.
 * @param {object} [options] - injection points for tests.
 * @param {object} [options.ledger] - ledger handle override.
 * @param {function(string): Promise<number | null>} [options.readCachedDocument] - cache reader.
 * @returns {void}
 */
export function installSessionActivity(ctx, options = {}) {
  const ledger = options.ledger ?? createActivityLedger(harnessHome())
  let loadPromise = null
  const ensureLoaded = () => {
    if (loadPromise === null) loadPromise = Promise.resolve(ledger.load()).catch(() => undefined)
    return loadPromise
  }
  ctx.effect(() => {
    void ensureLoaded()
      .then(() => seedActivityBaseline(ctx, ledger, { readCachedDocument: options.readCachedDocument }))
      .catch(() => {
        // Missing services/corrupt files keep the live/loaded map; the route
        // still serves whatever the ledger already holds.
      })
    const stop = typeof ctx.on === 'function'
      ? ctx.on('session/event', (session, event) => {
        const entry = activityFromEvent(session, event)
        if (entry === null) return
        ledger.record({ [entry.sessionId]: entry.time })
      }, { global: true })
      : null
    return () => {
      // Stop live updates first, then await the debounce timer + full write
      // chain so Cordis/HMR cannot drop the last committed events.
      if (typeof stop === 'function') stop()
      return Promise.resolve(ledger.dispose()).catch(() => undefined)
    }
  }, `power-suite: session-activity ledger ${SESSION_ACTIVITY_ROUTE}`)
  ctx.effect(() => ctx.connection.fetch.register({
    path: SESSION_ACTIVITY_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      try {
        // Cold start: wait for the single-flight load so the first request
        // never returns an empty map before the durable ledger is available.
        await ensureLoaded()
        return sendJson(200, { sessions: ledger.snapshot() })
      } catch {
        // A broken ledger must not fail the browser's periodic card refresh.
        return sendJson(200, { sessions: {} })
      }
    }
  }), `power-suite: session-activity GET ${SESSION_ACTIVITY_ROUTE}`)
}
