/**
 * Host half of the suite's `workspace-presets` feature: per-Workspace default
 * agent presets.
 *
 * Two authenticated routes let the Workspace menu read and store one
 * Workspace's override; an `agent/created` listener applies that override to a
 * blank Session created in the Workspace. Applying there matters: the listener
 * runs before the Agent is published and before queued input is released, so
 * the first turn already runs under the Workspace preset instead of racing a
 * UI-side switch.
 *
 * The stored override never overrides an explicit choice: a Session composed
 * under a preset other than the deployment default (Creator mode, for example)
 * keeps it. A Workspace without an override follows the global default.
 */

import os from 'node:os'
import path from 'node:path'
import { createPresetStore, shouldApplyPreset } from './store.ts'

/** Route serving one Workspace's stored default preset. */
export const GET_ROUTE = '/api/workspace-presets.get'

/** Route storing or clearing one Workspace's default preset. */
export const SET_ROUTE = '/api/workspace-presets.set'

/** Request bodies here are one small JSON object; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024

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
 * Answer with JSON and a no-store policy: the stored value is live state.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 * @returns {Response} the response.
 */
function sendJson(status, payload) {
  return Response.json(payload, {
    status,
    headers: { 'cache-control': 'no-store' }
  })
}

/**
 * Read one small JSON object request body.
 * @param {Request} request - the buffered request.
 * @returns {Promise<{ ok: true, value: Record<string, any> } | { ok: false, status: number, code: string, message: string }>} the decoded object or a typed failure.
 */
async function readJsonObject(request) {
  const mediaType = String(request.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()
  if (mediaType !== 'application/json') {
    return { ok: false, status: 415, code: 'unsupported-media-type', message: 'content-type must be application/json' }
  }
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, code: 'too-large', message: 'request body is too large' }
  }
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, status: 400, code: 'bad-request', message: 'request body is not JSON' }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, status: 400, code: 'bad-request', message: 'request body must be one JSON object' }
  }
  return { ok: true, value }
}

/**
 * Check that a preset id names a currently usable Agent preset.
 * @param {Record<string, any>} ctx - Host context carrying the preset registry.
 * @param {string} preset - preset identity from the request.
 * @returns {Promise<{ ok: true } | { ok: false, status: number, code: string, message: string }>} the verdict.
 */
async function validatePreset(ctx, preset) {
  const presets = await ctx.agentPresets.list()
  const row = presets.find((entry) => entry.id === preset)
  if (row === undefined) {
    return { ok: false, status: 400, code: 'preset-not-found', message: `No agent preset named "${preset}"` }
  }
  if (row.broken !== undefined) {
    return { ok: false, status: 409, code: 'preset-unavailable', message: `Agent preset "${preset}" cannot compose a Session` }
  }
  return { ok: true }
}

/**
 * `GET /api/workspace-presets.get?workspaceId=<id>` — one Workspace override.
 * @param {Record<string, any>} ctx - Host context.
 * @param {Record<string, any>} store - preset store.
 * @param {Request} request - authenticated request.
 * @returns {Promise<Response>} the stored preset.
 */
async function handleGet(ctx, store, request) {
  const url = new URL(request.url)
  const workspaceId = url.searchParams.get('workspaceId')
  if (workspaceId === null || workspaceId.trim().length === 0) {
    return sendJson(400, { code: 'bad-request', message: 'workspaceId is required' })
  }
  if (ctx.workspaceRegistry.get(workspaceId) === undefined) {
    return sendJson(404, { code: 'workspace-not-found', message: 'Workspace not found' })
  }
  const preset = await store.get(workspaceId)
  return sendJson(200, { workspaceId, preset })
}

/**
 * `POST /api/workspace-presets.set` — store or clear one Workspace override.
 * @param {Record<string, any>} ctx - Host context.
 * @param {Record<string, any>} store - preset store.
 * @param {Request} request - authenticated request.
 * @returns {Promise<Response>} the stored value or a typed failure.
 */
async function handleSet(ctx, store, request) {
  const body = await readJsonObject(request)
  if (body.ok === false) {
    return sendJson(body.status, { code: body.code, message: body.message })
  }
  const { workspaceId, preset } = body.value
  if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
    return sendJson(400, { code: 'bad-request', message: 'workspaceId must be a non-empty string' })
  }
  if (preset !== null && (typeof preset !== 'string' || preset.length === 0)) {
    return sendJson(400, { code: 'bad-request', message: 'preset must be a non-empty string or null' })
  }
  if (ctx.workspaceRegistry.get(workspaceId) === undefined) {
    return sendJson(404, { code: 'workspace-not-found', message: 'Workspace not found' })
  }
  if (preset !== null) {
    const verdict = await validatePreset(ctx, preset)
    if (verdict.ok === false) {
      return sendJson(verdict.status, { code: verdict.code, message: verdict.message })
    }
  }
  const stored = await store.set(workspaceId, preset)
  return sendJson(200, { workspaceId, preset: stored })
}

/**
 * Apply one Workspace's default preset to a Session the Workspace's menu would
 * call a new conversation.
 * @param {Record<string, any>} ctx - Host context.
 * @param {Record<string, any>} store - preset store.
 * @param {Record<string, any>} agent - the Agent just announced by `agent/created`.
 * @returns {Promise<void>} resolves after the preset settles or the Session is left alone.
 */
async function applyWorkspaceDefault(ctx, store, agent) {
  const session = agent?.session
  if (session === undefined || session === null) return
  const header = session.header
  if (header.origin === 'subagent') return
  if (typeof header.delegationDepth === 'number' && header.delegationDepth > 0) return
  if (typeof header.cwd !== 'string' || header.cwd.length === 0) return
  if (ctx.agents.turnBoundaryOf(session).lastTurn !== 0) return
  const workspace = await ctx.workspaceRegistry.resolveByPath(header.cwd)
  if (workspace === undefined) return
  const target = await store.get(workspace.id)
  if (target === null) return
  const current = ctx.agentPresets.presetForSession(session)
  if (!shouldApplyPreset({ current, globalDefault: ctx.agentPresets.defaultId, target })) return
  await ctx.agentPresets.select(agent, target)
}

/**
 * Register both routes and the creation-time application.
 * @param {Record<string, any>} ctx - Host context.
 * @returns {void}
 */
export function installWorkspacePresets(ctx) {
  const store = createPresetStore(harnessHome())
  ctx.effect(() => ctx.connection.fetch.register({
    path: GET_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handleGet(ctx, store, request)
  }), `power-suite: workspace-presets GET ${GET_ROUTE}`)
  ctx.effect(() => ctx.connection.fetch.register({
    path: SET_ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handleSet(ctx, store, request)
  }), `power-suite: workspace-presets POST ${SET_ROUTE}`)
  ctx.on('agent/created', async ({ agent }) => {
    try {
      await applyWorkspaceDefault(ctx, store, agent)
    } catch {
      // A Workspace default is a convenience, never a precondition: a refused
      // selection leaves the new Session on the preset it already composed.
    }
  })
}
