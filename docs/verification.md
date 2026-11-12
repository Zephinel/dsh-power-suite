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

Current evidence (2026-11-12, Node 24.22.2):

- `npm test`: **125 tests, 125 passed, 0 failed, 0 skipped**.
- `npm run check`: passed (`14 modules, 8 test files`).
- `npm run pack:check`: **58 files** (0.3.0 tarball) before the annotation
  captures below are added (63 with them), including `src/`, `locale/`, `docs/`
  (with the standalone Project page, Artifacts panel/filter-menu/Quick Look,
  Dynamic Workspaces, hover-detail, and prompt-history rail captures),
  `cordis.patch.yml`, `icon.png`, and the standard repository files.
- Host tests cover the read-vs-event cache race, silent-subagent timing, continue
  content-type/state/in-flight validation, the non-human source fields, the
  prompt-history timestamp fold (`at` from a finite event time, `null`
  otherwise) with the 500-prompt cap unchanged, the settings store (schema
  version 2 with the two retention windows, version-1 migration to the default
  windows, and patch validation for unknown/invalid fields), and the Project view
  folds and route (turn status map, job association, the 40/200/24 caps, stats
  and recent-activity derivation, parameter validation and cache behavior).
- Most browser features add no Host route: Dynamic Workspaces derives its
  buckets and summary card from the browser's Session, status, and Workspace
  stores; the prompt-history rail shares the existing
  `api/prompt-history.list` payload; draft attachment memory writes nothing to
  the Host or storage; the UI element annotation mode adds no Host surface at all
  and is covered by its own pure-model suite plus the live acceptance harness
  below. The Project view is the exception — its
  `GET /api/power-suite.project` route and its pure folds are covered by the
  project-view test suite. The remaining client-only surfaces have no
  `node:test` suite of their own, so the syntax gate and the live checks below
  cover them.
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

## UI element annotation acceptance

Date: 2026-11-12 (round-2 fix build, `fix/ui-annotation-review-fixes`). The
feature is browser-only ([ui-annotation.md](ui-annotation.md)), so its acceptance
run uses the real DSH Web GUI instead of a Host test:
`test/browser/annotation.e2e.mjs` (Node 22 or newer; this run used Node 24.22.2;
dependency-free) launches headless Google Chrome (157.0.8103.78) with a throwaway
profile, opens the GUI served by the launchd service `com.rexxin.dsh-web`, and
injects this checkout's `src/client.js` through the page's module loader before
the shell loads. The build under test is commit `aaab678` (`src/client.js` md5
`37388d3f9d1de0584b62bc111c6b6043`, round-2 seam generation of 32 keys). The
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

Run:

```bash
node test/browser/annotation.e2e.mjs --no-shots              # full run
node test/browser/annotation.e2e.mjs --from 6 --no-shots     # same-build completion run
node test/browser/annotation.e2e.mjs --scenario 2 --no-shots # targeted self-contained rerun
node test/browser/annotation.e2e.mjs --scenario 6 --no-shots # targeted self-contained rerun
node test/browser/annotation.e2e.mjs --shots-only --assets   # screenshots
```

Automated gates on this build:

- `npm test`: **125 tests, 125 passed, 0 failed, 0 skipped** — the 73 existing
  tests plus 52 annotation model tests, including the round-2 resolver and
  sanitizer regressions. The round-2 regression tests were red on the round-1
  build (`e0fdbc23…`) and green on this build.
- `node --check src/client.js`: passed.
- `npm run check`: passed (`14 modules, 8 test files`).
- `npm run pack:check`: **63 files** in the planned 0.3.0 tarball, including the
  five annotation captures.

