/**
 * Clipboard helpers for artifact content.
 *
 * A LAN deployment is often a plain-HTTP origin, where the async Clipboard API
 * is missing; these paths fall back to the legacy selection/copy command. The
 * browser globals are read through a narrow structural facade so the Host
 * profile (no DOM lib) can type-check the module too.
 *
 * @module
 */

import { artifactContentKind, artifactUrl } from './urls.ts'
import type { SessionArtifact } from './urls.ts'

/** One selected range over the hidden image host. */
interface ClipboardRange {
  selectNodeContents(node: unknown): void
}

/** The current document selection. */
interface ClipboardSelection {
  removeAllRanges(): void
  addRange(range: ClipboardRange): void
}

/** A 2D canvas context: only the image draw is used. */
interface ClipboardCanvasContext {
  drawImage(image: unknown, dx: number, dy: number): void
}

/** An image bitmap decoded from a blob. */
interface ClipboardBitmap {
  readonly width: number
  readonly height: number
  close?(): void
}

/** One element created by the helpers. */
interface ClipboardElement {
  readonly style: { cssText: string, position: string, top: string, left: string, opacity: string }
  readonly complete?: boolean
  readonly naturalWidth?: number
  value?: string
  src?: string
  alt?: string
  onload?: (() => void) | null
  onerror?: (() => void) | null
  setAttribute(name: string, value: string): void
  appendChild(child: unknown): unknown
  focus(): void
  select?(): void
  remove(): void
}

/** A canvas element with the two members the PNG conversion uses. */
interface ClipboardCanvas extends ClipboardElement {
  width: number
  height: number
  getContext(contextId: '2d'): ClipboardCanvasContext | null
  toBlob(callback: (blob: Blob | null) => void, type?: string): void
}

/** The document slice the clipboard paths read. */
interface ClipboardDocument {
  readonly body: ClipboardElement
  createElement(tag: 'canvas'): ClipboardCanvas
  createElement(tag: 'img'): ClipboardElement
  createElement(tag: 'textarea'): ClipboardElement
  createElement(tag: string): ClipboardElement
  createRange(): ClipboardRange
  execCommand(command: string): boolean
}

/** The window slice the legacy image path reads. */
interface ClipboardWindow {
  getSelection(): ClipboardSelection | null
}

/** The navigator slice the async clipboard paths read. */
interface ClipboardNavigator {
  readonly clipboard?: {
    writeText(text: string): Promise<void>
    write(items: readonly unknown[]): Promise<void>
  }
}

/** The response subset `copyArtifactContent` reads. */
interface ClipboardResponse {
  readonly ok: boolean
  text(): Promise<string>
  blob(): Promise<Blob>
}

/** A fetch-shaped function with the init fields the helpers pass. */
type ClipboardFetch = (url: string, init: { credentials: string }) => Promise<ClipboardResponse>

/** Constructors and factories the helpers feature-detect. */
interface ClipboardGlobals {
  readonly document?: ClipboardDocument
  readonly window?: ClipboardWindow
  readonly navigator?: ClipboardNavigator
  readonly ClipboardItem?: new (items: Record<string, Blob>) => unknown
  readonly createImageBitmap?: (blob: Blob) => Promise<ClipboardBitmap>
  readonly fetch?: ClipboardFetch
}

/** Read the browser globals without touching them at module load. */
function clipboardGlobals(): ClipboardGlobals {
  return globalThis as unknown as ClipboardGlobals
}

/** The live document, when there is one. */
function clipboardDocument(): ClipboardDocument {
  const document = clipboardGlobals().document
  if (document === undefined) throw new Error('session artifacts: document unavailable')
  return document
}

/**
 * Copy through a temporary selected textarea.
 * @param text - text to copy.
 * @returns whether the browser accepted the copy command.
 */
function fallbackCopy(text: string): boolean {
  const document = clipboardDocument()
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1px'
  area.style.left = '-1px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select?.()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  area.remove()
  return copied
}

/**
 * Write text to the clipboard. Plain-HTTP pages have no async Clipboard API,
 * so the legacy selection path is the only fallback on a LAN deployment.
 * @param text - text to copy.
 * @returns whether the copy was issued.
 */
