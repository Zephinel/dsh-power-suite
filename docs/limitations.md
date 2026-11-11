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

- Generated artifacts are inferred from successful `write`, `edit`,
  `str_replace_editor`, and `present` activity. Files created by other means
  (for example a shell command) are not discovered. User-provided rows cover
  only the image/file blocks of this Session's human prompts.
- Missing files (generated or provided) are hidden rather than shown as
  disabled rows; the list route still reports them with `missing: true`.
- **Provided rows need the attachment service.** A Host composition without the
  durable attachment store omits provided rows entirely instead of showing
  broken ones, and compositions without that service cannot serve their bytes.
- **Only images get a list thumbnail.** Non-image provided files show the file
  icon in the list. Quick Look previews provided images, media, and text-like
  files, but provided PDF/Office/archive files show its unavailable state.
- **Provided text preview is a read-only fetch.** Text-like provided files are
  fetched from the attachment route and clipped at 64 KiB; they do not go through
  the workspace-files preview pipeline, and relative links (including images
  referenced inside provided Markdown) cannot resolve because an attachment has
  no workspace path.
- **Dedupe keeps the newest occurrence.** One row per attachment id; re-pasting
  the same image moves it to the top and updates its prompt ordinal, and the
  older occurrence is not listed again.
- **Thumbnails are lazy.** An image thumbnail is fetched only when its row nears
  the viewport; an image that fails to decode falls back to the file icon.
- Raw workspace downloads and provided attachment responses are capped at
  64 MiB; text previews read the first 16 KiB and report truncation, and the
  attachment route rejects tampered metadata with `400`/`404`.
- **A real image clipboard item needs a secure context.** Only HTTPS or
  localhost exposes the async Clipboard API + `ClipboardItem` that Copy content
  uses for an `image/png` item. On a plain-HTTP LAN page the action instead uses
  the legacy HTML-image clipboard (a hidden `<img>` selected with
  `execCommand('copy')` inside the click gesture): rich editors paste the
  picture, while plain-text-only targets may receive nothing or just the alt
  text. The inline image URL is copied only when that fallback fails. Preview and
  thumbnail loading need no clipboard permission and are unaffected.
- **Text copy reads the whole file first.** Copy content fetches the complete
  artifact text into memory before writing the clipboard (bounded by the raw and
  attachment route limits); binaries with no text/picture representation (PDF,
  Office, archives, and similar) have no Copy content action at all.
- The hover preview supports image, audio/video, PDF, HTML, and text/Markdown
  for generated/workspace rows, and images, media, and text-like provided
  attachments; unknown binaries show an unavailable state. A card with no saved
  resize opens at its explicit 570 x 360 px default so content is visible
  immediately (a user-resized size wins), and it appears only for the Artifacts
  panel and the native workspace-files list.

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
- **Activity uses configurable retention windows, not a running-only marker.**
  A finished Session stays in the card for the Finished-Session retention window
  (1/2/6/12/24 hours, default 2 hours) and a project stays Active for the
  Active-project retention window (1/3/7/14/30 days, default 7 days). Both are
  Host-wide settings edited on the suite's Plugins page; there is no per-browser
  override. Running Sessions are always listed and always Active regardless.
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
- **Client-side derivation, Host-owned windows.** No Host route serves the
  buckets or card; data comes from the browser's Session, status, and Workspace
  stores, so a change from another device can lag one snapshot. The two
  retention windows come from the shared settings route: the page that changes
  them re-derives immediately, while other open browsers read the new value on
  their next settings read (page load).
- **Some row detail is hover-only.** A card row shows only its leading glyph,
  title, and time, and carries no native `title` tooltip; the Workspace name,
  full wrapped workspace path, Status detail, absolute Last active time, and the
  running subagent count appear only in the row's hover card, which does not
  capture the pointer (and is unavailable on touch-only input).
- **The read state is page-local.** A finished, unread Session shows the green
  done dot until it is opened (which acknowledges it and swaps in the white
  session-type icon). The acknowledgement lives in the page, so a reload forgets
  it for every row except the Session currently open in the main view; a new run
  clears the acknowledgement for that Session anyway.
