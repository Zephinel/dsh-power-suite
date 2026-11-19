/**
 * The suite's Plugins-page configuration section.
 *
 * One group holds the prompt-history shortcut modifier, the finished-Session
 * retention window and the active-project retention window. The page reads the
 * shared Host-backed settings store, so a successful write updates both this
 * page and the composer key handler in the same turn; the bundle README that
 * the Plugins page draws above this section is hidden while the section is
 * mounted and restored on unmount.
 *
 * Copy keys/strings, CSS, slot ids and the injected `t` seat are unchanged from
 * the inline entry region.
 *
 * @module
 */

import type { MutableRefObject, ReactElement } from 'react'
import {
  ACTIVE_PROJECT_DAYS,
  PROMPT_HISTORY_MODIFIERS,
  RECENT_SESSION_MINUTES
} from '../../shared/protocol.ts'
import type { SettingsPatch } from '../../shared/protocol.ts'
import { SETTINGS_EN, SETTINGS_NS, SETTINGS_ZH } from './copy.ts'
import { SETTINGS_CSS } from './styles.ts'
import type { SettingsField, SettingsStore, SettingsTranslate } from './store.ts'

/** Props the shell hands the bundle-config section (plus the injected locale seat). */
export interface SettingsPageProps {
  t?: SettingsTranslate
  [key: string]: unknown
}

/** The narrow client-root context slice the installer reads. */
export interface SettingsPageContext {
  effect(setup: () => (() => void) | void, label?: string): void
  locale: {
    bind(namespace: string): SettingsTranslate
    register(namespace: string, dictionaries: { en: Record<string, string>, zh: Record<string, string> }): () => void
  }
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(
      registration: { name: string, key: string, inject?: () => Record<string, unknown> },
      component: (props: SettingsPageProps) => ReactElement
    ): () => void
  }
}

/** Runtime modules and cross-feature seats the page closes over. */
export interface SettingsPageDeps {
  React: typeof import('react')
  store: SettingsStore
  packageName: string
}

/** The page component and its installer. */
export interface SettingsPage {
  PowerSuiteSettingsPage: (props: SettingsPageProps) => ReactElement
  installSettingsPage(ctx: SettingsPageContext): void
}

/**
 * Create the settings page and installer.
 * @param deps - React runtime, the shared store and the bundle package name.
 * @returns the page component and its registration entry point.
 */
