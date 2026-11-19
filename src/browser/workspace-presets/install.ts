/**
 * Workspace default agent preset: menu contribution and creation routing.
 *
 * One Workspace context-menu submenu stores the default preset the Host applies
 * to new Sessions in that Workspace; the same store also names the preset on
 * the sidebar's New Session requests, because the Host's reuse path would
 * otherwise reset an existing blank to the global default.
 *
 * The menu, the roster read, the override read/write, the routing patch and its
 * cleanup used to sit inline in `src/client.js`. Copy keys/strings, context-menu
 * ids, the slot key and the patched method behavior are unchanged.
 *
 * @module
 */

import type { ReactElement } from 'react'
import { ROUTES, browserRoute } from '../../shared/routes.ts'
import { PRESET_EN, PRESET_NS, PRESET_ZH } from './copy.ts'

/** Namespace-bound translate seat used by the menu. */
export type WorkspacePresetTranslate = (key: string, params?: Record<string, unknown>) => string

/** One Agent preset roster row, narrowed from the Host answer. */
export interface WorkspacePresetRow {
  id: string
  name?: string
  isDefault?: boolean
  /** Present when the Host reports the preset as unavailable. */
  broken?: boolean
}

/** The roster answer the remote slice returns. */
export type WorkspacePresetRosterResult =
  | { ok: true, value: unknown }
  | { ok: false, error?: { code?: string } }

/** One contributed context-menu row. */
export interface WorkspacePresetMenuItem {
  id: string
  label: string
  disabled?: boolean
  failureLabel?: string
  run?: () => Promise<void>
  icon?: { key: string }
  children?: WorkspacePresetMenuItem[]
}

/** The context-menu registration this module contributes. */
export interface WorkspacePresetMenuRegistration {
  id: string
  target: string
  order?: number
  resolve(value: unknown, signal: AbortSignal): Promise<WorkspacePresetMenuItem[]>
}

/** Marker recording that this browser already patched the Workspace UI. */
export interface WorkspacePresetRoutingMarker {
  patched: true
}

/** The Workspace UI slice whose creation entry points are patched. */
export interface WorkspaceUiPatch {
  openWorkspace?(
    workspaceId: string,
    beforeOpen?: unknown,
    options?: Record<string, unknown> | null
  ): Promise<unknown> | unknown
  connectWorkspace?(
    workspaceId: string,
    options?: Record<string, unknown> | null
  ): Promise<unknown> | unknown
  __powerSuitePresetRouting?: WorkspacePresetRoutingMarker
}

/** The narrow client-root context slice the installers read. */
export interface WorkspacePresetsContext {
  effect(setup: () => (() => void) | void, label?: string): void
  locale: {
    bind(namespace: string): WorkspacePresetTranslate
    register(namespace: string, dictionaries: { en: Record<string, string>, zh: Record<string, string> }): () => void
  }
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(
      registration: { name: string, key: string },
      component: (props: { size?: number }) => ReactElement
    ): () => void
  }
  contextMenus: {
    register(registration: WorkspacePresetMenuRegistration): () => void
    notify(message: string, success?: boolean): void
  }
  remote: {
    agentPresets: {
      list(): Promise<WorkspacePresetRosterResult>
    }
  }
  uiWorkspace: WorkspaceUiPatch
}

/** Runtime modules the menu icon closes over. */
export interface WorkspacePresetsDeps {
  React: typeof import('react')
}

/** The two registration entry points bound to one entry instance. */
export interface WorkspacePresets {
  installWorkspacePresetMenu(ctx: WorkspacePresetsContext, appUrl: (relative: string) => string): void
  installWorkspacePresetRouting(ctx: WorkspacePresetsContext, appUrl: (relative: string) => string): void
}

/** Built-in preset ids whose display names the host UI localizes itself. */
const BUILT_IN_NAME_KEYS: Record<string, string> = {
  standard: 'preset.standard',
  ptc: 'preset.ptc',
  minimal: 'preset.minimal',
  cordis: 'preset.cordis'
}

/** Exact routes the Host half serves for the override map. */
const PRESET_GET_ROUTE = browserRoute(ROUTES.workspacePresetsGet)
const PRESET_SET_ROUTE = browserRoute(ROUTES.workspacePresetsSet)

