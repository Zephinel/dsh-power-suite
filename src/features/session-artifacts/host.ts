/**
 * Host half of the suite's `session-artifacts` feature.
 *
 * Three authenticated exact Fetch routes, mounted on Connection's shared API
 * channel so the browser reaches them with the same cookie every other route
 * uses:
 *
 * - `GET /api/session-artifacts.list?sessionId=<id>` folds that Session's raw
 *   log into the files it created or delivered plus the attachments the user
 *   provided, with current size and existence.
 * - `GET|HEAD /api/session-artifacts.raw?path=<absolute path>&disposition=inline|attachment&name=<filename>`
 *   serves one workspace artifact's bytes. This is the LAN-reachable URL behind
 *   the panel's Open, Download, and Copy-link actions.
 * - `GET|HEAD /api/session-artifacts.attachment?attachmentId=<id>&bytes=<n>&mediaType=<mime>&width=<n>&height=<n>&name=<filename>&disposition=inline|attachment`
 *   serves one user-provided attachment's verified bytes through the durable
 *   attachment store. The image parameters (`mediaType`, `bytes`, `width`,
 *   `height`) let the store verify the object against the exact reference the
 *   Session log recorded.
 *
 * Requests only admit the owner Peer (Connection's fence), so neither route
 * adds authority beyond the Session APIs the same browser can already call.
 */

import { Buffer } from 'node:buffer'
import path from 'node:path'
import {
  ATTACHMENT_ROUTE,
  LIST_ROUTE,
  PREVIEW_ROUTE,
  RAW_ROUTE,
  artifactContentSecurityPolicy,
  artifactKind,
  contentDisposition,
  foldArtifacts,
  foldUserAttachments,
  previewKindOf,
  sortArtifactsNewestFirst
} from './artifact-index.ts'

/** The suite entry supplies the services this feature registers against. */

/** Largest artifact this route buffers into one response. */
const MAX_RAW_BYTES = 64 * 1024 * 1024

/** Largest text window a hover preview reads. */
const PREVIEW_TEXT_BYTES = 16 * 1024

/** Image media types served through the attachment store's verified read. */
const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * The attachment capability, when this composition provides it.
 *
 * The suite stays loadable in a composition without durable attachments:
 * provided rows are then omitted instead of breaking the entry's dependencies.
 * @param {Record<string, any>} ctx - Host context.
 * @returns {Record<string, any> | null} the attachment service, or null.
 */
function attachmentCapability(ctx) {
  try {
    return ctx.get('attachments') ?? null
  } catch {
    return null
  }
}

/**
 * Read one non-negative integer query parameter.
 * @param {URL} url - request URL.
 * @param {string} parameter - query parameter name.
 * @param {number} minimum - smallest accepted value.
 * @returns {number | null} the parsed value, or null when absent or malformed.
 */
