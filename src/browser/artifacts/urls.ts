/**
 * Session-artifact URLs and row classification.
 *
 * The Host serves a list of workspace files and user-provided attachments; a
 * row becomes three URLs (inline preview, download, LAN share link) and one
 * `dsh-resource://` address for the native right-Sidebar preview. Keeping the
 * URL grammar here means the panel and every copy/open action agree on it.
 *
 * The module reads the browser globals through a narrow structural facade:
 * the Host profile has no DOM lib, while the browser profile does.
 *
 * @module
 */

import { ROUTES, browserRoute } from '../../shared/routes.ts'

/** The reference fields a provided-attachment URL repeats. */
export interface AttachmentRef {
  /** Durable reference of a provided attachment. */
  attachmentId: string
  /** Display name. */
  name: string
  /** MIME type as the Host classified it, when reported. */
  mime?: string
  /** Media type the attachment store recorded, when reported. */
  mediaType?: string
  /** Exact byte length of a provided attachment. */
  bytes?: number
  width?: number
  height?: number
}

/** One artifact row the list route reports, normalized for the browser. */
export interface SessionArtifact extends AttachmentRef {
  /** Workspace path, empty for a provided attachment. */
  path: string
  /** Display name. */
  name: string
  /** Durable reference of a provided attachment, empty for a workspace file. */
  attachmentId: string
  /** True when the row is a user-provided attachment. */
  provided: boolean
  /** Human size in bytes, when known. */
  size?: number
  /** Exact byte length of a provided attachment. */
  bytes?: number
  width?: number
  height?: number
  /** Turn that produced the file. */
  turn?: number
  /** Prompt ordinal for a provided attachment. */
  promptOrdinal?: number
  /** Delivered with `present`. */
  presented: boolean
  /** Optional one-line description reported by the Host. */
  description?: string
  /** The Host no longer finds the file on disk. */
  missing?: boolean
}

/** The list response as the panel consumes it. */
export interface SessionArtifactList {
  artifacts: SessionArtifact[]
  origin: string | null
}

/** Right-Sidebar navigation slice the open action needs. */
export interface ArtifactSidebarRight {
  openResource(address: string): void
}

/** The document slice the URL builder reads. */
interface ArtifactsDocument {
  readonly baseURI: string
}

/** The window slice the fallback open needs. */
interface ArtifactsWindow {
  open(url: string, target: string, features: string): unknown
}

/** Read the live document without touching it at module load. */
function artifactsDocument(): ArtifactsDocument {
  const document = (globalThis as unknown as { document?: ArtifactsDocument }).document
  if (document === undefined) throw new Error('session artifacts: document unavailable')
  return document
}

/** Read the live window without touching it at module load. */
function artifactsWindow(): ArtifactsWindow {
  const window = (globalThis as unknown as { window?: ArtifactsWindow }).window
  if (window === undefined) throw new Error('session artifacts: window unavailable')
  return window
}

/**
 * Resolve one Host route against the application's base URL.
 * @param relative - route below the application root.
 * @returns the absolute URL.
 */
export function appUrl(relative: string): string {
  return new URL(relative, artifactsDocument().baseURI).href
}

/**
 * Build one raw-artifact URL, preferring the Host's LAN origin for links
 * shared with another device.
 * @param artifact - row from the list response.
 * @param disposition - inline rendering or download.
 * @param origin - absolute origin reported by the Host.
 * @returns the URL.
 */
export function rawUrl(artifact: SessionArtifact, disposition: 'inline' | 'attachment', origin: string | null): string {
  let base = appUrl(browserRoute(ROUTES.sessionArtifactsRaw))
  if (typeof origin === 'string' && origin.length > 0) {
    try {
      const lanBase = new URL(browserRoute(ROUTES.sessionArtifactsRaw), origin.endsWith('/') ? origin : `${origin}/`)
      base = lanBase.href
    } catch {
      base = appUrl(browserRoute(ROUTES.sessionArtifactsRaw))
    }
  }
  const url = new URL(base)
  url.searchParams.set('path', artifact.path)
  url.searchParams.set('name', artifact.name)
  url.searchParams.set('disposition', disposition)
  return url.href
}

/**
 * Build the `dsh-resource://file/…` address the right Sidebar's document
 * preview claims for a Session file. The grammar mirrors
 * `@deepseek-ai/dsh-util-workspace-path` (component encoding, `:` kept for
 * Windows drives) so this plugin needs no extra client dependency.
 * @param sessionId - authorizing Session.
 * @param path - absolute file path.
 * @returns the resource address.
 */
export function artifactFileAddress(sessionId: string, path: string): string {
  const encode = (segment: string): string => encodeURIComponent(segment).replace(/%3A/gi, ':')
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
  return `dsh-resource://file/session/${encode(sessionId)}/${normalized.split('/').map(encode).join('/')}`
}

