/**
 * Interrupted-session detection: the pure fold over a Session log that answers
 * whether the Session's last turn was cut off (by a Host restart) rather than
 * ended by the user or the model.
 *
 * A turn that ends normally records `turn/end` with its reason. The Harness
 * marks a Harness-caused cutoff in two ways: crash recovery appends a synthetic
 * `turn/end` with reason `interrupted`, while a graceful Host shutdown closes a
 * live turn as `aborted` with the `disposed` cancellation cause. A crash that
 * skipped both leaves the last `turn/start` open until the Session is next
 * loaded. An open turn whose Agent is currently running is live work, not an
 * interrupted one.
 */

/** Authenticated exact route reporting one Session's interruption state. */
export const INTERRUPTED_ROUTE = '/api/power-suite.interrupted'

/**
 * Narrow parsed JSON to a plain object.
 * @param {unknown} value - decoded value.
 * @returns {boolean} whether it is a record.
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The interruption rule shared by the log fold and the live event cache.
 * @param {string | null} kind - `turn/end` reason kind.
 * @param {string | null} cause - cancellation cause of an `aborted` ending.
 * @returns {boolean} whether this ending is a Harness-caused interruption.
 */
function interruptedEnd(kind, cause) {
  return kind === 'interrupted' || (kind === 'aborted' && cause === 'disposed')
}

/**
 * Whether one recorded `turn/end` reason is a Harness-caused interruption.
 * @param {unknown} reason - `turn/end` data.reason.
 * @returns {boolean} whether the Harness cut the task off.
 */
export function isInterruptedEnd(reason) {
  if (!isRecord(reason) || typeof reason.kind !== 'string') return false
  const cause = isRecord(reason.reason) && typeof reason.reason.kind === 'string' ? reason.reason.kind : null
  return interruptedEnd(reason.kind, cause)
}

/**
 * Fold one Session log into its last turn position.
 * @param {readonly object[]} events - raw events in ascending sequence order.
 * @returns {{ turn: number | null, open: boolean, endReason: string | null, endCause: string | null }} the last turn.
 */
export function lastTurnState(events) {
  let turn = null
  let endReason = null
  let endCause = null
  if (!Array.isArray(events)) return { turn, open: false, endReason, endCause }
  for (const event of events) {
    if (!isRecord(event)) continue
    if (event.type === 'turn/start') {
      const data = event.data
      if (!isRecord(data) || typeof data.turn !== 'number') continue
      if (turn !== null && data.turn <= turn) continue
      turn = data.turn
      endReason = null
      endCause = null
    } else if (event.type === 'turn/end') {
      const data = event.data
      const reason = isRecord(data) && isRecord(data.reason) ? data.reason : null
      endReason = reason !== null && typeof reason.kind === 'string' ? reason.kind : null
      endCause = reason !== null && isRecord(reason.reason) && typeof reason.reason.kind === 'string' ? reason.reason.kind : null
    }
  }
  return { turn, open: turn !== null && endReason === null, endReason, endCause }
}

/**
 * Decide whether a Session should be marked as interrupted.
 * @param {{ turn: number | null, open: boolean, endReason: string | null, endCause: string | null }} state - last turn state.
 * @param {boolean} running - whether the Session currently owns a running Agent.
 * @returns {boolean} whether its last task was interrupted.
 */
export function isInterrupted(state, running) {
  if (state.turn === null) return false
  if (state.open) return running !== true
  return interruptedEnd(state.endReason, state.endCause)
}

/**
 * Describe one Session's interruption state for the browser.
 * @param {{ turn: number | null, open: boolean, endReason: string | null, endCause: string | null }} state - last turn state.
 * @param {boolean} running - whether the Session currently runs.
 * @returns {{ interrupted: boolean, running: boolean, turn: number | null, reason: string | null, open: boolean }} the wire value.
 */
export function describeInterruption(state, running) {
  return {
    interrupted: isInterrupted(state, running),
    running,
    turn: state.turn,
    reason: state.endReason,
    open: state.open
  }
}

/**
 * Timestamp of the newest event in a Session log.
 * @param {readonly object[]} events - raw events in ascending sequence order.
 * @returns {number | null} epoch milliseconds, or null for an empty/invalid log.
 */
export function lastEventTime(events) {
  if (!Array.isArray(events)) return null
  let latest = null
  for (const event of events) {
    if (!isRecord(event) || typeof event.time !== 'number') continue
    if (latest === null || event.time > latest) latest = event.time
  }
  return latest
}

/**
 * Timestamp of the newest `turn/start` in a Session log.
 * @param {readonly object[]} events - raw events in ascending sequence order.
 * @returns {number | null} epoch milliseconds, or null when no turn started.
 */
export function lastTurnStartTime(events) {
  if (!Array.isArray(events)) return null
  let latest = null
  for (const event of events) {
    if (!isRecord(event) || event.type !== 'turn/start' || typeof event.time !== 'number') continue
    if (latest === null || event.time > latest) latest = event.time
  }
  return latest
}

/**
 * Timestamp of the newest completed turn boundary in a Session log.
 * @param {readonly object[]} events - raw events in ascending sequence order.
 * @returns {number | null} epoch milliseconds, or null when no turn ended.
 */
export function lastTurnEndTime(events) {
  if (!Array.isArray(events)) return null
  let latest = null
  for (const event of events) {
    if (!isRecord(event) || event.type !== 'turn/end' || typeof event.time !== 'number') continue
    if (latest === null || event.time > latest) latest = event.time
  }
  return latest
}

/**
 * Whether a delegated subagent's interrupted turn belongs to the parent's
 * latest completed turn. The parent is idle after its `turn/end`, so only a
 * descendant that was still active (or cut off) after that boundary means the
 * parent's task is incomplete.
 * A child belongs to the parent's latest turn when its turn started at or after
 * the parent's latest turn started, or when its last event is newer than the
 * parent's latest completed turn. The first condition catches a child that was
 * spawned during the last parent turn and then went silent before the restart.
 * @param {number | null} parentStartTime - parent's newest `turn/start` timestamp.
 * @param {number | null} parentEndTime - parent's newest `turn/end` timestamp.
 * @param {boolean} childInterrupted - whether the child's last turn was interrupted.
 * @param {boolean} childRunning - whether the child Agent is currently running.
 * @param {number | null} childStartTime - child's newest `turn/start` timestamp.
 * @param {number | null} childLastTime - child's newest event timestamp.
 * @returns {boolean} whether the parent should inherit the child interruption.
 */
export function subagentInterruptionAfter(parentStartTime, parentEndTime, childInterrupted, childRunning, childStartTime, childLastTime) {
  if (childRunning) return false
  if (childInterrupted !== true) return false
  const startedDuringLastTurn = typeof parentStartTime === 'number'
    && typeof childStartTime === 'number'
    && childStartTime >= parentStartTime
  const lastedPastEnd = typeof parentEndTime === 'number'
    && typeof childLastTime === 'number'
    && childLastTime > parentEndTime
  return startedDuringLastTurn || lastedPastEnd
}
