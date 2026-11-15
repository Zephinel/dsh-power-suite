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
├─ features/read-acks/host.js            GET/POST /api/power-suite.read-acks
├─ features/session-pins/host.js         GET/POST /api/power-suite.session-pins
├─ features/sidebar-width/host.js        GET/POST /api/power-suite.sidebar-width
├─ features/session-activity/host.js     GET  /api/power-suite.session-activity
├─ features/update-check/host.js         GET  /api/power-suite.update
└─ ctx.effect(...)                       every registration lives with the plugin

src/client.js           Browser entry (DSH module loader)
├─ Artifacts panel (generated + provided rows, thumbnails, source filter)
│  + right-Sidebar guide card
├─ Workspace preset context-menu submenu
├─ Composer prompt-history keys + right-edge history rail
├─ Draft attachment memory seat (invisible)
├─ Dynamic Workspaces buckets + running & recent card (pin, row menu, pending notices)
├─ Sidebar width persistence (Host-synced width; synchronous atmosphere repaint on resize)
├─ Interrupted-session rail badge + Continue seat + composer play icon
├─ UI element annotation mode (launcher, right rail, floating-surface picking, marks/detail card, note popover, composer reference chips, batch collection)
├─ Plugins-page settings section
├─ Update notice (bottom-right `shell.overlay` card: npm `latest` + tag-pinned Highlights)
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

### Read acknowledgements

A durable Host document (`$DSH_HOME/dsh-power-suite/read-acks.json`, schema
version 1, `{ acked: { sessionId: acknowledgedUpdatedAt } }`) is shared by every
browser/profile using that `$DSH_HOME`; the browser `localStorage` ack cache is
per origin. The store sanitizes ids (≤200 chars) and finite positive
baselines, merges per id with `Math.max` (monotonic, no removal verb), caps the
document at 1000 entries (oldest baselines drop), and writes atomically
(temporary sibling + rename, `0600`, serialized chain). `load()` is
**single-flight**: one promise serves concurrent callers, and if a stale load
would publish after a newer `record()`, publication forward-merges
(`mergeAcked(state, parsed)`) instead of clobbering the newer state. `record()`
awaits that same load inside the serialized write chain, `get()` returns the
current state, and a non-ENOENT read failure resets the cached promise and throws
typed `READ_ACKS_READ_FAILED` so a later call can retry after the disk recovers. One authenticated route
serves it: `GET /api/power-suite.read-acks` → `{ acked }`;
`POST /api/power-suite.read-acks` with `application/json` (≤64 KiB of UTF-8
bytes) merges and returns the merged document (`415` non-JSON, `413` too large,
`400` malformed entries, a no-store `500 { code: "store-read-failed" }` when a
non-ENOENT read fails (GET or POST; the store never caches an empty result and
reports a read error instead of overwriting unreadable marks), and a no-store
`500 { code: "store-failed" }` when the document cannot be written); every
response is `no-store`. The browser keeps a
`localStorage` copy as a cache, syncs on mount/focus/visibility/30 s, migrates
the local marks with a POST on every mount (not once per upgrade), and pushes raised baselines with a 250 ms
debounce after an **8 s AbortController** timeout. Network, 5xx, **401/403/408/425**, and
429 failures stay queued and retry on the next sync cycle (one POST in flight);
other permanent non-retryable 4xx (400/413/415/404 etc.) drop **only that batch
immediately** so later acks still sync. Pushes are chunked to at most **200 entries / ~48 KiB**
per sequential POST (the local cache and the pending map are each capped at
1000; pending entries dropped by the cap remain in the local map and re-migrate
later), so a large cache cannot pin the Host's 64 KiB cap. The sync **awaits**
the actual in-flight ack-push promise before the activity fetch, inside a
`try/finally` that always clears the in-flight flag, so no push is in flight when
the activity request starts (at the cost of delaying that fetch by the push
duration). The browser `localStorage` cache is per origin; the Host documents
live under `$DSH_HOME/dsh-power-suite`, so **multiple DSH profiles sharing one
home share them** — `--profile` is only a config layer under
`$DSH_HOME/profiles/<name>`. Profile isolation is not provided. The read-acks
store has **no read-merge across writers**: each writer persists its own
in-memory maxima, so concurrent profiles/HMR generations can overwrite each
other's baselines (the activity ledger's best-effort read-merge is weaker still:
per-id max with a TOCTOU window). Read state is derived at render
(`baseline >= activity - 1000 ms`); there is no running-based clearing. The
read-error behavior is covered by unit/`chmod` tests only — it was not
live-forced against a real unreadable file, and the client's 401/403 retry
classification has no node test (browser-bundle code).

### Session pins

