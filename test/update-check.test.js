import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  compareStableVersions,
  isNewerStableVersion,
  parseStableVersion
} from '../src/features/update-check/version.ts'
import {
  parseHighlights,
  releaseNotesUrl,
  releaseNotesVariant,
  repositorySlug
} from '../src/features/update-check/release-notes.ts'
import {
  createUpdateChecker,
  installedVersion,
  releaseNotesRepository
} from '../src/features/update-check/checker.ts'
import { UPDATE_ROUTE, installUpdateCheck } from '../src/features/update-check/host.ts'

const repoManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const REGISTRY_URL = 'https://registry.npmjs.org/@zephinel%2Fdsh-power-suite/latest'
const DEFAULT_NOTES_URL = 'https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v0.2.0/release-notes/0.2.0.md'
const ENGLISH_NOTES_URL = 'https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v0.2.0/release-notes/0.2.0.en.md'
const DEFAULT_NOTES = '## Highlights\n- `侧栏` [更新](https://example.com) 提示\n- **第二**点\n\n## Details\n- 不算要点\n'
const ENGLISH_NOTES = '## Highlights\n- English point one\n- English point two\n'

/** Temporary manifest directories created by one test. */
const tempDirectories = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** Write one throwaway package.json and return its `file:` URL. */
function manifestUrl(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'power-suite-update-'))
  tempDirectories.push(directory)
  const manifest = {
    name: '@zephinel/dsh-power-suite',
    version: '0.1.0',
    repository: { type: 'git', url: 'git+https://github.com/Zephinel/dsh-power-suite.git' },
    ...overrides
  }
  const file = join(directory, 'package.json')
  writeFileSync(file, JSON.stringify(manifest))
  return pathToFileURL(file)
}

/** Fake Response carrying one JSON payload. */
function jsonResponse(payload) {
  return { ok: true, status: 200, async json() { return payload } }
}

/** Fake Response carrying one text body. */
function textResponse(text) {
  return { ok: true, status: 200, async text() { return text } }
}

/** Fake Response answering 404 without a body. */
function missingResponse() {
  return { ok: false, status: 404, async text() { return '' } }
}

/** Fake fetch for the registry + raw notes reads; records every URL and init. */
function stubFetch(options = {}) {
  const {
    version = '0.2.0',
    registryError = false,
    registryStatus = 200,
    notes = DEFAULT_NOTES,
    notesError = false,
    englishNotes = ENGLISH_NOTES,
    englishError = false
  } = options
  const calls = []
  const requests = []
  const fetchImpl = async (url, init) => {
    const address = String(url)
    calls.push(address)
    requests.push(init)
    if (address.includes('registry.npmjs.org')) {
      if (registryError) throw new Error('offline')
      if (registryStatus !== 200) return { ok: false, status: registryStatus, async json() { return {} } }
      return jsonResponse({ version })
    }
    if (address.includes('raw.githubusercontent.com')) {
      const english = address.endsWith('.en.md')
      if (english ? englishError : notesError) return missingResponse()
      return textResponse(english ? englishNotes : notes)
    }
    throw new Error(`unexpected fetch: ${address}`)
  }
  return { calls, requests, fetchImpl }
}

/** Deterministic clock in epoch ms. */
function fakeClock(start = 0) {
  let time = start
  return { now: () => time, advance: (ms) => { time += ms } }
}

test('parseStableVersion accepts strict x.y.z only', () => {
  assert.deepEqual(parseStableVersion('0.2.0'), { major: 0, minor: 2, patch: 0 })
  assert.deepEqual(parseStableVersion(' 12.3.40 '), { major: 12, minor: 3, patch: 40 })
  assert.equal(parseStableVersion('0.2.0-rc.1'), undefined)
  assert.equal(parseStableVersion('0.2.0+build'), undefined)
  assert.equal(parseStableVersion('v0.2.0'), undefined)
  assert.equal(parseStableVersion('1.2'), undefined)
  assert.equal(parseStableVersion(''), undefined)
  assert.equal(parseStableVersion(0.2), undefined)
  assert.equal(parseStableVersion(undefined), undefined)
  assert.equal(parseStableVersion(null), undefined)
})

