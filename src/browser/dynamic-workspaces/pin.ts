/**
 * Pinned main Sessions for the dynamic-Workspaces "Running & recent" card.
 *
 * The card's pin is panel-owned but Host-shared: the local cache paints the
 * first frame and queues operations offline, while `dwPinEffectiveIds` replays
 * those operations for an optimistic toggle. The `dwPinPanelRows` derivation
 * keeps pinned Sessions on top and alive past the finished-retention window
 * without ever re-timing them.
 *
 * The cache reads `globalThis.localStorage` at call time so the browser uses the
 * real store and Node tests can install a deterministic stand-in.
 *
 * @module
 */

import { dwOwningWorkspace, dwSessionRunning, dwWorkspaceLabel } from './rows.ts'
import type { Translate, WorkspaceRow } from './rows.ts'
import { dwEffectiveUpdatedAt } from './activity.ts'

/** localStorage key caching the card's pinned main-Session ids. */
const DW_PIN_KEY = 'power-suite.dynamic-workspaces.pinned'

/** Schema version of the cached pin document. */
export const DW_PIN_VERSION = 1

/** Most pinned ids one document keeps; the Host drops the oldest pin first. */
const DW_PIN_LIMIT = 500

/** Most queued operations the local cache keeps for a retry. */
export const DW_PIN_MAX_PENDING = 200

/** Longest accepted Session id; the Host validator uses the same bound. */
const DW_PIN_MAX_ID_LENGTH = 200

/** One queued pin operation. */
export interface PendingPinOp {
  op: 'pin' | 'unpin'
  id: string
}

/** One cached pin state: confirmed ids, queued operations, migration marker. */
export interface PinCache {
  version: number
  rev: number
  pinned: string[]
  pending: PendingPinOp[]
  migrated: boolean
}

/** Persisted cache fields; the reader is the sanitizing boundary. */
export interface PinCacheInput {
  rev?: unknown
  pinned?: unknown
  pending?: unknown
  migrated?: unknown
}

/** The minimal localStorage surface the cache needs. */
interface PinStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** One card row. */
export interface PanelRow {
  id: string
  title: string
  workspace: string
  workspacePath: string
  workspaceId: unknown
  cwd: string | null
  updatedAt: number
  subagents: number
  state: 'running' | 'done'
  pinned?: boolean
}

/** Derivation input for {@link dwPinPanelRows}. */
export interface PinPanelInput {
  list: unknown
  statuses: unknown
  workspaces: readonly WorkspaceRow[]
  t: Translate
  runningParents: Map<string, number>
  archived: Set<string>
  activity: unknown
  pinnedIds: Set<string>
  runningRows: readonly PanelRow[]
  recentRows: readonly PanelRow[]
}

/**
 * Read the browser's localStorage bearer at call time, or null when the
 * platform (or a storage-denied context) does not expose a usable store.
 * @returns the storage surface, or null.
 */
function pinStorage(): PinStorage | null {
  const candidate = (globalThis as { localStorage?: unknown }).localStorage
  if (candidate === null || typeof candidate !== 'object') return null
  const storage = candidate as Partial<PinStorage>
  if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return null
  return storage as PinStorage
}

/**
 * Sanitize one pinned-id source into a Set.
 *
 * Accepts a bare id array (the cache/Host document shape) or an object with
 * `pinned` / `pinnedSessionIds` arrays (older cached documents and test
 * fixtures). Only non-empty string ids are kept, each id appears once, and the
 * list is bounded to the Host document limit.
 * @param value - id array or an object carrying one.
 * @returns valid pinned Session ids.
 */
export function dwSanitizePinnedIds(value: unknown): Set<string> {
  const pinned = new Set<string>()
  let source: unknown[] = []
  if (Array.isArray(value)) source = value
  else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.pinned)) source = record.pinned
    else if (Array.isArray(record.pinnedSessionIds)) source = record.pinnedSessionIds
  }
  for (const id of source) {
    if (typeof id !== 'string' || id.length === 0 || id.length > DW_PIN_MAX_ID_LENGTH) continue
    pinned.add(id)
    if (pinned.size >= DW_PIN_LIMIT) break
  }
  return pinned
}

/**
 * Effective pinned ids for painting: the confirmed set with the queued
 * operations replayed on top, so a toggle shows immediately while its Host
 * write is still in flight/failed.
 * @param pinned - confirmed pinned ids.
 * @param pending - queued operations.
 * @returns effective pinned ids.
 */
