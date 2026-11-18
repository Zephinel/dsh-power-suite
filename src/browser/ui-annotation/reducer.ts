/**
 * Pure state machine for UI-element annotation.
 *
 * The overlay renders one immutable snapshot and dispatches actions: the mode
 * phase, hovered element, single/multi selection, the note draft, the rail body
 * and filter, collection mutations, undo, and the Esc ladder all reduce here.
 * There is no DOM, storage, clock, or translation access; the controller owns
 * those and passes already-collected records and localized text in. Every
 * unchanged action returns the same state reference so the React store can
 * skip a render.
 *
 * @module
 */

import { identityKeyOf } from './identity.ts'
import type { AnnotationElementRef } from './identity.ts'
import { normalizeAnnotationBounds } from './format.ts'
import type { AnnotationBounds } from './format.ts'
import { normalizeUserNote } from './text.ts'
import {
  ANNOTATION_RECORD_LIMIT,
  annotationApplyIncludes,
  annotationIsGroup,
  annotationUndoRestore,
  collectionAdd,
  collectionAddGroup,
  collectionClear,
  collectionRemove,
  collectionSetNote,
  moveAnnotationRecord,
  removeAnnotationRecord,
  restoreAnnotationRecord,
  toggleAnnotationInclude,
  upsertAnnotationRecord
} from './records.ts'
import type { AnnotationCollectionEntry } from './records.ts'

/** Overlay phase: off, idle, inspecting a hovered element, or selected/multi. */
export type AnnotationPhase = 'off' | 'idle' | 'inspect' | 'selected' | 'multi'

/** Rail body: the managed list, modifier settings, or the legacy status view. */
export type AnnotationView = 'collection' | 'settings' | 'status'

/** Rail filter derived from the collection entry kinds. */
export type AnnotationFilter = 'all' | 'single' | 'group'

/** One transient feedback toast. */
export interface AnnotationFeedback {
  kind?: string
  text?: string
  at?: number
}

/** The immutable annotation snapshot owned by the reducer. */
export interface AnnotationState {
  phase: AnnotationPhase
  view: AnnotationView
  hoverId: string | null
  selection: AnnotationElementRef[]
  note: string
  editing: boolean
  collection: AnnotationCollectionEntry[]
  filter: AnnotationFilter
  batchOpen: boolean
  passThrough: boolean
  box: AnnotationBounds | null
  feedback: AnnotationFeedback | null
  sessionId: string | null
}

/** One dispatched action; only `type` is trusted, payload fields are sanitized per case. */
type AnnotationActionPayload = Record<string, unknown>

/**
 * The initial annotation state: mode off, nothing selected, empty collection.
 * @returns fresh state.
 */
export function createAnnotationState(): AnnotationState {
  return {
    phase: 'off',
    view: 'collection',
    hoverId: null,
    selection: [],
    note: '',
    editing: false,
    collection: [],
    filter: 'all',
    batchOpen: false,
    passThrough: false,
    box: null,
    feedback: null,
    sessionId: null
  }
}

/**
 * The note draft carried by one reference (single-selection popover seeding).
 * @param ref - ElementRef.
 * @returns note text.
 */
function noteOfRef(ref: unknown): string {
  return ref !== null && typeof ref === 'object' && typeof (ref as AnnotationElementRef).note === 'string'
    ? (ref as AnnotationElementRef).note
    : ''
}

/**
 * Phase implied by a selection cardinality.
 * @param count - selected element count.
 * @returns `idle`, `selected` or `multi`.
 */
function annotationPhaseForCount(count: number): 'idle' | 'selected' | 'multi' {
  if (count <= 0) return 'idle'
  return count === 1 ? 'selected' : 'multi'
}

/**
 * One deactivation path shared by every phase.
 * @param state - current state.
 * @returns next state.
 */
function annotationDeactivateState(state: AnnotationState): AnnotationState {
  return {
    ...state,
    phase: 'off',
    view: 'collection',
    hoverId: null,
    selection: [],
    note: '',
    editing: false,
    filter: 'all',
    batchOpen: false,
    passThrough: false,
    box: null,
    feedback: null
  }
}

