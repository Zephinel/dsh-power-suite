# DSH Power Suite

One installable DSH plugin for a growing set of small DeepSeek Harness Web GUI
enhancements. The suite is a single Loader row (`power-suite`) whose features are
modules inside the package, so the Plugin list shows one plugin and its
inventory grows with the suite.

## Features

| Feature | What it adds | Reference |
|---|---|---|
| Session artifacts (`session-artifacts`) | An **Artifacts** card in the right Sidebar's Start page that lists the current Session's created and delivered files, with in-browser open, download, and LAN link copy. | [session-artifacts.md](session-artifacts.md) |
| Workspace presets (`workspace-presets`) | A Workspace context-menu submenu that sets the default agent preset for new Sessions created in that Workspace. | [workspace-default-presets.md](workspace-default-presets.md) |
| Prompt history (`prompt-history`) | The configured modifier + ↑/↓ recalls prompts already sent in this Session; plain arrows keep their original behavior. The modifier is ⌘/Ctrl, Option/Alt, Ctrl, Shift, or Off. | [prompt-history.md](prompt-history.md) |
| Settings (`settings`) | The bundle's own configuration section on its Plugins page; the prompt-history modifier is the first setting. | [settings.md](settings.md) |
| Interrupted sessions (`interrupted-sessions`) | Sessions whose last turn was cut off by a restart get an amber mark left of the title, a hover-only Continue action under a row mask, and a play-shaped submit control in the composer. | [interrupted-sessions.md](interrupted-sessions.md) |

## Install

```text
plugin_manager action=install_bundle target=/Users/rexxin/Development/dsh-power-suite/packages/power-suite
```

The profile keeps this package as a `link:` dependency, so an edited checkout is
the code the Host runs after a restart. Removing the bundle removes the plugin.

## Layout

```
packages/power-suite/
  package.json              # bundle patch + browser entry
  cordis.patch.yml          # inserts the single `power-suite` row
  index.js                  # Host entry: calls each feature's installer
  lib/features/<name>/      # Host-side feature modules
  client.js                 # browser entry: one `#region feature: <name>` per feature
  locale/                   # plugin display metadata (en, zh)
  docs/                     # suite overview, per-feature reference, settings
  test/                     # pure-logic tests (node --test)
```

## Add a feature

1. Host side: create `lib/features/<name>/host.js` exporting
   `install<Name>(ctx)`; register routes, services, and events inside
   `ctx.effect`. Call the installer from [`index.js`](index.js) and add any new
   service names to its `inject` union.
2. Browser side: add a `//#region feature: <name>` section to [`client.js`](client.js)
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
   (`lib/features/settings/` + the Plugins-page section in `client.js`); see
   [settings.md](settings.md).

Features share one plugin row; enabling or disabling the plugin toggles them
together. A feature that must be toggled on its own later needs its own package
and its own bundle, installed separately by that feature's README.
