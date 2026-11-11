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
├─ Composer prompt-history key handling
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
registers slots, tab types, context menus, commands, and the plugin settings
surface through the injected client services (`slots`, `locale`,
`sidebarRight`, `sidebarRightTabs`, `contextMenus`, `remote`, `uiWorkspace`).

The client talks to the Host only over the authenticated routes above; it never
imports Host code. All feature copy is registered through the `sessionArtifacts`
locale namespace so en/zh dictionaries stay aligned.

### Slots used

| Slot | Purpose |
|---|---|
| `sidebar.right.pane.tab` | Artifacts tab type and the shared hover preview |
| `sidebarRightTabs.register` | Artifacts guide card on the Start page |
| `contextMenu.icon` | Workspace menu icon |
| `contextMenus.register` (`workspace`) | Default agent preset submenu |
| `conversation.input.overlay` | Prompt-history behavior and composer controls |
| `plugins.bundle.config` | Plugin settings page |
| `sidebar.session.row.leading` | Interrupted-session badge |
| `sidebar.workspaces.session.row.action` | Continue action |
| `sidebar.session.row.hover` | Row mask for the Continue seat |

## Invariants

- One plugin row; features never register a second Loader entry.
- Host routes stay under `/api/` and are authenticated.
- Browser code uses theme tokens and native icons; no fixed palette of its own.
- Missing/unknown data is hidden or explained; it is never rendered as a dead
  artifact row or a fake interrupted state.
- Pure state derivation lives in feature modules and is covered by
  `node:test`; UI wiring stays in `src/client.js`.

## Verification

`npm run check` runs the same syntax/manifest checks CI uses; `npm test` runs the
pure-logic suites. See [verification.md](verification.md) for the current
evidence and [development.md](development.md) for the local loop.
