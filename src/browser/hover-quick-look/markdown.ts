/**
 * Safe Markdown rendering for the hover quick-look card.
 *
 * The card shows a deliberately small subset of Markdown (headings, code
 * fences with the shared highlighter, quotes, lists, tables, rules, links,
 * emphasis and images). The renderer builds DOM directly from text and never
 * trusts authored HTML; local image sources resolve through the caller's raw
 * artifacts URL builder.
 *
 * @module
 */

import { fenceLanguage, highlightTokens, languageForFile } from './highlight.ts'
import { quickLookBasename } from './model.ts'
import { quickLookDocument } from './dom.ts'
import type { QuickLookElement } from './dom.ts'
import type { QuickLookRenderContext } from './model.ts'

/**
 * Build one raw-artifact URL for a path the preview resolves itself.
 * @param path - absolute file path.
 * @param name - display file name.
 * @param disposition - inline rendering or download.
 * @returns the URL.
 */
export type QuickLookRawUrl = (path: string, name: string, disposition: 'inline' | 'attachment') => string

/**
 * Build one tokenized `<code>` element.
 * @param code - source text.
 * @param language - highlighter language id, empty for plain text.
 * @returns the code element.
 */
export function quickLookCodeElement(code: string, language: string): QuickLookElement {
  const document = quickLookDocument()
  const element = document.createElement('code')
  element.className = 'dsa-code'
  const tokens = highlightTokens(code, language)
  if (tokens === null) {
    element.textContent = code
    return element
  }
  for (const token of tokens) {
    if (token.kind === '') {
      element.appendChild(document.createTextNode(token.text))
    } else {
      const span = document.createElement('span')
      span.className = 'tok-' + token.kind
      span.textContent = token.text
      element.appendChild(span)
    }
  }
  return element
}

/**
 * Build one inline Markdown fragment into an element.
 * @param parent - target element.
 * @param text - inline source.
 * @param context - enclosing file descriptor.
 * @param rawUrl - raw-artifact URL builder for resolved images.
 * @returns void
 */
function appendMarkdownInline(
  parent: QuickLookElement,
  text: string,
  context: QuickLookRenderContext,
  rawUrl: QuickLookRawUrl
): void {
  const document = quickLookDocument()
  const pattern = /`[^`]*`|!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index > last) parent.appendChild(document.createTextNode(text.slice(last, index)))
    if (token.startsWith('`')) {
      const code = document.createElement('code')
      code.textContent = token.slice(1, -1)
      parent.appendChild(code)
    } else if (token.startsWith('![')) {
      const close = token.indexOf('](')
      const alt = token.slice(2, close)
      const src = token.slice(close + 2, -1).trim()
      const resolved = resolveMarkdownImage(src, context, rawUrl)
      if (resolved !== null) {
        const image = document.createElement('img')
        image.src = resolved
        image.alt = alt
        image.loading = 'lazy'
        parent.appendChild(image)
      } else {
        parent.appendChild(document.createTextNode(alt))
      }
    } else if (token.startsWith('[')) {
      const close = token.indexOf('](')
      const label = token.slice(1, close)
      const href = token.slice(close + 2, -1).trim()
      if (/^https?:\/\//i.test(href)) {
        const link = document.createElement('a')
        link.href = href
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.textContent = label
        parent.appendChild(link)
      } else {
        parent.appendChild(document.createTextNode(label))
      }
    } else if (token.startsWith('**') || token.startsWith('__')) {
      const strong = document.createElement('strong')
      strong.textContent = token.slice(2, -2)
      parent.appendChild(strong)
    } else if (token.startsWith('~~')) {
      const del = document.createElement('del')
      del.textContent = token.slice(2, -2)
      parent.appendChild(del)
    } else {
      const emphasis = document.createElement('em')
      emphasis.textContent = token.slice(1, -1)
      parent.appendChild(emphasis)
    }
    last = index + token.length
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)))
}

/**
 * Resolve one Markdown image source against the previewed file.
 * @param src - authored source.
 * @param context - enclosing file descriptor.
 * @param rawUrl - raw-artifact URL builder.
 * @returns a raw URL, or null when local resolution fails.
 */
