/**
 * Cross-half route contract.
 *
 * Every Host route and every browser call site uses these constants, so the
 * two halves cannot drift apart. Host paths carry the leading slash; the
 * browser calls the same path relative to the GUI origin via
 * {@link browserRoute}. `test/protocol-contract.test.js` asserts that each half
 * uses this module and that no route literal is reintroduced.
 *
 * @module
 */

/** Canonical Host route paths, one owner for both halves. */
export const ROUTES = {
  sessionArtifactsList: '/api/session-artifacts.list',
  sessionArtifactsRaw: '/api/session-artifacts.raw',
  sessionArtifactsAttachment: '/api/session-artifacts.attachment',
  sessionArtifactsPreview: '/api/session-artifacts.preview',
  workspacePresetsGet: '/api/workspace-presets.get',
  workspacePresetsSet: '/api/workspace-presets.set',
  promptHistoryList: '/api/prompt-history.list',
  interrupted: '/api/power-suite.interrupted',
  interruptedEvents: '/api/power-suite.interrupted-events',
  continue: '/api/power-suite.continue',
  settings: '/api/power-suite.settings',
  readAcks: '/api/power-suite.read-acks',
  sessionPins: '/api/power-suite.session-pins',
  sidebarWidth: '/api/power-suite.sidebar-width',
  sessionActivity: '/api/power-suite.session-activity',
  update: '/api/power-suite.update'
} as const

/** One canonical route path. */
export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]

/**
 * The same path as it is called from the browser (relative to the GUI origin).
 * @param route - canonical Host path.
 * @returns the path without its leading slash.
 */
export function browserRoute(route: RoutePath): string {
  return route.startsWith('/') ? route.slice(1) : route
}
