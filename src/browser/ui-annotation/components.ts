/**
 * React surface of the UI element annotation mode.
 *
 * The overlay subscribes to the controller's store and renders one immutable
 * snapshot: launcher, page highlights and marks, the rail (collection, batch
 * groups, modifier settings), the element popover, the floating detail card,
 * the composer-chip preview and delete affordance, the exit confirmation and
 * the note editors. Every DOM marker/class and copy string is part of the
 * browser E2E contract.
 *
 * Elements are built with `React.createElement`; the glyph factory and icon
 * paths are injected so this module never reads the entry's icons.
 *
 * @module
 */

import {
  ANNOTATION_RECORD_LIMIT,
  annotationEntryOrdinals,
  annotationFilterEntries,
  annotationGroupItems,
  annotationIsGroup,
  annotationMarkerBadgeText,
  annotationScopeCounts,
  annotationSidebarCounts,
  annotationTotalItemCount
} from './records.ts'
import type { AnnotationCollectionEntry } from './records.ts'
import {
  annotationStatusLabelKey
} from './anchors.ts'
import {
  annotationLocatorText,
  describeLocator,
  elementLabel
} from './identity.ts'
import type { AnnotationElementRef } from './identity.ts'
import {
  annotationRoutePath,
  annotationWorkspaceLabel,
  formatAnnotationTime,
  normalizeAnnotationBounds,
  sessionShortLabel
} from './format.ts'
import {
  annotationSegmentDisplayLabel,
  annotationSegmentedIndex
} from './geometry.ts'
import type { Rect } from './geometry.ts'
import { MODIFIER_CHOICES } from './settings.ts'
import type { AnnotationModifierField } from './settings.ts'
import type { AnnotationSnapshot } from './types.ts'
import type { createAnnotationController } from './controller.ts'

/** The controller face rendered by the surface. */
export type AnnotationController = ReturnType<typeof createAnnotationController>

/** Base props every controller-bound surface receives from the installer. */
export interface AnnotationSurfaceProps {
  t: DshTranslate
  controller: AnnotationController
  snapshot: AnnotationSnapshot
}

/** Props of the always-mounted overlay. */
export interface AnnotationOverlayProps {
  t: DshTranslate
  controller: AnnotationController
}

/** Props of the highlight layer (renders from the snapshot only). */
export interface AnnotationHighlightsProps {
  t: DshTranslate
  snapshot: AnnotationSnapshot
}

/** Props of one collection row / group row. */
export interface AnnotationEntryRowProps extends AnnotationSurfaceProps {
  entry: AnnotationCollectionEntry
  index: number
  ordinal: number
}

/** Props of the two modifier segmented controls. */
export interface AnnotationModifierSegmentedProps {
  t: DshTranslate
  controller: AnnotationController
  fieldName: AnnotationModifierField
  value: string
  dataAttribute: string
  labelId: string
}

/** One collection entry as this surface reads it (the store keeps loose records). */
interface AnnotationComponentEntry extends AnnotationCollectionEntry {
  id: string
  session?: { sessionId?: string | null, cwd?: string | null, workspaceLabel?: string | null } | null
  locator?: { surface?: string, ephemeral?: boolean, xpath?: string, jsPath?: string, uniqueSelector?: string, path?: string } | null
  note?: string
  requirement?: string
  included?: boolean
  collapsed?: boolean
  at?: number
  status?: string
}

/** One React/DOM event as the surface handlers read it. */
interface AnnotationUiEvent {
  target: {
    value: string
    checked: boolean
    closest?: (selector: string) => Element | null
    contains?: (node: unknown) => boolean
  }
  currentTarget: {
    value: string
    checked: boolean
    style: { height: string }
    scrollHeight?: number
  }
  key: string
  clientX: number
  clientY: number
  pointerId?: number
  button?: number
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  preventDefault: () => void
  stopPropagation: () => void
  stopImmediatePropagation: () => void
}

/** View one collection entry through the fields this surface reads. */
function annotationEntryView(entry: unknown): AnnotationComponentEntry {
  return entry as unknown as AnnotationComponentEntry
}

/** View one ref record through the fields this surface reads. */
function annotationRecordView(record: unknown): AnnotationComponentEntry {
  return record as unknown as AnnotationComponentEntry
}

/** Icon path data injected by the entry (Remix Icon, Apache-2.0). */
export interface AnnotationComponentIcons {
  focus: string
  close: string
  arrowUp: string
  arrowDown: string
  delete: string
  listCheck: string
  information: string
  annotationCopy: string
  fileCopy: string
  link: string
}

/** Stable dependencies the entry binds once per plugin factory. */
export interface AnnotationComponentDeps {
  React: typeof import('react')
  glyph: (path: string, size?: number, className?: string, scale?: number) => import('react').ReactElement
  icons: AnnotationComponentIcons
}

/**
 * Build the annotation React surface.
 * @param deps - React, the glyph factory and the icon paths.
 * @returns the components the installer registers on the overlay slot.
 */
export function createAnnotationComponents(deps: AnnotationComponentDeps) {
  const React = deps.React
  const glyph = deps.glyph
  const icons = deps.icons

function AnnotationChevron(direction: 'left' | 'right' | 'down') {
  return React.createElement('svg', {
    viewBox: '0 0 24 24',
    width: 13,
    height: 13,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: 'false',
    style: { transform: direction === 'right' ? 'none' : 'rotate(180deg)' }
  }, React.createElement('path', { d: 'M9 5 16 12 9 19' }))
}

/**
 * Inline style for one viewport-relative rectangle.
 * @param {{ x: number, y: number, width: number, height: number }} rect - rectangle.
 * @returns {object} style object.
 */
function annotationRectStyle(rect: Rect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  }
}

/**
 * Subscribe one component to the annotation store.
 * @param {object} controller - annotation controller.
 * @returns {object} current snapshot.
 */
function useAnnotationSnapshot(controller: AnnotationController) {
  const subscribe = React.useCallback((listener: () => void) => controller.store.subscribe(listener), [controller])
  const getSnapshot = React.useCallback(() => controller.store.getSnapshot(), [controller])
  if (typeof React.useSyncExternalStore === 'function') {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  }
  const [value, setValue] = React.useState<AnnotationSnapshot>(getSnapshot)
  React.useEffect(() => subscribe(() => setValue(getSnapshot())), [subscribe, getSnapshot])
  return value
}

/**
 * The always-mounted annotation surface: launcher, rail, highlights,
 * popover, note editor, and feedback.
 * @param {{ t: Function, controller: object }} props - bound translate and controller.
 * @returns {object} React fragment.
 */
function AnnotationOverlay(props: AnnotationOverlayProps) {
  const { t, controller } = props
  const snapshot = useAnnotationSnapshot(controller)
  const state = snapshot.state
  const active = state.phase !== 'off'
  const node = []
  // A3/T19: exactly one launcher control at any time. While active it lives
  // docked inside the rail (rendered by AnnotationRail); while idle it floats at
  // its remembered position over the page.
  node.push(React.createElement(AnnotationLauncher, { key: 'launcher', t, controller, snapshot }))
  if (active) {
    node.push(React.createElement(AnnotationHighlights, { key: 'layer', snapshot, t }))
    node.push(React.createElement(AnnotationRail, { key: 'rail', t, controller, snapshot }))
    if (state.phase === 'multi' && state.selection.length > 1 && state.batchOpen === true) {
      node.push(React.createElement(AnnotationBatchPopover, { key: 'batch-popover', t, controller, snapshot }))
    }
    if (state.phase === 'selected') {
      node.push(React.createElement(AnnotationPopover, { key: 'popover', t, controller, snapshot }))
    }
    if (snapshot.detailCard !== null) {
      node.push(React.createElement(AnnotationDetailCard, { key: 'detail', t, controller, snapshot }))
    }
  }
  if (snapshot.chipPreview !== null) {
    node.push(React.createElement(AnnotationChipPreview, { key: 'chip-preview', t, controller, snapshot }))
  }
  if (snapshot.chipAction !== null) {
    node.push(React.createElement(AnnotationChipDelete, { key: 'chip-delete', t, controller, snapshot }))
  }
  if (snapshot.exitConfirm !== null) {
    node.push(React.createElement(AnnotationExitConfirm, { key: 'exit-confirm', t, controller, snapshot }))
  }
  if (snapshot.noteEditor !== null) node.push(React.createElement(AnnotationNoteEditor, { key: 'note-editor', t, controller, snapshot }))
  if (snapshot.markUndo !== null) {
    const undo = snapshot.markUndo
    node.push(React.createElement('div', {
      key: 'undo-toast',
      className: 'psa-undo-toast',
      'data-psa-undo-toast': '',
      'data-psa-own': '',
      role: 'status',
      'aria-live': 'polite'
    },
    React.createElement('span', { 'data-psa-undo-text': '' },
      undo.kind === 'clear' ? t('feedback.cleared') : (undo.kind === 'multi' ? t('feedback.selectedDeleted') : t('feedback.markDeleted'))),
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-undo': '',
      'data-psa-own': '',
      onClick: () => controller.undoMark()
    }, t('feedback.undo'))))
  }
  if (state.feedback !== null) {
    node.push(React.createElement('div', {
      key: 'feedback',
      className: 'psa-feedback',
      'data-psa-feedback': '',
      'data-psa-own': '',
      'data-psa-kind': state.feedback.kind,
      role: 'status',
      'aria-live': 'polite'
    }, state.feedback.text))
  }
  return React.createElement(React.Fragment, null, node)
}

/**
 * The round floating entry button: drag to move, click to toggle the mode.
 * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
 * @returns {object} the launcher button.
 */
