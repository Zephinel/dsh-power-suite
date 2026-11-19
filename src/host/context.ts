/**
 * Minimal structural DSH Host context used by this suite's installers.
 *
 * Only the services and members the suite actually touches are modeled; the
 * index signature keeps unknown composition extras usable without falling back
 * to `any` at every call site. Route handlers receive the platform's WHATWG
 * `Request` and return a `Response`.
 *
 * @module
 */

/** Event payloads the suite subscribes to (only the members it uses). */
export interface HostEventMap {
  'session/event': [session: Record<string, unknown>, event: Record<string, unknown>]
  'agent/created': [payload: { agent: unknown }]
}

/** One exact Fetch route registered on Connection's shared API channel. */
export interface HostRoute {
  path: string
  methods: string[]
  requestBody?: 'buffered'
  fetch: (request: Request) => Response | Promise<Response>
}

/** One Session snapshot as read through `sessionQuery.readSession`. */
export interface SessionSnapshot {
  session: { cwd?: string | null }
  events: readonly Record<string, unknown>[]
}

/**
 * The filesystem service resolves a path into an opaque {@link FsTarget}; only
 * the backend interprets the key, and every later call passes the target back.
 */
export interface FsTarget {
  targetKey: unknown
  displayPath: string
}

/** One resolved target's metadata (a subset of DSH's `FsInfo`). */
export interface FileInfo {
  type?: 'file' | 'directory' | 'other'
  size?: number
  version?: unknown
}

/** The subset of the DSH filesystem service the suite uses. */
export interface FileService {
  resolve(path: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>
  stat(target: FsTarget, signal?: AbortSignal): Promise<FileInfo | undefined>
  readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
  readByteRange(target: FsTarget, range: { offset: number, length: number }, signal?: AbortSignal): Promise<Uint8Array>
}

/** The subset of the Agent-preset service the suite uses. */
export interface AgentPresetService {
  list(): Promise<Array<Record<string, unknown>>>
  presetForSession(session: unknown): string | null
  defaultId: string
  select(agent: unknown, target: string): Promise<string>
}

/** The subset of the Agent service the suite uses. */
export interface AgentService {
  get(id: string): { status?: string } | undefined
  turnBoundaryOf(session: unknown): { lastTurn: number }
}

/** The subset of the Session-query service the suite uses. */
export interface SessionQueryService {
  readSession(id: string): Promise<SessionSnapshot>
  listSessions(): Promise<unknown[]>
}

/** The subset of the Workspace registry the suite uses. */
export interface WorkspaceRegistryService {
  get(id: string): unknown
  resolveByPath(path: string): Promise<{ id: string } | undefined>
}

/** One DSH Host context as seen by this suite. */
export interface HostContext {
  effect(callback: () => unknown, label?: string): unknown
  on<K extends keyof HostEventMap>(
    event: K,
    handler: (...args: HostEventMap[K]) => void,
    options?: { global?: boolean }
  ): unknown
  connection: { fetch: { register(route: HostRoute): unknown } }
  fs: FileService
  sessionQuery: SessionQueryService
  agents: AgentService
  agentPresets: AgentPresetService
  workspaceRegistry: WorkspaceRegistryService
  webServer: { getOrigin(): string }
  get(service: string): unknown
  [member: string]: unknown
}
