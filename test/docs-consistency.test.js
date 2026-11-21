/**
 * Docs consistency guard for claims that have one machine source of truth.
 *
 * The docs-links gate only proves that a link resolves, and `npm run check`
 * never reads prose. These assertions pin the claims that silently rot between
 * releases: the published-version sentences in the README/docs and the
 * annotation harness's scenario counts. They are a tripwire, not a proof of
 * accuracy — the as-built audit in `.agents/skills/sync-power-suite-docs` still
 * owns prose, screenshots and environment-version claims.
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

/** Every `@zephinel/dsh-power-suite@<version>` pin in a file must match package.json. */
test('README install pins quote the package version', () => {
  for (const file of ['README.md', 'README.zh.md']) {
    const pins = [...read(file).matchAll(/@zephinel\/dsh-power-suite@([0-9]+\.[0-9]+\.[0-9]+)/gu)]
    assert.ok(pins.length > 0, `${file} has no versioned install pin`)
    for (const pin of pins) {
      assert.equal(pin[1], version, `${file} pins ${pin[0]} but package.json is ${version}`)
    }
  }
})

/** The status callouts name the published release, not a development snapshot. */
test('README status callouts quote the package version', () => {
  assert.match(
    read('README.md'),
    new RegExp(`\`@zephinel/dsh-power-suite@${version.replaceAll('.', '\\.')}\` is published on npm`, 'u'),
    `README.md status callout must say @zephinel/dsh-power-suite@${version} is published on npm`,
  )
  assert.match(
    read('README.zh.md'),
    new RegExp(`\`@zephinel/dsh-power-suite@${version.replaceAll('.', '\\.')}\` 已发布到 npm`, 'u'),
    `README.zh.md status callout must say @zephinel/dsh-power-suite@${version} 已发布到 npm`,
  )
})

/** These pages repeat the published version in prose; each copy must agree. */
test('docs release-state sentences quote the package version', () => {
  const escaped = version.replaceAll('.', '\\.')
  const claims = [
    ['docs/development.md', new RegExp(`published release on npm is \\*\\*${escaped}\\*\\*`, 'u')],
    ['docs/limitations.md', new RegExp(`published on npm as \`${escaped}\``, 'u')],
    ['docs/limitations.md', new RegExp(`\`${escaped}\`\\) is its own \`latest\``, 'u')],
    ['docs/update-check.md', new RegExp(`current published release\\s*\\(\\s*\`${escaped}\`\\)`, 'u')],
    ['docs/update-check.md', new RegExp(`current \`latest\`\\s*\\(\\s*\`${escaped}\`\\)`, 'u')],
  ]
  for (const [file, pattern] of claims) {
    assert.match(read(file), pattern, `${file} does not name ${version} in: ${pattern}`)
  }
})

/** The harness README's counts must match SCENARIO_ORDER, not an older round. */
test('harness README scenario counts match SCENARIO_ORDER', () => {
  const harness = read('test/browser/annotation.e2e.mjs')
  const order = harness.match(/const SCENARIO_ORDER = \[([^\]]*)\]/u)
  assert.ok(order, 'SCENARIO_ORDER was not found in annotation.e2e.mjs')
  const ids = order[1].split(',').map((entry) => Number(entry.trim()))
  assert.ok(ids.length > 0, 'SCENARIO_ORDER is empty')
  const total = ids.length
  const readme = read('test/browser/README.md')

  const counts = [
    ...readme.matchAll(/(\d+) acceptance scenarios/gu),
    ...readme.matchAll(/smoke \+ (\d+) scenarios/gu),
    ...readme.matchAll(/Runs the (\d+) scenarios/gu),
  ]
  assert.ok(counts.length > 0, 'the harness README no longer states a scenario count')
  for (const match of counts) {
    assert.equal(Number(match[1]), total, `harness README says "${match[0]}" but SCENARIO_ORDER has ${total} ids`)
  }

  // `--from N` runs every id >= N, so the usage line must not describe a subset.
  const fromLine = readme.split('\n').find((line) => line.includes('--from 7'))
  if (fromLine !== undefined) {
    assert.match(fromLine, new RegExp(`7-${ids.at(-1)}`, 'u'), `the --from usage line must say 7-${ids.at(-1)}: ${fromLine}`)
  }
})
