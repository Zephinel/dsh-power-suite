/**
 * Unit tests for the persisted, Host-synced left sidebar width (browser half).
 *
 * The pure decisions live in `src/browser/sidebar-width/model.ts` and are
 * imported directly here: the width clamp/validity boundaries, the browser-cache
 * document, the Host payload normalizer, and the two decisions that keep
 * boot/remote adoption from fighting the user (collapsed, dragging, unchanged).
 * The browser module itself is materialized with
 * `test/helpers/client-module.mjs` twice: with the test-hook flag, where
 * `hooks.sidebarWidth` must expose only `probe` (the attach read
 * `test/browser/sidebar.e2e.mjs` uses), and without it, where the seam stays
 * inert. Live attach, drag capture, persistence and the Host route belong to
 * `test/browser/sidebar.e2e.mjs` (`lw-*` checks) and
 * `test/sidebar-width.test.js` (Host store/route).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
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
import { loadClientModule } from './helpers/client-module.mjs'

/** One materialization of the browser module with the test-hook flag set. */
const client = loadClientModule()

/** The production path: no hooks flag, so the seam block must not run. */
const production = loadClientModule({ hooksFlag: false })

/** The empty browser-cache document. */
const EMPTY_CACHE = emptySidebarWidthCache()

test('probe is the only remaining sidebar-width hook and reports the inert state', () => {
  assert.notEqual(client.hooks, undefined, 'the test-hook flag did not materialize a hook bag')
  const seam = client.hooks.sidebarWidth
  assert.notEqual(seam, undefined, 'hooks.sidebarWidth is missing from src/client.js')
  assert.deepEqual(Object.keys(seam), ['probe'], 'probe must be the only sidebar-width hook')
  assert.equal(typeof seam.probe, 'function', 'hooks.sidebarWidth.probe is not a function')
  assert.deepEqual(structuredClone(seam.probe()), {
    attached: false,
    storeWidth: null,
    desiredWidth: null,
    syncState: 'idle',
    cache: EMPTY_CACHE
  })
  assert.deepEqual(structuredClone(seam.probe()), structuredClone(seam.probe()), 'probing twice reports the same state')
})

test('the production path leaves the test-hook seam inert', () => {
  assert.equal(production.hooks, undefined, 'the test-hook seam stays inert when the flag is not set')
})

test('clamp rounds into the shell range and rejects non-finite input', () => {
  assert.equal(clampSidebarWidth(264), 264)
  assert.equal(clampSidebarWidth(263), 264, 'below the range clamps up')
  assert.equal(clampSidebarWidth(420), 420)
  assert.equal(clampSidebarWidth(421), 420, 'above the range clamps down')
  assert.equal(clampSidebarWidth(0), 264, 'collapsed is never a persisted width')
  assert.equal(clampSidebarWidth(320.6), 321, 'fractions round')
  assert.equal(clampSidebarWidth(263.6), 264, 'rounded values clamp afterwards')
  assert.equal(clampSidebarWidth(Number.NaN), null)
  assert.equal(clampSidebarWidth(Number.POSITIVE_INFINITY), null)
  assert.equal(clampSidebarWidth(Number.NEGATIVE_INFINITY), null)
  assert.equal(clampSidebarWidth('320'), null, 'strings are not widths')
  assert.equal(clampSidebarWidth(null), null)
  assert.equal(clampSidebarWidth(undefined), null)
})

test('validity accepts only integers inside [264, 420]', () => {
  assert.equal(isValidSidebarWidth(264), true)
  assert.equal(isValidSidebarWidth(420), true)
  assert.equal(isValidSidebarWidth(300), true)
  assert.equal(isValidSidebarWidth(263), false)
  assert.equal(isValidSidebarWidth(421), false)
  assert.equal(isValidSidebarWidth(320.5), false, 'a fractional width is not persistable')
  assert.equal(isValidSidebarWidth(Number.NaN), false)
  assert.equal(isValidSidebarWidth('320'), false)
  assert.equal(isValidSidebarWidth(null), false)
  assert.equal(isValidSidebarWidth(undefined), false)
})

test('the cache document round-trips, coerces pending and falls back on malformed text', () => {
  const written = serializeSidebarWidthCache({ sidebarWidth: 320, pending: true })
  assert.equal(JSON.parse(written).version, 1)
  assert.deepEqual(parseSidebarWidthCache(written), { sidebarWidth: 320, pending: true })
  assert.deepEqual(parseSidebarWidthCache(serializeSidebarWidthCache({ sidebarWidth: 300, pending: false })), { sidebarWidth: 300, pending: false })

  // Pending is a strict boolean and an invalid width never survives.
  assert.deepEqual(parseSidebarWidthCache(JSON.stringify({ version: 1, sidebarWidth: 320, pending: 'true' })), { sidebarWidth: 320, pending: false })
  assert.deepEqual(parseSidebarWidthCache(JSON.stringify({ version: 1, sidebarWidth: 320, pending: 1 })), { sidebarWidth: 320, pending: false })
  assert.deepEqual(parseSidebarWidthCache(JSON.stringify({ version: 1, sidebarWidth: '320', pending: true })), { sidebarWidth: null, pending: true })
  assert.deepEqual(parseSidebarWidthCache(JSON.stringify({ version: 1, sidebarWidth: 999 })), EMPTY_CACHE)

  // Malformed or unknown documents read as the default document.
  for (const text of ['', '  ', 'not json', 'null', '[]', '"text"', '{"version":2,"sidebarWidth":320}', '{"version":1}']) {
    assert.deepEqual(parseSidebarWidthCache(text), EMPTY_CACHE, `malformed cache falls back: ${JSON.stringify(text)}`)
  }
  assert.deepEqual(parseSidebarWidthCache(null), EMPTY_CACHE)
  assert.deepEqual(parseSidebarWidthCache(undefined), EMPTY_CACHE)

  // Serialize always writes a version-1 document and drops junk.
  assert.equal(JSON.parse(serializeSidebarWidthCache({ sidebarWidth: 263, pending: true })).sidebarWidth, null)
  assert.equal(JSON.parse(serializeSidebarWidthCache({ sidebarWidth: 320, pending: false })).pending, false)
  assert.equal(JSON.parse(serializeSidebarWidthCache(null)).sidebarWidth, null)
})

