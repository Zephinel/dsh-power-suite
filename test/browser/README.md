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

## Evidence scope (pre-merge branch builds)

> The Phase 1, Phase 2-A and Phase 2-B tables below are **pre-merge branch
> evidence** for `feat/annotation-ux`: seam 48/57/66/67/68 and `npm test`
> 193/204/214/217/219 counts were recorded on those branch builds. The merged-build acceptance record
> (Lead, after the final merge + verifier round 2) lives in
> [`docs/verification.md`](../../docs/verification.md); use that for the release
> verdict instead of these branch numbers.

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
**66-key** seam for the Phase 2-B build; the later inner-first surface-hover
follow-up bumps it to **67 keys**. Logs are external evidence under `.tmp-work/`
(gitignored).

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
The batch chip label is `UI annotations × N` (D2: per-item chips are rejected).
The `@` source renders no custom group header (`showGroupTitle: false`, because
the shell has no annotation menu title and the raw source name would leak); its
rows self-identify as `UI annotation · <element name>` with the requirement
excerpt as the description, so they are distinguishable in the mixed `@` list.

Skip semantics: `10b`/`11` are SKIP only when the **merged F4 pin contract** is
genuinely absent — the scenario behaviorally probes the DW-rendered sidebar rows
and skips only when no `[data-psd-hovercard]` marker can be produced (covering both
"no DW hovercard at all" and "legacy DW card without the merged marker"), with the
probe's exact reason in the SKIP text. When the marker IS produced but the
pin/select/no-mode-close check fails, scenario 11 retries once and then **FAILS**;
it is never masked as SKIP. `13f` (plain-text chip fallback) is SKIP because the
live GUI always installs the chip services; the fallback path is unit-tested.

## Post-merge follow-up evidence: leaf-first precise picking

| Check | Command | Result |
|-------|---------|--------|
| Unit model | `npm test` | **219/219** pass (new `annotationLeafPickIndex` cases: span/svg/path leaves, ineligible fallthrough, surface boundary, full-chain pickLevels wiring, composer exception) |
| Repository gate | `npm run check` | exit 0 |
| Smoke | `node test/browser/annotation.e2e.mjs --smoke` | **6/6**, seam **68** keys, 0 page errors |
| Leaf-first floating surface | `--scenario 10 --no-shots` | **PASS** — native card leaf 212×16 inside 244×92 card; dropdown-like panel leaves distinct: title 174×16, subtitle 174×13, time 43×13, token 53×13, chevron path 4×8 inside 340×170 panel; click leaf → leaf popover; Parent leaf→column→row→panel (3 steps), Child back; background/padding → whole surface |
| Regression sequence | `--from 4 --no-shots` | **17 PASS / 3 SKIP / 0 FAIL**, 0 page errors (S4-S15; SKIPs are the known cross-branch/env rows 10b/11/13f) |

Semantics: hover and click both target the DEEPEST eligible element under the
pointer (DevTools-inspect-like) — spans, inline SVG/path, titles, subtitles,
timestamps, counters and icons included; the walk only moves up for own UI,
structural tags, and zero-size/hidden nodes, and inside a floating surface it
never escapes the surface root. Parent/Child walk the full hovered ancestor chain
(Parent up to the surface root/page container, Child back to the deepest hovered
element); the whole surface is reachable via its background/padding or Parent.
Ordinary page picking is leaf-first too. Pseudo-element decorations and bare text
nodes fall back to their owning element; `pointer-events:none` targets fall back
to the nearest eligible ancestor; SVG path locators are structural and can report
an honest ambiguous/changed status.

Evidence clips: `PSA_SURFACE_EVIDENCE_DIR=<dir> --scenario 10 --no-shots` writes
`native-card-leaf-hover.png`, `native-card-whole-hover.png`,
`dropdown-leaves-panel.png`, `dropdown-subtitle-leaf-hover.png`,
`dropdown-parent-row-level.png`, `dropdown-panel-whole-hover.png`.

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

## Dynamic-Workspaces sidebar harness (`sidebar.e2e.mjs`), `--pin` and `--live` modes

`test/browser/sidebar.e2e.mjs` is the companion harness for the dynamic-Workspaces
sidebar surface ("Running & recent" card, workspace buckets, row hover card, plugin
chrome). It uses the same throwaway-headless-Chrome + token-URL + loader-swap injection
pipeline as `annotation.e2e.mjs` (this worktree's `src/client.js` is injected into the
real running GUI; the installed checkout, the user profile and the launchd service stay
untouched), drives the page with **real CDP input**, and prints the same PASS/FAIL table.

> **Pin design history (superseded rounds):** round 1 kept the card pin in a card-local
> localStorage document; round 2 briefly re-used the DSH native sidebar pin — the user
> rejected that (old project-organisation pins flooded the running panel, children
> disappeared, stale times appeared), so the **final** design is a card-owned pin shared
> through the suite's own Host route with a local cache/queue. The oracles below describe
> only the final design; the earlier evidence sections in `docs/verification.md` are
> marked superseded.

```text
node test/browser/sidebar.e2e.mjs                  full B1-B6/C2-C4/F4 run, screenshots into .tmp-work/sidebar-e2e/
node test/browser/sidebar.e2e.mjs --smoke          pipeline + blank-Session smoke only
node test/browser/sidebar.e2e.mjs --pin            pipeline smoke + R1/R2/R3 acceptance checks (card-owned pin)
node test/browser/sidebar.e2e.mjs --live           shipped-install check (NO client injection, read-only, two profiles)
node test/browser/sidebar.e2e.mjs --no-shots       no screenshots
node test/browser/sidebar.e2e.mjs --client PATH    inject a different client.js
node test/browser/sidebar.e2e.mjs --keep-open      leave Chrome running for inspection
node test/browser/sidebar.e2e.mjs --headful        show the browser window
```

Environment: `DSH_WEB_URL` (token URL override), `CHROME_BIN`, and
`PSD_E2E_DEBUG=1` for extra targeting diagnostics. The token is always redacted, Chrome is
always terminated, and only one harness instance may run at a time. The card checks require
at least one running/recent Session; `--pin` additionally needs at least two unpinned,
non-current main rows.

### Card prerequisites: "View all" expansion

The product keeps the **five-row limit over the combined pinned+ordinary list**. The
harness expands the card through its own `.psd-panel-link` "View all" control before inspecting
rows (`ensurePanelRows` logs `expanded card via "View all N": 5 -> N rows`). This is a
shared prerequisite for every mode, not an assertion: the five-row default is documented
product behavior.