/**
 * Build one user-provided attachment URL, preferring the Host's LAN origin
 * for links shared with another device.
 *
 * The query repeats the durable reference fields the Session log recorded
 * (never a host path); the Host's attachment store verifies the object
 * against them before serving any bytes.
 * @param artifact - provided row from the list response.
 * @param disposition - inline rendering or download.
 * @param origin - absolute origin reported by the Host.
 * @returns the URL.
 */
export function attachmentUrl(artifact: AttachmentRef, disposition: 'inline' | 'attachment', origin: string | null): string {
  let base = appUrl(browserRoute(ROUTES.sessionArtifactsAttachment))
  if (typeof origin === 'string' && origin.length > 0) {
    try {
      const lanBase = new URL(browserRoute(ROUTES.sessionArtifactsAttachment), origin.endsWith('/') ? origin : `${origin}/`)
      base = lanBase.href
    } catch {
      base = appUrl(browserRoute(ROUTES.sessionArtifactsAttachment))
    }
  }
  const url = new URL(base)
  url.searchParams.set('attachmentId', artifact.attachmentId)
  if (artifact.name.length > 0) url.searchParams.set('name', artifact.name)
  if (typeof artifact.mediaType === 'string' && artifact.mediaType.length > 0) {
    url.searchParams.set('mediaType', artifact.mediaType)
  }
  if (typeof artifact.bytes === 'number') url.searchParams.set('bytes', String(artifact.bytes))
  if (typeof artifact.width === 'number') url.searchParams.set('width', String(artifact.width))
  if (typeof artifact.height === 'number') url.searchParams.set('height', String(artifact.height))
  url.searchParams.set('disposition', disposition)
  return url.href
}

/**
 * Build the current source URL for one artifact row: workspace files use the
 * raw path route, user-provided attachments use the attachment route.
 * @param artifact - row from the list response.
 * @param disposition - inline rendering or download.
 * @param origin - absolute origin reported by the Host.
 * @returns the URL.
 */
export function artifactUrl(artifact: SessionArtifact, disposition: 'inline' | 'attachment', origin: string | null): string {
  return artifact.provided
    ? attachmentUrl(artifact, disposition, origin)
    : rawUrl(artifact, disposition, origin)
}

/**
 * Stable identity of one artifact row (a workspace path or an attachment id).
 * @param artifact - row from the list response.
 * @returns the row key.
 */
export function artifactKey(artifact: SessionArtifact): string {
  return artifact.provided ? artifact.attachmentId : artifact.path
}

/**
 * Whether one artifact row renders an image thumbnail.
 * @param artifact - row from the list response.
 * @returns true when the Host reports an image media type.
 */
export function isImageArtifact(artifact: SessionArtifact): boolean {
  return typeof artifact.mime === 'string' && artifact.mime.startsWith('image/')
}

/**
 * Classify one artifact for content copying: text can be copied verbatim,
 * images are copied as a picture when the browser allows it, anything else
 * has no meaningful clipboard representation.
 * @param artifact - row from the list response.
 * @returns the content kind.
 */
export function artifactContentKind(artifact: SessionArtifact): 'text' | 'image' | 'none' {
  const mime = typeof artifact.mime === 'string' ? artifact.mime : ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('text/')
    || /^(?:application\/(?:json|xml|javascript|typescript|rtf|x-yaml|x-sh|x-httpd-php))/.test(mime)
    || /\.(?:md|markdown|txt|log|csv|tsv|json|ya?ml|xml|js|mjs|cjs|ts|tsx|jsx|css|scss|sass|sh|bash|zsh|py|go|rs|java|rb|php|html?|sql|diff|patch|ini|toml|cfg|conf)$/i.test(artifact.name)) {
    return 'text'
  }
  return 'none'
}

/**
 * Open one artifact in the right Sidebar's native document preview
 * (workspace files + document preview), falling back to the raw route in a
 * browser tab when no preview type claims the address.
 * @param sidebarRight - right Sidebar navigation service.
 * @param sessionId - Session that owns the artifact rows.
 * @param artifact - row from the list response.
 * @param origin - Host LAN origin for the fallback URL.
 * @returns whether the native preview handled the open.
 */
export function openArtifactPreview(
  sidebarRight: ArtifactSidebarRight,
  sessionId: string,
  artifact: SessionArtifact,
  origin: string | null
): boolean {
  try {
    sidebarRight.openResource(artifactFileAddress(sessionId, artifact.path))
    return true
  } catch {
    artifactsWindow().open(rawUrl(artifact, 'inline', origin), '_blank', 'noopener,noreferrer')
    return false
  }
}

/**
 * Human byte size.
 * @param bytes - byte count.
 * @returns compact size text.
 */
export function formatBytes(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`
}
