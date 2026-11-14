# Verification

This file records the checks that protect the current checkout. Update it when
behavior changes.

## Automated

Run from the repository root:

```bash
npm run check
npm test
npm run pack:check
```

`npm run check` performs:

- `node --check` on both package entries and every Host feature entry;
- package-manifest validation: exports/files/icon/cordis patch are present and
  the DSH bundle patch points at a real file;
- the pure-logic test suite (`node --test test/*.test.js`).

Current evidence (2026-11-13, Node 24.22.2; merged 0.3.0 polish round):

- `npm test`: **228 tests, 228 passed, 0 failed, 0 skipped** after the 0.3.0
  Project-view removal (the 24 project-view tests were deleted with the page),
  including **14** read-acks, **22** session-activity Host tests, **7** extra
  interrupted-session tests (error/max-tokens/aborted-cause cases and SSE stream
  frames), **11** Dynamic-Workspaces hover-card figure tests, and **118**
  UI-element-annotation tests through the browser-factory test seam; per-file:
  dynamic-workspaces-stats 11, interrupted-host 20, interrupted-sessions 7,
  prompt-history 6, read-acks 14, session-activity 22, session-artifacts 16,
  settings 6, ui-annotation 118, workspace-presets 8.
- `npm run check`: passed (`16 modules, 10 test files`).
- Interrupted-state SSE transport was verified with cookie auth: 200,
  `content-type: text/event-stream; charset=utf-8`, no-store/no-buffering, first
  frame `: connected` + `retry: 10000`, held open until a 2 s curl timeout (no
  immediate close). Two independent loaded tabs both showed the badge, row
  Continue CTA, interrupted composer root and play-triangle mask for
  `session-685bae89…` (0 console errors). A live new-turn-boundary cross-tab
  push was not triggered on a user Session; the broadcast frames are covered by
  Host tests and the client EventSource path is code-reviewed (evidence gap).
- Interrupted-session generalization was verified on a real error-ended Session
  (`session-685bae89-2798-4bed-83c4-f28ddf0ed024`, last `turn/end` reason
  `error` / `RATE_LIMIT`): the route returned `interrupted: true`, the sidebar
  row carried `data-power-suite-interrupted`, the hover Continue pill was
  present, and the composer primary control was enabled with
  `aria-label="Continue the unfinished task"` and the play-triangle mask. No
  live continuation was sent (the retry itself is covered by Host tests).
- `npm run pack:check`: **70 files** (0.3.0 tarball), including `src/`,
  `locale/`, `docs/` (with the activity-card
  actions/acknowledgement/ledger/current-ring states, Artifacts
  panel/filter-menu/Quick Look, Dynamic Workspaces, hover-detail,
  prompt-history rail captures, and the UI-element-annotation captures),
  `cordis.patch.yml`, `icon.png`, and the standard repository files.
- Manual probes / code-reviewed behavior (no node harness): a failed ledger disk
  write was exercised with a temporary-directory probe only (it keeps the map in
  memory without durability and resolves flush/dispose); the client's 408/425
  retry classification and its per-id monotonic activity merge/prune rule live in
  the unexported browser bundle and were reviewed in code plus exercised live,
  not in `node:test`; flush-before-activity ordering was measured live, not
  unit-tested.
- Host tests cover the read-vs-event cache race, silent-subagent timing, continue
  content-type/state/in-flight validation, the non-human source fields, the
  prompt-history timestamp fold (`at` from a finite event time, `null`
  otherwise) with the 500-prompt cap unchanged, the settings store (schema
  version 2 with the two retention windows, version-1 migration to the default
  windows, and patch validation for unknown/invalid fields), and — before the
  0.3.0 removal — the Project view folds and route (turn status map, job association, the canonical measured-turn
  rule, the 40/200/24 caps, stats and recent-activity derivation, parameter
  validation and 25 s cache behavior), the read-acks store/route (schema,
  sanitization, max-merge, 1000-entry cap, 415/413/400/500 including the
  non-ENOENT read-error paths exercised with `chmod`, single-flight load with
  forward-merge publication under concurrent get/record stress — 20 rounds of 4
  concurrent get + 3 record preserve every ack in memory/file/reload, and
  unreadable→restored merges old+new), and the
  event-sourced activity ledger (store max-merge/cap/atomic persistence,
  best-effort read-merge writes with a TOCTOU window, flush/dispose durability
  including an in-flight write and repeated dispose, record→dispose→reload, 20
  sequential lifecycles, allowlist families plus the explicit non-activity set
  — including `hook/invoked`/`hook/result` and the `ptc-mode` rejection, one-time
  baseline with the now+60 s future clamp, the seed-timeout **backoff** route
  behavior (first GET bounded, backoff GETs fast, release picks up seeded
  values), and the first-load **retry** after a typed activity read failure:
  fail-once ledger returns `200 {}` on the first GET, then after the backoff the
  next GET retries load+seed and returns the recovered entry). The
  failed-disk-write path and the client's 408/425 retry
  classification and the client 401/403 retry rule are **not** node tests — see
  the manual/code-reviewed note below. The annotation E2E acceptance evidence is
  **pre-merge**; the merged build `572b8fa1…` itself was not re-run (its seam is
  the 32-key generation); after the audit fixes, a `--smoke` run on the
  post-audit-fix build `1c61a230…` passed 6/6 with the 35-key seam (smoke only —
  the full E2E was not re-run and no single all-green full run exists); the lazy hover chain's
  zero-`textContent` claim comes from an **ad hoc vm/fake-DOM probe, not the
  committed E2E harness** (which has no such instrumentation), and is not a node
  test.
- The UI element annotation mode adds no Host route, service, or Session-log
  write; its pure model is covered by **58** `node:test` cases through the
  browser factory test seam, and its live behavior by the pre-merge acceptance
  harness below (post-audit-fix build `1c61a230…` smoke passed 6/6, 35-key seam;
  the merged build `572b8fa1…` itself was not re-run; the full E2E was not
  re-run).
- Host routes are covered by tests where they exist: Dynamic Workspaces'
  card state is browser-derived but Host-backed through the read-acks store/route
  and the session-activity ledger route (16 MiB document guard, allowlist
  families/non-activity set, seed backoff, cold-load snapshot), while the
  Project view's
  `GET /api/power-suite.project` route and its pure folds were covered until the
  0.3.0 removal by the project-view suite (turn status, fork closer, stats
  exclusion, cache identity/TTL). The prompt-history rail shares the existing
  `api/prompt-history.list` payload and draft attachment memory writes nothing to
  the Host or storage; the remaining client-only surfaces rely on the syntax gate
  and the live checks below.
- The root-package reinstall was verified after a Host restart: the Loader row
  `include:power-suite` reports `fiberPhase: active` from the new repository
  root path.

Interrupted-session subagent detection and the implicit-continue Host route were
also checked without restarting the running Host: the route has tests for the
non-human `power-suite-continue` source, a missing Session controller, and empty
prompts; subagent detection was checked against real local Session logs: the parent
`session-bd41197f-48fd-4065-a4f8-5545510cc86e` (main turn completed, two child
sessions left with open crash tails) returned `interrupted: true,
subagent: true`; two completed control Sessions stayed `interrupted: false`.

**Removed in 0.3.0: the standalone Project detail page.** The `project-view`
feature (the Host route and folds, the `src/client.js` region and its sidebar
title entry, 24 tests, `docs/project-view.md`, and five `docs/assets/project-*`
screenshots) was removed on the user's decision. Clicking a Workspace title now
performs the native expand/collapse again; the Workspace context-menu default
preset path is untouched, and no data migration was needed because the page
persisted no state. The live evidence for the page under "Manual UI checks" is
kept as the historical record of that implementation; its links to the deleted
page and screenshots were removed. Current gates after the removal and the polish
round: `npm test` **201 tests**, `npm run check` passed (`16 modules, 10 test
files`), and `npm run pack:check` **70 files**. Before the removal the same gates
reported 181 tests, 18 modules, 10 test files, and 78 packed files.

## 0.3.0 polish round acceptance (2026-11-13, merged build)

