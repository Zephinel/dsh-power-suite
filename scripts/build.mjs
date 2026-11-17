#!/usr/bin/env node
/**
 * Build the two package entries into the gitignored `lib/` directory.
 *
 * The package ships built entry points so the Host can become TypeScript in
 * Phase 2 while the published file layout stays a normal bundle:
 *
 *   lib/index.js   Host entry, ESM bundle (platform node, node builtins external)
 *   lib/client.js  browser entry, classic-script IIFE. The current monolith is
 *                  authored as one classic script; esbuild only wraps it until
 *                  Phase 3 splits it into modules.
 *
 * The build is deterministic: no timestamps, no absolute paths and no source
 * maps. `npm run check` builds first; `prepare` builds before `npm pack` and
 * `npm publish`.
 */
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
const { pathToFileURL } = await import('node:url')
const host = await import(`${pathToFileURL(join(outDir, 'index.js')).href}?built=${Date.now()}`)
if (host.name !== 'power-suite') throw new Error(`build: Host entry name is ${String(host.name)}`)
if (!Array.isArray(host.inject) || host.inject.length === 0) throw new Error('build: Host entry has no inject list')
if (typeof host.apply !== 'function') throw new Error('build: Host entry has no apply function')

// The browser entry must still hand the DSH loader its id/factory object.
const client = await readFile(join(outDir, 'client.js'), 'utf8')
if (!client.includes('__ModuleLoader__.load({')) throw new Error('build: browser entry no longer calls the DSH module loader')
if (!client.includes('"@zephinel/dsh-power-suite"')) throw new Error('build: browser entry is missing the package id')
