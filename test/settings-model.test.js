/**
 * Direct Node tests for the browser settings-payload model.
 *
 * Phase 3 moved the payload filter/merge out of `src/client.js` into
 * `src/browser/settings/model.ts`; the shared enums/defaults come from
 * `src/shared/protocol.ts`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ACTIVE_PROJECT_DAYS,
  DEFAULT_SETTINGS,
  PROMPT_HISTORY_MODIFIERS,
  RECENT_SESSION_MINUTES
} from '../src/shared/protocol.ts'
import { knownSettings, mergeSettingsPayload } from '../src/browser/settings/model.ts'

test('knownSettings keeps only accepted fields', () => {
  assert.deepEqual(knownSettings(null), {})
  assert.deepEqual(knownSettings({ promptHistoryModifier: 'ctrl' }), { promptHistoryModifier: 'ctrl' })
  assert.deepEqual(knownSettings({ promptHistoryModifier: 'bogus' }), {})
  assert.deepEqual(knownSettings({ recentSessionMinutes: 360 }), { recentSessionMinutes: 360 })
  assert.deepEqual(knownSettings({ recentSessionMinutes: 100 }), {})
  assert.deepEqual(knownSettings({ activeProjectDays: 14 }), { activeProjectDays: 14 })
  assert.deepEqual(knownSettings({ activeProjectDays: 2 }), {})
  assert.deepEqual(
    knownSettings({ promptHistoryModifier: 'off', recentSessionMinutes: 60, activeProjectDays: 30, extra: true }),
    { promptHistoryModifier: 'off', recentSessionMinutes: 60, activeProjectDays: 30 }
  )
})

test('mergeSettingsPayload merges over the shared defaults', () => {
  assert.deepEqual(mergeSettingsPayload(null), DEFAULT_SETTINGS)
  assert.deepEqual(mergeSettingsPayload({ settings: { recentSessionMinutes: 720 } }), {
    ...DEFAULT_SETTINGS,
    recentSessionMinutes: 720
  })
  assert.deepEqual(mergeSettingsPayload({ settings: { promptHistoryModifier: 'nope' } }), DEFAULT_SETTINGS)
})

test('the shared enums are the accepted value tables', () => {
  assert.deepEqual([...PROMPT_HISTORY_MODIFIERS], ['primary', 'alt', 'ctrl', 'shift', 'off'])
  assert.deepEqual([...RECENT_SESSION_MINUTES], [60, 120, 360, 720, 1440])
  assert.deepEqual([...ACTIVE_PROJECT_DAYS], [1, 3, 7, 14, 30])
})
