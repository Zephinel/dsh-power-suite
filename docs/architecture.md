# Architecture

The suite is one DSH bundle with two halves that share no runtime code:

```
src/index.js            Host entry (Node)
├─ features/session-artifacts/host.js    GET  /api/session-artifacts.list
│                                        GET|HEAD /api/session-artifacts.raw
│                                        GET|HEAD /api/session-artifacts.attachment
│                                        GET  /api/session-artifacts.preview
├─ features/workspace-presets/host.js    GET  /api/workspace-presets.get
│                                        POST /api/workspace-presets.set
├─ features/prompt-history/host.js       GET  /api/prompt-history.list
├─ features/interrupted-sessions/host.js GET  /api/power-suite.interrupted
│                                        POST /api/power-suite.continue
├─ features/settings/host.js             GET/POST /api/power-suite.settings
├─ features/project-view/host.js         GET  /api/power-suite.project
└─ ctx.effect(...)                       every registration lives with the plugin

src/client.js           Browser entry (DSH module loader)
├─ Artifacts panel (generated + provided rows, thumbnails, source filter)
│  + right-Sidebar guide card
├─ Workspace preset context-menu submenu
├─ Composer prompt-history keys + right-edge history rail
├─ Draft attachment memory seat (invisible)
├─ Dynamic Workspaces buckets + running & recent Sessions card
├─ Interrupted-session rail badge + Continue seat + composer play icon
├─ Plugins-page settings section
├─ Standalone Project page seat (content-area Overview / Sessions / Runs / Settings)
└─ Shared hover Quick Look for generated/provided Artifacts rows and native Workspace file rows
```

## Host half

`src/index.js` exports the stable Loader name (`power-suite`) and the union of
Host services the features may use. Each feature exports an `install<Feature>`
function; the entry calls them inside `apply`. All routes, events, and caches
are registered through `ctx.effect`, so unloading the plugin removes them.

Routes are registered with `ctx.connection.fetch.register`, which puts them
behind the same browser authentication and Host/Origin fence as the rest of the
GUI. JSON responses are `no-store`.

### Session artifacts

The list merges two folds of the Session log. Generated/delivered artifacts come
from successful `write`, `edit`, and `str_replace_editor` calls plus files
delivered with `present`; **user-provided attachments** come from the image and
file blocks of human `user/message` events (source kind `user` only), deduped by
attachment id with the newest occurrence winning and carrying a 1-based prompt
ordinal. Both kinds are sorted newest-first by event sequence and live sizes are
resolved through the filesystem; missing rows keep `missing: true` in the payload
and the panel hides them.

The workspace-file raw route serves bytes (64 MiB cap) and the preview route
returns a hover descriptor plus a bounded 16 KiB text window. The separate
`GET|HEAD /api/session-artifacts.attachment` route serves provided attachments
from the durable attachment store: images through the verified image read (stored
media type/dimensions/byte size are re-checked), generic files through the
verified file read with a magic-byte sniff, all with the same no-store,
`nosniff`, and sandbox-CSP headers as the raw route and with typed
400/404/413/499/503 failures. A composition without the attachment service omits
provided rows. The browser renders a 40 px lazy thumbnail for every image
artifact and a custom All/Generated/Provided dropdown filter in the panel header
(right of the count, immediately left of Refresh) that works purely client-side
over the loaded list: a `filter-line` trigger with the option label/count and a
rotating caret, a themed right-aligned `menu`/`menuitemradio` popup with counts
and a check on the selected option, focus moved to the selected option on open,
outside-press/Escape dismissal with focus returned to the trigger, and an
All reset on Session change.

Each row's actions are Open, Download, Copy content, and Copy link. Copy content
classifies the artifact by media type and extension into **text** (text mime
types, JSON/XML/YAML/JavaScript application types, and common
markdown/text/code/config extensions), **image**, or **none** (no button). Text
is fetched through the row's inline URL — the raw route for workspace files, the
verified attachment route for provided files — and copied verbatim with the
existing clipboard helper (async Clipboard API, legacy `execCommand` fallback).
Images are fetched the same way and follow a three-step chain: a PNG
`ClipboardItem` write when the async clipboard exists (secure context), with
non-PNG images converted through `createImageBitmap` + canvas; on an insecure
origin a hidden `<img>` is selected and the legacy `execCommand('copy')` runs
inside the click gesture, putting HTML-with-image on the clipboard (rich editors
paste the picture, plain-text targets may receive nothing/alt); only then does
it copy the inline image URL as text. Failures leave no acknowledgement; a
successful copy shows the row's check state for 1.6 s.

