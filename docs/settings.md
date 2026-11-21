# Settings

![The suite settings page with the prompt-history and Active & recent options](assets/settings-page.png)

The bundle carries its own configuration section on its **Plugins** page:

1. Sidebar **Plugins** → **Installed plugins** → **DSH Power Suite**.
2. The page shows the plugin header, then the suite's two settings groups —
   **Prompt history** and **Active & recent** — followed by the component rows
   and source facts.

The package README document that the Plugins page renders above the bundle
configuration is hidden while this settings section is mounted, so the page
shows only the actual controls (the document returns when the section is
unmounted). The repository ships a root `README.md` for the project itself;
suite reference documentation lives in `docs/`.

## Prompt history

| Setting | Values | Default |
|---|---|---|
| Shortcut modifier | ⌘/Ctrl (primary), ⌥/Alt, Ctrl, ⇧/Shift, Off | platform primary |

- **⌘/Ctrl (primary)** uses Command on macOS and Control on Windows and Linux.
- **⌥/Alt** uses Option on macOS and Alt on Windows and Linux.
- **Ctrl** is Control on every platform; macOS may reserve some Control-arrow
  combinations for system shortcuts.
- **⇧/Shift** uses Shift alone. While it is active, Shift+↑/↓ drives history
  instead of extending the selection in the composer.
- **Off** keeps the feature installed but releases the shortcut, so the
  composer keeps its normal editing keys.

The stored value is the mode (`primary`, `alt`, `ctrl`, `shift`, `off`), not a
physical key, so every browser resolves `primary` on its own platform: Command
on macOS, Control on Windows and Linux. That keeps one shared setting correct
for a Mac and a Windows machine at the same time.

The row's hint always shows the resulting shortcut, for example
`Current shortcut: ⌘ + ↑ / ↓`. Changes take effect on the next keypress in any
open composer, without a reload, and apply to every browser connected to this
Host. See [prompt-history.md](prompt-history.md) for the history behavior
itself.

## Active & recent

The **Active & recent** group holds the two Dynamic Workspaces retention
windows. Both are Host-owned settings shared by every browser; running Sessions
ignore them entirely (a running Session is always listed in the card and always
keeps its project Active).

| Setting | Values | Default |
|---|---|---|
| Finished session retention | 1 hour, 2 hours, 6 hours, 12 hours, 24 hours | **2 hours** |
| Active project retention | 1 day, 3 days, 7 days, 14 days, 30 days | **7 days** |

- **Finished session retention** — how long a finished Session stays in the
  **Running & recent** card, including nested subagent rows, after its last
  activity. The hint reads e.g. `Currently 2 hours. Finished sessions leave
  Running & recent after this window.` (field `recentSessionMinutes`, stored in minutes).
- **Active project retention** — how long a project stays in **Active
  Projects** after its last activity before it moves to **Inactive Projects**.
  The hint reads e.g. `Currently 7 days. Projects move to Inactive Projects
  after this window.` (field `activeProjectDays`).

A change applies immediately in the browser that made it: the card, its nested
subagent rows, and the Active/Inactive buckets re-derive on the next render
without a reload. Other open browsers pick the shared value up on their next
settings read or page load. See [dynamic-workspaces.md](dynamic-workspaces.md)
for the card and bucket behavior.

## Storage and route

Settings are Host-owned, so all browsers share one preference:

```text
$DSH_HOME/dsh-power-suite/settings.json
{
  "version": 2,
  "settings": {
    "promptHistoryModifier": "primary",
    "recentSessionMinutes": 120,
    "activeProjectDays": 7
  }
}
```

- `GET /api/power-suite.settings` → `{ settings }`.
- `POST /api/power-suite.settings` with one JSON object of recognized fields,
  e.g. `{ "recentSessionMinutes": 360 }` → the stored document.
- Version-1 files (only `promptHistoryModifier`) are still accepted: they read
  with the default windows and are rewritten as version 2 on the next write.

Both routes sit on Connection's authenticated API channel, behind the same
cookie and Host/Origin fence as the rest of the GUI; only the owner Peer reaches
them. Writes serialize and land atomically. A missing, unreadable, or malformed
file reads as the defaults, so a broken preference cannot disable a feature.

## Limits

- **Shared preference.** There is no per-browser or per-device override; a
  change applies to every connected browser.
- **Live in this browser, next read elsewhere.** The page that makes a change
  republishes the returned document to the running features immediately; a page
  opened before another device changed the setting picks the new value up on its
  next settings read (opening the Plugins page or reloading), not from live Host
  events.
- **Fixed option sets.** The Host accepts only the listed windows (1/2/6/12/24
  hours and 1/3/7/14/30 days); an unknown value is rejected with `400` and the
  stored value is kept.