A durable Host document (`$DSH_HOME/dsh-power-suite/session-pins.json`, schema
version 1, `{ version, rev, pinned }`) holds the pinned main-Session ids of the
Running & recent card, so every browser/profile using that `$DSH_HOME` — i.e.
every paired device — converges on one pinned set. Ids are sanitized (non-empty
strings ≤200 chars, deduped, insertion order preserved), the list is capped at
**500** (the oldest pin drops first), and operations are applied in arrival
order (**last write wins per Session**); pinning an already pinned id or
unpinning an absent one is a no-op, and `rev` bumps only on a real change. The
store writes atomically (temporary sibling + rename, `0600`), reads a
missing/empty/corrupt/version-mismatched document as empty, and its failures are
typed (`SESSION_PINS_READ_FAILED` for a non-ENOENT read). One authenticated route
pair serves it: `GET /api/power-suite.session-pins` → the document;
`POST /api/power-suite.session-pins` with `application/json` (≤64 KiB of UTF-8
bytes) and at most 200 `{op:"pin"|"unpin", id}` operations → the updated
document. Errors are no-store: `415` for a non-JSON content type, `413` above
the body cap, `400` for a malformed body, and `500 { code: "store-read-failed" }`
/ `500 { code: "store-failed" }` when the document cannot be read/written. The
browser keeps a versioned `localStorage` cache/queue (optimistic first paint and
offline/local-only use), GETs the document on mount/focus/visibility/every 30 s,
migrates cached pins on first contact and POSTs queued operations; a missing
route or transport failure degrades to local-only, never an error state.

### Sidebar width

The shell (`dsh-client-ui-layout`) keeps the left sidebar width in page memory
only, so the suite stores one scalar preference and serves it to every
browser/profile on the same `$DSH_HOME`. The Host document is
`$DSH_HOME/dsh-power-suite/sidebar-width.json`, schema version 1,
`{ version, sidebarWidth }`, with `sidebarWidth` an integer in the shell's
264–420 px clamp or `null` when unset; a missing, unreadable, malformed,
unknown-version, or out-of-range file reads as the unset document. The store
loads single-flight (a non-ENOENT read failure resets the cached promise and
throws typed `SIDEBAR_WIDTH_READ_FAILED` so a later call retries) and writes
atomically (temporary sibling + rename, `0600`, serialized chain, value published
only after the rename). There is no rev/ops log — one scalar, last write wins.
One authenticated route pair serves it: `GET /api/power-suite.sidebar-width` →
`{ version: 1, sidebarWidth }`; `POST` with `application/json` (≤1024 UTF-8
bytes) and exactly one field `sidebarWidth` → the stored document (`415`
non-JSON, `413` too large, `400` malformed body or invalid field, `500`
`store-read-failed` / `500` `store-failed`), every response `no-store`. The
browser half keeps a per-origin `localStorage` cache
`power-suite.sidebar-width` (`{ version, sidebarWidth, pending }`, `pending` =
not yet confirmed by the Host), applies it **before first paint**, runs one
initial sync (POST when pending, otherwise GET; a `null` Host width is seeded
with the local value), debounces drag-store changes **300 ms** into a cache write
+ POST, and re-syncs on `focus`/`visibilitychange` and a **30 s** interval while
pending. On a wide viewport the collapsed `0` is never persisted or adopted,
and a `0 → positive` transition that is not a drag re-applies the persisted width
instead of the native 280 px; the shell's narrow-viewport rail/drawer states
change only a presentation override, never the preference. Remote widths are
adopted only while expanded and not dragging
(remembered otherwise), last write wins, and there is no merge UI. The feature
attaches to the layout plugin's shared store handle seated on its `root` slot
registration (`entry.store` → `create()` / `getSnapshot().layoutInfo.sidebar` /
`actions.setSidebar` / `subscribe`), retries the attach briefly, and stays inert
(reports `attached: false`) when the pinned
`@deepseek-ai/dsh-client-ui-layout@0.2.2-rc.1` seat shape is absent; it
contributes no slot, copy, or settings row. See
[sidebar-width.md](sidebar-width.md).

### Session activity ledger

The client session-list `updatedAt` is the catalog last-prompt time (stale after
long turns), and projection-cache document mtime is rewritten by Host
maintenance (`session/end-seed`), so neither is authoritative. The feature
(`src/features/session-activity/`) instead maintains an **event-sourced durable
ledger**:

- `ctx.on('session/event', …, { global: true })` inside `ctx.effect` advances
  `sessionId → max(event.time)` only for the explicit `ACTIVITY_EVENT_TYPES`
  allowlist, which covers known activity-bearing families (turns, steps,
  messages/attempts; tools incl. PTC dispatch; job registered/settled; command
  runs; compaction start/end/prune/summary; subagent catalog/descriptor/policy;
  goal/todo; approvals and preset/plan/sandbox/model/permission selections;
  working-directory/workspace/deliverable/schedule changes; team traffic;
  image/offload; feedback; inbox splice; LLM retry; tool-workflow agent/run
  progress; and `hook/invoked`/`hook/result`, which have no emitter in this
  install but are kept for forward compatibility), with a finite positive time
  and valid id. The explicit
  `NON_ACTIVITY_EVENT_TYPES` (`request/header`, `request/context`,
  `session/title`, `session/title-llm-request`, `session/end-seed`,
  `session-log-deepseek/delivery-accepted`,
  `web/deepseek-search-llm-request`), seed-pattern variants, and unknown
  future/plugin types never advance activity (they can under-report until the
  allowlist grows). Cleanup unsubscribes the listener first and then **returns**
  `ledger.dispose()`, so Cordis awaits the write chain.
