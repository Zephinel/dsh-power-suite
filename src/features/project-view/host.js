/**
 * Host half of the suite's `project-view` feature: one authenticated route
 * serving everything the browser's Project conversation view renders.
 *
 * The route is read-only. It resolves a Workspace from `workspaceId` (or from
 * a Session id, including a subagent whose accounted ancestor owns it), lists
 * the Workspace's accounted Sessions, measures at most the newest 20 by reading
 * their logs through `ctx.sessionQuery`, and folds each log with the pure
 * helpers in `./fold.js`. The result is one JSON snapshot: project facts,
 * stat values, session rows, turn runs with their nested job rows, and a
 * recent-activity feed derived from those same facts.
 *
 * Two design constraints keep the route affordable on a large project:
 * - Session selection uses the persisted projection cache when the composition
 *   provides it (`sessionProjectionCache`): a cached title and last-prompt time
 *   rank Sessions without opening their logs. Without the cache the route falls
 *   back to live Sessions first, then newest-created order.
 * - A short in-memory cache (10 s) keyed by Workspace identity and membership
 *   absorbs the browser's polling; `refresh=1` bypasses it for the manual
 *   refresh action. Every response is `cache-control: no-store` because the
 *   browser cache must not serve a stale snapshot after a turn ends.
 */

import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isInterrupted, lastEventTime, lastTurnState } from '../interrupted-sessions/turns.js'
import { defaultSettings, parseSettings } from '../settings/store.js'
import {
  MAX_ACTIVITY,
  MAX_JOBS_PER_RUN,
  MAX_RUNS,
  MAX_RUNS_PER_SESSION,
  MAX_SESSIONS,
  associateJobs,
  buildRecentActivity,
  buildRuns,
  computeStats,
  foldSessionLog,
  localDayStart
} from './fold.js'

/** Authenticated route serving one Workspace's project snapshot. */
export const PROJECT_ROUTE = '/api/power-suite.project'

/** How long one snapshot stays warm. */
const CACHE_TTL_MS = 10_000

/** Most Workspace snapshots kept in the process. */
const MAX_CACHE = 30

/** Log reads in flight at once; each read can be a large persisted file. */
const READ_CONCURRENCY = 4

/** How long a parsed settings document stays warm. */
const SETTINGS_TTL_MS = 5_000

/**
 * Answer with JSON and a no-store policy: the snapshot tracks live state.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 * @returns {Response} the response.
 */
function sendJson(status, payload) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * The harness home this process uses.
 * @returns {string} absolute harness home.
 */
function harnessHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.length > 0) return configured
  return path.join(os.homedir(), '.dsh')
}

/**
 * Whether one Agent is currently running.
 * @param {object} ctx - Host context carrying the Agent registry.
 * @param {string} sessionId - Session to inspect.
 * @returns {boolean} whether a live Agent is running.
 */
function agentRunning(ctx, sessionId) {
  try {
    const agent = ctx.agents.get(sessionId)
    return agent !== undefined && agent.status === 'running'
  } catch {
    return false
  }
}

/**
 * Read the two retention windows the Active/Inactive classification shares with
 * Dynamic Workspaces. A missing or broken settings file reads as the defaults,
 * exactly like the settings route itself.
 * @returns {Promise<{ recentSessionMinutes: number, activeProjectDays: number }>} settings.
 */
let settingsCache = { at: 0, value: defaultSettings() }

