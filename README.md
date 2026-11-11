# DSH Power Suite

One installable plugin for the DeepSeek Harness Web GUI that adds a small suite
of workday improvements around the conversation.

The installable unit is a single bundle, `@rexxin/dsh-power-suite` (Loader row
`power-suite`). Its features are modules inside the package, so the Plugin list
shows one plugin whose inventory grows with the suite.

| Feature | What it adds |
|---|---|
| [Session artifacts](docs/session-artifacts.md) | An **Artifacts** card in the right Sidebar's Start page listing the current Session's created and delivered files **and the images/files the user attached to their prompts**, with 40 px image thumbnails, an All/Generated/Provided dropdown filter in the panel header, native open, download, copy content (text verbatim; images as a real clipboard picture in a secure context, with an HTML-image fallback on plain HTTP), and LAN link copy. |
| [Workspace presets](docs/workspace-default-presets.md) | A Workspace context-menu submenu that sets the default agent preset for new Sessions created in that Workspace. |
| [Dynamic Workspaces](docs/dynamic-workspaces.md) | The native Workspaces browser gains **Active Projects** and **Inactive Projects** buckets that follow running and recently active Sessions, plus a **Running & recent** card above the native header with single-line rows, right-edge disclosure chevrons, Host-shared read marks (unread completions green until opened, synced across browsers), true last-activity times for long runs, a rainbow ring on the current chat, row hover actions (interrupted Continue, same-directory New session), a row hover detail, nested subagent Sessions, and configurable retention windows. |
| [Prompt history](docs/prompt-history.md) | The configured modifier + ↑/↓ recalls prompts already sent in this Session; a right-edge rail lists them newest first with a hover full-text preview, an inline search, and click-to-copy. Plain arrows keep their original behavior. |
| [Project view](docs/project-view.md) | A **standalone Project page** (content area right of the sidebar) opened by clicking a Workspace, with Overview stats, Sessions, Runs with expandable turn/job records, and Workspace settings; the sidebar stays interactive for switching, the page hides the prompt-history rail and keeps one top-bar Refresh, and Esc/back returns to the untouched conversation. |
| [Draft attachments](docs/draft-attachments.md) | Attachments in a draft (pasted images, dropped or picked files) survive switching Sessions and coming back, for the page lifetime; the shell only persists the draft text. |
| [Interrupted sessions](docs/interrupted-sessions.md) | Sessions cut off by a restart carry an amber mark left of the title, a hover-only Continue action with a row mask, and a play-shaped composer submit control. |
| [Settings](docs/settings.md) | The bundle's Plugins page carries its own configuration section: the prompt-history modifier plus the two Dynamic Workspaces retention windows (finished Sessions and Active projects). |

New in 0.2.0:

- **Session artifacts for provided attachments** — the Artifacts card now also
  lists the images and files the human attached to their prompts, de-duplicated
  by attachment id (newest wins) and served by a verified attachment route, with
  40 px lazy thumbnails, a client-side All/Generated/Provided dropdown filter in
  the panel header, and the same open/download/copy-content/copy-link actions
  adapted to the attachment store (Copy image writes a real PNG item on HTTPS/
  localhost and uses the legacy HTML-image clipboard on plain HTTP).
- **Dynamic Workspaces** — the shipped sidebar is augmented, never replaced:
  Active/Inactive buckets follow the running and recent Sessions live, fold
  independently with persisted state, and hide in rail mode, while a **Running &
  recent** card above the native header lists running and recently finished
  Sessions as single-line rows, nests delegated subagent Sessions under their
  parent, marks unread completions green until the Session is opened, opens any
  row, and shows workspace/status/last-active detail on hover. Both retention
  windows (finished Sessions 1–24 h, default 2 h; Active projects 1–30 days,
  default 7) are settings on the bundle's Plugins page.
- **Prompt history preview** — a vertical rail at the conversation's right edge
  shows the current Session's prompts newest first as tick marks, with the full
  prompt on hover, an inline search, and click-to-copy into the draft.
