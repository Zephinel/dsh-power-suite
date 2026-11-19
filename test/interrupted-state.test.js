/**
 * Unit tests for the interrupted-state decision rule.
 *
 * Phase 3 moved the record-only rule to
 * `src/browser/interrupted-sessions/model.ts`, so it is imported directly
 * instead of going through the vm test seam. The rule is deliberately
 * record-only: the shell's combined running flag is not an input, because a
 * parent Session whose own turn died while delegated subagent children keep
 * running must present the interrupted mark even though the card lists it in the
 * running group. The post-Continue phase is excluded by the record's own
 * `running` flag instead. Card/native DOM behavior stays covered by the live-GUI
 * E2E (`test/browser/sidebar.e2e.mjs`, `--interrupted`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  interruptedCardMark,
  interruptedIndicatorActive as active
} from '../src/browser/interrupted-sessions/model.ts'

/**
 * Build one settled Host interruption record.
 * @param {object} [overrides] - fields to override.
 * @returns {object} the record.
 */
function record(overrides = {}) {
  return { status: 'ready', interrupted: true, running: false, ...overrides }
}

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

test('the card row decision is record-only: a running shell row cannot suppress a settled interrupted record', () => {
  assert.equal(interruptedCardMark.length, 1, 'the card decision takes only the Host record')
  assert.equal(interruptedCardMark(record()), true, 'an interrupted-idle record marks the card row')
  assert.equal(interruptedCardMark(record({ running: true })), false, 'the post-Continue phase hides the mark')
  assert.equal(interruptedCardMark(record({ status: 'loading' })), false)
  assert.equal(interruptedCardMark(null), false)
})
