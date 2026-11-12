# Limitations

## Packaging

- The package is a local `link:` bundle in a DSH profile; it is not published to
  npm and has no build pipeline. Host and browser entries are the checked-in
  ES modules under `src/`.
- Only the Web platform is supported (`dsh.client.platform: "web"`). The TUI
  and other clients do not load the browser half.
- The browser half injects DSH client packages by name; a Host composition that
  does not provide them will keep the plugin inactive instead of crashing.

## Session artifacts

- Generated artifacts are inferred from successful `write`, `edit`,
  `str_replace_editor`, and `present` activity. Files created by other means
  (for example a shell command) are not discovered. User-provided rows cover
  only the image/file blocks of this Session's human prompts.
- Missing files (generated or provided) are hidden rather than shown as
  disabled rows; the list route still reports them with `missing: true`.
- **Provided rows need the attachment service.** A Host composition without the
  durable attachment store omits provided rows entirely instead of showing
  broken ones, and compositions without that service cannot serve their bytes.
- **Only images get a list thumbnail.** Non-image provided files show the file
  icon in the list. Quick Look previews provided images, media, and text-like
  files, but provided PDF/Office/archive files show its unavailable state.
- **Provided text preview is a read-only fetch.** Text-like provided files are
  fetched from the attachment route and clipped at 64 KiB; they do not go through
  the workspace-files preview pipeline, and relative links (including images
  referenced inside provided Markdown) cannot resolve because an attachment has
  no workspace path.
- **Dedupe keeps the newest occurrence.** One row per attachment id; re-pasting
  the same image moves it to the top and updates its prompt ordinal, and the
  older occurrence is not listed again.
- **Thumbnails are lazy.** An image thumbnail is fetched only when its row nears
  the viewport; an image that fails to decode falls back to the file icon.
- Raw workspace downloads and provided attachment responses are capped at
  64 MiB; text previews read the first 16 KiB and report truncation, and the
  attachment route rejects tampered metadata with `400`/`404`.
- **A real image clipboard item needs a secure context.** Only HTTPS or
  localhost exposes the async Clipboard API + `ClipboardItem` that Copy content
  uses for an `image/png` item. On a plain-HTTP LAN page the action instead uses
  the legacy HTML-image clipboard (a hidden `<img>` selected with
  `execCommand('copy')` inside the click gesture): rich editors paste the
  picture, while plain-text-only targets may receive nothing or just the alt
  text. The inline image URL is copied only when that fallback fails. Preview and
  thumbnail loading need no clipboard permission and are unaffected.
- **Text copy reads the whole file first.** Copy content fetches the complete
  artifact text into memory before writing the clipboard (bounded by the raw and
  attachment route limits); binaries with no text/picture representation (PDF,
  Office, archives, and similar) have no Copy content action at all.
- The hover preview supports image, audio/video, PDF, HTML, and text/Markdown
  for generated/workspace rows, and images, media, and text-like provided
  attachments; unknown binaries show an unavailable state. A card with no saved
  resize opens at its explicit 570 x 360 px default so content is visible
  immediately (a user-resized size wins), and it appears only for the Artifacts
  panel and the native workspace-files list.

## Interrupted sessions

- Detection uses the session log and Agent status. A log that ends inside an
  open turn without an explicit `turn/end` is treated as interrupted only when
  the Agent is not running; other clients may report a different state.
- The sidebar cache updates from live session events and a periodic refresh;
  a very recent change from another device can lag by one poll interval.

## Dynamic workspaces

- **Expanded sidebar only.** In rail mode the card is hidden (kept mounted with
  `display: none`) and there is no tree to bucket; widening the sidebar restores
  both.
- **The native grouping mode decides how much applies.** The **WorkSpace** and
  **Workspace Tree** modes give the Active/Inactive buckets real group sections;
  **In one list** has no Workspace sections, so only the summary card applies.
- **Activity uses configurable retention windows, not a running-only marker.**
  A finished Session stays in the card for the Finished-Session retention window
  (1/2/6/12/24 hours, default 2 hours) and a project stays Active for the
  Active-project retention window (1/3/7/14/30 days, default 7 days). Both are
  Host-wide settings edited on the suite's Plugins page; there is no per-browser
  override. Running Sessions are always listed and always Active regardless.
- **Durations are live-observation only.** The card shows an exact run duration
  only when the run started while this page was open; otherwise it shows the
  relative last-activity time. A hidden tab throttles the once-per-second refresh.
