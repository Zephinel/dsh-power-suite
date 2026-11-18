/**
 * Unit tests for the persisted, Host-synced left sidebar width (browser half).
 *
 * `src/client.js` is a browser classic script with no import surface, so
 * `test/helpers/client-module.mjs` evaluates it in a `node:vm` sandbox with the
 * test-hook flag set and materializes the plugin factory. Everything asserted
 * here comes from `hooks.sidebarWidth`: the width clamp/validity boundaries,
 * the browser-cache document, the Host payload normalizer, and the two
 * decisions that keep boot/remote adoption from fighting the user (collapsed,
 * dragging, unchanged). Live attach, drag capture, persistence and the Host
 * route belong to `test/browser/sidebar.e2e.mjs` (`lw-*` checks) and
 * `test/sidebar-width.test.js` (Host store/route).
 *
 * The pure decisions now live in `src/browser/sidebar-width/model.ts` with
 * direct Node coverage in `test/sidebar-width-model.test.js`; this file keeps
 * exercising the browser controller seam.
 *
 * The seam is inert in production: `__POWER_SUITE_TEST_HOOKS__` only exists in
 * the harness.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientModule } from './helpers/client-module.mjs'

/** One materialization of the browser module; the seam is read from it. */
const client = loadClientModule()

/** The production path: no hooks flag, so the seam block must not run. */
const production = loadClientModule({ hooksFlag: false })

/** The pure sidebar-width helpers, or undefined until the feature lands. */
const seam = client.hooks?.sidebarWidth

/** Copy a sandbox-realm value into this realm for strict deep equality. */
const plain = (value) => structuredClone(value)

/** The documented seam surface. */
const SEAM_KEYS = [
  'SIDEBAR_WIDTH_ROUTE',
  'SIDEBAR_WIDTH_STORAGE_KEY',
  'SIDEBAR_WIDTH_MIN',
  'SIDEBAR_WIDTH_MAX',
  'clampSidebarWidth',
  'isValidSidebarWidth',
  'parseSidebarWidthCache',
  'serializeSidebarWidthCache',
  'normalizeSidebarWidthPayload',
  'sidebarWidthBootstrap',
  'shouldAdoptSidebarWidth',
  'sidebarWidthReopenRestore',
  'probe'
]

/**
 * Read one helper off the sidebar-width seam with a clear failure.
 * @param {string} name - seam key.
 * @returns {Function} the helper.
 */
function helper(name) {
  assert.notEqual(seam, undefined, 'hooks.sidebarWidth is missing from src/client.js')
  assert.equal(typeof seam[name], 'function', `hooks.sidebarWidth.${name} is not a function`)
  return seam[name]
}

/** The empty browser-cache document. */
const EMPTY_CACHE = { sidebarWidth: null, pending: false }

