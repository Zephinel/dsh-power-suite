/**
 * Pure insertion-text and composer-chip model for UI-element annotation.
 *
 * Everything the annotation mode inserts into the Composer is written here:
 * the quick-reference block, the ordered batch request (including mixed
 * singles + batch groups), the chip refs that travel through the shell's
 * `@` source, their parse/round-trip rules, the current-Session candidate
 * list, and the model text a chip expands back into. Labels are passed in
 * already localized; this module never reads the DOM, storage or dictionaries.
 *
 * @module
 */

import { annotationJoinLabel, formatAnnotationTime, sessionShortLabel } from './format.ts'
import { describeLocator, elementLabel } from './identity.ts'
import { normalizeUserNote } from './text.ts'
import {
  ANNOTATION_CHIP_REF_PATTERN,
  annotationFlattenRecords,
  annotationGroupItems,
  annotationIsGroup,
  annotationMarkerBadgeText
} from './records.ts'
import type { AnnotationCollectionEntry } from './records.ts'

/** A3/T9: the composer trigger source that owns annotation reference chips. */
export const ANNOTATION_CHIP_SOURCE = 'ui-annotation'

/** A3/T9: at most this many current-Session candidates appear in the menu (D8). */
export const ANNOTATION_CHIP_CANDIDATE_LIMIT = 20

/** A3/T9: a batch chip ref is `batch:<id>|<id>…`. */
export const ANNOTATION_CHIP_BATCH_PREFIX = 'batch:'

/** One ReferenceInsert chip payload the shell's trigger source renders. */
export interface AnnotationChipRef {
  source: string
  ref: string
  label: string
  clipboardText: string
}

/** One parsed chip ref: a single record id or an ordered batch of ids. */
export type AnnotationParsedChipRef =
  | { kind: 'single'; id: string }
  | { kind: 'batch'; ids: string[] }

/** One `@` menu candidate for the annotation source. */
export interface AnnotationChipCandidate {
  name: string
  label: string
  value: string
  description?: string
}

/** Outcome of expanding one chip back into insertion text. */
export interface AnnotationChipSerialization {
  text: string | null
  missing: number
  remaining: number
}

/** Read an untrusted value as a plain record, or an empty record. */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

/** Read an untrusted value as a plain record, or null. */
function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

/**
 * The element ref carried by one `{ ref, note }` batch item (or the item itself).
 * @param item - batch item or bare ref.
 * @returns the ref-shaped value.
 */
function refOfItem(item: unknown): unknown {
  const source = recordOrNull(item)
  if (source !== null) {
    const ref = source.ref
    if (ref !== null && typeof ref === 'object') return ref
  }
  return item
}

/**
 * The requested-change text of one batch item.
 * @param item - batch item or bare ref.
 * @param ref - the item's resolved ref.
 * @returns the item note when present, else the ref note, else an empty string.
 */
function noteOfItem(item: unknown, ref: unknown): unknown {
  const source = recordOrNull(item)
  if (source !== null && typeof source.note === 'string') return source.note
  return recordOrNull(ref)?.note ?? ''
}

/**
 * Whether one ref targets a transient floating surface.
 * @param ref - ElementRef-shaped value.
 * @returns true only for `locator.ephemeral === true`.
 */
function isEphemeralRef(ref: unknown): boolean {
  const locator = recordOrNull(recordOrNull(ref)?.locator)
  return locator !== null && locator.ephemeral === true
}

/**
 * The Session identity carried by one ref.
 * @param ref - ElementRef-shaped value.
 * @returns the session id, or null.
 */
function sessionIdOf(ref: unknown): unknown {
  const session = recordOrNull(recordOrNull(ref)?.session)
  return session !== null ? session.sessionId ?? null : null
}

/**
 * Serialize one batch group block (A3/T24): the shared requirement first, then
 * the numbered element references with their honest status lines (no per-item
 * Note lines, because items have no individual requirements).
 * @param group - group entry.
 * @param items - `[{ ref: { ...record, status } }]` children.
 * @param labels - insertion labels (reference/status/groupHeader/items).
 * @returns group block text (no trailing blank line).
 */