function AnnotationLauncher(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const active = snapshot.state.phase !== 'off'
  const count = snapshot.state.collection.length
  return React.createElement('button', {
    type: 'button',
    className: 'psa-launcher',
    'data-psa-launcher': '',
    'data-psa-own': '',
    'data-psa-active': active ? 'true' : 'false',
    'data-psa-launcher-hidden': active ? 'true' : 'false',
    'data-psa-dragging': snapshot.launcherDragging ? 'true' : undefined,
    'aria-pressed': active ? 'true' : 'false',
    'aria-hidden': active ? 'true' : undefined,
    tabIndex: active ? -1 : 0,
    'aria-label': active ? t('launcher.exit') : t('launcher.enter'),
    title: active ? t('launcher.exit') : t('launcher.enter'),
    style: { left: `${snapshot.launcherPosition.x}px`, top: `${snapshot.launcherPosition.y}px` },
    onPointerDown: (event: AnnotationUiEvent) => controller.beginLauncherDrag(event),
    onClick: () => {
      if (controller.consumeLauncherClickSuppressed()) return
      controller.toggleMode()
    }
  },
  glyph(icons.focus, 20, 'psa-launcher-icon'),
  count > 0
    ? React.createElement('span', { className: 'psa-launcher-count', 'data-psa-own': '' }, String(count))
    : null)
}

/**
 * The page mark badges for the current Session's resolved annotations (A3/T6).
 *
 * Marks are decorative overlay children only: `aria-hidden`, pointer-events
 * none (CSS), and no attribute is ever written to the page's own elements.
 * @param {object} snapshot - current annotation snapshot.
 * @param {Function} t - namespace-bound translate.
 * @returns {Array<object>} mark elements.
 */
function annotationMarkElements(snapshot: AnnotationSnapshot, t: DshTranslate) {
  const marks = Array.isArray(snapshot.markRects) ? snapshot.markRects : []
  const nodes = []
  for (const mark of marks) {
    const hovering = snapshot.markerHoverId === mark.id
    const summary = mark.empty === true ? t('detail.emptyRequirement') : String(mark.summary ?? '')
    const title = `#${mark.index} · ${summary}${mark.stale === true ? ` · ${t('popover.status.changed')}` : ''}`
    const badgeInside = mark.rect !== null && typeof mark.rect === 'object' && typeof mark.rect.y === 'number' && mark.rect.y < 12
    nodes.push(React.createElement('div', {
      key: `mark-${mark.id}`,
      className: 'psa-mark',
      'data-psa-mark': '',
      'data-psa-mark-id': mark.id,
      'data-psa-mark-index': String(mark.index),
      'data-psa-mark-state': hovering ? 'hovering' : 'marked',
      'data-psa-mark-stale': mark.stale === true ? 'changed' : undefined,
      'data-psa-mark-badge-inside': badgeInside ? 'true' : undefined,
      'data-psa-own': '',
      'aria-hidden': 'true',
      style: annotationRectStyle(mark.rect)
    },
    React.createElement('span', {
      className: 'psa-mark-badge',
      'data-psa-mark-badge': '',
      'data-psa-mark-empty': mark.empty === true ? 'true' : undefined,
      'data-psa-mark-stale': mark.stale === true ? 'changed' : undefined,
      title
    },
    React.createElement('span', { className: 'psa-mark-badge-index' }, `#${mark.index}`),
    mark.stale === true ? React.createElement('span', { className: 'psa-mark-badge-stale', 'aria-hidden': 'true' }, '!') : null,
    React.createElement('span', { className: 'psa-mark-badge-text' }, summary))))
  }
  return nodes
}

/**
 * Hover, selection, marquee, mark, and re-locate flash rectangles.
 * @param {{ snapshot: object, t: Function }} props - surface props.
 * @returns {object} the highlight layer.
 */
function AnnotationHighlights(props: AnnotationHighlightsProps) {
  const { snapshot, t } = props
  const state = snapshot.state
  const boxes = []
  if (snapshot.hoverRect !== null) {
    boxes.push(React.createElement('div', {
      key: 'hover',
      className: 'psa-hover',
      'data-psa-hover': '',
      'data-psa-own': '',
      style: annotationRectStyle(snapshot.hoverRect)
    }))
  }
  const multi = state.selection.length > 1
  for (const item of snapshot.selectionRects) {
    boxes.push(React.createElement('div', {
      key: `${multi ? 'multi' : 'selection'}-${item.id}`,
      className: multi ? 'psa-multi' : 'psa-selection',
      'data-psa-selection': multi ? undefined : '',
      'data-psa-multi-outline': multi ? '' : undefined,
      'data-psa-ref': item.id,
      'data-psa-flash': snapshot.flashRefId === item.id ? 'true' : undefined,
      'data-psa-own': '',
      style: annotationRectStyle(item.rect)
    }))
  }
  if (snapshot.flashRect !== null) {
    boxes.push(React.createElement('div', {
      key: 'flash',
      className: 'psa-flash-outline',
      'data-psa-flash': snapshot.flashRefId ?? '',
      'data-psa-own': '',
      style: annotationRectStyle(snapshot.flashRect)
    }))
  }
  if (snapshot.boxRect !== null) {
    boxes.push(React.createElement('div', {
      key: 'box',
      className: 'psa-box',
      'data-psa-box': '',
      'data-psa-own': '',
      style: annotationRectStyle(snapshot.boxRect)
    }))
  }
  boxes.push(...annotationMarkElements(snapshot, t))
  return React.createElement('div', { className: 'psa-layer', 'data-psa-layer': '', 'data-psa-own': '' }, boxes)
}

/**
 * The constant narrow right tool rail; its inner view swaps in place.
 * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
 * @returns {object} the rail.
 */
function AnnotationRail(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const state = snapshot.state
  const collapsed = snapshot.railCollapsed
  const count = state.collection.length
  const title = t('sidebar.title')
  const collapseButton = React.createElement('button', {
    type: 'button',
    className: 'psa-icon-btn',
    'data-psa-collapse': '',
    'data-psa-own': '',
    'aria-label': collapsed ? t('rail.expand') : t('rail.collapse'),
    title: collapsed ? t('rail.expand') : t('rail.collapse'),
    onClick: () => controller.toggleRailCollapsed()
  }, AnnotationChevron(collapsed ? 'right' : 'left'))
  const settingsButton = React.createElement('button', {
    type: 'button',
    className: 'psa-icon-btn',
    'data-psa-open-modifier-settings': '',
    'data-psa-own': '',
    'aria-label': t('settings.open'),
    'aria-expanded': snapshot.settingsOpen === true ? 'true' : 'false',
    'aria-haspopup': 'dialog',
    'aria-controls': 'psa-modifier-settings-popover',
    title: t('settings.open'),
    onClick: () => controller.toggleSettingsOpen()
  }, glyph(icons.information, 15))
  const exitButton = React.createElement('button', {
    type: 'button',
    className: 'psa-icon-btn',
    'data-psa-exit': '',
    'data-psa-own': '',
    'aria-label': t('rail.exit'),
    title: t('rail.exit'),
    onClick: () => controller.requestExit()
  }, glyph(icons.close, 14))
  if (collapsed) {
    return React.createElement('aside', {
      className: 'psa-rail',
      'data-psa-rail': '',
      'data-psa-own': '',
      'data-psa-collapsed': 'true',
      'data-psa-mode': snapshot.layoutMode,
      'data-psa-view': state.view,
      role: 'complementary',
      'aria-label': t('rail.aria')
    },
    React.createElement('div', { className: 'psa-rail-header' },
      collapseButton,
      settingsButton,
      count > 0
        ? React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-open-collection': '',
          'data-psa-own': '',
          'aria-label': t('rail.openCollection'),
          title: t('rail.openCollection'),
          style: { width: 'auto', minHeight: '22px', padding: '0 4px' },
          onClick: () => {
            controller.toggleRailCollapsed()
            controller.openView('collection')
          }
        }, String(count))
        : null,
      exitButton))
  }
  const footer = annotationCollectionFooter(t, controller, snapshot)
  return React.createElement('aside', {
    className: 'psa-rail',
    'data-psa-rail': '',
    'data-psa-own': '',
    'data-psa-mode': snapshot.layoutMode,
    'data-psa-view': state.view,
    role: 'complementary',
    'aria-label': t('rail.aria')
  },
  React.createElement('div', { className: 'psa-rail-header' },
    React.createElement('span', { className: 'psa-dot', 'aria-hidden': true }),
    React.createElement('span', { className: 'psa-rail-title psa-sb-rail-title', title }, title),
    state.view === 'collection'
      ? React.createElement('span', {
        className: 'psa-sb-total',
        'data-psa-total-badge': '',
        'data-psa-own': '',
        title: t('sidebar.subtitle')
      }, String(annotationSidebarCounts(state.collection, controller.currentSessionId()).items))
      : null,
    settingsButton,
    collapseButton,
    exitButton),
  React.createElement('div', { className: 'psa-rail-body', 'data-psa-rail-panel': state.view === 'settings' ? 'collection' : state.view, 'data-psa-own': '' },
    AnnotationCollectionView({ t, controller, snapshot })),
  footer,
  snapshot.settingsOpen === true ? AnnotationModifierSettingsPopover({ t, controller, snapshot }) : null)
}

/**
 * Rail status view: mode state, selection guidance, and the two view switches.
 * @param {{ t: Function, controller: object, snapshot: object }} props - rail props.
 * @returns {object} the status view.
 */
