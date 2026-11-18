/**
 * Runtime constants of the UI element annotation mode.
 *
 * Copy dictionaries and icon paths stay in the entry; these are the persistence
 * keys, seat ids, timers, chip source identity and root markers that the
 * controller, the React surface and the installer share.
 *
 * @module
 */

/** Copy namespace of the UI element annotation mode. */
export const ANNOTATION_NS = 'powerSuiteAnnotation'

/** The always-mounted overlay seat that renders the annotation surface. */
export const ANNOTATION_OVERLAY_ID = 'power-suite.ui-annotation-overlay'

/** The renderless Composer seat that maintains the insertion bridge. */
export const ANNOTATION_SEAT_ID = 'power-suite.ui-annotation-seat'

/** Browser-owned persistence keys. The mode itself is intentionally not restored. */
export const LAUNCHER_STORAGE_KEY = 'power-suite.ui-annotation.launcher'
export const RAIL_STORAGE_KEY = 'power-suite.ui-annotation.rail-collapsed'

/** Debounce for the persisted annotation document (D1). */
export const ANNOTATION_PERSIST_DEBOUNCE_MS = 250

/** D5: single-slot undo window after a delete (newest delete replaces it). */
export const ANNOTATION_UNDO_WINDOW_MS = 5000

/** A3/T6: hover-intent delay before the floating detail card appears. */
export const ANNOTATION_DETAIL_HOVER_DELAY_MS = 120

/** A3/T6: grace period before the detail card closes after the pointer leaves. */
export const ANNOTATION_DETAIL_CLOSE_DELAY_MS = 120

/** A3/T21: estimated composer-chip hover preview size used for clamping. */
export const ANNOTATION_CHIP_PREVIEW_SIZE = { width: 320, height: 150 }

/** A3/T24: estimated batch popover size used for placement clamping. */
export const ANNOTATION_BATCH_POPOVER_SIZE = { width: 320, height: 240 }


/** A3/T9: trigger character the annotation source binds to (`@`). */
export const ANNOTATION_CHIP_TRIGGER = '@'

/** A3/T9: menu order after the native `@reference` group. */
export const ANNOTATION_CHIP_ORDER = 900

/** F2: a floating surface root needs at least this computed z-index. */
/** F1: annotation paint layer z-index: intentionally above native hover cards and shell modals/menus. */
export const ANNOTATION_PAINT_Z = 2000

/** Root marker for the raised paint layer, asserted by the live E2E. */
export const ANNOTATION_RAISED_ATTR = 'data-psa-raised'

/**
 * Module event announced when the mode turns on/off. The dynamic-workspaces
 * feature owns the dependent hover-card pinning behavior; this annotation
 * region only dispatches the state (D3: ownership split).
 */
export const ANNOTATION_STATE_EVENT = 'power-suite:ui-annotation-state'

/** A3/T36: bounded document-fallback scan over the current Session records. */
export const ANNOTATION_FALLBACK_SCAN_MAX = 400
