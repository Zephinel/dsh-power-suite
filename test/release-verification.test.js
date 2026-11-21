/**
 * Unit tests for the release-verification trailer.
 *
 * The trailer binds an independent verifier's APPROVE to the exact tree that
 * gets tagged; publish.yml recomputes the tree and refuses a missing,
 * duplicated or mismatched approval. These cases pin the grammar and the
 * binding.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseReleaseVerification } from '../scripts/check-release-verification.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(root, 'scripts/check-release-verification.mjs')
const headTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const TREE = '0123456789abcdef0123456789abcdef01234567'
const message = (trailer) => `release: v0.2.3\n\n${trailer}\n`
const trailer = (tree = TREE, reviewer = 'release-verifier, deepseek-flash') =>
  `Release-Verification: APPROVE tree=${tree} reviewer=${reviewer}`

test('accepts an approval bound to the current tree', () => {
  const result = parseReleaseVerification(message(trailer()), TREE)
  assert.equal(result.ok, true, result.problems.join('; '))
  assert.equal(result.tree, TREE)
  assert.equal(result.reviewer, 'release-verifier, deepseek-flash')
})

test('unit parsing does not bind; the CLI is what binds the approval', () => {
  // The exported parser is also used to read a verifier-supplied line before the
  // amend; the CLI always supplies HEAD's tree and refuses an unbound record.
  const unbound = parseReleaseVerification(message(trailer()))
  assert.equal(unbound.ok, true)
  assert.equal(unbound.tree, TREE)
  assert.equal(unbound.reviewer, 'release-verifier, deepseek-flash')
})

test('refuses a missing or duplicated trailer', () => {
  const missing = parseReleaseVerification('release: v0.2.3\n\nno verification\n', TREE)
  assert.equal(missing.ok, false)
  assert.ok(missing.problems.some((problem) => problem.includes('missing')))

  const duplicated = parseReleaseVerification(message(`${trailer()}\n${trailer()}`), TREE)
  assert.equal(duplicated.ok, false)
  assert.ok(duplicated.problems.some((problem) => problem.includes('exactly one')))
})

test('refuses any verdict other than APPROVE', () => {
  for (const verdict of ['REQUEST CHANGES', 'request changes', 'APPROVED', 'PENDING']) {
    const result = parseReleaseVerification(message(`Release-Verification: ${verdict} tree=${TREE} reviewer=someone`), TREE)
    assert.equal(result.ok, false, `a ${verdict} verdict must not pass`)
  }
})

test('refuses a malformed tree, an empty reviewer or a placeholder', () => {
  assert.equal(parseReleaseVerification(message(trailer('abc123')), null).ok, false)
  assert.equal(parseReleaseVerification(message(trailer('Z'.repeat(40))), null).ok, false)
  assert.equal(parseReleaseVerification(message('Release-Verification: APPROVE tree=' + TREE + ' reviewer=   '), TREE).ok, false)
  for (const reviewer of ['x', '<verifier name, backend>', 'release-verifier, <backend>']) {
    const result = parseReleaseVerification(message(trailer(TREE, reviewer)), TREE)
    assert.equal(result.ok, false, `the reviewer ${JSON.stringify(reviewer)} must not pass`)
  }
})

test('refuses an approval bound to a different tree', () => {
  const other = 'fedcba9876543210fedcba9876543210fedcba98'
  const result = parseReleaseVerification(message(trailer(other)), TREE)
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('re-verify')))
})

test('the CLI binds a valid approval to HEAD and refuses another tree', () => {
  const run = (text) =>
    execFileSync(process.execPath, [script, '--verify', '--message', text], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  const output = run(message(trailer(headTree)))
  assert.match(output, new RegExp(`tree ${headTree}`, 'u'))

  const other = 'f'.repeat(39) + '0'
  assert.notEqual(other, headTree)
  assert.throws(
    () => run(message(trailer(other))),
    (error) => error.status === 1 && /re-verify after a tree change/u.test(error.stderr),
  )
})

test('publish.yml checks every release trailer before publishing', () => {
  const workflow = readFileSync(join(root, '.github/workflows/publish.yml'), 'utf8')
  const publish = workflow.indexOf('name: Publish with provenance')
  const steps = [
    'name: CHANGELOG has a section for this version',
    'name: Reviewed release notes exist for this version',
    'name: Release notes approved by the owner',
    'name: Documentation audit recorded',
    'name: Release verification recorded',
  ]
  assert.ok(publish !== -1, 'the publish step is missing')
  for (const step of steps) {
    const index = workflow.indexOf(step)
    assert.ok(index !== -1, `${step} is missing from publish.yml`)
    assert.ok(index < publish, `${step} must run before npm publish`)
  }
  const publishBlock = workflow.slice(publish).split('\n      - name:')[0]
  assert.doesNotMatch(publishBlock, /continue-on-error|if:\s*false/u, 'the publish step must not be skippable')
})
