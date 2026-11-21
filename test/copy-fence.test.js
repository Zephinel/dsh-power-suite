/**
 * Bilingual UI copy guardrails and edge-value tests (plain-ui-copy).
 *
 * Covers:
 * 1. Dynamic 1:1 key and placeholder parity across every EN/ZH dictionary and
 *    locale/*.json.
 * 2. Text fence over all user-facing EN and ZH strings (no banned modals,
 *    future/conditional tenses, semicolon chains, `(s)` plural hacks, British
 *    spellings, leaked internal names, or untranslated Chinese terms, and
 *    <= 25 words per English sentence).
 * 3. Behavioral and edge-value rendering across 0 / 1 / 2+ counts, localized
 *    group serialization, and parenthetical reason fragments.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ARTIFACTS_EN, ARTIFACTS_ZH } from '../src/browser/artifacts/copy.ts'
import { PSG_EN, PSG_ZH } from '../src/browser/composer-gallery/copy.ts'
import { DW_EN, DW_ZH } from '../src/browser/dynamic-workspaces/stats.ts'
import { INTERRUPTED_EN, INTERRUPTED_ZH } from '../src/browser/interrupted-sessions/copy.ts'
import { PROMPT_HISTORY_PREVIEW_EN, PROMPT_HISTORY_PREVIEW_ZH } from '../src/browser/prompt-history/preview.ts'
import { SETTINGS_EN, SETTINGS_ZH } from '../src/browser/settings/copy.ts'
import { ANNOTATION_EN, ANNOTATION_ZH } from '../src/browser/ui-annotation/copy.ts'
import { annotationInsertLabels } from '../src/browser/ui-annotation/dom.ts'
import {
  serializeAnnotationChip,
  serializeBatchEntries,
  serializeBatchRequest,
  serializeQuickReference
} from '../src/browser/ui-annotation/serializers.ts'
import { UPDATE_EN, UPDATE_ZH } from '../src/browser/update-check/install.ts'
import { PRESET_EN, PRESET_ZH } from '../src/browser/workspace-presets/copy.ts'

/** All 9 bilingual browser copy namespaces. */
const DICTIONARIES = [
  ['sessionArtifacts', ARTIFACTS_EN, ARTIFACTS_ZH],
  ['composerImageGallery', PSG_EN, PSG_ZH],
  ['dynamicWorkspaces', DW_EN, DW_ZH],
  ['powerSuiteInterrupted', INTERRUPTED_EN, INTERRUPTED_ZH],
  ['powerSuitePromptHistoryPreview', PROMPT_HISTORY_PREVIEW_EN, PROMPT_HISTORY_PREVIEW_ZH],
  ['powerSuiteSettings', SETTINGS_EN, SETTINGS_ZH],
  ['uiAnnotation', ANNOTATION_EN, ANNOTATION_ZH],
  ['powerSuiteUpdate', UPDATE_EN, UPDATE_ZH],
  ['workspacePresets', PRESET_EN, PRESET_ZH]
]

/** Sorted `{name}` placeholders of one template string. */
const placeholdersOf = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

/** Bind a dictionary to a `t(key, params)` helper. */
function bindT(dict) {
  return (key, params) => {
    const raw = dict[key]
    assert.notEqual(raw, undefined, `missing key ${key}`)
    if (!params) return raw
    return raw.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])))
  }
}