- `$DSH_HOME/dsh-power-suite/session-activity.json` holds
  `{ version: 1, sessions: { id: lastActivityAt } }`: `record()` mutates the
  in-memory map O(batch) and marks dirty (sanitize/cap/copy are deferred to
  snapshot/write; the route copies once per request). Writes are best-effort
  read-merge-writes: they re-read the current file, merge per-id maxima, write
  the merged map atomically (random-suffixed temp + rename, `0600` in a `0700`
  directory; temp cleanup is best-effort, and a stale `*.tmp` from a failed
  removal is deliberately left unswept for concurrent-writer safety), and absorb external entries
  into memory. Sequential external writes are preserved, but the read-merge-write
  sequence has a TOCTOU window, so interleaving concurrent writers can lose one
  side; this is designed for a single Host process plus overlapping HMR, **not**
  as a cross-process lock or ordered multi-writer protocol (max per id only).
  `flush()` awaits the serialized chain including an in-flight write and drains
  events recorded during it until stable; `dispose()` stops the debounce, flushes,
  awaits the write chain (but not an in-flight ledger load), and is idempotent. Corrupt/missing files load as empty and
  schedule a rewrite immediately; a valid empty document is not rewritten.
  Accepted failure caveats: an abrupt crash before the debounce/flush can lose
  the last ≤750 ms window (no `fsync`), and a failed disk write keeps the map in
  memory without durability (flush/dispose still resolve, and the stopped
  listener means this instance will not retry it after dispose).
- On install, a one-time background baseline seeds Sessions that are in the
  catalog but not yet in the ledger from their projection-cache document's
  `max(timeContext.lastMessageTime, lastInjectionTime)` (16 MiB document cap,
  id/path guard, mtime used only as a re-parse guard). Cache/header baseline
  times are clamped to `now + 60 s` so a corrupt future value cannot pin
  activity; live committed `event.time` is trusted unclamped. A Session with no
  usable cache row falls back to header **`createdAt` only** (SessionHeader has
  no `updatedAt`) — a creation-time approximation. Max-merge means the baseline
  never overwrites newer live events, and a listing failure leaves the ledger
  as-is.
- `GET /api/power-suite.session-activity` keeps the same path/contract and
  serves a cheap live ledger snapshot (`no-store`; broken ledger → `200
  { sessions: {} }`). The route awaits the single-flight ledger load **plus** the
  one-time baseline through a bounded `waitForSeeded(5000 ms)` before every
  snapshot: an existing durable ledger is returned fast (measured ~12 ms / 407
  entries), while a first cold request may wait up to 5 s for a seed that is
  still pending. If that wait times out, the route serves the current map for the
  next 30 s without waiting while background seeding continues; a late success
  clears the backoff and seeded values resume, and a permanently hung listing can
  wait up to 5 s again after each 30 s window. A seed that **fails/rejects** is
  different: a rejected seed promise may set the immediate-serve backoff window
  and the Host resets `seedPromise` so a later request retries; seeded history
  can therefore appear after recovery, while during the backoff a GET may serve
  the current/empty memory with `200`. A `listSessions()` rejection is swallowed
  inside the baseline and settles without retry for that baseline attempt;
  per-session cache-document read failures are skipped. More importantly, a
  non-ENOENT **ledger load** failure keeps memory, resets the load promise, and
  throws typed `ACTIVITY_READ_FAILED` (no empty rewrite; writes abort while
  unreadable); the Host `ensureLoaded()` resets/rethrows, `ensureSeeded()` resets
  the seed promise with the 30 s backoff, and the route catches and serves
  **`200` snapshot/empty — never 500**. After recovery, the next GET after the
  backoff retries load + seed and returns the recovered entries; during the
  backoff a GET may serve current/empty memory `200`. A fail-once ledger test
  shows the first GET `200 {}` and the after-backoff GET returning the recovered
  historical entry. The route never answers 500 for load/seed failures. The
  client merges activity per-id with `max(previous, next)` and prunes only
  against a **non-empty** Session catalog, so empty/partial responses and HMR
  overlap cannot drop known activity; a genuinely empty catalog never prunes
  (stale entries may remain but no rows show), and a genuine clear does not take
  effect while the catalog still lists the Session — it applies on reload or
  after the Session leaves the catalog. No client node-test harness exists for
  these merges. Values are exact only for
  allowlisted events the Host observed; pre-install Sessions have only the
  baseline approximation (historical/seed-only/no-cache can be under-reported,
  never fabricated). Host code changes need a plugin Host recompose (no DSH
  restart).

The browser folds the map in as
`effectiveUpdatedAt = max(summary.updatedAt, activity[id])` for card
retention/order/time, bucket recency, child timestamps, and read-baseline
raising.

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
resumable when its end reason is `interrupted`, `error`, or `max-tokens`, when it
was `aborted` with the `disposed` or legacy cause, or when the log ends inside an
open turn and the Agent is no longer running. Deliberate endings (`completed`,
`blocked`, `forked`, user/parent/hook cancellation) are not marked. Results are
cached and refreshed from `session/event`; the route supports a `refresh` query
for explicit re-reads. `GET /api/power-suite.interrupted-events` is an
authenticated SSE stream that invalidates affected browser caches on
`turn/start`/`turn/end` (`{sessionId, parentSession, event}`), with a 25 s
heartbeat and the 20 s browser poll as fallback.

### Update check and release notes

