/**
 * Unit tests for the interrupted-state consistency fix's decision rule.
 *
 * `src/client.js` is a browser classic script with no import surface, so
 * `test/helpers/client-module.mjs` evaluates it in a `node:vm` sandbox with the
 * test-hook flag set and materializes the plugin factory. Everything asserted
 * here comes from `hooks.interruptedState`: whether one Host record is
 * interrupted *and* idle, the single rule shared by the card rows, the native
 * row decoration and the composer seat.
 *
 * The rule is deliberately record-only: the shell's combined running flag is not
 * an input, because a parent Session whose own turn died while delegated
 * subagent children keep running must present the interrupted mark even though
 * the card lists it in the running group. The post-Continue phase is excluded by
 * the record's own `running` flag instead. Card/native DOM behavior is covered
 * by the live-GUI E2E (`test/browser/sidebar.e2e.mjs`, `--interrupted`).
 *
 * The seam is inert in production: `__POWER_SUITE_TEST_HOOKS__` only exists in
 * the harness.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientModule } from './helpers/client-module.mjs'

/** One materialization of the browser module; the seam is read from it. */
const client = loadClientModule()

/** The same materialization without the seam flag: the production path. */
const production = loadClientModule({ hooksFlag: false })

/** The pure interrupted-state helpers, or undefined until the seam lands. */
const seam = client.hooks?.interruptedState

/**
 * Build one settled Host interruption record.
 * @param {object} [overrides] - fields to override.
 * @returns {object} the record.
 */
function record(overrides = {}) {
  return { status: 'ready', interrupted: true, running: false, ...overrides }
}

if (seam === undefined) {
  test('interruptedState test seam is exposed', () => {
    assert.fail('hooks.interruptedState is missing: the interrupted-state seam did not register')
  })
} else {
  const active = seam.interruptedIndicatorActive

  test('the seam exposes the record-only decision rule and stays inert in production', () => {
    assert.equal(typeof active, 'function')
    assert.equal(production.hooks, undefined, 'the test-hook seam stays inert when the flag is not set')
  })

  test('unknown, loading, missing and error records never show the mark', () => {
    assert.equal(active(null), false)
    assert.equal(active(undefined), false)
    assert.equal(active({ status: 'loading', interrupted: false }), false)
    assert.equal(active({ status: 'missing', interrupted: false }), false)
    assert.equal(active({ status: 'error', interrupted: false }), false)
    // A settled Host answer is required even when a stale flag says interrupted.
    assert.equal(active({ status: 'loading', interrupted: true, running: false }), false)
    assert.equal(active({ status: 'error', interrupted: true, running: false }), false)
    assert.equal(active({ status: 'missing', interrupted: true, running: false }), false)
  })

  test('an interrupted idle Session shows the mark', () => {
    assert.equal(active(record()), true)
    // The optimistic local mark has no `running` field yet; it reads as idle.
    assert.equal(active(record({ running: undefined })), true)
  })

  test('a running Session hides the mark while its continuation turn runs', () => {
    assert.equal(active(record({ running: true })), false)
  })

  test('a completed or unknown-interruption record does not show the mark', () => {
    assert.equal(active(record({ interrupted: false })), false)
    assert.equal(active(record({ interrupted: false, running: true })), false)
  })
}