/** A loose JSON object. */
type JsonRecord = Record<string, unknown>

/** Narrow an untrusted value to a JSON object. */
function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null ? value as JsonRecord : null
}

/** Read a response's error message, when it carries one. */
function readMessage(value: unknown): string | null {
  const record = asRecord(value)
  const message = record === null ? undefined : record.message
  return typeof message === 'string' ? message : null
}

/** Narrow one roster row. */
function normalizePreset(value: unknown): WorkspacePresetRow | null {
  const record = asRecord(value)
  if (record === null) return null
  const id = record.id
  if (typeof id !== 'string' || id.length === 0) return null
  const preset: WorkspacePresetRow = { id }
  if (typeof record.name === 'string') preset.name = record.name
  if (record.isDefault === true) preset.isDefault = true
  // The menu disables any preset whose `broken` key is present, including
  // `false`; preserving presence keeps that contract.
  if (record.broken !== undefined) preset.broken = true
  return preset
}

/**
 * Read one Workspace's stored default preset.
 * @param appUrl - absolute route builder for the current page.
 * @param workspaceId - Workspace identity.
 * @param signal - menu preparation cancellation.
 * @returns the stored preset id, or null for none.
 */
async function readWorkspacePreset(
  appUrl: (relative: string) => string,
  workspaceId: string,
  signal?: AbortSignal
): Promise<string | null> {
  const response = await fetch(`${appUrl(PRESET_GET_ROUTE)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
    signal,
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const value: unknown = await response.json()
  const record = asRecord(value)
  const preset = record === null ? undefined : record.preset
  return typeof preset === 'string' ? preset : null
}

/**
 * Store or clear one Workspace's default preset.
 * @param appUrl - absolute route builder for the current page.
 * @param workspaceId - Workspace identity.
 * @param preset - preset id, or null for no override.
 * @returns resolves after the Host persisted the value.
 */
async function writeWorkspacePreset(
  appUrl: (relative: string) => string,
  workspaceId: string,
  preset: string | null
): Promise<void> {
  const response = await fetch(appUrl(PRESET_SET_ROUTE), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId, preset })
  })
  if (response.ok) return
  let message = `HTTP ${response.status}`
  try {
    const body: unknown = await response.json()
    const remote = readMessage(body)
    if (remote !== null) message = remote
  } catch {
    // Keep the status text.
  }
  throw new Error(message)
}

/**
 * Create the Workspace-preset menu and routing installers.
 * @param deps - React runtime for the menu icon.
 * @returns the two registration entry points.
 */
export function createWorkspacePresets(deps: WorkspacePresetsDeps): WorkspacePresets {
  const { React } = deps

  /**
   * Display one preset's name: the published custom name when it has one,
   * the host's built-in label for a built-in id, else the raw id.
   * @param t - namespace-bound translate.
   * @param preset - roster row or stored id.
   * @returns the display name.
   */
  function presetDisplayName(t: WorkspacePresetTranslate, preset: { id: string, name?: string }): string {
    if (typeof preset.name === 'string' && preset.name.length > 0) return preset.name
    const key = BUILT_IN_NAME_KEYS[preset.id]
    return key === undefined ? preset.id : t(key)
  }

  /**
   * The menu row's glyph: a small preset badge.
   * @returns the SVG element.
   */
  function WorkspacePresetIcon(): ReactElement {
    return React.createElement('svg', {
      width: 16,
      height: 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true
    },
    React.createElement('rect', { x: 3.5, y: 5, width: 17, height: 14, rx: 4 }),
    React.createElement('path', { d: 'M8 10h8' }),
    React.createElement('path', { d: 'M8 14h5' }))
  }

  /**
   * Read the Agent preset roster for the menu.
   * @param ctx - client root context.
   * @returns the roster or a failure.
   */
  async function readPresetRoster(
    ctx: WorkspacePresetsContext
  ): Promise<{ ok: true, presets: WorkspacePresetRow[] } | { ok: false }> {
    try {
      const result = await ctx.remote.agentPresets.list()
      if (result.ok === true) {
        const record = asRecord(result.value)
        const rows = record !== null && Array.isArray(record.presets) ? record.presets : []
        const presets: WorkspacePresetRow[] = []
        for (const row of rows) {
          const preset = normalizePreset(row)
          if (preset !== null) presets.push(preset)
        }
        return { ok: true, presets }
      }
      if (result.error !== undefined && result.error !== null && result.error.code === 'gateway/invocation-unavailable') {
        return { ok: true, presets: [] }
      }
      return { ok: false }
    } catch {
      return { ok: false }
    }
  }

  /**
   * Save a Workspace default and acknowledge it on success; a rejection
   * reaches the shared menu toast through the action's failureLabel.
   * @param ctx - client root context.
   * @param t - namespace-bound translate.
   * @param appUrl - absolute route builder for the current page.
   * @param workspaceId - Workspace identity.
   * @param preset - preset id, or null for no override.
   * @param name - display name for the success notice.
   * @returns resolves after the write settles.
   */
  async function saveWorkspacePreset(
    ctx: WorkspacePresetsContext,
    t: WorkspacePresetTranslate,
    appUrl: (relative: string) => string,
    workspaceId: string,
    preset: string | null,
    name: string
  ): Promise<void> {
    await writeWorkspacePreset(appUrl, workspaceId, preset)
    ctx.contextMenus.notify(t('menu.saved', { name }), true)
  }

  /**
   * Contribute the Workspace context-menu submenu and its icon.
   * @param ctx - client root context.
   * @param appUrl - absolute route builder for the current page.
   * @returns void
   */
  function installWorkspacePresetMenu(ctx: WorkspacePresetsContext, appUrl: (relative: string) => string): void {
    const t = ctx.locale.bind(PRESET_NS)
    ctx.effect(() => ctx.locale.register(PRESET_NS, { en: PRESET_EN, zh: PRESET_ZH }), 'power-suite: workspace-presets dictionaries')
    ctx.effect(() => ctx.slots.inject('contextMenu.icon', () => ctx.slots.register({
      name: 'contextMenu.icon',
      key: 'power-suite.workspacePreset'
    }, WorkspacePresetIcon)), 'power-suite: workspace-presets icon')
    ctx.effect(() => ctx.contextMenus.register({
      id: 'power-suite.workspace-default-preset',
      target: 'workspace',
      order: 150,
      resolve: async (value, signal) => {
        const target = asRecord(value)
        const workspaceId = target === null ? undefined : target.workspaceId
        if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
          return [{ id: 'unavailable', label: t('menu.loadFailed'), disabled: true }]
        }
        let roster
        let current
        try {
          [roster, current] = await Promise.all([
            readPresetRoster(ctx),
            readWorkspacePreset(appUrl, workspaceId, signal)
          ])
        } catch {
          signal.throwIfAborted()
          return [{ id: 'unavailable', label: t('menu.loadFailed'), disabled: true }]
        }
        signal.throwIfAborted()
        if (roster.ok !== true) {
          return [{ id: 'unavailable', label: t('menu.loadFailed'), disabled: true }]
        }
        signal.throwIfAborted()
        const currentRow = current === null ? undefined : roster.presets.find((preset) => preset.id === current)
        const globalRow = roster.presets.find((preset) => preset.isDefault === true)
        const currentName = current === null
          ? t('menu.globalDefault')
          : currentRow === undefined ? current : presetDisplayName(t, currentRow)
        const globalName = globalRow === undefined ? t('menu.globalDefault') : presetDisplayName(t, globalRow)
        const children: WorkspacePresetMenuItem[] = [{
          id: 'global',
          label: current === null ? t('menu.followGlobalCurrent', { name: globalName }) : t('menu.followGlobal'),
          disabled: current === null,
          failureLabel: t('menu.saveFailed'),
          run: () => saveWorkspacePreset(ctx, t, appUrl, workspaceId, null, t('menu.globalDefault'))
        }]
        for (const preset of roster.presets) {
          const name = presetDisplayName(t, preset)
          const label = preset.id === current
            ? t('menu.currentMark', { name })
            : preset.broken === undefined
              ? name
              : t('menu.unavailableMark', { name })
          children.push({
            id: `preset:${preset.id}`,
            label,
            disabled: preset.broken !== undefined,
            failureLabel: t('menu.saveFailed'),
            run: () => saveWorkspacePreset(ctx, t, appUrl, workspaceId, preset.id, name)
          })
        }
        return [{
          id: 'workspaceDefaultPreset',
          icon: { key: 'power-suite.workspacePreset' },
          label: t('menu.current', { name: currentName }),
          children
        }]
      }
    }), 'power-suite: workspace default preset menu')
  }

  /**
   * Read one workspace's default preset and check that it is still usable.
   *
   * A stale or broken preference must never break New Session, so an
   * unresolvable store or a broken roster answer yields null and the caller
   * falls back to the user's global default.
   * @param ctx - client root context.
   * @param appUrl - absolute route builder for the current page.
   * @param workspaceId - Workspace identity.
   * @returns a usable preset id, or null.
   */
  async function usableWorkspacePreset(
    ctx: WorkspacePresetsContext,
    appUrl: (relative: string) => string,
    workspaceId: string
  ): Promise<string | null> {
    let preset
    try {
      preset = await readWorkspacePreset(appUrl, workspaceId)
    } catch {
      return null
    }
    if (preset === null) return null
    const roster = await readPresetRoster(ctx)
    if (roster.ok !== true) return null
    const row = roster.presets.find((entry) => entry.id === preset)
    if (row === undefined || row.broken !== undefined) return null
    return preset
  }

  /**
   * Return options that name the Workspace default preset.
   * @param options - caller-supplied options.
   * @param preset - the Workspace default.
   * @returns options carrying an explicit preset.
   */
  function withWorkspacePreset(
    options: Record<string, unknown> | null | undefined,
    preset: string | null
  ): Record<string, unknown> | null | undefined {
    if (preset === null) return options
    if (options !== null && options !== undefined && options.agentPreset !== undefined) return options
    return { ...(options ?? {}), agentPreset: preset }
  }

  /**
   * Route new-Session flows through the Workspace default.
   *
   * Explicit requests (Creator mode and other flows) already carry
   * `agentPreset` and pass through untouched.
   * @param ctx - client root context.
   * @param appUrl - absolute route builder for the current page.
   * @returns void
   */
  function installWorkspacePresetRouting(ctx: WorkspacePresetsContext, appUrl: (relative: string) => string): void {
    const ui = ctx.uiWorkspace
    if (ui === null || typeof ui !== 'object') return
    if (typeof ui.openWorkspace !== 'function' || typeof ui.connectWorkspace !== 'function') return
    const marker: WorkspacePresetRoutingMarker = { patched: true }
    if (ui.__powerSuitePresetRouting !== undefined) return
    const originalOpen = ui.openWorkspace
    const originalConnect = ui.connectWorkspace
    async function openWorkspaceWithPreset(
      workspaceId: string,
      beforeOpen?: unknown,
      options?: Record<string, unknown> | null
    ): Promise<unknown> {
      const preset = await usableWorkspacePreset(ctx, appUrl, workspaceId)
      return originalOpen.call(ui, workspaceId, beforeOpen, withWorkspacePreset(options, preset))
    }
    async function connectWorkspaceWithPreset(
      workspaceId: string,
      options?: Record<string, unknown> | null
    ): Promise<unknown> {
      const preset = await usableWorkspacePreset(ctx, appUrl, workspaceId)
      return originalConnect.call(ui, workspaceId, withWorkspacePreset(options, preset))
    }
    ui.openWorkspace = openWorkspaceWithPreset
    ui.connectWorkspace = connectWorkspaceWithPreset
    ui.__powerSuitePresetRouting = marker
    ctx.effect(() => () => {
      if (ui.__powerSuitePresetRouting !== marker) return
      delete ui.__powerSuitePresetRouting
      if (ui.openWorkspace === openWorkspaceWithPreset) ui.openWorkspace = originalOpen
      if (ui.connectWorkspace === connectWorkspaceWithPreset) ui.connectWorkspace = originalConnect
    }, 'power-suite: workspace-presets routing cleanup')
  }

  return { installWorkspacePresetMenu, installWorkspacePresetRouting }
}
