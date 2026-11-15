#!/usr/bin/env node
/**
 * Repository gate:
 *   1. syntax-check every checked-in JavaScript module under src/;
 *   2. validate the bundle manifest, exports, icon, locale, and cordis patch;
 *   3. validate local Markdown links (docs/, README, CHANGELOG, PRODUCT, skills);
 *   4. run the node:test suites;
 *   5. require reviewed release-notes for the package version.
 *
 * Run with `npm run check`. CI runs the same script.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

/** Run a command, inheriting output; throw on failure. */
function run(args) {
  execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit' })
}

/** Collect every .js file below a directory. */
function collectJavaScript(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectJavaScript(path))
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path)
  }
  return files
}

/** Absolute path must exist. */
function requirePath(relative, label) {
  if (!existsSync(resolve(root, relative))) failures.push(`${label} is missing: ${relative}`)
}

// 1. Syntax checks.
const sources = [resolve(root, 'src/index.js'), resolve(root, 'src/client.js'), ...collectJavaScript(resolve(root, 'src/features'))]
for (const file of sources) {
  try {
    run(['--check', file])
  } catch {
    failures.push(`syntax check failed: ${file.slice(root.length + 1)}`)
  }
}

// 2. Manifest checks.
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
for (const [name, target] of Object.entries(pkg.exports ?? {})) {
  if (typeof target !== 'string' || target.includes('*')) continue
  requirePath(target, `exports["${name}"]`)
}
requirePath(pkg.main, 'main')
requirePath(pkg.icon, 'icon')
requirePath(pkg.dsh?.bundle?.patch, 'dsh.bundle.patch')
for (const entry of pkg.files ?? []) {
  if (entry.includes('*')) continue
  requirePath(entry, 'files[]')
}
if (pkg.name !== '@zephinel/dsh-power-suite') failures.push('package name changed unexpectedly')
if (pkg.dsh?.client?.platform !== 'web') failures.push('dsh.client.platform must be "web"')
for (const file of ['locale/en.json', 'locale/zh.json']) {
  try {
    JSON.parse(readFileSync(resolve(root, file), 'utf8'))
  } catch {
    failures.push(`${file} is not valid JSON`)
  }
}
if (!existsSync(resolve(root, 'README.md'))) failures.push('README.md is missing')
if (!existsSync(resolve(root, 'CHANGELOG.md'))) failures.push('CHANGELOG.md is missing')

// 3. Local Markdown links and images must resolve. Kept in its own script so
// the CI docs-only fast path can run the same check without the full gate.
try {
  run(['scripts/check-docs-links.mjs'])
} catch {
  failures.push('docs link check failed: scripts/check-docs-links.mjs')
}

// 4. Tests.
const testDirectory = resolve(root, 'test')
const tests = statSync(testDirectory).isDirectory()
  ? readdirSync(testDirectory).filter((name) => name.endsWith('.test.js')).map((name) => join(testDirectory, name))
  : []
if (tests.length === 0) failures.push('no node:test files found under test/')
else run(['--test', ...tests])

// 5. Release-notes gate: the release must commit reviewed highlights for the
// package version, because the in-app update prompt reads them from the
// tag-pinned raw URL (see scripts/check-release-notes.mjs).
try {
  run(['scripts/check-release-notes.mjs'])
} catch {
  failures.push('release-notes gate failed: scripts/check-release-notes.mjs')
}

if (failures.length > 0) {
  console.error('\ncheck failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log(`\ncheck passed: ${sources.length} modules, ${tests.length} test files.`)
