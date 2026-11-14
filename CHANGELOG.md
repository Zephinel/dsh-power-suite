# Changelog

All notable changes to this repository are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Planned as version 0.3.0; the release date is still pending. No dated release
heading is added until the release is cut.

### Added

- UI element annotation (expanded in this round): a floating launcher toggles a
  client-only annotation mode that makes room for a responsive right rail by
  shrinking the shell frame's `padding-right` (`clamp(188px, 11.6vw, 236px)`, no
  CSS transform) and falls back to an overlay rail on narrow viewports. Hover
  outlines the candidate element; the picker treats **floating surfaces**
  (body-level DSH hover preview cards, and this plugin's own hover card while
  annotation mode pins it) as selectable targets *and* lets the Parent/Child
  controls drill into their inner text blocks and controls, with a paint layer
  raised above native hover cards (inline `z-index:150`, exact value/priority
  restored on exit) and a 60 ms mutation-triggered hover recompute for surfaces
  that appear while the pointer is stationary. A click selects the element and
  opens the requirement popover: element name, locator summary, live
  resolution status, ancestor level up/down, requirement textarea, and
  **Mark requirement** / **Update requirement**, **Delete annotation** (5 s undo
  toast), and **Quick reference** actions. Every annotation is stored as a
  **v2 record** capturing a uniquely verified CSS selector, ≤3 sanitized
  ancestors, surface/ephemeral flags, Session id plus Workspace cwd/label, a
  query-free route, the bounds and viewport, and a text digest — never
  outerHTML, input values, JS paths, XPath, or computed styles. Records persist
  in browser `localStorage` (`power-suite.ui-annotation.annotations`, schema
  version 2, 100-record cap with a visible refusal), survive a reload, and
  re-resolve their Resolved/Matches several/No longer resolves/Content changed
  statuses live. Annotated elements keep a page mark with a numbered
  requirement-summary badge; hovering it opens a draggable detail card with the
  requirement full text, locator, position, Session/Workspace, status,
  surface/ephemeral marker, and **Copy locator** / **Relocate** / **Open in
  composer** actions. References are inserted as **native composer inline
  reference chips** through the shell's input-trigger seam (dynamic
  `conversation` + `inputTriggers` injection; an `@` source with current-Session
  candidates, no empty group): one chip for a single reference and one grouped
  `UI annotations × N` chip for a batch, serialized at send time through the
  existing reference/batch serializers (deleted members are skipped with an
  honest removed-count line, and a missing single record invalidates the chip so
  the send is blocked), with a plain-text fallback plus explanation when the
  chip services are unavailable. Multi-select is now a **batch group** flow:
  after the selection settles a single batch popover opens with the selected
  items and ONE shared Requirement; committing saves one group containing every
  selected element (each keeps its locator/metadata, no per-item requirements),
  and the group inserts as one `UI annotations × N` chip whose serialization is
  one request (shared requirement + numbered references with honest status
  lines). The persisted document is v3 (singles + groups, tolerant v2 migration,
  cap counts singles + group items, visible refusal) and the right rail's
  collection view is redesigned into a real managed **annotation sidebar**
  (widened to `clamp(320px, 24vw, 420px)`, status/settings views stay compact):
  an **Annotations** header with a total badge and subtitle, **All / Singles /
  Groups** filters with live counts, a unified scrollable list of single rows and
  group cards (count badge, collapse/expand, shared-requirement editing,
  always-visible edit/delete/insert actions), per-item metadata (Selector,
  Page/Area, Session/Workspace, updated time), empty/filter-empty states, and a
  footer with **Add annotation** and **Cancel Annotation** at equal widths (the
  danger action confirms and clears all annotations on exit). The list is the
  rail's default body on activation (the intermediate status/Collection/Settings
  rows are gone; a compact **settings-line** icon in the header opens settings,
  Back/Esc returns), with the selection hint in the header. The floating
  launcher is hidden while the mode is active (no docked/flight copy) and only
  fades/scales back in at its remembered position after a full exit
  (reduced-motion instant). Leaving the mode (header X, Cancel Annotation or the
  final Esc step) asks for confirmation and then clears all annotation records,
  so a re-entry starts empty; a group keeps ONE ordinal shared by all of its
  items (page marks show the group's number, never an incrementing sequence). Page
  pointer events are consumed in the capture phase so native controls cannot
  act while annotating; the configurable multi-select modifier toggles selection
  or starts a marquee, and the configurable pass-through modifier restores real
  native mouse and context-menu behavior without synthesizing clicks. Plugin
  text inputs (annotation note fields, prompt-history search, settings choices)
  use the shared rainbow track focus ring instead of solid focus borders; the
  launcher position, rail-collapsed state, and two modifiers persist in browser
  `localStorage`, while annotation records use their own v3 document (singles + groups). The
  browser-only feature adds no Host route, service, or profile change, cleans up
  every listener, layout marker, and DOM node on exit and HMR, and ships a pure
  test seam plus live-page CDP acceptance harness (seam generation 66; see
  [verification.md](docs/verification.md) for the honest per-scenario record —
  the known late-run headless S6/S8 stalls mean no single all-green full-suite
  run is claimed).

### Added

- UI element annotation precision: picking is now **leaf-first** (DevTools-inspect
  style) on ordinary pages and inside floating surfaces — hover and click target
  the deepest eligible element under the pointer (titles, subtitles, timestamps,
  token counters, inline SVG icons/paths, then rows/buttons), walking up only for
  the plugin's own UI, structural tags, or zero-size nodes, and never escaping a
  floating surface's root. The popover's Parent/Child controls walk the full
  hovered ancestor chain (Child back to the deepest element, Parent up to the
  surface/page container), and the whole surface stays selectable via its
  background/padding or Parent. Selection outlines and popover anchoring use the
  picked live element so any leaf keeps correct geometry; records keep honest
  locators/status for weak (e.g. SVG) targets. Limits (bare text nodes resolve to
  their parent element, CSS pseudo-elements aren't elements, `pointer-events:none`
  targets fall back to the nearest ancestor) are documented.

### Added

- Native session figures in the Running & recent row hover card: for the hovered
  Session (parent or nested subagent row) the card appends **Session statistics**
  (`{turns} turns {steps} steps`, LLM time, tool time, average TTFT, TPS in the
  native duration/speed recipes), **Token usage** (exact grouped total =
  billed input + output, honest cache-hit percentage that never rounds a partial
  hit to 100, uncached/cached/cache-write/output exact counts), and **Context
  usage** (`{percent} of context used`, `~used / window`, and `~`-prefixed
  System prompt / Tool definitions / Messages composition rows). Values come from
  the existing `sessions` inject's `projectionsBySession` — live Sessions are
  push-seeded and need no request; a cold (persisted) Session gets exactly one
  deduplicated `refreshProjections` read on first hover, and the card fills the
  figures in as they land with no loading state. Each section is omitted entirely
  when its data is absent, so an empty Session keeps the plain card. The card
  grows to 320 px (still flush on the sidebar edge with the same native tooltip
  chrome) and clamps at `min(560px, 100vh - 16px)`; subagent cards gain a compact
  Session-title line. While a **live** Session's card stays open the figures
  keep refreshing in place from the pushed projection frames (the panel's 1 s
  clock re-reads the live snapshot; no extra polling or network); a cold/persisted
  Session still gets exactly one deduplicated `refreshProjections` read. No Host
  route, new inject, or package dependency.
- Interrupted-state SSE stream: `GET /api/power-suite.interrupted-events`
  pushes `turn/start`/`turn/end` invalidations (`{sessionId, parentSession,
  event}`) to every connected browser page, so cross-device badges/Continue/
  triangle state updates immediately instead of waiting for the 20 s poll. The
  stream has a 25 s heartbeat, `retry: 10000`, one cleanup-safe connection per
  tab, no event replay, and the existing poll/focus/visibility/reconnect cues
  remain the fallback when EventSource or the stream is unavailable.

### Changed

- UI element annotation launcher placement: the round launcher floats only while
  the mode is off; activating the mode fades/scales it out in place (no docked
  or flying copy in the rail header), and a full exit (header X, Cancel
  Annotation, or the final Esc step) restores it with a fade/scale animation at
  the remembered floating position (drag and position persistence are
  idle-only; reduced-motion users get the instant state).

- Running & recent identity glyphs swapped: the panel header's all-complete
  indicator now paints the DeepSeek brand glyph (`deepseek-fill`) and an
  acknowledged finished parent row paints the sparkling-line glyph. Sizes,
  scales, colours, glyph columns, the running pulse dot, the unread green dot,
  and the nested subagent robot glyph are unchanged, as is all state logic.
- Running & recent card layout: rows and the header share one fixed trailing grid
  — title (right-edge gradient fade while clipped) → **time 48 px**
  (right-aligned, tabular numerals) → **New session action 22 px**
  (hover/focus-revealed) → **disclosure chevron 24 px** — so parent and nested
  subagent rows right-align their times on one column and no title can push the
  controls; a flexible spacer between the content-paced title control and the
  trailing grid keeps that grid right-anchored at **every card/sidebar width**
  (short titles no longer leave the time floating mid-row). Nested subagent rows
  no longer offer the New session action (their action/disclosure columns are
  empty spacers; an interrupted child keeps only Continue in the action slot),
  and the header joins the same grid. Rows get a clear vertical gap (5 px
  between items, 4 px parent→first child, 5 px child↔child) so the current-row
  atmosphere never touches its neighbours while the 1 px subagent trunk and its
  last-child end mask stay coherent and hover actions remain reachable across
  the gaps. The row-body highlight pill stays content-paced with roomy text
  insets (parent `4px 10px 4px 14px`, child `3px 8px 3px 10px`; the title text
  sits ≥8 px inside the pill's right edge and the fade mask clips inside that
  padding) while the action/chevron highlights keep fixed 22×22 / 24×26
  geometry on one column.
- Running & recent current-highlight: the animated conic rainbow ring is replaced
  by a vivid animated rainbow **atmosphere painted inside the row's own
  rounded-rectangle highlight**, with the row's real content (title, time,
  leading glyph, actions) layered above it under a faint contrast scrim. The
  renderer uses source-over saturated blobs (vibrance 1.72, intensity .64,
  `saturate(1.5)` plus per-theme multiply/screen blending and a lightened scrim)
  so the pill reads as saturated rainbow gas rather than a grey wash; measured
  blob-core saturation is ~0.40–0.43 (static ~0.30–0.34 under reduced motion)
  and the harness pins that baseline. It
  applies to the current Session's card row (parent and nested child rows), the
  owning native Workspace row, and the native sidebar Session row of the open
  Session (`data-psd-current-session`), is clipped to each row's own radius, is
  `pointer-events: none`, changes no column/geometry/layout, animates only the
  highlighted rows (hover raises it slightly), and draws a static rainbow fill
  under `prefers-reduced-motion`. Opening a Session from the card, the sidebar,
  or anywhere else moves the highlight together with the
  Activity/Workspace/Session association.
