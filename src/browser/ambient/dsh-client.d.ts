/**
 * Minimal structural declarations for the DSH Web client runtime the browser
 * entry lives in.
 *
 * `src/client.js` is not an ES module at runtime: the DSH module loader seeds
 * `react`, `react-dom` and the shell's UI primitives, then evaluates the bundle
 * as a classic script that calls `window.__ModuleLoader__.load({ factory })`.
 * The entry also receives one client root context (`ctx`) in `apply`. Neither
 * surface ships local type declarations, so this file owns the part the plugin
 * actually reads.
 *
 * The declarations are deliberately structural: dynamic slot props, remote
 * payloads and DOM-owned values stay `unknown` and every consumer narrows them
 * at the boundary. Names are prefixed `Dsh` to stay out of the way of DOM and
 * Node globals.
 *
 * @module
 */

/** One namespace-bound translate seat (`t(key, params)`). */
interface DshTranslate {
  (key: string, params?: Record<string, unknown>): string
}

/** Locale service slice: dictionaries, the bound seat and the active locale. */
interface DshLocaleService {
  bind(namespace: string): DshTranslate
  register(namespace: string, dictionaries: { en: Record<string, string>, zh: Record<string, string> }): () => void
  getLocale(): unknown
}

/** One slot registration descriptor. */
interface DshSlotRegistration {
  name: string
  id?: string
  order?: number
  locale?: string
  inject?: () => Record<string, unknown>
}

/** Dynamic-injection scope handed to `ctx.inject` callbacks. */
interface DshInjectionScope {
  get(service: string): unknown
  effect?(setup: () => (() => void) | void, label?: string): void
  pluginNavigation?: unknown
}

/** Slot service slice: registration, dynamic injection and root-seat lookup. */
interface DshSlotsService {
  register(registration: DshSlotRegistration, component: (props: Record<string, unknown>) => unknown): () => void
  inject(names: string | readonly string[], callback: (scope: DshInjectionScope) => void): () => void
  entries(name: string): readonly unknown[]
  subscribe(name: string, listener: () => void): (() => void) | null
}

/** One remote invocation result envelope. */
type DshRemoteResult<T> = { ok: true, value: T } | { ok: false, error?: { code?: string } }

/** Remote service slice the entry reads. */
interface DshRemoteService {
  agentPresets: {
    list(): Promise<DshRemoteResult<{ presets: readonly unknown[] }>>
  }
}

/** Session service slice: row creation and projection refresh. */
interface DshSessionsService {
  create?(request: { workspaceId?: string, cwd?: string, agentPreset?: string }): Promise<unknown> | unknown
  refreshProjections?(sessionId: string): Promise<unknown> | unknown
  list?(): Promise<unknown> | unknown
  subscribe?(listener: () => void): () => void
}

/** Workspace UI service slice used by the preset routing and card actions. */
interface DshUiWorkspaceService {
  openSession?(sessionId: string): void
  startSession?(workspaceId: string): void
  openWorkspace?(workspaceId: string, beforeOpen?: unknown, options?: Record<string, unknown>): Promise<unknown> | unknown
  connectWorkspace?(workspaceId: string, options?: Record<string, unknown>): Promise<unknown> | unknown
}

/** Live shared context-menu popup state. */
interface DshContextMenuActive {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
}

/** One context-menu contribution. */
interface DshContextMenuRegistration {
  id: string
  target: string
  order?: number
  resolve(value: unknown, signal: unknown): unknown
}

/** Context-menu service slice: contribution, popup and toast. */
interface DshContextMenuService {
  register(contribution: DshContextMenuRegistration): () => void
  open(target: { kind: string, value?: Record<string, unknown> }, position: { x: number, y: number }): void
  close(): void
  notify(message: string, success?: boolean): void
  active?: DshContextMenuActive
  resolve?(target: { kind: string, value: Record<string, unknown> }): unknown
}

/** Right-sidebar service slice: the native resource preview. */
interface DshSidebarRightService {
  openResource(address: string): void
}

/** Composer input-trigger service slice. */
interface DshInputTriggersService {
  registerSource(source: unknown): () => void
}

/**
 * The entry's documented loose context narrowed to one module's declared slice.
 *
 * The module contexts describe the same runtime object more precisely, so the
 * two declarations cannot overlap structurally; this alias keeps the boundary
 * assertion explicit instead of widening a module contract.
 */
type DshModuleContext<T> = DshClientContext & T

/** The client root context handed to the browser entry's `apply(ctx)`. */
interface DshClientContext {
  effect(setup: () => (() => void) | void, label?: string): void
  inject(names: string | readonly string[], callback: (scope: DshInjectionScope) => void): unknown
  on(event: string, listener: (...args: unknown[]) => void): () => void
  slots: DshSlotsService
  locale: DshLocaleService
  sessions: DshSessionsService
  uiWorkspace: DshUiWorkspaceService
  contextMenus: DshContextMenuService
  sidebarRight: DshSidebarRightService
  remote: DshRemoteService
  inputTriggers: DshInputTriggersService
}

/** One `window.__ModuleLoader__.load` call. */
interface DshModuleDefinition {
  id: string
  factory: (require: DshRequire) => unknown
}

/** The shell's classic-script module loader. */
interface DshModuleLoader {
  load(definition: DshModuleDefinition): void
}

/** Module resolver handed to the factory; only shell-seeded modules exist. */
interface DshRequire {
  (specifier: 'react'): typeof import('react')
  (specifier: 'react-dom'): typeof import('react-dom')
  (specifier: '@deepseek-ai/dsh-client-ui-primitives'): typeof import('@deepseek-ai/dsh-client-ui-primitives')
  (specifier: string): unknown
}

/** Browser global installed by the DSH Web shell before the bundle runs. */
interface Window {
  __ModuleLoader__: DshModuleLoader
}