/**
 * Pure annotation reducer.
 *
 * Actions: activate, deactivate, hover {targetId}, selectSingle {ref},
 * toggleMulti {ref}, setMulti {refs}, setNote {text}, beginEdit, endEdit,
 * openView {view}, collectionAdd {entry}, collectionUpdateNote {refId,
 * note}, collectionRemove {refId}, collectionClear, annotationCommit {record},
 * annotationUpdateNote {refId, note}, annotationRemove {refId},
 * annotationRestore {record, index}, annotationUndo {undo},
 * annotationInclude {refId, included}, annotationMove {refId, delta},
 * passThrough {on}, box {box}, feedback {feedback}, session {sessionId},
 * exitOne.
 * @param state - current state.
 * @param action - one action.
 * @returns next state, or the same reference when unchanged.
 */
export function reduceAnnotationState(state: unknown, action: unknown): AnnotationState {
  const current: AnnotationState = state !== null && typeof state === 'object'
    ? state as AnnotationState
    : createAnnotationState()
  const payload: AnnotationActionPayload = action !== null && typeof action === 'object'
    ? action as AnnotationActionPayload
    : {}
  switch (payload.type) {
    case 'activate': {
      if (current.phase !== 'off') return current
      // A3/T26: the managed annotation list is the default rail body; there is
      // no intermediate status/Collection navigation layer.
      return { ...current, phase: 'idle', view: 'collection', hoverId: null, selection: [], note: '', editing: false, filter: 'all', box: null, feedback: null }
    }
    case 'deactivate':
      return annotationDeactivateState(current)
    case 'hover': {
      if (current.phase === 'off') return current
      const targetId = typeof payload.targetId === 'string' && payload.targetId.length > 0 ? payload.targetId : null
      const phase = current.selection.length > 0 ? current.phase : (targetId === null ? 'idle' : 'inspect')
      if (current.hoverId === targetId && current.phase === phase) return current
      return { ...current, hoverId: targetId, phase }
    }
    case 'selectSingle': {
      const ref = payload.ref !== null && typeof payload.ref === 'object' ? payload.ref as AnnotationElementRef : null
      if (ref === null) return { ...current, phase: 'idle', selection: [], note: '', editing: false, batchOpen: false }
      // A3/T25: keep the collection sidebar open when the user selects a page
      // element while managing the list (the footer then offers Clear selection).
      return { ...current, phase: 'selected', selection: [ref], note: ref.note ?? '', editing: false, batchOpen: false, view: current.view === 'collection' ? 'collection' : 'status', hoverId: null }
    }
    case 'batchOpen': {
      const open = payload.open === true && current.phase === 'multi' && current.selection.length > 1
      if (current.batchOpen === open) return current
      return { ...current, batchOpen: open }
    }
    case 'toggleMulti': {
      const ref = payload.ref !== null && typeof payload.ref === 'object' ? payload.ref as AnnotationElementRef : null
      if (ref === null) return current
      const key = identityKeyOf(ref)
      const index = current.selection.findIndex((item) => identityKeyOf(item) === key)
      const selection = index >= 0
        ? current.selection.filter((item, itemIndex) => itemIndex !== index)
        : current.selection.concat([ref])
      return {
        ...current,
        selection,
        batchOpen: false,
        phase: annotationPhaseForCount(selection.length),
        // A3/T24: the batch popover writes ONE shared requirement; preserve it
        // while more elements are added/removed instead of resetting per item.
        note: selection.length === 1 ? (selection[0].note ?? '') : current.note,
        editing: false,
        view: current.view === 'collection' ? 'collection' : 'status',
        hoverId: null
      }
    }
    case 'setMulti': {
      const refs = Array.isArray(payload.refs) ? payload.refs : []
      const seen = new Set<string>()
      const selection: AnnotationElementRef[] = []
      for (const ref of refs) {
        if (ref === null || typeof ref !== 'object') continue
        const item = ref as AnnotationElementRef
        const key = identityKeyOf(item)
        if (seen.has(key)) continue
        seen.add(key)
        selection.push(item)
      }
      const merged = current.selection.concat(selection.filter((ref) => !current.selection.some((item) => identityKeyOf(item) === identityKeyOf(ref))))
      return {
        ...current,
        selection: merged,
        batchOpen: false,
        phase: annotationPhaseForCount(merged.length),
        note: merged.length === 1 ? noteOfRef(merged[0]) : current.note,
        editing: false,
        view: current.view === 'collection' ? 'collection' : 'status',
        hoverId: null
      }
    }
    case 'setNote':
      return { ...current, note: typeof payload.text === 'string' ? payload.text : '' }
    case 'setFilter': {
      const filter: AnnotationFilter = payload.filter === 'single' || payload.filter === 'group' ? payload.filter : 'all'
      return current.filter === filter ? current : { ...current, filter }
    }
    case 'beginEdit':
      return { ...current, editing: true }
    case 'endEdit':
      return { ...current, editing: false }
    case 'openView': {
      const view: 'settings' | 'collection' = payload.view === 'settings' ? 'settings' : 'collection'
      if (current.view === view && current.selection.length === 0 && current.view === 'collection') return current
      return { ...current, view, phase: 'idle', selection: [], note: '', editing: false, hoverId: null }
    }
    case 'collectionAdd': {
      const result = collectionAdd(current.collection, payload.entry)
      if (!result.added && !result.updated) return current
      return { ...current, collection: result.list }
    }
    case 'collectionUpdateNote':
      return { ...current, collection: collectionSetNote(current.collection, payload.refId, payload.note) }
    case 'collectionRemove':
      return { ...current, collection: collectionRemove(current.collection, payload.refId) }
    case 'collectionClear':
      return { ...current, collection: collectionClear() }
    case 'annotationCommit': {
      const record = payload.record !== null && typeof payload.record === 'object' ? payload.record : null
      if (record === null) return current
      const result = upsertAnnotationRecord(current.collection, record, ANNOTATION_RECORD_LIMIT, payload.now as number | undefined)
      if (!result.added && !result.updated) return current
      return { ...current, collection: result.list }
    }
    case 'annotationUpdateNote': {
      const refId = typeof payload.refId === 'string' ? payload.refId : ''
      if (refId.length === 0) return current
      const note = typeof payload.note === 'string' ? payload.note : ''
      const stamp = typeof payload.now === 'number' && Number.isFinite(payload.now) && payload.now > 0 ? Math.round(payload.now) : Date.now()
      let changed = false
      const collection = current.collection.map((entry) => {
        if (entry === null || typeof entry !== 'object' || entry.id !== refId) return entry
        changed = true
        if (entry.kind === 'group') return { ...entry, requirement: normalizeUserNote(note), updatedAt: stamp }
        return { ...entry, note, updatedAt: stamp }
      })
      return changed ? { ...current, collection } : current
    }
    case 'annotationRemove': {
      const next = removeAnnotationRecord(current.collection, payload.refId)
      return next.length === current.collection.length ? current : { ...current, collection: next }
    }
    case 'annotationRestore': {
      const record = payload.record !== null && typeof payload.record === 'object' ? payload.record : null
      if (record === null) return current
      return { ...current, collection: restoreAnnotationRecord(current.collection, record, payload.index as number | undefined) }
    }
    case 'annotationUndo': {
      const undo = payload.undo !== null && typeof payload.undo === 'object' ? payload.undo : null
      if (undo === null) return current
      return { ...current, collection: annotationUndoRestore(current.collection, undo) }
    }
    case 'groupAdd': {
      const result = collectionAddGroup(current.collection, payload.group, ANNOTATION_RECORD_LIMIT)
      if (!result.added) return current
      return { ...current, collection: result.list }
    }
    case 'groupToggleCollapsed': {
      const groupId = typeof payload.groupId === 'string' ? payload.groupId : ''
      let changed = false
      const collection = current.collection.map((entry) => {
        if (!annotationIsGroup(entry) || entry.id !== groupId) return entry
        changed = true
        return { ...entry, collapsed: entry.collapsed !== true }
      })
      return changed ? { ...current, collection } : current
    }
    case 'groupSet': {
      const group = payload.group !== null && typeof payload.group === 'object'
        && (payload.group as AnnotationCollectionEntry).kind === 'group'
        ? payload.group as AnnotationCollectionEntry
        : null
      if (group === null) return current
      let changed = false
      const collection = current.collection.map((entry) => {
        if (!annotationIsGroup(entry) || entry.id !== group.id) return entry
        changed = true
        return group
      })
      return changed ? { ...current, collection } : current
    }
    case 'groupRemove': {
      const groupId = typeof payload.groupId === 'string' ? payload.groupId : ''
      if (groupId.length === 0) return current
      const next = removeAnnotationRecord(current.collection, groupId)
      return next.length === current.collection.length ? current : { ...current, collection: next }
    }
    case 'groupRestore': {
      const group = payload.group !== null && typeof payload.group === 'object'
        && (payload.group as AnnotationCollectionEntry).kind === 'group'
        ? payload.group
        : null
      if (group === null) return current
      return { ...current, collection: restoreAnnotationRecord(current.collection, group, payload.index as number | undefined) }
    }
    case 'annotationInclude': {
      const next = toggleAnnotationInclude(current.collection, payload.refId, payload.included)
      let changed = false
      for (let index = 0; index < next.length; index += 1) {
        if (next[index] !== current.collection[index]) {
          changed = true
          break
        }
      }
      return changed ? { ...current, collection: next } : current
    }
    case 'annotationIncludes': {
      const changes = Array.isArray(payload.changes) ? payload.changes : []
      const next = annotationApplyIncludes(current.collection, changes)
      let changed = false
      for (let index = 0; index < next.length; index += 1) {
        if (next[index] !== current.collection[index]) {
          changed = true
          break
        }
      }
      return changed ? { ...current, collection: next } : current
    }
    case 'annotationRemoveMany': {
      const refIds = Array.isArray(payload.refIds) ? payload.refIds : []
      let collection = current.collection
      for (const refId of refIds) collection = removeAnnotationRecord(collection, refId)
      return collection.length === current.collection.length ? current : { ...current, collection }
    }
    case 'annotationMove': {
      const delta = payload.delta === -1 ? -1 : 1
      const next = moveAnnotationRecord(current.collection, payload.refId, delta)
      let changed = false
      for (let index = 0; index < next.length; index += 1) {
        if (next[index] !== current.collection[index]) {
          changed = true
          break
        }
      }
      return changed ? { ...current, collection: next } : current
    }
    case 'passThrough': {
      const on = payload.on === true
      if (current.passThrough === on) return current
      return { ...current, passThrough: on }
    }
    case 'box': {
      const box = normalizeAnnotationBounds(payload.box)
      if (box === null && current.box === null) return current
      return { ...current, box }
    }
    case 'feedback': {
      const feedback = payload.feedback !== null && typeof payload.feedback === 'object'
        ? payload.feedback as AnnotationFeedback
        : null
      if (feedback === null && current.feedback === null) return current
      return { ...current, feedback }
    }
    case 'session': {
      const sessionId = typeof payload.sessionId === 'string' && payload.sessionId.length > 0 ? payload.sessionId : null
      if (current.sessionId === sessionId) return current
      return {
        ...current,
        sessionId,
        hoverId: null,
        selection: [],
        note: '',
        editing: false,
        filter: 'all',
        box: null,
        view: 'collection',
        phase: current.phase === 'off' ? 'off' : 'idle'
      }
    }
    case 'exitOne': {
      if (current.editing) return { ...current, editing: false }
      if (current.view === 'settings') return { ...current, view: 'collection' }
      if (current.selection.length > 0) return { ...current, selection: [], note: '', editing: false, phase: 'idle', hoverId: null }
      if (current.phase !== 'off') return annotationDeactivateState(current)
      return current
    }
    default:
      return current
  }
}