test('payload normalization accepts the Host document shape and rejects protocol drift', () => {
  assert.deepEqual(normalizeSidebarWidthPayload({ version: 1, sidebarWidth: 320 }), { ok: true, sidebarWidth: 320 })
  assert.deepEqual(normalizeSidebarWidthPayload({ version: 1, sidebarWidth: 264 }), { ok: true, sidebarWidth: 264 })
  assert.deepEqual(normalizeSidebarWidthPayload({ version: 1, sidebarWidth: 420 }), { ok: true, sidebarWidth: 420 })
  assert.deepEqual(normalizeSidebarWidthPayload({ version: 1, sidebarWidth: null }), { ok: true, sidebarWidth: null }, 'null means "nothing stored yet"')
  for (const payload of [
    { version: 2, sidebarWidth: 320 },
    { version: 1, sidebarWidth: 320.5 },
    { version: 1, sidebarWidth: 263 },
    { version: 1, sidebarWidth: 421 },
    { version: 1, sidebarWidth: '320' },
    { version: 1 },
    { sidebarWidth: 320 },
    null,
    [],
    'text'
  ]) {
    assert.deepEqual(normalizeSidebarWidthPayload(payload), { ok: false, sidebarWidth: null }, `rejected: ${JSON.stringify(payload)}`)
  }
})

test('boot re-applies a differing cached width but respects collapse and drags', () => {
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 320, currentWidth: 280, dragging: false }), { apply: 320 })
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 320, currentWidth: 0, dragging: false }), { apply: null }, 'a closed sidebar stays closed')
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 320, currentWidth: 280, dragging: true }), { apply: null }, 'never fight a live drag')
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 280, currentWidth: 280, dragging: false }), { apply: null }, 'an equal width needs no write')
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 280.4, currentWidth: 280, dragging: false }), { apply: null }, 'comparison rounds first')
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 999, currentWidth: 280 }), { apply: null }, 'invalid cache is ignored')
  assert.deepEqual(sidebarWidthBootstrap({ cacheWidth: 320 }), { apply: null }, 'no live width means no write')
  assert.deepEqual(sidebarWidthBootstrap({}), { apply: null })
  assert.deepEqual(sidebarWidthBootstrap(null), { apply: null })
})

test('remote adoption is refused while dragging, collapsed or unchanged', () => {
  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 280, remoteWidth: 320, dragging: false }), true)
  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 280, remoteWidth: 320, dragging: true }), false, 'never fight a live drag')
  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 0, remoteWidth: 320, dragging: false }), false, 'never expand a closed sidebar')
  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 320, remoteWidth: 320, dragging: false }), false, 'same width is a no-op')
  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 320.4, remoteWidth: 320, dragging: false }), false, 'comparison rounds first')
  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 280, remoteWidth: 999, dragging: false }), false, 'invalid remote is ignored')
  assert.equal(shouldAdoptSidebarWidth({ currentWidth: 280, remoteWidth: null, dragging: false }), false)
  assert.equal(shouldAdoptSidebarWidth({}), false)
  assert.equal(shouldAdoptSidebarWidth(null), false)
})

test('reopening a collapsed sidebar restores the stored width instead of the native default', () => {
  assert.equal(sidebarWidthReopenRestore({ preferenceWidth: 320, width: 280, dragging: false }), 320, 'the stored width wins over the native 280')
  assert.equal(sidebarWidthReopenRestore({ preferenceWidth: 320, width: 320, dragging: false }), null, 'nothing to restore when the shell already matches')
  assert.equal(sidebarWidthReopenRestore({ preferenceWidth: 320, width: 280, dragging: true }), null, 'never fight a live drag')
  assert.equal(sidebarWidthReopenRestore({ preferenceWidth: 320, width: 0, dragging: false }), null, 'collapsed is not a restore input')
  assert.equal(sidebarWidthReopenRestore({ preferenceWidth: null, width: 280, dragging: false }), null, 'nothing durable to restore')
  assert.equal(sidebarWidthReopenRestore({ preferenceWidth: 999, width: 280, dragging: false }), null, 'invalid preference is ignored')
  assert.equal(sidebarWidthReopenRestore({ width: 280 }), null)
  assert.equal(sidebarWidthReopenRestore(null), null)
})
