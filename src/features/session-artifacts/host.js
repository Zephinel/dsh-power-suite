/**
 * Host half of the suite's `session-artifacts` feature.
 *
 * Two authenticated exact Fetch routes, mounted on Connection's shared API
 * channel so the browser reaches them with the same cookie every other route
 * uses:
 *
 * - `GET /api/session-artifacts.list?sessionId=<id>` folds that Session's raw
 *   log into the files it created or delivered, with current size and
 *   existence.
 * - `GET|HEAD /api/session-artifacts.raw?path=<absolute path>&disposition=inline|attachment&name=<filename>`
 *   serves one artifact's bytes. This is the LAN-reachable URL behind the
 *   panel's Open, Download, and Copy-link actions.
 *
 * Requests only admit the owner Peer (Connection's fence), so neither route
 * adds authority beyond the Session APIs the same browser can already call.
 */

import path from 'node:path'
import {
  LIST_ROUTE,
  PREVIEW_ROUTE,
  RAW_ROUTE,
  artifactContentSecurityPolicy,
  artifactKind,
  contentDisposition,
  foldArtifacts,
  previewKindOf
} from './artifact-index.js'

/** The suite entry supplies the services this feature registers against. */

/** Largest artifact this route buffers into one response. */
const MAX_RAW_BYTES = 64 * 1024 * 1024

/** Largest text window a hover preview reads. */
const PREVIEW_TEXT_BYTES = 16 * 1024

/**
 * Answer with JSON and a no-store policy: both routes report live facts.
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
 * Fold one Session log into the artifact list this Host can currently serve.
 * @param {object} ctx - Host context carrying the filesystem.
 * @param {object} snapshot - the Session log snapshot to fold.
 * @param {AbortSignal} signal - request cancellation.
 * @returns {Promise<object[]>} artifact rows with live file metadata.
 */
async function collectArtifacts(ctx, snapshot, signal) {
  const artifacts = foldArtifacts(snapshot.events, snapshot.session.cwd)
  const rows = []
  for (const artifact of artifacts) {
    signal.throwIfAborted()
    const kind = artifactKind(artifact.name)
    let size
    let missing = false
    try {
      const target = await ctx.fs.resolve(artifact.path, { signal })
      const info = await ctx.fs.stat(target, signal)
      if (info === undefined || info.type !== 'file') missing = true
      else size = info.size
    } catch {
      missing = true
    }
    rows.push({
      ...artifact,
      mime: kind.mime,
      previewable: kind.previewable,
      size,
      missing
    })
  }
  return rows
}

/**
 * `GET /api/session-artifacts.list` — the current Session's artifact entries.
 * @param {object} ctx - Host context.
 * @param {Request} request - authenticated request.
 * @returns {Promise<Response>} JSON list or a typed failure.
 */
async function handleList(ctx, request) {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get('sessionId')
  if (sessionId === null || sessionId.trim().length === 0) {
    return sendJson(400, { code: 'bad-request', message: 'sessionId is required' })
  }
  let origin = null
  try {
    origin = ctx.webServer.getOrigin()
  } catch {
    origin = null
  }
  let artifacts
  let workspaceRoot = null
  try {
    const snapshot = await ctx.sessionQuery.readSession(sessionId)
    workspaceRoot = snapshot.session.cwd ?? null
    artifacts = await collectArtifacts(ctx, snapshot, request.signal)
  } catch (error) {
    if (request.signal.aborted) return sendJson(499, { code: 'aborted', message: 'request aborted' })
    const code = error !== null && typeof error === 'object' ? error.code : undefined
    if (code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
      return sendJson(404, { code: 'session-not-found', message: 'Session not found' })
    }
    return sendJson(500, {
      code: 'list-failed',
      message: typeof error?.message === 'string' ? error.message : 'Session artifacts unavailable'
    })
  }
  return sendJson(200, { sessionId, origin, workspaceRoot, artifacts })
}

/**
 * `GET|HEAD /api/session-artifacts.raw` — one artifact's bytes.
 * @param {object} ctx - Host context.
 * @param {Request} request - authenticated request.
 * @returns {Promise<Response>} the file response or a typed failure.
 */
