# DSH Power Suite

One installable DSH plugin for a growing set of small DeepSeek Harness Web GUI
enhancements. The suite is a single Loader row (`power-suite`) whose features are
modules inside the package, so the Plugin list shows one plugin and its
inventory grows with the suite.

## Features

| Feature | What it adds | Reference |
|---|---|---|
| Session artifacts (`session-artifacts`) | An **Artifacts** card in the right Sidebar's Start page that lists the current Session's created and delivered files plus the images/files the user attached to their prompts, with 40 px thumbnails, an All/Generated/Provided dropdown filter in the panel header, a hover Quick Look for both sources, in-browser open, download, copy content (text verbatim; images as a real clipboard picture in a secure context with an HTML-image fallback on plain HTTP), and LAN link copy. | [session-artifacts.md](session-artifacts.md) |
| Workspace presets (`workspace-presets`) | A Workspace context-menu submenu that sets the default agent preset for new Sessions created in that Workspace. | [workspace-default-presets.md](workspace-default-presets.md) |
| Dynamic Workspaces (`dynamic-workspaces`) | The native Workspaces browser is augmented with **Active Projects** and **Inactive Projects** buckets that follow running and recently active Sessions, plus a **Running & recent** card above the native header with single-line rows, right-edge disclosure chevrons, Host-shared read marks (unread completions green until opened, synced across browsers sharing the DSH home), event-sourced Host last-activity times for long runs, a rainbow ring on the current chat, row hover actions (interrupted Continue, same-directory New session), a row hover detail, nested subagent Sessions, and configurable retention windows. | [dynamic-workspaces.md](dynamic-workspaces.md) |
| Prompt history (`prompt-history`) | The configured modifier + ↑/↓ recalls prompts already sent in this Session; plain arrows keep their original behavior. A vertical right-edge rail lists the same prompts newest first as native-style tick marks, with a native-style hover preview card, a pinned-search card that opens below or beside the magnifier, per-prompt timestamps, and click-to-copy. | [prompt-history.md](prompt-history.md) |
| Project view (`project-view`) | A **standalone Project page** in the content area right of the sidebar, opened by clicking a Workspace and closed with Esc/back: Overview stat cards and recent activity, a Sessions browser, a Runs history with expandable turn/job records and live elapsed time, and Workspace settings (default preset, grouping windows, path actions). The left sidebar stays interactive, so another Workspace switches the page in place; while open the page hides the prompt-history rail and keeps a single top-bar Refresh. | [project-view.md](project-view.md) |
| Draft attachments (`draft-attachments`) | Browser-owned attachments in a draft (pasted images, dropped or picked files) are remembered per Session and re-introduced on return; the shell persists only the draft's text and reference chips. | [draft-attachments.md](draft-attachments.md) |
| UI element annotation (`ui-annotation`) | A floating launcher toggles a point-and-click annotation mode: the page shrinks by a responsive right rail, hovering outlines the candidate element, a note popover carries the locator summary, live resolution status, ancestor level up/down, and the note (inserted verbatim, line breaks preserved), and references are inserted into the current composer as one localized block or one ordered batch from a session-scoped collection with de-duplication, per-entry notes, and stale/ambiguous markers. Multi-select and marquee, a pass-through modifier, and browser-local modifier settings are included; opening the Project page exits annotation mode. | [ui-annotation.md](ui-annotation.md) |
| Settings (`settings`) | The bundle's own configuration section on its Plugins page: the prompt-history modifier plus the two Dynamic Workspaces retention windows (finished Sessions 1/2/6/12/24 hours, default 2; Active projects 1/3/7/14/30 days, default 7). | [settings.md](settings.md) |
| Interrupted sessions (`interrupted-sessions`) | Sessions whose last turn did not finish — restart/crash, any provider/model/network error (quota, timeout, rate limit), an output limit, or an imported unknown cancellation — get an amber mark left of the title, a hover-only Continue action under a row mask, and a play-shaped submit control in the composer; deliberate cancellations and completed turns stay unmarked. | [interrupted-sessions.md](interrupted-sessions.md) |

## Install

```text
plugin_manager action=install_bundle target=/Users/rexxin/Development/dsh-power-suite
```

The profile keeps this package as a `link:` dependency, so an edited checkout is
the code the Host runs after a restart. Removing the bundle removes the plugin.

## Layout

```
.
  package.json              # bundle patch + exports + checks
  cordis.patch.yml          # inserts the single `power-suite` row
  src/index.js              # Host entry: calls each feature's installer
  src/features/<name>/      # Host-side feature modules
  src/client.js             # browser entry: one `#region feature: <name>` per feature
  locale/                   # plugin display metadata (en, zh)
  docs/                     # architecture, guides, per-feature reference
  test/                     # pure-logic tests (node --test)
```

## Add a feature

1. Host side: create `src/features/<name>/host.js` exporting
   `install<Name>(ctx)`; register routes, services, and events inside
   `ctx.effect`. Call the installer from [`src/index.js`](../src/index.js) and add any new
   service names to its `inject` union.
2. Browser side: add a `//#region feature: <name>` section to [`src/client.js`](../src/client.js)
   with its tab type, guide card, slot component, and copy. The entry's `apply`
   registers each feature's contributions.
3. Feature routes live under `/api/<feature>.*` and use
   `ctx.connection.fetch.register`, so they sit behind the same browser
   authentication and Host/Origin fence as the rest of the GUI.
4. Put user-facing reference in `docs/<name>.md` and, when the display text is
   user-visible, add the copy to the locale dictionaries.
5. Add a pure-logic test under `test/` when a feature derives state from the
   Session log.
6. A user preference belongs in the suite settings document
   (`src/features/settings/` + the Plugins-page section in `src/client.js`); see
   [settings.md](settings.md).

Features share one plugin row; enabling or disabling the plugin toggles them
together. A feature that must be toggled on its own later needs its own package
and its own bundle, installed separately by that feature's README.