if (seam === undefined) {
  test('sidebarWidth test seam is exposed', () => {
    assert.fail('hooks.sidebarWidth is missing: the sidebar-width seam did not register')
  })
} else {
  test('the seam exposes the documented constants and pure helpers', () => {
    for (const name of SEAM_KEYS) {
      assert.notEqual(seam[name], undefined, `${name} is exported through the seam`)
    }
    assert.equal(seam.SIDEBAR_WIDTH_ROUTE, 'api/power-suite.sidebar-width')
    assert.equal(seam.SIDEBAR_WIDTH_STORAGE_KEY, 'power-suite.sidebar-width')
    assert.equal(seam.SIDEBAR_WIDTH_MIN, 264)
    assert.equal(seam.SIDEBAR_WIDTH_MAX, 420)
    for (const name of SEAM_KEYS.filter((key) => key.startsWith('clamp')
      || key.startsWith('isValid')
      || key.startsWith('parse')
      || key.startsWith('serialize')
      || key.startsWith('normalize')
      || key.startsWith('sidebarWidthBootstrap')
      || key.startsWith('shouldAdopt')
      || key === 'probe')) {
      assert.equal(typeof seam[name], 'function', `${name} is a function`)
    }
    assert.equal(production.hooks, undefined, 'the test-hook seam stays inert when the flag is not set')
  })

  test('clamp rounds into the shell range and rejects non-finite input', () => {
    const clamp = helper('clampSidebarWidth')
    assert.equal(clamp(264), 264)
    assert.equal(clamp(263), 264, 'below the range clamps up')
    assert.equal(clamp(420), 420)
    assert.equal(clamp(421), 420, 'above the range clamps down')
    assert.equal(clamp(0), 264, 'collapsed is never a persisted width')
    assert.equal(clamp(320.6), 321, 'fractions round')
    assert.equal(clamp(263.6), 264, 'rounded values clamp afterwards')
    assert.equal(clamp(Number.NaN), null)
    assert.equal(clamp(Number.POSITIVE_INFINITY), null)
    assert.equal(clamp(Number.NEGATIVE_INFINITY), null)
    assert.equal(clamp('320'), null, 'strings are not widths')
    assert.equal(clamp(null), null)
    assert.equal(clamp(undefined), null)
  })

  test('validity accepts only integers inside [264, 420]', () => {
    const isValid = helper('isValidSidebarWidth')
    assert.equal(isValid(264), true)
    assert.equal(isValid(420), true)
    assert.equal(isValid(300), true)
    assert.equal(isValid(263), false)
    assert.equal(isValid(421), false)
    assert.equal(isValid(320.5), false, 'a fractional width is not persistable')
    assert.equal(isValid(Number.NaN), false)
    assert.equal(isValid('320'), false)
    assert.equal(isValid(null), false)
    assert.equal(isValid(undefined), false)
  })

  test('the cache document round-trips, coerces pending and falls back on malformed text', () => {
    const parse = helper('parseSidebarWidthCache')
    const serialize = helper('serializeSidebarWidthCache')

    const written = serialize({ sidebarWidth: 320, pending: true })
    assert.equal(JSON.parse(written).version, 1)
    assert.deepEqual(plain(parse(written)), { sidebarWidth: 320, pending: true })
    assert.deepEqual(plain(parse(serialize({ sidebarWidth: 300, pending: false }))), { sidebarWidth: 300, pending: false })

    // Pending is a strict boolean and an invalid width never survives.
    assert.deepEqual(plain(parse(JSON.stringify({ version: 1, sidebarWidth: 320, pending: 'true' }))), { sidebarWidth: 320, pending: false })
    assert.deepEqual(plain(parse(JSON.stringify({ version: 1, sidebarWidth: 320, pending: 1 }))), { sidebarWidth: 320, pending: false })
    assert.deepEqual(plain(parse(JSON.stringify({ version: 1, sidebarWidth: '320', pending: true }))), { sidebarWidth: null, pending: true })
    assert.deepEqual(plain(parse(JSON.stringify({ version: 1, sidebarWidth: 999 }))), EMPTY_CACHE)

    // Malformed or unknown documents read as the default document.
    for (const text of ['', '  ', 'not json', 'null', '[]', '"text"', '{"version":2,"sidebarWidth":320}', '{"version":1}']) {
      assert.deepEqual(plain(parse(text)), EMPTY_CACHE, `malformed cache falls back: ${JSON.stringify(text)}`)
    }
    assert.deepEqual(plain(parse(null)), EMPTY_CACHE)
    assert.deepEqual(plain(parse(undefined)), EMPTY_CACHE)

    // Serialize always writes a version-1 document and drops junk.
    assert.equal(JSON.parse(serialize({ sidebarWidth: 263, pending: true })).sidebarWidth, null)
    assert.equal(JSON.parse(serialize({ sidebarWidth: 320, pending: false })).pending, false)
    assert.equal(JSON.parse(serialize(null)).sidebarWidth, null)
  })

  test('payload normalization accepts the Host document shape and rejects protocol drift', () => {
    const normalize = helper('normalizeSidebarWidthPayload')
    assert.deepEqual(plain(normalize({ version: 1, sidebarWidth: 320 })), { ok: true, sidebarWidth: 320 })
    assert.deepEqual(plain(normalize({ version: 1, sidebarWidth: 264 })), { ok: true, sidebarWidth: 264 })
    assert.deepEqual(plain(normalize({ version: 1, sidebarWidth: 420 })), { ok: true, sidebarWidth: 420 })
    assert.deepEqual(plain(normalize({ version: 1, sidebarWidth: null })), { ok: true, sidebarWidth: null }, 'null means "nothing stored yet"')
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
      assert.deepEqual(plain(normalize(payload)), { ok: false, sidebarWidth: null }, `rejected: ${JSON.stringify(payload)}`)
    }
  })

  test('boot re-applies a differing cached width but respects collapse and drags', () => {
    const bootstrap = helper('sidebarWidthBootstrap')
    assert.deepEqual(plain(bootstrap({ cacheWidth: 320, currentWidth: 280, dragging: false })), { apply: 320 })
    assert.deepEqual(plain(bootstrap({ cacheWidth: 320, currentWidth: 0, dragging: false })), { apply: null }, 'a closed sidebar stays closed')
    assert.deepEqual(plain(bootstrap({ cacheWidth: 320, currentWidth: 280, dragging: true })), { apply: null }, 'never fight a live drag')
    assert.deepEqual(plain(bootstrap({ cacheWidth: 280, currentWidth: 280, dragging: false })), { apply: null }, 'an equal width needs no write')
    assert.deepEqual(plain(bootstrap({ cacheWidth: 280.4, currentWidth: 280, dragging: false })), { apply: null }, 'comparison rounds first')
    assert.deepEqual(plain(bootstrap({ cacheWidth: 999, currentWidth: 280 })), { apply: null }, 'invalid cache is ignored')
    assert.deepEqual(plain(bootstrap({ cacheWidth: 320 })), { apply: null }, 'no live width means no write')
    assert.deepEqual(plain(bootstrap({})), { apply: null })
    assert.deepEqual(plain(bootstrap(null)), { apply: null })
  })

  test('remote adoption is refused while dragging, collapsed or unchanged', () => {
    const adopt = helper('shouldAdoptSidebarWidth')
    assert.equal(adopt({ currentWidth: 280, remoteWidth: 320, dragging: false }), true)
    assert.equal(adopt({ currentWidth: 280, remoteWidth: 320, dragging: true }), false, 'never fight a live drag')
    assert.equal(adopt({ currentWidth: 0, remoteWidth: 320, dragging: false }), false, 'never expand a closed sidebar')
    assert.equal(adopt({ currentWidth: 320, remoteWidth: 320, dragging: false }), false, 'same width is a no-op')
    assert.equal(adopt({ currentWidth: 320.4, remoteWidth: 320, dragging: false }), false, 'comparison rounds first')
    assert.equal(adopt({ currentWidth: 280, remoteWidth: 999, dragging: false }), false, 'invalid remote is ignored')
    assert.equal(adopt({ currentWidth: 280, remoteWidth: null, dragging: false }), false)
    assert.equal(adopt({}), false)
    assert.equal(adopt(null), false)
  })

  test('reopening a collapsed sidebar restores the stored width instead of the native default', () => {
    const restore = helper('sidebarWidthReopenRestore')
    assert.equal(restore({ preferenceWidth: 320, width: 280, dragging: false }), 320, 'the stored width wins over the native 280')
    assert.equal(restore({ preferenceWidth: 320, width: 320, dragging: false }), null, 'nothing to restore when the shell already matches')
    assert.equal(restore({ preferenceWidth: 320, width: 280, dragging: true }), null, 'never fight a live drag')
    assert.equal(restore({ preferenceWidth: 320, width: 0, dragging: false }), null, 'collapsed is not a restore input')
    assert.equal(restore({ preferenceWidth: null, width: 280, dragging: false }), null, 'nothing durable to restore')
    assert.equal(restore({ preferenceWidth: 999, width: 280, dragging: false }), null, 'invalid preference is ignored')
    assert.equal(restore({ width: 280 }), null)
    assert.equal(restore(null), null)
  })

  test('probe reports the inert state before install and stays side-effect free', () => {
    const probe = helper('probe')
    assert.deepEqual(plain(probe()), {
      attached: false,
      storeWidth: null,
      desiredWidth: null,
      syncState: 'idle',
      cache: EMPTY_CACHE
    })
    assert.deepEqual(plain(probe()), plain(probe()), 'probing twice reports the same state')
  })
}
