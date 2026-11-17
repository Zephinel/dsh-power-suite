/**
 * Shared durable-document module for the Host stores.
 *
 * The Host keeps small JSON documents under `$DSH_HOME/dsh-power-suite/`
 * (settings, read acknowledgements, session pins, sidebar width, workspace
 * presets). Every one of them needs the same mechanism: lazy single-flight
 * read, a coded read-error policy, serialized read-modify-write, an atomic 0600
 * temporary-sibling rename, and in-memory publication only after the rename.
 * This module owns that mechanism; each store becomes an adapter that supplies
 * only its document policy (decode/encode/clone/change rule).
 *
 * @module
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Whether a filesystem error means the document is absent (legitimately empty). */
function isNotFound(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}

/** Document policy supplied by one store adapter. */
export interface DocumentStoreOptions<T> {
  /** Absolute document path. */
  file: string
  /** Decode one file body; called with `''` for a missing/tolerated-unreadable document. */
  decode: (text: string) => T
  /** Encode the document for the atomic write. */
  encode: (value: T) => string
  /** Merge a late decode into an already-published state; single-flight makes this defensive. */
  merge?: (current: T, decoded: T) => T
  /** Coded error raised for a non-ENOENT read failure; without it, reads decode as empty. */
  readError?: { code: string; message: string }
  /** Copy handed to callers so they cannot mutate the stored state. */
  clone?: (value: T) => T
}

/** One durable document handle. */
export interface DocumentStore<T> {
  /** Current document, read lazily and cloned. */
  get(): Promise<T>
  /** Serialized read-modify-write; writes only when `changed` (default true) and returns the next document. */
  update(mutate: (current: T) => { next: T; changed?: boolean } | Promise<{ next: T; changed?: boolean }>): Promise<T>
  /** Resolves after the queued writes settle. */
  flush(): Promise<void>
}

/**
 * Open one durable JSON document.
 * @param options - document policy: path, codec, late-read merge, read-error mode, and the copy handed to callers.
 * @returns the document handle.
 */
export function createDocumentStore<T>({
  file,
  decode,
  encode,
  merge,
  readError,
  clone = (value) => value
}: DocumentStoreOptions<T>): DocumentStore<T> {
  let state: T | null = null
  let chain: Promise<void> = Promise.resolve()
  let loadPromise: Promise<T> | null = null

  /** Read the document once; a missing file decodes as empty, and a read failure follows the configured policy. */
  const load = (): Promise<T> => {
    if (state !== null) return Promise.resolve(state)
    if (loadPromise !== null) return loadPromise
    const attempt = (async (): Promise<T> => {
      let text = ''
      try {
        text = await readFile(file, 'utf8')
      } catch (error) {
        if (!isNotFound(error)) {
          if (readError === undefined) {
            // Tolerant stores treat an unreadable document like an absent one.
            text = ''
          } else {
            const failure = new Error(readError.message) as Error & { code: string }
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
    loadPromise = attempt.catch((error: unknown) => {
      loadPromise = null
      throw error
    })
    return loadPromise
  }

  /** Serialize one write on the document chain. */
  const enqueue = <R>(task: () => Promise<R>): Promise<R> => {
    const run = chain.then(task, task)
    chain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  /** Persist one document atomically: a 0600 temporary sibling renamed over the target. */
  const write = async (value: T): Promise<void> => {
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
