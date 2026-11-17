/**
 * Host-shared left sidebar width, persisted for the suite's layout preference.
 *
 * The shell keeps the left sidebar width only in memory, so a reload or a
 * second browser falls back to the default. The Host owns one scalar document
 * under $DSH_HOME so every browser and profile using the same DSH home (i.e.
 * every paired device) agrees on the width; clients keep a localStorage cache
 * for the first paint and write the dragged width through the route.
 *
 * Wire/disk document:
 *
 *   { "version": 1, "sidebarWidth": <integer 264..420> | null }
 *
 * `null` means "no width has ever been persisted". There is no rev/ops log:
 * this is one last-write-wins scalar preference, so arrival order is the
 * natural semantics. The file is atomic (a temporary sibling is renamed over
 * the target), so a crash can never leave half a document behind.
 */

import path from 'node:path'

import { createDocumentStore } from '../../host/document-store.js'

/** Store schema version; bump when the document shape changes. */
export const SIDEBAR_WIDTH_VERSION = 1

/** Region of `$DSH_HOME` the suite owns for its own files. */
export const SIDEBAR_WIDTH_DIRECTORY = 'dsh-power-suite'

/** File name inside {@link SIDEBAR_WIDTH_DIRECTORY}. */
export const SIDEBAR_WIDTH_FILE = 'sidebar-width.json'

/** Narrowest accepted width in px, matching the shell's clamp lower bound. */
export const SIDEBAR_WIDTH_MIN = 264

/** Widest accepted width in px, matching the shell's clamp upper bound. */
export const SIDEBAR_WIDTH_MAX = 420

/** Typed error raised when the durable document exists but cannot be read. */
export const SIDEBAR_WIDTH_READ_FAILED = 'SIDEBAR_WIDTH_READ_FAILED'

/**
 * Whether one filesystem error means "document absent" (legitimately empty).
 * @param {unknown} error - thrown error.
 * @returns {boolean} whether it is ENOENT.
 */
function isNotFound(error) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
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
 * Fresh default document: versioned with no persisted width.
 * @returns {{ version: number, sidebarWidth: number | null }} defaults.
 */
export function defaultSidebarWidthDocument() {
  return { version: SIDEBAR_WIDTH_VERSION, sidebarWidth: null }
}

/**
 * Whether one value is an accepted sidebar width.
 *
 * The bounds are the shell's own `clampWidth(px, 264, 420)` contract; they are
 * duplicated here because the Host must not accept a value the browser side
 * could never apply.
 * @param {unknown} value - candidate width.
 * @returns {boolean} whether it is an integer inside the accepted range.
 */
export function isSidebarWidth(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return false
  return value >= SIDEBAR_WIDTH_MIN && value <= SIDEBAR_WIDTH_MAX
}

/**
 * Parse one persisted sidebar-width document.
 *
 * A missing, empty, corrupt, version-mismatched, or out-of-range document reads
 * as the default document, so a broken file can never apply an unusable width.
 * Never throws.
 * @param {unknown} text - file contents.
 * @returns {{ version: number, sidebarWidth: number | null }} the document.
 */
export function parseSidebarWidthDocument(text) {
  if (typeof text !== 'string' || text.length === 0) return defaultSidebarWidthDocument()
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return defaultSidebarWidthDocument()
  }
  if (!isRecord(value) || value.version !== SIDEBAR_WIDTH_VERSION) return defaultSidebarWidthDocument()
  if (!isSidebarWidth(value.sidebarWidth)) return defaultSidebarWidthDocument()
  return { version: SIDEBAR_WIDTH_VERSION, sidebarWidth: value.sidebarWidth }
}

/**
 * Serialize one document as the file format.
 * @param {{ version: number, sidebarWidth: number | null }} document - document to write.
 * @returns {string} file contents ending in one newline.
 */
export function serializeSidebarWidthDocument(document) {
  const source = isRecord(document) ? document : {}
  const sidebarWidth = isSidebarWidth(source.sidebarWidth) ? source.sidebarWidth : null
  return `${JSON.stringify({ version: SIDEBAR_WIDTH_VERSION, sidebarWidth }, null, 2)}\n`
}

/**
 * The sidebar-width file path inside one harness home.
 * @param {string} dshHome - harness home directory.
 * @returns {string} absolute file path.
 */
export function sidebarWidthPath(dshHome) {
  return path.join(dshHome, SIDEBAR_WIDTH_DIRECTORY, SIDEBAR_WIDTH_FILE)
}

/**
 * Open the sidebar-width store over one harness home.
 *
 * Reads are lazy and single-flight (one pending read serves every concurrent
 * caller). Writes serialize on one chain, validate before touching the disk,
 * land atomically through a temporary sibling plus rename, and publish to
 * memory only after the rename.
 * @param {string} dshHome - harness home directory.
 * @returns {{ get(): Promise<{ version: number, sidebarWidth: number | null }>, set(sidebarWidth: number): Promise<{ version: number, sidebarWidth: number | null }> }} the store.
 */
export function createSidebarWidthStore(dshHome) {
  const store = createDocumentStore({
    file: sidebarWidthPath(dshHome),
    decode: parseSidebarWidthDocument,
    encode: serializeSidebarWidthDocument,
    readError: { code: SIDEBAR_WIDTH_READ_FAILED, message: 'sidebar width could not be read' },
    clone: (value) => ({ ...value })
  })
  return {
    async get() {
      return store.get()
    },
    /**
     * Persist one accepted width.
     * @param {number} sidebarWidth - integer inside the accepted range.
     * @returns {Promise<{ version: number, sidebarWidth: number | null }>} the document after the write.
     */
    async set(sidebarWidth) {
      if (!isSidebarWidth(sidebarWidth)) {
        throw new TypeError(`sidebarWidth must be an integer between ${SIDEBAR_WIDTH_MIN} and ${SIDEBAR_WIDTH_MAX}`)
      }
      return store.update(() => ({ next: { version: SIDEBAR_WIDTH_VERSION, sidebarWidth } }))
    }
  }
}