function AnnotationStatusView(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const state = snapshot.state
  const count = state.collection.length
  const selection = state.selection
  const settings = snapshot.settings
  const hint = t('rail.hint', {
    passThrough: t(`modifier.${settings.passThroughModifier}`),
    multi: t(`modifier.${settings.multiModifier}`)
  })
  const status = selection.length === 0
    ? t('rail.status.idle')
    : (selection.length === 1 ? t('rail.status.selected') : t('rail.status.multi', { count: selection.length }))
  const nodes = [
    React.createElement('div', { key: 'status', className: 'psa-rail-section' },
      React.createElement('div', { className: 'psa-status-line psa-status-strong' }, status),
      selection.length === 1
        ? React.createElement('div', { className: 'psa-muted psa-truncate', title: elementLabel(selection[0]) }, `${t('rail.selectedName')} · ${elementLabel(selection[0])}`)
        : null,
      selection.length === 1 && selection[0]?.locator?.surface === 'floating'
        ? React.createElement('div', {
          className: 'psa-muted',
          'data-psa-surface-badge': 'floating',
          'data-psa-own': ''
        }, `${t('rail.surfaceFloating')} · ${t('rail.surfaceTransient')}`)
        : null,
      React.createElement('div', { className: 'psa-muted' }, hint))
  ]
  if (selection.length > 1) {
    nodes.push(React.createElement('div', { key: 'multi', className: 'psa-rail-section' },
      React.createElement('button', {
        type: 'button',
        className: 'psa-btn psa-btn-primary',
        'data-psa-add-multi': '',
        'data-psa-save-group': '',
        'data-psa-own': '',
        onClick: () => controller.commitSelection()
      }, t('batch.saveGroup')),
      React.createElement('button', {
        type: 'button',
        className: 'psa-btn',
        'data-psa-own': '',
        onClick: () => controller.clearSelection()
      }, t('rail.clearSelection'))))
  }
  nodes.push(React.createElement('div', { key: 'nav', className: 'psa-rail-section' },
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-open-collection': '',
      'data-psa-own': '',
      onClick: () => controller.openView('collection')
    },
    React.createElement('span', null, t('rail.openCollection')),
    React.createElement('span', { className: 'psa-btn-count' }, String(count))),
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-open-modifier-settings': '',
      'data-psa-own': '',
      onClick: () => controller.toggleSettingsOpen()
    },
    React.createElement('span', null, t('settings.open')),
    glyph(icons.information, 13))))
  return React.createElement(React.Fragment, null, nodes)
}

/**
 * A3/T25: the redesigned annotation sidebar body — header subtitle, filter
 * chips with live counts, scope/tools, scrollable unified list (single rows +
 * group cards), empty states. Shell tokens only; no new dependencies.
 * @param {{ t: Function, controller: object, snapshot: object }} props - rail props.
 * @returns {object} the sidebar body.
 */
function AnnotationCollectionView(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const state = snapshot.state
  const entries = state.collection
  const sessionId = controller.currentSessionId()
  const counts = annotationSidebarCounts(entries, sessionId)
  const scopeCounts = annotationScopeCounts(entries, sessionId)
  const filter = state.filter === 'single' || state.filter === 'group' ? state.filter : 'all'
  const filtered = annotationFilterEntries(entries, filter)
  /**
   * @param {'all' | 'single' | 'group'} key - filter id.
   * @param {number} count - rendered count.
   * @returns {object} one filter chip.
   */
  const filterLabel = (key: 'all' | 'single' | 'group', count: number) => React.createElement('button', {
    key,
    type: 'button',
    className: 'psa-sb-filter',
    'data-psa-filter': key,
    'data-psa-own': '',
    'aria-pressed': filter === key ? 'true' : 'false',
    onClick: () => controller.setFilter(key)
  },
  React.createElement('span', null, t(`sidebar.filter.${key}`)),
  React.createElement('span', { className: 'psa-sb-filter-count' }, String(counts[key])))
  const nodes = [
    React.createElement('div', { key: 'head', className: 'psa-sb-head' },
      React.createElement('div', { className: 'psa-sb-subtitle' }, t('sidebar.subtitle')),
      React.createElement('div', {
        key: 'hint',
        className: 'psa-sb-hint',
        'data-psa-selection-hint': '',
        'data-psa-own': ''
      },
      state.selection.length > 0
        ? `${t('rail.status.multi', { count: state.selection.length })} · ${t('sidebar.addHint')}`
        : t('sidebar.hint', {
          passThrough: t(`modifier.${snapshot.settings.passThroughModifier}`),
          multi: t(`modifier.${snapshot.settings.multiModifier}`)
        }))),
    React.createElement('div', { key: 'filters', className: 'psa-sb-filters', 'data-psa-filters': '', 'data-psa-own': '' },
      filterLabel('all', counts.all), filterLabel('single', counts.single), filterLabel('group', counts.group)),
    React.createElement('div', {
      key: 'scope',
      className: 'psa-muted psa-sb-scope',
      'data-psa-scope-counts': '',
      'data-psa-current-count': String(scopeCounts.current),
      'data-psa-other-count': String(scopeCounts.other),
      'data-psa-included-count': String(scopeCounts.included)
    }, t('collection.countScope', { current: scopeCounts.current, other: scopeCounts.other })),
    React.createElement('div', { key: 'tools', className: 'psa-sb-tools', 'data-psa-rail-tools': '', 'data-psa-own': '' },
      React.createElement('button', {
        type: 'button',
        className: 'psa-sb-tool',
        'data-psa-select-all': '',
        'data-psa-own': '',
        title: t('collection.selectAllCurrent'),
        'aria-label': t('collection.selectAllCurrent'),
        disabled: scopeCounts.current === 0 || scopeCounts.included === scopeCounts.current,
        onClick: () => controller.selectAllCurrent()
      }, t('collection.selectAllCurrent')),
      React.createElement('button', {
        type: 'button',
        className: 'psa-sb-tool',
        'data-psa-deselect-all': '',
        'data-psa-own': '',
        title: t('collection.deselectAll'),
        'aria-label': t('collection.deselectAll'),
        disabled: scopeCounts.included === 0,
        onClick: () => controller.deselectAll()
      }, t('collection.deselectAll')),
      React.createElement('button', {
        type: 'button',
        className: 'psa-sb-tool psa-sb-tool-primary',
        'data-psa-insert-batch': '',
        'data-psa-own': '',
        title: t('collection.insertChip'),
        'aria-label': t('collection.insertChip'),
        disabled: scopeCounts.included === 0,
        onClick: () => controller.insertBatch()
      }, t('collection.insertBatch')),
      React.createElement('button', {
        type: 'button',
        className: 'psa-sb-tool psa-sb-tool-danger',
        'data-psa-delete-selected': '',
        'data-psa-own': '',
        title: t('collection.deleteSelected'),
        'aria-label': t('collection.deleteSelected'),
        disabled: scopeCounts.included === 0,
        onClick: () => controller.removeSelected()
      }, t('collection.deleteSelected'))),
    React.createElement('div', { key: 'sort', className: 'psa-sb-sort' }, t('collection.sortHint'))
  ]
  if (sessionId === null && entries.length > 0) {
    nodes.push(React.createElement('div', { key: 'no-session', className: 'psa-sb-note', 'data-psa-no-session': '', 'data-psa-own': '' },
      t('feedback.noComposer')))
  } else if (scopeCounts.other > 0) {
    nodes.push(React.createElement('div', { key: 'other', className: 'psa-sb-note', 'data-psa-other-notice': '' },
      t('collection.crossSession', { count: scopeCounts.other })))
  }
  if (entries.length >= ANNOTATION_RECORD_LIMIT) {
    nodes.push(React.createElement('div', {
      key: 'cap',
      className: 'psa-sb-note psa-sb-max',
      'data-psa-max-reached': '',
      'data-psa-own': ''
    }, t('collection.maxReached', { limit: ANNOTATION_RECORD_LIMIT })))
  }
  const list = []
  if (entries.length === 0) {
    list.push(React.createElement('div', { key: 'empty', className: 'psa-sb-empty', 'data-psa-empty': '', 'data-psa-own': '' },
      React.createElement('div', { className: 'psa-sb-empty-icon', 'aria-hidden': 'true' }, glyph(icons.listCheck, 18)),
      React.createElement('div', { className: 'psa-sb-empty-title' }, t('sidebar.emptyTitle')),
      React.createElement('div', { className: 'psa-sb-empty-hint' }, t('sidebar.emptyHint'))))
  } else if (filtered.length === 0) {
    list.push(React.createElement('div', { key: 'filter-empty', className: 'psa-sb-empty', 'data-psa-filter-empty': '', 'data-psa-own': '' },
      React.createElement('div', { className: 'psa-sb-empty-hint' }, t('sidebar.filterEmpty'))))
  } else {
    const ordinals = annotationEntryOrdinals(entries)
    filtered.forEach((entry) => {
      const index = entries.indexOf(entry)
      const ordinal = ordinals[index] ?? (index + 1)
      list.push(annotationIsGroup(entry)
        ? React.createElement(AnnotationGroupRow, { key: entry.id, t, controller, snapshot, entry, index, ordinal })
        : React.createElement(AnnotationEntryRow, { key: entry.id, t, controller, snapshot, entry, index, ordinal }))
    })
  }
  nodes.push(React.createElement('div', {
    key: 'list',
    className: 'psa-sb-list',
    'data-psa-sidebar-list': '',
    'data-psa-filter-active': filter,
    role: 'list'
  }, list))
  return React.createElement(React.Fragment, null, nodes)
}

/**
 * A3/T24: one batch group card in the collection view (phase-1 minimal; the
 * full redesigned sidebar lands in phase 2). The card shows the shared
 * requirement, the item count, expand/collapse, include/move/delete and — when
 * expanded — one child row per selected element with its locator/status,
 * preview and remove actions.
 * @param {{ t: Function, controller: object, snapshot: object, entry: object, index: number }} props - row props.
 * @returns {object} the group card.
 */