- Running & recent hover card: the row detail card now matches the live native
  sidebar session hover-card oracle (left edge flush with the sidebar's right
  edge, top aligned to the row, borderless, 16 px radius, 12×16 padding and
  native title/secondary type), grows to 320 px for the figure rows, and clamps
  to `min(560px, 100vh - 16px)`. **All plugin tooltip-like floating cards** (the
  row card, Artifact Quick Look, prompt-history preview/search cards, and the
  annotation requirement popover/detail card/expanded note editor) now paint the
  native hover-card surface — a fixed `#2C2C2E` (`--dsw-hovercard-bg`) in both
  light and dark themes rather than the theme-flipping tooltip token, with no
  border and the shell's native panel elevation. The panel's plugin chrome also
  inherits the shell font family/size/weight and shows title-case **Active
  Projects** / **Inactive Projects** bucket labels instead of uppercase.
- Running & recent fold persistence: the Active/Inactive bucket fold state is
  restored on the **first observable paint** using a persisted bucket
  classification cache and then corrected by live data, so a collapsed bucket no
  longer paints expanded for the hydration window; native section re-renders
  cannot clobber a fold.
- Plugin input focus treatment: a shared animated rainbow track focus ring
  replaces solid-color focus outlines/borders on plugin text inputs (annotation
  note fields, prompt-history search field, settings choice pills); it fades in
  in 140 ms, rotates and hue-drifts, keeps a static ring under reduced motion,
  and falls back to the system `Highlight` outline under forced colors. The ring
  is parameterised and the prompt-history **search card** paints a deliberately
  calmer variant around the whole floating card when its input is focused
  (opacity 0.58, desaturated 2.5 px glow, 1.5 px track, slower 4.6 s/20 s
  drift; the inner input itself is ringless) so it reads as a soft accent; the
  other inputs keep the shared stronger defaults.
