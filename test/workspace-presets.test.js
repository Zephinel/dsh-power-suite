import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  STORE_VERSION,
  createPresetStore,
  emptyState,
  parseState,
  presetOf,
  serializeState,
  shouldApplyPreset,
  storePath,
  withPreset
} from '../src/features/workspace-presets/store.ts'

test('missing, malformed, or wrong-version state reads as empty', () => {
  assert.deepEqual(parseState(''), emptyState())
  assert.deepEqual(parseState('not json'), emptyState())
  assert.deepEqual(parseState('null'), emptyState())
  assert.deepEqual(parseState(JSON.stringify({ version: 99, workspaces: { a: 'x' } })), emptyState())
  assert.deepEqual(parseState(JSON.stringify({ workspaces: { a: 'x' } })), emptyState())
})

test('parsing keeps only usable entries', () => {
  const parsed = parseState(JSON.stringify({
    version: STORE_VERSION,
    workspaces: { a: 'standard', b: '', c: 3, '': 'creator' }
  }))
  assert.deepEqual(parsed.workspaces, { a: 'standard' })
})

test('serialization round-trips', () => {
  const state = withPreset(emptyState(), 'workspace-1', 'creator')
  assert.deepEqual(parseState(serializeState(state)), state)
})

test('a preset can be stored, replaced, and cleared', () => {
  let state = emptyState()
  assert.equal(presetOf(state, 'w1'), null)
  const set = withPreset(state, 'w1', 'creator')
  assert.equal(presetOf(set, 'w1'), 'creator')
  assert.equal(withPreset(set, 'w1', 'creator'), set)
  const replaced = withPreset(set, 'w1', 'standard')
  assert.equal(presetOf(replaced, 'w1'), 'standard')
  assert.equal(presetOf(withPreset(replaced, 'w1', null), 'w1'), null)
  const empty = emptyState()
  assert.equal(withPreset(empty, 'w1', null), empty)
})

test('application only replaces a default-composed session', () => {
  assert.equal(shouldApplyPreset({ current: null, globalDefault: 'standard', target: 'creator' }), true)
  assert.equal(shouldApplyPreset({ current: 'standard', globalDefault: 'standard', target: 'creator' }), true)
  assert.equal(shouldApplyPreset({ current: 'creator', globalDefault: 'standard', target: 'creator' }), false)
  assert.equal(shouldApplyPreset({ current: 'ptc', globalDefault: 'standard', target: 'creator' }), false)
  assert.equal(shouldApplyPreset({ current: 'standard', globalDefault: 'creator', target: 'creator' }), false)
  assert.equal(shouldApplyPreset({ current: 'standard', globalDefault: 'standard', target: null }), false)
  assert.equal(shouldApplyPreset({ current: 'standard', globalDefault: 'standard', target: '' }), false)
})

test('the store persists values across instances and clears durably', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'power-suite-presets-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const store = createPresetStore(home)
  assert.equal(await store.get('w1'), null)
  assert.equal(await store.set('w1', 'creator'), 'creator')
  assert.equal(await store.get('w1'), 'creator')
  const reopened = createPresetStore(home)
  assert.equal(await reopened.get('w1'), 'creator')
  const text = await readFile(storePath(home), 'utf8')
  assert.deepEqual(JSON.parse(text), { version: STORE_VERSION, workspaces: { w1: 'creator' } })
  assert.equal(await reopened.set('w1', null), null)
  assert.equal(await createPresetStore(home).get('w1'), null)
})

test('concurrent writes serialize without losing entries', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'power-suite-presets-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const store = createPresetStore(home)
  await Promise.all([
    store.set('w1', 'creator'),
    store.set('w2', 'standard'),
    store.set('w3', 'ptc')
  ])
  const reopened = createPresetStore(home)
  assert.equal(await reopened.get('w1'), 'creator')
  assert.equal(await reopened.get('w2'), 'standard')
  assert.equal(await reopened.get('w3'), 'ptc')
})

test('a corrupt file starts empty instead of failing', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'power-suite-presets-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const file = storePath(home)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, '{ broken', 'utf8')
  const store = createPresetStore(home)
  assert.equal(await store.get('w1'), null)
  assert.equal(await store.set('w1', 'creator'), 'creator')
})