test('compareStableVersions orders numerically and rejects unstable input', () => {
  assert.equal(compareStableVersions('0.1.0', '0.2.0'), -1)
  assert.equal(compareStableVersions('1.0.0', '0.9.9'), 1)
  assert.equal(compareStableVersions('0.5.9', '0.5.10'), -1)
  assert.equal(compareStableVersions('0.2.0', '0.2.0'), 0)
  assert.equal(compareStableVersions('0.1.0-rc.1', '0.1.0'), undefined)
  assert.equal(compareStableVersions('0.1.0', 'not-a-version'), undefined)
})

test('isNewerStableVersion only accepts a newer stable latest', () => {
  assert.equal(isNewerStableVersion('0.2.0', '0.1.0'), true)
  assert.equal(isNewerStableVersion('0.1.0', '0.2.0'), false)
  assert.equal(isNewerStableVersion('0.1.0', '0.1.0'), false)
  assert.equal(isNewerStableVersion('0.2.0-rc.1', '0.1.0'), false)
  assert.equal(isNewerStableVersion('0.2.0', '0.1.0-rc.1'), false)
  assert.equal(isNewerStableVersion(null, '0.1.0'), false)
})

test('parseHighlights keeps only the Highlights bullets, as plain text', () => {
  assert.deepEqual(parseHighlights(DEFAULT_NOTES), ['侧栏 更新 提示', '第二点'])
  assert.deepEqual(parseHighlights('## HIGHLIGHTS\n- **粗体**与`代码`\n'), ['粗体与代码'])
  assert.deepEqual(parseHighlights('## Highlights\r\n- crlf point\r\n'), ['crlf point'])
})

test('parseHighlights stops at the next heading and accepts ordered bullets', () => {
  const markdown = '## Highlights\n1. one\n2. **two**\n### nested heading\n- not included\n\n## Next\n- skipped\n'
  assert.deepEqual(parseHighlights(markdown), ['one', 'two'])
  assert.deepEqual(parseHighlights('## Details\n- nope\n'), [])
  assert.deepEqual(parseHighlights(''), [])
  assert.deepEqual(parseHighlights(undefined), [])
})

test('parseHighlights has no cap of its own', () => {
  const markdown = ['## Highlights', ...Array.from({ length: 9 }, (_, index) => `- point ${index + 1}`)].join('\n')
  assert.equal(parseHighlights(markdown).length, 9)
})

test('releaseNotesVariant treats every English locale prefix as English', () => {
  assert.equal(releaseNotesVariant('en'), 'en')
  assert.equal(releaseNotesVariant('en-US'), 'en')
  assert.equal(releaseNotesVariant('EN-gb'), 'en')
  assert.equal(releaseNotesVariant('zh'), 'default')
  assert.equal(releaseNotesVariant('zh-CN'), 'default')
  assert.equal(releaseNotesVariant(''), 'default')
  assert.equal(releaseNotesVariant(null), 'default')
  assert.equal(releaseNotesVariant(undefined), 'default')
  assert.equal(releaseNotesVariant(42), 'default')
})

test('releaseNotesUrl builds the tag-pinned default and English URLs', () => {
  assert.equal(
    releaseNotesUrl('Zephinel/dsh-power-suite', '0.2.0'),
    'https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v0.2.0/release-notes/0.2.0.md'
  )
  assert.equal(
    releaseNotesUrl('Zephinel/dsh-power-suite', '0.2.0', 'default'),
    'https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v0.2.0/release-notes/0.2.0.md'
  )
  assert.equal(
    releaseNotesUrl('Zephinel/dsh-power-suite', '0.2.0', 'en'),
    'https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v0.2.0/release-notes/0.2.0.en.md'
  )
})

