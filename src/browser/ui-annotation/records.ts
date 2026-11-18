/**
 * Pure record-store model for UI-element annotation.
 *
 * This module owns the persistence boundary and the collection algebra behind
 * it: v2/v3 document normalization, parsing and serialization, the record cap,
 * single/group CRUD, undo payloads, scope/sidebar counts, filters, and the
 * group flatten/lookup helpers the overlay renders from. Everything here is
 * immutable and side-effect free; the controller owns localStorage, the clock
 * and the DOM. Records are untrusted input after a reload, so every field is
 * whitelisted rather than repaired.
 *
 * @module
 */

import {
  ANNOTATION_CONTROL_CHARS,
  normalizeUserNote,
  sanitizeText
} from './text.ts'
import {
  annotationRoutePath,
  annotationWorkspaceLabel,
  normalizeAnnotationBounds,
  normalizeAnnotationViewport
} from './format.ts'
import {
  ANNOTATION_JS_PATH_MAX,
  ANNOTATION_XPATH_MAX,
  buildStableAncestors,
  identityKeyForCandidates,
  identityKeyOf,
  sanitizeAnchorString,
  sanitizeDescendantAnchor,
  sanitizeTextPosition,
  sanitizeTextQuote
} from './identity.ts'
import type { AnnotationSelectorCandidate } from './identity.ts'

/** Browser-local storage key of the persisted annotation document. */
export const ANNOTATION_RECORDS_STORAGE_KEY = 'power-suite.ui-annotation.annotations'

/** Hard cap on persisted/collected annotations (D15: explicit refusal, never silent loss). */
export const ANNOTATION_RECORD_LIMIT = 100

/** A3/T9: one bare record id inside a chip ref (ids are `psa-<order>-<token>`). */
export const ANNOTATION_CHIP_REF_PATTERN = /^psa-[A-Za-z0-9_-]{1,120}$/

/** A3/T6: the badge requirement summary is a one-line excerpt of this many characters. */
const ANNOTATION_MARK_SUMMARY_MAX = 18

/** Locator candidate kinds persisted by the resolver. */
const ANNOTATION_CANDIDATE_KINDS: ReadonlySet<string> = new Set(['data', 'id', 'label', 'role', 'class', 'tag', 'path'])

/** Resolution statuses a persisted record may carry (display-only in Phase 1). */
const ANNOTATION_STATUS_VALUES: ReadonlySet<string> = new Set(['resolved', 'ambiguous', 'missing', 'changed'])

/** One top-level collection entry (a record, a batch group, or a legacy wrapper). */
export type AnnotationCollectionEntry = Record<string, unknown>

/** One record-shaped value read from storage or a collection. */
type LooseRecord = Record<string, unknown>

/** One normalized single record (normalization guarantees the bounded id). */
export interface AnnotationNormalizedRecord extends Record<string, unknown> {
  id: string
}

/** One batch-group collection entry. */
export type AnnotationGroupEntry = Record<string, unknown> & { kind: 'group' }

/** One normalized store document. */
export interface AnnotationStoreDocument {
  version: 3
  updatedAt: number
  records: AnnotationCollectionEntry[]
  groups: AnnotationCollectionEntry[]
  entries: AnnotationCollectionEntry[]
}

/** Outcome of one single-record mutation. */
export interface AnnotationRecordMutation {
  list: AnnotationCollectionEntry[]
  added: boolean
  updated: boolean
  rejected: boolean
}

/** Outcome of one group append. */
export interface AnnotationGroupMutation {
  list: AnnotationCollectionEntry[]
  added: boolean
  rejected: boolean
}

/** One single-slot undo payload (or null when nothing was removed). */
export interface AnnotationUndoResult {
  list: AnnotationCollectionEntry[]
  undo: LooseRecord | null
}

/** Derived counts for the rail header/footer. */
export interface AnnotationScopeCounts {
  current: number
  other: number
  included: number
  otherIncluded: number
  total: number
}

/** Derived counts for the sidebar header/filters. */
export interface AnnotationSidebarCounts {
  all: number
  single: number
  group: number
  items: number
  current: number
  other: number
}

/** One auto group summary. */
export interface AnnotationGroupSummary {
  title: string
  description: string
}

/** One mark-badge excerpt. */
export interface AnnotationMarkerBadge {
  text: string
  empty: boolean
  truncated: boolean
}

/** Read an untrusted value as a plain record, or an empty record. */
function asRecord(value: unknown): LooseRecord {
  return value !== null && typeof value === 'object' ? value as LooseRecord : {}
}

/** Read an untrusted value as a record, or null. */
function recordOrNull(value: unknown): LooseRecord | null {
  return value !== null && typeof value === 'object' ? value as LooseRecord : null
}

/**
 * Accept one stored selector string from localStorage.
 *
 * Records are untrusted input after a reload: only a bounded selector-shaped
 * string survives, and it is still passed through `querySelectorAll` inside a
 * try/catch by the resolver. No HTML can be stored or executed (D11/D14).
 * @param value - raw stored value.
 * @returns safe selector text.
 */
