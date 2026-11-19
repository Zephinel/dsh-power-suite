/**
 * Host-shared pinned main-Session ids for the Running & recent card.
 *
 * The pin is a property of the card, not of the native sidebar: only Sessions
 * the user pins from the card are listed, so a project-organisation pin made in
 * the Workspaces browser never surfaces here. The document is Host-owned under
 * $DSH_HOME so every browser and profile using the same DSH home (i.e. every
 * paired device) agrees on the pinned set; clients keep a local cache and apply
 * small idempotent operations through the route.
 *
 * Wire/disk document:
 *
 *   { "version": 1, "rev": 0, "pinned": ["<sessionId>", ...] }
 *
 * Operations are applied in arrival order (last write wins per Session), which
 * is the natural semantics for a human toggling a pin on one device at a time;
 * every applied operation bumps `rev` so a client can tell a new document from
 * a stale read. The file is bounded and every write is atomic: a temporary
 * sibling is renamed over the target only after it has been written, so a crash
 * can never leave half a document behind.
 */

import path from 'node:path'

import { isNotFound } from '../../host/errors.ts'

import { createDocumentStore } from '../../host/document-store.ts'

/** Store schema version; bump when the document shape changes. */
export const SESSION_PINS_VERSION = 1

/** Region of `$DSH_HOME` the suite owns for its own files. */
export const SESSION_PINS_DIRECTORY = 'dsh-power-suite'

/** File name inside {@link SESSION_PINS_DIRECTORY}. */
export const SESSION_PINS_FILE = 'session-pins.json'

/** Most pinned Sessions one document keeps; the oldest pin drops first. */
export const MAX_PINNED_SESSIONS = 500

/** Longest accepted Session id; ids are harness-generated UUID-ish strings. */
export const MAX_SESSION_ID_LENGTH = 200

/** Most operations one request may carry. */
export const MAX_PIN_OPS = 200

/** Typed error raised when the durable document exists but cannot be read. */
export const SESSION_PINS_READ_FAILED = 'SESSION_PINS_READ_FAILED'

/** Accepted operation verbs. */
export const PIN_OP_VALUES = ['pin', 'unpin']

/**
 * Narrow parsed JSON to a plain object.
 * @param {unknown} value - decoded value.
 * @returns {value is Record<string, unknown>} whether it is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether one value can key a pinned entry.
 * @param {unknown} value - candidate Session id.
 * @returns {boolean} whether it is an accepted id.
 */
export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_SESSION_ID_LENGTH
}

/**
 * Sanitize a pinned id list: keep non-empty strings, dedupe, preserve order, cap.
 * @param {unknown} value - candidate list.
 * @returns {string[]} sanitized pinned ids.
 */
export function sanitizePinned(value: unknown) {
  const pinned: string[] = []
  const seen = new Set()
  if (!Array.isArray(value)) return pinned
  for (const id of value) {
    if (!isSessionId(id) || seen.has(id)) continue
    seen.add(id)
    pinned.push(id)
    if (pinned.length >= MAX_PINNED_SESSIONS) break
  }
  return pinned
}

/** Canonical session-pins document. */
export interface SessionPinsDocument {
  version: number
  rev: number
  pinned: string[]
}

/** One validated pin/unpin operation. */
export type PinOp = { op: 'pin' | 'unpin', id: string }

/**
 * Normalize one document into its canonical shape.
 * @param value - candidate document.
 */
export function normalizeSessionPins(value: unknown): SessionPinsDocument {
  const source = isRecord(value) ? value : {}
  const rev = typeof source.rev === 'number' && Number.isFinite(source.rev) && source.rev >= 0
    ? Math.floor(source.rev)
    : 0
  return {
    version: SESSION_PINS_VERSION,
    rev,
    pinned: sanitizePinned(source.pinned)
  }
}

/**
 * Validate one operation list from a request body.
 * @param {unknown} value - decoded `ops` value.
 * @returns {{ ok: true, ops: Array<{ op: 'pin' | 'unpin', id: string }> } | { ok: false, message: string }} accepted operations or a failure.
 */
/** Whether one value is an accepted pin operation verb. */
function isPinOp(value: unknown): value is 'pin' | 'unpin' {
  return value === 'pin' || value === 'unpin'
}

