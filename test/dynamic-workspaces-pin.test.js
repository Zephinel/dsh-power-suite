/**
 * Unit tests for pinned Sessions in the Running & recent card of the
 * dynamic-Workspaces feature (final panel-owned Host-shared design).
 *
 * `src/client.js` is a browser classic script materialized in a `node:vm`
 * sandbox by `test/helpers/client-module.mjs`; the helpers are read from the
 * `dynamicWorkspacesPin` test-hook namespace (kept separate from the annotation
 * seam so that seam's keys stay frozen). The authoritative spec is
 * `.tmp-work/pin-stats-contract.md` ("FOLLOW-UP 2"). These tests cover:
 *
 * 1. `dwSanitizePinnedIds` — id-array / legacy-object sources, junk filtering,
 *    dedupe, the 500-id bound, and the 200-character id bound; tolerates
 *    missing/malformed input by returning an empty Set.
 * 2. `dwPinEffectiveIds` — queued `pin`/`unpin` operations replayed in arrival
 *    order over the confirmed set (last write wins), so the UI reacts before
 *    the Host write lands.
 * 3. `dwReadPinCache` / `dwWritePinCache` — the versioned localStorage cache
 *    round-trips; a malformed cached state degrades to the empty defaults.
 * 4. `dwPinPanelRows` derivation — pinned first (newest activity first, across
 *    live and finished sources), unpinned running/recent rows keep their given
 *    order, a pinned finished row outside the retention window stays listed
 *    with `state:'done'` and its original `updatedAt`, no duplicates,
 *    blank/archived/subagent/unknown ids skipped, child rows never produced.
 * 5. EN and ZH define the same pin keys.
 * 6. Requirement 1 source regression: the hover-card status dot sets
 *    `corner-shape: round` (perfect circle under the shell superellipse).
 * 7. Source wiring — the card owns the pin state behind the
 *    `/api/power-suite.session-pins` route + local cache/pending queue, and
 *    never reads/writes the native sidebar pin. The R2 native-hover figure
 *    wiring stays untouched.
 *
 * Scope: this file unit-tests the pure helpers and the client source wiring.
 * The Host route/storage is covered by `test/session-pins.test.js`; the live
 * UI, reload/cross-device proof and the local-only fallback belong to the
 * `--pin` E2E harness (`test/browser/sidebar.e2e.mjs`). One reachability
 * limitation: the sandbox's `localStorage` object is not exposed, so a corrupt
 * raw cache document cannot be seeded here — the read fallback is exercised by
 * writing a malformed cache *state* through the seam (the writer persists
 * fields verbatim, the reader sanitizes them).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientModule } from './helpers/client-module.mjs'
import { ROUTES, browserRoute } from '../src/shared/routes.ts'

const client = loadClientModule()
const production = loadClientModule({ hooksFlag: false })
const pin = client.hooks?.dynamicWorkspacesPin
const stats = client.hooks?.dynamicWorkspacesStats

/** Fixed clock used by every row fixture (2025-10-09T08:53:20Z). */
const NOW = 1_760_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000

/** Pin helpers exposed by the seam, in sorted order. */
const PIN_SEAM_KEYS = ['dwPinEffectiveIds', 'dwPinPanelRows', 'dwReadPinCache', 'dwSanitizePinnedIds', 'dwWritePinCache']

/**
 * Build a translate seat from one dictionary map exactly like the locale
 * service: `t(key, params)` substitutes `{name}` placeholders.
 * @param {Record<string, string>} templates - copy dictionary.
 * @returns {Function} translate function.
 */
function translate(templates) {
  return (key, params) => {
    const template = templates[key]
    assert.notEqual(template, undefined, `missing dictionary key ${key}`)
    if (params === undefined || params === null) return template
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      assert.notEqual(params[name], undefined, `missing interpolation "${name}" for ${key}`)
      return String(params[name])
    })
  }
}

/**
 * Read one helper off the pin seam with a clear failure while the Lead's
 * implementation is still landing.
 * @param {string} name - seam key.
 * @returns {Function} the helper.
 */
