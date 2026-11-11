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
- `npm run pack:check`: **47 files** (0.2.0 tarball), including `src/`,
  `locale/`, `docs/` (with the Dynamic Workspaces, hover-detail, and
  prompt-history rail captures), `cordis.patch.yml`, `icon.png`, and the standard
  repository files.
- Host tests cover the read-vs-event cache race, silent-subagent timing, continue
  content-type/state/in-flight validation, the non-human source fields, and the
  prompt-history timestamp fold (`at` from a finite event time, `null`
  otherwise) with the 500-prompt cap unchanged.
- None of the browser-only features adds a Host route: Dynamic Workspaces
  derives its buckets and summary card from the browser's Session, status, and
  Workspace stores; the prompt-history rail shares the existing
  `api/prompt-history.list` payload; draft attachment memory writes nothing to
  the Host or storage. Their data coverage is the shared fold tests where a
  route is involved; the rest is client-only with no `node:test` suite of its
  own, so the syntax gate and the live checks below cover them.
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
- The prompt-history rail was verified live after its second refinement round:
  the prompt ticks sit on the native turn-rail column (our mark right edge 2529
  equals the native tick right edge), resting at 60 % width with the 90 % hover
  growth and the brand hairline on keyboard focus; the horizontal 24 x 1 px
  divider is right-aligned between the native rail and the first tick; no
  scrollbar is visible while the mark column still wheel-scrolls. It showed 8
  marks for the development Session and 65 marks for a long-session test; the
  native-style hover card showed the full prompt text and its time; clicking a
  mark copied the exact prompt into the Lexical draft. The search card opens
  directly below the magnifier (6 px gap) with its right edge on the tick column
  (2529), contains 0 buttons, and a blank pointer press outside closed it and
  cleared the filter with all 65 marks restored; `Showing N of M` filtered
  correctly. No console errors were reported and `node --check src/client.js`
  plus `node --test test/*.test.js` stayed green.
- The Dynamic Workspaces card was verified live after its refinement: rows are
  single-line (dot, title, time) with disclosure chevrons at the far right; the
  hover card shows Workspace (title + path), Status with time, Last active as an
  absolute timestamp, and the running subagent count; header toggle, **View
  all**, and header chevron all measure 30 px with the same 12 px corner radius;
  bucket chevrons sit at the far right after the count; and the subagent
  connector trunk is centered under the parent's status indicator (dot center
  x = 35, trunk x = 35) with short branches and no dangling end.

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
explicitly could not exercise: elapsing the full 12-hour retention window, the
alternate View-options grouping modes, the empty-card state, and screen-reader
behavior with a real assistive technology; the archived-row exclusion is covered
by code inspection plus an observed reload where an archived Session disappeared
from the card.

The live surfaces are captured in
[assets/dynamic-workspaces.png](assets/dynamic-workspaces.png),
[assets/dynamic-workspaces-hover.png](assets/dynamic-workspaces-hover.png),
[assets/prompt-history-preview.png](assets/prompt-history-preview.png), and
[assets/prompt-history-search.png](assets/prompt-history-search.png), embedded
in their feature references.
