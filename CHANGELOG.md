# Changelog

All notable changes to this repository are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Planned as version 0.3.0; the release date is still pending. No dated release
heading is added until the release is cut.

### Added

- UI element annotation: a floating launcher toggles a client-only annotation
  mode that makes room for a responsive right rail by shrinking the shell frame's
  `padding-right` (`clamp(188px, 11.6vw, 236px)`, no CSS transform) and falls
  back to an overlay rail on narrow viewports. Hover outlines the candidate
  element; a click selects it and opens a draggable note popover carrying the
  element name, locator summary, resolved/ambiguous/missing/changed status,
  ancestor level up/down, a note field, and **Quick reference** / **Add to
  collection** actions. Page pointer events are consumed in the capture phase so
  native controls cannot act while annotating; the configurable multi-select
  modifier toggles selection or starts a marquee, and the configurable
  pass-through modifier restores real native mouse and context-menu behavior
  without synthesizing clicks. References are inserted through the composer's
  semantic `captureInsertion`/`insertText` API — preserving the draft and caret,
  one undo step, never sending — as one localized reference or one ordered batch
  for the collection, which de-dupes by a stable locator key, keeps per-entry
  notes, marks other-session entries and excludes them from the batch, and marks
  stale targets explicitly. The two modifiers (a conflicting choice moves the
  other modifier, with an explanation), the launcher position, and the
  rail-collapsed state persist in browser `localStorage`; the collection is
  page-lifetime. The browser-only feature adds no Host route,
  service, or profile change, cleans up every listener, layout marker, and DOM
  node on exit and HMR, and adds a pure test seam plus a live-page CDP acceptance
  harness (full acceptance recorded pre-merge; on the merged build only `--smoke`
  was re-run: 6/6 PASS with the 35-key seam, smoke-only evidence).

### Changed

