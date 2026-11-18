/**
 * Prompt history: the pure fold that turns a Session's raw event log into the
 * texts a human sent to it, oldest first, with each event's epoch-ms time.
 *
 * Only `user/message` events whose recorded source kind is `user` count.
 * Injected user-role context (instructions, runtime context, skill catalogs)
 * is logged as user messages too, but with a different source kind, so it must
 * never appear in what the composer recalls. Blocks other than text (images,
 * files) contribute nothing; a prompt with no words has no history entry.
 */

/** Authenticated exact route serving one Session's sent-prompt history. */
export const PROMPT_HISTORY_ROUTE = '/api/prompt-history.list'

/** Most recent prompts one response carries. */
export const MAX_PROMPTS = 500

/**
 * Narrow parsed JSON to a plain object.
 * @param {unknown} value - decoded value.
 * @returns {value is Record<string, unknown>} whether it is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the human prompt text recorded by one session event.
 * @param {Record<string, unknown>} event - raw session event.
 * @returns {string | null} the prompt text, or null when this event is not one.
 */
export function promptTextOfEvent(event: unknown) {
  if (!isRecord(event) || event.type !== 'user/message') return null
  const data = event.data
  if (!isRecord(data)) return null
  const source = data.source
  if (!isRecord(source) || source.kind !== 'user') return null
  const content = data.content
  if (!Array.isArray(content)) return null
  const parts = []
  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  const text = parts.join('\n').trim()
  return text.length > 0 ? text : null
}

/**
 * Fold a complete Session log into its human prompt history.
 * @param {readonly object[]} events - raw session events in ascending seq order.
 * @param {number} limit - most recent prompts to keep.
 * @returns {Array<{ seq: number, text: string, at: number | null }>} prompts,
 *   oldest first; `at` is the event's epoch-ms time, or null when it has none.
 */
interface PromptRecord {
  seq: number
  text: string
  at: number | null
}

export function collectPromptHistory(events: unknown, limit = MAX_PROMPTS): PromptRecord[] {
  const prompts: PromptRecord[] = []
  if (!Array.isArray(events)) return prompts
  for (const event of events) {
    const text = promptTextOfEvent(event)
    if (text === null) continue
    prompts.push({
      seq: typeof event.seq === 'number' ? event.seq : 0,
      text,
      at: Number.isFinite(event.time) ? event.time : null
    })
  }
  return prompts.length > limit ? prompts.slice(-limit) : prompts
}
