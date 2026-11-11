import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  ACTIVE_PROJECT_DAYS,
  PROMPT_HISTORY_MODIFIERS,
  RECENT_SESSION_MINUTES,
  SETTINGS_VERSION,
  createSettingsStore,
  defaultSettings,
  isActiveProjectDays,
  isPromptHistoryModifier,
  isRecentSessionMinutes,
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
    assert.deepEqual(parseSettings(text), { ...defaultSettings(), promptHistoryModifier: modifier })
  }
  for (const minutes of RECENT_SESSION_MINUTES) {
    const text = serializeSettings({ promptHistoryModifier: 'primary', recentSessionMinutes: minutes })
    assert.deepEqual(parseSettings(text), { ...defaultSettings(), recentSessionMinutes: minutes })
  }
  for (const days of ACTIVE_PROJECT_DAYS) {
    const text = serializeSettings({ promptHistoryModifier: 'primary', activeProjectDays: days })
    assert.deepEqual(parseSettings(text), { ...defaultSettings(), activeProjectDays: days })
  }
  const parsed = parseSettings(JSON.stringify({
    version: SETTINGS_VERSION,
    settings: { promptHistoryModifier: 'nope', futureField: true, recentSessionMinutes: 5, activeProjectDays: 0 }
  }))
  assert.deepEqual(parsed, defaultSettings())
  assert.equal(isPromptHistoryModifier('alt'), true)
  assert.equal(isPromptHistoryModifier('shift'), true)
  assert.equal(isPromptHistoryModifier('super'), false)
  assert.equal(isRecentSessionMinutes(120), true)
  assert.equal(isRecentSessionMinutes(45), false)
  assert.equal(isActiveProjectDays(7), true)
  assert.equal(isActiveProjectDays(2), false)
})

test('version-1 modifier-only files upgrade to default windows', () => {
  const parsed = parseSettings(JSON.stringify({ version: 1, settings: { promptHistoryModifier: 'alt' } }))
  assert.deepEqual(parsed, { ...defaultSettings(), promptHistoryModifier: 'alt' })
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
  assert.deepEqual(validatePatch({ recentSessionMinutes: 120 }), {
    ok: true,
    value: { recentSessionMinutes: 120 }
  })
  assert.deepEqual(validatePatch({ activeProjectDays: 14 }), {
    ok: true,
    value: { activeProjectDays: 14 }
  })
  assert.deepEqual(validatePatch({ recentSessionMinutes: 360, activeProjectDays: 3 }), {
    ok: true,
    value: { recentSessionMinutes: 360, activeProjectDays: 3 }
  })
  assert.equal(validatePatch({ recentSessionMinutes: 90 }).ok, false)
  assert.equal(validatePatch({ activeProjectDays: 2 }).ok, false)
})

test('the store persists writes, applies partial patches, and clears to defaults', async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'power-suite-settings-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const store = createSettingsStore(home)
  assert.deepEqual(await store.get(), defaultSettings())
  assert.deepEqual(await store.update({ promptHistoryModifier: 'alt' }), { ...defaultSettings(), promptHistoryModifier: 'alt' })
  assert.deepEqual(await store.update({ recentSessionMinutes: 360 }), {
    ...defaultSettings(),
    promptHistoryModifier: 'alt',
    recentSessionMinutes: 360
  })
  assert.deepEqual(await store.update({ activeProjectDays: 30 }), {
    ...defaultSettings(),
    promptHistoryModifier: 'alt',
    recentSessionMinutes: 360,
    activeProjectDays: 30
  })
  const reopened = createSettingsStore(home)
  assert.deepEqual(await reopened.get(), {
    ...defaultSettings(),
    promptHistoryModifier: 'alt',
    recentSessionMinutes: 360,
    activeProjectDays: 30
  })
  const text = await readFile(settingsPath(home), 'utf8')
  assert.deepEqual(JSON.parse(text), {
    version: SETTINGS_VERSION,
    settings: {
      promptHistoryModifier: 'alt',
      recentSessionMinutes: 360,
      activeProjectDays: 30
    }
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
  assert.deepEqual(await reopened.get(), { ...defaultSettings(), promptHistoryModifier: 'alt' })
})