function requirePin(name) {
  assert.notEqual(
    pin,
    undefined,
    'src/client.js does not expose hooks.dynamicWorkspacesPin yet: '
    + `expected globalThis.__POWER_SUITE_TEST_HOOKS__.dynamicWorkspacesPin = { ${PIN_SEAM_KEYS.join(', ')} } `
    + `(hooks found: ${client.hooks ? Object.keys(client.hooks).join(', ') : '(none)'}).`
  )
  const helper = pin[name]
  assert.equal(typeof helper, 'function', `hooks.dynamicWorkspacesPin.${name} is not a function`)
  return helper
}

/**
 * Materialize an isolated browser module for a cache test. Every
 * `loadClientModule()` call builds its own vm sandbox with a fresh `localStorage`
 * stand-in, so cache writes in one test never leak into another.
 * @returns {object} that instance's `dynamicWorkspacesPin` seam.
 */
function freshPinSeam() {
  const instance = loadClientModule()
  const seam = instance.hooks?.dynamicWorkspacesPin
  assert.notEqual(seam, undefined, 'dynamicWorkspacesPin test seam is missing from src/client.js')
  return seam
}

/**
 * Session-list summary fixture in the shape the host catalog sends.
 * @param {string} id - Session id.
 * @param {object} [overrides] - summary fields to override.
 * @returns {object} summary.
 */
function summary(id, overrides = {}) {
  return {
    displayTitle: `Title ${id}`,
    cwd: `/repo/${id}`,
    updatedAt: NOW - 60_000,
    ...overrides
  }
}

/**
 * A single card row already shaped by `dwRunningRows` / `dwRecentRows`.
 * @param {object} [overrides] - row fields to override.
 * @returns {object} row.
 */
function row(overrides = {}) {
  return {
    id: 'row',
    title: 'Row',
    workspace: 'Workspace',
    workspacePath: '/repo',
    workspaceId: 'w1',
    cwd: '/repo',
    updatedAt: NOW - 1_000,
    subagents: 0,
    state: 'running',
    ...overrides
  }
}

/**
 * Complete `dwPinPanelRows` input with harmless empty defaults.
 * @param {object} [overrides] - input fields to override.
 * @returns {object} helper input.
 */
function pinInput(overrides = {}) {
  return {
    list: { ids: [], byId: {} },
    statuses: new Map(),
    workspaces: [],
    t: translate(stats.DW_EN),
    now: NOW,
    runningParents: new Map(),
    archived: new Set(),
    activity: {},
    pinnedIds: new Set(),
    runningRows: [],
    recentRows: [],
    ...overrides
  }
}

/**
 * Row ids in output order.
 *
 * The helpers run inside the vm sandbox, so their arrays are vm-realm arrays;
 * `assert.deepEqual` (strict) rejects those against host-realm literals because
 * the prototypes differ. `Array.from` on the host side copies the values into a
 * host-realm array.
 * @param {Array<object>} rows - helper output.
 * @returns {string[]} ids.
 */
function ids(rows) {
  return Array.from(rows, (candidate) => candidate.id)
}

/**
 * One field from every row, as a host-realm array (same cross-realm reason).
 * @param {Array<object>} rows - helper output.
 * @param {string} fieldName - row field name.
 * @returns {Array<unknown>} field values.
 */
function field(rows, fieldName) {
  return Array.from(rows, (candidate) => candidate[fieldName])
}

/**
 * Normalize a cache record read from the vm sandbox into a comparable host
 * object (same cross-realm reason; also flattens pending ops for readable diffs).
 * @param {object} cache - cache state from `dwReadPinCache`.
 * @returns {object} host-realm view of the cache.
 */
function cacheView(cache) {
  return {
    version: cache.version,
    rev: cache.rev,
    pinned: [...cache.pinned],
    pending: Array.from(cache.pending ?? [], (entry) => `${entry.op}:${entry.id}`),
    migrated: cache.migrated
  }
}

test('dynamic-Workspaces pin seam has the final panel-owned shape and production stays inert', () => {
  assert.notEqual(
    pin,
    undefined,
    'hooks.dynamicWorkspacesPin is missing from src/client.js (test seam not wired yet)'
  )
  assert.deepEqual(
    [...Object.keys(pin)].sort(),
    PIN_SEAM_KEYS,
    'the seam exposes the sanitizer, effective-id replay, cache read/write, and row derivation'
  )
  for (const name of PIN_SEAM_KEYS) {
    assert.equal(typeof pin[name], 'function', `${name} is exported through the seam`)
  }
  assert.equal(production.hooks, undefined, 'the test-hook seam must stay inert when the flag is not set')
})