The update notice's Host half answers
`GET /api/power-suite.update?lang=<locale id>` through
`ctx.connection.fetch.register` (`no-store`, never 5xx). It reads the running
`package.json` version, requests the npm `latest` dist-tag derived from the
package name (`https://registry.npmjs.org/@zephinel%2Fdsh-power-suite/latest`,
5 s `AbortSignal.timeout`), compares only stable `x.y.z` versions, and returns
`{ current, latest, updateAvailable, highlights }` — `current: "0.0.0"` when the
running version is unreadable, `latest: null` on a registry failure,
`highlights: []` when the notes cannot be read. The route registers no service,
writes no file, and logs nothing to a Session log; it is cached in the Host
process, not per browser.

Highlights are **pinned to the published tag**, not read from npm metadata: the
`repository` field yields
`https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v<latest>/release-notes/<latest>.md`
(or `<latest>.en.md` for the `en` variant, falling back to the default file). A
pure parser takes the bullet list of the `## Highlights` section up to the next
heading, strips inline Markdown, and caps the result at six items. The registry
read and the per-language notes are cached for **6 h** on success and **5 min**
on failure (`latest: null`), with one shared promise per in-flight language so a
burst of pages cannot duplicate network reads. The repository must stay public
for notes to resolve; version prompts still work without them.

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
`powerSuiteAnnotation`, `powerSuiteUpdate`) so the en/zh dictionaries stay
aligned. The client entry also injects the shell's `sessions` listing service for
the prompt-history preview's parent-Session rows.

### Dynamic Workspaces

