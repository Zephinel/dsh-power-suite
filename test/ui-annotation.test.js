/**
 * Unit tests for the UI element annotation feature's pure model.
 *
 * `src/client.js` is a browser classic script: it registers a factory on
 * `window.__ModuleLoader__` and the DSH shell calls `factory(require)`. There is
 * no import surface, so `test/helpers/client-module.mjs` evaluates the file in a
 * `node:vm` sandbox, sets the §3.7 test-hook flag before evaluation, and
 * materializes the factory. Everything asserted here is a pure function from
 * `hooks.uiAnnotation`: no React rendering, no DOM listeners, no timers — the
 * live-page behavior belongs to `test/browser/annotation.e2e.mjs`.
 *
 * Contract: `/tmp/ps-annotation/CONTRACT.md` §3.7 (frozen seam signatures) and
 * §4.1 (unit-test scope), extended by `/tmp/ps-annotation/REVIEW-FINDINGS.md`.
 * Every fix-round regression below (F1-F4, F6, F11, F16) is written to fail on
 * the reviewed build 5136d3c and pass on `fix/ui-annotation-review-fixes`; the
 * round-2 regressions (R1 resolver semantics, R2 real session-attribute shape,
 * R3 credential shapes) fail on `e21929d` and pass after the round-2 fixes.
 * The seam is inert in production because the `__POWER_SUITE_TEST_HOOKS__`
 * global is only defined by this harness.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientModule } from './helpers/client-module.mjs'

/** One materialization of the browser module; the seam is read from it. */
const client = loadClientModule()

/** The pure annotation helpers, or undefined until the feature region lands. */
const ui = client.hooks?.uiAnnotation

/**
 * Copy a value created in the vm sandbox into this realm so
 * `assert.deepEqual` (strict, prototype-aware) can compare it with literals.
 * @param {unknown} value - sandbox-realm value.
 * @returns {unknown} host-realm structural copy.
 */
const plain = (value) => structuredClone(value)

