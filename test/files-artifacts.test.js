/**
 * Unit tests for the Files-header Artifacts toggle's pure model.
 *
 * Phase 3 moved the phase reducer and transition timings to
 * `src/browser/artifacts/model.ts`, so they are imported directly instead of
 * going through the vm test seam. Rendering, the portal, Esc/Back and the live
 * animation belong to `test/browser/sidebar.e2e.mjs`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  FILES_ARTIFACTS_ENTER_MS,
  FILES_ARTIFACTS_EXIT_MS,
  FILES_ARTIFACTS_PHASES,
  filesArtifactsInitialState,
  filesArtifactsPhaseMs,
  filesArtifactsReduce
} from '../src/browser/artifacts/model.ts'

test('phase model starts on Files with the documented phases and timings', () => {
  assert.deepEqual([...FILES_ARTIFACTS_PHASES], ['files', 'opening', 'open', 'closing'])
  assert.equal(FILES_ARTIFACTS_ENTER_MS, 180)
  assert.equal(FILES_ARTIFACTS_EXIT_MS, 160)
  assert.deepEqual(filesArtifactsInitialState(), { phase: 'files' })
})

test('toggle opens with an enter transition and settles into open', () => {
  let state = filesArtifactsInitialState()
  state = filesArtifactsReduce(state, { type: 'toggle' })
  assert.deepEqual(state, { phase: 'opening' })
  state = filesArtifactsReduce(state, { type: 'opened' })
  assert.deepEqual(state, { phase: 'open' })
})

test('toggle closes with the reverse transition and returns to Files', () => {
  let state = { phase: 'open' }
  state = filesArtifactsReduce(state, { type: 'toggle' })
  assert.deepEqual(state, { phase: 'closing' })
  state = filesArtifactsReduce(state, { type: 'closed' })
  assert.deepEqual(state, { phase: 'files' })
})

test('toggling mid-transition flips the direction instead of stacking', () => {
  assert.deepEqual(filesArtifactsReduce({ phase: 'opening' }, { type: 'toggle' }), { phase: 'closing' })
  assert.deepEqual(filesArtifactsReduce({ phase: 'closing' }, { type: 'toggle' }), { phase: 'opening' })
})

test('late settlement timers are ignored outside their phase and keep object identity', () => {
  const open = { phase: 'open' }
  assert.equal(filesArtifactsReduce(open, { type: 'opened' }), open)
  const files = { phase: 'files' }
  assert.equal(filesArtifactsReduce(files, { type: 'closed' }), files)
  const closing = { phase: 'closing' }
  assert.equal(filesArtifactsReduce(closing, { type: 'opened' }), closing)
  assert.equal(filesArtifactsReduce(files, { type: 'nonsense' }), files)
})

test('a Session change always resets the view to Files', () => {
  for (const phase of ['opening', 'open', 'closing']) {
    assert.deepEqual(filesArtifactsReduce({ phase }, { type: 'session' }), { phase: 'files' }, `phase ${phase} must reset`)
  }
  const files = { phase: 'files' }
  assert.equal(filesArtifactsReduce(files, { type: 'session' }), files)
})

test('phase timings are 180 ms in, 160 ms out, and instant under reduced motion', () => {
  assert.equal(filesArtifactsPhaseMs('opening', false), 180)
  assert.equal(filesArtifactsPhaseMs('closing', false), 160)
  assert.equal(filesArtifactsPhaseMs('open', false), 0)
  assert.equal(filesArtifactsPhaseMs('files', false), 0)
  for (const phase of ['opening', 'closing', 'open', 'files']) {
    assert.equal(filesArtifactsPhaseMs(phase, true), 0, `phase ${phase} must be instant under reduced motion`)
  }
})
