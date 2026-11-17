import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createDocumentStore } from '../src/host/document-store.ts'

const decodeEntries = (text) => (text.trim() === '' ? { entries: {} } : JSON.parse(text))
const encodeEntries = (value) => `${JSON.stringify(value)}\n`

/** Create a throwaway document path that the test cleans up. */
async function documentPath(t, name = 'document.json') {
  const directory = await mkdtemp(join(tmpdir(), 'ps-document-store-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return join(directory, name)
}

test('a missing document reads as empty and is decoded once', async (t) => {
  const file = await documentPath(t)
  let decodes = 0
  const store = createDocumentStore({
    file,
    decode: (text) => {
      decodes += 1
      return decodeEntries(text)
    },
    encode: encodeEntries
  })
  assert.deepEqual(await store.get(), { entries: {} })
  assert.deepEqual(await store.get(), { entries: {} })
  assert.equal(decodes, 1)
})

test('update writes atomically with 0600 and creates the 0700 directory', async (t) => {
  const file = await documentPath(t, 'nested/document.json')
  const store = createDocumentStore({ file, decode: decodeEntries, encode: encodeEntries })
  const next = await store.update(() => ({ next: { entries: { a: 1 } } }))
  assert.deepEqual(next, { entries: { a: 1 } })
  assert.equal(await readFile(file, 'utf8'), '{"entries":{"a":1}}\n')
  assert.equal((await stat(file)).mode & 0o777, 0o600)
  assert.equal((await stat(join(file, '..'))).mode & 0o777, 0o700)
  assert.deepEqual(await store.get(), { entries: { a: 1 } })
})

test('changed: false skips the encode and the write', async (t) => {
  const file = await documentPath(t)
  let encodes = 0
  const store = createDocumentStore({
    file,
    decode: decodeEntries,
    encode: (value) => {
      encodes += 1
      return encodeEntries(value)
    }
  })
  await store.update(() => ({ next: { entries: { a: 1 } } }))
  await store.update((current) => ({ next: current, changed: false }))
  assert.equal(encodes, 1)
  assert.deepEqual(await store.get(), { entries: { a: 1 } })
})

test('writes serialize on one chain in call order', async (t) => {
  const file = await documentPath(t)
  const store = createDocumentStore({ file, decode: decodeEntries, encode: encodeEntries })
  const seen = []
  const first = store.update(async (current) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20))
    seen.push(current.entries.order ?? 0)
    return { next: { entries: { order: 1 } } }
  })
  const second = store.update((current) => {
    seen.push(current.entries.order ?? 0)
    return { next: { entries: { order: 2 } } }
  })
  await Promise.all([first, second])
  assert.deepEqual(seen, [0, 1])
  assert.deepEqual(await store.get(), { entries: { order: 2 } })
})

test('a non-ENOENT read failure follows the coded-error policy', async (t) => {
  const file = await documentPath(t)
  await mkdir(file, { recursive: true })
  const coded = createDocumentStore({
    file,
    decode: decodeEntries,
    encode: encodeEntries,
    readError: { code: 'DOCUMENT_READ_FAILED', message: 'document could not be read' }
  })
  await assert.rejects(coded.get(), (error) => error?.code === 'DOCUMENT_READ_FAILED' && error.message === 'document could not be read')

  const tolerant = createDocumentStore({ file, decode: decodeEntries, encode: encodeEntries })
  assert.deepEqual(await tolerant.get(), { entries: {} })
})

test('get hands out clones so callers cannot mutate the stored state', async (t) => {
  const file = await documentPath(t)
  const store = createDocumentStore({ file, decode: decodeEntries, encode: encodeEntries, clone: (value) => structuredClone(value) })
  await store.update(() => ({ next: { entries: { a: 1 } } }))
  const first = await store.get()
  first.entries.a = 99
  assert.deepEqual(await store.get(), { entries: { a: 1 } })
})

test('flush resolves after queued writes settle', async (t) => {
  const file = await documentPath(t)
  const store = createDocumentStore({ file, decode: decodeEntries, encode: encodeEntries })
  const pending = store.update(async () => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10))
    return { next: { entries: { flushed: true } } }
  })
  await store.flush()
  await pending
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { entries: { flushed: true } })
})

test('a failed rename cleans up the temporary sibling', async (t) => {
  const file = await documentPath(t, 'blocked.json')
  await mkdir(file, { recursive: true })
  const store = createDocumentStore({ file, decode: decodeEntries, encode: encodeEntries })
  await assert.rejects(store.update(() => ({ next: { entries: { a: 1 } } })))
  const leftovers = (await readdir(join(file, '..'))).filter((name) => name.endsWith('.tmp'))
  assert.deepEqual(leftovers, [])
})

test('a coded read failure is retried by the next get', async (t) => {
  const file = await documentPath(t)
  await mkdir(file, { recursive: true })
  const store = createDocumentStore({
    file,
    decode: decodeEntries,
    encode: encodeEntries,
    readError: { code: 'DOCUMENT_READ_FAILED', message: 'document could not be read' }
  })
  await assert.rejects(store.get(), (error) => error?.code === 'DOCUMENT_READ_FAILED')
  await rm(file, { recursive: true, force: true })
  assert.deepEqual(await store.get(), { entries: {} })
})

test('update hands the mutate callback a clone of the stored document', async (t) => {
  const file = await documentPath(t)
  let encodes = 0
  const store = createDocumentStore({
    file,
    decode: decodeEntries,
    encode: (value) => {
      encodes += 1
      return encodeEntries(value)
    },
    clone: (value) => structuredClone(value)
  })
  await store.update(() => ({ next: { entries: { a: 1 } } }))
  const next = await store.update((current) => {
    current.entries.a = 99
    return { next: current, changed: false }
  })
  assert.deepEqual(next, { entries: { a: 99 } })
  assert.deepEqual(await store.get(), { entries: { a: 1 } })
  assert.equal(encodes, 1)
})
