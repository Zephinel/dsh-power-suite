// @ts-nocheck — Phase 3 keeps the browser half out of the type gate while its entries are split into modules; see docs/plans/typescript-migration.md.
//
// The entry is an ES module: the build bundles it into the classic-script IIFE
// the DSH shell loads. Pure browser models live under src/browser/ and are
// imported here instead of being redefined inline.
import { installQuickLook } from './browser/hover-quick-look/install.ts'
import { createUpdateCheck } from './browser/update-check/install.ts'
import { createSidebarWidthController } from './browser/sidebar-width/install.ts'
import {
  filesArtifactsInitialState,
  filesArtifactsPhaseMs,
  filesArtifactsReduce
} from './browser/artifacts/model.ts'
import {
  appUrl,
  artifactContentKind,
  artifactKey,
  artifactUrl,
  attachmentUrl,
  formatBytes,
  isImageArtifact,
  openArtifactPreview
} from './browser/artifacts/urls.ts'
import { copyArtifactContent, copyText } from './browser/artifacts/clipboard.ts'
import { ARTIFACTS_NS } from './browser/artifacts/copy.ts'
import { createArtifactsComponents } from './browser/artifacts/panel.ts'
import { createPromptHistorySeat } from './browser/prompt-history/seat.ts'
import { createSettingsPage } from './browser/settings/page.ts'
import { createSettingsStore } from './browser/settings/store.ts'
import { createWorkspacePresets } from './browser/workspace-presets/install.ts'
import { REMIX_BOOK_OPEN_LINE, REMIX_DOWNLOAD_LINE, REMIX_FILE_COPY_LINE, REMIX_FILE_LINE, REMIX_LINK } from './browser/remix-icons.ts'
import { createDraftAttachmentMemory } from './browser/draft-attachments/install.ts'
import { createInterruptedSessionsFeature } from './browser/interrupted-sessions/install.ts'
import { createPromptHistoryPreview } from './browser/prompt-history/preview.ts'
import { ROUTES, browserRoute } from './shared/routes.ts'
import { createComposerImageGallery } from './browser/composer-gallery/install.ts'
import {
  MODIFIER_CHOICES,
  SETTINGS_STORAGE_KEY,
  modifierMatches,
  parseStoredSettings,
  resolveModifierChange,
  serializeSettings
} from './browser/ui-annotation/settings.ts'
import {
  annotationNormalizeQuoteText,
  normalizeUserNote,
  sanitizeAttributeName,
  sanitizeAttributeValue,
  sanitizeText,
  textDigest
} from './browser/ui-annotation/text.ts'
import {
  ANNOTATION_EMPTY_TEXT_DIGEST,
  annotationAncestorTagChain,
  annotationCopyAnchorDecision,
  annotationDescendantAncestorMatches,
  annotationEphemeralOutcome,
  annotationFallbackCacheKey,
  annotationFirstTextLeafDescendant,
  annotationFullXPathOf,
  annotationHasStrongIdentity,
  annotationJsPathFor,
  annotationRenderedTextOf,
  annotationScopeAuthorityOutcome,
  annotationScoreQuoteMatches,
  annotationStatusConfidence,
  annotationStatusLabelKey,
  annotationTextPositionOf,
  annotationTextQuoteOf,
  annotationXPathOf
} from './browser/ui-annotation/anchors.ts'
import {
  annotationRoutePath,
  annotationWorkspaceLabel,
  formatAnnotationTime,
  normalizeAnnotationBounds,
  sessionShortLabel
} from './browser/ui-annotation/format.ts'
import {
  ANNOTATION_DETAIL_SIZE,
  annotationSegmentDisplayLabel,
  annotationSegmentedIndex,
  clampDetailCardPosition,
  clampLauncherPosition,
  clampPopoverPosition,
  clampPopoverPositionToViewport,
  computeRailWidth,
  layoutModeFor
} from './browser/ui-annotation/geometry.ts'
import {
  ANNOTATION_MAX_ANCESTORS,
  annotationIsGeneratedClass,
  annotationLocatorText,
  annotationStableSelectorCandidate,
  annotationTagPath,
  buildElementRef,
  buildUniqueSelector,
  describeLocator,
  elementLabel,
  identityKeyOf,
  isDynamicValue,
  isFormTag
} from './browser/ui-annotation/identity.ts'
import {
  ANNOTATION_RECORD_LIMIT,
  ANNOTATION_RECORDS_STORAGE_KEY,
  annotationEntryOrdinals,
  annotationFilterEntries,
  annotationFindGroup,
  annotationFindRecord,
  annotationFlattenRecords,
  annotationGroupFromSelection,
  annotationGroupItems,
  annotationIsGroup,
  annotationMarkerBadgeText,
  annotationScopeCounts,
  annotationSelectedEntries,
  annotationSidebarCounts,
  annotationTotalItemCount,
  annotationUndoRemove,
  annotationUndoRemoveMany,
  collectionAddGroup,
  collectionClear,
  parseAnnotationStore,
  serializeAnnotationStore
} from './browser/ui-annotation/records.ts'
import {
  createAnnotationState,
  reduceAnnotationState
} from './browser/ui-annotation/reducer.ts'
import {
  annotationResolveStatus,
  resolveNodeCandidate
} from './browser/ui-annotation/resolution.ts'
import {
  ANNOTATION_CHIP_CANDIDATE_LIMIT,
  ANNOTATION_CHIP_SOURCE,
  annotationChipCandidates,
  annotationChipRefBatch,
  annotationChipRefOf,
  batchScopeSplit,
  parseAnnotationChipRef,
  serializeAnnotationChip,
  serializeBatchEntries,
  serializeQuickReference
} from './browser/ui-annotation/serializers.ts'
import {
  annotationLeafPickIndex,
  annotationRailRightForPane,
  annotationSurfaceLevels,
  annotationSurfacePinEligible,
  annotationSurfacePinEventMatches,
  annotationSurfaceRoot,
  bindAnnotationSurfaceDefaults
} from './browser/ui-annotation/surface.ts'
import { ANNOTATION_CSS } from './browser/ui-annotation/styles.ts'
import { createAnnotationComponents } from './browser/ui-annotation/components.ts'
import { createUiAnnotationInstaller } from './browser/ui-annotation/install.ts'
import { createAnnotationController } from './browser/ui-annotation/controller.ts'
import {
  ANNOTATION_CHIP_ORDER,
  ANNOTATION_CHIP_TRIGGER,
  ANNOTATION_NS,
  ANNOTATION_OVERLAY_ID,
  ANNOTATION_SEAT_ID
} from './browser/ui-annotation/constants.ts'
import {
  ANNOTATION_LAUNCHER_SIZE,
  ANNOTATION_POPOVER_SIZE,
  annotationAccessibleName,
  annotationBoxCandidateElements,
  annotationCandidateChain,
  annotationDescriptorOf,
  annotationElementVisible,
  annotationEventElement,
  annotationFocusComposer,
  annotationInsertLabels,
  annotationLayoutFrame,
  annotationMeasureSidebarWidths,
  annotationRectOf,
  annotationResolveNode,
  annotationViewport
} from './browser/ui-annotation/dom.ts'
import { annotationReadStorage, annotationWriteStorage } from './browser/ui-annotation/storage.ts'
import {
  dwNeedsProjectionRead,
  dwProjectionSections
} from './browser/dynamic-workspaces/stats.ts'
import { DW_NS, createDynamicWorkspacesInstaller } from './browser/dynamic-workspaces/install.ts'
import { createNativeSessionHoverFigures } from './browser/native-session-hover-figures/install.ts'
/**
 * Browser half of DSH Power Suite.
 *
 * One client entry owns every feature's browser surface, kept in its own
 * `#region feature:` marks so another feature can be added the same way.
 *
 * Session artifacts registers one action in the native Files page header that
 * swaps the pane content for an animated overlay listing the current Session's
 * artifacts (the standalone page type and its Start-guide card are gone). It
 * asks the Host for the list and renders each row with three zero-install actions:
 *
 * - Open: the file in the right Sidebar's native document preview (the
 *   workspace-files + document-preview pipeline), through a
 *   `dsh-resource://file/session/…` address; the raw route is only the fallback
 *   when no preview type claims the address.
 * - Download: the Host's authenticated raw route with an attachment disposition.
 * - Copy link: the LAN address of that raw route, for another paired device.
 *
 * Opening with an application on the *viewing* device is the step a web page
 * cannot take itself; `Download` hands the file to the operating system, which
 * owns the app choice. The footer says so in place of a control that would
 * silently launch on the Host instead.
 *
 * Workspace presets contributes one Workspace context-menu submenu that sets
 * the default agent preset for new Sessions in that Workspace.
 *
 * Prompt history turns a modifier+Up/Down in the focused composer into
 * navigation through the Session's already-sent human prompts, shell style.
 * Settings owns the Plugins-page configuration for it: the modifier choice is
 * stored by the Host and shared with the key handler.
 */

