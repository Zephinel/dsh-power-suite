/**
 * Update prompt: controller, card and registration.
 *
 * One prompt per page load when the Host reports a newer stable release than
 * the running package. The Host route owns the registry and release-note reads;
 * this module validates that answer through `model.ts`, keeps this browser's
 * "later" / "do not remind" state, and renders the card as an additive
 * `shell.overlay` slot entry. It never inserts DOM into the native sidebar or
 * any other React-managed shell subtree (a sidebar insertion loop was the
 * boot-hang root cause of the previous design).
 *
 * The pure decisions live in `model.ts`; the entry only passes the React
 * runtime, the app URL builder and the route/package identity.
 *
 * @module
 */

import type { ReactElement } from 'react'
import {
  UPDATE_STORAGE_KEY,
  decideUpdatePrompt,
  normalizeUpdatePayload,
  noteUpdatePromptLater,
  offersSilence,
  parseUpdatePromptState,
  serializeUpdatePromptState,
  silenceUpdatePromptVersion
} from './model.ts'
import type { UpdatePromptState } from './model.ts'

/** Namespace-bound translate seat used by the card. */
export type UpdateCheckTranslate = (key: string, params?: Record<string, unknown>) => string

/** One shown prompt snapshot. */
interface UpdatePromptShown {
  kind: 'shown'
  current: string
  latest: string
  highlights: string[]
  expanded: boolean
  canSilence: boolean
}

/** The hidden prompt snapshot. */
interface UpdatePromptHidden {
  kind: 'hidden'
}

/** Snapshot the `shell.overlay` entry renders. */
export type UpdatePromptSnapshot = UpdatePromptShown | UpdatePromptHidden

/** Actions the card dispatches. */
interface UpdatePromptActions {
  update(): void
  later(): void
  silence(): void
  toggleDetails(): void
}

/** Snapshot store handed to the overlay entry. */
export interface UpdatePromptStore {
  getSnapshot(): UpdatePromptSnapshot
  subscribe(listener: () => void): () => void
}

/** One page's update prompt controller. */
export interface UpdatePromptController {
  store: UpdatePromptStore
  actions: UpdatePromptActions
  dispose(): void
}

/** Optional Plugins-panel navigation service. */
interface PluginNavigationService {
  openBundle(packageName: string): void
}

/** Dynamic-injection scope handed to `ctx.inject`. */
interface UpdateCheckInjectionScope {
  pluginNavigation?: PluginNavigationService | null
  effect?: (setup: () => (() => void) | void) => void
}

/** Stable runtime seats the browser entry owns. */
export interface UpdateCheckDeps {
  React: typeof import('react')
  appUrl: (relative: string) => string
  /** Host route answering one cached registry check. */
  updateRoute: string
  /** This bundle's npm package name. */
  packageName: string
}

/** The narrow client root context slice this installer reads. */
export interface UpdateCheckContext {
  effect(setup: () => (() => void) | void, label?: string): void
  inject(names: string[], callback: (scope: UpdateCheckInjectionScope) => void): unknown
  locale: {
    bind(namespace: string): UpdateCheckTranslate
    register(namespace: string, dictionaries: { en: Record<string, string>, zh: Record<string, string> }): () => void
    getLocale(): unknown
  }
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(
      registration: { name: string, id?: string, order?: number, locale?: string, inject?: () => Record<string, unknown> },
      component: (props: Record<string, unknown>) => ReactElement | null
    ): () => void
  }
}

/** The install surface the entry keeps for its `apply` pass. */
export interface UpdateCheckInstaller {
  installUpdatePrompt(ctx: UpdateCheckContext): void
}

/** Props of the overlay card. */
interface UpdatePromptProps {
  t: UpdateCheckTranslate
  controller: UpdatePromptController
  [key: string]: unknown
}

/** Copy namespace for the update prompt. */
const UPDATE_NS = 'powerSuiteUpdate'

/** Slot cell identity of the prompt overlay. */
const UPDATE_SLOT_ID = 'power-suite.update-prompt'

/** Delay before the single check each page load runs (ms). */
const UPDATE_PROMPT_DELAY_MS = 1500

