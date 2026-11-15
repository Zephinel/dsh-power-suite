/**
 * Unit tests for the update prompt's pure state machine.
 *
 * `src/client.js` is a browser classic script with no import surface, so
 * `test/helpers/client-module.mjs` evaluates it in a `node:vm` sandbox with the
 * test-hook flag set and materializes the plugin factory. Everything asserted
 * here comes from `hooks.updateCheck`: response validation, the prompt decision
 * (no-update reset / silenced version / later-count rules), the per-version
 * "later" counter, and the persisted state document. The controller's timer,
 * fetch and the `shell.overlay` card belong to the browser and are covered by
 * the live-GUI checks instead.
 *
 * The seam is inert in production: `__POWER_SUITE_TEST_HOOKS__` only exists in
 * the harness.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientModule } from './helpers/client-module.mjs'
import {
  isNewerStableVersion as hostIsNewerStableVersion,
  parseStableVersion as hostParseStableVersion
} from '../src/features/update-check/version.js'

/** One materialization of the browser module; the seam is read from it. */
const client = loadClientModule()

/** The pure update-check helpers, or undefined until the feature lands. */
const update = client.hooks?.updateCheck

/** Copy a sandbox-realm value into this realm for strict deep equality. */
const plain = (value) => structuredClone(value)

/** A valid Host answer naming one newer stable version. */
function payload(overrides = {}) {
  return { current: '0.1.0', latest: '0.2.0', updateAvailable: true, highlights: ['A'], ...overrides }
}

