# Session artifacts

A DSH Power Suite feature: one **Artifacts** card in the right Sidebar's Start
page that lists every file the current Session created or delivered, with
actions that work from whatever device is viewing the page.

## What it shows

An artifact is defined the same way the Host's own deliverables bookkeeping
defines it:

- a file produced by a successful `write`, `edit`, or mutating
  `str_replace_editor` call, and
- a file declared by a successful `present` call
  (`deliverables/presented`), including files created by shell commands.

Paths are deduplicated, the newest turn first. A file that was both written and
delivered appears once, carrying the delivery description. A recorded file that
no longer exists on disk is omitted from the panel: it cannot be opened or
downloaded, so showing it would only add noise. The list route still reports
those entries with `missing: true` for consumers that want the full history.

The list does not scan the workspace and does not guess: shell output that the
model never writes through a file tool or delivers with `present` is not an
artifact of this list.

## Actions

| Action | Behaviour |
|---|---|
| **Open** | Opens the file in the right Sidebar's native document preview — the same workspace-files + document-preview pipeline the Files browser uses — through a `dsh-resource://file/session/<sessionId>/<path>` address. Images, PDFs, Office documents, Markdown, code, and HTML get the existing renderers. If no preview type claims the address, it falls back to the raw-file URL in a new tab. |
| **Download** | Raw URL with `Content-Disposition: attachment`; the browser saves the file and the operating system owns the open-with choice. |
| **Copy link** | Copies the LAN URL of the file, built from the Host's bound listener address, so another device paired with this DSH can open it directly. |