- **Subagents nest one level deep.** Running or recently active direct subagent
  children are listed under their parent row; the native sidebar hides subagent
  Sessions outright, so the card is the only surface for them, and a nested
  child is only reachable while its parent row is in the card. A finished
  subagent does not finish the parent's task by itself. Blank and archived
  Sessions are skipped too.
- **Row actions reveal on hover or keyboard focus.** The card's Continue and
  New session slots are reserved but hidden until a row is hovered or focused
  with the keyboard; a touch-only device has no hover, so those row actions are
  not reachable there (the Workspace's own New Session still is). They never
  shift the row layout.
- **Continue sends a real continuation request.** The interrupted-row Continue
  action reuses the suite's continuation flow and actually asks the Host to
  resume that Session; the badge and action were verified with a controlled
  interrupt state because the live GUI had no genuinely interrupted Session, and
  no live child-interrupted case was exercised.
- **New session may fall back to the Workspace default directory.** The row
  action creates a blank Session in that row's own `cwd`; if the directory or
  Session creation is unavailable it falls back to the Workspace New Session, so
  the new Session can land elsewhere than the row's directory.
- **Parent disclosure state is per page.** Each parent's show/hide of its
  subagent children is not persisted; only the two bucket folds are.
- **It depends on the shipped sidebar's internals** — the
  `[data-slot="sidebar.workspaces"]` wrapper, the `role="tree"` list, and
  `data-row-key="workspace:<id>"` rows. A DSH change to those anchors makes this
  feature render nothing; the native browser is unaffected.
- **Per-browser fold state.** `power-suite.dynamic-workspaces.folds` lives in
  `localStorage`; the card's open/closed state is not persisted.
- **Client-side derivation, Host-backed state.** The buckets and card rows are
  derived in the browser from the Session, status, and Workspace stores, but the
  card's read marks and activity times come from Host routes
  (`api/power-suite.read-acks`, `api/power-suite.session-activity`), and the two
  retention windows come from the shared settings route. Those Host routes need
  a plugin Host recompose after upgrading (reload the plugin / restart the Host
  process; no DSH restart). A change from another device can still lag one
  snapshot/poll.
- **Some row detail is hover-only.** A card row shows only its leading glyph,
  title, and time, and carries no native `title` tooltip; the Workspace name,
  full wrapped workspace path, Status detail, absolute Last active time, and the
  running subagent count appear only in the row's hover card, which does not
  capture the pointer (and is unavailable on touch-only input).
- **Read marks are shared per `$DSH_HOME`, with no profile isolation and a
  cap.** Acks live in `$DSH_HOME/dsh-power-suite/read-acks.json` and sync to
  every browser using that home; the per-browser
  `localStorage['dsh-power-suite.acked-sessions']` document is only a
  cache/offline path. `--profile` is just a config layer under
  `$DSH_HOME/profiles/<name>`, so multiple profiles sharing a home **share** the
  file — profile isolation is not provided. The read-acks store has **no
  read-merge across writers**: each writer persists its own maxima, so concurrent
  profiles/HMR generations can overwrite each other's baselines (the design
  assumes one Host process plus overlapping HMR). The document is capped at
  **1000** entries (oldest baselines drop) and the client merges maxima only —
  there is no unread-removal API, so a baseline can only move forward. Without
  the route (older Host) the browser stays local-only; with storage denied too,
  the map lives in memory for the page lifetime. A row is derived as read when
  its baseline is within **1000 ms** of the current activity, so a very small
  genuine change could keep a stale ack; metadata-only bumps cannot. Pushes are
  chunked (≤200 entries / ~48 KiB, one POST in flight): network, 5xx,
  **401/403/408/425**, and 429 failures stay queued, other permanent
  non-retryable 4xx drop **only that batch immediately**, and the local cache and
  pending map are each capped at 1000 (pending entries dropped by the cap stay in
  the local map and re-migrate later); **401/403/408/425 classification is
  client-only code with no node test**. A non-ENOENT read failure returns a
  no-store `500 { code: "store-read-failed" }` for GET and POST and is never
  cached as empty (the store refuses to overwrite unreadable marks). Loads are
  single-flight and publication forward-merges, so a stale load cannot clobber a
  newer record; `record()` awaits the same load in the serialized chain and
  `get()` returns current. These read-error/race paths are unit/`chmod`-tested
  only (store-level stress, **not** a real multi-process Host), not live-forced. The sync awaits the actual in-flight push promise before fetching
  activity (so no push is in flight when the activity request starts), which can
  delay that fetch by the push duration. The browser `localStorage` cache is per
  browser origin, while the Host documents are shared per `$DSH_HOME`. The two
  Host routes need a plugin reload / Host recompose after upgrading, and the
  migration POST runs **per mount** (it re-uploads the browser's local cache each
  time), not once per upgrade.