- UI element annotation audit fixes: user notes are normalized with
  `normalizeUserNote` (CRLF→LF, NUL/C0 control characters except tab/newline
  removed, spaces/line breaks preserved, **no redaction and no silent
  truncation**) and inserted verbatim (multi-line notes can exceed single-line
  layouts); hover uses a lazy element-only candidate chain with descriptors
  built only for the chosen element and ≤2 context ancestors (0 `textContent`
  reads on hover); opening the Project page dispatches
  `power-suite:ui-annotation-exit` and hides the launcher (annotation is not
  usable while the page is open; the page's Esc ladder runs first); the whole
  prompt-history rail family is hidden in annotation mode; selector escaping uses
  `globalThis.CSS` with a leading-digit hex fallback (`#123abc` → `#\31 23abc`);
  pinned popovers re-clamp on resize while keeping their dragged offset; the
  marquee adds at most the 24 most specific intersecting candidates.
- Read-mark and activity robustness: read-acks `load()` is single-flight with
  forward-merge publication (`mergeAcked(state, parsed)`), so a stale concurrent
  load cannot clobber a newer record; non-ENOENT reads reset the cached promise
  and throw typed `READ_ACKS_READ_FAILED`, GET/POST answer no-store `500
  { code: "store-read-failed" }`, empty is never cached, `record()` awaits the
  same load in the serialized chain and `get()` returns current. A non-ENOENT
  activity-ledger load keeps memory, resets its promise, throws typed
  `ACTIVITY_READ_FAILED` (no empty rewrite; writes abort while unreadable; ENOENT
  stays empty); the Host `ensureLoaded()` resets/rethrows, `ensureSeeded()`
  resets the seed promise with the existing 30 s backoff, and the route serves
  **`200` snapshot/empty, never 500** — after recovery the next GET after the
  backoff retries load+seed and returns recovered entries, while during the
  backoff a GET may serve current/empty memory. `401/403` join
  network/5xx/429 as retryable ack-push failures (other permanent 4xx still drop
  only that batch); the read-acks `localStorage` migration runs per mount.
  Read-error behavior is unit/`chmod`-tested only and the concurrency proof is
  store-level stress (20 rounds of 4 concurrent get + 3 record), **not** a real
  multi-process Host; client 401/403 classification has no browser node harness.
  Ack flush/sync failures are caught and bounded-logged; failed read-acks writes
  clean up their temp sibling; the seed-backoff test uses relative timing/poll-wait.
- Activity seed failure: an already-pending seed that times out keeps the 30 s
  immediate-serve backoff while background seeding continues; a failed/rejected
  seed may set that backoff but the Host resets the seed promise so a later
  request retries load+seed — seeded history can appear after recovery (during
  the backoff a GET may serve current/empty memory `200`). Selection families no
  longer list PTC mode (`ptc-mode` is a message-source key; `tool/ptc-dispatch`
  remains activity).

## [0.2.0] — undated development snapshot

> **No release was tagged for 0.2.0 and no release date is claimed.** The package
> version was 0.2.0 while the features below (Dynamic Workspaces, prompt history,
> artifacts, project view, Host-shared read marks, the activity ledger, and the
> project-page work) were developed and merged; it was never cut as a tagged
> release. The next planned release is **0.3.0**, still unreleased/undated (see
> `[Unreleased]`). No git tags exist in this repository.

### Added

- Dynamic Workspaces: the native sidebar Workspaces browser gains **Active
  Projects** and **Inactive Projects** buckets plus a **Running & recent** card
  above the native header. A Workspace is Active while one of its Sessions is
  running or was active inside the configurable Active-project retention window;
  buckets reorder live in both directions, fold independently with persisted
  state, and hide in rail mode. The card lists running Sessions with the shell's own status dot and
  observed durations, keeps recently finished Sessions for the same window,
  nests recent direct subagent Sessions under their parent behind a disclosure
  chevron (indented under a guide line, each opening its own Session), and opens
  a Session from any row.
- Prompt-history rail: a vertical rail at the conversation's right edge, below
  the native turn rail and separated from it by a short divider, lists the
  current Session's sent prompts newest first as tick marks. Hover or keyboard
  focus shows the full prompt in a card to the left, click copies it silently
  into the composer draft, and a search button below the marks reveals a
  floating substring filter. The rail appears only while the Session
  has sent prompts.
- Artifacts for user-provided attachments: the Artifacts card now also lists the
  images and files the human attached to their prompts (human `user/message`
  image/file blocks only, deduped by attachment id with the newest occurrence
  winning and a 1-based prompt ordinal), served by the new verified
  `GET|HEAD /api/session-artifacts.attachment` route with the same
  no-store/nosniff/sandbox-CSP headers. Every image artifact shows a 40 px
  rounded lazy thumbnail, and the panel header carries an All/Generated/Provided
  source-filter dropdown with per-option counts.
- Copy content row action: each Artifacts row gains a Copy content button
  between Download and Copy link. Text-like artifacts are fetched through their
  inline URL and copied verbatim. Images use a three-step chain: a real PNG
  clipboard item in a secure context (HTTPS/localhost), the legacy HTML-image
  clipboard on insecure origins (hidden `<img>` + `execCommand('copy')`, so
  rich editors paste the picture while plain-text targets may get nothing/alt),
  and only then the inline image URL as text. Other binaries have no content
  action. A successful copy shows the row's check acknowledgement for 1.6 s.
- Draft attachment memory: browser-owned attachments in a draft (pasted images,
  dropped or picked files) are remembered per Session and re-introduced through
  the composer's own paste intake when the Session is shown again, so switching
  away and back no longer restores the text while silently dropping the files.
  The cache is page-lifetime (8 Sessions / 20 files), clears on send and on
  explicit removal of every restored attachment, and never attempts
  persistence.
- Per-prompt timestamps: `GET /api/prompt-history.list` now returns
  `{ seq, text, at }` for every prompt, where `at` is the Session event time in
  epoch milliseconds or `null` when the event has no usable time. The rail shows
  mark and hover-card times from it; the keyboard recall is unchanged.
- Configurable Dynamic Workspaces windows: the settings document moves to schema
  version 2 with two new Host-backed fields — Finished Session retention
  (`recentSessionMinutes`, 1/2/6/12/24 hours, default 2 hours) and Active
  project retention (`activeProjectDays`, 1/3/7/14/30 days, default 7 days) —
  edited under a new **Active & recent** group on the bundle's Plugins page.
  Version-1 files migrate to the default windows, and running Sessions ignore
  both windows.

- Project view: a standalone page covering the content area right of the left
  Workspaces sidebar, opened by clicking a Workspace's title/folder area in the
  sidebar (a window `power-suite:open-project` event handled by a
  `shell.overlay` seat, `power-suite.project-page`), that turns the Workspace into
  a project dashboard. The left sidebar stays visible and interactive, so
  clicking another Workspace switches the page in place; Esc/back closes it. Overview carries the project header, four stat cards
  (running Sessions, completed today, total runs, average completed duration),
  a Session preview, the honest grouping/archiving explainer, and a recent
  activity feed; Sessions offers status chips and title search; Runs lists turns
  newest first with status filters, session filter, include-jobs toggle, search,
  expandable nested job rows, live elapsed time, and Show-more paging; Settings
  edits the Workspace default preset and shows the grouping windows read-only
  plus path actions. It carries its own top bar (back/close, title, Active
  badge, refresh) over the four tabs; Esc (menu-first) or the back control
  closes it and restores the conversation, Session, draft, selected view, and
  sidebars untouched. The native chevron fold, row
  context menu, New Session button, Session rows, drags, and modified clicks keep
  their behavior. The new authenticated `GET /api/power-suite.project` route
  serves one snapshot (workspaceId or sessionId, newest 20 Sessions, 25 s cache
  with `refresh=1`, `no-store`), and the pure folds live in
  `src/features/project-view/fold.js`.

- Host-shared read acknowledgements: a durable
  `$DSH_HOME/dsh-power-suite/read-acks.json` document (schema v1, sanitized,
  per-id max-merge, 1000-entry cap, atomic writes) is served by an authenticated
  `GET/POST /api/power-suite.read-acks` route; every browser using the same
  `$DSH_HOME` syncs the same baselines (local cache + 30 s/focus/visibility
  sync, one-time migration of old local marks, 250 ms debounced push). Profiles
  sharing a home **share the file with no profile isolation and no read-merge
  across writers**, so concurrent profiles/HMR generations can overwrite each
  other's baselines; the design assumes one Host process plus overlapping HMR.
  Read state is derived as `baseline >= activity - 1000 ms`, so a transient
  status flag can no longer resurrect a stale green dot.
- Event-sourced activity ledger for the activity card: the Host subscribes to
  committed `session/event` times under an explicit `ACTIVITY_EVENT_TYPES`
  allowlist covering known activity-bearing families (turns, steps,
  messages/attempts, tools incl. PTC dispatch, jobs, commands, compaction, subagent state,
  goal/todo, approvals and selection actions, workspace/deliverable/schedule
  changes, team traffic, image/offload, feedback, inbox splice, LLM retry,
  tool-workflow progress); the explicit `NON_ACTIVITY_EVENT_TYPES` metadata
  (request headers/context, titles and their LLM requests, end seeds, delivery
  acknowledgements, web search requests), seed variants, and unknown
  future/plugin types never count; `hook/invoked`/`hook/result` are allowed for
  forward compatibility although this kernel emits none, and `ptc-mode` is not a
  Session event. It persists
  `$DSH_HOME/dsh-power-suite/session-activity.json`
  (`{version:1, sessions:{id:lastActivityAt}}`, max-merge, 5000-Session cap,
  debounced atomic writes) and seeds a one-time projection-cache baseline for
  pre-install Sessions (never overwriting newer live events; header `createdAt`
  when there is no cache document). Writes are **best-effort read-merge-writes**:
  sequential external writes are preserved, but interleaving writers can lose
  one side (TOCTOU; no cross-process lock). `flush()` awaits the full serialized
  chain and drains during-write events; `dispose()` stops the debounce, flushes,
  awaits the chain and is idempotent (Host cleanup disposes the listener first,
  then returns `ledger.dispose()`); an abrupt crash before the 750 ms flush can
  lose that window (no fsync), and a failed disk write keeps the map in memory
  without durability (flush/dispose still resolve). A read-only
  `GET /api/power-suite.session-activity` keeps the same `{sessions}` contract
  and serves the live ledger (no per-request document scan, no-store) after a
  bounded `waitForSeeded(5000 ms)` — fast for an existing ledger; a first cold
  request may wait up to 5 s for a still-pending seed. If that wait times out,
  the route serves the current map for a 30 s backoff while background seeding
  continues (a late success clears it; a permanently hung listing can wait again
  after each window). A seed that **fails/rejects** is swallowed and settles with
  no backoff or retry, so seeded history never appears for that process (until a
  Host recompose/restart); the route never 500s. Baseline cache/header times are
  clamped to now+60 s while live event times are trusted. The client merges
  activity per-id monotonically and prunes only against a non-empty catalog, so
  partial/empty responses cannot drop known activity; a genuine clear does not
  take effect while the catalog still lists the Session (it applies on reload or
  after the Session leaves the catalog). The card folds the map in via
  `max(catalog updatedAt, activity)` for retention,
  ordering, relative times, bucket recency, child rows, and read-baseline
  raising. Activity is exact only for allowlisted events the Host observed
  (including long, interrupted, and failed turn ends); pre-install Sessions rely
  on the baseline approximation, and the native sidebar keeps catalog times.
- Current-chat rainbow ring: the card marks the Session open in the main view
  with a 2 px conic-gradient ring plus soft glow (`@property` rotation + hue
  drift, static under reduced motion), `pointer-events: none`, no layout shift,
  and the same highlight on nested child rows.

### Fixed

- Hover Quick Look no longer opens as an empty card: it always receives an
  explicit height (570 x 360 default, clamped to the viewport, with a remembered
  or user-resized size still winning) and its content layer no longer depends on
  an inline opacity style or a finished animation, so generated Markdown/code/
  image content is visible on the first hover.
- Provided attachments now have a Quick Look: provided images and media render
  through the verified attachment route, text-like provided files are fetched
  read-only and clipped at 64 KiB with a truncation note, other provided types
  show the unavailable state, and the card's Open/Download use the attachment
  URLs.
- While the Project page is open it now hides the body-portaled prompt-history
  rail (pin, divider, hover preview card, search card, magnifier) via the root
  marker `data-power-suite-project-page="true"`; closing with Esc/back or
  unmounting removes the marker and restores the rail immediately. The page also
  keeps exactly one Refresh control in its top bar (the tab-bar and
  project-header-card refresh buttons were removed; the More menu keeps Refresh
  and Copy project path).
- Running & recent read marks now persist per browser in
  `localStorage['dsh-power-suite.acked-sessions']` (`{version: 1, acked: {id:
  updatedAt}}`, guarded read/write). Opening a finished Session raises its
  acknowledgement baseline; a running-but-not-open Session clears it only when
  `updatedAt` advanced more than 1000 ms past the baseline, so transient running
  flags no longer resurrect the green unread dot — acks survive HMR and reloads,
  are shared by rows and subagent children, are pruned only against a non-empty
  catalog, and the retention window still removes completed rows. *(Superseded by
  the Host-shared read acknowledgements above: this per-browser document is now
  only the fast/offline cache and is migrated to the Host on first use.)*

- Independent-review follow-up fixes: the canonical measured-turn rule
  (`isMeasuredTurn`) now governs run rows/counts, per-Session `runCount`,
  `limits.totalRunsMeasured`, and `computeStats`, so a fork seed's synthetic
  `turn/end` without a `turn/start` classifies as **stopped**, reports **0
  runs**, and synthetic boundaries never inflate stats; the project snapshot
  cache TTL is 25 s with archived-subset-hash + `focusSessionId` identity and
  per-Session warnings carry a bounded error identity; read-acks POST failures
  return no-store `500 { code: "store-failed" }`, the body cap is 64 KiB of
  UTF-8 bytes, client requests time out after 8 s, pushes are chunked
  (≤200 entries/~48 KiB, one in flight) where network/5xx/408/425/429 stay
  queued and other permanent non-retryable 4xx drop only that batch immediately
  (local and pending maps each capped at 1000; pending entries dropped by the cap
  remain in the local map and re-migrate later); the activity route uses an 8 s
  AbortController timeout and the client **awaits** pending ack pushes before
  fetching it; the Project page's first Escape closes an open menu and the second
  closes the page, and header `openWorkspace` promises have rejection guards.

### Changed

- The Project page's geometry was corrected to cover only the content area right
  of the left Workspaces sidebar (left = the sidebar's docked box right edge,
  width = viewport width minus that edge, full height), measured and re-measured
  through sidebar/right-sidebar toggles and window resize. The sidebar stays visible and interactive,
  so another Workspace switches the page in place; the page still covers the
  composer, right sidebar, and history rails, and `aria-modal` was dropped.
- The Running & recent card gained row actions: a fixed trailing cluster with
  **New session** (blank Session in the row's own directory, falling back to the
  Workspace New Session) and, for interrupted rows, an amber warning badge plus a
  **Continue** action that reuses the interrupted-session continuation flow.
  Slots are reserved and revealed on hover/keyboard focus without layout shift;
  the row's hover card now anchors to the activity panel's right edge so it never
  covers the row or its buttons.
- The shipped Workspaces browser is augmented rather than replaced: the plugin
  inserts sibling nodes and inline flex order only, so native search, context
  menus, add-workspace flow, drag reordering, and dialogs keep working, and
  unloading restores the surface.
- The browser tolerates a Host that predates the timestamp field: rail and
  hover-card times are hidden instead of rendering empty, and the shared
  human-only prompt definition and 500-prompt cap stay the same on both
  surfaces.
- Prompt-history rail now matches the native turn rail: right-aligned 20 x 2 px
  tick marks on the native column (60 % width at rest, growing on hover, brand
  hairline on keyboard focus), a horizontal 32 x 1 px divider, a native-style
  line-clamped preview card, and a pinned 20 x 22 px magnifier whose centre sits
  on the visible resting tick column (the toggle overhangs the rail edge by
  4 px). The search card opens directly below the magnifier with
  its right edge on the column, or flips to the magnifier's left (8 px away)
  when there is no room above the composer; it has no close button and dismisses
  on a blank outside click or Escape. A long history caps the rail at
  `min(available band, 420 px)`, scrolls its ticks behind 24 px fade masks with
  hidden scrollbars, and keeps the search button pinned at the foot.
- Dynamic Workspaces card header: the leading indicator now has two states — a
  blue pulsing business-primary dot while any listed Session is running, and the
  white `sparkling-line` icon when everything is complete — both centred on the
  row glyph column.
- The bundle's Plugins page shows only the suite's real controls while its
  settings section is mounted: the auto-rendered package README document above
  the configuration is hidden and restored on unmount, and the section now
  carries the **Prompt history** group plus the **Active & recent** group with
  the two retention rows.
- The Artifacts source filter is a custom dropdown in the panel header,
  immediately left of Refresh: a `filter-line` funnel trigger with the current
  option label/count and a rotating caret opens a themed, right-aligned
  `menu`/`menuitemradio` popup listing All/Generated/Provided with their counts
  and a check on the selected option (focus moves to the selected option on
  open; outside press or Escape closes; Escape returns focus to the trigger).
  The segmented pill bar and its markup are gone.
- Prompt-history rail polish: copying a prompt is now silent (the confirmation
  chip, check icon, and animation are gone while the exact draft text and
  composer focus remain), and the pinned search magnifier is centred on the
  visible resting tick column — the 20 x 22 px toggle overhangs the rail edge by
  4 px so its centre equals `railRight - 6`.
- Dynamic Workspaces card refinement: Session rows are single-line (glyph,
  title, time) with disclosure chevrons at the far right; the Workspace title
  and path, Status, absolute Last active time, and running subagent count moved
  into a native-style hover card that does not capture the pointer. The leading
  glyph has three states — shell loading indicator while running, green done dot
  for an unread completion, and a white session-type icon (RemixIcon
  `deepseek-fill` for main rows, `robot-2-line` for subagent rows) once the
  Session has been opened and the completion acknowledged; a new run re-enables
  the green dot, and acknowledgements are page-local. The hover card's title is
  the Workspace name with the full wrapped path, rows carry no native tooltips,
  the card body hides its scrollbar, and the row body and disclosure arrow
  highlight independently. The header toggle, **View all**, and header chevron
  share one 30 px height and corner radius; bucket chevrons sit at the far
  right; the subagent connector trunk is centered under the parent's status
  indicator and stops at the last child's tick.

## [0.1.1] - 2026-11-11

### Fixed

- Interrupted-session badges now repull automatically after a Host restart
  (Connection generation reset), on focus/visibility/online, and on a 20 s poll
  instead of waiting for a Session click.
- Parent Sessions whose delegated subagent was interrupted after the parent's
  last completed turn are now marked interrupted, including nested
  delegations; a live child remains live work.
- After a reconnect, an interrupted Session no longer keeps the native green
  "running" spinner until opened: the plugin decorates rows whose native status
  is stale, replacing the spinner with the amber interruption mark.
- Forced badge refreshes keep the current ready value until the new answer
  arrives; they no longer flash every interrupted mark through `loading`.
- The Host interruption cache uses per-Session event epochs so a slow log read
  cannot overwrite a newer turn event; prompt history requests are generation-
  scoped so a slow Session cannot write into another Session.
- Subagent interruption timing now uses the child's turn start as well as its
  last event, covering children that go silent before a Host restart.
- Continue validates JSON content type, current interruption/running state, and
  per-Session in-flight admission; duplicates are rejected instead of queued.
- Raw artifact media type comes from the real path and every raw response uses
  the native sandbox/default-src-none CSP; the implicit continuation context and
  correlated turn-trigger row are hidden in Chat.
- Quick Look fixes: single-quoted code strings highlight correctly, the preview
  cache is bounded with a TTL, and sidebar/chat observers are scoped to relevant
  mutations.
- CI now covers Node 22 and 24, `npm run check` includes the pack gate, and the
  package/version/CHANGELOG are synced at 0.1.1.
- **Continue** is now implicit: it resumes through a non-human context source
  instead of inserting a visible "Continue the interrupted task." user prompt.
  The continuation row is hidden, prompt history ignores it, and a missing
  Session controller leaves the badge in place.

### Changed

- Standardized the repository around a single root package: source under
  `src/`, feature docs under `docs/`, reusable checks under `scripts/`, a git
  history, a license/notice pair, and CI.
- Hover previews now follow the native shell more closely: Markdown rendering,
  syntax highlighting, image/media/PDF/HTML previews, drag-to-resize, safe
  hover traversal, outside-click dismissal, and animated file switching.

## [0.1.0] - 2026-11-09

### Added

- Session artifacts panel with Open, Download, and Copy-link actions.
- Per-Workspace default agent preset context-menu routing.
- Composer prompt history for the configured modifier (⌘/Ctrl, ⌥/Alt, Ctrl,
  Shift, or Off).
- Interrupted-session detection, sidebar badge, Continue action, and composer
  play control.
- Plugin settings page for the shortcut modifier.
- Shared hover Quick Look for artifacts and the native Workspace files tree.