### Prompt history

The route reads the Session log rather than the loaded chat window, so prompts
from earlier pages are recallable. `GET /api/prompt-history.list` folds human
`user/message` events into oldest-first entries `{ seq, text, at }`, capped at
500. `at` is the event's epoch-millisecond time, or `null` when the recorded
event has no usable time; a Host that predates timestamps omits the field, and
the browser tolerates both shapes.

### Workspace presets and settings

Both features persist small JSON documents in the suite's Host storage. The
settings document is schema version 2 and holds the prompt-history modifier mode
plus the two Dynamic Workspaces retention windows: `recentSessionMinutes`
(finished-Session retention, 1/2/6/12/24 hours, default 120) and
`activeProjectDays` (Active-project retention, 1/3/7/14/30 days, default 7).
Version-1 files (modifier only) migrate to the default windows on read; the
Plugins page edits the same authenticated route. The preset map is keyed by
Workspace id. Neither writes into session logs.

The suite's Plugins-page settings section hides the bundle page's auto-rendered
package README document (`[data-detail-document]`) while the section is mounted
and restores it on unmount, so the page shows only the real controls.

### Interrupted sessions

The Host folds `turn/start` and `turn/end` events and treats a turn as
interrupted when its end reason is `interrupted`, or when the log ends inside an
open turn and the Agent is no longer running. Results are cached and refreshed
from `session/event`; the route supports a `refresh` query for explicit
re-reads.

## Browser half

`src/client.js` is loaded by `window.__ModuleLoader__.load`. Its `apply`
registers slots, tab types, context menus, and the plugin settings surface
through the injected client services (`slots`, `locale`,
`sidebarRight`, `sidebarRightTabs`, `contextMenus`, `remote`, `uiWorkspace`,
`sessions`).

The client talks to the Host only over the authenticated routes above; it never
imports Host code. Feature copy is registered through per-feature locale
namespaces (`sessionArtifacts`, `workspacePresets`, `dynamicWorkspaces`,
`powerSuitePromptHistoryPreview`, `powerSuiteInterrupted`, `powerSuiteSettings`,
`powerSuiteProjectView`) so the en/zh dictionaries stay aligned. The client
entry also injects the shell's `sessions` listing service for the Project view's
session navigation and preset roster.

### Dynamic Workspaces

The one feature that augments a native surface instead of contributing a slot
surface of its own. A `shell.overlay` seat reads the browser's Session, Session
status, and Workspace stores, inserts a summary card above the native Workspaces
header and two bucket headers into the native `[role="tree"]`, and writes flex
`order` values on the native group sections to band Active Projects above
Inactive Projects. Inside the card, running, recent, and direct subagent
Sessions are derived from the same stores: rows are single-line (glyph, title,
time) with disclosure chevrons at the far right, subagent rows nest under their
parent, and each row's workspace title and path, status, last-active time, and
subagent count live in a native-style hover card that does not capture the
pointer. Both retention windows are Host settings: finished-Session retention
(`recentSessionMinutes`) bounds the card and its nested subagent rows, and
Active-project retention (`activeProjectDays`) bounds the Active bucket, with
running Sessions always listed and always active. The card header's indicator is
a blue pulsing business-primary dot while any listed Session runs and the white
RemixIcon `sparkling-line` when nothing runs, horizontally centred on the same
glyph column as the row glyphs and followed by the title on the row-title
column; the header chevron shares one right-edge centre column with the row
disclosure arrows. The leading glyph has
three states: the shell loading indicator while running, the green done dot while
a completion is unread, and a white session-type icon (RemixIcon `deepseek-fill`
for main rows, `robot-2-line` for subagent rows) once the Session has been opened
and the completion acknowledged; a new run clears the acknowledgement. The card
body hides its scrollbar, rows have no native tooltips, and the row body and
disclosure arrow highlight independently (the body highlight has 8 px horizontal
inner padding).
A parent counts as active while a direct child runs. A `MutationObserver` on the
sidebar reconciles the foreign nodes after native re-renders; unload removes them
and restores the inline styles. The native browser keeps owning every row, menu,
search, drag, and dialog. See [dynamic-workspaces.md](dynamic-workspaces.md).