### `--pin` checks (card-owned Host-shared pin)

`--pin` runs the four pipeline smoke checks, enables the CDP `Network` domain (same-origin
HTTP failure predicate) and adds:

| # | Check | Oracle |
|---|-------|--------|
| `pin-net` | Network failure oracle ready | `Network.enable` succeeded. The card's own pin-route probes (`/api/power-suite.session-pins`) are classified separately from real failures: while `pinShared === false` their pre-restart 404s are the documented missing-route probe and never fail the run; once `pinShared === true` any pin-route failure is a real defect |
| `r3-1` | Default card is the normal running/recent surface | card main rows > 0; **zero pinned rows** and **zero `data-pinned` nodes** (no default tint); the user's old/native pin titles never appear as pinned rows; effective card pin set empty; the running Session's **subagent child rows are rendered** (compared against the live `childrenByParent` count when > 0) |
| `r3-2` | Pin slot scope/collapsed resting states + glyph-squeeze guard | every `.psd-run` main row renders the `.psd-run-pin-slot` (order head > slot > title). **Two-phase spec:** unpinned rest = slot **0 px**, title starts at **46 px** from the row left, pin `opacity:0/visibility:hidden/pointer-events:none`, `aria-pressed=false`; pinned rest = slot **16 px**, title **71 px**, filled marker visible with `pointer-events:none`; `.psd-child` rows expose no pin slot/button/`data-pinned`; clipped-title glyph cell width == glyph width, head-to-slot gap **9 px** |
| `r3-3` | Two-phase slowed pin reveal (replaces the old "no layout jump" spec) | in-page ~10 ms sampling with real CDP pointer: rest 0/46/pin hidden; hover **phase 1 (~220 ms)** slot expands with title sliding 46→71 while the pin stays hidden and the time/New session/disclosure columns never move; **mid reveal** slot 16/title 71 with the pin fading in; **settled (>~380 ms)** slot 16/margin-right 9/title 71/pin opacity 1 and interactive; leave fades the pin out first (opacity partly visible with slot 16/title 71) then collapses to 0/46/pin hidden; reduced motion sets both phases instantly. The previous "title x must not move on hover" expectation is **superseded by this user-requested change**. It also records the run target and data/cell facts used by the later pin checks |
| `r3-4` | Pin click stays in the card | row/slot/button `data-pinned=true`, `aria-pressed`, localised Unpin label, filled shell pin glyph in the violet/blue accent, subtle tint on that row only (other rows keep their normal background); the card's **effective pin ids** (live seam) become exactly the clicked id; the local cache document (`power-suite.dynamic-workspaces.pinned`) records the pin (`pinned` or a queued `pin` op); the native sidebar pin marker for that Session is unchanged (the native pin is never read/written) |
| `r3-host` | Host-shared pin document contains the pin | when `pinShared === true`: direct same-origin `GET /api/power-suite.session-pins` succeeds, `{version:1,rev,pinned}` shape holds and `pinned` includes the id; when `pinShared === false`: **explicit SKIP** row stating the route is absent until the DSH Web service is restarted with the merged plugin and that the local cache/queue is authoritative meanwhile (never a fake PASS) |
| `r3-5` | Pinned-first placement | exactly the run pin leads the card as a one-row pinned prefix at index 0; effective ids are exactly that id; ordinary child rows keep rendering |
| `r3-6` | Second pin, newest activity first | both run pins lead as a two-row pinned prefix in the same newest-first relative order as before pinning, then ordinary rows (or the whole visible list when only two main rows exist); effective ids exactly the two ids; cache records both; children stay normal and unpinned; native marker unchanged for the second Session too |
| `r3-7` | Reload persistence | after a reload the card restores both pins pinned-first in order from the authoritative source: the local cache/queue always (pre-restart), plus the Host document when `pinShared === true` (both run ids checked); cache retains both ids; children still render |
| `r3-8` | Cross-device proof (second fresh profile) | only when `pinShared === true`: a second fresh throwaway Chrome profile (new `--user-data-dir`, separate CDP, same injected client) has an empty cache, adopts the Host document (`pinShared=true`, effective ids include both run ids), shows both rows pinned in the same A<B order, and the Host document lists both ids; second-profile page errors must be 0. When `pinShared === false`: **explicit SKIP** row |
| `r3-9` | Unpin restores the normal card | unpin both via the UI: DOM pin/tint gone, localised Pin label, unpinned row returns to the head of the normal queue immediately, effective ids empty, cache effective set (confirmed + queued ops replayed) no longer paints them; card pinned count back to the baseline (0); Host document no longer lists the run ids when `pinShared === true`; children still render; residual cache/queue and Host document printed honestly |
| `r3-10` | Atmosphere card rows keep only the rainbow (no stacked highlight), brighten their content and their trailing controls | real CDP pointer: a current parent card row at rest → every non-atmosphere content child has `filter: brightness(1.15)` with the 140 ms filter transition, `.psd-atmos` + canvas present, row/body backgrounds transparent; hovered → every content child `brightness(1.5)`, `.psd-run-main` background still `rgba(0,0,0,0)` (no hover pill), pin control still reveals (`opacity:1`/`visible`); hovering each trailing control (New session `.psd-row-action`, disclosure `.psd-run-toggle`, pin `.psd-run-pin`) → control background `rgba(0,0,0,0)` and `filter: brightness(1.2)` (no rounded hover block inside the rainbow, the pin still works); pinning the current row adds no violet tint (row/main stay transparent) and the check unpins again; an ordinary card row keeps its hover pill (non-transparent, measured `rgba(38,49,72,0.06)`) and has `filter:none` at rest and on hover, and its New session control keeps its normal hover block with `filter:none`; a nested subagent row opened like a user becomes current with `brightness(1.15)` at rest / `brightness(1.5)` on hover and `.psd-child-main` background transparent with the atmosphere present; an interrupted child Continue overlay is asserted too when reachable |
| `r3-11` | Native current Session/Workspace rows keep only the rainbow and brighten content + action buttons | the native sidebar current Session row (revealed like a user) and `[data-psd-current-workspace="true"]` row at rest: non-atmosphere content children `filter: brightness(1.15)` with the filter transition; hovered with a real pointer: `brightness(1.5)`, computed background `rgba(0,0,0,0)` each, atmosphere wrapper + canvas present, and their hover-revealed action buttons keep a `rgba(0,0,0,0)` background with `filter: brightness(1.2)`; an ordinary native session row still shows its native hover background with `filter:none` (control also unfiltered). If the open Session is a subagent (no native sidebar row), the check first switches back to a main card row like a user |
| `r3-12` | Atmosphere brightness respects reduced motion | with `prefers-reduced-motion: reduce`, the current card row's content children keep the static `brightness(1.15)` lift while the filter transition is disabled (`transition-property:none` / `0s`); media emulation is reset afterwards |
| `r3-13` | Card rows match the native Workspace project row height | measured in the same page like a user: the native `[data-row-key^="workspace:"]` project-row height is the reference (asserted equality, not hardcoded); every `.psd-run` and `.psd-child` height equals it; `.psd-run-main`/`.psd-child-main` height equals their row height with `box-sizing:border-box` and pill top/bottom matching the row (±1) so the highlight fills the row; titles/times stay vertically centred (±1), titles stay single-line (`white-space:nowrap`, no vertical wrap/clip); native session rows explicitly keep the shell's own 32 px height; the taller rows still scroll inside the clamped card body when it overflows (else the five-row/View-all behavior is covered by the expansion log + full-mode checks) |
| `r3-14` | Leading glyph / tree trunk / pin column share their centres; sparkle enlarged | **rest**: `.psd-run-glyph-cell` is 16×20 px on every main row and all cells share one centre column (±0.5 px); the read-row sparkle svg is **16×16** and visually centred while running/unread **14×14** state dots stay centred in the same cell; the child-tree trunk centre equals the glyph-cell centre (±0.5). **Expanded** (pin revealed): pin button centred in its 16 px slot, slot margins 0/**9 px**, equal **9/9 px** gaps, title at 71 px, child status-dot centre equals the pin centre (±0.5) |
| `r3-14b` | The read-row sparkle is 16×16 and centred | explicit read-row confirmation when an acknowledged/finished row is present; if a long verification session has warmed every card row (all visible mains running) the check is an explicit SKIP, never a fake pass |
| `r3-15` | A pinned row paints exactly one highlight layer | pin an ordinary card row and park the pointer: the row carries the row-level violet tint (`color(srgb … / 0.07)`), `.psd-run-main` stays `rgba(0, 0, 0, 0)` and neither element paints a background-image; hovering the pinned row still shows the ordinary body hover (`rgba(38, 49, 72, 0.06)`) and not a second tint layer; unpin restores the row background and collapses the slot back to 0/46 |

R1/R2 checks are unchanged from the original delivery (`r1-1`/`r1-2` perfect-circle dot;
`r2-1`..`r2-4` native hover figures, same-Session label alignment, 244 px native frame,
blank Session none). `r2-2` accepts a running Session's real projection drift between the
two hover reads when the label structure stays identical, and logs the drift.

### `--live` checks (shipped install, no client injection)

`--live` performs the same token-URL/Chrome/CDP setup but passes **no init script**, so the
page loads whatever the running GUI serves from the linked checkout. It opens two fresh
profiles, clicks only the card's "View all" control (read-only) and asserts:

| # | Check | Oracle |
|---|-------|--------|
| `live-1` | Shipped client is the corrected one | no injected factory; card mounted; ordinary main rows > 0; `.psd-run-pin` and `.psd-run-pin-slot` count == main-row count; subagent child rows present |
| `live-2` | No prefilled pinned rows (the rejected native-pin state must not come back) | 0 `data-pinned` rows/nodes in a fresh profile; no effective pins in the local cache; ordinary rows + children listed |
| `live-3` | Two fresh profiles agree | both have 0 pinned rows/nodes, pin controls on every main row, child rows present, empty local pin cache; the ordinary content is reported side by side |
| `live-4` | No page errors | 0 page exceptions/console errors across both profiles |

### Side effects and cleanup (`--pin` / `--live`)

- One blank Session is created/reused through the smoke flow and never typed into.
- `--pin` pins **two Sessions through the card's real pin button**, so it temporarily adds
  two ids to the card-owned pin set: immediately in the throwaway profile's local cache
  document (`power-suite.dynamic-workspaces.pinned`, versioned `{version, rev, pinned,
  pending, migrated}`) and, once the Host route exists, in the Host document under
  `$DSH_HOME/dsh-power-suite/session-pins.json`. The `finally` block unpins only the run's
  ids through the same UI and reports the residual effective ids, cache queue, Host
  document and native sidebar pin-marker counts honestly. If the process dies mid-run the
  printed ids/cache show what could remain; pre-restart the cache keeps the queued
  `pin,pin,unpin,unpin` sequence whose replay is a no-op, so first Host contact publishes
  the net result (no pins). The native sidebar pin (and the user's old native pins) is
  never read, written or surfaced by the card.
- The atmosphere regression checks (`r3-10`/`r3-11`) open one existing main card row and
  one existing nested subagent Session (real row clicks, no typing) to make them current,
  then switch back to a main Session for the native current-row checks; these are existing
  Sessions only and are never edited.
- The `--live` mode is read-only: no pin/unpin, no settings change, only the card's own
  "View all" view-state click.
- Expected pre-restart console noise: while the Host route is absent, the client's
  documented GET/POST probes return 404. `--pin` classifies those network entries
  separately (reported, not counted as real failures); the untouched full-mode check
  `b6-5` counts Chrome's console "Failed to load resource: 404" log entry, so full mode
  reports 42/43 until the DSH Web service is restarted with the route (then it clears).
- Exit 0 requires every row PASS (explicit SKIPs are allowed and counted), **0 page
  errors** and **0 real network failures**.

### Recorded evidence (card-owned Host-shared final design, 2026-11-13)

Build: worktree and linked checkout `9780a18` ("fix(dynamic-workspaces): panel-owned
Host-shared pin with the normal card restored"); injected/loaded `src/client.js` md5
`60e2573eb1e8d1dea1eff988a38f85a0` (20418 lines) plus `src/features/session-pins/`.
The running launchd service was **not** restarted, so the new Host route is not loaded yet
(`pinShared === false`); the served GUI already renders the corrected client after a page
reload (proved by `--live` with no injection). Node v24.22.2, Chrome 157.0.8103.78,
1728x900. Logs under `/tmp`; screenshots under `.tmp-work/sidebar-e2e/` (gitignored).

| Run | Command | Result |
|-----|---------|--------|
| Static gates | `node --check src/client.js` + host files; `npm test`; `npm run check` | exit 0; **249/249** unit tests pass, 0 fail; repository check exit 0 |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, exit 0, 2.8 s (`/tmp/f2-smoke-final.log`) |
| Pin acceptance | `node test/browser/sidebar.e2e.mjs --pin` | **19 PASS / 2 SKIP / 0 FAIL**, 27.7 s, page errors 0, real network failures 0, 8 expected pre-restart pin-route probes, exit 0 (`/tmp/f2-pin-final2.log`): default card 2 ordinary main rows + 6 child rows + 0 pinned/tint; every main row pin-control complete, children pin-free; hover/pin/unpin with violet tint, local cache/effective ids and native marker untouched; pinned prefix 1 then 2 newest-first; reload restored both pins from the local cache; `r3-host` and `r3-8` are explicit SKIPs because `pinShared === false` |
| Shipped install, no injection | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 6.7 s, exit 0 (`/tmp/f2-live.log`): both fresh profiles served the corrected client with 2 main rows, **6 subagent child rows**, 2 pin buttons, **0 pinned rows/nodes**, no injected factory, empty local pin cache, 0 page errors |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, page errors 0, on two runs (`/tmp/f2-full-1.log`, `/tmp/f2-full-2.log`); the only failure is the untouched `b6-5` check counting Chrome's console log of the expected pre-restart pin-route 404 (one line: `Failed to load resource: ... 404`) between its marks. Without the route the browser logs that line regardless of client handling; it is expected to clear once the DSH Web service is restarted with the merged plugin. No pin-path assertion failed |

Full-mode verification after the service restart (the Host route loads) is the remaining
step for the cross-device/Host green evidence; after that restart `r3-host` and `r3-8`
must turn into PASS rows and the full-mode `b6-5` console noise disappears.

Evidence screenshots written by the recorded `--pin` run: `pin-r1-dot.png`,
`pin-r1-hovercard.png`, `pin-r2-native-hover.png`, `pin-r2-card-hover.png`,
`pin-r2-native-layout.png`, `pin-r2-blank.png`, `pin-r3-pinned-row.png`,
`pin-r3-two-pinned.png`, `pin-r3-reloaded.png`, `pin-r3-unpinned.png`.

Sessions touched by the recorded `--pin` run: blank/current
`session-3a7c7b46-1188-4fae-afb6-26163c062ddd` (reused, never typed into), pinned+unpinned
`session-52ac5008-0bc3-4904-a0da-9f123aa22243` and
`session-d829ba3a-645d-4f4b-9581-3bce648f4882`; final effective card pins `[]`, no pinned
card rows, cache replay empty. The user's old native sidebar pins were never touched.

### Recorded evidence (follow-up 3: atmosphere no-stack, build `dbd3165` — previous build)

> **Build note:** the results below are for the previous build `dbd3165`; the current
> served build `4ec7ba5` adds the atmosphere **content-brightness** fix and its evidence is
> recorded under "follow-up 4" below. Keep `dbd3165` numbers as history for that build.

Build: worktree `session-pin-stats` at `dbd3165` ("fix(dynamic-workspaces): keep only the
rainbow surface on atmosphere rows") on top of `9780a18`; the linked checkout and the
served GUI are at the same commit; injected/loaded `src/client.js` md5
`66d6df9735e891b5d3905de3cb0189ab` (20430 lines). No service restart (Host pin route still
absent → `pinShared=false`). The **9780a18 table above is historical for that build**; the
rows below are the current build's evidence. Node v24.22.2, Chrome 157.0.8103.78,
1728x900. Logs under `/tmp`; screenshots under `.tmp-work/sidebar-e2e/`.

| Run | Command | Result |
|-----|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **249/249** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Pin acceptance (all final checks) | `node test/browser/sidebar.e2e.mjs --pin` | **21 PASS / 2 SKIP / 0 FAIL**, 42.4 s, page errors **0**, real network failures **0**, 8 expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f3-pin-2.log`): the previous 19+2 rows stay green **and** the new atmosphere rows pass — current card parent row `rgba(0,0,0,0)` body with atmosphere + revealed pin + suppressed pinned tint; ordinary card row hover `rgba(38,49,72,0.06)`; current child body `rgba(0,0,0,0)` with atmosphere; native current Session and current Workspace rows both `rgba(0,0,0,0)` with atmosphere; ordinary native row hover `rgba(38,49,72,0.06)` |
| Shipped install, no injection | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 7.2 s, exit 0 (`/tmp/f3-live.log`): both fresh profiles served the corrected client with 2 main rows, 4 subagent child rows (current child count), 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 3.2 s, exit 0 (`/tmp/f3-smoke.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, 53.8 s, page errors 0 (`/tmp/f3-full-1.log`); the only failure is still the untouched `b6-5` check counting Chrome's console log of the expected pre-restart pin-route 404 (one `Failed to load resource: ... 404` line); it clears after the DSH Web service restart. No pin/atmosphere assertion failed |

The fix-2 regression checks live in `--pin` (not full mode) so they run against the
authoritative current-Session atmosphere state without changing any existing full-mode
oracle. They use real CDP pointer input and the same stable-targeting helpers as the pin
checks.

### Recorded evidence (follow-up 4: atmosphere content brightness, build `4ec7ba5` — previous build)

> **Build note:** the results below are for the previous build `4ec7ba5`; the current
> served build `8ad390c` adds the atmosphere **trailing-control** fix and its evidence is
> recorded under "follow-up 5" below.

Build: worktree and linked checkout at `4ec7ba5` ("fix(dynamic-workspaces): brighten
atmosphere content instead of adding a background highlight"), injected/loaded
`src/client.js` md5 `4bed32000b34c293f44499922619d959` (20439 lines). No service restart
(Host pin route still absent → `pinShared=false`). This section is the current build's
evidence; the `dbd3165` and `9780a18` tables above are historical for those builds. Node
v24.22.2, Chrome 157.0.8103.78, 1728x900; logs under `/tmp`, screenshots under
`.tmp-work/sidebar-e2e/` (gitignored).

| Run | Command | Result |
|-----|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **249/249** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Pin acceptance (+ atmosphere brightness) | `node test/browser/sidebar.e2e.mjs --pin` | **22 PASS / 2 SKIP / 0 FAIL**, 45.5 s, page errors **0**, real network failures **0**, 10 expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f4-pin-3.log`). New/updated rows: current card parent row at rest every content child `brightness(1.15)` with the 140 ms filter transition, hovered `brightness(1.5)` with body background still `rgba(0,0,0,0)` and the pin revealed; pinned current row tint suppressed; ordinary card row keeps its pill (`rgba(38,49,72,0.06)`) with `filter:none` at rest and on hover; current child row `brightness(1.15)` at rest / `brightness(1.5)` on hover with transparent body + atmosphere; native current Session and current Workspace rows `brightness(1.15)` at rest → `brightness(1.5)` on hover with `rgba(0,0,0,0)` backgrounds + atmosphere wrappers; ordinary native row keeps its hover background with `filter:none`; under `prefers-reduced-motion: reduce` the current row keeps the static `brightness(1.15)` with the filter transition disabled (`transition-property:none`, `0s`). The two SKIPs remain the documented pre-restart `r3-host`/`r3-8` |
| Shipped install, no injection | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 7.2 s, exit 0 (`/tmp/f4-live.log`): both fresh profiles served the corrected client with 2 main rows, 4 subagent child rows, 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 2.2 s, exit 0 (`/tmp/f4-smoke.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, 50.2 s, page errors 0 (`/tmp/f4-full-1.log`); only failure is still the untouched `b6-5` counting Chrome's console log of the expected pre-restart pin-route 404; no pin/atmosphere assertion failed. It clears after the DSH Web service restart |

The follow-up-4 checks extend the `--pin` atmosphere rows (`r3-10`..`r3-12`) with real
CDP pointer input and the existing stable-targeting helpers; no full-mode oracle changed.
Side effects are unchanged from follow-up 3 (the checks may open existing main/subagent
Sessions to create the current atmosphere rows; no typing or edits). Final effective card
pins `[]`, native sidebar pin state untouched.

Remaining for the final green table (unchanged): after the user restarts the DSH Web
service, re-run `--pin` so `r3-host` and the second-profile `r3-8` turn SKIP → PASS and
full-mode `b6-5` no longer sees the 404 console line.

### Recorded evidence (follow-up 5: atmosphere trailing controls, build `8ad390c` — previous build)

> **Build note:** the results below are for the previous build `8ad390c` (md5
> `c8a314e8…`); the current served build `a5d56fd` unifies the card row heights with the
> native Workspace project rows and its evidence is recorded under "follow-up 6" below.

Build: worktree and linked checkout at `8ad390c` ("fix(dynamic-workspaces): atmosphere-row
controls brighten instead of painting hover backgrounds"), injected/loaded
`src/client.js` md5 `c8a314e8e3da999b9c3d4d2e66261328` (20447 lines). No service restart
(Host pin route still absent → `pinShared=false`). This section is the current build's
evidence; the `4ec7ba5`/`4bed3200…` and earlier tables above are historical for those
builds. Node v24.22.2, Chrome 157.0.8103.78, 1728x900; logs under `/tmp`, screenshots
under `.tmp-work/sidebar-e2e/` (gitignored).

| Run | Command | Result |
|-----|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **249/249** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Pin acceptance (+ atmosphere/trailing-control checks) | `node test/browser/sidebar.e2e.mjs --pin` | **22 PASS / 2 SKIP / 0 FAIL**, 58.2 s, page errors **0**, real network failures **0**, 10 expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f5-pin-1.log`). New assertions: hovering the current atmosphere row's trailing controls (New session `.psd-row-action`, disclosure `.psd-run-toggle`, pin `.psd-run-pin`) gives each background `rgba(0,0,0,0)` + `filter: brightness(1.2)` with the pin still working; an ordinary row's New session control keeps its normal hover block (non-transparent) + `filter:none`; the current child row's body stays transparent with atmosphere (child Continue asserted when reachable); the native current Session and current Workspace rows' action buttons are `rgba(0,0,0,0)` + `brightness(1.2)`, with their row backgrounds transparent and content brightness 1.15→1.5 on hover; an ordinary native control is unfiltered. The two SKIPs remain the documented pre-restart `r3-host`/`r3-8` |
| Shipped install, no injection | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 8.9 s, exit 0 (`/tmp/f5-live.log`): both fresh profiles served the corrected client with 2 main rows, 4 subagent child rows, 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 3.8 s, exit 0 (`/tmp/f5-smoke.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, 55.7 s, page errors 0 (`/tmp/f5-full-1.log`); only failure is still the untouched `b6-5` counting Chrome's console log of the expected pre-restart pin-route 404. No pin/atmosphere/brightness/control assertion failed; it clears after the DSH Web service restart |

The fix-4 assertions extend the `--pin` atmosphere rows (`r3-10`/`r3-11`) with real CDP
pointer input and the existing stable-targeting/hover helpers; no full-mode oracle changed.
Side effects are unchanged (the checks may open existing main/subagent Sessions to create
current atmosphere rows; no typing/edits; final effective card pins `[]`, native sidebar
pin state untouched).

Remaining for the final green table (unchanged): after the user restarts the DSH Web
service, re-run `--pin` so `r3-host` and the second-profile `r3-8` turn SKIP → PASS and
full-mode `b6-5` no longer sees the 404 console line.

### Recorded evidence (follow-up 6: card row height unified with Workspace project rows, build `a5d56fd` — previous build)

> **Build note:** the results below are for the previous build `a5d56fd` (md5
> `68ec7946…`); the current served build `53f159e` centres the glyph cell, tree trunk and
> pin column and enlarges the read-row sparkle — its evidence is recorded under
> "follow-up 7" below.

Build: worktree and linked checkout at `a5d56fd` (merge including the newer annotation
work, on top of "style(dynamic-workspaces): unify card row heights with the Workspace
project rows"), injected/loaded `src/client.js` md5
`68ec7946c606e413c32214b45a44275a` (20875 lines). No service restart (Host pin route still
absent → `pinShared=false`). This section is the current build's evidence; the
`8ad390c`/`c8a314e8…` and earlier tables above are historical for those builds. Node
v24.22.2, Chrome 157.0.8103.78, 1728x900; logs under `/tmp`, screenshots under
`.tmp-work/sidebar-e2e/` (gitignored).

| Run | Command | Result |
|-----|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **250/250** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Row-height check (`r3-13`) + pin acceptance | `node test/browser/sidebar.e2e.mjs --pin` | **23 PASS / 2 SKIP / 0 FAIL**, 53.6 s, page errors **0**, real network failures **0**, expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f6-pin-3.log`). Row-height evidence: reference native Workspace project row **34 px**; the card's **2 main + 4 child rows measure 34 px** each (equality asserted against the live reference, not hardcoded); both body pills are `box-sizing:border-box`, height 34 px and top/bottom match the row (±1) so the highlight fills the row; titles/times stay centred ±1 with `white-space:nowrap` and no vertical clipping; native session rows measure **32/32/32/32/32 px** (the shell's own height, explicitly untouched); the taller rows still scroll inside the clamped card body when it overflows (five-row/View-all expansion logged, full-mode checks cover the fold behavior). The two SKIPs remain the pre-restart `r3-host`/`r3-8` |
| Shipped install, no injection | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 6.6 s, exit 0 (`/tmp/f6-live.log`): both fresh profiles served the corrected client with 2 main rows, 4 subagent child rows, 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 2.2 s, exit 0 (`/tmp/f6-smoke.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, 50.4 s, page errors 0 (`/tmp/f6-full-1.log`); the only failure is the untouched `b6-5` check counting Chrome's console log of the expected pre-restart pin-route 404. **No existing full-mode geometry assertion depends on the old 28/24 px heights** (the only height-related existing assertion is “row heights stay uniform”, which still passes at 34 px; no oracle was changed) |

The follow-up-6 check lives in `--pin` as `r3-13` (additive; no full-mode oracle changed).
It reveals the native Workspace rows like a user before measuring and compares against the
live reference rather than a literal, so a future shell row-height change is reported as an
equality failure instead of silently accepted. Side effects are unchanged (the checks may
open existing main/subagent Sessions to create current atmosphere rows; no typing/edits;
final effective card pins `[]`, native sidebar pin state untouched).

Remaining for the final green table (unchanged): after the user restarts the DSH Web
service, re-run `--pin` so `r3-host` and the second-profile `r3-8` turn SKIP → PASS and
full-mode `b6-5` no longer sees the 404 console line.

### Recorded evidence (follow-up 7: glyph / trunk / pin column alignment + sparkle size, build `53f159e` — previous build)

> **Build note:** the results below are for the previous build `53f159e`. The final served
> feature build is `436a81c` (client md5 `113e1365…`), which replaces the reserved pin slot
> with the user-requested two-phase reveal and adds the single-tint layer; its evidence is
> recorded under "follow-up 8" below. Any "no layout jump"/reserved-slot statements in the
> older evidence tables are historical and superseded by that change.

Build: worktree and linked checkout at `53f159e` ("fix(dynamic-workspaces): centre the
leading glyph cell, tree trunk and pin column"), injected/loaded `src/client.js` md5
`8717e63139791aba0d2c96e78f92f931` (20880 lines). No service restart (Host pin route still
absent → `pinShared=false`). This section is the current build's evidence; the
`a5d56fd`/`68ec7946…` and earlier tables above are historical for those builds. Node
v24.22.2, Chrome 157.0.8103.78, 1728x900; logs under `/tmp`, screenshots under
`.tmp-work/sidebar-e2e/` (gitignored).

| Run | Command | Result |
|-----|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **250/250** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Glyph/trunk/pin alignment (`r3-14`, new) + pin acceptance | `node test/browser/sidebar.e2e.mjs --pin` | **24 PASS / 2 SKIP / 0 FAIL**, 57.3 s, page errors **0**, real network failures **0**, expected pre-restart pin-route probes classified separately, exit 0 (`/tmp/f7-pin-1.log`). Measurements (absolute page coords; the card row starts at 21 px): glyph cell **16×20 px**, all main-row cell centres **50 px** (29 px from the row left) — equal across the running-dot row and the read-sparkle row; read-row **sparkle svg 16×16 px**, running/unread **state dots 14×14 px**, both centred in the cell; **pin column 75 px** with the pin button centred in its 16 px slot, zero slot margins and symmetric **9 px / 9 px** gaps; child-tree **trunk 50 px** = glyph cell centre; **child status dot 75 px = pin centre** |
| Shipped install, no injection | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 6.6 s, exit 0 (`/tmp/f7-live.log`): both fresh profiles served the corrected client with 2 main rows, 4 subagent child rows, 2 pin buttons, 0 pinned rows/nodes, no injected factory, empty local pin cache, 0 page errors |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 2.1 s, exit 0 (`/tmp/f7-smoke.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **42/43 PASS**, 50.5 s, page errors 0 (`/tmp/f7-full-1.log`); the only failure is the untouched `b6-5` check counting Chrome's console log of the expected pre-restart pin-route 404. No existing geometry/targeting assertion needed to move for the new glyph cell/pin alignment (no oracle changed) |

The follow-up-7 check lives in `--pin` as `r3-14` (additive). It opens a finished row like a
user when the live card has no read-row sparkle yet (documented side effect), then measures
the live DOM. Comparison values are derived from the live row geometry (16 px cell, ±0.5 px
centres, 9 px gaps), so a shell/plugin-side alignment regression is reported as an explicit
failure. Side effects are unchanged (the checks may open existing main/subagent Sessions; no
typing/edits; final effective card pins `[]`, native sidebar pin state untouched).

Remaining for the final green table (unchanged): after the user restarts the DSH Web
service, re-run `--pin` so `r3-host` and the second-profile `r3-8` turn SKIP → PASS and
full-mode `b6-5` no longer sees the 404 console line.

### FINAL recorded evidence (follow-up 8: Host-shared pin acceptance + two-phase slowed reveal + single highlight layer, pre-merge build `436a81c`)

> **Pre-merge build:** the table in this section records the pre-merge build
> (`436a81c`, injected client md5 `113e1365…`). The merged-build confirmation
> (`03d2167`, injected + served client md5 `d816e64d…`) is appended at the end of this
> section.

Build: worktree at `436a81c` ("style(dynamic-workspaces): slow the pin reveal animation"),
injected `src/client.js` md5 `113e1365272ef7769868a31e19310faa` (20881 lines). **The DSH Web
service was restarted and the Host pin route is LIVE** (`pinShared=true`, browser `GET
/api/power-suite.session-pins` → `{version:1,rev,pinned}`, 200), so the former pre-restart
SKIP rows are real PASS rows and the 404 console noise is gone. No further service restart
was needed for this client change. This is the current/build-of-record evidence; all earlier
tables are historical for their builds. Node v24.22.2, Chrome 157.0.8103.78, 1728x900;
logs under `/tmp`, screenshots under `.tmp-work/sidebar-e2e/` (gitignored).

> **Superseded spec:** the previous "fixed 16 px reserved slot / title x must not move on
> hover" requirement is replaced by the user-requested **two-phase, space-saving reveal**
> (rest slot 0/title 46; hover expands first, button fades second; leave reverses). The
> full-mode `b2-3` oracle was intentionally updated to assert that the hovered title slides
> exactly 25 px (16 slot + 9 gap) while the time/New session/disclosure columns stay fixed;
> no other oracle was weakened.

| Run | Command | Result |
|-----|---------|--------|
| Static gates | `node --check src/client.js`; `npm test`; `npm run check` | exit 0; **250/250** unit tests pass, 0 fail; repository check exit 0 (pack entryCount 73) |
| Final `--pin` acceptance (Host route live) | `node test/browser/sidebar.e2e.mjs --pin` | **28 PASS / 0 SKIP / 0 FAIL**, 83.6 s, page errors **0**, real network failures **0**, exit 0 (`/tmp/f9-pin-final.log`); Host route probes classified separately = 0 failures. Key rows: **`r3-3`** rest slot 0/title 46/pin hidden → hover phase 1 slot 1.08 px/title 47.69 px with the pin still hidden and the fixed columns unchanged → mid-reveal pin fading in (0.017) once the slot reached 16/title 71 → settled slot 16/margin 9/title 71/pin opacity 1 → leave fade 0.972 with slot 16/title 71 then collapse to 0/46 → reduced motion instant; **`r3-host`** Host document rev 91 contains the card pin; **`r3-8` cross-device** second fresh Chrome profile sees the same Host pins (`["55c765df…","029aeb48…"]`) in the card's newest-activity-first prefix with 0 page errors — the pre-restart SKIP is now a real PASS; **`r3-14`** glyph cell 16×20/centre column shared across 4 main rows, sparkle 16×16, state dots 14×14, trunk = cell centre, expanded pin 9/9 gaps/title 71; **`r3-14b`** read-row sparkle 16×16 PASS; **`r3-15`** single highlight layer: row tint `color(srgb 0.2549 0.4627 0.902 / 0.07)` only, body pill `rgba(0, 0, 0, 0)` at rest and no background-image, hover body `rgba(38, 49, 72, 0.06)`, unpin restored. Cleanup: Host document back to `pinned: []` (rev 90 → 98), 8 documented pin-route writes (pin/unpin pairs), cache migrated, **0 residual pins**, native sidebar pin untouched |
| Shipped install, no injection | `node test/browser/sidebar.e2e.mjs --live` | **4/4 PASS**, 6.2 s, 0 page errors, exit 0 (`/tmp/f9-live-final.log`): both fresh profiles served the client, 0 pinned rows/nodes, empty local cache, no injected factory |
| Smoke | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 2.1 s, 0 page errors, exit 0 (`/tmp/f9-smoke-final.log`) |
| Full mode | `node test/browser/sidebar.e2e.mjs --no-shots` | **43/43 PASS**, 50.5 s, page errors 0 (`/tmp/f9-full-3.log`) — the former `b6-5` 404 console noise is **gone** (0 new network failures); `b2-3` now asserts the intentional 25 px title slide with fixed trailing columns (67→92 absolute = 46→71 row-relative); `b4-1` atmosphere vivid; `b6-2` cold subagent one-shot read (1 read, 3 sections). No other oracle changed |

Honest notes / environment observations:
- `--live` was run against the currently served client of the linked checkout, which at run
  time was **newer** than the injected target: linked checkout HEAD had advanced to
  `9513b71` (annotation capture-scope merges; `436a81c` is an ancestor) and its
  `src/client.js` md5 is `d816e64d…` (21000 lines). The injected pin/atmosphere suites above
  verified md5 `113e1365…` as requested; the served non-injected client passed `--live`
  4/4 but was not re-run through the injected suites. The Lead should ff/rebase the branch
  and, if the served md5 changes, re-run the injected suites on the merged md5.
- `api/changes.summary` 404s (a shell deliverables probe whose route this Host build does
  not serve) are classified separately from real network failures; one intermediate run saw
  6 such probes, the final runs saw **0**. They are not pin/atmosphere failures.
- `b4-1` live-canvas saturation is a known pre-existing live-animation flake (0.373 vs the
  0.38 threshold) and passed on the final run; `b6-2` needs a cold subagent row and is an
  explicit SKIP (never a fake PASS) when a long verification session has warmed every row
  — the final run found a cold child and passed.
- The two-phase reveal checks sample every ~10 ms in-page, so they observe the slowed
  phases (expansion 220 ms, fade 160 ms with delay 220 ms, leave fade 160 ms + delayed
  220 ms collapse) without CDP round-trip races; tolerances are ±0.75 px for title/slot
  positions and ±0.5 px for the fixed columns.

Remaining: none for the pin/atmosphere/two-phase feature on md5 `113e1365…`; the final
commit + linked-checkout ff is the Lead's step.

### Merged-build confirmation (HEAD `03d2167`, injected + served client md5 `d816e64d3aef5b108a6989a392d2f5b8`)

The final evidence commit `3cc1165` and the newer linked-checkout annotation merge `9513b71`
were merged cleanly at `03d2167`; the injected and served client are now the same
`d816e64d…` file (21000 lines), Host pin route live, Host pin document starting empty.

- **`--pin` → 28 PASS / 0 SKIP / 0 FAIL**, 85.1 s, page errors **0**, real network failures
  **0**, exit 0 (`/tmp/f10-pin.log`): `r3-host` PASS (Host document rev 99 contains the card
  pin), cross-device `r3-8` PASS (second fresh profile sees both Host pins in the
  newest-activity-first prefix), two-phase/single-tint/alignment/height/atmosphere rows green;
  cleanup restored the Host document to `pinned: []` (rev 98 → 106, no residual pins, native
  pin untouched).
- **Full mode is not green on the merged client**, attributed to a **client/Host version
  mismatch** (the annotation merge landed after the service restart, so the running Host half
  predates it). Four attempts: **39/43** (`/tmp/f10-full-2.log` — `b3-1` prompt-history search
  card missing, `c4-2`/`c4-3`/`c4-4` bucket-cache checks), **42/43** (`/tmp/f10-full-3.log`,
  only the known `b4-1` live-canvas saturation flake), **42/43** (`/tmp/f10-full-4.log`, same
  flake), **41/43** (`/tmp/f10-full-5.log` — `b4-1` flake, `c4-4`, one `Sidebar Session
  opening failed: … Session reference … is released` page error). `b6-5` stays clear
  (0 network failures) in every run and no pin/two-phase/tint/alignment row failed.
- **Control:** the same harness and environment with the pre-merge control client
  `113e1365…` scores **43/43**, 0 page errors (`/tmp/f10-full-oldclient.log`), isolating the
  delta to the merged annotation client, not the pin/two-phase/atmosphere changes.
- **Remedy:** one DSH Web service restart with the merged checkout, then an optional
  full-mode re-run; the pin/two-phase features are already verified green and do not depend
  on it.
- **Harness prerequisite kept:** `b6-2` now expands collapsed card rows with real
  `.psd-run-toggle` clicks before its explicit environment SKIP, making the cold-subagent
  check deterministic (it passed on the merged build) and mirroring what a user does.

### Annotation usability + font, merged build `85d1289` (client md5 `0e2d6aa8…`)

Merged client-only build: worktree + linked checkout `85d1289`, injected and served
`src/client.js` md5 `0e2d6aa8bb80ab3eb457078240cfa50f` (21320 lines), no service restart,
Host pin route live, unit tests **253/253**. The change keeps the composer natively
interactive in annotation mode (capture blocking exempts
`[data-conversation-region="composer"]`; it never resolves as a target or gets a hover
outline), makes the sidebar footer primary **Insert all into composer** when the collection
is non-empty but no page selection is pending, makes the batch popover draggable with
measured-size clamping, and matches the Active/Inactive Projects headings to the native
Workspaces heading (14 px / 400 / 20 px / tertiary). Targeted annotation acceptance on the
merged client: **scenario 5 PASS 7/0/0** (8.5 s, 0 page errors, `/tmp/t48-ann-s5.log`),
**scenario 8 PASS 7/0/0** (12.2 s, incl. the updated `footer.primary` oracle,
`/tmp/t48-ann-s8.log`), and **scenario 2 FAIL 6/1** (`/tmp/t48-ann-s2.log`) which is a
**stale oracle, not a product regression**: the old S2 right-click point (chat centre
`797,470`) now lands inside the composer seat, so the new intentional composer exemption
correctly leaves the native contextmenu unprevented; a non-composer chat point (`797,120`)
still yields `plainPrevented = 1` (`/tmp/t48-ann-s2-diag2.log`) and the pre-fix client
`d816e64d…` passes S2 7/7 in the same environment (`/tmp/t48-ann-s2-prefix.log`). Fix: point
the blocked-contextmenu probe outside the composer seat and/or assert the composer exemption
explicitly. The batch-popover drag is not covered by scenarios 2/8 (S8 is the launcher drag),
so it remains Lead-probe evidence only. Sidebar suite on the same md5: `--pin` 28/0/0
(82.4 s, `/tmp/t48-pin-2.log`), `--live` 4/4 (6.3 s), `--smoke` 4/4 (2.2 s), full mode 43/43
on the third attempt (`/tmp/t48-full-3.log`; two earlier attempts 42/43 with only the known
pre-existing `b4-1` canvas-saturation flake 0.377/0.374 vs 0.38).

### Known limitations (`--pin` / `--live`)

- Host sharing and cross-device visibility require the DSH Web service restart that loads
  the new Host route; before that `pinShared === false` and those two checks are explicit
  SKIPs (the UI works local-only with the cache/queue, which the reload check covers).
- After the service restart, the untouched full-mode `b6-5` console-cleanliness check is
  expected to clear; until then it reports the expected pre-restart 404 log line.
- The glyph-alignment check (`r3-14`) needs a read-row sparkle and a main row with nested
  child rows; it opens a finished row like a user when the live card has no acknowledged
  row yet (and may open a native sidebar Session as a last resort), so those Sessions are
  touched but never edited. If every visible card row is running, the read-row sparkle
  sub-check is an explicit SKIP (`r3-14b`), never a fake PASS.
- `r3-14` prefers a row with a 10 px state-dot child for the exact child-dot/pin centre
  assertion; when only read child rows are rendered (12 px sparkle wrapper) it allows the
  known ≤1.5 px wrapper delta and records the measured centres, so mixed read/running child
  states stay deterministic without hiding a real column misalignment.
- The two-phase reveal checks need the row to stay hovered while sampling; the card can
  re-sort under the pointer during live activity, so they sample in-page and use the
  documented tolerances instead of exact frame timing.
- `b6-2` needs a visible cold subagent row; when none is visible it first expands collapsed
  card rows with real `.psd-run-toggle` clicks (a normal user action) and only then reports
  the explicit environment SKIP, so a warmed/collapsed card does not make the check flaky.
- The live pin-order oracles read the Host activity ledger (`$DSH_HOME/dsh-power-suite/session-activity.json`)
  as the same source the card sorts by; this is read-only evidence. The client's own
  activity poll can be up to 30 s stale, so after an unpin the relative order inside the
  normal queue is recorded rather than hard-failed (the pinned ordering itself is
  asserted in `r3-6`/`r3-7`/`r3-8`).
- The row-height check measures the live native Workspace project row as the reference and
  requires at least one rendered nested subagent row plus visible native session rows (it
  reveals/expands them like a user first); a shell-side row-height change shows up as an
  explicit equality failure rather than being hardcoded.
- The atmosphere no-stack checks need a current-Session card row and at least one rendered
  nested subagent row (they open existing Sessions like a user to create them); the native
  current-row check needs the current main Session to have a native sidebar row, so when the
  open Session is a subagent the check first switches back to a main card row.
- The five-row "View all" limit over the combined list is intended:
  the default card is ordinary running/recent rows plus any card pins.
- The harness runs inside the currently active Session, so the live card re-sorts while
  checks run. `--pin` never targets the current Session, prefers finished rows, requires
  two identical geometry samples before each click and retries only id-based
  postconditions; the full-mode live-row animation probes remain occasionally sensitive
  (`b4-1` canvas saturation is a known live-animation threshold flake with 0 page errors;
  it is not pin-related).
- Cross-device proof (once `pinShared === true`) runs a second fresh browser profile in
  the same harness process on this machine; it proves Host-shared state between two fresh
  profiles of the same Host, not a second physical device.
- The card pin writes user data: a hard crash after a pin click can leave the two logged
  ids in the cache/Host; the run prints them and the documented cleanup is unpinning via
  the card. `--live` is read-only.
- Headless Chrome on one display/zoom level and the GUI's current UI language (English
  labels observed; ZH copy is unit-tested only). Chrome normalizes
  `corner-shape: round` to `superellipse(1)`, so the R1 oracle compares against a synthetic
  control rather than the literal keyword.
- `--live` requires the linked checkout to be merged to the branch tip; it proves the
  served client, not the worktree-only code, and does not restart the service.