test('repositorySlug normalizes the package.json repository forms', () => {
  assert.equal(repositorySlug('git+https://github.com/Zephinel/dsh-power-suite.git'), 'Zephinel/dsh-power-suite')
  assert.equal(repositorySlug({ type: 'git', url: 'git+https://github.com/Zephinel/dsh-power-suite.git' }), 'Zephinel/dsh-power-suite')
  assert.equal(repositorySlug('git@github.com:Zephinel/dsh-power-suite.git'), 'Zephinel/dsh-power-suite')
  assert.equal(repositorySlug('https://github.com/Zephinel/dsh-power-suite'), 'Zephinel/dsh-power-suite')
  assert.equal(repositorySlug('https://github.com/Zephinel/dsh-power-suite/'), 'Zephinel/dsh-power-suite')
  assert.equal(repositorySlug('https://gitlab.com/Zephinel/dsh-power-suite'), undefined)
  assert.equal(repositorySlug('not a repository'), undefined)
  assert.equal(repositorySlug({ url: 42 }), undefined)
  assert.equal(repositorySlug(undefined), undefined)
  assert.equal(repositorySlug(null), undefined)
})

test('the shipped manifest supplies the running version and notes repository', () => {
  const expected = parseStableVersion(repoManifest.version) === undefined ? undefined : repoManifest.version
  assert.equal(installedVersion(), expected)
  assert.equal(releaseNotesRepository(), repositorySlug(repoManifest.repository))
  assert.equal(releaseNotesRepository(), 'Zephinel/dsh-power-suite')
})

test('a successful check is cached for six hours', async () => {
  const { calls, requests, fetchImpl } = stubFetch()
  const clock = fakeClock()
  const check = createUpdateChecker({ fetchImpl, now: clock.now, manifestUrl: manifestUrl() })
  const expected = { current: '0.1.0', latest: '0.2.0', updateAvailable: true, highlights: ['侧栏 更新 提示', '第二点'] }
  assert.deepEqual(await check('zh'), expected)
  assert.deepEqual(calls, [REGISTRY_URL, DEFAULT_NOTES_URL])
  assert.equal(requests.length, 2)
  assert.ok(requests.every((init) => init.signal instanceof AbortSignal), 'each read carries a timeout signal')
  clock.advance(6 * 60 * 60_000 - 1)
  assert.deepEqual(await check('zh'), expected)
  assert.equal(calls.length, 2, 'the successful answer is cached')
  clock.advance(1)
  assert.deepEqual(await check('zh'), expected)
  assert.equal(calls.length, 4, 'the successful answer expires after six hours')
})

test('a successful answer carries at most six highlights', async () => {
  const notes = ['## Highlights', ...Array.from({ length: 8 }, (_, index) => `- point ${index + 1}`)].join('\n')
  const { fetchImpl } = stubFetch({ notes })
  const check = createUpdateChecker({ fetchImpl, manifestUrl: manifestUrl() })
  const view = await check()
  assert.deepEqual(view.highlights, ['point 1', 'point 2', 'point 3', 'point 4', 'point 5', 'point 6'])
})

test('a registry failure answers latest null and retries after five minutes', async () => {
  for (const failure of [{ registryError: true }, { registryStatus: 503 }]) {
    const { calls, fetchImpl } = stubFetch(failure)
    const clock = fakeClock(1_000)
    const check = createUpdateChecker({ fetchImpl, now: clock.now, manifestUrl: manifestUrl() })
    const failed = { current: '0.1.0', latest: null, updateAvailable: false, highlights: [] }
    assert.deepEqual(await check('zh'), failed)
    clock.advance(5 * 60_000 - 1)
    assert.deepEqual(await check('zh'), failed)
    assert.equal(calls.length, 1, 'the failed answer is cached')
    clock.advance(1)
    assert.deepEqual(await check('zh'), failed)
    assert.equal(calls.length, 2, 'the registry is retried after the failure TTL')
  }
})