function sanitizeStoredSelector(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(ANNOTATION_CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
  if (text.length === 0 || text.length > 400) return null
  if (text.includes('<') || text.includes('javascript:')) return null
  return text
}

/**
 * Normalize one stored locator candidate list.
 * @param raw - raw candidate array.
 * @returns at most six candidates.
 */
function normalizeStoredCandidates(raw: unknown): AnnotationSelectorCandidate[] {
  if (!Array.isArray(raw)) return []
  const result: AnnotationSelectorCandidate[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const kind = typeof item.kind === 'string' && ANNOTATION_CANDIDATE_KINDS.has(item.kind) ? item.kind : ''
    const value = sanitizeStoredSelector(item.value)
    if (kind.length === 0 || value === null || seen.has(value)) continue
    seen.add(value)
    const reliability = typeof item.reliability === 'number' && Number.isFinite(item.reliability)
      ? Math.min(1, Math.max(0, item.reliability))
      : 0.1
    result.push({ kind, value, reliability })
  }
  result.sort((left, right) => right.reliability - left.reliability)
  return result.slice(0, 6)
}

/**
 * Normalize one persisted AnnotationRecord (v2, v1 tolerated).
 *
 * This is the storage boundary: every field is whitelisted, every string
 * sanitized, and invalid records are dropped instead of repaired into
 * something that claims a target it cannot resolve. `note` is user-authored
 * and survives verbatim (no redaction, no truncation) like the draft itself.
 * @param raw - parsed record.
 * @param fallbackOrder - order to use when the record has none.
 * @returns normalized record, or null when it must be dropped.
 */
export function normalizeAnnotationRecord(raw: unknown, fallbackOrder?: number): AnnotationNormalizedRecord | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as LooseRecord
  const version = source.version
  if (version !== undefined && version !== 1 && version !== 2) return null
  const id = typeof source.id === 'string' && source.id.length > 0 && source.id.length <= 120 ? source.id : ''
  if (id.length === 0) return null
  const rawLocator = recordOrNull(source.locator)
  if (rawLocator === null) return null
  const candidates = normalizeStoredCandidates(rawLocator.candidates)
  if (candidates.length === 0) return null
  const tag = (typeof rawLocator.tag === 'string' ? rawLocator.tag.trim().toLowerCase().slice(0, 40) : '') || 'element'
  const path = typeof rawLocator.path === 'string' ? sanitizeStoredSelector(rawLocator.path) ?? '' : ''
  const role = typeof rawLocator.role === 'string' ? sanitizeText(rawLocator.role, 32) : ''
  const name = typeof rawLocator.name === 'string' ? sanitizeText(rawLocator.name, 60) : ''
  const text = typeof source.text === 'string' ? sanitizeText(source.text, 80) : ''
  const key = typeof rawLocator.key === 'string' && rawLocator.key.length > 0 && rawLocator.key.length <= 300
    ? rawLocator.key
    : identityKeyForCandidates(tag, { path, role, text }, candidates)
  const uniqueSelector = sanitizeStoredSelector(rawLocator.uniqueSelector)
  const uniqueVerified = uniqueSelector !== null && rawLocator.uniqueVerified === true
  const surface = rawLocator.surface === 'floating' ? 'floating' : 'page'
  const xpath = sanitizeAnchorString(rawLocator.xpath, ANNOTATION_XPATH_MAX)
  const jsPath = sanitizeAnchorString(rawLocator.jsPath, ANNOTATION_JS_PATH_MAX)
  const textQuote = sanitizeTextQuote(rawLocator.textQuote)
  const textPosition = sanitizeTextPosition(rawLocator.textPosition)
  const descendantAnchor = surface === 'floating'
    ? sanitizeDescendantAnchor(null, null, null, null)
    : sanitizeDescendantAnchor(rawLocator.anchorTarget, rawLocator.anchorLeafTag, rawLocator.anchorAncestorChain, rawLocator.anchorSignature)
  const ancestorInput = Array.isArray(rawLocator.ancestors) ? rawLocator.ancestors : []
  const ancestors = buildStableAncestors(ancestorInput.map((entry) => {
    const item = entry !== null && typeof entry === 'object' ? entry : {}
    const attrs = item.attrs !== null && typeof item.attrs === 'object' && !Array.isArray(item.attrs)
      ? Object.entries(item.attrs).map(([attrName, attrValue]) => ({ name: attrName, value: attrValue }))
      : []
    return { tag: item.tag, attrs }
  }))
  const rawSession = recordOrNull(source.session) ?? {}
  const sessionId = typeof rawSession.sessionId === 'string' && rawSession.sessionId.length > 0 && rawSession.sessionId.length <= 120
    ? rawSession.sessionId
    : null
  const cwd = typeof rawSession.cwd === 'string' && rawSession.cwd.length > 0 && rawSession.cwd.length <= 4096
    ? rawSession.cwd.replace(ANNOTATION_CONTROL_CHARS, '')
    : null
  const workspaceLabel = typeof rawSession.workspaceLabel === 'string' && rawSession.workspaceLabel.length > 0
    ? sanitizeText(rawSession.workspaceLabel, 80)
    : annotationWorkspaceLabel(cwd)
  const at = typeof source.at === 'number' && Number.isFinite(source.at) && source.at > 0 ? Math.round(source.at) : 0
  const updatedAt = typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt) && source.updatedAt > 0 ? Math.round(source.updatedAt) : at
  const order = typeof source.order === 'number' && Number.isFinite(source.order) && source.order >= 0
    ? Math.round(source.order)
    : (typeof fallbackOrder === 'number' && Number.isFinite(fallbackOrder) ? Math.round(fallbackOrder) : 0)
  const component = typeof source.component === 'string' && source.component.length > 0 ? source.component.slice(0, 32) : 'other'
  const context = typeof source.context === 'string' ? sanitizeText(source.context, 120) : ''
  const textDigestValue = typeof source.textDigest === 'string' && /^[0-9a-f]{0,8}$/.test(source.textDigest) ? source.textDigest : ''
  const lastStatus = typeof source.lastStatus === 'string' && ANNOTATION_STATUS_VALUES.has(source.lastStatus) ? source.lastStatus : null
  return {
    version: 2,
    id,
    at,
    updatedAt,
    order,
    session: { sessionId, cwd, workspaceLabel },
    route: annotationRoutePath(source.route),
    locator: {
      tag,
      role,
      name,
      candidates,
      key,
      path,
      uniqueSelector,
      uniqueVerified,
      ancestors,
      surface,
      ephemeral: surface === 'floating',
      xpath,
      jsPath,
      textQuote,
      textPosition,
      ...descendantAnchor
    },
    component,
    text,
    textDigest: textDigestValue,
    context,
    bounds: normalizeAnnotationBounds(source.bounds) ?? { x: 0, y: 0, width: 0, height: 0 },
    viewport: normalizeAnnotationViewport(source.viewport),
    note: normalizeUserNote(source.note),
    included: source.included !== false,
    lastStatus
  }
}

/**
 * A3/T24: normalize one persisted batch group. Tolerant like records: a bad
 * group yields null; item records go through the same record normalizer, and
 * the group keeps its shared requirement/timestamps/session/collapse flags.
 * @param raw - raw persisted group.
 * @param fallbackOrder - order when the document did not carry one.
 * @returns normalized group, or null.
 */
