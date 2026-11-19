/**
 * Native Session hover-card figures.
 *
 * Occupant of the shell's `sidebar.session.row.hover` seat: the three native
 * figures the running-panel hover card shows, rendered inside the default
 * sidebar Session hover card between its relative-time line and its trailing
 * status lines. The seat is mounted only while that card is open; a Session
 * whose projections carry no figures renders nothing, so the shipped card
 * keeps its exact shape for a blank or stat-less Session.
 *
 * The section renderer and the projection helpers belong to the
 * dynamic-Workspaces installer, so the entry injects them here instead of this
 * module reaching into another feature's runtime.
 *
 * @module
 */

import type { ReactElement } from 'react'
import type { ProjectionSections, Translate } from '../dynamic-workspaces/stats.ts'

/** The Session-list slice the open hover card re-renders from. */
export interface SessionHoverList {
  projectionsBySession?: Record<string, { values?: unknown } | undefined> | null
}

/** Props the shell hands a root-scope `sidebar.session.row.hover` seat. */
export interface SessionHoverFigureProps {
  sessionId?: unknown
  t: Translate
  ensureProjections?: (sessionId: string) => void
  useSessions: (selector: (state: SessionHoverList | null) => SessionHoverList | null) => SessionHoverList | null
  [key: string]: unknown
}

/** Stable runtime seats and renderers the browser entry owns. */
export interface NativeSessionHoverFiguresDeps {
  React: typeof import('react')
  /** Native section renderer shared with the dynamic-Workspaces hover card. */
  hovercardSections: (props: { sections: ProjectionSections, t: Translate }) => ReactElement | null
  /** Projection-value reader shared with the dynamic-Workspaces hover card. */
  projectionSections: (values: unknown) => ProjectionSections
  /** One-shot read decision shared with the dynamic-Workspaces hover card. */
  needsProjectionRead: (record: unknown) => boolean
  /** Copy namespace owning the section labels the shared renderer reads. */
  namespace: string
}

/** The narrow client root context slice this installer reads. */
export interface NativeSessionHoverFiguresContext {
  effect(setup: () => (() => void) | void, label?: string): void
  locale: { bind(namespace: string): Translate }
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(
      registration: { name: string, id?: string, order?: number, inject?: () => Record<string, unknown> },
      component: (props: SessionHoverFigureProps) => ReactElement | null
    ): () => void
  }
  sessions: {
    refreshProjections?: (sessionId: string) => { catch?: (onRejected: () => void) => unknown } | null | undefined
  }
}

/** The seat and its registration, bound to one entry instance. */
export interface NativeSessionHoverFiguresInstaller {
  SessionHoverFigures: (props: SessionHoverFigureProps) => ReactElement | null
  installSessionHoverFigures(ctx: NativeSessionHoverFiguresContext): void
}

/**
 * Create the native Session hover-card figures for one plugin instance.
 * @param deps - the React runtime, the shared section renderer and projection helpers.
 * @returns the figure seat and its slot registration.
 */
export function createNativeSessionHoverFigures(
  deps: NativeSessionHoverFiguresDeps
): NativeSessionHoverFiguresInstaller {
  const { React, hovercardSections, projectionSections, needsProjectionRead, namespace } = deps

  /**
   * Render the three native figures for the card's Session.
   * @param props - slot props: the owner's `sessionId`, this feature's `t` and
   *   `ensureProjections`, and the shell's standard hooks.
   * @returns the figure sections, or null when none has data.
   */
  function SessionHoverFigures(props: SessionHoverFigureProps): ReactElement | null {
    const { sessionId, t, ensureProjections } = props
    // Root-scope slot entries receive the shell's `useSessions` standard hook;
    // subscribing to the list state re-renders the open card when the Host
    // pushes new projection values for this Session.
    const sessions = props.useSessions((state) => state)
    const projections = sessions !== null && typeof sessions === 'object'
      ? sessions.projectionsBySession
      : undefined
    const record = typeof sessionId === 'string' && sessionId.length > 0
      && projections !== null && projections !== undefined && typeof projections === 'object'
      ? projections[sessionId]
      : undefined
    // Cold (persisted) Sessions carry only summary projections: the first mount
    // of their hover card starts the one one-shot read the running panel's card
    // also performs. The ref Set keeps it to one request per Session id for the
    // mounted card, and error / migration records are never retried.
    const requested = React.useRef(new Set<string>())
    React.useEffect(() => {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return
      if (requested.current.has(sessionId)) return
      if (!needsProjectionRead(record)) return
      requested.current.add(sessionId)
      if (typeof ensureProjections === 'function') ensureProjections(sessionId)
    }, [sessionId, record, ensureProjections])
    const values = record !== null && typeof record === 'object' ? record.values : undefined
    // A single wrapper is the test/DOM anchor for "native sidebar hover card
    // figures"; `:empty` hides it when the Session has no figures, so a blank
    // card keeps the shipped spacing exactly.
    return React.createElement('div', {
      className: 'psd-native-hover-figures',
      'data-psd-native-figures': ''
    }, React.createElement(hovercardSections, {
      sections: projectionSections(values),
      t
    }))
  }

  /**
   * Register the native Session hover-card occupant.
   * @param ctx - client root context.
   * @returns void
   */
  function installSessionHoverFigures(ctx: NativeSessionHoverFiguresContext): void {
    // `dynamicWorkspacesInstaller.install` runs first in `apply`, so the
    // `DW_NS` dictionaries and the shared `.psd-hovercard-section*` styles the
    // installer registers are already installed when this seat renders.
    const t = ctx.locale.bind(namespace)
    const ensureProjections = (sessionId: string): void => {
      const sessions = ctx.sessions
      if (sessions === null || sessions === undefined) return
      if (typeof sessions.refreshProjections !== 'function') return
      try {
        const pending = sessions.refreshProjections(sessionId)
        if (pending !== null && pending !== undefined && typeof pending.catch === 'function') pending.catch(() => {})
      } catch {
        // A Host without the projection units leaves the figures out; the
        // native card keeps every one of its own lines.
      }
    }
    ctx.effect(() => ctx.slots.inject('sidebar.session.row.hover', () => ctx.slots.register({
      name: 'sidebar.session.row.hover',
      id: 'power-suite.session-hover-figures',
      order: 100,
      inject: () => ({ t, ensureProjections })
    }, SessionHoverFigures)), 'power-suite: native session hover figures')
  }

  return { SessionHoverFigures, installSessionHoverFigures }
}