export function createSettingsPage(deps: SettingsPageDeps): SettingsPage {
  const { React, store, packageName } = deps

  /**
   * Render the bundle's configuration on its Plugins-page detail page.
   * @param props - bundle-config owner props plus the injected locale seat.
   * @returns the settings section.
   */
  function PowerSuiteSettingsPage(props: SettingsPageProps): ReactElement {
    const t: SettingsTranslate = props.t ?? ((key: string) => key)
    const snapshot = React.useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
    const [saving, setSaving] = React.useState(false)
    const [failed, setFailed] = React.useState(false)
    const ready = snapshot.status === 'ready'
    const locked = !ready || saving
    const current = snapshot.value.promptHistoryModifier
    const currentText = store.shortcutText(t, current)
    const currentRecent = snapshot.value.recentSessionMinutes
    const currentActive = snapshot.value.activeProjectDays
    const pageRef: MutableRefObject<HTMLElement | null> = React.useRef<HTMLElement | null>(null)

    // The bundle page draws the package README above this configuration
    // section. The suite's settings surface is self-contained, so the
    // document is hidden while the section is mounted and restored on unmount.
    React.useEffect(() => {
      const page = pageRef.current
      if (!(page instanceof HTMLElement)) return undefined
      const config = page.closest('[data-plugin-config]')
      const sections = config?.parentElement
      if (!(sections instanceof HTMLElement)) return undefined
      const hidden: Array<{ element: HTMLElement, display: string }> = []
      for (const child of Array.from(sections.children)) {
        if (child instanceof HTMLElement && child.hasAttribute('data-detail-document')) {
          hidden.push({ element: child, display: child.style.display })
          child.style.display = 'none'
        }
      }
      return () => {
        for (const entry of hidden) entry.element.style.display = entry.display
      }
    }, [])

    /**
     * Persist one settings patch.
     * @param patch - recognized fields to write.
     * @param field - field the patch changes.
     * @returns void
     */
    function choosePatch(patch: SettingsPatch, field: SettingsField): void {
      if (locked || patch[field] === snapshot.value[field]) return
      setSaving(true)
      setFailed(false)
      store.save(patch).then((accepted) => {
        setSaving(false)
        if (!accepted) setFailed(true)
      })
    }

    let note: string | null = null
    let noteIsError = false
    if (failed) {
      note = t('settings.error')
      noteIsError = true
    } else if (snapshot.status === 'error') {
      note = t('settings.unavailable')
    }

    const modifierOptions = PROMPT_HISTORY_MODIFIERS.map((mode) => React.createElement('label', {
      key: mode,
      className: 'dps-choice-option psf-rainbow-focus',
      'data-selected': mode === current ? 'true' : undefined
    },
    React.createElement('input', {
      type: 'radio',
      name: 'dsh-power-suite-history-modifier',
      value: mode,
      checked: mode === current,
      disabled: locked,
      onChange: () => choosePatch({ promptHistoryModifier: mode }, 'promptHistoryModifier')
    }),
    React.createElement('span', { className: 'dps-choice-text' }, t(`modifier.${mode}`))))

    const recentOptions = RECENT_SESSION_MINUTES.map((minutes) => React.createElement('label', {
      key: minutes,
      className: 'dps-choice-option psf-rainbow-focus',
      'data-selected': minutes === currentRecent ? 'true' : undefined
    },
    React.createElement('input', {
      type: 'radio',
      name: 'dsh-power-suite-recent-session-window',
      value: String(minutes),
      checked: minutes === currentRecent,
      disabled: locked,
      onChange: () => choosePatch({ recentSessionMinutes: minutes }, 'recentSessionMinutes')
    }),
    React.createElement('span', { className: 'dps-choice-text' }, t(`recent.${minutes}`))))

    const activeOptions = ACTIVE_PROJECT_DAYS.map((days) => React.createElement('label', {
      key: days,
      className: 'dps-choice-option psf-rainbow-focus',
      'data-selected': days === currentActive ? 'true' : undefined
    },
    React.createElement('input', {
      type: 'radio',
      name: 'dsh-power-suite-active-project-window',
      value: String(days),
      checked: days === currentActive,
      disabled: locked,
      onChange: () => choosePatch({ activeProjectDays: days }, 'activeProjectDays')
    }),
    React.createElement('span', { className: 'dps-choice-text' }, t(`active.${days}`))))

    return React.createElement('section', { className: 'dps-settings', ref: pageRef },
      React.createElement('style', null, SETTINGS_CSS),
      React.createElement('div', { className: 'dps-settings-head' },
        React.createElement('h3', { className: 'dps-settings-title' }, t('history.group')),
        React.createElement('p', { className: 'dps-settings-hint' }, t('history.groupHint'))),
      React.createElement('div', { className: 'dps-settings-row' },
        React.createElement('div', { className: 'dps-settings-copy' },
          React.createElement('div', { className: 'dps-settings-label' }, t('history.label')),
          React.createElement('p', { className: 'dps-settings-hint' }, t('history.current', { shortcut: currentText }))),
        React.createElement('fieldset', { className: 'dps-choice', disabled: locked },
          React.createElement('legend', { className: 'dps-visually-hidden' }, t('history.label')),
          modifierOptions)),
      React.createElement('div', { className: 'dps-settings-group' },
        React.createElement('div', { className: 'dps-settings-head' },
          React.createElement('h3', { className: 'dps-settings-title' }, t('dynamic.group')),
          React.createElement('p', { className: 'dps-settings-hint' }, t('dynamic.groupHint'))),
        React.createElement('div', { className: 'dps-settings-row' },
          React.createElement('div', { className: 'dps-settings-copy' },
            React.createElement('div', { className: 'dps-settings-label' }, t('recent.label')),
            React.createElement('p', { className: 'dps-settings-hint' }, t('recent.current', { value: t(`recent.${currentRecent}`) }))),
          React.createElement('fieldset', { className: 'dps-choice', disabled: locked },
            React.createElement('legend', { className: 'dps-visually-hidden' }, t('recent.label')),
            recentOptions)),
        React.createElement('div', { className: 'dps-settings-row' },
          React.createElement('div', { className: 'dps-settings-copy' },
            React.createElement('div', { className: 'dps-settings-label' }, t('active.label')),
            React.createElement('p', { className: 'dps-settings-hint' }, t('active.current', { value: t(`active.${currentActive}`) }))),
          React.createElement('fieldset', { className: 'dps-choice', disabled: locked },
            React.createElement('legend', { className: 'dps-visually-hidden' }, t('active.label')),
            activeOptions))),
      note === null ? null : React.createElement('p', {
        className: 'dps-settings-note',
        role: 'status',
        'data-error': noteIsError ? 'true' : undefined
      }, note))
  }

  /**
   * Register the Plugins-page configuration section and its dictionaries.
   * @param ctx - client root context.
   * @returns void
   */
  function installSettingsPage(ctx: SettingsPageContext): void {
    const t = ctx.locale.bind(SETTINGS_NS)
    ctx.effect(() => ctx.locale.register(SETTINGS_NS, { en: SETTINGS_EN, zh: SETTINGS_ZH }), 'power-suite: settings dictionaries')
    ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
      name: 'plugins.bundle.config',
      key: packageName,
      inject: () => ({ t })
    }, PowerSuiteSettingsPage)), 'power-suite: settings page')
    store.load()
  }

  return { PowerSuiteSettingsPage, installSettingsPage }
}
