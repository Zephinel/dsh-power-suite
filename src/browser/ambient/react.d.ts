/**
 * Minimal structural declarations for the `react` and `react-dom` modules the
 * DSH shell seeds into every Web bundle.
 *
 * The package ships no React dependency (`package.json` stays unchanged); the
 * shell owns the runtime modules. This file types only the APIs the browser
 * entry and its extracted modules call: `createElement`, `Fragment`, the seven
 * hooks (state, reducer, ref, effect, layout effect, callback, memo, external
 * store), and `createPortal`. Components are opaque values and props are
 * intentionally not validated (no JSX runtime is declared because the UI is
 * built with `React.createElement`).
 *
 * Signatures stay honest where inference is safe (state, reducer seats, memo
 * values, external-store snapshots); the rest stays structural rather than
 * pretending to type the component tree.
 *
 * @module
 */

declare module 'react' {
  /** Opaque element produced by `createElement`/`createPortal`. */
  interface ReactElement {
    readonly type: unknown
    readonly props: unknown
    readonly key: string | null
  }

  /** Anything React can render; the entry never narrows children. */
  type ReactNode = unknown

  /** State updater accepted by `useState`/`useReducer` setters. */
  type SetStateAction<S> = S | ((prev: S) => S)

  /** Setter returned by `useState`/`useReducer`. */
  type Dispatch<A> = (value: A) => void

  /** Immutable dependency list of the effect/memo hooks. */
  type DependencyList = readonly unknown[]

  /** Mutable ref object returned by `useRef` for a non-null initial value. */
  interface MutableRefObject<T> {
    current: T
  }

  /** Effect callback cleanup. */
  type EffectCallback = () => void | (() => void)

  /** Create one element; props and children stay opaque to this shim. */
  function createElement(
    type: unknown,
    props?: Readonly<Record<string, unknown>> | null,
    ...children: readonly unknown[]
  ): ReactElement

  /** Fragment sentinel passed as the element type. */
  const Fragment: symbol

  /** Local component state with the setter React exposes. */
  function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>]

  /** Local component state without an initial value. */
  function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>]

  /** Reducer state with the dispatch seat. */
  function useReducer<S, A, I>(
    reducer: (state: S, action: A) => S,
    initialArg: I,
    init: (arg: I) => S
  ): [S, Dispatch<A>]

  /** Mutable box; the entry stores DOM nodes and small runtime records here. */
  function useRef<T>(initialValue: T): MutableRefObject<T>

  /** Mutable box seeded with null. */
  function useRef<T>(initialValue: T | null): MutableRefObject<T | null>

  /** Mutable box without an initial value. */
  function useRef<T = undefined>(): MutableRefObject<T | undefined>

  /** Run an effect after paint; cleanup is optional. */
  function useEffect(effect: EffectCallback, deps?: DependencyList): void

  /** Run a layout effect before paint; cleanup is optional. */
  function useLayoutEffect(effect: EffectCallback, deps?: DependencyList): void

  /** Memoize one callback identity; parameters stay inferred at the call site. */
  function useCallback<T extends (...args: never[]) => unknown>(callback: T, deps?: DependencyList): T

  /** Memoize one computed value. */
  function useMemo<T>(factory: () => T, deps?: DependencyList): T

  /** Subscribe to an external store and read its snapshot. */
  function useSyncExternalStore<S>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => S,
    getServerSnapshot?: () => S
  ): S

  /** Base class for the class components the entry may still declare. */
  class Component<P = Record<string, unknown>, S = Record<string, unknown>> {
    props: P
    state: S
    setState(state: Partial<S> | ((prev: S) => Partial<S>)): void
    render(): ReactNode
  }

  /** Memoized component wrapper; the component shape stays opaque. */
  function memo<P>(component: (props: P) => ReactNode): (props: P) => ReactNode

  /** Ref-forwarding wrapper; the render shape stays opaque. */
  function forwardRef<T, P>(
    render: (props: P, ref: { current: T | null }) => ReactNode
  ): (props: P) => ReactNode
}