function AnnotationGroupRow(props: AnnotationEntryRowProps) {
  const { t, controller, entry: rawEntry, index, ordinal } = props
  const entry = annotationEntryView(rawEntry)
  const scope = controller.collectionScopeOf(entry)
  const included = scope === 'current' && entry.included !== false
  const expanded = entry.collapsed !== true
  const items = annotationGroupItems(entry) as unknown as AnnotationComponentEntry[]
  const requirement = typeof entry.requirement === 'string' ? entry.requirement : ''
  const summary = annotationMarkerBadgeText(requirement, 32)
  const sessionId = entry.session !== null && typeof entry.session === 'object' ? entry.session.sessionId : null
  return React.createElement('div', {
    className: 'psa-entry psa-group',
    'data-psa-entry': '',
    'data-psa-group': '',
    'data-psa-own': '',
    'data-psa-ref': entry.id,
    'data-psa-entry-scope': scope,
    'data-psa-status': scope === 'current' ? 'group' : 'other',
    'data-psa-entry-included': included ? 'true' : 'false',
    'data-psa-group-collapsed': entry.collapsed === true ? 'true' : 'false'
  },
  React.createElement('div', { className: 'psa-entry-head' },
    React.createElement('label', {
      className: 'psa-entry-check',
      'data-psa-own': '',
      title: scope === 'current' ? t('collection.include') : t('collection.otherSessionHint')
    },
    React.createElement('input', {
      type: 'checkbox',
      checked: included,
      disabled: scope !== 'current',
      'data-psa-own': '',
      onChange: (event: AnnotationUiEvent) => controller.setEntryIncluded(entry.id, event.currentTarget.checked === true)
    })),
    React.createElement('span', { className: 'psa-entry-index' }, `#${ordinal ?? (index + 1)}`),
    React.createElement('button', {
      type: 'button',
      className: 'psa-entry-name',
      'data-psa-group-preview': '',
      'data-psa-own': '',
      title: t('collection.groupPreview'),
      onClick: () => controller.toggleGroup(entry.id)
    }, summary.text.length > 0 ? summary.text : t('collection.groupUntitled')),
    React.createElement('span', { className: 'psa-badge psa-sb-type', 'data-psa-type-badge': 'group', 'data-psa-own': '' },
      t('sidebar.groupBadge', { count: items.length })),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-group-toggle': '',
      'data-psa-own': '',
      'aria-expanded': expanded ? 'true' : 'false',
      'aria-label': expanded ? t('collection.collapse') : t('collection.expand'),
      title: expanded ? t('collection.collapse') : t('collection.expand'),
      onClick: () => controller.toggleGroup(entry.id)
    }, AnnotationChevron(expanded ? 'down' : 'right'))),
  React.createElement('div', { className: 'psa-entry-meta psa-sb-meta', 'data-psa-own': '' },
    `${sessionShortLabel(sessionId) || t('insert.noSession')} · ${t('sidebar.updated', { time: formatAnnotationTime(entry.updatedAt || entry.createdAt || entry.at) })}`),
  React.createElement('div', { className: 'psa-entry-locator psa-sb-selector', 'data-psa-own': '', title: describeLocator(items[0] ?? entry) },
    `${t('sidebar.selector')} ${describeLocator(items[0] ?? entry)}`),
  React.createElement('div', { className: 'psa-sb-page', 'data-psa-own': '' },
    `${t('sidebar.page')} ${items[0]?.route || '—'} · ${t('sidebar.area')} ${items[0]?.component || '—'}`),
  React.createElement('div', { className: 'psa-rainbow-field', 'data-psa-own': '' },
    React.createElement('textarea', {
      className: 'psa-entry-note',
      'data-psa-group-requirement': '',
      'data-psa-own': '',
      rows: 2,
      value: requirement,
      placeholder: t('collection.groupRequirementPlaceholder'),
      'aria-label': t('collection.groupRequirementPlaceholder'),
      onChange: (event: AnnotationUiEvent) => controller.updateCollectionNote(entry.id, event.target.value)
    })),
  React.createElement('div', { className: 'psa-entry-actions', 'data-psa-own': '' },
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-group-insert': '',
      'data-psa-own': '',
      disabled: scope !== 'current',
      title: scope === 'current' ? t('collection.insertChip') : t('collection.otherSessionHint'),
      onClick: () => controller.insertBatch()
    }, glyph(icons.listCheck, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-group-edit': '',
      'data-psa-own': '',
      'aria-label': t('collection.expandNote'),
      title: t('collection.expandNote'),
      onClick: () => controller.openNoteEditor(entry.id)
    }, glyph(icons.annotationCopy, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-group-move-up': '',
      'data-psa-own': '',
      disabled: index === 0,
      title: t('collection.moveUp'),
      onClick: () => controller.moveEntry(entry.id, -1)
    }, glyph(icons.arrowUp, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-group-move-down': '',
      'data-psa-own': '',
      disabled: index >= (props.snapshot.state.collection.length - 1),
      title: t('collection.moveDown'),
      onClick: () => controller.moveEntry(entry.id, 1)
    }, glyph(icons.arrowDown, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn psa-detail-danger',
      'data-psa-group-remove': '',
      'data-psa-own': '',
      'aria-label': t('collection.remove'),
      title: t('collection.remove'),
      onClick: () => controller.removeEntry(entry.id)
    }, glyph(icons.delete, 13))),
  expanded
    ? React.createElement('div', { className: 'psa-group-items', 'data-psa-group-items': '' },
      items.map((item, itemIndex) => {
        const itemStatus = scope === 'current' ? controller.statusOf(item) : 'other'
        return React.createElement('div', {
          key: item.id,
          className: 'psa-group-item',
          'data-psa-group-item': '',
          'data-psa-own': '',
          'data-psa-ref': item.id
        },
        React.createElement('span', { className: 'psa-entry-index' }, `#${ordinal ?? (index + 1)}.${itemIndex + 1}`),
        React.createElement('button', {
          type: 'button',
          className: 'psa-group-item-name',
          'data-psa-group-item-preview': '',
          'data-psa-own': '',
          title: t('collection.preview'),
          onClick: () => controller.previewEntry(item.id)
        }, elementLabel(item)),
        React.createElement('span', {
          className: 'psa-status-dot',
          'data-psa-status': itemStatus,
          'data-psa-own': '',
          title: t(`popover.status.${itemStatus}`)
        }),
        React.createElement('span', { className: 'psa-group-item-locator', 'data-psa-own': '' }, describeLocator(item)),
        React.createElement('span', { className: 'psa-sb-child-time', 'data-psa-own': '' },
          formatAnnotationTime(item.updatedAt || item.at)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-group-item-edit': '',
          'data-psa-own': '',
          'aria-label': t('sidebar.edit'),
          title: t('sidebar.edit'),
          onClick: () => controller.previewEntry(item.id)
        }, glyph(icons.annotationCopy, 12)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn psa-detail-danger',
          'data-psa-group-item-remove': '',
          'data-psa-own': '',
          'aria-label': t('collection.remove'),
          title: t('collection.remove'),
          onClick: () => controller.removeGroupItem(entry.id, item.id)
        }, glyph(icons.delete, 12)))
      }))
    : null)
}

/**
 * A3/T29: secondary confirmation shown when leaving the mode would clear
 * annotation records. Cancel leaves everything untouched; Clear & exit clears
 * all records, flushes the empty document and exits.
 * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
 * @returns {object | null} the confirmation dialog.
 */
function AnnotationExitConfirm(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const confirm = snapshot.exitConfirm
  if (confirm === null) return null
  return React.createElement('div', {
    className: 'psa-exit-confirm',
    'data-psa-exit-confirm': '',
    'data-psa-exit-count': String(confirm.count),
    'data-psa-own': '',
    role: 'alertdialog',
    'aria-modal': 'true',
    'aria-label': t('exitConfirm.title')
  },
  React.createElement('div', { className: 'psa-exit-confirm-title', 'data-psa-own': '' }, t('exitConfirm.title')),
  React.createElement('div', { className: 'psa-exit-confirm-message', 'data-psa-own': '' },
    t('exitConfirm.message', { count: confirm.count })),
  React.createElement('div', { className: 'psa-exit-confirm-actions', 'data-psa-own': '' },
    React.createElement('button', {
      type: 'button',
      className: 'psa-sb-tool',
      'data-psa-exit-cancel': '',
      'data-psa-own': '',
      onClick: () => controller.cancelExitConfirm()
    }, t('exitConfirm.cancel')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-exit-confirm-danger',
      'data-psa-exit-clear': '',
      'data-psa-own': '',
      onClick: () => controller.confirmExitClear()
    }, t('exitConfirm.clear'))))
}

/**
 * One collection row (A3/T8): include checkbox (other-Session rows disabled),
 * index, element label → preview, status, Session/Workspace/surface metadata,
 * locator, inline rainbow note editor, and the per-row actions.
 * @param {{ t: Function, controller: object, snapshot: object, entry: object, index: number }} props - row props.
 * @returns {object} the row.
 */
