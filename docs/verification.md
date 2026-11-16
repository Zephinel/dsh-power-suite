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

Baseline evidence (2026-11-13, Node 24.22.2; merged 0.3.0 polish round — the
current checkout's counts after the 2026-11-15 update-notice round are recorded
in the implementation-round section below):

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
  On the highlighted running row the New-session (+) action now darkens to the
  primary label on hover/focus in both themes (previously the light icon-lift
  rule outranked the action's hover colour, so + stayed secondary while the
  native pin control darkened; non-current row hover was restored too); sidebar
  E2E b4-15 pins rest→hover→restore colours, glyph inheritance and non-current
  hover in light+dark. Running & recent row icons/chevrons/status/child glyphs were lifted to the
  native Workspace icon weight in light mode (label-tertiary #81858c →
  label-secondary #61666b; brand/sparkle stays label-primary; dark unchanged),
  and the native Workspace session-info hover card was widened from the shell's
  244 px to the plugin card's 320 px in both themes (scoped hash override,
  graceful fallback) so figure labels/values no longer truncate early; sidebar
  E2E b4-14/b5-7 pin the computed icon tokens and width/no-truncation facts.
  Session hovercards now follow the active theme (light surface `#fff` with
  `#0f1115`/`#61666b`/`#81858c` tokens, dark unchanged `#2C2C2E` + white),
  including the plugin's `.psd-hovercard`/`.psp-*`/`.dsa-quicklook` cards and a
  minimal scoped light override for the native shell session-info hover card;
  Running & recent row titles were aligned to the native Workspace title token
  (`#0f1115`) in light mode while dark rows are unchanged. Sidebar E2E b5-1/b5-2/
  b5-5/c2-1/b4-13 pin the computed light/dark surfaces, chrome parity and
  title-token equality (47/47, 0 page errors). The segmented-control segments now show the modifier-key symbols
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

## Sidebar hover geometry + interrupted-row hover fixes (2026-11-15, `fix/sidebar-hover-geometry`)

Three user-reported regressions after the 2026-11-14 interrupted/pin row refactor
(`b772ff5`, `cf810c7`, `5387c78`):

1. **Interrupted native Session row on hover** lost its title/time (an opaque
   `::before` mask left over from the retired trailing-edge Continue CTA) and, on
   the current Session row, the rainbow atmosphere layer was caught by the mask's
   positional `span:first-child` z-index rule: the wrapper flipped from
   `position:absolute;z-index:0` to `position:relative;z-index:2` in flow, shrank
   to a partial pill and pushed the warning badge/title right. Fix: delete the
   mask and its positional rules; let the native leading status cell widen
   (`width:auto`) for the interrupted row so the inline Continue triangle fits and
   the title slides right; skip the injected atmosphere wrapper when the
   stale-spinner decorator looks for the native leading cell.
2. **Running & recent interrupted row title at rest** sat shifted right: the
   2026-11-14 markup moved the pin/Continue slots inside the `.psd-run-head`
   flex container (`gap:8px`), so two 0 px slots still added up to 16 px of gap
   before hover. Fix: gap-less head + a 9 px margin on the leading glyph cell.
   Rest title returns to `46 + shift` (first-character centre 56), hover/pinned
   stays `71` for ordinary rows, and the interrupted row's collapsed slots add
   nothing until the row is hovered.
3. **Running & recent hover surface** lit only the content-paced inner pill; the
   native Workspaces rows light the whole row. Fix: paint the hover background on
   `.psd-run`/`.psd-child` (inner body stays transparent, atmosphere rows stay
   suppressed with matching specificity), and the same leading-cell margin
   removes the oversized glyph-to-title gap.

Checks:

- `npm test`: **271/271** pass; `npm run check`: exit 0 (**18 modules, 14 test
  files**, pack list 77 entries).
- Live GUI (launchd `dsh-web`, dark theme, throwaway headless Chrome, worktree
  `src/client.js` injected through the loader swap; real CDP mouse input, no
  clicks that mutate sessions other than opening them):
  - Native interrupted row, rest → hover: leading cell `16 → 38 px`, Continue
    triangle at `36–58 px` immediately right of the badge, title left edge
    `42 → 64 px`, no `::before` mask (`content: none`), native trailing actions
    `183–265 px`; the row keeps the native hover surface and the title stays
    visible (the title marquee is the shell's own behaviour).
  - Real current + interrupted row (open the interrupted Session, then hover):
    atmosphere wrapper stays `position:absolute; z-index:0` at `258x32 px`
    (full row), leading cell 38 px, triangle visible, title visible — the old
    in-flow rainbow pill / collapsed title no longer reproduces.
  - Card ordinary row: rest title `49 px` from the row's left edge
    (`46 + --psd-title-shift 3`), hover title `71 px` (pin slot `16 + 9`), hover
    surface = full row `240 px` wide, inner body transparent.
  - Card interrupted row geometry (static replica of the card DOM + shipped CSS,
    same 320 px panel; the live Host had no interrupted row inside the retention
    window): rest title `49 px`, first-character centre on the 56 px column,
    Continue slot `0 px`; hover: Continue `22 px` + pin `16 + 9 px`, title
    `95 px`, row surface painted, body transparent.
  - Current card row hovered: row/body backgrounds stay `rgba(0,0,0,0)` under the
    rainbow; pin and New session still reveal.
  - Page errors: 0 in every run.
- Evidence images: [sidebar-interrupted-hover.png](assets/sidebar-interrupted-hover.png)
  (native interrupted row hover), [sidebar-interrupted-current-hover.png](assets/sidebar-interrupted-current-hover.png)
  (current + interrupted, rainbow intact), [card-fullrow-hover.png](assets/card-fullrow-hover.png)
  (full-row card hover), [card-interrupted-rest-hover.png](assets/card-interrupted-rest-hover.png)
  (left: interrupted card row at rest, right: hovered; static replica).
- `test/browser/sidebar.e2e.mjs` was updated for the new contracts (`b2-1`
  full-row surface, `b2-5` stand-in margin, ordinary-row hover surface, pinned
  row hover surface, probe fields). The full sidebar E2E suite was **not** re-run
  this round because it creates blank Sessions and pins rows on the shared live
  Host; the targeted live-DOM measurements above stand in. Note the pin-mode
  section of that harness already carried pre-existing geometry assertions from
  before the 2026-11-14 markup move (e.g. `gapHeadToSlot = 9` when the slot moved
  inside the head), so a full green pin run is not claimed here.
- Independent review round (same branch): reviewer found the pinned-row violet
  tint was replaced by the generic hover token because the new `(0,4,0)` full-row
  hover rule outranked the pinned `(0,3,0)` rule; fixed by giving the pinned hover
  rule the same structural guards (`(0,5,0)`, `color-mix` of tint + hover token),
  with the atmosphere suppression at equal specificity declared later so a pinned
  current row still stays transparent. Static replica check: pinned rest
  `color(srgb 0.478431 0.666667 1 / 0.07)` → hover
  `color(srgb 0.744582 0.836763 1 / 0.142941)`, body transparent; pinned+current
  row stays `rgba(0, 0, 0, 0)` on hover. Reviewer's other finding (stale in-harness
  `gapHeadToSlot`/`headChildCount` guards from the earlier markup move) is
  pre-existing and left untouched, as recorded above.

## Sidebar hover fixes — independent review round 2 (2026-11-15, same branch)

Two independent reviews ran against the merged `cd26c73` (one code/regression
review with static Chrome replicas, one shipped-install live-GUI verification
with a throwaway Chrome and no client injection). The shipped-install review
returned **PASS on all four reports** against the installed code (byte-identical
client, 0 runtime errors, light/dark, keyboard focus), and confirmed the native
time is replaced by the shell's hover actions (not by a plugin mask) and the
native title marquee is shell behaviour. The code review returned two real
regressions plus doc/test inaccuracies, all fixed in this round:

- **Leading-cell cleanup hid other plugins' marks.** The rule that removes the
  stale native spinner also matched every non-plugin child of the shared
  `sidebar.session.row.leading` `display:contents` slot wrapper, so the
  ui-schedule clock mark and the experimental-liveshare fork mark disappeared on
  an interrupted row. Now only native status nodes rendered directly under the
  leading cell are hidden; the wrapper and its other children are untouched.
  Static replica: injected foreign mark `display:flex`/visible while the native
  dot is `display:none` (`/tmp/ps-probe/probe10.mjs`, B1).
- **Animated leading-cell width broke the shell's title marquee.** The shell
  measures `scrollWidth - clientWidth` once on `pointerenter`; animating the
  cell 16→38 px left the range 22 px short (and titles just above the shell's
  8 px reveal threshold never marqueed). The Continue slot now snaps to 22 px
  (only its opacity fades), so the measured range equals the settled range.
  Static replica with the shipped CSS: pointerenter range `466 px` = settled
  `466 px` (the previous animated rule measured `444 px` = rest, 22 px short);
  lead 38 px at enter.
- **Click-focus left a stuck card surface.** The new full-row focus surface was
  not keyboard-gated; the shell paints focus surfaces only for
  `html[data-input-modality="keyboard"]`. The card's focus halves (generic,
  pinned, atmosphere suppression) now carry the same gate; programmatic focus
  without the attribute keeps the row transparent, with it the row paints.
- **Card atmosphere-row control suppression restored.** `235cd42` dropped the
  card-current control rule while the docs and the pin-mode E2E still require
  transparent + `brightness(1.2)`; restored for `.psd-row-action`,
  `.psd-run-toggle`, `.psd-run-pin` and `.psd-continue-inline` on current card
  rows. Static replica: card current row + atmosphere, hovering the New session
  action → row/body `rgba(0,0,0,0)`, action background `rgba(0,0,0,0)` with
  `filter: brightness(1.2)`.
- **Reduced motion.** The pre-existing reduced-motion reset lost to the
  hover/focus transition rules (`(0,2,0)` vs `(0,3,0)`), and the new native
  Continue slot added a width/opacity transition. Both are now disabled under
  `prefers-reduced-motion: reduce`; static emulation reports `transition: none`
  for pin slot, pin, open, atmosphere and the native Continue slot.
