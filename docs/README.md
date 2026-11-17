# DSH Power Suite documentation

Reference documentation for the `@zephinel/dsh-power-suite` bundle. The
[README](../README.md) covers install, quick start and the feature tour; these
pages go deeper. They ship with the npm package.

## Concepts

- [Architecture](architecture.md) — Host and browser halves, routes, slots,
  services and settings documents.
- [Usage](usage.md) — what each feature does in the UI, step by step.
- [Feature inventory](overview.md) — the full inventory plus the recipe for
  adding a feature.

## Feature reference

- [Dynamic Workspaces](dynamic-workspaces.md) — activity buckets, the Running &
  recent panel, row menus, hover figures and read/pin state.
- [Sidebar width](sidebar-width.md) — Host-owned width, cross-browser sync and
  the flicker-free rainbow repaint.
- [Session artifacts](session-artifacts.md) — the Files-pane Artifacts list,
  Quick Look, actions and filters.
- [Prompt history](prompt-history.md) — modifier + arrows recall, the history
  rail, preview, search and copy.
- [Draft attachments](draft-attachments.md) — attachment memory across Session
  switches.
- [Interrupted sessions](interrupted-sessions.md) — marks, Continue and the
  play-shaped submit control, with Host-owned cross-device state.
- [UI element annotation](ui-annotation.md) — point-and-click annotation, the
  right rail, page markers and composer reference chips.
- [Workspace presets](workspace-default-presets.md) — the Workspace context-menu
  submenu for default agent presets.
- [Settings](settings.md) — the bundle's Plugins-page settings section.
- [Update notice](update-check.md) — the Host-checked npm notice and release
  highlights.

## Development and verification

- [Development](development.md) — local install/reload loop, checks, the README
  capture and Bento pipeline, and the release flow.
- [Verification](verification.md) — the checks and evidence for this checkout.
- [Limitations](limitations.md) — known bounds and unverified areas.
- [Reference implementations for UI annotation](reference-libraries.md) — the
  local reference corpus behind the annotation work.
- [Browser harness](../test/browser/README.md) — the live-DSH UI acceptance suites,
  their modes and their evidence.
