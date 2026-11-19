/**
 * Interrupted-session feature composition.
 *
 * One factory wires the shared state/decorator (`state.ts`), the copy, icons and
 * stylesheet with the two typed React seats from `components.ts`, and returns
 * the installer plus the seats the browser entry still needs (the Workspace
 * card and the documented E2E hooks).
 *
 * The entry no longer passes 28 individual deps: this module owns that wiring,
 * while behavior, slot ids/order, DOM markers, storage key and copy stay the
 * same.
 *
 * @module
 */

import { createInterruptedSessionComponents } from './components.ts'
import type {
  InterruptedSessionComponentsContext,
  InterruptedSessionComponentsInstaller
} from './components.ts'
import { INTERRUPTED_EN, INTERRUPTED_NS, INTERRUPTED_ZH } from './copy.ts'
import { REMIX_PLAY_FILL, REMIX_WARNING_FILL } from './icons.ts'
import { CONTINUE_ROUTE, INTERRUPTED_EVENTS_ROUTE, createInterruptedState } from './state.ts'
import type { InterruptedState } from './state.ts'
import { INTERRUPTED_CSS } from './styles.ts'

/** Runtime modules the feature closes over. */
export interface InterruptedSessionsFeatureDeps {
  React: typeof import('react')
  RemixIcon: (props: { path: string, size?: number }) => unknown
  appUrl(relative: string): string
}

/** The composed feature surface the entry consumes. */
export interface InterruptedSessionsFeature {
  installInterruptedSessions(ctx: InterruptedSessionComponentsContext): void
  store: InterruptedState
  /** Copy namespace, still passed to the Workspace card. */
  namespace: string
  /** Remix path data, still passed to the Workspace card. */
  remixWarningFill: string
  remixPlayFill: string
}

/**
 * Create the interrupted-session feature for one plugin instance.
 * @param deps - React runtime, the entry's icon seat and the app URL builder.
 * @returns the installer and shared seats.
 */
export function createInterruptedSessionsFeature(deps: InterruptedSessionsFeatureDeps): InterruptedSessionsFeature {
  const { React, RemixIcon, appUrl } = deps
  const state = createInterruptedState({ React, appUrl })
  const components: InterruptedSessionComponentsInstaller = createInterruptedSessionComponents({
    React,
    RemixIcon,
    remixWarningFill: REMIX_WARNING_FILL,
    remixPlayFill: REMIX_PLAY_FILL,
    requestContinue: state.requestContinue,
    useInterruptedRecord: state.useInterruptedRecord,
    escapeSelectorValue: state.escapeSelectorValue,
    appUrl,
    continueRoute: CONTINUE_ROUTE,
    rememberContinueTime: state.rememberContinueTime,
    markContinued: state.markContinued,
    refreshInterrupted: state.refreshInterrupted,
    subscribeInterrupted: state.subscribeInterrupted,
    discoverInterruptedRows: state.discoverInterruptedRows,
    syncInterruptedRows: state.syncInterruptedRows,
    refreshAllInterrupted: state.refreshAllInterrupted,
    loadContinueTimes: state.loadContinueTimes,
    interruptedNamespace: INTERRUPTED_NS,
    interruptedEn: INTERRUPTED_EN,
    interruptedZh: INTERRUPTED_ZH,
    interruptedCss: INTERRUPTED_CSS,
    interruptedEventsRoute: INTERRUPTED_EVENTS_ROUTE,
    interruptedStore: state.interruptedStore,
    interruptedRuntime: state.interruptedRuntime,
    continueRequest: state.continueRequest,
    continueRuntime: state.continueRuntime
  })
  return {
    installInterruptedSessions: components.installInterruptedSessions,
    store: state,
    namespace: INTERRUPTED_NS,
    remixWarningFill: REMIX_WARNING_FILL,
    remixPlayFill: REMIX_PLAY_FILL
  }
}
