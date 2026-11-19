/**
 * Unit tests for the card row "…" menu's native-popup delegation.
 *
 * The pure model lives in `src/browser/dynamic-workspaces/row-menu.ts`; this
 * file imports it directly (no vm seam). Everything asserted here covers the
 * plugin-owned captured target kind the shared context-menu popup opens
 * against, the Pin/Unpin view filter, and the pure mapping from native
 * `MenuActionView`s to delegating `MenuAction`s whose `run` calls the nested
 * native resolution's `select`.
 *
 * The popup itself (native icons, shortcut hints, material, placement, focus,
 * dismissal) belongs to `@deepseek-ai/dsh-client-ui-context-menu` and is
 * covered by the live-GUI E2E harness; this file proves the delegation
 * contract only.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DW_ROW_MENU_TARGET,
  dwRowMenuActions,
  dwRowMenuIsPinView,
  dwRowMenuResolve
} from '../src/browser/dynamic-workspaces/row-menu.ts'

/**
 * Copy a value graph for strict deep equality, dropping function fields (the
 * delegating `run` callbacks are asserted by invoking them instead of by
 * identity).
 * @param {unknown} value - value to convert.
 * @returns {unknown} a plain test-realm copy.
 */
function plain(value) {
  if (Array.isArray(value)) return Array.from(value, (entry) => plain(entry))
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value)) {
      if (typeof value[key] === 'function') continue
      out[key] = plain(value[key])
    }
    return out
  }
  return value
}

/** Namespaced native view ids, shaped as the shared menu registry produces them. */
const RENAME = 'session.rename/rename'
const FORK = 'session.fork/fork'
const COPY = 'session.id/copy'
const ARCHIVE = 'session.archive/archive'
const PIN = 'session.pin/pin'
const UNPIN = 'session.pin/unpin'

test('the module exposes the plugin target kind and the two pure helpers', () => {
  assert.equal(DW_ROW_MENU_TARGET, 'powerSuiteSession')
  assert.notEqual(DW_ROW_MENU_TARGET, 'session', 'the card opens its own captured-target kind, not the native one')
  assert.equal(typeof dwRowMenuIsPinView, 'function')
  assert.equal(typeof dwRowMenuActions, 'function')
})

test('Pin/Unpin views are detected by the id suffix and by the native icon key', () => {
  assert.equal(dwRowMenuIsPinView({ id: PIN }), true)
  assert.equal(dwRowMenuIsPinView({ id: UNPIN }), true)
  assert.equal(dwRowMenuIsPinView({ id: 'plugin.custom.pin-entry', icon: { key: 'workspace.pin' } }), true)
  assert.equal(dwRowMenuIsPinView({ id: 'plugin.custom.unpin-entry', icon: { key: 'workspace.unpin' } }), true)
  assert.equal(dwRowMenuIsPinView({ id: RENAME, icon: { key: 'workspace.rename' } }), false)
  assert.equal(dwRowMenuIsPinView({ id: 'plugin.pin.copy', icon: { key: 'workspace.copy' } }), false)
  assert.equal(dwRowMenuIsPinView(null), false)
  assert.equal(dwRowMenuIsPinView(undefined), false)
  assert.equal(dwRowMenuIsPinView('pin'), false)
})

test('Pin and Unpin are filtered out while every other native action keeps its order', () => {
  const views = [
    { id: PIN, label: 'Pin session', icon: { key: 'workspace.pin' } },
    { id: RENAME, label: 'Rename', icon: { key: 'workspace.rename' }, commandId: 'session.rename' },
    { id: UNPIN, label: 'Unpin session', icon: { key: 'workspace.unpin' } },
    { id: FORK, label: 'Fork', icon: { key: 'workspace.fork' }, commandId: 'session.fork' }
  ]
  const actions = dwRowMenuActions(views, () => {})
  assert.deepEqual(plain(actions).map((action) => action.id), [RENAME, FORK])
})

test('a pin hidden behind another id is still filtered by its icon key', () => {
  const views = [
    { id: 'plugin.extra.menu', label: 'Pin session', icon: { key: 'workspace.pin' } },
    { id: 'plugin.extra.other', label: 'Unpin session', icon: { key: 'workspace.unpin' } },
    { id: COPY, label: 'Copy Session ID', icon: { key: 'workspace.copy' } }
  ]
  const actions = dwRowMenuActions(views, () => {})
  assert.deepEqual(plain(actions).map((action) => action.id), [COPY])
})