test('the card-owned pin syncs through the panel route, never through the native sidebar pin', () => {
  const source = client.source
  // Panel-owned Host-shared state: the suite's own route, request helpers, local
  // cache, and the first-contact migration flag that merges pre-restart pins.
  assert.equal(browserRoute(ROUTES.sessionPins), 'api/power-suite.session-pins', 'the shared contract owns the panel route')
  assert.match(source, /ROUTES\.sessionPins/, 'the client talks to the panel route through the shared contract')
  assert.match(source, /dwFetchPinnedSessions/, 'the client has the Host GET helper')
  assert.match(source, /dwPostPinOps/, 'the client has the Host POST helper')
  assert.match(source, /power-suite\.dynamic-workspaces\.pinned/, 'the local cache document key exists')
  assert.match(source, /migrated/, 'the first-contact migration state exists')
  // The native sidebar pin (and its Workspaces snapshot field) must never drive
  // the card: those are project-organisation pins, not card pins.
  assert.doesNotMatch(source, /uiWorkspace\.(?:pinSession|unpinSession)/, 'the card must not toggle the native sidebar pin')
  assert.doesNotMatch(
    source,
    /(?:workspaceSnapshot|WorkspaceSnapshot)[^\n]{0,40}\.pinnedSessionIds/,
    'the card must not read the native pinnedSessionIds snapshot'
  )
  // The pre-final round's helpers are gone.
  assert.doesNotMatch(source, /dwReadPinnedIds|dwWritePinnedIds/, 'the removed host-pin helpers must not reappear')
  // Requirement 2's native hover-figure wiring is untouched.
  assert.match(source, /sidebar\.session\.row\.hover/, 'the native hover-figure slot registration stays')
  assert.match(source, /psd-native-hover-figures/, 'the native hover-figure DOM anchor stays')
})

test('pinned ids sanitize from arrays and legacy objects, drop junk, dedupe, and bound', () => {
  const sanitize = requirePin('dwSanitizePinnedIds')
  for (const malformed of [undefined, null, {}, { pinned: null }, { pinnedSessionIds: 'session-a' }, 'session-a']) {
    const result = sanitize(malformed)
    assert.equal(typeof result?.has, 'function', `expected a Set for ${JSON.stringify(malformed)}`)
    assert.equal(result.size, 0, `expected no pinned ids for ${JSON.stringify(malformed)}`)
  }
  // Bare array (the cache/Host document shape).
  assert.deepEqual(
    [...sanitize(['session-a', '', null, 42, {}, ['session-b'], 'session-b', 'session-c'])].sort(),
    ['session-a', 'session-b', 'session-c']
  )
  // Object with `pinned` (canonical document shape).
  assert.deepEqual([...sanitize({ pinned: ['session-a', 'session-a', 'session-b'] })], ['session-a', 'session-b'])
  // Object with `pinnedSessionIds` (older cached documents/test fixtures).
  assert.deepEqual([...sanitize({ pinnedSessionIds: ['legacy-a', 'legacy-b'] })], ['legacy-a', 'legacy-b'])
  // Id length bound (the Host validator uses the same 200-character limit).
  assert.deepEqual([...sanitize(['x'.repeat(200), 'y'.repeat(201)])], ['x'.repeat(200)])
  // Document bound: 500 ids, insertion order kept (the Host drops the oldest).
  const many = Array.from({ length: 505 }, (_, index) => `session-${index}`)
  const bounded = [...sanitize(many)]
  assert.equal(bounded.length, 500)
  assert.equal(bounded[0], 'session-0')
  assert.equal(bounded[499], 'session-499')
  assert.equal(bounded.includes('session-500'), false)
})

