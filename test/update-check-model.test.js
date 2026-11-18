/**
 * Direct Node tests for the browser update-prompt model.
 *
 * Phase 3 moved the pure state machine out of `src/client.js` into
 * `src/browser/update-check/model.ts`, so it can be imported and asserted in
 * Node without the vm/global test seam. The browser controller and the
 * `shell.overlay` card stay covered by the live-GUI checks.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  UPDATE_STORAGE_KEY,
  decideUpdatePrompt,
  normalizeUpdatePayload,
  noteUpdatePromptLater,
  offersSilence,
  parseUpdatePromptState,
  serializeUpdatePromptState,
  silenceUpdatePromptVersion
} from '../src/browser/update-check/model.ts'
import { isNewerStableVersion, parseStableVersion } from '../src/browser/update-check/versions.ts'
import {
  isNewerStableVersion as hostIsNewerStableVersion,
  parseStableVersion as hostParseStableVersion
} from '../src/features/update-check/version.ts'

/** A valid Host answer naming one newer stable version. */
const payload = (overrides = {}) => ({
  current: '0.1.0',
  latest: '0.2.0',
  updateAvailable: true,
  highlights: ['A'],
  ...overrides
})

test('the model exports the stable localStorage key', () => {
  assert.equal(UPDATE_STORAGE_KEY, 'power-suite.update-prompt')
})

test('an unusable payload never prompts and keeps the recorded cycle', () => {
  assert.equal(normalizeUpdatePayload({ updateAvailable: false }), null)
  assert.equal(normalizeUpdatePayload(payload({ latest: '0.2.0-rc.1' })), null)
  const state = { silencedVersion: '0.2.0' }
  assert.deepEqual(decideUpdatePrompt(null, state), { action: 'none', state })
  assert.deepEqual(decideUpdatePrompt(payload({ current: '0.0.0' }), state), { action: 'none', state })
  // A readable "already current" answer retires the cycle.
  assert.deepEqual(decideUpdatePrompt(payload({ latest: '0.1.0' }), state), { action: 'none', state: {} })
})

test('a newer stable version prompts with capped highlights', () => {
  const view = normalizeUpdatePayload(payload({ highlights: [' A ', '', 'B', 'C', 'D', 'E', 'F', 'G'] }))
  assert.deepEqual(view, { current: '0.1.0', latest: '0.2.0', updateAvailable: true, highlights: ['A', 'B', 'C', 'D', 'E', 'F'] })
  const decision = decideUpdatePrompt(view, {})
  assert.equal(decision.action, 'prompt')
  assert.deepEqual(decision.prompt, { current: '0.1.0', latest: '0.2.0', highlights: ['A', 'B', 'C', 'D', 'E', 'F'] })
  assert.equal(decision.canSilence, false)
})

test('later clicks and silence are per version and round-trip through storage', () => {
  let state = {}
  for (let click = 1; click <= 3; click += 1) {
    state = noteUpdatePromptLater(state, '0.2.0')
    assert.equal(state.laterClicks, click)
    assert.equal(offersSilence(state, '0.2.0'), click >= 3)
  }
  assert.equal(offersSilence(state, '0.3.0'), false)
  const silenced = silenceUpdatePromptVersion(state, '0.2.0')
  assert.deepEqual(silenced, { silencedVersion: '0.2.0' })
  assert.deepEqual(decideUpdatePrompt(payload(), silenced), { action: 'none', state: silenced })

  const stored = serializeUpdatePromptState(state)
  assert.deepEqual(parseUpdatePromptState(stored), state)
  assert.deepEqual(parseUpdatePromptState('not json'), {})
  assert.deepEqual(parseUpdatePromptState(JSON.stringify({ schema: 9 })), {})
})

test('browser and Host stable-version tables agree', () => {
  const samples = ['0.1.0', ' 0.2.0 ', '1.2.3', '0.2.0-rc.1', '0.2.0+build', '1.2', '1.2.3.4', 'x', '', null, undefined, 1.2]
  for (const sample of samples) {
    assert.deepEqual(parseStableVersion(sample) ?? null, hostParseStableVersion(sample) ?? null)
  }
  const pairs = [['0.2.0', '0.1.0'], ['0.1.0', '0.2.0'], ['0.0.0', '0.0.0'], ['0.2.0-rc.1', '0.1.0'], ['1.0.0', '0.99.99']]
  for (const [latest, current] of pairs) {
    assert.equal(isNewerStableVersion(latest, current), hostIsNewerStableVersion(latest, current))
  }
})