- **Docs/tests corrected.** The CHANGELOG and interrupted-sessions docs no
  longer claim the time stays visible on native hover (the shell swaps it for
  the hover actions); the stale-running decorator path is documented as
  badge-only (the composer play control continues it); the manual-check wording
  for the card hover surface is full-row; `b2-5` now probes the real head order
  (badge inside the 16 px cell, triangle behind the leading cell's 9 px rest
  gap) instead of appended stand-ins; the F6 probe picks the native leading cell
  the way production does (skipping the atmosphere wrapper); the pin-mode
  atmosphere checks also assert the row surface, not only the transparent body.
  The dead trailing-edge `InterruptedContinueAction` component was removed.
- Reviewer NITs left as documented pre-existing behaviour: the pin-mode
  `gapHeadToSlot` guard is inert since the pin slot moved into the head (harness
  gap noted above), and forward Tab from a row's title button skips the pin
  (pin slot precedes the title in DOM order).

### Round-2 shipped-install verification (final merge `787e124`)

The fix+review commits were merged into `feat/dynamic-workspaces` and the live
GUI was re-probed **without injection** (throwaway headless Chrome, fresh
profile, dark theme; no service restart or profile change):

- Served CSS is the merged code: the public client bundle contains the new
  instant-width interrupted Continue slot (`transition: opacity 120ms`), the
  shared-wrapper hide rule is absent, the card focus rule is gated on
  `html[data-input-modality='keyboard']`, the restored card-current control
  suppression is present, and the reduced-motion reset is present.
- Card ordinary row, shipped: rest title `49 px` / first-character centre
  `56 px`; hover title `71 px`, row surface `rgba(255,255,255,.08)` on the full
  `240 px` row, body transparent; pin slot `0 → 16 + 9 px`.
- Current rainbow card row + New session action, shipped: hovering the action
  keeps row/body/action background `rgba(0,0,0,0)` with
  `filter: brightness(1.2)` (restored suppression, live).
- Focus gating, shipped: focusing the row title button with the shell's
  `pointer` modality leaves the row transparent; with `keyboard` modality the
  row paints `rgba(255,255,255,.08)`.
- Reduced motion, shipped: pin slot, pin, title button and native Continue slot
  all report `transition: none`.
- Page errors: 0 for every shipped run.
- The shared Host currently lists **no** interrupted Session row, so the native
  hover/marquee path was re-checked with a static replica built from the
  **served** style tags, live panel markup and live tokens: the foreign
  leading-slot mark stays visible while native status nodes are hidden; hover
  gives leading cell `16 → 38 px`; the marquee range measured on `pointerenter`
  is `466 px`, equal to the settled range (the pre-fix animated rule measured the
  rest range `444 px`, 22 px short).
- The shipped-install reviewer's only MINOR was the pre-existing reduced-motion
  gap, fixed above; its other NITs are the documented pre-existing ones.

## Sidebar hover fixes — independent delta review round 3 (2026-11-15, same branch)

A fresh independent delta review of `f3d1a54` (read-only, static Chrome replicas
of the shipped CSS plus shell-source inspection) confirmed the round-2 deltas
(leading-slot safety, instant-width marquee, keyboard background gating, restored
control suppression, docs) but found remaining issues, all fixed in this round:

- **`b4-15` was stale (MAJOR, test-only).** The E2E still expected an
  atmosphere-row New-session action to paint the interactive hover block and have
  no filter — that was measured before the transparent + brightness design was
  documented; with the restored suppression it is a guaranteed red check. The
  test now expects `background-color: rgba(0,0,0,0)` and
  `filter: brightness(1.2)` in both themes while keeping its colour/geometry
  assertions.
- **Suppression leaked into nested child rows (MINOR).** `.psd-children` renders
  inside the parent `.psd-run` row, so the descendant selectors also suppressed a
  nested child's controls. The restored rule is now scoped with child combinators
  to the current row's own controls (main pin/Continue, action slot, disclosure);
  a child row inside a current parent keeps its normal hover block (static proof:
  child action `rgba(255,255,255,.08)` / filter `none`, child row surface painted).
- **Atmosphere brightness lift was not keyboard-gated (MINOR).** A mouse click on
  a current-row control could leave the row at `brightness(1.5)`; the focus half
  now matches the background gating (`html[data-input-modality='keyboard']`).
  Static proof: pointer focus `brightness(1.15)`, keyboard focus
  `brightness(1.5)`.
- **Native Continue reveal was not keyboard-gated (MINOR).** The focus half of
  the reveal now requires keyboard modality, so mouse focus on the row's leading
  button cannot leave the cell widened/triangle visible. Static proof: pointer
  focus keeps the slot at `0 px`, keyboard focus reveals `22 px`.
- **Card Continue slot missing from the reduced-motion reset (MINOR).** The
  `.psd-continue-slot` width/margin transition is now disabled under
  `prefers-reduced-motion: reduce` (static: `transition: none`).