test('an update whose notes cannot be read keeps the update and retries on the failure TTL', async () => {
  const missing = stubFetch({ notesError: true })
  const clock = fakeClock()
  const missingCheck = createUpdateChecker({ fetchImpl: missing.fetchImpl, now: clock.now, manifestUrl: manifestUrl() })
  const expected = { current: '0.1.0', latest: '0.2.0', updateAvailable: true, highlights: [] }
  assert.deepEqual(await missingCheck(), expected)
  assert.deepEqual(missing.calls, [REGISTRY_URL, DEFAULT_NOTES_URL])
  clock.advance(5 * 60_000 - 1)
  assert.deepEqual(await missingCheck(), expected)
  assert.equal(missing.calls.length, 2, 'the failure TTL is not over yet')
  clock.advance(1)
  assert.deepEqual(await missingCheck(), expected)
  assert.equal(missing.calls.length, 4, 'unread notes are retried after the failure TTL')

  const empty = stubFetch({ notes: '## Details\n- hidden\n' })
  const emptyCheck = createUpdateChecker({ fetchImpl: empty.fetchImpl, manifestUrl: manifestUrl() })
  assert.deepEqual(await emptyCheck(), expected)
  assert.equal(empty.calls.length, 2, 'notes without Highlights count as unread')
})

test('an English client reads the English notes and each variant caches separately', async () => {
  const { calls, fetchImpl } = stubFetch()
  const check = createUpdateChecker({ fetchImpl, manifestUrl: manifestUrl() })
  assert.deepEqual((await check('zh-CN')).highlights, ['侧栏 更新 提示', '第二点'])
  assert.deepEqual(calls, [REGISTRY_URL, DEFAULT_NOTES_URL])
  assert.deepEqual((await check('en-US')).highlights, ['English point one', 'English point two'])
  assert.deepEqual(calls, [REGISTRY_URL, DEFAULT_NOTES_URL, REGISTRY_URL, ENGLISH_NOTES_URL])
  await check('zh')
  await check('en')
  assert.equal(calls.length, 4, 'both variants are cached after their first read')
})

test('an English request falls back to the default notes when English notes are unusable', async () => {
  const missing = stubFetch({ englishError: true })
  const missingCheck = createUpdateChecker({ fetchImpl: missing.fetchImpl, manifestUrl: manifestUrl() })
  assert.deepEqual((await missingCheck('en-US')).highlights, ['侧栏 更新 提示', '第二点'])
  assert.deepEqual(missing.calls, [REGISTRY_URL, ENGLISH_NOTES_URL, DEFAULT_NOTES_URL])

  const empty = stubFetch({ englishNotes: '## Details\n- English hidden\n' })
  const emptyCheck = createUpdateChecker({ fetchImpl: empty.fetchImpl, manifestUrl: manifestUrl() })
  assert.deepEqual((await emptyCheck('en')).highlights, ['侧栏 更新 提示', '第二点'])
  assert.deepEqual(empty.calls, [REGISTRY_URL, ENGLISH_NOTES_URL, DEFAULT_NOTES_URL])
})

test('concurrent checks share one in-flight read', async () => {
  const calls = []
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const fetchImpl = async (url) => {
    calls.push(String(url))
    if (String(url).includes('registry.npmjs.org')) {
      await gate
      return jsonResponse({ version: '0.2.0' })
    }
    return textResponse(DEFAULT_NOTES)
  }
  const check = createUpdateChecker({ fetchImpl, now: () => 0, manifestUrl: manifestUrl() })
  const first = check('zh')
  const second = check('zh')
  release()
  const [a, b] = await Promise.all([first, second])
  assert.deepEqual(a, b)
  assert.deepEqual(calls, [REGISTRY_URL, DEFAULT_NOTES_URL])
})

test('the checker never rejects, whatever the fetch does', async () => {
  const scenarios = [
    () => { throw new Error('sync throw') },
    () => Promise.reject(new Error('rejected')),
    async () => ({ ok: false, status: 500, async json() { return {} } }),
    async () => ({ ok: true, status: 200, async json() { throw new SyntaxError('bad json') } }),
    async () => undefined
  ]
  for (const fetchImpl of scenarios) {
    const check = createUpdateChecker({ fetchImpl, now: () => 0, manifestUrl: manifestUrl() })
    assert.deepEqual(await check('en'), { current: '0.1.0', latest: null, updateAvailable: false, highlights: [] })
  }
})

