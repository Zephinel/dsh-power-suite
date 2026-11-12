# Browser end-to-end acceptance harness (UI element annotation)

`annotation.e2e.mjs` drives the **real running DSH Web GUI** with a throwaway headless Chrome
and asserts the nine acceptance scenarios of the UI element annotation mode
(`/tmp/ps-annotation/CONTRACT.md` §4.2 and the review-round hardening spec H1–H13). It injects
this worktree's `src/client.js` into the live page without touching the installed checkout, the
profile or the launchd service.

```bash
node test/browser/annotation.e2e.mjs
```

## How it works

1. Resolves a token URL for the GUI (`~/.local/bin/dsh-web url --ip`, or `DSH_WEB_URL`).
2. Launches headless Chrome with a fresh `--user-data-dir` and `--remote-debugging-port=0`,
   connects over the Chrome DevTools Protocol with Node's global `WebSocket` (no packages).
3. Sets a 1728x900 CSS viewport (`Emulation.setDeviceMetricsOverride`).
4. Injects this worktree's `src/client.js` with `Page.addScriptToEvaluateOnNewDocument`: the
   script wraps `window.__ModuleLoader__.load` and replaces only the
   `@rexxin/dsh-power-suite` registration factory, so the real DSH shell loads our browser code
   with a real context, real session and real composer. It also sets
   `window.__POWER_SUITE_TEST_HOOKS__ = {}` (test seam) and asserts
   `window.__psInjectedFactoryRan === true` before doing anything else.
5. Verifies/creates one **genuinely blank** session (H2, exact predicate in `blankCheck`): the
   session that the GUI restores after load is only used when **all** of the following hold —
   a `[data-conversation-session]` root is present, `[data-conversation-region="composer"]` is
   present, the composer contains a Lexical `[data-lexical-editor="true"]`, a Chat view
   (`[data-conversation-region="chat"]`) is present, there are zero transcript
   messages/turns, the composer draft is empty, and there are no draft attachments. Otherwise
   the harness creates a fresh blank session through the native **"New session in
   &lt;workspace&gt;" hover action** (workspace rows, sidebar scrolling, then recent-session
   directory rows); if that is impossible it aborts with an explicit error. It never types or
   inserts into a non-blank session. The **non-blank auto-restore → create-fresh** branch is
   implemented but was **not exercised in this environment** (the restored draft was always
   blank); that path has no live-run evidence.
6. Runs the nine scenarios with **real CDP input** (`Input.dispatchMouseEvent`,
   `Input.dispatchKeyEvent`, modifier bitmask Alt=1 Ctrl=2 Meta=4 Shift=8; real wheel and
   `Input.insertText`). Nothing is synthesized for blocking / pass-through / drag assertions.
7. Collects page errors (`Runtime.exceptionThrown` + error-level `Runtime.consoleAPICalled`),
   real network/API failures (exact predicate below), and non-JS console/log errors with full
   detail. Prints a PASS/FAIL table, all session ids, the network predicate and the ignored-noise
   count, and exits non-zero when a scenario, a page error, a real network failure, the network
   domain itself, or a scenario row is missing.

   **Network failure predicate (H10, exact):** a failure counts only when the URL is
   **same-origin http(s)** (its origin equals the GUI URL origin) *and* either
     - a `Network.responseReceived` with status ≥ 400 for a `Document`/`Fetch`/`XHR` request,
       or for any path starting with `/api/` or `/plugins/`; or
     - a non-canceled `Network.loadingFailed` for `Fetch`/`XHR`/`Document`/`Script`/`Stylesheet`
       on such a same-origin URL.
   Everything else is ignored and counted as `ignored network noise`: third-party origins,
   `favicon.ico`, `chrome-extension:`, `data:` and `blob:` URLs, and same-origin static requests
   outside the DSH API/plugin routes. A failed `Network.enable` is **not swallowed**: it is
   reported as `network domain: NOT ENABLED — <error>`, records a `FAIL gate-network` row and
   fails the run (the oracle would otherwise be blind).

## Prerequisites

