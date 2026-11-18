#!/usr/bin/env node
/**
 * Repository gate:
 *   1. syntax-check the remaining checked-in JavaScript entries (src/client.js);
 *      TypeScript sources are parsed by the typecheck instead;
 *   2. no-build typecheck (`tsc --noEmit --strict`) over the Host and browser
 *      sources, and fail when an explicit `any` token re-enters them;
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
import vm from 'node:vm'
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

/** Strip comments and string/template literals so the any budget counts code tokens only. */
function stripCommentsAndStrings(source) {
  let output = ''
  let mode = 'code'
  let index = 0
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]
    if (mode === 'code') {
      if (char === '/' && next === '/') { mode = 'line'; index += 2; continue }
      if (char === '/' && next === '*') { mode = 'block'; index += 2; continue }
      if (char === "'") { mode = 'single'; index += 1; continue }
      if (char === '"') { mode = 'double'; index += 1; continue }
      if (char === '`') { mode = 'template'; index += 1; continue }
      output += char
      index += 1
      continue
    }
    if (mode === 'line') {
      if (char === '\n') { mode = 'code'; output += '\n' }
      index += 1
      continue
    }
    if (mode === 'block') {
      if (char === '*' && next === '/') { mode = 'code'; index += 2 } else index += 1
      continue
    }
    if (mode === 'single' || mode === 'double') {
      if (char === '\\') { index += 2; continue }
      if ((mode === 'single' && char === "'") || (mode === 'double' && char === '"')) mode = 'code'
      index += 1
      continue
    }
    // Template body: this intentionally treats the whole literal as text.
    if (char === '\\') { index += 2; continue }
    if (char === '`') mode = 'code'
    index += 1
  }
  return output
}

/** Count explicit `any` tokens in the TypeScript sources: a lexical tripwire, gated at 0. */
function countAnySites(files) {
  let count = 0
  for (const file of files) {
    const matches = stripCommentsAndStrings(readFileSync(file, 'utf8')).match(/\bany\b/g)
    if (matches !== null) count += matches.length
  }
  return count
}

/** Absolute path must exist. */
function requirePath(relative, label) {
  if (!existsSync(resolve(root, relative))) failures.push(`${label} is missing: ${relative}`)
}

// 1. Syntax checks for the remaining JavaScript source. `node --check` parses it
// with the package's ESM mode; the build guard separately proves the served
// lib/client.js is a classic-script IIFE.
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
  console.log('typecheck: ok (tsc --noEmit --strict over Host and browser sources; the browser profile gates next)')
  const anyBudget = 0
  const anySites = countAnySites(typeScriptSources)
  if (anySites > anyBudget) failures.push(`explicit-any budget exceeded: ${anySites} site(s) > ${anyBudget} allowed`)
  console.log(`any budget: ${anySites} explicit any sites in src/**/*.ts (limit ${anyBudget})`)
}

// 2b. Suppression comments are never a way out of the type gate. The browser
// entry legitimately used @ts-nocheck during the migration; that is retired, so
// any @ts-nocheck/@ts-ignore in src is now a failure.
{
  const suppressionFiles = [...typeScriptSources, ...sources]
  const suppressions = []
  for (const file of suppressionFiles) {
    const text = readFileSync(file, 'utf8')
    const matches = text.match(/@ts-nocheck|@ts-ignore/gu)
    if (matches !== null) suppressions.push(`${file.slice(root.length + 1)}: ${matches.join(', ')}`)
  }
  if (suppressions.length > 0) failures.push(`type suppressions are not allowed: ${suppressions.join('; ')}`)
  console.log(`suppression budget: ${suppressions.length} @ts-nocheck/@ts-ignore comment(s) in src (limit 0)`)
}

// 2c. Host-only profile: the browser DOM shim must not leak into Host sources.
try {
  run([tsc, '-p', 'tsconfig.host.json', '--noEmit'])
  console.log('host typecheck: ok (tsconfig.host.json; DOM-free profile)')
} catch {
  failures.push('host typecheck failed: node node_modules/typescript/bin/tsc -p tsconfig.host.json --noEmit')
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

// 4b. Built browser entry: the shipped lib/client.js must execute and register
// the DSH module loader. The source e2e harness bundles src/ separately, so
// without this check a bundle-only regression could ship unexecuted.
{
  try {
    const clientBundle = readFileSync(resolve(root, 'lib/client.js'), 'utf8')
    const noop = () => {}
    const proxy = new Proxy(function () {}, { get: () => proxy, apply: () => proxy, construct: () => proxy })
    let registration = null
    const sandbox = {
      window: { __ModuleLoader__: { load: (value) => { registration = value } } },
      document: {
        addEventListener: noop,
        removeEventListener: noop,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => proxy,
        body: proxy,
        documentElement: proxy,
        createTextNode: () => proxy
      },
      console,
      setTimeout: () => 0,
      clearTimeout: noop,
      setInterval: () => 0,
      clearInterval: noop,
      queueMicrotask: noop,
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: noop,
      matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
      MutationObserver: class { observe() {} disconnect() {} },
      ResizeObserver: class { observe() {} disconnect() {} },
      HTMLElement: class {},
      HTMLCanvasElement: class {},
      HTMLImageElement: class {},
      navigator: { clipboard: { writeText: async () => {} } },
      localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
      location: { origin: 'http://localhost' },
      Response,
      Headers,
      fetch: async () => ({ ok: true, json: async () => ({}) })
    }
    sandbox.globalThis = sandbox
    sandbox.self = sandbox.window
    vm.runInNewContext(clientBundle, sandbox, { filename: 'lib/client.js' })
    if (registration === null || registration.id !== '@zephinel/dsh-power-suite') {
      throw new Error('built browser entry did not register the expected DSH module id')
    }
    const react = {
      createElement: proxy,
      Fragment: proxy,
      useState: (value) => [value, noop],
      useReducer: (_reducer, initial) => [initial, noop],
      useRef: (value) => ({ current: value }),
      useEffect: noop,
      useLayoutEffect: noop,
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      useSyncExternalStore: (getSnapshot) => getSnapshot(),
      Component: class {},
      memo: (component) => component,
      forwardRef: (component) => component
    }
    const registrationValue = registration
    const module = registrationValue.factory((specifier) => {
      if (specifier === 'react') return react
      if (specifier === 'react-dom') return { createPortal: proxy }
      return proxy
    })
    if (typeof module?.apply !== 'function') throw new Error('built browser factory returned no apply()')
    if (!Array.isArray(module.inject) || module.inject.length === 0) throw new Error('built browser factory returned no inject list')
    console.log(`built-browser smoke: ${registrationValue.id} registered; factory exposes ${module.inject.length} injects`)
  } catch (error) {
    failures.push(`built-browser smoke failed: ${error instanceof Error ? error.message : String(error)}`)
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