function AnnotationEntryRow(props: AnnotationEntryRowProps) {
  const { t, controller, entry: rawEntry, index, ordinal } = props
  const entry = annotationEntryView(rawEntry)
  const scope = controller.collectionScopeOf(entry)
  // A resolution chip only means something for the current page's Session; for
  // another Session the row is marked `other` instead of claiming a live match (F9).
  const statusDetail = scope === 'current' ? controller.statusDetailOf(entry) : null
  const status = statusDetail === null ? 'other' : statusDetail.status
  const confidence = statusDetail !== null && typeof statusDetail === 'object' ? (statusDetail.confidence ?? 'strong') : 'strong'
  const statusLabel = status !== 'other' ? t(annotationStatusLabelKey(status, confidence)) : ''
  const locator = describeLocator(entry)
  const included = scope === 'current' && entry.included !== false
  const sessionId = entry.session !== null && typeof entry.session === 'object' ? entry.session.sessionId : null
  const metadata = []
  metadata.push(`${t('detail.session')} ${sessionShortLabel(sessionId) || t('insert.noSession')}`)
  const workspace = entry.session !== null && typeof entry.session === 'object'
    ? (entry.session.workspaceLabel || annotationWorkspaceLabel(entry.session.cwd))
    : null
  if (typeof workspace === 'string' && workspace.length > 0) metadata.push(`${t('detail.workspace')} ${workspace}`)
  const face = entry.locator !== null && typeof entry.locator === 'object' ? entry.locator.surface : 'page'
  if (face === 'floating') metadata.push(t('rail.surfaceFloating'))
  return React.createElement('div', {
    className: 'psa-entry',
    'data-psa-entry': '',
    'data-psa-own': '',
    'data-psa-ref': entry.id,
    'data-psa-entry-scope': scope,
    'data-psa-status': status,
    'data-psa-confidence': confidence,
    'data-psa-via': statusDetail !== null && typeof statusDetail === 'object' ? (statusDetail.via ?? '') : '',
    'data-psa-entry-included': included ? 'true' : 'false'
  },
  React.createElement('div', { className: 'psa-entry-head' },
    React.createElement('label', {
      className: 'psa-entry-check',
      'data-psa-entry-include': '',
      'data-psa-own': '',
      title: scope === 'current' ? t('collection.include') : t('collection.otherSessionHint')
    },
    React.createElement('input', {
      type: 'checkbox',
      checked: included,
      disabled: scope !== 'current',
      'data-psa-own': '',
      onChange: (event: AnnotationUiEvent) => controller.setEntryIncluded(entry.id, event.currentTarget.checked === true)
    })),
    React.createElement('span', { className: 'psa-entry-index' }, `#${ordinal ?? (index + 1)}`),
    React.createElement('span', { className: 'psa-sb-type', 'data-psa-type-badge': 'single', 'data-psa-own': '' },
      t('sidebar.type.single')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-entry-name',
      'data-psa-entry-relocate': '',
      'data-psa-entry-preview': '',
      'data-psa-own': '',
      title: scope === 'current' ? t('collection.preview') : t('collection.otherSessionHint'),
      onClick: () => controller.previewEntry(entry.id)
    }, elementLabel(entry)),
    scope === 'other'
      ? React.createElement('span', { className: 'psa-badge', 'data-psa-own': '' }, t('collection.otherSession'))
      : React.createElement('span', {
        className: 'psa-status-dot',
        'data-psa-status': status,
        'data-psa-own': '',
        'data-psa-confidence': confidence,
        title: statusLabel,
        'aria-label': statusLabel
      })),
  React.createElement('div', { className: 'psa-entry-meta psa-sb-meta', 'data-psa-entry-meta': '', 'data-psa-own': '' },
    `${metadata.join(' · ')} · ${t('sidebar.updated', { time: formatAnnotationTime(entry.updatedAt || entry.at) })}`),
  React.createElement('div', { className: 'psa-entry-locator psa-sb-selector', title: locator },
    `${t('sidebar.selector')} ${locator}`),
  React.createElement('div', { className: 'psa-entry-actions', 'data-psa-own': '' },
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-entry-copy-xpath': '',
      'data-psa-own': '',
      'aria-label': t('popover.copyXPath'),
      title: t('popover.copyXPath'),
      onClick: () => controller.copyXPath(entry.id)
    }, glyph(icons.link, 12)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-entry-copy-js-path': '',
      'data-psa-own': '',
      'aria-label': t('popover.copyJsPath'),
      title: t('popover.copyJsPath'),
      onClick: () => controller.copyJsPath(entry.id)
    }, glyph(icons.fileCopy, 12))),
  React.createElement('div', { className: 'psa-sb-page', 'data-psa-own': '' },
    `${t('sidebar.page')} ${entry.route || '—'} · ${t('sidebar.area')} ${entry.component || '—'}`),
  React.createElement('div', { className: 'psa-rainbow-field', 'data-psa-own': '' },
    React.createElement('textarea', {
      className: 'psa-entry-note',
      'data-psa-entry-note': '',
      'data-psa-own': '',
      rows: 2,
      value: typeof entry.note === 'string' ? entry.note : '',
      placeholder: t('collection.notePlaceholder'),
      'aria-label': t('collection.notePlaceholder'),
      onChange: (event: AnnotationUiEvent) => {
        const textarea = event.currentTarget
        if (textarea !== null && typeof textarea === 'object') {
          textarea.style.height = 'auto'
          textarea.style.height = `${Math.min(textarea.scrollHeight ?? 34, 72)}px`
        }
        controller.updateCollectionNote(entry.id, textarea === null ? '' : textarea.value)
      }
    })),
  React.createElement('div', { className: 'psa-entry-actions', 'data-psa-own': '' },
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn psa-entry-insert',
      'data-psa-entry-insert': '',
      'data-psa-own': '',
      disabled: scope !== 'current',
      title: scope === 'current' ? t('collection.insertChip') : t('collection.otherSessionHint'),
      onClick: () => controller.insertEntryChip(entry.id)
    }, t('collection.insertChip')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-entry-copy-locator': '',
      'data-psa-own': '',
      'aria-label': t('collection.copyLocator'),
      title: t('collection.copyLocator'),
      onClick: () => controller.copyLocator(entry.id)
    }, glyph(icons.annotationCopy, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-entry-expand': '',
      'data-psa-own': '',
      'aria-label': t('collection.expandNote'),
      title: t('collection.expandNote'),
      onClick: () => controller.openNoteEditor(entry.id)
    }, glyph(icons.listCheck, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-entry-move-up': '',
      'data-psa-own': '',
      disabled: index === 0,
      'aria-label': t('collection.moveUp'),
      title: t('collection.moveUp'),
      onClick: () => controller.moveEntry(entry.id, -1)
    }, glyph(icons.arrowUp, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-entry-move-down': '',
      'data-psa-own': '',
      disabled: index >= (props.snapshot.state.collection.length - 1),
      'aria-label': t('collection.moveDown'),
      title: t('collection.moveDown'),
      onClick: () => controller.moveEntry(entry.id, 1)
    }, glyph(icons.arrowDown, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn psa-detail-danger',
      'data-psa-entry-remove': '',
      'data-psa-own': '',
      'aria-label': t('collection.remove'),
      title: t('collection.remove'),
      onClick: () => controller.removeEntry(entry.id)
    }, glyph(icons.delete, 13))))
}

/**
 * A3/T29: sidebar footer with two equal-width actions. The primary saves the
 * current page selection; the danger action is "Cancel Annotation", which asks
 * for confirmation (when records exist), clears all records, flushes the empty
 * v3 document and exits the mode.
 * @param {Function} t - bound translate.
 * @param {object} controller - annotation controller.
 * @param {object} snapshot - current snapshot.
 * @returns {object} footer element.
 */
function annotationCollectionFooter(t: DshTranslate, controller: AnnotationController, snapshot: AnnotationSnapshot) {
  const state = snapshot.state
  const hasSelection = state.selection.length > 0
  const insertBatchPrimary = !hasSelection && state.collection.length > 0
  return React.createElement('div', { className: 'psa-sb-footer', 'data-psa-sidebar-footer': '', 'data-psa-own': '' },
    React.createElement('button', {
      type: 'button',
      className: 'psa-sb-primary',
      'data-psa-add-annotation': '',
      'data-psa-own': '',
      title: hasSelection
        ? t('batch.saveGroup')
        : (insertBatchPrimary ? t('collection.insertBatch') : t('sidebar.addAnnotation')),
      onClick: () => controller.primaryAddAnnotation()
    }, hasSelection
      ? (state.selection.length > 1 ? t('batch.saveGroup') : t('popover.commit'))
      : (insertBatchPrimary ? t('collection.insertBatch') : t('sidebar.addAnnotation'))),
    React.createElement('button', {
      type: 'button',
      className: 'psa-sb-danger',
      'data-psa-clear-selection': '',
      'data-psa-clear': '',
      'data-psa-cancel-annotation': '',
      'data-psa-own': '',
      title: t('sidebar.cancelAnnotation'),
      onClick: () => controller.requestExit()
    }, t('sidebar.cancelAnnotation')))
}

/**
 * A3/T55: custom segmented control for one modifier (radiogroup semantics).
 * Four always-visible segments (Alt/Ctrl/Meta/Shift); roving tabindex, arrow /
 * Home / End selection, click/Enter/Space select; the rainbow focus ring wraps
 * the whole control via `.psa-rainbow-field`. No listbox/menu/native select.
 * @param {{ t: Function, controller: object, fieldName: string, value: string, dataAttribute: string, labelId: string }} props - segmented props.
 * @returns {object} radiogroup.
 */
function AnnotationModifierSegmented(props: AnnotationModifierSegmentedProps) {
  const { t, controller, fieldName, value, dataAttribute, labelId } = props
  const groupId = `psa-modifier-group-${fieldName}`
  const buttonRefs = React.useRef<Array<HTMLElement | null>>([])
  /**
   * Select one segment through the controller (persist + conflict feedback).
   * @param {number} index - segment index.
   * @param {boolean} focus - focus the segment after selection.
   * @returns {void}
   */
  const selectSegment = (index: number, focus: boolean): void => {
    const choice = MODIFIER_CHOICES[index]
    if (typeof choice === 'string') controller.setModifier(fieldName, choice)
    if (focus === true) {
      const node = buttonRefs.current[index]
      if (node !== null && node !== undefined && typeof node.focus === 'function') node.focus({ preventScroll: true })
    }
  }
  /**
   * Keyboard handling for the radiogroup (automatic activation).
   * @param {object} event - keydown event.
   * @param {number} index - focused segment index.
   * @returns {void}
   */
  const onSegmentKeyDown = (event: AnnotationUiEvent, index: number): void => {
    let move = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move = 'next'
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move = 'prev'
    else if (event.key === 'Home') move = 'first'
    else if (event.key === 'End') move = 'last'
    if (move !== null) {
      event.preventDefault()
      selectSegment(annotationSegmentedIndex(index, move, MODIFIER_CHOICES.length), true)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectSegment(index, true)
    }
  }
  return React.createElement('span', { className: 'psa-rainbow-field', 'data-psa-own': '', style: { display: 'block', minWidth: '0' } },
    React.createElement('div', {
      className: 'psa-segmented',
      id: groupId,
      role: 'radiogroup',
      'aria-labelledby': labelId,
      'data-psa-own': '',
      [dataAttribute]: '',
      'data-psa-modifier-group': fieldName
    }, MODIFIER_CHOICES.map((choice, index) => React.createElement('button', {
      key: choice,
      ref: (node: unknown) => { buttonRefs.current[index] = node as HTMLElement | null },
      type: 'button',
      role: 'radio',
      className: 'psa-segmented-option',
      id: `${groupId}-${choice}`,
      'data-psa-own': '',
      'data-psa-modifier-option': choice,
      'aria-label': t(`modifier.${choice}`),
      'aria-checked': choice === value ? 'true' : 'false',
      tabIndex: choice === value ? 0 : -1,
      onClick: () => selectSegment(index, false),
      onKeyDown: (event: AnnotationUiEvent) => onSegmentKeyDown(event, index)
    }, annotationSegmentDisplayLabel(t(`modifier.${choice}`))))))
}