/** Upper bound for the one Host check request; dispose aborts it immediately. */
const UPDATE_CHECK_TIMEOUT_MS = 8000

/** Localized copy for the update prompt, aligned with Intelligent UI. */
export const UPDATE_EN: Record<string, string> = {
  'name': 'DSH Power Suite',
  'title': 'A new version of {name} is available',
  'update': 'Update',
  'later': 'Later',
  'details': 'Details',
  'hideDetails': 'Hide details',
  'dontRemind': "Don't remind me again",
  'highlights': "What's new",
  'noHighlights': 'This release has no published highlights. Open the plugin details for the full notes.'
}
export const UPDATE_ZH: Record<string, string> = {
  'name': 'DSH 增强套件',
  'title': '{name}有新版本可用',
  'update': '更新',
  'later': '下次再说',
  'details': '查看详情',
  'hideDetails': '收起详情',
  'dontRemind': '不再提醒',
  'highlights': '更新要点',
  'noHighlights': '该版本未提供更新要点。打开插件详情页可查看完整说明。'
}

/**
 * Stylesheet for the prompt card. Every selector uses the `psu-` prefix and
 * colors come from shell theme tokens only (light/dark follow automatically),
 * with a forced-colors fallback at the end.
 */
const UPDATE_CSS = `
.psu-card{position:fixed;right:20px;bottom:20px;z-index:70;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;width:min(360px,calc(100vw - 40px));padding:14px;border:0;border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent,var(--dsw-shadow-lv3,none));pointer-events:auto}
.psu-head{display:flex;align-items:flex-start;gap:10px;min-width:0}
.psu-mark{display:inline-flex;flex:none;align-items:center;justify-content:center;width:22px;height:22px;color:var(--dsw-alias-state-business-primary)}
.psu-mark svg{display:block}
.psu-titles{display:flex;flex:1;flex-direction:column;gap:1px;min-width:0}
.psu-title{overflow-wrap:anywhere;font-size:13px;font-weight:600;line-height:1.35}
.psu-versions{color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;line-height:1.35}
.psu-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.psu-primary,.psu-secondary,.psu-link{box-sizing:border-box;height:28px;padding:0 10px;border:0;border-radius:var(--dsw-radius-md,8px);font:inherit;font-size:12px;line-height:1;cursor:pointer}
.psu-primary{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-foreground)}
.psu-secondary{background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);color:var(--dsw-alias-label-primary)}
.psu-link{height:24px;padding:0 4px;background:transparent;color:var(--dsw-alias-state-business-primary)}
.psu-silence{color:var(--dsw-alias-label-secondary)}
.psu-primary:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 86%,var(--dsw-alias-label-primary))}
.psu-secondary:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent)}
.psu-link:hover{background:var(--dsw-alias-interactive-bg-hover)}
.psu-primary:focus-visible,.psu-secondary:focus-visible,.psu-link:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.psu-details{display:flex;flex-direction:column;gap:6px;padding-top:2px}
.psu-details::before{display:block;flex:none;height:1px;border-radius:1px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);content:""}
.psu-details-title{font-size:12px;font-weight:600}
.psu-points{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}
.psu-points li{position:relative;padding-left:12px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45;overflow-wrap:anywhere}
.psu-points li::before{position:absolute;top:.55em;left:2px;width:4px;height:4px;border-radius:50%;background:var(--dsw-alias-state-business-primary);content:""}
.psu-empty{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.45}
@media (forced-colors:active){.psu-card{background:Canvas;color:ButtonText}}
`


/** Stable hidden snapshot so the overlay never re-renders without a change. */
const UPDATE_HIDDEN: UpdatePromptHidden = { kind: 'hidden' }

/**
 * Create the update prompt for one plugin instance.
 * @param deps - the React runtime, app URL builder and route/package identity.
 * @returns the installer bound to those dependencies.
 */
