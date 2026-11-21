/**
 * Unit tests for the release commit's documentation-audit trailer and the
 * host-version scan behind it.
 *
 * The trailer is the only artifact that proves the pre-tag as-built audit ran
 * (release-power-suite step 6), and publish.yml refuses a missing, duplicated
 * or malformed one. These cases pin the accepted grammar, the refusal paths and
 * the section-scoped environment scan.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { AUDIT_CLASSES, HOST_FILES, parseDocsAudit, scanHostClaims, sliceSections } from '../scripts/check-docs-audit.mjs'

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

test('accepts a waiver only when it quotes the owner and nothing else', () => {
  const quoted = parseDocsAudit(message(validTrailer('owner:"要点没问题，继续发布"')))
  assert.equal(quoted.ok, true, quoted.problems.join('; '))
  assert.equal(quoted.waived, 'owner:"要点没问题，继续发布"')

  for (const bad of ['approved', 'owner:"ok" junk"', 'owner:"ok" extra', 'owner:""']) {
    const result = parseDocsAudit(message(validTrailer(bad)))
    assert.equal(result.ok, false, `a malformed waiver must be refused: ${bad}`)
  }
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
  assert.ok(skipped.problems.some((problem) => problem.includes('changelog')))

  const invented = parseDocsAudit(message(`Docs-Audit: checked=${classes},vibes fixed=none waived=none`))
  assert.equal(invented.ok, false)
  assert.ok(invented.problems.some((problem) => problem.includes('vibes')))
})

test('refuses an empty fixed field', () => {
  const result = parseDocsAudit(message(`Docs-Audit: checked=${classes} fixed= waived=none`))
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('fixed=')))
})

test('sliceSections keeps only the selected headings', () => {
  const text = '# Doc\n\n## Automated\ncurrent 0.2.2-rc.5\n\n## 2026-11-21 round\nhistorical 0.2.2-rc.1\n'
  assert.match(sliceSections(text, { include: /^Automated$/iu }), /0\.2\.2-rc\.5/u)
  assert.doesNotMatch(sliceSections(text, { include: /^Automated$/iu }), /rc\.1/u)
  assert.match(sliceSections(text, { exclude: /^Automated$/iu }), /rc\.1/u)
  // With an include filter the preamble belongs to no section and is dropped.
  const preamble = 'preamble\n\n## Automated\nbody\n'
  assert.doesNotMatch(sliceSections(preamble, { include: /^Automated$/iu }), /preamble/u)
})

test('the host scan ignores historical versions outside the scoped section', () => {
  const files = [{ file: 'fake.md', pattern: /\*\*DSH ([0-9][0-9A-Za-z.-]*)\*\*/gu, include: /^Sidebar width$/iu }]
  const text = '# Doc\n\n## History\n**DSH 0.2.2-rc.1** recorded\n\n## Sidebar width\n**DSH 0.2.2-rc.5** is current\n'
  const reader = () => text
  const ok = scanHostClaims('0.2.2-rc.5', files, reader)
  assert.equal(ok.ok, true, ok.problems.join('; '))
  assert.equal(ok.claims, 1)

  const stale = scanHostClaims('0.2.2-rc.5', files, () => text.replace('**DSH 0.2.2-rc.5**', '**DSH 0.2.2-rc.1**'))
  assert.equal(stale.ok, false)
  assert.ok(stale.problems.some((problem) => problem.includes('rc.1')))
})

test('the host scan requires a claim in every scoped target', () => {
  const files = [
    { file: 'a.md', pattern: /\*\*DSH ([0-9][0-9A-Za-z.-]*)\*\*/gu },
    { file: 'b.md', pattern: /\*\*DSH ([0-9][0-9A-Za-z.-]*)\*\*/gu },
  ]
  const reader = (file) => (file === 'a.md' ? '**DSH 0.2.2-rc.5**\n' : '# no claim here\n')
  const result = scanHostClaims('0.2.2-rc.5', files, reader)
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('b.md') && problem.includes('no host-version claim')))
})

test('sliceSections drops historical ### sub-sections inside an included ## section', () => {
  const text = '## Automated\n### Current gates\ncurrent 0.2.2-rc.5\n### Recorded evidence\nold 0.2.2-rc.1\n'
  const scoped = sliceSections(text, { include: /^Automated$/iu })
  assert.match(scoped, /rc\.5/u)
  assert.doesNotMatch(scoped, /rc\.1/u)
})

test('the host scan refuses to pass without dsh or without a claim', () => {
  const missingHost = scanHostClaims(null, HOST_FILES, () => '')
  assert.equal(missingHost.ok, false)
  assert.ok(missingHost.problems.some((problem) => problem.includes('dsh')))

  const noClaim = scanHostClaims('0.2.2-rc.5', [{ file: 'fake.md', pattern: /\*\*DSH ([0-9][0-9A-Za-z.-]*)\*\*/gu }], () => '# nothing here\n')
  assert.equal(noClaim.ok, false)
  assert.ok(noClaim.problems.some((problem) => problem.includes('no host-version claim')))
})