function normalizeAnnotationGroup(raw: unknown, fallbackOrder?: number): LooseRecord | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as LooseRecord
  if (typeof source.id !== 'string' || source.id.length === 0 || !ANNOTATION_CHIP_REF_PATTERN.test(source.id)) return null
  const rawItems = Array.isArray(source.items) ? source.items : []
  const items: AnnotationCollectionEntry[] = []
  const seen = new Set<string>()
  for (let index = 0; index < rawItems.length; index += 1) {
    if (annotationTotalItemCount([]) + items.length >= 0 && items.length >= ANNOTATION_RECORD_LIMIT) break
    const item = normalizeAnnotationRecord(rawItems[index], index)
    if (item === null) continue
    if (seen.has(item.id)) continue
    seen.add(item.id)
    items.push({ ...item, note: '' })
  }
  if (items.length === 0) return null
  const rawSession = recordOrNull(source.session) ?? {}
  const firstSession = recordOrNull(items[0].session) ?? {}
  const sessionId = typeof rawSession.sessionId === 'string' && rawSession.sessionId.length > 0 && rawSession.sessionId.length <= 120
    ? rawSession.sessionId
    : (firstSession.sessionId ?? null)
  const cwd = typeof rawSession.cwd === 'string' && rawSession.cwd.length > 0 && rawSession.cwd.length <= 4096
    ? rawSession.cwd.replace(ANNOTATION_CONTROL_CHARS, '')
    : (firstSession.cwd ?? null)
  const workspaceLabel = typeof rawSession.workspaceLabel === 'string' && rawSession.workspaceLabel.length > 0
    ? sanitizeText(rawSession.workspaceLabel, 80)
    : (firstSession.workspaceLabel ?? annotationWorkspaceLabel(cwd))
  const at = typeof source.at === 'number' && Number.isFinite(source.at) && source.at > 0 ? Math.round(source.at) : 0
  const createdAt = typeof source.createdAt === 'number' && Number.isFinite(source.createdAt) && source.createdAt > 0 ? Math.round(source.createdAt) : at
  const updatedAt = typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt) && source.updatedAt > 0 ? Math.round(source.updatedAt) : (createdAt || at)
  const order = typeof source.order === 'number' && Number.isFinite(source.order) && source.order >= 0
    ? Math.round(source.order)
    : (typeof fallbackOrder === 'number' && Number.isFinite(fallbackOrder) ? Math.round(fallbackOrder) : 0)
  return {
    kind: 'group',
    id: source.id,
    at: createdAt || at,
    createdAt: createdAt || at,
    updatedAt,
    order,
    session: { sessionId, cwd, workspaceLabel },
    requirement: normalizeUserNote(source.requirement),
    items,
    collapsed: source.collapsed === true,
    included: source.included !== false
  }
}

/**
 * Parse the persisted annotation document.
 *
 * Tolerant by contract: bad JSON, unknown document versions, malformed records,
 * and extra fields never throw; valid records are normalized, invalid ones
 * dropped, duplicates removed, and the list capped at the record limit.
 * @param text - raw localStorage value.
 * @returns sanitized document.
 */
export function parseAnnotationStore(text: unknown): AnnotationStoreDocument {
  const empty: AnnotationStoreDocument = { version: 3, updatedAt: 0, records: [], groups: [], entries: [] }
  if (typeof text !== 'string' || text.length === 0) return empty
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return empty
  }
  let rawRecords: unknown[]
  let rawGroups: unknown[] = []
  let version = 3
  if (Array.isArray(parsed)) {
    // Tolerate the bare-array shape while still validating every record.
    rawRecords = parsed
    version = 1
  } else if (parsed !== null && typeof parsed === 'object') {
    const source = parsed as LooseRecord
    const declared = source.version
    if (declared !== undefined && declared !== 1 && declared !== 2 && declared !== 3) return empty
    version = declared === undefined ? 2 : declared
    rawRecords = Array.isArray(source.records) ? source.records : []
    rawGroups = Array.isArray(source.groups) ? source.groups : []
  } else {
    return empty
  }
  const updatedAt = parsed !== null && typeof parsed === 'object' && typeof (parsed as LooseRecord).updatedAt === 'number'
    && Number.isFinite((parsed as LooseRecord).updatedAt)
    ? Math.round((parsed as LooseRecord).updatedAt as number)
    : 0
  const records: AnnotationCollectionEntry[] = []
  const seen = new Set<string>()
  let total = 0
  for (let index = 0; index < rawRecords.length; index += 1) {
    if (total >= ANNOTATION_RECORD_LIMIT) break
    const record = normalizeAnnotationRecord(rawRecords[index], index)
    if (record === null) continue
    if (seen.has(record.id)) continue
    seen.add(record.id)
    records.push(record)
    total += 1
  }
  const groups: AnnotationCollectionEntry[] = []
  for (let index = 0; index < rawGroups.length; index += 1) {
    if (total >= ANNOTATION_RECORD_LIMIT) break
    const group = normalizeAnnotationGroup(rawGroups[index], records.length + groups.length)
    if (group === null) continue
    const room = ANNOTATION_RECORD_LIMIT - total
    const items = annotationGroupItems(group)
    if (items.length > room) {
      if (room <= 0) break
      group.items = items.slice(0, room)
    }
    total += annotationGroupItems(group).length
    groups.push(group)
  }
  const entries = records.concat(groups).sort((left, right) => (Number(left.order) - Number(right.order)) || (Number(left.at) - Number(right.at)))
  return { version: 3, updatedAt, records, groups, entries }
}

/**
 * Serialize the persisted annotation document.
 * @param collection - collection records.
 * @param updatedAt - epoch ms of this write.
 * @returns JSON document, records normalized and capped.
 */