test('every EN and ZH dictionary has 1:1 key and placeholder parity', () => {
  for (const [ns, en, zh] of DICTIONARIES) {
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort(), `${ns} EN/ZH key sets match`)
    for (const key of Object.keys(en)) {
      assert.ok(en[key].length > 0, `${ns} EN ${key} is non-empty`)
      assert.ok(zh[key].length > 0, `${ns} ZH ${key} is non-empty`)
      assert.doesNotMatch(en[key], /\n/, `${ns} EN ${key} stays single-line`)
      assert.doesNotMatch(zh[key], /\n/, `${ns} ZH ${key} stays single-line`)
      assert.deepEqual(
        placeholdersOf(zh[key]),
        placeholdersOf(en[key]),
        `${ns}.${key} placeholder parity`
      )
    }
  }
  const localeEn = JSON.parse(readFileSync(new URL('../locale/en.json', import.meta.url), 'utf8'))
  const localeZh = JSON.parse(readFileSync(new URL('../locale/zh.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(localeZh.meta).sort(), Object.keys(localeEn.meta).sort())
})

test('every dictionary key is referenced by the browser sources (no dead copy)', () => {
  const srcRoot = fileURLToPath(new URL('../src', import.meta.url))
  const collect = (dir) => {
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...collect(p))
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) out.push(p)
    }
    return out
  }
  const sourceFiles = collect(srcRoot).filter(
    (p) => !p.endsWith('/copy.ts') && !p.endsWith('\\copy.ts')
  )
  let source = sourceFiles.map((p) => readFileSync(p, 'utf8')).join('\n')
  // Strip the two inline dictionary blocks (`DW_EN`/`DW_ZH`, `PROMPT_HISTORY_PREVIEW_*`, `UPDATE_*`)
  // before checking that every key is referenced at a call site.
  source = source
    .replace(/export const DW_EN[\s\S]*?export const DW_ZH[\s\S]*?\n\}/, '')
    .replace(/export const PROMPT_HISTORY_PREVIEW_EN[\s\S]*?export const PROMPT_HISTORY_PREVIEW_ZH[\s\S]*?\n\}/, '')
    .replace(/export const UPDATE_EN[\s\S]*?export const UPDATE_ZH[\s\S]*?\n\}/, '')

  for (const [ns, en] of DICTIONARIES) {
    for (const key of Object.keys(en)) {
      if (source.includes(`'${key}'`) || source.includes(`"${key}"`)) continue
      const parts = key.split('.')
      let dynamicMatch = false
      for (let i = 1; i < parts.length; i += 1) {
        const prefix = `${parts.slice(0, i).join('.')}.`
        if (source.includes(`\`${prefix}\${`)) {
          dynamicMatch = true
          break
        }
      }
      assert.ok(dynamicMatch, `${ns}.${key} is unused in browser sources`)
    }
  }
})

test('English UI copy passes the plain-ui-copy text fence', () => {
  const bannedEn = [
    ['modal-may', /\b(may|might)\b/i],
    ['filler-word', /\b(please|simply|just|easily|sorry|oops|uh-oh)\b/i],
    ['future-conditional', /\b(would|will)\b/i],
    ['semicolon-chain', /;/],
    ['plural-s-hack', /\(s\)/i],
    ['double-punctuation', /(?<!\.)\.\.(?!\.)|\.\)\.|!\.|\?\./],
    ['british-spelling', /\b(colour|cancelled|neighbour)\b/i],
    ['internal-leak', /\b(Host-synced|delivers with present|Primary is)\b/],
    ['coined-weak-identity', /\bweak identity\b/i],
    ['non-native-hover', /\bHover this session\b/]
  ]
  const localeEn = JSON.parse(readFileSync(new URL('../locale/en.json', import.meta.url), 'utf8'))
  const entries = [
    ['locale/en.json:meta.title', localeEn.meta.title],
    ['locale/en.json:meta.description', localeEn.meta.description],
    ...DICTIONARIES.flatMap(([ns, en]) => Object.entries(en).map(([k, v]) => [`${ns}.${k}`, v]))
  ]
  for (const [id, text] of entries) {
    for (const [rule, pattern] of bannedEn) {
      assert.doesNotMatch(text, pattern, `${id} violated ${rule}: ${JSON.stringify(text)}`)
    }
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const words = sentence.match(/[A-Za-z][A-Za-z0-9'-]*/g) ?? []
      assert.ok(words.length <= 25, `${id} sentence exceeds 25 words (${words.length}): ${JSON.stringify(sentence)}`)
    }
  }
})

