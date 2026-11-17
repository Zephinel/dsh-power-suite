/**
 * Shared durable-document module for the Host stores.
 *
 * The Host keeps six small JSON documents under `$DSH_HOME/dsh-power-suite/`
 * (settings, read acknowledgements, session pins, session activity, sidebar
 * width, workspace presets). Every one of them needs the same mechanism: lazy
 * single-flight read, a coded read-error policy, serialized read-modify-write,
 * an atomic 0600 temporary-sibling rename, and in-memory publication only after
 * the rename. This module owns that mechanism; each store becomes an adapter
 * that supplies only its document policy (decode/encode/merge/change rule).
 *
 * @module
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Whether a filesystem error means the document is absent (legitimately empty). */
function isNotFound(error) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}

/**
 * One durable document handle.
 * @template T
 * @typedef {object} DocumentStore
 * @property {() => Promise<T>} get - current document, read lazily and cloned.
 * @property {(mutate: (current: T) => { next: T, changed?: boolean } | Promise<{ next: T, changed?: boolean }>) => Promise<T>} update - serialized read-modify-write; writes only when `changed` (default true) and returns the next document.
 * @property {() => Promise<void>} flush - resolves after the queued writes settle.
 */

/**
 * Open one durable JSON document.
 *
 * @template T
 * @param {{
 *   file: string,
 *   decode: (text: string) => T,
 *   encode: (value: T) => string,
 *   merge?: (current: T, decoded: T) => T,
 *   readError?: { code: string, message: string },
 *   clone?: (value: T) => T
 * }} options - document policy: path, codec, late-read merge, read-error mode, and the copy handed to callers.
 * @returns {DocumentStore<T>} the document handle.
 */
export function createDocumentStore({ file, decode, encode, merge, readError, clone = (value) => value }) {
  let state = null
  let chain = Promise.resolve()
  let loadPromise = null

  /** Read the document once; a missing file decodes as empty, and a read failure follows the configured policy. */
  const load = () => {
    if (state !== null) return Promise.resolve(state)
    if (loadPromise !== null) return loadPromise
    const attempt = (async () => {
      let text = ''
      try {
        text = await readFile(file, 'utf8')
      } catch (error) {
        if (!isNotFound(error)) {
          if (readError === undefined) {
            // Tolerant stores treat an unreadable document like an absent one.
            text = ''
          } else {
            const failure = /** @type {Error & { code: string }} */ (new Error(readError.message))
            failure.code = readError.code
            throw failure
          }
        }
      }
      const decoded = decode(text)
      // Single-flight makes this race hard to hit; keep the defensive merge so a
      // late decode can never clobber a state that was already published.
      state = state === null ? decoded : merge === undefined ? decoded : merge(state, decoded)
      return state
    })()
    loadPromise = attempt.catch((error) => {
      loadPromise = null
      throw error
    })
    return loadPromise
  }

  /**
   * Serialize one write on the document chain.
   * @template R
   * @param {() => Promise<R>} task - write to run after the current tail.
   * @returns {Promise<R>} the write result.
   */
  const enqueue = (task) => {
    const run = chain.then(task, task)
    chain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  /** Persist one document atomically: a 0600 temporary sibling renamed over the target. */
  const write = async (value) => {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    const temporary = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
    try {
      await writeFile(temporary, encode(value), { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, file)
    } catch (error) {
      // Best-effort cleanup; the rename target is untouched by a failed write.
      await rm(temporary, { force: true }).catch(() => {})
      throw error
    }
  }

  return {
    async get() {
      return clone(await load())
    },
    async update(mutate) {
      return enqueue(async () => {
        const current = await load()
        const { next, changed = true } = await mutate(clone(current))
        if (changed) {
          await write(next)
          state = next
        }
        return clone(next)
      })
    },
    flush() {
      return chain
    }
  }
}
