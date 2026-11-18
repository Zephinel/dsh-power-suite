/**
 * Small helpers for reading fields off unknown thrown values.
 *
 * The Host boundary catches errors from Node, DSH services and its own coded
 * failures; under `strict` those are `unknown`. These helpers keep the property
 * reads in one place instead of sprinkling `any` casts through catch blocks.
 *
 * @module
 */

/** Extract a string `code` from an unknown thrown value. */
export function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

/** Extract a string `message` from an unknown thrown value. */
export function errorMessage(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : undefined
}

/** Whether an unknown thrown value is an ENOENT (absent file) filesystem error. */
export function isNotFound(error: unknown): boolean {
  return errorCode(error) === 'ENOENT'
}
