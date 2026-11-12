/**
 * Durable session-activity ledger for the Dynamic Workspaces card.
 *
 * The Host is the authority for "when did this Session last do anything":
 * every committed Session event advances the ledger through the live event
 * stream (see `host.js`), so long turns, interrupted/failed turns and
 * maintenance rewrites all follow one rule. This module owns the map itself:
 * sanitizing, max-merging, bounding, and the debounced atomic JSON document at
 * `$DSH_HOME/dsh-power-suite/session-activity.json`.
 *
 * The file is a cache of one monotonic fact per Session id, so it never needs
 * removals: a missing or corrupt document reads empty and is rewritten; a write
 * is serialized on one chain, lands through a temporary sibling plus rename,
 * and is debounced so an event burst costs at most one write per window.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Ledger document schema version; bump when the shape changes. */
export const ACTIVITY_LEDGER_VERSION = 1

/** Region of `$DSH_HOME` the suite owns for its files. */
export const ACTIVITY_LEDGER_DIRECTORY = 'dsh-power-suite'

/** File name inside {@link ACTIVITY_LEDGER_DIRECTORY}. */
export const ACTIVITY_LEDGER_FILE = 'session-activity.json'

/** Most Session entries the ledger keeps; the oldest activity drops first. */
export const MAX_ACTIVITY_SESSIONS = 5000

/** Debounce window for durable writes; an event burst costs one write. */
export const ACTIVITY_WRITE_DEBOUNCE_MS = 750

/** Longest accepted Session id; ids are harness-generated UUID-ish strings. */
export const MAX_ACTIVITY_SESSION_ID_LENGTH = 200

/**
 * Narrow parsed JSON to a plain object.
 * @param {unknown} value - decoded value.
 * @returns {boolean} whether it is a record.
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether one value can key an activity entry.
 * @param {unknown} value - candidate Session id.
 * @returns {boolean} whether it is an accepted id.
 */
export function isActivitySessionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ACTIVITY_SESSION_ID_LENGTH
}

/**
 * Whether one value can be a last-activity timestamp.
 * @param {unknown} value - candidate epoch milliseconds.
 * @returns {boolean} whether it is a finite positive time.
 */
export function isActivityTime(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Keep only valid entries of one decoded `sessions` object.
 * @param {unknown} value - decoded entries.
 * @returns {Record<string, number>} sanitized entries.
 */
export function sanitizeActivitySessions(value) {
  const sessions = {}
  if (!isRecord(value)) return sessions
  for (const [id, time] of Object.entries(value)) {
    if (!isActivitySessionId(id) || !isActivityTime(time)) continue
    sessions[id] = time
  }
  return sessions
}

/**
 * Bound one entry map, dropping the oldest activity first.
 * @param {Record<string, number>} sessions - sanitized entries.
 * @returns {Record<string, number>} at most {@link MAX_ACTIVITY_SESSIONS} entries.
 */
export function capActivitySessions(sessions) {
  const entries = Object.entries(sessions)
  if (entries.length <= MAX_ACTIVITY_SESSIONS) return sessions
  entries.sort((left, right) => (right[1] - left[1]) || left[0].localeCompare(right[0]))
  const capped = {}
  for (const [id, time] of entries.slice(0, MAX_ACTIVITY_SESSIONS)) capped[id] = time
  return capped
}

/**
 * Merge two maps per Session id, keeping the newer activity.
 * @param {Record<string, number>} current - existing entries.
 * @param {Record<string, number>} incoming - incoming entries.
 * @returns {Record<string, number>} merged, sanitized, bounded entries.
 */
export function mergeActivitySessions(current, incoming) {
  const merged = sanitizeActivitySessions(current)
  for (const [id, time] of Object.entries(sanitizeActivitySessions(incoming))) {
    const previous = merged[id]
    merged[id] = previous === undefined ? time : Math.max(previous, time)
  }
  return capActivitySessions(merged)
}

/**
 * Parse one persisted ledger file. Missing, corrupt, or foreign documents read
 * as empty so a broken file can never invent activity.
 * @param {unknown} text - file contents.
 * @returns {Record<string, number>} the entries.
 */
export function parseActivityLedger(text) {
  if (typeof text !== 'string' || text.length === 0) return {}
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return {}
  }
  if (!isRecord(value) || value.version !== ACTIVITY_LEDGER_VERSION || !isRecord(value.sessions)) return {}
  return capActivitySessions(sanitizeActivitySessions(value.sessions))
}