function serializeGroupBlock(group: unknown, items: readonly unknown[], labels: unknown): string {
  const source = asRecord(labels)
  const reference = typeof source.reference === 'string' ? source.reference : 'Reference:'
  const requirementLabel = typeof source.groupRequirement === 'string' ? source.groupRequirement : 'Requirement:'
  const referenceLabel = typeof source.groupReference === 'string' ? source.groupReference : 'Element:'
  const groupHeader = typeof source.groupHeader === 'string' ? source.groupHeader : 'Group'
  const statusLabel = typeof source.status === 'string' ? source.status : 'Status: target no longer resolves (locator only)'
  const statusEphemeral = typeof source.statusEphemeral === 'string' ? source.statusEphemeral : 'Status: transient surface no longer present (locator only)'
  const statusAmbiguous = typeof source.statusAmbiguous === 'string' ? source.statusAmbiguous : 'Status: target matches more than one element (locator only)'
  const statusChanged = typeof source.statusChanged === 'string' ? source.statusChanged : 'Status: target content changed'
  const requirement = normalizeUserNote(annotationIsGroup(group) ? group.requirement : '')
  const lines = [`${groupHeader} · ${items.length} ${String(source.itemsCountLabel ?? 'items')}`]
  lines.push(`   ${annotationJoinLabel(requirementLabel, requirement || (typeof source.emptyNote === 'string' ? source.emptyNote : '—'))}`)
  items.forEach((item, index) => {
    const ref = refOfItem(item)
    if (ref === null || typeof ref !== 'object') return
    lines.push(`   ${index + 1}. ${annotationJoinLabel(referenceLabel, elementLabel(ref))}`)
    lines.push(`      ${annotationJoinLabel(reference, describeLocator(ref))}`)
    const status = recordOrNull(ref)?.status
    const ephemeral = isEphemeralRef(ref)
    if (status === 'missing') lines.push(`      ${ephemeral ? statusEphemeral : statusLabel}`)
    else if (status === 'ambiguous') lines.push(`      ${statusAmbiguous}`)
    else if (status === 'changed') lines.push(`      ${statusChanged}`)
  })
  return lines.join('\n')
}

/**
 * The chip reference (ReferenceInsert) for one annotation record (A3/T9).
 * @param record - annotation record.
 * @returns chip insertion.
 */
export function annotationChipRefOf(record: unknown): AnnotationChipRef {
  const source = recordOrNull(record)
  const label = elementLabel(record) || 'UI annotation'
  return {
    source: ANNOTATION_CHIP_SOURCE,
    ref: source !== null && typeof source.id === 'string' ? source.id : '',
    label,
    clipboardText: `@${label}`
  }
}

/**
 * The ONE group chip reference for a batch insert (D2: per-item chips rejected).
 * @param entries - selected current-Session records, insertion order.
 * @param label - localized batch label (`UI annotations × N`).
 * @returns chip insertion.
 */
export function annotationChipRefBatch(entries: unknown, label?: unknown): AnnotationChipRef {
  const ids = (Array.isArray(entries) ? entries : [])
    .map((entry) => (entry !== null && typeof entry === 'object' ? (entry as AnnotationCollectionEntry).id : null))
    .filter((id): id is string => typeof id === 'string' && ANNOTATION_CHIP_REF_PATTERN.test(id))
  const text = typeof label === 'string' && label.length > 0 ? label : `UI annotations × ${ids.length}`
  return {
    source: ANNOTATION_CHIP_SOURCE,
    ref: `${ANNOTATION_CHIP_BATCH_PREFIX}${ids.join('|')}`,
    label: text,
    clipboardText: `@${text}`
  }
}

/**
 * Parse one annotation chip ref (`<record-id>` or `batch:<id>|<id>…`).
 * @param ref - chip ref string.
 * @returns parsed ref, or null when the shape is invalid.
 */
export function parseAnnotationChipRef(ref: unknown): AnnotationParsedChipRef | null {
  if (typeof ref !== 'string' || ref.length === 0) return null
  if (ref.startsWith(ANNOTATION_CHIP_BATCH_PREFIX)) {
    const ids = ref.slice(ANNOTATION_CHIP_BATCH_PREFIX.length).split('|').filter((id) => ANNOTATION_CHIP_REF_PATTERN.test(id))
    return { kind: 'batch', ids }
  }
  return ANNOTATION_CHIP_REF_PATTERN.test(ref) ? { kind: 'single', id: ref } : null
}

/**
 * Menu candidates for the annotation `@` group: current-Session records only,
 * insertion order, capped at D8's 20 (an empty list means the group is absent).
 * @param collection - collection entries.
 * @param sessionId - current Session identity.
 * @param limit - maximum candidates, default 20.
 * @param labelTemplate - optional display-label template with `{name}`; the
 *   source uses it so annotation rows are identifiable in the mixed `@` list
 *   without a custom group header (the shell's slash menu has no title slot for us).
 * @returns candidates.
 */
