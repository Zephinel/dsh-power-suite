/**
 * Shared Session-row derivation primitives for dynamic Workspaces.
 *
 * The running/recent rows, the pinned-first card and the Workspace buckets all
 * need the same three facts: a Workspace's display label, which Workspace owns a
 * Session, and whether a Session is running right now. They live here so the
 * pure models (pin, and later the row builders themselves) import one copy
 * instead of re-deriving them.
 *
 * @module
 */

/** Namespace-bound translate seat (`t(key, params)`). */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/** One Workspace row as the client sees it (`WorkspaceView`). */
export interface WorkspaceRow {
  readonly workspaceId?: unknown
  readonly title?: unknown
  readonly path?: unknown
  readonly sessionIds?: unknown
}

/**
 * Display label of one Workspace: durable title, then directory basename.
 * @param workspace - WorkspaceView row.
 * @param t - namespace-bound translate.
 * @returns the workspace label.
 */
export function dwWorkspaceLabel(workspace: unknown, t: Translate): string {
  if (workspace === null || typeof workspace !== 'object') return t('group.untitled')
  const source = workspace as Record<string, unknown>
  const title = typeof source.title === 'string' ? source.title.trim() : ''
  if (title.length > 0) return title
  const path = typeof source.path === 'string' ? source.path.replace(/[\\/]+$/, '') : ''
  const parts = path.split(/[\\/]/)
  const base = parts.length > 0 ? parts[parts.length - 1] : ''
  return base.length > 0 ? base : t('group.untitled')
}

/**
 * Whether one Session currently counts as running.
 *
 * The live Session-status snapshot is authoritative once it knows the row; the
 * list summary's running bit is the fallback while the status baseline is still
 * in flight.
 * @param sessionId - Session identity.
 * @param summary - Session list summary, if any.
 * @param statuses - live status snapshot.
 * @returns whether the Session is running.
 */
export function dwSessionRunning(sessionId: string, summary: unknown, statuses: unknown): boolean {
  if (statuses !== undefined && statuses !== null && typeof (statuses as Map<string, unknown>).get === 'function') {
    const status = (statuses as Map<string, unknown>).get(sessionId)
    if (status !== undefined && status !== null) {
      const running = (status as Record<string, unknown>).running
      if (typeof running === 'boolean') return running
    }
  }
  return summary !== undefined && summary !== null && (summary as Record<string, unknown>).running === true
}

/**
 * Owning Workspace row for one Session.
 * @param sessionId - Session identity.
 * @param workspaces - Workspace rows.
 * @returns the owning Workspace, or null when no Workspace accounts for the Session.
 */
export function dwOwningWorkspace(sessionId: string, workspaces: readonly WorkspaceRow[]): WorkspaceRow | null {
  for (const candidate of workspaces) {
    if (Array.isArray(candidate.sessionIds) && (candidate.sessionIds as unknown[]).includes(sessionId)) return candidate
  }
  return null
}
