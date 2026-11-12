# Usage

All seven features ship in one plugin. Open the Plugins page, select **DSH Power
Suite**, and use the plugin's own settings section for the shortcut modifier.

## Session artifacts

Open the right Sidebar's Start page and choose **Artifacts**. The panel lists
files this Session created or delivered, plus the images and files you attached
to your own prompts. Image rows show a 40 px rounded thumbnail by default (other
files keep a file icon). The **filter dropdown at the header's right edge,
immediately left of Refresh**, offers **All / Generated / Provided** with their
counts and filters the list client-side (`{shown} of {total}` while filtered; an
empty filter shows **No artifacts in this filter**).

- **Open** previews a generated file through the native document preview;
  a provided attachment opens its inline URL in a new tab.
- **Download** saves the file through the plugin's raw or attachment route.
- **Copy content** copies text files verbatim. For images it writes a real PNG
  clipboard item in a secure context (HTTPS or localhost); on a plain-HTTP page
  it uses the legacy HTML-image clipboard, which rich editors paste as the
  picture while plain-text targets may get nothing, and copies the inline image
  URL only if that fails. Other binaries have no Copy content button.
- **Copy link** copies the authenticated LAN URL.
- Hover a row for the Quick Look preview — generated rows get the workspace
  pipeline (Markdown/code/images/media/PDF/HTML), provided rows get images and
  media through the verified attachment route and text-like files clipped at
  64 KiB (other provided types show the unavailable state). The card opens at a
  570 x 360 default so content is visible immediately; drag the bottom-left grip
  to resize, double-click it to reset the size, and click anywhere outside to
  dismiss.

Missing files are filtered out.

## Workspace default preset

Right-click a Workspace in the Sidebar and choose **Default agent preset**.
The choice applies to new Sessions created in that Workspace; existing Sessions
keep their preset. **Follow the global default** clears the override.

## Dynamic workspaces

In the sidebar's expanded Workspaces browser, the **Running & recent** card
sits above the native header and the Workspace list is split into **Active
Projects** and **Inactive Projects**. A Workspace is Active while one of its
Sessions is running or was active inside the Active-project retention window
(default 7 days). The card's header shows a blue pulsing dot while a listed
Session is running and the white sparkle icon when nothing runs.

- Fold a bucket with its right-edge header chevron; the state is remembered in
  this browser.
- Click a card row to open that Session. **View all {count}** expands past the
  first five rows.
- The leading glyph tells the read state: a running spinner while the Session
  runs, a green dot for a finished but unopened Session, then a white session
  icon once it has been opened. Read marks are now **shared through the Host**,
  so they persist across reloads and appear the same in every browser of the DSH
  profile; a click is only needed on a genuinely new result (the 1 s tolerance
  prevents transient status flags from resurrecting the green dot). The marks
  live in the Host's `read-acks.json`; a browser with the new Host keeps its old
  local marks by opening DSH once, which uploads them in small chunks. During the
  short-lived activity-floor iteration some baselines were inflated; those marks
  cannot be lowered automatically, but the affected rows have since left the
  card, so no visible action is needed.
- The row of the Session the main conversation currently shows gets a faint
  **rainbow ring** plus glow; it follows whichever Session you open (from the
  card, the sidebar, or anywhere else) and disappears when that row leaves the
  card. Merely-running or unopened rows are not ringed. Reduced-motion users see
  a static ring.
- Card times come from the Host's **event-sourced activity ledger**, not the
  catalog's last-prompt time, so a turn that ran for hours keeps its real
  completion time and stays in the recent window instead of vanishing on stop.
  The ledger records allowlisted committed Session events live across all known
  activity-bearing families (turns, steps, messages/attempts, tools including
  PTC, jobs, commands, compaction, subagent state, goal/todo, approvals and
  selection actions, workspace/deliverable/schedule changes, team traffic,
  image/offload, feedback, inbox splice, LLM retry, tool-workflow progress —
  including interrupted and failed turn ends). Metadata events, seed/maintenance
  events, and unknown future/plugin event types do not count, so a brand-new
  event type can be under-reported until the allowlist grows. Sessions that
  existed before the feature was installed only get a one-time baseline
  (projection-cache time, or the header's `createdAt` when there is no cache
  document), so a historical/seed-only end can be under-reported — it is never
  fabricated. The native sidebar keeps its own
  catalog times. The Host routes behind the marks/times need the plugin reloaded
  / Host recomposed after upgrading.
- Rest the pointer on a row for its hover detail: the Workspace name, full
  workspace path, Status with its time, absolute Last active time, and the
  running subagent count. The card sits outside the sidebar and never covers the
  row's buttons.
- Hover or keyboard-focus a row to reveal its trailing actions: **New session**
  creates a blank Session in that row's own directory and opens it, and
  **Continue** (interrupted rows only) resumes the interrupted task without
  opening the row first. Interrupted rows also show an amber warning badge before
  the title.