The one feature that augments a native surface instead of contributing a slot
surface of its own. A `shell.overlay` seat reads the browser's Session, Session
status, and Workspace stores, inserts a summary card above the native Workspaces
header and two bucket headers into the native `[role="tree"]`, and writes flex
`order` values on the native group sections to band Active Projects above
Inactive Projects. Inside the card, running, recent, and direct subagent
Sessions are derived from the same stores: rows share one fixed trailing grid —
title (its right edge faded by a mask while clipped) → **time 48 px**
(right-aligned, tabular numerals) → **New session action 22 px**
(hover/focus-revealed) → **disclosure chevron 24 px** — so parent and nested
subagent rows right-align their times on one column; nested subagent rows have
no New session action (they keep empty action/disclosure spacers, and an
interrupted child keeps only Continue in the action slot), and the header joins
the same grid. Each row's workspace title/path, status, last-active time,
subagent count, and the three native Session figures live in a native-style
hover card that does not capture the pointer and follows the active theme
(flush left edge, borderless, shell elevation/typography): light mode paints a
white surface with the light label tokens (title `#0f1115`, secondary
`#61666b`, tertiary `#81858c`), dark mode keeps the `#2C2C2E`
`--dsw-hovercard-bg` recipe; a minimal scoped light-mode override themes the
native shell session-info card as well. The same theme-following recipe is used
by the other plugin tooltip-like surfaces (Artifact Quick Look, prompt-history
cards), while annotation popover/detail cards keep their separate fixed recipe.
Running & recent row titles and minor icons use the native Workspace
title/icon tokens in light mode (brand glyph stays primary; dark unchanged), and
both the plugin and native session-info cards share the 320 px width. The figures come from the injected `sessions` service's
`projectionsBySession` map — live Sessions are push-seeded, a cold persisted
Session gets exactly one deduplicated `refreshProjections` read on first hover,
and each section is omitted when its projection data is absent (no loading
state). Both retention windows are Host settings: finished-Session retention
(`recentSessionMinutes`) bounds the card and its nested subagent rows, and
Active-project retention (`activeProjectDays`) bounds the Active bucket, with
running Sessions always listed and always active. The card header's indicator is
a blue pulsing business-primary dot while any listed Session runs and the white
RemixIcon `deepseek-fill` brand glyph when nothing runs, horizontally centred on
the same glyph column as the row glyphs and followed by the title on the
row-title column; the header chevron shares the rows' disclosure column. Card
state is Host-backed: read baselines sync through `api/power-suite.read-acks`,
and card retention/times use the Host `api/power-suite.session-activity` map
where the catalog time is stale (native sidebar times stay catalog-based). The
row of the Session currently open in the main view (`retainedBy.mainView > 0`)
carries `.psd-run-current` / `aria-current="true"`, the owning native Workspace
row carries `data-psd-current-workspace`, and the native sidebar Session row of
that Session carries `data-psd-current-session`; all of them get an internal
**rainbow atmosphere**: a clipped absolutely-positioned wrapper inside the row's
own rounded rectangle containing a small Canvas-2D gas renderer (broad prism
wash + drifting radial blobs, screen blend, low base opacity), then a faint dark
contrast scrim, then the untouched real content raised above both layers. The
effect is `pointer-events: none`, changes no geometry, runs only for highlighted
rows (and pauses in hidden tabs), draws a single static frame under reduced
motion, and is removed with the marker on session switch/unload. The leading glyph has three states: the shell loading indicator while
running, the green done dot while a completion is unread, and the white
`sparkling-line` glyph once the Session has been opened and the completion
acknowledged (nested subagent rows use `robot-2-line`); the header's all-complete
indicator uses the brand `deepseek-fill` glyph. Read state is derived from the
Host-shared baseline (`baseline >= activity - 1000 ms`), not from running status.
Rows carry a hover/focus-revealed **Continue** (interrupted only; opens the
Session and then sends the continuation) and, on parent rows, **New session**
(creates a blank Session in the row's cwd and opens it). Main parent rows also
carry the card's **title-left pin button**, the only pin owner: the pin is the
card's own Host-shared state (see *Session pins* above), deliberately
independent of the native sidebar pin list, and its slot is collapsed at rest —
hover/focus expands the slot first and then fades the in/out button (220 ms
expand/collapse, 160 ms fades, instant under reduced motion) while pinned rows
keep the filled business-primary marker and its space permanently plus a subtle
violet tint (a single row-level layer; the body pill stays transparent). Pinned
main Sessions sort first (newest activity first) and never retire with the
finished-Session retention window; unpin re-derives the row under the ordinary
rules from its original end time. Top-level rows (the current rainbow row included)
expose the native Session actions behind a "…" trigger in the 48 px time slot:
the row keeps its time at rest, and hover/focus (or an open menu) hides the time
and reveals the trigger, restoring it on leave. The trigger keeps the ordinary
soft hover paint (plus the keyboard `focus-visible` ring); only the rainbow row
suppresses it (transparent + the same `brightness(1.2)` lift as the other
current-row controls). Nested subagent rows have no trigger. The trigger opens the card's **own
popup** built from
`ctx.contextMenus.resolve({ kind: 'session', value: { sessionId, displayTitle } })`:
Rename, Fork, Copy Session ID, Show in Finder, and Archive keep their native
behavior, the **Pin/Unpin contribution is filtered out** (the pin button owns
pinning), and the popup shows the native labels with a compact local glyph per
action but does **not** reproduce the native shortcut hints; it keeps
arrow/Home/End navigation and Escape/outside/scroll/resize dismissal.
Pending-interaction notices are a client-only addition beside the card: the seat
subscribes to `props.useSessionStatus` (the same
`SessionStatus.pendingInteraction` the native composer cards use), derives up to
three waiting Sessions other than the one open in the main view (kinds
`question`, `plan-review`, `approval`; explicitly idle, blank, subagent,
archived, and current Sessions filtered out), and renders a fixed 320 px stack
inside the card's
existing overlay-panel portal, with a "+N more" line beyond three. Placement
prefers the card's right edge, flips to its left edge when it does not fit, and
clamps to an 8 px viewport inset, re-measuring on resize, scroll, sidebar
expansion, and card height changes. The stack registers no Host route and writes
no store, its styles ride the feature's existing `<style>` block, and no nodes
are inserted into the native sidebar tree for it. Each notice only opens its
Session — the native composer card remains the answering surface — and a notice
disappears on the next render once the Session becomes current, the interaction
settles, or it is archived (one notice per Session, because
`pendingInteraction` is one per Session).

While UI-element
annotation mode is active the hover card is pinned for pointer/selection
(`data-psd-hovercard`, `data-psd-pinned`, `pointer-events: auto`, z-index 120)
and clears on the annotation mode-state event or mode exit. The card body hides
its scrollbar, rows have no native tooltips, and the row body and disclosure
arrow highlight independently (the body highlight has 8 px horizontal inner
padding). The Active/Inactive fold state persists in browser `localStorage` and
is applied on the first observable paint through a persisted bucket
classification cache that live data corrects once the Session store hydrates.
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

### UI element annotation

A **browser-only** feature: it has no Host route, service, Session-log write, or
profile change. One `//#region feature: ui element annotation` in
[`src/client.js`](../src/client.js) is installed through `ctx.effect` by
`installUiAnnotation(ctx)`, which registers a `shell.overlay` seat and a
renderless `conversation.input.overlay` seat, injects one
`<style data-power-suite-css="ui-annotation">`, creates the controller singleton,
and returns a disposer. An install guard keeps reconnects/HMR idempotent: one
launcher and one listener set. The launcher floats only while the mode is off;
activating the mode fades/scales it out in place (there is no docked or flying
copy in the rail header), and a full exit restores it at the remembered floating
position. Leaving the mode with records asks for confirmation and clears the
annotation records, so a re-entry starts empty. The overlay seat renders the
launcher, rail,
highlight layer, note popover, and feedback toast with React; the conversation
seat keeps the module bridge (`sessionId`, `inputActions`; the slot contract
passes **no `draft` prop**) current because the root overlay does not receive the
Session hooks as props. Locale namespace
`powerSuiteAnnotation`, class prefix `psa-`, DOM markers `data-psa-*`.

The layout is a frame `padding-right` change, never a CSS transform. On
activation the frame receives `data-psa-frame`, `padding-right = railWidth px`,
and a `--psa-rail-width` custom property; the rail width is
`clamp(188, round(0.116 * innerWidth), 236)` px. The frame's content box shrinks:
the left sidebar keeps its width while the conversation column and the native
right sidebar give up the rail width, so the fixed rail occupies the **rightmost
strip, right of the native right column**. The shell frame (`.pI_x6G_frame`) is
`position: relative` and carries the `padding-right`; its direct child
`.pI_x6G_overlayLayer` is `position: absolute; inset: 0`, so it fills the frame's
**padding box** and **does span the rail strip** — only native content inside the
content box is pushed left, and the rail is a separate fixed element painted
above the overlay layer. The padding transition is 180 ms
and disabled under `prefers-reduced-motion`. Resize recomputes the layout
(debounced): `innerWidth - leftSidebarWidth - rightSidebarWidth - railWidth >=
560` keeps the shrink layout; otherwise the rail overlays the right edge and can
collapse to 48 px. Exiting restores the frame's previous inline `padding-right`
and rail-width property exactly (removing them only when the plugin set them) and
clears the marker after the transition; the inline grid style is never touched.
While annotation is active the entire prompt-history rail family (rail, search
card, preview card, divider, toggle) is hidden; normal mode is unaffected. The
marquee adds at most the 24 most specific intersecting
candidates.

While active, window capture-phase listeners consume `pointerdown`, `pointerup`,
`mousedown`, `mouseup`, `click`, `auxclick`, `dblclick`, `contextmenu`, and
`dragstart` with `preventDefault` + `stopImmediatePropagation` except over
a `[data-psa-own]` ancestor, so a native control under the pointer (for example
**New session**) cannot act; every feature UI node is inside such an ancestor
(the attribute is a guarantee on the ancestor, not on every nested node). Hover and marquee pause while the pass-through modifier is
held; the native events then reach the page unchanged and no click is
synthesized. Hover and click are **leaf-first**: pointer moves collect the
element ancestor chain (≤16 ancestors) with 0 `textContent` reads, and the
target is the deepest eligible element under the pointer (spans, inline SVG
paths, icons, timestamps, counters, then rows/buttons), walking up only for the
plugin's own UI, structural tags (html/body/script/style), or zero-size/hidden
nodes; the composer's editable internals still resolve to the composer region
and the chain is cut at a floating surface's root. Parent/Child walk the full
hovered chain (Child returns toward the deepest hovered element, Parent climbs
to the surface root/page container), and hovering a surface's background/padding
selects the whole surface. Expensive descriptors are built lazily for the
chosen element plus at most 2 context ancestors. The result is a plain-JSON
`ElementRef` with reliability-ordered selector candidates, a stable identity key,
sanitized text, and a small deterministic text digest used for change detection
(derived data only; no raw page text is kept in it); SVG/text-leaf targets keep
an honest locator/status even when it can only be structural. Selector candidates use
`globalThis.CSS` when available; the fallback hex-escapes a leading digit
(`#123abc` → `#\31 23abc`). A DOM-revision-aware
resolver re-finds the live node from the ordered candidates so scroll-frame
lookups stay bounded without trusting a stale first hit. The reducer (`off | idle |
inspect | selected | multi | collection`, a settings view flag, and transient
pass-through/boxing/drag states) is a pure function covered by the Node suite
through the factory's test seam.

Candidate picking treats **floating surfaces** as first-class: a chain whose
live hit is inside a contiguous `position: fixed|absolute` region with computed
`z-index >= 10` resolves to that surface's root by default (whole native hover
preview card or the plugin's own pinned card), and the Parent/Child controls
drill into the surface's inner text blocks and controls; while the mode is
active the shell overlay's inline `z-index` is raised to 150 (saved value and
priority restored on exit) so the outline paints above body-level hover cards,
and a 60 ms mutation-triggered hover recompute keeps up with surfaces that
appear while the pointer is stationary. A selected element becomes a **v2
record**: ordered selector candidates plus a uniquely verified CSS selector,
≤3 sanitized ancestors, surface/ephemeral flags, Session id with Workspace cwd
and basename, a query-free route, viewport, bounds, and a derived text digest —
never outerHTML, input values, JS paths, XPath, or computed styles.

