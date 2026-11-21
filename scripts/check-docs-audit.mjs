#!/usr/bin/env node
/**
 * Documentation-audit gate for the release commit.
 *
 * `release-power-suite` step 6 requires a pre-tag audit of the as-built docs
 * (release state, counts, environment versions, prose, screenshots, changelog
 * completeness). A prose requirement is easy to skip silently, so the commit
 * that gets tagged must carry one trailer naming what was checked:
 *
 *   Docs-Audit: checked=release-state,counts,environment,prose,screenshots,changelog fixed=<what changed> waived=<none|owner:"...">
 *
 * `publish.yml` recomputes this from the tagged commit and refuses a missing,
 * duplicated or malformed trailer. The trailer is an attestation: it proves the
 * audit was recorded, not that every image was compared. The owner reviews the
 * audit result in the release commit; a waiver must quote the owner so it is
 * never anonymous.
 *
 * Usage:
 *   node scripts/check-docs-audit.mjs --verify            # check HEAD's commit body
 *   node scripts/check-docs-audit.mjs --verify --message "<text>"
 *   node scripts/check-docs-audit.mjs --verify --message-file <path>
 *   node scripts/check-docs-audit.mjs --scan              # host version vs docs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Claim classes the release audit must have covered. */
export const AUDIT_CLASSES = Object.freeze([
  'release-state',
  'counts',
  'environment',
  'prose',
  'screenshots',
  'changelog',
])

const TRAILER = /^Docs-Audit:\s*(.+)$/gmu

/**
 * Parse and validate one `Docs-Audit:` trailer.
 * @param {string} message - full commit message.
 * @returns {{ok: boolean, problems: string[], checked: string[], fixed: string|null, waived: string|null}} result.
 */
export function parseDocsAudit(message) {
  const lines = [...message.matchAll(TRAILER)].map((match) => match[1].trim())
  const problems = []
  if (lines.length === 0) problems.push('missing "Docs-Audit:" trailer')
  if (lines.length > 1) problems.push(`expected exactly one "Docs-Audit:" line, found ${lines.length}`)
  if (lines.length !== 1) return { ok: false, problems, checked: [], fixed: null, waived: null }

  const line = lines[0]
  const checkedMatch = line.match(/checked=([a-z,-]+)/u)
  if (checkedMatch === null) {
    problems.push('the trailer has no "checked=<classes>" list')
  }
  const checked = checkedMatch === null ? [] : checkedMatch[1].split(',').map((entry) => entry.trim()).filter(Boolean)
  for (const claim of checked) {
    if (!AUDIT_CLASSES.includes(claim)) problems.push(`unknown audit class "${claim}"`)
  }
  for (const required of AUDIT_CLASSES) {
    if (!checked.includes(required)) problems.push(`checked= is missing "${required}"`)
  }

  const fixedMatch = line.match(/\bfixed=(.*?)(?:\s+waived=|$)/u)
  const fixed = fixedMatch === null ? null : fixedMatch[1].trim()
  if (fixed === null || fixed.length === 0) problems.push('fixed= must describe what was fixed (use "none" when nothing was)')

  const waivedMatch = line.match(/\bwaived=(.+)$/u)
  const waived = waivedMatch === null ? null : waivedMatch[1].trim()
  if (waived === null || waived.length === 0) {
    problems.push('waived= must be "none" or quote the owner\'s approval')
  } else if (waived !== 'none') {
    const owner = waived.match(/^owner:"([^"]*)"$/u)
    if (owner === null || owner[1].trim().length === 0) {
      problems.push('a waiver must be waived=none or waived=owner:"<the owner\'s words>" with no trailing text')
    }
  }

  return { ok: problems.length === 0, problems, checked, fixed, waived }
}

/**
 * Keep only the sections a claim belongs to.
 * @param {string} text - Markdown source.
 * @param {{include?: RegExp, exclude?: RegExp, subExclude?: RegExp}} [filter] - heading filters.
 * @returns {string} the concatenated matching sections (the preamble is dropped when `include` is set).
 */
