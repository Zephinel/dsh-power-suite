/**
 * Card row "…" menu delegation to the native Session context menu.
 *
 * The dynamic-Workspaces card opens the shared native context-menu popup
 * against its own captured-target kind; the plugin's contribution resolves the
 * native `session` target and maps each native `MenuActionView` to a delegating
 * `MenuAction` whose `run` calls the nested resolution's `select` with the
 * ORIGINAL namespaced id. Pin/Unpin views are filtered out because the card owns
 * pinning through its title-left button.
 *
 * The popup itself (icons, shortcut hints, material, placement, focus,
 * dismissal) belongs to the shell's context-menu client; this module owns the
 * delegation contract and the nested occurrence lifetime only.
 *
 * @module
 */

/** Captured-target kind of the card row "…" menu. */
export const DW_ROW_MENU_TARGET = 'powerSuiteSession'

/** Budget for the nested native resolution to publish its actions. */
const DW_ROW_MENU_RESOLVE_BUDGET_MS = 800

/** One delegating action the shared popup renders. */
export interface RowMenuAction {
  id: string
  label: string
  run: () => void
  commandId?: unknown
  icon?: unknown
  disabled?: unknown
  danger?: unknown
  separatorBefore?: unknown
  afterContent?: unknown
  children?: RowMenuAction[]
}

/** The nested occurrence shape the shared menu service returns. */
interface NestedResolution {
  ready?: unknown
  source?: { getSnapshot?: () => unknown } | null
  select?: (id: string) => unknown
  dispose?: () => unknown
}

/** The shared menu service surface this module uses. */
interface ContextMenuService {
  resolve?: (target: { kind: 'session', value: { sessionId: string, displayTitle: string } }) => unknown
}

/**
 * Whether one native Session action view is a Pin/Unpin entry.
 *
 * The card owns pinning through its title-left pin button, so the row menu
 * keeps filtering these two views out — by the native action id suffix
 * (`session.pin/pin`, `session.pin/unpin`) or, if a shell build gives the entry
 * a different id, by its native icon key.
 * @param view - one native MenuActionView.
 * @returns true for a Pin/Unpin view.
 */
export function dwRowMenuIsPinView(view: unknown): boolean {
  if (view === null || view === undefined || typeof view !== 'object') return false
  const record = view as Record<string, unknown>
  const actionKey = String(record.id ?? '').split('/').pop()
  if (actionKey === 'pin' || actionKey === 'unpin') return true
  const icon = record.icon
  const iconKey = icon !== null && typeof icon === 'object'
    ? String((icon as Record<string, unknown>).key ?? '')
    : ''
  return iconKey === 'workspace.pin' || iconKey === 'workspace.unpin'
}

/**
 * Map native Session menu views to delegating shared-popup actions.
 *
 * The shared popup renders the actions handed to it, so the native presentation
 * fields (label, icon key, command id for the shortcut hint, disabled/danger
 * flags, the separator and footer positions, and nested children) are copied
 * verbatim. Selection is delegated: each mapped `run` calls the nested native
 * resolution's `select` with the ORIGINAL (namespaced) view id, so the native
 * behavior and any plugin-contributed action keep working. Pin/Unpin views are
 * filtered out and invalid entries are skipped.
 * @param views - native MenuActionViews.
 * @param select - nested resolution's `select(id)`.
 * @returns delegating actions in native order.
 */