test('every native presentation field is copied verbatim', () => {
  const views = [
    {
      id: RENAME,
      label: 'Rename',
      icon: { key: 'workspace.rename' },
      commandId: 'session.rename'
    },
    {
      id: FORK,
      label: 'Fork',
      icon: { key: 'workspace.fork' },
      commandId: 'session.fork',
      disabled: false
    },
    {
      id: COPY,
      label: 'Copy Session ID',
      icon: { key: 'workspace.copy' },
      separatorBefore: true
    },
    {
      id: 'files.reveal/reveal',
      label: 'Show in Finder',
      icon: { key: 'power-suite.reveal' },
      danger: true
    },
    {
      id: ARCHIVE,
      label: 'Archive',
      icon: { key: 'workspace.archive' },
      commandId: 'session.archive',
      separatorBefore: true,
      afterContent: true
    }
  ]
  const actions = dwRowMenuActions(views, () => {})
  assert.deepEqual(plain(actions), [
    { id: RENAME, label: 'Rename', icon: { key: 'workspace.rename' }, commandId: 'session.rename' },
    { id: FORK, label: 'Fork', icon: { key: 'workspace.fork' }, commandId: 'session.fork', disabled: false },
    { id: COPY, label: 'Copy Session ID', icon: { key: 'workspace.copy' }, separatorBefore: true },
    { id: 'files.reveal/reveal', label: 'Show in Finder', icon: { key: 'power-suite.reveal' }, danger: true },
    {
      id: ARCHIVE,
      label: 'Archive',
      icon: { key: 'workspace.archive' },
      commandId: 'session.archive',
      separatorBefore: true,
      afterContent: true
    }
  ])
  for (const action of actions) assert.equal(typeof action.run, 'function', 'every action delegates through a run callback')
})

test('children are mapped recursively, filtered and ordered like their parents', () => {
  const views = [{
    id: 'power-suite.workspacePreset/workspaceDefaultPreset',
    label: 'Workspace default preset',
    icon: { key: 'power-suite.workspacePreset' },
    children: [
      { id: 'workspacePreset/global', label: 'Follow global default' },
      { id: 'workspacePreset/pin', label: 'Pin session', icon: { key: 'workspace.pin' } },
      { id: 'power-suite.workspacePreset/preset:focus', label: 'Focus preset', disabled: true }
    ]
  }]
  const calls = []
  const actions = dwRowMenuActions(views, (id) => calls.push(id))
  assert.deepEqual(plain(actions), [{
    id: 'power-suite.workspacePreset/workspaceDefaultPreset',
    label: 'Workspace default preset',
    icon: { key: 'power-suite.workspacePreset' },
    children: [
      { id: 'workspacePreset/global', label: 'Follow global default' },
      { id: 'power-suite.workspacePreset/preset:focus', label: 'Focus preset', disabled: true }
    ]
  }])
  actions[0].children[0].run()
  actions[0].children[1].run()
  assert.deepEqual(calls, ['workspacePreset/global', 'power-suite.workspacePreset/preset:focus'])
})

test('run delegates with the ORIGINAL namespaced view id', () => {
  const calls = []
  const views = [
    { id: PIN, label: 'Pin session', icon: { key: 'workspace.pin' } },
    { id: RENAME, label: 'Rename', icon: { key: 'workspace.rename' }, commandId: 'session.rename' },
    { id: ARCHIVE, label: 'Archive', icon: { key: 'workspace.archive' }, separatorBefore: true, afterContent: true }
  ]
  const actions = dwRowMenuActions(views, (id) => calls.push(id))
  for (const action of actions) action.run()
  assert.deepEqual(calls, [RENAME, ARCHIVE], 'selection must use the nested resolution id, not a remapped label')
})

test('invalid and non-object entries are skipped', () => {
  const views = [null, undefined, 'rename', 42, { label: 'no id' }, { id: '' }, { id: RENAME, label: 'Rename' }]
  const actions = dwRowMenuActions(views, () => {})
  assert.deepEqual(plain(actions), [{ id: RENAME, label: 'Rename' }])
})

test('an empty or missing view list maps to an empty action list', () => {
  assert.deepEqual(plain(dwRowMenuActions([], () => {})), [])
  assert.deepEqual(plain(dwRowMenuActions(null, () => {})), [])
  assert.deepEqual(plain(dwRowMenuActions(undefined, () => {})), [])
  assert.deepEqual(plain(dwRowMenuActions('not-an-array', () => {})), [])
})

test('a missing select callback leaves the actions inert instead of throwing', () => {
  const actions = dwRowMenuActions([{ id: RENAME, label: 'Rename' }])
  assert.doesNotThrow(() => actions[0].run())
})