test('effective pinned ids replay queued operations over the confirmed set', () => {
  const effective = requirePin('dwPinEffectiveIds')
  const view = (pinned, pending) => [...effective(pinned, pending)]
  assert.deepEqual(view(undefined, undefined), [])
  assert.deepEqual(view(['session-a', 'session-b'], []).sort(), ['session-a', 'session-b'])
  // Optimistic pin / unpin.
  assert.deepEqual(view(['session-a'], [{ op: 'pin', id: 'session-b' }]).sort(), ['session-a', 'session-b'])
  assert.deepEqual(view(['session-a', 'session-b'], [{ op: 'unpin', id: 'session-a' }]), ['session-b'])
  // Arrival order wins: the last operation for an id decides its state.
  assert.deepEqual(view(['session-a'], [{ op: 'unpin', id: 'session-a' }, { op: 'pin', id: 'session-a' }]), ['session-a'])
  assert.deepEqual(view(['session-a'], [{ op: 'pin', id: 'session-a' }, { op: 'unpin', id: 'session-a' }]), [])
  // Invalid queued entries are ignored rather than poisoning the effective set.
  assert.deepEqual(view(['session-a'], [null, 42, { op: 'pin' }, { op: 'pin', id: '' }, { op: 'toggle', id: 'session-b' }]), ['session-a'])
})

test('the pin cache round-trips and a malformed cached state degrades to defaults', () => {
  const seam = freshPinSeam()
  // A fresh browser profile has no cached pin state.
  assert.deepEqual(cacheView(seam.dwReadPinCache()), {
    version: 1,
    rev: 0,
    pinned: [],
    pending: [],
    migrated: false
  })
  // Round-trip one Host-confirmed document plus a queued operation.
  seam.dwWritePinCache({
    version: 1,
    rev: 7,
    pinned: ['session-a', 'session-b'],
    pending: [{ op: 'pin', id: 'session-c' }],
    migrated: true
  })
  assert.deepEqual(cacheView(seam.dwReadPinCache()), {
    version: 1,
    rev: 7,
    pinned: ['session-a', 'session-b'],
    pending: ['pin:session-c'],
    migrated: true
  })
  // The writer persists fields verbatim; the reader is the sanitizing boundary.
  seam.dwWritePinCache({
    version: 1,
    rev: -3,
    pinned: ['session-a', '', null, 42, 'session-a'],
    pending: [{ op: 'bogus', id: 'session-x' }, null, { op: 'pin', id: 42 }, { op: 'pin', id: 'session-b' }],
    migrated: 'yes'
  })
  assert.deepEqual(cacheView(seam.dwReadPinCache()), {
    version: 1,
    rev: 0,
    pinned: ['session-a'],
    pending: ['pin:session-b'],
    migrated: false
  })
})

test('a pinned finished row outside the retention window stays listed with its original end time', () => {
  const dwPinPanelRows = requirePin('dwPinPanelRows')
  const updatedAt = NOW - 30 * DAY_MS
  const rows = dwPinPanelRows(pinInput({
    list: {
      ids: ['pinnedDone'],
      byId: {
        pinnedDone: summary('pinnedDone', {
          displayTitle: 'Long finished',
          cwd: '/repo/worktree/a',
          updatedAt
        })
      }
    },
    statuses: new Map([['pinnedDone', { running: false }]]),
    workspaces: [
      { workspaceId: 'w-alpha', title: 'Alpha', path: '/repo/alpha', sessionIds: ['pinnedDone'] }
    ],
    pinnedIds: new Set(['pinnedDone'])
  }))

  assert.equal(rows.length, 1, 'the pinned finished Session must stay listed regardless of the retention window')
  const [done] = rows
  assert.equal(done.id, 'pinnedDone')
  assert.equal(done.state, 'done', 'a pinned id missing from the running/recent rows is a finished main Session')
  assert.equal(done.subagents, 0)
  assert.equal(done.title, 'Long finished', 'title comes from the Session summary like dwRecentRows builds it')
  assert.equal(done.workspace, 'Alpha', 'workspace label comes from the owning Workspace')
  assert.equal(done.workspacePath, '/repo/alpha', 'workspace path comes from the owning Workspace')
  assert.equal(done.workspaceId, 'w-alpha')
  assert.equal(done.cwd, '/repo/worktree/a', 'cwd comes from the Session summary')
  assert.equal(done.updatedAt, updatedAt, 'pin must not re-time the row: the original end time is preserved')
  assert.equal(done.pinned, true)
})

