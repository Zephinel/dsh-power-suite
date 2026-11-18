// @ts-nocheck — Phase 3 keeps the browser half out of the type gate while its entries are split into modules; see docs/plans/typescript-migration.md.
//
// The entry is an ES module: the build bundles it into the classic-script IIFE
// the DSH shell loads. Pure browser models live under src/browser/ and are
// imported here instead of being redefined inline.
import { installQuickLook } from './browser/hover-quick-look/install.ts'
import { createUpdateCheck } from './browser/update-check/install.ts'
import { createSidebarWidthController } from './browser/sidebar-width/install.ts'
import {
  ACTIVE_PROJECT_DAYS,
  DEFAULT_SETTINGS,
  PROMPT_HISTORY_MODIFIERS,
  RECENT_SESSION_MINUTES
} from './shared/protocol.ts'
import {
  filesArtifactsInitialState,
  filesArtifactsPhaseMs,
  filesArtifactsReduce
} from './browser/artifacts/model.ts'
import { interruptedCardMark, interruptedIndicatorActive } from './browser/interrupted-sessions/model.ts'
import { createInterruptedSessionComponents } from './browser/interrupted-sessions/components.ts'
import { createPromptHistoryPreview } from './browser/prompt-history/preview.ts'
import { mergeSettingsPayload } from './browser/settings/model.ts'
import { ROUTES, browserRoute } from './shared/routes.ts'
import {
  PSG_WHEEL_COOLDOWN_MS,
  PSG_WHEEL_STEP_PX,
  psgClampIndex,
  psgCollectImages,
  psgStepIndex,
  psgSyncState,
  psgWheelDecision
} from './browser/composer-gallery/model.ts'
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

    /** This feature's copy namespace. */
    const NS = 'sessionArtifacts'

    /** Slot cell identity of the Files-header Artifacts action. */
    const FILES_ACTION_ID = 'power-suite.files-artifacts'

    /** Authenticated exact routes registered by the Host half. */
    const LIST_ROUTE = browserRoute(ROUTES.sessionArtifactsList)
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

    //#region copy
    const EN = {
      'panel.title': 'Artifacts',
      'action.back': 'Back to files',
      'list.count': '{count} artifacts',
      'list.countOne': '1 artifact',
      'list.countOf': '{shown} of {total} artifacts',
      'list.refresh': 'Refresh',
      'list.loading': 'Loading…',
      'list.empty.title': 'No artifacts yet',
      'list.empty.hint': 'Files this session writes, or delivers with present, appear here.',
      'list.empty.filtered': 'No artifacts in this filter',
      'list.error.title': 'Could not load artifacts',
      'list.retry': 'Retry',
      'filter.label': 'Artifact source',
      'filter.all': 'All',
      'filter.generated': 'Generated',
      'filter.provided': 'Provided',
      'meta.presented': 'Delivered',
      'meta.generated': 'Generated',
      'meta.provided': 'Provided',
      'meta.turn': 'turn {turn}',
      'meta.prompt': 'prompt {prompt}',
      'action.open': 'Open',
      'action.download': 'Download',
      'action.copy': 'Copy link',
      'action.copyContent': 'Copy content',
      'action.copyImage': 'Copy image',
      'action.copied': 'Copied',
      'footer.note': 'Open previews the file in the right Sidebar. Download saves the file so the system can hand it to a local app.',
      'preview.loading': 'Loading preview…',
      'preview.unavailable': 'No preview available',
      'preview.truncated': 'Preview truncated',
      'preview.resize': 'Resize preview'
    }
    const ZH = {
      'panel.title': '产物',
      'action.back': '返回文件',
      'list.count': '{count} 个产物',
      'list.countOne': '1 个产物',
      'list.countOf': '显示 {shown} / 共 {total} 个产物',
      'list.refresh': '刷新',
      'list.loading': '加载中…',
      'list.empty.title': '还没有产物',
      'list.empty.hint': '本会话写入的文件，或用 present 交付的文件会出现在这里。',
      'list.empty.filtered': '此筛选下没有产物',
      'list.error.title': '产物加载失败',
      'list.retry': '重试',
      'filter.label': '产物来源',
      'filter.all': '全部',
      'filter.generated': '生成',
      'filter.provided': '用户提供',
      'meta.presented': '已交付',
      'meta.generated': '已生成',
      'meta.provided': '用户提供',
      'meta.turn': '第 {turn} 轮',
      'meta.prompt': '第 {prompt} 条提示',
      'action.open': '打开',
      'action.download': '下载',
      'action.copy': '复制链接',
      'action.copyContent': '复制内容',
      'action.copyImage': '复制图片',
      'action.copied': '已复制',
      'footer.note': '「打开」在右侧边栏中预览；「下载」保存文件后由系统交给本地应用。',
      'preview.loading': '正在加载预览…',
      'preview.unavailable': '此文件暂无预览',
      'preview.truncated': '预览已截断',
      'preview.resize': '拖动调整预览大小'
    }
    //#endregion

    //#region feature: workspace default presets — copy and routes
    /** Copy namespace for the Workspace default-preset menu. */
    const PRESET_NS = 'workspacePresets'

    /** Exact routes the Host half serves for the override map. */
    const PRESET_GET_ROUTE = browserRoute(ROUTES.workspacePresetsGet)
    const PRESET_SET_ROUTE = browserRoute(ROUTES.workspacePresetsSet)

    const PRESET_EN = {
      'menu.followGlobal': 'Follow the global default',
      'menu.followGlobalCurrent': 'Follow the global default (currently {name})',
      'menu.current': 'Default agent preset: {name}',
      'preset.standard': 'Standard mode',
      'preset.ptc': 'PTC mode',
      'preset.minimal': 'Minimal mode',
      'preset.cordis': 'Creator mode',
      'menu.currentMark': '{name} (current)',
      'menu.unavailableMark': '{name} (unavailable)',
      'menu.globalDefault': 'Global default',
      'menu.loadFailed': 'Could not read agent presets',
      'menu.saveFailed': 'Could not save the default agent preset',
      'menu.saved': 'Default agent preset saved'
    }
    const PRESET_ZH = {
      'menu.followGlobal': '跟随全局默认',
      'menu.followGlobalCurrent': '跟随全局默认（当前为 {name}）',
      'menu.current': '默认 Agent 预设：{name}',
      'preset.standard': '标准模式',
      'preset.ptc': 'PTC 模式',
      'preset.minimal': '极简模式',
      'preset.cordis': '创造模式',
      'menu.currentMark': '{name}（当前）',
      'menu.unavailableMark': '{name}（不可用）',
      'menu.globalDefault': '全局默认',
      'menu.loadFailed': '无法读取 Agent 预设',
      'menu.saveFailed': '无法保存默认 Agent 预设',
      'menu.saved': '默认 Agent 预设已保存'
    }
    //#endregion

    //#region styles
    const CSS = `
.dsa-root{display:flex;flex-direction:column;min-height:0;height:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dsa-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px 6px}
.dsa-count{color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsa-back{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm,6px)}
.dsa-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-back:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dsa-header-leading{display:inline-flex;align-items:center;gap:2px;min-width:0;flex:none}
.dsa-refresh{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm,6px)}
.dsa-refresh:hover:enabled{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-refresh:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dsa-refresh:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dsa-refresh[data-loading=true] svg{animation:dsa-spin .9s linear infinite}
@keyframes dsa-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.dsa-refresh[data-loading=true] svg{animation:none}}
.dsa-header-tools{display:inline-flex;align-items:center;gap:2px;flex:none}
.dsa-filter-wrap{position:relative;flex:none}
.dsa-filter-trigger{appearance:none;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 6px 0 8px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;line-height:18px;cursor:pointer}
.dsa-filter-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-filter-trigger[aria-expanded=true]{background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.dsa-filter-trigger:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dsa-filter-trigger-label{white-space:nowrap}
.dsa-filter-trigger-count{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px;font-variant-numeric:tabular-nums}
.dsa-filter-caret{display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary);transition:transform .16s ease}
.dsa-filter-trigger[aria-expanded=true] .dsa-filter-caret{transform:rotate(180deg)}
.dsa-filter-menu{position:absolute;z-index:40;top:calc(100% + 6px);right:0;min-width:196px;padding:4px;border-radius:12px;border:0;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,0 10px 30px rgb(0 0 0 / 22%));display:flex;flex-direction:column;gap:2px;animation:dsa-menu-in .12s ease-out}
@keyframes dsa-menu-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion: reduce){.dsa-filter-menu{animation:none}}
.dsa-filter-option{appearance:none;display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;line-height:18px;text-align:left;cursor:pointer}
.dsa-filter-option:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-filter-option:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dsa-filter-option[aria-checked=true]{background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);font-weight:500}
.dsa-filter-option-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsa-filter-option-count{color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums}
.dsa-filter-check{flex:none;display:inline-flex;align-items:center;color:var(--dsw-alias-label-primary)}
.dsa-list{list-style:none;margin:0;padding:0 8px 8px;overflow:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:2px}
.dsa-row{display:flex;align-items:center;gap:10px;padding:8px 8px;border-radius:var(--dsw-radius-lg,10px);min-width:0}
.dsa-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsa-icon{flex:none;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;justify-content:center}
.dsa-thumb{flex:none;display:block;width:40px;height:40px;border-radius:8px;object-fit:cover;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2,transparent)}
.dsa-main{flex:1;min-width:0}
.dsa-name{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsa-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsa-desc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:17px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.dsa-actions{flex:none;display:flex;align-items:center;gap:6px}
.dsa-action{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm,6px);text-decoration:none}
.dsa-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsa-action:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dsa-action[data-copied=true]{color:var(--dsw-alias-state-success-primary)}
.dsa-action:disabled{color:var(--dsw-alias-label-tertiary);cursor:default;background:transparent}
.dsa-empty{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;text-align:center}
.dsa-empty-icon{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;justify-content:center}
.dsa-empty-title{font-weight:500}
.dsa-empty-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;max-width:260px}
.dsa-retry{margin-top:6px;appearance:none;border:0;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;padding:4px 12px;border-radius:var(--dsw-radius-md,8px)}
.dsa-footer{flex:none;padding:0 14px 10px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsa-loading{flex:1;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
`
    /**
     * Files-pane chrome for the Artifacts action: the header tool button and the
     * in-pane overlay transition. Kept separate from the artifacts list stylesheet
     * because the button exists while the overlay is closed.
     */
    const FILES_ARTIFACTS_CSS = `
.psfa-tool{appearance:none;box-sizing:border-box;width:28px;height:28px;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-sm,8px);cursor:pointer;background:0 0;border:none;flex:none;justify-content:center;align-items:center;padding:5px;line-height:1;display:inline-flex}
.psfa-tool svg{width:18px;height:18px}
@media (hover:hover){.psfa-tool:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}}
.psfa-tool[aria-pressed='true']{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.psfa-tool:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.psfa-view{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;min-height:0;box-sizing:border-box;overflow:hidden;background:var(--dsw-alias-bg-base)}
.psfa-view:focus{outline:none}
.psfa-view[data-psfa-state='opening']{animation:psfa-view-enter var(--psfa-enter-ms,180ms) cubic-bezier(.22,1,.36,1) both}
.psfa-view[data-psfa-state='closing']{animation:psfa-view-exit var(--psfa-exit-ms,160ms) cubic-bezier(.4,0,.2,1) both;pointer-events:none}
[data-files-page] [data-files-content] > :not([data-psfa-overlay]){transition:opacity var(--psfa-enter-ms,180ms) var(--ds-ease-in-out,ease),transform var(--psfa-enter-ms,180ms) var(--ds-ease-in-out,ease)}
[data-files-page][data-psfa-active='true'] [data-files-content] > :not([data-psfa-overlay]){opacity:0;transform:translateX(-14px);pointer-events:none}
@keyframes psfa-view-enter{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
@keyframes psfa-view-exit{from{opacity:1;transform:none}to{opacity:0;transform:translateX(14px)}}
@media (prefers-reduced-motion: reduce){.psfa-view[data-psfa-state='opening'],.psfa-view[data-psfa-state='closing']{animation:none}[data-files-page] [data-files-content] > :not([data-psfa-overlay]){transition:none}}
`

    /**
     * Render the local stylesheet with the panel.
     *
     * A component-local style element is the sanctioned mechanism (no global
     * DOM owner). It travels with the panel instance, so several panels mount
     * duplicate copies rather than sharing global state.
     * @returns {object} the style element.
     */
    function panelStyle() {
      return React.createElement('style', null, CSS)
    }
    //#endregion

    //#region icons
    // Remix Icon path data (Apache-2.0, https://remixicon.com), inlined so the
    // panel needs no icon package at runtime.
    const REMIX_ARROW_LEFT_LINE = 'M7.82843 10.9999H20V12.9999H7.82843L13.1924 18.3638L11.7782 19.778L4 11.9999L11.7782 4.22168L13.1924 5.63589L7.82843 10.9999Z'
    const REMIX_REFRESH_LINE = 'M5.46257 4.43262C7.21556 2.91688 9.5007 2 12 2C17.5228 2 22 6.47715 22 12C22 14.1361 21.3302 16.1158 20.1892 17.7406L17 12H20C20 7.58172 16.4183 4 12 4C9.84982 4 7.89777 4.84827 6.46023 6.22842L5.46257 4.43262ZM18.5374 19.5674C16.7844 21.0831 14.4993 22 12 22C6.47715 22 2 17.5228 2 12C2 9.86386 2.66979 7.88416 3.8108 6.25944L7 12H4C4 16.4183 7.58172 20 12 20C14.1502 20 16.1022 19.1517 17.5398 17.7716L18.5374 19.5674Z'
    const REMIX_FILTER_LINE = 'M21 4V6H20L15 13.5V22H9V13.5L4 6H3V4H21ZM6.4037 6L11 12.8944V20H13V12.8944L17.5963 6H6.4037Z'
    /**
     * Thin stroked chevron used by the artifacts filter trigger, matching the
     * shell's native dropdown caret rather than a filled arrow glyph.
     * @param {number} size - rendered edge length in pixels.
     * @returns {object} the SVG element.
     */
    function FilterCaretGlyph(size) {
      return React.createElement('svg', {
        viewBox: '0 0 24 24',
        width: size ?? 12,
        height: size ?? 12,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false'
      }, React.createElement('path', { d: 'M6 9.5 12 15.5 18 9.5' }))
    }
    const REMIX_FILE_LINE = 'M9 2.00318V2H19.9978C20.5513 2 21 2.45531 21 2.9918V21.0082C21 21.556 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5501 3 20.9932V8L9 2.00318ZM5.82918 8H9V4.83086L5.82918 8ZM11 4V9C11 9.55228 10.5523 10 10 10H5V20H19V4H11Z'
    const REMIX_BOOK_OPEN_LINE = 'M13 21V23H11V21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H9C10.1947 3 11.2671 3.52375 12 4.35418C12.7329 3.52375 13.8053 3 15 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H13ZM20 19V5H15C13.8954 5 13 5.89543 13 7V19H20ZM11 19V7C11 5.89543 10.1046 5 9 5H4V19H11Z'
    const REMIX_DOWNLOAD_LINE = 'M3 19H21V21H3V19ZM13 13.1716L19.0711 7.1005L20.4853 8.51472L12 17L3.51472 8.51472L4.92893 7.1005L11 13.1716V2H13V13.1716Z'
    const REMIX_CHECK_LINE = 'M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z'
    const REMIX_FILE_COPY_LINE = 'M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z'
    const REMIX_LINK = 'M18.3638 15.5355L16.9496 14.1213L18.3638 12.7071C20.3164 10.7545 20.3164 7.58866 18.3638 5.63604C16.4112 3.68341 13.2453 3.68341 11.2927 5.63604L9.87849 7.05025L8.46428 5.63604L9.87849 4.22182C12.6122 1.48815 17.0443 1.48815 19.778 4.22182C22.5117 6.95549 22.5117 11.3876 19.778 14.1213L18.3638 15.5355ZM15.5353 18.364L14.1211 19.7782C11.3875 22.5118 6.95531 22.5118 4.22164 19.7782C1.48797 17.0445 1.48797 12.6123 4.22164 9.87868L5.63585 8.46446L7.05007 9.87868L5.63585 11.2929C3.68323 13.2455 3.68323 16.4113 5.63585 18.364C7.58847 20.3166 10.7543 20.3166 12.7069 18.364L14.1211 16.9497L15.5353 18.364ZM14.8282 7.75736L16.2425 9.17157L9.17139 16.2426L7.75717 14.8284L14.8282 7.75736Z'

    /**
     * Render one inline Remix glyph.
     * @param {string} path - Remix path data.
     * @param {number} size - pixel size.
     * @param {string} [className] - optional class.
     * @param {number} [scale] - optional inner-path scale; omitted keeps 1:1.
     * @returns {object} the SVG element.
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
     * The row's glyph: one file outline.
     * @returns {object} the SVG element.
     */
    function FileIcon() {
      return React.createElement('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true
      },
      React.createElement('path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z' }),
      React.createElement('path', { d: 'M14 3v5h5' }))
    }

    /**
     * One artifact row's leading glyph: an image thumbnail for image artifacts
     * (lazily loaded and rounded), the generic file outline otherwise. A
     * thumbnail that fails to load falls back to the outline so a row never
     * shows a broken-image glyph.
     * @param {{ artifact: object, origin: string | null }} props - row and Host origin.
     * @returns {object} the img or icon element.
     */
    function ArtifactGlyph(props) {
      const { artifact, origin } = props
      const [failed, setFailed] = React.useState(false)
      if (!isImageArtifact(artifact) || failed) {
        return React.createElement('span', { className: 'dsa-icon' }, FileIcon())
      }
      return React.createElement('img', {
        className: 'dsa-thumb',
        src: artifactUrl(artifact, 'inline', origin),
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        draggable: false,
        onError: () => setFailed(true)
      })
    }

    /**
     * The artifacts glyph: an open tray (empty state and the Files-header action).
     * @param {{ size?: number, className?: string }} [props] - optional edge length.
     * @returns {object} the SVG element.
     */
    function TrayIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 28
      return React.createElement('svg', {
        width: size,
        height: size,
        className: typeof props?.className === 'string' ? props.className : undefined,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true
      },
      React.createElement('path', { d: 'M4 13.5 6.2 5.8A2 2 0 0 1 8.1 4.4h7.8a2 2 0 0 1 1.9 1.4L20 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z' }),
      React.createElement('path', { d: 'M4 13.5h4.6l1.2 2h4.4l1.2-2H20' }))
    }
    //#endregion

    //#region helpers
    /**
     * Resolve one Host route against the application's base URL.
     * @param {string} relative - route below the application root.
     * @returns {string} the absolute URL.
     */
    function appUrl(relative) {
      return new URL(relative, document.baseURI).href
    }

    /**
     * Build one raw-artifact URL, preferring the Host's LAN origin for links
     * shared with another device.
     * @param {object} artifact - row from the list response.
     * @param {'inline' | 'attachment'} disposition - inline rendering or download.
     * @param {string | null} origin - absolute origin reported by the Host.
     * @returns {string} the URL.
     */
    function rawUrl(artifact, disposition, origin) {
      let base = appUrl(RAW_ROUTE)
      if (typeof origin === 'string' && origin.length > 0) {
        try {
          const lanBase = new URL(browserRoute(ROUTES.sessionArtifactsRaw), origin.endsWith('/') ? origin : `${origin}/`)
          base = lanBase.href
        } catch {
          base = appUrl(RAW_ROUTE)
        }
      }
      const url = new URL(base)
      url.searchParams.set('path', artifact.path)
      url.searchParams.set('name', artifact.name)
      url.searchParams.set('disposition', disposition)
      return url.href
    }

    /**
     * Build the `dsh-resource://file/…` address the right Sidebar's document
     * preview claims for a Session file. The grammar mirrors
     * `@deepseek-ai/dsh-util-workspace-path` (component encoding, `:` kept for
     * Windows drives) so this plugin needs no extra client dependency.
     * @param {string} sessionId - authorizing Session.
     * @param {string} path - absolute file path.
     * @returns {string} the resource address.
     */
    function artifactFileAddress(sessionId, path) {
      const encode = (segment) => encodeURIComponent(segment).replace(/%3A/gi, ':')
      const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
      return `dsh-resource://file/session/${encode(sessionId)}/${normalized.split('/').map(encode).join('/')}`
    }

    /**
     * Build one user-provided attachment URL, preferring the Host's LAN origin
     * for links shared with another device.
     *
     * The query repeats the durable reference fields the Session log recorded
     * (never a host path); the Host's attachment store verifies the object
     * against them before serving any bytes.
     * @param {object} artifact - provided row from the list response.
     * @param {'inline' | 'attachment'} disposition - inline rendering or download.
     * @param {string | null} origin - absolute origin reported by the Host.
     * @returns {string} the URL.
     */
    function attachmentUrl(artifact, disposition, origin) {
      let base = appUrl(ATTACHMENT_ROUTE)
      if (typeof origin === 'string' && origin.length > 0) {
        try {
          const lanBase = new URL(browserRoute(ROUTES.sessionArtifactsAttachment), origin.endsWith('/') ? origin : `${origin}/`)
          base = lanBase.href
        } catch {
          base = appUrl(ATTACHMENT_ROUTE)
        }
      }
      const url = new URL(base)
      url.searchParams.set('attachmentId', artifact.attachmentId)
      if (typeof artifact.name === 'string' && artifact.name.length > 0) {
        url.searchParams.set('name', artifact.name)
      }
      if (typeof artifact.mediaType === 'string' && artifact.mediaType.length > 0) {
        url.searchParams.set('mediaType', artifact.mediaType)
      }
      if (typeof artifact.bytes === 'number') url.searchParams.set('bytes', String(artifact.bytes))
      if (typeof artifact.width === 'number') url.searchParams.set('width', String(artifact.width))
      if (typeof artifact.height === 'number') url.searchParams.set('height', String(artifact.height))
      url.searchParams.set('disposition', disposition)
      return url.href
    }

    /**
     * Build the current source URL for one artifact row: workspace files use the
     * raw path route, user-provided attachments use the attachment route.
     * @param {object} artifact - row from the list response.
     * @param {'inline' | 'attachment'} disposition - inline rendering or download.
     * @param {string | null} origin - absolute origin reported by the Host.
     * @returns {string} the URL.
     */
    function artifactUrl(artifact, disposition, origin) {
      return artifact.provided === true
        ? attachmentUrl(artifact, disposition, origin)
        : rawUrl(artifact, disposition, origin)
    }

    /**
     * Stable identity of one artifact row (a workspace path or an attachment id).
     * @param {object} artifact - row from the list response.
     * @returns {string} the row key.
     */
    function artifactKey(artifact) {
      return artifact.provided === true ? String(artifact.attachmentId) : artifact.path
    }

    /**
     * Whether one artifact row renders an image thumbnail.
     * @param {object} artifact - row from the list response.
     * @returns {boolean} true when the Host reports an image media type.
     */
    function isImageArtifact(artifact) {
      return typeof artifact.mime === 'string' && artifact.mime.startsWith('image/')
    }

    /**
     * Classify one artifact for content copying: text can be copied verbatim,
     * images are copied as a picture when the browser allows it, anything else
     * has no meaningful clipboard representation.
     * @param {object} artifact - row from the list response.
     * @returns {'text' | 'image' | 'none'} the content kind.
     */
    function artifactContentKind(artifact) {
      const mime = typeof artifact.mime === 'string' ? artifact.mime : ''
      if (mime.startsWith('image/')) return 'image'
      if (mime.startsWith('text/')
        || /^(?:application\/(?:json|xml|javascript|typescript|rtf|x-yaml|x-sh|x-httpd-php))/.test(mime)
        || /\.(?:md|markdown|txt|log|csv|tsv|json|ya?ml|xml|js|mjs|cjs|ts|tsx|jsx|css|scss|sass|sh|bash|zsh|py|go|rs|java|rb|php|html?|sql|diff|patch|ini|toml|cfg|conf)$/i.test(artifact.name)) {
        return 'text'
      }
      return 'none'
    }

    /**
     * Convert an image blob to PNG so the clipboard can take it.
     * @param {Blob} blob - source image bytes.
     * @returns {Promise<Blob | null>} PNG bytes, or null when conversion fails.
     */
    async function imageBlobToPng(blob) {
      try {
        const bitmap = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')
        if (context === null) return null
        context.drawImage(bitmap, 0, 0)
        bitmap.close?.()
        return await new Promise((resolve) => {
          try {
            canvas.toBlob((png) => resolve(png), 'image/png')
          } catch {
            resolve(null)
          }
        })
      } catch {
        return null
      }
    }

    /**
     * Copy an image by selecting a hidden `<img>` and issuing the legacy copy
     * command. Works on insecure origins where the async clipboard is missing;
     * the clipboard receives HTML containing the image, so rich editors paste it
     * as an image while plain-text targets may only see the alt text.
     * @param {string} url - inline image URL.
     * @param {string} name - display name used as alt text.
     * @returns {Promise<boolean>} whether the copy command succeeded.
     */
    async function copyImageViaSelection(url, name) {
      const host = document.createElement('div')
      host.setAttribute('contenteditable', 'true')
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;'
      const image = document.createElement('img')
      image.src = url
      image.alt = name
      host.appendChild(image)
      document.body.appendChild(host)
      try {
        await new Promise((resolve) => {
          if (image.complete) resolve()
          else {
            image.onload = resolve
            image.onerror = resolve
          }
        })
        if (!image.complete || image.naturalWidth === 0) return false
        const range = document.createRange()
        range.selectNodeContents(host)
        const selection = window.getSelection()
        if (selection === null) return false
        selection.removeAllRanges()
        selection.addRange(range)
        host.focus()
        const copied = document.execCommand('copy')
        selection.removeAllRanges()
        return copied
      } finally {
        host.remove()
      }
    }

    /**
     * Copy one artifact's content to the clipboard: text verbatim, images as a
     * picture when the async clipboard and ClipboardItem exist, otherwise the
     * legacy HTML-image clipboard path, then the inline URL as a last resort.
     * @param {object} artifact - row from the list response.
     * @param {string | null} origin - Host LAN origin for the inline URL.
     * @returns {Promise<boolean>} whether something was copied.
     */
    async function copyArtifactContent(artifact, origin) {
      const kind = artifactContentKind(artifact)
      if (kind === 'none') return false
      const url = artifactUrl(artifact, 'inline', origin)
      let response
      try {
        response = await fetch(url, { credentials: 'same-origin' })
      } catch {
        return false
      }
      if (!response.ok) return false
      if (kind === 'text') {
        try {
          return await copyText(await response.text())
        } catch {
          return false
        }
      }
      let imageBlob = null
      try {
        if (navigator.clipboard !== undefined && typeof ClipboardItem === 'function') {
          imageBlob = await response.blob()
          const png = imageBlob.type === 'image/png' ? imageBlob : await imageBlobToPng(imageBlob)
          if (png !== null) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
            return true
          }
        }
      } catch {
        // Fall through to the legacy/URL fallbacks.
      }
      // Plain-HTTP LAN pages have no async clipboard API. Selecting a hidden
      // image and running the legacy copy command still puts the image markup
      // on the clipboard, which rich editors paste as the picture itself.
      try {
        if (await copyImageViaSelection(url, artifact.name)) return true
      } catch {
        // Fall through to the URL fallback.
      }
      // Last resort: the inline URL is at least paste-able as text.
      return copyText(url)
    }

    /**
     * Open one artifact in the right Sidebar's native document preview
     * (workspace files + document preview), falling back to the raw route in a
     * browser tab when no preview type claims the address.
     * @param {object} sidebarRight - right Sidebar navigation service.
     * @param {string} sessionId - Session that owns the artifact rows.
     * @param {object} artifact - row from the list response.
     * @param {string | null} origin - Host LAN origin for the fallback URL.
     * @returns {boolean} whether the native preview handled the open.
     */
    function openArtifactPreview(sidebarRight, sessionId, artifact, origin) {
      try {
        sidebarRight.openResource(artifactFileAddress(sessionId, artifact.path))
        return true
      } catch {
        window.open(rawUrl(artifact, 'inline', origin), '_blank', 'noopener,noreferrer')
        return false
      }
    }

    /**
     * Human byte size.
     * @param {number} bytes - byte count.
     * @returns {string} compact size text.
     */
    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return ''
      if (bytes < 1024) return `${bytes} B`
      const units = ['KB', 'MB', 'GB', 'TB']
      let value = bytes / 1024
      let unit = 0
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
      }
      return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`
    }

    /**
     * Write text to the clipboard. Plain-HTTP pages have no async Clipboard API,
     * so the legacy selection path is the only fallback on a LAN deployment.
     * @param {string} text - text to copy.
     * @returns {Promise<boolean>} whether the copy was issued.
     */
    function copyText(text) {
      if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(
          () => true,
          () => fallbackCopy(text)
        )
      }
      return Promise.resolve(fallbackCopy(text))
    }

    /**
     * Copy through a temporary selected textarea.
     * @param {string} text - text to copy.
     * @returns {boolean} whether the browser accepted the copy command.
     */
    function fallbackCopy(text) {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.top = '-1px'
      area.style.left = '-1px'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      let copied = false
      try {
        copied = document.execCommand('copy')
      } catch {
        copied = false
      }
      area.remove()
      return copied
    }
    //#endregion

    //#region panel
    /** Artifact source filters, in display order. */
    const FILTER_OPTIONS = ['all', 'generated', 'provided']

    /**
     * Render the artifact list for one Session.
     * @param {{ sessionId: string, t: Function }} props - Session scope and copy.
     * @returns {object} the panel element.
     */
    function ArtifactsPanel(props) {
      const { sessionId, t, sidebarRight } = props
      // Optional: rendered by the Files-pane overlay so the list has a Back
      // affordance next to its own count/filter/refresh tools.
      const onBack = typeof props.onBack === 'function' ? props.onBack : null
      const [phase, setPhase] = React.useState('loading')
      const [payload, setPayload] = React.useState(null)
      const [failure, setFailure] = React.useState('')
      const [reload, setReload] = React.useState(0)
      const [copiedPath, setCopiedPath] = React.useState(null)
      const [copiedContentKey, setCopiedContentKey] = React.useState(null)
      const [filter, setFilter] = React.useState('all')
      const [filterOpen, setFilterOpen] = React.useState(false)
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
      const filterWrapRef = React.useRef(null)
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
      const filterMenuRef = React.useRef(null)

      React.useEffect(() => {
        let active = true
        const controller = new AbortController()
        setPhase('loading')
        setFailure('')
        fetch(appUrl(LIST_ROUTE) + `?sessionId=${encodeURIComponent(sessionId)}`, {
          signal: controller.signal,
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
          .then(async (response) => {
            if (!response.ok) {
              let message = `HTTP ${response.status}`
              try {
                const body = await response.json()
                if (body !== null && typeof body === 'object' && typeof body.message === 'string') {
                  message = body.message
                }
              } catch {
                // Keep the status text.
              }
              throw new Error(message)
            }
            return response.json()
          })
          .then((value) => {
            if (!active) return
            setPayload(value)
            setPhase('ready')
          })
          .catch((error) => {
            if (!active || error?.name === 'AbortError') return
            setFailure(error?.message ? String(error.message) : String(error))
            setPhase('error')
          })
        return () => {
          active = false
          controller.abort()
        }
      }, [sessionId, reload])

      // A different Session starts from the whole list, so a filter cannot hide
      // every new row.
      React.useEffect(() => {
        setFilter('all')
        setFilterOpen(false)
      }, [sessionId])

      // The dropdown closes on any outside press and on Escape; opening it moves
      // focus to the selected option so the menu is usable without a pointer.
      React.useEffect(() => {
        if (!filterOpen) return undefined
        const onPointerDown = (event) => {
          const wrap = filterWrapRef.current
          if (wrap !== null && event.target instanceof Node && wrap.contains(event.target)) return
          setFilterOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          setFilterOpen(false)
          const trigger = filterWrapRef.current?.querySelector('.dsa-filter-trigger')
          if (trigger instanceof HTMLElement) trigger.focus()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        const selected = filterMenuRef.current?.querySelector('[aria-checked="true"]')
        if (selected instanceof HTMLElement) selected.focus()
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [filterOpen])

      /**
       * Copy one artifact's LAN link and acknowledge briefly on its row.
       * @param {object} artifact - the row.
       * @returns {void}
       */
      function onCopy(artifact) {
        copyText(artifactUrl(artifact, 'inline', payload?.origin ?? null)).then((copied) => {
          if (!copied) return
          const key = artifactKey(artifact)
          setCopiedPath(key)
          window.setTimeout(() => {
            setCopiedPath((current) => (current === key ? null : current))
          }, 1600)
        })
      }

      /**
       * Copy one artifact's content and acknowledge briefly on its row.
       * @param {object} artifact - the row.
       * @returns {void}
       */
      function onCopyContent(artifact) {
        const key = artifactKey(artifact)
        copyArtifactContent(artifact, payload?.origin ?? null).then((copied) => {
          if (!copied) return
          setCopiedContentKey(key)
          window.setTimeout(() => {
            setCopiedContentKey((current) => (current === key ? null : current))
          }, 1600)
        })
      }

      /**
       * Open one artifact: workspace files through the right Sidebar's preview,
       * provided attachments through their inline URL (their bytes live in the
       * attachment store, not the workspace, so the native file preview cannot
       * claim them).
       * @param {object} artifact - the row.
       * @returns {void}
       */
      function onOpen(artifact) {
        if (artifact.provided === true) {
          window.open(attachmentUrl(artifact, 'inline', payload?.origin ?? null), '_blank', 'noopener,noreferrer')
          return
        }
        openArtifactPreview(sidebarRight, sessionId, artifact, payload?.origin ?? null)
      }

      // Artifacts that no longer exist cannot be opened or downloaded; the
      // Session log keeps them, but the panel shows only files that are still
      // on disk. The list route still reports the full set.
      const artifacts = (payload !== null && Array.isArray(payload.artifacts) ? payload.artifacts : [])
        .filter((artifact) => artifact.missing !== true)
      const origin = payload !== null && typeof payload.origin === 'string' ? payload.origin : null
      // "Generated" filters the session's own workspace artifacts (written or
      // delivered); provided rows are the attachments the user supplied.
      const generatedCount = artifacts.filter((artifact) => artifact.provided !== true).length
      const providedCount = artifacts.length - generatedCount
      /** @type {Record<string, number>} */
      const filterCounts = { all: artifacts.length, generated: generatedCount, provided: providedCount }
      const shownArtifacts = filter === 'all'
        ? artifacts
        : artifacts.filter((artifact) => (filter === 'provided' ? artifact.provided === true : artifact.provided !== true))
      let countText
      if (filter !== 'all') countText = t('list.countOf', { shown: shownArtifacts.length, total: artifacts.length })
      else if (artifacts.length === 1) countText = t('list.countOne')
      else countText = t('list.count', { count: artifacts.length })

      // A custom source-filter dropdown: filtering is purely client-side, so it
      // never re-reads the Session log. Counts describe the whole list; the
      // selected option's count is separate from the header's shown/total count.
      const filterMenu = filterOpen
        ? React.createElement('div', {
          className: 'dsa-filter-menu',
          role: 'menu',
          'aria-label': t('filter.label'),
          ref: filterMenuRef
        }, FILTER_OPTIONS.map((option) => React.createElement('button', {
          key: option,
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': filter === option,
          className: 'dsa-filter-option',
          'data-filter': option,
          onClick: () => {
            setFilter(option)
            setFilterOpen(false)
          }
        },
        React.createElement('span', { className: 'dsa-filter-option-label' }, t(`filter.${option}`)),
        React.createElement('span', { className: 'dsa-filter-option-count' }, filterCounts[option]),
        filter === option ? React.createElement('span', { className: 'dsa-filter-check' }, RemixGlyph(REMIX_CHECK_LINE, 14)) : null)))
        : null

      const filterTrigger = artifacts.length > 0
        ? React.createElement('div', { className: 'dsa-filter-wrap', ref: filterWrapRef },
          React.createElement('button', {
            type: 'button',
            className: 'dsa-filter-trigger',
            'aria-haspopup': 'menu',
            'aria-expanded': filterOpen,
            title: t('filter.label'),
            'aria-label': t('filter.label'),
            'data-filter': filter,
            onClick: () => setFilterOpen((value) => !value)
          },
          RemixGlyph(REMIX_FILTER_LINE, 12),
          React.createElement('span', { className: 'dsa-filter-trigger-label' }, t(`filter.${filter}`)),
          React.createElement('span', { className: 'dsa-filter-trigger-count' }, filterCounts[filter]),
          React.createElement('span', { className: 'dsa-filter-caret' }, FilterCaretGlyph(14))),
          filterMenu)
        : null

      const leading = React.createElement('div', { className: 'dsa-header-leading' },
        onBack === null
          ? null
          : React.createElement('button', {
            type: 'button',
            className: 'dsa-back',
            onClick: onBack,
            title: t('action.back'),
            'aria-label': t('action.back'),
            'data-artifacts-back': ''
          }, RemixGlyph(REMIX_ARROW_LEFT_LINE, 16)),
        React.createElement('span', { className: 'dsa-count' }, phase === 'ready' ? countText : ''))
      const header = React.createElement('header', { className: 'dsa-header' },
        leading,
        React.createElement('div', { className: 'dsa-header-tools' },
          filterTrigger,
          React.createElement('button', {
            type: 'button',
            className: 'dsa-refresh',
            onClick: () => setReload((value) => value + 1),
            disabled: phase === 'loading',
            title: t('list.refresh'),
            'aria-label': t('list.refresh'),
            'data-loading': phase === 'loading' ? 'true' : undefined
          }, RemixGlyph(REMIX_REFRESH_LINE, 14))))

      if (phase === 'error') {
        return React.createElement('div', { className: 'dsa-root', 'data-artifacts-phase': phase },
          panelStyle(),
          header,
          React.createElement('div', { className: 'dsa-empty' },
            React.createElement('div', { className: 'dsa-empty-icon' }, TrayIcon()),
            React.createElement('div', { className: 'dsa-empty-title' }, t('list.error.title')),
            React.createElement('div', { className: 'dsa-empty-hint' }, failure),
            React.createElement('button', {
              type: 'button',
              className: 'dsa-retry',
              onClick: () => setReload((value) => value + 1)
            }, t('list.retry'))))
      }

      const rows = shownArtifacts.map((artifact) => {
        const key = artifactKey(artifact)
        const provided = artifact.provided === true
        const contentKind = artifactContentKind(artifact)
        const facts = provided
          ? [t('meta.provided')]
          : [artifact.presented === true ? t('meta.presented') : t('meta.generated'), t('meta.turn', { turn: artifact.turn })]
        if (provided && typeof artifact.promptOrdinal === 'number') {
          facts.push(t('meta.prompt', { prompt: artifact.promptOrdinal }))
        }
        if (typeof artifact.size === 'number') facts.push(formatBytes(artifact.size))
        return React.createElement('li', {
          className: 'dsa-row',
          key,
          ...(provided
            ? {
                'data-artifact-provided': 'true',
                'data-artifact-attachment-id': artifact.attachmentId,
                ...typeof (artifact.mime ?? artifact.mediaType) === 'string'
                  ? { 'data-artifact-media-type': artifact.mime ?? artifact.mediaType }
                  : {},
                ...typeof artifact.bytes === 'number' ? { 'data-artifact-bytes': String(artifact.bytes) } : {},
                ...typeof artifact.width === 'number' ? { 'data-artifact-width': String(artifact.width) } : {},
                ...typeof artifact.height === 'number' ? { 'data-artifact-height': String(artifact.height) } : {}
              }
            : { 'data-artifact-path': artifact.path }),
          'data-artifact-name': artifact.name
        },
        React.createElement(ArtifactGlyph, { artifact, origin }),
        React.createElement('div', { className: 'dsa-main' },
          React.createElement('div', { className: 'dsa-name', title: provided ? artifact.name : artifact.path }, artifact.name),
          React.createElement('div', { className: 'dsa-meta' }, facts.join(' · ')),
          artifact.description ? React.createElement('div', { className: 'dsa-desc' }, artifact.description) : null),
        React.createElement('div', { className: 'dsa-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'dsa-action',
            title: t('action.open'),
            'aria-label': t('action.open'),
            onClick: () => onOpen(artifact)
          }, RemixGlyph(REMIX_BOOK_OPEN_LINE, 16)),
          React.createElement('a', {
            className: 'dsa-action',
            title: t('action.download'),
            'aria-label': t('action.download'),
            href: artifactUrl(artifact, 'attachment', origin),
            download: artifact.name
          }, RemixGlyph(REMIX_DOWNLOAD_LINE, 16)),
          contentKind === 'none' ? null : React.createElement('button', {
            type: 'button',
            className: 'dsa-action',
            title: copiedContentKey === key
              ? t('action.copied')
              : t(contentKind === 'image' ? 'action.copyImage' : 'action.copyContent'),
            'aria-label': copiedContentKey === key
              ? t('action.copied')
              : t(contentKind === 'image' ? 'action.copyImage' : 'action.copyContent'),
            onClick: () => onCopyContent(artifact),
            'data-copied': copiedContentKey === key ? 'true' : undefined
          }, RemixGlyph(copiedContentKey === key ? REMIX_CHECK_LINE : REMIX_FILE_COPY_LINE, 16)),
          React.createElement('button', {
            type: 'button',
            className: 'dsa-action',
            title: copiedPath === key ? t('action.copied') : t('action.copy'),
            'aria-label': copiedPath === key ? t('action.copied') : t('action.copy'),
            onClick: () => onCopy(artifact),
            'data-copied': copiedPath === key ? 'true' : undefined
          }, RemixGlyph(copiedPath === key ? REMIX_CHECK_LINE : REMIX_LINK, 16))))
      })

      let body
      if (phase === 'loading' && payload === null) {
        body = React.createElement('div', { className: 'dsa-loading' }, t('list.loading'))
      } else if (artifacts.length === 0) {
        body = React.createElement('div', { className: 'dsa-empty' },
          React.createElement('div', { className: 'dsa-empty-icon' }, TrayIcon()),
          React.createElement('div', { className: 'dsa-empty-title' }, t('list.empty.title')),
          React.createElement('div', { className: 'dsa-empty-hint' }, t('list.empty.hint')))
      } else if (shownArtifacts.length === 0) {
        body = React.createElement('div', { className: 'dsa-empty' },
          React.createElement('div', { className: 'dsa-empty-icon' }, TrayIcon()),
          React.createElement('div', { className: 'dsa-empty-title' }, t('list.empty.filtered')))
      } else {
        body = React.createElement('ul', { className: 'dsa-list' }, rows)
      }

      return React.createElement('div', { className: 'dsa-root', 'data-artifacts-phase': phase },
        panelStyle(),
        header,
        body,
        artifacts.length > 0 ? React.createElement('footer', { className: 'dsa-footer' }, t('footer.note')) : null)
    }
    //#endregion

    //#region feature: session artifacts — Files-header action
    /**
     * The Files-header action: a native-style tool button that swaps the Files
     * pane content for the current Session's artifacts list.
     *
     * The list is a React portal into this tab's `[data-files-content]`, so the
     * Files navigator stays mounted underneath and the pane keeps its geometry.
     * One marker attribute on `[data-files-page]` fades the navigator behind the
     * incoming view; enter/exit are CSS transitions (instant under reduced
     * motion). A second click, Back, or Esc returns to Files; a Session change,
     * pane close, or plugin unload removes the overlay and all listeners/timers.
     * @param {object} props - session-scoped slot props plus injected t/sidebarRight.
     * @returns {object} the tool button and, while open, the overlay portal.
     */
    function ArtifactsFilesAction(props) {
      const { t, sidebarRight } = props
      const slotSessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
      const [state, dispatch] = React.useReducer(filesArtifactsReduce, undefined, filesArtifactsInitialState)
      const phase = state.phase
      const open = phase === 'opening' || phase === 'open'
      const showing = phase !== 'files'
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
      const buttonRef = React.useRef(null)
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
      const viewRef = React.useRef(null)
      /** @type {import('react').MutableRefObject<{ page: HTMLElement | null, content: HTMLElement | null }>} */
      const stageRef = React.useRef({ page: null, content: null })
      const previousPhaseRef = React.useRef(phase)
      const [sessionId, setSessionId] = React.useState(slotSessionId)
      const [, setStageVersion] = React.useState(0)

      // The slot is session-scoped and normally injects `sessionId`; the DOM
      // owner is only a fallback for a shell that omits the prop.
      React.useEffect(() => {
        if (slotSessionId.length > 0) {
          setSessionId(slotSessionId)
          return
        }
        const button = buttonRef.current
        const owner = button instanceof HTMLElement ? button.closest('[data-sidebar-right-session]') : null
        setSessionId(owner instanceof HTMLElement && typeof owner.dataset.sidebarRightSession === 'string'
          ? owner.dataset.sidebarRightSession
          : '')
      }, [slotSessionId])

      // Re-resolve the portal host from this button's own Files page; the page
      // root can be re-rendered by the shell without unmounting this action.
      React.useLayoutEffect(() => {
        const button = buttonRef.current
        const page = button instanceof HTMLElement ? button.closest('[data-files-page]') : null
        const content = page instanceof HTMLElement ? page.querySelector('[data-files-content]') : null
        const nextPage = page instanceof HTMLElement ? page : null
        const nextContent = content instanceof HTMLElement ? content : null
        if (stageRef.current.page !== nextPage || stageRef.current.content !== nextContent) {
          stageRef.current = { page: nextPage, content: nextContent }
          if (showing) setStageVersion((version) => version + 1)
        }
      })

      // The slot renders after the shipped reload tool; move this action (and its
      // slot wrapper, when the shell wraps it) directly before reload so it sits
      // at the red-box position immediately left of the refresh control.
      React.useLayoutEffect(() => {
        const button = buttonRef.current
        if (!(button instanceof HTMLElement)) return undefined
        const place = () => {
          const page = button.closest('[data-files-page]')
          const reload = page instanceof HTMLElement ? page.querySelector('[data-files-reload]') : null
          if (!(reload instanceof HTMLElement) || reload.parentElement === null) return
          const unit = button.parentElement !== null && button.parentElement !== reload.parentElement && button.parentElement.children.length === 1
            ? button.parentElement
            : button
          if (unit.nextElementSibling === reload) return
          reload.parentElement.insertBefore(unit, reload)
        }
        place()
        const page = button.closest('[data-files-page]')
        if (!(page instanceof HTMLElement) || typeof MutationObserver !== 'function') return undefined
        const observer = new MutationObserver(place)
        observer.observe(page, { childList: true, subtree: true })
        return () => observer.disconnect()
      }, [])

      // Settle opening/closing on a timer; reduced motion settles on the next tick.
      React.useEffect(() => {
        if (phase !== 'opening' && phase !== 'closing') return undefined
        const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const timer = window.setTimeout(() => {
          dispatch({ type: phase === 'opening' ? 'opened' : 'closed' })
        }, filesArtifactsPhaseMs(phase, reduced))
        return () => window.clearTimeout(timer)
      }, [phase])

      // Fade the Files navigator behind the incoming view with one marker attribute.
      React.useEffect(() => {
        const page = stageRef.current.page
        if (!(page instanceof HTMLElement)) return undefined
        if (open) page.setAttribute('data-psfa-active', 'true')
        else page.removeAttribute('data-psfa-active')
        return () => { page.removeAttribute('data-psfa-active') }
      }, [phase, open])

      // A different Session invalidates the overlay and its list request.
      React.useEffect(() => {
        dispatch({ type: 'session' })
      }, [sessionId])

      // Esc returns to Files, but only when the artifacts filter menu is not the
      // current Esc target (its own handler closes the menu first).
      React.useEffect(() => {
        if (!showing) return undefined
        const onKeyDown = (event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return
          if (document.querySelector('.dsa-filter-menu') !== null) return
          event.preventDefault()
          event.stopPropagation()
          dispatch({ type: 'toggle' })
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [showing])

      // Move focus into the opened view (Back leads) and back to the header button.
      React.useEffect(() => {
        const previous = previousPhaseRef.current
        previousPhaseRef.current = phase
        if (phase === 'opening') {
          const timer = window.setTimeout(() => {
            const back = viewRef.current?.querySelector('[data-artifacts-back]')
            if (back instanceof HTMLElement) back.focus()
            else if (viewRef.current instanceof HTMLElement) viewRef.current.focus()
          }, 0)
          return () => window.clearTimeout(timer)
        }
        if (phase === 'files' && previous !== 'files') {
          const button = buttonRef.current
          if (button instanceof HTMLElement) button.focus()
        }
        return undefined
      }, [phase])

      const button = React.createElement('button', {
        ref: buttonRef,
        type: 'button',
        className: 'psfa-tool',
        'data-files-artifacts-button': '',
        'aria-label': t('panel.title'),
        title: t('panel.title'),
        'aria-pressed': open ? 'true' : 'false',
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': 'psfa-artifacts-view',
        onClick: () => dispatch({ type: 'toggle' })
      }, TrayIcon({ size: 18 }))

      const view = showing && stageRef.current.content !== null
        ? ReactDOM.createPortal(React.createElement('div', {
          ref: viewRef,
          id: 'psfa-artifacts-view',
          className: 'psfa-view',
          'data-psfa-view': 'artifacts',
          'data-psfa-state': phase,
          'data-psfa-overlay': '',
          role: 'region',
          'aria-label': t('panel.title'),
          tabIndex: -1
        }, React.createElement(ArtifactsPanel, {
          sessionId,
          t,
          sidebarRight,
          onBack: () => dispatch({ type: 'toggle' })
        })), stageRef.current.content)
        : null

      return React.createElement(React.Fragment, null,
        React.createElement('style', null, FILES_ARTIFACTS_CSS),
        button,
        view)
    }
    //#endregion

    //#region feature: workspace default presets — menu
    /** Built-in preset ids whose display names the host UI localizes itself. @type {Record<string, string>} */
    const BUILT_IN_NAME_KEYS = {
      standard: 'preset.standard',
      ptc: 'preset.ptc',
      minimal: 'preset.minimal',
      cordis: 'preset.cordis'
    }

    /**
     * Display one preset's name: the published custom name when it has one,
     * the host's built-in label for a built-in id, else the raw id.
     * @param {Function} t - namespace-bound translate.
     * @param {{ id: string, name?: string }} preset - roster row or stored id.
     * @returns {string} the display name.
     */
    function presetDisplayName(t, preset) {
      if (typeof preset.name === 'string' && preset.name.length > 0) return preset.name
      const key = BUILT_IN_NAME_KEYS[preset.id]
      return key === undefined ? preset.id : t(key)
    }

    /**
     * The menu row's glyph: a small preset badge.
     * @returns {object} the SVG element.
     */
    function WorkspacePresetIcon() {
      return React.createElement('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true
      },
      React.createElement('rect', { x: 3.5, y: 5, width: 17, height: 14, rx: 4 }),
      React.createElement('path', { d: 'M8 10h8' }),
      React.createElement('path', { d: 'M8 14h5' }))
    }

    /**
     * Read the Agent preset roster for the menu.
     * @param {object} ctx - client root context.
     * @returns {Promise<{ ok: true, presets: object[] } | { ok: false }>} the roster or a failure.
     */
    async function readPresetRoster(ctx) {
      try {
        const result = await ctx.remote.agentPresets.list()
        if (result.ok === true) {
          const presets = result.value !== null && typeof result.value === 'object' && Array.isArray(result.value.presets)
            ? result.value.presets
            : []
          return { ok: true, presets }
        }
        if (result.error !== undefined && result.error !== null && result.error.code === 'gateway/invocation-unavailable') {
          return { ok: true, presets: [] }
        }
        return { ok: false }
      } catch {
        return { ok: false }
      }
    }

    /**
     * Read one Workspace's stored default preset.
     * @param {string} workspaceId - Workspace identity.
     * @param {AbortSignal} [signal] - menu preparation cancellation.
     * @returns {Promise<string | null>} the stored preset id, or null for none.
     */
    async function readWorkspacePreset(workspaceId, signal) {
      const response = await fetch(`${appUrl(PRESET_GET_ROUTE)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        signal,
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const value = await response.json()
      return value !== null && typeof value === 'object' && typeof value.preset === 'string' ? value.preset : null
    }

    /**
     * Store or clear one Workspace's default preset.
     * @param {string} workspaceId - Workspace identity.
     * @param {string | null} preset - preset id, or null for no override.
     * @returns {Promise<void>} resolves after the Host persisted the value.
     */
    async function writeWorkspacePreset(workspaceId, preset) {
      const response = await fetch(appUrl(PRESET_SET_ROUTE), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, preset })
      })
      if (response.ok) return
      let message = `HTTP ${response.status}`
      try {
        const body = await response.json()
        if (body !== null && typeof body === 'object' && typeof body.message === 'string') message = body.message
      } catch {
        // Keep the status text.
      }
      throw new Error(message)
    }

    /**
     * Save a Workspace default and acknowledge it on success; a rejection
     * reaches the shared menu toast through the action's failureLabel.
     * @param {object} ctx - client root context.
     * @param {Function} t - namespace-bound translate.
     * @param {string} workspaceId - Workspace identity.
     * @param {string | null} preset - preset id, or null for no override.
     * @param {string} name - display name for the success notice.
     * @returns {Promise<void>} resolves after the write settles.
     */
    async function saveWorkspacePreset(ctx, t, workspaceId, preset, name) {
      await writeWorkspacePreset(workspaceId, preset)
      ctx.contextMenus.notify(t('menu.saved', { name }), true)
    }

    /**
     * Contribute the Workspace context-menu submenu and its icon.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installWorkspacePresetMenu(ctx) {
      const t = ctx.locale.bind(PRESET_NS)
      ctx.effect(() => ctx.locale.register(PRESET_NS, { en: PRESET_EN, zh: PRESET_ZH }), 'power-suite: workspace-presets dictionaries')
      ctx.effect(() => ctx.slots.inject('contextMenu.icon', () => ctx.slots.register({
        name: 'contextMenu.icon',
        key: 'power-suite.workspacePreset'
      }, WorkspacePresetIcon)), 'power-suite: workspace-presets icon')
      ctx.effect(() => ctx.contextMenus.register({
        id: 'power-suite.workspace-default-preset',
        target: 'workspace',
        order: 150,
        resolve: async (target, signal) => {
          const workspaceId = target.workspaceId
          let roster
          let current
          try {
            [roster, current] = await Promise.all([
              readPresetRoster(ctx),
              readWorkspacePreset(workspaceId, signal)
            ])
          } catch {
            signal.throwIfAborted()
            return [{ id: 'unavailable', label: t('menu.loadFailed'), disabled: true }]
          }
          signal.throwIfAborted()
          if (roster.ok !== true) {
            return [{ id: 'unavailable', label: t('menu.loadFailed'), disabled: true }]
          }
          signal.throwIfAborted()
          const currentRow = current === null ? undefined : roster.presets.find((preset) => preset.id === current)
          const globalRow = roster.presets.find((preset) => preset.isDefault === true)
          const currentName = current === null
            ? t('menu.globalDefault')
            : currentRow === undefined ? current : presetDisplayName(t, currentRow)
          const globalName = globalRow === undefined ? t('menu.globalDefault') : presetDisplayName(t, globalRow)
          const children = [{
            id: 'global',
            label: current === null ? t('menu.followGlobalCurrent', { name: globalName }) : t('menu.followGlobal'),
            disabled: current === null,
            failureLabel: t('menu.saveFailed'),
            run: () => saveWorkspacePreset(ctx, t, workspaceId, null, t('menu.globalDefault'))
          }]
          for (const preset of roster.presets) {
            const name = presetDisplayName(t, preset)
            const label = preset.id === current
              ? t('menu.currentMark', { name })
              : preset.broken === undefined
                ? name
                : t('menu.unavailableMark', { name })
            children.push({
              id: `preset:${preset.id}`,
              label,
              disabled: preset.broken !== undefined,
              failureLabel: t('menu.saveFailed'),
              run: () => saveWorkspacePreset(ctx, t, workspaceId, preset.id, name)
            })
          }
          return [{
            id: 'workspaceDefaultPreset',
            icon: { key: 'power-suite.workspacePreset' },
            label: t('menu.current', { name: currentName }),
            children
          }]
        }
      }), 'power-suite: workspace default preset menu')
    }
    //#endregion

    //#region feature: workspace default presets — creation routing
    /**
     * Read one workspace's default preset and check that it is still usable.
     *
     * A stale or broken preference must never break New Session, so an
     * unresolvable store or a broken roster answer yields null and the caller
     * falls back to the user's global default.
     * @param {object} ctx - client root context.
     * @param {string} workspaceId - Workspace identity.
     * @returns {Promise<string | null>} a usable preset id, or null.
     */
    async function usableWorkspacePreset(ctx, workspaceId) {
      let preset
      try {
        preset = await readWorkspacePreset(workspaceId)
      } catch {
        return null
      }
      if (preset === null) return null
      const roster = await readPresetRoster(ctx)
      if (roster.ok !== true) return null
      const row = roster.presets.find((entry) => entry.id === preset)
      if (row === undefined || row.broken !== undefined) return null
      return preset
    }

    /**
     * Return options that name the Workspace default preset.
     * @param {object | undefined} options - caller-supplied options.
     * @param {string | null} preset - the Workspace default.
     * @returns {object | undefined} options carrying an explicit preset.
     */
    function withWorkspacePreset(options, preset) {
      if (preset === null) return options
      if (options !== null && typeof options === 'object' && options.agentPreset !== undefined) return options
      return { ...(options ?? {}), agentPreset: preset }
    }

    /**
     * Route new-Session flows through the Workspace default.
     *
     * The sidebar's New Session calls `ctx.uiWorkspace.openWorkspace` without
     * naming a preset, and the Host's reuse path then resets an existing blank
     * to the global default. Naming the preset on the request keeps that reuse
     * under the Workspace choice and creates new Sessions composed under it.
     * Explicit requests (Creator mode and other flows) already carry
     * `agentPreset` and pass through untouched.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installWorkspacePresetRouting(ctx) {
      const ui = ctx.uiWorkspace
      if (ui === null || typeof ui !== 'object') return
      if (typeof ui.openWorkspace !== 'function' || typeof ui.connectWorkspace !== 'function') return
      const marker = { patched: true }
      if (ui.__powerSuitePresetRouting !== undefined) return
      const originalOpen = ui.openWorkspace
      const originalConnect = ui.connectWorkspace
      async function openWorkspaceWithPreset(workspaceId, beforeOpen, options) {
        const preset = await usableWorkspacePreset(ctx, workspaceId)
        return originalOpen.call(ui, workspaceId, beforeOpen, withWorkspacePreset(options, preset))
      }
      async function connectWorkspaceWithPreset(workspaceId, options) {
        const preset = await usableWorkspacePreset(ctx, workspaceId)
        return originalConnect.call(ui, workspaceId, withWorkspacePreset(options, preset))
      }
      ui.openWorkspace = openWorkspaceWithPreset
      ui.connectWorkspace = connectWorkspaceWithPreset
      ui.__powerSuitePresetRouting = marker
      ctx.effect(() => () => {
        if (ui.__powerSuitePresetRouting !== marker) return
        delete ui.__powerSuitePresetRouting
        if (ui.openWorkspace === openWorkspaceWithPreset) ui.openWorkspace = originalOpen
        if (ui.connectWorkspace === connectWorkspaceWithPreset) ui.connectWorkspace = originalConnect
      }, 'power-suite: workspace-presets routing cleanup')
    }
    //#endregion

    //#region feature: prompt history
    /** Seat identity of the composer overlay registration. */
    const PROMPT_HISTORY_SEAT = 'power-suite.prompt-history'

    /** Host route returning one Session's complete sent-prompt history. */
    const PROMPT_HISTORY_ROUTE = browserRoute(ROUTES.promptHistoryList)

    /**
     * Whether a composer menu or listbox owns arrow keys right now.
     * @returns {boolean} whether Up/Down belong to an open popup.
     */
    function arrowMenuOpen() {
      return document.querySelector('[data-trigger-menu], [role="listbox"], [role="menu"]') !== null
    }

    /**
     * Read one Session's prompt history entries from the Host.
     * @param {string} sessionId - Session identity.
     * @returns {Promise<Array<{ seq: number, text: string, at?: number }>>} prompts oldest first; empty on failure.
     */
    async function readPromptHistoryEntries(sessionId) {
      try {
        const response = await fetch(`${appUrl(PROMPT_HISTORY_ROUTE)}?sessionId=${encodeURIComponent(sessionId)}`, {
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
        if (!response.ok) return []
        const value = await response.json()
        if (value === null || typeof value !== 'object' || !Array.isArray(value.prompts)) return []
        const prompts = []
        for (const entry of value.prompts) {
          if (entry === null || typeof entry !== 'object' || typeof entry.text !== 'string' || entry.text.length === 0) continue
          const prompt = { seq: typeof entry.seq === 'number' ? entry.seq : 0, text: entry.text }
          // The Host may report the prompt's epoch-ms `at`; older Hosts omit it,
          // in which case the preview simply hides every timestamp surface.
          if (typeof entry.at === 'number' && Number.isFinite(entry.at)) prompt.at = entry.at
          prompts.push(prompt)
        }
        return prompts
      } catch {
        return []
      }
    }

    /**
     * Read one Session's prompt history from the Host.
     * @param {string} sessionId - Session identity.
     * @returns {Promise<string[]>} prompt texts oldest first; empty on failure.
     */
    async function readPromptHistory(sessionId) {
      const prompts = await readPromptHistoryEntries(sessionId)
      return prompts.map((prompt) => prompt.text)
    }

    /**
     * Invisible composer seat that owns prompt-history key handling.
     *
     * It renders nothing. Its effect watches the focused Lexical composer and
     * turns the primary-modifier Up/Down into prompt-history switching. Plain
     * arrows keep their original caret behavior; a recalled multi-line prompt
     * is skipped as one history entry instead of moving the caret inside it.
     * Any edit or submit leaves browsing. The list comes from the Host, not
     * from the loaded chat window, so earlier pages are recallable too.
     * @param {object} props - standard session slot props.
     * @returns {null} no DOM.
     */
    function PromptHistorySeat(props) {
      const { sessionId, useInput, inputActions } = props
      const draft = useInput((state) => state.draft)
      const phase = useInput((state) => state.phase)
      const browsing = React.useRef({ index: null, saved: '', recalled: null })
      const history = React.useRef({ prompts: [], ready: false, loading: null, sessionId: null, generation: 0 })
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
      const anchor = React.useRef(null)
      const latest = React.useRef({ draft, phase, sessionId })
      latest.current.draft = draft
      latest.current.phase = phase
      latest.current.sessionId = sessionId

      const load = React.useCallback(() => {
        const target = sessionId
        const state = history.current
        if (state.sessionId !== target) return Promise.resolve(state.prompts)
        if (state.loading !== null) return state.loading
        const generation = state.generation
        const task = readPromptHistory(target).then((prompts) => {
          // A stale response from a previous Session must never write into the
          // new Session's cache, even if it resolves after the switch.
          const current = history.current
          if (current.generation !== generation || current.sessionId !== target) return current.prompts
          current.loading = null
          if (prompts.length > 0 || !current.ready) {
            current.prompts = prompts
            current.ready = true
          }
          return current.prompts
        }, () => {
          const current = history.current
          if (current.generation !== generation || current.sessionId !== target) return current.prompts
          current.loading = null
          return current.prompts
        })
        state.loading = task
        return task
      }, [sessionId])

      React.useEffect(() => {
        const generation = history.current.generation + 1
        history.current = { prompts: [], ready: false, loading: null, sessionId, generation }
        browsing.current = { index: null, saved: '', recalled: null }
        load()
        return () => {
          // Invalidate any response that arrives after this Session unmounts.
          history.current.generation += 1
        }
      }, [sessionId, load])

      React.useEffect(() => {
        browsing.current = { index: null, saved: '', recalled: null }
      }, [sessionId])

      React.useEffect(() => {
        if (browsing.current.index === null) return
        if (draft !== browsing.current.recalled) {
          browsing.current = { index: null, saved: '', recalled: null }
        }
      }, [draft])

      const previousPhase = React.useRef(phase)
      React.useEffect(() => {
        const before = previousPhase.current
        previousPhase.current = phase
        if (phase !== 'plain') {
          browsing.current = { index: null, saved: '', recalled: null }
          return
        }
        if (before !== 'plain') load()
      }, [phase, load])

      React.useEffect(() => {
        /**
         * Commit one prompt (or the saved draft) into the editor.
         * @param {string} text - draft text to place.
         * @returns {void}
         */
        const recall = (text) => {
          browsing.current.recalled = text
          inputActions.setDraft(text)
        }
        /**
         * Start browsing from the current draft, whatever it holds.
         * @param {readonly string[]} prompts - history oldest first.
         * @returns {void}
         */
        const beginBrowsing = (prompts) => {
          if (browsing.current.index !== null) return
          if (prompts.length === 0) return
          browsing.current.saved = latest.current.draft
          browsing.current.index = prompts.length - 1
          recall(prompts[browsing.current.index])
        }
        /**
         * Handle one keydown captured before Lexical moves the caret.
         * @param {KeyboardEvent} event - the composer keydown.
         * @returns {void}
         */
        const onKeyDown = (event) => {
          if (event.defaultPrevented || event.isComposing) return
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          if (!matchesHistoryModifier(event, currentSettings().promptHistoryModifier)) return
          const target = event.target
          if (target === null || typeof target.closest !== 'function') return
          const editor = target.closest('[data-lexical-editor="true"]')
          if (editor === null) return
          const region = editor.closest('[data-conversation-region="composer"]')
          if (region === null) return
          const own = anchor.current === null ? null : anchor.current.closest('[data-conversation-region="composer"]')
          if (own !== null && own !== region) return
          const occurrence = editor.closest('[data-conversation-session]')
          const currentSession = latest.current.sessionId
          if (occurrence !== null && currentSession !== undefined && occurrence.getAttribute('data-conversation-session') !== currentSession) return
          if (arrowMenuOpen()) return
          const state = latest.current
          const list = history.current.prompts
          const browse = browsing.current
          if (browse.index !== null && (browse.index >= list.length || list.length === 0)) {
            browsing.current = { index: null, saved: '', recalled: null }
            return
          }
          if (event.key === 'ArrowUp') {
            if (browse.index !== null) {
              if (browse.index > 0) {
                browse.index -= 1
                recall(list[browse.index])
              }
              event.preventDefault()
              event.stopPropagation()
              return
            }
            event.preventDefault()
            event.stopPropagation()
            if (history.current.ready) {
              beginBrowsing(history.current.prompts)
              return
            }
            load().then(beginBrowsing)
            return
          }
          if (browse.index === null) return
          if (browse.index < list.length - 1) {
            browse.index += 1
            recall(list[browse.index])
          } else {
            const saved = browse.saved
            browsing.current = { index: null, saved: '', recalled: null }
            recall(saved)
          }
          event.preventDefault()
          event.stopPropagation()
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [inputActions, load])

      // A zero-size anchor keeps each seat bound to the composer occurrence it
      // rendered in, so a second mounted composer of the same Session never
      // handles the same key twice.
      return React.createElement('span', {
        ref: anchor,
        style: { display: 'none' },
        'aria-hidden': true
      })
    }

    /**
     * Contribute the invisible prompt-history composer seat.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installPromptHistory(ctx) {
      ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: PROMPT_HISTORY_SEAT,
        order: 40
      }, PromptHistorySeat)), 'power-suite: prompt history seat')
    }
    //#endregion

    //#region feature: settings — copy and shared state
    /** Copy namespace for the Plugins-page configuration section. */
    const SETTINGS_NS = 'powerSuiteSettings'

    /** Host route serving and storing the suite's preference document. */
    const SETTINGS_ROUTE = browserRoute(ROUTES.settings)

    const SETTINGS_EN = {
      'history.group': 'Prompt history',
      'history.groupHint': 'Hold the chosen modifier and press ↑ or ↓ in the composer to switch between prompts already sent in this session. Plain arrows keep their normal editing behavior, including inside a recalled multi-line prompt. Primary is ⌘ on macOS and Ctrl on Windows and Linux; Alt is ⌥ on macOS and Alt on Windows and Linux.',
      'history.label': 'Shortcut modifier',
      'history.current': 'Current shortcut: {shortcut}',
      'modifier.primary': '⌘ / Ctrl',
      'modifier.alt': '⌥ / Alt',
      'modifier.ctrl': '⌃ / Ctrl',
      'modifier.shift': '⇧ / Shift',
      'modifier.off': 'Off',
      'shortcut.primary.mac': '⌘ + ↑ / ↓',
      'shortcut.primary.other': 'Ctrl + ↑ / ↓',
      'shortcut.alt.mac': '⌥ + ↑ / ↓',
      'shortcut.alt.other': 'Alt + ↑ / ↓',
      'shortcut.ctrl': 'Ctrl + ↑ / ↓',
      'shortcut.shift.mac': '⇧ + ↑ / ↓',
      'shortcut.shift.other': 'Shift + ↑ / ↓',
      'shortcut.off': 'Off',
      'dynamic.group': 'Active & recent',
      'dynamic.groupHint': 'Choose how long a finished Session stays in the Running & recent card, and how long a project stays in Active Projects after its last activity. Running Sessions are always listed and count as active.',
      'recent.label': 'Finished Session retention',
      'recent.current': 'Currently {value}. Finished Sessions leave the card after this window.',
      'recent.60': '1 hour',
      'recent.120': '2 hours',
      'recent.360': '6 hours',
      'recent.720': '12 hours',
      'recent.1440': '24 hours',
      'active.label': 'Active project retention',
      'active.current': 'Currently {value}. After this window the project moves to Inactive Projects.',
      'active.1': '1 day',
      'active.3': '3 days',
      'active.7': '7 days',
      'active.14': '14 days',
      'active.30': '30 days',
      'settings.loading': 'Loading settings…',
      'settings.unavailable': 'Settings are unavailable. The default shortcut stays active.',
      'settings.error': 'Could not save the setting. Try again.'
    }
    const SETTINGS_ZH = {
      'history.group': '提示历史',
      'history.groupHint': '在输入框里按住所选修饰键再按 ↑ 或 ↓，即可在本次会话已发送的提示之间切换。普通方向键保持原来的编辑行为，包括在回填的多行提示内部移动。Primary 在 macOS 上是 ⌘、在 Windows / Linux 上是 Ctrl；Alt 在 macOS 上是 ⌥、其他平台是 Alt。',
      'history.label': '快捷键修饰键',
      'history.current': '当前快捷键：{shortcut}',
      'modifier.primary': '⌘ / Ctrl',
      'modifier.alt': '⌥ / Alt',
      'modifier.ctrl': '⌃ / Ctrl',
      'modifier.shift': '⇧ / Shift',
      'modifier.off': '关闭',
      'shortcut.primary.mac': '⌘ + ↑ / ↓',
      'shortcut.primary.other': 'Ctrl + ↑ / ↓',
      'shortcut.alt.mac': '⌥ + ↑ / ↓',
      'shortcut.alt.other': 'Alt + ↑ / ↓',
      'shortcut.ctrl': 'Ctrl + ↑ / ↓',
      'shortcut.shift.mac': '⇧ + ↑ / ↓',
      'shortcut.shift.other': 'Shift + ↑ / ↓',
      'shortcut.off': '已关闭',
      'dynamic.group': '活跃与最近',
      'dynamic.groupHint': '设置完成会话留在「进行中与最近活跃」卡片里的时长，以及项目最后一次活动后保留在活跃项目分组里的时长。进行中的会话始终显示并计为活跃。',
      'recent.label': '完成会话保留时长',
      'recent.current': '当前：{value}。超过后完成的会话从卡片移除。',
      'recent.60': '1 小时',
      'recent.120': '2 小时',
      'recent.360': '6 小时',
      'recent.720': '12 小时',
      'recent.1440': '24 小时',
      'active.label': '活跃项目保留时长',
      'active.current': '当前：{value}。超过后项目归入非活跃项目。',
      'active.1': '1 天',
      'active.3': '3 天',
      'active.7': '7 天',
      'active.14': '14 天',
      'active.30': '30 天',
      'settings.loading': '正在读取设置…',
      'settings.unavailable': '设置暂不可用，快捷键保持默认。',
      'settings.error': '保存设置失败，请重试。'
    }

    /** @typedef {import('./shared/protocol.ts').Settings} Settings */
    /** @typedef {import('./shared/protocol.ts').SettingsPatch} SettingsPatch */
    /** @typedef {'promptHistoryModifier' | 'recentSessionMinutes' | 'activeProjectDays'} SettingsField */
    /** @typedef {{ status: 'loading' | 'ready' | 'error', value: Settings }} SettingsSnapshot */

    /**
     * Host-backed settings shared by the page and the composer key handler.
     * @type {{ snapshot: SettingsSnapshot, listeners: Set<Function>, loading: Promise<void> | null }}
     */
    const settingsStore = {
      snapshot: { status: 'loading', value: { ...DEFAULT_SETTINGS } },
      listeners: new Set(),
      loading: null
    }

    /**
     * Read the current shared settings snapshot.
     * @returns {SettingsSnapshot} the snapshot.
     */
    function settingsSnapshot() {
      return settingsStore.snapshot
    }

    /**
     * Subscribe to settings changes.
     * @param {() => void} listener - change callback.
     * @returns {() => void} unsubscribe.
     */
    function subscribeSettings(listener) {
      settingsStore.listeners.add(listener)
      return () => {
        settingsStore.listeners.delete(listener)
      }
    }

    /**
     * Publish one new settings snapshot.
     * @param {SettingsSnapshot} snapshot - next snapshot.
     * @returns {void}
     */
    function publishSettings(snapshot) {
      settingsStore.snapshot = snapshot
      for (const listener of [...settingsStore.listeners]) {
        try {
          listener()
        } catch {
          // A failing listener must not block the others.
        }
      }
    }

    /**
     * Load the Host settings once per page.
     * @returns {Promise<void>} resolves after the snapshot updates.
     */
    async function loadSettings() {
      if (settingsStore.loading !== null) return settingsStore.loading
      const task = (async () => {
        try {
          const response = await fetch(appUrl(SETTINGS_ROUTE), {
            credentials: 'same-origin',
            headers: { accept: 'application/json' }
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          publishSettings({ status: 'ready', value: mergeSettingsPayload(payload) })
        } catch {
          publishSettings({ status: 'error', value: { ...settingsStore.snapshot.value } })
        } finally {
          settingsStore.loading = null
        }
      })()
      settingsStore.loading = task
      return task
    }

    /**
     * Save one settings patch through the Host and publish the result.
     * @param {object} patch - recognized fields to write.
     * @returns {Promise<boolean>} whether the Host accepted the write.
     */
    async function saveSettings(patch) {
      try {
        const response = await fetch(appUrl(SETTINGS_ROUTE), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch)
        })
        if (!response.ok) return false
        const payload = await response.json()
        publishSettings({ status: 'ready', value: mergeSettingsPayload(payload) })
        return true
      } catch {
        return false
      }
    }

    /**
     * Read the settings the features currently use, without subscribing.
     * @returns {Settings} current settings.
     */
    function currentSettings() {
      return settingsStore.snapshot.value
    }

    /**
     * Whether this browser runs on Apple hardware, where the primary shortcut
     * modifier is Command instead of Control.
     * @returns {boolean} whether the platform primary modifier is Command.
     */
    function isApplePlatform() {
      if (typeof navigator !== 'object' || navigator === null) return false
      const platform = typeof navigator.userAgentData === 'object' && navigator.userAgentData !== null
        ? String(navigator.userAgentData.platform ?? '')
        : ''
      if (/mac|iphone|ipad|ipod/i.test(platform)) return true
      const legacy = String(navigator.platform ?? '')
      if (/mac|iphone|ipad|ipod/i.test(legacy)) return true
      return /Mac OS X|iPhone|iPad|iPod/.test(String(navigator.userAgent ?? ''))
    }

    /**
     * Whether a keydown carries exactly the configured history modifier.
     * @param {KeyboardEvent} event - the keydown.
     * @param {string} mode - configured modifier mode.
     * @returns {boolean} whether the event matches.
     */
    function matchesHistoryModifier(event, mode) {
      if (mode === 'shift') {
        return event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
      }
      if (event.shiftKey) return false
      switch (mode) {
        case 'primary':
          return isApplePlatform()
            ? event.metaKey && !event.ctrlKey && !event.altKey
            : event.ctrlKey && !event.metaKey && !event.altKey
        case 'ctrl':
          return event.ctrlKey && !event.metaKey && !event.altKey
        case 'alt':
          return event.altKey && !event.metaKey && !event.ctrlKey
        default:
          return false
      }
    }

    /**
     * One modifier mode's shortcut as displayed text.
     * @param {Function} t - namespace-bound translate.
     * @param {string} mode - modifier mode.
     * @returns {string} the shortcut text.
     */
    function shortcutText(t, mode) {
      switch (mode) {
        case 'primary':
          return t(isApplePlatform() ? 'shortcut.primary.mac' : 'shortcut.primary.other')
        case 'alt':
          return t(isApplePlatform() ? 'shortcut.alt.mac' : 'shortcut.alt.other')
        case 'ctrl':
          return t('shortcut.ctrl')
        case 'shift':
          return t(isApplePlatform() ? 'shortcut.shift.mac' : 'shortcut.shift.other')
        default:
          return t('shortcut.off')
      }
    }
    //#endregion

    //#region feature: settings — page
    const SETTINGS_CSS = `
.dps-settings{display:flex;flex-direction:column;gap:14px;max-width:620px;color:var(--dsw-alias-label-primary)}
.dps-settings-head{display:flex;flex-direction:column;gap:3px}
.dps-settings-title{margin:0;font-size:15px;font-weight:600;line-height:22px}
.dps-settings-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dps-settings-group{display:flex;flex-direction:column;gap:10px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l1)}
.dps-settings-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;padding:14px 16px;border-radius:16px;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-2));box-shadow:0 1px 2px rgb(0 0 0 / 3%)}
.dps-settings-copy{min-width:0}
.dps-settings-label{font-size:13px;font-weight:500;line-height:20px}
.dps-settings-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dps-settings-note[data-error=true]{color:var(--dsw-alias-state-error-primary)}
.dps-choice{display:inline-flex;align-items:center;gap:2px;flex:none;margin:0;padding:2px;border:0;border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.dps-choice-option{position:relative;display:inline-flex;align-items:center;border-radius:8px;cursor:pointer}
.dps-choice-option input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.dps-choice-text{white-space:nowrap;padding:4px 10px;border-radius:8px;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dps-choice-option[data-selected=true] .dps-choice-text{background:var(--dsw-alias-bg-layer-4,var(--dsw-alias-bg-layer-3));color:var(--dsw-alias-label-primary)}
.dps-choice-option input:disabled+.dps-choice-text{opacity:.5;cursor:default}
.dps-visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
`

    /**
     * Render the bundle's configuration on its Plugins-page detail page.
     *
     * One group holds the prompt-history shortcut modifier. The page reads the
     * shared Host-backed settings store, so a successful write updates both this
     * page and the composer key handler in the same turn.
     * @param {object} props - bundle-config owner props plus the injected locale seat.
     * @returns {object} the settings section.
     */
    function PowerSuiteSettingsPage(props) {
      const t = props.t ?? ((key) => key)
      const snapshot = React.useSyncExternalStore(subscribeSettings, settingsSnapshot, settingsSnapshot)
      const [saving, setSaving] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const ready = snapshot.status === 'ready'
      const locked = !ready || saving
      const current = snapshot.value.promptHistoryModifier
      const currentText = shortcutText(t, current)
      const currentRecent = snapshot.value.recentSessionMinutes
      const currentActive = snapshot.value.activeProjectDays
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
      const pageRef = React.useRef(null)

      // The bundle page draws the package README above this configuration
      // section. The suite's settings surface is self-contained, so the
      // document is hidden while the section is mounted and restored on unmount.
      React.useEffect(() => {
        const page = pageRef.current
        if (!(page instanceof HTMLElement)) return undefined
        const config = page.closest('[data-plugin-config]')
        const sections = config?.parentElement
        if (!(sections instanceof HTMLElement)) return undefined
        const hidden = []
        for (const child of Array.from(sections.children)) {
          if (child instanceof HTMLElement && child.hasAttribute('data-detail-document')) {
            hidden.push({ element: child, display: child.style.display })
            child.style.display = 'none'
          }
        }
        return () => {
          for (const entry of hidden) entry.element.style.display = entry.display
        }
      }, [])

      /**
       * Persist one settings patch.
       * @param {SettingsPatch} patch - recognized fields to write.
       * @param {SettingsField} field - field the patch changes.
       * @returns {void}
       */
      function choosePatch(patch, field) {
        if (locked || patch[field] === snapshot.value[field]) return
        setSaving(true)
        setFailed(false)
        saveSettings(patch).then((accepted) => {
          setSaving(false)
          if (!accepted) setFailed(true)
        })
      }

      let note = null
      let noteIsError = false
      if (failed) {
        note = t('settings.error')
        noteIsError = true
      } else if (snapshot.status === 'error') {
        note = t('settings.unavailable')
      }

      const modifierOptions = PROMPT_HISTORY_MODIFIERS.map((mode) => React.createElement('label', {
        key: mode,
        className: 'dps-choice-option psf-rainbow-focus',
        'data-selected': mode === current ? 'true' : undefined
      },
      React.createElement('input', {
        type: 'radio',
        name: 'dsh-power-suite-history-modifier',
        value: mode,
        checked: mode === current,
        disabled: locked,
        onChange: () => choosePatch({ promptHistoryModifier: mode }, 'promptHistoryModifier')
      }),
      React.createElement('span', { className: 'dps-choice-text' }, t(`modifier.${mode}`))))

      const recentOptions = RECENT_SESSION_MINUTES.map((minutes) => React.createElement('label', {
        key: minutes,
        className: 'dps-choice-option psf-rainbow-focus',
        'data-selected': minutes === currentRecent ? 'true' : undefined
      },
      React.createElement('input', {
        type: 'radio',
        name: 'dsh-power-suite-recent-session-window',
        value: String(minutes),
        checked: minutes === currentRecent,
        disabled: locked,
        onChange: () => choosePatch({ recentSessionMinutes: minutes }, 'recentSessionMinutes')
      }),
      React.createElement('span', { className: 'dps-choice-text' }, t(`recent.${minutes}`))))

      const activeOptions = ACTIVE_PROJECT_DAYS.map((days) => React.createElement('label', {
        key: days,
        className: 'dps-choice-option psf-rainbow-focus',
        'data-selected': days === currentActive ? 'true' : undefined
      },
      React.createElement('input', {
        type: 'radio',
        name: 'dsh-power-suite-active-project-window',
        value: String(days),
        checked: days === currentActive,
        disabled: locked,
        onChange: () => choosePatch({ activeProjectDays: days }, 'activeProjectDays')
      }),
      React.createElement('span', { className: 'dps-choice-text' }, t(`active.${days}`))))

      return React.createElement('section', { className: 'dps-settings', ref: pageRef },
        React.createElement('style', null, SETTINGS_CSS),
        React.createElement('div', { className: 'dps-settings-head' },
          React.createElement('h3', { className: 'dps-settings-title' }, t('history.group')),
          React.createElement('p', { className: 'dps-settings-hint' }, t('history.groupHint'))),
        React.createElement('div', { className: 'dps-settings-row' },
          React.createElement('div', { className: 'dps-settings-copy' },
            React.createElement('div', { className: 'dps-settings-label' }, t('history.label')),
            React.createElement('p', { className: 'dps-settings-hint' }, t('history.current', { shortcut: currentText }))),
          React.createElement('fieldset', { className: 'dps-choice', disabled: locked },
            React.createElement('legend', { className: 'dps-visually-hidden' }, t('history.label')),
            modifierOptions)),
        React.createElement('div', { className: 'dps-settings-group' },
          React.createElement('div', { className: 'dps-settings-head' },
            React.createElement('h3', { className: 'dps-settings-title' }, t('dynamic.group')),
            React.createElement('p', { className: 'dps-settings-hint' }, t('dynamic.groupHint'))),
          React.createElement('div', { className: 'dps-settings-row' },
            React.createElement('div', { className: 'dps-settings-copy' },
              React.createElement('div', { className: 'dps-settings-label' }, t('recent.label')),
              React.createElement('p', { className: 'dps-settings-hint' }, t('recent.current', { value: t(`recent.${currentRecent}`) }))),
            React.createElement('fieldset', { className: 'dps-choice', disabled: locked },
              React.createElement('legend', { className: 'dps-visually-hidden' }, t('recent.label')),
              recentOptions)),
          React.createElement('div', { className: 'dps-settings-row' },
            React.createElement('div', { className: 'dps-settings-copy' },
              React.createElement('div', { className: 'dps-settings-label' }, t('active.label')),
              React.createElement('p', { className: 'dps-settings-hint' }, t('active.current', { value: t(`active.${currentActive}`) }))),
            React.createElement('fieldset', { className: 'dps-choice', disabled: locked },
              React.createElement('legend', { className: 'dps-visually-hidden' }, t('active.label')),
              activeOptions))),
        note === null ? null : React.createElement('p', {
          className: 'dps-settings-note',
          role: 'status',
          'data-error': noteIsError ? 'true' : undefined
        }, note))
    }

    /**
     * Register the Plugins-page configuration section and its dictionaries.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installSettingsPage(ctx) {
      const t = ctx.locale.bind(SETTINGS_NS)
      ctx.effect(() => ctx.locale.register(SETTINGS_NS, { en: SETTINGS_EN, zh: SETTINGS_ZH }), 'power-suite: settings dictionaries')
      ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
        inject: () => ({ t })
      }, PowerSuiteSettingsPage)), 'power-suite: settings page')
      loadSettings()
    }
    //#endregion

    //#region feature: interrupted sessions — copy, icons, shared state
    /** Copy namespace for the interrupted-task affordances. */
    const INTERRUPTED_NS = 'powerSuiteInterrupted'

    /** Host route reporting one Session's last-turn state. */
    const INTERRUPTED_ROUTE = browserRoute(ROUTES.interrupted)
    /** Host SSE route broadcasting turn-boundary interruptions. */
    const INTERRUPTED_EVENTS_ROUTE = browserRoute(ROUTES.interruptedEvents)
    /** Host route resuming one Session through a non-human context message. */
    const CONTINUE_ROUTE = browserRoute(ROUTES.continue)

    const INTERRUPTED_EN = {
      'badge.aria': 'Task did not finish',
      'badge.title': 'The last task did not finish. Hover this session to continue it.',
      'badge.title.subagent': 'A delegated subagent task did not finish. Hover this session to continue it.',
      'continue.aria': 'Continue the unfinished task',
      'continue.prompt': 'Continue the unfinished task.',
      'continue.summary': 'Continue unfinished task',
      'continue.failed': 'Could not continue the task. Try again.'
    }
    const INTERRUPTED_ZH = {
      'badge.aria': '任务未完成',
      'badge.title': '上一个任务未完成，悬停此会话可继续。',
      'badge.title.subagent': '委派的子任务未完成，悬停此会话可继续。',
      'continue.aria': '继续未完成的任务',
      'continue.prompt': '继续完成上一个任务。',
      'continue.summary': '继续未完成的任务',
      'continue.failed': '继续任务失败，请重试。'
    }

    // Remix Icon path data (Apache-2.0, https://remixicon.com), inlined so the
    // plugin renders offline without a package or a sprite dependency.
    const REMIX_WARNING_FILL = 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11 15V17H13V15H11ZM11 7V13H13V7H11Z'
    const REMIX_PLAY_FILL = 'M19.376 12.4161L8.77735 19.4818C8.54759 19.635 8.23715 19.5729 8.08397 19.3432C8.02922 19.261 8 19.1645 8 19.0658V4.93433C8 4.65818 8.22386 4.43433 8.5 4.43433C8.59871 4.43433 8.69522 4.46355 8.77735 4.5183L19.376 11.584C19.6057 11.7372 19.6678 12.0477 19.5146 12.2774C19.478 12.3323 19.4309 12.3795 19.376 12.4161Z'
    const REMIX_PLAY_CIRCLE_FILL = 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM10.6219 8.41459C10.5562 8.37078 10.479 8.34741 10.4 8.34741C10.1791 8.34741 10 8.52649 10 8.74741V15.2526C10 15.3316 10.0234 15.4088 10.0672 15.4745C10.1897 15.6583 10.4381 15.708 10.6219 15.5854L15.5008 12.3328C15.5447 12.3035 15.5824 12.2658 15.6117 12.2219C15.7343 12.0381 15.6846 11.7897 15.5008 11.6672L10.6219 8.41459Z'

    /**
     * Render one inline Remix icon.
     * @param {object} props - icon props.
     * @returns {object} the SVG element.
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

    /**
     * Escape one value for an attribute selector.
     * @param {string} value - raw value.
     * @returns {string} selector-safe text.
     */
    function escapeSelectorValue(value) {
      const platformCss = typeof globalThis !== 'undefined' ? globalThis.CSS : undefined
      if (typeof platformCss === 'object' && platformCss !== null && typeof platformCss.escape === 'function') return platformCss.escape(value)
      return String(value).replace(/["\\]/g, '\\$&')
    }

    /**
     * Browser-facing interruption state, shared by row badges, the row CTA, and
     * the composer seat. Reads run two at a time so one sidebar pass never floods
     * the Host with log reads.
     */
    const interruptedStore = {
      records: new Map(),
      listeners: new Set(),
      watchers: new Map(),
      pollTimer: null,
      version: 0,
      queue: [],
      active: 0,
      maxActive: 2,
      inflight: new Set()
    }

    /**
     * Read the shared change counter.
     * @returns {number} current version.
     */
    function interruptedVersion() {
      return interruptedStore.version
    }

    /**
     * Subscribe to interruption-state changes.
     * @param {() => void} listener - change callback.
     * @returns {() => void} unsubscribe.
     */
    function subscribeInterrupted(listener) {
      interruptedStore.listeners.add(listener)
      return () => {
        interruptedStore.listeners.delete(listener)
      }
    }

    /**
     * Publish one store change.
     * @returns {void}
     */
    function notifyInterrupted() {
      interruptedStore.version += 1
      for (const listener of [...interruptedStore.listeners]) {
        try {
          listener()
        } catch {
          // One failing subscriber must not block the others.
        }
      }
    }

    /**
     * Write or clear one Session record.
     * @param {string} sessionId - Session identity.
     * @param {object | null} record - next record.
     * @returns {void}
     */
    function setInterruptedRecord(sessionId, record) {
      if (record === null) interruptedStore.records.delete(sessionId)
      else interruptedStore.records.set(sessionId, { ...record, at: Date.now() })
      notifyInterrupted()
    }

    /**
     * Read one cached Session record.
     * @param {string} sessionId - Session identity.
     * @returns {import('./browser/interrupted-sessions/model.ts').InterruptedRecord | null} the record, when known.
     */
    function interruptedRecord(sessionId) {
      return interruptedStore.records.get(sessionId) ?? null
    }

    /**
     * Queue one Host read unless the Session is already known or loading.
     * @param {string} sessionId - Session identity.
     * @param {{ force?: boolean, refreshHost?: boolean }} options - force bypasses the cache; refreshHost asks the Host to recompute.
     * @returns {void}
     */
    function ensureInterrupted(sessionId, options = {}) {
      const force = options.force === true
      const refreshHost = options.refreshHost === true
      const existing = interruptedStore.records.get(sessionId)
      if (existing !== undefined && !force) return
      if (existing?.status === 'loading' && !force) return
      if (interruptedStore.inflight.has(sessionId)) return
      interruptedStore.inflight.add(sessionId)
      // A forced refresh must not downgrade a known-good badge to loading:
      // keep the current record visible until the new answer replaces it.
      if (existing === undefined) {
        setInterruptedRecord(sessionId, { status: 'loading', interrupted: false })
      }
      interruptedStore.queue.push({ sessionId, force, refreshHost })
      drainInterruptedQueue()
    }

    /**
     * Run queued Host reads within the concurrency bound.
     * @returns {void}
     */
    function drainInterruptedQueue() {
      while (interruptedStore.active < interruptedStore.maxActive && interruptedStore.queue.length > 0) {
        const job = interruptedStore.queue.shift()
        interruptedStore.active += 1
        loadInterrupted(job.sessionId, job.force, job.refreshHost).finally(() => {
          interruptedStore.active -= 1
          interruptedStore.inflight.delete(job.sessionId)
          drainInterruptedQueue()
        })
      }
    }

    /**
     * Read one Session's interruption state from the Host.
     * @param {string} sessionId - Session identity.
     * @param {boolean} force - ask the Host to bypass its cache.
     * @param {boolean} refreshHost - also send `refresh=1` when forced.
     * @returns {Promise<void>} resolves after the record lands.
     */
    async function loadInterrupted(sessionId, force, refreshHost) {
      try {
        const query = `sessionId=${encodeURIComponent(sessionId)}${force && refreshHost ? '&refresh=1' : ''}`
        const response = await fetch(appUrl(`${INTERRUPTED_ROUTE}?${query}`), {
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
        if (response.status === 404) {
          setInterruptedRecord(sessionId, { status: 'missing', interrupted: false })
          return
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json()
        setInterruptedRecord(sessionId, {
          status: 'ready',
          interrupted: payload?.interrupted === true,
          turn: typeof payload?.turn === 'number' ? payload.turn : null,
          running: payload?.running === true,
          open: payload?.open === true,
          reason: typeof payload?.reason === 'string' ? payload.reason : null,
          subagent: payload?.subagent === true
        })
      } catch {
        const existing = interruptedRecord(sessionId)
        if (existing === null || existing.status !== 'ready') {
          setInterruptedRecord(sessionId, { status: 'error', interrupted: false })
        }
      }
    }

    /**
     * Locally settle a record after an action the Host has not observed yet.
     * @param {string} sessionId - Session identity.
     * @param {boolean} interrupted - next interruption flag.
     * @returns {void}
     */
    function markInterrupted(sessionId, interrupted) {
      const existing = interruptedRecord(sessionId) ?? {}
      setInterruptedRecord(sessionId, { ...existing, status: 'ready', interrupted })
    }

    /**
     * Optimistically settle the record right after a Continue request succeeds:
     * the interruption is being resumed, so the badge/CTA disappears and the row
     * is running until the Host's next answer reconciles the record.
     * @param {string} sessionId - Session identity.
     * @returns {void}
     */
    function markContinued(sessionId) {
      const existing = interruptedRecord(sessionId) ?? {}
      setInterruptedRecord(sessionId, { ...existing, status: 'ready', interrupted: false, running: true })
    }

    /**
     * Ask the Host to recompute one record.
     * @param {string} sessionId - Session identity.
     * @returns {void}
     */
    function refreshInterrupted(sessionId) {
      ensureInterrupted(sessionId, { force: true, refreshHost: false })
    }

    /**
     * Refresh every Session already known to the browser. After a reconnect the
     * previous records can all be stale, including rows that are not mounted.
     * @returns {void}
     */
    function refreshAllInterrupted() {
      const ids = new Set([...interruptedStore.watchers.keys(), ...interruptedStore.records.keys()])
      for (const sessionId of ids) {
        ensureInterrupted(sessionId, { force: true, refreshHost: false })
      }
    }

    /**
     * Start or stop the shared poll as watched Sessions come and go.
     * @returns {void}
     */
    function ensureInterruptedPolling() {
      if (interruptedStore.watchers.size === 0) {
        if (interruptedStore.pollTimer !== null) {
          window.clearInterval(interruptedStore.pollTimer)
          interruptedStore.pollTimer = null
        }
        return
      }
      if (interruptedStore.pollTimer !== null) return
      interruptedStore.pollTimer = window.setInterval(refreshAllInterrupted, 20000)
    }

    /**
     * Keep one mounted component's Session fresh while it stays mounted.
     * @param {string} sessionId - Session identity.
     * @returns {() => void} unwatch.
     */
    function watchInterrupted(sessionId) {
      interruptedStore.watchers.set(sessionId, (interruptedStore.watchers.get(sessionId) ?? 0) + 1)
      ensureInterruptedPolling()
      return () => {
        const remaining = (interruptedStore.watchers.get(sessionId) ?? 1) - 1
        if (remaining <= 0) interruptedStore.watchers.delete(sessionId)
        else interruptedStore.watchers.set(sessionId, remaining)
        ensureInterruptedPolling()
      }
    }

    /**
     * Subscribe one component to a Session's interruption record.
     * @param {string} sessionId - Session identity.
     * @param {boolean} autoFetch - whether the first mount asks the Host.
     * @returns {object | null} the record.
     */
    function useInterruptedRecord(sessionId, autoFetch = true) {
      React.useSyncExternalStore(subscribeInterrupted, interruptedVersion, interruptedVersion)
      React.useEffect(() => {
        if (!autoFetch) return undefined
        ensureInterrupted(sessionId)
        return watchInterrupted(sessionId)
      }, [sessionId, autoFetch])
      return interruptedRecord(sessionId)
    }

    /** Pending request that a freshly opened Conversation should continue. */
    const continueRequest = { pending: null }

    /** The mounted composer's continue handler, if a Conversation is open. */
    const continueRuntime = { current: null, pending: false }

    /** Services captured at install time for row actions and DOM decoration. */
    const interruptedRuntime = { uiWorkspace: null, t: null, hideContinuationRows: null, continueTimes: [] }

    /** localStorage key: when this browser sent an implicit continuation. */
    const CONTINUE_TIMES_KEY = 'dsh-power-suite.continue-times'

    /**
     * Read the recent implicit-continuation timestamps.
     * @returns {number[]} epoch milliseconds, pruned to the last ten minutes.
     */
    function loadContinueTimes() {
      try {
        const parsed = JSON.parse(localStorage.getItem(CONTINUE_TIMES_KEY) ?? '[]')
        if (!Array.isArray(parsed)) return []
        const cutoff = Date.now() - 10 * 60 * 1000
        return parsed.filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= cutoff)
      } catch {
        return []
      }
    }

    /**
     * Remember one implicit continuation so its turn-trigger row can be hidden
     * after the React tree renders it (and after a page reload).
     * @param {number} at - epoch milliseconds when the request was sent.
     * @returns {void}
     */
    function rememberContinueTime(at) {
      const cutoff = Date.now() - 10 * 60 * 1000
      interruptedRuntime.continueTimes = [...interruptedRuntime.continueTimes, at]
        .filter((value) => value >= cutoff)
      try {
        localStorage.setItem(CONTINUE_TIMES_KEY, JSON.stringify(interruptedRuntime.continueTimes))
      } catch {
        // Storage may be unavailable; the in-memory value still applies.
      }
    }

    /**
     * Start continuing one Session from a row action.
     *
     * When that Session is not already the open conversation this opens it
     * first; the renderless composer seat (InterruptedContinueSeat) observes the
     * pending request and sends the continuation once the Session is open and
     * idle. The row CTA never sends into a different Session.
     * @param {string} sessionId - Session identity.
     * @returns {void}
     */
    function requestContinue(sessionId) {
      const runtime = continueRuntime.current
      if (runtime !== null && runtime.sessionId === sessionId) {
        runtime.run()
        return
      }
      continueRequest.pending = { sessionId, at: Date.now() }
      const ui = interruptedRuntime.uiWorkspace
      if (ui !== null && typeof ui.openSession === 'function') ui.openSession(sessionId)
    }
    //#endregion

    //#region feature: interrupted sessions — styles
    const PLAY_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${REMIX_PLAY_FILL}"/></svg>`)}")`

    const INTERRUPTED_CSS = `
/* Interrupted native Session rows keep the shell's own hover surface and title;
   hovering only reveals the inline Continue triangle in the leading status cell.
   The old opaque ::before mask and the first/last-child z-index lift are gone: the
   mask erased the title/time on hover, and its positional "first child" selector
   caught the injected rainbow atmosphere wrapper (current Session row) and turned
   it from an absolute background layer into an in-flow pill that pushed the badge
   and collapsed the title (user report). The native leading cell is a fixed 16 px
   status column; it widens for this row so the 22 px triangle has room and the
   title slides right instead of being clipped. */
[data-row-key^="session:"][data-power-suite-interrupted]{position:relative}
[data-row-key^="session:"][data-power-suite-interrupted]>span:has(.dps-row-interrupted){width:auto;justify-content:flex-start}
.dps-row-interrupted{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-state-warn-primary);pointer-events:none;flex:none}
/* The leading cell's width snaps rather than animates: the shell's title
   marquee measures scrollWidth - clientWidth once on pointerenter, so an
   animated cell would leave the marquee 22 px short (and a title whose rest
   overflow is just above the shell's 8 px threshold would not marquee at all).
   Only the triangle's opacity animates. */
.dps-row-continue-slot{flex:none;display:inline-flex;align-items:center;justify-content:center;width:0;height:22px;margin:0;overflow:hidden;opacity:0;pointer-events:none;transition:opacity 120ms var(--ds-ease-in-out,ease)}
[data-row-key^="session:"][data-power-suite-interrupted]:hover .dps-row-continue-slot,
html[data-input-modality='keyboard'] [data-row-key^="session:"][data-power-suite-interrupted]:focus-within .dps-row-continue-slot{width:22px;opacity:1;pointer-events:auto}
@media (prefers-reduced-motion: reduce){
  [data-row-key^="session:"][data-power-suite-interrupted] .dps-row-continue-slot,
  [data-row-key^="session:"][data-power-suite-interrupted]:hover .dps-row-continue-slot,
  [data-row-key^="session:"][data-power-suite-interrupted]:focus-within .dps-row-continue-slot{transition:none}
}
.dps-row-continue{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;flex:none;opacity:1;pointer-events:auto}
.dps-row-continue svg{display:block;flex:none}
.dps-row-continue:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);color:var(--dsw-alias-label-primary)}
.dps-row-continue:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
/* Hide only the native status dots that render directly under this cell while
   the native row still believes it is running (the decorator inserts the warning
   in their place). The idle leading seat is mounted through a display:contents
   slot wrapper shared with other plugins (e.g. the schedule clock mark and the
   liveshare fork mark), so the wrapper and everything inside it must stay
   untouched. */
[data-row-key^="session:"][data-power-suite-interrupted]>span:has(.dps-row-interrupted)>*:not(.dps-row-interrupted):not(.dps-row-continue-slot):not(span[data-slot]){display:none!important}
body:not([data-ds-dark-theme]) [data-psd-current-workspace='true'] .dps-row-interrupted,
body:not([data-ds-dark-theme]) [data-psd-current-session='true'] .dps-row-interrupted{color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 72%,var(--dsw-alias-label-primary))}
html[data-power-suite-interrupted="true"] [data-conversation-region="composer"] button[class$="_primary"]>svg{display:none!important}
html[data-power-suite-interrupted="true"] [data-conversation-region="composer"] button[class$="_primary"]::before{content:"";display:block;width:16px;height:16px;background-color:currentColor;-webkit-mask:${PLAY_MASK} center/contain no-repeat;mask:${PLAY_MASK} center/contain no-repeat}
`
    //#endregion

    /**
     * Build one standalone inline Remix icon for dynamically decorated rows
     * (the same 14 px markup the React slot path renders).
     * @param {string} path - Remix icon path data.
     * @returns {SVGElement} the icon.
     */
    function interruptedDecorIcon(path) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', '14')
      svg.setAttribute('height', '14')
      svg.setAttribute('fill', 'currentColor')
      svg.setAttribute('aria-hidden', 'true')
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      shape.setAttribute('d', path)
      svg.appendChild(shape)
      return svg
    }

    /**
     * Build one standalone warning icon element for dynamically decorated rows.
     * @returns {SVGElement} the icon.
     */
    function interruptedDecorBadgeIcon() {
      return interruptedDecorIcon(REMIX_WARNING_FILL)
    }

    /**
     * Build the dynamic Continue CTA for a native row the shell still renders as
     * running.
     *
     * It mirrors the `InterruptedBadge` slot markup (`span.dps-row-continue-slot`
     * around `button.dps-row-continue`) so the existing reveal CSS applies on
     * both paths, and its click goes through the shared {@link requestContinue}
     * handshake: this decoration never sends a continuation itself.
     * @param {Function} t - interrupted-feature translate.
     * @param {string} sessionId - Session identity.
     * @returns {HTMLSpanElement} the Continue slot.
     */
    function interruptedDecorContinueSlot(t, sessionId) {
      const slot = document.createElement('span')
      slot.className = 'dps-row-continue-slot'
      slot.setAttribute('data-dynamic-continue', 'true')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dps-row-continue'
      button.title = t('continue.aria')
      button.setAttribute('aria-label', t('continue.aria'))
      button.appendChild(interruptedDecorIcon(REMIX_PLAY_FILL))
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        // Resolve the Session from the live row at click time: a native row element
        // is the shell's to reuse, so the captured id is only the fallback.
        const row = button.closest('[data-row-key^="session:"]')
        const key = row === null ? '' : row.getAttribute('data-row-key') ?? ''
        const target = key.startsWith('session:') ? key.slice('session:'.length) : ''
        requestContinue(target.length > 0 ? target : sessionId)
      })
      slot.appendChild(button)
      return slot
    }

    /**
     * Fetch interruption state for every Session row currently in the sidebar.
     * Running rows do not mount the custom leading slot, so without this walk
     * they would never get a record and the stale-spinner replacement could not
     * run after a reconnect.
     * @returns {void}
     */
    function discoverInterruptedRows() {
      for (const row of document.querySelectorAll('[data-row-key^="session:"]')) {
        const key = row.getAttribute('data-row-key')
        if (key === null) continue
        const sessionId = key.slice('session:'.length)
        if (sessionId.length === 0) continue
        if (interruptedStore.records.has(sessionId) || interruptedStore.inflight.has(sessionId)) continue
        ensureInterrupted(sessionId)
      }
    }

    /**
     * Keep native Session rows visually in sync with the Host interruption state.
     *
     * The shell only renders the custom leading slot for idle rows; a row that
     * the native client still believes is running renders its own green spinner
     * and no leading slot. This decoration places the warning badge AND its hover
     * Continue CTA in that native leading span and hides the stale spinner, so the
     * interrupted state is visible immediately after a reconnect rather than after
     * opening the Session. Both injected parts carry their own marker attributes
     * so the slot path's markup is never mistaken for this decoration.
     * @returns {void}
     */
    function syncInterruptedRows() {
      const t = interruptedRuntime.t
      if (t === null) return
      for (const [sessionId, record] of interruptedStore.records) {
        const row = document.querySelector(`[data-row-key="session:${escapeSelectorValue(sessionId)}"]`)
        if (row === null) continue
        const interrupted = interruptedIndicatorActive(record)
        if (interrupted !== true) {
          row.removeAttribute('data-power-suite-interrupted')
          for (const element of row.querySelectorAll('[data-dynamic-badge="true"], [data-dynamic-continue="true"]')) element.remove()
          continue
        }
        row.setAttribute('data-power-suite-interrupted', '')
        // The rainbow-atmosphere wrapper is injected as the row's first child; the
        // stale-spinner badge and its Continue CTA must land in the native leading
        // cell instead, never inside the atmosphere layer.
        const leading = [...row.children].find((child) => !child.hasAttribute('data-psd-atmos')) ?? null
        if (leading === null) continue
        // A row the shell renders as idle mounts the custom leading slot, which
        // owns the same badge + Continue pair. Keep that pair and drop dynamic
        // leftovers from an earlier running render (a row can move from running to
        // idle between two syncs).
        const persistent = [...row.querySelectorAll('.dps-row-interrupted')]
          .find((badge) => badge.getAttribute('data-dynamic-badge') !== 'true')
        if (persistent !== undefined) {
          for (const element of row.querySelectorAll('[data-dynamic-badge="true"], [data-dynamic-continue="true"]')) element.remove()
          continue
        }
        let badge = leading.querySelector('.dps-row-interrupted[data-dynamic-badge="true"]')
        if (badge === null) {
          badge = document.createElement('span')
          badge.className = 'dps-row-interrupted'
          badge.setAttribute('data-dynamic-badge', 'true')
          badge.setAttribute('role', 'img')
          badge.appendChild(interruptedDecorBadgeIcon())
          leading.insertBefore(badge, leading.firstChild)
        }
        for (const duplicate of [...leading.querySelectorAll('.dps-row-interrupted[data-dynamic-badge="true"]')]) {
          if (duplicate !== badge) duplicate.remove()
        }
        const badgeAria = t('badge.aria')
        if (badge.getAttribute('aria-label') !== badgeAria) badge.setAttribute('aria-label', badgeAria)
        const badgeTitle = record.subagent === true ? t('badge.title.subagent') : t('badge.title')
        if (badge.getAttribute('title') !== badgeTitle) badge.setAttribute('title', badgeTitle)
        const continueLabel = t('continue.aria')
        let slot = leading.querySelector('.dps-row-continue-slot[data-dynamic-continue="true"]')
        if (slot === null) {
          slot = interruptedDecorContinueSlot(t, sessionId)
          leading.insertBefore(slot, badge.nextSibling)
        }
        for (const duplicate of [...leading.querySelectorAll('.dps-row-continue-slot[data-dynamic-continue="true"]')]) {
          if (duplicate !== slot) duplicate.remove()
        }
        const button = slot.querySelector('.dps-row-continue')
        if (button !== null) {
          if (button.getAttribute('title') !== continueLabel) button.title = continueLabel
          if (button.getAttribute('aria-label') !== continueLabel) button.setAttribute('aria-label', continueLabel)
        }
      }
      for (const row of document.querySelectorAll('[data-row-key^="session:"][data-power-suite-interrupted]')) {
        const key = row.getAttribute('data-row-key')
        if (key === null) continue
        const sessionId = key.slice('session:'.length)
        const record = interruptedStore.records.get(sessionId)
        if (interruptedIndicatorActive(record)) continue
        row.removeAttribute('data-power-suite-interrupted')
        for (const element of row.querySelectorAll('[data-dynamic-badge="true"], [data-dynamic-continue="true"]')) element.remove()
      }
    }

    //#region feature: interrupted sessions — components
    //
    // Both seats and their installer live in
    // `src/browser/interrupted-sessions/components.ts`: the entry only binds the
    // shared store, the continue handshake boxes, the row helpers and the copy
    // dictionaries it already owns, then installs the seats in `apply`. Props,
    // DOM markers, effects, slot ids/order and copy stay unchanged; this region
    // is a wiring point.
    const { installInterruptedSessions } = createInterruptedSessionComponents({
      React,
      RemixIcon,
      remixWarningFill: REMIX_WARNING_FILL,
      remixPlayFill: REMIX_PLAY_FILL,
      requestContinue,
      useInterruptedRecord,
      escapeSelectorValue,
      appUrl,
      continueRoute: CONTINUE_ROUTE,
      rememberContinueTime,
      markContinued,
      refreshInterrupted,
      subscribeInterrupted,
      discoverInterruptedRows,
      syncInterruptedRows,
      refreshAllInterrupted,
      loadContinueTimes,
      interruptedNamespace: INTERRUPTED_NS,
      interruptedEn: INTERRUPTED_EN,
      interruptedZh: INTERRUPTED_ZH,
      interruptedCss: INTERRUPTED_CSS,
      interruptedEventsRoute: INTERRUPTED_EVENTS_ROUTE,
      interruptedStore,
      interruptedRuntime,
      continueRequest,
      continueRuntime
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
      subscribeSettings,
      settingsSnapshot,
      subscribeInterrupted,
      interruptedVersion,
      interruptedRecord,
      ensureInterrupted,
      watchInterrupted,
      refreshInterrupted,
      requestContinue,
      remixPlayFill: REMIX_PLAY_FILL,
      remixWarningFill: REMIX_WARNING_FILL,
      interruptedNamespace: INTERRUPTED_NS,
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
      readPromptHistoryEntries
    })
    //#endregion

    //#region feature: draft attachment memory
    /**
     * Draft attachment memory.
     *
     * The shell persists a Session draft's semantic text (and reference chips)
     * per Session, but browser-owned attachment objects (pasted images, dropped
     * or picked files) live only in the mounted input controller: switching to
     * another Session and back restores the words and silently drops the
     * images/attachments. This feature keeps the browser Files for each Session
     * while the page stays open and re-introduces them through the composer's
     * own file-intake path (a synthetic paste with the cached Files) when the
     * Session is shown again and the shell restored no attachments.
     *
     * It is a page-lifetime workaround, not persistence: a page reload still
     * cannot bring back a File object the browser did not keep.
     */

    /** Seat identity of the invisible session-scoped capture/restore seat. */
    const DAM_SEAT = 'power-suite.draft-attachments'

    /** Sessions whose draft attachments are remembered at once. */
    const DAM_MAX_SESSIONS = 8

    /** Files remembered for one Session. */
    const DAM_MAX_FILES = 20

    /** Session id → { files: File[], restored: boolean, seq: number }. */
    const damMemory = new Map()

    /**
     * Escape one Session id for a quoted attribute selector.
     * @param {string} value - Session identity.
     * @returns {string} selector-safe value.
     */
    function damSelectorValue(value) {
      const css = globalThis.CSS
      if (css !== undefined && css !== null && typeof css.escape === 'function') return css.escape(value)
      return String(value).replace(/["\\]/g, '\\$&')
    }

    /**
     * Remember browser Files attached to one Session's draft.
     * @param {string} sessionId - Session identity.
     * @param {readonly File[]} files - browser files from paste, drop, or picker.
     * @returns {void}
     */
    function damRemember(sessionId, files) {
      if (!Array.isArray(files) || files.length === 0) return
      let entry = damMemory.get(sessionId)
      if (entry === undefined) {
        entry = { files: [], restored: false, seq: 0 }
        damMemory.set(sessionId, entry)
      }
      for (const file of files) {
        if (!(file instanceof File)) continue
        const duplicate = entry.files.some((known) => (
          known.name === file.name && known.size === file.size && known.lastModified === file.lastModified
        ))
        if (!duplicate) entry.files.push(file)
      }
      while (entry.files.length > DAM_MAX_FILES) entry.files.shift()
      entry.restored = false
      entry.seq = Date.now()
      while (damMemory.size > DAM_MAX_SESSIONS) {
        let oldestKey
        let oldestSeq = Number.POSITIVE_INFINITY
        for (const [key, value] of damMemory) {
          if (value.seq < oldestSeq) {
            oldestSeq = value.seq
            oldestKey = key
          }
        }
        if (oldestKey === undefined) break
        damMemory.delete(oldestKey)
      }
    }

    /**
     * Drop every remembered file for one Session (draft sent or cleared).
     * @param {string} sessionId - Session identity.
     * @returns {void}
     */
    function damForget(sessionId) {
      damMemory.delete(sessionId)
    }

    /**
     * Re-introduce remembered Files through the composer's paste intake.
     * @param {string} sessionId - Session identity.
     * @param {readonly File[]} files - remembered browser files.
     * @returns {boolean} whether a paste event was dispatched.
     */
    function damInject(sessionId, files) {
      if (files.length === 0) return false
      const scoped = document.querySelector(`[data-conversation-session="${damSelectorValue(sessionId)}"]`)
      if (!(scoped instanceof HTMLElement)) return false
      const composer = scoped.querySelector('[data-conversation-region="composer"]')
      if (!(composer instanceof HTMLElement)) return false
      const editor = composer.querySelector('[data-lexical-editor="true"]')
      if (!(editor instanceof HTMLElement)) return false
      if (typeof DataTransfer !== 'function' || typeof ClipboardEvent !== 'function') return false
      let data
      try {
        data = new DataTransfer()
        for (const file of files) data.items.add(file)
      } catch {
        return false
      }
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      editor.dispatchEvent(event)
      return true
    }

    /**
     * Invisible per-Session seat that captures draft Files and puts them back
     * after a Session round-trip.
     * @param {object} props - session-scoped slot props.
     * @returns {null} no DOM.
     */
    function DraftAttachmentSeat(props) {
      const { sessionId, useInput } = props
      const attachmentIds = useInput((state) => state.attachmentIds)
      const phase = useInput((state) => state.phase)
      const previousAttachments = React.useRef(attachmentIds.length)

      // Capture every browser File the composer admits while this Session is
      // mounted, before the shell's own intake consumes it.
      React.useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
        const inComposer = (node) => (node instanceof Element ? node.closest('[data-conversation-region="composer"]') : null) !== null
        const inThisSession = (node) => {
          if (!(node instanceof Element)) return false
          const scoped = node.closest('[data-conversation-session]')
          if (scoped !== null) return scoped.getAttribute('data-conversation-session') === sessionId
          // A picker input appended outside the conversation still belongs to
          // the one mounted composer of this Session.
          return document.querySelector(`[data-conversation-session="${damSelectorValue(sessionId)}"]`) !== null
        }
        const remember = (files) => {
          if (files === undefined || files === null) return
          const list = []
          for (const file of files) if (file instanceof File) list.push(file)
          damRemember(sessionId, list)
        }
        const onPaste = (event) => {
          if (!inComposer(event.target) || !inThisSession(event.target)) return
          const data = event.clipboardData
          if (data === null) return
          const files = []
          for (const item of data.items) {
            if (item.kind !== 'file') continue
            const file = item.getAsFile()
            if (file !== null) files.push(file)
          }
          remember(files)
        }
        const onDrop = (event) => {
          if (!inComposer(event.target) || !inThisSession(event.target)) return
          const transfer = event.dataTransfer
          if (transfer !== null) remember(transfer.files)
        }
        const onChange = (event) => {
          const target = event.target
          if (!(target instanceof HTMLInputElement) || target.type !== 'file') return
          if (!inComposer(target) || !inThisSession(target)) return
          remember(target.files)
        }
        document.addEventListener('paste', onPaste, true)
        document.addEventListener('drop', onDrop, true)
        document.addEventListener('change', onChange, true)
        return () => {
          document.removeEventListener('paste', onPaste, true)
          document.removeEventListener('drop', onDrop, true)
          document.removeEventListener('change', onChange, true)
        }
      }, [sessionId])

      // Restore after a round-trip: the shell brings the words back first; if
      // no attachment came back with them, feed the remembered Files through
      // the composer's own paste path.
      React.useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
        const entry = damMemory.get(sessionId)
        if (entry === undefined || entry.files.length === 0 || entry.restored === true) return undefined
        if (phase !== 'plain') return undefined
        if (attachmentIds.length > 0) {
          entry.restored = true
          return undefined
        }
        let cancelled = false
        let attempts = 0
        let timer = null
        const attempt = () => {
          if (cancelled) return
          if (damInject(sessionId, entry.files)) {
            entry.restored = true
            return
          }
          attempts += 1
          if (attempts < 20) timer = window.setTimeout(attempt, 100)
        }
        timer = window.setTimeout(attempt, 80)
        return () => {
          cancelled = true
          if (timer !== null) window.clearTimeout(timer)
        }
      }, [sessionId, phase, attachmentIds.length])

      // Forget the cache when the draft leaves through a send (or is cleared),
      // and reset the restored guard so a second round-trip restores again.
      React.useEffect(() => {
        const previous = previousAttachments.current
        previousAttachments.current = attachmentIds.length
        if (phase !== 'plain') {
          damForget(sessionId)
          return
        }
        const entry = damMemory.get(sessionId)
        if (entry !== undefined && entry.restored === true && previous > 0 && attachmentIds.length === 0) {
          // Every attachment was removed by the human; do not resurrect them.
          damForget(sessionId)
        }
      }, [attachmentIds.length, phase, sessionId])

      React.useEffect(() => {
        if (typeof sessionId !== 'string') return undefined
        return () => {
          const entry = damMemory.get(sessionId)
          if (entry !== undefined) entry.restored = false
        }
      }, [sessionId])

      return null
    }

    /**
     * Register the invisible draft-attachment capture/restore seat.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installDraftAttachmentMemory(ctx) {
      ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: DAM_SEAT,
        order: 20
      }, DraftAttachmentSeat)), 'power-suite: draft attachment memory seat')
    }
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
      'collection.expand': 'Edit note in a larger editor',
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
      'collection.expand': '在较大编辑器中编辑备注',
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

    /** Install guard: a remount must never register the surface twice. */
    let annotationInstalled = false

    /** The controller singleton, or `null` while the feature is uninstalled. */
    let annotationController = null

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


    function AnnotationChevron(direction) {
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
    function annotationRectStyle(rect) {
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
    function useAnnotationSnapshot(controller) {
      const subscribe = React.useCallback((listener) => controller.store.subscribe(listener), [controller])
      const getSnapshot = React.useCallback(() => controller.store.getSnapshot(), [controller])
      if (typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      }
      const [value, setValue] = React.useState(getSnapshot)
      React.useEffect(() => subscribe(() => setValue(getSnapshot())), [subscribe, getSnapshot])
      return value
    }

    /**
     * The always-mounted annotation surface: launcher, rail, highlights,
     * popover, note editor, and feedback.
     * @param {{ t: Function, controller: object }} props - bound translate and controller.
     * @returns {object} React fragment.
     */
    function AnnotationOverlay(props) {
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
    function AnnotationLauncher(props) {
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
        onPointerDown: (event) => controller.beginLauncherDrag(event),
        onClick: () => {
          if (controller.consumeLauncherClickSuppressed()) return
          controller.toggleMode()
        }
      },
      RemixGlyph(REMIX_FOCUS_3_LINE, 20, 'psa-launcher-icon'),
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
    function annotationMarkElements(snapshot, t) {
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
    function AnnotationHighlights(props) {
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
    function AnnotationRail(props) {
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
      }, RemixGlyph(REMIX_INFORMATION_LINE, 15))
      const exitButton = React.createElement('button', {
        type: 'button',
        className: 'psa-icon-btn',
        'data-psa-exit': '',
        'data-psa-own': '',
        'aria-label': t('rail.exit'),
        title: t('rail.exit'),
        onClick: () => controller.requestExit()
      }, RemixGlyph(REMIX_CLOSE_LINE, 14))
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
    function AnnotationStatusView(props) {
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
        RemixGlyph(REMIX_INFORMATION_LINE, 13))))
      return React.createElement(React.Fragment, null, nodes)
    }

    /**
     * A3/T25: the redesigned annotation sidebar body — header subtitle, filter
     * chips with live counts, scope/tools, scrollable unified list (single rows +
     * group cards), empty states. Shell tokens only; no new dependencies.
     * @param {{ t: Function, controller: object, snapshot: object }} props - rail props.
     * @returns {object} the sidebar body.
     */
    function AnnotationCollectionView(props) {
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
      const filterLabel = (key, count) => React.createElement('button', {
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
          React.createElement('div', { className: 'psa-sb-empty-icon', 'aria-hidden': 'true' }, RemixGlyph(REMIX_LIST_CHECK_2, 18)),
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
    function AnnotationGroupRow(props) {
      const { t, controller, entry, index, ordinal } = props
      const scope = controller.collectionScopeOf(entry)
      const included = scope === 'current' && entry.included !== false
      const expanded = entry.collapsed !== true
      const items = annotationGroupItems(entry)
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
          onChange: (event) => controller.setEntryIncluded(entry.id, event.currentTarget.checked === true)
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
          onChange: (event) => controller.updateCollectionNote(entry.id, event.target.value)
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
        }, RemixGlyph(REMIX_LIST_CHECK_2, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-group-edit': '',
          'data-psa-own': '',
          'aria-label': t('collection.expand'),
          title: t('collection.expand'),
          onClick: () => controller.openNoteEditor(entry.id)
        }, RemixGlyph(REMIX_ANNOTATION_COPY_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-group-move-up': '',
          'data-psa-own': '',
          disabled: index === 0,
          title: t('collection.moveUp'),
          onClick: () => controller.moveEntry(entry.id, -1)
        }, RemixGlyph(REMIX_ARROW_UP_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-group-move-down': '',
          'data-psa-own': '',
          disabled: index >= (props.snapshot.state.collection.length - 1),
          title: t('collection.moveDown'),
          onClick: () => controller.moveEntry(entry.id, 1)
        }, RemixGlyph(REMIX_ARROW_DOWN_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn psa-detail-danger',
          'data-psa-group-remove': '',
          'data-psa-own': '',
          'aria-label': t('collection.remove'),
          title: t('collection.remove'),
          onClick: () => controller.removeEntry(entry.id)
        }, RemixGlyph(REMIX_DELETE_BIN_LINE, 13))),
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
            }, RemixGlyph(REMIX_ANNOTATION_COPY_LINE, 12)),
            React.createElement('button', {
              type: 'button',
              className: 'psa-icon-btn psa-detail-danger',
              'data-psa-group-item-remove': '',
              'data-psa-own': '',
              'aria-label': t('collection.remove'),
              title: t('collection.remove'),
              onClick: () => controller.removeGroupItem(entry.id, item.id)
            }, RemixGlyph(REMIX_DELETE_BIN_LINE, 12)))
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
    function AnnotationExitConfirm(props) {
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
    function AnnotationEntryRow(props) {
      const { t, controller, entry, index, ordinal } = props
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
          onChange: (event) => controller.setEntryIncluded(entry.id, event.currentTarget.checked === true)
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
        }, RemixGlyph(REMIX_LINK, 12)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-entry-copy-js-path': '',
          'data-psa-own': '',
          'aria-label': t('popover.copyJsPath'),
          title: t('popover.copyJsPath'),
          onClick: () => controller.copyJsPath(entry.id)
        }, RemixGlyph(REMIX_FILE_COPY_LINE, 12))),
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
          onChange: (event) => {
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
        }, RemixGlyph(REMIX_ANNOTATION_COPY_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-entry-expand': '',
          'data-psa-own': '',
          'aria-label': t('collection.expand'),
          title: t('collection.expand'),
          onClick: () => controller.openNoteEditor(entry.id)
        }, RemixGlyph(REMIX_LIST_CHECK_2, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-entry-move-up': '',
          'data-psa-own': '',
          disabled: index === 0,
          'aria-label': t('collection.moveUp'),
          title: t('collection.moveUp'),
          onClick: () => controller.moveEntry(entry.id, -1)
        }, RemixGlyph(REMIX_ARROW_UP_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-entry-move-down': '',
          'data-psa-own': '',
          disabled: index >= (props.snapshot.state.collection.length - 1),
          'aria-label': t('collection.moveDown'),
          title: t('collection.moveDown'),
          onClick: () => controller.moveEntry(entry.id, 1)
        }, RemixGlyph(REMIX_ARROW_DOWN_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn psa-detail-danger',
          'data-psa-entry-remove': '',
          'data-psa-own': '',
          'aria-label': t('collection.remove'),
          title: t('collection.remove'),
          onClick: () => controller.removeEntry(entry.id)
        }, RemixGlyph(REMIX_DELETE_BIN_LINE, 13))))
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
    function annotationCollectionFooter(t, controller, snapshot) {
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
    function AnnotationModifierSegmented(props) {
      const { t, controller, fieldName, value, dataAttribute, labelId } = props
      const groupId = `psa-modifier-group-${fieldName}`
      const buttonRefs = React.useRef([])
      /**
       * Select one segment through the controller (persist + conflict feedback).
       * @param {number} index - segment index.
       * @param {boolean} focus - focus the segment after selection.
       * @returns {void}
       */
      const selectSegment = (index, focus) => {
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
      const onSegmentKeyDown = (event, index) => {
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
          ref: (node) => { buttonRefs.current[index] = node },
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
          onKeyDown: (event) => onSegmentKeyDown(event, index)
        }, annotationSegmentDisplayLabel(t(`modifier.${choice}`))))))
    }

    /**
     * A3/T51 (redirected design): transient borderless modifier-settings popover
     * anchored to the header info icon. It is NOT a rail view: no gear/back panel,
     * Esc/outside clicks close it, and it never traps focus.
     * @param {{ t: Function, controller: object, snapshot: object }} props - popover props.
     * @returns {object} fixed popover portal.
     */
    function AnnotationModifierSettingsPopover(props) {
      const { t, controller, snapshot } = props
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
      const popoverRef = React.useRef(null)
      const [position, setPosition] = React.useState(null)
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
        const onPointerDown = (event) => {
          const target = event.target
          if (popoverRef.current !== null && popoverRef.current.contains(target)) return
          const trigger = document.querySelector('[data-psa-open-modifier-settings]')
          if (trigger !== null && trigger.contains(target)) return
          controller.closeSettingsOpen()
        }
        // A3/T53/T55: document-level Escape closes the popover (no nested menu now).
        const onDocumentKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          controller.closeSettingsOpen()
        }
        const close = () => controller.closeSettingsOpen()
        document.addEventListener('keydown', onDocumentKeyDown, true)
        document.addEventListener('pointerdown', onPointerDown, true)
        window.addEventListener('resize', close)
        window.addEventListener('scroll', close, true)
        return () => {
          document.removeEventListener('keydown', onDocumentKeyDown, true)
          document.removeEventListener('pointerdown', onPointerDown, true)
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
      const row = (labelKey, dataAttribute, fieldName, value) => {
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
    function AnnotationDetailCard(props) {
      const { t, controller, snapshot } = props
      const card = snapshot.detailCard
      /** Requirement draft; uncontrolled so hover reopen never fights the record value. */
      /** @type {import('react').MutableRefObject<HTMLTextAreaElement | null>} */
      const noteRef = React.useRef(null)
      const setDetailNode = React.useCallback((node) => {
        if (node === null) controller.detachDetailNode()
        else controller.attachDetailNode(node)
      }, [controller])
      if (card === null) return null
      const record = snapshot.state.collection.find((entry) => entry.id === card.refId)
      if (record === undefined) return null
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
      const metaRow = (label, value, marker) => React.createElement(React.Fragment, null,
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
        }, RemixGlyph(REMIX_CLOSE_LINE, 14))),
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
        }, RemixGlyph(REMIX_DELETE_BIN_LINE, 14))))
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
    function AnnotationChipPreview(props) {
      const { t, controller, snapshot } = props
      const preview = snapshot.chipPreview
      if (preview === null || typeof preview !== 'object') return null
      const metaRow = (label, value) => React.createElement(React.Fragment, null,
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
        const session = record.session !== null && typeof record.session === 'object' ? record.session : {}
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
    function AnnotationChipDelete(props) {
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
        onPointerDown: (event) => {
          event.preventDefault()
          event.stopPropagation()
        },
        onClick: (event) => {
          event.preventDefault()
          event.stopPropagation()
          controller.removeChipAtAction()
        }
      }, RemixGlyph(REMIX_CLOSE_LINE, 9))
    }

    /**
     * A3/T24: ONE popover for a multi-selection. It is the only place a batch
     * requirement is written: one shared textarea for the whole group, with a
     * compact list of the selected element labels. Committing saves ONE group
     * containing every selected element; Esc/X clears the selection.
     * @param {{ t: Function, controller: object, snapshot: object }} props - surface props.
     * @returns {object | null} the batch popover.
     */
    function AnnotationBatchPopover(props) {
      const { t, controller, snapshot } = props
      const state = snapshot.state
      const position = snapshot.batchPosition
      if (position === null || state.selection.length < 2) return null
      const labels = state.selection.map((ref) => elementLabel(ref))
      const shown = labels.slice(0, 4)
      return React.createElement('div', {
        ref: (node) => controller.attachBatchNode(node),
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
        onPointerDown: (event) => controller.beginBatchDrag(event)
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
        }, RemixGlyph(REMIX_CLOSE_LINE, 14))),
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
            onChange: (event) => controller.updateNote(event.target.value),
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
    function AnnotationPopover(props) {
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
        onPointerDown: (event) => controller.beginPopoverDrag(event)
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
      }, RemixGlyph(REMIX_CLOSE_LINE, 14))),
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
        }, RemixGlyph(REMIX_ANNOTATION_COPY_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-popover-copy-xpath': '',
          'data-psa-own': '',
          'aria-label': t('popover.copyXPath'),
          title: t('popover.copyXPath'),
          onClick: () => controller.copyXPath()
        }, RemixGlyph(REMIX_LINK, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-popover-copy-js-path': '',
          'data-psa-own': '',
          'aria-label': t('popover.copyJsPath'),
          title: t('popover.copyJsPath'),
          onClick: () => controller.copyJsPath()
        }, RemixGlyph(REMIX_FILE_COPY_LINE, 13))),
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
        }, RemixGlyph(REMIX_ARROW_UP_LINE, 13)),
        React.createElement('button', {
          type: 'button',
          className: 'psa-icon-btn',
          'data-psa-level-down': '',
          'data-psa-own': '',
          'aria-label': t('popover.levelDown'),
          title: t('popover.levelDown'),
          onClick: () => controller.levelDown()
        }, RemixGlyph(REMIX_ARROW_DOWN_LINE, 13)))),
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
            }, RemixGlyph(REMIX_DELETE_BIN_LINE, 12))
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
            onChange: (event) => controller.updateNote(event.target.value),
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
    function AnnotationNoteEditor(props) {
      const { t, controller, snapshot } = props
      const editor = snapshot.noteEditor
      if (editor === null) return null
      const entry = snapshot.state.collection.find((item) => item.id === editor.refId)
      if (entry === undefined) return null
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
        }, RemixGlyph(REMIX_CLOSE_LINE, 14))),
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
          onChange: (event) => controller.updateCollectionNote(entry.id, event.target.value),
          onBlur: () => controller.closeNoteEditor()
        })))
    }

    /**
     * Invisible Composer seat that keeps the insertion bridge current and resets
     * selection state when the viewed Session changes.
     * @param {object} props - session slot props.
     * @returns {object} a hidden anchor element.
     */
    function AnnotationSessionSeat(props) {
      const { sessionId, inputActions } = props
      // Session-scoped slots receive the global `useSessions` standard hook. The
      // annotation overlay itself is not a slot, so this seat mirrors the Session's
      // workspace identity (cwd) into the bridge for record capture (F-2). The hook
      // presence is fixed by the slot contract for this seat's lifetime.
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : null
      const sessionsList = useSessions !== null ? useSessions((state) => state) : null
      const sessionCwd = sessionId !== undefined && sessionsList !== null && typeof sessionsList === 'object'
        && sessionsList.byId !== null && typeof sessionsList.byId === 'object'
        && typeof sessionsList.byId[sessionId]?.cwd === 'string'
        && sessionsList.byId[sessionId].cwd.length > 0
        ? sessionsList.byId[sessionId].cwd
        : null
      React.useEffect(() => {
        annotationBridge.sessionId = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
        annotationBridge.inputActions = inputActions ?? null
        annotationBridge.sessionCwd = sessionCwd
        if (annotationController !== null) annotationController.sessionChanged(annotationBridge.sessionId)
        return () => {
          // The bridge is all-or-nothing: a session id without its Composer actions (or the
          // reverse) would keep collection scope and insertion decisions stale after this
          // seat unmounts (e.g. leaving the conversation for the Plugins view).
          annotationBridge.sessionId = null
          annotationBridge.inputActions = null
          annotationBridge.sessionCwd = null
          if (annotationController !== null) annotationController.sessionChanged(null)
        }
      }, [sessionId, inputActions, sessionCwd])
      return React.createElement('span', {
        style: { display: 'none' },
        'aria-hidden': true
      })
    }

    /**
     * Build the `@` trigger source that owns annotation reference chips (A3/T9).
     *
     * The source receives the controller lazily so registration can happen before
     * the controller effect settles; every callback resolves the current
     * controller instance. `codec.serialize` throws for a deleted record so the
     * shell blocks the send instead of silently downgrading (D9).
     * @param {() => object | null} controllerAt - current annotation controller getter.
     * @param {Function} t - namespace-bound translate.
     * @returns {object} trigger source for `ctx.inputTriggers.registerSource`.
     */
    function createAnnotationChipSource(controllerAt, t) {
      /** @returns {object | null} the current controller. */
      const controller = () => {
        try {
          return controllerAt()
        } catch {
          return null
        }
      }
      return {
        trigger: ANNOTATION_CHIP_TRIGGER,
        name: ANNOTATION_CHIP_SOURCE,
        order: ANNOTATION_CHIP_ORDER,
        // The shell's slash-menu dictionary has no annotation title, and locale
        // registration cannot take over another owner's namespace, so a custom group
        // header would render the raw source name. Native reference sources use the
        // same no-title treatment; candidates self-identify via `chip.candidateLabel`.
        showGroupTitle: false,
        /**
         * Current-Session candidates only; an empty array hides the group (D8).
         * @param {object} session - composer Session projection.
         * @returns {Promise<Array<object>>} candidates.
         */
        async candidates(session) {
          const current = controller()
          if (current === null || session === null || typeof session !== 'object') return []
          const sessionId = typeof session.sessionId === 'string' ? session.sessionId : ''
          if (sessionId.length === 0) return []
          return current.chipCandidates(sessionId)
        },
        /**
         * A menu pick inserts the record's chip through the scoped input pipeline.
         * @param {object} pick - pipeline pick (`candidate`, `session`, `span`).
         * @returns {object | undefined} insert outcome, or undefined for a stale candidate.
         */
        onPick(pick) {
          const current = controller()
          if (current === null || pick === null || typeof pick !== 'object') return undefined
          const candidate = pick.candidate !== null && typeof pick.candidate === 'object' ? pick.candidate : null
          const value = candidate === null ? null : candidate.value
          if (typeof value !== 'string') return undefined
          const record = current.chipRecord(value)
          if (record === null) return undefined
          return { insert: annotationChipRefOf(record) }
        },
        /**
         * A chip click opens the record's detail card (single) or the rail
         * collection view (batch group).
         * @param {object} _session - composer Session projection.
         * @param {{ ref: string }} reference - chip reference.
         * @returns {boolean} whether the preview was accepted.
         */
        openReference(_session, reference) {
          const current = controller()
          if (current === null || reference === null || typeof reference !== 'object') return false
          return current.openChipReference(reference.ref)
        },
        codec: {
          /**
           * Clipboard projection of one chip.
           * @param {string} ref - chip ref.
           * @returns {string} clipboard text.
           */
          clipboardText: (ref) => {
            const current = controller()
            return current === null ? '' : current.chipClipboardText(ref)
          },
          /**
           * Model text for one chip; failure rejects the send (never downgraded).
           * @param {string} ref - chip ref.
           * @returns {Promise<string>} serialized model text.
           */
          serialize: async (ref) => {
            const current = controller()
            if (current === null) throw new Error(t('feedback.chipMissing'))
            return current.serializeChip(ref)
          }
        }
      }
    }

    /**
     * Install the browser-only UI element annotation mode.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installUiAnnotation(ctx) {
      if (annotationInstalled) return
      annotationInstalled = true
      const t = ctx.locale.bind(ANNOTATION_NS)
      ctx.effect(() => ctx.locale.register(ANNOTATION_NS, {
        en: ANNOTATION_EN,
        zh: ANNOTATION_ZH
      }), 'power-suite: ui annotation dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-power-suite-css', 'ui-annotation')
        style.textContent = ANNOTATION_CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'power-suite: ui annotation stylesheet')
      ctx.effect(() => {
        try {
          annotationController = createAnnotationController(
            t,
            /** @type {import('./browser/ui-annotation/types.ts').AnnotationControllerContext} */ (ctx),
            { bridge: annotationBridge }
          )
        } catch (error) {
          // The guard must not wedge this factory into a "installed" state with no controller.
          annotationInstalled = false
          throw error
        }
        return () => {
          if (annotationController !== null) annotationController.dispose()
          annotationController = null
          annotationInstalled = false
        }
      }, 'power-suite: ui annotation controller')
      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: ANNOTATION_OVERLAY_ID
      }, (props) => React.createElement(AnnotationOverlay, {
        ...props,
        t,
        controller: annotationController
      }))), 'power-suite: ui annotation overlay')
      ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: ANNOTATION_SEAT_ID,
        order: 60
      }, AnnotationSessionSeat)), 'power-suite: ui annotation composer seat')
      // A3/T21: delegated composer-chip hover preview listeners (they only fire on
      // chips the shell renders with `data-composer-chip="ui-annotation"`, so the
      // shell itself is untouched and native chips are ignored).
      ctx.effect(() => {
        const onPointerOver = (event) => {
          if (annotationController !== null) annotationController.onChipPointerOver(event)
        }
        const onPointerOut = (event) => {
          if (annotationController !== null) annotationController.onChipPointerOut(event)
        }
        const onPointerMove = (event) => {
          // Re-show the preview after it was dismissed (Esc) without requiring the
          // pointer to leave and re-enter the chip: pointerover alone does not fire
          // when the pointer is already inside the chip.
          if (annotationController !== null) annotationController.onChipPointerOver(event)
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape' || annotationController === null) return
          // Esc first closes the transient chip tooltip/× and must not also clear a
          // selection or leave the mode in the same keypress.
          const hadPreview = annotationController.hideChipPreview()
          annotationController.hideChipAction()
          if (hadPreview) {
            event.preventDefault()
            event.stopPropagation()
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
          }
        }
        const onScroll = (event) => {
          if (annotationController !== null) annotationController.onChipScroll(event)
        }
        document.addEventListener('pointerover', onPointerOver, true)
        document.addEventListener('pointerout', onPointerOut, true)
        document.addEventListener('pointermove', onPointerMove, true)
        document.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('scroll', onScroll, true)
        return () => {
          document.removeEventListener('pointerover', onPointerOver, true)
          document.removeEventListener('pointerout', onPointerOut, true)
          document.removeEventListener('pointermove', onPointerMove, true)
          document.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('scroll', onScroll, true)
        }
      }, 'power-suite: ui annotation chip hover preview')
      // A3/T9: the composer chip pipeline is injected dynamically so the plugin
      // keeps working on embeds without the chat UI. `conversation`+`inputTriggers`
      // arrive when the composer services are installed; the source registration
      // dies with the dynamic inject's fiber.
      try {
        ctx.inject(['conversation', 'inputTriggers'], (scoped) => {
          const scope = scoped !== undefined && scoped !== null && typeof scoped.get === 'function' ? scoped : ctx
          let conversation = null
          let inputTriggers = null
          try {
            conversation = scope.get('conversation')
            inputTriggers = scope.get('inputTriggers')
          } catch {
            conversation = null
            inputTriggers = null
          }
          if (conversation === undefined || conversation === null || inputTriggers === undefined || inputTriggers === null) return
          if (annotationController !== null) annotationController.attachComposerServices({ conversation, inputTriggers })
          const register = typeof scope.effect === 'function' ? scope.effect.bind(scope) : ctx.effect.bind(ctx)
          register(() => inputTriggers.registerSource(createAnnotationChipSource(() => annotationController, t)),
            'power-suite: ui annotation chip source')
        })
      } catch {
        // A missing dynamic-inject API leaves the plain-text insertion path (D9).
      }
    }
    //#endregion

    //#region feature: composer image gallery
    /**
     * Composer image gallery: intercepts clicks on multiple pasted screenshots in
     * the composer's attachment rail and opens one continuous viewer instead of the
     * native single-image lightbox. Single-image composers keep native behavior.
     *
     * The native rail is DOM-measured (shell classes are hashed): openable pasted
     * images are `button` elements inside `[data-conversation-region="composer"]`
     * that contain exactly one `img`, carry a non-empty `title`, and have no
     * `aria-label` (refused uploads set an aria-label error). Order is DOM order.
     */

    /** Copy namespace for the composer image gallery. */
    const PSG_NS = 'composerImageGallery'

    /** Slot cell identity of the gallery overlay. */
    const PSG_SLOT_ID = 'power-suite.composer-image-gallery'

    /** Deepest composer region the interception is scoped to. */
    const PSG_COMPOSER_SELECTOR = '[data-conversation-region="composer"]'

    /** Localised copy for the gallery overlay. */
    const PSG_EN = {
      'dialog': 'Image gallery',
      'close': 'Close image gallery',
      'previous': 'Previous image',
      'next': 'Next image',
      'counter': '{index} / {total}'
    }
    const PSG_ZH = {
      'dialog': '图片查看器',
      'close': '关闭图片查看器',
      'previous': '上一张',
      'next': '下一张',
      'counter': '{index} / {total}'
    }

    // Remix Icon paths (Apache-2.0, https://remixicon.com), inlined for zero-install.
    const PSG_ARROW_LEFT_LINE = 'M10.8284 12.0007L15.7782 16.9504L14.364 18.3646L8 12.0007L14.364 5.63672L15.7782 7.05093L10.8284 12.0007Z'
    const PSG_ARROW_RIGHT_LINE = 'M13.1717 12.0007L8.22192 7.05093L9.63614 5.63672L16.0001 12.0007L9.63614 18.3646L8.22192 16.9504L13.1717 12.0007Z'
    const PSG_CLOSE_LINE = 'M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z'

    /** Module-level gallery store: exactly one overlay can exist. */
    let psgState = { open: false, images: [], index: 0 }
    const psgListeners = new Set()
    let psgSourceButton = null
    let psgComposerRegion = null

    /** Notify overlay subscribers. */
    function psgEmit() {
      for (const listener of [...psgListeners]) {
        try {
          listener()
        } catch {
          // A subscriber throw cannot break the store.
        }
      }
    }

    /**
     * Subscribe the overlay component to gallery state.
     * @param {Function} listener - change callback.
     * @returns {Function} unsubscribe.
     */
    function psgSubscribe(listener) {
      psgListeners.add(listener)
      return () => psgListeners.delete(listener)
    }

    /** @returns {{ open: boolean, images: Array<object>, index: number }} current snapshot. */
    function psgSnapshot() {
      return psgState
    }

    /**
     * Open the gallery on a collected rail snapshot.
     * @param {Array<{ src: string, name: string, button: HTMLElement }>} collected - rail images.
     * @param {number} index - clicked image index.
     * @param {HTMLElement} sourceButton - clicked thumbnail (focus return target).
     * @param {HTMLElement} composer - composer region (mutation watch target).
     * @returns {void}
     */
    function psgOpen(collected, index, sourceButton, composer) {
      const images = collected.map(({ src, name }) => ({ src, name }))
      psgSourceButton = sourceButton
      psgComposerRegion = composer
      psgState = { open: true, images, index: psgClampIndex(index, images.length) }
      psgEmit()
    }

    /**
     * Close the gallery and optionally return focus to the clicked thumbnail.
     * @param {{ restoreFocus?: boolean }} [options] - focus behavior.
     * @returns {void}
     */
    function psgClose(options) {
      const restoreFocus = options === null || options === undefined || options.restoreFocus !== false
      const button = psgSourceButton
      const wasOpen = psgState.open
      psgSourceButton = null
      psgComposerRegion = null
      if (!wasOpen) return
      psgState = { open: false, images: [], index: 0 }
      psgEmit()
      if (restoreFocus && button instanceof HTMLElement && button.isConnected) {
        try {
          button.focus({ preventScroll: true })
        } catch {
          button.focus()
        }
      }
    }

    /**
     * Move the open gallery one image in the given direction (clamped).
     * @param {number} delta - positive for next, negative for previous.
     * @returns {void}
     */
    function psgStep(delta) {
      if (!psgState.open) return
      const index = psgStepIndex(psgState.index, psgState.images.length, delta)
      if (index === psgState.index) return
      psgState = { ...psgState, index }
      psgEmit()
    }

    /**
     * Re-read the composer rail while the gallery is open and reconcile the state:
     * removed attachments clamp the index, an emptied rail closes the overlay.
     * @returns {void}
     */
    function psgSync() {
      if (!psgState.open) return
      const composer = psgComposerRegion
      if (!(composer instanceof HTMLElement) || !composer.isConnected) {
        psgClose({ restoreFocus: false })
        return
      }
      const collected = psgCollectImages(composer)
      const currentSrc = psgState.images[psgState.index]?.src ?? ''
      const next = psgSyncState(collected.map(({ src, name }) => ({ src, name })), psgState.index, currentSrc)
      if (next.images.length === 0) {
        psgClose({ restoreFocus: false })
        return
      }
      if (next.images.length === psgState.images.length
        && next.index === psgState.index
        && next.images.every((image, position) => image.src === psgState.images[position]?.src)) return
      psgState = { ...psgState, images: next.images, index: next.index }
      psgEmit()
    }

    /**
     * Document capture click handler: suppresses the native single-image lightbox
     * when the composer holds two or more openable pasted images.
     * @param {MouseEvent} event - click event.
     * @returns {void}
     */
    function psgOnDocumentClick(event) {
      if (psgState.open) return
      if (event.defaultPrevented) return
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button')
      if (!(button instanceof HTMLElement)) return
      const composer = button.closest(PSG_COMPOSER_SELECTOR)
      if (!(composer instanceof HTMLElement)) return
      const collected = psgCollectImages(composer)
      if (collected.length < 2) return
      const index = collected.findIndex((image) => image.button === button)
      if (index < 0) return
      // Capture phase runs above React's delegated handler; both calls are needed
      // to replace the native lightbox instead of stacking a second overlay.
      event.preventDefault()
      event.stopImmediatePropagation()
      psgOpen(collected, index, button, composer)
    }

    /** Stylesheet for the gallery overlay (native lightbox recipe on shell tokens). */
    const PSG_CSS = `
.psg-root{position:fixed;inset:0;z-index:1000;pointer-events:auto;animation:psg-fade 140ms ease-out}
.psg-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.24));backdrop-filter:var(--dsw-mask-blur,none)}
.psg-stage{position:absolute;inset:var(--dsh-frame-chrome-top,0px) 0 0;display:flex;align-items:center;justify-content:center;padding:40px;box-sizing:border-box;pointer-events:none}
.psg-image,.psg-close,.psg-nav,.psg-counter{pointer-events:auto}
.psg-image{position:relative;max-width:min(100%,1600px);max-height:100%;object-fit:contain;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-1));border:0;box-shadow:var(--dsw-elevation-prominent,var(--dsw-shadow-lv3,none))}
.psg-close,.psg-nav{position:absolute;z-index:2;display:grid;place-items:center;width:36px;height:36px;padding:0;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2-darkmode-thin,var(--dsw-alias-border-l2,transparent));border-radius:999px;corner-shape:round;background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);cursor:pointer;box-shadow:var(--dsw-elevation-panel,none)}
.psg-close{top:20px;right:20px}
.psg-nav{top:50%;transform:translateY(-50%)}
.psg-prev{left:20px}
.psg-next{right:20px}
.psg-close:hover,.psg-nav:hover:enabled{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.psg-close:focus-visible,.psg-nav:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:3px}
.psg-nav:disabled{opacity:.35;cursor:default}
.psg-counter{position:absolute;top:20px;left:50%;transform:translateX(-50%);z-index:2;display:inline-flex;align-items:center;height:36px;padding:0 14px;box-sizing:border-box;border-radius:999px;corner-shape:round;background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;font-variant-numeric:tabular-nums;box-shadow:var(--dsw-elevation-panel,none)}
@keyframes psg-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){.psg-root{animation:none}}
`

    /**
     * The gallery overlay component. Subscribes to the module store, reconciles
     * with the composer rail while open, and owns the modal input handling.
     * @param {object} props - slot props plus injected t.
     * @returns {object | null} the overlay, or null while closed.
     */
    function ComposerImageGallery(props) {
      const { t } = props
      const state = React.useSyncExternalStore(psgSubscribe, psgSnapshot, psgSnapshot)
      /** @type {import('react').MutableRefObject<HTMLElement | null>} */
      const rootRef = React.useRef(null)
      const open = state.open

      // Reconcile with the live composer rail: attachment removal and Session
      // switches change or empty the rail; a short interval catches a composer
      // region that is replaced without mutations inside the old element.
      React.useEffect(() => {
        if (!open) return undefined
        const composer = psgComposerRegion
        const observer = typeof MutationObserver === 'function' && composer instanceof HTMLElement
          ? new MutationObserver(() => psgSync())
          : null
        if (observer !== null && composer instanceof HTMLElement) {
          observer.observe(composer, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
        }
        const interval = window.setInterval(() => psgSync(), 400)
        return () => {
          if (observer !== null) observer.disconnect()
          window.clearInterval(interval)
        }
      }, [open])

      // Modal keys while open: Esc closes, Left/Right navigate. Capture so shell
      // shortcuts never see the arrows first.
      React.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.defaultPrevented) return
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            psgClose()
            return
          }
          if (event.key === 'ArrowLeft' || event.key === 'Left') {
            event.preventDefault()
            event.stopPropagation()
            psgStep(-1)
            return
          }
          if (event.key === 'ArrowRight' || event.key === 'Right') {
            event.preventDefault()
            event.stopPropagation()
            psgStep(1)
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [open])

      // One step per wheel gesture; the overlay must not scroll the page behind it.
      React.useEffect(() => {
        if (!open) return undefined
        const root = rootRef.current
        if (!(root instanceof HTMLElement)) return undefined
        let accumulated = 0
        let lastStepAt = Number.NEGATIVE_INFINITY
        const onWheel = (event) => {
          event.preventDefault()
          const decision = psgWheelDecision(accumulated, event.deltaY, Date.now(), lastStepAt)
          accumulated = decision.accum
          if (decision.step === 0) return
          lastStepAt = decision.lastStepAt
          psgStep(decision.step)
        }
        root.addEventListener('wheel', onWheel, { passive: false })
        return () => root.removeEventListener('wheel', onWheel)
      }, [open])

      // Move focus into the dialog on open; closing returns it to the thumbnail.
      React.useEffect(() => {
        if (!open) return
        const close = rootRef.current?.querySelector('[data-psg-close]')
        if (close instanceof HTMLElement) close.focus()
      }, [open])

      if (!open || state.images.length === 0) return null
      const total = state.images.length
      const index = psgClampIndex(state.index, total)
      const image = state.images[index]
      return React.createElement('div', {
        className: 'psg-root',
        ref: rootRef,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('dialog'),
        'data-psg-gallery': '',
        'data-psg-index': String(index),
        'data-psg-total': String(total)
      },
      React.createElement('div', {
        className: 'psg-mask',
        'aria-hidden': true,
        onClick: () => psgClose()
      }),
      React.createElement('div', { className: 'psg-stage' },
        React.createElement('img', {
          className: 'psg-image',
          src: image.src,
          alt: image.name,
          draggable: false,
          'data-psg-image': ''
        })),
      React.createElement('div', {
        className: 'psg-counter',
        'aria-live': 'polite',
        'data-psg-counter': ''
      }, t('counter', { index: index + 1, total })),
      React.createElement('button', {
        type: 'button',
        className: 'psg-nav psg-prev',
        'data-psg-prev': '',
        'aria-label': t('previous'),
        title: t('previous'),
        disabled: index <= 0,
        onClick: () => psgStep(-1)
      }, RemixGlyph(PSG_ARROW_LEFT_LINE, 18)),
      React.createElement('button', {
        type: 'button',
        className: 'psg-nav psg-next',
        'data-psg-next': '',
        'aria-label': t('next'),
        title: t('next'),
        disabled: index >= total - 1,
        onClick: () => psgStep(1)
      }, RemixGlyph(PSG_ARROW_RIGHT_LINE, 18)),
      React.createElement('button', {
        type: 'button',
        className: 'psg-close',
        'data-psg-close': '',
        'aria-label': t('close'),
        title: t('close'),
        onClick: () => psgClose()
      }, RemixGlyph(PSG_CLOSE_LINE, 16)))
    }

    /**
     * Install the composer image gallery: dictionaries, stylesheet, the capture
     * click interceptor, and the overlay slot entry.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installComposerImageGallery(ctx) {
      const t = ctx.locale.bind(PSG_NS)
      ctx.effect(() => ctx.locale.register(PSG_NS, { en: PSG_EN, zh: PSG_ZH }), 'power-suite: composer image gallery dictionaries')
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.powerSuiteCss = 'composer-gallery'
        tag.textContent = PSG_CSS
        document.head.appendChild(tag)
        return () => { tag.remove() }
      }, 'power-suite: composer image gallery styles')
      ctx.effect(() => {
        document.addEventListener('click', psgOnDocumentClick, true)
        return () => {
          document.removeEventListener('click', psgOnDocumentClick, true)
          psgClose({ restoreFocus: false })
        }
      }, 'power-suite: composer image gallery interceptor')
      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: PSG_SLOT_ID
      }, (props) => React.createElement(ComposerImageGallery, { ...props, t }))), 'power-suite: composer image gallery overlay')
    }
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

    //#region plugin
    /**
     * Register dictionaries, the page type, and its Session-scoped body.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      // Documented test seam: seed/settle one interrupted record and re-sync the
      // native row decoration, so the E2E can exercise the interrupted-idle,
      // continued-running and completed phases without sending a real Continue.
      const testHooks = testHookHost.__POWER_SUITE_TEST_HOOKS__
      if (testHooks !== null && typeof testHooks === 'object') {
        testHooks.interruptedSessions = {
          set: (sessionId, patch) => {
            setInterruptedRecord(sessionId, { status: 'ready', interrupted: false, running: false, ...patch })
            syncInterruptedRows()
            return interruptedRecord(sessionId)
          },
          clear: (sessionId) => {
            interruptedStore.records.delete(sessionId)
            syncInterruptedRows()
          },
          record: (sessionId) => interruptedRecord(sessionId),
          sync: () => syncInterruptedRows()
        }
      }
      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'power-suite: session-artifacts dictionaries')
      // The Files page header is the single artifacts entry point; the standalone
      // artifacts page type, its tab body and its Start-guide card are gone.
      ctx.effect(() => ctx.slots.inject('sidebar.right.tab.files.actions', () => ctx.slots.register({
        name: 'sidebar.right.tab.files.actions',
        id: FILES_ACTION_ID,
        order: 40,
        locale: NS,
        inject: () => ({ t, sidebarRight: ctx.sidebarRight })
      }, ArtifactsFilesAction)), 'power-suite: session-artifacts Files action')
      installWorkspacePresetMenu(ctx)
      installWorkspacePresetRouting(ctx)
      installPromptHistory(ctx)
      installPromptHistoryPreview(/** @type {import('./browser/prompt-history/preview.ts').PromptHistoryPreviewContext} */ (ctx))
      installDraftAttachmentMemory(ctx)
      dynamicWorkspacesInstaller.install(/** @type {import('./browser/dynamic-workspaces/install.ts').DynamicWorkspacesContext} */ (ctx))
      installSessionHoverFigures(/** @type {import('./browser/native-session-hover-figures/install.ts').NativeSessionHoverFiguresContext} */ (ctx))
      installInterruptedSessions(/** @type {import('./browser/interrupted-sessions/components.ts').InterruptedSessionComponentsContext} */ (ctx))
      installQuickLook(/** @type {import('./browser/hover-quick-look/install.ts').HoverQuickLookContext} */ (ctx), {
        t,
        appUrl,
        rawRoute: RAW_ROUTE,
        previewRoute: PREVIEW_ROUTE,
        attachmentUrl: (attachment, disposition) => attachmentUrl(attachment, disposition, null),
        formatBytes,
        icons: { file: REMIX_FILE_LINE, open: REMIX_BOOK_OPEN_LINE, download: REMIX_DOWNLOAD_LINE }
      })
      installSettingsPage(ctx)
      installComposerImageGallery(ctx)
      installUpdatePrompt(/** @type {import('./browser/update-check/install.ts').UpdateCheckContext} */ (ctx))
      installUiAnnotation(ctx)
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
        debugFallbackScanProbe: () => (annotationController !== null && annotationController !== undefined
          && typeof annotationController.debugFallbackScanProbe === 'function'
          ? annotationController.debugFallbackScanProbe()
          : { ok: false, reason: 'controller unavailable' })
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
