# DSH Power Suite

One installable DSH plugin for a growing set of small DeepSeek Harness
enhancements. The suite is a single Loader row (`power-suite`) whose features are
modules inside the package, so the Plugin list shows one plugin and its
inventory grows with the suite.

## Features

| Feature | What it adds | Reference |
|---|---|---|
| Session artifacts (`session-artifacts`) | An **Artifacts** button in the native Files pane header that opens the Session's artifact list in place (animated in-pane overlay) and lists the current Session's created and delivered files plus the images/files the user attached to their prompts, with 40 px thumbnails, an All/Generated/Provided dropdown filter in the panel header, a hover Quick Look for both sources, in-browser open, download, copy content (text verbatim; images as a real clipboard picture in a secure context with an HTML-image fallback on plain HTTP), and LAN link copy. | [session-artifacts.md](session-artifacts.md) |
| Workspace presets (`workspace-presets`) | A Workspace context-menu submenu that sets the default agent preset for new Sessions created in that Workspace. | [workspace-default-presets.md](workspace-default-presets.md) |
| Dynamic Workspaces (`dynamic-workspaces`) | The native Workspaces browser is augmented with **Active Projects** and **Inactive Projects** buckets that follow running and recently active Sessions, plus a **Running & recent** card above the native header with a fixed trailing grid (time → New session → disclosure; subagent rows have no New session), a card-owned **Host-shared pin** (title-left pin button, two-phase hover reveal, pinned rows lead newest-activity-first and never retire, with a violet single-layer tint), a **"…" row menu** on top-level rows that opens the shell's **native shared context-menu popup** with the native Session actions minus Pin/Unpin (native material, keyed icons and shortcut hints; every top-level row swaps its time for the trigger on hover/focus and restores it on leave; the trigger keeps the ordinary hover paint and only the rainbow row suppresses it), an amber **flag-fill** before the title of Sessions waiting on a question, plan review or approval (the flag is decorative; clicking the row opens the Session and the native composer card answers), Host-shared read marks, event-sourced Host last-activity times, a breathing rainbow glow on the current row's bottom edge and its owning Workspace row, a native-style row hover card carrying status plus the native **Session statistics / Token usage / Context usage** figures, nested subagent Sessions, and configurable retention windows. | [dynamic-workspaces.md](dynamic-workspaces.md) |
| Prompt history (`prompt-history`) | The configured modifier + ↑/↓ recalls prompts already sent in this Session; plain arrows keep their original behavior. A vertical right-edge rail lists the same prompts oldest first (newest tick at the bottom) as native-style tick marks, with a native-style hover preview card, a pinned-search card that opens below or beside the magnifier, per-prompt timestamps, and click-to-copy. | [prompt-history.md](prompt-history.md) |
| Draft attachments (`draft-attachments`) | Browser-owned attachments in a draft (pasted images, dropped or picked files) are remembered per Session and re-introduced on return; the shell persists only the draft's text and reference chips. | [draft-attachments.md](draft-attachments.md) |
| Composer image gallery (`composer-gallery`) | Clicking one thumbnail when the composer holds two or more pasted images opens a continuous `N / M` viewer with previous/next buttons, ←/→ keys, one-step mouse-wheel navigation, focus restoration and live removal clamping; a single pasted image keeps the native lightbox. | [usage.md#composer-image-gallery](usage.md#composer-image-gallery) |
| UI element annotation (`ui-annotation`) | A floating launcher toggles a point-and-click annotation mode: the page shrinks by a responsive right rail; hovering outlines the candidate element — including floating surfaces such as native hover preview cards, which can also be drilled into — and a requirement popover carries the locator summary, live status, ancestor level up/down, and the requested change. Each annotation is a v2 single record carried by the v3 browser document (verified unique selector, Session/Workspace identity, bounds) drawn as a page marker with a numbered requirement badge and a hover detail card; references are inserted as **native composer inline reference chips** (single or one grouped batch) without sending, and the rail's collection view edits, previews, reorders, deletes with undo, and batch-inserts annotations. Multi-select and marquee, a pass-through modifier, and browser-local modifier settings are included. | [ui-annotation.md](ui-annotation.md) |
| Settings (`settings`) | The bundle's own configuration section on its Plugins page: the prompt-history modifier plus the two Dynamic Workspaces retention windows (finished Sessions 1/2/6/12/24 hours, default 2; Active projects 1/3/7/14/30 days, default 7). | [settings.md](settings.md) |
| Interrupted sessions (`interrupted-sessions`) | Sessions whose last turn did not finish — restart/crash, any provider/model/network error (quota, timeout, rate limit), an output limit, or an imported unknown cancellation — get an amber mark left of the title, a hover-revealed inline Continue triangle in the status cell (the title slides right instead of being masked), and a play-shaped submit control in the composer; deliberate cancellations and completed turns stay unmarked. State is Host-owned and synced across devices: the Host SSE stream invalidates open pages on turn boundaries, with polling as fallback. | [interrupted-sessions.md](interrupted-sessions.md) |
| Update notice (`update-check`) | The Host reads the npm `latest` dist-tag and the tag-pinned release notes; each page load checks at most once and a fixed bottom-right `shell.overlay` card appears only when a newer stable version exists, showing the version change and up to six Highlights. **更新** opens the bundle's Plugin page (DSH performs the install/update), **下次再说** counts per version and after three exposes **不再提醒**, which silences only that version; Escape/outside click is "later". State is per-browser `localStorage`, there is no auto-update and no sidebar DOM, and the notice stays silent until a newer stable version is published. | [update-check.md](update-check.md) |
| Sidebar width (`sidebar-width`) | The native left sidebar's dragged width is Host-owned and durable: it survives reloads and new tabs, every browser/profile on the same `$DSH_HOME` shares one value (last write wins, no conflict UI), and a collapse→expand cycle re-applies the stored width instead of the native 280 px default. The rainbow atmosphere also repaints synchronously after a real backing-store resize (and once at mount) instead of waiting for its 33 ms animation throttle, so dragging the sidebar no longer blinks the current-Session highlight. | [sidebar-width.md](sidebar-width.md) |

## Install

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-power-suite
```

The profile keeps this package as a `link:` dependency, so an edited checkout is
the code the Host runs after `npm run build` and a restart (the Host loads
`lib/index.js`, not `src/`). Removing the bundle removes the plugin.

## Layout

```
.
  package.json              # bundle patch + exports + checks
  cordis.patch.yml          # inserts the single `power-suite` row
  src/index.ts              # Host entry: calls each feature's installer
  src/features/<name>/      # Host-side feature modules
  src/client.js             # browser entry (ESM): one `#region feature: <name>` per feature
  src/browser/              # browser-side modules imported by the entry (ambient, artifacts,
                            #   composer-gallery, draft-attachments, dynamic-workspaces,
                            #   hover-quick-look, interrupted-sessions, prompt-history, settings,
                            #   sidebar-width, ui-annotation, update-check, workspace-presets)
  src/shared/routes.ts      # cross-half route contract (16 API paths)
  src/host/document-store.ts # shared durable-document module for the JSON stores
  src/host/context.ts        # minimal structural Host context
  src/host/errors.ts         # unknown-thrown-value helpers
  lib/                      # gitignored build output (lib/index.js + lib/client.js)
  locale/                   # plugin display metadata (en, zh)
  docs/                     # architecture, guides, per-feature reference
  test/                     # pure-logic tests (node --test)
```

## Add a feature

1. Host side: create `src/features/<name>/host.ts` exporting
   `install<Name>(ctx)`; register routes, services, and events inside
   `ctx.effect`. Call the installer from [`src/index.ts`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/index.ts) and add any new
   service names to its `inject` union. A durable Host document goes through
   [`src/host/document-store.ts`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/host/document-store.ts) (atomic queued
   writes, coded read errors) — supply decode/encode/clone/change policy instead
   of hand-rolling filesystem code.
2. Browser side: put the feature's browser module (including its `copy.ts`
   dictionaries and UI helpers) under `src/browser/<name>/` and wire it from a
   `//#region feature: <name>` section in
   [`src/client.js`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/client.js).
   The entry's `apply` registers each feature's contributions.
3. Feature routes live under `/api/<feature>.*` and use
   `ctx.connection.fetch.register`, so they sit behind the same browser
   authentication and Host/Origin fence as the rest of the GUI; the path is
   declared once in `src/shared/routes.ts` for both halves.
4. Put user-facing reference in `docs/<name>.md` and, when the display text is
   user-visible, define the feature's `en`/`zh` dictionaries under
   `src/browser/<name>/` and register them via
   `ctx.locale.register(NS, { en, zh })` (`locale/*.json` holds only plugin
   display metadata).
5. Add a pure-logic test under `test/` when a feature derives state from the
   Session log.
6. A user preference belongs in the suite settings document
   (`src/features/settings/` + the Plugins-page section in `src/client.js`); see
   [settings.md](settings.md).

Features share one plugin row; enabling or disabling the plugin toggles them
together. A feature that must be toggled on its own later needs its own package
and its own bundle, installed separately by that feature's README.
