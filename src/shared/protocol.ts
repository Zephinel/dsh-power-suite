/**
 * Shared Host/browser protocol types.
 *
 * Shared by both halves: the Host feature modules import these types and
 * constants directly, and the browser entry/browser models import the settings
 * enums/defaults (Phase 3). `test/protocol-contract.test.js` asserts that the
 * constants have this single owner.
 *
 * @module
 */

/** Prompt-history shortcut modes accepted by the Host and the settings page. */
export type PromptHistoryModifier = 'primary' | 'alt' | 'ctrl' | 'shift' | 'off'

/** The in-memory settings document the Plugins page edits. */
export interface Settings {
  promptHistoryModifier: PromptHistoryModifier
  recentSessionMinutes: number
  activeProjectDays: number
}

/** One accepted patch to the settings document. */
export interface SettingsPatch {
  promptHistoryModifier?: PromptHistoryModifier
  recentSessionMinutes?: number
  activeProjectDays?: number
}

/** Modifier choices for the prompt-history shortcut. */
export const PROMPT_HISTORY_MODIFIERS = ['primary', 'alt', 'ctrl', 'shift', 'off'] as const

/** Field carrying the prompt-history shortcut modifier. */
export const PROMPT_HISTORY_MODIFIER_FIELD = 'promptHistoryModifier'

/** Field carrying the finished-Session retention window, in minutes. */
export const RECENT_SESSION_FIELD = 'recentSessionMinutes'

/** Field carrying the Active Projects retention window, in days. */
export const ACTIVE_PROJECT_FIELD = 'activeProjectDays'

/** Accepted finished-Session retention windows, in minutes. */
export const RECENT_SESSION_MINUTES = [60, 120, 360, 720, 1440] as const

/** Accepted Active Projects retention windows, in days. */
export const ACTIVE_PROJECT_DAYS = [1, 3, 7, 14, 30] as const

/** Fresh default settings shared by both halves. */
export const DEFAULT_SETTINGS: Settings = {
  promptHistoryModifier: 'primary',
  recentSessionMinutes: 120,
  activeProjectDays: 7
}
