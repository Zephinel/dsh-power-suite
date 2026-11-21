#!/usr/bin/env node
/**
 * Documentation-audit gate for the release commit.
 *
 * `release-power-suite` step 6 requires a pre-tag audit of the as-built docs
 * (release state, counts, environment versions, prose, screenshots). A prose
 * requirement is easy to skip silently, so the commit that gets tagged must
 * carry one trailer naming what was checked:
 *
 *   Docs-Audit: checked=release-state,counts,environment,prose,screenshots fixed=<what changed> waived=<none|owner:"...">
 *
 * `publish.yml` recomputes this from the tagged commit and refuses a missing,
 * duplicated or malformed trailer. `waived=none` is the normal case; a waiver
 * must quote the owner's approval, so an agent cannot waive on its own.
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
export const AUDIT_CLASSES = Object.freeze(['release-state', 'counts', 'environment', 'prose', 'screenshots'])

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
    const owner = waived.match(/^owner:"(.+)"$/u)
    if (owner === null || owner[1].trim().length === 0) {
      problems.push('a waiver must be waived=none or waived=owner:"<the owner\'s words>"')
    }
  }

  return { ok: problems.length === 0, problems, checked, fixed, waived }
}

/** Read the commit message to verify. */
function commitMessage(path) {
  if (path !== null) return readFileSync(path, 'utf8')
  return execFileSync('git', ['log', '-1', '--format=%B'], { cwd: root, encoding: 'utf8' })
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

/**
 * Compare the version claims that must track the running host.
 * @returns {{ok: boolean, problems: string[], notes: string[]}} result.
 */
export function scanHostClaims(dshVersion, files) {
  const problems = []
  const notes = []
  if (typeof dshVersion !== 'string' || dshVersion.length === 0) {
    return { ok: true, problems, notes: ['skipped the environment scan: `dsh` is not on PATH'] }
  }
  let claims = 0
  for (const [file, pattern] of files) {
    const text = readOrNull(file)
    if (text === null) {
      problems.push(`${file}: promised by the audit but missing`)
      continue
    }
    for (const match of text.matchAll(pattern)) {
      claims += 1
      if (match[1] !== dshVersion) {
        problems.push(`${file}:${text.slice(0, match.index).split('\n').length}: claims ${match[0]} but the running host is ${dshVersion}`)
      }
    }
  }
  if (claims === 0) problems.push('no host-version claim was found in the audited files')
  else notes.push(`${claims} host-version claim(s) match dsh ${dshVersion}`)
  return { ok: problems.length === 0, problems, notes }
}

const HOST_CLAIM = /\*\*DSH ([0-9][0-9A-Za-z.-]*)\*\*/gu
const LAYOUT_CLAIM = /dsh-client-ui-layout@([0-9][0-9A-Za-z.-]*)/gu

/** Files and patterns the environment scan reads. */
const HOST_FILES = [
  ['README.md', HOST_CLAIM],
  ['README.zh.md', HOST_CLAIM],
  ['docs/architecture.md', LAYOUT_CLAIM],
  ['docs/sidebar-width.md', LAYOUT_CLAIM],
  ['docs/limitations.md', LAYOUT_CLAIM],
]

/** CLI entry; only runs when this file is executed, not when a test imports it. */
function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: node scripts/check-docs-audit.mjs [--verify [--message TEXT | --message-file PATH] | --scan]')
    process.exit(0)
  }

  if (args.includes('--scan')) {
    const result = scanHostClaims(hostVersion(), HOST_FILES)
    for (const note of result.notes) console.log(note)
    if (!result.ok) {
      for (const problem of result.problems) console.error(`docs audit: ${problem}`)
      process.exit(1)
    }
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

  const message = inlineMessage ?? commitMessage(messageFile)
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
