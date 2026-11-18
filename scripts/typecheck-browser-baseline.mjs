#!/usr/bin/env node
/**
 * Browser typecheck baseline for the browser entry and the modules it imports.
 *
 * `src/client.js` starts with `// @ts-nocheck` (Phase 3 keeps the browser half
 * out of the root gate), so `npm run typecheck` never sees it. This harness
 * measures the separate browser profile in `tsconfig.browser.json` (DOM lib,
 * `types: []`, the minimal `src/browser/dom.d.ts` shim excluded because the DOM
 * lib supersedes it) without touching any production file:
 *
 *   1. copy `src/` and `package.json` to a throwaway OS temp directory;
 *   2. replace the first `@ts-nocheck` line of the copied `client.js` with a
 *      comment of the same byte length, so line numbers and byte offsets stay
 *      stable while the compiler finally checks the file;
 *   3. write a temp copy of `tsconfig.browser.json` (same compiler options and
 *      include/exclude patterns) and run a single `tsc -p ... --noEmit` pass;
 *   4. attribute every diagnostic to its innermost `//#region`, and report the
 *      total, per TS code, per top-level `feature:` region (including nested
 *      regions) and per nested model.
 *
 * Modes:
 *   (default)  measure, report, and exit 0. Writes the baseline only when the
 *              baseline file is missing; an existing baseline is never
 *              overwritten, so an ordinary run cannot silently loosen it.
 *   --write    measure and overwrite scripts/browser-typecheck-baseline.json.
 *   --check    exit 1 only when the measured total or one TS-code count is
 *              greater than the stored baseline. HEAD, client.js size, region
 *              counts and per-file counts are reported but never gate.
 *
 * Exit codes: 0 ok, 1 ratchet regression (--check only), 2 harness error.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = join(root, 'scripts', 'browser-typecheck-baseline.json')
const BROWSER_TSCONFIG_PATH = join(root, 'tsconfig.browser.json')
const CLIENT_PATH = join(root, 'src', 'client.js')
const PACKAGE_PATH = join(root, 'package.json')
const FEATURE_PREFIX = 'feature: '
const DIAGNOSTIC_RE = /^(.*)\((\d+),(\d+)\): error (TS\d+): (.*)$/
const GLOBAL_DIAGNOSTIC_RE = /^error (TS\d+): (.*)$/
const USAGE = `Usage: node scripts/typecheck-browser-baseline.mjs [--check | --write]

  (default)  measure the browser profile, report, and exit 0; writes the
             baseline only when it is missing
  --write    overwrite scripts/browser-typecheck-baseline.json with the
             measured counts
  --check    exit 1 when the measured total or a TS-code count exceeds the
             baseline; print the deltas`

/** Sort an occurrence map into a deterministic plain object (count desc, then name). */
function sortedCounts(map) {
  return Object.fromEntries(
    [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  )
}

/** Short HEAD; informational only, never a gate. */
function gitHead() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

/** Installed TypeScript version, informational only. */
async function typescriptVersion() {
  try {
    const manifest = JSON.parse(await readFile(join(root, 'node_modules', 'typescript', 'package.json'), 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Replace the first `@ts-nocheck` line with a comment of the same UTF-8 byte
 * length. Line numbers and byte offsets stay stable, so the measured
 * diagnostics map one-to-one onto the real file.
 */
function neutralizeNocheck(text) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const index = lines.findIndex((line) => /^\/\/\s*@ts-nocheck\b/.test(line))
  if (index === -1) {
    throw new Error('src/client.js no longer starts with a @ts-nocheck line; update the browser baseline harness')
  }
  const targetBytes = Buffer.byteLength(lines[index], 'utf8')
  let replacement = '// baseline harness: nocheck directive neutralized in this temporary copy.'
  if (Buffer.byteLength(replacement, 'utf8') > targetBytes) {
    replacement = '// baseline harness: nocheck neutralized.'
  }
  while (Buffer.byteLength(replacement, 'utf8') < targetBytes) replacement += ' '
  lines[index] = replacement
  const patched = lines.join(newline)
  if (Buffer.byteLength(patched, 'utf8') !== Buffer.byteLength(text, 'utf8')) {
    throw new Error('could not neutralize @ts-nocheck without changing the file byte length')
  }
  if (patched.split('\n').length !== text.split('\n').length) {
    throw new Error('could not neutralize @ts-nocheck without changing the line count')
  }
  return { text: patched, line: index + 1, bytes: targetBytes }
}

/**
 * Write the temp tsconfig: the repo `tsconfig.browser.json` with `extends`
 * rewritten to an absolute repo path, so the copy still inherits the root
 * compiler options from the real tree.
 */
async function writeTempConfig(tempRoot) {
  let config
  try {
    config = JSON.parse(await readFile(BROWSER_TSCONFIG_PATH, 'utf8'))
  } catch (error) {
    throw new Error(`cannot parse tsconfig.browser.json: ${error.message}`)
  }
  if (typeof config.extends === 'string' && !isAbsolute(config.extends)) {
    config.extends = resolve(root, config.extends)
  }
  if (!Array.isArray(config.include) || !config.include.includes('src/client.js')) {
    throw new Error('tsconfig.browser.json must include src/client.js')
  }
  const target = join(tempRoot, 'tsconfig.browser.json')
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`)
  return target
}

/** Parse `//#region` / `//#endregion` markers into a tree; spans are inclusive. */
function parseRegions(source) {
  const lines = source.split(/\r?\n/)
  const regions = []
  const open = []
  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(/\/\/#region\s+(.+?)\s*$/)
    if (start !== null) {
      const parent = open.length > 0 ? open[open.length - 1] : null
      const region = {
        name: start[1].trim(),
        start: index + 1,
        end: lines.length,
        depth: parent === null ? 0 : parent.depth + 1,
        parent,
        children: []
      }
      if (parent !== null) parent.children.push(region)
      regions.push(region)
      open.push(region)
      continue
    }
    if (/\/\/#endregion\b/.test(lines[index])) {
      const closed = open.pop()
      if (closed !== undefined) closed.end = index + 1
    }
  }
  return regions
}

/** Dotted path of a region, for stable JSON keys. */
function regionPath(region) {
  return region.parent === null ? region.name : `${regionPath(region.parent)} > ${region.name}`
}

/** Innermost region containing a 1-based line, or null. */
function innermostRegion(regions, line) {
  let match = null
  for (const region of regions) {
    if (line < region.start || line > region.end) continue
    if (match === null || region.depth > match.depth) match = region
  }
  return match
}

/** Diagnostics of one region subtree (innermost attribution plus descendants). */
function subtreeCount(region, byRegion) {
  let total = byRegion.get(regionPath(region)) ?? 0
  for (const child of region.children) total += subtreeCount(child, byRegion)
  return total
}

/** Plain, JSON-free region node used by the human report. */
function regionNode(region, byRegion) {
  return {
    name: region.name,
    path: regionPath(region),
    count: subtreeCount(region, byRegion),
    children: region.children.map((child) => regionNode(child, byRegion))
  }
}

/**
 * Map a tsc diagnostic file name onto its path inside the temp copy.
 *
 * tsc may print absolute paths or paths relative to its own notion of the
 * current directory (macOS `/tmp` vs `/private/tmp` makes that ambiguous), so
 * the copy is identified by the trailing `src/...` segment instead of string
 * prefix matching.
 */
function copyRelative(fileName) {
  const normalized = fileName.replaceAll('\\', '/')
  const marker = '/src/'
  const index = normalized.lastIndexOf(marker)
  if (index !== -1) return normalized.slice(index + 1)
  return normalized.startsWith('src/') ? normalized : null
}

/** Run one tsc pass over the temp copy and return the measured counts plus metadata. */
async function measure() {
  // Canonicalize the temp root: macOS reports `/var` as `/private/var` through
  // realpath, and tsc diagnostics would otherwise not match the copy paths.
  const tempRoot = realpathSync(await mkdtemp(join(tmpdir(), 'dsh-browser-typecheck-')))
  try {
    const originalText = await readFile(CLIENT_PATH, 'utf8')
    const patched = neutralizeNocheck(originalText)
    await cp(join(root, 'src'), join(tempRoot, 'src'), { recursive: true })
    // Module format detection: the repo package is `"type": "module"`; without
    // this the copied sources would be checked as CommonJS.
    await cp(PACKAGE_PATH, join(tempRoot, 'package.json'))
    const tempClientPath = join(tempRoot, 'src', 'client.js')
    await writeFile(tempClientPath, patched.text)
    const tempConfigPath = await writeTempConfig(tempRoot)

    const tscBin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')
    if (!existsSync(tscBin)) throw new Error(`TypeScript binary not found: ${tscBin} (run npm install)`)
    const startedAt = Date.now()
    const result = spawnSync(
      tscBin,
      ['-p', tempConfigPath, '--noEmit', '--pretty', 'false', '--listFiles'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        timeout: 120_000,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
      }
    )
    const elapsedMs = Date.now() - startedAt
    if (result.error !== undefined && result.error !== null) throw result.error
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    if (result.status === null) {
      throw new Error(`tsc was terminated before finishing (signal ${String(result.signal)})`)
    }

    const diagnostics = []
    let clientListed = false
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(DIAGNOSTIC_RE)
      if (match !== null) {
        diagnostics.push({
          file: match[1],
          line: Number(match[2]),
          column: Number(match[3]),
          code: match[4],
          message: match[5]
        })
        continue
      }
      const global = line.match(GLOBAL_DIAGNOSTIC_RE)
      if (global !== null) {
        diagnostics.push({ file: null, line: 0, column: 0, code: global[1], message: global[2] })
        continue
      }
      // --listFiles prints absolute paths after the diagnostics; they double as
      // proof that the copied client.js really entered the program.
      if (copyRelative(line) === 'src/client.js') clientListed = true
    }

    if (!clientListed) {
      throw new Error('tsc did not include the copied src/client.js in the program; refusing to record a baseline')
    }
    const globalDiagnostics = diagnostics.filter((diagnostic) => diagnostic.file === null)
    if (globalDiagnostics.length > 0) {
      throw new Error(`tsc reported a configuration-level diagnostic: ${globalDiagnostics[0].message}`)
    }
    if (result.status !== 0 && diagnostics.length === 0) {
      throw new Error(`tsc failed without diagnostics (exit ${String(result.status)}): ${output.trim().split('\n')[0] ?? ''}`)
    }

    const regions = parseRegions(originalText)
    const byCode = new Map()
    const byFile = new Map()
    const byRegion = new Map()
    const byFeature = new Map()
    let clientOutsideRegions = 0
    let otherFiles = 0
    for (const diagnostic of diagnostics) {
      byCode.set(diagnostic.code, (byCode.get(diagnostic.code) ?? 0) + 1)
      const file = diagnostic.file === null ? '(global)' : copyRelative(diagnostic.file) ?? diagnostic.file
      byFile.set(file, (byFile.get(file) ?? 0) + 1)
      if (file !== 'src/client.js') {
        otherFiles += 1
        continue
      }
      const region = innermostRegion(regions, diagnostic.line)
      if (region === null) {
        clientOutsideRegions += 1
        continue
      }
      const key = regionPath(region)
      byRegion.set(key, (byRegion.get(key) ?? 0) + 1)
      let top = region
      while (top.parent !== null) top = top.parent
      if (top.name.startsWith(FEATURE_PREFIX)) {
        const name = top.name.slice(FEATURE_PREFIX.length)
        byFeature.set(name, (byFeature.get(name) ?? 0) + 1)
      }
    }

    return {
      total: diagnostics.length,
      byCode: sortedCounts(byCode),
      byFile: sortedCounts(byFile),
      byFeature: sortedCounts(byFeature),
      byRegion: sortedCounts(byRegion),
      unattributed: { clientJs: clientOutsideRegions, otherFiles },
      regionTree: regions
        .filter((region) => region.parent === null)
        .map((region) => regionNode(region, byRegion)),
      clientJs: { lines: (originalText.match(/\n/g) ?? []).length, bytes: Buffer.byteLength(originalText, 'utf8') },
      typescript: await typescriptVersion(),
      gitHead: gitHead(),
      elapsedMs
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

/** Build the committed baseline document from one measurement. */
function baselineDocument(measured) {
  return {
    schemaVersion: 1,
    generatedBy: 'scripts/typecheck-browser-baseline.mjs',
    profile: 'tsconfig.browser.json',
    typescript: measured.typescript,
    generatedAt: new Date().toISOString(),
    gitHead: measured.gitHead,
    clientJs: measured.clientJs,
    total: measured.total,
    byCode: measured.byCode,
    byFile: measured.byFile,
    byFeature: measured.byFeature,
    byRegion: measured.byRegion,
    unattributed: measured.unattributed
  }
}

/** Read and validate the stored baseline. */
async function readBaseline() {
  let baseline
  try {
    baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read ${relative(root, BASELINE_PATH)}: ${error.message}; generate it with --write`)
  }
  if (baseline.schemaVersion !== 1 || typeof baseline.total !== 'number' || typeof baseline.byCode !== 'object' || baseline.byCode === null) {
    throw new Error(`${relative(root, BASELINE_PATH)} is not a schemaVersion 1 baseline; regenerate it with --write`)
  }
  return baseline
}

/** Compare a measurement with the baseline; only total and per-code overruns gate. */
function compare(measured, baseline) {
  const changed = []
  const overruns = []
  const totalDelta = measured.total - baseline.total
  if (totalDelta > 0) overruns.push(`total ${measured.total} > baseline ${baseline.total} (+${totalDelta})`)
  const codes = new Set([...Object.keys(measured.byCode), ...Object.keys(baseline.byCode)])
  for (const code of [...codes].sort()) {
    const now = measured.byCode[code] ?? 0
    const was = baseline.byCode[code] ?? 0
    if (now !== was) changed.push({ code, now, was, delta: now - was })
    if (now > was) overruns.push(`${code} ${now} > baseline ${was} (+${now - was})`)
  }
  return { totalDelta, changed, overruns }
}

/** Human report of one measurement (the stored baseline is reported by the caller). */
function report(measured) {
  const lines = []
  lines.push('browser typecheck baseline (tsconfig.browser.json: DOM lib, types: [], src/browser/dom.d.ts excluded)')
  lines.push(`  typescript           ${measured.typescript}`)
  lines.push(`  src/client.js        ${measured.clientJs.lines} lines, ${measured.clientJs.bytes} bytes`)
  lines.push(`  git HEAD             ${measured.gitHead} (informational)`)
  lines.push(`  tsc                  ${(measured.elapsedMs / 1000).toFixed(2)}s (one run)`)
  lines.push('')
  lines.push(`diagnostics: ${measured.total}`)
  for (const [code, count] of Object.entries(measured.byCode)) {
    lines.push(`  ${code.padEnd(8)} ${String(count).padStart(5)}`)
  }
  lines.push('')
  lines.push('feature regions (top-level //#region feature:, incl. nested regions)')
  const features = measured.regionTree
    .filter((region) => region.name.startsWith(FEATURE_PREFIX))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
  const featureName = (feature) =>
    feature.name.startsWith(FEATURE_PREFIX) ? feature.name.slice(FEATURE_PREFIX.length) : feature.name
  const featureWidth = Math.max(
    42,
    ...features.map((feature) => featureName(feature).length),
    ...features.flatMap((feature) => feature.children.map((child) => featureName(child).length + 5))
  )
  for (const feature of features) {
    lines.push(`  ${featureName(feature).padEnd(featureWidth)} ${String(feature.count).padStart(5)}`)
    for (const child of feature.children) {
      lines.push(`    -> ${featureName(child).padEnd(featureWidth - 5)} ${String(child.count).padStart(5)}`)
    }
  }
  const nonFeature = measured.regionTree
    .filter((region) => !region.name.startsWith(FEATURE_PREFIX))
    .map((region) => [region.name, region.count])
    .filter(([, count]) => count > 0)
  lines.push(
    `  ${'non-feature regions'.padEnd(featureWidth)} ${nonFeature.length === 0 ? '0 (none hit)' : nonFeature.map(([name, count]) => `${name} ${count}`).join(', ')}`
  )
  lines.push(`  ${'client.js outside all regions'.padEnd(featureWidth)} ${String(measured.unattributed.clientJs).padStart(5)}`)
  lines.push(`  ${'other files'.padEnd(featureWidth)} ${String(measured.unattributed.otherFiles).padStart(5)}`)
  const otherFiles = Object.entries(measured.byFile)
    .filter(([file]) => file !== 'src/client.js')
    .slice(0, 5)
  if (otherFiles.length > 0) {
    lines.push(`  top other files: ${otherFiles.map(([file, count]) => `${file} ${count}`).join(', ')}`)
  }
  return lines.join('\n')
}

/** Entry point; returns the process exit code. */
async function main() {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => !['--check', '--write', '--help', '-h'].includes(arg))
  if (unknown.length > 0) throw new Error(`unknown argument: ${unknown[0]}\n\n${USAGE}`)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE)
    return 0
  }
  if (args.includes('--check') && args.includes('--write')) {
    throw new Error(`--check and --write cannot be combined\n\n${USAGE}`)
  }
  const mode = args.includes('--check') ? 'check' : args.includes('--write') ? 'write' : 'report'

  const measured = await measure()
  const stored = mode === 'write' ? null : existsSync(BASELINE_PATH) ? await readBaseline() : null
  console.log(report(measured))

  if (mode === 'check' && stored === null) {
    console.error(`[ratchet] no baseline at ${relative(root, BASELINE_PATH)}; generate it with --write`)
    return 2
  }

  if (mode === 'write' || stored === null) {
    const document = baselineDocument(measured)
    await writeFile(BASELINE_PATH, `${JSON.stringify(document, null, 2)}\n`)
    console.log('')
    console.log(`wrote ${relative(root, BASELINE_PATH)} (total ${document.total}, HEAD ${document.gitHead})`)
    return 0
  }

  const { changed, overruns, totalDelta } = compare(measured, stored)
  console.log('')
  console.log(`baseline: ${relative(root, BASELINE_PATH)} (total ${stored.total}, ${stored.generatedAt}, HEAD ${stored.gitHead})`)

  if (mode === 'check') {
    console.log(`ratchet: total ${measured.total}, baseline ${stored.total} (${totalDelta > 0 ? '+' : ''}${totalDelta})`)
    if (changed.length === 0) {
      console.log('ratchet: per-code deltas: none')
    } else {
      for (const change of changed) {
        console.log(`ratchet: ${change.code} ${change.was} -> ${change.now} (${change.delta > 0 ? '+' : ''}${change.delta})`)
      }
    }
    if (overruns.length > 0) {
      for (const overrun of overruns) console.error(`[ratchet] ${overrun}`)
      console.error('[ratchet] FAIL: counters above baseline; fix the regressions or, for a deliberate increase, refresh with --write')
      return 1
    }
    console.log('[ratchet] ok: no counter above baseline')
    return 0
  }

  if (totalDelta === 0) {
    console.log('delta: total 0 (matches baseline)')
  } else {
    console.log(`delta: total ${totalDelta > 0 ? '+' : ''}${totalDelta} vs baseline`)
    if (overruns.length > 0) console.log('note: above baseline; --check would fail (default mode exits 0)')
  }
  return 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(`[browser-baseline] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  })