export function copyText(text: string): Promise<boolean> {
  const clipboard = clipboardGlobals().navigator?.clipboard
  if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
    return clipboard.writeText(text).then(
      () => true,
      () => fallbackCopy(text)
    )
  }
  return Promise.resolve(fallbackCopy(text))
}

/**
 * Convert an image blob to PNG so the clipboard can take it.
 * @param blob - source image bytes.
 * @returns PNG bytes, or null when conversion fails.
 */
async function imageBlobToPng(blob: Blob): Promise<Blob | null> {
  const createImageBitmap = clipboardGlobals().createImageBitmap
  if (createImageBitmap === undefined) return null
  try {
    const bitmap = await createImageBitmap(blob)
    const document = clipboardDocument()
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (context === null) return null
    context.drawImage(bitmap, 0, 0)
    bitmap.close?.()
    return await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((png) => resolve(png), 'image/png')
      } catch {
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

/**
 * Copy an image by selecting a hidden `<img>` and issuing the legacy copy
 * command. Works on insecure origins where the async clipboard is missing;
 * the clipboard receives HTML containing the image, so rich editors paste it
 * as an image while plain-text targets may only see the alt text.
 * @param url - inline image URL.
 * @param name - display name used as alt text.
 * @returns whether the copy command succeeded.
 */
async function copyImageViaSelection(url: string, name: string): Promise<boolean> {
  const document = clipboardDocument()
  const window = clipboardGlobals().window
  if (window === undefined) return false
  const host = document.createElement('div')
  host.setAttribute('contenteditable', 'true')
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;'
  const image = document.createElement('img')
  image.src = url
  image.alt = name
  host.appendChild(image)
  document.body.appendChild(host)
  try {
    await new Promise<void>((resolve) => {
      if (image.complete === true) resolve()
      else {
        image.onload = () => resolve()
        image.onerror = () => resolve()
      }
    })
    if (image.complete !== true || image.naturalWidth === 0) return false
    const range = document.createRange()
    range.selectNodeContents(host)
    const selection = window.getSelection()
    if (selection === null) return false
    selection.removeAllRanges()
    selection.addRange(range)
    host.focus()
    const copied = document.execCommand('copy')
    selection.removeAllRanges()
    return copied
  } finally {
    host.remove()
  }
}

/**
 * Copy one artifact's content to the clipboard: text verbatim, images as a
 * picture when the async clipboard and ClipboardItem exist, otherwise the
 * legacy HTML-image clipboard path, then the inline URL as a last resort.
 * @param artifact - row from the list response.
 * @param origin - Host LAN origin for the inline URL.
 * @returns whether something was copied.
 */
export async function copyArtifactContent(artifact: SessionArtifact, origin: string | null): Promise<boolean> {
  const kind = artifactContentKind(artifact)
  if (kind === 'none') return false
  const url = artifactUrl(artifact, 'inline', origin)
  let response: ClipboardResponse
  try {
    const fetch = clipboardGlobals().fetch
    if (fetch === undefined) return false
    response = await fetch(url, { credentials: 'same-origin' })
  } catch {
    return false
  }
  if (!response.ok) return false
  if (kind === 'text') {
    try {
      return await copyText(await response.text())
    } catch {
      return false
    }
  }
  try {
    const clipboard = clipboardGlobals().navigator?.clipboard
    const ClipboardItem = clipboardGlobals().ClipboardItem
    if (clipboard !== undefined && typeof ClipboardItem === 'function') {
      const imageBlob = await response.blob()
      const png = imageBlob.type === 'image/png' ? imageBlob : await imageBlobToPng(imageBlob)
      if (png !== null) {
        await clipboard.write([new ClipboardItem({ 'image/png': png })])
        return true
      }
    }
  } catch {
    // Fall through to the legacy/URL fallbacks.
  }
  // Plain-HTTP LAN pages have no async clipboard API. Selecting a hidden
  // image and running the legacy copy command still puts the image markup
  // on the clipboard, which rich editors paste as the picture itself.
  try {
    if (await copyImageViaSelection(url, artifact.name)) return true
  } catch {
    // Fall through to the URL fallback.
  }
  // Last resort: the inline URL is at least paste-able as text.
  return copyText(url)
}
