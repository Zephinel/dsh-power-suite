#!/usr/bin/env node
/**
 * Release check: pack the plugin, install the tarball into a throwaway DSH
 * profile, and verify that what ships is byte-for-byte what the checkout holds —
 * the complete packed file set, the installed copy, the mounted loader row, the
 * served client bundle and clean uninstall.
 *
 * Why this exists: `npm run check` never leaves the source tree, so it cannot
 * catch a package that ships a stale or missing file — for example a packing
 * change that silently drops `docs/`, a locale entry or the release notes, or a
 * build that does not match the source. The guarantees here are artifact-level:
 * the build runs first, the tarball's full manifest is extracted, `lib/` is
 * compared with the fresh build output, every other packed path is compared with
 * the checkout, and the installed copy is compared with the tarball.
 *
 * Requirements: `dsh` and `pnpm` on PATH (override dsh with DSH_BIN). The script
 * never reads or writes the user's DSH profiles: it uses a throwaway `$DSH_HOME`
 * and an isolated Web instance on 127.0.0.1 with an OS-assigned port.
 *
 * Usage:
 *   node scripts/release-check.mjs           # run the full check, then clean up
 *   node scripts/release-check.mjs --keep    # keep the temp pack dir and DSH_HOME
 */

import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dshBin = process.env.DSH_BIN ?? 'dsh'
const keepArtifacts = process.argv.includes('--keep')
const PACKAGE_NAME = '@zephinel/dsh-power-suite'
const PROFILE = 'web'

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

/** Files the tarball must ship; the docs set and release notes are what a packaging change drops first. */
const REQUIRED_PACK_FILES = [
  'package.json',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/client.js',
  'locale/en.json',
  'locale/zh.json',
  'README.md',
  'CHANGELOG.md',
  'PRODUCT.md',
  'docs/README.md',
  'icon.png',
  `release-notes/${pkg.version}.md`
]
/** Repo-only directories that must never reach the tarball. */
const FORBIDDEN_PACK_PREFIXES = ['src/', 'test/', 'skills/', '.agents/', '.github/', '.git/', 'node_modules/', '.tmp-']

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

/** Run one child process and return its captured output; every command has a deadline. */
async function run(command, args, options = {}) {
  const { timeout = 300_000, ...rest } = options
  try {
    return await execFileAsync(command, args, {
      maxBuffer: 64 * 1024 * 1024,
      timeout,
      killSignal: 'SIGKILL',
      ...rest
    })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`\`${command}\` is not available: install the DSH CLI and pnpm (or set DSH_BIN) before running the release check`)
    }
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : ''
    const reason = error?.killed === true ? `timed out after ${timeout}ms` : `exit ${error?.code ?? '?'}`
    throw new Error(
      `\`${command} ${args.join(' ')}\` failed (${reason})`
      + (stderr === '' ? '' : `\n--- stderr ---\n${stderr.slice(-4000)}`)
      + (stdout === '' ? '' : `\n--- stdout ---\n${stdout.slice(-2000)}`)
    )
  }
}

/** Print a check line that passes. */
function pass(message) {
  console.log(`  ok  ${message}`)
}

/** Fail the check when a condition does not hold. */
function ensure(condition, message) {
  if (!condition) throw new Error(message)
}

/** Stable content hash for artifact comparisons. */
function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Whether a path exists. */
async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** List every regular file under a directory, as `/`-joined relative paths. */
async function walkFiles(directory, base = '') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = base === '' ? entry.name : `${base}/${entry.name}`
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walkFiles(absolute, relative))
    else if (entry.isFile()) files.push({ path: relative, absolute })
  }
  return files
}

/** Manifest of one artifact: every file's content hash. */
async function hashTree(directory) {
  const manifest = new Map()
  for (const file of await walkFiles(directory)) {
    manifest.set(file.path, sha256(await readFile(file.absolute)))
  }
  return manifest
}

