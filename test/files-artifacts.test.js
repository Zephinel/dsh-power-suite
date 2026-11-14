/**
 * Unit tests for the Files-header Artifacts toggle's pure model.
 *
 * `src/client.js` is a browser classic script with no import surface, so
 * `test/helpers/client-module.mjs` evaluates it in a `node:vm` sandbox with the
 * test-hook flag set and materializes the plugin factory. Everything asserted
 * here comes from `hooks.filesArtifacts`: the phase reducer and the transition
 * timings. Rendering, the portal, Esc/Back and the live animation belong to
 * `test/browser/sidebar.e2e.mjs`.
 *
 * The seam is inert in production: `__POWER_SUITE_TEST_HOOKS__` only exists in
 * the harness.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientModule } from './helpers/client-module.mjs'

/** One materialization of the browser module; the seam is read from it. */
const client = loadClientModule()

/** The pure Files ↔ Artifacts helpers, or undefined until the feature lands. */
const filesArtifacts = client.hooks?.filesArtifacts

/** Copy a sandbox-realm value into this realm for strict deep equality. */
const plain = (value) => structuredClone(value)

if (filesArtifacts === undefined) {
  test('filesArtifacts test seam is exposed', () => {
    assert.fail('hooks.filesArtifacts is missing: the Files-header Artifacts action seam did not register')
  })
} else {
  test('phase model starts on Files with the documented phases and timings', () => {
    assert.deepEqual(plain(filesArtifacts.FILES_ARTIFACTS_PHASES), ['files', 'opening', 'open', 'closing'])
    assert.equal(filesArtifacts.FILES_ARTIFACTS_ENTER_MS, 180)
    assert.equal(filesArtifacts.FILES_ARTIFACTS_EXIT_MS, 160)
    assert.deepEqual(plain(filesArtifacts.filesArtifactsInitialState()), { phase: 'files' })
  })

  test('toggle opens with an enter transition and settles into open', () => {
    let state = filesArtifacts.filesArtifactsInitialState()
    state = filesArtifacts.filesArtifactsReduce(state, { type: 'toggle' })
    assert.deepEqual(plain(state), { phase: 'opening' })
    state = filesArtifacts.filesArtifactsReduce(state, { type: 'opened' })
    assert.deepEqual(plain(state), { phase: 'open' })
  })

  test('toggle closes with the reverse transition and returns to Files', () => {
    let state = { phase: 'open' }
    state = filesArtifacts.filesArtifactsReduce(state, { type: 'toggle' })
    assert.deepEqual(plain(state), { phase: 'closing' })
    state = filesArtifacts.filesArtifactsReduce(state, { type: 'closed' })
    assert.deepEqual(plain(state), { phase: 'files' })
  })

  test('toggling mid-transition flips the direction instead of stacking', () => {
    const opening = filesArtifacts.filesArtifactsReduce({ phase: 'opening' }, { type: 'toggle' })
    assert.deepEqual(plain(opening), { phase: 'closing' })
    const closing = filesArtifacts.filesArtifactsReduce({ phase: 'closing' }, { type: 'toggle' })
    assert.deepEqual(plain(closing), { phase: 'opening' })
  })

  test('late settlement timers are ignored outside their phase and keep object identity', () => {
    const open = { phase: 'open' }
    assert.equal(filesArtifacts.filesArtifactsReduce(open, { type: 'opened' }), open)
    const files = { phase: 'files' }
    assert.equal(filesArtifacts.filesArtifactsReduce(files, { type: 'closed' }), files)
    const closing = { phase: 'closing' }
    assert.equal(filesArtifacts.filesArtifactsReduce(closing, { type: 'opened' }), closing)
    const unknown = { type: 'nonsense' }
    assert.equal(filesArtifacts.filesArtifactsReduce(files, unknown), files)
  })

  test('a Session change always resets the view to Files', () => {
    for (const phase of ['opening', 'open', 'closing']) {
      const state = filesArtifacts.filesArtifactsReduce({ phase }, { type: 'session' })
      assert.deepEqual(plain(state), { phase: 'files' }, `phase ${phase} must reset`)
    }
    const files = { phase: 'files' }
    assert.equal(filesArtifacts.filesArtifactsReduce(files, { type: 'session' }), files)
  })

  test('phase timings are 180 ms in, 160 ms out, and instant under reduced motion', () => {
    assert.equal(filesArtifacts.filesArtifactsPhaseMs('opening', false), 180)
    assert.equal(filesArtifacts.filesArtifactsPhaseMs('closing', false), 160)
    assert.equal(filesArtifacts.filesArtifactsPhaseMs('open', false), 0)
    assert.equal(filesArtifacts.filesArtifactsPhaseMs('files', false), 0)
    for (const phase of ['opening', 'closing', 'open', 'files']) {
      assert.equal(filesArtifacts.filesArtifactsPhaseMs(phase, true), 0, `phase ${phase} must be instant under reduced motion`)
    }
  })
}
