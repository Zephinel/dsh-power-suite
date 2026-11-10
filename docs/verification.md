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

- `npm test`: **33 tests, 33 passed, 0 failed**.
- `npm run check`: passed.
- `npm run pack:check`: **38 files** (0.1.0 tarball), including `src/`,
  `locale/`, `docs/`, `cordis.patch.yml`, `icon.png`, and the standard
  repository files.
- The root-package reinstall was verified after a Host restart: the Loader row
  `include:power-suite` reports `fiberPhase: active` from the new repository
  root path.

## Manual UI checks

These were exercised in the Web GUI during development:

- Artifacts panel: list, Open/Download/Copy actions, missing files hidden.
- Hover Quick Look on Artifacts rows and native Workspace files: Markdown,
  highlighted code, images, PDF/HTML, resize persistence, outside-click
  dismissal, animated switching.
- Settings page: shortcut modifier selection and persistence.
- Workspace preset menu and routing.
- Interrupted-session badge, Continue action, and composer play control.

The manual checks are evidence for the behavior described in the feature docs;
they are not a substitute for the automated gate above.