test('a prerelease or equal latest is not an update target', async () => {
  const prerelease = stubFetch({ version: '0.2.0-rc.1' })
  const prereleaseCheck = createUpdateChecker({ fetchImpl: prerelease.fetchImpl, manifestUrl: manifestUrl() })
  assert.deepEqual(await prereleaseCheck(), {
    current: '0.1.0',
    latest: null,
    updateAvailable: false,
    highlights: []
  })
  assert.deepEqual(prerelease.calls, [REGISTRY_URL], 'no notes are read without an update')

  const equal = stubFetch({ version: '0.1.0' })
  const equalCheck = createUpdateChecker({ fetchImpl: equal.fetchImpl, manifestUrl: manifestUrl() })
  assert.deepEqual(await equalCheck(), {
    current: '0.1.0',
    latest: '0.1.0',
    updateAvailable: false,
    highlights: []
  })
  assert.deepEqual(equal.calls, [REGISTRY_URL])
})

test('a prerelease or unreadable running version never offers an update', async () => {
  const prerelease = stubFetch()
  const prereleaseCheck = createUpdateChecker({
    fetchImpl: prerelease.fetchImpl,
    manifestUrl: manifestUrl({ version: '0.1.0-rc.1' })
  })
  assert.deepEqual(await prereleaseCheck(), {
    current: '0.0.0',
    latest: '0.2.0',
    updateAvailable: false,
    highlights: []
  })
  assert.deepEqual(prerelease.calls, [REGISTRY_URL])
  assert.equal(installedVersion(manifestUrl({ version: '0.1.0-rc.1' })), undefined)

  const missing = stubFetch()
  const missingManifest = pathToFileURL(join(tmpdir(), 'power-suite-update-missing', 'package.json'))
  const missingCheck = createUpdateChecker({ fetchImpl: missing.fetchImpl, manifestUrl: missingManifest })
  assert.deepEqual(await missingCheck(), {
    current: '0.0.0',
    latest: null,
    updateAvailable: false,
    highlights: []
  })
  assert.deepEqual(missing.calls, [], 'an unreadable manifest cannot address the registry')
})

test('the host route registers one GET route and answers no-store JSON', async () => {
  const savedFetch = globalThis.fetch
  const { calls, fetchImpl } = stubFetch({ version: '99.0.0' })
  globalThis.fetch = fetchImpl
  try {
    const registrations = []
    const labels = []
    installUpdateCheck({
      effect(fn, label) {
        labels.push(label)
        return fn()
      },
      connection: {
        fetch: {
          register(route) {
            registrations.push(route)
            return async () => {}
          }
        }
      }
    })
    assert.equal(UPDATE_ROUTE, '/api/power-suite.update')
    assert.deepEqual(labels, [`power-suite: update check GET ${UPDATE_ROUTE}`])
    assert.equal(registrations.length, 1)
    const [route] = registrations
    assert.equal(route.path, UPDATE_ROUTE)
    assert.deepEqual(route.methods, ['GET'])
    assert.equal(route.requestBody, 'buffered')
    const response = await route.fetch(new Request(`http://localhost${UPDATE_ROUTE}?lang=en-US`))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), {
      current: repoManifest.version,
      latest: '99.0.0',
      updateAvailable: true,
      highlights: ['English point one', 'English point two']
    })
    assert.deepEqual(calls, [
      REGISTRY_URL,
      'https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v99.0.0/release-notes/99.0.0.en.md'
    ])
  } finally {
    globalThis.fetch = savedFetch
  }
})

test('the host route keeps answering 200 when the registry read fails', async () => {
  const savedFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('offline') }
  try {
    const registrations = []
    installUpdateCheck({
      effect: (fn) => fn(),
      connection: { fetch: { register: (route) => { registrations.push(route); return async () => {} } } }
    })
    const response = await registrations[0].fetch(new Request(`http://localhost${UPDATE_ROUTE}`))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), {
      current: parseStableVersion(repoManifest.version) === undefined ? '0.0.0' : repoManifest.version,
      latest: null,
      updateAvailable: false,
      highlights: []
    })
  } finally {
    globalThis.fetch = savedFetch
  }
})
