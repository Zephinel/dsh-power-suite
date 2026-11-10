# Changelog

All notable changes to this repository are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Interrupted-session badges now repull automatically after a Host restart
  (Connection generation reset), on focus/visibility/online, and on a 20 s poll
  instead of waiting for a Session click.
- Parent Sessions whose delegated subagent was interrupted after the parent's
  last completed turn are now marked interrupted, including nested
  delegations; a live child remains live work.

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
