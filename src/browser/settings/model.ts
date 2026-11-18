/**
 * Pure settings-payload model for the browser half.
 *
 * The Host owns the durable settings document; the browser only keeps the
 * fields this build understands and merges them over the shared defaults.
 *
 * @module
 */
import {
  ACTIVE_PROJECT_DAYS,
  DEFAULT_SETTINGS,
  PROMPT_HISTORY_MODIFIERS,
  RECENT_SESSION_MINUTES,
  type Settings
} from '../../shared/protocol.ts'

/**
 * Keep only settings fields this build understands.
 * @param raw - decoded settings object.
 * @returns recognized fields.
 */
export function knownSettings(raw: unknown): Partial<Settings> {
  const settings: Partial<Settings> = {}
  if (raw === null || typeof raw !== 'object') return settings
  const value = raw as Record<string, unknown>
  if ((PROMPT_HISTORY_MODIFIERS as readonly unknown[]).includes(value.promptHistoryModifier)) {
    settings.promptHistoryModifier = value.promptHistoryModifier as Settings['promptHistoryModifier']
  }
  if ((RECENT_SESSION_MINUTES as readonly unknown[]).includes(value.recentSessionMinutes)) {
    settings.recentSessionMinutes = value.recentSessionMinutes as number
  }
  if ((ACTIVE_PROJECT_DAYS as readonly unknown[]).includes(value.activeProjectDays)) {
    settings.activeProjectDays = value.activeProjectDays as number
  }
  return settings
}

/**
 * Merge one Host settings payload over the shared defaults.
 * @param payload - decoded response body (`{ settings }`).
 * @returns the merged settings.
 */
export function mergeSettingsPayload(payload: unknown): Settings {
  const raw = payload !== null && typeof payload === 'object'
    ? (payload as Record<string, unknown>).settings
    : undefined
  return { ...DEFAULT_SETTINGS, ...knownSettings(raw) }
}