export function serializeAnnotationStore(collection: unknown, updatedAt?: number): string {
  const singles: AnnotationCollectionEntry[] = []
  const groups: AnnotationCollectionEntry[] = []
  const seen = new Set<string>()
  let total = 0
  const input = Array.isArray(collection) ? collection : []
  for (let index = 0; index < input.length; index += 1) {
    if (total >= ANNOTATION_RECORD_LIMIT) break
    const entry = input[index]
    if (entry !== null && typeof entry === 'object' && (entry as LooseRecord).kind === 'group') {
      const group = normalizeAnnotationGroup(entry, index)
      if (group === null) continue
      const items = annotationGroupItems(group)
      if (items.length > ANNOTATION_RECORD_LIMIT - total) continue
      total += items.length
      groups.push(group)
      continue
    }
    const record = normalizeAnnotationRecord(entry, index)
    if (record === null) continue
    if (seen.has(record.id)) continue
    seen.add(record.id)
    singles.push(record)
    total += 1
  }
  singles.sort((left, right) => (Number(left.order) - Number(right.order)) || (Number(left.at) - Number(right.at)))
  groups.sort((left, right) => (Number(left.order) - Number(right.order)) || (Number(left.at) - Number(right.at)))
  const at = typeof updatedAt === 'number' && Number.isFinite(updatedAt) && updatedAt > 0 ? Math.round(updatedAt) : Date.now()
  return JSON.stringify({ version: 3, updatedAt: at, records: singles, groups })
}

/**
 * One ordered collection entry list update, never mutating the input.
 *
 * The record cap is enforced here, at the single commit boundary (D15): an
 * add that would exceed the limit is refused explicitly (`rejected: true`)
 * instead of silently dropping the oldest record or the new one.
 * @param list - current entries (ElementRefs with `note`).
 * @param entry - ElementRef to add or update.
 * @param limit - maximum record count, default 100.
 * @returns next list and what happened.
 */
export function collectionAdd(list: unknown, entry: unknown, limit?: number): AnnotationRecordMutation {
  const current: AnnotationCollectionEntry[] = Array.isArray(list) ? list : []
  const cap = typeof limit === 'number' && Number.isFinite(limit) && limit >= 1 ? Math.round(limit) : ANNOTATION_RECORD_LIMIT
  const entryRecord = recordOrNull(entry)
  const ref = entryRecord !== null ? recordOrNull(entryRecord.ref) ?? entryRecord : null
  if (ref === null) return { list: current.slice(), added: false, updated: false, rejected: false }
  const key = identityKeyOf(ref)
  const session = recordOrNull(ref.session)
  const sessionId = session !== null ? session.sessionId ?? null : null
  const index = current.findIndex((item) => {
    const itemRecord = recordOrNull(item)
    const candidate = itemRecord !== null ? recordOrNull(itemRecord.ref) ?? itemRecord : null
    if (candidate === null) return false
    const candidateSession = recordOrNull(candidate.session)
    const candidateSessionId = candidateSession !== null ? candidateSession.sessionId ?? null : null
    return identityKeyOf(candidate) === key && candidateSessionId === sessionId
  })
  if (index >= 0) {
    const next = current.slice()
    const itemRecord = recordOrNull(next[index])
    const existing = itemRecord !== null ? recordOrNull(itemRecord.ref) ?? itemRecord : {}
    // Re-adding a selected element must not wipe a note the user already wrote:
    // only an explicit non-empty note updates it here. Clearing a note is the
    // collection editor's explicit `collectionSetNote` path (F4).
    const incomingNote = typeof ref.note === 'string' ? ref.note.trim() : ''
    next[index] = {
      ...ref,
      id: existing.id ?? ref.id,
      at: existing.at ?? ref.at,
      order: typeof existing.order === 'number' ? existing.order : ref.order,
      note: incomingNote.length > 0
        ? ref.note
        : (typeof existing.note === 'string' ? existing.note : '')
    }
    return { list: next, added: false, updated: true, rejected: false }
  }
  if (current.length >= cap) return { list: current.slice(), added: false, updated: false, rejected: true }
  return { list: current.concat([ref]), added: true, updated: false, rejected: false }
}

/**
 * Remove one collection entry by ref id.
 * @param list - current entries.
 * @param refId - ref id to remove.
 * @returns next entries.
 */
export function collectionRemove(list: unknown, refId: unknown): AnnotationCollectionEntry[] {
  if (!Array.isArray(list)) return []
  return list.filter((entry) => {
    const entryRecord = recordOrNull(entry)
    const ref = entryRecord !== null ? recordOrNull(entryRecord.ref) ?? entryRecord : null
    return ref === null || ref.id !== refId
  })
}

/**
 * Clear the collection.
 * @returns an empty list.
 */
export function collectionClear(): AnnotationCollectionEntry[] {
  return []
}

/**
 * Update one collection entry's note, keeping order.
 * @param list - current entries.
 * @param refId - ref id to update.
 * @param note - replacement note.
 * @returns next entries.
 */
export function collectionSetNote(list: unknown, refId: unknown, note: unknown): AnnotationCollectionEntry[] {
  if (!Array.isArray(list)) return []
  const text = typeof note === 'string' ? note : ''
  return list.map((entry) => {
    const entryRecord = recordOrNull(entry)
    const ref = entryRecord !== null ? recordOrNull(entryRecord.ref) ?? entryRecord : null
    if (ref === null || ref.id !== refId) return entry
    return { ...ref, note: text }
  })
}

/**
 * Next collection `order` value: one past the highest existing order.
 * @param list - current entries.
 * @returns next order.
 */
function nextAnnotationOrder(list: unknown): number {
  let highest = -1
  for (const entry of Array.isArray(list) ? list : []) {
    if (entry !== null && typeof entry === 'object') {
      const order = (entry as LooseRecord).order
      if (typeof order === 'number' && Number.isFinite(order)) highest = Math.max(highest, Math.round(order))
    }
  }
  return highest + 1
}

/**
 * Commit one record: insert a new annotation or update the existing identity in
 * place (A3/T5). An update keeps `id`/`at`/`order`/`included` and refreshes the
 * locator, non-empty note, `lastStatus`, and `updatedAt`; the cap is enforced at
 * this single commit boundary (D15) instead of silently dropping a record.
 * @param list - current collection entries.
 * @param record - ElementRef v2 to commit.
 * @param limit - maximum record count, default 100.
 * @param now - epoch ms of this commit, default `record.updatedAt`/Date.now().
 * @returns result.
 */