async function readWindows() {
  if (Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value
  let value = defaultSettings()
  try {
    const text = await readFile(path.join(harnessHome(), 'dsh-power-suite', 'settings.json'), 'utf8')
    value = parseSettings(text)
  } catch {
    value = defaultSettings()
  }
  settingsCache = { at: Date.now(), value }
  return value
}

/**
 * Read the cached projection hints for one listed Session, tolerating a
 * composition without the projection cache entirely.
 * @param {object | undefined} cache - `ctx.get('sessionProjectionCache')` result.
 * @param {object} header - cloned Session header from the corpus listing.
 * @returns {{ title: string | null, lastPromptAt: number | null }} hints.
 */
function projectionHints(cache, header) {
  if (cache === undefined || cache === null || typeof cache.cachedSnapshot !== 'function') {
    return { title: null, lastPromptAt: null }
  }
  try {
    const snapshot = cache.cachedSnapshot(header, ['title', 'sessionListMetadata'])
    const values = snapshot !== undefined && snapshot !== null ? snapshot.values : undefined
    if (values === null || typeof values !== 'object') return { title: null, lastPromptAt: null }
    const title = typeof values.title === 'string' && values.title.length > 0 ? values.title : null
    const metadata = values.sessionListMetadata
    const lastPromptAt = metadata !== null && typeof metadata === 'object' && Number.isFinite(metadata.lastPromptAt)
      ? metadata.lastPromptAt
      : null
    return { title, lastPromptAt }
  } catch {
    return { title: null, lastPromptAt: null }
  }
}

/**
 * Find the Workspace a request names.
 *
 * `workspaceId` must exist. `sessionId` first tries direct Workspace
 * membership, then the Session's durable parent chain (a subagent is not
 * accounted to a Workspace itself), then the canonical cwd match. The third
 * fallback is what keeps the view usable for a Session whose Workspace row was
 * reordered or whose parent was archived.
 * @param {object} ctx - Host context.
 * @param {string | null} workspaceId - requested Workspace.
 * @param {string | null} sessionId - requested Session.
 * @param {Array<object>} records - corpus listing, when already loaded.
 * @returns {Promise<{ workspace: object, focusSessionId: string | null } | { error: number, code: string, message: string }>} resolution.
 */
async function resolveWorkspace(ctx, workspaceId, sessionId, records = null) {
  if (workspaceId !== null) {
    const workspace = ctx.workspaceRegistry.get(workspaceId)
    if (workspace === undefined) return { error: 404, code: 'workspace-not-found', message: 'Workspace not found' }
    return { workspace, focusSessionId: sessionId }
  }
  const workspaces = ctx.workspaceRegistry.list()
  const direct = workspaces.find((candidate) => candidate.sessionIds.includes(sessionId))
  if (direct !== undefined) return { workspace: direct, focusSessionId: sessionId }

  const listed = records ?? await ctx.sessionQuery.listSessions()
  const headers = new Map()
  for (const record of Array.isArray(listed) ? listed : []) {
    const header = record !== null && typeof record === 'object' ? record.header : undefined
    if (header !== null && typeof header === 'object' && typeof header.id === 'string') headers.set(header.id, header)
  }
  let header = headers.get(sessionId)
  if (header === undefined) {
    const snapshot = await ctx.sessionQuery.readSession(sessionId)
    header = snapshot !== null && typeof snapshot === 'object' ? snapshot.session : undefined
  }
  const seen = new Set()
  let cursor = header !== null && typeof header === 'object' ? header : null
  while (cursor !== null && typeof cursor.parentSession === 'string' && !seen.has(cursor.parentSession)) {
    seen.add(cursor.parentSession)
    const owner = workspaces.find((candidate) => candidate.sessionIds.includes(cursor.parentSession))
    if (owner !== undefined) return { workspace: owner, focusSessionId: sessionId }
    cursor = headers.get(cursor.parentSession) ?? null
  }
  if (header !== null && typeof header.cwd === 'string') {
    const byPath = workspaces.find((candidate) => candidate.path === header.cwd)
    if (byPath !== undefined) return { workspace: byPath, focusSessionId: sessionId }
  }
  return { error: 404, code: 'workspace-not-found', message: 'Session is not accounted to a Workspace' }
}

/**
 * Run `worker` over `items` with a bounded number in flight.
 * @template T, R
 * @param {readonly T[]} items - inputs.
 * @param {number} limit - concurrency.
 * @param {(item: T) => Promise<R>} worker - work.
 * @returns {Promise<R[]>} results in input order.
 */
async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = []
  const count = Math.max(1, Math.min(limit, items.length))
  for (let index = 0; index < count; index += 1) {
    runners.push((async () => {
      while (true) {
        const current = next
        next += 1
        if (current >= items.length) return
        results[current] = await worker(items[current])
      }
    })())
  }
  await Promise.all(runners)
  return results
}

/**
 * Build the full project snapshot for one resolved Workspace.
 * @param {object} ctx - Host context.
 * @param {object} workspace - Workspace entity from the registry.
 * @param {string | null} focusSessionId - Session the browser is showing.
 * @param {Array<object>} records - corpus listing.
 * @param {object} windows - retention windows.
 * @param {number} now - snapshot clock.
 * @returns {Promise<object>} the JSON payload.
 */
