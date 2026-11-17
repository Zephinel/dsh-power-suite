/**
 * Cached npm update check behind the suite's Host route.
 *
 * The browser cannot read the npm registry reliably and should not be asked to
 * trust a cross-origin answer, so the Host owns one read of this package's
 * `latest` dist-tag plus the reviewed release-notes document for that version.
 * Answers are cached per release-notes variant (default / English) and an
 * in-flight read is shared. Every failure becomes a silent `latest: null`
 * answer instead of an error: a missing update is not a problem to surface.
 */

import { readFileSync } from 'node:fs'
import { isNewerStableVersion, parseStableVersion } from './version.ts'
import { parseHighlights, releaseNotesUrl, releaseNotesVariant, repositorySlug } from './release-notes.ts'

/** Manifest of the running package; this module lives at `src/features/update-check/`. */
const DEFAULT_MANIFEST_URL = new URL('../../../package.json', import.meta.url)

/** Successful answers are reused for six hours. */
const SUCCESS_TTL_MS = 6 * 60 * 60_000

/** Failed answers are retried sooner so a transient network error clears quickly. */
const FAILURE_TTL_MS = 5 * 60_000

/** One registry or notes read must not keep a request waiting. */
const FETCH_TIMEOUT_MS = 5_000

/** Most highlights one answer carries; the parser itself is not capped. */
const MAX_HIGHLIGHTS = 6

/** One update-check answer rendered by the browser card. */
export interface UpdateCheckView {
  /** Running package version; `0.0.0` when unknown. */
  current: string
  /** Newest stable published version, or null when it could not be read. */
  latest: string | null
  /** Whether a newer stable version than the running one is published. */
  updateAvailable: boolean
  /** Reviewed release highlights for `latest`; empty when unavailable. */
  highlights: readonly string[]
}

/** Injectable dependencies and cache windows for the checker. */
export interface UpdateCheckerOptions {
  manifestUrl?: URL | string
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
  successTtlMs?: number
  failureTtlMs?: number
}

/**
 * Read the running package's manifest.
 * @param {URL | string} [manifestUrl] - manifest override for tests.
 * @returns {Record<string, any> | undefined} the parsed manifest, or undefined when it is
 *   unreadable.
 */
