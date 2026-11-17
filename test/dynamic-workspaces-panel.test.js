/**
 * Unit tests for the Running & recent card's native-pin ordering and the
 * pending-interaction flag derivation (`pending-notice-align` inline-flag design).
 *
 * `src/client.js` is a browser classic script materialized in a `node:vm`
 * sandbox by `test/helpers/client-module.mjs`; the helpers are read from the
 * `dynamicWorkspacesPanel` test-hook namespace.
 *
 * Notices are derived from the client's own `SessionStatus.pendingInteraction`
 * (question / plan-review / approval) and are preview-only — the native composer
 * card remains the answering surface. Pin coverage lives in
 * `test/dynamic-workspaces-pin.test.js` (the card-owned pin document).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientModule } from './helpers/client-module.mjs'

const client = loadClientModule()
/** Copy a sandbox-realm value into this realm for strict deep equality. */
const plain = (value) => structuredClone(value)
const production = loadClientModule({ hooksFlag: false })
const panel = client.hooks?.dynamicWorkspacesPanel

/** Fixed clock used by every fixture (2025-10-09T08:53:20Z). */
const NOW = 1_760_000_000_000

/** Functions the seam must expose. */
const SEAM_KEYS = ['dwPendingSessionIds']

/**
 * Read one helper off the panel seam with a clear failure.
 * @param {string} name - seam key.
 * @returns {Function} the helper.
 */
function helper(name) {
  assert.notEqual(panel, undefined, 'hooks.dynamicWorkspacesPanel is missing from src/client.js')
  assert.equal(typeof panel[name], 'function', `hooks.dynamicWorkspacesPanel.${name} is not a function`)
  return panel[name]
}

/** Session-list summary fixture. */
function summary(id, overrides = {}) {
  return {
    displayTitle: `Title ${id}`,
    cwd: `/repo/${id}`,
    updatedAt: NOW - 60_000,
    ...overrides
  }
}

test('the panel seam exposes the pending-flag helper', () => {
  assert.notEqual(panel, undefined, 'hooks.dynamicWorkspacesPanel is missing')
  for (const name of SEAM_KEYS) {
    assert.equal(typeof panel[name], 'function', `${name} is exported through the seam`)
  }
  assert.equal(production.hooks, undefined, 'the test-hook seam stays inert when the flag is not set')
})

test('waiting Session ids cover every pending kind and skip non-actionable Sessions', () => {
  const derive = helper('dwPendingSessionIds')
  const filtered = derive({
    list: {
      byId: {
        blank: summary('blank', { blank: true }),
        sub: summary('sub', { origin: 'subagent' }),
        archived: summary('archived'),
        known: summary('known'),
        current: summary('current'),
        idle: summary('idle')
      }
    },
    statuses: new Map([
      ['blank', { pendingInteraction: { kind: 'question', sessionId: 'blank', questions: [{ id: 'q', question: 'Q' }] } }],
      ['sub', { pendingInteraction: { kind: 'question', sessionId: 'sub', questions: [{ id: 'q', question: 'Q' }] } }],
      ['missing', { pendingInteraction: { kind: 'approval', sessionId: 'missing', reason: 'R' } }],
      ['archived', { pendingInteraction: { kind: 'question', sessionId: 'archived', questions: [{ id: 'q', question: 'Q' }] } }],
      ['known', { running: true, pendingInteraction: { kind: 'plan-review', sessionId: 'known', questions: [] } }],
      ['current', { pendingInteraction: { kind: 'question', sessionId: 'current', questions: [{ id: 'q', question: 'Q' }] } }],
      ['idle', { running: false, pendingInteraction: { kind: 'question', sessionId: 'idle', questions: [{ id: 'q', question: 'Q' }] } }]
    ]),
    currentSessionId: 'current',
    archived: new Set(['archived']),
    activity: {}
  })
  assert.deepEqual(plain(filtered), ['known'], 'only the actionable waiting Session keeps a flag')

  const statuses = new Map()
  const byId = {}
  // Insert the statuses in ascending activity order so the derivation's sort is
  // what produces the expected newest-first ids.
  for (let index = 4; index >= 0; index -= 1) {
    const id = `session-${index}`
    statuses.set(id, { pendingInteraction: { kind: 'question', sessionId: id, questions: [{ id: 'q', question: `Q${index}` }] } })
    byId[id] = summary(id, { updatedAt: NOW - index * 1_000 })
  }
  const many = derive({ list: { byId }, statuses, currentSessionId: null, archived: new Set(), activity: {} })
  assert.deepEqual(plain(many), ['session-0', 'session-1', 'session-2', 'session-3', 'session-4'],
    'every waiting Session gets a flag, newest first — no 3-card cap')
})

test('approval/plan-review kinds and the status-id fallback keep their flag', () => {
  const derive = helper('dwPendingSessionIds')
  const run = derive({
    list: { byId: { approval: summary('approval', { updatedAt: NOW }), plan: summary('plan', { updatedAt: NOW - 1_000 }) } },
    statuses: new Map([
      ['approval', { pendingInteraction: { kind: 'approval', reason: 'Allow rm?' } }],
      ['plan', { pendingInteraction: { kind: 'plan-review', sessionId: 'plan', questions: [] } }]
    ]),
    currentSessionId: null,
    archived: new Set(),
    activity: {}
  })
  assert.deepEqual(plain(run), ['approval', 'plan'],
    'an approval without its own sessionId still uses the status key, and no kind is dropped')
})
