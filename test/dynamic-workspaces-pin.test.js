/**
 * Unit tests for pinned Sessions in the Running & recent card of the
 * dynamic-Workspaces feature.
 *
 * `src/client.js` is a browser classic script materialized in a `node:vm`
 * sandbox by `test/helpers/client-module.mjs`; the helpers are read from the
 * `dynamicWorkspacesPin` test-hook namespace (kept separate from the annotation
 * seam so that seam's keys stay frozen). The implementation contract lives in
 * `.tmp-work/pin-stats-contract.md`; these tests cover its numbered list:
 *
 * 1. `dwPinnedSessionIds` sanitizes/dedupes and tolerates a missing/malformed
 *    snapshot.
 * 2. A pinned finished row outside the retention window stays listed with
 *    `state: 'done'` and its original `updatedAt` (pin never re-times a row).
 * 3. Pinned rows sort first by newest activity; unpinned running rows keep
 *    their order and follow; unpinned recent rows keep their order and come
 *    last.
 * 4. Blank/archived/subagent/unknown pinned ids are skipped; child rows are
 *    never produced or pinned.
 * 5. An id already present in the running/recent rows is never duplicated.
 * 6. EN and ZH define the same pin keys.
 * 7. Source-level regression for requirement 1: the running-card status dot
 *    opts out of the shell's global superellipse with `corner-shape: round`.
 * 8. Source-level regression for the Host-shared design: the client toggles the
 *    shell's own Session pin through `uiWorkspace.pinSession` /
 *    `unpinSession`, and the removed panel-local document
 *    (`power-suite.dynamic-workspaces.pinned`, `dwReadPinnedIds`,
 *    `dwWritePinnedIds`) is gone.
 *
 * Scope: this file pins the pure helper derivation/sanitization and the source
 * wiring only. The Host round-trip cannot be unit-tested here — the vm sandbox
 * materializes the factory without a live Host `WorkspaceSnapshot` — so the
 * cross-device proof (one Host-shared pin set observed by two browser profiles,
 * the native sidebar pin marker, reload persistence) belongs to the live
 * `--pin` E2E harness (`test/browser/sidebar.e2e.mjs`). Data-only behavior
 * (hover reveal, focus rings, row tint) belongs there too.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientModule } from './helpers/client-module.mjs'

const client = loadClientModule()
const production = loadClientModule({ hooksFlag: false })
const pin = client.hooks?.dynamicWorkspacesPin
const stats = client.hooks?.dynamicWorkspacesStats

/** Fixed clock used by every row fixture (2025-10-09T08:53:20Z). */
const NOW = 1_760_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000

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
    + `expected globalThis.__POWER_SUITE_TEST_HOOKS__.dynamicWorkspacesPin = { dwPinnedSessionIds, dwPinPanelRows } `
    + `(hooks found: ${client.hooks ? Object.keys(client.hooks).join(', ') : '(none)'}).`
  )
  const helper = pin[name]
  assert.equal(typeof helper, 'function', `hooks.dynamicWorkspacesPin.${name} is not a function`)
  return helper
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
 * @param {string} field - row field name.
 * @returns {Array<unknown>} field values.
 */
function field(rows, field) {
  return Array.from(rows, (candidate) => candidate[field])
}

test('dynamic-Workspaces pin seam is present and production stays inert', () => {
  assert.notEqual(
    pin,
    undefined,
    'hooks.dynamicWorkspacesPin is missing from src/client.js (test seam not wired yet)'
  )
  assert.deepEqual(
    [...Object.keys(pin)].sort(),
    ['dwPinPanelRows', 'dwPinnedSessionIds'],
    'the seam exposes exactly the two pure pin helpers; the Host owns the pin state'
  )
  assert.equal(typeof pin.dwPinnedSessionIds, 'function', 'dwPinnedSessionIds is exported through the seam')
  assert.equal(typeof pin.dwPinPanelRows, 'function', 'dwPinPanelRows is exported through the seam')
  assert.equal(production.hooks, undefined, 'the test-hook seam must stay inert when the flag is not set')
})

test('the Host-shared pin is wired through the shell services, not a panel-local document', () => {
  const source = client.source
  // Toggling mirrors the native sidebar marker/menu: the card calls the shell's
  // own Host-persisted Session pin services.
  assert.match(source, /uiWorkspace\.pinSession/, 'the card pins through the shell service uiWorkspace.pinSession')
  assert.match(source, /uiWorkspace\.unpinSession/, 'the card unpins through the shell service uiWorkspace.unpinSession')
  // The superseded panel-local localStorage document is gone.
  assert.doesNotMatch(
    source,
    /power-suite\.dynamic-workspaces\.pinned/,
    'the removed panel-local pin document must not reappear'
  )
  assert.doesNotMatch(source, /dwReadPinnedIds|dwWritePinnedIds/, 'the removed pin-document helpers must not reappear')
})

test('pinned ids sanitize, dedupe, and tolerate a missing or malformed snapshot', () => {
  const pinnedSessionIds = requirePin('dwPinnedSessionIds')
  for (const snapshot of [
    undefined,
    null,
    {},
    { pinnedSessionIds: null },
    { pinnedSessionIds: 'session-a' },
    { pinnedSessionIds: {} },
    { pinnedSessionIds: [] }
  ]) {
    const result = pinnedSessionIds(snapshot)
    assert.equal(typeof result?.has, 'function', `expected a Set for snapshot ${JSON.stringify(snapshot)}`)
    assert.equal(result.size, 0, `expected no pinned ids for snapshot ${JSON.stringify(snapshot)}`)
  }
  // Keeps only non-empty strings and never repeats an id; junk entries are dropped.
  const result = pinnedSessionIds({ pinnedSessionIds: ['session-a', '', null, 42, {}, ['session-b'], 'session-b', 'session-c'] })
  assert.deepEqual([...result].sort(), ['session-a', 'session-b', 'session-c'])
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
