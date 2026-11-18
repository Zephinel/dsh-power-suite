/**
 * Pure Files ↔ Artifacts toggle model for the browser half.
 *
 * The Files-header action swaps the Files pane for the current Session's
 * artifacts list with a short enter/exit transition. These helpers own the phase
 * machine and timings; the portal/rendering stays in the browser entry.
 *
 * @module
 */

/** View phases owned by the Files-header action. */
export const FILES_ARTIFACTS_PHASES = ['files', 'opening', 'open', 'closing'] as const

/** Enter transition length in ms (overlay fade + 14 px slide). */
export const FILES_ARTIFACTS_ENTER_MS = 180

/** Exit transition length in ms (reverse of the enter transition). */
export const FILES_ARTIFACTS_EXIT_MS = 160

/** One Files ↔ Artifacts phase. */
export type FilesArtifactsPhase = (typeof FILES_ARTIFACTS_PHASES)[number]

/** View state of the Files-header action. */
export interface FilesArtifactsState {
  phase: FilesArtifactsPhase
}

/** Initial view state. */
export function filesArtifactsInitialState(): FilesArtifactsState {
  return { phase: 'files' }
}

/**
 * Pure phase transition for the Files-header Artifacts toggle.
 *
 * Phases: files → opening → open → closing → files. `toggle` flips the
 * direction (also mid-transition), `opened`/`closed` come from the animation
 * timer, and any Session change resets to Files.
 * @param state - current state.
 * @param action - transition.
 * @returns next state; the same object when unchanged.
 */
export function filesArtifactsReduce(state: unknown, action: unknown): FilesArtifactsState {
  const current = state !== null && typeof state === 'object' ? state as Record<string, unknown> : {}
  const phase: FilesArtifactsPhase = (FILES_ARTIFACTS_PHASES as readonly unknown[]).includes(current.phase)
    ? current.phase as FilesArtifactsPhase
    : 'files'
  const type = action !== null && typeof action === 'object' ? (action as Record<string, unknown>).type : ''
  if (type === 'session') return phase === 'files' ? state as FilesArtifactsState : { phase: 'files' }
  if (type === 'toggle') {
    if (phase === 'files') return { phase: 'opening' }
    if (phase === 'opening') return { phase: 'closing' }
    if (phase === 'closing') return { phase: 'opening' }
    return { phase: 'closing' }
  }
  if (type === 'opened') return phase === 'opening' ? { phase: 'open' } : state as FilesArtifactsState
  if (type === 'closed') return phase === 'closing' ? { phase: 'files' } : state as FilesArtifactsState
  return state as FilesArtifactsState
}

/**
 * Timer length of one transition phase.
 * @param phase - phase name.
 * @param reducedMotion - whether reduced motion is requested.
 * @returns milliseconds; 0 swaps instantly.
 */
export function filesArtifactsPhaseMs(phase: string, reducedMotion: boolean): number {
  if (reducedMotion === true) return 0
  if (phase === 'opening') return FILES_ARTIFACTS_ENTER_MS
  if (phase === 'closing') return FILES_ARTIFACTS_EXIT_MS
  return 0
}
