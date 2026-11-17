# Browser end-to-end acceptance harness (UI element annotation)

`annotation.e2e.mjs` drives the **real running DSH UI** with a throwaway headless Chrome
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
   `@zephinel/dsh-power-suite` registration factory, so the real DSH shell loads our browser code
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
- The DSH UI served by the existing launchd service
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
node test/browser/annotation.e2e.mjs --scenario 8    run exactly one scenario (validation: 1..16)
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
node test/browser/sidebar.e2e.mjs --layout         sidebar-width drag/persistence/Host-sync acceptance (restores the width)
node test/browser/sidebar.e2e.mjs --interrupted    interrupted-state consistency acceptance (controlled seam, live route)
node test/browser/sidebar.e2e.mjs --row-menu       card row "…" menu = native shared-popup parity acceptance
node test/browser/sidebar.e2e.mjs --readme-shots   raw README/Bento captures (2x, privacy-masked, demo stubs)
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
| `r3-10` | Atmosphere card rows keep only the rainbow (no stacked highlight), brighten their content and their trailing controls | real CDP pointer: a current parent card row at rest → every non-atmosphere content child has `filter: brightness(1.15)` with the 140 ms filter transition, `.psd-atmos` + canvas present, row/body backgrounds transparent; at rest the time is visible with the `"…"` trigger present but hidden, and on hover the time hides and the trigger shows (`opacity:1`/`visible`); hovered → every content child `brightness(1.5)`, `.psd-run-main` background still `rgba(0,0,0,0)` (no hover pill), pin control still reveals (`opacity:1`/`visible`); hovering each trailing control (New session `.psd-row-action`, disclosure `.psd-run-toggle`, pin `.psd-run-pin`, row-menu trigger `.psd-run-more`) → control background `rgba(0,0,0,0)` and `filter: brightness(1.2)` (no rounded hover block inside the rainbow, the pin still works and the `"…"` trigger stays hover-free); pinning the current row adds no violet tint (row/main stay transparent) and the check unpins again; an ordinary card row keeps its hover pill (non-transparent, measured `rgba(38,49,72,0.06)`) and has `filter:none` at rest and on hover, and its New session control keeps its normal hover block with `filter:none`; a nested subagent row opened like a user becomes current with `brightness(1.15)` at rest / `brightness(1.5)` on hover and `.psd-child-main` background transparent with the atmosphere present; an interrupted child Continue overlay is asserted too when reachable |
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

### New Running & recent surfaces (row menu + pending notices)

The committed `--pin` suite still targets the restored card-owned pin (Host
document/cache, two-phase reveal, pinned-first ordering) plus the hover/figure
checks. Two newer surfaces are documented here but are **not exercised by a
committed scenario yet**:

- **Row "…" menu** — every top-level card row (the current rainbow row
  included) keeps its time visible at rest and carries a "…" trigger in the
  48 px time slot. Row hover/focus hides the time and shows the trigger; the
  swap stays while the menu is open (`data-menu-open`), and leaving restores the
  time. The trigger keeps the ordinary soft hover paint (plus the keyboard
  `focus-visible` ring); only the rainbow row suppresses it, with the same
  `brightness(1.2)` lift as the New session/pin/Continue controls, and subagent
  rows have no trigger. The trigger now opens the **native shared context-menu
  popup** for a plugin-owned captured-target kind that delegates to the native
  Session actions: Rename / Fork / Copy Session ID / Show in Finder / Archive keep
  their native icons, shortcut hints, material and behavior, and the **Pin/Unpin
  entry is filtered out** (the restored title-left pin button is the only pin
  owner). The `--row-menu` mode below is the committed live acceptance for this
  alignment (an older round's custom `.psd-menu` popup is gone); full-mode `b2-3`
  still asserts the uniform highlight swap and no-hover-background rule.
- **Pending-interaction flags** — a waiting Session gets one amber `flag-fill`
  in the Running & recent card's fixed leading-glyph cell and in the native
  Workspaces row's fixed leading slot (the native status glyph is hidden while
  pending); no popup, no cap, title x unchanged. The derivation is unit-tested
  (filters, all three kinds, status-key fallback, newest-first) and live-probed
  with the real renderer + synthetic data (`docs/verification.md`); the
  end-to-end `SessionStatus.pendingInteraction` show/hide path was not
  live-triggered in a committed browser scenario.

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

### `--layout` checks (persisted, Host-synced sidebar width + flicker oracle)

`--layout` is the live-GUI acceptance mode for the persisted, cross-device sidebar width
(`src/features/sidebar-width/` Host half + the `//#region feature: sidebar width` client
half) and for the rainbow-atmosphere flicker fix on the current Workspace / Session rows.
It runs the four pipeline smoke checks, enables the CDP `Network` domain (the same
same-origin failure predicate as `--pin`), then drives the native sidebar resize handle with **real
CDP pointer input** (`Input.dispatchMouseEvent` press / 10 moves / release). The mode never
creates or types into a Session: it uses the Session the shell already restored (smoke-3
verifies one is open and leaves it untouched), and it restores the pre-run width in a
`finally` block.

