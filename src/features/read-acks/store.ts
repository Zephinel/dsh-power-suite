/**
 * Host-shared read acknowledgements: the durable baseline document that lets
 * every browser and profile of the same $DSH_HOME agree on which Sessions were
 * already read.
 *
 * Each entry maps a Session id to the Session `updatedAt` value that was
 * observed when the user last opened it. Read state is derived on the client by
 * comparing that baseline with the Session's current `updatedAt`, so the
 * document only ever needs to keep monotonic maxima: merging is per-id
 * `Math.max`, no removal verb is needed, and a genuinely newer activity makes
 * the unread mark reappear everywhere.
 *
 * The file is bounded (the oldest baselines are dropped past the cap) and every
 * write is atomic: a temporary sibling is renamed over the target only after it
 * has been written, so a crash can never leave half a document behind.
 */

import path from 'node:path'

import { isNotFound } from '../../host/errors.ts'

import { createDocumentStore } from '../../host/document-store.ts'

/** Store schema version; bump when the shape changes. */
export const READ_ACKS_VERSION = 1

/** Region of `$DSH_HOME` the suite owns for its own files. */
export const READ_ACKS_DIRECTORY = 'dsh-power-suite'

/** File name inside {@link READ_ACKS_DIRECTORY}. */
export const READ_ACKS_FILE = 'read-acks.json'

/** Most Session baselines one document keeps; the oldest baselines drop first. */
export const MAX_READ_ACKS = 1000

/** Longest accepted Session id; ids are harness-generated UUID-ish strings. */
export const MAX_SESSION_ID_LENGTH = 200

/** Typed error raised when the durable document exists but cannot be read. */
export const READ_ACKS_READ_FAILED = 'READ_ACKS_READ_FAILED'

/**
 * Narrow parsed JSON to a plain object.
 * @param {unknown} value - decoded value.
 * @returns {value is Record<string, unknown>} whether it is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether one value can key a read baseline.
 * @param {unknown} value - candidate Session id.
 * @returns {boolean} whether it is an accepted id.
 */
export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_SESSION_ID_LENGTH
}

/**
 * Whether one value can be an acknowledged `updatedAt` baseline.
 * @param {unknown} value - candidate baseline.
 * @returns {boolean} whether it is a finite positive epoch-millisecond value.
 */
export function isAckBaseline(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Keep only valid entries of one decoded `acked` object.
 * @param {unknown} value - decoded entries.
 * @returns {Record<string, number>} sanitized entries.
 */
export function sanitizeAcked(value: unknown): Record<string, number> {
  const acked: Record<string, number> = {}
  if (!isRecord(value)) return acked
  for (const [id, baseline] of Object.entries(value)) {
    if (!isSessionId(id) || !isAckBaseline(baseline)) continue
    acked[id] = baseline
  }
  return acked
}

/**
 * Bound one entry document, dropping the oldest baselines first.
 * @param {Record<string, number>} acked - sanitized entries.
 * @returns {Record<string, number>} a document with at most {@link MAX_READ_ACKS} entries.
 */
export function capAcked(acked: Record<string, number>): Record<string, number> {
  const entries = Object.entries(acked)
  if (entries.length <= MAX_READ_ACKS) return acked
  entries.sort((left, right) => (right[1] - left[1]) || left[0].localeCompare(right[0]))
  const capped: Record<string, number> = {}
  for (const [id, baseline] of entries.slice(0, MAX_READ_ACKS)) capped[id] = baseline
  return capped
}

/**
 * Sanitize and bound one document in one step.
 * @param {unknown} value - candidate document entries.
 * @returns {Record<string, number>} normalized entries.
 */
export function normalizeAcked(value: unknown): Record<string, number> {
  return capAcked(sanitizeAcked(value))
}

/**
 * Merge two documents per Session id, keeping the newer baseline.
 * @param {Record<string, number>} current - existing entries.
 * @param {Record<string, number>} incoming - incoming entries.
 * @returns {Record<string, number>} merged, sanitized, bounded entries.
 */
export function mergeAcked(current: Record<string, number>, incoming: Record<string, number>): Record<string, number> {
  const merged = sanitizeAcked(current)
  for (const [id, baseline] of Object.entries(sanitizeAcked(incoming))) {
    const previous = merged[id]
    merged[id] = previous === undefined ? baseline : Math.max(previous, baseline)
  }
  return capAcked(merged)
}

/**
 * Parse one persisted read-acks file.
 *
 * A missing, empty, corrupt, or version-mismatched document reads as empty so a
 * broken file can never make the card render wrongly; valid entries from an
 * accepted document are sanitized and bounded.
 * @param {unknown} text - file contents.
 * @returns {Record<string, number>} the acknowledgement entries.
 */
export function parseReadAcks(text: string): Record<string, number> {
  if (typeof text !== 'string' || text.length === 0) return {}
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return {}
  }
  if (!isRecord(value) || value.version !== READ_ACKS_VERSION || !isRecord(value.acked)) return {}
  return normalizeAcked(value.acked)
}

/**
 * Serialize one document as the file format.
 * @param {Record<string, number>} acked - acknowledgment entries.
 * @returns {string} file contents ending in one newline.
 */
export function serializeReadAcks(acked: Record<string, number>): string {
  return `${JSON.stringify({ version: READ_ACKS_VERSION, acked: normalizeAcked(acked) }, null, 2)}\n`
}

/**
 * The read-acks file path inside one harness home.
 * @param {string} dshHome - harness home directory.
 * @returns {string} absolute file path.
 */
export function readAcksPath(dshHome: string): string {
  return path.join(dshHome, READ_ACKS_DIRECTORY, READ_ACKS_FILE)
}

/**
 * Open the read-acks store over one harness home.
 *
 * Reads are lazy; writes serialize on one chain, land atomically through a
 * temporary sibling plus rename, and publish to memory only after the rename.
 * @param {string} dshHome - harness home directory.
 * @returns {{ get(): Promise<Record<string, number>>, record(entries: Record<string, number>): Promise<Record<string, number>> }} the store.
 */
export function createReadAckStore(dshHome: string) {
  const store = createDocumentStore({
    file: readAcksPath(dshHome),
    decode: parseReadAcks,
    encode: serializeReadAcks,
    merge: mergeAcked,
    readError: { code: READ_ACKS_READ_FAILED, message: 'read acknowledgements could not be read' },
    clone: (value) => ({ ...value })
  })
  return {
    async get() {
      return store.get()
    },
    /**
     * Merge one acknowledged entry set into the durable document.
     * @param {Record<string, number>} entries - Session id → observed updatedAt.
     * @returns {Promise<Record<string, number>>} the document after the merge.
     */
    async record(entries: Record<string, number>) {
      return store.update((current) => {
        const next = mergeAcked(current, entries)
        const changed = Object.keys(next).length !== Object.keys(current).length
          || Object.entries(next).some(([id, baseline]) => current[id] !== baseline)
        return { next, changed }
      })
    }
  }
}
