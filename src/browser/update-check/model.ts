/**
 * Pure update-prompt state machine for the browser half.
 *
 * The Host route owns the registry/release-note reads; this module only
 * validates that answer, decides whether to prompt, and keeps the per-version
 * "later" / "do not remind" state. It touches no DOM, timer or storage, so
 * `test/update-check-model.test.js` imports it directly in Node, while
 * `src/client.js` imports the same functions for the live controller.
 *
 * @module
 */
import { isNewerStableVersion, parseStableVersion } from './versions.ts'

/** `localStorage` key holding this browser's prompt state. */
export const UPDATE_STORAGE_KEY = 'power-suite.update-prompt'

/** Highest number of release-note highlights the prompt shows. */
export const UPDATE_HIGHLIGHTS_MAX = 6

/** "Later" clicks after which the prompt offers "do not remind". */
export const UPDATE_LATER_LIMIT = 3

/** Schema version of the stored state; other versions read as empty. */
export const UPDATE_STATE_SCHEMA = 1

/** Persisted per-browser prompt state. */
export interface UpdatePromptState {
  laterVersion?: string
  laterClicks?: number
  silencedVersion?: string
}

/** A usable Host update answer. */
export interface UpdatePromptView {
  current: string
  latest: string
  updateAvailable: true
  highlights: string[]
}

/** What one update answer does to the prompt. */
export type UpdatePromptDecision =
  | { action: 'none', state: UpdatePromptState }
  | {
      action: 'prompt'
      state: UpdatePromptState
      prompt: { current: string, latest: string, highlights: string[] }
      canSilence: boolean
    }

/**
 * Keep only non-empty text highlights, capped at the prompt limit.
 * @param value - candidate highlight list.
 * @returns usable highlights.
 */
export function normalizeUpdateHighlights(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const highlights: string[] = []
  for (const point of value) {
    if (typeof point !== 'string') continue
    const text = point.trim()
    if (text.length === 0) continue
    highlights.push(text)
    if (highlights.length === UPDATE_HIGHLIGHTS_MAX) break
  }
  return highlights
}

/**
 * Validate one Host update answer. Anything unusable reads as "no prompt": a
 * failed route, a prerelease target, or a missing running version all stay
 * silent.
 * @param raw - parsed JSON body of the update route.
 * @returns the normalized view, or null when no prompt is possible.
 */
export function normalizeUpdatePayload(raw: unknown): UpdatePromptView | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const view = raw as Record<string, unknown>
  if (view.updateAvailable !== true) return null
  if (typeof view.current !== 'string') return null
  if (typeof view.latest !== 'string' || parseStableVersion(view.latest) === null) return null
  return {
    current: view.current,
    latest: view.latest,
    updateAvailable: true,
    highlights: normalizeUpdateHighlights(view.highlights)
  }
}

/**
 * Later clicks counted for one version; a different version restarts the count.
 * @param state - persisted prompt state.
 * @param version - version the prompt is about.
 * @returns clicks recorded for that version.
 */
function laterClicksFor(state: unknown, version: string): number {
  if (state === null || typeof state !== 'object') return 0
  const record = state as Record<string, unknown>
  if (record.laterVersion !== version) return 0
  return typeof record.laterClicks === 'number' && Number.isSafeInteger(record.laterClicks) && record.laterClicks >= 0
    ? record.laterClicks
    : 0
}

/**
 * Decide what one update answer does to the prompt.
 * @param view - Host answer; normalized or raw.
 * @param state - persisted prompt state.
 * @returns the decision and the state it leaves behind.
 */
