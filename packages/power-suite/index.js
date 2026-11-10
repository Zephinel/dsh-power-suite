/**
 * Host half of DSH Power Suite.
 *
 * One Host plugin owns every feature's Host-side registrations, so the suite
 * installs as one plugin and each feature stays a module under `lib/features/`.
 * Features register inside `apply` through `ctx.effect`, which ties their
 * lifetime to this entry.
 */

import { installInterruptedSessions } from './lib/features/interrupted-sessions/host.js'
import { installPromptHistory } from './lib/features/prompt-history/host.js'
import { installSessionArtifacts } from './lib/features/session-artifacts/host.js'
import { installSettings } from './lib/features/settings/host.js'
import { installWorkspacePresets } from './lib/features/workspace-presets/host.js'

/** Stable Loader identity. */
export const name = 'power-suite'

/**
 * Services required by the suite's features.
 *
 * The union covers every feature; `inject` keeps the entry inactive in
 * compositions that cannot satisfy it instead of throwing, and a feature that
 * does not use one costs nothing.
 */
export const inject = [
  'agents',
  'agentPresets',
  'connection',
  'fs',
  'sessionQuery',
  'webServer',
  'workspaceRegistry'
]

/**
 * Register every feature's Host surface.
 * @param {object} ctx - Host context.
 * @returns {void}
 */
export function apply(ctx) {
  installSessionArtifacts(ctx)
  installWorkspacePresets(ctx)
  installPromptHistory(ctx)
  installInterruptedSessions(ctx)
  installSettings(ctx)
}