test('the delegation resolves the native session target and maps its views', async () => {
  const { service, calls } = fakeMenuService({
    views: [
      { id: PIN, label: 'Pin session', icon: { key: 'workspace.pin' } },
      { id: RENAME, label: 'Rename', icon: { key: 'workspace.rename' }, commandId: 'session.rename' },
      { id: ARCHIVE, label: 'Archive', icon: { key: 'workspace.archive' }, separatorBefore: true, afterContent: true }
    ]
  })
  const controller = new AbortController()
  const actions = await dwRowMenuResolve(service, { sessionId: 'session-1', displayTitle: 'Title' }, controller.signal, 5)
  assert.deepEqual(plain(calls.resolve), [{ kind: 'session', value: { sessionId: 'session-1', displayTitle: 'Title' } }])
  assert.deepEqual(plain(actions).map((action) => action.id), [RENAME, ARCHIVE])
  assert.deepEqual(plain(actions).map((action) => action.commandId ?? null), ['session.rename', null])
  assert.equal(actions[1].afterContent, true, 'the native footer placement is preserved')
  assert.equal(calls.dispose, 0, 'an open menu keeps its nested occurrence alive')
  controller.abort()
  await Promise.resolve()
  assert.equal(calls.dispose, 1, 'dismissing disposes the nested occurrence exactly once')
})

test('selection delegates to the nested native select with the original id', async () => {
  const { service, calls } = fakeMenuService({
    views: [{ id: RENAME, label: 'Rename', commandId: 'session.rename' }]
  })
  const actions = await dwRowMenuResolve(service, { sessionId: 'session-1' }, new AbortController().signal, 5)
  actions[0].run()
  assert.deepEqual(calls.select, [RENAME])
})

test('a nested select that refuses execution does not throw through the action', async () => {
  const { service } = fakeMenuService({ views: [{ id: RENAME, label: 'Rename' }], selectThrows: true })
  const actions = await dwRowMenuResolve(service, { sessionId: 'session-1' }, new AbortController().signal, 5)
  assert.doesNotThrow(() => actions[0].run())
})

test('an abort before the nested providers settle resolves empty and disposes once', async () => {
  const pending = new Promise(() => {})
  const { service, calls } = fakeMenuService({ views: [{ id: RENAME, label: 'Rename' }], ready: pending })
  const controller = new AbortController()
  const pendingResolution = dwRowMenuResolve(service, { sessionId: 'session-1' }, controller.signal, 5)
  controller.abort()
  const actions = await pendingResolution
  assert.deepEqual(plain(actions), [])
  assert.equal(calls.dispose, 1)
  controller.abort()
  controller.abort()
  await Promise.resolve()
  assert.equal(calls.dispose, 1, 'release is idempotent and deferred once')
})

test('a slow nested provider cannot empty the menu: already-published views are used after the budget', async () => {
  const pending = new Promise(() => {})
  const { service } = fakeMenuService({ views: [{ id: COPY, label: 'Copy Session ID' }], ready: pending })
  const actions = await dwRowMenuResolve(service, { sessionId: 'session-1' }, new AbortController().signal, 5)
  assert.deepEqual(plain(actions).map((action) => action.id), [COPY], 'the published views survive an unresolved ready')
})

test('a missing service, invalid value or aborted signal resolves empty without throwing', async () => {
  const { service } = fakeMenuService({ views: [{ id: RENAME, label: 'Rename' }] })
  assert.deepEqual(plain(await dwRowMenuResolve(null, { sessionId: 'session-1' }, new AbortController().signal, 5)), [])
  assert.deepEqual(plain(await dwRowMenuResolve({}, { sessionId: 'session-1' }, new AbortController().signal, 5)), [])
  assert.deepEqual(plain(await dwRowMenuResolve(service, null, new AbortController().signal, 5)), [])
  assert.deepEqual(plain(await dwRowMenuResolve(service, { sessionId: '' }, new AbortController().signal, 5)), [])
  const aborted = new AbortController()
  aborted.abort()
  assert.deepEqual(plain(await dwRowMenuResolve(service, { sessionId: 'session-1' }, aborted.signal, 5)), [])
})

/**
 * Build a fake shared menu service + nested resolution for the delegation tests.
 * @param {{ views?: readonly object[], ready?: Promise<void>, selectThrows?: boolean }} [options] - fake facts.
 * @returns {{ service: object, calls: { resolve: object[], select: string[], dispose: number } }} fake service and recorded calls.
 */
function fakeMenuService(options = {}) {
  const calls = { resolve: [], select: [], dispose: 0 }
  const resolution = {
    ready: options.ready ?? Promise.resolve(),
    source: { getSnapshot: () => options.views ?? [] },
    select: (id) => {
      calls.select.push(id)
      if (options.selectThrows === true) throw new Error('refused')
    },
    dispose: () => { calls.dispose += 1 }
  }
  const service = {
    resolve: (target) => {
      calls.resolve.push(target)
      return resolution
    }
  }
  return { service, calls }
}
