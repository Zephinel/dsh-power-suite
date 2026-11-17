/**
 * Shared Host/browser protocol types.
 *
 * Phase 1 of the TypeScript migration (docs/plans/typescript-migration.md):
 * these are type-only declarations so the Host half and, once the build exists,
 * the browser half can import the same record vocabulary. The module has no
 * runtime behavior; it exists to be imported for JSDoc types.
 * @module
 */

/**
 * The in-memory settings document the Plugins page edits.
 * @typedef {object} Settings
 * @property {'primary' | 'alt' | 'ctrl' | 'shift' | 'off'} promptHistoryModifier - prompt-history shortcut mode.
 * @property {number} recentSessionMinutes - finished-Session retention window in minutes.
 * @property {number} activeProjectDays - Active-project retention window in days.
 */

/**
 * One accepted patch to the settings document.
 * @typedef {object} SettingsPatch
 * @property {'primary' | 'alt' | 'ctrl' | 'shift' | 'off'} [promptHistoryModifier] - prompt-history shortcut mode.
 * @property {number} [recentSessionMinutes] - finished-Session retention window in minutes.
 * @property {number} [activeProjectDays] - Active-project retention window in days.
 */

export {}