test('pinned rows already present in the running or recent rows are never duplicated', () => {
  const dwPinPanelRows = requirePin('dwPinPanelRows')
  const rows = dwPinPanelRows(pinInput({
    list: {
      ids: ['pinRun', 'pinDone'],
      byId: {
        pinRun: summary('pinRun', { updatedAt: NOW - 1_000 }),
        pinDone: summary('pinDone', { updatedAt: NOW - 2_000 })
      }
    },
    statuses: new Map([['pinRun', { running: true }], ['pinDone', { running: false }]]),
    runningRows: [row({ id: 'pinRun', updatedAt: NOW - 1_000, subagents: 2 })],
    recentRows: [row({ id: 'pinDone', updatedAt: NOW - 2_000, state: 'done' })],
    pinnedIds: new Set(['pinRun', 'pinDone'])
  }))

  assert.deepEqual(ids(rows), ['pinRun', 'pinDone'])
  assert.equal(rows.filter((candidate) => candidate.id === 'pinRun').length, 1, 'pinned running row must not be duplicated')
  assert.equal(rows.filter((candidate) => candidate.id === 'pinDone').length, 1, 'pinned recent row must not be duplicated')
  const running = rows.find((candidate) => candidate.id === 'pinRun')
  assert.equal(running.state, 'running', 'a pinned running row keeps its live state')
  assert.equal(running.subagents, 2, 'a pinned running row keeps the running subagent count')
  assert.equal(running.pinned, true)
  const done = rows.find((candidate) => candidate.id === 'pinDone')
  assert.equal(done.state, 'done')
  assert.equal(done.updatedAt, NOW - 2_000, 'the existing recent row is reused unchanged')
  assert.equal(done.pinned, true)
})

test('pinned rows sort first by newest activity, then the existing running and recent order', () => {
  const dwPinPanelRows = requirePin('dwPinPanelRows')
  const rows = dwPinPanelRows(pinInput({
    list: {
      ids: ['pinRunning', 'pinDoneNew', 'pinDoneOld', 'runX', 'runY', 'recZ'],
      byId: {
        pinRunning: summary('pinRunning'),
        pinDoneNew: summary('pinDoneNew'),
        pinDoneOld: summary('pinDoneOld', { updatedAt: NOW - 999_000 })
      }
    },
    statuses: new Map([['pinRunning', { running: true }], ['pinDoneOld', { running: false }]]),
    runningRows: [
      row({ id: 'pinRunning', updatedAt: NOW - 1_000 }),
      row({ id: 'runX', updatedAt: NOW - 2_000 }),
      row({ id: 'runY', updatedAt: NOW - 3_000 })
    ],
    recentRows: [
      row({ id: 'pinDoneNew', updatedAt: NOW - 1_500, state: 'done' }),
      row({ id: 'recZ', updatedAt: NOW - 4_000, state: 'done' })
    ],
    pinnedIds: new Set(['pinRunning', 'pinDoneNew', 'pinDoneOld'])
  }))

  assert.deepEqual(
    ids(rows),
    ['pinRunning', 'pinDoneNew', 'pinDoneOld', 'runX', 'runY', 'recZ'],
    'pinned rows first (newest activity first, across live and finished sources), then unpinned running, then unpinned recent'
  )
  assert.deepEqual(
    field(rows, 'pinned'),
    [true, true, true, false, false, false],
    'every row carries its pinned flag'
  )
  assert.equal(rows[2].updatedAt, NOW - 999_000, 'the reconstructable pinned row keeps its own activity time while sorting')
})

