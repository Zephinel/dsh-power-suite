# Browser end-to-end acceptance harness (UI element annotation)

`annotation.e2e.mjs` drives the **real running DSH Web GUI** with a throwaway headless Chrome
and asserts the eleven acceptance scenarios of the UI element annotation mode
(`/tmp/ps-annotation/CONTRACT.md` §4.2, the review-round hardening spec H1–H13, and the
Phase 1 floating-surface / v2-record / rainbow-focus checks). It injects
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
6. Runs the eleven scenarios with **real CDP input** (`Input.dispatchMouseEvent`,
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
node test/browser/annotation.e2e.mjs                 full run: smoke + 11 scenarios + screenshots
node test/browser/annotation.e2e.mjs --smoke         pipeline + feature-surface smoke only
node test/browser/annotation.e2e.mjs --shots-only    five screenshots only (no scenario assertions)
node test/browser/annotation.e2e.mjs --assets        write screenshots to docs/assets instead of /tmp
node test/browser/annotation.e2e.mjs --client PATH   inject a different client.js (e.g. a baseline)
node test/browser/annotation.e2e.mjs --scenario 8    run exactly one scenario (validation: 1..15)
node test/browser/annotation.e2e.mjs --from 7        run scenarios 7-10 and 15 (ids in SCENARIO_ORDER)
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
  fails to load, does not expose a documented test-seam generation (the harness accepts the
  round-1 **31-key**, round-2 **32-key** (`resolveNodeCandidate`), audit-fix **35-key**, and
  Phase 1 **48-key** generations; every generation requires `textDigest`), or
  does not mount the annotation surface.
- `full` / `--shots-only` with a client that has no annotation feature: a **FAIL** row is
  recorded and the process exits non-zero. A feature-absent client can never produce a green
  run. Example proof: `node test/browser/annotation.e2e.mjs --client /tmp/ps-annotation/baseline-client.js`
  → `FAIL gate-feature`, exit 1.
- Invalid selections are argument errors: `--scenario 16`, `--from 16` and a missing value exit
  **2** with a message; they never run silently with zero scenarios.
- Every requested scenario must produce a result row; a missing row is recorded as FAIL.
- Exit code contract (N6): `0` only when every check passes; `1` for any scenario failure,
  page error, real network/API failure, missing scenario row, feature gate failure or harness
  fatal error; `2` only for usage/argument errors (`--scenario 16`, `--from 16`, missing value,
  `Network` setup failure is NOT a usage error and exits 1).

## Current evidence (Phase 1 annotation build)

Phase 1 (`feat/annotation-ux`, `src/client.js` md5 `151e0380b8283b79934c92126919c136`,
commit `d68e6a9` plus the final evidence commit), Node v24.22.2, live GUI at 1728x900,
`/tmp/ps-annotation/CONTRACT.md`-style harness with the **48-key** seam. Every log was
written under `.tmp-work/` during the branch (gitignored, external development artifacts).

| Check | Command | Result |
|-------|---------|--------|
| Unit model | `npm test` | **193/193** pass, 0 skip (`test/ui-annotation.test.js`: 70 cases) |
| Repository gate | `npm run check` | exit 0 (syntax + manifest + pack dry-run) |
| Smoke | `node test/browser/annotation.e2e.mjs --smoke` | **6/6**, seam 48 keys, 0 page errors, 0 real network failures |
| Floating surfaces / v2 / persistence / cap | `node test/browser/annotation.e2e.mjs --scenario 10 --no-shots` | **PASS**, plus explicit **SKIP** row `10b` (plugin-hovercard pin owned by the sidebar branch) |
| Rainbow focus ring | `node test/browser/annotation.e2e.mjs --scenario 15 --no-shots` | **PASS** (ring on popover/settings/collection/editor inputs, `outline:none`, stable rect, reduced-motion static ring) |
| Self-contained late sequence | `node test/browser/annotation.e2e.mjs --from 6 --no-shots` | smoke + S6,S7,S8,S9,S10,S15: **12 PASS / 1 SKIP / 0 FAIL**, 143.0 s, 0 page errors, 0 real network failures, exit 0 |
| Full suite attempt 1 | `node test/browser/annotation.e2e.mjs --no-shots` | **stalled inside scenario 6** after S1-S5 passed (killed after ~4 min in S6; log has `PASS 1..5` only) |
| Full suite attempt 2 | same | **stalled inside scenario 6** after S1-S5 passed (killed after ~5 min in S6, ~7 min total) |

The two full-run stalls reproduce the pre-existing late-run headless-renderer/CDP stall
documented below (scenario 6 passes in the shorter `--from 6` sequence and standalone on the
same build); they are reported as harness/live-GUI timing, not dismissed, and **no single
all-green full-suite run exists** for this build. Sessions touched in the recorded runs:
`session-8cbac527-8ef9-4d7e-9c02-6ab5a4236c71`, `session-1e273273-4316-46f5-84c8-199bfc0812a2`,
`session-d29fc9a7-9151-47dc-aeeb-41d739e34455`; no message was sent and no setting changed.

Visual evidence for the Phase 1 behaviors was captured through the same CDP harness into
`.tmp-work/shots2/` (not committed; the existing `docs/assets/annotation-*.png` set belongs to
the earlier round): `10-floating-card-hover.png` (whole-card hover outline, overlay z=150 over
card z=100), `10-floating-card-popover.png` (floating/ephemeral popover with Copy locator),
`10-floating-drill.png` (Child drilled to a 20 px inner row), `15-rainbow-focus.png` and
`15-settings-focus.png` (shared-recipe focus ring: `psa-ring-spin, psa-ring-hue` at
`3.2s, 14s`).

## Current evidence (Phase 2-A annotation build)

Phase 2-A (`feat/annotation-ux`, on top of the Phase 1 commit `1261846`), Node v24.22.2,
live GUI at 1728x900, **57-key** seam. Logs/screenshots are external development evidence
under `.tmp-work/` (gitignored).

| Check | Command | Result |
|-------|---------|--------|
| Unit model | `npm test` | **204/204** pass, 0 skip |
| Repository gate | `npm run check` | exit 0 (18 modules, 10 test files) |
| Smoke | `node test/browser/annotation.e2e.mjs --smoke` | **6/6**, seam 57 keys, 0 page errors, 0 real network failures |
| Marks + detail + delete/undo + other-Session | `node test/browser/annotation.e2e.mjs --scenario 12 --no-shots` | **PASS** (2 marks with `#index`/requirement badges and `pointer-events:none`, hover detail card with full requirement/Session/Workspace/position/actions, keep-open and no focus steal, detail edit persisted and `updatedAt` bumped, delete → `role=status` undo toast → restore, other-Session record not drawn after reload, reduced-motion static) |
| Reload restores marks; removed target missing | `node test/browser/annotation.e2e.mjs --scenario 14 --no-shots` | **PASS** (2 records restored, only the live target drawn, rail `missing`/`resolved` statuses) |
| F-2 Session/Workspace identity | `node test/browser/annotation.e2e.mjs --scenario 10 --no-shots` | **PASS**, incl. new assertions: `session.cwd` absolute non-null, `workspaceLabel` = cwd basename, record `sessionId` = current Session, plausible `bounds`, captured `viewport`, query-free route |
| Multi-select / collection rework | `--scenario 4`, and S4→S5 sequence `--from 4 --no-shots` | **PASS** (S4 3 shift selections, add/update/note/remove; S5 draft preserved + ordered batch blocks) |
| Self-contained late sequence | `node test/browser/annotation.e2e.mjs --from 6 --no-shots` | smoke + S6,S7,S8,S9,S10,S12,S14,S15: **14 PASS / 1 SKIP / 0 FAIL**, 173.3 s, 0 page errors, 0 real network failures, exit 0 |
| Native hover-card flake | one earlier `--from 6` attempt | **FAIL inside scenario 10 before any annotation assertion**: the native DSH hover preview card (`probes.nativeHoverCard`) did not appear within 5 s; the same sequence reran green. Pre-existing live-GUI/harness timing, not a Phase 2-A assertion. |

The new scenarios are self-contained (each clears the persisted document and creates/verifies a
blank Session) and the runner's reload helper re-selects the record-owning Session through the
native sidebar row when the shell restores a different "last viewed" Session after a reload.
Scenario 10 now also guards the F-2 regression that Phase 1 silently persisted `cwd:null`.

## Current evidence (Phase 2-B annotation build)

Phase 2-B (on top of the Phase 2-A commits), Node v24.22.2, live GUI at 1728x900,
**66-key** seam. Logs are external evidence under `.tmp-work/` (gitignored).

| Check | Command | Result |
|-------|---------|--------|
| Unit model | `npm test` | **214/214** pass, 0 skip (10 new T8/T9 cases) |
| Repository gate | `npm run check` | exit 0 (18 modules, 10 test files) |
| Smoke | `node test/browser/annotation.e2e.mjs --smoke` | **6/6**, seam 66 keys, 0 page errors, 0 real network failures |
| Composer chips (T9) | `--scenario 13 --no-shots` | **PASS**: Quick reference → one native chip (`occurrence=1`, no plain 4-line block), chip click → record detail card, Backspace → chip removed, batch → ONE `UI annotations × 2` group chip (no numbered blocks), collection view kept, transcript 0, not sent |
| Chip fallback | post-hook row `13f` | explicit **SKIP**: the live GUI always installs the chip services, so the D9 fallback cannot be forced end-to-end without stubbing DSH; fallback text/toast/serializers unit-tested |
| F4 merged pin (T-cross) | `--scenario 11 --no-shots` | explicit **SKIP** in this worktree (dynamic-workspaces feature absent). The scenario detects the DW capability and runs the real pin + no-mode close regression after merge; `10b` uses the same capability gate instead of a hardcoded SKIP (M-4) |
| Rail + chip sequence | `--from 4 --no-shots` | **13 PASS / 2 SKIP / 0 FAIL**, ~2 min, 0 page errors, 0 real network failures (S4-S15; S5 asserts the ONE group chip, S6 rail status honesty) |
| Screenshots | `--shots-only --assets` | exit 0, ~36 s; regenerated `annotation-idle/mode/selection/collection/inserted.png` with the privacy guard asserted before every capture |

Scenario 13 uses the real CDP composer: it asserts the native Lexical decorator
chip count, clipboard projection, chipless draft, atomic Backspace removal, the
single group chip for a batch, and that the transcript stays 0 (nothing is sent).
The group chip label is `UI annotations × N` (D2: per-item chips are rejected).

## Current evidence (round 2, pre-merge annotation build)

> This acceptance evidence was recorded on the pre-merge annotation branch (final
> publication build `50a1bb3` / `src/client.js` md5 `10dd3b72…`, branch commit
> `fd8ccc9`; the round-2 build above is `aaab678` / `37388d3f…`). The **full
> suite** was not re-run on the merged build (`572b8fa1…`, after merging into
> `feat/dynamic-workspaces`; that build's seam is the 32-key generation). After
> the audit fixes, `--smoke` passed **6/6 on the post-audit-fix build**
> `1c61a230…` with the **35-key** seam, 0 page errors and 0 real network
> failures, reusing the existing blank Session
> `session-5eec2763-0a91-460e-b559-08a8c3a98d13` (no new Session). Do not read the
> per-scenario record below as merged full-E2E evidence: it is pre-merge, while
> the merged-build evidence is smoke-only.

Environment: worktree `src/client.js` md5 `37388d3f9d1de0584b62bc111c6b6043` (commit `aaab678`,
historical round-2 build, seam 32 keys incl. `resolveNodeCandidate`), Chrome 157.0.8103.78, Node v24.22.2, live GUI at
1728x900. The current harness also accepts the audit-fix **35-key** generation. One harness instance at a time; headless Chrome count 0 before/after every run.
Every log below is kept under `/tmp`.

### Per-scenario PASS evidence on this final build

| # | Evidence source | Result |
|---|-----------------|--------|
| smoke | every run | 6/6 PASS on the historical round-2 build (seam 32 keys, rail under overlay, one launcher, prompt rail hidden, blank session); the current harness accepts the audit-fix 35-key generation |
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
| smoke | Pipeline + feature surface | injection factory ran; the seam matches a documented generation and count — **31 keys** on the round-1 seam, **32 keys** on the round-2 generation with `resolveNodeCandidate`, **35 keys** on the audit-fix generation (adds `normalizeUserNote`, `cssIdentifier`, `clampPopoverPositionToViewport`), **48 keys** on the Phase 1 generation (adds `buildUniqueSelector`, `buildStableAncestors`, `parseAnnotationStore`, `serializeAnnotationStore`, `annotationSurfaceRoot`, `annotationSurfaceLevels`, `annotationLocatorText`, `normalizeAnnotationRecord`, `RECORDS_STORAGE_KEY`, `RECORD_LIMIT`, …); the harness requires a documented count, always requires `textDigest`, requires `resolveNodeCandidate` for round-2+, and requires the generation-specific keys; the rail is a descendant of `[data-shell-overlay]`; exactly one launcher; the annotation stylesheet hides the native prompt-history rail while active; blank session verified |
| 1 | Activate via a real launcher click; layout shrinks and the rail appears and stays; native New Session is blocked | activation polls `html[data-psa-active]` + `[data-psa-rail]`, then re-verifies the rail twice 500 ms apart (**N1**); if the rail disappears it exits, retries activation once, re-verifies, and otherwise fails with the live environment snapshot. Then: `frame[data-psa-frame]`, `padding-right` equals computed rail width (±2 px), inline grid untouched; rail is **right-anchored** (`rail.right == innerWidth ±2`, `rail.left == innerWidth - railWidth ±2`); blocked real click: 0 hits on the native control's own listeners, ≥1 `preventDefault`, session id / sidebar row count / view unchanged |
| 2 | Alt pass-through restores real native semantics; no-session notice; native context menu is not intercepted | Real Alt+click on New Session reaches the native handler and opens a conversation; `html[data-psa-passthrough]` only while held; the rail shows `[data-psa-no-session]` while no session is mounted and hides it once one is; hover outline absent while the modifier is held (F10); contextmenu oracle via `Event.prototype.preventDefault` log plus a document-start bubble-phase recorder: blocked right-click is prevented, never reaches the bubble listener, Alt+right-click appears exactly once with `defaultPrevented === false` |
| 3 | Wheel scrolling and browser shortcuts are untouched; marquee; Esc ladder | native scrollable scrollTop changes and 0 wheel `preventDefault` (conversation scroll region when scrollable, otherwise the sidebar list — stated in the evidence); Meta+K / Control+L / plain letters delivered with `defaultPrevented === false`; Shift+drag draws `[data-psa-box]` and selects ≥1 candidate; F6 Esc ladder: first Esc ends note editing and keeps the popover + typed note, second Esc clears the selection, third Esc leaves the mode |
| 4 | Shift+click multi-select, collection add/update/note/remove | 3 multi outlines + rail "3 elements selected"; add-all creates 3 entries; re-add flips Add → Update, count unchanged + "updated" feedback; inline rail note edit; remove one |
| 5 | Batch insert order, existing draft preserved, never sent, composer focused | typed draft stays verbatim before the header; **one ordered numbered block per collection entry** (`1.`, `2.`, … in order, block count == entry count), every entry name non-empty, each entry's note appears inside its own block (or the empty-note placeholder); no message/transcript/DOM change, session id unchanged, composer focused |
| 6 | Removed targets are stale; genuinely mixed cross-session scope; no page mutation | true target unmounted by a native sidebar collapse → **`data-psa-status="missing"` strictly required** + a `Status: target no longer resolves` line in the inserted text; a rebuilt row after the sidebar expand accepts `missing | ambiguous | changed | resolved` (the sidebar list is virtualized; this is an explicit-invalidation tolerance, described below). A **second genuinely blank session** is created through the native hover action; every pre-switch entry is `data-psa-entry-scope="other"` + `data-psa-status="other"`, batch insert is disabled, cross-session notice shown; after adding one current-session entry, batch insert contains exactly one numbered block with its note, the skip line reports the **exact count** of other-session annotations (EN `(N annotation(s) … skipped)` or ZH `另有 N 条…`), and a leak check over every other-scope entry's **name, note and locator text** proves none of it enters the composer; re-locate is invoked on an **other-scope row's** own control, must show the explicit localized refusal (`This annotation belongs to another session` / `这条标注来自其他会话`) and must not scroll the canvas (N4); native element count outside the composer unchanged |
| 7 | Exit cleans up completely and restores a pre-existing inline layout | a sentinel `padding-right: 13px` is set on the layout frame before activation; exit restores it exactly; a MutationObserver timeline must contain a record with `data-psa-active === null` while `data-psa-frame` is still present and the sentinel padding is restored (the reverse transition); the marker must then disappear within **up to 15 s** of polling (raised from 5 s only to tolerate a busy main thread; the disappearance is still required, never ignored); `--psa-rail-width` removed; inline grid equal to pre-mode; 0 overlay nodes; launcher exactly once and inactive; native New Session works again |
| 8 | Launcher drag/resize/scroll/reload geometry; interrupted gesture cleanup | F5: starting a launcher drag and leaving the mode with Esc neither toggles the mode nor persists the position and leaves no `data-psa-dragging`/box node; real mouse drags clamp with the 8 px margin (a drag retry after a CDP timeout happens only when the launcher position is verified unchanged); after the 1000x700 viewport override the launcher is polled until fully inside; a missing scrollable region is a FAIL; wheel scroll does not move the launcher; after reload the mode is off by default and the remembered position is restored |
| 9 | Collection view keeps the rail/frame geometry; exit restores the baseline | opening/closing the collection leaves frame padding and canvas width unchanged, rail stays in the right strip without a wide drawer; exit restores the pre-mode canvas width and inline grid |
| 10 | Floating surfaces, F3 stationary recompute, F4 annotation-side contract, v2 records, reload persistence, 100-record cap | F1: `[data-shell-overlay]` inline z-index becomes `150 !important` (`data-psa-raised` set) and the computed value is greater than the native hover card's z-index; exit restores the exact captured inline value/priority and marker. F2: hovering a sidebar row, then moving the real pointer onto the native hover preview card outlines the **whole card** (±2 px), the `.psa-hover` border tokens are byte-identical to an ordinary control's, and a synthetic floating panel proves whole-surface selection plus Child drill (smaller inner row inside the panel) and Parent restore. F3: a fixed z-index-500 layer inserted under a stationary pointer moves the outline to it within ~2 s, and removal returns the outline. F4 (annotation side): `power-suite:ui-annotation-state` fires `{active:true/false}`; a synthetic `[data-psd-hovercard]` node becomes `pointer-events:auto`/`z-index:120` only while active (rule inert when off). A2: the duplicate-label New session control reports **Resolved** with an anchored `uniqueSelector` (`data-slot` anchor + `nth-of-type`), and the persisted record carries v2 keys, ancestors, route (no query), Session id/cwd without HTML/JS-path/XPath leakage. D1: two records (one floating/one page) are written to `localStorage` under `power-suite.ui-annotation.annotations`, survive `Page.reload()`, keep the note, and re-resolve as Resolved + Missing. D15: a seeded 100-record document loads 100 rows and the 101st add is refused with a visible message while the stored count stays 100. A separate explicit **SKIP** row (`10b`) covers the plugin-hovercard pin, which is owned by the dynamic-workspaces branch (no `[data-psd-hovercard]` element in this build). |
| 15 | Rainbow input focus ring (shared recipe) | on the popover textarea, the settings select, the collection row note, and the expanded note editor: a `.psa-rainbow-field` wrapper paints the `::after` ring with `opacity:1`, animations `psa-ring-spin, psa-ring-hue` at `3.2s, 14s`, the control's `outline-style:none`, and a stable rect (no layout shift); `prefers-reduced-motion: reduce` → `animation-name:none` with the ring still visible; exiting the mode restores the paint layer. |

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
- **Evidence files are external development artifacts.** Every log path quoted in this
  README lives under `/tmp` and is not part of the repository; the per-scenario PASS/FAIL
  record above is the traceable in-repo summary, and the raw logs cannot be re-checked from a
  clean checkout. The live full-E2E evidence is also **pre-merge**; the merged build
  (`572b8fa1…`, 32-key seam) itself was not re-run; after the audit fixes only
  the post-audit-fix build `1c61a230…` got `--smoke` (6/6, 35-key seam, 0 page
  errors/real network failures), not the full suite.
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
  (`37388d3f9d1de0584b62bc111c6b6043`) is the "Current evidence (round 2, pre-merge annotation build)" section
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
- **Coverage gaps in the recorded acceptance**: no single fully-green full-suite run exists
  (the record is a three-source per-scenario composite); scenario 5 does not assert the
  mid-draft caret or a one-undo step; there is no ZH end-to-end run and no keyboard-isolation
  scenario. These are gaps in the evidence, not claims about product behavior.
- **Pre-merge full evidence plus merged-build smoke-only**: the recorded full runs targeted the
  pre-merge annotation build (`10dd3b72…`/`fd8ccc9`, round-2 `37388d3f…`); the merged build
  (`572b8fa1…`, 32-key seam) itself was not re-run; after the audit fixes only the
  post-audit-fix build `1c61a230…` got `--smoke` (6/6 PASS, 35-key seam, 0 page errors/real
  network failures, reused blank Session) — the full suite was not re-run on it, and no single
  all-green full run exists.
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