- Interrupted-session detection now covers **every unfinished turn ending**, not
  only Host restarts/crashes: any `turn/end` reason `error` (quota/usage limit,
  request timeout, transport/network failure, rate limit, malformed response,
  missing credential), `max-tokens`, `interrupted`, and `aborted` with the
  `disposed` or legacy cause mark the Session as unfinished. Deliberate endings
  (`completed`, `blocked`, `forked`, user/parent/hook cancellation) stay
  unmarked. The existing amber badge, hover Continue action and play-shaped
  composer control therefore appear for timeout/error sessions too; Continue
  retries the task (a persistent cause can fail again and re-mark it).
- UI element annotation audit fixes: user notes are normalized with
  `normalizeUserNote` (CRLF→LF, NUL/C0 control characters except tab/newline
  removed, spaces/line breaks preserved, **no redaction and no silent
  truncation**) and inserted verbatim (multi-line notes can exceed single-line
  layouts); hover uses a lazy element-only candidate chain with descriptors
  built only for the chosen element and ≤2 context ancestors (0 `textContent`
  reads on hover); the whole
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

- UI element annotation follow-ups: hovering a composer annotation reference
  chip (single or grouped) now shows the custom annotation detail tooltip —
  requirement, locator, captured position box, Session/Workspace, live status,
  or the group count/list — while clicking keeps its existing behavior; chat-flow
  element picks now anchor to the shell's real chat attributes
  (`data-chat-node-key`/`data-chat-anchor-key`/`data-chat-group-key`/
  `data-chat-turn`/`data-chat-flow-key`), so leaf targets in a
  streaming/virtualized chat resolve across re-renders instead of reporting a
  stale positional locator (the four statuses stay truthful, and annotations
  captured before this change are not silently remapped — re-annotate them);
  hovering or focusing a single/grouped annotation chip shows an own 16 px ×
  that removes exactly that reference chip through the composer editor in one
  undo step (other chips and text preserved, never sent), while the chip hover
  tooltip stays read-only; the requirement popover keeps its Delete action in the
  Requirement caption row (marked state only) so the footer holds exactly the two
  primary buttons on one non-wrapping row, with a wider caption→textarea gap; and
  the rainbow input focus ring now hugs the wrapped control's border box on all
  four edges (the inline-level baseline gap that exposed the control's bottom
  border is fixed).

