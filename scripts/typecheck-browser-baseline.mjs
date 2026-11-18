#!/usr/bin/env node
/**
 * Browser-profile typecheck and its zero-diagnostic ratchet.
 *
 * `tsconfig.json` checks the Host half, and since M5c it also checks the
 * browser entry and modules with the ES2023 lib plus the minimal
 * `src/browser/dom.d.ts` shim. This script owns the *browser* profile
 * (`tsconfig.browser.json`: DOM/DOM.Iterable, `types: []`, the shim excluded)
 * and keeps the count at zero, attributed per `//#region` so a regression
 * points at its feature.
 *
 * Modes:
 *   (default)  measure, report, and exit 0. Writes the baseline only when the
 *              baseline file is missing; an existing baseline is never
 *              overwritten, so an ordinary run cannot silently loosen it.
 *   --write    measure and overwrite scripts/browser-typecheck-baseline.json.
 *   --check    exit 1 when the measured total or one TS-code count is greater
 *              than the stored baseline. HEAD and client.js size are reported
 *              but never gate.
 *
 * Exit codes: 0 ok, 1 ratchet regression (--check only), 2 harness error.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = join(root, 'scripts', 'browser-typecheck-baseline.json')
const BROWSER_TSCONFIG_PATH = join(root, 'tsconfig.browser.json')
const CLIENT_PATH = join(root, 'src', 'client.js')
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
 * Map a tsc diagnostic file name onto its path inside the worktree.
 *
 * tsc prints absolute paths for the project files; macOS `/tmp` vs
 * `/private/tmp` makes prefix matching ambiguous, so the trailing `src/...`
 * segment is used instead.
 */
function sourceRelative(fileName) {
  const normalized = fileName.replaceAll('\\', '/')
  const marker = '/src/'
  const index = normalized.lastIndexOf(marker)
  if (index !== -1) return normalized.slice(index + 1)
  return normalized.startsWith('src/') ? normalized : null
}

/** Run one tsc pass over the browser profile and return the measured counts plus metadata. */
async function measure() {
  if (!existsSync(BROWSER_TSCONFIG_PATH)) throw new Error('tsconfig.browser.json is missing')
  const clientText = await readFile(CLIENT_PATH, 'utf8')
  const tscBin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')
  if (!existsSync(tscBin)) throw new Error(`TypeScript binary not found: ${tscBin} (run npm install)`)

  const startedAt = Date.now()
  const result = spawnSync(
    tscBin,
    ['-p', BROWSER_TSCONFIG_PATH, '--noEmit', '--pretty', 'false', '--listFiles'],
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
    // --listFiles prints the compiled program; it doubles as proof that the
    // browser entry really entered this profile.
    if (sourceRelative(line) === 'src/client.js') clientListed = true
  }

  if (!clientListed) {
    throw new Error('tsc did not include src/client.js in the browser program; refusing to record a baseline')
  }
  const globalDiagnostics = diagnostics.filter((diagnostic) => diagnostic.file === null)
  if (globalDiagnostics.length > 0) {
    throw new Error(`tsc reported a configuration-level diagnostic: ${globalDiagnostics[0].message}`)
  }
  if (result.status !== 0 && diagnostics.length === 0) {
    throw new Error(`tsc failed without diagnostics (exit ${String(result.status)}): ${output.trim().split('\n')[0] ?? ''}`)
  }

  const regions = parseRegions(clientText)
  const byCode = new Map()
  const byFile = new Map()
  const byRegion = new Map()
  const byFeature = new Map()
  let clientOutsideRegions = 0
  let otherFiles = 0
  for (const diagnostic of diagnostics) {
    byCode.set(diagnostic.code, (byCode.get(diagnostic.code) ?? 0) + 1)
    const file = diagnostic.file === null ? '(global)' : sourceRelative(diagnostic.file) ?? diagnostic.file
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
    clientJs: { lines: (clientText.match(/\n/g) ?? []).length, bytes: Buffer.byteLength(clientText, 'utf8') },
    typescript: await typescriptVersion(),
    gitHead: gitHead(),
    elapsedMs
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
  lines.push('browser typecheck (tsconfig.browser.json: DOM lib, types: [], src/browser/dom.d.ts excluded)')
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
  console.log(`baseline: ${relative(root, BASELINE_PATH)} (total ${stored.total})`)
  for (const change of changed) {
    console.log(`  ${change.code}: ${change.was} -> ${change.now} (${change.delta >= 0 ? '+' : ''}${change.delta})`)
  }
  if (mode === 'check') {
    if (overruns.length > 0) {
      console.error('')
      for (const overrun of overruns) console.error(`[ratchet] ${overrun}`)
      return 1
    }
    console.log(`ratchet: ok (${measured.total} diagnostics, baseline ${stored.total})`)
    return 0
  }
  console.log(`total: ${measured.total} (${totalDelta >= 0 ? '+' : ''}${totalDelta} vs baseline ${stored.total})`)
  return 0
}

main().then(
  (code) => { process.exitCode = code },
  (error) => {
    console.error(`[typecheck-browser] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
)