export function sliceSections(text, filter = {}) {
  const subExclude = filter.subExclude ?? /evidence|recorded|history|measured acceptance|dated/iu
  return text
    .split(/^(?=## )/mu)
    .filter((block) => {
      const heading = block.match(/^## (.+)$/mu)?.[1]?.trim() ?? ''
      if (filter.include !== undefined && !filter.include.test(heading)) return false
      if (filter.exclude !== undefined && filter.exclude.test(heading)) return false
      return true
    })
    .map((block) => block
      .split(/^(?=### )/mu)
      .filter((sub) => {
        const heading = sub.match(/^### (.+)$/mu)?.[1]?.trim() ?? ''
        return !subExclude.test(heading)
      })
      .join('\n'))
    .join('\n')
}

/** Read a repo-relative file, or null when it does not exist. */
function readOrNull(relative) {
  try {
    return readFileSync(resolve(root, relative), 'utf8')
  } catch {
    return null
  }
}

/** Host version from `dsh --version`, or null when dsh is not installed. */
function hostVersion() {
  try {
    return execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const DSH_HOST = /\*\*DSH ([0-9][0-9A-Za-z.-]*)\*\*/gu
const DSH_LIVE = /\bDSH ([0-9][0-9A-Za-z.-]*)/gu
const LAYOUT_CLAIM = /dsh-client-ui-layout@([0-9][0-9A-Za-z.-]*)/gu

/** Files, patterns and section scope the environment scan reads. */
export const HOST_FILES = Object.freeze([
  { file: 'README.md', pattern: DSH_HOST },
  { file: 'README.zh.md', pattern: DSH_HOST },
  { file: 'docs/architecture.md', pattern: LAYOUT_CLAIM, exclude: /evidence|verification|history/iu },
  { file: 'docs/sidebar-width.md', pattern: LAYOUT_CLAIM, exclude: /verification|measured acceptance/iu },
  { file: 'docs/limitations.md', pattern: LAYOUT_CLAIM, include: /^Sidebar width$/iu },
  { file: 'docs/verification.md', pattern: DSH_LIVE, include: /^Automated$/iu },
])

/**
 * Compare the version claims that must track the running host.
 * @param {string|null} dshVersion - `dsh --version` output, or null when absent.
 * @param {ReadonlyArray<{file: string, pattern: RegExp, include?: RegExp, exclude?: RegExp}>} files - scan targets.
 * @param {(file: string) => string|null} [read] - file reader (tests inject one).
 * @returns {{ok: boolean, problems: string[], claims: number}} result.
 */
export function scanHostClaims(dshVersion, files, read = readOrNull) {
  if (typeof dshVersion !== 'string' || dshVersion.length === 0) {
    return { ok: false, problems: ['`dsh` is not on PATH; the environment class cannot be checked'], claims: 0 }
  }
  const problems = []
  let claims = 0
  for (const target of files) {
    const text = read(target.file)
    if (text === null) {
      problems.push(`${target.file}: promised by the audit but missing`)
      continue
    }
    const scoped = sliceSections(text, {
      include: target.include,
      exclude: target.exclude,
      subExclude: target.subExclude,
    })
    let targetClaims = 0
    for (const match of scoped.matchAll(target.pattern)) {
      targetClaims += 1
      claims += 1
      if (match[1] !== dshVersion) {
        problems.push(`${target.file}: claims ${match[0]} but the running host is ${dshVersion}`)
      }
    }
    if (targetClaims === 0) {
      problems.push(`${target.file}: the scoped section carries no host-version claim`)
    }
  }
  return { ok: problems.length === 0, problems, claims }
}

/** Read the commit message to verify. */
function commitMessage(path) {
  if (path !== null) {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      throw new Error(`cannot read --message-file ${path}`)
    }
  }
  try {
    return execFileSync('git', ['log', '-1', '--format=%B'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    throw new Error('not inside a Git checkout; pass --message or --message-file')
  }
}

/** CLI entry; only runs when this file is executed, not when a test imports it. */
function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: node scripts/check-docs-audit.mjs [--verify [--message TEXT | --message-file PATH] | --scan]')
    process.exit(0)
  }

  if (args.includes('--scan')) {
    const result = scanHostClaims(hostVersion(), HOST_FILES)
    if (!result.ok) {
      for (const problem of result.problems) console.error(`docs audit: ${problem}`)
      process.exit(1)
    }
    console.log(`${result.claims} host-version claim(s) match dsh ${hostVersion()}`)
    console.log('docs audit: host claims ok')
    process.exit(0)
  }

  const messageIndex = args.findIndex((arg) => arg === '--message')
  const fileIndex = args.findIndex((arg) => arg === '--message-file')
  const messageFile = fileIndex === -1 ? null : args[fileIndex + 1]
  const inlineMessage = messageIndex === -1 ? null : args[messageIndex + 1]
  if ((messageIndex !== -1 && inlineMessage === undefined) || (fileIndex !== -1 && messageFile === undefined)) {
    console.error('docs audit: --message and --message-file need a value')
    process.exit(2)
  }
  if (messageIndex !== -1 && fileIndex !== -1) {
    console.error('docs audit: use --message or --message-file, not both')
    process.exit(2)
  }

  let message
  try {
    message = inlineMessage ?? commitMessage(messageFile)
  } catch (error) {
    console.error(`docs audit: ${error.message}`)
    process.exit(2)
  }
  const result = parseDocsAudit(message)
  if (!result.ok) {
    for (const problem of result.problems) console.error(`docs audit: ${problem}`)
    process.exit(1)
  }
  console.log(`docs audit ok (checked: ${result.checked.join(', ')}; waived: ${result.waived})`)
}

const direct = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (direct) main()