| # | Check | Oracle |
|---|-------|--------|
| `smoke-1..4` | Pipeline | Injected worktree client ran; card mounted; a current Session is open and untouched (layout mode does **not** run `ensureBlankSession`, so no Session is created); 1728x900 screenshot round-trip |
| `lw-1` | Drag handle + width measurement | native `[data-side="sidebar"]` handle visible (a collapsed sidebar is recovered through the shell's own `[data-sidebar-opener]` control, with the Expand/Open aria-labels as fallback, first), its centre sits on the sidebar column's right edge (±1 px), and the rendered `_sidebarCol` grid track is measured (e.g. 280 px, grid `280px 1448px 0px`) |
| `lw-2` | Live atmosphere on the current row | every `.psd-atmos-canvas` is measured; at least one canvas on a `[data-psd-current-workspace="true"]` or `[data-psd-current-session="true"]` row is visible with a non-empty drawing buffer and non-zero 7×7 `getImageData` grid sum; its `data-psd-atmos-motion`/`data-psd-atmos-running` renderer state is asserted |
| `lw-3` | **Flicker oracle** (real drag) | real CDP drag of the handle across 10 steps, ±40 px in the direction that stays inside 264..420 px. The mode forces `prefers-reduced-motion: no-preference` first, and the selected oracle canvas must be an **animated, running** current-row canvas: reduced motion already repainted synchronously in the pre-fix client, so without that guard the oracle could silently stop discriminating. (a) the current-row canvas **element identity** is unchanged in every step sample; (b) **≥1 backing-store resize** is observed during the drag (per-step canvas `width/height` change and/or in-frame resize samples); (c) **0 blank bitmap samples**: every per-step sample must have a non-zero 7×7 pixel-grid sum, and a second, deterministic oracle samples the bitmap from a `ResizeObserver` registered *after* the client's own observer — same resize-notification task, before the browser paints — so a resize that is not repainted synchronously is caught even in the frame where it clears the canvas. PASS = 10 step samples, 0 blank samples, ≥1 resize, stable identity. Per-step and in-frame data is written to `.tmp-work/sidebar-width/e2e/layout-drag-samples-*.json` |
| `lw-4` | Cache + client seam after the drag | `localStorage['power-suite.sidebar-width']` exists and parses as `{version:1, sidebarWidth, pending}`; `sidebarWidth` equals the rendered dragged width (±1); `pending` is a boolean. `__POWER_SUITE_TEST_HOOKS__.sidebarWidth.probe()` reports `attached:true`, `storeWidth`/`desiredWidth` equal to the rendered width (±1) and the same parsed cache (a missing seam is a FAIL, never a fake PASS) |
| `lw-5` | Reload persistence | `Page.reload()` with the injected client; the rendered sidebar width returns to the dragged width (±1, polled up to 15 s) and the seam reports `attached:true` with the same `storeWidth`; the cache survives the reload. (The boot apply runs as soon as the layout store seat is reachable — the client retries attach briefly — so it is not a guaranteed first-paint write; the decision itself is unit-tested) |
| `lw-6` | Host route + cross-device adoption | same-origin authenticated `GET /api/power-suite.sidebar-width`. **200**: `{version:1, sidebarWidth}` must equal the dragged width (±1), then a **second fresh `--user-data-dir`** profile (same injected client, empty cache) must adopt the Host width on load (`probe().attached:true`, cache records it, 0 page errors in that profile). **404**: explicit **SKIP** row — “Host route loads after the DSH Web service restart” — the running Host process predates the merged route and the per-origin browser cache is authoritative (covered by `lw-4`/`lw-5`) |
| `lw-8` | Collapse → reopen restores the stored width | after the drag, the shell's own `[data-sidebar-toggle]` collapses the sidebar (asserting `data-sidebar-collapsed`), then `[data-sidebar-opener]` reopens it; the rendered width must return to the **stored dragged width** (±1) instead of the shell's native 280 px default, and the cache must not have been overwritten with 280. This closes the headline "reopening restores the persisted width" behavior end to end |
| `lw-7` | Cleanup restores the pre-run width + residual report | the width is dragged back to the pre-run width through the same handle; the rendered width must equal the pre-run width (±1). If the Host route is live the Host document is restored to its pre-run value (direct `POST` fallback if the debounced client write did not land) and the residual document is asserted; the throwaway-profile cache and Host document are printed honestly. Pre-restart the route is 404, no Host document is written, and only the throwaway profile's `localStorage` is written (deleted with the profile) |

The expected pre-restart `sidebar-width` route probes (client boot GET/POST, the drag save,
the `lw-6` GET and the cleanup write) are classified **separately** from real network
failures — exactly like the card's pin-route probes: while the route is absent they are
reported as `sidebar-width route probe failures (expected…)` and never fail the run; once
`GET /api/power-suite.sidebar-width` answers 200, any failure on that route is a real
defect and fails the run.

The flicker oracle is the discriminating check: running the same harness against a client
copy with the synchronous repaint removed (the pre-fix `ResizeObserver` callback
`resize(); if (motionQuery.matches) draw()`) makes `lw-3` **FAIL** on blank bitmap samples
while every other row stays green — a documented negative control, not a hypothetical.

Exit contract: **0** only when every row is PASS (explicit SKIPs allowed) with **0 page
errors** and **0 real network failures**; `1` for any failed row, page error, real network
failure or fatal error; `2` for usage errors.

### Side effects and cleanup (`--layout`)

- `--layout` creates **no Session** and types nothing; it only needs the Session the shell
  restored (smoke-3 asserts one is open and records its id, transcript/draft untouched).
- The run drags the native sidebar handle by ±40 px once and restores the pre-run width
  through the same handle in a `finally` block (also on check failures); the pre-run
  widths are printed. No other setting or file is touched.
- Browser-side writes are confined to the throwaway Chrome profile: the feature's
  `power-suite.sidebar-width` cache (and the client's own boot/drag sync probes), removed
  with the temporary `--user-data-dir` when Chrome is terminated.
- `lw-8` collapses and reopens the sidebar once through the shell's own
  `[data-sidebar-toggle]` / `[data-sidebar-opener]` controls in the throwaway page (a normal
  user gesture); it never touches the user's profile or page state.
- Host-side writes while the route is absent: **none** (the route returns 404, so the
  client's documented sync probes fail and stay `pending` in the per-origin cache).
- Once the Host route is live the feature writes the width document at boot (first-writer
  seed) and after the drag; the mode prints every POST body
  (`sidebar-width route POST {"sidebarWidth":…}`), and cleanup restores the **pre-run Host
  document value** through the client's own write and, if needed, one direct `POST`
  fallback. A pre-run `null` document cannot be cleared through the route's POST contract
  (it only accepts 264..420); the seeded document with the pre-run width is reported as the
  honest residual.
- Exit 0 requires every row PASS (SKIPs allowed), 0 page errors and 0 real network
  failures (see the route classification above).

### Known limitations (`--layout`)

- **Host coverage**: before the DSH Web service restarted, `lw-6` was an explicit
  SKIP because the running Host predated the merged route. After the 2026-11-16
  restart it is a real PASS (Host document round-trip, second-fresh-profile adoption,
  Host restore); on a Host build without the route the row stays an explicit SKIP and
  the local cache/reload path is still exercised.
- **Cross-device proof** is a second fresh Chrome profile of the same Host on this machine,
  not a second physical device.
- The flicker oracle uses real input at live frame cadence; the sample cadence (~26 ms per
  drag step + one CDP round trip) is intentionally short so the pre-fix blank window is
  observable, and the deterministic in-frame `ResizeObserver` sample removes the timing
  dependence. The per-step pixel check reads the **raw canvas bitmap** (`getImageData`), not
  the CSS-filtered composite; a non-zero grid sum means the backing store is painted.
- The current-row atmosphere needs an open Session: `smoke-3`/`lw-2` fail with an explicit
  message when the live GUI has no Session open, because the mode never creates or opens
  one (zero Host side effects).
- The one-shot drag targets `pre-run ±40 px`; when the shell's range clamps (264..420) the
  direction is chosen to stay inside it. The pre-run width is the rendered grid track, not
  an assumed default, so a user-configured width is restored exactly (and reported).
- The reload assertion covers the restored final width and the seam, not the absence of a
  brief default-width frame before the layout store seat attaches; attach is retried rather
  than guaranteed pre-paint, and the boot decision itself is unit-tested.
- The `lw-8` reopen assertion needs the shell's toggle/opener controls; the pinned
  `dsh-client-ui-sidebar@0.2.2-rc.1` renders `[data-sidebar-toggle]` and
  `[data-sidebar-opener]`, so a shell build without them fails the row loudly.
- The expected pre-restart route probes also appear as Chrome's non-JS console
  "Failed to load resource: 404" log entries; they are printed with the non-JS console/log
  count (reported for triage, not counted as page errors, and not part of the exit gate).
- The live GUI is being used while the harness runs; the mode only watches the current
  rows' canvas element identity, and live card re-sorts do not affect the native
  Workspace/Session rows used as the oracle.
### `--interrupted` checks (interrupted-state consistency fix)

`--interrupted` is the live-GUI acceptance mode for the interrupted-state consistency fix:
the card's own row must show the interrupted truth even when the card still renders the
Session as running (a parent whose own turn was interrupted while delegated subagent
children keep running), the native sidebar row that the shell still renders as running must
get both the warning badge **and** the hover Continue CTA, and the composer play control
must stay consistent. It runs the four pipeline smoke checks, enables the CDP `Network`
domain (same-origin failure predicate) and seeds **controlled** interrupted records through
the documented `__POWER_SUITE_TEST_HOOKS__.interruptedSessions` seam — no Session is
created, opened or typed into, and every controlled record is cleared in a `finally` block.

| # | Check | Oracle |
|---|-------|--------|
| `smoke-1..4` | Pipeline | Injected worktree client ran; card mounted; a current Session is open and untouched (this mode does **not** run `ensureBlankSession`, so no Session is created); 1728x900 screenshot round-trip |
| `iw-net` | Network oracle ready | `Network.enable` succeeded; the client's own `GET /api/power-suite.interrupted` probes and the real-state queries are counted (they answer 200 on this Host) |
| `iw-1` | Card mark beats the combined running state | picks a card row the card renders as **running** (prefers the current row, then a main row, then a child row), seeds `{interrupted:true, running:false}` and asserts: amber `.psd-interrupted` glyph (warn token `--dsw-alias-state-warn-primary`, localized "Task did not finish" label), the continue action (`data-actions` contains `continue`; a main row also renders `.psd-continue-slot` + `.psd-continue-inline` with the localized Continue label), and the time column is a **relative last-activity label, never a running duration**. The controlled record stays interrupted-idle. A screenshot (`iw1-card-interrupted.png`) and the baseline view JSON are written |
| `iw-2` | Native stale-running row: badge **and** hover Continue CTA | picks a native Session row the shell still renders as running (spinner in the leading cell, no custom `sidebar.session.row.leading` slot), seeds the controlled record and asserts: `data-power-suite-interrupted` on the row, a `.dps-row-interrupted` badge **in the native leading cell (never inside `[data-psd-atmos]`)** with the localized label, a decoration-injected `.dps-row-continue-slot[data-dynamic-continue="true"]` with a `.dps-row-continue` button, and on **real CDP pointer hover** (move + settle, **never a click**) the slot reaches `width 22 px / opacity 1 / pointer-events auto` with a 22×22 button, the localized label and exactly one play glyph. Screenshot `iw2-native-hover-continue.png` |
| `iw-3` | Composer play state | seeds the controlled record on the **current** Session and asserts `html[data-power-suite-interrupted="true"]`, the composer primary submit control is enabled, relabelled/titled "Continue the unfinished task" (localized), its shell send glyph is `display:none`, and the 16×16 play triangle is painted through the `::before` mask. Screenshot `iw3-composer-play.png` |
| `iw-4` | Clear restores every surface | `clear()` on every controlled id: no `.psd-interrupted`/`.psd-continue-slot`/continue action on the card row (its `data-actions` returns to the captured baseline), no marker/badge/injected slot on the native rows, the html marker is gone and the composer shell glyph is visible again with no play mask. The client may re-fetch the row's real Host record right after the clear — that is the authoritative behavior; only a still-interrupted-idle record counts as a residual. The mode reports the composer label residual honestly (the shell owns restoring its own label on the next render) |
| `iw-5` | Real-state consistency | for every Session the card/native sidebar **actually renders**, queries the live Host route `/api/power-suite.interrupted`; each `interrupted:true && running:false` Session must render the interrupted mark (card glyph / native badge) on its rendered surface. **Explicit SKIP** when no rendered Session is interrupted-idle in the live data state (the controlled iw-1/iw-2 rows still cover the fix) |

Exit contract: **0** only when every row is PASS or an explicit SKIP, with **0 page errors**
and **0 real network failures**; `1` for any failed row, page error, real network failure or
fatal error; `2` for usage errors.

Negative control (recorded): the same mode run against the **pre-fix client** copied from the
main checkout (`d90e20fb70930094ee3dca6467663c76`) fails exactly the two fixed scenarios —
`iw-1` (running card row gets no amber mark, no Continue CTA and keeps its running duration)
and `iw-2` (the stale-running native row gets no injected Continue slot) — while `iw-3` and
`iw-4` stay green; `iw-5` is the same explicit SKIP. Log:
`.tmp-work/interrupted-state/e2e/interrupted-negative-control-final.log` (gitignored).

Recorded evidence (2026-11-15, worktree `interrupted-state-fix`): fixed client
`src/client.js` md5 **926ef1bde9a8abee966bf91b46482616** (1,193,131 chars / 1,198,316 bytes), pre-fix control
client copied from the main checkout md5 **d90e20fb70930094ee3dca6467663c76**
(`.tmp-work/interrupted-state/e2e/client-prefix.js`), Node **v24.22.3**, Chrome
**157.0.8103.79**, headless 1728×900 against the live GUI. Logs/screenshots under
`.tmp-work/interrupted-state/e2e/` (gitignored).

| Run | Command | Result |
|-----|---------|--------|
| Acceptance | `node test/browser/sidebar.e2e.mjs --interrupted` | **PASS 9 / SKIP 1 / FAIL 0**, **0 page errors**, **0 real network failures**, 5.1 s, exit 0 (`interrupted-acceptance-final2.log`): seams `interruptedSessions {set,clear,record,sync}` + `interruptedState {interruptedIndicatorActive, interruptedCardMark}` present; iw-1 on the card's combined-running main row: `.psd-interrupted` "Task did not finish" `rgb(245, 158, 11)` (warn token), `data-actions="continue+new"` + `.psd-continue-slot`/`.psd-continue-inline`, time `"now"` relative; iw-2 on native row `session-4bdf12eb-…`: badge 1 + 1 decoration-injected, Continue slot **22 px / opacity 1 / pointer-events auto**, button **22×22**, one play glyph, hover by real CDP pointer and **never clicked**; iw-3 composer html marker + "Continue the unfinished task" + 16×16 play mask; iw-4 cleared 2 controlled records, 0 residual records/markers, html marker absent, composer label residual reported honestly; iw-5 explicit **SKIP** (10 visible Sessions checked against `GET /api/power-suite.interrupted`, none interrupted-idle in this data state) |
| Negative control | `node test/browser/sidebar.e2e.mjs --interrupted --client .tmp-work/interrupted-state/e2e/client-prefix.js` | **FAIL exactly iw-1 and iw-2** (running card row gets no amber mark/CTA and keeps the running duration; stale-running native row gets no injected Continue slot), iw-3/iw-4 **PASS**, iw-5 **SKIP**, 0 page errors, 0 real network failures, exit 1, 19.7 s (`interrupted-negative-control-final.log`) — the two fixed oracles are discriminating |
| Pipeline regression | `node test/browser/sidebar.e2e.mjs --smoke` | **4/4 PASS**, 0 page errors, 2.1 s, exit 0 (`smoke-regression-2026-11-15.log`) — the mode plumbing did not break the existing pipeline |

Full mode was **not** run this round (per the task); the `f6-1`/`f6-2` edits above are static
for the next full run and were not exercised.

### Side effects and cleanup (`--interrupted`)

- Creates/opens/edits **no Session** and types nothing: smoke-3 only verifies the Session
  the shell restored and records its id (transcript/draft untouched); the mode only hovers
  rows with a real pointer and never clicks.
- The only state it drives is the plugin's in-page interrupted store through the documented
  test seam (`{interrupted:true, running:false}` on one running card row + the current
  Session). Every seeded id is cleared by `iw-4` and again in the `finally` cleanup, which
  prints the residual records, native markers, card mark and html marker; the recorded run
  leaves 0 records/markers.
- The client may re-fetch real Host records after the clear (authoritative), and the
  composer's `aria-label`/`title` set by the seat can survive until the shell re-renders:
  both are reported honestly, not asserted away.
- No Host write: no Continue request is sent, no settings change, no localStorage document
  is written by the harness; the throwaway Chrome profile is removed with the temporary
  `--user-data-dir`.
- Exit 0 requires every row PASS (SKIPs allowed), 0 page errors and 0 real network
  failures.

### Full-mode oracle follow-up (`f6-1` / `f6-2`)

The fix legitimately puts a play SVG inside the native `.dps-row-continue-slot`, next to
the warning badge, for an interrupted-idle record on a row the shell still renders as
running. The untouched full-mode `f6-1` sampler counted every leading-cell SVG as a second
indicator, so its `peerSvgs` filter now excludes SVGs whose `closest('.dps-row-continue-slot')`
matches (the badge is still filtered through `.dps-row-interrupted`), and its comment now
points the stale-native-running branch at `--interrupted` `iw-2`. The `f6-2` wording that
called the card Continue CTA "deliberately suppressed while running" was refreshed: the
fixed client renders it on running card rows too (covered by `--interrupted` `iw-1`), so
that full-mode row keeps its historical idle-row focus without claiming suppression. No
other oracle changed. Full mode was **not** run this round (per the task); these are
static edits for the next full run.

### Known limitations (`--interrupted`)

- The controlled records are seeded through the test seam only when
  `window.__POWER_SUITE_TEST_HOOKS__` exists (the harness init script creates it before the
  injected client loads). A missing seam makes `iw-1..iw-4` FAIL with that exact reason.
- `iw-1` needs a card row the card renders as **running** and `iw-2` needs a native row the
  shell still renders as running (stale spinner). In a data state with neither (nothing
  running at all), those rows are explicit SKIPs with the reason; the mode never
  fabricates activity and never creates a Session to manufacture one.
- The live GUI is being used while the harness runs, so the card can re-sort between the
  seed and the assertion; the checks poll the DOM/title and the seam record, and re-read the
  view once for the post-clear assertions.
- `iw-5` is only executed when the live data contains a genuinely interrupted-idle Session
  on a rendered surface; otherwise it is an explicit SKIP. It never invents real state.
- The composer label restoration is shell-owned (the seat only sets it while interrupted);
  `iw-4` reports a residual label honestly instead of asserting it.
- The negative control proves the two fixed oracles are discriminating; it intentionally
  exits 1 and is not part of a green acceptance run.

### `--row-menu` checks (card row "…" menu = native shared context-menu popup)

`--row-menu` is the live-GUI acceptance mode for the row "…" menu alignment: the card row
menu must be the **same native shared popup** the native DSH Session row opens (the
`@deepseek-ai/dsh-client-ui-context-menu` / primitives `Menu` surface), matching its
material, icons, shortcut hints, separators and afterContent footer, with exactly the
Pin/Unpin entry filtered out. It runs the four pipeline smoke checks, enables the CDP
`Network` domain and drives both menus with **real CDP pointer input**; it never creates or
types into a Session, never clicks an action item (Escape only) and closes anything it
opens in a `finally` block.

| # | Check | Oracle |
|---|-------|--------|
| `smoke-1..4` | Pipeline | Injected worktree client ran; card mounted; a current Session is open and untouched (this mode does **not** run `ensureBlankSession`, so no Session is created); 1728x900 screenshot round-trip |
| `rm-net` | Network oracle ready | `Network.enable` succeeded; same-origin API/document failures fail the run |
| `rm-1` | Native Session row menu capture | reveals the native Workspace groups like a user, hovers a non-blank `[data-row-key="session:…"]` row and opens its **native "…" trigger** with a real click (right-clicking the row does not open this shell's row menu; the native trigger is the reachable path). Captures and sanity-asserts the shared surface: `[data-menu-material="translucent"]` with `role="menu"`, its class list and computed styles, every `[role="menuitem"]` label/order/`aria-keyshortcuts`/rendered `kbd` texts/icon SVG outerHTML, separators, and the afterContent footer (`Archive`). Dismisses with Escape |
| `rm-2` | Card row menu = native popup minus Pin/Unpin | opens OUR `.psd-run-more` menu on a top-level running/recent row, moves the pointer onto the menu surface (natural position; also lets the row hover card dismiss) and compares it with the rm-1 capture: **(a)** same native surface — `[data-menu-material="translucent"]` present, class list identical to the native surface, `role="menu"`, exactly one `[role="menu"]`, **zero `.psd-menu` custom surfaces**; **(b)** computed material identical (background-color/image, backdrop-filter, border, border-radius, box-shadow, padding; plus the backing `_material_` layer's background/backdrop), and per-item height/font-size/classes identical; **(c)** item labels/order equal the native list with **exactly the Pin/Unpin entry removed** (Pin absent; `Show in Finder` and the other native/plugin actions kept); **(d)** `aria-keyshortcuts` and rendered `kbd` text equal the native hints for every shared action; **(e)** icon SVG outerHTML equal to the native keyed icon for every shared action; **(f)** the `Archive` afterContent footer region (classes, item labels, separator) matches the native footer and the total separator structure matches; **(g)** while open the row keeps `data-menu-open="true"` and the time↔"…" swap (time opacity 0, trigger opacity 1), and **Escape dismisses** the popup and **restores focus to the `.psd-run-more` trigger** (sampled after the native ~80 ms exit animation + unmount, polled, never faked); `data-menu-open` clears and the time/trigger swap restores after the pointer leaves. Screenshots + JSON evidence are written |
| `rm-3` | Second-row replacement (one shared popup) | opens the menu from the lower visible top-level row, then opens the other (upper) row's trigger while the first menu is open; asserts exactly **one** shared popup remains, both rows are the native popup, `data-menu-open` moves to the active row, and Escape dismisses. The replacement click is geometrically verified (at plan time and again immediately before the click) NOT to be covered by the open menu surface, so it can never land on an action item; if the only second trigger is covered, or only one menuable row exists, the row is an explicit SKIP |

Exit contract: **0** only when every row is PASS (explicit SKIPs allowed), with **0 page
errors** and **0 real network failures**; `1` for any failed row, page error, real network
failure or fatal error; `2` for usage errors.

The negative control is required and recorded: the same mode run against the **pre-fix
client** copied from the main checkout (md5 `c91e97be04aef561d7c267e9092b0f2f`, which still
has the old custom `.psd-menu` popup) must fail `rm-2` with the custom surface / missing
material / missing shortcut hints / different icons, while `rm-1` still passes and `rm-3`
is an explicit SKIP (not the native popup, so replacement semantics do not apply). Logs
under `.tmp-work/row-menu/e2e/` (gitignored).

### Side effects and cleanup (`--row-menu`)

- Creates/opens/edits **no Session** and types nothing: the mode only hovers rows, clicks
  the row's own "…" triggers (never an action item), and dismisses with Escape. Smoke-3
  only verifies the Session the shell restored and records its id.
- Never clicks Rename / Fork / Copy Session ID / Show in Finder / Archive or any other
  menu entry: every dismissal is Escape (the mode's only clicks are the two/three menu
  triggers, and the replacement click is rect-checked against the open surface first).
- The `finally` cleanup dismisses any popup left open by a failed check through Escape only
  (pointer over the native surface first when one exists, pointer parked off the row for
  the legacy custom popup), then prints the residual open state, `[role="menu"]` count,
  `.psd-menu` count and rows still marked `data-menu-open` honestly.
- No Host write: menu actions are never executed, no settings change, no localStorage
  document is written by the harness; screenshots and capture JSON are written to the
  gitignored `.tmp-work/row-menu/e2e/` directory and the throwaway Chrome profile is
  removed with the temporary `--user-data-dir`.
- Exit 0 requires every row PASS (SKIPs allowed), 0 page errors and 0 real network
  failures.

### Known limitations (`--row-menu`)

- `rm-1` needs at least one rendered **non-blank** native Session row whose "…" trigger is
  reachable after expanding the native Workspace groups like a user. On an empty sidebar
  the check fails with the rendered-row snapshot; it never fabricates activity.
- **Hover-card Escape interplay**: while a card row's hover card is open, the plugin's own
  window-capture Escape handler closes the tooltip first and stops propagation, so a first
  Escape with the pointer still over the row closes the tooltip rather than the menu. That
  is pre-existing plugin keyboard behavior, not the native popup: the mode moves the
  pointer onto the menu surface (where a user naturally is when choosing an item) and then
  asserts Escape dismissal + focus restore. `rm-2` records the hover-card count before
  Escape and requires it to be 0.
- The native popup animates out (~80 ms) and unmounts after the exit animation, and focus
  restore settles with the dismissal; `rm-2` polls the post-animation state for up to
  2.5 s and asserts the restore strictly (a missing restore fails, never passes silently).
- Surface class hashes are compared **native-vs-ours in the same page/build**, so a shell
  stylesheet rename is not hardcoded; item counts/labels come from the same native
  resolution the card delegates to.
- `rm-3` needs two visible top-level menuable card rows and a second trigger not covered by
  the open menu surface; otherwise it is an explicit SKIP (the safe-click rule wins over
  the optional check).
- Full mode was **not** run in this round; `b2-3`'s swap/hover-paint assertions are
  unchanged by the popup alignment.

### Recorded evidence (`--row-menu`, review-fix client, 2026-11-16)

Worktree `row-menu-native-popup`, **fixed client** `src/client.js` md5
**2b700ff6db6f8ba500a8e5feadd4079b** (1,226,770 chars / 1,231,955 bytes, 24,774 lines;
contains the extracted, unit-tested `dwRowMenuResolve` delegation with the bounded
800 ms nested `ready` wait + published-views fallback). **Pre-fix control** copied from the
main checkout `src/client.js` md5 **c91e97be04aef561d7c267e9092b0f2f** to
`.tmp-work/row-menu/e2e/client-prefix.js`. Node **v24.22.3**, Chrome **157.0.8103.79**,
headless 1728x900 against the live GUI; logs/screenshots/JSON under
`.tmp-work/row-menu/e2e/` (gitignored).

| Run | Command | Result |
|-----|---------|--------|
| Acceptance | `node test/browser/sidebar.e2e.mjs --row-menu` | **PASS 8 / SKIP 0 / FAIL 0**, **0 page errors**, **0 real network failures**, 16.9 s, exit 0 (`row-menu-acceptance-2026-11-16.log`): rm-1 native menu 6 items `["Pin session","Rename","Fork session","Copy Session ID","Show in Finder","Archive session"]` (the entry is `Pin session` or `Unpin session` depending on the row's pinned state; both are filtered), material `translucent`, surface `_surface_1w4el_1 _list_1p5el_7 _scrollable_1p5el_19 _portal_1p5el_46`, shortcuts `Rename[⌥⌘G]`, `Fork session[⇧⌘F]`, `Archive session[⌥⌘A]`, 2 separators, footer `["Archive session"]`; rm-2 same surface/material/computed styles, **5 items = native 6 minus the Pin/Unpin entry**, identical shortcut hints and icon SVG markup for every shared action, 34 px item height / 13 px font, same footer placement, row kept `data-menu-open="true"` + time↔trigger swap, Escape dismissed and **focus returned to `.psd-run-more`** after the exit animation; rm-3 menu moved from the lower row to the upper row with exactly one shared popup and `data-menu-open` following the active row |
| Negative control | `node test/browser/sidebar.e2e.mjs --row-menu --client .tmp-work/row-menu/e2e/client-prefix.js` | **exit 1**: `rm-1` **PASS**, `rm-2` **FAIL** with `no [data-menu-material] native shared surface; legacy custom .psd-menu surface present (1); no keyboard-shortcut hints rendered in the card menu; icon SVG markup differs for Rename, Fork session, Copy Session ID, Show in Finder, Archive session`, `rm-3` explicit **SKIP** (not the native popup), **0 page errors**, **0 real network failures**, 14.3 s (`row-menu-negative-control-final.log`) — the native-popup oracle is discriminating |
| Static | `node --check test/browser/sidebar.e2e.mjs`; `node --check src/client.js` | exit 0 |

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
- The `--live` mode is read-only apart from the shipped client's own background behavior:
  no pin/unpin, no settings change, only the card's own "View all" view-state click. Once
  the sidebar-width Host route is live, the shipped client's boot sync can **seed**
  `$DSH_HOME/dsh-power-suite/sidebar-width.json` from the rendered width on each page load
  (first-writer seed); this is the feature's documented behavior, not a harness write.
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

**Final merged build `54e4cba` / client md5 `d5aa7a114128cd5809d15db52d8e714b`:** the
last annotation merge (`17be49a`) was confirmed on the merged client (worktree = linked, no
restart, unit tests 254/254, check exit 0). Annotation scenarios **2/5/8 all PASS 7/0/0**
(9.3 s / 7.8 s / 11.5 s, 0 page errors, 0 network failures; S2 now passes with the merged
`chatProbePoint` + `composerExemptionProbe` oracle, S5 batch insert and S8 sidebar/T25 stay
green). Sidebar suite: `--pin` **28/0/0** (81.7 s, r3-host + cross-device r3-8 PASS, Host
cleaned, `/tmp/t49-pin.log`), `--live` **4/4**, `--smoke` **4/4**, full mode **43/43** on the
fourth attempt (`/tmp/t49-full-4.log`) — the first three attempts were each 42/43 with a
different non-reproducible hover/animation flake (`f4-1`, known `b4-1` saturation 0.376 vs
0.38, `b5-2` dark tooltip delay), each passing on another attempt, and no pin/two-phase/
annotation-usability row failed. Lead probe on this md5 confirms the usability fixes
survived (composer clicks `prevented=false`, drag +80/+60 on-screen, footer primary → chip,
heading 14 px/400).

### Alignment, prompt-history order and borderless surfaces, merged build `3fa4f1c` (client md5 `5da30708…`)

Merged client build `3fa4f1c` / md5 `5da3070817cc5d5fa21dd56668fce865` (21393 lines, no
restart, Host pin route live, unit tests 254/254, check exit 0). Default-state alignment
(option C): the title's first character is centred on the child status-dot column via a
measured per-row `--psd-title-shift` (½ first-glyph advance, 1–3 px) — rest title 46 + shift
(CJK 47, Latin 48.91 with shift 2.91; first-char centre 54), hover/focus/pinned force shift 0
so the expanded title stays 71; the two-phase slide is therefore **25 − shift** (≈22–24 px).
Prompt history is oldest-first with the newest tick at the rail's foot (`data-psp-index`
ascending top→bottom) and scrolls to the bottom when it overflows. Power Suite outer surfaces
are **borderless** (annotation launcher + count badge, rail docked/overlay, exit dialog,
undo/feedback toasts, empty-state hints, Running & recent panel card) while inner controls
keep their borders. Oracle updates: `r3-2`/`r3-3`/`r3-4`/`r3-9`/`r3-14` derive the rest title
from the measured first-glyph width and assert `titleLeft + firstCharWidth/2 ≈ 54 ±0.6`;
full-mode `b2-3` asserts the derived `25 − shift` slide; new `r3-16` (borderless panel) and
`b3-3` (rail order/foot), plus annotation-harness border assertions (smoke launcher/rail/
empty, exit dialog, undo/feedback toast). Results on this md5: `--pin` **29 PASS / 0 SKIP /
0 FAIL** (73.5 s, `/tmp/t50-pin-2.log`; panel border `0/0/0/0`, Host cleaned), `--live` 4/4
(7.0 s), `--smoke` 4/4 (2.3 s), full mode **44/44** (54.5 s, `/tmp/t50-full-1.log`; `b3-3`
rail 7 ticks 1..7 newest at the foot, list fits without overflow so the scroll-bottom branch
was not exercised), annotation S2/S5/S8 **7/0/0 each** (9.7/8.0/11.8 s, border assertions
green, `/tmp/t50-ann-s{2,5,8}.log`). Gap: rail overflow/scroll-bottom is conditional and not
exercised in this session (Lead probe verified overflowing 1..20).

### Alignment right-bias + ring-free launcher, merged build `7014ec9` (client md5 `e6949505…`)

Merged build `7014ec9` / md5 `e6949505f344511438a1784ddb1379b2` (21396 lines, no restart, Host
route live, unit tests 254/254, check exit 0). The default-state first-character alignment
now carries a requested **+2 px right bias**: `shift = max(0, 10 − firstGlyph/2)` (CJK 3 px →
title left 49, centre 56; Latin “U” 4.91 px → 50.91 / 55.99), so the character centre sits
2 px right of the child-dot centre 54; hover/focus/pinned force shift 0 → title 71. The
annotation launcher is now a truly ring-free circle: `border-width 0/0/0/0`,
`border-radius 50%`, computed `corner-shape: superellipse(1)` (so the shell's
`superellipse(1.5)` cannot render a squircle), 44×44, and a soft shadow with **no 0/0/0
component** (`0 2px 6px rgb(0 0 0/10%), 0 8px 24px rgb(0 0 0/20%)` instead of the
dark-theme elevation hairline). The annotation rail overlay, exit dialog and feedback/undo
toasts use the same ring-free shadow. Oracle updates: rest range `48 < titleLeft < 53`,
`titleLeft + firstCharWidth/2 ≈ 56 ±0.6`, `shift ≈ 10 − firstGlyph/2`, rest
`margin-left = shift` (r3-2/r3-3/r3-9/r3-15); full-mode `b2-3` uses `25 − measured rest
marginLeft`; annotation harness asserts launcher circle/border/shadow (plus rail overlay/
dialog/toast ring-free shadows when present). Results: `--pin` **29/0/0** (74.5 s,
`/tmp/t51-pin-1.log`; rest 50.91/shift 4.91/centre 56, expanded 71, Host cleaned),
`--live` 4/4 (9.9 s), `--smoke` 4/4 (3.0 s), full mode **44/44** (56.4 s,
`/tmp/t51-full-2.log`; first attempt 43/44 only the known `b4-1` flake; `b2-3` slide 20.09 =
25 − 4.91; `b3-3` rail 39 ticks 1..39, newest at foot 731 = rail bottom 731, scrolled to
bottom 232/232), annotation S2/S5/S8 **7/0/0 each** (9.3/8.2/12.5 s,
`/tmp/t51-ann-s{2b,5,8}.log`, launcher circle/shadow assertions green).

### Known limitations (`--pin` / `--live`)

- The row "…" menu opens the shell's native shared context-menu popup; only the
  **Pin/Unpin entry is filtered out** by design (the title-left pin button owns
  pinning). The trigger keeps the ordinary soft hover paint (plus the keyboard
  `focus-visible` ring); only the rainbow row suppresses it. Every top-level row
  (the current rainbow row included) keeps its time at rest and swaps it for the
  trigger on hover/focus or while the menu is open, restoring it on leave;
  nested subagent rows have no trigger.
- Pending interactions are **inline flags**, not a popup: a waiting Session gets
  one amber `flag-fill` before its title in the card row and in the native
  Workspaces row; the flag is decorative, every waiting Session is flagged (no
  cap), and clicking the row opens the Session. It is unit-tested and
  live-probed with synthetic data, but the real
  `SessionStatus.pendingInteraction` show/hide lifecycle is not part of a
  committed E2E scenario.
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
  the card. `--live` is read-only except for the shipped client's own boot sync, which can
  seed the sidebar-width Host document once that route is live.
- Headless Chrome on one display/zoom level and the GUI's current UI language (English
  labels observed; ZH copy is unit-tested only). Chrome normalizes
  `corner-shape: round` to `superellipse(1)`, so the R1 oracle compares against a synthetic
  control rather than the literal keyword.
- `--live` requires the linked checkout to be merged to the branch tip; it proves the
  served client, not the worktree-only code, and does not restart the service.

## README Bento capture modes (`--readme-chat` / `--readme-dashboard`)

These two modes capture the raw screenshots the repository README's composed
Bento images are built from. They run against a **temporary, isolated DSH
instance** (`DSH_HOME=/tmp/ps-readme-home`, own web profile on 127.0.0.1:3199,
the checkout installed as a local `link:` bundle), never against the production
GUI. Both force `prefers-color-scheme: light`, use DPR 2 at a 1728×900
viewport, hide or mask user-visible strings, and write their raws plus a
`captures.json` manifest (source selector, crop rectangle, DPR, pose, masking
state, privacy-scan result) to `.tmp-work/readme-shots/raw/` (gitignored).

```bash
URL="$(cat /tmp/ps-readme-home-url.txt)"   # token never printed or committed
node test/browser/sidebar.e2e.mjs --readme-chat      --url "$URL"
node test/browser/sidebar.e2e.mjs --readme-dashboard --url "$URL"
```

- **`--readme-chat`** — creates a blank demo Session, sends a short generic
  prompt (release checklist), waits for the real model answer (asserting the
  user message appeared and the turn settled), captures `composer-chat.png`
  with the answer, composer, open prompt-history search card and hover preview
  (sidebar hidden), enters annotation mode, annotates two or three real answer
  elements with requirement texts, captures `annotation-annotated.png` and —
  after “Insert all into composer” — `annotation-inserted.png` full-page at DPR
  2, then exits annotation and archives the demo Session.
- **`--readme-dashboard`** — captures `workspaces`, `card`, `card-hover`,
  `row-menu`, `interrupted-row`, `interrupted-composer`, `artifacts` (ten
  stubbed rows), `artifacts-quicklook`, `artifacts-filter` and `settings` from
  the demo data seeded in the isolated instance.
- **Privacy gate (hard requirement)** — before every shot the dashboard mode
  masks native Session/Workspace titles and paths, card titles, hover-card text
  and prompt previews (transcript hidden where it can enter a crop), then scans
  the crop's roots, the clip region and the page for `/Users/`, the user name,
  `http(s)://`, `token=`, the checkout path and CJK characters. Zero hits are
  required; a leaky crop is discarded and its pose fails. The chat mode hides
  the whole sidebar and shows only the demo prompt/answer. The token is never
  printed or written into the repo.
- **Stub poses** — the Artifacts poses stub `GET /api/session-artifacts.list`,
  `.raw` and `.preview` through CDP `Fetch` with demo artifacts only; the Quick
  Look pose shows a stubbed demo Markdown document. The stubs mirror the real
  route response shapes.
- **Isolation limits** — the native add-workspace flow opens the browser File
  System Access directory picker and cannot run headlessly, so the isolated
  instance uses one demo Workspace (`ps-readme-workspace`) with six demo
  Sessions (four short generic model turns, one blank, one archived task
  session); Inactive Projects and pinned/running/child rows are therefore empty
  in the dashboard raws (recorded in `captures.json.deviations`). The
  interrupted poses use the documented test seam.
- **Recorded runs (2026-11-16)** — `--readme-chat` **PASS 1 / SKIP 0 / FAIL 0**,
  0 page errors, 43.4 s; `--readme-dashboard` **PASS 12 / SKIP 0 / FAIL 0**, 0
  page errors, 40.0 s. Teardown after composition:
  `pkill -f "dsh web --port 3199"`, then remove `/tmp/ps-readme-home` and
  `/tmp/ps-readme-home-url.txt`.

## Update prompt harness
## Update prompt harness

`update-prompt.e2e.mjs` is the local-only acceptance harness for the in-app
update notice (`docs/update-check.md`). It is not wired into CI: it needs the
running DSH UI and a token URL, like the suites above.

```bash
node test/browser/update-prompt.e2e.mjs
```

It opens the real GUI in a throwaway headless Chrome, stubs only
`GET /api/power-suite.update` through the CDP Fetch domain, and drives the
installed client card: appearance/geometry/version line, highlights
expand/collapse, later persistence, the three-later "do not remind" step,
per-version silence, update navigation to the plugin manager surface, and the
silent no-update/failed-route paths (21 checks). It never writes the profile,
the Host, or the running plugin.