test('Chinese UI copy passes the plain-ui-copy text fence and unified vocabulary', () => {
  const bannedZh = [
    ['untranslated-session', /\bSession\b/],
    ['untranslated-workspace', /\bWorkspace\b/],
    ['untranslated-running-recent', /Running & recent/],
    ['old-panel-name', /进行中与最近活跃/],
    ['internal-primary', /\bPrimary\b/],
    ['internal-present', /\bpresent\b/],
    ['internal-host-sync', /Host 同步/],
    ['coined-weak-identity', /弱身份/],
    ['coined-chip-control', /引用控件|\bchip\b/i],
    ['mixed-annotation-synonyms', /标记需求|更新需求|添加需求|编辑需求|尚未填写需求|分组要求|整组共用的要求/]
  ]
  const localeZh = JSON.parse(readFileSync(new URL('../locale/zh.json', import.meta.url), 'utf8'))
  const entries = [
    ['locale/zh.json:meta.title', localeZh.meta.title],
    ['locale/zh.json:meta.description', localeZh.meta.description],
    ...DICTIONARIES.flatMap(([ns, , zh]) => Object.entries(zh).map(([k, v]) => [`${ns}.${k}`, v]))
  ]
  for (const [id, text] of entries) {
    for (const [rule, pattern] of bannedZh) {
      assert.doesNotMatch(text, pattern, `${id} violated ${rule}: ${JSON.stringify(text)}`)
    }
  }
})

test('settings hints only quote option labels and panel names that exist on screen', () => {
  assert.ok(SETTINGS_EN['history.groupHint'].includes(SETTINGS_EN['modifier.primary']))
  assert.ok(SETTINGS_EN['history.groupHint'].includes(SETTINGS_EN['modifier.alt']))
  assert.ok(SETTINGS_ZH['history.groupHint'].includes(SETTINGS_ZH['modifier.primary']))
  assert.ok(SETTINGS_ZH['history.groupHint'].includes(SETTINGS_ZH['modifier.alt']))
  assert.ok(SETTINGS_EN['dynamic.groupHint'].includes(DW_EN['panel.title']))
  assert.ok(SETTINGS_ZH['dynamic.groupHint'].includes(DW_ZH['panel.title']))
  assert.ok(SETTINGS_EN['recent.current'].includes(DW_EN['panel.title']))
  assert.ok(SETTINGS_ZH['recent.current'].includes(DW_ZH['panel.title']))
  assert.ok(SETTINGS_EN['dynamic.groupHint'].includes(DW_EN['group.active']))
  assert.ok(SETTINGS_ZH['dynamic.groupHint'].includes(DW_ZH['group.active']))
  assert.ok(SETTINGS_EN['active.current'].includes(DW_EN['group.inactive']))
  assert.ok(SETTINGS_ZH['active.current'].includes(DW_ZH['group.inactive']))
})

test('annotationInsertLabels wires localized group labels and 1 vs N plural forms', () => {
  const enLabels = annotationInsertLabels(bindT(ANNOTATION_EN))
  const zhLabels = annotationInsertLabels(bindT(ANNOTATION_ZH))

  const itemA = {
    id: 'psa-a',
    tag: 'button',
    name: 'Save',
    locator: { css: 'button.save' },
    session: { sessionId: 'session-1' }
  }
  const itemB = {
    id: 'psa-b',
    tag: 'button',
    name: 'Cancel',
    locator: { css: 'button.cancel' },
    session: { sessionId: 'session-1' }
  }
  const groupOne = { kind: 'group', id: 'psa-g1', requirement: 'Align buttons', items: [itemA] }
  const groupTwo = { kind: 'group', id: 'psa-g2', requirement: '统一高度', items: [itemA, itemB] }

  const enOne = serializeBatchEntries([groupOne], { ...enLabels, skippedCount: 1, removedCount: 1 })
  assert.ok(enOne.includes('Group · 1 item'), enOne)
  assert.ok(enOne.includes('Shared change: Align buttons'), enOne)
  assert.ok(enOne.includes('(1 annotation from another session skipped)'), enOne)
  assert.ok(enOne.includes('(1 deleted annotation skipped)'), enOne)
  assert.ok(!enOne.includes('1 items'), enOne)

  const enTwo = serializeBatchEntries([groupTwo], { ...enLabels, skippedCount: 2, removedCount: 2 })
  assert.ok(enTwo.includes('Group · 2 items'), enTwo)
  assert.ok(enTwo.includes('(2 annotations from other sessions skipped)'), enTwo)
  assert.ok(enTwo.includes('(2 deleted annotations skipped)'), enTwo)

  const zhTwo = serializeBatchEntries([groupTwo], { ...zhLabels, skippedCount: 1, removedCount: 1 })
  assert.ok(zhTwo.includes('分组 · 2 项'), zhTwo)
  assert.ok(zhTwo.includes('共用修改说明：统一高度'), zhTwo)
  assert.ok(zhTwo.includes('1. 元素：'), zhTwo)
  assert.ok(zhTwo.includes('（已跳过 1 条来自其他会话的标注）'), zhTwo)
  assert.ok(zhTwo.includes('（已跳过 1 条已删除的标注）'), zhTwo)

  // serializeBatchRequest and serializeAnnotationChip also respect 1 vs N.
  const batchOneSkip = serializeBatchRequest([{ ref: itemA, note: 'Fix' }], { ...enLabels, skippedCount: 1 })
  assert.ok(batchOneSkip.includes('(1 annotation from another session skipped)'), batchOneSkip)
  const chipPartial = serializeAnnotationChip('batch:psa-a|psa-missing', [itemA], enLabels)
  assert.ok(chipPartial.text?.includes('(1 deleted annotation skipped)'), chipPartial.text ?? '')
})

