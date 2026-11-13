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
import { readFileSync } from 'node:fs'
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
    'RECORDS_STORAGE_KEY', 'RECORD_LIMIT',
    'normalizeSettings', 'resolveModifierChange', 'parseStoredSettings', 'serializeSettings',
    'modifierMatches',
    'textDigest',
    'sanitizeText', 'normalizeUserNote', 'sanitizeAttributeName', 'sanitizeAttributeValue',
    'buildElementRef', 'selectorCandidates', 'identityKeyOf', 'describeLocator', 'elementLabel',
    'cssIdentifier', 'clampPopoverPositionToViewport',
    'createAnnotationState', 'reduceAnnotationState',
    'serializeQuickReference', 'serializeBatchRequest', 'batchScopeSplit',
    'resolveRefStatus',
    'resolveNodeCandidate',
    'clampLauncherPosition', 'clampPopoverPosition', 'computeRailWidth', 'layoutModeFor',
    'collectionAdd', 'collectionRemove', 'collectionClear', 'collectionSetNote',
    'annotationWorkspaceLabel', 'annotationRoutePath', 'normalizeAnnotationViewport',
    'buildStableAncestors', 'buildUniqueSelector', 'annotationLocatorText',
    'normalizeAnnotationRecord', 'parseAnnotationStore', 'serializeAnnotationStore',
    'annotationSurfaceRoot', 'annotationSurfaceLevels', 'annotationSurfacePickLevel',
    'annotationLeafPickIndex',
    'annotationIsGroup', 'annotationGroupItems', 'annotationFlattenRecords',
    'annotationTotalItemCount', 'annotationFindRecord', 'annotationGroupFromSelection',
    'collectionAddGroup', 'serializeBatchEntries',
    'annotationSidebarCounts', 'annotationFilterEntries', 'annotationGroupSummary',
    'annotationEntryOrdinals', 'annotationSurfacePinEligible', 'annotationSurfacePinEventMatches',
    'annotationNormalizeQuoteText', 'annotationXPathOf', 'annotationJsPathFor', 'annotationTextQuoteOf',
    'annotationTextPositionOf', 'annotationTextQuoteMatches', 'annotationSelectorScore', 'annotationResolveStatus',
    'annotationIsGeneratedClass',
    'annotationRenderTextChunks', 'annotationDisambiguateQuote', 'annotationScoreQuoteMatches',
    'annotationFullXPathOf', 'annotationFallbackCacheKey', 'annotationLevenshteinWithin',
    'annotationHasStrongIdentity', 'annotationStructuralFallbackStatus', 'annotationCopyAnchorDecision',
    'annotationRenderedTextRepeatCount', 'annotationFirstTextLeafDescendant', 'annotationAncestorTagChain',
    'annotationDescendantAncestorMatches', 'annotationStatusConfidence', 'annotationStatusLabelKey', 'annotationScopeAuthorityOutcome', 'annotationEphemeralOutcome', 'debugFallbackScanProbe',
    'upsertAnnotationRecord', 'removeAnnotationRecord', 'restoreAnnotationRecord',
    'moveAnnotationRecord', 'toggleAnnotationInclude', 'annotationUndoRemove',
    'annotationUndoRestore', 'annotationMarkerBadgeText', 'clampDetailCardPosition',
    'annotationUndoRemoveMany', 'annotationScopeCounts', 'annotationSelectedEntries',
    'annotationApplyIncludes', 'annotationChipRefOf', 'annotationChipRefBatch',
    'parseAnnotationChipRef', 'annotationChipCandidates', 'serializeAnnotationChip'
  ]
  /**
   * Frozen seam generation. 31 = round-1 audit, 32 = round-2 resolver, 35 =
   * audit-fix batch, 48 = A1/A2/persistence Phase 1 (surface picker, unique
   * selector/ancestors, v2 record store), 57 = A3 Phase 2-A (record commit/undo/
   * move/include helpers, mark badge excerpt, detail-card clamp), 66 = A3 Phase
   * 2-B (multi-delete undo, rail scope/selection helpers, chip ref round-trip,
   * candidates and model serialization), 67 = inner-first floating-surface pick
   * level, 68 = leaf-first picking (deepest eligible element, full ancestor
   * Parent/Child chain), 69 = batch groups (group model helpers, flatten/cap,
   * group serializer), 79 = redesigned sidebar (derived counts, client-side
   * filter, group auto-summary), 80 = shared group ordinals (A3/T29 numbering),
   * 82 = transient-surface pinning (eligible selection + capture-phase match),
   * 90 = multi-strategy anchors (quote/xpath/js path/scoring/resolution),
   * 91 = P0 selector stability (generated-class filter),
   * 97 = P1/P2 anchor hardening (rendered text/disambiguation/scoring/full xpath/cache),
   * 100 = review fixes (strong identity gate / structural status / copy decision),
   * 106 = descendant anchors / confidence / rendered climb (repeat count, leaf, chain, match, confidence, label).
   * The E2E `ACCEPTED_SEAM_GENERATIONS` must accept exactly these counts.
   */
  const SEAM_GENERATION = SEAM_EXPORTS.length
  /** Accepted `Function.length` ranges from the frozen signatures (defaults reduce length). */
  const SEAM_ARITIES = {
    normalizeSettings: [1, 1],
    resolveModifierChange: [3, 3],
    parseStoredSettings: [1, 1],
    serializeSettings: [1, 1],
    modifierMatches: [2, 2],
    textDigest: [1, 1],
    sanitizeText: [1, 2],
    normalizeUserNote: [1, 1],
    cssIdentifier: [1, 1],
    clampPopoverPositionToViewport: [3, 5],
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
    computeRailWidth: [1, 3],
    layoutModeFor: [3, 3],
    collectionAdd: [2, 3],
    collectionRemove: [2, 2],
    collectionClear: [0, 0],
    collectionSetNote: [3, 3],
    annotationWorkspaceLabel: [1, 1],
    annotationRoutePath: [1, 1],
    normalizeAnnotationViewport: [1, 1],
    buildStableAncestors: [1, 1],
    buildUniqueSelector: [2, 2],
    annotationLocatorText: [1, 1],
    normalizeAnnotationRecord: [1, 2],
    parseAnnotationStore: [1, 1],
    serializeAnnotationStore: [1, 2],
    annotationSurfaceRoot: [1, 2],
    annotationSurfaceLevels: [1, 2],
    annotationSurfacePickLevel: [2, 4],
    annotationLeafPickIndex: [1, 3],
    annotationIsGroup: [1, 1],
    annotationGroupItems: [1, 1],
    annotationFlattenRecords: [1, 1],
    annotationTotalItemCount: [1, 1],
    annotationFindRecord: [2, 2],
    annotationGroupFromSelection: [5, 5],
    collectionAddGroup: [3, 3],
    serializeBatchEntries: [3, 3],
    annotationSidebarCounts: [2, 2],
    annotationFilterEntries: [2, 2],
    annotationGroupSummary: [1, 1],
    annotationEntryOrdinals: [1, 1],
    annotationSurfacePinEligible: [2, 2],
    annotationSurfacePinEventMatches: [3, 3],
    annotationNormalizeQuoteText: [1, 2],
    annotationXPathOf: [1, 1],
    annotationJsPathFor: [1, 1],
    annotationTextQuoteOf: [1, 1],
    annotationTextPositionOf: [1, 1],
    annotationTextQuoteMatches: [2, 2],
    annotationSelectorScore: [1, 1],
    annotationResolveStatus: [1, 1],
    annotationIsGeneratedClass: [1, 1],
    annotationRenderTextChunks: [1, 1],
    annotationDisambiguateQuote: [3, 4],
    annotationScoreQuoteMatches: [2, 4],
    annotationFullXPathOf: [1, 1],
    annotationFallbackCacheKey: [2, 2],
    annotationLevenshteinWithin: [3, 3],
    annotationHasStrongIdentity: [1, 1],
    annotationStructuralFallbackStatus: [2, 2],
    annotationCopyAnchorDecision: [1, 1],
    annotationRenderedTextRepeatCount: [2, 2],
    annotationFirstTextLeafDescendant: [1, 1],
    annotationAncestorTagChain: [2, 2],
    annotationDescendantAncestorMatches: [2, 2],
    annotationStatusConfidence: [2, 2],
    annotationStatusLabelKey: [2, 2],
    annotationScopeAuthorityOutcome: [1, 1],
    annotationEphemeralOutcome: [2, 3],
    debugFallbackScanProbe: [0, 0],
    annotationUndoRemoveMany: [2, 3],
    annotationScopeCounts: [2, 2],
    annotationSelectedEntries: [2, 2],
    annotationApplyIncludes: [2, 2],
    annotationChipRefOf: [1, 1],
    annotationChipRefBatch: [1, 2],
    parseAnnotationChipRef: [1, 1],
    annotationChipCandidates: [2, 4],
    serializeAnnotationChip: [3, 4],
    upsertAnnotationRecord: [2, 4],
    removeAnnotationRecord: [2, 2],
    restoreAnnotationRecord: [2, 3],
    moveAnnotationRecord: [3, 3],
    toggleAnnotationInclude: [3, 3],
    annotationUndoRemove: [2, 4],
    annotationUndoRestore: [2, 2],
    annotationMarkerBadgeText: [1, 2],
    clampDetailCardPosition: [3, 5]
  }

  test('the seam publishes exactly the frozen §3.7 surface', () => {
    assert.deepEqual(Object.keys(ui).sort(), [...SEAM_EXPORTS].sort())
    assert.equal(SEAM_GENERATION, 109, 'the frozen task-47 generation is pinned')
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
    statusEphemeral: 'Status: transient surface no longer present (locator only)',
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
    assert.equal(ref.version, 2)
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
    assert.deepEqual(Object.keys(input).sort(), ['at', 'bounds', 'component', 'context', 'id', 'included', 'lastStatus', 'locator', 'note', 'order', 'route', 'session', 'text', 'textDigest', 'updatedAt', 'version', 'viewport'])
    assert.deepEqual(Object.keys(input.locator).sort(), ['ancestors', 'anchorAncestorChain', 'anchorLeafTag', 'anchorSignature', 'anchorTarget', 'candidates', 'ephemeral', 'jsPath', 'key', 'name', 'path', 'role', 'surface', 'tag', 'textPosition', 'textQuote', 'uniqueSelector', 'uniqueVerified', 'xpath'])
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
    assert.deepEqual(Object.keys(plain).sort(), ['at', 'bounds', 'component', 'context', 'id', 'included', 'lastStatus', 'locator', 'note', 'order', 'route', 'session', 'text', 'textDigest', 'updatedAt', 'version', 'viewport'])
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
  const STATE_KEYS = ['batchOpen', 'box', 'collection', 'editing', 'feedback', 'filter', 'hoverId', 'note', 'passThrough', 'phase', 'selection', 'sessionId', 'view']

  test('reducer starts from the frozen off state and activates to idle', () => {
    const initial = ui.createAnnotationState()
    assert.deepEqual(Object.keys(initial).sort(), STATE_KEYS)
    assert.equal(initial.phase, 'off')
    assert.equal(initial.view, 'collection', 'the managed list is the default rail body')
    assert.equal(initial.hoverId, null)
    assert.deepEqual(plain(initial.selection), [])
    assert.equal(initial.note, '')
    assert.equal(initial.editing, false)
    assert.deepEqual(plain(initial.collection), [])
    assert.equal(initial.batchOpen, false)
    assert.equal(initial.filter, 'all')
    assert.equal(initial.passThrough, false)
    assert.equal(initial.box, null)
    assert.equal(initial.feedback, null)
    assert.equal(initial.sessionId, null)

    const active = ui.reduceAnnotationState(initial, { type: 'activate' })
    assert.equal(active.phase, 'idle')
    assert.equal(active.view, 'collection', 'activation shows the managed list immediately')
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
    assert.equal(deactivated.view, 'collection', 'the next activation defaults to the list')
    assert.deepEqual(plain(deactivated.collection), plain(state.collection), 'collection survives deactivation')
    assert.deepEqual(plain(deactivated.selection), [])

    const switched = ui.reduceAnnotationState(deactivated, { type: 'activate' })
    const withSelection = ui.reduceAnnotationState(switched, { type: 'selectSingle', ref })
    const switchedSession = ui.reduceAnnotationState(withSelection, { type: 'session', sessionId: SESSION_B })
    assert.equal(switchedSession.sessionId, SESSION_B)
    assert.equal(switchedSession.view, 'collection', 'the list stays the default view across sessions')
    assert.deepEqual(plain(switchedSession.selection), [], 'session switch clears the selection')
    assert.equal(switchedSession.hoverId, null)
    assert.equal(switchedSession.note, '')
    assert.deepEqual(plain(switchedSession.collection), plain(state.collection), 'collection survives the switch')

    const off = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'session', sessionId: SESSION_B })
    assert.equal(off.phase, 'off', 'a switch while inactive stays off')
  })

  test('reducer Esc ladder steps note -> selection -> settings -> off', () => {
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

    // A3/T26: the list is the default view; settings is the only stepped-back view.
    state = ui.reduceAnnotationState(state, { type: 'openView', view: 'settings' })
    assert.equal(state.view, 'settings')
    assert.equal(state.phase, 'idle')
    state = ui.reduceAnnotationState(state, { type: 'exitOne' })
    assert.equal(state.view, 'collection', 'Esc leaves settings back to the list')
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

  test('candidate-chain creation collects elements only (no descriptor build)', () => {
    const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
    const start = source.indexOf('function annotationCandidateChain')
    const end = source.indexOf('function annotationIsCandidate')
    assert.ok(start > 0 && end > start, 'candidate chain sources are present')
    const body = source.slice(start, end)
    assert.ok(!body.includes('annotationDescriptorOf('), 'chain creation must not build descriptors')
    assert.ok(body.includes('insideComposer'), 'chain entries carry composer membership only')
    const refStart = source.indexOf('function refForLevel')
    const refEnd = source.indexOf('function pickLevels')
    assert.ok(refStart > 0 && refEnd > refStart, 'level ref sources are present')
    const refBody = source.slice(refStart, refEnd)
    assert.ok(refBody.includes('annotationDescriptorOf(element'), 'chosen descriptor is built lazily')
    assert.ok(refBody.includes('chain.slice(1, 3)'), 'at most two context ancestors get descriptors')
  })

  //#region A1/F2 floating-surface picking (Phase 1)

  /** One fake chain entry. @param {string} id - fake element id. @returns {object} chain entry. */
  const chainEntry = (id) => ({ element: { id }, insideComposer: false })

  test('A1/F2: annotationSurfaceRoot picks the outermost contiguous floating ancestor and never crosses it', () => {
    const ids = (list) => list.map(chainEntry)
    const floating = (element) => element.id === 'card' || element.id === 'inner'
    // text row -> inner absolute layer -> fixed card -> static portal: root is the card.
    const surface = ui.annotationSurfaceRoot(ids(['text', 'inner', 'card', 'portal', 'page']), floating)
    assert.deepEqual(plain(surface), { root: { id: 'card' }, index: 2 })
    // A static page chain has no surface at all.
    assert.equal(ui.annotationSurfaceRoot(ids(['button', 'static', 'page']), () => false), null)
    // A floating ancestor above a static break is a different run; the nearer run wins.
    const broken = ui.annotationSurfaceRoot(ids(['text', 'inner', 'static', 'outer']), (element) => element.id === 'inner' || element.id === 'outer')
    assert.deepEqual(plain(broken), { root: { id: 'inner' }, index: 1 }, 'the static ancestor ends the contiguous run')
    // Empty chain and default DOM predicate on non-DOM objects stay inert, never throw.
    assert.equal(ui.annotationSurfaceRoot([]), null)
    assert.equal(ui.annotationSurfaceRoot(ids(['plain'])), null)
  })

  /**
   * One DOM-free accessor set for annotationSurfaceLevels.
   * @param {object[]} descendants - fake descendant elements.
   * @returns {object} accessors.
   */
  const surfaceAccess = (descendants) => ({
    descendants: () => descendants,
    isCandidate: (element) => element.candidate === true,
    isOwn: (element) => element.own === true,
    visible: (element) => element.hidden !== true,
    rectOf: (element) => ({ x: 0, y: 0, width: element.width ?? 20, height: element.height ?? 20 }),
    textOf: (element) => element.text ?? '',
    childCount: (element) => (element.children ?? []).length,
    insideComposer: () => false
  })

  test('A1/F2: annotationSurfaceLevels is root-first, ordered, filtered and capped', () => {
    const root = { id: 'card' }
    const title = { id: 'title', text: 'Session title' }
    const nested = { id: 'nested', text: 'Nested', children: [{}] }
    const control = { id: 'control', candidate: true, text: 'Open' }
    const hidden = { id: 'hidden', hidden: true, text: 'invisible' }
    const own = { id: 'own', own: true, text: ' ours ' }
    const levels = ui.annotationSurfaceLevels(root, surfaceAccess([title, nested, control, hidden, own]))
    assert.deepEqual(plain(levels).map((level) => level.element.id), ['card', 'title', 'control'],
      'root first, then text blocks and candidates in document order; nested/own/hidden are excluded')
    assert.equal(levels[0].element, root)
    assert.equal(ui.annotationSurfaceLevels(null, surfaceAccess([])).length, 0)
    const many = Array.from({ length: 30 }, (_, index) => ({ id: `row-${index}`, text: `row ${index}` }))
    assert.equal(ui.annotationSurfaceLevels(root, surfaceAccess(many)).length, 12, 'inner levels are capped at 12')
  })

  test('A3 inner-first: annotationSurfacePickLevel picks the deepest level under the pointer', () => {
    const root = { id: 'card' }
    const row = { id: 'row' }
    const text = { id: 'text' }
    const span = { id: 'span' }
    const portal = { id: 'portal' }
    const floating = (element) => element.id === 'card' || element.id === 'inner'
    const levels = [root, row, text].map((element) => ({ element, insideComposer: false }))
    const chainOf = (...elements) => elements.map((element) => ({ element, insideComposer: false }))
    // A hit on an inner text level (and its wrapper ancestors) resolves that level.
    assert.deepEqual(
      plain(ui.annotationSurfacePickLevel(chainOf(text, row, root, portal), levels, floating)),
      { surface: { root, index: 2 }, index: 2 }
    )
    // A hit on a wrapper that is not itself a level resolves the nearest level ancestor.
    assert.deepEqual(
      plain(ui.annotationSurfacePickLevel(chainOf(span, row, root, portal), levels, floating)),
      { surface: { root, index: 2 }, index: 1 }
    )
    // A semantic row candidate wins over the nearer leaf text inside it (dropdown rows).
    const titleLeaf = { id: 'title-leaf' }
    const rowButton = { id: 'row-button' }
    const rowChain = chainOf(titleLeaf, rowButton, root, portal)
    const rowLevels = [root, rowButton, titleLeaf].map((element) => ({ element, insideComposer: false }))
    assert.equal(
      plain(ui.annotationSurfacePickLevel(rowChain, rowLevels, floating, (element) => element.id === 'row-button')).index,
      1,
      'a semantic row candidate outranks the nearest text leaf'
    )
    assert.equal(
      plain(ui.annotationSurfacePickLevel(rowChain, rowLevels, floating, () => false)).index,
      2,
      'without a semantic candidate the nearest text-block level wins'
    )
    // A background/padding hit (the surface root itself) keeps the whole surface.
    assert.deepEqual(
      plain(ui.annotationSurfacePickLevel(chainOf(root, portal), levels, floating)),
      { surface: { root, index: 0 }, index: 0 }
    )
    // Containment fallback: an unknown wrapper hit resolves the LAST containing level.
    row.contains = (element) => element === span || element === text
    text.contains = () => false
    const nested = { id: 'nested', contains: (element) => element === span }
    const containmentLevels = [root, row, nested].map((element) => ({ element, insideComposer: false }))
    assert.equal(plain(ui.annotationSurfacePickLevel(chainOf(span, root, portal), containmentLevels, floating)).index, 2)
    // No surface at all: page chains keep the ordinary picker (index -1).
    assert.deepEqual(
      plain(ui.annotationSurfacePickLevel(chainOf(span, row), levels, () => false)),
      { surface: null, index: -1 }
    )
    // Empty level list falls back to the surface root.
    assert.deepEqual(
      plain(ui.annotationSurfacePickLevel(chainOf(text, root, portal), [], floating)),
      { surface: { root, index: 1 }, index: 0 }
    )
  })

  test('A3 leaf-first: pickLevels uses the full ancestor chain and the deepest eligible element', () => {
    const source = client.source
    const start = source.indexOf('function pickLevels')
    assert.ok(start >= 0, 'the controller pickLevels exists')
    const nextFunction = source.indexOf('\\n      function ', start + 'function pickLevels'.length)
    const pickBody = source.slice(start, nextFunction > 0 ? nextFunction : source.length)
    assert.ok(pickBody.includes('annotationLeafPickIndex(boundary)'), 'floating picks use the leaf helper over the surface boundary')
    assert.ok(pickBody.includes('annotationLeafPickIndex(entries)'), 'page picks use the leaf helper over the full ancestor chain')
    assert.ok(pickBody.includes('entries.slice(0, Math.min(surface.index + 1, entries.length))'), 'the surface boundary is kept (never escapes the root)')
    assert.ok(pickBody.includes("surface: 'floating'"), 'surface metadata is preserved')
    assert.ok(pickBody.includes('parentStep: 1'), 'Parent walks up the full chain (deepest first)')
    assert.ok(source.includes('function shiftChain(delta)'), 'the Parent/Child control still exists')
    const shiftStart = source.indexOf('function shiftChain(delta)')
    const shiftEnd = source.indexOf('\\n      function ', shiftStart + 'function shiftChain'.length)
    const shiftBody = source.slice(shiftStart, shiftEnd > 0 ? shiftEnd : source.length)
    assert.ok(shiftBody.includes('lastPick.index + delta * lastPick.parentStep'), 'Parent/Child walks the same chain table')
    const hoverStart = source.indexOf('function resolveHover()')
    const hoverEnd = source.indexOf('\\n      function ', hoverStart + 'function resolveHover'.length)
    const hoverBody = source.slice(hoverStart, hoverEnd > 0 ? hoverEnd : source.length)
    assert.ok(hoverBody.includes('pickLevels(chain)'), 'hover shares the leaf-first pick table with click')
  })

  test('A3 leaf-first: annotationLeafPickIndex targets the deepest eligible element and skips ineligible nodes', () => {
    const root = { id: 'page-container' }
    const section = { id: 'section' }
    const button = { id: 'button' }
    const span = { id: 'span' }
    const svg = { id: 'svg' }
    const path = { id: 'path' }
    const hidden = { id: 'hidden' }
    const own = { id: 'own' }
    const chainOf = (...elements) => elements.map((element) => ({ element, insideComposer: false }))
    const none = () => false
    // The pointer chain starts at the deepest element: span/svg/path are all eligible.
    assert.equal(plain(ui.annotationLeafPickIndex(chainOf(span, button, section, root), none, () => true)), 0)
    assert.equal(plain(ui.annotationLeafPickIndex(chainOf(svg, button, section, root), none, () => true)), 0)
    assert.equal(plain(ui.annotationLeafPickIndex(chainOf(path, svg, button, section, root), none, () => true)), 0)
    // An ineligible leaf (own UI / zero box / hidden) falls through to its ancestor.
    const eligibleExcept = (ids) => (element) => !ids.includes(element.id)
    assert.equal(plain(ui.annotationLeafPickIndex(chainOf(own, span, section), none, eligibleExcept(['own']))), 1)
    assert.equal(plain(ui.annotationLeafPickIndex(chainOf(hidden, button, section), none, eligibleExcept(['hidden']))), 1)
    assert.equal(plain(ui.annotationLeafPickIndex(chainOf(hidden, own, section), none, eligibleExcept(['hidden', 'own']))), 2)
    // Nothing eligible at all → -1 (hover clears, click does not select).
    assert.equal(plain(ui.annotationLeafPickIndex(chainOf(hidden, own), none, none)), -1)
    assert.equal(plain(ui.annotationLeafPickIndex([], none, none)), -1)
    // Inside a floating surface the walk never escapes the surface root.
    const card = { id: 'card' }
    const portal = { id: 'portal' }
    const floating = (element) => element.id === 'card' || element.id === 'portal'
    assert.equal(plain(ui.annotationLeafPickIndex(chainOf(span, card, portal, root), floating, () => true)), 0)
    assert.equal(plain(ui.annotationLeafPickIndex(chainOf(hidden, card, portal, root), floating, eligibleExcept(['hidden']))), 1, 'falls through to the surface root')
    assert.equal(plain(ui.annotationLeafPickIndex(chainOf(hidden, own, card, portal), floating, eligibleExcept(['hidden', 'own']))), 2, 'surface root is the boundary; the portal above it is never picked')
  })

  test('A3 leaf-first: annotationLeafEligible excludes own UI, structural tags and zero-box elements', () => {
    const source = client.source
    const start = source.indexOf('function annotationLeafEligible')
    assert.ok(start >= 0, 'the eligibility helper exists')
    const nextFunction = source.indexOf('\\n    function ', start + 'function annotationLeafEligible'.length)
    const body = source.slice(start, nextFunction > 0 ? nextFunction : source.length)
    assert.ok(body.includes("element.closest('[data-psa-own]')"), 'own annotation UI is excluded from leaf picks')
    assert.ok(body.includes('ANNOTATION_INELIGIBLE_TAGS.has(tag)'), 'structural tags are excluded')
    assert.ok(body.includes('annotationElementVisible(element)'), 'invisible/zero-box elements are excluded')
    const tagsStart = source.indexOf('const ANNOTATION_INELIGIBLE_TAGS')
    const tagsEnd = source.indexOf('])', tagsStart)
    const tags = source.slice(tagsStart, tagsEnd)
    for (const tag of ['html', 'body', 'script', 'style', 'head', 'title']) {
      assert.ok(tags.includes(`'${tag}'`), `${tag} must be ineligible as a leaf pick`)
    }
    const startNodeStart = source.indexOf('function annotationStartNode')
    const startNodeEnd = source.indexOf('\\n    function ', startNodeStart + 'function annotationStartNode'.length)
    const startNode = source.slice(startNodeStart, startNodeEnd > 0 ? startNodeEnd : source.length)
    assert.ok(startNode.includes('data-lexical-editor'), 'the composer exception (editable contents resolve to the composer region) is kept')
    assert.ok(startNode.includes('data-conversation-region="composer"'), 'composer internals resolve to the composer region')
  })

  //#endregion

  //#region A2 ElementRef v2 capture

  test('A2/D11: buildUniqueSelector verifies self and anchored candidates with the injected query engine', () => {
    const node = (tagName) => ({ tagName })
    const byTag = (tagName) => (selector) => (selector.includes(tagName.toUpperCase()) ? [] : [])
    // Own data attribute: one hit -> verified.
    const selfDescriptor = {
      tag: 'button',
      attrs: [
        { name: 'data-slot', value: 'sidebar.new-session' },
        { name: 'class', value: 'ignored_class' }
      ],
      anchorPaths: []
    }
    const selfSelector = 'button[data-slot="sidebar.new-session"]'
    assert.deepEqual(
      plain(ui.buildUniqueSelector(selfDescriptor, (selector) => (selector === selfSelector ? [node('BUTTON')] : []))),
      { selector: selfSelector, verified: true }
    )
    // Duplicate aria-label -> anchored structural path, never a class name.
    const duplicateDescriptor = {
      tag: 'button',
      attrs: [{ name: 'aria-label', value: 'New session' }],
      anchorPaths: [{ selector: 'div[data-slot="sidebar"]', steps: [{ tag: 'div', index: 1 }, { tag: 'button', index: 1 }] }]
    }
    const anchoredSelector = 'div[data-slot="sidebar"] > div:nth-of-type(1) > button:nth-of-type(1)'
    const anchored = ui.buildUniqueSelector(duplicateDescriptor, (selector) => {
      if (selector === 'button[aria-label="New session"]') return [node('BUTTON'), node('BUTTON')]
      if (selector === anchoredSelector) return [node('BUTTON')]
      return []
    })
    assert.deepEqual(plain(anchored), { selector: anchoredSelector, verified: true })
    // Nothing unique -> honest null, never an unverified guess.
    assert.deepEqual(plain(ui.buildUniqueSelector(duplicateDescriptor, () => [node('BUTTON'), node('BUTTON')])), { selector: null, verified: false })
    // A generated id is not used as an anchor, and no query engine -> no selector.
    const dynamicId = ui.buildUniqueSelector({ tag: 'div', attrs: [{ name: 'id', value: ':r7:' }], anchorPaths: [] }, () => [node('DIV')])
    assert.deepEqual(plain(dynamicId), { selector: null, verified: false })
    assert.deepEqual(plain(ui.buildUniqueSelector({ tag: 'div', attrs: [], anchorPaths: [] })), { selector: null, verified: false })
  })

  test('A2: buildStableAncestors keeps only sanitized identity attributes, bounded to three', () => {
    const ancestors = ui.buildStableAncestors([
      { tag: 'DIV', attrs: [{ name: 'data-slot', value: 'sidebar' }, { name: 'class', value: 'x' }, { name: 'style', value: 'y' }] },
      { tag: 'div', attrs: [{ name: 'id', value: ':r4:' }] },
      { tag: 'div', attrs: [{ name: 'aria-label', value: 'Session card' }] },
      { tag: 'span', attrs: [{ name: 'data-row-key', value: REAL_ROW_KEY }] },
      { tag: 'section', attrs: [{ name: 'data-testid', value: 'ignored-by-cap' }] }
    ])
    assert.equal(ancestors.length, 3)
    assert.deepEqual(plain(ancestors[0]), { tag: 'div', attrs: { 'data-slot': 'sidebar' } })
    assert.deepEqual(plain(ancestors[1]), { tag: 'div', attrs: { 'aria-label': 'Session card' } })
    assert.deepEqual(plain(ancestors[2]), { tag: 'span', attrs: { 'data-row-key': REAL_ROW_KEY } })
    // A secret-shaped aria-label is rejected by the attribute sanitizer, so that ancestor is dropped.
    assert.deepEqual(plain(ui.buildStableAncestors([
      { tag: 'div', attrs: [{ name: 'aria-label', value: 'mail alice@example.com' }] },
      { tag: 'body', attrs: [{ name: 'data-slot', value: 'root' }] }
    ])), [])
    assert.deepEqual(plain(ui.buildStableAncestors(null)), [])
  })

  test('A2: buildElementRef v2 carries identity/surface fields and no HTML, styles or query expressions', () => {
    const descriptor = descriptorOf({
      tag: 'div',
      component: 'container',
      name: 'Hover card',
      attrs: [{ name: 'data-row-key', value: REAL_WORKSPACE_KEY }],
      uniqueSelector: `div[data-row-key="${REAL_WORKSPACE_KEY}"]`,
      uniqueVerified: true,
      ancestors: [{ tag: 'div', attrs: [{ name: 'data-slot', value: 'sidebar' }] }]
    })
    const ref = refOf(descriptor, {
      cwd: '/Users/rexxin/Development/dsh-power-suite',
      route: '/session/abc?token=secret#frag',
      viewport: { width: 1728, height: 900 },
      surface: 'floating'
    })
    assert.equal(ref.version, 2)
    assert.equal(ref.locator.surface, 'floating')
    assert.equal(ref.locator.ephemeral, true, 'a floating surface is transient by definition')
    assert.equal(ref.locator.uniqueSelector, `div[data-row-key="${REAL_WORKSPACE_KEY}"]`)
    assert.equal(ref.locator.uniqueVerified, true)
    assert.deepEqual(plain(ref.locator.ancestors), [{ tag: 'div', attrs: { 'data-slot': 'sidebar' } }])
    assert.equal(ref.session.cwd, '/Users/rexxin/Development/dsh-power-suite')
    assert.equal(ref.session.workspaceLabel, 'dsh-power-suite', 'the Workspace label is the cwd basename')
    assert.equal(ref.route, '/session/abc', 'query/fragment never reach the record')
    assert.deepEqual(plain(ref.viewport), { width: 1728, height: 900 })
    assert.equal(ref.updatedAt, ref.at)
    assert.equal(ref.included, true)
    assert.equal(ref.lastStatus, 'resolved')
    const serialized = JSON.stringify(ref)
    for (const forbidden of ['outerHTML', 'innerHTML', 'querySelector', '<div', 'getComputedStyle']) {
      assert.ok(!serialized.includes(forbidden), `record must not contain ${forbidden}`)
    }
    const pageRef = refOf()
    assert.equal(pageRef.locator.surface, 'page')
    assert.equal(pageRef.locator.ephemeral, false)
    assert.equal(pageRef.locator.uniqueSelector, null)
    assert.equal(pageRef.locator.uniqueVerified, false)
    assert.deepEqual(plain(pageRef.locator.ancestors), [])
    assert.equal(pageRef.route, '/', 'an absent route falls back to /')
  })

  test('A2: workspace label and route path helpers keep identity local and query-free', () => {
    assert.equal(ui.annotationWorkspaceLabel('/Users/me/projects/dsh-power-suite'), 'dsh-power-suite')
    assert.equal(ui.annotationWorkspaceLabel('/Users/me/projects/dsh-power-suite/'), 'dsh-power-suite')
    assert.equal(ui.annotationWorkspaceLabel('C:\\work\\plugin'), 'plugin')
    assert.equal(ui.annotationWorkspaceLabel(''), null)
    assert.equal(ui.annotationWorkspaceLabel(null), null)
    assert.equal(ui.annotationWorkspaceLabel('x'.repeat(120)).length, 80)
    assert.equal(ui.annotationRoutePath('/session/abc'), '/session/abc')
    assert.equal(ui.annotationRoutePath('/session/abc?token=secret#x'), '/session/abc')
    assert.equal(ui.annotationRoutePath(''), '/')
    assert.equal(ui.annotationRoutePath('plugins'), '/plugins')
    assert.deepEqual(plain(ui.normalizeAnnotationViewport({ width: 1728, height: 900 })), { width: 1728, height: 900 })
    assert.equal(ui.normalizeAnnotationViewport({ width: 0, height: 900 }), null)
    assert.equal(ui.normalizeAnnotationViewport(null), null)
  })

  test('A2: describeLocator and annotationLocatorText prefer the verified unique selector', () => {
    const ref = refOf({
      tag: 'button',
      name: 'New session',
      attrs: [{ name: 'aria-label', value: 'New session' }],
      uniqueSelector: 'div[data-slot="sidebar"] > div:nth-of-type(1) > button:nth-of-type(1)',
      uniqueVerified: true
    })
    assert.ok(ui.describeLocator(ref).includes('div[data-slot="sidebar"]'))
    assert.equal(ui.annotationLocatorText(ref), 'div[data-slot="sidebar"] > div:nth-of-type(1) > button:nth-of-type(1)')
    const fallback = refOf({ tag: 'button', name: 'Save', attrs: [{ name: 'aria-label', value: 'Save' }] })
    assert.equal(ui.annotationLocatorText(fallback), '[aria-label="Save"]', 'best ordered candidate when no unique selector exists')
    const structural = refOf({ tag: 'div', role: '', name: '', component: 'container' })
    assert.equal(ui.annotationLocatorText(structural), 'div', 'the structural path is the last locator fallback')
  })

  test('A2: resolveRefStatus prefers a verified unique selector and falls back to v1 candidates', () => {
    const uniqueSelector = 'div[data-slot="sidebar"] > button:nth-of-type(1)'
    const ref = refOf({
      tag: 'button',
      name: 'New session',
      attrs: [{ name: 'aria-label', value: 'New session' }],
      uniqueSelector,
      uniqueVerified: true
    })
    const liveInfo = (element) => ({
      isConnected: true,
      expectedText: element.textContent,
      textContent: element.textContent,
      expectedDigest: '',
      actualDigest: '',
      expectedName: 'New session',
      actualName: 'New session'
    })
    const one = { tagName: 'BUTTON', textContent: 'New session' }
    const two = { tagName: 'BUTTON', textContent: 'New session' }
    const base = { candidates: ref.locator.candidates, expectedTag: 'button', liveInfo }
    assert.equal(ui.resolveRefStatus({ ...base, uniqueSelector, queryAll: (selector) => (selector === uniqueSelector ? [one] : []) }), 'resolved')
    assert.equal(ui.resolveRefStatus({ ...base, uniqueSelector, queryAll: (selector) => (selector === uniqueSelector ? [one, two] : []) }), 'ambiguous',
      'a unique selector matching several elements is real ambiguity')
    // Zero unique hits: the v1 label candidate still resolves the control.
    const labelSelector = ref.locator.candidates.find((candidate) => candidate.kind === 'label')?.value
    assert.ok(typeof labelSelector === 'string' && labelSelector.length > 0)
    assert.equal(ui.resolveRefStatus({ ...base, uniqueSelector, queryAll: (selector) => (selector === labelSelector ? [one] : []) }), 'resolved')
  })

  test('A2: a missing ephemeral target serializes its own transient status line', () => {
    const floating = refOf({ name: 'Hover card row' }, { surface: 'floating' })
    const text = ui.serializeQuickReference({ ...floating, status: 'missing' }, 'Fix the row', EN_LABELS)
    const lines = text.replace(/\n+$/, '').split('\n')
    assert.equal(lines[4], EN_LABELS.statusEphemeral)
    const page = refOf({ name: 'Toolbar button' })
    const pageLines = ui.serializeQuickReference({ ...page, status: 'missing' }, 'Fix it', EN_LABELS).replace(/\n+$/, '').split('\n')
    assert.equal(pageLines[4], EN_LABELS.status)
  })

  //#endregion

  //#region D1/D15 persistence: v2 record document and explicit cap

  /**
   * One distinct record for persistence/cap tests.
   * @param {number} index - record index.
   * @returns {object} v2 record.
   */
  const recordAt = (index) => refOf({
    tag: 'button',
    name: `Control ${index}`,
    attrs: [{ name: 'data-row-key', value: `workspace:${String(index).padStart(8, '0')}-0000-4000-8000-000000000000` }]
  }, { order: index, at: 1_700_000_000_000 + index, sessionId: SESSION_A })

  test('D1: normalizeAnnotationRecord whitelists v2, tolerates v1 and drops invalid records', () => {
    const record = {
      ...recordAt(1),
      note: '  keep\nthis  ',
      included: false,
      lastStatus: 'ambiguous',
      extra: 'not persisted',
      outerHTML: '<button>no</button>'
    }
    const normalized = ui.normalizeAnnotationRecord(record, 3)
    assert.equal(normalized.version, 2)
    assert.equal(normalized.note, '  keep\nthis  ', 'the user note survives verbatim')
    assert.equal(normalized.included, false)
    assert.equal(normalized.lastStatus, 'ambiguous')
    assert.equal('extra' in normalized, false)
    assert.equal('outerHTML' in normalized, false)
    assert.equal(normalized.locator.surface, 'page')
    assert.equal(normalized.locator.ephemeral, false)
    assert.equal(normalized.route, '/')
    assert.deepEqual(plain(normalized.session), { sessionId: SESSION_A, cwd: null, workspaceLabel: null })

    const v1 = {
      version: 1,
      id: 'psa-old-1',
      at: 1_700_000_000_000,
      order: 2,
      session: { sessionId: SESSION_A },
      locator: {
        tag: 'button',
        role: 'button',
        name: 'Legacy',
        candidates: [{ kind: 'label', value: '[aria-label="Legacy"]', reliability: 0.8 }],
        key: 'label:[aria-label="Legacy"]|button|button',
        path: 'button'
      },
      component: 'button',
      text: 'Legacy',
      textDigest: 'deadbeef',
      context: '',
      bounds: { x: 1, y: 2, width: 3, height: 4 },
      note: ''
    }
    const upgraded = ui.normalizeAnnotationRecord(v1, 0)
    assert.equal(upgraded.version, 2)
    assert.equal(upgraded.locator.uniqueSelector, null)
    assert.equal(upgraded.locator.uniqueVerified, false)
    assert.deepEqual(plain(upgraded.locator.ancestors), [])
    assert.equal(upgraded.locator.surface, 'page')
    assert.equal(upgraded.id, 'psa-old-1', 'v1 identity is preserved')
    for (const bad of [null, undefined, 'x', [], { id: 'x' }, { version: 9, id: 'x', locator: { tag: 'div', candidates: [{ kind: 'tag', value: 'div', reliability: 0.2 }] } }, { id: 'x', locator: { tag: 'div', candidates: [] } }, { locator: { tag: 'div', candidates: [{ kind: 'tag', value: 'div', reliability: 0.2 }] } }]) {
      assert.equal(ui.normalizeAnnotationRecord(bad), null, `dropped: ${JSON.stringify(bad)}`)
    }
  })

  test('D1: parseAnnotationStore tolerates bad documents and serializeAnnotationStore round-trips', () => {
    const empty = { version: 3, updatedAt: 0, records: [], groups: [], entries: [] }
    for (const bad of [null, undefined, '', 'not json', 'null', '42', '"text"', JSON.stringify({ version: 9, records: [recordAt(1)] })]) {
      assert.deepEqual(plain(ui.parseAnnotationStore(bad)), empty, `empty store for ${String(bad).slice(0, 24)}`)
    }
    const second = recordAt(2)
    const first = recordAt(1)
    const serialized = ui.serializeAnnotationStore([second, first, second], 1_800_000_000_000)
    const parsed = ui.parseAnnotationStore(serialized)
    assert.equal(parsed.version, 3)
    assert.equal(parsed.updatedAt, 1_800_000_000_000)
    assert.deepEqual(plain(parsed.records).map((record) => record.order), [1, 2], 'ordered by order, duplicate ids removed')
    assert.equal(ui.serializeAnnotationStore(parsed.entries, 1_800_000_000_000), serialized, 'serialization is deterministic')
    const many = Array.from({ length: 130 }, (_, index) => recordAt(index))
    const capped = ui.parseAnnotationStore(ui.serializeAnnotationStore(many, 1))
    assert.equal(capped.records.length, 100, 'the store is capped at the total item limit')
    assert.equal(ui.RECORD_LIMIT, 100)
    assert.equal(ui.RECORDS_STORAGE_KEY, 'power-suite.ui-annotation.annotations')
    // A bare legacy array is tolerated but every record is still validated.
    const arrayDoc = ui.parseAnnotationStore(JSON.stringify([recordAt(3), { bogus: true }]))
    assert.equal(arrayDoc.records.length, 1)
    assert.equal(arrayDoc.records[0].order, 3)
  })

  test('D15: collectionAdd refuses the 101st record explicitly and reducer state stays unchanged', () => {
    let list = []
    for (let index = 0; index < 100; index += 1) {
      list = ui.collectionAdd(list, entryOf(recordAt(index), `note ${index}`), 100).list
    }
    assert.equal(list.length, 100)
    const overflow = ui.collectionAdd(list, entryOf(recordAt(999), 'overflow'), 100)
    assert.equal(overflow.rejected, true)
    assert.equal(overflow.added, false)
    assert.equal(overflow.list.length, 100)
    assert.equal(list.length, 100, 'the input list is not mutated')
    // Updating an existing record at the cap is still allowed.
    const updated = ui.collectionAdd(list, entryOf(recordAt(5), 'updated note'), 100)
    assert.equal(updated.rejected, false)
    assert.equal(updated.updated, true)
    let state = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'activate' })
    state = { ...state, collection: list }
    const overflowState = ui.reduceAnnotationState(state, { type: 'collectionAdd', entry: entryOf(recordAt(999), 'overflow') })
    assert.equal(overflowState, state, 'a refused add returns the same state reference')
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

  test('user annotation notes survive verbatim: no redaction, no silent truncation, multi-line preserved', () => {
    const ref = refOf({ tag: 'button', name: 'New session', text: 'New session' })
    const longToken = 'x'.repeat(500)
    const note = `data-psa-launcher https://example.com/path?q=1 123e4567-e89b-12d3-a456-426614174000 user@example.com ${longToken}\nsecond line\r\nthird line`
    const quick = ui.serializeQuickReference(ref, note, EN_LABELS)
    for (const fragment of ['data-psa-launcher', 'https://example.com/path?q=1', '123e4567-e89b-12d3-a456-426614174000', 'user@example.com', longToken]) {
      assert.ok(quick.includes(fragment), `quick reference must preserve ${fragment.slice(0, 24)}`)
    }
    assert.ok(!quick.includes('[redacted]'), 'user note must not run through the page-text scrubber')
    assert.ok(quick.includes('second line\nthird line'), 'multi-line note preserved with normalized LF')

    const batch = ui.serializeBatchRequest([{ ref, note }], EN_LABELS)
    for (const fragment of ['data-psa-launcher', 'https://example.com/path?q=1', longToken]) {
      assert.ok(batch.includes(fragment), `batch request must preserve ${fragment.slice(0, 24)}`)
    }
    assert.ok(batch.includes('second line\nthird line'))
    assert.ok(!batch.includes('[redacted]'))
    assert.ok(!quick.includes('\r'), 'CRLF is normalized to LF')
  })

  test('normalizeUserNote strips NUL/C0 controls but preserves tab, spaces and line breaks', () => {
    const normalized = ui.normalizeUserNote('a\u0000b\u0001c\t  d\r\ne\u007f')
    assert.equal(normalized, 'abc\t  d\ne')
    assert.equal(ui.normalizeUserNote(null), '')
    assert.equal(ui.normalizeUserNote(''), '')
  })

  test('cssIdentifier/escapeSelectorValue use the platform CSS.escape when present', () => {
    // The vm sandbox has no platform CSS by default; inject a sentinel before
    // evaluation. A regression to the factory's local `const CSS` string would
    // skip this path and fail these assertions.
    const platform = loadClientModule({
      globals: {
        CSS: { escape: (value) => `sentinel:${value}` }
      }
    })
    const platformUi = platform.hooks?.uiAnnotation
    assert.equal(platformUi.cssIdentifier('123abc'), 'sentinel:123abc')
    assert.equal(platformUi.cssIdentifier('#123abc'), 'sentinel:#123abc')
    // escapeSelectorValue is not part of the frozen 35-key seam; assert at the
    // source level that it uses the same platform path (the seam count is an
    // E2E smoke gate, so adding a key would break that generation).
    const source = client.source
    const start = source.indexOf('function escapeSelectorValue')
    const end = source.indexOf('function ', start + 10)
    assert.ok(start > 0, 'escapeSelectorValue exists')
    const body = source.slice(start, end)
    assert.ok(body.includes('globalThis.CSS'), 'escapeSelectorValue uses the platform CSS global')
    assert.ok(!/typeof CSS\s*===/.test(body), 'escapeSelectorValue no longer tests the shadowed local CSS string')
  })

  test('cssIdentifier keeps its conservative fallback when the platform CSS is absent', () => {
    assert.equal(ui.cssIdentifier('123abc'), '\\31 23abc')
    assert.equal(ui.cssIdentifier('#123abc'), '\\#123abc')
  })

  test('clampPopoverPositionToViewport re-clamps a pinned position and preserves in-bounds offsets', () => {
    const size = { width: 320, height: 240 }
    const viewport = { width: 1200, height: 800 }
    assert.deepEqual(plain(ui.clampPopoverPositionToViewport({ x: 5000, y: 5000 }, size, viewport, 0)), { x: 872, y: 552 })
    assert.deepEqual(plain(ui.clampPopoverPositionToViewport({ x: 120, y: 90 }, size, viewport, 0)), { x: 120, y: 90 })
    assert.deepEqual(plain(ui.clampPopoverPositionToViewport({ x: -50, y: -50 }, size, viewport, 0)), { x: 8, y: 8 })
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

  //#region A3 Phase 2-A record actions, undo slot, marks and detail card

  /**
   * Build one committable record for the Phase 2-A tests.
   * @param {string} name - accessible name (identity-bearing label).
   * @param {string} [sessionId] - Session identity.
   * @param {object} [overrides] - record overrides.
   * @returns {object} record.
   */
  const recordOf = (name, sessionId = SESSION_A, overrides = {}) => ({
    ...refOf({
      name,
      text: name,
      attrs: [{ name: 'data-testid', value: `psa-${name.toLowerCase()}` }]
    }, { sessionId, at: 1_700_000_000_000, order: 0 }),
    note: '',
    session: { sessionId, cwd: '/Users/dev/workspace-alpha', workspaceLabel: 'workspace-alpha' },
    ...overrides
  })

  test('A3/T5: upsertAnnotationRecord inserts and updates by identity+session while keeping id/at/order', () => {
    const first = recordOf('Alpha')
    const inserted = ui.upsertAnnotationRecord([], first, 100, 1_000)
    assert.equal(inserted.added, true)
    assert.equal(inserted.updated, false)
    assert.equal(inserted.rejected, false)
    assert.equal(inserted.list.length, 1)
    const stored = inserted.list[0]
    assert.equal(stored.id, first.id)
    assert.equal(stored.version, 2)
    assert.equal(stored.updatedAt, 1_000, 'the commit stamp is written')

    const changed = recordOf('Alpha', SESSION_A, { at: 5, order: 99, note: 'new requirement' })
    changed.locator = { ...changed.locator, uniqueSelector: '[data-slot="alpha"]', uniqueVerified: true }
    const updated = ui.upsertAnnotationRecord(inserted.list, changed, 100, 2_000)
    assert.equal(updated.updated, true)
    assert.equal(updated.added, false)
    assert.equal(updated.list.length, 1, 'same identity+session never duplicates')
    const merged = updated.list[0]
    assert.equal(merged.id, stored.id, 'an update preserves the original id')
    assert.equal(merged.at, stored.at, 'an update preserves the captured timestamp')
    assert.equal(merged.order, stored.order, 'an update preserves the collection position')
    assert.equal(merged.note, 'new requirement')
    assert.equal(merged.updatedAt, 2_000)
    assert.equal(merged.locator.uniqueSelector, '[data-slot="alpha"]')
    assert.equal(merged.included, true)
  })

  test('A3/T5: an empty incoming note preserves the existing requirement and the cap refuses explicitly', () => {
    const alpha = recordOf('Alpha', SESSION_A, { note: 'keep me' })
    const committed = ui.upsertAnnotationRecord([], alpha, 100, 1_000).list
    const blankNote = recordOf('Alpha', SESSION_A, { note: '   ' })
    const updated = ui.upsertAnnotationRecord(committed, blankNote, 100, 2_000).list
    assert.equal(updated[0].note, 'keep me', 'a blank re-save must not wipe the requirement')

    const beta = ui.upsertAnnotationRecord(updated, recordOf('Beta'), 2, 3_000)
    assert.equal(beta.list.length, 2)
    const refused = ui.upsertAnnotationRecord(beta.list, recordOf('Gamma'), 2, 4_000)
    assert.equal(refused.rejected, true, 'D15: the 101st/over-cap record is refused')
    assert.equal(refused.added, false)
    assert.equal(refused.list.length, 2, 'a refused commit never changes the list')
    assert.equal(ui.upsertAnnotationRecord([], null, 100, 1).rejected, false, 'invalid input is ignored, not refused')
  })

  test('A3/T5: removeAnnotationRecord and restoreAnnotationRecord round-trip at the original position', () => {
    const alpha = recordOf('Alpha')
    const beta = recordOf('Beta')
    const gamma = recordOf('Gamma')
    const list = [alpha, beta, gamma]
    const removed = ui.removeAnnotationRecord(list, beta.id)
    assert.deepEqual(plain(removed.map((entry) => entry.id)), [alpha.id, gamma.id])
    assert.deepEqual(plain(ui.removeAnnotationRecord(removed, 'psa-missing')), plain(removed), 'a missing id is a no-op')
    const restored = ui.restoreAnnotationRecord(removed, beta, 1)
    assert.deepEqual(plain(restored.map((entry) => entry.id)), [alpha.id, beta.id, gamma.id])
    const appended = ui.restoreAnnotationRecord(removed, beta, 99)
    assert.deepEqual(plain(appended.map((entry) => entry.id)), [alpha.id, gamma.id, beta.id], 'an out-of-range index appends')
  })

  test('A3/T5/D5: the undo slot captures one removal (or a clear) and restores it exactly', () => {
    const alpha = recordOf('Alpha')
    const beta = recordOf('Beta')
    const gamma = recordOf('Gamma')
    const first = ui.annotationUndoRemove([alpha, beta, gamma], beta.id, 'single', 5_000)
    assert.deepEqual(plain(first.list.map((entry) => entry.id)), [alpha.id, gamma.id])
    assert.equal(first.undo.kind, 'single')
    assert.equal(first.undo.index, 1)
    assert.equal(first.undo.at, 5_000)
    assert.equal(first.undo.record.id, beta.id)
    assert.deepEqual(plain(ui.annotationUndoRestore(first.list, first.undo).map((entry) => entry.id)), [alpha.id, beta.id, gamma.id])
    assert.equal(ui.annotationUndoRemove([], 'psa-missing', 'single', 1).undo, null, 'a missing removal yields no undo slot')

    const cleared = ui.annotationUndoRemove([alpha, beta], null, 'clear', 6_000)
    assert.deepEqual(plain(cleared.list), [])
    assert.equal(cleared.undo.kind, 'clear')
    assert.equal(cleared.undo.records.length, 2)
    assert.deepEqual(plain(ui.annotationUndoRestore([], cleared.undo).map((entry) => entry.id)), [alpha.id, beta.id])
    assert.deepEqual(plain(ui.annotationUndoRestore([alpha], cleared.undo).map((entry) => entry.id)), [alpha.id, beta.id], 'restore never duplicates an existing id')
  })

  test('A3/T5: moveAnnotationRecord swaps neighbours, keeps order contiguous, and clamps at the edges', () => {
    const alpha = recordOf('Alpha')
    const beta = recordOf('Beta')
    const gamma = recordOf('Gamma')
    const start = [alpha, beta, gamma]
    const up = ui.moveAnnotationRecord(start, beta.id, -1)
    assert.deepEqual(plain(up.map((entry) => entry.id)), [beta.id, alpha.id, gamma.id])
    assert.deepEqual(plain(up.map((entry) => entry.order)), [0, 1, 2], 'order stays contiguous after a move')
    const down = ui.moveAnnotationRecord(start, beta.id, 1)
    assert.deepEqual(plain(down.map((entry) => entry.id)), [alpha.id, gamma.id, beta.id])
    assert.deepEqual(plain(ui.moveAnnotationRecord(start, alpha.id, -1)), plain(start), 'moving the first record up is a no-op')
    assert.deepEqual(plain(ui.moveAnnotationRecord(start, gamma.id, 1)), plain(start), 'moving the last record down is a no-op')
    assert.deepEqual(plain(ui.moveAnnotationRecord(start, 'psa-missing', 1)), plain(start))
    assert.deepEqual(plain(start.map((entry) => entry.id)), [alpha.id, beta.id, gamma.id], 'the input list is never mutated')
  })

  test('A3/T5: toggleAnnotationInclude flips only the matching record', () => {
    const alpha = recordOf('Alpha')
    const beta = recordOf('Beta')
    const list = [alpha, beta]
    const off = ui.toggleAnnotationInclude(list, beta.id, false)
    assert.equal(off[0].included, true)
    assert.equal(off[1].included, false)
    const same = ui.toggleAnnotationInclude(off, beta.id, false)
    assert.equal(same[1], off[1], 'an unchanged flag keeps the same record reference')
    assert.equal(ui.toggleAnnotationInclude(list, 'psa-missing', false)[0], alpha)
    assert.equal(list[1].included, true, 'the input is never mutated')
  })

  test('A3/T5: the new reducer actions commit, move, include, edit, remove, restore and undo', () => {
    const alpha = recordOf('Alpha')
    const beta = recordOf('Beta')
    let state = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'activate' })
    state = ui.reduceAnnotationState(state, { type: 'annotationCommit', record: alpha, now: 1_000 })
    assert.equal(state.collection.length, 1)
    assert.equal(state.collection[0].updatedAt, 1_000)
    const again = ui.reduceAnnotationState(state, { type: 'annotationCommit', record: alpha, now: 1_000 })
    assert.equal(again.collection.length, 1, 'a re-commit of the same identity never duplicates')
    assert.equal(again.collection[0].id, state.collection[0].id, 'a re-commit keeps the record id')
    state = ui.reduceAnnotationState(state, { type: 'annotationCommit', record: beta, now: 2_000 })
    assert.equal(state.collection.length, 2)
    assert.equal(state.collection[1].updatedAt, 2_000)
    assert.deepEqual(plain(state.collection.map((entry) => entry.order)), [0, 1], 'a new commit gets the next order')

    state = ui.reduceAnnotationState(state, { type: 'annotationInclude', refId: beta.id, included: false })
    assert.equal(state.collection[1].included, false)
    state = ui.reduceAnnotationState(state, { type: 'annotationMove', refId: beta.id, delta: -1 })
    assert.deepEqual(plain(state.collection.map((entry) => entry.id)), [beta.id, alpha.id])
    state = ui.reduceAnnotationState(state, { type: 'annotationUpdateNote', refId: beta.id, note: 'edited', now: 3_000 })
    assert.equal(state.collection[0].note, 'edited')
    assert.equal(state.collection[0].updatedAt, 3_000)
    state = ui.reduceAnnotationState(state, { type: 'annotationRemove', refId: alpha.id })
    assert.equal(state.collection.length, 1)
    state = ui.reduceAnnotationState(state, { type: 'annotationRestore', record: alpha, index: 1 })
    assert.deepEqual(plain(state.collection.map((entry) => entry.id)), [beta.id, alpha.id])
    const cleared = ui.annotationUndoRemove(state.collection, null, 'clear', 4_000)
    const emptied = ui.reduceAnnotationState(state, { type: 'collectionClear' })
    assert.equal(emptied.collection.length, 0)
    state = ui.reduceAnnotationState(emptied, { type: 'annotationUndo', undo: cleared.undo })
    assert.equal(state.collection.length, 2, 'annotationUndo restores a cleared collection')
    state = ui.reduceAnnotationState(state, { type: 'annotationUndo', undo: cleared.undo })
    assert.equal(state.collection.length, 2, 'a repeated undo never duplicates records')
    const deactivated = ui.reduceAnnotationState(state, { type: 'deactivate' })
    assert.equal(deactivated.collection.length, 2, 'records survive deactivation')
  })

  test('A3/T6: annotationMarkerBadgeText keeps one excerpt line and truncates to the cap', () => {
    const empty = ui.annotationMarkerBadgeText('   \n  ')
    assert.deepEqual(plain(empty), { text: '', empty: true, truncated: false })
    assert.deepEqual(plain(ui.annotationMarkerBadgeText('Fix   the   toolbar')), { text: 'Fix the toolbar', empty: false, truncated: false })
    assert.deepEqual(plain(ui.annotationMarkerBadgeText('first line\nsecond line')).text, 'first line')
    const long = ui.annotationMarkerBadgeText('0123456789abcdefghijKLMNOP')
    assert.equal(plain(long).truncated, true)
    assert.equal(plain(long).text.length, 18)
    assert.equal(plain(long).text.endsWith('…'), true)
    assert.equal(plain(ui.annotationMarkerBadgeText('0123456789abcdefghijKLMNOP', 10)).text.length, 10)
    assert.equal(plain(ui.annotationMarkerBadgeText('tab\tand  spaces')).text, 'tab and spaces')
  })

  test('A3/T6: clampDetailCardPosition flips sides/verticals, reserves the rail and clamps margins', () => {
    const viewport = { width: 1728, height: 900 }
    const card = { width: 320, height: 240 }
    const railWidth = 200
    const right = ui.clampDetailCardPosition({ x: 100, y: 100, width: 80, height: 32 }, card, viewport, railWidth)
    assert.deepEqual(plain(right), { x: 188, y: 100, placement: 'right' }, 'prefers the right side, top-aligned')
    const left = ui.clampDetailCardPosition({ x: 1350, y: 100, width: 80, height: 32 }, card, viewport, railWidth)
    assert.equal(plain(left).placement, 'left')
    assert.equal(plain(left).x, 1022)
    assert.ok(plain(left).x + card.width <= viewport.width - railWidth - 8)
    const above = ui.clampDetailCardPosition({ x: 100, y: 850, width: 80, height: 20 }, card, viewport, railWidth)
    assert.equal(plain(above).y, 630, 'a card with no room below is bottom-aligned to the element')
    assert.ok(plain(above).y + card.height <= viewport.height - 8)
    const clamped = ui.clampDetailCardPosition({ x: -100, y: -50, width: 40, height: 20 }, card, viewport, railWidth)
    assert.deepEqual(plain({ x: clamped.x, y: clamped.y }), { x: 8, y: 8 })
    const narrow = ui.clampDetailCardPosition({ x: 300, y: 100, width: 40, height: 20 }, card, { width: 400, height: 300 }, 0)
    assert.equal(plain(narrow).placement, 'left')
    assert.deepEqual(plain({ x: narrow.x, y: narrow.y }), { x: 8, y: 8 })
    for (const rect of [
      { x: 0, y: 0, width: 0, height: 0 },
      { x: 1700, y: 890, width: 20, height: 5 },
      { x: 860, y: 450, width: 10, height: 10 }
    ]) {
      const pos = ui.clampDetailCardPosition(rect, card, viewport, railWidth)
      assert.ok(pos.x >= 8 && pos.y >= 8, `margins respected for ${JSON.stringify(rect)}`)
      assert.ok(pos.x + card.width <= viewport.width - railWidth - 8, 'rail strip respected')
      assert.ok(pos.y + card.height <= viewport.height - 8, 'bottom margin respected')
    }
  })

  //#endregion

  test('A3/T6: the mark overlay is pointer-transparent and the detail card keeps its markers', () => {
    const source = client.source
    assert.equal(typeof source, 'string')
    const cssStart = source.indexOf('const ANNOTATION_CSS')
    assert.ok(cssStart >= 0, 'the annotation stylesheet exists')
    const css = source.slice(cssStart, source.indexOf('\n    `', cssStart))
    assert.ok(css.includes('.psa-mark{'), 'the page mark rule exists')
    const markRule = css.slice(css.indexOf('.psa-mark{'), css.indexOf('}', css.indexOf('.psa-mark{')))
    assert.ok(markRule.includes('pointer-events:none'), 'page marks must never intercept pointer events')
    assert.ok(css.includes('.psa-mark-badge{'), 'the mark badge rule exists')
    assert.ok(css.includes('.psa-detail-card{'), 'the detail card rule exists')
    assert.ok(css.includes('prefers-reduced-motion'), 'reduced-motion handling is present')
    assert.ok(source.includes("'data-psa-mark': ''"), 'marks are rendered with the data-psa-mark marker')
    assert.ok(source.includes("'data-psa-mark-id': mark.id"), 'marks expose their record id')
    assert.ok(source.includes("'data-psa-detail': ''"), 'the detail card is rendered with data-psa-detail')
    assert.ok(source.includes("'data-psa-undo-toast': ''"), 'the delete undo toast is rendered')
    assert.ok(source.includes('role: \'status\''), 'the undo toast is a polite status region')
    assert.ok(source.includes('function AnnotationDetailCard'), 'the detail card component exists')
    assert.ok(source.includes('function annotationMarkElements'), 'the mark element builder exists')
  })

  test('A2/F-2: the Session seat bridges cwd and record capture prefers it over the ctx fallback', () => {
    const source = client.source
    assert.equal(typeof source, 'string')
    const seatStart = source.indexOf('function AnnotationSessionSeat')
    assert.ok(seatStart >= 0, 'the annotation Session seat exists')
    const seatEnd = source.indexOf('\n    function ', seatStart + 'function AnnotationSessionSeat'.length)
    const seat = source.slice(seatStart, seatEnd > 0 ? seatEnd : source.length)
    assert.ok(seat.includes('props.useSessions'), 'the seat must read the slot contract useSessions hook')
    assert.ok(seat.includes('sessionCwd'), 'the seat must derive the Session cwd')
    assert.ok(seat.includes('annotationBridge.sessionCwd'), 'the seat must mirror cwd into the bridge')
    const identityStart = source.indexOf('function sessionIdentity')
    const identityEnd = source.indexOf('\n      function ', identityStart + 'function sessionIdentity'.length)
    const identity = source.slice(identityStart, identityEnd > 0 ? identityEnd : source.length)
    assert.ok(identity.includes('annotationBridge.sessionCwd'), 'record capture must prefer the bridged cwd')
    assert.ok(identity.includes('annotationWorkspaceLabel(annotationBridge.sessionCwd)'), 'the workspace label is the bridged cwd basename')
    assert.ok(identity.includes('annotationIdentityWarned'), 'the fallback failure is reported once instead of swallowed')
    assert.ok(source.includes('const annotationBridge = { sessionId: null, inputActions: null, sessionCwd: null }'),
      'the bridge declares the cwd slot explicitly')
  })

  //#region A3 Phase 2-B rail selection and chip references (T8/T9)

  test('T8: scope counts and selected entries only consider current-Session included records', () => {
    const alpha = recordOf('Alpha')
    const beta = recordOf('Beta', SESSION_A, { included: false })
    const other = recordOf('Gamma', SESSION_B)
    const list = [alpha, beta, other]
    assert.deepEqual(plain(ui.annotationScopeCounts(list, SESSION_A)), {
      current: 2, other: 1, included: 1, otherIncluded: 1, total: 3
    })
    assert.deepEqual(plain(ui.annotationSelectedEntries(list, SESSION_A).map((entry) => entry.id)), [alpha.id])
    assert.deepEqual(plain(ui.annotationSelectedEntries(list, null)), [], 'no current Session means no batch selection')
    beta.included = true
    assert.deepEqual(plain(ui.annotationSelectedEntries(list, SESSION_A).map((entry) => entry.id)), [alpha.id, beta.id], 'insertion order is preserved')
    assert.equal(plain(ui.annotationScopeCounts([], SESSION_A)).total, 0)
  })

  test('T8: annotationApplyIncludes applies many flags in one immutable pass', () => {
    const alpha = recordOf('Alpha')
    const beta = recordOf('Beta')
    const list = [alpha, beta]
    const changed = ui.annotationApplyIncludes(list, [
      { refId: alpha.id, included: false },
      { refId: 'psa-missing', included: true },
      { refId: beta.id, included: false }
    ])
    assert.equal(changed[0].included, false)
    assert.equal(changed[1].included, false)
    assert.equal(list[0].included, true, 'the input list is never mutated')
    const same = ui.annotationApplyIncludes(changed, [{ refId: alpha.id, included: false }])
    assert.equal(same[0], changed[0], 'an unchanged flag keeps the record reference')
    assert.equal(ui.annotationApplyIncludes([], [{ refId: alpha.id, included: false }]).length, 0)
  })

  test('T8/D5: annotationUndoRemoveMany captures original positions and restores all of them', () => {
    const alpha = recordOf('Alpha')
    const beta = recordOf('Beta')
    const gamma = recordOf('Gamma')
    const delta = recordOf('Delta')
    const list = [alpha, beta, gamma, delta]
    const removal = ui.annotationUndoRemoveMany(list, [beta.id, delta.id], 9_000)
    assert.deepEqual(plain(removal.list.map((entry) => entry.id)), [alpha.id, gamma.id])
    assert.equal(removal.undo.kind, 'multi')
    assert.equal(removal.undo.at, 9_000)
    assert.deepEqual(plain(removal.undo.entries.map((item) => item.index)), [1, 3])
    const restored = ui.annotationUndoRestore(removal.list, removal.undo)
    assert.deepEqual(plain(restored.map((entry) => entry.id)), [alpha.id, beta.id, gamma.id, delta.id])
    assert.deepEqual(plain(ui.annotationUndoRemoveMany(list, [], 1)), { list: plain(list), undo: null })
    assert.equal(ui.annotationUndoRemoveMany(list, ['psa-missing'], 1).undo, null)
  })

  test('T8: the rail reducer actions include, move and multi-remove records', () => {
    const alpha = recordOf('Alpha')
    const beta = recordOf('Beta')
    const gamma = recordOf('Gamma')
    let state = ui.reduceAnnotationState(ui.createAnnotationState(), { type: 'activate' })
    for (const record of [alpha, beta, gamma]) state = ui.reduceAnnotationState(state, { type: 'annotationCommit', record, now: 1_000 })
    state = ui.reduceAnnotationState(state, {
      type: 'annotationIncludes',
      changes: [{ refId: alpha.id, included: false }, { refId: gamma.id, included: false }]
    })
    assert.deepEqual(plain(state.collection.map((entry) => entry.included)), [false, true, false])
    state = ui.reduceAnnotationState(state, { type: 'annotationMove', refId: gamma.id, delta: -1 })
    assert.deepEqual(plain(state.collection.map((entry) => entry.id)), [alpha.id, gamma.id, beta.id])
    assert.deepEqual(plain(state.collection.map((entry) => entry.order)), [0, 1, 2], 'the move keeps order contiguous')
    state = ui.reduceAnnotationState(state, { type: 'annotationRemoveMany', refIds: [alpha.id, beta.id] })
    assert.deepEqual(plain(state.collection.map((entry) => entry.id)), [gamma.id])
  })

  test('T9: annotation chip refs round-trip for single and batch group chips', () => {
    const alpha = recordOf('Alpha', SESSION_A, { note: 'first' })
    const beta = recordOf('Beta')
    const single = ui.annotationChipRefOf(alpha)
    assert.equal(single.source, 'ui-annotation')
    assert.equal(single.ref, alpha.id)
    assert.equal(single.label, 'Alpha')
    assert.equal(single.clipboardText, '@Alpha')
    assert.deepEqual(plain(ui.parseAnnotationChipRef(single.ref)), { kind: 'single', id: alpha.id })

    const batch = ui.annotationChipRefBatch([alpha, beta], 'UI annotations × 2')
    assert.equal(batch.source, 'ui-annotation')
    assert.equal(batch.ref, `batch:${alpha.id}|${beta.id}`)
    assert.equal(batch.label, 'UI annotations × 2')
    assert.equal(batch.clipboardText, '@UI annotations × 2')
    assert.deepEqual(plain(ui.parseAnnotationChipRef(batch.ref)), { kind: 'batch', ids: [alpha.id, beta.id] })
    assert.deepEqual(plain(ui.parseAnnotationChipRef('batch:')), { kind: 'batch', ids: [] })
    assert.equal(ui.parseAnnotationChipRef('nonsense'), null)
    assert.equal(ui.parseAnnotationChipRef(''), null)
    assert.equal(ui.parseAnnotationChipRef(null), null)
    assert.deepEqual(plain(ui.parseAnnotationChipRef(`batch:${alpha.id}|not-an-id|${beta.id}`).ids), [alpha.id, beta.id], 'invalid ids are dropped from a batch ref')
  })

  test('T9/D8: annotationChipCandidates lists current-Session records only, described and capped', () => {
    const alpha = recordOf('Alpha', SESSION_A, { note: 'Fix the toolbar\nwith more detail' })
    const beta = recordOf('Beta')
    const other = recordOf('Gamma', SESSION_B)
    const candidates = ui.annotationChipCandidates([alpha, beta, other], SESSION_A)
    assert.deepEqual(plain(candidates.map((candidate) => candidate.name)), ['Alpha', 'Beta'])
    assert.deepEqual(plain(candidates.map((candidate) => candidate.value)), [alpha.id, beta.id], 'the pick value is the record id')
    assert.equal(candidates[0].description, 'Fix the toolbar', 'the description is the first requirement line')
    assert.equal(candidates[1].description, undefined)
    assert.deepEqual(plain(ui.annotationChipCandidates([other], SESSION_A)), [], 'no current-Session record hides the group')
    const prefixed = ui.annotationChipCandidates([alpha, beta], SESSION_A, 20, 'UI annotation · {name}')
    assert.deepEqual(plain(prefixed.map((candidate) => candidate.name)), ['Alpha', 'Beta'], 'the pick/search name stays the raw element label')
    assert.deepEqual(plain(prefixed.map((candidate) => candidate.label)), ['UI annotation · Alpha', 'UI annotation · Beta'],
      'the rendered row self-identifies in the mixed @ list')
    assert.equal(prefixed[0].description, 'Fix the toolbar')
    const many = []
    for (let index = 0; index < 25; index += 1) many.push(recordOf(`Record ${index}`))
    assert.equal(ui.annotationChipCandidates(many, SESSION_A).length, 20, 'D8 caps the group at 20 candidates')
    assert.equal(ui.annotationChipCandidates(many, SESSION_A, 5).length, 5)
  })

  test('T9: serializeAnnotationChip reuses the existing quick-reference and batch formats', () => {
    const alpha = recordOf('Alpha', SESSION_A, { note: 'Fix the toolbar' })
    const beta = recordOf('Beta', SESSION_A, { note: 'Fix the footer' })
    const resolved = () => 'resolved'
    const single = ui.serializeAnnotationChip(alpha.id, [alpha, beta], EN_LABELS, resolved)
    assert.equal(single.missing, 0)
    assert.equal(single.remaining, 1)
    assert.equal(plain(single.text), plain(ui.serializeQuickReference({ ...alpha, status: 'resolved' }, 'Fix the toolbar', EN_LABELS)))
    const batchRef = `batch:${alpha.id}|${beta.id}`
    const batch = ui.serializeAnnotationChip(batchRef, [alpha, beta], EN_LABELS, resolved)
    assert.equal(batch.missing, 0)
    assert.equal(batch.remaining, 2)
    const expected = ui.serializeBatchRequest([
      { ref: { ...alpha, status: 'resolved' }, note: 'Fix the toolbar' },
      { ref: { ...beta, status: 'resolved' }, note: 'Fix the footer' }
    ], { ...EN_LABELS, skippedCount: 0, removedCount: 0 })
    assert.equal(plain(batch.text), plain(expected))
    assert.equal(ui.serializeAnnotationChip('nonsense', [alpha], EN_LABELS, resolved).text, null)
  })

  test('T9/D9: deleted batch members are skipped with an honest removed line; a missing single fails', () => {
    const alpha = recordOf('Alpha', SESSION_A, { note: 'keep' })
    const labels = { ...EN_LABELS, removed: '({count} deleted annotation(s) skipped)', noRemaining: '(nothing remains)' }
    const resolved = () => 'resolved'
    const partial = ui.serializeAnnotationChip(`batch:${alpha.id}|psa-gone-one`, [alpha], labels, resolved)
    assert.equal(partial.missing, 1)
    assert.equal(partial.remaining, 1)
    assert.ok(plain(partial.text).includes('(1 deleted annotation(s) skipped)'), 'the removed count is stated')
    assert.ok(plain(partial.text).includes('1. Alpha'), 'the surviving record is still serialized')
    assert.ok(!plain(partial.text).includes('2. '), 'no block is emitted for a deleted record')
    const gone = ui.serializeAnnotationChip(`batch:psa-gone-one|psa-gone-two`, [alpha], labels, resolved)
    assert.equal(gone.missing, 2)
    assert.equal(gone.remaining, 0)
    assert.equal(plain(gone.text), '(nothing remains)\n')
    const missingSingle = ui.serializeAnnotationChip('psa-gone-one', [alpha], EN_LABELS, resolved)
    assert.equal(missingSingle.text, null, 'a missing single chip returns null so the controller throws/chip goes invalid')
  })

  test('T9: serializeBatchRequest keeps the existing format and adds the removed line only when asked', () => {
    const alpha = recordOf('Alpha')
    const items = [{ ref: { ...alpha, status: 'resolved' }, note: 'n' }]
    const base = ui.serializeBatchRequest(items, EN_LABELS)
    assert.ok(!plain(base).includes('no longer exist'), 'no removed line without removedCount')
    const withRemoved = ui.serializeBatchRequest(items, { ...EN_LABELS, removedCount: 2, skippedCount: 1 })
    assert.ok(plain(withRemoved).includes('(2 annotation(s) no longer exist and were skipped)'))
    assert.ok(plain(withRemoved).includes(EN_LABELS.skipped.replace('{count}', '1')))
    assert.ok(plain(withRemoved).indexOf('no longer exist') < plain(withRemoved).indexOf('other sessions'), 'removed line precedes the skip line')
  })

  test('T9: the chip source hides its group header and self-identifies candidates instead', () => {
    const source = client.source
    assert.equal(typeof source, 'string')
    const start = source.indexOf('function createAnnotationChipSource')
    assert.ok(start >= 0, 'the chip source factory exists')
    const nextFunction = source.indexOf('\n    function ', start + 'function createAnnotationChipSource'.length)
    const factory = source.slice(start, nextFunction > 0 ? nextFunction : source.length)
    assert.ok(factory.includes('showGroupTitle: false'),
      'the source must not render a custom group header (the shell has no annotation menu title and the raw source name would leak)')
    assert.ok(factory.includes('current.chipCandidates(sessionId)'), 'candidates come from the controller helper')
    const candidatesStart = source.indexOf('function chipCandidates(sessionId)')
    const candidatesEnd = source.indexOf('\n      function ', candidatesStart + 'function chipCandidates(sessionId)'.length)
    const controllerCandidates = source.slice(candidatesStart, candidatesEnd > 0 ? candidatesEnd : source.length)
    assert.ok(controllerCandidates.includes("t('chip.candidateLabel')"), 'candidates must use the localized self-identifying label template')
    assert.ok(controllerCandidates.includes('annotationChipCandidates'), 'candidates come from the pure helper')
    assert.ok(source.includes("'chip.candidateLabel': 'UI annotation · {name}'"), 'the EN candidate label prefix exists')
    assert.ok(source.includes("'chip.candidateLabel': 'UI 标注 · {name}'"), 'the ZH candidate label prefix exists')
  })

  test('T9: the chip source contract wires candidates, pick, preview and the serializing codec', () => {
    const source = {
      trigger: '@',
      name: 'ui-annotation',
      candidates: (sessionId) => ui.annotationChipCandidates([recordOf('Alpha')], sessionId),
      parse: ui.parseAnnotationChipRef,
      batch: (records) => ui.annotationChipRefBatch(records, 'UI annotations × 2'),
      serialize: (ref) => ui.serializeAnnotationChip(ref, [recordOf('Alpha')], EN_LABELS, () => 'resolved')
    }
    assert.equal(source.trigger, '@')
    assert.equal(source.name, 'ui-annotation')
    assert.equal(source.candidates(SESSION_A).length, 1)
    assert.deepEqual(plain(source.parse(source.batch([recordOf('Alpha'), recordOf('Beta')]).ref)).kind, 'batch')
    assert.equal(source.serialize('psa-gone-one').text, null)
  })

  test('A3/T29: the launcher hides while active (no dock/flight) and exits are confirmed', () => {
    const source = client.source
    assert.equal(typeof source, 'string')
    assert.equal(source.includes('AnnotationDockedLauncher'), false, 'the docked launcher component/usage must be gone')
    assert.equal(source.includes('data-psa-launcher-docked'), false, 'the docked launcher marker must be gone')
    assert.equal(source.includes('.psa-launcher-docked'), false, 'the docked launcher CSS must be gone')
    assert.equal(source.includes('AnnotationLauncherFlight'), false, 'the flight element component must be gone')
    assert.equal(source.includes('launcherFlight'), false, 'the flight state/helper must be gone')
    assert.ok(source.includes("'data-psa-launcher-hidden': active ? 'true' : 'false'"), 'the launcher exposes its hidden state')
    assert.ok(source.includes("'aria-hidden': active ? 'true' : undefined"), 'the hidden launcher is aria-hidden while active')
    assert.ok(source.includes('.psa-launcher[data-psa-launcher-hidden=true]{'), 'the hidden launcher CSS exists')
    assert.ok(source.includes('transition:opacity 180ms ease,transform 180ms ease'), 'the hide/show transition exists')
    assert.ok(source.includes('.psa-launcher{transition:none}'), 'reduced motion disables the launcher hide/show transition')
    assert.ok(source.includes('idleLauncherPosition = snapshot().launcherPosition'), 'activation remembers the idle floating position')
    assert.ok(source.includes('clampLauncherPosition(restoreLauncher, annotationViewport(), ANNOTATION_LAUNCHER_SIZE)'),
      'deactivation restores the remembered idle position')
    for (const marker of ['function requestExit()', 'function confirmExitClear()', 'function cancelExitConfirm()', 'function AnnotationExitConfirm', "'data-psa-exit-clear': '',", "'data-psa-exit-cancel': '',", 'data-psa-exit-confirm']) {
      assert.ok(source.includes(marker), `exit confirmation must include ${marker}`)
    }
    const confirmStart = source.indexOf('function confirmExitClear()')
    const confirmEnd = source.indexOf('\n      /**', confirmStart)
    const confirm = source.slice(confirmStart, confirmEnd > 0 ? confirmEnd : source.length)
    assert.ok(confirm.includes("dispatch({ type: 'collectionClear' })"), 'confirming must clear all records')
    assert.ok(confirm.includes('flushAnnotationRecords()'), 'confirming must flush the empty persisted document')
    assert.ok(confirm.includes('deactivate()'), 'confirming must exit the mode')
    const footerStart = source.indexOf('function annotationCollectionFooter')
    const footerEnd = source.indexOf('\n    /**', footerStart)
    const footer = source.slice(footerStart, footerEnd > 0 ? footerEnd : source.length)
    assert.ok(footer.includes("t('sidebar.cancelAnnotation')"), 'footer danger label is Cancel Annotation')
    assert.ok(footer.includes('controller.requestExit()'), 'footer danger uses the confirmed exit path')
    assert.ok(source.includes('REMIX_SETTINGS_LINE'), 'settings-line glyph constant exists')
    assert.ok(source.includes("M12 1L21.5 6.5V17.5L12 23L2.5 17.5V6.5L12 1Z"), 'settings-line constant carries the official Remix settings-line path (hexagon + ring), not a different gear glyph')
    assert.ok(source.includes('RemixGlyph(REMIX_SETTINGS_LINE'), 'rail header uses the settings-line glyph')
    assert.ok(source.includes('pointer-events:none') && source.includes('.psa-layer{position:fixed'), 'marks layer remains pointer-transparent')
  })

  test('A3/T21: chat leaf locators anchor to stable message/turn wrappers instead of positional chat paths', () => {
    const expected = '[data-chat-node-key="node-7"] > div:nth-of-type(1) > li:nth-of-type(2)'
    const descriptor = {
      tag: 'li',
      role: 'listitem',
      attrs: [{ name: 'role', value: 'listitem' }],
      anchorPaths: [
        { selector: '[data-chat-node-key="node-7"]', steps: [{ tag: 'div', index: 1 }, { tag: 'li', index: 2 }] },
        { selector: '[data-conversation-region="chat"]', steps: [{ tag: 'div', index: 3 }, { tag: 'ul', index: 1 }, { tag: 'li', index: 2 }] }
      ]
    }
    const queried = []
    const unique = ui.buildUniqueSelector(descriptor, (selector) => {
      queried.push(selector)
      return selector === expected ? [{ tagName: 'LI' }] : []
    })
    assert.equal(unique.verified, true, 'the message-anchored selector must verify as unique')
    assert.equal(unique.selector, expected, 'capture must use the stable message/turn anchor first, not the chat-region nth path')
    assert(queried.some((selector) => selector.includes('data-chat-node-key="node-7"')), 'the real chat-node anchor was never tried')
    const source = client.source
    for (const [listName, attr] of [
      ['UNIQUE_SELECTOR_ATTRIBUTES', 'data-chat-node-key'],
      ['UNIQUE_SELECTOR_ATTRIBUTES', 'data-chat-anchor-key'],
      ['UNIQUE_SELECTOR_ATTRIBUTES', 'data-chat-group-key'],
      ['UNIQUE_SELECTOR_ATTRIBUTES', 'data-chat-turn'],
      ['UNIQUE_SELECTOR_ATTRIBUTES', 'data-chat-flow-key'],
      ['LOCATOR_DATA_ATTRIBUTES', 'data-chat-node-key'],
      ['LOCATOR_DATA_ATTRIBUTES', 'data-chat-anchor-key'],
      ['LOCATOR_DATA_ATTRIBUTES', 'data-chat-group-key'],
      ['LOCATOR_DATA_ATTRIBUTES', 'data-chat-turn'],
      ['LOCATOR_DATA_ATTRIBUTES', 'data-chat-flow-key'],
      ['STABLE_ANCESTOR_ATTRIBUTES', 'data-chat-node-key'],
      ['STABLE_ANCESTOR_ATTRIBUTES', 'data-chat-anchor-key'],
      ['STABLE_ANCESTOR_ATTRIBUTES', 'data-chat-group-key'],
      ['STABLE_ANCESTOR_ATTRIBUTES', 'data-chat-turn'],
      ['STABLE_ANCESTOR_ATTRIBUTES', 'data-chat-flow-key']
    ]) {
      const start = source.indexOf(`const ${listName}`)
      const slice = start >= 0 ? source.slice(start, start + 800) : ''
      assert(start >= 0 && slice.includes(attr), `${listName} must keep ${attr} as a stable anchor`)
    }
  })

  test('A3/T21: chip hover preview is a pointer-transparent tooltip backed by the local record store', () => {
    const source = client.source
    assert(source.includes('function AnnotationChipPreview'), 'the chip hover preview component exists')
    const componentStart = source.indexOf('function AnnotationChipPreview')
    const componentEnd = source.indexOf('\n    /**', componentStart)
    const component = source.slice(componentStart, componentEnd > 0 ? componentEnd : source.length)
    assert(component.includes("role: 'tooltip'"), 'the preview must be a tooltip')
    assert(component.includes("'data-psa-chip-preview': ''"), 'the preview must be queryable for E2E')
    assert(component.includes("annotationLocatorText(record)"), 'the preview shows the recorded locator')
    assert(component.includes("t('detail.position')"), 'the preview shows the captured position box')
    assert(component.includes("controller.statusOf(record)"), 'the preview shows the live resolution status')
    const controllerStart = source.indexOf('function onChipPointerOver')
    const controllerEnd = source.indexOf('\n      /**', controllerStart)
    const controller = source.slice(controllerStart, controllerEnd > 0 ? controllerEnd : source.length)
    assert(controller.includes("'[data-composer-chip=\"ui-annotation\"]'"),
      'only chips rendered with our source get the preview (shell data attribute, no shell modification)')
    assert(controller.includes('chipPreviewModel'), 'the preview reads the local collection, not the network')
    assert(source.includes('.psa-chip-preview{') && /\.psa-chip-preview\{[^}]*pointer-events:none/.test(source),
      'the preview CSS must be pointer-transparent')
    assert(source.includes("document.addEventListener('pointerout'"), 'leaving the chip hides the preview')
    assert(source.includes("document.addEventListener('pointermove'"), 'a stationary re-show after Esc is supported')
    assert(source.includes('function onChipScroll'), 'scrolling a chip ancestor hides the preview')
    const keyStart = source.indexOf('function onKeyDown(event)')
    const keyEnd = source.indexOf('\n      function ', keyStart)
    const keyBody = source.slice(keyStart, keyEnd > 0 ? keyEnd : source.length)
    assert(keyBody.includes('chipPreview !== null') && keyBody.includes('hideChipPreview()'),
      'Esc closes the chip preview before the mode Esc ladder')
  })

  test('A3/T21: the rainbow wrapper hugs the control border box (no bottom baseline gap)', () => {
    const source = client.source
    const rule = /\.psa-rainbow-field > textarea,[\s\S]{0,220}display:block;vertical-align:top/
    assert(rule.test(source), 'wrapped textarea/input/select must render as blocks inside the ring wrapper')
    const start = source.indexOf('.psa-rainbow-field{')
    const end = source.indexOf('}', start)
    const base = source.slice(start, end)
    assert(base.includes('position:relative') && base.includes('display:block'),
      'the ring wrapper must be a relative block so its border box matches the control')
    const after = source.indexOf('.psa-rainbow-field::after{')
    const afterEnd = source.indexOf('}', after)
    const ring = source.slice(after, afterEnd)
    assert(ring.includes('inset:-2px'), 'the ring stays a symmetric 2px band around the control border box')
  })

  test('A3/T22: chat-node anchored selectors survive re-renders and report honest missing/changed', () => {
    const selector = '[data-chat-node-key="node-7"] > div:nth-of-type(1) > li:nth-of-type(2)'
    let elements = [{ tagName: 'LI', isConnected: true, textContent: 'Fixture markdown list item' }]
    const queryAll = (query) => (query === selector ? elements : [])
    const liveInfo = (element) => ({
      isConnected: element.isConnected,
      textContent: element.textContent,
      expectedText: 'Fixture markdown list item',
      expectedDigest: '',
      actualDigest: '',
      expectedName: '',
      actualName: ''
    })
    const resolve = () => ui.resolveRefStatus({
      candidates: [],
      expectedTag: 'li',
      uniqueSelector: selector,
      queryAll,
      liveInfo
    })
    assert.equal(resolve(), 'resolved', 'the chat-node anchored leaf must resolve on first capture')
    // Assistant markdown re-render replaced the li DOM node but kept the chat node.
    elements = [{ tagName: 'LI', isConnected: true, textContent: 'Fixture markdown list item' }]
    assert.equal(resolve(), 'resolved', 'a re-rendered li inside the same chat node must stay resolved')
    // Real content change → Changed (never a fake Resolved).
    elements = [{ tagName: 'LI', isConnected: true, textContent: 'Different content' }]
    assert.equal(resolve(), 'changed', 'changed chat content must report changed')
    // Chat node unmounted/virtualized away → honest Missing.
    elements = []
    assert.equal(resolve(), 'missing', 'a genuinely unmounted chat leaf must report missing')
  })

  test('A3/T24: a multi-selection becomes ONE group with a shared requirement and full item identity', () => {
    const first = recordAt(1)
    const second = recordAt(2)
    const group = ui.annotationGroupFromSelection(
      [{ ...first, session: { sessionId: SESSION_A, cwd: '/repo', workspaceLabel: 'repo' } },
        { ...second, session: { sessionId: SESSION_A, cwd: '/repo', workspaceLabel: 'repo' } }],
      '  Batch requirement  ',
      SESSION_A,
      1_800_000_000_000,
      'psa-group-test'
    )
    assert.equal(group.kind, 'group')
    assert.equal(group.id, 'psa-group-test')
    assert.equal(group.requirement, '  Batch requirement  ', 'the shared requirement is stored verbatim')
    assert.equal(group.items.length, 2)
    assert.deepEqual(group.items.map((item) => item.id), [first.id, second.id], 'each selected element keeps its identity')
    assert.equal(group.items[0].session.sessionId, SESSION_A, 'items keep their session metadata')
    assert(group.items.every((item) => (item.note ?? '') === ''), 'group items have no per-item requirement')
    const collection = ui.collectionAddGroup([], group, 100).list
    assert.equal(collection.length, 1)
    assert.equal(ui.annotationTotalItemCount(collection), 2, 'the cap counts group items, not just entries')
    const flat = ui.annotationFlattenRecords(collection)
    assert.equal(flat.length, 2)
    assert(flat.every((record) => record.note === '  Batch requirement  '), 'marks/chips read the group requirement')
    const found = ui.annotationFindRecord(collection, second.id)
    assert.equal(found.id, second.id, 'group items are resolvable by their record id')
    assert.equal(found.note, '  Batch requirement  ')
    assert.equal(ui.annotationIsGroup(collection[0]), true)
    assert.equal(ui.annotationGroupItems(collection[0]).length, 2)
    // The total cap rejects a group that would exceed 100 elements.
    let full = []
    for (let index = 0; index < 99; index += 1) full = ui.collectionAdd(full, entryOf(recordAt(index), `note ${index}`), 100).list
    const overflowGroup = ui.annotationGroupFromSelection([recordAt(500), recordAt(501)], 'too much', SESSION_A, 1, 'psa-group-overflow')
    const rejected = ui.collectionAddGroup(full, overflowGroup, 100)
    assert.equal(rejected.rejected, true, 'a group over the total item cap is refused')
    assert.equal(rejected.added, false)
  })

  test('A3/T24: the v3 document persists singles+groups and migrates v2 records to singles', () => {
    const single = { ...recordAt(1), note: 'single note' }
    const group = ui.annotationGroupFromSelection([recordAt(2), recordAt(3)], 'group note', SESSION_A, 1_800_000_000_000, 'psa-group-persist')
    const serialized = ui.serializeAnnotationStore([single, group], 1_800_000_000_000)
    const doc = JSON.parse(serialized)
    assert.equal(doc.version, 3, 'the document schema is v3')
    assert.equal(doc.records.length, 1)
    assert.equal(doc.groups.length, 1)
    assert.equal(doc.groups[0].requirement, 'group note')
    assert.equal(doc.groups[0].items.length, 2)
    const parsed = ui.parseAnnotationStore(serialized)
    assert.equal(parsed.version, 3)
    assert.equal(parsed.records.length, 1)
    assert.equal(parsed.groups.length, 1)
    assert.equal(parsed.entries.length, 2, 'entries merge singles and groups')
    assert.equal(parsed.entries.find((entry) => entry.kind === 'group').items.length, 2)
    // v2 documents (and bare arrays) migrate to singles without loss.
    const legacyA = recordAt(7)
    const legacyB = recordAt(8)
    const legacy = ui.parseAnnotationStore(JSON.stringify({ version: 2, records: [legacyA, legacyB] }))
    assert.equal(legacy.version, 3)
    assert.equal(legacy.groups.length, 0)
    assert.deepEqual(plain(legacy.entries.map((entry) => entry.id)), [legacyA.id, legacyB.id])
    // Unknown versions remain tolerated (empty, never throwing).
    assert.deepEqual(plain(ui.parseAnnotationStore(JSON.stringify({ version: 99, records: [recordAt(9)] }))), plain({ version: 3, updatedAt: 0, records: [], groups: [], entries: [] }))
  })

  test('A3/T24: a group batch serializes the shared requirement + numbered element references', () => {
    const group = ui.annotationGroupFromSelection([recordAt(2), recordAt(3)], 'Shared batch requirement', SESSION_A, 1, 'psa-group-serialize')
    const text = ui.serializeBatchEntries([group], {
      groupHeader: 'Group',
      groupRequirement: 'Requirement:',
      groupReference: 'Element:',
      reference: 'Reference:',
      note: 'Note:',
      itemsCountLabel: 'items'
    }, () => 'resolved')
    assert(/Group · 2 items/.test(text), `group header missing: ${text}`)
    assert(/Requirement: Shared batch requirement/.test(text), `shared requirement missing: ${text}`)
    assert(/1\. Element:/.test(text) && /2\. Element:/.test(text), `numbered element references missing: ${text}`)
    assert(/Reference:/.test(text), 'each element keeps its locator reference line')
    assert(!/Note:/.test(text), 'group items must not use per-item Note lines')
    // A single in the same batch keeps its Note line.
    const mixed = ui.serializeBatchEntries([recordAt(1), group], { reference: 'Reference:', note: 'Note:', batchHeader: 'Batch' }, () => 'resolved')
    assert(/1\. /.test(mixed) && /Note:/.test(mixed), `single item block missing: ${mixed}`)
    assert(/Group · 2 items/.test(mixed), 'group block still present in a mixed batch')
  })

  test('A3/T25: sidebar counts/filter/group auto-summary are derived from singles + groups', () => {
    const singleA = { ...recordAt(1), note: 'Single A' }
    const singleB = { ...recordAt(2), note: 'Single B' }
    const group = ui.annotationGroupFromSelection([recordAt(3), recordAt(4)], 'Group title line\nGroup description line', SESSION_A, 1, 'psa-group-sidebar')
    const other = { ...recordAt(5), note: 'Other session', session: { sessionId: 'session-other', cwd: '/x', workspaceLabel: 'x' } }
    const collection = [singleA, group, singleB, other]
    const counts = ui.annotationSidebarCounts(collection, SESSION_A)
    assert.equal(counts.all, 3)
    assert.equal(counts.single, 2)
    assert.equal(counts.group, 1)
    assert.equal(counts.items, 4)
    assert.equal(counts.other, 1)
    assert.equal(ui.annotationFilterEntries(collection, 'single').length, 3, 'single filter returns singles from every scope')
    assert.equal(ui.annotationFilterEntries(collection, 'group').length, 1)
    assert.equal(ui.annotationFilterEntries(collection, 'all').length, 4)
    const summary = ui.annotationGroupSummary(group)
    assert.equal(summary.title, 'Group title line')
    assert.equal(summary.description, 'Group description line')
    const longSummary = ui.annotationGroupSummary({ ...group, requirement: 'x'.repeat(60) })
    assert(longSummary.title.endsWith('…') && longSummary.title.length <= 42, 'long group titles are bounded')
  })

  test('A3/T30: transient-surface pinning eligibility and capture-phase event matching', () => {
    const floatingRef = { locator: { surface: 'floating' }, id: 'psa-float' }
    const pageRef = { locator: { surface: 'page' }, id: 'psa-page' }
    assert.equal(ui.annotationSurfacePinEligible({ selection: [floatingRef] }, true), true, 'a floating selection in active mode must pin')
    assert.equal(ui.annotationSurfacePinEligible({ selection: [pageRef, floatingRef] }, true), true, 'a mixed selection with a floating ref pins')
    assert.equal(ui.annotationSurfacePinEligible({ selection: [pageRef] }, true), false, 'page selections never pin')
    assert.equal(ui.annotationSurfacePinEligible({ selection: [floatingRef] }, false), false, 'pinning only happens while the mode is active')
    assert.equal(ui.annotationSurfacePinEligible({ selection: [] }, true), false, 'empty selections never pin')
    const leaf = { name: 'leaf' }
    const inner = { name: 'inner', contains: (node) => node === leaf || node === inner }
    const pinned = { name: 'pinned', contains: (node) => node === inner || node === pinned || node === leaf }
    const wrapper = { name: 'wrapper', contains: (node) => node === pinned || node === wrapper }
    const outside = { name: 'outside', contains: (node) => node === outside }
    assert.equal(ui.annotationSurfacePinEventMatches(pinned, inner, null), true, 'events from inside the pinned subtree are suppressed')
    assert.equal(ui.annotationSurfacePinEventMatches(pinned, outside, leaf), true, 'events whose relatedTarget is inside are suppressed')
    assert.equal(ui.annotationSurfacePinEventMatches(pinned, wrapper, null), true, 'events on an ancestor wrapper are suppressed')
    assert.equal(ui.annotationSurfacePinEventMatches(pinned, outside, null), false, 'unrelated page events pass through')
    assert.equal(ui.annotationSurfacePinEventMatches(null, leaf, null), false, 'without a pin nothing is suppressed')
  })

  test('A3/T32: quote normalization, XPath/JS path generation, quote matching and scoring', () => {
    assert.equal(ui.annotationNormalizeQuoteText('  a \n  b  '), 'a b')
    assert.equal(ui.annotationNormalizeQuoteText('abcdef', 3), 'abc')
    assert.equal(ui.annotationNormalizeQuoteText(null), '')
    // Fake DOM tree: body > div (id-less) with two spans; the second span's XPath.
    const makeElement = (tag, parent) => {
      const element = {
        tagName: tag.toUpperCase(),
        parentElement: parent ?? null,
        previousElementSibling: null,
        getAttribute: () => null
      }
      return element
    }
    const html = makeElement('html')
    const body = makeElement('body', html)
    const div = makeElement('div', body)
    const spanFirst = makeElement('span', div)
    const spanSecond = makeElement('span', div)
    spanFirst.previousElementSibling = null
    spanSecond.previousElementSibling = spanFirst
    const xpath = ui.annotationXPathOf(spanSecond)
    assert.equal(xpath, '/html[1]/body[1]/div[1]/span[2]', `xpath generation wrong: ${xpath}`)
    const jsSelector = ui.annotationJsPathFor({ selector: '#target' })
    assert.equal(jsSelector, 'document.querySelector("#target")')
    const jsXPath = ui.annotationJsPathFor({ xpath })
    assert(jsXPath.startsWith('document.evaluate(') && jsXPath.includes('XPathResult.FIRST_ORDERED_NODE_TYPE'), `js path fallback wrong: ${jsXPath}`)
    const quote = { exact: 'unique phrase', prefix: 'start ', suffix: ' end' }
    assert.equal(ui.annotationTextQuoteMatches('start unique phrase end', quote), true)
    assert.equal(ui.annotationTextQuoteMatches('start unique phrase end and start unique phrase end', quote), false, 'two matches must not resolve')
    assert.equal(ui.annotationTextQuoteMatches('other unique phrase end', quote), false, 'prefix mismatch must not resolve')
    const score = (kind, value, reliability) => ui.annotationSelectorScore({ kind, value, reliability })
    assert(score('data', '[data-slot="x"]', 0.9) > score('role', '[role="button"]', 0.9), 'stable data beats semantic roles')
    assert(score('label', '[aria-label="X"]', 0.9) > score('role', '[role="button"]', 0.9), 'aria labels beat semantic roles')
    assert(score('role', '[role="button"]', 0.5) > score('tag', 'button', 0.9), 'semantic role beats positional tag')
    assert(score('class', '.stable-class', 0.55) > score('path', 'div > button', 0.9), 'stable classes beat pure positional paths')
    assert(score('tag', 'button', 0.2) > score('path', 'div > button', 0.9), 'tag beats pure positional path')
    // Resolution order: CSS wins when resolved; otherwise XPath, then text quote, then position.
    const base = { candidates: [], expectedTag: 'span', queryAll: () => [] }
    const cssResolved = ui.annotationResolveStatus({ ...base, candidates: [{ kind: 'data', value: '[data-x="1"]', reliability: 0.9 }], queryAll: (selector) => [{ tagName: 'SPAN', isConnected: true }] })
    assert.deepEqual(plain(cssResolved), { status: 'resolved', via: 'css' })
    const viaQuoteFirst = ui.annotationResolveStatus({ ...base, resolveXPath: () => 'resolved', resolveTextQuote: () => 'resolved' })
    assert.deepEqual(plain(viaQuoteFirst), { status: 'resolved', via: 'text-quote' }, 'A3/T34: text quote comes before XPath')
    const viaQuote = ui.annotationResolveStatus({ ...base, resolveXPath: () => null, resolveTextQuote: () => 'changed', resolveTextPosition: () => 'resolved' })
    assert.deepEqual(plain(viaQuote), { status: 'changed', via: 'text-quote' })
    const viaPosition = ui.annotationResolveStatus({ ...base, resolveXPath: () => null, resolveTextQuote: () => null, resolveTextPosition: () => 'ambiguous' })
    assert.deepEqual(plain(viaPosition), { status: 'ambiguous', via: 'text-position' })
    const allFail = ui.annotationResolveStatus({ ...base, resolveXPath: () => null, resolveTextQuote: () => null, resolveTextPosition: () => null })
    assert.deepEqual(plain(allFail), { status: 'missing', via: 'css' }, 'no fallback leaves the honest CSS result')
  })

  test('A3/T33: two-phase resolution prefers a unique candidate over a non-unique high-tier one', () => {
    const queryAll = (selector) => {
      if (selector === '[aria-label="New session"]') return [
        { tagName: 'BUTTON', isConnected: true, textContent: 'New session' },
        { tagName: 'BUTTON', isConnected: true, textContent: 'New session' }
      ]
      if (selector === '[data-slot="sidebar"] button:nth-of-type(1)') return [
        { tagName: 'BUTTON', isConnected: true, textContent: 'New session' }
      ]
      return []
    }
    const liveInfo = (element) => ({
      isConnected: element.isConnected,
      textContent: element.textContent,
      expectedText: 'New session',
      expectedDigest: '',
      actualDigest: '',
      expectedName: '',
      actualName: ''
    })
    const candidates = [
      { kind: 'label', value: '[aria-label="New session"]', reliability: 0.9 },
      { kind: 'path', value: '[data-slot="sidebar"] button:nth-of-type(1)', reliability: 0.5 }
    ]
    assert.equal(ui.resolveRefStatus({ candidates, expectedTag: 'button', queryAll, liveInfo }), 'resolved',
      'a unique lower-tier candidate must win over a non-unique aria-label')
    const ambiguousQuery = () => [
      { tagName: 'BUTTON', isConnected: true, textContent: 'A' },
      { tagName: 'BUTTON', isConnected: true, textContent: 'B' }
    ]
    const ambiguousCandidates = [
      { kind: 'label', value: '[aria-label="X"]', reliability: 0.9 },
      { kind: 'role', value: '[role="button"]', reliability: 0.5 }
    ]
    assert.equal(ui.resolveRefStatus({ candidates: ambiguousCandidates, expectedTag: 'button', queryAll: ambiguousQuery, liveInfo }), 'ambiguous',
      'all-non-unique candidates must be honestly Ambiguous')
    const outcome = ui.annotationResolveStatus({
      candidates: ambiguousCandidates,
      expectedTag: 'button',
      queryAll: ambiguousQuery,
      liveInfo,
      resolveXPath: () => 'ambiguous',
      resolveTextQuote: () => 'resolved',
      resolveTextPosition: () => null
    })
    assert.deepEqual(plain(outcome), { status: 'resolved', via: 'text-quote' }, 'weak XPath ambiguity must not terminate the fallback chain')
  })

  test('A3/T33: generated/hashed classes are rejected while authored classes are kept', () => {
    for (const className of ['_card_bgejw_9', '_portal_bgejw_96', 'YDXeBa_sessionRow', 'hHd-Xa_brand', 'wSkVaW_body', 'psd-hoverPath']) {
      assert.equal(ui.annotationIsGeneratedClass(className), true, `generated class not rejected: ${className}`)
    }
    for (const className of ['annotation-row', 'is-active', 'card', 'workspace-row', 'block__element--modifier']) {
      assert.equal(ui.annotationIsGeneratedClass(className), false, `stable class wrongly rejected: ${className}`)
    }
    const ref = refOf({
      tag: 'button',
      attrs: [{ name: 'data-slot', value: 'sidebar' }],
      uniqueSelector: '[data-testid="unique-anchor"] button:nth-of-type(1)',
      uniqueVerified: true
    })
    assert.equal(ref.locator.key, 'unique:[data-testid="unique-anchor"] button:nth-of-type(1)')
    const nonUnique = refOf({ tag: 'button', attrs: [{ name: 'data-slot', value: 'sidebar' }] })
    assert(nonUnique.locator.key.startsWith('data:'), `non-unique identity should keep the data fallback: ${nonUnique.locator.key}`)
  })

  test('A3/T34: rendered text offsets, quote disambiguation, scoring, full XPath and cache keys', () => {
    // W3 rendered text: block boundary contributes one space + raw offset mapping.
    const rendered = ui.annotationRenderTextChunks([
      { text: '  line one ', rawStart: 0 },
      { text: 'line two', blockBefore: true, rawStart: 11 }
    ])
    assert.equal(rendered.text, 'line one line two')
    assert.deepEqual(plain(rendered.spans.map((span) => ({ start: span.start, end: span.end, rawStart: span.rawStart }))),
      [{ start: 0, end: 8, rawStart: 0 }, { start: 9, end: 17, rawStart: 11 }])
    // W1 disambiguation: duplicate exact text requires context to become unique.
    const scope = 'alpha beta alpha beta gamma'
    const quote = ui.annotationDisambiguateQuote(scope, 'alpha beta', 11, 20)
    assert(quote !== null, 'a unique context should produce a quote')
    assert.equal(quote.exact, 'alpha beta')
    assert(quote.prefix.length > 0 || quote.suffix.length > 0, 'expanded context expected')
    assert.equal(ui.annotationDisambiguateQuote('aa aa', 'aa', 0, 2), null, 'unresolvable duplicate text must drop the quote')
    // W2 scoring thresholds: exact full context ≈1, small edit in 0.5..0.85, unrelated low.
    const full = 'start unique phrase end'
    const scored = ui.annotationScoreQuoteMatches(full, { exact: 'unique phrase', prefix: 'start ', suffix: ' end' })
    assert(scored.length === 1 && scored[0].score >= 0.85, `exact quote with context should score high: ${JSON.stringify(scored)}`)
    const edited = ui.annotationScoreQuoteMatches('start unique phras end', { exact: 'unique phrase', prefix: 'start ', suffix: ' end' })
    assert(edited.length === 1 && edited[0].score >= 0.5 && edited[0].score < 0.85, `small edit should land in 0.5..0.85: ${JSON.stringify(edited)}`)
    assert.equal(ui.annotationLevenshteinWithin('abc', 'abd', 2), 1)
    assert.equal(ui.annotationLevenshteinWithin('abc', 'xyz', 1), 2, 'bounded distance exceeds the bound')
    // P2 full XPath never short-circuits on ids.
    const makeElement = (tag, parent) => ({ tagName: tag.toUpperCase(), parentElement: parent ?? null, previousElementSibling: null, getAttribute: () => 'stable-id' })
    const html = makeElement('html')
    const body = makeElement('body', html)
    const div = makeElement('div', body)
    assert.equal(ui.annotationFullXPathOf(div), '/html[1]/body[1]/div[1]')
    assert.equal(ui.annotationXPathOf(div), '//*[@id="stable-id"]', 'optimized XPath still uses the id short-circuit')
    // P1.5 cache key: same record + same revision shares, revision change invalidates.
    assert.equal(ui.annotationFallbackCacheKey('psa-1', 7), 'psa-1:7')
    assert.equal(ui.annotationFallbackCacheKey('psa-1', 8), 'psa-1:8')
  })

  test('A3/T36: weak-identity structural fallbacks fail closed; strong identity still resolves', () => {
    const iconRecord = {
      tag: 'button',
      locator: {
        tag: 'button', role: 'button', name: 'button', candidates: [{ kind: 'tag', value: 'button', reliability: 0.2 }],
        xpath: '/html[1]/body[1]/div[3]/button[1]', textQuote: null, textPosition: null,
        uniqueSelector: null, uniqueVerified: false
      },
      text: '', textDigest: '811c9dc5'
    }
    assert.equal(ui.annotationHasStrongIdentity(iconRecord), false, 'empty text + tag-derived name is not identity')
    assert.equal(ui.annotationStructuralFallbackStatus(iconRecord, 'resolved'), 'changed', 'weak identity must not claim Resolved via XPath/text-position')
    assert.equal(ui.annotationStructuralFallbackStatus(iconRecord, 'changed'), 'changed')
    const textRecord = { ...iconRecord, text: 'New session', textDigest: 'deadbeef' }
    assert.equal(ui.annotationHasStrongIdentity(textRecord), true)
    assert.equal(ui.annotationStructuralFallbackStatus(textRecord, 'resolved'), 'resolved')
    const namedRecord = { ...iconRecord, locator: { ...iconRecord.locator, name: 'Close dialog' } }
    assert.equal(ui.annotationHasStrongIdentity(namedRecord), true, 'a real accessible name is identity')
    const uniqueRecord = { ...iconRecord, locator: { ...iconRecord.locator, uniqueSelector: '[data-testid="close"]', uniqueVerified: true } }
    assert.equal(ui.annotationHasStrongIdentity(uniqueRecord), true, 'a verified unique locator is identity')
    // Copy decision: live-first, saved fallback, full XPath only with a live node.
    assert.deepEqual(plain(ui.annotationCopyAnchorDecision({ liveText: 'document.querySelector("#x")', storedText: 'saved', full: false })),
      { text: 'document.querySelector("#x")', source: 'live' })
    assert.deepEqual(plain(ui.annotationCopyAnchorDecision({ liveText: '', storedText: '/html[1]/body[1]/div[1]', full: false })),
      { text: '/html[1]/body[1]/div[1]', source: 'saved' })
    assert.deepEqual(plain(ui.annotationCopyAnchorDecision({ liveText: '', storedText: '/saved', full: true })),
      { text: '', source: 'none' }, 'full XPath is never fabricated from a saved anchor')
  })

  test('A3/T36: rendered-text whitespace separators and quote context round-trip', () => {
    const rendered = ui.annotationRenderTextChunks([
      { text: 'Hello', rawStart: 0, rawEnd: 5 },
      { text: ' ', rawStart: 5, rawEnd: 6 },
      { text: 'world', rawStart: 6, rawEnd: 11 }
    ])
    assert.equal(rendered.text, 'Hello world', 'whitespace-only text node must remain a separator')
    assert.deepEqual(plain(rendered.spans.map((span) => ({ start: span.start, rawStart: span.rawStart }))),
      [{ start: 0, rawStart: 0 }, { start: 6, rawStart: 6 }])
    // MINOR-2 round-trip: capture-verified ≤60 context persists through buildElementRef.
    const prefix = 'p'.repeat(60)
    const suffix = 's'.repeat(60)
    const ref = refOf({
      tag: 'span', text: 'quote text',
      textQuote: { exact: 'quote text', prefix, suffix }
    })
    assert.equal(ref.locator.textQuote.prefix.length, 60, 'capture-verified prefix must persist')
    assert.equal(ref.locator.textQuote.suffix.length, 60, 'capture-verified suffix must persist')
    assert(ref.locator.textQuote.prefix.length + ref.locator.textQuote.suffix.length + ref.locator.textQuote.exact.length <= 200)
  })

  test('A3/T38: rendered repeat count, descendant climb matching, confidence labels', () => {
    // ⑤ rendered climb counting is separator-aware.
    const rendered = ui.annotationRenderTextChunks([
      { text: 'Hello', rawStart: 0, rawEnd: 5 },
      { text: 'world', blockBefore: true, rawStart: 5, rawEnd: 10 },
      { text: ' Hello world ', rawStart: 10, rawEnd: 23 }
    ])
    assert.equal(rendered.text, 'Hello world Hello world')
    assert.equal(ui.annotationRenderedTextRepeatCount(rendered.text, 'Hello world'), 2)
    assert.equal(ui.annotationRenderedTextRepeatCount(rendered.text, 'missing'), 0)
    // ③ descendant ancestor signature matching (tag + recorded stable attrs).
    const descendantRef = {
      tag: 'div',
      locator: {
        tag: 'div',
        anchorTarget: 'descendant',
        anchorLeafTag: 'span',
        anchorAncestorChain: ['span', 'p', 'div'],
        anchorSignature: { tag: 'div', attrs: [{ name: 'data-card', value: 'unique' }] }
      }
    }
    assert.equal(ui.annotationDescendantAncestorMatches(descendantRef, { tag: 'div', attrs: { 'data-card': 'unique' } }), true)
    assert.equal(ui.annotationDescendantAncestorMatches(descendantRef, { tag: 'div', attrs: { 'data-card': 'other' } }), false, 'signature mismatch must not match')
    assert.equal(ui.annotationDescendantAncestorMatches(descendantRef, { tag: 'section', attrs: { 'data-card': 'unique' } }), false, 'tag mismatch must not match')
    assert.equal(ui.annotationDescendantAncestorMatches({ tag: 'div', locator: { tag: 'div' } }, { tag: 'div', attrs: {} }), false, 'leaf/self anchors never climb')
    // Run→ancestor climb is represented by validate + climb helpers in the controller;
    // here we pin the tag-chain shape and signature contract.
    const fakeLeaf = { tagName: 'SPAN', parentElement: { tagName: 'P', parentElement: { tagName: 'DIV', parentElement: null } } }
    assert.deepEqual(plain(ui.annotationAncestorTagChain(fakeLeaf, fakeLeaf.parentElement.parentElement)), ['p', 'div'])
    // ② weak-identity confidence + i18n label mapping (statuses unchanged).
    const iconRef = { tag: 'button', locator: { tag: 'button', role: 'button', name: 'button', uniqueSelector: null, uniqueVerified: false }, text: '', textDigest: '811c9dc5' }
    const strongRef = { ...iconRef, text: 'Close', textDigest: 'deadbeef' }
    assert.equal(ui.annotationStatusConfidence(iconRef, { status: 'changed', via: 'xpath' }), 'weak')
    assert.equal(ui.annotationStatusConfidence(iconRef, { status: 'changed', via: 'text-position' }), 'weak')
    assert.equal(ui.annotationStatusConfidence(iconRef, { status: 'changed', via: 'text-quote' }), 'weak', 'A3/T49: weak identity + quote Changed is Unverifiable')
    assert.equal(ui.annotationStatusConfidence(strongRef, { status: 'changed', via: 'xpath' }), 'strong')
    assert.equal(ui.annotationStatusLabelKey('changed', 'weak'), 'status.unverifiableWeak')
    assert.equal(ui.annotationStatusLabelKey('changed', 'strong'), 'popover.status.changed')
    assert.equal(ui.annotationStatusLabelKey('resolved', 'weak'), 'popover.status.resolved')
    // Descendant-anchor metadata persists (capture-side fields).
    const descRef = refOf({
      tag: 'div',
      attrs: [{ name: 'data-card', value: 'unique' }],
      textQuote: { exact: 'Card text', prefix: '', suffix: '' },
      textPosition: null,
      anchorTarget: 'descendant',
      anchorLeafTag: 'span',
      anchorAncestorChain: ['span', 'p', 'div'],
      anchorSignature: { tag: 'div', attrs: [{ name: 'data-card', value: 'unique' }] }
    })
    assert.equal(descRef.locator.anchorTarget, 'descendant')
    assert.equal(descRef.locator.anchorLeafTag, 'span')
    assert.deepEqual(plain(descRef.locator.anchorAncestorChain), ['span', 'p', 'div'])
    assert.deepEqual(plain(descRef.locator.anchorSignature), { tag: 'div', attrs: [{ name: 'data-card', value: 'unique' }] })
    const leafRef = refOf({ tag: 'span' })
    assert.equal(leafRef.locator.anchorTarget, null, 'leaf anchors carry no descendant metadata')
  })

  test('A3/T44: authoritative (terminal) descendant ambiguity cannot be overridden by later fallbacks', () => {
    const base = { candidates: [], expectedTag: 'div', queryAll: () => [] }
    const liveInfo = () => ({ isConnected: true, textContent: '', actualDigest: '', expectedName: '', actualName: '' })
    const terminal = ui.annotationResolveStatus({
      ...base,
      liveInfo,
      resolveTextQuote: () => ({ status: 'ambiguous', terminal: true }),
      resolveTextPosition: () => 'resolved',
      resolveXPath: () => 'resolved'
    })
    assert.deepEqual(plain(terminal), { status: 'ambiguous', via: 'text-quote' },
      'in-scope descendant ambiguity must be terminal; text-position/xpath cannot override it')
    // Self-anchor semantics preserved: a plain weak ambiguity still lets a later
    // strategy resolve (A3/T33/T34 behavior).
    const weak = ui.annotationResolveStatus({
      ...base,
      liveInfo,
      resolveTextQuote: () => 'ambiguous',
      resolveTextPosition: () => 'resolved'
    })
    assert.deepEqual(plain(weak), { status: 'resolved', via: 'text-position' })
    // Empty scope -> the resolver returns terminal only when the scope itself is
    // ambiguous; a normal fallback target still resolves.
    const fallback = ui.annotationResolveStatus({
      ...base,
      liveInfo,
      resolveTextQuote: () => 'resolved',
      resolveTextPosition: () => null,
      resolveXPath: () => null
    })
    assert.deepEqual(plain(fallback), { status: 'resolved', via: 'text-quote' })
  })

  test('A3/T42: captured scope is authoritative for descendant text anchors', () => {
    const a = { id: 'scope-a-target' }
    const b = { id: 'doc-b-target' }
    const decide = (inScope, fallback) => plain(ui.annotationScopeAuthorityOutcome({ inScope, fallback }))
    // 1) unique in-scope target + out-of-scope duplicate → the scope target wins.
    assert.deepEqual(decide({ targets: [a], ambiguous: false }, { targets: [a, b], ambiguous: false }),
      { source: 'scope', target: a, ambiguous: false })
    // 2) two in-scope targets → genuine ambiguity; never downgraded by fallback.
    assert.deepEqual(decide({ targets: [a, b], ambiguous: false }, { targets: [a], ambiguous: false }),
      { source: 'scope', target: null, ambiguous: true })
    // 3) empty scope + one document fallback target → resolved via fallback.
    assert.deepEqual(decide({ targets: [], ambiguous: false }, { targets: [b], ambiguous: false }),
      { source: 'fallback', target: b, ambiguous: false })
    // 4) empty scope + multiple/ambiguous document fallback → ambiguous.
    assert.deepEqual(decide({ targets: [], ambiguous: false }, { targets: [a, b], ambiguous: false }),
      { source: 'fallback', target: null, ambiguous: true })
    assert.deepEqual(decide({ targets: [a], ambiguous: true }, { targets: [a], ambiguous: false }),
      { source: 'scope', target: null, ambiguous: true }, 'scope ambiguity is terminal')
    assert.deepEqual(decide({ targets: [], ambiguous: false }, { targets: [], ambiguous: false }),
      { source: 'none', target: null, ambiguous: false })
  })

  test('A3/T47: stale weak identity rejects look-alikes; quote assertion and ephemeral contract', () => {
    // R1 (i)/(iii): weak identity + generic path candidate matching a same-tag
    // look-alike must be Missing, not a silent Resolved.
    const candidates = [{ kind: 'path', value: 'div > span > svg > use', reliability: 0.1 }]
    const queryAll = () => [{ tagName: 'use', isConnected: true, textContent: '' }]
    const liveInfo = (element) => ({
      isConnected: element.isConnected,
      textContent: '',
      expectedText: '',
      expectedDigest: '811c9dc5',
      actualDigest: '811c9dc5',
      expectedName: '',
      actualName: ''
    })
    const base = { candidates, expectedTag: 'use', queryAll, liveInfo, weakIdentity: true }
    assert.equal(ui.resolveRefStatus(base), 'missing',
      'weak identity must not promote a same-tag generic look-alike to Resolved')
    assert.equal(ui.resolveRefStatus({ ...base, corroborate: () => true }), 'missing',
      'ancestor corroboration alone does not promote an icon-only look-alike without a quote assertion')
    // R1 (ii): quote assertion rejects a structural hit whose content no longer
    // matches the captured quote, even for a strong identity.
    assert.equal(ui.resolveRefStatus({ ...base, weakIdentity: false, assertQuote: () => false }), 'missing',
      'maybeAssertQuote must reject a mismatching structural hit')
    assert.equal(ui.resolveRefStatus({ ...base, weakIdentity: false, assertQuote: () => true }), 'resolved',
      'a corroborated structural hit still resolves')
    // R1 (i): stale unique selector 0 hits -> weak identity -> Missing.
    const stale = {
      ...base,
      weakIdentity: true,
      uniqueSelector: '[data-never]',
      queryAll: (selector) => (selector === '[data-never]' ? [] : [{ tagName: 'use', isConnected: true, textContent: '' }])
    }
    assert.equal(ui.resolveRefStatus(stale), 'missing')
    // R2: ephemeral/floating contract — only visible CSS resolution survives.
    const floatingRef = { locator: { surface: 'floating', ephemeral: true } }
    // A3/T49: surface gone => Missing for ALL outcomes (CSS and text layer).
    assert.deepEqual(plain(ui.annotationEphemeralOutcome(floatingRef, { status: 'changed', via: 'text-quote' })),
      { status: 'missing', via: 'text-quote' }, 'surface gone + text-quote Changed must be Missing')
    assert.deepEqual(plain(ui.annotationEphemeralOutcome(floatingRef, { status: 'resolved', via: 'text-quote' })),
      { status: 'missing', via: 'text-quote' }, 'surface gone + text-quote Resolved must be Missing')
    assert.deepEqual(plain(ui.annotationEphemeralOutcome(floatingRef, { status: 'resolved', via: 'css' })),
      { status: 'missing', via: 'css' }, 'surface gone + CSS outcome must be Missing')
    // Surface present => honest text/CSS outcomes retained.
    assert.deepEqual(plain(ui.annotationEphemeralOutcome(floatingRef, { status: 'changed', via: 'text-quote' }, true)),
      { status: 'changed', via: 'text-quote' }, 'A3/T49: still-present surface keeps honest text Changed')
    assert.deepEqual(plain(ui.annotationEphemeralOutcome(floatingRef, { status: 'resolved', via: 'css' }, true)),
      { status: 'resolved', via: 'css' }, 'still-present surface keeps CSS resolution')
    assert.deepEqual(plain(ui.annotationEphemeralOutcome(floatingRef, { status: 'resolved', via: 'text-quote' }, true)),
      { status: 'resolved', via: 'text-quote' })
    const pageRef = { locator: { surface: 'page', ephemeral: false } }
    assert.deepEqual(plain(ui.annotationEphemeralOutcome(pageRef, { status: 'changed', via: 'xpath' })),
      { status: 'changed', via: 'xpath' })
  })

  test('A3/T49: role+name tier, selector length penalty, matchQuote recall/hint', () => {
    const score = (candidate) => ui.annotationSelectorScore(candidate)
    const dataScore = score({ kind: 'data', value: '[data-testid="x"]', reliability: 0.9 })
    const roleNameScore = score({ kind: 'label', value: '[role="button"][aria-label="Close"]', reliability: 0.9 })
    const idScore = score({ kind: 'id', value: '#close', reliability: 0.9 })
    const classScore = score({ kind: 'class', value: '.close', reliability: 0.9 })
    const nthScore = score({ kind: 'path', value: 'div > button:nth-of-type(2)', reliability: 0.9 })
    assert(dataScore > roleNameScore, 'stable data/id/aria must outrank role+name')
    assert(idScore > roleNameScore, 'role+name has its own tier below stable data/id/aria')
    assert(roleNameScore > classScore, 'role+name must outrank class')
    assert(classScore > nthScore, 'class must outrank nth path')
    // Length penalty: same tier/reliability, longer selector scores lower.
    const short = score({ kind: 'id', value: '#a', reliability: 0.9 })
    const long = score({ kind: 'id', value: '#'.concat('a'.repeat(80)), reliability: 0.9 })
    assert(short > long, 'long selectors must carry a length penalty')
    // matchQuote recall: an edit larger than the old 40%/32 bound is still Changed.
    const longQuote = 'the quick brown fox jumps over the lazy dog'
    const edited = 'the quick brown fix jumps over the lazy dag'
    const matches = ui.annotationScoreQuoteMatches(edited, { exact: longQuote })
    assert(matches.length === 1 && matches[0].score >= 0.5 && matches[0].score < 0.85,
      `a broader approximate scan should find a Changed-range match: ${JSON.stringify(matches)}`)
    // Distance-faded hint: a match near the hint scores higher than a far one.
    const text = 'context one target phrase here and target phrase again later'
    const near = ui.annotationScoreQuoteMatches(text, { exact: 'target phrase' }, text.indexOf('target phrase'))
    const far = ui.annotationScoreQuoteMatches(text, { exact: 'target phrase' }, 0)
    assert(near[0].score > far[near[0].index === far[0].index ? 1 : 0].score || near[0].index === far[0].index,
      'the hint must fade with distance, not add a binary bonus')
  })

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

  test('computeRailWidth follows the compact clamp by default and the wide collection clamp', () => {
    assert.equal(ui.computeRailWidth(1728), 200)
    assert.equal(ui.computeRailWidth(1000), 188)
    assert.equal(ui.computeRailWidth(3000), 236)
    // A3/T25: the collection sidebar is wider: clamp(320, 24vw, 420).
    assert.equal(ui.computeRailWidth(1728, false, 'collection'), 415)
    assert.equal(ui.computeRailWidth(1000, false, 'collection'), 320)
    assert.equal(ui.computeRailWidth(3000, false, 'collection'), 420)
    assert.equal(ui.computeRailWidth(1728, true, 'collection'), 48, 'collapsed wins over the wide view')
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