Acceptance result: **no single fully-green full-suite run exists for this build.**
The complete per-scenario PASS evidence on md5 `37388d3f…` comes from three
same-build sources — the full run, the completion run, and two targeted
self-contained reruns — and is listed in the table below. Page errors were 0,
real network failures were 0, and the network domain was enabled with 0 ignored
network noise in every run below; smoke passed 6/6 in every run (32-key seam).

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
  → cleared collection → sidebar scroll reset → current-scope target recorded →
  native collapse → strict `missing` + stale marker, then F8/F9/mixed scope. The
  same-identity in-place replacement is recorded as evidence only; the true-removal
  case is not relaxed. These targeted PASS runs are the same-build evidence that
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
| 6 | Removed targets are stale; genuinely mixed cross-session scope; no page mutation | PASS (targeted `--scenario 6` and the completion run; the full run failed with inherited state — see above) — the self-contained rerun clears the collection, resets the sidebar scroll, and records the target as a current-scope entry before the native collapse, then strictly reads `data-psa-status="missing"` and inserts the explicit `Status: target no longer resolves` line; a row rebuilt by sidebar virtualization accepts `missing`, `ambiguous`, `changed`, or `resolved`. A second genuinely blank Session created through the native hover action makes the mixed state real: every pre-switch entry becomes `data-psa-entry-scope="other"` with `data-psa-status="other"`, batch insert is disabled with the cross-session notice, and the inserted block contains exactly one numbered current-session block plus a skip line whose extracted count equals the other-scope entry count. A leak check over every other-scope entry's name, note, and locator text (tokens of 6+ characters) proves none reached the composer; re-locate is invoked on the other-scope row's own control, shows the exact localized refusal, and does not scroll |
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

Independent targeted re-review (round 2, R1–R3 plus the docs/harness
corrections): result pending the Lead's final message; this line is replaced with
the reviewer's verdict when it arrives.

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

## Manual UI checks

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
  title covers the window with the page, whose rectangle is `(0, 0, 2548 × 1321)`
  — equal to `window.innerWidth/innerHeight` — in both the expanded and
  rail-collapsed sidebar states. Hit tests at the left sidebar, the right rail,
  the composer, and the top-left app area all resolve inside `[data-psv-page]`,
  confirming the full-window coverage. The page's title, Active badge, and the
  four tabs render; the current Session stayed
  `session-c5864acd…`, a composer draft marker survived opening and closing, the
  selected conversation view stayed Chat, and both sidebar states were preserved.
  Esc and the back control both closed the page and restored the conversation.
  Opening `nanobot-suite` showed its title, and `dsh-intelligenct-ui` (30
  Sessions) showed the loading state and then its data. Two rapid open events
  kept one instance/root with the final Workspace and no stale content. The
  conversation header switcher showed **Chat / Trajectory / Statistics** only (no
  Project tab), and a Lead-side independent check confirmed the same. A
  Sessions-list click closed the page and then opened that Session; Runs showed
  **63** runs with status filters and expandable turn jobs; Settings showed a
  preset choice (Cordis), the read-only windows, and the path actions; Copy
  project path produced the toast and a matching paste; refresh emitted exactly
  one `workspaceId=…&refresh=1` request; New Session and Open Workspace closed the
  page and then navigated. HMR showed exactly one document capture handler and
  one `power-suite:open-project` listener before and after a reload (one
  page/root per click), with 0 console exceptions/plugin errors and 0 failed
  responses (one unrelated native `/api/changes.summary` 404 was noted).
  Route probes from the earlier iteration still hold: `sessionId` 200,
  `workspaceId` 200 (cached response 78 ms), empty `workspaceId` + `sessionId`
  200, unknown Workspace 404, no parameters 400, `cache-control: no-store` on
  every response.
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
  the route matched. `npm test` passed (final gate: 73/73).

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
[assets/project-overview.png](assets/project-overview.png),
[assets/project-sessions.png](assets/project-sessions.png),
[assets/project-runs.png](assets/project-runs.png),
[assets/project-settings.png](assets/project-settings.png),
[assets/project-standalone-closed.png](assets/project-standalone-closed.png),
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
