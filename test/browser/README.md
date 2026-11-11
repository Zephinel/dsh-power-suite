# Browser end-to-end acceptance harness (UI element annotation)

`annotation.e2e.mjs` drives the **real running DSH Web GUI** with a throwaway headless Chrome
and asserts the nine acceptance scenarios of the UI element annotation mode
(`CONTRACT.md` §4.2). It injects this worktree's `src/client.js` into the live page without
touching the installed checkout, the profile or the launchd service.

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
5. Creates/opens one blank session through the native New Session flow, then runs the nine
   scenarios with **real CDP input** (`Input.dispatchMouseEvent`,
   `Input.dispatchKeyEvent`, modifier bitmask Alt=1 Ctrl=2 Meta=4 Shift=8; real wheel and
   `Input.insertText`). Nothing is synthesized for blocking / pass-through / drag assertions.
6. Collects page errors (`Runtime.exceptionThrown` and error-level
   `Runtime.consoleAPICalled`), prints a PASS/FAIL table and exits non-zero when a scenario or
   the page-error check fails.

## Prerequisites

- Node.js **22 or newer** (uses the global `fetch`/`WebSocket`; developed on Node 24.22.2).
- Google Chrome at the standard macOS path, or `CHROME_BIN` pointing at the binary.
- The DSH Web GUI running from the existing launchd service
  (`com.rexxin.dsh-web`, https://192.168.5.210:3080). Do **not** restart or install anything
  for the harness.
- A token URL: leave `DSH_WEB_URL` unset and the harness asks `~/.local/bin/dsh-web url --ip`;
  a `DSH_WEB_URL` without `token=` is treated as unauthenticated and the harness falls back to
  the CLI. The token is always redacted from output.
- The worktree client (`src/client.js`) must contain the feature (the harness injects it
  read-only; it never edits `src/**`).

## Options

```text
node test/browser/annotation.e2e.mjs                 full run: smoke + 9 scenarios + screenshots
node test/browser/annotation.e2e.mjs --smoke        pipeline smoke only
node test/browser/annotation.e2e.mjs --shots-only   screenshots only (no scenario assertions)
node test/browser/annotation.e2e.mjs --assets       write screenshots to docs/assets instead of /tmp
node test/browser/annotation.e2e.mjs --client PATH  inject a different client.js (e.g. a baseline)
node test/browser/annotation.e2e.mjs --scenario 8   run exactly one scenario (debugging)
node test/browser/annotation.e2e.mjs --from 7       run scenarios 7-9 (debugging)
node test/browser/annotation.e2e.mjs --no-shots     skip screenshots
node test/browser/annotation.e2e.mjs --keep-open    leave Chrome running (prints pid/CDP/profile)
node test/browser/annotation.e2e.mjs --headful      show the browser window
```

Environment: `DSH_WEB_URL` (token URL override), `CHROME_BIN` (Chrome binary override).

Default screenshots are written to `<tmpdir>/psa-e2e-shots/`; use `--assets` (or copy the
reviewed files) to publish `docs/assets/annotation-idle.png`, `annotation-mode.png`,
`annotation-selection.png`, `annotation-collection.png`, `annotation-inserted.png`.

## What is asserted

| # | Scenario | Oracle |
|---|----------|--------|
| 1 | Activate via a real launcher click; layout shrinks and the rail appears; native New Session is blocked | `html[data-psa-active]`, `frame[data-psa-frame]`, `padding-right` equals computed rail width (±2 px), inline grid untouched, rail inside the right strip; blocked real click: 0 hits on the native control's own listeners, ≥1 `preventDefault`, session id / sidebar row count / view unchanged |
| 2 | Alt pass-through restores real native semantics; native context menu is not intercepted | Real Alt+click on New Session reaches the native handler and opens a conversation; `html[data-psa-passthrough]` only while held; contextmenu oracle via an instrumented `Event.prototype.preventDefault` log plus a document-start bubble-phase recorder: blocked right-click is prevented and never reaches the bubble listener, Alt+right-click appears exactly once with `defaultPrevented === false` |
| 3 | Wheel scrolling and browser shortcuts are untouched; Esc ladder steps out | native scrollable scrollTop changes, 0 wheel `preventDefault`; Meta+K / Control+L / plain letters delivered with `defaultPrevented === false`; first Esc clears selection/popover, second Esc leaves the mode |
| 4 | Shift+click multi-select, collection add/update/note/remove | 3 multi outlines + rail "3 elements selected"; add-all creates 3 entries; re-add flips Add → Update, count unchanged + "updated" feedback; inline rail note edit; remove one |
| 5 | Batch insert order, existing draft preserved, never sent, composer focused | typed draft stays verbatim before the inserted block, one ordered block per entry, no message/transcript/DOM change, session id unchanged, composer focused |
| 6 | Removed targets are stale; cross-session entries are scoped and skipped; no page mutation | workspace row truly unmounted by a native sidebar collapse → `data-psa-status="missing"` + `Status: target no longer resolves` marker line in the inserted text; leaving the conversation scopes every entry `other`, disables batch insert and shows the cross-session notice; returning recomputes every entry `current`, re-enables batch insert and inserts without the skip line; native element count outside the composer unchanged |
| 7 | Exit cleans up completely; native clicks work again; launcher stays | no `[data-psa-active]`/passthrough/frame markers, `padding-right === ''`, `--psa-rail-width` removed, inline grid equal to pre-mode, 0 overlay nodes, launcher exactly once and inactive, native New Session works again |
| 8 | Launcher drag/resize/scroll/reload geometry | real mouse drag clamps with the 8 px margin and never toggles the mode; after the viewport override the launcher is polled until fully inside 1000x700; wheel scroll does not move it; after reload the mode is off by default and the remembered position is restored |
| 9 | Collection view keeps the rail/frame geometry; exit restores the baseline | opening/closing the collection leaves frame padding and canvas width unchanged, rail stays in the right strip without a wide drawer; exit restores the pre-mode canvas width and inline grid |

Page errors must be **0** for the run to exit 0.

## Side effects and cleanup

- Creates/reuses blank sessions in the live GUI through the native New Session flow. Every
  `data-conversation-session` id the run touches is printed at the end
  (`created/reused sessions: …`); the Lead removes them afterwards.
- Never sends a message, never changes DSH settings, never edits the profile or the installed
  checkout. Scenario 6 leaves the conversation (Plugins page) and returns through the native
  New Session flow; no user session is opened.
- Chrome is always terminated (`SIGTERM`, then `SIGKILL`) and the temporary profile directory
  is removed in a `finally` block, including on failures.

## Known limitations (documented, not product defects)

- **Native context menu visuals** are not observable in headless Chrome: the assertion is the
  event-level `preventDefault`/bubble oracle described above.
- **Single blank draft session per workspace**: this DSH build keeps one draft session at a
  time, so a blank-draft → blank-draft session switch cannot be reached from the UI. Scenario 6
  therefore exercises the cross-session scope transition by unmounting/remounting the composer
  seat (leave to Plugins → every entry `other`, batch disabled; return → every entry `current`,
  batch enabled) and verifies the true-removal case separately. An in-place replaced control
  that keeps the same stable `data-*` identity (the sidebar collapse toggle, which carries
  `data-sidebar-toggle` in both states) is reported by the product as `resolved`; the harness
  records it as evidence instead of failing.
- **Wheel over the conversation**: a blank session has an empty, non-scrollable conversation, so
  the wheel assertion uses the nearest native scrollable region (the sidebar session list) and
  also asserts that no wheel event is `preventDefault`ed.
- **Headless Emulation resize event**: headless Chrome occasionally swallows the native
  `resize` event for `Emulation.setDeviceMetricsOverride`. The harness polls the clamped
  launcher geometry, retries with a second real viewport change, and — only when the browser
  delivered zero native `resize` events — dispatches one synthetic `resize` event to exercise
  the product's resize path. The native path is exercised whenever the event arrives; the Lead
  independently verified the product's resize clamping with real input.
- **Long-run renderer stalls (S8)**: after ~7 minutes of continuous automation the headless
  renderer can stop acknowledging `Input.dispatchMouseEvent` for tens of seconds even after the
  page reload that scenario 8 performs; the harness retries the dispatch once and then reports a
  scenario timeout. Scenario 8 passes deterministically on the same build when run in a short
  sequence (`--from 8`): drag clamp (1676,848), Emulation 1000x700 clamp (748,648), stable under
  wheel scroll, remembered after reload while the mode is off. This is a harness/environment
  limit, not a product signal; S9 then cascades from a failed S8 (its viewport reset is
  best-effort and the renderer may still be stalled).
- **Launcher position in mode (resolved during acceptance)**: an early build let the launcher's
  default bottom-right position overlap the collection view's rail footer actions. The shipped
  build clamps the launcher just left of the rail column whenever the rail is visible, so the
  footer stays clear; the docs screenshots are taken from the fixed build with the natural
  position and do not move the launcher by hand.
- **Ego-browser / other automation layers** may refuse clicks behind the annotation popover
  (`role="dialog"`); raw CDP input used here is unaffected. Dismiss the selection with Esc
  before clicking underlying page controls in other tools.

## Runtime

- Pipeline smoke: ~10 s.
- Full run (smoke + 9 scenarios + screenshots): ~4-8 min on the live GUI at 1728x900. Late in a
  long run the live renderer can become briefly unresponsive; scenario 8 reloads the page first
  and every scenario resets the emulated viewport afterwards so a failure cannot cascade.
- `--shots-only`: ~35 s.

## Troubleshooting

- `dsh web authentication required`: the resolved URL had no token — unset `DSH_WEB_URL` or
  pass a token URL whose query contains `token=`.
- `Chrome did not expose a CDP port`: check `CHROME_BIN`, and that no other process is using the
  same temporary profile (each run uses a fresh one).
- A scenario reports a timeout on `Input.dispatchMouseEvent`: the live GUI may be busy; re-run.
  Keep only one harness instance running at a time.
