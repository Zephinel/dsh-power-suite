import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const script = fileURLToPath(new URL('../scripts/release-notes-approval.mjs', import.meta.url))
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const notesFile = new URL(`../release-notes/${manifest.version}.md`, import.meta.url)
const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' })

test('the approval hash covers the version and both notes files', () => {
  if (!existsSync(notesFile)) {
    // A version bumped ahead of its notes has nothing to approve; the release gate fails elsewhere.
    assert.equal(run('--json').status, 1, 'a version without release notes cannot be approved')
    return
  }
  const json = run('--json')
  assert.equal(json.status, 0, json.stderr)
  const facts = JSON.parse(json.stdout)
  assert.equal(facts.version, manifest.version)
  assert.match(facts.sha256, /^[0-9a-f]{64}$/u, 'the approval hash is a sha256 digest')
  assert.ok(facts.files.includes(`release-notes/${manifest.version}.md`), 'the default notes are hashed')
})

test('the approval marker verifies against the notes and refuses stale or missing approvals', () => {
  if (!existsSync(notesFile)) return
  const json = run('--json')
  assert.equal(json.status, 0, json.stderr)
  const { sha256 } = JSON.parse(json.stdout)
  const approval = `release: prepare ${manifest.version}\n\nRelease-Notes-Review: sha256=${sha256}`
  assert.equal(run('--verify', '--message', approval).status, 0, 'a matching approval passes')
  assert.equal(run('--verify', '--message', 'release: prepare without approval').status, 1,
    'a missing approval is refused')
  assert.equal(run('--verify', '--message', `Release-Notes-Review: sha256=${'0'.repeat(64)}`).status, 1,
    'an approval for other notes content is refused')
  assert.equal(
    run('--verify', '--message', `${approval}\nRelease-Notes-Review: sha256=${sha256}`).status,
    1,
    'a duplicated approval is refused'
  )
})

test('publish.yml verifies the owner-approved notes hash from the tagged commit', () => {
  const publish = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')
  assert.match(publish, /npm run check:release-notes/u, 'publish validates the notes format')
  assert.match(publish, /release-notes-approval\.mjs --verify/u, 'publish verifies the approved notes hash')
  assert.match(publish, /git show -s --format=%B HEAD/u, 'the approval is read from the tagged commit body')
  assert.ok(existsSync(script), 'the approval script stays in the repo')
})

test('the release gates are wired into package.json and the docs', () => {
  assert.equal(manifest.scripts['check:release'], 'node scripts/release-check.mjs', 'check:release script')
  assert.ok(existsSync(new URL('../scripts/release-check.mjs', import.meta.url)), 'the release check stays in the repo')
  const notesReadme = readFileSync(new URL('../release-notes/README.md', import.meta.url), 'utf8')
  assert.match(notesReadme, /Release-Notes-Review: sha256=<hash>/u, 'the notes README documents the approval line')
  const development = readFileSync(new URL('../docs/development.md', import.meta.url), 'utf8')
  assert.match(development, /npm run check:release/u, 'development.md documents the package-level gate')
  assert.match(development, /Release-Notes-Review: sha256=<hash>/u, 'development.md documents the approval line')
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
  const dated = new RegExp(`^## \\[${manifest.version.replaceAll('.', '\\.')}\\] - `, 'm')
  assert.match(changelog, dated, 'CHANGELOG carries the dated release heading the publish gate requires')
})
