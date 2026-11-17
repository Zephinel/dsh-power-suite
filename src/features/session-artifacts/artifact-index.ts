/**
 * Session artifacts: the pure fold that turns one Session log into the list of
 * files the Session created or delivered, plus the MIME and HTTP-header rules
 * the raw-file route shares with its callers.
 *
 * The definition of "artifact" mirrors the Host's own deliverables bookkeeping:
 * a file is produced by a successful `write`, `edit`, or mutating
 * `str_replace_editor` call, and delivered by a `deliverables/presented` event.
 * Shell commands that write files are not tracked here — a Session reports them
 * to this list by delivering them with `present`, exactly as the chat's
 * delivery cards behave.
 */

import path from 'node:path'

/** Authenticated exact route serving the artifact list for one Session. */
export const LIST_ROUTE = '/api/session-artifacts.list'

/** Authenticated exact route serving one artifact's bytes. */
export const RAW_ROUTE = '/api/session-artifacts.raw'

/** Authenticated exact route serving one user-provided attachment's bytes. */
export const ATTACHMENT_ROUTE = '/api/session-artifacts.attachment'

/** Authenticated exact route serving one artifact's hover-preview descriptor. */
export const PREVIEW_ROUTE = '/api/session-artifacts.preview'

/** Tool names whose successful calls produce a file. */
const MUTATING_TOOLS = new Set(['write', 'edit', 'str_replace_editor'])

/**
 * Narrow parsed JSON to a plain object.
 * @param {unknown} value - decoded value.
 * @returns {value is Record<string, any>} whether it is a record.
 */
function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A non-blank path preserves the exact spelling supplied to the tool.
 * @param {unknown} value - recorded argument.
 * @returns {string | null} the path text, if any.
 */
function pathValue(value: any) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/**
 * Read the target path out of one tool call's raw JSON arguments.
 *
 * Mirrors the deliverables derivation: only a complete mutating call counts, so
 * a malformed or read-only call contributes nothing.
 * @param {string} name - tool name.
 * @param {unknown} argsRaw - raw JSON argument text.
 * @returns {string | null} the path argument, when the call mutates a file.
 */
export function mutationPath(name: any, argsRaw: any) {
  if (typeof argsRaw !== 'string') return null
  let args
  try {
    args = JSON.parse(argsRaw)
  } catch {
    return null
  }
  if (!isRecord(args)) return null
  switch (name) {
    case 'write':
      return typeof args.content === 'string' ? pathValue(args.file_path) : null
    case 'edit':
      return typeof args.old_string === 'string' &&
        args.old_string.length > 0 &&
        typeof args.new_string === 'string' &&
        args.old_string !== args.new_string &&
        (args.replace_all === undefined || typeof args.replace_all === 'boolean')
        ? pathValue(args.file_path)
        : null
    case 'str_replace_editor': {
      const target = pathValue(args.path)
      if (target === null) return null
      switch (args.command) {
        case 'create':
          return typeof args.file_text === 'string' ? target : null
        case 'str_replace':
          return typeof args.old_str === 'string' &&
            args.old_str.length > 0 &&
            (args.new_str === undefined || typeof args.new_str === 'string')
            ? target
            : null
        case 'insert':
          return typeof args.insert_line === 'number' &&
            Number.isInteger(args.insert_line) &&
            args.insert_line >= 0 &&
            typeof args.new_str === 'string'
            ? target
            : null
        default:
          return null
      }
    }
    default:
      return null
  }
}

/**
 * Resolve one recorded artifact path to the absolute path the Host reads.
 * @param {unknown} recordPath - path recorded by the tool or delivery event.
 * @param {string | undefined} cwd - the Session's workspace root.
 * @returns {string | null} the normalized absolute path, or null when unresolvable.
 */
export function resolveArtifactPath(recordPath: any, cwd: any) {
  const value = pathValue(recordPath)
  if (value === null) return null
  if (path.isAbsolute(value)) return path.normalize(value)
  if (typeof cwd === 'string' && path.isAbsolute(cwd)) return path.resolve(cwd, value)
  return null
}

