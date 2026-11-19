/**
 * Suite settings: the durable preference document the Plugins page edits.
 *
 * Scope is deliberately small: the suite owns only preferences that change its
 * browser behavior, not per-Session or per-Workspace state. The document holds
 * the prompt-history shortcut modifier and the two Dynamic Workspaces windows:
 * how long a finished Session stays in the Running & recent card, and how long
 * a project stays in Active Projects before it becomes inactive. A missing,
 * unreadable, or malformed file reads as the defaults, so a broken preference
 * can never disable a feature silently at load time.
 */

import path from 'node:path'

import { createDocumentStore } from '../../host/document-store.ts'
import {
  ACTIVE_PROJECT_DAYS,
  ACTIVE_PROJECT_FIELD,
  DEFAULT_SETTINGS,
  PROMPT_HISTORY_MODIFIERS,
  PROMPT_HISTORY_MODIFIER_FIELD,
  RECENT_SESSION_FIELD,
  RECENT_SESSION_MINUTES,
  type PromptHistoryModifier,
  type Settings,
  type SettingsPatch
} from '../../shared/protocol.ts'

export {
  ACTIVE_PROJECT_DAYS,
  ACTIVE_PROJECT_FIELD,
  DEFAULT_SETTINGS,
  PROMPT_HISTORY_MODIFIERS,
  PROMPT_HISTORY_MODIFIER_FIELD,
  RECENT_SESSION_FIELD,
  RECENT_SESSION_MINUTES
} from '../../shared/protocol.ts'

/** Store schema version; bump when the shape changes. */
export const SETTINGS_VERSION = 2

/** Version 1 (modifier-only) files are still accepted and upgraded on read. */
const SETTINGS_VERSION_1 = 1

/** Region of `$DSH_HOME` the suite owns for its own files. */
export const SETTINGS_DIRECTORY = 'dsh-power-suite'

/** File name inside {@link SETTINGS_DIRECTORY}. */
export const SETTINGS_FILE = 'settings.json'

/** Default finished-Session retention window in minutes. */
export const DEFAULT_RECENT_SESSION_MINUTES = DEFAULT_SETTINGS.recentSessionMinutes

/** Default Active Projects retention window in days. */
export const DEFAULT_ACTIVE_PROJECT_DAYS = DEFAULT_SETTINGS.activeProjectDays

/**
 * Fresh default settings.
 * @returns {Settings} defaults.
 */
export function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS }
}

/**
 * Narrow parsed JSON to a plain object.
 * @param {unknown} value - decoded value.
 * @returns {value is Record<string, unknown>} whether it is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a value is one of the accepted prompt-history modifiers.
 * @param {unknown} value - candidate.
 * @returns {boolean} whether it is accepted.
 */
export function isPromptHistoryModifier(value: unknown): value is PromptHistoryModifier {
  return typeof value === 'string' && (PROMPT_HISTORY_MODIFIERS as readonly unknown[]).includes(value)
}

/**
 * Whether a value is an accepted finished-Session retention window.
 * @param {unknown} value - candidate.
 * @returns {boolean} whether it is accepted.
 */
export function isRecentSessionMinutes(value: unknown): value is number {
  return typeof value === 'number' && (RECENT_SESSION_MINUTES as readonly number[]).includes(value)
}

/**
 * Whether a value is an accepted Active Projects retention window.
 * @param {unknown} value - candidate.
 * @returns {boolean} whether it is accepted.
 */
export function isActiveProjectDays(value: unknown): value is number {
  return typeof value === 'number' && (ACTIVE_PROJECT_DAYS as readonly number[]).includes(value)
}

/**
 * Parse one persisted settings file.
 * Version 1 files carry only the shortcut modifier and upgrade to defaults for
 * the window fields.
 * @param {unknown} text - file contents.
 * @returns {Settings} settings with defaults for absent fields.
 */