function readManifest(manifestUrl?: URL | string): Record<string, any> | undefined {
  const source = manifestUrl ?? DEFAULT_MANIFEST_URL
  try {
    const parsed = JSON.parse(readFileSync(source, 'utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Stable version of the running package.
 * @param {URL | string} [manifestUrl] - manifest override for tests.
 * @returns {string | undefined} the stable version, or undefined when the
 *   manifest is unreadable or names a prerelease/build version.
 */
export function installedVersion(manifestUrl?: URL | string): string | undefined {
  const version = readManifest(manifestUrl)?.version
  return typeof version === 'string' && parseStableVersion(version) !== undefined ? version : undefined
}

/**
 * GitHub slug used for the tag-pinned release-notes URL.
 * @param {URL | string} [manifestUrl] - manifest override for tests.
 * @returns {string | undefined} `owner/repo`, or undefined when the manifest
 *   has no usable GitHub repository.
 */
export function releaseNotesRepository(manifestUrl?: URL | string): string | undefined {
  return repositorySlug(readManifest(manifestUrl)?.repository)
}

/**
 * Registry endpoint for the running package's `latest` dist-tag.
 * @param {Record<string, any> | undefined} manifest - parsed running manifest.
 * @returns {string | undefined} the registry URL, or undefined when the
 *   manifest names no package.
 */
function registryLatestUrl(manifest?: Record<string, any>): string | undefined {
  const name = manifest?.name
  if (typeof name !== 'string' || name.trim() === '') return undefined
  return `https://registry.npmjs.org/${name.trim().replace(/\//gu, '%2F')}/latest`
}

/**
 * Fetch one URL that must answer successfully, under the per-read timeout.
 * @param {typeof fetch} fetchImpl - fetch implementation to use.
 * @param {number} timeoutMs - per-read timeout.
 * @param {string} url - address to read.
 * @param {string} accept - accepted content type.
 * @returns {Promise<Response>} the successful response.
 */
async function readResponse(fetchImpl, timeoutMs, url, accept) {
  const response = await fetchImpl(url, {
    headers: { accept },
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response
}

/**
 * Build one cached update check.
 *
 * The first read happens lazily on the first request; failures never reject the
 * call, they resolve to a `latest: null` view and are retried after the failure
 * TTL. A published update whose release notes are unreadable uses the same
 * failure TTL, because the notes may have been committed after the registry
 * read or the raw CDN may have failed.
 *
 * @param {object} [options] - injectable dependencies for tests.
 * @param {typeof fetch} [options.fetchImpl] - fetch implementation; defaults to
 *   `globalThis.fetch`.
 * @param {() => number} [options.now] - clock in epoch ms; defaults to `Date.now`.
 * @param {number} [options.timeoutMs] - per-read timeout; defaults to 5 s.
 * @param {number} [options.successTtlMs] - success cache life; defaults to 6 h.
 * @param {number} [options.failureTtlMs] - failure cache life; defaults to 5 min.
 * @param {URL | string} [options.manifestUrl] - manifest override for tests.
 * @returns {(language?: string | null) => Promise<UpdateCheckView>} the check; it
 *   never rejects.
 */
export function createUpdateChecker(options: UpdateCheckerOptions = {}): (language?: string | null) => Promise<UpdateCheckView> {
  const manifest = readManifest(options.manifestUrl)
  // `installedVersion`/`releaseNotesRepository` are the module's derivation
  // helpers (and the documented contract); use them here so the constructor
  // cannot drift from what the tests cover.
  const installed = installedVersion(options.manifestUrl)
  const current = installed ?? '0.0.0'
  const latestUrl = registryLatestUrl(manifest)
  const repository = releaseNotesRepository(options.manifestUrl)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS
  const successTtlMs = options.successTtlMs ?? SUCCESS_TTL_MS
  const failureTtlMs = options.failureTtlMs ?? FAILURE_TTL_MS
  const cached = new Map<'default' | 'en', { at: number; ttl: number; view: UpdateCheckView }>()
  const inflight = new Map<'default' | 'en', Promise<UpdateCheckView>>()

  /**
   * Read one release's highlights, capped for the card.
   * @param {string} latest - stable published version.
   * @param {'default' | 'en'} variant - notes variant to read.
   * @returns {Promise<string[]>} plain-text points; possibly empty.
   */
  const readHighlights = async (latest, variant) => {
    const response = await readResponse(fetchImpl, timeoutMs, releaseNotesUrl(repository, latest, variant), 'text/plain')
    return parseHighlights(await response.text()).slice(0, MAX_HIGHLIGHTS)
  }

  /**
   * Read the registry once and assemble the view for one variant.
   * @param {'default' | 'en'} variant - requested notes variant.
   * @returns {Promise<{ view: UpdateCheckView, notesRead: boolean }>} the view
   *   plus whether its highlights source was successfully read.
   */
  const read = async (variant) => {
    if (latestUrl === undefined) throw new Error('package name is unreadable')
    const response = await readResponse(fetchImpl, timeoutMs, latestUrl, 'application/json')
    const payload = /** @type {Record<string, any>} */ (await response.json())
    const published = payload?.version
    const latest = typeof published === 'string' && parseStableVersion(published) !== undefined ? published.trim() : null
    const updateAvailable = installed !== undefined && latest !== null && isNewerStableVersion(latest, installed)
    if (!updateAvailable) {
      // No notes are needed without an update (this also covers an unreadable
      // running version), so the answer is safe to reuse for the full TTL.
      return { view: { current, latest, updateAvailable: false, highlights: [] }, notesRead: true }
    }
    if (repository === undefined) {
      // The version is known but the package cannot address its own notes.
      return { view: { current, latest, updateAvailable: true, highlights: [] }, notesRead: false }
    }
    // An English client prefers `<version>.en.md` and falls back to the
    // reviewed default file, also when the English file has no Highlights.
    /** @type {Array<'en' | 'default'>} */
    const variants = variant === 'en' ? ['en', 'default'] : ['default']
    for (const candidate of variants) {
      try {
        const highlights = await readHighlights(latest, candidate)
        if (highlights.length > 0) {
          return { view: { current, latest, updateAvailable: true, highlights }, notesRead: true }
        }
      } catch {
        // Try the fallback variant; the update itself is still offered.
      }
    }
    return { view: { current, latest, updateAvailable: true, highlights: [] }, notesRead: false }
  }

  return async (language) => {
    const variant = releaseNotesVariant(language)
    const at = now()
    const hit = cached.get(variant)
    if (hit !== undefined && at - hit.at < hit.ttl) return hit.view
    const running = inflight.get(variant)
    if (running !== undefined) return running
    const pending = read(variant)
      .then(({ view, notesRead }) => {
        cached.set(variant, { at, ttl: view.updateAvailable && !notesRead ? failureTtlMs : successTtlMs, view })
        return view
      })
      .catch(() => {
        const view = { current, latest: null, updateAvailable: false, highlights: [] }
        cached.set(variant, { at, ttl: failureTtlMs, view })
        return view
      })
      .finally(() => {
        inflight.delete(variant)
      })
    inflight.set(variant, pending)
    return pending
  }
}
