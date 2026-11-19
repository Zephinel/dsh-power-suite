/**
 * Pure UI-element-annotation modifier settings.
 *
 * The annotation mode passes clicks through and extends the selection with two
 * configurable modifiers. These helpers own the defaults, the accepted choices,
 * the conflict rule (the pair must differ) and the browser-local settings
 * document. The controller owns localStorage, translation and feedback; the
 * overlay only renders the resolved pair.
 *
 * @module
 */

/** Browser-local storage record for the two modifiers. */
export const SETTINGS_STORAGE_KEY = 'power-suite.ui-annotation.settings'

/** One configurable modifier id. */
export type AnnotationModifier = 'alt' | 'ctrl' | 'meta' | 'shift'

/** The two modifier fields. */
export type AnnotationModifierField = 'passThroughModifier' | 'multiModifier'

/** The resolved modifier pair. */
export interface AnnotationModifierSettings {
  passThroughModifier: AnnotationModifier
  multiModifier: AnnotationModifier
}

/** The next pair plus the sibling field a conflict moved. */
export interface AnnotationModifierChange {
  settings: AnnotationModifierSettings
  adjustedField?: AnnotationModifierField
}

/** The event flags a modifier match reads. */
export interface ModifierEventLike {
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

/** The two configurable modifiers, in native select order. */
export const MODIFIER_CHOICES: readonly AnnotationModifier[] = ['alt', 'ctrl', 'meta', 'shift']

/** Defaults: Alt/Option passes clicks through, Shift adds to the selection. */
export const ANNOTATION_DEFAULT_SETTINGS: Readonly<AnnotationModifierSettings> = Object.freeze({
  passThroughModifier: 'alt',
  multiModifier: 'shift'
})

/**
 * Whether one value is an accepted modifier id.
 * @param value - candidate value.
 * @returns whether it is one of the four modifiers.
 */
function isAnnotationModifier(value: unknown): value is AnnotationModifier {
  return typeof value === 'string' && (MODIFIER_CHOICES as readonly string[]).includes(value)
}

/**
 * Normalize one raw settings object, never returning an equal modifier pair.
 * @param raw - untrusted persisted/loaded value.
 * @returns a valid pair; unknown fields are dropped.
 */
export function normalizeSettings(raw: unknown): AnnotationModifierSettings {
  const source: Record<string, unknown> = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const passThroughModifier: AnnotationModifier = isAnnotationModifier(source.passThroughModifier)
    ? source.passThroughModifier
    : ANNOTATION_DEFAULT_SETTINGS.passThroughModifier
  let multiModifier: AnnotationModifier = isAnnotationModifier(source.multiModifier)
    ? source.multiModifier
    : ANNOTATION_DEFAULT_SETTINGS.multiModifier
  if (multiModifier === passThroughModifier) {
    multiModifier = MODIFIER_CHOICES.find((choice) => choice !== passThroughModifier) ?? ANNOTATION_DEFAULT_SETTINGS.multiModifier
  }
  return { passThroughModifier, multiModifier }
}

/**
 * Apply one modifier choice and move the other field off a collision.
 * @param settings - current settings.
 * @param field - changed field.
 * @param value - requested modifier id.
 * @returns the next settings, plus the moved field when a conflict adjusted it.
 */
export function resolveModifierChange(settings: unknown, field: unknown, value: unknown): AnnotationModifierChange {
  const current = normalizeSettings(settings)
  if (field !== 'passThroughModifier' && field !== 'multiModifier') return { settings: current }
  if (!isAnnotationModifier(value)) return { settings: current }
  const otherField: AnnotationModifierField = field === 'passThroughModifier' ? 'multiModifier' : 'passThroughModifier'
  const next: AnnotationModifierSettings = { ...current, [field]: value }
  if (next[otherField] === value) {
    next[otherField] = MODIFIER_CHOICES.find((choice) => choice !== value) ?? current[otherField]
    return { settings: next, adjustedField: otherField }
  }
  return { settings: next }
}

/**
 * Parse the persisted settings document.
 * @param text - raw localStorage value.
 * @returns normalized settings; malformed text reads as the defaults.
 */
export function parseStoredSettings(text: unknown): AnnotationModifierSettings {
  if (typeof text !== 'string' || text.length === 0) return normalizeSettings(null)
  try {
    return normalizeSettings(JSON.parse(text))
  } catch {
    return normalizeSettings(null)
  }
}

/**
 * Serialize settings for localStorage, normalized.
 * @param settings - settings to store.
 * @returns JSON document.
 */
export function serializeSettings(settings: unknown): string {
  return JSON.stringify(normalizeSettings(settings))
}

/**
 * Whether a keyboard or mouse event carries one configured modifier.
 * @param eventLike - event with altKey/ctrlKey/metaKey/shiftKey.
 * @param modifier - modifier id.
 * @returns whether the modifier is held.
 */
export function modifierMatches(eventLike: unknown, modifier: unknown): boolean {
  if (eventLike === null || typeof eventLike !== 'object') return false
  const event = eventLike as ModifierEventLike
  if (modifier === 'alt') return event.altKey === true
  if (modifier === 'ctrl') return event.ctrlKey === true
  if (modifier === 'meta') return event.metaKey === true
  if (modifier === 'shift') return event.shiftKey === true
  return false
}
