/**
 * Release-notes format and parsing for the Host update check.
 *
 * One Markdown pair per release lives in `release-notes/`: `<version>.md` (the
 * default notes) and an optional `<version>.en.md`. Both are committed before
 * the `v<version>` tag, so the tag-pinned raw URL the Host reads is immutable
 * and human-reviewed. Only the bullets under `## Highlights` reach the update
 * card; the rest of the document stays for the full release page.
 */

/** Heading that starts the card's bullet list. */
const HIGHLIGHTS_HEADING = /^##\s+highlights\s*$/iu

/** A bullet line with its marker; continuation lines are not part of a point. */
const BULLET = /^(?:[-*+]|\d+[.)])\s+(.+)$/u

/** Any Markdown heading closes the Highlights section. */
const HEADING = /^#{1,6}\s+/u

/**
 * Reduce one line of inline Markdown to the plain text the card shows.
 * @param {string} line - one bullet's text after its marker.
 * @returns {string} the plain-text point, collapsed to single spaces.
 */
function plainText(line: string) {
  return line
    .replace(/\[\s*([^\]]*)\s*\]\([^)]*\)/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/\*\*([^*]+)\*\*/gu, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/gu, '$1$2')
    .replace(/<[^>]*>/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * Extract the `## Highlights` bullets from one release-notes document.
 * @param {unknown} markdown - the `release-notes/<version>.md` content.
 * @returns {string[]} plain-text points in document order; empty without a
 *   Highlights section. Not capped: the update check keeps at most six.
 */
export function parseHighlights(markdown: unknown): string[] {
  const points: string[] = []
  if (typeof markdown !== 'string') return points
  const lines = markdown.split(/\r?\n/u)
  const start = lines.findIndex((line) => HIGHLIGHTS_HEADING.test(line.trim()))
  if (start === -1) return points
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim()
    if (HEADING.test(trimmed)) break
    const match = BULLET.exec(trimmed)
    if (match === null) continue
    const text = plainText(match[1] ?? '')
    if (text !== '') points.push(text)
  }
  return points
}

/**
 * Normalize a client locale id into the notes variant this project ships.
 * @param {unknown} language - active DSH locale id, such as `en`, `en-US`, or `zh`.
 * @returns {'default' | 'en'} `en` for English locales, otherwise `default`.
 */
export function releaseNotesVariant(language: string | null) {
  return typeof language === 'string' && language.trim().toLowerCase().startsWith('en') ? 'en' : 'default'
}

/**
 * Tag-pinned raw URL of one release's notes document.
 * @param {string} repository - `owner/repo` on GitHub.
 * @param {string} version - stable release version, without the `v` prefix.
 * @param {'default' | 'en'} [variant] - notes variant to read.
 * @returns {string} the raw URL for that release's notes.
 */
export function releaseNotesUrl(repository: string, version: string, variant: 'default' | 'en' = 'default') {
  const suffix = variant === 'en' ? '.en' : ''
  return `https://raw.githubusercontent.com/${repository}/v${version}/release-notes/${version}${suffix}.md`
}

/**
 * Normalize the package.json `repository` field into a GitHub slug.
 * @param {unknown} repository - the raw field: a string or an object with `url`.
 * @returns {string | undefined} `owner/repo`, or undefined for a non-GitHub or
 *   malformed repository.
 */
export function repositorySlug(repository: unknown): string | undefined {
  const url = typeof repository === 'string'
    ? repository
    : repository !== null && typeof repository === 'object' && 'url' in repository && typeof repository.url === 'string'
      ? repository.url
      : undefined
  if (url === undefined) return undefined
  const cleaned = url.trim().replace(/[?#].*$/u, '').replace(/\/+$/u, '').replace(/\.git$/u, '')
  const match = /github\.com[/:]([^/\s]+)\/([^/\s/]+)$/u.exec(cleaned)
  if (match === null) return undefined
  return `${match[1]}/${match[2]}`
}
