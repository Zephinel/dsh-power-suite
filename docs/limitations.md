# Limitations

## Packaging

- The package is a local `link:` bundle in a DSH profile; it is not published to
  npm and has no build pipeline. Host and browser entries are the checked-in
  ES modules under `src/`.
- Only the Web platform is supported (`dsh.client.platform: "web"`). The TUI
  and other clients do not load the browser half.
- The browser half injects DSH client packages by name; a Host composition that
  does not provide them will keep the plugin inactive instead of crashing.

## Session artifacts

- Artifacts are inferred from successful `write`, `edit`,
  `str_replace_editor`, and `present` activity. Files created by other means
  (for example a shell command) are not discovered.
- Missing files are hidden rather than shown as disabled rows.
- Raw downloads are capped at 64 MiB; text previews read the first 16 KiB and
  report truncation.
- The hover preview supports image, audio/video, PDF, HTML, and text/Markdown;
  unknown binaries show an unavailable state.

## Interrupted sessions

- Detection uses the session log and Agent status. A log that ends inside an
  open turn without an explicit `turn/end` is treated as interrupted only when
  the Agent is not running; other clients may report a different state.
- The sidebar cache updates from live session events and a periodic refresh;
  a very recent change from another device can lag by one poll interval.

## Dynamic workspaces

- **Expanded sidebar only.** In rail mode the card is hidden (kept mounted with
  `display: none`) and there is no tree to bucket; widening the sidebar restores
  both.
- **The native grouping mode decides how much applies.** The **WorkSpace** and
  **Workspace Tree** modes give the Active/Inactive buckets real group sections;
  **In one list** has no Workspace sections, so only the summary card applies.
- **Activity uses a retention window, not a running-only marker.** A Workspace
  stays Active for 12 hours (`DW_ACTIVE_WINDOW_MS`) after its last Session
  activity; the constant has no setting UI.
- **Durations are live-observation only.** The card shows an exact run duration
  only when the run started while this page was open; otherwise it shows the
  relative last-activity time. A hidden tab throttles the once-per-second refresh.
- **Subagents nest one level deep.** Running or recently active direct subagent
  children are listed under their parent row; the native sidebar hides subagent
  Sessions outright, so the card is the only surface for them, and a nested
  child is only reachable while its parent row is in the card. A finished
  subagent does not finish the parent's task by itself. Blank and archived
  Sessions are skipped too.
- **Parent disclosure state is per page.** Each parent's show/hide of its
  subagent children is not persisted; only the two bucket folds are.
- **It depends on the shipped sidebar's internals** — the
  `[data-slot="sidebar.workspaces"]` wrapper, the `role="tree"` list, and
  `data-row-key="workspace:<id>"` rows. A DSH change to those anchors makes this
  feature render nothing; the native browser is unaffected.
- **Per-browser fold state.** `power-suite.dynamic-workspaces.folds` lives in
  `localStorage`; the card's open/closed state is not persisted.
- **Client-side only.** No Host route serves the buckets or card; data comes from
  the browser's Session, status, and Workspace stores, so a change from another
  device can lag one snapshot.

## Prompt history

- **Timestamps need the upgraded Host code.** The route carries `at` once the
  plugin/Host code is reloaded (a normal Host restart also reloads it); against
  an older Host the preview hides its row times and hover timestamp but keeps
  working.
- **Search filters what was served.** The inline search matches only the newest
  500 prompts the Host returned for the Session.
- **Refresh points.** The preview refetches on a Session switch and when a turn
  finishes; a prompt sent from another device while this page is idle appears
  after the next send, turn completion, or page reload.
- **Copy replaces the draft.** Clicking a preview row replaces the whole draft
  text, exactly like a keyboard recall.

## Raw artifacts and implicit continuation

- The raw/preview routes accept any owner-authorized absolute path (the same
  authority as the native `/api/file`); they are not scoped to a Session's
  artifact list because the native Workspace files tree uses them too. The
  response media type comes from the real path, and every raw response is
  sandboxed with `default-src 'none'`.
- Continue is a durable `user/message` with a non-human source; Chat hides the
  matching native context/trigger row using the message time recorded for this
  browser. Trajectory/raw exports still contain it. A future Chat DOM that
  exposes the source kind on the trigger row would replace this shim.

## Localization and theming

- UI copy ships in English and Chinese; other locales fall back to English.
- The UI uses DSH theme tokens. Reduced-motion preferences disable preview
  animations.
- Hover preview geometry is remembered per browser in `localStorage`; it does
  not sync across devices.
