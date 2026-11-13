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
- Any `turn/end` `error` (including quota, timeout, transport, rate limit and
  malformed response) and `max-tokens` are treated as unfinished and resumable;
  `blocked`, `forked`, completed turns and user/parent/hook cancellations are
  deliberate and stay unmarked. Continue retries the task, so a persistent cause
  can fail again and re-mark it.
- The sidebar cache updates from live session events, a Host SSE invalidation
  stream, and a periodic fallback refresh. With the SSE connection healthy a
  boundary from another device is reflected immediately; without it (old
  browser, proxy buffering, stream failure) the fallback can lag by one poll
  interval. Each open tab holds one long-lived SSE connection and there is no
  event replay, so a reconnect performs a full known-record refresh.

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
- **Row actions reveal on hover or keyboard focus.** The card's trailing
  controls share one fixed grid (time 48 px → New session 22 px → disclosure
  24 px) and the action is hidden until a row is hovered or focused with the
  keyboard; a touch-only device has no hover, so the New session action is not
  reachable there (the Workspace's own New Session still is). Nested subagent
  rows intentionally have **no** New session action (their action/disclosure
  columns are empty spacers so times still align); an interrupted child keeps
  only Continue in the action slot. Hover never shifts the grid.
- **Continue sends a real continuation request.** The interrupted-row Continue
  action reuses the suite's continuation flow and actually asks the Host to
  resume that Session; it is a retry, so a persistent cause (missing credential,
  context too long, ongoing quota/rate limit) can fail again and re-mark the
  Session. Error/limit classification is covered by Host tests; a live
  error-ended Session was used to verify the badge/triangle path.
- **New session may fall back to the Workspace default directory.** The row
  action creates a blank Session in that row's own `cwd`; if the directory or
  Session creation is unavailable it falls back to the Workspace New Session, so
  the new Session can land elsewhere than the row's directory.
- **Parent disclosure state is per page.** Each parent's show/hide of its
  subagent children is not persisted; only the two bucket folds are.
- **Current highlight is decorative.** The open Session's card row, its owning
  native Workspace row, and the native sidebar Session row carry an internal
  rainbow atmosphere clipped inside each row's own rounded rectangle (no ring,
  no border, no outer glow); real text/controls stay above it under a faint
  scrim. It is `pointer-events: none`, follows the rows on re-render and pauses
  in hidden tabs, draws a static fill under `prefers-reduced-motion`, and is
  removed with the marker on session switch/unload; the Workspace row is chosen
  from the Session's Workspace, so a subagent Session highlights its parent
  project's row as well.
- **It depends on the shipped sidebar's internals** — the
  `[data-slot="sidebar.workspaces"]` wrapper, the `role="tree"` list, and
  `data-row-key="workspace:<id>"` rows. A DSH change to those anchors makes this
  feature render nothing; the native browser is unaffected.
- **Per-browser fold state.** `power-suite.dynamic-workspaces.folds` lives in
  `localStorage`, and `power-suite.dynamic-workspaces.buckets` caches the last
  bucket classification so the fold applies on the first observable paint
  before the Session store hydrates; live data corrects the cache once ready.
  The card's open/closed state is not persisted.
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
  full wrapped workspace path, Status detail, absolute Last active time, running
  subagent count, and the native Session statistics / Token usage / Context
  usage figures appear only in the row's hover card, which does not capture the
  pointer (and is unavailable on touch-only input). Figures are omitted when the
  Session's projections are absent; a cold (not currently live) Session gets one
  deduplicated projection read on first hover, so the card may fill those
  sections a moment after it opens and a stale/partial push can remove them
  again. The context composition rows are a heuristic estimate and are never
  presented as parts of the used-token total.
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

## UI element annotation

- **Not keyboard-navigable for annotation itself.** The mode is pointer-driven
  (launcher, hover, selection, popover); native keyboard shortcuts keep working
  while it is active, but there is no keyboard path to annotate an element. This
  is accepted for the current release.
- **Marquee cap.** A marquee adds at most the 24 most specific intersecting
  candidates, not every intersecting element.
- **Evidence traceability.** Live acceptance evidence for the current
  implementation was recorded on 2026-11-13 (annotation seam generation 66) with
  the in-repo CDP harness (`--smoke` 6/6; per-scenario S1-S15 with targeted
  self-contained runs). The full suite has **not** been observed fully green in a
  single process on this build: the known late-run headless stalls (S6/S8
  `Input.dispatchMouseEvent` timeouts) interrupt long runs, so per-scenario
  targeted same-build runs stand in for the missing rows. The independent
  verification rounds and their evidence gaps are recorded in
  [verification.md](verification.md).
- **No client node harness for the pointer chain or sync internals.** The lazy
  hover chain/descriptor behavior and the client ack flush/401-403/merge rules
  live in the unexported browser bundle; they are code-reviewed, the chain was
  measured by an **ad hoc vm/fake-DOM probe (not the committed E2E harness)**,
  and neither is unit-tested end to end.

- **Annotation records are browser-local.** The v2 document lives in
  `localStorage` for this browser profile/origin; it is capped at 100 records
  (the 101st add is refused visibly), never synced to the Host or another
  device, and can hold full Workspace paths plus the notes you typed. Clearing
  browser site data or the collection removes it. A page reload restores the
  records, but the page mark only appears for records that still resolve in the
  current page.
