/**
 * Unit tests for the composer image gallery's pure model.
 *
 * The model lives in `src/browser/composer-gallery/model.ts`; this file imports
 * it directly (no vm seam) and covers index clamping, step direction,
 * rail-reconciliation after an attachment disappears, and the wheel-gesture
 * debounce. Live DOM collection, the overlay and navigation stay covered by
 * `test/browser/sidebar.e2e.mjs` (`gallery-*` checks).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PSG_WHEEL_COOLDOWN_MS,
  PSG_WHEEL_STEP_PX,
  psgClampIndex,
  psgCollectImages,
  psgStepIndex,
  psgSyncState,
  psgWheelDecision
} from '../src/browser/composer-gallery/model.ts'

/** Copy a sandbox-realm value into this realm for strict deep equality. */
const plain = (value) => structuredClone(value)

/** Build a rail snapshot entry. */
function image(src, name = src.slice(-4)) {
  return { src, name }
}

  test('indices clamp into the image list', () => {
    assert.equal(psgClampIndex(0, 3), 0)
    assert.equal(psgClampIndex(2, 3), 2)
    assert.equal(psgClampIndex(9, 3), 2)
    assert.equal(psgClampIndex(-4, 3), 0)
    assert.equal(psgClampIndex(1, 0), 0)
    assert.equal(psgClampIndex(Number.NaN, 3), 0)
    assert.equal(psgClampIndex(1.9, 3), 1)
  })

  test('previous/next clamp at the ends instead of wrapping', () => {
    assert.equal(psgStepIndex(0, 3, -1), 0, 'previous at the first image is a no-op')
    assert.equal(psgStepIndex(2, 3, 1), 2, 'next at the last image is a no-op')
    assert.equal(psgStepIndex(1, 3, 1), 2)
    assert.equal(psgStepIndex(1, 3, -1), 0)
    assert.equal(psgStepIndex(0, 1, 1), 0, 'single image never moves')
    assert.equal(psgStepIndex(0, 1, -1), 0)
    assert.equal(psgStepIndex(1, 3, 0), 1)
    assert.equal(psgStepIndex(5, 3, 1), 2, 'out-of-range input clamps first')
  })

  test('a rail refresh keeps the displayed image when it still exists', () => {
    const images = [image('blob:a'), image('blob:b'), image('blob:c')]
    const next = psgSyncState(images, 1, 'blob:c')
    assert.deepEqual(plain(next), { images: plain(images), index: 2 })
    const same = psgSyncState(images, 1, 'blob:b')
    assert.equal(same.index, 1)
  })

  test('a removed image clamps to the neighbour and an emptied rail clears the list', () => {
    const before = [image('blob:a'), image('blob:b'), image('blob:c')]
    const after = [image('blob:a'), image('blob:c')]
    const removedCurrent = psgSyncState(after, 2, 'blob:b')
    assert.deepEqual(plain(removedCurrent), { images: plain(after), index: 1 })
    const removedLast = psgSyncState(before.slice(0, 2), 2, 'blob:c')
    assert.deepEqual(plain(removedLast), { images: plain(before.slice(0, 2)), index: 1 })
    assert.deepEqual(plain(psgSyncState([], 1, 'blob:a')), { images: [], index: 0 })
    assert.deepEqual(plain(psgSyncState(null, 0, '')), { images: [], index: 0 })
  })

  test('wheel deltas accumulate into exactly one step per gesture', () => {
    const below = psgWheelDecision(0, 10, 1000, Number.NEGATIVE_INFINITY)
    assert.equal(below.step, 0, 'small deltas do not step')
    assert.equal(below.accum, 10)
    const reached = psgWheelDecision(10, 20, 1000, Number.NEGATIVE_INFINITY)
    assert.deepEqual(plain(reached), { accum: 0, step: 1, lastStepAt: 1000 })
    const reverse = psgWheelDecision(0, -30, 1000, Number.NEGATIVE_INFINITY)
    assert.deepEqual(plain(reverse), { accum: 0, step: -1, lastStepAt: 1000 })
  })

  test('the wheel cooldown swallows momentum after a step, then allows the next one', () => {
    const during = psgWheelDecision(0, 120, 1100, 1000)
    assert.deepEqual(plain(during), { accum: 0, step: 0, lastStepAt: 1000 }, 'events inside the cooldown never step')
    const after = psgWheelDecision(0, 120, 1000 + PSG_WHEEL_COOLDOWN_MS, 1000)
    assert.equal(after.step, 1, 'a gesture after the cooldown steps again')
    assert.deepEqual(plain(psgWheelDecision(0, 20, 5000, 4000)), { accum: 20, step: 0, lastStepAt: 4000 })
  })

  test('the collector is inert without a composer element', () => {
    assert.deepEqual(plain(psgCollectImages(null)), [])
    assert.deepEqual(plain(psgCollectImages(undefined)), [])
  })