- **One-time read-mark caveat from the superseded mtime build.** During the
  short-lived mtime-floor iteration some acknowledgement baselines were inflated
  (for example `78f7a4a7…`). Baselines are max-monotonic: opening the Session
  cannot lower one and there is no automatic downgrade, so the affected Session
  may stay acknowledged longer than its real history warrants. It has already
  left the card's retention window, so the visible symptom is gone; fresh
  installs and Sessions touched after the ledger fix are unaffected.
- **Activity is exact only for allowlisted events the Host observed.** The
  event-sourced ledger records committed `session/event` times live for the
  explicit `ACTIVITY_EVENT_TYPES` allowlist covering known activity-bearing
  families (turns/steps/messages, tools incl. PTC dispatch, jobs, commands, compaction,
  subagent state, goal/todo, approvals and selection actions,
  workspace/deliverable/schedule changes, team traffic, image/offload, feedback,
  inbox splice, LLM retry, tool-workflow progress, plus
  `hook/invoked`/`hook/result` for forward compatibility even though this kernel
  emits no hook events; `ptc-mode` is not a Session event and is excluded), so
  long, interrupted, and failed turns that end while the Host runs report
  exactly. The explicit
  `NON_ACTIVITY_EVENT_TYPES` metadata (request headers/context, titles and their
  LLM requests, end seeds, delivery acknowledgements, web search requests),
  seed-pattern variants, and **unknown future/plugin event types never advance
  activity** — they are under-reported until the allowlist grows, never
  fabricated. Sessions that existed before install rely on a one-time
  projection-cache baseline (`max(timeContext.lastMessageTime,
  lastInjectionTime)`, else header **`createdAt` only** — SessionHeader has no
  `updatedAt`), so a historical, seed-only, or no-cache completion can be
  under-reported. Cache/header baseline times are clamped to `now + 60 s` (a
  corrupt future value cannot pin activity), while live committed `event.time`
  is trusted unclamped. Writes are **best-effort read-merge-writes**: sequential
  external writes are preserved, but interleaving concurrent writers can lose
  one side (TOCTOU; no cross-process lock), designed for a normal single Host
  plus overlapping HMR rather than multi-host coordination. An abrupt process
  crash before the 750 ms flush can lose the last debounce window (no `fsync`),
  and a failed disk write keeps the map in memory without durability (flush and
  dispose still resolve; the stopped listener will not retry that write; temp
  cleanup is best-effort and stale `*.tmp` is not swept; dispose does not await
  an in-flight ledger load). A first cold request may wait up to 5 s for a seed
  that is still pending; if that wait times out, the route serves the current map
  for the next 30 s without waiting while background seeding continues, and a
  permanently hung listing can cause another ≤5 s wait after each backoff
  window. A seed that **fails/rejects** may set the immediate-serve backoff, but
  that attempt settles; the Host resets the seed promise so a later request
  retries, and seeded history can appear after recovery. A `listSessions()`
  rejection is swallowed inside the baseline and settles that attempt without
  retry; per-session cache-document read failures are skipped. A non-ENOENT
  **ledger load** failure is retryable: it keeps memory, resets the load/seed
  promises with the existing 30 s backoff, and the route answers **`200`
  snapshot/empty, never 500**; after recovery the next GET after the backoff
  retries load + seed and returns the recovered entries, while during the backoff
  a GET may serve current/empty memory `200`. Only **ENOENT** counts as empty for
  the ledger; other read errors never schedule an empty rewrite and abort a write
  that cannot read the document. The client merges activity per-id with `max(previous, next)` and
  prunes only against a non-empty Session catalog, so partial/empty responses
  and HMR overlap cannot drop known activity; a genuinely empty catalog never
  prunes (stale entries may remain but no rows show), and a genuine clear does
  not take effect while the catalog still lists the Session — it applies on
  reload or after the Session leaves the catalog. That client merge has no
  node-test harness. The ledger is a `$DSH_HOME`-shared Host file capped at
  5000 Sessions (oldest entries drop; profiles sharing a home share it), the
  route serves a live snapshot with no document scan/TTL, and Host code changes
  need a plugin Host recompose. The **native sidebar keeps the catalog
  last-prompt times**, so sidebar times can disagree with the card for long runs;
  after the window expires, retention arithmetic still removes completed rows.
