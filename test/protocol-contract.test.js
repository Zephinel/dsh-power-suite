import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

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
import { ROUTES, browserRoute } from '../src/shared/routes.ts'
import {
  ACTIVE_PROJECT_DAYS,
  ACTIVE_PROJECT_FIELD,
  DEFAULT_SETTINGS,
  PROMPT_HISTORY_MODIFIERS,
  PROMPT_HISTORY_MODIFIER_FIELD,
  RECENT_SESSION_FIELD,
  RECENT_SESSION_MINUTES
} from '../src/shared/protocol.ts'
import { SIDEBAR_WIDTH_ROUTE as CLIENT_SIDEBAR_WIDTH_ROUTE } from '../src/browser/sidebar-width/model.ts'
import {
  ACTIVE_PROJECT_DAYS as HOST_ACTIVE_PROJECT_DAYS,
  DEFAULT_SETTINGS as HOST_DEFAULT_SETTINGS,
  PROMPT_HISTORY_MODIFIERS as HOST_PROMPT_HISTORY_MODIFIERS,
  RECENT_SESSION_MINUTES as HOST_RECENT_SESSION_MINUTES
} from '../src/features/settings/store.ts'

// The cross-half route vocabulary now has one owner: src/shared/routes.ts.
// Host modules re-export its paths and the browser entry/models import the same
// constants (relative, via browserRoute). No route literal may reappear on
// either side.

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

const sharedRoutes = new Set(Object.values(ROUTES).map((route) => route.replace(/^\//u, '')))

test('the Host route constants re-export the shared contract', () => {
  assert.deepEqual([...hostRoutes].sort(), [...sharedRoutes].sort())
})

const srcRoot = fileURLToPath(new URL('../src', import.meta.url))
const routeLiteral = /['"]\/?api\/[A-Za-z0-9.-]+['"]/gu

test('no TypeScript module outside the shared owner carries a route literal', () => {
  const files = readdirSync(srcRoot, { recursive: true })
    .filter((name) => typeof name === 'string' && name.endsWith('.ts'))
  assert.ok(files.length > 20, 'expected to scan the TypeScript modules')
  for (const relative of files) {
    if (relative === join('shared', 'routes.ts')) continue
    const text = readFileSync(join(srcRoot, relative), 'utf8')
    const literals = [...text.matchAll(routeLiteral)].map((match) => match[0])
    assert.deepEqual(literals, [], `${relative} contains a route literal`)
  }
  assert.equal(new Set(Object.values(ROUTES)).size, Object.values(ROUTES).length, 'route paths must be unique')
})

test('the browser half uses the shared contract and no route literals', () => {
  const literals = [...clientSource.matchAll(/['"`]\/?api\/[A-Za-z0-9.-]+['"`]/gu)]
  assert.deepEqual(literals.map((match) => match[0]), [])
  assert.equal(CLIENT_SIDEBAR_WIDTH_ROUTE, browserRoute(ROUTES.sidebarWidth))
  for (const route of Object.values(ROUTES)) {
    assert.match(route, /^\/api\/[A-Za-z0-9.-]+$/u)
  }
})

test('the settings enums/defaults have one shared owner used by both halves', () => {
  assert.deepEqual([...PROMPT_HISTORY_MODIFIERS], ['primary', 'alt', 'ctrl', 'shift', 'off'])
  assert.deepEqual([...RECENT_SESSION_MINUTES], [60, 120, 360, 720, 1440])
  assert.deepEqual([...ACTIVE_PROJECT_DAYS], [1, 3, 7, 14, 30])
  assert.deepEqual(DEFAULT_SETTINGS, { promptHistoryModifier: 'primary', recentSessionMinutes: 120, activeProjectDays: 7 })
  assert.equal(PROMPT_HISTORY_MODIFIER_FIELD, 'promptHistoryModifier')
  assert.equal(RECENT_SESSION_FIELD, 'recentSessionMinutes')
  assert.equal(ACTIVE_PROJECT_FIELD, 'activeProjectDays')
  // The Host store re-exports the very same objects; the browser modules import
  // them. The entry no longer needs a direct import because the settings page
  // and store moved under src/browser/settings/.
  assert.equal(HOST_PROMPT_HISTORY_MODIFIERS, PROMPT_HISTORY_MODIFIERS)
  assert.equal(HOST_RECENT_SESSION_MINUTES, RECENT_SESSION_MINUTES)
  assert.equal(HOST_ACTIVE_PROJECT_DAYS, ACTIVE_PROJECT_DAYS)
  assert.equal(HOST_DEFAULT_SETTINGS, DEFAULT_SETTINGS)
  const browserSources = [
    clientSource,
    readFileSync(new URL('../src/browser/settings/store.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/browser/settings/page.ts', import.meta.url), 'utf8')
  ].join('\n')
  assert.match(browserSources, /from '\.\.\/\.\.\/shared\/protocol\.ts'/u)
  for (const name of ['PROMPT_HISTORY_MODIFIERS', 'RECENT_SESSION_MINUTES', 'ACTIVE_PROJECT_DAYS', 'DEFAULT_SETTINGS']) {
    assert.doesNotMatch(browserSources, new RegExp(`const ${name} = `, 'u'), `${name} must come from the shared contract`)
  }
})