/** Remove the pairing token from captured logs before printing them. */
function sanitize(text) {
  return text.replace(/token=[^\s"&]+/g, 'token=…')
}

/** Parse `npm pack --json` stdout, which may prefix the JSON with log lines. */
async function pack(packDir) {
  const { stdout } = await run('npm', ['pack', '--json', '--pack-destination', packDir], { cwd: root, timeout: 600_000 })
  const start = stdout.lastIndexOf('\n[') >= 0 ? stdout.lastIndexOf('\n[') + 1 : stdout.indexOf('[')
  ensure(start >= 0, 'npm pack --json printed no JSON')
  const [entry] = JSON.parse(stdout.slice(start))
  ensure(entry !== undefined && Array.isArray(entry.files), 'npm pack --json returned no file list')
  return entry
}

/** Wait for the `dsh web` startup URL. */
async function waitForUrl(child, output, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(output())
    if (match !== null) return match[1]
    if (child.exitCode !== null) throw new Error(`dsh web exited (${child.exitCode}) before printing a URL`)
    await sleep(200)
  }
  throw new Error('timed out waiting for the dsh web startup URL')
}

/** Wait until the server answers the token URL with the pairing redirect. */
async function waitForTokenResponse(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let lastStatus
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status === 303) return response
      lastStatus = response.status
      await response.body?.cancel().catch(() => {})
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error)
    }
    await sleep(250)
  }
  throw new Error(`dsh web did not settle on the token pairing redirect (last: ${lastStatus ?? 'timeout'})`)
}

/** Stop the isolated server. */
async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const deadline = Date.now() + 10_000
  while (child.exitCode === null && Date.now() < deadline) await sleep(100)
  if (child.exitCode === null) child.kill('SIGKILL')
}