/**
 * A3/T51 (redirected design): transient borderless modifier-settings popover
 * anchored to the header info icon. It is NOT a rail view: no gear/back panel,
 * Esc/outside clicks close it, and it never traps focus.
 * @param {{ t: Function, controller: object, snapshot: object }} props - popover props.
 * @returns {object} fixed popover portal.
 */
function AnnotationModifierSettingsPopover(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  /** @type {import('react').MutableRefObject<HTMLElement | null>} */
  const popoverRef = React.useRef<HTMLElement | null>(null)
  const [position, setPosition] = React.useState<{ left: number, top: number, width: number } | null>(null)
  React.useEffect(() => {
    const trigger = document.querySelector('[data-psa-open-modifier-settings]')
    if (trigger !== null) {
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(320, Math.max(300, window.innerWidth - 16))
      const height = 240
      const left = Math.min(Math.max(Math.round(rect.right - width), 8), Math.max(8, window.innerWidth - width - 8))
      const below = Math.round(rect.bottom + 8)
      const above = Math.round(rect.top - height - 8)
      const top = below + height > window.innerHeight - 8 && above >= 8 ? above : Math.min(below, Math.max(8, window.innerHeight - height - 8))
      setPosition({ left, top, width })
    }
    const onPointerDown = (event: AnnotationUiEvent) => {
      const target = event.target
      if (popoverRef.current !== null && popoverRef.current.contains(target as never)) return
      const trigger = document.querySelector('[data-psa-open-modifier-settings]')
      if (trigger !== null && trigger.contains(target as never)) return
      controller.closeSettingsOpen()
    }
    // A3/T53/T55: document-level Escape closes the popover (no nested menu now).
    const onDocumentKeyDown = (event: AnnotationUiEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      controller.closeSettingsOpen()
    }
    const close = () => controller.closeSettingsOpen()
    document.addEventListener('keydown', onDocumentKeyDown as never, true)
    document.addEventListener('pointerdown', onPointerDown as never, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('keydown', onDocumentKeyDown as never, true)
      document.removeEventListener('pointerdown', onPointerDown as never, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [])
  /**
   * One modifier row inside the popover.
   * @param {string} labelKey - field label.
   * @param {string} dataAttribute - trigger marker.
   * @param {string} fieldName - settings field.
   * @param {string} value - current modifier.
   * @returns {object} row.
   */
  const row = (labelKey: string, dataAttribute: string, fieldName: AnnotationModifierField, value: string) => {
    const labelId = `psa-modifier-label-${fieldName}`
    return React.createElement('div', { className: 'psa-settings-row', 'data-psa-own': '' },
      React.createElement('span', { className: 'psa-settings-row-label', id: labelId }, t(labelKey)),
      React.createElement(AnnotationModifierSegmented, { t, controller, fieldName, value, dataAttribute, labelId }))
  }
  if (position === null) return null
  const settings = snapshot.settings
  const feedback = snapshot.state.feedback === null ? '' : snapshot.state.feedback.text
  return React.createElement('div', {
    ref: popoverRef,
    id: 'psa-modifier-settings-popover',
    className: 'psa-settings-popover',
    'data-psa-settings-popover': '',
    'data-psa-own': '',
    role: 'dialog',
    'aria-label': t('settings.title'),
    style: { left: `${position.left}px`, top: `${position.top}px`, width: `${position.width}px` }
  },
  React.createElement('div', { className: 'psa-settings-title' }, t('settings.title')),
  row('settings.passThrough', 'data-psa-setting-passthrough', 'passThroughModifier', settings.passThroughModifier),
  row('settings.multi', 'data-psa-setting-multi', 'multiModifier', settings.multiModifier),
  React.createElement('div', {
    className: 'psa-settings-feedback',
    'data-psa-settings-feedback': '',
    role: 'status',
    'aria-live': 'polite'
  }, feedback),
  React.createElement('div', { className: 'psa-settings-note' }, t('settings.hint')))
}

/**
 * Hover detail card for one current-Session annotation (A3/T6).
 *
 * Opens after 120 ms of pointer rest on a page mark, anchored beside the mark
 * with side/vertical flip and viewport clamping; the pointer may move into the
 * card (keep-open union). It never steals focus on hover; explicit actions
 * (Edit requirement / Add requirement) may focus their textarea.
 * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
 * @returns {object | null} the detail card.
 */
function AnnotationDetailCard(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const card = snapshot.detailCard
  /** Requirement draft; uncontrolled so hover reopen never fights the record value. */
  /** @type {import('react').MutableRefObject<HTMLTextAreaElement | null>} */
  const noteRef = React.useRef<{ value: string } | null>(null)
  const setDetailNode = React.useCallback((node: unknown) => {
    if (node === null || node === undefined) controller.detachDetailNode()
    else controller.attachDetailNode(node as Element)
  }, [controller])
  if (card === null) return null
  const found = snapshot.state.collection.find((entry) => entry.id === card.refId)
  if (found === undefined) return null
  const record = annotationRecordView(found)
  const status = controller.statusOf(record)
  const editing = card.mode === 'edit'
  const locator = annotationLocatorText(record)
  const mark = (Array.isArray(snapshot.markRects) ? snapshot.markRects : []).find((item) => item.id === record.id)
  const liveBounds = mark !== undefined && mark.rect !== null ? mark.rect : normalizeAnnotationBounds(record.bounds)
  const bounds = liveBounds ?? { x: 0, y: 0, width: 0, height: 0 }
  const positionText = `${Math.round(bounds.x)}, ${Math.round(bounds.y)} · ${Math.round(bounds.width)}×${Math.round(bounds.height)}`
  const sessionId = record.session !== null && typeof record.session === 'object' ? record.session.sessionId : null
  const sessionText = `${sessionShortLabel(sessionId) || t('insert.noSession')} · ${formatAnnotationTime(record.at)}`
  const cwd = record.session !== null && typeof record.session === 'object' ? record.session.cwd : null
  const workspaceText = (record.session !== null && typeof record.session === 'object' ? record.session.workspaceLabel : null)
    || annotationWorkspaceLabel(cwd)
    || '—'
  const surface = record.locator !== null && typeof record.locator === 'object' ? record.locator.surface : 'page'
  const ephemeral = record.locator !== null && typeof record.locator === 'object' && record.locator.ephemeral === true
  const requirement = typeof record.note === 'string' ? record.note : ''
  /**
   * One metadata row.
   * @param {string} label - localized label.
   * @param {string} value - display value.
   * @param {string} marker - data attribute for E2E.
   * @returns {Array<object>} dt/dd pair.
   */
  const metaRow = (label: string, value: string, marker: string) => React.createElement(React.Fragment, null,
    React.createElement('dt', null, label),
    React.createElement('dd', { [marker]: '' }, value))
  return React.createElement('div', {
    ref: setDetailNode,
    className: 'psa-detail-card',
    'data-psa-detail': '',
    'data-psa-own': '',
    'data-psa-detail-ref': record.id,
    'data-psa-detail-mode': card.mode,
    'data-psa-status': status,
    role: 'dialog',
    'aria-label': t('detail.title'),
    style: { left: `${card.x}px`, top: `${card.y}px` }
  },
  React.createElement('div', { className: 'psa-detail-head', 'data-psa-own': '' },
    React.createElement('span', { className: 'psa-status-dot', 'data-psa-status': status, 'data-psa-own': '' }),
    React.createElement('span', { className: 'psa-detail-title', 'data-psa-detail-title': '' }, elementLabel(record)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-detail-close': '',
      'data-psa-own': '',
      'aria-label': t('detail.close'),
      title: t('detail.close'),
      onClick: () => controller.closeDetailCard()
    }, glyph(icons.close, 14))),
  React.createElement('div', { className: 'psa-detail-section', 'data-psa-own': '' },
    React.createElement('span', { className: 'psa-detail-label' }, t('detail.requirement')),
    editing
      ? React.createElement('div', { className: 'psa-rainbow-field', 'data-psa-own': '' },
        React.createElement('textarea', {
          key: `detail-note-${record.id}`,
          className: 'psa-detail-textarea',
          'data-psa-detail-note': '',
          'data-psa-own': '',
          ref: noteRef,
          defaultValue: requirement,
          rows: 3,
          placeholder: t('popover.notePlaceholder'),
          'aria-label': t('detail.requirement'),
          autoFocus: true
        }))
      : React.createElement('div', {
        className: 'psa-detail-requirement',
        'data-psa-detail-requirement': '',
        'data-psa-own': '',
        'data-psa-detail-empty': requirement.length === 0 ? 'true' : undefined
      }, requirement.length > 0 ? requirement : t('detail.emptyRequirement')),
    !editing && requirement.length === 0
      ? React.createElement('button', {
        type: 'button',
        className: 'psa-btn',
        'data-psa-detail-add': '',
        'data-psa-own': '',
        style: { width: 'auto', alignSelf: 'flex-start' },
        onClick: () => controller.beginDetailEdit()
      }, t('detail.addRequirement'))
      : null,
    editing
      ? React.createElement('div', { className: 'psa-detail-actions', 'data-psa-own': '' },
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn',
          'data-psa-detail-cancel': '',
          'data-psa-own': '',
          onClick: () => controller.cancelDetailEdit()
        }, t('detail.cancel')),
        React.createElement('button', {
          type: 'button',
          className: 'psa-btn psa-btn-primary',
          'data-psa-detail-save': '',
          'data-psa-own': '',
          onClick: () => {
            const text = noteRef.current !== null && noteRef.current !== undefined ? noteRef.current.value : ''
            controller.saveDetailNote(record.id, text)
          }
        }, t('detail.save')))
      : null),
  React.createElement('dl', { className: 'psa-detail-meta', 'data-psa-detail-meta': '', 'data-psa-own': '' },
    (() => {
      const detail = controller.statusDetailOf(record)
      const confidence = detail.confidence ?? 'strong'
      return metaRow(t('detail.status'), `${t(annotationStatusLabelKey(status, confidence))}${detail.via !== 'css' ? ` · ${t(`via.${detail.via}`)}` : ''}`, 'data-psa-detail-status')
    })(),
    metaRow(t('detail.locator'), locator, 'data-psa-detail-locator'),
    metaRow(t('detail.position'), positionText, 'data-psa-detail-position'),
    metaRow(t('detail.session'), sessionText, 'data-psa-detail-session'),
    metaRow(t('detail.workspace'), workspaceText, 'data-psa-detail-workspace'),
    surface === 'floating'
      ? metaRow(t('detail.surfaceFloating'), ephemeral ? t('detail.ephemeral') : t('detail.surfaceFloating'), 'data-psa-detail-surface')
      : null),
  React.createElement('div', { className: 'psa-detail-actions', 'data-psa-own': '' },
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-detail-quick-ref': '',
      'data-psa-own': '',
      onClick: () => controller.quickReferenceById(record.id)
    }, t('detail.quickRef')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-detail-edit': '',
      'data-psa-own': '',
      onClick: () => controller.beginDetailEdit()
    }, t('detail.edit')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-detail-relocate': '',
      'data-psa-own': '',
      onClick: () => controller.relocateEntry(record.id)
    }, t('detail.relocate')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-detail-copy-locator': '',
      'data-psa-own': '',
      onClick: () => controller.copyLocator(record.id)
    }, t('detail.copyLocator')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-detail-copy-xpath': '',
      'data-psa-own': '',
      onClick: () => controller.copyXPath(record.id)
    }, t('popover.copyXPath')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-detail-copy-full-xpath': '',
      'data-psa-own': '',
      onClick: () => controller.copyFullXPath(record.id)
    }, t('popover.copyFullXPath')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-detail-copy-js-path': '',
      'data-psa-own': '',
      onClick: () => controller.copyJsPath(record.id)
    }, t('popover.copyJsPath')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn psa-detail-danger',
      'data-psa-detail-delete': '',
      'data-psa-own': '',
      'aria-label': t('detail.delete'),
      title: t('detail.delete'),
      onClick: () => controller.deleteDetail(record.id)
    }, glyph(icons.delete, 14))))
}