### Prompt history rail

A `conversation.input.dock` registration supplies the Session-scoped hooks
(`sessionId`, `useInput`, `inputActions`, `t`), but the component renders nothing
in the composer flow: its visible surfaces are body-portaled, fixed-position
elements. The rail is a fixed 28 px column at the Conversation's right edge,
directly below the native turn rail (detected by geometry: the tiny buttons near
the scroll surface's right edge, with no native class names), separated by a
short divider and falling back to the vertical middle of the scrollport when
there is no room below. Its marks reuse the native turn-rail tick style
(20 x 2 px, 60 % width at rest, 90 % on hover, right-aligned on the native
column), with a horizontal 32 x 1 divider and no visible scrollbar; a long
history caps at `min(available band, 420 px)` and scrolls its ticks internally
behind 24 px fade masks while the pinned 20 x 22 search button stays at the
foot. The full-text hover card follows the native preview card style
(line-clamped, panel elevation). The search card opens directly below the pinned
magnifier (right edge on the rail column) or, with no room above the composer,
to the magnifier's left (right edge 8 px from the button), clamped above the
composer; both cards are portaled to the document body. A clicked prompt is
copied silently through the Session input's `setDraft` — exact draft text and
composer focus, with no confirmation chip, icon, or animation. Placement is re-measured in one animation frame on resize, scroll,
composer height, sidebar width, and native-rail changes. Registration id
`power-suite.prompt-history-preview`, order 100, locale namespace
`powerSuitePromptHistoryPreview`.

### Draft attachment memory

An invisible Seat in `conversation.input.overlay` (id
`power-suite.draft-attachments`) works around a shell limitation: the shell
persists a Session draft's text and reference chips, but browser-owned
attachment Files live only in the mounted input controller. While a Session's
composer is mounted, the Seat captures Files from paste, drop, and picker events
(<= 20 files per Session, <= 8 Sessions, page lifetime) and, when the Session is
shown again with no attachment restored by the shell, re-introduces them through
the composer's own paste intake using a synthetic `ClipboardEvent` with a
`DataTransfer`. The cache clears on send and on explicit removal of every
restored attachment. No Host route and no storage writes: this is a page-lifetime
workaround, so a reload cannot restore Files. See
[draft-attachments.md](draft-attachments.md).

### Project view

A standalone page in the content area right of the left Workspaces sidebar, not
a conversation view. An invisible `shell.overlay` seat (id
`power-suite.project-page`, locale namespace `powerSuiteProjectView`, custom
`psv-` token CSS) listens for the window CustomEvent
`power-suite:open-project` (`detail.workspaceId`) and renders one
`position: fixed; top: 0` page with inline measured `left`/`width`/`height`: the
left edge is the sidebar slot's docked-box right edge (`[data-slot="sidebar"]`,
`display: contents`, first element child; zero-width/absent sidebar → 0), the
width is the viewport width minus that edge, and the height is the viewport
height. So the left sidebar stays visible and interactive, the page covers the
composer/right sidebar/history rails, and clicking another Workspace switches the
same page instance in place. Geometry is re-measured through one rAF-coalesced
callback (ResizeObservers on the sidebar slot/docked box/container,
MutationObserver for a replaced subtree, window resize, a 500 ms settle interval)
with cleanup on close. The page has its own top bar (back/close chevron, project
title, Active/Inactive badge, refresh) above the unchanged four tabs (Overview /
Sessions / Runs / Settings); Esc and the back control close it; opening never
navigates and closing restores the conversation, current Session, composer
draft, selected conversation view, and both sidebar states. It is not modal
(`aria-modal` is not set). The page is workspace-scoped: it fetches
`GET /api/power-suite.project?workspaceId=…` (15 s poll, window-focus refresh,
manual `refresh=1`, `AbortController` cancels stale requests on a workspace
switch) and handles loading/error/404-empty states. Header navigation (Open
Workspace, New Session, Sessions-list click) closes the page then navigates;
refresh, Copy project path, settings presets, and Runs expansion stay in-page.
A single document-level capture click handler on sidebar Workspace titles
dispatches the open event; the native fold chevron, row context menu, New Session
button, Session rows, drags, and modified/non-primary clicks stay native, the
Workspace service is resolved lazily through `ctx.get('workspaces')`, and effect
cleanup removes the handler and the event listener so HMR cannot stack them.