For text-bearing leaf targets the ref additionally carries fallback anchors —
a bounded absolute XPath, a normalized text quote (exact + prefix/suffix), a
container-relative text position, and a JS-path expression — resolved in the
order CSS candidates → text quote (position hint) → text position → XPath last;
candidate resolution
is two-phase (collect hit sets, prefer the first unique candidate by stability
tier; Ambiguous only when all identifying candidates are genuinely non-unique;
weak-strategy ambiguity continues down the chain), generated/hashed classes are
filtered out, and identity uses the verified unique selector. Capture
disambiguates quotes against occurrence-aware context and drops quotes it cannot
make unique; one rendered-text pipeline (`<br>`/block boundaries → space with a
rendered→raw offset map) feeds quote and position; fallback resolution is
**CSS → text quote (position hint) → text position → XPath last**, validated in
one boundary (tag/digest/accessible name/proximity) with scored approximate
matching (approximate hits cap below Resolved; ties stay ambiguous). Fallback
status/nodes are cached per `(record id, DOM revision)` with bounded scans, and
a weak-identity gate keeps icon-only/tag-only records from resolving through
structural fallbacks: a verified unique selector only counts as identity while
it still resolves to one connected/visible element, structural hits pass a
Hypothesis-style quote assertion and captured-ancestor corroboration, and
weak-identity records without a quote are Missing (no mark on a look-alike;
copy uses saved anchors when the target is not live). Removed floating/ephemeral surfaces report Missing for every
outcome through one `annotationEphemeralOutcome` gate (a still-present surface
keeps honest outcomes; the conservative transient-Changed policy is
documented). For descendant text anchors the captured scope is authoritative: the recorded
`textPosition.container` is searched first and a unique in-scope target wins
even when identical text exists elsewhere; multiple distinct in-scope targets
are terminal ambiguous (later text-position/XPath fallbacks cannot override),
and only an empty/missing scope falls through to the bounded document scan.
Non-leaf targets with text descendants additionally capture a descendant
text anchor (first text leaf quote/position + leaf tag, ancestor chain and a
stable-attribute signature); the resolver climbs a text hit to the closest
ancestor matching tag+signature, and same-text decoys stay ambiguous. Weak
structural hits carry `confidence:'weak'` and are labelled "Unverifiable · weak
identity" rather than Content changed, while the capture scope-climb probe uses
the rendered-text pipeline and fallback scans/cache misses are counted for a
test-only probe. The four statuses stay honest (unique text match resolves, duplicates stay ambiguous, changed
text is content-changed) and the UI shows which strategy resolved the target.
Records persist in a browser-owned **v3** document
(`power-suite.ui-annotation.annotations`, 250 ms debounced writes, flush on mode
exit/dispose/visibility change, tolerant v1/v2→singles migration, 100-element
cap counting singles + group items with a visible refusal) and are restored on
reload, re-resolving their four live statuses. Multi-selections settle into one
**batch group** (single shared requirement, N element items) after a short
settle delay; the group inserts as one `UI annotations × N` chip serialized as a
single request (shared requirement header + numbered references with honest
status lines). Annotated elements of
the current Session keep a page mark with a numbered requirement badge; a
While a floating-surface selection's popover is active the controller pins that
surface open (capture-phase suppression of `mouseout`/`mouseleave`/`pointerout`/
`pointerleave` scoped to the surface root and its ancestors) so editing the
requirement cannot unmount the target; the pin is released on popover close,
selection clear or mode exit. If the surface still disappears, only the live
status line changes — the locator summary keeps the captured candidates. A
hover-intent detail card carries the requirement, locator, position,
Session/Workspace, status, and surface marker with edit/relocate/copy-locator/
delete actions, and the requirement popover commits or updates the record,
deletes it with a 5 s undo slot, and auto-dismisses after either action. The
right rail's **default body** is the managed annotation sidebar (no status or
Collection entry to click through): the header carries the title, total badge,
selection hint, an info (i) icon (opens a borderless modifier-settings popover with two
custom segmented controls; document-level Esc closes the popover),
collapse and exit. It widens to `clamp(320px, 24vw, 420px)` (the frame
padding and canvas follow; settings keeps the same wide width to avoid a jump)
and renders an **Annotations** header with a total badge, **All / Singles /
Groups** filters with live counts, a unified list of single rows and collapsible
group cards
(shared requirement, item count, always-visible edit/delete/insert actions,
Selector/Page/Session metadata and updated time), empty/filter-empty states, and
a footer with **Add annotation** plus dynamic **Clear selection / Clear
collection** (undoable). Groups insert as one grouped batch chip; a group keeps ONE ordinal shared by
all of its items (page marks show the group number, never an incrementing
sequence). The footer's **Add annotation** and **Cancel Annotation** actions
share equal width; the danger action, the header exit and the final Esc step
open a confirmation and, on confirm, clear every single/group record (marks and
persisted v3 document) before exiting — a re-entry starts empty.