/**
 * Transient hover preview for one composer reference chip (A3/T21).
 *
 * Read-only, pointer-transparent tooltip anchored to the chip; it shows the
 * same information a user needs from the detail card (requirement, locator,
 * live position/bounds, Session/workspace, status) or, for the grouped batch
 * chip, the count and first records. It never steals focus and disappears on
 * pointer leave / Esc / scroll.
 * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
 * @returns {object | null} the preview card.
 */
function AnnotationChipPreview(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const preview = snapshot.chipPreview
  if (preview === null || typeof preview !== 'object') return null
  const metaRow = (label: string, value: string) => React.createElement(React.Fragment, null,
    React.createElement('dt', null, label),
    React.createElement('dd', null, value))
  let title = t('detail.title')
  let content = null
  if (preview.kind === 'batch') {
    title = t('chip.batchLabel', { count: preview.count })
    content = [
      React.createElement('div', { key: 'count', className: 'psa-chip-preview-count', 'data-psa-chip-preview-count': '' },
        `${preview.count} ${t('collection.count', { count: preview.count })}`),
      React.createElement('ul', { key: 'items', className: 'psa-chip-preview-list' },
        (Array.isArray(preview.items) ? preview.items : []).map((item, index) => React.createElement('li', {
          key: `${index}-${item.label}`,
          className: 'psa-chip-preview-item'
        }, React.createElement('span', { className: 'psa-chip-preview-item-label' }, `#${index + 1} ${item.label}`),
        item.note ? React.createElement('span', { className: 'psa-chip-preview-item-note' }, ` — ${annotationMarkerBadgeText(item.note, 48).text}`) : null)))
    ]
  } else {
    const record = snapshot.state.collection.find((entry) => entry !== null && typeof entry === 'object' && entry.id === preview.refId)
    if (record === undefined) return null
    const status = controller.statusOf(record)
    const requirement = typeof record.note === 'string' ? record.note : ''
    const locator = annotationLocatorText(record)
    const bounds = normalizeAnnotationBounds(record.bounds) ?? { x: 0, y: 0, width: 0, height: 0 }
    const session = annotationRecordView(record).session ?? {}
    const sessionText = `${sessionShortLabel(session.sessionId) || t('insert.noSession')} · ${formatAnnotationTime(record.at)}`
    const workspace = session.workspaceLabel || annotationWorkspaceLabel(session.cwd) || '—'
    title = `${t('detail.requirement')} · ${elementLabel(record)}`
    content = [
      React.createElement('div', { key: 'req', className: 'psa-chip-preview-requirement', 'data-psa-chip-preview-requirement': '' },
        requirement.length > 0 ? requirement : t('detail.emptyRequirement')),
      React.createElement('dl', { key: 'meta', className: 'psa-chip-preview-meta' },
        metaRow(t('detail.status'), t(`popover.status.${status}`)),
        metaRow(t('detail.locator'), locator),
        metaRow(t('detail.position'), `${Math.round(bounds.x)}, ${Math.round(bounds.y)} · ${Math.round(bounds.width)}×${Math.round(bounds.height)}`),
        metaRow(t('detail.session'), sessionText),
        metaRow(t('detail.workspace'), workspace))
    ]
    title = elementLabel(record)
  }
  return React.createElement('div', {
    className: 'psa-chip-preview',
    'data-psa-chip-preview': '',
    'data-psa-own': '',
    'data-psa-status': preview.kind === 'record' ? undefined : 'batch',
    role: 'tooltip',
    'aria-label': title,
    style: { left: `${preview.x}px`, top: `${preview.y}px` }
  },
  React.createElement('div', { className: 'psa-chip-preview-head' },
    React.createElement('span', { className: 'psa-chip-preview-title', 'data-psa-chip-preview-title': '' }, title)),
  content)
}

/**
 * The × affordance over one annotation reference chip (A3/T22).
 *
 * Our own overlay button (the shell chip DOM is never mutated). Clicking it
 * deletes exactly that chip through the composer's Lexical editor: other chips
 * stay real chips, surrounding text/caret are preserved, the edit is one undo
 * step, and nothing is sent. It does not forward the click to the chip's own
 * openReference handler.
 * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
 * @returns {object} the × button.
 */
function AnnotationChipDelete(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const action = snapshot.chipAction
  if (action === null) return null
  return React.createElement('button', {
    type: 'button',
    className: 'psa-chip-delete',
    'data-psa-chip-delete': '',
    'data-psa-own': '',
    'aria-label': t('chip.remove'),
    title: t('chip.removeHint'),
    style: { left: `${action.x}px`, top: `${action.y}px`, width: `${action.width}px`, height: `${action.height}px` },
    onPointerEnter: () => controller.keepChipAction(),
    onPointerLeave: () => controller.scheduleChipActionHide(),
    onPointerDown: (event: AnnotationUiEvent) => {
      event.preventDefault()
      event.stopPropagation()
    },
    onClick: (event: AnnotationUiEvent) => {
      event.preventDefault()
      event.stopPropagation()
      controller.removeChipAtAction()
    }
  }, glyph(icons.close, 9))
}

/**
 * A3/T24: ONE popover for a multi-selection. It is the only place a batch
 * requirement is written: one shared textarea for the whole group, with a
 * compact list of the selected element labels. Committing saves ONE group
 * containing every selected element; Esc/X clears the selection.
 * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
 * @returns {object | null} the batch popover.
 */
function AnnotationBatchPopover(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const state = snapshot.state
  const position = snapshot.batchPosition
  if (position === null || state.selection.length < 2) return null
  const labels = state.selection.map((ref) => elementLabel(ref))
  const shown = labels.slice(0, 4)
  return React.createElement('div', {
    ref: (node: unknown) => controller.attachBatchNode(node === null || node === undefined ? null : node as Element),
    className: 'psa-popover psa-batch-popover',
    'data-psa-batch-popover': '',
    'data-psa-own': '',
    'data-psa-count': String(state.selection.length),
    role: 'dialog',
    'aria-label': t('batch.title', { count: state.selection.length }),
    style: { left: `${position.x}px`, top: `${position.y}px` }
  },
  React.createElement('div', {
    className: 'psa-popover-head',
    'data-psa-own': '',
    title: t('popover.drag'),
    onPointerDown: (event: AnnotationUiEvent) => controller.beginBatchDrag(event)
  },
    React.createElement('span', { className: 'psa-popover-title', 'data-psa-batch-title': '' },
      t('batch.title', { count: state.selection.length })),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-batch-close': '',
      'data-psa-own': '',
      'aria-label': t('batch.clear'),
      title: t('batch.clear'),
      onClick: () => controller.clearSelection()
    }, glyph(icons.close, 14))),
  React.createElement('ul', { className: 'psa-batch-list', 'data-psa-batch-items': '' },
    shown.map((label, index) => React.createElement('li', { key: `${index}-${label}`, className: 'psa-batch-item', 'data-psa-own': '' },
      `#${index + 1} ${label}`)),
    labels.length > shown.length
      ? React.createElement('li', { className: 'psa-batch-item psa-muted', 'data-psa-own': '' }, `+${labels.length - shown.length}`)
      : null),
  React.createElement('div', { className: 'psa-muted', 'data-psa-own': '' }, t('batch.hint')),
  React.createElement('label', { className: 'psa-popover-note', 'data-psa-own': '' },
    React.createElement('div', { className: 'psa-popover-note-head', 'data-psa-own': '' },
      React.createElement('span', { className: 'psa-muted', 'data-psa-batch-requirement-label': '', 'data-psa-own': '' },
        t('batch.requirement', { count: state.selection.length }))),
    React.createElement('div', { className: 'psa-rainbow-field', 'data-psa-own': '' },
      React.createElement('textarea', {
        className: 'psa-popover-textarea',
        'data-psa-batch-note': '',
        'data-psa-own': '',
        rows: 3,
        value: state.note,
        placeholder: t('popover.notePlaceholder'),
        'aria-label': t('batch.requirement', { count: state.selection.length }),
        onChange: (event: AnnotationUiEvent) => controller.updateNote(event.target.value),
        onFocus: () => controller.beginEdit(),
        onBlur: () => controller.endEdit()
      }))),
  React.createElement('div', { className: 'psa-popover-actions', 'data-psa-own': '' },
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-batch-clear': '',
      'data-psa-own': '',
      onClick: () => controller.clearSelection()
    }, t('batch.clear')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn psa-btn-primary',
      'data-psa-save-group': '',
      'data-psa-add-multi': '',
      'data-psa-own': '',
      onClick: () => controller.commitSelection()
    }, t('batch.saveGroup'))))
}