export function decideUpdatePrompt(view: unknown, state: unknown): UpdatePromptDecision {
  const current: UpdatePromptState = state !== null && typeof state === 'object'
    ? state as UpdatePromptState
    : {}
  if (view === null || typeof view !== 'object' || Array.isArray(view)) return { action: 'none', state: current }
  const record = view as Record<string, unknown>
  const running = typeof record.current === 'string' ? record.current : ''
  // An unreadable placeholder or a prerelease running version never prompts and
  // never clears the recorded cycle.
  if (parseStableVersion(running) === null || running === '0.0.0') return { action: 'none', state: current }
  const latest = typeof record.latest === 'string' ? record.latest : ''
  // `latest: null` means the registry read failed: keep the cycle so a network
  // blip does not lose a silence or a later-click count.
  if (parseStableVersion(latest) === null) return { action: 'none', state: current }
  // A route that clearly answered "already current" retires the cycle.
  if (!isNewerStableVersion(latest, running)) return { action: 'none', state: {} }
  if (record.updateAvailable !== true) return { action: 'none', state: current }
  if (current.silencedVersion === latest) return { action: 'none', state: current }
  return {
    action: 'prompt',
    state: current,
    prompt: { current: running, latest, highlights: normalizeUpdateHighlights(record.highlights) },
    canSilence: offersSilence(current, latest)
  }
}

/**
 * Record one "later" click for the version the prompt showed.
 * @param state - persisted prompt state.
 * @param version - version whose prompt was dismissed.
 * @returns the next state.
 */
export function noteUpdatePromptLater(state: unknown, version: string): UpdatePromptState {
  const base: UpdatePromptState = state !== null && typeof state === 'object' ? state as UpdatePromptState : {}
  return { ...base, laterVersion: version, laterClicks: laterClicksFor(base, version) + 1 }
}

/**
 * Silence the exact version the user asked to stop hearing about; a newer
 * version prompts again.
 * @param state - persisted prompt state (unused; kept for the symmetric API).
 * @param version - version to silence.
 * @returns the next state.
 */
export function silenceUpdatePromptVersion(state: unknown, version: string): UpdatePromptState {
  void state
  return { silencedVersion: version }
}

/**
 * Whether the prompt should offer its "do not remind" action.
 * @param state - persisted prompt state.
 * @param version - version the prompt is about.
 * @returns true from the configured later-click count on.
 */
export function offersSilence(state: unknown, version: string): boolean {
  return laterClicksFor(state, version) >= UPDATE_LATER_LIMIT
}

/**
 * Parse one stored state document. Corrupt, foreign, or future documents reset
 * to empty instead of throwing or migrating.
 * @param raw - `localStorage` value.
 * @returns usable state.
 */
export function parseUpdatePromptState(raw: unknown): UpdatePromptState {
  if (typeof raw !== 'string' || raw.length === 0) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const record = parsed as Record<string, unknown>
  if (record.schema !== UPDATE_STATE_SCHEMA) return {}
  const state: UpdatePromptState = {}
  if (parseStableVersion(record.laterVersion) !== null
    && typeof record.laterClicks === 'number'
    && Number.isSafeInteger(record.laterClicks)
    && record.laterClicks >= 0
    && typeof record.laterVersion === 'string') {
    state.laterVersion = record.laterVersion
    state.laterClicks = record.laterClicks
  }
  if (parseStableVersion(record.silencedVersion) !== null && typeof record.silencedVersion === 'string') {
    state.silencedVersion = record.silencedVersion
  }
  return state
}

/**
 * Serialize the persisted state, always tagged with the schema version.
 * @param state - prompt state.
 * @returns the JSON document written to `localStorage`.
 */
export function serializeUpdatePromptState(state: unknown): string {
  const source = state !== null && typeof state === 'object' ? state as UpdatePromptState : {}
  const payload: Record<string, unknown> = { schema: UPDATE_STATE_SCHEMA }
  if (parseStableVersion(source.laterVersion) !== null && typeof source.laterVersion === 'string') {
    payload.laterVersion = source.laterVersion
    payload.laterClicks = laterClicksFor(source, source.laterVersion)
  }
  if (parseStableVersion(source.silencedVersion) !== null && typeof source.silencedVersion === 'string') {
    payload.silencedVersion = source.silencedVersion
  }
  return JSON.stringify(payload)
}
