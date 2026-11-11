# Changelog

All notable changes to this repository are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-11-11

### Fixed

- Interrupted-session badges now repull automatically after a Host restart
  (Connection generation reset), on focus/visibility/online, and on a 20 s poll
  instead of waiting for a Session click.
- Parent Sessions whose delegated subagent was interrupted after the parent's
  last completed turn are now marked interrupted, including nested
  delegations; a live child remains live work.
- After a reconnect, an interrupted Session no longer keeps the native green
  "running" spinner until opened: the plugin decorates rows whose native status
  is stale, replacing the spinner with the amber interruption mark.
- Forced badge refreshes keep the current ready value until the new answer
  arrives; they no longer flash every interrupted mark through `loading`.
- The Host interruption cache uses per-Session event epochs so a slow log read
  cannot overwrite a newer turn event; prompt history requests are generation-
  scoped so a slow Session cannot write into another Session.
- Subagent interruption timing now uses the child's turn start as well as its
  last event, covering children that go silent before a Host restart.
- Continue validates JSON content type, current interruption/running state, and
  per-Session in-flight admission; duplicates are rejected instead of queued.
- Raw artifact media type comes from the real path and every raw response uses
  the native sandbox/default-src-none CSP; the implicit continuation context and
  correlated turn-trigger row are hidden in Chat.
- Quick Look fixes: single-quoted code strings highlight correctly, the preview
  cache is bounded with a TTL, and sidebar/chat observers are scoped to relevant
  mutations.
- CI now covers Node 22 and 24, `npm run check` includes the pack gate, and the
  package/version/CHANGELOG are synced at 0.1.1.
- **Continue** is now implicit: it resumes through a non-human context source
  instead of inserting a visible "Continue the interrupted task." user prompt.
  The continuation row is hidden, prompt history ignores it, and a missing
  Session controller leaves the badge in place.

### Changed

- Standardized the repository around a single root package: source under
  `src/`, feature docs under `docs/`, reusable checks under `scripts/`, a git
  history, a license/notice pair, and CI.
- Hover previews now follow the native shell more closely: Markdown rendering,
  syntax highlighting, image/media/PDF/HTML previews, drag-to-resize, safe
  hover traversal, outside-click dismissal, and animated file switching.

## [0.1.0] - 2026-11-09

### Added

- Session artifacts panel with Open, Download, and Copy-link actions.
- Per-Workspace default agent preset context-menu routing.
- Composer prompt history for the configured modifier (⌘/Ctrl, ⌥/Alt, Ctrl,
  Shift, or Off).
- Interrupted-session detection, sidebar badge, Continue action, and composer
  play control.
- Plugin settings page for the shortcut modifier.
- Shared hover Quick Look for artifacts and the native Workspace files tree.