/**
 * The draggable element popover with the note editor and the two actions.
 * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
 * @returns {object | null} the popover.
 */
function AnnotationPopover(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const state = snapshot.state
  const setPopoverNode = React.useCallback((node) => {
    if (node === null) controller.detachPopoverNode()
    else controller.attachPopoverNode(node)
  }, [controller])
  const ref = state.selection[0]
  if (ref === undefined || snapshot.popoverPosition === null) return null
  const statusDetail = controller.statusDetailOf(ref)
  const status = statusDetail.status
  const via = statusDetail.via
  const inCollection = controller.isInCollection(ref)
  const locator = describeLocator(ref)
  const surface = ref?.locator?.surface === 'floating' ? 'floating' : 'page'
  const ephemeral = surface === 'floating'
  return React.createElement('div', {
    ref: setPopoverNode,
    className: 'psa-popover',
    'data-psa-popover': '',
    'data-psa-own': '',
    'data-psa-surface': surface,
    'data-psa-ephemeral': ephemeral ? 'true' : undefined,
    role: 'dialog',
    'aria-label': t('popover.aria'),
    style: { left: `${snapshot.popoverPosition.x}px`, top: `${snapshot.popoverPosition.y}px` }
  },
  React.createElement('div', {
    className: 'psa-popover-head',
    'data-psa-own': '',
    title: t('popover.drag'),
    onPointerDown: (event: AnnotationUiEvent) => controller.beginPopoverDrag(event)
  },
  React.createElement('span', { className: 'psa-popover-title', 'data-psa-popover-title': '' }, elementLabel(ref)),
  React.createElement('button', {
    type: 'button',
    className: 'psa-icon-btn',
    'data-psa-popover-close': '',
    'data-psa-own': '',
    'aria-label': t('popover.close'),
    title: t('popover.close'),
    onClick: () => controller.clearSelection()
  }, glyph(icons.close, 14))),
  React.createElement('div', { className: 'psa-popover-ref', 'data-psa-popover-ref': '', title: locator },
    React.createElement('span', { className: 'psa-truncate', 'data-psa-own': '' }, locator),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-popover-copy-locator': '',
      'data-psa-own': '',
      'aria-label': t('popover.copyLocator'),
      title: t('popover.copyLocator'),
      onClick: () => controller.copyLocator()
    }, glyph(icons.annotationCopy, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-popover-copy-xpath': '',
      'data-psa-own': '',
      'aria-label': t('popover.copyXPath'),
      title: t('popover.copyXPath'),
      onClick: () => controller.copyXPath()
    }, glyph(icons.link, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-popover-copy-js-path': '',
      'data-psa-own': '',
      'aria-label': t('popover.copyJsPath'),
      title: t('popover.copyJsPath'),
      onClick: () => controller.copyJsPath()
    }, glyph(icons.fileCopy, 13))),
  ephemeral
    ? React.createElement('div', {
      className: 'psa-muted',
      'data-psa-ephemeral-hint': '',
      'data-psa-own': ''
    }, t('popover.ephemeralHint'))
    : null,
  React.createElement('div', {
    className: 'psa-popover-status',
    'data-psa-popover-status': '',
    'data-psa-status': status
  },
  React.createElement('span', { className: 'psa-status-dot', 'data-psa-status': status, 'data-psa-own': '' }),
  React.createElement('span', { 'data-psa-via': via, 'data-psa-confidence': statusDetail.confidence ?? 'strong', 'data-psa-own': '' },
    `${t('popover.statusLabel')} · ${t(annotationStatusLabelKey(status, statusDetail.confidence ?? 'strong'))}${via !== 'css' ? ` · ${t(`via.${via}`)}` : ''}`),
  React.createElement('span', { className: 'psa-levels' },
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-level-up': '',
      'data-psa-own': '',
      'aria-label': t('popover.levelUp'),
      title: t('popover.levelUp'),
      onClick: () => controller.levelUp()
    }, glyph(icons.arrowUp, 13)),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-level-down': '',
      'data-psa-own': '',
      'aria-label': t('popover.levelDown'),
      title: t('popover.levelDown'),
      onClick: () => controller.levelDown()
    }, glyph(icons.arrowDown, 13)))),
  React.createElement('div', { className: 'psa-popover-note', 'data-psa-own': '' },
    React.createElement('div', { className: 'psa-popover-note-head', 'data-psa-popover-note-head': '', 'data-psa-own': '' },
      React.createElement('label', {
        className: 'psa-muted',
        'data-psa-popover-note-label': '',
        'data-psa-own': '',
        htmlFor: 'psa-popover-note'
      }, t('detail.requirement')),
      inCollection
        ? React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn psa-detail-danger',
          'data-psa-popover-delete': '',
          'data-psa-own': '',
          'aria-label': t('popover.delete'),
          title: t('popover.delete'),
          onClick: () => controller.removeSelection()
        }, glyph(icons.delete, 12))
        : null),
    React.createElement('div', { className: 'psa-rainbow-field', 'data-psa-own': '' },
      React.createElement('textarea', {
        className: 'psa-popover-textarea',
        id: 'psa-popover-note',
        'data-psa-note': '',
        'data-psa-own': '',
        rows: 3,
        value: state.note,
        placeholder: t('popover.notePlaceholder'),
        'aria-label': t('popover.noteLabel'),
        onChange: (event: AnnotationUiEvent) => controller.updateNote(event.target.value),
        onFocus: () => controller.beginEdit(),
        onBlur: () => controller.endEdit()
      }))),
  React.createElement('div', { className: 'psa-popover-actions', 'data-psa-popover-actions': '' },
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn',
      'data-psa-quick-ref': '',
      'data-psa-own': '',
      onClick: () => controller.quickReference()
    }, t('popover.quickRef')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-btn psa-btn-primary',
      'data-psa-add': '',
      'data-psa-commit': '',
      'data-psa-own': '',
      onClick: () => controller.commitSelection()
    }, inCollection ? t('popover.update') : t('popover.commit'))))
}

/**
 * Temporary expanded note editor for one collection entry, anchored beside
 * the rail so it never covers the canvas permanently.
 * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
 * @returns {object | null} the editor.
 */
function AnnotationNoteEditor(props: AnnotationSurfaceProps) {
  const { t, controller, snapshot } = props
  const editor = snapshot.noteEditor
  if (editor === null) return null
  const found = snapshot.state.collection.find((item) => item.id === editor.refId)
  if (found === undefined) return null
  const entry = annotationRecordView(found)
  const noteEntry = entry
  const isGroup = annotationIsGroup(entry)
  const editorValue = isGroup ? (typeof entry.requirement === 'string' ? entry.requirement : '') : (typeof entry.note === 'string' ? entry.note : '')
  return React.createElement('div', {
    className: 'psa-note-editor',
    'data-psa-entry-note-editor': '',
    'data-psa-own': '',
    style: { left: `${editor.x}px`, top: `${editor.y}px` }
  },
  React.createElement('div', { className: 'psa-popover-head', 'data-psa-own': '' },
    React.createElement('span', { className: 'psa-popover-title' }, t('collection.noteEditorTitle')),
    React.createElement('button', {
      type: 'button',
      className: 'psa-icon-btn',
      'data-psa-own': '',
      'aria-label': t('collection.noteEditorClose'),
      title: t('collection.noteEditorClose'),
      onClick: () => controller.closeNoteEditor()
    }, glyph(icons.close, 14))),
  React.createElement('div', { className: 'psa-muted psa-truncate' },
    isGroup ? t('collection.groupEditorTitle', { count: annotationGroupItems(entry).length }) : elementLabel(entry)),
  React.createElement('div', { className: 'psa-rainbow-field', 'data-psa-own': '' },
    React.createElement('textarea', {
      className: 'psa-note-editor-textarea',
      'data-psa-own': '',
      value: editorValue,
      placeholder: t('collection.notePlaceholder'),
      'aria-label': t('collection.notePlaceholder'),
      autoFocus: true,
      onChange: (event: AnnotationUiEvent) => controller.updateCollectionNote(noteEntry.id, event.target.value),
      onBlur: () => controller.closeNoteEditor()
    })))
}

  return {
    AnnotationOverlay,
    AnnotationLauncher,
    AnnotationHighlights,
    AnnotationRail
  }
}

/** The built component set returned by the factory. */
export type AnnotationComponentsApi = ReturnType<typeof createAnnotationComponents>