window.__ModuleLoader__.load({
  id: '@zephinel/dsh-power-suite',
  factory: (require) => {
    const React = require('react')
    const ReactDOM = require('react-dom')
    // The shell seeds this module into every Web bundle; keep the feature
    // declarative when a foreign host omits it instead of failing to load.
    const uiPrimitives = (() => {
      try {
        return require('@deepseek-ai/dsh-client-ui-primitives')
      } catch {
        return {}
      }
    })()
    /** The shell's own state/loading indicator, with a static fallback dot. */
    const StateDot = typeof uiPrimitives.StateDot === 'function'
      ? uiPrimitives.StateDot
      : ({ size }) => React.createElement('span', {
        'aria-hidden': true,
        style: { display: 'inline-block', width: size ?? 10, height: size ?? 10, borderRadius: '50%', background: 'currentColor', opacity: 0.45 }
      })

    /**
     * Render one inline Remix glyph.
     * @param {string} path - Remix path data.
     * @param {number} size - pixel size.
     * @param {string} [className] - optional class.
     * @param {number} [scale] - optional inner-path scale; omitted keeps 1:1.
     * @returns {import('react').ReactElement} the SVG element.
     */
    function RemixGlyph(path, size, className, scale) {
      const shape = React.createElement('path', { d: path })
      return React.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'currentColor',
        className,
        'aria-hidden': true,
        focusable: 'false'
      }, scale === undefined
        ? shape
        : React.createElement('g', { transform: `translate(12 12) scale(${scale}) translate(-12 -12)` }, shape))
    }

    /**
     * Render one inline Remix icon seat (path + size) for the components.
     * @param {{ path: string, size?: number }} props - icon props.
     * @returns {import('react').ReactElement} the SVG element.
     */
    function RemixIcon(props) {
      return React.createElement('svg', {
        viewBox: '0 0 24 24',
        width: props.size ?? 16,
        height: props.size ?? 16,
        fill: 'currentColor',
        'aria-hidden': 'true',
        focusable: 'false'
      }, React.createElement('path', { d: props.path }))
    }

    /** Authenticated exact routes registered by the Host half. */
    const RAW_ROUTE = browserRoute(ROUTES.sessionArtifactsRaw)
    const ATTACHMENT_ROUTE = browserRoute(ROUTES.sessionArtifactsAttachment)
    const PREVIEW_ROUTE = browserRoute(ROUTES.sessionArtifactsPreview)

    /** The bundle's npm package name: configuration slot key and settings identity. */
    const PACKAGE_NAME = '@zephinel/dsh-power-suite'

    /**
     * The browser global plus the optional end-to-end test seam installed by the
     * browser harness before load; production never defines it.
     * @type {typeof globalThis & { __POWER_SUITE_TEST_HOOKS__?: Record<string, object> }}
     */
    const testHookHost = globalThis













    //#region feature: settings — page
    //
    // The Host-backed settings store and the Plugins-page section live in
    // `src/browser/settings/{store,page}.ts`: the entry creates one store with
    // the app URL builder and hands it to the page installer. Copy, CSS, slot
    // key and the shared snapshot behavior are unchanged; this region is a
    // wiring point.
    const settingsStore = createSettingsStore({ appUrl })
    const settingsPage = createSettingsPage({
      React,
      store: settingsStore,
      packageName: PACKAGE_NAME
    })
    //#endregion

    //#region feature: interrupted sessions
    //
    // The store, decorator, copy, icons, stylesheet and seats live in
    // `src/browser/interrupted-sessions/{state,install,components}.ts`: the
    // entry only binds the React runtime, the inline icon seat and the app URL
    // builder. Storage key, DOM markers, slot ids/order and copy are unchanged;
    // this region is a wiring point.
    const interruptedSessions = createInterruptedSessionsFeature({
      React,
      RemixIcon,
      appUrl
    })
    //#endregion

    //#region feature: composer image gallery
    //
    // The gallery store, capture interceptor, overlay component, copy, icons
    // and stylesheet live in `src/browser/composer-gallery/**`: the entry only
    // binds the React runtime and the inline glyph builder, then installs the
    // overlay in `apply`. Slot id, DOM markers and behavior are unchanged; this
    // region is a wiring point.
    const composerGallery = createComposerImageGallery({ React, RemixGlyph })
    //#endregion

    //#region feature: draft attachment memory
    //
    // The capture/restore seat and its page-lifetime File cache live in
    // `src/browser/draft-attachments/install.ts`: the entry only binds the
    // React runtime and installs the seat in `apply`. Seat id/order, storage
    // bounds and behavior are unchanged; this region is a wiring point.
    const draftAttachments = createDraftAttachmentMemory({ React })
    //#endregion

    //#region feature: prompt history
    //
    // The invisible composer seat, its keydown capture and the Host reader live
    // in `src/browser/prompt-history/seat.ts`: the entry only binds the React
    // runtime, the app URL builder and the shared settings store, then installs
    // the seat in `apply`. Slot id/order and behavior are unchanged; this
    // region is a wiring point.
    const promptHistory = createPromptHistorySeat({
      React,
      appUrl,
      settings: settingsStore
    })
    //#endregion

    //#region feature: dynamic workspaces
    //
    // The controller lives in `src/browser/dynamic-workspaces/install.ts`: the
    // entry only creates the per-factory instance with the runtime modules and
    // cross-feature seats it owns (React, the shell primitives, the settings and
    // interruption stores, and the app URL builder), then installs it with the
    // client ctx in `apply`. DOM markers, storage keys, copy and slots are
    // unchanged; this region is a wiring point.
    const dynamicWorkspacesInstaller = createDynamicWorkspacesInstaller({
      React,
      ReactDOM,
      uiPrimitives,
      RemixGlyph,
      RemixIcon,
      StateDot,
      appUrl,
      subscribeSettings: settingsStore.subscribe,
      settingsSnapshot: settingsStore.snapshot,
      subscribeInterrupted: interruptedSessions.store.subscribeInterrupted,
      interruptedVersion: interruptedSessions.store.interruptedVersion,
      interruptedRecord: interruptedSessions.store.interruptedRecord,
      ensureInterrupted: interruptedSessions.store.ensureInterrupted,
      watchInterrupted: interruptedSessions.store.watchInterrupted,
      refreshInterrupted: interruptedSessions.store.refreshInterrupted,
      requestContinue: interruptedSessions.store.requestContinue,
      remixPlayFill: interruptedSessions.remixPlayFill,
      remixWarningFill: interruptedSessions.remixWarningFill,
      interruptedNamespace: interruptedSessions.namespace,
      testHookHost
    })
    //#endregion

    //#region feature: native session hover figures
    //
    // The seat and its registration live in
    // `src/browser/native-session-hover-figures/install.ts`: the entry only binds
    // the React runtime and the section/projection helpers the dynamic-Workspaces
    // installer already owns, then installs it in `apply`. DOM markers, slot id,
    // copy and ordering stay unchanged; this region is a wiring point.
    const { installSessionHoverFigures } = createNativeSessionHoverFigures({
      React,
      hovercardSections: dynamicWorkspacesInstaller.hovercardSections,
      projectionSections: dwProjectionSections,
      needsProjectionRead: dwNeedsProjectionRead,
      namespace: DW_NS
    })
    //#endregion

    //#region feature: prompt history — preview
    //
    // The composer-docked rail lives in
    // `src/browser/prompt-history/preview.ts`: the entry only binds the React
    // runtime, the portal bridge, the inline glyph builder and the Host prompt
    // reader it already owns, then installs the dock seat in `apply`. Copy,
    // stylesheet, DOM markers, geometry and portals stay unchanged; this region
    // is a wiring point.
    const { installPromptHistoryPreview } = createPromptHistoryPreview({
      React,
      ReactDOM,
      RemixGlyph,
      readPromptHistoryEntries: promptHistory.readPromptHistoryEntries
    })
    //#endregion


    //#region feature: ui element annotation
    //
    // Browser-only mode that lets the user outline real DSH elements, give each
    // one a requested change, and insert a structured reference into the
    // current Session Composer. It never edits the page, never reads field
    // values, and never sends a message.
    //
    // Architecture: one always-mounted `shell.overlay` surface (launcher, rail,
    // highlights, popover, feedback), one renderless `conversation.input.overlay`
    // seat that keeps the Composer bridge current, one imperative controller
    // (capture listeners, geometry, layout, persistence, insertion), and one
    // pure reducer/store that connects them. The mode is page-wide: the layout
    // frame keeps its inline grid and makes room through `padding-right`, so the
    // rail sits in the freed strip without covering any native column.
    //
    // Host boundaries: Shadow DOM hosts are selectable (internals are not),
    // cross-origin iframes are not selectable, native `<input>`/`<textarea>`/
    // contenteditable contents are never read, canvas content has no DOM target,
    // and body-level portals are ordinary DOM and selectable.

    //#region ui element annotation — pure model


    /** Copy for the UI element annotation mode. */
    const ANNOTATION_EN = {
      'launcher.enter': 'Annotate UI elements',
      'launcher.exit': 'Exit annotation mode',
      'rail.aria': 'UI element annotation',
      'rail.title': 'UI annotation',
      'rail.collapse': 'Collapse rail',
      'rail.expand': 'Expand rail',
      'rail.exit': 'Exit annotation mode',
      'rail.hint': 'Click an element to annotate it. {passThrough}-click keeps the page usable; {multi}-click adds to the selection.',
      'rail.status.idle': 'Click an element to annotate it',
      'rail.status.selected': '1 element selected',
      'rail.status.multi': '{count} elements selected',
      'rail.openCollection': 'Collection',
      'settings.open': 'Modifier settings',
      'rail.addMulti': 'Add {count} to collection',
      'rail.clearSelection': 'Clear selection',
      'rail.selectedName': 'Selected element',
      'rail.surfaceFloating': 'Floating surface (hover preview)',
      'rail.surfaceTransient': 'transient',
      'popover.aria': 'Element annotation',
      'popover.drag': 'Drag popover',
      'popover.statusLabel': 'Target',
      'popover.status.resolved': 'Resolved',
      'popover.status.ambiguous': 'Matches several',
      'popover.status.missing': 'No longer resolves',
      'popover.status.changed': 'Content changed',
      'status.unverifiableWeak': 'Unverifiable · weak identity',
      'popover.levelUp': 'Parent element',
      'popover.levelDown': 'Child element',
      'popover.noteLabel': 'Requested change',
      'popover.notePlaceholder': 'Describe the requested change',
      'popover.quickRef': 'Quick reference',
      'popover.add': 'Add to collection',
      'popover.update': 'Update requirement',
      'popover.commit': 'Mark requirement',
      'popover.delete': 'Delete annotation',
      'popover.close': 'Close',
      'popover.copyLocator': 'Copy locator',
      'popover.copyXPath': 'Copy XPath',
      'popover.copyJsPath': 'Copy JS path',
      'popover.copyFullXPath': 'Copy full XPath',
      'via.css': 'locator',
      'via.xpath': 'XPath',
      'via.text-quote': 'text anchor',
      'via.text-position': 'text position',
      'popover.ephemeralHint': 'Transient surface: kept open while you edit this annotation; it may disappear after the popover closes (the locator is kept).',
      'detail.title': 'Annotation details',
      'detail.requirement': 'Requirement',
      'detail.emptyRequirement': 'No requirement yet',
      'detail.addRequirement': 'Add requirement',
      'detail.locator': 'Locator',
      'detail.position': 'Position',
      'detail.session': 'Session',
      'detail.workspace': 'Workspace',
      'detail.status': 'Status',
      'detail.surfaceFloating': 'Floating surface (hover preview)',
      'detail.ephemeral': 'Transient surface — may disappear',
      'detail.quickRef': 'Quick reference',
      'detail.edit': 'Edit requirement',
      'detail.save': 'Save',
      'detail.cancel': 'Cancel',
      'detail.delete': 'Delete',
      'detail.relocate': 'Go to element',
      'detail.copyLocator': 'Copy locator',
      'detail.close': 'Close',
      'detail.marks': 'Marks are shown on the page while the mode is on',
      'chip.batchLabel': 'UI annotations × {count}',
      'chip.remove': 'Remove reference',
      'chip.removeHint': 'Remove this reference chip (one undo step)',
      'chip.candidateLabel': 'UI annotation · {name}',
      'collection.countScope': '{current} current · {other} other',
      'collection.include': 'Include in batch insert',
      'collection.selectAllCurrent': 'Select current session',
      'collection.deselectAll': 'Clear selection',
      'collection.deleteSelected': 'Delete selected',
      'collection.insertChip': 'Insert reference',
      'collection.moveUp': 'Move up',
      'collection.moveDown': 'Move down',
      'collection.preview': 'Preview the element',
      'collection.sortHint': 'Insertion order; ↑↓ adjusts the batch order',
      'collection.otherSessionHint': 'From another session; batch insert skips it',
      'collection.batchDisabled': 'Nothing to insert: select a current-session annotation first',
      'collection.title': 'Collection',
      'collection.count': '{count} elements',
      'collection.countOne': '1 element',
      'collection.empty': 'No annotated elements',
      'collection.emptyHint': 'Select an element, write a note, then add it to the collection.',
      'collection.otherSession': 'Other session',
      'collection.notePlaceholder': 'Note',
      'collection.expandNote': 'Edit note in a larger editor',
      'collection.relocate': 'Re-locate',
      'collection.remove': 'Remove',
      'collection.clear': 'Clear',
      'collection.insertBatch': 'Insert all into composer',
      'collection.crossSession': '{count} from other sessions will be skipped',
      'collection.noteEditorTitle': 'Note',
      'collection.noteEditorClose': 'Close',
      'collection.copyLocator': 'Copy locator',
      'collection.maxReached': 'The collection is full ({limit} annotations). Remove entries before adding more.',
      'settings.title': 'Settings',
      'settings.passThrough': 'Pass-through modifier',
      'settings.multi': 'Multi-select modifier',
      'settings.field.passThrough': 'Pass-through',
      'settings.field.multi': 'Multi-select',
      'settings.conflict': '{field} was moved to {value} because both modifiers cannot be the same key.',
      'settings.saved': 'Settings saved',
      'settings.hint': 'Hold the pass-through key to use the page normally. Hold the multi-select key to add elements or drag a box.',
      'modifier.alt': '⌥ / Alt',
      'modifier.ctrl': '⌃ / Ctrl',
      'modifier.meta': '⌘ / Meta',
      'modifier.shift': '⇧ / Shift',
      'feedback.modeOn': 'Annotation mode on',
      'feedback.inserted': 'Inserted into the current session composer (not sent)',
      'feedback.insertFailed': 'Could not insert into the composer',
      'feedback.noComposer': 'Open a session before inserting a reference',
      'feedback.added': 'Added to the collection',
      'feedback.updated': 'Updated the existing collection entry',
      'feedback.removed': 'Removed from the collection',
      'feedback.cleared': 'Collection cleared',
      'feedback.relocated': 'Moved to the element',
      'feedback.relocateFailed': 'The element cannot be located ({status})',
      'feedback.relocateOtherSession': 'This annotation belongs to another session',
      'feedback.locatorCopied': 'Locator copied',
      'feedback.copyXPathSuccess': 'XPath copied',
      'feedback.copyJsPathSuccess': 'JS path copied',
      'feedback.copyXPathFailed': 'XPath unavailable for this target',
      'feedback.copyJsPathFailed': 'JS path unavailable for this target',
      'feedback.copyXPathSaved': 'Copied saved XPath (target not live)',
      'feedback.copyJsPathSaved': 'Copied saved JS path (target not live)',
      'feedback.copyFullXPathSuccess': 'Full XPath copied',
      'feedback.copyFullXPathFailed': 'Full XPath needs a live target',
      'feedback.locatorCopyFailed': 'Could not copy the locator',
      'feedback.chipInserted': 'Inserted as a reference chip (not sent)',
      'feedback.chipRemoveFailed': 'Could not remove that reference chip',
      'feedback.chipBatchInserted': 'Inserted one batch reference chip (not sent)',
      'feedback.chipFallback': 'Reference chips unavailable here; inserted as plain text',
      'feedback.chipMissing': 'This reference\'s annotation is no longer available',
      'feedback.selectedDeleted': 'Selected annotations deleted',
      'feedback.marked': 'Marked · {count} total',
      'feedback.groupAdded': 'Group saved · {count} elements',
      'batch.title': '{count} elements selected',
      'batch.requirement': 'Requirement (shared by all selected elements)',
      'batch.hint': 'One requirement for the whole selection; each element keeps its own locator.',
      'batch.saveGroup': 'Save as group',
      'batch.clear': 'Clear selection',
      'insert.groupHeader': 'Group',
      'insert.groupRequirement': 'Requirement:',
      'insert.groupReference': 'Element:',
      'insert.itemsCountLabel': 'items',
      'sidebar.title': 'Annotations',
      'sidebar.subtitle': 'Manage single annotations and batch groups together.',
      'sidebar.hint': 'Click an element to annotate it · {passThrough}-click keeps the page usable · {multi}-click adds to the selection.',
      'sidebar.filter.all': 'All',
      'sidebar.filter.single': 'Singles',
      'sidebar.type.single': 'Single',
      'sidebar.type.group': 'Group',
      'sidebar.filter.group': 'Groups',
      'sidebar.groupBadge': 'Group · {count} items',
      'sidebar.groupUntitled': 'Untitled group',
      'sidebar.updated': 'Updated {time}',
      'sidebar.page': 'Page',
      'sidebar.area': 'Area',
      'sidebar.selector': 'Selector',
      'sidebar.addAnnotation': 'Add annotation',
      'sidebar.clearSelection': 'Clear selection',
      'sidebar.clearCollection': 'Clear collection',
      'sidebar.cancelAnnotation': 'Cancel Annotation',
      'exitConfirm.title': 'Clear annotations and exit?',
      'exitConfirm.message': 'Exit annotation mode and clear {count} annotations? These will not be kept for the next session.',
      'exitConfirm.cancel': 'Cancel',
      'exitConfirm.clear': 'Clear & exit',
      'sidebar.emptyTitle': 'No annotations yet',
      'sidebar.emptyHint': 'Select an element on the page to add your first annotation.',
      'sidebar.filterEmpty': 'Nothing matches this filter.',
      'sidebar.addHint': 'Switch to the page and select elements to annotate.',
      'sidebar.edit': 'Edit annotation',
      'sidebar.delete': 'Delete annotation',
      'sidebar.insert': 'Insert reference',
      'sidebar.include': 'Include in batch',
      'sidebar.total': '{count} total',
      'collection.groupBadge': 'Batch',
      'collection.groupCount': '{count} items',
      'collection.groupUntitled': 'Untitled batch',
      'collection.groupPreview': 'Show items',
      'collection.groupRequirementPlaceholder': 'Requirement shared by all items',
      'collection.groupEditorTitle': 'Batch requirement · {count} items',
      'collection.collapse': 'Collapse',
      'collection.expand': 'Expand',
      'feedback.markUpdated': 'Requirement updated',
      'feedback.markDeleted': 'Annotation deleted',
      'feedback.undo': 'Undo',
      'feedback.restored': 'Annotation restored',
      'feedback.batchEmpty': 'Nothing to insert from the current session',
      'insert.title': 'UI annotation',
      'insert.reference': 'Reference:',
      'insert.session': 'Session:',
      'insert.noSession': '—',
      'insert.note': 'Note:',
      'insert.emptyNote': '—',
      'insert.batchHeader': 'Please adjust the UI elements below. Each item lists its reference and the requested change.',
      'insert.status': 'Status: target no longer resolves (locator only)',
      'insert.statusEphemeral': 'Status: transient surface no longer present (locator only)',
      'insert.statusAmbiguous': 'Status: target matches more than one element (locator only)',
      'insert.statusChanged': 'Status: target content changed',
      'insert.skipped': '({count} annotation(s) from other sessions skipped)',
      'insert.removed': '({count} annotation(s) no longer exist and were skipped)',
      'insert.noRemaining': '(no annotations remain for this reference)'
    }

    /** Copy for the UI element annotation mode, Chinese. */
    const ANNOTATION_ZH = {
      'launcher.enter': '标注 UI 元素',
      'launcher.exit': '退出标注模式',
      'rail.aria': 'UI 元素标注',
      'rail.title': 'UI 标注',
      'rail.collapse': '收起工具条',
      'rail.expand': '展开工具条',
      'rail.exit': '退出标注模式',
      'rail.hint': '点击页面元素开始标注。按住 {passThrough} 点击可正常使用页面；按住 {multi} 点击可加选。',
      'rail.status.idle': '点击页面元素开始标注',
      'rail.status.selected': '已选择 1 个元素',
      'rail.status.multi': '已选择 {count} 个元素',
      'rail.openCollection': '标注集',
      'settings.open': '修饰键设置',
      'rail.addMulti': '将 {count} 个加入标注集',
      'rail.clearSelection': '取消选择',
      'rail.selectedName': '已选元素',
      'rail.surfaceFloating': '浮动层（悬停预览）',
      'rail.surfaceTransient': '瞬态',
      'popover.aria': '元素标注',
      'popover.drag': '拖动浮层',
      'popover.statusLabel': '目标',
      'popover.status.resolved': '可定位',
      'popover.status.ambiguous': '有多个匹配',
      'popover.status.missing': '无法定位',
      'popover.status.changed': '内容已变化',
      'status.unverifiableWeak': '无法验证 · 弱身份',
      'popover.levelUp': '上一级元素',
      'popover.levelDown': '下一级元素',
      'popover.noteLabel': '修改说明',
      'popover.notePlaceholder': '描述需要修改的内容',
      'popover.quickRef': '快速引用',
      'popover.add': '加入标注集',
      'popover.update': '更新需求',
      'popover.commit': '标记需求',
      'popover.delete': '删除标注',
      'popover.close': '关闭',
      'popover.copyLocator': '复制定位器',
      'popover.copyXPath': '复制 XPath',
      'popover.copyJsPath': '复制 JS 路径',
      'popover.copyFullXPath': '复制完整 XPath',
      'via.css': '定位器',
      'via.xpath': 'XPath',
      'via.text-quote': '文本锚点',
      'via.text-position': '文本位置',
      'popover.ephemeralHint': '瞬态浮层：编辑这条标注期间会保持打开；关闭气泡后该浮层可能消失（定位信息会保留）。',
      'detail.title': '标注详情',
      'detail.requirement': '需求',
      'detail.emptyRequirement': '尚未填写需求',
      'detail.addRequirement': '添加需求',
      'detail.locator': '定位',
      'detail.position': '位置',
      'detail.session': '会话',
      'detail.workspace': '工作区',
      'detail.status': '状态',
      'detail.surfaceFloating': '浮动层（悬停预览）',
      'detail.ephemeral': '瞬态浮层 — 可能消失',
      'detail.quickRef': '快速引用',
      'detail.edit': '编辑需求',
      'detail.save': '保存',
      'detail.cancel': '取消',
      'detail.delete': '删除',
      'detail.relocate': '定位到元素',
      'detail.copyLocator': '复制定位器',
      'detail.close': '关闭',
      'detail.marks': '模式开启时页面会持续显示标注遮罩',
      'chip.batchLabel': 'UI 标注 × {count}',
      'chip.remove': '移除引用',
      'chip.removeHint': '移除这个引用控件（可撤销一步）',
      'chip.candidateLabel': 'UI 标注 · {name}',
      'collection.countScope': '当前会话 {current} · 其他会话 {other}',
      'collection.include': '加入批量插入',
      'collection.selectAllCurrent': '全选当前会话',
      'collection.deselectAll': '取消全选',
      'collection.deleteSelected': '删除选中',
      'collection.insertChip': '插入引用',
      'collection.moveUp': '上移',
      'collection.moveDown': '下移',
      'collection.preview': '预览该元素',
      'collection.sortHint': '按插入顺序排列，可用 ↑↓ 调整批量顺序',
      'collection.otherSessionHint': '来自其他会话，批量插入会跳过',
      'collection.batchDisabled': '没有可插入的标注：请先选择当前会话的标注',
      'collection.title': '标注集',
      'collection.count': '{count} 项',
      'collection.countOne': '1 项',
      'collection.empty': '还没有标注',
      'collection.emptyHint': '选择元素、写下修改说明，然后加入标注集。',
      'collection.otherSession': '其他会话',
      'collection.notePlaceholder': '备注',
      'collection.expandNote': '在较大编辑器中编辑备注',
      'collection.relocate': '重新定位',
      'collection.remove': '移除',
      'collection.clear': '清空',
      'collection.insertBatch': '全部插入输入框',
      'collection.crossSession': '另有 {count} 条来自其他会话，插入时将跳过',
      'collection.noteEditorTitle': '备注',
      'collection.noteEditorClose': '关闭',
      'collection.copyLocator': '复制定位器',
      'collection.maxReached': '标注集已满（{limit} 条）。请先移除条目再添加。',
      'settings.title': '设置',
      'settings.passThrough': '透传修饰键',
      'settings.multi': '多选修饰键',
      'settings.field.passThrough': '透传',
      'settings.field.multi': '多选',
      'settings.conflict': '{field}已改为 {value}，两个修饰键不能相同。',
      'settings.saved': '设置已保存',
      'settings.hint': '按住透传键可正常操作页面；按住多选键可加选元素或拖出选框。',
      'modifier.alt': '⌥ / Alt',
      'modifier.ctrl': '⌃ / Ctrl',
      'modifier.meta': '⌘ / Meta',
      'modifier.shift': '⇧ / Shift',
      'feedback.copyXPathSuccess': '已复制 XPath',
      'feedback.copyJsPathSuccess': '已复制 JS 路径',
      'feedback.copyXPathFailed': '该目标没有可用的 XPath',
      'feedback.copyJsPathFailed': '该目标没有可用的 JS 路径',
      'feedback.copyXPathSaved': '已复制保存的 XPath（目标当前不在页面）',
      'feedback.copyJsPathSaved': '已复制保存的 JS 路径（目标当前不在页面）',
      'feedback.copyFullXPathSuccess': '已复制完整 XPath',
      'feedback.copyFullXPathFailed': '完整 XPath 需要目标仍在页面',
      'feedback.modeOn': '已进入标注模式',
      'feedback.inserted': '已插入当前会话输入框（不会发送）',
      'feedback.insertFailed': '无法插入输入框',
      'feedback.noComposer': '打开一个会话后可以插入引用',
      'feedback.added': '已加入标注集',
      'feedback.updated': '已更新标注集中的条目',
      'feedback.removed': '已从标注集移除',
      'feedback.cleared': '标注集已清空',
      'feedback.relocated': '已定位到该元素',
      'feedback.relocateFailed': '无法定位该元素（{status}）',
      'feedback.relocateOtherSession': '这条标注来自其他会话',
      'feedback.locatorCopied': '已复制定位器',
      'feedback.locatorCopyFailed': '复制定位器失败',
      'feedback.chipInserted': '已插入引用控件（未发送）',
      'feedback.chipRemoveFailed': '无法移除该引用控件',
      'feedback.chipBatchInserted': '已插入批量引用控件（未发送）',
      'feedback.chipFallback': '此处不支持引用控件，已插入纯文本',
      'feedback.chipMissing': '该引用对应的标注已不存在',
      'feedback.selectedDeleted': '已删除选中的标注',
      'feedback.marked': '已标记 · 共 {count} 条',
      'feedback.groupAdded': '已保存为分组 · {count} 个元素',
      'batch.title': '已选择 {count} 个元素',
      'batch.requirement': '要求（所选元素共用）',
      'batch.hint': '整批元素共用一条要求；每个元素仍保留自己的定位信息。',
      'batch.saveGroup': '保存为分组',
      'batch.clear': '清空选择',
      'insert.groupHeader': '分组',
      'insert.groupRequirement': '要求：',
      'insert.groupReference': '元素：',
      'insert.itemsCountLabel': '项',
      'sidebar.title': '标注',
      'sidebar.subtitle': '单条标注与批量分组在同一列表中管理。',
      'sidebar.hint': '点击页面元素开始标注 · {passThrough}-点击可正常使用页面 · {multi}-点击可加选。',
      'sidebar.filter.all': '全部',
      'sidebar.filter.single': '单条',
      'sidebar.type.single': '单条',
      'sidebar.type.group': '分组',
      'sidebar.filter.group': '分组',
      'sidebar.groupBadge': '分组 · {count} 项',
      'sidebar.groupUntitled': '未命名分组',
      'sidebar.updated': '更新于 {time}',
      'sidebar.page': '页面',
      'sidebar.area': '区域',
      'sidebar.selector': '选择器',
      'sidebar.addAnnotation': '添加标注',
      'sidebar.clearSelection': '清空选择',
      'sidebar.clearCollection': '清空标注集',
      'sidebar.cancelAnnotation': '取消标注',
      'exitConfirm.title': '清除标注并退出？',
      'exitConfirm.message': '退出标注模式并清除 {count} 条标注？这些标注不会被保留到下一次进入。',
      'exitConfirm.cancel': '取消',
      'exitConfirm.clear': '清除并退出',
      'sidebar.emptyTitle': '还没有标注',
      'sidebar.emptyHint': '在页面上选择一个元素即可添加第一条标注。',
      'sidebar.filterEmpty': '当前筛选下没有内容。',
      'sidebar.addHint': '切换到页面并选择要标注的元素。',
      'sidebar.edit': '编辑标注',
      'sidebar.delete': '删除标注',
      'sidebar.insert': '插入引用',
      'sidebar.include': '加入批量',
      'sidebar.total': '共 {count} 条',
      'collection.groupBadge': '批量',
      'collection.groupCount': '{count} 项',
      'collection.groupUntitled': '未命名分组',
      'collection.groupPreview': '查看项',
      'collection.groupRequirementPlaceholder': '整组共用的要求',
      'collection.groupEditorTitle': '分组要求 · {count} 项',
      'collection.collapse': '收起',
      'collection.expand': '展开',
      'feedback.markUpdated': '需求已更新',
      'feedback.markDeleted': '标注已删除',
      'feedback.undo': '撤销',
      'feedback.restored': '标注已恢复',
      'feedback.batchEmpty': '当前会话没有可插入的标注',
      'insert.title': 'UI 标注',
      'insert.reference': '定位：',
      'insert.session': '会话：',
      'insert.noSession': '—',
      'insert.note': '备注：',
      'insert.emptyNote': '—',
      'insert.batchHeader': '请调整以下 UI 元素，每项都附有定位和修改说明。',
      'insert.status': '状态：目标已无法定位（仅保留定位信息）',
      'insert.statusEphemeral': '状态：瞬态浮层已不存在（仅保留定位信息）',
      'insert.statusAmbiguous': '状态：目标匹配到多个元素（仅保留定位信息）',
      'insert.statusChanged': '状态：目标内容已变化',
      'insert.skipped': '（已跳过 {count} 条来自其他会话的标注）',
      'insert.removed': '（已跳过 {count} 条已被删除的标注）',
      'insert.noRemaining': '（该引用对应的标注已全部删除）'
    }

    /**
     * Long-lived bridge to the mounted Composer seat.
     *
     * The annotation surface renders outside the Session-scope slot tree and has
     * no Session list face on its own context, so the seat — which is a real
     * Session-scoped slot and therefore receives the `useSessions` standard hook —
     * mirrors the current Session's `cwd` here. Everything is all-or-nothing: the
     * Session id only exists while the seat's insertion actions do.
     */
    /** @type {import('./browser/ui-annotation/types.ts').AnnotationBridge} */
    const annotationBridge = { sessionId: null, inputActions: null, sessionCwd: null }

    // Remix Icon path data (Apache-2.0, https://remixicon.com), inlined so the
    // mode needs no icon package at runtime.
    const REMIX_FOCUS_3_LINE = 'M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4ZM12 8C14.2091 8 16 9.79086 16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8Z'
    const REMIX_CLOSE_LINE = 'M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z'
    const REMIX_ARROW_UP_LINE = 'M13.0001 7.82843V20H11.0001V7.82843L5.63614 13.1924L4.22192 11.7782L12.0001 4L19.7783 11.7782L18.3641 13.1924L13.0001 7.82843Z'
    const REMIX_ARROW_DOWN_LINE = 'M13.0001 16.1716L18.3641 10.8076L19.7783 12.2218L12.0001 20L4.22192 12.2218L5.63614 10.8076L11.0001 16.1716V4H13.0001V16.1716Z'
    const REMIX_DELETE_BIN_LINE = 'M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z'
    const REMIX_LIST_CHECK_2 = 'M11 4H21V6H11V4ZM11 8H17V10H11V8ZM11 14H21V16H11V14ZM11 18H17V20H11V18ZM3 4H9V10H3V4ZM5 6V8H7V6H5ZM3 14H9V20H3V14ZM5 16V18H7V16H5Z'
    // Remix Icon `settings-line` (hexagon + ring), Apache-2.0,
    // https://remixicon.com/icon/settings-line — inlined so the rail needs no
    // icon package at runtime.
    const REMIX_INFORMATION_LINE = 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 7H13V9H11V7ZM11 11H13V17H11V11Z'

    const REMIX_ANNOTATION_COPY_LINE = 'M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z'

    //#endregion



    /** The annotation React surface, built once with the entry's glyph + icons. */
    const annotationComponents = createAnnotationComponents({
      React: /** @type {typeof import('react')} */ (React),
      glyph: /** @type {(path: string, size?: number, className?: string, scale?: number) => import('react').ReactElement} */ (RemixGlyph),
      icons: {
        focus: REMIX_FOCUS_3_LINE,
        close: REMIX_CLOSE_LINE,
        arrowUp: REMIX_ARROW_UP_LINE,
        arrowDown: REMIX_ARROW_DOWN_LINE,
        delete: REMIX_DELETE_BIN_LINE,
        listCheck: REMIX_LIST_CHECK_2,
        information: REMIX_INFORMATION_LINE,
        annotationCopy: REMIX_ANNOTATION_COPY_LINE,
        fileCopy: REMIX_FILE_COPY_LINE,
        link: REMIX_LINK
      }
    })

    /** The per-factory annotation installer (install guard + controller + seats). */
    const uiAnnotationInstaller = createUiAnnotationInstaller({
      React: /** @type {typeof import('react')} */ (React),
      components: annotationComponents,
      copy: { en: ANNOTATION_EN, zh: ANNOTATION_ZH },
      bridge: annotationBridge
    })

    //#endregion


    //#region feature: update check
    //
    // The controller, card and `shell.overlay` registration live in
    // `src/browser/update-check/install.ts`: the entry only binds the React
    // runtime, the app URL builder, the Host route and this bundle's package
    // name, then installs it in `apply`. Copy, stylesheet, storage key, slot id
    // and the additive overlay-only rendering stay unchanged; this region is a
    // wiring point.
    const { installUpdatePrompt } = createUpdateCheck({
      React,
      appUrl,
      updateRoute: ROUTES.update,
      packageName: PACKAGE_NAME
    })
    //#endregion

    //#region feature: sidebar width
    //
    // Durable, Host-synced left sidebar width. The stateful controller and its
    // runtime live in `src/browser/sidebar-width/install.ts`; the entry only
    // creates the per-factory instance and hands it the app URL builder. That
    // typed module owns attach/detach, drag capture, the browser cache, Host
    // sync/adoption/reopen and the read-only E2E probe, so this region stays a
    // wiring point.
    const sidebarWidthController = createSidebarWidthController({ appUrl })
    //#endregion

    //#region feature: session artifacts — Files-header action
    //
    // The panel, the source filter, the Files-header toggle and the URL and
    // clipboard helpers live in `src/browser/artifacts/**`: the entry only
    // binds the React runtime and the inline glyph builder, then installs the
    // action in `apply`. Copy, CSS, DOM markers and slot ids are unchanged;
    // this region is a wiring point.
    const artifactsFeature = createArtifactsComponents({
      React,
      ReactDOM,
      RemixGlyph
    })
    //#endregion

    //#region feature: workspace default presets
    //
    // The menu contribution and the new-Session routing patch live in
    // `src/browser/workspace-presets/install.ts`: the entry only binds the
    // React runtime for the menu icon and passes the app URL builder, then
    // installs both in `apply`. Copy, menu ids and patch behavior are unchanged;
    // this region is a wiring point.
    const workspacePresets = createWorkspacePresets({ React })
    //#endregion



    //#region plugin
    /**
     * Register dictionaries, the page type, and its Session-scoped body.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function apply(ctx) {
      const t = ctx.locale.bind(ARTIFACTS_NS)
      // Documented test seam: seed/settle one interrupted record and re-sync the
      // native row decoration, so the E2E can exercise the interrupted-idle,
      // continued-running and completed phases without sending a real Continue.
      const testHooks = testHookHost.__POWER_SUITE_TEST_HOOKS__
      if (testHooks !== null && typeof testHooks === 'object') {
        testHooks.interruptedSessions = {
          set: (sessionId, patch) => {
            interruptedSessions.store.setInterruptedRecord(sessionId, { status: 'ready', interrupted: false, running: false, ...patch })
            interruptedSessions.store.syncInterruptedRows()
            return interruptedSessions.store.interruptedRecord(sessionId)
          },
          clear: (sessionId) => {
            interruptedSessions.store.interruptedStore.records.delete(sessionId)
            interruptedSessions.store.syncInterruptedRows()
          },
          record: (sessionId) => interruptedSessions.store.interruptedRecord(sessionId),
          sync: () => interruptedSessions.store.syncInterruptedRows()
        }
      }
      artifactsFeature.installArtifacts(/** @type {import('./browser/artifacts/panel.ts').ArtifactsContext} */ (ctx))
      workspacePresets.installWorkspacePresetMenu(/** @type {import('./browser/workspace-presets/install.ts').WorkspacePresetsContext} */ (ctx), appUrl)
      workspacePresets.installWorkspacePresetRouting(/** @type {import('./browser/workspace-presets/install.ts').WorkspacePresetsContext} */ (ctx), appUrl)
      promptHistory.installPromptHistory(/** @type {import('./browser/prompt-history/seat.ts').PromptHistorySeatContext} */ (ctx))
      installPromptHistoryPreview(/** @type {import('./browser/prompt-history/preview.ts').PromptHistoryPreviewContext} */ (ctx))
      draftAttachments.installDraftAttachmentMemory(/** @type {import('./browser/draft-attachments/install.ts').DraftAttachmentContext} */ (ctx))
      dynamicWorkspacesInstaller.install(/** @type {import('./browser/dynamic-workspaces/install.ts').DynamicWorkspacesContext} */ (ctx))
      installSessionHoverFigures(/** @type {import('./browser/native-session-hover-figures/install.ts').NativeSessionHoverFiguresContext} */ (ctx))
      interruptedSessions.installInterruptedSessions(/** @type {import('./browser/interrupted-sessions/components.ts').InterruptedSessionComponentsContext} */ (ctx))
      installQuickLook(/** @type {import('./browser/hover-quick-look/install.ts').HoverQuickLookContext} */ (ctx), {
        t,
        appUrl,
        rawRoute: RAW_ROUTE,
        previewRoute: PREVIEW_ROUTE,
        attachmentUrl: (attachment, disposition) => attachmentUrl(attachment, disposition, null),
        formatBytes,
        icons: { file: REMIX_FILE_LINE, open: REMIX_BOOK_OPEN_LINE, download: REMIX_DOWNLOAD_LINE }
      })
      settingsPage.installSettingsPage(/** @type {import('./browser/settings/page.ts').SettingsPageContext} */ (ctx))
      composerGallery.installComposerImageGallery(/** @type {import('./browser/composer-gallery/install.ts').ComposerGalleryContext} */ (ctx))
      installUpdatePrompt(/** @type {import('./browser/update-check/install.ts').UpdateCheckContext} */ (ctx))
      uiAnnotationInstaller.install(/** @type {import('./browser/ui-annotation/install.ts').UiAnnotationContext} */ (ctx))
      // The entry context is documented as a loose object; the sidebar module
      // declares the narrow slice it reads, so assert once at this boundary.
      sidebarWidthController.install(/** @type {import('./browser/sidebar-width/install.ts').SidebarWidthContext} */ (ctx))
    }

    // Test seam: the controller's deterministic fallback-scan probe is the only
    // diagnostic the browser E2E still needs (it proves the status cache does not
    // rescan the DOM). Every pure annotation model is imported from
    // `src/browser/ui-annotation/**` and unit-tested directly, so the retired
    // 112-key pass-through is not republished here. Production never defines the
    // flag, so this block is inert.
    if (typeof globalThis !== 'undefined'
      && typeof testHookHost.__POWER_SUITE_TEST_HOOKS__ === 'object'
      && testHookHost.__POWER_SUITE_TEST_HOOKS__ !== null) {
      testHookHost.__POWER_SUITE_TEST_HOOKS__.uiAnnotation = {
        debugFallbackScanProbe: () => uiAnnotationInstaller.debugFallbackScanProbe()
      }

      // Sidebar width: only the attach probe the browser E2E reads remains a
      // test hook; the pure decisions live in `src/browser/sidebar-width/model.ts`
      // and the controller in its `install.ts`, both covered directly. The
      // controller's `probe` is read-only.
      testHookHost.__POWER_SUITE_TEST_HOOKS__.sidebarWidth = { probe: sidebarWidthController.probe }
    }

    //#endregion

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'contextMenus', 'remote', 'remote.agentPresets', 'uiWorkspace', 'sessions'],
      apply
    }
  }
})