- UI element annotation transient surfaces: selecting an element inside a
  hover-triggered floating surface (e.g. the subagent hover dropdown) no longer
  loses its target when the pointer moves into the requirement popover — the
  surface is pinned open for as long as that popover is active (pointer-leave
  close events are suppressed for the pinned subtree and released on close/
  selection clear/mode exit), so the status stays Resolved while editing and the
  transient hint now explains the keep-open-then-may-disappear behavior. If a
  surface still closes (timer/scroll/keyboard path), the status changes honestly
  but the locator summary stays the captured string instead of switching to a
  look-alike element's label.

- UI element annotation anchors: text-bearing leaf captures now also record a
  bounded absolute `xpath`, a normalized `textQuote` (exact + prefix/suffix),
  a container-relative `textPosition`, and a `document.querySelector(...)`
  `jsPath`; resolution falls back **CSS → XPath → text quote → text position**
  when the primary candidates go stale, and the popover/detail card show which
  strategy resolved the target (`via` hint) without changing the four honest
  statuses. Selector candidates get explicit stability tiers (stable
  data/ids/aria > semantic role/label > stable classes > positional paths), and
  the detail/popover actions gain **Copy XPath** and **Copy JS path** (clipboard
  + toast, honest unavailable state when no anchor exists). Records captured
  before this change keep working without the new anchors.