export function annotationChipCandidates(
  collection: unknown,
  sessionId: unknown,
  limit?: number,
  labelTemplate?: string
): AnnotationChipCandidate[] {
  const cap = typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? Math.round(limit) : ANNOTATION_CHIP_CANDIDATE_LIMIT
  const candidates: AnnotationChipCandidate[] = []
  const list = annotationFlattenRecords(Array.isArray(collection)
    ? collection.filter((entry) => entry === null || typeof entry !== 'object' || (entry as AnnotationCollectionEntry).included !== false)
    : [])
  for (const entry of list) {
    if (candidates.length >= cap) break
    if (entry === null || typeof entry !== 'object') continue
    const entrySession = sessionIdOf(entry)
    if (typeof sessionId !== 'string' || sessionId.length === 0 || entrySession !== sessionId) continue
    const entryId = (entry as AnnotationCollectionEntry).id
    if (typeof entryId !== 'string' || !ANNOTATION_CHIP_REF_PATTERN.test(entryId)) continue
    const label = elementLabel(entry) || 'UI annotation'
    const displayLabel = typeof labelTemplate === 'string' && labelTemplate.length > 0
      ? labelTemplate.replace('{name}', label)
      : label
    const excerpt = annotationMarkerBadgeText((entry as AnnotationCollectionEntry).note).text
    // `name` stays the raw element label so search and exact-match keep working;
    // only the rendered row is prefixed.
    const candidate: AnnotationChipCandidate = { name: label, label: displayLabel, value: entryId }
    if (excerpt.length > 0) candidate.description = excerpt
    candidates.push(candidate)
  }
  return candidates
}

/**
 * Serialize one annotation chip to the model text the existing Phase 1
 * serializers produce (A3/T9): a single chip == quick-reference block, a batch
 * chip == one ordered batch request. Deleted batch members are skipped and
 * counted honestly; a single missing record returns `text: null` so the
 * controller can fail the send instead of silently downgrading (D9).
 * @param ref - chip ref.
 * @param list - current collection entries.
 * @param labels - insertion labels plus `removed`/`noRemaining`.
 * @param statusOf - live status resolver.
 * @returns serialization result.
 */
export function serializeAnnotationChip(
  ref: unknown,
  list: unknown,
  labels: unknown,
  statusOf?: (record: AnnotationCollectionEntry) => string
): AnnotationChipSerialization {
  const source = asRecord(labels)
  const parsed = parseAnnotationChipRef(ref)
  const records = Array.isArray(list) ? list : []
  const resolveStatus: (record: AnnotationCollectionEntry) => string = typeof statusOf === 'function' ? statusOf : () => 'resolved'
  if (parsed === null) return { text: null, missing: 0, remaining: 0 }
  if (parsed.kind === 'single') {
    const record = records.find((entry) => entry !== null && typeof entry === 'object' && (entry as AnnotationCollectionEntry).id === parsed.id)
    if (record === undefined) return { text: null, missing: 1, remaining: 0 }
    const sourceRecord = record as AnnotationCollectionEntry
    return {
      text: serializeQuickReference({ ...sourceRecord, status: resolveStatus(sourceRecord) }, sourceRecord.note ?? '', source),
      missing: 0,
      remaining: 1
    }
  }
  const byId = new Map<string, AnnotationCollectionEntry>()
  for (const entry of records) {
    if (entry !== null && typeof entry === 'object' && typeof (entry as AnnotationCollectionEntry).id === 'string') {
      const sourceEntry = entry as AnnotationCollectionEntry
      byId.set(sourceEntry.id as string, sourceEntry)
    }
  }
  const found: AnnotationCollectionEntry[] = []
  for (const id of parsed.ids) {
    const entry = byId.get(id)
    if (entry !== undefined) found.push(entry)
  }
  const missing = parsed.ids.length - found.length
  if (found.length === 0) {
    const line = typeof source.noRemaining === 'string' ? source.noRemaining : '(no annotations remain)'
    return { text: `${line}\n`, missing, remaining: 0 }
  }
  const remaining = found.reduce((sum, entry) => sum + (annotationIsGroup(entry) ? annotationGroupItems(entry).length : 1), 0)
  return {
    text: serializeBatchEntries(found, { ...source, skippedCount: 0, removedCount: missing }, resolveStatus),
    missing,
    remaining
  }
}

/**
 * Serialize one quick-reference insertion block.
 * @param ref - ElementRef.
 * @param note - requested change.
 * @param labels - `{ title, reference, session, noSession, note, emptyNote, time? }`.
 * @returns insertion text, trailing newline included.
 */