/**
 * Resolve a settled mutation from recorded metadata, retaining legacy argument
 * paths. The result metadata wins when it names an absolute target.
 * @param {string} argumentPath - path from the tool call arguments.
 * @param {unknown} meta - the tool result's recorded metadata.
 * @param {string | undefined} cwd - the Session's workspace root.
 * @returns {string | null} the normalized absolute path.
 */
function mutationResultPath(argumentPath: any, meta: any, cwd: any) {
  if (isRecord(meta) && Object.hasOwn(meta, 'path')) {
    const recorded = resolveArtifactPath(meta.path, cwd)
    if (recorded !== null) return recorded
  }
  return resolveArtifactPath(argumentPath, cwd)
}

/**
 * Validate one delivered file declaration.
 * @param {unknown} value - decoded `files` member.
 * @returns {value is { path: string, description?: string }} whether it is usable.
 */
function isPresentedFile(value: any) {
  if (!isRecord(value)) return false
  const { path: declaredPath, description } = value
  return (
    typeof declaredPath === 'string' &&
    declaredPath.trim().length > 0 &&
    (description === undefined || typeof description === 'string')
  )
}

/**
 * Validate one `deliverables/presented` payload.
 * @param {unknown} value - decoded event data.
 * @returns {value is { turn: number, files: unknown[] }} whether it is usable.
 */
function isPresentedData(value: any) {
  if (!isRecord(value)) return false
  const { turn, files } = value
  return (
    typeof turn === 'number' &&
    Number.isSafeInteger(turn) &&
    turn >= 1 &&
    Array.isArray(files)
  )
}

/**
 * Create or update one artifact entry, keeping the strongest facts recorded
 * for its path.
 * @param {Map<string, Record<string, any>>} artifacts - path-keyed entries.
 * @param {string} artifactPath - normalized absolute path.
 * @param {Record<string, any>} fact - what this event proved.
 * @returns {void}
 */
function upsertArtifact(artifacts: any, artifactPath: any, fact: any) {
  const entry = artifacts.get(artifactPath)
  if (entry === undefined) {
    artifacts.set(artifactPath, {
      path: artifactPath,
      name: path.basename(artifactPath),
      description: fact.description,
      presented: fact.presented === true,
      generated: fact.generated === true,
      tool: fact.tool,
      turn: fact.turn,
      seq: fact.seq
    })
    return
  }
  if (fact.presented === true) {
    entry.presented = true
    if (typeof fact.description === 'string' && fact.description.length > 0) {
      entry.description = fact.description
    }
  }
  if (fact.generated === true) entry.generated = true
  if (fact.tool !== undefined && entry.tool === undefined) entry.tool = fact.tool
  if (fact.turn > entry.turn) entry.turn = fact.turn
  if (fact.seq > entry.seq) entry.seq = fact.seq
}

/**
 * Sort artifact rows newest event first, with the file name as a stable tie-break.
 * @param {Array<Record<string, any>>} artifacts - rows carrying numeric `seq` and a `name`.
 * @returns {Array<Record<string, any>>} the same array, sorted in place.
 */
export function sortArtifactsNewestFirst(artifacts: any) {
  return artifacts.sort((left: any, right: any) => {
    if (right.seq !== left.seq) return right.seq - left.seq
    return left.name.localeCompare(right.name)
  })
}

/**
 * Keep a recorded number only when it can describe an attachment.
 * @param {unknown} value - recorded metadata.
 * @returns {number | undefined} a finite non-negative number, or undefined.
 */
function attachmentNumber(value: any) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/**
 * Display name for one provided attachment, with a media-type-based fallback.
 * @param {unknown} name - recorded display name.
 * @param {unknown} mediaType - recorded media type.
 * @returns {string} a non-empty display name.
 */
function attachmentName(name: any, mediaType: any) {
  if (typeof name === 'string' && name.trim().length > 0) return name
  if (typeof mediaType === 'string' && mediaType.startsWith('image/')) {
    const extension = mediaType === 'image/jpeg' ? 'jpg' : mediaType.slice('image/'.length)
    return `image.${extension}`
  }
  return 'file'
}