- UI element annotation selector stability (P0, from the reference-coding
  round): resolution is now two-phase — per-candidate hit sets are collected and
  the first unique candidate (highest stability tier/score) wins, so a
  non-unique high-tier candidate (e.g. a duplicated `aria-label`) no longer
  short-circuits to Ambiguous when a lower-tier structural/anchor candidate
  resolves uniquely; Ambiguous is reserved for genuinely all-non-unique
  candidates, and weak XPath/text-position ambiguity no longer terminates the
  text-quote fallback. CSS-module/hashed class names are filtered by a
  word-like/generated-pattern heuristic, and record identity uses the verified
  unique selector.

- UI element annotation anchor hardening (P1/P2, reference-coding round):
  capture-time text-quote disambiguation (occurrence-aware context, bounded,
  uniqueness-verified, misleading quotes dropped), one rendered-text pipeline
  (`<br>`/block boundaries → space + rendered→raw offset map), fallback order
  **CSS → text quote (position hint) → text position → XPath last** with a
  single validation boundary (tag/digest/accessible name/proximity), scored
  approximate matching (0.7/0.15/0.15; exact unique context resolves, small
  edits report Content changed, ties Matches several, approximate hits capped
  below Resolved), fallback status/node cache keyed by `(record id, DOM
  revision)` with bounded scans (400 elements / 32 candidates) and a 400-entry
  node cache, whitespace-only text separators preserved, and a **weak-identity
  gate** so icon-only/tag-only records cannot falsely resolve via structural
  fallbacks (no wrong marks/copies; they report Changed honestly). Copy
  locator/XPath/JS path is now available in the popover, detail card and rail
  row with live-node-first → saved-anchor → honest-unavailable semantics and
  optimized vs full XPath (full only with a live node, never fabricated).

- UI element annotation descendant anchors + confidence: non-leaf targets with
  meaningful descendant text now capture a first-text-leaf rendered quote/
  position plus `anchorTarget:'descendant'`, the leaf tag, the ancestor tag chain
  and a stable-attribute signature; when CSS candidates go stale the resolver
  falls back to the descendant text anchor and climbs to the closest ancestor
  matching tag+signature (unique → Resolved, same-text/same-signature decoys →
  Matches several with no mark, none → honest continue; floating/ephemeral
  surfaces deliberately excluded). Weak-identity structural outcomes keep the
  four statuses but add `confidence:'weak'|'strong'` and present
  "Unverifiable · weak identity" / "无法验证 · 弱身份" instead of Content changed.
  The capture scope-climb duplicate probe now uses the rendered-text pipeline
  (no second text口径), fallback scans/cache misses are instrumented for a
  test-only probe (repeat resolution on unchanged DOM adds zero scans; host
  mutation re-resolves once), and docs recommend host apps expose stable
  `data-testid`/`data-*`/accessible names for position-sensitive elements.

- UI element annotation captured-scope authority: for descendant text anchors
  the recorded scope (`textPosition.container`) is now authoritative — a unique
  in-scope target resolves even when an identical out-of-scope duplicate exists
  (the Workspaces-row vs Running & recent-title case no longer reports a false
  "Matches several"); multiple distinct in-scope targets are **terminal
  ambiguous** and later text-position/XPath fallbacks cannot override them,
  while an empty/missing scope still re-anchors through the bounded document
  fallback. The fallback-node resolver mirrors the same decision so ambiguous
  records do not expose a non-authoritative live node for copy.

- UI element annotation structural-identity honesty (reference-aligned):
  a stale `uniqueVerified` selector no longer counts as identity unless it still
  resolves to a single connected/visible element; structural (CSS/XPath)
  fallback hits must pass a Hypothesis-style quote assertion plus
  captured-ancestor corroboration before Resolved, and weak-identity records
  without a quote are **Missing** — no mark or live-node copy on a same-tag
  look-alike. Removed floating/ephemeral targets now report **Missing** instead
  of Changed after reload, matching the documented transient contract.
  Reference-alignment subset: approximate matching recall now mirrors
  Hypothesis `matchQuote` bounds (maxErrors ≈ len/2, distance-faded hint,
  broader scan), selector candidates add a role+name composite and a length
  penalty, and the docs correct the identity/transient/order claims.