function resolveMarkdownImage(
  src: string,
  context: QuickLookRenderContext,
  rawUrl: QuickLookRawUrl
): string | null {
  if (/^https?:\/\//i.test(src)) return src
  if (typeof context.path !== 'string') return null
  let decoded = src
  try {
    decoded = decodeURI(src)
  } catch {
    decoded = src
  }
  if (decoded.startsWith('/')) return rawUrl(decoded, quickLookBasename(decoded), 'inline')
  const directory = context.path.replace(/[\\/][^\\/]*$/, '')
  const parts = (directory + '/' + decoded).replace(/\\/g, '/').split('/')
  const normalized: string[] = []
  for (const part of parts) {
    if (part === '' && normalized.length === 0) {
      normalized.push('')
      continue
    }
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (normalized.length > 1) normalized.pop()
      continue
    }
    normalized.push(part)
  }
  const target = normalized.join('/')
  if (target === '') return null
  return rawUrl(target, quickLookBasename(target), 'inline')
}

/**
 * Render a small, safe Markdown subset into DOM.
 * @param text - Markdown source.
 * @param context - enclosing file descriptor.
 * @param rawUrl - raw-artifact URL builder for resolved images.
 * @returns the rendered block.
 */
export function renderQuickLookMarkdown(
  text: string,
  context: QuickLookRenderContext,
  rawUrl: QuickLookRawUrl
): QuickLookElement {
  const document = quickLookDocument()
  const root = document.createElement('div')
  root.className = 'dsa-md'
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  let index = 0
  const special = (line: string): boolean => /^(#{1,6}\s|```|>\s?|\s*(?:[-*+]|\d+[.)])\s+|\s*(?:-{3,}|\*{3,})\s*$)/.test(line)
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') {
      index += 1
      continue
    }
    const fence = line.match(/^```\s*([A-Za-z0-9_+#.-]*)\s*$/)
    if (fence !== null) {
      const language = fenceLanguage(fence[1], context.name)
      index += 1
      const code: string[] = []
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      const pre = document.createElement('pre')
      pre.appendChild(quickLookCodeElement(code.join('\n'), language))
      root.appendChild(pre)
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading !== null) {
      const element = document.createElement('h' + heading[1].length)
      appendMarkdownInline(element, heading[2].trim(), context, rawUrl)
      root.appendChild(element)
      index += 1
      continue
    }
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) {
      root.appendChild(document.createElement('hr'))
      index += 1
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const quote = document.createElement('blockquote')
      const paragraphs: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        paragraphs.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      appendMarkdownInline(quote, paragraphs.join(' ').trim(), context, rawUrl)
      root.appendChild(quote)
      continue
    }
    const listMatch = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/)
    if (listMatch !== null) {
      const ordered = /^\d/.test(listMatch[1])
      const list = document.createElement(ordered ? 'ol' : 'ul')
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/)
        if (item === null || /^\d/.test(item[1]) !== ordered) break
        const entry = document.createElement('li')
        appendMarkdownInline(entry, item[2].trim(), context, rawUrl)
        list.appendChild(entry)
        index += 1
      }
      root.appendChild(list)
      continue
    }
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[index + 1])) {
      const cellsOf = (row: string): string[] => row.trim().replace(/^\||\|$/g, '').split('|').map(function (cell: string): string {
        return cell.trim()
      })
      const table = document.createElement('table')
      const headRow = document.createElement('tr')
      for (const cell of cellsOf(line)) {
        const th = document.createElement('th')
        appendMarkdownInline(th, cell, context, rawUrl)
        headRow.appendChild(th)
      }
      const thead = document.createElement('thead')
      thead.appendChild(headRow)
      table.appendChild(thead)
      index += 2
      const tbody = document.createElement('tbody')
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        const row = document.createElement('tr')
        for (const cell of cellsOf(lines[index])) {
          const td = document.createElement('td')
          appendMarkdownInline(td, cell, context, rawUrl)
          row.appendChild(td)
        }
        tbody.appendChild(row)
        index += 1
      }
      table.appendChild(tbody)
      root.appendChild(table)
      continue
    }
    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() !== '' && !special(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    const element = document.createElement('p')
    appendMarkdownInline(element, paragraph.join(' '), context, rawUrl)
    root.appendChild(element)
  }
  return root
}