/**
 * Fold the user-provided attachments of one Session log.
 *
 * Only `user/message` events whose source kind is `user` count: injected
 * user-role context (instructions, runtime context, skill catalogs) is logged as
 * user messages too, and `agent/inbox/spliced` duplicates every human message,
 * so either would double count. Each human message gets a 1-based ordinal for
 * the panel's "prompt N" label. Identical attachment ids collapse onto their
 * most recent occurrence, so re-pasting the same image moves it to the top
 * instead of listing it twice.
 * @param {readonly Record<string, any>[]} events - raw session events in ascending seq order.
 * @returns {Array<Record<string, any>>} provided rows, newest event first.
 */
export function foldUserAttachments(events: any) {
  const provided = new Map()
  let promptOrdinal = 0
  for (const event of events) {
    if (!isRecord(event) || event.type !== 'user/message') continue
    const data = event.data
    if (!isRecord(data)) continue
    const source = data.source
    if (!isRecord(source) || source.kind !== 'user') continue
    promptOrdinal += 1
    const content = data.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!isRecord(block)) continue
      const attachment = block.attachment
      if (!isRecord(attachment)) continue
      if (block.type !== 'image' && block.type !== 'file') continue
      if (typeof attachment.attachmentId !== 'string' || attachment.attachmentId.length === 0) continue
      const mediaType = block.type === 'image' && typeof attachment.mediaType === 'string'
        ? attachment.mediaType
        : undefined
      provided.set(attachment.attachmentId, {
        provided: true,
        attachmentId: attachment.attachmentId,
        name: attachmentName(attachment.name, mediaType),
        mediaType,
        width: attachmentNumber(attachment.width),
        height: attachmentNumber(attachment.height),
        bytes: attachmentNumber(attachment.bytes),
        promptOrdinal,
        seq: typeof event.seq === 'number' ? event.seq : 0
      })
    }
  }
  return sortArtifactsNewestFirst([...provided.values()])
}

/**
 * Fold one Session's raw event log into its artifact list.
 *
 * Events arrive in ascending seq order. Call records are matched to their
 * results by call id; a successful result publishes one produced file. Delivery
 * declarations merge into the same path-keyed entry, so a file that was both
 * written and delivered appears once, carrying its delivery description.
 * @param {readonly Record<string, any>[]} events - raw session events.
 * @param {string | undefined} cwd - the Session's workspace root for relative paths.
 * @returns {Array<Record<string, any>>} artifacts, newest turn first.
 */
export function foldArtifacts(events: any, cwd: any) {
  const calls = new Map()
  const artifacts = new Map()
  for (const event of events) {
    if (!isRecord(event)) continue
    if (event.type === 'tool/call') {
      const data = event.data
      if (!isRecord(data) || typeof data.name !== 'string') continue
      if (!MUTATING_TOOLS.has(data.name)) continue
      const argumentPath = mutationPath(data.name, data.arguments)
      if (argumentPath === null) continue
      calls.set(String(data.callId), {
        name: data.name,
        argumentPath,
        turn: typeof data.turn === 'number' ? data.turn : 0
      })
      continue
    }
    if (event.type === 'tool/result') {
      const data = event.data
      if (!isRecord(data) || !isRecord(data.message)) continue
      if (data.message.isError === true) continue
      const source = data.message.source
      if (!isRecord(source)) continue
      const call = calls.get(String(source.callId))
      if (call === undefined) continue
      const artifactPath = mutationResultPath(call.argumentPath, data.meta, cwd)
      if (artifactPath === null) continue
      upsertArtifact(artifacts, artifactPath, {
        generated: true,
        tool: call.name,
        turn: call.turn,
        seq: typeof event.seq === 'number' ? event.seq : 0
      })
      continue
    }
    if (event.type === 'deliverables/presented') {
      const data = event.data
      if (!isPresentedData(data)) continue
      for (const file of data.files) {
        if (!isPresentedFile(file)) continue
        const artifactPath = resolveArtifactPath(file.path, cwd)
        if (artifactPath === null) continue
        upsertArtifact(artifacts, artifactPath, {
          presented: true,
          description: typeof file.description === 'string' ? file.description : undefined,
          turn: data.turn,
          seq: typeof event.seq === 'number' ? event.seq : 0
        })
      }
    }
  }
  return sortArtifactsNewestFirst([...artifacts.values()])
}