export function serializeQuickReference(ref: unknown, note: unknown, labels: unknown): string {
  const source = asRecord(labels)
  const title = typeof source.title === 'string' ? source.title : 'UI annotation'
  const reference = typeof source.reference === 'string' ? source.reference : 'Reference:'
  const sessionLabel = typeof source.session === 'string' ? source.session : 'Session:'
  const noteLabel = typeof source.note === 'string' ? source.note : 'Note:'
  const emptyNote = typeof source.emptyNote === 'string' ? source.emptyNote : '—'
  const timeText = typeof source.time === 'string' ? source.time : formatAnnotationTime(recordOrNull(ref)?.at)
  const sessionText = sessionShortLabel(sessionIdOf(ref)) || (typeof source.noSession === 'string' ? source.noSession : '—')
  const noteText = normalizeUserNote(note) || emptyNote
  const lines = [
    `${title} · ${elementLabel(ref)}`,
    annotationJoinLabel(reference, describeLocator(ref)),
    annotationJoinLabel(sessionLabel, `${sessionText} · ${timeText}`),
    annotationJoinLabel(noteLabel, noteText)
  ]
  // A stale or ambiguous target is called out explicitly, locator only. A
  // transient floating-surface target says it is gone, not that it moved.
  const status = recordOrNull(ref)?.status
  const ephemeral = isEphemeralRef(ref)
  if (status === 'missing') {
    lines.push(ephemeral && typeof source.statusEphemeral === 'string'
      ? source.statusEphemeral
      : (typeof source.status === 'string' ? source.status : 'Status: target no longer resolves (locator only)'))
  }
  else if (status === 'ambiguous') lines.push(typeof source.statusAmbiguous === 'string' ? source.statusAmbiguous : 'Status: target matches more than one element (locator only)')
  else if (status === 'changed') lines.push(typeof source.statusChanged === 'string' ? source.statusChanged : 'Status: target content changed')
  lines.push('')
  return lines.join('\n')
}

/**
 * Serialize the ordered batch request.
 * @param items - `[{ ref, note }]` in collection order.
 * @param labels - batch labels plus optional `skippedCount`.
 * @returns insertion text, trailing newline included.
 */
export function serializeBatchRequest(items: unknown, labels: unknown): string {
  const source = asRecord(labels)
  const batchHeader = typeof source.batchHeader === 'string'
    ? source.batchHeader
    : 'Please adjust the UI elements below. Each item lists its reference and the requested change.'
  const reference = typeof source.reference === 'string' ? source.reference : 'Reference:'
  const noteLabel = typeof source.note === 'string' ? source.note : 'Note:'
  const emptyNote = typeof source.emptyNote === 'string' ? source.emptyNote : '—'
  const statusLabel = typeof source.status === 'string' ? source.status : 'Status: target no longer resolves (locator only)'
  const statusEphemeral = typeof source.statusEphemeral === 'string'
    ? source.statusEphemeral
    : 'Status: transient surface no longer present (locator only)'
  const statusAmbiguous = typeof source.statusAmbiguous === 'string' ? source.statusAmbiguous : 'Status: target matches more than one element (locator only)'
  const statusChanged = typeof source.statusChanged === 'string' ? source.statusChanged : 'Status: target content changed'
  const skippedTemplate = typeof source.skipped === 'string' ? source.skipped : '({count} annotation(s) from other sessions skipped)'
  const skippedCount = typeof source.skippedCount === 'number' && Number.isFinite(source.skippedCount) && source.skippedCount > 0
    ? Math.round(source.skippedCount)
    : 0
  const removedTemplate = typeof source.removed === 'string' ? source.removed : '({count} annotation(s) no longer exist and were skipped)'
  const removedCount = typeof source.removedCount === 'number' && Number.isFinite(source.removedCount) && source.removedCount > 0
    ? Math.round(source.removedCount)
    : 0
  const lines = [batchHeader]
  if (removedCount > 0) {
    lines.push('')
    lines.push(removedTemplate.replace('{count}', String(removedCount)))
  }
  if (skippedCount > 0) {
    lines.push('')
    lines.push(skippedTemplate.replace('{count}', String(skippedCount)))
  }
  lines.push('')
  const entries = Array.isArray(items) ? items : []
  entries.forEach((item, index) => {
    const ref = refOfItem(item)
    const note = noteOfItem(item, ref)
    const label = elementLabel(ref)
    lines.push(`${index + 1}. ${label}`)
    lines.push(`   ${annotationJoinLabel(reference, describeLocator(ref))}`)
    lines.push(`   ${annotationJoinLabel(noteLabel, normalizeUserNote(note) || emptyNote)}`)
    const status = recordOrNull(ref)?.status
    const ephemeral = isEphemeralRef(ref)
    if (status === 'missing') lines.push(`   ${ephemeral ? statusEphemeral : statusLabel}`)
    else if (status === 'ambiguous') lines.push(`   ${statusAmbiguous}`)
    else if (status === 'changed') lines.push(`   ${statusChanged}`)
    if (index < entries.length - 1) lines.push('')
  })
  lines.push('')
  return lines.join('\n')
}

