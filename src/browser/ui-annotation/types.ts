/**
 * Shared types of the UI element annotation surface.
 *
 * The controller owns the one mutable snapshot; the React surface and the
 * installer only read these shapes. Keeping them in a type-only module avoids a
 * runtime import cycle between the controller, the components and the install
 * effect: every import here is erased.
 *
 * @module
 */

import type { AnnotationLayoutMode, DetailCardPosition, Point, Rect } from './geometry.ts'
import type { AnnotationCollectionEntry } from './records.ts'
import type { AnnotationState } from './reducer.ts'
import type { AnnotationModifierSettings } from './settings.ts'

/** One mark descriptor drawn over the page for a current-Session record. */
export interface AnnotationMarkDescriptor {
  id: string
  index: number
  rect: Rect
  stale: boolean
  summary: string
  empty: boolean
}

/** One record's live resolution detail shown by the popover and the mark card. */
export interface AnnotationStatusDetail {
  status: string
  via?: string
  confidence?: 'strong' | 'weak'
}

/** The single-slot undo payload produced by a removal. */
export interface AnnotationMarkUndo {
  kind?: string
  record?: unknown
  records?: unknown[]
  group?: unknown
  index?: number
  at?: number
}

/** The expanded entry note editor anchor. */
export interface AnnotationNoteEditorState extends Point {
  refId: string
}

/** The × affordance shown over a hovered composer reference chip. */
export interface AnnotationChipAction {
  x: number
  y: number
  width: number
  height: number
}

/** The composer-chip hover preview model, clamped beside the chip. */
export type AnnotationChipPreview =
  | ({ kind: 'batch', count: number, items: Array<{ label: string, note: string }> } & DetailCardPosition)
  | ({ kind: 'record', refId: string } & DetailCardPosition)

/** The floating detail card for one page mark. */
export interface AnnotationDetailCard extends DetailCardPosition {
  refId: string
  mode: 'view' | 'edit'
}

/** The secondary confirmation before an exit that would clear records. */
export interface AnnotationExitConfirm {
  count: number
}

/** The one immutable snapshot the controller publishes to React. */
export interface AnnotationSnapshot {
  state: AnnotationState
  settings: AnnotationModifierSettings
  launcherPosition: Point
  launcherDragging: boolean
  railWidth: number
  railCollapsed: boolean
  layoutMode: AnnotationLayoutMode
  hoverRect: Rect | null
  selectionRects: Array<{ id: string, rect: Rect }>
  boxRect: Rect | null
  popoverPosition: Point | null
  popoverPinned: boolean
  batchPosition: Point | null
  batchPinned: boolean
  flashRefId: string | null
  flashRect: Rect | null
  noteEditor: AnnotationNoteEditorState | null
  chipPreview: AnnotationChipPreview | null
  chipAction: AnnotationChipAction | null
  exitConfirm: AnnotationExitConfirm | null
  markRects: AnnotationMarkDescriptor[]
  markerHoverId: string | null
  detailCard: AnnotationDetailCard | null
  settingsOpen: boolean
  markUndo: AnnotationMarkUndo | null
}

/** The observable store the overlay subscribes to. */
export interface AnnotationStore {
  getSnapshot(): AnnotationSnapshot
  subscribe(listener: () => void): () => void
  set(next: AnnotationSnapshot): void
}

/** The Composer insertion actions the annotation surface calls. */
export interface AnnotationInputActions {
  captureInsertion?: () => unknown
  insertText?: (text: string, span: unknown) => boolean
  insertReference?: (reference: unknown, span: unknown) => boolean
}

/**
 * Long-lived bridge to the mounted Composer seat. The seat mirrors the current
 * Session identity here; the controller reads it for record capture and
 * insertion. Everything is all-or-nothing.
 */
export interface AnnotationBridge {
  sessionId: string | null
  inputActions: AnnotationInputActions | null
  sessionCwd: string | null
}

/** The services resolved by the dynamic composer inject. */
export interface AnnotationComposerServices {
  conversation?: unknown
  inputTriggers?: unknown
}

/** The narrow session service slice the controller reads for the input facade. */
export interface AnnotationSessionScope {
  scope?: (sessionId: string) => unknown
}

/** The narrow live-session list slice the controller reads as a cwd fallback. */
export interface AnnotationSessionList {
  getSnapshot?: () => unknown
}

/** The narrow client context slice the controller reads. */
export interface AnnotationControllerContext {
  sessions?: AnnotationSessionScope & { list?: AnnotationSessionList }
}

/** The record still to insert, narrowed to what the chip serializers read. */
export type AnnotationRecordEntry = AnnotationCollectionEntry

/** A probe result proving the fallback status cache does not rescan the DOM. */
export interface AnnotationFallbackScanProbe {
  ok: boolean
  reason?: string
  id?: string
  before?: number
  firstDelta?: number
  secondDelta?: number
  resolutionFirstDelta?: number
  resolutionSecondDelta?: number
  status?: string
  confidence?: string
}
