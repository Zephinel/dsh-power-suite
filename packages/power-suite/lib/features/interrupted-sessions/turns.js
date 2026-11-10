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
