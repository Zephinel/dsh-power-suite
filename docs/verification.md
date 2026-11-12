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

- `npm test`: **106 tests, 106 passed, 0 failed**.
- `npm run check`: passed (`18 modules, 9 test files`).
- `npm run pack:check`: **72 files** (0.2.0 tarball), including `src/`,
  `locale/`, `docs/` (with the Project page/rail states/sidebar switch,
  activity-card actions/acknowledgement/ledger/current-ring states, Artifacts
  panel/filter-menu/Quick Look, Dynamic Workspaces, hover-detail, and
  prompt-history rail captures), `cordis.patch.yml`, `icon.png`, and the standard
  repository files.
- Host tests cover the read-vs-event cache race, silent-subagent timing, continue
  content-type/state/in-flight validation, the non-human source fields, the
  prompt-history timestamp fold (`at` from a finite event time, `null`
  otherwise) with the 500-prompt cap unchanged, the settings store (schema
  version 2 with the two retention windows, version-1 migration to the default
  windows, and patch validation for unknown/invalid fields), and the Project view
  folds and route (turn status map, job association, the canonical measured-turn
  rule, the 40/200/24 caps, stats and recent-activity derivation, parameter
  validation and 25 s cache behavior), the read-acks store/route (schema,
  sanitization, max-merge, 1000-entry cap, 415/413/400/500), and the
  event-sourced activity ledger (store max-merge/cap/atomic persistence,
  read-merge writes, flush/dispose durability including an in-flight write and
  repeated dispose, record→dispose→reload, 20 sequential lifecycles, allowlist
  event projection, one-time baseline, cold-load snapshot route).
- Host routes are covered by tests where they exist: Dynamic Workspaces'
  card state is browser-derived but Host-backed through the read-acks store/route
  and the session-activity ledger route (16 MiB document guard, allowlist event
  projection, cold-load snapshot), while the Project view's
  `GET /api/power-suite.project` route and its pure folds are covered by the
  project-view suite (turn status, fork closer, stats exclusion, cache
  identity/TTL). The prompt-history rail shares the existing
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
- Ledger durability and cold load were verified after a recompose: the first cold
  GET returned `200` with a **404-entry** ledger in ~**60 ms** (not `{}`), and
  the route and file counts agreed (file mode `600`, version `1`). A checkpoint
  `80769cd0…` = `1794466322463` survived dispose/recompose as route = file =
  **`1794466351365`** (≥ checkpoint, so the ≤750 ms debounce window was not
  lost); a later probe read route `1794466488144` / file `1794466475256`.
  `0c14a9e7…` (`1794263011213`) and `78f7a4a7…` (`1794418427299`) stayed stable
  through Host activity and recompose, while `442a0000…` advanced only with real
  events (`…6219743` → `…6306695` → `…6318019` → `…6413163`). Forcing an empty
  activity response left the card rows/panel unchanged (client empty-response
  guard), and HMR kept one acks GET + one activity GET per 32 s window, one
  panel/three rows, 0 exceptions/plugin console errors.
- The 10× gate run was clean: `npm test` **10/10 runs exited 0 with 106/106
  passing each**; `npm run check` **10/10 exited 0 with fail 0** (18 modules, 9
  test files); the final `npm run pack:check` was **72**.
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
[assets/project-overview.png](assets/project-overview.png),
[assets/project-sidebar-switch.png](assets/project-sidebar-switch.png),
[assets/project-standalone-closed.png](assets/project-standalone-closed.png),
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
[assets/project-page-rail-hidden.png](assets/project-page-rail-hidden.png),
[assets/project-page-rail-restored.png](assets/project-page-rail-restored.png),
[assets/artifacts-panel.png](assets/artifacts-panel.png),
[assets/artifacts-filter-menu.png](assets/artifacts-filter-menu.png),
[assets/artifacts-quicklook.png](assets/artifacts-quicklook.png),
[assets/dynamic-workspaces.png](assets/dynamic-workspaces.png),
[assets/dynamic-workspaces-hover.png](assets/dynamic-workspaces-hover.png),
[assets/prompt-history-preview.png](assets/prompt-history-preview.png),
[assets/prompt-history-search.png](assets/prompt-history-search.png), and
[assets/settings-page.png](assets/settings-page.png), embedded in their feature
references.