The Host route resolves a Workspace from `workspaceId` or from a `sessionId`
(direct membership → durable parent chain → canonical cwd), measures the newest
20 accounted non-archived Sessions (concurrency 4, fork-inherited event prefix
sliced, unreadable logs skipped into `warnings[]`), and folds each log with the
pure helpers in `project-view/fold.js`: turn/start..turn/end runs, the coarse
status map, and job association by exact tool-call id → time containment →
nearest preceding turn. Caps are 40 runs per Session, 200 runs total, and 24 job
rows per run (with the full `jobCount` kept). A 10 s in-memory snapshot cache
(keyed by Workspace id + `updatedAt` + member count, at most 30 snapshots) absorbs
the browser poll, `refresh=1` bypasses it, and every response is
`cache-control: no-store`; missing parameters answer `400`, unknown/unaccounted
Workspaces `404`.

### Hover Quick Look

One hover card serves the Artifacts panel and the native workspace-files list. Row
hover detection accepts both `data-artifact-path` (generated/workspace rows) and
`data-artifact-provided` (provided rows); a provided entry carries its
`attachmentId`, recorded media type/bytes/dimensions, and attachment-route
inline/download URLs. Workspace files fetch their descriptor from the
`api/session-artifacts.preview` route; provided images and media render through
the verified attachment route, provided text-like files are fetched read-only and
clipped at 64 KiB, and other provided types show the unavailable state. The card's
Open/Download controls reuse the originating row's actions, so provided rows use
their attachment URLs.

`positionQuickLook` always assigns an explicit card height — the default 570 x 360
px (clamped to the viewport, overridden by a remembered/resized size) — because
the content layers are absolutely positioned inside the body and a height-less
card collapsed to header and footer. Layer mounting no longer relies on an inline
opacity style or an animation finishing, so a throttled/canceled animation cannot
leave the content invisible.

### Slots used

| Slot | Purpose |
|---|---|
| `sidebar.right.pane.tab` | Artifacts tab type and the shared hover preview |
| `sidebarRightTabs.register` | Artifacts guide card on the Start page |
| `contextMenu.icon` | Workspace menu icon |
| `contextMenus.register` (`workspace`) | Default agent preset submenu |
| `conversation.input.overlay` | Renderless prompt-history keyboard seat and draft-attachment memory seat |
| `conversation.input.dock` | Session hooks for the body-portaled prompt-history rail |
| `shell.overlay` | Frame-wide seats: Dynamic Workspaces sidebar augmentation and the standalone Project page (`power-suite.project-page`) |
| `plugins.bundle.config` | Plugin settings page |
| `sidebar.session.row.leading` | Interrupted-session badge |
| `sidebar.workspaces.session.row.action` | Continue action |

## Invariants

- One plugin row; features never register a second Loader entry.
- Host routes stay under `/api/` and are authenticated.
- Browser code uses theme tokens and native icons; no fixed palette of its own.
- Native-surface enhancements augment the shipped DOM with sibling nodes and
  inline `order`/`display` only; they never replace or re-render the native
  subtree, and unload removes every inserted node and restores every touched
  style.
- Missing/unknown data is hidden or explained; it is never rendered as a dead
  artifact row or a fake interrupted state.
- Pure state derivation lives in feature modules and is covered by
  `node:test`; UI wiring stays in `src/client.js`.

## Verification

`npm run check` runs the same syntax/manifest checks CI uses; `npm test` runs the
pure-logic suites. See [verification.md](verification.md) for the current
evidence and [development.md](development.md) for the local loop.