/**
 * A3/T24: serialize a mixed batch of singles and groups as ONE request.
 * Singles keep their Quick-reference item block; each group emits its shared
 * requirement header and numbered element references (no per-item Note lines).
 * @param entries - top-level singles/groups, insertion order.
 * @param labels - insertion labels plus skippedCount/removedCount.
 * @param statusOf - live status resolver.
 * @returns insertion text, trailing newline included.
 */
export function serializeBatchEntries(
  entries: unknown,
  labels: unknown,
  statusOf?: (record: AnnotationCollectionEntry) => string
): string {
  const source = asRecord(labels)
  const list = Array.isArray(entries) ? entries : []
  const resolveStatus: (record: AnnotationCollectionEntry) => string = typeof statusOf === 'function' ? statusOf : () => 'resolved'
  const lines = [typeof source.batchHeader === 'string'
    ? source.batchHeader
    : 'Please adjust the UI elements below. Each item lists its reference and the requested change.']
  const skippedCount = typeof source.skippedCount === 'number' && Number.isFinite(source.skippedCount) && source.skippedCount > 0
    ? Math.round(source.skippedCount)
    : 0
  const removedCount = typeof source.removedCount === 'number' && Number.isFinite(source.removedCount) && source.removedCount > 0
    ? Math.round(source.removedCount)
    : 0
  if (removedCount > 0) {
    lines.push('')
    lines.push(String(source.removed ?? '({count} annotation(s) no longer exist and were skipped)').replace('{count}', String(removedCount)))
  }
  if (skippedCount > 0) {
    lines.push('')
    lines.push(String(source.skipped ?? '({count} annotation(s) from other sessions skipped)').replace('{count}', String(skippedCount)))
  }
  lines.push('')
  let number = 0
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue
    if (annotationIsGroup(entry)) {
      const items = annotationGroupItems(entry).map((item) => ({ ref: { ...item, status: resolveStatus(item) } }))
      lines.push('')
      lines.push(serializeGroupBlock(entry, items, source))
    } else {
      number += 1
      const ref: AnnotationCollectionEntry = { ...entry as AnnotationCollectionEntry, status: resolveStatus(entry as AnnotationCollectionEntry) }
      lines.push(`${number}. ${elementLabel(ref)}`)
      lines.push(`   ${annotationJoinLabel(source.reference ?? 'Reference:', describeLocator(ref))}`)
      lines.push(`   ${annotationJoinLabel(source.note ?? 'Note:', normalizeUserNote(ref.note) || String(source.emptyNote ?? '—'))}`)
      const status = ref.status
      const ephemeral = isEphemeralRef(ref)
      if (status === 'missing') lines.push(`   ${ephemeral ? String(source.statusEphemeral ?? 'Status: transient surface no longer present (locator only)') : String(source.status ?? 'Status: target no longer resolves (locator only)')}`)
      else if (status === 'ambiguous') lines.push(`   ${String(source.statusAmbiguous ?? 'Status: target matches more than one element (locator only)')}`)
      else if (status === 'changed') lines.push(`   ${String(source.statusChanged ?? 'Status: target content changed')}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

/**
 * Split entries into the current Session and all other Sessions, keeping order.
 * @param items - `[{ ref, note }]` or bare ElementRefs.
 * @param sessionId - current Session identity.
 * @returns the two ordered lists.
 */
export function batchScopeSplit(items: unknown, sessionId: unknown): { current: unknown[]; other: unknown[] } {
  const entries = Array.isArray(items) ? items : []
  const current: unknown[] = []
  const other: unknown[] = []
  for (const item of entries) {
    const ref = refOfItem(item)
    const refSession = sessionIdOf(ref)
    if (typeof sessionId === 'string' && sessionId.length > 0 && refSession === sessionId) current.push(item)
    else other.push(item)
  }
  return { current, other }
}
