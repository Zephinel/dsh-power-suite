#!/usr/bin/env node
/**
 * Build the two package entries into the gitignored `lib/` directory.
 *
 * The package ships built entry points so the Host can become TypeScript in
 * Phase 2 and the browser half is a module tree bundled to a classic script:
 *
 *   lib/index.js   Host entry, ESM bundle (platform node, node builtins external)
 *   lib/client.js  browser entry: ESM `src/client.js` plus the modules under
 *                  `src/browser/`, bundled into one classic-script IIFE.
 *
 * The build is deterministic: no timestamps, no absolute paths and no source
 * maps. `npm run check` builds first; `prepare` builds before `npm pack` and
 * `npm publish`.
 */
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'lib')

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning'
})

await build({
  absWorkingDir: root,
  entryPoints: ['src/client.js'],
  outfile: 'lib/client.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  charset: 'utf8',
  logLevel: 'warning'
})

/** Human-readable byte size for one built entry. */
const describe = async (name) => {
  const bytes = (await stat(join(outDir, name))).size
  return `${name} ${(bytes / 1024).toFixed(1)} kB`
}
console.log(`build: ${await describe('index.js')}, ${await describe('client.js')}`)

// Guardrail: load the built Host entry and assert the Loader contract, so a
// bundling change cannot silently ship an inert plugin.
const host = await import(`${pathToFileURL(join(outDir, 'index.js')).href}?built=${Date.now()}`)
if (host.name !== 'power-suite') throw new Error(`build: Host entry name is ${String(host.name)}`)
if (!Array.isArray(host.inject) || host.inject.length === 0) throw new Error('build: Host entry has no inject list')
if (typeof host.apply !== 'function') throw new Error('build: Host entry has no apply function')

// The browser entry must still hand the DSH loader its id/factory object.
const client = await readFile(join(outDir, 'client.js'), 'utf8')
if (!/__ModuleLoader__\.load\(\{\s*id:\s*"@zephinel\/dsh-power-suite"/.test(client)) {
  throw new Error('build: browser entry no longer calls the DSH module loader with the package id')
}

// The manifest lookup uses the package self-reference; prove it resolves from a
// module inside lib/, the same package scope as the built Host entry.
const probe = join(outDir, '.manifest-probe.mjs')
await writeFile(probe, `import { readFileSync } from 'node:fs'
const url = new URL(import.meta.resolve('@zephinel/dsh-power-suite/package.json'))
const manifest = JSON.parse(readFileSync(url, 'utf8'))
if (manifest.name !== '@zephinel/dsh-power-suite') throw new Error('wrong package')`)
try {
  await import(`${pathToFileURL(probe).href}?probe=${Date.now()}`)
} finally {
  await rm(probe, { force: true })
}
