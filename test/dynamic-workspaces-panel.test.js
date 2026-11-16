/**
 * Unit tests for the Running & recent card's native-pin ordering and the
 * pending-interaction notices (final `feat/running-panel-ux` design).
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
const SEAM_KEYS = ['dwNoticePlacement', 'dwNoticePlacementForRow', 'dwNoticeRowElement', 'dwNoticeRevealRow', 'dwPendingNotices']

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

test('the panel seam exposes the notice helpers', () => {
  assert.notEqual(panel, undefined, 'hooks.dynamicWorkspacesPanel is missing')
  for (const name of SEAM_KEYS) {
    assert.equal(typeof panel[name], 'function', `${name} is exported through the seam`)
  }
  assert.equal(production.hooks, undefined, 'the test-hook seam stays inert when the flag is not set')
})

test('pending notices cover questions, plan review and approval, newest first and capped', () => {
  const derive = helper('dwPendingNotices')
  const statuses = new Map([
    ['session-q', { pendingInteraction: { kind: 'question', sessionId: 'session-q', questions: [{ id: 'a', question: 'Which branch?' }, { id: 'b', question: 'Which tag?' }] } }],
    ['session-plan', { pendingInteraction: { kind: 'plan-review', sessionId: 'session-plan', questions: [{ id: 'p', question: 'Approve this plan?' }] } }],
    ['session-appr', { pendingInteraction: { kind: 'approval', sessionId: 'session-appr', reason: 'Run rm -rf build?' } }],
    ['session-idle', { pendingInteraction: undefined }]
  ])
  const list = { byId: {
    'session-q': summary('session-q', { updatedAt: NOW - 1_000 }),
    'session-plan': summary('session-plan', { updatedAt: NOW - 2_000 }),
    'session-appr': summary('session-appr', { updatedAt: NOW - 3_000 })
  } }
  const out = derive({ list, statuses, currentSessionId: null, archived: new Set(), activity: {} })
  assert.deepEqual(idsFrom(out.notices), ['session-q', 'session-plan', 'session-appr'])
  assert.deepEqual(Array.from(out.notices, (notice) => notice.kind), ['question', 'plan', 'approval'])
  assert.equal(out.notices[0].headline, 'Which branch?')
  assert.equal(out.notices[0].questionCount, 2)
  assert.equal(out.notices[1].headline, 'Approve this plan?')
  assert.equal(out.notices[2].headline, 'Run rm -rf build?')
  assert.equal(out.overflow, 0)

  const current = derive({ list, statuses, currentSessionId: 'session-q', archived: new Set(), activity: {} })
  assert.deepEqual(idsFrom(current.notices), ['session-plan', 'session-appr'], 'the open Session is never duplicated')
  const archived = derive({ list, statuses, currentSessionId: null, archived: new Set(['session-plan']), activity: {} })
  assert.deepEqual(idsFrom(archived.notices), ['session-q', 'session-appr'])
  const none = derive({ list, statuses: undefined, currentSessionId: null, archived: new Set(), activity: {} })
  assert.deepEqual(idsFrom(none.notices), [])

  // Filtering: blank, subagent, unknown and archived Sessions are skipped.
  const filtered = derive({
    list: { byId: {
      blank: summary('blank', { blank: true }),
      sub: summary('sub', { origin: 'subagent' }),
      known: summary('known'),
      idle: summary('idle')
    } },
    statuses: new Map([
      ['blank', { pendingInteraction: { kind: 'question', sessionId: 'blank', questions: [{ id: 'q', question: 'Q' }] } }],
      ['sub', { pendingInteraction: { kind: 'question', sessionId: 'sub', questions: [{ id: 'q', question: 'Q' }] } }],
      ['missing', { pendingInteraction: { kind: 'approval', sessionId: 'missing', reason: 'R' } }],
      ['archived', { pendingInteraction: { kind: 'question', sessionId: 'archived', questions: [{ id: 'q', question: 'Q' }] } }],
      ['known', { running: true, pendingInteraction: { kind: 'question', sessionId: 'known', questions: [{ id: 'q', question: 'Q' }] } }],
      ['idle', { running: false, pendingInteraction: { kind: 'question', sessionId: 'idle', questions: [{ id: 'q', question: 'Q' }] } }]
    ]),
    currentSessionId: null,
    archived: new Set(['archived']),
    activity: {}
  })
  assert.deepEqual(idsFrom(filtered.notices), ['known'], 'idle, archived, blank, subagent and missing Sessions are skipped')

  // Headline fallbacks: approval reason, then approval tool name.
  const approvalOnly = derive({
    list: { byId: { a: summary('a'), b: summary('b') } },
    statuses: new Map([
      ['a', { pendingInteraction: { kind: 'approval', sessionId: 'a', reason: 'Allow rm?' } }],
      ['b', { pendingInteraction: { kind: 'approval', sessionId: 'b', toolName: 'Bash' } }]
    ]),
    currentSessionId: null,
    archived: new Set(),
    activity: {}
  })
  assert.equal(approvalOnly.notices.find((notice) => notice.sessionId === 'a').headline, 'Allow rm?')
  assert.equal(approvalOnly.notices.find((notice) => notice.sessionId === 'b').headline, 'Bash')

  const many = new Map()
  const byId = {}
  for (let index = 0; index < 5; index += 1) {
    const id = `session-${index}`
    many.set(id, { pendingInteraction: { kind: 'question', sessionId: id, questions: [{ id: 'q', question: `Q${index}` }] } })
    byId[id] = summary(id, { updatedAt: NOW - index * 1_000 })
  }
  const capped = derive({ list: { byId }, statuses: many, currentSessionId: null, archived: new Set(), activity: {} })
  assert.equal(capped.notices.length, 3)
  assert.equal(capped.overflow, 2)
})

/** Session ids of a notice array, copied into the host realm. */
function idsFrom(notices) {
  return Array.from(notices, (notice) => notice.sessionId)
}