export function parseSettings(text: string): Settings {
  if (typeof text !== 'string' || text.length === 0) return defaultSettings()
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return defaultSettings()
  }
  if (!isRecord(value)
    || (value.version !== SETTINGS_VERSION && value.version !== SETTINGS_VERSION_1)
    || !isRecord(value.settings)) {
    return defaultSettings()
  }
  const settings = defaultSettings()
  if (isPromptHistoryModifier(value.settings[PROMPT_HISTORY_MODIFIER_FIELD])) {
    settings.promptHistoryModifier = value.settings[PROMPT_HISTORY_MODIFIER_FIELD]
  }
  if (isRecentSessionMinutes(value.settings[RECENT_SESSION_FIELD])) {
    settings.recentSessionMinutes = value.settings[RECENT_SESSION_FIELD]
  }
  if (isActiveProjectDays(value.settings[ACTIVE_PROJECT_FIELD])) {
    settings.activeProjectDays = value.settings[ACTIVE_PROJECT_FIELD]
  }
  return settings
}

/**
 * Serialize settings as the file format.
 * @param {Settings} settings - settings.
 * @returns {string} file contents ending in one newline.
 */
export function serializeSettings(settings: Settings): string {
  return `${JSON.stringify({ version: SETTINGS_VERSION, settings }, null, 2)}\n`
}

/**
 * Validate one settings patch from the page.
 * @param {unknown} patch - decoded request body.
 * @returns {{ ok: true, value: import('../../shared/protocol.ts').SettingsPatch } | { ok: false, message: string }} the accepted fields or a failure.
 */
export function validatePatch(patch: unknown): { ok: true; value: SettingsPatch } | { ok: false; message: string } {
  if (!isRecord(patch)) return { ok: false, message: 'patch must be one JSON object' }
  const fields = Object.keys(patch)
  if (fields.length === 0) return { ok: false, message: 'patch is empty' }
  const value: SettingsPatch = {}
  for (const field of fields) {
    const fieldValue = patch[field]
    if (field === PROMPT_HISTORY_MODIFIER_FIELD) {
      if (!isPromptHistoryModifier(fieldValue)) {
        return { ok: false, message: `invalid value for "${field}"` }
      }
      value.promptHistoryModifier = fieldValue
      continue
    }
    if (field === RECENT_SESSION_FIELD) {
      if (!isRecentSessionMinutes(fieldValue)) {
        return { ok: false, message: `invalid value for "${field}"` }
      }
      value.recentSessionMinutes = fieldValue
      continue
    }
    if (field === ACTIVE_PROJECT_FIELD) {
      if (!isActiveProjectDays(fieldValue)) {
        return { ok: false, message: `invalid value for "${field}"` }
      }
      value.activeProjectDays = fieldValue
      continue
    }
    return { ok: false, message: `unknown setting "${field}"` }
  }
  return { ok: true, value }
}

/**
 * The settings file path inside one harness home.
 * @param {string} dshHome - harness home directory.
 * @returns {string} absolute file path.
 */
export function settingsPath(dshHome: string) {
  return path.join(dshHome, SETTINGS_DIRECTORY, SETTINGS_FILE)
}

/**
 * Open the settings store over one harness home.
 *
 * Reads are lazy; writes serialize on one chain, land atomically through a
 * temporary sibling plus rename, and publish to memory only after the rename.
 * @param {string} dshHome - harness home directory.
 * @returns {{ get(): Promise<Settings>, update(patch: import('../../shared/protocol.ts').SettingsPatch): Promise<Settings> }} the store.
 */
export function createSettingsStore(dshHome: string) {
  const store = createDocumentStore({
    file: settingsPath(dshHome),
    decode: parseSettings,
    encode: serializeSettings,
    clone: (value) => ({ ...value })
  })
  return {
    async get() {
      return store.get()
    },
    /**
     * Apply one accepted patch to the settings document.
     * @param {import('../../shared/protocol.ts').SettingsPatch} patch - accepted fields.
     * @returns {Promise<Settings>} the document after the patch.
     */
    async update(patch: SettingsPatch) {
      return store.update((current) => {
        const next = { ...current, ...patch }
        const changed = (Object.keys(patch) as Array<keyof SettingsPatch>).some((field) => current[field] !== next[field])
        return { next, changed }
      })
    }
  }
}
