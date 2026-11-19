/**
 * Direct Node tests for the browser sidebar-width decisions.
 *
 * Phase 3 moved the pure helpers out of `src/client.js` into
 * `src/browser/sidebar-width/model.ts`, so they no longer need the vm test seam.
 * Attach, drag capture, persistence and the Host-route behavior stay covered by
 * `test/sidebar-width-client.test.js`, `test/sidebar-width.test.js` and the
 * live-GUI `sidebar.e2e.mjs` checks.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_ROUTE,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
  emptySidebarWidthCache,
  isValidSidebarWidth,
  normalizeSidebarWidthPayload,
  parseSidebarWidthCache,
  serializeSidebarWidthCache,
  shouldAdoptSidebarWidth,
  sidebarWidthBootstrap,
  sidebarWidthReopenRestore
} from '../src/browser/sidebar-width/model.ts'

test('the model exports the route, cache key and bounds', () => {
  assert.equal(SIDEBAR_WIDTH_ROUTE, 'api/power-suite.sidebar-width')
  assert.equal(SIDEBAR_WIDTH_STORAGE_KEY, 'power-suite.sidebar-width')
  assert.equal(SIDEBAR_WIDTH_MIN, 264)
  assert.equal(SIDEBAR_WIDTH_MAX, 420)
})

test('clamp and validity follow the shell range', () => {
  assert.equal(clampSidebarWidth(100), 264)
  assert.equal(clampSidebarWidth(500), 420)
  assert.equal(clampSidebarWidth(300.4), 300)
  assert.equal(clampSidebarWidth(Number.NaN), null)
  assert.equal(clampSidebarWidth('300'), null)
  assert.equal(isValidSidebarWidth(264), true)
  assert.equal(isValidSidebarWidth(420), true)
  assert.equal(isValidSidebarWidth(263), false)
  assert.equal(isValidSidebarWidth(421), false)
  assert.equal(isValidSidebarWidth(300.5), false)
  assert.equal(isValidSidebarWidth(null), false)
})

test('the browser cache document round-trips and rejects foreign shapes', () => {
  assert.deepEqual(parseSidebarWidthCache(null), emptySidebarWidthCache())
  assert.deepEqual(parseSidebarWidthCache('{"version":2,"sidebarWidth":300}'), emptySidebarWidthCache())
  assert.deepEqual(parseSidebarWidthCache('not json'), emptySidebarWidthCache())
  assert.deepEqual(parseSidebarWidthCache(JSON.stringify({ version: 1, sidebarWidth: 500, pending: 'yes' })), {
    sidebarWidth: null,
    pending: false
  })
  const cache = { sidebarWidth: 300, pending: true }
  assert.deepEqual(parseSidebarWidthCache(serializeSidebarWidthCache(cache)), cache)
})

test('the Host payload normalizer accepts only the documented document', () => {
  assert.deepEqual(normalizeSidebarWidthPayload({ version: 1, sidebarWidth: 300 }), { ok: true, sidebarWidth: 300 })
  assert.deepEqual(normalizeSidebarWidthPayload({ version: 1, sidebarWidth: null }), { ok: true, sidebarWidth: null })
  assert.deepEqual(normalizeSidebarWidthPayload({ version: 2, sidebarWidth: 300 }), { ok: false, sidebarWidth: null })
  assert.deepEqual(normalizeSidebarWidthPayload({ version: 1 }), { ok: false, sidebarWidth: null })
  assert.deepEqual(normalizeSidebarWidthPayload({ version: 1, sidebarWidth: 500 }), { ok: false, sidebarWidth: null })
  assert.deepEqual(normalizeSidebarWidthPayload(null), { ok: false, sidebarWidth: null })
})

test('boot, adoption and reopen decisions never fight a drag or a collapse', () => {
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 320, currentWidth: 280, dragging: false }), { apply: 320 })
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 320, currentWidth: 320, dragging: false }), { apply: null })
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 320, currentWidth: 280, dragging: true }), { apply: null })
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 320, currentWidth: 0, dragging: false }), { apply: null })

  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 280, remoteWidth: 320, dragging: false }), true)
  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 320, remoteWidth: 320, dragging: false }), false)
  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 0, remoteWidth: 320, dragging: false }), false)
  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 280, remoteWidth: 320, dragging: true }), false)

  assert.equal(sidebarWidthReopenRestore({ preferenceWidth: 320, width: 280, dragging: false }), 320)
  assert.equal(sidebarWidthReopenRestore({ preferenceWidth: 320, width: 320, dragging: false }), null)
  assert.equal(sidebarWidthReopenRestore({ preferenceWidth: 320, width: 0, dragging: false }), null)
  assert.equal(sidebarWidthReopenRestore({ preferenceWidth: 320, width: 280, dragging: true }), null)
})