export async function collectProjectSnapshot(ctx, workspace, focusSessionId, records, windows, now) {
  const archived = new Set(Array.isArray(ctx.workspaceRegistry.archivedSessionIds) ? ctx.workspaceRegistry.archivedSessionIds : [])
  const projectionCache = typeof ctx.get === 'function' ? ctx.get('sessionProjectionCache') : undefined
  const recordById = new Map()
  for (const record of Array.isArray(records) ? records : []) {
    const header = record !== null && typeof record === 'object' ? record.header : undefined
    if (header !== null && typeof header === 'object' && typeof header.id === 'string') recordById.set(header.id, record)
  }

  // Every accounted, non-archived Session is a project member, even when the
  // measurement cap keeps it out of the runs/stats sample.
  const members = workspace.sessionIds.filter((id) => recordById.has(id) && !archived.has(id))
  const allRunning = new Set(members.filter((id) => agentRunning(ctx, id)))

  const candidates = members.map((id) => {
    const header = recordById.get(id).header
    const hints = projectionHints(projectionCache, header)
    const createdAt = Number.isFinite(header.createdAt) ? header.createdAt : 0
    return {
      sessionId: id,
      header,
      running: allRunning.has(id),
      live: recordById.get(id).live === true,
      rankAt: Math.max(createdAt, hints.lastPromptAt ?? 0),
      hintTitle: hints.title
    }
  })
  candidates.sort((left, right) => {
    if (left.running !== right.running) return left.running ? -1 : 1
    if (left.live !== right.live) return left.live ? -1 : 1
    return right.rankAt - left.rankAt || left.sessionId.localeCompare(right.sessionId)
  })
  const selected = candidates.slice(0, MAX_SESSIONS)
  const warnings = []

  const measured = await mapConcurrent(selected, READ_CONCURRENCY, async (candidate) => {
    try {
      const snapshot = await ctx.sessionQuery.readSession(candidate.sessionId)
      const events = snapshot !== null && typeof snapshot === 'object' && Array.isArray(snapshot.events) ? snapshot.events : []
      const header = snapshot !== null && typeof snapshot === 'object' && snapshot.session !== null && typeof snapshot.session === 'object'
        ? snapshot.session
        : candidate.header
      const inherited = Number.isInteger(snapshot?.inheritedEventCount) && snapshot.inheritedEventCount > 0
        ? snapshot.inheritedEventCount
        : 0
      // A fork's inherited prefix belongs to the source Session; folding it
      // here would count the same turns twice across a project.
      const own = inherited > 0 ? events.slice(inherited) : events
      const fold = foldSessionLog(own)
      const running = allRunning.has(candidate.sessionId)
      const lastActivityAt = Math.max(
        fold.lastActivityAt ?? 0,
        Number.isFinite(header.createdAt) ? header.createdAt : 0
      )
      const jobsByTurn = associateJobs(fold.turns, fold.jobs, fold.callIdToTurn)
      return {
        sessionId: candidate.sessionId,
        title: fold.title ?? candidate.hintTitle ?? null,
        running,
        interrupted: isInterrupted(lastTurnState(events), running),
        agentPreset: typeof header.agentPreset === 'string' ? header.agentPreset : null,
        parentId: typeof header.parentSession === 'string' ? header.parentSession : null,
        origin: header.origin === 'subagent' ? 'subagent' : null,
        createdAt: Number.isFinite(header.createdAt) ? header.createdAt : null,
        updatedAt: lastActivityAt > 0 ? lastActivityAt : null,
        lastActivityAt: lastActivityAt > 0 ? lastActivityAt : null,
        runCount: fold.turns.length,
        turns: fold.turns,
        jobs: fold.jobs,
        callIdToTurn: fold.callIdToTurn,
        jobsByTurn
      }
    } catch (error) {
      const code = error !== null && typeof error === 'object' ? error.code : undefined
      warnings.push({
        sessionId: candidate.sessionId,
        message: code === 'SESSION_QUERY_SESSION_NOT_FOUND'
          ? 'Session log is missing'
          : 'Session log could not be read'
      })
      return null
    }
  })

  const sessions = measured.filter((entry) => entry !== null)
  const truncatedSessions = members.length > selected.length || sessions.length < selected.length
  const dayStart = localDayStart(now)
  const stats = computeStats({ sessions, dayStart, truncatedSessions })
  const { runs, totalRuns, truncated: truncatedRuns } = buildRuns({
    sessions,
    maxRunsPerSession: MAX_RUNS_PER_SESSION,
    maxRuns: MAX_RUNS,
    maxJobsPerRun: MAX_JOBS_PER_RUN
  })
  // The session rows are a list surface; the full turn arrays stay internal.
  const sessionRows = sessions.map((session) => ({
    sessionId: session.sessionId,
    title: session.title,
    running: session.running,
    interrupted: session.interrupted,
    updatedAt: session.updatedAt,
    lastActivityAt: session.lastActivityAt,
    createdAt: session.createdAt,
    agentPreset: session.agentPreset,
    parentId: session.parentId,
    origin: session.origin,
    runCount: session.runCount
  }))
  const recentActivity = buildRecentActivity({ sessions, runs, limit: MAX_ACTIVITY })
  const lastActivityAt = sessions.reduce((latest, session) => (
    Number.isFinite(session.lastActivityAt) && session.lastActivityAt > latest ? session.lastActivityAt : latest
  ), 0)
  const activeWindowMs = windows.activeProjectDays * 24 * 60 * 60 * 1000
  const state = stats.runningSessions > 0 || (lastActivityAt > 0 && now - lastActivityAt <= activeWindowMs)
    ? 'active'
    : 'inactive'
  const runningSessions = allRunning.size
  return {
    workspaceId: workspace.id,
    focusSessionId: focusSessionId ?? null,
    project: {
      workspaceId: workspace.id,
      title: workspace.title,
      path: workspace.path,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      state,
      runningSessions,
      sessionCount: members.length,
      lastActivityAt: lastActivityAt > 0 ? lastActivityAt : null,
      activeWindowDays: windows.activeProjectDays,
      recentSessionMinutes: windows.recentSessionMinutes
    },
    stats: {
      runningSessions: stats.runningSessions,
      completedToday: stats.completedToday,
      totalRuns: stats.totalRuns,
      averageDurationMs: stats.averageDurationMs,
      measuredSessions: stats.measuredSessions,
      completedRuns: stats.completedRuns,
      truncated: stats.truncated
    },
    sessions: sessionRows,
    runs,
    recentActivity,
    warnings,
    limits: {
      sessions: MAX_SESSIONS,
      runsPerSession: MAX_RUNS_PER_SESSION,
      runs: MAX_RUNS,
      jobsPerRun: MAX_JOBS_PER_RUN,
      totalRunsMeasured: totalRuns,
      runsTruncated: truncatedRuns
    },
    generatedAt: now
  }
}

