/**
 * Host-backed settings store shared by the page and the composer key handler.
 *
 * One page-lifetime snapshot, one loader, one save path: the settings page
 * subscribes through `useSyncExternalStore`, and the prompt-history seat reads
 * `current()` before it matches a keydown. The store itself owns the fetch
 * calls and the platform/modifier decisions that used to sit inline in
 * `src/client.js`; defaults and recognized fields still come from the shared
 * protocol model.
 *
 * @module
 */

import { DEFAULT_SETTINGS } from '../../shared/protocol.ts'
import type { Settings, SettingsPatch } from '../../shared/protocol.ts'
import { ROUTES, browserRoute } from '../../shared/routes.ts'
import { mergeSettingsPayload } from './model.ts'

/** Settings document plus its load state. */
export interface SettingsSnapshot {
  status: 'loading' | 'ready' | 'error'
  value: Settings
}

/** One settings field the page can write. */
export type SettingsField = 'promptHistoryModifier' | 'recentSessionMinutes' | 'activeProjectDays'

/** The keydown members the history modifier matches. */
export interface HistoryModifierEvent {
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

/** Namespace-bound translate seat used for the shortcut labels. */
export type SettingsTranslate = (key: string, params?: Record<string, unknown>) => string

/** The shared store seat. */
export interface SettingsStore {
  snapshot(): SettingsSnapshot
  subscribe(listener: () => void): () => void
  load(): Promise<void>
  save(patch: SettingsPatch): Promise<boolean>
  current(): Settings
  isApplePlatform(): boolean
  matchesHistoryModifier(event: HistoryModifierEvent, mode: string): boolean
  shortcutText(t: SettingsTranslate, mode: string): string
}

/** Dependencies the store reads at creation time. */
export interface SettingsStoreDeps {
  appUrl(relative: string): string
}

/** The navigator slice `isApplePlatform` inspects. */
interface SettingsNavigator {
  readonly userAgent?: string
  readonly platform?: string
  readonly userAgentData?: { readonly platform?: string }
}

/** Read the browser navigator without touching it at module load. */
function settingsNavigator(): SettingsNavigator | null {
  const navigator = (globalThis as unknown as { navigator?: SettingsNavigator }).navigator
  return navigator ?? null
}

/**
 * Create one page-lifetime settings store.
 * @param deps - absolute route builder for the current page.
 * @returns the shared store.
 */
export function createSettingsStore(deps: SettingsStoreDeps): SettingsStore {
  const route = browserRoute(ROUTES.settings)
  const store = {
    snapshot: { status: 'loading', value: { ...DEFAULT_SETTINGS } } as SettingsSnapshot,
    listeners: new Set<() => void>(),
    loading: null as Promise<void> | null
  }

  /**
   * Read the current shared settings snapshot.
   * @returns the snapshot.
   */
  function snapshot(): SettingsSnapshot {
    return store.snapshot
  }

  /**
   * Subscribe to settings changes.
   * @param listener - change callback.
   * @returns unsubscribe.
   */
  function subscribe(listener: () => void): () => void {
    store.listeners.add(listener)
    return () => {
      store.listeners.delete(listener)
    }
  }

  /**
   * Publish one new settings snapshot.
   * @param next - next snapshot.
   * @returns void
   */
  function publish(next: SettingsSnapshot): void {
    store.snapshot = next
    for (const listener of [...store.listeners]) {
      try {
        listener()
      } catch {
        // A failing listener must not block the others.
      }
    }
  }

  /**
   * Load the Host settings once per page.
   * @returns resolves after the snapshot updates.
   */
  async function load(): Promise<void> {
    if (store.loading !== null) return store.loading
    const task = (async () => {
      try {
        const response = await fetch(deps.appUrl(route), {
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload: unknown = await response.json()
        publish({ status: 'ready', value: mergeSettingsPayload(payload) })
      } catch {
        publish({ status: 'error', value: { ...store.snapshot.value } })
      } finally {
        store.loading = null
      }
    })()
    store.loading = task
    return task
  }

  /**
   * Save one settings patch through the Host and publish the result.
   * @param patch - recognized fields to write.
   * @returns whether the Host accepted the write.
   */
  async function save(patch: SettingsPatch): Promise<boolean> {
    try {
      const response = await fetch(deps.appUrl(route), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch)
      })
      if (!response.ok) return false
      const payload: unknown = await response.json()
      publish({ status: 'ready', value: mergeSettingsPayload(payload) })
      return true
    } catch {
      return false
    }
  }

  /**
   * Read the settings the features currently use, without subscribing.
   * @returns current settings.
   */
  function current(): Settings {
    return store.snapshot.value
  }

  /**
   * Whether this browser runs on Apple hardware, where the primary shortcut
   * modifier is Command instead of Control.
   * @returns whether the platform primary modifier is Command.
   */
  function isApplePlatform(): boolean {
    const navigator = settingsNavigator()
    if (navigator === null) return false
    const platform = typeof navigator.userAgentData === 'object' && navigator.userAgentData !== null
      ? String(navigator.userAgentData.platform ?? '')
      : ''
    if (/mac|iphone|ipad|ipod/i.test(platform)) return true
    const legacy = String(navigator.platform ?? '')
    if (/mac|iphone|ipad|ipod/i.test(legacy)) return true
    return /Mac OS X|iPhone|iPad|iPod/.test(String(navigator.userAgent ?? ''))
  }

  /**
   * Whether a keydown carries exactly the configured history modifier.
   * @param event - the keydown.
   * @param mode - configured modifier mode.
   * @returns whether the event matches.
   */
  function matchesHistoryModifier(event: HistoryModifierEvent, mode: string): boolean {
    if (mode === 'shift') {
      return event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
    }
    if (event.shiftKey) return false
    switch (mode) {
      case 'primary':
        return isApplePlatform()
          ? event.metaKey && !event.ctrlKey && !event.altKey
          : event.ctrlKey && !event.metaKey && !event.altKey
      case 'ctrl':
        return event.ctrlKey && !event.metaKey && !event.altKey
      case 'alt':
        return event.altKey && !event.metaKey && !event.ctrlKey
      default:
        return false
    }
  }

  /**
   * One modifier mode's shortcut as displayed text.
   * @param t - namespace-bound translate.
   * @param mode - modifier mode.
   * @returns the shortcut text.
   */
  function shortcutText(t: SettingsTranslate, mode: string): string {
    switch (mode) {
      case 'primary':
        return t(isApplePlatform() ? 'shortcut.primary.mac' : 'shortcut.primary.other')
      case 'alt':
        return t(isApplePlatform() ? 'shortcut.alt.mac' : 'shortcut.alt.other')
      case 'ctrl':
        return t('shortcut.ctrl')
      case 'shift':
        return t(isApplePlatform() ? 'shortcut.shift.mac' : 'shortcut.shift.other')
      default:
        return t('shortcut.off')
    }
  }

  return { snapshot, subscribe, load, save, current, isApplePlatform, matchesHistoryModifier, shortcutText }
}
