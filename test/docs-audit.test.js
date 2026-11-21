/**
 * Unit tests for the release commit's documentation-audit trailer.
 *
 * The trailer is the only artifact that proves the pre-tag as-built audit ran
 * (release-power-suite step 6), and publish.yml refuses a missing, duplicated
 * or malformed one. These cases pin the accepted grammar and the refusal paths.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { AUDIT_CLASSES, parseDocsAudit } from '../scripts/check-docs-audit.mjs'

const classes = AUDIT_CLASSES.join(',')
const message = (trailer) => `release: v0.2.3\n\n${trailer}\n`
const validTrailer = (waived = 'none', fixed = 'refreshed two stale sentences') =>
  `Docs-Audit: checked=${classes} fixed=${fixed} waived=${waived}`

test('accepts a complete audit trailer without a waiver', () => {
  const result = parseDocsAudit(message(validTrailer()))
  assert.equal(result.ok, true, result.problems.join('; '))
  assert.deepEqual(result.checked, [...AUDIT_CLASSES])
  assert.equal(result.fixed, 'refreshed two stale sentences')
  assert.equal(result.waived, 'none')
})

test('accepts a waiver only when it quotes the owner', () => {
  const quoted = parseDocsAudit(message(validTrailer('owner:"要点没问题，继续发布"')))
  assert.equal(quoted.ok, true, quoted.problems.join('; '))
  assert.equal(quoted.waived, 'owner:"要点没问题，继续发布"')

  const unquoted = parseDocsAudit(message(validTrailer('approved')))
  assert.equal(unquoted.ok, false, 'an unquoted waiver must be refused')
  assert.ok(unquoted.problems.some((problem) => problem.includes('waived=none or waived=owner')))
})

test('refuses a missing or duplicated trailer', () => {
  const missing = parseDocsAudit('release: v0.2.3\n\nno audit here\n')
  assert.equal(missing.ok, false)
  assert.ok(missing.problems.some((problem) => problem.includes('missing')))

  const duplicated = parseDocsAudit(message(`${validTrailer()}\n${validTrailer()}`))
  assert.equal(duplicated.ok, false)
  assert.ok(duplicated.problems.some((problem) => problem.includes('exactly one')))
})

test('refuses a trailer that skips or invents a claim class', () => {
  const skipped = parseDocsAudit(message(`Docs-Audit: checked=${AUDIT_CLASSES.slice(0, -1).join(',')} fixed=none waived=none`))
  assert.equal(skipped.ok, false)
  assert.ok(skipped.problems.some((problem) => problem.includes('screenshots')))

  const invented = parseDocsAudit(message(`Docs-Audit: checked=${classes},vibes fixed=none waived=none`))
  assert.equal(invented.ok, false)
  assert.ok(invented.problems.some((problem) => problem.includes('vibes')))
})

test('refuses an empty fixed field', () => {
  const result = parseDocsAudit(message(`Docs-Audit: checked=${classes} fixed= waived=none`))
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('fixed=')))
})
