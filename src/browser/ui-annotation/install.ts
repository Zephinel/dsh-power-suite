/**
 * Installer of the browser-only UI element annotation mode.
 *
 * One installer per plugin factory owns the install guard, the controller
 * singleton and the two slot registrations (the always-mounted overlay and the
 * renderless Composer seat), plus the delegated composer-chip hover listeners
 * and the `@` trigger source. Copy dictionaries, the built React surface and the
 * shared identity bridge are injected by the entry, which keeps the public test
 * hook pointing at the controller's `debugFallbackScanProbe`.
 *
 * @module
 */

import {
  ANNOTATION_CHIP_ORDER,
  ANNOTATION_CHIP_TRIGGER,
  ANNOTATION_NS,
  ANNOTATION_OVERLAY_ID,
  ANNOTATION_SEAT_ID
} from './constants.ts'
import { createAnnotationController } from './controller.ts'
import { ANNOTATION_CSS } from './styles.ts'
import {
  ANNOTATION_CHIP_SOURCE,
  annotationChipRefOf
} from './serializers.ts'
import type { AnnotationComponentsApi } from './components.ts'
import type {
  AnnotationBridge,
  AnnotationControllerContext,
  AnnotationFallbackScanProbe,
  AnnotationInputActions
} from './types.ts'
import type { AnnotationController } from './components.ts'

/** The built annotation React surface the entry passes in. */
export type AnnotationComponents = AnnotationComponentsApi

/** The two registered dictionary documents. */
export interface UiAnnotationCopy {
  en: Record<string, string>
  zh: Record<string, string>
}

/** Stable dependencies the entry binds once per plugin factory. */
export interface UiAnnotationInstallDeps {
  React: typeof import('react')
  components: AnnotationComponents
  copy: UiAnnotationCopy
  bridge: AnnotationBridge
}

/** The narrow slot/locale/effect surface the installer reads. */
export interface UiAnnotationContext {
  effect(setup: () => (() => void) | void, label?: string): void
  inject(names: string | readonly string[], callback: (scope: unknown) => void): unknown
  locale: {
    bind(namespace: string): DshTranslate
    register(namespace: string, dictionaries: UiAnnotationCopy): () => void
  }
  slots: {
    inject(names: string | readonly string[], callback: () => void): () => void
    register(
      registration: { name: string, id?: string, order?: number },
      component: (props: Record<string, unknown>) => unknown
    ): () => void
  }
  sessions?: AnnotationControllerContext['sessions']
}

/** The installer face the entry keeps for one factory lifetime. */
export interface UiAnnotationInstaller {
  install(ctx: UiAnnotationContext): void
  debugFallbackScanProbe(): AnnotationFallbackScanProbe
}

/** Structural pointer event the delegated chip listeners receive. */
interface AnnotationPointerEvent {
  target?: unknown
  relatedTarget?: unknown
  clientX: number
  clientY: number
  button?: number
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  preventDefault: () => void
  stopImmediatePropagation: () => void
}

/** Structural keyboard event for the delegated Esc handler. */
interface AnnotationKeyEvent {
  key: string
  preventDefault: () => void
  stopPropagation: () => void
  stopImmediatePropagation: () => void
}

/** Structural scroll event for the delegated chip-scroll handler. */
interface AnnotationScrollEvent {
  target?: unknown
}

/** Props of the renderless Composer seat. */
interface AnnotationSeatProps {
  sessionId?: unknown
  inputActions?: unknown
  useSessions?: (selector: (state: unknown) => unknown) => unknown
}

/**
 * Create the per-factory annotation installer.
 * @param deps - React, the built surface, copy dictionaries and the bridge.
 * @returns the install/probe pair.
 */