test('unpinned rows keep the exact order they were handed in and are never re-timed', () => {
  const dwPinPanelRows = requirePin('dwPinPanelRows')
  const runningRows = [
    row({ id: 'runB', updatedAt: NOW - 3_000 }),
    row({ id: 'runA', updatedAt: NOW - 2_000 })
  ]
  const recentRows = [
    row({ id: 'recD', updatedAt: NOW - 5_000, state: 'done' }),
    row({ id: 'recC', updatedAt: NOW - 4_000, state: 'done' })
  ]
  const rows = dwPinPanelRows(pinInput({ runningRows, recentRows }))

  assert.deepEqual(ids(rows), ['runB', 'runA', 'recD', 'recC'], 'the ordinary rows are appended in their existing order')
  assert.deepEqual(field(rows, 'pinned'), [false, false, false, false], 'nothing is pinned')
  assert.deepEqual(field(rows, 'updatedAt'), [NOW - 3_000, NOW - 2_000, NOW - 5_000, NOW - 4_000])
})

test('blank, archived, subagent, and unknown pinned ids are skipped; child rows never surface', () => {
  const dwPinPanelRows = requirePin('dwPinPanelRows')
  const rows = dwPinPanelRows(pinInput({
    list: {
      ids: ['blankId', 'archivedId', 'childId', 'mainOk'],
      byId: {
        blankId: summary('blankId', { blank: true }),
        archivedId: summary('archivedId'),
        childId: summary('childId', { origin: 'subagent', parentId: 'mainOk' }),
        mainOk: summary('mainOk', { updatedAt: NOW - 10 * DAY_MS })
      }
    },
    archived: new Set(['archivedId']),
    statuses: new Map([
      ['blankId', { running: false }],
      ['archivedId', { running: false }],
      ['childId', { running: true }],
      ['mainOk', { running: false }]
    ]),
    pinnedIds: new Set(['blankId', 'archivedId', 'childId', 'ghostId', 'mainOk'])
  }))

  assert.deepEqual(ids(rows), ['mainOk'], 'only the valid main Session is listed')
  assert.equal(rows.some((candidate) => candidate.id === 'childId'), false, 'subagent Sessions never become top-level rows')
  assert.equal(rows.some((candidate) => candidate.id === 'ghostId'), false, 'a pinned id without a Session summary is skipped')
  const [main] = rows
  assert.equal(main.state, 'done')
  assert.equal(main.pinned, true)
  assert.equal(main.workspace, 'Ungrouped', 'an unowned Session falls back to the native ungrouped label')
})

test('EN and ZH dictionaries define the same pin keys', () => {
  assert.notEqual(stats, undefined, 'dynamicWorkspacesStats test seam is missing from src/client.js')
  const enKeys = Object.keys(stats.DW_EN).sort()
  const zhKeys = Object.keys(stats.DW_ZH).sort()
  assert.deepEqual(zhKeys, enKeys, 'both dictionaries must define the same key set')
  const enPinKeys = enKeys.filter((key) => key.startsWith('pin.'))
  const zhPinKeys = zhKeys.filter((key) => key.startsWith('pin.'))
  assert.deepEqual(zhPinKeys, enPinKeys, 'both dictionaries must define the same pin keys')
  for (const key of ['pin.pin', 'pin.unpin']) {
    assert.equal(typeof stats.DW_EN[key], 'string', `EN copy for ${key}`)
    assert.equal(typeof stats.DW_ZH[key], 'string', `ZH copy for ${key}`)
    assert.ok(stats.DW_EN[key].trim().length > 0, `EN copy for ${key} must not be blank`)
    assert.ok(stats.DW_ZH[key].trim().length > 0, `ZH copy for ${key} must not be blank`)
  }
})

test('requirement 1: the running-card status dot opts out of the shell superellipse', () => {
  const source = client.source
  // The shell theme applies `corner-shape: superellipse(1.5)` to every element,
  // which renders a plain `border-radius: 50%` dot as a squircle; the plugin dot
  // must explicitly ask for a round corner shape.
  assert.match(
    source,
    /\.psd-hovercard-dot\{[^}]*border-radius:50%[^}]*\}/,
    'DW_CSS must keep the circular .psd-hovercard-dot geometry'
  )
  assert.match(
    source,
    /\.psd-hovercard-dot\{[^}]*corner-shape:round[^}]*\}/,
    'DW_CSS .psd-hovercard-dot must set corner-shape:round (requirement 1: perfect circle under the shell superellipse)'
  )
  assert.match(
    source,
    /\.psd-hovercard-dot\[data-state='done'\]\{[^}]*\}/,
    'the finished-state recolour rule must still exist'
  )
})
