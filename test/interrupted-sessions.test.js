import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeInterruption, isInterrupted, isInterruptedEnd, lastEventTime, lastTurnEndTime, lastTurnStartTime, lastTurnState, subagentInterruptionAfter } from '../src/features/interrupted-sessions/turns.js'

const start = (turn, seq) => ({ type: 'turn/start', seq, data: { turn } })
const end = (turn, seq, kind, cause) => ({
  type: 'turn/end',
  seq,
  data: { turn, reason: cause === undefined ? { kind } : { kind, reason: { kind: cause } } }
})

test('the fold tracks the last turn and its ending', () => {
  assert.deepEqual(lastTurnState([]), { turn: null, open: false, endReason: null, endCause: null })
  assert.deepEqual(lastTurnState([start(1, 0), end(1, 1, 'completed')]), { turn: 1, open: false, endReason: 'completed', endCause: null })
  assert.deepEqual(lastTurnState([start(1, 0), end(1, 1, 'completed'), start(2, 2)]), { turn: 2, open: true, endReason: null, endCause: null })
  assert.deepEqual(lastTurnState([start(1, 0), end(1, 1, 'aborted', 'disposed')]), { turn: 1, open: false, endReason: 'aborted', endCause: 'disposed' })
  // Repeated or backward boundaries never rewrite the standing turn.
  assert.deepEqual(lastTurnState([start(2, 2), start(1, 3)]), { turn: 2, open: true, endReason: null, endCause: null })
  assert.deepEqual(lastTurnState([start(2, 2), end(2, 3, 'interrupted'), start(2, 4)]), { turn: 2, open: false, endReason: 'interrupted', endCause: null })
})

test('only crash tails and Harness endings count as interrupted', () => {
  assert.equal(isInterrupted(lastTurnState([]), false), false)
  assert.equal(isInterrupted(lastTurnState([start(1, 0), end(1, 1, 'completed')]), false), false)
  assert.equal(isInterrupted(lastTurnState([start(1, 0), end(1, 1, 'interrupted')]), false), true)
  // An open tail is live work while its Agent runs, interruption otherwise.
  assert.equal(isInterrupted(lastTurnState([start(1, 0)]), true), false)
  assert.equal(isInterrupted(lastTurnState([start(1, 0)]), false), true)
  assert.equal(isInterrupted(lastTurnState([start(1, 0), end(1, 1, 'aborted')]), false), false)
  assert.equal(isInterrupted(lastTurnState([start(1, 0), end(1, 1, 'aborted', 'user')]), false), false)
  assert.equal(isInterrupted(lastTurnState([start(1, 0), end(1, 1, 'aborted', 'parent')]), false), false)
  assert.equal(isInterrupted(lastTurnState([start(1, 0), end(1, 1, 'aborted', 'hook')]), false), false)
  assert.equal(isInterrupted(lastTurnState([start(1, 0), end(1, 1, 'error')]), false), false)
})

test('a graceful Host shutdown is a Harness-caused interruption', () => {
  const shutdown = lastTurnState([start(1, 0), end(1, 1, 'aborted', 'disposed')])
  assert.equal(isInterrupted(shutdown, false), true)
  assert.deepEqual(describeInterruption(shutdown, false), {
    interrupted: true,
    running: false,
    turn: 1,
    reason: 'aborted',
    open: false
  })
})

test('the live event predicate matches the fold', () => {
  assert.equal(isInterruptedEnd({ kind: 'interrupted' }), true)
  assert.equal(isInterruptedEnd({ kind: 'aborted', reason: { kind: 'disposed' } }), true)
  assert.equal(isInterruptedEnd({ kind: 'aborted', reason: { kind: 'user' } }), false)
  assert.equal(isInterruptedEnd({ kind: 'aborted' }), false)
  assert.equal(isInterruptedEnd({ kind: 'completed' }), false)
  assert.equal(isInterruptedEnd(null), false)
})

test('the wire value carries the facts a badge needs', () => {
  assert.deepEqual(describeInterruption(lastTurnState([start(1, 0), end(1, 1, 'interrupted')]), false), {
    interrupted: true,
    running: false,
    turn: 1,
    reason: 'interrupted',
    open: false
  })
  assert.deepEqual(describeInterruption(lastTurnState([start(1, 0)]), true), {
    interrupted: false,
    running: true,
    turn: 1,
    reason: null,
    open: true
  })
})

test('subagent interruptions count when they belong to the parent latest turn', () => {
  const parent = [
    { type: 'turn/start', time: 1000, data: { turn: 1 } },
    { type: 'turn/end', time: 2000, data: { turn: 1, reason: { kind: 'completed' } } }
  ]
  assert.equal(lastEventTime(parent), 2000)
  assert.equal(lastTurnEndTime(parent), 2000)
  assert.equal(lastTurnStartTime(parent), 1000)
  // Child starts during the parent turn but goes silent: still the parent's work.
  assert.equal(subagentInterruptionAfter(1000, 2000, true, false, 1500, 1500), true)
  // Child starts before this parent turn and stopped before the parent ended: old work.
  assert.equal(subagentInterruptionAfter(1000, 2000, true, false, 500, 1500), false)
  // Child was still active after the parent's latest turn end.
  assert.equal(subagentInterruptionAfter(1000, 2000, true, false, 500, 2500), true)
  assert.equal(subagentInterruptionAfter(1000, 2000, false, false, 1500, 2500), false)
  // A live child is working, not interrupted.
  assert.equal(subagentInterruptionAfter(1000, 2000, true, true, 1500, 1500), false)
  assert.equal(subagentInterruptionAfter(null, null, true, false, 1500, 1500), false)
})