- UI element annotation NIT follow-ups: ephemeral/floating surface-gone now
  reports **Missing** for every outcome through a single
  `annotationEphemeralOutcome` gate (still-present surfaces keep honest
  outcomes; the conservative transient-Changed policy is documented), the weak
  "Unverifiable · weak identity" label regained E2E coverage, role+name got its
  own selector-stability tier (data/id/aria > role+name > label/role > class >
  tag/nth), and the matchQuote recall / role+name / length-penalty behavior is
  pinned by unit tests. Deferred reference-conformance limitations moved into
  the user docs.

- UI element annotation settings: the rail header's settings gear/settings view
  is replaced by an **info (i) icon** that opens a small **borderless
  hovercard-style popover** (background `#2C2C2E`, border 0, lv3 shadow) with
  the two modifier rows — pass-through and multi-select — each using a
  **custom dropdown** (combobox trigger + fixed listbox, checkmark, full
  keyboard support, ARIA combobox/listbox/option, outside/Esc close, no native
  select or OS menu). Conflict feedback appears inline; the popover renders
  inline in the rail/overlay stacking context (above the raised annotation
  layer) and document-level Esc closes the menu first, then the popover, with
  the mode staying on. The old settings view/Back path is removed.

- UI element annotation modifier settings are now **custom segmented controls**
  inside the info-icon borderless popover: two `role=radiogroup` rows with four
  `role=radio` segments (Alt/Ctrl/Meta/Shift), roving tabindex, arrow/Home/End/
  Enter/Space selection, persistence + inline conflict feedback, glass track and
  primary-accent checked segment, rainbow focus ring on the checked radio; the
  dropdown/listbox implementation (and its seam helpers) is removed. No native
  `<select>` or OS menu remains.

- UI element annotation segmented controls now show the modifier-key symbols
  (`⌥ Alt`, `⌃ Ctrl`, `⌘ Meta`, `⇧ Shift`) with full localized aria-labels,
  equal widths and no truncation.
- Dynamic-workspaces rainbow atmosphere rows are readable in light mode: a
  brighter pastel canvas (saturate/brightness lift, lower wrapper opacity), a
  white readability veil instead of the dark scrim, and lifted secondary
  text/icons on highlighted rows (card title 5.51:1→14.72:1, time/icons
  1.08:1→4.52:1, native Workspace worst text 15.45:1); dark mode unchanged and
  the sidebar E2E pins the light thresholds/theme-aware atmosphere facts. The
  reported dark document-preview panel was found shell-owned/not reproducible
  (plugin defines no `--dsw-*` variables; native light preview tokens are
  correct; only the shell diff sub-palette is low-contrast) — documented as a
  shell-side limitation, no broad override added.

- Dynamic-workspaces session hovercards now follow the active theme: light mode
  uses a white surface with the light label tokens (title `#0f1115`, secondary
  `#61666b`, tertiary `#81858c`) for the plugin's `.psd-hovercard`/`.psp-*`/
  `.dsa-quicklook` cards and a minimal scoped override for the native shell
  session-info hover card; dark mode is byte-identical (`#2C2C2E` + white).
  Running & recent row titles are aligned to the native Workspace title token in
  light mode (dark rows unchanged), so the panel reads as dark/readable as the
  Workspace rows. The native override depends on shell module class hashes and
  degrades gracefully to the native dark card; the exact markdown preview modal
  was not deterministically reproducible.

### Removed

- Standalone Project detail page: the `project-view` feature is removed —
  `src/features/project-view/{host.js,fold.js}`, the `//#region feature: project
  view` browser region and its `installProjectView` call, the 24 project-view
  tests, `docs/project-view.md`, the five `docs/assets/project-*.png`
  screenshots, and the `GET /api/power-suite.project` route. Clicking a
  Workspace's title in the sidebar performs the native expand/collapse again,
  and the default agent preset stays available from the Workspace context
  menu. Removing the page needs no data migration: it persisted no state.

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
