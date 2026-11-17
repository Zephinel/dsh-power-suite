#!/usr/bin/env node
/**
 * Repository gate:
 *   1. syntax-check the remaining checked-in JavaScript entries (src/client.js);
 *      TypeScript sources are parsed by the typecheck instead;
 *   2. no-build typecheck (`tsc --noEmit`) over the Host TypeScript sources;
 *   3. validate the bundle manifest, exports, icon, locale, and cordis patch;
 *   4. built-entry smoke: the bundled Host sees its own package, and its update
 *      route reports the running version (not a bundle-relative 0.0.0);
 *   5. validate local Markdown links (docs/, README, CHANGELOG, PRODUCT, skills);
 *   6. run the node:test suites;
 *   7. require reviewed release-notes for the package version.
 *
 * Run with `npm run check`. CI runs the same script.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

/** Run a command, inheriting output; throw on failure. */
function run(args) {
  execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit' })
}

/** Collect every file with one extension below a directory. */
function collectFiles(directory, extension) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectFiles(path, extension))
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(path)
  }
  return files
}

/** Count explicit `any` sites in the Host TypeScript sources (tracked, not gated). */
function countAnySites(files) {
  let count = 0
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(/:\s*any\b|as\s+any\b|<\s*any\s*>|Record<string,\s*any>/g)
    if (matches !== null) count += matches.length
  }
  return count
}

/** Absolute path must exist. */
function requirePath(relative, label) {
  if (!existsSync(resolve(root, relative))) failures.push(`${label} is missing: ${relative}`)
}

// 1. Syntax checks (JavaScript entries only; tsc parses the TypeScript sources).
const sources = collectFiles(resolve(root, 'src'), '.js')
const typeScriptSources = collectFiles(resolve(root, 'src'), '.ts')
for (const file of sources) {
  try {
    run(['--check', file])
  } catch {
    failures.push(`syntax check failed: ${file.slice(root.length + 1)}`)
  }
}

// 2. No-build typecheck over the Host TypeScript sources.
// Node >= 22.18 is required for the test suite to import the sources directly
// via native type stripping; fail with a clear message instead of an ESM error.
const typescriptMode = process.features?.typescript
if (typescriptMode !== 'strip' && typescriptMode !== 'transform') {
  failures.push(`Node ${process.version} cannot run the TypeScript sources directly; use Node >= 22.18`)
}
const tsc = resolve(root, 'node_modules/typescript/bin/tsc')
let typecheckPassed = false
try {
  run([tsc, '--noEmit'])
  typecheckPassed = true
} catch {
  failures.push('typecheck failed: node node_modules/typescript/bin/tsc --noEmit')
}
if (typecheckPassed) {
  console.log('typecheck: ok (tsc --noEmit --strict; src/client.js opted out until Phase 3)')
  console.log(`any budget: ${countAnySites(typeScriptSources)} explicit any sites in src/**/*.ts (tracked, not gated)`)
}

// 3. Manifest checks.
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

// 4. Built-entry smoke. The published Host is the bundled lib/index.js, while
// the unit tests import the TypeScript sources; this drives the built entry
// through a stub context so a bundle-only regression (for example a module-
// relative package.json path) fails the gate instead of shipping silently.
{
  const routes = []
  const stub = new Proxy(function () {}, {
    get(_target, property) {
      if (property === 'register') {
        return (route) => {
          routes.push(route)
          return () => {}
        }
      }
      if (property === 'effect') {
        return (callback) => {
          try {
            return callback()
          } catch {
            return () => {}
          }
        }
      }
      if (property === 'then') return undefined
      return stub
    },
    apply() {
      return stub
    },
    construct() {
      return stub
    }
  })
  try {
    const built = await import(`${pathToFileURL(resolve(root, 'lib/index.js')).href}?smoke=${Date.now()}`)
    if (typeof built.apply !== 'function') throw new Error('built Host entry has no apply()')
    built.apply(stub)
    const route = routes.find((candidate) => candidate.path === '/api/power-suite.update')
    if (route === undefined) throw new Error('built Host entry did not register the update route')
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => Response.json({ version: '9.9.9' })
    try {
      const response = await route.fetch({
        url: 'http://127.0.0.1/api/power-suite.update?lang=default',
        method: 'GET',
        headers: new Headers()
      })
      const view = await response.json()
      if (view.current !== pkg.version) {
        throw new Error(`built update route reports current=${view.current}, expected ${pkg.version}`)
      }
    } finally {
      globalThis.fetch = originalFetch
    }
    console.log(`built-entry smoke: update route reports current=${pkg.version}`)
  } catch (error) {
    failures.push(`built-entry smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 5. Local Markdown links and images must resolve. Kept in its own script so
// the CI docs-only fast path can run the same check without the full gate.
try {
  run(['scripts/check-docs-links.mjs'])
} catch {
  failures.push('docs link check failed: scripts/check-docs-links.mjs')
}

// 6. Tests.
const testDirectory = resolve(root, 'test')
const tests = statSync(testDirectory).isDirectory()
  ? readdirSync(testDirectory).filter((name) => name.endsWith('.test.js')).map((name) => join(testDirectory, name))
  : []
if (tests.length === 0) failures.push('no node:test files found under test/')
else run(['--test', ...tests])

// 7. Release-notes gate: the release must commit reviewed highlights for the
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
console.log(`\ncheck passed: ${typeScriptSources.length} TypeScript modules, ${sources.length} JavaScript module(s), ${tests.length} test files.`)
