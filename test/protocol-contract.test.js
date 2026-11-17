import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { ATTACHMENT_ROUTE, LIST_ROUTE, PREVIEW_ROUTE, RAW_ROUTE } from '../src/features/session-artifacts/artifact-index.ts'
import { GET_ROUTE as PRESET_GET_ROUTE, SET_ROUTE as PRESET_SET_ROUTE } from '../src/features/workspace-presets/host.ts'
import { PROMPT_HISTORY_ROUTE } from '../src/features/prompt-history/history.ts'
import { INTERRUPTED_ROUTE } from '../src/features/interrupted-sessions/turns.ts'
import { CONTINUE_ROUTE, INTERRUPTED_EVENTS_ROUTE } from '../src/features/interrupted-sessions/host.ts'
import { SETTINGS_ROUTE } from '../src/features/settings/host.ts'
import { READ_ACKS_ROUTE } from '../src/features/read-acks/host.ts'
import { SESSION_PINS_ROUTE } from '../src/features/session-pins/host.ts'
import { SIDEBAR_WIDTH_ROUTE } from '../src/features/sidebar-width/host.ts'
import { SESSION_ACTIVITY_ROUTE } from '../src/features/session-activity/host.ts'
import { UPDATE_ROUTE } from '../src/features/update-check/host.ts'
import {
  ACTIVE_PROJECT_DAYS,
  defaultSettings,
  PROMPT_HISTORY_MODIFIERS,
  RECENT_SESSION_MINUTES
} from '../src/features/settings/store.ts'

// The browser half is a classic script that cannot import the Host constants
// until the build exists (docs/plans/typescript-migration.md), so Phase 1 keeps
// one shallow guard: the client copy must stay exactly equal to the Host sets.

const clientSource = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

const hostRoutes = new Set([
  LIST_ROUTE,
  RAW_ROUTE,
  ATTACHMENT_ROUTE,
  PREVIEW_ROUTE,
  PRESET_GET_ROUTE,
  PRESET_SET_ROUTE,
  PROMPT_HISTORY_ROUTE,
  INTERRUPTED_ROUTE,
  INTERRUPTED_EVENTS_ROUTE,
  CONTINUE_ROUTE,
  SETTINGS_ROUTE,
  READ_ACKS_ROUTE,
  SESSION_PINS_ROUTE,
  SIDEBAR_WIDTH_ROUTE,
  SESSION_ACTIVITY_ROUTE,
  UPDATE_ROUTE
].map((route) => route.replace(/^\//u, '')))

const clientRoutes = new Set(
  [...clientSource.matchAll(/['"`](\/?api\/[A-Za-z0-9.-]+)['"`]/gu)]
    .map((match) => match[1].replace(/^\//u, ''))
)

test('the client route literals match the Host route constants', () => {
  assert.deepEqual([...clientRoutes].sort(), [...hostRoutes].sort())
})

test('the client settings enums match the Host settings store', () => {
  const arrayOf = (name) => {
    const match = new RegExp(`const ${name} = \\[([^\\]]+)\\]`, 'u').exec(clientSource)
    assert.ok(match, `${name} is missing from src/client.js`)
    return JSON.parse(`[${match[1].replaceAll("'", '"')}]`)
  }
  assert.deepEqual(arrayOf('PROMPT_HISTORY_MODIFIERS'), PROMPT_HISTORY_MODIFIERS)
  assert.deepEqual(arrayOf('RECENT_SESSION_MINUTES'), RECENT_SESSION_MINUTES)
  assert.deepEqual(arrayOf('ACTIVE_PROJECT_DAYS'), ACTIVE_PROJECT_DAYS)
})

test('the client default settings match the Host defaults', () => {
  const match = /const DEFAULT_SETTINGS = (\{[^}]*\})/u.exec(clientSource)
  assert.ok(match, 'DEFAULT_SETTINGS is missing from src/client.js')
  const clientDefaults = JSON.parse(match[1].replace(/([A-Za-z0-9_]+):/gu, '"$1":').replaceAll("'", '"'))
  assert.deepEqual(clientDefaults, defaultSettings())
})