- A parent Session with delegated subagent Sessions shows a chevron at its far
  right: expanding it lists the children indented under the parent, and clicking
  one opens that child Session.
- A finished Session stays in the card as `done` for the retention window instead
  of disappearing on the stop.
- In the collapsed rail, the card is hidden; widening the sidebar restores it.
- In the native **In one list** grouping there are no Workspace sections, so only
  the card applies.

## Prompt history

In the composer, press the configured modifier + ↑/↓ to recall previously sent
prompts. Plain ↑/↓ keep their original behavior. Change the modifier in the
plugin settings (⌘/Ctrl, ⌥/Alt, Ctrl, Shift, or Off).

Below the native turn rail at the conversation's right edge, a vertical rail
lists the current Session's prompts as small native-style ticks, newest at the
top, with a short horizontal divider separating the two groups. Hover or
keyboard-focus a tick to read the full prompt and its time in a card to the
left; click it (or press Enter) to copy the text into the composer draft — the
copy is silent, with no confirmation chip or animation. The **Search** button
below the ticks stays put and opens a filter card directly below it, or to its
left when there is no room above the composer; a blank click outside the card or Escape
closes it and clears the filter. A long history scrolls inside the rail while
the search button stays at its foot. The rail is absent while the Session has no
sent prompts.

## Draft attachments

Pasted images, dropped files, and files chosen with the picker stay with the
draft when you switch to another Session and come back, because the plugin
remembers the browser files for the page lifetime. The shell itself only
persists the draft text. A page reload still loses the attachments, sending the
draft clears the memory, and removing every attachment explicitly (after they
were restored) stops them from coming back.

## Interrupted sessions

A Session whose last turn was cut off by a Host restart shows an amber mark
left of its title. Hover the row and choose **Continue** to resume it; the
continuation is implicit — it does not appear as a user message in the
transcript, while the composer submit control uses a play icon until the new
turn starts.

## Project view

**Click a Workspace's title/folder area in the sidebar** to open its Project
page. This is the only entry: the page is a **standalone surface in the content
area right of the left sidebar**, not a conversation view tab, so the
conversation header switcher stays **Chat / Trajectory / Statistics**. The
leading chevron still folds the Workspace group, and the row's context menu, New
Session button, Session rows, drags, and modified clicks keep their native
behavior.

The page starts at the left sidebar's right edge and fills the rest of the
window, so it covers the composer/input box, the right sidebar, and the history
rails (including the prompt-history rail, which is hidden while the page is open
and restored on close) while the **left Workspaces sidebar stays visible and
clickable** — click another Workspace there to switch the page in place (folding
the sidebar re-measures the page; there is no shell control to hide it, and if it
is absent the page fills the viewport). The page's **single Refresh control** is
in its top bar. **Esc** or the page's back control closes it and
restores the conversation, current Session, draft, selected view, and sidebar
states exactly. **Open Workspace**, **New Session**, and clicking a Session in
the page's lists close the page first and then navigate; refresh, Copy project
path, Settings, and Runs expansion stay inside the page.

- **Overview** — project header (Active/Inactive, path, created/last active,
  Open Workspace, New Session, refresh, more menu with Copy project path), four
  stat cards (Running sessions, Completed today, Total runs, Avg duration), a
  six-Session preview, the grouping/archiving explainer, and recent activity.
- **Sessions** — All/Running/Completed/Interrupted chips with counts, title
  search, and click-to-open rows (run count, relative update, Subagent marker).
- **Runs** — turns newest first with Running/Completed/Interrupted/Stopped/Failed
  chips and counts, a Session filter, an **Include jobs** toggle, and search.
  Expand a turn to see its nested job rows (kind, label, status, duration,
  detail); a running turn shows live elapsed time. **Show more** pages by 60, and
  a capped snapshot says how many measured runs are shown.
- **Settings** — change the Workspace's default agent preset (Follow global
  default, Standard, PTC, Minimal, Cordis) with a Saved acknowledgement, read the
  grouping windows (edit them on the Plugins page), and copy/open the workspace
  path.

## Settings

The Plugins detail page for the bundle carries the suite's settings in two
groups. **Prompt history** holds the shortcut modifier (⌘ on macOS, Ctrl on
Windows/Linux). **Active & recent** holds the two retention windows: Finished
Session retention (1/2/6/12/24 hours, default 2 hours) and Active project
retention (1/3/7/14/30 days, default 7 days); each row's hint shows the current
value. The package README that the Plugins page normally renders above the
configuration is hidden on this page while the controls are shown. Changes
apply immediately to this page's card and buckets and are shared with every
browser on its next load.

## Feature references

- [Session artifacts](session-artifacts.md)
- [Workspace presets](workspace-default-presets.md)
- [Dynamic workspaces](dynamic-workspaces.md)
- [Prompt history](prompt-history.md)
- [Draft attachments](draft-attachments.md)
- [Interrupted sessions](interrupted-sessions.md)
- [Settings](settings.md)