- **The card body hides its scrollbar.** Wheel and trackpad scrolling work, but
  the scrollbar itself is suppressed to match the native sidebar surfaces.

## Prompt history

- **Timestamps need the upgraded Host code.** The route carries `at` once the
  plugin/Host code is reloaded (a normal Host restart also reloads it); against
  an older Host the rail hides mark times and hover timestamps but keeps
  working.
- **Search filters what was served.** The inline search matches only the newest
  500 prompts the Host returned for the Session.
- **Refresh points.** The rail refetches on a Session switch and when a turn
  finishes; a prompt sent from another device while this page is idle appears
  after the next send, turn completion, or page reload.
- **Copy replaces the draft.** Clicking a rail mark replaces the whole draft
  text, exactly like a keyboard recall.
- **Rail placement is measured, not owned by the native shell.** The rail is a
  fixed-position column placed against the Conversation's right edge. The native
  turn rail is recognised by geometry (small buttons near the scroll surface's
  right edge), not by a class name, so an unusual native layout can move the
  rail to its fallback: the vertical middle of the usable scrollport. Placement
  re-measures in one animation frame on window resize (which also covers zoom
  and DPI changes), scroll, composer height, sidebar width, and native-rail
  changes; the rail is hidden while the Session has no sent prompts.
- **Overflow is deliberately quiet.** A long history caps the rail at
  `min(available band, 420 px)`; the ticks scroll inside that frame with a
  hidden scrollbar and 24 px fade masks at the top and bottom, and the magnifier
  stays pinned at the rail's foot. The hover card line-clamps long prompts to
  six lines instead of scrolling; the full prompt stays in the mark's accessible
  name.
- **Search card placement.** With room above the composer, the card opens
  directly below the pinned 20 x 22 magnifier with its right edge on the rail
  column. When the button is close to the composer or the rail is long, the card
  flips to the magnifier's left, 8 px from the button, and is clamped above the
  composer. Opening the search never moves the button. There is no close (x)
  button: a blank pointer press outside the card or Escape closes it and clears
  the filter (Escape returns focus to the magnifier).
- **Current Session only.** The rail does not cross Sessions or Workspaces;
  there is no global prompt history.

## Draft attachments

- **Page lifetime only.** The cache holds browser `File` objects in memory; a
  page reload, a new tab, or another device cannot restore them.
- **Only captured intake paths.** Files are remembered from the composer's
  paste, drop, and file-picker events while that Session is mounted; files
  attached through another surface, or while the composer is unmounted, are not
  remembered.
- **Removal semantics.** Sending the draft, or removing every attachment after
  a restore, clears that Session's cache. Removing only some attachments does
  not update the cache: a later round trip re-pastes the remembered set,
  including the removed file.
- **Fixed caps.** At most 20 files per Session and 8 Sessions at once; older
  files and the least recently active Session are evicted. There is no setting.
- **Shell DOM dependency.** Restore addresses the Session occurrence, composer
  region, and Lexical editor by data attributes and dispatches a synthetic
  paste; if the shell changes that intake path the restore silently stops while
  the draft text is unaffected.

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

## Settings page

- **README hidden while the section is mounted.** The bundle page's
  auto-rendered package README document (`[data-detail-document]`) is hidden only
  while the suite's settings section is on screen and restored on unmount; the
  behaviour does not change other plugin pages or the repository README.
- **Fixed option sets.** The Host accepts only the listed retention windows
  (1/2/6/12/24 hours and 1/3/7/14/30 days); an unknown value is rejected and the
  stored value is kept.
- **Shared, one document.** Settings are Host-owned (schema version 2); there is
  no per-browser or per-device override. Version-1 files migrate to the default
  windows on read.

## Localization and theming

- UI copy ships in English and Chinese; other locales fall back to English. The
  artifacts extension's new Provided/filter copy was reviewed in both languages
  but the live checks ran against the English UI only, so the Chinese strings
  are not live-exercised.
- The UI uses DSH theme tokens. Reduced-motion preferences disable preview
  animations.
- Hover preview geometry is remembered per browser in `localStorage`; it does
  not sync across devices.
