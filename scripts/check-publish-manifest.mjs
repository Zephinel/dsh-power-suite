#!/usr/bin/env node
/**
 * Publish-manifest gate: the package metadata a release tag needs before npm
 * publish can succeed. Run this after removing `"private": true` during release
 * preparation, before pushing the `v<version>` tag.
 *
 * It is deliberately NOT part of `npm run check`: the development profile keeps
 * the package private, so during normal feature work this gate fails by design.
 * `publish.yml` runs it right after the tag/version check so a tag pushed from an
 * unpreparable tree fails immediately with an explicit message instead of at the
 * `npm publish` step.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

/** The only package identity this repository publishes. */
const EXPECTED_NAME = '@zephinel/dsh-power-suite'

/** The only GitHub repository release notes are served from. */
const EXPECTED_REPOSITORY = /^git\+https:\/\/github\.com\/Zephinel\/dsh-power-suite\.git$/u

const failures = []
if (pkg.private !== false) {
  failures.push('package.json still has "private": true (remove it before tagging)')
}
if (pkg.name !== EXPECTED_NAME) {
  failures.push(`package.json name must be ${EXPECTED_NAME} (found ${String(pkg.name)})`)
}
const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
if (typeof repository !== 'string' || !EXPECTED_REPOSITORY.test(repository)) {
  failures.push(`package.json repository must be git+https://github.com/Zephinel/dsh-power-suite.git (found ${String(repository)})`)
}
if (pkg.publishConfig?.access !== 'public') {
  failures.push('package.json publishConfig.access must be "public"')
}
if (!Array.isArray(pkg.files) || !pkg.files.includes('release-notes')) {
  failures.push('package.json files must include "release-notes"')
}
if (typeof pkg.scripts?.['check:release-notes'] !== 'string') {
  failures.push('package.json scripts must define "check:release-notes"')
}

if (failures.length > 0) {
  console.error(`publish manifest is not ready (${pkg.name}@${String(pkg.version)}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log(`publish manifest ok: ${pkg.name}@${pkg.version}`)