- **NITs:** the redundant pinned pin-hover selector was dropped; the F6 check
  title/comment now states it covers the stale plugin-record branch (the
  decorator's stale-native-running branch is covered by the static replica), and
  the `b2-5` badge→triangle gap tolerance was tightened to 1 px.
- The reviewer re-confirmed root causes and the round-2 fixes independently; no
  BLOCKER remained and the product CSS matched the docs.

### Round-3 delta shipped verification (final state after `6558fc4`)

The independent shipped-install delta review of `f3d1a54` (no client injection,
fresh throwaway Chrome, live GUI + replicas built from the served style tags)
returned **CLEAN for the four original reports and all five round-2 delta fixes**:
native interrupted hover (leading 16→38, triangle 22 px, title visible, no mask),
current+interrupted atmosphere absolute z0 full-row with visible title, card
interrupted rest 49/56 → hover 95 with Continue 22+2 and pin 16+9, full-row card
hover with transparent body, leading-slot safety (foreign marks visible, stale
native dots hidden), instant-width marquee (pointerenter range equals settled
range; the 22 px shortfall is gone), keyboard-gated focus surface (pointer
transparent, keyboard painted), current-row controls transparent +
`brightness(1.2)`, reduced motion `transition: none` for pin slot/pin/open/
atmosphere/native Continue, dark and light themes, 0 page errors. It also
confirmed the served bundle contains the final-only CSS markers (combined-loader
hash comparison inconclusive because of the module boundary).

Its two residual notes were addressed in `6558fc4`: the card inline
`.psd-continue-slot` reduced-motion gap it re-found independently is now covered
by the reduced-motion reset (static: `transition: none`), and its NIT on the
"native-like glyph gap" wording is corrected above/documentation-wide (the
contract is the 9 px leading margin + first-character centring shift ≈12 px, not
the native row's plain 6 px).

The same round-3 state was re-reviewed by a second, independent code reviewer
(fresh context, read-only): it independently reproduced the leading-slot safety,
instant-width marquee, keyboard background gating, restored suppression and the
docs/tests state as correct, and its findings are exactly the six items fixed in
this round — the stale `b4-15` (MAJOR, test-only: a guaranteed red check against
the documented behaviour), the nested-child suppression leak, the ungated
atmosphere brightness lift and native Continue focus reveal, the missing card
Continue reduced-motion reset, and the F6/b2-5 NITs. The reviewer's static
proofs (forced `:hover`/focus with the shipped CSS) are the basis for the
updated assertions; the full sidebar E2E is still not executed because it
creates sessions and pins on the shared Host.

### Round-3 shipped verification (final merge `72ac1ab`)

Re-probed the live GUI **without injection** after merging the round-3 fixes
(throwaway headless Chrome, dark theme, real mouse; no service restart):

- Served CSS is the final code: every final-only marker present — native Continue
  slot opacity-only transition (width snaps), direct-child-only stale-dot hide,
  absent old shared-wrapper hide and old `::before` mask, keyboard-gated card
  focus and brightness lift, keyboard-gated native Continue focus reveal, scoped
  card-current control suppression (`.psd-run-current > .psd-run-actions
  .psd-row-action:hover`), full-row hover, gap-less head + 9 px glyph margin,
  atmosphere absolute z0, reduced-motion resets including `.psd-continue-slot`.
- Card ordinary row, shipped: rest title `49 px` / first-char centre `56 px`;
  hover title `71 px`, full `240 px` row surface `rgba(255,255,255,.08)`, body
  transparent, pin `0 → 16 + 9 px` visible.
- Current rainbow card row + New session action, shipped: row/body/action
  backgrounds `rgba(0,0,0,0)` with `filter: brightness(1.2)`.
- Focus, shipped: pointer-modality focus leaves the row transparent; keyboard
  modality paints `rgba(255,255,255,.08)`.
- Reduced motion, shipped: pin slot/pin/title button/native Continue
  `transition: none`; the static served-CSS check also covers the card
  `.psd-continue-slot` (`transition: none`) and the scoped child-row behaviour
  (nested child controls keep their normal hover block; child row surface paints).
- Static replica from the **served** style tags (live Host currently lists no
  interrupted Session row): leading cell `16 → 38 px`, Continue `22 px`, title
  visible, no mask; marquee range at pointerenter `466 px` = settled `466 px`
  (rest `444 px`); foreign leading-slot marks visible while native status nodes
  are hidden; brightness gating `1.15 → 1.5` only under keyboard modality;
  native Continue reveal `0 → 22 px` only under keyboard modality.
- Page errors: 0 in every shipped run.
- The second shipped-install delta review of the previous merge (`f3d1a54`)
  independently returned CLEAN for the four reports and the five round-2 delta
  fixes, and its two residual notes (card Continue reduced motion, "native-like
  glyph gap" wording) are addressed in `72ac1ab`.

Remaining gaps are harness/evidence limitations, not code defects: the full
sidebar E2E is not executed (it mutates the shared Host, so the updated `b4-15`
expectation is backed by the reviewer's forced-`:hover` static proof rather than
a run), the F6 live check cannot reproduce the decorator's stale-native-running
branch on the shared Host (covered by the static replica), and `b2-5` still uses
a synthetic head stand-in for the Continue slot.

## 2026-11-15 — 更新提醒（实现轮）

Implementation round of the update notice (Host route + browser prompt), the
release-notes pipeline, and the repository rename to
`@zephinel/dsh-power-suite`. Automated gates were recorded with the docs round;
the Lead added the real-machine evidence on the same day.

### Automated gates (local, 2026-11-15)

Run from the repository root after the Host, browser, and release files landed:

```bash
npm test
npm run check
```

- `npm test`: **307 tests, 307 passed, 0 failed, 0 skipped** (16 test files),
  including the new `test/update-check.test.js` (**22** Host tests) and
  `test/update-check-prompt.test.js` (**14** browser-state tests through the
  client factory seam).
- `npm run check`: **passed** — syntax checks, package-manifest checks, the
  full test suite, the release-notes gate, and `npm run pack:check`
  (`entryCount` 85; package `@zephinel/dsh-power-suite@0.1.0`).
- `npm run check:release-notes` (also inside `npm run check` and the publish
  workflow): **ok** — `release-notes/0.1.0.md` has 6 Highlights and
  `release-notes/0.1.0.en.md` has 6.
- `git diff --check`: clean.
- Local Markdown links (validated by `npm run check`): every `docs/`,
  `README.md`, and `CHANGELOG.md` link resolves, including the new
  [update-check.md](update-check.md),
  [release-notes/README.md](../release-notes/README.md), and
  [.agents/skills/release-power-suite/SKILL.md](../.agents/skills/release-power-suite/SKILL.md).
- Publish workflow CHANGELOG gate: simulated locally with the same `awk`
  predicate — the `[Unreleased]` section names `0.1.0`, so a `v0.1.0` tag
  passes while the section is still under Unreleased (no dated heading exists
  yet, by decision).

### Files changed in the implementation round

- **Host:** `src/features/update-check/{version,release-notes,checker,host}.js`
  (new), `src/index.js` (installer call), `test/update-check.test.js` (new).
- **Browser:** `src/client.js` (`#region feature: update check`),
  `test/update-check-prompt.test.js` (new).
- **Release:** `release-notes/{README.md,0.1.0.md,0.1.0.en.md}` (new),
  `scripts/check-release-notes.mjs` (new), `scripts/check.mjs` (release-notes
  gate + `@zephinel` name assertion), `.github/workflows/ci.yml` (replaces
  `check.yml`), `.github/workflows/publish.yml` (new), `package.json` /
  `package-lock.json` (name, version 0.1.0, repository, publishConfig, files,
  scripts), `.agents/skills/release-power-suite/SKILL.md` (new).
- **Rename:** `cordis.patch.yml`, the client loader id, `test/browser/*`, and
  `test/ui-annotation.test.js`.
- **Docs:** `README.md`, `CHANGELOG.md`, new
  [update-check.md](update-check.md), `docs/overview.md`,
  `docs/architecture.md`, `docs/limitations.md`, `docs/development.md`, and
  this record.

### Real-machine evidence (Lead, 2026-11-15)

The running DSH Web GUI on this machine was migrated to the renamed bundle and
verified; no Host restart was needed (`plugin_manager remove_bundle` +
`install_bundle` applied live).

**Profile migration**
- `dsh --profile web --dump-config`: no `@rexxin/dsh-power-suite` occurrence;
  the `power-suite` row is `name: '@zephinel/dsh-power-suite'`.
- `~/.dsh/profiles/web/package.json` has the `@zephinel/dsh-power-suite`
  dependency (link) and bundle entry; `node_modules/@zephinel/dsh-power-suite`
  exists and `@rexxin` is gone.

**Host route (cookie-authenticated, live Host)**
- `GET /api/power-suite.update?lang=zh` → **200**, `cache-control: no-store`,
  `content-type: application/json`:
  `{"current":"0.1.0","latest":null,"updateAvailable":false,"highlights":[]}`
  (31 ms first call, 10 ms cached repeat).
- `GET /api/power-suite.update?lang=en` → **200** with the same body (1.38 s
  first call).
- Unauthenticated request → **401** (Connection fence intact).
- The real registry was read: the package is unpublished, so `latest` is `null`
  and the failure TTL applies; the route never answered 5xx.

**Browser prompt — `test/browser/update-prompt.e2e.mjs` (21/21 checks after the review fixes)**
The harness opens the real GUI in a throwaway headless Chrome, stubs only
`GET /api/power-suite.update` through the CDP Fetch domain, and drives the
installed client code:
- card appears bottom-right after the page-load delay, `role=region`,
  `0.1.0 → 0.2.0`, update + later actions, exactly one route request per load;
- 查看更新内容 expands the highlights and toggles to collapse;
- 下次再说 hides the card and stores `{laterVersion:"0.2.0",laterClicks:1}`;
- three later clicks expose 不再提醒; silencing stores only
  `{silencedVersion:"0.2.0"}` and the card stays hidden on reload;
- 更新 closes the card and opens the plugin manager surface, proven with a real
  surface marker (absent before the click);
- a no-update answer is silent and resets the stored cycle to `{"schema":1}`;
- a failed registry answer (`latest: null`) is silent and keeps the state;
- no page exception and no error-level console message in any scenario.

Escape / outside click share the same `later` action; the harness covered the
action path, not the two gestures directly (code-reviewed only).

**Not verified (gaps)**
- The real "newer published version" path cannot run before 0.2.0 is
  published; the prompt UI used injected payloads only.
- Sidebar DOM mutation counting was not run live; the client-state regression
  test encodes the hard rule (the region must not contain `insertBefore` or
  `document.body` and only adds a `<head>` style tag), and the live probe
  reported no boot or page errors.
- Dynamic Workspaces / interrupted badge / prompt-history rail / Artifacts /
  annotation were not exercised scenario-by-scenario on the migrated GUI; the
  page booted with the renamed bundle and reported no page errors.
- CI has not run on GitHub (the repository has no remote yet).

### Evidence limits (state honestly)

- npm's real "newer version" end-to-end path cannot be exercised before 0.2.0
  is published; the card UI is verified with injected fake payloads.
- Right after the 0.1.0 release, `updateAvailable` is always false because the
  running version equals npm `latest`; no live prompt is expected on this
  checkout.
- The current install is a `link:` bundle: its Plugin detail page has no
  upgrade action, so **更新** is verified as navigation only.
- Per-browser `localStorage` state was not exercised across multiple
  browsers/devices (one throwaway Chrome profile was used).
- No real screen-reader audit; Escape/outside-click were code-reviewed, and
  the harness drove the equivalent later action.
- The GitHub workflows have not run on GitHub before the first push; only
  their syntax/steps were reviewed locally.

## 2026-11-15 — 更新提醒 review 修复（`feat/update-reminder`）

Two independent review axes (Standards / Spec) covered the implementation round.
Neither found a BLOCKER; every MAJOR/MINOR/NIT finding was fixed before the
feature branch was committed.

### Fixed

- **Publish readiness is gated before npm:** new
  `scripts/check-publish-manifest.mjs` runs in `publish.yml` right after the
  tag/version check and rejects a still-`private` package, a wrong
  name/repository/`publishConfig`, or a missing `release-notes` files entry. It
  is deliberately not part of `npm run check` (development installs stay
  private); the release skill runs it during release preparation.
- **One CHANGELOG timing policy:** release entries stay under
  `## [Unreleased]` through publish (`publish.yml` accepts the version named
  there) and move to `## [<version>] - <UTC date>` in the post-publish docs
  follow-up. `docs/development.md` and the release skill now say the same thing.
- **Docs match the card:** the docs no longer claim a motion/reduced-motion
  treatment (the card has no animation) and describe the implemented layered
  inline-SVG brand mark, which the card now renders with theme tokens.
- **The browser check is abortable:** the controller owns an `AbortController`
  per check (8 s bound) and `dispose()` aborts it, so a reload/unload cannot
  leave a hanging request.
- **Version tables are pinned:** `version.js` and the mirrored client parser now
  use identical rules (trim + safe integers), and a cross-half test compares
  both tables on the same inputs.
- **The checker reuses its documented helpers:** `createUpdateChecker` consumes
  `installedVersion`/`releaseNotesRepository` instead of re-deriving them, and
  the private `readManifest` is no longer exported.
- **Client test quality:** the source-level test keeps the real invariants
  (`shell.overlay`, no `insertBefore`, no `document.body`, no
  `MutationObserver`), drops brittle style-literal assertions, and ends the
  region at the next feature marker.
- **CI parity and docs gate:** `verify` runs Node 22 and 24 again; a docs-only
  change runs `npm run check:docs-links` instead of skipping documentation
  validation. Link validation moved to `scripts/check-docs-links.mjs` and now
  also covers `.agents/skills/**`.
- **Stronger live oracle:** `test/browser/update-prompt.e2e.mjs` accumulates page
  errors across every load and proves the Update action with a real plugin
  manager surface marker (`[data-plugin-detail]`/`[data-plugin-rows]`) that must
  be absent before the click. The release skill lists the suite and
  `test/browser/README.md` documents it.
- **README install:** published releases can be installed from npm
  (`plugin_manager action=install_bundle target=@zephinel/dsh-power-suite`); the
  local `link:` checkout remains the development path.
- **Publish poll bound:** `publish.yml` polls for at most 10 minutes even when
  the registry accepts connections but never answers (30 × 5 s endpoint
  timeouts + 10 s sleeps).
- **Release skill self-contained:** it no longer references the gitignored
  `.tmp-work/` plan; `release-notes/README.md` wording matches the card
  (查看更新内容, inline details section); `scripts/check.mjs` documents all five
  gate steps.

### Verification after the fixes (2026-11-15, `feat/update-reminder`)

- `npm test`: **308/308 passed** (16 files; Host 22 + client 15, including the
  new mirrored-version-table test).
- `npm run check`: **passed** — 22 modules, 16 test files, `docs links ok: 21
  Markdown files`, `release-notes: ok (0.1.0; 6 highlight(s), 6 English)`, pack
  `entryCount 85`.
- `node scripts/check-publish-manifest.mjs`: **exit 1 by design** on this tree
  (`package.json still has "private": true`); it must pass after the release
  preparation removes `private`.
- Live GUI harness: `node test/browser/update-prompt.e2e.mjs` → **21/21**
  checks, including the stricter navigation oracle (surface absent → Update
  click → plugin manager surface present) and the cumulative page-error oracle
  (no exception or error-level console message across every scenario load).
- Both workflow YAML files parse (Ruby Psych) and `git diff --check` is clean.

### Evidence limits

- The publish manifest gate is proven to fail on the private development tree;
  its passing path can only be exercised during release preparation (remove
  `private`, then run it).
- The CI matrix (Node 22/24), docs-only link path and publish gates have not run
  on GitHub yet — the repository still has no remote; the first push will be the
  first real workflow run.

## 2026-11-15 — 复验修复（第二轮，`feat/update-reminder`）

Both re-reviews confirmed all 12 Standards and 9 Spec findings FIXED; each axis
raised new doc/gate findings, closed in the follow-up commit:

- **The publish-manifest gate now matches the documented release step:** it
  rejects only an explicit `"private": true`, so deleting the field (what the
  release skill and `docs/development.md` instruct) passes; an optional manifest
  path is accepted as a test seam. Shapes verified: `private: true` → exit 1,
  field deleted → exit 0, `private: false` → exit 0.
- **Comment/doc drift:** the `ci.yml` header describes the docs-only link gate,
  the client's abort comment matches the actual `settle()`/`dispose()` behavior,
  the e2e header says 21 checks, and `docs/update-check.md` states that the
  parser has no cap while the Host check caps the card at six.

Verification after the follow-up (branch `feat/update-reminder`, tree clean
before it):

- `npm test`: **308/308 passed**; `npm run check`: **passed** (docs links 21,
  release-notes 6+6, pack 85 entries).
- Publish-manifest gate shapes: `private: true` exit 1 / field deleted exit 0 /
  `private: false` exit 0.
- Live GUI harness: `node test/browser/update-prompt.e2e.mjs` → **21/21**.

## 2026-11-15 — Running & recent 行操作与待回答问题提醒（feat/running-panel-ux）

Branch `feat/running-panel-ux` (branch tip, on top of `db62343`/`0ad41a0` and
the review-fix commits). Two additions to the Running & recent card; the plugin-owned card
pin is **kept** (restored) and remains the single pin owner.

- **Card pin (kept/restored)** — the card's title-left pin button is the only
  pin owner. It keeps/maintains the card-owned Host-shared document
  (`$DSH_HOME/dsh-power-suite/session-pins.json`, `{version, rev, pinned}`, max
  500 ids, atomic writes, `rev` on real change) served by the authenticated
  `GET|POST /api/power-suite.session-pins` route, with the versioned
  `localStorage` cache/queue for first paint/offline use. The title-left button
  keeps the two-phase hover reveal (slot expands, then the button fades in;
  leaving reverses; instant under reduced motion), pinned rows keep the filled
  marker + its space and a single-layer violet tint, pinned rows sort first
  (newest activity first) and never retire with the finished-Session window,
  and unpin re-derives the row from its original end time. The card never reads
  or writes the native sidebar pin list; blank/archived/subagent/unknown ids are
  ignored. The restored Host feature and its tests are part of this tree.
- **Row "…" menu (new)** — every top-level row (the current rainbow row
  included) keeps its time visible at rest and carries a "…" trigger in the
  48 px time slot. Row hover or keyboard `focus-within` hides the time and shows
  the trigger; the swap **stays while the row's menu is open**
  (`data-menu-open`), and leaving the row restores the time. The trigger paints
  the ordinary soft hover background (the same paint the New session control
  uses) and a keyboard `focus-visible` ring; only the **rainbow row** suppresses
  the background, with the same `brightness(1.2)` lift as the New session / pin /
  Continue controls. Subagent rows have no trigger. The trigger opens the card's **own popup** (`data-psd-menu`) built
  from
  `ctx.contextMenus.resolve({ kind: 'session', value: { sessionId, displayTitle } })`:
  Rename, Fork, Copy Session ID, Show in Finder, and Archive keep their native
  behavior and labels, the **Pin/Unpin contribution is filtered out** (the pin
  button owns pinning), and the popup shows the native labels with a compact
  local glyph for each action but **no native shortcut hints**. It is a 224 px card-styled surface (theme tokens),
  supports arrow/Home/End navigation (skipping disabled items), closes on
  Escape / outside pointer press / scroll / resize, and shows a loading
  placeholder while the contributions resolve. The swap is desktop
  hover/focus driven.
- **Pending-interaction notices (new)** — client-only derivation from
  `props.useSessionStatus` / `SessionStatus.pendingInteraction` for
  `question`, `plan-review`, and `approval` in Sessions other than the one open
  in the main view (blank, subagent, and archived Sessions filtered out). A
  fixed 320 px stack renders beside the card (prefers the right edge, flips to
  the left edge, clamps to an 8 px viewport inset; re-measured on resize,
  scroll, sidebar expansion, and card height), newest activity first, up to 3
  cards plus a "+N more" line. Each card shows the kind glyph/label, the
  Session title, the first question text (or reason/tool-name fallback), and a
  "{count} questions" line for multi-question batches. Clicking opens that
  Session — preview only, the native composer card remains the answering
  surface — and a notice disappears on the next render when the Session becomes
  current, the interaction settles, or it is archived. No Host route, no extra
  sidebar DOM, styles in the feature's existing `<style>` block; one notice per
  Session.
- **Docs / tests updated to this truth** — `docs/dynamic-workspaces.md`
  (restored `Pinned Sessions` plus new `Row actions` and
  `Pending interaction notices`, limits, manual checks), `docs/architecture.md`
  (session-pins Host document/route/store, client-only menu/notice surfaces),
  `docs/limitations.md` (card-pin `$DSH_HOME` sharing, custom popup with local
  glyphs but no shortcut hints, preview-only notices), `docs/overview.md`,
  `README.md`, `CHANGELOG.md`;
  `test/browser/sidebar.e2e.mjs` keeps the restored `--pin` scenarios and
  route/cache/DOM probes; full-mode `b2-3` now also asserts the uniform
  time→"…" highlight swap (time visible at rest is covered by the at-rest
  geometry probe; hover hides the time and shows the trigger; the trigger keeps
  the ordinary soft hover paint (the rainbow row suppresses it); leaving restores
  the time; subagent rows have none), and
  `--pin` `r3-10` asserts the current rainbow row at rest (time visible, trigger
  hidden), its hover swap, and its hover-free suppression in the atmosphere
  control list; `test/browser/README.md` documents the new row-menu/notice
  surfaces and their evidence.

Automated gates (measured by the Lead on this tree, 2026-11-15):

- `npm test`: **311/311 pass**, 0 fail, **17 test files** — includes the 15
  restored Host `test/session-pins.test.js` cases, the 12 restored
  `test/dynamic-workspaces-pin.test.js` card-pin cases, the new
  `test/dynamic-workspaces-panel.test.js` notice/placement cases, and the
  update-check suites.
- `npm run check`: **PASS — 22 modules, 17 test files**;
  `docs links ok: 21 Markdown files`;
  `release-notes: ok (0.1.0; 6 highlight(s), 6 English)`; `npm pack` OK
  (entryCount 85).
- `node --check test/browser/sidebar.e2e.mjs`: pass.

Live row-menu probes (Lead, real running GUI + throwaway headless Chrome):
**16/16 checks** plus a focused action probe, 0 page errors — at rest the time is
visible and the "…"
trigger opacity-hidden but focusable; on row hover the time hides, the trigger
shows, and the
restored title-left pin slot animates in (button visible); the trigger keeps the
ordinary soft hover paint (the rainbow row leaves it transparent); the
card-owned popup opens, keeps the
time/trigger swap while open, and lists Rename / Fork session / Copy Session
ID / Show in Finder / Archive session with **no Pin/Unpin entry**; Escape
closes it and leaving the row restores the time; a second real click on the
trigger toggles the menu closed; a keyboard probe moved focus with ArrowDown
(Rename → Fork session) and closed the popup on Tab, returning focus to the
trigger (the trigger is opacity-hidden but focusable, and key handling only runs
while focus is inside the popup). The focused action probe opened the menu and
clicked **Copy Session ID**: the spy on `navigator.clipboard.writeText` recorded
the Session id, the menu closed, and focus returned to the `…` trigger. The
current rainbow row follows the same rule and keeps its rainbow.

Historical notice-component probe (Lead, on the pre-review-fix build, real GUI
with a test-hook seam that mounted `DwPendingNotices` with synthetic notices —
question / plan / approval plus a 2-question batch and a 2-card overflow):
**13/13 checks**, 0 page exceptions/console errors — stack rendered at 320 px
with three ordered cards, Session titles, headlines, the "2 questions" meta
line, the "+2 more" overflow line, kind glyphs, and a card click reporting
`session-plan`. That probe is **historical, not reproducible on this tree**: the
review removed the test-only mount seam as dead code and changed the container
role from `status` to `region` (so assistive tech is not re-announced on every
re-render). Rendering of the current component is covered by code review plus
the derivation tests.

**Evidence gap (honest):** no real pending question/approval was triggered in
the running GUI, so the end-to-end
`SessionStatus.pendingInteraction` → auto-show/auto-hide path is covered only by
unit tests (`dwPendingNotices`, current/archived filters) and code review; the
live notice probe used **synthetic** data, and placement was verified in unit
logic rather than against a live moving sidebar. The row-menu probe is live
real-DOM/real-popup evidence but is a Lead throwaway probe, not part of the
committed E2E suite: the committed suite asserts the uniform time↔"…" highlight
swap and its no-hover-background behavior (full-mode `b2-3`, `--pin` `r3-10`)
but not the popup action list or the absent Pin entry; the Pin filtering is
documented from the source and the live probe. The restored `--pin` E2E
scenarios/probes were not part of the recorded gate list above.

## 2026-11-15 — Sidebar width persistence + atmosphere flicker fix (`sidebar-width-persistence`)

Branch `sidebar-width-persistence` (based on `feat/dynamic-workspaces` @
`ca71885`). Two changes: the left sidebar's dragged width is now a durable,
Host-owned preference synced across paired browsers
(`src/features/sidebar-width/` plus a new `#region feature: sidebar width` in
`src/client.js`), and the Dynamic Workspaces rainbow-atmosphere renderer
repaints synchronously after a real backing-store resize (and once at mount),
which fixes the rainbow flicker while the sidebar handle is dragged. Docs: new
[sidebar-width.md](sidebar-width.md); `README.md`, `docs/overview.md`,
`docs/architecture.md`, `docs/limitations.md`, `docs/dynamic-workspaces.md`, and
`CHANGELOG.md` updated in the same round.

### Environment (2026-11-15)

- Node **v24.22.3**; headless Chrome **157.0.8103.79**; viewport **1728×900**;
  throwaway `--user-data-dir`; one harness at a time; GUI token redacted.
- Injected/served client: `src/client.js` md5
  **`7fff81b238fab5bea798c833ec0e9984`** (1,223,099 chars / 1,228,290 bytes).

### Automated gates (local, 2026-11-15)

- `npm test`: **337 tests, 337 passed, 0 failed** — including the new
  `test/sidebar-width.test.js` (**17/17**, Host store + route) and
  `test/sidebar-width-client.test.js` (**9/9**, browser seam helpers, including
  the collapse→reopen restore decision).
- `npm run check`: **exit 0** — syntax, package manifest, docs links, the full
  test suite, the release-notes gate, and `npm pack --dry-run`
  (`entryCount` **88**).
- `node scripts/check-docs-links.mjs`: **ok, 22 Markdown files**.

### Live acceptance — `node test/browser/sidebar.e2e.mjs --layout`

Exit **0**; **PASS 11 / SKIP 1 / FAIL 0**; **0 page errors**; **0 real network
failures**; **9.3 s**. Log:
`.tmp-work/sidebar-width/e2e/layout-acceptance-final.log`. The mode forces
`prefers-reduced-motion: no-preference` (the pre-fix renderer already repainted
synchronously under reduced motion, so the oracle must run the animated renderer),
opens the running GUI in a throwaway headless Chrome, injects this worktree's
client, drives the native sidebar handle with real CDP pointer input, and never
creates or types into a Session.

- `smoke-1..4` **PASS** — pipeline: injected client evaluated in the live page,
  card mounted, the current Session left untouched (0 transcript messages,
  0-char draft; no Session created), 1728×900 screenshot round-trip.
- `lw-1` **PASS** — drag handle 8 px wide at x=280; sidebar column 280 px
  (grid `280px 1448px 0px`).
- `lw-2` **PASS** — live atmosphere canvases on the current Workspace/Session
  rows: workspace 258×34 painted≈32450, session 258×32 painted≈32477, animated.
- `lw-3` **PASS (flicker oracle)** — real CDP drag 280→320 px (+40 px over
  10 steps); the selected oracle canvas is an animated, running current-row
  canvas; canvas element identity stable in all 10 samples; **9 per-step +
  20 in-frame backing-store resizes** observed; **0 blank bitmap samples**
  (0/10 per-step, 0/22 in-frame).
- `lw-4` **PASS** — post-drag cache
  `{"version":1,"sidebarWidth":320,"pending":true}`; seam `attached=true`,
  `storeWidth=320`, `desiredWidth=320`.
- `lw-5` **PASS** — a page reload restores 320 px and the seam re-attaches
  (`storeWidth=320`).
- `lw-6` **SKIP** — `GET /api/power-suite.sidebar-width` returned **404** (the
  running Host process predates the merged plugin). The row is the explicit
  "Host route loads after the DSH Web service restart" SKIP; the
  sidebar-width route probes were classified as expected rather than real
  network failures, and the per-origin browser cache is authoritative until the
  restart (covered by `lw-4`/`lw-5`).
- `lw-8` **PASS** — collapse through the shell's own toggle then reopen through
  the shell's own control: the collapsed rail settles on hover and the reopen is
  a real pointer click; the width returns to the stored **320 px** instead of the
  native 280 px default and the cache is not overwritten with 280.
- `lw-7` **PASS** — cleanup dragged 320→280 px (pre-run 280 px); the Host route
  is absent so no Host document was written; residual report has 0 issues.

### Negative control and smoke regression (2026-11-15)

- The same `--layout` mode against the fixed client with **only the synchronous
  resize repaint reverted** (`.tmp-work/sidebar-width/e2e/client-no-fix.js`)
  makes `lw-3` **FAIL** on blank bitmap samples (drag steps 1, 8 and 9 for both
  canvases; **PASS 10 / SKIP 1 / FAIL 1**, exit 1) while every feature row stays
  green — the flicker oracle discriminates the missing synchronous resize
  repaint, and not the rest of the feature.
- `node test/browser/sidebar.e2e.mjs --smoke`: **exit 0**, **4/4 PASS**, 0 page
  errors, **2.2 s**.

### Review-fix hardening (same round)

An independent review round found no blocker/major issues; the shipped code
carries the resulting hardening: a local-write **generation guard** (Host
answers older than the newest drag/write are discarded instead of rolling the
live width back or confirming an unconfirmed write), an **8 s timeout** on every
sync fetch (a stalled request cannot wedge the sync flags), and a three-frame
confirming self-check that marks an incompatible layout-store seat **unreachable
(inert)** while skipping the folded-landscape centered presentation; the
collapse→reopen restore got a pure decision + unit test (`lw-8`).

### Evidence limits (state honestly)

- The `lw-6` 200 branch — Host document round-trip, second fresh-profile
  cross-device adoption, and the Host-restore step — is implemented and covered
  by the Node store/route tests, but **not exercised live**: the running Host
  route answers 404 until the DSH Web service restarts to load the new Host
  half. A post-restart re-run is the remaining acceptance step.
- The flicker oracle samples per drag step plus a post-registration
  `ResizeObserver` in the same resize task; it does not inspect every animation
  frame (the negative control shows the sampling still discriminates).
- One throwaway Chrome profile per run; no second real device was paired. The
  shell's narrow-viewport rail/drawer behavior is documented from
  `@deepseek-ai/dsh-client-ui-layout@0.2.2-rc.1` and the client code, not from a
  live narrow-viewport run.
## 2026-11-15 — Interrupted-state consistency (card + stale-running native rows, `interrupted-state-fix`)

Branch `interrupted-state-fix` (based on `feat/dynamic-workspaces` @ `ca71885`).
Fixes the user-reported inconsistency after a turn ended with `Connection
error.`: the **Running & recent** card gated the interrupted mark on the shell's
combined running flag, so a Session whose own turn stopped on a model-provider
`TRANSPORT`/`TIMEOUT` failure while its delegated subagent children were still
running stayed in the running group with no mark or Continue; and a native
sidebar row the shell still rendered as running showed the amber badge but no
hover Continue CTA. The Host interruption record is now the single authority for
the mark. The incident was a provider transport failure recorded in `turn/end`,
**not** a DSH Web service restart — the service was healthy throughout. Docs:
[interrupted-sessions.md](interrupted-sessions.md),
[limitations.md](limitations.md), and `CHANGELOG.md` updated in the same round.

### Environment (2026-11-15)

- Node **v24.22.3**; headless Chrome **157.0.8103.79**; viewport **1728×900**;
  throwaway `--user-data-dir`; GUI token redacted.
- Fixed client `src/client.js` md5 **`926ef1bde9a8abee966bf91b46482616`**
  (1,193,131 chars / 1,198,316 bytes); pre-fix negative-control client md5
  **`d90e20fb70930094ee3dca6467663c76`**.

### Automated gates (local, 2026-11-15)

- `npm test`: **316 tests, 316 passed, 0 failed** — 311 baseline plus the new
  `test/interrupted-state.test.js` (**5/5**: the record-only
  `interruptedIndicatorActive` rule, including the post-Continue `running: true`
  phase, non-ready records, and the inert production path).
- `npm run check`: **exit 0** (`entryCount` 85).
- `node scripts/check-docs-links.mjs`: ok, **21 Markdown files**.

### Live acceptance — `node test/browser/sidebar.e2e.mjs --interrupted`

Exit **0**; **PASS 9 / SKIP 1 / FAIL 0**; **0 page errors**; **0 real network
failures**; **5.1 s**. Log:
`.tmp-work/interrupted-state/e2e/interrupted-acceptance-final2.log`. The
mode injects this worktree's client into the running GUI and seeds controlled
Host interruption records through the plugin's documented test seam
(`__POWER_SUITE_TEST_HOOKS__.interruptedSessions`); it never provokes a real
provider failure, creates a Session, or sends a continuation, and clears every
seeded record in `finally`.

- `smoke-1..4` **PASS** — pipeline: injected client evaluated in the live page,
  card mounted, the current Session left untouched (0 transcript messages,
  0-char draft; no Session created), 1728×900 screenshot round-trip.
- `iw-net` **PASS** — CDP Network domain enabled; same-origin API/document
  failures are counted (the interrupted route must answer 200).
- `iw-1` **PASS** — a card row the derivation renders as running
  (`data-state=running`, combined running) with a controlled
  `{interrupted:true, running:false}` record shows the amber `.psd-interrupted`
  glyph ("Task did not finish", rgb(245, 158, 11)), the
  `data-actions="continue+new"` Continue action
  (`.psd-continue-slot`/`.psd-continue-inline`), and time "now" — a relative
  last-activity label, not a running duration.
- `iw-2` **PASS** — native stale-running row ("Running / 1 subagent running",
  time "1h") shows the amber badge (1 badge + 1 dynamic decoration) and a real
  CDP pointer hover reveals the Continue slot at 22 px, opacity 1,
  pointer-events auto, with a 22×22 "Continue the unfinished task" button. The
  button was never clicked (no real continuation).
- `iw-3` **PASS** — composer play state for the controlled interrupted current
  Session: `html[data-power-suite-interrupted=true]`, "Continue the unfinished
  task" enabled, 16×16 play mask.
- `iw-4` **PASS** — clearing the controlled records restores the card, native
  rows and composer (no interrupted marker/badge/injected slot left; HTML
  marker removed; composer shell glyph restored).
- `iw-5` **SKIP** — no Session the card/native sidebar rendered was
  interrupted-idle in the live data state (12 visible Sessions checked against
  `GET /api/power-suite.interrupted`); the consistency assert path is
  implemented and the controlled `iw-1`/`iw-2` rows cover the fix.
- Cleanup: 2 controlled records cleared, 0 residual records/markers, 0 issues.

### Negative control (2026-11-15)

The same `--interrupted` mode against a pre-fix client copy
(`.tmp-work/interrupted-state/e2e/client-prefix.js`, md5 `d90e20fb…`) exits **1**
and **FAILs exactly `iw-1` and `iw-2`** — the running card row never shows the
amber mark/Continue/relative time (8 s timeout; it kept `state=running`,
`actions=new`, time "8s") and the native stale-running row never gets the badge
or injected Continue slot — while `iw-3`/`iw-4` PASS and `iw-5` SKIPs
(**PASS 7 / SKIP 1 / FAIL 2**, 0 page errors, 0 real network failures,
**20.0 s**, log
`.tmp-work/interrupted-state/e2e/interrupted-negative-control-final2.log`). The
two rows are therefore discriminating, not vacuous.

### Smoke regression

`node test/browser/sidebar.e2e.mjs --smoke`: **4/4 PASS**, 0 page errors,
**2.1 s** (log `.tmp-work/interrupted-state/e2e/smoke-regression-2026-11-15.log`).

### Evidence limits (state honestly)

- `iw-5` is a **SKIP**: no real interrupted-idle Session was rendered during the
  run, so the reported scenario was reproduced with controlled records through
  the documented test seam rather than by provoking a live provider failure. The
  user's original failure was a provider `TRANSPORT`/`TIMEOUT` `turn/end`; no
  DSH Web restart was involved.
- The mode asserts rendered state only: it never clicks the Continue CTA and
  never sends a continuation, so the Host `session-busy` rejection of a
  duplicate Continue is covered by the existing Host route tests, not by this
  live run.
- One throwaway Chrome profile per run; no second device and no real
  interrupted provider failure were exercised.

### Merged-build confirmation (`feat/dynamic-workspaces` @ merge of `sidebar-width-persistence` + `interrupted-state-fix`)

The two feature branches were merged into `feat/dynamic-workspaces` with the
conflicts resolved by keeping both feature documentation sections and both live
E2E modes in `test/browser/sidebar.e2e.mjs` (a single shared smoke check covers
`--layout` and `--interrupted`; the CDP Network oracle and the summary output
cover both). Merged tree: `npm test` **343/343 pass**, `npm run check`
**exit 0**, docs links **22 files ok**, merged `src/client.js` md5
**`c91e97be04aef561d7c267e9092b0f2f`** (1,229,656 chars / 1,234,847 bytes).
Re-run on the merged client: `--layout` **PASS 11 / SKIP 1 / FAIL 0**,
`--interrupted` **PASS 9 / SKIP 1 / FAIL 0**, `--smoke` **4/4 PASS**, 0 page
errors and 0 real network failures in every run (logs under
`.tmp-work/merge-verify/`).

**Post-restart confirmation (2026-11-16, after `~/.local/bin/dsh-web restart`).**
The service came back with a new PID (14820, port 3080 owned, unauthenticated
root 401), the Host route answered
`GET /api/power-suite.sidebar-width` → `200 {"version":1,"sidebarWidth":420}`
(the running page had seeded the document at boot), and all live modes were
re-run on the merged client: `--layout` **PASS 12 / SKIP 0 / FAIL 0** — the
former `lw-6` SKIP is now a real PASS: Host document round-trip at the dragged
380 px, a second fresh `--user-data-dir` profile adopted 380 px with
`probe().attached:true`, cleanup restored the Host document to the pre-run
420 px; `--interrupted` **PASS 9 / SKIP 1 / FAIL 0**; `--smoke` **4/4 PASS**;
every run 0 page errors and 0 real network failures (logs under
`.tmp-work/post-restart/`).

## 2026-11-16 — Row "…" menu = native shared context-menu popup (`row-menu-native-popup`)

Branch `row-menu-native-popup` (based on `feat/dynamic-workspaces` @ `ba7517b`;
feature commit `d74d6f5`, review fixes `14c0cfb`, plus the E2E commit). The card
row "…" menu used to be a custom popup — its own card-styled surface, a local
Remix icon map, no native shortcut hints and its own keyboard handling — so it
did not match the native DSH Session row menu. It now opens the shell's **native
shared context-menu popup** through a plugin-owned captured-target kind
(`powerSuiteSession`): a registered contribution resolves the native `session`
target, filters only the Pin/Unpin entry (the card's title-left pin button
remains the pin owner) and hands the popup delegating actions that copy every
native presentation field and run the nested native `select`, so the shell
supplies material, placement, keyed icons, live shortcut hints, keyboard focus,
Escape/outside dismissal, submenus and the Archive footer. The custom
`DwSessionMenu`, its `.psd-menu*` styles and its local glyph map are deleted.
Docs: [dynamic-workspaces.md](dynamic-workspaces.md),
[architecture.md](architecture.md), [overview.md](overview.md),
[limitations.md](limitations.md), `README.md` and `CHANGELOG.md` updated in the
same round.

### Environment (2026-11-16)

- Node **v24.22.3**; headless Chrome **157.0.8103.79**; viewport **1728×900**;
  throwaway `--user-data-dir`; GUI token redacted.
- Fixed client `src/client.js` md5 **`2b700ff6db6f8ba500a8e5feadd4079b`**
  (1,226,770 chars / 1,231,955 bytes, 24,774 lines); pre-change control
  `client-prefix.js` md5 **`c91e97be04aef561d7c267e9092b0f2f`** (the merged
  parent client).

### Automated gates (local, 2026-11-16)

- `npm test`: **360 tests, 360 passed, 0 failed** — 343 baseline plus the new
  `test/row-menu.test.js` (**17/17**: Pin/Unpin filtering by id suffix and by
  native icon key, verbatim presentation-field copying incl.
  `commandId`/`icon`/`disabled`/`danger`/`separatorBefore`/`afterContent`, nested
  children mapped recursively, delegated `select` with the original namespaced
  id, abort/dispose handling, the bounded 800 ms ready wait with published-view
  fallback, and the inert production seam).
- `npm run check`: **exit 0**.
- `node scripts/check-docs-links.mjs`: ok, **22 Markdown files**.

### Live acceptance — `node test/browser/sidebar.e2e.mjs --row-menu`

Exit **0**; **PASS 8 / SKIP 0 / FAIL 0**; **0 page errors**; **0 real network
failures**; **16.9 s**. Log:
`.tmp-work/row-menu/e2e/row-menu-acceptance-2026-11-16.log`. The mode injects
this worktree's client into the running GUI, drives both menus with real CDP
pointer input, never creates or types into a Session, and never clicks an action
item (Escape only); the `finally` cleanup dismisses anything it opened.

- `smoke-1..4` **PASS** — pipeline: injected client evaluated in the live page,
  card mounted, the restored current Session left untouched (0 transcript
  messages, 0-char draft; no Session created), 1728×900 screenshot round-trip.
- `rm-net` **PASS** — CDP Network domain enabled; same-origin API/document
  failures are counted.
- `rm-1` **PASS** — the native DSH Session row menu ("优化 APP 的 SSH Key 登录体验")
  is captured as the shared popup: `[data-menu-material="translucent"]`,
  `role="menu"`, surface class
  `_surface_1w4el_1 _list_1p5el_7 _scrollable_1p5el_19 _portal_1p5el_46`, six
  items (`Pin session`, Rename, Fork session, Copy Session ID, Show in Finder,
  Archive session), shortcut hints `Rename[⌥⌘G]`, `Fork session[⇧⌘F]`,
  `Archive session[⌥⌘A]`, two separators and the Archive footer.
- `rm-2` **PASS** — our `.psd-run-more` menu opens the same shared surface:
  identical class list, `role="menu"` and computed material (translucent backing
  `rgba(48, 49, 54, 0.64)` with `blur(40px) saturate(1.5)`, 16 px radius,
  identical border/shadow/padding), **5 items = the native 6 minus the Pin/Unpin
  entry** (the captured entry was `Pin session` because the sampled row was
  unpinned; `Show in Finder` kept), equal `aria-keyshortcuts`/rendered `kbd`
  hints, equal icon SVG markup for every shared action, 34 px item height /
  13 px font, equal footer class/labels/separator, `data-menu-open="true"` with
  the time↔"…" swap while open, and Escape dismisses after the native ~80 ms
  exit animation with focus restored to `.psd-run-more`. Screenshots and
  comparison JSON under `.tmp-work/row-menu/e2e/`.
- `rm-3` **PASS** — opening the menu from the second card row replaces the first:
  exactly one shared popup remains, `data-menu-open` follows the active row, and
  Escape dismisses.
- Cleanup: popup dismissed, 0 `[role="menu"]` surfaces, 0 `.psd-menu` custom
  surfaces, no row left marked open, 0 issues; no action item was clicked in any
  step.

### Negative control (2026-11-16)

The same `--row-menu` mode against the pre-change client copy
(`.tmp-work/row-menu/e2e/client-prefix.js`, md5 `c91e97be…`) exits **1**:
`rm-1` PASS, **`rm-2` FAIL** — "no `[data-menu-material]` native shared surface;
legacy custom `.psd-menu` surface present (1); no keyboard-shortcut hints
rendered in the card menu; icon SVG markup differs for Rename, Fork session,
Copy Session ID, Show in Finder, Archive session" — and `rm-3` is an explicit
**SKIP** (not the native popup, so replacement semantics do not apply);
**PASS 6 / SKIP 1 / FAIL 1**, 0 page errors, 0 real network failures, **14.3 s**
(log `.tmp-work/row-menu/e2e/row-menu-negative-control-final.log`). The
native-popup oracle is discriminating.

### Evidence limits (state honestly)

- The native menu is captured from the installed shell build and compared
  native-vs-ours **in the same page/build** (surface class hashes are not
  hardcoded); a future shell restyle is expected to flow through rather than
  being asserted against a frozen recipe.
- The captured native first entry was `Pin session` because the sampled row was
  unpinned; the `Unpin session` variant is filtered by the same id-suffix and
  native-icon-key rule, covered by unit tests rather than by two live captures.
- No action item was clicked in any run (dismissal is Escape only), so action
  execution rests on the delegated native `select` and the unit tests. The card
  menu's only intentional difference from the native menu is the filtered
  Pin/Unpin entry.
- The action list is a snapshot at open time; the nested resolution waits at
  most 800 ms for native providers and falls back to already-published views,
  and its cleanup is deferred one microtask so a delegated selection still
  lands after the outer registry aborts. Full harness mode was not re-run in
  this round.

### Merged-build confirmation (2026-11-16, `row-menu-native-popup`)

The row-menu branch was fast-forwarded into `feat/dynamic-workspaces`
(`d74d6f5` feature, `21d2686` review fixes, `ace9e4b` E2E, `76f5032` docs).
Merged client `src/client.js` md5 **`2b700ff6db6f8ba500a8e5feadd4079b`**; merged
tree gates: `npm test` **360/360 pass**, `npm run check` **exit 0**, docs links
22 files. Re-run on the merged tree: `--row-menu` **PASS 8 / SKIP 0 / FAIL 0**
(0 page errors, 0 real network failures, 16.4 s) and `--smoke` **4/4 PASS**
(3.6 s), logs under `.tmp-work/row-menu-merged/`. This is a client-only change:
the page reload serves the new menu; no Host restart is needed (the
sidebar-width route stays live).

## 2026-11-16 — 0.1.0 release preparation (`release-0.1.0-prep`)

Branch `release-0.1.0-prep`, based on `feat/dynamic-workspaces` @ `9533dd8`.
Preparation only: **no tag, no publish, no claimed release date** — the approved
2026-11-15 policy keeps the release entries under `## [Unreleased]` (which names
`0.1.0`) through the tag and moves them to a dated section only after publishing.

### Prepared artifacts

- `package.json`: removed `"private": true`; publish-facing `description` and
  `keywords` refreshed for the whole suite; version stays **0.1.0** (the lockfile
  already records 0.1.0, no bump); name/repository/`publishConfig.access`/
  `files` (including `release-notes`)/`check:release-notes` unchanged.
- `locale/en.json` + `locale/zh.json`: plugin display metadata description now
  covers the shipped feature set.
- `release-notes/0.1.0.md` + `.en.md`: Highlights rewritten to **6 user-facing
  bullets** covering every shipped feature — Dynamic Workspaces (incl. the
  native row menu) with sidebar width persistence/sync and the flicker fix,
  session artifacts + Quick Look, prompt history + draft attachments,
  interrupted-session recovery, UI element annotation, and the update notice;
  Details refreshed for the first-release framing.
- `README.md`: the status block now states the prepared state (package no longer
  `private`, notes committed) and the remaining tag conditions; the first-release
  highlights gained the sidebar-width item.
- `CHANGELOG.md`: intentionally unchanged (entries stay under `## [Unreleased]`,
  which the publish workflow accepts as the `0.1.0` record).

### Gates (local, 2026-11-16)

- `npm run check` → **exit 0** (syntax, manifest, docs links, **360/360** Node
  tests, release-notes gate, `pack:check` with `entryCount` **88**, 88 files).
  The packed byte total is intentionally not pinned here: this record itself
  ships under `docs/`, so its own size shifts the figure.
- `npm run check:docs-links` → **ok, 22 Markdown files**.
- `npm run check:release-notes` → **ok, 0.1.0, 6 Chinese + 6 English** Highlights.
- `node scripts/check-publish-manifest.mjs` → **ok** for
  `@zephinel/dsh-power-suite@0.1.0`.
- `git diff --check` → clean.
- Browser checks stay local (CI has no browser job): `sidebar.e2e.mjs --smoke`
  **4/4 PASS** (exit 0, 4.3 s) and `update-prompt.e2e.mjs` **21/21 checks
  passed** (exit 0), both with 0 page errors. The per-feature acceptance
  evidence recorded earlier on 2026-11-16 (`--layout`, `--interrupted`,
  `--row-menu`, negative controls, client md5 `2b700ff6…`) remains the current
  source evidence; this preparation changes no `src/` code.

### Independent review of the preparation

A read-only independent review of the preparation commit found **no blockers**
and four documentation nits, all fixed in the same commit: the plugin-page
settings clause was moved back under the Dynamic Workspaces bullet (it had been
stranded in the prompt-history bullet), the still-shipped Workspace
default-agent-preset submenu was restored to the first-release Highlights, the
self-referential packed byte figure was dropped from this record (it changes
with the record itself; `entryCount` 88 / 88 files is kept), and the README
status block now names the missing first push (no `origin` remote yet), not only
the green-CI requirement.

### Outstanding release preconditions (tag is blocked until these are resolved)

- The repository currently has **no git remote/upstream**; `main` is **303
  commits behind** `feat/dynamic-workspaces` (main `cf220d4`), and no CI run
  exists. The release procedure requires the released branch merged to `main`,
  `main` in sync with `origin/main`, and a green CI run before tagging.
- Explicit approval of the exact version (**0.1.0**) and the committed
  release-notes text is still required before `git tag -a v0.1.0` and the tag
  push.
- Next steps after approval: merge the prepared tree to `main`, add `origin`
  (`git@github.com:Zephinel/dsh-power-suite.git`) and push `main`, wait for green
  CI, then tag/publish; after publishing, move the `[Unreleased]` entries into
  `## [0.1.0] - <UTC date>` and record the workflow run, registry version,
  provenance, GitHub Release and tag-pinned notes URLs here.

## 2026-11-16 — README Bento rewrite + screenshot pipeline (`readme-bento`)

Branch `readme-bento`, based on `release-0.1.0-prep` @ `571de58`. Documentation
and image round only: [README.md](../README.md) is rewritten as a Bento landing
page and a new root `assets/` set is composed from **light-theme captures of a
temporary, isolated DSH instance** (the production GUI is never captured). No
`src/` behaviour, test contract or Host/Client surface changes.

### What changed

- `README.md` — English landing page: icon header, H1, three badges (npm
  version, MIT license, DSH 0.2.2), a one-line hook, an install/open example, a
  truthful `[!NOTE]` status block (0.1.0 prepared but not published; no git
  remote, no CI run), a table of contents covering every section, a demo-data
  note, and a `Read more` line with the per-feature docs link at the end of each
  feature section. The former feature table, Install (npm after the release /
  in-app Plugins page / local `link:` checkout), Quick start, Get the code,
  Prerequisites, Build/test/deploy, Documentation, Contributing and License
  sections are kept and re-ordered for the lifecycle.
- `assets/readme-overview.webp`, `assets/readme-artifacts.webp`,
  `assets/readme-composer.webp`, `assets/readme-annotation.webp` — four composed
  Bento grids on a **pale beige canvas** (`#f6f1e6`, warm-white `#fffdf8` tiles,
  18 px gutter, aspect-matched tiles, no letterboxing) built by
  `npm run build:readme-bento` (`scripts/build-readme-bento.mjs`) from
  `.tmp-work/readme-shots/raw/` captures. The composer image is now split as the
  user asked: the main chat window (answer + composer + prompt rail/search +
  hover preview) beside the settings view. `assets` stays in
  `package.json.files` so the npm README can load the images.
- `test/browser/sidebar.e2e.mjs` — two capture modes targeting an isolated
  instance: `--readme-chat` (real model task → composer-chat and the annotation
  workflow raws) and `--readme-dashboard` (Workspaces/card/hover/menus/
  interrupted/artifacts/settings raws), both light appearances forced, privacy
  masks + banned-pattern scans, demo stubs only.
- `docs/development.md` — pipeline section: isolated-instance protocol, the two
  capture modes, pale-beige frame, split composer group, teardown.
- `test/browser/README.md` — the two modes and their isolation/privacy contract.
- `CHANGELOG.md` — `### Documentation` bullet for the rewrite and pipeline.

### Environment (2026-11-16)

- Node **v24.22.3**, npm **11.19.1**, pnpm **12.14.0**, Chrome
  **157.0.8103.79**; captures at a 1728×900 CSS viewport, DPR 2.
- **Isolated instance**: `DSH_HOME=/tmp/ps-readme-home`,
  `dsh web --port 3199 --host 127.0.0.1 --no-open`, own sessions/workspaces and
  credentials copy, the checkout installed as a local `link:` bundle in its web
  profile. The token URL lives only in a `chmod 600` `/tmp` file (never printed,
  never written into the repo). The **production GUI was not used or touched**
  for this round; the temporary instance and its `/tmp` directories were removed
  after composition.
- **Demo data** (isolated home only): workspace `ps-readme-workspace` →
  `/private/tmp/ps-readme-workspace` with six demo Sessions — four short generic
  model turns (changelog entry, PR-review steps, release-checklist summary, typo
  commit message), one blank Session, and the archived task Session. The native
  add-workspace flow opens the browser File System Access directory picker and
  cannot be driven headlessly, so the planned three demo workspaces reduced to a
  single demo Workspace (recorded deviation).

### Composed assets (measured 2026-11-16)

Measured with `sips -g pixelWidth -g pixelHeight` and `stat`:

| Asset | Dimensions | Bytes | Sources (raw captures) |
|---|---|---|---|
| `assets/readme-overview.webp` | **1600×938** | 84,046 | 2×2 grid: `workspaces`, `card` (Running & recent panel), `row-menu`, `card-hover` |
| `assets/readme-artifacts.webp` | **1600×880** | 46,248 | `artifacts` (10 stubbed rows) + `artifacts-quicklook` + `artifacts-filter` |
| `assets/readme-composer.webp` | **1600×611** | 60,874 | `composer-chat` + `settings` |
| `assets/readme-annotation.webp` | **1600×1128** | 71,904 | `annotation-annotated` (real Running & recent panel annotated) |

The four files total **263,072 bytes**; the composer verifies the fixed 1600 px
width and each group's fixed height and fails loudly on a missing source. The
README alt text was checked against the composed images: overview = Workspaces
browser, the Running & recent panel, the native row menu and a row hover card
(statistics / token / context); artifacts = ten-row list + Quick Look + source
filter; composer = a demo chat window with the release-checklist answer and
composer beside the settings section; annotation = the Running & recent panel
annotated with compact numbered marks and the rail requirement texts.

### Capture and composition commands (recorded runs)

- `node test/browser/sidebar.e2e.mjs --readme-chat --url "$(cat /tmp/ps-readme-home-url.txt)"`
  → **PASS 1 / SKIP 0 / FAIL 0**, 0 page errors, **43.4 s**, exit 0. Real task:
  prompt “Write a short release checklist for a web app: five steps, one risk,
  and one practical tip.”; the user message appeared on attempt 1 (`Stop
  generating` submit state, draft cleared), the answer settled at 1322 transcript
  chars / 1 turn / 1 step / 161 tok/s. Raw captures: `composer-chat.png`
  2920×1800 (open search card “release”, hover full-text preview) and, after a
  final annotation re-shoot at **1728×1200 CSS** (wider ~460 px sidebar,
  `annotation-annotated.png` / `annotation-inserted.png` **3456×2400**), the
  **Running & recent panel** annotated with three real records: panel header
  (`.psd-panel-toggle`, “Running & recent 4”), a top recent row
  (`button[aria-label^="Open "]`), and the panel disclosure chevron
  (`.psd-panel-chevron`); requirement texts “Make this header collapse the whole
  panel and keep the running count visible.”, “Show the elapsed time on the
  right and keep the status dot for running rows.”, “Make this chevron collapse
  the panel to just the header row.”; all three rail textareas are visible in
  the capture. The task Session was archived through the native row “…” menu
  afterwards; **no injected-card or travel fallback was used**.
- `node test/browser/sidebar.e2e.mjs --readme-dashboard --url "$(cat /tmp/ps-readme-home-url.txt)"`
  → **PASS 12 / SKIP 0 / FAIL 0**, 0 page errors, **40.6 s**, exit 0. Ten raws
  (after the final padding fixes): `workspaces` 752×630, `card` 736×432,
  `card-hover` 1456×1010, `row-menu` 954×550, `interrupted-row` 720×116,
  `interrupted-composer` 1858×260, `artifacts` 1554×1392 (10 rows),
  `artifacts-quicklook` 1188×768, `artifacts-filter` 456×312, `settings`
  1288×994. Light appearance forced via
  CDP; all sidebar/card/prompt text masked to allowlisted demo strings, the
  transcript hidden where it would enter a crop, and every capture's roots,
  clip region and page scanned for `/Users/`, the user name, URLs, `token=`, the
  checkout path and CJK — **0 hits everywhere**.
- `npm run build:readme-bento` / `node scripts/build-readme-bento.mjs` →
  composes the four WebPs above (no network; Chrome only).

### Final gates (2026-11-16)

- `node scripts/check-docs-links.mjs` → **ok, 22 Markdown files**, exit 0.
- `npm run check` → **exit 0**: `check passed: 24 modules, 21 test files`;
  docs links ok; release-notes ok (0.1.0, 6 + 6); Node tests **360/360 passed**.
- `npm run pack:check` → exit 0, **`entryCount` 92 / 92 files**, including the
  four `assets/readme-*.webp` images.
- No product browser re-run was needed (no `src/` change). The previous
  dark-theme captures and production-derived raws remain only in the gitignored
  `.tmp-work/readme-shots/raw-production-previous/`; the readonly docs image set
  under `docs/assets/annotation-*.png` keeps its previously committed state.

### Evidence limits (state honestly)

- **Single demo Workspace.** The native add-workspace flow uses the browser File
  System Access directory picker, unreachable headlessly, so the isolated
  instance has one demo Workspace; the dashboard raws show no Inactive Projects
  rows and no pinned/running/child rows (the card is a fresh demo state). The
  interrupted poses use the documented test seam.
- **English only.** `README.md` stays the single English landing document; the
  captured GUI is English, matching the copy. A Chinese counterpart needs
  Chinese-UI captures and is out of scope.
- **Badge resolution.** The npm version badge points at the package, which is
  not published yet; it resolves after the 0.1.0 publish.
- **Raw captures stay out of git.** Only the four composed WebPs ship; the
  isolated instance's `/tmp` home and token file were removed after composition.
- **No CI run exists** for this branch (no remote); `npm run check` and the
  capture passes are local.

## 2026-11-17 — Pending notices bound to their Session rows (`pending-notice-align`)

Browser-half fix round for the dynamic-Workspaces pending-interaction notices.
No Host route, store or native-surface change.

### Cause and fix

- **The notices were a fixed stack.** One 320 px stack was positioned from the
  Running & recent card (`panel.right + 8`, top of the card) and every notice
  sat in that stack, so a notice could face a Session row at a completely
  different height — and, because the anchor was card-relative, the stack
  crossed the sidebar boundary over the conversation.
- **Each notice is now bound to its own Session row.** A row element is resolved
  per notice (card row `[data-psd-session]` first, native Workspaces row
  `[data-row-key="session:<id>"]` as fallback) and the notice is fixed at that
  row's top edge with its left edge flush against the sidebar column's right
  boundary (the same anchor as the Session info card, with the 8 px viewport
  clamp). The layout is recomputed on scroll/resize/sidebar and card size
  changes, so the notice follows the row while the sidebar scrolls.
- **Auto-reveal.** When the row is outside its scroll container's visible band,
  `dwNoticeRevealRow` scrolls the nearest vertical scroller just enough to
  centre it (one-frame re-measure) before placing the notice; it does not fight
  a later deliberate user scroll. The fallback stack position is kept only when
  the row cannot be found in the DOM at all.
- **Hover transparency.** `.psd-notice:hover` replaced the card surface with the
  translucent `--dsw-alias-interactive-bg-hover` (measured
  `rgba(38, 49, 72, 0.06)`), so the page text behind the card showed through
  while hovering. The notice now reuses the **Session info card surface** it was
  meant to mirror — `background: var(--dsw-hovercard-bg, #2c2c2e)`, the static
  bluish label palette, 16 px radius and 12/16 px padding, and the same
  light-theme override group as `.psd-hovercard` — with no hover background
  rule at all, exactly like the info card (only pointer cursor and focus ring
  differ).

### Verification

- `node --check src/client.js` → OK.
- `node --test test/dynamic-workspaces-panel.test.js` → **7/7 pass**, including
  per-row placement (row top → notice top, sidebar anchor → left, bottom/top
  clamps, no-anchor fallback) and the CSS contract that hover keeps the opaque
  layer.
- `npm test` → **364/364 pass**; `npm run check` → exit 0; docs links ok
  (23 Markdown files); pack entryCount 93.
- **End-to-end live probe** (throwaway Chrome against the running GUI; token
  redacted; the production GUI was read-only). No real Session was waiting on an
  interaction, so the probe first picked a real card-row Session id, then
  reloaded with a probe-only client whose `dwPendingNotices` returns one fixture
  notice for that id — the **real `DwPendingNotices` renderer** then drew it:
  - `sidebarRight 420`, notice `left 420` (flush), row `top 272`, notice
    `top 272` (**same height as its Session row**, 0 px delta), one notice card;
  - hover: `backgroundColor rgb(255, 255, 255)` → **alpha 1**, `backgroundImage
    none` (the same info-card surface before and after hover; no page text
    bleed-through);
  - auto-reveal helper through the same code path: synthetic scroller 160 px
    tall with the row 600 px down → `dwNoticeRevealRow` returned true,
    `scrollTop 0 → 474`, row top moved 608 → 134 (centred in the scroller);
  - two-notice probe on two adjacent card rows: first notice `top 272` = its
    row `top 272`, second row `top 310` but its notice is pushed to `top 362`
    (272 + 84 + 6) so the cards do not overlap; the second card's own top would
    have overlapped the first by 27 px. Unit test
    `dwNoticeStackCards` pins this, including the viewport clamp.
  - Screenshot `.tmp-work/pending-notice/row-bound/notices-row-bound.png`
    (gitignored).
- Structural test evidence: the card row elements now carry `data-psd-session`
  so the binding does not depend on titles/order; the native fallback uses the
  existing `data-row-key="session:<id>"`.

### Limits

- The live probe used a probe-only fixture notice because no real Session was
  waiting at probe time; the renderer, positioning effect, hover styles and
  reveal helper are the production ones. Auto-reveal was proven through the
  helper with a synthetic scroller (no naturally scrolled-out Session row was
  available in the current demo state).
- If a row is not mounted at all (collapsed card and folded/archived native
  tree), the stack keeps the card-relative fallback; the next row mount
  re-binds it.
- Notices never open or answer a Session by themselves; clicking still opens
  the Session and the native composer card remains the answering surface.