Annotation reference chips also carry a hover preview: the browser watches the
shell's `[data-composer-chip="ui-annotation"]` markup, looks the record up in the
local store, and shows the custom detail tooltip anchored to the chip (pointer
transparent, no focus steal, dismissed on leave/Esc/scroll), plus an own 16 px ×
overlay on hover/focus that removes exactly that reference chip through the
composer's Lexical editor (one undo step; the shell chip DOM is never mutated). Chat-flow picks
capture `data-chat-node-key`/`data-chat-anchor-key`/`data-chat-group-key`/
`data-chat-turn`/`data-chat-flow-key` as stable selector anchors so a leaf in
a streaming/virtualized message resolves across re-renders; the resolution
statuses stay honest and pre-fix records are not auto-remapped.

Insertion uses the shell's **native composer inline reference chips**:
`installUiAnnotation` dynamically injects `conversation` and `inputTriggers`
(so a composition without the chat surface still loads and falls back), a
Session-scoped `@` trigger source exposes the current Session's records (≤20,
no empty group), and the annotation controller resolves
`sessions.scope(sessionId)` → `conversation.input.for(actx).insertReference(ref,
captureInsertion())`. One chip is inserted for a single reference and one
grouped `UI annotations × N` chip for a batch; the trigger source's
`serializeReference` reuses the existing quick-reference/batch serializers at
send time (deleted batch members are skipped with an honest removed-count line,
and a missing single record invalidates the chip so the send is blocked), with a
plain-text fallback plus explanation when the chip services or span are
unavailable. The semantic insertion path preserves the draft and caret, is one
undo step, never sends, and focuses the composer afterwards. With no
conversation seat (Start page, no Session) the rail shows the open-a-Session
notice, insert/batch actions stay disabled, and the launcher, rail, marks, and
collection keep working.

