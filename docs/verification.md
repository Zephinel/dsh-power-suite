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

- `npm test`: **229 tests, 229 passed, 0 failed, 0 skipped** after the 0.3.0
  Project-view removal (the 24 project-view tests were deleted with the page),
  including **14** read-acks, **22** session-activity Host tests, **7** extra
  interrupted-session tests (error/max-tokens/aborted-cause cases and SSE stream
  frames), **11** Dynamic-Workspaces hover-card figure tests, and **119**
  UI-element-annotation tests through the browser-factory test seam; per-file:
  dynamic-workspaces-stats 11, interrupted-host 20, interrupted-sessions 7,
  prompt-history 6, read-acks 14, session-activity 22, session-artifacts 16,
  settings 6, ui-annotation 119, workspace-presets 8.
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
  with the **111-key** seam. On the final build: scenario 10 **PASS 8 / SKIP 0 /
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
  The segmented-control segments now show the modifier-key symbols
  (`⌥ Alt`/`⌃ Ctrl`/`⌘ Meta`/`⇧ Shift`) with full localized aria-labels, equal
  widths and no truncation. Light mode also got a contrast pass: the rainbow
  atmosphere row's canvas is a brighter pastel (saturate/brightness lift,
  wrapper opacity .56/.68), the scrim becomes a white readability veil and
  highlighted-row secondary text/icons are lifted to `label-secondary`, so the
  card title measures 14.72:1 and time/icons 4.52:1 (was 5.51:1/1.08:1), native
  Workspace worst text 15.45:1; dark mode is unchanged. The reported dark
  document-preview panel was investigated and found shell-owned/not
  reproducible (plugin defines 0 `--dsw-*` variables; native light tokens are
  correct; only shell diff sub-palette is low-contrast) — documented, no unsafe
  override. Sidebar E2E pins the light thresholds and theme-aware atmosphere
  facts (45/45).
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
> 111-key seam generation.

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

## Session dot, native hover figures and running-panel pin (2026-11-13)

> **SUPERSEDED pin evidence.** The pin-storage design recorded here (card-local
> localStorage document) was replaced first by the native-pin experiment and then by the
> final card-owned Host-shared pin (see "FOLLOW-UP 2" at the end of this file). The R1
> dot and R2 native-hover-figures evidence below still applies; the R3 pin evidence is
> historical and must not be read as the shipped behavior.

Independent live verification of the three `session-pin-stats` requirements against the
**real running DSH Web GUI** (`https://192.168.5.210:3080`, launchd `com.rexxin.dsh-web`).
The committed harness injects this worktree's `src/client.js` into the live page with a
loader swap (the installed checkout, the user profile and the service are never touched),
drives it with real CDP input, runs in a throwaway headless Chrome profile and always
redacts the token. Build verified: worktree `session-pin-stats` (`HEAD b91161b` plus the
branch changes; final injected `src/client.js` md5
`fb154900d5be0aa64fcad93aab9e3684`, 18876 lines, after the lead's `flex:none` head-cell
fix), Node v24.22.2, Chrome 157.0.8103.78, viewport 1728x900. Logs are external
evidence under `/tmp`; the screenshots are gitignored `.tmp-work/sidebar-e2e/` evidence
PNGs.

| Check | Command | Result |
|-------|---------|--------|
| Static gates | `node --check src/client.js`; `npm test` | exit 0; **230/230** tests pass, 0 fail |
| Pipeline smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, exit 0, 2.7 s on the final build (`/tmp/pin-smoke-headfix.log`) |
| R1 hover dot | `node test/browser/sidebar.e2e.mjs --pin` (`r1-1`, `r1-2`) | **PASS**: dot computed `corner-shape` equals a synthetic `corner-shape:round` control and differs from the shell's inherited squircle (`superellipse(1)` vs `superellipse(1.5)`; Chrome normalizes the round keyword), `border-radius:50%`, 10x10 css and rendered box; dot close-up + hover-card PNGs (`pin-r1-dot.png`, `pin-r1-hovercard.png`) |
| R2 native hover figures | same run (`r2-1`..`r2-4`) | **PASS**: native sidebar hover card contains `[data-psd-native-figures]` with 3 non-empty `.psd-hovercard-section` blocks (recorded on the final build: `Session statistics = 19 turns 683 steps`, `Token usage = 314,752,138 tok`, `33% of context used = ~331K / 1M`; an earlier run recorded `18 turns 671 steps` / `310,890,630 tok` / `32%`), wrapper between `[class*="_hoverTime"]` and the first `[class*="_hoverStatus"]`; same-Session plugin card rendered **identical titles and values/rows**; native frame 244 px outer / 212 px content / `12px 16px` padding with native child order intact; blank Session showed no wrapper, 0 sections, 244 px frame (`pin-r2-native-hover.png`, `pin-r2-card-hover.png`, `pin-r2-native-layout.png`, `pin-r2-blank.png`) |
| R3 running-panel pin | same run (`r3-1`..`r3-7`) | **PASS**: 16 px reserved slot on every main row (head > slot > title), unpinned resting pin `opacity:0/visibility:hidden/pointer-events:none` and pinned resting marker visible with `pointer-events:none` + `aria-pressed=true`; hover reveals the pin with `.psd-run-title` x unchanged (84 px in the final run, 75.03 px in an earlier run, before/during/after); click → `data-pinned="true"` on row/slot/button, localized Unpin label, filled `dsw-icon-pin-fill-regular` glyph in the violet/blue accent, non-transparent row tint, card pin document `{"version":1,"pinned":[id]}`; **native sidebar pin marker count 0 → 0 and native order unchanged** (negative assertion); pinned rows form a contiguous first prefix, a second pin keeps newest-activity-first order, reload restores both pinned-first from the same-profile document, unpin returns the row to the head of the normal queue immediately with tint/marker/document gone; 5 subagent child rows expose no pin DOM (`pin-r3-pinned-row.png`, `pin-r3-two-pinned.png`, `pin-r3-reloaded.png`) |
| `--pin` aggregate | `node test/browser/sidebar.e2e.mjs --pin` | **18/18 PASS / 0 FAIL** on the final build, 27.0 s, page errors **0**, network domain ENABLED, **real network failures 0**, ignored network noise 14, exit 0 (`/tmp/pin-final-headfix.log`); the same 18/18 was green on the earlier pre-fix CSS build (25.9 s, `/tmp/pin-final-18-18.log`) |
| `--pin --no-shots` | `node test/browser/sidebar.e2e.mjs --pin --no-shots` | **18/18 PASS**, 0 page errors, 0 real network failures, exit 0 (`/tmp/pin-noshots.log`); the screenshot row reports an explicit `SKIP (--no-shots)` instead of writing evidence |
| Cleanup / residual side effects | same runs, run summary | `finally` unpinned both run-pinned Sessions through the UI: card pin document `{"version":1,"pinned":[]}`, residual run ids in card snapshot `[]` and document `[]`, native sidebar pin markers 0 → 0, native session order unchanged. The pin state is the card-owned localStorage document in the throwaway Chrome profile only; the six pre-existing native sidebar pins on the live Host were neither read nor modified |
| Existing full-mode regression | `node test/browser/sidebar.e2e.mjs --no-shots` | **43/43 PASS**, page errors 0, exit 0, twice in a row on the final build, 52.8 s / 52.5 s (`/tmp/sidebar-full-branch-5.log`, `/tmp/sidebar-full-branch-6.log`); b1/b2/b3/b4/b5/b6/c2/c3/c4/f4 all green, including the unchanged B4 `+30` row-body click oracle |
| Flake attribution | `node test/browser/sidebar.e2e.mjs --no-shots --client /tmp/baseline-client-b91161b.js` (HEAD client without the branch changes) | 43/43; 42/43 (`c4-4`); 43/43 across three runs — the same first-paint `c4-4` flake exists on the untouched baseline. The branch's four earlier full-mode attempts (42/43 each, always 0 page errors: `c4-4` twice, `b6-3` once, `b4-2` once) are therefore pre-existing live-GUI timing flakes; no single-check failure repeated on the same code |