- **The rainbow ring is decoration for the current row only.** Only the Session
  open in the main view is ringed; merely-running and unopened completed rows are
  not. The animated ring needs Chromium's `@property` — other engines render a
  static ring — and reduced-motion preferences also disable the animation. It is
  `pointer-events: none` and does not change row geometry.
- **The card body hides its scrollbar.** Wheel and trackpad scrolling work, but
  the scrollbar itself is suppressed to match the native sidebar surfaces.

## Prompt history

- **Timestamps need the upgraded Host code.** The route carries `at` once the
  plugin/Host code is reloaded (a normal Host restart also reloads it); against
  an older Host the rail hides mark times and hover timestamps but keeps
  working.
- **Search filters what was served.** The inline search matches only the newest
  500 prompts the Host returned for the Session.
- **Refresh points.** The rail refetches on a Session switch and when a turn
  finishes; a prompt sent from another device while this page is idle appears
  after the next send, turn completion, or page reload.
- **Copy replaces the draft.** Clicking a rail mark replaces the whole draft
  text, exactly like a keyboard recall.
- **Rail placement is measured, not owned by the native shell.** The rail is a
  fixed-position column placed against the Conversation's right edge. The native
  turn rail is recognised by geometry (small buttons near the scroll surface's
  right edge), not by a class name, so an unusual native layout can move the
  rail to its fallback: the vertical middle of the usable scrollport. Placement
  re-measures in one animation frame on window resize (which also covers zoom
  and DPI changes), scroll, composer height, sidebar width, and native-rail
  changes; the rail is hidden while the Session has no sent prompts.
- **Overflow is deliberately quiet.** A long history caps the rail at
  `min(available band, 420 px)`; the ticks scroll inside that frame with a
  hidden scrollbar and 24 px fade masks at the top and bottom, and the magnifier
  stays pinned at the rail's foot. The hover card line-clamps long prompts to
  six lines instead of scrolling; the full prompt stays in the mark's accessible
  name.
- **Search card placement.** With room above the composer, the card opens
  directly below the pinned 20 x 22 magnifier with its right edge on the rail
  column. When the button is close to the composer or the rail is long, the card
  flips to the magnifier's left, 8 px from the button, and is clamped above the
  composer. Opening the search never moves the button. There is no close (x)
  button: a blank pointer press outside the card or Escape closes it and clears
  the filter (Escape returns focus to the magnifier).
- **Current Session only.** The rail does not cross Sessions or Workspaces;
  there is no global prompt history.

## Draft attachments

- **Page lifetime only.** The cache holds browser `File` objects in memory; a
  page reload, a new tab, or another device cannot restore them.
- **Only captured intake paths.** Files are remembered from the composer's
  paste, drop, and file-picker events while that Session is mounted; files
  attached through another surface, or while the composer is unmounted, are not
  remembered.
- **Removal semantics.** Sending the draft, or removing every attachment after
  a restore, clears that Session's cache. Removing only some attachments does
  not update the cache: a later round trip re-pastes the remembered set,
  including the removed file.
- **Fixed caps.** At most 20 files per Session and 8 Sessions at once; older
  files and the least recently active Session are evicted. There is no setting.
- **Shell DOM dependency.** Restore addresses the Session occurrence, composer
  region, and Lexical editor by data attributes and dispatches a synthetic
  paste; if the shell changes that intake path the restore silently stops while
  the draft text is unaffected.

## Project view

- **The page covers everything right of the left sidebar.** It fills the content
  area from the Workspaces sidebar's docked right edge to the viewport right
  edge, so the composer/input box, the right sidebar, and the conversation
  history rails are hidden by design; the left Workspaces sidebar stays visible
  and interactive. Closing with Esc or the back control restores the
  conversation, current Session, draft, selected view, and sidebar states.
- **No user-facing "hide the sidebar" control exists today.** Geometry follows
  the shell: expanded sidebar, collapsed rail, and a zero-width/absent sidebar
  (page fills the viewport) are all handled, but there is no suite or native
  button to hide it on demand.