export function upsertAnnotationRecord(list: unknown, record: unknown, limit?: number, now?: number): AnnotationRecordMutation {
  const current: AnnotationCollectionEntry[] = Array.isArray(list) ? list : []
  const cap = typeof limit === 'number' && Number.isFinite(limit) && limit >= 1 ? Math.round(limit) : ANNOTATION_RECORD_LIMIT
  const source = recordOrNull(record)
  if (source === null || Array.isArray(record)) return { list: current.slice(), added: false, updated: false, rejected: false }
  const stamp = typeof now === 'number' && Number.isFinite(now) && now > 0
    ? Math.round(now)
    : (typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt) && source.updatedAt > 0 ? Math.round(source.updatedAt) : Date.now())
  const key = identityKeyOf(source)
  const session = recordOrNull(source.session)
  const sessionId = session !== null ? session.sessionId ?? null : null
  const index = current.findIndex((entry) => {
    if (entry === null || typeof entry !== 'object') return false
    const entryRecord = entry as LooseRecord
    const entrySession = recordOrNull(entryRecord.session)
    const entrySessionId = entrySession !== null ? entrySession.sessionId ?? null : null
    return identityKeyOf(entryRecord) === key && entrySessionId === sessionId
  })
  if (index >= 0) {
    const existing = current[index] as LooseRecord
    const next = current.slice()
    const incomingNote = typeof source.note === 'string' ? source.note.trim() : ''
    next[index] = {
      ...source,
      id: typeof existing.id === 'string' && existing.id.length > 0 ? existing.id : source.id,
      at: typeof existing.at === 'number' && Number.isFinite(existing.at) ? existing.at : source.at,
      order: typeof existing.order === 'number' && Number.isFinite(existing.order) ? existing.order : source.order,
      updatedAt: stamp,
      included: existing.included !== false,
      lastStatus: typeof source.lastStatus === 'string' ? source.lastStatus : (existing.lastStatus ?? null),
      note: incomingNote.length > 0 ? source.note : (typeof existing.note === 'string' ? existing.note : '')
    }
    return { list: next, added: false, updated: true, rejected: false }
  }
  if (current.length >= cap) return { list: current.slice(), added: false, updated: false, rejected: true }
  return {
    list: current.concat([{
      ...source,
      version: 2,
      updatedAt: stamp,
      // Commit order is the collection's insertion position, never the pick
      // timestamp: the collection is an ordered list and persistence sorts by
      // `order`, so a new record must land after the current last one.
      order: nextAnnotationOrder(current),
      included: source.included !== false,
      lastStatus: typeof source.lastStatus === 'string' ? source.lastStatus : null
    }]),
    added: true,
    updated: false,
    rejected: false
  }
}

/**
 * Remove one record by id (A3/T5). Immutable; a missing id is a no-op copy.
 * @param list - current entries.
 * @param refId - record id.
 * @returns next entries.
 */
export function removeAnnotationRecord(list: unknown, refId: unknown): AnnotationCollectionEntry[] {
  return collectionRemove(list, refId)
}

/**
 * Restore one removed record at its original array position (A3/T5 undo).
 * @param list - current entries.
 * @param record - removed record.
 * @param index - original array index; clamped, default append.
 * @returns next entries.
 */
export function restoreAnnotationRecord(list: unknown, record: unknown, index?: number): AnnotationCollectionEntry[] {
  const current: AnnotationCollectionEntry[] = Array.isArray(list) ? list : []
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return current.slice()
  const at = typeof index === 'number' && Number.isFinite(index)
    ? Math.min(Math.max(Math.round(index), 0), current.length)
    : current.length
  return current.slice(0, at).concat([record as AnnotationCollectionEntry], current.slice(at))
}

/**
 * Move one record one slot up or down and keep `order` contiguous (A3/T5;
 * wired here for the Phase 2-B rail, which reuses the same action).
 * @param list - current entries.
 * @param refId - record id.
 * @param delta - -1 to move up (towards index 0), +1 to move down.
 * @returns next entries.
 */
export function moveAnnotationRecord(list: unknown, refId: unknown, delta: unknown): AnnotationCollectionEntry[] {
  const current: AnnotationCollectionEntry[] = Array.isArray(list) ? list.slice() : []
  const index = current.findIndex((entry) => entry !== null && typeof entry === 'object' && entry.id === refId)
  if (index < 0) return current
  const step = delta === -1 || (typeof delta === 'number' && delta < 0) ? -1 : 1
  const target = index + step
  if (target < 0 || target >= current.length) return current
  const next = current.slice()
  const moved = next[index]
  next[index] = next[target]
  next[target] = moved
  return next.map((entry, position) => (entry !== null && typeof entry === 'object' ? { ...entry, order: position } : entry))
}

/**
 * Set one record's batch-include flag (A3/T5). The controller forces other-session
 * records to `included: false`; the pure helper only applies what it is given.
 * @param list - current entries.
 * @param refId - record id.
 * @param included - whether the record participates in a batch.
 * @returns next entries.
 */
export function toggleAnnotationInclude(list: unknown, refId: unknown, included: unknown): AnnotationCollectionEntry[] {
  if (!Array.isArray(list)) return []
  const flag = included === true
  return list.map((entry) => {
    if (entry === null || typeof entry !== 'object' || entry.id !== refId) return entry
    if (entry.included === flag) return entry
    return { ...entry, included: flag }
  })
}

/**
 * Remove one record (or clear the whole list) while capturing the single-slot
 * undo payload (A3/T5/D5). The newest removal replaces any previous slot.
 * @param list - current entries.
 * @param refId - record id to remove (ignored when kind is `clear`).
 * @param kind - removal shape, default `single`.
 * @param at - epoch ms of the removal.
 * @returns next entries and undo payload.
 */