This round reworked the UI-element annotation feature, fine-tuned the Dynamic
Workspaces surfaces, aligned plugin chrome with the native tooltip recipe, and
removed the standalone Project detail page. It was verified on the merged
integration build with real-GUI CDP runs plus an independent read-only verifier
(two rounds, findings recorded in `.tmp-design/` during development and not
committed). The per-scenario record below is the honest composite: the known
late-run headless stalls (S6/S8 `Input.dispatchMouseEvent` timeouts) still
prevent a single all-green full-suite process, so targeted self-contained runs
stand in for the missing rows, as this repository has done before.

**Gates on the verified build** (Node 24.22.2, Chrome 157): `npm test` **202
tests, 202 passed, 0 failed, 0 skipped**; `npm run check` passed (`16 modules,
10 test files`); `npm run pack:check` **70 files**, exit 0. The suite includes
the 91-case UI-element-annotation model, the 11-case Dynamic-Workspaces hover-card
figure model, and the existing Host suites.

**Live harnesses** (throwaway headless Chrome, this checkout's `src/client.js`
injected into the running GUI at 1728×900; 0 page errors and 0 real same-origin
API/plugin network failures in every run below):

- Annotation rail default body: activating the mode opens the managed
  annotation list directly (no intermediate status/Collection click) — header
  **Annotations** + total badge + subtitle + selection hint (switches to
  "N elements selected"), filters, toolbar, singles/group cards, footer and
  empty state; a **settings gear icon** in the header opens the settings view
  (Back/Esc returns to the list). The docked launcher animates a ~220 ms
  ease-out flight between the remembered floating slot and the rail-header slot
  on activation/exit (transient pointer-transparent flight element; exactly one
  resting launcher; reduced-motion instant). The rail uses the wide list width
  while active (415 px at 1728×900), restores on exit, collapses to 48 px and
  falls back to the 320 px overlay on narrow viewports.
- Annotation sidebar redesign: the rail's collection view widens to
  `clamp(320px, 24vw, 420px)` (415 px at 1728×900; status/settings views stay
  ~200 px) and shows a real managed list — **Annotations** header + total badge
  + subtitle, **All / Singles / Groups** filters with live counts, single rows
  and group cards (count, collapse/expand, always-visible edit/delete/insert),
  metadata (Selector, Page/Area, Session/Workspace, updated time), empty and
  filter-empty states, and a footer with **Add annotation** plus dynamic
  **Clear selection / Clear collection** (undoable). Scenario 9 asserts the
  width/frame/canvas delta, restore-on-exit, the list structure/counts/filters,
  collapse/expand, always-visible actions, footer states, the default-list
  activation (no Collection/Settings rows, gear icon) and the narrow-viewport
  overlay; scenario 1 asserts the launcher flight element appears during
  activation/exit and that exactly one resting launcher remains. The full `--from 4` sequence showed intermittent post-scenario
  activation/reload timeouts that do not reproduce standalone or in `--from 9`
  (0 page errors) — recorded as a long-sequence flake, not a green full run.
- Sidebar harness `test/browser/sidebar.e2e.mjs`: **43/43 PASS**. It
  asserts the trailing grid (time right **209 px** for parent *and* child rows,
  action slot 233, disclosure 259, no child New-session control, hover reveal
  without shift), the multi-width grid invariant (parent and child time right
  edges identical at natural/320/400 px row widths, disclosure at the row right
  edge, clipped titles never under the trailing columns), inter-row spacing
  (5 px item gap, 4 px parent→first child, 5 px child↔child, intact trunk/end
  mask, hover reachable across the gaps), the internal rainbow atmosphere (a
  clipped wrapper inside the
  row's own radius on the card parent/child rows, the owning native Workspace
  row and the native sidebar Session row, canvas painted inside the row's paint
  box, scrim above the canvas, content above the scrim, exactly three renderers,
  static reduced-motion fill, no layout shift, old ring/band/pseudo layers
  gone), the 320 px
  hover-card frame, the native figures (Session statistics / Token usage /
  Context usage with native formatting and honest cache-hit rounding, live
  in-place refresh while the card stays open — deterministically pinned with a
  guarded test seam — cold-row single read, hidden-when-absent), the vivid
  atmosphere baseline (saturate(1.5) filter, wrapper opacity >= .78, scrim alpha
  <= .24, blob-core saturation >= .38 animated / >= .28 static, per-theme
  multiply/screen blend), title-case buckets, fold persistence at
  first paint, the browser borderless/typography recipe, the calmer
  prompt-history search focus ring (parameterised calm ring on the WHOLE search
  card via focus-within: opacity 0.58, saturate(.8), 2.5 px glow, 1.5 px track,
  inset -3 px with the card radius +3, inner input ringless; shared defaults
  unchanged for the other inputs), the row-highlight text insets (parent `4px 10px 4px 14px`, child `3px 8px 3px 10px`; title text
  >= 8 px inside the pill's right edge, pill content-paced, mask boundary
  recalculated), and both cross-branch annotation-mode hover-card pin states.