Remaining gaps for this verification: the run is headless on one display/zoom level and in
the GUI's current UI language (English labels observed; ZH copy is covered by unit tests);
the R2 case requires readable Host projections for at least one recent Session (the harness
retries up to five native rows and waits up to 9 s per row for the cold read); the blank
Session row must be rendered by the native tree (the harness expands the workspace groups
first and fails explicitly otherwise); pin persistence is deliberately per browser profile
(not Host-shared), so only same-profile reload persistence is proven; and the pin-order
oracle uses the pre-pin newest-first card order (no live activity re-sort occurred in the
recorded runs). Full-mode single-run stability is a known live-GUI timing characteristic of
this harness (see the baseline comparison above), not a branch regression; the first
full-mode run on the branch did surface a real product bug: the new `.psd-run-head` glyph
cell flex-shrank on clipped-title rows and moved the fixed pin slot under the row-body
click point, so a row-body click toggled a pin instead of opening the Session. The lead
fixed it with `flex:none`; following runs pass B4 unchanged, and the additive `r3-1` guard
(`.psd-run-head` width == its glyph width, pin slot one 8 px gap after the head) now
watches for that squeeze.

## Follow-up: Host-shared cross-device pin + shipped-install proof (2026-11-13)

> **SUPERSEDED (native-pin experiment).** The native-sidebar-pin coupling recorded in this
> section was rejected by the user (old native pins flooded the running panel and its
> children disappeared). It is kept as history only; the shipped design is the card-owned
> Host-shared pin recorded under "FOLLOW-UP 2" at the end of this file.
>
> **Supersedes the pin-storage design recorded in the section above.** After the first
> delivery the user asked for shared/cross-device pins, so the running-card pin was
> re-pointed at the DSH shell's Host-persisted Session pin (`WorkspaceSnapshot.
> pinnedSessionIds`, toggled through `uiWorkspace.pinSession` / `unpinSession`); the
> card-local `power-suite.dynamic-workspaces.pinned` localStorage document was removed and
> the user's pre-existing native sidebar pins are now listed as pinned card rows. The R1
> dot and R2 native-hover-figures evidence above still applies; all pin evidence below
> replaces the earlier localStorage-pin evidence.

Independent live verification of the follow-up on the merged/served build. Worktree
`session-pin-stats` at `2a1bb5d`; injected/loaded `src/client.js` md5
`0e7e12c93555c2d8ffabf0795cb06303` (19440 lines). The linked checkout
`/Users/rexxin/Development/dsh-power-suite` is at the same commit/md5 and the running
launchd service serves it without a restart (proved by a non-injected page). Node
v24.22.2, Chrome 157.0.8103.78, 1728x900. Logs under `/tmp`; screenshots under
`.tmp-work/sidebar-e2e/` (gitignored). Tokens are redacted; every Chrome profile is
throwaway and terminated.

| Check | Command | Result |
|-------|---------|--------|
| Static gates | `node --check src/client.js`; `npm test` | exit 0; **229/229** unit tests pass, 0 fail |
| Pipeline smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, exit 0, 2.2 s (`/tmp/followup-smoke.log`) |
| R1/R2 (unchanged) | `node test/browser/sidebar.e2e.mjs --pin` (`r1-1`, `r1-2`, `r2-1`..`r2-4`) | **PASS**: perfect-circle dot (corner-shape equals the round control, 50%, 10x10, screenshots); native hover card shows the three `.psd-hovercard-section` blocks with non-empty titles/values, same-Session exact title+value match against the plugin card, 244/212 px native frame and child order intact, blank Session shows none |
| R3 Host write path | same run (`r3-1`..`r3-3`) | **PASS**: 8 main rows each with the 16 px pin slot (6 subagent child rows expose none, clipped-title glyph-squeeze guard green); hover reveal with `.psd-run-title` x unchanged (84 px) and no layout jump; pin click on a stable finished row → row/slot/button `data-pinned=true`, `aria-pressed`, localized Unpin label, filled `dsw-icon-pin-fill-regular` glyph, violet/blue accent and tint; `dynamicWorkspacesLive.snapshot().pinnedIds` grew **6 → 7** and the native sidebar row gained its pin marker (0 → 1) and was fronted into its group's pinned partition; **no `power-suite.dynamic-workspaces.pinned` localStorage document** exists |
| R3 multi-pin + reload | same run (`r3-4`, `r3-5`, `r3-6`) | **PASS**: both run pins lead the card as a contiguous pinned prefix with newest-activity-first order preserved and the six pre-existing Host pins untouched; after a full reload the Host set still contains both ids plus every baseline pin, both rows restore pinned-first, their native markers survive, and still no local pin document |
| R3 cross-device | same run (`r3-8`) | **PASS**: a second fresh throwaway Chrome profile (`--user-data-dir`, separate CDP, same injected client) saw the Host set as **exactly baseline + both run ids by id set (8 pins)**, its card pinned prefix began with the same two run Sessions in the same A<B order, no local pin document and 0 page errors; the second profile was closed |
| R3 cleanup + side effects | same run (`r3-7` + `finally`) | **PASS**: unpin clicks removed both ids from the Host set, which returned **exactly to the 6-pin run baseline** (`baseline restored true`, residual `[]`), the card pinned count/titles returned to baseline, native pin markers reverted, and no local pin document ever appeared. Honest side effect measured and logged: the shell can front a pinned Session's saved native order and unpin does not necessarily restore it (final run group index A 0 → 1, B 1 → 1 after unpin, i.e. no persistent change observed for those finished targets) |
| `--pin` aggregate | `node test/browser/sidebar.e2e.mjs --pin` | **19/19 PASS / 0 FAIL**, 41.8 s, page errors **0**, network domain ENABLED, **real network failures 0**, ignored network noise 14, exit 0 (`/tmp/followup-pin-final.log`) |
| Shipped install (no injection) | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 7.3 s, exit 0 (`/tmp/followup-live.log`): two fresh profiles loaded the served linked checkout with no injected factory; the card had 8 main rows / 8 `.psd-run-pin` controls and the **six user's Host pins as pinned rows** (`DSH 内嵌 UI 实验性富文本开关`, `帮我去调查一下：有哪些用于`, `熄灭当前 mac 的屏幕，但是像`, `同一个帖子，在 Windows 上的进`, `自定义模板生成与问答式创建菜单`, `DSH 扩展发布与国际化-上架第三方市场`); both profiles agreed on the identical pinned prefix; no local pin document; 0 page errors |
| Existing full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **43/43 PASS**, page errors 0, exit 0 on two runs (`/tmp/atmos-new-run.log` 54.4 s, `/tmp/followup-greenfull-2.log` 52.9 s); the approved "View all" expansion logged `5 -> 8 rows` and the B4 `+30` row-body click oracle is unchanged. Four other attempts on the same build each failed one existing live-animation check (`b4-1` canvas saturation 0.373-0.378 vs the 0.38 threshold, and `b6-7`/`b6-2` under the actively-running current session), always with 0 page errors; no pin-path assertion failed |

The card's five-row "View all" limit over the combined pinned+ordinary list is intended
product behavior; with the six pre-existing Host pins the default view is pinned-only and
the harness expands like a user before checking rows. Gaps: the cross-device proof uses two
fresh browser profiles in one harness process on this machine (not a second device); the
harness's own active session makes the live card re-sort, which `--pin` works around
(finished targets, never the current Session, stable-geometry clicks) but which still makes
the full-mode live-row animation/refresh probes occasionally flaky; `--live` proves the
served linked-checkout client and is read-only; headless runs cover one viewport and the
current UI language only (ZH copy is unit-tested); and native pinning's saved-order
fronting side effect is disclosed rather than undone.

## FOLLOW-UP 2: panel-owned Host-shared pin with the normal card restored (2026-11-13)

> **Build note:** this section records build `9780a18` (client md5 `60e2573e…`). It is kept
> as history for that build; the current build `dbd3165` (client md5 `66d6df97…`) adds the
> atmosphere no-stack fix and its evidence is under "FOLLOW-UP 3" at the end of this file.

Final design after the user rejected the native-pin coupling: the pin is the **card's own
state**, independent of the native sidebar pin. It is shared through the suite's own Host
route `/api/power-suite.session-pins` (new Host feature `src/features/session-pins/`,
document `$DSH_HOME/dsh-power-suite/session-pins.json`) with a versioned client
localStorage cache + pending-op queue (`power-suite.dynamic-workspaces.pinned`). Default
card content is the normal Running & recent surface again: ordinary running/recent rows
including the running Session's subagent children, no prefilled/native pins, no default
tint. The client-only fix reaches the served GUI on page reload; the **Host route only
exists after the user restarts the DSH Web service**, so at this stage
`pinShared === false` and the Host-sync/cross-device checks are explicit SKIP rows.

Independent live verification on the merged build: worktree and linked checkout
`9780a18` ("fix(dynamic-workspaces): panel-owned Host-shared pin with the normal card
restored"), injected/loaded `src/client.js` md5
`60e2573eb1e8d1dea1eff988a38f85a0` (20418 lines) + `src/features/session-pins/`.
Node v24.22.2, Chrome 157.0.8103.78, 1728x900, throwaway profiles, token redacted.
Logs under `/tmp`; screenshots under `.tmp-work/sidebar-e2e/` (gitignored).

| Check | Command | Result |
|-------|---------|--------|
| Static gates | `node --check src/client.js` + `src/features/session-pins/*` + `src/index.js`; `npm test`; `npm run check` | all exit 0; **249/249** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Pipeline smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, exit 0, 2.8 s (`/tmp/f2-smoke-final.log`) |
| R1/R2 (unchanged) | `node test/browser/sidebar.e2e.mjs --pin` (`r1-*`, `r2-*`) | **PASS**: perfect-circle dot (corner-shape equals the round control, 50%, 10x10, screenshots); native sidebar hover card shows the three figure sections with values, same-Session label alignment against the plugin card (a running Session's real projection drift between the two hover reads is accepted only when the label structure stays identical and logged), 244/212 px native frame, blank Session shows none |
| Default card restored | same run (`r3-1`, `r3-2`) | **PASS**: 2 ordinary main rows + **6 subagent child rows** (equal to the live `childrenByParent` count), **0 pinned rows / 0 `data-pinned` nodes / no tint**, effective card pins empty; the user's old native-pin titles never appear pinned; every main row has the 16 px pin slot with hidden resting states, children expose no pin DOM, clipped-title glyph-squeeze guard green |
| Pin flow (card-owned) | same run (`r3-3`..`r3-6`) | **PASS**: hover reveals the pin with `.psd-run-title` x unchanged (84 px), no layout jump; click → `data-pinned` on row/slot/button, `aria-pressed`, localized Unpin label, filled `dsw-icon-pin-fill-regular` glyph in the violet/blue accent, tint on that row only; effective ids exactly the clicked id and the local cache records the pin; the native sidebar pin marker is unchanged (never read/written); one-row pinned prefix, then two pins newest-first with children still normal and unpinned; second pin's native marker also unchanged |
| Host sync + cross-device | same run (`r3-host`, `r3-8`) | **explicit SKIP** (`pinShared === false`): the running Host process does not serve `/api/power-suite.session-pins` yet (baseline GET 404) because the new Host feature needs a DSH Web service restart; the local cache/queue is authoritative meanwhile. These are SKIP rows, never passes; they will be re-run after the restart |
| Reload persistence (local) | same run (`r3-7`) | **PASS**: after reload the card restored both pins pinned-first in order from the local cache/queue (`migrated:false`, pending ops replay), effective ids included both, children still rendered |
| Unpin baseline restored | same run (`r3-9` + `finally`) | **PASS**: unpin via UI removed tint/marker, unpinned row returned to the head of the normal queue, effective ids empty, replayed cache effective set empty, card back to 0 pinned rows; residual cache queue and missing Host route reported honestly; native sidebar markers 0 → 0 for both run targets |
| `--pin` aggregate | `node test/browser/sidebar.e2e.mjs --pin` | **19 PASS / 2 SKIP / 0 FAIL**, 27.7 s, page errors **0**, real network failures **0**, 8 expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f2-pin-final2.log`) |
| Shipped install (no injection) | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 6.7 s, exit 0 (`/tmp/f2-live.log`): both fresh profiles served the corrected client with **2 main rows, 6 subagent child rows, 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors**; the rejected native-pin default state is gone |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, page errors 0, two runs (`/tmp/f2-full-1.log`, `/tmp/f2-full-2.log`); the only failure is the untouched `b6-5` check counting Chrome's console log of the expected pre-restart pin-route 404 (`Failed to load resource: ... 404`) between its marks. No pin-path assertion failed; this line clears once the DSH Web service is restarted with the route |

Remaining step for the complete green: after the user restarts the DSH Web service (route
loaded), re-run `--pin` so `r3-host` and `r3-8` turn from SKIP into PASS (Host document +
second fresh-profile cross-device proof, with the pre-restart local pins migrating
automatically) and so full-mode `b6-5` no longer sees the expected 404 console line.

Gaps: the Host-shared path is intentionally unproven until that restart; the
cross-device proof (post-restart) uses a second fresh browser profile on this machine, not
a second physical device; the harness's own active Session keeps re-sorting the live card
(`--pin` works around it with finished targets, never the current Session, stable-geometry
clicks and id-based retries; the full-mode live-animation `b4-1` threshold remains a known
occasional flake with 0 page errors); headless runs cover one viewport and the current UI
language only (ZH copy unit-tested); and a hard crash between a pin click and cleanup can
leave the printed ids in the local cache/Host (documented cleanup: unpin via the card).

## FOLLOW-UP 3: atmosphere rows keep only the rainbow surface (build `dbd3165` — previous build)

> **Build note:** the evidence in this section is for the previous build `dbd3165`. The
> current served build `4ec7ba5` adds the atmosphere **content-brightness** fix; its
> evidence is under "FOLLOW-UP 4" at the end of this file.

User report after the final pin build: the current-Session rainbow-atmosphere rows also
painted the ordinary row-body hover highlight inside the rainbow (card `.psd-run-main`
pill; the native current Session/Workspace row's own hover/selected background), reading
as a second misaligned highlight. Commit `dbd3165` suppresses **only the surface
highlights on atmosphere rows** (`.psd-run-current` parent hover/focus pill, pinned tint on
a current row, `.psd-child-current` child hover pill, and
`[data-psd-current-session="true"]` / `[data-psd-current-workspace="true"]` native
backgrounds -> `transparent !important`). Ordinary rows keep their hover affordance;
pin/New-session/disclosure control hovers, focus rings and the atmosphere hover opacity
rise stay.

Independent E2E regression checks were added to the `--pin` mode (`r3-10`, `r3-11`, real
CDP pointer input, existing stable-targeting helpers; full-mode oracles untouched) and the
whole suite was re-run on the new build. Build: worktree and linked checkout `dbd3165`
(no service restart; Host pin route still absent → `pinShared=false`); injected/loaded
`src/client.js` md5 `66d6df9735e891b5d3905de3cb0189ab` (20430 lines). Node v24.22.2,
Chrome 157.0.8103.78, 1728x900; logs under `/tmp`, screenshots under
`.tmp-work/sidebar-e2e/` (gitignored).

| Check | Command | Result |
|-------|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **249/249** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Card atmosphere rows (new) | `node test/browser/sidebar.e2e.mjs --pin` (`r3-10`) | **PASS**: current parent card row hovered with a real pointer → `.psd-atmos` wrapper + canvas present, `.psd-run-main` background **`rgba(0, 0, 0, 0)`** (no stacked hover pill), row surface transparent, pin control still reveals (`opacity:1`, `visibility:visible`); pinning the current row adds **no violet tint** (row and main stay transparent) and is unpinned again; an ordinary card row keeps its hover pill (measured `rgba(38, 49, 72, 0.06)`); a nested subagent row opened like a user becomes current and its `.psd-child-main` background is `rgba(0, 0, 0, 0)` with the atmosphere present |
| Native atmosphere rows (new) | same run (`r3-11`) | **PASS**: native sidebar current Session row and `[data-psd-current-workspace="true"]` row hovered with a real pointer after being revealed like a user → computed background **`rgba(0, 0, 0, 0)`** each, atmosphere wrapper + canvas present; an ordinary native session row still shows its native hover background (`rgba(38, 49, 72, 0.06)` here); when the open Session is a subagent (no native sidebar row) the check switches back to a main card row first |
| `--pin` aggregate | `node test/browser/sidebar.e2e.mjs --pin` | **21 PASS / 2 SKIP / 0 FAIL**, 42.4 s, page errors **0**, real network failures **0**, 8 expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f3-pin-2.log`). The two SKIPs remain the documented pre-restart Host rows (`r3-host`, `r3-8`); everything else from the final pin design is green |
| Shipped install (no injection) | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 7.2 s, exit 0 (`/tmp/f3-live.log`): both fresh profiles served the corrected client with 2 main rows, 4 subagent child rows (current child count), 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 3.2 s, exit 0 (`/tmp/f3-smoke.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, 53.8 s, page errors 0 (`/tmp/f3-full-1.log`); the only failure is the untouched `b6-5` check counting Chrome's console log of the expected pre-restart pin-route 404 (`Failed to load resource: ... 404`). No pin/atmosphere assertion failed; this line is expected to clear once the DSH Web service is restarted with the merged Host route |

Side effects of the new checks: they open one existing main card row and one existing nested
subagent Session (real user row clicks, no typing, no edits) to produce the current
atmosphere rows, then switch back to a main Session for the native current-row checks.
Sessions touched by the recorded `--pin` run: the run's blank/current Session, plus
`session-52ac5008-0bc3-4904-a0da-9f123aa22243` / `session-d829ba3a-645d-4f4b-9581-3bce648f4882`
(pinned + unpinned by the pin flow) and the current Session/subagent row opened by
`r3-10`/`r3-11`; the final effective card pins are `[]` and the native sidebar pin state
was never touched.

Remaining work for the final green table (unchanged): after the user restarts the DSH Web
service, re-run `--pin` so `r3-host` and the second-profile `r3-8` turn from SKIP into PASS
(the pre-restart local pins migrate on first Host contact) and full-mode `b6-5` no longer
sees the expected 404 console line. Gaps otherwise match the FOLLOW-UP 2 section
(cross-device proof is two fresh profiles on this machine; the harness runs inside the
active Session so the live card re-sorts — the checks use finished targets, stable geometry
and id-based retries; headless single viewport/language; a hard crash can leave the printed
pin ids in the cache/Host).

## FOLLOW-UP 4: atmosphere content brightness instead of any background highlight (build `4ec7ba5` — previous build)

> **Build note:** the evidence in this section is for the previous build `4ec7ba5`. The
> current served build `8ad390c` adds the atmosphere **trailing-control** fix; its evidence
> is under "FOLLOW-UP 5" at the end of this file.

User clarification after the surface highlights were removed: the atmosphere row should
brighten **its own text/icons** rather than paint any background. Commit `4ec7ba5` adds a
content brightness lift to the non-atmosphere content children of atmosphere rows
(`filter: brightness(1.15)`, `brightness(1.5)` on hover/focus-within, 140 ms filter
transition, disabled under `prefers-reduced-motion: reduce`) for `.psd-run-current`
parent/child card rows and the native `[data-psd-current-session="true"]` /
`[data-psd-current-workspace="true"]` rows. Backgrounds stay transparent; ordinary rows
keep their normal hover pill and no brightness filter.

The `--pin` atmosphere checks were extended with real-CDP brightness assertions
(`r3-10`/`r3-11` enriched, new `r3-12` reduced-motion row; full-mode oracles untouched)
and the whole suite was re-run. Build: worktree and linked checkout `4ec7ba5` (no service
restart; Host pin route still absent → `pinShared=false`); injected/loaded
`src/client.js` md5 `4bed32000b34c293f44499922619d959` (20439 lines). Node v24.22.2,
Chrome 157.0.8103.78, 1728x900; logs under `/tmp`, screenshots under
`.tmp-work/sidebar-e2e/` (gitignored).

| Check | Command | Result |
|-------|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **249/249** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Card atmosphere brightness (`r3-10`) | `node test/browser/sidebar.e2e.mjs --pin` | **PASS**: current parent card row **at rest** → every non-atmosphere content child `filter: brightness(1.15)` with the 140 ms filter transition, atmosphere wrapper + canvas present, row/body backgrounds transparent, pointer parked (not hovered) for the reading; **hovered** → every content child `brightness(1.5)` while `.psd-run-main` background stays `rgba(0, 0, 0, 0)` and the pin control still reveals (`opacity:1`/`visible`); pinning the current row adds no violet tint (then unpinned); an ordinary card row keeps its hover pill (`rgba(38, 49, 72, 0.06)`) and has `filter:none` at rest and on hover; a nested subagent row opened like a user becomes current with `brightness(1.15)` at rest / `brightness(1.5)` on hover and a transparent `.psd-child-main` with atmosphere |
| Native atmosphere brightness (`r3-11`) | same run | **PASS**: native sidebar current Session row and `[data-psd-current-workspace="true"]` row **at rest** → non-atmosphere content children `brightness(1.15)` with the filter transition; **hovered** (real pointer) → `brightness(1.5)` each, computed backgrounds `rgba(0, 0, 0, 0)`, atmosphere wrapper + canvas present; an ordinary native session row keeps its native hover background (`rgba(38, 49, 72, 0.06)`) with `filter:none` |
| Reduced motion (`r3-12`) | same run | **PASS**: under `prefers-reduced-motion: reduce` the current card row keeps the static `brightness(1.15)` lift while the filter transition is disabled (`transition-property:none`, duration `0s`); media emulation reset afterwards |
| `--pin` aggregate | `node test/browser/sidebar.e2e.mjs --pin` | **22 PASS / 2 SKIP / 0 FAIL**, 45.5 s, page errors **0**, real network failures **0**, expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f4-pin-3.log`); the two SKIPs remain the pre-restart `r3-host`/`r3-8` Host rows |
| Shipped install (no injection) | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 7.2 s, exit 0 (`/tmp/f4-live.log`): both fresh profiles served the corrected client with 2 main rows, 4 subagent child rows, 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 2.2 s, exit 0 (`/tmp/f4-smoke.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, 50.2 s, page errors 0 (`/tmp/f4-full-1.log`); the only failure is the untouched `b6-5` check counting Chrome's console log of the expected pre-restart pin-route 404. No pin/atmosphere/brightness assertion failed; this clears once the DSH Web service is restarted with the merged Host route |

Brightness values match the lead's independent injected probe: card current row content
`brightness(1.15)` at rest ×5 children, `brightness(1.5)` hovered with body background
transparent and pin visible; native current Session/Workspace `brightness(1.15)` rest →
`brightness(1.5)` hovered with transparent backgrounds; ordinary rows `filter:none` and a
normal hover background. Side effects are unchanged from FOLLOW-UP 3 (the checks may open
existing main/subagent Sessions to create current atmosphere rows; no typing/edits; final
effective card pins `[]`, native sidebar pin state untouched).

Remaining work is the same post-restart step: after the user restarts DSH Web, re-run
`--pin` so `r3-host` and the second-profile `r3-8` turn SKIP → PASS (pre-restart local pins
migrate on first Host contact) and full-mode `b6-5` no longer sees the 404 console line.

## FOLLOW-UP 5: atmosphere-row trailing controls brighten instead of painting hover backgrounds (build `8ad390c` — previous build)

> **Build note:** the evidence in this section is for the previous build `8ad390c`. The
> current served build `a5d56fd` unifies the running-card row heights with the native
> Workspace project rows; its evidence is under "FOLLOW-UP 6" at the end of this file.

User report after the content-brightness fix: the trailing controls on a rainbow atmosphere
row still painted their own rounded hover backgrounds inside the rainbow (New session "+",
disclosure chevron, pin button, and the native sidebar action buttons). Commit `8ad390c`
makes those controls keep a transparent background on hover and brighten their icon instead
(`filter: brightness(1.2)` on top of the row-level lift) on `.psd-run-current`/`.psd-child`
card rows and native `[data-psd-current-session="true"]`/`[data-psd-current-workspace="true"]`
rows; ordinary rows keep their normal hover blocks.

The `--pin` atmosphere checks were extended with real-CDP control assertions (`r3-10` card
trailing controls + ordinary control + child Continue when reachable; `r3-11` native
current-row action buttons + ordinary native control) and the whole suite was re-run.
Build: worktree and linked checkout `8ad390c` (no service restart; Host pin route still
absent → `pinShared=false`); injected/loaded `src/client.js` md5
`c8a314e8e3da999b9c3d4d2e66261328` (20447 lines). Node v24.22.2, Chrome 157.0.8103.78,
1728x900; logs under `/tmp`, screenshots under `.tmp-work/sidebar-e2e/` (gitignored).

| Check | Command | Result |
|-------|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **249/249** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Card trailing controls (`r3-10`) | `node test/browser/sidebar.e2e.mjs --pin` | **PASS**: on the current atmosphere parent row, hovering New session `.psd-row-action` (variant `new-session`), disclosure `.psd-run-toggle` and pin `.psd-run-pin` gives each control background **`rgba(0, 0, 0, 0)`** and `filter: brightness(1.2)` (no rounded hover block inside the rainbow); the pin still reveals and pin/unpin works; the ordinary card row's New session control keeps its normal hover block (non-transparent, measured `rgba(38, 49, 72, 0.06)`) with `filter:none`; the ordinary row's own hover pill and `filter:none` are unchanged; the current child row body stays transparent with atmosphere (a child Continue overlay is asserted when one is reachable); pinned current row shows no violet tint |
| Native current-row controls (`r3-11`) | same run | **PASS**: the native current Session row and `[data-psd-current-workspace="true"]` row keep transparent backgrounds + atmosphere + content brightness 1.15→1.5, and their hover-revealed action buttons are **`rgba(0, 0, 0, 0)` + `filter: brightness(1.2)`**; an ordinary native session row keeps its native hover background with `filter:none` and an unfiltered control |
| `--pin` aggregate | `node test/browser/sidebar.e2e.mjs --pin` | **22 PASS / 2 SKIP / 0 FAIL**, 58.2 s, page errors **0**, real network failures **0**, expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f5-pin-1.log`); the two SKIPs remain the documented pre-restart `r3-host`/`r3-8` Host rows |
| Shipped install (no injection) | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 8.9 s, exit 0 (`/tmp/f5-live.log`): both fresh profiles served the corrected client with 2 main rows, 4 subagent child rows, 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 3.8 s, exit 0 (`/tmp/f5-smoke.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, 55.7 s, page errors 0 (`/tmp/f5-full-1.log`); the only failure is the untouched `b6-5` check counting Chrome's console log of the expected pre-restart pin-route 404. No pin/atmosphere/control assertion failed; it clears once the DSH Web service is restarted with the merged Host route |

Control values match the lead's independent injected probe: current row New session /
disclosure / pin hover → transparent background + `brightness(1.2)`; native current
Session/Workspace action buttons → the same; ordinary-row controls keep their normal hover
block and no filter; row body/native row backgrounds unchanged from the previous round.
Side effects are unchanged (the checks may open existing main/subagent Sessions to create
current atmosphere rows; no typing/edits; final effective card pins `[]`, native sidebar pin
state untouched).

Remaining work is the same post-restart step: after the user restarts DSH Web, re-run
`--pin` so `r3-host` and the second-profile `r3-8` turn SKIP → PASS (pre-restart local pins
migrate on first Host contact) and full-mode `b6-5` no longer sees the 404 console line.

## FOLLOW-UP 6: running-card row heights unified with the native Workspace project rows (build `a5d56fd` — previous build)

> **Build note:** the evidence in this section is for the previous build `a5d56fd`. The
> current served build `53f159e` centres the leading glyph cell, child-tree trunk and pin
> column and enlarges the read-row sparkle; its evidence is under "FOLLOW-UP 7" at the end
> of this file.

User request: unify the running-card ("Running & recent") row heights with the native
Workspace project rows — "以 Workspace 的为准", for **all** row types, not just the rainbow
rows. Commit (merged at `a5d56fd`, on top of "style(dynamic-workspaces): unify card row
heights with the Workspace project rows") makes `.psd-panel` define `--psd-row-h:34px` and
`.psd-run`, `.psd-run-main`, `.psd-child`, `.psd-child-main` use it with
`box-sizing:border-box`, so the hover highlight pill fills the row. Typography and trailing
columns are unchanged; the native shell's session rows are untouched.

Independent E2E verification on the merged build with the worktree-injected client:
worktree and linked checkout at `a5d56fd` (includes the newer annotation merge),
injected/loaded `src/client.js` md5 `68ec7946c606e413c32214b45a44275a` (20875 lines). No
service restart (Host pin route still absent → `pinShared=false`). Node v24.22.2, Chrome
157.0.8103.78, 1728x900; logs under `/tmp`, screenshots under `.tmp-work/sidebar-e2e/`
(gitignored).

| Check | Command | Result |
|-------|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **250/250** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Row heights (`r3-13`, new) | `node test/browser/sidebar.e2e.mjs --pin` | **PASS**: the live native `[data-row-key^="workspace:"]` project row measures **34 px** and is used as the reference (equality asserted, not hardcoded); the card's **2 main + 4 child rows all measure 34 px**; `.psd-run-main`/`.psd-child-main` height equals the row height (34 px) with `box-sizing:border-box`, pill top/bottom matching the row ±1 px (the highlight fills the row); titles and times stay vertically centred ±1 px; titles stay single-line (`white-space:nowrap`, no vertical wrap/clip); native session rows measured **32/32/32/32/32 px** (the shell's own height, explicitly asserted so a regression cannot restyle native rows); with the taller rows the card body still scrolls inside its clamp when it overflows (the five-row/View-all expansion is logged and the fold behavior stays covered by the full-mode checks) |
| `--pin` aggregate | `node test/browser/sidebar.e2e.mjs --pin` | **23 PASS / 2 SKIP / 0 FAIL**, 53.6 s, page errors **0**, real network failures **0**, expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f6-pin-3.log`); the two SKIPs remain the documented pre-restart `r3-host`/`r3-8` Host rows |
| Shipped install (no injection) | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 6.6 s, exit 0 (`/tmp/f6-live.log`): both fresh profiles served the corrected client with 2 main rows, 4 subagent child rows, 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 2.2 s, exit 0 (`/tmp/f6-smoke.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, 50.4 s, page errors 0 (`/tmp/f6-full-1.log`); the only failure is the untouched `b6-5` check counting Chrome's console log of the expected pre-restart pin-route 404. **No existing full-mode geometry assertion assumed the old 28/24 px heights** (the only height-related existing assertion is "row heights must stay uniform", which still passes at 34 px) and no oracle was changed |

Measured heights match the lead's independent probe (card main rows 34 px, nested child rows
34 px, native Workspace project rows 34 px, native session rows unchanged at 32 px). The
check compares against the live Workspace reference rather than a literal, so a future shell
row-height change is reported as an equality failure instead of being silently accepted.
Side effects are unchanged (the `--pin` checks may open existing main/subagent Sessions to
create current atmosphere rows; no typing/edits; final effective card pins `[]`, native
sidebar pin state untouched).

Remaining work is the same post-restart step: after the user restarts DSH Web, re-run
`--pin` so `r3-host` and the second-profile `r3-8` turn SKIP → PASS (pre-restart local pins
migrate on first Host contact) and full-mode `b6-5` no longer sees the 404 console line.

## FOLLOW-UP 7: leading glyph cell, child-tree trunk and pin column share one centre; sparkle enlarged (build `53f159e` — previous build)

> **Build note:** the evidence in this section is for the previous build `53f159e`. The final
> served feature build is `436a81c` (client md5 `113e1365…`), which replaces the reserved pin
> slot with the user-requested two-phase space-saving reveal and removes the inner pinned-row
> tint; its evidence is under "FOLLOW-UP 8 (FINAL)" at the end of this file. All earlier
> "no layout jump"/reserved-slot statements are historical and superseded by that change.

User screenshot feedback: enlarge the read-row sparkle slightly; the child-tree indicator
line was not horizontally centred with the glyph; and the pin button was not centred over
the child-dot column (asymmetric left/right spacing). Commit `53f159e` puts every main-row
state's leading glyph in a fixed `.psd-run-glyph-cell` (16×20, centred — 14 px state dots
stay centred and the read-row sparkle grew 14→16 px), sets `.psd-run-main` gap 9 px with
zero pin-slot margins (equal gaps), moves `.psd-children` to a 28.5 px margin so the 1 px
trunk centres under the glyph cell, and nudges `.psd-child-main` padding to 10.5 px so the
child status-dot centre equals the pin centre.

Independent E2E verification on the merged build with the worktree-injected client:
worktree and linked checkout at `53f159e`, injected/loaded `src/client.js` md5
`8717e63139791aba0d2c96e78f92f931` (20880 lines). No service restart (Host pin route still
absent → `pinShared=false`). Node v24.22.2, Chrome 157.0.8103.78, 1728x900; logs under
`/tmp`, screenshots under `.tmp-work/sidebar-e2e/` (gitignored).

| Check | Command | Result |
|-------|---------|--------|
| Glyph/trunk/pin alignment + sizes (`r3-14`, new) | `node test/browser/sidebar.e2e.mjs --pin` | **PASS**: on every main row the `.psd-run-glyph-cell` is **16×20 px** and all cells share one centre column (measured **50 px** absolute = 29 px from the row's left edge, ±0.5 across the running-dot and read-sparkle rows); the read-row **sparkle svg is 16×16 px** and visually centred in the cell, while running/unread **state dots stay 14×14 px** centred in the same cell (cross-state cell centres equal); the pin button is centred in its 16 px slot, the slot has **zero horizontal margins** and **symmetric 9 px / 9 px** gaps (`pinSlot.left − glyphCell.right == title.left − pinSlot.right`); the child-tree **trunk centre 50 px** equals the glyph-cell centre and the **child status-dot centre 75 px equals the pin centre** |
| `--pin` aggregate | `node test/browser/sidebar.e2e.mjs --pin` | **24 PASS / 2 SKIP / 0 FAIL**, 57.3 s, page errors **0**, real network failures **0**, expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f7-pin-1.log`); the two SKIPs remain the documented pre-restart `r3-host`/`r3-8` Host rows |
| Shipped install (no injection) | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 6.6 s, exit 0 (`/tmp/f7-live.log`): both fresh profiles served the corrected client with 2 main rows, 4 subagent child rows, 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 2.1 s, exit 0 (`/tmp/f7-smoke.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, 50.5 s, page errors 0 (`/tmp/f7-full-1.log`); the only failure is the untouched `b6-5` check counting Chrome's console log of the expected pre-restart pin-route 404. **No existing geometry/targeting assertion needed to move for the new glyph cell/pin alignment**; no oracle was changed |

Measured values match the lead's independent probe (glyph cell centre = trunk centre = 29 px
from row left; pin centre = child-dot centre = 54 px from row left; pin gaps 9/9; sparkle
16 px, state dots 14 px centred in the same cell). The check opens a finished row like a
user when the live card has no read-row sparkle yet (documented side effect; no typing or
edits). Side effects otherwise unchanged: final effective card pins `[]`, 0 pinned rows,
native sidebar pin state untouched.

Remaining work is the same post-restart step: after the user restarts DSH Web, re-run
`--pin` so `r3-host` and the second-profile `r3-8` turn SKIP → PASS (pre-restart local pins
migrate on first Host contact) and full-mode `b6-5` no longer sees the 404 console line.

## FOLLOW-UP 8 (FINAL): Host-shared pin acceptance with the restarted service, two-phase slowed reveal and single highlight layer (pre-merge build `436a81c`; merged-build confirmation at the end)

This is the final acceptance round. Two user-requested changes landed after follow-up 7:
(1) the pin reveal became a **two-phase, space-saving animation** (replacing the old fixed
16 px reserved slot / "no layout jump" spec): at rest the slot is 0 px and the title starts
at 46 px, hovering expands the slot first (220 ms) and then fades the button in (160 ms,
delay 220 ms), leaving fades the button out first (160 ms) and collapses the slot afterwards
(220 ms delayed), reduced motion is instant; the reveal was later slowed from the first
timing version ("动画再稍微缓一缓") with `cubic-bezier(.4,0,.2,1)`; (2) a pinned row now paints
**exactly one highlight layer** — the row-level violet tint stays, the inner body-pill tint
was removed (`.psd-run-main` transparent at rest, ordinary hover feedback unchanged, filled
pin glyph marks the state). In the same round the DSH Web service was restarted, making the
Host pin route LIVE (`pinShared=true`): pins are genuinely Host-shared/cross-device, the
pre-restart SKIP rows became real PASS rows and the pre-restart 404 console noise is gone.

Verified build: worktree `436a81c` ("style(dynamic-workspaces): slow the pin reveal
animation"), injected `src/client.js` md5 `113e1365272ef7769868a31e19310faa` (20881 lines).
Node v24.22.2, Chrome 157.0.8103.78, 1728x900; logs under `/tmp`, screenshots under
`.tmp-work/sidebar-e2e/` (gitignored).

| Check | Command | Result |
|-------|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **250/250** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Two-phase slowed reveal (`r3-3`, rewritten) | `node test/browser/sidebar.e2e.mjs --pin` | **PASS**: in-page ~10 ms sampling with real CDP pointer — rest slot **0 px**/title **46 px**/pin hidden; hover phase 1 slot 1.08 px/title 47.69 px with the pin still hidden; after the slot reaches 16 px the title is at 71 px and the pin fades in (observed opacity 0.017 mid-reveal); settled slot **16 px**, margin-right **9 px**, title **71 px**, pin opacity 1/interactive; leave fades the button first (observed 0.972 with slot 16/title 71) then collapses to 0/46/hidden; the time/New session/disclosure columns are fixed throughout; reduced motion instant. The old "title x must not move" oracle was intentionally replaced by this user-approved spec |
| Single highlight layer (`r3-15`, new) | same run | **PASS**: a pinned ordinary row parked under the pointer paints only the row-level tint `color(srgb 0.2549 0.4627 0.902 / 0.07)`; `.psd-run-main` is `rgba(0, 0, 0, 0)` with no background-image; hovering the pinned row still shows the ordinary body hover `rgba(38, 49, 72, 0.06)` (not a second tint); unpinning restores the row background and collapses the slot to 0/46 |
| Host-shared pin document (`r3-host`) | same run | **PASS** (route live): Host document `{version:1,rev:91,pinned:[…]}` contains the card pin; the former pre-restart SKIP is replaced by this real evidence |
| Cross-device Host proof (`r3-8`) | same run | **PASS**: a second fresh Chrome profile sees the same Host pins (`["55c765df…","029aeb48…"]`) in the card's newest-activity-first pinned prefix, 0 page errors — the pre-restart SKIP is replaced by this real cross-device evidence |
| Full `--pin` aggregate | `node test/browser/sidebar.e2e.mjs --pin` | **28 PASS / 0 SKIP / 0 FAIL**, 83.6 s, page errors **0**, real network failures **0**, exit 0 (`/tmp/f9-pin-final.log`); alignment (`r3-14` 16×20 glyph cell, sparkle 16×16, dots 14×14, trunk = cell centre, expanded 9/9 gaps/title 71), `r3-14b` read-row sparkle and row-height/atmosphere checks all PASS. Cleanup: Host document back to `pinned: []` (rev 90 → 98), 8 documented pin-route writes (pin/unpin pairs), no residual pins, native sidebar pin untouched |
| Shipped install (no injection) | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 6.2 s, 0 page errors, exit 0 (`/tmp/f9-live-final.log`) |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 2.1 s, 0 page errors, exit 0 (`/tmp/f9-smoke-final.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **43/43 PASS**, 50.5 s, page errors 0 (`/tmp/f9-full-3.log`): the former `b6-5` 404 console noise is gone (0 new network failures); `b2-3` was intentionally updated to assert the hovered title slides exactly 25 px (67 → 92 absolute = 46 → 71 row-relative) while the time/New session/disclosure columns stay fixed; `b4-1` atmosphere vivid; `b6-2` cold-subagent one-shot read (1 read, 3 sections). No other full-mode oracle changed |

Build note: at run time the linked checkout HEAD had advanced beyond the injected target to
`9513b71` (annotation capture-scope merges; `436a81c` is an ancestor) with served
`src/client.js` md5 `d816e64d…` (21000 lines). The injected pin/atmosphere suites verified
md5 `113e1365…` as requested; the served non-injected client passed `--live` 4/4 but was not
re-run through the injected suites. After committing/ffing, if the served md5 changes, the
injected suites should be re-run on the merged md5. `api/changes.summary` 404s (a shell
deliverables probe whose route this Host build does not serve) are classified separately
from real network failures and are not feature failures (one intermediate run saw 6, the
final runs 0). The known `b4-1` live-canvas flake passed in the final run; `b6-2` is
environment-aware (when no cold subagent row is visible it first expands collapsed card rows
with real `.psd-run-toggle` clicks, then reports an explicit SKIP) and found a cold child in
the final run; the toggle-expansion prerequisite is kept and documented.

### Merged-build confirmation (HEAD `03d2167`, injected + served client md5 `d816e64d…`)

The final evidence commit `3cc1165` and the newer linked-checkout annotation merge `9513b71`
were merged cleanly at `03d2167`; the injected and served client are now the same
`d816e64d3aef5b108a6989a392d2f5b8` file (21000 lines), the Host pin route is live, and the
Host pin document started empty.

- **`--pin` → 28 PASS / 0 SKIP / 0 FAIL**, 85.1 s, page errors **0**, real network failures
  **0**, exit 0 (`/tmp/f10-pin.log`): `r3-host` PASS (Host document rev 99 contains the card
  pin), cross-device `r3-8` PASS (second fresh profile sees both Host pins in the
  newest-activity-first prefix), two-phase/single-tint/alignment/height/atmosphere rows green;
  cleanup restored the Host document to `pinned: []` (rev 98 → 106, no residual pins, native
  sidebar pin untouched).
- **Full mode is not green on the merged client** and is attributed to a **client/Host
  version mismatch**: the annotation merge landed after the DSH Web service restart, so the
  running Host half predates it. Four attempts: **39/43** (`/tmp/f10-full-2.log` — `b3-1`
  prompt-history search card missing; `c4-2`/`c4-3`/`c4-4` bucket-cache checks), **42/43**
  (`/tmp/f10-full-3.log` — only the known `b4-1` live-canvas saturation flake),
  **42/43** (`/tmp/f10-full-4.log` — same flake), **41/43** (`/tmp/f10-full-5.log` — `b4-1`
  flake, `c4-4`, one `Sidebar Session opening failed: … Session reference … is released` page
  error). `b6-5` cleared in every run (0 network failures) and no pin/two-phase/tint/alignment
  row failed.
- **Control:** the same harness and environment with the pre-merge control client
  `113e1365…` scores **43/43**, 0 page errors (`/tmp/f10-full-oldclient.log`), isolating the
  delta to the merged annotation client rather than the pin/two-phase/atmosphere changes or
  the harness. The known `b4-1` canvas-saturation flake (0.370–0.373 vs the 0.38 threshold)
  is pre-existing and unrelated.
- **Remedy:** one DSH Web service restart with the merged checkout, then an optional
  full-mode re-run; the pin/two-phase features are already verified green and do not depend
  on it.

## ANNOTATION USABILITY + FONT (merged build `85d1289`, client md5 `0e2d6aa8…`)

Merged client-only build: worktree and linked checkout at `85d1289` (`fix(ui-annotation)` on
top of the annotation merges), injected **and** served `src/client.js` md5
`0e2d6aa8bb80ab3eb457078240cfa50f` (21320 lines). No service restart; Host pin route live;
`npm test` **253/253**, `npm run check` exit 0. The change: (1) annotation mode's capture
blocking exempts `[data-conversation-region="composer"]` (composer editor/controls stay
native, never resolve as targets or get a hover outline); (2) the sidebar footer primary
becomes **Insert all into composer** when no page selection is pending but the collection is
non-empty; (3) the multi-selection batch popover is draggable by its header and both
popovers clamp with their measured size; (4) the Active/Inactive Projects headings match the
native Workspaces heading (14 px / 400 / 20 px line-height / tertiary colour). Probe
measurements from the Lead: composer editor click and enabled composer control click reach
the page (`defaultPrevented=false`) while page targets stay blocked; footer "Mark
requirement" → commit → primary becomes "Insert all into composer" → click inserts chip
`UI annotations × 1` and enables Send (without sending); drag moves exactly +80/+60 and stays
fully on-screen.

Targeted annotation acceptance on the merged client (`node test/browser/annotation.e2e.mjs
--<scenario> --no-shots`):

| Scenario | Result | Notes |
|----------|--------|-------|
| 5 — batch insert order, draft preserved, composer focused | **PASS 7 / SKIP 0 / FAIL 0**, 8.5 s, 0 page errors, 0 real network failures (`/tmp/t48-ann-s5.log`) | Ordered numbered blocks per entry, draft intact, never sent |
| 8 — sidebar/T25 (incl. updated `footer.primary` = "Insert all into composer") | **PASS 7 / SKIP 0 / FAIL 0**, 12.2 s, 0 page errors, 0 real network failures (`/tmp/t48-ann-s8.log`) | The updated T25 footer oracle passes on the merged client |
| 2 — Alt pass-through / native context menu | **FAIL 6 / 1** (`/tmp/t48-ann-s2.log`) — *stale oracle, not a product regression* | The old S2 probe point (chat centre `797,470`) now falls inside the composer seat (238 px tall; target is `…_input` inside `[data-conversation-region="composer"]`), so the new intentional composer exemption correctly leaves the native contextmenu unprevented. A **non-composer** chat point (`797,120`) still yields `plainPrevented = 1` (`/tmp/t48-ann-s2-diag2.log`), and the **pre-fix client** `d816e64d…` scores S2 PASS 7/7 in the same environment (`/tmp/t48-ann-s2-prefix.log`). Fix: move the blocked-contextmenu point outside the composer seat (chat top area) and/or add a separate composer-exemption assertion; no product change needed |

Coverage note: scenarios 2/8 do **not** exercise the batch-popover drag (S8 covers the
launcher drag), so the new draggable batch popover + measured-size clamping is verified by
the Lead's probe only, not by the annotation E2E yet.

Sidebar suite on the same merged md5: `--pin` **28 PASS / 0 SKIP / 0 FAIL**, 82.4 s, page
errors 0, real network failures 0 (`/tmp/t48-pin-2.log`; r3-host + cross-device r3-8 PASS on
the live Host route, Host document cleaned to `pinned: []`); `--live` **4/4**, 6.3 s
(`/tmp/t48-live.log`); `--smoke` **4/4**, 2.2 s (`/tmp/t48-smoke.log`); full mode **43/43**
on the third attempt, 52.0 s, 0 page errors (`/tmp/t48-full-3.log`) — the two earlier attempts
were **42/43 with only the pre-existing `b4-1` live-canvas saturation flake** (0.377/0.374 vs
the 0.38 threshold; `/tmp/t48-full-1.log`, `/tmp/t48-full-2.log`), no annotation-side
failures, `b6-5` clear. The one earlier user ask about the running-panel title first
character vs the child-dot column is intentionally **not** part of this change (awaiting the
user's exact alignment target).

Harness note: `r3-14` now tolerates a read-child sparkle (12 px wrapper) vs a 10 px state-dot
in the child-glyph column (≤1.5 px delta) when no dot child is rendered, while still
asserting the exact dot/pin centre alignment when a 10 px dot child exists; this keeps the
mixed read/running child states deterministic without weakening a dot-row assertion.

### Final merged build note — `54e4cba` / client md5 `d5aa7a11…`

Final confirmation on the last merged build (`54e4cba`, newest annotation work `17be49a`
merged; worktree = linked checkout; injected **and** served `src/client.js` md5
`d5aa7a114128cd5809d15db52d8e714b`, 21353 lines; no service restart; `npm test` **254/254**,
`npm run check` exit 0):

- **Annotation scenarios 2, 5, 8 all PASS 7 / SKIP 0 / FAIL 0**, 0 page errors, 0 real
  network failures each (`/tmp/t49-ann-s2.log` 9.3 s, `/tmp/t49-ann-s5.log` 7.8 s,
  `/tmp/t49-ann-s8.log` 11.5 s). **S2 now passes with the merged `chatProbePoint` /
  `composerExemptionProbe` oracle** — the previously stale point is fixed and the intentional
  composer exemption is asserted explicitly; S5 batch insert and S8 sidebar/T25
  (`footer.primary` = "Insert all into composer") stay green.
- **Sidebar suite:** `--pin` **28 PASS / 0 SKIP / 0 FAIL**, 81.7 s, page errors 0, real
  network failures 0 (`/tmp/t49-pin.log`; r3-host + cross-device r3-8 PASS on the live Host
  route, Host document cleaned to `pinned: []`); `--live` **4/4**, 7.3 s
  (`/tmp/t49-live.log`); `--smoke` **4/4**, 2.4 s (`/tmp/t49-smoke.log`); full mode
  **43/43 PASS**, 51.4 s, 0 page errors (`/tmp/t49-full-4.log`). The first three full-mode
  attempts were each 42/43 with a **different, non-reproducible live-hover/animation flake**
  (`f4-1` hover card closed in annotation mode; known pre-existing `b4-1` canvas saturation
  clamp, 0.376 vs 0.38; `b5-2` dark-theme tooltip did not appear after the hover delay) —
  every one of those checks passed on another attempt, and **no pin/two-phase/annotation
  usability assertion failed**. The newest annotation delta is resolution/selector-tier
  logic only (no hover-card change), consistent with the flakes being environment timing.
- The Lead's live probe on this md5 confirms the usability fixes survived: composer editor
  and an enabled composer control click reach the page (`defaultPrevented=false`) while page
  targets stay blocked; batch popover drags exactly +80/+60 and stays fully on-screen;
  footer primary → "Insert all into composer" → chip `UI annotations × 1` inserted and Send
  enabled; Active/Inactive Projects headings match native Workspaces (14 px / 400).

## ALIGNMENT / PROMPT-HISTORY ORDER / BORDERLESS SURFACES (merged build `3fa4f1c`, client md5 `5da30708…`)

Merged client build: worktree and linked checkout at `3fa4f1c`, injected **and** served
`src/client.js` md5 `5da3070817cc5d5fa21dd56668fce865` (21393 lines), no service restart,
Host pin route live. Three user-requested changes: (1) **Running & recent default-state
alignment (option C)** — the title's first character is centred on the child status-dot
column via a measured per-row `--psd-title-shift` (½ first-glyph advance, 1–3 px; title
rest 46 + shift px, e.g. CJK 47, Latin 48.91 with shift 2.91; first-char centre = 54), while
hover/focus/pinned force the shift to 0 so the expanded title stays at 71 px; (2)
**prompt-history rail reversed** — oldest tick at the top, newest at the bottom,
`data-psp-index` ascending top→bottom, rail scrolled to the bottom when the list overflows;
(3) **borderless Power Suite surfaces** — annotation launcher (+count badge), annotation rail
(docked/overlay), exit-confirmation dialog, feedback/undo toasts, empty-state hints and the
Running & recent panel card now have **0 outer border** (popovers/detail card/note editor
were already borderless; inner controls keep theirs).

Oracle updates (all in this round): the sidebar pin oracles now derive the default-state
title from the measured first-glyph width — `46 < titleLeft < 51`, `titleLeft +
firstCharWidth/2 ≈ 54 ±0.6`, `shift = 8 − firstGlyph/2`, rest margin-left = shift — and the
two-phase slide is `25 − shift` (≈22–24 px) instead of a fixed 25 px (`r3-2`/`r3-3`/`r3-4`/
`r3-9`/`r3-14`); pinned/expanded geometry (71 px, 9/9 gaps, pin centre 54, trunk = glyph
cell centre, 34 px heights) is unchanged. Full-mode `b2-3` now asserts the derived
`25 − shift` slide. New checks: `r3-16` borderless panel card (and any rendered plugin
surface) in `--pin`, `b3-3` prompt-history ordering in full mode, and annotation-harness
border-width assertions for the launcher (+badge), rail, empty-state hints, exit-confirmation
dialog and undo/feedback toasts.

Results on `5da30708…` (Node v24.22.2, Chrome 157.0.8103.78, 1728x900; logs `/tmp/t50-*`):

| Check | Result |
|-------|--------|
| `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **254/254** unit tests; repository check exit 0 |
| `--pin` (sidebar) | **29 PASS / 0 SKIP / 0 FAIL**, 73.5 s, page errors 0, real network failures 0 (`/tmp/t50-pin-2.log`): rest titles measured first-character-centred (e.g. `48.91` with shift `2.91`, centre 54), expanded 71, two-phase slide derived; `r3-16` borderless `Running & recent` panel **0/0/0/0 px**; r3-host + cross-device r3-8 PASS on the live Host route, Host document cleaned to `pinned: []` |
| `--live` | **4/4 PASS**, 7.0 s, 0 page errors (`/tmp/t50-live.log`) |
| `--smoke` | **4/4 PASS**, 2.3 s (`/tmp/t50-smoke.log`) |
| Full mode | **44/44 PASS**, 54.5 s, page errors 0 (`/tmp/t50-full-1.log`): `b2-3` derived slide (67→91 = 25 − shift 1) with fixed trailing columns; new `b3-3` prompt-history rail — **7 ticks, `data-psp-index` 1..7 ascending in DOM order (oldest first), newest tick at the foot** (bottom 558 vs rail 558); list fits without overflow this session, so the scroll-to-bottom branch was not exercised (Lead probe verified overflowing 1..20; the assertion remains conditional on overflow) |
| Annotation E2E | S2 **PASS 7/0/0** 9.7 s (`/tmp/t50-ann-s2.log`), S5 **PASS 7/0/0** 8.0 s (`/tmp/t50-ann-s5.log`), S8 **PASS 7/0/0** 11.8 s (`/tmp/t50-ann-s8.log`), 0 page errors / 0 real network failures each: smoke-level launcher + rail + empty-state border assertions, exit-confirmation dialog (accepted exits), undo/feedback toast borders all **0**; S2 pass-through oracle and S5/S8 content stay green |

Honest gaps/notes: the prompt-history rail in this session renders 7 ticks without overflow,
so the E2E overflow/scroll-to-bottom branch is conditional and unexercised here (order and
foot visibility are asserted); the border assertions are conditional on each surface being
present at the moment it is exercised (launcher/rail/empty always in smoke, dialog on exits
with records, toasts in S5). Intended rule documented: Power Suite **outer surfaces are
borderless**; inner controls keep their borders.

## ALIGNMENT RIGHT-BIAS + RING-FREE LAUNCHER (merged build `7014ec9`, client md5 `e6949505…`)

Merged client build: worktree and linked checkout at `7014ec9`, injected **and** served
`src/client.js` md5 `e6949505f344511438a1784ddb1379b2` (21396 lines), no service restart,
Host pin route live. Two user-feedback follow-ups: (1) the default-state first-character
alignment carries a requested **+2 px right bias** — `shift = max(0, 10 − firstGlyph/2)`
(CJK 3 px → title left 49, first-char centre 56; Latin “U” 4.91 px → 50.91 / 55.99), so the
character centre sits 2 px right of the child-dot centre (54); hover/focus/pinned still
force shift 0 → title 71. (2) the annotation launcher was still *perceived* as bordered
although `borderWidth` was 0: the shell's `corner-shape: superellipse(1.5)` turned the 50 %
radius into a squircle and the dark-theme elevation token painted a `0 0 0 .5px #fff3`
hairline. The launcher now uses `corner-shape: round` (computed `superellipse(1)`, a perfect
circle) and a ring-free soft shadow (`0 2px 6px rgb(0 0 0/10%), 0 8px 24px rgb(0 0 0/20%)`,
no 0/0/0 layer); the annotation rail overlay, exit-confirmation dialog and feedback/undo
toasts use the same ring-free shadow so no elevation hairline can read as a border.

Oracle updates: the sidebar pin oracles now assert rest range `48 < titleLeft < 53`,
`titleLeft + firstCharWidth/2 ≈ 56 ±0.6`, `shift ≈ 10 − firstGlyph/2`, rest
`margin-left = shift` (r3-2/r3-3/r3-9/r3-15; r3-4/r3-14 expanded 71 with forced margin 0);
full-mode `b2-3` asserts the derived slide `25 − measured rest marginLeft`; the annotation
harness now asserts the launcher is a borderless perfect circle (`border 0/0/0/0`,
`border-radius 50%`, square 44×44, computed `corner-shape` `superellipse(1)`) with a
ring-free open shadow, plus ring-free shadows on the rail overlay / exit dialog / toasts
when those surfaces are present.

Results on `e6949505…` (Node v24.22.2, Chrome 157.0.8103.78, 1728x900; logs `/tmp/t51-*`):

| Check | Result |
|-------|--------|
| `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **254/254** unit tests; repository check exit 0 |
| `--pin` | **29 PASS / 0 SKIP / 0 FAIL**, 74.5 s, page errors 0, real network failures 0 (`/tmp/t51-pin-1.log`): rest titles measured with the +2 bias (Latin `50.91`, shift `4.91`, first-char centre 56), expanded 71 forced shift 0; `r3-16` borderless panel `0/0/0/0`; r3-host + cross-device r3-8 PASS, Host document cleaned to `pinned: []` (rev 154) |
| `--live` | **4/4 PASS**, 9.9 s, 0 page errors (`/tmp/t51-live.log`) |
| `--smoke` | **4/4 PASS**, 3.0 s, 0 page errors (`/tmp/t51-smoke.log`) |
| Full mode | **44/44 PASS**, 56.4 s, page errors 0 (`/tmp/t51-full-2.log`); first attempt 43/44 with only the known pre-existing `b4-1` canvas-saturation flake (0.372 vs 0.38). `b2-3` derived slide `71 → 91 = 25 − rest marginLeft 4.91` with fixed trailing columns; `b3-3` prompt-history rail now exercised the overflow path: **39 ticks, `data-psp-index` 1..39 ascending in DOM order (oldest first), newest tick at the foot (731 = rail bottom 731), scrolled to bottom (232/232)** |
| Annotation E2E | S2 **PASS 7/0/0** 9.3 s (`/tmp/t51-ann-s2b.log`), S5 **PASS 7/0/0** 8.2 s (`/tmp/t51-ann-s5.log`), S8 **PASS 7/0/0** 12.5 s (`/tmp/t51-ann-s8.log`), 0 page errors/0 real network failures: launcher border 0, computed `corner-shape` circle, ring-free launcher shadow, ring-free rail overlay/dialog/toast shadows where present; S2 pass-through and S5/S8 content stay green |

Notes: the requested right bias is intentional (the character centre sits 2 px right of the
dot centre 54); the ring-free shadow rule replaces the elevation token on these floating
surfaces so a hairline can never mimic a border in either theme. Toast/dialog shadow
assertions are conditional on those surfaces being present; S2/S5/S8 exercised the launcher
(always in smoke), rail and toasts/dialog as applicable. Known pre-existing `b4-1` canvas
saturation flake remains environment-timing-only and passed on the second attempt.
