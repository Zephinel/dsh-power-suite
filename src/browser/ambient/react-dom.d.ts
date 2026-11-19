/**
 * Minimal structural declaration for the `react-dom` module the DSH shell
 * seeds into every Web bundle: the browser entry only portals overlay seats.
 *
 * @module
 */

declare module 'react-dom' {
  /** Portal element accepted anywhere React renders children. */
  interface ReactPortal {
    readonly key: string | null
  }

  /** Render children into another DOM container (used for overlay seats). */
  function createPortal(
    children: unknown,
    container: unknown,
    key?: string | null
  ): ReactPortal
}
