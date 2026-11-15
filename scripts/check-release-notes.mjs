#!/usr/bin/env node
/**
 * Release-note gate for the tag-driven publish workflow.
 *
 * A release must commit `release-notes/<version>.md` with at least one
 * `## Highlights` bullet before its tag is pushed: the in-app update prompt
 * reads that file from the tag-pinned raw URL, so the reviewed file is exactly
 * what users see. `publish.yml` runs this gate before `npm publish`; running
 * `node scripts/check-release-notes.mjs` locally previews it.
 *
 * The default file is required. The English variant (`<version>.en.md`) is
 * optional — the Host falls back to the default file — but when it is committed
 * it must carry reviewed Highlights as well.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseHighlights } from '../src/features/update-check/release-notes.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version
const notesPath = (suffix) => resolve(root, 'release-notes', `${version}${suffix}`)
const failures = []

/** Read one notes file and return its Highlights, or null when it is invalid. */
function readHighlights(file, label) {
  if (!existsSync(file)) {
    failures.push(`release-notes: missing ${label}`)
    return null
  }
  const highlights = parseHighlights(readFileSync(file, 'utf8'))
  if (highlights.length === 0) {
    failures.push(`release-notes: ${label} has no "## Highlights" bullets`)
    return null
  }
  return highlights
}

const highlights = readHighlights(notesPath('.md'), `release-notes/${version}.md`)
const englishFile = notesPath('.en.md')
const english = existsSync(englishFile)
  ? readHighlights(englishFile, `release-notes/${version}.en.md`)
  : null

if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(
  `release-notes: ok (${version}; ${highlights.length} highlight(s)` +
    `${english === null ? '' : `, ${english.length} English`})`
)
for (const point of highlights) console.log(`  - ${point}`)
for (const point of english ?? []) console.log(`  - [en] ${point}`)
