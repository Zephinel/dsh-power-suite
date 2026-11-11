# Changelog

All notable changes to this repository are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-11

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

### Changed

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