export function dwRowMenuActions(views: unknown, select?: unknown): RowMenuAction[] {
  if (!Array.isArray(views)) return []
  const runSelection = typeof select === 'function' ? select as (id: string) => void : () => {}
  const actions: RowMenuAction[] = []
  for (const view of views) {
    if (view === null || view === undefined || typeof view !== 'object') continue
    const record = view as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) continue
    if (dwRowMenuIsPinView(view)) continue
    const action: RowMenuAction = {
      id: record.id,
      label: typeof record.label === 'string' ? record.label : '',
      run: () => runSelection(record.id as string)
    }
    // Only copy presentation fields the native view actually carries; the
    // popup's own defaults then match a native contribution without them.
    if (record.commandId !== undefined) action.commandId = record.commandId
    if (record.icon !== undefined) action.icon = record.icon
    if (record.disabled !== undefined) action.disabled = record.disabled
    if (record.danger !== undefined) action.danger = record.danger
    if (record.separatorBefore !== undefined) action.separatorBefore = record.separatorBefore
    if (record.afterContent !== undefined) action.afterContent = record.afterContent
    if (Array.isArray(record.children)) action.children = dwRowMenuActions(record.children, select)
    actions.push(action)
  }
  return actions
}

/**
 * Resolve one card row menu's delegating action list from the native Session target.
 *
 * The nested occurrence is owned by this call: it is disposed when the outer
 * preparation is aborted (dismissal, unload or a newer opening) or when the
 * resolution fails; a selection disposes it through the outer registry. The
 * dispose is deferred by one microtask because the outer registry aborts the
 * provider signal BEFORE it invokes the selected action's `run`, and the nested
 * `select` would otherwise be refused by the already-aborted nested lifetime.
 * The nested `ready` wait is bounded so one slow native provider cannot empty
 * the whole menu (the shared popup would otherwise show nothing).
 * @param contextMenus - shared menu service.
 * @param value - our captured target value (`{ sessionId, displayTitle }`).
 * @param signal - outer preparation signal.
 * @param budgetMs - bounded wait for the nested providers.
 * @returns delegating actions in native order (pin filtered).
 */
export function dwRowMenuResolve(
  contextMenus: unknown,
  value: unknown,
  signal: AbortSignal | null | undefined,
  budgetMs = DW_ROW_MENU_RESOLVE_BUDGET_MS
): Promise<RowMenuAction[]> {
  const source = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
  const sessionId = typeof source.sessionId === 'string' ? source.sessionId : ''
  if (sessionId.length === 0) return Promise.resolve([])
  if (contextMenus === null || contextMenus === undefined || typeof contextMenus !== 'object') return Promise.resolve([])
  const service = contextMenus as ContextMenuService
  if (typeof service.resolve !== 'function') return Promise.resolve([])
  const displayTitle = typeof source.displayTitle === 'string' ? source.displayTitle : ''
  let resolution: unknown
  try {
    resolution = service.resolve({ kind: 'session', value: { sessionId, displayTitle } })
  } catch {
    return Promise.resolve([])
  }
  if (resolution === null || resolution === undefined || typeof resolution !== 'object') return Promise.resolve([])
  const occurrence = resolution as NestedResolution
  let released = false
  const release = () => {
    if (released) return
    released = true
    try {
      if (typeof occurrence.dispose === 'function') occurrence.dispose()
    } catch {
      // A withdrawn occurrence needs no second dispose.
    }
  }
  if (signal === null || signal === undefined || signal.aborted === true) {
    release()
    return Promise.resolve([])
  }
  signal.addEventListener('abort', () => { queueMicrotask(release) }, { once: true })
  return (async () => {
    try {
      await new Promise<void>((settle) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          clearTimeout(timer)
          settle()
        }
        const timer = setTimeout(finish, Math.max(1, Number.isFinite(budgetMs) ? budgetMs : DW_ROW_MENU_RESOLVE_BUDGET_MS))
        Promise.resolve(occurrence.ready).then(finish, finish)
      })
      if (signal.aborted === true) return []
      const views = typeof occurrence.source?.getSnapshot === 'function' ? occurrence.source.getSnapshot() : []
      return dwRowMenuActions(views, (id: string) => {
        try {
          if (typeof occurrence.select === 'function') occurrence.select(id)
        } catch {
          // A dismissed occurrence refuses selection; the popup is closing.
        }
      })
    } catch {
      return []
    }
  })()
}