export function createUpdateCheck(deps: UpdateCheckDeps): UpdateCheckInstaller {
  const { React, appUrl, updateRoute, packageName } = deps

  /** The page's update prompt controller; the `shell.overlay` entry renders it. */
  let updatePromptController: UpdatePromptController | null = null

  /**
   * Resolve this page's `localStorage`; restricted contexts can throw on access.
   * @returns browser storage, or null when it is unavailable.
   */
  function resolveUpdateStorage(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null
    }
  }

  /**
   * Create the page's update prompt controller: the one delayed check, the
   * browser-local state, and the snapshot the overlay entry renders.
   * @param ctx - client root context.
   * @returns the controller.
   */
  function createUpdatePromptController(ctx: UpdateCheckContext): UpdatePromptController {
    const storage = resolveUpdateStorage()
    let memoryState: UpdatePromptState = {}
    let memoryOnly = storage === null
    let snapshot: UpdatePromptSnapshot = UPDATE_HIDDEN
    const listeners = new Set<() => void>()
    let disposed = false
    /** Bumped by every user decision so a late check cannot reopen the card. */
    let actionRevision = 0
    /** Scheduled delayed check (timer id), 0 when none is pending. */
    let checkTimer = 0
    /** In-flight check request; a user decision invalidates its result and dispose() aborts it. */
    let checkAbort: AbortController | null = null
    let pluginNavigation: PluginNavigationService | null = null

    /** Notify the overlay subscribers. */
    const publish = (next: UpdatePromptSnapshot): void => {
      if (next === snapshot) return
      snapshot = next
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch {
          // A subscriber throw cannot break the controller.
        }
      }
    }

    /** @returns the persisted state. */
    const readState = (): UpdatePromptState => {
      if (memoryOnly || storage === null) return memoryState
      try {
        return parseUpdatePromptState(storage.getItem(UPDATE_STORAGE_KEY))
      } catch {
        // Once access fails, this page keeps the cycle in memory for good: a
        // later read must not resurrect an older stored document.
        memoryOnly = true
        return memoryState
      }
    }

    /** @param state - state to persist. */
    const writeState = (state: UpdatePromptState): void => {
      memoryState = state
      if (memoryOnly || storage === null) return
      try {
        storage.setItem(UPDATE_STORAGE_KEY, serializeUpdatePromptState(state))
      } catch {
        // A full or read-only storage keeps this page's cycle in memory.
        memoryOnly = true
      }
    }

    /** Invalidate any in-flight check after a user decision; that state is authoritative. */
    const settle = (): void => {
      actionRevision += 1
    }

    /**
     * Open this bundle's Plugins detail page.
     * @returns whether navigation started; false keeps the card open.
     */
    const openPluginDetails = (): boolean => {
      if (pluginNavigation === null || typeof pluginNavigation.openBundle !== 'function') return false
      pluginNavigation.openBundle(packageName)
      return true
    }

    /**
     * Active DSH locale id, used to ask for the matching release-notes variant.
     * @returns the locale id, or `en` when the locale service is absent.
     */
    const activeLanguage = (): string => {
      try {
        const locale = ctx.locale.getLocale()
        const active = locale !== null && typeof locale === 'object'
          ? (locale as { active?: unknown }).active
          : undefined
        return typeof active === 'string' && active.length > 0 ? active : 'en'
      } catch {
        return 'en'
      }
    }

    /**
     * Run the one update check this page load performs: ask the Host, decide,
     * and publish the snapshot. Every failure stays silent (no error UI).
     * @returns resolves once the decision is published.
     */
    const runCheck = async (): Promise<void> => {
      if (disposed) return
      const revisionAtStart = actionRevision
      const abort = new AbortController()
      checkAbort = abort
      const timeout = window.setTimeout(() => abort.abort(), UPDATE_CHECK_TIMEOUT_MS)
      try {
        const response = await fetch(appUrl(`${updateRoute}?lang=${encodeURIComponent(activeLanguage())}`), {
          cache: 'no-store',
          signal: abort.signal
        })
        if (response === null || typeof response !== 'object' || response.ok !== true) return
        const payload: unknown = await response.json()
        // A user action while the check was in flight wins; its state is authoritative.
        if (disposed || revisionAtStart !== actionRevision) return
        const view = normalizeUpdatePayload(payload)
        // A definitive "no update" answer normally fails normalization (the
        // Host then reports updateAvailable: false), but the decision still
        // needs it to retire the recorded cycle, so the raw answer is the
        // fallback. `decideUpdatePrompt` re-validates whatever it receives.
        const decision = decideUpdatePrompt(view !== null ? view : payload, readState())
        writeState(decision.state)
        if (decision.action !== 'prompt') {
          publish(UPDATE_HIDDEN)
          return
        }
        publish({
          kind: 'shown',
          current: decision.prompt.current,
          latest: decision.prompt.latest,
          highlights: decision.prompt.highlights,
          expanded: false,
          canSilence: decision.canSilence
        })
      } catch {
        // Offline, aborted, 404, malformed JSON: stay silent and do not retry
        // on this page.
      } finally {
        window.clearTimeout(timeout)
        if (checkAbort === abort) checkAbort = null
      }
    }

    // Optional Plugins-panel navigation: the Update action opens this bundle's
    // detail page; without that service the card stays open (no silent close).
    try {
      ctx.inject(['pluginNavigation'], (scoped) => {
        if (disposed || scoped === null || scoped === undefined) return
        pluginNavigation = typeof scoped.pluginNavigation === 'object' && scoped.pluginNavigation !== null
          ? scoped.pluginNavigation
          : null
        if (typeof scoped.effect === 'function') {
          scoped.effect(() => () => { pluginNavigation = null })
        }
      })
    } catch {
      // A host without dynamic injection keeps the Update action inert.
    }

    const actions: UpdatePromptActions = {
      update: () => {
        if (snapshot.kind !== 'shown') return
        // Without the Plugins panel there is nowhere to go: keep the card open
        // rather than closing it silently, and never write a silence.
        if (!openPluginDetails()) return
        settle()
        publish(UPDATE_HIDDEN)
      },
      later: () => {
        if (snapshot.kind !== 'shown') return
        settle()
        writeState(noteUpdatePromptLater(readState(), snapshot.latest))
        publish(UPDATE_HIDDEN)
      },
      silence: () => {
        if (snapshot.kind !== 'shown') return
        settle()
        writeState(silenceUpdatePromptVersion(readState(), snapshot.latest))
        publish(UPDATE_HIDDEN)
      },
      toggleDetails: () => {
        if (snapshot.kind !== 'shown') return
        publish({ ...snapshot, expanded: !snapshot.expanded })
      }
    }

    const store: UpdatePromptStore = {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      }
    }

    /** Stop the scheduled check, drop listeners, release the navigation service. */
    const dispose = (): void => {
      disposed = true
      if (checkTimer !== 0) {
        window.clearTimeout(checkTimer)
        checkTimer = 0
      }
      if (checkAbort !== null) {
        checkAbort.abort()
        checkAbort = null
      }
      listeners.clear()
      pluginNavigation = null
    }

    // One check per page load; no polling while the page stays open.
    checkTimer = window.setTimeout(() => {
      checkTimer = 0
      void runCheck()
    }, UPDATE_PROMPT_DELAY_MS)

    return { store, actions, dispose }
  }

  /**
   * The update prompt card. Subscribes to the page controller and renders one
   * card in `shell.overlay`; Escape or a click outside the card settles it
   * exactly like "later".
   * @param props - slot props plus the bound translator, controller, and title name.
   * @returns the card, or null while nothing is shown.
   */
  function UpdatePrompt(props: UpdatePromptProps): ReactElement | null {
    const { t, controller } = props
    const snapshot = React.useSyncExternalStore(
      controller.store.subscribe,
      controller.store.getSnapshot,
      controller.store.getSnapshot
    )
    const actions = controller.actions
    const cardRef = React.useRef<HTMLElement | null>(null)
    const shown = snapshot.kind === 'shown'

    React.useEffect(() => {
      if (!shown) return undefined
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        actions.later()
      }
      const onPointerDown = (event: Event): void => {
        const target = event.target
        if (target === null || target === undefined) return
        if (!(target instanceof Node)) return
        const card = cardRef.current
        if (card !== null && card !== undefined && card.contains(target)) return
        actions.later()
      }
      document.addEventListener('keydown', onKeyDown, true)
      document.addEventListener('pointerdown', onPointerDown, true)
      return () => {
        document.removeEventListener('keydown', onKeyDown, true)
        document.removeEventListener('pointerdown', onPointerDown, true)
      }
    }, [shown, actions])

    if (snapshot.kind !== 'shown') return null
    const title = t('title', { name: t('name') })
    return React.createElement('div', {
      className: 'psu-card',
      ref: cardRef,
      role: 'region',
      'aria-label': title,
      'data-psu-card': '',
      'data-psu-version': snapshot.latest
    },
    React.createElement('div', { className: 'psu-head' },
      React.createElement('span', { className: 'psu-mark', 'aria-hidden': 'true' },
        React.createElement('svg', {
          width: 18,
          height: 18,
          viewBox: '0 0 24 24',
          focusable: 'false'
        },
        React.createElement('rect', { x: 3, y: 4, width: 18, height: 5, rx: 2, fill: 'currentColor', opacity: 0.9 }),
        React.createElement('rect', { x: 3, y: 10.5, width: 18, height: 5, rx: 2, fill: 'currentColor', opacity: 0.55 }),
        React.createElement('rect', { x: 3, y: 17, width: 12, height: 3.5, rx: 1.75, fill: 'currentColor', opacity: 0.3 }))),
      React.createElement('div', { className: 'psu-titles' },
        React.createElement('strong', { className: 'psu-title' }, title),
        React.createElement('span', { className: 'psu-versions', 'data-psu-versions': '' },
          `${snapshot.current} → ${snapshot.latest}`))),
    React.createElement('div', { className: 'psu-actions' },
      React.createElement('button', {
        type: 'button',
        className: 'psu-primary',
        'data-psu-action': 'update',
        onClick: actions.update
      }, t('update')),
      React.createElement('button', {
        type: 'button',
        className: 'psu-secondary',
        'data-psu-action': 'later',
        onClick: actions.later
      }, t('later')),
      React.createElement('button', {
        type: 'button',
        className: 'psu-link',
        'data-psu-action': 'details',
        'aria-expanded': snapshot.expanded,
        onClick: actions.toggleDetails
      }, t(snapshot.expanded ? 'hideDetails' : 'details')),
      snapshot.canSilence
        ? React.createElement('button', {
          type: 'button',
          className: 'psu-link psu-silence',
          'data-psu-action': 'dont-remind',
          onClick: actions.silence
        }, t('dontRemind'))
        : null),
    snapshot.expanded
      ? React.createElement('div', { className: 'psu-details', 'data-psu-details': '' },
        React.createElement('span', { className: 'psu-details-title' }, t('highlights')),
        snapshot.highlights.length === 0
          ? React.createElement('p', { className: 'psu-empty' }, t('noHighlights'))
          : React.createElement('ul', { className: 'psu-points' },
            snapshot.highlights.map((point, index) => React.createElement('li', { key: `${index}:${point}` }, point))))
      : null)
  }

  /**
   * Install the update prompt: dictionaries, stylesheet, the page controller
   * lifecycle, and the additive `shell.overlay` entry. Nothing is inserted into
   * the native sidebar or any other React-managed shell subtree.
   * @param ctx - client root context.
   * @returns void
   */
  function installUpdatePrompt(ctx: UpdateCheckContext): void {
    const t = ctx.locale.bind(UPDATE_NS)
    ctx.effect(() => ctx.locale.register(UPDATE_NS, { en: UPDATE_EN, zh: UPDATE_ZH }), 'power-suite: update check dictionaries')
    ctx.effect(() => {
      const tag = document.createElement('style')
      tag.dataset.powerSuiteCss = 'update-check'
      tag.textContent = UPDATE_CSS
      document.head.appendChild(tag)
      return () => { tag.remove() }
    }, 'power-suite: update check styles')
    ctx.effect(() => {
      const controller = createUpdatePromptController(ctx)
      updatePromptController = controller
      return () => {
        controller.dispose()
        if (updatePromptController === controller) updatePromptController = null
      }
    }, 'power-suite: update check prompt')
    ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: UPDATE_SLOT_ID,
      locale: UPDATE_NS
    }, (props) => (updatePromptController === null
      ? null
      : React.createElement(UpdatePrompt, {
        ...props,
        t,
        controller: updatePromptController
      })))), 'power-suite: update prompt overlay')
  }

  return { installUpdatePrompt }
}
