/**
 * Minimal structural declaration for the shell-seeded
 * `@deepseek-ai/dsh-client-ui-primitives` module.
 *
 * The browser entry treats every member as optional: a foreign host may omit
 * the module or ship an older icon set, and the features then fall back to
 * their inline Remix paths. Only the members the entry feature-detects are
 * declared.
 *
 * @module
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  /** Remix-style glyph factory: path data plus an optional size. */
  type GlyphComponent = (props: { size?: number, scale?: number }) => unknown

  /** Shell state/loading indicator. */
  const StateDot: (props: { size?: number }) => unknown

  /** Ellipsis icon used by the session-row action trigger. */
  const IconEllipsisOutlineRegular: GlyphComponent

  /** Filled pin glyph used by the card's pin button. */
  const IconPinFillRegular: GlyphComponent

  /** Outline pin glyph used by the card's pin button. */
  const IconPinOutlineRegular: GlyphComponent
}