if (update === undefined) {
  test('updateCheck test seam is exposed', () => {
    assert.fail('hooks.updateCheck is missing: the update prompt seam did not register')
  })
} else {
  test('the seam exposes the pure state machine', () => {
    for (const name of [
      'parseUpdatePromptState',
      'serializeUpdatePromptState',
      'decideUpdatePrompt',
      'noteUpdatePromptLater',
      'silenceUpdatePromptVersion',
      'offersSilence',
      'normalizeUpdatePayload'
    ]) {
      assert.equal(typeof update[name], 'function', `hooks.updateCheck.${name} is a function`)
    }
    assert.equal(update.UPDATE_STORAGE_KEY, 'power-suite.update-prompt')
  })

  //#region response validation
  test('an unusable Host answer never prompts', () => {
    for (const raw of [null, undefined, 42, 'nope', [], {}]) {
      assert.equal(update.normalizeUpdatePayload(raw), null, `rejects ${JSON.stringify(raw)}`)
    }
    assert.equal(update.normalizeUpdatePayload(payload({ updateAvailable: false })), null, 'a false flag is no prompt')
    assert.equal(update.normalizeUpdatePayload(payload({ current: 1 })), null, 'current must be a string')
    assert.equal(update.normalizeUpdatePayload(payload({ latest: null })), null, 'a failed registry read has no latest')
    assert.equal(update.normalizeUpdatePayload(payload({ latest: '0.2.0-rc.1' })), null, 'a prerelease is not an update target')
    assert.equal(update.normalizeUpdatePayload(payload({ latest: '0.2' })), null, 'latest must be strict x.y.z')
  })

  test('a usable answer is normalized and its highlights capped', () => {
    const good = update.normalizeUpdatePayload({
      current: '0.1.0',
      latest: '0.2.0',
      updateAvailable: true,
      highlights: [' A ', '', '   ', 7, null, 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    })
    assert.deepEqual(plain(good), {
      current: '0.1.0',
      latest: '0.2.0',
      updateAvailable: true,
      highlights: ['A', 'B', 'C', 'D', 'E', 'F']
    })
    assert.deepEqual(plain(update.normalizeUpdatePayload({ current: '0.1.0', latest: '0.3.0', updateAvailable: true })), {
      current: '0.1.0',
      latest: '0.3.0',
      updateAvailable: true,
      highlights: []
    }, 'a missing highlight list normalizes to an empty one')
  })
  //#endregion

  //#region decision
  const recorded = { laterVersion: '0.2.0', laterClicks: 2 }

  test('a missing or invalid answer changes nothing', () => {
    assert.deepEqual(plain(update.decideUpdatePrompt(null, {})), { action: 'none', state: {} })
    assert.deepEqual(plain(update.decideUpdatePrompt(undefined, recorded)), { action: 'none', state: recorded })
    assert.deepEqual(plain(update.decideUpdatePrompt('nope', recorded)), { action: 'none', state: recorded })
    assert.deepEqual(plain(update.decideUpdatePrompt(payload({ current: '0.0.0' }), recorded)), { action: 'none', state: recorded }, 'an unreadable running version cannot be compared')
    assert.deepEqual(plain(update.decideUpdatePrompt(payload({ current: '0.1.0-rc.1' }), recorded)), { action: 'none', state: recorded }, 'a prerelease running version never prompts')
    assert.deepEqual(plain(update.decideUpdatePrompt(payload({ latest: null }), recorded)), { action: 'none', state: recorded }, 'latest:null keeps the recorded cycle')
    assert.deepEqual(plain(update.decideUpdatePrompt(payload({ latest: '0.2.0-rc.1' }), recorded)), { action: 'none', state: recorded })
    assert.deepEqual(plain(update.decideUpdatePrompt(payload({ updateAvailable: false }), recorded)), { action: 'none', state: recorded }, 'an unupdated route keeps a still-relevant cycle')
  })

  test('a definitive no-update answer retires the recorded cycle', () => {
    assert.deepEqual(plain(update.decideUpdatePrompt(payload({ current: '0.2.0', latest: '0.2.0', updateAvailable: false }), recorded)), { action: 'none', state: {} })
    assert.deepEqual(plain(update.decideUpdatePrompt(payload({ current: '0.3.0', latest: '0.2.0', updateAvailable: false }), recorded)), { action: 'none', state: {} })
  })

  test('a silenced version stays silent while a newer one prompts again', () => {
    const silenced = { silencedVersion: '0.2.0' }
    assert.deepEqual(plain(update.decideUpdatePrompt(payload(), silenced)), { action: 'none', state: silenced })
    const newer = update.decideUpdatePrompt(payload({ latest: '0.3.0' }), { silencedVersion: '0.2.0' })
    assert.equal(newer.action, 'prompt')
  })

  test('a newer stable version prompts with its capped highlights and canSilence', () => {
    const decision = update.decideUpdatePrompt(payload({ highlights: ['A', '', 'B', 'C', 'D', 'E', 'F', 'G'] }), recorded)
    assert.equal(decision.action, 'prompt')
    assert.deepEqual(plain(decision.prompt), { current: '0.1.0', latest: '0.2.0', highlights: ['A', 'B', 'C', 'D', 'E', 'F'] })
    assert.deepEqual(plain(decision.state), recorded, 'the prompt decision keeps the persisted cycle')
    assert.equal(decision.canSilence, false, 'two later clicks are not enough to offer silence')
    const fourth = update.decideUpdatePrompt(payload(), { laterVersion: '0.2.0', laterClicks: 3 })
    assert.equal(fourth.canSilence, true, 'three later clicks offer "do not remind"')
  })
  //#endregion

  //#region later and silence counters
  test('later clicks count per version', () => {
    const first = update.noteUpdatePromptLater({}, '0.2.0')
    assert.deepEqual(plain(first), { laterVersion: '0.2.0', laterClicks: 1 })
    const second = update.noteUpdatePromptLater(first, '0.2.0')
    assert.deepEqual(plain(second), { laterVersion: '0.2.0', laterClicks: 2 })
    const other = update.noteUpdatePromptLater(second, '0.3.0')
    assert.deepEqual(plain(other), { laterVersion: '0.3.0', laterClicks: 1 }, 'a newer version restarts the count')
    assert.deepEqual(plain(update.noteUpdatePromptLater(other, '0.2.0')), { laterVersion: '0.2.0', laterClicks: 1 }, 'the older count does not resume')
  })

  test('the silence offer starts at three later clicks for that version', () => {
    assert.equal(update.offersSilence({}, '0.2.0'), false)
    assert.equal(update.offersSilence({ laterVersion: '0.2.0', laterClicks: 2 }, '0.2.0'), false)
    assert.equal(update.offersSilence({ laterVersion: '0.2.0', laterClicks: 3 }, '0.2.0'), true)
    assert.equal(update.offersSilence({ laterVersion: '0.2.0', laterClicks: 3 }, '0.3.0'), false)
  })

  test('silencing writes only the silenced version', () => {
    assert.deepEqual(plain(update.silenceUpdatePromptVersion({ laterVersion: '0.2.0', laterClicks: 3 }, '0.2.0')), { silencedVersion: '0.2.0' })
  })
  //#endregion

  //#region persisted state
  test('state serializes with schema 1 and round-trips', () => {
    const state = { laterVersion: '0.2.0', laterClicks: 2, silencedVersion: '0.1.0' }
    const json = update.serializeUpdatePromptState(state)
    assert.deepEqual(JSON.parse(json), { schema: 1, laterVersion: '0.2.0', laterClicks: 2, silencedVersion: '0.1.0' })
    assert.deepEqual(plain(update.parseUpdatePromptState(json)), state)
    assert.deepEqual(JSON.parse(update.serializeUpdatePromptState({})), { schema: 1 }, 'empty state still carries the schema')
  })

  test('corrupt, foreign, or old documents read as empty', () => {
    assert.deepEqual(plain(update.parseUpdatePromptState(null)), {})
    assert.deepEqual(plain(update.parseUpdatePromptState('')), {})
    assert.deepEqual(plain(update.parseUpdatePromptState('{')), {})
    assert.deepEqual(plain(update.parseUpdatePromptState('[]')), {})
    assert.deepEqual(plain(update.parseUpdatePromptState('null')), {})
    assert.deepEqual(plain(update.parseUpdatePromptState(JSON.stringify({ schema: 2, silencedVersion: '0.2.0' }))), {}, 'an unknown schema resets')
    assert.deepEqual(plain(update.parseUpdatePromptState(JSON.stringify({ silencedVersion: '0.2.0' }))), {}, 'a missing schema resets')
  })

  test('only stable versions and non-negative integer clicks survive a read', () => {
    const read = (state) => plain(update.parseUpdatePromptState(JSON.stringify({ schema: 1, ...state })))
    assert.deepEqual(read({ silencedVersion: '0.2.0-rc.1' }), {})
    assert.deepEqual(read({ silencedVersion: 'latest' }), {})
    assert.deepEqual(read({ laterVersion: '0.2.0', laterClicks: -1 }), {})
    assert.deepEqual(read({ laterVersion: '0.2.0', laterClicks: 1.5 }), {})
    assert.deepEqual(read({ laterVersion: '0.2.0', laterClicks: '3' }), {})
    assert.deepEqual(read({ laterVersion: '0.2.0' }), {}, 'the counter is only read together with its version')
    assert.deepEqual(read({ laterVersion: '0.2.0', laterClicks: 0 }), { laterVersion: '0.2.0', laterClicks: 0 })
  })
  //#endregion

  //#region source-level safety
  test('the update check renders only through shell.overlay and never inserts sidebar DOM', () => {
    const source = client.source
    const start = source.indexOf('//#region feature: update check')
    // The next feature marker is a stable end boundary; a bare `//#endregion`
    // search would break if an inner region marker were added later.
    const end = source.indexOf('//#region plugin', start)
    assert.ok(start >= 0, 'the update check region exists')
    assert.ok(end > start, 'the update check region closes before the plugin region')
    const region = source.slice(start, end)
    assert.ok(region.includes("ctx.slots.inject('shell.overlay'"), 'the card is an additive shell.overlay entry')
    assert.ok(!region.includes('insertBefore'), 'the region never inserts a node next to a native sibling')
    assert.ok(!region.includes('document.body'), 'nothing is appended to the shell body')
    assert.ok(!region.includes('MutationObserver'), 'the region does not observe or patch the shell tree')
  })
  //#endregion

  //#region mirrored version table
  test('the Host and browser version tables accept and reject identically', () => {
    const normalize = (value) => (value === undefined ? null : plain(value))
    const cases = [
      ['0.1.0', '0.1.0'],
      [' 0.1.0 ', '0.1.0'],
      ['0.1.0', ' 0.2.0 '],
      ['0.1.0', '0.2.0'],
      ['0.2.0', '0.1.0'],
      ['0.1.0', '0.1.0-rc.1'],
      ['0.1.0+build', '0.1.0'],
      ['0.1', '0.1.0'],
      ['1.2', '1.2.3'],
      ['1.2.3.4', '1.2.3'],
      ['9007199254740993.0.0', '0.0.0'],
      ['', '0.0.0'],
      ['latest', '0.0.0'],
      [null, '0.0.0']
    ]
    for (const [left, right] of cases) {
      assert.deepEqual(normalize(update.parseStableVersion(left)), normalize(hostParseStableVersion(left)), `stable parse agrees for ${String(left)}`)
      assert.deepEqual(normalize(update.parseStableVersion(right)), normalize(hostParseStableVersion(right)), `stable parse agrees for ${String(right)}`)
      assert.equal(
        update.isNewerStableVersion(left, right),
        hostIsNewerStableVersion(left, right),
        `newer-than agrees for ${String(left)} vs ${String(right)}`
      )
    }
  })
  //#endregion
}