export function dwPinEffectiveIds(pinned: unknown, pending: unknown): Set<string> {
  const ids = dwSanitizePinnedIds(pinned)
  if (Array.isArray(pending)) {
    for (const entry of pending) {
      if (entry === null || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      if (typeof record.id !== 'string' || record.id.length === 0) continue
      if (record.op === 'pin') ids.add(record.id)
      else if (record.op === 'unpin') ids.delete(record.id)
    }
  }
  return ids
}

/**
 * Read the cached pin state: last Host document seen, queued operations, and
 * whether this browser has reconciled with the Host at least once. Corrupt,
 * missing, or storage-denied documents read as an empty local state.
 * @returns the cached state.
 */
export function dwReadPinCache(): PinCache {
  const fallback: PinCache = { version: DW_PIN_VERSION, rev: 0, pinned: [], pending: [], migrated: false }
  try {
    const storage = pinStorage()
    const raw = storage === null ? null : storage.getItem(DW_PIN_KEY)
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return fallback
    const record = value as Record<string, unknown>
    const pending: PendingPinOp[] = []
    if (Array.isArray(record.pending)) {
      for (const entry of record.pending) {
        if (entry === null || typeof entry !== 'object') continue
        const op = (entry as Record<string, unknown>).op
        if (op !== 'pin' && op !== 'unpin') continue
        const id = (entry as Record<string, unknown>).id
        if (typeof id !== 'string' || id.length === 0 || id.length > DW_PIN_MAX_ID_LENGTH) continue
        pending.push({ op, id })
        if (pending.length >= DW_PIN_MAX_PENDING) break
      }
    }
    const rev = typeof record.rev === 'number' && Number.isFinite(record.rev) && record.rev >= 0
      ? Math.floor(record.rev)
      : 0
    return {
      version: DW_PIN_VERSION,
      rev,
      pinned: [...dwSanitizePinnedIds(record.pinned)],
      pending,
      migrated: record.migrated === true
    }
  } catch {
    return fallback
  }
}

/**
 * Persist the cached pin state.
 * @param state - cached state (fields are written verbatim).
 * @returns nothing.
 */
export function dwWritePinCache(state: PinCacheInput): void {
  try {
    const storage = pinStorage()
    if (storage === null) return
    storage.setItem(DW_PIN_KEY, JSON.stringify({
      version: DW_PIN_VERSION,
      rev: state.rev,
      pinned: state.pinned,
      pending: state.pending,
      migrated: state.migrated
    }))
  } catch {
    // A storage-denied browser keeps the in-memory state only.
  }
}

/**
 * One card row for a pinned main Session that is not running and outside the
 * finished-retention window: the pinned "never retires" case. The row keeps
 * the Session's own effective end time, so unpinning re-derives it with the
 * current rules instead of restarting a timer or resetting the end time.
 * @param summary - Session summary.
 * @param owner - owning Workspace row.
 * @param id - Session id.
 * @param t - dynamic-Workspaces translate.
 * @param updatedAt - effective last-activity time.
 * @returns the pinned row.
 */
function dwPinnedRow(summary: unknown, owner: WorkspaceRow | null, id: string, t: Translate, updatedAt: number): PanelRow {
  const record = summary as Record<string, unknown>
  return {
    id,
    title: typeof record.displayTitle === 'string' && record.displayTitle.length > 0 ? record.displayTitle : id,
    workspace: owner === null ? t('group.ungrouped') : dwWorkspaceLabel(owner, t),
    workspacePath: owner !== null && typeof owner.path === 'string' ? owner.path : '',
    workspaceId: owner !== null ? owner.workspaceId : null,
    cwd: typeof record.cwd === 'string' && record.cwd.length > 0 ? record.cwd : null,
    updatedAt,
    subagents: 0,
    state: 'done',
    pinned: true
  }
}

/**
 * Combine the card's derived rows with the pinned main Sessions.
 *
 * Pinned rows always lead the card, newest activity first, and are listed
 * regardless of the running / finished-retention window: the card's pin is a
 * "keep this here" state, so time never retires it. The remaining rows keep
 * exactly the existing running-then-recent order. Pinned running rows keep
 * their running state and subagent count; a pinned finished Session outside the
 * retention window is listed with `state:'done'` and its own original end time
 * (unpin uses the same facts to re-derive the row by the ordinary rules).
 * Blank, archived, subagent, and unknown Sessions are never listed, exactly like
 * the ordinary card rows.
 * @param input - derivation input.
 * @returns card rows, pinned first.
 */
export function dwPinPanelRows(input: PinPanelInput): PanelRow[] {
  const {
    list, statuses, workspaces, t, runningParents, archived, activity, pinnedIds, runningRows, recentRows
  } = input
  const runningById = new Map<string, PanelRow>(runningRows.map((row): [string, PanelRow] => [row.id, row]))
  const recentById = new Map<string, PanelRow>(recentRows.map((row): [string, PanelRow] => [row.id, row]))
  const pinnedRows: PanelRow[] = []
  if (list !== null && typeof list === 'object') {
    const source = list as Record<string, unknown>
    if (source.byId !== undefined && Array.isArray(source.ids)) {
      const byId = source.byId as Record<string, unknown>
      for (const rawId of source.ids as unknown[]) {
        const id = rawId as string
        if (!pinnedIds.has(id)) continue
        const running = runningById.get(id)
        if (running !== undefined) {
          pinnedRows.push({ ...running, pinned: true })
          continue
        }
        const recent = recentById.get(id)
        if (recent !== undefined) {
          pinnedRows.push({ ...recent, pinned: true })
          continue
        }
        const summary = byId[id]
        const record = summary as Record<string, unknown>
        if (summary === undefined || record.blank === true || record.origin === 'subagent') continue
        if (archived.has(id)) continue
        const owner = dwOwningWorkspace(id, workspaces)
        const row = dwPinnedRow(
          summary,
          owner,
          id,
          t,
          dwEffectiveUpdatedAt(activity, id, summary)
        )
        const runningNow = dwSessionRunning(id, summary, statuses) || runningParents.has(id)
        row.state = runningNow ? 'running' : 'done'
        row.subagents = runningNow ? (runningParents.get(id) ?? 0) : 0
        pinnedRows.push(row)
      }
    }
  }
  pinnedRows.sort((left, right) => right.updatedAt - left.updatedAt)
  const ordinary = runningRows
    .filter((row) => !pinnedIds.has(row.id))
    .concat(recentRows.filter((row) => !pinnedIds.has(row.id)))
    .map((row) => ({ ...row, pinned: false }))
  return pinnedRows.concat(ordinary)
}