The actions render as icon buttons with their label as tooltip and accessible
name: an open book for Open, a download arrow for Download, and a chain for Copy link
(which turns into a check in the success color after copying). The icons are
inlined [Remix Icon](https://remixicon.com) paths (Apache-2.0); the Artifacts
guide card uses `ai-generate-3d-line` for the feature itself. The panel header's
Refresh control is likewise an icon button (rotating while a reload is in
flight).

Opening reuses DSH's own file preview instead of baking another renderer into
this feature: the right Sidebar owns rendering, reloads, open-in-app on the
Host, and file navigation. Download and Copy link stay custom because the native
preview cannot cover them: open-in-app launches on the **Host** machine, not the
viewing device, and another device reaches an artifact through the LAN URL. The
footer states that limit: opening a file with an application installed on the
*viewing* device cannot be triggered from a web page without a companion;
Download is the zero-install hand-off, and the browser's download bubble offers
Open directly.

## Hover preview (Quick Look)

Resting the pointer on an artifact row for about 420 ms opens a floating preview
card to the left of the panel, modeled on macOS Quick Look. The same card also
works in the **native Workspace files browser**: hovering a file row in the files
page or beside a docked preview shows it too, so the feature is an enhancement to
the built-in files surface rather than an artifacts-only one.

- **Markdown** renders with headings, paragraphs, lists, blockquotes, tables,
  links, inline code, and fenced code blocks instead of showing source text;
- **code** gets syntax highlighting for JavaScript/TypeScript, JSON, CSS/SCSS,
  HTML/XML, shell, Python, YAML, Go, Rust, Java, C/C++, Ruby, PHP, SQL, Kotlin,
  Swift, TOML, and INI (first 16 KiB; extension or fence chooses the language).
  Tokens distinguish comments, strings, keywords, booleans, types, functions,
  built-ins, variables, tags, attributes, properties, numbers, operators, and
  punctuation, all colored through theme tokens;
- images render inline, audio/video get native controls, PDFs render in a frame,
  and HTML renders in a script-blocked sandboxed frame;
- anything else shows “No preview available”;
- the footer repeats the size and offers an icon-only **Open** button (the same
  book-open icon as the row action, opening through the row's native action)
  plus Download.

The card keeps itself open while the pointer is inside it, so long previews can
be read and scrolled: the card body is a scroll view and its own scrolling does
not dismiss it.

Hover handoff follows the safe-polygon pattern used by Floating UI's
`useHover`/Radix HoverCard: the source row, the card, and the rectangle between
them form a safe traversal area. Moving diagonally off the row towards the card
therefore does not dismiss it, and parking briefly between the two keeps it
open. While the card is open, any movement that **gets closer to the card**
(measured as distance to the card's nearest edge) cancels a pending close, so a
slow diagonal detour still counts as heading for the preview. Once the card has
been entered, leaving the card hides it after about **300 ms**; moving back onto
the row or into the card cancels that timer. Moving outside the traversal area
before reaching the card also closes it after a short fallback delay. Hovering
another row keeps the current preview visible until that row's 420 ms open delay
elapses and then swaps to it, so crossing rows does not blank the preview. The
delay is a **rest timer**: moving over the pending row restarts it, and leaving
that row cancels it even when the pointer is heading for the current card. This
prevents a row merely swept over while moving the mouse from replacing the
preview later.
Switching follows Material's motion patterns: the card itself never fades and
slides from the old row to the new one over 200 ms with the standard
`cubic-bezier(0.2, 0, 0, 1)` curve (shared-axis Y for a vertical list); the
content uses Material **fade through** with two stacked layers — the outgoing
layer fades out over 160 ms while the incoming layer fades in over 200 ms
(20 ms delay) with a ±6px shared-axis vertical offset matching the list's
direction of travel. The header title crossfades too. Reduced-motion
preferences skip these animations and swap instantly. A mouse press anywhere outside the card dismisses it
immediately (clicks inside the card or on its source row are exempt), so
clicking blank conversation space also closes the preview, as do Escape,
scrolling the underlying list, resizing, or reloading. The entrance animation
is opacity-only, so the card is hit-testable the moment it appears.

Drag the grip in the bottom-left corner to resize the card (the right edge stays
anchored while the width grows leftwards). The geometry is based on the Dex
extension popup panel: **570px** default width, **380px** minimum, **800px**
maximum, **280px** minimum height, always clamped to the viewport. Double-click
the grip to forget the stored size and return to the default, content-sized box
(width 570, height by content up to 560). The surface uses its visual language
too — 20px radius, panel shadow, 16/20px header padding, 32px icon action
buttons, and a 28px rounded resize grip — plus a 160ms entrance animation. The
size is remembered in `localStorage` and reused for later previews on both
surfaces; dragging pauses the auto-dismiss so the card cannot vanish mid-resize.

The card reads at most one bounded window per file and caches the result for the
page lifetime. It is a preview only: the row actions still own opening,
downloading, and copying the link.

## Routes

Both routes are exact Fetch routes on Connection's authenticated API channel,
so they sit behind the same browser cookie and Host/Origin fence as the rest of
the GUI. Only the owner Peer reaches them.

- `GET /api/session-artifacts.list?sessionId=<id>` — folds the Session log and
  returns `{ sessionId, origin, workspaceRoot, artifacts }`. Each artifact
  carries `path`, `name`, `presented`, `generated`, `tool`, `turn`, `seq`,
  `mime`, `previewable`, `size`, and `missing`.
- `GET|HEAD /api/session-artifacts.raw?path=<absolute path>&disposition=inline|attachment&name=<filename>`
  — serves the file bytes, bounded to 64 MiB per response. It backs Download,
  Copy link, and the Open fallback; the native preview reads files through the
  workspace-files Remote instead.
- `GET /api/session-artifacts.preview?path=<absolute path>&name=<filename>`
  — one hover-card descriptor: `{ path, name, mime, size, previewable, kind }`
  plus `{ text, truncated }` for text kinds. Text reads are capped at 16 KiB.

Documents are served with `X-Content-Type-Options: nosniff` and a sandbox CSP
for HTML/SVG, so artifact scripts run in an opaque origin and cannot read the
application's cookies, storage, or same-origin APIs.

## Install

This feature ships inside [DSH Power Suite](overview.md); install the suite:

```text
plugin_manager action=install_bundle target=/Users/rexxin/Development/dsh-power-suite/packages/power-suite
```

The Host half serves the two routes; the browser half registers the page type
and its guide card. Restart the Host process after upgrading the package's
JavaScript.

Implementation: Host entry [`lib/features/session-artifacts/host.js`](../lib/features/session-artifacts/host.js),
pure fold [`artifact-index.js`](../lib/features/session-artifacts/artifact-index.js),
browser surface [`client.js`](../client.js) under its `feature: session artifacts`
region, tests [`test/session-artifacts.test.js`](../test/session-artifacts.test.js).

## Limits

- **Current Session only** — subagent Sessions and other Sessions are not
  listed.
- **Loaded from the Session log** — exact reads replay the whole log on each
  panel open. Very large Sessions fan out per open; the list reports what the
  log recorded, not a filesystem scan.
- **64 MiB per artifact** — larger files answer 413 rather than buffering.
- **Other devices need DSH pairing** — the copied LAN link opens on a device
  already authorised against this DSH listener; the deployment's pairing cookie
  is the access boundary, not the link.
- **One click to an external application is not available on a plain-HTTP LAN
  page** — mobile share sheets and the File System Access API need a secure
  context (HTTPS). Download covers the same need with two gestures.