- **Switching projects happens through the visible sidebar.** Clicking another
  Workspace there switches the same page instance in place; there is no separate
  in-page Workspace picker. Open Workspace, New Session, and Session-list clicks
  close the page first and then navigate.
- **The prompt-history rail is hidden while the page is open.** The root marker
  `data-power-suite-project-page="true"` hides the rail, its divider, hover card,
  search card, and magnifier; closing (Esc/back/unmount) removes the marker and
  restores them immediately. This is intentional so the full-height page has the
  right edge to itself.
- **There is exactly one Refresh control.** It sits in the page's top bar; the
  header card's and tab bar's own refresh buttons were removed (the More menu
  keeps a Refresh menu item plus Copy project path).
- **The page is Workspace-scoped.** It is opened by Workspace id (not by Session)
  and a stale/unknown Workspace renders the **Workspace not found** empty state;
  closing and refreshing the sidebar is the recovery path. Sessions are reached
  through the page's own lists, not by opening a Session first.
- **Sample-bounded statistics.** The Project view measures at most the **20
  newest Sessions** of the Workspace. Stats and Runs carry only what those logs
  recorded; when the cap hits, `stats.truncated` is set and the Overview notes
  `Measured from the newest N sessions`.
- **Ranking fallback can miss sessions.** Session selection prefers projection
  cache hints (last-prompt time); on a cold composition without them it falls
  back to creation order, so an old-but-recently-active Session can fall outside
  the measured sample.
- **Runs and jobs are capped.** At most 40 runs per Session and 200 runs total
  are carried; an expanded turn shows at most 24 job rows while keeping the full
  job count, and the UI states `Showing X of Y jobs`. Job-to-turn association is
  a heuristic when the exact tool call cannot be matched. A turn only counts as
  a run with a finite `startedAt` (`isMeasuredTurn`), so a synthetic fork closer
  yields 0 runs and mixed inherited+real Sessions count only their real turns.
- **Cache-identity hash collisions are tolerated (NIT).** The 25 s project
  snapshot cache identity includes a 32-bit FNV-1a hash of the archived-member
  subset; a collision can only cause a cache miss or a briefly stale snapshot,
  never wrong data beyond one poll.
- **First loads and refreshes are slow on large logs.** A first or forced refresh
  took roughly 1.7–4.6 s on a five-Session repository. The Host keeps a **25 s**
  snapshot cache for the browser's 15 s poll; manual refresh bypasses it and pays
  the read cost again. The cache is FIFO (oldest Workspace snapshot evicted at
  the 30-entry cap), not LRU, and its identity includes the archived-member
  subset hash and requested focus Session. Unreadable Session logs are skipped
  with a warning that carries a bounded error identity rather than failing the
  page.
- **Annotation mode is not usable while the Project page is open.** Opening the
  page dispatches `power-suite:ui-annotation-exit`, deactivates annotation, and
  hides the launcher; the page's Esc ladder closes the page first, then the
  launcher returns with annotation still off. There is no mixed mode or z-index
  negotiation beyond that page-exit handoff.
- **NIT-level rough edges (accepted).** Run rows without expandable job records
  are still focusable buttons (Enter is a no-op); the Project page has no focus
  trap and does not return focus to the sidebar trigger on close; the page's
  "Last active" label refreshes on its own 15 s tick, not a separate ticking
  display; at the 1000-entry acknowledgement cap the oldest baseline is dropped,
  so a read mark beyond the cap could reappear in a future list; a non-ENOENT
  read-acks read failure raises the typed `READ_ACKS_READ_FAILED` path — GET and
  POST answer a no-store `500 { code: "store-read-failed" }`, the store never
  caches an empty document, and reads/writes recover once the file is readable
  again. These read-error paths are covered by `chmod`/unit tests only, not
  live-forced.
- **No virtualization.** Runs grow by **Show more** in batches of 60, so a very
  long project keeps all rendered rows in the DOM.
- **Archived only, no archiving controls.** Archived Sessions are excluded from
  the project snapshot; the view cannot archive or unarchive. Automatic
  archiving is not implemented anywhere — Inactive is only a window
  classification.
- **A project needs a Workspace row.** Sessions not accounted to a Workspace are
  not listed in the page, and a Workspace that no longer exists in the registry
  shows the **Workspace not found** empty state instead of a guessed project.
  Archived Sessions are still excluded from the snapshot.