export function validatePinOps(value: unknown): { ok: true; ops: PinOp[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) return { ok: false, message: '"ops" must be an array' }
  if (value.length === 0) return { ok: false, message: '"ops" must not be empty' }
  if (value.length > MAX_PIN_OPS) return { ok: false, message: `"ops" must not exceed ${MAX_PIN_OPS} entries` }
  const ops: Array<{ op: 'pin' | 'unpin', id: string }> = []
  for (const entry of value) {
    if (!isRecord(entry)) return { ok: false, message: 'each operation must be one object' }
    if (!isPinOp(entry.op)) return { ok: false, message: `operation "op" must be one of ${PIN_OP_VALUES.join(', ')}` }
    if (!isSessionId(entry.id)) return { ok: false, message: 'operation "id" must be a non-empty Session id' }
    ops.push({ op: entry.op, id: entry.id })
  }
  return { ok: true, ops }
}

/**
 * Apply one operation list to a document, last write wins per Session.
 *
 * Pinning an already pinned id and unpinning an absent id are no-ops and do not
 * bump `rev`. The bounded list drops its oldest pin first when it overflows.
 * @param {{ version: number, rev: number, pinned: string[] }} document - current document.
 * @param {Array<{ op: 'pin' | 'unpin', id: string }>} ops - validated operations.
 * @returns {{ version: number, rev: number, pinned: string[] }} the next document (same object values when unchanged).
 */
export function applyPinOps(document: unknown, ops: PinOp[]): SessionPinsDocument {
  const current = normalizeSessionPins(document)
  const pinned = current.pinned.slice()
  let changed = false
  for (const entry of ops) {
    const index = pinned.indexOf(entry.id)
    if (entry.op === 'pin') {
      if (index !== -1) continue
      pinned.push(entry.id)
      if (pinned.length > MAX_PINNED_SESSIONS) pinned.splice(0, pinned.length - MAX_PINNED_SESSIONS)
      changed = true
    } else if (index !== -1) {
      pinned.splice(index, 1)
      changed = true
    }
  }
  return changed
    ? { version: SESSION_PINS_VERSION, rev: current.rev + 1, pinned }
    : current
}

/**
 * Parse one persisted session-pins file.
 *
 * A missing, empty, corrupt, or version-mismatched document reads as empty so a
 * broken file can never make the card render wrongly.
 * @param {unknown} text - file contents.
 * @returns {{ version: number, rev: number, pinned: string[] }} the document.
 */
export function parseSessionPins(text: string): SessionPinsDocument {
  if (typeof text !== 'string' || text.length === 0) return normalizeSessionPins(null)
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return normalizeSessionPins(null)
  }
  if (!isRecord(value) || value.version !== SESSION_PINS_VERSION) return normalizeSessionPins(null)
  return normalizeSessionPins(value)
}

/**
 * Serialize one document as the file format.
 * @param {{ version: number, rev: number, pinned: string[] }} document - canonical document.
 * @returns {string} file contents ending in one newline.
 */
export function serializeSessionPins(document: unknown) {
  const normalized = normalizeSessionPins(document)
  return `${JSON.stringify(normalized, null, 2)}\n`
}

/**
 * The session-pins file path inside one harness home.
 * @param {string} dshHome - harness home directory.
 * @returns {string} absolute file path.
 */
export function sessionPinsPath(dshHome: string) {
  return path.join(dshHome, SESSION_PINS_DIRECTORY, SESSION_PINS_FILE)
}

/**
 * Open the session-pins store over one harness home.
 *
 * Reads are lazy; writes serialize on one chain, land atomically through a
 * temporary sibling plus rename, and publish to memory only after the rename.
 * @param {string} dshHome - harness home directory.
 * @returns {{ get(): Promise<{ version: number, rev: number, pinned: string[] }>, apply(ops: Array<{ op: 'pin' | 'unpin', id: string }>): Promise<{ version: number, rev: number, pinned: string[] }> }} the store.
 */
export function createSessionPinStore(dshHome: string) {
  const store = createDocumentStore({
    file: sessionPinsPath(dshHome),
    decode: parseSessionPins,
    encode: serializeSessionPins,
    merge: (current) => normalizeSessionPins(current),
    readError: { code: SESSION_PINS_READ_FAILED, message: 'pinned sessions could not be read' },
    clone: (value) => ({ ...value, pinned: value.pinned.slice() })
  })
  return {
    async get() {
      return store.get()
    },
    /**
     * Apply one validated operation batch.
     * @param {Array<{ op: 'pin' | 'unpin', id: string }>} ops - validated operations.
     * @returns {Promise<{ version: number, rev: number, pinned: string[] }>} the document after the batch.
     */
    async apply(ops: PinOp[]) {
      return store.update((current) => {
        const next = applyPinOps(current, ops)
        return { next, changed: next.rev !== current.rev }
      })
    }
  }
}