async function handleRaw(ctx, request) {
  const url = new URL(request.url)
  const rawPath = url.searchParams.get('path')
  if (rawPath === null || rawPath.trim().length === 0) {
    return sendJson(400, { code: 'bad-request', message: 'path is required' })
  }
  if (!path.isAbsolute(rawPath)) {
    return sendJson(400, { code: 'bad-request', message: 'path must be absolute' })
  }
  const disposition = url.searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline'
  const requestedName = url.searchParams.get('name')
  const name = typeof requestedName === 'string' && requestedName.length > 0
    ? path.basename(requestedName)
    : path.basename(rawPath)
  let target
  let info
  try {
    target = await ctx.fs.resolve(rawPath, { signal: request.signal })
    info = await ctx.fs.stat(target, request.signal)
  } catch {
    if (request.signal.aborted) return sendJson(499, { code: 'aborted', message: 'request aborted' })
    return sendJson(404, { code: 'not-found', message: 'Artifact not available' })
  }
  if (info === undefined) {
    return sendJson(404, { code: 'not-found', message: 'Artifact not available' })
  }
  if (info.type !== 'file') {
    return sendJson(400, { code: 'bad-request', message: 'Artifact is not a regular file' })
  }
  // The URL parameter is a display/download name only. The media type must come
  // from the actual path so a caller cannot turn a text file into executable
  // HTML/SVG by renaming it.
  const kind = artifactKind(path.basename(rawPath))
  const headers = {
    'content-type': kind.mime,
    'content-disposition': contentDisposition(disposition, name),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': artifactContentSecurityPolicy()
  }
  if (request.method === 'HEAD') {
    if (typeof info.size === 'number') headers['content-length'] = String(info.size)
    return new Response(null, { status: 200, headers })
  }
  let bytes
  try {
    bytes = await ctx.fs.readBytes(target, request.signal, MAX_RAW_BYTES)
  } catch (error) {
    if (request.signal.aborted) return sendJson(499, { code: 'aborted', message: 'request aborted' })
    const code = error !== null && typeof error === 'object' ? error.code : undefined
    if (code === 'FS_TOO_LARGE') {
      return sendJson(413, {
        code: 'too-large',
        message: `Artifact exceeds ${MAX_RAW_BYTES} bytes`
      })
    }
    return sendJson(404, { code: 'not-found', message: 'Artifact not available' })
  }
  headers['content-length'] = String(bytes.byteLength)
  return new Response(bytes, { status: 200, headers })
}

/**
 * `GET /api/session-artifacts.preview` — one bounded hover-preview descriptor.
 * @param {object} ctx - Host context.
 * @param {Request} request - authenticated request.
 * @returns {Promise<Response>} JSON descriptor or a typed failure.
 */
async function handlePreview(ctx, request) {
  const url = new URL(request.url)
  const rawPath = url.searchParams.get('path')
  if (rawPath === null || rawPath.trim().length === 0) {
    return sendJson(400, { code: 'bad-request', message: 'path is required' })
  }
  if (!path.isAbsolute(rawPath)) {
    return sendJson(400, { code: 'bad-request', message: 'path must be absolute' })
  }
  const requestedName = url.searchParams.get('name')
  const name = typeof requestedName === 'string' && requestedName.length > 0
    ? path.basename(requestedName)
    : path.basename(rawPath)
  let target
  let info
  try {
    target = await ctx.fs.resolve(rawPath, { signal: request.signal })
    info = await ctx.fs.stat(target, request.signal)
  } catch {
    if (request.signal.aborted) return sendJson(499, { code: 'aborted', message: 'request aborted' })
    return sendJson(404, { code: 'not-found', message: 'Artifact not available' })
  }
  if (info === undefined) {
    return sendJson(404, { code: 'not-found', message: 'Artifact not available' })
  }
  if (info.type !== 'file') {
    return sendJson(400, { code: 'bad-request', message: 'Artifact is not a regular file' })
  }
  const actualName = path.basename(rawPath)
  const kind = artifactKind(actualName)
  const previewKind = previewKindOf(actualName)
  const descriptor = {
    path: rawPath,
    name,
    mime: kind.mime,
    size: typeof info.size === 'number' ? info.size : null,
    previewable: kind.previewable,
    kind: previewKind
  }
  if (previewKind !== 'text') return sendJson(200, descriptor)
  let bytes
  try {
    bytes = await ctx.fs.readByteRange(target, { offset: 0, length: PREVIEW_TEXT_BYTES }, request.signal)
  } catch (error) {
    if (request.signal.aborted) return sendJson(499, { code: 'aborted', message: 'request aborted' })
    return sendJson(500, {
      code: 'preview-failed',
      message: typeof error?.message === 'string' ? error.message : 'Preview unavailable'
    })
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (text.includes('\u0000')) return sendJson(200, { ...descriptor, kind: 'binary' })
  return sendJson(200, {
    ...descriptor,
    text,
    truncated: typeof info.size === 'number' && info.size > bytes.byteLength
  })
}

/**
 * Register the feature's routes inside Connection's authentication and trust fence.
 * @param {object} ctx - Host context.
 * @returns {void}
 */
export function installSessionArtifacts(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: LIST_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handleList(ctx, request)
  }), `power-suite: session-artifacts GET ${LIST_ROUTE}`)
  ctx.effect(() => ctx.connection.fetch.register({
    path: RAW_ROUTE,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: (request) => handleRaw(ctx, request)
  }), `power-suite: session-artifacts GET ${RAW_ROUTE}`)
  ctx.effect(() => ctx.connection.fetch.register({
    path: PREVIEW_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handlePreview(ctx, request)
  }), `power-suite: session-artifacts GET ${PREVIEW_ROUTE}`)
}