function queryInteger(url, parameter, minimum) {
  const raw = url.searchParams.get(parameter)
  if (raw === null || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= minimum ? value : null
}

/**
 * Media type implied by an object's magic bytes.
 *
 * The attachment store verifies image bytes against the recorded reference, so
 * this only decides the response type of a generic file whose name may not
 * describe its actual content.
 * @param {Uint8Array} bytes - object bytes.
 * @returns {string | null} the detected media type, if recognized.
 */
function sniffMediaType(bytes) {
  if (bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }
  if (bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp'
  }
  if (bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return 'application/pdf'
  }
  return null
}

/**
 * Map one attachment-store failure to a typed route response.
 * @param {Request} request - the request, for abort detection.
 * @param {unknown} error - the caught failure.
 * @returns {Response} the response.
 */
function attachmentFailure(request, error) {
  if (request.signal.aborted) return sendJson(499, { code: 'aborted', message: 'request aborted' })
  const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined
  if (code === 'INVALID_ATTACHMENT_REF') {
    return sendJson(400, { code: 'bad-request', message: 'Invalid attachment reference' })
  }
  if (code === 'ATTACHMENT_NOT_FOUND' || code === 'ATTACHMENT_CORRUPT') {
    return sendJson(404, { code: 'not-found', message: 'Attachment not available' })
  }
  return sendJson(500, { code: 'attachment-unavailable', message: 'Attachment unavailable' })
}

/**
 * Read one verbatim stored file through the attachment store's verified stream.
 * @param {Record<string, any>} attachments - attachment service.
 * @param {Record<string, any>} ref - durable file reference.
 * @param {AbortSignal} signal - request cancellation.
 * @returns {Promise<Uint8Array>} the verified bytes.
 */
async function readAttachmentFile(attachments, ref, signal) {
  const chunks = []
  let total = 0
  for await (const chunk of attachments.readFileStream(ref, signal)) {
    total += chunk.byteLength
    if (total > MAX_RAW_BYTES) {
      const error = new Error('Attachment exceeds the response limit') as Error & { code: string }
      error.code = 'FS_TOO_LARGE'
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, total)
}

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
 * Build one user-provided attachment row with its current size and existence.
 * @param {Record<string, any>} ctx - Host context carrying the filesystem.
 * @param {Record<string, any>} attachments - attachment service.
 * @param {Record<string, any>} artifact - provided entry from the session log fold.
 * @param {AbortSignal} signal - request cancellation.
 * @returns {Promise<Record<string, any>>} the row.
 */
async function collectProvidedArtifact(ctx, attachments, artifact, signal) {
  const image = typeof artifact.mediaType === 'string' && artifact.mediaType.startsWith('image/')
  const kind = artifactKind(artifact.name)
  const row = {
    ...artifact,
    mime: image ? artifact.mediaType : kind.mime,
    previewable: image ? true : kind.previewable,
    size: typeof artifact.bytes === 'number' ? artifact.bytes : undefined,
    missing: false
  }
  // The store locates the object; the session log only records the durable
  // reference, so a path that cannot be derived makes the row unavailable.
  let hostPath
  try {
    hostPath = image ? attachments.imageHostPath(artifact) : attachments.fileHostPath(artifact)
  } catch {
    row.missing = true
    return row
  }
  if (typeof hostPath !== 'string') return row
  try {
    const target = await ctx.fs.resolve(hostPath, { signal })
    const info = await ctx.fs.stat(target, signal)
    if (info === undefined || info.type !== 'file') row.missing = true
    else if (typeof info.size === 'number') row.size = info.size
  } catch {
    row.missing = true
  }
  return row
}

/**
 * Fold one Session log into the artifact list this Host can currently serve.
 * @param {Record<string, any>} ctx - Host context carrying the filesystem.
 * @param {Record<string, any>} snapshot - the Session log snapshot to fold.
 * @param {AbortSignal} signal - request cancellation.
 * @returns {Promise<Array<Record<string, any>>>} artifact rows with live file metadata.
 */
async function collectArtifacts(ctx, snapshot, signal) {
  const attachments = attachmentCapability(ctx)
  const artifacts = [
    ...foldArtifacts(snapshot.events, snapshot.session.cwd),
    ...foldUserAttachments(snapshot.events)
  ]
  sortArtifactsNewestFirst(artifacts)
  const rows = []
  for (const artifact of artifacts) {
    signal.throwIfAborted()
    if (artifact.provided === true) {
      // A composition without a durable attachment store cannot serve these
      // bytes, so those rows are omitted rather than shown broken.
      if (attachments === null) continue
      rows.push(await collectProvidedArtifact(ctx, attachments, artifact, signal))
      continue
    }
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
 * @param {Record<string, any>} ctx - Host context.
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
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined
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
 * @param {Record<string, any>} ctx - Host context.
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
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined
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
 * `GET|HEAD /api/session-artifacts.attachment` — one provided attachment's
 * verified bytes.
 *
 * The Session log records the durable reference; the query repeats its fields
 * (never a host path) so the attachment store can verify the object before any
 * byte leaves the Host. Images go through the store's verified image read and
 * report the stored media type; generic files stream through the verified file
 * read, with their type sniffed from the bytes when the name does not say it.
 * @param {Record<string, any>} ctx - Host context.
 * @param {Request} request - authenticated request.
 * @returns {Promise<Response>} the file response or a typed failure.
 */
async function handleAttachment(ctx, request) {
  const url = new URL(request.url)
  const attachmentId = url.searchParams.get('attachmentId')
  if (attachmentId === null || attachmentId.trim().length === 0) {
    return sendJson(400, { code: 'bad-request', message: 'attachmentId is required' })
  }
  const attachments = attachmentCapability(ctx)
  if (attachments === null) {
    return sendJson(503, { code: 'attachments-unavailable', message: 'Attachments are not available' })
  }
  const disposition = url.searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline'
  const recordedName = url.searchParams.get('name')
  const mediaType = url.searchParams.get('mediaType')
  const image = mediaType !== null && IMAGE_MEDIA_TYPES.has(mediaType)
  const displayName = typeof recordedName === 'string' && recordedName.length > 0
    ? path.basename(recordedName)
    : image ? 'image' : 'attachment'
  let bytes
  let mime
  if (image) {
    const recordedBytes = queryInteger(url, 'bytes', 1)
    const width = queryInteger(url, 'width', 1)
    const height = queryInteger(url, 'height', 1)
    if (recordedBytes === null || width === null || height === null) {
      return sendJson(400, { code: 'bad-request', message: 'Image attachment metadata is required' })
    }
    let stored
    try {
      stored = await attachments.readImage({
        attachmentId,
        mediaType,
        bytes: recordedBytes,
        width,
        height,
        ...(typeof recordedName === 'string' && recordedName.length > 0 ? { name: recordedName } : {})
      }, request.signal)
    } catch (error) {
      return attachmentFailure(request, error)
    }
    bytes = stored.data
    mime = stored.ref.mediaType
  } else {
    const recordedBytes = queryInteger(url, 'bytes', 0)
    if (recordedBytes === null) {
      return sendJson(400, { code: 'bad-request', message: 'Attachment size is required' })
    }
    try {
      bytes = await readAttachmentFile(attachments, {
        attachmentId,
        name: displayName,
        bytes: recordedBytes
      }, request.signal)
    } catch (error) {
      if (request.signal.aborted) return sendJson(499, { code: 'aborted', message: 'request aborted' })
      const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined
      if (code === 'FS_TOO_LARGE') {
        return sendJson(413, {
          code: 'too-large',
          message: `Attachment exceeds ${MAX_RAW_BYTES} bytes`
        })
      }
      return attachmentFailure(request, error)
    }
    mime = sniffMediaType(bytes) ?? artifactKind(displayName).mime
  }
  const headers = {
    'content-type': mime,
    'content-disposition': contentDisposition(disposition, displayName),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': artifactContentSecurityPolicy()
  }
  headers['content-length'] = String(bytes.byteLength)
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
  return new Response(bytes, { status: 200, headers })
}

/**
 * `GET /api/session-artifacts.preview` — one bounded hover-preview descriptor.
 * @param {Record<string, any>} ctx - Host context.
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
 * @param {Record<string, any>} ctx - Host context.
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
    path: ATTACHMENT_ROUTE,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: (request) => handleAttachment(ctx, request)
  }), `power-suite: session-artifacts GET ${ATTACHMENT_ROUTE}`)
  ctx.effect(() => ctx.connection.fetch.register({
    path: PREVIEW_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handlePreview(ctx, request)
  }), `power-suite: session-artifacts GET ${PREVIEW_ROUTE}`)
}
