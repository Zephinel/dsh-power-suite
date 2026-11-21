/**
 * Unit tests for the release-verification trailer.
 *
 * The trailer binds an independent verifier's APPROVE to the exact tree that
 * gets tagged; publish.yml recomputes the tree and refuses a missing,
 * duplicated or mismatched approval. These cases pin the grammar and the
 * binding.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseReleaseVerification } from '../scripts/check-release-verification.mjs'

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

test('accepts an approval when no tree is supplied', () => {
  assert.equal(parseReleaseVerification(message(trailer())).ok, true)
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

test('refuses a malformed tree or an empty reviewer', () => {
  assert.equal(parseReleaseVerification(message(trailer('abc123')), null).ok, false)
  assert.equal(parseReleaseVerification(message(trailer('Z'.repeat(40))), null).ok, false)
  assert.equal(parseReleaseVerification(message('Release-Verification: APPROVE tree=' + TREE + ' reviewer=   '), TREE).ok, false)
})

test('refuses an approval bound to a different tree', () => {
  const other = 'fedcba9876543210fedcba9876543210fedcba98'
  const result = parseReleaseVerification(message(trailer(other)), TREE)
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('re-verify')))
})
