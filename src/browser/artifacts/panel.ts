/**
 * Session-artifacts panel and Files-header action.
 *
 * The Files-header button swaps the Files pane content for the current
 * Session's artifact list. The list is a React portal into this tab's
 * `[data-files-content]`, so the Files navigator stays mounted underneath and
 * the pane keeps its geometry; one marker attribute on `[data-files-page]`
 * fades the navigator behind the incoming view, and the enter/exit transition
 * is CSS (instant under reduced motion).
 *
 * Everything inline in `src/client.js` moved here: the panel component, the
 * list chrome, the source filter, the row actions, the copy feedback, the
 * Files-header toggle and the installer. Copy keys/strings, CSS selectors,
 * slot ids, DOM markers and storage behavior are unchanged.
 *
 * @module
 */

import type { MutableRefObject, ReactElement } from 'react'
import { ROUTES, browserRoute } from '../../shared/routes.ts'
import { copyArtifactContent, copyText } from './clipboard.ts'
import { ARTIFACTS_EN, ARTIFACTS_NS, ARTIFACTS_ZH } from './copy.ts'
import {
  filesArtifactsInitialState,
  filesArtifactsPhaseMs,
  filesArtifactsReduce
} from './model.ts'
import type { FilesArtifactsState } from './model.ts'
import {
  REMIX_ARROW_LEFT_LINE,
  REMIX_BOOK_OPEN_LINE,
  REMIX_CHECK_LINE,
  REMIX_DOWNLOAD_LINE,
  REMIX_FILE_COPY_LINE,
  REMIX_FILE_LINE,
  REMIX_FILTER_LINE,
  REMIX_LINK,
  REMIX_REFRESH_LINE
} from '../remix-icons.ts'
import { ARTIFACTS_CSS, FILES_ARTIFACTS_CSS } from './styles.ts'
import {
  appUrl,
  artifactContentKind,
  artifactKey,
  artifactUrl,
  attachmentUrl,
  formatBytes,
  isImageArtifact,
  openArtifactPreview
} from './urls.ts'
import type { ArtifactSidebarRight, SessionArtifact, SessionArtifactList } from './urls.ts'

/** Namespace-bound translate seat used by the panel and the action. */
export type ArtifactsTranslate = (key: string, params?: Record<string, unknown>) => string

/** Inline Remix glyph builder the entry owns. */
export type ArtifactsGlyph = (path: string, size: number, className?: string, scale?: number) => ReactElement

/** Props the Files action receives from the shell plus the injected seats. */
export interface ArtifactsFilesActionProps {
  t: ArtifactsTranslate
  sidebarRight: ArtifactSidebarRight
  sessionId?: string
  [key: string]: unknown
}

/** Props the artifacts panel renders from. */
export interface ArtifactsPanelProps {
  sessionId: string
  t: ArtifactsTranslate
  sidebarRight: ArtifactSidebarRight
  onBack?: () => void
  [key: string]: unknown
}

/** One slot registration descriptor. */
export interface ArtifactsSlotRegistration {
  name: string
  id?: string
  order?: number
  locale?: string
  inject?: () => Record<string, unknown>
}

/** The narrow client-root context slice the installer reads. */
export interface ArtifactsContext {
  effect(setup: () => (() => void) | void, label?: string): void
  locale: {
    bind(namespace: string): ArtifactsTranslate
    register(namespace: string, dictionaries: { en: Record<string, string>, zh: Record<string, string> }): () => void
  }
  slots: {
    inject(names: string, callback: () => (() => void) | void): () => void
    register(
      registration: ArtifactsSlotRegistration,
      component: (props: ArtifactsFilesActionProps) => ReactElement | null
    ): () => void
  }
  sidebarRight: ArtifactSidebarRight
}

/** Runtime modules the components close over. */
export interface ArtifactsComponentsDeps {
  React: typeof import('react')
  ReactDOM: typeof import('react-dom')
  RemixGlyph: ArtifactsGlyph
}

