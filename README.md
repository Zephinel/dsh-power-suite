# DSH Power Suite

One installable plugin for the DeepSeek Harness Web GUI that adds a small suite
of workday improvements around the conversation.

The installable unit is a single bundle, `@rexxin/dsh-power-suite` (Loader row
`power-suite`). Its features are modules inside the package, so the Plugin list
shows one plugin whose inventory grows with the suite.

| Feature | What it adds |
|---|---|
| [Session artifacts](docs/session-artifacts.md) | An **Artifacts** card in the right Sidebar's Start page listing the current Session's created and delivered files, with native open, download, and LAN link copy. |
| [Workspace presets](docs/workspace-default-presets.md) | A Workspace context-menu submenu that sets the default agent preset for new Sessions created in that Workspace. |
| [Dynamic Workspaces](docs/dynamic-workspaces.md) | The native Workspaces browser gains **Active Projects** and **Inactive Projects** buckets that follow running and recently active Sessions, plus a **Running & recent** card above the native header with single-line rows, right-edge disclosure chevrons, unread completions marked green until opened, a row hover detail (workspace, status, last active), nested subagent Sessions, and configurable retention windows. |
| [Prompt history](docs/prompt-history.md) | The configured modifier + ↑/↓ recalls prompts already sent in this Session; a right-edge rail lists them newest first with a hover full-text preview, an inline search, and click-to-copy. Plain arrows keep their original behavior. |
| [Draft attachments](docs/draft-attachments.md) | Attachments in a draft (pasted images, dropped or picked files) survive switching Sessions and coming back, for the page lifetime; the shell only persists the draft text. |
| [Interrupted sessions](docs/interrupted-sessions.md) | Sessions cut off by a restart carry an amber mark left of the title, a hover-only Continue action with a row mask, and a play-shaped composer submit control. |
| [Settings](docs/settings.md) | The bundle's Plugins page carries its own configuration section: the prompt-history modifier plus the two Dynamic Workspaces retention windows (finished Sessions and Active projects). |

New in 0.2.0:

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
- **Per-prompt timestamps** — the prompt-history route now returns each prompt's
  Session event time (`at`, or `null` when the log has none), so the rail and its
  hover card can show times while the keyboard recall keeps working unchanged.

The same plugin adds a shared **hover preview** to Artifacts rows and the native
Workspace files tree: Markdown, highlighted code, images, audio/video, PDF, and
HTML, with drag-to-resize and animated switching.

![Artifacts card in the Start guide](docs/assets/artifacts-guide.png)

![Artifacts panel listing this session's files](docs/assets/artifacts-panel.png)

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
