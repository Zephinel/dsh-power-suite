/**
 * Shared Host/browser protocol types.
 *
 * Phase 2 of the TypeScript migration: the Host half imports these types
 * directly. Once the browser half becomes modules (Phase 3) it can import the
 * same vocabulary; today it still duplicates literals guarded by
 * `test/protocol-contract.test.js`.
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