- **The sidebar open affordance is the title text, not the leading icon.** The
  leading icon doubles as the native fold chevron on hover, so clicking it folds
  or expands the Workspace group; the title/folder text opens the project page.
  On touch/no-hover input a title/folder tap is intentionally the page entry and
  only the small chevron folds. The sidebar entry also ignores drags and modified
  or non-primary clicks by design, leaving drag reordering and open-in-new-tab
  gestures native.
- **Page state is intentionally preserved across Workspace switches.** The tab,
  filters, searches, and expanded rows survive clicking another Workspace in the
  still-visible sidebar; only the data hook follows the new Workspace id (the old
  request is aborted and its snapshot dropped). The same page instance is reused,
  so a filtered/expanded view can temporarily look empty until the new snapshot
  arrives rather than resetting.
- **Coarse statuses.** A turn that closed without a recognized reason is reported
  as stopped, not as completed or failed.
- **Localization.** The Project view ships English and Chinese copy; live checks
  ran against the English GUI, so the Chinese strings are code-reviewed but not
  live-exercised.

## UI element annotation

- **Not keyboard-navigable for annotation itself.** The mode is pointer-driven
  (launcher, hover, selection, popover); native keyboard shortcuts keep working
  while it is active, but there is no keyboard path to annotate an element. This
  is accepted for the current release.
- **Marquee cap.** A marquee adds at most the 24 most specific intersecting
  candidates, not every intersecting element.
- **Coexistence with the Project page is resolved by page-exit only.** Opening
  the Project page exits annotation and hides the launcher; annotation cannot be
  used while the page is open, and there is no mixed z-index mode.
- **Evidence traceability.** The full annotation E2E acceptance evidence was
  recorded on the pre-merge annotation build (final publication md5 `10dd3b72…` /
  branch commit `fd8ccc9`, round-2 build `37388d3f…`); the full suite was **not**
  re-run on the merged build (`572b8fa1…`). After the merge,
  `node test/browser/annotation.e2e.mjs --smoke` passed **6/6 on the merged
  build** with the **35-key** seam, 0 page errors and 0 real network failures,
  reusing the existing blank Session
  `session-5eec2763-0a91-460e-b559-08a8c3a98d13` (no new Session). That is
  smoke-only evidence; full live behavior remains pre-merge and no single
  all-green full-suite run exists. The logs it quotes live in `/tmp` and are
  external development artifacts, not repository files.
- **No client node harness for the pointer chain or sync internals.** The lazy
  hover chain/descriptor behavior and the client ack flush/401-403/merge rules
  live in the unexported browser bundle; they are code-reviewed, the chain was
  measured by an **ad hoc vm/fake-DOM probe (not the committed E2E harness)**,
  and neither is unit-tested end to end.

## Raw artifacts and implicit continuation

- The raw/preview routes accept any owner-authorized absolute path (the same
  authority as the native `/api/file`); they are not scoped to a Session's
  artifact list because the native Workspace files tree uses them too. The
  response media type comes from the real path, and every raw response is
  sandboxed with `default-src 'none'`.
- Continue is a durable `user/message` with a non-human source; Chat hides the
  matching native context/trigger row using the message time recorded for this
  browser. Trajectory/raw exports still contain it. A future Chat DOM that
  exposes the source kind on the trigger row would replace this shim.

## Settings page

- **README hidden while the section is mounted.** The bundle page's
  auto-rendered package README document (`[data-detail-document]`) is hidden only
  while the suite's settings section is on screen and restored on unmount; the
  behaviour does not change other plugin pages or the repository README.
- **Fixed option sets.** The Host accepts only the listed retention windows
  (1/2/6/12/24 hours and 1/3/7/14/30 days); an unknown value is rejected and the
  stored value is kept.
- **Shared, one document.** Settings are Host-owned (schema version 2); there is
  no per-browser or per-device override. Version-1 files migrate to the default
  windows on read.

## Localization and theming

- UI copy ships in English and Chinese; other locales fall back to English. The
  artifacts extension's new Provided/filter copy was reviewed in both languages
  but the live checks ran against the English UI only, so the Chinese strings
  are not live-exercised.
- The UI uses DSH theme tokens. Reduced-motion preferences disable preview
  animations.
- Hover preview geometry is remembered per browser in `localStorage`; it does
  not sync across devices.