export function annotationUndoRemove(list: unknown, refId: unknown, kind?: string, at?: number): AnnotationUndoResult {
  const current: AnnotationCollectionEntry[] = Array.isArray(list) ? list : []
  const stamp = typeof at === 'number' && Number.isFinite(at) && at > 0 ? Math.round(at) : Date.now()
  if (kind === 'clear') {
    if (current.length === 0) return { list: current.slice(), undo: null }
    return { list: [], undo: { kind: 'clear', records: current.slice(), at: stamp } }
  }
  const index = current.findIndex((entry) => entry !== null && typeof entry === 'object' && entry.id === refId)
  if (index < 0) return { list: current.slice(), undo: null }
  return {
    list: collectionRemove(current, refId),
    undo: { kind: 'single', record: current[index], index, at: stamp }
  }
}

/**
 * Apply one undo payload (A3/T5/D5): restore a single record at its original
 * index, or rebuild a cleared collection in its original order.
 * @param list - current entries.
 * @param undo - payload returned by {@link annotationUndoRemove}.
 * @returns next entries.
 */
export function annotationUndoRestore(list: unknown, undo: unknown): AnnotationCollectionEntry[] {
  const current: AnnotationCollectionEntry[] = Array.isArray(list) ? list : []
  const source = recordOrNull(undo)
  if (source === null) return current.slice()
  if (source.kind === 'clear') {
    const records = Array.isArray(source.records) ? source.records : []
    if (records.length === 0) return current.slice()
    const ids = new Set(current.map((entry) => (entry !== null && typeof entry === 'object' ? entry.id : null)))
    const merged = current.concat(records.filter((record) => record !== null && typeof record === 'object' && !ids.has(record.id)))
    const orderOf = (entry: unknown): number => {
      const record = recordOrNull(entry)
      return record !== null && typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : 0
    }
    const atOf = (entry: unknown): number => {
      const record = recordOrNull(entry)
      return record !== null && typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : 0
    }
    return merged.slice().sort((left, right) => (orderOf(left) - orderOf(right)) || (atOf(left) - atOf(right)))
  }
  if (source.kind === 'groupRestore') {
    const group = recordOrNull(source.group) !== null && (source.group as LooseRecord).kind === 'group'
      ? source.group as AnnotationCollectionEntry
      : null
    if (group === null) return current.slice()
    const index = current.findIndex((entry) => entry !== null && typeof entry === 'object' && entry.id === group.id)
    if (index >= 0) {
      const next = current.slice()
      next[index] = group
      return next
    }
    return restoreAnnotationRecord(current, group, typeof source.index === 'number' ? source.index : undefined)
  }
  if (source.kind === 'multi') {
    // Restore in ascending original-index order so every record lands back
    // where it was removed from; a newer duplicate id is left untouched.
    const entries = Array.isArray(source.entries) ? source.entries : []
    if (entries.length === 0) return current.slice()
    const ids = new Set(current.map((entry) => (entry !== null && typeof entry === 'object' ? entry.id : null)))
    const ordered = entries
      .filter((item) => item !== null && typeof item === 'object'
        && (item as LooseRecord).record !== null && typeof (item as LooseRecord).record === 'object'
        && !ids.has(((item as LooseRecord).record as LooseRecord).id))
      .slice()
      .sort((left, right) => (Number((left as LooseRecord).index) || 0) - (Number((right as LooseRecord).index) || 0))
    let next = current
    for (const item of ordered) {
      next = restoreAnnotationRecord(next, (item as LooseRecord).record, (item as LooseRecord).index as number)
    }
    return next
  }
  if (source.record === null || typeof source.record !== 'object') return current.slice()
  return restoreAnnotationRecord(current, source.record, source.index as number)
}

/**
 * One-line requirement excerpt for a page mark badge (A3/T6): first non-empty
 * line, whitespace collapsed, truncated to `max` characters with an ellipsis.
 * @param note - requirement text.
 * @param max - maximum characters, default 18.
 * @returns excerpt.
 */
export function annotationMarkerBadgeText(note: unknown, max?: number): AnnotationMarkerBadge {
  const source = typeof note === 'string' ? note : ''
  const limit = typeof max === 'number' && Number.isFinite(max) && max > 1 ? Math.round(max) : ANNOTATION_MARK_SUMMARY_MAX
  let line = ''
  for (const candidate of source.split(/\r?\n/)) {
    const collapsed = candidate.replace(/\s+/g, ' ').trim()
    if (collapsed.length > 0) {
      line = collapsed
      break
    }
  }
  if (line.length === 0) return { text: '', empty: true, truncated: false }
  if (line.length <= limit) return { text: line, empty: false, truncated: false }
  return { text: `${line.slice(0, Math.max(1, limit - 1)).trimEnd()}…`, empty: false, truncated: true }
}

/**
 * Remove several records at once while capturing a multi-entry undo payload
 * (A3/T8/D5: `delete selected` also enters the 5 s undo slot).
 * @param list - current entries.
 * @param refIds - record ids to remove.
 * @param at - epoch ms of the removal.
 * @returns next entries and undo payload.
 */
export function annotationUndoRemoveMany(list: unknown, refIds: unknown, at?: number): AnnotationUndoResult {
  const current: AnnotationCollectionEntry[] = Array.isArray(list) ? list : []
  const wanted = new Set(Array.isArray(refIds) ? refIds.filter((id) => typeof id === 'string' && id.length > 0) : [])
  if (wanted.size === 0) return { list: current.slice(), undo: null }
  const entries: Array<{ record: AnnotationCollectionEntry; index: number }> = []
  const next: AnnotationCollectionEntry[] = []
  for (let index = 0; index < current.length; index += 1) {
    const entry = current[index]
    if (entry !== null && typeof entry === 'object' && wanted.has(entry.id)) entries.push({ record: entry, index })
    else next.push(entry)
  }
  if (entries.length === 0) return { list: current.slice(), undo: null }
  const stamp = typeof at === 'number' && Number.isFinite(at) && at > 0 ? Math.round(at) : Date.now()
  return { list: next, undo: { kind: 'multi', entries, at: stamp } }
}

/**
 * Scope counts for the rail header/footer (A3/T8).
 * @param list - collection entries.
 * @param sessionId - current Session identity.
 * @returns counts.
 */
