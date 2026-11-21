/**
 * Docs consistency guard for claims that have one machine source of truth.
 *
 * The docs-links gate only proves that a link resolves, so a README install
 * pin, a published-release sentence or a harness scenario count can silently
 * describe a version or suite size that no longer exists. These assertions pin
 * those claims to `package.json` and to `SCENARIO_ORDER`. They are a tripwire,
 * not a proof of accuracy — the as-built audit in
 * `.agents/skills/sync-power-suite-docs` still owns prose, screenshots and
 * environment-version claims.
 *
 * When one of these fails, fix the doc (or the single source it quotes). Do not
 * relax the assertion to make it pass.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')
const version = JSON.parse(read('package.json')).version
const escaped = version.replaceAll('.', '\\.')
const semver = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?`

/** Assert that every match of `pattern` captures exactly one version, `version`. */
function assertVersionClaims(file, pattern, minimum) {
  const claims = [...read(file).matchAll(pattern)]
  assert.ok(claims.length >= minimum, `${file}: expected at least ${minimum} claim(s) for ${pattern}, found ${claims.length}`)
  for (const claim of claims) {
    assert.equal(claim[1], version, `${file}: claims "${claim[0].trim()}" but package.json is ${version}`)
  }
}

test('README install pins and status callouts quote the package version', () => {
  for (const file of ['README.md', 'README.zh.md']) {
    const text = read(file)
    const pins = [...text.matchAll(new RegExp(`@zephinel/dsh-power-suite@(${semver})`, 'gu'))]
    assert.ok(pins.length >= 3, `${file}: expected the status callout plus the CLI and UI install routes, found ${pins.length} pin(s)`)
    for (const pin of pins) {
      assert.equal(pin[1], version, `${file} pins ${pin[0]} but package.json is ${version}`)
    }
    const installLines = text.split('\n').filter((line) => /dsh plugin --profile web add|Add plugin|添加插件/u.test(line))
    assert.ok(installLines.length >= 2, `${file}: expected the CLI and in-app install lines`)
    for (const line of installLines) {
      assert.match(line, new RegExp(`@zephinel/dsh-power-suite@${escaped}(?![0-9A-Za-z.-])`, 'u'), `${file}: install line does not pin ${version}: ${line}`)
    }
  }
})

test('README status callouts name the package version', () => {
  assert.match(
    read('README.md'),
    new RegExp(`\`@zephinel/dsh-power-suite@${escaped}\` is published on npm`, 'u'),
    `README.md status callout must say @zephinel/dsh-power-suite@${version} is published on npm`,
  )
  assert.match(
    read('README.zh.md'),
    new RegExp(`\`@zephinel/dsh-power-suite@${escaped}\` 已发布到 npm`, 'u'),
    `README.zh.md status callout must say @zephinel/dsh-power-suite@${version} 已发布到 npm`,
  )
})

test('docs release-state sentences quote the package version', () => {
  const claims = [
    ['docs/development.md', /published release on npm is \*\*([^*]+)\*\*/gu, 1],
    ['docs/development.md', /`package\.json` stays at `([^`]+)`/gu, 1],
    ['docs/limitations.md', /published on npm as `([^`]+)`/gu, 1],
    ['docs/limitations.md', /`([^`]+)`\) is its own `latest`/gu, 1],
    ['docs/update-check.md', /current published release\s*\(\s*`([^`]+)`\s*\)/gu, 1],
    ['docs/update-check.md', /current `latest`\s*\(\s*`([^`]+)`\s*\)/gu, 1],
  ]
  for (const [file, pattern, minimum] of claims) assertVersionClaims(file, pattern, minimum)
})

test('the lockfile root version follows package.json', () => {
  const lock = JSON.parse(read('package-lock.json'))
  assert.equal(lock.version, version, `package-lock.json version is ${lock.version}, package.json is ${version}`)
  assert.equal(lock.packages[''].version, version, `package-lock.json packages[""].version is ${lock.packages[''].version}`)
})

test('harness README scenario counts and ranges match SCENARIO_ORDER', () => {
  const harness = read('test/browser/annotation.e2e.mjs')
  const order = harness.match(/const SCENARIO_ORDER = \[([^\]]*)\]/u)
  assert.ok(order, 'SCENARIO_ORDER was not found in annotation.e2e.mjs')
  const ids = order[1].split(',').map((entry) => Number(entry.trim())).filter((entry) => Number.isInteger(entry))
  assert.ok(ids.length > 0, 'SCENARIO_ORDER is empty')
  assert.deepEqual([...ids].sort((left, right) => left - right), ids, 'SCENARIO_ORDER must be ascending')
  assert.equal(new Set(ids).size, ids.length, 'SCENARIO_ORDER must not repeat an id')
  const last = ids.at(-1)
  const readme = read('test/browser/README.md')

  const countPatterns = [/(\d+) acceptance scenarios/gu, /smoke \+ (\d+) scenarios/gu, /Runs the (\d+) scenarios/gu]
  for (const pattern of countPatterns) {
    const counts = [...readme.matchAll(pattern)]
    assert.ok(counts.length >= 1, `the harness README no longer states ${pattern}`)
    for (const count of counts) {
      assert.equal(Number(count[1]), ids.length, `harness README says "${count[0]}" but SCENARIO_ORDER has ${ids.length} ids`)
    }
  }

  const ranges = [...readme.matchAll(/SCENARIO_ORDER`?\s+1\.\.(\d+)/gu)]
  assert.ok(ranges.length >= 1, 'the harness README no longer states the SCENARIO_ORDER 1..N range')
  for (const range of ranges) {
    assert.equal(Number(range[1]), last, `harness README says "${range[0]}" but the last id is ${last}`)
  }

  // `--from N` runs every id >= N, so the usage line must not describe a subset.
  const fromLine = readme.split('\n').find((line) => line.includes('--from 7'))
  if (fromLine !== undefined) {
    assert.match(fromLine, new RegExp(`7-${last}\\b`, 'u'), `the --from usage line must say 7-${last}: ${fromLine}`)
  }

  // A usage-error example must name an id beyond the valid range.
  for (const line of readme.split('\n')) {
    if (!/usage[/ ](?:argument )?errors?|invalid selections?/iu.test(line)) continue
    for (const match of line.matchAll(/--(?:scenario|from) (\d+)/gu)) {
      assert.ok(Number(match[1]) > last, `${match[0]} is a valid id (1..${last}); usage-error examples must exceed ${last}: ${line}`)
    }
  }
})