/**
 * `GET /api/power-suite.project` — one Workspace's project snapshot.
 * @param {object} ctx - Host context.
 * @param {Request} request - authenticated request.
 * @param {Map<string, { at: number, value: object }>} cache - snapshot cache owned by the install effect.
 * @returns {Promise<Response>} the snapshot or a typed failure.
 */
async function handleProject(ctx, request, cache) {
  const url = new URL(request.url)
  // Empty/whitespace parameters count as absent so `?workspaceId=&sessionId=x`
  // still resolves through the Session instead of failing the lookup.
  const rawWorkspaceId = url.searchParams.get('workspaceId')
  const rawSessionId = url.searchParams.get('sessionId')
  const workspaceId = rawWorkspaceId !== null && rawWorkspaceId.trim().length > 0 ? rawWorkspaceId.trim() : null
  const sessionId = rawSessionId !== null && rawSessionId.trim().length > 0 ? rawSessionId.trim() : null
  if (workspaceId === null && sessionId === null) {
    return sendJson(400, { code: 'bad-request', message: 'workspaceId or sessionId is required' })
  }
  const now = Date.now()
  try {
    const resolution = await resolveWorkspace(ctx, workspaceId, sessionId)
    if (resolution.error !== undefined) return sendJson(resolution.error, { code: resolution.code, message: resolution.message })
    const workspace = resolution.workspace
    const refresh = url.searchParams.get('refresh') === '1'
    const cacheKey = `${workspace.id}|${workspace.updatedAt}|${workspace.sessionIds.length}`
    const cached = cache.get(workspace.id)
    if (!refresh && cached !== undefined && cached.key === cacheKey && now - cached.at < CACHE_TTL_MS) {
      return sendJson(200, cached.value)
    }
    const records = await ctx.sessionQuery.listSessions()
    const windows = await readWindows()
    const snapshot = await collectProjectSnapshot(ctx, workspace, sessionId, records, windows, now)
    if (cache.size >= MAX_CACHE && !cache.has(workspace.id)) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(workspace.id, { at: now, key: cacheKey, value: snapshot })
    return sendJson(200, snapshot)
  } catch (error) {
    const code = error !== null && typeof error === 'object' ? error.code : undefined
    if (code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
      return sendJson(404, { code: 'session-not-found', message: 'Session not found' })
    }
    return sendJson(500, {
      code: 'project-unavailable',
      message: typeof error?.message === 'string' ? error.message : 'Project snapshot unavailable'
    })
  }
}

/**
 * Register the project route inside Connection's authentication fence.
 * @param {object} ctx - Host context.
 * @returns {void}
 */
export function installProjectView(ctx) {
  const cache = new Map()
  ctx.effect(() => ctx.connection.fetch.register({
    path: PROJECT_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handleProject(ctx, request, cache)
  }), `power-suite: project GET ${PROJECT_ROUTE}`)
}
