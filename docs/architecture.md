# Architecture

The suite is one DSH bundle with two halves that share no runtime code:

```
src/index.js            Host entry (Node)
├─ features/session-artifacts/host.js    GET  /api/session-artifacts.list
│                                        GET  /api/session-artifacts.raw
│                                        GET  /api/session-artifacts.preview
├─ features/workspace-presets/host.js    GET  /api/workspace-presets.get
│                                        POST /api/workspace-presets.set
├─ features/prompt-history/host.js       GET  /api/prompt-history.list
├─ features/interrupted-sessions/host.js GET  /api/power-suite.interrupted
│                                        POST /api/power-suite.continue
├─ features/settings/host.js             GET/POST /api/power-suite.settings
└─ ctx.effect(...)                       every registration lives with the plugin

src/client.js           Browser entry (DSH module loader)
├─ Artifacts panel + right-Sidebar guide card
├─ Workspace preset context-menu submenu
├─ Composer prompt-history keys + right-edge history rail
├─ Draft attachment memory seat (invisible)
├─ Dynamic Workspaces buckets + running & recent Sessions card
├─ Interrupted-session rail badge + Continue seat + composer play icon
├─ Plugins-page settings section
└─ Shared hover Quick Look for Artifacts rows and native Workspace file rows
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

Artifacts are derived from the session log: successful `write`, `edit`, and
`str_replace_editor` calls plus files delivered with `present`. The Host streams
and folds the log, resolves paths, and returns a list plus raw/preview routes.
The raw route serves file bytes (with a 64 MiB cap) and the preview route
returns a descriptor plus a bounded 16 KiB text window. Missing files are
marked `missing: true` in the payload; the panel hides them.

### Prompt history

The route reads the Session log rather than the loaded chat window, so prompts
from earlier pages are recallable. `GET /api/prompt-history.list` folds human
`user/message` events into oldest-first entries `{ seq, text, at }`, capped at
500. `at` is the event's epoch-millisecond time, or `null` when the recorded
event has no usable time; a Host that predates timestamps omits the field, and
the browser tolerates both shapes.

### Workspace presets and settings

Both features persist small JSON documents in the suite's Host storage. The
settings document currently holds the prompt-history modifier mode; the preset
map is keyed by Workspace id. Neither writes into session logs.

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
`sidebarRight`, `sidebarRightTabs`, `contextMenus`, `remote`, `uiWorkspace`).

The client talks to the Host only over the authenticated routes above; it never
imports Host code. Feature copy is registered through per-feature locale
namespaces (`sessionArtifacts`, `workspacePresets`, `dynamicWorkspaces`,
`powerSuitePromptHistoryPreview`, `powerSuiteInterrupted`, `powerSuiteSettings`)
so the en/zh dictionaries stay aligned.

### Dynamic Workspaces

The one feature that augments a native surface instead of contributing a slot
surface of its own. A `shell.overlay` seat reads the browser's Session, Session
status, and Workspace stores, inserts a summary card above the native Workspaces
header and two bucket headers into the native `[role="tree"]`, and writes flex
`order` values on the native group sections to band Active Projects above
Inactive Projects. Inside the card, running, recent, and direct subagent
Sessions are derived from the same stores: subagent rows nest under their parent
with a disclosure toggle, and a parent counts as active while a direct child
runs. A `MutationObserver` on the sidebar reconciles the foreign nodes after
native re-renders; unload removes them and restores the inline styles. The
native browser keeps owning every row, menu, search, drag, and dialog. See
[dynamic-workspaces.md](dynamic-workspaces.md).

### Prompt history rail

A `conversation.input.dock` registration supplies the Session-scoped hooks
(`sessionId`, `useInput`, `inputActions`, `t`), but the component renders nothing
in the composer flow: its visible surfaces are body-portaled, fixed-position
elements. The rail is a fixed 28 px column at the Conversation's right edge,
directly below the native turn rail (detected by geometry: the tiny buttons near
the scroll surface's right edge, with no native class names), separated by a
short divider and falling back to the vertical middle of the scrollport when
there is no room below. It lists prompts newest first as tick marks, portals the
full-text hover card and the on-demand search card to the document body, and
copies a clicked prompt through the Session input's `setDraft`. Placement is
re-measured in one animation frame on resize, scroll, composer height, sidebar
width, and native-rail changes. Registration id
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

### Slots used

| Slot | Purpose |
|---|---|
| `sidebar.right.pane.tab` | Artifacts tab type and the shared hover preview |
| `sidebarRightTabs.register` | Artifacts guide card on the Start page |
| `contextMenu.icon` | Workspace menu icon |
| `contextMenus.register` (`workspace`) | Default agent preset submenu |
| `conversation.input.overlay` | Renderless prompt-history keyboard seat and draft-attachment memory seat |
| `conversation.input.dock` | Session hooks for the body-portaled prompt-history rail |
| `shell.overlay` | Frame-wide seat that augments the native Workspaces sidebar |
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