export function createUiAnnotationInstaller(deps: UiAnnotationInstallDeps): UiAnnotationInstaller {
  const React = deps.React
  const components = deps.components
  const bridge = deps.bridge
  let installed = false
  let controller: AnnotationController | null = null

/**
 * Invisible Composer seat that keeps the insertion bridge current and resets
 * selection state when the viewed Session changes.
 * @param {object} props - session slot props.
 * @returns {object} a hidden anchor element.
 */
function AnnotationSessionSeat(props: AnnotationSeatProps) {
  const { sessionId, inputActions } = props
  // Session-scoped slots receive the global `useSessions` standard hook. The
  // annotation overlay itself is not a slot, so this seat mirrors the Session's
  // workspace identity (cwd) into the bridge for record capture (F-2). The hook
  // presence is fixed by the slot contract for this seat's lifetime.
  const useSessions = typeof props.useSessions === 'function' ? props.useSessions : null
  const sessionsList = useSessions !== null ? useSessions((state: unknown) => state) : null
  const sessionView = sessionsList !== null && typeof sessionsList === 'object'
    ? sessionsList as { byId?: unknown }
    : null
  const byId = sessionView !== null && sessionView.byId !== null && typeof sessionView.byId === 'object'
    ? sessionView.byId as Record<string, unknown>
    : null
  const entry = byId === null || typeof sessionId !== 'string' ? null : byId[sessionId]
  const sessionCwd = entry !== null && entry !== undefined && typeof entry === 'object'
    && typeof (entry as { cwd?: unknown }).cwd === 'string'
    && ((entry as { cwd: string }).cwd).length > 0
    ? (entry as { cwd: string }).cwd
    : null
  React.useEffect(() => {
    bridge.sessionId = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
    bridge.inputActions = (inputActions ?? null) as AnnotationInputActions | null
    bridge.sessionCwd = sessionCwd
    if (controller !== null) controller.sessionChanged(bridge.sessionId)
    return () => {
      // The bridge is all-or-nothing: a session id without its Composer actions (or the
      // reverse) would keep collection scope and insertion decisions stale after this
      // seat unmounts (e.g. leaving the conversation for the Plugins view).
      bridge.sessionId = null
      bridge.inputActions = null
      bridge.sessionCwd = null
      if (controller !== null) controller.sessionChanged(null)
    }
  }, [sessionId, inputActions, sessionCwd])
  return React.createElement('span', {
    style: { display: 'none' },
    'aria-hidden': true
  })
}

/**
 * Build the `@` trigger source that owns annotation reference chips (A3/T9).
 *
 * The source receives the controller lazily so registration can happen before
 * the controller effect settles; every callback resolves the current
 * controller instance. `codec.serialize` throws for a deleted record so the
 * shell blocks the send instead of silently downgrading (D9).
 * @param {() => object | null} controllerAt - current annotation controller getter.
 * @param {Function} t - namespace-bound translate.
 * @returns {object} trigger source for `ctx.inputTriggers.registerSource`.
 */
function createAnnotationChipSource(controllerAt: () => AnnotationController | null, t: DshTranslate) {
  /** @returns {object | null} the current controller. */
  const controller = () => {
    try {
      return controllerAt()
    } catch {
      return null
    }
  }
  return {
    trigger: ANNOTATION_CHIP_TRIGGER,
    name: ANNOTATION_CHIP_SOURCE,
    order: ANNOTATION_CHIP_ORDER,
    // The shell's slash-menu dictionary has no annotation title, and locale
    // registration cannot take over another owner's namespace, so a custom group
    // header would render the raw source name. Native reference sources use the
    // same no-title treatment; candidates self-identify via `chip.candidateLabel`.
    showGroupTitle: false,
    /**
     * Current-Session candidates only; an empty array hides the group (D8).
     * @param {object} session - composer Session projection.
     * @returns {Promise<Array<object>>} candidates.
     */
    async candidates(session: unknown) {
      const current = controller()
      if (current === null || session === null || typeof session !== 'object') return []
      const sessionId = typeof (session as { sessionId?: unknown }).sessionId === 'string'
        ? (session as { sessionId: string }).sessionId
        : ''
      if (sessionId.length === 0) return []
      return current.chipCandidates(sessionId)
    },
    /**
     * A menu pick inserts the record's chip through the scoped input pipeline.
     * @param {object} pick - pipeline pick (`candidate`, `session`, `span`).
     * @returns {object | undefined} insert outcome, or undefined for a stale candidate.
     */
    onPick(pick: unknown) {
      const current = controller()
      if (current === null || pick === null || typeof pick !== 'object') return undefined
      const pickView = pick as { candidate?: unknown }
      const candidate = pickView.candidate !== null && pickView.candidate !== undefined && typeof pickView.candidate === 'object'
        ? pickView.candidate as { value?: unknown }
        : null
      const value = candidate === null ? null : candidate.value
      if (typeof value !== 'string') return undefined
      const record = current.chipRecord(value)
      if (record === null) return undefined
      return { insert: annotationChipRefOf(record) }
    },
    /**
     * A chip click opens the record's detail card (single) or the rail
     * collection view (batch group).
     * @param {object} _session - composer Session projection.
     * @param {{ ref: string }} reference - chip reference.
     * @returns {boolean} whether the preview was accepted.
     */
    openReference(_session: unknown, reference: unknown) {
      const current = controller()
      if (current === null || reference === null || typeof reference !== 'object') return false
      const ref = (reference as { ref?: unknown }).ref
      return typeof ref === 'string' ? current.openChipReference(ref) : false
    },
    codec: {
      /**
       * Clipboard projection of one chip.
       * @param {string} ref - chip ref.
       * @returns {string} clipboard text.
       */
      clipboardText: (ref: string) => {
        const current = controller()
        return current === null ? '' : current.chipClipboardText(ref)
      },
      /**
       * Model text for one chip; failure rejects the send (never downgraded).
       * @param {string} ref - chip ref.
       * @returns {Promise<string>} serialized model text.
       */
      serialize: async (ref: string) => {
        const current = controller()
        if (current === null) throw new Error(t('feedback.chipMissing'))
        return current.serializeChip(ref)
      }
    }
  }
}

/**
 * Install the browser-only UI element annotation mode.
 * @param {object} ctx - client root context.
 * @returns {void}
 */
function install(ctx: UiAnnotationContext): void {
  if (installed) return
  installed = true
  const t = ctx.locale.bind(ANNOTATION_NS)
  ctx.effect(() => ctx.locale.register(ANNOTATION_NS, {
    en: deps.copy.en,
    zh: deps.copy.zh
  }), 'power-suite: ui annotation dictionaries')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-power-suite-css', 'ui-annotation')
    style.textContent = ANNOTATION_CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'power-suite: ui annotation stylesheet')
  ctx.effect(() => {
    try {
      controller = createAnnotationController(t, ctx, { bridge })
    } catch (error) {
      // The guard must not wedge this factory into a "installed" state with no controller.
      installed = false
      throw error
    }
    return () => {
      if (controller !== null) controller.dispose()
      controller = null
      installed = false
    }
  }, 'power-suite: ui annotation controller')
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: ANNOTATION_OVERLAY_ID
  }, (props) => React.createElement(components.AnnotationOverlay, {
    ...props,
    t,
    controller: controller
  }))), 'power-suite: ui annotation overlay')
  ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: ANNOTATION_SEAT_ID,
    order: 60
  }, AnnotationSessionSeat)), 'power-suite: ui annotation composer seat')
  // A3/T21: delegated composer-chip hover preview listeners (they only fire on
  // chips the shell renders with `data-composer-chip="ui-annotation"`, so the
  // shell itself is untouched and native chips are ignored).
  ctx.effect(() => {
    const onPointerOver = (event: AnnotationPointerEvent) => {
      if (controller !== null) controller.onChipPointerOver(event)
    }
    const onPointerOut = (event: AnnotationPointerEvent) => {
      if (controller !== null) controller.onChipPointerOut(event)
    }
    const onPointerMove = (event: AnnotationPointerEvent) => {
      // Re-show the preview after it was dismissed (Esc) without requiring the
      // pointer to leave and re-enter the chip: pointerover alone does not fire
      // when the pointer is already inside the chip.
      if (controller !== null) controller.onChipPointerOver(event)
    }
    const onKeyDown = (event: AnnotationKeyEvent) => {
      if (event.key !== 'Escape' || controller === null) return
      // Esc first closes the transient chip tooltip/× and must not also clear a
      // selection or leave the mode in the same keypress.
      const hadPreview = controller.hideChipPreview()
      controller.hideChipAction()
      if (hadPreview) {
        event.preventDefault()
        event.stopPropagation()
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
      }
    }
    const onScroll = (event: AnnotationScrollEvent) => {
      if (controller !== null) controller.onChipScroll(event)
    }
    document.addEventListener('pointerover', onPointerOver, true)
    document.addEventListener('pointerout', onPointerOut, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerover', onPointerOver, true)
      document.removeEventListener('pointerout', onPointerOut, true)
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, 'power-suite: ui annotation chip hover preview')
  // A3/T9: the composer chip pipeline is injected dynamically so the plugin
  // keeps working on embeds without the chat UI. `conversation`+`inputTriggers`
  // arrive when the composer services are installed; the source registration
  // dies with the dynamic inject's fiber.
  try {
    ctx.inject(['conversation', 'inputTriggers'], (scoped) => {
      const scopedView = scoped !== null && scoped !== undefined && typeof scoped === 'object'
        ? scoped as { get?: unknown, effect?: unknown }
        : null
      const scope = (scopedView !== null && typeof scopedView.get === 'function' ? scoped : ctx) as {
        get(name: string): unknown
        effect?: (setup: () => (() => void) | void, label?: string) => unknown
      }
      let conversation = null
      let inputTriggers = null
      try {
        conversation = scope.get('conversation')
        inputTriggers = scope.get('inputTriggers')
      } catch {
        conversation = null
        inputTriggers = null
      }
      if (conversation === undefined || conversation === null || inputTriggers === undefined || inputTriggers === null) return
      if (controller !== null) controller.attachComposerServices({ conversation, inputTriggers })
      const register = typeof scope.effect === 'function' ? scope.effect.bind(scope) : ctx.effect.bind(ctx)
      const triggers = inputTriggers as { registerSource(source: unknown): unknown }
      register(() => {
        triggers.registerSource(createAnnotationChipSource(() => controller, t))
      },
        'power-suite: ui annotation chip source')
    })
  } catch {
    // A missing dynamic-inject API leaves the plain-text insertion path (D9).
  }
}

  return {
    install,
    debugFallbackScanProbe(): AnnotationFallbackScanProbe {
      if (controller !== null && typeof controller.debugFallbackScanProbe === 'function') {
        return controller.debugFallbackScanProbe()
      }
      return { ok: false, reason: 'controller unavailable' }
    }
  }
}
