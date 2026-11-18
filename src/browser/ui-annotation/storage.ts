/**
 * Browser-local persistence helpers of the UI element annotation mode.
 *
 * The controller owns the keys and the schema; these two helpers only tolerate
 * a blocked localStorage (private mode, hostile embedding) and never throw.
 *
 * @module
 */

/**
 * Read one localStorage key, tolerating blocked storage.
 * @param key - storage key.
 * @returns stored text, or null.
 */
export function annotationReadStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Write one localStorage key, tolerating blocked storage.
 * @param key - storage key.
 * @param value - value to store.
 * @returns void.
 */
export function annotationWriteStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private mode or a hostile embedding: persistence is best effort.
  }
}
