/**
 * Host half of DSH Power Suite.
 *
 * One Host plugin owns every feature's Host-side registrations, so the suite
 * installs as one plugin and each feature stays a module under `src/features/`.
 * Features register inside `apply` through `ctx.effect`, which ties their
 * lifetime to this entry.
 */

import { installInterruptedSessions } from './features/interrupted-sessions/host.ts'
import { installPromptHistory } from './features/prompt-history/host.ts'
import { installReadAcks } from './features/read-acks/host.ts'
import { installSessionPins } from './features/session-pins/host.ts'
import { installSessionActivity } from './features/session-activity/host.ts'
import { installSessionArtifacts } from './features/session-artifacts/host.ts'
import { installSettings } from './features/settings/host.ts'
import { installSidebarWidth } from './features/sidebar-width/host.ts'
import { installUpdateCheck } from './features/update-check/host.ts'
import { installWorkspacePresets } from './features/workspace-presets/host.ts'

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
  installReadAcks(ctx)
  installSessionPins(ctx)
  installSidebarWidth(ctx)
  installSessionActivity(ctx)
  installUpdateCheck(ctx)
}