Two lifecycle boundaries are deliberate: exiting the mode removes the
mode-scoped capture listeners, layout, rail DOM, popover/detail/mark DOM,
hover/selection/box state, and pending rAF work while keeping the persisted
records; the plugin disposer additionally removes the always-on launcher resize
handler, the style tag, React roots, the input-trigger source, and the rest.
Four browser-local keys persist: `power-suite.ui-annotation.settings` (the two
modifiers), `power-suite.ui-annotation.launcher` (position),
`power-suite.ui-annotation.rail-collapsed`, and the v2 records document. See
[ui-annotation.md](ui-annotation.md).

### Update notice

A browser-only feature: the Host route above does the version math and notes
fetch, the client only decides whether and how to show the prompt. After `apply`
the controller waits **1.5 s**, fetches
`appUrl('/api/power-suite.update?lang=' + encodeURIComponent(activeLocale))`
with `cache: 'no-store'`, and checks **at most once per page load** — no
polling, no re-fetch on language switch. The active locale comes from the shell
locale service (falling back to `en`); the `highlights` the Host returns are
rendered as-is.

The prompt is a `shell.overlay` seat registered as
`{ name: 'shell.overlay', id: 'power-suite.update-prompt' }` — a
`position: fixed` card in the bottom-right corner inside the React-owned
overlay tree. It **never inserts a node into the sidebar, the native
`[role="tree"]`, or any other shell-owned DOM** (that sidebar-card approach was
the cause of the earlier boot deadlock and is retired), so it also has no
`MutationObserver`, no `insertBefore`, and no layout writes. The card is
`z-index: 70`, carries a layered inline-SVG brand mark, uses theme tokens only
(forced-colors fallback), has no animation, and closes on Escape or an outside
`pointerdown` as "later". Its actions are the Host contract's only consumer: the controller keeps
a small state machine (`hidden | shown`) and exposes
`getSnapshot`/`subscribe`, and `installUpdatePrompt` wires the locale
dictionary (`powerSuiteUpdate`) and the style tag
(`data-power-suite-css="update-check"`).

The only persisted client state is
`localStorage['power-suite.update-prompt']`
(`{ schema: 1, laterVersion, laterClicks, silencedVersion }`). "Later" counts
per version, three "later" clicks make **不再提醒** available, and silencing
affects only the current `latest`; when the route proves there is no update the
state is cleared, while `latest: null` keeps it (a registry hiccup must not
erase a silence). Corrupt/unknown storage is treated as empty, and unavailable
`localStorage` keeps the state in memory for the page. The **更新** action calls
the optional `pluginNavigation.openBundle('@zephinel/dsh-power-suite')` inject
(no plugin navigation keeps the card open); the plugin never installs anything
itself. A user action invalidates any in-flight check, so a late response cannot
re-open a card the user just dismissed.

### Slots used

| Slot | Purpose |
|---|---|
| `sidebar.right.tab.files.actions` | Artifacts toggle button in the native Files pane header (opens the in-pane artifacts overlay) |
| `contextMenu.icon` | Workspace menu icon |
| `contextMenus.register` (`workspace`) | Default agent preset submenu |
| `conversation.input.overlay` | Renderless prompt-history keyboard seat, draft-attachment memory seat, and the annotation mode's Session bridge seat (Session id, input actions, and the Session's cwd/workspace label mirrored from the slot's `useSessions` hook) |
| `conversation.input.dock` | Session hooks for the body-portaled prompt-history rail |
| `shell.overlay` | Frame-wide seats: Dynamic Workspaces sidebar augmentation (card, buckets, pin button, row "…" menu, pending-interaction notices), the UI element annotation launcher/rail/popover, and the update notice card (`power-suite.update-prompt`) |
| `plugins.bundle.config` | Plugin settings page |
| `sidebar.session.row.leading` | Interrupted-session badge plus the hover/focus inline Continue triangle |

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
- The update notice is a `shell.overlay` seat: it never inserts nodes into the
  sidebar/native tree, never performs an install, and its only persisted state
  is the browser-local `power-suite.update-prompt` document. The Host route that
  feeds it is read-only and cached in-process.
- The Dynamic Workspaces pin state has exactly one durable owner (the
  `session-pins` Host document) and one UI owner (the card's title-left pin
  button): the row "…" menu renders native action contributions but always
  filters the Pin/Unpin entry, and the card never reads or writes the native
  sidebar pin list.
- The Dynamic Workspaces row menu and pending-interaction notices are
  browser-only surfaces: the menu resolves native contributions without
  registering any of its own, and the notices never answer an interaction and
  add no Host route/store.
- The UI element annotation mode stays browser-only: it adds no Host route,
  service, Session-log write, or profile change. Its v2 records are browser
  `localStorage` memory (capped at 100, never synced); the two modifiers,
  launcher position, rail-collapsed flag, and records document are the only
  persisted browser state.
- The left sidebar width has one durable owner (the `sidebar-width` Host
  document) and one write path (the shell's own `actions.setSidebar`): the
  feature never persists the collapsed `0`, never patches the shell package, and
  degrades to inert when the pinned layout-store seat is unavailable.

## Verification

`npm run check` runs the same syntax/manifest checks CI uses; `npm test` runs the
pure-logic suites. See [verification.md](verification.md) for the current
evidence and [development.md](development.md) for the local loop.