/**
 * Media type by artifact extension.
 * @param {string} name - file name.
 * @returns {{ mime: string, previewable: boolean }} the response type and whether
 * the browser renders it inline rather than downloading it.
 */
export function artifactKind(name: any) {
  const extension = path.extname(name).slice(1).toLowerCase()
  switch (extension) {
    case 'html':
    case 'htm':
      return { mime: 'text/html; charset=utf-8', previewable: true }
    case 'svg':
      return { mime: 'image/svg+xml', previewable: true }
    case 'md':
    case 'markdown':
      return { mime: 'text/markdown; charset=utf-8', previewable: true }
    case 'txt':
    case 'log':
    case 'text':
    case 'csv':
    case 'tsv':
    case 'json':
    case 'yaml':
    case 'yml':
    case 'xml':
    case 'js':
    case 'mjs':
    case 'ts':
    case 'tsx':
    case 'jsx':
    case 'css':
    case 'sh':
    case 'py':
      return { mime: 'text/plain; charset=utf-8', previewable: true }
    case 'pdf':
      return { mime: 'application/pdf', previewable: true }
    case 'png':
      return { mime: 'image/png', previewable: true }
    case 'jpg':
    case 'jpeg':
      return { mime: 'image/jpeg', previewable: true }
    case 'gif':
      return { mime: 'image/gif', previewable: true }
    case 'webp':
      return { mime: 'image/webp', previewable: true }
    case 'avif':
      return { mime: 'image/avif', previewable: true }
    case 'bmp':
      return { mime: 'image/bmp', previewable: true }
    case 'ico':
      return { mime: 'image/x-icon', previewable: true }
    case 'mp4':
      return { mime: 'video/mp4', previewable: true }
    case 'webm':
      return { mime: 'video/webm', previewable: true }
    case 'mov':
      return { mime: 'video/quicktime', previewable: true }
    case 'mp3':
      return { mime: 'audio/mpeg', previewable: true }
    case 'wav':
      return { mime: 'audio/wav', previewable: true }
    case 'm4a':
      return { mime: 'audio/mp4', previewable: true }
    case 'ogg':
      return { mime: 'audio/ogg', previewable: true }
    case 'doc':
      return { mime: 'application/msword', previewable: false }
    case 'docx':
      return {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        previewable: false
      }
    case 'xls':
      return { mime: 'application/vnd.ms-excel', previewable: false }
    case 'xlsx':
      return {
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        previewable: false
      }
    case 'ppt':
      return { mime: 'application/vnd.ms-powerpoint', previewable: false }
    case 'pptx':
      return {
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        previewable: false
      }
    case 'zip':
      return { mime: 'application/zip', previewable: false }
    default:
      return { mime: 'application/octet-stream', previewable: false }
  }
}

/**
 * Which preview surface a hover card should use for one artifact.
 * @param {string} name - file name.
 * @returns {'text' | 'image' | 'media' | 'pdf' | 'html' | 'binary'} the preview kind.
 */
export function previewKindOf(name: any) {
  const kind = artifactKind(name)
  if (!kind.previewable) return 'binary'
  const mime = kind.mime
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'media'
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'text/html; charset=utf-8') return 'html'
  if (mime.startsWith('text/')) return 'text'
  return 'binary'
}

/**
 * Build the `Content-Disposition` value for one artifact.
 *
 * The ASCII fallback keeps every header parseable; the RFC 5987 `filename*`
 * member preserves non-ASCII names on browsers that support it.
 * @param {'inline' | 'attachment'} type - disposition kind.
 * @param {string} name - suggested file name.
 * @returns {string} the header value.
 */
export function contentDisposition(type: any, name: any) {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_') || 'artifact'
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

/**
 * Content-Security-Policy for a raw artifact response.
 *
 * Artifacts are untrusted output served from the application origin. Match the
 * Host's native `/api/file` policy: every response is sandboxed with no external
 * loads or scripts, so a directly opened HTML/SVG artifact cannot execute on the
 * application origin. `<img>` consumers ignore the policy for their own loads.
 * @returns {string} the CSP value.
 */
export function artifactContentSecurityPolicy() {
  return "sandbox; default-src 'none'"
}