test('notice placement prefers the card right edge and clamps into the viewport', () => {
  const place = helper('dwNoticePlacement')
  assert.deepEqual(plain(place({ left: 16, right: 280, top: 100 }, 1440, 900)), { left: 288, top: 108, width: 320 })
  const flipped = plain(place({ left: 16, right: 1400, top: 200 }, 1440, 900))
  assert.equal(flipped.left, 8, 'a card flush to the right edge flips to the left and clamps')
  const narrow = plain(place({ left: 8, right: 240, top: 400 }, 360, 800))
  assert.equal(narrow.width, 320)
  assert.ok(narrow.left >= 8)
  const top = plain(place({ left: 16, right: 280, top: 2000 }, 1440, 900))
  assert.equal(top.top, 900 - 8 - 80)
  const stacked = plain(place({ left: 16, right: 280, top: 2000 }, 1440, 900, 300))
  assert.equal(stacked.top, 900 - 8 - 300, 'a three-notice stack is clamped so its bottom edge stays in view')
  assert.ok(stacked.top + 300 <= 900 - 8)
})

test('notice placement aligns flush with the sidebar boundary like the Session info card', () => {
  const place = helper('dwNoticePlacement')
  assert.deepEqual(
    plain(place({ left: 16, right: 280, top: 100 }, 1440, 900, undefined, 400)),
    { left: 400, top: 108, width: 320 },
    'the stack starts at the supplied sidebar edge instead of a card-relative gap'
  )
  const clamped = plain(place({ left: 16, right: 280, top: 100 }, 1440, 900, undefined, 1400))
  assert.equal(clamped.left, 1440 - 8 - 320, 'a right-edge anchor is clamped so the card stays in view')
  const narrow = plain(place({ left: 8, right: 240, top: 100 }, 360, 800, undefined, 352))
  assert.equal(narrow.width, 320)
  assert.equal(narrow.left, 32, 'a narrow viewport clamps the stack inside the right margin')
})

test('each notice is placed at its own Session row height', () => {
  const place = helper('dwNoticePlacementForRow')
  assert.deepEqual(
    plain(place({ top: 300 }, 1440, 900, 420, 96)),
    { left: 420, top: 300, width: 320 },
    'the notice top matches the row top and the left matches the sidebar edge'
  )
  const bottom = plain(place({ top: 880 }, 1440, 900, 420, 96))
  assert.equal(bottom.top, 900 - 8 - 96, 'a row near the bottom keeps the whole notice inside the viewport')
  const topEdge = plain(place({ top: 2 }, 1440, 900, 420))
  assert.equal(topEdge.top, 8, 'a row at the top is clamped to the viewport inset')
  const noAnchor = plain(place({ top: 300, left: 104 }, 1440, 900, null))
  assert.equal(noAnchor.left, 104, 'without a sidebar anchor the row left edge is used')
  const noAnchorRight = plain(place({ top: 300, left: 1400 }, 1440, 900, null))
  assert.equal(noAnchorRight.left, 1440 - 8 - 320, 'the fallback is clamped inside the viewport')
})

test('notice cards reuse the Session info card surface and keep it on hover', () => {
  assert.match(
    client.source,
    /\.psd-notice\{[^}]*background:var\(--dsw-hovercard-bg,#2c2c2e\)/,
    'the notice borrows the info card surface token instead of the panel layer'
  )
  assert.doesNotMatch(
    client.source,
    /\.psd-notice:hover\{[^}]*background/,
    'hover never swaps the surface (the info card itself has no hover wash)'
  )
  assert.match(
    client.source,
    /body:not\(\[data-ds-dark-theme\]\) \.psd-notice\b/,
    'light mode joins the same theme-following popover override as the info card'
  )
})
