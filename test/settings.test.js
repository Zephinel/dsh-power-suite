import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  PROMPT_HISTORY_MODIFIERS,
  SETTINGS_VERSION,
  createSettingsStore,
  defaultSettings,
  isPromptHistoryModifier,
  parseSettings,
  serializeSettings,
  settingsPath,
  validatePatch
} from '../src/features/settings/store.js'

test('empty, malformed, and wrong-version files read as defaults', () => {
  assert.deepEqual(parseSettings(''), defaultSettings())
  assert.deepEqual(parseSettings('not json'), defaultSettings())
  assert.deepEqual(parseSettings(JSON.stringify({ version: 0, settings: {} })), defaultSettings())
  assert.deepEqual(parseSettings('null'), defaultSettings())
})

test('settings round-trip and keep only known fields', () => {
  for (const modifier of PROMPT_HISTORY_MODIFIERS) {
    const text = serializeSettings({ promptHistoryModifier: modifier })
    assert.deepEqual(parseSettings(text), { promptHistoryModifier: modifier })
  }
  const parsed = parseSettings(JSON.stringify({
    version: SETTINGS_VERSION,
    settings: { promptHistoryModifier: 'nope', futureField: true }
  }))
  assert.deepEqual(parsed, defaultSettings())
  assert.equal(isPromptHistoryModifier('alt'), true)
  assert.equal(isPromptHistoryModifier('shift'), true)
  assert.equal(isPromptHistoryModifier('super'), false)
})

test('patches accept only known fields with valid values', () => {
  assert.deepEqual(validatePatch({ promptHistoryModifier: 'alt' }), {
    ok: true,
    value: { promptHistoryModifier: 'alt' }
  })
  assert.equal(validatePatch({}).ok, false)
  assert.equal(validatePatch(null).ok, false)
  assert.deepEqual(validatePatch({ promptHistoryModifier: 'shift' }), {
    ok: true,
    value: { promptHistoryModifier: 'shift' }
  })
  assert.equal(validatePatch({ promptHistoryModifier: 'nope' }).ok, false)
  assert.equal(validatePatch({ unknown: 'primary' }).ok, false)
})

test('the store persists writes, applies partial patches, and clears to defaults', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'power-suite-settings-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const store = createSettingsStore(home)
  assert.deepEqual(await store.get(), defaultSettings())
  assert.deepEqual(await store.update({ promptHistoryModifier: 'alt' }), { promptHistoryModifier: 'alt' })
  const reopened = createSettingsStore(home)
  assert.deepEqual(await reopened.get(), { promptHistoryModifier: 'alt' })
  const text = await readFile(settingsPath(home), 'utf8')
  assert.deepEqual(JSON.parse(text), {
    version: SETTINGS_VERSION,
    settings: { promptHistoryModifier: 'alt' }
  })
  // A corrupt file boots the store at defaults instead of failing.
  await writeFile(settingsPath(home), '{ broken', 'utf8')
  assert.deepEqual(await createSettingsStore(home).get(), defaultSettings())
})

test('concurrent writes serialize without losing the last value', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'power-suite-settings-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const store = createSettingsStore(home)
  await Promise.all([
    store.update({ promptHistoryModifier: 'ctrl' }),
    store.update({ promptHistoryModifier: 'alt' })
  ])
  const reopened = createSettingsStore(home)
  assert.deepEqual(await reopened.get(), { promptHistoryModifier: 'alt' })
})