/**
 * Serialize one ledger as the file format.
 * @param {Record<string, number>} sessions - entries.
 * @returns {string} file contents ending in one newline.
 */
export function serializeActivityLedger(sessions) {
  return `${JSON.stringify({ version: ACTIVITY_LEDGER_VERSION, sessions: capActivitySessions(sanitizeActivitySessions(sessions)) }, null, 2)}\n`
}

/**
 * The ledger file path inside one harness home.
 * @param {string} dshHome - harness home directory.
 * @returns {string} absolute file path.
 */
export function activityLedgerPath(dshHome) {
  return path.join(dshHome, ACTIVITY_LEDGER_DIRECTORY, ACTIVITY_LEDGER_FILE)
}

/**
 * Open the durable activity ledger over one harness home.
 *
 * `record` is synchronous and immediately visible to `snapshot`; durability is
 * debounced and serialized. Reads load lazily and merge with any events already
 * recorded in this process, so a slow file read can never discard live data.
 * A missing or corrupt document schedules an empty rewrite.
 * @param {string} dshHome - harness home directory.
 * @param {object} [options] - injection points for tests.
 * @param {number} [options.debounceMs] - durable write debounce window.
 * @returns {object} the ledger handle.
 */
export function createActivityLedger(dshHome, options = {}) {
  const file = activityLedgerPath(dshHome)
  const debounceMs = Number.isFinite(options.debounceMs) && options.debounceMs >= 0
    ? options.debounceMs
    : ACTIVITY_WRITE_DEBOUNCE_MS
  let state = null
  let dirty = false
  let disposed = false
  let timer = null
  let chain = Promise.resolve()
  const snapshot = () => ({ ...(state ?? {}) })
  const enqueue = (task) => {
    const run = chain.then(task, task)
    chain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
  const writeNow = async () => {
    const payload = snapshot()
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, serializeActivityLedger(payload), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, file)
  }
  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (!dirty) return Promise.resolve(snapshot())
    dirty = false
    const pending = snapshot()
    return enqueue(async () => {
      await writeNow()
      return pending
    }).catch(() => {
      // A failed durable write keeps the in-memory ledger; a later record or
      // flush retries. Do not let a disk error reject the Host lifecycle.
      dirty = true
      return snapshot()
    })
  }
  const schedule = () => {
    if (disposed || timer !== null) return
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, debounceMs)
  }
  const load = async () => {
    let text = null
    try {
      text = await readFile(file, 'utf8')
    } catch {
      text = null
    }
    // Parse validity is checked separately from the entry count: a valid empty
    // document must not be rewritten on every load.
    let validDocument = false
    if (text !== null) {
      try {
        const value = JSON.parse(text)
        validDocument = value !== null && typeof value === 'object'
          && value.version === ACTIVITY_LEDGER_VERSION
          && value.sessions !== null && typeof value.sessions === 'object' && !Array.isArray(value.sessions)
      } catch {
        validDocument = false
      }
    }
    const parsed = parseActivityLedger(text ?? '')
    const hadState = state !== null
    state = mergeActivitySessions(parsed, state ?? {})
    if (text === null || !validDocument) {
      // Missing or corrupt/foreign: serve empty and rewrite a valid document.
      dirty = true
    } else if (hadState) {
      // Live events recorded while the file read was in flight must be persisted.
      for (const [id, time] of Object.entries(state)) {
        if ((parsed[id] ?? 0) < time) {
          dirty = true
          break
        }
      }
    }
    if (dirty) schedule()
    return snapshot()
  }
  const record = (entries) => {
    const incoming = sanitizeActivitySessions(entries)
    if (Object.keys(incoming).length === 0) return snapshot()
    state = mergeActivitySessions(state ?? {}, incoming)
    dirty = true
    schedule()
    return snapshot()
  }
  const dispose = async () => {
    disposed = true
    return flush()
  }
  return { load, record, snapshot, flush, dispose, file }
}
