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

    /** Copy namespace of the UI element annotation mode. */
    const ANNOTATION_NS = 'powerSuiteAnnotation'

    /** The always-mounted overlay seat that renders the annotation surface. */
    const ANNOTATION_OVERLAY_ID = 'power-suite.ui-annotation-overlay'

    /** The renderless Composer seat that maintains the insertion bridge. */
    const ANNOTATION_SEAT_ID = 'power-suite.ui-annotation-seat'

    /** Browser-owned persistence keys. The mode itself is intentionally not restored. */
    const LAUNCHER_STORAGE_KEY = 'power-suite.ui-annotation.launcher'
    const RAIL_STORAGE_KEY = 'power-suite.ui-annotation.rail-collapsed'

    /** Debounce for the persisted annotation document (D1). */
    const ANNOTATION_PERSIST_DEBOUNCE_MS = 250

    /** D5: single-slot undo window after a delete (newest delete replaces it). */
    const ANNOTATION_UNDO_WINDOW_MS = 5000

    /** A3/T6: hover-intent delay before the floating detail card appears. */
    const ANNOTATION_DETAIL_HOVER_DELAY_MS = 120

    /** A3/T6: grace period before the detail card closes after the pointer leaves. */
    const ANNOTATION_DETAIL_CLOSE_DELAY_MS = 120

    /** A3/T21: estimated composer-chip hover preview size used for clamping. */
    const ANNOTATION_CHIP_PREVIEW_SIZE = { width: 320, height: 150 }

    /** A3/T24: estimated batch popover size used for placement clamping. */
    const ANNOTATION_BATCH_POPOVER_SIZE = { width: 320, height: 240 }


    /** A3/T9: trigger character the annotation source binds to (`@`). */
    const ANNOTATION_CHIP_TRIGGER = '@'

    /** A3/T9: menu order after the native `@reference` group. */
    const ANNOTATION_CHIP_ORDER = 900

    /** F2: a floating surface root needs at least this computed z-index. */
    const ANNOTATION_SURFACE_MIN_Z = 10

    /** F1: annotation paint layer z-index: intentionally above native hover cards and shell modals/menus. */
    const ANNOTATION_PAINT_Z = 2000

    /** Root marker for the raised paint layer, asserted by the live E2E. */
    const ANNOTATION_RAISED_ATTR = 'data-psa-raised'

    /**
     * Module event announced when the mode turns on/off. The dynamic-workspaces
     * feature owns the dependent hover-card pinning behavior; this annotation
     * region only dispatches the state (D3: ownership split).
     */
    const ANNOTATION_STATE_EVENT = 'power-suite:ui-annotation-state'

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
    const annotationBridge = { sessionId: null, inputActions: null, sessionCwd: null }

    /** Install guard: a remount must never register the surface twice. */
    let annotationInstalled = false

    /** One-shot diagnostic for the Session-identity fallback (never fully silent). */
    let annotationIdentityWarned = false

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

    /** A3/T36: bounded document-fallback scan (the identity constants moved to anchors.ts). */
    const ANNOTATION_FALLBACK_SCAN_MAX = 400

    //#endregion

    /** Selector set of elements the picker treats as meaningful, nearest first. */
    const ANNOTATION_CANDIDATE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="link"], [role="dialog"], [role="menu"], [role="tooltip"], [role="list"], [role="listitem"], [role="treeitem"], [role="combobox"], [role="textbox"], [data-row-key], [data-conversation-region], [aria-label], h1, h2, h3, h4, h5, h6, li, td, pre, p, code, nav, aside, main, section'

    /** Estimated popover size used for clamping. */
    const ANNOTATION_POPOVER_SIZE = { width: 320, height: 248 }

    /** Launcher edge length in pixels; must match the stylesheet. */
    const ANNOTATION_LAUNCHER_SIZE = 44

    /**
     * Resolve one event target (or node) to an Element.
     * @param {unknown} target - event target or node.
     * @returns {Element | null} the element, when available.
     */
    function annotationDomElement(target) {
      if (target === null || target === undefined || typeof target !== 'object') return null
      if (typeof Element !== 'undefined' && target instanceof Element) return target
      if (typeof target.nodeType === 'number' && target.nodeType === 3) return annotationDomElement(target.parentElement)
      return null
    }

    /**
     * The event target element. The target is preferred over `composedPath()[0]`
     * because the DOM retargets a Shadow DOM hit to its host, which is exactly
     * the selectable boundary this feature documents.
     * @param {object} event - DOM event.
     * @returns {Element | null} the event target element.
     */
    function annotationEventElement(event) {
      if (event === null || typeof event !== 'object') return null
      const target = annotationDomElement(event.target)
      if (target !== null) return target
      if (typeof event.composedPath === 'function') {
        const path = event.composedPath()
        if (Array.isArray(path)) {
          for (const entry of path) {
            const element = annotationDomElement(entry)
            if (element !== null) return element
          }
        }
      }
      return null
    }

    /**
     * Retarget one node inside a Shadow DOM to its host element.
     * @param {Element | null} node - node to retarget.
     * @returns {Element | null} the outermost host element.
     */
    function annotationShadowHost(node) {
      let current = node
      let depth = 0
      while (current !== null && depth < 8) {
        const root = typeof current.getRootNode === 'function' ? current.getRootNode() : null
        if (root !== null && root !== undefined && root !== document
          && root.host !== null && root.host !== undefined && root.host !== document) {
          current = annotationDomElement(root.host)
          depth += 1
          continue
        }
        break
      }
      return current
    }

    /** @returns {{ width: number, height: number }} the current viewport size. */
    function annotationViewport() {
      return {
        width: typeof window.innerWidth === 'number' ? window.innerWidth : 0,
        height: typeof window.innerHeight === 'number' ? window.innerHeight : 0
      }
    }

    /**
     * The layout frame: the element whose padding makes room for the rail.
     * @returns {Element | null} the frame element.
     */
    function annotationLayoutFrame() {
      const overlay = document.querySelector('[data-shell-overlay]')
      if (overlay === null) return null
      const frame = overlay.parentElement
      return frame instanceof HTMLElement ? frame : null
    }

    /**
     * Sum the widths of the native left and right Sidebar columns.
     * @returns {number} total sidebar width in pixels.
     */
    function annotationMeasureSidebarWidths() {
      let total = 0
      for (const selector of ['[class$="_sidebarCol"]', '[class$="_rightbarCol"]']) {
        const column = document.querySelector(selector)
        if (!(column instanceof HTMLElement)) continue
        const rect = column.getBoundingClientRect()
        if (rect.width > 0) total += rect.width
      }
      return total
    }

    /**
     * One element's viewport rectangle, rounded.
     * @param {unknown} element - candidate element.
     * @returns {{ x: number, y: number, width: number, height: number } | null} rectangle.
     */
    function annotationRectOf(element) {
      if (element === null || typeof element !== 'object' || typeof element.getBoundingClientRect !== 'function') return null
      const rect = element.getBoundingClientRect()
      if (rect === null || typeof rect !== 'object') return null
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    }

    /**
     * Whether two rectangles intersect.
     * @param {{ x: number, y: number, width: number, height: number }} left - first rectangle.
     * @param {{ x: number, y: number, width: number, height: number }} right - second rectangle.
     * @returns {boolean} whether they overlap.
     */
    function annotationRectsIntersect(left, right) {
      return left.x < right.x + right.width
        && right.x < left.x + left.width
        && left.y < right.y + right.height
        && right.y < left.y + left.height
    }

    /**
     * Whether one element is rendered and visible.
     * @param {Element | null} element - candidate element.
     * @returns {boolean} whether it has a box and is not hidden.
     */
    function annotationElementVisible(element) {
      if (element === null || typeof element !== 'object') return false
      if (typeof element.getClientRects !== 'function') return false
      if (element.getClientRects().length === 0) return false
      // Zero-area elements have no meaningful target to outline or annotate; the
      // primary picker check rejects them before any fallback path (F13).
      const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
      if (rect === null || rect.width <= 0 || rect.height <= 0) return false
      const style = window.getComputedStyle(element)
      if (style === null || typeof style !== 'object') return true
      return style.visibility !== 'hidden' && style.display !== 'none'
    }

    /**
     * Stable id of one element, empty when it looks generated.
     * @param {Element} element - candidate element.
     * @returns {string} stable id or ''.
     */
    function annotationStableId(element) {
      const rawId = element.getAttribute('id')
      if (rawId === null || rawId.length === 0 || rawId.length > 48) return ''
      // The attribute sanitizer is the single authority for what may be captured;
      // an id is just another safe-named attribute value (F1).
      const id = sanitizeAttributeValue('id', rawId)
      if (id === null || isDynamicValue(id)) return ''
      return id
    }

    /**
     * Semantic role of one element, explicit role handled by the caller.
     * @param {string} tag - lowercase tag name.
     * @param {Element} element - candidate element.
     * @returns {string} role name or ''.
     */
    function annotationRoleOf(tag, element) {
      if (tag === 'button') return 'button'
      if (tag === 'a' && element.hasAttribute('href')) return 'link'
      if (tag === 'input') {
        const type = (element.getAttribute('type') ?? 'text').toLowerCase()
        if (type === 'checkbox') return 'checkbox'
        if (type === 'radio') return 'radio'
        if (type === 'submit' || type === 'button' || type === 'reset') return 'button'
        return 'textbox'
      }
      if (tag === 'select') return 'combobox'
      if (tag === 'textarea') return 'textbox'
      if (/^h[1-6]$/.test(tag)) return 'heading'
      if (tag === 'li') return 'listitem'
      if (element.getAttribute('data-row-key') !== null) return 'row'
      if (tag === 'nav' || tag === 'aside' || tag === 'main' || tag === 'section') return 'region'
      return ''
    }

    /**
     * Component class used in the ElementRef and the popover label.
     * @param {string} tag - lowercase tag name.
     * @param {string} role - derived or explicit role.
     * @param {boolean} isEditable - whether the element is contenteditable.
     * @param {boolean} insideComposer - whether the element is the composer region.
     * @returns {string} component class.
     */
    function annotationComponentOf(tag, role, isEditable, insideComposer) {
      if (isEditable) return 'editable'
      if (insideComposer) return 'region'
      if (role === 'button' || tag === 'button' || role === 'tab') return 'button'
      if (role === 'link' || tag === 'a') return 'link'
      if (role === 'textbox' || role === 'combobox' || role === 'checkbox' || role === 'radio'
        || tag === 'input' || tag === 'select' || tag === 'textarea') return 'input'
      if (role === 'menuitem' || role === 'menuitemcheckbox') return 'menu-item'
      if (role === 'row' || role === 'listitem' || tag === 'li' || tag === 'tr') return 'row'
      if (role === 'region' || tag === 'main' || tag === 'section' || tag === 'nav' || tag === 'aside') return 'region'
      if (role === 'heading' || tag === 'p' || tag === 'pre' || tag === 'code') return 'text'
      return 'container'
    }

    /**
     * Accessible name of one element. Never reads control values or editor content.
     * @param {Element} element - candidate element.
     * @param {string} tag - lowercase tag name.
     * @returns {string} sanitized name.
     */
    function annotationAccessibleName(element, tag) {
      const ariaLabel = element.getAttribute('aria-label')
      if (ariaLabel !== null && ariaLabel.trim().length > 0) return sanitizeText(ariaLabel, 60)
      const labelledBy = element.getAttribute('aria-labelledby')
      if (labelledBy !== null && labelledBy.length > 0) {
        const label = document.getElementById(labelledBy)
        if (label !== null) {
          const text = sanitizeText(label.textContent ?? '', 60)
          if (text.length > 0) return text
        }
      }
      if (tag === 'img') {
        const alt = element.getAttribute('alt')
        if (alt !== null && alt.trim().length > 0) return sanitizeText(alt, 60)
      }
      const wrappingLabel = typeof element.closest === 'function' ? element.closest('label') : null
      if (wrappingLabel !== null && wrappingLabel !== element) {
        const text = sanitizeText(wrappingLabel.textContent ?? '', 60)
        if (text.length > 0) return text
      }
      if (isFormTag(tag)) {
        const placeholder = element.getAttribute('placeholder')
        if (placeholder !== null && placeholder.trim().length > 0) return sanitizeText(placeholder, 60)
        const name = element.getAttribute('name')
        if (name !== null && name.trim().length > 0) return sanitizeText(name, 60)
        return sanitizeText(element.getAttribute('type') ?? tag, 40)
      }
      return ''
    }

    /** Selector of every surface whose content is user input, never page copy. */
    const ANNOTATION_LIVE_INPUT_SURFACE = 'input, textarea, select, [contenteditable], [data-lexical-editor="true"]'

    /**
     * Whether one element is (or contains) a live input surface. Those live values
     * and editor contents are never read, copied, or summarized (F7).
     * @param {Element} element - candidate element.
     * @returns {boolean} whether text collection must be suppressed.
     */
    function annotationHasLiveInputSurface(element) {
      if (element === null || typeof element !== 'object') return false
      if (typeof element.matches === 'function' && element.matches(ANNOTATION_LIVE_INPUT_SURFACE)) return true
      return typeof element.querySelector === 'function'
        && element.querySelector(ANNOTATION_LIVE_INPUT_SURFACE) !== null
    }

    /**
     * Sanitized text summary of one element. Never reads control values and never
     * descends into a native editor or password field.
     * @param {Element} element - candidate element.
     * @param {boolean} isEditable - whether the element is contenteditable.
     * @returns {string} sanitized summary.
     */
    function annotationTextSummary(element, isEditable) {
      if (isEditable) return ''
      if (annotationHasLiveInputSurface(element)) return ''
      const text = typeof element.textContent === 'string' ? element.textContent : ''
      return sanitizeText(text, 80)
    }

    /**
     * Digest of the full sanitized text of one element (F11). Privacy suppression is
     * the same as the text summary: live input surfaces yield '' so a digest can
     * never stand in for their content.
     * @param {Element} element - candidate element.
     * @param {boolean} isEditable - whether the element is contenteditable.
     * @returns {string} eight-hex digest, or ''.
     */
    function annotationTextDigest(element, isEditable) {
      if (isEditable) return ''
      if (annotationHasLiveInputSurface(element)) return ''
      const text = typeof element.textContent === 'string' ? element.textContent : ''
      return textDigest(text)
    }

    /**
     * Relative `tag:nth-of-type(n)` steps from one ancestor down to one element.
     * @param {Element} element - target element.
     * @param {Element} ancestor - ancestor to start from.
     * @returns {Array<{ tag: string, index: number }> | null} steps, or null when the ancestor is not on the path.
     */
    function annotationStructuralSteps(element, ancestor) {
      if (element === null || ancestor === null || element === ancestor) return null
      const steps = []
      let current = element
      let depth = 0
      while (current !== null && current !== ancestor && depth < 8) {
        const tag = typeof current.tagName === 'string' ? current.tagName.toLowerCase() : ''
        if (tag.length === 0) return null
        let index = 1
        let sibling = current.previousElementSibling
        while (sibling !== null) {
          if (sibling.tagName === current.tagName) index += 1
          sibling = sibling.previousElementSibling
        }
        steps.push({ tag, index })
        current = current.parentElement
        depth += 1
      }
      if (current !== ancestor) return null
      steps.reverse()
      return steps
    }

    /**
     * Stable-anchor selector candidates for one element: the nearest stable
     * ancestors (up to three) plus the structural steps to reach the element.
     * @param {Element} element - live element.
     * @returns {Array<{ selector: string, steps: Array<{ tag: string, index: number }> }>} anchors, nearest first.
     */
    function annotationAnchorPaths(element) {
      const anchors = []
      let current = element === null || typeof element !== 'object' ? null : element.parentElement
      let depth = 0
      while (current !== null && current !== undefined && current !== document.body && current !== document.documentElement && depth < 10 && anchors.length < 3) {
        const stable = annotationStableSelectorCandidate(current)
        if (stable !== null) {
          const steps = annotationStructuralSteps(element, current)
          if (steps !== null && steps.length > 0) anchors.push({ selector: stable.selector, steps })
        }
        current = current.parentElement
        depth += 1
      }
      return anchors
    }

    /**
     * Sanitized attribute pairs of one element, shaped for the record normalizer.
     * @param {Element} element - live element.
     * @returns {Array<{ name: string, value: string }>} sanitized pairs.
     */
    function annotationSanitizedAttributes(element) {
      const attrs = []
      if (element === null || typeof element !== 'object' || typeof element.attributes === 'undefined' || element.attributes === null) return attrs
      for (const attribute of Array.from(element.attributes)) {
        const name = sanitizeAttributeName(attribute.name)
        if (name === null) continue
        const value = sanitizeAttributeValue(name, attribute.value)
        if (value === null) continue
        attrs.push({ name, value })
      }
      return attrs
    }

    /**
     * Stable ancestors of one element, nearest first, bounded by the record schema.
     * @param {Element} element - live element.
     * @returns {Array<{ tag: string, attrs: Array<{ name: string, value: string }> }>} ancestor entries.
     */
    function annotationStableAncestorEntries(element) {
      const entries = []
      let current = element === null || typeof element !== 'object' ? null : element.parentElement
      let depth = 0
      while (current !== null && current !== undefined && current !== document.body && current !== document.documentElement && depth < 10 && entries.length < ANNOTATION_MAX_ANCESTORS) {
        const attrs = annotationSanitizedAttributes(current)
        if (attrs.length > 0) entries.push({ tag: current.tagName.toLowerCase(), attrs })
        current = current.parentElement
        depth += 1
      }
      return entries
    }

    /**
     * Build the descriptor consumed by `buildElementRef` from a live element.
     * @param {Element} element - candidate element.
     * @param {boolean} insideComposer - whether the element is the composer region.
     * @returns {object} element descriptor.
     */
    function annotationDescriptorOf(element, insideComposer) {
      const tag = element.tagName.toLowerCase()
      const isEditable = tag !== 'input' && tag !== 'textarea' && tag !== 'select' && element.isContentEditable === true
      const attrs = []
      for (const attribute of Array.from(element.attributes)) {
        const name = sanitizeAttributeName(attribute.name)
        if (name === null) continue
        const value = sanitizeAttributeValue(name, attribute.value)
        if (value === null) continue
        attrs.push({ name, value })
      }
      const role = sanitizeText(element.getAttribute('role') ?? '', 32) || annotationRoleOf(tag, element)
      const pathInfo = annotationTagPath(element)
      const classes = []
      if (typeof element.classList !== 'undefined' && element.classList !== null) {
        for (const className of Array.from(element.classList).slice(0, 8)) {
          if (isDynamicValue(className)) continue
          if (!/^[A-Za-z_][A-Za-z0-9_-]{1,39}$/.test(className)) continue
          if (annotationIsGeneratedClass(className)) continue
          classes.push(className)
          if (classes.length >= 3) break
        }
      }
      // A verified unique selector costs a handful of querySelectorAll calls at
      // select time (never on the pointermove hot path) and is the locator that
      // fixes duplicate-label controls such as `New session` (A2/D11).
      const unique = buildUniqueSelector({
        tag,
        attrs,
        anchorPaths: annotationAnchorPaths(element)
      }, (selector) => document.querySelectorAll(selector))
      const textBearingLeaf = element.childElementCount === 0 && !isEditable
      const xpath = annotationXPathOf(element)
      // A3/T38 (③): non-leaf targets capture the first text leaf descendant's
      // quote/position plus the recorded ancestor chain + stable target signature.
      let textQuote = textBearingLeaf ? annotationTextQuoteOf(element) : null
      let textPosition = textBearingLeaf ? annotationTextPositionOf(element) : null
      let anchorTarget = textBearingLeaf ? 'self' : null
      let anchorLeafTag = null
      let anchorAncestorChain = null
      let anchorSignature = null
      if (!textBearingLeaf && !isEditable) {
        const leaf = annotationFirstTextLeafDescendant(element)
        if (leaf !== null) {
          const leafQuote = annotationTextQuoteOf(leaf)
          if (leafQuote !== null) {
            textQuote = leafQuote
            textPosition = annotationTextPositionOf(leaf)
            anchorTarget = 'descendant'
            anchorLeafTag = typeof leaf.tagName === 'string' ? leaf.tagName.toLowerCase() : null
            anchorAncestorChain = annotationAncestorTagChain(leaf, element)
            const stableAttrs = []
            for (const attr of attrs) {
              if (attr === null || typeof attr !== 'object') continue
              if (typeof attr.name !== 'string') continue
              if (!/^(data-|aria-|role$|id$|name$)/.test(attr.name)) continue
              stableAttrs.push({ name: attr.name, value: attr.value })
              if (stableAttrs.length >= 6) break
            }
            anchorSignature = { tag, attrs: stableAttrs }
          }
        }
      }
      const jsPath = annotationJsPathFor({ selector: unique.selector, xpath })
      return {
        tag,
        id: annotationStableId(element),
        role,
        name: annotationAccessibleName(element, tag),
        attrs,
        text: annotationTextSummary(element, isEditable),
        textDigest: annotationTextDigest(element, isEditable),
        component: annotationComponentOf(tag, role, isEditable, insideComposer === true),
        path: pathInfo.selector,
        tagPath: pathInfo.parts,
        isEditable,
        insideComposer: insideComposer === true,
        uniqueSelector: unique.selector,
        uniqueVerified: unique.verified,
        ancestors: annotationStableAncestorEntries(element),
        classes,
        xpath,
        jsPath,
        textQuote,
        textPosition,
        anchorTarget,
        anchorLeafTag,
        anchorAncestorChain,
        anchorSignature
      }
    }

    /**
     * First node of a candidate chain: text nodes resolve to their parent, our
     * own UI is rejected, and an editable's contents resolve to the composer
     * region (whose internals are never read).
     * @param {unknown} target - event target.
     * @returns {Element | null} the chain's start element.
     */
    function annotationStartNode(target) {
      const shadowHost = annotationShadowHost(annotationDomElement(target))
      const node = shadowHost === null ? annotationDomElement(target) : shadowHost
      if (node === null) return null
      if (typeof node.closest !== 'function') return null
      if (node.closest('[data-psa-own]') !== null) return null
      const editable = node.closest('[data-lexical-editor="true"], [contenteditable="true"]')
      if (editable !== null) {
        const composer = editable.closest('[data-conversation-region="composer"]')
        return composer ?? editable
      }
      return node
    }

    /**
     * Walk the ancestor chain of one target, nearest first.
     * @param {unknown} target - event target.
     * Descriptors are intentionally NOT built here: pointermove walks up to 16
     * ancestors, and each descriptor reads full textContent twice (summary +
     * digest). The chain keeps elements (+ composer membership) only; the
     * descriptor is built lazily for the chosen element and ≤2 context ancestors
     * in `refFromChain`.
     * @returns {Array<{ element: Element, insideComposer: boolean }>} the chain.
     */
    function annotationCandidateChain(target) {
      const start = annotationStartNode(target)
      if (start === null) return []
      const chain = []
      let current = start
      let depth = 0
      while (current !== null && current !== document.body && current !== document.documentElement && depth < 16) {
        const insideComposer = typeof current.closest === 'function' && current.closest('[data-conversation-region="composer"]') !== null
        chain.push({ element: current, insideComposer })
        current = current.parentElement
        depth += 1
      }
      return chain
    }

    /**
     * Whether one chain element is a meaningful candidate.
     * @param {Element} element - chain element.
     * @returns {boolean} whether the picker accepts it.
     */
    function annotationIsCandidate(element) {
      if (element === null || typeof element !== 'object') return false
      const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
      if (tag === '' || tag === 'html' || tag === 'body') return false
      if (typeof element.closest !== 'function') return false
      if (element.closest('[data-psa-own]') !== null) return false
      if (typeof element.matches !== 'function' || !element.matches(ANNOTATION_CANDIDATE_SELECTOR)) return false
      return annotationElementVisible(element)
    }

    /**
     * Computed z-index of one element, as a number, or null when it participates
     * in no explicit stacking layer (`z-index: auto`).
     * @param {Element} element - live element.
     * @returns {number | null} computed z-index.
     */
    function annotationComputedZIndex(element) {
      if (element === null || typeof element !== 'object') return null
      const style = window.getComputedStyle(element)
      if (style === null || typeof style !== 'object') return null
      const raw = style.zIndex
      if (typeof raw !== 'string' || raw.length === 0 || raw === 'auto') return null
      const value = Number.parseInt(raw, 10)
      return Number.isFinite(value) ? value : null
    }

    /**
     * Whether one element is a floating surface box: out of normal flow, with an
     * explicit stacking layer, a real box, and no annotation UI inside it.
     *
     * The test intentionally uses computed style, never hashed DSH class names,
     * so a DSH rebuild cannot silently disable the surface picker. `<svg>` and
     * zero-size decorations are excluded; our own nodes are never targets.
     * @param {Element} element - live element.
     * @returns {boolean} whether the element is a floating box.
     */
    function annotationFloatingBox(element) {
      if (element === null || typeof element !== 'object') return false
      if (typeof element.tagName !== 'string') return false
      const tag = element.tagName.toLowerCase()
      if (tag === 'html' || tag === 'body' || tag === 'svg') return false
      if (typeof element.closest !== 'function') return false
      if (element.closest('[data-psa-own]') !== null) return false
      if (!annotationElementVisible(element)) return false
      const style = window.getComputedStyle(element)
      if (style === null || typeof style !== 'object') return false
      if (style.position !== 'fixed' && style.position !== 'absolute') return false
      const zIndex = annotationComputedZIndex(element)
      return zIndex !== null && zIndex >= ANNOTATION_SURFACE_MIN_Z
    }

    /**
     * DOM accessors used by {@link annotationSurfaceLevels}; injectable so the
     * level algorithm is unit-testable without a browser.
     * @returns {object} accessor set.
     */
    function annotationSurfaceAccess() {
      return {
        descendants: (root) => (typeof root.querySelectorAll === 'function' ? Array.from(root.querySelectorAll('*')) : []),
        isCandidate: (element) => annotationIsCandidate(element),
        isOwn: (element) => typeof element.closest === 'function' && element.closest('[data-psa-own]') !== null,
        visible: (element) => annotationElementVisible(element),
        rectOf: (element) => annotationRectOf(element),
        textOf: (element) => (typeof element.innerText === 'string' ? element.innerText : (element.textContent ?? '')).trim(),
        childCount: (element) => (typeof element.children?.length === 'number' ? element.children.length : 0),
        insideComposer: (element) => typeof element.closest === 'function' && element.closest('[data-conversation-region="composer"]') !== null
      }
    }

    /** Structural tags that are never a pick target; the walk falls through them. */
    const ANNOTATION_INELIGIBLE_TAGS = new Set([
      'html', 'body', 'head', 'script', 'style', 'link', 'meta', 'title', 'template',
      'noscript', 'br', 'wbr', 'base', 'col', 'colgroup'
    ])

    /**
     * Whether one DOM element is a valid LEAF pick target (A3 leaf-first picking).
     *
     * Eligible = a real visible box, not our own annotation UI, and not a
     * structural tag. Everything else (spans, SVGs, paths, buttons, rows, …) is
     * eligible, exactly like a DevTools inspect hit; ineligible nodes are skipped
     * and the ancestor walk continues.
     * @param {unknown} element - element under consideration.
     * @returns {boolean} whether the element can be hovered/selected itself.
     */
    function annotationLeafEligible(element) {
      if (element === null || element === undefined || typeof element !== 'object') return false
      if (typeof element.tagName !== 'string' || typeof element.closest !== 'function') return false
      const tag = element.tagName.toLowerCase()
      if (tag.length === 0 || ANNOTATION_INELIGIBLE_TAGS.has(tag)) return false
      if (element.closest('[data-psa-own]') !== null) return false
      try {
        if (!annotationElementVisible(element)) return false
      } catch {
        return false
      }
      const rect = annotationRectOf(element)
      if (rect === null || rect === undefined) return false
      return rect.width > 0 && rect.height > 0
    }

    // The surface model owns the DOM-free picker algorithms; the browser entry
    // binds its DOM adapters once so an unparameterized call keeps the exact
    // pre-extraction behavior (and an imported module stays inert in tests).
    bindAnnotationSurfaceDefaults({
      floating: annotationFloatingBox,
      access: annotationSurfaceAccess,
      leafEligible: annotationLeafEligible,
      isCandidate: annotationIsCandidate
    })

    /**
     * Resolve one ref to its unique live element.
     * @param {object} ref - ElementRef.
     * @returns {Element | null} the element when exactly one candidate resolves.
     */
    function annotationResolveNode(ref) {
      if (ref === null || typeof ref !== 'object') return null
      const locator = ref.locator
      if (locator === null || typeof locator !== 'object') return null
      return resolveNodeCandidate({
        candidates: locator.candidates,
        expectedTag: locator.tag,
        uniqueSelector: typeof locator.uniqueSelector === 'string' ? locator.uniqueSelector : '',
        queryAll: (selector) => document.querySelectorAll(selector)
      })
    }

    /**
     * Collect marquee candidates intersecting one rectangle. A single bounded
     * query runs at release; nested candidates keep the deepest element.
     * @param {{ x: number, y: number, width: number, height: number }} rect - marquee rectangle.
     * @returns {Element[]} ordered candidates, capped.
     */
    function annotationBoxCandidateElements(rect) {
      if (rect === null || typeof rect !== 'object') return []
      const hits = []
      let nodes
      try {
        // One bounded scan at release, over exactly the click picker's candidates (F15).
        nodes = document.querySelectorAll(ANNOTATION_CANDIDATE_SELECTOR)
      } catch {
        return []
      }
      for (const node of nodes) {
        if (!(node instanceof Element)) continue
        if (node.closest('[data-psa-own]') !== null) continue
        if (!annotationElementVisible(node)) continue
        const box = annotationRectOf(node)
        if (box === null || box.width === 0 || box.height === 0) continue
        if (!annotationRectsIntersect(rect, box)) continue
        hits.push(node)
      }
      const specific = hits.filter((node) => !hits.some((other) => other !== node && node.contains(other)))
      return specific.slice(0, 24)
    }

    /**
     * Localized labels for the two insertion formats.
     * @param {Function} t - namespace-bound translate.
     * @returns {object} insertion labels.
     */
    function annotationInsertLabels(t) {
      return {
        title: t('insert.title'),
        reference: t('insert.reference'),
        session: t('insert.session'),
        noSession: t('insert.noSession'),
        note: t('insert.note'),
        emptyNote: t('insert.emptyNote'),
        batchHeader: t('insert.batchHeader'),
        status: t('insert.status'),
        statusEphemeral: t('insert.statusEphemeral'),
        statusAmbiguous: t('insert.statusAmbiguous'),
        statusChanged: t('insert.statusChanged'),
        skipped: t('insert.skipped'),
        removed: t('insert.removed'),
        removedCount: 0,
        noRemaining: t('insert.noRemaining')
      }
    }

    /**
     * Focus the current Conversation's Lexical editor after an insertion.
     * @returns {void}
     */
    function annotationFocusComposer() {
      const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')
      if (editor instanceof HTMLElement) editor.focus()
    }

    /**
     * Read one localStorage key, tolerating blocked storage.
     * @param {string} key - storage key.
     * @returns {string | null} stored text.
     */
    function annotationReadStorage(key) {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    }

    /**
     * Write one localStorage key, tolerating blocked storage.
     * @param {string} key - storage key.
     * @param {string} value - value to store.
     * @returns {void}
     */
    function annotationWriteStorage(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // Private mode or a hostile embedding: persistence is best effort.
      }
    }

    /**
     * Create the observable annotation store.
     * @param {object} initial - initial snapshot.
     * @returns {{ getSnapshot: Function, subscribe: Function, set: Function }} store.
     */
    function createAnnotationStore(initial) {
      let snapshot = initial
      const listeners = new Set()
      return {
        /** @returns {object} the current snapshot. */
        getSnapshot() {
          return snapshot
        },
        /**
         * Subscribe one listener.
         * @param {Function} listener - change listener.
         * @returns {Function} unsubscribe.
         */
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        /**
         * Replace the snapshot and notify listeners.
         * @param {object} next - next snapshot.
         * @returns {void}
         */
        set(next) {
          snapshot = next
          for (const listener of [...listeners]) {
            try {
              listener()
            } catch {
              // A failing subscriber must not break the controller.
            }
          }
        }
      }
    }

    /**
     * Create the annotation controller singleton.
     *
     * Owns capture-phase event isolation, hover/selection geometry, the marquee,
     * the layout frame, persistence, and Composer insertion. React only renders
     * the snapshot.
     * @param {Function} t - namespace-bound translate.
     * @param {object} ctx - client root context.
     * @returns {object} the controller face used by the React surface.
     */
    function createAnnotationController(t, ctx) {
      let settings = parseStoredSettings(annotationReadStorage(SETTINGS_STORAGE_KEY))
      let railCollapsed = annotationReadStorage(RAIL_STORAGE_KEY) === 'true'
      const viewport = annotationViewport()
      // Records are the feature's data spine: they survive reloads, so the store
      // starts from the validated persisted document instead of an empty list (D1).
      const storedDocument = parseAnnotationStore(annotationReadStorage(ANNOTATION_RECORDS_STORAGE_KEY))
      const storedEntries = storedDocument.entries
      const store = createAnnotationStore({
        state: { ...createAnnotationState(), collection: storedEntries },
        settings: { ...settings },
        launcherPosition: clampLauncherPosition(readLauncherPosition(), viewport, ANNOTATION_LAUNCHER_SIZE),
        launcherDragging: false,
        railWidth: computeRailWidth(viewport.width, railCollapsed, 'status'),
        railCollapsed,
        layoutMode: 'shrink',
        hoverRect: null,
        selectionRects: [],
        boxRect: null,
        popoverPosition: null,
        popoverPinned: false,
        batchPosition: null,
        batchPinned: false,
        flashRefId: null,
        flashRect: null,
        noteEditor: null,
        // A3/T21: composer reference-chip hover preview (transient, never persisted).
        chipPreview: null,
        // A3/T22: the × affordance shown over a hovered annotation reference chip.
        chipAction: null,
        // A3/T29: secondary confirmation before an exit that would clear records.
        exitConfirm: null,

        // A3 Phase 2-A transient UI state (never persisted): page marks derived per
        // geometry frame, the record under the pointer, the floating detail card,
        // and the single-slot undo payload.
        markRects: [],
        markerHoverId: null,
        detailCard: null,
        settingsOpen: false,
        markUndo: null
      })

      /** Installed window listeners, removed on deactivate. */
      const pageListeners = []
      /** Cleanups for temporary gesture listeners; teardown aborts all of them. */
      const activeGestures = new Set()
      /** DOM revision: bumped by body mutations so resolved nodes can be reused safely (R1/R4). */
      let domRevision = 0
      /** Body mutation observer feeding domRevision; disconnected on deactivate/dispose. */
      let domObserver = null
      /** Resolved-node cache: `{ node, rev }` per ref id, reused only at the same revision. */
      const resolvedNodeCache = new Map()
      /** Per-DOM-revision resolution status cache for the mark geometry (keeps scroll frames cheap). */
      const markStatusCache = new Map()
      let markStatusRevision = -1
      /** Hover identity tokens per element. */
      const elementTokens = new WeakMap()
      /** Chain and index of the last picked selection, for level up/down. */
      let lastPick = null
      /** Idle floating-launcher position captured when the mode activates (A3/T19). */
      let idleLauncherPosition = null
      /** Live element identity per selected ref id (A3/T18 leaf-first): the picked
       * chain element itself, so a selected span/svg row and its Parent/Child walk
       * paint their real rects even when an arbitrary ancestor's locator is weak
       * and re-resolution could land on a same-tag lookalike.
       */
      const pickedSelection = new Map()
      /** Pointer gesture in flight. */
      let pointer = null
      /** Last pointer point used for hover resolution. */
      let hoverPoint = null
      /** Hover rAF handle. */
      let hoverFrame = null
      /** F3 debounce: recompute hover/geometry after DOM mutations while the pointer stands still. */
      let hoverRecomputeTimer = null
      /** Geometry rAF handle. */
      let geometryFrame = null
      /** Resize debounce timer. */
      let resizeTimer = null
      /** Frame inline-style observer, the element it watches, and its debounce. */
      let frameObserver = null
      let observedFrame = null
      let frameObserverTimer = null
      /** Inline frame styles captured before the first mode write (F12). */
      let frameSnapshot = null
      /** Timer that drops the frame marker after the reverse transition (F12). */
      let frameRestoreTimer = null
      /** Feedback auto-dismiss timer. */
      let feedbackTimer = null
      /** Re-locate flash timer. */
      let flashTimer = null
      /** Until timestamp for the click that follows a launcher drag. */
      let suppressLauncherClickUntil = 0
      /** Ref id the current popover was placed for. */
      let popoverRefId = null
      /** Real mounted popover size used for clamping; the constant is only the fallback (F14). */
      let popoverMeasuredSize = { width: ANNOTATION_POPOVER_SIZE.width, height: ANNOTATION_POPOVER_SIZE.height }
      /** Measured batch popover size (updated on mount/resize) for viewport clamping. */
      let batchMeasuredSize = { width: ANNOTATION_BATCH_POPOVER_SIZE.width, height: ANNOTATION_BATCH_POPOVER_SIZE.height }
      /** Mounted batch popover root and its pending measurement frame. */
      let batchElement = null
      let batchMeasureFrame = null
      /** Mounted popover element, only used for measurement. */
      let popoverElement = null
      /** Pending popover measurement frame. */
      let popoverMeasureFrame = null
      /** Monotonic hover token. */
      let tokenSeq = 0
      /** F1: inline z-index captured from `[data-shell-overlay]` before raising it. */
      let paintSnapshot = null
      /** Pending records-persistence debounce timer (D1). */
      let persistTimer = null
      /** Last serialized records document, so no-op writes stay no-ops. */
      let persistedRecordsText = null
      /** Hover-intent timer that opens the detail card after the pointer rests on a mark. */
      let markerHoverTimer = null
      /** Grace timer that closes the detail card after the pointer leaves the mark/card union. */
      let detailCloseTimer = null
      /** Single-slot undo expiry timer (5 s from the last delete). */
      let undoExpireTimer = null
      /** Mounted detail card element and its measured size, used for clamping/keep-open. */
      let detailElement = null
      let detailMeasuredSize = { width: ANNOTATION_DETAIL_SIZE.width, height: ANNOTATION_DETAIL_SIZE.height }
      /** Pending detail-card measurement frame. */
      let detailMeasureFrame = null
      /** Composer service faces attached by the dynamic T9 inject (may stay null). */
      let composerConversation = null
      let composerInputTriggers = null

      /**
       * The current snapshot.
       * @returns {object} snapshot.
       */
      function snapshot() {
        return store.getSnapshot()
      }

      /**
       * Whether annotation mode is on.
       * @returns {boolean} whether active.
       */
      function isActive() {
        return snapshot().state.phase !== 'off'
      }

      /**
       * Merge a patch into the snapshot and notify React.
       * @param {Record<string, unknown>} patch - partial snapshot.
       * @returns {void}
       */
      function publish(patch) {
        const current = /** @type {Record<string, unknown>} */ (snapshot())
        let changed = false
        for (const key of Object.keys(patch)) {
          if (patch[key] !== current[key]) {
            changed = true
            break
          }
        }
        if (!changed) return
        store.set({ ...current, ...patch })
      }

      /**
       * Whether an event target sits inside our own surface, which is never blocked.
       * @param {object} event - DOM event.
       * @returns {boolean} whether the target is ours.
       */
      function eventInsideOwn(event) {
        const element = annotationEventElement(event)
        if (element === null || typeof element.closest !== 'function') return false
        return element.closest('[data-psa-own]') !== null
      }

      /**
       * Whether an event target sits inside the composer region. The composer is
       * the destination of every insertion, so it stays natively interactive in
       * the mode: clicking the draft or Send must not be swallowed (otherwise an
       * inserted chip could never be sent).
       * @param {object} event - DOM event.
       * @returns {boolean} whether the target belongs to the composer.
       */
      function eventInsideComposer(event) {
        const element = annotationEventElement(event)
        if (element === null || typeof element.closest !== 'function') return false
        return element.closest('[data-conversation-region="composer"]') !== null
      }

      /**
       * Whether the pass-through modifier is held for one event.
       * @param {object} event - DOM event.
       * @returns {boolean} whether the page keeps native semantics.
       */
      function passThroughEvent(event) {
        return snapshot().state.passThrough || modifierMatches(event, settings.passThroughModifier)
      }

      /**
       * Apply one pass-through state to the reducer and the root cursor marker.
       * @param {boolean} on - whether the page has native mouse semantics.
       * @returns {void}
       */
      function setPassThrough(on) {
        const active = on === true
        if (active) document.documentElement.setAttribute('data-psa-passthrough', 'true')
        else document.documentElement.removeAttribute('data-psa-passthrough')
        dispatch({ type: 'passThrough', on: active })
        if (active) {
          // Native mouse semantics resume: no hover outline, and an in-flight
          // marquee is cancelled instead of selecting on release (F10).
          abortGestures()
          clearHover()
        }
      }

      /**
       * Block one page-level event when the mode owns it.
       * @param {object} event - DOM event.
       * @returns {boolean} whether it was blocked.
       */
      function blockEvent(event) {
        if (!isActive()) return false
        if (eventInsideOwn(event)) return false
        if (eventInsideComposer(event)) return false
        if (passThroughEvent(event)) return false
        event.preventDefault()
        event.stopImmediatePropagation()
        return true
      }

      /**
       * Token identifying one hovered element inside the snapshot.
       * @param {Element} element - hovered element.
       * @returns {string} token.
       */
      function tokenOf(element) {
        const existing = elementTokens.get(element)
        if (existing !== undefined) return existing
        tokenSeq += 1
        const token = `psa-hover-${tokenSeq}`
        elementTokens.set(element, token)
        return token
      }

      /**
       * Build one ref from one drill level, preserving the order/timestamp of the
       * ref it replaces (level up/down must not churn collection identity).
       *
       * The descriptor is built lazily for the chosen element plus at most two
       * context ancestors, so walking the hover chain stays cheap; the v2 capture
       * fields (unique selector, ancestors, session/route identity, surface) are
       * added here at select time, never on the pointermove hot path.
       * @param {{ element: Element, insideComposer: boolean }} level - chosen level.
       * @param {object | null} like - ref being replaced, when any.
       * @param {'page' | 'floating'} [surface] - whether the level is a floating surface.
       * @returns {object} new ElementRef.
       */
      function refForLevel(level, like, surface) {
        const element = level.element
        const bounds = annotationRectOf(element)
        const descriptor = annotationDescriptorOf(element, level.insideComposer)
        // The chain above the chosen element supplies the <=2 context labels and
        // never builds more descriptors than that (F5 performance contract).
        const chain = annotationCandidateChain(element)
        const levelChain = chain.slice(1, 3).map((item) => {
          const ancestor = annotationDescriptorOf(item.element, item.insideComposer)
          return ancestor.name || ancestor.component || ancestor.tag
        })
        const sessionId = annotationBridge.sessionId ?? annotationConversationSessionId()
        const identity = sessionIdentity(sessionId)
        const context = {
          sessionId: identity.sessionId,
          cwd: identity.cwd,
          workspaceLabel: identity.workspaceLabel,
          route: currentRoute(),
          viewport: annotationViewport(),
          surface: surface === 'floating' ? 'floating' : 'page',
          at: like !== null && typeof like === 'object' && typeof like.at === 'number' ? like.at : Date.now(),
          order: like !== null && typeof like === 'object' && typeof like.order === 'number' ? like.order : Date.now() % 1000000,
          bounds,
          levelChain
        }
        const ref = buildElementRef(descriptor, context)
        ref.note = like !== null && typeof like === 'object' && typeof like.note === 'string' ? like.note : ''
        return ref
      }

      /**
       * Drill levels for one pick: an ordinary page pick walks the v1 ancestor
       * chain (Parent = next entry), a floating-surface pick returns the root
       * plus its inner candidates/text rows (Child = next entry). The single
       * `entries`/`index`/`parentStep` shape keeps both directions honest.
       * @param {Array<object>} chain - candidate chain, nearest first.
       * @returns {{ entries: Array<object>, index: number, parentStep: number, surface: 'page' | 'floating' }} pick levels.
       */
      function pickLevels(chain) {
        const entries = Array.isArray(chain) ? chain : []
        if (entries.length === 0) return { entries: [], index: -1, parentStep: 1, surface: 'page' }
        const surface = annotationSurfaceRoot(entries)
        if (surface !== null) {
          // A3 leaf-first: inside a floating surface the chain is cut at the
          // surface root (never escape upward), and the pick is the deepest
          // eligible element under the pointer (span/svg/path included). The
          // whole surface stays reachable through its background/padding hit or
          // by pressing Parent up the full chain.
          const boundary = entries.slice(0, Math.min(surface.index + 1, entries.length))
          return {
            entries: boundary,
            index: annotationLeafPickIndex(boundary),
            parentStep: 1,
            surface: 'floating'
          }
        }
        // Leaf-first everywhere: the page chain is the full ancestor chain and the
        // pick is the deepest eligible element (spans/svg included); Parent walks
        // up element by element towards the page container, Child back down.
        return {
          entries,
          index: annotationLeafPickIndex(entries),
          parentStep: 1,
          surface: 'page'
        }
      }

      /**
       * Build the ref of one lastPick level with its preserved note.
       * @param {object} pick - lastPick shape.
       * @param {object | null} like - ref being replaced, when any.
       * @returns {object} new ElementRef.
       */
      function refFromPick(pick, like) {
        return refForLevel(pick.entries[pick.index], like, pick.surface)
      }

      /**
       * The current Conversation Session identity from the DOM.
       * @returns {string | null} Session id.
       */
      function annotationConversationSessionId() {
        const occurrence = document.querySelector('[data-conversation-session]')
        if (occurrence === null) return null
        const value = occurrence.getAttribute('data-conversation-session')
        return value !== null && value.length > 0 ? value : null
      }

      /**
       * Capture the raised paint layer (F1): remember the shell overlay's own
       * inline z-index value and priority, then raise it above native hover cards
       * (z=100) while staying below native modals (1000) and menus (1100).
       *
       * `!important` is used so a React re-render that rewrites the inline style
       * cannot silently drop the raise; exit restores the captured pair exactly.
       * @returns {void}
       */
      /**
       * A3/T68: keep the annotation rail clear of the native right Sidebar pane.
       * The active document/files pane is identified from the Sidebar's own
       * `data-sidebar-right-tab` markers; the rail's `right` offset becomes the
       * pane's visible width. No pane => offset removed (rail stays at the edge).
       * @returns {void}
       */
      function syncRailDock() {
        let paneRect = null
        const panes = document.querySelectorAll('[data-dockkit-pane][data-dockkit-pane-active="true"]')
        for (const pane of panes) {
          if (!(pane instanceof HTMLElement)) continue
          if (pane.querySelector('[data-sidebar-right-tab]') === null) continue
          const rect = pane.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) continue
          paneRect = { left: rect.left, right: rect.right, width: rect.width }
          break
        }
        const offset = annotationRailRightForPane(paneRect, annotationViewport().width)
        const root = document.documentElement
        if (offset > 0) {
          if (root.style.getPropertyValue('--psa-rail-right') !== `${offset}px`) root.style.setProperty('--psa-rail-right', `${offset}px`)
          if (root.getAttribute('data-psa-rail-offset') !== 'true') root.setAttribute('data-psa-rail-offset', 'true')
        } else {
          if (root.style.getPropertyValue('--psa-rail-right') !== '') root.style.removeProperty('--psa-rail-right')
          if (root.hasAttribute('data-psa-rail-offset')) root.removeAttribute('data-psa-rail-offset')
        }
      }

      /** A3/T68: native right Sidebar pane changes need a rail re-dock without a resize. */
      let railDockObserver = null

      /** @returns {void} */
      function ensureRailDockObserver() {
        if (railDockObserver !== null) return
        railDockObserver = new MutationObserver(() => { syncRailDock() })
        railDockObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-dockkit-pane-active', 'class', 'style']
        })
      }

      /** @returns {void} */
      function disconnectRailDockObserver() {
        if (railDockObserver === null) return
        railDockObserver.disconnect()
        railDockObserver = null
        document.documentElement.style.removeProperty('--psa-rail-right')
        document.documentElement.removeAttribute('data-psa-rail-offset')
      }

      function capturePaintLayer() {
        const overlay = document.querySelector('[data-shell-overlay]')
        if (!(overlay instanceof HTMLElement)) return
        if (paintSnapshot !== null && paintSnapshot.element === overlay) {
          if (overlay.style.getPropertyValue('z-index') !== String(ANNOTATION_PAINT_Z)) {
            overlay.style.setProperty('z-index', String(ANNOTATION_PAINT_Z), 'important')
            document.documentElement.setAttribute(ANNOTATION_RAISED_ATTR, 'true')
          }
          return
        }
        if (paintSnapshot !== null) restorePaintLayer()
        paintSnapshot = {
          element: overlay,
          index: {
            value: overlay.style.getPropertyValue('z-index'),
            priority: overlay.style.getPropertyPriority('z-index')
          }
        }
        overlay.style.setProperty('z-index', String(ANNOTATION_PAINT_Z), 'important')
        document.documentElement.setAttribute(ANNOTATION_RAISED_ATTR, 'true')
      }

      /**
       * Restore the paint layer to the exact captured inline z-index state (F1).
       * @returns {void}
       */
      function restorePaintLayer() {
        document.documentElement.removeAttribute(ANNOTATION_RAISED_ATTR)
        if (paintSnapshot === null) return
        const saved = paintSnapshot
        paintSnapshot = null
        const element = saved.element
        if (element === null || element === undefined || typeof element.style !== 'object') return
        const index = saved.index
        if (index.value === '' && index.priority === '') element.style.removeProperty('z-index')
        else element.style.setProperty('z-index', index.value, index.priority)
      }

      /**
       * Announce mode state for the dynamic-workspaces hover-card pinning (D3).
       * The dependent behavior is owned by that feature; this side only reports
       * state. Dispatched on `document` with bubbling so both document- and
       * window-level listeners observe it.
       * @param {boolean} active - whether annotation mode just turned on/off.
       * @returns {void}
       */
      function announceAnnotationState(active) {
        try {
          document.dispatchEvent(new CustomEvent(ANNOTATION_STATE_EVENT, {
            detail: { active: active === true },
            bubbles: true
          }))
        } catch {
          // Announcement is contract glue; a hostile embedding must not break the mode.
        }
      }

      /**
       * Session identity enrichment for captured records (D6): full `cwd` is
       * persisted (local only), the Workspace label is its basename.
       * @param {string | null} sessionId - Session identity.
       * @returns {{ sessionId: string | null, cwd: string | null, workspaceLabel: string | null }} identity.
       */
      function sessionIdentity(sessionId) {
        const id = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
        if (id === null) return { sessionId: null, cwd: null, workspaceLabel: null }
        // Primary source: the Composer seat's Session-scope bridge. The annotation
        // overlay is not a slot and `ctx.sessions` has no live list face here, so
        // reading the bridge is the only reliable path (F-2).
        if (annotationBridge.sessionId === id && typeof annotationBridge.sessionCwd === 'string' && annotationBridge.sessionCwd.length > 0) {
          return {
            sessionId: id,
            cwd: annotationBridge.sessionCwd,
            workspaceLabel: annotationWorkspaceLabel(annotationBridge.sessionCwd)
          }
        }
        // Fallback for a record captured before the seat mirrored identity, or in
        // an embedding without the seat. An unexpected failure is reported once
        // instead of being swallowed silently.
        let cwd = null
        try {
          const sessions = ctx !== null && typeof ctx === 'object' ? ctx.sessions : null
          const list = sessions !== null && typeof sessions === 'object' ? sessions.list : null
          const listSnapshot = list !== null && typeof list === 'object' && typeof list.getSnapshot === 'function'
            ? list.getSnapshot()
            : null
          const entry = listSnapshot !== null && listSnapshot !== undefined
            && listSnapshot.byId !== null && typeof listSnapshot.byId === 'object'
            ? listSnapshot.byId[id]
            : null
          if (entry !== null && entry !== undefined && typeof entry.cwd === 'string' && entry.cwd.length > 0) cwd = entry.cwd
        } catch (error) {
          if (!annotationIdentityWarned) {
            annotationIdentityWarned = true
            try {
              console.warn('power-suite: annotation Session identity fallback failed', error)
            } catch {
              // Console may be unavailable in a hostile embedding.
            }
          }
        }
        return { sessionId: id, cwd, workspaceLabel: annotationWorkspaceLabel(cwd) }
      }

      /** @returns {string} current SPA route pathname, never query or fragment. */
      function currentRoute() {
        try {
          const location = window.location
          return annotationRoutePath(location !== null && typeof location === 'object' ? location.pathname : '/')
        } catch {
          return '/'
        }
      }

      /**
       * Write the persisted records document now (D1). No-op when nothing changed.
       * @returns {void}
       */
      function flushAnnotationRecords() {
        if (persistTimer !== null) {
          window.clearTimeout(persistTimer)
          persistTimer = null
        }
        let text
        try {
          text = serializeAnnotationStore(snapshot().state.collection, Date.now())
        } catch {
          return
        }
        if (text === persistedRecordsText) return
        persistedRecordsText = text
        annotationWriteStorage(ANNOTATION_RECORDS_STORAGE_KEY, text)
      }

      /**
       * Debounce one records write after a collection mutation (D1: 250 ms).
       * @returns {void}
       */
      function scheduleAnnotationRecordsPersist() {
        if (persistTimer !== null) window.clearTimeout(persistTimer)
        persistTimer = window.setTimeout(() => {
          persistTimer = null
          flushAnnotationRecords()
        }, ANNOTATION_PERSIST_DEBOUNCE_MS)
      }

      /**
       * A3/T32: copy the captured/generated XPath for one selection or record.
       * @param {string} [refId] - record id (defaults to the current selection).
       * @returns {Promise<boolean>} whether the copy succeeded.
       */
      async function copyXPath(refId) {
        return copyAnchorText(refId, 'xpath')
      }

      /**
       * A3/T32: copy the DevTools-style JS path for one selection or record.
       * @param {string} [refId] - record id (defaults to the current selection).
       * @returns {Promise<boolean>} whether the copy succeeded.
       */
      async function copyJsPath(refId) {
        return copyAnchorText(refId, 'jsPath')
      }

      /**
       * A3/T34 (P2): copy the FULL (non-short-circuited) XPath for one record.
       * Full XPath requires a live node; without one the action reports honestly
       * instead of fabricating a path.
       * @param {string} [refId] - record id (defaults to the current selection).
       * @returns {Promise<boolean>} whether the copy succeeded.
       */
      async function copyFullXPath(refId) {
        return copyAnchorText(refId, 'xpath', { full: true })
      }

      /**
       * A3/T32: shared clipboard path for the XPath/JS-path actions.
       * @param {string | undefined} refId - record id or undefined for the selection.
       * @param {'xpath' | 'jsPath'} kind - which anchor to copy.
       * @param {{ full?: boolean }} [options] - `full` requests the full XPath.
       * @returns {Promise<boolean>} whether the copy succeeded.
       */
      async function copyAnchorText(refId, kind, options) {
        const state = snapshot().state
        const detailId = snapshot().detailCard !== null ? snapshot().detailCard.refId : null
        const ref = typeof refId === 'string' && refId.length > 0
          ? state.collection.find((entry) => entry !== null && typeof entry === 'object' && entry.id === refId)
          : (state.selection[0] ?? (detailId === null ? undefined : state.collection.find((entry) => entry !== null && typeof entry === 'object' && entry.id === detailId)))
        const opts = options !== null && typeof options === 'object' ? options : {}
        const full = opts.full === true
        const failKey = full ? 'feedback.copyFullXPathFailed' : (kind === 'xpath' ? 'feedback.copyXPathFailed' : 'feedback.copyJsPathFailed')
        if (ref === undefined || ref === null) {
          feedback(t(failKey), 'error')
          return false
        }
        const locator = ref.locator !== null && typeof ref.locator === 'object' ? ref.locator : {}
        const node = liveNode(ref)
        let liveText = ''
        // A3/T34/T36 (P2): live node first (fresh optimized/full XPath + JS path);
        // the saved anchor is only the fallback and says so honestly.
        if (node !== null) {
          if (full) liveText = annotationFullXPathOf(node)
          else if (kind === 'xpath') liveText = annotationXPathOf(node)
          else liveText = annotationJsPathFor({ selector: typeof locator.uniqueSelector === 'string' ? locator.uniqueSelector : (typeof locator.path === 'string' ? locator.path : null), xpath: annotationXPathOf(node) })
        }
        const storedText = full ? '' : (kind === 'xpath' ? (typeof locator.xpath === 'string' ? locator.xpath : '') : (typeof locator.jsPath === 'string' ? locator.jsPath : ''))
        const decision = annotationCopyAnchorDecision({ liveText, storedText, full })
        const text = decision.text
        const source = decision.source
        if (typeof text !== 'string' || text.length === 0) {
          feedback(t(failKey), 'error')
          return false
        }
        let clipboard = null
        try {
          clipboard = typeof navigator !== 'undefined' && navigator !== null ? navigator.clipboard : null
        } catch {
          clipboard = null
        }
        if (clipboard === null || clipboard === undefined || typeof clipboard.writeText !== 'function') {
          feedback(t(failKey), 'error')
          return false
        }
        try {
          await clipboard.writeText(text)
          if (full) feedback(t('feedback.copyFullXPathSuccess'))
          else if (source === 'saved') feedback(t(kind === 'xpath' ? 'feedback.copyXPathSaved' : 'feedback.copyJsPathSaved'))
          else feedback(t(kind === 'xpath' ? 'feedback.copyXPathSuccess' : 'feedback.copyJsPathSuccess'))
          return true
        } catch {
          feedback(t(failKey), 'error')
          return false
        }
      }

      /**
       * Copy the best locator of one record ("Copy locator", D10) and report the
       * outcome through the feedback toast. Uses the verified unique selector when
       * present, else the best ordered candidate.
       * @param {string} [refId] - collection entry id; omitted means the current selection.
       * @returns {boolean} whether a copy was attempted synchronously.
       */
      function copyLocator(refId) {
        const current = snapshot().state
        const ref = typeof refId === 'string' && refId.length > 0
          ? current.collection.find((entry) => entry.id === refId)
          : current.selection[0]
        if (ref === undefined || ref === null) return false
        const text = annotationLocatorText(ref)
        if (typeof text !== 'string' || text.length === 0) {
          feedback(t('feedback.locatorCopyFailed'), 'error')
          return false
        }
        let clipboard = null
        try {
          clipboard = typeof navigator !== 'undefined' && navigator !== null ? navigator.clipboard : null
        } catch {
          clipboard = null
        }
        if (clipboard === null || clipboard === undefined || typeof clipboard.writeText !== 'function') {
          feedback(t('feedback.locatorCopyFailed'), 'error')
          return false
        }
        try {
          const result = clipboard.writeText(text)
          if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
            result.then(
              () => feedback(t('feedback.locatorCopied')),
              () => feedback(t('feedback.locatorCopyFailed'), 'error')
            )
          } else {
            feedback(t('feedback.locatorCopied'))
          }
          return true
        } catch {
          feedback(t('feedback.locatorCopyFailed'), 'error')
          return false
        }
      }

      /**
       * Start the body mutation observer that feeds the resolved-node revision.
       * Only childList/characterData are observed: an attribute-only change keeps
       * the same node, so it cannot swap the element identity we resolved (R1/R4).
       * @returns {void}
       */
      function ensureDomObserver() {
        if (domObserver !== null) return
        if (typeof MutationObserver !== 'function') return
        if (typeof document === 'undefined' || document.body === null) return
        domObserver = new MutationObserver((mutations) => {
          // A3/T38 (④): own overlay/mark renders must not invalidate page-resolution
          // caches; only host-page mutations bump the DOM revision.
          let ownOnly = true
          for (const record of Array.isArray(mutations) ? mutations : []) {
            let node = record.target
            if (node !== null && node !== undefined && node.nodeType !== 1) node = node.parentElement
            if (node === null || node === undefined || typeof node.closest !== 'function') {
              ownOnly = false
              break
            }
            const isPageRoot = node === document.body || node === document.documentElement
            if (isPageRoot) {
              ownOnly = false
              break
            }
            // Own UI nodes, or the overlay-slot host container that React updates
            // when it inserts/replaces our overlay root, are not page mutations.
            if (node.closest('[data-psa-own]') !== null) continue
            if (typeof node.querySelector === 'function' && node.querySelector('[data-psa-own]') !== null) continue
            ownOnly = false
            break
          }
          if (ownOnly) return
          domRevision += 1
          // F3: a floating card that appears/expands under a stationary pointer has
          // no pointermove to trigger a recompute. Re-resolve after a short debounce
          // so the outline follows the DOM rather than lagging on the old target.
          if (!isActive() || hoverPoint === null || snapshot().state.passThrough) return
          if (hoverRecomputeTimer !== null) window.clearTimeout(hoverRecomputeTimer)
          hoverRecomputeTimer = window.setTimeout(() => {
            hoverRecomputeTimer = null
            if (!isActive() || hoverPoint === null) return
            scheduleHover()
            scheduleGeometry()
          }, 60)
        })
        domObserver.observe(document.body, { childList: true, subtree: true, characterData: true })
      }

      /**
       * Drop the resolved-node cache and stop observing DOM mutations.
       * Called on deactivate, activation rollback, and disposal.
       * @returns {void}
       */
      function clearResolvedNodeCache() {
        resolvedNodeCache.clear()
        markStatusCache.clear()
        fallbackStatusCache.clear()
        fallbackNodeCache.clear()
        markStatusRevision = -1
        domRevision += 1
        if (domObserver !== null) {
          domObserver.disconnect()
          domObserver = null
        }
      }

      /**
       * Resolve one ref's live node.
       *
       * The resolved node is cached together with the DOM revision. A scroll frame
       * reuses it only while no body mutation happened and the node is still
       * connected; any mutation (or a missing node entry) re-runs the unique
       * candidate resolver, so a re-render cannot leave us highlighting the stale
       * first hit a selector happened to match (F3 + R1/R4).
       * @param {object} ref - ElementRef.
       * @returns {Element | null} the unique live element, or null.
       */
      function liveNode(ref) {
        ensureDomObserver()
        const cached = resolvedNodeCache.get(ref.id)
        if (cached !== undefined) {
          if (cached.rev === domRevision) {
            // A null entry is a real "ambiguous/unresolvable at this revision" result;
            // reusing it keeps scroll frames from re-scanning the same ref.
            if (cached.node === null) return null
            if (cached.node.isConnected !== false) return cached.node
          }
          resolvedNodeCache.delete(ref.id)
        }
        const cssNode = annotationResolveNode(ref)
        // A3/T34: when CSS candidates fail, fall back to text quote/position/XPath
        // so page marks/geometry can still draw fallback-resolved records.
        const node = cssNode === null ? fallbackNodeFor(ref) : cssNode
        resolvedNodeCache.set(ref.id, { node, rev: domRevision })
        return node
      }

      /**
       * Re-resolve one ref's status against the live document.
       * @param {object} ref - ElementRef.
       * @returns {'resolved' | 'ambiguous' | 'missing' | 'changed'} status.
       */
      /** A3/T30: the floating surface pinned open while a floating selection is edited. */
      let pinnedSurfaceElement = null
      /** Capture-phase listeners installed by the active surface pin. */
      let pinnedSurfaceListeners = []

      /**
       * The surface root for the current pick: pickLevels cuts a floating hit's
       * chain at the surface root, so the last chain entry is that root.
       * @returns {Element | null} surface root element, or null.
       */
      function pinnedSurfaceCandidate() {
        const state = snapshot()
        if (!annotationSurfacePinEligible(state.state, isActive())) return null
        const pick = lastPick
        if (pick === null || pick.surface !== 'floating') return null
        const entries = Array.isArray(pick.entries) ? pick.entries : []
        if (entries.length === 0) return null
        const root = entries[entries.length - 1] !== null && typeof entries[entries.length - 1] === 'object'
          ? entries[entries.length - 1].element
          : null
        if (root === null || root === undefined || root.isConnected === false) return null
        return root
      }

      /** Detach the capture-phase hover-close suppression listeners. @returns {void} */
      function detachSurfacePinListeners() {
        for (const entry of pinnedSurfaceListeners) window.removeEventListener(entry.type, entry.handler, entry.options)
        pinnedSurfaceListeners = []
      }

      /**
       * Release the pinned surface; optionally emit a synthetic leave so a native
       * hover menu closes naturally once the pin is gone.
       * @param {boolean} [emitLeave] - dispatch mouseout/pointerout on the root.
       * @returns {void}
       */
      function releaseSurfacePin(emitLeave) {
        const root = pinnedSurfaceElement
        pinnedSurfaceElement = null
        detachSurfacePinListeners()
        if (emitLeave !== true || root === null || root === undefined || root.isConnected === false) return
        // If the pointer is still physically over the surface, let the real pointer
        // leave close it later; a synthetic leave here would confuse native hover
        // cards that are still hovered (and can make a reopened card unreachable).
        try {
          if (typeof root.matches === 'function' && root.matches(':hover')) return
        } catch {
          // A throwing matches() keeps the synthetic-close path.
        }
        try {
          root.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: document.body }))
          root.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, cancelable: false, relatedTarget: document.body }))
          root.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, cancelable: true, relatedTarget: document.body, pointerType: 'mouse' }))
          root.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, cancelable: false, relatedTarget: document.body, pointerType: 'mouse' }))
        } catch {
          // Synthetic leave is best effort; releasing the pin is the guarantee.
        }
      }

      /**
       * Keep the current floating surface open while its annotation popover is
       * active. Capture-phase suppression of mouse/pointer leave events scoped to
       * the pinned subtree/ancestors stops React hover menus from closing as the
       * pointer moves into our requirement textarea.
       * @returns {void}
       */
      function syncSurfacePin() {
        const root = pinnedSurfaceCandidate()
        if (root === null) {
          // Selection/popover closed: unpin and let the native hover surface close.
          if (pinnedSurfaceElement !== null) releaseSurfacePin(true)
          return
        }
        if (pinnedSurfaceElement === root) return
        if (pinnedSurfaceElement !== null) releaseSurfacePin(false)
        pinnedSurfaceElement = root
        const handler = (event) => {
          if (pinnedSurfaceElement === null) return
          const target = event !== null && event.target instanceof Element ? event.target : null
          const related = event !== null && event.relatedTarget instanceof Element ? event.relatedTarget : null
          if (!annotationSurfacePinEventMatches(pinnedSurfaceElement, target, related)) return
          // Swallow the close trigger before React/document handlers see it.
          event.stopImmediatePropagation()
          event.stopPropagation()
        }
        for (const type of ['mouseout', 'mouseleave', 'pointerout', 'pointerleave']) {
          window.addEventListener(type, handler, { capture: true, passive: true })
          pinnedSurfaceListeners.push({ type, handler, options: { capture: true, passive: true } })
        }
      }

      /** A3/T34: per-(record, DOM revision) fallback status cache; avoids re-scanning on every geometry render. */
      const fallbackStatusCache = new Map()
      const fallbackNodeCache = new Map()
      /** A3/T38 (④): fallback DOM-scan counter exposed on the root for the E2E probe. */
      let fallbackScanCount = 0
      /** A3/T38 (④): cache-miss resolution count (independent of fallback scan count). */
      let statusResolveCount = 0

      /** Count one fallback DOM scan (querySelectorAll/evaluate/getElementsByTagName etc). @returns {void} */
      function noteFallbackScan() {
        fallbackScanCount += 1
        try {
          document.documentElement.setAttribute('data-psa-fallback-scans', String(fallbackScanCount))
        } catch {
          // The counter is diagnostic only; rendering must not depend on it.
        }
      }

      /**
       * A3/T38 (③): climb a descendant-anchor text hit back to the recorded ancestor.
       * @param {object} ref - captured record.
       * @param {Element} leaf - matched text leaf.
       * @returns {{ target: Element | null, ambiguous?: boolean }} climb result.
       */
      function climbDescendantTarget(ref, leaf) {
        if (ref?.locator?.anchorTarget !== 'descendant') return { target: leaf }
        const matches = []
        let current = leaf !== null && leaf !== undefined ? leaf.parentElement : null
        let depth = 0
        while (current !== null && current !== undefined && current !== document.body && depth < 16) {
          /** @type {Record<string, string>} */
          const attrs = {}
          try {
            for (const attr of Array.from(current.attributes ?? [])) attrs[attr.name] = attr.value
          } catch {
            // Attribute reads are best effort.
          }
          const tag = typeof current.tagName === 'string' ? current.tagName.toLowerCase() : ''
          if (annotationDescendantAncestorMatches(ref, { tag, attrs })) matches.push(current)
          current = current.parentElement
          depth += 1
        }
        if (matches.length === 0) return { target: null }
        if (matches.length > 1) return { target: null, ambiguous: true }
        return { target: matches[0] }
      }

      /**
       * A3/T38 (③): climb + validate a descendant text hit.
       * @param {object} ref - captured record.
       * @param {Element} leaf - matched leaf.
       * @returns {{ status: string, element: Element | null } | null} outcome.
       */
      function resolveDescendantClimb(ref, leaf) {
        const climbed = climbDescendantTarget(ref, leaf)
        if (climbed.ambiguous === true) return { status: 'ambiguous', element: null }
        if (climbed.target === null) return null
        const status = validateFallbackHit(climbed.target, ref, { proximity: true })
        if (status === 'resolved' || status === 'changed') return { status, element: climbed.target }
        return null
      }

      /**
       * A3/T34: resolve one rendered text offset back to the element containing it.
       * @param {Element} container - scope container.
       * @param {number} offset - rendered text offset.
       * @returns {Element | null} containing element.
       */
      function annotationElementAtRenderedOffset(container, offset) {
        if (container === null || typeof container !== 'object' || typeof document === 'undefined') return null
        try {
          const rendered = annotationRenderedTextOf(container, 1200)
          let rawStart = 0
          for (const span of rendered.spans) {
            if (offset < span.start || offset >= span.end) continue
            const jump = offset - span.start
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
            let node = walker.nextNode()
            rawStart = 0
            while (node !== null) {
              const value = node.nodeValue ?? ''
              if (rawStart <= span.rawStart && span.rawStart < rawStart + value.length) {
                const targetRaw = rawStart + jump
                let consumed = 0
                let current = node
                while (current !== null && consumed + (current.nodeValue ?? '').length <= targetRaw) {
                  consumed += (current.nodeValue ?? '').length
                  current = current.nextSibling
                  while (current !== null && current.nodeType !== Node.TEXT_NODE) current = current.nextSibling
                }
                return (current ?? node).parentElement ?? container
              }
              rawStart += value.length
              node = walker.nextNode()
            }
          }
        } catch {
          return null
        }
        return null
      }

      /**
       * A3/T49: whether a captured transient/floating surface is still present.
       * Uses the captured container, the verified selector, and captured stable
       * ancestors (the floating surface root is typically a stable ancestor).
       * @param {object} ref - captured record.
       * @returns {boolean} whether the captured surface still exists/visible.
       */
      function capturedSurfacePresent(ref) {
        const locator = ref?.locator
        if (locator === null || typeof locator !== 'object') return false
        if (locator.ephemeral !== true && locator.surface !== 'floating') return true
        // A3/T49: the captured container is the authoritative surface anchor. If it
        // no longer resolves, the captured transient surface is gone.
        const position = locator.textPosition
        if (position === null || typeof position !== 'object' || typeof position.container !== 'string' || position.container.length === 0) return false
        try {
          const container = document.querySelector(position.container)
          if (container === null || container.isConnected === false || !annotationElementVisible(container)) return false
          // The captured surface must still sit in its captured screen area; a
          // look-alike elsewhere in the document is not the same transient surface.
          const bounds = ref.bounds
          if (bounds !== null && typeof bounds === 'object' && typeof bounds.x === 'number' && typeof bounds.width === 'number') {
            const rect = container.getBoundingClientRect()
            const limit = Math.max(240, Math.max(bounds.width, typeof bounds.height === 'number' ? bounds.height : 0) * 3)
            if (Math.abs(rect.left + rect.width / 2 - (bounds.x + bounds.width / 2)) > limit) return false
            if (Math.abs(rect.top + rect.height / 2 - (bounds.y + (typeof bounds.height === 'number' ? bounds.height / 2 : 0))) > limit) return false
          }
          return true
        } catch {
          return false
        }
      }

      /**
       * A3/T47 (R1-i): strong identity must still resolve to a real element. A stale
       * `uniqueVerified` selector (0 hits / disconnected) does not count as strong.
       * @param {object} ref - captured record.
       * @returns {boolean} whether the record still has strong, live identity.
       */
      function identityStillStrong(ref) {
        if (annotationHasStrongIdentity(ref) !== true) return false
        const locator = ref.locator
        const text = typeof ref.text === 'string' ? ref.text.trim() : ''
        const digest = typeof ref.textDigest === 'string' ? ref.textDigest : ''
        const textStrong = text.length > 0 && digest.length > 0 && digest !== ANNOTATION_EMPTY_TEXT_DIGEST
        const tag = typeof locator.tag === 'string' ? locator.tag.toLowerCase() : ''
        const role = typeof locator.role === 'string' ? locator.role.toLowerCase() : ''
        const name = typeof locator.name === 'string' ? locator.name.trim().toLowerCase() : ''
        const nameStrong = name.length > 0 && name !== tag && name !== role
        if (textStrong || nameStrong) return true
        // Identity relies on the verified unique selector: it must still resolve.
        const selector = typeof locator.uniqueSelector === 'string' ? locator.uniqueSelector : ''
        if (selector.length === 0) return false
        try {
          const hits = document.querySelectorAll(selector)
          return hits.length === 1 && hits[0] !== null && hits[0].isConnected !== false && annotationElementVisible(hits[0])
        } catch {
          return false
        }
      }

      /**
       * A3/T47 (R1-iii): captured-ancestor corroboration for weak/generic CSS hits.
       * @param {object} ref - captured record.
       * @param {Element} element - candidate element.
       * @returns {boolean} whether a recorded stable ancestor is present on the candidate.
       */
      function ancestorCorroborates(ref, element) {
        if (element === null || typeof element !== 'object') return false
        const ancestors = ref?.locator?.ancestors
        if (!Array.isArray(ancestors) || ancestors.length === 0) return false
        let current = element.parentElement
        let depth = 0
        while (current !== null && current !== undefined && depth < 12) {
          const tag = typeof current.tagName === 'string' ? current.tagName.toLowerCase() : ''
          for (const ancestor of ancestors) {
            if (ancestor === null || typeof ancestor !== 'object') continue
            if (typeof ancestor.tag === 'string' && ancestor.tag.toLowerCase() !== tag) continue
            const attrs = ancestor.attrs !== null && typeof ancestor.attrs === 'object' ? ancestor.attrs : null
            if (attrs === null) continue
            let matched = 0
            let total = 0
            for (const [name, value] of Object.entries(attrs)) {
              total += 1
              if (typeof value !== 'string') continue
              if (current.getAttribute(name) === value) matched += 1
            }
            if (total > 0 && matched === total) return true
          }
          current = current.parentElement
          depth += 1
        }
        return false
      }

      /**
       * A3/T47 (R1-ii): Hypothesis-style maybeAssertQuote for structural CSS hits.
       * @param {object} ref - captured record.
       * @param {Element} element - candidate element.
       * @returns {boolean} whether the captured quote asserts on the candidate.
       */
      function quoteAssertsOnElement(ref, element) {
        const quote = ref?.locator?.textQuote
        if (quote === null || typeof quote !== 'object' || typeof quote.exact !== 'string') return false
        if (element === null || typeof element !== 'object') return false
        const candidates = []
        candidates.push(annotationRenderedTextOf(element, 300).text)
        if (element.parentElement !== null) candidates.push(annotationRenderedTextOf(element.parentElement, 400).text)
        for (const text of candidates) {
          // Reference maybeAssertQuote first requires the quote text itself on the
          // candidate; context is corroboration, not a precondition for a range hit.
          if (annotationNormalizeQuoteText(text, 0).includes(quote.exact)) return true
          const matches = annotationScoreQuoteMatches(text, quote, undefined, 1)
          if (matches.length > 0 && matches[0].score >= 0.85) return true
        }
        return false
      }

      /**
       * A3/T34 (W4/W6): validate one fallback hit with tag, digest, accessible name
       * and (optionally) viewport proximity. Never fabricates Resolved.
       * @param {Element} element - candidate.
       * @param {object} ref - captured record.
       * @param {{ proximity?: boolean }} [options] - proximity check for structural hits.
       * @returns {'resolved' | 'changed' | 'missing' | null} status, null = reject/continue.
       */
      function validateFallbackHit(element, ref, options) {
        if (element === null || element === undefined || element.isConnected === false) return 'missing'
        const locator = ref !== null && typeof ref === 'object' && ref.locator !== null && typeof ref.locator === 'object' ? ref.locator : {}
        const expectedTag = typeof locator.tag === 'string' ? locator.tag.toLowerCase() : ''
        const liveTag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
        if (expectedTag.length > 0 && liveTag !== expectedTag) return 'changed'
        const expectedDigest = typeof ref.textDigest === 'string' ? ref.textDigest : ''
        if (expectedDigest.length > 0) {
          const actual = textDigest(typeof element.textContent === 'string' ? element.textContent : '')
          if (actual !== expectedDigest) return 'changed'
        }
        const expectedName = typeof locator.name === 'string' ? locator.name : ''
        const actualName = liveTag.length > 0 ? annotationAccessibleName(element, liveTag) : ''
        if (expectedName.length > 0 && actualName.length > 0 && expectedName !== actualName) return 'changed'
        if (options !== null && typeof options === 'object' && options.proximity === true) {
          try {
            const rect = element.getBoundingClientRect()
            const bounds = ref !== null && typeof ref === 'object' && ref.bounds !== null && typeof ref.bounds === 'object' ? ref.bounds : null
            const viewport = ref !== null && typeof ref === 'object' && ref.viewport !== null && typeof ref.viewport === 'object' ? ref.viewport : null
            if (rect !== null && bounds !== null && typeof bounds.x === 'number' && typeof bounds.y === 'number'
              && typeof bounds.width === 'number' && typeof bounds.height === 'number' && viewport !== null) {
              const viewWidth = typeof viewport.width === 'number' ? viewport.width : 0
              const viewHeight = typeof viewport.height === 'number' ? viewport.height : 0
              const limit = Math.max(320, Math.max(viewWidth, viewHeight) * 0.7)
              const dx = (bounds.x + bounds.width / 2) - (rect.left + rect.width / 2)
              const dy = (bounds.y + bounds.height / 2) - (rect.top + rect.height / 2)
              if (Math.sqrt(dx * dx + dy * dy) > limit) return null
            }
          } catch {
            // Proximity is best effort; tag/name/digest checks still stand.
          }
        }
        // A3/T36 (MAJOR-1): structural hits require real identity; a tag-only match
        // can never be Resolved (it degrades honestly to Changed and is not marked).
        if (options !== null && typeof options === 'object' && options.structural === true) {
          // A3/T47 (R1): structural hit only resolves with live strong identity; a
          // weak/corroborated hit is honestly Changed; otherwise reject/continue.
          if (identityStillStrong(ref)) return 'resolved'
          return ancestorCorroborates(ref, element) ? 'changed' : null
        }
        return 'resolved'
      }

      /**
       * A3/T34: scope containers for text quote search — captured container first,
       * document body as the bounded fallback.
       * @param {object} ref - captured record.
       * @returns {Array<Element>} scopes.
       */
      function quoteSearchScopes(ref) {
        const scopes = []
        const position = ref?.locator?.textPosition ?? null
        if (position !== null && typeof position.container === 'string') {
          try {
            const container = document.querySelector(position.container)
            if (container !== null) scopes.push(container)
          } catch {
            // Ignore malformed stored selectors; body scope still applies.
          }
        }
        if (scopes.length === 0 || scopes[0] !== document.body) scopes.push(document.body)
        return scopes
      }

      /**
       * A3/T34 (W2/W4): score-based quote resolution with bounded approximate
       * matching; returns null to continue the chain, or an honest status.
       * @param {object} ref - captured record.
       * @returns {string | null} status.
       */
      function resolveRefTextQuote(ref) {
        noteFallbackScan()
        const locator = ref !== null && typeof ref === 'object' && ref.locator !== null && typeof ref.locator === 'object' ? ref.locator : null
        if (locator === null || locator.textQuote === null || typeof locator.textQuote !== 'object') return null
        const quote = locator.textQuote
        if (typeof quote.exact !== 'string' || quote.exact.length === 0) return null
        const hint = locator.textPosition !== null && typeof locator.textPosition === 'object' && typeof locator.textPosition.start === 'number'
          ? locator.textPosition.start : undefined
        if (locator.anchorTarget === 'descendant') {
          noteFallbackScan()
          const leafTag = typeof locator.anchorLeafTag === 'string' && locator.anchorLeafTag.length > 0 ? locator.anchorLeafTag : locator.tag
          /**
           * Collect valid climbed targets for one scope only (bounded).
           * @param {Element} scope - scope element.
           * @returns {{ targets: Array<object>, ambiguous: boolean }} valid targets + real ambiguity.
           */
          const collectScopeTargets = (scope) => {
            const targets = []
            let ambiguous = false
            const rendered = annotationRenderedTextOf(scope, 1400)
            const matches = annotationScoreQuoteMatches(rendered.text, quote, hint, 6)
            for (const match of matches) {
              if (match.score < 0.5) continue
              const leaf = annotationElementAtRenderedOffset(scope, match.index)
              if (leaf === null) continue
              const climb = resolveDescendantClimb(ref, leaf)
              if (climb === null) continue
              if (climb.status === 'ambiguous') { ambiguous = true; continue }
              if (climb.element === null) continue
              const status = validateFallbackHit(climb.element, ref, { proximity: true })
              if (status !== 'resolved' && status !== 'changed') continue
              if (!targets.includes(climb.element)) targets.push(climb.element)
            }
            return { targets, ambiguous }
          }
          // 1) Captured scope is authoritative when its selector still resolves.
          const containerSelector = locator.textPosition !== null && typeof locator.textPosition === 'object'
            && typeof locator.textPosition.container === 'string' ? locator.textPosition.container : ''
          let container = null
          if (containerSelector.length > 0) {
            try {
              container = document.querySelector(containerSelector)
            } catch {
              container = null
            }
          }
          if (container !== null) {
            const inScope = collectScopeTargets(container)
            const scoped = annotationScopeAuthorityOutcome({ inScope, fallback: { targets: [], ambiguous: false } })
            if (scoped.ambiguous) return { status: 'ambiguous', terminal: true }
            if (scoped.target !== null) {
              const status = validateFallbackHit(scoped.target, ref, { proximity: true })
              if (status === 'resolved' || status === 'changed') return status
              // The in-scope hit failed validation: treat the scope as empty and use
              // the bounded document fallback (honest re-anchor).
            }
          }
          // 2) Bounded document fallback only when the scope is missing/broken/empty.
          const fallbackTargets = []
          let fallbackAmbiguous = false
          const bodyRendered = annotationRenderedTextOf(document.body, 1400)
          const bodyMatches = annotationScoreQuoteMatches(bodyRendered.text, quote, hint, 6)
          for (const match of bodyMatches) {
            if (match.score < 0.5) continue
            const leaf = annotationElementAtRenderedOffset(document.body, match.index)
            if (leaf === null) continue
            const climb = resolveDescendantClimb(ref, leaf)
            if (climb === null) continue
            if (climb.status === 'ambiguous') { fallbackAmbiguous = true; continue }
            if (climb.element === null) continue
            const status = validateFallbackHit(climb.element, ref, { proximity: true })
            if (status !== 'resolved' && status !== 'changed') continue
            if (!fallbackTargets.includes(climb.element)) fallbackTargets.push(climb.element)
          }
          const elements = document.getElementsByTagName(leafTag.length > 0 ? String(leafTag).toLowerCase() : '*')
          for (let index = 0; index < elements.length && index < ANNOTATION_FALLBACK_SCAN_MAX && fallbackTargets.length <= 32; index += 1) {
            const leaf = elements[index]
            if (leaf === null || typeof leaf !== 'object' || leaf.closest('[data-psa-own]') !== null) continue
            if (annotationRenderedTextOf(leaf, 120).text !== quote.exact) continue
            const climb = resolveDescendantClimb(ref, leaf)
            if (climb === null) continue
            if (climb.status === 'ambiguous') { fallbackAmbiguous = true; continue }
            if (climb.element === null) continue
            const status = validateFallbackHit(climb.element, ref, { proximity: true })
            if (status !== 'resolved' && status !== 'changed') continue
            if (!fallbackTargets.includes(climb.element)) fallbackTargets.push(climb.element)
          }
          const outcome = annotationScopeAuthorityOutcome({ inScope: { targets: [], ambiguous: false }, fallback: { targets: fallbackTargets, ambiguous: fallbackAmbiguous } })
          if (outcome.ambiguous) return { status: 'ambiguous', terminal: true }
          if (outcome.target !== null) {
            const status = validateFallbackHit(outcome.target, ref, { proximity: true })
            if (status === 'resolved' || status === 'changed') return status
          }
          return null
        }
        for (const scope of quoteSearchScopes(ref)) {
          const rendered = annotationRenderedTextOf(scope, 1400)
          if (rendered.text.length === 0) continue
          const matches = annotationScoreQuoteMatches(rendered.text, quote, hint, 8)
          if (matches.length === 0) continue
          const best = matches[0]
          // Ties cannot identify one occurrence -> honest Matches several.
          if (matches.length > 1 && best.score - matches[1].score <= 0.02) return 'ambiguous'
          if (best.score < 0.5) continue
          if (best.score < 0.85) return 'changed'
          const element = annotationElementAtRenderedOffset(scope, best.index)
          if (element === null) continue
          if (locator.anchorTarget === 'descendant') {
            const climb = resolveDescendantClimb(ref, element)
            if (climb === null) continue
            if (climb.status === 'ambiguous') return 'ambiguous'
            return climb.status
          }
          const status = validateFallbackHit(element, ref, { proximity: false })
          if (status === 'resolved' || status === 'changed') return status
          continue
        }
        // Bounded per-element fallback: a scoped container selector may break while
        // the leaf text itself is unchanged (structure reorder). Compare each
        // candidate element's rendered text, count exact matches, and only resolve
        // when exactly one candidate carries the quote.
        const expectedTag = locator.anchorTarget === 'descendant' && typeof locator.anchorLeafTag === 'string' && locator.anchorLeafTag.length > 0
          ? locator.anchorLeafTag
          : (typeof locator.tag === 'string' && locator.tag.length > 0 ? locator.tag.toLowerCase() : '')
        const candidates = []
        const elements = document.getElementsByTagName(expectedTag.length > 0 ? expectedTag : '*')
        let scanned = 0
        for (let index = 0; index < elements.length && scanned < ANNOTATION_FALLBACK_SCAN_MAX && candidates.length <= 32; index += 1) {
          scanned += 1
          const element = elements[index]
          if (element === null || typeof element !== 'object') continue
          if (element.closest('[data-psa-own]') !== null) continue
          const elementText = annotationRenderedTextOf(element, 120).text
          if (elementText.length === 0) continue
          if (elementText === quote.exact) {
            // A3/T36: exact text alone is not identity for duplicate rows — score the
            // captured prefix/suffix against the parent's rendered text and only keep
            // the occurrence whose context matches.
            const parent = element.parentElement
            if (parent === null) continue
            const parentRendered = annotationRenderedTextOf(parent, 300)
            const contextMatches = annotationScoreQuoteMatches(parentRendered.text, quote, undefined, 1)
            if (contextMatches.length === 0 || contextMatches[0].score < 0.85) continue
            const mapped = annotationElementAtRenderedOffset(parent, contextMatches[0].index)
            if (mapped === null) continue
            if (mapped !== element && !element.contains(mapped) && !mapped.contains(element)) continue
            candidates.push(element)
            continue
          }
          const approximate = annotationScoreQuoteMatches(elementText, quote, undefined, 1)
          if (approximate.length > 0 && approximate[0].score >= 0.5) candidates.push(element)
        }
        if (candidates.length === 0) return null
        if (locator.anchorTarget === 'descendant') {
          const targets = []
          let ambiguous = false
          for (const leaf of candidates) {
            const climb = resolveDescendantClimb(ref, leaf)
            if (climb === null) continue
            if (climb.status === 'ambiguous') ambiguous = true
            else if (climb.element !== null && !targets.includes(climb.element)) targets.push(climb.element)
          }
          if (ambiguous || targets.length > 1) return 'ambiguous'
          if (targets.length === 1) {
            const status = validateFallbackHit(targets[0], ref, { proximity: true })
            if (status === 'resolved' || status === 'changed') return status
          }
          return null
        }
        if (candidates.length > 1) return 'ambiguous'
        const status = validateFallbackHit(candidates[0], ref, { proximity: false })
        if (status === 'resolved' || status === 'changed') return status
        return null
      }

      /**
       * A3/T34 (W4/W6): text-position resolution using rendered offsets. Only a
       * unique container slice, validated for tag/name/digest/proximity, resolves.
       * @param {object} ref - captured record.
       * @returns {string | null} status.
       */
      function resolveRefTextPosition(ref) {
        noteFallbackScan()
        const locator = ref !== null && typeof ref === 'object' && ref.locator !== null && typeof ref.locator === 'object' ? ref.locator : null
        if (locator === null || locator.textPosition === null || typeof locator.textPosition !== 'object') return null
        const position = locator.textPosition
        const quote = locator.textQuote !== null && typeof locator.textQuote === 'object' ? locator.textQuote : null
        if (quote === null || typeof quote.exact !== 'string') return null
        let container = null
        try {
          container = document.querySelector(position.container)
        } catch {
          return null
        }
        if (container === null) return null
        const rendered = annotationRenderedTextOf(container, 1200)
        if (rendered.text.length === 0) return null
        const slice = rendered.text.slice(position.start, position.end)
        if (slice !== quote.exact) return 'changed'
        // A slice that occurs more than once cannot identify one occurrence.
        if (rendered.text.indexOf(quote.exact) !== position.start) return null
        const element = annotationElementAtRenderedOffset(container, position.start)
        if (element === null) return null
        if (locator.anchorTarget === 'descendant') {
          const climb = resolveDescendantClimb(ref, element)
          if (climb === null) return null
          if (climb.status === 'ambiguous') return 'ambiguous'
          return validateFallbackHit(climb.element, ref, { proximity: true, structural: true })
        }
        return validateFallbackHit(element, ref, { proximity: true, structural: true })
      }

      /**
       * A3/T34 (W4): XPath is the LAST resort and must pass tag/digest/name +
       * proximity validation (structure-sensitive by nature).
       * @param {object} ref - captured record.
       * @returns {string | null} status or null to continue.
       */
      function resolveRefXPath(ref) {
        noteFallbackScan()
        const xpath = ref !== null && typeof ref === 'object' && ref.locator !== null && typeof ref.locator === 'object' && typeof ref.locator.xpath === 'string'
          ? ref.locator.xpath : ''
        if (xpath.length === 0) return null
        let snapshot = null
        try {
          snapshot = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
        } catch {
          return null
        }
        const elements = []
        for (let index = 0; index < snapshot.snapshotLength; index += 1) {
          const node = snapshot.snapshotItem(index)
          if (node !== null && typeof node === 'object' && typeof node.tagName === 'string') elements.push(node)
        }
        if (elements.length > 1) return 'ambiguous'
        if (elements.length === 0) return null
        return validateFallbackHit(elements[0], ref, { proximity: true, structural: true })
      }

      /**
       * A3/T34: fallback-resolved live node for page marks (quote/position/XPath in
       * that order), cached per DOM revision.
       * @param {object} ref - captured record.
       * @returns {Element | null} node.
       */
      function fallbackNodeFor(ref) {
        const key = annotationFallbackCacheKey(ref?.id, domRevision)
        if (fallbackNodeCache.has(key)) return fallbackNodeCache.get(key)
        let found = null
        try {
          found = resolveRefTextQuoteNode(ref) ?? resolveRefTextPositionNode(ref) ?? resolveRefXPathNode(ref)
        } catch {
          found = null
        }
        // A3/T36 (MINOR-4): same bound as the status cache; never grow per mutation.
        if (fallbackNodeCache.size > ANNOTATION_FALLBACK_SCAN_MAX) fallbackNodeCache.clear()
        fallbackNodeCache.set(key, found)
        return found
      }

      /** Resolve the quote's element for fallback marks. @param {object} ref - record. @returns {Element | null} node. */
      function resolveRefTextQuoteNode(ref) {
        noteFallbackScan()
        const quote = ref?.locator?.textQuote ?? null
        if (quote === null || typeof quote !== 'object' || typeof quote.exact !== 'string') return null
        // A3/T44: mirror the scope-authority decision for the fallback node: when the
        // captured container still resolves, only an in-scope unique target may be
        // used (an in-scope duplicate is terminal -> no live node for copy/marks).
        if (ref?.locator?.anchorTarget === 'descendant') {
          const containerSelector = ref?.locator?.textPosition?.container
          if (typeof containerSelector === 'string' && containerSelector.length > 0) {
            try {
              const container = document.querySelector(containerSelector)
              if (container !== null) {
                const rendered = annotationRenderedTextOf(container, 1400)
                const matches = annotationScoreQuoteMatches(rendered.text, quote, undefined, 6)
                const targets = []
                let ambiguous = false
                for (const match of matches) {
                  if (match.score < 0.5) continue
                  const leaf = annotationElementAtRenderedOffset(container, match.index)
                  if (leaf === null) continue
                  const climb = resolveDescendantClimb(ref, leaf)
                  if (climb === null) continue
                  if (climb.status === 'ambiguous') { ambiguous = true; continue }
                  if (climb.element === null) continue
                  if (!targets.includes(climb.element)) targets.push(climb.element)
                }
                if (ambiguous || targets.length > 1) return null
                if (targets.length === 1) {
                  return validateFallbackHit(targets[0], ref, { proximity: true }) === 'resolved' ? targets[0] : null
                }
              }
            } catch {
              // Fall through to the bounded document fallback.
            }
          }
        }
        for (const scope of quoteSearchScopes(ref)) {
          const rendered = annotationRenderedTextOf(scope, 1400)
          const matches = annotationScoreQuoteMatches(rendered.text, quote, undefined, 2)
          if (matches.length === 0 || matches[0].score < 0.85) continue
          const element = annotationElementAtRenderedOffset(scope, matches[0].index)
          if (ref?.locator?.anchorTarget === 'descendant') {
            const climb = resolveDescendantClimb(ref, element)
            if (climb !== null && climb.status !== 'ambiguous' && climb.element !== null) return climb.element
            continue
          }
          if (validateFallbackHit(element, ref) === 'resolved') return element
        }
        const tag = ref?.locator?.anchorTarget === 'descendant' && typeof ref?.locator?.anchorLeafTag === 'string'
          ? ref.locator.anchorLeafTag
          : (ref?.locator?.tag ?? '')
        const elements = document.getElementsByTagName(tag.length > 0 ? String(tag).toLowerCase() : '*')
        for (let index = 0; index < elements.length && index < ANNOTATION_FALLBACK_SCAN_MAX; index += 1) {
          const element = elements[index]
          if (element === null || typeof element !== 'object' || element.closest('[data-psa-own]') !== null) continue
          if (annotationRenderedTextOf(element, 120).text !== quote.exact) continue
          const parent = element.parentElement
          if (parent === null) continue
          const parentRendered = annotationRenderedTextOf(parent, 300)
          const contextMatches = annotationScoreQuoteMatches(parentRendered.text, quote, undefined, 1)
          if (contextMatches.length === 0 || contextMatches[0].score < 0.85) continue
          const mapped = annotationElementAtRenderedOffset(parent, contextMatches[0].index)
          if (mapped !== element && (mapped === null || (!element.contains(mapped) && !mapped.contains(element)))) continue
          if (ref?.locator?.anchorTarget === 'descendant') {
            const climb = resolveDescendantClimb(ref, element)
            if (climb !== null && climb.status !== 'ambiguous' && climb.element !== null) return climb.element
            continue
          }
          if (validateFallbackHit(element, ref) === 'resolved') return element
        }
        return null
      }

      /** Resolve the text-position element for fallback marks. @param {object} ref - record. @returns {Element | null} node. */
      function resolveRefTextPositionNode(ref) {
        noteFallbackScan()
        const position = ref?.locator?.textPosition ?? null
        const quote = ref?.locator?.textQuote ?? null
        if (position === null || quote === null || typeof quote.exact !== 'string') return null
        try {
          const container = document.querySelector(position.container)
          if (container === null) return null
          const rendered = annotationRenderedTextOf(container, 1200)
          if (rendered.text.slice(position.start, position.end) !== quote.exact) return null
          const element = annotationElementAtRenderedOffset(container, position.start)
          if (ref?.locator?.anchorTarget === 'descendant') {
            const climb = resolveDescendantClimb(ref, element)
            if (climb === null || climb.status === 'ambiguous' || climb.element === null) return null
            return validateFallbackHit(climb.element, ref, { proximity: true, structural: true }) === 'resolved' ? climb.element : null
          }
          return validateFallbackHit(element, ref, { structural: true }) === 'resolved' ? element : null
        } catch {
          return null
        }
      }

      /** Resolve the XPath element for fallback marks. @param {object} ref - record. @returns {Element | null} node. */
      function resolveRefXPathNode(ref) {
        noteFallbackScan()
        const xpath = ref?.locator?.xpath ?? ''
        if (typeof xpath !== 'string' || xpath.length === 0) return null
        try {
          const snapshot = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
          const node = snapshot.singleNodeValue
          return validateFallbackHit(node, ref, { proximity: true, structural: true }) === 'resolved' ? node : null
        } catch {
          return null
        }
      }

      /**
       * A3/T32/T34: resolution outcome with the winning strategy for the UI, cached
       * per (record id, DOM revision).
       * @param {object} ref - captured record.
       * @returns {{ status: string, via: string }} outcome.
       */
      function statusDetailOf(ref) {
        if (ref === null || typeof ref !== 'object' || ref.locator === null || typeof ref.locator !== 'object') return { status: 'missing', via: 'css' }
        // Status cache correctness depends on the DOM revision observer being live.
        ensureDomObserver()
        const cacheKey = annotationFallbackCacheKey(ref.id, domRevision)
        const cached = fallbackStatusCache.get(cacheKey)
        if (cached !== undefined) return cached
        statusResolveCount += 1
        const weakIdentity = identityStillStrong(ref) !== true
        const hasQuote = ref.locator.textQuote !== null && typeof ref.locator.textQuote === 'object'
          && typeof ref.locator.textQuote.exact === 'string' && ref.locator.textQuote.exact.length > 0
        let outcome = annotationResolveStatus({
          weakIdentity,
          assertQuote: hasQuote ? (element) => quoteAssertsOnElement(ref, element) : undefined,
          // A3/T47: corroboration must also require the candidate to be visible — a
          // hidden/cloned same-tag node is not the unmounted original.
          corroborate: (element) => ancestorCorroborates(ref, element) && annotationElementVisible(element),
          candidates: ref.locator.candidates,
          expectedTag: ref.locator.tag,
          uniqueSelector: typeof ref.locator.uniqueSelector === 'string' ? ref.locator.uniqueSelector : '',
          queryAll: (selector) => document.querySelectorAll(selector),
          liveInfo: (element) => {
            const elementText = typeof element.textContent === 'string' ? element.textContent : ''
            const liveTag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
            return {
              isConnected: element.isConnected,
              textContent: elementText,
              expectedText: typeof ref.text === 'string' ? ref.text : '',
              expectedDigest: typeof ref.textDigest === 'string' ? ref.textDigest : '',
              actualDigest: textDigest(elementText),
              expectedName: ref.locator !== null && typeof ref.locator === 'object' && typeof ref.locator.name === 'string' ? ref.locator.name : '',
              actualName: liveTag.length > 0 ? annotationAccessibleName(element, liveTag) : ''
            }
          },
          resolveTextQuote: () => resolveRefTextQuote(ref),
          resolveTextPosition: () => resolveRefTextPosition(ref),
          resolveXPath: () => resolveRefXPath(ref)
        })
        // A3/T38 (③): descendant anchors trust the text layer over a CSS "changed"
        // hit on a look-alike; resolved/ambiguous from the descendant decides.
        if (ref.locator.anchorTarget === 'descendant' && outcome.status === 'changed') {
          const quoteStatus = resolveRefTextQuote(ref)
          if (quoteStatus === 'resolved') outcome = { status: 'resolved', via: 'text-quote' }
          else if (quoteStatus === 'ambiguous') outcome = { status: 'ambiguous', via: 'text-quote' }
        }
        // A3/T47 (R1): no real identity signal (no text, no usable name, no live
        // verified selector) and no quote means the target cannot be verified at all;
        // reference behavior is Missing, never a same-tag promotion.
        if (weakIdentity && hasQuote !== true) outcome = { status: 'missing', via: outcome.via }
        // A3/T47 (R2): transient surfaces only keep honest text-layer outcomes while
        // their captured surface still exists.
        outcome = annotationEphemeralOutcome(ref, outcome, capturedSurfacePresent(ref))
        // A3/T49: conservative controller policy — a transient surface can never be
        // confidently "Changed" (surface presence detection is heuristic); the pure
        // helper still models the still-present Changed branch for callers/tests.
        if ((ref.locator.ephemeral === true || ref.locator.surface === 'floating') && outcome.status === 'changed') {
          outcome = { status: 'missing', via: outcome.via }
        }
        let confidence = annotationStatusConfidence(ref, outcome)
        if (weakIdentity && outcome.status === 'changed' && (outcome.via === 'xpath' || outcome.via === 'text-position')) confidence = 'weak'
        const detail = { ...outcome, confidence }
        if (fallbackStatusCache.size > 400) fallbackStatusCache.clear()
        fallbackStatusCache.set(cacheKey, detail)
        return detail
      }

      /**
       * A3/T38 (④): deterministic test hook — resolve the first current record
       * twice and report scan-counter deltas (first may scan, second must be 0).
       * @returns {object} probe result.
       */
      function debugFallbackScanProbe() {
        const state = snapshot().state
        const ref = state.collection.find((entry) => entry !== null && typeof entry === 'object' && !annotationIsGroup(entry)
          && (entry.session?.sessionId ?? null) === currentSessionId())
        if (ref === undefined) return { ok: false, reason: 'no current record' }
        const before = fallbackScanCount
        const resolvesBefore = statusResolveCount
        statusDetailOf(ref)
        const afterFirst = fallbackScanCount
        const resolvesFirst = statusResolveCount
        const second = statusDetailOf(ref)
        const afterSecond = fallbackScanCount
        const resolvesSecond = statusResolveCount
        return {
          ok: true,
          id: ref.id,
          before,
          firstDelta: afterFirst - before,
          secondDelta: afterSecond - afterFirst,
          resolutionFirstDelta: resolvesFirst - resolvesBefore,
          resolutionSecondDelta: resolvesSecond - resolvesFirst,
          status: second.status,
          confidence: second.confidence ?? 'strong'
        }
      }

      /** Compat status accessor: the four statuses keep their meaning.      /** Compat status accessor: the four statuses keep their meaning. @param {object} ref - record. @returns {string} status. */
      function statusOf(ref) {
        return statusDetailOf(ref).status
      }

      /**
       * The Session the bridge is currently attached to, or null when no composer is
       * mounted (start page, Plugins view, or a seat that has not mounted yet).
       * @returns {string | null} current Session identity.
       */
      function currentSessionId() {
        const sessionId = annotationBridge.sessionId ?? snapshot().state.sessionId
        return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
      }

      /**
       * Whether one ref is already in the collection for its own Session.
       * @param {object} ref - ElementRef.
       * @returns {boolean} whether present.
       */
      function isInCollection(ref) {
        const key = identityKeyOf(ref)
        const sessionId = ref?.session?.sessionId ?? null
        return snapshot().state.collection.some((entry) => !annotationIsGroup(entry)
          && identityKeyOf(entry) === key && (entry?.session?.sessionId ?? null) === sessionId)
      }

      /**
       * Current Session scope of one collection entry.
       * @param {object} ref - ElementRef.
       * @returns {'current' | 'other'} scope.
       */
      function collectionScopeOf(ref) {
        const current = currentSessionId()
        if (current === null) return 'other'
        return ref?.session?.sessionId === current ? 'current' : 'other'
      }

      /**
       * Whether one viewport point falls inside one rectangle.
       * @param {{ x: number, y: number }} point - viewport point.
       * @param {{ x: number, y: number, width: number, height: number }} rect - rectangle.
       * @returns {boolean} whether inside.
       */
      function annotationPointInRect(point, rect) {
        if (point === null || rect === null || typeof point !== 'object' || typeof rect !== 'object') return false
        const x = typeof point.x === 'number' ? point.x : NaN
        const y = typeof point.y === 'number' ? point.y : NaN
        const left = typeof rect.x === 'number' ? rect.x : NaN
        const top = typeof rect.y === 'number' ? rect.y : NaN
        const width = typeof rect.width === 'number' ? rect.width : NaN
        const height = typeof rect.height === 'number' ? rect.height : NaN
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(left) || !Number.isFinite(top)) return false
        return x >= left && x <= left + width && y >= top && y <= top + height
      }

      /**
       * Page marks for the current collection (A3/T6).
       *
       * Only a record of the current Session whose live target resolves (or
       * resolves as changed) is drawn; a missing/ambiguous/other-Session record is
       * never drawn because a mark would point at the wrong element. Geometry is
       * recomputed on the existing geometry frames (scroll/resize/mutations).
       * @param {object} state - annotation state.
       * @returns {Array<object>} mark descriptors `{ id, index, rect, stale, summary, empty }`.
       */
      function markRectsOf(state) {
        const marks = []
        const collection = state !== null && typeof state === 'object' && Array.isArray(state.collection) ? state.collection : []
        // A3/T29: page-mark badges use one ordinal per entry; every item of a group
        // shows the group's single number (#7, #7, …), and the next entry is #8.
        const ordinals = annotationEntryOrdinals(collection)
        const flattened = []
        for (let index = 0; index < collection.length; index += 1) {
          const entry = collection[index]
          if (entry === null || typeof entry !== 'object') continue
          if (annotationIsGroup(entry)) {
            const requirement = typeof entry.requirement === 'string' ? entry.requirement : ''
            for (const item of annotationGroupItems(entry)) flattened.push({ record: { ...item, note: requirement }, ordinal: ordinals[index] })
          } else {
            flattened.push({ record: entry, ordinal: ordinals[index] })
          }
        }
        for (let index = 0; index < flattened.length; index += 1) {
          const entry = flattened[index].record
          if (collectionScopeOf(entry) !== 'current') continue
          if (markStatusRevision !== domRevision) {
            markStatusCache.clear()
            markStatusRevision = domRevision
          }
          let status = markStatusCache.get(entry.id)
          if (status === undefined) {
            status = statusOf(entry)
            markStatusCache.set(entry.id, status)
          }
          if (status !== 'resolved' && status !== 'changed') continue
          const node = liveNode(entry)
          if (node === null) continue
          const rect = annotationRectOf(node)
          if (rect === null || rect.width <= 0 || rect.height <= 0) continue
          const excerpt = annotationMarkerBadgeText(entry.note)
          marks.push({
            id: entry.id,
            index: flattened[index].ordinal,
            rect,
            stale: status === 'changed',
            summary: excerpt.text,
            empty: excerpt.empty
          })
        }
        return marks
      }

      /**
       * The mark under one viewport point, topmost (last drawn) first.
       * @param {{ x: number, y: number }} point - viewport point.
       * @param {Array<object>} marks - current mark descriptors.
       * @returns {object | null} hit mark.
       */
      function findMarkAt(point, marks) {
        const list = Array.isArray(marks) ? marks : []
        for (let index = list.length - 1; index >= 0; index -= 1) {
          const mark = list[index]
          if (mark !== null && typeof mark === 'object' && mark.rect !== null && typeof mark.rect === 'object' && annotationPointInRect(point, mark.rect)) return mark
        }
        return null
      }

      /**
       * The detail card's kept-open rectangle (pointer may enter it).
       * @param {object} current - current snapshot.
       * @returns {{ x: number, y: number, width: number, height: number } | null} card rect.
       */
      function detailCardRect(current) {
        const card = current !== null && typeof current === 'object' ? current.detailCard : null
        if (card === null || typeof card !== 'object') return null
        return {
          x: typeof card.x === 'number' ? card.x : 0,
          y: typeof card.y === 'number' ? card.y : 0,
          width: detailMeasuredSize.width,
          height: detailMeasuredSize.height
        }
      }

      /** Cancel the hover-intent timer that would open the detail card. @returns {void} */
      function cancelMarkerHoverTimer() {
        if (markerHoverTimer !== null) {
          window.clearTimeout(markerHoverTimer)
          markerHoverTimer = null
        }
      }

      /** Cancel the pending detail-card close. @returns {void} */
      function cancelDetailClose() {
        if (detailCloseTimer !== null) {
          window.clearTimeout(detailCloseTimer)
          detailCloseTimer = null
        }
      }

      /** Close the detail card and (by default) drop its marker-hover state. @param {{ keepMarker?: boolean }} [options] - close options. @returns {boolean} whether a card was open. */
      function closeDetailCard(options) {
        const settingsForClose = options !== null && typeof options === 'object' ? options : {}
        cancelDetailClose()
        cancelMarkerHoverTimer()
        const current = snapshot()
        const hadCard = current.detailCard !== null
        if (hadCard) publish({ detailCard: null })
        if (settingsForClose.keepMarker !== true && current.markerHoverId !== null) publish({ markerHoverId: null })
        return hadCard
      }

      /**
       * Open the detail card for one mark at its clamped position (A3/T6).
       * @param {object} mark - mark descriptor from {@link markRectsOf}.
       * @returns {void}
       */
      function openDetailCard(mark) {
        if (!isActive() || mark === null || typeof mark !== 'object') return
        const current = snapshot()
        if (current.state.selection.length > 0) return
        const position = clampDetailCardPosition(mark.rect, detailMeasuredSize, annotationViewport(), current.railWidth)
        cancelDetailClose()
        publish({
          detailCard: {
            refId: mark.id,
            x: position.x,
            y: position.y,
            placement: position.placement,
            mode: 'view'
          }
        })
      }

      /**
       * Arm the hover-intent timer for one mark (120 ms, A3/T6).
       * @param {object} mark - mark descriptor.
       * @returns {void}
       */
      function scheduleMarkerHoverOpen(mark) {
        cancelMarkerHoverTimer()
        if (!isActive()) return
        markerHoverTimer = window.setTimeout(() => {
          markerHoverTimer = null
          if (!isActive()) return
          const current = snapshot()
          if (current.state.selection.length > 0) return
          const fresh = (Array.isArray(current.markRects) ? current.markRects : []).find((item) => item.id === mark.id)
          if (fresh === undefined) return
          openDetailCard(fresh)
        }, ANNOTATION_DETAIL_HOVER_DELAY_MS)
      }

      /**
       * Close the detail card after a 120 ms grace period unless the pointer is on
       * the mark or inside the card (A3/T6 keep-open union).
       * @returns {void}
       */
      function scheduleDetailClose() {
        if (detailCloseTimer !== null) return
        detailCloseTimer = window.setTimeout(() => {
          detailCloseTimer = null
          if (!isActive()) return
          const current = snapshot()
          if (current.detailCard === null) return
          if (hoverPoint !== null && annotationPointInRect(hoverPoint, detailCardRect(current))) return
          if (hoverPoint !== null) {
            const hit = findMarkAt(hoverPoint, current.markRects)
            if (hit !== null && hit.id === current.detailCard.refId) return
          }
          closeDetailCard()
        }, ANNOTATION_DETAIL_CLOSE_DELAY_MS)
      }

      /**
       * Recompute the detail position against its mark (scroll/resize/mutation).
       * @returns {void}
       */
      function reclampDetailCard() {
        const current = snapshot()
        if (current.detailCard === null || typeof current.detailCard !== 'object') return
        const mark = (Array.isArray(current.markRects) ? current.markRects : []).find((item) => item.id === current.detailCard.refId)
        if (mark === undefined) return
        const position = clampDetailCardPosition(mark.rect, detailMeasuredSize, annotationViewport(), current.railWidth)
        if (position.x === current.detailCard.x && position.y === current.detailCard.y) return
        publish({ detailCard: { ...current.detailCard, x: position.x, y: position.y, placement: position.placement } })
      }

      /**
       * Marker-hover detection fed by pointer movement (A3/T6).
       *
       * The mark layer is pointer-transparent, so hit testing is numeric against
       * the per-frame mark rects. A hit arms the 120 ms hover-intent timer; the
       * pointer may then move into the detail card, which keeps it open.
       * @param {{ x: number, y: number } | null} point - current viewport point.
       * @returns {void}
       */
      function updateMarkerHover(point) {
        if (!isActive() || point === null) return
        const current = snapshot()
        if (annotationPointInRect(point, detailCardRect(current))) {
          cancelDetailClose()
          return
        }
        const hit = findMarkAt(point, current.markRects)
        const markerHoverId = hit !== null ? hit.id : null
        if (current.markerHoverId !== markerHoverId) publish({ markerHoverId })
        // The detail card and the popover are mutually exclusive: a draft selection
        // always wins, and a click on the page closes the card before selecting.
        if (current.state.selection.length > 0) {
          if (current.detailCard !== null) closeDetailCard()
          return
        }
        if (hit === null) {
          if (current.detailCard !== null) scheduleDetailClose()
          else cancelMarkerHoverTimer()
          return
        }
        cancelDetailClose()
        if (current.detailCard !== null) {
          if (current.detailCard.refId === hit.id) return
          closeDetailCard({ keepMarker: true })
        }
        scheduleMarkerHoverOpen(hit)
      }

      /** Track the mounted detail card for measurement. @param {Element | null} node - detail card root. @returns {void} */
      function attachDetailNode(node) {
        if (node === null || node === undefined) {
          detachDetailNode()
          return
        }
        if (!(node instanceof HTMLElement) || node === detailElement) return
        detailElement = node
        scheduleDetailMeasure()
      }

      /** Forget the mounted detail card. @returns {void} */
      function detachDetailNode() {
        detailElement = null
        if (detailMeasureFrame !== null) {
          window.cancelAnimationFrame(detailMeasureFrame)
          detailMeasureFrame = null
        }
      }

      /** Measure the detail card and re-clamp once its real size is known. @returns {void} */
      function measureDetailCard() {
        if (detailElement === null || typeof detailElement.getBoundingClientRect !== 'function') return
        const rect = detailElement.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const size = { width: Math.round(rect.width), height: Math.round(rect.height) }
        const changed = size.width !== detailMeasuredSize.width || size.height !== detailMeasuredSize.height
        detailMeasuredSize = size
        if (changed) reclampDetailCard()
      }

      /** Schedule one coalesced detail-card measurement. @returns {void} */
      function scheduleDetailMeasure() {
        if (detailMeasureFrame !== null) return
        detailMeasureFrame = window.requestAnimationFrame(() => {
          detailMeasureFrame = null
          measureDetailCard()
        })
      }

      /**
       * Outline rect for one selected ref: prefer the live element identity captured
       * at pick time (leaf-first selections and their Parent/Child walk), then fall
       * back to locator resolution / captured bounds.
       * @param {object} ref - selected ElementRef.
       * @returns {{ x: number, y: number, width: number, height: number } | null} rect.
       */
      function selectionRectOf(ref) {
        if (ref !== null && typeof ref === 'object') {
          const picked = pickedSelection.get(ref.id)
          if (picked !== undefined && picked !== null && picked.isConnected !== false) {
            const pickedRect = annotationRectOf(picked)
            if (pickedRect !== null) return pickedRect
          }
        }
        const node = liveNode(ref)
        return node !== null ? annotationRectOf(node) : normalizeAnnotationBounds(ref.bounds)
      }

      /**
       * Derive selection/popover geometry for one state.
       * @param {object} state - next state.
       * @param {object} previous - previous snapshot.
       * @returns {object} snapshot patch.
       */
      function deriveGeometry(state, previous) {
        if (state.selection.length === 0 && pickedSelection.size > 0) pickedSelection.clear()
        const selectionRects = []
        for (const ref of state.selection) {
          const rect = selectionRectOf(ref)
          if (rect !== null) selectionRects.push({ id: ref.id, rect })
        }
        let popoverPosition = previous.popoverPosition
        let popoverPinned = previous.popoverPinned
        if (state.phase === 'selected' && state.selection.length === 1) {
          const ref = state.selection[0]
          if (popoverRefId !== ref.id) {
            popoverRefId = ref.id
            popoverPinned = false
            popoverPosition = null
          }
          if (popoverPosition === null || !popoverPinned) {
            const rect = selectionRectOf(ref)
            popoverPosition = rect === null
              ? null
              : clampPopoverPosition(rect, popoverMeasuredSize, annotationViewport(), previous.railWidth)
          }
        } else {
          popoverRefId = null
          popoverPosition = null
          popoverPinned = false
        }
        // A3/T24: the multi-selection batch popover anchors beside the newest
        // selected element and follows the selection while items are added.
        let batchPosition = null
        let batchPinned = false
        if (state.phase === 'multi' && state.selection.length > 1 && selectionRects.length > 0) {
          const previousSelection = previous.state !== null && typeof previous.state === 'object' && Array.isArray(previous.state.selection)
            ? previous.state.selection
            : []
          if (previous.batchPinned === true && previous.batchPosition !== null && previousSelection.length === state.selection.length) {
            batchPinned = true
            batchPosition = clampPopoverPositionToViewport(previous.batchPosition, batchMeasuredSize, annotationViewport(), previous.railWidth)
          } else {
            const anchor = selectionRects[selectionRects.length - 1].rect
            batchPosition = clampPopoverPosition(anchor, batchMeasuredSize, annotationViewport(), previous.railWidth)
          }
        }
        return { selectionRects, popoverPosition, popoverPinned, batchPosition, batchPinned, boxRect: state.box }
      }

      /**
       * Re-clamp a pinned or target-anchored popover with the last measured size.
       * @returns {void}
       */
      function reclampPopoverWithMeasuredSize() {
        const current = snapshot()
        if (current.state.phase !== 'selected' || current.state.selection.length !== 1) return
        const viewport = annotationViewport()
        if (current.popoverPinned && current.popoverPosition !== null) {
          publish({ popoverPosition: clampPopoverPositionToViewport(current.popoverPosition, popoverMeasuredSize, viewport, current.railWidth) })
          return
        }
        const ref = current.state.selection[0]
        const targetRect = selectionRectOf(ref)
        if (targetRect === null) return
        publish({ popoverPosition: clampPopoverPosition(targetRect, popoverMeasuredSize, viewport, current.railWidth) })
      }

      /**
       * Measure the mounted popover and use its real height/width for clamping; a
       * fixed estimate could overflow for a long note or a narrow viewport (F14).
       * @returns {void}
       */
      function measurePopover() {
        if (popoverElement === null || typeof popoverElement.getBoundingClientRect !== 'function') return
        const rect = popoverElement.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const size = { width: Math.round(rect.width), height: Math.round(rect.height) }
        const changed = size.width !== popoverMeasuredSize.width || size.height !== popoverMeasuredSize.height
        popoverMeasuredSize = size
        if (changed) reclampPopoverWithMeasuredSize()
      }

      /** Schedule one coalesced popover measurement. @returns {void} */
      function schedulePopoverMeasure() {
        if (popoverMeasureFrame !== null) return
        popoverMeasureFrame = window.requestAnimationFrame(() => {
          popoverMeasureFrame = null
          measurePopover()
        })
      }

      /**
       * Track the mounted popover element for measurement.
       * @param {Element | null} node - mounted popover root.
       * @returns {void}
       */
      function attachPopoverNode(node) {
        if (!(node instanceof HTMLElement) || node === popoverElement) return
        popoverElement = node
        schedulePopoverMeasure()
      }

      /** Forget the mounted popover element. @returns {void} */
      function detachPopoverNode() {
        popoverElement = null
        if (popoverMeasureFrame !== null) {
          window.cancelAnimationFrame(popoverMeasureFrame)
          popoverMeasureFrame = null
        }
      }

      /** Measure the mounted batch popover so clamping uses its real height. @returns {void} */
      function measureBatchPopover() {
        if (batchElement === null || typeof batchElement.getBoundingClientRect !== 'function') return
        const rect = batchElement.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const size = { width: Math.round(rect.width), height: Math.round(rect.height) }
        const changed = size.width !== batchMeasuredSize.width || size.height !== batchMeasuredSize.height
        batchMeasuredSize = size
        if (!changed) return
        const current = snapshot()
        if (current.batchPinned && current.batchPosition !== null) {
          publish({ batchPosition: clampPopoverPositionToViewport(current.batchPosition, batchMeasuredSize, annotationViewport(), current.railWidth) })
        }
      }

      /** Schedule one coalesced batch-popover measurement. @returns {void} */
      function scheduleBatchMeasure() {
        if (batchMeasureFrame !== null) return
        batchMeasureFrame = window.requestAnimationFrame(() => {
          batchMeasureFrame = null
          measureBatchPopover()
        })
      }

      /**
       * Track the mounted batch popover for measurement.
       * @param {Element | null} node - mounted batch popover root.
       * @returns {void}
       */
      function attachBatchNode(node) {
        if (!(node instanceof HTMLElement) || node === batchElement) return
        batchElement = node
        scheduleBatchMeasure()
      }

      /** Forget the mounted batch popover element. @returns {void} */
      function detachBatchNode() {
        batchElement = null
        if (batchMeasureFrame !== null) {
          window.cancelAnimationFrame(batchMeasureFrame)
          batchMeasureFrame = null
        }
      }

      /**
       * Reduce one action and publish the derived snapshot.
       * @param {object} action - reducer action.
       * @returns {object} next state.
       */
      /** Deferred batch-popover timer (A3/T24): it opens after the user stops adding. */
      let batchOpenTimer = null

      /**
       * Schedule the batch popover after multi-select activity settles, so the
       * popover does not appear between Shift-clicks and steal the pointer.
       * @param {object} nextState - next annotation state.
       * @param {object} previousState - previous annotation state.
       * @returns {void}
       */
      function scheduleBatchPopover(nextState, previousState) {
        if (nextState.selection === previousState.selection && nextState.phase === previousState.phase) return
        if (batchOpenTimer !== null) {
          window.clearTimeout(batchOpenTimer)
          batchOpenTimer = null
        }
        if (nextState.phase === 'multi' && nextState.selection.length > 1 && nextState.batchOpen !== true) {
          batchOpenTimer = window.setTimeout(() => {
            batchOpenTimer = null
            const current = snapshot().state
            if (current.phase === 'multi' && current.selection.length > 1 && current.batchOpen !== true) {
              dispatch({ type: 'batchOpen', open: true })
            }
          }, 800)
        }
      }

      function dispatch(action) {
        const current = snapshot()
        const nextState = reduceAnnotationState(current.state, action)
        if (nextState === current.state) return current.state
        const patch = deriveGeometry(nextState, current)
        store.set({ ...current, state: nextState, ...patch })
        scheduleBatchPopover(nextState, current.state)
        syncSurfacePin()
        if (nextState.view !== current.state.view) updateLayout()
        // D1: every collection mutation schedules one debounced records write.
        if (nextState.collection !== current.state.collection) {
          scheduleAnnotationRecordsPersist()
          // A3/T6: marks are derived from the collection, so a commit/remove/restore
          // must repaint them on the next geometry frame.
          scheduleGeometry()
          const card = snapshot().detailCard
          if (card !== null && !nextState.collection.some((entry) => entry.id === card.refId)) closeDetailCard()
        }
        return nextState
      }

      /**
       * Show one transient feedback message.
       * @param {string} text - localized message.
       * @param {'info' | 'error'} [kind] - severity.
       * @returns {void}
       */
      function feedback(text, kind) {
        if (typeof text !== 'string' || text.length === 0) return
        dispatch({
          type: 'feedback',
          feedback: { kind: kind === 'error' ? 'error' : 'info', text, at: Date.now() }
        })
        if (feedbackTimer !== null) window.clearTimeout(feedbackTimer)
        feedbackTimer = window.setTimeout(() => {
          feedbackTimer = null
          dispatch({ type: 'feedback', feedback: null })
        }, 3200)
      }

      /**
       * Clamp and store the launcher position.
       * @param {{ x: number, y: number }} position - desired position.
       * @returns {void}
       */
      function persistLauncherPosition(position) {
        annotationWriteStorage(LAUNCHER_STORAGE_KEY, JSON.stringify(position))
      }

      /**
       * Read the remembered launcher position.
       * @returns {{ x: number, y: number } | null} remembered position.
       */
      function readLauncherPosition() {
        const raw = annotationReadStorage(LAUNCHER_STORAGE_KEY)
        if (raw === null) return null
        try {
          const parsed = JSON.parse(raw)
          if (parsed === null || typeof parsed !== 'object') return null
          if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null
          return { x: parsed.x, y: parsed.y }
        } catch {
          return null
        }
      }

      /**
       * Recompute rail width, layout mode, and the frame padding.
       * @returns {void}
       */
      function updateLayout() {
        const current = snapshot()
        const size = annotationViewport()
        const railWidth = computeRailWidth(size.width, current.railCollapsed, current.state.view)
        const mode = layoutModeFor(size.width, annotationMeasureSidebarWidths(), railWidth)
        const frame = annotationLayoutFrame()
        if (isActive() && frame !== null) {
          syncRailDock()
          captureFrameInline(frame)
          if (frameRestoreTimer !== null) {
            // Reactivating before the reverse transition finished must keep the marker.
            window.clearTimeout(frameRestoreTimer)
            frameRestoreTimer = null
          }
          if (frame.getAttribute('data-psa-frame') !== 'true') frame.setAttribute('data-psa-frame', 'true')
          if (mode === 'shrink') {
            if (frame.style.paddingRight !== `${railWidth}px`) frame.style.paddingRight = `${railWidth}px`
          } else if (frameSnapshot !== null) {
            // Overlay mode reserves no strip: put the host's own padding back instead
            // of writing '' over it or leaving the shrink padding behind (F12).
            restoreInlineProperty(frame, 'padding-right', frameSnapshot.paddingRight)
          }
          const railProperty = `${railWidth}px`
          if (frame.style.getPropertyValue('--psa-rail-width') !== railProperty) frame.style.setProperty('--psa-rail-width', railProperty)
          observeFrame(frame)
        }
        // The floating launcher only exists while idle; the active mode shows the
        // docked copy inside the rail, so the idle position is left untouched (and
        // persisted only by idle drags).
        const launcherPosition = isActive()
          ? current.launcherPosition
          : clampLauncherPosition(current.launcherPosition, size, ANNOTATION_LAUNCHER_SIZE)
        const patch = { railWidth, layoutMode: mode, launcherPosition }
        if (current.state.phase === 'multi' && current.batchPosition !== null && current.selectionRects.length > 0) {
          if (current.batchPinned) {
            patch.batchPosition = clampPopoverPositionToViewport(current.batchPosition, batchMeasuredSize, size, railWidth)
          } else {
            const anchor = current.selectionRects[current.selectionRects.length - 1].rect
            patch.batchPosition = clampPopoverPosition(anchor, batchMeasuredSize, size, railWidth)
          }
        }
        if (current.state.phase === 'selected' && current.selectionRects.length > 0 && current.popoverPosition !== null) {
          if (current.popoverPinned) {
            // A dragged/pinned popover keeps its offset but must stay on-screen.
            patch.popoverPosition = clampPopoverPositionToViewport(current.popoverPosition, popoverMeasuredSize, size, railWidth)
          } else {
            const ref = current.state.selection[0]
            const rect = ref === undefined ? null : selectionRectOf(ref)
            if (rect !== null) patch.popoverPosition = clampPopoverPosition(rect, popoverMeasuredSize, size, railWidth)
          }
        }
        publish(patch)
        persistLauncherPositionIfNeeded(launcherPosition, current.launcherPosition)
      }

      /**
       * Persist a clamped launcher position when resize moved it.
       * @param {{ x: number, y: number }} next - clamped position.
       * @param {{ x: number, y: number }} previous - previous position.
       * @returns {void}
       */
      function persistLauncherPositionIfNeeded(next, previous) {
        if (next.x === previous.x && next.y === previous.y) return
        persistLauncherPosition(next)
      }

      /**
       * Observe the frame's inline style so opening/closing native sidebars
       * re-evaluates the layout mode.
       * @param {Element} frame - layout frame.
       * @returns {void}
       */
      function observeFrame(frame) {
        if (frameObserver !== null && observedFrame === frame) return
        if (frameObserver !== null) {
          frameObserver.disconnect()
          frameObserver = null
        }
        observedFrame = frame
        if (typeof MutationObserver !== 'function') return
        frameObserver = new MutationObserver(() => {
          if (frameObserverTimer !== null) window.clearTimeout(frameObserverTimer)
          frameObserverTimer = window.setTimeout(() => {
            frameObserverTimer = null
            if (!isActive()) return
            updateLayout()
          }, 140)
        })
        frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'class'] })
      }

      /** Stop observing the frame. @returns {void} */
      function disconnectFrameObserver() {
        if (frameObserverTimer !== null) {
          window.clearTimeout(frameObserverTimer)
          frameObserverTimer = null
        }
        if (frameObserver !== null) {
          frameObserver.disconnect()
          frameObserver = null
        }
        observedFrame = null
      }

      /**
       * Register one temporary gesture cleanup so teardown can abort it.
       * @param {(aborted: boolean) => void} cleanup - removes listeners and settles the gesture.
       * @returns {Function} unregister handle.
       */
      function trackGesture(cleanup) {
        activeGestures.add(cleanup)
        return () => {
          activeGestures.delete(cleanup)
        }
      }

      /**
       * Abort every in-flight gesture (launcher drag, popover drag, marquee) without
       * changing the mode or persisting a half-finished interaction.
       * @returns {void}
       */
      function abortGestures() {
        for (const cleanup of [...activeGestures]) {
          try {
            cleanup(true)
          } catch {
            // One broken gesture must not block the remaining cleanups.
          }
        }
        activeGestures.clear()
        pointer = null
        publish({ launcherDragging: false })
        if (snapshot().state.box !== null || snapshot().boxRect !== null) {
          publish({ boxRect: null })
          dispatch({ type: 'box', box: null })
        }
      }

      /**
       * Cancel a pending hover computation and clear the hover highlight.
       * @returns {void}
       */
      function clearHover() {
        if (hoverFrame !== null) {
          window.cancelAnimationFrame(hoverFrame)
          hoverFrame = null
        }
        hoverPoint = null
        if (snapshot().state.hoverId !== null || snapshot().hoverRect !== null) {
          publish({ hoverRect: null })
          dispatch({ type: 'hover', targetId: null })
        }
      }

      /**
       * Schedule one coalesced hover resolution.
       * @returns {void}
       */
      function scheduleHover() {
        if (hoverFrame !== null) return
        hoverFrame = window.requestAnimationFrame(() => {
          hoverFrame = null
          resolveHover()
        })
      }

      /**
       * Resolve the element under the last pointer point and publish its outline.
       * @returns {void}
       */
      function resolveHover() {
        if (!isActive() || hoverPoint === null) return
        if (snapshot().state.passThrough) {
          clearHover()
          return
        }
        const element = document.elementFromPoint(hoverPoint.x, hoverPoint.y)
        if (element === null) {
          clearHover()
          return
        }
        if (element.closest('[data-psa-own]') !== null) {
          clearHover()
          return
        }
        const chain = annotationCandidateChain(element)
        // Hover shares the click pick table: inside a floating surface that means
        // the deepest meaningful inner element under the pointer (A3/T16), while a
        // background/padding hit keeps the whole surface.
        const levels = pickLevels(chain)
        if (levels.index < 0 || levels.index >= levels.entries.length) {
          clearHover()
          return
        }
        const candidate = levels.entries[levels.index].element
        const token = tokenOf(candidate)
        const rect = annotationRectOf(candidate)
        if (snapshot().state.hoverId !== token) dispatch({ type: 'hover', targetId: token })
        publish({ hoverRect: rect })
      }

      /**
       * Schedule one coalesced selection-outline refresh.
       * @returns {void}
       */
      function scheduleGeometry() {
        if (geometryFrame !== null) return
        geometryFrame = window.requestAnimationFrame(() => {
          geometryFrame = null
          const current = snapshot()
          if (!isActive()) return
          const patch = { selectionRects: [] }
          const rects = []
          for (const ref of current.state.selection) {
            const rect = selectionRectOf(ref)
            if (rect !== null) rects.push({ id: ref.id, rect })
          }
          patch.selectionRects = rects
          // A3/T6: page marks are derived on the same rAF as the other geometry, so
          // scroll/resize/DOM-mutation frames keep them glued to their elements.
          patch.markRects = markRectsOf(current.state)
          if (current.detailCard !== null) {
            const cardMark = patch.markRects.find((mark) => mark.id === current.detailCard.refId)
            const nextHover = current.markerHoverId !== null && patch.markRects.some((mark) => mark.id === current.markerHoverId)
              ? current.markerHoverId
              : null
            if (nextHover !== current.markerHoverId) patch.markerHoverId = nextHover
            if (cardMark === undefined) {
              // The target stopped resolving (or moved out of the current Session):
              // a card pointing at a missing element is worse than no card.
              patch.detailCard = null
              cancelDetailClose()
            } else {
              const position = clampDetailCardPosition(cardMark.rect, detailMeasuredSize, annotationViewport(), current.railWidth)
              if (position.x !== current.detailCard.x || position.y !== current.detailCard.y) {
                patch.detailCard = { ...current.detailCard, x: position.x, y: position.y, placement: position.placement }
              }
            }
          }
          if (current.flashRefId !== null) {
            const flashRef = current.state.collection.find((entry) => entry.id === current.flashRefId)
            const flashNode = flashRef === undefined ? null : liveNode(flashRef)
            patch.flashRect = flashNode !== null ? annotationRectOf(flashNode) : null
          }
          if (current.popoverPosition !== null && current.popoverPinned === false && current.state.phase === 'selected') {
            const ref = current.state.selection[0]
            const rect = ref === undefined ? null : selectionRectOf(ref)
            if (rect !== null) patch.popoverPosition = clampPopoverPosition(rect, popoverMeasuredSize, annotationViewport(), current.railWidth)
          }
          publish(patch)
        })
      }

      /**
       * Handle one left-button pointer press on the page.
       * @param {PointerEvent} event - pointerdown.
       * @returns {void}
       */
      function onPointerDown(event) {
        if (!isActive()) return
        if (eventInsideOwn(event)) return
        if (passThroughEvent(event)) {
          clearHover()
          return
        }
        if (!blockEvent(event)) return
        // A3/T6: a page press dismisses the hover card before the click selection.
        closeDetailCard()
        if (event.button !== 0) {
          pointer = null
          return
        }
        pointer = {
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          boxMode: modifierMatches(event, settings.multiModifier),
          pointerId: event.pointerId
        }
        lastPick = null
        clearHover()
      }

      /**
       * Handle pointer movement: marquee growth, hover resolution, click slop.
       * @param {PointerEvent} event - pointermove.
       * @returns {void}
       */
      function onPointerMove(event) {
        if (!isActive()) return
        if (pointer !== null) {
          const dx = event.clientX - pointer.startX
          const dy = event.clientY - pointer.startY
          if (!pointer.moved && Math.hypot(dx, dy) > 4) pointer.moved = true
          if (pointer.boxMode) {
            if (pointer.moved) {
              const box = {
                x: Math.round(Math.min(pointer.startX, event.clientX)),
                y: Math.round(Math.min(pointer.startY, event.clientY)),
                width: Math.round(Math.abs(event.clientX - pointer.startX)),
                height: Math.round(Math.abs(event.clientY - pointer.startY))
              }
              if (snapshot().state.box === null) dispatch({ type: 'box', box })
              publish({ boxRect: box })
            }
            return
          }
        }
        if (passThroughEvent(event)) {
          clearHover()
          return
        }
        if (eventInsideOwn(event)) {
          // The pointer may sit on our own detail card: that keeps it open. Any
          // other own-surface hit (rail/popover) dismisses it via the no-hit path.
          updateMarkerHover({ x: event.clientX, y: event.clientY })
          clearHover()
          return
        }
        if (eventInsideComposer(event)) {
          // The composer is interactive, not a page target: no hover outline.
          clearHover()
          return
        }
        hoverPoint = { x: event.clientX, y: event.clientY }
        scheduleHover()
        updateMarkerHover(hoverPoint)
      }

      /**
       * Handle pointer release: click selection, modifier toggle, or marquee finish.
       * @param {PointerEvent} event - pointerup.
       * @returns {void}
       */
      function onPointerUp(event) {
        if (!isActive()) {
          pointer = null
          return
        }
        const gesture = pointer
        pointer = null
        if (gesture === null) return
        if (gesture.boxMode && gesture.moved) {
          if (!eventInsideOwn(event)) blockEvent(event)
          finishMarquee(event)
          return
        }
        if (eventInsideOwn(event)) return
        if (passThroughEvent(event)) {
          publish({ boxRect: null })
          dispatch({ type: 'box', box: null })
          return
        }
        if (!blockEvent(event)) return
        if (gesture.boxMode) {
          toggleSelectionAt(event)
          return
        }
        if (gesture.moved) return
        selectAt(event)
      }

      /**
       * One plain click: pick a candidate and open its popover.
       * @param {object} event - pointer event.
       * @returns {void}
       */
      function selectAt(event) {
        const element = annotationEventElement(event)
        if (element === null) return
        const chain = annotationCandidateChain(element)
        const levels = pickLevels(chain)
        if (levels.index < 0) return
        const ref = refFromPick(levels, null)
        lastPick = levels
        pickedSelection.clear()
        pickedSelection.set(ref.id, levels.entries[levels.index].element)
        dispatch({ type: 'selectSingle', ref })
      }

      /**
       * One modifier click: toggle the clicked candidate in the selection.
       * @param {object} event - pointer event.
       * @returns {void}
       */
      function toggleSelectionAt(event) {
        const element = annotationEventElement(event)
        if (element === null) return
        const chain = annotationCandidateChain(element)
        const levels = pickLevels(chain)
        if (levels.index < 0) return
        const state = snapshot().state
        const existing = state.selection.find((item) => identityKeyOf(item) === identityKeyOf(refFromPick(levels, null)))
        const like = existing !== undefined ? { ...existing, note: state.note } : null
        const ref = refFromPick(levels, like)
        lastPick = levels
        pickedSelection.set(ref.id, levels.entries[levels.index].element)
        dispatch({ type: 'toggleMulti', ref })
      }

      /**
       * Finish a marquee: collect intersecting candidates into the selection.
       * @param {object} event - pointer event that released the box.
       * @returns {void}
       */
      function finishMarquee(event) {
        const box = snapshot().boxRect
        publish({ boxRect: null })
        dispatch({ type: 'box', box: null })
        if (box === null || box.width < 4 || box.height < 4) return
        const elements = annotationBoxCandidateElements(box)
        const refs = []
        const seen = new Set()
        for (const element of elements) {
          const chain = annotationCandidateChain(element)
          const levels = pickLevels(chain)
          if (levels.index < 0) continue
          const ref = refFromPick(levels, null)
          const key = identityKeyOf(ref)
          if (seen.has(key)) continue
          seen.add(key)
            refs.push(ref)
        }
        if (refs.length === 0) return
        dispatch({ type: 'setMulti', refs })
      }

      /**
       * Handle a wheel event: the page keeps its native scrolling; only highlights
       * are refreshed.
       * @returns {void}
       */
      function onWheel() {
        if (isActive()) scheduleGeometry()
      }

      /**
       * Handle window scroll: refresh highlight geometry once per frame.
       * @returns {void}
       */
      function onScroll() {
        if (isActive()) scheduleGeometry()
      }

      /**
       * Handle window resize with a trailing debounce. Runs for the whole
       * plugin lifetime: the launcher must stay clamped inside the viewport even
       * when the mode is off (the rail/layout work only applies while active).
       * @returns {void}
       */
      function onInstalledResize() {
        if (resizeTimer !== null) window.clearTimeout(resizeTimer)
        resizeTimer = window.setTimeout(() => {
          resizeTimer = null
          const current = snapshot()
          if (!isActive()) {
            const launcherPosition = clampLauncherPosition(current.launcherPosition, annotationViewport(), ANNOTATION_LAUNCHER_SIZE)
            if (launcherPosition.x !== current.launcherPosition.x || launcherPosition.y !== current.launcherPosition.y) {
              publish({ launcherPosition })
              persistLauncherPosition(launcherPosition)
            }
          }
          if (!isActive()) return
          updateLayout()
          scheduleGeometry()
        }, 120)
      }

      /**
       * Track the pass-through modifier while active and consume Esc.
       * @param {KeyboardEvent} event - keydown.
       * @returns {void}
       */
      function onKeyDown(event) {
        if (!isActive()) return
        if (event.isComposing === true) return
        if (event.key === 'Escape' && snapshot().chipPreview !== null) {
          // The transient chip tooltip closes first: Esc must not also clear the
          // selection, close the popover, or leave the mode in the same keypress.
          event.preventDefault()
          event.stopPropagation()
          hideChipPreview()
          hideChipAction()
          return
        }
        const wantPassThrough = modifierMatches(event, settings.passThroughModifier)
        if (snapshot().state.passThrough !== wantPassThrough) setPassThrough(wantPassThrough)
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          escapeOne()
          return
        }
        // All other keys keep their native behavior, including browser shortcuts.
      }

      /**
       * Refresh pass-through state when a modifier key is released.
       * @param {KeyboardEvent} event - keyup.
       * @returns {void}
       */
      function onKeyUp(event) {
        if (!isActive()) return
        const wantPassThrough = modifierMatches(event, settings.passThroughModifier)
        if (snapshot().state.passThrough !== wantPassThrough) setPassThrough(wantPassThrough)
      }

      /**
       * Reset transient modifier and gesture state when focus leaves the window.
       * @returns {void}
       */
      function onWindowBlur() {
        if (!isActive()) return
        if (snapshot().state.passThrough) setPassThrough(false)
        abortGestures()
        clearHover()
      }

      /**
       * Cancel an in-flight page gesture without selecting anything.
       * @returns {void}
       */
      function onPointerCancel() {
        pointer = null
        if (isActive() && (snapshot().state.box !== null || snapshot().boxRect !== null)) {
          publish({ boxRect: null })
          dispatch({ type: 'box', box: null })
        }
        clearHover()
      }

      /**
       * Drop transient state when the page is hidden.
       * @returns {void}
       */
      function onVisibilityChange() {
        if (document.visibilityState === 'hidden') {
          // D1: a hidden tab is the last reliable moment to persist records.
          flushAnnotationRecords()
          if (!isActive()) return
          if (snapshot().state.passThrough) setPassThrough(false)
          clearHover()
        }
      }

      /**
       * Step out one level: expanded note editor, then selection, then rail view,
       * then mode off.
       * @returns {void}
       */
      function escapeOne() {
        const current = snapshot()
        const state = current.state
        if (state.phase === 'off') return
        // A3/T51: the settings popover is a transient surface; Esc closes it first.
        if (current.settingsOpen === true) {
          closeSettingsOpen()
          return
        }
        if (current.exitConfirm !== null) {
          cancelExitConfirm()
          return
        }
        // A3/T6: the hover detail card is the first Esc rung (it was opened last).
        if (current.detailCard !== null) {
          closeDetailCard()
          return
        }
        if (current.noteEditor !== null) {
          closeNoteEditor()
          return
        }
        if (state.box !== null) {
          publish({ boxRect: null })
          dispatch({ type: 'box', box: null })
          return
        }
        if (state.editing) {
          dispatch({ type: 'endEdit' })
          return
        }
        if (state.selection.length > 0) {
          dispatch({ type: 'exitOne' })
          return
        }
        // A3/T26: the managed list is the root body; only settings has a rung above
        // it, and the next Esc from the list leaves the mode (asking first when
        // records exist — A3/T29).
        if (state.view === 'settings') {
          dispatch({ type: 'exitOne' })
          return
        }
        requestExit()
      }

      /**
       * Install the capture-phase window listeners exactly once.
       * @returns {void}
       */
      function installPageListeners() {
        if (pageListeners.length > 0) return
        /** @param {string} type - event type. @param {Function} handler - listener. @param {object} options - addEventListener options. @returns {void} */
        const listen = (type, handler, options) => {
          window.addEventListener(type, handler, options)
          pageListeners.push({ type, handler, options })
        }
        listen('pointerdown', onPointerDown, { capture: true, passive: false })
        listen('pointerup', onPointerUp, { capture: true, passive: false })
        listen('mousedown', blockEvent, { capture: true, passive: false })
        listen('pointerup', blockEvent, { capture: true, passive: false })
        listen('mouseup', blockEvent, { capture: true, passive: false })
        listen('click', blockEvent, { capture: true, passive: false })
        listen('auxclick', blockEvent, { capture: true, passive: false })
        listen('dblclick', blockEvent, { capture: true, passive: false })
        listen('contextmenu', blockEvent, { capture: true, passive: false })
        listen('dragstart', blockEvent, { capture: true, passive: false })
        listen('pointercancel', onPointerCancel, { capture: true, passive: true })
        listen('pointermove', onPointerMove, { capture: true, passive: true })
        listen('wheel', onWheel, { capture: true, passive: true })
        listen('scroll', onScroll, { capture: true, passive: true })
        listen('keydown', onKeyDown, { capture: true, passive: false })
        listen('keyup', onKeyUp, { capture: true, passive: true })
        listen('blur', onWindowBlur, { capture: false, passive: true })
        listen('visibilitychange', onVisibilityChange, { capture: false, passive: true })
      }

      /** Remove every installed window listener. @returns {void} */
      function uninstallPageListeners() {
        for (const entry of pageListeners) window.removeEventListener(entry.type, entry.handler, entry.options)
        pageListeners.length = 0
        pointer = null
        hoverPoint = null
      }

      /** Cancel every pending frame and timer. @returns {void} */
      function clearTimers() {
        if (hoverFrame !== null) window.cancelAnimationFrame(hoverFrame)
        if (geometryFrame !== null) window.cancelAnimationFrame(geometryFrame)
        if (hoverRecomputeTimer !== null) window.clearTimeout(hoverRecomputeTimer)
        hoverFrame = null
        geometryFrame = null
        hoverRecomputeTimer = null
        if (resizeTimer !== null) window.clearTimeout(resizeTimer)
        if (frameObserverTimer !== null) window.clearTimeout(frameObserverTimer)
        if (feedbackTimer !== null) window.clearTimeout(feedbackTimer)
        if (flashTimer !== null) window.clearTimeout(flashTimer)
        if (frameRestoreTimer !== null) window.clearTimeout(frameRestoreTimer)
        if (popoverMeasureFrame !== null) window.cancelAnimationFrame(popoverMeasureFrame)
        popoverMeasureFrame = null
        if (persistTimer !== null) window.clearTimeout(persistTimer)
        persistTimer = null
        if (markerHoverTimer !== null) window.clearTimeout(markerHoverTimer)
        if (detailCloseTimer !== null) window.clearTimeout(detailCloseTimer)
        if (undoExpireTimer !== null) window.clearTimeout(undoExpireTimer)
        if (detailMeasureFrame !== null) window.cancelAnimationFrame(detailMeasureFrame)
        markerHoverTimer = null
        detailCloseTimer = null
        undoExpireTimer = null
        detailMeasureFrame = null
        resizeTimer = null
        frameObserverTimer = null
        feedbackTimer = null
        flashTimer = null
        frameRestoreTimer = null
      }

      /** @returns {boolean} whether the host asks for reduced motion. */
      function prefersReducedMotion() {
        try {
          return typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
        } catch {
          return false
        }
      }

      /**
       * Remember the frame's own inline padding-right and --psa-rail-width (value
       * and priority) before the mode writes them, so exit restores the exact
       * previous state instead of blanket-clearing host inline styles (F12).
       * @param {HTMLElement} frame - layout frame.
       * @returns {void}
       */
      function captureFrameInline(frame) {
        if (frameSnapshot !== null && frameSnapshot.frame === frame) return
        if (frameSnapshot !== null) {
          const previousFrame = frameSnapshot.frame
          restoreFrameInline()
          if (previousFrame !== null && previousFrame !== undefined && typeof previousFrame.removeAttribute === 'function') {
            previousFrame.removeAttribute('data-psa-frame')
          }
        }
        frameSnapshot = {
          frame,
          paddingRight: {
            value: frame.style.getPropertyValue('padding-right'),
            priority: frame.style.getPropertyPriority('padding-right')
          },
          railWidth: {
            value: frame.style.getPropertyValue('--psa-rail-width'),
            priority: frame.style.getPropertyPriority('--psa-rail-width')
          }
        }
      }

      /**
       * Restore one inline property to exactly its captured value and priority.
       * @param {HTMLElement} frame - layout frame.
       * @param {string} name - CSS property name.
       * @param {{ value: string, priority: string }} saved - captured property state.
       * @returns {void}
       */
      function restoreInlineProperty(frame, name, saved) {
        if (saved.value === '' && saved.priority === '') frame.style.removeProperty(name)
        else frame.style.setProperty(name, saved.value, saved.priority)
      }

      /**
       * Restore the captured inline frame styles. Never a blanket clear.
       * @returns {void}
       */
      function restoreFrameInline() {
        if (frameSnapshot === null) return
        const frame = frameSnapshot.frame
        if (frame !== null && frame !== undefined && typeof frame.style === 'object') {
          restoreInlineProperty(frame, 'padding-right', frameSnapshot.paddingRight)
          restoreInlineProperty(frame, '--psa-rail-width', frameSnapshot.railWidth)
        }
        frameSnapshot = null
      }

      /**
       * Remove every layout marker this mode added, restoring the frame exactly.
       *
       * Exit restores the captured inline padding while the transition rule is
       * still present, then drops the frame marker after the reverse transition
       * (immediately under reduced motion, and always on disposal/rollback).
       * @param {{ immediate?: boolean }} [options] - force the marker removal now.
       * @returns {void}
       */
      function restoreAnnotationLayout(options) {
        const settingsForRestore = options !== null && typeof options === 'object' ? options : {}
        const immediate = settingsForRestore.immediate === true || prefersReducedMotion()
        const frame = annotationLayoutFrame()
        const snapshotFrame = frameSnapshot === null ? null : frameSnapshot.frame
        restorePaintLayer()
        document.documentElement.removeAttribute('data-psa-active')
        document.documentElement.removeAttribute('data-psa-passthrough')
        if (frameRestoreTimer !== null) {
          window.clearTimeout(frameRestoreTimer)
          frameRestoreTimer = null
        }
        if (snapshotFrame !== null && snapshotFrame !== undefined) restoreFrameInline()
        const markerFrame = snapshotFrame !== null && snapshotFrame !== undefined ? snapshotFrame : frame
        if (markerFrame === null || markerFrame === undefined) return
        if (immediate) {
          markerFrame.removeAttribute('data-psa-frame')
          if (frame !== null && frame !== markerFrame) frame.removeAttribute('data-psa-frame')
          return
        }
        // Keep the marker while the restored padding animates back, then remove it.
        frameRestoreTimer = window.setTimeout(() => {
          frameRestoreTimer = null
          if (markerFrame.isConnected !== false) markerFrame.removeAttribute('data-psa-frame')
          const current = annotationLayoutFrame()
          if (current !== null && current !== markerFrame) current.removeAttribute('data-psa-frame')
        }, 180)
      }

      /**
       * Turn annotation mode on: markers, layout, listeners.
       *
       * Activation touches page-level state (root attribute, frame padding, window
       * listeners). If any step throws, every one of those is rolled back before the
       * error leaves this function, so the page can never keep blockers or padding
       * from a half-applied mode.
       * @returns {void}
       */
      function activate() {
        if (isActive()) return
        idleLauncherPosition = snapshot().launcherPosition
        document.documentElement.setAttribute('data-psa-active', 'true')
        try {
          installPageListeners()
          // F3 needs the body observer even before any record resolves, because a
          // floating card can appear under a stationary pointer with no selection.
          ensureDomObserver()
          dispatch({ type: 'activate' })
          updateLayout()
          // F1: raise the paint layer above native hover cards for the whole
          // active window, after the frame works so a failed activation never
          // leaves the shell chrome raised.
          capturePaintLayer()
          ensureRailDockObserver()
          syncRailDock()
          scheduleGeometry()
        } catch (error) {
          try {
            dispatch({ type: 'deactivate' })
          } catch {
            // The rollback below does not depend on the reducer.
          }
          uninstallPageListeners()
          disconnectFrameObserver()
          clearResolvedNodeCache()
          clearTimers()
          disconnectRailDockObserver()
          restoreAnnotationLayout({ immediate: true })
          announceAnnotationState(false)
          throw error
        }
        // F4: tell the dynamic-workspaces feature the mode is on (D3 split).
        announceAnnotationState(true)
        feedback(t('feedback.modeOn'))
      }

      /** Turn annotation mode off and restore the exact original layout. @returns {void} */
      function deactivate() {
        // F4: announce before teardown so the dependent hover card cannot outlive
        // the mode; a defensive call while already off is harmless.
        announceAnnotationState(false)
        if (!isActive()) {
          // Defensive cleanup: no state says "active", but an interrupted activation or a
          // foreign removal could still have page-level leftovers. None of these calls
          // depend on the reducer, so they are always safe. The resolved-node cache and
          // its body observer are cleared here too, so this defensive path cannot leave
          // them behind (NIT-6).
          uninstallPageListeners()
          disconnectFrameObserver()
          clearResolvedNodeCache()
          disconnectRailDockObserver()
          restoreAnnotationLayout()
          flushAnnotationRecords()
          return
        }
        try {
          releaseSurfacePin(true)
          dispatch({ type: 'deactivate' })
        } finally {
          // Layout restoration and listener removal come first and unconditionally; the
          // UI-state refresh below is best effort.
          abortGestures()
          clearResolvedNodeCache()
          if (hoverRecomputeTimer !== null) {
            window.clearTimeout(hoverRecomputeTimer)
            hoverRecomputeTimer = null
          }
          lastPick = null
          cancelMarkerHoverTimer()
          cancelDetailClose()
          closeDetailCard()
          publish({ markRects: [], markerHoverId: null, markUndo: null, chipPreview: null })
          uninstallPageListeners()
          disconnectFrameObserver()
          disconnectRailDockObserver()
          restoreAnnotationLayout()
          flushAnnotationRecords()
          if (feedbackTimer !== null) window.clearTimeout(feedbackTimer)
          feedbackTimer = null
          try {
            clearHover()
          } catch {
            // A throwing subscriber must not keep page markers alive.
          }
          try {
            const restoreLauncher = idleLauncherPosition ?? snapshot().launcherPosition
            idleLauncherPosition = null
            publish({
              boxRect: null,
              popoverPosition: null,
              popoverPinned: false,
              hoverRect: null,
              noteEditor: null,
              launcherPosition: clampLauncherPosition(restoreLauncher, annotationViewport(), ANNOTATION_LAUNCHER_SIZE)
            })
            dispatch({ type: 'feedback', feedback: null })
          } catch {
            // Snapshot refresh is cosmetic once the layout is restored.
          }
        }
      }

      /** Toggle annotation mode. @returns {void} */
      function toggleMode() {
        if (isActive()) deactivate()
        else activate()
      }

      /**
       * Start dragging the launcher; a moved drag never toggles the mode.
       * @param {PointerEvent} event - pointerdown on the launcher.
       * @returns {void}
       */
      function beginLauncherDrag(event) {
        if (event.button !== 0) return
        event.preventDefault()
        const start = snapshot().launcherPosition
        const originX = event.clientX
        const originY = event.clientY
        let moved = false
        suppressLauncherClickUntil = 0
        /** @param {PointerEvent} moveEvent - pointermove. @returns {void} */
        const onMove = (moveEvent) => {
          const dx = moveEvent.clientX - originX
          const dy = moveEvent.clientY - originY
          if (!moved && Math.hypot(dx, dy) < 4) return
          moved = true
          publish({ launcherDragging: true })
          publish({
            launcherPosition: clampLauncherPosition(
              { x: start.x + dx, y: start.y + dy },
              annotationViewport(),
              ANNOTATION_LAUNCHER_SIZE
            )
          })
        }
        /**
         * Settle the drag exactly once. An aborted drag (teardown, pass-through)
         * never persists a position and swallows the click that follows it.
         * @param {boolean} aborted - whether a teardown is aborting the gesture.
         * @returns {void}
         */
        const settle = (aborted) => {
          if (settled === true) return
          settled = true
          unregister()
          window.removeEventListener('pointermove', onMove, true)
          window.removeEventListener('pointerup', onUp, true)
          window.removeEventListener('pointercancel', onCancel, true)
          publish({ launcherDragging: false })
          if (aborted) {
            suppressLauncherClickUntil = Date.now() + 600
            return
          }
          if (!moved) return
          suppressLauncherClickUntil = Date.now() + 600
          persistLauncherPosition(snapshot().launcherPosition)
        }
        const onUp = () => settle(false)
        const onCancel = () => settle(true)
        let settled = false
        const unregister = trackGesture(settle)
        window.addEventListener('pointermove', onMove, true)
        window.addEventListener('pointerup', onUp, true)
        window.addEventListener('pointercancel', onCancel, true)
      }

      /**
       * Consume the click that would otherwise toggle the mode after a drag.
       * @returns {boolean} whether the click must be ignored.
       */
      function consumeLauncherClickSuppressed() {
        if (Date.now() > suppressLauncherClickUntil) return false
        suppressLauncherClickUntil = 0
        return true
      }

      /**
       * Start dragging the popover by its header.
       * @param {PointerEvent} event - pointerdown on the popover header.
       * @returns {void}
       */
      function beginPopoverDrag(event) {
        if (event.button !== 0) return
        const start = snapshot().popoverPosition
        if (start === null) return
        event.preventDefault()
        measurePopover()
        const originX = event.clientX
        const originY = event.clientY
        /** @param {PointerEvent} moveEvent - pointermove. @returns {void} */
        const onMove = (moveEvent) => {
          const size = annotationViewport()
          const railWidth = snapshot().railWidth
          const maxX = Math.max(8, size.width - railWidth - popoverMeasuredSize.width - 8)
          const maxY = Math.max(8, size.height - popoverMeasuredSize.height - 8)
          const x = Math.min(Math.max(start.x + moveEvent.clientX - originX, 8), maxX)
          const y = Math.min(Math.max(start.y + moveEvent.clientY - originY, 8), maxY)
          publish({ popoverPosition: { x: Math.round(x), y: Math.round(y) }, popoverPinned: true })
        }
        /** @param {boolean} aborted - whether a teardown is aborting the gesture. @returns {void} */
        const settle = (aborted) => {
          if (settled === true) return
          settled = true
          unregister()
          window.removeEventListener('pointermove', onMove, true)
          window.removeEventListener('pointerup', onUp, true)
          window.removeEventListener('pointercancel', onCancel, true)
          if (aborted) return
        }
        const onUp = () => settle(false)
        const onCancel = () => settle(true)
        let settled = false
        const unregister = trackGesture(settle)
        window.addEventListener('pointermove', onMove, true)
        window.addEventListener('pointerup', onUp, true)
        window.addEventListener('pointercancel', onCancel, true)
      }

      /**
       * Start dragging the multi-selection batch popover by its header, so a
       * popover anchored near a window edge can be moved fully on-screen.
       * @param {PointerEvent} event - pointerdown on the batch popover header.
       * @returns {void}
       */
      function beginBatchDrag(event) {
        if (event.button !== 0) return
        const start = snapshot().batchPosition
        if (start === null) return
        event.preventDefault()
        measureBatchPopover()
        const originX = event.clientX
        const originY = event.clientY
        /** @param {PointerEvent} moveEvent - pointermove. @returns {void} */
        const onMove = (moveEvent) => {
          const size = annotationViewport()
          const railWidth = snapshot().railWidth
          const maxX = Math.max(8, size.width - railWidth - batchMeasuredSize.width - 8)
          const maxY = Math.max(8, size.height - batchMeasuredSize.height - 8)
          const x = Math.min(Math.max(start.x + moveEvent.clientX - originX, 8), maxX)
          const y = Math.min(Math.max(start.y + moveEvent.clientY - originY, 8), maxY)
          publish({ batchPosition: { x: Math.round(x), y: Math.round(y) }, batchPinned: true })
        }
        /** @param {boolean} aborted - whether a teardown is aborting the gesture. @returns {void} */
        const settle = (aborted) => {
          if (settled === true) return
          settled = true
          unregister()
          window.removeEventListener('pointermove', onMove, true)
          window.removeEventListener('pointerup', onUp, true)
          window.removeEventListener('pointercancel', onCancel, true)
          if (aborted) return
        }
        const onUp = () => settle(false)
        const onCancel = () => settle(true)
        let settled = false
        const unregister = trackGesture(settle)
        window.addEventListener('pointermove', onMove, true)
        window.addEventListener('pointerup', onUp, true)
        window.addEventListener('pointercancel', onCancel, true)
      }

      /** Toggle the collapsed rail strip. @returns {void} */
      function toggleRailCollapsed() {
        const next = !snapshot().railCollapsed
        publish({ railCollapsed: next })
        annotationWriteStorage(RAIL_STORAGE_KEY, next ? 'true' : 'false')
        updateLayout()
      }

      /** A3/T51: toggle the transient modifier-settings popover. @returns {void} */
      function toggleSettingsOpen() {
        publish({ settingsOpen: !snapshot().settingsOpen })
      }

      /** A3/T51: close the modifier-settings popover. @returns {void} */
      function closeSettingsOpen() {
        if (snapshot().settingsOpen) publish({ settingsOpen: false })
      }

      /** Show one rail view in place. @param {'status' | 'collection' | 'settings'} view - requested view. @returns {void} */
      function openView(view) {
        dispatch({ type: 'openView', view })
      }

      /** Return the rail to its status view. @returns {void} */
      function backView() {
        dispatch({ type: 'openView', view: 'collection' })
      }

      /** Clear the current selection and close the popover. @returns {void} */
      function clearSelection() {
        dispatch({ type: 'selectSingle', ref: null })
      }

      /**
       * Update the popover's note draft.
       * @param {string} text - note text.
       * @returns {void}
       */
      function updateNote(text) {
        dispatch({ type: 'setNote', text: typeof text === 'string' ? text : '' })
      }

      /**
       * Mark the popover note as being edited. The first Esc then ends editing and
       * keeps both the note and the popover (F6).
       * @returns {void}
       */
      function beginEdit() {
        if (!isActive()) return
        dispatch({ type: 'beginEdit' })
      }

      /**
       * End note editing without clearing the note or the selection.
       * @returns {void}
       */
      function endEdit() {
        if (!isActive()) return
        dispatch({ type: 'endEdit' })
      }

      /**
       * A3/T24: commit the multi-selection as ONE group. Each selected element
       * becomes a group item with its full locator/bounds/session metadata; the
       * requirement is stored once on the group. The cap counts every item.
       * @param {object} state - current annotation state.
       * @param {{ feedback?: boolean }} [options] - feedback suppression (quick reference).
       * @returns {boolean} whether the group was saved.
       */
      function commitGroupSelection(state, options) {
        const settingsForCommit = options !== null && typeof options === 'object' ? options : {}
        const sessionId = annotationBridge.sessionId ?? state.sessionId ?? null
        const refs = state.selection.filter((ref) => ref !== null && typeof ref === 'object')
        if (refs.length === 0) return false
        if (annotationTotalItemCount(state.collection) + refs.length > ANNOTATION_RECORD_LIMIT) {
          feedback(t('collection.maxReached', { limit: ANNOTATION_RECORD_LIMIT }), 'error')
          return false
        }
        const enriched = refs.map((ref) => ({
          ...ref,
          session: { ...(ref.session !== null && typeof ref.session === 'object' ? ref.session : {}), sessionId: ref.session?.sessionId ?? sessionId }
        }))
        const group = annotationGroupFromSelection(enriched, state.note, sessionId, Date.now())
        if (group === null) return false
        const preview = collectionAddGroup(state.collection, group, ANNOTATION_RECORD_LIMIT)
        if (preview.rejected) {
          feedback(t('collection.maxReached', { limit: ANNOTATION_RECORD_LIMIT }), 'error')
          return false
        }
        closeDetailCard({ keepMarker: true })
        dispatch({ type: 'groupAdd', group })
        dispatch({ type: 'selectSingle', ref: null })
        if (settingsForCommit.feedback !== false) feedback(t('feedback.groupAdded', { count: group.items.length }))
        return true
      }

      /**
       * Commit the current selection into the collection (A3/T5/T7).
       *
       * This is the popover's primary action: it adds or updates the requirement,
       * then auto-dismisses the popover + selection (spec §4.4) while the page marks
       * stay visible. Multi-select keeps the Phase 1 batch wording but shares the
       * same commit boundary. The 100-record cap is checked before any record is
       * written (D15: explicit refusal, never a partial commit).
       * @param {{ feedback?: boolean }} [options] - `feedback: false` suppresses the toast (quick reference).
       * @returns {boolean} whether the selection was committed.
       */
      function commitSelection(options) {
        const settingsForCommit = options !== null && typeof options === 'object' ? options : {}
        const current = snapshot()
        const state = current.state
        if (state.selection.length === 0) return false
        // A3/T24: a multi-selection is ONE batch group with ONE shared requirement,
        // never N independent records.
        if (state.selection.length > 1) return commitGroupSelection(state, settingsForCommit)
        const sessionId = annotationBridge.sessionId ?? state.sessionId ?? null
        const identityMatches = (item, ref) => identityKeyOf(item) === identityKeyOf(ref)
          && (item?.session?.sessionId ?? null) === (ref.session?.sessionId ?? sessionId)
        let additions = 0
        for (const ref of state.selection) {
          if (!state.collection.some((item) => identityMatches(item, ref))) additions += 1
        }
        if (state.collection.length + additions > ANNOTATION_RECORD_LIMIT) {
          feedback(t('collection.maxReached', { limit: ANNOTATION_RECORD_LIMIT }), 'error')
          return false
        }
        let updated = false
        for (const ref of state.selection) {
          const existing = snapshot().state.collection.some((item) => identityMatches(item, ref))
          if (existing) updated = true
          const entry = {
            ...ref,
            // Preserve the full captured identity (cwd/workspaceLabel) on every
            // commit path; dropping them silently would break D6 across a reload.
            session: {
              ...(ref.session !== null && typeof ref.session === 'object' ? ref.session : {}),
              sessionId: ref.session?.sessionId ?? sessionId
            },
            note: state.selection.length === 1 ? state.note : (ref.note ?? '')
          }
          dispatch({ type: 'annotationCommit', record: entry, now: Date.now() })
        }
        // Auto-dismiss: close the popover/card, clear the selection, keep the marks
        // that the commit just refreshed (spec §4.4).
        closeDetailCard({ keepMarker: true })
        dispatch({ type: 'selectSingle', ref: null })
        if (settingsForCommit.feedback !== false) {
          if (state.selection.length > 1) feedback(updated ? t('feedback.updated') : t('feedback.added'))
          else if (updated) feedback(t('feedback.markUpdated'))
          else feedback(t('feedback.marked', { count: snapshot().state.collection.length }))
        }
        return true
      }

      /**
       * Add the current selection to the collection (legacy name used by the rail
       * multi-select action; same commit boundary as the popover primary action).
       * @returns {void}
       */
      function addSelectionToCollection() {
        commitSelection()
      }

      /**
       * Insert one text block into the current Composer without sending it.
       * @param {string} text - text to insert.
       * @returns {boolean} whether insertion succeeded.
       */
      function insertIntoComposer(text) {
        const actions = annotationBridge.inputActions
        if (actions === null || typeof actions !== 'object'
          || typeof actions.captureInsertion !== 'function' || typeof actions.insertText !== 'function') {
          feedback(t('feedback.noComposer'), 'error')
          return false
        }
        try {
          const span = actions.captureInsertion()
          if (actions.insertText(text, span) !== true) {
            feedback(t('feedback.insertFailed'), 'error')
            return false
          }
        } catch {
          feedback(t('feedback.insertFailed'), 'error')
          return false
        }
        annotationFocusComposer()
        feedback(t('feedback.inserted'))
        return true
      }

      /**
       * Attach the composer services resolved by the dynamic T9 inject. Kept
       * replaceable and nullable: an embedding without the chat UI simply never
       * calls this, and every insertion path falls back to plain text (D9).
       * @param {{ conversation?: object, inputTriggers?: object }} services - service faces.
       * @returns {void}
       */
      function attachComposerServices(services) {
        const source = services !== null && typeof services === 'object' ? services : {}
        composerConversation = source.conversation !== undefined && source.conversation !== null ? source.conversation : null
        composerInputTriggers = source.inputTriggers !== undefined && source.inputTriggers !== null ? source.inputTriggers : null
      }

      /**
       * Resolve the session-scoped input facade for one Session.
       * @param {string | null} sessionId - Session identity.
       * @returns {object | null} session input facade, or null when unavailable.
       */
      function composerInputFor(sessionId) {
        if (composerConversation === null || typeof sessionId !== 'string' || sessionId.length === 0) return null
        const sessions = ctx !== null && typeof ctx === 'object' ? ctx.sessions : null
        if (sessions === null || typeof sessions !== 'object' || typeof sessions.scope !== 'function') return null
        try {
          const actx = sessions.scope(sessionId)
          if (actx === undefined || actx === null) return null
          const inputRegistry = composerConversation.input
          if (inputRegistry === null || typeof inputRegistry !== 'object' || typeof inputRegistry.for !== 'function') return null
          return inputRegistry.for(actx)
        } catch {
          return null
        }
      }

      /**
       * Insert one annotation reference as a native composer chip, or fall back to
       * the Phase 1 plain-text block with an explanatory toast (A3/T9/D9).
       * @param {Array<object>} records - record(s) to reference (one for single, N for the ONE group chip).
       * @param {{ batch?: boolean, fallbackText: string }} options - batch flag and fallback text.
       * @returns {boolean} whether any insertion applied.
       */
      function insertReferenceChip(records, options) {
        const list = Array.isArray(records) ? records : []
        const settingsForInsert = options !== null && typeof options === 'object' ? options : {}
        if (list.length === 0) return false
        const batch = settingsForInsert.batch === true
        const fallbackText = typeof settingsForInsert.fallbackText === 'string' ? settingsForInsert.fallbackText : ''
        const sessionId = annotationBridge.sessionId ?? snapshot().state.sessionId
        const actions = annotationBridge.inputActions
        if (sessionId !== null && actions !== null && typeof actions === 'object' && typeof actions.captureInsertion === 'function') {
          let span = null
          try {
            span = actions.captureInsertion()
          } catch {
            span = null
          }
          const input = span === null ? null : composerInputFor(sessionId)
          if (input !== null && typeof input.insertReference === 'function') {
            try {
              const ref = batch
                ? annotationChipRefBatch(list, t('chip.batchLabel', { count: annotationTotalItemCount(list) }))
                : annotationChipRefOf(list[0])
              if (ref.ref.length > 0 && input.insertReference(ref, span) === true) {
                feedback(t(batch ? 'feedback.chipBatchInserted' : 'feedback.chipInserted'))
                annotationFocusComposer()
                return true
              }
            } catch {
              // Fall through to the plain-text path with its explanatory toast.
            }
          }
        }
        const inserted = fallbackText.length > 0 ? insertIntoComposer(fallbackText) : false
        if (inserted) feedback(t('feedback.chipFallback'))
        return inserted
      }

      /** The chip element currently showing the hover preview (or null). */
      let chipPreviewElement = null
      /** The chip element the × affordance currently targets (or null). */
      let chipActionElement = null
      /** Pending delayed hide for the × affordance (keeps it alive while the pointer moves onto it). */
      let chipActionHideTimer = null

      /** Cancel a pending × affordance hide. @returns {void} */
      function cancelChipActionHide() {
        if (chipActionHideTimer !== null) {
          clearTimeout(chipActionHideTimer)
          chipActionHideTimer = null
        }
      }

      /** Hide the × affordance immediately. @returns {void} */
      function hideChipAction() {
        cancelChipActionHide()
        chipActionElement = null
        if (snapshot().chipAction !== null) publish({ chipAction: null })
      }

      /**
       * Delay the × affordance hide so the pointer can travel from the chip onto
       * the button; entering the button cancels the pending hide.
       * @returns {void}
       */
      function scheduleChipActionHide() {
        if (chipActionElement === null) return
        cancelChipActionHide()
        chipActionHideTimer = setTimeout(() => {
          chipActionHideTimer = null
          chipActionElement = null
          publish({ chipAction: null })
        }, 180)
      }

      /** Keep the × affordance visible (pointer entered it). @returns {void} */
      function keepChipAction() {
        cancelChipActionHide()
      }

      /**
       * Show the × affordance over one annotation chip.
       * @param {Element} chip - `[data-composer-chip="ui-annotation"]` element.
       * @returns {void}
       */
      function showChipAction(chip) {
        cancelChipActionHide()
        chipActionElement = chip
        const rect = chip.getBoundingClientRect()
        publish({
          chipAction: {
            x: Math.round(rect.right - 7),
            y: Math.round(rect.top - 7),
            width: 16,
            height: 16
          }
        })
      }

      /**
       * Remove the chip the × affordance targets THROUGH the shell's own editor
       * (Lexical node removal, the same mutation Backspace performs), so other
       * chips stay real chips, surrounding text/caret stay put, and the edit is one
       * undo step. Never rewrites the whole draft and never sends.
       * @returns {boolean} whether the chip was removed.
       */
      function removeChipAtAction() {
        const chip = chipActionElement
        if (chip === null || chip === undefined || chip.isConnected === false) {
          hideChipAction()
          return false
        }
        const sessionId = annotationBridge.sessionId ?? snapshot().state.sessionId
        const input = composerInputFor(sessionId)
        const editor = input !== null && typeof input === 'object' ? input.editor : null
        let removed = false
        if (editor !== null && typeof editor === 'object'
          && typeof editor.update === 'function' && typeof editor.getElementByKey === 'function') {
          try {
            const editorState = editor.getEditorState()
            const nodeMap = editorState !== null && typeof editorState === 'object' && editorState._nodeMap instanceof Map
              ? editorState._nodeMap
              : null
            let nodeKey = null
            if (nodeMap !== null) {
              for (const key of nodeMap.keys()) {
                if (editor.getElementByKey(key) === chip) {
                  nodeKey = key
                  break
                }
              }
            }
            if (nodeKey !== null) {
              editor.update(() => {
                const liveState = editor.getEditorState()
                const liveMap = liveState !== null && typeof liveState === 'object' && liveState._nodeMap instanceof Map
                  ? liveState._nodeMap
                  : null
                const node = liveMap === null ? null : liveMap.get(nodeKey)
                if (node !== null && node !== undefined && typeof node.remove === 'function') node.remove()
              })
              removed = chip.isConnected === false || (() => {
                try {
                  const next = editor.getEditorState()
                  const nextMap = next !== null && typeof next === 'object' && next._nodeMap instanceof Map ? next._nodeMap : null
                  return nextMap !== null && !nextMap.has(nodeKey)
                } catch {
                  return false
                }
              })()
            }
          } catch {
            removed = false
          }
        }
        if (!removed) {
          // Fallback: focus the editor, move the caret right after the chip through
          // the DOM selection, and let Lexical's own Backspace handler delete it.
          try {
            const editorRoot = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')
            if (editorRoot !== null) {
              editorRoot.focus()
              const range = document.createRange()
              range.setStartAfter(chip)
              range.collapse(true)
              const selection = window.getSelection()
              if (selection !== null) {
                selection.removeAllRanges()
                selection.addRange(range)
              }
              editorRoot.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Backspace',
                code: 'Backspace',
                keyCode: 8,
                which: 8,
                bubbles: true,
                cancelable: true
              }))
              removed = true
            }
          } catch {
            removed = false
          }
        }
        hideChipPreview()
        hideChipAction()
        if (!removed) feedback(t('feedback.chipRemoveFailed'), 'error')
        else annotationFocusComposer()
        return removed
      }

      /**
       * Hide the composer-chip hover preview.
       * @returns {boolean} whether a preview was visible.
       */
      function hideChipPreview() {
        const wasVisible = chipPreviewElement !== null || snapshot().chipPreview !== null
        chipPreviewElement = null
        if (snapshot().chipPreview !== null) publish({ chipPreview: null })
        return wasVisible
      }

      /**
       * Resolve one annotation reference chip to a preview model from the local
       * store only (no network): the chip label is matched against our records'
       * element labels, and the grouped batch chip against the localized batch
       * label. Native chips never match and therefore get no preview.
       * @param {Element} chip - `[data-composer-chip="ui-annotation"]` element.
       * @returns {object | null} preview model, or null for a lookalike chip.
       */
      function chipPreviewModel(chip) {
        const label = String(chip.innerText || chip.textContent || '').replace(/\s+/g, ' ').trim().replace(/^@\s*/, '')
        if (label.length === 0) return null
        const batchTemplate = t('chip.batchLabel')
        const batchPrefix = batchTemplate.split('{count}')[0].trim()
        if (batchPrefix.length > 0 && label.startsWith(batchPrefix)) {
          const parsed = /(\d+)/.exec(label)
          const sessionId = annotationBridge.sessionId ?? snapshot().state.sessionId
          const selected = annotationSelectedEntries(snapshot().state.collection, sessionId)
          const flat = annotationFlattenRecords(selected)
          const count = parsed !== null ? Number(parsed[1]) : flat.length
          return {
            kind: 'batch',
            count: count > 0 ? count : flat.length,
            items: flat.slice(0, 6).map((record) => ({ label: elementLabel(record), note: typeof record.note === 'string' ? record.note : '' }))
          }
        }
        const flat = annotationFlattenRecords(snapshot().state.collection)
        const record = flat.find((entry) => (elementLabel(entry) || 'UI annotation') === label)
        if (record === undefined) return null
        return { kind: 'record', refId: record.id }
      }

      /**
       * Pointer-over handler for the composer-chip hover preview. Delegated from
       * the plugin install: only chips rendered with our source are considered.
       * @param {PointerEvent} event - pointerover event.
       * @returns {void}
       */
      function onChipPointerOver(event) {
        const target = event !== null && event.target instanceof Element ? event.target : null
        if (target === null) return
        const chip = typeof target.closest === 'function' ? target.closest('[data-composer-chip="ui-annotation"]') : null
        if (chip === null) {
          if (chipPreviewElement !== null) {
            // Layout churn under the pointer can emit pointerover events whose
            // target is not the chip; keep the preview while the chip is hovered.
            try {
              if (typeof chipPreviewElement.matches === 'function' && chipPreviewElement.matches(':hover')) return
            } catch {
              // fall through to hide
            }
            hideChipPreview()
          }
          return
        }
        if (chipPreviewElement === chip) return
        const editor = typeof chip.closest === 'function' ? chip.closest('[data-conversation-region="composer"] [data-lexical-editor="true"]') : null
        if (editor === null) return
        const model = chipPreviewModel(chip)
        if (model === null) {
          hideChipPreview()
          return
        }
        const rect = chip.getBoundingClientRect()
        const position = clampDetailCardPosition(
          { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
          ANNOTATION_CHIP_PREVIEW_SIZE,
          annotationViewport(),
          isActive() ? snapshot().railWidth : 0
        )
        chipPreviewElement = chip
        publish({ chipPreview: { ...model, x: position.x, y: position.y, placement: position.placement } })
        showChipAction(chip)
      }

      /**
       * Scroll handler: hide the preview when the scrolled element is the document
       * or an ancestor of the chip (the chip moved with content). Unrelated scroll
       * containers (chat auto-scroll) must not flicker the preview away.
       * @param {Event} event - scroll event (capture).
       * @returns {void}
       */
      function onChipScroll(event) {
        if (chipPreviewElement === null) return
        const target = event !== null && typeof event === 'object' ? event.target : null
        const isAncestorScroll = target === document
          || target === window
          || (target instanceof Element && (target === chipPreviewElement || target.contains(chipPreviewElement)))
        if (isAncestorScroll) {
          hideChipPreview()
          hideChipAction()
        }
      }

      /**
       * Pointer-out handler: hide the preview once the pointer leaves the chip.
       * @param {PointerEvent} event - pointerout event.
       * @returns {void}
       */
      function onChipPointerOut(event) {
        if (chipPreviewElement === null) return
        const related = event !== null && event.relatedTarget instanceof Element ? event.relatedTarget : null
        if (related !== null && (related === chipPreviewElement || chipPreviewElement.contains(related))) return
        // React re-renders elsewhere on the page can emit spurious pointerout events
        // for nodes under the pointer; only hide when the physical pointer really
        // left the chip (`:hover` is the browser's own hit-test state).
        try {
          if (typeof chipPreviewElement.matches === 'function' && chipPreviewElement.matches(':hover')) return
        } catch {
          // A throwing matches() must not keep a stale preview on screen.
        }
        hideChipPreview()
        scheduleChipActionHide()
      }

      /**
       * The record a chip candidate names, for the `@` pick path.
       * @param {string} refId - record id from the candidate value.
       * @returns {object | null} record, or null when it was deleted meanwhile.
       */
      function chipRecord(refId) {
        return annotationFindRecord(snapshot().state.collection, refId)
      }

      /**
       * `@` group candidates: current-Session records only, ≤20, insertion order.
       * @param {string | null} sessionId - Session owning the composer.
       * @returns {Array<object>} trigger candidates.
       */
      function chipCandidates(sessionId) {
        return annotationChipCandidates(
          snapshot().state.collection,
          sessionId,
          ANNOTATION_CHIP_CANDIDATE_LIMIT,
          t('chip.candidateLabel')
        )
      }

      /**
       * Clipboard projection of one annotation chip.
       * @param {unknown} ref - chip ref.
       * @returns {string} clipboard text.
       */
      function chipClipboardText(ref) {
        const parsed = parseAnnotationChipRef(ref)
        if (parsed === null) return ''
        if (parsed.kind === 'single') {
          const record = chipRecord(parsed.id)
          return record === null ? '' : annotationChipRefOf(record).clipboardText
        }
        return annotationChipRefBatch([], t('chip.batchLabel', { count: parsed.ids.length })).clipboardText
      }

      /**
       * Model serialization of one annotation chip (the submit pipeline calls this
       * through the source codec). A missing single record throws so the shell
       * blocks the send instead of silently downgrading (D9); a batch chip skips
       * deleted members and states the count honestly.
       * @param {unknown} ref - chip ref.
       * @returns {string} model text.
       */
      function serializeChip(ref) {
        const result = serializeAnnotationChip(ref, snapshot().state.collection, annotationInsertLabels(t), (record) => statusOf(record))
        if (result.text === null) throw new Error(t('feedback.chipMissing'))
        return result.text
      }

      /**
       * Chip click handler: single → the record's detail card, batch → the rail
       * collection view (the group has no single element to outline).
       * @param {unknown} ref - chip ref.
       * @returns {boolean} whether the preview was accepted.
       */
      function openChipReference(ref) {
        hideChipPreview()
        const parsed = parseAnnotationChipRef(ref)
        if (parsed === null) return false
        if (parsed.kind === 'batch') {
          if (!isActive()) return false
          dispatch({ type: 'openView', view: 'collection' })
          return true
        }
        return openDetailCardById(parsed.id)
      }

      /**
       * Insert the current selection as one quick reference.
       *
       * The annotation is committed first (if it is new), then a native reference
       * chip is inserted; an unavailable chip path falls back to the Phase 1 plain
       * text with `feedback.chipFallback` (D9). The popover auto-closes first.
       * @returns {void}
       */
      function quickReference() {
        const state = snapshot().state
        const ref = state.selection[0]
        if (ref === undefined) return
        const note = state.note
        const fallbackText = serializeQuickReference({ ...ref, note, status: statusOf(ref) }, note, annotationInsertLabels(t))
        const committed = commitSelection({ feedback: false })
        if (!committed) return
        const sessionId = annotationBridge.sessionId ?? state.sessionId ?? null
        const record = snapshot().state.collection.find((entry) => !annotationIsGroup(entry)
          && identityKeyOf(entry) === identityKeyOf(ref)
          && (entry?.session?.sessionId ?? null) === (ref.session?.sessionId ?? sessionId))
        if (record === undefined) {
          insertIntoComposer(fallbackText)
          return
        }
        insertReferenceChip([record], { fallbackText })
      }

      /**
       * Insert one rail row's reference as a native single chip (with fallback).
       * @param {string} refId - record id.
       * @returns {void}
       */
      function insertEntryChip(refId) {
        const record = chipRecord(refId)
        if (record === null) return
        const fallbackText = serializeQuickReference({ ...record, status: statusOf(record) }, record.note ?? '', annotationInsertLabels(t))
        insertReferenceChip([record], { fallbackText })
      }

      /**
       * Insert the selected current-Session annotations as ONE group chip (D2);
       * other-Session records can never be part of a batch (A3/T8). Auto-dismiss
       * follows §4.4: popover/card closed, selection cleared, collection view kept.
       * @returns {void}
       */
      function insertBatch() {
        const state = snapshot().state
        if (state.collection.length === 0) return
        const sessionId = annotationBridge.sessionId ?? state.sessionId
        if (sessionId === null || sessionId === undefined) {
          feedback(t('feedback.noComposer'), 'error')
          return
        }
        const selected = annotationSelectedEntries(state.collection, sessionId)
        if (selected.length === 0) {
          feedback(t('feedback.batchEmpty'), 'error')
          return
        }
        const split = batchScopeSplit(state.collection.map((entry) => ({ ref: entry, note: entry.note ?? '' })), sessionId)
        const fallbackText = serializeBatchEntries(selected, {
          ...annotationInsertLabels(t),
          skippedCount: split.other.length
        }, (record) => statusOf(record))
        closeDetailCard()
        if (snapshot().state.selection.length > 0) dispatch({ type: 'selectSingle', ref: null })
        insertReferenceChip(selected, { batch: true, fallbackText })
      }

      /**
       * Toggle one record's batch inclusion. Other-Session records are forced out
       * of every selection (the row is disabled in the rail).
       * @param {string} refId - record id.
       * @param {boolean} included - requested flag.
       * @returns {void}
       */
      function setEntryIncluded(refId, included) {
        const entry = snapshot().state.collection.find((item) => item !== null && typeof item === 'object' && item.id === refId) ?? null
        if (entry === null) return
        const flag = collectionScopeOf(entry) === 'current' && included === true
        if (entry.included === flag) return
        dispatch({ type: 'annotationInclude', refId, included: flag })
      }

      /**
       * A3/T25: switch the sidebar filter (client-side).
       * @param {'all' | 'single' | 'group'} filter - target filter.
       * @returns {void}
       */
      function setFilter(filter) {
        dispatch({ type: 'setFilter', filter })
      }

      /**
       * A3/T29: ask before leaving the mode while annotation records exist. With no
       * records the mode exits directly.
       * @returns {void}
       */
      function requestExit() {
        if (!isActive()) return
        const state = snapshot().state
        const count = annotationTotalItemCount(state.collection)
        if (count === 0) {
          deactivate()
          return
        }
        publish({ exitConfirm: { count } })
      }

      /** Dismiss the exit confirmation without changing anything. @returns {void} */
      function cancelExitConfirm() {
        if (snapshot().exitConfirm !== null) publish({ exitConfirm: null })
      }

      /**
       * Confirm the exit: clear ALL records (singles + groups), flush the empty v3
       * document immediately, close selection/popovers, and leave the mode.
       * @returns {void}
       */
      function confirmExitClear() {
        publish({ exitConfirm: null })
        dispatch({ type: 'collectionClear' })
        dispatch({ type: 'selectSingle', ref: null })
        flushAnnotationRecords()
        deactivate()
      }

      /**
       * A3/T25: footer primary action — save the current page selection (single
       * record or batch group) when one exists, otherwise return to the selection
       * status view so the user can pick elements.
       * @returns {void}
       */
      function primaryAddAnnotation() {
        const state = snapshot().state
        if (state.selection.length > 0) {
          commitSelection()
          return
        }
        // No page selection pending: the primary action now carries the collected
        // annotations to the composer instead of telling the user to select more.
        if (state.collection.length > 0) {
          insertBatch()
          return
        }
        if (state.view !== 'status') dispatch({ type: 'openView', view: 'status' })
        feedback(t('sidebar.addHint'))
      }

      /**
       * A3/T25: footer danger action — clear the current selection when there is
       * one, otherwise clear the whole collection (with undo).
       * @returns {void}
       */
      function clearSelectionOrCollection() {
        if (snapshot().state.selection.length > 0) {
          clearSelection()
          return
        }
        clearCollection()
      }

      /**
       * A3/T24: expand/collapse one group card.
       * @param {string} groupId - group id.
       * @returns {void}
       */
      function toggleGroup(groupId) {
        dispatch({ type: 'groupToggleCollapsed', groupId })
      }

      /**
       * A3/T24: remove one child from a group (the group requirement remains). The
       * whole previous group is the undo payload, so one undo step restores it.
       * @param {string} groupId - group id.
       * @param {string} itemId - child record id.
       * @returns {void}
       */
      function removeGroupItem(groupId, itemId) {
        const current = snapshot()
        const group = annotationFindGroup(current.state.collection, groupId)
        if (group === null) return
        const items = annotationGroupItems(group).filter((item) => item.id !== itemId)
        if (items.length === 0) {
          removeEntry(groupId)
          return
        }
        const next = { ...group, items, updatedAt: Date.now() }
        dispatch({ type: 'groupSet', group: next })
        setMarkUndo({ kind: 'groupRestore', group, at: Date.now() })
      }

      /**
       * Select every current-Session record for the batch (or clear the selection).
       * @param {boolean} included - target flag.
       * @returns {void}
       */
      function setAllCurrentIncluded(included) {
        const current = snapshot()
        const sessionId = currentSessionId()
        const changes = []
        for (const entry of current.state.collection) {
          const isCurrent = collectionScopeOf(entry) === 'current'
          const flag = included === true && isCurrent
          if (entry.included !== flag) changes.push({ refId: entry.id, included: flag })
        }
        if (changes.length === 0) return
        dispatch({ type: 'annotationIncludes', changes })
        const sessionIdForSelection = sessionId
        if (sessionIdForSelection === null && included === true) feedback(t('feedback.noComposer'), 'error')
      }

      /**
       * Move one rail row one slot up or down (A3/T8; order stays contiguous).
       * @param {string} refId - record id.
       * @param {number} delta - -1 up, +1 down.
       * @returns {void}
       */
      function moveEntry(refId, delta) {
        dispatch({ type: 'annotationMove', refId, delta: delta === -1 ? -1 : 1 })
      }

      /**
       * Delete every selected annotation as one undo step (A3/T8/D5).
       * @returns {void}
       */
      function removeSelected() {
        const current = snapshot()
        const ids = annotationSelectedEntries(current.state.collection, currentSessionId()).map((entry) => entry.id)
        if (ids.length === 0) return
        const removal = annotationUndoRemoveMany(current.state.collection, ids, Date.now())
        if (removal.undo === null) return
        dispatch({ type: 'annotationRemoveMany', refIds: ids })
        closeDetailCard()
        if (snapshot().noteEditor !== null) publish({ noteEditor: null })
        setMarkUndo(removal.undo)
      }

      /**
       * Rail preview: scroll to the element, flash it, then open its detail card.
       * Other-Session rows keep the existing refusal message.
       * @param {string} refId - record id.
       * @returns {void}
       */
      function previewEntry(refId) {
        const record = chipRecord(refId)
        if (record === null) return
        if (collectionScopeOf(record) !== 'current') {
          feedback(t('feedback.relocateOtherSession'), 'error')
          return
        }
        relocateEntry(refId)
        openDetailCardById(refId)
      }

      /**
       * Move one chain position for the level up/down controls.
       * @param {number} delta - +1 for a parent, -1 for a child.
       * @returns {void}
       */
      function shiftChain(delta) {
        const state = snapshot().state
        const ref = state.selection[0]
        if (ref === undefined || lastPick === null) return
        // `delta` is the Parent/Child direction in the old chain model (+1 parent);
        // a floating pick reverses it because its entry 0 is the whole card.
        const nextIndex = lastPick.index + delta * lastPick.parentStep
        if (nextIndex < 0 || nextIndex >= lastPick.entries.length) return
        lastPick = { ...lastPick, index: nextIndex }
        const nextRef = refFromPick(lastPick, { ...ref, note: state.note })
        pickedSelection.clear()
        pickedSelection.set(nextRef.id, lastPick.entries[nextIndex].element)
        dispatch({ type: 'selectSingle', ref: nextRef })
      }

      /**
       * Apply one settings select change, resolving modifier conflicts visibly.
       * @param {'passThroughModifier' | 'multiModifier'} field - changed field.
       * @param {string} value - requested modifier id.
       * @returns {void}
       */
      function setModifier(field, value) {
        const result = resolveModifierChange(settings, field, value)
        const changed = result.settings.passThroughModifier !== settings.passThroughModifier
          || result.settings.multiModifier !== settings.multiModifier
        if (!changed) return
        settings = result.settings
        annotationWriteStorage(SETTINGS_STORAGE_KEY, serializeSettings(settings))
        publish({ settings: { ...settings } })
        if (result.adjustedField !== undefined) {
          const fieldLabel = result.adjustedField === 'passThroughModifier' ? t('settings.field.passThrough') : t('settings.field.multi')
          const movedValue = t(`modifier.${settings[result.adjustedField]}`)
          feedback(t('settings.conflict', { field: fieldLabel, value: movedValue }))
        } else {
          feedback(t('settings.saved'))
        }
      }

      /**
       * Update one collection entry note live.
       * @param {string} refId - ref id.
       * @param {string} note - note text.
       * @returns {void}
       */
      function updateCollectionNote(refId, note) {
        dispatch({ type: 'annotationUpdateNote', refId, note: typeof note === 'string' ? note : '', now: Date.now() })
      }

      /**
       * Publish the single-slot undo payload and (re)arm its 5 s expiry (D5).
       * @param {object | null} undo - payload from `annotationUndoRemove`.
       * @returns {void}
       */
      function setMarkUndo(undo) {
        if (undoExpireTimer !== null) window.clearTimeout(undoExpireTimer)
        undoExpireTimer = null
        publish({ markUndo: undo })
        if (undo !== null) {
          undoExpireTimer = window.setTimeout(() => {
            undoExpireTimer = null
            publish({ markUndo: null })
          }, ANNOTATION_UNDO_WINDOW_MS)
        }
      }

      /**
       * Remove one collection entry and show its 5 s undo toast (A3/T7/D4/D5).
       * The newest removal replaces any previous undo slot.
       * @param {string} refId - ref id.
       * @returns {void}
       */
      function removeEntry(refId) {
        const current = snapshot()
        if (!current.state.collection.some((entry) => entry.id === refId)) return
        const removal = annotationUndoRemove(current.state.collection, refId, 'single', Date.now())
        dispatch({ type: 'annotationRemove', refId })
        if (snapshot().noteEditor !== null && snapshot().noteEditor.refId === refId) publish({ noteEditor: null })
        if (snapshot().detailCard !== null && snapshot().detailCard.refId === refId) closeDetailCard()
        setMarkUndo(removal.undo)
      }

      /** Remove the popover selection's existing collection record (danger X). @returns {void} */
      function removeSelection() {
        const state = snapshot().state
        const ref = state.selection[0]
        if (ref === undefined) return
        const record = snapshot().state.collection.find((entry) => identityKeyOf(entry) === identityKeyOf(ref)
          && (entry?.session?.sessionId ?? null) === (ref.session?.sessionId ?? null))
        if (record === undefined) return
        removeEntry(record.id)
        dispatch({ type: 'selectSingle', ref: null })
      }

      /** Restore the single-slot undo payload (A3/T7/D5). @returns {void} */
      function undoMark() {
        const current = snapshot()
        if (current.markUndo === null) return
        const undo = current.markUndo
        dispatch({ type: 'annotationUndo', undo })
        setMarkUndo(null)
        feedback(t('feedback.restored'))
      }

      /** Clear the collection, keeping its records in the same 5 s undo slot. @returns {void} */
      function clearCollection() {
        const current = snapshot()
        if (current.state.collection.length === 0) return
        const removal = annotationUndoRemove(current.state.collection, null, 'clear', Date.now())
        dispatch({ type: 'collectionClear' })
        closeDetailCard()
        if (snapshot().noteEditor !== null) publish({ noteEditor: null })
        setMarkUndo(removal.undo)
      }

      /**
       * Open the detail card for a collection record by id (rail preview seam for
       * Phase 2-B; the page path opens it through pointer hover).
       * @param {string} refId - record id.
       * @returns {boolean} whether the card opened.
       */
      function openDetailCardById(refId) {
        const current = snapshot()
        const mark = current.markRects.find((item) => item.id === refId)
        if (mark === undefined) return false
        openDetailCard(mark)
        return snapshot().detailCard !== null
      }

      /** Enter the detail card's edit mode (requirement textarea). @returns {void} */
      function beginDetailEdit() {
        const current = snapshot()
        if (current.detailCard === null) return
        if (current.detailCard.mode === 'edit') return
        publish({ detailCard: { ...current.detailCard, mode: 'edit' } })
      }

      /** Leave the detail card's edit mode without saving. @returns {void} */
      function cancelDetailEdit() {
        const current = snapshot()
        if (current.detailCard === null || current.detailCard.mode !== 'edit') return
        publish({ detailCard: { ...current.detailCard, mode: 'view' } })
      }

      /**
       * Save one requirement from the detail card, bumping `updatedAt` (D4).
       * @param {string} refId - record id.
       * @param {string} note - requirement text.
       * @returns {void}
       */
      function saveDetailNote(refId, note) {
        if (typeof refId !== 'string' || refId.length === 0) return
        dispatch({ type: 'annotationUpdateNote', refId, note: normalizeUserNote(note), now: Date.now() })
        const current = snapshot()
        if (current.detailCard !== null && current.detailCard.refId === refId) {
          publish({ detailCard: { ...current.detailCard, mode: 'view' } })
        }
        feedback(t('feedback.markUpdated'))
      }

      /**
       * Insert one collection record as a quick reference (Phase 1 plain text) from
       * the detail card, then auto-dismiss the card (spec §4.4).
       * @param {string} refId - record id.
       * @returns {void}
       */
      function quickReferenceById(refId) {
        const record = snapshot().state.collection.find((entry) => entry.id === refId)
        if (record === undefined) return
        const fallbackText = serializeQuickReference({ ...record, status: statusOf(record) }, record.note ?? '', annotationInsertLabels(t))
        closeDetailCard()
        insertReferenceChip([record], { fallbackText })
      }

      /**
       * Delete one record from the detail card (same undo toast as every other X).
       * @param {string} refId - record id.
       * @returns {void}
       */
      function deleteDetail(refId) {
        removeEntry(refId)
      }

      /**
       * Scroll one collection entry's target into view and flash it.
       * @param {string} refId - ref id.
       * @returns {void}
       */
      function relocateEntry(refId) {
        const ref = snapshot().state.collection.find((entry) => entry.id === refId)
        if (ref === undefined) return
        if (collectionScopeOf(ref) !== 'current') {
          // Another Session's entry is not part of the current DOM; resolving it
          // against this page could jump into an unrelated lookalike (F9).
          feedback(t('feedback.relocateOtherSession'), 'error')
          return
        }
        const status = statusOf(ref)
        const node = status === 'resolved' ? liveNode(ref) : null
        if (node === null) {
          feedback(t('feedback.relocateFailed', { status: t(`popover.status.${status}`) }), 'error')
          return
        }
        try {
          node.scrollIntoView({ block: 'center', behavior: 'smooth' })
        } catch {
          node.scrollIntoView()
        }
        if (flashTimer !== null) window.clearTimeout(flashTimer)
        publish({ flashRefId: refId, flashRect: annotationRectOf(node) })
        flashTimer = window.setTimeout(() => {
          flashTimer = null
          publish({ flashRefId: null, flashRect: null })
        }, 600)
        feedback(t('feedback.relocated'))
        scheduleGeometry()
      }

      /**
       * Open the temporary expanded note editor for one collection entry.
       * @param {string} refId - ref id.
       * @returns {void}
       */
      function openNoteEditor(refId) {
        const ref = snapshot().state.collection.find((entry) => entry.id === refId)
        if (ref === undefined) return
        const current = snapshot()
        const size = annotationViewport()
        const width = 300
        const x = Math.max(8, size.width - current.railWidth - width - 16)
        const y = Math.max(8, Math.min(96, size.height - 220))
        publish({ noteEditor: { refId, x, y } })
      }

      /** Close the expanded note editor. @returns {void} */
      function closeNoteEditor() {
        publish({ noteEditor: null })
      }

      /**
       * Notify the controller that the mounted Composer seat changed Session.
       * @param {string | null} sessionId - Session identity, or null.
       * @returns {void}
       */
      function sessionChanged(sessionId) {
        closeDetailCard()
        dispatch({ type: 'session', sessionId })
        scheduleGeometry()
      }

      // The launcher must obey the viewport for the whole plugin lifetime, not
      // only while the annotation mode is active.
      window.addEventListener('resize', onInstalledResize, { passive: true })

      /** Tear everything down (plugin unmount). @returns {void} */
      function dispose() {
        announceAnnotationState(false)
        window.removeEventListener('resize', onInstalledResize)
        abortGestures()
        clearResolvedNodeCache()
        detachPopoverNode()
        detachDetailNode()
        cancelMarkerHoverTimer()
        cancelDetailClose()
        uninstallPageListeners()
        disconnectFrameObserver()
        clearTimers()
        restoreAnnotationLayout({ immediate: true })
        flushAnnotationRecords()
        if (flashTimer !== null) window.clearTimeout(flashTimer)
        flashTimer = null
        pointer = null
        lastPick = null
        try {
          clearHover()
        } catch {
          // Disposal never depends on a subscriber.
        }
        annotationBridge.inputActions = null
        annotationBridge.sessionId = null
        annotationBridge.sessionCwd = null
      }

      return {
        store,
        t,
        toggleMode,
        activate,
        deactivate,
        beginLauncherDrag,
        consumeLauncherClickSuppressed,
        beginPopoverDrag,
        beginBatchDrag,
        attachPopoverNode,
        detachPopoverNode,
        attachBatchNode,
        detachBatchNode,
        toggleRailCollapsed,
        openView,
        backView,
        clearSelection,
        updateNote,
        beginEdit,
        endEdit,
        addSelectionToCollection,
        commitSelection,
        quickReference,
        quickReferenceById,
        insertBatch,
        insertEntryChip,
        setEntryIncluded,
        selectAllCurrent: () => setAllCurrentIncluded(true),
        deselectAll: () => setAllCurrentIncluded(false),
        moveEntry,
        removeSelected,
        previewEntry,
        attachComposerServices,
        chipCandidates,
        chipRecord,
        onChipPointerOver,
        onChipPointerOut,
        onChipScroll,
        hideChipPreview,
        hideChipAction,
        removeChipAtAction,
        keepChipAction,
        scheduleChipActionHide,
        chipClipboardText,
        serializeChip,
        openChipReference,
        copyLocator,
        levelUp: () => shiftChain(1),
        levelDown: () => shiftChain(-1),
        setModifier,
        toggleSettingsOpen,
        closeSettingsOpen,
        updateCollectionNote,
        toggleGroup,
        setFilter,
        primaryAddAnnotation,
        clearSelectionOrCollection,
        requestExit,
        cancelExitConfirm,
        confirmExitClear,
        removeGroupItem,
        removeEntry,
        removeSelection,
        undoMark,
        clearCollection,
        openDetailCardById,
        closeDetailCard,
        beginDetailEdit,
        cancelDetailEdit,
        saveDetailNote,
        deleteDetail,
        attachDetailNode,
        detachDetailNode,
        relocateEntry,
        openNoteEditor,
        closeNoteEditor,
        statusOf,
        statusDetailOf,
        copyXPath,
        copyJsPath,
        copyFullXPath,
        debugFallbackScanProbe,
        isInCollection,
        collectionScopeOf,
        currentSessionId,
        sessionChanged,
        dispose
      }
    }


    /**
     * One inline chevron glyph.
     * @param {'left' | 'right'} direction - pointing direction.
     * @returns {object} the SVG element.
     */
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
          annotationController = createAnnotationController(t, ctx)
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