export function annotationScopeCounts(list: unknown, sessionId: string | null): AnnotationScopeCounts {
  let current = 0
  let other = 0
  let included = 0
  let otherIncluded = 0
  for (const entry of Array.isArray(list) ? list : []) {
    if (entry === null || typeof entry !== 'object') continue
    const entryRecord = entry as LooseRecord
    const entrySession = recordOrNull(entryRecord.session)
    const entrySessionId = entrySession !== null ? entrySession.sessionId ?? null : null
    if (typeof sessionId === 'string' && sessionId.length > 0 && entrySessionId === sessionId) {
      current += 1
      if (entryRecord.included !== false) included += 1
    } else {
      other += 1
      if (entryRecord.included !== false) otherIncluded += 1
    }
  }
  return { current, other, included, otherIncluded, total: current + other }
}

/**
 * A3/T25: derived counts for the redesigned sidebar header/filters. Filter
 * counts are current-Session top-level entries; the total badge counts every
 * element (single records + group items) regardless of scope.
 * @param collection - top-level collection entries.
 * @param sessionId - current Session identity.
 * @returns counts.
 */
export function annotationSidebarCounts(collection: unknown, sessionId: string | null): AnnotationSidebarCounts {
  const list = Array.isArray(collection) ? collection : []
  let single = 0
  let group = 0
  let other = 0
  let items = 0
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue
    const entryRecord = entry as LooseRecord
    const entrySession = recordOrNull(entryRecord.session)
    const entrySessionId = entrySession !== null ? entrySession.sessionId ?? null : null
    const isCurrent = typeof sessionId === 'string' && sessionId.length > 0 && entrySessionId === sessionId
    if (!isCurrent) {
      other += 1
      continue
    }
    if (annotationIsGroup(entry)) group += 1
    else single += 1
    items += annotationIsGroup(entry) ? annotationGroupItems(entry).length : 1
  }
  const all = single + group
  return { all, single, group, items, current: all, other }
}

/**
 * A3/T29: one visible ordinal per top-level entry. A batch group occupies a
 * SINGLE ordinal shared by all its items; the next single/group continues from
 * the next number (no per-item increments).
 * @param collection - top-level entries.
 * @returns 1-based ordinals aligned with the entries.
 */
export function annotationEntryOrdinals(collection: unknown): number[] {
  const list = Array.isArray(collection) ? collection : []
  const ordinals: number[] = []
  let ordinal = 0
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue
    ordinal += 1
    ordinals.push(ordinal)
  }
  return ordinals
}

/**
 * A3/T25: client-side filter of the sidebar list.
 * @param collection - top-level collection entries.
 * @param filter - active filter.
 * @returns filtered entries.
 */
export function annotationFilterEntries(collection: unknown, filter: unknown): AnnotationCollectionEntry[] {
  const list: AnnotationCollectionEntry[] = Array.isArray(collection) ? collection : []
  if (filter === 'single') return list.filter((entry) => entry !== null && typeof entry === 'object' && !annotationIsGroup(entry))
  if (filter === 'group') return list.filter((entry) => annotationIsGroup(entry))
  return list.slice()
}

/**
 * A3/T25: auto title/description for a group card. The title is the first
 * requirement line (bounded); the description is the remaining requirement
 * (or the full requirement when the title is the whole text).
 * @param group - group entry.
 * @returns summary strings.
 */
export function annotationGroupSummary(group: unknown): AnnotationGroupSummary {
  const requirement = annotationIsGroup(group) && typeof group.requirement === 'string' ? group.requirement : ''
  const lines = requirement.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line.length > 0)
  const first = lines.length > 0 ? lines[0] : ''
  const title = first.length > 42 ? `${first.slice(0, 41).trimEnd()}…` : first
  const description = lines.length > 1 ? lines.slice(1).join(' ') : (first.length > 42 ? requirement.trim() : '')
  return { title, description }
}

/**
 * The ordered current-Session records selected for a batch insert (A3/T8):
 * only `included !== false` entries of the current Session qualify; an
 * other-Session record can never be part of a batch.
 * @param list - collection entries.
 * @param sessionId - current Session identity.
 * @returns ordered batch entries.
 */
export function annotationSelectedEntries(list: unknown, sessionId: string | null): AnnotationCollectionEntry[] {
  const selected: AnnotationCollectionEntry[] = []
  for (const entry of Array.isArray(list) ? list : []) {
    if (entry === null || typeof entry !== 'object') continue
    const entryRecord = entry as LooseRecord
    const entrySession = recordOrNull(entryRecord.session)
    const entrySessionId = entrySession !== null ? entrySession.sessionId ?? null : null
    if (typeof sessionId !== 'string' || sessionId.length === 0 || entrySessionId !== sessionId) continue
    if (entryRecord.included === false) continue
    selected.push(entryRecord)
  }
  return selected
}

/**
 * A3/T24: whether one collection entry is a batch group (singles carry no kind).
 * @param entry - collection entry.
 * @returns whether it is a group.
 */
export function annotationIsGroup(entry: unknown): entry is AnnotationGroupEntry {
  return entry !== null && typeof entry === 'object' && (entry as LooseRecord).kind === 'group'
}

/**
 * The element records of one group (an empty array for singles/malformed).
 * @param entry - collection entry.
 * @returns group item records.
 */
export function annotationGroupItems(entry: unknown): AnnotationCollectionEntry[] {
  if (!annotationIsGroup(entry)) return []
  return Array.isArray(entry.items) ? entry.items.filter((item) => item !== null && typeof item === 'object') : []
}

/**
 * Flatten one collection into element records for marks/chips/status: group
 * items inherit the group's shared requirement as their display note.
 * @param list - top-level collection entries.
 * @returns flattened records (copies).
 */
export function annotationFlattenRecords(list: unknown): AnnotationCollectionEntry[] {
  const records: AnnotationCollectionEntry[] = []
  for (const entry of Array.isArray(list) ? list : []) {
    if (entry === null || typeof entry !== 'object') continue
    if (annotationIsGroup(entry)) {
      const requirement = typeof entry.requirement === 'string' ? entry.requirement : ''
      for (const item of annotationGroupItems(entry)) records.push({ ...item, note: requirement })
    } else {
      records.push(entry)
    }
  }
  return records
}

