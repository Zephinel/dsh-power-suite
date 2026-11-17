/**
 * Per-workspace default agent presets: durable state helpers and the small
 * JSON file the suite keeps under `$DSH_HOME`.
 *
 * The feature stores one map — Workspace id to preset id — because a Workspace
 * id is stable across renames while a path or title is not. A missing entry
 * means "follow the global default". Host-only data: nothing here reaches the
 * model or the Session log.
 */

import path from 'node:path'

import { createDocumentStore } from '../../host/document-store.ts'

/** Store schema version; bump when the shape changes. */
export const STORE_VERSION = 1

/** Region of `$DSH_HOME` the suite owns for its own files. */
export const STORE_DIRECTORY = 'dsh-power-suite'

/** File name inside {@link STORE_DIRECTORY}. */
export const STORE_FILE = 'workspace-presets.json'

/**
 * @typedef {{ version: number, workspaces: Record<string, string> }} PresetState
 */

/**
 * An empty store state.
 * @returns {PresetState} versioned empty state.
 */
export function emptyState() {
  return { version: STORE_VERSION, workspaces: {} }
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
 * Parse one persisted store file.
 *
 * A missing, unreadable, malformed, or wrong-version file reads as empty:
 * this map is a convenience preference, never a reason to fail a Session.
 * @param {unknown} text - file contents.
 * @returns {PresetState} parsed state.
 */
export function parseState(text) {
  if (typeof text !== 'string' || text.length === 0) return emptyState()
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return emptyState()
  }
  if (!isRecord(value) || value.version !== STORE_VERSION || !isRecord(value.workspaces)) {
    return emptyState()
  }
  const workspaces = {}
  for (const [workspaceId, preset] of Object.entries(value.workspaces)) {
    if (workspaceId.length === 0) continue
    if (typeof preset !== 'string' || preset.length === 0) continue
    workspaces[workspaceId] = preset
  }
  return { version: STORE_VERSION, workspaces }
}

/**
 * Serialize state as the file format.
 * @param {PresetState} state - store state.
 * @returns {string} file contents ending in one newline.
 */
export function serializeState(state) {
  return `${JSON.stringify({ version: STORE_VERSION, workspaces: state.workspaces }, null, 2)}\n`
}

/**
 * Read one Workspace's stored preset.
 * @param {PresetState} state - store state.
 * @param {string} workspaceId - Workspace identity.
 * @returns {string | null} the stored preset id, or null for no override.
 */
export function presetOf(state, workspaceId) {
  return Object.hasOwn(state.workspaces, workspaceId) ? state.workspaces[workspaceId] : null
}

/**
 * Produce the state after storing or clearing one Workspace's preset.
 *
 * Returns the same object when nothing changes, so callers can skip writing.
 * @param {PresetState} state - current state.
 * @param {string} workspaceId - Workspace identity.
 * @param {string | null} preset - preset id, or null to clear the override.
 * @returns {PresetState} the next state.
 */
export function withPreset(state, workspaceId, preset) {
  if (preset === null || preset === undefined) {
    if (!Object.hasOwn(state.workspaces, workspaceId)) return state
    const workspaces = { ...state.workspaces }
    delete workspaces[workspaceId]
    return { version: STORE_VERSION, workspaces }
  }
  if (state.workspaces[workspaceId] === preset) return state
  return {
    version: STORE_VERSION,
    workspaces: { ...state.workspaces, [workspaceId]: preset }
  }
}

/**
 * Decide whether a workspace default should be applied to a newly created
 * Session, from the preset the Session already runs.
 *
 * A Session that already runs the target needs nothing. A Session running any
 * preset other than the deployment's current default was composed under an
 * explicit request — the Creator flow, for example — and keeps it; only a
 * default-composed Session is replaced by the Workspace choice.
 * @param {{ current: string | null, globalDefault: string, target: string | null }} input - decision inputs.
 * @returns {boolean} whether to select the target preset.
 */
export function shouldApplyPreset(input) {
  const { current, globalDefault, target } = input
  if (typeof target !== 'string' || target.length === 0) return false
  if (current === target) return false
  if (current === null || current === undefined) return true
  return current === globalDefault
}

/**
 * The file path this feature owns inside one harness home.
 * @param {string} dshHome - the harness home directory.
 * @returns {string} absolute store path.
 */
export function storePath(dshHome) {
  return path.join(dshHome, STORE_DIRECTORY, STORE_FILE)
}

/**
 * Open the store over one harness home.
 *
 * Reads happen lazily; writes serialize on one chain, publish to disk before
 * memory, and land atomically through a temporary sibling plus rename.
 * @param {string} dshHome - the harness home directory.
 * @returns {{ get(workspaceId: string): Promise<string | null>, set(workspaceId: string, preset: string | null): Promise<string | null> }} the store.
 */
export function createPresetStore(dshHome) {
  const store = createDocumentStore({
    file: storePath(dshHome),
    decode: parseState,
    encode: serializeState
  })
  return {
    async get(workspaceId) {
      return presetOf(await store.get(), workspaceId)
    },
    async set(workspaceId, preset) {
      const next = await store.update((current) => {
        const updated = withPreset(current, workspaceId, preset)
        return { next: updated, changed: updated !== current }
      })
      return presetOf(next, workspaceId)
    }
  }
}
