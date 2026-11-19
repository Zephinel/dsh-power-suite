/**
 * Pure interrupted-state decision for the browser half.
 *
 * Interrupted and running/loading are mutually exclusive in the same leading
 * seat: after Continue the Host can still report the previous turn as
 * interrupted while the continuation turn runs, so the badge is valid only for
 * an idle interrupted Session. The card row uses the same record-only rule
 * (the shell's combined running flag is deliberately not an input).
 *
 * @module
 */

/** One Host interruption record as held by the browser. */
export interface InterruptedRecord {
  status?: string
  interrupted?: boolean
  running?: boolean
  turn?: number | null
  open?: boolean
  reason?: string | null
  subagent?: boolean
}

/**
 * Whether a record should render the interrupted indicator.
 * @param record - one interrupted record.
 * @returns whether the warning badge/CTA should be visible.
 */
export function interruptedIndicatorActive(record: unknown): boolean {
  if (record === null || record === undefined || typeof record !== 'object') return false
  const value = record as InterruptedRecord
  return value.status === 'ready' && value.interrupted === true && value.running !== true
}

/**
 * Whether one "Running & recent" card row must render the interrupted mark.
 * @param record - Host interruption record.
 * @returns whether the card row shows the mark and its Continue CTA.
 */
export function interruptedCardMark(record: unknown): boolean {
  return interruptedIndicatorActive(record)
}
