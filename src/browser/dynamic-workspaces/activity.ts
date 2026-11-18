/**
 * Pure activity timestamps and pending-interaction derivation for the
 * "Running & recent" panel.
 *
 * Notices come from the client's own `SessionStatus.pendingInteraction`
 * (question / plan-review / approval) and are preview-only; the native composer
 * card remains the answering surface.
 *
 * @module
 */

/**
 * True last-activity timestamp: the newer of the Session summary and the Host
 * activity map.
 * @param activity - Host last-activity map.
 * @param sessionId - Session identity.
 * @param summary - Session summary row.
 * @returns epoch milliseconds (0 when unknown).
 */
export function dwEffectiveUpdatedAt(activity: unknown, sessionId: string, summary: unknown): number {
  const row = summary !== null && typeof summary === 'object' ? summary as Record<string, unknown> : {}
  const map = activity !== null && typeof activity === 'object' ? activity as Record<string, unknown> : {}
  const summaryAt = typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0
  const hostAt = typeof map[sessionId] === 'number' && Number.isFinite(map[sessionId]) ? map[sessionId] as number : 0
  return Math.max(summaryAt, hostAt)
}

/**
 * Derive waiting Session ids with a pending interaction, newest activity first.
 * @param input - derivation input (`list`, `statuses`, `currentSessionId`, `archived`, `activity`).
 * @returns waiting Session ids, newest activity first.
 */
export function dwPendingSessionIds(input: unknown): string[] {
  const source = input !== null && typeof input === 'object' ? input as Record<string, unknown> : {}
  const { list, statuses, currentSessionId, archived, activity } = source
  if (statuses === undefined || statuses === null || typeof (statuses as Map<string, unknown>).forEach !== 'function') return []
  const rows: Array<{ sessionId: string, updatedAt: number }> = []
  ;(statuses as Map<string, unknown>).forEach((statusValue, id) => {
    const status = statusValue !== null && typeof statusValue === 'object' ? statusValue as Record<string, unknown> : {}
    const pending = status.pendingInteraction
    if (pending === null || pending === undefined || typeof pending !== 'object') return
    if (status.running === false) return
    const pendingRecord = pending as Record<string, unknown>
    const kind = pendingRecord.kind
    if (kind !== 'question' && kind !== 'plan-review' && kind !== 'approval') return
    const sessionId = typeof pendingRecord.sessionId === 'string' && pendingRecord.sessionId.length > 0
      ? pendingRecord.sessionId
      : (typeof id === 'string' ? id : '')
    if (sessionId.length === 0) return
    if (typeof currentSessionId === 'string' && currentSessionId.length > 0 && sessionId === currentSessionId) return
    if (archived !== undefined && archived !== null && typeof (archived as Set<string>).has === 'function' && (archived as Set<string>).has(sessionId)) return
    const byId = (list !== null && typeof list === 'object' ? list as Record<string, unknown> : {}).byId
    const summary = byId !== null && typeof byId === 'object' ? (byId as Record<string, unknown>)[sessionId] : undefined
    if (summary === undefined || summary === null || typeof summary !== 'object') return
    const summaryRecord = summary as Record<string, unknown>
    if (summaryRecord.blank === true) return
    if (summaryRecord.origin === 'subagent') return
    rows.push({ sessionId, updatedAt: dwEffectiveUpdatedAt(activity, sessionId, summaryRecord) })
  })
  rows.sort((left, right) => right.updatedAt - left.updatedAt)
  return rows.map((row) => row.sessionId)
}