- Annotation harness `test/browser/annotation.e2e.mjs`: `--smoke` **6/6 PASS**
  with the **110-key** seam. On the final build: scenario 10 **PASS 8 / SKIP 0 /
  FAIL 0** (including `10b`, the real pinned-cross-branch-card check),
  scenario 11 **PASS 7 / 0 / 0**, scenario 12 **PASS 7 / 0 / 0** (marks, detail
  card, requirement edit with `updatedAt`, delete → 5 s undo, popover layout:
  delete in the Requirement caption row (marked state only), footer exactly two
  primary buttons on one non-wrapping row, caption→textarea gap 9 px, rainbow
  ring exact on all edges),
  A comprehensive reference-first review then re-ran every annotation scenario
  individually and found two product honesty gaps plus one test bug: (a) a truly
  unmounted weak-identity element (stale `uniqueVerified` selector, generic path
  candidate matching a same-tag look-alike, constant empty-text digest) still
  reported Resolved and could draw no mark; (b) a removed floating/ephemeral
  target reported Changed after reload instead of Missing; (c) S14's persistence
  test exited the mode (which clears records by spec) before asserting restore.
  Fixed reference-aligned: the verified selector must still resolve to a single
  connected/visible element (`identityStillStrong`), structural hits get a
  Hypothesis-style `maybeAssertQuote` assertion plus captured-ancestor
  corroboration, weak identity without a quote is Missing (no mark/copy on a
  look-alike); floating/ephemeral surface gone ⇒ Missing (never
  Changed/Resolved); S14 reloads without a confirmed exit. Scenario 6/10/14 are
  now green and the reference-alignment subset (matchQuote recall bounds/hint
  fading, role+name composite candidate, selector length penalty, docs
  corrections) landed; delta re-review **PASS-WITH-NITS** with no required
  changes.
  A NIT follow-up round then closed the remaining reference-review gaps:
  ephemeral/floating surface-gone now reports Missing for ALL outcomes (single
  `annotationEphemeralOutcome` gate; still-present surface keeps honest
  outcomes, with a documented conservative transient-Changed policy), the weak
  "Unverifiable · weak identity" label regained E2E coverage (S12 weak seed +
  text edit: status changed, data-psa-confidence=weak, label not "Content
  changed"), role+name got its own selector-stability tier below data/id/aria
  and above class, matchQuote recall/role+name/length-penalty unit tests were
  added, and the deferred reference-conformance limitations moved into the user
  docs. Delta re-review **PASS-WITH-NITS** (no required changes); S6/S10/S12/S14
  green; S4 showed an environment/host-state timeout that reproduces with the
  pre-delta client (not this delta).
  The modifier controls were then changed from dropdowns to custom **segmented
  controls** inside the same info popover: two `role=radiogroup` rows with four
  `role=radio` segments each (Alt/Ctrl/Meta/Shift), roving tabindex, arrow/Home/
  End/Enter/Space selection with persistence and inline conflict feedback,
  rainbow ring on the checked radio, no native select/dropdown/listbox. S9 was
  rewritten for real CDP clicks on the segments; screenshots show both controls
  with selected segments. Independent delta review **PASS-WITH-NITS** (S12's
  mutation→re-resolve assertion was logged rather than asserted; deterministic
  cache-reuse half remains asserted).
  Annotation settings were redesigned to an info (i) icon opening a borderless
  hovercard-style popover with the two modifier rows and custom dropdowns (no
  native select/OS menu); a verifier BLOCKER found the first implementation's
  body portals sat behind the raised annotation overlay (real clicks hit the
  rail, S9 used programmatic clicks and its screenshots showed no popover) — the
  popover/menu now render inline in the rail/overlay stacking context (popover
  z46, menu z47), document-level Esc closes menu then popover, S9 uses real CDP
  clicks plus elementFromPoint hit-testing, and light/dark close-up screenshots
  visibly show the open popover/menu. Delta re-review **PASS-WITH-NITS**.
  scenario 12 additionally proves captured-scope authority: with a live recorded
  scope and dead CSS, a unique in-scope target resolves via text anchor despite
  an out-of-scope duplicate row (the user's Workspaces vs Running & recent
  case); a distinct duplicate INSIDE the captured scope is terminal **ambiguous**
  and later text-position/XPath fallbacks cannot override it (strong-identity
  seed with real text+digest), while the empty-scope bounded document fallback
  still re-anchors. Independent review first failed on the strong-identity
  in-scope ambiguity path (resolved via text-position), fixed with an explicit
  terminal ambiguity signal; delta re-review **PASS-WITH-NITS**, S12 green.
  scenario 12 additionally proves descendant anchors and confidence: a
  normal-flow non-leaf card captures `anchorTarget:'descendant'` (surface page,
  leaf/ancestor chain, non-candidate signature attr); after moving it outside
  the captured scope so no CSS candidate has exactly one hit, it still resolves
  via the text anchor with its mark on the correct ancestor; a same-text decoy
  stays ambiguous with no mark; weak-identity icon-only records label
  "Unverifiable · weak identity" (EN/ZH) instead of Content changed; the
  scan/cache probe asserts unchanged-DOM repeat resolution adds 0 deltas and a
  host mutation re-resolves once. The round went through independent review:
  first FAIL was test-only (fixed-position fixture classified as floating +
  a data-attribute CSS candidate still matching); fixtures reworked to normal
  flow with a real CSS break, strict D1 restored; delta re-review
  **PASS-WITH-NITS** with S12 green twice and no product-code change.
  scenario 12 additionally proves P1/P2 anchor hardening: duplicate-text rows
  are disambiguated by capture-time context and resolve via text-quote; a
  one-character text edit reports **Content changed** (not Missing); an
  icon-only target replaced in place reports **changed** and draws **no mark**
  on the replacement (weak-identity gate), while a strong-identity text target
  still resolves via text anchor; Copy locator/XPath/JS path are live-tested in
  the popover, detail card and rail row (live vs saved-anchor vs full-XPath
  unavailable toasts); rendered-text whitespace separators and bounded fallback
  scans/cache are unit-tested. The round went through an independent review:
  first verdict FAIL (icon-only false Resolved), fixed at one structural
  identity gate, delta re-review **PASS-WITH-NITS** with gates re-run green.
  scenario 12 additionally proves P0 selector stability: two controls sharing
  `aria-label="New session"` with distinct structural paths resolve **Resolved**
  (high-tier candidate hits 2, lower-tier structural candidate hits 1) instead of
  a false Ambiguous; genuine all-non-unique candidates still report Ambiguous,
  weak XPath ambiguity continues to the text-quote fallback, generated/hashed
  classes are rejected, and identity keys use the verified unique selector.
  scenario 12 additionally proves multi-strategy anchors: a text leaf annotated
  and committed with `xpath`/`textQuote`/`jsPath`; after reparenting + sibling
  insertion breaks the CSS path and absolute XPath, the target stays Resolved
  via `text-quote` with an unchanged captured locator; changing the text yields
  an honest non-Resolved status; Copy XPath / Copy JS path toasts verified.
  scenario 4 (multi-select → one batch popover with a single shared Requirement →
  ONE saved group with N items, group chip `@ UI annotations × N`, group items
  share the group's single ordinal in page marks, child/group delete with undo);
  scenario 1/8 (launcher hides in place while active with no docked/flight copy,
  returns with a fade/scale at the remembered rect after a full exit,
  reduced-motion instant); scenario 9 (default managed list, settings-line icon,
  equal-width Add annotation / Cancel Annotation footer, exit confirmation with
  Cancel vs Clear & exit, records cleared + v3 document flushed empty on exit,
  re-entry empty); scenario 13 **PASS 7 / SKIP 1
  (`13f`) / 0** (single native chip, hover preview
  tooltip with requirement/locator/position/Session/workspace/status, grouped
  chip hover summary, chip click preview, chip × removal (only that chip
  removed, one undo step, other chips preserved), Backspace removal, one grouped
  batch chip, transcript 0, never sent),
  scenario 14 **PASS 7 / 0 / 0** (reload restores records/marks, removed target
  is honestly missing), scenario 15 **PASS 7 / 0 / 0** (rainbow focus ring on
  popover/collection/editor/settings inputs, no solid outline, no layout shift,
  ring geometry hugs the control's border box on all four edges (the wrapped
  control is block-level, so no baseline descender gap), reduced-motion static,
  mode-exit restore). A clean `--from 6 --no-shots`
  sequence on the final build = **PASS 17 / SKIP 1 (`13f`) / FAIL 0**, exit 0,
  164 s.
- One full `--no-shots` attempt observed smoke 6/6 + S1–S7 PASS, then stalled at
  the documented late-run S8 renderer timeout (no product assertion failed); the
  run was stopped there. S8/S9 were separately recovered in a same-build
  `--from 8` run in round 1. There is no single all-green full-suite process for
  this build.
- `13f` (plain-text chip fallback) is an explicit SKIP: the live GUI always
  installs the chip services, so the fallback cannot be forced without stubbing
  the shell. The fallback text/toast and both serializers are unit-tested.

**Independent verification (read-only, two rounds).** Round 1 verified the
Project-page removal + sidebar polish + annotation Phase 1 (169/169 tests at the
time) and found: stale "current" gate counts in this file (fixed in the same
pass), a CHANGELOG "page-lifetime collection" claim (fixed), stale architecture
wording (fixed), a stale cross-branch SKIP (fixed by harness capability
detection), sidebar-harness flake/cascade (fixed with stable hover helpers and a
`finally` cleanup), a dead project-page event constant (removed), and one real
product bug — **F-2**: annotation records never resolved the Session's
`cwd`/`workspaceLabel` because the overlay is not a slot. F-2 was fixed by
mirroring the Session's `useSessions` state through the Session-scope seat and
re-verified live (records now carry the absolute cwd + workspace basename;
scenario 12 shows the real workspace label). Round 2 verified the final merged
annotation Phase 2-A/2-B and the sidebar grid/B4/B6 work; no BLOCKER was found. Its one MAJOR finding was a harness defect in
the cross-branch F4 check (it probed native sidebar rows instead of the plugin
card rows that open the hover card, so `10b`/scenario 11 would report a false
red); that was fixed in the harness (capability-based detector + card-row
targeting, pointer reset before the inline check) and re-verified on the committed
harness (scenario 10 = 8/0/0 with `10b` PASS, scenario 11 = 7/0/0, `--from 6` =
17/1/0). Independent probes also re-measured the F-2 identity, marks, detail
card, delete/undo, rail batch state/persistence, composer chips, the `@` source
self-identification, the B4 glow geometry in both themes, the column grid, the
B6 figure totals, and the project-page removal.

**Verified behaviour in this round** (details in
[ui-annotation.md](ui-annotation.md) and
[dynamic-workspaces.md](dynamic-workspaces.md)):

- Annotation: floating-surface picking (whole native hover card + drill into its
  inner rows, identical outline style, paint layer `z-index:150` with exact
  restore), a launcher that docks inside the right rail header while the mode is
  active and returns to its remembered floating position on exit (drag and
  position persistence idle-only; narrow overlay layout keeps it inside the
  rail), 60 ms pointer-stationary hover recompute, ElementRef v2 capture
  (verified unique selector, ancestors, surface/ephemeral, Session/Workspace
  identity via the seat bridge, query-free route, bounds/viewport; no
  outerHTML/input values), **leaf-first** hover/click precision on ordinary
  pages and inside floating surfaces (titles, subtitles, timestamps, token
  counters, inline SVG icons/paths individually previewable/selectable; the
  full hovered ancestor chain is navigable via Parent/Child; whole surface stays
  reachable via background/padding or Parent), transient hover-triggered
  surfaces are pinned open while their annotation popover is active (capture-
  phase suppression of pointer-leave close events scoped to the surface and its
  ancestors; released on popover close/selection clear/mode exit, with the
  updated transient hint), and the locator summary stays the captured string
  when a surface genuinely disappears (only the live status changes honestly), v2 record persistence (localStorage, cap 100, reload
  restore + status re-resolution; v3 document with singles + batch **groups**
  migrated tolerantly from v2), a batch popover for multi-selections with ONE
  shared requirement that commits one group (no per-item requirements), page
  marks with numbered requirement badges,
  hover detail card with edit/relocate/copy-locator/delete, requirement popover
  commit/update/delete + 5 s undo + auto-dismiss, right-rail batch view
  (include checkboxes, other-Session exclusion, inline editing, reorder,
  preview, delete-selected/clear with undo, one grouped batch chip), native
  composer reference chips (single + grouped, send-time serialization, missing
  record blocks the send, plain-text fallback, and a hover preview tooltip on
  annotation chips showing requirement/locator/position/Session/workspace/status
  or the group summary), stable `data-chat-node-key`/`data-chat-anchor-key`/
  `data-chat-group-key`/`data-chat-turn`/`data-chat-flow-key` anchors for
  chat-flow picks (positional chat paths no longer go stale on streaming
  re-renders; genuinely replaced nodes still report missing/ambiguous/changed),
  a chip × removal affordance (hover/focus a single or grouped annotation chip
  shows our own ×, which removes exactly that reference chip through the
  composer editor in one undo step, preserving other chips/text and never
  sending), and the rainbow input focus ring.
- Dynamic Workspaces: fixed trailing grid with child rows lacking New session,
  right-aligned times, the internal rainbow atmosphere on the current card row,
  its owning Workspace row and the native Session row, the native-aligned 320 px
  hover card with
  native Session statistics / Token usage / Context usage figures (projection
  seam, one cold read, hidden-when-absent), the identity-glyph swap, title-case
  bucket labels, borderless native tooltip chrome, and fold persistence applied
  at first paint.
- Floating-card chrome: every plugin tooltip-like surface (Dynamic Workspaces
  row card, Artifact Quick Look, prompt-history preview/search cards, annotation
  requirement popover/detail card/expanded note editor) uses the native session
  hover-card surface — `background: var(--dsw-hovercard-bg, #2C2C2E)` (a fixed
  `rgb(44, 44, 46)` in **both** themes, unlike the theme-flipping
  `--dsw-alias-tooltip-bg`), no border, 16 px radius, the shell's own
  `--dsw-shadow-lv3` elevation, no background-image/backdrop-filter, and the
  native near-white text palette. The sidebar harness asserts all four sidebar
  surfaces against the live native card in emulated light **and** dark, and
  annotation scenario 12 does the same for the annotation cards; both also check
  the computed shadow string equals the native elevation exactly.
- Project-page removal: no project DOM/marker/CSS, no client route usage;
  clicking a Workspace title performs the native expand/collapse again; the
  composer, right sidebar, and prompt-history rail are no longer covered.

**Evidence gaps (honest list).** `13f` fallback live row (unit-tested only); no
single all-green full annotation run in one process (documented late-run stalls);
the header's all-complete brand-glyph branch was not observed live because the
card always had a running row (pinned by the source-level unit test and the
harness's pulse-state check); the Host-side project route cannot be observed
removed until the installed main checkout is reloaded (the client no longer
calls it; route registration was verified by a code probe); a full end-to-end
Chinese-locale pass was not run (unit tests cover the ZH copy); sending a chip is
never performed by the harness by contract, so missing-chip send blocking and
batch removed-member serialization are unit-tested only.

## UI element annotation acceptance

> **Historical pre-merge annotation evidence (superseded).** This section records
> the original annotation acceptance on `fix/ui-annotation-review-fixes`
> (publication build `50a1bb3` / branch commit `fd8ccc9`) **before** the first
> merge into `feat/dynamic-workspaces`. It is kept as history. **Current
> merged-build evidence is in
> [0.3.0 polish round acceptance](#030-polish-round-acceptance-2026-11-13-merged-build)
> above**; the annotation model has since grown to the v2 record/persistence,
> floating-surface, marks/detail and composer-chip implementation with the
> 110-key seam generation.

Date: 2026-11-12 (round-2 fix build, `fix/ui-annotation-review-fixes`). The
feature is browser-only ([ui-annotation.md](ui-annotation.md)), so its acceptance
run uses the real DSH Web GUI instead of a Host test:
`test/browser/annotation.e2e.mjs` (Node 22 or newer; this run used Node 24.22.2;
dependency-free) launches headless Google Chrome (157.0.8103.78) with a throwaway
profile, opens the GUI served by the launchd service `com.rexxin.dsh-web`, and
injects this checkout's `src/client.js` through the page's module loader before
the shell loads. The build under test is commit `aaab678` (`src/client.js` md5
`37388d3f9d1de0584b62bc111c6b6043`, historical round-2 seam generation of 32
keys; the current audit-fix harness generation is 35 keys). The
installed checkout, the user profile, the launchd service, and the GUI's existing
Sessions are untouched. The harness requires a blank Session by checking, at
once, a `[data-conversation-session]` root, the composer region with a Lexical
editor, the Chat view, zero transcript messages, zero turns, an empty draft, and
no draft attachments; otherwise it creates a genuinely fresh blank Session
through the native "New session in <workspace>" hover action and aborts
explicitly if that is impossible. The non-blank-auto-restore branch is
implemented but was not triggered in this environment, so no live evidence
claims it. The harness tracks and prints every Session it touches, drives every
interaction with real CDP mouse and keyboard input at 1728 x 900, and reports
page errors plus network failures under its exact predicate: same-origin http(s)
only, where a `Document`/`Fetch`/`XHR` response has status ≥ 400 or an `/api/`
or `/plugins` path fails to load; third-party origins, favicon,
`chrome-extension:`/`data:`/`blob:` URLs, and same-origin static requests outside
the DSH API/plugin routes are ignored as noise, and a failed `Network.enable` is
reported and fails the run. Exit codes: 0 only when every check passes; 1 for a
scenario/page/network/gate/harness failure or a missing result row; 2 only for
usage/argument errors.

This is the final acceptance record for the planned 0.3.0 release after two review
fix rounds: round 1 resolved F1–F18, round 2 resolved R1–R4 and the harness
findings N1–N6/H10.

Final publication build: commit `50a1bb3`, `src/client.js` md5 `10dd3b72…` (branch
commit `fd8ccc9`). The acceptance run recorded above was taken on `37388d3f…`;
the only delta is the review-requested defensive cleanup in `deactivate()`'s
already-off early return (clears the resolved-node cache/observer; that branch is
not exercised by any scenario). On that pre-merge build `npm test` was 125/125
and `npm run check` green; the merged tree is 181/181 / 18 modules / 10 test
files / 78-file pack. The full harness was not re-run after the merge, and the
merged build `572b8fa1…` itself was not re-run; after the audit fixes, only
`--smoke` was run on the post-audit-fix build `1c61a230…` (6/6, 35-key seam, 0
page errors/real network failures), so no **full-E2E** claim is made for either
build.

Run:

```bash
node test/browser/annotation.e2e.mjs --no-shots              # full run
node test/browser/annotation.e2e.mjs --from 6 --no-shots     # same-build completion run
node test/browser/annotation.e2e.mjs --scenario 2 --no-shots # targeted self-contained rerun
node test/browser/annotation.e2e.mjs --scenario 6 --no-shots # targeted self-contained rerun
node test/browser/annotation.e2e.mjs --shots-only --assets   # screenshots
```

Automated gates on this build:

- Pre-merge annotation build gates: `npm test` **125 tests, 125 passed, 0
  failed, 0 skipped** (73 existing + 52 annotation model tests, including the
  round-2 resolver/sanitizer regressions; red on round-1 `e0fdbc23…`, green on
  this build); `node --check src/client.js` passed; `npm run check` passed
  (`14 modules, 8 test files`); `npm run pack:check` **63 files** including the
  five annotation captures.
- Merged tree gates (current): `npm test` **181/181**, `npm run check` passed
  (`18 modules, 10 test files`), `npm run pack:check` **78 files**. Post-audit-fix
  evidence is the 6/6 `--smoke` run above on `1c61a230…` (35-key seam); the merged
  build `572b8fa1…` itself was not re-run (32-key seam), the full E2E was not
  re-run on either build, and there is no single all-green full run.

Acceptance result: **no single fully-green full-suite run exists for this build.**
The complete per-scenario PASS evidence on md5 `37388d3f…` comes from three
same-build sources — the full run, the completion run, and two targeted
self-contained reruns — and is listed in the table below. Page errors were 0,
real network failures were 0, and the network domain was enabled with 0 ignored
network noise in every run below; smoke passed 6/6 in every run (historical round-2 32-key seam; current
harness generation is 35 keys).

- **Full run** (`--no-shots`, 524.5 s, exit 1, log
  `/tmp/psa-final-round2.log`): S1, S3, S4, S5, and S7 PASS. S2 failed before its
  pass-through assertion completed because the scenario did not first ensure a
  stable activation (harness state precision; fixed by making S2 self-contained,
  then PASSed targeted). S6 failed with `changed` instead of `missing` while
  inheriting the previous scenarios' collection and virtualized-sidebar state
  (harness state precision; fixed by the self-contained reset, then PASSed
  targeted). S8 hit a CDP `Input.dispatchMouseEvent` timeout and S9 cascaded.
- **Completion run** (`--from 6 --no-shots`, 61.0 s, exit 0, log
  `/tmp/psa-round2-from6.log`): S6, S7, S8, and S9 PASS.
- **Targeted self-contained reruns** (exit 0 each, `PASS 7 / FAIL 0`):
  `--scenario 2` (11.4 s, log `/tmp/psa-target2.log`) PASS after mode-off →
  native Plugins view → stable activation (same 2×500 ms predicate as S1) → Alt
  pass-through/contextmenu oracle; `--scenario 6` (49.4 s, log
  `/tmp/psa-target6.log`) PASS after mode-off → conversation → stable activation
  → cleared collection → sidebar list state normalized (scroll reset when the list
  is scrollable) → current-scope target recorded → native collapse → strict
  `missing` + stale marker, then F8/F9/mixed scope. The same-identity in-place
  replacement is recorded as evidence only; the true-removal case is not relaxed. These targeted PASS runs are the same-build evidence that
  the full-run S2/S6 failures were harness state precision rather than product
  behavior.

Same-build per-scenario evidence: S1, S3, S4, S5, and S7 are green in the full
run; S2 and S6 are green in the self-contained targeted reruns; S6–S9 also pass in
the completion run. Every scenario has PASS evidence on this build, but there is
still no single fully-green full-suite run, and this record does not claim one.
H1 gate proofs were re-confirmed on the final harness: the feature-absent client
exited 1 with `FAIL gate-feature` (`PASS 4 / FAIL 12`), and `--scenario 10` exited
2 as an argument error.

| # | Scenario | Evidence on this build |
|---|---|---|
| 1 | Activate via a real launcher click; layout shrinks and the rail appears; native New Session is blocked | PASS (full run) — activation polls `html[data-psa-active]` + `[data-psa-rail]`, re-verifies twice 500 ms apart, and retries activation once before failing with an environment snapshot; markers set; frame `padding-right` equals the computed rail width (200 px at 1728 x 900); rail right-anchored in the freed strip; inline grid untouched; the blocked real click reached 0 native handler hits with `preventDefault` applied and the Session/view stayed unchanged |
| 2 | Alt pass-through restores native semantics; no-session state; native context menu is not intercepted | PASS (targeted `--scenario 2`; the full run failed before the assertion completed — see above) — the self-contained run goes mode-off → native Plugins view → stable activation → native New Session action via Alt, `html[data-psa-passthrough]` only while held, hover outline paused, `[data-psa-no-session]` while no Session is mounted, and a contextmenu oracle with a blocked right-click that never reached the bubble listener and exactly one Alt right-click with `defaultPrevented === false` |
| 3 | Wheel scrolling and shortcuts are untouched; marquee; Esc ladder | PASS (full run) — a real wheel changed the native scroll position with 0 `preventDefault`; Meta+K, Control+L, and plain letters arrived unprevented; Shift+drag drew a box and selected a candidate; the F6 Esc chain was: first Esc ended note editing and kept the popover and typed note, second Esc cleared the selection, third Esc left the mode |
| 4 | Shift+click multi-select; collection add/update/note/remove | PASS (full run) — 3 Shift+clicks produced 3 multi outlines and the rail count; add-all de-duplicated and updated on re-add (Add → Update); inline note edit and remove worked |
| 5 | Batch insert order, existing draft preserved, never sent, composer focused | PASS (full run) — one ordered numbered block per collection entry with the block count equal to the entry count, non-empty names, each note inside its own block (or the empty-note placeholder), the pre-existing draft kept verbatim before the header, no message sent, composer focused |
| 6 | Removed targets are stale; genuinely mixed cross-session scope; no page mutation | PASS (targeted `--scenario 6` and the completion run; the full run failed with inherited state — see above) — the self-contained rerun clears the collection, normalizes the sidebar list state (scroll reset when possible), and records the target as a current-scope entry before the native collapse, then strictly reads `data-psa-status="missing"` and inserts the explicit `Status: target no longer resolves` line; a row rebuilt by sidebar virtualization accepts `missing`, `ambiguous`, `changed`, or `resolved`. A second genuinely blank Session created through the native hover action makes the mixed state real: every pre-switch entry becomes `data-psa-entry-scope="other"` with `data-psa-status="other"`, batch insert is disabled with the cross-session notice, and the inserted block contains exactly one numbered current-session block plus a skip line whose extracted count equals the other-scope entry count. A leak check over every other-scope entry's name, note, and locator text (tokens of 6+ characters) proves none reached the composer; re-locate is invoked on the other-scope row's own control, shows the exact localized refusal, and does not scroll |
| 7 | Exit cleans up completely and restores a pre-existing inline layout | PASS (full run and completion run) — a sentinel `padding-right: 13px` set before activation is restored exactly; the MutationObserver timeline contains a record with `data-psa-active === null` while `data-psa-frame` is still present and the sentinel padding restored (the reverse transition); the marker then had to disappear within up to 15 s of polling (raised from 5 s only to tolerate a busy main thread; disappearance is still mandatory and was observed). `--psa-rail-width` removed, inline grid byte-identical, 0 overlay nodes, one inactive launcher, native clicks worked again |
| 8 | Launcher drag/resize/scroll/reload geometry; interrupted gesture cleanup | PASS (completion run; the full run hit a late-run CDP input timeout) — an interrupted drag ended by Esc neither toggled the mode nor persisted the position and left no `data-psa-dragging`/box node; real drags clamped with the 8 px margin; after the 1000 x 700 override the launcher was fully inside the viewport; a missing scrollable region fails the scenario; wheel scrolling did not move the launcher; after reload the mode started off and the remembered position came back |
| 9 | Collection view keeps the rail/frame geometry; exit restores the baseline | PASS (completion run; the full run cascaded from S8) — opening and closing the collection left frame padding and canvas width unchanged and kept the rail in the right strip without a wide drawer; exit restored the pre-mode canvas width and inline grid |

Sessions created/reused in the final round-2 runs, for cleanup:
`session-5eec2763-0a91-460e-b559-08a8c3a98d13` (full run),
`session-8e460d06-507a-4c6d-95c6-63f20882c6e4` (completion run, targeted S2/S6,
and the screenshots run), and `session-1e273273-4316-46f5-84c8-199bfc0812a2`
(completion run S7, targeted S6 session B).

Screenshots (round-2 build, 1728 x 900 originals, dark theme; from one logged
`node test/browser/annotation.e2e.mjs --shots-only --assets` run,
log `/tmp/psa-shots-round2.log`, 42.0 s, exit 0, with every capture assertion
passing; blank-session predicate, privacy shield, right-anchored rail, launcher
clear of the footer, and the selection popover fully inside the viewport; the
byte sizes are unchanged by the targeted runs and are embedded in
[ui-annotation.md](ui-annotation.md)):

- [annotation-idle.png](assets/annotation-idle.png) — 125075 B — mode off, the
  default bottom-right launcher, no annotation surface.
- [annotation-mode.png](assets/annotation-mode.png) — 144859 B — mode on: the
  page shrunk by the 200 px rail in the freed right strip.
- [annotation-selection.png](assets/annotation-selection.png) — 163687 B — a
  highlighted native control with its popover (element, locator, Target ·
  Resolved, note, Quick reference / Add to collection) fully inside the viewport.
- [annotation-collection.png](assets/annotation-collection.png) — 161038 B — the
  collection view in the rail: three ordered rows with notes and the Clear /
  Insert all footer unobstructed.
- [annotation-inserted.png](assets/annotation-inserted.png) — 200244 B — the
  ordered structured batch request inserted into the composer, not sent.

Independent targeted re-review (round 3, fresh read-only subagent, 2026-11-12):
**merge-ready: yes** — no BLOCKER/MAJOR/MINOR findings. Verified R1 resolver
semantics + DOM-revision cache (ordinary `p`/`li`/anonymous controls resolve;
stable ambiguity terminal; no stale-first-hit), R2 real `session-<uuid>` session
attribute preserved, R3 sanitizer shapes, S2/S6 self-contained harness fixes
(true-removal still strictly `missing`), the three-source per-scenario evidence
chain, and the documentation corrections. Remaining items were publication NITs
only (this verdict line and the harness README stale sentence); no code/test
changes required.

Known evidence limits:

- **No single green full-suite run.** The complete per-scenario evidence above
  comes from three same-build sources; the full-run S2/S6 failures were harness
  state precision (targeted self-contained reruns pass), while the S8 CDP input
  timeout and its S9 cascade happened before their product assertions completed.
  The S8 cause is not established: it is not attributed to the product nor
  proven to be purely environmental.
- Native context-menu visuals are not observable in headless Chrome; the
  assertion is the event-level `preventDefault`/bubble oracle.
- The blank-session predicate is DOM-based (session root, composer, Lexical
  editor, Chat view, message/turn counts, draft, attachments). The branch that
  detects a non-blank auto-restored Session and creates a fresh one is implemented
  but was not triggered in this environment.
- This DSH build keeps one blank draft Session at a time, so a blank → blank
  Session switch cannot be reached from the UI; scenario 6 creates a second
  genuinely blank Session through the native hover action and asserts the mixed
  current/other-session scope.
- A blank Session's conversation is empty and non-scrollable, so the wheel
  assertion uses the nearest native scrollable region (the sidebar list) and
  states that in the evidence; scenario 8 fails if no scrollable region exists.
- Headless Chrome can swallow the native `resize` event for
  `Emulation.setDeviceMetricsOverride`; the harness retries with a second real
  viewport change and only then falls back to one synthetic resize event.
- Long full-suite runs can hit CDP `Runtime.evaluate` /
  `Input.dispatchMouseEvent` timeouts and live-GUI rebuild effects before a
  scenario's product assertion completes; the harness retries gestures only when
  their postcondition proves the state did not change, and a rebuilt sidebar row
  accepts `missing | ambiguous | changed | resolved` (the true-removal case still
  requires `missing`). Scenario 7 polls the reverse-transition marker for up to
  15 s (was 5 s), but its disappearance stays mandatory.
- Zero-area picker behavior is not directly synthesizable in the live GUI and is
  covered by the pure-model tests.
- The run is single-device and single-language: one deployment at 1728 x 900 in
  the active UI language; the Chinese copy is covered by unit tests rather than
  end-to-end.
- Benign DSH-internal telemetry WebSocket 403s (`ws://127.0.0.1:9230/ingest`)
  are printed with detail but are not page errors or real network failures under
  the predicate, so they do not gate the run.
- The product boundaries the run does not move are documented in
  [ui-annotation.md](ui-annotation.md#host-boundaries): Shadow DOM internals are
  not inspectable (only the host is selectable), cross-origin iframe contents are
  not selectable, native input/textarea/contenteditable values are never read,
  and canvas-rendered content has no DOM target.

## Manual UI checks (historical record; the removed 0.3.0 Project detail page sections below are kept as history)

These were exercised in the Web GUI during development:

- Artifacts panel: list, Open / Download / Copy content / Copy link actions,
  missing files hidden.
- Session artifacts after the provided-attachment extension: the list route
  returned 29 rows (2 generated + 27 provided, folded from 28 pasted image
  blocks minus one duplicate attachment id), and all 27 provided-image
  thumbnails loaded (`naturalWidth > 0`, rendered 40–42 px) as 40 px rounded
  lazy thumbnails; the sample provided row was
  `image/webp 1248x624 14406 B prompt 25` with sha256
  `3669…bafa`. The source filter was later re-checked as the header dropdown:
  with 31 visible rows the trigger read "All 31" with the `filter-line` funnel
  icon and sat immediately left of Refresh (trigger rect x≈2434–2520, width 86;
  Refresh x≈2522, width 24); the menu opened right-aligned to the trigger
  (right 2520 = trigger right), 206×104, listing All 31 / Generated 2 /
  Provided 29 with All checked and focused. Choosing Provided showed 29 rows,
  the trigger read "Provided 29", the header count read "29 of 31 artifacts",
  and the menu closed; an outside press closed it, Escape closed it and returned
  focus to the trigger, and choosing All restored 31 rows and "31 artifacts". No
  segmented-control elements remain (`.dsa-filters` / `.dsa-filter` count 0), and
  filtering triggered 0 list-route fetches; the empty-filtered state was
  verified against a mocked payload. The attachment route answered GET and HEAD with
  `200 image/webp`, `content-length: 14406`, `x-content-type-options: nosniff`
  and `content-security-policy: sandbox; default-src 'none'`; the response
  sha256 matched the attachment id. A tampered width answered `404`, missing
  metadata answered `400`. Provided Open/Download/Copy content/Copy link
  worked, generated rows kept their raw route, native preview, and Quick Look
  unchanged, and there were 0 console errors.
- Copy content was verified live: on the generated `verification.md` row the
  button showed its check acknowledgement and pasting into the composer yielded
  text beginning `# Verification` (the exact file content). On a provided
  screenshot row the image action read Copy image and showed its check
  acknowledgement on the plain-HTTP LAN; a real keyboard paste into a temporary
  contenteditable produced `<img src="…/api/session-artifacts.attachment?…">`
  (the rich target received the picture), and a clipboard-types probe showed
  only `text/html` — no bitmap, as expected on an insecure origin. The
  secure-context `image/png` clipboard path was not exercised in this HTTP
  deployment. The refreshed panel capture shows the row's four actions
  ([assets/artifacts-panel.png](assets/artifacts-panel.png)).
- Hover Quick Look on Artifacts rows and native Workspace files: Markdown,
  highlighted code, images, PDF/HTML, resize persistence, outside-click
  dismissal, animated switching.
- Quick Look content fix and provided-row preview: hovering the generated
  `verification.md` row opened a card of **570 x 360** px with a **232 px** body,
  and the rendered `.dsa-md` Markdown showed its "Verification / This file
  records the checks…" text immediately (no manual resize needed). Hovering a
  provided image row (`sha256:23ce…`, `image/webp` 1714 x 490, 30 KB) opened the
  same 570 x 360 card; the image element reported `naturalWidth = 1714` and was
  rendered 568 x 162 inside the 232 px body. Both cards showed working
  Open/Download controls (provided rows through the attachment route), and there
  were 0 console errors.
- Settings page: shortcut modifier selection and persistence.
- Workspace preset menu and routing.
- Interrupted-session badge, Continue action, and composer play control.
- Dynamic Workspaces on the running 0.2.2-rc.1 Host: group reordering worked
  live in both directions using a throwaway Session; the running & recent card
  (including the retention linger, with nested subagent rows visible in the
  capture), rail hide/restore, and coexistence with the native Workspaces search
  all passed. The later card refinements were re-checked live: the header toggle
  and **View all** control both measure 30 px, the subagent connector trunk is
  masked below the last child's tick, and the child indent is the deeper
  `26px + 14px`.
- Draft attachment memory was verified live on the same Host: the shell round
  trip was first reproduced as text restored / image lost, then the feature
  restored the attached image after switching away and back. Removing the
  attachment explicitly after a restore was not resurrected on the next round
  trip, and the draft stayed clean around the test.
- Prompt history timestamps were verified live on the running Host: after the
  Host plugin was reloaded (profile recomposition, with the profile patch
  restored afterwards) the route served `{ seq, text, at }` and the preview of
  that iteration showed prompt times; the timestamp fold is also covered by the
  node tests.
- The prompt-history rail was verified live after its third refinement round:
  the prompt ticks sit on the native turn-rail column, resting at 60 % width
  with the 90 % hover growth and the brand hairline on keyboard focus; the
  horizontal divider is now 32 x 1 px and its right edge (2541) equals the rail
  right edge. The 20 x 22 px magnifier now overhangs the rail edge by 4 px so
  its SVG centre (x = 2535 at rail right 2541; 1383 at 1389) equals
  `markRight - 6`, the centre of the visible resting tick, and its measured rect
  is identical before and after opening the search
  (`{x: 2521, y: 836, w: 20, h: 22}`), so the button is pinned. In the roomy
  case the search card hangs directly below it with right edge 2541; in the
  left-fallback case the card's right edge is 2513 = `toggle.x - 8` and its
  bottom 1140 stays above `composerTop` 1171. A long session capped the rail at
  313 px while 65 marks scrolled inside it behind hidden scrollbars and the fade
  masks; no scrollbar is visible anywhere in the rail. The hover card showed the
  full prompt text and its time; clicking a mark copied the exact prompt into the
  Lexical draft **silently** — the confirmation chip is gone
  (`[data-psp-copied]` count 0, no animation) while the draft text matched; 0
  buttons exist inside the search card, and a blank pointer
  press outside (or Escape) closed it and cleared the filter with all 65 marks
  restored; `Showing N of M` filtered correctly. No console errors were
  reported and `node --check src/client.js` plus `node --test test/*.test.js`
  stayed green.
- The Dynamic Workspaces card was verified live after its final indicator round:
  rows are single-line (glyph, title, time) with disclosure chevrons at the far
  right. The header indicator has its two states: with two running Sessions it is
  the blue pulsing dot (computed colour `rgb(122, 170, 255)`, business-primary
  8 px dot with the expanding 2 s ring), and with nothing running it is the white
  `sparkling-line` SVG. Both are horizontally centred at x = 43 on the same glyph
  column as the top-level rows' glyphs (also x = 43), with the header title at
  x = 58 matching the row titles' x = 58. The header chevron centre x = 248
  equals every row arrow centre x = 248 (rows without children reserve the same
  column), and the row-body highlight carries 8 px horizontal inner padding.
  The glyph states checked out — the shell loading indicator while running, the
  green done dot on finished unread rows, and, after opening a Session, a white
  `deepseek-fill` SVG on main rows (computed colour `rgb(249, 250, 251)`) and a
  white `robot-2-line` SVG on subagent rows, with unread rows still showing the
  green dot and a new run re-enabling it. The card body's
  `scrollbarWidth` is 0 while it still wheel-scrolls, and the row elements carry
  0 native `title` attributes. The hover card's title is the Workspace name with
  the full wrapped workspace path, followed by Status with time, absolute Last
  active (`2026-11-11 04:44` style), and the running subagent count when
  present. Header toggle, **View all**, and header chevron all measure 30 px with
  the same 12 px corner radius; bucket chevrons sit at the far right after the
  count; and the subagent connector trunk is centered under the parent's status
  indicator (dot center x = 35, trunk x = 35) with short branches and no
  dangling end.
- The standalone Project page was verified live: clicking a sidebar Workspace
  title renders the page in the content area **right of the left sidebar**. The
  measured rectangle was `left 280 / top 0 / width 2268 / height 1321` with the
  expanded sidebar (sidebar right edge 280), `left 56 / width 2492` in the
  rail-collapsed state, `left 0 / width 2548` when the sidebar was hidden, and
  `left 280 / width 1320 / height 900` after resizing the window to 1600×900 —
  always ending at the viewport right edge. Hit tests confirmed the split: a
  sidebar Workspace row resolved to sidebar content (not the page), while the
  composer and the far-right rail resolved inside `[data-psv-page]`. The page's
  title, Active badge, and the four tabs render; clicking another Workspace
  (`nanobot-suite`) switched the page in place with one page root and no stale
  content, the sidebar chevron still folded/expanded, and the current Session
  stayed `session-c5864acd…` with a composer draft marker surviving open/close,
  the selected view still Chat, and both sidebar states preserved. Esc and the
  back control both closed the page and restored the conversation. Opening
  `dsh-intelligenct-ui` (30 Sessions) showed the loading state and then its data;
  two rapid open events kept one instance/root with the final Workspace. The
  conversation header switcher showed **Chat / Trajectory / Statistics** only (no
  Project tab), and a Lead-side independent check confirmed the same (page
  left == sidebar right, right == viewport, sidebar row hit the sidebar,
  composer hit the page, in-place switch, Esc restore). A Sessions-list click
  closed the page and then opened that Session; Runs showed **63** runs with
  status filters and expandable turn jobs; Settings showed a preset choice
  (Cordis), the read-only windows, and the path actions; Copy project path
  produced the toast and a matching paste; refresh emitted exactly one
  `workspaceId=…&refresh=1` request; New Session and Open Workspace closed the
  page and then navigated. HMR showed exactly one document capture handler and
  one `power-suite:open-project` listener before and after a reload (one
  page/root per click), with 0 console exceptions/plugin errors and 0 failed
  responses (one unrelated native `/api/changes.summary` 404 was noted). Route
  probes from the earlier iteration still hold: `sessionId` 200, `workspaceId`
  200 (cached response 78 ms), empty `workspaceId` + `sessionId` 200, unknown
  Workspace 404, no parameters 400, `cache-control: no-store` on every response.
- The Project page's prompt-history-rail handling and single refresh were
  verified live: while the page was open the document root carried
  `data-power-suite-project-page="true"`, the rail and its divider/eyebrow
  surfaces had `display: none`, were not hit-testable, and far-right hit tests
  resolved inside `[data-psv-page]`; after Esc/back the marker was removed and
  the rail's display, rectangle, divider, and magnifier returned, with hover
  preview/search/copy working again. The document contained exactly one
  `button[aria-label="Refresh"]` (the page top bar) and a single top-bar click
  issued exactly one `workspaceId=…&refresh=1` request with the busy spin; the
  tab-bar and project-header card refresh buttons were gone (the header keeps
  Open Workspace, New Session, and the More menu with Refresh/Copy project
  path). HMR set and removed the attribute correctly (rail hidden while open,
  restored after reload), and there were 0 console errors.
- The activity-card row actions were verified live: the fixed trailing cluster
  `[Continue (interrupted only)] [New session] [chevron]` sits in 22 px
  reserved slots before the chevron; the title/time rectangle was unchanged
  before and after hover (`left 58, top 275, width 99`), the row spanned
  `21–260` and the cluster `188–234` with its buttons at `188–210` / `212–234`,
  and the hover card anchored at `left 274` — outside the row's right edge 260
  and never intersecting the row or its buttons (it is non-interactive, with
  Esc/scroll/resize dismissal). The session itself stayed untouched when the
  actions were used. **New session** created blank Sessions in the row's own cwd
  as proven from persisted Host logs: the main row's cwd
  `/Users/rexxin/Development/DSH` → a blank Session with the same cwd, and a
  child row's `/Users/rexxin/Development/dsh-power-suite` → a blank Session with
  that cwd; the source Sessions were never opened. No genuinely interrupted
  Session existed in the live GUI, so the amber badge (`14 × 14` before the title
  at `58–72`) and the **Continue** CTA (`188–210`, visible and enabled) were
  verified with a controlled interrupt state; Continue was not clicked in order
  to avoid sending a real continuation. No live child-interrupted case exists.
  HMR showed a single panel/row/button set and there were 0 console errors.
- Host-shared read acknowledgements were verified live: `GET
  /api/power-suite.read-acks` answered `200` with `cache-control: no-store` and
  the live-synced baselines; `POST` merged and kept per-id maxima and answered
  `200`, with `415` for a non-JSON content type, `400` for a malformed body, and
  `413` for an oversized one. Simulating a new device (wiped `localStorage` plus a
  reload) restored every Host-shared acknowledgement as white icons with no
  clicks; a controlled stale baseline showed green while the route was blocked
  and cleared after the Host merge; both directions (read → unread and
  unread → read) worked across contexts, and HMR kept one poll per ~32 s window
  with 0 console errors.
- The event-sourced activity ledger was verified live: the route answered
  `200`/`no-store` with 401 Sessions. After the ledger took over, the three
  probed Sessions reported authoritative committed-event times —
  `0c14a9e7…` = `1794263011213` (2026-11-09 17:23:31; the earlier mtime build
  reported the later `1794455566124`), `78f7a4a7…` = `1794418427299` (12:33:47;
  before `1794455517024`), and `442a0000…` = `1794462064496` at probe time, later
  advancing with real resumed events to `1794463519838`/`1794463539588`. The
  card showed the old DSH “熄灭当前 mac 的屏幕…” row gone, `78f7a4a7…` correctly
  absent (12:33 is far outside the 2 h window, so its misleading dot cannot
  appear), `442a0000…` present at minutes-level, the other rows unchanged, and
  one panel. Opening `442a0000…` raised its Host read baseline from
  `1794462069446` to `1794463523500`. Event-driven proof: a live Session
  advanced `1794463340198` → `1794463361062` without a restart and persisted to
  the ledger file (later `1794463369210`), while the old `0c14`/`78f7` values
  stayed unchanged as the file mtime advanced. Chunked pushes were forced with
  450 pending entries plus a forced first POST `413`; 18 entries were added while
  the queue drained, so the 468 total went out as batches of 200/200/68 entries
  (6811/6811/2710 bytes), dropping only the rejected first batch, syncing the
  later/new acks with no retry storm; a hung activity request aborted at 8 s and
  was retried on focus. HMR produced exactly one acks GET and one activity GET
  per 32 s window after reload (an HMR mount added one of each), with 0
  exceptions/plugin console errors.
- Ledger durability, seed backoff, cold load and multi-writer semantics were
  verified after a recompose: the first cold GET returned `200` in ~**12 ms**
  with a **407-entry** ledger (not `{}`), and the route and file counts agreed
  (file mode `600`, version `1`). Across the probe series the Session count grew
  401 → 404 → 406 → 407 as Sessions accumulated — distinct probe points, not a
  contradiction. A checkpoint `80769cd0…` = `1794470830718` survived
  dispose/recompose as route = file = **`1794470838578`** (≥ checkpoint, so the
  ≤750 ms debounce window was not lost); a later probe read file
  `1794470854443` / route `1794470870039` with live events advancing.
  `0c14a9e7…` (`1794263011213`) and `78f7a4a7…` (`1794418427299`) stayed stable,
  while `442a0000…` advanced only with real events. True flush-before-activity
  ordering was measured: a POST delayed 300 ms made the activity GET start 1 ms
  after the POST ended. A partial activity response (only `442a0000…`) and an
  empty response both left all 4 card rows/times intact, and HMR kept +1 acks +
  +1 activity GET per 32 s window, one panel/four rows, 0 console errors. The
  read-merge path is best-effort: sequential external writes are preserved but
  interleaving writers can lose one side (TOCTOU); a failed disk write keeps the
  map in memory without durability (flush/dispose resolve; not retried after
  dispose).
- **Pre-merge historical gate evidence (`feat/dynamic-workspaces` at `6610dd0`):**
  the 10× gate run was clean — `npm test` **10/10 runs exited 0 with 111/111
  passing each**, `npm run check` **10/10 exited 0 with fail 0** (18 modules, 9
  test files), final `npm run pack:check` **72**. This is pre-merge evidence, not
  the current merged tree.
- The current-chat rainbow ring was verified live: exactly one ring rendered with
  two running animations (angle moving 281° → 234° and the hue drift over 1.6 s),
  and it moved as different Sessions were opened — across completed and running
  rows, from the sidebar, onto a nested child row and back. Row rectangles did not
  change (`239 × 28` main rows), the hover card stayed outside the panel, and the
  row actions/chevron were unaffected. Dark theme and `prefers-reduced-motion`
  were verified (static ring under reduced motion), HMR kept one ring/panel, and
  there were 0 console errors.
- The earlier page-local acknowledgement evidence is superseded by the
  Host-shared model above: the old behaviour (a reload forgetting read marks and
  a transient running flag clearing them) was the defect this round fixed.
- The independent-review fixes were verified: the canonical measured-turn rule
  makes a fork seed's synthetic `turn/end` (kind `forked`, no `turn/start`)
  classify as **stopped** and report **0 runs** — the old `buildRuns.totalRuns=1`
  expectation is now 0, and mixed inherited+real Sessions count only real turns
  (stats/overview not inflated). Project snapshot polling against the 25 s cache
  measured **cold 2.28 s**, an immediately warm **0.029 s**, a warm poll at 15 s
  **0.043 s**, and a manual `refresh=1` **1.69 s**; each poll issued one request
  and the cache key includes the archived-member hash + `focusSessionId`. The
  Project page Escape closed an open menu first and the page on the second
  Escape. A forced one-shot read-acks POST failure stayed pending and was
  retried on window focus, then reached the Host document. HMR left a single
  poll/handler set. There were 0 console errors.
- The settings page and the configurable windows were verified live: the
  **DSH Power Suite** Plugins page shows exactly three setting rows (Shortcut
  modifier, Finished Session retention, Active project retention) with the
  defaults checked (120 minutes / 7 days), and the package README document above
  the configuration has computed `display: none` (`[data-detail-document]`).
  Switching Finished Session retention to 1 hour dropped the finished card row
  older than one hour (rows 4 → 3) and reverting to 2 hours restored it (3 → 4);
  switching Active project retention to 1 day moved older projects to Inactive
  (Active 8 → 5, Inactive 6 → 9) and reverting to 7 days restored 8/6. The Host
  route persisted `{ promptHistoryModifier, recentSessionMinutes,
  activeProjectDays }` with `"version": 2`, and the raw document read back from
  the route matched. `npm test` passed (final gate: 89/89).

The manual checks are evidence for the behavior described in the feature docs;
they are not a substitute for the automated gate above.

An independent read-only verification pass (separate agent, own browser
session) re-ran the live checks against this checkout and returned PASS for the
three additions as they stood at that time (buckets and fold persistence, the
running & recent card including nested subagent rows and row opening, and the
then-current prompt-history panel including timestamps, hover popover,
copy-to-draft, and search) with no blocker or major defect. Its minor findings
were fixed before the final gate: the history surface keeps its prompt text in
the accessible name (the action hint moved to a hidden span), the footer count is
singular-aware, and the dynamic-Workspaces effects re-arm the liveness flag on
remount. Because the prompt-history surface has since been redesigned as the
right-edge rail, that pass's preview evidence applies to the earlier panel
design; the final rail's live verification is recorded above. Residual risks the
pass
explicitly could not exercise: elapsing the longest retention windows (24 hours
and 30 days), the alternate View-options grouping modes, the empty-card state,
and screen-reader behavior with a real assistive technology; the provided-row and
source-filter copy was exercised only in the English UI (the Chinese strings were
reviewed in code); the archived-row exclusion is covered
by code inspection plus an observed reload where an archived Session disappeared
from the card.

The live surfaces are captured in
[assets/card-row-actions.png](assets/card-row-actions.png),
[assets/card-interrupted.png](assets/card-interrupted.png),
[assets/card-child-actions.png](assets/card-child-actions.png),
[assets/card-acknowledged.png](assets/card-acknowledged.png),
[assets/card-unread-dot.png](assets/card-unread-dot.png),
[assets/card-shared-ack.png](assets/card-shared-ack.png),
[assets/card-activity-before.png](assets/card-activity-before.png),
[assets/card-activity-ledger.png](assets/card-activity-ledger.png),
[assets/card-current-glow.png](assets/card-current-glow.png),
[assets/card-current-glow-dark.png](assets/card-current-glow-dark.png),
[assets/card-current-glow-reduced.png](assets/card-current-glow-reduced.png),
[assets/artifacts-panel.png](assets/artifacts-panel.png),
[assets/artifacts-filter-menu.png](assets/artifacts-filter-menu.png),
[assets/artifacts-quicklook.png](assets/artifacts-quicklook.png),
[assets/dynamic-workspaces.png](assets/dynamic-workspaces.png),
[assets/dynamic-workspaces-hover.png](assets/dynamic-workspaces-hover.png),
[assets/prompt-history-preview.png](assets/prompt-history-preview.png),
[assets/prompt-history-search.png](assets/prompt-history-search.png),
[assets/settings-page.png](assets/settings-page.png),
[assets/annotation-idle.png](assets/annotation-idle.png),
[assets/annotation-mode.png](assets/annotation-mode.png),
[assets/annotation-selection.png](assets/annotation-selection.png),
[assets/annotation-collection.png](assets/annotation-collection.png), and
[assets/annotation-inserted.png](assets/annotation-inserted.png), embedded in
their feature references.