if (ui === undefined) {
  // Pre-seam state: keep `npm test` green for the other agents while the
  // feature region is being written. This placeholder disappears from the
  // suite (and the tests below take over) as soon as §3.7 is implemented.
  test('ui annotation pure model (waiting for the src/client.js test seam)', { skip: 'CONTRACT.md §3.7 seam not implemented in src/client.js yet' }, () => {})
} else {
  //#region seam contract

  /** Every key CONTRACT.md §3.7 freezes on `hooks.uiAnnotation`, and nothing else. */
  const SEAM_EXPORTS = [
    'DEFAULT_SETTINGS', 'MODIFIER_CHOICES', 'SETTINGS_STORAGE_KEY',
    'normalizeSettings', 'resolveModifierChange', 'parseStoredSettings', 'serializeSettings',
    'modifierMatches',
    'textDigest',
    'sanitizeText', 'sanitizeAttributeName', 'sanitizeAttributeValue',
    'buildElementRef', 'selectorCandidates', 'identityKeyOf', 'describeLocator', 'elementLabel',
    'createAnnotationState', 'reduceAnnotationState',
    'serializeQuickReference', 'serializeBatchRequest', 'batchScopeSplit',
    'resolveRefStatus',
    'resolveNodeCandidate',
    'clampLauncherPosition', 'clampPopoverPosition', 'computeRailWidth', 'layoutModeFor',
    'collectionAdd', 'collectionRemove', 'collectionClear', 'collectionSetNote'
  ]
  /** Accepted `Function.length` ranges from the frozen signatures (defaults reduce length). */
  const SEAM_ARITIES = {
    normalizeSettings: [1, 1],
    resolveModifierChange: [3, 3],
    parseStoredSettings: [1, 1],
    serializeSettings: [1, 1],
    modifierMatches: [2, 2],
    textDigest: [1, 1],
    sanitizeText: [1, 2],
    sanitizeAttributeName: [1, 1],
    sanitizeAttributeValue: [2, 2],
    buildElementRef: [2, 2],
    selectorCandidates: [1, 1],
    identityKeyOf: [1, 1],
    describeLocator: [1, 1],
    elementLabel: [1, 1],
    createAnnotationState: [0, 0],
    reduceAnnotationState: [2, 2],
    serializeQuickReference: [3, 3],
    serializeBatchRequest: [2, 2],
    batchScopeSplit: [2, 2],
    resolveRefStatus: [1, 1],
    resolveNodeCandidate: [1, 1],
    clampLauncherPosition: [2, 4],
    clampPopoverPosition: [3, 5],
    computeRailWidth: [1, 2],
    layoutModeFor: [3, 3],
    collectionAdd: [2, 2],
    collectionRemove: [2, 2],
    collectionClear: [0, 0],
    collectionSetNote: [3, 3]
  }

  test('the seam publishes exactly the frozen §3.7 surface', () => {
    assert.deepEqual(Object.keys(ui).sort(), [...SEAM_EXPORTS].sort())
    assert.equal(typeof ui.DEFAULT_SETTINGS, 'object')
    assert.equal(Array.isArray(ui.MODIFIER_CHOICES), true)
    assert.equal(typeof ui.SETTINGS_STORAGE_KEY, 'string')
    for (const [name, [minimum, maximum]] of Object.entries(SEAM_ARITIES)) {
      assert.equal(typeof ui[name], 'function', `${name} is a function`)
      assert.ok(ui[name].length >= minimum && ui[name].length <= maximum, `${name} arity ${ui[name].length} within [${minimum}, ${maximum}]`)
    }
  })

  test('the seam stays inert without the test-hooks flag (production path)', () => {
    const withoutFlag = loadClientModule({ hooksFlag: false })
    assert.equal(withoutFlag.hooks, undefined, 'the seam never creates the global the browser does not define')
    assert.equal(withoutFlag.hooks?.uiAnnotation?.resolveNodeCandidate, undefined, 'the resolver is not leaked on the production path')
    assert.equal(withoutFlag.registration?.id, '@rexxin/dsh-power-suite')
    assert.equal(typeof withoutFlag.registration.factory, 'function')
    assert.equal(typeof withoutFlag.factory.apply, 'function')
    assert.equal(Array.isArray(withoutFlag.factory.inject), true)
  })

  //#endregion

  //#region fixtures

  const PASS_FIELD = 'passThroughModifier'
  const MULTI_FIELD = 'multiModifier'
  const MODIFIER_IDS = ['alt', 'ctrl', 'meta', 'shift']
  /** Event property each modifier id reads. */
  const MODIFIER_EVENT_KEYS = { alt: 'altKey', ctrl: 'ctrlKey', meta: 'metaKey', shift: 'shiftKey' }
  /** Every modifier event, with at most one flag held. */
  const modifierEvent = (held) => {
    const event = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
    if (held !== undefined) event[MODIFIER_EVENT_KEYS[held]] = true
    return event
  }
  /** Two settings modifiers must never be equal (product rule 1.5). */
  const assertModifiersDiffer = (settings, message) => {
    assert.notEqual(settings[PASS_FIELD], settings[MULTI_FIELD], message)
    assert.ok(MODIFIER_IDS.includes(settings[PASS_FIELD]) && MODIFIER_IDS.includes(settings[MULTI_FIELD]))
  }

  /**
   * One candidate descriptor, shaped as the controller hands it to
   * `buildElementRef` (CONTRACT.md §3.7).
   * @param {object} [overrides] - descriptor overrides.
   * @returns {object} descriptor.
   */
  function descriptorOf(overrides = {}) {
    return {
      tag: 'button',
      id: '',
      role: 'button',
      name: '',
      attrs: [],
      text: '',
      component: 'button',
      path: null,
      tagPath: [{ tag: 'button' }],
      isEditable: false,
      insideComposer: false,
      ...overrides
    }
  }

  /**
   * Build one ElementRef for a descriptor in the default test session.
   * @param {object} [descriptorOverrides] - candidate descriptor overrides.
   * @param {object} [contextOverrides] - `buildElementRef` context overrides.
   * @returns {object} ElementRef.
   */
  function refOf(descriptorOverrides = {}, contextOverrides = {}) {
    return ui.buildElementRef(descriptorOf(descriptorOverrides), {
      sessionId: SESSION_A,
      at: 1_700_000_000_000,
      order: 1,
      bounds: { x: 10, y: 20, width: 120, height: 32 },
      ...contextOverrides
    })
  }

  /**
   * A collection entry is an ElementRef whose `note` is the entry note.
   * @param {object} ref - ElementRef.
   * @param {string} [note] - entry note.
   * @returns {object} entry.
   */
  function entryOf(ref, note = '') {
    return { ...ref, note }
  }

  /** EN labels as the dictionaries provide them: columns carry their own colon. */
  const EN_LABELS = {
    title: 'UI annotation',
    reference: 'Reference:',
    session: 'Session:',
    noSession: 'No session',
    note: 'Note:',
    emptyNote: '—',
    status: 'Status: target no longer resolves (locator only)',
    statusAmbiguous: 'Status: multiple matches (locator only)',
    statusChanged: 'Status: target changed (locator only)',
    batchHeader: 'Please adjust the UI elements below. Each item lists its reference and the requested change.',
    skipped: '({count} annotation(s) from other sessions skipped)',
    time: '14:05'
  }

  /** A real DSH Session id: `session-<uuid>`, 44 chars (docs/verification.md). */
  const SESSION_A = 'session-8e460d06-507a-4c6d-95c6-63f20882c6e4'
  /** A second real-shaped Session id for cross-session tests. */
  const SESSION_B = 'session-5eec2763-0a91-460e-b559-08a8c3a98d13'
  /** Real Session-list row key: `session:<session-<uuid>>`. */
  const REAL_ROW_KEY = `session:${SESSION_A}`
  /** Real Workspace-list row key: `workspace:<uuid>`. */
  const REAL_WORKSPACE_KEY = `workspace:${SESSION_B.slice('session-'.length)}`

  //#endregion

  //#region settings

  test('settings defaults are the frozen Alt/Shift pair in a ui-annotation storage record', () => {
    assert.deepEqual(plain(ui.DEFAULT_SETTINGS), { passThroughModifier: 'alt', multiModifier: 'shift' })
    assert.deepEqual(plain(ui.MODIFIER_CHOICES), MODIFIER_IDS)
    assert.equal(ui.SETTINGS_STORAGE_KEY, 'power-suite.ui-annotation.settings')
  })

  test('normalizeSettings keeps valid values, falls back for invalid ones, and never returns equal modifiers', () => {
    const defaults = plain(ui.DEFAULT_SETTINGS)
    for (const raw of [undefined, null, 'nonsense', {}, [], 42]) {
      assert.deepEqual(plain(ui.normalizeSettings(raw)), defaults, `defaults for ${JSON.stringify(raw)}`)
    }

    const changed = ui.normalizeSettings({ [PASS_FIELD]: 'ctrl' })
    assert.deepEqual(plain(changed), { passThroughModifier: 'ctrl', multiModifier: 'shift' })
    assert.deepEqual(Object.keys(changed).sort(), Object.keys(defaults).sort(), 'only known fields survive')

    assert.deepEqual(plain(ui.normalizeSettings({ [PASS_FIELD]: 'hyper', [MULTI_FIELD]: 42 })), defaults)
    assertModifiersDiffer(ui.normalizeSettings({ [PASS_FIELD]: 'shift' }), 'stored conflict resolves to different modifiers')
    assertModifiersDiffer(ui.normalizeSettings({ [MULTI_FIELD]: 'alt' }), 'the other conflict direction resolves too')
  })

  test('resolveModifierChange applies a valid choice and resolves an equal-modifier conflict', () => {
    const defaults = ui.DEFAULT_SETTINGS
    const changed = ui.resolveModifierChange(defaults, PASS_FIELD, 'ctrl')
    assert.equal(changed.settings[PASS_FIELD], 'ctrl')
    assert.equal(changed.settings[MULTI_FIELD], 'shift')
    assertModifiersDiffer(changed.settings, 'valid change stays valid')
    assert.equal(changed.adjustedField, undefined)
    assert.equal(defaults[PASS_FIELD], 'alt', 'input settings are not mutated')

    // Choosing the sibling's current modifier must not save an equal pair.
    const conflict = ui.resolveModifierChange(defaults, PASS_FIELD, 'shift')
    assertModifiersDiffer(conflict.settings, 'a conflict keeps the pair distinct')
    if (conflict.settings[PASS_FIELD] === 'shift') {
      assert.equal(conflict.settings[MULTI_FIELD] !== 'shift', true)
      assert.equal(conflict.adjustedField, MULTI_FIELD, 'names the sibling that moved')
    } else {
      assert.equal(conflict.settings[PASS_FIELD], 'alt', 'or the change is rejected')
    }

    for (const id of ['ctrl', 'meta', 'shift']) {
      const result = ui.resolveModifierChange(defaults, MULTI_FIELD, id)
      assertModifiersDiffer(result.settings, `multi -> ${id} keeps the pair distinct`)
      assert.equal(result.settings[PASS_FIELD], 'alt')
      assert.equal(result.settings[MULTI_FIELD], id)
      assert.equal(result.adjustedField, undefined)
    }
    // 'alt' is the pass-through default, so that choice moves the sibling instead.
    const altChoice = ui.resolveModifierChange(defaults, MULTI_FIELD, 'alt')
    assertModifiersDiffer(altChoice.settings, 'multi -> alt keeps the pair distinct')
    assert.equal(altChoice.settings[MULTI_FIELD], 'alt')
    assert.equal(altChoice.settings[PASS_FIELD] !== 'alt', true)
    assert.equal(altChoice.adjustedField, PASS_FIELD)
  })

  test('parseStoredSettings reads defaults from absent/malformed text and round-trips serialized settings', () => {
    const defaults = plain(ui.DEFAULT_SETTINGS)
    for (const text of [null, undefined, '', 'not json', 'null', '[]', '{}', '{"version":999}']) {
      assert.deepEqual(plain(ui.parseStoredSettings(text)), defaults, `defaults for ${JSON.stringify(text)}`)
    }
    const stored = { ...ui.DEFAULT_SETTINGS, [PASS_FIELD]: 'ctrl', [MULTI_FIELD]: 'meta' }
    const text = ui.serializeSettings(stored)
    assert.equal(typeof text, 'string')
    assert.ok(text.length > 0)
    assert.deepEqual(plain(ui.parseStoredSettings(text)), plain(ui.normalizeSettings(stored)), 'round-trips')
    assert.equal(ui.serializeSettings(ui.normalizeSettings(stored)), text, 'serialization is deterministic')
    const corrupt = JSON.stringify({ settings: { [PASS_FIELD]: 'bogus', [MULTI_FIELD]: 'none' } })
    assertModifiersDiffer(ui.parseStoredSettings(corrupt), 'a corrupt record still yields a valid pair')
  })

  test('modifierMatches maps each configured modifier to its event flag', () => {
    for (const id of MODIFIER_IDS) {
      assert.equal(ui.modifierMatches(modifierEvent(id), id), true, `${id} matches its held flag`)
      assert.equal(ui.modifierMatches(modifierEvent(), id), false, `${id} does not match a bare event`)
      for (const other of MODIFIER_IDS) {
        if (other === id) continue
        assert.equal(ui.modifierMatches(modifierEvent(other), id), false, `${id} ignores ${other}`)
      }
    }
    assert.equal(ui.modifierMatches(modifierEvent('alt'), 'hyper'), false)
    assert.equal(ui.modifierMatches({}, 'alt'), false)
  })

  //#endregion

  //#region sanitization

  test('sanitizeText collapses whitespace, strips control characters, and truncates at 80 with an ellipsis', () => {
    assert.equal(ui.sanitizeText('  hello \n\t  world  '), 'hello world')
    assert.equal(ui.sanitizeText('\u200Bzero\u200Dwidth\uFEFF'), 'zero width')
    assert.equal(ui.sanitizeText('line\u0000one\u0007two'), 'line one two')
    assert.equal(ui.sanitizeText(''), '')
    assert.equal(ui.sanitizeText(null), '')
    assert.equal(ui.sanitizeText(undefined), '')
    assert.equal(ui.sanitizeText(42), '')

    const long = 'word '.repeat(40).trim()
    const truncated = ui.sanitizeText(long)
    assert.ok(truncated.length <= 81, `truncated length ${truncated.length}`)
    assert.ok(truncated.length >= 79, 'keeps most of the 80-character budget')
    assert.ok(truncated.endsWith('…'), 'marks the truncation with an ellipsis')
    const shortLimit = ui.sanitizeText(long, 10)
    assert.ok(shortLimit.endsWith('…'))
    assert.ok(shortLimit.length <= 11)
    assert.equal(ui.sanitizeText('short', 80), 'short')
  })

  test('sanitizeText redacts secret-shaped values and emails', () => {
    const email = ui.sanitizeText('mail alice@example.com now')
    assert.ok(!email.includes('alice@example.com'))
    assert.ok(email.includes('mail') && email.includes('now'))

    const bearer = ui.sanitizeText('Authorization: Bearer abcdef1234567890')
    assert.ok(!bearer.includes('abcdef1234567890'))

    const apiKey = ui.sanitizeText('key sk-ABCDEF0123456789ghij')
    assert.ok(!apiKey.includes('ABCDEF0123456789ghij'))

    const hex = ui.sanitizeText('token deadbeefdeadbeefdeadbeefdeadbeef')
    assert.ok(!hex.includes('deadbeefdeadbeefdeadbeefdeadbeef'))

    const base64 = ui.sanitizeText('c2VjcmV0c2VjcmV0c2VjcmV0c2VjcmV0c2VjcmV0')
    assert.ok(!base64.includes('c2VjcmV0c2VjcmV0c2VjcmV0c2VjcmV0c2VjcmV0'))

    assert.equal(ui.sanitizeText('New session'), 'New session')
  })

  test('sanitizeAttributeName drops credential-shaped names and keeps DOM identity attributes', () => {
    for (const denied of ['token', 'data-token', 'Secret', 'user-password', 'passwd', 'authorization', 'Cookie', 'X-Auth-Token']) {
      assert.equal(ui.sanitizeAttributeName(denied), null, `${denied} is denied`)
    }
    for (const kept of ['data-row-key', 'data-conversation-region', 'aria-label', 'role', 'id', 'name']) {
      assert.equal(ui.sanitizeAttributeName(kept), kept, `${kept} is kept`)
    }
    // Classes are never captured: hashed class names must not become locators.
    for (const deniedClassy of ['class', 'style', 'onclick', 'sessionKey']) {
      assert.equal(ui.sanitizeAttributeName(deniedClassy), null, `${deniedClassy} is denied`)
    }
  })

  test('sanitizeAttributeValue drops Bearer/sk-/long base64-hex values and keeps ordinary values', () => {
    assert.equal(ui.sanitizeAttributeValue('aria-label', 'New session'), 'New session')
    assert.equal(ui.sanitizeAttributeValue('data-row-key', REAL_ROW_KEY), REAL_ROW_KEY)
    assert.equal(ui.sanitizeAttributeValue('role', 'button'), 'button')
    assert.equal(ui.sanitizeAttributeValue('aria-label', 'Bearer abcdef1234567890'), null)
    assert.equal(ui.sanitizeAttributeValue('data-key', 'sk-ABCDEF0123456789'), null)
    assert.equal(ui.sanitizeAttributeValue('value', 'deadbeefdeadbeefdeadbeefdeadbeef'), null)
    assert.equal(ui.sanitizeAttributeValue('value', 'c2VjcmV0c2VjcmV0c2VjcmV0c2VjcmV0'), null)
    assert.equal(ui.sanitizeAttributeValue('token', 'anything'), null)
  })

  test('F1: sensitive or generated ids never become id candidates or identity keys', () => {
    const sensitiveIds = ['alice@example.com', 'sk-live-ZYXWVUTS9876543210', 'deadbeefdeadbeefdeadbeefdeadbeef']
    for (const id of sensitiveIds) {
      assert.equal(ui.sanitizeAttributeValue('id', id), null, `the authoritative sanitizer rejects ${id}`)
    }
    for (const id of [...sensitiveIds, ':r1:', '_Row_1a2b3c']) {
      const candidates = ui.selectorCandidates(descriptorOf({ tag: 'button', id, name: 'Secret target' }))
      assert.equal(candidates.some((candidate) => candidate.kind === 'id'), false, `no id candidate for ${id}`)
      const ref = refOf({ tag: 'button', id, name: 'Secret target', text: 'Secret target' })
      assert.equal(ui.identityKeyOf(ref).startsWith('id:'), false, `no id-based identity for ${id}`)
      for (const candidate of ref.locator.candidates) {
        assert.ok(!candidate.value.includes('alice@example.com'), `email id leaked into ${candidate.value}`)
        assert.ok(!candidate.value.includes('sk-live'), `secret id leaked into ${candidate.value}`)
        assert.ok(!candidate.value.includes('deadbeef'), `token-shaped id leaked into ${candidate.value}`)
      }
    }
    // An ordinary authored id is still a stable locator (F1 must not over-filter).
    assert.equal(ui.sanitizeAttributeValue('id', 'composer-send'), 'composer-send')
    const ordinary = refOf({ tag: 'button', id: 'composer-send', name: 'Send', text: 'Send' })
    assert.equal(ordinary.locator.candidates.find((candidate) => candidate.kind === 'id')?.value, '#composer-send')
    assert.equal(ui.identityKeyOf(ordinary), 'id:#composer-send')
  })

  test('F2: known stable data attributes keep real row-key values while other secrets stay filtered', () => {
    const allowListed = [
      ['data-row-key', REAL_ROW_KEY],
      ['data-conversation-region', 'composer'],
      ['data-conversation-session', SESSION_A],
      ['data-lexical-editor', 'true'],
      ['data-testid', 'composer-send'],
      ['data-slot', 'conversation.input.dock'],
      ['data-sidebar-toggle', 'sidebar']
    ]
    for (const [name, value] of allowListed) {
      assert.equal(ui.sanitizeAttributeValue(name, value), value, `${name} keeps its stable value`)
    }
    const bareUuid = '123e4567-e89b-12d3-a456-426614174000'
    assert.equal(ui.sanitizeAttributeValue('data-row-key', bareUuid), bareUuid, 'a bare UUID is a stable key shape')
    // The allow-list is not a secret-laundering channel.
    for (const value of ['Bearer abcdef1234567890', 'sk-live-ZYXWVUTS9876543210', 'deadbeefdeadbeefdeadbeefdeadbeef']) {
      assert.equal(ui.sanitizeAttributeValue('data-row-key', value), null, 'an allow-listed name still rejects secret shapes')
      assert.equal(ui.sanitizeAttributeValue('data-unknown', value), null, 'unknown attributes still reject secret shapes')
    }
    const rowCandidates = ui.selectorCandidates(descriptorOf({
      tag: 'div',
      component: 'row',
      attrs: [{ name: 'data-row-key', value: REAL_ROW_KEY }]
    }))
    const dataCandidate = rowCandidates.find((candidate) => candidate.kind === 'data')
    assert.ok(dataCandidate !== undefined, 'the real row key yields a data candidate')
    assert.equal(dataCandidate.value, `[data-row-key="${REAL_ROW_KEY}"]`)
    assert.equal(
      ui.identityKeyOf(refOf({ tag: 'div', component: 'row', attrs: [{ name: 'data-row-key', value: REAL_ROW_KEY }] })),
      `data:[data-row-key="${REAL_ROW_KEY}"]`,
      'the identity key is built from the surviving row key'
    )
  })

  test('R2: the real data-conversation-session shape and row keys survive; secret vectors still denied', () => {
    assert.equal(ui.sanitizeAttributeValue('data-conversation-session', SESSION_A), SESSION_A, 'real session-<uuid> attribute value')
    assert.equal(ui.sanitizeAttributeValue('data-row-key', REAL_ROW_KEY), REAL_ROW_KEY)
    assert.equal(ui.sanitizeAttributeValue('data-row-key', REAL_WORKSPACE_KEY), REAL_WORKSPACE_KEY)
    assert.equal(ui.sanitizeAttributeValue('data-row-key', `session:${SESSION_B}`), `session:${SESSION_B}`)
    // The narrow namespace allowance is only for known stable attributes.
    assert.equal(ui.sanitizeAttributeValue('data-unknown', SESSION_A), null, 'unknown attributes do not get the session namespace allowance')
    // Old denials keep working on both known and unknown attributes.
    const secrets = ['Bearer abcdef1234567890', 'sk-ABCDEF0123456789', 'deadbeefdeadbeefdeadbeefdeadbeef', 'c2VjcmV0c2VjcmV0c2VjcmV0c2VjcmV0', 'alice@example.com']
    for (const value of secrets) {
      assert.equal(ui.sanitizeAttributeValue('data-conversation-session', value), null, `the known session attribute still rejects ${value.slice(0, 12)}…`)
      assert.equal(ui.sanitizeAttributeValue('data-unknown', value), null, `unknown attributes still reject ${value.slice(0, 12)}…`)
    }
  })

  test('R3: credential shapes beyond lowercase sk-/Bearer are denied', () => {
    const denied = [
      'SK-LIVE-abcd',
      'bearer abc',
      'AKIAIOSFODNN7EXAMPLE',
      'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyIn0.abc'
    ]
    for (const value of denied) {
      assert.equal(ui.sanitizeAttributeValue('aria-label', value), null, `${value.slice(0, 12)}… denied on aria-label`)
      assert.equal(ui.sanitizeAttributeValue('data-testid', value), null, `${value.slice(0, 12)}… denied on data-testid`)
    }
    // The lowercase vectors from round 1 stay denied.
    for (const value of ['sk-ABCDEF0123456789', 'Bearer abcdef1234567890', 'alice@example.com']) {
      assert.equal(ui.sanitizeAttributeValue('aria-label', value), null)
    }
    // Benign values are not over-filtered by the broader credential shapes.
    for (const value of ['SKU list', 'Task list', 'New session', 'composer-send']) {
      assert.equal(ui.sanitizeAttributeValue('aria-label', value), value)
    }
  })

  //#endregion

  //#region digests (F11)

  test('F11: textDigest is deterministic FNV-1a 32-bit hex over sanitized text', () => {
    // The standard FNV-1a 32-bit test vectors pin the algorithm, not just determinism.
    assert.equal(ui.textDigest(''), '811c9dc5', 'empty input is the FNV offset basis')
    assert.equal(ui.textDigest('a'), 'e40c292c')
    assert.equal(ui.textDigest('foobar'), 'bf9cf968')
    assert.equal(ui.textDigest('  Ship   it  now  '), ui.textDigest('Ship it now'), 'whitespace-collapsed')
    assert.match(ui.textDigest('anything'), /^[0-9a-f]{8}$/, 'lowercase zero-padded 8-hex')
    assert.notEqual(ui.textDigest('first'), ui.textDigest('second'))
    assert.equal(ui.textDigest(null), '', 'non-strings digest to empty')
    assert.equal(ui.textDigest(42), '')
    assert.equal(ui.textDigest('\u200B\uFEFF'), '811c9dc5', 'zero-width-only input sanitizes to empty')
    assert.match(ui.textDigest('word '.repeat(1000).trim()), /^[0-9a-f]{8}$/, 'long input stays bounded and deterministic')
  })

  //#endregion

  //#region selectors, refs, labels

  test('selectorCandidates are ordered by reliability and avoid hashed classes and raw HTML', () => {
    const rowDescriptor = descriptorOf({
      tag: 'div',
      role: 'listitem',
      name: 'Session row',
      attrs: [
        { name: 'data-row-key', value: REAL_ROW_KEY },
        { name: 'class', value: '_row_1a2b3c ps-list-row' },
        { name: 'aria-label', value: 'Session: Hello' }
      ],
      component: 'row'
    })
    const candidates = ui.selectorCandidates(rowDescriptor)
    assert.ok(Array.isArray(candidates) && candidates.length > 0)
    let previousReliability = Number.POSITIVE_INFINITY
    for (const candidate of candidates) {
      assert.ok(['data', 'id', 'label', 'role', 'tag', 'path'].includes(candidate.kind), `known kind ${candidate.kind}`)
      assert.equal(typeof candidate.value, 'string')
      assert.ok(candidate.value.length > 0)
      assert.equal(typeof candidate.reliability, 'number')
      assert.ok(candidate.reliability <= previousReliability, 'candidates are ordered by descending reliability')
      previousReliability = candidate.reliability
    }
    assert.equal(candidates[0].kind, 'data')
    assert.ok(candidates[0].value.includes('data-row-key') && candidates[0].value.includes(REAL_ROW_KEY))
    for (const candidate of candidates) {
      assert.ok(!/_[A-Za-z0-9]{4,}/.test(candidate.value), `no hashed class token in ${candidate.value}`)
      assert.ok(!candidate.value.includes('<'), 'never serializes node HTML')
    }
    assert.deepEqual(plain(ui.selectorCandidates(rowDescriptor)), plain(candidates), 'candidate list is deterministic')
  })

  test('selectorCandidates fall back to id/tag for a plain control and never use nth-child alone', () => {
    const candidates = ui.selectorCandidates(descriptorOf({
      tag: 'button',
      id: 'composer-send',
      name: 'Send',
      attrs: [{ name: 'id', value: 'composer-send' }]
    }))
    const kinds = candidates.map((candidate) => candidate.kind)
    assert.ok(kinds.includes('id'))
    assert.ok(kinds.includes('tag') || kinds.includes('role'))
    assert.ok(candidates.find((candidate) => candidate.kind === 'id').value.includes('composer-send'))
    const tagCandidate = candidates.find((candidate) => candidate.kind === 'tag')
    assert.equal(tagCandidate?.value, 'button')
    for (const candidate of candidates) {
      assert.ok(!/:nth-child\(/.test(candidate.value), `no nth-child-only selector: ${candidate.value}`)
    }
  })

  test('buildElementRef produces a serializable ElementRef and the identity key survives re-selection', () => {
    const ref = refOf({ tag: 'button', role: 'button', name: 'New session', text: 'New session' })
    assert.equal(ref.version, 1)
    assert.match(ref.id, /^psa-\d+-[a-z0-9]+$/i)
    assert.equal(ref.at, 1_700_000_000_000)
    assert.equal(ref.order, 1)
    assert.equal(ref.session.sessionId, SESSION_A)
    assert.equal(ref.component, 'button')
    assert.equal(ref.locator.tag, 'button')
    assert.equal(ref.locator.name, 'New session')
    assert.equal(typeof ref.locator.key, 'string')
    assert.ok(ref.locator.key.length > 0)
    assert.equal(typeof ref.locator.path, 'string')
    assert.ok(Array.isArray(ref.locator.candidates) && ref.locator.candidates.length > 0)
    assert.equal(ref.text, 'New session')
    assert.equal(ref.note, '')
    assert.deepEqual(plain(ref.bounds), { x: 10, y: 20, width: 120, height: 32 })

    const serialized = JSON.stringify(ref)
    assert.ok(!serialized.includes('querySelector'))
    assert.ok(!serialized.includes('<button'))
    assert.deepEqual(plain(JSON.parse(serialized)), plain(ref), 'plain JSON, no DOM nodes')

    const again = refOf({ tag: 'button', role: 'button', name: 'New session', text: 'New session' }, { at: 1_800_000_000_000, order: 7 })
    assert.notEqual(ref.id, again.id, 'ids are per capture')
    assert.equal(ui.identityKeyOf(ref), ui.identityKeyOf(again), 'identity survives time and order')
    assert.equal(ui.identityKeyOf(ref), ref.locator.key)
  })

  test('buildElementRef keeps row/region/input identity while never carrying input values', () => {
    const rowDescriptor = descriptorOf({
      tag: 'div',
      component: 'row',
      name: 'Session row',
      attrs: [{ name: 'data-row-key', value: REAL_ROW_KEY }],
      text: 'Session row title'
    })
    const row = refOf(rowDescriptor, { order: 2 })
    assert.equal(row.component, 'row')
    assert.ok(row.locator.candidates.some((candidate) => candidate.value.includes(REAL_ROW_KEY)))
    const sameRow = refOf(rowDescriptor, { order: 9, at: 1_900_000_000_000 })
    assert.equal(ui.identityKeyOf(row), ui.identityKeyOf(sameRow), 'the row key does not depend on capture order')

    const composer = refOf({
      tag: 'div',
      component: 'region',
      name: 'Composer',
      attrs: [{ name: 'data-conversation-region', value: 'composer' }],
      text: 'Ask anything'
    }, { order: 3 })
    assert.equal(composer.component, 'region')
    assert.equal(composer.locator.tag, 'div')

    const input = refOf({
      tag: 'input',
      role: 'textbox',
      component: 'input',
      name: 'Search sessions',
      isEditable: true,
      text: '',
      attrs: [{ name: 'type', value: 'search' }]
    }, { order: 4 })
    assert.equal(input.component, 'input')
    assert.equal(input.locator.tag, 'input')
    assert.deepEqual(Object.keys(input).sort(), ['at', 'bounds', 'component', 'context', 'id', 'locator', 'note', 'order', 'session', 'text', 'textDigest', 'version'])
    assert.deepEqual(Object.keys(input.locator).sort(), ['candidates', 'key', 'name', 'path', 'role', 'tag'])
    assert.equal(input.locator.name, 'Search sessions', 'the accessible name survives')
    assert.equal(input.text, '', 'an input contributes no value text')

    const editableDescriptor = {
      tag: 'div', role: 'textbox', component: 'editable', name: 'Composer', isEditable: true, insideComposer: true
    }
    const editable = refOf(editableDescriptor)
    assert.equal(editable.component, 'editable')
    assert.equal(editable.text, '', 'contenteditable contents are never read')
    assert.equal(ui.identityKeyOf(editable), ui.identityKeyOf(refOf(editableDescriptor, { at: 1_900_000_000_000, order: 12 })))
  })

  test('F3: aria-label-only identity keys include structural context and survive re-selection', () => {
    const pathA = 'body > div:nth-of-type(1) > button:nth-of-type(1)'
    const pathB = 'body > div:nth-of-type(2) > button:nth-of-type(1)'
    const makeClose = (path, context = {}) => refOf({
      tag: 'button',
      name: 'Close',
      attrs: [{ name: 'aria-label', value: 'Close' }],
      path
    }, context)
    const closeA = makeClose(pathA)
    const closeB = makeClose(pathB)
    assert.equal(ui.identityKeyOf(closeA), `label:[aria-label="Close"]|button|${pathA}`, 'label keys carry tag and path')
    assert.equal(ui.identityKeyOf(closeB), `label:[aria-label="Close"]|button|${pathB}`)
    assert.notEqual(ui.identityKeyOf(closeA), ui.identityKeyOf(closeB), 'two Close buttons are not the same identity')
    assert.equal(ui.identityKeyOf(closeA), ui.identityKeyOf(makeClose(pathA, { at: 1_800_000_000_000, order: 7 })), 're-selection keeps the identity')
  })

  test('F11: ElementRef carries a top-level textDigest for the full sanitized text', () => {
    const fullText = 'word '.repeat(40).trim() // 199 chars, longer than the 80-char display summary
    const descriptorDigest = ui.textDigest(fullText)
    const ref = refOf({ name: 'Long target', text: fullText, textDigest: descriptorDigest })
    assert.equal(ref.textDigest, descriptorDigest, 'buildElementRef copies the descriptor digest through')
    assert.ok(ref.text.length <= 81, 'the display summary stays bounded')
    assert.notEqual(ref.textDigest, ui.textDigest(ref.text), 'the digest covers the full text, not the truncated summary')
    const plain = refOf({ name: 'Plain target', text: 'plain' })
    assert.equal(plain.textDigest, '', 'the descriptor owns digest computation; an absent digest stays empty')
    assert.deepEqual(Object.keys(plain).sort(), ['at', 'bounds', 'component', 'context', 'id', 'locator', 'note', 'order', 'session', 'text', 'textDigest', 'version'])
  })

  test('sanitized text is applied when building a ref, even for hostile descriptor text', () => {
    const ref = refOf({
      tag: 'button',
      name: '  New\n\nsession  ',
      text: 'Click  to\topen alice@example.com sk-ABCDEF0123456789'
    })
    assert.equal(ref.locator.name, 'New session')
    assert.ok(!ref.text.includes('alice@example.com'))
    assert.ok(!ref.text.includes('ABCDEF0123456789'))
    assert.ok(ref.text.length <= 80)
  })

  test('describeLocator and elementLabel summarize a ref for the popover and serializer', () => {
    const button = refOf({ tag: 'button', role: 'button', name: 'New session', text: 'New session' })
    const locator = ui.describeLocator(button)
    assert.equal(typeof locator, 'string')
    assert.ok(locator.length > 0)
    assert.ok(locator.includes('button'))
    const label = ui.elementLabel(button)
    assert.equal(typeof label, 'string')
    assert.ok(label.includes('New session'))

    const unnamed = refOf({ tag: 'div', role: '', name: '', text: '', component: 'container' })
    assert.ok(ui.elementLabel(unnamed).length > 0, 'falls back to a structural label')
    assert.ok(ui.describeLocator(unnamed).length > 0)
  })

  //#endregion

  //#region state machine

  /** Sorted keys of the frozen reducer state. */
  const STATE_KEYS = ['box', 'collection', 'editing', 'feedback', 'hoverId', 'note', 'passThrough', 'phase', 'selection', 'sessionId', 'view']

  test('reducer starts from the frozen off state and activates to idle', () => {
    const initial = ui.createAnnotationState()
    assert.deepEqual(Object.keys(initial).sort(), STATE_KEYS)
    assert.equal(initial.phase, 'off')
    assert.equal(initial.view, 'status')
    assert.equal(initial.hoverId, null)
    assert.deepEqual(plain(initial.selection), [])
    assert.equal(initial.note, '')
    assert.equal(initial.editing, false)
    assert.deepEqual(plain(initial.collection), [])
    assert.equal(initial.passThrough, false)
    assert.equal(initial.box, null)
    assert.equal(initial.feedback, null)
    assert.equal(initial.sessionId, null)

    const active = ui.reduceAnnotationState(initial, { type: 'activate' })
    assert.equal(active.phase, 'idle')
    assert.equal(active.view, 'status')
    assert.equal(initial.phase, 'off', 'reducer is pure')
  })

  test('reducer tracks hover, selects one element, edits the note, and deactivates', () => {
    let state = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'activate' })
    state = ui.reduceAnnotationState(state, { type: 'hover', targetId: 'el-1' })
    assert.equal(state.hoverId, 'el-1')

    const ref = refOf({ name: 'New session' })
    state = ui.reduceAnnotationState(state, { type: 'selectSingle', ref })
    assert.equal(state.phase, 'selected')
    assert.equal(plain(state.selection).length, 1)
    assert.equal(state.selection[0].id, ref.id)
    assert.equal(state.note, '')

    state = ui.reduceAnnotationState(state, { type: 'setNote', text: 'Align the icon' })
    assert.equal(state.note, 'Align the icon')
    state = ui.reduceAnnotationState(state, { type: 'beginEdit' })
    assert.equal(state.editing, true)
    state = ui.reduceAnnotationState(state, { type: 'endEdit' })
    assert.equal(state.editing, false)

    state = ui.reduceAnnotationState(state, { type: 'deactivate' })
    assert.equal(state.phase, 'off')
    assert.deepEqual(plain(state.selection), [])
    assert.equal(state.note, '')
  })

  test('reducer multi-select toggles by identity without duplicates and derives the phase from the count', () => {
    let state = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'activate' })
    const first = refOf({ name: 'First', text: 'First' }, { order: 1 })
    const second = refOf({ name: 'Second', text: 'Second' }, { order: 2 })

    state = ui.reduceAnnotationState(state, { type: 'toggleMulti', ref: first })
    assert.equal(state.phase, 'selected')
    assert.equal(plain(state.selection).length, 1)

    state = ui.reduceAnnotationState(state, { type: 'toggleMulti', ref: second })
    assert.equal(state.phase, 'multi')
    assert.equal(plain(state.selection).length, 2)

    state = ui.reduceAnnotationState(state, { type: 'toggleMulti', ref: second })
    assert.equal(state.phase, 'selected')
    assert.deepEqual(plain(state.selection).map((entry) => entry.id), [first.id], 'toggling removes, never duplicates')

    // The same element captured again has a different id but the same identity.
    const firstAgain = refOf({ name: 'First', text: 'First' }, { order: 8, at: 1_800_000_000_000 })
    state = ui.reduceAnnotationState(state, { type: 'toggleMulti', ref: firstAgain })
    assert.deepEqual(plain(state.selection), [], 'identity-based toggle, not id-based')

    state = ui.reduceAnnotationState(state, { type: 'setMulti', refs: [first, second, firstAgain, first] })
    const setIds = plain(state.selection).map((entry) => entry.id)
    assert.equal(new Set(setIds).size, setIds.length, 'setMulti never duplicates')
    assert.ok(setIds.includes(first.id) && setIds.includes(second.id))
  })

  test('reducer keeps the collection through deactivation and session switches', () => {
    let state = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'activate' })
    const ref = refOf({ name: 'Target' })
    const entry = entryOf(ref, 'Fix spacing')
    state = ui.reduceAnnotationState(state, { type: 'collectionAdd', entry })
    assert.equal(plain(state.collection).length, 1)
    assert.equal(state.collection[0].note, 'Fix spacing')

    const selected = ui.reduceAnnotationState(state, { type: 'selectSingle', ref: state.collection[0] })
    const deactivated = ui.reduceAnnotationState(selected, { type: 'deactivate' })
    assert.equal(deactivated.phase, 'off')
    assert.deepEqual(plain(deactivated.collection), plain(state.collection), 'collection survives deactivation')
    assert.deepEqual(plain(deactivated.selection), [])
    assert.equal(deactivated.view, 'status')

    const switched = ui.reduceAnnotationState(deactivated, { type: 'activate' })
    const withSelection = ui.reduceAnnotationState(switched, { type: 'selectSingle', ref })
    const switchedSession = ui.reduceAnnotationState(withSelection, { type: 'session', sessionId: SESSION_B })
    assert.equal(switchedSession.sessionId, SESSION_B)
    assert.deepEqual(plain(switchedSession.selection), [], 'session switch clears the selection')
    assert.equal(switchedSession.hoverId, null)
    assert.equal(switchedSession.note, '')
    assert.equal(switchedSession.view, 'status')
    assert.deepEqual(plain(switchedSession.collection), plain(state.collection), 'collection survives the switch')

    const off = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'session', sessionId: SESSION_B })
    assert.equal(off.phase, 'off', 'a switch while inactive stays off')
  })

  test('reducer Esc ladder steps note -> selection -> view -> off', () => {
    const ref = refOf({ name: 'Target' })
    let state = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'activate' })
    state = ui.reduceAnnotationState(state, { type: 'selectSingle', ref })
    state = ui.reduceAnnotationState(state, { type: 'beginEdit' })

    state = ui.reduceAnnotationState(state, { type: 'exitOne' })
    assert.equal(state.editing, false, 'leaves the note editor first')
    assert.equal(state.phase, 'selected', 'the selection survives the first Esc')

    state = ui.reduceAnnotationState(state, { type: 'exitOne' })
    assert.deepEqual(plain(state.selection), [], 'clears the selection next')
    assert.equal(state.phase, 'idle')

    state = ui.reduceAnnotationState(state, { type: 'openView', view: 'collection' })
    assert.equal(state.view, 'collection')
    assert.equal(state.phase, 'collection')
    state = ui.reduceAnnotationState(state, { type: 'exitOne' })
    assert.equal(state.view, 'status', 'a rail view closes before the mode')
    assert.equal(state.phase, 'idle')

    state = ui.reduceAnnotationState(state, { type: 'exitOne' })
    assert.equal(state.phase, 'off', 'idle Esc turns the mode off')
  })

  test('reducer collection actions dedupe by identity and keep entries in order', () => {
    let state = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'activate' })
    const first = entryOf(refOf({ name: 'First', text: 'First' }, { order: 1 }), 'one')
    const second = entryOf(refOf({ name: 'Second', text: 'Second' }, { order: 2 }), 'two')
    state = ui.reduceAnnotationState(state, { type: 'collectionAdd', entry: first })
    state = ui.reduceAnnotationState(state, { type: 'collectionAdd', entry: second })
    assert.deepEqual(plain(state.collection).map((entry) => entry.note), ['one', 'two'])

    // Re-adding the same element updates its note in place (no duplicate row).
    const updated = entryOf(refOf({ name: 'First', text: 'First' }, { order: 1, at: 1_800_000_000_000 }), 'one updated')
    state = ui.reduceAnnotationState(state, { type: 'collectionAdd', entry: updated })
    assert.equal(plain(state.collection).length, 2)
    assert.deepEqual(plain(state.collection).map((entry) => entry.note), ['one updated', 'two'])
    assert.equal(state.collection[0].id, first.id, 'update keeps the original element identity')

    state = ui.reduceAnnotationState(state, { type: 'collectionUpdateNote', refId: second.id, note: 'two updated' })
    assert.equal(state.collection[1].note, 'two updated')

    state = ui.reduceAnnotationState(state, { type: 'collectionRemove', refId: first.id })
    assert.deepEqual(plain(state.collection).map((entry) => entry.note), ['two updated'])

    state = ui.reduceAnnotationState(state, { type: 'collectionClear' })
    assert.deepEqual(plain(state.collection), [])
  })

  test('reducer pass-through, box, and feedback are transient and never survive deactivation', () => {
    let state = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'activate' })
    state = ui.reduceAnnotationState(state, { type: 'passThrough', on: true })
    assert.equal(state.passThrough, true)
    state = ui.reduceAnnotationState(state, { type: 'box', box: { x: 1, y: 2, width: 3, height: 4 } })
    assert.deepEqual(plain(state.box), { x: 1, y: 2, width: 3, height: 4 })
    state = ui.reduceAnnotationState(state, { type: 'feedback', feedback: { kind: 'info', text: 'hello', at: 1 } })
    assert.equal(state.feedback.text, 'hello')
    state = ui.reduceAnnotationState(state, { type: 'deactivate' })
    assert.equal(state.passThrough, false)
    assert.equal(state.box, null)
    assert.equal(state.feedback, null)
  })

  //#endregion

  //#region collection pure functions

  test('collectionAdd dedupes by session+identity, updates notes, and never mutates inputs', () => {
    const ref = refOf({ name: 'Target' }, { sessionId: SESSION_A })
    const otherSessionRef = refOf({ name: 'Target' }, { sessionId: SESSION_B })
    const empty = []
    const first = ui.collectionAdd(empty, entryOf(ref, 'first'))
    assert.equal(first.added, true)
    assert.equal(first.updated, false)
    assert.equal(first.list.length, 1)
    assert.notEqual(first.list, empty, 'returns a new array')
    assert.equal(empty.length, 0, 'input array is not mutated')
    assert.equal(first.list[0].note, 'first')

    const input = first.list
    const duplicateRef = refOf({ name: 'Target' }, { at: 1_800_000_000_000, order: 9, sessionId: SESSION_A })
    const duplicate = ui.collectionAdd(input, entryOf(duplicateRef, 'changed'))
    assert.equal(duplicate.added, false)
    assert.equal(duplicate.updated, true)
    assert.equal(duplicate.list.length, 1)
    assert.equal(duplicate.list[0].note, 'changed')
    assert.equal(duplicate.list[0].id, ref.id, 'update keeps the original id/at/order')
    assert.equal(duplicate.list[0].order, ref.order)
    assert.equal(duplicate.list[0].at, ref.at)
    assert.notEqual(duplicate.list, input, 'returns a new array')
    assert.equal(input[0].note, 'first', 'input array is not mutated')

    const scoped = ui.collectionAdd(duplicate.list, entryOf(otherSessionRef, 'other session'))
    assert.equal(scoped.added, true)
    assert.equal(scoped.list.length, 2, 'the same element in another session is a separate entry')
  })

  test('collectionRemove, collectionClear, and collectionSetNote are immutable', () => {
    const one = refOf({ name: 'One', text: 'One' }, { order: 1 })
    const two = refOf({ name: 'Two', text: 'Two' }, { order: 2 })
    const built = ui.collectionAdd(ui.collectionAdd([], entryOf(one, 'one')).list, entryOf(two, 'two')).list
    const frozen = plain(built)

    const removed = ui.collectionRemove(built, one.id)
    assert.equal(removed.length, 1)
    assert.equal(removed[0].id, two.id)
    assert.deepEqual(plain(built), frozen, 'remove does not mutate the input')
    assert.equal(ui.collectionRemove(built, 'no-such-ref').length, 2)

    const noted = ui.collectionSetNote(built, two.id, 'two updated')
    assert.equal(noted[1].note, 'two updated')
    assert.notEqual(noted, built)
    assert.deepEqual(plain(built), frozen, 'setNote does not mutate the input')

    assert.deepEqual(plain(ui.collectionClear()), [])
  })

  test('F4: an empty re-add preserves an existing note and only an explicit setNote clears it', () => {
    const ref = refOf({ name: 'Target', text: 'Target' })
    const sameElement = refOf({ name: 'Target', text: 'Target' }, { order: 4, at: 1_800_000_000_000 })
    const seeded = ui.collectionAdd([], entryOf(ref, 'keep me'))

    const emptyReadd = ui.collectionAdd(seeded.list, entryOf(sameElement, ''))
    assert.equal(emptyReadd.updated, true)
    assert.equal(emptyReadd.list[0].note, 'keep me', 'an empty note must not overwrite the saved note')

    const whitespaceReadd = ui.collectionAdd(seeded.list, entryOf(sameElement, '   '))
    assert.equal(whitespaceReadd.list[0].note, 'keep me', 'a whitespace-only note is empty')

    const noted = ui.collectionAdd(seeded.list, entryOf(sameElement, 'new note'))
    assert.equal(noted.list[0].note, 'new note', 'a non-empty note still updates the entry')

    const cleared = ui.collectionSetNote(seeded.list, ref.id, '')
    assert.equal(cleared[0].note, '', 'the explicit editor path clears the note')
    assert.equal(seeded.list[0].note, 'keep me', 'setNote stays immutable')

    // The reducer collectionAdd action shares that boundary; the re-add path passes an empty note.
    let state = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'activate' })
    state = ui.reduceAnnotationState(state, { type: 'collectionAdd', entry: entryOf(ref, 'reducer note') })
    state = ui.reduceAnnotationState(state, { type: 'collectionAdd', entry: entryOf(sameElement, '') })
    assert.equal(state.collection[0].note, 'reducer note', 'reducer re-add preserves the note too')
  })

  //#endregion

  //#region serialization

  test('serializeQuickReference emits the four documented EN lines and the empty-note placeholder', () => {
    const ref = refOf({ tag: 'button', name: 'New session', text: 'New session' })
    const text = ui.serializeQuickReference(ref, 'Align it with the row', EN_LABELS)
    const lines = text.replace(/\n+$/, '').split('\n')
    assert.equal(lines.length, 4)
    assert.equal(lines[0], `${EN_LABELS.title} · ${ui.elementLabel(ref)}`)
    assert.equal(lines[1], `${EN_LABELS.reference} ${ui.describeLocator(ref)}`)
    assert.match(lines[2], new RegExp(`^${EN_LABELS.session} \\S+ · ${EN_LABELS.time}$`))
    assert.equal(lines[3], `${EN_LABELS.note} Align it with the row`)

    const empty = ui.serializeQuickReference(ref, '', EN_LABELS)
    assert.ok(empty.replace(/\n+$/, '').endsWith(`${EN_LABELS.note} ${EN_LABELS.emptyNote}`))
  })

  test('serializeQuickReference marks a stale single reference and follows the ZH labels', () => {
    const stale = refOf({ tag: 'button', name: 'Gone', text: 'Gone' })
    stale.status = 'missing'
    const staleText = ui.serializeQuickReference(stale, 'note', EN_LABELS)
    assert.ok(staleText.includes(EN_LABELS.status), 'a stale single reference carries its status line')

    const ZH_LABELS = {
      ...EN_LABELS,
      title: 'UI 标注',
      reference: '定位：',
      session: '会话：',
      note: '备注：',
      noSession: '无会话',
      status: '状态：目标已无法定位（仅保留定位符）'
    }
    const ref = refOf({ tag: 'button', name: 'New session', text: 'New session' })
    const text = ui.serializeQuickReference(ref, '对齐行高', ZH_LABELS).replace(/\n+$/, '')
    const lines = text.split('\n')
    assert.equal(lines[0], `${ZH_LABELS.title} · ${ui.elementLabel(ref)}`)
    assert.equal(lines[1], `${ZH_LABELS.reference}${ui.describeLocator(ref)}`, 'a full-width colon takes no space')
    assert.match(lines[2], /^会话：\S+ · 14:05$/)
    assert.equal(lines[3], `备注：对齐行高`)
  })

  test('serializeBatchRequest numbers items in order, marks stale entries, and ends with a newline', () => {
    const first = refOf({ name: 'First', text: 'First' }, { order: 1 })
    const second = refOf({ name: 'Second', text: 'Second' }, { order: 2 })
    second.status = 'missing'
    const text = ui.serializeBatchRequest([
      { ref: first, note: 'do the first thing' },
      { ref: second, note: '' }
    ], EN_LABELS)
    assert.ok(text.endsWith('\n'))
    assert.ok(text.startsWith(`${EN_LABELS.batchHeader}\n\n`))
    assert.ok(text.indexOf('1. ') > 0)
    assert.ok(text.indexOf('2. ') > text.indexOf('1. '), 'numbered in collection order')
    assert.ok(text.includes(`${ui.elementLabel(first)}`))
    assert.ok(text.includes(`${ui.elementLabel(second)}`))
    assert.ok(text.includes('do the first thing'))
    assert.ok(text.includes(`${EN_LABELS.note} ${EN_LABELS.emptyNote}`), 'empty-note placeholder')
    assert.ok(text.includes(`   ${EN_LABELS.status}`), 'stale marker line')
    assert.ok(!/^3\. /m.test(text))
    assert.equal(text.split(EN_LABELS.status).length - 1, 1, 'only the stale item carries a status line')
  })

  test('serializeBatchRequest excludes other-session entries and reports the skipped count', () => {
    const current = refOf({ name: 'Current', text: 'Current' }, { sessionId: SESSION_A })
    const other = refOf({ name: 'Other', text: 'Other' }, { sessionId: SESSION_B })
    const items = [{ ref: current, note: '' }, { ref: other, note: 'from elsewhere' }]
    const split = ui.batchScopeSplit(items, SESSION_A)
    assert.equal(split.current.length, 1)
    assert.equal(split.other.length, 1)
    assert.equal(split.current[0].ref.id, current.id)
    assert.equal(split.other[0].ref.id, other.id)

    const labels = { ...EN_LABELS, skippedCount: split.other.length }
    const withOther = ui.serializeBatchRequest(split.current, labels)
    assert.ok(withOther.includes('(1 annotation(s) from other sessions skipped)'), withOther)
    assert.ok(withOther.includes(ui.elementLabel(current)))
    assert.ok(!withOther.includes(ui.elementLabel(other)))

    const onlyCurrent = ui.serializeBatchRequest(split.current, { ...EN_LABELS, skippedCount: 0 })
    assert.ok(!/from other sessions skipped/.test(onlyCurrent))
  })

  //#endregion

  //#region resolution

  /** A live-element stand-in for the injected `queryAll`. */
  const liveElement = (tagName, textContent) => ({ tagName, textContent, isConnected: true })

  test('resolveRefStatus reports resolved/ambiguous/missing from injected queryAll', () => {
    const ref = refOf({ tag: 'button', name: 'Send', text: 'Send', attrs: [{ name: 'id', value: 'send-button' }] })
    const candidates = ref.locator.candidates
    const element = liveElement('BUTTON', 'Send')

    assert.equal(ui.resolveRefStatus({ candidates, expectedTag: 'button', queryAll: () => [element] }), 'resolved')
    assert.equal(ui.resolveRefStatus({ candidates, expectedTag: 'button', queryAll: () => [element, element] }), 'ambiguous')
    assert.equal(ui.resolveRefStatus({ candidates, expectedTag: 'button', queryAll: () => [] }), 'missing')
    // A candidate that returns a different tag does not count as a match.
    assert.equal(ui.resolveRefStatus({ candidates, expectedTag: 'button', queryAll: () => [liveElement('DIV', 'Send')] }), 'missing')
    // Candidates are tried in reliability order: the first unique hit wins.
    const bySelector = new Map()
    for (const [index, candidate] of candidates.entries()) bySelector.set(candidate.value, index === 1 ? [element] : [])
    assert.equal(ui.resolveRefStatus({
      candidates,
      expectedTag: 'button',
      queryAll: (selector) => bySelector.get(selector) ?? []
    }), 'resolved')
  })

  test('resolveRefStatus uses the liveInfo probe for changed and disconnected targets', () => {
    const ref = refOf({ tag: 'button', name: 'Send', text: 'Send', attrs: [{ name: 'id', value: 'send-button' }] })
    const candidates = ref.locator.candidates
    const element = liveElement('BUTTON', 'Send')
    const input = { candidates, expectedTag: 'button', queryAll: () => [element] }

    assert.equal(ui.resolveRefStatus({
      ...input,
      liveInfo: (matched) => ({ isConnected: matched.isConnected, textContent: matched.textContent, expectedText: ref.text })
    }), 'resolved')

    assert.equal(ui.resolveRefStatus({
      ...input,
      liveInfo: () => ({ isConnected: true, textContent: 'Send now', expectedText: ref.text })
    }), 'changed')

    assert.equal(ui.resolveRefStatus({
      ...input,
      liveInfo: () => ({ isConnected: false, textContent: 'Send', expectedText: ref.text })
    }), 'missing')
  })

  test('F11: resolveRefStatus changed detection covers digest, accessible name, and empty captured text', () => {
    const longText = 'word '.repeat(40).trim()
    const longRef = refOf({
      tag: 'button',
      name: 'Long target',
      attrs: [{ name: 'id', value: 'long-button' }],
      text: longText,
      textDigest: ui.textDigest(longText)
    })
    const longElement = liveElement('BUTTON', longText)
    const base = { candidates: longRef.locator.candidates, expectedTag: 'button', queryAll: () => [longElement] }

    // Unchanged digest and accessible name keep the target resolved.
    assert.equal(ui.resolveRefStatus({
      ...base,
      liveInfo: () => ({ expectedDigest: longRef.textDigest, actualDigest: ui.textDigest(longText), expectedName: 'Long target', actualName: 'Long target' })
    }), 'resolved')

    // A tail change beyond the 80-char display summary changes the digest.
    assert.equal(ui.resolveRefStatus({
      ...base,
      liveInfo: () => ({ expectedDigest: longRef.textDigest, actualDigest: ui.textDigest(`${longText} tail`) })
    }), 'changed', 'a change outside the truncated summary still reads as changed')

    // The accessible name can change while the visible text stays the same.
    assert.equal(ui.resolveRefStatus({
      ...base,
      liveInfo: () => ({ expectedName: 'Long target', actualName: 'Long target renamed' })
    }), 'changed', 'an aria-label change reads as changed')

    // Captured text was empty but the live element now has text.
    const emptyRef = refOf({
      tag: 'button',
      name: 'Icon',
      attrs: [{ name: 'id', value: 'icon-button' }],
      text: '',
      textDigest: ui.textDigest('')
    })
    assert.equal(ui.resolveRefStatus({
      candidates: emptyRef.locator.candidates,
      expectedTag: 'button',
      queryAll: () => [liveElement('BUTTON', 'now has text')],
      liveInfo: () => ({ expectedDigest: emptyRef.textDigest, actualDigest: ui.textDigest('now has text') })
    }), 'changed', 'empty captured text with live text reads as changed')

    // The digest must not rescue the generic-only branch (no stable candidate).
    const genericRef = refOf({ tag: 'div', role: '', name: '', component: 'container', text: '', textDigest: ui.textDigest('') })
    assert.equal(ui.resolveRefStatus({
      candidates: genericRef.locator.candidates,
      expectedTag: 'div',
      queryAll: () => [liveElement('DIV', 'now has text')],
      liveInfo: () => ({ expectedDigest: ui.textDigest(''), actualDigest: ui.textDigest('now has text') })
    }), 'resolved', 'a unique anonymous generic match stays resolved; digest does not corroborate')
  })

  //#endregion

  //#region DOM candidate resolver (R1)

  /** A live-node stand-in for the pure resolver: plain object, no DOM API. */
  const resolverNode = (tagName = 'P') => ({ tagName })

  test('R1: the resolver continues past generic ambiguity to a unique lower-reliability match', () => {
    const genericA = resolverNode()
    const genericB = resolverNode()
    const pathMatch = resolverNode()
    const queried = []
    const queryAll = (selector) => {
      queried.push(selector)
      if (selector === 'p') return [genericA, genericB]
      if (selector === 'body > div > p') return [pathMatch]
      return []
    }
    const result = ui.resolveNodeCandidate({
      candidates: [
        { kind: 'tag', value: 'p', reliability: 0.2 },
        { kind: 'path', value: 'body > div > p', reliability: 0.1 }
      ],
      expectedTag: 'p',
      queryAll
    })
    assert.equal(result, pathMatch, 'generic ambiguity must fall through to the lower-reliability unique path')
    assert.deepEqual(queried, ['p', 'body > div > p'], 'the resolver keeps walking after generic ambiguity')
  })

  test('R1: a stable ambiguity is terminal and never falls through to generic candidates', () => {
    const stableSelector = '[data-testid="send"]'
    const stableA = resolverNode('BUTTON')
    const stableB = resolverNode('BUTTON')
    const generic = resolverNode('BUTTON')
    const queried = []
    const queryAll = (selector) => {
      queried.push(selector)
      if (selector === stableSelector) return [stableA, stableB]
      return [generic]
    }
    const result = ui.resolveNodeCandidate({
      candidates: [
        { kind: 'data', value: stableSelector, reliability: 0.92 },
        { kind: 'tag', value: 'button', reliability: 0.2 }
      ],
      expectedTag: 'button',
      queryAll
    })
    assert.equal(result, null, 'a stable candidate matching several elements is genuine ambiguity')
    assert.deepEqual(queried, [stableSelector], 'later generic candidates must not be consulted')
  })

  test('R1: unique generic and unique stable matches are returned, with tag filtering', () => {
    const genericNode = resolverNode('P')
    assert.equal(ui.resolveNodeCandidate({
      candidates: [{ kind: 'tag', value: 'p', reliability: 0.2 }],
      expectedTag: 'p',
      queryAll: () => [genericNode]
    }), genericNode, 'a unique generic match is the only match')

    const stableNode = resolverNode('BUTTON')
    assert.equal(ui.resolveNodeCandidate({
      candidates: [{ kind: 'data', value: '[data-testid="x"]', reliability: 0.92 }],
      expectedTag: 'BUTTON',
      queryAll: () => [stableNode]
    }), stableNode, 'expectedTag is compared case-insensitively')

    const expectedNode = resolverNode('P')
    const mismatchedNode = resolverNode('DIV')
    assert.equal(ui.resolveNodeCandidate({
      candidates: [{ kind: 'tag', value: 'p', reliability: 0.2 }],
      expectedTag: 'p',
      queryAll: () => [mismatchedNode, expectedNode]
    }), expectedNode, 'mismatched tags are filtered before uniqueness is decided')
  })

  test('R1: no match, invalid input, and non-node entries resolve to null', () => {
    assert.equal(ui.resolveNodeCandidate(null), null)
    assert.equal(ui.resolveNodeCandidate({ candidates: [], expectedTag: 'p', queryAll: () => [] }), null)
    assert.equal(ui.resolveNodeCandidate({
      candidates: [{ kind: 'tag', value: 'p', reliability: 0.2 }],
      expectedTag: 'p',
      queryAll: () => []
    }), null)
    assert.equal(ui.resolveNodeCandidate({
      candidates: [{ kind: 'tag', value: 'p', reliability: 0.2 }],
      expectedTag: 'p',
      queryAll: () => [null, 7, 'x', {}]
    }), null, 'non-node entries are ignored')
  })

  test('R1: repeated calls re-query and never reuse a stale first hit', () => {
    const candidates = [{ kind: 'data', value: '[data-testid="live"]', reliability: 0.92 }]
    const firstNode = resolverNode('BUTTON')
    let live = [firstNode]
    let calls = 0
    const queryAll = () => { calls += 1; return live }
    const firstResult = ui.resolveNodeCandidate({ candidates, expectedTag: 'button', queryAll })
    const replacement = resolverNode('BUTTON')
    live = [replacement]
    const secondResult = ui.resolveNodeCandidate({ candidates, expectedTag: 'button', queryAll })
    assert.equal(firstResult, firstNode)
    assert.equal(secondResult, replacement, 'the resolver must not memoize the first hit')
    assert.equal(calls, 2, 'every call re-queries the document')
  })

  //#endregion

  //#region geometry and layout

  test('clampLauncherPosition keeps the launcher fully inside the viewport with an 8px margin', () => {
    assert.deepEqual(plain(ui.clampLauncherPosition({ x: 900, y: 400 }, { width: 1728, height: 900 })), { x: 900, y: 400 })
    assert.deepEqual(plain(ui.clampLauncherPosition({ x: 5000, y: 5000 }, { width: 1728, height: 900 })), { x: 1680, y: 852 })
    assert.deepEqual(plain(ui.clampLauncherPosition({ x: -40, y: -40 }, { width: 1728, height: 900 })), { x: 8, y: 8 })
    assert.deepEqual(plain(ui.clampLauncherPosition({ x: 1000, y: 700 }, { width: 1000, height: 700 })), { x: 952, y: 652 })
  })

  test('clampPopoverPosition keeps the popover inside the viewport and left of the rail', () => {
    const viewport = { width: 1728, height: 900 }
    const railWidth = 200
    const margin = 8
    const popoverSize = { width: 320, height: 220 }
    for (const rect of [
      { x: 100, y: 100, width: 80, height: 32 },
      { x: 1600, y: 600, width: 80, height: 32 },
      { x: -30, y: -20, width: 80, height: 32 }
    ]) {
      const position = ui.clampPopoverPosition(rect, popoverSize, viewport, railWidth, margin)
      assert.ok(position.x >= margin, `x >= margin for ${JSON.stringify(rect)}`)
      assert.ok(position.y >= margin, `y >= margin for ${JSON.stringify(rect)}`)
      assert.ok(position.x + popoverSize.width <= viewport.width - railWidth - margin, 'stays left of the rail')
      assert.ok(position.y + popoverSize.height <= viewport.height - margin, 'stays inside the bottom edge')
    }
    const beside = ui.clampPopoverPosition({ x: 100, y: 100, width: 80, height: 32 }, popoverSize, viewport, railWidth, margin)
    assert.ok(beside.x >= 100, 'prefers to the right of the target')
    const noRail = ui.clampPopoverPosition({ x: 1700, y: 100, width: 20, height: 20 }, popoverSize, viewport, 0, margin)
    assert.ok(noRail.x + popoverSize.width <= viewport.width - margin)
  })

  test('computeRailWidth follows clamp(188, round(0.116 * vw), 236) and collapses to 48', () => {
    assert.equal(ui.computeRailWidth(1728), 200)
    assert.equal(ui.computeRailWidth(1000), 188)
    assert.equal(ui.computeRailWidth(3000), 236)
    assert.equal(ui.computeRailWidth(1600), Math.min(236, Math.max(188, Math.round(0.116 * 1600))))
    assert.equal(ui.computeRailWidth(1728, true), 48)
    assert.equal(ui.computeRailWidth(1000, true), 48)
    for (const viewportWidth of [640, 900, 1280, 1728, 2560]) {
      assert.equal(Number.isInteger(ui.computeRailWidth(viewportWidth)), true)
    }
  })

  test('layoutModeFor shrinks only when 560px remain after the sidebar and rail', () => {
    assert.equal(ui.layoutModeFor(1728, 280, 200), 'shrink')
    assert.equal(ui.layoutModeFor(1000, 280, 200), 'overlay')
    assert.equal(ui.layoutModeFor(1040, 280, 200), 'shrink', '560px exactly still shrinks')
    assert.equal(ui.layoutModeFor(1039, 280, 200), 'overlay', '559px falls back to overlay')
    assert.equal(ui.layoutModeFor(1728, 0, 200), 'shrink')
    assert.equal(ui.layoutModeFor(500, 280, 48), 'overlay')
  })

  //#endregion

  //#region source-level regressions (F6, F16)

  test('F6: the popover note textarea is wired to beginEdit/endEdit in production code', () => {
    const source = client.source
    assert.equal(typeof source, 'string')
    const start = source.indexOf('function AnnotationPopover')
    assert.ok(start >= 0, 'the AnnotationPopover component exists')
    const nextFunction = source.indexOf('\n    function ', start + 'function AnnotationPopover'.length)
    const popover = source.slice(start, nextFunction > 0 ? nextFunction : source.length)
    assert.ok(popover.includes("'data-psa-note'"), 'the popover still renders the note textarea')
    assert.ok(popover.includes('onFocus'), 'the note textarea enters edit mode on focus')
    assert.ok(popover.includes('onBlur'), 'the note textarea leaves edit mode on blur')
    assert.ok(/beginEdit/.test(popover) && /endEdit/.test(popover), 'the textarea handlers dispatch the editing actions')
    // The reducer tests above are only meaningful if production actually dispatches
    // these actions; the wiring lives in the controller beginEdit/endEdit methods.
    assert.match(source, /type:\s*'beginEdit'/, 'the controller dispatches beginEdit')
    assert.match(source, /type:\s*'endEdit'/, 'the controller dispatches endEdit')
  })

  test('F16: annotation region markers are balanced and closed before the plugin region', () => {
    const source = client.source
    const outerStart = source.indexOf('//#region feature: ui element annotation')
    const pluginStart = source.indexOf('//#region plugin', outerStart)
    assert.ok(outerStart >= 0, 'the outer annotation region exists')
    assert.ok(pluginStart > outerStart, 'the plugin region follows the annotation region')
    const slice = source.slice(outerStart, pluginStart)
    const stack = []
    for (const line of slice.split('\n')) {
      if (/^\s*\/\/#region\b/.test(line)) stack.push(line.trim())
      else if (/^\s*\/\/#endregion\b/.test(line)) {
        assert.ok(stack.length > 0, 'no orphan #endregion inside the annotation feature')
        stack.pop()
      }
    }
    assert.deepEqual(stack, [], 'the outer annotation region closes before //#region plugin')
    assert.ok(slice.includes('//#region ui element annotation — pure model'), 'the pure model has its own nested region')
    const regions = (source.match(/\/\/#region\b/g) ?? []).length
    const endregions = (source.match(/\/\/#endregion\b/g) ?? []).length
    assert.equal(regions, endregions, 'whole-file region and endregion markers balance')
  })

  //#endregion
}