/**
 * Total element count of one collection (single records + group items), the
 * quantity the 100-item cap is enforced on.
 * @param list - top-level collection entries.
 * @returns item count.
 */
export function annotationTotalItemCount(list: unknown): number {
  let count = 0
  for (const entry of Array.isArray(list) ? list : []) {
    if (entry === null || typeof entry !== 'object') continue
    count += annotationIsGroup(entry) ? annotationGroupItems(entry).length : 1
  }
  return count
}

/**
 * Find one element record by id across singles and group items (A3/T24).
 * Group items are returned with the group's shared requirement as `note`.
 * @param list - top-level collection entries.
 * @param refId - record id.
 * @returns record, or null.
 */
export function annotationFindRecord(list: unknown, refId: unknown): AnnotationCollectionEntry | null {
  if (typeof refId !== 'string' || refId.length === 0) return null
  for (const entry of Array.isArray(list) ? list : []) {
    if (entry === null || typeof entry !== 'object') continue
    const entryRecord = entry as LooseRecord
    if (annotationIsGroup(entryRecord)) {
      const item = annotationGroupItems(entryRecord).find((candidate) => candidate.id === refId)
      if (item !== undefined) {
        return { ...item, note: typeof entryRecord.requirement === 'string' ? entryRecord.requirement : (item.note ?? '') }
      }
      continue
    }
    if (entryRecord.id === refId) return entryRecord
  }
  return null
}

/**
 * Find one group entry by id.
 * @param list - top-level collection entries.
 * @param groupId - group id.
 * @returns group, or null.
 */
export function annotationFindGroup(list: unknown, groupId: unknown): AnnotationCollectionEntry | null {
  if (typeof groupId !== 'string' || groupId.length === 0) return null
  const found = (Array.isArray(list) ? list : []).find((entry) => annotationIsGroup(entry) && entry.id === groupId)
  return found ?? null
}

/**
 * A3/T24: build ONE group from a multi-selection. Every item keeps its full
 * captured identity (locator/bounds/session/workspace); the requirement is
 * shared on the group, never duplicated into per-item notes.
 * @param refs - selected ElementRefs.
 * @param requirement - shared requirement text.
 * @param sessionId - Session owning the selection.
 * @param now - epoch ms.
 * @param id - explicit group id (tests); generated otherwise.
 * @returns group entry, or null when there is no item.
 */
export function annotationGroupFromSelection(
  refs: unknown,
  requirement: unknown,
  sessionId: string | null,
  now?: number,
  id?: string
): AnnotationCollectionEntry | null {
  const list = Array.isArray(refs) ? refs.filter((ref) => ref !== null && typeof ref === 'object') as AnnotationCollectionEntry[] : []
  if (list.length === 0) return null
  const stamp = typeof now === 'number' && Number.isFinite(now) && now > 0 ? Math.round(now) : Date.now()
  const groupId = typeof id === 'string' && id.length > 0
    ? id
    : `psa-group-${stamp}-${Math.random().toString(36).slice(2, 8)}`
  const first = list[0]
  const fallbackSession = recordOrNull(first.session) ?? {}
  const ownerSessionId = typeof sessionId === 'string' && sessionId.length > 0
    ? sessionId
    : (typeof fallbackSession.sessionId === 'string' ? fallbackSession.sessionId : null)
  const items = list.map((ref) => {
    const refSession = recordOrNull(ref.session) ?? {}
    return {
      ...ref,
      session: {
        ...refSession,
        sessionId: recordOrNull(ref.session)?.sessionId ?? ownerSessionId
      },
      note: ''
    }
  })
  return {
    kind: 'group',
    id: groupId,
    at: stamp,
    createdAt: stamp,
    updatedAt: stamp,
    order: 0,
    session: { ...fallbackSession, sessionId: ownerSessionId },
    requirement: normalizeUserNote(requirement),
    items,
    collapsed: false,
    included: true
  }
}

/**
 * Append one group while enforcing the total item cap (singles + group items).
 * @param list - current collection.
 * @param group - group entry.
 * @param limit - total item limit, default 100.
 * @returns next collection and outcome.
 */
export function collectionAddGroup(list: unknown, group: unknown, limit?: number): AnnotationGroupMutation {
  const current: AnnotationCollectionEntry[] = Array.isArray(list) ? list : []
  const cap = typeof limit === 'number' && Number.isFinite(limit) && limit >= 1 ? Math.round(limit) : ANNOTATION_RECORD_LIMIT
  if (!annotationIsGroup(group) || annotationGroupItems(group).length === 0) return { list: current.slice(), added: false, rejected: false }
  if (annotationTotalItemCount(current) + annotationGroupItems(group).length > cap) {
    return { list: current.slice(), added: false, rejected: true }
  }
  const order = current.reduce((max, entry) => {
    const value = entry !== null && typeof entry === 'object' && typeof entry.order === 'number' && Number.isFinite(entry.order) ? entry.order : -1
    return Math.max(max, Number(value))
  }, -1) + 1
  return { list: current.concat([{ ...group, order }]), added: true, rejected: false }
}

/**
 * Apply several include-flag changes in one immutable pass (A3/T8
 * select-all / deselect-all / other-Session forced exclusion).
 * @param list - collection entries.
 * @param changes - requested flags.
 * @returns next entries.
 */
export function annotationApplyIncludes(list: unknown, changes: unknown): AnnotationCollectionEntry[] {
  if (!Array.isArray(list)) return []
  const flags = new Map<string, boolean>()
  for (const change of Array.isArray(changes) ? changes : []) {
    if (change === null || typeof change !== 'object') continue
    const source = change as LooseRecord
    if (typeof source.refId !== 'string') continue
    flags.set(source.refId, source.included === true)
  }
  if (flags.size === 0) return list.slice()
  return list.map((entry) => {
    if (entry === null || typeof entry !== 'object') return entry
    const source = entry as LooseRecord
    if (typeof source.id !== 'string' || !flags.has(source.id)) return entry
    const flag = flags.get(source.id)
    return source.included === flag ? entry : { ...entry, included: flag }
  })
}