test('relocate failure reason fragments stay lowercase without trailing periods', () => {
  const tEn = bindT(ANNOTATION_EN)
  const tZh = bindT(ANNOTATION_ZH)
  for (const status of ['resolved', 'ambiguous', 'missing', 'changed']) {
    const enReason = tEn(`feedback.relocateReason.${status}`)
    assert.equal(enReason, enReason.toLowerCase(), `EN relocateReason.${status} is lowercase`)
    assert.ok(!enReason.endsWith('.'), `EN relocateReason.${status} has no trailing period`)
    const enMsg = tEn('feedback.relocateFailed', { status: enReason })
    assert.doesNotMatch(enMsg, /\([A-Z]|\.\)/, enMsg)

    const zhReason = tZh(`feedback.relocateReason.${status}`)
    assert.ok(!zhReason.endsWith('。'), `ZH relocateReason.${status} has no trailing period`)
    const zhMsg = tZh('feedback.relocateFailed', { status: zhReason })
    assert.doesNotMatch(zhMsg, /。）/, zhMsg)
  }
})

test('serializer default fallbacks stay aligned with ANNOTATION_EN', () => {
  const floating = {
    id: 'psa-f1',
    tag: 'button',
    name: 'Pin',
    locator: { css: 'button.pin', ephemeral: true },
    session: { sessionId: 'session-1' },
    status: 'missing'
  }
  const quick = serializeQuickReference(floating, 'Fix spacing', {})
  assert.ok(quick.includes(ANNOTATION_EN['insert.note']), quick)
  assert.ok(quick.includes(ANNOTATION_EN['insert.statusEphemeral']), quick)
  assert.ok(!quick.includes('Note:'), quick)

  const batch = serializeBatchRequest([{ ref: floating, note: 'Fix spacing' }], {})
  assert.ok(batch.startsWith(ANNOTATION_EN['insert.batchHeader']), batch)
  assert.ok(batch.includes(ANNOTATION_EN['insert.note']), batch)
  assert.ok(batch.includes(ANNOTATION_EN['insert.statusEphemeral']), batch)
  assert.ok(!batch.includes('Note:'), batch)

  const entries = serializeBatchEntries(
    [
      { ...floating, note: 'Fix spacing' },
      { kind: 'group', id: 'psa-g1', requirement: 'Align items', items: [floating] }
    ],
    {},
    () => 'missing'
  )
  assert.ok(entries.startsWith(ANNOTATION_EN['insert.batchHeader']), entries)
  assert.ok(entries.includes(ANNOTATION_EN['insert.note']), entries)
  assert.ok(entries.includes(ANNOTATION_EN['insert.groupRequirement']), entries)
  assert.ok(entries.includes(ANNOTATION_EN['insert.statusEphemeral']), entries)
  assert.ok(!entries.includes('Note:'), entries)
})
