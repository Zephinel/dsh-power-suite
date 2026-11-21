#!/usr/bin/env node
/**
 * Release-verification gate for the tagged commit.
 *
 * The release skill splits a release into two processes: the main agent
 * operates it, and an independent subagent verifies it. The commit that gets
 * tagged must record that verdict, bound to the exact content the reviewer
 * approved:
 *
 *   Release-Verification: APPROVE tree=<git tree sha> reviewer=<name, backend>
 *
 * `publish.yml` recomputes `HEAD^{tree}` and refuses a missing, duplicated or
 * mismatched trailer. The binding is the point: after approval the operator may
 * amend the commit message, but a tree change invalidates the approval and
 * needs a fresh verification round.
 *
 * Usage:
 *   node scripts/check-release-verification.mjs --verify
 *   node scripts/check-release-verification.mjs --verify --message "<text>"
 *   node scripts/check-release-verification.mjs --verify --message-file <path>
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TRAILER = /^Release-Verification:\s*(.+)$/gmu
const APPROVAL = /^APPROVE tree=([0-9a-f]{40}) reviewer=(.*)$/u

/**
 * Parse and validate one `Release-Verification:` trailer.
 * @param {string} message - full commit message.
 * @param {string|null} headTree - the tree the commit actually has, when known.
 * @returns {{ok: boolean, problems: string[], tree: string|null, reviewer: string|null}} result.
 */
export function parseReleaseVerification(message, headTree = null) {
  const lines = [...message.matchAll(TRAILER)].map((match) => match[1].trim())
  const problems = []
  if (lines.length === 0) problems.push('missing "Release-Verification:" trailer')
  if (lines.length > 1) problems.push(`expected exactly one "Release-Verification:" line, found ${lines.length}`)
  if (lines.length !== 1) return { ok: false, problems, tree: null, reviewer: null }

  const match = lines[0].match(APPROVAL)
  if (match === null) {
    problems.push('expected "Release-Verification: APPROVE tree=<40 hex> reviewer=<name>"')
    return { ok: false, problems, tree: null, reviewer: null }
  }
  const tree = match[1]
  const reviewer = match[2].trim()
  if (reviewer.length < 3) {
    problems.push('reviewer= must name the independent verifier (at least 3 characters)')
  } else if (reviewer.includes('<') || reviewer.includes('>')) {
    problems.push('reviewer= still contains the <...> placeholder; name the verifier that actually ran')
  }
  if (typeof headTree === 'string' && headTree.length > 0 && tree !== headTree) {
    problems.push(`the approval is bound to tree ${tree} but HEAD's tree is ${headTree}; re-verify after a tree change`)
  }
  return { ok: problems.length === 0, problems, tree, reviewer }
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
    throw new Error('not inside a Git checkout; run this inside the release checkout')
  }
}

/** The tree of HEAD, or null when not inside a checkout (tests pass one instead). */
function headTree() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

/** CLI entry; only runs when this file is executed, not when a test imports it. */
function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: node scripts/check-release-verification.mjs --verify [--message TEXT | --message-file PATH]')
    process.exit(0)
  }

  const messageIndex = args.findIndex((arg) => arg === '--message')
  const fileIndex = args.findIndex((arg) => arg === '--message-file')
  const messageFile = fileIndex === -1 ? null : args[fileIndex + 1]
  const inlineMessage = messageIndex === -1 ? null : args[messageIndex + 1]
  if ((messageIndex !== -1 && inlineMessage === undefined) || (fileIndex !== -1 && messageFile === undefined)) {
    console.error('release verification: --message and --message-file need a value')
    process.exit(2)
  }
  if (messageIndex !== -1 && fileIndex !== -1) {
    console.error('release verification: use --message or --message-file, not both')
    process.exit(2)
  }

  let message
  try {
    message = inlineMessage ?? commitMessage(messageFile)
  } catch (error) {
    console.error(`release verification: ${error.message}`)
    process.exit(2)
  }
  const tree = headTree()
  if (tree === null) {
    console.error('release verification: run this inside the release checkout; the approval is bound to its tree')
    process.exit(2)
  }
  const result = parseReleaseVerification(message, tree)
  if (!result.ok) {
    for (const problem of result.problems) console.error(`release verification: ${problem}`)
    process.exit(1)
  }
  console.log(`release verification ok (tree ${result.tree}, reviewer ${result.reviewer})`)
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