- **Floating-surface annotations are ephemeral by nature.** A native hover
  preview card exists only while hovered (and this plugin's card only while
  pinned in annotation mode); a reference captured from one is marked
  `ephemeral` and will usually stop resolving once the card closes. The
  annotation remains usable as locator data, and its status is reported honestly
  as missing/ambiguous rather than guessed.
- **Pointer-events-free tooltips cannot be annotated.** Native tooltips that set
  `pointer-events: none` cannot be hit-tested; annotate their anchor control.
  Native modals/menus stack above the annotation paint layer, so they must be
  closed before annotating the page behind them.
- **A uniquely verified selector can still go stale.** The selector is verified
  at capture time; after a re-render or data change the four live statuses report
  it honestly (Resolved / Matches several / No longer resolves / Content
  changed), and relocating refuses non-resolved targets.
- **The composer chip path has a fallback that is unit-tested only.** The
  plain-text fallback and its toast are covered by unit tests and code review;
  forcing the live fallback would require stubbing the shell's
  conversation/inputTriggers services, so it has no live E2E row. Trigger-source
  registration needs those two client services; an older composition without
  them automatically degrades to plain text. Sending a chip is never done by the
  harness (the feature never sends); missing-chip send blocking and batch
  removed-member honesty are unit-tested.
- **The composer chip group appears in the `@` menu.** The `@` trigger source
  shows up in the shell's reference menu ("UI annotations") only while the current
  Session has annotation records; it is an addition to that menu, not a separate
  picker.

- **Chip × removal uses the shell's editor handle.** The × overlay removes the
  reference chip through the Lexical editor instance exposed by the session input
  facade (with a keyboard fallback); it is only attached to
  `data-composer-chip="ui-annotation"` chips whose label maps to a local record,
  so native chips get no ×. The chip hover tooltip is read-only (no delete there).
- **Chat anchors follow the node/turn keys, not positions.** A new chat-flow
  annotation anchors to `data-chat-node-key`/`data-chat-anchor-key`/
  `data-chat-group-key`/`data-chat-turn`/`data-chat-flow-key`, so it survives a
  streaming re-render as long as the node exists; a node unmounted by
  virtualization reports the honest missing status, and annotations captured
  before this change keep their older positional locator (re-annotate to get the
  stable anchor).
- **The annotation sidebar widens the right rail in collection view.** It uses
  `clamp(320px, 24vw, 420px)` (415 px at 1728×900) so the managed list fits; the
  status/settings views keep the compact ~200 px rail, the frame padding and
  canvas shrink by the delta and restore on exit, and the narrow-viewport layout
  falls back to the 320 px overlay rail. On very narrow viewports the sidebar can
  feel large — collapse it to the 48 px strip or use the overlay mode.
- **Exiting the mode clears the annotation records (by design).** The header X,
  the footer **Cancel Annotation** action and the final Esc step ask for
  confirmation and then clear every single/group record, page mark and the
  persisted v3 document, so a re-entry starts empty; records still survive a
  page reload while the mode is active. There is no "keep annotations on exit"
  option yet.
- **A group shares one ordinal.** All items of a group show the group's number
  on their page marks; child sub-labels (e.g. `#7.1`) are subordinate and never
  advance the top-level sequence.
- **The settings view is a separate view reached through the header settings-line icon.** It
  keeps the same wide rail width to avoid a jump; the old status-view component
  remains in the code as an unreachable compatibility path (not rendered). The
  launcher dock/undock animation is a transient visual copy — reduced-motion
  users get the instant state, and the resting controls are the same as before.
- **Prompt-history search ring is deliberately calmer than the shared ring.**
  The parameterised rainbow ring's search-field variant is scoped to
  `.psp-search-field`; annotation inputs and settings pills keep the shared
  stronger defaults.
- **Batch tooling lives in the list toolbar.** Include/insert/delete-selected
  stay in the sidebar toolbar rather than hover-only per-row affordances (the
  footer keeps exactly the two primary/danger actions); group child "edit"
  previews/relocates the element because the batch requirement is shared on the
  group, and child delete removes the item with undo restoring the group.
- **Batch groups are a v3 document.** Groups hold one shared requirement and N
  element items; the 100-element cap counts singles plus group items (an
  over-limit group commit is refused visibly). The batch popover is not
  draggable yet and opens automatically ~0.8 s after the last selection change
  (so it never steals a click mid-gesture); Esc/X/clear dismisses it without
  saving. Old v2 records migrate as singles.
- **Chip hover preview matches records by element label.** Two annotations with
  the same element label resolve to the first matching record for the preview
  (the record itself is correct); native composer chips are ignored. Annotations
  captured before the message/turn-anchor change keep their older positional
  locators and can still report missing/changed — re-annotate those elements to
  get the stable anchor (no automatic remap is performed, because silently
  pointing an old annotation at a same-looking element would be dishonest).
- **Virtualized-offscreen nodes report missing.** A chat node that has been
  unmounted by virtualization genuinely no longer exists in the DOM; the
  annotation stays usable as locator data and shows the honest status.

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
