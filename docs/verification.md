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

Current evidence (2026-11-11, Node 24.22.2):

- `npm test`: **49 tests, 49 passed, 0 failed**.
- `npm run check`: passed.
- `npm run pack:check`: **44 files** (0.2.0 tarball), including `src/`,
  `locale/`, `docs/` (with the two new captures), `cordis.patch.yml`,
  `icon.png`, and the standard repository files.
- Host tests cover the read-vs-event cache race, silent-subagent timing, continue
  content-type/state/in-flight validation, the non-human source fields, and the
  prompt-history timestamp fold (`at` from a finite event time, `null`
  otherwise) with the 500-prompt cap unchanged.
- Neither new surface adds a Host route: Dynamic Workspaces derives its buckets
  and summary card from the browser's Session, status, and Workspace stores, and
  the prompt-history preview shares the existing `api/prompt-history.list`
  payload. The preview's data coverage is the shared fold tests; Dynamic
  Workspaces is client-only with no `node:test` suite of its own, so the syntax
  gate and the live checks below cover it.
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

- Artifacts panel: list, Open/Download/Copy actions, missing files hidden.
- Hover Quick Look on Artifacts rows and native Workspace files: Markdown,
  highlighted code, images, PDF/HTML, resize persistence, outside-click
  dismissal, animated switching.
- Settings page: shortcut modifier selection and persistence.
- Workspace preset menu and routing.
- Interrupted-session badge, Continue action, and composer play control.
- Dynamic Workspaces on the running 0.2.2-rc.1 Host: group reordering worked
  live in both directions using a throwaway Session; the running & recent card
  (including the retention linger, with nested subagent rows visible in the
  capture), rail hide/restore, and coexistence with the native Workspaces search
  all passed.
- Prompt history preview on the same Host: the always-visible panel, its hover
  full-text popover, and per-row timestamps are shown in the capture below. After
  the Host plugin was reloaded (profile recomposition, with the profile patch
  restored afterwards) the route served `{ seq, text, at }` and the preview
  rendered the row times; the timestamp fold is also covered by the node tests.

The manual checks are evidence for the behavior described in the feature docs;
they are not a substitute for the automated gate above.

An independent read-only verification pass (separate agent, own browser
session) then re-ran the live checks against this checkout: it returned PASS for
all three additions (buckets and fold persistence, the running & recent card
including nested subagent rows and row opening, and the preview panel including
timestamps, hover popover, copy-to-draft, and search) with no blocker or major
defect. Its minor findings were fixed before the final gate: the preview row
keeps its prompt text in the accessible name (action hint moved to a hidden
span), the footer count is singular-aware, and the dynamic-Workspaces effects
re-arm the liveness flag on remount. Residual risks it explicitly could not
exercise: elapsing the full 12-hour retention window, the alternate View-options
grouping modes, the empty-card state, and screen-reader behavior with a real
assistive technology; the archived-row exclusion is covered by code inspection
plus an observed reload where an archived Session disappeared from the card.

The two new live surfaces are captured in
[assets/dynamic-workspaces.png](assets/dynamic-workspaces.png) and
[assets/prompt-history-preview.png](assets/prompt-history-preview.png) and
embedded in their feature references.