/** The installed components and their registration entry point. */
export interface ArtifactsComponents {
  ArtifactsPanel: (props: ArtifactsPanelProps) => ReactElement
  ArtifactsFilesAction: (props: ArtifactsFilesActionProps) => ReactElement
  installArtifacts(ctx: ArtifactsContext): void
}

/** Files-header tool button identity. */
const FILES_ACTION_ID = 'power-suite.files-artifacts'

/** Exact route serving the Session's artifact list. */
const LIST_ROUTE = browserRoute(ROUTES.sessionArtifactsList)

/** Artifact source filters, in display order. */
const FILTER_OPTIONS = ['all', 'generated', 'provided'] as const

/** A pointer event's only read member. */
interface ArtifactsPointerEvent {
  readonly target: unknown
}

/** A keydown event's only read members. */
interface ArtifactsKeyEvent {
  readonly key: string
  readonly defaultPrevented?: boolean
  preventDefault(): void
  stopPropagation(): void
}

/** A loose JSON object. */
type JsonRecord = Record<string, unknown>

/** Narrow an untrusted value to a JSON object. */
function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null ? value as JsonRecord : null
}

/** Read one string field, defaulting to the empty string. */
function readString(record: JsonRecord, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

/** Read one optional finite number. */
function readNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Read a response's error message, when it carries one. */
function readMessage(value: unknown): string | null {
  const record = asRecord(value)
  const message = record === null ? undefined : record.message
  return typeof message === 'string' ? message : null
}

/** Describe a caught error the way the inline panel did. */
function describeError(error: unknown): string {
  const record = asRecord(error)
  const message = record === null ? undefined : record.message
  return typeof message === 'string' && message.length > 0 ? message : String(error)
}

/** Whether a caught error is the request abort. */
function isAbortError(error: unknown): boolean {
  const record = asRecord(error)
  return record !== null && record.name === 'AbortError'
}

/** Normalize one untrusted list row. */
function normalizeArtifact(value: unknown): SessionArtifact | null {
  const record = asRecord(value)
  if (record === null) return null
  const name = readString(record, 'name')
  if (name.length === 0) return null
  const artifact: SessionArtifact = {
    path: readString(record, 'path'),
    name,
    attachmentId: readString(record, 'attachmentId'),
    provided: record.provided === true,
    presented: record.presented === true
  }
  if (typeof record.mime === 'string') artifact.mime = record.mime
  if (typeof record.mediaType === 'string') artifact.mediaType = record.mediaType
  const size = readNumber(record, 'size')
  if (size !== undefined) artifact.size = size
  const bytes = readNumber(record, 'bytes')
  if (bytes !== undefined) artifact.bytes = bytes
  const width = readNumber(record, 'width')
  if (width !== undefined) artifact.width = width
  const height = readNumber(record, 'height')
  if (height !== undefined) artifact.height = height
  const turn = readNumber(record, 'turn')
  if (turn !== undefined) artifact.turn = turn
  const promptOrdinal = readNumber(record, 'promptOrdinal')
  if (promptOrdinal !== undefined) artifact.promptOrdinal = promptOrdinal
  const description = record.description
  if (typeof description === 'string' && description.length > 0) artifact.description = description
  if (record.missing === true) artifact.missing = true
  return artifact
}

/** Normalize the list payload without trusting the Host shape. */
function readArtifactList(value: unknown): SessionArtifactList {
  const record = asRecord(value)
  if (record === null) return { artifacts: [], origin: null }
  const artifacts: SessionArtifact[] = []
  if (Array.isArray(record.artifacts)) {
    for (const entry of record.artifacts) {
      const artifact = normalizeArtifact(entry)
      if (artifact !== null) artifacts.push(artifact)
    }
  }
  return { artifacts, origin: typeof record.origin === 'string' ? record.origin : null }
}

/**
 * Create the artifacts components and installer for one entry instance.
 * @param deps - React runtime and the shared glyph builder.
 * @returns the panel, the Files action and their installer.
 */
export function createArtifactsComponents(deps: ArtifactsComponentsDeps): ArtifactsComponents {
  const { React, ReactDOM, RemixGlyph } = deps

  /**
   * Render the local stylesheet with the panel.
   *
   * A component-local style element is the sanctioned mechanism (no global
   * DOM owner). It travels with the panel instance, so several panels mount
   * duplicate copies rather than sharing global state.
   * @returns the style element.
   */
  function panelStyle(): ReactElement {
    return React.createElement('style', null, ARTIFACTS_CSS)
  }

  /**
   * Thin stroked chevron used by the artifacts filter trigger, matching the
   * shell's native dropdown caret rather than a filled arrow glyph.
   * @param size - rendered edge length in pixels.
   * @returns the SVG element.
   */
  function FilterCaretGlyph(size: number): ReactElement {
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

  /**
   * The row's glyph: one file outline.
   * @returns the SVG element.
   */
  function FileIcon(): ReactElement {
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
   * @param props - row and Host origin.
   * @returns the img or icon element.
   */
  function ArtifactGlyph(props: { artifact: SessionArtifact, origin: string | null }): ReactElement {
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
   * @param props - optional edge length and class.
   * @returns the SVG element.
   */
  function TrayIcon(props?: { size?: number, className?: string }): ReactElement {
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

  /**
   * Render the artifact list for one Session.
   * @param props - Session scope and copy.
   * @returns the panel element.
   */
  function ArtifactsPanel(props: ArtifactsPanelProps): ReactElement {
    const { sessionId, t, sidebarRight } = props
    // Optional: rendered by the Files-pane overlay so the list has a Back
    // affordance next to its own count/filter/refresh tools.
    const onBack = typeof props.onBack === 'function' ? props.onBack : null
    const [phase, setPhase] = React.useState<'loading' | 'ready' | 'error'>('loading')
    const [payload, setPayload] = React.useState<SessionArtifactList | null>(null)
    const [failure, setFailure] = React.useState('')
    const [reload, setReload] = React.useState(0)
    const [copiedPath, setCopiedPath] = React.useState<string | null>(null)
    const [copiedContentKey, setCopiedContentKey] = React.useState<string | null>(null)
    const [filter, setFilter] = React.useState('all')
    const [filterOpen, setFilterOpen] = React.useState(false)
    const filterWrapRef: MutableRefObject<HTMLElement | null> = React.useRef<HTMLElement | null>(null)
    const filterMenuRef: MutableRefObject<HTMLElement | null> = React.useRef<HTMLElement | null>(null)

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
              const body: unknown = await response.json()
              const remote = readMessage(body)
              if (remote !== null) message = remote
            } catch {
              // Keep the status text.
            }
            throw new Error(message)
          }
          const value: unknown = await response.json()
          return value
        })
        .then((value: unknown) => {
          if (!active) return
          setPayload(readArtifactList(value))
          setPhase('ready')
        })
        .catch((error: unknown) => {
          if (!active || isAbortError(error)) return
          setFailure(describeError(error))
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
      const onPointerDown = (event: ArtifactsPointerEvent): void => {
        const wrap = filterWrapRef.current
        if (wrap !== null && event.target instanceof Node && wrap.contains(event.target)) return
        setFilterOpen(false)
      }
      const onKeyDown = (event: ArtifactsKeyEvent): void => {
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
     * @param artifact - the row.
     * @returns void
     */
    function onCopy(artifact: SessionArtifact): void {
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
     * @param artifact - the row.
     * @returns void
     */
    function onCopyContent(artifact: SessionArtifact): void {
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
     * @param artifact - the row.
     * @returns void
     */
    function onOpen(artifact: SessionArtifact): void {
      if (artifact.provided) {
        window.open(attachmentUrl(artifact, 'inline', payload?.origin ?? null), '_blank', 'noopener,noreferrer')
        return
      }
      openArtifactPreview(sidebarRight, sessionId, artifact, payload?.origin ?? null)
    }

    // Artifacts that no longer exist cannot be opened or downloaded; the
    // Session log keeps them, but the panel shows only files that are still
    // on disk. The list route still reports the full set.
    const artifacts = (payload === null ? [] : payload.artifacts)
      .filter((artifact) => artifact.missing !== true)
    const origin = payload === null ? null : payload.origin
    // "Generated" filters the session's own workspace artifacts (written or
    // delivered); provided rows are the attachments the user supplied.
    const generatedCount = artifacts.filter((artifact) => !artifact.provided).length
    const providedCount = artifacts.length - generatedCount
    const filterCounts: Record<string, number> = { all: artifacts.length, generated: generatedCount, provided: providedCount }
    const shownArtifacts = filter === 'all'
      ? artifacts
      : artifacts.filter((artifact) => (filter === 'provided' ? artifact.provided : !artifact.provided))
    let countText: string
    if (filter !== 'all') {
      countText = artifacts.length === 1
        ? t('list.countOfOne', { shown: shownArtifacts.length })
        : t('list.countOf', { shown: shownArtifacts.length, total: artifacts.length })
    }
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
      const provided = artifact.provided
      const contentKind = artifactContentKind(artifact)
      const facts = provided
        ? [t('meta.provided')]
        : [artifact.presented ? t('meta.presented') : t('meta.generated'), t('meta.turn', { turn: artifact.turn })]
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

  /**
   * The Files-header action: a native-style tool button that swaps the Files
   * pane content for the current Session's artifacts list.
   *
   * A second click, Back, or Esc returns to Files; a Session change, pane
   * close, or plugin unload removes the overlay and all listeners/timers.
   * @param props - session-scoped slot props plus injected t/sidebarRight.
   * @returns the tool button and, while open, the overlay portal.
   */
  function ArtifactsFilesAction(props: ArtifactsFilesActionProps): ReactElement {
    const { t, sidebarRight } = props
    const slotSessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
    const [state, dispatch] = React.useReducer(filesArtifactsReduce, undefined, filesArtifactsInitialState)
    const phase = state.phase
    const open = phase === 'opening' || phase === 'open'
    const showing = phase !== 'files'
    const buttonRef: MutableRefObject<HTMLElement | null> = React.useRef<HTMLElement | null>(null)
    const viewRef: MutableRefObject<HTMLElement | null> = React.useRef<HTMLElement | null>(null)
    const stageRef: MutableRefObject<{ page: HTMLElement | null, content: HTMLElement | null }> = React.useRef({
      page: null,
      content: null
    })
    const previousPhaseRef: MutableRefObject<FilesArtifactsState['phase']> = React.useRef(phase)
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
      const place = (): void => {
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
      const onKeyDown = (event: ArtifactsKeyEvent): void => {
        if (event.key !== 'Escape' || event.defaultPrevented === true) return
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

    const content = stageRef.current.content
    const view = showing && content !== null
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
      })), content)
      : null

    return React.createElement(React.Fragment, null,
      React.createElement('style', null, FILES_ARTIFACTS_CSS),
      button,
      view)
  }

  /**
   * Register the artifacts dictionaries and the Files-header action.
   * @param ctx - client root context.
   * @returns void
   */
  function installArtifacts(ctx: ArtifactsContext): void {
    const t = ctx.locale.bind(ARTIFACTS_NS)
    ctx.effect(() => ctx.locale.register(ARTIFACTS_NS, { en: ARTIFACTS_EN, zh: ARTIFACTS_ZH }), 'power-suite: session-artifacts dictionaries')
    // The Files page header is the single artifacts entry point; the standalone
    // artifacts page type, its tab body and its Start-guide card are gone.
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.files.actions', () => ctx.slots.register({
      name: 'sidebar.right.tab.files.actions',
      id: FILES_ACTION_ID,
      order: 40,
      locale: ARTIFACTS_NS,
      inject: () => ({ t, sidebarRight: ctx.sidebarRight })
    }, ArtifactsFilesAction)), 'power-suite: session-artifacts Files action')
  }

  return { ArtifactsPanel, ArtifactsFilesAction, installArtifacts }
}