- **Draft attachment memory** — attachments in a draft survive switching
  Sessions and coming back for the page lifetime, even though the shell only
  persists the draft's text and reference chips.
- **Project view** — clicking a Workspace's title in the sidebar opens a
  standalone Project page in the content area right of the sidebar
  (Esc/back closes it and restores the Session, draft, view, and sidebars
  untouched). It turns the Workspace into a project dashboard: four stat cards, a Sessions browser, a Runs history
  whose turns expand into their nested job records with live elapsed time, and
  Workspace settings (default agent preset, read-only grouping windows, path
  actions).
- **Project page polish** — while the Project page is open it hides the
  body-portaled prompt-history rail and keeps a single top-bar Refresh (the old
  tab-bar/header refresh buttons are gone); closing restores the rail
  immediately.
- **Shared card read marks** — the activity card's acknowledgements are stored
  by the Host in `read-acks.json` and synced to every browser of the profile
  (with a local cache and a 1 s derived-read tolerance), so a reload or another
  browser no longer resurrects stale green dots.
- **True activity times on the card** — a new read-only Host route supplies real
  last-activity timestamps, so a turn that ran for hours keeps its true
  completion age and stays in the recent window instead of vanishing when it
  stops.
- **Current-chat rainbow ring** — the card marks the Session the main
  conversation currently shows with an animated rainbow ring (static under
  reduced motion) that follows every way of opening a Session.
- **Per-prompt timestamps** — the prompt-history route now returns each prompt's
  Session event time (`at`, or `null` when the log has none), so the rail and its
  hover card can show times while the keyboard recall keeps working unchanged.

The same plugin adds a shared **hover preview** to Artifacts rows (generated
files plus provided images and text-like attachments) and the native Workspace
files tree: Markdown, highlighted code, images, audio/video, PDF, and HTML, with
drag-to-resize and animated switching. The card opens at a 570 x 360 default so
its content is visible on the first hover.

![Quick Look card showing rendered Markdown content](docs/assets/artifacts-quicklook.png)

![Artifacts card in the Start guide](docs/assets/artifacts-guide.png)

![Artifacts panel listing generated files and user-provided attachments](docs/assets/artifacts-panel.png)

## Install

The package is installed into the active DSH profile as a local `link:` bundle:

```text
plugin_manager action=install_bundle target=/Users/rexxin/Development/dsh-power-suite
```

Changes are profile-wide and survive restarts. After changing Host code, reload
the plugin (or restart the Host process); after changing browser code, reload
the Web page.

## Repository layout

```text
.
├── package.json             # bundle manifest, exports, checks
├── cordis.patch.yml         # inserts the single `power-suite` row
├── src/
│   ├── index.js             # Host entry: installs each feature
│   ├── client.js            # browser entry: one `#region feature: <name>` per feature
│   └── features/<name>/     # Host-side feature modules
├── locale/                  # plugin display metadata (en, zh)
├── docs/                    # architecture, guides, per-feature reference
├── scripts/check.mjs        # syntax + package-manifest check
├── test/                    # node:test pure-logic tests
└── .github/workflows/       # CI
```

## Development

No build step is required: the package exports its ES modules directly.

```bash
npm test               # node --test test/*.test.js
npm run check          # syntax + manifest + tests
npm run pack:check     # inspect the published file list
```

See [docs/development.md](docs/development.md) for the local install/reload loop
and [docs/architecture.md](docs/architecture.md) for the Host/Client contracts.

## Documentation

- [Architecture](docs/architecture.md) — Host and browser halves, routes, slots, settings.
- [Usage](docs/usage.md) — what each feature does in the UI.
- [Development](docs/development.md) — install, reload, tests, adding a feature.
- [Verification](docs/verification.md) — the checks and evidence for this checkout.
- [Limitations](docs/limitations.md) — known bounds and unsupported cases.
- [Feature reference](docs/overview.md) — the feature inventory and addition recipe.

## License

[MIT](LICENSE). Third-party notices are in [NOTICE](NOTICE).