- Node.js **22 or newer** (uses the global `fetch`/`WebSocket`; verified on Node 24.22.2).
- Google Chrome at the standard macOS path, or `CHROME_BIN` pointing at the binary.
- The DSH Web GUI running from the existing launchd service
  (`com.rexxin.dsh-web`, https://192.168.5.210:3080). Do **not** restart or install anything
  for the harness.
- A token URL: leave `DSH_WEB_URL` unset and the harness asks `~/.local/bin/dsh-web url --ip`;
  a `DSH_WEB_URL` without `token=` is treated as unauthenticated and the harness falls back to
  the CLI. The token is always redacted from output.
- The worktree client (`src/client.js`) must contain the feature; the harness injects it
  read-only and never edits `src/**`.

## Options

```text
node test/browser/annotation.e2e.mjs                 full run: smoke + 9 scenarios + screenshots
node test/browser/annotation.e2e.mjs --smoke         pipeline + feature-surface smoke only
node test/browser/annotation.e2e.mjs --shots-only    five screenshots only (no scenario assertions)
node test/browser/annotation.e2e.mjs --assets        write screenshots to docs/assets instead of /tmp
node test/browser/annotation.e2e.mjs --client PATH   inject a different client.js (e.g. a baseline)
node test/browser/annotation.e2e.mjs --scenario 8    run exactly one scenario (validation: 1..9)
node test/browser/annotation.e2e.mjs --from 7        run scenarios 7-9
node test/browser/annotation.e2e.mjs --no-shots      skip screenshots
node test/browser/annotation.e2e.mjs --keep-open     leave Chrome running (prints pid/CDP/profile)
node test/browser/annotation.e2e.mjs --headful       show the browser window
```

Environment: `DSH_WEB_URL` (token URL override), `CHROME_BIN` (Chrome binary override).

Default screenshots are written to `<tmpdir>/psa-e2e-shots/`; use `--assets` (or copy the
reviewed files) to publish `docs/assets/annotation-idle.png`, `annotation-mode.png`,
`annotation-selection.png`, `annotation-collection.png`, `annotation-inserted.png`.

## Gate semantics (H1)

- `--smoke` is a pipeline-only mode, but it still fails (non-zero exit) when the injected client
  fails to load, does not expose the frozen 31-key test seam, or does not mount the annotation
  surface.
- `full` / `--shots-only` with a client that has no annotation feature: a **FAIL** row is
  recorded and the process exits non-zero. A feature-absent client can never produce a green
  run. Example proof: `node test/browser/annotation.e2e.mjs --client /tmp/ps-annotation/baseline-client.js`
  → `FAIL gate-feature`, exit 1.
- Invalid selections are argument errors: `--scenario 10`, `--from 10` and a missing value exit
  **2** with a message; they never run silently with zero scenarios.
- Every requested scenario must produce a result row; a missing row is recorded as FAIL.
- Exit code contract (N6): `0` only when every check passes; `1` for any scenario failure,
  page error, real network/API failure, missing scenario row, feature gate failure or harness
  fatal error; `2` only for usage/argument errors (`--scenario 10`, `--from 10`, missing value,
  `Network` setup failure is NOT a usage error and exits 1).

## Current evidence (round 2, final build)

Environment: worktree `src/client.js` md5 `37388d3f9d1de0584b62bc111c6b6043` (commit `aaab678`,
seam 32 keys incl. `resolveNodeCandidate`), Chrome 157.0.8103.78, Node v24.22.2, live GUI at
1728x900. One harness instance at a time; headless Chrome count 0 before/after every run.
Every log below is kept under `/tmp`.

### Per-scenario PASS evidence on this final build

| # | Evidence source | Result |
|---|-----------------|--------|
| smoke | every run | 6/6 PASS (seam 32 keys, rail under overlay, one launcher, prompt rail hidden, blank session) |
| 1 | full run `/tmp/psa-final-round2.log` | PASS (N1 post-activate stability poll passed, no retry needed) |
| 2 | targeted `--scenario 2 --no-shots` `/tmp/psa-target2.log` (11.4 s, exit 0) | PASS — S2 is now self-contained: mode off → native Plugins view → stable activation (same 2×500 ms predicate as S1) → Alt pass-through/contextmenu oracle |
| 3 | full run | PASS |
| 4 | full run | PASS |
| 5 | full run | PASS |
| 6 | targeted `--scenario 6 --no-shots` `/tmp/psa-target6.log` (49.4 s, exit 0) | PASS — S6 is now self-contained: mode off → conversation → stable activation → **collection cleared** → sidebar list scroll reset → target recorded and asserted present as a current-scope collection entry → native collapse → true-removal **`missing`** strictly enforced + stale marker; then F8/F9/mixed scope |
| 7 | full run (and completion run) | PASS |
| 8 | completion run `--from 6 --no-shots` `/tmp/psa-round2-from6.log` (61.0 s, exit 0) | PASS |
| 9 | completion run | PASS |

- **Single full-suite run** (`--no-shots`, 524.5 s, exit 1, `/tmp/psa-final-round2.log`):
  smoke 6/6; S1/S3/S4/S5/S7 PASS; S2 FAIL (observed before the pass-through assertion
  completed — the scenario did not first ensure a stable activation; fixed by making S2
  self-contained as above, then PASSed targeted); S6 FAIL (`changed` instead of `missing` while
  inheriting the previous scenarios' collection/virtualized sidebar state; fixed by the
  self-contained reset above, then PASSed targeted); S8 FAIL (`Input.dispatchMouseEvent` CDP
  timeout); S9 FAIL (cascade of S8). page errors **0**; real network failures **0**; network
  domain enabled; ignored network noise 0.
- **Same-build completion run** (`--from 6 --no-shots`, 61.0 s, exit 0,
  `/tmp/psa-round2-from6.log`): smoke 6/6; S6/S7/S8/S9 PASS; page errors 0; real network
  failures 0.
- **Targeted runs on the same build** (`--scenario 2`, `--scenario 6`, exit 0 each,
  `/tmp/psa-target2.log`, `/tmp/psa-target6.log`): both PASS with page errors 0 and real
  network failures 0. This is the evidence that the two full-run failures were harness state
  precision, not product behavior — re-run as self-contained scenarios on the same build.
- No single fully-green full-suite run exists for this build; the table above is the honest,
  complete per-scenario evidence on md5 `37388d3f…`.
- **H1 gate proofs** on this harness: `--client /tmp/ps-annotation/baseline-client.js
  --no-shots` → exit **1**, `FAIL gate-feature` (`PASS 4 / FAIL 12`); `--scenario 10 --no-shots`
  → exit **2** with the argument-range error.

### Screenshots (round-2 build, unchanged by the targeted runs)

One logged `node test/browser/annotation.e2e.mjs --shots-only --assets` run (42.0 s, exit 0,
log `/tmp/psa-shots-round2.log`), all capture assertions passing: `annotation-idle.png`
125075 B, `annotation-mode.png` 144859 B, `annotation-selection.png` 163687 B,
`annotation-collection.png` 161038 B, `annotation-inserted.png` 200244 B. Screenshot session:
`session-8e460d06-507a-4c6d-95c6-63f20882c6e4`.

### Sessions created/reused in the final round-2 runs

`session-5eec2763-0a91-460e-b559-08a8c3a98d13` (full run),
`session-8e460d06-507a-4c6d-95c6-63f20882c6e4` (completion run, targeted S2/S6, screenshots),
`session-1e273273-4316-46f5-84c8-199bfc0812a2` (completion run S7, targeted S6 session B).

## What is asserted

| # | Scenario | Oracle |
|---|----------|--------|
| smoke | Pipeline + feature surface | injection factory ran; frozen seam is pinned to the documented generation and count — **31 keys** on the round-1 seam, **32 keys** once the round-2 `resolveNodeCandidate` key is present (the harness requires exactly the matching count, always requires `textDigest`, and requires `resolveNodeCandidate` when the 32-key generation is detected); the rail is a descendant of `[data-shell-overlay]`; exactly one launcher; the annotation stylesheet hides the native prompt-history rail while active; blank session verified |
| 1 | Activate via a real launcher click; layout shrinks and the rail appears and stays; native New Session is blocked | activation polls `html[data-psa-active]` + `[data-psa-rail]`, then re-verifies the rail twice 500 ms apart (**N1**); if the rail disappears it exits, retries activation once, re-verifies, and otherwise fails with the live environment snapshot. Then: `frame[data-psa-frame]`, `padding-right` equals computed rail width (±2 px), inline grid untouched; rail is **right-anchored** (`rail.right == innerWidth ±2`, `rail.left == innerWidth - railWidth ±2`); blocked real click: 0 hits on the native control's own listeners, ≥1 `preventDefault`, session id / sidebar row count / view unchanged |
| 2 | Alt pass-through restores real native semantics; no-session notice; native context menu is not intercepted | Real Alt+click on New Session reaches the native handler and opens a conversation; `html[data-psa-passthrough]` only while held; the rail shows `[data-psa-no-session]` while no session is mounted and hides it once one is; hover outline absent while the modifier is held (F10); contextmenu oracle via `Event.prototype.preventDefault` log plus a document-start bubble-phase recorder: blocked right-click is prevented, never reaches the bubble listener, Alt+right-click appears exactly once with `defaultPrevented === false` |
| 3 | Wheel scrolling and browser shortcuts are untouched; marquee; Esc ladder | native scrollable scrollTop changes and 0 wheel `preventDefault` (conversation scroll region when scrollable, otherwise the sidebar list — stated in the evidence); Meta+K / Control+L / plain letters delivered with `defaultPrevented === false`; Shift+drag draws `[data-psa-box]` and selects ≥1 candidate; F6 Esc ladder: first Esc ends note editing and keeps the popover + typed note, second Esc clears the selection, third Esc leaves the mode |
| 4 | Shift+click multi-select, collection add/update/note/remove | 3 multi outlines + rail "3 elements selected"; add-all creates 3 entries; re-add flips Add → Update, count unchanged + "updated" feedback; inline rail note edit; remove one |
| 5 | Batch insert order, existing draft preserved, never sent, composer focused | typed draft stays verbatim before the header; **one ordered numbered block per collection entry** (`1.`, `2.`, … in order, block count == entry count), every entry name non-empty, each entry's note appears inside its own block (or the empty-note placeholder); no message/transcript/DOM change, session id unchanged, composer focused |
| 6 | Removed targets are stale; genuinely mixed cross-session scope; no page mutation | true target unmounted by a native sidebar collapse → **`data-psa-status="missing"` strictly required** + a `Status: target no longer resolves` line in the inserted text; a rebuilt row after the sidebar expand accepts `missing | ambiguous | changed | resolved` (the sidebar list is virtualized; this is an explicit-invalidation tolerance, described below). A **second genuinely blank session** is created through the native hover action; every pre-switch entry is `data-psa-entry-scope="other"` + `data-psa-status="other"`, batch insert is disabled, cross-session notice shown; after adding one current-session entry, batch insert contains exactly one numbered block with its note, the skip line reports the **exact count** of other-session annotations (EN `(N annotation(s) … skipped)` or ZH `另有 N 条…`), and a leak check over every other-scope entry's **name, note and locator text** proves none of it enters the composer; re-locate is invoked on an **other-scope row's** own control, must show the explicit localized refusal (`This annotation belongs to another session` / `这条标注来自其他会话`) and must not scroll the canvas (N4); native element count outside the composer unchanged |
| 7 | Exit cleans up completely and restores a pre-existing inline layout | a sentinel `padding-right: 13px` is set on the layout frame before activation; exit restores it exactly; a MutationObserver timeline must contain a record with `data-psa-active === null` while `data-psa-frame` is still present and the sentinel padding is restored (the reverse transition); the marker must then disappear within **up to 15 s** of polling (raised from 5 s only to tolerate a busy main thread; the disappearance is still required, never ignored); `--psa-rail-width` removed; inline grid equal to pre-mode; 0 overlay nodes; launcher exactly once and inactive; native New Session works again |
| 8 | Launcher drag/resize/scroll/reload geometry; interrupted gesture cleanup | F5: starting a launcher drag and leaving the mode with Esc neither toggles the mode nor persists the position and leaves no `data-psa-dragging`/box node; real mouse drags clamp with the 8 px margin (a drag retry after a CDP timeout happens only when the launcher position is verified unchanged); after the 1000x700 viewport override the launcher is polled until fully inside; a missing scrollable region is a FAIL; wheel scroll does not move the launcher; after reload the mode is off by default and the remembered position is restored |
| 9 | Collection view keeps the rail/frame geometry; exit restores the baseline | opening/closing the collection leaves frame padding and canvas width unchanged, rail stays in the right strip without a wide drawer; exit restores the pre-mode canvas width and inline grid |

Page errors must be **0** and real network/API failures must be **0** for the run to exit 0.
Non-JS console/log errors are printed with full detail for triage; the live GUI currently emits
benign DSH-internal telemetry WebSocket 403s (`ws://127.0.0.1:9230/ingest`) which are reported
but do not fail the run (they are not page errors or same-origin HTTP failures).

## Screenshots (H3/H12)

- Every capture is made with the **privacy guard applied and asserted**: CSS blur on the native
  sidebar column and conversation header, plus a blur/hide shield over the conversation content
  above the composer (the composer and the annotation rail/popover stay crisp). The capture
  helper refuses to shoot unless the guard state verifies and the session verifies blank (no
  transcript messages/turns, no attachments, empty draft — or, for the `inserted` capture, only
  the inserted structured block).
- Before the pass, the harness clears the annotation `localStorage` keys (`settings`,
  `launcher`, `rail-collapsed`), reloads, and verifies/creates a blank session, so the idle
  capture shows the real default bottom-right launcher position.
- Each capture asserts: 1728x900 viewport and PNG size; right-anchored rail when the mode is
  active; launcher does not overlap the rail/footer; the selection capture also asserts the
  popover is fully inside the viewport on all four edges; the idle capture asserts the default
  bottom-right launcher position.
- Provenance: the five final files are produced by a single logged `--shots-only --assets` run
  (log path `/tmp/psa-shots-round2.log`, see "Known limitations"); the capture assertions above
  gate every file in that run.

## Side effects and cleanup

- Every session the harness opens or creates is tracked once and printed with the reason it was
  touched (`created/reused sessions (N): <id> — <source>`), including the session reopened in
  scenario 7, the second blank session created in scenario 6, and the session used for the
  screenshots.
- Never sends a message, never changes DSH settings, never edits the profile or the installed
  checkout. A non-blank restored session is never used: the harness creates a blank one instead.
- Chrome is always terminated (`SIGTERM`, then `SIGKILL`) and the temporary profile directory is
  removed in a `finally` block, including on failures.

## Known limitations (documented, not product defects)

- **Screenshot provenance**: the five files in `docs/assets/annotation-*.png` are produced by one
  logged `node test/browser/annotation.e2e.mjs --shots-only --assets` run; its log is kept at
  `/tmp/psa-shots-round2.log` and the resulting byte sizes are recorded in the "Current evidence"
  section above. Screenshots are never captured by a failing scenario run.
- **Blank-session auto-restore branch**: the predicate requires session root + composer +
  Lexical editor + Chat view + 0 messages/turns + empty draft + no attachments. The branch that
  detects a *non-blank* auto-restored session and creates a fresh one is implemented but **not
  exercised in this environment** (the restored draft was always blank); no live evidence claims
  otherwise.

- **Native context menu visuals** are not observable in headless Chrome: the assertion is the
  event-level `preventDefault`/bubble oracle described above.
- **Single blank draft session per workspace**: this DSH build keeps one draft session at a
  time, so a blank-draft → blank-draft switch cannot be reached from the UI; scenario 6 creates
  a second *genuinely blank* session through the native "New session in &lt;workspace&gt;" hover
  action and then asserts the mixed current/other-session scope.
- **Wheel over the conversation**: a blank session has an empty, non-scrollable conversation, so
  the wheel assertion uses the nearest native scrollable region (the sidebar session list) and
  states that in the evidence; scenario 8 fails if no scrollable region exists at all.
- **Headless Emulation resize event**: headless Chrome occasionally swallows the native
  `resize` event for `Emulation.setDeviceMetricsOverride`. The harness polls the clamped launcher
  geometry, retries with a second real viewport change, and — only when the browser delivered
  zero native `resize` events — dispatches one synthetic `resize` event to exercise the product's
  resize path.
- **Environment-jitter tolerances (exact predicates, assertions NOT lowered)**: the harness
  tolerates known live-GUI jitter without weakening product oracles:
  - **N1 activation**: activation polls `html[data-psa-active]` + `[data-psa-rail]`, then
    re-verifies the rail twice 500 ms apart; if it disappears, the harness exits the mode, retries
    activation once, re-verifies, and otherwise fails with the live environment snapshot.
  - **N5 retries are postcondition-guarded, never blind**: `mouseMoved` dispatches may be resent
    (idempotent). Press/release/click gestures are retried **only** when the caller's
    postcondition proves the state did not change (launcher click → mode still off; exit click →
    mode still on; Shift+click → outline count not increased; drag → launcher position
    unchanged; marquee → selection still empty); otherwise no retry occurs and the scenario fails
    honestly. `Runtime.evaluate` retries once only on a CDP command timeout (page-side JS errors
    are never retried).
  - **S4**: 150 ms settle before each real Shift+click and a 450 ms inter-click gap (the S4
    assertion itself is unchanged: three outlines are required).
  - **S6**: the rebuilt row after sidebar collapse may be virtualized out of the rendered window;
    accepted statuses for that *rebuilt row only* are `missing | ambiguous | changed | resolved`.
    The true-removal case still requires `missing`.
  - **S7**: the reverse-transition marker must disappear within up to 15 s (polled), not 5 s;
    disappearance is still mandatory.
  - **Failure triage**: every scenario failure is reported with a live
    mode/passthrough/rail/panel/popover/launcher/session/viewport/framePadding snapshot.
- **Environmental failures were observed but are not attributed to the product or proven to be
  purely environmental**: in late full-suite attempts (same build) failures occurred *before*
  product assertions completed — a rail first-paint race in S1, `Runtime.evaluate` /
  `Input.dispatchMouseEvent` CDP timeouts in S4/S8, a virtualized sidebar row in S4, a rebuilt
  row status and a late marker removal in S6/S7 — with 0 page errors and 0 real network
  failures. Their cause is **not proven**; they are reported as observed harness/live-GUI
  timing effects with per-scenario same-build PASS evidence, not dismissed. A single green
  full-suite run was not achieved on any build.
  *Superseded historical evidence — round-1 build `e0fdbc23d0dcbbfce5d1292f64850071`
  (round-1 build, superseded; kept for history only):* S1-S5 in its 00:47 full run and S6-S9 in
  its same-build `--from 6` run (exit 0), smoke 6/6. This is **not** evidence for the current
  build — the authoritative per-scenario record for the round-2 build
  (`37388d3f9d1de0584b62bc111c6b6043`) is the "Current evidence (round 2, final build)" section
  above (full run + same-build completion run + targeted S2/S6 runs). H1 gate proofs on this
  harness: feature-absent client → exit 1 with `FAIL gate-feature` (`PASS 4 / FAIL 12`);
  `--scenario 10` / `--from 10` → exit 2 with an argument error.
- **Observed late-run instability (cause not established)**: see the "Environmental failures were
  observed…" bullet above; the harness keeps per-scenario evidence and does not retry more than
  the guarded retries described there.
- **Long-run renderer stalls (S8)**: after ~7 minutes of continuous automation the headless
  renderer can stop acknowledging `Input.dispatchMouseEvent`; the harness retries a drag once
  **only when the launcher position postcondition proves the gesture did not take effect**
  (N5) and otherwise reports a scenario timeout. Scenario 8/S9 pass on the same build when run
  in a short sequence (`--from 8`).
- **Zero-area picker behavior (F13)** is not directly synthesizable in the live GUI; it is
  covered by the pure-model tests where exposed.
- **Single device + language**: the E2E runs at 1728x900 on one DSH deployment in the active UI
  language; ZH copy is exercised by the unit tests, not end-to-end.
- **Ego-browser / other automation layers** may refuse clicks behind the annotation popover
  (`role="dialog"`); raw CDP input used here is unaffected. Dismiss the selection with Esc before
  clicking underlying page controls in other tools.

## Runtime

- Pipeline smoke: ~5 s.
- `--shots-only`: ~35 s.
- Full run (smoke + 9 scenarios + screenshots): ~8-10 min on the live GUI at 1728x900.

## Troubleshooting

- `dsh web authentication required`: the resolved URL had no token — unset `DSH_WEB_URL` or
  pass a token URL whose query contains `token=`.
- `Chrome did not expose a CDP port`: check `CHROME_BIN`, and that no other process is using the
  same temporary profile (each run uses a fresh one).
- A scenario reports a timeout on `Input.dispatchMouseEvent`: the live GUI may be busy; re-run,
  and use `--from 8` to re-verify the late scenarios on the same build. Keep only one harness
  instance running at a time.