async function main() {
  const workDir = await mkdtemp(join(tmpdir(), 'dsh-ps-release-check-'))
  const packDir = join(workDir, 'pack')
  const extractDir = join(workDir, 'packed')
  const packedHome = join(workDir, 'dsh-home')
  const env = { ...process.env, DSH_HOME: packedHome }
  const profileManifest = join(packedHome, 'profiles', PROFILE, 'package.json')
  let server
  let serverOutput = ''
  let failed = false

  try {
    console.log(`release-check: ${PACKAGE_NAME}@${pkg.version}`)

    console.log('- build the package entries')
    await run(process.execPath, [join(root, 'scripts/build.mjs')], { timeout: 120_000 })
    const builtLib = new Map(
      [...(await hashTree(join(root, 'lib')))].map(([path, hash]) => [`lib/${path}`, hash])
    )
    pass(`${builtLib.size} built entries`)

    console.log('- pack')
    await mkdir(packDir, { recursive: true })
    const entry = await pack(packDir)
    const packed = new Map(entry.files.map((file) => [file.path, file.size]))
    for (const required of REQUIRED_PACK_FILES) {
      ensure(packed.has(required), `tarball is missing ${required}`)
    }
    for (const prefix of FORBIDDEN_PACK_PREFIXES) {
      ensure(!entry.files.some((file) => file.path.startsWith(prefix)), `tarball leaks repo-only path ${prefix}*`)
    }
    const tarball = join(packDir, entry.filename)
    ensure(await exists(tarball), `npm pack did not create ${tarball}`)
    pass(`${entry.entryCount} files, ${Math.round(entry.size / 1024)} kB tarball`)

    console.log('- extract the tarball manifest')
    await mkdir(extractDir, { recursive: true })
    await run('tar', ['-xzf', tarball, '-C', extractDir], { timeout: 60_000 })
    const packedRoot = join(extractDir, 'package')
    ensure(await exists(packedRoot), 'the tarball has no package/ root')
    const packedFiles = await hashTree(packedRoot)
    ensure(
      packedFiles.size === entry.files.length,
      `extracted ${packedFiles.size} files but npm listed ${entry.files.length}`
    )
    for (const path of packed.keys()) {
      ensure(packedFiles.has(path), `npm listed ${path} but the tarball has no such file`)
    }
    pass(`${packedFiles.size} files extracted`)

    console.log('- the packed manifest and bundle row are internally consistent')
    const packedPkg = JSON.parse(await readFile(join(packedRoot, 'package.json'), 'utf8'))
    ensure(packedPkg.name === PACKAGE_NAME, `packed package name is ${String(packedPkg.name)}`)
    ensure(packedPkg.version === pkg.version, `packed version ${String(packedPkg.version)} differs from the checkout`)
    const packedPatch = await readFile(join(packedRoot, 'cordis.patch.yml'), 'utf8')
    ensure(/^\s+- id: power-suite\s*$/m.test(packedPatch), 'packed cordis.patch.yml has no "id: power-suite" row')
    ensure(packedPatch.includes(`name: '${PACKAGE_NAME}'`), 'packed cordis.patch.yml names another package')
    const packedHost = await import(`${pathToFileURL(join(packedRoot, 'lib/index.js')).href}?packed=${Date.now()}`)
    ensure(packedHost.name === 'power-suite', 'packed Host entry does not export the power-suite name')
    ensure(Array.isArray(packedHost.inject) && packedHost.inject.length > 0, 'packed Host entry has no inject list')
    ensure(typeof packedHost.apply === 'function', 'packed Host entry has no apply function')
    pass(`one power-suite loader row for ${PACKAGE_NAME}`)

    console.log('- packed lib matches the build; every other packed file matches the checkout')
    for (const [path, hash] of packedFiles) {
      if (path.startsWith('lib/')) {
        ensure(builtLib.has(path), `packed ${path} is not produced by the build`)
        ensure(builtLib.get(path) === hash, `packed ${path} differs from the build output`)
        continue
      }
      const source = join(root, path)
      ensure(await exists(source), `packed ${path} does not exist in the checkout`)
      ensure(sha256(await readFile(source)) === hash, `packed ${path} differs from the checkout`)
    }
    pass(`${packedFiles.size} packed paths: lib matches the build, the rest match the checkout`)

    console.log('- initialize a throwaway DSH profile')
    await run(dshBin, ['--profile', PROFILE, '--dump-config'], { env, timeout: 120_000 })
    const initialManifest = JSON.parse(await readFile(profileManifest, 'utf8'))
    ensure(
      initialManifest.dsh?.profile?.bundles?.includes('@deepseek-ai/dsh-web-app') === true,
      'the throwaway profile is not the shipped web template'
    )
    pass(`fresh $DSH_HOME at ${packedHome}`)

    console.log('- install the tarball')
    await run(dshBin, ['plugin', '--profile', PROFILE, 'add', tarball], { env, timeout: 180_000 })
    const installedManifest = JSON.parse(await readFile(profileManifest, 'utf8'))
    ensure(installedManifest.dependencies?.[PACKAGE_NAME] !== undefined, 'profile dependency missing after install')
    ensure(
      installedManifest.dsh?.profile?.bundles?.includes(PACKAGE_NAME) === true,
      'profile bundles missing after install'
    )
    const installedDir = join(packedHome, 'profiles', PROFILE, 'node_modules', ...PACKAGE_NAME.split('/'))
    ensure(await exists(installedDir), `installed package missing at ${installedDir}`)
    pass('dependency + bundle row recorded')

    console.log('- the installed package is the packed artifact')
    const installedFiles = await hashTree(installedDir)
    const missing = [...packedFiles.keys()].filter((path) => !installedFiles.has(path))
    const extra = [...installedFiles.keys()].filter((path) => !packedFiles.has(path))
    ensure(missing.length === 0, `installed package is missing packed files: ${missing.slice(0, 5).join(', ')}`)
    ensure(extra.length === 0, `installed package has files the tarball does not: ${extra.slice(0, 5).join(', ')}`)
    const mismatched = [...packedFiles.entries()]
      .filter(([path, hash]) => installedFiles.get(path) !== hash)
      .map(([path]) => path)
    ensure(mismatched.length === 0, `installed files differ from the tarball: ${mismatched.slice(0, 5).join(', ')}`)
    pass(`${packedFiles.size} installed files are byte-identical to the tarball`)

    console.log('- composed profile mounts the row')
    const composed = await run(dshBin, ['--profile', PROFILE, '--dump-config'], { env, timeout: 120_000 })
    ensure(composed.stdout.includes(`# == ${PACKAGE_NAME}`), 'composed tree has no bundle marker for the plugin')
    ensure(
      /- id: power-suite\s*\n\s+name: '@zephinel\/dsh-power-suite'/.test(composed.stdout),
      'composed tree has no power-suite row'
    )
    pass('loader row present in the composed tree')

    console.log('- boot an isolated web instance')
    server = spawn(dshBin, ['web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const append = (chunk) => { serverOutput += chunk }
    server.stdout.setEncoding('utf8')
    server.stderr.setEncoding('utf8')
    server.stdout.on('data', append)
    server.stderr.on('data', append)
    const tokenUrl = await waitForUrl(server, () => serverOutput)
    pass(`dsh web on ${new URL(tokenUrl).origin}`)

    console.log('- boot graph lists the client module')
    const tokenResponse = await waitForTokenResponse(tokenUrl)
    const setCookies = typeof tokenResponse.headers.getSetCookie === 'function'
      ? tokenResponse.headers.getSetCookie()
      : [tokenResponse.headers.get('set-cookie') ?? '']
    const cookie = setCookies.filter(Boolean).map((value) => value.split(';')[0]).join('; ')
    ensure(cookie !== '', 'token URL did not set a session cookie')
    const pageResponse = await fetch(new URL('/', tokenUrl), { headers: { cookie } })
    ensure(pageResponse.status === 200, `boot page returned ${pageResponse.status}`)
    const page = await pageResponse.text()
    ensure(page.includes(`"${PACKAGE_NAME}"`), 'boot graph does not list the plugin package')
    const moduleMatch = /"url":"(plugins\/\?\?@zephinel\/dsh-power-suite\/client\.js[^"]*)"/.exec(page)
    ensure(moduleMatch !== null, 'boot graph has no client bundle URL for the plugin')
    pass('client bundle URL registered')

    console.log('- served bundle is the installed package file')
    const bundleResponse = await fetch(new URL(moduleMatch[1], tokenUrl), { headers: { cookie } })
    ensure(bundleResponse.status === 200, `client bundle returned ${bundleResponse.status}`)
    const servedBundle = await bundleResponse.text()
    const installedClient = await readFile(join(installedDir, 'lib/client.js'), 'utf8')
    ensure(servedBundle.startsWith(installedClient), 'served client bundle does not start with the installed lib/client.js')
    const trailer = servedBundle.slice(installedClient.length)
    ensure(trailer.length < 2048 && trailer.includes('sourceMappingURL'), 'served client bundle has an unexpected trailer')
    pass(`${installedClient.length} B, only the source-map trailer differs`)

    await stopServer(server)
    server = undefined

    console.log('- uninstall')
    await run(dshBin, ['plugin', '--profile', PROFILE, 'remove', PACKAGE_NAME], { env, timeout: 180_000 })
    const removedManifest = JSON.parse(await readFile(profileManifest, 'utf8'))
    ensure(removedManifest.dependencies?.[PACKAGE_NAME] === undefined, 'profile dependency survived uninstall')
    ensure(
      removedManifest.dsh?.profile?.bundles?.includes(PACKAGE_NAME) !== true,
      'profile bundles entry survived uninstall'
    )
    const afterRemove = await run(dshBin, ['--profile', PROFILE, '--dump-config'], { env, timeout: 120_000 })
    ensure(!afterRemove.stdout.includes('id: power-suite'), 'loader row survived uninstall')
    ensure(!(await exists(installedDir)), 'installed package directory survived uninstall')
    pass('dependency, bundle row and package removed')

    console.log('')
    console.log(`release-check: PASS (${packedFiles.size} packaged files verified)`)
  } catch (error) {
    failed = true
    console.error('')
    console.error(`release-check: FAIL — ${error instanceof Error ? error.message : String(error)}`)
    if (server !== undefined) {
      await stopServer(server)
      server = undefined
    }
    if (serverOutput.trim() !== '') console.error(`--- isolated dsh web output (tail) ---\n${sanitize(serverOutput).slice(-4000)}`)
    console.error(`artifacts kept at ${workDir}`)
    process.exitCode = 1
  } finally {
    if (server !== undefined) await stopServer(server)
    if (!failed && !keepArtifacts) await rm(workDir, { recursive: true, force: true })
    else if (!failed && keepArtifacts) console.log(`artifacts kept at ${workDir}`)
  }
}

await main()
